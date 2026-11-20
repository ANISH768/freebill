import React, { useEffect, useState } from 'react';
import { Download, Wifi, WifiOff, ShieldAlert, X, Smartphone, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallBarProps {
  onOpenBackup?: () => void;
}

export const PWAInstallBar: React.FC<PWAInstallBarProps> = ({ onOpenBackup }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [backupOverdueDays, setBackupOverdueDays] = useState<number | null>(null);
  const [dismissedBackupBanner, setDismissedBackupBanner] = useState(false);

  const isIos =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check 7-day auto-backup reminder
    const checkBackupAge = () => {
      const lastBackupRaw = localStorage.getItem('pos_last_backup_timestamp');
      if (!lastBackupRaw) {
        setBackupOverdueDays(7);
        return;
      }
      const lastTime = Number(lastBackupRaw) || new Date(lastBackupRaw).getTime();
      if (!lastTime || isNaN(lastTime)) {
        setBackupOverdueDays(7);
        return;
      }
      const diffDays = Math.floor((Date.now() - lastTime) / (1000 * 60 * 60 * 24));
      if (diffDays >= 7) {
        setBackupOverdueDays(diffDays);
      } else {
        setBackupOverdueDays(null);
      }
    };

    checkBackupAge();
    window.addEventListener('storage', checkBackupAge);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', checkBackupAge);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Offline / Local DB Status Pill */}
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
            isOnline
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          }`}
          title={
            isOnline
              ? '100% Local IndexedDB Active — Zero Internet Required'
              : 'You are offline — everything still works'
          }
        >
          {isOnline ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span className="hidden sm:inline">Offline-Ready DB</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-amber-400" />
              <span>You are offline — everything still works</span>
            </>
          )}
        </div>

        {/* Install PWA Button */}
        {!isInstalled && (deferredPrompt || isIos) && (
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all cursor-pointer"
            title="Install BillSync Pro on your phone or desktop for 100% offline billing"
          >
            <Download className="w-3 h-3" />
            <span>Install App</span>
          </button>
        )}

        {/* 7-Day Auto-Backup Reminder Pill */}
        {backupOverdueDays !== null && !dismissedBackupBanner && onOpenBackup && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-300">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <button
              type="button"
              onClick={onOpenBackup}
              className="hover:underline text-left cursor-pointer"
            >
              Backup overdue ({backupOverdueDays}+ days) — Save JSON
            </button>
            <button
              type="button"
              onClick={() => setDismissedBackupBanner(true)}
              className="ml-1 text-amber-400/70 hover:text-amber-200"
              aria-label="Dismiss backup reminder"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* iOS Add to Home Screen Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black uppercase tracking-wider">Install BillSync Pro</h3>
              </div>
              <button
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Install BillSync Pro on your home screen for full-screen, 100% offline billing without internet:
            </p>
            <ol className="space-y-2.5 text-xs text-slate-200 mb-5">
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-[11px]">
                  1
                </span>
                <span>
                  Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline mx-0.5 text-indigo-400" /> in Safari.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-[11px]">
                  2
                </span>
                <span>
                  Select <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center text-[11px]">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top-right corner.
                </span>
              </li>
            </ol>
            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-black uppercase tracking-wider text-white"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
