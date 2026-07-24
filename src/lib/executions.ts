import { TradeExecution, TradeSide } from '@/types/trade';

export interface ExecutionSummary {
  /** Total quantity opened across all opening fills. */
  openedQty: number;
  /** Weighted-average price of the opening fills. */
  avgEntry: number;
  /** Total quantity closed across all closing fills. */
  closedQty: number;
  /** Weighted-average price of the closing fills (null if nothing closed). */
  avgExit: number | null;
  /** Realized gross P&L of the closed portion (fees excluded). */
  realizedPnL: number;
  /** Quantity still open. */
  remainingQty: number;
  fullyClosed: boolean;
  firstOpenAt: string | null;
  lastCloseAt: string | null;
}

function openAction(side: TradeSide): 'BUY' | 'SELL' {
  return side === 'SHORT' ? 'SELL' : 'BUY';
}

/**
 * Walks the fills in chronological order using average-cost accounting, so
 * scaling in and out in any order produces the right realized P&L:
 *   - an opening fill updates the running average cost
 *   - a closing fill realizes (price - avgCost) * qty  (reversed for SHORT)
 */
export function summarizeExecutions(
  executions: TradeExecution[],
  side: TradeSide,
): ExecutionSummary {
  const opens = openAction(side);
  const sorted = [...executions]
    .filter((e) => Number(e.quantity) > 0 && Number.isFinite(Number(e.price)))
    .sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));

  let runningQty = 0;
  let avgCost = 0;
  let openedQty = 0;
  let openNotional = 0;
  let closedQty = 0;
  let closeNotional = 0;
  let realizedPnL = 0;
  let firstOpenAt: string | null = null;
  let lastCloseAt: string | null = null;

  for (const e of sorted) {
    const qty = Number(e.quantity);
    const price = Number(e.price);

    if (e.action === opens) {
      avgCost = runningQty + qty > 0 ? (avgCost * runningQty + price * qty) / (runningQty + qty) : price;
      runningQty += qty;
      openedQty += qty;
      openNotional += price * qty;
      if (!firstOpenAt) firstOpenAt = e.datetime || null;
    } else {
      // Can't close more than is open.
      const closing = Math.min(qty, runningQty);
      if (closing > 0) {
        realizedPnL += side === 'SHORT' ? (avgCost - price) * closing : (price - avgCost) * closing;
        runningQty -= closing;
        closedQty += closing;
        closeNotional += price * closing;
        lastCloseAt = e.datetime || lastCloseAt;
      }
    }
  }

  return {
    openedQty,
    avgEntry: openedQty > 0 ? openNotional / openedQty : 0,
    closedQty,
    avgExit: closedQty > 0 ? closeNotional / closedQty : null,
    realizedPnL,
    remainingQty: Math.max(0, runningQty),
    fullyClosed: openedQty > 0 && runningQty <= 0.000001,
    firstOpenAt,
    lastCloseAt,
  };
}

/**
 * Aggregate fields derived from fills, shaped to be stored on the trade so the
 * rest of the app (table, calendar, analytics, widget) needs no changes.
 */
export function aggregateFromExecutions(executions: TradeExecution[], side: TradeSide) {
  const s = summarizeExecutions(executions, side);
  return {
    quantity: s.openedQty,
    entry_price: s.avgEntry,
    exit_price: s.avgExit,
    entry_datetime: s.firstOpenAt,
    exit_datetime: s.fullyClosed ? s.lastCloseAt : null,
    net_pnl: s.closedQty > 0 ? s.realizedPnL : null,
    summary: s,
  };
}
