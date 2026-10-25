import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import QRCode from 'qrcode';
import { Client, Product, Estimate, InvoiceItem, SecondaryPrintStyle } from '../types';
import { getSavedPrintConfig, savePrintConfig } from '../utils/printConfig';
import { getSavedAppSettings, saveAppSettings, playBillingSuccessSound } from '../utils/appSettings';
import { 
  Plus, 
  Trash, 
  Undo2, 
  ClipboardList, 
  CheckCircle2, 
  UserPlus, 
  Gift, 
  ArrowLeft, 
  Keyboard, 
  Settings, 
  Barcode, 
  Calendar, 
  X, 
  HelpCircle, 
  Info, 
  QrCode, 
  Coins,
  Search,
  Printer,
  Layers,
  Palette
} from 'lucide-react';

export const INVOICE_THEMES: { id: SecondaryPrintStyle; name: string; desc: string; iconBadge: string }[] = [
  { id: 'estimate', name: 'Estimate', desc: 'Classic bordered A5/A4 paginated Estimate sheet (20 rows/page) with MRP, Rate & Disc%', iconBadge: '📋 Estimate' },
  { id: 'modern', name: 'Modern BillBook', desc: 'Colored header & rounded cards (MyBillBook Signature)', iconBadge: '✨ Popular' },
  { id: 'classic_gst', name: 'Classic GST Tax Invoice', desc: 'Formal GST grid, HSN table & state codes', iconBadge: '🏛️ Govt GST' },
  { id: 'minimal', name: 'Minimalist Clean', desc: 'Monochrome corporate aesthetic & hairline dividers', iconBadge: '🖋️ Clean' },
  { id: 'wholesale', name: 'Compact Retail', desc: 'High-density layout, maximum items per sheet', iconBadge: '📦 Density' },
  { id: 'stylish', name: 'Stylish Premium', desc: 'Gradient header banner & modern QR card', iconBadge: '💎 Premium' },
];

interface CreateEstimateProps {
  clients: Client[];
  products: Product[];
  editingEstimateId: number | null;
  estimates: Estimate[];
  onSaveEstimate: (estimate: Estimate, openPrint?: boolean, stayOnNewBill?: boolean) => void;
  onQuickPrintLatest?: () => void;
  onCancel: () => void;
  onAddNewClient: (client: Client) => void;
  onAddNewProduct?: (product: Product) => void;
  userRole?: 'admin' | 'clerk';
  isMobile?: boolean;
}

