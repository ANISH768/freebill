import { Download, Upload, Trash2, ShieldAlert, CheckCircle2, CloudLightning, Database, RefreshCw, Calendar, Loader2, Plus, ArrowLeftRight, Activity, Lock, Stethoscope, FileText, Check, AlertTriangle, Eye, ArrowRight, ShieldCheck, Sparkles, Printer } from 'lucide-react';
import { Client, Product, Estimate, User, AuditLog, StockLog } from '../types';
import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { encryptData, decryptData } from '../utils/crypto';
import { getPermanentIpForUser } from '../utils/permanentIp';

interface BackupProps {
  clients: Client[];
  products: Product[];
  estimates: Estimate[];
  users: User[];
  auditLogs?: AuditLog[];
  currentUser: string | null;
  onImportBackup: (importedData: {
    clients: Client[];
    products: Product[];
    estimates: Estimate[];
    users: User[];
    stockLogs?: StockLog[];
    mode?: 'replace' | 'merge';
    last_synced_millis?: number;
  }) => void;
  onResetDatabase: () => void;
  onSyncWithCloud?: () => void;
  onForceUpload?: () => void;
  onForceDownload?: () => void;
  onRunHealthCheck?: () => { issuesFound: number; fixedDetails: string[] };
  onOpenPrintCustomizer?: () => void;
  onOpenFileImport?: () => void;
}

interface ParsedBackupSummary {
  sourceName: string;
  clients: Client[];
  products: Product[];
  estimates: Estimate[];
  users: User[];
  stockLogs?: StockLog[];
  last_synced_millis?: number;
}

