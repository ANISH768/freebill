import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { InvoiceItem, PaymentRecord, SplitPayments } from '../types.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  businessName: text('business_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const clients = pgTable(
  'clients',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    gstin: text('gstin').notNull().default(''),
    address: text('address').notNull().default(''),
    stateCode: text('state_code'),
    openingBalance: doublePrecision('opening_balance').notNull().default(0),
    payments: jsonb('payments').$type<PaymentRecord[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('clients_user_uid_external_id_idx').on(table.userUid, table.externalId),
  ]
);

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    externalId: text('external_id').notNull(),
    sku: text('sku').notNull().default(''),
    name: text('name').notNull(),
    unit: text('unit').notNull().default('Pcs'),
    stock: doublePrecision('stock').notNull().default(0),
    mrp: doublePrecision('mrp').notNull().default(0),
    price: doublePrecision('price').notNull().default(0),
    purchasePrice: doublePrecision('purchase_price').notNull().default(0),
    discount: doublePrecision('discount').notNull().default(0),
    minStock: doublePrecision('min_stock').notNull().default(5),
    gstRate: doublePrecision('gst_rate').notNull().default(0),
    hsn: text('hsn'),
    batchNumber: text('batch_number'),
    mfgDate: text('mfg_date'),
    expiryDate: text('expiry_date'),
    warehouse: text('warehouse'),
    barcode: text('barcode'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('products_user_uid_external_id_idx').on(table.userUid, table.externalId),
  ]
);

export const estimates = pgTable(
  'estimates',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    externalId: text('external_id').notNull(),
    serial: text('serial').notNull(),
    date: text('date').notNull(),
    dueDate: text('due_date').notNull().default(''),
    clientExternalId: text('client_external_id').notNull().default(''),
    clientName: text('client_name').notNull().default(''),
    clientPhone: text('client_phone').notNull().default(''),
    clientAddr: text('client_addr').notNull().default(''),
    clientGstin: text('client_gstin'),
    deliveryNote: text('delivery_note').notNull().default(''),
    terms: text('terms').notNull().default(''),
    subtotal: doublePrecision('subtotal').notNull().default(0),
    taxPct: doublePrecision('tax_pct').notNull().default(0),
    taxAmt: doublePrecision('tax_amt').notNull().default(0),
    cgstTotal: doublePrecision('cgst_total').notNull().default(0),
    sgstTotal: doublePrecision('sgst_total').notNull().default(0),
    igstTotal: doublePrecision('igst_total').notNull().default(0),
    isInterState: boolean('is_inter_state').notNull().default(false),
    cashDiscount: doublePrecision('cash_discount').notNull().default(0),
    flatFinalDiscount: doublePrecision('flat_final_discount').notNull().default(0),
    grandTotal: doublePrecision('grand_total').notNull().default(0),
    paidAmount: doublePrecision('paid_amount').notNull().default(0),
    balanceDue: doublePrecision('balance_due').notNull().default(0),
    status: text('status').notNull().default('PENDING'),
    items: jsonb('items').$type<InvoiceItem[]>().notNull().default([]),
    splitPayments: jsonb('split_payments').$type<SplitPayments | null>(),
    includePaymentQR: boolean('include_payment_qr').notNull().default(false),
    paymentMode: text('payment_mode'),
    isCancelled: boolean('is_cancelled').notNull().default(false),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    signature: text('signature'),
    invoiceTheme: text('invoice_theme'),
    isGstInvoice: boolean('is_gst_invoice').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('estimates_user_uid_external_id_idx').on(table.userUid, table.externalId),
  ]
);

export const stockLogs = pgTable(
  'stock_logs',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    externalId: text('external_id').notNull(),
    productExternalId: text('product_external_id').notNull().default(''),
    productName: text('product_name').notNull(),
    sku: text('sku').notNull().default(''),
    type: text('type').notNull(),
    qty: doublePrecision('qty').notNull().default(0),
    prevStock: doublePrecision('prev_stock').notNull().default(0),
    newStock: doublePrecision('new_stock').notNull().default(0),
    date: text('date').notNull(),
    reference: text('reference').notNull().default(''),
    price: doublePrecision('price').notNull().default(0),
    warehouse: text('warehouse'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('stock_logs_user_uid_external_id_idx').on(table.userUid, table.externalId),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  clients: many(clients),
  products: many(products),
  estimates: many(estimates),
  stockLogs: many(stockLogs),
}));

export const clientsRelations = relations(clients, ({ one }) => ({
  owner: one(users, {
    fields: [clients.userUid],
    references: [users.uid],
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  owner: one(users, {
    fields: [products.userUid],
    references: [users.uid],
  }),
}));

export const estimatesRelations = relations(estimates, ({ one }) => ({
  owner: one(users, {
    fields: [estimates.userUid],
    references: [users.uid],
  }),
}));

export const stockLogsRelations = relations(stockLogs, ({ one }) => ({
  owner: one(users, {
    fields: [stockLogs.userUid],
    references: [users.uid],
  }),
}));
