import { useState, useEffect, useCallback } from 'react';
import { Client, Product, Estimate, StockLog, AuditLog, UserUserDataState } from '../types';
import { saveUserIsolatedDataDexie, getUserIsolatedDataDexie } from '../utils/storage';
import { DEFAULT_CLIENTS, DEFAULT_PRODUCTS, DEFAULT_ESTIMATES, DEFAULT_STOCK_LOGS, DEFAULT_AUDIT_LOGS, DEMO_USER_PHONE } from '../utils/demoData';

import { generateInvoiceSignature } from '../utils/crypto';

export function useBillingData(currentUserPhone: string) {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [costFallbackPct, setCostFallbackPct] = useState<number>(80);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Load user isolated data from Dexie IndexedDB
  const loadUserData = useCallback(async (phone: string) => {
    setIsLoaded(false);
    const data = await getUserIsolatedDataDexie(phone);

    if (data) {
      setClients(data.clients || []);
      setProducts(data.products || []);
      setEstimates(data.estimates || []);
      setStockLogs(data.stockLogs || []);
      setAuditLogs(data.auditLogs || []);
      setCostFallbackPct(data.costFallbackPct ?? 80);
    } else if (phone === DEMO_USER_PHONE) {
      setClients(DEFAULT_CLIENTS);
      setProducts(DEFAULT_PRODUCTS);
      setEstimates(DEFAULT_ESTIMATES);
      setStockLogs(DEFAULT_STOCK_LOGS);
      setAuditLogs(DEFAULT_AUDIT_LOGS);
      setCostFallbackPct(80);
    } else {
      setClients([]);
      setProducts([]);
      setEstimates([]);
      setStockLogs([]);
      setAuditLogs([]);
      setCostFallbackPct(80);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    loadUserData(currentUserPhone);
  }, [currentUserPhone, loadUserData]);

  // Persist changes to Dexie IndexedDB whenever data updates
  useEffect(() => {
    if (!isLoaded || !currentUserPhone) return;

    const stateToSave: UserUserDataState = {
      clients,
      products,
      estimates,
      stockLogs,
      auditLogs,
      costFallbackPct
    };

    saveUserIsolatedDataDexie(currentUserPhone, stateToSave).catch(err => {
      console.error("Dexie background save error:", err);
    });
  }, [clients, products, estimates, stockLogs, auditLogs, costFallbackPct, currentUserPhone, isLoaded]);

  // --- Audit Log Recorder Helper ---
  const recordAuditLog = useCallback((
    userRole: 'admin' | 'clerk',
    action: AuditLog['action'],
    details: string
  ) => {
    const newEntry: AuditLog = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      userId: currentUserPhone,
      userName: userRole === 'admin' ? 'Admin / Owner' : 'Clerk / Staff',
      userRole,
      action,
      details,
      userPhone: currentUserPhone
    };
    setAuditLogs(prev => [newEntry, ...prev.slice(0, 499)]); // Keep last 500 logs
  }, [currentUserPhone]);

  // --- Client CRUD ---
  const addClient = (client: Omit<Client, 'id'>) => {
    const newId = clients.length > 0 ? Math.max(...clients.map(c => c.id)) + 1 : 1;
    const newClient: Client = { ...client, id: newId, userPhone: currentUserPhone };
    setClients(prev => [...prev, newClient]);
    return newClient;
  };

  const updateClient = (client: Client) => {
    setClients(prev => prev.map(c => c.id === client.id ? client : c));
  };

  const deleteClient = (id: number) => {
    setClients(prev => prev.filter(c => c.id !== id));
  };

  // --- Product CRUD ---
  const addProduct = (product: Omit<Product, 'id'>) => {
    const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
    const newProd: Product = { ...product, id: newId, userPhone: currentUserPhone };
    setProducts(prev => [...prev, newProd]);
    
    // Add stock log
    const newLog: StockLog = {
      id: Date.now(),
      productId: newId,
      productName: newProd.name,
      sku: newProd.sku,
      type: 'INITIAL',
      qty: newProd.stock,
      prevStock: 0,
      newStock: newProd.stock,
      date: new Date().toISOString().split('T')[0],
      reference: 'New Product Opening Stock',
      price: newProd.purchasePrice || newProd.price,
      warehouse: newProd.warehouse || 'Main Godown',
      userPhone: currentUserPhone
    };
    setStockLogs(prev => [newLog, ...prev]);

    return newProd;
  };

  const updateProduct = (product: Product) => {
    setProducts(prev => prev.map(p => p.id === product.id ? product : p));
  };

  const deleteProduct = (id: number) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  // Stock log entry helper
  const addStockLog = (log: Omit<StockLog, 'id'>) => {
    const newLog: StockLog = {
      ...log,
      id: Date.now() + Math.floor(Math.random() * 1000),
      userPhone: currentUserPhone
    };
    setStockLogs(prev => [newLog, ...prev]);
  };

  // --- Estimate (Invoice) CRUD ---
  const saveEstimate = async (estimate: Estimate, isEditing: boolean) => {
    // Generate HMAC signature for bill integrity
    const sig = await generateInvoiceSignature(estimate.serial, estimate.date, estimate.grandTotal, estimate.clientId);
    const estWithSig: Estimate = { ...estimate, signature: sig };

    if (isEditing) {
      setEstimates(prev => prev.map(e => e.id === estimate.id ? estWithSig : e));
    } else {
      setEstimates(prev => [estWithSig, ...prev]);
    }

    // Deduct stock for items in invoice if new
    if (!isEditing) {
      setProducts(prevProducts => {
        return prevProducts.map(prod => {
          const itemInInvoice = estimate.items.find(item => item.name.toLowerCase() === prod.name.toLowerCase() || (prod.sku && item.name.includes(prod.sku)));
          if (itemInInvoice) {
            const newStock = Math.max(0, prod.stock - itemInInvoice.qty);
            // Log stock movement
            addStockLog({
              productId: prod.id,
              productName: prod.name,
              sku: prod.sku,
              type: 'OUTGOING',
              qty: itemInInvoice.qty,
              prevStock: prod.stock,
              newStock,
              date: estimate.date || new Date().toISOString().split('T')[0],
              reference: `Bill #${estimate.serial}`
            });
            return { ...prod, stock: newStock };
          }
          return prod;
        });
      });
    }
  };

  // Soft delete / Cancel invoice mechanism to preserve audit trail
  const cancelEstimate = (id: number, reason = 'Cancelled by staff/admin', userRole: 'admin' | 'clerk' = 'admin') => {
    const matched = estimates.find(e => e.id === id);
    if (!matched) return;

    setEstimates(prev => prev.map(e => {
      if (e.id === id) {
        return {
          ...e,
          isCancelled: true,
          voidReason: reason,
          voidedBy: userRole === 'admin' ? 'Admin' : 'Clerk'
        };
      }
      return e;
    }));

    // Record audit log entry
    recordAuditLog(userRole, 'BILL_CANCELLED', `Bill #${matched.serial} cancelled. Reason: ${reason}`);
  };

  const deleteEstimate = (id: number) => {
    // Permanent deletion used only when explicitly requested by admin
    setEstimates(prev => prev.filter(e => e.id !== id));
  };

  // --- Health Diagnostic & Auto-Repair ---
  const runHealthCheck = (): { issuesFound: number; fixedDetails: string[] } => {
    const fixedDetails: string[] = [];

    // 1. Check products for missing SKUs or negative prices
    let fixedProdCount = 0;
    const repairedProducts = products.map((p, idx) => {
      let modified = false;
      let sku = p.sku;
      if (!sku || sku.trim() === '') {
        sku = `SKU-FIX-${idx + 100}`;
        modified = true;
      }
      const price = Math.max(0, p.price || 0);
      const mrp = Math.max(price, p.mrp || price);
      const stock = isNaN(p.stock) ? 0 : p.stock;

      if (modified || p.price !== price || p.mrp !== mrp || p.stock !== stock) {
        fixedProdCount++;
        return { ...p, sku, price, mrp, stock };
      }
      return p;
    });

    if (fixedProdCount > 0) {
      setProducts(repairedProducts);
      fixedDetails.push(`Fixed ${fixedProdCount} product records (missing SKUs, price bounds, or NaN stock)`);
    }

    // 2. Check estimates for missing signatures or broken client references
    let fixedEstCount = 0;
    const repairedEstimates = estimates.map((e) => {
      let clientName = (e.clientName || '').trim();
      let clientPhone = (e.clientPhone || '').trim();

      const matchedClient = clients.find(c => Number(c.id) === Number(e.clientId));
      if (matchedClient) {
        // If matched by ID, sync official name/phone if missing
        if (!clientName) clientName = matchedClient.name;
        if (!clientPhone) clientPhone = matchedClient.phone;
      } else if (!clientName) {
        clientName = 'Cash Customer';
      }

      return {
        ...e,
        clientName,
        clientPhone,
        grandTotal: Math.max(0, e.grandTotal || 0),
        balanceDue: Math.max(0, e.balanceDue || 0)
      };
    });

    if (fixedEstCount > 0) {
      setEstimates(repairedEstimates);
      fixedDetails.push(`Repaired ${fixedEstCount} invoice linkages with updated customer information`);
    }

    const issuesFound = fixedDetails.length;
    if (issuesFound > 0) {
      recordAuditLog('admin', 'HEALTH_CHECK_REPAIR', `Health Diagnostic repair executed: ${fixedDetails.join('; ')}`);
    }

    return { issuesFound, fixedDetails };
  };

  const wipeDatabase = () => {
    setClients([]);
    setProducts([]);
    setEstimates([]);
    setStockLogs([]);
    setAuditLogs([]);
  };

  const importBackup = (data: UserUserDataState) => {
    setClients(data.clients || []);
    setProducts(data.products || []);
    setEstimates(data.estimates || []);
    setStockLogs(data.stockLogs || []);
    setAuditLogs(data.auditLogs || []);
    if (data.costFallbackPct) setCostFallbackPct(data.costFallbackPct);
  };

  return {
    clients,
    products,
    estimates,
    stockLogs,
    auditLogs,
    costFallbackPct,
    isLoaded,
    setCostFallbackPct,
    addClient,
    updateClient,
    deleteClient,
    addProduct,
    updateProduct,
    deleteProduct,
    saveEstimate,
    deleteEstimate,
    cancelEstimate,
    runHealthCheck,
    addStockLog,
    recordAuditLog,
    wipeDatabase,
    importBackup,
    loadUserData
  };
}
