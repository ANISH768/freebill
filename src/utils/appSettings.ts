// App Settings and Retail Counter Auto-Lock State Engine
import { SupportedLanguage } from './i18n';

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  position: 'prefix' | 'suffix';
}

export const CURRENCY_PRESETS: CurrencyConfig[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (INR)', position: 'prefix' },
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)', position: 'prefix' },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)', position: 'prefix' },
  { code: 'GBP', symbol: '£', name: 'British Pound (GBP)', position: 'prefix' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham (AED)', position: 'prefix' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal (SAR)', position: 'prefix' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar (CAD)', position: 'prefix' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (AUD)', position: 'prefix' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar (SGD)', position: 'prefix' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen (JPY)', position: 'prefix' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan (CNY)', position: 'prefix' }
];

export interface TaxRegionConfig {
  id: string;
  name: string;
  description: string;
  taxLabel: string;
  defaultRate: number;
  rates: number[];
  isGstSplits: boolean; // CGST + SGST
}

export const TAX_REGION_PRESETS: TaxRegionConfig[] = [
  {
    id: 'india_gst',
    name: 'India GST (Goods & Services Tax)',
    description: 'CGST, SGST, IGST with standard HSN/SAC codes',
    taxLabel: 'GST',
    defaultRate: 18,
    rates: [0, 5, 12, 18, 28],
    isGstSplits: true
  },
  {
    id: 'us_sales_tax',
    name: 'United States (State Sales Tax)',
    description: 'Flat state & local sales tax per invoice',
    taxLabel: 'Sales Tax',
    defaultRate: 7,
    rates: [0, 4, 6, 7, 8.25, 9.5],
    isGstSplits: false
  },
  {
    id: 'eu_vat',
    name: 'European Union (Value Added Tax)',
    description: 'Standard, reduced and zero-rated VAT compliance',
    taxLabel: 'VAT',
    defaultRate: 20,
    rates: [0, 5, 10, 19, 20, 21],
    isGstSplits: false
  },
  {
    id: 'gulf_vat',
    name: 'GCC / Gulf VAT (UAE, Saudi Arabia)',
    description: '5% / 15% standard tax with Tax Invoice QR compliance',
    taxLabel: 'VAT / الضريبة',
    defaultRate: 15,
    rates: [0, 5, 15],
    isGstSplits: false
  },
  {
    id: 'general_flat',
    name: 'General Flat Tax / Single Rate',
    description: 'Simple customizable flat percentage tax',
    taxLabel: 'Tax',
    defaultRate: 10,
    rates: [0, 5, 10, 15, 20],
    isGstSplits: false
  }
];

export interface CounterLockConfig {
  enabled: boolean;
  pin: string; // 4-6 digit numeric or text PIN
  autoLockMinutes: number; // 0 = disabled, 1, 2, 5, 10, 15, 30
  recoveryEmail: string;
  recoveryPhone: string;
  lastUnlockedTime?: number;
}

export interface AppSettings {
  darkMode: boolean;
  language: SupportedLanguage;
  logoUrl?: string;
  currency: CurrencyConfig;
  taxRegion: TaxRegionConfig;
  autoBackup: {
    enabled: boolean;
    intervalMinutes: number;
    lastBackupTime?: string;
  };
  notifications: {
    soundOnBilling: boolean;
    lowStockAlerts: boolean;
    dailySalesSummary: boolean;
    paymentReminders: boolean;
  };
  defaultPrinter: 'dialog' | 'thermal_80' | 'thermal_58' | 'pdf';
  counterLock: CounterLockConfig;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  darkMode: false,
  language: 'en',
  logoUrl: '',
  currency: CURRENCY_PRESETS[0], // INR default
  taxRegion: TAX_REGION_PRESETS[0], // India GST default
  autoBackup: {
    enabled: true,
    intervalMinutes: 15
  },
  notifications: {
    soundOnBilling: true,
    lowStockAlerts: true,
    dailySalesSummary: false,
    paymentReminders: true
  },
  defaultPrinter: 'dialog',
  counterLock: {
    enabled: false,
    pin: '', // Empty initially: user creates their 6-digit PIN on first setup
    autoLockMinutes: 5,
    recoveryEmail: '',
    recoveryPhone: ''
  }
};

