import React, { useState, useMemo, useTransition, useRef, useEffect } from 'react';
import { Estimate, Product, Client } from '../types';
import { 
  useDashboardFilter, 
  DatePreset, 
  CustomerTypeFilter, 
  StatusFilter, 
  ChartInterval 
} from '../context/DashboardFilterContext';
import { 
  Search, 
  Plus, 
  TrendingUp, 
  CreditCard, 
  DollarSign, 
  AlertCircle, 
  FileSpreadsheet, 
  Printer, 
  Edit2, 
  Trash2,
  Phone,
  MessageSquare,
  Calendar,
  Filter,
  RefreshCw,
  Download,
  Info,
  Check,
  ChevronDown,
  Tag,
  Users,
  Layers,
  X,
  Sparkles,
  BarChart3,
  ArrowUpRight,
  SlidersHorizontal,
  Package,
  ArrowDownLeft,
  ArrowUpRight as ArrowUpRightIcon,
  ShieldCheck,
  Clock,
  Landmark,
  Sliders
} from 'lucide-react';

interface DashboardProps {
  estimates: Estimate[];
  products?: Product[];
  clients?: Client[];
  onEditEstimate: (id: number) => void;
  onPrintEstimate: (id: number) => void;
  onDeleteEstimate: (id: number) => void;
  onCreateNewClick: () => void;
  costFallbackPct: number;
  userRole?: 'admin' | 'clerk';
  isMobile?: boolean;
  businessName?: string;
  onNavigateToTab?: (tab: any) => void;
  onAddNewProduct?: () => void;
  onAddNewClient?: () => void;
  onViewLedgers?: () => void;
  onOpenPrintSetup?: () => void;
}

export type { DatePreset, CustomerTypeFilter, StatusFilter, ChartInterval };

