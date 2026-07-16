import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAll, fetchById, insertItem, updateItem } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { Trade, Strategy, Account, TradeSide } from '@/types/trade';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isNew = id === 'new';
  
  // Preserve the referrer's search params to restore filters
  const referrerSearch = location.state?.from || '';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [formData, setFormData] = useState({
    symbol: '',
    side: 'LONG' as TradeSide,
    quantity: '',
    entry_price: '',
    exit_price: '',
    entry_datetime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    exit_datetime: '',
    stop_loss: '',
    fees: '0',
    commissions: '0',
    strategy_id: '',
    account_id: '',
    notes: '',
    what_went_well: '',
    what_to_improve: '',
  });

  useEffect(() => {
    if (user) {
      fetchStrategies();
      fetchAccounts();
      if (!isNew && id) {
        fetchTrade(id);
      }
    }
  }, [user, id, isNew]);

  const fetchTrade = async (tradeId: string) => {
    try {
      const data = await fetchById<Trade>(user!.id, 'trades', tradeId);

      if (!data) {
        toast.error('Trade not found');
        navigate(`/trades${referrerSearch}`);
        return;
      }

      setFormData({
        symbol: data.symbol || '',
        side: data.side as TradeSide,
        quantity: String(data.quantity),
        entry_price: String(data.entry_price),
        exit_price: data.exit_price ? String(data.exit_price) : '',
        entry_datetime: data.entry_datetime ? format(new Date(data.entry_datetime), "yyyy-MM-dd'T'HH:mm") : '',
        exit_datetime: data.exit_datetime ? format(new Date(data.exit_datetime), "yyyy-MM-dd'T'HH:mm") : '',
        stop_loss: data.stop_loss ? String(data.stop_loss) : '',
        fees: String(data.fees || 0),
        commissions: String(data.commissions || 0),
        strategy_id: data.strategy_id || '',
        account_id: data.account_id || '',
        notes: data.notes || '',
        what_went_well: data.what_went_well || '',
        what_to_improve: data.what_to_improve || '',
      });
    } catch (error) {
      console.error('Error fetching trade:', error);
      toast.error('Failed to load trade');
      navigate(`/trades${referrerSearch}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchStrategies = async () => {
    if (!user) return;
    setStrategies(await fetchAll<Strategy>(user.id, 'strategies').catch(() => []));
  };

  const fetchAccounts = async () => {
    if (!user) return;
    setAccounts(await fetchAll<Account>(user.id, 'accounts').catch(() => []));
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.symbol || !formData.quantity || !formData.entry_price || !formData.entry_datetime) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const tradeData = {
        symbol: formData.symbol.toUpperCase(),
        side: formData.side,
        quantity: parseFloat(formData.quantity),
        entry_price: parseFloat(formData.entry_price),
        exit_price: formData.exit_price ? parseFloat(formData.exit_price) : null,
        entry_datetime: new Date(formData.entry_datetime).toISOString(),
        exit_datetime: formData.exit_datetime ? new Date(formData.exit_datetime).toISOString() : null,
        stop_loss: formData.stop_loss ? parseFloat(formData.stop_loss) : null,
        fees: parseFloat(formData.fees) || 0,
        commissions: parseFloat(formData.commissions) || 0,
        strategy_id: formData.strategy_id || null,
        account_id: formData.account_id || null,
        notes: formData.notes || null,
        what_went_well: formData.what_went_well || null,
        what_to_improve: formData.what_to_improve || null,
        user_id: user.id,
      };

      if (isNew) {
        await insertItem(user.id, 'trades', tradeData);
        toast.success('Trade created');
      } else {
        await updateItem(user.id, 'trades', id!, tradeData);
        toast.success('Trade updated');
      }

      // Navigate back preserving filters
      navigate(`/trades${referrerSearch}`);
    } catch (error) {
      console.error('Error saving trade:', error);
      toast.error('Failed to save trade');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/trades${referrerSearch}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isNew ? 'New Trade' : `Edit ${formData.symbol}`}
              </h1>
              <p className="text-muted-foreground">
                {isNew ? 'Add a new trade manually' : 'Update trade details'}
              </p>
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Trade Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol *</Label>
                  <Input
                    id="symbol"
                    value={formData.symbol}
                    onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="side">Side *</Label>
                  <Select value={formData.side} onValueChange={(v) => handleChange('side', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LONG">Long</SelectItem>
                      <SelectItem value="SHORT">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="any"
                    value={formData.quantity}
                    onChange={(e) => handleChange('quantity', e.target.value)}
                    placeholder="100"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stop_loss">Stop Loss</Label>
                  <Input
                    id="stop_loss"
                    type="number"
                    step="any"
                    value={formData.stop_loss}
                    onChange={(e) => handleChange('stop_loss', e.target.value)}
                    placeholder="149.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry_price">Entry Price *</Label>
                  <Input
                    id="entry_price"
                    type="number"
                    step="any"
                    value={formData.entry_price}
                    onChange={(e) => handleChange('entry_price', e.target.value)}
                    placeholder="150.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exit_price">Exit Price</Label>
                  <Input
                    id="exit_price"
                    type="number"
                    step="any"
                    value={formData.exit_price}
                    onChange={(e) => handleChange('exit_price', e.target.value)}
                    placeholder="155.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry_datetime">Entry Date/Time *</Label>
                  <Input
                    id="entry_datetime"
                    type="datetime-local"
                    value={formData.entry_datetime}
                    onChange={(e) => handleChange('entry_datetime', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exit_datetime">Exit Date/Time</Label>
                  <Input
                    id="exit_datetime"
                    type="datetime-local"
                    value={formData.exit_datetime}
                    onChange={(e) => handleChange('exit_datetime', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fees & Categories */}
          <Card>
            <CardHeader>
              <CardTitle>Fees & Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fees">Fees</Label>
                  <Input
                    id="fees"
                    type="number"
                    step="any"
                    value={formData.fees}
                    onChange={(e) => handleChange('fees', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissions">Commissions</Label>
                  <Input
                    id="commissions"
                    type="number"
                    step="any"
                    value={formData.commissions}
                    onChange={(e) => handleChange('commissions', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="strategy">Strategy</Label>
                <Select value={formData.strategy_id} onValueChange={(v) => handleChange('strategy_id', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No strategy</SelectItem>
                    {strategies.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account">Account</Label>
                <Select value={formData.account_id} onValueChange={(v) => handleChange('account_id', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No account</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Notes & Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Trade Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Notes about this trade..."
                  rows={3}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="what_went_well">What went well?</Label>
                  <Textarea
                    id="what_went_well"
                    value={formData.what_went_well}
                    onChange={(e) => handleChange('what_went_well', e.target.value)}
                    placeholder="What worked in this trade..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="what_to_improve">What to improve?</Label>
                  <Textarea
                    id="what_to_improve"
                    value={formData.what_to_improve}
                    onChange={(e) => handleChange('what_to_improve', e.target.value)}
                    placeholder="Areas for improvement..."
                    rows={2}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </MainLayout>
  );
}
