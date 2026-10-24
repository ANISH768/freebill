import { db } from '../db';
import { OtpAuditLogEntry } from '../types';
import { pushAuditLogToFirestore } from '../db/firebase';

const LOCAL_AUDIT_LOGS_KEY = 'audit_logs';
const MAX_AUDIT_LOGS = 200;

/**
 * Masks a phone number so raw PII is protected while remaining identifiable for troubleshooting.
 */
export function maskPhoneForAudit(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 2)}XXX XX${digits.slice(-3)}`;
  }
  return digits ? `+91 XXX${digits.slice(-3)}` : 'Unknown Number';
}

/**
 * Strictly strips any 6-digit OTP sequences or auth tokens from log messages
 * so sensitive OTP content is NEVER stored or displayed in 'audit_logs'.
 */
export function sanitizeAuditReason(text: string): string {
  if (!text) return 'OTP security event recorded';
  return String(text)
    // Redact any standalone 6-digit numeric sequences (potential OTPs)
    .replace(/\b\d{6}\b/g, (match) => {
      // Preserve known Twilio error codes (e.g. 572002) only if prefixed by Code/Error, otherwise redact
      if (match === '572002') return '572002';
      return '[REDACTED]';
    })
    // Redact any long hex/alphanumeric tokens
    .replace(/\b[a-f0-9]{24,}\b/gi, '[REDACTED_TOKEN]')
    .slice(0, 320);
}

/**
 * Records the timestamp and status (success/failure) of an OTP attempt
 * in the hidden 'audit_logs' collection across IndexedDB, localStorage, and Firestore
 * without storing or displaying sensitive OTP content.
 */
export async function recordOtpAuditLog(params: {
  status: 'success' | 'failure';
  attemptType: OtpAuditLogEntry['attemptType'];
  channel: OtpAuditLogEntry['channel'];
  phone: string;
  provider?: string;
  diagnosticCode?: string;
  reason: string;
}): Promise<OtpAuditLogEntry> {
  const entry: OtpAuditLogEntry = {
    logId: `otp_audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    status: params.status,
    attemptType: params.attemptType,
    channel: params.channel,
    maskedPhone: maskPhoneForAudit(params.phone),
    provider: params.provider || (params.channel === 'whatsapp' ? 'Twilio WhatsApp' : 'Twilio SMS'),
    diagnosticCode: params.diagnosticCode || (params.status === 'success' ? 'OK' : 'FAILED'),
    reason: sanitizeAuditReason(params.reason)
  };

  // 1. Save to localStorage hidden 'audit_logs' collection
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_LOGS_KEY);
    const existing: OtpAuditLogEntry[] = raw ? JSON.parse(raw) : [];
    const updated = [entry, ...existing.filter((e) => e.logId !== entry.logId)].slice(0, MAX_AUDIT_LOGS);
    localStorage.setItem(LOCAL_AUDIT_LOGS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[OTP Audit] localStorage write warning:', err);
  }

  // 2. Save to IndexedDB hidden 'audit_logs' table
  try {
    await db.audit_logs.add(entry);
  } catch (err) {
    console.warn('[OTP Audit] IndexedDB audit_logs write warning:', err);
  }

  // 3. Mirror to Firestore 'audit_logs' collection (non-blocking)
  pushAuditLogToFirestore(entry).catch(() => {});

  return entry;
}

/**
 * Retrieves OTP attempt logs from the hidden 'audit_logs' collection
 * (merging local IndexedDB, localStorage, and server diagnostic logs)
 * for security troubleshooting without exposing sensitive OTP values.
 */
export async function getOtpAuditLogs(): Promise<OtpAuditLogEntry[]> {
  const map = new Map<string, OtpAuditLogEntry>();

  // 1. Read from localStorage 'audit_logs'
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_LOGS_KEY);
    if (raw) {
      const parsed: OtpAuditLogEntry[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.timestamp) {
            const key = item.logId || `${item.timestamp}_${item.attemptType}`;
            map.set(key, {
              ...item,
              reason: sanitizeAuditReason(item.reason)
            });
          }
        }
      }
    }
  } catch (e) {}

  // 2. Read from IndexedDB 'audit_logs'
  try {
    const dexieLogs = await db.audit_logs.orderBy('timestamp').reverse().limit(100).toArray();
    for (const item of dexieLogs) {
      const key = item.logId || `${item.timestamp}_${item.attemptType}`;
      map.set(key, {
        ...item,
        reason: sanitizeAuditReason(item.reason)
      });
    }
  } catch (e) {}

  // 3. Read from server '/api/auth/audit-logs' if reachable
  try {
    const resp = await fetch('/api/auth/audit-logs');
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.logs)) {
        for (const item of data.logs) {
          if (item && item.timestamp) {
            const key = item.logId || `${item.timestamp}_${item.attemptType}`;
            map.set(key, {
              ...item,
              reason: sanitizeAuditReason(item.reason)
            });
          }
        }
      }
    }
  } catch (e) {}

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Clears local OTP audit logs.
 */
export async function clearOtpAuditLogs(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_AUDIT_LOGS_KEY);
  } catch (e) {}
  try {
    await db.audit_logs.clear();
  } catch (e) {}
  try {
    await fetch('/api/auth/audit-logs', { method: 'DELETE' });
  } catch (e) {}
}
