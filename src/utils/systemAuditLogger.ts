import { db } from '../db';
import { AuditLog, SystemAuditAction } from '../types';

const LOCAL_AUDIT_KEY = 'pos_system_audit_logs_v2';

function getDeviceSummary(): string {
  if (typeof navigator === 'undefined') return 'Local Device';
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const platform = isMobile ? 'Mobile POS' : 'Desktop Terminal';
  const onlineState = navigator.onLine ? 'Online' : 'Offline';
  return `${platform} (${onlineState})`;
}

export async function recordSystemAudit(params: {
  action: SystemAuditAction;
  details: string;
  userId?: string;
  userName?: string;
  userRole?: 'admin' | 'clerk';
  userPhone?: string;
}): Promise<AuditLog> {
  const activePhone =
    params.userPhone ||
    localStorage.getItem('active_user_phone') ||
    'local';
  const activeRole =
    params.userRole ||
    ((localStorage.getItem('pos_role') as 'admin' | 'clerk') || 'admin');
  const activeBiz =
    params.userName ||
    localStorage.getItem('active_business_name') ||
    (activeRole === 'admin' ? 'Owner / Admin' : 'Billing Clerk');

  const entry: AuditLog = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    userId: params.userId || activePhone,
    userName: activeBiz,
    userRole: activeRole,
    action: params.action,
    details: params.details,
    deviceInfo: getDeviceSummary(),
    userPhone: activePhone,
  };

  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    const list: AuditLog[] = raw ? JSON.parse(raw) : [];
    const updated = [entry, ...list].slice(0, 600);
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }

  try {
    await db.auditLogs.add(entry);
  } catch {
    // Ignore IndexedDB error if closed
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('billsync-audit-updated'));
  }

  return entry;
}

export async function fetchSystemAuditLogs(userPhone?: string): Promise<AuditLog[]> {
  const merged = new Map<string, AuditLog>();

  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    if (raw) {
      const localList: AuditLog[] = JSON.parse(raw);
      localList.forEach((item) => {
        if (!userPhone || !item.userPhone || item.userPhone === userPhone || item.userPhone === 'local') {
          merged.set(`${item.timestamp}_${item.action}_${item.details}`, item);
        }
      });
    }
  } catch {
    // Ignore parse error
  }

  try {
    const dbLogs = await db.auditLogs.toArray();
    dbLogs.forEach((item) => {
      if (!userPhone || !item.userPhone || item.userPhone === userPhone || item.userPhone === 'local') {
        merged.set(`${item.timestamp}_${item.action}_${item.details}`, item);
      }
    });
  } catch {
    // Ignore IndexedDB read errors
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function exportAuditLogsToCsv(logs: AuditLog[], businessName = 'BillSync_Pro'): void {
  const headers = ['Timestamp', 'Date & Time', 'Action', 'Role', 'User / Account', 'Device', 'Details'];
  const rows = logs.map((log) => [
    log.timestamp,
    new Date(log.timestamp).toLocaleString('en-IN'),
    log.action,
    log.userRole.toUpperCase(),
    log.userName || log.userId,
    log.deviceInfo || 'Local Terminal',
    `"${(log.details || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${businessName.replace(/\s+/g, '_')}_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
