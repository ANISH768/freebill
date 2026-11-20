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

    // Total Overall Market Dues across all customers (All Time) + Today & This Month Real Metrics
    const allTimeActiveEstimates = (estimates || []).filter(e => e && !e.isCancelled);
    const totalMarketReceiveable = allTimeActiveEstimates.reduce((acc, e) => acc + (Number(e.balanceDue) || 0), 0);

    let todaySales = 0;
    let todayProfit = 0;
    let todayBillCount = 0;
    let monthSales = 0;
    let monthBillCount = 0;

    allTimeActiveEstimates.forEach(est => {
      const estDate = (est.date || '').substring(0, 10);
      const gTotal = Number(est.grandTotal) || 0;
      const isToday = estDate === dateRangeBounds.todayStr || estDate === dateRangeBounds.utcTodayStr;
      const isThisMonth = estDate >= dateRangeBounds.startOfMonthStr && (estDate <= dateRangeBounds.todayStr || estDate <= dateRangeBounds.utcTodayStr);

      if (isToday) {
        todaySales += gTotal;
        todayBillCount++;
        (est.items || []).forEach(item => {
          if (!item) return;
          const qty = Number(item.qty) || 0;
          const sPrice = (Number(item.price) || 0) * (1 - (Number(item.disc) || 0) / 100) * qty;
          const cPrice = (Number(item.purchasePrice) || (Number(item.price) || 0) * (costFallbackPct / 100)) * qty;
          todayProfit += (sPrice - cPrice);
        });
      }

      if (isThisMonth) {
        monthSales += gTotal;
        monthBillCount++;
      }
    });

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
      estimatedProfit: totalProfit,
      avgOrderValue: totalCount > 0 ? totalRevenue / totalCount : 0,
      profitMargin,
      collectionRate,
      totalMarketReceiveable,
      totalStockValueAtSale,
      totalStockValueAtCost,
      lowStockCount,
      lowStockItems,
      todaySales,
      todayProfit,
      todayBillCount,
      monthSales,
      monthBillCount
    };
  }, [filteredEstimates, estimates, products, costFallbackPct, dateRangeBounds]);

  const [trendRange, setTrendRange] = useState<'7D' | '30D'>('7D');

  // 7-Day and 30-Day Sales Trend + Top 5 Selling Products
  const { salesTrendData, topSellingProducts } = useMemo(() => {
    const daysCount = trendRange === '7D' ? 7 : 30;
    const dayBuckets: Array<{ dateStr: string; label: string; sales: number; count: number }> = [];
    const bucketMap = new Map<string, { dateStr: string; label: string; sales: number; count: number }>();

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = formatLocalDate(d);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const entry = { dateStr: dStr, label, sales: 0, count: 0 };
      dayBuckets.push(entry);
      bucketMap.set(dStr, entry);
    }

    const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();

    (estimates || []).forEach((est) => {
      if (!est || est.isCancelled) return;
      const dStr = (est.date || '').slice(0, 10);
      const bucket = bucketMap.get(dStr);
      if (bucket) {
        bucket.sales += Number(est.grandTotal) || 0;
        bucket.count += 1;
      }

      (est.items || []).forEach((it) => {
        if (!it || !it.name) return;
        const key = it.name.trim();
        const existing = prodMap.get(key) || { name: key, qty: 0, revenue: 0 };
        existing.qty += Number(it.qty) || 0;
        existing.revenue += Number(it.total) || (Number(it.qty) || 0) * (Number(it.price) || 0);
        prodMap.set(key, existing);
      });
    });

    const top5 = Array.from(prodMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return { salesTrendData: dayBuckets, topSellingProducts: top5 };
  }, [estimates, trendRange]);

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
        link.setAttribute('download', `BillSyncPro_Sales_${new Date().toISOString().split('T')[0]}.csv`);
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
    <div className="space-y-6 font-sans animate-fade-in pb-12 text-[#1a1c21] dark:text-slate-100">
      
      {/* ------------------- DESIGN VARIATION 6: EXECUTIVE HERO COMMAND BANNER ------------------- */}
      <div className="bg-[#1e293b] text-white p-6 rounded-2xl border border-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#2563eb] text-white font-black flex items-center justify-center text-xl shadow-sm shrink-0">
              B
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {businessName}
                </h1>
                <span className="v6-tag bg-white/10 text-[#fbbf24]">
                  Enterprise Offline POS
                </span>
              </div>
              <div className="text-xs text-slate-300 font-medium mt-1 flex flex-wrap items-center gap-2">
                <span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-emerald-400 font-semibold tabular-nums">{estimates.length} Total Bills</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-sky-300 font-semibold tabular-nums">{clients.length} Parties</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-amber-300 font-semibold tabular-nums">{products.length} Products</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex items-center gap-4 text-xs text-slate-300 font-medium">
            <div className="text-left lg:text-right">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">Recovery Rate</span>
              <span className="font-mono font-bold text-emerald-400 text-sm tabular-nums">
                {stats.collectionRate.toFixed(1)}% Collected
              </span>
            </div>
            <div className="h-7 w-px bg-slate-700 hidden sm:block" />
            <div className="text-left lg:text-right">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">Filtered Turnover</span>
              <span className="font-mono font-bold text-[#fbbf24] text-sm tabular-nums">
                ₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onCreateNewClick}
            className="bg-[#059669] hover:bg-emerald-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs shadow-sm transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            <Plus className="w-4 h-4" />
            <span>+ NEW BILL (F2)</span>
          </button>
        </div>
      </div>

      {/* ------------------- DESIGN VARIATION 6: 6-CARD REAL-TIME BUSINESS KPI GRID ------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        
        {/* 1. Today's Sales */}
        <div className="v6-card !mb-0 !p-4 flex flex-col justify-between hover:border-[#2563eb] transition-colors">
          <div>
            <span className="v6-label-caps !mb-2">Today&apos;s Sales (आज)</span>
            <div className="text-xl sm:text-2xl font-extrabold text-[#1a1c21] dark:text-white font-mono tabular-nums">
              ₹{stats.todaySales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#e2e8f0] dark:border-slate-800 flex items-center justify-between text-[11px] text-[#64748b]">
            <span className="font-mono font-semibold tabular-nums">{stats.todayBillCount} Bills Today</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#2563eb]" />
          </div>
        </div>

        {/* 2. Today's Profit */}
        <div className="v6-card !mb-0 !p-4 flex flex-col justify-between hover:border-[#059669] transition-colors">
          <div>
            <span className="v6-label-caps !mb-2">Today&apos;s Profit (मुनाफ़ा)</span>
            <div className="text-xl sm:text-2xl font-extrabold text-[#059669] font-mono tabular-nums">
              ₹{Math.max(0, Math.round(stats.todayProfit)).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#e2e8f0] dark:border-slate-800 flex items-center justify-between text-[11px] text-[#64748b]">
            <span>All-Time: <b className="font-mono text-[#059669]">₹{Math.max(0, Math.round(stats.estimatedProfit)).toLocaleString('en-IN')}</b></span>
          </div>
        </div>

        {/* 3. This Month's Sales */}
        <div className="v6-card !mb-0 !p-4 flex flex-col justify-between hover:border-[#2563eb] transition-colors">
          <div>
            <span className="v6-label-caps !mb-2">This Month&apos;s Sales</span>
            <div className="text-xl sm:text-2xl font-extrabold text-[#2563eb] font-mono tabular-nums">
              ₹{stats.monthSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#e2e8f0] dark:border-slate-800 flex items-center justify-between text-[11px] text-[#64748b]">
            <span className="font-mono font-semibold tabular-nums">{stats.monthBillCount} Bills in Month</span>
            <Calendar className="w-3.5 h-3.5 text-[#2563eb]" />
          </div>
        </div>

        {/* 4. Pending / Due Amount */}
        <div className="v6-card !mb-0 !p-4 flex flex-col justify-between hover:border-[#d97706] transition-colors bg-[#fffbeb]/40">
          <div>
            <span className="v6-label-caps !text-[#b45309] !mb-2">Pending / Due (उधारी)</span>
            <div className="text-xl sm:text-2xl font-extrabold text-[#d97706] font-mono tabular-nums">
              ₹{stats.totalMarketReceiveable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-amber-200/70 dark:border-slate-800 flex items-center justify-between text-[11px] text-[#b45309] font-semibold">
            <span className="font-mono tabular-nums">{topPendingParties.length} Parties Due</span>
            <ArrowUpRightIcon className="w-3.5 h-3.5 text-[#d97706]" />
          </div>
        </div>

        {/* 5. Total Customers */}
        <div
          onClick={() => onNavigateToTab && onNavigateToTab('customers')}
          className="v6-card !mb-0 !p-4 flex flex-col justify-between hover:border-[#2563eb] transition-colors cursor-pointer"
        >
          <div>
            <span className="v6-label-caps !mb-2">Total Customers</span>
            <div className="text-xl sm:text-2xl font-extrabold text-[#1a1c21] dark:text-white font-mono tabular-nums">
              {clients.length}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#e2e8f0] dark:border-slate-800 flex items-center justify-between text-[11px] text-[#2563eb] font-bold">
            <span>View Party Khata &rarr;</span>
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 6. Low Stock Items */}
        <div
          onClick={() => onNavigateToTab && onNavigateToTab('inventory')}
          className="v6-card !mb-0 !p-4 flex flex-col justify-between hover:border-[#d97706] transition-colors cursor-pointer"
        >
          <div>
            <span className="v6-label-caps !mb-2">Low Stock Items</span>
            <div className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums ${stats.lowStockCount > 0 ? 'text-rose-600' : 'text-[#059669]'}`}>
              {stats.lowStockCount} <span className="text-xs font-semibold text-[#64748b]">/ {products.length}</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#e2e8f0] dark:border-slate-800 flex items-center justify-between text-[11px] text-[#64748b] font-medium">
            <span>Stock: <b className="font-mono text-[#1a1c21] dark:text-white">₹{stats.totalStockValueAtSale.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></span>
            <Package className="w-3.5 h-3.5 text-[#2563eb]" />
          </div>
        </div>

      </div>

      {/* ------------------- LOW STOCK WARNING BANNER (Static Clean Card, No Red Blink) ------------------- */}
      {stats.lowStockCount > 0 && (
        <div className="bg-[#fffbeb] dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-[#d97706] flex items-center justify-center shrink-0 font-bold">
              !
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-[#b45309] dark:text-amber-200 uppercase tracking-wider">
                Low Stock Inventory Alert (स्टॉक कम है)
              </h4>
              <p className="text-xs text-amber-900 dark:text-amber-300/90 font-medium mt-0.5">
                <b className="font-mono">{stats.lowStockCount}</b> items are at or below minimum stock threshold ({stats.lowStockItems.map(i => `${i.name} (${i.stock})`).join(', ')}).
              </p>
            </div>
          </div>
          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('inventory')}
              className="px-3.5 py-2 rounded-xl bg-[#d97706] hover:bg-amber-700 text-white text-xs font-bold cursor-pointer shrink-0 transition-colors"
            >
              Restock Items &rarr;
            </button>
          )}
        </div>
      )}

      {/* ------------------- 7-DAY / 30-DAY SALES TREND & TOP 5 PRODUCTS ------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sales Trend Chart (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Sales Trend ({trendRange === '7D' ? 'Last 7 Days' : 'Last 30 Days'})</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Daily billing turnover stored locally on this device
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTrendRange('7D')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                  trendRange === '7D'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setTrendRange('30D')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                  trendRange === '30D'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                30 Days
              </button>
            </div>
          </div>

          {(() => {
            const maxVal = Math.max(...salesTrendData.map((d) => d.sales), 1);
            return (
              <div className="h-36 flex items-end gap-1.5 pt-4 border-b border-slate-100 dark:border-slate-800 pb-2 overflow-x-auto">
                {salesTrendData.map((bucket) => {
                  const pct = Math.max(6, Math.round((bucket.sales / maxVal) * 100));
                  return (
                    <div
                      key={bucket.dateStr}
                      className="flex-1 min-w-[18px] flex flex-col items-center justify-end h-full group"
                      title={`${bucket.label}: ₹${bucket.sales.toLocaleString('en-IN')} (${bucket.count} bills)`}
                    >
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          bucket.sales > 0
                            ? 'bg-indigo-600 dark:bg-indigo-500 group-hover:bg-emerald-500'
                            : 'bg-slate-100 dark:bg-slate-800'
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                      {trendRange === '7D' && (
                        <span className="text-[9px] font-bold text-slate-400 mt-1.5 whitespace-nowrap">
                          {bucket.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Top 5 Selling Products (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Top 5 Selling Products</span>
            </h3>
            <span className="text-[10px] font-bold text-slate-400">By Revenue</span>
          </div>

          {topSellingProducts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs font-bold text-slate-400">No product sales yet</p>
              <button
                type="button"
                onClick={onCreateNewClick}
                className="mt-2 inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create your first bill</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {topSellingProducts.map((item, idx) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono">
                    <span className="text-[10px] font-bold text-slate-400">{item.qty} sold</span>
                    <span className="font-black text-slate-900 dark:text-white">
                      ₹{Math.round(item.revenue).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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

            {/* Empty State with Illustration & Primary CTA */}
            {filteredEstimates.length === 0 && (
              <div className="p-12 text-center bg-[#f8fafc] dark:bg-slate-900/50 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-[#eff6ff] border border-blue-200 flex items-center justify-center text-[#2563eb] mb-3">
                  <FileSpreadsheet className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-[#1a1c21] dark:text-white text-sm" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  No sales invoices found
                </h4>
                <p className="text-xs text-[#64748b] mt-1 max-w-xs mx-auto">
                  Start billing offline with zero internet required, or adjust your date/status filters above.
                </p>
                <button
                  type="button"
                  onClick={onCreateNewClick}
                  className="mt-4 bg-[#2563eb] hover:bg-blue-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs shadow-sm transition-all cursor-pointer inline-flex items-center gap-2"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Your First Bill (F2)</span>
                </button>
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
