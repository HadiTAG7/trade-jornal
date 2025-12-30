import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, MoreHorizontal, Trash2, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { TradeBadge, PnLBadge } from '@/components/ui/trade-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { TradeFiltersComponent } from '@/components/TradeFilters';
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
import { useTradeFilters } from '@/hooks/useTradeFilters';
import { Trade, Strategy, Account } from '@/types/trade';
import { calculateTradeMetrics, formatCurrency, formatR } from '@/lib/calculations';
import { format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
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
  const [searchParams] = useSearchParams();
  const { filters, setFilter, setDatePreset, clearDateFilters, filterTrades } = useTradeFilters();
  
  // Build the current search string to pass to trade detail for filter preservation
  const currentSearchString = searchParams.toString() ? `?${searchParams.toString()}` : '';
  
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem('tradesRowsPerPage');
    return saved ? parseInt(saved, 10) : 50;
  });

  useEffect(() => {
    if (user) {
      Promise.all([fetchTrades(), fetchStrategies(), fetchAccounts()]);
    }
  }, [user]);

  const fetchTrades = async () => {
    try {
      console.log('Fetching trades for user:', user?.id);
      // Fetch all trades - use a high limit to get all rows (default is 1000)
      const { data, error } = await supabase
        .from('trades')
        .select('*, strategies(*), accounts(*)')
        .eq('user_id', user?.id)
        .order('entry_datetime', { ascending: false })
        .limit(10000);

      console.log('Trades fetched:', data?.length, 'Error:', error);
      
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
      
      console.log('Typed trades set:', typedTrades.length);
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

  const filteredTrades = filterTrades(trades);
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredTrades.length / rowsPerPage);
  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredTrades.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredTrades, currentPage, rowsPerPage]);
  
  // Reset to page 1 when filters change
  const filtersKey = `${filters.searchQuery}-${filters.sideFilter}-${filters.strategyFilter}-${filters.dateFrom?.toISOString()}-${filters.dateTo?.toISOString()}`;
  useEffect(() => {
    setCurrentPage(1);
  }, [filtersKey]);
  
  // Persist rows per page
  useEffect(() => {
    localStorage.setItem('tradesRowsPerPage', rowsPerPage.toString());
  }, [rowsPerPage]);
  
  const handleRowsPerPageChange = (value: string) => {
    setRowsPerPage(parseInt(value, 10));
    setCurrentPage(1);
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
      // Select all on current page
      setSelectedTrades(new Set(paginatedTrades.map(t => t.id)));
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

  const allSelected = paginatedTrades.length > 0 && paginatedTrades.every(t => selectedTrades.has(t.id));
  const someSelected = paginatedTrades.some(t => selectedTrades.has(t.id));

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
              <Link to="/trades/new" state={{ from: currentSearchString }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Trade
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
                        />
                      </TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead>Exit</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Entry Price</TableHead>
                      <TableHead className="text-right">Exit Price</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                      <TableHead className="text-right">P/L (R)</TableHead>
                      <TableHead className="text-right">Risk ($)</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Strategy</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTrades.map((trade) => {
                      const metrics = calculateTradeMetrics(trade);
                      const isSelected = selectedTrades.has(trade.id);
                      return (
                        <TableRow 
                          key={trade.id} 
                          className={cn(
                            "cursor-pointer",
                            isSelected && "bg-muted/50"
                          )}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectTrade(trade.id, checked as boolean)}
                              aria-label={`Select trade ${trade.symbol}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{format(new Date(trade.entry_datetime), 'MMM d, yyyy')}</div>
                              <div className="text-muted-foreground text-xs">
                                {format(new Date(trade.entry_datetime), 'h:mm a')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {trade.exit_datetime ? (
                              <div className="text-sm">
                                <div>{format(new Date(trade.exit_datetime), 'MMM d, yyyy')}</div>
                                <div className="text-muted-foreground text-xs">
                                  {format(new Date(trade.exit_datetime), 'h:mm a')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Open</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Link 
                              to={`/trades/${trade.id}`}
                              state={{ from: currentSearchString }}
                              className="font-medium hover:underline"
                            >
                              {trade.symbol}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <TradeBadge side={trade.side} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {Number(trade.quantity).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(trade.entry_price)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {trade.exit_price ? formatCurrency(trade.exit_price) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <PnLBadge value={metrics.netPnL} />
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              "font-mono text-sm",
                              metrics.realizedR && metrics.realizedR >= 0 ? "text-profit" : "text-loss"
                            )}>
                              {formatR(metrics.realizedR)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {metrics.plannedRisk ? formatCurrency(metrics.plannedRisk) : '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDuration(trade.entry_datetime, trade.exit_datetime)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {trade.strategy?.name || '-'}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link to={`/trades/${trade.id}`}>View Details</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => handleDelete(trade.id)}
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
          
          {/* Pagination Controls */}
          {filteredTrades.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={rowsPerPage.toString()} onValueChange={handleRowsPerPageChange}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, filteredTrades.length)} of {filteredTrades.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTrades.size} trade(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All selected trades will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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

      {/* Bulk Strategy Dialog */}
      <Dialog open={showStrategyDialog} onOpenChange={setShowStrategyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Strategy for {selectedTrades.size} trade(s)</DialogTitle>
            <DialogDescription>
              Apply a strategy to all selected trades
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Strategy</Label>
            <Select value={bulkStrategyId} onValueChange={setBulkStrategyId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select strategy" />
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
            <Button variant="outline" onClick={() => setShowStrategyDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkStrategyUpdate} disabled={bulkUpdating || !bulkStrategyId}>
              {bulkUpdating ? 'Updating...' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Risk Dialog */}
      <Dialog open={showRiskDialog} onOpenChange={setShowRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Risk for {selectedTrades.size} trade(s)</DialogTitle>
            <DialogDescription>
              Set stop loss and planned risk for all selected trades
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Stop Loss Price</Label>
              <Input
                type="number"
                step="0.01"
                value={bulkStopLoss}
                onChange={(e) => setBulkStopLoss(e.target.value)}
                placeholder="Leave empty to keep current"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Planned Risk ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={bulkPlannedRisk}
                onChange={(e) => setBulkPlannedRisk(e.target.value)}
                placeholder="Leave empty to keep current"
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRiskDialog(false)}>
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
