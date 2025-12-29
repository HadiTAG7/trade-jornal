import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface WinLosingDaysPriceVolumeSectionProps {
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

// Price buckets
const priceBuckets = [
  { label: '< $2.00', min: 0, max: 2 },
  { label: '$2 - $4.99', min: 2, max: 5 },
  { label: '$5 - $9.99', min: 5, max: 10 },
  { label: '$10 - $19.99', min: 10, max: 20 },
  { label: '$20 - $49.99', min: 20, max: 50 },
  { label: '$50 - $99.99', min: 50, max: 100 },
  { label: '$100 - $199.99', min: 100, max: 200 },
  { label: '$200 - $499.99', min: 200, max: 500 },
  { label: '$500 - $999.99', min: 500, max: 1000 },
  { label: '$1000 >', min: 1000, max: Infinity },
];

// Volume buckets
const volumeBuckets = [
  { label: '2 - 4', min: 2, max: 5 },
  { label: '5 - 9', min: 5, max: 10 },
  { label: '10 - 19', min: 10, max: 20 },
  { label: '20 - 49', min: 20, max: 50 },
  { label: '50 - 99', min: 50, max: 100 },
  { label: '100 - 500', min: 100, max: 501 },
  { label: '500 - 999', min: 500, max: 1000 },
  { label: '1,000 - 1,999', min: 1000, max: 2000 },
  { label: '2,000 - 2,999', min: 2000, max: 3000 },
  { label: '3,000 - 4,999', min: 3000, max: 5000 },
  { label: '5,000 - 9,999', min: 5000, max: 10000 },
  { label: '10,000 - 19,999', min: 10000, max: 20000 },
  { label: '20,000 >', min: 20000, max: Infinity },
];

// In-trade price range buckets
const priceRangeBuckets = [
  { label: '$0.00 - $0.09', min: 0, max: 0.1 },
  { label: '$0.10 - $0.24', min: 0.1, max: 0.25 },
  { label: '$0.25 - $0.49', min: 0.25, max: 0.5 },
  { label: '$0.50 - $0.99', min: 0.5, max: 1 },
  { label: '$1 - $4.99', min: 1, max: 5 },
  { label: '$5 - $9.99', min: 5, max: 10 },
  { label: '$10 - $24.99', min: 10, max: 25 },
];

function calculatePriceData(winningDayTrades: Trade[], losingDayTrades: Trade[]) {
  const data = priceBuckets.map(bucket => ({
    price: bucket.label,
    winningCount: 0,
    losingCount: 0,
    winningPnL: 0,
    losingPnL: 0,
  }));

  const findBucketIndex = (price: number) => 
    priceBuckets.findIndex(b => price >= b.min && price < b.max);

  winningDayTrades.forEach(trade => {
    const price = Number(trade.entry_price);
    const bucketIndex = findBucketIndex(price);
    if (bucketIndex !== -1) {
      const metrics = calculateTradeMetrics(trade);
      data[bucketIndex].winningCount++;
      data[bucketIndex].winningPnL += metrics.netPnL;
    }
  });

  losingDayTrades.forEach(trade => {
    const price = Number(trade.entry_price);
    const bucketIndex = findBucketIndex(price);
    if (bucketIndex !== -1) {
      const metrics = calculateTradeMetrics(trade);
      data[bucketIndex].losingCount++;
      data[bucketIndex].losingPnL += metrics.netPnL;
    }
  });

  return data;
}

function calculateVolumeData(winningDayTrades: Trade[], losingDayTrades: Trade[]) {
  const data = volumeBuckets.map(bucket => ({
    volume: bucket.label,
    winningCount: 0,
    losingCount: 0,
    winningPnL: 0,
    losingPnL: 0,
  }));

  const findBucketIndex = (volume: number) => 
    volumeBuckets.findIndex(b => volume >= b.min && volume < b.max);

  winningDayTrades.forEach(trade => {
    const volume = Number(trade.quantity);
    const bucketIndex = findBucketIndex(volume);
    if (bucketIndex !== -1) {
      const metrics = calculateTradeMetrics(trade);
      data[bucketIndex].winningCount++;
      data[bucketIndex].winningPnL += metrics.netPnL;
    }
  });

  losingDayTrades.forEach(trade => {
    const volume = Number(trade.quantity);
    const bucketIndex = findBucketIndex(volume);
    if (bucketIndex !== -1) {
      const metrics = calculateTradeMetrics(trade);
      data[bucketIndex].losingCount++;
      data[bucketIndex].losingPnL += metrics.netPnL;
    }
  });

  return data;
}

function calculatePriceRangeData(winningDayTrades: Trade[], losingDayTrades: Trade[]) {
  const data = priceRangeBuckets.map(bucket => ({
    range: bucket.label,
    winningCount: 0,
    losingCount: 0,
    winningPnL: 0,
    losingPnL: 0,
  }));

  const findBucketIndex = (range: number) => 
    priceRangeBuckets.findIndex(b => range >= b.min && range < b.max);

  const getInTradeRange = (trade: Trade): number | null => {
    if (!trade.exit_price) return null;
    return Math.abs(Number(trade.exit_price) - Number(trade.entry_price));
  };

  winningDayTrades.forEach(trade => {
    const range = getInTradeRange(trade);
    if (range === null) return;
    const bucketIndex = findBucketIndex(range);
    if (bucketIndex !== -1) {
      const metrics = calculateTradeMetrics(trade);
      data[bucketIndex].winningCount++;
      data[bucketIndex].winningPnL += metrics.netPnL;
    }
  });

  losingDayTrades.forEach(trade => {
    const range = getInTradeRange(trade);
    if (range === null) return;
    const bucketIndex = findBucketIndex(range);
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
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={data} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
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
                  width={70}
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
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No trade data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WinLosingDaysPriceVolumeSection({ trades }: WinLosingDaysPriceVolumeSectionProps) {
  const { winningDayTrades, losingDayTrades } = useMemo(
    () => groupTradesByDayType(trades),
    [trades]
  );

  const priceData = useMemo(
    () => calculatePriceData(winningDayTrades, losingDayTrades),
    [winningDayTrades, losingDayTrades]
  );

  const volumeData = useMemo(
    () => calculateVolumeData(winningDayTrades, losingDayTrades),
    [winningDayTrades, losingDayTrades]
  );

  const priceRangeData = useMemo(
    () => calculatePriceRangeData(winningDayTrades, losingDayTrades),
    [winningDayTrades, losingDayTrades]
  );

  return (
    <div className="space-y-8">
      {/* By Trade Price */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ComparisonBarChart
          title="Trade Distribution by Price"
          data={priceData}
          xKey="price"
          winningKey="winningCount"
          losingKey="losingCount"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
        />
        <ComparisonBarChart
          title="Performance by Price"
          data={priceData}
          xKey="price"
          winningKey="winningPnL"
          losingKey="losingPnL"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
          isPerformance
        />
      </div>

      {/* By Volume Traded */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ComparisonBarChart
          title="Distribution by Volume Traded"
          data={volumeData}
          xKey="volume"
          winningKey="winningCount"
          losingKey="losingCount"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
        />
        <ComparisonBarChart
          title="Performance by Volume Traded"
          data={volumeData}
          xKey="volume"
          winningKey="winningPnL"
          losingKey="losingPnL"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
          isPerformance
        />
      </div>

      {/* By In-Trade Price Range */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ComparisonBarChart
          title="Trade Distribution by In-Trade Price Range"
          data={priceRangeData}
          xKey="range"
          winningKey="winningCount"
          losingKey="losingCount"
          winningLabel="Winning Days"
          losingLabel="Losing Days"
        />
        <ComparisonBarChart
          title="Performance by In-Trade Price Range"
          data={priceRangeData}
          xKey="range"
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
