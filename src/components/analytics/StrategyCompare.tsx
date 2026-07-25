import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Strategy, Trade } from '@/types/trade';
import { formatCurrency, formatHoldTime, formatPercent, formatR } from '@/lib/calculations';
import { mergeEquitySeries } from '@/lib/analyticsSeries';
import {
  botVsManualDefinitions,
  buildSegments,
  MetricRow,
  Segment,
  strategyDefinitions,
} from '@/lib/segments';
import { cn } from '@/lib/utils';

/**
 * Side-by-side comparison of how each way of trading has actually performed.
 *
 * Every figure comes from `calculateAnalytics` / `calculateDetailedStats` — the
 * same functions the dashboard uses — applied per segment rather than to the
 * whole book, so nothing here can disagree with the rest of the app.
 */

const ratio = (v: number) => (v === Infinity ? '∞' : v.toFixed(2));

const ROWS: MetricRow[] = [
  {
    label: 'Net P/L',
    value: (s) => formatCurrency(s.analytics.totalNetPnL),
    direction: 'higher',
    compare: (s) => s.analytics.totalNetPnL,
  },
  {
    label: 'Closed trades',
    value: (s) => String(s.analytics.totalTrades),
    direction: 'none',
    compare: () => null,
  },
  {
    label: 'Win rate',
    value: (s) => formatPercent(s.analytics.winRate),
    direction: 'higher',
    compare: (s) => s.analytics.winRate,
  },
  {
    label: 'Expectancy / trade',
    value: (s) => formatCurrency(s.analytics.expectancy),
    direction: 'higher',
    compare: (s) => s.analytics.expectancy,
    hint: 'Average expected result of taking one more trade like these',
  },
  {
    label: 'Profit factor',
    value: (s) => ratio(s.analytics.profitFactor),
    direction: 'higher',
    compare: (s) => (s.analytics.profitFactor === Infinity ? Number.MAX_SAFE_INTEGER : s.analytics.profitFactor),
    hint: 'Gross wins divided by gross losses; above 1 is profitable',
  },
  {
    label: 'Max drawdown',
    value: (s) => formatCurrency(s.analytics.maxDrawdown),
    direction: 'lower',
    compare: (s) => s.analytics.maxDrawdown,
    hint: 'Largest peak-to-trough fall in this segment’s own equity curve',
  },
  {
    label: 'Avg win',
    value: (s) => formatCurrency(s.detailed.avgWinningTrade),
    direction: 'higher',
    compare: (s) => s.detailed.avgWinningTrade,
  },
  {
    label: 'Avg loss',
    value: (s) => formatCurrency(s.detailed.avgLosingTrade),
    direction: 'higher',
    compare: (s) => s.detailed.avgLosingTrade,
  },
  {
    label: 'Largest loss',
    value: (s) => formatCurrency(s.detailed.largestLoss),
    direction: 'higher',
    compare: (s) => s.detailed.largestLoss,
  },
  {
    label: 'Longest win streak',
    value: (s) => String(s.analytics.winStreak),
    direction: 'higher',
    compare: (s) => s.analytics.winStreak,
  },
  {
    label: 'Longest loss streak',
    value: (s) => String(s.analytics.lossStreak),
    direction: 'lower',
    compare: (s) => s.analytics.lossStreak,
  },
  {
    label: 'Avg hold time',
    value: (s) =>
      s.detailed.holdTimeSampleSize > 0 ? formatHoldTime(s.detailed.avgHoldTimeMinutes) : '—',
    direction: 'none',
    compare: () => null,
    hint: 'Only trades with a known open time; the sample size is shown below',
  },
  {
    label: 'SQN',
    value: (s) => (s.detailed.sqn === null ? '—' : s.detailed.sqn.toFixed(2)),
    direction: 'higher',
    compare: (s) => s.detailed.sqn,
    hint: 'System quality; needs at least 30 trades with an R multiple',
  },
  {
    label: 'Kelly %',
    value: (s) => (s.detailed.kellyPercentage === null ? '—' : formatPercent(s.detailed.kellyPercentage)),
    direction: 'higher',
    compare: (s) => s.detailed.kellyPercentage,
    hint: 'Position size this edge would justify, if the edge holds',
  },
  {
    label: 'Avg R',
    value: (s) => (s.rCoverage > 0 ? formatR(s.analytics.avgR) : '—'),
    direction: 'higher',
    compare: (s) => (s.rCoverage > 0 ? s.analytics.avgR : null),
  },
  {
    label: 'R coverage',
    value: (s) =>
      s.analytics.totalTrades > 0
        ? `${s.rCoverage} of ${s.analytics.totalTrades} (${((s.rCoverage / s.analytics.totalTrades) * 100).toFixed(0)}%)`
        : '—',
    direction: 'none',
    compare: () => null,
    hint: 'R needs a stop or an override. Read the R rows above in light of this.',
  },
  {
    label: 'Fees + commissions',
    value: (s) => formatCurrency(s.detailed.totalFees + s.detailed.totalCommissions),
    direction: 'lower',
    compare: (s) => s.detailed.totalFees + s.detailed.totalCommissions,
  },
];

