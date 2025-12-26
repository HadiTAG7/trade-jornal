export type TradeSide = 'LONG' | 'SHORT';
export type AttachmentKind = 'BEFORE' | 'AFTER' | 'OTHER';
export type ChecklistValue = 'YES' | 'NO' | 'NA';
export type ImportSourceType = 'ThinkOrSwim' | 'TraderVue' | 'Custom';

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
