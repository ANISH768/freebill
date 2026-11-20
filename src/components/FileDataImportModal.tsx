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
  Download,
  FileX,
  RefreshCw
} from 'lucide-react';

export interface ProjectDataFileItem {
  id: string;
  title: string;
  fileName: string;
  description: string;
  badge?: string;
  updatedAt?: string;
  clients: Client[];
  products: Product[];
  estimates: Estimate[];
  stockLogs?: StockLog[];
}

interface FoundDataResult {
  sourceLabel: string;
  fileName: string;
  updatedAt?: string;
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
  currentClients?: Client[];
  currentProducts?: Product[];
  currentEstimates?: Estimate[];
  currentStockLogs?: StockLog[];
  businessName?: string;
  defaultFilter?: 'all' | 'products' | 'clients' | 'estimates';
}

export default function FileDataImportModal({
  isOpen,
  onClose,
  onImportData,
  currentUsers,
  currentClients = [],
  currentProducts = [],
  currentEstimates = [],
  currentStockLogs = [],
  businessName = 'BillSync Pro'
}: FileDataImportModalProps) {
  const [searchQuery, setSearchQuery] = useState('Saved_Bills_Data.json');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [notFoundState, setNotFoundState] = useState<{ title: string; detail: string } | null>(null);
  const [foundData, setFoundData] = useState<FoundDataResult | null>(null);
  const [uploadedFileCache, setUploadedFileCache] = useState<FoundDataResult | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selection toggles for what categories to import from found data
  const [includeProducts, setIncludeProducts] = useState(true);
  const [includeClients, setIncludeClients] = useState(true);
  const [includeEstimates, setIncludeEstimates] = useState(true);

  // Helper to read the latest strict Saved_Bills_Data.json snapshot (local mirror + server file)
  const loadStrictSavedBillsFile = async (): Promise<FoundDataResult | null> => {
    let serverFile: any = null;
    try {
      const res = await fetch('/api/saved-bills-file?fileName=Saved_Bills_Data.json');
      if (res.ok) {
        const data = await res.json();
        if (data && !data.notFound && data.file) {
          serverFile = data.file;
        }
      }
    } catch {}

    let localFile: any = null;
    try {
      const localRaw = localStorage.getItem('saved_bills_file_data');
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (parsed && typeof parsed === 'object') {
          localFile = parsed;
        }
      }
    } catch {}

    // Pick whichever snapshot is newer so updates or deletions are strictly respected
    let chosen: any = null;
    if (localFile && serverFile) {
      const localTime = localFile.updatedAt ? new Date(localFile.updatedAt).getTime() : 0;
      const serverTime = serverFile.updatedAt ? new Date(serverFile.updatedAt).getTime() : 0;
      chosen = localTime >= serverTime ? localFile : serverFile;
    } else {
      chosen = localFile || serverFile;
    }

    if (!chosen || typeof chosen !== 'object') {
      return null;
    }

    const clients = Array.isArray(chosen.clients) ? chosen.clients : [];
    const products = Array.isArray(chosen.products) ? chosen.products : [];
    const estimates = Array.isArray(chosen.estimates) ? chosen.estimates : [];
    const stockLogs = Array.isArray(chosen.stockLogs) ? chosen.stockLogs : [];

    if (clients.length === 0 && products.length === 0 && estimates.length === 0) {
      return null;
    }

    return {
      sourceLabel: 'Saved_Bills_Data.json (Live Master File)',
      fileName: 'Saved_Bills_Data.json',
      updatedAt: chosen.updatedAt || new Date().toISOString(),
      clients,
      products,
      estimates,
      stockLogs
    };
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('Saved_Bills_Data.json');
      setHasSearched(false);
      setNotFoundState(null);
      setFoundData(null);
      setStatusMessage(null);
      setIncludeProducts(true);
      setIncludeClients(true);
      setIncludeEstimates(true);
      // Automatically scan Saved_Bills_Data.json on open so only actual file data (or Not Found) is shown
      void handleScanSavedBillsFile();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Directly scan Saved_Bills_Data.json — strictly shows only what is in the file, or Not Found
  const handleScanSavedBillsFile = async () => {
    setIsSearching(true);
    setStatusMessage(null);
    setNotFoundState(null);
    setFoundData(null);
    setHasSearched(true);
    setSearchQuery('Saved_Bills_Data.json');

    try {
      const strictFile = await loadStrictSavedBillsFile();

      if (!strictFile) {
        setNotFoundState({
          title: 'Not Found — Saved_Bills_Data.json में कोई डेटा नहीं मिला',
          detail: 'अभी फ़ाइल मौजूद नहीं है या फ़ाइल में कोई बिल, प्रोडक्ट या पार्टी सेव नहीं है।'
        });
      } else {
        setFoundData(strictFile);
        setIncludeProducts(strictFile.products.length > 0);
        setIncludeClients(strictFile.clients.length > 0);
        setIncludeEstimates(strictFile.estimates.length > 0);
      }
    } catch (err: any) {
      setNotFoundState({
        title: 'Not Found — File Read Error',
        detail: err?.message || 'Saved_Bills_Data.json फ़ाइल नहीं मिली।'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Search strictly inside the file or by file name — shows Not Found if file or record does not exist
  const handleSearchFileData = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rawQuery = searchQuery.trim();
    const q = rawQuery.toLowerCase();

    if (!q || q === 'saved_bills_data.json' || q === 'saved_bills_data') {
      await handleScanSavedBillsFile();
      return;
    }

    setIsSearching(true);
    setStatusMessage(null);
    setNotFoundState(null);
    setFoundData(null);
    setHasSearched(true);

    try {
      // Check if user searched for an uploaded file name
      if (uploadedFileCache && uploadedFileCache.fileName.toLowerCase() === q) {
        setFoundData(uploadedFileCache);
        setIncludeProducts(uploadedFileCache.products.length > 0);
        setIncludeClients(uploadedFileCache.clients.length > 0);
        setIncludeEstimates(uploadedFileCache.estimates.length > 0);
        return;
      }

      // If user typed a file name (.json, .csv, .txt) that is not Saved_Bills_Data.json or the uploaded file -> Not Found
      if (/\.(json|csv|txt|xml|xlsx)$/i.test(q)) {
        setNotFoundState({
          title: `Not Found — File "${rawQuery}" Not Found`,
          detail: `"${rawQuery}" नाम की कोई फ़ाइल नहीं मिली। केवल मौजूद फ़ाइल (Saved_Bills_Data.json या अपलोड की गई फ़ाइल) का डेटा ही दिखाया जाता है।`
        });
        return;
      }

      // Otherwise search inside the active file (uploaded file if present, or Saved_Bills_Data.json)
      const baseFile = uploadedFileCache || (await loadStrictSavedBillsFile());

      if (!baseFile) {
        setNotFoundState({
          title: 'Not Found — No File Available',
          detail: 'कोई फ़ाइल मौजूद नहीं है। कृपया पहले डेटा सेव करें या फ़ाइल अपलोड करें।'
        });
        return;
      }

      const matchedProducts = baseFile.products.filter(
        p =>
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.sku || '').toLowerCase().includes(q)
      );
      const matchedClients = baseFile.clients.filter(
        c =>
          String(c.name || '').toLowerCase().includes(q) ||
          String(c.phone || '').toLowerCase().includes(q) ||
          String(c.address || '').toLowerCase().includes(q)
      );
      const matchedEstimates = baseFile.estimates.filter(
        est =>
          String(est.serial || '').toLowerCase().includes(q) ||
          String(est.clientName || '').toLowerCase().includes(q) ||
          String((est as any).clientPhone || (est as any).phone || '').toLowerCase().includes(q) ||
          (Array.isArray(est.items) &&
            est.items.some(it => String(it.name || '').toLowerCase().includes(q)))
      );

      if (
        matchedProducts.length === 0 &&
        matchedClients.length === 0 &&
        matchedEstimates.length === 0
      ) {
        setNotFoundState({
          title: `Not Found — "${rawQuery}" Not Found in ${baseFile.fileName}`,
          detail: `फ़ाइल (${baseFile.fileName}) के अंदर "${rawQuery}" से जुड़ा कोई बिल, प्रोडक्ट या पार्टी डेटा नहीं मिला।`
        });
      } else {
        setFoundData({
          sourceLabel: `File Match in ${baseFile.fileName} for "${rawQuery}"`,
          fileName: baseFile.fileName,
          updatedAt: baseFile.updatedAt,
          products: matchedProducts,
          clients: matchedClients,
          estimates: matchedEstimates,
          stockLogs: baseFile.stockLogs
        });
        setIncludeProducts(matchedProducts.length > 0);
        setIncludeClients(matchedClients.length > 0);
        setIncludeEstimates(matchedEstimates.length > 0);
      }
    } catch (err: any) {
      setNotFoundState({
        title: 'Not Found',
        detail: err?.message || 'फ़ाइल में डेटा नहीं मिला।'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Parse uploaded local file (.json or .csv) and show only that file's exact data or Not Found
  const handleLocalFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMessage(null);
    setNotFoundState(null);
    setFoundData(null);
    setHasSearched(true);
    setIsSearching(true);
    setSearchQuery(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = ((event.target?.result as string) || '').replace(/^\uFEFF/, '').trim();
        if (!rawText) {
          setNotFoundState({
            title: `Not Found — "${file.name}" is Empty`,
            detail: 'चुनी गई फ़ाइल खाली है (कोई डेटा नहीं मिला)।'
          });
          return;
        }

        let parsed: any = null;
        try {
          parsed = JSON.parse(rawText);
        } catch {
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
          setNotFoundState({
            title: `Not Found — No Valid Data in "${file.name}"`,
            detail: `फ़ाइल "${file.name}" में कोई Bills, Products या Parties डेटा नहीं मिला।`
          });
          return;
        }

        const loadedResult: FoundDataResult = {
          sourceLabel: `Uploaded File: ${file.name}`,
          fileName: file.name,
          updatedAt: new Date().toISOString(),
          products: extractedProducts,
          clients: extractedClients,
          estimates: extractedEstimates,
          stockLogs: extractedStockLogs
        };

        setUploadedFileCache(loadedResult);
        setFoundData(loadedResult);
        setIncludeProducts(extractedProducts.length > 0);
        setIncludeClients(extractedClients.length > 0);
        setIncludeEstimates(extractedEstimates.length > 0);
      } catch (err: any) {
        setNotFoundState({
          title: `Not Found — Invalid File "${file.name}"`,
          detail: err?.message || 'फ़ाइल पढ़ने में त्रुटि हुई।'
        });
      } finally {
        setIsSearching(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Force sync current app state into Saved_Bills_Data.json immediately
  const handleSyncCurrentDataToFileNow = async () => {
    setIsSearching(true);
    setStatusMessage(null);
    setNotFoundState(null);
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        fileName: 'Saved_Bills_Data.json',
        businessName,
        lastSavedBillSerial:
          currentEstimates.length > 0 ? currentEstimates[currentEstimates.length - 1]?.serial : '',
        updatedAt: nowIso,
        clients: currentClients,
        products: currentProducts,
        estimates: currentEstimates,
        stockLogs: currentStockLogs
      };

      localStorage.setItem('saved_bills_file_data', JSON.stringify(payload));
      await fetch('/api/save-bill-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          replaceAll: true
        })
      }).catch(() => {});

      await handleScanSavedBillsFile();
      setStatusMessage({
        type: 'success',
        text: `✓ सारा डेटा (Bills: ${currentEstimates.length}, Products: ${currentProducts.length}, Parties: ${currentClients.length}) Saved_Bills_Data.json में सेव और अपडेट हो गया!`
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'फ़ाइल अपडेट करने में समस्या आई।'
      });
    } finally {
      setIsSearching(false);
    }
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
    const source = foundData || {
      fileName: 'Saved_Bills_Data.json',
      updatedAt: new Date().toISOString(),
      clients: currentClients,
      products: currentProducts,
      estimates: currentEstimates,
      stockLogs: currentStockLogs
    };
    const payload = {
      fileName: 'Saved_Bills_Data.json',
      businessName,
      updatedAt: source.updatedAt || new Date().toISOString(),
      clients: source.clients,
      products: source.products,
      estimates: source.estimates,
      stockLogs: source.stockLogs || []
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
      <div className="bg-white dark:bg-slate-900 border border-[#d1d5db] dark:border-slate-800 rounded-[12px] w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Top Modal Header (Focused Element 2) */}
        <div className="bg-[#111827] text-white px-5 py-4 flex items-center justify-between border-b border-[#1f2937]">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-[8px] bg-[#2563eb] flex items-center justify-center text-white font-bold shadow-xs">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold tracking-tight text-white">
                  File Data Manager (Saved_Bills_Data.json)
                </h2>
                <span className="v2-status-badge !bg-[#16a34a] !text-white">
                  LIVE AUTO-SAVE
                </span>
              </div>
              <p className="text-[11px] text-[#94a3b8] font-medium mt-0.5">
                इसमें सिर्फ़ फ़ाइल का डेटा दिखेगा (फ़ाइल न होने पर Not Found)। सारा डेटा अपने आप एक फ़ाइल में सेव और अपडेट होता रहता है।
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-[6px] bg-[#1f2937] hover:bg-slate-700 text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body (Focused Element 1) */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-[#f0f2f5] dark:bg-slate-950">
          
          {/* Live Auto-Save Single File Status Bar */}
          <div className="v2-panel !p-0 overflow-hidden">
            <div className="v2-panel-header">
              <span className="v2-label-mono !mb-0">Master File Auto-Sync Status</span>
              <span className="font-mono text-[11px] font-bold text-[#16a34a]">
                ● Saved_Bills_Data.json
              </span>
            </div>
            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#1e293b] dark:text-white">
                  सभी Bills, Products और Parties एक ही फ़ाइल (<span className="font-mono text-[#2563eb]">Saved_Bills_Data.json</span>) में सेव और अपडेट हो रहे हैं
                </div>
                <div className="text-[11px] text-[#64748b] font-mono">
                  Live App State: {currentEstimates.length} Bills • {currentProducts.length} Products • {currentClients.length} Parties
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isSearching || isAdding}
                  onClick={handleSyncCurrentDataToFileNow}
                  className="v2-btn v2-btn-secondary !py-2 !px-3 !text-xs flex-1 sm:flex-initial"
                  title="Update Saved_Bills_Data.json with current data now"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#2563eb] ${isSearching ? 'animate-spin' : ''}`} />
                  <span>Sync File Now</span>
                </button>
                <button
                  type="button"
                  disabled={isSearching || isAdding}
                  onClick={handleScanSavedBillsFile}
                  className="v2-btn v2-btn-primary !w-auto !py-2 !px-3.5 !text-xs flex-1 sm:flex-initial"
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>Scan File</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search File or Items Inside File + Upload External File */}
          <div className="v2-panel !p-4 bg-white dark:bg-slate-900">
            <form onSubmit={handleSearchFileData} className="space-y-2.5">
              <label className="v2-label-mono">
                Search File Name or Data Inside File (Bill No, Party, Product)
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Saved_Bills_Data.json या बिल/प्रोडक्ट/पार्टी का नाम लिखें..."
                    className="v6-input-field !pl-9 font-mono text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || isAdding}
                  className="v2-btn v2-btn-primary !w-auto !py-2 !px-4 !text-xs whitespace-nowrap"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search File</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#d1d5db]/60">
                <span className="text-[11px] text-[#64748b] font-medium">
                  या अपने डिवाइस से कोई <span className="font-mono font-bold">.json / .csv</span> फ़ाइल चुनें:
                </span>
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563eb] hover:underline cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Browse Local File</span>
                  <input
                    type="file"
                    accept=".json,.csv,.txt"
                    onChange={handleLocalFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </form>
          </div>

          {/* Status Alert Banner */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-[8px] border flex items-start space-x-3 text-xs font-bold ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed">{statusMessage.text}</div>
            </div>
          )}

          {/* Loading State */}
          {isSearching && (
            <div className="v2-panel p-8 text-center flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-6 h-6 text-[#2563eb] animate-spin" />
              <span className="text-xs font-bold text-[#1e293b] dark:text-slate-200 font-mono">
                Scanning File Data...
              </span>
            </div>
          )}

          {/* STRICT NOT FOUND STATE WHEN FILE OR DATA DOES NOT EXIST */}
          {!isSearching && hasSearched && notFoundState && (
            <div className="v2-panel !border-[#dc2626] !bg-[#fef2f2] dark:!bg-red-950/30 p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 text-[#dc2626] flex items-center justify-center mx-auto">
                <FileX className="w-6 h-6" />
              </div>
              <div className="inline-block px-2.5 py-0.5 rounded bg-[#dc2626] text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                NOT FOUND
              </div>
              <h3 className="text-sm font-bold text-red-900 dark:text-red-200">
                {notFoundState.title}
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300 max-w-md mx-auto">
                {notFoundState.detail}
              </p>
              {(currentEstimates.length > 0 || currentProducts.length > 0 || currentClients.length > 0) && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSyncCurrentDataToFileNow}
                    className="v2-btn v2-btn-primary !w-auto !py-2 !px-4 !text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Save Current App Data to Saved_Bills_Data.json</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Found Data Confirmation Box — Strictly Only What Is Inside the File */}
          {!isSearching && foundData && (
            <div className="v2-panel !p-0 overflow-hidden">
              <div className="v2-panel-header">
                <div>
                  <span className="v2-label-mono !mb-0 !text-[#16a34a]">
                    ✓ FILE DATA FOUND ({foundData.fileName})
                  </span>
                  {foundData.updatedAt && (
                    <span className="text-[10px] font-mono text-[#64748b] block mt-0.5">
                      Last Updated: {new Date(foundData.updatedAt).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSavedBillsFile}
                  className="v2-btn v2-btn-secondary !py-1.5 !px-3 !text-xs"
                  title="Download Saved_Bills_Data.json"
                >
                  <Download className="w-3.5 h-3.5 text-[#2563eb]" />
                  <span>Download File</span>
                </button>
              </div>

              <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
                {/* Category Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={foundData.estimates.length === 0}
                    onClick={() => setIncludeEstimates(!includeEstimates)}
                    className={`p-3 rounded-[8px] border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      includeEstimates && foundData.estimates.length > 0
                        ? 'bg-[#2563eb] text-white border-[#2563eb]'
                        : 'bg-white dark:bg-slate-800 text-[#1e293b] dark:text-slate-200 border-[#d1d5db] dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <FileText className="w-4 h-4" />
                        <span>All Bills (बिल)</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center ${
                          includeEstimates && foundData.estimates.length > 0
                            ? 'bg-white text-[#2563eb]'
                            : 'border border-slate-400'
                        }`}
                      >
                        {includeEstimates && foundData.estimates.length > 0 && (
                          <Check className="w-3 h-3 stroke-[3]" />
                        )}
                      </div>
                    </div>
                    <div className="text-lg font-bold font-mono mt-1">
                      {foundData.estimates.length} Bills
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={foundData.products.length === 0}
                    onClick={() => setIncludeProducts(!includeProducts)}
                    className={`p-3 rounded-[8px] border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      includeProducts && foundData.products.length > 0
                        ? 'bg-[#2563eb] text-white border-[#2563eb]'
                        : 'bg-white dark:bg-slate-800 text-[#1e293b] dark:text-slate-200 border-[#d1d5db] dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Package className="w-4 h-4" />
                        <span>Products (सामान)</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center ${
                          includeProducts && foundData.products.length > 0
                            ? 'bg-white text-[#2563eb]'
                            : 'border border-slate-400'
                        }`}
                      >
                        {includeProducts && foundData.products.length > 0 && (
                          <Check className="w-3 h-3 stroke-[3]" />
                        )}
                      </div>
                    </div>
                    <div className="text-lg font-bold font-mono mt-1">
                      {foundData.products.length} Items
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={foundData.clients.length === 0}
                    onClick={() => setIncludeClients(!includeClients)}
                    className={`p-3 rounded-[8px] border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      includeClients && foundData.clients.length > 0
                        ? 'bg-[#2563eb] text-white border-[#2563eb]'
                        : 'bg-white dark:bg-slate-800 text-[#1e293b] dark:text-slate-200 border-[#d1d5db] dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Users className="w-4 h-4" />
                        <span>Parties (ग्राहक)</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center ${
                          includeClients && foundData.clients.length > 0
                            ? 'bg-white text-[#2563eb]'
                            : 'border border-slate-400'
                        }`}
                      >
                        {includeClients && foundData.clients.length > 0 && (
                          <Check className="w-3 h-3 stroke-[3]" />
                        )}
                      </div>
                    </div>
                    <div className="text-lg font-bold font-mono mt-1">
                      {foundData.clients.length} Parties
                    </div>
                  </button>
                </div>

                {/* Exact File Contents Preview */}
                <div className="bg-[#f8fafc] dark:bg-slate-950 rounded-[8px] border border-[#d1d5db] dark:border-slate-800 p-3 max-h-48 overflow-y-auto space-y-2.5 text-xs">
                  <div className="v2-label-mono !mb-1">
                    Data Inside {foundData.fileName}:
                  </div>

                  {includeEstimates && foundData.estimates.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-bold text-[#16a34a]">
                        🧾 Saved Bills ({foundData.estimates.length}):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {foundData.estimates.slice(0, 15).map((est, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-[#d1d5db] dark:border-slate-700 rounded font-mono text-[11px] font-semibold text-[#1e293b] dark:text-slate-200"
                          >
                            #{est.serial} • {est.clientName} (₹{est.grandTotal})
                          </span>
                        ))}
                        {foundData.estimates.length > 15 && (
                          <span className="px-2 py-0.5 text-[11px] font-bold text-[#2563eb]">
                            +{foundData.estimates.length - 15} more...
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {includeProducts && foundData.products.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="font-bold text-[#2563eb]">
                        📦 Saved Products ({foundData.products.length}):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {foundData.products.slice(0, 15).map((p, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-[#d1d5db] dark:border-slate-700 rounded font-mono text-[11px] font-semibold text-[#1e293b] dark:text-slate-200"
                          >
                            {p.name} (Stock: {p.stock} • ₹{p.price || p.mrp || 0})
                          </span>
                        ))}
                        {foundData.products.length > 15 && (
                          <span className="px-2 py-0.5 text-[11px] font-bold text-[#2563eb]">
                            +{foundData.products.length - 15} more...
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {includeClients && foundData.clients.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="font-bold text-[#1e293b] dark:text-slate-200">
                        👥 Saved Parties ({foundData.clients.length}):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {foundData.clients.slice(0, 15).map((c, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-[#d1d5db] dark:border-slate-700 rounded font-mono text-[11px] font-semibold text-[#1e293b] dark:text-slate-200"
                          >
                            {c.name} {c.phone ? `(+91 ${c.phone})` : ''}
                          </span>
                        ))}
                        {foundData.clients.length > 15 && (
                          <span className="px-2 py-0.5 text-[11px] font-bold text-[#2563eb]">
                            +{foundData.clients.length - 15} more...
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
                    className="v2-btn v2-btn-primary sm:flex-1 !py-2.5"
                  >
                    {isAdding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    <span>Restore All from File</span>
                  </button>

                  <button
                    type="button"
                    disabled={isAdding}
                    onClick={() => handleConfirmApplyFoundData('merge')}
                    className="v2-btn v2-btn-secondary w-full sm:w-auto !py-2.5"
                  >
                    <Plus className="w-4 h-4 text-[#2563eb]" />
                    <span>Merge into App</span>
                  </button>

                  <button
                    type="button"
                    disabled={isAdding}
                    onClick={() => {
                      setFoundData(null);
                      setHasSearched(false);
                    }}
                    className="v2-btn v2-btn-secondary w-full sm:w-auto !py-2.5 !text-[#dc2626] !border-red-200"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-white dark:bg-slate-900 px-5 py-3 border-t border-[#d1d5db] dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] font-mono text-[#64748b]">
            Auto-Save Target: Saved_Bills_Data.json
          </span>
          <button
            type="button"
            onClick={onClose}
            className="v2-btn v2-btn-secondary !py-1.5 !px-4 !text-xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
