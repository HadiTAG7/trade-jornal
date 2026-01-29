import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Trade, DailyStats } from '@/types/trade';
import { calculateDailyStats, formatCurrency, formatR } from '@/lib/calculations';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, setYear, getYear, isSameMonth, isToday, startOfYear, endOfYear, eachMonthOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';

// Generate year options (10 years back, 5 years forward)
const generateYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear - 10; y <= currentYear + 5; y++) {
    years.push(y);
  }
  return years;
};

const yearOptions = generateYearOptions();

// Format P/L compactly for calendar cells
const formatCompactPnL = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  if (Math.abs(value) >= 1000) {
    return `${sign}${(value / 1000).toFixed(1)}k`;
  }
  return `${sign}${value.toFixed(0)}`;
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Fetch trades for the current year being viewed
  useEffect(() => {
    if (user) fetchTrades();
  }, [user, currentMonth]);

  const fetchTrades = async () => {
    try {
      // Get the year from currentMonth to filter trades
      const year = currentMonth.getFullYear();
      const yearStart = `${year}-01-01T00:00:00`;
      const yearEnd = `${year}-12-31T23:59:59`;
      
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user?.id)
        .gte('exit_datetime', yearStart)
        .lte('exit_datetime', yearEnd)
        .order('exit_datetime', { ascending: false });

      if (error) throw error;
      
      const typedTrades = (data || []).map(t => ({
        ...t,
        entry_price: Number(t.entry_price),
        exit_price: t.exit_price ? Number(t.exit_price) : null,
        quantity: Number(t.quantity),
        fees: Number(t.fees) || 0,
        commissions: Number(t.commissions) || 0,
        stop_loss: t.stop_loss ? Number(t.stop_loss) : null,
      })) as Trade[];
      
      console.log('Fetched trades for year', year, ':', typedTrades.length, 'trades');
      setTrades(typedTrades);
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const dailyStats = useMemo(() => calculateDailyStats(trades), [trades]);
  
  const statsMap = useMemo(() => {
    const map = new Map<string, DailyStats>();
    dailyStats.forEach(stat => map.set(stat.date, stat));
    return map;
  }, [dailyStats]);

  // Build calendar grid with weeks
  const calendarWeeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const allDays = eachDayOfInterval({ start: calStart, end: calEnd });
    
    // Group into weeks
    const weeks: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    return weeks;
  }, [currentMonth]);

  // Calculate weekly totals
  const weeklyTotals = useMemo(() => {
    return calendarWeeks.map(week => {
      let total = 0;
      let hasAnyTrades = false;
      week.forEach(day => {
        if (isSameMonth(day, currentMonth)) {
          const stats = statsMap.get(format(day, 'yyyy-MM-dd'));
          if (stats) {
            total += stats.netPnL;
            hasAnyTrades = true;
          }
        }
      });
      return { total, hasAnyTrades };
    });
  }, [calendarWeeks, statsMap, currentMonth]);

  // Get max/min for heatmap intensity
  const { maxPnL, minPnL } = useMemo(() => {
    if (dailyStats.length === 0) return { maxPnL: 0, minPnL: 0 };
    const pnls = dailyStats.map(s => s.netPnL);
    return { maxPnL: Math.max(...pnls), minPnL: Math.min(...pnls) };
  }, [dailyStats]);

  const getIntensity = (pnl: number): string => {
    if (pnl === 0) return 'bg-muted';
    if (pnl > 0) {
      const intensity = Math.min(pnl / (maxPnL || 1), 1);
      if (intensity > 0.66) return 'bg-emerald-500/80 dark:bg-emerald-600/80';
      if (intensity > 0.33) return 'bg-emerald-500/50 dark:bg-emerald-600/50';
      return 'bg-emerald-500/30 dark:bg-emerald-600/30';
    } else {
      const intensity = Math.min(Math.abs(pnl) / (Math.abs(minPnL) || 1), 1);
      // Use softer red shades for better text readability
      if (intensity > 0.66) return 'bg-red-400/70 dark:bg-red-500/60';
      if (intensity > 0.33) return 'bg-red-400/50 dark:bg-red-500/40';
      return 'bg-red-400/30 dark:bg-red-500/25';
    }
  };

  const selectedDayStats = selectedDate ? statsMap.get(selectedDate) : null;
  const selectedDayTrades = selectedDate 
    ? trades.filter(t => t.exit_datetime?.startsWith(selectedDate))
    : [];

  // Yearly heatmap data
  const yearStart = startOfYear(currentMonth);
  const yearEnd = endOfYear(currentMonth);
  const yearMonths = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">Visualize your trading performance by day</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendar */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>{format(currentMonth, 'MMMM yyyy')}</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentMonth(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Weekday headers + Weekly Total header */}
              <div className="grid grid-cols-8 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
                <div className="text-center text-xs font-medium text-muted-foreground py-2">
                  Week
                </div>
              </div>

              {/* Calendar grid with weeks */}
              <div className="space-y-1">
                {calendarWeeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-cols-8 gap-1">
                    {/* Day cells */}
                    {week.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const stats = statsMap.get(dateStr);
                      const hasTrades = !!stats;
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      
                      return (
                        <button
                          key={dateStr}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isCurrentMonth) {
                              setSelectedDate(dateStr);
                            }
                          }}
                          disabled={!isCurrentMonth}
                          type="button"
                          className={cn(
                            'aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all p-0.5',
                            isCurrentMonth 
                              ? hasTrades ? getIntensity(stats.netPnL) : 'bg-muted/30'
                              : 'bg-transparent opacity-30',
                            isCurrentMonth && isToday(day) && 'ring-2 ring-primary',
                            isCurrentMonth && selectedDate === dateStr && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                            isCurrentMonth && 'hover:ring-2 hover:ring-primary/50'
                          )}
                        >
                          <span className={cn(
                            'font-semibold text-sm',
                            hasTrades && stats.netPnL > 0 && 'text-emerald-900 dark:text-emerald-100',
                            hasTrades && stats.netPnL < 0 && 'text-red-900 dark:text-red-100'
                          )}>
                            {format(day, 'd')}
                          </span>
                          {hasTrades && isCurrentMonth && (
                            <span className={cn(
                              'text-[9px] font-bold font-mono leading-tight',
                              stats.netPnL >= 0 
                                ? 'text-emerald-800 dark:text-emerald-200' 
                                : 'text-red-800 dark:text-red-200'
                            )}>
                              {formatCompactPnL(stats.netPnL)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    
                    {/* Weekly total cell */}
                    <div className={cn(
                      'aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-mono transition-all border-l-2 border-border/50',
                      weeklyTotals[weekIndex].hasAnyTrades 
                        ? weeklyTotals[weekIndex].total >= 0 
                          ? 'bg-emerald-500/20 dark:bg-emerald-600/20' 
                          : 'bg-red-400/20 dark:bg-red-500/20'
                        : 'bg-muted/20'
                    )}>
                      {weeklyTotals[weekIndex].hasAnyTrades ? (
                        <>
                          <span className="text-[9px] text-muted-foreground font-medium">Total</span>
                          <span className={cn(
                            'font-bold text-[10px]',
                            weeklyTotals[weekIndex].total >= 0 
                              ? 'text-emerald-700 dark:text-emerald-300' 
                              : 'text-red-700 dark:text-red-300'
                          )}>
                            {formatCompactPnL(weeklyTotals[weekIndex].total)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-400/50 dark:bg-red-500/40" />
                  <span>Loss</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-muted" />
                  <span>No trades</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-emerald-500/50 dark:bg-emerald-600/50" />
                  <span>Profit</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Day Detail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedDate ? format(new Date(selectedDate), 'EEEE, MMMM d') : 'Select a day'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDayStats ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold font-mono text-profit">
                        {formatCurrency(selectedDayStats.netPnL)}
                      </p>
                      <p className="text-xs text-muted-foreground">Net P/L</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold font-mono">
                        {formatR(selectedDayStats.totalR)}
                      </p>
                      <p className="text-xs text-muted-foreground">Total R</p>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Trades</span>
                    <span className="font-medium">{selectedDayStats.trades}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Wins</span>
                    <span className="font-medium text-profit">{selectedDayStats.winCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Losses</span>
                    <span className="font-medium text-loss">{selectedDayStats.lossCount}</span>
                  </div>

                  {selectedDayTrades.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium mb-2">Trades</p>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {selectedDayTrades.map(trade => (
                          <div key={trade.id} className="flex justify-between items-center text-sm">
                            <span className="font-medium">{trade.symbol}</span>
                            <span className={cn(
                              'font-mono',
                              trade.exit_price && (trade.side === 'LONG' 
                                ? Number(trade.exit_price) > trade.entry_price ? 'text-profit' : 'text-loss'
                                : Number(trade.exit_price) < trade.entry_price ? 'text-profit' : 'text-loss'
                              )
                            )}>
                              {trade.side}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Click on a day to see details
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Yearly Heatmap */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Year Overview</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(setYear(currentMonth, getYear(currentMonth) - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select
                value={getYear(currentMonth).toString()}
                onValueChange={(value) => setCurrentMonth(setYear(currentMonth, parseInt(value)))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(setYear(currentMonth, getYear(currentMonth) + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-1">
              {yearMonths.map(month => {
                const monthStart = startOfMonth(month);
                const monthEnd = endOfMonth(month);
                const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
                const monthStats = days.reduce((acc, day) => {
                  const stat = statsMap.get(format(day, 'yyyy-MM-dd'));
                  if (stat) acc += stat.netPnL;
                  return acc;
                }, 0);

                return (
                  <button
                    key={format(month, 'MMM')}
                    onClick={() => setCurrentMonth(month)}
                    className={cn(
                      'p-3 rounded-lg text-center transition-all hover:ring-2 hover:ring-primary/50',
                      monthStats > 0 ? getIntensity(monthStats) : monthStats < 0 ? getIntensity(monthStats) : 'bg-muted/30',
                      isSameMonth(month, currentMonth) && 'ring-2 ring-primary'
                    )}
                  >
                    <p className={cn(
                      'text-xs font-semibold',
                      monthStats > 0 && 'text-emerald-900 dark:text-emerald-100',
                      monthStats < 0 && 'text-red-900 dark:text-red-100'
                    )}>{format(month, 'MMM')}</p>
                    <p className={cn(
                      'text-xs font-mono font-bold mt-1',
                      monthStats >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                    )}>
                      {monthStats !== 0 ? formatCurrency(monthStats) : '-'}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
