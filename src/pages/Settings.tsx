import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Save, Download } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { fetchAll as dbFetchAll, insertItem, deleteItem } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { Account, Strategy, Tag, Mistake } from '@/types/trade';
import { exportAllData, downloadAsJson } from '@/lib/exportData';

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

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
    setAccounts(await dbFetchAll<Account>(user!.id, 'accounts', 'created_at').catch(() => []));
  };

  const fetchStrategies = async () => {
    setStrategies(await dbFetchAll<Strategy>(user!.id, 'strategies', 'created_at').catch(() => []));
  };

  const fetchTags = async () => {
    setTags(await dbFetchAll<Tag>(user!.id, 'tags', 'created_at').catch(() => []));
  };

  const fetchMistakes = async () => {
    setMistakes(await dbFetchAll<Mistake>(user!.id, 'mistakes', 'created_at').catch(() => []));
  };

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const data = await exportAllData(user.id, user.email ?? null, (table, done, total) => {
        setExportProgress(table === 'done' ? '' : `Exporting ${table} (${done + 1}/${total})…`);
      });
      const date = new Date().toISOString().slice(0, 10);
      downloadAsJson(data, `tradelog-export-${date}.json`);
      const totalRows = Object.values(data.row_counts).reduce((a, b) => a + b, 0);
      toast({
        title: 'Export complete',
        description: `${totalRows} rows exported across ${Object.keys(data.tables).length} tables.`,
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  };

  // CRUD handlers
  const handleAddAccount = async () => {
    if (!newAccount.name) return;
    setSaving('account');
    try {
      await insertItem(user!.id, 'accounts', { ...newAccount });
      await fetchAccounts();
      setNewAccount({ name: '', broker: '' });
      toast({ title: 'Account added' });
    } catch (error) {
      console.error('Error adding account:', error);
    }
    setSaving(null);
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Delete this account?')) return;
    await deleteItem(user!.id, 'accounts', id);
    await fetchAccounts();
  };

  const handleAddStrategy = async () => {
    if (!newStrategy.name) return;
    setSaving('strategy');
    try {
      await insertItem(user!.id, 'strategies', { ...newStrategy });
      await fetchStrategies();
      setNewStrategy({ name: '', description: '', color: '#6366f1' });
      toast({ title: 'Strategy added' });
    } catch (error) {
      console.error('Error adding strategy:', error);
    }
    setSaving(null);
  };

  const handleDeleteStrategy = async (id: string) => {
    if (!confirm('Delete this strategy?')) return;
    await deleteItem(user!.id, 'strategies', id);
    await fetchStrategies();
  };

  const handleAddTag = async () => {
    if (!newTag.name) return;
    setSaving('tag');
    try {
      await insertItem(user!.id, 'tags', { ...newTag });
      await fetchTags();
      setNewTag({ name: '', color: '#0ea5e9' });
      toast({ title: 'Tag added' });
    } catch (error) {
      console.error('Error adding tag:', error);
    }
    setSaving(null);
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm('Delete this tag?')) return;
    await deleteItem(user!.id, 'tags', id);
    await fetchTags();
  };

  const handleAddMistake = async () => {
    if (!newMistake.name) return;
    setSaving('mistake');
    try {
      await insertItem(user!.id, 'mistakes', { ...newMistake });
      await fetchMistakes();
      setNewMistake({ name: '', severity: 3 });
      toast({ title: 'Mistake type added' });
    } catch (error) {
      console.error('Error adding mistake:', error);
    }
    setSaving(null);
  };

  const handleDeleteMistake = async (id: string) => {
    if (!confirm('Delete this mistake type?')) return;
    await deleteItem(user!.id, 'mistakes', id);
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
            <TabsTrigger value="data">Data</TabsTrigger>
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

          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle>Export Data</CardTitle>
                <CardDescription>
                  Download all your data (trades, accounts, strategies, tags, journal entries and more)
                  as a single JSON file. Use it as a backup or to migrate to another platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={handleExportData} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {exporting ? 'Exporting…' : 'Export all data (JSON)'}
                </Button>
                {exportProgress && (
                  <p className="text-muted-foreground text-sm">{exportProgress}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
