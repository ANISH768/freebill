export interface PaymentRecord {
  id: number;
  date: string;
  amount: number;
  paymentMode: 'CASH' | 'UPI' | 'BANK';
  reference?: string;
  notes?: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  gstin: string;
  address: string;
  stateCode?: string;
  openingBalance?: number;
  payments?: PaymentRecord[];
  userPhone?: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  unit: string;
  stock: number;
  mrp: number;
  price: number;
  purchasePrice?: number;
  discount?: number;
  minStock?: number; // Reorder Level
  gstRate?: number; // 0, 5, 12, 18, 28
  batchNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  warehouse?: string;
  barcode?: string;
  userPhone?: string;
  hsn?: string;
}

export interface InvoiceItem {
  id?: number;
  productId?: number;
  name: string;
  qty: number;
  unit: string;
  mrp: number;
  price: number;
  disc: number; // discount percentage
  total: number;
  purchasePrice?: number;
  rowDiscountType?: 'PERCENT' | 'FLAT';
  rowDiscountVal?: number;
  gstRate?: number; // 0, 5, 12, 18, 28
  taxableValue?: number;
  cgstAmt?: number;
  sgstAmt?: number;
  igstAmt?: number;
  batchNumber?: string;
  expiryDate?: string;
  sku?: string;
  hsn?: string;
}

export interface SplitPayments {
  cash: number;
  upi: number;
  bank: number;
  credit: number;
}

export interface Estimate {
  id: number;
  serial: string;
  date: string;
  dueDate: string;
  clientId: number;
  clientName: string;
  clientPhone: string;
  clientAddr: string;
  clientGstin?: string;
  deliveryNote: string;
  terms: string;
  subtotal: number;
  taxPct: number;
  taxAmt: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  isInterState?: boolean;
  cashDiscount: number;
  flatFinalDiscount?: number;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  items: InvoiceItem[];
  splitPayments?: SplitPayments;
  splitCash?: number;
  splitUpi?: number;
  splitBank?: number;
  splitCredit?: number;
  includePaymentQR?: boolean;
  userPhone?: string;
  paymentMode?: string;
  isCancelled?: boolean;
  voidedBy?: string;
  voidReason?: string;
  signature?: string;
  invoiceTheme?: SecondaryPrintStyle;
  isGstInvoice?: boolean;
}

export type SecondaryPrintStyle =
  | 'estimate'
  | 'modern'
  | 'classic_gst'
  | 'minimal'
  | 'wholesale'
  | 'stylish'
  | 'tally_prime_gst'
  | 'tally_prime_non_gst'
  | 'tally_erp9_gst'
  | 'tally_simple_estimate';

export interface PrintTemplateConfig {
  layout: 'A4' | 'A5' | 'THERMAL_80' | 'THERMAL_58';
  secondaryStyle: SecondaryPrintStyle;
  // Header / Business info
  businessName: string;
  tagline: string;
  logoUrl?: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  pan: string;
  state: string;
  // Document titles
  billTitle: string; // e.g. "ESTIMATE / BILL OF SUPPLY", "TAX INVOICE", "CASH MEMO"
  secondaryBillTitle: string;
  // Columns visibility toggles
  showMrp: boolean;
  showHsn: boolean;
  showUnit: boolean;
  showDiscount: boolean;
  showRate: boolean;
  // Bank & UPI Details
  showBankDetails: boolean;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  branchName: string;
  upiId: string;
  showQrCode: boolean;
  // Terms & Footer
  termsHeader: string;
  terms: string;
  footerNote: string;
  authorizedSignatoryLabel: string;
  showSignatureBox: boolean;
  // Visual tweaks
  primaryColor: string;
  fontSizeScale: 'compact' | 'normal' | 'comfortable';
  compactSpacing: boolean;
}

export interface User {
  phone: string;
  password: string;
  businessName: string;
  ownerName?: string;
  businessType?: string;
  address?: string;
  state?: string;
  email?: string;
  gstin?: string;
  upiId?: string;
  clerkPassword?: string;
  invoicePrefix?: string;
  accentColor?: string;
  logoUrl?: string;
  recoveryCode?: string;
  securityQuestion?: string;
  securityAnswer?: string;
}

export interface StockLog {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  type: 'INCOMING' | 'OUTGOING' | 'ADJUSTMENT' | 'INITIAL' | 'RETURN';
  qty: number;
  prevStock: number;
  newStock: number;
  date: string;
  reference: string;
  price?: number;
  warehouse?: string;
  userPhone?: string;
}

export type SystemAuditAction =
  | 'BILL_CREATED'
  | 'BILL_EDITED'
  | 'BILL_DELETED'
  | 'BILL_CANCELLED'
  | 'HEALTH_CHECK_REPAIR'
  | 'STOCK_ADJUSTED'
  | 'CLIENT_ADDED'
  | 'PRODUCT_ADDED'
  | 'PRICE_CHANGED'
  | 'PAYMENT_COLLECTED'
  | 'LOGIN'
  | 'FAILED_LOGIN'
  | 'PASSWORD_RESET'
  | 'BACKUP_EXPORTED'
  | 'RESTORE_DATA'
  | 'SETTINGS_CHANGED'
  | 'DATABASE_RESET'
  | 'OTP_ATTEMPT_SUCCESS'
  | 'OTP_ATTEMPT_FAILURE';

export interface AuditLog {
  id?: number;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: 'admin' | 'clerk';
  action: SystemAuditAction;
  details: string;
  deviceInfo?: string;
  userPhone?: string;
}

export interface HeldBill {
  id: string;
  parkedAt: string;
  clientName: string;
  clientPhone: string;
  clientId?: number;
  items: InvoiceItem[];
  grandTotal: number;
  isGstInvoice?: boolean;
  invoiceTheme?: SecondaryPrintStyle;
  notes?: string;
}

export interface ExpenseRecord {
  id: string;
  date: string;
  category: 'Rent' | 'Electricity' | 'Transport' | 'Staff Salary' | 'Packaging' | 'Misc';
  description: string;
  amount: number;
  paymentMode: 'CASH' | 'UPI' | 'BANK';
}

export interface OtpAuditLogEntry {
  id?: number;
  logId: string;
  timestamp: string;
  status: 'success' | 'failure';
  attemptType: 'OTP_DISPATCH' | 'OTP_VERIFY' | 'RECOVERY_DISPATCH' | 'RECOVERY_VERIFY';
  channel: 'whatsapp' | 'sms' | 'email';
  maskedPhone: string;
  provider: string;
  diagnosticCode: string;
  reason: string;
}

export interface UserUserDataState {
  clients: Client[];
  products: Product[];
  estimates: Estimate[];
  stockLogs?: StockLog[];
  auditLogs?: AuditLog[];
  costFallbackPct?: number;
  businessName?: string;
  userGstin?: string;
  userUpiId?: string;
  lastMutationTime?: number;
  last_synced_millis?: number;
}

export interface OfflineSyncQueueItem {
  mobileNumber: string;
  payload: UserUserDataState;
  timestamp: number;
}

