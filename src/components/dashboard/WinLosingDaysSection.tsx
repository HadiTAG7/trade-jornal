import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Trade } from '@/types/trade';
import { calculateTradeMetrics, formatCurrency, formatPercent, formatHoldTime } from '@/lib/calculations';
import { format } from 'date-fns';

interface WinLosingDaysSectionProps {
  trades: Trade[];
  onTradeClick?: (tradeId: string) => void;
}

interface DayStats {
  totalGainLoss: number;
  avgDailyGainLoss: number;
  avgDailyVolume: number;
  avgPerShareGainLoss: number;
  avgTradeGainLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  scratchTrades: number;
  winRate: number;
  lossRate: number;
  avgWinningTrade: number;
  avgLosingTrade: number;
  tradePnLStdDev: number;
  probabilityOfRandomChance: number | null;
  kRatio: number | null;
  sqn: number | null;
  kellyPercentage: number | null;
  avgHoldTimeWinningMinutes: number;
  avgHoldTimeLosingMinutes: number;
  avgHoldTimeScratchMinutes: number;
  profitFactor: number;
  largestGain: { value: number; tradeId: string | null };
  largestLoss: { value: number; tradeId: string | null };
  avgMAE: number | null;
  avgMFE: number | null;
  totalCommissions: number;
  totalFees: number;
  dayCount: number;
}

