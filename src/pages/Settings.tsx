import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Account, Strategy, Tag, Mistake } from '@/types/trade';

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // New item forms
  const [newAccount, setNewAccount] = useState({ name: '', broker: '' });
  const [newStrategy, setNewStrategy] = useState({ name: '', description: '', color: '#6366f1' });
  const [newTag, setNewTag] = useState({ name: '', color: '#0ea5e9' });
  const [newMistake, setNewMistake] = useState({ name: '', severity: 3 });

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchAccounts(), fetchStrategies(), fetchTags(), fetchMistakes()]);
    setLoading(false);
  };

  const fetchAccounts = async () => {
    const { data } = await supabase.from('accounts').select('*').eq('user_id', user?.id).order('created_at');
    setAccounts(data || []);
  };

  const fetchStrategies = async () => {
    const { data } = await supabase.from('strategies').select('*').eq('user_id', user?.id).order('created_at');
    setStrategies(data || []);
  };

  const fetchTags = async () => {
    const { data } = await supabase.from('tags').select('*').eq('user_id', user?.id).order('created_at');
    setTags(data || []);
  };

  const fetchMistakes = async () => {
    const { data } = await supabase.from('mistakes').select('*').eq('user_id', user?.id).order('created_at');
    setMistakes(data || []);
  };

  // CRUD handlers
  const handleAddAccount = async () => {
    if (!newAccount.name) return;
    setSaving('account');
    const { error } = await supabase.from('accounts').insert({ ...newAccount, user_id: user?.id });
    if (!error) {
      await fetchAccounts();
      setNewAccount({ name: '', broker: '' });
      toast({ title: 'Account added' });
    }
    setSaving(null);
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Delete this account?')) return;
    await supabase.from('accounts').delete().eq('id', id);
    await fetchAccounts();
  };

  const handleAddStrategy = async () => {
    if (!newStrategy.name) return;
    setSaving('strategy');
    const { error } = await supabase.from('strategies').insert({ ...newStrategy, user_id: user?.id });
    if (!error) {
      await fetchStrategies();
      setNewStrategy({ name: '', description: '', color: '#6366f1' });
      toast({ title: 'Strategy added' });
    }
    setSaving(null);
  };

  const handleDeleteStrategy = async (id: string) => {
    if (!confirm('Delete this strategy?')) return;
    await supabase.from('strategies').delete().eq('id', id);
    await fetchStrategies();
  };

  const handleAddTag = async () => {
    if (!newTag.name) return;
    setSaving('tag');
    const { error } = await supabase.from('tags').insert({ ...newTag, user_id: user?.id });
    if (!error) {
      await fetchTags();
      setNewTag({ name: '', color: '#0ea5e9' });
      toast({ title: 'Tag added' });
    }
    setSaving(null);
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm('Delete this tag?')) return;
    await supabase.from('tags').delete().eq('id', id);
    await fetchTags();
  };

  const handleAddMistake = async () => {
    if (!newMistake.name) return;
    setSaving('mistake');
    const { error } = await supabase.from('mistakes').insert({ ...newMistake, user_id: user?.id });
    if (!error) {
      await fetchMistakes();
      setNewMistake({ name: '', severity: 3 });
      toast({ title: 'Mistake type added' });
    }
    setSaving(null);
  };

  const handleDeleteMistake = async (id: string) => {
    if (!confirm('Delete this mistake type?')) return;
    await supabase.from('mistakes').delete().eq('id', id);
    await fetchMistakes();
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-muted-foreground">Loading settings...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your accounts, strategies, tags, and more</p>
        </div>

        <Tabs defaultValue="accounts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="strategies">Strategies</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="mistakes">Mistakes</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts">
            <Card>
              <CardHeader>
                <CardTitle>Trading Accounts</CardTitle>
                <CardDescription>Manage your broker accounts for tracking</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Account Name</Label>
                    <Input
                      placeholder="e.g. Main Account"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Broker</Label>
                    <Input
                      placeholder="e.g. TD Ameritrade"
                      value={newAccount.broker}
                      onChange={(e) => setNewAccount({ ...newAccount, broker: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddAccount} disabled={saving === 'account'}>
                      {saving === 'account' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {accounts.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">{acc.name}</p>
                        <p className="text-sm text-muted-foreground">{acc.broker || 'No broker specified'}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteAccount(acc.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {accounts.length === 0 && (
                    <p className="text-muted-foreground text-sm">No accounts yet. Add your first account above.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="strategies">
            <Card>
              <CardHeader>
                <CardTitle>Trading Strategies</CardTitle>
                <CardDescription>Define your trading strategies for categorization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Strategy Name</Label>
                    <Input
                      placeholder="e.g. Momentum Breakout"
                      value={newStrategy.name}
                      onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                    />
                  </div>
                  <div className="w-20">
                    <Label>Color</Label>
                    <Input
                      type="color"
                      value={newStrategy.color}
                      onChange={(e) => setNewStrategy({ ...newStrategy, color: e.target.value })}
                      className="h-10 p-1 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddStrategy} disabled={saving === 'strategy'}>
                      {saving === 'strategy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {strategies.map((strat) => (
                    <div key={strat.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: strat.color }} />
                        <p className="font-medium">{strat.name}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteStrategy(strat.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {strategies.length === 0 && (
                    <p className="text-muted-foreground text-sm">No strategies yet. Add your first strategy above.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tags">
            <Card>
              <CardHeader>
                <CardTitle>Trade Tags</CardTitle>
                <CardDescription>Create tags to categorize and filter your trades</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Tag Name</Label>
                    <Input
                      placeholder="e.g. High Conviction"
                      value={newTag.name}
                      onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                    />
                  </div>
                  <div className="w-20">
                    <Label>Color</Label>
                    <Input
                      type="color"
                      value={newTag.color}
                      onChange={(e) => setNewTag({ ...newTag, color: e.target.value })}
                      className="h-10 p-1 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddTag} disabled={saving === 'tag'}>
                      {saving === 'tag' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
                    >
                      {tag.name}
                      <button onClick={() => handleDeleteTag(tag.id)} className="hover:opacity-70">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {tags.length === 0 && (
                    <p className="text-muted-foreground text-sm">No tags yet. Add your first tag above.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mistakes">
            <Card>
              <CardHeader>
                <CardTitle>Mistake Types</CardTitle>
                <CardDescription>Track common trading mistakes to improve your discipline</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Mistake Name</Label>
                    <Input
                      placeholder="e.g. FOMO Entry"
                      value={newMistake.name}
                      onChange={(e) => setNewMistake({ ...newMistake, name: e.target.value })}
                    />
                  </div>
                  <div className="w-32">
                    <Label>Severity (1-5)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={newMistake.severity}
                      onChange={(e) => setNewMistake({ ...newMistake, severity: parseInt(e.target.value) || 3 })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddMistake} disabled={saving === 'mistake'}>
                      {saving === 'mistake' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {mistakes.map((mistake) => (
                    <div key={mistake.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={i < mistake.severity ? 'text-warning' : 'text-muted'}>●</span>
                          ))}
                        </div>
                        <p className="font-medium">{mistake.name}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteMistake(mistake.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {mistakes.length === 0 && (
                    <p className="text-muted-foreground text-sm">No mistake types yet. Add your first one above.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
