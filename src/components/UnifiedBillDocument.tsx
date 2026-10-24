import React from 'react';
import { Estimate, PrintTemplateConfig } from '../types';
import { numberToWords, formatPrice } from '../utils/numberToWords';

export interface UnifiedBillDocumentProps {
  estimate: Estimate;
  config: PrintTemplateConfig;
  qrCodeDataUrl?: string;
  className?: string;
  isPrintPreview?: boolean;
}

/**
 * Computes the exact number of printed sheets for a given item count and paper layout.
 * - A5 & A4: Up to 20 items fit on 1 single page (20 items/page); >20 items paginate cleanly at 20 items per page.
 * - Thermal: 1 continuous roll sheet.
 */
export function calculateInvoiceSheetCount(
  itemCount: number,
  layout: 'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58' = 'A4'
): number {
  if (layout === 'THERMAL_80' || layout === 'THERMAL_58') return 1;
  const count = Math.max(0, itemCount);
  if (count <= 20) return 1;
  return Math.ceil(count / 20);
}

interface PageSlice {
  items: Estimate['items'];
  startIndex: number;
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  targetGridRows: number;
  rowHeightPx: number;
  fontScalePx: number;
}

/**
 * Dynamic 20-items-per-page pagination engine for A5 and A4.
 * Fits up to 20 items on a single page and paginates longer bills at 20 items per page.
 */
function buildPaginatedSlices(
  rawItems: Estimate['items'],
  layout: 'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58',
  _compactMode: boolean
): PageSlice[] {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const totalItems = items.length;
  const itemsPerPage = 20;

  // A5 MODE (148mm × 208mm printable sheet with 5mm padding):
  // 20 items per page
  if (layout === 'A5') {
    if (totalItems <= itemsPerPage) {
      return [
        {
          items,
          startIndex: 0,
          pageNumber: 1,
          totalPages: 1,
          isFirstPage: true,
          isLastPage: true,
          targetGridRows: itemsPerPage,
          rowHeightPx: 13.5,
          fontScalePx: 8.5,
        },
      ];
    }

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const slices: PageSlice[] = [];

    for (let p = 0; p < totalPages; p++) {
      const start = p * itemsPerPage;
      const pageItems = items.slice(start, start + itemsPerPage);
      const isLast = p === totalPages - 1;
      slices.push({
        items: pageItems,
        startIndex: start,
        pageNumber: p + 1,
        totalPages,
        isFirstPage: p === 0,
        isLastPage: isLast,
        targetGridRows: itemsPerPage,
        rowHeightPx: isLast ? 13.2 : 14.5,
        fontScalePx: 8.5,
      });
    }

    return slices;
  }

  // A4 MODE (210mm × 295mm printable sheet with 6mm padding):
  // 20 items per page
  if (totalItems <= itemsPerPage) {
    return [
      {
        items,
        startIndex: 0,
        pageNumber: 1,
        totalPages: 1,
        isFirstPage: true,
        isLastPage: true,
        targetGridRows: itemsPerPage,
        rowHeightPx: 19.5,
        fontScalePx: 9.4,
      },
    ];
  }

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const slices: PageSlice[] = [];

  for (let p = 0; p < totalPages; p++) {
    const start = p * itemsPerPage;
    const pageItems = items.slice(start, start + itemsPerPage);
    const isLast = p === totalPages - 1;
    slices.push({
      items: pageItems,
      startIndex: start,
      pageNumber: p + 1,
      totalPages,
      isFirstPage: p === 0,
      isLastPage: isLast,
      targetGridRows: itemsPerPage,
      rowHeightPx: isLast ? 19 : 20,
      fontScalePx: 9.4,
    });
  }

  return slices;
}

