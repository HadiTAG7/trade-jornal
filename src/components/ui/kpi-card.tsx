import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: 'default' | 'profit' | 'loss';
  className?: string;
}

export function KPICard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  trend,
  variant = 'default',
  className 
}: KPICardProps) {
  return (
    <div className={cn('kpi-card animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn(
            'text-2xl font-bold font-mono tracking-tight',
            variant === 'profit' && 'text-profit',
            variant === 'loss' && 'text-loss'
          )}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={cn(
            'rounded-lg p-2',
            variant === 'default' && 'bg-primary/10 text-primary',
            variant === 'profit' && 'bg-profit/10 text-profit',
            variant === 'loss' && 'bg-loss/10 text-loss'
          )}>
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span className={cn(
            'text-xs font-medium',
            trend.value >= 0 ? 'text-profit' : 'text-loss'
          )}>
            {trend.value >= 0 ? '+' : ''}{trend.value.toFixed(1)}%
          </span>
          {trend.label && (
            <span className="text-xs text-muted-foreground">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}
