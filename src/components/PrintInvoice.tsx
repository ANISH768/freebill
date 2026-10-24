import React, { useState, useEffect } from 'react';
import { Estimate, PrintTemplateConfig, SecondaryPrintStyle } from '../types';
import { 
  Printer, 
  X, 
  Download, 
  Sliders, 
  RotateCcw, 
  Building2, 
  FileText, 
  CreditCard, 
  Eye, 
  Layers, 
  Check,
  Palette
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { getSavedPrintConfig, savePrintConfig, resetPrintConfig } from '../utils/printConfig';
import { requestConfirm } from '../utils/confirmModal';
import UnifiedBillDocument, { calculateInvoiceSheetCount } from './UnifiedBillDocument';
import { numberToWords, formatPrice } from '../utils/numberToWords';

interface PrintInvoiceProps {
  estimate: Estimate;
  businessName: string;
  currentUser?: string | null;
  onClose?: () => void;
  onOpenCustomizer?: () => void;
  isEmbedded?: boolean;
  defaultOpenDrawer?: boolean;
  autoTriggerPrint?: boolean;
  onAutoPrintTriggered?: () => void;
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

export default function PrintInvoice({
  estimate,
  businessName,
  currentUser,
  onClose,
  onOpenCustomizer,
  isEmbedded = false,
  defaultOpenDrawer = false,
  autoTriggerPrint = false,
  onAutoPrintTriggered
}: PrintInvoiceProps) {
  // Load saved print configuration (QR code is strictly off unless explicitly selected for this bill)
  const [config, setConfig] = useState<PrintTemplateConfig>(() => {
    const saved = getSavedPrintConfig(businessName, currentUser || undefined);
    return {
      ...saved,
      secondaryStyle: estimate?.invoiceTheme || saved.secondaryStyle,
      showQrCode: Boolean(estimate?.includePaymentQR),
    };
  });

  // Sync printLayout with saved config (A4, A5, THERMAL_80, THERMAL_58)
  const [printLayout, setPrintLayout] = useState<'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58'>(() => {
    return config.layout || 'A4';
  });

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [showCustomizeDrawer, setShowCustomizeDrawer] = useState<boolean>(defaultOpenDrawer);
  const [drawerTab, setDrawerTab] = useState<'layout' | 'header' | 'columns' | 'bank' | 'terms'>('layout');
  const [saveToast, setSaveToast] = useState<boolean>(false);

  // Cross-component live synchronization
  useEffect(() => {
    const handleConfigSync = () => {
      const updated = getSavedPrintConfig(businessName, currentUser || undefined);
      setConfig(prev => ({
        ...updated,
        showQrCode: prev.showQrCode,
      }));
      setPrintLayout(updated.layout);
    };
    window.addEventListener('pos_print_config_updated', handleConfigSync);
    return () => window.removeEventListener('pos_print_config_updated', handleConfigSync);
  }, [businessName, currentUser]);

  // Reset QR selection to bill's explicit includePaymentQR setting when switching bills
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      showQrCode: Boolean(estimate?.includePaymentQR),
    }));
  }, [estimate?.id, estimate?.includePaymentQR]);

  // Handle configuration updates and auto-save
  const handleUpdateConfig = (newConfig: PrintTemplateConfig) => {
    setConfig(newConfig);
    savePrintConfig(newConfig, currentUser || undefined);
    window.dispatchEvent(new CustomEvent('pos_print_config_updated', { detail: newConfig }));
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const handleLayoutChange = (newLayout: 'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58') => {
    setPrintLayout(newLayout);
    handleUpdateConfig({ ...config, layout: newLayout });
  };

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
      setPrintLayout(reset.layout);
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
    const effectiveUpiId = config.upiId || (estimate as any).upiId || 'merchant@upi';
    const effectiveStoreName = config.businessName || businessName;
    const amountToPay = estimate.balanceDue > 0 ? estimate.balanceDue : estimate.grandTotal;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(effectiveUpiId)}&am=${amountToPay.toFixed(2)}&pn=${encodeURIComponent(effectiveStoreName)}&tn=Invoice%20${encodeURIComponent(estimate.serial)}`;

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
  }, [estimate, businessName, config.upiId, config.businessName, config.showQrCode]);

  // Set page document.title to CustomerName_EstimateNumber and synchronize dynamic paper class (A5 / A4) on document.body
  useEffect(() => {
    const origTitle = document.title;
    const cleanCustomerName = (estimate.clientName || 'CUSTOMER').replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
    const cleanSerial = (estimate.serial || 'EST').replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
    document.title = `${cleanCustomerName}_${cleanSerial}`;
    document.body.classList.add('printing-active');

    const syncPaperClass = () => {
      const mqlA5 = window.matchMedia('(width: 148mm)');
      const detectedPaper = printLayout === 'A5' || mqlA5.matches ? 'A5' : 'A4';
      document.body.classList.remove('A4', 'A5');
      document.body.classList.add(detectedPaper);
    };

    syncPaperClass();
    const mediaQuery = window.matchMedia('(width: 148mm)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', syncPaperClass);
    }

    return () => {
      document.title = origTitle;
      document.body.classList.remove('printing-active');
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', syncPaperClass);
      }
    };
  }, [estimate, printLayout]);

  // Automatically trigger browser print dialog when opened via F3 / Save & Print
  useEffect(() => {
    if (!autoTriggerPrint || isEmbedded) return;
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Auto print dialog trigger warning:', err);
      }
      if (onAutoPrintTriggered) {
        onAutoPrintTriggered();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [autoTriggerPrint, isEmbedded, estimate?.id]);

  // Allow pressing F3 or Ctrl+P inside Print Preview modal to open print dialog
  useEffect(() => {
    if (isEmbedded) return;
    const handlePrintKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        e.stopPropagation();
        window.print();
      }
    };
    window.addEventListener('keydown', handlePrintKeyDown, true);
    return () => window.removeEventListener('keydown', handlePrintKeyDown, true);
  }, [isEmbedded]);

  // Direct WebUSB / ESC-POS Thermal Printer Handler
  const handleDirectESCPOSThermalPrint = async () => {
    try {
      if ('usb' in navigator) {
        const device = await (navigator as any).usb.requestDevice({ filters: [] });
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);

        const encoder = new TextEncoder();
        let commands = '\x1B\x40'; // ESC @ - Initialize printer
        commands += '\x1B\x61\x01'; // ESC a 1 - Center align
        commands += `${config.businessName || businessName}\n`;
        commands += `${config.billTitle || 'ESTIMATE'}: ${estimate.serial}\n`;
        commands += `DATE: ${estimate.date}\n`;
        commands += `--------------------------------\n`;
        commands += '\x1B\x61\x00'; // ESC a 0 - Left align
        estimate.items.forEach(itm => {
          commands += `${itm.name.substring(0, 18)} x${itm.qty} = Rs.${formatPrice(itm.total)}\n`;
        });
        commands += `--------------------------------\n`;
        commands += `TOTAL: Rs.${formatPrice(estimate.grandTotal)}\n`;
        commands += `PAID: Rs.${formatPrice(estimate.paidAmount)}\n`;
        commands += `BAL DUE: Rs.${formatPrice(estimate.balanceDue)}\n\n`;
        commands += '\x1B\x61\x01';
        commands += `${config.footerNote || 'Thank you! Visit Again.'}\n\n\n\x1D\x56\x01`; // GS V 1 - Paper cut

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

  // Simple print command trigger
  const handlePrintTrigger = () => {
    window.print();
  };

  const exportInvoicePDF = () => {
    const isA5Mode = printLayout === 'A5';
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: isA5Mode ? 'a5' : 'a4',
    });

    const pageWidth = isA5Mode ? 148 : 210;
    const pageHeight = isA5Mode ? 210 : 297;
    const margin = isA5Mode ? 5 : 6;
    const innerWidth = pageWidth - margin * 2;
    const innerHeight = pageHeight - margin * 2;

    const activeStoreName = config.businessName || businessName || 'Business Billing';
    const primaryColor: [number, number, number] = [15, 23, 42];
    const secondaryColor: [number, number, number] = [30, 64, 175];
    const grayColor: [number, number, number] = [71, 85, 105];

    const headers = [['#', 'ITEM DESCRIPTION', 'QTY', 'RATE', 'DISC', 'TOTAL']];
    const allRows = (estimate.items || []).map((itm, idx) => [
      (idx + 1).toString(),
      itm.name + (config.showUnit && itm.unit ? ` (${itm.unit})` : ''),
      itm.qty.toString(),
      `INR ${formatPrice(itm.price)}`,
      itm.disc ? `${itm.disc}%` : '-',
      `INR ${formatPrice(itm.total)}`,
    ]);

    const totalSheets = calculateInvoiceSheetCount(allRows.length, isA5Mode ? 'A5' : 'A4');

    const drawPageBorderAndHeader = (pageNum: number, totalPgs: number) => {
      // Visible outer border around the entire invoice area on each printed page
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.rect(margin, margin, innerWidth, innerHeight);

      // Header - Business Profile
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(isA5Mode ? 12 : 15);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(activeStoreName, margin + 4, margin + 7);

      doc.setFontSize(isA5Mode ? 7 : 8);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      if (config.tagline) {
        doc.text(config.tagline, margin + 4, margin + 11);
      }
      if (config.address) {
        doc.text(config.address, margin + 4, margin + 14.5);
      }

      const contactParts = [];
      if (config.phone) contactParts.push(`Ph: +91 ${config.phone}`);
      if (config.gstin) contactParts.push(`GSTIN: ${config.gstin}`);
      if (config.state) contactParts.push(`State: ${config.state}`);
      if (contactParts.length > 0) {
        doc.text(contactParts.join(' | '), margin + 4, margin + 18);
      }

      // Bill Title & Page Badge on the right
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(isA5Mode ? 9.5 : 11);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(config.billTitle || 'ESTIMATE', pageWidth - margin - 4, margin + 7, {
        align: 'right',
      });

      doc.setFontSize(isA5Mode ? 7 : 8);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`PAGE ${pageNum} OF ${totalPgs}`, pageWidth - margin - 4, margin + 11, {
        align: 'right',
      });

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text(`Invoice #: ${estimate.serial}`, pageWidth - margin - 4, margin + 14.5, {
        align: 'right',
      });
      doc.text(`Date: ${estimate.date}`, pageWidth - margin - 4, margin + 18, {
        align: 'right',
      });

      // Divider line under header
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.35);
      doc.line(margin, margin + 20.5, pageWidth - margin, margin + 20.5);

      // Customer Info Box
      const partyY = margin + 24.5;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(isA5Mode ? 7.5 : 8.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`BUYER: ${estimate.clientName || 'Cash Customer'}`, margin + 4, partyY);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(isA5Mode ? 7 : 8);
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      const partyMeta = [];
      if (estimate.clientPhone) partyMeta.push(`Ph: +91 ${estimate.clientPhone}`);
      if (estimate.clientAddr) partyMeta.push(`Addr: ${estimate.clientAddr}`);
      if (partyMeta.length > 0) {
        doc.text(partyMeta.join(' | '), margin + 4, partyY + 4);
      }
      doc.line(margin, partyY + 6.5, pageWidth - margin, partyY + 6.5);
      return partyY + 8.5;
    };

    const startY = drawPageBorderAndHeader(1, totalSheets);
    const dynamicFontSize = isA5Mode
      ? allRows.length > 11
        ? 6.5
        : 7.2
      : allRows.length > 18
      ? 7.2
      : 8;
    const dynamicPadding = isA5Mode
      ? allRows.length > 11
        ? 1.1
        : 1.6
      : allRows.length > 18
      ? 1.5
      : 2.2;

    autoTable(doc, {
      startY,
      margin: {
        left: margin + 2,
        right: margin + 2,
        top: margin + 10,
        bottom: margin + (isA5Mode ? 34 : 38),
      },
      head: headers,
      body: allRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: isA5Mode ? 7 : 8,
        fontStyle: 'bold',
        halign: 'center',
      },
      styles: {
        fontSize: dynamicFontSize,
        cellPadding: dynamicPadding,
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.5);
          doc.rect(margin, margin, innerWidth, innerHeight);
        }
      },
    });

    const finalY = Math.min(
      (doc as any).lastAutoTable?.finalY || startY + 30,
      pageHeight - margin - (isA5Mode ? 36 : 42)
    );
    const summaryX = isA5Mode ? pageWidth - margin - 56 : 130;
    let currentSummaryY = finalY + 6;
    const addLine = (lbl: string, val: string, bold = false) => {
      doc.setFont('Helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(isA5Mode ? 7.2 : 8);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(lbl, summaryX, currentSummaryY);
      doc.text(val, pageWidth - margin - 4, currentSummaryY, { align: 'right' });
      currentSummaryY += isA5Mode ? 4 : 5;
    };

    addLine('Sub-Total:', `INR ${formatPrice(estimate.subtotal)}`);
    if (estimate.taxAmt > 0)
      addLine(`Tax (${estimate.taxPct}%):`, `+ INR ${formatPrice(estimate.taxAmt)}`);
    if (estimate.cashDiscount > 0)
      addLine('Discount:', `- INR ${formatPrice(estimate.cashDiscount)}`);
    addLine('Grand Total:', `INR ${formatPrice(estimate.grandTotal)}`, true);
    addLine('Received:', `INR ${formatPrice(estimate.paidAmount)}`);
    addLine('Balance Due:', `INR ${formatPrice(estimate.balanceDue)}`, true);

    const notesY = finalY + 6;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(isA5Mode ? 7 : 8);
    doc.text('Amount in Words:', margin + 4, notesY);
    doc.setFont('Helvetica', 'normal');
    doc.text(
      `INR ${numberToWords(Math.round(estimate.grandTotal))} Only`,
      margin + 4,
      notesY + 4,
      {
        maxWidth: isA5Mode ? 72 : 105,
      }
    );
    doc.setFont('Helvetica', 'bold');
    doc.text(
      config.authorizedSignatoryLabel || 'Authorized Signatory',
      pageWidth - margin - 4,
      pageHeight - margin - 4,
      { align: 'right' }
    );

    const cleanCustomerName = (estimate.clientName || 'CUSTOMER')
      .replace(/[/\\?%*:|"<>]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const cleanSerial = (estimate.serial || 'EST')
      .replace(/[/\\?%*:|"<>]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    doc.save(`${cleanCustomerName}_${cleanSerial}.pdf`);
  };

  const effectiveBillTitle = config.billTitle || 'TAX INVOICE';
  const previewSheetCount = calculateInvoiceSheetCount(
    (estimate.items || []).length,
    printLayout
  );

  return (
    <div className={`print-modal-container select-none font-sans ${isEmbedded ? 'bg-transparent p-0 min-h-0' : 'bg-slate-100 min-h-screen p-4 md:p-8 print:bg-white print:p-0 print:m-0 print:min-h-0 print:h-auto'}`}>
      
      {/* Floating Control panel wrapper - hidden during actual browser printing */}
      <div className="max-w-5xl mx-auto bg-white p-4 rounded-2xl border border-slate-200/85 shadow-md mb-6 no-print space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-blue-100 rounded-lg text-blue-600 flex items-center justify-center font-bold text-sm">
              🧾
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-black text-xs text-slate-800 leading-none font-sans">
                  {effectiveBillTitle} Print Setup ({printLayout === 'A4' ? 'A4 Full Sheet' : printLayout === 'A5' ? 'A5 Half Sheet' : printLayout === 'THERMAL_80' ? '80mm Thermal' : '58mm Thermal'})
                </h4>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {printLayout === 'A5'
                    ? `📑 ${previewSheetCount} ${previewSheetCount === 1 ? 'Sheet' : 'Sheets'} (A5 Auto-Fit)`
                    : printLayout === 'A4'
                    ? `📄 ${previewSheetCount} ${previewSheetCount === 1 ? 'Sheet' : 'Sheets'} (A4 Auto-Fit)`
                    : `📠 1 Roll Sheet`}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  🖨️ Canon G3020 Ready
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-1 font-sans">
                Bill Serial: <span className="font-mono text-blue-600 font-black">{estimate.serial}</span> | Party: {estimate.clientName || 'Cash Customer'} | Items: {(estimate.items || []).length}
              </p>
            </div>
          </div>

          {/* Dynamic Layout Configuration Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => handleLayoutChange('A4')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  printLayout === 'A4' 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📄 A4 Sheet
              </button>
              <button
                type="button"
                onClick={() => handleLayoutChange('A5')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  printLayout === 'A5' 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📑 A5 Sheet
              </button>
              <button
                type="button"
                onClick={() => handleLayoutChange('THERMAL_80')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  printLayout === 'THERMAL_80' 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📠 80mm Roll
              </button>
              <button
                type="button"
                onClick={() => handleLayoutChange('THERMAL_58')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  printLayout === 'THERMAL_58' 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📠 58mm Roll
              </button>
            </div>

            {/* Quick Print Style Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              <Palette className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-slate-500 hidden sm:inline">Style:</span>
              <select
                value={config.secondaryStyle || 'modern'}
                onChange={(e) =>
                  handleUpdateConfig({
                    ...config,
                    secondaryStyle: e.target.value as SecondaryPrintStyle,
                  })
                }
                className="bg-white border border-slate-200 text-slate-800 font-black rounded-lg px-2 py-1 text-[11px] outline-none cursor-pointer"
                title="Select Printing Style"
              >
                <option value="estimate">Estimate (Classic Bordered)</option>
                <option value="modern">Modern BillBook</option>
                <option value="classic_gst">Classic GST Tax Invoice</option>
                <option value="minimal">Minimalist Clean</option>
                <option value="wholesale">Compact Retail</option>
                <option value="stylish">Stylish Premium</option>
              </select>
            </div>

            {/* Explicit QR Code Selection Toggle */}
            <label
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-colors ${
                config.showQrCode
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/70'
              }`}
              title="Select to generate and print UPI Payment QR Code on this bill"
            >
              <input
                type="checkbox"
                checked={Boolean(config.showQrCode)}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    showQrCode: e.target.checked,
                  }))
                }
                className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span>UPI QR</span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
            {/* Customize Drawer Toggle Button */}
            <button
              onClick={() => setShowCustomizeDrawer(!showCustomizeDrawer)}
              className={`font-bold py-2 px-3 rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer font-sans border ${
                showCustomizeDrawer
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-md'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
              }`}
              title="Customize Print Setup & Preview"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showCustomizeDrawer ? 'Hide Setup' : 'Customize Setup'}</span>
            </button>

            <button
              onClick={handleDirectESCPOSThermalPrint}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer font-sans"
              title="Direct WebUSB / Bluetooth ESC-POS Thermal Printer"
            >
              <span>⚡ WebUSB Thermal</span>
            </button>

            <button
              onClick={handlePrintTrigger}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer font-sans"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            <button
              onClick={exportInvoicePDF}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer font-sans"
              title="Download formatted estimate PDF file"
            >
              <Download className="w-4 h-4" />
              <span>PDF Download</span>
            </button>
            
            {onClose && (
              <button
                onClick={onClose}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl border border-slate-200 cursor-pointer flex items-center space-x-1 font-sans"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            )}
          </div>
        </div>

        {/* CUSTOMIZE SETUP DRAWER (Any change saved here applies immediately to bill printing!) */}
        {showCustomizeDrawer && (
          <div className="bg-slate-50 p-4 rounded-2xl border border-indigo-200 animate-fade-in text-xs space-y-3.5">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <span className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Live Print Customizer &bull; Setup Editor</span>
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Theme, accent color, store details, and UPI QR changes apply immediately to this invoice.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {saveToast && (
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    ✓ Saved & Applied
                  </span>
                )}
                <button
                  onClick={handleResetConfig}
                  className="text-[10px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Defaults</span>
                </button>
                <button
                  onClick={() => setShowCustomizeDrawer(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 border-b pb-2 overflow-x-auto font-bold text-xs">
              {[
                { id: 'layout', label: 'Theme & Format', icon: Layers },
                { id: 'header', label: 'Shop Profile', icon: Building2 },
                { id: 'columns', label: 'Table Columns', icon: Eye },
                { id: 'bank', label: 'Bank & UPI QR', icon: CreditCard },
                { id: 'terms', label: 'Terms & Rules', icon: FileText }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDrawerTab(tab.id as any)}
                    className={`px-3 py-1 rounded-xl flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors text-[11px] ${
                      drawerTab === tab.id
                        ? 'bg-indigo-600 text-white font-black'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: Theme & Format */}
            {drawerTab === 'layout' && (
              <div className="space-y-3">
                {/* Theme Style Cards */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Invoice Theme Style
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'estimate', name: 'Estimate', desc: 'Classic bordered A5/A4 paginated Estimate sheet (20 rows/page)' },
                      { id: 'modern', name: 'Modern BillBook', desc: 'Colored header & modern rounded cards' },
                      { id: 'classic_gst', name: 'Classic GST Tax Invoice', desc: 'Formal GST grid, HSN table, & borders' },
                      { id: 'minimal', name: 'Minimalist Clean', desc: 'Clean monochrome & hairline dividers' },
                      { id: 'wholesale', name: 'Compact Retail', desc: 'Space-saving maximum items per sheet' },
                      { id: 'stylish', name: 'Stylish Premium', desc: 'Vibrant banner, rounded badges & QR highlight' },
                    ].map(style => (
                      <div
                        key={style.id}
                        onClick={() => handleUpdateConfig({ ...config, secondaryStyle: style.id as SecondaryPrintStyle })}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          config.secondaryStyle === style.id
                            ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 text-xs">{style.name}</span>
                          {config.secondaryStyle === style.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">{style.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Color Palette */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Theme Accent Color
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c.hex}
                        onClick={() => handleUpdateConfig({ ...config, primaryColor: c.hex })}
                        className={`w-7 h-7 rounded-lg border-2 transition-transform cursor-pointer flex items-center justify-center ${
                          config.primaryColor === c.hex ? 'border-slate-900 scale-110 shadow-sm' : 'border-white'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      >
                        {config.primaryColor === c.hex && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={config.primaryColor || '#1e40af'}
                      onChange={(e) => handleUpdateConfig({ ...config, primaryColor: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 p-0.5 bg-white"
                      title="Custom Color"
                    />
                  </div>
                </div>

                {/* Document Titles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Main Bill Title
                    </label>
                    <input
                      type="text"
                      value={config.billTitle}
                      onChange={(e) => handleUpdateConfig({ ...config, billTitle: e.target.value })}
                      placeholder="TAX INVOICE"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-xs outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Secondary Subtitle / Copy
                    </label>
                    <input
                      type="text"
                      value={config.secondaryBillTitle || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, secondaryBillTitle: e.target.value })}
                      placeholder="Original for Recipient"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Shop Profile */}
            {drawerTab === 'header' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={config.businessName}
                    onChange={(e) => handleUpdateConfig({ ...config, businessName: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Tagline / Slogan
                  </label>
                  <input
                    type="text"
                    value={config.tagline || ''}
                    onChange={(e) => handleUpdateConfig({ ...config, tagline: e.target.value })}
                    placeholder="General Wholesale & Retail"
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={config.address || ''}
                    onChange={(e) => handleUpdateConfig({ ...config, address: e.target.value })}
                    placeholder="Shop No, Market Road, City, Pincode"
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={config.phone || ''}
                    onChange={(e) => handleUpdateConfig({ ...config, phone: e.target.value })}
                    placeholder="9876543210"
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    GSTIN / Tax ID
                  </label>
                  <input
                    type="text"
                    value={config.gstin || ''}
                    onChange={(e) => handleUpdateConfig({ ...config, gstin: e.target.value.toUpperCase() })}
                    placeholder="07AAAAA0000A1Z5"
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono text-xs uppercase outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    value={config.pan || ''}
                    onChange={(e) => handleUpdateConfig({ ...config, pan: e.target.value.toUpperCase() })}
                    placeholder="AAAAA0000A"
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono text-xs uppercase outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    State & Code
                  </label>
                  <input
                    type="text"
                    value={config.state || ''}
                    onChange={(e) => handleUpdateConfig({ ...config, state: e.target.value })}
                    placeholder="07 - Delhi"
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs outline-none"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: Table Columns */}
            {drawerTab === 'columns' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { key: 'showHsn', label: 'Item Code / HSN Column' },
                  { key: 'showUnit', label: 'Unit Column (Pcs/Kg)' },
                  { key: 'showMrp', label: 'MRP Column' },
                  { key: 'showRate', label: 'Rate / Unit Price Column' },
                  { key: 'showDiscount', label: 'Discount % Column' },
                ].map(col => (
                  <label key={col.key} className="flex items-center space-x-2 bg-white p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-indigo-50/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={(config as any)[col.key] !== false}
                      onChange={(e) => handleUpdateConfig({ ...config, [col.key]: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-bold text-xs">{col.label}</span>
                  </label>
                ))}
              </div>
            )}

            {/* TAB 4: Bank & UPI QR */}
            {drawerTab === 'bank' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={config.bankName || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, bankName: e.target.value })}
                      placeholder="State Bank of India"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Account No</label>
                    <input
                      type="text"
                      value={config.accountNo || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, accountNo: e.target.value })}
                      placeholder="349012384910"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">IFSC Code</label>
                    <input
                      type="text"
                      value={config.ifscCode || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, ifscCode: e.target.value.toUpperCase() })}
                      placeholder="SBIN0001234"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono text-xs uppercase outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">UPI ID (VPA)</label>
                    <input
                      type="text"
                      value={config.upiId || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, upiId: e.target.value })}
                      placeholder="merchant@upi"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      checked={config.showBankDetails !== false}
                      onChange={(e) => handleUpdateConfig({ ...config, showBankDetails: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-bold text-xs">Print Bank Details on Bill</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      checked={Boolean(config.showQrCode)}
                      onChange={(e) => handleUpdateConfig({ ...config, showQrCode: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-800 font-bold text-xs">Print Scan-to-Pay UPI QR Code</span>
                  </label>
                </div>
              </div>
            )}

            {/* TAB 5: Terms & Rules */}
            {drawerTab === 'terms' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Authorized Signatory Label
                    </label>
                    <input
                      type="text"
                      value={config.authorizedSignatoryLabel || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, authorizedSignatoryLabel: e.target.value })}
                      placeholder="Authorized Signatory"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Footer Greeting / Note
                    </label>
                    <input
                      type="text"
                      value={config.footerNote || ''}
                      onChange={(e) => handleUpdateConfig({ ...config, footerNote: e.target.value })}
                      placeholder="Thank You! Visit Again"
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Terms & Conditions
                  </label>
                  <textarea
                    rows={3}
                    value={config.terms}
                    onChange={(e) => handleUpdateConfig({ ...config, terms: e.target.value })}
                    placeholder="1. Goods once sold will not be returned..."
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-xs font-sans outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Restored Full-Sheet Printer Stylesheet Injection (A4, A5 & Thermal) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: ${printLayout === 'A5' ? 'A5 portrait' : printLayout === 'A4' ? 'A4 portrait' : 'auto'};
            margin: 0mm !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            height: auto !important;
            min-height: 0 !important;
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
          #estimate-print-area {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            height: auto !important;
          }
          .print-sheets-wrapper {
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
          }
          .unified-bill-sheet {
            box-shadow: none !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .a5-print-page,
          .print-page.A5 {
            width: 148mm !important;
            max-width: 148mm !important;
            height: 208mm !important;
            max-height: 208mm !important;
            padding: 5mm !important;
          }
          .a4-print-page,
          .print-page.A4 {
            width: 210mm !important;
            max-width: 210mm !important;
            height: 295mm !important;
            max-height: 295mm !important;
            padding: 6mm !important;
          }
          .invoice-page-frame {
            border: 1.5px solid #000000 !important;
            box-sizing: border-box !important;
            width: 100% !important;
            height: 100% !important;
          }
          .page-break-after-always {
            page-break-after: always !important;
            break-after: page !important;
          }
          .last-print-page {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .unified-bill-thermal {
            width: ${printLayout === 'THERMAL_80' ? '80mm' : '58mm'} !important;
            box-shadow: none !important;
            border: 1.5px solid #000000 !important;
            margin: 0 auto !important;
          }
        }
      ` }} />

      {/* Printable Sheet / Document Area - 100% synchronized with Unified Bill engine */}
      <div className="print-container mx-auto print:m-0 flex justify-center w-full" id="estimate-print-area">
        <UnifiedBillDocument
          estimate={estimate}
          config={{
            ...config,
            layout: printLayout
          }}
          qrCodeDataUrl={qrCodeDataUrl}
          isPrintPreview={true}
        />
      </div>

    </div>
  );
}
