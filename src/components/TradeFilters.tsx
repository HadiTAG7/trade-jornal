import { Search, Filter, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TradeFilters as TradeFiltersType } from '@/hooks/useTradeFilters';
import { Strategy } from '@/types/trade';

interface TradeFiltersProps {
  filters: TradeFiltersType;
  strategies: Strategy[];
  onFilterChange: <K extends keyof TradeFiltersType>(key: K, value: TradeFiltersType[K]) => void;
  onDatePreset: (preset: 'today' | 'week' | 'month' | 'last30') => void;
  onClearDates: () => void;
  compact?: boolean;
}

export function TradeFiltersComponent({
  filters,
  strategies,
  onFilterChange,
  onDatePreset,
  onClearDates,
  compact = false,
}: TradeFiltersProps) {
  return (
    <Card>
      <CardHeader className={compact ? "pb-2 pt-3 px-4" : "pb-3"}>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? "px-4 pb-3" : undefined}>
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by symbol..."
              value={filters.searchQuery}
              onChange={(e) => onFilterChange('searchQuery', e.target.value)}
              className="pl-9"
            />
          </div>
          
          <DateInput
            value={filters.dateFrom}
            onChange={(date) => onFilterChange('dateFrom', date)}
            placeholder="From date"
            className="w-[160px]"
          />

          <DateInput
            value={filters.dateTo}
            onChange={(date) => onFilterChange('dateTo', date)}
            placeholder="To date"
            className="w-[160px]"
          />

          {(filters.dateFrom || filters.dateTo) && (
            <Button variant="ghost" size="icon" onClick={onClearDates}>
              <X className="h-4 w-4" />
            </Button>
          )}

          <Select value={filters.sideFilter} onValueChange={(v) => onFilterChange('sideFilter', v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Side" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sides</SelectItem>
              <SelectItem value="LONG">Long</SelectItem>
              <SelectItem value="SHORT">Short</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.strategyFilter} onValueChange={(v) => onFilterChange('strategyFilter', v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Strategies</SelectItem>
              {strategies.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="secondary" size="sm" onClick={() => onDatePreset('today')}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDatePreset('week')}>
            This Week
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDatePreset('month')}>
            This Month
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDatePreset('last30')}>
            Last 30 Days
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
