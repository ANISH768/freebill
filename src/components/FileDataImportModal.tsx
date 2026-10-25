import React, { useState, useEffect, ChangeEvent } from 'react';
import { Client, Product, Estimate, User, StockLog } from '../types';
import {
  FolderOpen,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Search,
  Package,
  Users,
  FileText,
  X,
  Check,
  Trash2,
  FileSearch,
  RotateCcw,
  Download
} from 'lucide-react';

export interface ProjectDataFileItem {
  id: string;
  title: string;
  fileName: string;
  description: string;
  badge?: string;
  clients: Client[];
  products: Product[];
  estimates: Estimate[];
  stockLogs?: StockLog[];
}

interface FoundDataResult {
  sourceLabel: string;
  fileName: string;
  clients: Client[];
  products: Product[];
  estimates: Estimate[];
  stockLogs: StockLog[];
}

interface FileDataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportData: (payload: {
    clients: Client[];
    products: Product[];
    estimates: Estimate[];
    users: User[];
    stockLogs?: StockLog[];
    mode?: 'replace' | 'merge';
    last_synced_millis?: number;
  }) => Promise<void> | void;
  currentUsers: User[];
  defaultFilter?: 'all' | 'products' | 'clients' | 'estimates';
}

export default function FileDataImportModal({
  isOpen,
  onClose,
  onImportData,
  currentUsers
}: FileDataImportModalProps) {
  const [searchQuery, setSearchQuery] = useState('Saved_Bills_Data.json');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [foundData, setFoundData] = useState<FoundDataResult | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selection toggles for what categories to import from found data
  const [includeProducts, setIncludeProducts] = useState(true);
  const [includeClients, setIncludeClients] = useState(true);
  const [includeEstimates, setIncludeEstimates] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('Saved_Bills_Data.json');
      setHasSearched(false);
      setFoundData(null);
      setStatusMessage(null);
      setIncludeProducts(true);
      setIncludeClients(true);
      setIncludeEstimates(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Directly scan Saved_Bills_Data.json (from server + local storage) for complete data restore
  const handleScanSavedBillsFile = async () => {
    setIsSearching(true);
    setStatusMessage(null);
    setFoundData(null);
    setHasSearched(true);
    setSearchQuery('Saved_Bills_Data.json');

    try {
      const combinedProductsMap = new Map<string, Product>();
      const combinedClientsMap = new Map<string, Client>();
      const combinedEstimatesMap = new Map<string, Estimate>();
      let combinedStockLogs: StockLog[] = [];

      const mergeIntoMaps = (dataObj: any) => {
        if (!dataObj || typeof dataObj !== 'object') return;
        if (Array.isArray(dataObj.products)) {
          for (const p of dataObj.products) {
            if (p && p.name) {
              combinedProductsMap.set(String(p.name).trim().toLowerCase(), p);
            }
          }
        }
        if (Array.isArray(dataObj.clients)) {
          for (const c of dataObj.clients) {
            if (c && (c.name || c.phone)) {
              const key = `${String(c.name || '').trim().toLowerCase()}_${String(c.phone || '').trim()}`;
              combinedClientsMap.set(key, c);
            }
          }
        }
        if (Array.isArray(dataObj.estimates)) {
          for (const est of dataObj.estimates) {
            if (est && (est.serial || est.id)) {
              const key = String(est.serial || est.id).trim().toLowerCase();
              combinedEstimatesMap.set(key, est);
            }
          }
        }
        if (Array.isArray(dataObj.stockLogs) && dataObj.stockLogs.length > combinedStockLogs.length) {
          combinedStockLogs = dataObj.stockLogs;
        }
      };

      // 1. Scan server-side /api/saved-bills-file
      try {
        const res = await fetch('/api/saved-bills-file');
        if (res.ok) {
          const data = await res.json();
          if (data && data.file) {
            mergeIntoMaps(data.file);
          }
        }
      } catch {}

      // 2. Scan public /Saved_Bills_Data.json if available
      try {
        const pubRes = await fetch('/Saved_Bills_Data.json');
        if (pubRes.ok) {
          const pubData = await pubRes.json();
          mergeIntoMaps(pubData);
        }
      } catch {}

      // 3. Scan local browser mirror of Saved_Bills_Data.json (most recent bills saved on this device)
      try {
        const localRaw = localStorage.getItem('saved_bills_file_data');
        if (localRaw) {
          const localParsed = JSON.parse(localRaw);
          mergeIntoMaps(localParsed);
        }
      } catch {}

      const finalProducts = Array.from(combinedProductsMap.values());
      const finalClients = Array.from(combinedClientsMap.values());
      const finalEstimates = Array.from(combinedEstimatesMap.values());

      if (finalProducts.length === 0 && finalClients.length === 0 && finalEstimates.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'Saved_Bills_Data.json में अभी कोई डेटा नहीं मिला।'
        });
      } else {
        setFoundData({
          sourceLabel: 'Saved_Bills_Data.json (Complete Bill & Counter Backup File)',
          fileName: 'Saved_Bills_Data.json',
          products: finalProducts,
          clients: finalClients,
          estimates: finalEstimates,
          stockLogs: combinedStockLogs
        });
        setIncludeProducts(finalProducts.length > 0);
        setIncludeClients(finalClients.length > 0);
        setIncludeEstimates(finalEstimates.length > 0);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Saved_Bills_Data.json स्कैन करने में समस्या आई।'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Search files data on user action
  const handleSearchFileData = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim().toLowerCase();

    // If searching specifically for Saved_Bills_Data.json or empty query, use the dedicated Saved_Bills_Data.json scanner
    if (!q || q === 'saved_bills_data.json' || q === 'saved_bills_data') {
      await handleScanSavedBillsFile();
      return;
    }

    setIsSearching(true);
    setStatusMessage(null);
    setFoundData(null);
    setHasSearched(true);

    try {
      let allFiles: ProjectDataFileItem[] = [];
      try {
        const res = await fetch('/api/project-files');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.files)) {
            allFiles = data.files;
          }
        }
      } catch {}

      // Also include locally saved bills file (Saved_Bills_Data.json mirror)
      try {
        const localSavedBillsRaw = localStorage.getItem('saved_bills_file_data');
        if (localSavedBillsRaw) {
          const parsedLocal = JSON.parse(localSavedBillsRaw);
          if (parsedLocal && typeof parsedLocal === 'object') {
            allFiles.unshift({
              id: 'local_saved_bills_file',
              title: 'Saved Bills File (Saved_Bills_Data.json)',
              fileName: 'Saved_Bills_Data.json',
              description: 'Automatically saved bills data file',
              clients: Array.isArray(parsedLocal.clients) ? parsedLocal.clients : [],
              products: Array.isArray(parsedLocal.products) ? parsedLocal.products : [],
              estimates: Array.isArray(parsedLocal.estimates) ? parsedLocal.estimates : [],
              stockLogs: Array.isArray(parsedLocal.stockLogs) ? parsedLocal.stockLogs : []
            });
          }
        }
      } catch {}

      if (allFiles.length === 0) {
        try {
          const fallbackRes = await fetch('/BillSync_Complete_Backup.json');
          if (fallbackRes.ok) {
            const fbData = await fallbackRes.json();
            allFiles = [
              {
                id: 'complete_backup_public',
                title: 'BillSync_Complete_Backup.json',
                fileName: 'BillSync_Complete_Backup.json',
                description: 'Backup File',
                clients: Array.isArray(fbData.clients) ? fbData.clients : [],
                products: Array.isArray(fbData.products) ? fbData.products : [],
                estimates: Array.isArray(fbData.estimates) ? fbData.estimates : []
              }
            ];
          }
        } catch {}
      }

      // Deduplicate and combine all available file records
      const combinedProductsMap = new Map<string, Product>();
      const combinedClientsMap = new Map<string, Client>();
      const combinedEstimatesMap = new Map<string, Estimate>();
      let combinedStockLogs: StockLog[] = [];

      for (const file of allFiles) {
        if (Array.isArray(file.products)) {
          for (const p of file.products) {
            if (p && p.name) {
              const key = p.name.trim().toLowerCase();
              if (!combinedProductsMap.has(key)) {
                combinedProductsMap.set(key, p);
              }
            }
          }
        }
        if (Array.isArray(file.clients)) {
          for (const c of file.clients) {
            if (c && (c.name || c.phone)) {
              const key = `${(c.name || '').trim().toLowerCase()}_${(c.phone || '').trim()}`;
              if (!combinedClientsMap.has(key)) {
                combinedClientsMap.set(key, c);
              }
            }
          }
        }
        if (Array.isArray(file.estimates)) {
          for (const est of file.estimates) {
            if (est && est.serial) {
              const key = est.serial.trim().toLowerCase();
              if (!combinedEstimatesMap.has(key)) {
                combinedEstimatesMap.set(key, est);
              }
            }
          }
        }
        if (Array.isArray(file.stockLogs) && file.stockLogs.length > combinedStockLogs.length) {
          combinedStockLogs = file.stockLogs;
        }
      }

      let matchedProducts = Array.from(combinedProductsMap.values());
      let matchedClients = Array.from(combinedClientsMap.values());
      let matchedEstimates = Array.from(combinedEstimatesMap.values());

      const matchingFile = allFiles.find(
        f =>
          f.fileName.toLowerCase().includes(q) ||
          f.title.toLowerCase().includes(q)
      );

      if (matchingFile) {
        matchedProducts = matchingFile.products || [];
        matchedClients = matchingFile.clients || [];
        matchedEstimates = matchingFile.estimates || [];
      } else {
        matchedProducts = matchedProducts.filter(
          p =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q)
        );
        matchedClients = matchedClients.filter(
          c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q) ||
            (c.address || '').toLowerCase().includes(q)
        );
        matchedEstimates = matchedEstimates.filter(
          est =>
            (est.serial || '').toLowerCase().includes(q) ||
            (est.clientName || '').toLowerCase().includes(q)
        );
      }

      if (
        matchedProducts.length === 0 &&
        matchedClients.length === 0 &&
        matchedEstimates.length === 0
      ) {
        setFoundData(null);
        setStatusMessage({
          type: 'error',
          text: `"${searchQuery}" के लिए फ़ाइलों में कोई डेटा नहीं मिला।`
        });
      } else {
        setFoundData({
          sourceLabel: `Search Result for "${searchQuery}"`,
          fileName: matchingFile ? matchingFile.fileName : 'Saved_Bills_Data.json',
          products: matchedProducts,
          clients: matchedClients,
          estimates: matchedEstimates,
          stockLogs: combinedStockLogs
        });
        setIncludeProducts(matchedProducts.length > 0);
        setIncludeClients(matchedClients.length > 0);
        setIncludeEstimates(matchedEstimates.length > 0);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'फ़ाइल डेटा खोजने में समस्या आई।'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Parse uploaded local file (e.g. Saved_Bills_Data.json or .csv) and show confirmation before restoring
  const handleLocalFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMessage(null);
    setFoundData(null);
    setHasSearched(true);
    setIsSearching(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = ((event.target?.result as string) || '').replace(/^\uFEFF/, '').trim();
        if (!rawText) throw new Error('चुनी गई फ़ाइल खाली है।');

        let parsed: any = null;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          // Basic CSV parsing for products or clients
          const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const products: any[] = [];
          const clients: any[] = [];
          let section: 'products' | 'clients' = 'products';

          for (const line of lines) {
            if (line.includes('=== CUSTOMERS') || line.includes('=== CLIENTS')) {
              section = 'clients';
              continue;
            }
            if (line.includes('=== PRODUCTS') || line.includes('=== INVENTORY')) {
              section = 'products';
              continue;
            }
            if (line.startsWith('ID,') || line.startsWith('Name,') || line.startsWith('Serial Number,')) {
              continue;
            }
            const parts = line.split(',').map(s => s.replace(/^"(.*)"$/, '$1').trim());
            if (parts.length < 2) continue;

            if (section === 'clients') {
              clients.push({
                id: Number(parts[0]) || Date.now() + Math.random(),
                name: parts[1] || 'Customer',
                phone: parts[2] || '',
                gstin: parts[3] || '',
                address: parts[4] || ''
              });
            } else {
              if (parts.length >= 7) {
                products.push({
                  id: Number(parts[0]) || Date.now() + Math.random(),
                  sku: parts[1] || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
                  name: parts[2] || 'Product',
                  unit: parts[3] || 'Pcs',
                  stock: Number(parts[4]) || 0,
                  mrp: Number(parts[5]) || 0,
                  price: Number(parts[6]) || 0,
                  purchasePrice: Number(parts[7]) || Number(parts[6]) * 0.8,
                  discount: Number(parts[8]) || 0
                });
              } else {
                products.push({
                  id: Date.now() + Math.random(),
                  name: parts[0] || 'Product',
                  sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
                  price: Number(parts[1]) || 0,
                  mrp: Number(parts[2]) || Number(parts[1]) || 0,
                  stock: Number(parts[3]) || 50,
                  unit: parts[4] || 'Pcs'
                });
              }
            }
          }
          parsed = { clients, products, estimates: [] };
        }

        let extractedClients: Client[] = [];
        let extractedProducts: Product[] = [];
        let extractedEstimates: Estimate[] = [];
        let extractedStockLogs: StockLog[] = [];

        if (Array.isArray(parsed)) {
          const first = parsed[0] || {};
          if (first.serial || first.grandTotal || Array.isArray(first.items)) {
            extractedEstimates = parsed;
          } else if (
            first.sku !== undefined ||
            first.stock !== undefined ||
            first.mrp !== undefined ||
            first.price !== undefined
          ) {
            extractedProducts = parsed;
          } else if (
            first.phone !== undefined ||
            first.gstin !== undefined ||
            first.address !== undefined
          ) {
            extractedClients = parsed;
          }
        } else if (parsed && typeof parsed === 'object') {
          const root =
            parsed.backup ||
            parsed.database ||
            parsed.data ||
            parsed.syncData ||
            parsed.payload ||
            parsed;
          if (Array.isArray(root.clients || root.customers || root.parties)) {
            extractedClients = root.clients || root.customers || root.parties;
          }
          if (Array.isArray(root.products || root.items || root.inventory)) {
            extractedProducts = root.products || root.items || root.inventory;
          }
          if (Array.isArray(root.estimates || root.invoices || root.bills)) {
            extractedEstimates = root.estimates || root.invoices || root.bills;
          }
          if (Array.isArray(root.stockLogs)) {
            extractedStockLogs = root.stockLogs;
          }
        }

        if (
          extractedClients.length === 0 &&
          extractedProducts.length === 0 &&
          extractedEstimates.length === 0
        ) {
          throw new Error(`फ़ाइल "${file.name}" में कोई Products, Parties या Bills डेटा नहीं मिला।`);
        }

        setFoundData({
          sourceLabel: `Scanned File: ${file.name}`,
          fileName: file.name,
          products: extractedProducts,
          clients: extractedClients,
          estimates: extractedEstimates,
          stockLogs: extractedStockLogs
        });
        setIncludeProducts(extractedProducts.length > 0);
        setIncludeClients(extractedClients.length > 0);
        setIncludeEstimates(extractedEstimates.length > 0);
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: err?.message || 'फ़ाइल पढ़ने में त्रुटि हुई।'
        });
      } finally {
        setIsSearching(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirm restoring or merging the found data
  const handleConfirmApplyFoundData = async (mode: 'replace' | 'merge') => {
    if (!foundData) return;

    const selectedProducts = includeProducts ? foundData.products : [];
    const selectedClients = includeClients ? foundData.clients : [];
    const selectedEstimates = includeEstimates ? foundData.estimates : [];

    if (
      selectedProducts.length === 0 &&
      selectedClients.length === 0 &&
      selectedEstimates.length === 0
    ) {
      setStatusMessage({
        type: 'error',
        text: 'कृपया रीस्टोर/जोड़ने के लिए कम से कम एक डेटा श्रेणी (Products, Parties या Bills) चुनें।'
      });
      return;
    }

    setIsAdding(true);
    setStatusMessage(null);
    try {
      await onImportData({
        clients: selectedClients,
        products: selectedProducts,
        estimates: selectedEstimates,
        stockLogs: foundData.stockLogs || [],
        users: currentUsers,
        mode,
        last_synced_millis: Date.now()
      });

      const actionLabel =
        mode === 'replace'
          ? 'सारा डेटा सफलतापूर्वक रीस्टोर (Full Restore) कर दिया गया'
          : 'डेटा सफलतापूर्वक जोड़ (Merge) दिया गया';

      setStatusMessage({
        type: 'success',
        text: `✓ ${foundData.fileName} से ${actionLabel}: ${selectedProducts.length} Products, ${selectedClients.length} Parties, ${selectedEstimates.length} Bills!`
      });
      setFoundData(null);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'डेटा रीस्टोर करने में समस्या आई।'
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Download Saved_Bills_Data.json to device
  const handleDownloadSavedBillsFile = () => {
    if (!foundData) return;
    const payload = {
      fileName: 'Saved_Bills_Data.json',
      updatedAt: new Date().toISOString(),
      clients: foundData.clients,
      products: foundData.products,
      estimates: foundData.estimates,
      stockLogs: foundData.stockLogs || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Saved_Bills_Data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in select-none font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Top Modal Header */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-5 sm:p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-inner">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                Scan Saved_Bills_Data.json & Restore Data
              </h2>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Saved_Bills_Data.json स्कैन कर अपना सारा बिल, प्रोडक्ट्स और पार्टी डेटा रीस्टोर करें
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Primary 1-Click Scan Saved_Bills_Data.json Card */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50/70 to-blue-50 dark:from-emerald-950/40 dark:to-blue-950/30 border-2 border-emerald-400/80 dark:border-emerald-700 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white px-2.5 py-0.5 rounded-full">
                <span>Auto-Saved Bill File</span>
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Saved_Bills_Data.json स्कैन कर सारा डेटा रीस्टोर करें
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                जब भी नया बिल बनता है वह <span className="font-mono font-black">Saved_Bills_Data.json</span> में सेव होता है। इसे स्कैन कर पूरा डेटा वापस लाएं:
              </p>
            </div>
            <button
              type="button"
              disabled={isSearching || isAdding}
              onClick={handleScanSavedBillsFile}
              className="w-full sm:w-auto px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSearch className="w-4 h-4" />
              )}
              <span>Scan Saved_Bills_Data.json</span>
            </button>
          </div>

          {/* Search & External File Upload Bar */}
          <form onSubmit={handleSearchFileData} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Saved_Bills_Data.json या प्रोडक्ट/पार्टी का नाम लिखें..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || isAdding}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
              >
                <Search className="w-4 h-4" />
                <span>Search File Data</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                या कंप्यूटर/मोबाइल में डाउनलोड की गई <span className="font-mono font-bold">Saved_Bills_Data.json</span> फ़ाइल चुनें:
              </span>
              <label className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Browse Saved_Bills_Data.json</span>
                <input
                  type="file"
                  accept=".json,.csv,.txt"
                  onChange={handleLocalFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          </form>

          {/* Status Alert Banner */}
          {statusMessage && (
            <div
              className={`p-4 rounded-2xl border flex items-start space-x-3 text-xs font-bold animate-fade-in ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed">{statusMessage.text}</div>
            </div>
          )}

          {/* Loading State */}
          {isSearching && (
            <div className="p-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Saved_Bills_Data.json स्कैन किया जा रहा है...
              </span>
            </div>
          )}

          {/* Found Data Confirmation Box */}
          {!isSearching && foundData && (
            <div className="p-5 rounded-2xl border-2 border-emerald-400 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="inline-block bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1">
                    Scan Complete — Data Found
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    यह डेटा मिला है — क्या आप इसे रीस्टोर / जोड़ना चाहते हैं?
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
                    File: <span className="font-mono font-bold">{foundData.fileName}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSavedBillsFile}
                  className="self-start sm:self-center px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-extrabold flex items-center gap-1.5 hover:bg-slate-100 cursor-pointer"
                  title="Download Saved_Bills_Data.json"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Download File</span>
                </button>
              </div>

              {/* Select which categories of the found data to restore */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  disabled={foundData.products.length === 0}
                  onClick={() => setIncludeProducts(!includeProducts)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    includeProducts && foundData.products.length > 0
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-black text-xs">
                      <Package className="w-4 h-4" />
                      <span>Products (सामान)</span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        includeProducts && foundData.products.length > 0
                          ? 'bg-white text-blue-600'
                          : 'border border-slate-400'
                      }`}
                    >
                      {includeProducts && foundData.products.length > 0 && (
                        <Check className="w-3 h-3 stroke-[3]" />
                      )}
                    </div>
                  </div>
                  <div className="text-lg font-black mt-1">
                    {foundData.products.length} Items
                  </div>
                </button>

                <button
                  type="button"
                  disabled={foundData.clients.length === 0}
                  onClick={() => setIncludeClients(!includeClients)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    includeClients && foundData.clients.length > 0
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-black text-xs">
                      <Users className="w-4 h-4" />
                      <span>Parties (ग्राहक)</span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        includeClients && foundData.clients.length > 0
                          ? 'bg-white text-purple-600'
                          : 'border border-slate-400'
                      }`}
                    >
                      {includeClients && foundData.clients.length > 0 && (
                        <Check className="w-3 h-3 stroke-[3]" />
                      )}
                    </div>
                  </div>
                  <div className="text-lg font-black mt-1">
                    {foundData.clients.length} Parties
                  </div>
                </button>

                <button
                  type="button"
                  disabled={foundData.estimates.length === 0}
                  onClick={() => setIncludeEstimates(!includeEstimates)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    includeEstimates && foundData.estimates.length > 0
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-black text-xs">
                      <FileText className="w-4 h-4" />
                      <span>Bills (बिल)</span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        includeEstimates && foundData.estimates.length > 0
                          ? 'bg-white text-emerald-600'
                          : 'border border-slate-400'
                      }`}
                    >
                      {includeEstimates && foundData.estimates.length > 0 && (
                        <Check className="w-3 h-3 stroke-[3]" />
                      )}
                    </div>
                  </div>
                  <div className="text-lg font-black mt-1">
                    {foundData.estimates.length} Bills
                  </div>
                </button>
              </div>

              {/* Preview of found records */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 max-h-44 overflow-y-auto space-y-2 text-xs">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Saved_Bills_Data.json में मिले डेटा की झलक (Data Preview):
                </div>

                {includeEstimates && foundData.estimates.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-bold text-emerald-700 dark:text-emerald-400">
                      🧾 Saved Bills ({foundData.estimates.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {foundData.estimates.slice(0, 10).map((est, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                        >
                          #{est.serial} - {est.clientName} (₹{est.grandTotal})
                        </span>
                      ))}
                      {foundData.estimates.length > 10 && (
                        <span className="px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                          +{foundData.estimates.length - 10} more...
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {includeProducts && foundData.products.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="font-bold text-blue-700 dark:text-blue-400">
                      📦 Products ({foundData.products.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {foundData.products.slice(0, 12).map((p, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                        >
                          {p.name} (₹{p.price || p.mrp || 0})
                        </span>
                      ))}
                      {foundData.products.length > 12 && (
                        <span className="px-2 py-0.5 text-[11px] font-bold text-blue-600">
                          +{foundData.products.length - 12} more...
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {includeClients && foundData.clients.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="font-bold text-purple-700 dark:text-purple-400">
                      👥 Parties ({foundData.clients.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {foundData.clients.slice(0, 10).map((c, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                        >
                          {c.name} {c.phone ? `(${c.phone})` : ''}
                        </span>
                      ))}
                      {foundData.clients.length > 10 && (
                        <span className="px-2 py-0.5 text-[11px] font-bold text-purple-600">
                          +{foundData.clients.length - 10} more...
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Restore All / Merge / Cancel Confirmation Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isAdding}
                  onClick={() => handleConfirmApplyFoundData('replace')}
                  className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  {isAdding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                  )}
                  <span>हाँ, सारा डेटा रीस्टोर करें (Restore All Data)</span>
                </button>

                <button
                  type="button"
                  disabled={isAdding}
                  onClick={() => handleConfirmApplyFoundData('merge')}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>मौजूदा डेटा में जोड़ें (Merge)</span>
                </button>

                <button
                  type="button"
                  disabled={isAdding}
                  onClick={() => {
                    setFoundData(null);
                    setHasSearched(false);
                  }}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>नहीं (Cancel)</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-900/90 px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
