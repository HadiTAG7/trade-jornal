import { cn } from '@/lib/utils';
import { TradeSide } from '@/types/trade';

interface TradeBadgeProps {
  side: TradeSide;
  className?: string;
}

export function TradeBadge({ side, className }: TradeBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      side === 'LONG' ? 'badge-long' : 'badge-short',
      className
    )}>
      {side}
    </span>
  );
}

interface PnLBadgeProps {
  value: number;
  format?: 'currency' | 'r';
  className?: string;
}

export function PnLBadge({ value, format = 'currency', className }: PnLBadgeProps) {
  const isProfit = value >= 0;
  
  let displayValue: string;
  if (format === 'currency') {
    displayValue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  } else {
    displayValue = `${isProfit ? '+' : ''}${value.toFixed(2)}R`;
  }

  return (
    <span className={cn(
      'font-mono text-sm font-medium',
      isProfit ? 'text-profit' : 'text-loss',
      className
    )}>
      {displayValue}
    </span>
  );
}
