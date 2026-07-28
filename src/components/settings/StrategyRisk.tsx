import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Strategy, Trade } from '@/types/trade';
import { bulkUpdate, fetchAll, updateItem } from '@/lib/db';
import { formatCurrency } from '@/lib/calculations';
import { toast } from '@/hooks/use-toast';

/**
 * Fixed planned risk per strategy, and applying it to broker-synced trades.
 *
 * The broker sends a stop with every trade, so planned risk came out as
 * |entry − stop| × quantity — a different number on each one ($299, $60, $58…).
 * R multiples were therefore not comparable between two trades of the same
 * strategy. A strategy risks a set amount per trade, so that is what it stores.
 *
 * The value lands in `planned_risk_override`, which the sync is forbidden from
 * overwriting, so any individual trade can still be corrected by hand afterwards
 * and will survive every future sync.
 *
 * Applying it also has to clear `planned_r_override`. An earlier version of the
 * sync stored the broker's own R multiple in that field, and it takes precedence
 * over every calculation — so on the existing synced trades the strategy risk
 * would have changed nothing at all without this. It is only cleared on synced
 * trades, where the sync is provably what wrote it.
 */

interface Props {
  uid: string;
  strategies: Strategy[];
  onSaved: () => void;
}

export function StrategyRisk({ uid, strategies, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

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
            : 'Applies to trades synced from now on. Use the button below for existing ones.',
      });
      setDrafts((d) => {
        const next = { ...d };
        delete next[s.id];
        return next;
      });
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

  const applyToSynced = async () => {
    setApplying(true);
    try {
      const trades = await fetchAll<Trade>(uid, 'trades');
      // Only trades the broker sync created; hand-entered ones are left alone.
      const synced = trades.filter((t) => t.source === 'Schwab');
      let updated = 0;
      let skipped = 0;
      let clearedBrokerR = 0;

      for (const strategy of strategies) {
        const risk = strategy.default_risk;
        if (risk == null) continue;
        const mine = synced.filter((t) => t.strategy_id === strategy.id);
        const targets = mine.filter((t) => overwrite || t.planned_risk_override == null);
        skipped += mine.length - targets.length;
        if (targets.length === 0) continue;

        // Trades still carrying the broker's R from the old sync need it cleared,
        // or it keeps overriding the risk we just set. Split the batch so a trade
        // that has no such value isn't written a redundant field.
        const withBrokerR = targets.filter((t) => t.planned_r_override != null);
        const withoutBrokerR = targets.filter((t) => t.planned_r_override == null);

        if (withBrokerR.length > 0) {
          await bulkUpdate(uid, 'trades', withBrokerR.map((t) => t.id), {
            planned_risk_override: risk,
            planned_r_override: null,
          });
          clearedBrokerR += withBrokerR.length;
        }
        if (withoutBrokerR.length > 0) {
          await bulkUpdate(uid, 'trades', withoutBrokerR.map((t) => t.id), {
            planned_risk_override: risk,
          });
        }
        updated += targets.length;
      }

      const withoutRisk = synced.filter(
        (t) => !strategies.some((s) => s.id === t.strategy_id && s.default_risk != null),
      ).length;

      toast({
        title: updated > 0 ? `${updated} synced trades updated` : 'Nothing to change',
        description: [
          clearedBrokerR > 0 ? `${clearedBrokerR} had the broker's R multiple cleared` : null,
          skipped > 0 ? `${skipped} kept their existing risk` : null,
          withoutRisk > 0 ? `${withoutRisk} have no strategy risk set` : null,
        ].filter(Boolean).join(' · ') || 'Every synced trade already matches its strategy.',
      });
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
              disabled={saving === strategy.id || valueFor(strategy) ===
                (strategy.default_risk != null ? String(strategy.default_risk) : '')}
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
        <div className="space-y-2 rounded-lg bg-muted/50 p-3">
          <p className="text-sm">
            Apply to trades already synced:{' '}
            {configured.map((s) => `${s.name} ${formatCurrency(s.default_risk!)}`).join(' · ')}
          </p>
          <p className="text-muted-foreground text-xs">
            This also clears the R multiple an older version of the sync copied from the broker,
            which currently overrides everything — without that the risk above would change
            nothing. Only synced trades are touched.
          </p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Also replace trades where you already set a risk by hand
          </label>
          <Button onClick={applyToSynced} disabled={applying} variant="secondary">
            {applying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {applying ? 'Applying…' : 'Apply to synced trades'}
          </Button>
        </div>
      )}
    </div>
  );
}
