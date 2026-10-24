import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  Lock, 
  Moon, 
  Sun, 
  Globe2, 
  Printer, 
  Bell, 
  Database, 
  Upload, 
  Trash2, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Smartphone, 
  Mail, 
  Coins, 
  Scale, 
  Volume2, 
  Sliders, 
  Layers, 
  KeyRound, 
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  AppSettings, 
  CURRENCY_PRESETS, 
  TAX_REGION_PRESETS, 
  saveAppSettings, 
  getSavedAppSettings, 
  applyDarkModeToDocument, 
  playBillingSuccessSound 
} from '../utils/appSettings';
import { 
  SUPPORTED_LANGUAGES, 
  SupportedLanguage, 
  saveLanguage, 
  getSavedLanguage, 
  t 
} from '../utils/i18n';
import { Estimate, PrintTemplateConfig, SecondaryPrintStyle } from '../types';
import { getSavedPrintConfig, savePrintConfig } from '../utils/printConfig';
import PrintCustomizer from './PrintCustomizer';

interface SettingsProps {
  businessName: string;
  currentUser: string | null;
  estimates: Estimate[];
  onUpdateBusinessProfile: (newDetails: {
    businessName: string;
    phone?: string;
    email?: string;
    gstin?: string;
    pan?: string;
    address?: string;
    tagline?: string;
    state?: string;
    logoUrl?: string;
    upiId?: string;
    bankName?: string;
    accountNo?: string;
    ifscCode?: string;
    branchName?: string;
  }) => void;
  onLockCounterNow: () => void;
  onShowToast: (msg: string) => void;
  onSyncWithCloud?: () => void;
}

