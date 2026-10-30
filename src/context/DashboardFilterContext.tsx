import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { safeStorage } from '../utils/storage';

export type DatePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'CUSTOM' | 'ALL_TIME';
export type CustomerTypeFilter = 'ALL' | 'B2B' | 'B2C' | 'DUE' | 'CLEARED';
export type StatusFilter = 'ALL' | 'PAID' | 'PARTIAL' | 'PENDING';
export type ChartInterval = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface DashboardFilterState {
  search: string;
  statusFilter: StatusFilter;
  datePreset: DatePreset;
  customerType: CustomerTypeFilter;
  selectedCategory: string;
  customStartDate: string;
  customEndDate: string;
  chartInterval: ChartInterval;
}

interface DashboardFilterContextValue extends DashboardFilterState {
  setSearch: (search: string) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setDatePreset: (preset: DatePreset) => void;
  setCustomerType: (type: CustomerTypeFilter) => void;
  setSelectedCategory: (category: string) => void;
  setCustomDateRange: (start: string, end: string) => void;
  setChartInterval: (interval: ChartInterval) => void;
  resetFilters: () => void;
}

const STORAGE_KEY = 'billsync_dashboard_filter_v3';

const getDefaultDates = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = now.toISOString().split('T')[0];
  return { start, end };
};

const getInitialFilterState = (): DashboardFilterState => {
  const { start, end } = getDefaultDates();
  const defaultState: DashboardFilterState = {
    search: '',
    statusFilter: 'ALL',
    datePreset: 'ALL_TIME', // Default to ALL_TIME so all created bills are immediately visible in Dashboard
    customerType: 'ALL',
    selectedCategory: 'ALL',
    customStartDate: start,
    customEndDate: end,
    chartInterval: 'DAILY'
  };

  try {
    const saved = safeStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return {
          search: typeof parsed.search === 'string' ? parsed.search : defaultState.search,
          statusFilter: ['ALL', 'PAID', 'PARTIAL', 'PENDING'].includes(parsed.statusFilter) ? parsed.statusFilter : defaultState.statusFilter,
          datePreset: ['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_30_DAYS', 'CUSTOM', 'ALL_TIME'].includes(parsed.datePreset) ? parsed.datePreset : defaultState.datePreset,
          customerType: ['ALL', 'B2B', 'B2C', 'DUE', 'CLEARED'].includes(parsed.customerType) ? parsed.customerType : defaultState.customerType,
          selectedCategory: typeof parsed.selectedCategory === 'string' ? parsed.selectedCategory : defaultState.selectedCategory,
          customStartDate: typeof parsed.customStartDate === 'string' ? parsed.customStartDate : defaultState.customStartDate,
          customEndDate: typeof parsed.customEndDate === 'string' ? parsed.customEndDate : defaultState.customEndDate,
          chartInterval: ['DAILY', 'WEEKLY', 'MONTHLY'].includes(parsed.chartInterval) ? parsed.chartInterval : defaultState.chartInterval,
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved dashboard filter state', e);
  }

  return defaultState;
};

const DashboardFilterContext = createContext<DashboardFilterContextValue | null>(null);

export const DashboardFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [filterState, setFilterState] = useState<DashboardFilterState>(getInitialFilterState);

  // Sync to safeStorage immediately whenever state changes
  useEffect(() => {
    try {
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(filterState));
    } catch (e) {
      console.warn('Failed to save dashboard filter state', e);
    }
  }, [filterState]);

  const setSearch = useCallback((search: string) => {
    setFilterState(prev => ({ ...prev, search }));
  }, []);

  const setStatusFilter = useCallback((statusFilter: StatusFilter) => {
    setFilterState(prev => ({ ...prev, statusFilter }));
  }, []);

  const setDatePreset = useCallback((datePreset: DatePreset) => {
    setFilterState(prev => ({ ...prev, datePreset }));
  }, []);

  const setCustomerType = useCallback((customerType: CustomerTypeFilter) => {
    setFilterState(prev => ({ ...prev, customerType }));
  }, []);

  const setSelectedCategory = useCallback((selectedCategory: string) => {
    setFilterState(prev => ({ ...prev, selectedCategory }));
  }, []);

  const setCustomDateRange = useCallback((customStartDate: string, customEndDate: string) => {
    setFilterState(prev => ({ ...prev, customStartDate, customEndDate, datePreset: 'CUSTOM' }));
  }, []);

  const setChartInterval = useCallback((chartInterval: ChartInterval) => {
    setFilterState(prev => ({ ...prev, chartInterval }));
  }, []);

  const resetFilters = useCallback(() => {
    const { start, end } = getDefaultDates();
    setFilterState({
      search: '',
      statusFilter: 'ALL',
      datePreset: 'ALL_TIME',
      customerType: 'ALL',
      selectedCategory: 'ALL',
      customStartDate: start,
      customEndDate: end,
      chartInterval: 'DAILY'
    });
  }, []);

  const value: DashboardFilterContextValue = {
    ...filterState,
    setSearch,
    setStatusFilter,
    setDatePreset,
    setCustomerType,
    setSelectedCategory,
    setCustomDateRange,
    setChartInterval,
    resetFilters
  };

  return (
    <DashboardFilterContext.Provider value={value}>
      {children}
    </DashboardFilterContext.Provider>
  );
};

export const useDashboardFilter = (): DashboardFilterContextValue => {
  const ctx = useContext(DashboardFilterContext);
  if (!ctx) {
    throw new Error('useDashboardFilter must be used within a DashboardFilterProvider');
  }
  return ctx;
};
