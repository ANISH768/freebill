import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  Unlock, 
  KeyRound, 
  ShieldCheck, 
  Mail, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Delete,
  Eye,
  EyeOff,
  UserCheck,
  RefreshCw,
  PlusCircle,
  MessageSquare,
  ExternalLink,
  FileText,
  Trash2
} from 'lucide-react';
import { CounterLockConfig } from '../utils/appSettings';
import { OtpAuditLogEntry } from '../types';
import { recordOtpAuditLog, getOtpAuditLogs, clearOtpAuditLogs } from '../utils/otpAuditLogger';
import { t } from '../utils/i18n';

interface CounterLockScreenProps {
  isLocked: boolean;
  lockConfig: CounterLockConfig;
  businessName: string;
  currentUser: string | null;
  userEmail?: string;
  onUnlock: () => void;
  onUpdateLockConfig: (newConfig: CounterLockConfig) => void;
  onShowToast: (msg: string) => void;
}

export default function CounterLockScreen({
  isLocked,
  lockConfig,
  businessName,
  currentUser,
  userEmail,
  onUnlock,
  onUpdateLockConfig,
  onShowToast
}: CounterLockScreenProps) {
  // Current screen mode: 'unlock' or 'create'
  const hasExistingPin = Boolean(lockConfig.pin && lockConfig.pin.trim().length > 0);
  const [screenMode, setScreenMode] = useState<'unlock' | 'create'>(hasExistingPin ? 'unlock' : 'create');

  // Unlock mode states
  const [pinInput, setPinInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [failedAttempts, setFailedAttempts] = useState<number>(0);

  // First-time 6-digit PIN creation states
  const [createPin, setCreatePin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [createActiveField, setCreateActiveField] = useState<'create' | 'confirm'>('create');
  const [showCreatePin, setShowCreatePin] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>('');

  // Recovery Modal States
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [recoveryMethod, setRecoveryMethod] = useState<'whatsapp' | 'email'>('whatsapp');
  const [customEmailInput, setCustomEmailInput] = useState<string>('');
  const [recoveryOtp, setRecoveryOtp] = useState<string>('');
  const [isSendingRecoveryOtp, setIsSendingRecoveryOtp] = useState<boolean>(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpCountdown, setOtpCountdown] = useState<number>(0);
  const [otpVerified, setOtpVerified] = useState<boolean>(false);
  const [newPinAfterRecovery, setNewPinAfterRecovery] = useState<string>('');
  const [confirmNewPinAfterRecovery, setConfirmNewPinAfterRecovery] = useState<string>('');
  const [recoveryError, setRecoveryError] = useState<string>('');
  const [recoverySuccessMessage, setRecoverySuccessMessage] = useState<string>('');
  const [recoveryTrialInfo, setRecoveryTrialInfo] = useState<{
    isRestricted: boolean;
    directDispatchUrl: string;
    sandboxJoinUrl: string;
  } | null>(null);
  const [showRecoveryAuditLogs, setShowRecoveryAuditLogs] = useState<boolean>(false);
  const [recoveryAuditLogs, setRecoveryAuditLogs] = useState<OtpAuditLogEntry[]>([]);
  const [showRecoverySandboxGuide, setShowRecoverySandboxGuide] = useState<boolean>(false);
  const [recoverySandboxJoinPhrase, setRecoverySandboxJoinPhrase] = useState<string>(() => {
    try {
      return localStorage.getItem('twilio_sandbox_join_phrase') || 'join ';
    } catch {
      return 'join ';
    }
  });
  const [recoverySandboxStatus, setRecoverySandboxStatus] = useState<{
    loading: boolean;
    checked: boolean;
    isVerified: boolean;
  }>({ loading: false, checked: false, isVerified: false });

  const refreshRecoveryAuditLogs = async () => {
    const logs = await getOtpAuditLogs();
    setRecoveryAuditLogs(logs);
  };

  const checkRecoveryTwilioConnection = async (phoneToCheck: string) => {
    setRecoverySandboxStatus(prev => ({ ...prev, loading: true }));
    try {
      const resp = await fetch(`/api/auth/twilio-sandbox-status?phone=${encodeURIComponent(phoneToCheck)}`);
      const data = await resp.json();
      setRecoverySandboxStatus({
        loading: false,
        checked: true,
        isVerified: Boolean(data.isTargetPhoneVerified)
      });
    } catch {
      setRecoverySandboxStatus({ loading: false, checked: true, isVerified: false });
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  // Sync mode with lockConfig pin existence
  useEffect(() => {
    if (!lockConfig.pin || lockConfig.pin.trim().length === 0) {
      setScreenMode('create');
    } else {
      setScreenMode('unlock');
    }
  }, [lockConfig.pin]);

  // Clean inputs on lock trigger
  useEffect(() => {
    if (isLocked) {
      setPinInput('');
      setErrorMessage('');
      setCreatePin('');
      setConfirmPin('');
      setCreateError('');
      setFailedAttempts(0);
      setTimeout(() => {
        if (screenMode === 'create' && createInputRef.current) {
          createInputRef.current.focus();
        } else if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 150);
    }
  }, [isLocked, screenMode]);

  // 30-Second Countdown timer for WhatsApp OTP resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (otpCountdown > 0) {
      timer = setTimeout(() => setOtpCountdown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCountdown]);

  if (!isLocked) return null;

  // Real logged-in user phone number - NO mock numbers
  const formattedUserPhone = currentUser ? currentUser.replace(/^\+91/, '').trim() : '';
  const maskedPhone = formattedUserPhone.length === 10
    ? `+91 ${formattedUserPhone.slice(0, 2)}XXX XX${formattedUserPhone.slice(-3)}`
    : `+91 ${formattedUserPhone}`;
  const displayRecoveryPhone = formattedUserPhone ? `+91 ${formattedUserPhone}` : 'Registered WhatsApp Number';

  // Real registered email - NO mock emails
  const activeRegisteredEmail = (
    userEmail && userEmail !== 'billing@billsyncpro.com' && userEmail !== 'admin@billsyncpro.com'
  ) ? userEmail : (
    lockConfig.recoveryEmail && lockConfig.recoveryEmail !== 'admin@billsyncpro.com' && lockConfig.recoveryEmail !== 'billing@billsyncpro.com'
      ? lockConfig.recoveryEmail
      : ''
  );

  // ----------------- UNLOCK ATTEMPT HANDLER -----------------
  const handleUnlockAttempt = (enteredPin?: string) => {
    const pinToVerify = enteredPin !== undefined ? enteredPin : pinInput;
    if (!lockConfig.pin) {
      setScreenMode('create');
      return;
    }

    if (pinToVerify === lockConfig.pin) {
      setErrorMessage('');
      setPinInput('');
      setFailedAttempts(0);
      onShowToast('Retail Counter Unlocked');
      onUnlock();
    } else {
      setIsShaking(true);
      setErrorMessage('Incorrect 6-digit PIN. Please re-enter.');
      setFailedAttempts(prev => prev + 1);
      setTimeout(() => setIsShaking(false), 500);
      setPinInput('');
      if (inputRef.current) inputRef.current.focus();
    }
  };

  // Touch POS numeric keypad entry
  const handleKeypadPress = (digit: string) => {
    if (screenMode === 'unlock') {
      if (pinInput.length < 6) {
        const nextPin = pinInput + digit;
        setPinInput(nextPin);
        setErrorMessage('');
        // Automatically attempt unlock when 6th digit is pressed
        if (nextPin.length === 6) {
          setTimeout(() => handleUnlockAttempt(nextPin), 80);
        }
      }
    } else {
      // In create PIN mode
      if (createActiveField === 'create') {
        if (createPin.length < 6) {
          const next = createPin + digit;
          setCreatePin(next);
          setCreateError('');
          if (next.length === 6) {
            setCreateActiveField('confirm');
          }
        }
      } else {
        if (confirmPin.length < 6) {
          const next = confirmPin + digit;
          setConfirmPin(next);
          setCreateError('');
        }
      }
    }
  };

  const handleKeypadBackspace = () => {
    if (screenMode === 'unlock') {
      setPinInput(prev => prev.slice(0, -1));
      setErrorMessage('');
    } else {
      if (createActiveField === 'create') {
        setCreatePin(prev => prev.slice(0, -1));
      } else {
        setConfirmPin(prev => prev.slice(0, -1));
      }
      setCreateError('');
    }
  };

  const handleKeypadClear = () => {
    if (screenMode === 'unlock') {
      setPinInput('');
      setErrorMessage('');
    } else {
      if (createActiveField === 'create') {
        setCreatePin('');
      } else {
        setConfirmPin('');
      }
      setCreateError('');
    }
  };

  // ----------------- CREATE 6-DIGIT PIN HANDLER -----------------
  const handleSaveCreatedPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (createPin.length !== 6) {
      setCreateError('Please enter a 6-digit numeric PIN.');
      return;
    }
    if (createPin !== confirmPin) {
      setCreateError('The 6-digit PIN and confirmation PIN do not match.');
      return;
    }

    const updatedConfig: CounterLockConfig = {
      ...lockConfig,
      pin: createPin,
      enabled: true,
      recoveryPhone: formattedUserPhone || lockConfig.recoveryPhone || '',
      recoveryEmail: activeRegisteredEmail || lockConfig.recoveryEmail || ''
    };

    onUpdateLockConfig(updatedConfig);
    onShowToast('6-Digit Counter PIN created successfully! Keep it safe.');
    setCreatePin('');
    setConfirmPin('');
    setCreateError('');
    setScreenMode('unlock');
    onUnlock();
  };

  // ----------------- WHATSAPP OTP DISPATCH (STRICTLY NO ON-SCREEN PIN) -----------------
  const handleSendRecoveryOtp = async () => {
    setRecoveryError('');
    setRecoverySuccessMessage('');

    // Check offline state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'RECOVERY_DISPATCH',
        channel: recoveryMethod,
        phone: formattedUserPhone,
        provider: 'Network Check',
        diagnosticCode: 'NETWORK_OFFLINE',
        reason: 'Device offline during Counter Security recovery OTP request.'
      });
      if (showRecoveryAuditLogs) refreshRecoveryAuditLogs();
      setRecoveryError('Internet connection required to deliver WhatsApp OTP. Please ensure your device is connected to the internet.');
      return;
    }

    if (recoveryMethod === 'whatsapp' && !formattedUserPhone) {
      setRecoveryError('No active login mobile number found for WhatsApp OTP delivery.');
      return;
    }

    if (recoveryMethod === 'email' && !activeRegisteredEmail && !customEmailInput.trim()) {
      setRecoveryError('Please enter a valid email address to receive OTP.');
      return;
    }

    setIsSendingRecoveryOtp(true);
    try {
      const response = await fetch('/api/auth/send-recovery-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedUserPhone,
          method: recoveryMethod,
          email: activeRegisteredEmail || customEmailInput.trim()
        })
      });

      const data = await response.json();
      if (response.ok) {
        setOtpSent(true);
        setOtpCountdown(30); // 30-Second Security Countdown
        setRecoveryOtp(''); // Manual input required
        const statusMessage = recoveryMethod === 'whatsapp'
          ? `OTP sent to your registered WhatsApp number ${maskedPhone}`
          : `OTP sent to your registered email address`;
        setRecoverySuccessMessage(statusMessage);
        setRecoveryTrialInfo({
          isRestricted: Boolean(data.trialRestriction || !data.carrierDelivered),
          directDispatchUrl: data.directDispatchUrl || `/api/auth/whatsapp-direct-dispatch?phone=${formattedUserPhone}`,
          sandboxJoinUrl: data.sandboxJoinUrl || 'https://api.whatsapp.com/send?phone=14155238886&text=join'
        });
        await recordOtpAuditLog({
          status: data.carrierDelivered ? 'success' : 'failure',
          attemptType: 'RECOVERY_DISPATCH',
          channel: recoveryMethod,
          phone: formattedUserPhone,
          provider: data.provider || (recoveryMethod === 'whatsapp' ? 'Twilio WhatsApp' : 'Email Gateway'),
          diagnosticCode: data.diagnosticCode || (data.carrierDelivered ? 'DELIVERED' : 'TRIAL_RESTRICTION'),
          reason: data.diagnosticReason || (data.carrierDelivered ? 'Recovery OTP dispatched via carrier.' : 'Twilio Trial requires Verified Caller ID or WhatsApp Sandbox join.')
        });
        if (showRecoveryAuditLogs) refreshRecoveryAuditLogs();
        onShowToast(statusMessage);
      } else {
        await recordOtpAuditLog({
          status: 'failure',
          attemptType: 'RECOVERY_DISPATCH',
          channel: recoveryMethod,
          phone: formattedUserPhone,
          provider: 'Recovery Gate',
          diagnosticCode: 'DISPATCH_REJECTED',
          reason: data.error || 'Failed to dispatch recovery OTP.'
        });
        if (showRecoveryAuditLogs) refreshRecoveryAuditLogs();
        setRecoveryError(data.error || 'Failed to dispatch WhatsApp OTP.');
      }
    } catch (err) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'RECOVERY_DISPATCH',
        channel: recoveryMethod,
        phone: formattedUserPhone,
        provider: 'Network Transport',
        diagnosticCode: 'NETWORK_ERROR',
        reason: 'Network error while requesting Counter Security recovery OTP.'
      });
      if (showRecoveryAuditLogs) refreshRecoveryAuditLogs();
      setRecoveryError('Internet connection required to deliver WhatsApp OTP. Please check your network and try again.');
    } finally {
      setIsSendingRecoveryOtp(false);
    }
  };

  // ----------------- VERIFY 6-DIGIT WHATSAPP OTP -----------------
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryOtp.length !== 6) {
      setRecoveryError('Please enter the full 6-digit verification code received on WhatsApp.');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setRecoveryError('Internet connection required to verify WhatsApp OTP.');
      return;
    }

    setIsVerifyingOtp(true);
    setRecoveryError('');
    try {
      const response = await fetch('/api/auth/verify-recovery-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedUserPhone,
          otp: recoveryOtp.trim()
        })
      });

      const data = await response.json();
      if (response.ok) {
        await recordOtpAuditLog({
          status: 'success',
          attemptType: 'RECOVERY_VERIFY',
          channel: recoveryMethod,
          phone: formattedUserPhone,
          provider: 'Recovery Verifier',
          diagnosticCode: 'OTP_VERIFIED',
          reason: 'Counter Security recovery 6-digit OTP verified.'
        });
        if (showRecoveryAuditLogs) refreshRecoveryAuditLogs();
        setRecoveryError('');
        setOtpVerified(true);
        onShowToast('WhatsApp OTP verified successfully');
      } else {
        await recordOtpAuditLog({
          status: 'failure',
          attemptType: 'RECOVERY_VERIFY',
          channel: recoveryMethod,
          phone: formattedUserPhone,
          provider: 'Recovery Verifier',
          diagnosticCode: 'OTP_MISMATCH',
          reason: data.error || 'Recovery 6-digit OTP verification failed.'
        });
        if (showRecoveryAuditLogs) refreshRecoveryAuditLogs();
        setRecoveryError(data.error || 'Incorrect 6-digit OTP code received on WhatsApp. Please check and try again.');
      }
    } catch (err) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'RECOVERY_VERIFY',
        channel: recoveryMethod,
        phone: formattedUserPhone,
        provider: 'Network Transport',
        diagnosticCode: 'NETWORK_ERROR',
        reason: 'Network error while verifying Counter Security recovery OTP.'
      });
      if (showRecoveryAuditLogs) refreshRecoveryAuditLogs();
      setRecoveryError('Internet connection required to verify WhatsApp OTP. Please check your network.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Complete password reset and save new 6-digit PIN
  const handleCompletePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinAfterRecovery.length !== 6) {
      setRecoveryError('PIN must be exactly 6 digits.');
      return;
    }
    if (newPinAfterRecovery !== confirmNewPinAfterRecovery) {
      setRecoveryError('New 6-digit PIN and confirmation PIN do not match.');
      return;
    }

    const updatedEmail = activeRegisteredEmail || customEmailInput.trim() || lockConfig.recoveryEmail;

    const updatedConfig: CounterLockConfig = {
      ...lockConfig,
      pin: newPinAfterRecovery,
      enabled: true,
      recoveryPhone: formattedUserPhone || lockConfig.recoveryPhone,
      recoveryEmail: updatedEmail
    };
    onUpdateLockConfig(updatedConfig);
    onShowToast('New 6-digit Counter PIN saved & counter unlocked!');
    setShowForgotModal(false);
    setOtpVerified(false);
    setOtpSent(false);
    setRecoveryOtp('');
    setNewPinAfterRecovery('');
    setConfirmNewPinAfterRecovery('');
    setScreenMode('unlock');
    onUnlock();
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in no-print">
      <div 
        className={`w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 text-white relative transition-transform ${
          isShaking ? 'translate-x-[-8px] ring-2 ring-red-500' : ''
        }`}
      >
        {/* Header Branding */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mx-auto flex items-center justify-center shadow-lg shadow-blue-500/10">
            {screenMode === 'create' ? <KeyRound className="w-8 h-8 text-amber-400" /> : <Lock className="w-8 h-8 text-blue-400" />}
          </div>
          
          <h2 className="text-xl font-black tracking-tight text-white">{businessName}</h2>
          
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-medium flex-wrap">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>{screenMode === 'create' ? 'First-Time PIN Setup' : 'Counter Session Locked'}</span>
            <span>•</span>
            <span className="font-mono text-slate-300 font-bold">
              {currentUser ? `+91 ${formattedUserPhone}` : 'Operator Counter'}
            </span>
          </div>
        </div>

        {/* ----------------- MODE A: CREATE 6-DIGIT PIN ----------------- */}
        {screenMode === 'create' ? (
          <div className="space-y-4 mb-6">
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-3.5 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-bold mb-1">
                <PlusCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Create Your 6-Digit Counter PIN</span>
              </div>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Set a 6-digit security PIN for counter sessions. You will use this exact PIN to unlock the counter.
              </p>
            </div>

            {/* Step 1: Enter 6-Digit PIN */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  1. Enter 6-Digit PIN:
                </label>
                <button
                  type="button"
                  onClick={() => setShowCreatePin(!showCreatePin)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {showCreatePin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showCreatePin ? 'Hide' : 'Show'}</span>
                </button>
              </div>

              <div 
                onClick={() => setCreateActiveField('create')}
                className={`flex justify-center items-center gap-2 p-3 bg-slate-950 rounded-2xl border cursor-pointer transition-all ${
                  createActiveField === 'create' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-800'
                }`}
              >
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const char = createPin[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-10 h-12 rounded-xl flex items-center justify-center font-mono font-black text-xl border transition-all ${
                        char
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 shadow-xs'
                          : 'border-slate-800 bg-slate-900/60 text-slate-600'
                      }`}
                    >
                      {char ? (showCreatePin ? char : '●') : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Confirm 6-Digit PIN */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 block">
                2. Confirm 6-Digit PIN:
              </label>

              <div 
                onClick={() => setCreateActiveField('confirm')}
                className={`flex justify-center items-center gap-2 p-3 bg-slate-950 rounded-2xl border cursor-pointer transition-all ${
                  createActiveField === 'confirm' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-800'
                }`}
              >
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const char = confirmPin[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-10 h-12 rounded-xl flex items-center justify-center font-mono font-black text-xl border transition-all ${
                        char
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 shadow-xs'
                          : 'border-slate-800 bg-slate-900/60 text-slate-600'
                      }`}
                    >
                      {char ? (showCreatePin ? char : '●') : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            {createError && (
              <div className="bg-red-950/60 border border-red-800/80 rounded-xl p-2.5 text-xs text-red-300 flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{createError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleSaveCreatedPin()}
              disabled={createPin.length !== 6 || confirmPin.length !== 6}
              className="w-full bg-amber-500 hover:bg-amber-400 active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black py-3.5 px-4 rounded-2xl text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save 6-Digit PIN & Unlock Counter</span>
            </button>

            {hasExistingPin && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setScreenMode('unlock');
                    setCreateError('');
                  }}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  ← Back to Unlock Screen
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ----------------- MODE B: ENTER 6-DIGIT PIN TO UNLOCK ----------------- */
          <div className="space-y-4 mb-6">
            {/* Visual 6-Slot PIN Indicator */}
            <div className="flex justify-center items-center gap-2.5 p-3.5 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const char = pinInput[idx];
                const isActive = pinInput.length === idx;
                return (
                  <div
                    key={idx}
                    className={`w-11 h-13 rounded-xl flex items-center justify-center font-mono font-black text-2xl border transition-all ${
                      char
                        ? 'border-blue-500 bg-blue-600/20 text-blue-300 shadow-md shadow-blue-500/20 scale-105'
                        : isActive
                        ? 'border-blue-400/80 bg-slate-900 ring-2 ring-blue-500/30'
                        : 'border-slate-800 bg-slate-900/60 text-slate-600'
                    }`}
                  >
                    {char ? (showPassword ? char : '●') : ''}
                  </div>
                );
              })}
            </div>

            {/* Hidden / Sync keyboard input */}
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                maxLength={6}
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPinInput(val);
                  setErrorMessage('');
                  if (val.length === 6) {
                    setTimeout(() => handleUnlockAttempt(val), 80);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUnlockAttempt();
                  }
                }}
                placeholder="Type 6-digit PIN"
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl py-2 px-4 text-center text-xs font-mono tracking-widest text-slate-300 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                title={showPassword ? 'Hide PIN' : 'Show PIN'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Error & Attempts Alert */}
            {errorMessage && (
              <div className="bg-red-950/60 border border-red-800/80 rounded-xl p-2.5 text-xs text-red-300 flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {failedAttempts > 2 && (
              <p className="text-[11px] text-amber-400 text-center font-medium">
                ⚠️ {failedAttempts} incorrect attempts. Click "Forgot 6-Digit PIN" below to recover via WhatsApp OTP.
              </p>
            )}

            {/* Primary Unlock Action */}
            <button
              type="button"
              onClick={() => handleUnlockAttempt()}
              disabled={pinInput.length !== 6}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-white font-black py-3.5 px-4 rounded-2xl text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>{t('lock.unlock', undefined, 'Unlock Counter')}</span>
            </button>
          </div>
        )}

        {/* ----------------- TOUCH / POS NUMERIC KEYPAD ----------------- */}
        <div className="grid grid-cols-3 gap-2.5 mb-5 select-none">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeypadPress(digit)}
              className="bg-slate-800/80 hover:bg-slate-700/80 active:bg-blue-600 active:scale-95 text-white font-black text-lg py-3 rounded-xl border border-slate-700/50 transition-all cursor-pointer shadow-xs"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleKeypadClear}
            className="bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs py-3 rounded-xl border border-slate-700/40 transition-colors cursor-pointer"
          >
            CLR
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="bg-slate-800/80 hover:bg-slate-700/80 active:bg-blue-600 active:scale-95 text-white font-black text-lg py-3 rounded-xl border border-slate-700/50 transition-all cursor-pointer shadow-xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleKeypadBackspace}
            className="bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs py-3 rounded-xl border border-slate-700/40 transition-colors flex items-center justify-center cursor-pointer"
            title="Backspace"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Action Triggers: Forgot PIN / Create PIN */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
          <button
            type="button"
            onClick={() => {
              setShowForgotModal(true);
              setOtpSent(false);
              setOtpVerified(false);
              setRecoveryError('');
              setRecoverySuccessMessage('');
            }}
            className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Forgot PIN? WhatsApp OTP</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setScreenMode(screenMode === 'create' ? 'unlock' : 'create');
              setCreateError('');
              setErrorMessage('');
            }}
            className="text-slate-400 hover:text-white font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{screenMode === 'create' ? 'Unlock with PIN' : 'Set New 6-Digit PIN'}</span>
          </button>
        </div>
      </div>

      {/* ----------------- MODAL: FORGOT PASSWORD / REAL WHATSAPP OTP RECOVERY ----------------- */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 text-white shadow-2xl space-y-5 animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Counter Security Recovery</h3>
                  <p className="text-[10px] text-slate-400">Direct WhatsApp OTP verification</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: Select Method & Send OTP */}
            {!otpVerified && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryMethod('whatsapp');
                      setOtpSent(false);
                      setRecoveryError('');
                      setRecoverySuccessMessage('');
                    }}
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      recoveryMethod === 'whatsapp'
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold shadow-xs'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="text-left">
                      <div className="font-bold">WhatsApp OTP</div>
                      <div className="text-[10px] opacity-75">Direct Delivery</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryMethod('email');
                      setOtpSent(false);
                      setRecoveryError('');
                      setRecoverySuccessMessage('');
                    }}
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      recoveryMethod === 'email'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-bold shadow-xs'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="text-left">
                      <div className="font-bold">Email OTP</div>
                      <div className="text-[10px] opacity-75">Registered Email</div>
                    </div>
                  </button>
                </div>

                {/* Target Information Display - strictly using logged in account data */}
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      {recoveryMethod === 'whatsapp' ? 'Registered WhatsApp Mobile' : 'Registered Business Email'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      <span>Active Login</span>
                    </span>
                  </div>

                  {recoveryMethod === 'whatsapp' ? (
                    <div className="font-mono font-bold text-sm text-white flex items-center gap-1.5 pt-0.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{displayRecoveryPhone}</span>
                    </div>
                  ) : (
                    <div>
                      {activeRegisteredEmail ? (
                        <div className="font-mono font-bold text-sm text-white pt-0.5">
                          {activeRegisteredEmail}
                        </div>
                      ) : (
                        <div className="space-y-1 pt-1">
                          <p className="text-[11px] text-amber-300">
                            No email registered with this login. Enter your email to receive the code:
                          </p>
                          <input
                            type="email"
                            value={customEmailInput}
                            onChange={(e) => setCustomEmailInput(e.target.value)}
                            placeholder="Enter your email address"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500 font-medium"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {recoveryError && (
                  <div className="bg-red-950/60 border border-red-800/80 rounded-xl p-2.5 text-xs text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{recoveryError}</span>
                  </div>
                )}

                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleSendRecoveryOtp}
                    disabled={isSendingRecoveryOtp}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{isSendingRecoveryOtp ? 'Dispatching to WhatsApp...' : 'Send WhatsApp Verification OTP'}</span>
                  </button>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-3">
                    {/* Status Message ONLY: Strictly NO On-screen OTP */}
                    <div className="bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-2xl text-xs text-emerald-200 space-y-1.5">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>WhatsApp Dispatch Active</span>
                        </span>
                        <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">
                          {recoveryTrialInfo?.isRestricted ? 'Action Ready' : 'Delivered'}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-emerald-300">
                        {recoverySuccessMessage || `OTP sent to your registered WhatsApp number ${maskedPhone}`}
                      </p>

                      {recoveryTrialInfo && (
                        <div className="pt-2 mt-1 border-t border-emerald-800/60 space-y-2">
                          <p className="text-[10px] text-emerald-200/80 leading-snug">
                            Phone par OTP nahi aaya? Twilio Trial me unverified +91 numbers ke liye neeche button dabayein — OTP seedha aapke WhatsApp app par aa jayega:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <a
                              href={recoveryTrialInfo.directDispatchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setTimeout(refreshRecoveryAuditLogs, 600)}
                              className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg shadow-xs transition-all"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Receive OTP on WhatsApp App</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                const next = !showRecoverySandboxGuide;
                                setShowRecoverySandboxGuide(next);
                                if (next && formattedUserPhone) {
                                  checkRecoveryTwilioConnection(formattedUserPhone);
                                }
                              }}
                              className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-700/60 font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                            >
                              <span>{showRecoverySandboxGuide ? 'Hide Sandbox Guide' : 'How to Connect My Number to Sandbox'}</span>
                            </button>
                          </div>

                          {showRecoverySandboxGuide && (
                            <div className="bg-slate-950/90 border border-emerald-800/70 rounded-xl p-2.5 text-[10px] text-slate-300 space-y-2">
                              <div className="font-bold text-white flex items-center justify-between">
                                <span>Connect +91 {formattedUserPhone} to Twilio Sandbox</span>
                                <button
                                  type="button"
                                  onClick={() => checkRecoveryTwilioConnection(formattedUserPhone)}
                                  className="text-[9px] bg-slate-800 hover:bg-slate-700 text-emerald-300 px-1.5 py-0.5 rounded font-bold cursor-pointer"
                                >
                                  {recoverySandboxStatus.loading ? 'Checking...' : 'Check Status'}
                                </button>
                              </div>

                              {recoverySandboxStatus.checked && (
                                <div className={`p-1.5 rounded-lg text-[10px] font-semibold ${
                                  recoverySandboxStatus.isVerified
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                    : 'bg-amber-950/70 text-amber-300 border border-amber-700/70'
                                }`}>
                                  {recoverySandboxStatus.isVerified
                                    ? `✓ +91 ${formattedUserPhone} is verified in your Twilio account!`
                                    : `⚠ +91 ${formattedUserPhone} is not yet added in Twilio Verified Caller IDs.`}
                                </div>
                              )}

                              <ol className="list-decimal pl-4 space-y-1.5 text-[10px] leading-relaxed">
                                <li>
                                  <strong>Step 1:</strong> Open{' '}
                                  <a
                                    href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-400 font-bold underline"
                                  >
                                    Twilio Verified Caller IDs
                                  </a>{' '}
                                  and add <code>+91{formattedUserPhone}</code>.
                                </li>
                                <li>
                                  <strong>Step 2:</strong> Open{' '}
                                  <a
                                    href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-400 font-bold underline"
                                  >
                                    Twilio Try WhatsApp Sandbox
                                  </a>{' '}
                                  to see your 2-word code (e.g. <code>join apple-tiger</code>).
                                </li>
                                <li>
                                  <strong>Step 3:</strong> Type your code below and click Send:
                                  <div className="flex gap-1.5 mt-1">
                                    <input
                                      type="text"
                                      value={recoverySandboxJoinPhrase}
                                      onChange={(e) => {
                                        setRecoverySandboxJoinPhrase(e.target.value);
                                        try {
                                          localStorage.setItem('twilio_sandbox_join_phrase', e.target.value);
                                        } catch {}
                                      }}
                                      placeholder="e.g. join apple-tiger"
                                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono font-bold text-white outline-none focus:border-emerald-500"
                                    />
                                    <a
                                      href={`https://api.whatsapp.com/send?phone=14155238886&text=${encodeURIComponent(recoverySandboxJoinPhrase.trim() || 'join')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded text-[10px] inline-flex items-center gap-1 shrink-0"
                                    >
                                      <span>Send to +14155238886</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  </div>
                                </li>
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-center">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-slate-300 font-semibold">
                          Enter 6-Digit WhatsApp OTP:
                        </label>
                        {otpCountdown > 0 ? (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono tabular-nums">
                            <Clock className="w-3 h-3" />
                            <span>Resend in {otpCountdown}s</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSendRecoveryOtp}
                            disabled={isSendingRecoveryOtp}
                            className="text-[11px] text-emerald-400 hover:underline cursor-pointer font-bold"
                          >
                            Resend OTP on WhatsApp
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        maxLength={6}
                        required
                        autoFocus
                        value={recoveryOtp}
                        onChange={(e) => setRecoveryOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••••"
                        className="w-48 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl py-2.5 px-4 text-center text-2xl font-mono tracking-widest text-white outline-none shadow-inner"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={recoveryOtp.length !== 6 || isVerifyingOtp}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isVerifyingOtp ? 'Verifying...' : 'Verify WhatsApp OTP Code'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* STEP 2: Set New 6-Digit PIN After Verification */}
            {otpVerified && (
              <form onSubmit={handleCompletePasswordReset} className="space-y-4">
                <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>WhatsApp verified for {displayRecoveryPhone}! Enter your new 6-digit PIN.</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      New 6-Digit PIN
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      autoFocus
                      value={newPinAfterRecovery}
                      onChange={(e) => setNewPinAfterRecovery(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 567890"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-base font-mono tracking-widest text-center text-white outline-none focus:border-blue-500 shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Confirm New 6-Digit PIN
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      value={confirmNewPinAfterRecovery}
                      onChange={(e) => setConfirmNewPinAfterRecovery(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 567890"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-base font-mono tracking-widest text-center text-white outline-none focus:border-blue-500 shadow-inner"
                    />
                  </div>
                </div>

                {recoveryError && (
                  <p className="text-xs text-red-400 text-center font-medium">{recoveryError}</p>
                )}

                <button
                  type="submit"
                  disabled={newPinAfterRecovery.length !== 6 || confirmNewPinAfterRecovery.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-3.5 rounded-xl text-xs shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Save 6-Digit PIN & Unlock Counter</span>
                </button>
              </form>
            )}

            {/* Hidden 'audit_logs' Security Troubleshooting Inspector inside Recovery Modal */}
            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={async () => {
                    const next = !showRecoveryAuditLogs;
                    setShowRecoveryAuditLogs(next);
                    if (next) await refreshRecoveryAuditLogs();
                  }}
                  className="text-[11px] font-bold text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>{showRecoveryAuditLogs ? 'Hide Security Troubleshooting (audit_logs)' : 'OTP Security Troubleshooting (audit_logs)'}</span>
                </button>

                {showRecoveryAuditLogs && recoveryAuditLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await clearOtpAuditLogs();
                      setRecoveryAuditLogs([]);
                    }}
                    className="text-[10px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {showRecoveryAuditLogs && (
                <div className="mt-2 bg-slate-950 text-slate-300 rounded-xl p-2.5 text-[10px] space-y-1.5 max-h-44 overflow-y-auto font-mono border border-slate-800">
                  <div className="flex items-center justify-between text-slate-500 border-b border-slate-800 pb-1">
                    <span>COLLECTION: db.audit_logs (OTP REDACTED)</span>
                    <span className="tabular-nums">{recoveryAuditLogs.length} records</span>
                  </div>

                  {recoveryAuditLogs.length === 0 ? (
                    <p className="text-slate-500 py-2 text-center">No OTP attempts recorded in audit_logs yet.</p>
                  ) : (
                    recoveryAuditLogs.slice(0, 12).map((item) => (
                      <div key={item.logId} className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            item.status === 'success'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                              : 'bg-red-950 text-red-300 border border-red-700/60'
                          }`}>
                            {item.status}
                          </span>
                          <span className="text-slate-400 tabular-nums">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-300 font-bold">
                          <span>{item.attemptType} ({item.channel.toUpperCase()})</span>
                          <span>{item.maskedPhone}</span>
                        </div>
                        <p className="text-slate-400 leading-relaxed break-words">
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
      )}
    </div>
  );
}
