import { useState, FormEvent, useRef, useEffect, useMemo } from 'react';
import { Product, StockLog } from '../types';
import { Search, Plus, Sparkles, Layers, Box, Keyboard, FileDown, Eye, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle, Trash2, UploadCloud, Barcode, Printer, Download } from 'lucide-react';

const CODE39_MAP: Record<string, string> = {
  '0': '101001101101',
  '1': '110100101011',
  '2': '101100101011',
  '3': '110110010101',
  '4': '101001101011',
  '5': '110100110101',
  '6': '101100110101',
  '7': '101001011011',
  '8': '110100101101',
  '9': '101100101101',
  'A': '110101001011',
  'B': '101101001011',
  'C': '110110100101',
  'D': '101011001011',
  'E': '110101100101',
  'F': '101101100101',
  'G': '101010011011',
  'H': '110101001101',
  'I': '101101001101',
  'J': '101011001101',
  'K': '110101010011',
  'L': '101101010011',
  'M': '110110101001',
  'N': '101011010011',
  'O': '110101101001',
  'P': '101101101001',
  'Q': '101010110011',
  'R': '110101011001',
  'S': '101101011001',
  'T': '101011011001',
  'U': '110010101011',
  'V': '100110101011',
  'W': '110011010101',
  'X': '100101101011',
  'Y': '110010110101',
  'Z': '100111010101',
  '-': '100101011011',
  '.': '110010101101',
  ' ': '100110101101',
  '*': '100101101101',
  '$': '100100100101',
  '/': '100100101001',
  '+': '100101001001',
  '%': '101001001001'
};

export function generateCode39Svg(value: string): string {
  const sanitized = value.toUpperCase().replace(/[^A-Z0-9\-\.\ \*\$\/\+\%]/g, '');
  const upperValue = sanitized.startsWith('*') && sanitized.endsWith('*') ? sanitized : `*${sanitized}*`;
  let pattern = '';
  for (let i = 0; i < upperValue.length; i++) {
    const char = upperValue[i];
    const code = CODE39_MAP[char] || CODE39_MAP[' '];
    pattern += code + '0';
  }
  
  let svgPaths = '';
  const barWidth = 1.6;
  const height = 45;
  let currentX = 0;
  
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      svgPaths += `<rect x="${currentX}" y="0" width="${barWidth}" height="${height}" fill="#000" />`;
    }
    currentX += barWidth;
  }
  
  return `<svg width="100%" height="100%" viewBox="0 0 ${currentX} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${svgPaths}</svg>`;
}

interface InventoryProps {
  products: Product[];
  onAddProduct: (p: Product) => void;
  onEditProduct: (p: Product) => void;
  onDeleteProduct: (id: number) => void;
  onBulkStockAdd: (adjustments: { [key: number]: number }) => void;
  onBulkRegProducts: (newProds: Product[]) => void;
  onScanBillImage: (base64Data: string) => Promise<void>;
  onBatchAddProducts?: (items: any[]) => void;
  onGlobalPriceMarkup?: (markupPct: number) => void;
  isScanning: boolean;
  stockLogs?: StockLog[];
  costFallbackPct: number;
  onUpdateCostFallbackPct: (pct: number) => void;
  userRole?: 'admin' | 'clerk';
  onOpenFileImport?: () => void;
}

