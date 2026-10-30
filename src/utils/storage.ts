import { db } from '../db';
import { Client, Product, Estimate, StockLog, AuditLog, UserUserDataState, User } from '../types';

class SafeStorageMemory {
  private memStore: Record<string, string> = {};

  constructor() {
    this.restoreFromBackup();
  }

  private hasLocalStorage(): boolean {
    try {
      return typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null;
    } catch {
      return false;
    }
  }

  private hasSessionStorage(): boolean {
    try {
      return typeof window !== 'undefined' && 'sessionStorage' in window && window.sessionStorage !== null;
    } catch {
      return false;
    }
  }

  private saveBackup(): void {
    // Avoid serializing multi-megabyte catalogs into document.cookie on every write
  }

  private pruneRedundantStorageKeys(preserveKey?: string): void {
    if (!this.hasLocalStorage()) return;
    const redundantPatterns = [
      'saved_bills_file_data',
      'offline_sync_queue',
      'off_products',
      'off_estimates',
      '_data'
    ];
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || k === preserveKey) continue;
        if (redundantPatterns.some(pat => k === pat || k.endsWith(pat))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        try {
          window.localStorage.removeItem(k);
        } catch {}
      });
    } catch {}
  }

  private restoreFromBackup(): void {
    if (typeof window === 'undefined') return;
    try {
      if (this.hasSessionStorage()) {
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) {
            const val = window.sessionStorage.getItem(key);
            if (val !== null) this.memStore[key] = val;
          }
        }
      }
    } catch (e) {}

    try {
      if (this.hasLocalStorage()) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            const val = window.localStorage.getItem(key);
            if (val !== null) this.memStore[key] = val;
          }
        }
      }
    } catch (e) {}
  }

  getItem(key: string): string | null {
    if (Object.prototype.hasOwnProperty.call(this.memStore, key) && this.memStore[key] !== undefined) {
      return this.memStore[key];
    }

    try {
      if (this.hasLocalStorage()) {
        const val = window.localStorage.getItem(key);
        if (val !== null) {
          this.memStore[key] = val;
          return val;
        }
      }
    } catch (e) {}

    try {
      if (this.hasSessionStorage()) {
        const val = window.sessionStorage.getItem(key);
        if (val !== null) {
          this.memStore[key] = val;
          return val;
        }
      }
    } catch (e) {}

    return this.memStore[key] || null;
  }

  setItem(key: string, value: string): void {
    this.memStore[key] = value;
    try {
      if (this.hasLocalStorage()) {
        try {
          window.localStorage.setItem(key, value);
        } catch (quotaErr) {
          // Prune bloated duplicate keys and retry so new bills/estimates are never lost
          this.pruneRedundantStorageKeys(key);
          try {
            window.localStorage.setItem(key, value);
          } catch {}
        }
      }
    } catch (e) {}
    try {
      if (this.hasSessionStorage()) {
        try {
          window.sessionStorage.setItem(key, value);
        } catch {
          try {
            window.sessionStorage.removeItem('saved_bills_file_data');
            window.sessionStorage.removeItem('offline_sync_queue');
            window.sessionStorage.setItem(key, value);
          } catch {}
        }
      }
    } catch (e) {}
  }

  removeItem(key: string): void {
    delete this.memStore[key];
    try {
      if (this.hasLocalStorage()) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {}
    try {
      if (this.hasSessionStorage()) {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) {}
  }

  clear(): void {
    this.memStore = {};
    try {
      if (this.hasLocalStorage()) window.localStorage.clear();
    } catch (e) {}
    try {
      if (this.hasSessionStorage()) window.sessionStorage.clear();
    } catch (e) {}
  }
}

export const safeStorage = new SafeStorageMemory();

// --- DEXIE INDEXEDDB ASYNC STORAGE OPERATIONS ---

export async function saveUserIsolatedDataDexie(mobileNumber: string, data: UserUserDataState): Promise<void> {
  if (!mobileNumber) return;
  try {
    // 1. Sync clients to Dexie
    if (data.clients) {
      await db.clients.where('userPhone').equals(mobileNumber).delete();
      const clientsWithUser = data.clients.map(c => ({ ...c, userPhone: mobileNumber }));
      await db.clients.bulkPut(clientsWithUser);
    }

    // 2. Sync products to Dexie
    if (data.products) {
      await db.products.where('userPhone').equals(mobileNumber).delete();
      const productsWithUser = data.products.map(p => ({ ...p, userPhone: mobileNumber }));
      await db.products.bulkPut(productsWithUser);
    }

    // 3. Sync estimates to Dexie
    if (data.estimates) {
      await db.estimates.where('userPhone').equals(mobileNumber).delete();
      const estimatesWithUser = data.estimates.map(e => ({ ...e, userPhone: mobileNumber }));
      await db.estimates.bulkPut(estimatesWithUser);
    }

    // 4. Sync stock logs to Dexie
    if (data.stockLogs) {
      await db.stockLogs.where('userPhone').equals(mobileNumber).delete();
      const logsWithUser = data.stockLogs.map(l => ({ ...l, userPhone: mobileNumber }));
      await db.stockLogs.bulkPut(logsWithUser);
    }

    // 5. Sync audit logs to Dexie
    if (data.auditLogs) {
      await db.auditLogs.where('userPhone').equals(mobileNumber).delete();
      const auditsWithUser = data.auditLogs.map(a => ({ ...a, userPhone: mobileNumber }));
      await db.auditLogs.bulkPut(auditsWithUser);
    }

    // Also persist in safeStorage for backward compatibility and fast fallback
    safeStorage.setItem(`user_${mobileNumber}_data`, JSON.stringify(data));
  } catch (err) {
    console.error("Error saving to Dexie IndexedDB:", err);
    safeStorage.setItem(`user_${mobileNumber}_data`, JSON.stringify(data));
  }
}

export async function getUserIsolatedDataDexie(mobileNumber: string): Promise<UserUserDataState | null> {
  if (!mobileNumber) return null;
  try {
    const clients = await db.clients.where('userPhone').equals(mobileNumber).toArray();
    const products = await db.products.where('userPhone').equals(mobileNumber).toArray();
    const estimates = await db.estimates.where('userPhone').equals(mobileNumber).toArray();
    const stockLogs = await db.stockLogs.where('userPhone').equals(mobileNumber).toArray();
    const auditLogs = await db.auditLogs.where('userPhone').equals(mobileNumber).toArray();

    const fallbackRaw = safeStorage.getItem(`user_${mobileNumber}_data`);
    const fallbackObj = fallbackRaw ? JSON.parse(fallbackRaw) : {};

    if (clients.length > 0 || products.length > 0 || estimates.length > 0) {
      return {
        clients,
        products,
        estimates,
        stockLogs,
        auditLogs,
        costFallbackPct: fallbackObj.costFallbackPct ?? 80,
        businessName: fallbackObj.businessName,
        userGstin: fallbackObj.userGstin,
        userUpiId: fallbackObj.userUpiId
      };
    }

    return fallbackRaw ? fallbackObj : null;
  } catch (err) {
    console.error("Error reading from Dexie IndexedDB:", err);
    const raw = safeStorage.getItem(`user_${mobileNumber}_data`);
    return raw ? JSON.parse(raw) : null;
  }
}

// Fail-safe offline sync queue helpers
export function addToOfflineSyncQueue(mobileNumber: string, payload: UserUserDataState): void {
  try {
    const rawQueue = safeStorage.getItem('offline_sync_queue');
    const queue = rawQueue ? JSON.parse(rawQueue) : [];
    const filtered = queue.filter((item: { mobileNumber: string }) => item.mobileNumber !== mobileNumber);
    filtered.push({
      mobileNumber,
      payload,
      timestamp: Date.now()
    });
    safeStorage.setItem('offline_sync_queue', JSON.stringify(filtered));
  } catch (e) {
    console.warn("Failed to add to offline sync queue", e);
  }
}

export function getOfflineSyncQueue(): Array<{ mobileNumber: string; payload: UserUserDataState; timestamp: number }> {
  try {
    const rawQueue = safeStorage.getItem('offline_sync_queue');
    return rawQueue ? JSON.parse(rawQueue) : [];
  } catch (e) {
    return [];
  }
}

export function clearOfflineSyncQueue(): void {
  try {
    safeStorage.setItem('offline_sync_queue', JSON.stringify([]));
  } catch (e) {}
}

export function removeFromOfflineSyncQueue(mobileNumber: string): void {
  try {
    const queue = getOfflineSyncQueue();
    const filtered = queue.filter(item => item.mobileNumber !== mobileNumber);
    safeStorage.setItem('offline_sync_queue', JSON.stringify(filtered));
  } catch (e) {}
}

export function saveUserIsolatedData(mobileNumber: string, data: UserUserDataState): void {
  saveUserIsolatedDataDexie(mobileNumber, data).catch(() => {});
}

export function getUserIsolatedData(mobileNumber: string): UserUserDataState | null {
  const raw = safeStorage.getItem(`user_${mobileNumber}_data`);
  return raw ? JSON.parse(raw) : null;
}
