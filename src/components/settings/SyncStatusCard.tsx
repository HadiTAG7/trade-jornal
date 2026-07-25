import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll, fetchById } from '@/lib/db';
import { syncTradesNow } from '@/lib/syncTrades';
import { toast } from '@/hooks/use-toast';

/**
 * Until now a broker sync could fail twice a day for a week and the app would
 * look perfectly healthy — the cron's error went to Vercel's logs and nowhere
 * the owner would see. The sync writes `sync_meta/last` on every run now, and
 * this card is where it surfaces, including a warning when the data has simply
 * gone stale.
 */

/** Beyond this the data is suspect: the sync runs twice a day. */
const STALE_HOURS = 36;

interface SyncRun {
  ok: boolean;
  trigger: 'cron' | 'manual';
  started_at: string;
  finished_at: string;
  duration_ms: number;
  rows: number;
  trades: number;
  created: number;
  written: number;
  unchanged: number;
  fill_derived_skipped: number;
  pruned: number;
  prune_skipped: string | null;
  deduped_cross_source: number;
  dedupe_candidates: number;
  warnings?: string[];
  error: string | null;
}

interface ImportRecord {
  id: string;
  source_name?: string;
  filename?: string;
  rows_total?: number;
  rows_new?: number;
  rows_skipped?: number;
  created_at?: string;
}

function hoursSince(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 3_600_000;
}

/**
 * `formatDistanceToNow` throws on an unparseable date, which would blank the
 * whole Settings page over a cosmetic detail. A record written by an older
 * version of the sync is exactly the sort of thing that gets here.
 */
function ago(iso: string | undefined): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return 'at an unknown time';
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function SyncStatusCard() {
  const { user } = useAuth();
  const [last, setLast] = useState<SyncRun | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [meta, recent] = await Promise.all([
        fetchById<SyncRun & { id: string }>(user.id, 'sync_meta', 'last'),
        fetchAll<ImportRecord>(user.id, 'imports', 'created_at', 'desc'),
      ]);
      setLast(meta);
      setImports(recent.slice(0, 5));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not read the sync log');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncTradesNow();
      if (result.ok) {
        const counts = [
          result.created ? `${result.created} new` : null,
          result.written ? `${result.written} written` : null,
          result.unchanged ? `${result.unchanged} unchanged` : null,
        ].filter(Boolean).join(' · ');
        toast({
          title: 'Sync complete',
          description: counts || 'Nothing to update — you were already up to date.',
        });
      } else {
        toast({
          title: 'Sync failed',
          description: result.error ?? 'Unknown error',
          variant: 'destructive',
        });
      }
    } finally {
      setSyncing(false);
      load();
    }
  };

  const stale = last?.ok && hoursSince(last.finished_at) > STALE_HOURS;
  const failed = last && !last.ok;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broker Sync</CardTitle>
        <CardDescription>
          Trades sync automatically twice a day, at 6 PM and 11 PM Saudi time. Use this
          only when you want the newest trades right away.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>The last sync failed</AlertTitle>
            <AlertDescription>
              <span className="block">{last.error}</span>
              <span className="mt-1 block text-xs opacity-80">
                {ago(last.finished_at)} · triggered by{' '}
                {last.trigger === 'cron' ? 'the schedule' : 'you'}
              </span>
            </AlertDescription>
          </Alert>
        )}

        {stale && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Your trades may be out of date</AlertTitle>
            <AlertDescription>
              The last successful sync was {ago(last!.finished_at)}, and it should run twice
              a day. Sync now, and if that fails the broker service is probably unreachable.
            </AlertDescription>
          </Alert>
        )}

        {!loading && !last && !loadError && (
          <p className="text-muted-foreground text-sm">
            No sync has run yet. Press <span className="font-medium">Sync now</span> to pull your
            trades for the first time.
          </p>
        )}

        {loadError && (
          <p className="text-destructive text-sm">Could not read the sync log: {loadError}</p>
        )}

        {last?.ok && !stale && (
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
            <div>
              <p>
                Last synced{' '}
                <span className="font-medium">{ago(last.finished_at)}</span>{' '}
                · {last.trades} trades from the broker
              </p>
              <p className="text-muted-foreground text-xs">
                {last.created > 0 ? `${last.created} new · ` : ''}
                {last.written} written · {last.unchanged} already up to date
                {last.pruned > 0 ? ` · ${last.pruned} removed` : ''}
                {last.fill_derived_skipped > 0
                  ? ` · ${last.fill_derived_skipped} kept your own fills`
                  : ''}
              </p>
            </div>
          </div>
        )}

        {last?.warnings && last.warnings.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {last.warnings.length} warning{last.warnings.length > 1 ? 's' : ''} from the last run
            </AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc space-y-0.5 text-xs">
                {last.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {last?.prune_skipped && (
          <p className="text-muted-foreground text-xs">
            Cleanup was held back this run ({last.prune_skipped}) — nothing was deleted.
          </p>
        )}

        <Button onClick={handleSyncNow} disabled={syncing}>
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>

        {imports.length > 0 && (
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium">Recent file imports</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {imports.map((imp) => (
                <li key={imp.id} className="flex flex-wrap justify-between gap-2">
                  <span className="truncate">
                    {imp.filename || 'unknown file'}
                    {imp.source_name ? ` · ${imp.source_name}` : ''}
                  </span>
                  <span className="font-mono">
                    {imp.rows_new ?? 0} added
                    {imp.rows_skipped ? `, ${imp.rows_skipped} skipped` : ''}
                    {imp.created_at ? ` · ${ago(imp.created_at)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