export default function Inventory({
  products,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onBulkStockAdd,
  onBulkRegProducts,
  onScanBillImage,
  onBatchAddProducts,
  onGlobalPriceMarkup,
  isScanning,
  stockLogs,
  costFallbackPct,
  onUpdateCostFallbackPct,
  userRole = 'admin',
  onOpenFileImport
}: InventoryProps) {
  const [search, setSearch] = useState('');

  // Modals status
  const [showAddProdModal, setShowAddProdModal] = useState(false);
  const [showBulkStockModal, setShowBulkStockModal] = useState(false);
  const [showBulkProdModal, setShowBulkProdModal] = useState(false);
  const [showEditProdModal, setShowEditProdModal] = useState(false);
  const [showGlobalMarkupModal, setShowGlobalMarkupModal] = useState(false);
  const [globalMarkupPct, setGlobalMarkupPct] = useState<string>('10');

  // Barcode Printing states
  const [showBarcodePrintModal, setShowBarcodePrintModal] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [labelPrintCount, setLabelPrintCount] = useState(24);

  // Add Single Product States
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('Pcs');
  const [mrp, setMrp] = useState(0);
  const [price, setPrice] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [initialStock, setInitialStock] = useState(50);
  const [minStock, setMinStock] = useState(5);

  // Edit Product States
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('Pcs');
  const [editMrp, setEditMrp] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [editPurchasePrice, setEditPurchasePrice] = useState(0);
  const [editDiscount, setEditDiscount] = useState(0);
  const [editStock, setEditStock] = useState(0);
  const [editMinStock, setEditMinStock] = useState(5);

  // Toggle to show all products in bulk modal if needed
  const [showAllInBulkModal, setShowAllInBulkModal] = useState(false);

  // Bulk Stock Sheets adjustments state
  const [stockIncrements, setStockIncrements] = useState<{ [key: number]: number }>({});

  // Bulk New Products spreadsheet state
  interface BulkNewProductRow {
    tempId: string;
    name: string;
    sku: string;
    unit: string;
    mrp: number;
    price: number;
    purchasePrice: number;
    stock: number;
    discount: number;
  }
  const [bulkRows, setBulkRows] = useState<BulkNewProductRow[]>([]);

  // AI Batch Scan States
  const [showBatchScanModal, setShowBatchScanModal] = useState(false);
  const [batchWarning, setBatchWarning] = useState<string | null>(null);
  interface BatchFileState {
    id: string;
    fileName: string;
    previewUrl: string;
    base64: string;
    status: 'pending' | 'scanning' | 'success' | 'failed';
    error?: string;
    itemsFoundCount: number;
    extractedItems: any[];
    isPdf: boolean;
  }
  const [batchFiles, setBatchFiles] = useState<BatchFileState[]>([]);
  const batchFilesRef = useRef<BatchFileState[]>([]);
  useEffect(() => {
    batchFilesRef.current = batchFiles;
  }, [batchFiles]);

  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [currentScanningIndex, setCurrentScanningIndex] = useState(-1);
  const [batchScanExtractedProducts, setBatchScanExtractedProducts] = useState<any[]>([]);

  const handleBatchFileSelection = (files: FileList) => {
    setBatchWarning(null);
    const currentCount = batchFiles.length;
    const maxAllowed = 50 - currentCount;
    
    if (maxAllowed <= 0) {
      setBatchWarning("Already reached the maximum limit of 50 files!");
      return;
    }
    
    let selectedFiles = Array.from(files);
    if (selectedFiles.length > maxAllowed) {
      selectedFiles = selectedFiles.slice(0, maxAllowed);
      setBatchWarning(`File limit of 50 exceeded! Only the first ${maxAllowed} files were added.`);
    }

    const newFiles: BatchFileState[] = [];
    
    selectedFiles.forEach((file) => {
      const id = `${file.name}_${Date.now()}_${Math.random()}`;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const previewUrl = isPdf ? '' : URL.createObjectURL(file);
      const reader = new FileReader();
      
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setBatchFiles(prev => prev.map(f => f.id === id ? { ...f, base64 } : f));
      };
      reader.readAsDataURL(file);
      
      newFiles.push({
        id,
        fileName: file.name,
        previewUrl,
        base64: '',
        status: 'pending',
        itemsFoundCount: 0,
        extractedItems: [],
        isPdf
      });
    });
    
    setBatchFiles(prev => [...prev, ...newFiles]);
    setShowBatchScanModal(true);
  };

  const startBatchScanning = async () => {
    if (batchFiles.length === 0) return;
    setIsBatchScanning(true);
    
    // Reset status of non-success or failed files
    setBatchFiles(prev => prev.map(f => f.status === 'success' ? f : { ...f, status: 'pending', error: undefined }));
    
    const filesToScan = [...batchFiles];
    let allExtracted = [...batchScanExtractedProducts];
    
    for (let i = 0; i < filesToScan.length; i++) {
      const file = filesToScan[i];
      if (file.status === 'success') continue;
      
      // Spacing delay (1.5 seconds) to keep within Gemini API rate limits
      if (i > 0) {
        await new Promise(r => setTimeout(r, 1500));
      }
      
      setCurrentScanningIndex(i);
      setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'scanning' } : f));
      
      // Wait for base64 to complete reading
      let base64 = file.base64;
      if (!base64) {
        for (let attempt = 0; attempt < 50; attempt++) {
          await new Promise(r => setTimeout(r, 100));
          const refreshed = batchFilesRef.current.find(f => f.id === file.id);
          if (refreshed?.base64) {
            base64 = refreshed.base64;
            break;
          }
        }
      }
      
      if (!base64) {
        setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'failed', error: 'File base64 reading timeout' } : f));
        continue;
      }
      
      try {
        const customApiKey = localStorage.getItem("custom_gemini_api_key") || "";
        const res = await fetch("/api/scan-bill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, customApiKey })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          const items: any[] = data.items;
          
          setBatchFiles(prev => prev.map((f, idx) => idx === i ? { 
            ...f, 
            status: 'success', 
            itemsFoundCount: items.length,
            extractedItems: items 
          } : f));
          
          // Merge extracted products into our list safely
          items.forEach(item => {
            if (!item || !item.name) return;
            const cleanName = String(item.name).trim();
            if (!cleanName) return;

            const existingIdx = allExtracted.findIndex(e => e && e.name && String(e.name).trim().toLowerCase() === cleanName.toLowerCase());
            if (existingIdx >= 0) {
              allExtracted[existingIdx].stock = Number(allExtracted[existingIdx].stock || 0) + Number(item.stock || 0);
            } else {
              allExtracted.push({
                ...item,
                name: cleanName,
                tempId: `ext_${Date.now()}_${Math.floor(Math.random() * 100000)}`
              });
            }
          });
          
          setBatchScanExtractedProducts([...allExtracted]);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (err: any) {
        console.error("Batch single scan error:", err);
        setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'failed', error: err.message || 'Scan failed' } : f));
      }
    }
    
    setIsBatchScanning(false);
    setCurrentScanningIndex(-1);
  };

  const handleRemoveBatchFile = (id: string) => {
    setBatchFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleEditExtractedField = (tempId: string, field: string, value: any) => {
    setBatchScanExtractedProducts(prev => 
      prev.map(p => p.tempId === tempId ? { ...p, [field]: value } : p)
    );
  };

  const handleRemoveExtractedItem = (tempId: string) => {
    setBatchScanExtractedProducts(prev => prev.filter(p => p.tempId !== tempId));
  };

  const handleCommitBatchProducts = () => {
    const validItems = batchScanExtractedProducts.filter(p => p && p.name && String(p.name).trim() !== '');
    if (validItems.length === 0) {
      alert("No valid products with a name are loaded to save!");
      return;
    }
    
    if (onBatchAddProducts) {
      onBatchAddProducts(validItems);
    }
    
    setBatchFiles([]);
    setBatchScanExtractedProducts([]);
    setShowBatchScanModal(false);
  };

  // Trigger Bulk spreadsheet modal
  const openBulkSpreadsheet = () => {
    const initRows: BulkNewProductRow[] = Array.from({ length: 5 }).map((_, i) => ({
      tempId: `temp_row_${i}_${Date.now()}`,
      name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      unit: 'Pcs',
      mrp: 0,
      price: 0,
      purchasePrice: 0,
      stock: 50,
      discount: 0
    }));
    setBulkRows(initRows);
    setShowBulkProdModal(true);
  };

  const addBulkSpreadsheetRow = () => {
    setBulkRows([
      ...bulkRows,
      {
        tempId: `temp_row_${Date.now()}_${Math.random()}`,
        name: '',
        sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
        unit: 'Pcs',
        mrp: 0,
        price: 0,
        purchasePrice: 0,
        stock: 50,
        discount: 0
      }
    ]);
  };

  const handleBulkSpreadsheetChange = (tempId: string, field: keyof BulkNewProductRow, val: string | number) => {
    setBulkRows(bulkRows.map(r => r.tempId === tempId ? { ...r, [field]: val } : r));
  };

  const saveBulkSpreadsheet = () => {
    const validRows = bulkRows.filter(r => r.name.trim() !== '' && r.price > 0);
    if (validRows.length === 0) {
      alert("Please fill out at least one product row with a valid name and sale price!");
      return;
    }

    const compiledProds: Product[] = validRows.map((r, i) => ({
      id: Date.now() + i + Math.floor(Math.random() * 100),
      name: r.name.trim(),
      sku: r.sku.trim(),
      unit: r.unit,
      mrp: (r.mrp && Number(r.mrp) > 0) ? Number(r.mrp) : 0,
      price: r.price,
      purchasePrice: r.purchasePrice || Math.round(r.price * 0.8), // automatic fallback to 80% if not set
      discount: r.discount || 0,
      stock: r.stock
    }));

    onBulkRegProducts(compiledProds);
    setShowBulkProdModal(false);
  };

  // Single Product Save
  const handleSingleProductSave = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please enter the product name!");
      return;
    }
    if (price <= 0) {
      alert("Sale rate must be greater than zero!");
      return;
    }

    const nProd: Product = {
      id: Date.now(),
      sku: sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      name: name.trim(),
      unit,
      stock: initialStock,
      mrp: mrp || 0,
      price,
      purchasePrice: purchasePrice || Math.round(price * 0.8), // automatically default to 80% if not set
      discount: discount,
      minStock: minStock
    };

    onAddProduct(nProd);
    setShowAddProdModal(false);
    setSku('');
    setName('');
    setUnit('Pcs');
    setMrp(0);
    setPrice(0);
    setPurchasePrice(0);
    setDiscount(0);
    setInitialStock(50);
    setMinStock(5);
  };

  // Edit Product Handlers
  const handleEditProductClick = (p: Product) => {
    setEditingProduct(p);
    setEditSku(p.sku);
    setEditName(p.name);
    setEditUnit(p.unit);
    setEditMrp(p.mrp || 0);
    setEditPrice(p.price);
    setEditPurchasePrice(p.purchasePrice || Math.round(p.price * 0.8));
    setEditDiscount(p.discount || 0);
    setEditStock(p.stock);
    setEditMinStock(p.minStock !== undefined ? p.minStock : 5);
    setShowEditProdModal(true);
  };

  const handleEditProductSave = (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editName.trim()) {
      alert("Please enter the product name!");
      return;
    }
    if (editPrice <= 0) {
      alert("Sale rate must be greater than zero!");
      return;
    }

    const updated: Product = {
      ...editingProduct,
      sku: editSku.trim() || editingProduct.sku,
      name: editName.trim(),
      unit: editUnit,
      mrp: editMrp || 0,
      price: editPrice,
      purchasePrice: editPurchasePrice || Math.round(editPrice * 0.8),
      discount: editDiscount,
      stock: editStock,
      minStock: editMinStock
    };

    onEditProduct(updated);
    setShowEditProdModal(false);
    setEditingProduct(null);
  };

  // Bulk Stock Ledgers Save
  const handleBulkStockSave = () => {
    onBulkStockAdd(stockIncrements);
    setStockIncrements({});
    setShowBulkStockModal(false);
  };

  // Deduplicated products list
  const uniqueProducts = useMemo(() => {
    const seen = new Set<string>();
    return products.filter(p => {
      const k = (p.name || '').trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [products]);

  // Filtered Products List (memoized with multi-token search for extreme speed and accuracy)
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return uniqueProducts;
    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return uniqueProducts.filter(p => {
      const combined = `${p.name || ''} ${p.sku || ''} ${p.unit || ''}`.toLowerCase();
      return tokens.every(tok => combined.includes(tok));
    });
  }, [uniqueProducts, search]);

  const lowStockProducts = useMemo(() => {
    return uniqueProducts.filter(p => p.stock <= (p.minStock !== undefined ? p.minStock : 5));
  }, [uniqueProducts]);

  // Calculate Key Inventory Performance Indicators (memoized)
  const { totalValuation, totalInvestment, totalStockVolume, potentialProfit, potentialMargin } = useMemo(() => {
    const val = uniqueProducts.reduce((acc, p) => acc + (p.stock * p.price), 0);
    const inv = uniqueProducts.reduce((acc, p) => acc + (p.stock * (p.purchasePrice || p.price * (costFallbackPct / 100))), 0);
    const vol = uniqueProducts.reduce((acc, p) => acc + p.stock, 0);
    const prof = val - inv;
    const margin = val > 0 ? (prof / val) * 100 : 0;
    return {
      totalValuation: val,
      totalInvestment: inv,
      totalStockVolume: vol,
      potentialProfit: prof,
      potentialMargin: margin
    };
  }, [uniqueProducts, costFallbackPct]);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Products & Stock Control</h2>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Manage merchandise list, unit sales prices, current stock balance levels, and fast scan bulk restocks.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto font-sans">
          {onOpenFileImport && (
            <button
              type="button"
              onClick={onOpenFileImport}
              className="flex-1 md:flex-none justify-center bg-teal-600 hover:bg-teal-700 text-white font-black py-2.5 px-4 rounded-xl text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Add products & data from saved project files or local JSON/CSV file"
            >
              <span>📂</span>
              <span>Add File Data (फ़ाइल डेटा जोड़ें)</span>
            </button>
          )}
          {userRole !== 'clerk' && (
            <button
              type="button"
              onClick={() => {
                setGlobalMarkupPct('10');
                setShowGlobalMarkupModal(true);
              }}
              className="flex-1 md:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>💹</span>
              <span>Global Price Markup</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => { setStockIncrements({}); setShowBulkStockModal(true); }}
            className="flex-1 md:flex-none justify-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <span>📈</span>
            <span>Bulk Stock Update</span>
          </button>
          
          <button
            type="button"
            onClick={openBulkSpreadsheet}
            className="flex-1 md:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Keyboard className="w-4 h-4" />
            <span>Excel Add Bulk</span>
          </button>

          <label className={`flex-1 md:flex-none justify-center bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md shadow-purple-100 flex items-center space-x-2 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer text-center ${isScanning || isBatchScanning ? 'opacity-50 pointer-events-none' : ''}`}>
            <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
            <span>AI Batch Scan (Max 50 Photo/PDF)</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              disabled={isScanning || isBatchScanning}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleBatchFileSelection(e.target.files);
                  e.target.value = ''; // clear
                }
              }}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowAddProdModal(true)}
            className="flex-1 md:flex-none justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md shadow-blue-100 flex items-center space-x-1.5 transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Single Product</span>
          </button>
        </div>
      </div>

      {/* Inventory KPI & Valuation Dashboard */}
      {userRole !== 'clerk' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
          {/* Card 1: Investment vs Valuation */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative overflow-hidden group hover:border-blue-200 transition-all">
            <div className="space-y-1 z-10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Inventory Ledger Valuation
              </span>
              <div className="text-xl font-black text-slate-800 tracking-tight leading-none flex items-baseline gap-1">
                <span className="text-xs font-extrabold text-blue-600">Value:</span>
                <span>₹{totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="text-sm font-bold text-slate-550 flex items-baseline gap-1 mt-1">
                <span className="text-[10px] text-amber-600 font-semibold uppercase">Cost basis:</span>
                <span>₹{totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
              <p className="text-[9px] text-indigo-650 font-extrabold mt-1.5 block">
                Potential gross profit: <span className="underline">₹{potentialProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> ({potentialMargin.toFixed(1)}%)
              </p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl z-10">
              <Box className="w-5 h-5" />
            </div>
            <div className="absolute -right-3 -bottom-3 text-slate-50 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
              <Box className="w-24 h-24 stroke-[12]" />
            </div>
          </div>

          {/* Card 2: Total Stock Volume */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative overflow-hidden group hover:border-amber-200 transition-all">
            <div className="space-y-1 z-10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Total Stock Volume
              </span>
              <div className="text-2xl font-black text-slate-800 tracking-tight">
                {totalStockVolume.toLocaleString('en-IN')} <span className="text-xs font-semibold text-slate-400">units</span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                Overall cumulative physical stock quantity of items.
              </p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl z-10">
              <Layers className="w-5 h-5" />
            </div>
            <div className="absolute -right-3 -bottom-3 text-slate-50 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
              <Layers className="w-24 h-24 stroke-[12]" />
            </div>
          </div>

          {/* Card 3: Fallback Markup Rate */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-purple-200 transition-all">
            <div className="space-y-1 z-10 w-full">
              <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest block">
                Markup Fallback Settings
              </span>
              <div className="flex items-center justify-between">
                <span className="text-xl font-black text-slate-800 font-mono">{costFallbackPct}%</span>
                <span className="text-[10px] bg-purple-50 text-purple-700 font-extrabold px-1.5 py-0.5 rounded-full">
                  Cost portion
                </span>
              </div>
              <p className="text-[10px] text-slate-450 font-semibold leading-relaxed">
                Fallback cost is calculated as <b className="text-slate-700 font-bold">{costFallbackPct}%</b> of sales price (representing a profit margin of <b className="text-purple-650 font-extrabold">{100 - costFallbackPct}%</b>).
              </p>
            </div>
            <div className="mt-3.5 z-10 flex items-center gap-2">
              <input
                type="range"
                min="10"
                max="95"
                step="5"
                value={costFallbackPct}
                onChange={(e) => onUpdateCostFallbackPct(parseInt(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer h-1 bg-slate-100 rounded-lg"
                title="Drag to change cost fallback percentage"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 font-sans">
          {/* Card 2: Total Stock Volume for Clerk */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative overflow-hidden group hover:border-amber-200 transition-all">
            <div className="space-y-1 z-10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Total Stock Volume
              </span>
              <div className="text-2xl font-black text-slate-800 tracking-tight">
                {totalStockVolume.toLocaleString('en-IN')} <span className="text-xs font-semibold text-slate-400">units</span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                Overall cumulative physical stock quantity of items in our active database.
              </p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl z-10">
              <Layers className="w-5 h-5" />
            </div>
            <div className="absolute -right-3 -bottom-3 text-slate-50 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
              <Layers className="w-24 h-24 stroke-[12]" />
            </div>
          </div>
        </div>
      )}

      {/* Low Stock Reorder Alert Banner */}
      {lowStockProducts.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl flex flex-col gap-3 text-xs font-sans animate-fade-in shadow-xs">
          <div className="flex items-start space-x-2.5">
            <span className="text-base mt-0.5">⚠️</span>
            <div>
              <h4 className="font-extrabold text-red-900 text-sm leading-none flex items-center gap-1.5">
                Low Stock Alert
                <span className="bg-red-200 text-red-800 font-black text-[9px] px-1.5 py-0.5 rounded-full uppercase">
                  {lowStockProducts.length} Items Critically Low
                </span>
              </h4>
              <p className="text-[11px] text-red-700 font-semibold mt-1.5 leading-relaxed">
                The inventory balance of the following products is 3 units or less. Please initialize reorder actions to restock:
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {lowStockProducts.map(lp => (
                  <span key={lp.id} className="inline-flex items-center gap-1 bg-white border border-red-200 text-red-700 font-black px-2.5 py-1 rounded-xl text-[10px] font-mono shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
                    {lp.name}: <span className="underline font-extrabold text-red-800">{lp.stock} {lp.unit} left</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Input Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            placeholder="Search product name or SKU code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-100 text-xs px-4 py-2.5 pl-9 rounded-xl border border-transparent focus:border-blue-500 focus:bg-white outline-none transition-colors font-semibold placeholder:text-slate-404"
          />
        </div>
      </div>

      {/* Grid List Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden select-none">
        <div className="w-full overflow-x-auto block whitespace-nowrap custom-scrollbar">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="p-4 w-32">SKU / CODE</th>
                <th className="p-4">PRODUCT NAME</th>
                <th className="p-4">STOCK BALANCE (BAL)</th>
                <th className="p-4">UNIT</th>
                <th className="p-4 text-right">MRP PRICE</th>
                <th className="p-4 text-right">SALE PRICE</th>
                <th className="p-4 text-center w-24">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredProducts.map((p) => {
                const outOfStock = p.stock <= 0;
                const minStockLimit = p.minStock !== undefined ? p.minStock : 5;
                const lowStock = p.stock > 0 && p.stock <= minStockLimit;
                
                let stockClass = 'text-slate-800 bg-slate-100 border-slate-100';
                if (outOfStock) {
                  stockClass = 'text-red-700 bg-red-50 border-red-200 font-black';
                } else if (lowStock) {
                  stockClass = 'text-amber-805 bg-amber-50 border-amber-300 font-black';
                }

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-555">{p.sku}</td>
                    <td className="p-4 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        {outOfStock && (
                          <span className="bg-red-200 text-red-800 font-black text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                            🚨 Out of Stock
                          </span>
                        )}
                        {lowStock && (
                          <span className="bg-amber-100 border border-amber-300 text-amber-800 font-black text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                            ⚠️ Low Stock
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-block w-20 text-center px-2 py-1 rounded-lg text-[11px] font-black font-mono border ${stockClass}`}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-slate-500">{p.unit}</td>
                    <td className="p-4 text-right font-mono text-slate-400">
                      ₹{p.mrp ? p.mrp.toFixed(2) : '0.00'}
                    </td>
                    <td className="p-4 text-right font-black font-mono text-blue-950">
                      <div>₹{p.price.toFixed(2)}</div>
                      {userRole !== 'clerk' && (
                        <div className="text-[9px] text-amber-700 font-bold font-sans">Cost: ₹{(p.purchasePrice || p.price * (costFallbackPct / 100)).toFixed(2)}</div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setBarcodeProduct(p);
                            setShowBarcodePrintModal(true);
                          }}
                          title="Generate & Print Barcode"
                          className="text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 font-bold text-xs py-1 px-2 rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Barcode className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditProductClick(p)}
                          className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 font-bold text-xs py-1 px-2.5 rounded-lg border border-blue-150 transition-all cursor-pointer"
                        >
                          ✏️ Edit
                        </button>
                        {userRole !== 'clerk' && (
                          <button
                            type="button"
                            onClick={() => onDeleteProduct(p.id)}
                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 font-bold text-xs py-1 px-2.5 rounded-lg border border-red-150 transition-all cursor-pointer"
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredProducts.length === 0 && (
          <div className="p-14 text-center bg-slate-50 bg-opacity-30">
            <span className="text-3xl block mb-2">📦</span>
            <h3 className="font-bold text-slate-600 text-sm font-sans">No products found in inventory listings</h3>
          </div>
        )}
      </div>

      {/* 📜 Complete Stock & Inventory Ledger (Audit Log) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4 font-sans no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-slate-850 text-sm flex items-center gap-1.5">
              <span>📜</span>
              <span>Stock Transaction Ledger & Audit Logs</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold">
              Real-time audit trails of stock increments, sales bookings, return restorations, and custom stock edits.
            </p>
          </div>
          <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 py-1 px-3 rounded-xl font-mono">
            {stockLogs?.length || 0} Ledger Events
          </span>
        </div>

        <div className="w-full overflow-x-auto block whitespace-nowrap custom-scrollbar max-h-80 overflow-y-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest sticky top-0">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">SKU / Item</th>
                <th className="p-3 text-center">Type</th>
                <th className="p-3 text-right">Qty Changed</th>
                <th className="p-3 text-right">Balance Stock</th>
                <th className="p-3">Reference / Cause</th>
                <th className="p-3 text-right">Valuation Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {(stockLogs || []).map((log) => {
                let typeBadge = "bg-slate-50 text-slate-600 border-slate-100";
                let typeSymbol = "ℹ️";
                if (log.type === "INITIAL") {
                  typeBadge = "bg-blue-50 text-blue-700 border-blue-100";
                  typeSymbol = "📦";
                } else if (log.type === "INCOMING") {
                  typeBadge = "bg-emerald-50 text-emerald-700 border-emerald-100";
                  typeSymbol = "📥";
                } else if (log.type === "OUTGOING") {
                  typeBadge = "bg-amber-50 text-amber-700 border-amber-100";
                  typeSymbol = "📤";
                } else if (log.type === "RETURN") {
                  typeBadge = "bg-purple-50 text-purple-700 border-purple-100";
                  typeSymbol = "🔄";
                } else if (log.type === "ADJUSTMENT") {
                  typeBadge = "bg-indigo-50 text-indigo-700 border-indigo-150";
                  typeSymbol = "⚙️";
                }

                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors text-[11px]">
                    <td className="p-3 font-mono text-slate-400">{log.date}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-800 block">{log.productName}</span>
                      <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">{log.sku}</span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black border uppercase ${typeBadge}`}>
                        <span>{typeSymbol}</span>
                        <span>{log.type}</span>
                      </span>
                    </td>
                    <td className="p-3 text-right font-black font-mono text-slate-800">
                      {log.type === "OUTGOING" ? "-" : "+"}{log.qty}
                    </td>
                    <td className="p-3 text-right font-bold font-mono text-slate-600">
                      {log.newStock}
                    </td>
                    <td className="p-3 text-slate-500 font-sans italic max-w-xs truncate" title={log.reference}>
                      {log.reference}
                    </td>
                    <td className="p-3 text-right font-black font-mono text-blue-950">
                      ₹{Number(log.price).toFixed(2)}
                    </td>
                  </tr>
                );
              })}

              {(stockLogs || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 font-semibold font-sans">
                    No ledger transactions logged yet. Complete a sales transaction or restock items to populate the audit ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ----------------- MODAL: ADD SINGLE NEW PRODUCT ----------------- */}
      {showAddProdModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <form onSubmit={handleSingleProductSave} className="bg-white rounded-2xl w-full max-w-md p-6 border border-slate-10 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-800 flex items-center space-x-2">
              <Box className="w-5 h-5 text-blue-600" />
              <span>Register New Product</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-405 mb-1.5">Product Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ambuja Cement Premium"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-405 mb-1.5">SKU / Stock Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. SKU-CEMENT"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">QTY Unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="Bags">Bags</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Kgs">Kgs</option>
                    <option value="Ltr">Ltr</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">Sale Rate *</label>
                  <input
                    type="number"
                    min={1}
                    value={price || ''}
                    onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 420"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">Cost Rate</label>
                  <input
                    type="number"
                    value={purchasePrice || ''}
                    onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 380"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-405 mb-1.5">MRP Price</label>
                  <input
                    type="number"
                    value={mrp || ''}
                    onChange={(e) => setMrp(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 450"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-amber-600 mb-1.5">Discount (%)</label>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 10"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs text-amber-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">Initial Stock Balance *</label>
                  <input
                    type="number"
                    min={0}
                    value={initialStock || ''}
                    onChange={(e) => setInitialStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-amber-600 mb-1.5">Min Stock (Reorder Point)</label>
                  <input
                    type="number"
                    min={0}
                    value={minStock || ''}
                    onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowAddProdModal(false)}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl cursor-pointer font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
              >
                Save Product
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------- MODAL: BULK STOCK LEDGER INCREMENT ----------------- */}
      {showBulkStockModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 border border-slate-10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-slate-800 flex items-center space-x-2">
                <span>📈</span>
                <span>Update Bulk Stock Quantity</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAllInBulkModal(!showAllInBulkModal)}
                className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer bg-blue-50 px-2 py-1 rounded-lg"
              >
                {showAllInBulkModal ? "⚠️ Show Low/No Stock Only" : "Show All Products"}
              </button>
            </div>

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {showAllInBulkModal ? "Showing All Products Catalog" : "Showing Out-of-Stock & Low Stock Warning Items"}
            </p>

            <div className="max-h-64 overflow-y-auto border border-slate-150 rounded-xl p-3 space-y-2.5 bg-slate-50 text-xs font-semibold">
              {(() => {
                const bulkFilteredProducts = showAllInBulkModal
                  ? products
                  : products.filter(p => p.stock <= (p.minStock !== undefined ? p.minStock : 5));

                if (bulkFilteredProducts.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-500 font-bold space-y-1">
                      <div>🎉 All items are fully stocked!</div>
                      <div className="text-[10px] text-slate-400 font-normal">None of your products are out of stock or have 3 or less units.</div>
                    </div>
                  );
                }

                return bulkFilteredProducts.map(p => {
                  const addedVal = stockIncrements[p.id] || '';
                  const isOut = p.stock <= 0;
                  const isLow = p.stock > 0 && p.stock <= (p.minStock !== undefined ? p.minStock : 5);
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-white p-3 border border-slate-200/60 rounded-xl shadow-xs">
                      <div>
                        <span className="font-bold text-slate-800 block flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {isOut && (
                            <span className="bg-red-100 text-red-700 text-[8px] font-black px-1.5 py-0.5 rounded">
                              Out of Stock
                            </span>
                          )}
                          {isLow && (
                            <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded">
                              Low Stock Warning
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Current Stock: {p.stock}</span>
                      </div>
                      <input
                        type="number"
                        placeholder="+ Settle"
                        value={addedVal}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0;
                          setStockIncrements({ ...stockIncrements, [p.id]: v });
                        }}
                        className="w-20 p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-center font-bold outline-none focus:bg-white"
                      />
                    </div>
                  );
                });
              })()}
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowBulkStockModal(false)}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkStockSave}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
              >
                Update Stock Levels
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: BULK REGISTER PRODUCTS SPREADSHEET ----------------- */}
      {showBulkProdModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-3xl w-full max-w-4xl p-6 border border-slate-10 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-black text-base text-slate-850 flex items-center space-x-2">
                <span>📋</span>
                <span>Bulk Product Registry Grid</span>
              </h3>
              <button
                onClick={addBulkSpreadsheetRow}
                className="bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 font-bold px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer"
              >
                ➕ Add New Line
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-150 rounded-xl max-h-72 bg-slate-50">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-200 font-black text-slate-700 border-b">
                  <tr>
                    <th className="p-3">PRODUCT DESCRIPTION/NAME *</th>
                    <th className="p-3 w-28">SKU/BAR CODE *</th>
                    <th className="p-3 w-24">UNIT</th>
                    <th className="p-3 w-24">MRP PRICE (₹)</th>
                    <th className="p-3 w-24">SALE PRICE (₹) *</th>
                    <th className="p-3 w-24">COST PRICE (₹)</th>
                    <th className="p-3 w-20 text-center">DISCOUNT (%)</th>
                    <th className="p-3 w-20 text-center">STOCK (QTY)</th>
                    <th className="p-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 animate-fade-in">
                  {bulkRows.map((r, i) => (
                    <tr key={r.tempId} className="hover:bg-slate-100 bg-white">
                      <td className="p-2">
                        <input
                          type="text"
                          placeholder="Type product description..."
                          value={r.name}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'name', e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none font-bold bg-white focus:bg-blue-50"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={r.sku}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'sku', e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono text-slate-650 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={r.unit}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'unit', e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none font-bold bg-white cursor-pointer"
                        >
                          <option value="Bags">Bags</option>
                          <option value="Pcs">Pcs</option>
                          <option value="Boxes">Boxes</option>
                          <option value="Kgs">Kgs</option>
                          <option value="Ltr">Ltr</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={r.mrp || ''}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'mrp', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono text-right bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={r.price || ''}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono text-right font-black text-slate-800 bg-white focus:bg-blue-50"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={r.purchasePrice || ''}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'purchasePrice', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono text-right font-black text-slate-700 bg-white focus:bg-blue-50"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          placeholder="0"
                          value={r.discount || 0}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'discount', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono text-center text-amber-700 bg-white focus:bg-blue-55"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={r.stock}
                          onChange={(e) => handleBulkSpreadsheetChange(r.tempId, 'stock', parseInt(e.target.value) || 0)}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none text-center font-bold bg-white"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => setBulkRows(bulkRows.filter(row => row.tempId !== r.tempId))}
                          className="text-red-500 font-bold hover:text-red-700 p-2 cursor-pointer"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowBulkProdModal(false)}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBulkSpreadsheet}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
              >
                Register All Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: BARCODE GENERATOR & PRINT LABEL ----------------- */}
      {showBarcodePrintModal && barcodeProduct && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto no-print">
          <div className="bg-white rounded-3xl w-full max-w-4xl p-6 border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            
            {/* Header controls */}
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center space-x-2.5">
                <Barcode className="w-6 h-6 text-indigo-600 animate-pulse" />
                <div>
                  <h3 className="font-black text-sm text-slate-800 leading-none">Barcode Sticker Generator</h3>
                  <span className="text-[10px] text-slate-450 font-bold block mt-1 uppercase">A4 Sticker Sheets & Avery Sticker Configurator</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBarcodePrintModal(false);
                  setBarcodeProduct(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Configuration desk */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl text-xs font-semibold">
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1.5">Product SKU / Code</label>
                <div className="font-mono font-black text-slate-800 p-2.5 bg-white border rounded-xl">{barcodeProduct.sku}</div>
              </div>
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1.5">Stickers Per Page</label>
                <select
                  value={labelPrintCount}
                  onChange={(e) => setLabelPrintCount(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl font-bold outline-none"
                >
                  <option value={12}>12 stickers (2 cols x 6 rows)</option>
                  <option value={24}>24 stickers (3 cols x 8 rows)</option>
                  <option value={40}>40 stickers (4 cols x 10 rows)</option>
                  <option value={48}>48 stickers (4 cols x 12 rows)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('barcode-printable-area')?.innerHTML;
                    if (printContent) {
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Print Stickers - SKU ${barcodeProduct.sku}</title>
                              <script src="https://cdn.tailwindcss.com"></script>
                              <style>
                                @page { size: A4; margin: 10mm; }
                                body { margin: 0; font-family: sans-serif; background-color: #fff; }
                                .sticker-grid {
                                  display: grid;
                                  grid-template-columns: repeat(${labelPrintCount === 12 ? 2 : (labelPrintCount === 24 ? 3 : 4)}, 1fr);
                                  gap: 4mm;
                                }
                                .sticker {
                                  border: 0.1mm dashed #ddd;
                                  padding: 3mm;
                                  text-align: center;
                                  display: flex;
                                  flex-direction: column;
                                  align-items: center;
                                  justify-content: center;
                                  background: white;
                                  height: ${labelPrintCount === 12 ? '42mm' : (labelPrintCount === 24 ? '32mm' : '24mm')};
                                  page-break-inside: avoid;
                                  box-sizing: border-box;
                                }
                                .svg-container {
                                  width: 100%;
                                  height: 10mm;
                                  display: flex;
                                  align-items: center;
                                  justify-content: center;
                                  margin: 1.5mm 0;
                                }
                              </style>
                            </head>
                            <body onload="window.print(); window.close();">
                              <div class="sticker-grid">
                                ${Array.from({ length: labelPrintCount }).map(() => `
                                  <div class="sticker">
                                    <div class="text-[8px] font-black tracking-wider uppercase text-gray-400">BILLSYNC CERTIFIED STOCK</div>
                                    <div class="text-[9px] font-extrabold text-gray-800 truncate w-full" style="max-width: 45mm;">${barcodeProduct.name}</div>
                                    <div class="svg-container">
                                      <div style="width: 40mm; height: 10mm;">
                                        ${generateCode39Svg(barcodeProduct.sku)}
                                      </div>
                                    </div>
                                    <div class="w-full flex justify-between text-[8px] font-bold text-gray-500 border-t pt-1" style="border-color: #eee;">
                                      <span>SKU: ${barcodeProduct.sku}</span>
                                      <span class="text-indigo-600 font-extrabold">MRP: ₹${barcodeProduct.price.toFixed(0)}</span>
                                    </div>
                                  </div>
                                `).join('')}
                              </div>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }
                  }}
                  className="w-full bg-indigo-650 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-100 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Sticker Sheet</span>
                </button>
              </div>
            </div>

            {/* Sticker Preview Desk */}
            <div className="border border-dashed border-slate-200 bg-slate-100/50 p-6 rounded-2xl flex justify-center no-print">
              <div className="bg-white border shadow-md w-full max-w-[210mm] p-6 font-sans">
                <div className="text-center mb-4 border-b pb-2">
                  <span className="text-[10px] font-black text-slate-450 uppercase tracking-widest block">Live sticker sheets preview (24/40 stickers layouts)</span>
                </div>
                
                <div 
                  id="barcode-printable-area"
                  className={`grid gap-3 ${
                    labelPrintCount === 12 ? 'grid-cols-2' : (labelPrintCount === 24 ? 'grid-cols-3' : 'grid-cols-4')
                  }`}
                >
                  {Array.from({ length: labelPrintCount }).map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-between bg-white shadow-3xs ${
                        labelPrintCount === 12 ? 'h-[140px]' : (labelPrintCount === 24 ? 'h-[110px]' : 'h-[85px]')
                      }`}
                    >
                      {/* Brand label */}
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none truncate w-full text-center">
                        BILLSYNC CERTIFIED STOCK
                      </span>

                      {/* Product Name */}
                      <span className="text-[9px] font-extrabold text-slate-700 truncate w-full text-center mt-1 leading-none">
                        {barcodeProduct.name}
                      </span>

                      {/* Barcode SVG */}
                      <div className="w-full h-8 flex items-center justify-center my-1.5">
                        <div className="w-full h-full max-w-[120px]" dangerouslySetInnerHTML={{ __html: generateCode39Svg(barcodeProduct.sku) }} />
                      </div>

                      {/* Sticker Footer */}
                      <div className="w-full flex items-center justify-between text-[8px] font-bold text-slate-500 border-t pt-1 leading-none">
                        <span className="font-mono">SKU: {barcodeProduct.sku}</span>
                        <span className="text-indigo-650 font-black">MRP: ₹{barcodeProduct.price.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ----------------- MODAL: EDIT PRODUCT DETAILS ----------------- */}
      {showEditProdModal && editingProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <form onSubmit={handleEditProductSave} className="bg-white rounded-2xl w-full max-w-md p-6 border border-slate-10 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-800 flex items-center space-x-2">
              <Box className="w-5 h-5 text-blue-600" />
              <span>Edit Product Details</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-405 mb-1.5">Product Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ambuja Cement Premium"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-405 mb-1.5">SKU / Stock Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. SKU-CEMENT"
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">QTY Unit</label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="Bags">Bags</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Kgs">Kgs</option>
                    <option value="Ltr">Ltr</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">Sale Rate *</label>
                  <input
                    type="number"
                    min={1}
                    value={editPrice || ''}
                    onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 420"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">Cost Rate</label>
                  <input
                    type="number"
                    value={editPurchasePrice || ''}
                    onChange={(e) => setEditPurchasePrice(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 380"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-405 mb-1.5">MRP Price</label>
                  <input
                    type="number"
                    value={editMrp || ''}
                    onChange={(e) => setEditMrp(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 450"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-amber-600 mb-1.5">Discount (%)</label>
                  <input
                    type="number"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 10"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500 text-xs text-amber-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-450 mb-1.5">Stock Balance *</label>
                  <input
                    type="number"
                    min={0}
                    value={editStock || ''}
                    onChange={(e) => setEditStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-amber-600 mb-1.5">Min Stock (Reorder Point)</label>
                  <input
                    type="number"
                    min={0}
                    value={editMinStock || ''}
                    onChange={(e) => setEditMinStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono font-bold outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => { setShowEditProdModal(false); setEditingProduct(null); }}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl cursor-pointer font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------- MODAL: AI SCANNING OVERLAY ----------------- */}
      {isScanning && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 border border-slate-100 shadow-2xl text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center animate-bounce">
              <Sparkles className="w-8 h-8 text-purple-600 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-slate-800 text-lg">Analyzing Purchase Bill...</h3>
              <p className="text-xs text-slate-400 font-semibold">
                Gemini is reading the invoice, extracting all product descriptions, purchase rates, and quantities to update your stock database.
              </p>
            </div>
            <div className="flex justify-center py-2">
              <div className="flex space-x-1.5 items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-ping"></span>
                <span className="text-[11px] font-mono text-purple-700 font-black tracking-wide uppercase">AI Engine Active</span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ----------------- MODAL: AI BATCH SCANNER (MAX 50 PHOTOS) ----------------- */}
      {showBatchScanModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-950/40">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-purple-950/80 rounded-xl text-purple-400 border border-purple-900/50">
                  <ImageIcon className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">AI Multi-Photo & PDF Batch Stock Scanner</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">एक साथ 50 फोटो या पीडीएफ तक अपलोड करके सारे स्टॉक और आइटम्स को एआई से स्कैन करें।</p>
                </div>
              </div>
              
              <button 
                onClick={() => {
                  if (isBatchScanning) {
                    if (!confirm("Scanning is in progress! Do you want to stop and close?")) return;
                  }
                  setShowBatchScanModal(false);
                }}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Main Content Areas */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Top Queue Bar & Actions */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-slate-400 font-bold">BATCH QUEUE STATUS</div>
                  <div className="text-sm font-black text-slate-200 flex items-center gap-2">
                    <span>Selected: {batchFiles.length} / 50 Files</span>
                    {isBatchScanning && (
                      <span className="text-purple-400 animate-pulse flex items-center gap-1 text-xs font-semibold bg-purple-950/60 border border-purple-900 px-2.5 py-0.5 rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Scanning index {currentScanningIndex + 1}...
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="w-full md:w-80 bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                    <div 
                      className="bg-purple-500 h-full transition-all duration-300 rounded-full"
                      style={{ 
                        width: `${batchFiles.length > 0 
                          ? (batchFiles.filter(f => f.status === 'success' || f.status === 'failed').length / batchFiles.length) * 100 
                          : 0}%` 
                      }}
                    ></div>
                  </div>
                  {batchWarning && (
                    <div className="text-[11px] text-amber-400 font-semibold mt-1">
                      ⚠️ {batchWarning}
                    </div>
                  )}
                  {batchFiles.filter(f => f.status === 'failed').length > 0 && (
                    <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-xl mt-3 text-xs max-w-xl text-red-300">
                      <div className="font-bold flex items-center gap-1.5 mb-1 text-red-200">
                        <AlertCircle className="w-4 h-4 text-red-450" />
                        <span>{batchFiles.filter(f => f.status === 'failed').length} Files Failed to Scan</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-300">
                        They might have hit server rate limits or experienced transient connection issues. 
                        Clicking the <b>🚀 Start AI Scan</b> button again will automatically retry only the failed files.
                      </p>
                      {Array.from(new Set(batchFiles.filter(f => f.status === 'failed' && f.error).map(f => f.error!))).length > 0 && (
                        <div className="mt-1.5 border-t border-red-900/40 pt-1.5 text-[10px] font-mono text-red-400/95 leading-normal">
                          Error Details: {Array.from(new Set(batchFiles.filter(f => f.status === 'failed' && f.error).map(f => f.error!))).join("; ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 w-full md:w-auto text-xs">
                  <label className="flex-1 md:flex-none justify-center bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 font-bold py-3 px-4 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors">
                    <UploadCloud className="w-4 h-4 text-slate-400" />
                    <span>+ Add Photos/PDFs</span>
                    <input 
                      type="file" 
                      accept="image/*,application/pdf" 
                      multiple 
                      disabled={isBatchScanning}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleBatchFileSelection(e.target.files);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={startBatchScanning}
                    disabled={isBatchScanning || batchFiles.length === 0}
                    className="flex-1 md:flex-none justify-center bg-purple-600 hover:bg-purple-700 disabled:opacity-55 text-white font-black py-3 px-6 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg shadow-purple-900/20 cursor-pointer"
                  >
                    {isBatchScanning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                        <span>AI Scanning...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
                        <span>🚀 Start AI Scan ({batchFiles.filter(f => f.status !== 'success').length} pending)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Grid of uploaded images / files */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Files Queue ( thumbnails )</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {batchFiles.map((file, idx) => (
                    <div key={file.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex flex-col justify-between">
                      {/* Thumbnail preview */}
                      {file.isPdf ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-2 text-center select-none opacity-80">
                          <div className="p-2 bg-red-950/80 rounded-lg text-red-450 border border-red-900/40 mb-1.5 flex items-center justify-center">
                            <span className="text-[10px] font-black tracking-widest font-mono text-red-400">PDF</span>
                          </div>
                          <span className="text-[9px] text-slate-400 line-clamp-2 px-1 break-all leading-tight">
                            {file.fileName}
                          </span>
                        </div>
                      ) : (
                        <img 
                          src={file.previewUrl} 
                          alt="bill pic" 
                          className="absolute inset-0 w-full h-full object-cover opacity-60"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      
                      {/* Thumbnail gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/45"></div>

                      {/* Top bar with index and remove button */}
                      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between">
                        <span className="text-[9px] bg-slate-900/90 text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold">
                          #{idx + 1}
                        </span>
                        {!isBatchScanning && (
                          <button 
                            onClick={() => handleRemoveBatchFile(file.id)}
                            className="w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-[10px] shadow-md cursor-pointer transition-transform group-hover:scale-110"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Status indicator badge */}
                      <div className="absolute bottom-1.5 left-1.5 right-1.5">
                        {file.status === 'pending' && (
                          <div className="text-[9px] bg-slate-900/95 text-slate-400 py-1 px-1.5 rounded-lg text-center font-bold tracking-wide uppercase border border-slate-800">
                            Waiting
                          </div>
                        )}
                        {file.status === 'scanning' && (
                          <div className="text-[9px] bg-purple-950/95 text-purple-300 py-1 px-1.5 rounded-lg text-center font-bold tracking-wide uppercase border border-purple-900 flex items-center justify-center gap-1 animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-purple-400" />
                            Scanning
                          </div>
                        )}
                        {file.status === 'success' && (
                          <div className="text-[9px] bg-emerald-950/95 text-emerald-300 py-1 px-1.5 rounded-lg text-center font-bold tracking-wide uppercase border border-emerald-900 flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-450" />
                            +{file.itemsFoundCount} Items
                          </div>
                        )}
                        {file.status === 'failed' && (
                          <div className="text-[9px] bg-red-950/95 text-red-300 py-1 px-1.5 rounded-lg text-center font-bold tracking-wide uppercase border border-red-905 flex flex-col items-center justify-center" title={file.error}>
                            <div className="flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5 text-red-400" />
                              Error
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {batchFiles.length === 0 && (
                    <div className="col-span-full py-10 bg-slate-950/40 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-4">
                      <ImageIcon className="w-10 h-10 text-slate-600 mb-2.5" />
                      <div className="text-slate-400 text-xs font-bold">No Photos or PDFs Loaded in Queue</div>
                      <p className="text-[10px] text-slate-500 max-w-xs mt-1">Click the button above to upload up to 50 photos or PDFs of purchase invoices, packing slips, or bills.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Detected Items spreadsheet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Detected Products & Stock Updates ({batchScanExtractedProducts.length})</h4>
                  {batchScanExtractedProducts.length > 0 && (
                    <button
                      onClick={() => setBatchScanExtractedProducts([])}
                      className="text-[10px] text-red-450 hover:text-red-400 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Extracted List
                    </button>
                  )}
                </div>

                {batchScanExtractedProducts.length > 0 ? (
                  <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
                    <div className="overflow-x-auto max-h-[45vh]">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-bold text-[10px] sticky top-0 z-10 border-b border-slate-800/80">
                          <tr>
                            <th className="p-3">Product Name (एआई नाम)</th>
                            <th className="p-3 w-40">SKU Code</th>
                            <th className="p-3 w-28 text-center">Unit</th>
                            <th className="p-3 w-32 text-center">Stock to Add</th>
                            <th className="p-3 w-32 text-right">Sale Price</th>
                            <th className="p-3 w-32 text-right">Cost Rate</th>
                            <th className="p-3 w-32 text-right">MRP Price</th>
                            <th className="p-3 w-28 text-center">Discount (%)</th>
                            <th className="p-3 w-28 text-center">Merge Type</th>
                            <th className="p-3 w-16 text-center">✕</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-medium">
                          {batchScanExtractedProducts.map((p) => {
                            const matchedProduct = products.find(existing => existing.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                            return (
                              <tr key={p.tempId} className="hover:bg-slate-900/30 transition-colors">
                                <td className="p-2.5">
                                  <input 
                                    type="text" 
                                    value={p.name}
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'name', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-bold text-white outline-none"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input 
                                    type="text" 
                                    value={p.sku || ''}
                                    placeholder="Auto-sku"
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'sku', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-mono text-slate-300 outline-none"
                                  />
                                </td>
                                <td className="p-2.5 text-center">
                                  <select
                                    value={p.unit || 'Pcs'}
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'unit', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-bold text-slate-200 outline-none"
                                  >
                                    <option value="Pcs">Pcs</option>
                                    <option value="Bags">Bags</option>
                                    <option value="Boxes">Boxes</option>
                                    <option value="Kgs">Kgs</option>
                                    <option value="Ltr">Ltr</option>
                                  </select>
                                </td>
                                <td className="p-2.5">
                                  <input 
                                    type="number" 
                                    value={p.stock}
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'stock', parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-mono text-center text-amber-300 font-bold outline-none"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input 
                                    type="number" 
                                    value={p.price || ''}
                                    placeholder="0"
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'price', parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-mono text-right text-emerald-400 font-black outline-none"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input 
                                    type="number" 
                                    value={p.purchasePrice || p.costPrice || ''}
                                    placeholder="0"
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'purchasePrice', parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-mono text-right text-teal-400 font-semibold outline-none"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input 
                                    type="number" 
                                    value={p.mrp || ''}
                                    placeholder="0"
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'mrp', parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-mono text-right text-slate-300 outline-none"
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input 
                                    type="number" 
                                    value={p.discount !== undefined ? p.discount : 0}
                                    placeholder="0"
                                    onChange={(e) => handleEditExtractedField(p.tempId, 'discount', parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg p-2 font-mono text-center text-amber-450 font-bold outline-none"
                                  />
                                </td>
                                <td className="p-2.5 text-center">
                                  {matchedProduct ? (
                                    <span className="inline-block text-[9px] bg-blue-950 text-blue-400 font-black px-2 py-0.5 rounded border border-blue-900 uppercase tracking-wider" title={`Existing Product Stock: ${matchedProduct.stock}`}>
                                      📈 Stock ({matchedProduct.stock})
                                    </span>
                                  ) : (
                                    <span className="inline-block text-[9px] bg-emerald-950 text-emerald-400 font-black px-2 py-0.5 rounded border border-emerald-900 uppercase tracking-wider">
                                      ✨ New Item
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-center">
                                  <button
                                    onClick={() => handleRemoveExtractedItem(p.tempId)}
                                    className="text-red-500 hover:text-red-400 p-1.5 hover:bg-red-950/30 rounded-lg cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-14 bg-slate-950/20 border border-slate-800/60 rounded-2xl flex flex-col items-center justify-center text-center p-4">
                    <Sparkles className="w-8 h-8 text-slate-700 mb-2 animate-pulse" />
                    <div className="text-slate-500 text-xs font-semibold">No extracted items to display yet.</div>
                    <p className="text-[10px] text-slate-600 max-w-sm mt-0.5">Click "Start AI Scan" to begin processing your photo queue. Extracted items will populate here for review before saving.</p>
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-950/40 flex-shrink-0 text-xs">
              <div className="text-slate-400 font-semibold leading-relaxed text-center sm:text-left">
                <span>Total Items Extracted: <b className="text-purple-400 font-black font-mono">{batchScanExtractedProducts.length}</b>. </span>
                <span className="block sm:inline text-[10px]">Verify details, edit prices or quantities directly in the sheet above.</span>
              </div>
              
              <div className="flex gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isBatchScanning}
                  onClick={() => setShowBatchScanModal(false)}
                  className="flex-1 sm:flex-none justify-center px-5 py-3 border border-slate-750 hover:bg-slate-800 rounded-xl font-bold text-slate-300 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBatchScanning || batchScanExtractedProducts.length === 0}
                  onClick={handleCommitBatchProducts}
                  className="flex-1 sm:flex-none justify-center px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black rounded-xl shadow-lg shadow-purple-900/35 transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>✓ Confirm & Save All Stocks</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Global Price Markup */}
      {showGlobalMarkupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 font-sans">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <span>💹</span>
                  <span>Global Price Markup (% Increase / Adjustment)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                  Increase Sale Price and MRP across all <b className="text-slate-800 dark:text-slate-200">{uniqueProducts.length}</b> products in inventory by a specified percentage, rounded to the nearest whole Rupee (₹).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGlobalMarkupModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Percentage Input & Quick Presets */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-4 rounded-2xl">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                    Markup Percentage (%)
                  </label>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                    Applies to Sale Price &amp; MRP • Purchase Cost remains unchanged
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-36">
                    <input
                      type="number"
                      step="0.5"
                      value={globalMarkupPct}
                      onChange={(e) => setGlobalMarkupPct(e.target.value)}
                      placeholder="10"
                      className="w-full bg-white dark:bg-slate-800 border-2 border-emerald-500 rounded-xl px-3 py-2 pr-8 text-right font-mono font-black text-base text-slate-900 dark:text-white outline-none"
                      autoFocus
                    />
                    <span className="absolute right-3 top-2.5 font-mono font-black text-emerald-600 text-sm">
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Preset Percentage Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                  Quick Presets:
                </span>
                {[2, 5, 10, 12, 15, 20, 25, -5, -10].map((preset) => {
                  const active = parseFloat(globalMarkupPct) === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGlobalMarkupPct(String(preset))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : preset < 0
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {preset > 0 ? `+${preset}%` : `${preset}%`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Price Impact Preview Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-black uppercase tracking-wider text-slate-500">
                  Live Price Preview (Rounded to Nearest ₹1)
                </span>
                <span className="font-mono text-slate-400">
                  Showing {Math.min(8, uniqueProducts.length)} of {uniqueProducts.length} items
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                    <tr>
                      <th className="p-2.5">Product Name</th>
                      <th className="p-2.5 text-right">Old MRP → New MRP</th>
                      <th className="p-2.5 text-right">Old Sale → New Sale Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {uniqueProducts.slice(0, 8).map((p) => {
                      const pctVal = parseFloat(globalMarkupPct) || 0;
                      const factor = 1 + pctVal / 100;
                      const oldPrice = Number(p.price) || 0;
                      const oldMrp = Number(p.mrp) || 0;
                      const newPrice = Math.max(0, Math.round(oldPrice * factor));
                      const newMrp =
                        oldMrp > 0 ? Math.max(newPrice, Math.round(oldMrp * factor)) : newPrice;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                            {p.name}
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            <span className="text-slate-400 line-through mr-1.5">₹{oldMrp}</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">→ ₹{newMrp}</span>
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            <span className="text-slate-400 line-through mr-1.5">₹{oldPrice}</span>
                            <span className="font-black text-emerald-600 dark:text-emerald-400">
                              → ₹{newPrice}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {uniqueProducts.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-slate-400">
                          No products in inventory yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-[11px] text-slate-500 font-medium">
                All updated prices will sync automatically to local &amp; cloud storage.
              </span>
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowGlobalMarkupModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    uniqueProducts.length === 0 ||
                    !Number.isFinite(parseFloat(globalMarkupPct)) ||
                    parseFloat(globalMarkupPct) === 0
                  }
                  onClick={() => {
                    const pct = parseFloat(globalMarkupPct);
                    if (!Number.isFinite(pct) || pct === 0) return;
                    if (onGlobalPriceMarkup) {
                      onGlobalPriceMarkup(pct);
                    } else {
                      const factor = 1 + pct / 100;
                      products.forEach((p) => {
                        const oldPrice = Number(p.price) || 0;
                        const oldMrp = Number(p.mrp) || 0;
                        const newPrice = Math.max(0, Math.round(oldPrice * factor));
                        const newMrp =
                          oldMrp > 0 ? Math.max(newPrice, Math.round(oldMrp * factor)) : newPrice;
                        onEditProduct({ ...p, price: newPrice, mrp: newMrp });
                      });
                    }
                    setShowGlobalMarkupModal(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <span>✓ Apply {parseFloat(globalMarkupPct) > 0 ? `+${parseFloat(globalMarkupPct)}%` : `${parseFloat(globalMarkupPct) || 0}%`} Markup to All ({uniqueProducts.length}) Products</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