export default function Backup({
  clients,
  products,
  estimates,
  users,
  auditLogs = [],
  currentUser,
  onImportBackup,
  onResetDatabase,
  onSyncWithCloud,
  onForceUpload,
  onForceDownload,
  onRunHealthCheck,
  onOpenPrintCustomizer,
  onOpenFileImport
}: BackupProps) {
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restorePoints, setRestorePoints] = useState<any[]>([]);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [browserKeys, setBrowserKeys] = useState<{ key: string; length: number; type: string; sample?: string; rawData?: any }[]>([]);

  // Restore Preview & Confirmation Modal
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<ParsedBackupSummary | null>(null);
  const [isProcessingRestore, setIsProcessingRestore] = useState(false);

  // Health Diagnostic Check states
  const [healthStatus, setHealthStatus] = useState<{ checked: boolean; issues: number; details: string[] }>({
    checked: false,
    issues: 0,
    details: []
  });

  // Encrypted Backup Export Modal state
  const [showEncryptExportModal, setShowEncryptExportModal] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');

  // Permanent Per-User-ID LAN IP Info (1 fixed, non-changing IP per User ID)
  const permanentUserIp = getPermanentIpForUser(currentUser);
  const [networkInfo, setNetworkInfo] = useState<{
    port: number;
    hostname: string;
    permanentIp: string;
    lanUrls: string[];
    cloudSharedUrl: string;
  }>({
    port: 3000,
    hostname: 'localhost',
    permanentIp: permanentUserIp.ipWithPort,
    lanUrls: [`http://${permanentUserIp.ipWithPort}`],
    cloudSharedUrl: typeof window !== 'undefined' ? window.location.origin : 'https://ais-pre-ors5jocb2d3y4wmv3kze4f-914398356752.europe-west2.run.app'
  });

  useEffect(() => {
    fetch(`/api/network-info?phone=${encodeURIComponent(currentUser || '')}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setNetworkInfo(data);
      })
      .catch(() => {});
  }, [currentUser]);

  // Scan browser storage for orphaned or old backup data
  const scanBrowserStorage = () => {
    const results: { key: string; length: number; type: string; sample?: string; rawData?: any }[] = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('off_') || key.includes('estimates') || key.includes('invoices') || key.includes('clients') || key.includes('customers') || key.includes('products') || key.includes('user_'))) {
            const value = localStorage.getItem(key);
            if (value) {
              try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  let type = 'Unknown Array';
                  if (key.includes('estimates') || key.includes('invoices')) type = 'Estimates (Bills)';
                  else if (key.includes('clients') || key.includes('customers')) type = 'Customers / Clients';
                  else if (key.includes('products') || key.includes('items')) type = 'Products Catalog';
                  else if (key.includes('stock')) type = 'Stock Ledger Logs';
                  
                  results.push({
                    key,
                    length: parsed.length,
                    type,
                    sample: parsed.map((item: any) => item.serial || item.name || item.phone).filter(Boolean).slice(0, 3).join(', '),
                    rawData: parsed
                  });
                } else if (parsed && typeof parsed === 'object') {
                  const estCount = (parsed.estimates || parsed.invoices || []).length;
                  const prodCount = (parsed.products || parsed.items || []).length;
                  const cliCount = (parsed.clients || parsed.customers || []).length;
                  if (estCount > 0 || prodCount > 0 || cliCount > 0) {
                    results.push({
                      key,
                      length: estCount + prodCount + cliCount,
                      type: `Complete Dataset (${estCount} Bills, ${prodCount} Products, ${cliCount} Clients)`,
                      sample: `Invoices: ${estCount}, Items: ${prodCount}, Clients: ${cliCount}`,
                      rawData: parsed
                    });
                  }
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not scan localStorage", e);
    }
    setBrowserKeys(results);
  };

  useEffect(() => {
    scanBrowserStorage();
  }, []);

  const handleRecoverKey = (item: { key: string; length: number; type: string; rawData?: any }) => {
    try {
      if (!item.rawData) return;
      const parsed = item.rawData;

      let extractedClients: Client[] = [];
      let extractedProducts: Product[] = [];
      let extractedEstimates: Estimate[] = [];
      let extractedUsers: User[] = [...users];

      if (Array.isArray(parsed)) {
        if (item.type.includes('Estimates') || item.type.includes('Bills')) {
          extractedEstimates = parsed;
          extractedClients = clients;
          extractedProducts = products;
        } else if (item.type.includes('Customers') || item.type.includes('Clients')) {
          extractedClients = parsed;
          extractedEstimates = estimates;
          extractedProducts = products;
        } else if (item.type.includes('Products')) {
          extractedProducts = parsed;
          extractedEstimates = estimates;
          extractedClients = clients;
        }
      } else if (typeof parsed === 'object') {
        extractedClients = Array.isArray(parsed.clients || parsed.customers) ? (parsed.clients || parsed.customers) : clients;
        extractedProducts = Array.isArray(parsed.products || parsed.items) ? (parsed.products || parsed.items) : products;
        extractedEstimates = Array.isArray(parsed.estimates || parsed.invoices) ? (parsed.estimates || parsed.invoices) : estimates;
        extractedUsers = Array.isArray(parsed.users) ? parsed.users : users;
      }

      setPreviewBackup({
        sourceName: `Browser Cache (${item.key})`,
        clients: extractedClients,
        products: extractedProducts,
        estimates: extractedEstimates,
        users: extractedUsers,
        last_synced_millis: Date.now()
      });
      setShowRestoreModal(true);
    } catch (err) {
      setError("Failed to inspect browser storage key.");
      setTimeout(() => setError(null), 3500);
    }
  };

  // Find user details for cloud sync
  const userMatched = users.find(u => u.phone === currentUser);

  // Fetch restore points from server on mount or when currentUser changes
  const fetchRestorePoints = async () => {
    if (!currentUser || !userMatched || !userMatched.password) return;
    setIsLoadingPoints(true);
    try {
      const res = await fetch(`/api/backup/list/${currentUser}?password=${encodeURIComponent(userMatched.password)}`);
      if (res.ok) {
        const data = await res.json();
        setRestorePoints(data.list || []);
      }
    } catch (err) {
      console.warn("Could not fetch restore points", err);
    } finally {
      setIsLoadingPoints(false);
    }
  };

  useEffect(() => {
    fetchRestorePoints();
  }, [currentUser]);

  const handleCreateSnapshot = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userMatched || !userMatched.password) {
      setError("Please login to create a cloud snapshot.");
      return;
    }
    if (!snapshotName.trim()) {
      setError("Please provide a name for this snapshot.");
      return;
    }

    setIsLoadingPoints(true);
    try {
      const payload = {
        password: userMatched.password,
        name: snapshotName.trim(),
        clients,
        products,
        estimates
      };

      const res = await fetch(`/api/backup/create/${currentUser}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setRestorePoints(data.list || []);
        setSnapshotName('');
        setShowCreateModal(false);
        setSuccess("Cloud restore point created successfully!");
        setTimeout(() => setSuccess(null), 3500);
      } else {
        setError("Failed to create snapshot restore point.");
        setTimeout(() => setError(null), 3500);
      }
    } catch (err) {
      setError("Network issue: unable to reach cloud server.");
      setTimeout(() => setError(null), 3500);
    } finally {
      setIsLoadingPoints(false);
    }
  };

  const handleRestoreSnapshot = async (id: string, name: string) => {
    if (!currentUser || !userMatched || !userMatched.password) return;

    const confirmation = window.confirm(
      `Are you sure you want to restore the snapshot: "${name}"?\n` +
      `This will revert your active database to this exact saved state.`
    );
    if (!confirmation) return;

    setIsLoadingPoints(true);
    try {
      const res = await fetch(`/api/backup/restore/${currentUser}/${id}?password=${encodeURIComponent(userMatched.password)}`);
      if (res.ok) {
        const data = await res.json();
        const payload = data.payload;
        
        onImportBackup({
          clients: payload.clients || [],
          products: payload.products || [],
          estimates: payload.estimates || [],
          users: users,
          mode: 'replace',
          last_synced_millis: payload.last_synced_millis || Date.now()
        });

        setSuccess(`Snapshot "${name}" restored successfully!`);
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError("Failed to restore cloud snapshot.");
        setTimeout(() => setError(null), 3500);
      }
    } catch (err) {
      setError("Network issue: unable to connect to cloud server.");
      setTimeout(() => setError(null), 3500);
    } finally {
      setIsLoadingPoints(false);
    }
  };

  const handleDeleteSnapshot = async (id: string, name: string) => {
    if (!currentUser || !userMatched || !userMatched.password) return;

    const confirmation = window.confirm(`Are you sure you want to delete the snapshot: "${name}"?`);
    if (!confirmation) return;

    try {
      setIsLoadingPoints(true);
      const res = await fetch(`/api/backup/delete/${currentUser}/${id}?password=${encodeURIComponent(userMatched.password)}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        const data = await res.json();
        setRestorePoints(data.list);
        setSuccess("Restore point snapshot deleted successfully.");
        setTimeout(() => setSuccess(null), 3500);
      } else {
        setError("Failed to delete snapshot.");
        setTimeout(() => setError(null), 3500);
      }
    } catch (err) {
      setError("Network issue: unable to connect to cloud server.");
      setTimeout(() => setError(null), 3500);
    } finally {
      setIsLoadingPoints(false);
    }
  };

  const handleExportEncryptedBackup = async () => {
    if (!exportPassphrase.trim()) {
      setError("Please enter a password/passphrase to protect your backup file.");
      return;
    }
    try {
      const dataPayload = {
        version: "1.0.0",
        encryptedAt: new Date().toISOString(),
        clients,
        products,
        estimates,
        users
      };

      const encryptedString = await encryptData(dataPayload, exportPassphrase.trim());
      const encryptedFileObj = {
        isEncryptedBackup: true,
        payload: encryptedString
      };

      const blob = new Blob([JSON.stringify(encryptedFileObj, null, 2)], { type: 'application/json;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `BillSync_Encrypted_Backup_${new Date().toISOString().split('T')[0]}.enc.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setShowEncryptExportModal(false);
      setExportPassphrase('');
      setSuccess("🔒 Password-protected AES-256 encrypted backup downloaded successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError("Failed to generate encrypted backup file.");
      setTimeout(() => setError(null), 3500);
    }
  };

  // Comprehensive universal parser for any format (JSON, CSV, Encrypted, Base64, Array, Object maps)
  const parseUniversalBackup = async (rawText: string, fileName: string = 'Uploaded File'): Promise<ParsedBackupSummary | null> => {
    // Strip BOM and excess whitespace
    const trimmed = rawText.replace(/^\uFEFF/, '').trim();
    if (!trimmed) return null;

    let parsed: any = null;

    // 1. Try parsing JSON
    try {
      parsed = JSON.parse(trimmed);
    } catch (jsonErr) {
      // 2. Try Base64 decoding if not valid JSON
      try {
        const decoded = atob(trimmed);
        parsed = JSON.parse(decoded);
      } catch (b64Err) {
        // 3. Try CSV parsing
        parsed = parseCSVContent(trimmed);
      }
    }

    if (!parsed) {
      throw new Error("Unable to parse file content. Please ensure it is a valid JSON, CSV, or backup text.");
    }

    // If file is password-protected encrypted backup
    if (parsed && parsed.isEncryptedBackup && parsed.payload) {
      const pass = window.prompt("🔑 This backup file is encrypted with AES-256. Enter the decryption password/PIN:");
      if (!pass) return null;
      const decrypted = await decryptData(parsed.payload, pass.trim());
      if (!decrypted) {
        throw new Error("Incorrect decryption password or corrupted encrypted backup payload.");
      }
      parsed = decrypted;
    }

    const toArray = (val: any): any[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'object') return Object.values(val);
      return [];
    };

    let extractedClients: Client[] = [];
    let extractedProducts: Product[] = [];
    let extractedEstimates: Estimate[] = [];
    let extractedUsers: User[] = [...users];
    let extractedStockLogs: StockLog[] = [];

    if (Array.isArray(parsed)) {
      // Direct array format: inspect first element to detect type
      const first = parsed[0] || {};
      if (first.serial || first.grandTotal || (first.items && Array.isArray(first.items))) {
        extractedEstimates = parsed;
      } else if (first.sku !== undefined || first.stock !== undefined || first.mrp !== undefined) {
        extractedProducts = parsed;
      } else if (first.phone !== undefined || first.gstin !== undefined || first.address !== undefined) {
        extractedClients = parsed;
      }
    } else if (typeof parsed === 'object') {
      // Handle nested container properties
      const root = parsed.backup || parsed.database || parsed.data || parsed.syncData || parsed.payload || parsed.state || parsed.store || parsed;

      extractedClients = toArray(root.clients || root.customers || root.clientList || root.parties);
      extractedProducts = toArray(root.products || root.items || root.productList || root.stock || root.inventory);
      extractedEstimates = toArray(root.estimates || root.invoices || root.bills || root.sales || root.orders);
      extractedUsers = toArray(root.users).length > 0 ? toArray(root.users) : users;
      extractedStockLogs = toArray(root.stockLogs || root.stock_logs || root.logs);

      // If still empty, scan top-level keys
      if (extractedClients.length === 0 && extractedProducts.length === 0 && extractedEstimates.length === 0) {
        for (const key of Object.keys(parsed)) {
          const val = parsed[key];
          if (Array.isArray(val) && val.length > 0) {
            const first = val[0] || {};
            if (first.serial || first.grandTotal || first.items) {
              extractedEstimates = val;
            } else if (first.sku !== undefined || first.stock !== undefined || first.price !== undefined) {
              extractedProducts = val;
            } else if (first.phone !== undefined || first.address !== undefined) {
              extractedClients = val;
            }
          }
        }
      }
    }

    if (extractedClients.length === 0 && extractedProducts.length === 0 && extractedEstimates.length === 0) {
      throw new Error("No customer, product, or invoice records found inside this backup payload.");
    }

    return {
      sourceName: fileName,
      clients: extractedClients,
      products: extractedProducts,
      estimates: extractedEstimates,
      users: extractedUsers,
      stockLogs: extractedStockLogs,
      last_synced_millis: Date.now()
    };
  };

  // Helper for CSV Parsing
  const parseCSVContent = (csvText: string): any => {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const result: { clients: any[]; products: any[]; estimates: any[] } = {
      clients: [],
      products: [],
      estimates: []
    };

    let currentSection: 'clients' | 'products' | 'estimates' | 'generic' = 'generic';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('=== CUSTOMERS') || line.includes('=== CLIENTS')) {
        currentSection = 'clients';
        continue;
      } else if (line.includes('=== PRODUCTS') || line.includes('=== INVENTORY')) {
        currentSection = 'products';
        continue;
      } else if (line.includes('=== ESTIMATES') || line.includes('=== BILLS') || line.includes('=== INVOICES')) {
        currentSection = 'estimates';
        continue;
      }

      // Skip header lines
      if (line.startsWith('ID,') || line.startsWith('Serial Number,') || line.startsWith('Name,')) {
        continue;
      }

      // Simple CSV split
      const parts = line.split(',').map(s => s.replace(/^"(.*)"$/, '$1').trim());
      if (parts.length < 2) continue;

      if (currentSection === 'clients') {
        result.clients.push({
          id: Number(parts[0]) || Date.now() + Math.random(),
          name: parts[1] || 'Customer',
          phone: parts[2] || '',
          gstin: parts[3] || '',
          address: parts[4] || ''
        });
      } else if (currentSection === 'products') {
        result.products.push({
          id: Number(parts[0]) || Date.now() + Math.random(),
          sku: parts[1] || '',
          name: parts[2] || 'Item',
          unit: parts[3] || 'Pcs',
          stock: Number(parts[4]) || 0,
          mrp: Number(parts[5]) || 0,
          price: Number(parts[6]) || 0,
          purchasePrice: Number(parts[7]) || (Number(parts[6]) * 0.75),
          discount: Number(parts[8]) || 0
        });
      } else if (currentSection === 'estimates') {
        result.estimates.push({
          id: Number(parts[0]) || Date.now() + Math.random(),
          serial: parts[1] || `INV-${Date.now().toString().slice(-4)}`,
          date: parts[2] || new Date().toISOString().split('T')[0],
          dueDate: parts[3] || new Date().toISOString().split('T')[0],
          clientName: parts[4] || 'Cash Customer',
          clientPhone: parts[5] || '',
          clientAddr: parts[6] || '',
          subtotal: Number(parts[7]) || 0,
          taxPct: Number(parts[8]) || 0,
          taxAmt: Number(parts[9]) || 0,
          cashDiscount: Number(parts[10]) || 0,
          grandTotal: Number(parts[11]) || 0,
          paidAmount: Number(parts[12]) || 0,
          balanceDue: Number(parts[13]) || 0,
          status: parts[14] || 'PAID',
          items: []
        });
      }
    }

    if (result.clients.length > 0 || result.products.length > 0 || result.estimates.length > 0) {
      return result;
    }
    return null;
  };

  const handleImportBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const rawContent = event.target?.result as string;
          const parsedSummary = await parseUniversalBackup(rawContent, file.name);
          if (parsedSummary) {
            setPreviewBackup(parsedSummary);
            setShowRestoreModal(true);
          }
        } catch (err: any) {
          setError(err?.message || "Failed to parse backup file.");
        }
      };
      reader.readAsText(file);
    } catch (err) {
      setError("Failed to read file.");
    } finally {
      e.target.value = '';
    }
  };

  const handlePasteRestore = async () => {
    if (!pasteText.trim()) return;
    setError(null);
    try {
      const parsedSummary = await parseUniversalBackup(pasteText.trim(), "Pasted Code");
      if (parsedSummary) {
        setShowPasteModal(false);
        setPasteText('');
        setPreviewBackup(parsedSummary);
        setShowRestoreModal(true);
      }
    } catch (e: any) {
      setError(e?.message || "Invalid backup code. Please ensure you copied the full backup text.");
      setTimeout(() => setError(null), 4500);
    }
  };

  const executeRestore = async (mode: 'replace' | 'merge') => {
    if (!previewBackup) return;
    setIsProcessingRestore(true);
    try {
      await onImportBackup({
        clients: previewBackup.clients,
        products: previewBackup.products,
        estimates: previewBackup.estimates,
        users: previewBackup.users,
        stockLogs: previewBackup.stockLogs,
        mode: mode,
        last_synced_millis: previewBackup.last_synced_millis || Date.now()
      });

      setShowRestoreModal(false);
      const actionText = mode === 'replace' ? "पूरा रीस्टोर (Replaced & Restored)" : "मर्ज (Merged)";
      setSuccess(`✓ बैकअप ${actionText} सफलतापूर्वक पूरा हुआ! (${previewBackup.estimates.length} बिल, ${previewBackup.products.length} उत्पाद, ${previewBackup.clients.length} ग्राहक)`);
      setPreviewBackup(null);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError("रीस्टोर करने में त्रुटि हुई। कृपया पुनः प्रयास करें।");
    } finally {
      setIsProcessingRestore(false);
    }
  };

  const handleExportJSON = () => {
    try {
      const dataPayload = {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        businessName: userMatched?.businessName || "BillSync Business",
        clients,
        products,
        estimates,
        users
      };
      const fileData = JSON.stringify(dataPayload, null, 2);
      const blob = new Blob([fileData], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `BillSync_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setSuccess("Full Database backup (.JSON) downloaded successfully!");
      setTimeout(() => setSuccess(null), 3500);
    } catch (err) {
      setError("Failed to export JSON file.");
      setTimeout(() => setError(null), 3500);
    }
  };

  const handleExportCSV = () => {
    try {
      const escapeCSV = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str}"`;
        }
        return str;
      };

      let csvContent = "";

      // Section 1: CUSTOMERS
      csvContent += "=== CUSTOMERS / CLIENTS ===\n";
      csvContent += "ID,Name,Phone,GSTIN,Address\n";
      clients.forEach(c => {
        csvContent += `${escapeCSV(c.id)},${escapeCSV(c.name)},${escapeCSV(c.phone)},${escapeCSV(c.gstin)},${escapeCSV(c.address)}\n`;
      });
      csvContent += "\n";

      // Section 2: PRODUCTS
      csvContent += "=== PRODUCTS / INVENTORY ===\n";
      csvContent += "ID,SKU,Name,Unit,Stock,MRP,Sale Price,Purchase Price,Default Discount %\n";
      products.forEach(p => {
        csvContent += `${escapeCSV(p.id)},${escapeCSV(p.sku)},${escapeCSV(p.name)},${escapeCSV(p.unit)},${escapeCSV(p.stock)},${escapeCSV(p.mrp)},${escapeCSV(p.price)},${escapeCSV(p.purchasePrice || '')},${escapeCSV(p.discount || 0)}\n`;
      });
      csvContent += "\n";

      // Section 3: ESTIMATES
      csvContent += "=== ESTIMATES / BILLS ===\n";
      csvContent += "ID,Serial Number,Date,Due Date,Client Name,Client Phone,Client Address,Subtotal,Tax %,Tax Amount,Cash Discount,Grand Total,Paid Amount,Balance Due,Status,Items List\n";
      estimates.forEach(e => {
        const itemsSummary = e.items.map(item => `${item.name} (${item.qty} ${item.unit} @ ₹${item.price})`).join(" | ");
        csvContent += `${escapeCSV(e.id)},${escapeCSV(e.serial)},${escapeCSV(e.date)},${escapeCSV(e.dueDate)},${escapeCSV(e.clientName)},${escapeCSV(e.clientPhone)},${escapeCSV(e.clientAddr)},${escapeCSV(e.subtotal)},${escapeCSV(e.taxPct)},${escapeCSV(e.taxAmt)},${escapeCSV(e.cashDiscount)},${escapeCSV(e.grandTotal)},${escapeCSV(e.paidAmount)},${escapeCSV(e.balanceDue)},${escapeCSV(e.status)},${escapeCSV(itemsSummary)}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `BillSync_CSV_Export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setSuccess("Data backup file (.CSV) downloaded successfully!");
      setTimeout(() => setSuccess(null), 3500);
    } catch (err) {
      setError("Failed to export CSV file.");
      setTimeout(() => setError(null), 3500);
    }
  };

  const handleCopyBackupText = () => {
    try {
      const dataPayload = {
        clients,
        products,
        estimates,
        users,
        backupDate: new Date().toISOString(),
        version: "1.0.0"
      };
      const fileString = JSON.stringify(dataPayload);
      navigator.clipboard.writeText(fileString);
      setSuccess("✓ Backup code copied to clipboard! Save it in any safe place.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError("Failed to copy backup text.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleHardReset = () => {
    const confirmation = window.confirm(
      "🚨 Are you sure you want to permanently delete all data?\nThis action will erase all transactions, invoices, customers, and inventory lists."
    );
    if (confirmation) {
      onResetDatabase();
      setSuccess("Your database sandbox has been successfully wiped!");
      setTimeout(() => setSuccess(null), 3500);
    }
  };

  const handleTriggerHealthCheck = () => {
    if (onRunHealthCheck) {
      const res = onRunHealthCheck();
      setHealthStatus({
        checked: true,
        issues: res.issuesFound,
        details: res.fixedDetails
      });
      setSuccess(`Integrity scan complete: ${res.issuesFound} auto-repair fixes applied!`);
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">System Backup & Sync (डेटा बैकअप एवं रीस्टोर)</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1">
          Securely manage your real-time cloud data, recover previous restore points, and export or import local backup files.
        </p>
      </div>

      {success && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 p-4 rounded-xl flex items-start space-x-2 text-xs font-sans animate-fade-in shadow-xs">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
          <span className="font-bold leading-relaxed">{success}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-xl flex items-start space-x-2 text-xs font-sans animate-fade-in shadow-xs">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
          <span className="font-bold leading-relaxed">{error}</span>
        </div>
      )}

      {/* ----------------- PERMANENT PER-USER-ID LAN IP & 2-PC AUTO-LOGIN SETUP ----------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <p className="text-xs font-bold text-blue-600">
              Permanent Per-ID LAN IP · Fixed &amp; Non-Changing
            </p>
            <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
              आपकी ID (+91 {currentUser || '------'}) का स्थायी (Permanent) LAN IP और 2nd PC Auto-Login लिंक
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl tabular-nums whitespace-nowrap shrink-0">
            Permanent IP: {permanentUserIp.ipWithPort}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Box 1: Single Permanent Per-ID LAN IP (Never Changes) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
            <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
              <span>1. आपकी ID का एकमात्र स्थायी LAN IP (No Changing IP)</span>
              <span className="text-[11px] font-mono font-bold text-emerald-700">FIXED FOREVER</span>
            </div>
            <p className="text-slate-600 font-medium leading-relaxed">
              हर एक User ID का अलग-अलग और सिर्फ <b>एक ही स्थायी IP Address</b> होता है जो कभी नहीं बदलता (राउटर या Wi-Fi बंद-चालू होने पर भी यही रहेगा):
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={`http://${permanentUserIp.ipWithPort}`}
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-xs text-slate-900 tabular-nums select-all"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(`http://${permanentUserIp.ipWithPort}`);
                  setSuccess(`✓ Permanent LAN IP (http://${permanentUserIp.ipWithPort}) copied!`);
                  setTimeout(() => setSuccess(null), 3500);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Copy Permanent IP
              </button>
            </div>
          </div>

          {/* Box 2: Direct 2nd PC Auto-Login Link for this Permanent IP */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
            <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
              <span>2. 2nd PC Direct Auto-Login Link (सीधे काउंटर खुलेगा)</span>
              <span className="text-[11px] font-mono font-bold text-blue-700">AUTO-LOGIN</span>
            </div>
            <p className="text-slate-600 font-medium leading-relaxed">
              दूसरे PC के ब्राउज़र में यह <b>Permanent IP Link</b> खोलते ही बिना नंबर/पासवर्ड डाले सीधे आपकी इसी ID (<b>+91 {currentUser}</b>) का काउंटर और पूरा लाइव डेटा खुल जाएगा:
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={permanentUserIp.autoLoginUrl}
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-xs text-slate-900 tabular-nums select-all"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(permanentUserIp.autoLoginUrl);
                  setSuccess(`✓ 2nd PC Auto-Login Link (${permanentUserIp.autoLoginUrl}) copied!`);
                  setTimeout(() => setSuccess(null), 3500);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Copy 2nd-PC Link
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------- HIGH-END PANEL 1: CLOUD AUTO-SYNC STATUS ----------------- */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 border border-slate-750 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400">🔥 Firebase Cloud Firestore Connected</span>
          </div>
          <h3 className="text-lg font-black tracking-tight text-white flex items-center space-x-2">
            <CloudLightning className="w-5 h-5 text-yellow-400" />
            <span>Secure Cloud Backup & Sync</span>
          </h3>
          <p className="text-[11px] text-slate-400 max-w-xl leading-relaxed font-medium">
            Your customer directories, invoices/bills, stock ledger, and payments are continuously backed up to your dedicated Google Firebase Firestore cloud database. Multi-device sync keeps your PC and mobile in sync seamlessly.
          </p>
        </div>

        {currentUser ? (
          <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto">
            <button
              onClick={() => onSyncWithCloud?.()}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>Sync Cloud Now</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-blue-900/30 flex items-center justify-center space-x-1.5 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Take Cloud Snapshot</span>
            </button>
          </div>
        ) : (
          <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-750 text-slate-400 text-xs text-center md:max-w-xs font-semibold">
            🔐 Log in with your Business Mobile Number to unlock automatic multi-device synchronization and historic cloud restore points.
          </div>
        )}
      </div>

      {/* ----------------- FORCED SYNC OPTIONS: UPLOAD/DOWNLOAD ----------------- */}
      {currentUser && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Column 1: Force Upload My Data */}
          <div className="bg-slate-50 border border-slate-200/85 rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:shadow-xs transition-shadow">
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-indigo-900">
                <div className="p-2 bg-indigo-100/50 border border-indigo-200/40 rounded-xl">
                  <Upload className="w-5 h-5 text-indigo-600" />
                </div>
                <h4 className="font-extrabold text-sm text-slate-800">
                  Force to Upload My Data (मेरा डेटा अपलोड करें)
                </h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                <b>कब उपयोग करें?</b> जब आप अपने PC पर काम कर रहे हों और PC का सारा नया डेटा (Invoices, Products, Customers) क्लाउड सर्वर पर भेजना चाहते हों ताकि वह आपके फोन में भी दिखे।
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                यह आपके वर्तमान PC डेटा को क्लाउड पर जबरन अपलोड (Over-write) कर देगा। आपके फोन पर "Force Download" करने पर यही डेटा वहां प्राप्त होगा।
              </p>
            </div>
            <button
              onClick={() => onForceUpload?.()}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md shadow-indigo-900/10 flex items-center justify-center space-x-2 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <Upload className="w-4 h-4 animate-bounce" />
              <span>📤 Force Upload PC Data to Cloud</span>
            </button>
          </div>

          {/* Column 2: Force Download Cloud Data */}
          <div className="bg-slate-50 border border-slate-200/85 rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:shadow-xs transition-shadow">
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-emerald-900">
                <div className="p-2 bg-emerald-100/50 border border-emerald-200/40 rounded-xl">
                  <Download className="w-5 h-5 text-emerald-600" />
                </div>
                <h4 className="font-extrabold text-sm text-slate-800">
                  Force to Download Cloud Data (क्लाउड डेटा डाउनलोड करें)
                </h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                <b>कब उपयोग करें?</b> जब आप अपने फोन पर लॉगिन कर चुके हों और PC वाला सारा डेटा यहाँ अपने फोन की स्क्रीन पर डाउनलोड करके चालू करना चाहते हों।
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                यह क्लाउड पर मौजूद नवीनतम डेटा को इस डिवाइस में डाउनलोड करके यहाँ के पुराने डेटा को ओवरराइट कर देगा।
              </p>
            </div>
            <button
              onClick={() => onForceDownload?.()}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md shadow-emerald-900/10 flex items-center justify-center space-x-2 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>📥 Force Download Cloud Data to Local</span>
            </button>
          </div>

        </div>
      )}

      {/* ----------------- HIGH-END PANEL 2: ENTERPRISE CLOUD RESTORE POINTS ----------------- */}
      {currentUser && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center space-x-1.5">
                <Database className="w-4.5 h-4.5 text-blue-600" />
                <span>Enterprise Cloud Restore Points</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                Saved states of your business data. Click Restore to roll back the database instantly.
              </p>
            </div>
            <button
              onClick={fetchRestorePoints}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
              title="Refresh Restore Points List"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingPoints ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingPoints && restorePoints.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-2 text-xs">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="font-bold">Contacting Cloud Database Server...</span>
            </div>
          ) : restorePoints.length === 0 ? (
            <div className="p-10 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50 bg-opacity-40">
              <span className="text-2xl block mb-2">📁</span>
              <h4 className="font-black text-slate-650 text-xs">No Cloud Restore Points Saved</h4>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                Click "Take Cloud Snapshot" to store a perfect, historical restore point of your stock sheets, invoices, and clients.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest rounded-lg">
                  <tr>
                    <th className="p-3 pl-4">SNAPSHOT NAME / DETAILS</th>
                    <th className="p-3 text-center">CUSTOMERS</th>
                    <th className="p-3 text-center">PRODUCTS</th>
                    <th className="p-3 text-center">INVOICES</th>
                    <th className="p-3 text-right pr-4">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {restorePoints.map((rp) => (
                    <tr key={rp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 pl-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-800">{rp.name}</span>
                          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {new Date(rp.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-600">
                        {rp.clientCount || 0}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-600">
                        {rp.productCount || 0}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-600">
                        {rp.estimateCount || 0}
                      </td>
                      <td className="p-3 text-right pr-4 space-x-2">
                        <button
                          onClick={() => handleRestoreSnapshot(rp.id, rp.name)}
                          disabled={isLoadingPoints}
                          className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSnapshot(rp.id, rp.name)}
                          disabled={isLoadingPoints}
                          className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white font-bold px-2 py-1.5 rounded-lg text-[10px] transition-all cursor-pointer inline-flex items-center"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ----------------- PROJECT FILES DATA LOADER BANNER ----------------- */}
      {onOpenFileImport && (
        <div className="bg-gradient-to-r from-teal-900 via-emerald-900 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-teal-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-400/20 text-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-emerald-400/30">
                📂 Saved Project Files Data
              </span>
              <span className="text-[11px] font-bold text-emerald-200/80">प्रोजेक्ट फ़ाइलों में मौजूद डेटा जोड़ें</span>
            </div>
            <h3 className="font-extrabold text-base text-white">
              Add Data from Saved Project Files (फ़ाइलों का डेटा 1-Click में जोड़ें)
            </h3>
            <p className="text-[11px] text-emerald-100/85 font-medium leading-relaxed">
              आपके सिस्टम/फ़ाइलों में मौजूद ऑटो पार्ट्स प्रोडक्ट्स (`products_part1/2.json`, `user_real_data.json`), ग्राहक (`clients_restore.json`) और बिल (`estimates_part1/2.json`) को सीधे अपने अकाउंट में जोड़ें (Merge या Replace करें)।
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenFileImport}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-3 rounded-xl text-xs transition-all shadow-lg flex items-center space-x-2 cursor-pointer whitespace-nowrap active:scale-95"
          >
            <span>📂</span>
            <span>Open File Data Loader (फ़ाइल डेटा जोड़ें)</span>
          </button>
        </div>
      )}

      {/* ----------------- HIGH-END PANEL 3: LOCAL FILE EXPORT & RESTORE ----------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
        
        {/* Export Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 bg-blue-50 rounded-xl text-blue-600 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm font-sans">Export Complete Backup</h3>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed font-sans">
              Download your full database (Customers, Products, Invoices) as a portable .JSON, .CSV, or AES-256 encrypted file to store on your USB drive or computer.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full pt-2">
            <button
              onClick={handleExportJSON}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-2 rounded-xl text-[11px] shadow-md shadow-blue-100 flex items-center justify-center space-x-1 transition-all cursor-pointer font-sans"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Full JSON</span>
            </button>
            <button
              onClick={() => setShowEncryptExportModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-2 rounded-xl text-[11px] shadow-md shadow-purple-100 flex items-center justify-center space-x-1 transition-all cursor-pointer font-sans"
              title="Export with AES-256 password encryption"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Encrypted</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 px-2 rounded-xl text-[11px] shadow-md shadow-teal-100 flex items-center justify-center space-x-1 transition-all cursor-pointer font-sans"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV Excel</span>
            </button>
            <button
              onClick={handleCopyBackupText}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-2 rounded-xl text-[11px] shadow-md shadow-indigo-100 flex items-center justify-center space-x-1 transition-all cursor-pointer font-sans"
              title="Copy direct backup code string"
            >
              <span>📋 Copy Code</span>
            </button>
          </div>
        </div>

        {/* Import Recovery Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl text-emerald-600 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm font-sans">Restore Backup File (डेटा वापस लाएं)</h3>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed font-sans">
              Upload any .JSON, .CSV, .ENC or .TXT backup file, or paste your backup code. You can choose to <b>Full Replace & Overwrite</b> (पुराना डेटा हटाकर नया बैकअप लोड करें) or <b>Smart Merge</b> (डेटा जोड़ें).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 w-full">
            <div className="relative flex-1">
              <input
                type="file"
                id="import-backup-file-picker"
                accept=".json,.csv,.txt,.enc"
                onChange={handleImportBackup}
                className="hidden"
              />
              <label
                htmlFor="import-backup-file-picker"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center space-x-2 cursor-pointer transition-all border border-transparent text-center font-sans hover:-translate-y-0.5 active:scale-95"
              >
                <Upload className="w-4 h-4 animate-bounce" />
                <span>Select Backup File (.JSON / .CSV / .ENC)</span>
              </label>
            </div>
            <button
              onClick={() => setShowPasteModal(true)}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md flex items-center justify-center space-x-1.5 transition-all cursor-pointer font-sans active:scale-95"
            >
              <span>✍️ Paste Code</span>
            </button>
          </div>
        </div>

      </div>

      {/* ----------------- HIGH-END PANEL 4: BROWSER DIAGNOSTICS & DATA RESCUE ----------------- */}
      <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center space-x-1.5">
              <span className="p-1 bg-amber-50 text-amber-600 rounded-lg">🛡️</span>
              <span>Browser Storage Data Rescue & Diagnostics (ब्राउज़र मेमोरी स्कैन)</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
              Scan your browser's background cache storage to recover lost or orphaned local bills from previous login sessions.
            </p>
          </div>
          <button
            onClick={scanBrowserStorage}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl transition-all text-[10px] font-bold flex items-center space-x-1 cursor-pointer"
            title="Scan Storage Keys"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Scan Cache Storage</span>
          </button>
        </div>

        {browserKeys.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <span className="text-xl block mb-1">🔍</span>
            <h4 className="font-bold text-slate-500 text-xs">No orphaned local records found in this browser.</h4>
            <p className="text-[10px] text-slate-400 mt-0.5 max-w-md mx-auto font-medium">
              If you had offline estimates that did not synchronize, please log in with your primary phone number first to check if they load automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl text-[11px] text-amber-800 leading-relaxed font-medium">
              ⚠️ **Found {browserKeys.length} potential local datasets** cached in this browser. You can click <strong>"Rescue & Restore"</strong> to inspect and recover these records into your active workspace!
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest rounded-lg">
                  <tr>
                    <th className="p-3 pl-4">CACHE KEY</th>
                    <th className="p-3">DATA TYPE</th>
                    <th className="p-3 text-center">ITEMS FOUND</th>
                    <th className="p-3">PREVIEW SAMPLES</th>
                    <th className="p-3 text-right pr-4">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {browserKeys.map((item) => (
                    <tr key={item.key} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 pl-4 font-mono text-[11px] text-blue-600 font-bold">
                        {item.key}
                      </td>
                      <td className="p-3 text-slate-700 font-bold">
                        {item.type}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-800">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md">
                          {item.length} records
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 max-w-xs truncate text-[11px]">
                        {item.sample || '—'}
                      </td>
                      <td className="p-3 text-right pr-4">
                        <button
                          onClick={() => handleRecoverKey(item)}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] flex items-center space-x-1 border border-amber-600/25 transition-all cursor-pointer shadow-xs"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Rescue & Restore</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ----------------- HEALTH DIAGNOSTIC CHECK & REPAIR CARD ----------------- */}
      <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-extrabold text-sm flex items-center space-x-2">
              <Stethoscope className="w-5 h-5 text-emerald-400" />
              <span>Database Integrity & Health Diagnostic Scan</span>
            </h3>
            <p className="text-[11px] text-emerald-200/80 font-medium">
              Deep-scan IndexedDB tables for corrupted rows, missing product SKUs, broken customer foreign key links, or negative price bounds, and auto-repair inconsistencies.
            </p>
          </div>
          <button
            onClick={handleTriggerHealthCheck}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center space-x-1.5 cursor-pointer whitespace-nowrap"
          >
            <Stethoscope className="w-4 h-4" />
            <span>Run Health Diagnostic</span>
          </button>
        </div>

        {healthStatus.checked && (
          <div className="bg-slate-950/60 p-4 rounded-xl border border-emerald-500/30 text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-emerald-400 font-bold">
              <span>Diagnostic Status: COMPLETE</span>
              <span>{healthStatus.issues === 0 ? '100% HEALTHY' : `${healthStatus.issues} ISSUES REPAIRED`}</span>
            </div>
            {healthStatus.details.length > 0 ? (
              <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1 pt-1">
                {healthStatus.details.map((dt, idx) => (
                  <li key={idx}>{dt}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-emerald-300">✓ No broken SKUs, orphan references, or structural errors detected.</p>
            )}
          </div>
        )}
      </div>

      {/* ----------------- USER REQUESTED: PRINTING SETUP, SECONDARY STYLES & LIVE PREVIEW CUSTOMIZER ----------------- */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-sm border border-blue-800/40 space-y-4 select-none font-sans">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500/20 text-blue-300 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-blue-400/30">
                🖨️ Printing Configuration
              </span>
              <span className="text-[11px] font-bold text-slate-400">प्रिंटिंग प्रीव्यू एडिट और चॉइस सिस्टम</span>
            </div>
            <h3 className="font-extrabold text-base flex items-center space-x-2 text-white">
              <Printer className="w-5 h-5 text-blue-400" />
              <span>Print Preview Customizer & Secondary Printing Engine</span>
            </h3>
            <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
              बिल प्रिंटिंग प्रीव्यू को अपनी आवश्यकतानुसार एडिट करें! सेकेंडरी प्रिंटिंग स्टाइल चुनें (Classic GST, Modern Boxed, Minimalist Retail), बिल टाइटल (Tax Invoice, Estimate, Cash Memo) बदलें, MRP व HSN कॉलम ऑन/ऑफ करें और बैंक/UPI QR कोड कस्टमाइज़ करें।
            </p>
          </div>

          <button
            onClick={() => onOpenPrintCustomizer ? onOpenPrintCustomizer() : null}
            className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-3 rounded-xl text-xs transition-all shadow-lg flex items-center space-x-2 cursor-pointer whitespace-nowrap active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Open Print Customizer (प्रीव्यू एडिट करें)</span>
          </button>
        </div>
      </div>

      {/* Extreme Risk Reset Card */}
      <div className="bg-red-50/70 border border-red-150 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none font-sans">
        <div className="space-y-1 md:max-w-xl">
          <h4 className="font-black text-red-800 text-xs flex items-center gap-1">
            <ShieldAlert className="w-4 h-4" />
            <span>DANGER ZONE</span>
          </h4>
          <p className="text-[10px] text-red-700 font-semibold leading-relaxed">
            Wiping the database sandbox resets all client profiles, trade invoices/estimates, product catalogs, and custom user credentials to factory template values. Access has no undo option.
          </p>
        </div>

        <button
          onClick={handleHardReset}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-5 rounded-xl text-xs shadow-md shadow-red-100 flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Wipe Sandboxed Database</span>
        </button>
      </div>

      {/* ----------------- MODAL: RESTORE PREVIEW & CONFIRMATION ----------------- */}
      {showRestoreModal && previewBackup && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 md:p-8 border border-slate-200 shadow-2xl space-y-6">
            
            <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-700">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-lg">
                  Restore Backup Data (डेटा बैकअप रिपोर्ट)
                </h3>
                <p className="text-xs text-slate-500 font-semibold">
                  Source: <span className="font-mono text-emerald-700 font-bold">{previewBackup.sourceName}</span>
                </p>
              </div>
            </div>

            {/* Breakdown Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200/60 p-4 rounded-2xl text-center space-y-1">
                <div className="text-2xl font-black text-emerald-700">{previewBackup.estimates.length}</div>
                <div className="text-[11px] font-extrabold text-emerald-900 uppercase tracking-wide">Invoices / Bills</div>
                <div className="text-[9px] text-emerald-600 font-semibold">बिल रिकॉर्ड्स</div>
              </div>

              <div className="bg-blue-50 border border-blue-200/60 p-4 rounded-2xl text-center space-y-1">
                <div className="text-2xl font-black text-blue-700">{previewBackup.products.length}</div>
                <div className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wide">Products</div>
                <div className="text-[9px] text-blue-600 font-semibold">आइटम्स / सामान</div>
              </div>

              <div className="bg-purple-50 border border-purple-200/60 p-4 rounded-2xl text-center space-y-1">
                <div className="text-2xl font-black text-purple-700">{previewBackup.clients.length}</div>
                <div className="text-[11px] font-extrabold text-purple-900 uppercase tracking-wide">Customers</div>
                <div className="text-[9px] text-purple-600 font-semibold">ग्राहक सूची</div>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-xs space-y-2">
              <h4 className="font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>कृपया रीस्टोर का तरीका चुनें (Select Restore Mode):</span>
              </h4>
              <ul className="text-[11px] text-amber-800 space-y-1.5 list-disc list-inside font-medium leading-relaxed">
                <li>
                  <strong>Replace All (पूरा रीस्टोर करें):</strong> वर्तमान डेटाबेस को हटाकर इस बैकअप का पूरा डेटा सेट कर देगा (सुझाया गया यदि पुराना डेटा खो गया था)।
                </li>
                <li>
                  <strong>Smart Merge (डेटा जोड़ें):</strong> बैकअप के नए बिल और आइटम्स को मौजूदा रिकॉर्ड्स में जोड़ देगा बिना किसी डुप्लिकेट के।
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowRestoreModal(false); setPreviewBackup(null); }}
                className="flex-1 py-3 px-4 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                disabled={isProcessingRestore}
              >
                रद्द करें (Cancel)
              </button>

              <button
                type="button"
                onClick={() => executeRestore('merge')}
                disabled={isProcessingRestore}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Smart Merge (मर्ज करें)</span>
              </button>

              <button
                type="button"
                onClick={() => executeRestore('replace')}
                disabled={isProcessingRestore}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isProcessingRestore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                )}
                <span>⚡ Restore & Replace All</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ----------------- MODAL: ENCRYPTED BACKUP EXPORT ----------------- */}
      {showEncryptExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 border border-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-purple-700">
              <Lock className="w-5 h-5" />
              <h3 className="font-black text-slate-850 text-base">Encrypt Backup Export</h3>
            </div>
            
            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
              Enter a password to encrypt your customer lists, sales ledgers, and inventory database with 256-bit AES-GCM before saving to your device.
            </p>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Encryption Password / PIN</label>
              <input
                type="password"
                placeholder="Enter strong password..."
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:border-purple-500 text-xs"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 text-xs pt-1.5">
              <button
                type="button"
                onClick={() => { setShowEncryptExportModal(false); setExportPassphrase(''); }}
                className="px-4 py-2 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportEncryptedBackup}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Encrypted JSON</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: CREATE CLOUD RESTORE SNAPSHOT ----------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateSnapshot} className="bg-white rounded-2xl w-full max-w-sm p-6 border border-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-blue-600 animate-pulse" />
              <h3 className="font-black text-slate-850 text-base">New Cloud Restore Snapshot</h3>
            </div>
            
            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
              Name your snapshot restore point. For example: "Before restock", "After Delhi delivery".
            </p>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Snapshot Label / Name</label>
              <input
                type="text"
                placeholder="e.g. Bulk Restock June 28"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500 text-xs"
                required
              />
            </div>

            <div className="flex justify-end gap-2 text-xs pt-1.5">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setSnapshotName(''); }}
                className="px-4 py-2 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoadingPoints}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center space-x-1 disabled:opacity-50"
              >
                {isLoadingPoints && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Create Backup</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------- MODAL: PASTE RAW BACKUP CODE ----------------- */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 border border-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              <h3 className="font-black text-slate-850 text-base font-sans">Paste Backup Code / Text (बैकअप कोड पेस्ट करें)</h3>
            </div>
            
            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed font-sans">
              Paste your copied JSON or CSV backup string into the box below to inspect and restore your customer profiles, products catalog, and transaction invoices.
            </p>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 font-sans">Pasted Backup Text</label>
              <textarea
                rows={6}
                placeholder='{"clients": [...], "products": [...], "estimates": [...]}'
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono text-slate-800 outline-none focus:bg-white focus:border-indigo-500 text-[11px] leading-normal"
                required
              />
            </div>

            <div className="flex justify-end gap-2 text-xs pt-1.5">
              <button
                type="button"
                onClick={() => { setShowPasteModal(false); setPasteText(''); }}
                className="px-4 py-2 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteRestore}
                disabled={!pasteText.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center space-x-1 disabled:opacity-50 font-sans"
              >
                <span>Inspect & Restore Code</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
