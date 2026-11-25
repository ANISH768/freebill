import type { Client, Estimate, Product, StockLog } from '../types';

export interface CloudBillingSnapshot {
  businessName?: string;
  clients: Client[];
  products: Product[];
  estimates: Estimate[];
  stockLogs: StockLog[];
}

export interface CloudBulkSyncResult {
  success: boolean;
  syncedClients: number;
  syncedProducts: number;
  syncedEstimates: number;
  syncedStockLogs: number;
  updatedAt: string;
}

export async function fetchCloudBillingSnapshot(token: string): Promise<CloudBillingSnapshot> {
  const res = await fetch('/api/cloudsql/bootstrap', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not load cloud account data.');
  }

  const data = await res.json();
  return {
    businessName: typeof data.businessName === 'string' ? data.businessName : undefined,
    clients: Array.isArray(data.clients) ? data.clients : [],
    products: Array.isArray(data.products) ? data.products : [],
    estimates: Array.isArray(data.estimates) ? data.estimates : [],
    stockLogs: Array.isArray(data.stockLogs) ? data.stockLogs : [],
  };
}

export async function pushBulkCloudBillingData(
  token: string,
  payload: {
    businessName?: string;
    clients: Client[];
    products: Product[];
    estimates: Estimate[];
    stockLogs: StockLog[];
  }
): Promise<CloudBulkSyncResult> {
  const res = await fetch('/api/cloudsql/sync-bulk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not sync data to cloud account.');
  }

  return res.json();
}

export async function deleteCloudEntity(
  token: string,
  entity: 'client' | 'product' | 'estimate',
  externalId: string | number
): Promise<void> {
  const cleanId = encodeURIComponent(String(externalId));
  const res = await fetch(`/api/cloudsql/${entity}/${cleanId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not remove record from cloud account.');
  }
}
