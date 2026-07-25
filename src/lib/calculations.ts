import { Trade, TradeMetrics, AnalyticsData, DailyStats } from '@/types/trade';
import { summarizeExecutions } from '@/lib/executions';
import {
  closedDayKey,
  closedTrades,
  compareByClose,
  holdMinutes,
  sortedClosedTrades,
} from '@/lib/tradeStatus';

export function calculateTradeMetrics(trade: Trade): TradeMetrics {
  const entryPrice = Number(trade.entry_price);
  const exitPrice = trade.exit_price ? Number(trade.exit_price) : null;
  const quantity = Number(trade.quantity);
  const fees = Number(trade.fees) || 0;
  const commissions = Number(trade.commissions) || 0;
  const stopLoss = trade.stop_loss ? Number(trade.stop_loss) : null;

  let grossPnL = 0;
  let netPnL = 0;

  if (trade.executions && trade.executions.length > 0) {
    // Multiple fills (scaling in/out): average-cost accounting.
    const s = summarizeExecutions(trade.executions, trade.side);
    grossPnL = s.realizedPnL;
    netPnL = s.closedQty > 0 ? s.realizedPnL - fees - commissions : 0;
  } else if (trade.net_pnl !== null && trade.net_pnl !== undefined) {
    // Explicit realized P&L from a broker sync (no price data available).
    netPnL = Number(trade.net_pnl);
    grossPnL = netPnL + fees + commissions;
  } else if (exitPrice !== null) {
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
      totalR: 0,
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

  const closed = closedTrades(trades);
  const metricsArray = closed.map(calculateTradeMetrics);

  const wins = metricsArray.filter(m => m.netPnL > 0);
  const losses = metricsArray.filter(m => m.netPnL < 0);

  const totalNetPnL = metricsArray.reduce((sum, m) => sum + m.netPnL, 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

  // Calculate average R and total R (only for trades with R calculated)
  const tradesWithR = metricsArray.filter(m => m.realizedR !== null);
  const totalR = tradesWithR.reduce((sum, m) => sum + (m.realizedR || 0), 0);
  const avgR = tradesWithR.length > 0 ? totalR / tradesWithR.length : 0;

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
  
  // Order by the moment each trade was actually realized, not by entry.
  const sortedMetrics = sortedClosedTrades(trades).map(calculateTradeMetrics);

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
    totalR,
    totalTrades: closed.length,
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

export interface DetailedStats {
  // Gains/Losses
  totalGainLoss: number;
  largestGain: number;
  largestLoss: number;
  avgDailyGainLoss: number;
  avgDailyVolume: number;
  avgPerShareGainLoss: number;
  avgTradeGainLoss: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  
  // Counts
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  scratchTrades: number;
  winRate: number;
  lossRate: number;
  scratchRate: number;
  
  // Hold times. `holdTimeSampleSize` is how many trades actually had a usable
  // open time — broker-synced trades often don't, and averaging their zeroes in
  // used to drag every hold time towards nothing.
  avgHoldTimeMinutes: number;
  avgHoldTimeWinningMinutes: number;
  avgHoldTimeLosingMinutes: number;
  holdTimeSampleSize: number;
  
  // Streaks
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  
  // Advanced metrics
  tradePnLStdDev: number;
  sqn: number | null;
  probabilityOfRandomChance: number | null;
  kellyPercentage: number | null;
  kRatio: number | null;
  profitFactor: number;
  
  // Fees
  totalCommissions: number;
  totalFees: number;
  
  // MAE/MFE
  avgMAE: number | null;
  avgMFE: number | null;
}

export function calculateDetailedStats(trades: Trade[]): DetailedStats {
  const closed = closedTrades(trades);
  const metricsArray = closed.map(t => ({
    trade: t,
    metrics: calculateTradeMetrics(t),
  }));

  // Basic calculations
  const pnlValues = metricsArray.map(m => m.metrics.netPnL);
  const totalGainLoss = pnlValues.reduce((sum, p) => sum + p, 0);
  const largestGain = pnlValues.length > 0 ? Math.max(...pnlValues, 0) : 0;
  const largestLoss = pnlValues.length > 0 ? Math.min(...pnlValues, 0) : 0;

  // Categorize trades
  const winningTrades = metricsArray.filter(m => m.metrics.netPnL > 0);
  const losingTrades = metricsArray.filter(m => m.metrics.netPnL < 0);
  const scratchTrades = metricsArray.filter(m => m.metrics.netPnL === 0);

  // Daily aggregations
  const dailyData = new Map<string, { pnl: number; volume: number }>();
  closed.forEach(trade => {
    const date = closedDayKey(trade)!;
    const metrics = calculateTradeMetrics(trade);
    const existing = dailyData.get(date);
    if (existing) {
      existing.pnl += metrics.netPnL;
      existing.volume += Number(trade.quantity);
    } else {
      dailyData.set(date, { pnl: metrics.netPnL, volume: Number(trade.quantity) });
    }
  });
  const tradingDays = dailyData.size;
  const avgDailyGainLoss = tradingDays > 0 ? totalGainLoss / tradingDays : 0;
  const avgDailyVolume = tradingDays > 0 
    ? Array.from(dailyData.values()).reduce((sum, d) => sum + d.volume, 0) / tradingDays 
    : 0;

  // Per-share calculations
  const totalShares = closed.reduce((sum, t) => sum + Number(t.quantity), 0);
  const avgPerShareGainLoss = totalShares > 0 ? totalGainLoss / totalShares : 0;

  // Averages
  const avgTradeGainLoss = closed.length > 0 ? totalGainLoss / closed.length : 0;
  const avgWinningTrade = winningTrades.length > 0 
    ? winningTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0) / winningTrades.length 
    : 0;
  const avgLosingTrade = losingTrades.length > 0 
    ? losingTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0) / losingTrades.length 
    : 0;

  // Rates
  const winRate = closed.length > 0 ? (winningTrades.length / closed.length) * 100 : 0;
  const lossRate = closed.length > 0 ? (losingTrades.length / closed.length) * 100 : 0;
  const scratchRate = closed.length > 0 ? (scratchTrades.length / closed.length) * 100 : 0;

  // Hold times (in minutes), skipping trades whose open time was estimated.
  const mean_ = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  const holdTimes = (list: Trade[]) =>
    list.map(holdMinutes).filter((m): m is number => m !== null);

  const allHoldTimes = holdTimes(closed);
  const avgHoldTimeMinutes = mean_(allHoldTimes);
  const avgHoldTimeWinningMinutes = mean_(holdTimes(winningTrades.map(m => m.trade)));
  const avgHoldTimeLosingMinutes = mean_(holdTimes(losingTrades.map(m => m.trade)));

  // Streaks
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  const sortedMetrics = [...closed].sort(compareByClose).map(calculateTradeMetrics);

  for (const m of sortedMetrics) {
    if (m.netPnL > 0) {
      currentWins++;
      currentLosses = 0;
      if (currentWins > maxConsecutiveWins) maxConsecutiveWins = currentWins;
    } else if (m.netPnL < 0) {
      currentLosses++;
      currentWins = 0;
      if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
    }
  }

  // Standard deviation of P/L
  const mean = avgTradeGainLoss;
  const variance = closed.length > 1
    ? pnlValues.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (closed.length - 1)
    : 0;
  const tradePnLStdDev = Math.sqrt(variance);

  // SQN (System Quality Number) = sqrt(n) * (avg R / std dev R)
  const tradesWithR = metricsArray.filter(m => m.metrics.realizedR !== null);
  let sqn: number | null = null;
  if (tradesWithR.length >= 30) {
    const rValues = tradesWithR.map(m => m.metrics.realizedR!);
    const avgR = rValues.reduce((sum, r) => sum + r, 0) / rValues.length;
    const rVariance = rValues.reduce((sum, r) => sum + Math.pow(r - avgR, 2), 0) / (rValues.length - 1);
    const rStdDev = Math.sqrt(rVariance);
    if (rStdDev > 0) {
      sqn = Math.sqrt(rValues.length) * (avgR / rStdDev);
    }
  }

  // Probability of random chance (simplified t-test approximation)
  let probabilityOfRandomChance: number | null = null;
  if (closed.length >= 30 && tradePnLStdDev > 0) {
    const tStat = Math.abs(mean / (tradePnLStdDev / Math.sqrt(closed.length)));
    // Approximate p-value (simplified)
    probabilityOfRandomChance = Math.min(100, Math.exp(-0.5 * tStat) * 100);
  }

  // Kelly Percentage = W - [(1-W) / R] where W = win rate, R = win/loss ratio
  let kellyPercentage: number | null = null;
  if (avgLosingTrade !== 0) {
    const W = winRate / 100;
    const R = Math.abs(avgWinningTrade / avgLosingTrade);
    kellyPercentage = (W - ((1 - W) / R)) * 100;
  }

  // K-Ratio (simplified) = slope of equity curve / std dev of deviations from line
  let kRatio: number | null = null;
  if (closed.length >= 10) {
    let cumulative = 0;
    const equityPoints = sortedMetrics.map((m, i) => {
      cumulative += m.netPnL;
      return { x: i + 1, y: cumulative };
    });
    // Simple linear regression
    const n = equityPoints.length;
    const sumX = equityPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = equityPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = equityPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = equityPoints.reduce((sum, p) => sum + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const residuals = equityPoints.map(p => p.y - (slope * p.x + intercept));
    const residualStdDev = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n);
    
    if (residualStdDev > 0) {
      kRatio = slope / residualStdDev;
    }
  }

  // Profit factor
  const grossProfit = winningTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Fees
  const totalCommissions = closed.reduce((sum, t) => sum + (Number(t.commissions) || 0), 0);
  const totalFees = closed.reduce((sum, t) => sum + (Number(t.fees) || 0), 0);

  // MAE/MFE averages
  const tradesWithMAE = closed.filter(t => t.mae !== null);
  const avgMAE = tradesWithMAE.length > 0
    ? tradesWithMAE.reduce((sum, t) => sum + (Number(t.mae) || 0), 0) / tradesWithMAE.length
    : null;

  const tradesWithMFE = closed.filter(t => t.mfe !== null);
  const avgMFE = tradesWithMFE.length > 0
    ? tradesWithMFE.reduce((sum, t) => sum + (Number(t.mfe) || 0), 0) / tradesWithMFE.length
    : null;

  return {
    totalGainLoss,
    largestGain,
    largestLoss,
    avgDailyGainLoss,
    avgDailyVolume,
    avgPerShareGainLoss,
    avgTradeGainLoss,
    avgWinningTrade,
    avgLosingTrade,
    totalTrades: closed.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    scratchTrades: scratchTrades.length,
    winRate,
    lossRate,
    scratchRate,
    avgHoldTimeMinutes,
    avgHoldTimeWinningMinutes,
    avgHoldTimeLosingMinutes,
    holdTimeSampleSize: allHoldTimes.length,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    tradePnLStdDev,
    sqn,
    probabilityOfRandomChance,
    kellyPercentage,
    kRatio,
    profitFactor,
    totalCommissions,
    totalFees,
    avgMAE,
    avgMFE,
  };
}

// Format hold time in human readable format
export function formatHoldTime(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} mins`;
  } else if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  } else {
    const days = Math.round(minutes / 1440);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
}

export function calculateDailyStats(trades: Trade[]): DailyStats[] {
  const dailyMap = new Map<string, Trade[]>();

  for (const trade of closedTrades(trades)) {
    const date = closedDayKey(trade)!;
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
