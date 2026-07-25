import { Trade, TradeMetrics } from '@/types/trade';
import { calculateTradeMetrics } from '@/lib/calculations';
import { closedDayKey, sortedClosedTrades } from '@/lib/tradeStatus';

/**
 * The chart series behind the analytics page, extracted so the same code draws
 * the whole book and each individual segment. They used to live inside
 * `Analytics.tsx` as local `useMemo`s, which is why nothing could be plotted per
 * strategy without writing it a second time.
 *
 * Every series orders by close through `sortedClosedTrades`, so a cumulative
 * curve reflects the order P&L was actually realized.
 */

/** Metrics computed once and reused, keyed by trade id. */
export type MetricsMap = Map<string, TradeMetrics>;

export function buildMetrics(trades: Trade[]): MetricsMap {
  return new Map(trades.map((t) => [t.id, calculateTradeMetrics(t)]));
}

function metricsFor(trade: Trade, metrics?: MetricsMap): TradeMetrics {
  return metrics?.get(trade.id) ?? calculateTradeMetrics(trade);
}

export interface EquityPoint {
  /** yyyy-MM-dd, so separate segments can be aligned on a shared axis. */
  date: string;
  equity: number;
  dailyPnL: number;
  trades: number;
  drawdown: number;
  drawdownPct: number;
}

/**
 * Cumulative net P&L per trading day.
 *
 * Grouped by day rather than by trade index on purpose: comparing two segments
 * point-by-point only means something if both are on the same axis, and the bot
 * and the manual account never place the same number of trades.
 *
 * Drawdown, though, is tracked trade by trade and then reported as the worst
 * point each day reached. Computing it from day-end equity alone smooths away
 * the troughs inside a day — on the real book that understated max drawdown by
 * $5,268 — and the chart would then contradict the max-drawdown figure beside it.
 */
export function dailyEquitySeries(trades: Trade[], metrics?: MetricsMap): EquityPoint[] {
  const days: EquityPoint[] = [];
  let equity = 0;
  let peak = 0;
  let current: EquityPoint | null = null;

  for (const trade of sortedClosedTrades(trades)) {
    const day = closedDayKey(trade);
    if (!day) continue;

    if (!current || current.date !== day) {
      current = { date: day, equity, dailyPnL: 0, trades: 0, drawdown: 0, drawdownPct: 0 };
      days.push(current);
    }

    equity += metricsFor(trade, metrics).netPnL;
    peak = Math.max(peak, equity);
    const drawdown = peak - equity;

    current.equity = equity;
    current.dailyPnL += metricsFor(trade, metrics).netPnL;
    current.trades += 1;
    if (drawdown > current.drawdown) {
      current.drawdown = drawdown;
      current.drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    }
  }

  return days;
}

/**
 * Lines up several segments' equity curves on one date axis, carrying each
 * segment's last known value forward across days it didn't trade — otherwise a
 * quiet week would read as a drop to zero.
 */
export function mergeEquitySeries(
  series: Array<{ key: string; points: EquityPoint[] }>,
): Array<Record<string, number | string>> {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const lookup = series.map((s) => ({ key: s.key, byDate: new Map(s.points.map((p) => [p.date, p.equity])) }));
  const carried = new Map<string, number>();

  return dates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const { key, byDate } of lookup) {
      const value = byDate.get(date);
      if (value !== undefined) carried.set(key, value);
      // A segment that hasn't traded yet has no line, rather than a line at zero.
      const running = carried.get(key);
      if (running !== undefined) row[key] = running;
    }
    return row;
  });
}

export function rDistribution(trades: Trade[], metrics?: MetricsMap): Array<{ r: string; count: number }> {
  const buckets = new Map<number, number>();
  for (const trade of trades) {
    const r = metricsFor(trade, metrics).realizedR;
    if (r === null) continue;
    const bucket = Math.floor(r);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, count]) => ({ r: bucket >= 0 ? `+${bucket}R` : `${bucket}R`, count }));
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dayOfWeekSeries(
  trades: Trade[],
  metrics?: MetricsMap,
): Array<{ name: string; pnl: number; trades: number }> {
  const stats = DAY_NAMES.map((name) => ({ name, pnl: 0, trades: 0 }));
  for (const trade of trades) {
    const day = closedDayKey(trade);
    if (!day) continue;
    // Parsed as a plain calendar date: the day bucket must not shift with the
    // viewer's timezone.
    const index = new Date(`${day}T12:00:00Z`).getUTCDay();
    stats[index].pnl += metricsFor(trade, metrics).netPnL;
    stats[index].trades += 1;
  }
  return stats;
}

export function hourOfDaySeries(
  trades: Trade[],
  metrics?: MetricsMap,
): Array<{ hour: string; pnl: number; trades: number }> {
  const byHour = new Map<number, { pnl: number; trades: number }>();
  for (const trade of trades) {
    // Entry hour as the broker recorded it, read off the stored string so a
    // naive Eastern stamp isn't shifted into the viewer's zone.
    const match = /T(\d\d):/.exec(trade.entry_datetime || '');
    if (!match) continue;
    const hour = Number(match[1]);
    const existing = byHour.get(hour) || { pnl: 0, trades: 0 };
    existing.pnl += metricsFor(trade, metrics).netPnL;
    existing.trades += 1;
    byHour.set(hour, existing);
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, data]) => ({ hour: `${String(hour).padStart(2, '0')}:00`, ...data }));
}

export function sideSeries(
  trades: Trade[],
  metrics?: MetricsMap,
): Array<{ name: string; value: number; pnl: number }> {
  return (['LONG', 'SHORT'] as const).map((side) => {
    const subset = trades.filter((t) => t.side === side);
    return {
      name: side === 'LONG' ? 'Long' : 'Short',
      value: subset.length,
      pnl: subset.reduce((sum, t) => sum + metricsFor(t, metrics).netPnL, 0),
    };
  });
}
