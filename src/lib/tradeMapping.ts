import { Account, Strategy, Trade, TradeExecution } from '@/types/trade';

/**
 * Normalizes a trade document into the shape the rest of the app expects.
 *
 * Every page used to inline its own version of this, and they disagreed about
 * which fields to coerce: the dashboard converted `planned_r_override`, MAE and
 * MFE while the analytics, calendar and journal did not, so the same trade
 * produced a different R depending on which screen you opened it from.
 *
 * The coercions use `!= null` rather than truthiness on purpose. Zero is a
 * legitimate value for the overrides and for MAE/MFE — the broker sync writes
 * `0` R for a scratch trade — and the old `? :` checks silently turned those
 * into "no value".
 */

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same, but for fields the app treats as a plain number with a zero default. */
function numOr0(value: unknown): number {
  return num(value) ?? 0;
}

export interface TradeRelations {
  strategiesById?: Record<string, Strategy>;
  accountsById?: Record<string, Account>;
}

export function toTrade(raw: Trade, relations: TradeRelations = {}): Trade {
  const { strategiesById, accountsById } = relations;
  return {
    ...raw,
    entry_price: numOr0(raw.entry_price),
    exit_price: num(raw.exit_price),
    quantity: numOr0(raw.quantity),
    fees: numOr0(raw.fees),
    commissions: numOr0(raw.commissions),
    stop_loss: num(raw.stop_loss),
    planned_risk_override: num(raw.planned_risk_override),
    planned_r_override: num(raw.planned_r_override),
    broker_r_multiple: num(raw.broker_r_multiple),
    net_pnl: num(raw.net_pnl),
    open_quantity: num(raw.open_quantity),
    mae: num(raw.mae),
    mfe: num(raw.mfe),
    executions: normalizeExecutions(raw.executions),
    strategy: raw.strategy_id ? strategiesById?.[raw.strategy_id] : undefined,
    account: raw.account_id ? accountsById?.[raw.account_id] : undefined,
  };
}

export function toTrades(raw: Trade[], relations: TradeRelations = {}): Trade[] {
  return raw.map((t) => toTrade(t, relations));
}

function normalizeExecutions(executions: Trade['executions']): TradeExecution[] | null {
  if (!executions || executions.length === 0) return null;
  return executions.map((e) => ({
    ...e,
    quantity: numOr0(e.quantity),
    price: numOr0(e.price),
  }));
}

/** Look-up map keyed by id, for attaching relations. */
export function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}
