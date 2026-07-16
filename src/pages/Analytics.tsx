import { useEffect, useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchAll } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { Trade, AnalyticsData, Strategy } from '@/types/trade';
import { calculateAnalytics, calculateTradeMetrics, formatCurrency, formatPercent, formatR } from '@/lib/calculations';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, getDay, getHours, parseISO } from 'date-fns';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Analytics() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchTrades();
  }, [user]);

  const fetchTrades = async () => {
    if (!user) return;
    try {
      const [data, allStrategies] = await Promise.all([
        fetchAll<Trade>(user.id, 'trades', 'entry_datetime', 'asc'),
        fetchAll<Strategy>(user.id, 'strategies'),
      ]);
      const strategiesById = Object.fromEntries(allStrategies.map(s => [s.id, s]));

      const typedTrades = data.map(t => ({
        ...t,
        entry_price: Number(t.entry_price),
        exit_price: t.exit_price ? Number(t.exit_price) : null,
        quantity: Number(t.quantity),
        fees: Number(t.fees) || 0,
        commissions: Number(t.commissions) || 0,
        stop_loss: t.stop_loss ? Number(t.stop_loss) : null,
        strategy: t.strategy_id ? strategiesById[t.strategy_id] : undefined,
      })) as Trade[];

      setTrades(typedTrades);
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => calculateAnalytics(trades), [trades]);
  const closedTrades = useMemo(() => trades.filter(t => t.exit_price !== null), [trades]);

  // Equity curve
  const equityCurve = useMemo(() => {
    let equity = 0;
    return closedTrades.map(trade => {
      const metrics = calculateTradeMetrics(trade);
      equity += metrics.netPnL;
      return {
        date: format(parseISO(trade.exit_datetime!), 'MMM d'),
        equity,
        pnl: metrics.netPnL,
      };
    });
  }, [closedTrades]);

  // Drawdown curve
  const drawdownCurve = useMemo(() => {
    let equity = 0;
    let peak = 0;
    return closedTrades.map(trade => {
      const metrics = calculateTradeMetrics(trade);
      equity += metrics.netPnL;
      if (equity > peak) peak = equity;
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      return {
        date: format(parseISO(trade.exit_datetime!), 'MMM d'),
        drawdown,
      };
    });
  }, [closedTrades]);

  // R distribution
  const rDistribution = useMemo(() => {
    const buckets: { [key: string]: number } = {};
    closedTrades.forEach(trade => {
      const metrics = calculateTradeMetrics(trade);
      if (metrics.realizedR !== null) {
        const bucket = Math.floor(metrics.realizedR);
        const key = bucket >= 0 ? `+${bucket}R` : `${bucket}R`;
        buckets[key] = (buckets[key] || 0) + 1;
      }
    });
    return Object.entries(buckets)
      .map(([r, count]) => ({ r, count }))
      .sort((a, b) => parseFloat(a.r) - parseFloat(b.r));
  }, [closedTrades]);

  // Day of week performance
  const dayOfWeekPerf = useMemo(() => {
    const dayStats = DAY_NAMES.map(name => ({ name, pnl: 0, trades: 0 }));
    closedTrades.forEach(trade => {
      const day = getDay(parseISO(trade.exit_datetime!));
      const metrics = calculateTradeMetrics(trade);
      dayStats[day].pnl += metrics.netPnL;
      dayStats[day].trades += 1;
    });
    return dayStats;
  }, [closedTrades]);

  // Time of day performance
  const timeOfDayPerf = useMemo(() => {
    const hourStats: { [key: number]: { pnl: number; trades: number } } = {};
    closedTrades.forEach(trade => {
      const hour = getHours(parseISO(trade.entry_datetime));
      if (!hourStats[hour]) hourStats[hour] = { pnl: 0, trades: 0 };
      const metrics = calculateTradeMetrics(trade);
      hourStats[hour].pnl += metrics.netPnL;
      hourStats[hour].trades += 1;
    });
    return Object.entries(hourStats)
      .map(([hour, data]) => ({
        hour: `${hour}:00`,
        ...data,
      }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  }, [closedTrades]);

  // Long vs Short
  const sidePerf = useMemo(() => {
    const longTrades = closedTrades.filter(t => t.side === 'LONG');
    const shortTrades = closedTrades.filter(t => t.side === 'SHORT');
    
    const longPnL = longTrades.reduce((sum, t) => sum + calculateTradeMetrics(t).netPnL, 0);
    const shortPnL = shortTrades.reduce((sum, t) => sum + calculateTradeMetrics(t).netPnL, 0);
    
    return [
      { name: 'Long', value: longTrades.length, pnl: longPnL },
      { name: 'Short', value: shortTrades.length, pnl: shortPnL },
    ];
  }, [closedTrades]);

  // Strategy performance
  const strategyPerf = useMemo(() => {
    const stratStats: { [key: string]: { pnl: number; trades: number; wins: number } } = {};
    closedTrades.forEach(trade => {
      const name = trade.strategy?.name || 'No Strategy';
      if (!stratStats[name]) stratStats[name] = { pnl: 0, trades: 0, wins: 0 };
      const metrics = calculateTradeMetrics(trade);
      stratStats[name].pnl += metrics.netPnL;
      stratStats[name].trades += 1;
      if (metrics.netPnL > 0) stratStats[name].wins += 1;
    });
    return Object.entries(stratStats)
      .map(([name, data]) => ({
        name,
        ...data,
        winRate: (data.wins / data.trades) * 100,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [closedTrades]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-muted-foreground">Loading analytics...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Deep dive into your trading performance</p>
        </div>

        {/* KPI Summary */}
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Card className="md:col-span-2">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Net P/L</p>
                <p className={`text-3xl font-bold font-mono ${analytics.totalNetPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatCurrency(analytics.totalNetPnL)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold font-mono">{formatPercent(analytics.winRate)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Avg R</p>
                <p className={`text-2xl font-bold font-mono ${analytics.avgR >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatR(analytics.avgR)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Profit Factor</p>
                <p className="text-2xl font-bold font-mono">
                  {analytics.profitFactor === Infinity ? '∞' : analytics.profitFactor.toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Expectancy</p>
                <p className={`text-2xl font-bold font-mono ${analytics.expectancy >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatCurrency(analytics.expectancy)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="curves" className="space-y-6">
          <TabsList>
            <TabsTrigger value="curves">Equity & Drawdown</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="time">Time Analysis</TabsTrigger>
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          </TabsList>

          <TabsContent value="curves" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Equity Curve</CardTitle>
                  <CardDescription>Cumulative P/L over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                        <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [formatCurrency(value), 'Equity']}
                        />
                        <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="url(#colorEquity)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Drawdown</CardTitle>
                  <CardDescription>Peak-to-trough decline percentage</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={drawdownCurve}>
                        <defs>
                          <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--loss))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--loss))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                        <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => `${v}%`} reversed />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Drawdown']}
                        />
                        <Area type="monotone" dataKey="drawdown" stroke="hsl(var(--loss))" fill="url(#colorDrawdown)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="distribution" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>R Distribution</CardTitle>
                  <CardDescription>Histogram of realized R values</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rDistribution}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis dataKey="r" className="text-xs fill-muted-foreground" />
                        <YAxis className="text-xs fill-muted-foreground" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Long vs Short</CardTitle>
                  <CardDescription>Trade count and P/L by direction</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sidePerf}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          <Cell fill="hsl(var(--long))" />
                          <Cell fill="hsl(var(--short))" />
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number, name: string, props: any) => [
                            `${value} trades, ${formatCurrency(props.payload.pnl)}`,
                            name,
                          ]}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="time" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Day of Week</CardTitle>
                  <CardDescription>P/L by day of week</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dayOfWeekPerf}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                        <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [formatCurrency(value), 'P/L']}
                        />
                        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                          {dayOfWeekPerf.map((entry, index) => (
                            <Cell key={index} fill={entry.pnl >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Time of Day</CardTitle>
                  <CardDescription>P/L by entry hour</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeOfDayPerf}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis dataKey="hour" className="text-xs fill-muted-foreground" />
                        <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [formatCurrency(value), 'P/L']}
                        />
                        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                          {timeOfDayPerf.map((entry, index) => (
                            <Cell key={index} fill={entry.pnl >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Strategy Performance</CardTitle>
                <CardDescription>Breakdown by trading strategy</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 font-medium">Strategy</th>
                        <th className="text-right py-3 font-medium">Trades</th>
                        <th className="text-right py-3 font-medium">Win Rate</th>
                        <th className="text-right py-3 font-medium">Net P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strategyPerf.map((strat) => (
                        <tr key={strat.name} className="border-b border-border/50">
                          <td className="py-3 font-medium">{strat.name}</td>
                          <td className="text-right py-3 font-mono">{strat.trades}</td>
                          <td className="text-right py-3 font-mono">{formatPercent(strat.winRate)}</td>
                          <td className={`text-right py-3 font-mono ${strat.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {formatCurrency(strat.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
