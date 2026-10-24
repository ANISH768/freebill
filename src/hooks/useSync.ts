import { useState, useEffect, useCallback } from 'react';
import { UserUserDataState } from '../types';
import { addToOfflineSyncQueue, getOfflineSyncQueue, clearOfflineSyncQueue } from '../utils/storage';

export function useSync(currentUserPhone: string, currentData: UserUserDataState, onCloudDataReceived: (data: UserUserDataState) => void) {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncMessage, setSyncMessage] = useState<string>('');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncMessage('Online - Background sync ready');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncMessage('Offline - Changes saved locally');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncDataWithServer = useCallback(async (forceDirection?: 'upload' | 'download'): Promise<{ success: boolean; message: string }> => {
    if (!currentUserPhone) return { success: false, message: 'No active user' };
    setIsSyncing(true);
    setSyncMessage('Syncing data with cloud server...');

    try {
      if (!isOnline) {
        addToOfflineSyncQueue(currentUserPhone, currentData);
        setIsSyncing(false);
        setSyncMessage('Saved to offline sync queue');
        return { success: true, message: 'Offline: Queued for auto-sync when online.' };
      }

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobileNumber: currentUserPhone,
          action: forceDirection || 'sync',
          payload: currentData
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const responseData = await res.json();

      if (responseData.data && forceDirection !== 'upload') {
        onCloudDataReceived(responseData.data);
      }

      // Check if we have pending items in offline sync queue and process them
      const offlineQueue = getOfflineSyncQueue();
      if (offlineQueue.length > 0) {
        for (const item of offlineQueue) {
          await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mobileNumber: item.mobileNumber,
              action: 'upload',
              payload: item.payload
            })
          }).catch(() => {});
        }
        clearOfflineSyncQueue();
      }

      const now = new Date().toLocaleTimeString();
      setLastSyncTime(now);
      setIsSyncing(false);
      setSyncMessage(`Synced at ${now}`);

      return {
        success: true,
        message: forceDirection === 'upload' ? 'Local data forced to Cloud!' : forceDirection === 'download' ? 'Cloud data downloaded!' : 'Cloud Sync Complete!'
      };
    } catch (err: unknown) {
      console.warn("Sync failed, fallback to local offline queue:", err);
      addToOfflineSyncQueue(currentUserPhone, currentData);
      setIsSyncing(false);
      const errMsg = err instanceof Error ? err.message : 'Network error';
      setSyncMessage('Sync error (Saved locally)');
      return { success: false, message: `Sync warning: ${errMsg}. Saved safely offline!` };
    }
  }, [currentUserPhone, currentData, isOnline, onCloudDataReceived]);

  return {
    isSyncing,
    lastSyncTime,
    isOnline,
    syncMessage,
    syncDataWithServer
  };
}
