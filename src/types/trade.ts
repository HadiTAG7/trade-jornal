export type TradeSide = 'LONG' | 'SHORT';
export type AttachmentKind = 'BEFORE' | 'AFTER' | 'OTHER';
export type ChecklistValue = 'YES' | 'NO' | 'NA';
export type ImportSourceType = 'ThinkOrSwim' | 'TraderVue' | 'Custom';

// A single fill within a trade. Lets one trade hold several entries/exits
// (scaling in and out) instead of a single entry/exit price.
export interface TradeExecution {
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  datetime: string;
}

export interface Trade {
  id: string;
  user_id: string;
  account_id: string | null;
  strategy_id: string | null;
  source: string | null;
  source_trade_id: string | null;
  stable_hash: string | null;
  symbol: string;
  side: TradeSide;
  entry_datetime: string;
  exit_datetime: string | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  fees: number;
  commissions: number;
  stop_loss: number | null;
  planned_risk_override: number | null;
  planned_r_override: number | null;
  // Explicit realized P&L from a broker sync (used when entry/exit prices
  // aren't available, e.g. Schwab summary trades). When set, it overrides
  // the price-based P&L calculation.
  net_pnl: number | null;
  // Individual fills. When present, quantity / entry_price / exit_price and
  // P&L are derived from these (average-cost accounting).
  executions?: TradeExecution[] | null;
  // Quantity still open, and whether nothing is left open. Derived from
  // `executions` when the trade is saved, so the trades table can flag a
  // partially closed position without recomputing the fills.
  open_quantity?: number | null;
  fully_closed?: boolean | null;
  // Set by the broker sync when the feed gives no open time and the close time
  // is substituted, which would otherwise report a zero hold time.
  entry_time_estimated?: boolean | null;
  // R multiple as the broker reported it (kept separate from the user's own
  // `planned_r_override` so a sync never overwrites a manual value).
  broker_r_multiple?: number | null;
  mae: number | null;
  mfe: number | null;
  notes: string | null;
  followed_plan: boolean | null;
  what_went_well: string | null;
  what_to_improve: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  strategy?: Strategy;
  account?: Account;
  tags?: Tag[];
  mistakes?: Mistake[];
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  broker: string | null;
  currency: string;
  is_default: boolean;
  created_at: string;
}

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Mistake {
  id: string;
  user_id: string;
  name: string;
  severity: number;
  is_default: boolean;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  date: string;
  pre_market: string | null;
  post_market: string | null;
  daily_max_loss: number | null;
  daily_profit_target: number | null;
  mood: number | null;
  created_at: string;
  updated_at: string;
}

export interface TradeMetrics {
  grossPnL: number;
  netPnL: number;
  plannedRisk: number | null;
  realizedR: number | null;
}

export interface DailyStats {
  date: string;
  trades: number;
  netPnL: number;
  totalR: number;
  winCount: number;
  lossCount: number;
}

export interface AnalyticsData {
  totalNetPnL: number;
  totalR: number;
  totalTrades: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
  winStreak: number;
  lossStreak: number;
  currentStreak: number;
  currentStreakType: 'win' | 'loss' | 'none';
}

export interface FilterPreset {
  id: string;
  user_id: string;
  name: string;
  filters_json: TradeFilters;
  created_at: string;
}

export interface TradeFilters {
  dateFrom?: string;
  dateTo?: string;
  symbol?: string;
  side?: TradeSide;
  strategy_id?: string;
  account_id?: string;
  tags?: string[];
  mistakes?: string[];
  followedPlan?: boolean;
  minR?: number;
  maxR?: number;
  minPnL?: number;
  maxPnL?: number;
}