export const computeNextEstimateSerial = (estimatesList: Estimate[]): string => {
  let nextNum = 1;
  if (Array.isArray(estimatesList) && estimatesList.length > 0) {
    const estSerials = estimatesList
      .map(e => {
        const match = (e?.serial || '').trim().match(/^EST-(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);

    if (estSerials.length > 0) {
      nextNum = Math.max(...estSerials) + 1;
    } else {
      nextNum = estimatesList.length + 1;
    }
  }
  const paddedNum = String(nextNum).padStart(3, '0');
  return `EST-${paddedNum}`;
};

export default function CreateEstimate({
  clients,
  products,
  editingEstimateId,
  estimates,
  onSaveEstimate,
  onQuickPrintLatest,
  onCancel,
  onAddNewClient,
  onAddNewProduct,
  userRole = 'admin',
  isMobile: isMobileProp
}: CreateEstimateProps) {
  // Auto Save New Manual Items to Inventory toggle state (Default to true so manual items auto-save to Inventory)
  const [autoSaveNewItemsToInventory, setAutoSaveNewItemsToInventory] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pos_auto_save_new_inventory');
      return saved === null ? true : saved === 'true';
    } catch (e) {
      return true;
    }
  });
  // Automatic mobile size fallback
  const [isMobileLocal, setIsMobileLocal] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMobileLocal(window.innerWidth < 1024);
      const handleResize = () => setIsMobileLocal(window.innerWidth < 1024);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const isMobile = isMobileProp !== undefined ? isMobileProp : isMobileLocal;

  // Main form states
  const [serial, setSerial] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [clientId, setClientId] = useState<number | ''>('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [terms, setTerms] = useState('');

  // Calculations states
  const [taxPct, setTaxPct] = useState(0);
  const [cashDiscount, setCashDiscount] = useState(0);
  const [additionalCharges, setAdditionalCharges] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [status, setStatus] = useState<'PAID' | 'PARTIAL' | 'PENDING'>('PENDING');
  const [autoRoundOff, setAutoRoundOff] = useState(true);

  // Layout control states matching the screenshot features
  const [showTermsBlock, setShowTermsBlock] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [showTermsAndConditions, setShowTermsAndConditions] = useState(true);
  const [showPaymentQR, setShowPaymentQR] = useState(false);
  const [includePaymentQR, setIncludePaymentQR] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [showChargesInput, setShowChargesInput] = useState(false);

  // Select Invoice Theme State
  const [selectedInvoiceTheme, setSelectedInvoiceTheme] = useState<SecondaryPrintStyle>(() => {
    try {
      const saved = getSavedPrintConfig();
      return saved.secondaryStyle || 'modern';
    } catch {
      return 'modern';
    }
  });
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);
  const [autoDownloadBillFile, setAutoDownloadBillFile] = useState<boolean>(() => {
    try {
      const saved = getSavedAppSettings();
      if (saved.autoBackup?.autoDownloadBillFile !== undefined) {
        return Boolean(saved.autoBackup.autoDownloadBillFile);
      }
      return localStorage.getItem('auto_download_bill_file') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleSyncSettings = () => {
      try {
        const s = getSavedAppSettings();
        setAutoDownloadBillFile(Boolean(s.autoBackup?.autoDownloadBillFile));
      } catch {}
    };
    window.addEventListener('app_settings_updated', handleSyncSettings);
    return () => window.removeEventListener('app_settings_updated', handleSyncSettings);
  }, []);

  useEffect(() => {
    if (!showPaymentQR && !includePaymentQR) {
      setQrCodeDataUrl('');
      return;
    }
    QRCode.toDataURL('upi://pay?pa=paytmqru4d2v8mngf@paytm&pn=Paytm', {
      margin: 1,
      width: 256,
      color: {
        dark: '#0f172a', // slate-900
        light: '#ffffff'
      }
    })
    .then(url => {
      setQrCodeDataUrl(url);
    })
    .catch(err => {
      console.error('Failed to generate UPI QR code:', err);
    });
  }, [showPaymentQR, includePaymentQR]);
  
  // Custom interactive party picker
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [highlightedPartyIndex, setHighlightedPartyIndex] = useState(0);

  // Dedicated POS Item Search & Selection Modal (F2 / + Add Item)
  const [showItemSearchModal, setShowItemSearchModal] = useState(false);
  const [modalItemSearchQuery, setModalItemSearchQuery] = useState('');
  const [highlightedModalProductIndex, setHighlightedModalProductIndex] = useState(0);
  const [targetRowForCatalog, setTargetRowForCatalog] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);
  const partySearchInputRef = useRef<HTMLInputElement>(null);
  const modalItemSearchInputRef = useRef<HTMLInputElement>(null);

  // Payment terms days
  const [paymentTerms, setPaymentTerms] = useState(30);

  // Items rows interface
  interface RowState {
    id: string;
    name: string;
    hsn: string;
    qty: number;
    unit: string;
    mrp: number;
    price: number;
    disc: number;
    purchasePrice?: number;
    rowDiscountType?: 'PERCENT' | 'FLAT';
    rowDiscountVal?: number;
    isPriceCustomized?: boolean;
    isMrpCustomized?: boolean;
  }
  const [rows, setRows] = useState<RowState[]>([]);

  // Split payments states
  const [splitCash, setSplitCash] = useState(0);
  const [splitUpi, setSplitUpi] = useState(0);
  const [splitBank, setSplitBank] = useState(0);
  const [splitCredit, setSplitCredit] = useState(0);

  // Bill-wise flat final cash discount state
  const [flatFinalDiscount, setFlatFinalDiscount] = useState(0);

  // Modals
  const [showBulkItemModal, setShowBulkItemModal] = useState(false);
  const [bulkQuery, setBulkQuery] = useState('');
  const [selectedBulkProductIds, setSelectedBulkProductIds] = useState<number[]>([]);

  const [showFastClientModal, setShowFastClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientGst, setNewClientGst] = useState('');
  const [newClientAddr, setNewClientAddr] = useState('');

  // Barcode search simulation
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeQuery, setBarcodeQuery] = useState('');

  // Set up values when editing or creating brand new
  useEffect(() => {
    if (editingEstimateId !== null) {
      const est = estimates.find(e => e.id === editingEstimateId);
      if (est) {
        setSerial(est.serial);
        setDate(est.date);
        setDueDate(est.dueDate);
        setClientId(est.clientId);
        setDeliveryNote(est.deliveryNote);
        setTerms(est.terms);
        setTaxPct(est.taxPct);
        setCashDiscount(est.cashDiscount);
        setPaidAmount(est.paidAmount);
        setStatus(est.status);
        setFlatFinalDiscount(est.flatFinalDiscount || 0);
        setIncludePaymentQR(!!est.includePaymentQR);
        setShowPaymentQR(!!est.includePaymentQR);
        if (est.invoiceTheme) {
          setSelectedInvoiceTheme(est.invoiceTheme);
        }

        // Map rows with support for rowDiscountType and rowDiscountVal
        const mappedRows = est.items.map((it, idx) => ({
          id: `row_edit_${idx}_${Date.now()}`,
          name: it.name,
          hsn: '',
          qty: it.qty,
          unit: it.unit,
          mrp: it.mrp,
          price: it.price,
          disc: it.disc,
          rowDiscountType: it.rowDiscountType || 'PERCENT',
          rowDiscountVal: it.rowDiscountVal !== undefined ? it.rowDiscountVal : it.disc,
          purchasePrice: it.purchasePrice || it.price * 0.75
        }));
        setRows(mappedRows);

        // Load split payments
        if (est.splitPayments) {
          setSplitCash(est.splitPayments.cash || 0);
          setSplitUpi(est.splitPayments.upi || 0);
          setSplitBank(est.splitPayments.bank || 0);
          setSplitCredit(est.splitPayments.credit || 0);
        } else {
          setSplitCash(est.paidAmount || 0);
          setSplitUpi(0);
          setSplitBank(0);
          setSplitCredit(est.balanceDue || 0);
        }
        return;
      }
    }

    // New configurations
    const nextSerial = computeNextEstimateSerial(estimates);
    const today = new Date().toISOString().split('T')[0];
    setSerial(nextSerial);
    setDate(today);
    setDueDate(today);
    setClientId('');
    setPartySearch('');
    setDeliveryNote('');
    setTerms('1. Goods once sold will not be taken back or exchanged.\n2. All disputes are subject to local district jurisdiction only.');
    setTaxPct(0);
    setCashDiscount(0);
    setAdditionalCharges(0);
    setPaidAmount(0);
    setStatus('PENDING');
    setFlatFinalDiscount(0);
    setIncludePaymentQR(false);
    setShowPaymentQR(false);
    setSplitCash(0);
    setSplitUpi(0);
    setSplitBank(0);
    setSplitCredit(0);
    
    // Start with 1 empty row
    setRows([{
      id: `row_init_${Date.now()}`,
      name: '',
      hsn: '',
      qty: 1,
      unit: 'Pcs',
      mrp: 0,
      price: 0,
      disc: 0,
      rowDiscountType: 'PERCENT',
      rowDiscountVal: 0
    }]);

    setSelectedBulkProductIds([]);
    setBulkQuery('');
  }, [editingEstimateId]);

  // Keep serial auto-updated if estimates list updates while creating a new bill
  useEffect(() => {
    if (editingEstimateId === null) {
      const currentSerialClean = (serial || '').trim().toUpperCase();
      const collisionExists = estimates.some(
        e => (e.serial || '').trim().toUpperCase() === currentSerialClean
      );
      if (!currentSerialClean || collisionExists) {
        setSerial(computeNextEstimateSerial(estimates));
      }
    }
  }, [estimates, editingEstimateId, serial]);

  const resetFormForNewBill = useCallback((updatedEstimatesList: Estimate[]) => {
    const nextSerial = computeNextEstimateSerial(updatedEstimatesList);
    const today = new Date().toISOString().split('T')[0];
    setSerial(nextSerial);
    setDate(today);
    setDueDate(today);
    setClientId('');
    setPartySearch('');
    setDeliveryNote('');
    setTaxPct(0);
    setCashDiscount(0);
    setAdditionalCharges(0);
    setPaidAmount(0);
    setStatus('PENDING');
    setFlatFinalDiscount(0);
    setSplitCash(0);
    setSplitUpi(0);
    setSplitBank(0);
    setSplitCredit(0);
    setRows([{
      id: `row_init_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: '',
      hsn: '',
      qty: 1,
      unit: 'Pcs',
      mrp: 0,
      price: 0,
      disc: 0,
      rowDiscountType: 'PERCENT',
      rowDiscountVal: 0
    }]);
    setSelectedBulkProductIds([]);
    setBulkQuery('');
  }, []);

  // Auto calculate due date when date or paymentTerms changes
  useEffect(() => {
    if (date && paymentTerms !== undefined) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + Number(paymentTerms));
        const nextDateStr = d.toISOString().split('T')[0];
        setDueDate(nextDateStr);
      }
    }
  }, [date, paymentTerms]);

  // Selected client profile helper
  const selectedClientProfile = clients.find(c => c.id === Number(clientId));

  // Deduplicate products to prevent any duplicate entries from showing
  const uniqueProducts = useMemo(() => {
    const seen = new Set<string>();
    return products.filter(p => {
      const k = (p.name || '').trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [products]);

  // Smart Autocomplete Floating Dropdown for Row Item Name Inputs
  const [activeRowSuggestionId, setActiveRowSuggestionId] = useState<string | null>(null);
  const [suggestionHighlightedIndex, setSuggestionHighlightedIndex] = useState<number>(0);

  const getRowMatchingProducts = (query: string) => {
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed) {
      return uniqueProducts.slice(0, 30);
    }
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    
    // Fuzzy matching helper: checks if all characters of pattern appear in str in order
    const isSubsequence = (pattern: string, str: string) => {
      let pIdx = 0;
      let sIdx = 0;
      while (pIdx < pattern.length && sIdx < str.length) {
        if (pattern[pIdx] === str[sIdx]) {
          pIdx++;
        }
        sIdx++;
      }
      return pIdx === pattern.length;
    };

    const scored = uniqueProducts.map(p => {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const unit = (p.unit || '').toLowerCase();
      const combined = `${name} ${sku} ${unit}`;

      let score = 0;
      // Exact match
      if (name === trimmed || sku === trimmed) {
        score += 200;
      }
      // Starts with query
      else if (name.startsWith(trimmed) || sku.startsWith(trimmed)) {
        score += 150;
      }
      // Word starts with query
      else if (name.split(/\s+/).some(word => word.startsWith(trimmed))) {
        score += 100;
      }
      // Substring match of full query
      else if (combined.includes(trimmed)) {
        score += 70;
      }
      // All tokens match
      else if (tokens.every(tok => combined.includes(tok))) {
        score += 50;
      }
      // Subsequence / fuzzy match (e.g. 'ren' matches 'ranger')
      else if (isSubsequence(trimmed, name) || isSubsequence(trimmed, sku)) {
        score += 20;
      }

      return { product: p, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);
  };

  const selectProductForRow = (rowId: string, prod: Product) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const mrpVal = (prod.mrp && Number(prod.mrp) > 0) ? Number(prod.mrp) : 0;
      const priceVal = prod.price ? Number(prod.price) : 0;
      let discVal = 0;
      if (mrpVal > priceVal && mrpVal > 0) {
        discVal = Math.round(((mrpVal - priceVal) / mrpVal) * 100);
      }
      return {
        ...r,
        name: prod.name,
        hsn: (prod as any).hsn || prod.sku || '',
        qty: r.qty && r.qty > 0 ? r.qty : 1,
        unit: prod.unit || 'Pcs',
        mrp: mrpVal,
        price: priceVal,
        disc: discVal,
        rowDiscountType: 'PERCENT',
        rowDiscountVal: discVal,
        purchasePrice: prod.purchasePrice || (priceVal * 0.75),
        isMrpCustomized: false,
        isPriceCustomized: false
      };
    }));

    setActiveRowSuggestionId(null);
    setSuggestionHighlightedIndex(0);

    setTimeout(() => {
      const qtyInput = (document.getElementById(`qty-input-${rowId}`) || document.getElementById(`qty-input-mobile-${rowId}`)) as HTMLInputElement;
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }, 60);
  };

  const lastAddRowTimeRef = useRef<number>(0);

  // Add Item Row (Always adds a single new blank row)
  const addRow = () => {
    const now = Date.now();
    if (now - lastAddRowTimeRef.current < 250) {
      return; // Debounce guard against rapid dual triggers
    }
    lastAddRowTimeRef.current = now;

    const newId = `row_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    setRows(prev => [
      ...prev,
      {
        id: newId,
        name: '',
        hsn: '',
        qty: 1,
        unit: 'Pcs',
        mrp: 0,
        price: 0,
        disc: 0,
        rowDiscountType: 'PERCENT',
        rowDiscountVal: 0
      }
    ]);

    setTimeout(() => {
      const input = (document.getElementById(`item-name-input-${newId}`) || document.getElementById(`item-name-input-mobile-${newId}`)) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 60);
  };

  const removeRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof RowState, value: string | number) => {
    const updated = rows.map(r => {
      if (r.id === id) {
        let nRow = { ...r, [field]: value };
        
        let mrpVal = Number(nRow.mrp) || 0;
        let qtyVal = Number(nRow.qty) || 0;
        let discType = nRow.rowDiscountType || 'PERCENT';

        // Do not auto-fill product details while typing; details are populated only on Enter or selection
        if (field === 'name') {
          // Only update the typed name; wait for Enter or dropdown click to populate MRP, Rate, Unit, HSN
        } else if (field === 'mrp') {
          nRow.isMrpCustomized = true;
          mrpVal = Number(value) || 0;
          const priceVal = Number(nRow.price) || 0;
          if (mrpVal > priceVal && mrpVal > 0) {
            nRow.disc = Math.round(((mrpVal - priceVal) / mrpVal) * 100);
            nRow.rowDiscountVal = nRow.disc;
            nRow.rowDiscountType = 'PERCENT';
          } else {
            nRow.disc = 0;
            nRow.rowDiscountVal = 0;
          }
        } else if (field === 'price') {
          nRow.isPriceCustomized = true;
          const priceVal = Number(value) || 0;
          if (mrpVal > 0) {
            if (mrpVal > priceVal) {
              nRow.disc = Math.round(((mrpVal - priceVal) / mrpVal) * 100);
              nRow.rowDiscountVal = nRow.disc;
              nRow.rowDiscountType = 'PERCENT';
            } else {
              nRow.disc = 0;
              nRow.rowDiscountVal = 0;
            }
          } else {
            nRow.disc = 0;
            nRow.rowDiscountVal = 0;
          }
        } else if (field === 'disc') {
          const discVal = Number(value) || 0;
          nRow.rowDiscountVal = discVal;
          nRow.rowDiscountType = 'PERCENT';
          if (mrpVal > 0) {
            nRow.price = Math.round(mrpVal * (1 - discVal / 100) * 100) / 100;
          }
        } else if (field === 'rowDiscountVal') {
          const discVal = Number(value) || 0;
          if (discType === 'PERCENT') {
            nRow.disc = discVal;
            if (mrpVal > 0) {
              nRow.price = Math.round(mrpVal * (1 - discVal / 100) * 100) / 100;
            }
          } else {
            // FLAT discount
            if (mrpVal > 0) {
              const totalMrp = mrpVal * (qtyVal || 1);
              nRow.disc = totalMrp > 0 ? Math.round((discVal / totalMrp) * 100) : 0;
              const itemDisc = qtyVal > 0 ? discVal / qtyVal : 0;
              nRow.price = Math.max(0, Math.round((mrpVal - itemDisc) * 100) / 100);
            } else {
              nRow.disc = 0;
            }
          }
        } else if (field === 'rowDiscountType') {
          const newType = value as 'PERCENT' | 'FLAT';
          const currentVal = Number(nRow.rowDiscountVal) || 0;
          if (newType === 'PERCENT') {
            nRow.disc = currentVal;
            if (mrpVal > 0) {
              nRow.price = Math.round(mrpVal * (1 - currentVal / 100) * 100) / 100;
            }
          } else {
            // FLAT discount
            if (mrpVal > 0) {
              const totalMrp = mrpVal * (qtyVal || 1);
              nRow.disc = totalMrp > 0 ? Math.round((currentVal / totalMrp) * 100) : 0;
              const itemDisc = qtyVal > 0 ? currentVal / qtyVal : 0;
              nRow.price = Math.max(0, Math.round((mrpVal - itemDisc) * 100) / 100);
            } else {
              nRow.disc = 0;
            }
          }
        } else if (field === 'qty') {
          if (discType === 'FLAT' && mrpVal > 0) {
            const discVal = Number(nRow.rowDiscountVal) || 0;
            const itemDisc = (qtyVal || 1) > 0 ? discVal / (qtyVal || 1) : 0;
            nRow.price = Math.max(0, Math.round((mrpVal - itemDisc) * 100) / 100);
            const totalMrp = mrpVal * (qtyVal || 1);
            nRow.disc = totalMrp > 0 ? Math.round((discVal / totalMrp) * 100) : 0;
          }
        }
        return nRow;
      }
      return r;
    });
    setRows(updated);
  };

  // Row Subtotal Calculator using PERCENT or FLAT item-wise discount
  const getRowNetTotal = (r: RowState) => {
    const qty = Number(r.qty) || 0;
    const price = Number(r.price) || 0;
    const mrp = Number(r.mrp) || 0;
    const discType = r.rowDiscountType || 'PERCENT';
    const discVal = Number(r.rowDiscountVal !== undefined ? r.rowDiscountVal : r.disc) || 0;
    
    if (mrp > 0) {
      // If MRP is present, discount is calculated on MRP to derive the Selling price/item (price)
      // Thus, row subtotal is simply qty * price without double applying discount
      return Math.max(0, qty * price);
    } else {
      // If no MRP is present, calculate discount from the price field
      let total = qty * price;
      if (discType === 'PERCENT') {
        total = total * (1 - discVal / 100);
      } else {
        total = Math.max(0, total - discVal);
      }
      return Math.max(0, total);
    }
  };

  // Live Calculations Summary with auto-rounding and additional charges matching the screen
  const invoiceCalculations = (() => {
    let subtotal = 0;
    let totalQty = 0;
    rows.forEach(r => {
      if (r.name.trim() !== '' || Number(r.price) > 0 || Number(r.mrp) > 0) {
        subtotal += getRowNetTotal(r);
        totalQty += Number(r.qty) || 0;
      }
    });

    const taxAmt = subtotal * (taxPct / 100);
    const rawGrandTotal = Math.max(0, (subtotal + taxAmt + additionalCharges) - cashDiscount - flatFinalDiscount);
    
    let grandTotal = rawGrandTotal;
    let roundOffDiff = 0;
    if (autoRoundOff) {
      grandTotal = Math.round(rawGrandTotal);
      roundOffDiff = grandTotal - rawGrandTotal;
    }

    const balanceDue = Math.max(0, grandTotal - paidAmount);

    return {
      subtotal,
      totalQty,
      taxAmt,
      rawGrandTotal,
      grandTotal,
      roundOffDiff,
      balanceDue
    };
  })();

  // Autoguard paid status selection on live change
  useEffect(() => {
    const calc = invoiceCalculations;
    if (paidAmount >= calc.grandTotal && calc.grandTotal > 0) {
      setStatus('PAID');
    } else if (paidAmount > 0) {
      setStatus('PARTIAL');
    } else {
      setStatus('PENDING');
    }
  }, [paidAmount, invoiceCalculations.grandTotal]);

  // Client Fast Add
  const handleClientFastSave = () => {
    if (!newClientName.trim() || !newClientPhone.trim()) {
      alert("Please enter customer name and valid phone number.");
      return;
    }
    const nClient: Client = {
      id: Date.now(),
      name: newClientName.trim(),
      phone: newClientPhone.trim(),
      gstin: newClientGst.trim(),
      address: newClientAddr.trim()
    };
    onAddNewClient(nClient);
    setClientId(nClient.id); // auto-select newly added client
    setShowFastClientModal(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientGst('');
    setNewClientAddr('');
  };

  // Bulk additions
  const handleBulkItemInject = () => {
    const selectedItems = products.filter(p => selectedBulkProductIds.includes(p.id));
    if (selectedItems.length === 0) {
      setShowBulkItemModal(false);
      return;
    }

    // Remove first row if it is completely blank
    let cleanRows = [...rows];
    if (rows.length === 1 && rows[0].name.trim() === '') {
      cleanRows = [];
    }

    const brandNewRows = selectedItems.map((p, idx) => ({
      id: `bulk_row_${idx}_${Date.now()}`,
      name: p.name,
      hsn: p.sku || '',
      qty: 1,
      unit: p.unit || 'Pcs',
      mrp: p.mrp || 0,
      price: p.price,
      disc: 0,
      purchasePrice: p.purchasePrice || p.price * 0.75
    }));

    setRows([...cleanRows, ...brandNewRows]);
    setSelectedBulkProductIds([]);
    setBulkQuery('');
    setShowBulkItemModal(false);
  };

  const handleBulkCheckboxToggle = (pId: number) => {
    if (selectedBulkProductIds.includes(pId)) {
      setSelectedBulkProductIds(selectedBulkProductIds.filter(id => id !== pId));
    } else {
      setSelectedBulkProductIds([...selectedBulkProductIds, pId]);
    }
  };

  // Barcode barcode scan injection simulation
  const handleBarcodeSearchAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeQuery.trim()) return;

    // Search by SKU/Barcode
    const foundProd = products.find(p => p.sku.toLowerCase() === barcodeQuery.trim().toLowerCase());
    if (foundProd) {
      // Remove first row if empty
      let cleanRows = [...rows];
      if (rows.length === 1 && rows[0].name.trim() === '') {
        cleanRows = [];
      }

      setRows([
        ...cleanRows,
        {
          id: `barcode_row_${Date.now()}`,
          name: foundProd.name,
          hsn: foundProd.sku || '',
          qty: 1,
          unit: foundProd.unit || 'Pcs',
          mrp: foundProd.mrp || 0,
          price: foundProd.price,
          disc: 0,
          purchasePrice: foundProd.purchasePrice || foundProd.price * 0.75
        }
      ]);
      setBarcodeQuery('');
      setShowBarcodeScanner(false);
    } else {
      alert(`Product with barcode "${barcodeQuery}" not found in inventory!`);
    }
  };

  const handleFormSaveAll = (openPrint: boolean = true, stayOnNewBill: boolean = false) => {
    if (isSubmittingRef.current) return;

    const validRows = rows.filter(r => r.name.trim() !== '' || Number(r.price) > 0 || Number(r.mrp) > 0);
    if (validRows.length === 0) {
      // If user pressed F3 / Save & Print on an empty form right after saving a bill, immediately print the latest bill
      if (openPrint && onQuickPrintLatest && estimates.length > 0 && editingEstimateId === null) {
        onQuickPrintLatest();
        return;
      }
      setShowItemSearchModal(true);
      setModalItemSearchQuery('');
      setHighlightedModalProductIndex(0);
      setTimeout(() => {
        if (modalItemSearchInputRef.current) {
          modalItemSearchInputRef.current.focus();
        }
      }, 100);
      return;
    }

    // Resolve customer: either selected clientId, matched partySearch, or Walk-in / Cash Customer
    let effectiveClientId = Number(clientId) || 0;
    let effectiveClientName = selectedClientProfile?.name || '';
    let effectiveClientPhone = selectedClientProfile?.phone || '';
    let effectiveClientAddr = selectedClientProfile?.address || '';

    if (!effectiveClientId) {
      const searchTrimmed = partySearch.trim();
      const matchedParty = searchTrimmed
        ? clients.find(
            c =>
              c.name.trim().toLowerCase() === searchTrimmed.toLowerCase() ||
              c.phone.trim() === searchTrimmed
          )
        : undefined;
      if (matchedParty) {
        effectiveClientId = matchedParty.id;
        effectiveClientName = matchedParty.name;
        effectiveClientPhone = matchedParty.phone;
        effectiveClientAddr = matchedParty.address || '';
      } else {
        effectiveClientId = 0;
        effectiveClientName = searchTrimmed || 'Cash / Walk-in Customer';
        effectiveClientPhone = '';
        effectiveClientAddr = '';
      }
    }

    isSubmittingRef.current = true;

    const savedItems: InvoiceItem[] = validRows.map(r => ({
      name: r.name.trim() || 'Item',
      sku: r.hsn || '',
      hsn: r.hsn || '',
      qty: r.qty || 1,
      unit: r.unit || 'Pcs',
      mrp: r.mrp || 0,
      price: r.price || 0,
      disc: r.disc || 0,
      rowDiscountType: r.rowDiscountType || 'PERCENT',
      rowDiscountVal: r.rowDiscountVal !== undefined ? r.rowDiscountVal : r.disc,
      total: getRowNetTotal(r),
      purchasePrice: r.purchasePrice || r.price * 0.75
    }));

    // Enforce unique EST-XXX number when creating a new bill
    let effectiveSerial = (serial || '').trim();
    if (editingEstimateId === null) {
      const hasCollision = estimates.some(
        e => (e.serial || '').trim().toUpperCase() === effectiveSerial.toUpperCase()
      );
      if (!effectiveSerial || hasCollision) {
        effectiveSerial = computeNextEstimateSerial(estimates);
      }
    }

    const finalEstimate: Estimate = {
      id: editingEstimateId || (Date.now() + Math.floor(Math.random() * 1000)),
      serial: effectiveSerial,
      date: date || new Date().toISOString().split('T')[0],
      dueDate: dueDate || date || new Date().toISOString().split('T')[0],
      clientId: effectiveClientId,
      clientName: effectiveClientName || 'Cash / Walk-in Customer',
      clientPhone: effectiveClientPhone,
      clientAddr: effectiveClientAddr,
      deliveryNote,
      terms,
      subtotal: invoiceCalculations.subtotal,
      taxPct,
      taxAmt: invoiceCalculations.taxAmt,
      cashDiscount,
      flatFinalDiscount,
      grandTotal: invoiceCalculations.grandTotal,
      paidAmount,
      balanceDue: invoiceCalculations.balanceDue,
      status,
      items: savedItems,
      splitCash: splitCash,
      splitUpi: splitUpi,
      splitBank: splitBank,
      splitCredit: invoiceCalculations.balanceDue,
      splitPayments: {
        cash: splitCash,
        upi: splitUpi,
        bank: splitBank,
        credit: invoiceCalculations.balanceDue
      },
      includePaymentQR: includePaymentQR,
      invoiceTheme: selectedInvoiceTheme
    };

    // Synchronize print template config with active selected invoice theme
    try {
      const cfg = getSavedPrintConfig();
      savePrintConfig({
        ...cfg,
        secondaryStyle: selectedInvoiceTheme
      });
    } catch (e) {
      console.error('Failed to sync print config:', e);
    }

    // If creating a new bill, immediately advance Estimate serial and clear form so duplicate EST numbers can never be saved
    if (editingEstimateId === null) {
      resetFormForNewBill([...estimates, finalEstimate]);
    }

    onSaveEstimate(finalEstimate, openPrint, stayOnNewBill);

    // Audio chime on successful bill settlement
    try {
      const appSet = getSavedAppSettings();
      if (appSet.notifications?.soundOnBilling) {
        playBillingSuccessSound();
      }
    } catch (e) {}

    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 400);
  };

  // Filtering products for Bulk Modal
  const filteredBulkProducts = uniqueProducts.filter(p =>
    p.name.toLowerCase().includes(bulkQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(bulkQuery.toLowerCase())
  );

  // Live outstanding balances for all clients (calculated across previous non-cancelled estimates)
  const clientBalances = useMemo(() => {
    const balanceMap = new Map<number | string, number>();
    if (!Array.isArray(estimates)) return balanceMap;

    estimates.forEach(est => {
      if (!est || (est as any).isCancelled) return;
      const cId = est.clientId;
      const cPhone = est.clientPhone;
      const due = Number(est.balanceDue) || 0;

      if (cId) {
        balanceMap.set(cId, (balanceMap.get(cId) || 0) + due);
      }
      if (cPhone) {
        balanceMap.set(cPhone, (balanceMap.get(cPhone) || 0) + due);
      }
    });

    return balanceMap;
  }, [estimates]);

  // Search existing clients for local dropdown (memoized & sliced for extreme performance)
  const filteredClients = useMemo(() => {
    if (!partySearch.trim()) return clients.slice(0, 50);
    const search = partySearch.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.phone.includes(search)
    ).slice(0, 50);
  }, [clients, partySearch]);

  // Search existing products for dedicated Item Selection Modal (multi-token search across all products)
  const filteredProductsForModal = useMemo(() => {
    if (!modalItemSearchQuery.trim()) return uniqueProducts;
    const tokens = modalItemSearchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return uniqueProducts.filter(p => {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const unit = (p.unit || '').toLowerCase();
      const combined = `${name} ${sku} ${unit}`;
      return tokens.every(tok => combined.includes(tok));
    });
  }, [uniqueProducts, modalItemSearchQuery]);

  const hasCustomOption = useMemo(() => {
    const query = modalItemSearchQuery.trim().toLowerCase();
    if (!query) return false;
    return !filteredProductsForModal.some(p => p.name.toLowerCase() === query);
  }, [modalItemSearchQuery, filteredProductsForModal]);

  const totalModalSelectableItems = filteredProductsForModal.length + (hasCustomOption ? 1 : 0);

  const handlePartySearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredClients.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedPartyIndex(prev => Math.min(prev + 1, filteredClients.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedPartyIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const selected = filteredClients[highlightedPartyIndex];
      if (selected) {
        setClientId(selected.id);
        setShowPartyPicker(false);
        setPartySearch('');
        setTimeout(() => {
          if (rows.length > 0) {
            const firstInput = (document.getElementById(`item-name-input-${rows[0].id}`) || document.getElementById(`item-name-input-mobile-${rows[0].id}`)) as HTMLInputElement;
            if (firstInput) {
              firstInput.focus();
              firstInput.select();
            } else {
              addRow();
            }
          } else {
            addRow();
          }
        }, 80);
      }
    } else if (e.key === 'Escape') {
      setShowPartyPicker(false);
    }
  };

  const handleAddProductFromModal = (product?: Product, customName?: string) => {
    let cleanRows = [...rows];

    // If targeting a specific row from the table
    if (targetRowForCatalog) {
      const rowIdx = cleanRows.findIndex(r => r.id === targetRowForCatalog);
      if (rowIdx !== -1) {
        if (product) {
          const mrpVal = (product.mrp && Number(product.mrp) > 0) ? Number(product.mrp) : 0;
          const priceVal = product.price || 0;
          let discVal = 0;
          if (mrpVal > priceVal && mrpVal > 0) {
            discVal = Math.round(((mrpVal - priceVal) / mrpVal) * 100);
          }
          cleanRows[rowIdx] = {
            ...cleanRows[rowIdx],
            name: product.name,
            hsn: product.sku || '',
            qty: 1,
            unit: product.unit || 'Pcs',
            mrp: mrpVal,
            price: priceVal,
            disc: discVal,
            rowDiscountType: 'PERCENT',
            rowDiscountVal: discVal,
            purchasePrice: product.purchasePrice || priceVal * 0.75
          };
        } else if (customName && customName.trim()) {
          cleanRows[rowIdx] = {
            ...cleanRows[rowIdx],
            name: customName.trim()
          };
        }
        setRows(cleanRows);
        setShowItemSearchModal(false);
        setModalItemSearchQuery('');
        setTargetRowForCatalog(null);
        return;
      }
    }

    if (cleanRows.length === 1 && cleanRows[0].name.trim() === '') {
      cleanRows = [];
    }

    const newRowId = `prod_add_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

    if (product) {
      const existingIdx = cleanRows.findIndex(r => r.name.trim().toLowerCase() === product.name.trim().toLowerCase());
      if (existingIdx !== -1) {
        cleanRows[existingIdx].qty += 1;
        setRows([...cleanRows]);
        setShowItemSearchModal(false);
        setModalItemSearchQuery('');
        setTargetRowForCatalog(null);
        const existingId = cleanRows[existingIdx].id;
        setTimeout(() => {
          const qtyInput = (document.getElementById(`qty-input-${existingId}`) || document.getElementById(`qty-input-mobile-${existingId}`)) as HTMLInputElement;
          if (qtyInput) {
            qtyInput.focus();
            qtyInput.select();
          }
        }, 80);
        return;
      }

      const mrpVal = (product.mrp && Number(product.mrp) > 0) ? Number(product.mrp) : 0;
      const priceVal = product.price || 0;
      let discVal = 0;
      if (mrpVal > priceVal && mrpVal > 0) {
        discVal = Math.round(((mrpVal - priceVal) / mrpVal) * 100);
      }

      cleanRows.push({
        id: newRowId,
        name: product.name,
        hsn: product.sku || '',
        qty: 1,
        unit: product.unit || 'Pcs',
        mrp: mrpVal,
        price: priceVal,
        disc: discVal,
        rowDiscountType: 'PERCENT',
        rowDiscountVal: discVal,
        purchasePrice: product.purchasePrice || priceVal * 0.75
      });
    } else if (customName && customName.trim()) {
      cleanRows.push({
        id: newRowId,
        name: customName.trim(),
        hsn: '',
        qty: 1,
        unit: 'Pcs',
        mrp: 0,
        price: 0,
        disc: 0,
        rowDiscountType: 'PERCENT',
        rowDiscountVal: 0
      });
    } else {
      setTargetRowForCatalog(null);
      return;
    }

    setRows(cleanRows);
    setShowItemSearchModal(false);
    setModalItemSearchQuery('');
    setTargetRowForCatalog(null);

    setTimeout(() => {
      const qtyInput = (document.getElementById(`qty-input-${newRowId}`) || document.getElementById(`qty-input-mobile-${newRowId}`)) as HTMLInputElement;
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }, 80);
  };

  const handleModalSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalModalSelectableItems > 0) {
        setHighlightedModalProductIndex(prev => Math.min(prev + 1, totalModalSelectableItems - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalModalSelectableItems > 0) {
        setHighlightedModalProductIndex(prev => Math.max(prev - 1, 0));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedModalProductIndex < filteredProductsForModal.length) {
        const selected = filteredProductsForModal[highlightedModalProductIndex];
        if (selected) {
          handleAddProductFromModal(selected);
        }
      } else if (hasCustomOption) {
        handleAddProductFromModal(undefined, modalItemSearchQuery.trim());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowItemSearchModal(false);
      setTargetRowForCatalog(null);
    }
  };

  // Stable ref to handleFormSaveAll so F3 and Ctrl+P/Ctrl+S always read fresh state
  const handleFormSaveAllRef = useRef(handleFormSaveAll);
  handleFormSaveAllRef.current = handleFormSaveAll;

  // Global POS Keyboard Shortcuts Handler inside billing screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F6') {
        e.preventDefault();
        setShowPartyPicker(true);
        if (clientId) {
          setClientId('');
        }
        setTimeout(() => {
          if (partySearchInputRef.current) {
            partySearchInputRef.current.focus();
            partySearchInputRef.current.select();
          } else {
            const input = document.getElementById('pos-party-search-input') as HTMLInputElement;
            if (input) {
              input.focus();
              input.select();
            }
          }
        }, 50);
      } else if (e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        addRow();
      } else if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        e.stopPropagation();
        handleFormSaveAllRef.current(true, false);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        handleFormSaveAllRef.current(false, true);
      } else if (e.key === 'Escape') {
        if (showItemSearchModal) {
          setShowItemSearchModal(false);
        } else if (showPartyPicker) {
          setShowPartyPicker(false);
        } else if (activeRowSuggestionId) {
          setActiveRowSuggestionId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [clientId, rows, filteredClients, showItemSearchModal, showPartyPicker, activeRowSuggestionId]);

  const handleRowKeyDown = (
    e: React.KeyboardEvent,
    idx: number,
    field: 'name' | 'mrp' | 'qty' | 'price' | 'delete' = 'name'
  ) => {
    const currentRow = rows[idx];
    if (!currentRow) return;

    const matchingProds = getRowMatchingProducts(currentRow.name);
    const isDropdownOpen = activeRowSuggestionId === currentRow.id && matchingProds.length > 0;

    if (e.key === 'ArrowDown' && isDropdownOpen && field === 'name') {
      e.preventDefault();
      setSuggestionHighlightedIndex(prev => Math.min(prev + 1, Math.min(matchingProds.length - 1, 30)));
      return;
    }

    if (e.key === 'ArrowUp' && isDropdownOpen && field === 'name') {
      e.preventDefault();
      setSuggestionHighlightedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      if (field === 'name') {
        if (isDropdownOpen && matchingProds[suggestionHighlightedIndex]) {
          selectProductForRow(currentRow.id, matchingProds[suggestionHighlightedIndex]);
          return;
        }

        if (currentRow.name.trim()) {
          const exactMatched = products.find(
            p => p.name.trim().toLowerCase() === currentRow.name.trim().toLowerCase()
          );
          if (exactMatched) {
            selectProductForRow(currentRow.id, exactMatched);
            return;
          }
        }

        setActiveRowSuggestionId(null);
        setSuggestionHighlightedIndex(0);
        setTimeout(() => {
          const qtyInput = (document.getElementById(`qty-input-${currentRow.id}`) || document.getElementById(`qty-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (qtyInput) {
            qtyInput.focus();
            qtyInput.select();
          }
        }, 40);
        return;
      }

      // Check custom product auto-save when pressing Enter on Qty / MRP / Price
      if (currentRow.name.trim()) {
        const matched = products.find(p => p.name.trim().toLowerCase() === currentRow.name.trim().toLowerCase());
        if (!matched && autoSaveNewItemsToInventory && onAddNewProduct) {
          // Auto add new manual item to inventory with 10 Qty and same price
          const itemPrice = currentRow.price || 0;
          const itemMrp = (currentRow.mrp && Number(currentRow.mrp) > 0) ? Number(currentRow.mrp) : 0;
          const newProd: Product = {
            id: Math.floor(Date.now() + Math.random() * 100000),
            name: currentRow.name.trim(),
            sku: currentRow.hsn || `SKU-${Date.now().toString().slice(-4)}`,
            unit: currentRow.unit || 'Pcs',
            stock: 10,
            price: itemPrice,
            mrp: itemMrp,
            purchasePrice: currentRow.purchasePrice || (itemPrice * 0.75),
            discount: currentRow.disc || 0
          };
          onAddNewProduct(newProd);
        }
      }

      setActiveRowSuggestionId(null);

      // Shift focus to the next row (second row or new row)
      if (idx < rows.length - 1) {
        const nextId = rows[idx + 1].id;
        const nextInput = (document.getElementById(`item-name-input-${nextId}`) || document.getElementById(`item-name-input-mobile-${nextId}`)) as HTMLInputElement;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      } else {
        addRow();
      }
      return;
    }

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        // Shift + Tab: delete -> price -> qty -> mrp -> name -> previous row delete
        if (field === 'delete') {
          e.preventDefault();
          const el = (document.getElementById(`price-input-${currentRow.id}`) || document.getElementById(`price-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (el) { el.focus(); el.select?.(); }
        } else if (field === 'price') {
          e.preventDefault();
          const el = (document.getElementById(`qty-input-${currentRow.id}`) || document.getElementById(`qty-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (el) { el.focus(); el.select?.(); }
        } else if (field === 'qty') {
          e.preventDefault();
          const el = (document.getElementById(`mrp-input-${currentRow.id}`) || document.getElementById(`mrp-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (el) { el.focus(); el.select?.(); }
        } else if (field === 'mrp') {
          e.preventDefault();
          const el = (document.getElementById(`item-name-input-${currentRow.id}`) || document.getElementById(`item-name-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (el) { el.focus(); el.select?.(); }
        } else if (field === 'name' && idx > 0) {
          e.preventDefault();
          const prevId = rows[idx - 1].id;
          const el = (document.getElementById(`delete-btn-${prevId}`) || document.getElementById(`delete-btn-mobile-${prevId}`)) as HTMLElement;
          if (el) el.focus();
        }
      } else {
        // Tab: name -> mrp -> qty -> price -> delete -> next row name
        if (field === 'name') {
          e.preventDefault();
          const el = (document.getElementById(`mrp-input-${currentRow.id}`) || document.getElementById(`mrp-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (el) { el.focus(); el.select?.(); }
        } else if (field === 'mrp') {
          e.preventDefault();
          const el = (document.getElementById(`qty-input-${currentRow.id}`) || document.getElementById(`qty-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (el) { el.focus(); el.select?.(); }
        } else if (field === 'qty') {
          e.preventDefault();
          const el = (document.getElementById(`price-input-${currentRow.id}`) || document.getElementById(`price-input-mobile-${currentRow.id}`)) as HTMLInputElement;
          if (el) { el.focus(); el.select?.(); }
        } else if (field === 'price') {
          e.preventDefault();
          const el = (document.getElementById(`delete-btn-${currentRow.id}`) || document.getElementById(`delete-btn-mobile-${currentRow.id}`)) as HTMLElement;
          if (el) el.focus();
        } else if (field === 'delete') {
          e.preventDefault();
          if (idx < rows.length - 1) {
            const nextId = rows[idx + 1].id;
            const el = (document.getElementById(`item-name-input-${nextId}`) || document.getElementById(`item-name-input-mobile-${nextId}`)) as HTMLInputElement;
            if (el) { el.focus(); el.select?.(); }
          } else {
            addRow();
          }
        }
      }
    }
  };

  // Initial auto-focus on Customer search field when opening a blank bill
  useEffect(() => {
    if (editingEstimateId === null && !clientId) {
      setTimeout(() => {
        if (partySearchInputRef.current) {
          partySearchInputRef.current.focus();
        } else {
          const partyInput = document.getElementById('pos-party-search-input') as HTMLInputElement;
          if (partyInput) partyInput.focus();
        }
      }, 150);
    }
  }, [editingEstimateId]);

  return (
    <div className="space-y-6 max-w-[1300px] mx-auto pb-16">
      
      {/* ----------------- TOP COMPACT CONTROLS BAR (Matches Screen) ----------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xs">
        <div className="flex items-center space-x-3">
          <button 
            type="button"
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-slate-600"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-extrabold text-slate-800 tracking-tight flex items-center gap-1.5">
              <span>Create Sales Invoice</span>
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Estimate Billing Mode</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5">
          {/* Quick accessory buttons mimicking physical POS */}
          <button 
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open_keyboard_shortcuts'))}
            title="Keyboard Shortcut Guide (F1)"
            className="py-2 px-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors flex items-center space-x-1.5 text-xs font-extrabold cursor-pointer"
          >
            <Keyboard className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Shortcuts</span>
            <span className="bg-slate-100 text-slate-700 border border-slate-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-black">F1</span>
          </button>

          <button 
            type="button"
            onClick={() => setShowBulkItemModal(true)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-extrabold py-2 px-3 border border-slate-200 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <span>📦</span>
            <span>Bulk Items</span>
          </button>

          <button 
            type="button"
            onClick={() => setShowThemeModal(true)}
            title="Select Invoice Theme"
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold py-2 px-3 border border-indigo-200 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Palette className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Theme:</span>
            <span className="font-black text-indigo-950 truncate max-w-[110px]">{INVOICE_THEMES.find(t => t.id === selectedInvoiceTheme)?.name || 'Modern'}</span>
          </button>

          <button 
            type="button"
            title="Invoice Settings"
            className="relative p-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 flex items-center space-x-1 transition-colors text-xs font-bold"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">Settings</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          <button
            type="button"
            onClick={() => handleFormSaveAll(false, true)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs border border-slate-200 cursor-pointer"
          >
            Save & New
          </button>

          <button
            type="button"
            onClick={() => handleFormSaveAll(true, false)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-4 rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Save & Print</span>
            <span className="bg-blue-800 text-blue-100 text-[9px] px-1.5 py-0.5 rounded font-mono font-black">F3</span>
          </button>
        </div>
      </div>

      {/* ----------------- CORE GRID: PARTY DETAILS & INVOICE META ----------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* BILL TO COLUMN (Left 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs relative">
            <h3 className="font-extrabold text-slate-800 mb-3 text-xs uppercase tracking-wider flex items-center justify-between">
              <span>Bill To</span>
              {clientId && (
                <button
                  type="button"
                  onClick={() => setClientId('')}
                  className="text-red-500 hover:text-red-700 font-bold text-[10px] flex items-center space-x-1"
                >
                  <X className="w-3 h-3" />
                  <span>Clear Party</span>
                </button>
              )}
            </h3>

            {/* DASHED BOX / FAST SEARCH INPUT IF NO PARTY SELECTED */}
            {!clientId ? (
              <div className="relative space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="pos-party-search-input"
                      ref={partySearchInputRef}
                      type="text"
                      placeholder="Select Customer (F6) - Search name or mobile... (↑ ↓ navigate, Enter / → / ← select)"
                      value={partySearch}
                      onChange={(e) => {
                        setPartySearch(e.target.value);
                        setShowPartyPicker(true);
                        setHighlightedPartyIndex(0);
                      }}
                      onFocus={() => {
                        setShowPartyPicker(true);
                        setHighlightedPartyIndex(0);
                      }}
                      onKeyDown={handlePartySearchKeyDown}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs outline-none focus:bg-white focus:border-blue-600 font-extrabold shadow-xs text-slate-900 placeholder:text-slate-400"
                    />
                    {partySearch && (
                      <button
                        type="button"
                        onClick={() => setPartySearch('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFastClientModal(true);
                      setShowPartyPicker(false);
                    }}
                    className="bg-blue-600 text-white font-black px-4 py-2.5 rounded-xl text-xs hover:bg-blue-700 transition-colors cursor-pointer shadow-xs flex items-center space-x-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ New Party</span>
                  </button>
                </div>

                {/* Inline Searchable Party Picker Popover */}
                {showPartyPicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-2xl rounded-2xl p-3 z-30 space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2 px-1">
                      <span className="font-black text-[11px] text-slate-600 uppercase tracking-wider">
                        Select Billing Party ({filteredClients.length} found)
                      </span>
                      <button 
                        type="button"
                        onClick={() => setShowPartyPicker(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                      {filteredClients.map((c, index) => {
                        const curDue = (c.id && clientBalances.get(c.id)) || (c.phone && clientBalances.get(c.phone)) || 0;
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setClientId(c.id);
                              setShowPartyPicker(false);
                              setPartySearch('');
                              setTimeout(() => {
                                setShowItemSearchModal(true);
                                setModalItemSearchQuery('');
                                setHighlightedModalProductIndex(0);
                                setTimeout(() => {
                                  if (modalItemSearchInputRef.current) {
                                    modalItemSearchInputRef.current.focus();
                                  }
                                }, 50);
                              }, 80);
                            }}
                            className={`py-2.5 px-3 rounded-xl cursor-pointer flex justify-between items-center transition-colors text-xs ${
                              index === highlightedPartyIndex
                                ? 'bg-blue-50/90 text-blue-950 font-black border-l-4 border-blue-600 shadow-xs'
                                : 'hover:bg-slate-50 text-slate-700 font-semibold'
                            }`}
                          >
                            <div>
                              <span className="font-extrabold text-slate-900 block">{c.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-bold">+91 {c.phone}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {curDue > 0 ? (
                                <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-mono">
                                  ₹{curDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Due
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  ✓ Settled
                                </span>
                              )}
                              {c.gstin && (
                                <span className="text-[9px] bg-slate-100 text-slate-600 font-black px-1.5 py-0.5 rounded font-mono uppercase">
                                  GST: {c.gstin}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {filteredClients.length === 0 && (
                        <div className="p-4 text-center italic text-slate-400 font-semibold text-xs">
                          No matching customer registered yet. Click "+ New Party" to create.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* COMPACT BEAUTIFUL CLIENT PROFILE DETAILS (Match Screen) */
              (() => {
                const selectedClientDue = selectedClientProfile
                  ? (selectedClientProfile.id && clientBalances.get(selectedClientProfile.id)) ||
                    (selectedClientProfile.phone && clientBalances.get(selectedClientProfile.phone)) || 0
                  : 0;

                return (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-extrabold uppercase text-[10px]">Active Party</span>
                        <h4 className="text-sm font-black text-slate-800">{selectedClientProfile?.name}</h4>
                      </div>
                      <p className="text-xs text-slate-600 font-semibold font-mono">Mobile: +91 {selectedClientProfile?.phone}</p>
                      <p className="text-xs text-slate-500 font-medium max-w-md">Address: {selectedClientProfile?.address || "(No physical billing address registered)"}</p>

                      <div className="flex flex-wrap items-center gap-3 pt-2 mt-1 border-t border-slate-200/80 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Party Outstanding:</span>
                          <span className={`font-mono font-black px-2 py-0.5 rounded-md text-xs ${
                            selectedClientDue > 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          }`}>
                            ₹{selectedClientDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {selectedClientDue > 0 ? 'Due' : 'Settled'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total with New Bill:</span>
                          <span className="font-mono font-black text-slate-900">
                            ₹{(selectedClientDue + invoiceCalculations.balanceDue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {selectedClientProfile?.gstin && (
                      <div className="pt-2 md:pt-0 self-start">
                        <span className="text-[10px] text-slate-400 font-bold block mb-0.5 uppercase tracking-wider">GSTIN NUMBER</span>
                        <span className="font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider">
                          {selectedClientProfile.gstin}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>

        </div>

        {/* INVOICE NO, DATE & TERMS COLUMNS (Right 1/3) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Sales Invoice No:</label>
                <input
                  type="text"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  className="w-full bg-slate-100 border border-slate-200 text-xs p-2.5 rounded-xl font-bold font-mono outline-none text-slate-650 text-center"
                  disabled
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Sales Invoice Date:</label>
                <div className="relative">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs p-2.5 rounded-xl font-bold outline-none focus:bg-white focus:border-indigo-500 font-mono text-center"
                  />
                </div>
              </div>
            </div>

            {/* PAYMENT TERMS & DUE DATE INSIDE DASHED BOX WITH CROSS CLOSE BUTTON */}
            {showTermsBlock ? (
              <div className="relative border border-dashed border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowTermsBlock(false)}
                  className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 bg-white shadow-xs p-1 rounded-full border border-slate-100"
                  title="Remove payment terms"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Payment Terms:</label>
                    <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:border-indigo-500">
                      <input
                        type="number"
                        min={0}
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(parseInt(e.target.value) || 0)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full text-xs font-bold outline-none text-center bg-transparent"
                      />
                      <span className="text-[10px] font-bold text-slate-400 ml-1">days</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Due Date:</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs p-2.5 rounded-xl font-bold outline-none focus:border-indigo-500 font-mono text-center"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTermsBlock(true)}
                className="w-full border border-dashed border-slate-200 hover:border-slate-300 text-slate-500 font-bold p-2.5 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all"
              >
                <Plus className="w-4 h-4 text-slate-400" />
                <span>Add Payment Terms & Due Date</span>
              </button>
            )}

          </div>

          {/* SELECT INVOICE THEME COMPONENT */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Select Invoice Theme</span>
              </label>
              <button
                type="button"
                onClick={() => setShowThemeModal(true)}
                className="text-[10px] font-black text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <span>Preview All</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {INVOICE_THEMES.map(theme => {
                const isSelected = selectedInvoiceTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => {
                      setSelectedInvoiceTheme(theme.id);
                      try {
                        const cfg = getSavedPrintConfig();
                        savePrintConfig({ ...cfg, secondaryStyle: theme.id });
                      } catch (e) {}
                    }}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600/30'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-black truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                          {theme.name}
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 font-bold">
                          {theme.iconBadge}
                        </span>
                      </div>
                      <span className="text-[9.5px] text-slate-500 block truncate mt-0.5">
                        {theme.desc}
                      </span>
                    </div>
                    {isSelected ? (
                      <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* ----------------- RETAIL / WHOLESALE BILL ITEMS LIST TABLE ----------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* FAST POS ITEM ACTION BAR */}
        <div className="p-3.5 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                id="pos-add-item-btn-top"
                type="button"
                onClick={addRow}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-xs font-black shadow-xs flex items-center space-x-2 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Item Row</span>
                <span className="bg-indigo-800/60 text-indigo-100 text-[10px] px-1.5 py-0.5 rounded font-mono ml-1">F2</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetRowForCatalog(null);
                  setShowItemSearchModal(true);
                  setModalItemSearchQuery('');
                  setHighlightedModalProductIndex(0);
                  setTimeout(() => {
                    if (modalItemSearchInputRef.current) {
                      modalItemSearchInputRef.current.focus();
                    }
                  }, 50);
                }}
                className="bg-white border border-slate-300 hover:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <Search className="w-4 h-4 text-indigo-600" />
                <span>Search Catalog (Auto)</span>
              </button>

              {/* AUTO SAVE NEW ITEMS TO INVENTORY TOGGLE SWITCH */}
              <button
                type="button"
                onClick={() => {
                  const nextVal = !autoSaveNewItemsToInventory;
                  setAutoSaveNewItemsToInventory(nextVal);
                  try {
                    localStorage.setItem('pos_auto_save_new_inventory', String(nextVal));
                  } catch (e) {}
                }}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer border ${
                  autoSaveNewItemsToInventory
                    ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs font-black'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title="When ON: Manually added new items will automatically save to Inventory with 10 Qty stock"
              >
                <div className={`w-4 h-4 rounded-full transition-colors flex items-center justify-center ${
                  autoSaveNewItemsToInventory ? 'bg-white text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {autoSaveNewItemsToInventory ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3 h-3" />}
                </div>
                <span>Auto Save New Item to Inventory (10 Qty)</span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                  autoSaveNewItemsToInventory ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200 text-slate-700'
                }`}>
                  {autoSaveNewItemsToInventory ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBarcodeScanner(true)}
                className="bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-xs font-black text-slate-800 flex items-center space-x-1.5 shadow-xs cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <Barcode className="w-4 h-4 text-indigo-600" />
                <span>Barcode</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBulkItemModal(true)}
                className="bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-xl px-3.5 py-2.5 text-xs font-black flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <ClipboardList className="w-4 h-4" />
                <span>Bulk Add</span>
              </button>
            </div>
          </div>
        </div>
        
        {isMobile ? (
          <div className="divide-y divide-slate-100 p-2 space-y-3 bg-slate-50/50">
            {rows.map((r, idx) => (
              <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 relative shadow-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider">
                    Item #{idx + 1}
                  </span>
                  <button
                    id={`delete-btn-mobile-${r.id}`}
                    type="button"
                    onClick={() => removeRow(r.id)}
                    onKeyDown={(e) => handleRowKeyDown(e, idx, 'delete')}
                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Product / Service Name</label>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetRowForCatalog(r.id);
                        setShowItemSearchModal(true);
                        setModalItemSearchQuery('');
                        setHighlightedModalProductIndex(0);
                        setTimeout(() => {
                          if (modalItemSearchInputRef.current) {
                            modalItemSearchInputRef.current.focus();
                          }
                        }, 50);
                      }}
                      className="text-[10px] text-indigo-600 font-extrabold flex items-center space-x-1 hover:underline cursor-pointer"
                    >
                      <Search className="w-3 h-3" />
                      <span>Search Catalog</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id={`item-name-input-mobile-${r.id}`}
                      type="text"
                      placeholder="Type product name or select..."
                      value={r.name}
                      onFocus={() => {
                        setActiveRowSuggestionId(r.id);
                        setSuggestionHighlightedIndex(0);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setActiveRowSuggestionId(prev => prev === r.id ? null : prev);
                        }, 200);
                      }}
                      onChange={(e) => {
                        handleRowChange(r.id, 'name', e.target.value);
                        setActiveRowSuggestionId(r.id);
                        setSuggestionHighlightedIndex(0);
                      }}
                      onKeyDown={(e) => handleRowKeyDown(e, idx, 'name')}
                      autoComplete="off"
                      className="w-full bg-slate-50 p-2.5 border border-slate-200 rounded-xl text-xs font-black focus:bg-white outline-none focus:border-indigo-500 transition-colors"
                    />
                    {activeRowSuggestionId === r.id && (
                      <div className="absolute top-full left-0 z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto divide-y divide-slate-100">
                        {getRowMatchingProducts(r.name).slice(0, 30).map((p, pIdx) => (
                          <div
                            key={p.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectProductForRow(r.id, p);
                            }}
                            className={`px-3 py-2 text-left cursor-pointer flex items-center justify-between transition-colors ${
                              pIdx === suggestionHighlightedIndex ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <div className="text-xs font-bold truncate">{p.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {p.sku ? `SKU: ${p.sku} • ` : ''}Stock: {p.stock} {p.unit}
                                {p.mrp ? ` • MRP: ₹${p.mrp}` : ''}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-black text-indigo-600 font-mono">₹{p.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">HSN / SAC</label>
                    <input
                      type="text"
                      placeholder="HSN"
                      value={r.hsn || ''}
                      onChange={(e) => handleRowChange(r.id, 'hsn', e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Unit</label>
                    <select
                      value={r.unit || 'Pcs'}
                      onChange={(e) => handleRowChange(r.id, 'unit', e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      {['Pcs', 'Kg', 'Gms', 'Ltr', 'Box', 'Pack', 'Pair', 'Mtr', 'Bag', 'Dozen', 'Set', 'Roll'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qty (Units)</label>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleRowChange(r.id, 'qty', Math.max(1, r.qty - 1))}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black border-r border-slate-200 select-none cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      id={`qty-input-mobile-${r.id}`}
                      type="number"
                      min={1}
                      value={r.qty}
                      onChange={(e) => handleRowChange(r.id, 'qty', parseInt(e.target.value) || 0)}
                      onKeyDown={(e) => handleRowKeyDown(e, idx, 'qty')}
                      className="w-full text-center font-black font-mono text-xs bg-transparent outline-none p-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleRowChange(r.id, 'qty', r.qty + 1)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black border-l border-slate-200 select-none cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">MRP (₹)</label>
                    <input
                      id={`mrp-input-mobile-${r.id}`}
                      type="number"
                      placeholder="0"
                      value={r.mrp || ''}
                      onChange={(e) => handleRowChange(r.id, 'mrp', parseFloat(e.target.value) || 0)}
                      onKeyDown={(e) => handleRowKeyDown(e, idx, 'mrp')}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-right font-bold text-xs outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Rate (₹)</label>
                    <input
                      id={`price-input-mobile-${r.id}`}
                      type="number"
                      placeholder="0"
                      value={r.price || ''}
                      onChange={(e) => handleRowChange(r.id, 'price', parseFloat(e.target.value) || 0)}
                      onKeyDown={(e) => handleRowKeyDown(e, idx, 'price')}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-right font-black text-xs text-indigo-950 outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Discount</label>
                    <div className="flex gap-1 items-center">
                      <input
                        type="number"
                        placeholder="0"
                        value={r.rowDiscountVal !== undefined ? r.rowDiscountVal : (r.disc || 0)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleRowChange(r.id, 'rowDiscountVal', val);
                          if ((r.rowDiscountType || 'PERCENT') === 'PERCENT') {
                            handleRowChange(r.id, 'disc', val);
                          } else {
                            const totalBeforeDisc = Number(r.qty) * Number(r.price);
                            if (totalBeforeDisc > 0) {
                              handleRowChange(r.id, 'disc', Math.round((val / totalBeforeDisc) * 100));
                            } else {
                              handleRowChange(r.id, 'disc', 0);
                            }
                          }
                        }}
                        className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold text-xs outline-none font-mono text-amber-700 font-black"
                      />
                      <select
                        value={r.rowDiscountType || 'PERCENT'}
                        onChange={(e) => {
                          const newType = e.target.value as 'PERCENT' | 'FLAT';
                          handleRowChange(r.id, 'rowDiscountType', newType);
                          const val = r.rowDiscountVal !== undefined ? r.rowDiscountVal : (r.disc || 0);
                          if (newType === 'PERCENT') {
                            handleRowChange(r.id, 'disc', val);
                          } else {
                            const totalBeforeDisc = Number(r.qty) * Number(r.price);
                            if (totalBeforeDisc > 0) {
                              handleRowChange(r.id, 'disc', Math.round((val / totalBeforeDisc) * 100));
                            } else {
                              handleRowChange(r.id, 'disc', 0);
                            }
                          }
                        }}
                        className="p-1 bg-slate-100 border border-slate-200 rounded-lg text-[9px] font-black text-slate-600 outline-none cursor-pointer"
                      >
                        <option value="PERCENT">%</option>
                        <option value="FLAT">₹</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subtotal ({taxPct}% Tax)</span>
                  <span className="font-black text-slate-800 font-mono text-xs">
                    ₹{getRowNetTotal(r).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full overflow-x-auto block whitespace-nowrap custom-scrollbar min-h-[380px] pb-36">
            <table className="w-full min-w-[980px] text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-10 min-w-[40px]">#</th>
                  <th className="py-3 px-3 text-left w-[30%] min-w-[200px] md:min-w-[260px]">ITEMS / SERVICES</th>
                  <th className="py-3 px-2 text-center w-24 min-w-[90px]">HSN / SAC</th>
                  <th className="py-3 px-2 text-center w-20 min-w-[80px]">QTY</th>
                  <th className="py-3 px-2 text-center w-20 min-w-[80px]">UNIT</th>
                  <th className="py-3 px-2 text-right w-24 min-w-[90px]">MRP (₹)</th>
                  <th className="py-3 px-2 text-right w-24 min-w-[90px]">RATE (₹)</th>
                  <th className="py-3 px-2 text-center w-32 min-w-[120px]">DISCOUNT</th>
                  <th className="py-3 px-2 text-center w-16 min-w-[65px]">TAX (%)</th>
                  <th className="py-3 px-2 text-right w-28 min-w-[110px]">AMOUNT (₹)</th>
                  <th className="py-3 px-3 text-center w-10 min-w-[40px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 text-center text-slate-400 font-bold font-mono w-12 min-w-[48px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 min-w-[220px] md:min-w-[320px]">
                      <div className="flex items-center space-x-1.5">
                        <div className="relative flex-1">
                          <input
                            id={`item-name-input-${r.id}`}
                            type="text"
                            placeholder="Type product name or select..."
                            value={r.name}
                            onFocus={() => {
                              setActiveRowSuggestionId(r.id);
                              setSuggestionHighlightedIndex(0);
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setActiveRowSuggestionId(prev => prev === r.id ? null : prev);
                              }, 200);
                            }}
                            onChange={(e) => {
                              handleRowChange(r.id, 'name', e.target.value);
                              setActiveRowSuggestionId(r.id);
                              setSuggestionHighlightedIndex(0);
                            }}
                            onKeyDown={(e) => handleRowKeyDown(e, idx, 'name')}
                            autoComplete="off"
                            className="w-full bg-slate-50/50 p-2 border border-slate-200 rounded-xl text-xs font-extrabold focus:bg-white outline-none focus:border-indigo-500 transition-colors truncate"
                          />
                          {activeRowSuggestionId === r.id && (
                            <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[320px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100">
                              {getRowMatchingProducts(r.name).slice(0, 30).map((p, pIdx) => (
                                <div
                                  key={p.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectProductForRow(r.id, p);
                                  }}
                                  className={`px-3 py-2.5 text-left cursor-pointer flex items-center justify-between transition-colors ${
                                    pIdx === suggestionHighlightedIndex ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-800'
                                  }`}
                                >
                                  <div className="truncate pr-2">
                                    <div className="text-xs font-bold truncate">{p.name}</div>
                                    <div className="text-[10px] text-slate-400">
                                      {p.sku ? `SKU: ${p.sku} • ` : ''}Stock: {p.stock} {p.unit}
                                      {p.mrp ? ` • MRP: ₹${p.mrp}` : ''}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-black text-indigo-600 font-mono">₹{p.price}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {r.hsn ? (
                            <span className="text-[10px] text-slate-400 font-mono block px-1 mt-0.5">
                              SKU: {r.hsn}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          tabIndex={-1}
                          title="Search & pick from product catalog"
                          onClick={() => {
                            setTargetRowForCatalog(r.id);
                            setShowItemSearchModal(true);
                            setModalItemSearchQuery('');
                            setHighlightedModalProductIndex(0);
                            setTimeout(() => {
                              if (modalItemSearchInputRef.current) {
                                modalItemSearchInputRef.current.focus();
                              }
                            }, 50);
                          }}
                          className="p-2 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors cursor-pointer shrink-0"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-2 w-24 min-w-[90px]">
                      <input
                        type="text"
                        placeholder="HSN"
                        value={r.hsn || ''}
                        onChange={(e) => handleRowChange(r.id, 'hsn', e.target.value)}
                        className="w-full text-xs font-mono font-bold px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-center uppercase outline-none focus:bg-white focus:border-blue-600 shadow-2xs"
                      />
                    </td>
                    <td className="py-3 px-2 w-20 min-w-[80px]">
                      <input
                        id={`qty-input-${r.id}`}
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={(e) => handleRowChange(r.id, 'qty', parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => handleRowKeyDown(e, idx, 'qty')}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full text-xs font-bold px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-center outline-none focus:bg-white focus:border-blue-600 font-mono shadow-2xs"
                      />
                    </td>
                    <td className="py-3 px-2 w-20 min-w-[80px]">
                      <select
                        value={r.unit || 'Pcs'}
                        onChange={(e) => handleRowChange(r.id, 'unit', e.target.value)}
                        className="w-full text-xs font-bold px-1.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-center outline-none focus:bg-white focus:border-blue-600 cursor-pointer shadow-2xs"
                      >
                        {['Pcs', 'Kg', 'Gms', 'Ltr', 'Box', 'Pack', 'Pair', 'Mtr', 'Bag', 'Dozen', 'Set', 'Roll'].map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-2 w-24 min-w-[90px]">
                      <input
                        id={`mrp-input-${r.id}`}
                        type="number"
                        placeholder="0"
                        value={r.mrp || ''}
                        onChange={(e) => handleRowChange(r.id, 'mrp', parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => handleRowKeyDown(e, idx, 'mrp')}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full text-xs font-bold px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-right outline-none focus:bg-white focus:border-blue-600 font-mono shadow-2xs"
                      />
                    </td>
                    <td className="py-3 px-2 w-24 min-w-[90px]">
                      <input
                        id={`price-input-${r.id}`}
                        type="number"
                        placeholder="0"
                        value={r.price || ''}
                        onChange={(e) => handleRowChange(r.id, 'price', parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => handleRowKeyDown(e, idx, 'price')}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full text-xs font-black text-blue-950 px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-right outline-none focus:bg-white focus:border-blue-600 font-mono shadow-2xs"
                      />
                    </td>
                    <td className="py-3 px-2 w-36 min-w-[140px]">
                      <div className="flex flex-wrap md:flex-nowrap gap-1.5 items-center justify-center min-w-[120px]">
                        <input
                          type="number"
                          tabIndex={-1}
                          placeholder="0"
                          value={r.rowDiscountVal !== undefined ? r.rowDiscountVal : (r.disc || 0)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            handleRowChange(r.id, 'rowDiscountVal', val);
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full max-w-[80px] md:max-w-[120px] min-w-[65px] text-xs font-medium px-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 text-center font-bold outline-none focus:bg-white focus:border-indigo-500 font-mono text-amber-700 font-black"
                        />
                        <select
                          tabIndex={-1}
                          value={r.rowDiscountType || 'PERCENT'}
                          onChange={(e) => {
                            const newType = e.target.value as 'PERCENT' | 'FLAT';
                            handleRowChange(r.id, 'rowDiscountType', newType);
                          }}
                          className="p-1.5 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer"
                        >
                          <option value="PERCENT">%</option>
                          <option value="FLAT">₹</option>
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center text-slate-400 font-semibold font-mono w-16 min-w-[70px]">
                      {taxPct}%
                    </td>
                    <td className="py-3 px-2 text-right font-black text-slate-800 font-mono text-xs w-32 min-w-[120px]">
                      ₹{getRowNetTotal(r).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center w-12 min-w-[48px]">
                      <button
                        id={`delete-btn-${r.id}`}
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length === 0 && (
          <div className="p-12 text-center bg-slate-50/50 italic font-semibold text-slate-400 font-sans border-t border-slate-100">
            No items added yet. Click "+ Add Item Row" above or press F2 to start.
          </div>
        )}

        {/* ----------------- SUBTOTAL DISPLAY STRIP ----------------- */}
        <div className="bg-slate-100/70 border-t border-b border-slate-200 px-6 py-3.5 flex flex-wrap justify-between items-center text-slate-700 font-bold text-xs font-sans gap-4">
          <div className="flex items-center space-x-4">
            <span className="text-slate-400 uppercase text-[10px] tracking-widest font-black">Subtotals</span>
            <span className="text-slate-500">Total Items: <span className="text-slate-800 font-black">{rows.length}</span></span>
            <span className="text-slate-500">Total Qty: <span className="text-slate-800 font-black">{invoiceCalculations.totalQty}</span></span>
          </div>
          <div className="flex items-center space-x-6">
            <span className="text-slate-500">Tax Base: <span className="text-slate-800 font-black font-mono">₹{invoiceCalculations.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></span>
            <span className="text-slate-800 font-black text-sm">Net Total: <span className="font-mono text-indigo-700">₹{invoiceCalculations.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></span>
          </div>
        </div>

      </div>

      {/* ----------------- BOTTOM BILL CALCULATIONS & AUX CONTROLS (Matches Screen) ----------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* BOTTOM LEFT: NOTES & T&C (Takes 5/12 columns) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-blue-600">
            {!showNotes && (
              <button 
                type="button" 
                onClick={() => setShowNotes(true)}
                className="hover:underline flex items-center space-x-1"
              >
                <span>+ Add Notes</span>
              </button>
            )}
            {!showTermsAndConditions && (
              <button 
                type="button" 
                onClick={() => setShowTermsAndConditions(true)}
                className="hover:underline flex items-center space-x-1"
              >
                <span>+ Add Terms & Conditions</span>
              </button>
            )}
            <button 
              type="button" 
              onClick={() => {
                alert("Accounting Integration Mode Active: Link created automatically inside customer ledger!");
              }}
              className="hover:underline flex items-center space-x-1"
            >
              <span>+ Add New Account</span>
            </button>
            {!showPaymentQR && (
              <button 
                type="button" 
                onClick={() => {
                  setShowPaymentQR(true);
                  setIncludePaymentQR(true);
                }}
                className="hover:underline flex items-center space-x-1"
              >
                <QrCode className="w-3.5 h-3.5 inline mr-0.5" />
                <span>+ Add Payment QR</span>
              </button>
            )}
          </div>

          {/* DYNAMIC NOTES */}
          {showNotes && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 relative">
              <button 
                type="button" 
                onClick={() => setShowNotes(false)} 
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Internal / Customer Notes</label>
              <textarea
                rows={2}
                placeholder="Write any custom delivery status or special notes to print on bill..."
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:bg-white focus:border-indigo-500 font-semibold text-slate-700"
              />
            </div>
          )}

          {/* TERMS AND CONDITIONS BLOCK (Matches exactly the picture) */}
          {showTermsAndConditions && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 relative">
              <button 
                type="button" 
                onClick={() => setShowTermsAndConditions(false)} 
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
              
              <span className="block text-[10px] uppercase font-black text-slate-400 tracking-wider mb-2">Terms and Conditions</span>
              
              <div className="bg-slate-100/80 border border-slate-150 p-3 rounded-lg text-xs text-slate-600 font-medium space-y-1.5 font-sans leading-relaxed">
                <p>1. Goods once sold will not be taken back or exchanged.</p>
                <p>2. All disputes are subject to local district jurisdiction only.</p>
              </div>
            </div>
          )}

          {/* DYNAMIC QR CODE DISPLAY */}
          {showPaymentQR && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 relative flex items-center space-x-4">
              <button 
                type="button" 
                onClick={() => {
                  setShowPaymentQR(false);
                  setIncludePaymentQR(false);
                }} 
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="bg-white border border-slate-200 p-1.5 rounded-lg">
                {qrCodeDataUrl ? (
                  <img 
                    src={qrCodeDataUrl} 
                    alt="UPI Payment QR" 
                    className="w-20 h-20 object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-20 h-20 bg-slate-900 flex items-center justify-center text-white rounded text-[10px] font-black text-center uppercase tracking-tighter">
                    Generating...
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <span className="font-extrabold text-xs text-slate-800 block">UPI Payment QR Code Added</span>
                <p className="text-[10px] text-zinc-600 font-bold max-w-xs font-mono">
                  UPI ID: paytmqru4d2v8mngf@paytm
                </p>
                <p className="text-[10px] text-emerald-600 font-extrabold max-w-xs">
                  Prints a standard UPI payment dynamic QR on the bill for rapid customer checkouts.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* BOTTOM RIGHT: DETAILED PAY CALCULATOR (Takes 7/12 columns) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 font-sans text-xs text-slate-600">
          
          <div className="space-y-3">
            
            {/* Inline Additional Options Toggles */}
            <div className="flex gap-4 border-b border-slate-100 pb-2">
              {!showDiscountInput && (
                <button 
                  type="button" 
                  onClick={() => setShowDiscountInput(true)} 
                  className="text-blue-600 font-bold hover:underline"
                >
                  + Add Discount
                </button>
              )}
              {!showChargesInput && (
                <button 
                  type="button" 
                  onClick={() => setShowChargesInput(true)} 
                  className="text-blue-600 font-bold hover:underline"
                >
                  + Add Additional Charges
                </button>
              )}
            </div>

            {/* Cash Discount input field */}
            {showDiscountInput && (
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-slate-500 font-bold flex items-center space-x-1">
                    <Gift className="w-4 h-4 text-indigo-500" />
                    <span>General Discount (₹):</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={0}
                      value={cashDiscount || ''}
                      onChange={(e) => setCashDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-24 bg-white border border-slate-200 rounded-lg p-1.5 text-right font-bold outline-none focus:border-indigo-500"
                      placeholder="0"
                    />
                    <button type="button" onClick={() => { setCashDiscount(0); setShowDiscountInput(false); }} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-amber-900 font-bold text-xs flex items-center space-x-1">
                      <span>🏷️ Flat Final Cash Discount (₹):</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={flatFinalDiscount || ''}
                      onChange={(e) => setFlatFinalDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-24 bg-white border border-amber-300 rounded-lg p-1.5 text-right font-bold outline-none focus:border-amber-500 font-mono text-amber-900 font-black text-xs"
                      placeholder="0"
                    />
                  </div>
                  {/* Quick coupon chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-amber-200/60">
                    <span className="text-[9px] uppercase font-bold text-amber-700">Quick Coupons:</span>
                    {[
                      { label: '₹50 OFF', val: 50 },
                      { label: '₹100 OFF', val: 100 },
                      { label: '₹200 OFF', val: 200 },
                      { label: '₹500 OFF', val: 500 }
                    ].map(cpn => (
                      <button
                        key={cpn.label}
                        type="button"
                        onClick={() => setFlatFinalDiscount(cpn.val)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                          flatFinalDiscount === cpn.val
                            ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                            : 'bg-white hover:bg-amber-100/80 text-amber-800 border-amber-300'
                        }`}
                      >
                        {cpn.label}
                      </button>
                    ))}
                    {flatFinalDiscount > 0 && (
                      <button
                        type="button"
                        onClick={() => setFlatFinalDiscount(0)}
                        className="text-[10px] text-red-500 hover:text-red-700 font-bold ml-1 cursor-pointer"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Additional Charges Input Field */}
            {showChargesInput && (
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-bold flex items-center space-x-1">
                  <Coins className="w-4 h-4 text-indigo-500" />
                  <span>Additional / Shipping Charges (₹):</span>
                </span>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    value={additionalCharges || ''}
                    onChange={(e) => setAdditionalCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-24 bg-white border border-slate-200 rounded-lg p-1.5 text-right font-bold outline-none focus:border-indigo-500"
                    placeholder="0"
                  />
                  <button type="button" onClick={() => { setAdditionalCharges(0); setShowChargesInput(false); }} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* TAX/GST CALCULATION BLOCK */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-700 font-bold text-xs">GST Tax Slab:</span>
                <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-black">
                  {[0, 5, 12, 18, 28].map(slab => (
                    <button
                      key={slab}
                      type="button"
                      onClick={() => setTaxPct(slab)}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        taxPct === slab ? 'bg-blue-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {slab}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-slate-500 space-y-1 pt-1.5 border-t border-slate-200 font-medium">
                <div className="flex justify-between">
                  <span>Taxable Base:</span>
                  <span className="font-mono font-bold text-slate-800">
                    ₹{invoiceCalculations.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {taxPct > 0 && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>CGST ({(taxPct / 2).toFixed(1)}%):</span>
                      <span className="font-mono font-bold">
                        ₹{(invoiceCalculations.taxAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>SGST ({(taxPct / 2).toFixed(1)}%):</span>
                      <span className="font-mono font-bold">
                        ₹{(invoiceCalculations.taxAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-slate-800 font-bold pt-0.5 border-t border-slate-100">
                  <span>Total Tax:</span>
                  <span className="font-mono font-black text-blue-700">
                    ₹{invoiceCalculations.taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* AUTO ROUND OFF CHECKBOX AND ADJUSTMENT IN REAL-TIME */}
            <div className="flex justify-between items-center py-1">
              <label className="flex items-center space-x-2 font-bold text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRoundOff}
                  onChange={(e) => setAutoRoundOff(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer focus:ring-0"
                />
                <span>Auto Round Off</span>
              </label>
              {autoRoundOff && invoiceCalculations.roundOffDiff !== 0 && (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold font-mono">
                  {invoiceCalculations.roundOffDiff >= 0 ? '+' : ''}₹{invoiceCalculations.roundOffDiff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {/* DYNAMIC UPI QR TRIGGER */}
            <div className="border-t border-slate-100/80 pt-2.5 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  const newVal = !includePaymentQR;
                  setIncludePaymentQR(newVal);
                  setShowPaymentQR(newVal);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  includePaymentQR
                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>+ Add Payment QR</span>
              </button>
              {includePaymentQR && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-xl font-bold border border-emerald-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  QR Activated
                </span>
              )}
            </div>

            {/* TOTAL GRAND PAYABLE DUE CARD */}
            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="font-black text-slate-800 text-sm">Total Amount:</span>
              <span className="font-black text-xl text-indigo-950 font-mono">
                ₹{invoiceCalculations.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* PAYMENT MANAGEMENT CONTROLS */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 mt-2 space-y-4">
              
              <div className="bg-slate-100/50 p-3 rounded-xl border border-slate-200/60 space-y-3">
                <span className="block text-[10px] uppercase font-black text-slate-500 tracking-wider">Multi-Mode Split Payment Matrix</span>

                {/* 1-Click Fast Settlement Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSplitCash(invoiceCalculations.grandTotal);
                      setSplitUpi(0);
                      setSplitBank(0);
                      setPaidAmount(invoiceCalculations.grandTotal);
                    }}
                    className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-black transition-colors cursor-pointer text-center whitespace-nowrap"
                  >
                    💵 100% Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitCash(0);
                      setSplitUpi(invoiceCalculations.grandTotal);
                      setSplitBank(0);
                      setPaidAmount(invoiceCalculations.grandTotal);
                    }}
                    className="flex-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[10px] font-black transition-colors cursor-pointer text-center whitespace-nowrap"
                  >
                    📱 100% UPI
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitCash(0);
                      setSplitUpi(0);
                      setSplitBank(invoiceCalculations.grandTotal);
                      setPaidAmount(invoiceCalculations.grandTotal);
                    }}
                    className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-[10px] font-black transition-colors cursor-pointer text-center whitespace-nowrap"
                  >
                    🏦 100% Bank
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitCash(0);
                      setSplitUpi(0);
                      setSplitBank(0);
                      setPaidAmount(0);
                    }}
                    className="flex-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[10px] font-black transition-colors cursor-pointer text-center whitespace-nowrap"
                  >
                    ⏳ 100% Credit
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">💵 Cash Amount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={splitCash || ''}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setSplitCash(val);
                        setPaidAmount(val + splitUpi + splitBank);
                      }}
                      placeholder="0"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-black outline-none focus:border-blue-600 font-mono text-right text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">💳 UPI / Online (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={splitUpi || ''}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setSplitUpi(val);
                        setPaidAmount(splitCash + val + splitBank);
                      }}
                      placeholder="0"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-black outline-none focus:border-blue-600 font-mono text-right text-indigo-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">📝 Bank / Cheque (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={splitBank || ''}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setSplitBank(val);
                        setPaidAmount(splitCash + splitUpi + val);
                      }}
                      placeholder="0"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-black outline-none focus:border-blue-600 font-mono text-right text-blue-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">⚠️ Book Debt / Credit (₹)</label>
                    <input
                      type="number"
                      value={invoiceCalculations.balanceDue}
                      disabled
                      placeholder="0"
                      className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-xs font-black outline-none font-mono text-right text-red-600 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 text-[11px]">
                  <span className="font-bold text-slate-500">Total Aggregate Received:</span>
                  <span className="font-black text-slate-800 font-mono text-xs">
                    ₹{(splitCash + splitUpi + splitBank).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-105">
                <label className="flex items-center space-x-1.5 font-bold text-slate-500 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={paidAmount >= invoiceCalculations.grandTotal && invoiceCalculations.grandTotal > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSplitCash(invoiceCalculations.grandTotal);
                        setSplitUpi(0);
                        setSplitBank(0);
                        setPaidAmount(invoiceCalculations.grandTotal);
                      } else {
                        setSplitCash(0);
                        setSplitUpi(0);
                        setSplitBank(0);
                        setPaidAmount(0);
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Mark as fully paid</span>
                  <span title="Auto matches received amount to total amount" className="inline-flex items-center">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                </label>
                
                <div className="text-right">
                  <span className="text-slate-400 font-semibold mr-1.5">Outstanding Balance:</span>
                  <span className={`font-black font-mono ${invoiceCalculations.balanceDue > 0 ? 'text-red-500 text-sm' : 'text-emerald-600'}`}>
                    ₹{invoiceCalculations.balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

            </div>

          </div>

          {/* Active Invoice Theme Indicator & Quick Selector */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-100/80 rounded-xl text-xs border border-slate-200/80">
            <div className="flex items-center gap-1.5 text-slate-700 min-w-0">
              <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[11px] font-bold">Theme for Print & PDF:</span>
              <span className="font-black text-blue-900 text-[11px] bg-white px-2 py-0.5 rounded-md border border-slate-200 truncate">
                {INVOICE_THEMES.find(t => t.id === selectedInvoiceTheme)?.name || 'Modern BillBook'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowThemeModal(true)}
              className="text-[10px] font-black text-blue-600 hover:text-blue-800 hover:underline cursor-pointer shrink-0 ml-2"
            >
              Change Theme
            </button>
          </div>

          {/* Automatic Bill File Save Indicator & Download Option */}
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/80 rounded-xl text-xs border border-emerald-200">
            <div className="flex items-center gap-1.5 text-emerald-900 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[11px] font-bold truncate">
                Auto-Save Bill in File: <span className="font-mono font-black">Saved_Bills_Data.json</span>
              </span>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] font-black text-emerald-800 cursor-pointer shrink-0 ml-2 select-none">
              <input
                type="checkbox"
                checked={autoDownloadBillFile}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAutoDownloadBillFile(val);
                  try {
                    const currentSettings = getSavedAppSettings();
                    saveAppSettings({
                      ...currentSettings,
                      autoBackup: {
                        ...currentSettings.autoBackup,
                        autoDownloadBillFile: val
                      }
                    });
                  } catch {
                    try {
                      localStorage.setItem('auto_download_bill_file', val ? 'true' : 'false');
                    } catch {}
                  }
                }}
                className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer focus:ring-0"
              />
              <span>Auto-Download File</span>
            </label>
          </div>

          {/* Action Buttons: Save & Print vs Save Only */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => handleFormSaveAll(true)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black py-3.5 px-4 rounded-xl text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Save & Print Bill</span>
            </button>
            <button
              type="button"
              onClick={() => handleFormSaveAll(false)}
              className="flex-1 bg-white hover:bg-blue-50 active:scale-98 text-blue-700 border-2 border-blue-600 font-black py-3.5 px-4 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>Save Invoice Only</span>
            </button>
          </div>

        </div>

      </div>



      {/* ----------------- MODAL: SELECT INVOICE THEME ----------------- */}
      {showThemeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 border border-slate-100 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800">
                    Select Invoice Theme
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">Choose layout style for this sales invoice print & PDF</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
              {INVOICE_THEMES.map(theme => {
                const isSelected = selectedInvoiceTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => {
                      setSelectedInvoiceTheme(theme.id);
                      try {
                        const cfg = getSavedPrintConfig();
                        savePrintConfig({ ...cfg, secondaryStyle: theme.id });
                      } catch (e) {}
                    }}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-slate-900 text-xs">{theme.name}</span>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                      ) : (
                        <span className="text-[10px]">{theme.iconBadge}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">{theme.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 font-medium">
                Active: <b className="text-slate-700">{INVOICE_THEMES.find(t => t.id === selectedInvoiceTheme)?.name}</b>
              </span>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm"
              >
                Done / Apply Theme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: BARCODE SCANNER SIMULATION ----------------- */}
      {showBarcodeScanner && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 border border-slate-100 shadow-2xl space-y-4">
            <h3 className="font-black text-sm text-slate-800 flex items-center space-x-2">
              <Barcode className="w-5 h-5 text-indigo-600" />
              <span>Simulate Barcode Gun / Scanner Scan</span>
            </h3>
            
            <form onSubmit={handleBarcodeSearchAndAdd} className="space-y-4">
              <p className="text-xs text-slate-400 font-medium">Type or paste product's unique Barcode SKU code below, then click Enter. Our engine will fetch and insert it directly into your active invoice items.</p>
              
              <input
                type="text"
                required
                autoFocus
                placeholder="Type or scan SKU Barcode (e.g., prodsku)..."
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-3 text-xs outline-none focus:border-indigo-500 font-black font-mono text-center tracking-wider bg-slate-50 uppercase"
              />

              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(false)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Locate & Inject Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: BULK ADD ITEMS FROM INVENTORY ----------------- */}
      {showBulkItemModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 border border-slate-100 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-800 flex items-center space-x-2">
              <span>📦</span>
              <span>Select Bulk Products from Inventory</span>
            </h3>
            
            <input
              type="text"
              placeholder="Search product name or SKU..."
              value={bulkQuery}
              onChange={(e) => setBulkQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 text-xs outline-none focus:border-blue-500 font-semibold"
            />

            <div className="max-h-64 overflow-y-auto border border-slate-150 rounded-xl p-3 space-y-1.5 bg-slate-50 text-xs">
              {filteredBulkProducts.map(p => {
                const isChecked = selectedBulkProductIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center space-x-3 p-2.5 rounded-xl transition-colors cursor-pointer ${
                      isChecked ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-200 bg-white border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleBulkCheckboxToggle(p.id)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-slate-800 block">{p.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold">
                        Price: ₹{p.price} | Stock level: {p.stock} {p.unit}
                      </span>
                    </div>
                  </label>
                );
              })}

              {filteredBulkProducts.length === 0 && (
                <div className="p-8 text-center italic text-slate-400 font-semibold">
                  No inventory products found.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowBulkItemModal(false)}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkItemInject}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Add selected ({selectedBulkProductIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: FAST REGISTER CLIENT ON THE FLY ----------------- */}
      {showFastClientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 border border-slate-10 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-800">👤 Fast Add New Customer</h3>
            
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-sans">Customer Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Yadav"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-sans">Mobile Contact Phone *</label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="e.g. 9876543210"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold outline-none focus:bg-white focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-sans">GSTIN (Optional)</label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 07AAAAA1111A1Z1"
                  value={newClientGst}
                  onChange={(e) => setNewClientGst(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-205 p-3 rounded-xl font-bold uppercase outline-none focus:bg-white focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 font-sans">Billing & Shipping Address</label>
                <input
                  type="text"
                  placeholder="e.g. Ward No 5, Delhi, India"
                  value={newClientAddr}
                  onChange={(e) => setNewClientAddr(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-semibold outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowFastClientModal(false)}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClientFastSave}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
              >
                Save Party
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- DEDICATED ITEM SEARCH & SELECTION MODAL (F2 / + Add Item) ----------------- */}
      {showItemSearchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Search className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-sm text-white">Item Search & Selection</h3>
                  <p className="text-[10px] text-slate-400">Press ↑ ↓ to navigate, Enter to select, Esc to close</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowItemSearchModal(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  ref={modalItemSearchInputRef}
                  type="text"
                  placeholder="Search by product name, SKU, or barcode..."
                  value={modalItemSearchQuery}
                  onChange={(e) => {
                    setModalItemSearchQuery(e.target.value);
                    setHighlightedModalProductIndex(0);
                  }}
                  onKeyDown={handleModalSearchKeyDown}
                  className="w-full bg-white border border-slate-300 rounded-2xl pl-10 pr-9 py-2.5 text-xs font-black text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-xs"
                  autoFocus
                />
                {modalItemSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalItemSearchQuery('');
                      setHighlightedModalProductIndex(0);
                      if (modalItemSearchInputRef.current) modalItemSearchInputRef.current.focus();
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {filteredProductsForModal.map((prod, index) => (
                <div
                  key={prod.id}
                  onClick={() => handleAddProductFromModal(prod)}
                  className={`p-3.5 rounded-2xl flex justify-between items-center text-xs cursor-pointer transition-all ${
                    index === highlightedModalProductIndex
                      ? 'bg-indigo-50 border-2 border-indigo-500 shadow-xs text-indigo-950 font-black'
                      : 'hover:bg-slate-50 text-slate-700 font-semibold border border-transparent'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-slate-900 text-sm">{prod.name}</span>
                      {prod.sku && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded-md font-bold">
                          SKU: {prod.sku}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-[11px]">
                      <span className={`font-mono font-bold ${prod.stock > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        Stock: {prod.stock} {prod.unit || 'Pcs'}
                      </span>
                      {prod.mrp ? (
                        <span className="text-slate-400 font-mono line-through">
                          MRP: ₹{prod.mrp.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right space-y-0.5">
                    <span className="text-base font-black text-indigo-600 font-mono block">
                      ₹{prod.price.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
                      Selling Price
                    </span>
                  </div>
                </div>
              ))}

              {hasCustomOption && (
                <div
                  onClick={() => handleAddProductFromModal(undefined, modalItemSearchQuery.trim())}
                  className={`p-3.5 rounded-2xl flex items-center space-x-3 text-xs cursor-pointer transition-all ${
                    highlightedModalProductIndex === filteredProductsForModal.length
                      ? 'bg-blue-50 border-2 border-blue-500 text-blue-950 font-black'
                      : 'hover:bg-slate-50 text-blue-600 font-bold border border-dashed border-blue-200'
                  }`}
                >
                  <Plus className="w-5 h-5 text-blue-600" />
                  <div>
                    <span className="block font-extrabold">Add Custom Item "{modalItemSearchQuery.trim()}"</span>
                    <span className="text-[10px] text-slate-400">Item not in inventory. Click or press Enter to add.</span>
                  </div>
                </div>
              )}

              {totalModalSelectableItems === 0 && (
                <div className="p-8 text-center text-slate-400 italic text-xs font-semibold space-y-2">
                  <p>No products found matching "{modalItemSearchQuery}".</p>
                  <button
                    type="button"
                    onClick={() => handleAddProductFromModal(undefined, modalItemSearchQuery.trim())}
                    className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    + Add as Custom Item
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer Hints */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500 font-bold">
              <div className="flex items-center space-x-3">
                <span className="flex items-center space-x-1"><kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[9px] shadow-2xs font-mono">↑ ↓</kbd> <span>Navigate</span></span>
                <span className="flex items-center space-x-1"><kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[9px] shadow-2xs font-mono">↵ Enter</kbd> <span>Add to Bill</span></span>
                <span className="flex items-center space-x-1"><kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[9px] shadow-2xs font-mono">Esc</kbd> <span>Close</span></span>
              </div>
              <span>{filteredProductsForModal.length} items found</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
