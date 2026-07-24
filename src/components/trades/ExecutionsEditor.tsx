import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TradeExecution, TradeSide } from '@/types/trade';
import { summarizeExecutions } from '@/lib/executions';
import { formatCurrency } from '@/lib/calculations';
import { cn } from '@/lib/utils';

interface ExecutionsEditorProps {
  side: TradeSide;
  executions: TradeExecution[];
  onChange: (executions: TradeExecution[]) => void;
}

const emptyRow = (side: TradeSide): TradeExecution => ({
  action: side === 'SHORT' ? 'SELL' : 'BUY',
  quantity: 0,
  price: 0,
  datetime: '',
});

export function ExecutionsEditor({ side, executions, onChange }: ExecutionsEditorProps) {
  const summary = summarizeExecutions(executions, side);
  const opensWith = side === 'SHORT' ? 'SELL' : 'BUY';

  const update = (index: number, patch: Partial<TradeExecution>) => {
    onChange(executions.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fills (scale in / out)</CardTitle>
        <CardDescription>
          Add every buy and sell of this position — partial exits and adding to the position stay
          in one trade. Quantity, average prices and P&amp;L are calculated from these fills.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {executions.length > 0 && (
          <div className="space-y-3">
            {executions.map((row, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 md:grid-cols-[120px_1fr_1fr_1.4fr_auto] md:items-end">
                <div>
                  {i === 0 && <Label className="text-xs text-muted-foreground">Action</Label>}
                  <Select
                    value={row.action}
                    onValueChange={(v) => update(i, { action: v as 'BUY' | 'SELL' })}
                  >
                    <SelectTrigger
                      className={cn(
                        row.action === opensWith ? 'text-primary' : 'text-warning',
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">Buy</SelectItem>
                      <SelectItem value="SELL">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {i === 0 && <Label className="text-xs text-muted-foreground">Quantity</Label>}
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={row.quantity || ''}
                    onChange={(e) => update(i, { quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="100"
                  />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs text-muted-foreground">Price</Label>}
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={row.price || ''}
                    onChange={(e) => update(i, { price: parseFloat(e.target.value) || 0 })}
                    placeholder="95.00"
                  />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs text-muted-foreground">Date / time</Label>}
                  <Input
                    type="datetime-local"
                    value={row.datetime}
                    onChange={(e) => update(i, { datetime: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(executions.filter((_, idx) => idx !== i))}
                  aria-label="Remove fill"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...executions, emptyRow(side)])}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add fill
        </Button>

        {executions.length > 0 && summary.openedQty > 0 && (
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Total quantity</p>
              <p className="font-mono font-medium">{summary.openedQty}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg entry</p>
              <p className="font-mono font-medium">{formatCurrency(summary.avgEntry)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg exit</p>
              <p className="font-mono font-medium">
                {summary.avgExit === null ? '—' : formatCurrency(summary.avgExit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Realized P&amp;L</p>
              <p
                className={cn(
                  'font-mono font-medium',
                  summary.realizedPnL > 0 && 'text-success',
                  summary.realizedPnL < 0 && 'text-destructive',
                )}
              >
                {summary.closedQty > 0 ? formatCurrency(summary.realizedPnL) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Still open</p>
              <p className="font-mono font-medium">
                {summary.remainingQty > 0 ? `${summary.remainingQty} left` : 'Closed'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
