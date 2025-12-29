import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  BarChart3, 
  ArrowRight,
  Activity
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { KPICard } from '@/components/ui/kpi-card';
import { TradeBadge, PnLBadge } from '@/components/ui/trade-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TradeFiltersComponent } from '@/components/TradeFilters';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTradeFilters } from '@/hooks/useTradeFilters';
import { Trade, AnalyticsData, Strategy } from '@/types/trade';
import { calculateAnalytics, calculateTradeMetrics, formatCurrency, formatPercent, formatR } from '@/lib/calculations';
import { 
  AreaChart, 
  Area, 
  BarChart,
  Bar,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Helper to get trades link with current filters
const getTradesLink = (searchParams: URLSearchParams) => {
  const params = searchParams.toString();
  return params ? `/trades?${params}` : '/trades';
};

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeGranularity, setTimeGranularity] = useState<'year' | 'month' | 'day'>('year');
  
  const { filters, setFilter, setDatePreset, clearDateFilters, filterTrades, hasActiveFilters } = useTradeFilters();

  useEffect(() => {
    if (user) {
      Promise.all([fetchTrades(), fetchStrategies()]);
    }
  }, [user]);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*, strategies(*)')
        .eq('user_id', user?.id)
        .order('entry_datetime', { ascending: false });

      if (error) throw error;
      
      const typedTrades = (data || []).map(t => ({
        ...t,
        entry_price: Number(t.entry_price),
        exit_price: t.exit_price ? Number(t.exit_price) : null,
        quantity: Number(t.quantity),
        fees: Number(t.fees) || 0,
        commissions: Number(t.commissions) || 0,
        stop_loss: t.stop_loss ? Number(t.stop_loss) : null,
        planned_risk_override: t.planned_risk_override ? Number(t.planned_risk_override) : null,
        planned_r_override: t.planned_r_override ? Number(t.planned_r_override) : null,
        mae: t.mae ? Number(t.mae) : null,
        mfe: t.mfe ? Number(t.mfe) : null,
        strategy: t.strategies,
      })) as Trade[];
      
      setTrades(typedTrades);
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStrategies = async () => {
    const { data } = await supabase
      .from('strategies')
      .select('*')
      .eq('user_id', user?.id);
    setStrategies(data || []);
  };

  // Apply filters to trades and recalculate analytics
  const filteredTrades = filterTrades(trades);
  
  useEffect(() => {
    setAnalytics(calculateAnalytics(filteredTrades));
  }, [filteredTrades]);

  // Generate equity curve data from filtered trades (Net P/L)
  const equityCurveData = (() => {
    const closedTrades = filteredTrades.filter(t => t.exit_datetime !== null);
    if (closedTrades.length === 0) return [];

    const sorted = [...closedTrades].sort(
      (a, b) => new Date(a.exit_datetime!).getTime() - new Date(b.exit_datetime!).getTime()
    );

    let equity = 0;
    return sorted.map(trade => {
      const metrics = calculateTradeMetrics(trade);
      equity += metrics.netPnL;
      return {
        date: format(new Date(trade.exit_datetime!), 'MMM d'),
        fullDate: trade.exit_datetime!,
        equity,
        pnl: metrics.netPnL,
      };
    });
  })();

  // Generate Gross Cumulative P/L chart data (uses filters)
  const grossCumulativePnLData = (() => {
    const closedTrades = filteredTrades.filter(t => t.exit_datetime !== null);
    if (closedTrades.length === 0) return [];

    const sorted = [...closedTrades].sort(
      (a, b) => new Date(a.exit_datetime!).getTime() - new Date(b.exit_datetime!).getTime()
    );

    // Group by date for cleaner chart
    const dailyData = new Map<string, { grossPnL: number; date: Date }>();
    
    sorted.forEach(trade => {
      const dateKey = format(new Date(trade.exit_datetime!), 'yyyy-MM-dd');
      const metrics = calculateTradeMetrics(trade);
      const existing = dailyData.get(dateKey);
      if (existing) {
        existing.grossPnL += metrics.grossPnL;
      } else {
        dailyData.set(dateKey, { grossPnL: metrics.grossPnL, date: new Date(trade.exit_datetime!) });
      }
    });

    // Convert to cumulative
    let cumulative = 0;
    const result: { date: string; cumulative: number; dailyPnL: number }[] = [];
    
    Array.from(dailyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([dateKey, data]) => {
        cumulative += data.grossPnL;
        result.push({
          date: format(data.date, 'yyyy-MM-dd'),
          cumulative,
          dailyPnL: data.grossPnL,
        });
      });

    return result;
  })();

  // Determine chart title based on filter state
  const getGrossChartTitle = () => {
    if (!hasActiveFilters) {
      return 'Gross Cumulative P&L (All Time)';
    }
    if (filters.dateFrom && filters.dateTo) {
      return `Gross Cumulative P&L (${format(new Date(filters.dateFrom), 'MMM d, yyyy')} - ${format(new Date(filters.dateTo), 'MMM d, yyyy')})`;
    }
    if (filters.dateFrom) {
      return `Gross Cumulative P&L (From ${format(new Date(filters.dateFrom), 'MMM d, yyyy')})`;
    }
    if (filters.dateTo) {
      return `Gross Cumulative P&L (Until ${format(new Date(filters.dateTo), 'MMM d, yyyy')})`;
    }
    return 'Gross Cumulative P&L (Filtered)';
  };

  // Year/Month/Day distribution and performance data
  const timeGroupedData = (() => {
    const closedTrades = filteredTrades.filter(t => t.exit_datetime !== null);
    if (closedTrades.length === 0) return [];

    const grouped = new Map<string, { trades: number; pnl: number }>();

    closedTrades.forEach(trade => {
      const exitDate = new Date(trade.exit_datetime!);
      let key: string;
      
      switch (timeGranularity) {
        case 'year':
          key = format(exitDate, 'yyyy');
          break;
        case 'month':
          key = format(exitDate, 'yyyy-MM');
          break;
        case 'day':
          key = format(exitDate, 'yyyy-MM-dd');
          break;
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

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        trades: data.trades,
        pnl: data.pnl,
      }));
  })();

  const recentTrades = filteredTrades.slice(0, 5);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Your trading performance at a glance
              {hasActiveFilters && ` · Filtered: ${filteredTrades.length} trades`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/import">
                <TrendingUp className="mr-2 h-4 w-4" />
                Import Trades
              </Link>
            </Button>
            <Button asChild>
              <Link to={getTradesLink(searchParams)}>
                View All Trades
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <TradeFiltersComponent
          filters={filters}
          strategies={strategies}
          onFilterChange={setFilter}
          onDatePreset={setDatePreset}
          onClearDates={clearDateFilters}
        />

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Total Net P/L"
            value={formatCurrency(analytics?.totalNetPnL || 0)}
            icon={<Activity className="h-5 w-5" />}
            variant={analytics?.totalNetPnL && analytics.totalNetPnL >= 0 ? 'profit' : 'loss'}
          />
          <KPICard
            title="Win Rate"
            value={formatPercent(analytics?.winRate || 0)}
            subtitle={`${analytics?.totalTrades || 0} closed trades`}
            icon={<Target className="h-5 w-5" />}
          />
          <KPICard
            title="Average R"
            value={formatR(analytics?.avgR || 0)}
            icon={<BarChart3 className="h-5 w-5" />}
            variant={analytics?.avgR && analytics.avgR >= 0 ? 'profit' : 'loss'}
          />
          <KPICard
            title="Profit Factor"
            value={analytics?.profitFactor === Infinity ? '∞' : (analytics?.profitFactor || 0).toFixed(2)}
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        {/* Charts & Tables */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gross Cumulative P/L Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{getGrossChartTitle()}</CardTitle>
              <CardDescription>
                {hasActiveFilters 
                  ? `Showing ${grossCumulativePnLData.length} trading days based on active filters`
                  : 'Cumulative gross profit/loss across your entire trading history'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {grossCumulativePnLData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={grossCumulativePnLData}>
                      <defs>
                        <linearGradient id="colorGrossPnL" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--profit))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--profit))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs fill-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        tickFormatter={(value) => {
                          // Adjust format based on data range
                          const date = new Date(value);
                          if (grossCumulativePnLData.length > 90) {
                            return format(date, 'MMM yyyy');
                          }
                          return format(date, 'MMM d');
                        }}
                      />
                      <YAxis 
                        className="text-xs fill-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value.toLocaleString()}`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        labelFormatter={(value) => format(new Date(value), 'EEEE, MMM d, yyyy')}
                        formatter={(value: number, name: string) => [
                          formatCurrency(value), 
                          name === 'cumulative' ? 'Cumulative P/L' : 'Daily P/L'
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="hsl(var(--profit))"
                        strokeWidth={2}
                        fill="url(#colorGrossPnL)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No trade data for the selected filters</p>
                    {hasActiveFilters && (
                      <p className="text-sm mt-1">Try adjusting your filters</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Net Equity Curve */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Net Equity Curve</CardTitle>
              <CardDescription>Cumulative net P/L (after fees & commissions)</CardDescription>
            </CardHeader>
            <CardContent>
              {equityCurveData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityCurveData}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs fill-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        className="text-xs fill-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value.toLocaleString()}`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number) => [formatCurrency(value), 'Equity']}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#colorEquity)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No trade data yet</p>
                    <Button asChild variant="link" className="mt-2">
                      <Link to="/import">Import your first trades</Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Trades */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Trades</CardTitle>
                <CardDescription>Your latest trading activity</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to={getTradesLink(searchParams)}>View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentTrades.length > 0 ? (
                <div className="space-y-4">
                  {recentTrades.map((trade) => {
                    const metrics = calculateTradeMetrics(trade);
                    return (
                      <Link
                        key={trade.id}
                        to={`/trades/${trade.id}`}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <TradeBadge side={trade.side} />
                          <div>
                            <p className="font-medium">{trade.symbol}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(trade.entry_datetime), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <PnLBadge value={metrics.netPnL} />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <TrendingDown className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No trades yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Stats</CardTitle>
              <CardDescription>Key metrics from your trading</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Expectancy</span>
                  <span className="font-mono font-medium">
                    {formatCurrency(analytics?.expectancy || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Max Drawdown</span>
                  <span className="font-mono font-medium text-loss">
                    {formatCurrency(analytics?.maxDrawdown || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Best Streak</span>
                  <span className="font-mono font-medium text-profit">
                    {analytics?.winStreak || 0} wins
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Worst Streak</span>
                  <span className="font-mono font-medium text-loss">
                    {analytics?.lossStreak || 0} losses
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Current Streak</span>
                  <span className={`font-mono font-medium ${
                    analytics?.currentStreakType === 'win' ? 'text-profit' : 
                    analytics?.currentStreakType === 'loss' ? 'text-loss' : ''
                  }`}>
                    {analytics?.currentStreak || 0} {analytics?.currentStreakType !== 'none' ? analytics?.currentStreakType + 's' : '-'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Year / Month / Day Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Year / Month / Day</h2>
              <p className="text-sm text-muted-foreground">Trade distribution and performance by time period</p>
            </div>
            <Tabs value={timeGranularity} onValueChange={(v) => setTimeGranularity(v as 'year' | 'month' | 'day')}>
              <TabsList>
                <TabsTrigger value="year">Year</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="day">Day</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Trade Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trade Distribution by {timeGranularity.charAt(0).toUpperCase() + timeGranularity.slice(1)}</CardTitle>
                <CardDescription>Number of trades per {timeGranularity}</CardDescription>
              </CardHeader>
              <CardContent>
                {timeGroupedData.length > 0 ? (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeGroupedData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis 
                          dataKey="period" 
                          className="text-xs fill-muted-foreground"
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis 
                          className="text-xs fill-muted-foreground"
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          formatter={(value: number) => [value, 'Trades']}
                        />
                        <Bar 
                          dataKey="trades" 
                          fill="hsl(var(--profit))" 
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="mx-auto h-10 w-10 mb-2 opacity-50" />
                      <p className="text-sm">No trade data</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance by {timeGranularity.charAt(0).toUpperCase() + timeGranularity.slice(1)}</CardTitle>
                <CardDescription>Gross P/L per {timeGranularity}</CardDescription>
              </CardHeader>
              <CardContent>
                {timeGroupedData.length > 0 ? (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeGroupedData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis 
                          dataKey="period" 
                          className="text-xs fill-muted-foreground"
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis 
                          className="text-xs fill-muted-foreground"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `$${value.toLocaleString()}`}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          formatter={(value: number) => [formatCurrency(value), 'P/L']}
                        />
                        <Bar 
                          dataKey="pnl" 
                          radius={[4, 4, 0, 0]}
                        >
                          {timeGroupedData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.pnl >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="mx-auto h-10 w-10 mb-2 opacity-50" />
                      <p className="text-sm">No trade data</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