const SETTINGS_KEY = 'pos_unified_app_settings';

export function getSavedAppSettings(userPhone?: string): AppSettings {
  const specificKey = userPhone ? `${SETTINGS_KEY}_${userPhone}` : SETTINGS_KEY;
  let savedThemePreference: boolean | null = null;
  try {
    const rawTheme = localStorage.getItem('theme');
    if (rawTheme === 'dark') savedThemePreference = true;
    else if (rawTheme === 'light') savedThemePreference = false;
  } catch (e) {}

  try {
    const raw = localStorage.getItem(specificKey) || localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const parsedLock = parsed.counterLock || {};
      
      // Sanitize legacy mock values so user's real login credentials are used
      const cleanedPhone = (parsedLock.recoveryPhone && parsedLock.recoveryPhone !== '9876543210') 
        ? parsedLock.recoveryPhone 
        : (userPhone || '');
      const cleanedEmail = (parsedLock.recoveryEmail && parsedLock.recoveryEmail !== 'admin@billsyncpro.com' && parsedLock.recoveryEmail !== 'billing@billsyncpro.com') 
        ? parsedLock.recoveryEmail 
        : '';

      const isDarkMode = savedThemePreference !== null ? savedThemePreference : Boolean(parsed.darkMode);

      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed,
        darkMode: isDarkMode,
        currency: parsed.currency || DEFAULT_APP_SETTINGS.currency,
        taxRegion: parsed.taxRegion || DEFAULT_APP_SETTINGS.taxRegion,
        autoBackup: { ...DEFAULT_APP_SETTINGS.autoBackup, ...(parsed.autoBackup || {}) },
        notifications: { ...DEFAULT_APP_SETTINGS.notifications, ...(parsed.notifications || {}) },
        counterLock: {
          ...DEFAULT_APP_SETTINGS.counterLock,
          ...parsedLock,
          recoveryPhone: cleanedPhone,
          recoveryEmail: cleanedEmail
        }
      };
    }
  } catch (e) {
    console.error('Failed to load app settings:', e);
  }
  return {
    ...DEFAULT_APP_SETTINGS,
    darkMode: savedThemePreference !== null ? savedThemePreference : DEFAULT_APP_SETTINGS.darkMode,
    counterLock: {
      ...DEFAULT_APP_SETTINGS.counterLock,
      recoveryPhone: userPhone || ''
    }
  };
}

export function saveAppSettings(settings: AppSettings, userPhone?: string): void {
  try {
    const serialized = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_KEY, serialized);
    if (userPhone) {
      localStorage.setItem(`${SETTINGS_KEY}_${userPhone}`, serialized);
    }
    // Bind theme state with localStorage ('theme')
    localStorage.setItem('theme', settings.darkMode ? 'dark' : 'light');
    // Apply dark mode immediately to HTML document
    applyDarkModeToDocument(settings.darkMode);
    // Broadcast setting change event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app_settings_updated', { detail: settings }));
    }
  } catch (e) {
    console.error('Failed to save app settings:', e);
  }
}

export function applyDarkModeToDocument(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
    try {
      localStorage.setItem('theme', 'dark');
    } catch (e) {}
  } else {
    root.classList.remove('dark');
    try {
      localStorage.setItem('theme', 'light');
    } catch (e) {}
  }
}

// POS Register Cash Chime via synthesized Web Audio API (100% offline, zero audio files required)
export function playBillingSuccessSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First bell chime note (F5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(698.46, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second cheerful bell chime note (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.00, now + 0.12);
    gain2.gain.setValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);

    // Third sparkling note (C6)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1046.50, now + 0.24);
    gain3.gain.setValueAtTime(0.35, now + 0.24);
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.24);
    osc3.stop(now + 0.85);
  } catch (err) {
    // Audio context might be restricted before user interaction
  }
}
