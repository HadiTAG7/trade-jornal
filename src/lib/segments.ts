import { AnalyticsData, Strategy, Trade } from '@/types/trade';
import { calculateAnalytics, calculateDetailedStats, DetailedStats } from '@/lib/calculations';
import { closedTrades } from '@/lib/tradeStatus';
import { buildMetrics, dailyEquitySeries, EquityPoint, MetricsMap } from '@/lib/analyticsSeries';

/**
 * Splits trades into groups and runs the existing metrics over each one.
 *
 * `calculateAnalytics` and `calculateDetailedStats` already compute expectancy,
 * profit factor, max drawdown, SQN, Kelly, streaks and hold times — roughly
 * thirty figures — but had only ever been called on the whole book. Nothing here
 * is new arithmetic; it is the same functions applied per segment, which is what
 * makes "is the bot actually better than my own trading?" answerable.
 */

export interface Segment {
  key: string;
  label: string;
  color: string;
  trades: Trade[];
  closed: Trade[];
  analytics: AnalyticsData;
  detailed: DetailedStats;
  equity: EquityPoint[];
  metrics: MetricsMap;
  /**
   * How many of the segment's closed trades have an R multiple. R depends on a
   * stop or an override, and most historical trades have neither — a comparison
   * of average R across segments is meaningless without saying how much of each
   * segment it actually covers.
   */
  rCoverage: number;
}

export interface SegmentDefinition {
  key: string;
  label: string;
  color: string;
  match: (trade: Trade) => boolean;
}

const PALETTE = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#a855f7'];

/**
 * Strategy names that mean "this was traded by a machine". Anchored to word
 * boundaries on purpose: a bare /ai/ would classify a strategy called "Fair
 * value gap" as the bot.
 */
const BOT_NAME = /(^|[\s_-])(bot|bots|algo|algorithmic|ai|automated)([\s_-]|$)/i;

/** Trades the broker sync tagged as bot-driven carry the "bot" strategy. */
export function isBotTrade(trade: Trade, botStrategyIds: Set<string>): boolean {
  if (trade.strategy_id && botStrategyIds.has(trade.strategy_id)) return true;
  const source = String(trade.broker_source || '').toLowerCase();
  return source.includes('bot') || source.includes('ai_') || source.includes('agent') || source.includes('algo');
}

/**
 * The comparison the owner asked for: what the bot did versus what they did by
 * hand. Trades with no strategy are kept as their own group rather than folded
 * into either side, because guessing would put the answer in doubt.
 */
export function botVsManualDefinitions(strategies: Strategy[]): SegmentDefinition[] {
  const botIds = new Set(strategies.filter((s) => BOT_NAME.test(s.name)).map((s) => s.id));
  const manualIds = new Set(strategies.filter((s) => !BOT_NAME.test(s.name)).map((s) => s.id));

  return [
    {
      key: 'bot',
      label: 'Bot',
      color: strategies.find((s) => botIds.has(s.id))?.color || PALETTE[0],
      match: (t) => isBotTrade(t, botIds),
    },
    {
      key: 'manual',
      label: 'Manual',
      color: strategies.find((s) => manualIds.has(s.id))?.color || PALETTE[1],
      match: (t) => !isBotTrade(t, botIds) && !!t.strategy_id && manualIds.has(t.strategy_id),
    },
    {
      key: 'untagged',
      label: 'No strategy',
      color: '#64748b',
      match: (t) => !t.strategy_id && !isBotTrade(t, botIds),
    },
  ];
}

/** One segment per strategy, for a finer breakdown than bot vs manual. */
export function strategyDefinitions(strategies: Strategy[], trades: Trade[]): SegmentDefinition[] {
  const used = new Set(trades.map((t) => t.strategy_id).filter(Boolean) as string[]);
  const defs: SegmentDefinition[] = strategies
    .filter((s) => used.has(s.id))
    .map((s, i) => ({
      key: s.id,
      label: s.name,
      color: s.color || PALETTE[i % PALETTE.length],
      match: (t: Trade) => t.strategy_id === s.id,
    }));

  if (trades.some((t) => !t.strategy_id)) {
    defs.push({ key: 'untagged', label: 'No strategy', color: '#64748b', match: (t) => !t.strategy_id });
  }
  return defs;
}

export function buildSegments(trades: Trade[], definitions: SegmentDefinition[]): Segment[] {
  return definitions
    .map((def) => {
      const subset = trades.filter(def.match);
      const closed = closedTrades(subset);
      const metrics = buildMetrics(closed);
      return {
        key: def.key,
        label: def.label,
        color: def.color,
        trades: subset,
        closed,
        analytics: calculateAnalytics(subset),
        detailed: calculateDetailedStats(subset),
        equity: dailyEquitySeries(subset, metrics),
        metrics,
        rCoverage: closed.filter((t) => metrics.get(t.id)?.realizedR !== null).length,
      };
    })
    // An empty segment is noise in a comparison table.
    .filter((s) => s.closed.length > 0);
}

export interface MetricRow {
  label: string;
  /** Renders the value for one segment. */
  value: (s: Segment) => string;
  /** Higher is better, lower is better, or neither (for context rows). */
  direction: 'higher' | 'lower' | 'none';
  /** Numeric basis for deciding which segment wins; null excludes it. */
  compare: (s: Segment) => number | null;
  hint?: string;
}
