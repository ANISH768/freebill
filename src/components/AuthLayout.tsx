import React, { useState, FormEvent, useEffect } from 'react';
import { User, OtpAuditLogEntry } from '../types';
import {
  KeyRound,
  Phone,
  Store,
  CheckCircle,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  LogIn,
  Clock,
  MessageSquare,
  ExternalLink,
  FileText,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Printer,
  ShieldCheck,
  Upload,
  Palette,
  Sparkles,
  Lock,
  UserCheck,
  Briefcase,
  Mail,
  Loader2,
} from 'lucide-react';
import { recordOtpAuditLog, getOtpAuditLogs, clearOtpAuditLogs } from '../utils/otpAuditLogger';
import { recordSystemAudit } from '../utils/systemAuditLogger';
import { useCloudAuth } from '../context/CloudAuthContext';

function GoogleLogoSvg({ className = 'w-[18px] h-[18px] shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

interface AuthLayoutProps {
  onLoginSuccess: (
    phone: string,
    businessName: string,
    role: 'admin' | 'clerk',
    password?: string
  ) => void;
  dbUsers: User[];
  onUpdateUsers: (newUsers: User[]) => void;
}

const INDIAN_STATES = [
  '27-Maharashtra',
  '07-Delhi',
  '09-Uttar Pradesh',
  '24-Gujarat',
  '29-Karnataka',
  '33-Tamil Nadu',
  '19-West Bengal',
  '08-Rajasthan',
  '23-Madhya Pradesh',
  '10-Bihar',
  '36-Telangana',
  '03-Punjab',
  '06-Haryana',
  '32-Kerala',
  '21-Odisha',
];

const BUSINESS_TYPES = [
  'Kirana / General Store',
  'Medical / Pharmacy',
  'Hardware & Sanitary',
  'Garment & Textiles',
  'Mobile & Electronics',
  'Wholesale / Distributor',
];

const ACCENT_COLORS = [
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Slate', hex: '#0f172a' },
];

export default function AuthLayout({
  onLoginSuccess,
  dbUsers,
  onUpdateUsers,
}: AuthLayoutProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');

  // Login Form States
  const [loginPhone, setLoginPhone] = useState(() => {
    try {
      return localStorage.getItem('remembered_login_phone') || '';
    } catch {
      return '';
    }
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<'admin' | 'clerk'>('admin');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Google Sign-In & Registration States
  const { signInWithGoogle, isSigningIn: isGoogleBusy, authError: googleAuthError } = useCloudAuth();
  const [googleRegisterProfile, setGoogleRegisterProfile] = useState<{
    email: string;
    displayName: string;
  } | null>(null);
  const [googleUnregisteredEmail, setGoogleUnregisteredEmail] = useState<string | null>(null);
  const [googleQuickPassword, setGoogleQuickPassword] = useState('');
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  // 3-Step Registration Wizard States
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [regPhone, setRegPhone] = useState('');
  const [regBusiness, setRegBusiness] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regBusinessType, setRegBusinessType] = useState(BUSINESS_TYPES[0]);
  const [regGstin, setRegGstin] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regState, setRegState] = useState(INDIAN_STATES[0]);
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regClerkPassword, setRegClerkPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Step 2: Branding States
  const [regLogoBase64, setRegLogoBase64] = useState<string>('');
  const [regInvoicePrefix, setRegInvoicePrefix] = useState('BSP/2026-27/');
  const [regAccentColor, setRegAccentColor] = useState('#4f46e5');
  const [regSecurityQuestion, setRegSecurityQuestion] = useState('What is your first shop city or pet name?');
  const [regSecurityAnswer, setRegSecurityAnswer] = useState('');

  // Step 3: Confirmation & Mandatory Backup States
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState('');
  const [hasDownloadedMandatoryBackup, setHasDownloadedMandatoryBackup] = useState(false);
  const [createdUserRecord, setCreatedUserRecord] = useState<User | null>(null);

  // Offline Password Reset States
  const [resetPhone, setResetPhone] = useState('');
  const [resetSecretInput, setResetSecretInput] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetRoleTarget, setResetRoleTarget] = useState<'admin' | 'clerk'>('admin');

  // Optional Carrier OTP Verification Drawer (for users who want SMS/WhatsApp OTP check)
  const [useCarrierOtp, setUseCarrierOtp] = useState(false);
  const [regOtp, setRegOtp] = useState('');
  const [sentOtp, setSentOtp] = useState<string | null>(null);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState<number>(0);
  const [otpVerificationState, setOtpVerificationState] = useState<
    'idle' | 'verifying' | 'success' | 'failure'
  >('idle');
  const [otpVerifyFeedback, setOtpVerifyFeedback] = useState<string | null>(null);
  const [trialRestrictionInfo, setTrialRestrictionInfo] = useState<{
    isRestricted: boolean;
    directDispatchUrl: string;
    sandboxJoinUrl: string;
    diagnosticReason: string;
  } | null>(null);

  // Hidden 'audit_logs' security troubleshooting viewer state
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogsList, setAuditLogsList] = useState<OtpAuditLogEntry[]>([]);

  // Alerts
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshAuditLogs = async () => {
    const logs = await getOtpAuditLogs();
    setAuditLogsList(logs);
  };

  // Sync registered users from server if online (silent fallback if offline)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          onUpdateUsers(data);
        }
      })
      .catch(() => {
        // Offline mode: local IndexedDB/localStorage users are authoritative
      });
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (otpCountdown > 0) {
      timer = setTimeout(() => setOtpCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCountdown]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024 * 2) {
      setError('Logo image must be under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRegLogoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Optional Carrier OTP send
  const handleSendOtp = async () => {
    setError(null);
    setOtpSentMessage(null);
    setSuccess(null);
    setOtpVerificationState('idle');
    setOtpVerifyFeedback(null);

    if (regPhone.length !== 10 || isNaN(Number(regPhone))) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'OTP_DISPATCH',
        channel: otpChannel,
        phone: regPhone,
        provider: 'Client Validator',
        diagnosticCode: 'INVALID_PHONE',
        reason: 'Invalid 10-digit mobile number entered during registration.',
      });
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'OTP_DISPATCH',
        channel: otpChannel,
        phone: regPhone,
        provider: 'Network Check',
        diagnosticCode: 'NETWORK_OFFLINE',
        reason: 'Device offline during OTP dispatch attempt.',
      });
      setError('Device is offline. Use Instant Offline Setup or connect to the internet for SMS OTP.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: regPhone.trim(), channel: otpChannel }),
      });

      const data = await response.json();
      if (response.ok) {
        setSentOtp(otpChannel);
        setRegOtp('');
        const masked = `+91 ${regPhone.slice(0, 2)}XXX XX${regPhone.slice(-3)}`;
        const statusMsg =
          data.message ||
          (otpChannel === 'whatsapp'
            ? `OTP sent to WhatsApp ${masked}`
            : `OTP sent to mobile ${masked}`);
        setOtpSentMessage(statusMsg);
        setSuccess(statusMsg);
        setOtpCountdown(30);

        const isTrialRestricted = Boolean(data.trialRestriction || !data.carrierDelivered);
        setTrialRestrictionInfo({
          isRestricted: isTrialRestricted,
          directDispatchUrl:
            data.directDispatchUrl || `/api/auth/whatsapp-direct-dispatch?phone=${regPhone.trim()}`,
          sandboxJoinUrl:
            data.sandboxJoinUrl || 'https://api.whatsapp.com/send?phone=14155238886&text=join',
          diagnosticReason: data.diagnosticReason || '',
        });

        await recordOtpAuditLog({
          status: data.carrierDelivered ? 'success' : 'failure',
          attemptType: 'OTP_DISPATCH',
          channel: otpChannel,
          phone: regPhone.trim(),
          provider: data.provider || 'Carrier Gateway',
          diagnosticCode: data.diagnosticCode || (data.carrierDelivered ? 'DELIVERED' : 'TRIAL_RESTRICTION'),
          reason: data.diagnosticReason || 'OTP dispatch processed.',
        });
        if (showAuditLogs) refreshAuditLogs();
      } else {
        setError(data.error || 'Failed to send OTP.');
      }
    } catch {
      setError('Offline mode active: Carrier OTP unavailable. Proceed with Offline Wizard.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtpStep = async () => {
    if (regOtp.trim().length !== 6) {
      setOtpVerificationState('failure');
      setOtpVerifyFeedback('Please enter the 6-digit OTP.');
      return;
    }
    setOtpVerificationState('verifying');
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: regPhone.trim(),
          otp: regOtp.trim(),
          channel: otpChannel,
        }),
      });
      const data = await response.json();
      if (response.ok && data.verified) {
        setOtpVerificationState('success');
        setOtpVerifyFeedback('Mobile number verified!');
      } else {
        setOtpVerificationState('failure');
        setOtpVerifyFeedback(data.error || 'Incorrect OTP code.');
      }
    } catch {
      setOtpVerificationState('failure');
      setOtpVerifyFeedback('Could not reach OTP server.');
    }
  };

  // Wizard Step 1 -> Step 2 validation
  const handleStep1Next = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (regPhone.trim().length !== 10 || isNaN(Number(regPhone.trim()))) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!regBusiness.trim()) {
      setError('Please enter your Business / Shop Name.');
      return;
    }
    if (regPassword.length < 4) {
      setError('Owner password must be at least 4 characters.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Owner password and confirm password do not match.');
      return;
    }

    // Generate default prefix from business initials
    const initials =
      regBusiness
        .trim()
        .split(/\s+/)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 4) || 'BSP';
    setRegInvoicePrefix(`${initials}/2026-27/`);
    setWizardStep(2);
  };

  // Wizard Step 2 -> Step 3 (Finalize local account & generate Recovery Code)
  const handleStep2Complete = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const recoveryCode = `BSP-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    setGeneratedRecoveryCode(recoveryCode);

    const newUser: User = {
      phone: regPhone.trim(),
      password: regPassword.trim(),
      businessName: regBusiness.trim(),
      ownerName: regOwnerName.trim() || 'Shop Owner',
      email: googleRegisterProfile?.email || undefined,
      businessType: regBusinessType,
      gstin: regGstin.trim().toUpperCase(),
      address: regAddress.trim(),
      state: regState,
      clerkPassword: regClerkPassword.trim() || 'clerk123',
      invoicePrefix: regInvoicePrefix.trim() || 'BSP/2026-27/',
      accentColor: regAccentColor,
      logoUrl: regLogoBase64 || undefined,
      recoveryCode,
      securityQuestion: regSecurityQuestion,
      securityAnswer: regSecurityAnswer.trim().toLowerCase() || 'india',
    };

    const updatedUsers = [...dbUsers.filter((u) => u.phone !== newUser.phone), newUser];
    onUpdateUsers(updatedUsers);
    setCreatedUserRecord(newUser);

    try {
      localStorage.setItem(`newly_registered_${newUser.phone}`, 'true');
      localStorage.setItem(`pos_invoice_prefix_${newUser.phone}`, newUser.invoicePrefix || 'BSP/2026-27/');
      localStorage.setItem('pos_invoice_prefix', newUser.invoicePrefix || 'BSP/2026-27/');
      if (newUser.gstin) {
        localStorage.setItem(`user_gstin_${newUser.phone}`, newUser.gstin);
      }
      if (newUser.logoUrl) {
        localStorage.setItem(`user_logo_${newUser.phone}`, newUser.logoUrl);
      }
      // Update print template config with new branding
      const rawPrint = localStorage.getItem('pos_print_template_config');
      const existingPrint = rawPrint ? JSON.parse(rawPrint) : {};
      localStorage.setItem(
        'pos_print_template_config',
        JSON.stringify({
          ...existingPrint,
          businessName: newUser.businessName,
          phone: newUser.phone,
          gstin: newUser.gstin || existingPrint.gstin || '',
          address: newUser.address || existingPrint.address || '',
          state: newUser.state || existingPrint.state || '27-Maharashtra',
          logoUrl: newUser.logoUrl || existingPrint.logoUrl || '',
          primaryColor: newUser.accentColor || '#4f46e5',
        })
      );
    } catch {
      // Ignore storage quota issues
    }

    // Best-effort sync to local Express server if online
    if (typeof navigator === 'undefined' || navigator.onLine) {
      fetch('/api/auth/register-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      }).catch(() => {});
    }

    await recordSystemAudit({
      action: 'SETTINGS_CHANGED',
      details: `Registered new business "${newUser.businessName}" (+91 ${newUser.phone}) with offline recovery code.`,
      userId: newUser.phone,
      userName: newUser.businessName,
      userRole: 'admin',
      userPhone: newUser.phone,
    });

    setWizardStep(3);
  };

  // Mandatory Step 3 Backup Download
  const handleDownloadInitialBackup = () => {
    if (!createdUserRecord) return;
    const demoClients = [
      {
        id: 1,
        name: 'Walk-in Cash Customer',
        phone: '9999999999',
        gstin: '',
        address: createdUserRecord.address || 'Local Counter',
        stateCode: createdUserRecord.state || '27-Maharashtra',
      },
      {
        id: 2,
        name: 'Sharma General Traders',
        phone: '9876543210',
        gstin: '27AABCS1429B1Z1',
        address: 'Main Market Road, Near Bus Stand',
        stateCode: createdUserRecord.state || '27-Maharashtra',
      },
      {
        id: 3,
        name: 'Patel Medical & Provision',
        phone: '9820112233',
        gstin: '',
        address: 'Station Road, Sector 4',
        stateCode: createdUserRecord.state || '27-Maharashtra',
      },
    ];

    const demoProducts = [
      {
        id: 101,
        sku: 'ITEM-001',
        name: 'Aashirvaad Shudh Chakki Atta 5kg',
        unit: 'pcs',
        stock: 40,
        mrp: 265,
        price: 245,
        purchasePrice: 215,
        gstRate: 5,
        minStock: 10,
        hsn: '1101',
      },
      {
        id: 102,
        sku: 'ITEM-002',
        name: 'Fortune Sunlite Refined Oil 1L',
        unit: 'litre',
        stock: 60,
        mrp: 155,
        price: 142,
        purchasePrice: 128,
        gstRate: 5,
        minStock: 12,
        hsn: '1512',
      },
      {
        id: 103,
        sku: 'ITEM-003',
        name: 'Tata Tea Gold 500g Pack',
        unit: 'pcs',
        stock: 35,
        mrp: 310,
        price: 290,
        purchasePrice: 255,
        gstRate: 5,
        minStock: 8,
        hsn: '0902',
      },
      {
        id: 104,
        sku: 'ITEM-004',
        name: 'Parle-G Gold Biscuits Family Pack',
        unit: 'pcs',
        stock: 80,
        mrp: 100,
        price: 92,
        purchasePrice: 78,
        gstRate: 18,
        minStock: 15,
        hsn: '1905',
      },
      {
        id: 105,
        sku: 'ITEM-005',
        name: 'Surf Excel Easy Wash 1.5kg',
        unit: 'kg',
        stock: 25,
        mrp: 220,
        price: 205,
        purchasePrice: 175,
        gstRate: 18,
        minStock: 6,
        hsn: '3402',
      },
    ];

    const backupBundle = {
      version: '2.0.0-offline',
      exportedAt: new Date().toISOString(),
      businessProfile: createdUserRecord,
      recoveryCode: generatedRecoveryCode,
      clients: demoClients,
      products: demoProducts,
      estimates: [],
    };

    const blob = new Blob([JSON.stringify(backupBundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${createdUserRecord.businessName.replace(/\s+/g, '_')}_Master_Setup_Backup_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    try {
      localStorage.setItem('pos_last_backup_timestamp', String(Date.now()));
    } catch {
      // Ignore
    }

    setHasDownloadedMandatoryBackup(true);
    recordSystemAudit({
      action: 'BACKUP_EXPORTED',
      details: `Mandatory initial setup backup downloaded for ${createdUserRecord.businessName}.`,
      userId: createdUserRecord.phone,
      userName: createdUserRecord.businessName,
      userRole: 'admin',
      userPhone: createdUserRecord.phone,
    });
  };

  // Login Handler (100% Offline-Capable)
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedPhone = loginPhone.replace(/\D/g, '').trim();
    const trimmedPassword = loginPassword.trim();

    if (trimmedPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!trimmedPassword) {
      setError(
        loginRole === 'clerk'
          ? 'Please enter your Clerk PIN / Password.'
          : 'Please enter your Owner Password.'
      );
      return;
    }

    setIsLoggingIn(true);

    try {
      if (rememberDevice) {
        localStorage.setItem('remembered_login_phone', trimmedPhone);
      } else {
        localStorage.removeItem('remembered_login_phone');
      }
    } catch {
      // Ignore
    }

    // 1. Check local IndexedDB / localStorage users first for instant offline response
    const localUser = dbUsers.find((u) => u.phone.trim() === trimmedPhone);
    if (localUser) {
      const expectedPassword =
        loginRole === 'clerk'
          ? localUser.clerkPassword || 'clerk123'
          : localUser.password;

      if (expectedPassword?.trim() === trimmedPassword) {
        await recordSystemAudit({
          action: 'LOGIN',
          details: `${loginRole === 'admin' ? 'Owner / Admin' : 'Billing Clerk'} logged in locally (+91 ${trimmedPhone}).`,
          userId: trimmedPhone,
          userName: localUser.businessName,
          userRole: loginRole,
          userPhone: trimmedPhone,
        });
        setIsLoggingIn(false);
        onLoginSuccess(trimmedPhone, localUser.businessName, loginRole, trimmedPassword);
        return;
      }
    }

    // 2. If online, check local server fallback
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: trimmedPhone,
          password: trimmedPassword,
          role: loginRole,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const syncedUser: User = {
            phone: trimmedPhone,
            password: loginRole === 'admin' ? trimmedPassword : localUser?.password || 'admin123',
            clerkPassword: loginRole === 'clerk' ? trimmedPassword : localUser?.clerkPassword || 'clerk123',
            businessName: data.user.businessName,
          };
          const updated = [...dbUsers.filter((u) => u.phone !== trimmedPhone), syncedUser];
          onUpdateUsers(updated);

          await recordSystemAudit({
            action: 'LOGIN',
            details: `${loginRole === 'admin' ? 'Owner / Admin' : 'Billing Clerk'} logged in (+91 ${trimmedPhone}).`,
            userId: trimmedPhone,
            userName: data.user.businessName,
            userRole: loginRole,
            userPhone: trimmedPhone,
          });
          setIsLoggingIn(false);
          onLoginSuccess(data.user.phone, data.user.businessName, loginRole, trimmedPassword);
          return;
        }
      }
    } catch {
      // Offline — already checked localUser above
    }

    await recordSystemAudit({
      action: 'FAILED_LOGIN',
      details: `Failed ${loginRole.toUpperCase()} login attempt for mobile +91 ${trimmedPhone}.`,
      userId: trimmedPhone,
      userName: localUser?.businessName || 'Unknown Account',
      userRole: loginRole,
      userPhone: trimmedPhone,
    });

    setIsLoggingIn(false);
    setError(
      localUser
        ? `Incorrect ${loginRole === 'clerk' ? 'Clerk PIN' : 'Owner Password'} for +91 ${trimmedPhone}.`
        : `No business found on this device for +91 ${trimmedPhone}. Click "Register New Business" below.`
    );
  };

  // Google Sign-In on Login Tab (logs into existing linked account)
  const handleGoogleLogin = async () => {
    setError(null);
    setSuccess(null);
    setGoogleUnregisteredEmail(null);

    const outcome = await signInWithGoogle();
    if (!outcome?.user?.email) {
      if (googleAuthError) {
        setError(googleAuthError);
      }
      return;
    }

    const googleEmail = outcome.user.email.trim().toLowerCase();
    const displayName = outcome.user.displayName?.trim() || '';

    // 1. Check local dbUsers for matching email
    let matchedUser = dbUsers.find(
      (u) => u.email && u.email.trim().toLowerCase() === googleEmail
    );

    // 2. Fallback check against /api/users if online
    if (!matchedUser && (typeof navigator === 'undefined' || navigator.onLine)) {
      try {
        const res = await fetch('/api/users');
        if (res.ok) {
          const serverUsers: User[] = await res.json();
          if (Array.isArray(serverUsers)) {
            matchedUser = serverUsers.find(
              (u) => u.email && u.email.trim().toLowerCase() === googleEmail
            );
            if (matchedUser) {
              const merged = [
                ...dbUsers.filter((u) => u.phone !== matchedUser!.phone),
                matchedUser,
              ];
              onUpdateUsers(merged);
            }
          }
        }
      } catch {
        // Ignore offline fallback failure
      }
    }

    if (matchedUser) {
      try {
        if (rememberDevice) {
          localStorage.setItem('remembered_login_phone', matchedUser.phone);
        }
      } catch {
        // Ignore storage errors
      }
      await recordSystemAudit({
        action: 'LOGIN',
        details: `${loginRole === 'admin' ? 'Owner / Admin' : 'Billing Clerk'} signed in with Google (${googleEmail}).`,
        userId: matchedUser.phone,
        userName: matchedUser.businessName,
        userRole: loginRole,
        userPhone: matchedUser.phone,
      });
      const resolvedPassword =
        loginRole === 'clerk'
          ? matchedUser.clerkPassword || 'clerk123'
          : matchedUser.password;
      onLoginSuccess(matchedUser.phone, matchedUser.businessName, loginRole, resolvedPassword);
      return;
    }

    // Account not registered yet — pre-fill Register tab profile and prompt switch
    setGoogleRegisterProfile({ email: outcome.user.email, displayName });
    if (displayName && !regOwnerName) {
      setRegOwnerName(displayName);
    }
    setGoogleUnregisteredEmail(outcome.user.email);
  };

  // Google Sign-Up trigger on New Account (Register) Tab
  const handleGoogleRegisterStart = async () => {
    setError(null);
    setSuccess(null);
    setGoogleUnregisteredEmail(null);

    const outcome = await signInWithGoogle();
    if (!outcome?.user?.email) {
      if (googleAuthError) {
        setError(googleAuthError);
      }
      return;
    }

    const googleEmail = outcome.user.email.trim().toLowerCase();
    const existingByEmail = dbUsers.find(
      (u) => u.email && u.email.trim().toLowerCase() === googleEmail
    );
    if (existingByEmail) {
      setSuccess(`Welcome back! Found existing shop "${existingByEmail.businessName}" linked to ${outcome.user.email}. Signing you in...`);
      setTimeout(() => {
        onLoginSuccess(existingByEmail.phone, existingByEmail.businessName, 'admin', existingByEmail.password);
      }, 600);
      return;
    }

    setGoogleRegisterProfile({
      email: outcome.user.email,
      displayName: outcome.user.displayName?.trim() || '',
    });
    if (outcome.user.displayName) {
      setRegOwnerName(outcome.user.displayName.trim());
    }
    setSuccess(`Google account verified (${outcome.user.email}). Enter your Shop Name and Mobile Number to finish setup.`);
  };

  // Complete Quick Registration after Google Sign-In on New Account Tab
  const handleGoogleQuickRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!googleRegisterProfile) return;

    const cleanBusiness = regBusiness.trim();
    const cleanPhone = regPhone.replace(/\D/g, '').trim();
    const cleanOwner = regOwnerName.trim() || googleRegisterProfile.displayName || 'Shop Owner';
    const cleanPassword = googleQuickPassword.trim() || `g${cleanPhone.slice(-6)}`;

    if (!cleanBusiness) {
      setError('Please enter your Business / Shop Name.');
      return;
    }
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (googleQuickPassword.trim() && googleQuickPassword.trim().length < 4) {
      setError('Counter password must be at least 4 characters (or leave blank to auto-generate).');
      return;
    }

    const existingPhoneUser = dbUsers.find((u) => u.phone.trim() === cleanPhone);
    if (existingPhoneUser) {
      setError(`An account with mobile +91 ${cleanPhone} already exists. Please sign in on the Login tab.`);
      return;
    }

    setIsGoogleSubmitting(true);
    try {
      const recoveryCode = `BSP-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;
      const initials =
        cleanBusiness
          .split(/\s+/)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('')
          .slice(0, 4) || 'BSP';
      const defaultPrefix = `${initials}/2026-27/`;

      const newUser: User = {
        phone: cleanPhone,
        password: cleanPassword,
        businessName: cleanBusiness,
        ownerName: cleanOwner,
        email: googleRegisterProfile.email,
        businessType: regBusinessType,
        gstin: regGstin.trim().toUpperCase(),
        address: regAddress.trim(),
        state: regState,
        clerkPassword: 'clerk123',
        invoicePrefix: defaultPrefix,
        accentColor: regAccentColor,
        recoveryCode,
        securityQuestion: regSecurityQuestion,
        securityAnswer: 'india',
      };

      const updatedUsers = [...dbUsers.filter((u) => u.phone !== cleanPhone), newUser];
      onUpdateUsers(updatedUsers);

      try {
        localStorage.setItem('remembered_login_phone', cleanPhone);
        localStorage.setItem(`newly_registered_${cleanPhone}`, 'true');
        localStorage.setItem(`pos_invoice_prefix_${cleanPhone}`, defaultPrefix);
        localStorage.setItem('pos_invoice_prefix', defaultPrefix);
        const rawPrint = localStorage.getItem('pos_print_template_config');
        const existingPrint = rawPrint ? JSON.parse(rawPrint) : {};
        localStorage.setItem(
          'pos_print_template_config',
          JSON.stringify({
            ...existingPrint,
            businessName: newUser.businessName,
            phone: newUser.phone,
            state: newUser.state || existingPrint.state || '27-Maharashtra',
            primaryColor: newUser.accentColor || '#4f46e5',
          })
        );
      } catch {
        // Ignore storage quota issues
      }

      if (typeof navigator === 'undefined' || navigator.onLine) {
        fetch('/api/auth/register-offline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser),
        }).catch(() => {});
      }

      await recordSystemAudit({
        action: 'SETTINGS_CHANGED',
        details: `Registered new business "${newUser.businessName}" (+91 ${newUser.phone}) with Google account (${googleRegisterProfile.email}).`,
        userId: newUser.phone,
        userName: newUser.businessName,
        userRole: 'admin',
        userPhone: newUser.phone,
      });

      onLoginSuccess(newUser.phone, newUser.businessName, 'admin', newUser.password);
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  // Offline Password / PIN Reset Handler
  const handleOfflinePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanPhone = resetPhone.replace(/\D/g, '').trim();
    if (cleanPhone.length !== 10) {
      setError('Enter your registered 10-digit mobile number.');
      return;
    }
    if (resetNewPassword.trim().length < 4) {
      setError('New password/PIN must be at least 4 characters.');
      return;
    }

    const targetUser = dbUsers.find((u) => u.phone.trim() === cleanPhone);
    if (!targetUser) {
      setError('No registered business found for this mobile number on this device.');
      return;
    }

    const inputClean = resetSecretInput.trim();
    const matchesRecovery =
      targetUser.recoveryCode &&
      targetUser.recoveryCode.toLowerCase() === inputClean.toLowerCase();
    const matchesAnswer =
      targetUser.securityAnswer &&
      targetUser.securityAnswer.toLowerCase() === inputClean.toLowerCase();
    // Fallback for legacy accounts created before recovery code: match business name
    const matchesBusinessFallback =
      !targetUser.recoveryCode &&
      !targetUser.securityAnswer &&
      targetUser.businessName.toLowerCase() === inputClean.toLowerCase();

    if (!matchesRecovery && !matchesAnswer && !matchesBusinessFallback) {
      await recordSystemAudit({
        action: 'FAILED_LOGIN',
        details: `Failed offline password reset verification for +91 ${cleanPhone}.`,
        userId: cleanPhone,
        userName: targetUser.businessName,
        userRole: resetRoleTarget,
        userPhone: cleanPhone,
      });
      setError(
        'Invalid Recovery Code or Security Answer. Please check your setup sheet.'
      );
      return;
    }

    const updatedUser: User = {
      ...targetUser,
      password:
        resetRoleTarget === 'admin' ? resetNewPassword.trim() : targetUser.password,
      clerkPassword:
        resetRoleTarget === 'clerk'
          ? resetNewPassword.trim()
          : targetUser.clerkPassword,
    };

    const nextUsers = [
      ...dbUsers.filter((u) => u.phone.trim() !== cleanPhone),
      updatedUser,
    ];
    onUpdateUsers(nextUsers);

    await recordSystemAudit({
      action: 'PASSWORD_RESET',
      details: `Offline ${resetRoleTarget.toUpperCase()} password/PIN reset completed for +91 ${cleanPhone}.`,
      userId: cleanPhone,
      userName: targetUser.businessName,
      userRole: resetRoleTarget,
      userPhone: cleanPhone,
    });

    setSuccess(
      `${
        resetRoleTarget === 'admin' ? 'Owner Password' : 'Clerk PIN'
      } reset successfully! You can now log in.`
    );
    setTimeout(() => {
      setMode('login');
      setLoginPhone(cleanPhone);
      setLoginRole(resetRoleTarget);
      setSuccess(null);
    }, 1500);
  };

  return (
    <div
      id="auth-layout"
      className="min-h-screen flex items-center justify-center bg-[#030712] bg-gradient-to-tr from-[#030712] via-[#0f172a] to-[#1e1b4b] p-3 sm:p-6 select-none"
    >
      <div className="bg-white rounded-3xl shadow-[0_12px_45px_rgba(0,0,0,0.45)] w-full max-w-lg p-5 sm:p-8 border border-slate-200/80 relative overflow-hidden transition-all">
        {/* Top Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-600/30 mb-3">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            BillSync Pro
          </h1>
          <p className="text-xs sm:text-sm text-indigo-600 font-extrabold mt-1">
            Offline Billing. Zero Internet. Zero Data Loss.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-black uppercase tracking-wider text-emerald-700">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>100% Local IndexedDB • Kirana, Medical, Hardware, Garment & Mobile POS</span>
          </div>
        </div>

        {/* Clear Login / New Account Segmented Switcher */}
        {mode !== 'reset' && (
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl mb-5 border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccess(null);
                setGoogleUnregisteredEmail(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/70'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>Login</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setWizardStep(1);
                setError(null);
                setSuccess(null);
                setGoogleUnregisteredEmail(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/70'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>New Account</span>
            </button>
          </div>
        )}

        {/* Error & Success Alerts */}
        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-xl flex items-start gap-2 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-bold leading-relaxed">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 p-3 rounded-xl flex items-start gap-2 text-xs">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-bold leading-relaxed">{success}</span>
          </div>
        )}

        {googleUnregisteredEmail && mode === 'login' && (
          <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 text-xs space-y-2.5">
            <div className="flex items-start gap-2 text-indigo-950">
              <Mail className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black">No BillSync Pro account linked to {googleUnregisteredEmail}</p>
                <p className="text-[11px] text-indigo-700 font-medium mt-0.5">
                  Create a new shop account using this Google profile in seconds.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setWizardStep(1);
                setGoogleUnregisteredEmail(null);
                setError(null);
              }}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Register New Account with Google</span>
            </button>
          </div>
        )}

        {/* ==================== LOGIN MODE ==================== */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                Select Your Terminal Role
              </label>
              {/* Two Large Tactile Role Cards */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLoginRole('admin')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    loginRole === 'admin'
                      ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        loginRole === 'admin'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <UserCheck className="w-5 h-5" />
                    </div>
                    {loginRole === 'admin' && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[9px] font-black uppercase">
                        Active
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black text-slate-900">
                      Owner / Admin
                    </div>
                    <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                      Full access: Bills, Profit, GST Reports & Backup
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLoginRole('clerk')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    loginRole === 'clerk'
                      ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        loginRole === 'clerk'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Briefcase className="w-5 h-5" />
                    </div>
                    {loginRole === 'clerk' && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[9px] font-black uppercase">
                        Active
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black text-slate-900">
                      Billing Clerk
                    </div>
                    <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                      Fast counter POS billing only (No profit/settings)
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* 10-Digit Mobile Number with +91 Prefix */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                Registered Mobile Number
              </label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl focus-within:bg-white focus-within:border-indigo-600 transition-all overflow-hidden">
                <span className="px-3.5 py-3 bg-slate-100 border-r border-slate-200 text-xs font-black text-slate-700 font-mono select-none">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Enter 10-digit mobile number"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full p-3 text-sm font-black text-slate-900 outline-none bg-transparent font-mono tracking-wider"
                />
              </div>
            </div>

            {/* Password / PIN with Show/Hide Toggle */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {loginRole === 'clerk' ? 'Clerk PIN / Password' : 'Owner Password'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setResetPhone(loginPhone);
                    setResetRoleTarget(loginRole);
                    setError(null);
                  }}
                  className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Forgot Password / PIN?
                </button>
              </div>
              <div className="relative flex items-center">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5" />
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  placeholder={
                    loginRole === 'clerk'
                      ? 'Enter Clerk PIN (default: clerk123)'
                      : 'Enter Owner Password'
                  }
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-3 pl-10 pr-10 rounded-xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-600 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  className="absolute right-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showLoginPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember this device checkbox */}
            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-600 font-semibold">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Remember this device offline</span>
              </label>
              <span className="text-[11px] text-slate-400 font-semibold">
                {dbUsers.length} {dbUsers.length === 1 ? 'shop' : 'shops'} saved locally
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-3.5 rounded-xl text-sm shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {isLoggingIn
                  ? 'Unlocking Local Database...'
                  : loginRole === 'admin'
                  ? 'Login as Owner / Admin'
                  : 'Open Billing Clerk Terminal'}
              </span>
              <LogIn className="w-4 h-4" />
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="shrink-0 mx-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                or sign in with Google
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleBusy || isLoggingIn}
              className="w-full h-11 px-4 rounded-xl bg-white hover:bg-[#f8f9fa] active:bg-[#f1f3f4] border border-[#747775] text-[#1f1f1f] text-sm font-medium transition-colors flex items-center justify-center gap-3 shadow-2xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isGoogleBusy ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-600 shrink-0" />
              ) : (
                <GoogleLogoSvg />
              )}
              <span>{isGoogleBusy ? 'Connecting Google Account...' : 'Sign in with Google'}</span>
            </button>

            <div className="pt-3 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500 font-medium">
                Setting up a new shop counter?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setWizardStep(1);
                    setError(null);
                    setSuccess(null);
                    setGoogleUnregisteredEmail(null);
                  }}
                  className="text-indigo-600 font-black hover:underline cursor-pointer"
                >
                  Create New Account
                </button>
              </p>
            </div>
          </form>
        )}

        {/* ==================== 3-STEP REGISTRATION WIZARD ==================== */}
        {mode === 'register' && (
          <div className="space-y-4">
            {/* Wizard Progress Bar */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider text-center">
              <div
                className={`py-2 rounded-xl transition-all ${
                  wizardStep === 1
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                1. Shop Details
              </div>
              <div
                className={`py-2 rounded-xl transition-all ${
                  wizardStep === 2
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : wizardStep > 2
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'text-slate-400'
                }`}
              >
                2. Branding
              </div>
              <div
                className={`py-2 rounded-xl transition-all ${
                  wizardStep === 3
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400'
                }`}
              >
                3. Backup & Finish
              </div>
            </div>

            {/* STEP 1: BUSINESS & OWNER DETAILS */}
            {wizardStep === 1 && googleRegisterProfile && (
              <form onSubmit={handleGoogleQuickRegisterSubmit} className="space-y-3.5">
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-white border border-emerald-200 flex items-center justify-center shrink-0">
                      <GoogleLogoSvg className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
                        Google Profile Ready
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate block">
                        {googleRegisterProfile.email}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setGoogleRegisterProfile(null);
                      setSuccess(null);
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-white/80 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    Use Mobile Only
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Business / Shop Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shree Ganesh Kirana"
                    value={regBusiness}
                    onChange={(e) => setRegBusiness(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Owner Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Your name"
                      value={regOwnerName}
                      onChange={(e) => setRegOwnerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Mobile Number (+91) *
                    </label>
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:bg-white focus-within:border-indigo-600">
                      <span className="px-2.5 py-2.5 bg-slate-100 border-r border-slate-200 text-xs font-black text-slate-600 font-mono">
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        required
                        placeholder="10-digit mobile"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full p-2.5 text-xs font-black text-slate-900 bg-transparent outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Offline Backup Password (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Optional 4+ char password for offline mobile login"
                    value={googleQuickPassword}
                    onChange={(e) => setGoogleQuickPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGoogleSubmitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs sm:text-sm shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {isGoogleSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isGoogleSubmitting ? 'Creating Shop Account...' : 'Create Account & Open Dashboard'}</span>
                </button>
              </form>
            )}

            {wizardStep === 1 && !googleRegisterProfile && (
              <form onSubmit={handleStep1Next} className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleRegisterStart}
                  disabled={isGoogleBusy}
                  className="w-full h-11 px-4 rounded-xl bg-white hover:bg-[#f8f9fa] active:bg-[#f1f3f4] border border-[#747775] text-[#1f1f1f] text-sm font-medium transition-colors flex items-center justify-center gap-3 shadow-2xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isGoogleBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-600 shrink-0" />
                  ) : (
                    <GoogleLogoSvg />
                  )}
                  <span>{isGoogleBusy ? 'Connecting Google Account...' : 'Sign up with Google'}</span>
                </button>

                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-slate-200" />
                  <span className="shrink-0 mx-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    or register manually
                  </span>
                  <div className="flex-grow border-t border-slate-200" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Business / Shop Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Shree Ganesh Kirana"
                      value={regBusiness}
                      onChange={(e) => setRegBusiness(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Owner Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. राजेश शर्मा / Rajesh Sharma"
                      value={regOwnerName}
                      onChange={(e) => setRegOwnerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Mobile Number (+91) *
                    </label>
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:border-indigo-600">
                      <span className="px-2.5 py-2.5 bg-slate-100 border-r border-slate-200 text-xs font-black text-slate-600 font-mono">
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        required
                        placeholder="10-digit mobile"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full p-2.5 text-xs font-black text-slate-900 bg-transparent outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Business Category
                    </label>
                    <select
                      value={regBusinessType}
                      onChange={(e) => setRegBusinessType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    >
                      {BUSINESS_TYPES.map((bt) => (
                        <option key={bt} value={bt}>
                          {bt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      GSTIN (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      placeholder="e.g. 27AABCU9603R1ZM"
                      value={regGstin}
                      onChange={(e) => setRegGstin(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold font-mono text-slate-900 outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      State
                    </label>
                    <select
                      value={regState}
                      onChange={(e) => setRegState(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    >
                      {INDIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Shop Address
                  </label>
                  <input
                    type="text"
                    placeholder="Shop No, Market Name, City & Pincode"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Owner Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        placeholder="Min 4 chars"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 pr-8 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400"
                      >
                        {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      placeholder="Confirm"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                      Clerk PIN (Staff)
                    </label>
                    <input
                      type="text"
                      placeholder="Default: clerk123"
                      value={regClerkPassword}
                      onChange={(e) => setRegClerkPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                {/* Optional Carrier SMS/WhatsApp OTP Accordion */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setUseCarrierOtp(!useCarrierOtp)}
                    className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>
                      {useCarrierOtp
                        ? 'Hide Optional SMS/WhatsApp OTP Verification'
                        : 'Optional: Verify Mobile via SMS / WhatsApp OTP (Online)'}
                    </span>
                  </button>

                  {useCarrierOtp && (
                    <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOtpChannel('sms')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                            otpChannel === 'sms' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
                          }`}
                        >
                          SMS OTP
                        </button>
                        <button
                          type="button"
                          onClick={() => setOtpChannel('whatsapp')}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                            otpChannel === 'whatsapp' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'
                          }`}
                        >
                          WhatsApp OTP
                        </button>
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isSendingOtp || regPhone.length !== 10}
                          className="ml-auto px-3 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold disabled:opacity-40"
                        >
                          {isSendingOtp ? 'Sending...' : 'Send OTP'}
                        </button>
                      </div>
                      {sentOtp && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="6-digit OTP"
                            value={regOtp}
                            onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, ''))}
                            className="flex-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtpStep}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                          >
                            Verify
                          </button>
                        </div>
                      )}
                      {otpVerifyFeedback && (
                        <p className="text-[10px] font-bold text-emerald-700">{otpVerifyFeedback}</p>
                      )}
                      {trialRestrictionInfo?.directDispatchUrl && (
                        <a
                          href={trialRestrictionInfo.directDispatchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 underline"
                        >
                          <span>Receive OTP on WhatsApp App</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Back to Login
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Next: Shop Branding</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: BRANDING & OFFLINE RECOVERY QUESTION */}
            {wizardStep === 2 && (
              <form onSubmit={handleStep2Complete} className="space-y-3.5">
                {/* Base64 Logo Upload */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Shop Logo (Stored 100% Offline in Browser)
                  </label>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-dashed border-slate-300">
                    {regLogoBase64 ? (
                      <img
                        src={regLogoBase64}
                        alt="Shop Logo"
                        className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 p-1"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
                        <Upload className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs">
                        <Upload className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{regLogoBase64 ? 'Change Logo' : 'Upload Logo (PNG/JPG)'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Printed automatically on A4 GST & Thermal invoices.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Invoice Number Prefix */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Financial Year Invoice Prefix
                  </label>
                  <input
                    type="text"
                    value={regInvoicePrefix}
                    onChange={(e) => setRegInvoicePrefix(e.target.value)}
                    placeholder="BSP/2026-27/"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-black font-mono text-slate-900 outline-none focus:border-indigo-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Preview first bill number: <strong className="text-slate-700 font-mono">{regInvoicePrefix}0001</strong>
                  </p>
                </div>

                {/* Accent Colour Picker */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Invoice & Brand Accent Colour</span>
                  </label>
                  <div className="flex items-center gap-2.5">
                    {ACCENT_COLORS.map((col) => (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={() => setRegAccentColor(col.hex)}
                        className={`w-8 h-8 rounded-xl border-2 transition-transform cursor-pointer ${
                          regAccentColor === col.hex
                            ? 'scale-110 border-slate-900 shadow-md'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Offline Password Recovery Security Question */}
                <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <label className="block text-[10px] font-black uppercase text-amber-800">
                    Offline Password Recovery Question
                  </label>
                  <input
                    type="text"
                    value={regSecurityQuestion}
                    onChange={(e) => setRegSecurityQuestion(e.target.value)}
                    className="w-full bg-white border border-amber-200 p-2 rounded-lg text-xs font-semibold text-slate-800"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Secret Answer (e.g. Mumbai)"
                    value={regSecurityAnswer}
                    onChange={(e) => setRegSecurityAnswer(e.target.value)}
                    className="w-full bg-white border border-amber-300 p-2 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Complete Setup</span>
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: SETUP COMPLETE + MANDATORY BACKUP DOWNLOAD */}
            {wizardStep === 3 && createdUserRecord && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-800 uppercase">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Setup Complete!
                    </span>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-[10px] font-black text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print Setup Card</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">BUSINESS</span>
                      <span className="font-black text-slate-900">{createdUserRecord.businessName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">LOGIN MOBILE</span>
                      <span className="font-mono font-black text-slate-900">+91 {createdUserRecord.phone}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">INVOICE SERIES</span>
                      <span className="font-mono font-bold text-slate-800">{createdUserRecord.invoicePrefix}0001</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">CLERK PIN</span>
                      <span className="font-mono font-bold text-slate-800">{createdUserRecord.clerkPassword}</span>
                    </div>
                  </div>

                  <div className="mt-2 p-2.5 rounded-xl bg-white border border-emerald-200 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block">
                        OFFLINE MASTER RECOVERY CODE
                      </span>
                      <span className="font-mono text-sm font-black text-indigo-700 tracking-wider">
                        {generatedRecoveryCode}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      3 Customers + 5 Products Ready
                    </span>
                  </div>
                </div>

                {/* Mandatory Backup Step */}
                <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Download className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                        Mandatory Step: Download Backup File Now
                      </h4>
                      <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                        Because BillSync Pro stores 100% of your data locally on your device, please save your initial master backup file before entering the dashboard.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadInitialBackup}
                    className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      hasDownloadedMandatoryBackup
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-600 hover:bg-amber-700 text-white shadow-md'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {hasDownloadedMandatoryBackup
                        ? '✓ Backup File Downloaded Safely'
                        : 'Download Backup File Now (.JSON)'}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!hasDownloadedMandatoryBackup}
                  onClick={() => {
                    onLoginSuccess(
                      createdUserRecord.phone,
                      createdUserRecord.businessName,
                      'admin',
                      createdUserRecord.password
                    );
                  }}
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Launch BillSync Pro Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== OFFLINE PASSWORD / PIN RESET ==================== */}
        {mode === 'reset' && (
          <form onSubmit={handleOfflinePasswordReset} className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-600" />
                <span>100% Offline Password / PIN Reset</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                Back to Login
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setResetRoleTarget('admin')}
                className={`py-2 rounded-lg text-xs font-black ${
                  resetRoleTarget === 'admin' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Reset Owner Password
              </button>
              <button
                type="button"
                onClick={() => setResetRoleTarget('clerk')}
                className={`py-2 rounded-lg text-xs font-black ${
                  resetRoleTarget === 'clerk' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Reset Clerk PIN
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                Registered 10-Digit Mobile
              </label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                value={resetPhone}
                onChange={(e) => setResetPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 10-digit mobile number"
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-black font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                Recovery Code OR Security Answer
              </label>
              <input
                type="text"
                required
                value={resetSecretInput}
                onChange={(e) => setResetSecretInput(e.target.value)}
                placeholder="e.g. BSP-4K9A-8821 or your secret answer"
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                New {resetRoleTarget === 'admin' ? 'Owner Password' : 'Clerk PIN'}
              </label>
              <input
                type="password"
                required
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                placeholder="Enter new password / PIN"
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-900"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider shadow-md cursor-pointer"
            >
              Reset Password Offline
            </button>
          </form>
        )}

        {/* Hidden 'audit_logs' Security Troubleshooting Inspector */}
        <div className="mt-5 pt-3 border-t border-slate-200/80">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={async () => {
                const next = !showAuditLogs;
                setShowAuditLogs(next);
                if (next) await refreshAuditLogs();
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {showAuditLogs
                  ? 'Hide Security Troubleshooting (audit_logs)'
                  : 'OTP & Auth Troubleshooting (audit_logs)'}
              </span>
            </button>

            {showAuditLogs && auditLogsList.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await clearOtpAuditLogs();
                  setAuditLogsList([]);
                }}
                className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                title="Clear local audit_logs"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {showAuditLogs && (
            <div className="mt-2.5 bg-slate-900 text-slate-200 rounded-xl p-3 text-[11px] space-y-2 max-h-52 overflow-y-auto font-mono border border-slate-800">
              <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1.5">
                <span>COLLECTION: db.audit_logs (LOCAL DIAGNOSTICS)</span>
                <span className="tabular-nums">{auditLogsList.length} records</span>
              </div>

              {auditLogsList.length === 0 ? (
                <p className="text-[11px] text-slate-400 py-2 text-center">
                  No diagnostic events recorded in audit_logs yet.
                </p>
              ) : (
                auditLogsList.slice(0, 15).map((item) => (
                  <div
                    key={item.logId}
                    className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          item.status === 'success'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                            : 'bg-red-950 text-red-300 border border-red-700/60'
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-300">
                      <span className="font-bold">
                        {item.attemptType} ({item.channel.toUpperCase()})
                      </span>
                      <span>{item.maskedPhone}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed break-words">
                      [{item.diagnosticCode}] {item.reason}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
