import { useState, useMemo } from 'react';
import { format, getDay, getHours } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trade } from '@/types/trade';
import { calculateTradeMetrics, formatCurrency } from '@/lib/calculations';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DayTimesSectionProps {
  trades: Trade[];
}

type TimeframeOption = '1h' | '30m';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5]; // Mon-Fri indices

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DURATION_BUCKETS = [
  { label: '< 1:00', maxMinutes: 1 },
  { label: '1:00 - 1:59', maxMinutes: 2 },
  { label: '2:00 - 4:59', maxMinutes: 5 },
  { label: '5:00 - 9:59', maxMinutes: 10 },
  { label: '10:00 - 19:59', maxMinutes: 20 },
  { label: '20:00 - 39:59', maxMinutes: 40 },
  { label: '40:00 - 59:59', maxMinutes: 60 },
  { label: '1:00:00 - 1:59:59', maxMinutes: 120 },
  { label: '2:00:00 - 3:59:59', maxMinutes: 240 },
  { label: '4:00:00 >', maxMinutes: Infinity },
];

// Chart component for horizontal bar charts
function HorizontalBarChart({
  data,
  dataKey,
  nameKey,
  title,
  description,
  isPerformance = false,
  height = 300,
}: {
  data: { name: string; value: number }[];
  dataKey: string;
  nameKey: string;
  title: string;
  description: string;
  isPerformance?: boolean;
  height?: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 && data.some(d => d.value !== 0) ? (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={true} vertical={true} />
                <XAxis
                  type="number"
                  className="text-xs fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => isPerformance ? `$${value.toLocaleString()}` : value.toString()}
                />
                <YAxis
                  type="category"
                  dataKey={nameKey}
                  className="text-xs fill-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                {isPerformance && <ReferenceLine x={0} stroke="hsl(var(--border))" />}
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(222 47% 11%)',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                  }}
                  labelStyle={{ color: 'hsl(0 0% 98%)', fontWeight: 600, marginBottom: '4px' }}
                  itemStyle={{ color: 'hsl(0 0% 90%)' }}
                  formatter={(value: number, name: string, props: any) => {
                    const formattedValue = isPerformance ? formatCurrency(value) : value;
                    const label = isPerformance ? 'P/L' : 'Trades';
                    const color = isPerformance 
                      ? value >= 0 ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)'
                      : 'hsl(0 0% 90%)';
                    return [
                      <span style={{ color, fontWeight: 600 }}>{formattedValue}</span>,
                      label
                    ];
                  }}
                />
                <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={isPerformance
                        ? entry.value >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'
                        : 'hsl(var(--profit))'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BarChart3 className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">No data available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DayTimesSection({ trades }: DayTimesSectionProps) {
  const [hourTimeframe, setHourTimeframe] = useState<TimeframeOption>('1h');

  const closedTrades = useMemo(
    () => trades.filter(t => t.exit_datetime !== null && t.exit_price !== null),
    [trades]
  );

  // Day of Week data
  const dayOfWeekData = useMemo(() => {
    const grouped = new Map<number, { trades: number; pnl: number }>();
    
    // Initialize all weekdays
    WEEKDAY_ORDER.forEach(day => {
      grouped.set(day, { trades: 0, pnl: 0 });
    });

    closedTrades.forEach(trade => {
      const entryDate = new Date(trade.entry_datetime);
      const dayIndex = getDay(entryDate);
      
      // Only include weekdays (Mon-Fri)
      if (WEEKDAY_ORDER.includes(dayIndex)) {
        const metrics = calculateTradeMetrics(trade);
        const existing = grouped.get(dayIndex)!;
        existing.trades += 1;
        existing.pnl += metrics.grossPnL;
      }
    });

    return WEEKDAY_ORDER.map(dayIndex => ({
      name: DAY_NAMES[dayIndex],
      value: grouped.get(dayIndex)?.trades || 0,
      pnl: grouped.get(dayIndex)?.pnl || 0,
    }));
  }, [closedTrades]);

  // Hour of Day data
  const hourOfDayData = useMemo(() => {
    const is30Min = hourTimeframe === '30m';
    const grouped = new Map<string, { trades: number; pnl: number }>();

    closedTrades.forEach(trade => {
      const entryDate = new Date(trade.entry_datetime);
      const hour = getHours(entryDate);
      const minutes = entryDate.getMinutes();
      
      let key: string;
      if (is30Min) {
        const halfHour = minutes < 30 ? '00' : '30';
        key = `${hour.toString().padStart(2, '0')}:${halfHour}`;
      } else {
        key = `${hour.toString().padStart(2, '0')}:00`;
      }

      const metrics = calculateTradeMetrics(trade);
      const existing = grouped.get(key);
      if (existing) {
        existing.trades += 1;
        existing.pnl += metrics.grossPnL;
      } else {
        grouped.set(key, { trades: 1, pnl: metrics.grossPnL });
      }
    });

    // Generate all time slots and sort
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      if (is30Min) {
        slots.push(`${h.toString().padStart(2, '0')}:00`);
        slots.push(`${h.toString().padStart(2, '0')}:30`);
      } else {
        slots.push(`${h.toString().padStart(2, '0')}:00`);
      }
    }

    return slots
      .filter(slot => grouped.has(slot))
      .map(slot => ({
        name: slot,
        value: grouped.get(slot)?.trades || 0,
        pnl: grouped.get(slot)?.pnl || 0,
      }));
  }, [closedTrades, hourTimeframe]);

  // Month of Year data
  const monthOfYearData = useMemo(() => {
    const grouped = new Map<number, { trades: number; pnl: number }>();
    
    // Initialize all months
    for (let i = 0; i < 12; i++) {
      grouped.set(i, { trades: 0, pnl: 0 });
    }

    closedTrades.forEach(trade => {
      const exitDate = new Date(trade.exit_datetime!);
      const month = exitDate.getMonth();
      const metrics = calculateTradeMetrics(trade);
      
      const existing = grouped.get(month)!;
      existing.trades += 1;
      existing.pnl += metrics.grossPnL;
    });

    return Array.from({ length: 12 }, (_, i) => ({
      name: MONTH_NAMES[i],
      value: grouped.get(i)?.trades || 0,
      pnl: grouped.get(i)?.pnl || 0,
    }));
  }, [closedTrades]);

  // Intraday Duration data
  const durationData = useMemo(() => {
    const grouped = new Map<string, { trades: number; pnl: number }>();
    
    // Initialize all buckets
    DURATION_BUCKETS.forEach(bucket => {
      grouped.set(bucket.label, { trades: 0, pnl: 0 });
    });

    closedTrades.forEach(trade => {
      const entryDate = new Date(trade.entry_datetime);
      const exitDate = new Date(trade.exit_datetime!);
      const durationMinutes = (exitDate.getTime() - entryDate.getTime()) / (1000 * 60);
      
      // Find the appropriate bucket
      let bucketLabel = DURATION_BUCKETS[DURATION_BUCKETS.length - 1].label;
      for (const bucket of DURATION_BUCKETS) {
        if (durationMinutes < bucket.maxMinutes) {
          bucketLabel = bucket.label;
          break;
        }
      }

      const metrics = calculateTradeMetrics(trade);
      const existing = grouped.get(bucketLabel)!;
      existing.trades += 1;
      existing.pnl += metrics.grossPnL;
    });

    return DURATION_BUCKETS.map(bucket => ({
      name: bucket.label,
      value: grouped.get(bucket.label)?.trades || 0,
      pnl: grouped.get(bucket.label)?.pnl || 0,
    }));
  }, [closedTrades]);

  return (
    <div className="space-y-8">
      {/* By Day of Week */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Day of Week</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBarChart
            data={dayOfWeekData}
            dataKey="value"
            nameKey="name"
            title="Trade Distribution by Day of Week"
            description="Number of trades per weekday"
            height={250}
          />
          <HorizontalBarChart
            data={dayOfWeekData.map(d => ({ name: d.name, value: d.pnl }))}
            dataKey="value"
            nameKey="name"
            title="Performance by Day of Week"
            description="P/L per weekday"
            isPerformance
            height={250}
          />
        </div>
      </div>

      {/* By Hour of Day */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">By Hour of Day</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Timeframe:</span>
            <Select value={hourTimeframe} onValueChange={(v) => setHourTimeframe(v as TimeframeOption)}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="30m">30 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBarChart
            data={hourOfDayData}
            dataKey="value"
            nameKey="name"
            title="Trade Distribution by Hour of Day"
            description="Number of trades per hour"
            height={Math.max(300, hourOfDayData.length * 25)}
          />
          <HorizontalBarChart
            data={hourOfDayData.map(d => ({ name: d.name, value: d.pnl }))}
            dataKey="value"
            nameKey="name"
            title="Performance by Hour of Day"
            description="P/L per hour"
            isPerformance
            height={Math.max(300, hourOfDayData.length * 25)}
          />
        </div>
      </div>

      {/* By Month of Year */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Month of Year</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBarChart
            data={monthOfYearData}
            dataKey="value"
            nameKey="name"
            title="Trade Distribution by Month of Year"
            description="Number of trades per month"
            height={400}
          />
          <HorizontalBarChart
            data={monthOfYearData.map(d => ({ name: d.name, value: d.pnl }))}
            dataKey="value"
            nameKey="name"
            title="Performance by Month of Year"
            description="P/L per month"
            isPerformance
            height={400}
          />
        </div>
      </div>

      {/* By Intraday Duration */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Intraday Duration</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBarChart
            data={durationData}
            dataKey="value"
            nameKey="name"
            title="Trade Distribution by Intraday Duration"
            description="Number of trades per duration bucket"
            height={350}
          />
          <HorizontalBarChart
            data={durationData.map(d => ({ name: d.name, value: d.pnl }))}
            dataKey="value"
            nameKey="name"
            title="Performance by Intraday Duration"
            description="P/L per duration bucket"
            isPerformance
            height={350}
          />
        </div>
      </div>
    </div>
  );
}