const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function Dashboard({ 
  estimates = [], 
  products = [],
  clients = [],
  onEditEstimate, 
  onPrintEstimate, 
  onDeleteEstimate, 
  onCreateNewClick, 
  costFallbackPct = 70,
  userRole = 'admin',
  isMobile = false,
  businessName = 'My Business Counter',
  onNavigateToTab,
  onAddNewProduct,
  onAddNewClient,
  onViewLedgers,
  onOpenPrintSetup
}: DashboardProps) {
  const [isPending, startTransition] = useTransition();

  // Persistent & Globally Synced Dashboard Filters
  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    datePreset,
    setDatePreset,
    customerType,
    setCustomerType,
    selectedCategory,
    setSelectedCategory,
    customStartDate,
    customEndDate,
    setCustomDateRange,
    chartInterval,
    setChartInterval,
    resetFilters
  } = useDashboardFilter();

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [activeChartHover, setActiveChartHover] = useState<{ label: string; revenue: number; cogs: number; profit: number; margin: number } | null>(null);

  // Client lookup cache by ID / phone for B2B vs B2C classification
  const clientMap = useMemo(() => {
    const map = new Map<number | string, Client>();
    clients.forEach(c => {
      if (c && c.id) map.set(c.id, c);
      if (c && c.phone) map.set(c.phone, c);
    });
    return map;
  }, [clients]);

  // Date boundaries helper
  const dateRangeBounds = useMemo(() => {
    const now = new Date();
    const todayStr = formatLocalDate(now);
    const utcTodayStr = now.toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = formatLocalDate(yesterday);

    const dayOfWeek = now.getDay() || 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek + 1);
    const startOfWeekStr = formatLocalDate(startOfWeek);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = formatLocalDate(startOfMonth);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysAgoStr = formatLocalDate(thirtyDaysAgo);

    return {
      todayStr,
      utcTodayStr,
      yesterdayStr,
      startOfWeekStr,
      startOfMonthStr,
      thirtyDaysAgoStr
    };
  }, []);

  // Filtered Estimates pipeline (newest bills first)
  const filteredEstimates = useMemo(() => {
    const safeEstimates = Array.isArray(estimates) ? estimates : [];
    const searchTrimmed = (search || '').trim().toLowerCase();

    const matched = safeEstimates.filter(est => {
      if (!est) return false;

      // 1. Status Filter
      if (statusFilter !== 'ALL' && est.status !== statusFilter) {
        return false;
      }

      // 2. Date Filter
      const estDate = (est.date || '').substring(0, 10);
      if (datePreset === 'TODAY' && estDate !== dateRangeBounds.todayStr && estDate !== dateRangeBounds.utcTodayStr) {
        return false;
      } else if (datePreset === 'YESTERDAY' && estDate !== dateRangeBounds.yesterdayStr) {
        return false;
      } else if (datePreset === 'THIS_WEEK' && (estDate < dateRangeBounds.startOfWeekStr || (estDate > dateRangeBounds.todayStr && estDate > dateRangeBounds.utcTodayStr))) {
        return false;
      } else if (datePreset === 'THIS_MONTH' && (estDate < dateRangeBounds.startOfMonthStr || (estDate > dateRangeBounds.todayStr && estDate > dateRangeBounds.utcTodayStr))) {
        return false;
      } else if (datePreset === 'LAST_30_DAYS' && (estDate < dateRangeBounds.thirtyDaysAgoStr || (estDate > dateRangeBounds.todayStr && estDate > dateRangeBounds.utcTodayStr))) {
        return false;
      } else if (datePreset === 'CUSTOM') {
        if (customStartDate && estDate < customStartDate) return false;
        if (customEndDate && estDate > customEndDate) return false;
      }

      // 3. Customer Type Filter
      if (customerType === 'B2B') {
        const hasGstin = Boolean(est.clientGstin || clientMap.get(est.clientId)?.gstin || clientMap.get(est.clientPhone)?.gstin);
        if (!hasGstin) return false;
      } else if (customerType === 'B2C') {
        const hasGstin = Boolean(est.clientGstin || clientMap.get(est.clientId)?.gstin || clientMap.get(est.clientPhone)?.gstin);
        if (hasGstin) return false;
      } else if (customerType === 'DUE') {
        if (!est.balanceDue || est.balanceDue <= 0) return false;
      } else if (customerType === 'CLEARED') {
        if (est.balanceDue && est.balanceDue > 0) return false;
      }

      // 4. Search Filter
      if (searchTrimmed) {
        const clientName = (est.clientName || '').toLowerCase();
        const serial = (est.serial || '').toLowerCase();
        const clientPhone = (est.clientPhone || '').toLowerCase();
        const hasMatchingItem = est.items?.some(it => (it.name || '').toLowerCase().includes(searchTrimmed));

        if (!clientName.includes(searchTrimmed) && 
            !serial.includes(searchTrimmed) && 
            !clientPhone.includes(searchTrimmed) &&
            !hasMatchingItem) {
          return false;
        }
      }

      return true;
    });

    return [...matched].reverse();
  }, [estimates, statusFilter, datePreset, customerType, search, dateRangeBounds, customStartDate, customEndDate, clientMap]);

  // Comprehensive Business Statistics (myBillBook Core Metrics)
  const stats = useMemo(() => {
    const activeEstimates = filteredEstimates.filter(e => e && !e.isCancelled);

    let totalCount = activeEstimates.length;
    let totalRevenue = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let cashSalesTotal = 0;
    let creditSalesTotal = 0;

    let totalSellingPriceOfItems = 0;
    let totalCostPriceOfItems = 0;

    activeEstimates.forEach(est => {
      const gTotal = Number(est.grandTotal) || 0;
      const paid = Number(est.paidAmount) || 0;
      const due = Number(est.balanceDue) || 0;

      totalRevenue += gTotal;
      totalCollected += paid;
      totalOutstanding += due;

      cashSalesTotal += paid;
      if (due > 0) {
        creditSalesTotal += due;
      }

      if (est.items && Array.isArray(est.items)) {
        est.items.forEach(item => {
          if (!item) return;
          const qty = Number(item.qty) || 0;
          const sellingPrice = (Number(item.price) || 0) * (1 - (Number(item.disc) || 0) / 100) * qty;
          const costPrice = (Number(item.purchasePrice) || (Number(item.price) || 0) * (costFallbackPct / 100)) * qty;
          totalSellingPriceOfItems += sellingPrice;
          totalCostPriceOfItems += costPrice;
        });
      }
    });

    const totalProfit = totalSellingPriceOfItems - totalCostPriceOfItems;
    const profitMargin = totalSellingPriceOfItems > 0 ? (totalProfit / totalSellingPriceOfItems) * 100 : 0;
    const collectionRate = totalRevenue > 0 ? Math.min(100, Math.max(0, (totalCollected / totalRevenue) * 100)) : 100;

    // Total Overall Market Dues across all customers (All Time)
    const allTimeActiveEstimates = (estimates || []).filter(e => e && !e.isCancelled);
    const totalMarketReceiveable = allTimeActiveEstimates.reduce((acc, e) => acc + (Number(e.balanceDue) || 0), 0);

    // Total Inventory Value at Selling Price and Purchase Cost
    let totalStockValueAtSale = 0;
    let totalStockValueAtCost = 0;
    let lowStockCount = 0;
    const lowStockItems: Product[] = [];

    (products || []).forEach(p => {
      const qty = Number(p.stock) || 0;
      const sPrice = Number(p.price) || 0;
      const cPrice = Number(p.purchasePrice) || (sPrice * (costFallbackPct / 100));

      totalStockValueAtSale += (qty * sPrice);
      totalStockValueAtCost += (qty * cPrice);

      const minThreshold = p.minStock !== undefined ? Number(p.minStock) : 5;
      if (qty <= minThreshold) {
        lowStockCount++;
        if (lowStockItems.length < 5) {
          lowStockItems.push(p);
        }
      }
    });

    return {
      totalCount,
      totalRevenue,
      totalCollected,
      totalOutstanding,
      cashSalesTotal,
      creditSalesTotal,
      totalProfit,
      profitMargin,
      collectionRate,
      totalMarketReceiveable,
      totalStockValueAtSale,
      totalStockValueAtCost,
      lowStockCount,
      lowStockItems
    };
  }, [filteredEstimates, estimates, products, costFallbackPct]);

  // Top Pending Credit Parties (Baki Book)
  const topPendingParties = useMemo(() => {
    const partyDues: { [name: string]: { baki: number; phone: string; billCount: number; id?: number } } = {};

    (estimates || []).forEach(est => {
      if (est && !est.isCancelled && est.balanceDue > 0) {
        const key = est.clientName ? est.clientName.trim() : 'Walk-in Customer';
        if (!partyDues[key]) {
          partyDues[key] = { baki: 0, phone: est.clientPhone || '', billCount: 0, id: est.clientId };
        }
        partyDues[key].baki += est.balanceDue;
        partyDues[key].billCount += 1;
        if (!partyDues[key].phone && est.clientPhone) {
          partyDues[key].phone = est.clientPhone;
        }
      }
    });

    return Object.entries(partyDues)
      .sort((a, b) => b[1].baki - a[1].baki)
      .slice(0, 50);
  }, [estimates]);

  // Export Filtered Invoices to CSV
  const handleExportFilteredCSV = () => {
    if (filteredEstimates.length === 0) return;
    setIsExporting(true);

    setTimeout(() => {
      try {
        const headers = ["Invoice Serial", "Date", "Customer Name", "Customer Phone", "Grand Total (Rs)", "Received Amount (Rs)", "Balance Due (Rs)", "Status", "Items Count"];
        const rows = filteredEstimates.map(est => [
          `"${est.serial || ''}"`,
          `"${est.date || ''}"`,
          `"${(est.clientName || '').replace(/"/g, '""')}"`,
          `"${est.clientPhone || ''}"`,
          est.grandTotal || 0,
          est.paidAmount || 0,
          est.balanceDue || 0,
          `"${est.status || ''}"`,
          est.items?.length || 0
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `myBillBook_Sales_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } finally {
        setIsExporting(false);
      }
    }, 50);
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (datePreset !== 'ALL_TIME') count++;
    if (statusFilter !== 'ALL') count++;
    if (customerType !== 'ALL') count++;
    if (search.trim()) count++;
    return count;
  }, [datePreset, statusFilter, customerType, search]);

  const handleResetAllFilters = () => {
    resetFilters();
  };

  return (
    <div className="space-y-4 sm:space-y-5 font-sans animate-fade-in pb-12 text-slate-900 dark:text-slate-100">
      
      {/* ------------------- EXECUTIVE HERO COMMAND BANNER ------------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600/90 border border-blue-400/30 text-white font-black flex items-center justify-center text-xl shadow-xs shrink-0">
              📑
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  {businessName}
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GST & Retail Counter</span>
                </span>
              </div>
              <div className="text-xs text-slate-300 font-medium mt-0.5 flex flex-wrap items-center gap-2">
                <span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-emerald-300 font-semibold">{estimates.length} Total Bills</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-blue-300 font-semibold">{clients.length} Parties</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Counter Summary Stats (Non-duplicate info) */}
        <div className="flex items-center gap-4 text-xs text-slate-300 font-medium">
          <div className="text-left lg:text-right">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Collection Rate</span>
            <span className="font-mono font-extrabold text-emerald-400 text-sm tabular-nums">
              {stats.collectionRate.toFixed(1)}% Recovered
            </span>
          </div>
          <div className="h-7 w-px bg-slate-800 hidden sm:block" />
          <div className="text-left lg:text-right">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Catalog Stock</span>
            <span className="font-mono font-extrabold text-blue-300 text-sm tabular-nums">
              {products.length} Active Items
            </span>
          </div>
        </div>
      </div>

      {/* ------------------- FRESH 4-CARD FINANCIAL KPI STRIP ------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Sales Turnover */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-600 transition-all">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Sales (कुल बिक्री)
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
              ₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h2>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <span><b className="text-slate-900 dark:text-white font-mono tabular-nums">{stats.totalCount}</b> Filtered Bills</span>
            <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400 font-bold">
              All: {estimates.length}
            </span>
          </div>
        </div>

        {/* Card 2: Cash / Payment Received */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-emerald-400 dark:hover:border-emerald-600 transition-all">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Cash Received (प्राप्त राशि)
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight tabular-nums">
              ₹{stats.cashSalesTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h2>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <span>Est. Profit</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-bold font-mono tabular-nums">
              +₹{Math.max(0, Math.round(stats.estimatedProfit)).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Card 3: Pending Baki / Receivable */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-rose-400 dark:hover:border-rose-600 transition-all">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Pending Baki (उधारी / लेना है)
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900 flex items-center justify-center">
                <ArrowUpRightIcon className="w-4 h-4" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400 font-mono tracking-tight tabular-nums">
              ₹{stats.totalMarketReceiveable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h2>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <span><b className="text-slate-900 dark:text-white font-mono tabular-nums">{topPendingParties.length}</b> Parties Due</span>
            <span className="text-rose-600 dark:text-rose-400 font-bold font-mono tabular-nums">
              Active Dues
            </span>
          </div>
        </div>

        {/* Card 4: Total Stock Inventory Valuation */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-indigo-400 dark:hover:border-indigo-600 transition-all">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Stock Value (स्टॉक मूल्य)
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
              ₹{stats.totalStockValueAtSale.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h2>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <span><b className="text-slate-900 dark:text-white font-mono tabular-nums">{products.length}</b> Items</span>
            {stats.lowStockCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-bold font-mono tabular-nums">
                ⚠️ {stats.lowStockCount} Low Stock
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Optimal Stock ✓</span>
            )}
          </div>
        </div>

      </div>

      {/* ------------------- LOW STOCK WARNING BANNER (When applicable) ------------------- */}
      {stats.lowStockCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
              ⚠️
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-amber-950 dark:text-amber-200 uppercase tracking-wider">
                Low Stock Alert (स्टॉक कम है)
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 font-medium mt-0.5">
                <b className="font-mono">{stats.lowStockCount}</b> items are running low on stock. Restock them from Left Sidebar &rarr; Items &amp; Inventory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------- UNIFIED SEARCH & FILTER CONSOLE ------------------- */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
        
        {/* Top Row: Segmented Date Presets & Excel Export */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl overflow-x-auto no-scrollbar">
            {[
              { id: 'ALL_TIME', label: 'All Bills (सभी)' },
              { id: 'TODAY', label: 'Today (आज)' },
              { id: 'YESTERDAY', label: 'Yesterday (कल)' },
              { id: 'THIS_WEEK', label: 'This Week' },
              { id: 'THIS_MONTH', label: 'This Month' },
              { id: 'LAST_30_DAYS', label: 'Last 30 Days' }
            ].map(preset => (
              <button
                type="button"
                key={preset.id}
                onClick={() => setDatePreset(preset.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  datePreset === preset.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportFilteredCSV}
              disabled={isExporting || filteredEstimates.length === 0}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold py-2 px-3.5 rounded-xl text-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Export filtered transactions to CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isExporting ? 'Exporting...' : 'Export Excel (CSV)'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Search Bar, Segmented Status Filter, and Count/Reset */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          
          {/* Search Box (5 cols) */}
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="Search party name, mobile, EST bill number, or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100/80 focus:bg-white dark:focus:bg-slate-900 text-xs px-3.5 py-2.5 pl-10 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-blue-500 outline-none transition-all font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Segmented Tabs (5 cols) */}
          <div className="lg:col-span-5 flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl overflow-x-auto no-scrollbar">
            {[
              { id: 'ALL', label: 'All Status' },
              { id: 'PAID', label: 'Paid ✓' },
              { id: 'PARTIAL', label: 'Partial' },
              { id: 'PENDING', label: 'Unpaid / Due' }
            ].map(st => (
              <button
                type="button"
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 text-center ${
                  statusFilter === st.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Reset Filters / Showing Count (2 cols) */}
          <div className="lg:col-span-2 flex justify-end items-center">
            {activeFiltersCount > 0 ? (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums font-semibold">
                Showing {filteredEstimates.length} bills
              </span>
            )}
          </div>
        </div>

      </div>

      {/* ------------------- MYBILLBOOK TRANSACTIONS & BAKI BOOK DUAL GRID ------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Left Column (8 cols): Main Sales Invoice Ledger Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <span>📋</span> Recent Sales Invoices ({filteredEstimates.length})
              </h3>
              <span className="text-[11px] text-slate-500 font-semibold">
                Turnover: <b className="text-blue-700 font-mono">₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </span>
            </div>

            {/* Table Container */}
            <div className="w-full overflow-x-auto block whitespace-nowrap custom-scrollbar">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-3.5">Bill # / Date</th>
                    <th className="p-3.5">Party / Customer</th>
                    <th className="p-3.5 text-center">Payment</th>
                    <th className="p-3.5 text-right">Amount (₹)</th>
                    <th className="p-3.5 text-right">Balance Due</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEstimates.map((est) => {
                    const hasDue = Number(est.balanceDue) > 0;
                    const statusBadgeClass = est.status === 'PAID' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : est.status === 'PARTIAL' 
                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                        : 'bg-rose-50 text-rose-700 border-rose-200';

                    const shareText = `Namaskar ${est.clientName || 'Customer'}, your bill ${est.serial} from ${businessName} total is ₹${est.grandTotal}. Received: ₹${est.paidAmount}. Balance Due is ₹${est.balanceDue}. Thank you!`;
                    const whatsappUrl = `https://wa.me/91${(est.clientPhone || '').replace(/\D/g, '')}?text=${encodeURIComponent(shareText)}`;

                    return (
                      <tr key={est.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <span className="font-bold text-slate-900 block font-mono text-xs">{est.serial}</span>
                          <span className="text-[10px] text-slate-400 block font-medium mt-0.5">{est.date}</span>
                        </td>

                        <td className="p-3.5">
                          <div className="flex items-center space-x-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-black text-[11px] flex items-center justify-center shrink-0">
                              {(est.clientName || 'C')[0].toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block truncate max-w-[140px]" title={est.clientName}>
                                {est.clientName || 'Cash Sale'}
                              </span>
                              {est.clientPhone && (
                                <span className="text-[10px] text-slate-400 font-mono block">+91 {est.clientPhone}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 text-center">
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            {est.paidAmount >= est.grandTotal ? '💵 Cash' : est.paidAmount > 0 ? '🔄 Split' : '⚠️ Credit'}
                          </span>
                        </td>

                        <td className="p-3.5 text-right font-black text-slate-900 font-mono tabular-nums text-xs">
                          ₹{est.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="p-3.5 text-right font-mono tabular-nums text-xs">
                          {hasDue ? (
                            <span className="font-black text-rose-600">
                              ₹{est.balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-600">✓ 0.00</span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${statusBadgeClass}`}>
                            {est.status}
                          </span>
                        </td>

                        <td className="p-3.5 text-center">
                          <div className="flex justify-center items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onPrintEstimate(est.id)}
                              className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors cursor-pointer"
                              title="Print Bill / Download PDF"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {est.clientPhone && (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors cursor-pointer"
                                title="Send WhatsApp Reminder"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => onEditEstimate(est.id)}
                              className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer"
                              title="Edit Bill"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {userRole === 'admin' && (
                              <button
                                type="button"
                                onClick={() => onDeleteEstimate(est.id)}
                                className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete Bill"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Empty State */}
            {filteredEstimates.length === 0 && (
              <div className="p-12 text-center bg-slate-50/50">
                <span className="text-3xl block mb-2">📭</span>
                <h4 className="font-bold text-slate-700 text-sm">No sales invoices found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  No invoices matched the selected filters. Use Left Sidebar &rarr; Sales / Invoices (or press F2) to create a bill.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (4 cols): Upgraded Pending Baki Book & Counter Recovery Pulse */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Redesigned Pending Baki Ledger Card (उधारी खाता) */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-rose-600">⚠️</span>
                  <span>Pending Baki Book (उधारी)</span>
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Parties with outstanding balance due
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {topPendingParties.length} Due
              </span>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar pr-0.5">
              {topPendingParties.length === 0 ? (
                <div className="text-center py-8 px-4 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-xl block mb-1">🎉</span>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">All Party Ledgers Settled</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">No pending credit dues right now.</p>
                </div>
              ) : (
                topPendingParties.map(([name, info]) => {
                  const whatsappMsg = `Namaskar ${name}, your outstanding ledger balance due at ${businessName} is ₹${info.baki.toLocaleString('en-IN')}. Kindly pay at your earliest convenience. Thank you!`;
                  const whatsappUrl = `https://wa.me/91${info.phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`;

                  return (
                    <div key={name} className="flex items-center justify-between p-3 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-rose-50/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl transition-all">
                      <div className="flex items-center gap-2.5 min-w-0 max-w-[65%]">
                        <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-extrabold text-xs flex items-center justify-center shrink-0">
                          {(name || 'P')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white text-xs block truncate">{name}</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            {info.phone && <span>+91 {info.phone}</span>}
                            {info.phone && <span aria-hidden="true">·</span>}
                            <span>{info.billCount} bills</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="font-extrabold text-rose-600 dark:text-rose-400 font-mono text-xs block tabular-nums">
                            ₹{info.baki.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-medium">Balance</span>
                        </div>
                        {info.phone && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all cursor-pointer"
                            title="Send WhatsApp Payment Reminder"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Redesigned Counter Performance & Recovery Pulse Card */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-white block">
                  Counter Pulse (व्यापार स्थिति)
                </span>
                <span className="text-[11px] text-slate-400">
                  Live billing & payment recovery overview
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                {stats.collectionRate.toFixed(1)}% Recovery
              </span>
            </div>

            {/* Visual Collection Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-300 font-medium">
                <span>Payment Recovery Progress</span>
                <span className="font-mono tabular-nums text-emerald-300">{stats.collectionRate.toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, stats.collectionRate))}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/70">
                <span className="text-[10px] text-slate-400 block">Total Bills</span>
                <span className="font-extrabold text-white font-mono text-base tabular-nums mt-0.5 block">{estimates.length}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/70">
                <span className="text-[10px] text-slate-400 block">Registered Parties</span>
                <span className="font-extrabold text-white font-mono text-base tabular-nums mt-0.5 block">{clients.length}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/70">
                <span className="text-[10px] text-slate-400 block">Catalog Products</span>
                <span className="font-extrabold text-white font-mono text-base tabular-nums mt-0.5 block">{products.length}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/70">
                <span className="text-[10px] text-slate-400 block">Avg Bill Value</span>
                <span className="font-extrabold text-blue-300 font-mono text-base tabular-nums mt-0.5 block">
                  ₹{Math.round(stats.avgOrderValue || 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
