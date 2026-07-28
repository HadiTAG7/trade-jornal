import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Strategy, Trade } from '@/types/trade';
import { bulkUpdate, fetchAll, updateItem } from '@/lib/db';
import { calculateTradeMetrics, formatCurrency } from '@/lib/calculations';
import { closedDayKey } from '@/lib/tradeStatus';
import { toTrades } from '@/lib/tradeMapping';
import { toast } from '@/hooks/use-toast';

/**
 * Fixed planned risk per strategy, and applying it to broker-synced trades.
 *
 * The broker sends a stop with every trade, so planned risk came out as
 * |entry − stop| × quantity — a different number on each one. R multiples were
 * therefore not comparable between two trades of the same strategy. A strategy
 * risks a set amount per trade, so that is what it stores.
 *
 * The value lands in `planned_risk_override`, which the sync is forbidden from
 * overwriting, so any individual trade can still be corrected by hand afterwards
 * and will survive every future sync.
 *
 * Applying it also clears `planned_r_override`. An earlier version of the sync
 * stored the broker's own R multiple there, and it takes precedence over every
 * calculation — so without clearing it the strategy risk would change nothing.
 * Only synced trades are touched, where the sync is provably what wrote it.
 *
 * Nothing is written until the exact list of affected trades has been shown.
 * Risk sizing changes over time, so "apply this number to everything" is the
 * wrong default — the date range and the preview exist so a past period that was
 * sized differently can be left alone.
 */

interface Props {
  uid: string;
  strategies: Strategy[];
  onSaved: () => void;
}

interface Affected {
  trade: Trade;
  strategyName: string;
  currentRisk: number | null;
  newRisk: number;
  hadBrokerR: boolean;
}

