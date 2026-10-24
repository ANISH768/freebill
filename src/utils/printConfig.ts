import { PrintTemplateConfig } from '../types';

export const DEFAULT_PRINT_CONFIG: PrintTemplateConfig = {
  layout: 'A4',
  secondaryStyle: 'modern',
  businessName: 'BillSync Pro Store',
  tagline: 'Wholesale & Retail Billing Specialists',
  address: 'Main Market Road, Commercial Complex, Floor 1',
  phone: '',
  email: '',
  gstin: '07AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  state: '07 - Delhi',
  billTitle: 'ESTIMATE / BILL OF SUPPLY',
  secondaryBillTitle: 'TAX INVOICE',
  showMrp: true,
  showHsn: true,
  showUnit: true,
  showDiscount: true,
  showRate: true,
  showBankDetails: true,
  bankName: 'State Bank of India',
  accountNo: '349012384910',
  ifscCode: 'SBIN0001234',
  branchName: 'Main Branch',
  upiId: 'merchant@upi',
  showQrCode: false,
  termsHeader: 'Terms & Conditions',
  terms: '1. Goods once sold will not be taken back or exchanged.\n2. Warranty claims are directly handled by authorized manufacturer service centers.\n3. All disputes subject to local jurisdiction only.',
  footerNote: 'Thank You! Visit Again.',
  authorizedSignatoryLabel: 'Authorized Signatory',
  showSignatureBox: true,
  primaryColor: '#0f172a',
  fontSizeScale: 'normal',
  compactSpacing: false
};

const STORAGE_KEY = 'pos_print_template_config';

export function getSavedPrintConfig(businessName?: string, userPhone?: string): PrintTemplateConfig {
  const specificKey = userPhone ? `${STORAGE_KEY}_${userPhone}` : STORAGE_KEY;
  try {
    const raw = localStorage.getItem(specificKey) || localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cleanedPhone = (parsed.phone && parsed.phone !== '9876543210') ? parsed.phone : (userPhone || '');
      const cleanedEmail = (parsed.email && parsed.email !== 'billing@billsyncpro.com' && parsed.email !== 'admin@billsyncpro.com') ? parsed.email : '';
      return {
        ...DEFAULT_PRINT_CONFIG,
        ...parsed,
        phone: cleanedPhone,
        email: cleanedEmail,
        businessName: parsed.businessName || businessName || DEFAULT_PRINT_CONFIG.businessName
      };
    }
  } catch (e) {
    console.error('Failed to parse print template config:', e);
  }

  return {
    ...DEFAULT_PRINT_CONFIG,
    phone: userPhone || '',
    businessName: businessName || DEFAULT_PRINT_CONFIG.businessName
  };
}

export function savePrintConfig(config: PrintTemplateConfig, userPhone?: string): void {
  try {
    const serialized = JSON.stringify(config);
    localStorage.setItem(STORAGE_KEY, serialized);
    if (userPhone) {
      localStorage.setItem(`${STORAGE_KEY}_${userPhone}`, serialized);
    }
    // Also sync the layout choice with the legacy pos_print_format_preference
    localStorage.setItem('pos_print_format_preference', config.layout);
  } catch (e) {
    console.error('Failed to save print config to localStorage:', e);
  }
}

export function resetPrintConfig(businessName?: string): PrintTemplateConfig {
  const fresh = {
    ...DEFAULT_PRINT_CONFIG,
    businessName: businessName || DEFAULT_PRINT_CONFIG.businessName
  };
  savePrintConfig(fresh);
  return fresh;
}
