import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  BarChart3, 
  ArrowRight,
  Activity,
  Download,
  DollarSign,
  Percent
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
import { calculateAnalytics, calculateTradeMetrics, calculateDetailedStats, formatCurrency, formatPercent, formatR, formatHoldTime, DetailedStats } from '@/lib/calculations';
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
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DayTimesSection } from '@/components/dashboard/DayTimesSection';
import { PriceVolumeSection } from '@/components/dashboard/PriceVolumeSection';
import { InstrumentSection } from '@/components/dashboard/InstrumentSection';
import { WinLoseExpectationSection } from '@/components/dashboard/WinLoseExpectationSection';
import { WinLosingDaysSection } from '@/components/dashboard/WinLosingDaysSection';
import { WinLosingDaysTimesSection } from '@/components/dashboard/WinLosingDaysTimesSection';
import { WinLosingDaysPriceVolumeSection } from '@/components/dashboard/WinLosingDaysPriceVolumeSection';

type DashboardView = 'overview' | 'detailed' | 'distribution' | 'win-losing-days';
type DetailedSubView = 'stats' | 'day-times' | 'price-volume' | 'instrument' | 'win-lose-expectation';
type WinLosingDaysSubView = 'stats' | 'days-times' | 'price-volume';
type DisplayMode = 'dollars' | 'R';

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
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview');
  const [detailedSubView, setDetailedSubView] = useState<DetailedSubView>('stats');
  const [winLosingDaysSubView, setWinLosingDaysSubView] = useState<WinLosingDaysSubView>('stats');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('dollars');

  // Format value based on display mode
  const formatValue = (dollarValue: number, rValue: number | null): string => {
    if (displayMode === 'R') {
      return rValue !== null ? formatR(rValue) : 'n/a';
    }
    return formatCurrency(dollarValue);
  };

  // Get the R value for a given trade
  const getTradeRValue = (trade: Trade): number | null => {
    const metrics = calculateTradeMetrics(trade);
    return metrics.realizedR;
  };
  
  const { filters, setFilter, setDatePreset, clearDateFilters, filterTrades, hasActiveFilters } = useTradeFilters();

  useEffect(() => {
    if (user) {
      Promise.all([fetchTrades(), fetchStrategies()]);
    }
  }, [user]);

  const fetchTrades = async () => {
    try {
      // Fetch all trades using range-based pagination to overcome the 1000 row limit
      let allTrades: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('trades')
          .select('*, strategies(*)')
          .eq('user_id', user?.id)
          .order('entry_datetime', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allTrades = [...allTrades, ...data];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      const typedTrades = allTrades.map(t => ({
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

  // Calculate detailed stats (memoized based on filtered trades)
  const detailedStats = calculateDetailedStats(filteredTrades);

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

  // Generate Gross Cumulative P/L chart data (uses filters) - includes both $ and R
  const grossCumulativePnLData = (() => {
    const closedTrades = filteredTrades.filter(t => t.exit_datetime !== null);
    if (closedTrades.length === 0) return [];

    const sorted = [...closedTrades].sort(
      (a, b) => new Date(a.exit_datetime!).getTime() - new Date(b.exit_datetime!).getTime()
    );

    // Group by date for cleaner chart
    const dailyData = new Map<string, { grossPnL: number; grossR: number; date: Date }>();
    
    sorted.forEach(trade => {
      const dateKey = format(new Date(trade.exit_datetime!), 'yyyy-MM-dd');
      const metrics = calculateTradeMetrics(trade);
      const existing = dailyData.get(dateKey);
      if (existing) {
        existing.grossPnL += metrics.grossPnL;
        existing.grossR += metrics.realizedR ?? 0;
      } else {
        dailyData.set(dateKey, { 
          grossPnL: metrics.grossPnL, 
          grossR: metrics.realizedR ?? 0,
          date: new Date(trade.exit_datetime!) 
        });
      }
    });

    // Convert to cumulative
    let cumulativePnL = 0;
    let cumulativeR = 0;
    const result: { date: string; cumulative: number; cumulativeR: number; dailyPnL: number; dailyR: number }[] = [];
    
    Array.from(dailyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([dateKey, data]) => {
        cumulativePnL += data.grossPnL;
        cumulativeR += data.grossR;
        result.push({
          date: format(data.date, 'yyyy-MM-dd'),
          cumulative: cumulativePnL,
          cumulativeR: cumulativeR,
          dailyPnL: data.grossPnL,
          dailyR: data.grossR,
        });
      });

    return result;
  })();

  // Determine chart title based on filter state and display mode
  const getGrossChartTitle = () => {
    const valueLabel = displayMode === 'dollars' ? 'P&L' : 'R';
    if (!hasActiveFilters) {
      return `Gross Cumulative ${valueLabel} (All Time)`;
    }
    if (filters.dateFrom && filters.dateTo) {
      return `Gross Cumulative ${valueLabel} (${format(new Date(filters.dateFrom), 'MMM d, yyyy')} - ${format(new Date(filters.dateTo), 'MMM d, yyyy')})`;
    }
    if (filters.dateFrom) {
      return `Gross Cumulative ${valueLabel} (From ${format(new Date(filters.dateFrom), 'MMM d, yyyy')})`;
    }
    if (filters.dateTo) {
      return `Gross Cumulative ${valueLabel} (Until ${format(new Date(filters.dateTo), 'MMM d, yyyy')})`;
    }
    return `Gross Cumulative ${valueLabel} (Filtered)`;
  };

  // Year/Month/Day distribution and performance data - includes both $ and R
  const timeGroupedData = (() => {
    const closedTrades = filteredTrades.filter(t => t.exit_datetime !== null);
    if (closedTrades.length === 0) return [];

    const grouped = new Map<string, { trades: number; pnl: number; rValue: number }>();

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
        existing.rValue += metrics.realizedR ?? 0;
      } else {
        grouped.set(key, { trades: 1, pnl: metrics.grossPnL, rValue: metrics.realizedR ?? 0 });
      }
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        trades: data.trades,
        pnl: data.pnl,
        rValue: data.rValue,
      }));
  })();

  const recentTrades = filteredTrades.slice(0, 5);

  // Export filtered trades to Excel
  const exportToExcel = () => {
    const closedTrades = filteredTrades.filter(t => t.exit_datetime !== null);
    
    const exportData = closedTrades.map(trade => {
      const metrics = calculateTradeMetrics(trade);
      const holdTimeMinutes = trade.exit_datetime && trade.entry_datetime
        ? (new Date(trade.exit_datetime).getTime() - new Date(trade.entry_datetime).getTime()) / (1000 * 60)
        : null;
      return {
        'Symbol': trade.symbol,
        'Side': trade.side,
        'Entry Date': trade.entry_datetime ? format(new Date(trade.entry_datetime), 'yyyy-MM-dd HH:mm:ss') : '',
        'Exit Date': trade.exit_datetime ? format(new Date(trade.exit_datetime), 'yyyy-MM-dd HH:mm:ss') : '',
        'Entry Price': trade.entry_price,
        'Exit Price': trade.exit_price,
        'Quantity': trade.quantity,
        'Gross P/L': metrics.grossPnL,
        'Net P/L': metrics.netPnL,
        'R Multiple': metrics.realizedR !== null ? metrics.realizedR : '',
        'Fees': trade.fees,
        'Commissions': trade.commissions,
        'Stop Loss': trade.stop_loss || '',
        'Strategy': trade.strategy?.name || '',
        'Hold Time (min)': holdTimeMinutes !== null ? Math.round(holdTimeMinutes) : '',
        'Notes': trade.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trades');
    
    // Auto-size columns
    const maxWidths = Object.keys(exportData[0] || {}).map(key => 
      Math.max(key.length, ...exportData.map(row => String(row[key as keyof typeof row] || '').length))
    );
    worksheet['!cols'] = maxWidths.map(w => ({ wch: Math.min(w + 2, 40) }));
    
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    XLSX.writeFile(workbook, `trades-export-${dateStr}.xlsx`);
  };

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
          <div className="flex flex-wrap items-center gap-2">
            {/* Display Mode Toggle */}
            <ToggleGroup 
              type="single" 
              value={displayMode} 
              onValueChange={(v) => v && setDisplayMode(v as DisplayMode)}
              className="border rounded-md"
            >
              <ToggleGroupItem value="dollars" aria-label="Show in dollars" className="px-3">
                <DollarSign className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="R" aria-label="Show in R multiples" className="px-3">
                <span className="font-semibold text-sm">R</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" onClick={exportToExcel}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
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

        {/* Dashboard View Tabs */}
        <Tabs value={dashboardView} onValueChange={(v) => setDashboardView(v as DashboardView)} className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="detailed">Detailed</TabsTrigger>
            <TabsTrigger value="win-losing-days">Win vs Losing Days</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Overview Section */}
        {dashboardView === 'overview' && (
          <>
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KPICard
                title={displayMode === 'dollars' ? "Total Net P/L" : "Total R"}
                value={displayMode === 'dollars' 
                  ? formatCurrency(analytics?.totalNetPnL || 0)
                  : formatR(analytics?.totalR || 0)
                }
                icon={<Activity className="h-5 w-5" />}
                variant={(displayMode === 'dollars' ? (analytics?.totalNetPnL || 0) : (analytics?.totalR || 0)) >= 0 ? 'profit' : 'loss'}
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
                      : displayMode === 'dollars' 
                        ? 'Cumulative gross profit/loss across your entire trading history'
                        : 'Cumulative R-multiple performance across your entire trading history'
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
                            tickFormatter={(value) => displayMode === 'dollars' 
                              ? `$${value.toLocaleString()}` 
                              : `${value.toFixed(1)}R`
                            }
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(222 47% 11%)',
                              borderColor: 'hsl(var(--border))',
                              borderRadius: '8px',
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                            }}
                            labelStyle={{ color: 'hsl(0 0% 98%)', fontWeight: 600, marginBottom: '4px' }}
                            labelFormatter={(value) => format(new Date(value), 'EEEE, MMM d, yyyy')}
                            formatter={(value: number, name: string) => {
                              const color = value >= 0 ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)';
                              const formattedValue = displayMode === 'dollars' 
                                ? formatCurrency(value) 
                                : `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
                              const labelSuffix = displayMode === 'dollars' ? 'P/L' : 'R';
                              return [
                                <span style={{ color, fontWeight: 600 }}>{formattedValue}</span>, 
                                name === (displayMode === 'dollars' ? 'cumulative' : 'cumulativeR') 
                                  ? `Cumulative ${labelSuffix}` 
                                  : `Daily ${labelSuffix}`
                              ];
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey={displayMode === 'dollars' ? 'cumulative' : 'cumulativeR'}
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
                            <PnLBadge 
                              value={displayMode === 'dollars' ? metrics.netPnL : (metrics.realizedR ?? 0)} 
                              format={displayMode === 'dollars' ? 'currency' : 'r'}
                            />
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
          </>
        )}

        {/* Detailed Section */}
        {dashboardView === 'detailed' && (
          <div className="space-y-6">
            {/* Sub-navigation */}
            <Tabs value={detailedSubView} onValueChange={(v) => setDetailedSubView(v as DetailedSubView)}>
              <TabsList>
                <TabsTrigger value="stats">Statistics</TabsTrigger>
                <TabsTrigger value="day-times">Day / Times</TabsTrigger>
                <TabsTrigger value="price-volume">Price / Volume</TabsTrigger>
                <TabsTrigger value="instrument">Instrument</TabsTrigger>
                <TabsTrigger value="win-lose-expectation">Win / Lose / Expectation</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Stats Sub-section */}
            {detailedSubView === 'stats' && (
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Statistics</CardTitle>
                  <CardDescription>
                    Comprehensive trading metrics and performance analysis
                    {hasActiveFilters && ` · Based on ${filteredTrades.length} filtered trades`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-0 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
                    {/* Column 1 */}
                    <div className="pr-0 lg:pr-6">
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Total Gain/Loss</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${detailedStats.totalGainLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {formatCurrency(detailedStats.totalGainLoss)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Daily Gain/Loss</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${detailedStats.avgDailyGainLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {formatCurrency(detailedStats.avgDailyGainLoss)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Trade Gain/Loss</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${detailedStats.avgTradeGainLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {formatCurrency(detailedStats.avgTradeGainLoss)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Total Number of Trades</TableCell>
                            <TableCell className="text-right font-mono font-medium">{detailedStats.totalTrades}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Avg Hold Time (scratch trades)</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatHoldTime(detailedStats.avgHoldTimeMinutes)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Number of Scratch Trades</TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {detailedStats.scratchTrades} ({detailedStats.scratchRate.toFixed(1)}%)
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Trade P&L Standard Deviation</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatCurrency(detailedStats.tradePnLStdDev)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Kelly Percentage</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${detailedStats.kellyPercentage && detailedStats.kellyPercentage < 0 ? 'text-loss' : ''}`}>
                              {detailedStats.kellyPercentage !== null ? `${detailedStats.kellyPercentage.toFixed(1)}%` : 'n/a'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Total Commissions</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatCurrency(detailedStats.totalCommissions)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Position MAE</TableCell>
                            <TableCell className="text-right font-mono font-medium text-loss">
                              {detailedStats.avgMAE !== null ? formatCurrency(detailedStats.avgMAE) : 'n/a'}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* Column 2 */}
                    <div className="px-0 lg:px-6 pt-4 lg:pt-0">
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Largest Gain</TableCell>
                            <TableCell className="text-right font-mono font-medium text-profit">{formatCurrency(detailedStats.largestGain)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Daily Volume</TableCell>
                            <TableCell className="text-right font-mono font-medium">{Math.round(detailedStats.avgDailyVolume).toLocaleString()}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Winning Trade</TableCell>
                            <TableCell className="text-right font-mono font-medium text-profit">{formatCurrency(detailedStats.avgWinningTrade)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Number of Winning Trades</TableCell>
                            <TableCell className="text-right font-mono font-medium text-profit">
                              {detailedStats.winningTrades} ({detailedStats.winRate.toFixed(1)}%)
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Avg Hold Time (winning trades)</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatHoldTime(detailedStats.avgHoldTimeWinningMinutes)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Max Consecutive Wins</TableCell>
                            <TableCell className="text-right font-mono font-medium text-profit">{detailedStats.maxConsecutiveWins}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">System Quality Number (SQN)</TableCell>
                            <TableCell className="text-right font-mono font-medium">{detailedStats.sqn !== null ? detailedStats.sqn.toFixed(2) : 'n/a'}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">K-Ratio</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${detailedStats.kRatio && detailedStats.kRatio < 0 ? 'text-loss' : ''}`}>
                              {detailedStats.kRatio !== null ? detailedStats.kRatio.toFixed(2) : 'n/a'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Total Fees</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatCurrency(detailedStats.totalFees)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Position MFE</TableCell>
                            <TableCell className="text-right font-mono font-medium text-profit">
                              {detailedStats.avgMFE !== null ? formatCurrency(detailedStats.avgMFE) : 'n/a'}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* Column 3 */}
                    <div className="pl-0 lg:pl-6 pt-4 lg:pt-0">
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Largest Loss</TableCell>
                            <TableCell className="text-right font-mono font-medium text-loss">{formatCurrency(detailedStats.largestLoss)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Per-share Gain/Loss</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${detailedStats.avgPerShareGainLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {formatCurrency(detailedStats.avgPerShareGainLoss)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Average Losing Trade</TableCell>
                            <TableCell className="text-right font-mono font-medium text-loss">{formatCurrency(detailedStats.avgLosingTrade)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Number of Losing Trades</TableCell>
                            <TableCell className="text-right font-mono font-medium text-loss">
                              {detailedStats.losingTrades} ({detailedStats.lossRate.toFixed(1)}%)
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Avg Hold Time (losing trades)</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatHoldTime(detailedStats.avgHoldTimeLosingMinutes)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Max Consecutive Losses</TableCell>
                            <TableCell className="text-right font-mono font-medium text-loss">{detailedStats.maxConsecutiveLosses}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Probability of Random Chance</TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {detailedStats.probabilityOfRandomChance !== null ? `${detailedStats.probabilityOfRandomChance.toFixed(1)}%` : 'n/a'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Profit Factor</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${detailedStats.profitFactor >= 1 ? 'text-profit' : 'text-loss'}`}>
                              {detailedStats.profitFactor === Infinity ? '∞' : detailedStats.profitFactor.toFixed(2)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Total Fees + Commissions</TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatCurrency(detailedStats.totalFees + detailedStats.totalCommissions)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="text-muted-foreground">Expectancy</TableCell>
                            <TableCell className={`text-right font-mono font-medium ${(analytics?.expectancy || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                              {formatCurrency(analytics?.expectancy || 0)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Day / Times Sub-section */}
            {detailedSubView === 'day-times' && (
              <DayTimesSection trades={filteredTrades} />
            )}

            {/* Price / Volume Sub-section */}
            {detailedSubView === 'price-volume' && (
              <PriceVolumeSection trades={filteredTrades} />
            )}

            {/* Instrument Sub-section */}
            {detailedSubView === 'instrument' && (
              <InstrumentSection trades={filteredTrades} />
            )}

            {/* Win / Lose / Expectation Sub-section */}
            {detailedSubView === 'win-lose-expectation' && (
              <WinLoseExpectationSection trades={filteredTrades} />
            )}
          </div>
        )}

        {/* Distribution Section */}
        {dashboardView === 'distribution' && (
          <div className="space-y-6">
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
                    <div className="h-[300px]">
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
                              backgroundColor: 'hsl(222 47% 11%)',
                              borderColor: 'hsl(var(--border))',
                              borderRadius: '8px',
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                            }}
                            labelStyle={{ color: 'hsl(0 0% 98%)', fontWeight: 600, marginBottom: '4px' }}
                            formatter={(value: number) => [
                              <span style={{ color: 'hsl(0 0% 98%)', fontWeight: 600 }}>{value}</span>,
                              'Trades'
                            ]}
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
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
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
                  <CardDescription>
                    {displayMode === 'dollars' ? 'Gross P/L' : 'R-Multiple'} per {timeGranularity}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timeGroupedData.length > 0 ? (
                    <div className="h-[300px]">
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
                            tickFormatter={(value) => displayMode === 'dollars' 
                              ? `$${value.toLocaleString()}` 
                              : `${value.toFixed(1)}R`
                            }
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(222 47% 11%)',
                              borderColor: 'hsl(var(--border))',
                              borderRadius: '8px',
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                            }}
                            labelStyle={{ color: 'hsl(0 0% 98%)', fontWeight: 600, marginBottom: '4px' }}
                            formatter={(value: number) => {
                              const color = value >= 0 ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)';
                              const formattedValue = displayMode === 'dollars' 
                                ? formatCurrency(value) 
                                : `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
                              return [
                                <span style={{ color, fontWeight: 600 }}>{formattedValue}</span>,
                                displayMode === 'dollars' ? 'P/L' : 'R'
                              ];
                            }}
                          />
                          <Bar 
                            dataKey={displayMode === 'dollars' ? 'pnl' : 'rValue'} 
                            radius={[4, 4, 0, 0]}
                          >
                            {timeGroupedData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={(displayMode === 'dollars' ? entry.pnl : entry.rValue) >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))'} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
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
        )}

        {/* Win vs Losing Days Section */}
        {dashboardView === 'win-losing-days' && (
          <div className="space-y-6">
            {/* Sub-section Tabs */}
            <Tabs value={winLosingDaysSubView} onValueChange={(v) => setWinLosingDaysSubView(v as WinLosingDaysSubView)} className="w-full">
              <TabsList className="w-full max-w-lg grid grid-cols-3">
                <TabsTrigger value="stats">Stats</TabsTrigger>
                <TabsTrigger value="days-times">Days / Times</TabsTrigger>
                <TabsTrigger value="price-volume">Price / Volume</TabsTrigger>
              </TabsList>
            </Tabs>

            {winLosingDaysSubView === 'stats' && (
              <WinLosingDaysSection 
                trades={filteredTrades}
                onTradeClick={(tradeId) => window.location.href = `/trades/${tradeId}`}
              />
            )}

            {winLosingDaysSubView === 'days-times' && (
              <WinLosingDaysTimesSection trades={filteredTrades} />
            )}

            {winLosingDaysSubView === 'price-volume' && (
              <WinLosingDaysPriceVolumeSection trades={filteredTrades} />
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
