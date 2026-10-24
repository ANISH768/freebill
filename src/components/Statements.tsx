import { useState, useMemo, useEffect, FormEvent } from 'react';
import { Client, Estimate, PaymentRecord } from '../types';
import { isEstimateForClient } from '../utils/clientMatching';
import { 
  Landmark, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  AlertTriangle, 
  FileDown, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar, 
  Coins, 
  Check, 
  X, 
  FileText, 
  Printer, 
  Edit,
  Users,
  User,
  Search,
  Filter,
  ArrowUpDown,
  MessageSquare,
  Eye,
  Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StatementsProps {
  clients: Client[];
  estimates: Estimate[];
  businessName?: string;
  userRole?: 'admin' | 'clerk';
  initialClientId?: number | '';
  onUpdateClientPayments: (clientId: number, openingBalance: number, payments: PaymentRecord[]) => void;
  onEditEstimate?: (id: number) => void;
  onPrintEstimate?: (id: number) => void;
}

export default function Statements({ 
  clients, 
  estimates, 
  businessName = "My Business", 
  userRole = 'admin',
  initialClientId = '',
  onUpdateClientPayments,
  onEditEstimate,
  onPrintEstimate
}: StatementsProps) {
  const [selectedClientId, setSelectedClientId] = useState<number | ''>(initialClientId ? Number(initialClientId) : '');
  const [viewMode, setViewMode] = useState<'all' | 'single'>(initialClientId ? 'single' : 'all');

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(Number(initialClientId));
      setViewMode('single');
    }
  }, [initialClientId]);

  const [upiId, setUpiId] = useState('anishdarro015@gmail.com');
  const [clipboardFeedback, setClipboardFeedback] = useState<string | null>(null);

  // All Customers Ledger state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'dues' | 'settled' | 'advance'>('all');
  const [sortBy, setSortBy] = useState<'dues_desc' | 'dues_asc' | 'name_asc' | 'billed_desc'>('dues_desc');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printScope, setPrintScope] = useState<'all' | 'dues'>('all');

  // Currency helper
  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Opening Balance editing states
  const [isEditingOpeningBalance, setIsEditingOpeningBalance] = useState(false);
  const [tempOpeningBalance, setTempOpeningBalance] = useState('');

  // Payment Record Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK'>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Selected client profile helper
  const matchedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find(c => Number(c.id) === Number(selectedClientId)) || null;
  }, [selectedClientId, clients]);

  // Chronological ledger construction
  const ledgerReport = useMemo(() => {
    if (!matchedClient) return null;

    const openingBal = matchedClient.openingBalance || 0;
    // Strictly isolate bills belonging to this specific customer
    const clientBills = estimates.filter(e => isEstimateForClient(e, matchedClient));
    const clientPayments = matchedClient.payments || [];

    interface LedgerItem {
      id: string;
      date: string;
      type: 'SALE' | 'RECEIVE';
      description: string;
      reference: string;
      debit: number;
      credit: number;
      originalId: number;
      source: 'bill' | 'manual';
    }

    const rawTxs: LedgerItem[] = [];

    // 1. Add Sales Bills
    clientBills.forEach(b => {
      // The sale itself (debit)
      rawTxs.push({
        id: `sale_${b.id}`,
        date: b.date,
        type: 'SALE',
        description: 'Sales Bill (बिक्री बिल)',
        reference: b.serial,
        debit: b.grandTotal,
        credit: 0,
        originalId: b.id,
        source: 'bill'
      });

      // Payment made at the time of the bill (credit)
      if (b.paidAmount > 0) {
        rawTxs.push({
          id: `bill_pay_${b.id}`,
          date: b.date,
          type: 'RECEIVE',
          description: 'Payment Received (बिल भुगतान)',
          reference: `${b.serial} (Auto)`,
          debit: 0,
          credit: b.paidAmount,
          originalId: b.id,
          source: 'bill'
        });
      }
    });

    // 2. Add Manual Payments
    clientPayments.forEach(p => {
      rawTxs.push({
        id: `manual_pay_${p.id}`,
        date: p.date,
        type: 'RECEIVE',
        description: p.notes ? `Payment Received: ${p.notes}` : 'Payment Received (प्राप्त भुगतान)',
        reference: p.paymentMode + (p.reference ? ` (${p.reference})` : ''),
        debit: 0,
        credit: p.amount,
        originalId: p.id,
        source: 'manual'
      });
    });

    // 3. Sort transaction list chronologically by date
    rawTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 4. Calculate running balances starting from opening balance
    let balance = openingBal;
    const ledger = rawTxs.map(tx => {
      if (tx.type === 'SALE') {
        balance += tx.debit;
      } else {
        balance -= tx.credit;
      }
      return {
        ...tx,
        runningBalance: balance
      };
    });

    // Aggregations
    const totalBilled = clientBills.reduce((acc, b) => acc + b.grandTotal, 0);
    const totalPaidOnBills = clientBills.reduce((acc, b) => acc + b.paidAmount, 0);
    const totalManualPayments = clientPayments.reduce((acc, p) => acc + p.amount, 0);
    const totalPaid = totalPaidOnBills + totalManualPayments;
    const netOutstanding = openingBal + totalBilled - totalPaid;

    return {
      client: matchedClient,
      openingBalance: openingBal,
      ledger,
      totalBilled,
      totalPaid,
      netOutstanding,
      invoiceCount: clientBills.length,
      manualPaymentCount: clientPayments.length
    };
  }, [matchedClient, estimates]);

  // Consolidated Ledger Calculation for ALL Customers
  const allCustomerSummaries = useMemo(() => {
    return clients.map(client => {
      const openingBal = Number(client.openingBalance) || 0;
      const clientBills = estimates.filter(e => isEstimateForClient(e, client));
      const clientPayments = client.payments || [];

      const totalBilled = clientBills.reduce((acc, b) => acc + (b.grandTotal || 0), 0);
      const totalPaidOnBills = clientBills.reduce((acc, b) => acc + (b.paidAmount || 0), 0);
      const totalManualPayments = clientPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
      const totalPaid = totalPaidOnBills + totalManualPayments;
      const netOutstanding = openingBal + totalBilled - totalPaid;

      // Find latest transaction date
      const dates: string[] = [];
      clientBills.forEach(b => { if (b.date) dates.push(b.date); });
      clientPayments.forEach(p => { if (p.date) dates.push(p.date); });
      dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const lastTxDate = dates.length > 0 ? dates[0] : 'None';

      return {
        client,
        openingBalance: openingBal,
        totalBilled,
        totalPaid,
        netOutstanding,
        invoiceCount: clientBills.length,
        manualPaymentCount: clientPayments.length,
        lastTxDate
      };
    });
  }, [clients, estimates]);

  // Aggregate Market Totals
  const aggregateTotals = useMemo(() => {
    let totalOpening = 0;
    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let duesCount = 0;
    let settledCount = 0;
    let advanceCount = 0;

    allCustomerSummaries.forEach(s => {
      totalOpening += s.openingBalance;
      totalBilled += s.totalBilled;
      totalPaid += s.totalPaid;
      totalOutstanding += s.netOutstanding;
      if (s.netOutstanding > 0.01) duesCount++;
      else if (s.netOutstanding < -0.01) advanceCount++;
      else settledCount++;
    });

    return {
      totalCustomers: allCustomerSummaries.length,
      totalOpening,
      totalBilled,
      totalPaid,
      totalOutstanding,
      duesCount,
      settledCount,
      advanceCount
    };
  }, [allCustomerSummaries]);

  // Filtered & Sorted Customer Summaries
  const filteredCustomerSummaries = useMemo(() => {
    const list = allCustomerSummaries.filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.client.name.toLowerCase().includes(q);
        const matchPhone = (item.client.phone || '').includes(q);
        const matchAddr = (item.client.address || '').toLowerCase().includes(q);
        const matchGstin = (item.client.gstin || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchAddr && !matchGstin) return false;
      }

      if (filterStatus === 'dues') return item.netOutstanding > 0.01;
      if (filterStatus === 'settled') return Math.abs(item.netOutstanding) <= 0.01;
      if (filterStatus === 'advance') return item.netOutstanding < -0.01;

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'dues_desc') return b.netOutstanding - a.netOutstanding;
      if (sortBy === 'dues_asc') return a.netOutstanding - b.netOutstanding;
      if (sortBy === 'billed_desc') return b.totalBilled - a.totalBilled;
      if (sortBy === 'name_asc') return a.client.name.localeCompare(b.client.name);
      return 0;
    });

    return list;
  }, [allCustomerSummaries, searchQuery, filterStatus, sortBy]);

  // Items targeted for printing based on user scope
  const itemsToPrint = useMemo(() => {
    if (printScope === 'dues') {
      return allCustomerSummaries.filter(s => s.netOutstanding > 0.01);
    }
    return allCustomerSummaries;
  }, [allCustomerSummaries, printScope]);

  // Export All Customers Ledger PDF (A4 Landscape, print ready)
  const exportAllCustomersLedgerPDF = (scope: 'all' | 'dues' = printScope) => {
    const targetList = scope === 'dues' 
      ? allCustomerSummaries.filter(s => s.netOutstanding > 0.01)
      : allCustomerSummaries;

    if (targetList.length === 0) {
      alert("No customers found for this export scope.");
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const primaryColor = [15, 23, 42];
    const grayColor = [100, 116, 139];

    // Header Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(businessName.toUpperCase() || "BUSINESS BILLING DESK", 14, 14);

    doc.setFontSize(9);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text(
      scope === 'dues'
        ? "CUSTOMER OUTSTANDING BALANCE REPORT (केवल बकाया वाले ग्राहकों का लेजर)"
        : "ALL CUSTOMERS OUTSTANDING LEDGER & BALANCE STATEMENT (सभी ग्राहकों का लेजर खाता)",
      14,
      19
    );

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Generated: ${dateStr} at ${timeStr}`, 283, 14, { align: 'right' });
    doc.text(`Total Accounts Listed: ${targetList.length}`, 283, 19, { align: 'right' });

    // Divider
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(14, 22, 283, 22);

    // Totals of this target list
    const scopeOpening = targetList.reduce((acc, c) => acc + c.openingBalance, 0);
    const scopeBilled = targetList.reduce((acc, c) => acc + c.totalBilled, 0);
    const scopePaid = targetList.reduce((acc, c) => acc + c.totalPaid, 0);
    const scopeOutstanding = targetList.reduce((acc, c) => acc + c.netOutstanding, 0);

    // Summary Scorecard Banner
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, 25, 269, 12, 1.5, 1.5, 'F');

    doc.setFontSize(8);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(`Total Customers: ${targetList.length}`, 18, 32.5);
    doc.text(`Old Balance: INR ${scopeOpening.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 68, 32.5);
    doc.text(`Total Sales (+): INR ${scopeBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 122, 32.5);
    doc.setTextColor(16, 124, 65);
    doc.text(`Total Paid (-): INR ${scopePaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 178, 32.5);
    doc.setTextColor(220, 38, 38);
    doc.text(`Net Outstanding Due: INR ${scopeOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 228, 32.5);

    const headers = [["S.N.", "CUSTOMER NAME", "MOBILE", "CITY / ADDRESS", "OLD BAL", "TOTAL SALES (+)", "TOTAL PAID (-)", "NET BALANCE DUE", "STATUS"]];

    const bodyRows = targetList.map((c, idx) => [
      idx + 1,
      c.client.name,
      c.client.phone || '--',
      c.client.address || '--',
      c.openingBalance !== 0 ? `INR ${c.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "0.00",
      c.totalBilled !== 0 ? `INR ${c.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "0.00",
      c.totalPaid !== 0 ? `INR ${c.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "0.00",
      `INR ${c.netOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      c.netOutstanding > 0.01 ? "DUE" : c.netOutstanding < -0.01 ? "ADVANCE" : "SETTLED"
    ]);

    // Grand Total Row
    bodyRows.push([
      "",
      "GRAND TOTAL",
      "",
      "",
      `INR ${scopeOpening.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `INR ${scopeBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `INR ${scopePaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `INR ${scopeOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      ""
    ]);

    autoTable(doc, {
      startY: 40,
      head: headers,
      body: bodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'left', cellWidth: 50 },
        2: { halign: 'center', cellWidth: 26 },
        3: { halign: 'left', cellWidth: 46 },
        4: { halign: 'right', cellWidth: 26 },
        5: { halign: 'right', cellWidth: 28 },
        6: { halign: 'right', cellWidth: 28, textColor: [16, 124, 65] },
        7: { halign: 'right', cellWidth: 32, fontStyle: 'bold', textColor: [220, 38, 38] },
        8: { halign: 'center', cellWidth: 21 }
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        font: 'Helvetica'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      didParseCell: function (data) {
        if (data.row.index === bodyRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [226, 232, 240];
          data.cell.styles.textColor = [15, 23, 42];
        }
      }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 160;
    const sigX = 230;
    if (finalY + 24 < 195) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      doc.text("Authorized Signature & Seal", sigX, finalY + 18);
      doc.setDrawColor(186, 195, 201);
      doc.line(sigX - 10, finalY + 13, sigX + 45, finalY + 13);
    }

    doc.save(`All_Customers_Ledger_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Export All Customers CSV
  const exportAllCustomersCSV = () => {
    let csv = "S.No,Customer Name,Mobile,Address,GSTIN,Opening Balance (Rs),Total Sales (Rs),Total Paid (Rs),Net Balance Due (Rs),Status\n";
    filteredCustomerSummaries.forEach((s, idx) => {
      const status = s.netOutstanding > 0.01 ? "DUE" : s.netOutstanding < -0.01 ? "ADVANCE" : "SETTLED";
      csv += `${idx + 1},"${(s.client.name || '').replace(/"/g, '""')}","${s.client.phone || ''}","${(s.client.address || '').replace(/"/g, '""')}","${s.client.gstin || ''}",${s.openingBalance.toFixed(2)},${s.totalBilled.toFixed(2)},${s.totalPaid.toFixed(2)},${s.netOutstanding.toFixed(2)},"${status}"\n`;
    });
    csv += `,"TOTAL",,,,${aggregateTotals.totalOpening.toFixed(2)},${aggregateTotals.totalBilled.toFixed(2)},${aggregateTotals.totalPaid.toFixed(2)},${aggregateTotals.totalOutstanding.toFixed(2)},\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `All_Customers_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger Opening Balance save
  const handleSaveOpeningBalance = () => {
    if (!matchedClient) return;
    const amount = parseFloat(tempOpeningBalance) || 0;
    onUpdateClientPayments(matchedClient.id, amount, matchedClient.payments || []);
    setIsEditingOpeningBalance(false);
  };

  // Open modal to add new payment
  const handleOpenAddPayment = () => {
    setEditingPaymentId(null);
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMode('CASH');
    setPaymentReference('');
    setPaymentNotes('');
    setShowPaymentModal(true);
  };

  // Open modal to edit manual payment
  const handleOpenEditPayment = (p: PaymentRecord) => {
    setEditingPaymentId(p.id);
    setPaymentAmount(p.amount.toString());
    setPaymentDate(p.date);
    setPaymentMode(p.paymentMode);
    setPaymentReference(p.reference || '');
    setPaymentNotes(p.notes || '');
    setShowPaymentModal(true);
  };

  // Save/Update manual payment receipt
  const handleSavePaymentRecord = (e: FormEvent) => {
    e.preventDefault();
    if (!matchedClient) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid payment amount greater than zero.");
      return;
    }

    const currentPayments = [...(matchedClient.payments || [])];

    if (editingPaymentId !== null) {
      // Edit mode
      const idx = currentPayments.findIndex(p => p.id === editingPaymentId);
      if (idx !== -1) {
        currentPayments[idx] = {
          ...currentPayments[idx],
          amount,
          date: paymentDate,
          paymentMode,
          reference: paymentReference.trim() || undefined,
          notes: paymentNotes.trim() || undefined
        };
      }
    } else {
      // Add mode
      const newPayment: PaymentRecord = {
        id: Date.now(),
        amount,
        date: paymentDate,
        paymentMode,
        reference: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined
      };
      currentPayments.push(newPayment);
    }

    onUpdateClientPayments(matchedClient.id, matchedClient.openingBalance || 0, currentPayments);
    setShowPaymentModal(false);
  };

  // Delete manual payment record
  const handleDeletePaymentRecord = (paymentId: number) => {
    if (!matchedClient) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this payment record? This will instantly update the customer's balance.");
    if (!confirmDelete) return;

    const updatedPayments = (matchedClient.payments || []).filter(p => p.id !== paymentId);
    onUpdateClientPayments(matchedClient.id, matchedClient.openingBalance || 0, updatedPayments);
  };

  // Export Statement to PDF
  const exportPDF = () => {
    if (!ledgerReport) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const primaryColor = [30, 41, 59]; // slate-800
    const secondaryColor = [79, 70, 229]; // indigo-600
    const grayColor = [100, 116, 139]; // slate-500
    const lightGrayBg = [248, 250, 252]; // slate-50
    const lineStroke = [226, 232, 240]; // slate-200

    // Header - Business Profile
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(businessName, 14, 20);

    doc.setFontSize(8.5);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text("CUSTOMER ACCOUNT LEDGER STATEMENT", 14, 25);

    // Document Title (Right Header)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("ACCOUNT STATEMENT", 196, 20, { align: "right" });

    // Statement metadata (Right Header below)
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}`, 196, 25, { align: "right" });

    // Decorative Separator
    doc.setDrawColor(lineStroke[0], lineStroke[1], lineStroke[2]);
    doc.setLineWidth(0.4);
    doc.line(14, 29, 196, 29);

    // Profile Details
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("STATEMENT FOR:", 14, 38);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.text(ledgerReport.client.name, 14, 44);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text(`Phone: +91 ${ledgerReport.client.phone}`, 14, 49);
    if (ledgerReport.client.address) {
      doc.text(`Address: ${ledgerReport.client.address}`, 14, 54);
    }
    if (ledgerReport.client.gstin) {
      doc.text(`GSTIN: ${ledgerReport.client.gstin}`, 14, 59);
    }

    // Right Block: Account summary metadata
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("ACCOUNT OVERVIEW:", 130, 38);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text(`Total Sales Bills: ${ledgerReport.invoiceCount}`, 130, 44);
    doc.text(`Payment Records: ${ledgerReport.manualPaymentCount}`, 130, 49);
    doc.text(`Status: ${ledgerReport.netOutstanding > 0 ? "OUTSTANDING DUE" : "FULLY SETTLED"}`, 130, 54);

    // Beautiful Balance Scorecard
    const cardY = 66;
    doc.setFillColor(lightGrayBg[0], lightGrayBg[1], lightGrayBg[2]);
    doc.roundedRect(14, cardY, 182, 22, 2, 2, "F");

    const colWidth = 182 / 4;
    
    // Label Row
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text("OPENING BALANCE", 14 + 5, cardY + 7);
    doc.text("TOTAL SALES (+)", 14 + colWidth + 5, cardY + 7);
    doc.text("TOTAL RECEIVED (-)", 14 + colWidth * 2 + 5, cardY + 7);
    doc.text("NET OUTSTANDING DUE", 14 + colWidth * 3 + 5, cardY + 7);

    // Value Row
    doc.setFontSize(9.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`INR ${ledgerReport.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14 + 5, cardY + 15);
    doc.text(`INR ${ledgerReport.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14 + colWidth + 5, cardY + 15);

    doc.setTextColor(16, 185, 129); // emerald green
    doc.text(`INR ${ledgerReport.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14 + colWidth * 2 + 5, cardY + 15);

    doc.setTextColor(220, 38, 38); // red
    doc.text(`INR ${ledgerReport.netOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14 + colWidth * 3 + 5, cardY + 15);

    // Detailed ledger transaction log table headers
    const headers = [["DATE", "DESCRIPTION", "REFERENCE / MODE", "DEBIT (SALE)", "CREDIT (RECEIVED)", "RUNNING BALANCE"]];

    const bodyRows = [
      // Starting balance row
      [
        "---",
        "Opening Balance (पुराना बकाया)",
        "Starting Record",
        ledgerReport.openingBalance > 0 ? `INR ${ledgerReport.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "INR 0.00",
        "INR 0.00",
        `INR ${ledgerReport.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ],
      // Transformed transactional log rows
      ...ledgerReport.ledger.map(item => [
        item.date,
        item.description,
        item.reference,
        item.debit > 0 ? `INR ${item.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "INR 0.00",
        item.credit > 0 ? `INR ${item.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "INR 0.00",
        `INR ${item.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ])
    ];

    // Build Table
    autoTable(doc, {
      startY: cardY + 30,
      head: headers,
      body: bodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { halign: 'left', cellWidth: 50 },
        2: { halign: 'left', cellWidth: 32 },
        3: { halign: 'right' },
        4: { halign: 'right', textColor: [16, 124, 65] },
        5: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] }
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
        font: 'Helvetica'
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 160;

    // Stamp / Authorized section at the bottom
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
    doc.text("Thank you for your business!", 14, finalY + 12);
    doc.text("For balance confirmation or ledger disputes, please contact us.", 14, finalY + 17);

    // Signature Area
    const sigX = 145;
    doc.setDrawColor(186, 195, 201);
    doc.setLineWidth(0.4);
    doc.line(sigX, finalY + 22, sigX + 45, finalY + 22);
    doc.setFont("Helvetica", "bold");
    doc.text("Authorized Signature & Seal", sigX + 1, finalY + 27);

    const cleanName = ledgerReport.client.name.replace(/\s+/g, '_').toUpperCase();
    doc.save(`${cleanName}_STATEMENT.pdf`);
  };

  // Selected month for GSTR exports
  const [selectedGstrMonth, setSelectedGstrMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  // Export GSTR-1 CSV
  const exportGSTR1CSV = () => {
    const [yearStr, monthStr] = selectedGstrMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const filtered = estimates.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    let csvContent = "Invoice Number,Invoice Date,Customer Name,Customer GSTIN,Taxable Value (Rs),CGST (Rs),SGST (Rs),IGST (Rs),Total Invoice Value (Rs),Status\n";

    filtered.forEach(e => {
      const subtotal = e.subtotal || 0;
      const cgst = e.cgstTotal || (e.taxAmt ? e.taxAmt / 2 : 0);
      const sgst = e.sgstTotal || (e.taxAmt ? e.taxAmt / 2 : 0);
      const igst = e.igstTotal || 0;
      const grandTotal = e.grandTotal || 0;
      const gstin = e.clientGstin || '';

      csvContent += `"${e.serial}","${e.date}","${e.clientName.replace(/"/g, '""')}","${gstin}",${subtotal.toFixed(2)},${cgst.toFixed(2)},${sgst.toFixed(2)},${igst.toFixed(2)},${grandTotal.toFixed(2)},"${e.status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GSTR1_Sales_Report_${selectedGstrMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export GSTR-3B CSV
  const exportGSTR3BCSV = () => {
    const [yearStr, monthStr] = selectedGstrMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const filtered = estimates.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    filtered.forEach(e => {
      totalTaxable += e.subtotal || 0;
      totalCgst += e.cgstTotal || (e.taxAmt ? e.taxAmt / 2 : 0);
      totalSgst += e.sgstTotal || (e.taxAmt ? e.taxAmt / 2 : 0);
      totalIgst += e.igstTotal || 0;
    });

    let csvContent = "GSTR-3B Summary Report,Period: " + selectedGstrMonth + "\n\n";
    csvContent += "Nature of Supplies,Total Taxable Value (Rs),Integrated Tax IGST (Rs),Central Tax CGST (Rs),State/UT Tax SGST (Rs)\n";
    csvContent += `"(a) Outward taxable supplies (other than zero rated)",${totalTaxable.toFixed(2)},${totalIgst.toFixed(2)},${totalCgst.toFixed(2)},${totalSgst.toFixed(2)}\n`;
    csvContent += `"(b) Outward taxable supplies (zero rated)",0.00,0.00,0.00,0.00\n`;
    csvContent += `"(c) Other outward supplies (Nil rated, exempt)",0.00,0.00,0.00,0.00\n`;
    csvContent += `TOTAL OUTWARD TAX LIABILITY,${totalTaxable.toFixed(2)},${totalIgst.toFixed(2)},${totalCgst.toFixed(2)},${totalSgst.toFixed(2)}\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GSTR3B_Summary_Report_${selectedGstrMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header and View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Ledger Statements & Customer Balances</h2>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Track old balances, view consolidated market ledgers, print all customer balances, and export GSTR monthly reports.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              viewMode === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>All Customers Ledger (सभी का खाता)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${viewMode === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {clients.length}
            </span>
          </button>

          <button
            onClick={() => setViewMode('single')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              viewMode === 'single'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Single Customer (व्यक्तिगत लेजर)</span>
            {matchedClient && (
              <span className="text-[10px] font-normal opacity-90 truncate max-w-[100px]">
                : {matchedClient.name}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* GST Monthly Report Toolbar */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4.5 rounded-2xl shadow-md flex flex-col md:flex-row items-center justify-between gap-4 no-print">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Monthly GST Returns Export Desk (GSTR-1 & GSTR-3B)</span>
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">Generate valid CSV exports for monthly GST filing.</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <input
            type="month"
            value={selectedGstrMonth}
            onChange={(e) => setSelectedGstrMonth(e.target.value)}
            className="bg-slate-700 text-white border border-slate-600 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
          />
          <button
            onClick={exportGSTR1CSV}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center space-x-1"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>GSTR-1 CSV</span>
          </button>
          <button
            onClick={exportGSTR3BCSV}
            className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center space-x-1"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>GSTR-3B CSV</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: ALL CUSTOMERS LEDGER & BALANCE SHEET */}
      {viewMode === 'all' && (
        <div className="space-y-5 animate-fade-in no-print">
          {/* Top Scorecard Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Accounts</span>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl font-black text-slate-800 mt-2">{aggregateTotals.totalCustomers}</p>
              <span className="text-[11px] text-slate-400 font-medium">{aggregateTotals.duesCount} pending dues</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Old Bal (पुराना)</span>
                <Landmark className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xl font-black text-slate-800 mt-2 font-mono">₹{formatCurrency(aggregateTotals.totalOpening)}</p>
              <span className="text-[11px] text-slate-400 font-medium">Opening balance</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Sales (+)</span>
                <ArrowUpRight className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-xl font-black text-slate-800 mt-2 font-mono">₹{formatCurrency(aggregateTotals.totalBilled)}</p>
              <span className="text-[11px] text-slate-400 font-medium">Cumulative bills</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Paid (-)</span>
                <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-xl font-black text-emerald-600 mt-2 font-mono">₹{formatCurrency(aggregateTotals.totalPaid)}</p>
              <span className="text-[11px] text-slate-400 font-medium">Cash/UPI received</span>
            </div>

            <div className="bg-red-50/70 p-4 rounded-2xl border border-red-200/80 shadow-xs col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-red-700">Market Outstanding Due</span>
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-xl font-black text-red-600 mt-2 font-mono">₹{formatCurrency(aggregateTotals.totalOutstanding)}</p>
              <span className="text-[11px] text-red-600/80 font-bold">कुल मार्केट बाकी</span>
            </div>
          </div>

          {/* Search, Filter Pills & Export Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, phone, address, or GSTIN..."
                className="w-full bg-slate-50 border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                  filterStatus === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({allCustomerSummaries.length})
              </button>
              <button
                onClick={() => setFilterStatus('dues')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                  filterStatus === 'dues' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
              >
                Pending Dues ({aggregateTotals.duesCount})
              </button>
              <button
                onClick={() => setFilterStatus('settled')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                  filterStatus === 'settled' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Settled ({aggregateTotals.settledCount})
              </button>
              {aggregateTotals.advanceCount > 0 && (
                <button
                  onClick={() => setFilterStatus('advance')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                    filterStatus === 'advance' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  Advance ({aggregateTotals.advanceCount})
                </button>
              )}
            </div>

            {/* Sort & Print / PDF Action Group */}
            <div className="flex items-center gap-2 self-end lg:self-auto flex-wrap">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer py-1"
                >
                  <option value="dues_desc">Due: High to Low (अधिक बकाया)</option>
                  <option value="dues_asc">Due: Low to High (कम बकाया)</option>
                  <option value="name_asc">Name: A to Z</option>
                  <option value="billed_desc">Sales: High to Low</option>
                </select>
              </div>

              {/* Print Button */}
              <button
                onClick={() => setShowPrintModal(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
                title="Print All Customer Ledgers & Balances"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span>Print Ledger (प्रिंट)</span>
              </button>

              {/* PDF Download Button */}
              <button
                onClick={() => exportAllCustomersLedgerPDF('all')}
                className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
                title="Download Clean PDF Statement"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>

              {/* CSV Button */}
              <button
                onClick={exportAllCustomersCSV}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3 py-2 rounded-xl transition-all shadow-sm flex items-center space-x-1 cursor-pointer"
                title="Export to Excel / CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* All Customers Ledger Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="w-full overflow-x-auto block whitespace-nowrap custom-scrollbar">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-center w-12">S.N.</th>
                    <th className="p-3.5">Customer Name & Info</th>
                    <th className="p-3.5">Mobile</th>
                    <th className="p-3.5 text-right">Old Balance</th>
                    <th className="p-3.5 text-right">Total Sales (+)</th>
                    <th className="p-3.5 text-right">Total Paid (-)</th>
                    <th className="p-3.5 text-right">Net Balance Due</th>
                    <th className="p-3.5 text-center">Invoices</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredCustomerSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-bold">No customers found matching the search/filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredCustomerSummaries.map((s, idx) => (
                      <tr 
                        key={s.client.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        <td className="p-3.5 text-center font-mono text-slate-400 font-bold">
                          {idx + 1}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-black flex items-center justify-center text-xs">
                              {s.client.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <button
                                onClick={() => {
                                  setSelectedClientId(s.client.id);
                                  setViewMode('single');
                                }}
                                className="font-black text-slate-800 hover:text-blue-600 text-left transition-colors cursor-pointer block"
                              >
                                {s.client.name}
                              </button>
                              {s.client.address && (
                                <span className="text-[10px] text-slate-400 truncate max-w-xs block">
                                  {s.client.address}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-600 font-bold">
                          {s.client.phone ? `+91 ${s.client.phone}` : '--'}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-600">
                          ₹{formatCurrency(s.openingBalance)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-800">
                          ₹{formatCurrency(s.totalBilled)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-emerald-600">
                          ₹{formatCurrency(s.totalPaid)}
                        </td>
                        <td className="p-3.5 text-right">
                          {s.netOutstanding > 0.01 ? (
                            <span className="font-mono font-black text-red-650 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg text-xs inline-block">
                              ₹{formatCurrency(s.netOutstanding)}
                            </span>
                          ) : s.netOutstanding < -0.01 ? (
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-xs inline-block">
                              ₹{formatCurrency(Math.abs(s.netOutstanding))} Adv
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] inline-block">
                              Settled (₹0.00)
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {s.invoiceCount} bills
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* View Statement */}
                            <button
                              onClick={() => {
                                setSelectedClientId(s.client.id);
                                setViewMode('single');
                              }}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="View Detailed Ledger Statement"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Receive Payment Quick Button */}
                            <button
                              onClick={() => {
                                setSelectedClientId(s.client.id);
                                setEditingPaymentId(null);
                                setPaymentAmount('');
                                setPaymentDate(new Date().toISOString().split('T')[0]);
                                setPaymentMode('CASH');
                                setPaymentReference('');
                                setPaymentNotes('');
                                setShowPaymentModal(true);
                              }}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Receive Payment (रुपये जमा करें)"
                            >
                              <Coins className="w-4 h-4" />
                            </button>

                            {/* WhatsApp Reminder */}
                            {s.client.phone && (
                              <a
                                href={`https://wa.me/91${s.client.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                  `नमस्ते ${s.client.name} जी,\n${businessName} की तरफ से।\n\nआपके खाते का कुल बकाया बैलेंस: ₹${formatCurrency(s.netOutstanding)} है।\nकृपया समय पर भुगतान कर रसीद प्राप्त करें।\n\nधन्यवाद!`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors cursor-pointer"
                                title="Send WhatsApp Balance Reminder"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {/* Table Summary Footer */}
                {filteredCustomerSummaries.length > 0 && (
                  <tfoot className="bg-slate-100/90 font-black border-t-2 border-slate-300 text-xs">
                    <tr>
                      <td colSpan={3} className="p-3.5 text-slate-700 uppercase">
                        Grand Total ({filteredCustomerSummaries.length} Accounts):
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-800">
                        ₹{formatCurrency(filteredCustomerSummaries.reduce((a, b) => a + b.openingBalance, 0))}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-800">
                        ₹{formatCurrency(filteredCustomerSummaries.reduce((a, b) => a + b.totalBilled, 0))}
                      </td>
                      <td className="p-3.5 text-right font-mono text-emerald-600">
                        ₹{formatCurrency(filteredCustomerSummaries.reduce((a, b) => a + b.totalPaid, 0))}
                      </td>
                      <td className="p-3.5 text-right font-mono text-red-650 text-sm">
                        ₹{formatCurrency(filteredCustomerSummaries.reduce((a, b) => a + b.netOutstanding, 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: SINGLE CUSTOMER DETAILED STATEMENT */}
      {viewMode === 'single' && (
        <div className="space-y-6 animate-fade-in no-print">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm max-w-md">
            <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
              Select Customer Profile
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : '';
                setSelectedClientId(val);
                setIsEditingOpeningBalance(false);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none cursor-pointer focus:bg-white focus:border-blue-500 transition-all text-slate-800"
            >
              <option value="">-- Choose a Customer --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} (Phone: {c.phone})</option>
              ))}
            </select>
          </div>

          {ledgerReport ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in font-sans">
          
          {/* Summary Box & Configurations */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 self-start">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center space-x-1.5 border-b pb-2">
              <Landmark className="w-4 h-4 text-slate-500" />
              <span>Ledger Statement Summary</span>
            </h3>

            {/* Editable Opening Balance (Old Balance) */}
            <div className="p-3.5 bg-slate-50/50 rounded-xl border border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">Old Balance (पुराना बकाया):</span>
                {isEditingOpeningBalance ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tempOpeningBalance}
                      onChange={(e) => setTempOpeningBalance(e.target.value)}
                      className="w-20 bg-white border border-slate-300 p-1 rounded-md text-xs font-bold text-slate-800 focus:outline-none"
                      placeholder="0.00"
                    />
                    <button
                      onClick={handleSaveOpeningBalance}
                      className="p-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md cursor-pointer transition-colors"
                      title="Save Old Balance"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsEditingOpeningBalance(false)}
                      className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-md cursor-pointer transition-colors"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800 font-mono">
                      ₹{ledgerReport.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    {userRole === 'admin' && (
                      <button
                        onClick={() => {
                          setTempOpeningBalance(ledgerReport.openingBalance.toString());
                          setIsEditingOpeningBalance(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 p-0.5 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Edit Old Balance (पुराना बकाया)"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                Add an starting or previous old balance of this customer directly.
              </p>
            </div>

            <div className="space-y-3.5 text-xs font-medium border-t pt-3">
              <div className="flex justify-between items-center text-slate-600">
                <span>Total Value Purchased (+):</span>
                <span className="font-bold text-slate-800 font-mono">
                  ₹{ledgerReport.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-emerald-800">
                <span className="flex items-center gap-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Total Received (-):</span>
                </span>
                <span className="font-black text-emerald-650 font-mono">
                  ₹{ledgerReport.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-center text-red-800 border-t border-dashed border-slate-200 pt-3">
                <span className="flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-red-650" />
                  <span>Net Outstanding Balance Due:</span>
                </span>
                <span className="font-black text-red-650 font-mono text-sm font-sans">
                  ₹{ledgerReport.netOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {ledgerReport.netOutstanding > 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10px] text-amber-800 font-bold flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>Outstanding balance sheet due is pending on this account. Settle or alert the customer below.</span>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[10px] text-emerald-800 font-bold flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                <span>All ledger balances are fully settled for this profile. Excellent standing record!</span>
              </div>
            )}

            {/* Quick Action: Receive Payment */}
            <button
              onClick={handleOpenAddPayment}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center space-x-1.5"
            >
              <Coins className="w-4 h-4" />
              <span>Receive Payment (भुगतान प्राप्त करें)</span>
            </button>

            {/* UPI Settlement Desk */}
            {ledgerReport.netOutstanding > 0 && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 space-y-3 no-print">
                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block">
                  ⚡ UPI Settlement Desk
                </span>
                
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">Owner Merchant UPI ID</label>
                  <input
                     type="text"
                     value={upiId}
                     onChange={(e) => setUpiId(e.target.value)}
                     className="w-full bg-white border border-slate-200 p-2 rounded-lg text-[10px] font-bold text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                     placeholder="e.g., merchant@upi"
                  />
                </div>

                {/* Pre-filled Copy Link Actions */}
                <div className="space-y-1.5 text-[9px]">
                  <button
                    type="button"
                    onClick={() => {
                      const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(businessName)}&am=${ledgerReport.netOutstanding.toFixed(2)}&cu=INR&tn=BalanceSettlement`;
                      navigator.clipboard.writeText(upiUrl);
                      setClipboardFeedback("✓ Copy UPI Link!");
                      setTimeout(() => setClipboardFeedback(null), 2500);
                    }}
                    className="w-full bg-white hover:bg-slate-100 border border-indigo-200 text-indigo-700 font-extrabold py-2 rounded-xl cursor-pointer transition-all flex items-center justify-center space-x-1"
                  >
                    <span>🔗 Copy UPI Link</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const message = `Dear ${ledgerReport.client.name}, your outstanding balance at ${businessName} is ₹${ledgerReport.netOutstanding.toFixed(2)}. Please settle using this UPI ID: ${upiId}. Thank you!`;
                      navigator.clipboard.writeText(message);
                      setClipboardFeedback("✓ Copy Message!");
                      setTimeout(() => setClipboardFeedback(null), 2500);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2 rounded-xl cursor-pointer transition-all flex items-center justify-center space-x-1"
                  >
                    <span>💬 Copy Message text</span>
                  </button>
                  
                  {clipboardFeedback && (
                    <p className="text-[9px] text-center text-emerald-600 font-bold animate-pulse mt-1">{clipboardFeedback}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Table history list */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden select-none flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <span className="text-[10px] font-black text-slate-450 uppercase tracking-widest">Chronological Ledger Statement</span>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={exportPDF}
                  className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Export Statement PDF</span>
                </button>

                <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded font-mono">
                  {ledgerReport.ledger.length + 1} Entries
                </span>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-3.5 text-center">DATE</th>
                    <th className="p-3.5">TRANSACTION DETAILS</th>
                    <th className="p-3.5">REF / MODE</th>
                    <th className="p-3.5 text-right">DEBIT (SALE)</th>
                    <th className="p-3.5 text-right">CREDIT (RECEIVED)</th>
                    <th className="p-3.5 text-right">RUNNING BALANCE</th>
                    <th className="p-3.5 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {/* Row 0: Opening Balance */}
                  <tr className="bg-slate-50/30 font-semibold italic text-slate-500">
                    <td className="p-3.5 text-center text-slate-400">---</td>
                    <td className="p-3.5">Opening Balance (पुराना बकाया)</td>
                    <td className="p-3.5">Starting Record</td>
                    <td className="p-3.5 text-right font-mono">
                      {ledgerReport.openingBalance > 0 ? `₹${ledgerReport.openingBalance.toFixed(2)}` : '₹0.00'}
                    </td>
                    <td className="p-3.5 text-right font-mono">₹0.00</td>
                    <td className="p-3.5 text-right font-bold text-slate-700 font-mono">
                      ₹{ledgerReport.openingBalance.toFixed(2)}
                    </td>
                    <td className="p-3.5 text-center">---</td>
                  </tr>

                  {/* Transformed chronologically sorted ledger list */}
                  {ledgerReport.ledger.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 text-center text-slate-400 font-sans">{item.date}</td>
                      <td className="p-3.5">
                        <div className="flex items-center space-x-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${item.type === 'SALE' ? 'bg-blue-600' : 'bg-emerald-500'}`}></span>
                          <span className="text-slate-800">{item.description}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-450 font-mono text-[11px]">{item.reference}</td>
                      <td className="p-3.5 text-right font-bold text-slate-800 font-mono">
                        {item.debit > 0 ? `₹${item.debit.toFixed(2)}` : '—'}
                      </td>
                      <td className="p-3.5 text-right text-emerald-600 font-bold font-mono">
                        {item.credit > 0 ? `₹${item.credit.toFixed(2)}` : '—'}
                      </td>
                      <td className="p-3.5 text-right font-extrabold text-slate-900 font-mono">
                        ₹{item.runningBalance.toFixed(2)}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.source === 'bill' ? (
                            <>
                              {onPrintEstimate && (
                                <button
                                  onClick={() => onPrintEstimate(item.originalId)}
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                                  title="Print Bill"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onEditEstimate && (
                                <button
                                  onClick={() => onEditEstimate(item.originalId)}
                                  className="p-1 hover:bg-slate-100 text-blue-500 hover:text-blue-700 rounded transition-colors cursor-pointer"
                                  title="Edit Bill"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  const p = matchedClient.payments?.find(pm => pm.id === item.originalId);
                                  if (p) handleOpenEditPayment(p);
                                }}
                                className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded transition-colors cursor-pointer"
                                title="Edit Payment Record"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {userRole === 'admin' && (
                                <button
                                  onClick={() => handleDeletePaymentRecord(item.originalId)}
                                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                  title="Delete Payment Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 max-w-lg">
          <span className="text-3xl block mb-2">📋</span>
          <h3 className="font-bold text-slate-600 text-sm">Please select a customer profile to view ledger history</h3>
          <p className="text-xs text-slate-400 mt-1">
            Accounts, payment histories, and active statements will compile here automatically.
          </p>
        </div>
      )}
        </div>
      )}

      {/* ----------------- ALL CUSTOMERS PRINT-ONLY CONTAINER (FOR WINDOW.PRINT()) ----------------- */}
      <div className="hidden print:block print-only report-print-sheet text-black bg-white p-4 font-sans">
        <div className="border-b-2 border-black pb-3 mb-3 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">{businessName.toUpperCase() || "COMMERCIAL BILLING DESK"}</h1>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 mt-0.5">
              {printScope === 'dues' 
                ? 'CUSTOMER OUTSTANDING BALANCE REPORT (केवल बकाया वाले ग्राहकों का खाता विवरण)' 
                : 'ALL CUSTOMERS OUTSTANDING LEDGER & BALANCE STATEMENT (सभी ग्राहकों का लेजर खाता विवरण)'}
            </p>
          </div>
          <div className="text-right text-[10px] font-mono">
            <div><b>Date:</b> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div><b>Time:</b> {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
            <div><b>Total Accounts:</b> {itemsToPrint.length}</div>
          </div>
        </div>

        {/* Summary Metric Strip */}
        <div className="grid grid-cols-5 gap-2 border border-black p-2 mb-3 bg-slate-50 text-center text-[10px]">
          <div>
            <span className="block text-slate-600 font-bold">TOTAL ACCOUNTS</span>
            <span className="font-black text-xs font-mono">{itemsToPrint.length}</span>
          </div>
          <div>
            <span className="block text-slate-600 font-bold">OLD OPENING BAL</span>
            <span className="font-black text-xs font-mono">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.openingBalance, 0))}</span>
          </div>
          <div>
            <span className="block text-slate-600 font-bold">TOTAL SALES (+)</span>
            <span className="font-black text-xs font-mono">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.totalBilled, 0))}</span>
          </div>
          <div>
            <span className="block text-slate-600 font-bold">TOTAL RECEIVED (-)</span>
            <span className="font-black text-xs font-mono">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.totalPaid, 0))}</span>
          </div>
          <div>
            <span className="block text-red-700 font-bold">NET OUTSTANDING DUE</span>
            <span className="font-black text-xs font-mono text-red-800">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.netOutstanding, 0))}</span>
          </div>
        </div>

        {/* Printable Table */}
        <table className="w-full text-left border-collapse border border-black text-[9.5px]">
          <thead>
            <tr className="bg-slate-100 border-b border-black text-center font-bold uppercase">
              <th className="p-1.5 border-r border-black w-[5%]">S.N.</th>
              <th className="p-1.5 border-r border-black text-left pl-2 w-[25%]">Customer Name</th>
              <th className="p-1.5 border-r border-black w-[13%]">Mobile</th>
              <th className="p-1.5 border-r border-black text-left pl-2 w-[17%]">Address / City</th>
              <th className="p-1.5 border-r border-black text-right pr-2 w-[10%]">Old Bal</th>
              <th className="p-1.5 border-r border-black text-right pr-2 w-[10%]">Total Sales</th>
              <th className="p-1.5 border-r border-black text-right pr-2 w-[10%]">Total Paid</th>
              <th className="p-1.5 text-right pr-2 w-[10%]">Balance Due</th>
            </tr>
          </thead>
          <tbody>
            {itemsToPrint.map((s, idx) => (
              <tr key={s.client.id} className="border-b border-zinc-300">
                <td className="p-1.5 border-r border-black text-center">{idx + 1}</td>
                <td className="p-1.5 border-r border-black text-left pl-2 font-bold">{s.client.name}</td>
                <td className="p-1.5 border-r border-black text-center font-mono">{s.client.phone || '--'}</td>
                <td className="p-1.5 border-r border-black text-left pl-2 text-zinc-700 truncate max-w-[120px]">{s.client.address || '--'}</td>
                <td className="p-1.5 border-r border-black text-right pr-2 font-mono">₹{formatCurrency(s.openingBalance)}</td>
                <td className="p-1.5 border-r border-black text-right pr-2 font-mono">₹{formatCurrency(s.totalBilled)}</td>
                <td className="p-1.5 border-r border-black text-right pr-2 font-mono text-emerald-800">₹{formatCurrency(s.totalPaid)}</td>
                <td className={`p-1.5 text-right pr-2 font-bold font-mono ${s.netOutstanding > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  ₹{formatCurrency(s.netOutstanding)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-bold bg-slate-100 text-[10px]">
              <td colSpan={4} className="p-1.5 border-r border-black text-right pr-2 uppercase font-black">
                Grand Total ({itemsToPrint.length} Customers):
              </td>
              <td className="p-1.5 border-r border-black text-right pr-2 font-mono">
                ₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.openingBalance, 0))}
              </td>
              <td className="p-1.5 border-r border-black text-right pr-2 font-mono">
                ₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.totalBilled, 0))}
              </td>
              <td className="p-1.5 border-r border-black text-right pr-2 font-mono text-emerald-800">
                ₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.totalPaid, 0))}
              </td>
              <td className="p-1.5 text-right pr-2 font-black font-mono text-red-800">
                ₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.netOutstanding, 0))}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Signature Line */}
        <div className="mt-8 pt-4 flex justify-between items-end text-[10px]">
          <div className="text-zinc-500 max-w-sm">
            <p>Report generated digitally via BillSync Pro billing system.</p>
            <p>Please verify ledger balances with recent physical receipts.</p>
          </div>
          <div className="text-center">
            <div className="w-44 border-t border-dashed border-black pt-1 font-bold">
              Authorized Signature / Seal
            </div>
          </div>
        </div>
      </div>

      {/* ----------------- ON-SCREEN PRINT PREVIEW MODAL ----------------- */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm flex items-center gap-2">
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Print All Customers Ledger Preview (प्रिंट प्रीव्यू)</span>
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Showing {itemsToPrint.length} customer records formatted for printer & PDF export.
                </p>
              </div>

              {/* Scope Switcher in Modal */}
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                  <button
                    onClick={() => setPrintScope('all')}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      printScope === 'all' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    All ({allCustomerSummaries.length})
                  </button>
                  <button
                    onClick={() => setPrintScope('dues')}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      printScope === 'dues' ? 'bg-red-600 text-white' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Pending Dues ({aggregateTotals.duesCount})
                  </button>
                </div>

                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 font-semibold">
                Paper: Standard A4 Landscape / Portrait • Total Due: <b className="text-red-600 font-mono">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.netOutstanding, 0))}</b>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportAllCustomersLedgerPDF(printScope)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Now (प्रिंट करें)</span>
                </button>
              </div>
            </div>

            {/* Scrollable Printable Document Preview */}
            <div className="p-6 overflow-y-auto max-h-[60vh] bg-slate-200/50">
              <div className="bg-white p-6 rounded-xl shadow-md border border-slate-300 max-w-3xl mx-auto space-y-4 text-black font-sans">
                <div className="border-b-2 border-black pb-3 flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-black uppercase">{businessName.toUpperCase() || "COMMERCIAL BILLING DESK"}</h2>
                    <p className="text-[11px] font-bold uppercase text-slate-600">
                      {printScope === 'dues' ? 'Customer Outstanding Balance Report' : 'All Customers Ledger & Balance Statement'}
                    </p>
                  </div>
                  <div className="text-right text-[10px] font-mono text-slate-600">
                    <div>Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                    <div>Accounts: {itemsToPrint.length}</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 border border-slate-300 p-2 bg-slate-50 text-center text-[10px]">
                  <div><span className="text-slate-500 font-bold block">OLD BAL</span><span className="font-black font-mono">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.openingBalance, 0))}</span></div>
                  <div><span className="text-slate-500 font-bold block">SALES (+)</span><span className="font-black font-mono">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.totalBilled, 0))}</span></div>
                  <div><span className="text-slate-500 font-bold block">PAID (-)</span><span className="font-black font-mono text-emerald-600">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.totalPaid, 0))}</span></div>
                  <div><span className="text-red-600 font-bold block">OUTSTANDING DUE</span><span className="font-black font-mono text-red-600">₹{formatCurrency(itemsToPrint.reduce((a, b) => a + b.netOutstanding, 0))}</span></div>
                </div>

                <table className="w-full text-left border-collapse border border-slate-300 text-[10px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-center font-bold">
                      <th className="p-1 border-r border-slate-300 w-8">#</th>
                      <th className="p-1 border-r border-slate-300 text-left pl-2">Customer</th>
                      <th className="p-1 border-r border-slate-300">Mobile</th>
                      <th className="p-1 border-r border-slate-300 text-right pr-2">Old Bal</th>
                      <th className="p-1 border-r border-slate-300 text-right pr-2">Sales</th>
                      <th className="p-1 border-r border-slate-300 text-right pr-2">Paid</th>
                      <th className="p-1 text-right pr-2">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsToPrint.map((s, idx) => (
                      <tr key={s.client.id} className="border-b border-slate-200">
                        <td className="p-1 border-r border-slate-300 text-center text-slate-400">{idx + 1}</td>
                        <td className="p-1 border-r border-slate-300 font-bold pl-2">{s.client.name}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono">{s.client.phone || '--'}</td>
                        <td className="p-1 border-r border-slate-300 text-right pr-2 font-mono">₹{formatCurrency(s.openingBalance)}</td>
                        <td className="p-1 border-r border-slate-300 text-right pr-2 font-mono">₹{formatCurrency(s.totalBilled)}</td>
                        <td className="p-1 border-r border-slate-300 text-right pr-2 font-mono text-emerald-700">₹{formatCurrency(s.totalPaid)}</td>
                        <td className={`p-1 text-right pr-2 font-mono font-bold ${s.netOutstanding > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                          ₹{formatCurrency(s.netOutstanding)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-white border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: ADD / EDIT PAYMENT RECORD ----------------- */}
      {showPaymentModal && ledgerReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <form onSubmit={handleSavePaymentRecord} className="bg-white rounded-2xl w-full max-w-md p-6 border border-slate-200 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-850 flex items-center space-x-2 border-b pb-2">
              <Coins className="w-5 h-5 text-emerald-600" />
              <span>{editingPaymentId !== null ? "Edit Received Payment" : "Receive Customer Payment"}</span>
            </h3>

            <div className="space-y-4 text-xs text-slate-500">
              {/* Customer Profile Banner */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Party/Client</span>
                <p className="font-black text-slate-800 text-xs mt-0.5">{ledgerReport.client.name}</p>
                <p className="text-[10px] text-slate-400 font-medium">Outstanding Bal: ₹{ledgerReport.netOutstanding.toFixed(2)}</p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Amount Received (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 5000"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-black text-slate-800 text-sm outline-none focus:bg-white focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500 font-sans"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Payment Mode *</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-800 outline-none cursor-pointer focus:bg-white focus:border-blue-500 transition-all text-xs"
                    required
                  >
                    <option value="CASH">💵 Cash (नकद)</option>
                    <option value="UPI">⚡ UPI (PhonePe/GPay)</option>
                    <option value="BANK">🏛️ Bank Transfer / Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Reference / Txn ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Cheque No 123456, UPI Ref 8492"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Private Notes / Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Received partial advance, balance next week"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-semibold text-slate-750 outline-none focus:bg-white focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2.5 border border-slate-250 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-colors"
              >
                {editingPaymentId !== null ? "Save Changes" : "Record Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
