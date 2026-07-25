import { Trade } from '@/types/trade';
import { closedAtMs, isoToMs } from '@/lib/tradeStatus';

/**
 * Duplicate detection for CSV imports.
 *
 * The importer only ever compared `stable_hash`, which is the document id it
 * writes itself. Broker-synced trades are keyed `schwab_<order_id>` and carry no
 * `stable_hash` at all, so re-importing a broker statement over trades the sync
 * had already pulled matched nothing and silently doubled them — which is
 * exactly what happened, and why the trade list showed the same executions
 * twice from two sources.
 *
 * So matching happens on the trade itself: same symbol, same direction, same
 * size, opening and closing at the same moment for the same prices. Times go
 * through `closedAtMs`/`isoToMs` so a naive Eastern timestamp written by the
 * sync compares correctly against a zoned one from a CSV.
 */

/**
 * How close two records must be to be the same execution.
 *
 * These are deliberately tight. Checking only symbol + side + size + close time
 * within five minutes flagged 21 pairs in the real journal, and every one was a
 * genuine re-entry — a day trader taking the same symbol at the same size a few
 * minutes later, which is ordinary scalping. Wrongly skipping a real trade is
 * worse than letting a duplicate through, because the duplicate is visible in
 * the list and can be deleted while the skipped trade just never appears. So
 * both ends of the trade have to line up, in time and in price.
 */
const TIME_WINDOW_MS = 2 * 60 * 1000;
const PRICE_TOLERANCE = 0.005;

export interface DuplicateCandidate {
  symbol: string;
  side: string;
  quantity: number;
  entry_datetime: string;
  exit_datetime: string | null;
  entry_price?: number | null;
  exit_price: number | null;
  stable_hash?: string | null;
}

export interface DuplicateMatch {
  /** Shown in the preview so a skipped row is explainable. */
  reason: string;
  existingId: string;
  kind: 'hash' | 'near';
}

interface IndexEntry {
  id: string;
  openMs: number | null;
  closeMs: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  source: string | null;
}

export interface DuplicateIndex {
  hashes: Map<string, string>;
  buckets: Map<string, IndexEntry[]>;
}

function bucketKey(symbol: string, side: string, quantity: number): string {
  return `${String(symbol || '').toUpperCase()}|${side}|${Math.round(Number(quantity) || 0)}`;
}

export function buildDuplicateIndex(existing: Trade[]): DuplicateIndex {
  const hashes = new Map<string, string>();
  const buckets = new Map<string, IndexEntry[]>();

  for (const trade of existing) {
    if (trade.stable_hash) hashes.set(trade.stable_hash, trade.id);
    const key = bucketKey(trade.symbol, trade.side, trade.quantity);
    const entry: IndexEntry = {
      id: trade.id,
      openMs: isoToMs(trade.entry_datetime),
      closeMs: closedAtMs(trade) ?? isoToMs(trade.entry_datetime),
      entryPrice: trade.entry_price ?? null,
      exitPrice: trade.exit_price ?? null,
      source: trade.source ?? null,
    };
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }

  return { hashes, buckets };
}

function describe(source: string | null): string {
  if (!source) return 'a trade already in your journal';
  if (source === 'Schwab') return 'a trade already pulled by the broker sync';
  return `a trade already imported from ${source}`;
}

export function findDuplicate(
  candidate: DuplicateCandidate,
  index: DuplicateIndex,
): DuplicateMatch | null {
  if (candidate.stable_hash) {
    const id = index.hashes.get(candidate.stable_hash);
    if (id) return { reason: 'Already imported from this file format', existingId: id, kind: 'hash' };
  }

  const bucket = index.buckets.get(bucketKey(candidate.symbol, candidate.side, candidate.quantity));
  if (!bucket) return null;

  const openMs = isoToMs(candidate.entry_datetime);
  const closeMs = candidate.exit_datetime ? isoToMs(candidate.exit_datetime) : openMs;
  if (openMs === null || closeMs === null) return null;

  for (const entry of bucket) {
    if (entry.openMs === null || entry.closeMs === null) continue;
    // Both ends of the trade, not just the close: a re-entry into the same
    // symbol at the same size shares neither.
    if (Math.abs(entry.openMs - openMs) > TIME_WINDOW_MS) continue;
    if (Math.abs(entry.closeMs - closeMs) > TIME_WINDOW_MS) continue;
    if (apart(entry.entryPrice, candidate.entry_price)) continue;
    if (apart(entry.exitPrice, candidate.exit_price)) continue;
    return {
      reason: `Same ${candidate.symbol} ${candidate.side} × ${Math.round(candidate.quantity)} at the same time and price as ${describe(entry.source)}`,
      existingId: entry.id,
      kind: 'near',
    };
  }

  return null;
}

/**
 * True when two prices are known and disagree by more than the tolerance. An
 * unknown price on either side is not evidence of a difference — the broker sync
 * stores realized P&L without an exit price for some trades.
 */
function apart(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined || a === 0) return false;
  return Math.abs(b - a) / Math.abs(a) > PRICE_TOLERANCE;
}

/**
 * Marks duplicates across the incoming rows *and* against what is already
 * stored. Two rows in the same file that describe the same trade are caught too
 * — the first wins and the rest are flagged, which the old hash-only check
 * missed whenever the rows differed by a cent.
 */
export function markDuplicates<T extends DuplicateCandidate>(
  rows: T[],
  existing: Trade[],
): Array<T & { isDuplicate: boolean; duplicateReason?: string }> {
  const index = buildDuplicateIndex(existing);
  const out: Array<T & { isDuplicate: boolean; duplicateReason?: string }> = [];

  for (const row of rows) {
    const match = findDuplicate(row, index);
    if (match) {
      out.push({ ...row, isDuplicate: true, duplicateReason: match.reason });
      continue;
    }
    out.push({ ...row, isDuplicate: false });
    // Fold accepted rows into the index so a repeat later in the same file is
    // recognised.
    const key = bucketKey(row.symbol, row.side, row.quantity);
    const entry: IndexEntry = {
      id: row.stable_hash || `pending-${out.length}`,
      openMs: isoToMs(row.entry_datetime),
      closeMs: row.exit_datetime ? isoToMs(row.exit_datetime) : isoToMs(row.entry_datetime),
      entryPrice: row.entry_price ?? null,
      exitPrice: row.exit_price ?? null,
      source: 'this file',
    };
    const list = index.buckets.get(key);
    if (list) list.push(entry);
    else index.buckets.set(key, [entry]);
    if (row.stable_hash) index.hashes.set(row.stable_hash, entry.id);
  }

  return out;
}
