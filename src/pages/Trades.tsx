import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Filter, Search, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { TradeBadge, PnLBadge } from '@/components/ui/trade-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Trade, TradeSide, Strategy, Account } from '@/types/trade';
import { calculateTradeMetrics, formatCurrency, formatR } from '@/lib/calculations';
import { format } from 'date-fns';

export default function Trades() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sideFilter, setSideFilter] = useState<string>('all');
  const [strategyFilter, setStrategyFilter] = useState<string>('all');

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
    return matchesSearch && matchesSide && matchesStrategy;
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trade?')) return;
    
    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (!error) {
      setTrades(trades.filter(t => t.id !== id));
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trades</h1>
            <p className="text-muted-foreground">
              {filteredTrades.length} trades
            </p>
          </div>
          <Button asChild>
            <Link to="/trades/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Trade
            </Link>
          </Button>
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
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Exit</TableHead>
                      <TableHead className="text-right">Net P/L</TableHead>
                      <TableHead className="text-right">R</TableHead>
                      <TableHead>Strategy</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrades.map((trade) => {
                      const metrics = calculateTradeMetrics(trade);
                      return (
                        <TableRow key={trade.id} className="group">
                          <TableCell className="font-mono text-sm">
                            {format(new Date(trade.entry_datetime), 'MM/dd/yy')}
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
                          <TableCell className="text-right">
                            <PnLBadge value={metrics.realizedR || 0} format="r" />
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
    </MainLayout>
  );
}
