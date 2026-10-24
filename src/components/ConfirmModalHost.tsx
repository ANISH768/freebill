import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, CheckCircle2, X } from 'lucide-react';
import { ConfirmDialogOptions, subscribeConfirmModal } from '../utils/confirmModal';

export const ConfirmModalHost: React.FC = () => {
  const [dialog, setDialog] = useState<
    (ConfirmDialogOptions & { resolve: (result: boolean) => void }) | null
  >(null);

  useEffect(() => {
    return subscribeConfirmModal((req) => {
      setDialog(req);
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dialog.resolve(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        dialog.resolve(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog]);

  if (!dialog) return null;

  const isDanger = dialog.variant === 'danger' || !dialog.variant;
  const isWarning = dialog.variant === 'warning';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => dialog.resolve(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isDanger
                    ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                    : isWarning
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                    : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60'
                }`}
              >
                {isDanger ? (
                  <Trash2 className="w-5 h-5" />
                ) : isWarning ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {dialog.title}
                </h3>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  Please confirm to proceed
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => dialog.resolve(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close confirmation modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
              {dialog.message}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => dialog.resolve(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              {dialog.cancelText || 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => dialog.resolve(true)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-md transition-all active:scale-95 ${
                isDanger
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : isWarning
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
              }`}
            >
              {dialog.confirmText || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
