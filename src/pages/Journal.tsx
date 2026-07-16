import { useEffect, useState } from 'react';
import { format, startOfWeek, endOfWeek, addDays, subDays, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { fetchAll, getJournalEntry, upsertJournalEntry } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { JournalEntry, DailyStats, Trade } from '@/types/trade';
import { calculateDailyStats, formatCurrency, formatR } from '@/lib/calculations';
import { cn } from '@/lib/utils';

export default function Journal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [journalEntry, setJournalEntry] = useState<Partial<JournalEntry>>({});
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const dateStr = format(currentDate, 'yyyy-MM-dd');

  useEffect(() => {
    if (user) {
      fetchJournalEntry();
      fetchTrades();
    }
  }, [user, dateStr]);

  const fetchJournalEntry = async () => {
    setLoading(true);
    try {
      const data = await getJournalEntry<JournalEntry>(user!.id, dateStr);
      setJournalEntry(data || { date: dateStr });
    } catch (error) {
      console.error('Error fetching journal entry:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrades = async () => {
    try {
      const data = await fetchAll<Trade>(user!.id, 'trades');

      const typedTrades = data.map(t => ({
        ...t,
        entry_price: Number(t.entry_price),
        exit_price: t.exit_price ? Number(t.exit_price) : null,
        quantity: Number(t.quantity),
        fees: Number(t.fees) || 0,
        commissions: Number(t.commissions) || 0,
      })) as Trade[];
      
      setTrades(typedTrades);
    } catch (error) {
      console.error('Error fetching trades:', error);
    }
  };

  const dailyStats = calculateDailyStats(trades);
  const todayStats = dailyStats.find(s => s.date === dateStr);

  const handleSave = async () => {
    setSaving(true);
    try {
      const entryData = {
        pre_market: journalEntry.pre_market || null,
        post_market: journalEntry.post_market || null,
        daily_max_loss: journalEntry.daily_max_loss || null,
        daily_profit_target: journalEntry.daily_profit_target || null,
        mood: journalEntry.mood || null,
      };

      await upsertJournalEntry(user!.id, dateStr, entryData);

      toast({
        title: 'Saved',
        description: 'Journal entry saved successfully',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  // Week navigation
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Journal</h1>
            <p className="text-muted-foreground">Daily trading notes and reflections</p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>

        {/* Week Selector */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subDays(currentDate, 7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex gap-2">
                {weekDays.map(day => {
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const stats = dailyStats.find(s => s.date === dayStr);
                  const isSelected = dayStr === dateStr;
                  const isToday = dayStr === format(new Date(), 'yyyy-MM-dd');
                  
                  return (
                    <button
                      key={dayStr}
                      onClick={() => setCurrentDate(day)}
                      className={cn(
                        'flex flex-col items-center p-2 rounded-lg transition-all min-w-[60px]',
                        isSelected && 'bg-primary text-primary-foreground',
                        !isSelected && 'hover:bg-muted',
                        isToday && !isSelected && 'ring-2 ring-primary'
                      )}
                    >
                      <span className="text-xs font-medium">{format(day, 'EEE')}</span>
                      <span className="text-lg font-bold">{format(day, 'd')}</span>
                      {stats && (
                        <span className={cn(
                          'text-xs font-mono',
                          isSelected ? '' : (stats.netPnL >= 0 ? 'text-profit' : 'text-loss')
                        )}>
                          {stats.trades}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Journal Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pre-Market Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Market outlook, key levels, trading plan for the day..."
                  value={journalEntry.pre_market || ''}
                  onChange={(e) => setJournalEntry({ ...journalEntry, pre_market: e.target.value })}
                  className="min-h-[150px] resize-none"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Post-Market Review</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="What worked, what didn't, lessons learned..."
                  value={journalEntry.post_market || ''}
                  onChange={(e) => setJournalEntry({ ...journalEntry, post_market: e.target.value })}
                  className="min-h-[150px] resize-none"
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Day Stats */}
            <Card>
              <CardHeader>
                <CardTitle>{format(currentDate, 'EEEE, MMMM d')}</CardTitle>
              </CardHeader>
              <CardContent>
                {todayStats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className={cn(
                          'text-xl font-bold font-mono',
                          todayStats.netPnL >= 0 ? 'text-profit' : 'text-loss'
                        )}>
                          {formatCurrency(todayStats.netPnL)}
                        </p>
                        <p className="text-xs text-muted-foreground">Net P/L</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-xl font-bold font-mono">
                          {formatR(todayStats.totalR)}
                        </p>
                        <p className="text-xs text-muted-foreground">Total R</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Trades</span>
                      <span className="font-medium">{todayStats.trades}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Win/Loss</span>
                      <span className="font-medium">
                        <span className="text-profit">{todayStats.winCount}</span>
                        {' / '}
                        <span className="text-loss">{todayStats.lossCount}</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No trades on this day</p>
                )}
              </CardContent>
            </Card>

            {/* Risk Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="maxLoss">Daily Max Loss ($)</Label>
                  <Input
                    id="maxLoss"
                    type="number"
                    placeholder="e.g. 500"
                    value={journalEntry.daily_max_loss || ''}
                    onChange={(e) => setJournalEntry({ 
                      ...journalEntry, 
                      daily_max_loss: e.target.value ? parseFloat(e.target.value) : null 
                    })}
                  />
                  {todayStats && journalEntry.daily_max_loss && todayStats.netPnL < -journalEntry.daily_max_loss && (
                    <p className="text-xs text-loss">⚠️ Max loss exceeded!</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profitTarget">Daily Profit Target ($)</Label>
                  <Input
                    id="profitTarget"
                    type="number"
                    placeholder="e.g. 1000"
                    value={journalEntry.daily_profit_target || ''}
                    onChange={(e) => setJournalEntry({ 
                      ...journalEntry, 
                      daily_profit_target: e.target.value ? parseFloat(e.target.value) : null 
                    })}
                  />
                  {todayStats && journalEntry.daily_profit_target && todayStats.netPnL >= journalEntry.daily_profit_target && (
                    <p className="text-xs text-profit">✓ Target reached!</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Mood */}
            <Card>
              <CardHeader>
                <CardTitle>Mood</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between">
                  {[1, 2, 3, 4, 5].map((mood) => (
                    <button
                      key={mood}
                      onClick={() => setJournalEntry({ ...journalEntry, mood })}
                      className={cn(
                        'w-10 h-10 rounded-full text-lg transition-all',
                        journalEntry.mood === mood 
                          ? 'bg-primary text-primary-foreground scale-110' 
                          : 'bg-muted hover:bg-muted/80'
                      )}
                    >
                      {mood === 1 ? '😔' : mood === 2 ? '😕' : mood === 3 ? '😐' : mood === 4 ? '🙂' : '😊'}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
