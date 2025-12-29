import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trade } from '@/types/trade';
import { calculateTradeMetrics, formatCurrency } from '@/lib/calculations';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';

interface WinLoseExpectationSectionProps {
  trades: Trade[];
}

export function WinLoseExpectationSection({ trades }: WinLoseExpectationSectionProps) {
  // Get closed trades only
  const closedTrades = trades.filter(t => t.exit_datetime !== null);

  // Calculate win/loss stats
  const winLossStats = (() => {
    let wins = 0;
    let losses = 0;
    let totalGain = 0;
    let totalLoss = 0;

    closedTrades.forEach(trade => {
      const metrics = calculateTradeMetrics(trade);
      if (metrics.grossPnL > 0) {
        wins++;
        totalGain += metrics.grossPnL;
      } else if (metrics.grossPnL < 0) {
        losses++;
        totalLoss += Math.abs(metrics.grossPnL);
      }
    });

    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const lossRate = total > 0 ? (losses / total) * 100 : 0;
    const avgWin = wins > 0 ? totalGain / wins : 0;
    const avgLoss = losses > 0 ? totalLoss / losses : 0;
    const expectancy = total > 0 ? ((winRate / 100) * avgWin) - ((lossRate / 100) * avgLoss) : 0;

    return {
      wins,
      losses,
      winRate,
      lossRate,
      totalGain,
      totalLoss,
      avgWin,
      avgLoss,
      expectancy,
    };
  })();

  // Pie chart data
  const winLossRatioData = [
    { name: 'Winning', value: winLossStats.winRate, color: 'hsl(var(--profit))' },
    { name: 'Losing', value: winLossStats.lossRate, color: 'hsl(var(--loss))' },
  ].filter(d => d.value > 0);

  // Horizontal bar chart data for Win/Loss P&L Comparison
  const winLossPnLData = [
    { name: 'Gain', value: winLossStats.totalGain, fill: 'hsl(var(--profit))' },
    { name: 'Loss', value: -winLossStats.totalLoss, fill: 'hsl(var(--loss))' },
  ];

  // Trade Expectation data
  const expectationData = [
    { 
      name: 'Expectation', 
      value: winLossStats.expectancy,
      fill: winLossStats.expectancy >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'
    }
  ];

  // Cumulative P&L data
  const cumulativePnLData = (() => {
    if (closedTrades.length === 0) return [];

    const sorted = [...closedTrades].sort(
      (a, b) => new Date(a.exit_datetime!).getTime() - new Date(b.exit_datetime!).getTime()
    );

    let cumulative = 0;
    return sorted.map(trade => {
      const metrics = calculateTradeMetrics(trade);
      cumulative += metrics.grossPnL;
      return {
        date: trade.exit_datetime!,
        cumulative,
        pnl: metrics.grossPnL,
      };
    });
  })();

  // Cumulative Drawdown data
  const cumulativeDrawdownData = (() => {
    if (closedTrades.length === 0) return [];

    const sorted = [...closedTrades].sort(
      (a, b) => new Date(a.exit_datetime!).getTime() - new Date(b.exit_datetime!).getTime()
    );

    let equity = 0;
    let peak = 0;
    
    return sorted.map(trade => {
      const metrics = calculateTradeMetrics(trade);
      equity += metrics.grossPnL;
      peak = Math.max(peak, equity);
      const drawdown = equity - peak; // Will be 0 or negative
      
      return {
        date: trade.exit_datetime!,
        drawdown,
        equity,
        peak,
      };
    });
  })();

  const hasData = closedTrades.length > 0;

  // Custom label for pie chart
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-sm font-semibold"
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      {/* Win/Loss Ratio and Win/Loss P&L Comparison */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Win/Loss Ratio - Donut Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base uppercase tracking-wide">Win/Loss Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            {hasData && winLossRatioData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossRatioData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={120}
                      dataKey="value"
                      labelLine={false}
                      label={renderCustomLabel}
                    >
                      {winLossRatioData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Percentage']}
                    />
                    <Legend 
                      verticalAlign="bottom"
                      formatter={(value) => <span className="text-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Win/Loss P&L Comparison - Horizontal Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base uppercase tracking-wide">Win/Loss P&L Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={winLossPnLData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={true} vertical={true} />
                    <XAxis 
                      type="number"
                      className="text-xs fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                      domain={['dataMin', 'dataMax']}
                    />
                    <YAxis 
                      type="category"
                      dataKey="name"
                      className="text-xs fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [formatCurrency(Math.abs(value)), 'P&L']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {winLossPnLData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trade Expectation and Cumulative P&L */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trade Expectation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base uppercase tracking-wide">Trade Expectation</CardTitle>
            <CardDescription>
              Expectancy = (Win% × Avg Win) − (Loss% × Avg Loss)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expectationData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis 
                      type="number"
                      className="text-xs fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                      domain={winLossStats.expectancy >= 0 ? [0, 'dataMax'] : ['dataMin', 0]}
                    />
                    <YAxis 
                      type="category"
                      dataKey="name"
                      className="text-xs fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Expectancy per Trade']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {expectationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cumulative P&L */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base uppercase tracking-wide">Cumulative P&L</CardTitle>
          </CardHeader>
          <CardContent>
            {cumulativePnLData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativePnLData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis
                      dataKey="date"
                      className="text-xs fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => format(new Date(value), 'yyyy-MM-dd')}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      className="text-xs fill-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                      formatter={(value: number) => [formatCurrency(value), 'Cumulative P&L']}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulative"
                      stroke="hsl(var(--profit))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cumulative Drawdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wide">Cumulative Drawdown</CardTitle>
          <CardDescription>Drawdown from equity peaks over time</CardDescription>
        </CardHeader>
        <CardContent>
          {cumulativeDrawdownData.length > 0 ? (
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeDrawdownData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="date"
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => format(new Date(value), 'yyyy-MM-dd')}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCurrency(value)}
                    domain={['dataMin', 0]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                    formatter={(value: number, name: string) => {
                      if (name === 'drawdown') return [formatCurrency(value), 'Drawdown'];
                      return [formatCurrency(value), name];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="drawdown"
                    stroke="hsl(var(--loss))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
