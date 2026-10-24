import React, { useState, useEffect } from 'react';
import { Estimate, PrintTemplateConfig, SecondaryPrintStyle } from '../types';
import UnifiedBillDocument from './UnifiedBillDocument';
import { getSavedPrintConfig, savePrintConfig, resetPrintConfig } from '../utils/printConfig';
import { requestConfirm } from '../utils/confirmModal';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numberToWords, formatPrice } from '../utils/numberToWords';
import {
  Printer,
  Download,
  Sliders,
  RotateCcw,
  Building2,
  FileText,
  CreditCard,
  Eye,
  Layers,
  Check,
  PlusCircle,
  Sparkles,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';

interface PrintCustomizerProps {
  businessName: string;
  estimates: Estimate[];
  currentUser: string | null;
  onClose?: () => void;
  onNavigateToBilling?: () => void;
}

const COLOR_PRESETS = [
  { name: 'MyBillBook Blue', hex: '#1e40af' },
  { name: 'Emerald Green', hex: '#059669' },
  { name: 'Crimson Maroon', hex: '#991b1b' },
  { name: 'Royal Indigo', hex: '#4338ca' },
  { name: 'Deep Purple', hex: '#6d28d9' },
  { name: 'Slate Black', hex: '#0f172a' },
  { name: 'Sunset Orange', hex: '#ea580c' },
];

const TITLE_PRESETS = [
  'TAX INVOICE',
  'ESTIMATE / BILL OF SUPPLY',
  'RETAIL INVOICE',
  'CASH MEMO',
  'BILL OF SUPPLY'
];

export default function PrintCustomizer({
  businessName,
  estimates,
  currentUser,
  onClose,
  onNavigateToBilling
}: PrintCustomizerProps) {
  // Load saved print configuration
  const [config, setConfig] = useState<PrintTemplateConfig>(() =>
    getSavedPrintConfig(businessName, currentUser || undefined)
  );

  const [activeTab, setActiveTab] = useState<'themes' | 'shop' | 'columns' | 'bank' | 'terms'>('themes');
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | 'sample'>('sample');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [saveToast, setSaveToast] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Realistic sample bill data for testing setup
  const sampleEstimate: Estimate = {
    id: 999999,
    serial: 'INV-2026-001',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    clientId: 1,
    clientName: 'Sharma General Trading Co.',
    clientPhone: '9812345678',
    clientAddr: 'Shop 4, Grain Market, North Sector, Delhi - 110006',
    clientGstin: '07ABCDE1234F1Z5',
    deliveryNote: 'Direct Store Handover / Courier Dispatch',
    terms: '1. Goods once sold will not be taken back or exchanged.\n2. Warranty claims are directly handled by authorized manufacturer service centers.\n3. All disputes subject to local jurisdiction only.',
    subtotal: 4850,
    taxPct: 5,
    taxAmt: 242.5,
    cashDiscount: 100,
    flatFinalDiscount: 0,
    grandTotal: 4992.5,
    paidAmount: 4000,
    balanceDue: 992.5,
    status: 'PARTIAL',
    items: [
      {
        name: 'Fortune Sunlite Refined Sunflower Oil 1L',
        qty: 10,
        unit: 'Pcs',
        mrp: 175,
        price: 155,
        disc: 11.4,
        total: 1550,
        purchasePrice: 140,
        sku: '1512'
      },
      {
        name: 'Aashirvaad Shudh Superior Chakki Atta 10Kg',
        qty: 4,
        unit: 'Bag',
        mrp: 460,
        price: 410,
        disc: 10.8,
        total: 1640,
        purchasePrice: 380,
        sku: '1101'
      },
      {
        name: 'Tata Premium Tea Gold Blend 500g',
        qty: 6,
        unit: 'Pkt',
        mrp: 320,
        price: 280,
        disc: 12.5,
        total: 1680,
        purchasePrice: 255,
        sku: '0902'
      }
    ],
    splitCash: 2500,
    splitUpi: 1500,
    splitBank: 0,
    splitCredit: 992.5,
    splitPayments: {
      cash: 2500,
      upi: 1500,
      bank: 0,
      credit: 992.5
    },
    includePaymentQR: false
  };

  const previewEstimate = selectedEstimateId === 'sample'
    ? sampleEstimate
    : estimates.find(e => e.id === selectedEstimateId) || sampleEstimate;

  // Listen to configuration updates from anywhere in the app
  useEffect(() => {
    const handleConfigSync = () => {
      const updated = getSavedPrintConfig(businessName, currentUser || undefined);
      setConfig(updated);
    };
    window.addEventListener('pos_print_config_updated', handleConfigSync);
    return () => window.removeEventListener('pos_print_config_updated', handleConfigSync);
  }, [businessName, currentUser]);

  // Handle configuration updates and auto-save
  const handleUpdateConfig = (newConfig: PrintTemplateConfig) => {
    setConfig(newConfig);
    savePrintConfig(newConfig, currentUser || undefined);
    window.dispatchEvent(new CustomEvent('pos_print_config_updated', { detail: newConfig }));
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const handleLayoutChange = (newLayout: 'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58') => {
    handleUpdateConfig({ ...config, layout: newLayout });
  };

  // Synchronize dynamic paper class (A5 vs A4) on document.body
  useEffect(() => {
    const syncPaperClass = () => {
      const mqlA5 = window.matchMedia('(width: 148mm)');
      const detectedPaper = config.layout === 'A5' || mqlA5.matches ? 'A5' : 'A4';
      document.body.classList.remove('A4', 'A5');
      document.body.classList.add(detectedPaper);
    };
    syncPaperClass();
    const mediaQuery = window.matchMedia('(width: 148mm)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', syncPaperClass);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', syncPaperClass);
      }
    };
  }, [config.layout]);

  const handleResetConfig = async () => {
    const confirmed = await requestConfirm({
      title: 'Reset Print Setup',
      message: 'Reset print setup & layout back to standard default values? (डिफ़ॉल्ट सेटिंग्स रीसेट करें?)',
      confirmText: 'Reset Defaults',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (confirmed) {
      const reset = resetPrintConfig(businessName);
      setConfig(reset);
      window.dispatchEvent(new CustomEvent('pos_print_config_updated', { detail: reset }));
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
    }
  };

  // Generate dynamic QR Code for UPI ONLY when explicitly selected
  useEffect(() => {
    if (!config.showQrCode) {
      setQrCodeDataUrl('');
      return;
    }
    const effectiveUpiId = config.upiId || 'merchant@upi';
    const effectiveStoreName = config.businessName || businessName;
    const amountToPay = previewEstimate.balanceDue > 0 ? previewEstimate.balanceDue : previewEstimate.grandTotal;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(effectiveUpiId)}&am=${amountToPay.toFixed(2)}&pn=${encodeURIComponent(effectiveStoreName)}&tn=Invoice%20${encodeURIComponent(previewEstimate.serial)}`;

    QRCode.toDataURL(upiUrl, {
      margin: 1,
      width: 256,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => {
        setQrCodeDataUrl(url);
      })
      .catch(err => {
        console.error('Failed to generate dynamic UPI QR code:', err);
      });
  }, [previewEstimate, businessName, config.upiId, config.businessName, config.showQrCode]);

  // Simple print command trigger
  const handlePrintTrigger = () => {
    window.print();
  };

  // Direct WebUSB Thermal Print
  const handleDirectESCPOSThermalPrint = async () => {
    try {
      if ('usb' in navigator) {
        const device = await (navigator as any).usb.requestDevice({ filters: [] });
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);

        const encoder = new TextEncoder();
        let commands = '\x1B\x40'; // ESC @
        commands += '\x1B\x61\x01'; // ESC a 1 (center)
        commands += `${config.businessName || businessName}\n`;
        commands += `${config.billTitle || 'ESTIMATE'}: ${previewEstimate.serial}\n`;
        commands += `DATE: ${previewEstimate.date}\n`;
        commands += `--------------------------------\n`;
        commands += '\x1B\x61\x00'; // ESC a 0 (left)
        previewEstimate.items.forEach(itm => {
          commands += `${itm.name.substring(0, 18)} x${itm.qty} = Rs.${formatPrice(itm.total)}\n`;
        });
        commands += `--------------------------------\n`;
        commands += `TOTAL: Rs.${formatPrice(previewEstimate.grandTotal)}\n`;
        commands += `PAID: Rs.${formatPrice(previewEstimate.paidAmount)}\n`;
        commands += `BAL DUE: Rs.${formatPrice(previewEstimate.balanceDue)}\n\n`;
        commands += '\x1B\x61\x01';
        commands += `${config.footerNote || 'Thank you! Visit Again.'}\n\n\n\x1D\x56\x01`;

        const data = encoder.encode(commands);
        const endpoint = device.configuration.interfaces[0].alternate.endpoints.find((e: any) => e.direction === 'out');
        await device.transferOut(endpoint ? endpoint.endpointNumber : 1, data);
        alert('Sent to Thermal Printer via WebUSB!');
      } else {
        window.print();
      }
    } catch (e) {
      console.warn("Direct WebUSB Thermal Print warning, falling back to window print:", e);
      window.print();
    }
  };

  // Download PDF
  const exportInvoicePDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: config.layout === 'A5' ? 'a5' : 'a4'
    });

    const activeStoreName = config.businessName || businessName || "Business Billing";
    const primaryColor = [30, 41, 59];
    const secondaryColor = [30, 64, 175];
    const grayColor = [100, 116, 139];

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(activeStoreName, 14, 18);

    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    if (config.tagline) doc.text(config.tagline, 14, 23);
    if (config.address) doc.text(config.address, 14, 27);

    const contactParts = [];
    if (config.phone) contactParts.push(`Phone: +91 ${config.phone}`);
    if (config.gstin) contactParts.push(`GSTIN: ${config.gstin}`);
    if (config.state) contactParts.push(`State: ${config.state}`);
    if (contactParts.length > 0) doc.text(contactParts.join(" | "), 14, 31);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(config.billTitle || "TAX INVOICE", 196, 18, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text(`Invoice #: ${previewEstimate.serial}`, 196, 23, { align: "right" });
    doc.text(`Date: ${previewEstimate.date}`, 196, 27, { align: "right" });

    let startYOffset = 36;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("BILLED TO / PARTY DETAILS:", 14, startYOffset);

    doc.setFontSize(8.5);
    doc.text(previewEstimate.clientName || 'Cash Customer', 14, startYOffset + 4);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    if (previewEstimate.clientPhone) doc.text(`Mobile: +91 ${previewEstimate.clientPhone}`, 14, startYOffset + 8);
    if (previewEstimate.clientAddr) doc.text(`Address: ${previewEstimate.clientAddr}`, 14, startYOffset + 12);

    const headers = [["#", "ITEM DESCRIPTION", "QTY", "RATE", "DISC", "TOTAL"]];
    const bodyRows = previewEstimate.items.map((itm, idx) => [
      (idx + 1).toString(),
      itm.name + (config.showUnit && itm.unit ? ` (${itm.unit})` : ''),
      itm.qty.toString(),
      `INR ${formatPrice(itm.price)}`,
      itm.disc ? `${itm.disc}%` : '-',
      `INR ${formatPrice(itm.total)}`
    ]);

    autoTable(doc, {
      startY: startYOffset + 18,
      head: headers,
      body: bodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5
      }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    const summaryX = 130;
    let currentSummaryY = finalY + 8;
    const addLine = (lbl: string, val: string, bold = false) => {
      doc.setFont("Helvetica", bold ? "bold" : "normal");
      doc.text(lbl, summaryX, currentSummaryY);
      doc.text(val, 196, currentSummaryY, { align: "right" });
      currentSummaryY += 5;
    };

    addLine("Sub-Total:", `INR ${formatPrice(previewEstimate.subtotal)}`);
    if (previewEstimate.taxAmt > 0) addLine(`Tax (${previewEstimate.taxPct}%):`, `+ INR ${formatPrice(previewEstimate.taxAmt)}`);
    if (previewEstimate.cashDiscount > 0) addLine("Discount:", `- INR ${formatPrice(previewEstimate.cashDiscount)}`);
    addLine("Grand Total:", `INR ${formatPrice(previewEstimate.grandTotal)}`, true);
    addLine("Received:", `INR ${formatPrice(previewEstimate.paidAmount)}`);
    addLine("Balance Due:", `INR ${formatPrice(previewEstimate.balanceDue)}`, true);

    let notesY = finalY + 8;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Amount in Words:", 14, notesY);
    doc.setFont("Helvetica", "normal");
    doc.text(numberToWords(Math.round(previewEstimate.grandTotal)), 14, notesY + 4);

    const cleanCustomerName = (previewEstimate.clientName || 'CUSTOMER').replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
    const cleanSerial = (previewEstimate.serial || 'EST').replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
    doc.save(`${cleanCustomerName}_${cleanSerial}.pdf`);
  };

  return (
    <div className="space-y-5 animate-fade-in pb-16">
      
      {/* ----------------- TOP TOOLBAR & CONTROLS ----------------- */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 no-print">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl shadow-2xs">
              <Sliders className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span>Invoice Customizer</span>
                <span className="text-xs font-bold text-slate-400 font-sans hidden sm:inline">&bull; Print Templates & Layout</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Customize templates, themes, accent colors, store details, and bill columns
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-stretch lg:self-auto justify-between lg:justify-end">
          {/* Bill Preview Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Preview:</span>
            <select
              value={selectedEstimateId}
              onChange={(e) => setSelectedEstimateId(e.target.value === 'sample' ? 'sample' : Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none cursor-pointer text-slate-800 shadow-2xs hover:bg-white"
            >
              <option value="sample">✨ Sample Retail Bill (Fortune Oil, Atta, Tea)</option>
              {estimates.slice(0, 15).map(est => (
                <option key={est.id} value={est.id}>
                  Invoice #{est.serial} - {est.clientName || 'Cash Sale'} (₹{est.grandTotal})
                </option>
              ))}
            </select>
          </div>

          {/* Jump to Create Bill button */}
          {onNavigateToBilling && (
            <button
              onClick={onNavigateToBilling}
              className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer flex items-center space-x-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create New Bill</span>
            </button>
          )}

          {/* Action Buttons */}
          <button
            onClick={handlePrintTrigger}
            className="bg-slate-900 hover:bg-black active:scale-95 text-white font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer flex items-center space-x-1.5"
            title="Print invoice with current customizer settings"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Bill</span>
          </button>

          <button
            onClick={exportInvoicePDF}
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer flex items-center space-x-1.5"
            title="Download PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          <button
            onClick={handleDirectESCPOSThermalPrint}
            className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all shadow-xs cursor-pointer hidden sm:flex items-center space-x-1"
            title="Direct WebUSB Thermal Printer"
          >
            <span>⚡ Thermal</span>
          </button>
        </div>
      </div>

      {/* ----------------- DUAL-PANE WORKSPACE ----------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN (5 Cols): MyBillBook Settings Controls */}
        <div className="lg:col-span-5 space-y-4 no-print">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            
            {/* MyBillBook Navigation Tabs */}
            <div className="flex border-b border-slate-150 bg-slate-50/70 p-1.5 gap-1 overflow-x-auto text-xs font-bold">
              {[
                { id: 'themes', label: 'Theme & Color', icon: Layers },
                { id: 'shop', label: 'Shop Profile', icon: Building2 },
                { id: 'columns', label: 'Bill Columns', icon: Eye },
                { id: 'bank', label: 'Bank & UPI', icon: CreditCard },
                { id: 'terms', label: 'Terms & Sign', icon: FileText }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-all text-[11px] ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white font-black shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT PANELS */}
            <div className="p-4 sm:p-5 space-y-4">
              
              {/* TAB 1: THEMES & COLORS */}
              {activeTab === 'themes' && (
                <div className="space-y-4 animate-fade-in text-xs">
                  {/* Theme Presets */}
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-2">
                      1. Select Invoice Theme
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { id: 'estimate', name: 'Estimate', desc: 'Classic bordered A5/A4 paginated Estimate sheet (20 rows/page) with MRP, Rate & Disc%' },
                        { id: 'modern', name: 'Modern BillBook', desc: 'Colored header & clean rounded cards (MyBillBook Signature)' },
                        { id: 'classic_gst', name: 'Classic GST Tax Invoice', desc: 'Formal Indian GST grid, HSN table, state codes & tax breakdown' },
                        { id: 'minimal', name: 'Minimalist Clean', desc: 'Monochrome corporate aesthetic, hairline dividers & pure focus on items' },
                        { id: 'wholesale', name: 'Compact Retail', desc: 'Space-saving layout, maximum items per sheet' },
                        { id: 'stylish', name: 'Stylish Premium', desc: 'Vibrant header banner, rounded badges, QR pay highlight & modern cards' },
                        { id: 'thermal', name: 'Thermal POS Roll', desc: 'Optimized for 80mm & 58mm receipt printers' },
                      ].map(themeItem => {
                        const isSelected = themeItem.id === 'thermal' 
                          ? (config.layout === 'THERMAL_80' || config.layout === 'THERMAL_58')
                          : (config.secondaryStyle === themeItem.id && config.layout !== 'THERMAL_80' && config.layout !== 'THERMAL_58');

                        return (
                          <div
                            key={themeItem.id}
                            onClick={() => {
                              if (themeItem.id === 'thermal') {
                                handleLayoutChange('THERMAL_80');
                              } else {
                                handleUpdateConfig({
                                  ...config,
                                  secondaryStyle: themeItem.id as SecondaryPrintStyle,
                                  layout: config.layout === 'THERMAL_80' || config.layout === 'THERMAL_58' ? 'A4' : config.layout
                                });
                              }
                            }}
                            className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-slate-900 text-xs">{themeItem.name}</span>
                              {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 leading-snug">{themeItem.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accent Color Palette */}
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-2">
                      2. Theme Accent Color
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {COLOR_PRESETS.map(c => (
                        <button
                          key={c.hex}
                          onClick={() => handleUpdateConfig({ ...config, primaryColor: c.hex })}
                          className={`w-8 h-8 rounded-xl border-2 transition-transform cursor-pointer flex items-center justify-center ${
                            config.primaryColor === c.hex ? 'border-slate-900 scale-110 shadow-sm' : 'border-white'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        >
                          {config.primaryColor === c.hex && <Check className="w-4 h-4 text-white" />}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5 pl-1">
                        <input
                          type="color"
                          value={config.primaryColor || '#1e40af'}
                          onChange={(e) => handleUpdateConfig({ ...config, primaryColor: e.target.value })}
                          className="w-8 h-8 rounded-xl cursor-pointer border border-slate-300 p-0.5 bg-white shadow-2xs"
                          title="Custom Color Picker"
                        />
                        <span className="text-[10px] font-mono text-slate-500 font-bold">{config.primaryColor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Document Main Title */}
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                      3. Document Title
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {TITLE_PRESETS.map(t => (
                        <button
                          key={t}
                          onClick={() => handleUpdateConfig({ ...config, billTitle: t })}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                            config.billTitle === t
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={config.billTitle}
                      onChange={(e) => handleUpdateConfig({ ...config, billTitle: e.target.value })}
                      placeholder="TAX INVOICE"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  {/* Document Subtitle */}
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      4. Secondary Subtitle / Copy
                    </label>
                    <input
                      type="text"
                      value={config.secondaryBillTitle || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, secondaryBillTitle: e.target.value })}
                      placeholder="Original for Recipient"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: SHOP PROFILE */}
              {activeTab === 'shop' && (
                <div className="space-y-3.5 animate-fade-in text-xs">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={config.businessName}
                      onChange={(e) => handleUpdateConfig({ ...config, businessName: e.target.value })}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Tagline / Slogan
                    </label>
                    <input
                      type="text"
                      value={config.tagline || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, tagline: e.target.value })}
                      placeholder="All Grocery & FMCG Wholesale & Retail"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Full Address
                    </label>
                    <textarea
                      rows={2}
                      value={config.address || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, address: e.target.value })}
                      placeholder="Shop No, Commercial Complex, Main Market, City"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={config.phone || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, phone: e.target.value })}
                        placeholder="9876543210"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={config.email || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, email: e.target.value })}
                        placeholder="billing@shop.com"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                        GSTIN / Tax ID
                      </label>
                      <input
                        type="text"
                        value={config.gstin || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, gstin: e.target.value.toUpperCase() })}
                        placeholder="07AAAAA0000A1Z5"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono uppercase text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                        PAN Number
                      </label>
                      <input
                        type="text"
                        value={config.pan || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, pan: e.target.value.toUpperCase() })}
                        placeholder="AAAAA0000A"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono uppercase text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      State & State Code
                    </label>
                    <input
                      type="text"
                      value={config.state || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, state: e.target.value })}
                      placeholder="07 - Delhi"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: TABLE COLUMNS */}
              {activeTab === 'columns' && (
                <div className="space-y-3 animate-fade-in text-xs">
                  <p className="text-[11px] text-slate-500 font-medium">
                    Configure which columns appear in your printed invoice table:
                  </p>
                  <div className="space-y-2">
                    {[
                      { key: 'showHsn', label: 'Item Code / HSN/SAC Column', desc: 'Show product SKU or HSN code in bill table' },
                      { key: 'showUnit', label: 'Unit Column (Pcs, Kg, Box)', desc: 'Display packaging unit for each product' },
                      { key: 'showMrp', label: 'MRP Column', desc: 'Show MRP column and savings in bill' },
                      { key: 'showRate', label: 'Rate / Unit Selling Price', desc: 'Show billing rate per unit' },
                      { key: 'showDiscount', label: 'Discount % Column', desc: 'Show item-level discount percentage' },
                    ].map(col => (
                      <label
                        key={col.key}
                        className="flex items-start space-x-3 p-3 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={(config as any)[col.key] !== false}
                          onChange={(e) => handleUpdateConfig({ ...config, [col.key]: e.target.checked })}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                        <div>
                          <span className="font-extrabold text-slate-800 text-xs block">{col.label}</span>
                          <span className="text-[10px] text-slate-500">{col.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: BANK & UPI QR */}
              {activeTab === 'bank' && (
                <div className="space-y-3.5 animate-fade-in text-xs">
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="font-black text-slate-900 text-xs block">Bank Transfer Details</span>
                      <span className="text-[10px] text-slate-500">Print bank account details on invoice</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.showBankDetails !== false}
                      onChange={(e) => handleUpdateConfig({ ...config, showBankDetails: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={config.bankName || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, bankName: e.target.value })}
                        placeholder="State Bank of India"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Account No</label>
                      <input
                        type="text"
                        value={config.accountNo || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, accountNo: e.target.value })}
                        placeholder="349012384910"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">IFSC Code</label>
                      <input
                        type="text"
                        value={config.ifscCode || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, ifscCode: e.target.value.toUpperCase() })}
                        placeholder="SBIN0001234"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono uppercase text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Branch</label>
                      <input
                        type="text"
                        value={config.branchName || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, branchName: e.target.value })}
                        placeholder="Main Branch"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl flex items-center justify-between mb-3">
                      <div>
                        <span className="font-black text-slate-900 text-xs block">Scan to Pay UPI QR Code</span>
                        <span className="text-[10px] text-slate-500">Enable direct mobile payment QR on invoices</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(config.showQrCode)}
                        onChange={(e) => handleUpdateConfig({ ...config, showQrCode: e.target.checked })}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                        UPI ID (VPA)
                      </label>
                      <input
                        type="text"
                        value={config.upiId || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, upiId: e.target.value })}
                        placeholder="merchant@upi"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: TERMS & SIGNATURE */}
              {activeTab === 'terms' && (
                <div className="space-y-3.5 animate-fade-in text-xs">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Terms Header Title
                    </label>
                    <input
                      type="text"
                      value={config.termsHeader || 'Terms & Conditions'}
                      onChange={(e) => handleUpdateConfig({ ...config, termsHeader: e.target.value })}
                      placeholder="Terms & Conditions"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Terms & Conditions Text
                    </label>
                    <textarea
                      rows={3}
                      value={config.terms}
                      onChange={(e) => handleUpdateConfig({ ...config, terms: e.target.value })}
                      placeholder="1. Goods once sold will not be returned..."
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs font-sans outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Footer Greeting / Note
                    </label>
                    <input
                      type="text"
                      value={config.footerNote || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, footerNote: e.target.value })}
                      placeholder="Thank You! Visit Again."
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-xs outline-none focus:border-blue-500 shadow-2xs"
                    />
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between mb-3">
                      <div>
                        <span className="font-black text-slate-900 text-xs block">Signature Box</span>
                        <span className="text-[10px] text-slate-500">Show authorized signature and stamp box</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.showSignatureBox !== false}
                        onChange={(e) => handleUpdateConfig({ ...config, showSignatureBox: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                        Authorized Signatory Label
                      </label>
                      <input
                        type="text"
                        value={config.authorizedSignatoryLabel || ''}
                        onChange={(e) => handleUpdateConfig({ ...config, authorizedSignatoryLabel: e.target.value })}
                        placeholder="Authorized Signatory"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Status & Reset Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-150 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {saveToast ? (
                  <span className="text-[11px] font-black text-emerald-600 flex items-center gap-1 animate-fade-in">
                    <Check className="w-3.5 h-3.5" />
                    <span>Auto-Saved & Applied</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-slate-400">
                    Changes auto-save instantly
                  </span>
                )}
              </div>

              <button
                onClick={handleResetConfig}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl border border-red-200 cursor-pointer flex items-center gap-1 transition-colors"
                title="Restore MyBillBook default settings"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN (7 Cols): Live Real-Time Invoice Document Preview */}
        <div className="lg:col-span-7 space-y-3">
          
          {/* Top Paper Format Bar & Zoom Controls */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2.5 no-print">
            
            {/* Paper Size Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
              {[
                { id: 'A4', label: '📄 A4 Sheet' },
                { id: 'A5', label: '📑 A5 Sheet' },
                { id: 'THERMAL_80', label: '📠 80mm Roll' },
                { id: 'THERMAL_58', label: '📠 58mm Roll' },
              ].map(paper => (
                <button
                  key={paper.id}
                  onClick={() => handleLayoutChange(paper.id as any)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    config.layout === paper.id
                      ? 'bg-blue-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {paper.label}
                </button>
              ))}
            </div>

            {/* Zoom / Scale Controls */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
              <button
                onClick={() => setZoomLevel(Math.max(60, zoomLevel - 10))}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-12 text-center text-[11px] font-mono">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel(Math.min(130, zoomLevel + 10))}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                title="Reset Zoom"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Authentic Paper Canvas Container with Drop Shadow */}
          <div className="bg-slate-200/70 p-4 sm:p-6 rounded-3xl border border-slate-300/80 shadow-inner overflow-x-auto min-h-[500px] flex justify-center items-start">
            <div
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out'
              }}
              className="transition-all"
            >
              <UnifiedBillDocument
                estimate={previewEstimate}
                config={config}
                qrCodeDataUrl={qrCodeDataUrl}
                isPrintPreview={true}
              />
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
