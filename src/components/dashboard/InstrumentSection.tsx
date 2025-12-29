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

interface InstrumentSectionProps {
  trades: Trade[];
}

const VOLUME_BUCKETS = [
  { label: '0 - 49K', min: 0, max: 50000 },
  { label: '50K - 99K', min: 50000, max: 100000 },
  { label: '100K - 249K', min: 100000, max: 250000 },
  { label: '250K - 499K', min: 250000, max: 500000 },
  { label: '500K - 1M', min: 500000, max: 1000000 },
  { label: '1M - 2.49M', min: 1000000, max: 2500000 },
  { label: '2.5M - 4.9M', min: 2500000, max: 5000000 },
  { label: '5M - 9.9M', min: 5000000, max: 10000000 },
  { label: '10M - 24.9M', min: 10000000, max: 25000000 },
  { label: '25M >', min: 25000000, max: Infinity },
];

const RELATIVE_VOLUME_BUCKETS = [
  { label: '25% - 49%', min: 25, max: 50 },
  { label: '50% - 74%', min: 50, max: 75 },
  { label: '75% - 99%', min: 75, max: 100 },
  { label: '100% - 124%', min: 100, max: 125 },
  { label: '125% - 149%', min: 125, max: 150 },
  { label: '150% - 199%', min: 150, max: 200 },
  { label: '200% - 299%', min: 200, max: 300 },
  { label: '300% - 499%', min: 300, max: 500 },
  { label: '500% >', min: 500, max: Infinity },
];

const MOVEMENT_BUCKETS = [
  { label: 'less than -10%', min: -Infinity, max: -10 },
  { label: '-2% to -10%', min: -10, max: -2 },
  { label: '-1% to -2%', min: -2, max: -1 },
  { label: '0 to -1%', min: -1, max: 0 },
  { label: '0 to +1%', min: 0, max: 1 },
  { label: '+1% to +2%', min: 1, max: 2 },
  { label: '+2% to +10%', min: 2, max: 10 },
  { label: '> +10%', min: 10, max: Infinity },
];

const GAP_BUCKETS = [
  { label: 'less than -2%', min: -Infinity, max: -2 },
  { label: '-1% to -2%', min: -2, max: -1 },
  { label: '0 to -1%', min: -1, max: 0 },
  { label: '0 to +1%', min: 0, max: 1 },
  { label: '+1% to +2%', min: 1, max: 2 },
  { label: '> +2%', min: 2, max: Infinity },
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
                  width={80}
                />
                {isPerformance && <ReferenceLine x={0} stroke="hsl(var(--border))" />}
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number) => [
                    isPerformance ? formatCurrency(value) : value,
                    isPerformance ? 'P/L' : 'Trades'
                  ]}
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

// Empty bucket chart placeholder
function EmptyBucketChart({
  title,
  buckets,
  message = "Requires additional market data fields",
}: {
  title: string;
  buckets: { label: string }[];
  message?: string;
}) {
  const emptyData = buckets.map(b => ({ name: b.label, value: 0 }));
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <BarChart3 className="mx-auto h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">{message}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function InstrumentSection({ trades }: InstrumentSectionProps) {
  const closedTrades = useMemo(
    () => trades.filter(t => t.exit_datetime !== null && t.exit_price !== null),
    [trades]
  );

  // Performance by Symbol data
  const symbolPerformanceData = useMemo(() => {
    const grouped = new Map<string, number>();

    closedTrades.forEach(trade => {
      const metrics = calculateTradeMetrics(trade);
      const existing = grouped.get(trade.symbol) || 0;
      grouped.set(trade.symbol, existing + metrics.grossPnL);
    });

    const sorted = Array.from(grouped.entries())
      .map(([symbol, pnl]) => ({ name: symbol, value: pnl }))
      .sort((a, b) => b.value - a.value);

    return {
      top20: sorted.filter(s => s.value > 0).slice(0, 20),
      bottom20: sorted.filter(s => s.value < 0).slice(-20).reverse(),
    };
  }, [closedTrades]);

  // Placeholder data for instrument volume (requires market data)
  // The trade quantity is NOT the same as instrument/market volume
  // These charts will show "No data available" until market data is integrated

  return (
    <div className="space-y-8">
      {/* Performance by Symbol */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Performance by Symbol</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBarChart
            data={symbolPerformanceData.top20}
            dataKey="value"
            nameKey="name"
            title="Performance by Symbol - Top 20"
            isPerformance
            height={Math.max(300, symbolPerformanceData.top20.length * 28)}
          />
          <HorizontalBarChart
            data={symbolPerformanceData.bottom20}
            dataKey="value"
            nameKey="name"
            title="Performance by Symbol - Bottom 20"
            isPerformance
            height={Math.max(300, symbolPerformanceData.bottom20.length * 28)}
          />
        </div>
      </div>

      {/* By Instrument Volume */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Instrument Volume</h3>
        <p className="text-sm text-muted-foreground">Note: Requires instrument volume data to be added to trade records</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyBucketChart
            title="Distribution by Instrument Volume"
            buckets={VOLUME_BUCKETS}
          />
          <EmptyBucketChart
            title="Performance by Instrument Volume"
            buckets={VOLUME_BUCKETS}
          />
        </div>
      </div>

      {/* By Instrument Relative Volume */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Instrument Relative Volume (% of 50MA)</h3>
        <p className="text-sm text-muted-foreground">Note: Requires relative volume data to be added to trade records</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyBucketChart
            title="Distribution by Instrument Relative Volume (% of 50MA)"
            buckets={RELATIVE_VOLUME_BUCKETS}
          />
          <EmptyBucketChart
            title="Performance by Instrument Relative Volume (% of 50MA)"
            buckets={RELATIVE_VOLUME_BUCKETS}
          />
        </div>
      </div>

      {/* By Instrument Movement */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Instrument Movement</h3>
        <p className="text-sm text-muted-foreground">Note: Requires instrument movement data to be added to trade records</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyBucketChart
            title="Trade Distribution by Instrument Movement"
            buckets={MOVEMENT_BUCKETS}
          />
          <EmptyBucketChart
            title="Performance by Instrument Movement"
            buckets={MOVEMENT_BUCKETS}
          />
        </div>
      </div>

      {/* By Instrument Opening Gap */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">By Instrument Opening Gap</h3>
        <p className="text-sm text-muted-foreground">Note: Requires opening gap data to be added to trade records</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyBucketChart
            title="Trade Distribution by Instrument Opening Gap"
            buckets={GAP_BUCKETS}
          />
          <EmptyBucketChart
            title="Performance by Instrument Opening Gap"
            buckets={GAP_BUCKETS}
          />
        </div>
      </div>
    </div>
  );
}
