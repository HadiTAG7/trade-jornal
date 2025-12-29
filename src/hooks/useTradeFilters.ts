import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth, subDays, parseISO } from 'date-fns';
import { Trade } from '@/types/trade';

export interface TradeFilters {
  searchQuery: string;
  sideFilter: string;
  strategyFilter: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

export function useTradeFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filters from URL
  const filters: TradeFilters = useMemo(() => ({
    searchQuery: searchParams.get('q') || '',
    sideFilter: searchParams.get('side') || 'all',
    strategyFilter: searchParams.get('strategy') || 'all',
    dateFrom: searchParams.get('from') ? parseISO(searchParams.get('from')!) : undefined,
    dateTo: searchParams.get('to') ? parseISO(searchParams.get('to')!) : undefined,
  }), [searchParams]);

  // Update a single filter
  const setFilter = useCallback(<K extends keyof TradeFilters>(key: K, value: TradeFilters[K]) => {
    const params = new URLSearchParams(searchParams);
    
    if (key === 'searchQuery') {
      if (value) params.set('q', value as string);
      else params.delete('q');
    } else if (key === 'sideFilter') {
      if (value !== 'all') params.set('side', value as string);
      else params.delete('side');
    } else if (key === 'strategyFilter') {
      if (value !== 'all') params.set('strategy', value as string);
      else params.delete('strategy');
    } else if (key === 'dateFrom') {
      if (value) params.set('from', format(value as Date, 'yyyy-MM-dd'));
      else params.delete('from');
    } else if (key === 'dateTo') {
      if (value) params.set('to', format(value as Date, 'yyyy-MM-dd'));
      else params.delete('to');
    }
    
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // Quick date presets
  const setDatePreset = useCallback((preset: 'today' | 'week' | 'month' | 'last30') => {
    const today = new Date();
    const params = new URLSearchParams(searchParams);
    params.set('to', format(today, 'yyyy-MM-dd'));
    
    switch (preset) {
      case 'today':
        params.set('from', format(today, 'yyyy-MM-dd'));
        break;
      case 'week':
        params.set('from', format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
        break;
      case 'month':
        params.set('from', format(startOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'last30':
        params.set('from', format(subDays(today, 30), 'yyyy-MM-dd'));
        break;
    }
    
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearDateFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('from');
    params.delete('to');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearAllFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.searchQuery !== '' || 
           filters.sideFilter !== 'all' || 
           filters.strategyFilter !== 'all' || 
           filters.dateFrom !== undefined || 
           filters.dateTo !== undefined;
  }, [filters]);

  // Filter trades based on current filters
  const filterTrades = useCallback((trades: Trade[]) => {
    return trades.filter(trade => {
      const matchesSearch = trade.symbol.toLowerCase().includes(filters.searchQuery.toLowerCase());
      const matchesSide = filters.sideFilter === 'all' || trade.side === filters.sideFilter;
      const matchesStrategy = filters.strategyFilter === 'all' || trade.strategy_id === filters.strategyFilter;
      
      const tradeDate = new Date(trade.entry_datetime);
      const matchesDateFrom = !filters.dateFrom || tradeDate >= startOfDay(filters.dateFrom);
      const matchesDateTo = !filters.dateTo || tradeDate <= endOfDay(filters.dateTo);
      
      return matchesSearch && matchesSide && matchesStrategy && matchesDateFrom && matchesDateTo;
    });
  }, [filters]);

  return {
    filters,
    setFilter,
    setDatePreset,
    clearDateFilters,
    clearAllFilters,
    hasActiveFilters,
    filterTrades,
  };
}
