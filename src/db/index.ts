import Dexie, { type Table } from 'dexie';
import { Client, Product, Estimate, StockLog, User, AuditLog, OtpAuditLogEntry } from '../types';

export class BillingDatabase extends Dexie {
  clients!: Table<Client, number>;
  products!: Table<Product, number>;
  estimates!: Table<Estimate, number>;
  stockLogs!: Table<StockLog, number>;
  users!: Table<User, string>;
  auditLogs!: Table<AuditLog, number>;
  audit_logs!: Table<OtpAuditLogEntry, number>;

  constructor() {
    super('OfflineBillingDB');
    this.version(1).stores({
      clients: '++id, phone, name, gstin, userPhone',
      products: '++id, sku, name, minStock, warehouse, barcode, userPhone',
      estimates: '++id, serial, clientId, date, status, userPhone',
      stockLogs: '++id, productId, date, type, userPhone',
      users: '&phone, businessName',
      auditLogs: '++id, timestamp, userId, action, userPhone'
    });
    this.version(2).stores({
      clients: '++id, phone, name, gstin, userPhone',
      products: '++id, sku, name, minStock, warehouse, barcode, userPhone',
      estimates: '++id, serial, clientId, date, status, userPhone',
      stockLogs: '++id, productId, date, type, userPhone',
      users: '&phone, businessName',
      auditLogs: '++id, timestamp, userId, action, userPhone',
      audit_logs: '++id, logId, timestamp, status, attemptType, channel, maskedPhone'
    });
  }
}

export const db = new BillingDatabase();
