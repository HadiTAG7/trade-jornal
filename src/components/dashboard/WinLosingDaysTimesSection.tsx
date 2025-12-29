import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trade } from '@/types/trade';
import { calculateTradeMetrics, formatCurrency } from '@/lib/calculations';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import { format, getDay, getMonth, getHours } from 'date-fns';

interface WinLosingDaysTimesSectionProps {
  trades: Trade[];
}

// Colors for winning/losing days
const WINNING_DAY_COLOR = 'hsl(199 89% 48%)'; // Blue
const LOSING_DAY_COLOR = 'hsl(45 93% 47%)'; // Yellow/Orange

const tooltipStyle = {
  contentStyle: { 
    backgroundColor: 'hsl(222 47% 11%)',
    borderColor: 'hsl(var(--border))',
    borderRadius: '8px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
  },
  labelStyle: { color: 'hsl(0 0% 98%)', fontWeight: 600, marginBottom: '4px' },
  itemStyle: { color: 'hsl(0 0% 90%)' },
};

// Group trades by day type (winning/losing)
function groupTradesByDayType(trades: Trade[]) {
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

  const winningDayTrades: Trade[] = [];
  const losingDayTrades: Trade[] = [];

  dailyData.forEach((data) => {
    if (data.pnl > 0) {
      winningDayTrades.push(...data.trades);
    } else if (data.pnl < 0) {
      losingDayTrades.push(...data.trades);
    }
  });

  return { winningDayTrades, losingDayTrades };
}

// Calculate day of week data
function calculateDayOfWeekData(winningDayTrades: Trade[], losingDayTrades: Trade[]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = days.map(day => ({
    day,
    winningCount: 0,
    losingCount: 0,
    winningPnL: 0,
    losingPnL: 0,
  }));

  winningDayTrades.forEach(trade => {
    const dayIndex = getDay(new Date(trade.entry_datetime));
    const metrics = calculateTradeMetrics(trade);
    data[dayIndex].winningCount++;
    data[dayIndex].winningPnL += metrics.netPnL;
  });

  losingDayTrades.forEach(trade => {
    const dayIndex = getDay(new Date(trade.entry_datetime));
    const metrics = calculateTradeMetrics(trade);
    data[dayIndex].losingCount++;
    data[dayIndex].losingPnL += metrics.netPnL;
  });

  // Filter to Mon-Fri only (indices 1-5)
  return data.slice(1, 6);
}

// Calculate month of year data
function calculateMonthData(winningDayTrades: Trade[], losingDayTrades: Trade[]) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const data = months.map(month => ({
    month,
    winningCount: 0,
    losingCount: 0,
    winningPnL: 0,
    losingPnL: 0,
  }));

  winningDayTrades.forEach(trade => {
    const monthIndex = getMonth(new Date(trade.entry_datetime));
    const metrics = calculateTradeMetrics(trade);
    data[monthIndex].winningCount++;
    data[monthIndex].winningPnL += metrics.netPnL;
  });

  losingDayTrades.forEach(trade => {
    const monthIndex = getMonth(new Date(trade.entry_datetime));
    const metrics = calculateTradeMetrics(trade);
    data[monthIndex].losingCount++;
    data[monthIndex].losingPnL += metrics.netPnL;
  });

  return data;
}

// Calculate hour of day data
function calculateHourData(winningDayTrades: Trade[], losingDayTrades: Trade[]) {
  const data = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    winningCount: 0,
    losingCount: 0,
    winningPnL: 0,
    losingPnL: 0,
  }));

  winningDayTrades.forEach(trade => {
    const hour = getHours(new Date(trade.entry_datetime));
    const metrics = calculateTradeMetrics(trade);
    data[hour].winningCount++;
    data[hour].winningPnL += metrics.netPnL;
  });

  losingDayTrades.forEach(trade => {
    const hour = getHours(new Date(trade.entry_datetime));
    const metrics = calculateTradeMetrics(trade);
    data[hour].losingCount++;
    data[hour].losingPnL += metrics.netPnL;
  });

  // Filter to show hours with activity (6:00 - 20:00)
  return data.filter((_, i) => i >= 6 && i <= 20);
}

// Calculate intraday duration data
function calculateDurationData(winningDayTrades: Trade[], losingDayTrades: Trade[]) {
  const buckets = [
    { label: '< 1:00', min: 0, max: 1 },
    { label: '1:00 - 1:59', min: 1, max: 2 },
    { label: '2:00 - 4:59', min: 2, max: 5 },
    { label: '5:00 - 9:59', min: 5, max: 10 },
    { label: '10:00 - 19:59', min: 10, max: 20 },
    { label: '20:00 - 39:59', min: 20, max: 40 },
    { label: '40:00 - 59:59', min: 40, max: 60 },
    { label: '1:00:00 - 1:59:59', min: 60, max: 120 },
    { label: '2:00:00 - 3:59:59', min: 120, max: 240 },
    { label: '4:00:00 >', min: 240, max: Infinity },
  ];

  const data = buckets.map(bucket => ({
    duration: bucket.label,
    winningCount: 0,
    losingCount: 0,
    winningPnL: 0,
    losingPnL: 0,
  }));

  const getHoldTimeMinutes = (trade: Trade): number => {
    const entry = new Date(trade.entry_datetime);
    const exit = new Date(trade.exit_datetime!);
    return (exit.getTime() - entry.getTime()) / (1000 * 60);
  };

  const findBucketIndex = (minutes: number): number => {
    return buckets.findIndex(b => minutes >= b.min && minutes < b.max);
  };

  winningDayTrades.forEach(trade => {
    if (!trade.exit_datetime) return;
    const minutes = getHoldTimeMinutes(trade);
    const bucketIndex = findBucketIndex(minutes);
    if (bucketIndex !== -1) {
      const metrics = calculateTradeMetrics(trade);
      data[bucketIndex].winningCount++;
      data[bucketIndex].winningPnL += metrics.netPnL;
    }
  });

  losingDayTrades.forEach(trade => {
    if (!trade.exit_datetime) return;
    const minutes = getHoldTimeMinutes(trade);
    const bucketIndex = findBucketIndex(minutes);
    if (bucketIndex !== -1) {
      const metrics = calculateTradeMetrics(trade);
      data[bucketIndex].losingCount++;
      data[bucketIndex].losingPnL += metrics.netPnL;
    }
  });

  return data;
}