function calculateDayTypeStats(trades: Trade[], isWinningDay: boolean): DayStats {
  const closedTrades = trades.filter(t => t.exit_datetime !== null && t.exit_price !== null);
  
  // Group trades by day
  const dailyData = new Map<string, { pnl: number; trades: Trade[] }>();
  closedTrades.forEach(trade => {
    const date = trade.exit_datetime!.split('T')[0];
    const metrics = calculateTradeMetrics(trade);
    const existing = dailyData.get(date);
    if (existing) {
      existing.pnl += metrics.netPnL;
      existing.trades.push(trade);
    } else {
      dailyData.set(date, { pnl: metrics.netPnL, trades: [trade] });
    }
  });

  // Filter days based on win/loss
  const filteredDays = Array.from(dailyData.entries()).filter(([_, data]) => 
    isWinningDay ? data.pnl > 0 : data.pnl < 0
  );

  const dayCount = filteredDays.length;
  const dayTrades = filteredDays.flatMap(([_, data]) => data.trades);

  if (dayTrades.length === 0) {
    return {
      totalGainLoss: 0,
      avgDailyGainLoss: 0,
      avgDailyVolume: 0,
      avgPerShareGainLoss: 0,
      avgTradeGainLoss: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      scratchTrades: 0,
      winRate: 0,
      lossRate: 0,
      avgWinningTrade: 0,
      avgLosingTrade: 0,
      tradePnLStdDev: 0,
      probabilityOfRandomChance: null,
      kRatio: null,
      sqn: null,
      kellyPercentage: null,
      avgHoldTimeWinningMinutes: 0,
      avgHoldTimeLosingMinutes: 0,
      avgHoldTimeScratchMinutes: 0,
      profitFactor: 0,
      largestGain: { value: 0, tradeId: null },
      largestLoss: { value: 0, tradeId: null },
      avgMAE: null,
      avgMFE: null,
      totalCommissions: 0,
      totalFees: 0,
      dayCount: 0,
    };
  }

  const metricsArray = dayTrades.map(t => ({
    trade: t,
    metrics: calculateTradeMetrics(t),
  }));

  const pnlValues = metricsArray.map(m => m.metrics.netPnL);
  const totalGainLoss = pnlValues.reduce((sum, p) => sum + p, 0);

  // Find largest gain/loss with trade ID
  let largestGain = { value: 0, tradeId: null as string | null };
  let largestLoss = { value: 0, tradeId: null as string | null };
  metricsArray.forEach(m => {
    if (m.metrics.netPnL > largestGain.value) {
      largestGain = { value: m.metrics.netPnL, tradeId: m.trade.id };
    }
    if (m.metrics.netPnL < largestLoss.value) {
      largestLoss = { value: m.metrics.netPnL, tradeId: m.trade.id };
    }
  });

  // Categorize trades
  const winningTrades = metricsArray.filter(m => m.metrics.netPnL > 0);
  const losingTrades = metricsArray.filter(m => m.metrics.netPnL < 0);
  const scratchTrades = metricsArray.filter(m => m.metrics.netPnL === 0);

  // Daily aggregations
  const totalDailyVolume = filteredDays.reduce((sum, [_, data]) => 
    sum + data.trades.reduce((s, t) => s + Number(t.quantity), 0), 0
  );
  const avgDailyGainLoss = dayCount > 0 ? totalGainLoss / dayCount : 0;
  const avgDailyVolume = dayCount > 0 ? totalDailyVolume / dayCount : 0;

  // Per-share calculations
  const totalShares = dayTrades.reduce((sum, t) => sum + Number(t.quantity), 0);
  const avgPerShareGainLoss = totalShares > 0 ? totalGainLoss / totalShares : 0;

  // Averages
  const avgTradeGainLoss = dayTrades.length > 0 ? totalGainLoss / dayTrades.length : 0;
  const avgWinningTrade = winningTrades.length > 0 
    ? winningTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0) / winningTrades.length 
    : 0;
  const avgLosingTrade = losingTrades.length > 0 
    ? losingTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0) / losingTrades.length 
    : 0;

  // Rates
  const winRate = dayTrades.length > 0 ? (winningTrades.length / dayTrades.length) * 100 : 0;
  const lossRate = dayTrades.length > 0 ? (losingTrades.length / dayTrades.length) * 100 : 0;

  // Hold times
  const calculateHoldTime = (t: Trade): number => {
    const entry = new Date(t.entry_datetime);
    const exit = new Date(t.exit_datetime!);
    return (exit.getTime() - entry.getTime()) / (1000 * 60);
  };

  const winningHoldTimes = winningTrades.map(m => calculateHoldTime(m.trade));
  const avgHoldTimeWinningMinutes = winningHoldTimes.length > 0 
    ? winningHoldTimes.reduce((sum, h) => sum + h, 0) / winningHoldTimes.length 
    : 0;

  const losingHoldTimes = losingTrades.map(m => calculateHoldTime(m.trade));
  const avgHoldTimeLosingMinutes = losingHoldTimes.length > 0 
    ? losingHoldTimes.reduce((sum, h) => sum + h, 0) / losingHoldTimes.length 
    : 0;

  const scratchHoldTimes = scratchTrades.map(m => calculateHoldTime(m.trade));
  const avgHoldTimeScratchMinutes = scratchHoldTimes.length > 0 
    ? scratchHoldTimes.reduce((sum, h) => sum + h, 0) / scratchHoldTimes.length 
    : 0;

  // Standard deviation
  const mean = avgTradeGainLoss;
  const variance = dayTrades.length > 1
    ? pnlValues.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (dayTrades.length - 1)
    : 0;
  const tradePnLStdDev = Math.sqrt(variance);

  // Probability of random chance
  let probabilityOfRandomChance: number | null = null;
  if (dayTrades.length >= 30 && tradePnLStdDev > 0) {
    const tStat = Math.abs(mean / (tradePnLStdDev / Math.sqrt(dayTrades.length)));
    probabilityOfRandomChance = Math.min(100, Math.exp(-0.5 * tStat) * 100);
  }

  // K-Ratio
  let kRatio: number | null = null;
  const sortedMetrics = [...dayTrades]
    .sort((a, b) => new Date(a.exit_datetime!).getTime() - new Date(b.exit_datetime!).getTime())
    .map(calculateTradeMetrics);

  if (sortedMetrics.length >= 10) {
    let cumulative = 0;
    const equityPoints = sortedMetrics.map((m, i) => {
      cumulative += m.netPnL;
      return { x: i + 1, y: cumulative };
    });
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

  // SQN
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

  // Kelly Percentage
  let kellyPercentage: number | null = null;
  if (avgLosingTrade !== 0) {
    const W = winRate / 100;
    const R = Math.abs(avgWinningTrade / avgLosingTrade);
    kellyPercentage = (W - ((1 - W) / R)) * 100;
  }

  // Profit factor
  const grossProfit = winningTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, m) => sum + m.metrics.netPnL, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Fees
  const totalCommissions = dayTrades.reduce((sum, t) => sum + (Number(t.commissions) || 0), 0);
  const totalFees = dayTrades.reduce((sum, t) => sum + (Number(t.fees) || 0), 0);

  // MAE/MFE
  const tradesWithMAE = dayTrades.filter(t => t.mae !== null);
  const avgMAE = tradesWithMAE.length > 0
    ? tradesWithMAE.reduce((sum, t) => sum + (Number(t.mae) || 0), 0) / tradesWithMAE.length
    : null;

  const tradesWithMFE = dayTrades.filter(t => t.mfe !== null);
  const avgMFE = tradesWithMFE.length > 0
    ? tradesWithMFE.reduce((sum, t) => sum + (Number(t.mfe) || 0), 0) / tradesWithMFE.length
    : null;

  return {
    totalGainLoss,
    avgDailyGainLoss,
    avgDailyVolume,
    avgPerShareGainLoss,
    avgTradeGainLoss,
    totalTrades: dayTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    scratchTrades: scratchTrades.length,
    winRate,
    lossRate,
    avgWinningTrade,
    avgLosingTrade,
    tradePnLStdDev,
    probabilityOfRandomChance,
    kRatio,
    sqn,
    kellyPercentage,
    avgHoldTimeWinningMinutes,
    avgHoldTimeLosingMinutes,
    avgHoldTimeScratchMinutes,
    profitFactor,
    largestGain,
    largestLoss,
    avgMAE,
    avgMFE,
    totalCommissions,
    totalFees,
    dayCount,
  };
}

