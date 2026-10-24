import React, { useEffect } from 'react';
import { Keyboard, X, Compass, Zap, Table2, CornerDownLeft, Sparkles } from 'lucide-react';

export interface KeyboardShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerShortcut?: (action: string) => void;
}

interface ShortcutItem {
  keys: string[];
  label: string;
  description: string;
  actionId?: string;
  badge?: string;
}

interface ShortcutCategory {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: ShortcutItem[];
}

export default function KeyboardShortcutModal({
  isOpen,
  onClose,
  onTriggerShortcut,
}: KeyboardShortcutModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories: ShortcutCategory[] = [
    {
      title: 'Global Navigation Keys',
      subtitle: 'Jump between screens from anywhere in the POS',
      icon: <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
      items: [
        {
          keys: ['F1'],
          label: 'Keyboard Shortcut Guide',
          description: 'Toggle this shortcut reference overlay modal anytime',
          badge: 'Active',
        },
        {
          keys: ['F2'],
          label: 'New Sales Bill / Add Item Row',
          description: 'Opens Sales Invoice screen or adds a new item row during billing',
          actionId: 'new_bill',
        },
        {
          keys: ['F3'],
          label: 'Save & Print / Quick Print Latest',
          description: 'Saves & prints active bill, or prints the most recent invoice',
          actionId: 'quick_print',
        },
        {
          keys: ['F4'],
          label: 'Items & Inventory Search',
          description: 'Jumps directly to Inventory Stock and focuses the search bar',
          actionId: 'inventory',
        },
        {
          keys: ['F6'],
          label: 'Select Customer / Party Search',
          description: 'Opens Billing screen and focuses the Party / Customer selector',
          actionId: 'focus_party',
        },
        {
          keys: ['F7'],
          label: 'Parties & Customers Directory',
          description: 'Opens your registered customer and wholesale party list',
          actionId: 'clients',
        },
        {
          keys: ['F8'],
          label: 'Party Ledgers & Passbook',
          description: 'Opens party khata statements and payment collection records',
          actionId: 'statements',
        },
        {
          keys: ['F9'],
          label: 'Dashboard & Reports',
          description: 'Returns to main business analytics and invoice register',
          actionId: 'dashboard',
        },
        {
          keys: ['Esc'],
          label: 'Back / Close Overlay',
          description: 'Closes open modals or print preview, or returns to the previous screen',
        },
      ],
    },
    {
      title: 'Billing & Estimate Counter Keys',
      subtitle: 'High-speed actions while creating or editing an invoice',
      icon: <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      items: [
        {
          keys: ['Ctrl', 'P'],
          label: 'Save & Print Invoice',
          description: 'Immediately settles the current bill and opens A4/A5 print preview',
        },
        {
          keys: ['Ctrl', 'S'],
          label: 'Save & New Bill',
          description: 'Saves current bill and resets the counter for the next customer',
        },
        {
          keys: ['F2'],
          label: 'Insert Blank Item Row',
          description: 'Appends a new item row and focuses the Product Name field',
        },
        {
          keys: ['F6'],
          label: 'Change / Search Billing Party',
          description: 'Opens the customer search dropdown and selects the input box',
        },
      ],
    },
    {
      title: 'Table & Autocomplete Controls',
      subtitle: 'Hands-free keyboard entry inside invoice item rows',
      icon: <Table2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
      items: [
        {
          keys: ['↑', '↓'],
          label: 'Navigate Suggestions',
          description: 'Move up or down through matching products or customer results',
        },
        {
          keys: ['Enter'],
          label: 'Select Item / Next Row',
          description: 'Picks highlighted product or advances cursor to the next row',
        },
        {
          keys: ['Tab'],
          label: 'Next Column Field',
          description: 'Moves across Item Name → MRP → Qty → Rate → Delete button',
        },
        {
          keys: ['Shift', 'Tab'],
          label: 'Previous Column Field',
          description: 'Moves backward to the previous field in the current or prior row',
        },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[10000] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 no-print select-none animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcut-guide-title"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="keyboard-shortcut-guide-title"
                  className="text-base sm:text-lg font-black tracking-tight text-white"
                >
                  Keyboard Shortcut Guide
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase tracking-wider bg-blue-600 text-white rounded-md shadow-xs">
                  Press F1 Anytime
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Fast accounting & POS counter navigation keys for mouse-free billing
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Close Shortcut Guide (Esc)"
          >
            <span className="hidden sm:inline text-[10px] font-mono text-slate-400">ESC</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/60 dark:bg-slate-950/50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Column: Global Navigation */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col">
              <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/50">
                  {categories[0].icon}
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                    {categories[0].title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {categories[0].subtitle}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {categories[0].items.map((item, idx) => {
                  const isClickable = Boolean(item.actionId && onTriggerShortcut);
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (item.actionId && onTriggerShortcut) {
                          onTriggerShortcut(item.actionId);
                          onClose();
                        }
                      }}
                      className={`py-2.5 px-2 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                        isClickable
                          ? 'hover:bg-blue-50/70 dark:hover:bg-slate-800/70 cursor-pointer group'
                          : ''
                      }`}
                      title={isClickable ? `Click to run: ${item.label}` : undefined}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, kIdx) => (
                          <React.Fragment key={kIdx}>
                            {kIdx > 0 && (
                              <span className="text-[10px] font-bold text-slate-400">+</span>
                            )}
                            <kbd className="px-2.5 py-1 text-[11px] font-mono font-black text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs min-w-[32px] text-center">
                              {k}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Billing + Table Controls */}
            <div className="space-y-5 flex flex-col">
              {categories.slice(1).map((cat, cIdx) => (
                <div
                  key={cIdx}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      {cat.icon}
                    </div>
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                        {cat.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {cat.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {cat.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="py-2.5 px-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 block">
                            {item.label}
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                            {item.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {item.keys.map((k, kIdx) => (
                            <React.Fragment key={kIdx}>
                              {kIdx > 0 && (
                                <span className="text-[10px] font-bold text-slate-400">+</span>
                              )}
                              <kbd className="px-2.5 py-1 text-[11px] font-mono font-black text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs min-w-[32px] text-center">
                                {k}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              Tip: Click any navigation shortcut row above to jump directly to that screen, or press{' '}
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-black bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200">
                F1
              </kbd>{' '}
              anytime to toggle this guide.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
            <span>Got It, Close Guide</span>
          </button>
        </div>
      </div>
    </div>
  );
}
