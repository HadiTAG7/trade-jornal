import { Trade, TradeMetrics, AnalyticsData, DailyStats } from '@/types/trade';

export function calculateTradeMetrics(trade: Trade): TradeMetrics {
  const entryPrice = Number(trade.entry_price);
  const exitPrice = trade.exit_price ? Number(trade.exit_price) : null;
  const quantity = Number(trade.quantity);
  const fees = Number(trade.fees) || 0;
  const commissions = Number(trade.commissions) || 0;
  const stopLoss = trade.stop_loss ? Number(trade.stop_loss) : null;

  let grossPnL = 0;
  let netPnL = 0;

  if (exitPrice !== null) {
    if (trade.side === 'LONG') {
      grossPnL = (exitPrice - entryPrice) * quantity;
    } else {
      grossPnL = (entryPrice - exitPrice) * quantity;
    }
    netPnL = grossPnL - fees - commissions;
  }

  // Calculate planned risk
  let plannedRisk: number | null = null;
  if (trade.planned_risk_override) {
    plannedRisk = Number(trade.planned_risk_override);
  } else if (stopLoss !== null) {
    plannedRisk = Math.abs(entryPrice - stopLoss) * quantity;
  }

  // Calculate realized R
  let realizedR: number | null = null;
  if (trade.planned_r_override) {
    realizedR = Number(trade.planned_r_override);
  } else if (plannedRisk && plannedRisk > 0) {
    realizedR = netPnL / plannedRisk;
  }

  return {
    grossPnL,
    netPnL,
    plannedRisk,
    realizedR,
  };
}

export function calculateAnalytics(trades: Trade[]): AnalyticsData {
  if (trades.length === 0) {
    return {
      totalNetPnL: 0,
      totalTrades: 0,
      winRate: 0,
      avgR: 0,
      expectancy: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      winStreak: 0,
      lossStreak: 0,
      currentStreak: 0,
      currentStreakType: 'none',
    };
  }

  const closedTrades = trades.filter(t => t.exit_price !== null);
  const metricsArray = closedTrades.map(calculateTradeMetrics);

  const wins = metricsArray.filter(m => m.netPnL > 0);
  const losses = metricsArray.filter(m => m.netPnL < 0);

  const totalNetPnL = metricsArray.reduce((sum, m) => sum + m.netPnL, 0);
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

  // Calculate average R (only for trades with R calculated)
  const tradesWithR = metricsArray.filter(m => m.realizedR !== null);
  const avgR = tradesWithR.length > 0
    ? tradesWithR.reduce((sum, m) => sum + (m.realizedR || 0), 0) / tradesWithR.length
    : 0;

  // Expectancy: (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
  const avgWin = wins.length > 0 ? wins.reduce((sum, m) => sum + m.netPnL, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, m) => sum + m.netPnL, 0) / losses.length) : 0;
  const expectancy = ((winRate / 100) * avgWin) - ((1 - winRate / 100) * avgLoss);

  // Profit factor: Gross profits / Gross losses
  const grossProfit = wins.reduce((sum, m) => sum + m.netPnL, 0);
  const grossLoss = Math.abs(losses.reduce((sum, m) => sum + m.netPnL, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown - calculate equity curve and find max peak-to-trough
  let maxDrawdown = 0;
  let peak = 0;
  let equity = 0;
  
  // Sort by exit date for equity curve
  const sortedMetrics = [...closedTrades]
    .sort((a, b) => new Date(a.exit_datetime!).getTime() - new Date(b.exit_datetime!).getTime())
    .map(calculateTradeMetrics);

  for (const m of sortedMetrics) {
    equity += m.netPnL;
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Calculate streaks
  let winStreak = 0;
  let lossStreak = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let currentStreak = 0;
  let currentStreakType: 'win' | 'loss' | 'none' = 'none';

  for (const m of sortedMetrics) {
    if (m.netPnL > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > winStreak) winStreak = currentWinStreak;
    } else if (m.netPnL < 0) {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > lossStreak) lossStreak = currentLossStreak;
    }
  }

  // Current streak (from most recent trades)
  if (sortedMetrics.length > 0) {
    const lastPnL = sortedMetrics[sortedMetrics.length - 1].netPnL;
    if (lastPnL > 0) {
      currentStreakType = 'win';
      currentStreak = currentWinStreak;
    } else if (lastPnL < 0) {
      currentStreakType = 'loss';
      currentStreak = currentLossStreak;
    }
  }

  return {
    totalNetPnL,
    totalTrades: closedTrades.length,
    winRate,
    avgR,
    expectancy,
    profitFactor,
    maxDrawdown,
    winStreak,
    lossStreak,
    currentStreak,
    currentStreakType,
  };
}

export function calculateDailyStats(trades: Trade[]): DailyStats[] {
  const closedTrades = trades.filter(t => t.exit_datetime !== null);
  const dailyMap = new Map<string, Trade[]>();

  for (const trade of closedTrades) {
    const date = trade.exit_datetime!.split('T')[0];
    if (!dailyMap.has(date)) {
      dailyMap.set(date, []);
    }
    dailyMap.get(date)!.push(trade);
  }

  const stats: DailyStats[] = [];
  
  for (const [date, dayTrades] of dailyMap) {
    const metrics = dayTrades.map(calculateTradeMetrics);
    const netPnL = metrics.reduce((sum, m) => sum + m.netPnL, 0);
    const totalR = metrics
      .filter(m => m.realizedR !== null)
      .reduce((sum, m) => sum + (m.realizedR || 0), 0);
    const winCount = metrics.filter(m => m.netPnL > 0).length;
    const lossCount = metrics.filter(m => m.netPnL < 0).length;

    stats.push({
      date,
      trades: dayTrades.length,
      netPnL,
      totalR,
      winCount,
      lossCount,
    });
  }

  return stats.sort((a, b) => a.date.localeCompare(b.date));
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatR(value: number | null): string {
  if (value === null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}R`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function generateStableHash(
  symbol: string,
  side: string,
  entryDatetime: string,
  exitDatetime: string | null,
  entryPrice: number,
  exitPrice: number | null,
  quantity: number,
  accountId: string | null
): string {
  const data = `${symbol}|${side}|${entryDatetime}|${exitDatetime || ''}|${entryPrice}|${exitPrice || ''}|${quantity}|${accountId || ''}`;
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
