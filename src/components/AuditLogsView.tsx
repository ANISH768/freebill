import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Search,
  Download,
  RefreshCw,
  UserCheck,
  AlertTriangle,
  FileText,
  Database,
  Clock,
} from 'lucide-react';
import { AuditLog } from '../types';
import { exportAuditLogsToCsv, fetchSystemAuditLogs } from '../utils/systemAuditLogger';

interface AuditLogsViewProps {
  userPhone?: string;
  businessName?: string;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  userPhone,
  businessName = 'BillSync Pro',
}) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'admin' | 'clerk'>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = async () => {
    setIsLoading(true);
    const items = await fetchSystemAuditLogs(userPhone);
    setLogs(items);
    setIsLoading(false);
  };

  useEffect(() => {
    loadLogs();
    const handler = () => loadLogs();
    window.addEventListener('billsync-audit-updated', handler);
    return () => window.removeEventListener('billsync-audit-updated', handler);
  }, [userPhone]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (roleFilter !== 'ALL' && log.userRole !== roleFilter) return false;
      if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDetails = (log.details || '').toLowerCase().includes(q);
        const matchAction = (log.action || '').toLowerCase().includes(q);
        const matchUser = (log.userName || log.userId || '').toLowerCase().includes(q);
        return matchDetails || matchAction || matchUser;
      }
      return true;
    });
  }, [logs, roleFilter, actionFilter, searchQuery]);

  const badgeStyle = (action: string) => {
    if (action.includes('FAILURE') || action.includes('FAILED') || action.includes('CANCELLED') || action.includes('DELETED')) {
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
    }
    if (action.includes('CREATED') || action.includes('LOGIN') || action.includes('BACKUP')) {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    }
    return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              Security & Activity Audit Trail
            </h2>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            Tamper-evident local log of every login, failed attempt, bill creation, cancellation, price update, and backup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadLogs}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => exportAuditLogsToCsv(filteredLogs, businessName)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by invoice number, mobile, action, or details..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-semibold"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'ALL' | 'admin' | 'clerk')}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-bold"
          >
            <option value="ALL">All Roles (Owner & Clerk)</option>
            <option value="admin">Owner / Admin Only</option>
            <option value="clerk">Billing Clerk Only</option>
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-bold"
          >
            <option value="ALL">All Event Types</option>
            <option value="LOGIN">Logins</option>
            <option value="FAILED_LOGIN">Failed Logins</option>
            <option value="PASSWORD_RESET">Password Resets</option>
            <option value="BILL_CREATED">Bills Created</option>
            <option value="BILL_CANCELLED">Bills Cancelled</option>
            <option value="PRICE_CHANGED">Price / Product Updates</option>
            <option value="BACKUP_EXPORTED">Backups Exported</option>
            <option value="RESTORE_DATA">Data Restores</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {filteredLogs.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-400">
              No audit log entries match the selected filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Role / Actor</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredLogs.map((log, i) => (
                  <tr
                    key={`${log.timestamp}-${i}`}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {new Date(log.timestamp).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${badgeStyle(
                          log.action
                        )}`}
                      >
                        {log.action.includes('FAILED') ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : log.action.includes('BILL') ? (
                          <FileText className="w-3 h-3" />
                        ) : log.action.includes('BACKUP') || log.action.includes('RESTORE') ? (
                          <Database className="w-3 h-3" />
                        ) : (
                          <UserCheck className="w-3 h-3" />
                        )}
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase mr-1.5 ${
                          log.userRole === 'admin'
                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {log.userRole === 'admin' ? 'Owner' : 'Clerk'}
                      </span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {log.userName || log.userId}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 max-w-md">
                      {log.details}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-[11px] font-semibold text-slate-400">
                      {log.deviceInfo || 'Local Terminal'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
