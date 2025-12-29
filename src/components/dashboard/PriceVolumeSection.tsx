import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface PriceVolumeSectionProps {
  trades: Trade[];
}

const PRICE_BUCKETS = [
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

const PRICE_RANGE_BUCKETS = [
  { label: '$0.00 - $0.09', min: 0, max: 0.1 },
  { label: '$0.10 - $0.24', min: 0.1, max: 0.25 },
  { label: '$0.25 - $0.49', min: 0.25, max: 0.5 },
  { label: '$0.50 - $0.99', min: 0.5, max: 1 },
  { label: '$1 - $4.99', min: 1, max: 5 },
  { label: '$5 - $9.99', min: 5, max: 10 },
  { label: '$10 - $24.99', min: 10, max: 25 },
  { label: '$25 >', min: 25, max: Infinity },
];

// Chart component for horizontal bar charts
function HorizontalBarChart({
  data,
  dataKey,
  nameKey,
  title,
  isPerformance = false,
  height = 300,
}: {
  data: { name: string; value: number }[];
  dataKey: string;
  nameKey: string;
  title: string;
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
                  width={100}
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

export function PriceVolumeSection({ trades }: PriceVolumeSectionProps) {
  const closedTrades = useMemo(
    () => trades.filter(t => t.exit_datetime !== null && t.exit_price !== null),
    [trades]
  );

  // By Trade Price data (using entry_price)
  const tradePriceData = useMemo(() => {
    const grouped = new Map<string, { trades: number; pnl: number }>();
    
    // Initialize all buckets
    PRICE_BUCKETS.forEach(bucket => {
      grouped.set(bucket.label, { trades: 0, pnl: 0 });
    });

    closedTrades.forEach(trade => {
      const price = trade.entry_price;
      
      // Find the appropriate bucket
      let bucketLabel = PRICE_BUCKETS[PRICE_BUCKETS.length - 1].label;
      for (const bucket of PRICE_BUCKETS) {
        if (price >= bucket.min && price < bucket.max) {
          bucketLabel = bucket.label;
          break;
        }
      }

      const metrics = calculateTradeMetrics(trade);
      const existing = grouped.get(bucketLabel)!;
      existing.trades += 1;
      existing.pnl += metrics.grossPnL;
    });

    return PRICE_BUCKETS.map(bucket => ({
      name: bucket.label,
      value: grouped.get(bucket.label)?.trades || 0,
      pnl: grouped.get(bucket.label)?.pnl || 0,
    }));
  }, [closedTrades]);

  // By In-Trade Price Range data (difference between high/low or entry/exit)
  const priceRangeData = useMemo(() => {
    const grouped = new Map<string, { trades: number; pnl: number }>();
    
    // Initialize all buckets
    PRICE_RANGE_BUCKETS.forEach(bucket => {
      grouped.set(bucket.label, { trades: 0, pnl: 0 });
    });

    closedTrades.forEach(trade => {
      // Calculate price range as the absolute difference between entry and exit prices
      const priceRange = Math.abs(trade.exit_price! - trade.entry_price);
      
      // Find the appropriate bucket
      let bucketLabel = PRICE_RANGE_BUCKETS[PRICE_RANGE_BUCKETS.length - 1].label;
      for (const bucket of PRICE_RANGE_BUCKETS) {
        if (priceRange >= bucket.min && priceRange < bucket.max) {
          bucketLabel = bucket.label;
          break;
        }
      }

      const metrics = calculateTradeMetrics(trade);
      const existing = grouped.get(bucketLabel)!;
      existing.trades += 1;
      existing.pnl += metrics.grossPnL;
    });

    return PRICE_RANGE_BUCKETS.map(bucket => ({
      name: bucket.label,
      value: grouped.get(bucket.label)?.trades || 0,
      pnl: grouped.get(bucket.label)?.pnl || 0,
    }));
  }, [closedTrades]);

  return (
    <div className="space-y-8">
      {/* By Trade Price */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Trade Price</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBarChart
            data={tradePriceData}
            dataKey="value"
            nameKey="name"
            title="Trade Distribution by Price"
            height={350}
          />
          <HorizontalBarChart
            data={tradePriceData.map(d => ({ name: d.name, value: d.pnl }))}
            dataKey="value"
            nameKey="name"
            title="Performance by Price"
            isPerformance
            height={350}
          />
        </div>
      </div>

      {/* By In-Trade Price Range */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By In-Trade Price Range</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBarChart
            data={priceRangeData}
            dataKey="value"
            nameKey="name"
            title="Trade Distribution by In-Trade Price Range"
            height={300}
          />
          <HorizontalBarChart
            data={priceRangeData.map(d => ({ name: d.name, value: d.pnl }))}
            dataKey="value"
            nameKey="name"
            title="Performance by In-Trade Price Range"
            isPerformance
            height={300}
          />
        </div>
      </div>
    </div>
  );
}