interface ComparisonChartProps {
  title: string;
  data: any[];
  xKey: string;
  winningKey: string;
  losingKey: string;
  winningLabel: string;
  losingLabel: string;
  isPerformance?: boolean;
}

function ComparisonBarChart({ 
  title, 
  data, 
  xKey, 
  winningKey, 
  losingKey, 
  winningLabel, 
  losingLabel,
  isPerformance = false 
}: ComparisonChartProps) {
  const hasData = data.some(d => d[winningKey] !== 0 || d[losingKey] !== 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={data} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                <XAxis 
                  type="number"
                  className="text-xs fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => isPerformance ? formatCurrency(value) : value.toString()}
                />
                <YAxis 
                  type="category"
                  dataKey={xKey}
                  className="text-xs fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                {isPerformance && <ReferenceLine x={0} stroke="hsl(var(--border))" />}
                <Tooltip 
                  {...tooltipStyle}
                  formatter={(value: number, name: string) => {
                    const formattedValue = isPerformance ? formatCurrency(value) : value;
                    return [formattedValue, name === winningKey ? winningLabel : losingLabel];
                  }}
                />
                <Legend 
                  formatter={(value) => value === winningKey ? winningLabel : losingLabel}
                />
                <Bar 
                  dataKey={winningKey} 
                  fill={WINNING_DAY_COLOR} 
                  radius={[0, 4, 4, 0]}
                  name={winningKey}
                />
                <Bar 
                  dataKey={losingKey} 
                  fill={LOSING_DAY_COLOR} 
                  radius={[0, 4, 4, 0]}
                  name={losingKey}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No trade data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WinLosingDaysTimesSection({ trades }: WinLosingDaysTimesSectionProps) {
  const [timeframe] = useState('1h');

  const { winningDayTrades, losingDayTrades } = useMemo(
    () => groupTradesByDayType(trades),
    [trades]
  );

  const dayOfWeekData = useMemo(
    () => calculateDayOfWeekData(winningDayTrades, losingDayTrades),
    [winningDayTrades, losingDayTrades]
  );

  const monthData = useMemo(
    () => calculateMonthData(winningDayTrades, losingDayTrades),
    [winningDayTrades, losingDayTrades]
  );

  const hourData = useMemo(
    () => calculateHourData(winningDayTrades, losingDayTrades),
    [winningDayTrades, losingDayTrades]
  );

  const durationData = useMemo(
    () => calculateDurationData(winningDayTrades, losingDayTrades),
    [winningDayTrades, losingDayTrades]
  );

  return (
    <div className="space-y-8">
      {/* By Day of Week */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ComparisonBarChart
          title="Trade Distribution by Day of Week"
          data={dayOfWeekData}
          xKey="day"
          winningKey="winningCount"
          losingKey="losingCount"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
        />
        <ComparisonBarChart
          title="Performance by Day of Week"
          data={dayOfWeekData}
          xKey="day"
          winningKey="winningPnL"
          losingKey="losingPnL"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
          isPerformance
        />
      </div>

      {/* By Month of Year */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ComparisonBarChart
          title="Trade Distribution by Month of Year"
          data={monthData}
          xKey="month"
          winningKey="winningCount"
          losingKey="losingCount"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
        />
        <ComparisonBarChart
          title="Performance by Month of Year"
          data={monthData}
          xKey="month"
          winningKey="winningPnL"
          losingKey="losingPnL"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
          isPerformance
        />
      </div>

      {/* By Hour of Day */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="uppercase tracking-wide">Timeframe:</span>
          <Select value={timeframe} disabled>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1 hour</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ComparisonBarChart
            title="Trade Distribution by Hour of Day"
            data={hourData}
            xKey="hour"
            winningKey="winningCount"
            losingKey="losingCount"
            winningLabel="Winning Days"
            losingLabel="Losing Days"
          />
          <ComparisonBarChart
            title="Performance by Hour of Day"
            data={hourData}
            xKey="hour"
            winningKey="winningPnL"
            losingKey="losingPnL"
            winningLabel="Winning Days"
            losingLabel="Losing Days"
            isPerformance
          />
        </div>
      </div>

      {/* By Intraday Duration */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ComparisonBarChart
          title="Trade Distribution by Intraday Duration"
          data={durationData}
          xKey="duration"
          winningKey="winningCount"
          losingKey="losingCount"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
        />
        <ComparisonBarChart
          title="Performance by Intraday Duration"
          data={durationData}
          xKey="duration"
          winningKey="winningPnL"
          losingKey="losingPnL"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
          isPerformance
        />
      </div>
    </div>
  );
}
