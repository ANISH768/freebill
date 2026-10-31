import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  onSnapshot, 
  collection, 
  Firestore,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { getPermanentIpForUser } from '../utils/permanentIp';

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfigJson && firebaseConfigJson.projectId && firebaseConfigJson.apiKey);
}

export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;
  
  if (getApps().length > 0) {
    appInstance = getApp();
  } else {
    appInstance = initializeApp({
      apiKey: firebaseConfigJson.apiKey,
      authDomain: firebaseConfigJson.authDomain,
      projectId: firebaseConfigJson.projectId,
      storageBucket: firebaseConfigJson.storageBucket,
      messagingSenderId: firebaseConfigJson.messagingSenderId,
      appId: firebaseConfigJson.appId
    });
  }
  return appInstance;
}

export function getFirebaseDb(): Firestore {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  try {
    if (firebaseConfigJson.firestoreDatabaseId && firebaseConfigJson.firestoreDatabaseId !== '(default)') {
      dbInstance = getFirestore(app, firebaseConfigJson.firestoreDatabaseId);
    } else {
      dbInstance = getFirestore(app);
    }
  } catch (err) {
    console.warn('[Firebase] Initializing default database fallback:', err);
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

export interface CloudSyncPayload {
  businessName?: string;
  clients: any[];
  products: any[];
  estimates: any[];
  stockLogs?: any[];
  costFallbackPct?: number;
  last_synced_millis?: number;
  updatedAt?: string;
}

/**
 * Recursively strips `undefined` properties and normalizes non-finite numbers
 * so Firestore `setDoc()` never throws "Unsupported field value: undefined".
 */
function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) {
    return null as unknown as T;
  }
  if (value === null) {
    return value;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Upload active user counter data directly to Firebase Firestore
 */
export async function pushUserSyncToFirestore(phone: string, payload: CloudSyncPayload): Promise<boolean> {
  try {
    if (!isFirebaseConfigured() || !phone) return false;
    const db = getFirebaseDb();
    const cleanPhone = String(phone).trim();
    const permInfo = getPermanentIpForUser(cleanPhone);
    const docRef = doc(db, 'sync_data', cleanPhone);

    const dataToSave = {
      phone: cleanPhone,
      permanentIp: permInfo.ipHost,
      permanentIpWithPort: permInfo.ipWithPort,
      businessName: payload.businessName || 'My Counter',
      clients: sanitizeForFirestore(Array.isArray(payload.clients) ? payload.clients : []),
      products: sanitizeForFirestore(Array.isArray(payload.products) ? payload.products : []),
      estimates: sanitizeForFirestore(Array.isArray(payload.estimates) ? payload.estimates : []),
      stockLogs: sanitizeForFirestore(Array.isArray(payload.stockLogs) ? payload.stockLogs : []),
      costFallbackPct: Number.isFinite(Number(payload.costFallbackPct)) ? Number(payload.costFallbackPct) : 80,
      last_synced_millis: Number.isFinite(Number(payload.last_synced_millis)) ? Number(payload.last_synced_millis) : Date.now(),
      updatedAt: new Date().toISOString(),
      serverTimestamp: serverTimestamp()
    };

    await setDoc(docRef, dataToSave, { merge: true });
    console.log(`[Firestore] ✓ Successfully pushed user sync data for ${cleanPhone} (Permanent IP: ${permInfo.ipWithPort})`);
    return true;
  } catch (err) {
    console.error('[Firestore] Push sync error:', err);
    return false;
  }
}

/**
 * Resolve a User ID and their synced data from Firestore using their permanent Virtual IP (e.g. "10.X.Y.Z")
 */
export async function findUserByPermanentIpFromFirestore(ipOrToken: string): Promise<(CloudSyncPayload & { phone: string; permanentIp: string }) | null> {
  try {
    if (!isFirebaseConfigured() || !ipOrToken) return null;
    const cleanTargetIp = String(ipOrToken).replace(/:\d+$/, '').trim();
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'sync_data'));
    for (const d of snap.docs) {
      const data = d.data();
      const docPhone = String(data.phone || d.id).trim();
      const computed = getPermanentIpForUser(docPhone);
      if (data.permanentIp === cleanTargetIp || computed.ipHost === cleanTargetIp || docPhone === cleanTargetIp) {
        return {
          phone: docPhone,
          permanentIp: computed.ipWithPort,
          businessName: data.businessName || 'My Counter',
          clients: Array.isArray(data.clients) ? data.clients : [],
          products: Array.isArray(data.products) ? data.products : [],
          estimates: Array.isArray(data.estimates) ? data.estimates : [],
          stockLogs: Array.isArray(data.stockLogs) ? data.stockLogs : [],
          costFallbackPct: data.costFallbackPct || 80,
          last_synced_millis: data.last_synced_millis || Date.now(),
          updatedAt: data.updatedAt || new Date().toISOString()
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('[Firestore] Permanent IP lookup warning:', err);
    return null;
  }
}

/**
 * Pull latest user counter data from Firebase Firestore
 */
export async function fetchUserSyncFromFirestore(phone: string): Promise<CloudSyncPayload | null> {
  try {
    if (!isFirebaseConfigured() || !phone) return null;
    const db = getFirebaseDb();
    const cleanPhone = String(phone).trim();
    const docRef = doc(db, 'sync_data', cleanPhone);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      return {
        businessName: data.businessName || '',
        clients: Array.isArray(data.clients) ? data.clients : [],
        products: Array.isArray(data.products) ? data.products : [],
        estimates: Array.isArray(data.estimates) ? data.estimates : [],
        stockLogs: Array.isArray(data.stockLogs) ? data.stockLogs : [],
        costFallbackPct: data.costFallbackPct || 80,
        last_synced_millis: data.last_synced_millis || 0,
        updatedAt: data.updatedAt || new Date().toISOString()
      };
    }
    return null;
  } catch (err) {
    console.error('[Firestore] Pull sync error:', err);
    return null;
  }
}

/**
 * Listen for real-time changes in Firestore sync document
 */
export function subscribeToUserFirestoreSync(
  phone: string, 
  onData: (data: CloudSyncPayload) => void,
  onError?: (err: any) => void
): () => void {
  try {
    if (!isFirebaseConfigured() || !phone) return () => {};
    const db = getFirebaseDb();
    const cleanPhone = String(phone).trim();
    const docRef = doc(db, 'sync_data', cleanPhone);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          onData({
            businessName: data.businessName || '',
            clients: Array.isArray(data.clients) ? data.clients : [],
            products: Array.isArray(data.products) ? data.products : [],
            estimates: Array.isArray(data.estimates) ? data.estimates : [],
            stockLogs: Array.isArray(data.stockLogs) ? data.stockLogs : [],
            costFallbackPct: data.costFallbackPct || 80,
            last_synced_millis: data.last_synced_millis || 0,
            updatedAt: data.updatedAt || new Date().toISOString()
          });
        }
      },
      (error) => {
        console.warn('[Firestore] Realtime subscription warning:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('[Firestore] Subscribe init failed:', err);
    return () => {};
  }
}

/**
 * Record sanitized OTP attempt in Firestore hidden 'audit_logs' collection
 * Never includes sensitive raw OTP codes.
 */
export async function pushAuditLogToFirestore(entry: {
  logId: string;
  timestamp: string;
  status: 'success' | 'failure';
  attemptType: string;
  channel: string;
  maskedPhone: string;
  provider: string;
  diagnosticCode: string;
  reason: string;
}): Promise<boolean> {
  try {
    if (!isFirebaseConfigured()) return false;
    const db = getFirebaseDb();
    const docRef = doc(db, 'audit_logs', entry.logId);
    await setDoc(docRef, {
      ...sanitizeForFirestore(entry),
      serverTimestamp: serverTimestamp()
    });
    return true;
  } catch (err) {
    console.warn('[Firestore] Audit log record warning:', err);
    return false;
  }
}

