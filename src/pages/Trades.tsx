import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Filter, Search, MoreHorizontal, Trash2, CalendarIcon, X, Settings2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { TradeBadge, PnLBadge } from '@/components/ui/trade-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Trade, TradeSide, Strategy, Account } from '@/types/trade';
import { calculateTradeMetrics, formatCurrency, formatR } from '@/lib/calculations';
import { format, differenceInMinutes, differenceInHours, differenceInDays, startOfDay, endOfDay, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Format trade duration
const formatDuration = (entryDate: string, exitDate: string | null): string => {
  if (!exitDate) return '-';
  
  const entry = new Date(entryDate);
  const exit = new Date(exitDate);
  const totalMinutes = differenceInMinutes(exit, entry);
  
  if (totalMinutes < 1) return '<1m';
  if (totalMinutes < 60) return `${totalMinutes}m`;
  
  const hours = differenceInHours(exit, entry);
  const mins = totalMinutes % 60;
  
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  
  const days = differenceInDays(exit, entry);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
};

export default function Trades() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sideFilter, setSideFilter] = useState<string>('all');
  const [strategyFilter, setStrategyFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Bulk edit state
  const [showStrategyDialog, setShowStrategyDialog] = useState(false);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [bulkStrategyId, setBulkStrategyId] = useState<string>('');
  const [bulkStopLoss, setBulkStopLoss] = useState<string>('');
  const [bulkPlannedRisk, setBulkPlannedRisk] = useState<string>('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  useEffect(() => {
    if (user) {
      Promise.all([fetchTrades(), fetchStrategies(), fetchAccounts()]);
    }
  }, [user]);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*, strategies(*), accounts(*)')
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
        strategy: t.strategies,
        account: t.accounts,
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

  const fetchAccounts = async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user?.id);
    setAccounts(data || []);
  };

  const filteredTrades = trades.filter(trade => {
    const matchesSearch = trade.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSide = sideFilter === 'all' || trade.side === sideFilter;
    const matchesStrategy = strategyFilter === 'all' || trade.strategy_id === strategyFilter;
    
    // Date filtering
    const tradeDate = new Date(trade.entry_datetime);
    const matchesDateFrom = !dateFrom || tradeDate >= startOfDay(dateFrom);
    const matchesDateTo = !dateTo || tradeDate <= endOfDay(dateTo);
    
    return matchesSearch && matchesSide && matchesStrategy && matchesDateFrom && matchesDateTo;
  });

  // Quick date presets
  const setDatePreset = (preset: 'today' | 'week' | 'month' | 'last30') => {
    const today = new Date();
    setDateTo(today);
    switch (preset) {
      case 'today':
        setDateFrom(today);
        break;
      case 'week':
        setDateFrom(startOfWeek(today, { weekStartsOn: 1 }));
        break;
      case 'month':
        setDateFrom(startOfMonth(today));
        break;
      case 'last30':
        setDateFrom(subDays(today, 30));
        break;
    }
  };

  const clearDateFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // Bulk update handlers
  const handleBulkStrategyUpdate = async () => {
    if (selectedTrades.size === 0 || !bulkStrategyId) return;
    
    setBulkUpdating(true);
    try {
      const { error } = await supabase
        .from('trades')
        .update({ strategy_id: bulkStrategyId === 'none' ? null : bulkStrategyId })
        .in('id', Array.from(selectedTrades));
      
      if (error) throw error;
      
      await fetchTrades();
      toast.success(`Updated strategy for ${selectedTrades.size} trade(s)`);
      setSelectedTrades(new Set());
    } catch (error) {
      console.error('Error updating trades:', error);
      toast.error('Failed to update trades');
    } finally {
      setBulkUpdating(false);
      setShowStrategyDialog(false);
      setBulkStrategyId('');
    }
  };

  const handleBulkRiskUpdate = async () => {
    if (selectedTrades.size === 0) return;
    
    const updates: { stop_loss?: number | null; planned_risk_override?: number | null } = {};
    
    if (bulkStopLoss !== '') {
      updates.stop_loss = bulkStopLoss ? parseFloat(bulkStopLoss) : null;
    }
    if (bulkPlannedRisk !== '') {
      updates.planned_risk_override = bulkPlannedRisk ? parseFloat(bulkPlannedRisk) : null;
    }
    
    if (Object.keys(updates).length === 0) {
      toast.error('Please enter at least one value');
      return;
    }
    
    setBulkUpdating(true);
    try {
      const { error } = await supabase
        .from('trades')
        .update(updates)
        .in('id', Array.from(selectedTrades));
      
      if (error) throw error;
      
      await fetchTrades();
      toast.success(`Updated risk for ${selectedTrades.size} trade(s)`);
      setSelectedTrades(new Set());
    } catch (error) {
      console.error('Error updating trades:', error);
      toast.error('Failed to update trades');
    } finally {
      setBulkUpdating(false);
      setShowRiskDialog(false);
      setBulkStopLoss('');
      setBulkPlannedRisk('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trade?')) return;
    
    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (!error) {
      setTrades(trades.filter(t => t.id !== id));
      setSelectedTrades(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTrades(new Set(filteredTrades.map(t => t.id)));
    } else {
      setSelectedTrades(new Set());
    }
  };

  const handleSelectTrade = (id: string, checked: boolean) => {
    setSelectedTrades(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedTrades.size === 0) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('trades')
        .delete()
        .in('id', Array.from(selectedTrades));
      
      if (error) throw error;
      
      setTrades(trades.filter(t => !selectedTrades.has(t.id)));
      toast.success(`Deleted ${selectedTrades.size} trade(s)`);
      setSelectedTrades(new Set());
    } catch (error) {
      console.error('Error deleting trades:', error);
      toast.error('Failed to delete trades');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const allSelected = filteredTrades.length > 0 && filteredTrades.every(t => selectedTrades.has(t.id));
  const someSelected = filteredTrades.some(t => selectedTrades.has(t.id));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trades</h1>
            <p className="text-muted-foreground">
              {filteredTrades.length} trades
              {selectedTrades.size > 0 && ` · ${selectedTrades.size} selected`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTrades.size > 0 && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setShowStrategyDialog(true)}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  Set Strategy
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowRiskDialog(true)}
                >
                  Set Risk
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedTrades.size})
                </Button>
              </>
            )}
            <Button asChild>
              <Link to="/trades/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Trade
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {/* Date From */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "MM/dd/yy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              {/* Date To */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "MM/dd/yy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              {/* Clear date filters */}
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="icon" onClick={clearDateFilters}>
                  <X className="h-4 w-4" />
                </Button>
              )}

              <Select value={sideFilter} onValueChange={setSideFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Side" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sides</SelectItem>
                  <SelectItem value="LONG">Long</SelectItem>
                  <SelectItem value="SHORT">Short</SelectItem>
                </SelectContent>
              </Select>
              <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  {strategies.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Quick date presets */}
            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="secondary" size="sm" onClick={() => setDatePreset('today')}>
                Today
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDatePreset('week')}>
                This Week
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDatePreset('month')}>
                This Month
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDatePreset('last30')}>
                Last 30 Days
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Trades Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-pulse text-muted-foreground">Loading trades...</div>
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>No trades found</p>
                <Button asChild variant="link" className="mt-2">
                  <Link to="/import">Import trades</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all"
                          className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
                        />
                      </TableHead>
                      <TableHead className="w-[120px]">Date/Time</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Exit</TableHead>
                      <TableHead className="text-right">Net P/L</TableHead>
                      <TableHead className="text-right">Risk ($)</TableHead>
                      <TableHead className="text-right">R</TableHead>
                      <TableHead className="text-center">Duration</TableHead>
                      <TableHead>Strategy</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrades.map((trade) => {
                      const metrics = calculateTradeMetrics(trade);
                      const duration = formatDuration(trade.entry_datetime, trade.exit_datetime);
                      const isSelected = selectedTrades.has(trade.id);
                      return (
                        <TableRow 
                          key={trade.id} 
                          className={`group ${isSelected ? 'bg-muted/50' : ''}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectTrade(trade.id, checked as boolean)}
                              aria-label={`Select trade ${trade.symbol}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <div>{format(new Date(trade.entry_datetime), 'MM/dd/yy')}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(trade.entry_datetime), 'HH:mm:ss')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Link 
                              to={`/trades/${trade.id}`}
                              className="font-medium hover:text-primary transition-colors"
                            >
                              {trade.symbol}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <TradeBadge side={trade.side} />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(trade.quantity).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${Number(trade.entry_price).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {trade.exit_price ? `$${Number(trade.exit_price).toFixed(2)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <PnLBadge value={metrics.netPnL} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {metrics.plannedRisk ? (
                              <span className="text-muted-foreground">
                                ${metrics.plannedRisk.toFixed(0)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <PnLBadge value={metrics.realizedR || 0} format="r" />
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm text-muted-foreground">
                            {duration}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {trade.strategy?.name || '-'}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link to={`/trades/${trade.id}`}>Edit</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(trade.id)}
                                  className="text-destructive"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTrades.size} trade(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected trades.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Strategy Update Dialog */}
      <Dialog open={showStrategyDialog} onOpenChange={setShowStrategyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Strategy for {selectedTrades.size} trade(s)</DialogTitle>
            <DialogDescription>
              Choose a strategy to apply to all selected trades.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={bulkStrategyId} onValueChange={setBulkStrategyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Strategy</SelectItem>
                {strategies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStrategyDialog(false)} disabled={bulkUpdating}>
              Cancel
            </Button>
            <Button onClick={handleBulkStrategyUpdate} disabled={bulkUpdating || !bulkStrategyId}>
              {bulkUpdating ? 'Updating...' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Risk Update Dialog */}
      <Dialog open={showRiskDialog} onOpenChange={setShowRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Risk for {selectedTrades.size} trade(s)</DialogTitle>
            <DialogDescription>
              Update risk parameters for all selected trades. Leave empty to skip a field.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulkStopLoss">Stop Loss Price</Label>
              <Input
                id="bulkStopLoss"
                type="number"
                step="0.01"
                placeholder="Enter stop loss price"
                value={bulkStopLoss}
                onChange={(e) => setBulkStopLoss(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkPlannedRisk">Planned Risk ($)</Label>
              <Input
                id="bulkPlannedRisk"
                type="number"
                step="0.01"
                placeholder="Enter planned risk amount"
                value={bulkPlannedRisk}
                onChange={(e) => setBulkPlannedRisk(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRiskDialog(false)} disabled={bulkUpdating}>
              Cancel
            </Button>
            <Button onClick={handleBulkRiskUpdate} disabled={bulkUpdating}>
              {bulkUpdating ? 'Updating...' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