export default function Settings({
  businessName,
  currentUser,
  estimates,
  onUpdateBusinessProfile,
  onLockCounterNow,
  onShowToast,
  onSyncWithCloud
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<
    'profile' | 'security' | 'appearance' | 'language' | 'print' | 'notifications' | 'backup'
  >('profile');

  // Load App Settings
  const [settings, setSettings] = useState<AppSettings>(() => getSavedAppSettings(currentUser || undefined));
  const [printConfig, setPrintConfig] = useState<PrintTemplateConfig>(() => getSavedPrintConfig(businessName, currentUser || undefined));

  // Business profile form fields
  const [bizName, setBizName] = useState(businessName);
  const [bizTagline, setBizTagline] = useState(printConfig.tagline || '');
  const [bizPhone, setBizPhone] = useState(printConfig.phone || currentUser || '');
  const [bizEmail, setBizEmail] = useState(printConfig.email || '');
  const [bizGstin, setBizGstin] = useState(printConfig.gstin || '');
  const [bizPan, setBizPan] = useState(printConfig.pan || '');
  const [bizState, setBizState] = useState(printConfig.state || '07 - Delhi');
  const [bizAddress, setBizAddress] = useState(printConfig.address || '');
  const [logoPreview, setLogoPreview] = useState<string>(printConfig.logoUrl || settings.logoUrl || '');

  // Bank & UPI fields
  const [bankName, setBankName] = useState(printConfig.bankName || '');
  const [accountNo, setAccountNo] = useState(printConfig.accountNo || '');
  const [ifscCode, setIfscCode] = useState(printConfig.ifscCode || '');
  const [branchName, setBranchName] = useState(printConfig.branchName || '');
  const [upiId, setUpiId] = useState(printConfig.upiId || '');

  // Counter Lock Change Password fields
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [pinChangeError, setPinChangeError] = useState('');

  const logoInputRef = useRef<HTMLInputElement>(null);

  // Sync state if currentUser changes
  useEffect(() => {
    const s = getSavedAppSettings(currentUser || undefined);
    setSettings(s);
    const p = getSavedPrintConfig(businessName, currentUser || undefined);
    setPrintConfig(p);
    setLogoPreview(p.logoUrl || s.logoUrl || '');
  }, [businessName, currentUser]);

  // Handle Logo Upload (read as Base64 data URL)
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Logo image should be under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setLogoPreview(result);
        const updatedSettings = { ...settings, logoUrl: result };
        setSettings(updatedSettings);
        saveAppSettings(updatedSettings, currentUser || undefined);

        const updatedPrint = { ...printConfig, logoUrl: result };
        setPrintConfig(updatedPrint);
        savePrintConfig(updatedPrint, currentUser || undefined);

        onUpdateBusinessProfile({ businessName: bizName, logoUrl: result });
        onShowToast('Logo uploaded and applied!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview('');
    const updatedSettings = { ...settings, logoUrl: '' };
    setSettings(updatedSettings);
    saveAppSettings(updatedSettings, currentUser || undefined);

    const updatedPrint = { ...printConfig, logoUrl: '' };
    setPrintConfig(updatedPrint);
    savePrintConfig(updatedPrint, currentUser || undefined);

    onUpdateBusinessProfile({ businessName: bizName, logoUrl: '' });
    onShowToast('Logo removed');
  };

  // Save Business Profile Changes
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedPrint: PrintTemplateConfig = {
      ...printConfig,
      businessName: bizName.trim() || 'BillSync Pro Store',
      tagline: bizTagline.trim(),
      phone: bizPhone.trim(),
      email: bizEmail.trim(),
      gstin: bizGstin.trim(),
      pan: bizPan.trim(),
      state: bizState.trim(),
      address: bizAddress.trim(),
      logoUrl: logoPreview,
      bankName: bankName.trim(),
      accountNo: accountNo.trim(),
      ifscCode: ifscCode.trim(),
      branchName: branchName.trim(),
      upiId: upiId.trim()
    };
    setPrintConfig(updatedPrint);
    savePrintConfig(updatedPrint, currentUser || undefined);

    onUpdateBusinessProfile({
      businessName: bizName.trim() || 'BillSync Pro Store',
      phone: bizPhone.trim(),
      email: bizEmail.trim(),
      gstin: bizGstin.trim(),
      pan: bizPan.trim(),
      address: bizAddress.trim(),
      tagline: bizTagline.trim(),
      state: bizState.trim(),
      logoUrl: logoPreview,
      upiId: upiId.trim(),
      bankName: bankName.trim(),
      accountNo: accountNo.trim(),
      ifscCode: ifscCode.trim(),
      branchName: branchName.trim()
    });

    onShowToast('Business Profile updated successfully!');
  };

  // Toggle Dark Mode
  const handleToggleDarkMode = (enabled: boolean) => {
    const updated = { ...settings, darkMode: enabled };
    setSettings(updated);
    saveAppSettings(updated, currentUser || undefined);
    applyDarkModeToDocument(enabled);
    onShowToast(`Dark mode ${enabled ? 'enabled' : 'disabled'}`);
  };

  // Switch Language
  const handleLanguageSelect = (lang: SupportedLanguage) => {
    const updated = { ...settings, language: lang };
    setSettings(updated);
    saveAppSettings(updated, currentUser || undefined);
    saveLanguage(lang);
    onShowToast(`Language switched to ${SUPPORTED_LANGUAGES.find(l => l.code === lang)?.nativeName}`);
  };

  // Save Counter Lock Config
  const handleSaveLockConfig = (newLockConfig: typeof settings.counterLock) => {
    const updated = { ...settings, counterLock: newLockConfig };
    setSettings(updated);
    saveAppSettings(updated, currentUser || undefined);
    onShowToast('Counter auto-lock preferences saved!');
  };

  // Change PIN handler - enforces 6-digit numeric PIN
  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (settings.counterLock.pin && oldPin !== settings.counterLock.pin) {
      setPinChangeError('Current 6-digit PIN is incorrect.');
      return;
    }
    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      setPinChangeError('PIN must be exactly 6 numeric digits (0-9).');
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinChangeError('New 6-digit PIN and confirmation PIN do not match.');
      return;
    }

    const updatedLock = {
      ...settings.counterLock,
      pin: newPin,
      enabled: true,
      recoveryPhone: settings.counterLock.recoveryPhone || currentUser || ''
    };
    handleSaveLockConfig(updatedLock);
    setOldPin('');
    setNewPin('');
    setConfirmNewPin('');
    setPinChangeError('');
    onShowToast('6-Digit Counter PIN updated successfully!');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-fade-in text-slate-900 dark:text-slate-100">
      {/* Settings Top Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center font-bold text-xl">
            ⚙️
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
              {t('settings.title', undefined, 'Settings')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {t('settings.subtitle', undefined, 'Manage business profile, appearance, language, security, and invoice preferences')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Lock Button */}
          <button
            type="button"
            onClick={onLockCounterNow}
            className="px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            title="Lock Counter Now"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Lock Counter</span>
          </button>

          {/* Quick Dark Mode Pill */}
          <button
            type="button"
            onClick={() => handleToggleDarkMode(!settings.darkMode)}
            className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title={settings.darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {settings.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>

      {/* Settings Navigation Tabs Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 flex flex-wrap gap-1 shadow-xs transition-colors">
        {[
          { id: 'profile', label: 'Business Profile', icon: Building2 },
          { id: 'security', label: 'Counter Auto-Lock', icon: Lock },
          { id: 'appearance', label: 'Dark Mode & Theme', icon: Moon },
          { id: 'language', label: 'Language & Currency', icon: Globe2 },
          { id: 'print', label: 'Print Customizer', icon: Printer },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'backup', label: 'Auto-Backup & Sync', icon: Database },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ----------------- TAB 1: BUSINESS PROFILE & LOGO UPLOAD ----------------- */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Business Details & Store Branding</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">These details appear on your printed invoices, cash memos, and estimates.</p>
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Save Business Profile</span>
            </button>
          </div>

          {/* Logo Upload Box */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-center gap-5">
            <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative">
              {logoPreview ? (
                <img src={logoPreview} alt="Business Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <div className="text-center p-2 text-slate-400 text-[10px] font-bold">
                  <span>No Logo</span>
                </div>
              )}
            </div>

            <div className="space-y-2 text-center sm:text-left flex-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Official Business Logo
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Upload your PNG or JPEG trade logo. It will appear directly at the top of your invoices and cash receipts. Recommended size: 250×250 px (Max 2MB).
              </p>
              <div className="flex flex-wrap gap-2 pt-1 justify-center sm:justify-start">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="px-4 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Upload Logo Image</span>
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="px-3 py-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Business Core Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Business / Store Name *
              </label>
              <input
                type="text"
                required
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="e.g., Sharma Traders"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Business Tagline / Subtitle
              </label>
              <input
                type="text"
                value={bizTagline}
                onChange={(e) => setBizTagline(e.target.value)}
                placeholder="e.g., Wholesale & Retail Superstore"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Primary Phone / Mobile *
              </label>
              <input
                type="text"
                required
                value={bizPhone}
                onChange={(e) => setBizPhone(e.target.value)}
                placeholder="e.g., 9876543210"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Business Email Address
              </label>
              <input
                type="email"
                value={bizEmail}
                onChange={(e) => setBizEmail(e.target.value)}
                placeholder="e.g., billing@sharmatraders.com"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                GSTIN / Tax Registration ID
              </label>
              <input
                type="text"
                value={bizGstin}
                onChange={(e) => setBizGstin(e.target.value.toUpperCase())}
                placeholder="e.g., 07AAAAA0000A1Z5"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                PAN Number
              </label>
              <input
                type="text"
                value={bizPan}
                onChange={(e) => setBizPan(e.target.value.toUpperCase())}
                placeholder="e.g., AAAAA0000A"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white font-mono uppercase"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Full Physical Address / Premises
              </label>
              <input
                type="text"
                value={bizAddress}
                onChange={(e) => setBizAddress(e.target.value)}
                placeholder="Shop No, Market Road, City, PIN Code"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                State & Code
              </label>
              <input
                type="text"
                value={bizState}
                onChange={(e) => setBizState(e.target.value)}
                placeholder="e.g., 07 - Delhi"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-600 dark:focus:border-blue-400 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Bank & Settlement Details */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Bank Account & QR Payment Settlement
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Bank Name</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g., State Bank of India"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Account Number</label>
                <input
                  type="text"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  placeholder="e.g., 349012384910"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">IFSC / Routing Code</label>
                <input
                  type="text"
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  placeholder="e.g., SBIN0001234"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold uppercase outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Branch Name</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g., Main Market Branch"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">UPI ID for Dynamic QR Pay</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g., merchant@upi"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ----------------- TAB 2: RETAIL COUNTER AUTO-LOCK & SECURITY ----------------- */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Retail Counter Auto-Lock & Security Session</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Protect your billing counter, sales registers, and client records when unattended.
              </p>
            </div>

            <button
              type="button"
              onClick={onLockCounterNow}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>Test Lock Counter Now</span>
            </button>
          </div>

          {/* Auto-Lock Inactivity Timer Setting */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Inactivity Auto-Lock Timer
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Automatically lock the counter screen if no mouse, keyboard, or touchscreen input is detected.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.counterLock.enabled}
                  onChange={(e) => {
                    handleSaveLockConfig({
                      ...settings.counterLock,
                      enabled: e.target.checked
                    });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {settings.counterLock.enabled && (
              <div className="pt-2 flex flex-wrap gap-2">
                {[
                  { mins: 1, label: '1 Minute' },
                  { mins: 2, label: '2 Minutes' },
                  { mins: 5, label: '5 Minutes' },
                  { mins: 10, label: '10 Minutes' },
                  { mins: 15, label: '15 Minutes' },
                  { mins: 30, label: '30 Minutes' },
                  { mins: 0, label: 'Manual Lock Only' }
                ].map(opt => (
                  <button
                    key={opt.mins}
                    type="button"
                    onClick={() => {
                      handleSaveLockConfig({
                        ...settings.counterLock,
                        autoLockMinutes: opt.mins
                      });
                    }}
                    className={`py-2 px-3.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      settings.counterLock.autoLockMinutes === opt.mins
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Change or Create 6-Digit PIN Form */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{settings.counterLock.pin ? 'Change 6-Digit Counter PIN' : 'Create 6-Digit Counter PIN'}</span>
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                settings.counterLock.pin ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
              }`}>
                {settings.counterLock.pin ? '6-Digit PIN Configured' : 'No PIN Set'}
              </span>
            </div>

            <form onSubmit={handleChangePinSubmit} className="space-y-3 max-w-md">
              {settings.counterLock.pin ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    Current 6-Digit PIN
                  </label>
                  <input
                    type={showPinInput ? 'text' : 'password'}
                    required
                    maxLength={6}
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter current 6-digit PIN"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    New 6-Digit PIN
                  </label>
                  <input
                    type={showPinInput ? 'text' : 'password'}
                    required
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 digits (e.g. 567890)"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    Confirm 6-Digit PIN
                  </label>
                  <input
                    type={showPinInput ? 'text' : 'password'}
                    required
                    maxLength={6}
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Re-enter 6-digit PIN"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowPinInput(!showPinInput)}
                  className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer font-medium"
                >
                  {showPinInput ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPinInput ? 'Hide PIN characters' : 'Show PIN characters'}</span>
                </button>
              </div>

              {pinChangeError && (
                <div className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{pinChangeError}</span>
                </div>
              )}

              <button
                type="submit"
                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                {settings.counterLock.pin ? 'Update 6-Digit PIN' : 'Save 6-Digit PIN'}
              </button>
            </form>
          </div>

          {/* Recovery Contacts Setup - strictly bound to logged-in user and business profile */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>OTP Recovery Contact Credentials</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              When a cashier forgets their PIN, a 6-digit OTP code is dispatched to your active login number or registered email for instant recovery.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Active Login Mobile Number (Recovery SMS)
                </label>
                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold">
                  <span className="text-slate-400 mr-1">+91</span>
                  <input
                    type="text"
                    value={currentUser || settings.counterLock.recoveryPhone || ''}
                    readOnly
                    className="w-full outline-none bg-transparent text-slate-900 dark:text-white font-mono"
                  />
                  <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold px-2 py-0.5 rounded-md shrink-0">
                    Active Login
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Registered Business / Recovery Email
                </label>
                <input
                  type="email"
                  value={settings.counterLock.recoveryEmail || bizEmail}
                  onChange={(e) => {
                    handleSaveLockConfig({
                      ...settings.counterLock,
                      recoveryEmail: e.target.value
                    });
                  }}
                  placeholder="e.g., owner@yourstore.com"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 3: DARK MODE & APPEARANCE ----------------- */}
      {activeTab === 'appearance' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white">Appearance & Theme Customization</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Personalize color scheme and typography for retail display ergonomics.</p>
          </div>

          {/* Dark Mode Big Toggle Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => handleToggleDarkMode(false)}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                !settings.darkMode
                  ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-600/20'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-black text-sm text-slate-900 dark:text-white block">Light Clean Mode</span>
                    <span className="text-[10px] text-slate-500">Daytime standard billing</span>
                  </div>
                </div>
                {!settings.darkMode && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-inner space-y-1.5 text-[10px]">
                <div className="h-2 w-24 bg-slate-200 rounded"></div>
                <div className="h-2 w-36 bg-blue-600 rounded"></div>
              </div>
            </div>

            <div
              onClick={() => handleToggleDarkMode(true)}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                settings.darkMode
                  ? 'border-blue-500 bg-slate-900 shadow-md ring-2 ring-blue-500/30'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-900/60 text-indigo-300 rounded-xl">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-black text-sm text-slate-900 dark:text-white block">Dark Slate Mode</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Night counter & OLED battery saver</span>
                  </div>
                </div>
                {settings.darkMode && <CheckCircle2 className="w-5 h-5 text-blue-400" />}
              </div>
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 shadow-inner space-y-1.5 text-[10px]">
                <div className="h-2 w-24 bg-slate-700 rounded"></div>
                <div className="h-2 w-36 bg-blue-500 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 4: LANGUAGE & REGIONAL CURRENCY ----------------- */}
      {activeTab === 'language' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Multi-Language & Regional Compliance</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select your preferred operational language and currency format. The entire interface translates instantly.
            </p>
          </div>

          {/* 10 Major Languages Grid */}
          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Select App Language (तत्काल भाषा बदलें)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {SUPPORTED_LANGUAGES.map(lang => {
                const isSelected = settings.language === lang.code;
                return (
                  <div
                    key={lang.code}
                    onClick={() => handleLanguageSelect(lang.code)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-900/30 shadow-sm ring-1 ring-blue-600'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{lang.flag}</span>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    </div>
                    <div>
                      <span className="font-extrabold text-xs block text-slate-900 dark:text-white leading-tight">
                        {lang.nativeName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {lang.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Currency Format */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Currency Symbol & Monetary Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {CURRENCY_PRESETS.map(curr => {
                const isSelected = settings.currency.code === curr.code;
                return (
                  <button
                    key={curr.code}
                    type="button"
                    onClick={() => {
                      const updated = { ...settings, currency: curr };
                      setSettings(updated);
                      saveAppSettings(updated, currentUser || undefined);
                      onShowToast(`Currency updated to ${curr.name}`);
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-black shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <span className="text-base font-black font-mono block">{curr.symbol}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{curr.name}</span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tax Region Setup */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Regional Tax Structure & Invoicing Compliance
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TAX_REGION_PRESETS.map(tax => {
                const isSelected = settings.taxRegion.id === tax.id;
                return (
                  <div
                    key={tax.id}
                    onClick={() => {
                      const updated = { ...settings, taxRegion: tax };
                      setSettings(updated);
                      saveAppSettings(updated, currentUser || undefined);
                      onShowToast(`Tax compliance set to ${tax.name}`);
                    }}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs text-slate-900 dark:text-white">{tax.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 leading-snug">{tax.description}</p>
                    <div className="flex gap-1 flex-wrap">
                      {tax.rates.map(r => (
                        <span key={r} className="text-[9px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                          {r}%
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 5: PRINT CUSTOMIZER & INVOICE TEMPLATES ----------------- */}
      {activeTab === 'print' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Default Printer & Invoice Template Customizer</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Customize invoice templates (Classic GST, Compact Retail, Stylish Premium, Thermal POS) and set default print actions.
            </p>
          </div>

          {/* Default Printer Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              1-Click Save & Print Action Destination
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {[
                { id: 'dialog', name: 'Browser Print Dialog', desc: 'Standard A4 / A5 Laser or Inkjet' },
                { id: 'thermal_80', name: 'Thermal 80mm Roll', desc: 'High-speed POS roll printer' },
                { id: 'thermal_58', name: 'Thermal 58mm Roll', desc: 'Compact portable receipt printer' },
                { id: 'pdf', name: 'Download PDF', desc: 'Instant clean PDF export file' }
              ].map(printer => {
                const isSelected = settings.defaultPrinter === printer.id;
                return (
                  <button
                    key={printer.id}
                    type="button"
                    onClick={() => {
                      const updated = { ...settings, defaultPrinter: printer.id as any };
                      setSettings(updated);
                      saveAppSettings(updated, currentUser || undefined);
                      onShowToast(`Default printer set to ${printer.name}`);
                    }}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 font-extrabold shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">{printer.name}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{printer.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Embedded Print Customizer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <PrintCustomizer
              businessName={businessName}
              estimates={estimates}
              currentUser={currentUser}
            />
          </div>
        </div>
      )}

      {/* ----------------- TAB 6: NOTIFICATIONS PREFERENCES ----------------- */}
      {activeTab === 'notifications' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Counter Sound & Alert Preferences</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure POS audio feedback, inventory alerts, and reminder banners.</p>
          </div>

          <div className="space-y-4 max-w-xl">
            {/* Sound on Billing */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white block flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Cash Register Chime on Save & Print</span>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Plays a cheerful POS bell chime when an invoice is successfully settled.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playBillingSuccessSound()}
                  className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Test Chime
                </button>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notifications.soundOnBilling}
                    onChange={(e) => {
                      const updated = {
                        ...settings,
                        notifications: { ...settings.notifications, soundOnBilling: e.target.checked }
                      };
                      setSettings(updated);
                      saveAppSettings(updated, currentUser || undefined);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white block">
                  Low Stock Inventory Warnings
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Highlight items in red when available stock drops to 5 units or below.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifications.lowStockAlerts}
                  onChange={(e) => {
                    const updated = {
                      ...settings,
                      notifications: { ...settings.notifications, lowStockAlerts: e.target.checked }
                    };
                    setSettings(updated);
                    saveAppSettings(updated, currentUser || undefined);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Payment Reminders */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white block">
                  Customer Balance Due Reminders
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Display outstanding credit balance alerts automatically when selecting a customer for billing.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifications.paymentReminders}
                  onChange={(e) => {
                    const updated = {
                      ...settings,
                      notifications: { ...settings.notifications, paymentReminders: e.target.checked }
                    };
                    setSettings(updated);
                    saveAppSettings(updated, currentUser || undefined);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 7: AUTO-BACKUP & SYNC ----------------- */}
      {activeTab === 'backup' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Auto-Backup & Cloud Sync Engine</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keep offline local storage and online Firebase Firestore continuously synchronized.
              </p>
            </div>

            {onSyncWithCloud && (
              <button
                type="button"
                onClick={onSyncWithCloud}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Sync with Cloud Now</span>
              </button>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4 max-w-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Automatic Background Cloud Sync
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Silently backs up all invoices, products, and customer ledgers to Firebase Firestore.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoBackup.enabled}
                  onChange={(e) => {
                    const updated = {
                      ...settings,
                      autoBackup: { ...settings.autoBackup, enabled: e.target.checked }
                    };
                    setSettings(updated);
                    saveAppSettings(updated, currentUser || undefined);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {settings.autoBackup.enabled && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  Backup Interval:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[5, 15, 30, 60].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        const updated = {
                          ...settings,
                          autoBackup: { ...settings.autoBackup, intervalMinutes: mins }
                        };
                        setSettings(updated);
                        saveAppSettings(updated, currentUser || undefined);
                        onShowToast(`Auto-backup interval set to ${mins} mins`);
                      }}
                      className={`py-1.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        settings.autoBackup.intervalMinutes === mins
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Every {mins} Mins
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