interface StatRowProps {
  label: string;
  value: string | number;
  isClickable?: boolean;
  onClick?: () => void;
  valueClassName?: string;
}

function StatRow({ label, value, isClickable, onClick, valueClassName }: StatRowProps) {
  return (
    <TableRow className="border-border/50">
      <TableCell className="text-muted-foreground py-2 text-sm">{label}:</TableCell>
      <TableCell className={`py-2 text-sm font-medium ${valueClassName || ''}`}>
        {isClickable ? (
          <button 
            onClick={onClick}
            className="text-primary hover:underline cursor-pointer"
          >
            {value} <span className="text-xs">(show)</span>
          </button>
        ) : value}
      </TableCell>
    </TableRow>
  );
}

interface DayPanelProps {
  title: string;
  dayCount: number;
  stats: DayStats;
  isWinning: boolean;
  onTradeClick?: (tradeId: string) => void;
}

function DayPanel({ title, dayCount, stats, isWinning, onTradeClick }: DayPanelProps) {
  const titleColor = isWinning ? 'text-profit' : 'text-loss';
  const dotColor = isWinning ? 'bg-profit' : 'bg-loss';

  const formatMinutes = (minutes: number) => {
    if (minutes === 0) return 'n/a';
    if (minutes < 60) return `${Math.round(minutes)} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  };

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-lg ${titleColor}`}>
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          {dayCount} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableBody>
            <StatRow 
              label="Total Gain / Loss" 
              value={formatCurrency(stats.totalGainLoss)}
              valueClassName={stats.totalGainLoss >= 0 ? 'text-profit' : 'text-loss'}
            />
            <StatRow 
              label="Average Daily Gain / Loss" 
              value={formatCurrency(stats.avgDailyGainLoss)}
              valueClassName={stats.avgDailyGainLoss >= 0 ? 'text-profit' : 'text-loss'}
            />
            <StatRow 
              label="Average Daily Volume" 
              value={Math.round(stats.avgDailyVolume).toLocaleString()}
            />
            <StatRow 
              label="Average Per-Share Gain / Loss" 
              value={formatCurrency(stats.avgPerShareGainLoss)}
              valueClassName={stats.avgPerShareGainLoss >= 0 ? 'text-profit' : 'text-loss'}
            />
            <StatRow 
              label="Average Trade Gain / Loss" 
              value={formatCurrency(stats.avgTradeGainLoss)}
              valueClassName={stats.avgTradeGainLoss >= 0 ? 'text-profit' : 'text-loss'}
            />
            <StatRow 
              label="Total Number of Trades" 
              value={stats.totalTrades.toLocaleString()}
            />
            <StatRow 
              label="Winning Trades" 
              value={`${stats.winningTrades} (${formatPercent(stats.winRate)})`}
            />
            <StatRow 
              label="Losing Trades" 
              value={`${stats.losingTrades} (${formatPercent(stats.lossRate)})`}
            />
            <StatRow 
              label="Scratch Trades" 
              value={stats.scratchTrades > 0 ? stats.scratchTrades.toString() : 'n/a'}
            />
            <StatRow 
              label="Average Winning Trade" 
              value={stats.avgWinningTrade > 0 ? formatCurrency(stats.avgWinningTrade) : 'n/a'}
              valueClassName="text-profit"
            />
            <StatRow 
              label="Average Losing Trade" 
              value={stats.avgLosingTrade < 0 ? formatCurrency(stats.avgLosingTrade) : 'n/a'}
              valueClassName="text-loss"
            />
            <StatRow 
              label="Trade P&L Standard Deviation" 
              value={formatCurrency(stats.tradePnLStdDev)}
            />
            <StatRow 
              label="Probability of Random Chance" 
              value={stats.probabilityOfRandomChance !== null 
                ? `${stats.probabilityOfRandomChance.toFixed(1)}%` 
                : 'n/a'}
            />
            <StatRow 
              label="K-Ratio" 
              value={stats.kRatio !== null ? stats.kRatio.toFixed(2) : 'n/a'}
            />
            <StatRow 
              label="System Quality Number (SQN)" 
              value={stats.sqn !== null ? stats.sqn.toFixed(2) : 'n/a'}
            />
            <StatRow 
              label="Kelly Percentage" 
              value={stats.kellyPercentage !== null 
                ? (stats.kellyPercentage < 0 ? '< 0%' : `${stats.kellyPercentage.toFixed(2)}%`)
                : 'n/a'}
            />
            <StatRow 
              label="Average Hold Time (Winning Trades)" 
              value={formatMinutes(stats.avgHoldTimeWinningMinutes)}
            />
            <StatRow 
              label="Average Hold Time (Losing Trades)" 
              value={formatMinutes(stats.avgHoldTimeLosingMinutes)}
            />
            <StatRow 
              label="Average Hold Time (Scratch Trades)" 
              value={formatMinutes(stats.avgHoldTimeScratchMinutes)}
            />
            <StatRow 
              label="Profit Factor" 
              value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
            />
            <StatRow 
              label="Largest Gain" 
              value={stats.largestGain.value > 0 ? formatCurrency(stats.largestGain.value) : 'n/a'}
              valueClassName="text-profit"
              isClickable={!!stats.largestGain.tradeId}
              onClick={() => stats.largestGain.tradeId && onTradeClick?.(stats.largestGain.tradeId)}
            />
            <StatRow 
              label="Largest Loss" 
              value={stats.largestLoss.value < 0 ? formatCurrency(stats.largestLoss.value) : 'n/a'}
              valueClassName="text-loss"
              isClickable={!!stats.largestLoss.tradeId}
              onClick={() => stats.largestLoss.tradeId && onTradeClick?.(stats.largestLoss.tradeId)}
            />
            <StatRow 
              label="Average Position MFE" 
              value={stats.avgMFE !== null ? formatCurrency(stats.avgMFE) : 'n/a'}
            />
            <StatRow 
              label="Average Position MAE" 
              value={stats.avgMAE !== null ? formatCurrency(stats.avgMAE) : 'n/a'}
            />
            <StatRow 
              label="Total Commissions" 
              value={formatCurrency(stats.totalCommissions)}
            />
            <StatRow 
              label="Total Fees" 
              value={formatCurrency(stats.totalFees)}
            />
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function WinLosingDaysSection({ trades, onTradeClick }: WinLosingDaysSectionProps) {
  const winningDayStats = useMemo(() => calculateDayTypeStats(trades, true), [trades]);
  const losingDayStats = useMemo(() => calculateDayTypeStats(trades, false), [trades]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DayPanel 
        title="Winning Days"
        dayCount={winningDayStats.dayCount}
        stats={winningDayStats}
        isWinning={true}
        onTradeClick={onTradeClick}
      />
      <DayPanel 
        title="Losing Days"
        dayCount={losingDayStats.dayCount}
        stats={losingDayStats}
        isWinning={false}
        onTradeClick={onTradeClick}
      />
    </div>
  );
}
