import { and, desc, eq } from 'drizzle-orm';
import { sqlDb } from './postgres.ts';
import { clients, estimates, products, stockLogs, users } from './schema.ts';
import type { Client, Estimate, Product, SecondaryPrintStyle, StockLog } from '../types.ts';

function toSafeNumber(val: unknown, fallback = 0): number {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function toNumericId(externalId: string, fallback: number): number {
  const parsed = Number(externalId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  businessName?: string
) {
  try {
    const now = new Date();
    const result = await sqlDb
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || null,
        businessName: businessName || null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
          ...(businessName ? { businessName } : {}),
          updatedAt: now,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function getUserBillingSnapshot(uid: string) {
  try {
    const [userRows, clientRows, productRows, estimateRows, logRows] = await Promise.all([
      sqlDb.select().from(users).where(eq(users.uid, uid)).limit(1),
      sqlDb.select().from(clients).where(eq(clients.userUid, uid)).orderBy(desc(clients.id)),
      sqlDb.select().from(products).where(eq(products.userUid, uid)).orderBy(desc(products.id)),
      sqlDb.select().from(estimates).where(eq(estimates.userUid, uid)).orderBy(desc(estimates.id)),
      sqlDb.select().from(stockLogs).where(eq(stockLogs.userUid, uid)).orderBy(desc(stockLogs.id)),
    ]);

    const mappedClients: Client[] = clientRows.map((row) => ({
      id: toNumericId(row.externalId, row.id),
      name: row.name,
      phone: row.phone,
      gstin: row.gstin,
      address: row.address,
      stateCode: row.stateCode || undefined,
      openingBalance: toSafeNumber(row.openingBalance, 0),
      payments: Array.isArray(row.payments) ? row.payments : [],
    }));

    const mappedProducts: Product[] = productRows.map((row) => ({
      id: toNumericId(row.externalId, row.id),
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      stock: toSafeNumber(row.stock, 0),
      mrp: toSafeNumber(row.mrp, 0),
      price: toSafeNumber(row.price, 0),
      purchasePrice: toSafeNumber(row.purchasePrice, 0),
      discount: toSafeNumber(row.discount, 0),
      minStock: toSafeNumber(row.minStock, 5),
      gstRate: toSafeNumber(row.gstRate, 0),
      hsn: row.hsn || undefined,
      batchNumber: row.batchNumber || undefined,
      mfgDate: row.mfgDate || undefined,
      expiryDate: row.expiryDate || undefined,
      warehouse: row.warehouse || undefined,
      barcode: row.barcode || undefined,
    }));

    const mappedEstimates: Estimate[] = estimateRows.map((row) => ({
      id: toNumericId(row.externalId, row.id),
      serial: row.serial,
      date: row.date,
      dueDate: row.dueDate,
      clientId: toNumericId(row.clientExternalId, 0),
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      clientAddr: row.clientAddr,
      clientGstin: row.clientGstin || undefined,
      deliveryNote: row.deliveryNote,
      terms: row.terms,
      subtotal: toSafeNumber(row.subtotal, 0),
      taxPct: toSafeNumber(row.taxPct, 0),
      taxAmt: toSafeNumber(row.taxAmt, 0),
      cgstTotal: toSafeNumber(row.cgstTotal, 0),
      sgstTotal: toSafeNumber(row.sgstTotal, 0),
      igstTotal: toSafeNumber(row.igstTotal, 0),
      isInterState: Boolean(row.isInterState),
      cashDiscount: toSafeNumber(row.cashDiscount, 0),
      flatFinalDiscount: toSafeNumber(row.flatFinalDiscount, 0),
      grandTotal: toSafeNumber(row.grandTotal, 0),
      paidAmount: toSafeNumber(row.paidAmount, 0),
      balanceDue: toSafeNumber(row.balanceDue, 0),
      status: (row.status as Estimate['status']) || 'PENDING',
      items: Array.isArray(row.items) ? row.items : [],
      splitPayments: row.splitPayments || undefined,
      splitCash: row.splitPayments?.cash,
      splitUpi: row.splitPayments?.upi,
      splitBank: row.splitPayments?.bank,
      splitCredit: row.splitPayments?.credit,
      includePaymentQR: Boolean(row.includePaymentQR),
      paymentMode: row.paymentMode || undefined,
      isCancelled: Boolean(row.isCancelled),
      voidedBy: row.voidedBy || undefined,
      voidReason: row.voidReason || undefined,
      signature: row.signature || undefined,
      invoiceTheme: (row.invoiceTheme as SecondaryPrintStyle) || undefined,
      isGstInvoice: Boolean(row.isGstInvoice),
    }));

    const mappedStockLogs: StockLog[] = logRows.map((row) => ({
      id: toNumericId(row.externalId, row.id),
      productId: toNumericId(row.productExternalId, 0),
      productName: row.productName,
      sku: row.sku,
      type: (row.type as StockLog['type']) || 'ADJUSTMENT',
      qty: toSafeNumber(row.qty, 0),
      prevStock: toSafeNumber(row.prevStock, 0),
      newStock: toSafeNumber(row.newStock, 0),
      date: row.date,
      reference: row.reference,
      price: toSafeNumber(row.price, 0),
      warehouse: row.warehouse || undefined,
    }));

    return {
      businessName: userRows[0]?.businessName || undefined,
      clients: mappedClients,
      products: mappedProducts,
      estimates: mappedEstimates,
      stockLogs: mappedStockLogs,
    };
  } catch (error) {
    console.error('Database query failed in getUserBillingSnapshot:', error);
    throw new Error('Failed to load saved data. Please try again later.', { cause: error });
  }
}

export async function syncBulkUserBillingData(
  uid: string,
  payload: {
    businessName?: string;
    clients?: Client[];
    products?: Product[];
    estimates?: Estimate[];
    stockLogs?: StockLog[];
  }
) {
  try {
    const now = new Date();
    const clientList = Array.isArray(payload.clients) ? payload.clients : [];
    const productList = Array.isArray(payload.products) ? payload.products : [];
    const estimateList = Array.isArray(payload.estimates) ? payload.estimates : [];
    const stockLogList = Array.isArray(payload.stockLogs) ? payload.stockLogs : [];

    await sqlDb.transaction(async (tx) => {
      if (payload.businessName) {
        await tx
          .update(users)
          .set({ businessName: payload.businessName, updatedAt: now })
          .where(eq(users.uid, uid));
      }

      for (const c of clientList) {
        if (!c || !c.name) continue;
        const externalId = String(c.id || `${c.name}_${c.phone || ''}`).trim();
        await tx
          .insert(clients)
          .values({
            userUid: uid,
            externalId,
            name: String(c.name).trim(),
            phone: String(c.phone || '').trim(),
            gstin: String(c.gstin || '').trim(),
            address: String(c.address || '').trim(),
            stateCode: c.stateCode || null,
            openingBalance: toSafeNumber(c.openingBalance, 0),
            payments: Array.isArray(c.payments) ? c.payments : [],
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [clients.userUid, clients.externalId],
            set: {
              name: String(c.name).trim(),
              phone: String(c.phone || '').trim(),
              gstin: String(c.gstin || '').trim(),
              address: String(c.address || '').trim(),
              stateCode: c.stateCode || null,
              openingBalance: toSafeNumber(c.openingBalance, 0),
              payments: Array.isArray(c.payments) ? c.payments : [],
              updatedAt: now,
            },
          });
      }

      for (const p of productList) {
        if (!p || !p.name) continue;
        const externalId = String(p.id || p.sku || p.name).trim();
        await tx
          .insert(products)
          .values({
            userUid: uid,
            externalId,
            sku: String(p.sku || '').trim(),
            name: String(p.name).trim(),
            unit: String(p.unit || 'Pcs').trim(),
            stock: toSafeNumber(p.stock, 0),
            mrp: toSafeNumber(p.mrp, 0),
            price: toSafeNumber(p.price, 0),
            purchasePrice: toSafeNumber(p.purchasePrice, 0),
            discount: toSafeNumber(p.discount, 0),
            minStock: toSafeNumber(p.minStock, 5),
            gstRate: toSafeNumber(p.gstRate, 0),
            hsn: p.hsn || null,
            batchNumber: p.batchNumber || null,
            mfgDate: p.mfgDate || null,
            expiryDate: p.expiryDate || null,
            warehouse: p.warehouse || null,
            barcode: p.barcode || null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [products.userUid, products.externalId],
            set: {
              sku: String(p.sku || '').trim(),
              name: String(p.name).trim(),
              unit: String(p.unit || 'Pcs').trim(),
              stock: toSafeNumber(p.stock, 0),
              mrp: toSafeNumber(p.mrp, 0),
              price: toSafeNumber(p.price, 0),
              purchasePrice: toSafeNumber(p.purchasePrice, 0),
              discount: toSafeNumber(p.discount, 0),
              minStock: toSafeNumber(p.minStock, 5),
              gstRate: toSafeNumber(p.gstRate, 0),
              hsn: p.hsn || null,
              batchNumber: p.batchNumber || null,
              mfgDate: p.mfgDate || null,
              expiryDate: p.expiryDate || null,
              warehouse: p.warehouse || null,
              barcode: p.barcode || null,
              updatedAt: now,
            },
          });
      }

      for (const e of estimateList) {
        if (!e || !e.serial) continue;
        const externalId = String(e.id || e.serial).trim();
        const splitObj = e.splitPayments || (
          e.splitCash !== undefined || e.splitUpi !== undefined || e.splitBank !== undefined || e.splitCredit !== undefined
            ? {
                cash: toSafeNumber(e.splitCash, 0),
                upi: toSafeNumber(e.splitUpi, 0),
                bank: toSafeNumber(e.splitBank, 0),
                credit: toSafeNumber(e.splitCredit, 0),
              }
            : null
        );

        await tx
          .insert(estimates)
          .values({
            userUid: uid,
            externalId,
            serial: String(e.serial).trim(),
            date: String(e.date || '').trim(),
            dueDate: String(e.dueDate || '').trim(),
            clientExternalId: String(e.clientId || '').trim(),
            clientName: String(e.clientName || '').trim(),
            clientPhone: String(e.clientPhone || '').trim(),
            clientAddr: String(e.clientAddr || '').trim(),
            clientGstin: e.clientGstin || null,
            deliveryNote: String(e.deliveryNote || ''),
            terms: String(e.terms || ''),
            subtotal: toSafeNumber(e.subtotal, 0),
            taxPct: toSafeNumber(e.taxPct, 0),
            taxAmt: toSafeNumber(e.taxAmt, 0),
            cgstTotal: toSafeNumber(e.cgstTotal, 0),
            sgstTotal: toSafeNumber(e.sgstTotal, 0),
            igstTotal: toSafeNumber(e.igstTotal, 0),
            isInterState: Boolean(e.isInterState),
            cashDiscount: toSafeNumber(e.cashDiscount, 0),
            flatFinalDiscount: toSafeNumber(e.flatFinalDiscount, 0),
            grandTotal: toSafeNumber(e.grandTotal, 0),
            paidAmount: toSafeNumber(e.paidAmount, 0),
            balanceDue: toSafeNumber(e.balanceDue, 0),
            status: String(e.status || 'PENDING'),
            items: Array.isArray(e.items) ? e.items : [],
            splitPayments: splitObj,
            includePaymentQR: Boolean(e.includePaymentQR),
            paymentMode: e.paymentMode || null,
            isCancelled: Boolean(e.isCancelled),
            voidedBy: e.voidedBy || null,
            voidReason: e.voidReason || null,
            signature: e.signature || null,
            invoiceTheme: e.invoiceTheme || null,
            isGstInvoice: Boolean(e.isGstInvoice),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [estimates.userUid, estimates.externalId],
            set: {
              serial: String(e.serial).trim(),
              date: String(e.date || '').trim(),
              dueDate: String(e.dueDate || '').trim(),
              clientExternalId: String(e.clientId || '').trim(),
              clientName: String(e.clientName || '').trim(),
              clientPhone: String(e.clientPhone || '').trim(),
              clientAddr: String(e.clientAddr || '').trim(),
              clientGstin: e.clientGstin || null,
              deliveryNote: String(e.deliveryNote || ''),
              terms: String(e.terms || ''),
              subtotal: toSafeNumber(e.subtotal, 0),
              taxPct: toSafeNumber(e.taxPct, 0),
              taxAmt: toSafeNumber(e.taxAmt, 0),
              cgstTotal: toSafeNumber(e.cgstTotal, 0),
              sgstTotal: toSafeNumber(e.sgstTotal, 0),
              igstTotal: toSafeNumber(e.igstTotal, 0),
              isInterState: Boolean(e.isInterState),
              cashDiscount: toSafeNumber(e.cashDiscount, 0),
              flatFinalDiscount: toSafeNumber(e.flatFinalDiscount, 0),
              grandTotal: toSafeNumber(e.grandTotal, 0),
              paidAmount: toSafeNumber(e.paidAmount, 0),
              balanceDue: toSafeNumber(e.balanceDue, 0),
              status: String(e.status || 'PENDING'),
              items: Array.isArray(e.items) ? e.items : [],
              splitPayments: splitObj,
              includePaymentQR: Boolean(e.includePaymentQR),
              paymentMode: e.paymentMode || null,
              isCancelled: Boolean(e.isCancelled),
              voidedBy: e.voidedBy || null,
              voidReason: e.voidReason || null,
              signature: e.signature || null,
              invoiceTheme: e.invoiceTheme || null,
              isGstInvoice: Boolean(e.isGstInvoice),
              updatedAt: now,
            },
          });
      }

      // Limit stock logs to latest 500 entries per bulk sync to keep transactions snappy
      for (const log of stockLogList.slice(0, 500)) {
        if (!log || !log.productName) continue;
        const externalId = String(log.id || `${log.productId}_${log.date}_${log.reference}`).trim();
        await tx
          .insert(stockLogs)
          .values({
            userUid: uid,
            externalId,
            productExternalId: String(log.productId || '').trim(),
            productName: String(log.productName).trim(),
            sku: String(log.sku || '').trim(),
            type: String(log.type || 'ADJUSTMENT'),
            qty: toSafeNumber(log.qty, 0),
            prevStock: toSafeNumber(log.prevStock, 0),
            newStock: toSafeNumber(log.newStock, 0),
            date: String(log.date || '').trim(),
            reference: String(log.reference || ''),
            price: toSafeNumber(log.price, 0),
            warehouse: log.warehouse || null,
          })
          .onConflictDoUpdate({
            target: [stockLogs.userUid, stockLogs.externalId],
            set: {
              productName: String(log.productName).trim(),
              qty: toSafeNumber(log.qty, 0),
              prevStock: toSafeNumber(log.prevStock, 0),
              newStock: toSafeNumber(log.newStock, 0),
              reference: String(log.reference || ''),
              price: toSafeNumber(log.price, 0),
            },
          });
      }
    });

    return {
      syncedClients: clientList.length,
      syncedProducts: productList.length,
      syncedEstimates: estimateList.length,
      syncedStockLogs: Math.min(stockLogList.length, 500),
      updatedAt: now.toISOString(),
    };
  } catch (error) {
    console.error('Database query failed in syncBulkUserBillingData:', error);
    throw new Error('Failed to sync billing data. Please try again later.', { cause: error });
  }
}

export async function deleteEntityByExternalId(
  uid: string,
  entity: 'client' | 'product' | 'estimate',
  externalId: string
) {
  try {
    const cleanId = String(externalId).trim();
    if (!cleanId) return;

    if (entity === 'client') {
      await sqlDb
        .delete(clients)
        .where(and(eq(clients.userUid, uid), eq(clients.externalId, cleanId)));
    } else if (entity === 'product') {
      await sqlDb
        .delete(products)
        .where(and(eq(products.userUid, uid), eq(products.externalId, cleanId)));
    } else if (entity === 'estimate') {
      await sqlDb
        .delete(estimates)
        .where(and(eq(estimates.userUid, uid), eq(estimates.externalId, cleanId)));
    }
  } catch (error) {
    console.error(`Database delete failed for ${entity}:`, error);
    throw new Error('Failed to delete record. Please try again later.', { cause: error });
  }
}
