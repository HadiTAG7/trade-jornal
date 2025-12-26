import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Trade, DailyStats } from '@/types/trade';
import { calculateDailyStats, formatCurrency, formatR } from '@/lib/calculations';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDay, isSameMonth, isToday, startOfYear, endOfYear, eachMonthOfInterval, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

export default function CalendarPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchTrades();
  }, [user]);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user?.id);

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

  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const startDayOfWeek = getDay(startOfMonth(currentMonth));

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
      if (intensity > 0.66) return 'bg-profit/80';
      if (intensity > 0.33) return 'bg-profit/50';
      return 'bg-profit/30';
    } else {
      const intensity = Math.min(Math.abs(pnl) / (Math.abs(minPnL) || 1), 1);
      if (intensity > 0.66) return 'bg-loss/80';
      if (intensity > 0.33) return 'bg-loss/50';
      return 'bg-loss/30';
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
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: startDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}
                
                {/* Day cells */}
                {monthDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const stats = statsMap.get(dateStr);
                  const hasTrades = !!stats;
                  
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={cn(
                        'aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all p-1',
                        hasTrades ? getIntensity(stats.netPnL) : 'bg-muted/30',
                        isToday(day) && 'ring-2 ring-primary',
                        selectedDate === dateStr && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                        'hover:ring-2 hover:ring-primary/50'
                      )}
                    >
                      <span className={cn(
                        'font-medium',
                        hasTrades && stats.netPnL > 0 && 'text-profit-foreground',
                        hasTrades && stats.netPnL < 0 && 'text-loss-foreground'
                      )}>
                        {format(day, 'd')}
                      </span>
                      {hasTrades && (
                        <span className="text-[10px] font-mono mt-0.5 opacity-90">
                          {stats.trades}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-loss/50" />
                  <span>Loss</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-muted" />
                  <span>No trades</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-profit/50" />
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
          <CardHeader>
            <CardTitle>Year Overview - {format(currentMonth, 'yyyy')}</CardTitle>
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
                    <p className="text-xs font-medium">{format(month, 'MMM')}</p>
                    <p className={cn(
                      'text-xs font-mono mt-1',
                      monthStats >= 0 ? 'text-profit' : 'text-loss'
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