interface Props {
  trades: Trade[];
  strategies: Strategy[];
}

export function StrategyCompare({ trades, strategies }: Props) {
  const [mode, setMode] = useState<'bot' | 'strategy'>('bot');

  const segments = useMemo(() => {
    const defs =
      mode === 'bot' ? botVsManualDefinitions(strategies) : strategyDefinitions(strategies, trades);
    return buildSegments(trades, defs);
  }, [trades, strategies, mode]);

  const overlay = useMemo(
    () => mergeEquitySeries(segments.map((s) => ({ key: s.key, points: s.equity }))),
    [segments],
  );

  /** Which segment wins each row, so the table can point it out. */
  const winners = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const row of ROWS) {
      if (row.direction === 'none') {
        map.set(row.label, null);
        continue;
      }
      const scored = segments
        .map((s) => ({ key: s.key, v: row.compare(s) }))
        .filter((x): x is { key: string; v: number } => x.v !== null && Number.isFinite(x.v));
      if (scored.length < 2) {
        map.set(row.label, null);
        continue;
      }
      const best = scored.reduce((a, b) =>
        row.direction === 'higher' ? (b.v > a.v ? b : a) : b.v < a.v ? b : a,
      );
      // A tie has no winner worth highlighting.
      const tied = scored.filter((x) => x.v === best.v).length > 1;
      map.set(row.label, tied ? null : best.key);
    }
    return map;
  }, [segments]);

  if (segments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bot vs manual</CardTitle>
          <CardDescription>
            Nothing to compare yet — no closed trades match these groups.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{mode === 'bot' ? 'Bot vs manual' : 'By strategy'}</CardTitle>
            <CardDescription>
              The same metrics as the dashboard, computed for each group separately.
            </CardDescription>
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'bot' | 'strategy')}>
            <TabsList>
              <TabsTrigger value="bot">Bot vs manual</TabsTrigger>
              <TabsTrigger value="strategy">Every strategy</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-3 text-left font-medium">Metric</th>
                  {segments.map((s) => (
                    <th key={s.key} className="py-3 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const winner = winners.get(row.label);
                  return (
                    <tr key={row.label} className="border-b border-border/50">
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {row.label}
                        {row.hint && (
                          <span className="block text-[11px] opacity-70">{row.hint}</span>
                        )}
                      </td>
                      {segments.map((s) => (
                        <td
                          key={s.key}
                          className={cn(
                            'py-2.5 text-right font-mono',
                            winner === s.key && 'font-semibold text-profit',
                          )}
                        >
                          {row.value(s)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Green marks the better figure in a row. Rows with no winner marked are either context
            or a tie.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equity curves, overlaid</CardTitle>
          <CardDescription>
            Cumulative net P&L per group on one date axis. A group's line holds flat on days it
            didn't trade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overlay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" minTickGap={40} />
                <YAxis
                  className="text-xs fill-muted-foreground"
                  tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    segments.find((s) => s.key === name)?.label ?? name,
                  ]}
                />
                <Legend
                  formatter={(name) => segments.find((s) => s.key === name)?.label ?? name}
                />
                {segments.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {segments.map((s) => (
          <SegmentCard key={s.key} segment={s} />
        ))}
      </div>
    </div>
  );
}

function SegmentCard({ segment }: { segment: Segment }) {
  const gradientId = `seg-${segment.key.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: segment.color }}
          />
          {segment.label}
        </CardTitle>
        <CardDescription>
          {segment.analytics.totalTrades} closed ·{' '}
          <span className={segment.analytics.totalNetPnL >= 0 ? 'text-profit' : 'text-loss'}>
            {formatCurrency(segment.analytics.totalNetPnL)}
          </span>{' '}
          · {formatPercent(segment.analytics.winRate)} win rate
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={segment.equity}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={segment.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={segment.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [formatCurrency(value), 'Equity']}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={segment.color}
                fill={`url(#${gradientId})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