export function StrategyRisk({ uid, strategies, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<{ affected: Affected[]; syncedTotal: number } | null>(null);

  const valueFor = (s: Strategy) =>
    drafts[s.id] !== undefined ? drafts[s.id] : s.default_risk != null ? String(s.default_risk) : '';

  const save = async (s: Strategy) => {
    const raw = valueFor(s).trim();
    const parsed = raw === '' ? null : Number(raw);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast({ title: 'Enter a positive amount, or leave it empty', variant: 'destructive' });
      return;
    }
    setSaving(s.id);
    try {
      await updateItem(uid, 'strategies', s.id, { default_risk: parsed });
      toast({
        title: `${s.name}: risk ${parsed === null ? 'cleared' : formatCurrency(parsed)}`,
        description:
          parsed === null
            ? 'New synced trades will fall back to the broker stop.'
            : 'Applies to trades synced from now on. Use the preview below for existing ones.',
      });
      setDrafts((d) => {
        const next = { ...d };
        delete next[s.id];
        return next;
      });
      // The stored numbers changed, so any preview on screen is out of date.
      setPreview(null);
      onSaved();
    } catch (error) {
      toast({
        title: 'Could not save',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  const buildPreview = async () => {
    setLoading(true);
    try {
      const all = toTrades(await fetchAll<Trade>(uid, 'trades'));
      // Only trades the broker sync created. Everything imported from a file is
      // left alone — that is the bulk of the history.
      const synced = all.filter((t) => t.source === 'Schwab');
      const fromKey = from ? format(from, 'yyyy-MM-dd') : null;
      const toKey = to ? format(to, 'yyyy-MM-dd') : null;

      const affected: Affected[] = [];
      for (const strategy of strategies) {
        const risk = strategy.default_risk;
        if (risk == null) continue;
        for (const trade of synced) {
          if (trade.strategy_id !== strategy.id) continue;
          if (!overwrite && trade.planned_risk_override != null) continue;
          const day = closedDayKey(trade);
          if (fromKey && (!day || day < fromKey)) continue;
          if (toKey && (!day || day > toKey)) continue;
          affected.push({
            trade,
            strategyName: strategy.name,
            currentRisk: calculateTradeMetrics(trade).plannedRisk,
            newRisk: risk,
            hadBrokerR: trade.planned_r_override != null,
          });
        }
      }

      affected.sort((a, b) => (closedDayKey(a.trade) ?? '').localeCompare(closedDayKey(b.trade) ?? ''));
      setPreview({ affected, syncedTotal: synced.length });
    } catch (error) {
      toast({
        title: 'Could not read your trades',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const applyPreview = async () => {
    if (!preview || preview.affected.length === 0) return;
    setApplying(true);
    try {
      // Grouped by the value being written, so each batch is one update.
      const groups = new Map<string, Affected[]>();
      for (const item of preview.affected) {
        const key = `${item.newRisk}|${item.hadBrokerR}`;
        const list = groups.get(key);
        if (list) list.push(item);
        else groups.set(key, [item]);
      }

      let cleared = 0;
      for (const items of groups.values()) {
        const data: Record<string, unknown> = { planned_risk_override: items[0].newRisk };
        if (items[0].hadBrokerR) {
          data.planned_r_override = null;
          cleared += items.length;
        }
        await bulkUpdate(uid, 'trades', items.map((i) => i.trade.id), data);
      }

      toast({
        title: `${preview.affected.length} trades updated`,
        description: cleared > 0 ? `${cleared} had the broker's R multiple cleared` : undefined,
      });
      setPreview(null);
      onSaved();
    } catch (error) {
      toast({
        title: 'Could not apply',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const configured = strategies.filter((s) => s.default_risk != null);

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <p className="text-sm font-medium">Planned risk per trade</p>
        <p className="text-muted-foreground text-xs">
          What one trade of this strategy risks. Synced trades use this instead of the broker's
          stop, so their R multiples are comparable. Leave empty to use the stop.
        </p>
      </div>

      <div className="space-y-2">
        {strategies.map((strategy) => (
          <div key={strategy.id} className="flex items-end gap-3">
            <div className="flex flex-1 items-center gap-2 pb-2">
              <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: strategy.color }} />
              <span className="truncate text-sm">{strategy.name}</span>
            </div>
            <div className="w-32">
              <Label className="text-xs" htmlFor={`risk-${strategy.id}`}>
                Risk ($)
              </Label>
              <Input
                id={`risk-${strategy.id}`}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="from stop"
                value={valueFor(strategy)}
                onChange={(e) => setDrafts((d) => ({ ...d, [strategy.id]: e.target.value }))}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => save(strategy)}
              disabled={
                saving === strategy.id ||
                valueFor(strategy) ===
                  (strategy.default_risk != null ? String(strategy.default_risk) : '')
              }
            >
              {saving === strategy.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        ))}
        {strategies.length === 0 && (
          <p className="text-muted-foreground text-sm">Add a strategy first.</p>
        )}
      </div>

      {configured.length > 0 && (
        <div className="space-y-3 rounded-lg bg-muted/50 p-3">
          <div>
            <p className="text-sm font-medium">Apply to trades already synced</p>
            <p className="text-muted-foreground text-xs">
              Only trades pulled from your broker — imported files are never touched. If you
              sized differently in the past, set a date range so that period keeps its own risk.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Closed from</Label>
              <DateInput
                value={from}
                onChange={(d) => {
                  setFrom(d);
                  setPreview(null);
                }}
                placeholder="any date"
                className="w-[150px]"
              />
            </div>
            <div>
              <Label className="text-xs">Closed until</Label>
              <DateInput
                value={to}
                onChange={(d) => {
                  setTo(d);
                  setPreview(null);
                }}
                placeholder="any date"
                className="w-[150px]"
              />
            </div>
            <Button variant="outline" onClick={buildPreview} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Checking…' : 'Preview changes'}
            </Button>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => {
                setOverwrite(e.target.checked);
                setPreview(null);
              }}
              className="h-3.5 w-3.5"
            />
            Also replace trades where you already set a risk by hand
          </label>

          {preview && (
            <div className="space-y-2 rounded-md border border-border/60 bg-background p-3">
              {preview.affected.length === 0 ? (
                <p className="text-sm">
                  Nothing to change. None of your {preview.syncedTotal} synced trades match this
                  range and these strategies.
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    <span className="font-medium">{preview.affected.length}</span> of{' '}
                    {preview.syncedTotal} synced trades will change. Nothing else is touched.
                  </p>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr className="border-b">
                          <th className="py-1 text-left font-medium">Closed</th>
                          <th className="py-1 text-left font-medium">Symbol</th>
                          <th className="py-1 text-left font-medium">Strategy</th>
                          <th className="py-1 text-right font-medium">Risk now</th>
                          <th className="py-1 text-right font-medium">Becomes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.affected.map(({ trade, strategyName, currentRisk, newRisk }) => (
                          <tr key={trade.id} className="border-b border-border/40">
                            <td className="py-1 font-mono">{closedDayKey(trade) ?? '—'}</td>
                            <td className="py-1">{trade.symbol}</td>
                            <td className="py-1 text-muted-foreground">{strategyName}</td>
                            <td className="py-1 text-right font-mono">
                              {currentRisk != null ? formatCurrency(currentRisk) : '—'}
                            </td>
                            <td className="py-1 text-right font-mono">{formatCurrency(newRisk)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button onClick={applyPreview} disabled={applying}>
                    {applying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="mr-2 h-4 w-4" />
                    )}
                    {applying
                      ? 'Applying…'
                      : `Apply to these ${preview.affected.length} trades`}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
