import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  FilePlus,
  FileText,
  Users,
  Package,
  BarChart3,
  ShieldCheck,
  Database,
  Settings,
  Printer,
  LayoutDashboard,
  ArrowRight,
  X,
  Command,
} from 'lucide-react';
import { Client, Estimate, Product } from '../types';

export type AppTabId =
  | 'dashboard'
  | 'create'
  | 'estimates'
  | 'inventory'
  | 'clients'
  | 'reports'
  | 'audit_logs'
  | 'backup'
  | 'print_setup'
  | 'settings';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: AppTabId) => void;
  onSelectEstimate?: (estimate: Estimate) => void;
  estimates: Estimate[];
  clients: Client[];
  products: Product[];
  userRole: 'admin' | 'clerk';
  formatCurrency: (val: number) => string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectEstimate,
  estimates,
  clients,
  products,
  userRole,
  formatCurrency,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const navActions = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      category: 'Navigation';
      icon: React.ReactNode;
      action: () => void;
    }> = [
      {
        id: 'nav-create',
        title: '+ Create New Bill / Estimate',
        subtitle: 'Open fast POS billing terminal (GST & Non-GST)',
        category: 'Navigation',
        icon: <FilePlus className="w-4 h-4 text-emerald-500" />,
        action: () => {
          onNavigate('create');
          onClose();
        },
      },
      {
        id: 'nav-estimates',
        title: 'All Bills & Invoices',
        subtitle: 'Search, print, collect payment, or cancel bills',
        category: 'Navigation',
        icon: <FileText className="w-4 h-4 text-indigo-500" />,
        action: () => {
          onNavigate('estimates');
          onClose();
        },
      },
      {
        id: 'nav-clients',
        title: 'Customers & Udhaar Ledger',
        subtitle: 'Customer balances, WhatsApp reminders & payment collection',
        category: 'Navigation',
        icon: <Users className="w-4 h-4 text-sky-500" />,
        action: () => {
          onNavigate('clients');
          onClose();
        },
      },
      {
        id: 'nav-inventory',
        title: 'Products & Stock Inventory',
        subtitle: 'Manage items, barcodes, HSN, GST & low-stock alerts',
        category: 'Navigation',
        icon: <Package className="w-4 h-4 text-amber-500" />,
        action: () => {
          onNavigate('inventory');
          onClose();
        },
      },
      {
        id: 'nav-print',
        title: 'Print Setup & Tally Themes',
        subtitle: 'Customize A4, Thermal 58/80mm & Tally Prime templates',
        category: 'Navigation',
        icon: <Printer className="w-4 h-4 text-purple-500" />,
        action: () => {
          onNavigate('print_setup');
          onClose();
        },
      },
    ];

    if (userRole === 'admin') {
      items.unshift({
        id: 'nav-dashboard',
        title: 'Business Dashboard',
        subtitle: "Today's sales, profit, 7/30-day trends & overdue dues",
        category: 'Navigation',
        icon: <LayoutDashboard className="w-4 h-4 text-indigo-500" />,
        action: () => {
          onNavigate('dashboard');
          onClose();
        },
      });
      items.push(
        {
          id: 'nav-reports',
          title: 'Reports, Profit & CA GST Summary',
          subtitle: 'CGST/SGST/IGST split, CSV export & expense tracker',
          category: 'Navigation',
          icon: <BarChart3 className="w-4 h-4 text-emerald-500" />,
          action: () => {
            onNavigate('reports');
            onClose();
          },
        },
        {
          id: 'nav-audit',
          title: 'Security & Audit Logs',
          subtitle: 'Time-stamped log of logins, bills, price edits & backups',
          category: 'Navigation',
          icon: <ShieldCheck className="w-4 h-4 text-rose-500" />,
          action: () => {
            onNavigate('audit_logs');
            onClose();
          },
        },
        {
          id: 'nav-backup',
          title: 'Backup & Restore Vault',
          subtitle: '1-tap JSON backup export & validated merge/replace restore',
          category: 'Navigation',
          icon: <Database className="w-4 h-4 text-cyan-500" />,
          action: () => {
            onNavigate('backup');
            onClose();
          },
        },
        {
          id: 'nav-settings',
          title: 'Business Settings & Clerk PIN',
          subtitle: 'Profile, GSTIN, invoice prefix, clerk login & offline info',
          category: 'Navigation',
          icon: <Settings className="w-4 h-4 text-slate-400" />,
          action: () => {
            onNavigate('settings');
            onClose();
          },
        }
      );
    }

    return items;
  }, [onNavigate, onClose, userRole]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{
      id: string;
      title: string;
      subtitle: string;
      badge?: string;
      icon: React.ReactNode;
      action: () => void;
    }> = [];

    // 1. Navigation matches
    navActions.forEach((nav) => {
      if (!q || nav.title.toLowerCase().includes(q) || nav.subtitle.toLowerCase().includes(q)) {
        list.push({
          id: nav.id,
          title: nav.title,
          subtitle: nav.subtitle,
          badge: 'Screen',
          icon: nav.icon,
          action: nav.action,
        });
      }
    });

    if (q.length >= 1) {
      // 2. Matching invoices
      estimates
        .filter(
          (e) =>
            (e.serial || '').toLowerCase().includes(q) ||
            (e.clientName || '').toLowerCase().includes(q) ||
            (e.clientPhone || '').toLowerCase().includes(q)
        )
        .slice(0, 6)
        .forEach((est) => {
          list.push({
            id: `est-${est.id}`,
            title: `${est.serial} — ${est.clientName}`,
            subtitle: `${est.date} • Total: ${formatCurrency(est.grandTotal)} • ${est.status}`,
            badge: 'Invoice',
            icon: <FileText className="w-4 h-4 text-indigo-400" />,
            action: () => {
              if (onSelectEstimate) {
                onSelectEstimate(est);
              } else {
                onNavigate('estimates');
              }
              onClose();
            },
          });
        });

      // 3. Matching customers
      clients
        .filter(
          (c) =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q) ||
            (c.gstin || '').toLowerCase().includes(q)
        )
        .slice(0, 5)
        .forEach((client) => {
          list.push({
            id: `cli-${client.id}`,
            title: client.name,
            subtitle: `Phone: +91 ${client.phone}${client.gstin ? ` • GSTIN: ${client.gstin}` : ''}`,
            badge: 'Customer',
            icon: <Users className="w-4 h-4 text-sky-400" />,
            action: () => {
              onNavigate('clients');
              onClose();
            },
          });
        });

      // 4. Matching products
      products
        .filter(
          (p) =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q)
        )
        .slice(0, 5)
        .forEach((prod) => {
          list.push({
            id: `prd-${prod.id}`,
            title: prod.name,
            subtitle: `SKU: ${prod.sku} • Rate: ${formatCurrency(prod.price)} • Stock: ${prod.stock} ${prod.unit}`,
            badge: 'Product',
            icon: <Package className="w-4 h-4 text-amber-400" />,
            action: () => {
              onNavigate('inventory');
              onClose();
            },
          });
        });
    }

    return list;
  }, [query, navActions, estimates, clients, products, formatCurrency, onNavigate, onClose, onSelectEstimate]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          results.length > 0 ? (prev - 1 + results.length) % results.length : 0
        );
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        results[selectedIndex].action();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[180] bg-slate-950/75 backdrop-blur-sm flex items-start justify-center pt-14 sm:pt-24 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-indigo-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to screen, invoice no, customer mobile, or product..."
            className="w-full bg-transparent text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs font-semibold text-slate-400">
              No matching bills, customers, products, or screens found.
            </div>
          ) : (
            results.map((item, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.action}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/50'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight
                      className={`w-4 h-4 transition-transform ${
                        active ? 'text-indigo-500 translate-x-0.5' : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Shortcuts */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-400">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>ESC Close</span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <span>Ctrl / ⌘ + K</span>
          </div>
        </div>
      </div>
    </div>
  );
};
