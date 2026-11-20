import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  TrendingUp,
  IndianRupee,
  FileSpreadsheet,
  Calendar,
  Award,
  Users,
  Plus,
  Trash2,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import { Client, Estimate, ExpenseRecord, Product } from '../types';

interface ReportsAndGstProps {
  estimates: Estimate[];
  products: Product[];
  clients: Client[];
  formatCurrency: (val: number) => string;
  costFallbackPct?: number;
}

const EXPENSES_STORAGE_KEY = 'pos_business_expenses_v1';

export const ReportsAndGst: React.FC<ReportsAndGstProps> = ({
  estimates,
  products,
  formatCurrency,
  costFallbackPct = 75,
}) => {
  const [period, setPeriod] = useState<'TODAY' | '7D' | '30D' | 'ALL' | 'CUSTOM'>('30D');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [activeSubTab, setActiveSubTab] = useState<'OVERVIEW' | 'GST_CA' | 'EXPENSES'>('OVERVIEW');

  // Expense Tracker state persisted in localStorage
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => {
    try {
      const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [expCategory, setExpCategory] = useState<ExpenseRecord['category']>('Transport');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMode, setExpMode] = useState<ExpenseRecord['paymentMode']>('CASH');

  const saveExpenses = (next: ExpenseRecord[]) => {
    setExpenses(next);
    try {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expAmount);
    if (!amt || amt <= 0) return;
    const item: ExpenseRecord = {
      id: `EXP-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      category: expCategory,
      description: expDesc.trim() || `${expCategory} Expense`,
      amount: amt,
      paymentMode: expMode,
    };
    saveExpenses([item, ...expenses]);
    setExpDesc('');
    setExpAmount('');
  };

  const handleDeleteExpense = (id: string) => {
    saveExpenses(expenses.filter((x) => x.id !== id));
  };

  // Product cost lookup map
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      if (p.purchasePrice && p.purchasePrice > 0) {
        map.set(p.name.toLowerCase(), p.purchasePrice);
      }
    });
    return map;
  }, [products]);

  // Filtered non-cancelled estimates within date window
  const filteredEstimates = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return estimates.filter((est) => {
      if (est.isCancelled) return false;
      const dStr = (est.date || '').slice(0, 10);
      if (!dStr) return true;

      if (period === 'TODAY') return dStr === todayStr;
      if (period === '7D') {
        const cutoff = new Date();
        cutoff.setDate(now.getDate() - 7);
        return dStr >= cutoff.toISOString().slice(0, 10);
      }
      if (period === '30D') {
        const cutoff = new Date();
        cutoff.setDate(now.getDate() - 30);
        return dStr >= cutoff.toISOString().slice(0, 10);
      }
      if (period === 'CUSTOM') {
        return dStr >= startDate && dStr <= endDate;
      }
      return true;
    });
  }, [estimates, period, startDate, endDate]);

  // Aggregate financial & GST metrics
  const reportStats = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalCollected = 0;
    let totalDue = 0;
    let taxableValueTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    const slabMap = new Map<
      number,
      { rate: number; taxable: number; cgst: number; sgst: number; igst: number; totalTax: number }
    >();
    [0, 5, 12, 18, 28].forEach((r) =>
      slabMap.set(r, { rate: r, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 })
    );

    const productSales = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    const customerSales = new Map<string, { name: string; phone: string; count: number; total: number; due: number }>();

    filteredEstimates.forEach((est) => {
      const grand = Number(est.grandTotal) || 0;
      const paid = Number(est.paidAmount) || 0;
      const due = Math.max(0, grand - paid);

      totalRevenue += grand;
      totalCollected += paid;
      totalDue += due;

      const cKey = est.clientPhone || est.clientName || 'Walk-in';
      const existingCust = customerSales.get(cKey) || {
        name: est.clientName || 'Walk-in Customer',
        phone: est.clientPhone || '-',
        count: 0,
        total: 0,
        due: 0,
      };
      existingCust.count += 1;
      existingCust.total += grand;
      existingCust.due += due;
      customerSales.set(cKey, existingCust);

      (est.items || []).forEach((item) => {
        const qty = Number(item.qty) || 0;
        const rate = Number(item.price) || 0;
        const lineTotal = Number(item.total) || qty * rate;
        const unitCost =
          item.purchasePrice && item.purchasePrice > 0
            ? item.purchasePrice
            : productCostMap.get((item.name || '').toLowerCase()) ||
              rate * (costFallbackPct / 100);
        const lineCost = qty * unitCost;
        totalCost += lineCost;

        const gstRate = est.isGstInvoice === false ? 0 : Number(item.gstRate ?? est.taxPct ?? 0);
        const taxable =
          item.taxableValue !== undefined
            ? Number(item.taxableValue)
            : gstRate > 0
            ? lineTotal / (1 + gstRate / 100)
            : lineTotal;
        const taxAmt = Math.max(0, lineTotal - taxable);
        const isInter = Boolean(est.isInterState);
        const cgst = isInter ? 0 : taxAmt / 2;
        const sgst = isInter ? 0 : taxAmt / 2;
        const igst = isInter ? taxAmt : 0;

        taxableValueTotal += taxable;
        cgstTotal += cgst;
        sgstTotal += sgst;
        igstTotal += igst;

        const slab = slabMap.get(gstRate) || {
          rate: gstRate,
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalTax: 0,
        };
        slab.taxable += taxable;
        slab.cgst += cgst;
        slab.sgst += sgst;
        slab.igst += igst;
        slab.totalTax += taxAmt;
        slabMap.set(gstRate, slab);

        const pKey = (item.name || 'Item').trim();
        const existingProd = productSales.get(pKey) || {
          name: pKey,
          qty: 0,
          revenue: 0,
          profit: 0,
        };
        existingProd.qty += qty;
        existingProd.revenue += lineTotal;
        existingProd.profit += lineTotal - lineCost;
        productSales.set(pKey, existingProd);
      });
    });

    const totalExpenses = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const grossProfit = totalRevenue - totalCost;
    const netProfitAfterExpenses = grossProfit - totalExpenses;

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      totalExpenses,
      netProfitAfterExpenses,
      totalCollected,
      totalDue,
      taxableValueTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      totalGst: cgstTotal + sgstTotal + igstTotal,
      slabs: Array.from(slabMap.values()),
      topProducts: Array.from(productSales.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
      topCustomers: Array.from(customerSales.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
    };
  }, [filteredEstimates, productCostMap, costFallbackPct, expenses]);

  // Export CA-Ready GSTR-1 Invoice Summary CSV
  const handleExportGstCsv = () => {
    const headers = [
      'Invoice No',
      'Date',
      'Customer Name',
      'Customer GSTIN',
      'Invoice Mode',
      'Taxable Value',
      'CGST',
      'SGST',
      'IGST',
      'Total Tax',
      'Grand Total',
      'Status',
    ];
    const rows = filteredEstimates.map((est) => {
      const grand = Number(est.grandTotal) || 0;
      const cgst = Number(est.cgstTotal) || (Number(est.taxAmt) || 0) / 2;
      const sgst = Number(est.sgstTotal) || (Number(est.taxAmt) || 0) / 2;
      const igst = Number(est.igstTotal) || 0;
      const totalTax = cgst + sgst + igst;
      const taxable = Math.max(0, grand - totalTax);
      return [
        `"${est.serial}"`,
        est.date,
        `"${(est.clientName || 'Walk-in').replace(/"/g, '""')}"`,
        est.clientGstin || 'Unregistered',
        est.isGstInvoice === false ? 'NON-GST' : 'GST',
        taxable.toFixed(2),
        cgst.toFixed(2),
        sgst.toFixed(2),
        igst.toFixed(2),
        totalTax.toFixed(2),
        grand.toFixed(2),
        est.status,
      ];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CA_GST_Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Period Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              Sales, Profit & CA GST Reports
            </h2>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            100% local analytics computed directly from IndexedDB — ready for your Chartered Accountant.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['TODAY', '7D', '30D', 'ALL', 'CUSTOM'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                period === p
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {p === 'TODAY'
                ? 'Today'
                : p === '7D'
                ? 'Last 7 Days'
                : p === '30D'
                ? 'Last 30 Days'
                : p === 'ALL'
                ? 'All Time'
                : 'Custom Range'}
            </button>
          ))}

          <button
            type="button"
            onClick={handleExportGstCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CA CSV</span>
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {period === 'CUSTOM' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-bold"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-bold"
            />
          </div>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Total Sales ({filteredEstimates.length} Bills)
          </p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
            {formatCurrency(reportStats.totalRevenue)}
          </p>
          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
            Collected: {formatCurrency(reportStats.totalCollected)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Gross Profit (Sales − Cost)
          </p>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {formatCurrency(reportStats.grossProfit)}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 mt-1">
            Net after Expenses: {formatCurrency(reportStats.netProfitAfterExpenses)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Total GST Collected
          </p>
          <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {formatCurrency(reportStats.totalGst)}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 mt-1">
            Taxable: {formatCurrency(reportStats.taxableValueTotal)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Pending Udhaar / Dues
          </p>
          <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrency(reportStats.totalDue)}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 mt-1">
            Shop Expenses: {formatCurrency(reportStats.totalExpenses)}
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('OVERVIEW')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer ${
            activeSubTab === 'OVERVIEW'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Top Products & Customers
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('GST_CA')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer ${
            activeSubTab === 'GST_CA'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          CA GST Slab Summary (CGST / SGST / IGST)
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('EXPENSES')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer ${
            activeSubTab === 'EXPENSES'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Shop Expense Tracker ({expenses.length})
        </button>
      </div>

      {activeSubTab === 'OVERVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Top Selling Products */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Top Selling Products
                </h3>
              </div>
              <span className="text-[11px] font-bold text-slate-400">By Revenue & Margin</span>
            </div>

            {reportStats.topProducts.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                No product sales recorded in this date range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400">
                      <th className="py-2">Product</th>
                      <th className="py-2 text-right">Qty Sold</th>
                      <th className="py-2 text-right">Revenue</th>
                      <th className="py-2 text-right">Est. Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    {reportStats.topProducts.map((prod, idx) => (
                      <tr key={prod.name}>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-white">
                          <span className="text-slate-400 mr-1.5">#{idx + 1}</span>
                          {prod.name}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {prod.qty}
                        </td>
                        <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">
                          {formatCurrency(prod.revenue)}
                        </td>
                        <td className="py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(prod.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Customers */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Top Customers
                </h3>
              </div>
              <span className="text-[11px] font-bold text-slate-400">By Total Business</span>
            </div>

            {reportStats.topCustomers.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                No customer bills in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400">
                      <th className="py-2">Customer</th>
                      <th className="py-2 text-right">Bills</th>
                      <th className="py-2 text-right">Total Sales</th>
                      <th className="py-2 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    {reportStats.topCustomers.map((cust) => (
                      <tr key={`${cust.name}-${cust.phone}`}>
                        <td className="py-2.5">
                          <div className="font-bold text-slate-900 dark:text-white">{cust.name}</div>
                          <div className="text-[10px] text-slate-400">{cust.phone}</div>
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {cust.count}
                        </td>
                        <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">
                          {formatCurrency(cust.total)}
                        </td>
                        <td className="py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(cust.due)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'GST_CA' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                <span>CA-Ready GST Slab Breakup (GSTR-1 / GSTR-3B Summary)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Taxable value and CGST / SGST / IGST split across 0%, 5%, 12%, 18%, and 28% GST slabs.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportGstCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download GST CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase text-slate-400">
                  <th className="py-2.5">GST Slab</th>
                  <th className="py-2.5 text-right">Taxable Value</th>
                  <th className="py-2.5 text-right">CGST</th>
                  <th className="py-2.5 text-right">SGST</th>
                  <th className="py-2.5 text-right">IGST</th>
                  <th className="py-2.5 text-right">Total Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {reportStats.slabs.map((slab) => (
                  <tr key={slab.rate}>
                    <td className="py-3 font-black text-slate-900 dark:text-white">
                      {slab.rate === 0 ? '0% (Exempt / Non-GST)' : `GST ${slab.rate}%`}
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {formatCurrency(slab.taxable)}
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {formatCurrency(slab.cgst)}
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {formatCurrency(slab.sgst)}
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {formatCurrency(slab.igst)}
                    </td>
                    <td className="py-3 text-right font-black text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(slab.totalTax)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-black text-xs text-slate-900 dark:text-white">
                  <td className="py-3">TOTAL</td>
                  <td className="py-3 text-right">{formatCurrency(reportStats.taxableValueTotal)}</td>
                  <td className="py-3 text-right">{formatCurrency(reportStats.cgstTotal)}</td>
                  <td className="py-3 text-right">{formatCurrency(reportStats.sgstTotal)}</td>
                  <td className="py-3 text-right">{formatCurrency(reportStats.igstTotal)}</td>
                  <td className="py-3 text-right text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(reportStats.totalGst)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'EXPENSES' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={handleAddExpense}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5"
          >
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-500" />
              <span>Record Shop Expense</span>
            </h3>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Category
              </label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value as ExpenseRecord['category'])}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-bold"
              >
                <option value="Transport">Transport / Delivery</option>
                <option value="Electricity">Electricity / Utility</option>
                <option value="Rent">Shop Rent</option>
                <option value="Staff Salary">Staff Salary / Tea</option>
                <option value="Packaging">Packaging Material</option>
                <option value="Misc">Miscellaneous</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Amount (₹)
              </label>
              <input
                type="number"
                min="1"
                required
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="e.g. 500"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Notes / Description
              </label>
              <input
                type="text"
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="e.g. Auto fare for stock pickup"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['CASH', 'UPI', 'BANK'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExpMode(m)}
                    className={`py-1.5 rounded-lg text-[11px] font-black uppercase border ${
                      expMode === m
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-slate-300 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Save Expense</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Recorded Shop Expenses
              </h3>
              <span className="text-xs font-black text-rose-500">
                Total: {formatCurrency(reportStats.totalExpenses)}
              </span>
            </div>

            {expenses.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                No shop expenses logged yet. Add expenses on the left to track true net profit.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400">
                      <th className="py-2">Date</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Description</th>
                      <th className="py-2">Mode</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {expenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="py-2.5 font-semibold text-slate-500">{exp.date}</td>
                        <td className="py-2.5 font-bold text-slate-900 dark:text-white">
                          {exp.category}
                        </td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-300">
                          {exp.description}
                        </td>
                        <td className="py-2.5 font-bold text-slate-500">{exp.paymentMode}</td>
                        <td className="py-2.5 text-right font-black text-rose-600 dark:text-rose-400">
                          {formatCurrency(exp.amount)}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
