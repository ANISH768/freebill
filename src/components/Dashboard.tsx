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
      yesterdayStr,
      startOfWeekStr,
      startOfMonthStr,
      thirtyDaysAgoStr
    };
  }, []);

  // Filtered Estimates pipeline
  const filteredEstimates = useMemo(() => {
    const safeEstimates = Array.isArray(estimates) ? estimates : [];
    const searchTrimmed = (search || '').trim().toLowerCase();

    return safeEstimates.filter(est => {
      if (!est) return false;

      // 1. Status Filter
      if (statusFilter !== 'ALL' && est.status !== statusFilter) {
        return false;
      }

      // 2. Date Filter
      const estDate = (est.date || '').substring(0, 10);
      if (datePreset === 'TODAY' && estDate !== dateRangeBounds.todayStr) {
        return false;
      } else if (datePreset === 'YESTERDAY' && estDate !== dateRangeBounds.yesterdayStr) {
        return false;
      } else if (datePreset === 'THIS_WEEK' && (estDate < dateRangeBounds.startOfWeekStr || estDate > dateRangeBounds.todayStr)) {
        return false;
      } else if (datePreset === 'THIS_MONTH' && (estDate < dateRangeBounds.startOfMonthStr || estDate > dateRangeBounds.todayStr)) {
        return false;
      } else if (datePreset === 'LAST_30_DAYS' && (estDate < dateRangeBounds.thirtyDaysAgoStr || estDate > dateRangeBounds.todayStr)) {
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
      .slice(0, 5);
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
      
      {/* ------------------- MYBILLBOOK HEADER BANNER & ACTION STRIP ------------------- */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-lg shadow-md shadow-blue-500/20">
              📑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {businessName}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                  <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  Verified Store
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-2">
                <span>GST Billing & Accounts</span>
                <span>&bull;</span>
                <span>Today: <b>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b></span>
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons (myBillBook Core Actions) */}
        <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
          {/* Primary Big Blue: Create Sales Invoice */}
          <button
            type="button"
            onClick={onCreateNewClick}
            className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs shadow-md shadow-blue-500/25 flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
            title="Create New Sales Bill (Alt+N)"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Create Sales Invoice (नया बिल)</span>
          </button>

          {/* Add Customer Party */}
          {onAddNewClient && (
            <button
              type="button"
              onClick={onAddNewClient}
              className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 active:scale-95 text-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs border border-slate-200 dark:border-slate-700 transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer"
              title="Add New Customer Party"
            >
              <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>+ Add Party</span>
            </button>
          )}

          {/* Add Product Item */}
          {onAddNewProduct && (
            <button
              type="button"
              onClick={onAddNewProduct}
              className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 active:scale-95 text-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs border border-slate-200 dark:border-slate-700 transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer"
              title="Add New Product Item"
            >
              <Package className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>+ Add Item</span>
            </button>
          )}

          {/* View Customer Ledgers */}
          {onViewLedgers && (
            <button
              type="button"
              onClick={onViewLedgers}
              className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 active:scale-95 text-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs border border-slate-200 dark:border-slate-700 transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer"
              title="View Customer Ledgers (खाता)"
            >
              <Landmark className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Khata Ledger</span>
            </button>
          )}

          {/* Print Setup */}
          {onOpenPrintSetup && (
            <button
              type="button"
              onClick={onOpenPrintSetup}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
              title="Print Setup & Preview Customizer"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ------------------- MYBILLBOOK 4-CARD OVERVIEW STRIP ------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        
        {/* Card 1: You'll Receive (पार्टी से लेना / To Collect) */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-emerald-300 dark:hover:border-emerald-600 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              You'll Receive (लेना है)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
              ₹{stats.totalMarketReceiveable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h2>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center justify-between">
              <span>Pending in <b>{topPendingParties.length}</b> parties</span>
              {onViewLedgers && stats.totalMarketReceiveable > 0 && (
                <button
                  type="button"
                  onClick={onViewLedgers}
                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  View Baki &rarr;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: You'll Pay / Cost Obligations (देना है) */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-rose-300 dark:hover:border-rose-600 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              You'll Pay (देना है)
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <ArrowUpRightIcon className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
              ₹0
            </h2>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
              <span>All supplier payments cleared ✓</span>
            </div>
          </div>
        </div>

        {/* Card 3: Total Sales Turnover */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-blue-300 dark:hover:border-blue-600 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Period Sales (कुल बिक्री)
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
              ₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h2>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center justify-between">
              <span><b>{stats.totalCount}</b> Invoices</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold font-mono text-[10px]">
                ₹{stats.cashSalesTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cash
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Total Stock Inventory Valuation */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-purple-300 dark:hover:border-purple-600 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-purple-700 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Stock Value (स्टॉक मूल्य)
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight tabular-nums">
              ₹{stats.totalStockValueAtSale.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h2>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center justify-between">
              <span><b>{products.length}</b> Products</span>
              {stats.lowStockCount > 0 ? (
                <span className="text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                  ⚠️ {stats.lowStockCount} Low Stock
                </span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">Optimal Stock ✓</span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ------------------- LOW STOCK WARNING BANNER (When applicable) ------------------- */}
      {stats.lowStockCount > 0 && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              ⚠️
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">
                Low Stock Alert (स्टॉक ख़त्म होने वाला है)
              </h4>
              <p className="text-[11px] text-amber-850 font-medium mt-0.5">
                {stats.lowStockCount} items have reached low stock limits. Restock them to avoid sales disruption.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onAddNewProduct && (
              <button
                onClick={onAddNewProduct}
                className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Manage Stock in Inventory &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* ------------------- MYBILLBOOK FILTER TABS & FAST SEARCH ------------------- */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
        
        {/* Top Filter Bar: Quick 1-Click Date Presets */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">Time:</span>
            {[
              { id: 'TODAY', label: 'Today (आज)' },
              { id: 'YESTERDAY', label: 'Yesterday (कल)' },
              { id: 'THIS_WEEK', label: 'This Week' },
              { id: 'THIS_MONTH', label: 'This Month' },
              { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
              { id: 'ALL_TIME', label: 'All Bills (सभी)' }
            ].map(preset => (
              <button
                type="button"
                key={preset.id}
                onClick={() => setDatePreset(preset.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  datePreset === preset.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Export to CSV Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportFilteredCSV}
              disabled={isExporting || filteredEstimates.length === 0}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold py-1.5 px-3 rounded-xl text-xs transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
              title="Export filtered transactions to CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>{isExporting ? 'Exporting...' : 'Export Excel'}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row: Search Bar, Status Chips, Customer Type */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          
          {/* Search Box (5 cols) */}
          <div className="sm:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by party name, phone, bill number, item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-white text-xs px-3 py-2 pl-9 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all font-semibold placeholder:text-slate-400"
            />
          </div>

          {/* Status Tabs (5 cols) */}
          <div className="sm:col-span-5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'ALL', label: 'All Bills' },
              { id: 'PAID', label: 'Paid ✓' },
              { id: 'PARTIAL', label: 'Partial' },
              { id: 'PENDING', label: 'Unpaid / Due ⚠️' }
            ].map(st => (
              <button
                type="button"
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === st.id
                    ? 'bg-slate-900 text-white dark:bg-blue-600'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Reset Filters (2 cols) */}
          <div className="sm:col-span-2 flex justify-end">
            {activeFiltersCount > 0 ? (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-200 cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Reset</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium">
                {filteredEstimates.length} bills shown
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
                  No invoices matched the selected filters. Click "+ Create Sales Invoice" to start billing!
                </p>
                <button
                  onClick={onCreateNewClick}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  + Create New Bill Now
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (4 cols): Top Pending Parties & Quick Khata */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Top Pending Credit Parties Card (Baki Book) */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-black text-rose-600 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <span>⚠️</span> Top Pending Parties (उधारी)
              </h3>
              {onViewLedgers && (
                <button
                  onClick={onViewLedgers}
                  className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  View All &rarr;
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {topPendingParties.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 italic font-medium">
                  🎉 No outstanding dues! All party ledgers are cleared.
                </div>
              ) : (
                topPendingParties.map(([name, info]) => {
                  const whatsappMsg = `Namaskar ${name}, your outstanding ledger balance due at ${businessName} is ₹${info.baki.toLocaleString('en-IN')}. Kindly pay at your earliest convenience. Thank you!`;
                  const whatsappUrl = `https://wa.me/91${info.phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`;

                  return (
                    <div key={name} className="flex items-center justify-between p-3 bg-rose-50/40 hover:bg-rose-50/80 border border-rose-100 rounded-xl transition-all">
                      <div className="space-y-0.5 max-w-[65%]">
                        <span className="font-black text-slate-900 text-xs block truncate">{name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                          {info.phone && <span>+91 {info.phone}</span>}
                          <span>&bull;</span>
                          <span>{info.billCount} bills</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="font-black text-rose-600 font-mono text-xs block tabular-nums">
                            ₹{info.baki.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                          <span className="text-[9px] text-slate-400 block font-semibold">Due</span>
                        </div>
                        {info.phone && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-2xs transition-all cursor-pointer"
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

          {/* Quick Business Khata Summary Card */}
          <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Business Health (व्यापार स्थिति)
              </span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800">
                Online & Synced
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Total Bills Created:</span>
                <span className="font-black text-white font-mono">{estimates.length}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Registered Parties:</span>
                <span className="font-black text-white font-mono">{clients.length}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Inventory Items:</span>
                <span className="font-black text-white font-mono">{products.length}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-800">
                <span>Recovery Rate:</span>
                <span className="font-black text-emerald-400 font-mono">{stats.collectionRate.toFixed(1)}%</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={onCreateNewClick}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer transition-all text-center block"
              >
                + Fast Billing (तुरंत बिल बनाएं)
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
