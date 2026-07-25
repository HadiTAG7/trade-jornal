import { fromZonedTime } from 'date-fns-tz';
import { Trade } from '@/types/trade';
import { summarizeExecutions } from '@/lib/executions';

/**
 * The single definition of "closed" for the whole app.
 *
 * Trades reach us from three sources with different shapes:
 *  - manual entry: entry/exit prices and dates
 *  - broker sync: realized `net_pnl`, sometimes without an exit price
 *  - partial fills: `executions`, closed in stages
 *
 * Each screen used to apply its own filter (`exit_price !== null` in the
 * analytics, `exit_datetime !== null` in the calendar/widget), so the same data
 * produced different totals depending on where you looked. Everything now goes
 * through the helpers below.
 */

function fills(trade: Trade) {
  return trade.executions && trade.executions.length > 0 ? trade.executions : null;
}

/** Has this trade realized any P&L at all? */
export function hasRealizedPnL(trade: Trade): boolean {
  const f = fills(trade);
  if (f) return summarizeExecutions(f, trade.side).closedQty > 0;
  return trade.exit_price !== null && trade.exit_price !== undefined
    ? true
    : trade.net_pnl !== null && trade.net_pnl !== undefined;
}

/**
 * When the realized part was closed. Falls back through the fills' last close
 * and finally the entry time, so a realized trade never yields an unusable
 * date (the old code produced `new Date(null)` → NaN, which silently corrupted
 * the equity curve sort, max drawdown and every streak).
 */
export function closedAt(trade: Trade): string | null {
  if (trade.exit_datetime) return trade.exit_datetime;
  const f = fills(trade);
  const last = f ? summarizeExecutions(f, trade.side).lastCloseAt : null;
  if (last) return last;
  return hasRealizedPnL(trade) ? trade.entry_datetime : null;
}

export function isClosed(trade: Trade): boolean {
  return hasRealizedPnL(trade) && closedAt(trade) !== null;
}

export function closedTrades(trades: Trade[]): Trade[] {
  return trades.filter(isClosed);
}

/**
 * Epoch ms of the close. Broker-synced timestamps are naive US/Eastern
 * wall-clock ("2026-07-10T09:48:45"); manual and imported ones carry a zone.
 * Mixing them without care mis-sequences the equity curve by hours.
 */
export function closedAtMs(trade: Trade): number | null {
  const iso = closedAt(trade);
  if (!iso) return null;
  return isoToMs(iso);
}

export function isoToMs(iso: string): number | null {
  if (!iso) return null;
  const zoned = /[zZ]$|[+-]\d\d:\d\d$/.test(iso);
  const ms = zoned
    ? Date.parse(iso)
    : fromZonedTime(iso.length === 16 ? `${iso}:00` : iso, 'America/New_York').getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function compareByClose(a: Trade, b: Trade): number {
  return (closedAtMs(a) ?? 0) - (closedAtMs(b) ?? 0);
}

/** Closed trades in the order they were actually realized. */
export function sortedClosedTrades(trades: Trade[]): Trade[] {
  return closedTrades(trades).sort(compareByClose);
}

/**
 * Day bucket for the calendar and widget. Deliberately a string slice of the
 * stored timestamp so day grouping stays byte-identical to what it has always
 * been (converting to a Date here would re-bucket historical days).
 */
export function closedDayKey(trade: Trade): string | null {
  const iso = closedAt(trade);
  return iso ? iso.slice(0, 10) : null;
}

/**
 * Hold time in minutes, or null when it isn't meaningful: the broker sync
 * substitutes the close time when it has no open time (`entry_time_estimated`),
 * which otherwise floods the averages and the "< 1:00" bucket with zeros.
 */
export function holdMinutes(trade: Trade): number | null {
  if (trade.entry_time_estimated) return null;
  const end = closedAtMs(trade);
  const start = isoToMs(trade.entry_datetime);
  if (end === null || start === null) return null;
  const minutes = (end - start) / 60000;
  return minutes > 0 ? minutes : null;
}

/** Quantity still open (only meaningful for trades with fills). */
export function openQuantity(trade: Trade): number {
  const f = fills(trade);
  if (!f) return closedAt(trade) ? 0 : Number(trade.quantity) || 0;
  return summarizeExecutions(f, trade.side).remainingQty;
}

export function isFullyClosed(trade: Trade): boolean {
  return isClosed(trade) && openQuantity(trade) <= 0;
}
