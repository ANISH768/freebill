import React from 'react';
import { RefreshCw, LogOut, Cloud, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { useCloudAuth } from '../context/CloudAuthContext';

interface GoogleAccountSyncControlProps {
  variant: 'header' | 'card';
  isSyncing: boolean;
  lastSyncedAt?: string | null;
  localRecordCount: {
    bills: number;
    products: number;
    clients: number;
    stockLogs: number;
  };
  onSyncLocalData: () => void;
  onPullCloudData?: () => void;
}

function GoogleLogoSvg({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export default function GoogleAccountSyncControl({
  variant,
  isSyncing,
  lastSyncedAt,
  localRecordCount,
  onSyncLocalData,
  onPullCloudData,
}: GoogleAccountSyncControlProps) {
  const {
    cloudUser,
    authLoading,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutGoogle,
    clearAuthError,
  } = useCloudAuth();

  if (variant === 'header') {
    if (authLoading || !cloudUser) {
      return null;
    }

    return (
      <div className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-[#d1d5db] dark:border-slate-700 rounded-[6px] px-2 py-1">
        <span
          className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 max-w-[140px] truncate px-1"
          title={cloudUser.email || cloudUser.displayName || 'Google Account'}
        >
          {cloudUser.email || cloudUser.displayName || 'Signed in'}
        </span>
        <button
          type="button"
          onClick={onSyncLocalData}
          disabled={isSyncing}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          title="Sync all local bills, products, customers, and stock logs to your Google account"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Local Data'}</span>
        </button>
        <button
          type="button"
          onClick={() => void signOutGoogle()}
          className="p-1 rounded-[5px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
          title="Sign out of Google account"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Card variant for Backup & Sync view
  const totalLocal =
    localRecordCount.bills +
    localRecordCount.products +
    localRecordCount.clients +
    localRecordCount.stockLogs;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Cloud className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold">Google Account Cloud Sync</span>
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
            Sync Bills, Inventory, Customers &amp; Stock History
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sign in with Google to securely back up and automatically keep all your counter records synced across sessions and devices.
          </p>
        </div>

        {!authLoading && !cloudUser && (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={isSigningIn}
            className="inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 shadow-xs text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <GoogleLogoSvg className="w-4 h-4 shrink-0" />
            <span>{isSigningIn ? 'Opening Google Sign-In...' : 'Sign in with Google'}</span>
          </button>
        )}

        {!authLoading && cloudUser && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSyncLocalData}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Data...' : 'Sync Local Data to Cloud'}</span>
            </button>
            {onPullCloudData && (
              <button
                type="button"
                onClick={onPullCloudData}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                title="Load latest saved data from your Google account"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Load Cloud Data</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOutGoogle()}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>

      {authError && (
        <div className="flex items-center justify-between gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-2.5 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
          <button
            type="button"
            onClick={clearAuthError}
            className="text-rose-700 underline text-[11px] font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {cloudUser && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="sm:col-span-2 lg:col-span-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
              {(cloudUser.displayName || cloudUser.email || 'G').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {cloudUser.displayName || 'Google Account'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {cloudUser.email}
              </div>
              {lastSyncedAt && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>Last synced {new Date(lastSyncedAt).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
            <div className="text-[11px] font-semibold text-slate-500">Bills</div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
              {localRecordCount.bills}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
            <div className="text-[11px] font-semibold text-slate-500">Products</div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
              {localRecordCount.products}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
            <div className="text-[11px] font-semibold text-slate-500">Customers &amp; Logs</div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
              {localRecordCount.clients}
              <span className="text-xs font-semibold text-slate-400 ml-1.5">
                / {localRecordCount.stockLogs} logs
              </span>
            </div>
          </div>
        </div>
      )}

      {!cloudUser && totalLocal > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          You currently have <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{localRecordCount.bills}</span> bills,{' '}
          <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{localRecordCount.products}</span> products, and{' '}
          <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{localRecordCount.clients}</span> customers stored locally ready for one-click cloud sync after sign-in.
        </p>
      )}
    </div>
  );
}