export default function UnifiedBillDocument({
  estimate,
  config,
  qrCodeDataUrl,
  className = '',
  isPrintPreview = false,
}: UnifiedBillDocumentProps) {
  const isThermal = config.layout === 'THERMAL_80' || config.layout === 'THERMAL_58';
  const isA5 = config.layout === 'A5';
  const isEstimateStyle = config.secondaryStyle === 'estimate';
  const isClassicGst = config.secondaryStyle === 'classic_gst';
  const isMinimal = config.secondaryStyle === 'minimal';
  const isStylish = config.secondaryStyle === 'stylish';
  const isCompact =
    config.secondaryStyle === 'wholesale' ||
    config.fontSizeScale === 'compact' ||
    config.compactSpacing;

  const primaryColor = config.primaryColor || '#1e40af';
  const billTitle =
    config.billTitle ||
    (isEstimateStyle ? 'ESTIMATE' : isClassicGst ? 'TAX INVOICE' : 'ESTIMATE / BILL OF SUPPLY');
  const secondaryBillTitle =
    config.secondaryBillTitle || (isClassicGst ? 'Original for Recipient' : '');
  const businessName = config.businessName || 'BillSync Pro Store';

  // Fallback terms
  const termsText =
    config.terms ||
    estimate.terms ||
    '1. Goods once sold will not be taken back or exchanged.\n2. Warranty claims are directly handled by authorized manufacturer service centers.\n3. All disputes subject to local jurisdiction only.';
  const termsLines = termsText.split('\n').filter((l) => l.trim().length > 0);

  // -------------------------------------------------------------
  // 1. THERMAL POS LAYOUT (80mm & 58mm Roll)
  // -------------------------------------------------------------
  if (isThermal) {
    const is80 = config.layout === 'THERMAL_80';
    return (
      <div
        className={`unified-bill-thermal print-page bg-white text-black shadow-lg mx-auto border-[1.5px] border-black ${
          is80 ? 'w-[80mm] p-3.5 text-[10px]' : 'w-[58mm] p-2 text-[9px]'
        } ${className}`}
        style={{
          fontFamily: "'Courier New', Courier, monospace, sans-serif",
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Thermal Header */}
        <div className="text-center space-y-1">
          <h2 className="text-base font-black uppercase tracking-tight leading-tight">
            {businessName}
          </h2>
          {config.tagline && (
            <p className="text-[9px] text-zinc-600 font-semibold">{config.tagline}</p>
          )}
          {config.address && (
            <p className="text-[8.5px] text-zinc-700 leading-snug">{config.address}</p>
          )}
          <div className="text-[8.5px] text-zinc-800 font-bold flex flex-wrap justify-center gap-x-2">
            {config.phone && <span>PH: +91 {config.phone}</span>}
            {config.gstin && <span>GST: {config.gstin}</span>}
          </div>
          <div className="border-b border-dashed border-black my-1.5" />
          <div className="text-center font-black uppercase tracking-wider text-[10px]">
            {billTitle}
          </div>
          {secondaryBillTitle && (
            <div className="text-[8px] text-zinc-600 uppercase tracking-widest">
              {secondaryBillTitle}
            </div>
          )}
          <div className="border-b border-dashed border-black my-1.5" />
        </div>

        {/* Thermal Bill Info */}
        <div className="text-left text-[9px] space-y-0.5 py-1">
          <div className="flex justify-between">
            <span>
              <b>BILL NO:</b> {estimate.serial}
            </span>
            <span>
              <b>DATE:</b> {estimate.date}
            </span>
          </div>
          <div>
            <b>CUSTOMER:</b>{' '}
            <span className="font-bold uppercase">{estimate.clientName || 'Cash Customer'}</span>
          </div>
          {estimate.clientPhone && (
            <div>
              <b>PHONE:</b> +91 {estimate.clientPhone}
            </div>
          )}
          {estimate.clientAddr && (
            <div>
              <b>ADDRESS:</b> {estimate.clientAddr}
            </div>
          )}
          {estimate.deliveryNote && (
            <div>
              <b>DISPATCH:</b> {estimate.deliveryNote}
            </div>
          )}
          <div className="border-b border-dashed border-black my-1.5" />
        </div>

        {/* Thermal Items List */}
        <div className="space-y-1 py-1">
          <div className="flex justify-between font-black text-[9px] border-b border-dashed border-black pb-1 uppercase">
            <span className="w-1/2">Item Description</span>
            <span className="w-1/6 text-center">Qty</span>
            <span className="w-1/6 text-right">Rate</span>
            <span className="w-1/6 text-right">Amount</span>
          </div>

          {estimate.items.map((itm, idx) => (
            <div key={idx} className="border-b border-dashed border-zinc-200 py-1 space-y-0.5">
              <div className="font-bold text-[9.5px] leading-tight text-black truncate">
                {itm.name}
              </div>
              <div className="flex justify-between text-[8.5px] text-zinc-800">
                <span className="w-1/2 text-zinc-500">
                  {config.showUnit && itm.unit ? `${itm.unit} ` : ''}
                  {config.showMrp && itm.mrp ? `(MRP:₹${formatPrice(itm.mrp)})` : ''}
                </span>
                <span className="w-1/6 text-center font-bold">{itm.qty}</span>
                <span className="w-1/6 text-right">₹{formatPrice(itm.price)}</span>
                <span className="w-1/6 text-right font-black">₹{formatPrice(itm.total)}</span>
              </div>
            </div>
          ))}
          <div className="border-b border-dashed border-black my-1.5" />
        </div>

        {/* Thermal Totals */}
        <div className="space-y-1 text-right text-[9px] py-1">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>₹{formatPrice(estimate.subtotal)}</span>
          </div>
          {estimate.taxAmt > 0 && (
            <div className="flex justify-between">
              <span>Tax / GST ({estimate.taxPct}%):</span>
              <span>+₹{formatPrice(estimate.taxAmt)}</span>
            </div>
          )}
          {estimate.cashDiscount > 0 && (
            <div className="flex justify-between text-zinc-700">
              <span>Discount:</span>
              <span>-₹{formatPrice(estimate.cashDiscount)}</span>
            </div>
          )}
          {estimate.flatFinalDiscount !== undefined && estimate.flatFinalDiscount > 0 && (
            <div className="flex justify-between text-zinc-700">
              <span>Flat Discount:</span>
              <span>-₹{formatPrice(estimate.flatFinalDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-xs border-t border-b border-dashed border-black py-1.5 text-black">
            <span>GRAND TOTAL:</span>
            <span>₹{formatPrice(estimate.grandTotal)}</span>
          </div>
          <div className="flex justify-between pt-0.5">
            <span>Paid Amount:</span>
            <span className="font-bold">₹{formatPrice(estimate.paidAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-black">
            <span>Balance Due:</span>
            <span className="font-black">₹{formatPrice(estimate.balanceDue)}</span>
          </div>
        </div>

        {/* Amount in words */}
        <div className="border-t border-dashed border-black pt-1.5 text-[8.5px] italic text-zinc-700">
          Amount: {numberToWords(Math.round(estimate.grandTotal))}
        </div>

        {/* Thermal Bank / UPI QR */}
        {config.showQrCode && qrCodeDataUrl && (
          <div className="py-2 text-center border-t border-dashed border-black mt-2">
            <img
              src={qrCodeDataUrl}
              alt="Scan & Pay UPI"
              className="w-28 h-28 mx-auto object-contain bg-white p-1 border border-black"
            />
            <span className="text-[8px] font-black uppercase tracking-wider block mt-1">
              Scan to Pay via UPI ({config.upiId || 'merchant@upi'})
            </span>
          </div>
        )}

        {/* Thermal Terms */}
        {termsLines.length > 0 && (
          <div className="border-t border-dashed border-black pt-1.5 text-[8px] text-zinc-600 space-y-0.5 text-left mt-2">
            <span className="font-bold block uppercase">
              {config.termsHeader || 'Terms & Conditions'}:
            </span>
            {termsLines.slice(0, 3).map((tl, i) => (
              <div key={i}>{tl}</div>
            ))}
          </div>
        )}

        <div className="text-center pt-2.5 text-[8.5px] font-bold text-zinc-800">
          *** {config.footerNote || 'Thank You! Visit Again.'} ***
        </div>

        {config.showSignatureBox && (
          <div className="text-right pt-4 text-[8px] font-bold">
            <div className="inline-block border-t border-dashed border-black pt-1 px-4 text-center">
              {config.authorizedSignatoryLabel || 'Authorized Signatory'}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. PAGINATED A4 & A5 ENGINE (Restored Previous Printing Styles + Smart 1-Page Auto-Fit)
  //    - Fits onto 1 page automatically when item count fits (1..15 items on A5, 1..24 items on A4)
  //    - Paginates to Page 2+ only when items exceed 1-page capacity
  //    - Full-sheet layout (A5: 148mm × 208mm with 5mm padding; A4: 210mm × 295mm with 6mm padding)
  //    - Crisp 4-sided outer frame (.invoice-page-frame) on every printed sheet
  // -------------------------------------------------------------
  const slices = buildPaginatedSlices(estimate.items || [], config.layout || 'A4', Boolean(isCompact));
  const totalDiscount =
    (Number(estimate.cashDiscount) || 0) + (Number(estimate.flatFinalDiscount) || 0);
  const paymentModeText =
    estimate.splitPayments &&
    (estimate.splitPayments.upi > 0 ||
      estimate.splitPayments.bank > 0 ||
      estimate.splitPayments.credit > 0)
      ? 'SPLIT PAYMENT'
      : estimate.paymentMode || 'CASH';

  // Theme-specific styling restored from previous update
  const headerAccentBg = isEstimateStyle
    ? '#f8fafc'
    : isClassicGst
    ? '#f1f5f9'
    : isMinimal
    ? '#ffffff'
    : isStylish
    ? primaryColor
    : `${primaryColor}12`;

  const tableHeaderBg =
    isEstimateStyle || isClassicGst
      ? '#f1f5f9'
      : isMinimal
      ? '#18181b'
      : primaryColor;

  const tableHeaderText =
    isEstimateStyle || isClassicGst ? '#0f172a' : '#ffffff';

  return (
    <div className={`print-sheets-wrapper space-y-6 print:space-y-0 w-full flex flex-col items-center ${className}`}>
      {slices.map((slice) => {
        const {
          items: pageItems,
          startIndex,
          pageNumber,
          totalPages,
          isFirstPage,
          isLastPage,
          targetGridRows,
          rowHeightPx,
          fontScalePx,
        } = slice;

        const pageSubtotal = pageItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
        const broughtForwardTotal = (estimate.items || [])
          .slice(0, startIndex)
          .reduce((sum, it) => sum + (Number(it.total) || 0), 0);

        const hasBroughtForwardRow = !isFirstPage && startIndex > 0;
        const usedRows = pageItems.length + (hasBroughtForwardRow ? 1 : 0);
        const emptyRowsCount = Math.max(0, targetGridRows - usedRows);

        return (
          <div key={pageNumber} className="w-full flex flex-col items-center print:block">
            {/* On-screen Sheet Indicator Badge (Hidden during actual print) */}
            {isPrintPreview && (
              <div className="no-print mb-1.5 flex items-center justify-between w-full max-w-[210mm] px-2 text-[11px] font-bold text-slate-600">
                <span className="inline-flex items-center gap-1.5 bg-white border border-slate-300 px-2.5 py-0.5 rounded-md shadow-2xs text-slate-800">
                  <span>📄 Sheet {pageNumber} of {totalPages}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-indigo-700 font-black">
                    {isA5
                      ? `A5 (148 × 210 mm • ${totalPages === 1 ? 'Single-Page Auto-Fit' : `${totalPages}-Page Auto-Fit`})`
                      : `A4 (210 × 297 mm • ${totalPages === 1 ? 'Single-Page Auto-Fit' : `${totalPages}-Page Auto-Fit`})`}
                  </span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {isLastPage
                    ? `Items ${startIndex + 1}–${startIndex + pageItems.length} • Full Summary, QR & Signatory`
                    : `Items ${startIndex + 1}–${startIndex + pageItems.length} • Continues on Page ${pageNumber + 1}`}
                </span>
              </div>
            )}

            {/* PRINTABLE PAGE SHEET (Restored full-sheet 148mm × 208mm A5 / 210mm × 295mm A4 dimensions) */}
            <div
              className={`unified-bill-sheet print-page bg-white text-black shadow-2xl mx-auto flex flex-col justify-between box-border select-text ${
                isA5
                  ? 'A5 a5-print-page w-[148mm] h-[208mm] max-h-[208mm] p-[5mm]'
                  : 'A4 a4-print-page w-[210mm] h-[295mm] max-h-[295mm] p-[6mm]'
              } ${!isLastPage ? 'page-break-after-always' : 'last-print-page'}`}
              style={{
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                fontSize: `${fontScalePx}px`,
                boxSizing: 'border-box',
                overflow: 'hidden',
                pageBreakAfter: !isLastPage ? 'always' : 'avoid',
                breakAfter: !isLastPage ? 'page' : 'avoid',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
              }}
            >
              {/* INNER VISIBLE 4-SIDED BORDER FRAME AROUND THE ENTIRE INVOICE AREA */}
              <div
                className="invoice-page-frame w-full h-full flex-1 flex flex-col justify-between border-[1.5px] border-black box-border overflow-hidden"
                style={{
                  border: '1.5px solid #000000',
                  boxSizing: 'border-box',
                }}
              >
                {/* ================= TOP SECTION: HEADER & PARTY INFO ================= */}
                <div className="shrink-0">
                  {isFirstPage || isEstimateStyle ? (
                    <>
                      {/* Primary Document Header (Centered Title, Page Badge on Side) */}
                      <div
                        className="border-b-[1.5px] border-black px-3 py-2 relative"
                        style={{
                          backgroundColor: headerAccentBg,
                          color: isStylish ? '#ffffff' : '#000000',
                        }}
                      >
                        <div className="flex flex-col items-center justify-center text-center">
                          <div className="inline-flex items-center justify-center">
                            <span
                              className={`font-black uppercase tracking-widest px-3 py-0.5 rounded border ${
                                isA5 ? 'text-xs' : 'text-sm'
                              } ${
                                isStylish
                                  ? 'bg-white text-slate-900 border-white'
                                  : 'bg-white text-black border-black'
                              }`}
                              style={
                                !isStylish && !isEstimateStyle && !isClassicGst && !isMinimal
                                  ? { borderColor: primaryColor, color: primaryColor }
                                  : undefined
                              }
                            >
                              {billTitle}
                            </span>
                          </div>
                          {secondaryBillTitle && (
                            <div
                              className={`text-[8px] font-bold uppercase tracking-wider mt-0.5 ${
                                isStylish ? 'text-white/80' : 'text-slate-600'
                              }`}
                            >
                              {secondaryBillTitle}
                            </div>
                          )}
                          {estimate.signature && (
                            <div
                              className={`text-[7px] font-mono mt-0.5 ${
                                isStylish ? 'text-emerald-200' : 'text-emerald-800'
                              }`}
                            >
                              ✓ Verified Bill
                            </div>
                          )}
                        </div>
                        {totalPages > 1 && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-black bg-slate-100 text-black font-mono">
                            PAGE {pageNumber} OF {totalPages}
                          </span>
                        )}
                      </div>

                      {/* Buyer & Estimate Metadata Grid */}
                      <div className="grid grid-cols-12 border-b-[1.5px] border-black text-[9px] leading-tight">
                        <div className="col-span-7 p-2 border-r-[1.5px] border-black flex flex-col justify-between">
                          <div>
                            <span className="text-[7.5px] font-bold uppercase text-slate-500 block">
                              Buyer / Billed To:
                            </span>
                            <div className="font-black text-[10.5px] uppercase text-black mt-0.5">
                              {estimate.clientName || 'Cash Customer'}
                            </div>
                            {estimate.clientAddr && (
                              <div className="text-[8.5px] text-slate-800 mt-0.5 line-clamp-2">
                                {estimate.clientAddr}
                              </div>
                            )}
                          </div>
                          <div className="mt-1 pt-1 border-t border-dotted border-slate-400 flex flex-wrap justify-between gap-2 text-[8.5px]">
                            <span>
                              <b>Mobile:</b>{' '}
                              {estimate.clientPhone ? `+91 ${estimate.clientPhone}` : 'N/A'}
                            </span>
                            {estimate.clientGstin && (
                              <span>
                                <b>Party GSTIN:</b>{' '}
                                <span className="font-mono font-bold">{estimate.clientGstin}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="col-span-5 grid grid-cols-2 text-[8.5px]">
                          <div className="p-1.5 border-r border-b border-slate-300">
                            <span className="text-[7px] text-slate-500 block uppercase font-bold">
                              Invoice / Est No.
                            </span>
                            <b className="text-[10px] font-mono text-black">{estimate.serial}</b>
                          </div>
                          <div className="p-1.5 border-b border-slate-300">
                            <span className="text-[7px] text-slate-500 block uppercase font-bold">
                              Date
                            </span>
                            <b className="text-[9.5px] text-black">{estimate.date}</b>
                          </div>
                          <div className="p-1.5 border-r border-slate-300">
                            <span className="text-[7px] text-slate-500 block uppercase font-bold">
                              Dispatch / Note
                            </span>
                            <b className="truncate block text-black">
                              {estimate.deliveryNote || 'Direct Handover'}
                            </b>
                          </div>
                          <div className="p-1.5">
                            <span className="text-[7px] text-slate-500 block uppercase font-bold">
                              Payment Mode
                            </span>
                            <b className="uppercase text-black">
                              {paymentModeText} ({estimate.status})
                            </b>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Compact Continuation Header for Page 2+ */
                    <div className="border-b-[1.5px] border-black px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[9px]">
                      <div>
                        <span className="font-bold text-slate-700">
                          Party: <b className="text-black uppercase">{estimate.clientName || 'Cash Customer'}</b>
                        </span>
                      </div>
                      <div className="font-black uppercase text-black text-[10.5px] tracking-widest">
                        {billTitle}
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span>
                          <b>No:</b> {estimate.serial}
                        </span>
                        <span>•</span>
                        <span>
                          <b>Date:</b> {estimate.date}
                        </span>
                        <span className="px-1.5 py-0.5 rounded border border-black bg-white font-black text-[8px]">
                          PAGE {pageNumber} OF {totalPages}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ================= MIDDLE SECTION: ITEMS TABLE (Restored Classic Column Borders & Clean Rows) ================= */}
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <table
                    className="w-full border-collapse flex-1"
                    style={{
                      fontSize: `${fontScalePx}px`,
                      borderCollapse: 'collapse',
                      pageBreakInside: 'avoid',
                    }}
                  >
                    <thead>
                      <tr
                        className="border-b-[1.5px] border-black font-black uppercase text-[8px]"
                        style={{
                          backgroundColor: tableHeaderBg,
                          color: tableHeaderText,
                          pageBreakInside: 'avoid',
                        }}
                      >
                        <th className="border-r border-black py-1 px-1 w-7 text-center">#</th>
                        <th className="border-r border-black py-1 px-2 text-left">
                          Description of Goods
                        </th>
                        {config.showHsn && (
                          <th className="border-r border-black py-1 px-1 w-14 text-center">HSN</th>
                        )}
                        <th className="border-r border-black py-1 px-1 w-10 text-center">Qty</th>
                        {config.showUnit && (
                          <th className="border-r border-black py-1 px-1 w-10 text-center">Unit</th>
                        )}
                        {config.showMrp && (
                          <th className="border-r border-black py-1 px-1 w-14 text-right">MRP</th>
                        )}
                        {config.showRate && (
                          <th className="border-r border-black py-1 px-1 w-14 text-right">Rate</th>
                        )}
                        {config.showDiscount && (
                          <th className="border-r border-black py-1 px-1 w-11 text-center">Disc%</th>
                        )}
                        <th className="py-1 px-1.5 w-20 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="font-medium text-black">
                      {/* Brought Forward summary row on Page 2+ */}
                      {hasBroughtForwardRow && (
                        <tr
                          className="border-b border-slate-300 bg-slate-50/90 font-bold italic text-slate-700"
                          style={{ height: `${rowHeightPx}px`, lineHeight: 1.1, pageBreakInside: 'avoid' }}
                        >
                          <td className="border-r border-black px-1 text-center">-</td>
                          <td className="border-r border-black px-2">
                            Brought Forward from Page {pageNumber - 1} ({startIndex} items)
                          </td>
                          {config.showHsn && (
                            <td className="border-r border-black px-1 text-center">-</td>
                          )}
                          <td className="border-r border-black px-1 text-center">-</td>
                          {config.showUnit && (
                            <td className="border-r border-black px-1 text-center">-</td>
                          )}
                          {config.showMrp && (
                            <td className="border-r border-black px-1 text-right">-</td>
                          )}
                          {config.showRate && (
                            <td className="border-r border-black px-1 text-right">-</td>
                          )}
                          {config.showDiscount && (
                            <td className="border-r border-black px-1 text-center">-</td>
                          )}
                          <td className="px-1.5 text-right font-mono font-black text-black">
                            {formatPrice(broughtForwardTotal)}
                          </td>
                        </tr>
                      )}

                      {pageItems.map((itm, itemIdx) => {
                        const serialNum = startIndex + itemIdx + 1;
                        const effectiveDisc =
                          itm.disc > 0
                            ? Number(itm.disc).toFixed(1)
                            : itm.mrp > itm.price && itm.mrp > 0
                            ? (((itm.mrp - itm.price) / itm.mrp) * 100).toFixed(1)
                            : '0';

                        return (
                          <tr
                            key={itemIdx}
                            className={`border-b border-slate-200 ${
                              !isEstimateStyle && !isMinimal && itemIdx % 2 === 1
                                ? 'bg-slate-50/40'
                                : ''
                            }`}
                            style={{ height: `${rowHeightPx}px`, lineHeight: 1.1, pageBreakInside: 'avoid' }}
                          >
                            <td className="border-r border-black px-1 text-center font-mono text-slate-600">
                              {serialNum}
                            </td>
                            <td className="border-r border-black px-2 font-bold truncate max-w-[190px]">
                              {itm.name}
                            </td>
                            {config.showHsn && (
                              <td className="border-r border-black px-1 text-center font-mono text-[8px] text-slate-600">
                                {itm.hsn || (itm.sku ? itm.sku.slice(0, 8) : '-')}
                              </td>
                            )}
                            <td className="border-r border-black px-1 text-center font-mono font-black">
                              {itm.qty}
                            </td>
                            {config.showUnit && (
                              <td className="border-r border-black px-1 text-center uppercase text-[8px] text-slate-600">
                                {itm.unit || 'PCS'}
                              </td>
                            )}
                            {config.showMrp && (
                              <td className="border-r border-black px-1 text-right font-mono text-slate-600">
                                {itm.mrp ? formatPrice(itm.mrp) : '-'}
                              </td>
                            )}
                            {config.showRate && (
                              <td className="border-r border-black px-1 text-right font-mono">
                                {formatPrice(itm.price)}
                              </td>
                            )}
                            {config.showDiscount && (
                              <td className="border-r border-black px-1 text-center font-mono text-emerald-700 font-bold">
                                {Number(effectiveDisc) > 0 ? `${effectiveDisc}%` : '-'}
                              </td>
                            )}
                            <td className="px-1.5 text-right font-mono font-black">
                              {formatPrice(itm.total)}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Pad remaining grid rows so vertical column borders extend neatly to the bottom section */}
                      {Array.from({ length: emptyRowsCount }).map((_, emptyIdx) => (
                        <tr
                          key={`empty-${emptyIdx}`}
                          style={{ height: `${rowHeightPx}px`, lineHeight: 1, pageBreakInside: 'avoid' }}
                        >
                          <td className="border-r border-black px-1">&nbsp;</td>
                          <td className="border-r border-black px-2">&nbsp;</td>
                          {config.showHsn && <td className="border-r border-black px-1">&nbsp;</td>}
                          <td className="border-r border-black px-1">&nbsp;</td>
                          {config.showUnit && <td className="border-r border-black px-1">&nbsp;</td>}
                          {config.showMrp && <td className="border-r border-black px-1">&nbsp;</td>}
                          {config.showRate && <td className="border-r border-black px-1">&nbsp;</td>}
                          {config.showDiscount && (
                            <td className="border-r border-black px-1">&nbsp;</td>
                          )}
                          <td className="px-1.5">&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ================= BOTTOM SECTION: SUB-TOTAL / GRAND TOTALS / FOOTER ================= */}
                <div className="border-t-[1.5px] border-black shrink-0">
                  {!isLastPage ? (
                    /* Multi-Page Continuation Footer */
                    <div className="bg-slate-50 px-3 py-2 flex items-center justify-between text-[9.5px]">
                      <div className="font-bold text-slate-700">
                        <span>
                          Page {pageNumber} Sub-Total ({pageItems.length} items on this page)
                        </span>
                        <span className="ml-3 text-indigo-800 font-black italic">
                          → Continued on Page {pageNumber + 1}...
                        </span>
                      </div>
                      <div className="font-mono font-black text-black text-[10.5px]">
                        Carried Forward: ₹{formatPrice(broughtForwardTotal + pageSubtotal)}
                      </div>
                    </div>
                  ) : (
                    /* Complete Financial Summary, Amount in Words, Bank/QR, Terms & Signatory */
                    <>
                      {/* Cumulative Items Bar */}
                      <div className="flex justify-between items-center bg-slate-100 px-2.5 py-1 border-b border-black text-[8.5px] font-bold">
                        <span>
                          Total Items: {(estimate.items || []).length} | Total Qty:{' '}
                          {(estimate.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0)}
                        </span>
                        <span className="font-mono">
                          Items Taxable Value: ₹{formatPrice(estimate.subtotal)}
                        </span>
                      </div>

                      <div className="grid grid-cols-12 text-[8.5px]">
                        {/* Left 7 Cols: Amount in Words, Bank Details, UPI QR, Terms */}
                        <div className="col-span-7 p-2 border-r-[1.5px] border-black flex flex-col justify-between space-y-1">
                          <div>
                            <span className="text-[7px] uppercase text-slate-500 font-bold block">
                              Amount Chargeable (in words):
                            </span>
                            <div className="font-black italic text-[9px] leading-tight capitalize text-black">
                              INR {numberToWords(Math.round(estimate.grandTotal))} Only
                            </div>
                          </div>

                          {(config.showBankDetails || (config.showQrCode && qrCodeDataUrl)) && (
                            <div className="flex items-center justify-between gap-2 py-1 px-1.5 border border-slate-300 rounded bg-slate-50/70">
                              {config.showBankDetails && (
                                <div className="text-[7.5px] leading-tight space-y-0.5">
                                  <div className="font-black uppercase text-slate-700">
                                    Bank: {config.bankName || 'State Bank of India'}
                                  </div>
                                  <div className="font-mono">
                                    A/C: <b>{config.accountNo || '349012384910'}</b> | IFSC:{' '}
                                    <b>{config.ifscCode || 'SBIN0001234'}</b>
                                  </div>
                                  {config.upiId && (
                                    <div className="font-mono text-indigo-800 font-bold">
                                      UPI ID: {config.upiId}
                                    </div>
                                  )}
                                </div>
                              )}
                              {config.showQrCode && qrCodeDataUrl && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <img
                                    src={qrCodeDataUrl}
                                    alt="UPI QR"
                                    className="w-11 h-11 object-contain border border-black bg-white p-0.5"
                                  />
                                  {!config.showBankDetails && (
                                    <div className="text-[7.5px] leading-tight">
                                      <div className="font-black uppercase">Scan &amp; Pay</div>
                                      <div className="font-mono text-slate-600">
                                        {config.upiId || 'merchant@upi'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="pt-0.5 border-t border-slate-300 text-[7.5px] leading-tight text-slate-600">
                            <span className="font-bold text-black uppercase block">
                              {config.termsHeader || 'Terms & Conditions'}:
                            </span>
                            {termsLines.slice(0, 2).map((line, i) => (
                              <div key={i} className="truncate">
                                {line}
                              </div>
                            ))}
                            <div className="italic text-slate-500 mt-0.5">
                              {config.footerNote || 'Thank you for your business! Visit Again.'}
                            </div>
                          </div>
                        </div>

                        {/* Right 5 Cols: Totals Breakdown & Authorized Signatory */}
                        <div className="col-span-5 flex flex-col justify-between text-[9px]">
                          <div className="p-2 space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Sub-Total:</span>
                              <span className="font-mono font-bold">
                                ₹{formatPrice(estimate.subtotal)}
                              </span>
                            </div>
                            {totalDiscount > 0 && (
                              <div className="flex justify-between text-rose-700 font-bold">
                                <span>Less Discount:</span>
                                <span className="font-mono">-₹{formatPrice(totalDiscount)}</span>
                              </div>
                            )}
                            {estimate.taxAmt > 0 && (
                              <div className="flex justify-between text-slate-700">
                                <span>Tax / GST ({estimate.taxPct}%):</span>
                                <span className="font-mono">+₹{formatPrice(estimate.taxAmt)}</span>
                              </div>
                            )}
                            <div
                              className="flex justify-between text-[11px] font-black border-t border-b border-black py-1 my-0.5 px-1"
                              style={{
                                backgroundColor: isStylish ? primaryColor : '#f1f5f9',
                                color: isStylish ? '#ffffff' : '#000000',
                              }}
                            >
                              <span>GRAND TOTAL:</span>
                              <span className="font-mono">₹{formatPrice(estimate.grandTotal)}</span>
                            </div>
                            <div className="flex justify-between text-[8.5px] text-emerald-800 font-bold">
                              <span>Paid / Received:</span>
                              <span className="font-mono">₹{formatPrice(estimate.paidAmount)}</span>
                            </div>
                            <div className="flex justify-between text-[9.5px] font-black text-rose-700 border-t border-dotted border-slate-400 pt-0.5">
                              <span>BALANCE DUE:</span>
                              <span className="font-mono">₹{formatPrice(estimate.balanceDue)}</span>
                            </div>
                          </div>

                          {config.showSignatureBox && (
                            <div className="border-t border-black p-1.5 text-right bg-slate-50/40">
                              <span className="text-[7px] font-bold block text-slate-600 uppercase">
                                For {businessName}
                              </span>
                              <div className="h-4" />
                              <span className="text-[7.5px] font-bold border-t border-slate-500 pt-0.5 px-2 inline-block text-black">
                                {config.authorizedSignatoryLabel || 'Authorized Signatory'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
