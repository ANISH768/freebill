import { useState, FormEvent, useEffect } from 'react';
import { User, OtpAuditLogEntry } from '../types';
import { KeyRound, Phone, Store, CheckCircle, ShieldAlert, ArrowRight, UserPlus, LogIn, Clock, MessageSquare, ExternalLink, FileText, Trash2 } from 'lucide-react';
import { recordOtpAuditLog, getOtpAuditLogs, clearOtpAuditLogs } from '../utils/otpAuditLogger';

interface AuthLayoutProps {
  onLoginSuccess: (phone: string, businessName: string, role: 'admin' | 'clerk', password?: string) => void;
  dbUsers: User[];
  onUpdateUsers: (newUsers: User[]) => void;
}

export default function AuthLayout({ onLoginSuccess, dbUsers, onUpdateUsers }: AuthLayoutProps) {
  const [isRegister, setIsRegister] = useState(false);
  
  // Login Form States
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<'admin' | 'clerk'>('admin');
  
  // Register Form States
  const [regPhone, setRegPhone] = useState('');
  const [regBusiness, setRegBusiness] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regClerkPassword, setRegClerkPassword] = useState('');
  
  // OTP System States
  const [sentOtp, setSentOtp] = useState<string | null>(null);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState<number>(0);
  const [otpVerificationState, setOtpVerificationState] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle');
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
  const [showSandboxGuide, setShowSandboxGuide] = useState(false);
  const [sandboxJoinPhrase, setSandboxJoinPhrase] = useState<string>(() => {
    try {
      return localStorage.getItem('twilio_sandbox_join_phrase') || 'join ';
    } catch {
      return 'join ';
    }
  });
  const [sandboxCheckStatus, setSandboxCheckStatus] = useState<{
    loading: boolean;
    checked: boolean;
    isVerified: boolean;
    verifiedNumbers: string[];
  }>({ loading: false, checked: false, isVerified: false, verifiedNumbers: [] });
  
  // Messaging
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshAuditLogs = async () => {
    const logs = await getOtpAuditLogs();
    setAuditLogsList(logs);
  };

  const checkTwilioNumberConnection = async (phoneToCheck: string) => {
    setSandboxCheckStatus(prev => ({ ...prev, loading: true }));
    try {
      const resp = await fetch(`/api/auth/twilio-sandbox-status?phone=${encodeURIComponent(phoneToCheck)}`);
      const data = await resp.json();
      setSandboxCheckStatus({
        loading: false,
        checked: true,
        isVerified: Boolean(data.isTargetPhoneVerified),
        verifiedNumbers: Array.isArray(data.verifiedNumbers) ? data.verifiedNumbers : []
      });
    } catch {
      setSandboxCheckStatus({ loading: false, checked: true, isVerified: false, verifiedNumbers: [] });
    }
  };

  // Sync registered users from server on mount
  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          onUpdateUsers(data);
        }
      })
      .catch(err => console.warn("Network offline: could not sync user profiles from cloud", err));
  }, []);

  // 30-Second countdown timer for WhatsApp OTP resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (otpCountdown > 0) {
      timer = setTimeout(() => setOtpCountdown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCountdown]);

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
        reason: 'Invalid 10-digit mobile number entered during registration.'
      });
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    // Offline network detection
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'OTP_DISPATCH',
        channel: otpChannel,
        phone: regPhone,
        provider: 'Network Check',
        diagnosticCode: 'NETWORK_OFFLINE',
        reason: 'Device offline during WhatsApp/SMS OTP dispatch attempt.'
      });
      setError("Internet connection required to deliver OTP. Please ensure your device is connected to the internet.");
      return;
    }

    setIsSendingOtp(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: regPhone.trim(), channel: otpChannel })
      });

      const data = await response.json();
      if (response.ok) {
        setSentOtp(otpChannel);
        setRegOtp(''); // Strictly manual input - never auto-fill
        const masked = `+91 ${regPhone.slice(0, 2)}XXX XX${regPhone.slice(-3)}`;
        const statusMsg = data.message || (
          otpChannel === 'whatsapp'
            ? `OTP sent to your registered WhatsApp number ${masked}`
            : `OTP sent to your registered mobile number ${masked}`
        );
        setOtpSentMessage(statusMsg);
        setSuccess(statusMsg);
        setOtpCountdown(30); // 30-second security countdown

        const isTrialRestricted = Boolean(data.trialRestriction || !data.carrierDelivered);
        setTrialRestrictionInfo({
          isRestricted: isTrialRestricted,
          directDispatchUrl: data.directDispatchUrl || `/api/auth/whatsapp-direct-dispatch?phone=${regPhone.trim()}`,
          sandboxJoinUrl: data.sandboxJoinUrl || 'https://api.whatsapp.com/send?phone=14155238886&text=join',
          diagnosticReason: data.diagnosticReason || ''
        });

        await recordOtpAuditLog({
          status: data.carrierDelivered ? 'success' : 'failure',
          attemptType: 'OTP_DISPATCH',
          channel: otpChannel,
          phone: regPhone.trim(),
          provider: data.provider || (otpChannel === 'whatsapp' ? 'Twilio WhatsApp' : 'Fast2SMS / Twilio SMS'),
          diagnosticCode: data.diagnosticCode || (data.carrierDelivered ? 'DELIVERED' : 'TRIAL_RESTRICTION'),
          reason: data.diagnosticReason || (data.carrierDelivered ? 'OTP dispatched via carrier gateway.' : 'Twilio Trial requires Verified Caller ID or WhatsApp Sandbox join.')
        });
        if (showAuditLogs) refreshAuditLogs();
      } else {
        await recordOtpAuditLog({
          status: 'failure',
          attemptType: 'OTP_DISPATCH',
          channel: otpChannel,
          phone: regPhone.trim(),
          provider: 'Server Auth Gate',
          diagnosticCode: 'DISPATCH_REJECTED',
          reason: data.error || 'Server rejected OTP dispatch request.'
        });
        if (showAuditLogs) refreshAuditLogs();
        setError(data.error || `Failed to deliver ${otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} OTP code.`);
      }
    } catch (err) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'OTP_DISPATCH',
        channel: otpChannel,
        phone: regPhone.trim(),
        provider: 'Network Transport',
        diagnosticCode: 'NETWORK_ERROR',
        reason: 'Network request failed while contacting OTP dispatch server.'
      });
      if (showAuditLogs) refreshAuditLogs();
      setError(`Internet connection required to deliver ${otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} OTP. Please check your network and try again.`);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Dedicated Step 2: Verify 6-Digit OTP Input (Handles Success and Failure States Explicitly)
  const handleVerifyOtpStep = async () => {
    setError(null);
    setOtpVerifyFeedback(null);

    if (regOtp.trim().length !== 6) {
      setOtpVerificationState('failure');
      setOtpVerifyFeedback('Please enter the complete 6-digit OTP code received on your phone.');
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'OTP_VERIFY',
        channel: otpChannel,
        phone: regPhone.trim(),
        provider: 'Client Validator',
        diagnosticCode: 'INCOMPLETE_OTP',
        reason: 'OTP verification failed: Fewer than 6 digits entered.'
      });
      if (showAuditLogs) refreshAuditLogs();
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOtpVerificationState('failure');
      setOtpVerifyFeedback('Internet connection is required to verify your OTP code.');
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
          channel: otpChannel
        })
      });

      const data = await response.json();
      if (response.ok && data.verified) {
        setOtpVerificationState('success');
        setOtpVerifyFeedback(data.message || `Mobile number +91 ${regPhone.slice(0, 2)}XXX XX${regPhone.slice(-3)} verified!`);
        await recordOtpAuditLog({
          status: 'success',
          attemptType: 'OTP_VERIFY',
          channel: otpChannel,
          phone: regPhone.trim(),
          provider: 'OTP Step Verifier',
          diagnosticCode: 'OTP_VERIFIED',
          reason: '6-digit mobile OTP verified successfully in Step 2.'
        });
        if (showAuditLogs) refreshAuditLogs();
      } else {
        setOtpVerificationState('failure');
        setOtpVerifyFeedback(data.error || 'Incorrect 6-digit OTP code. Please verify and try again.');
        await recordOtpAuditLog({
          status: 'failure',
          attemptType: 'OTP_VERIFY',
          channel: otpChannel,
          phone: regPhone.trim(),
          provider: 'OTP Step Verifier',
          diagnosticCode: 'OTP_MISMATCH',
          reason: data.error || 'Entered 6-digit OTP code did not match.'
        });
        if (showAuditLogs) refreshAuditLogs();
      }
    } catch {
      setOtpVerificationState('failure');
      setOtpVerifyFeedback('Network error while verifying OTP. Please check your internet connection.');
    }
  };

  const handleChangeMobileNumber = () => {
    setSentOtp(null);
    setRegOtp('');
    setOtpSentMessage(null);
    setOtpVerificationState('idle');
    setOtpVerifyFeedback(null);
    setTrialRestrictionInfo(null);
    setError(null);
    setSuccess(null);
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (regPhone.length !== 10 || isNaN(Number(regPhone))) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!regOtp.trim() || regOtp.trim().length !== 6) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'OTP_VERIFY',
        channel: otpChannel,
        phone: regPhone.trim(),
        provider: 'Client Validator',
        diagnosticCode: 'INCOMPLETE_OTP',
        reason: 'User attempted registration without entering full 6-digit OTP.'
      });
      if (showAuditLogs) refreshAuditLogs();
      setError("Please enter the 6-digit verification OTP.");
      return;
    }
    if (!regBusiness.trim()) {
      setError("Please enter your Business / Counter Name.");
      return;
    }
    if (regPassword.length < 4) {
      setError("Password must be at least 4 characters long.");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }

    const payload = {
      phone: regPhone.trim(),
      password: regPassword.trim(),
      businessName: regBusiness.trim(),
      clerkPassword: regClerkPassword.trim() || 'clerk123',
      otp: regOtp.trim()
    };

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await recordOtpAuditLog({
          status: 'success',
          attemptType: 'OTP_VERIFY',
          channel: otpChannel,
          phone: payload.phone,
          provider: 'Registration Verifier',
          diagnosticCode: 'OTP_VERIFIED',
          reason: 'Registration 6-digit OTP verified and account created.'
        });
        const newUser: User = {
          phone: payload.phone,
          password: payload.password,
          businessName: payload.businessName,
          clerkPassword: payload.clerkPassword
        };
        const updated = [...dbUsers.filter(u => u.phone !== payload.phone), newUser];
        onUpdateUsers(updated);
        try {
          localStorage.setItem(`newly_registered_${payload.phone}`, 'true');
        } catch (e) {}
        setSuccess("Registration successful! You can now log in across all devices.");
        
        // Reset states
        setRegPhone('');
        setRegBusiness('');
        setRegOtp('');
        setRegPassword('');
        setRegConfirmPassword('');
        setRegClerkPassword('');
        setSentOtp(null);
        setOtpSentMessage(null);
        setOtpVerificationState('idle');
        setOtpVerifyFeedback(null);
        setTrialRestrictionInfo(null);

        // Toggle back to login
        setTimeout(() => {
          setIsRegister(false);
          setSuccess(null);
        }, 2000);
      } else {
        const errData = await response.json();
        await recordOtpAuditLog({
          status: 'failure',
          attemptType: 'OTP_VERIFY',
          channel: otpChannel,
          phone: payload.phone,
          provider: 'Registration Verifier',
          diagnosticCode: 'OTP_INVALID',
          reason: errData.error || 'OTP verification failed on server.'
        });
        if (showAuditLogs) refreshAuditLogs();
        setError(errData.error || "Registration failed on server.");
        return;
      }
    } catch (networkErr) {
      await recordOtpAuditLog({
        status: 'failure',
        attemptType: 'OTP_VERIFY',
        channel: otpChannel,
        phone: payload.phone,
        provider: 'Network Transport',
        diagnosticCode: 'NETWORK_OFFLINE',
        reason: 'Offline error during OTP verification.'
      });
      if (showAuditLogs) refreshAuditLogs();
      setError("You are currently offline. OTP Verification requires active network connection.");
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!loginPhone.trim() || !loginPassword.trim()) {
      setError("Please enter both mobile number and password.");
      return;
    }

    const trimmedPhone = loginPhone.trim();
    const trimmedPassword = loginPassword.trim();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmedPhone, password: trimmedPassword, role: loginRole })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Register user profile locally too for offline resilience
          const newUser: User = {
            phone: trimmedPhone,
            password: loginRole === 'admin' ? trimmedPassword : 'admin_placeholder',
            clerkPassword: loginRole === 'clerk' ? trimmedPassword : 'clerk123',
            businessName: data.user.businessName
          };
          const updated = [...dbUsers.filter(u => u.phone !== trimmedPhone), newUser];
          onUpdateUsers(updated);

          onLoginSuccess(data.user.phone, data.user.businessName, loginRole, trimmedPassword);
          return;
        }
      } else {
        // Check if user exists locally with correct password as a fallback
        const localUser = dbUsers.find(u => u.phone.trim() === trimmedPhone);
        if (localUser) {
          const matchPassword = loginRole === 'clerk' ? (localUser.clerkPassword || 'clerk123') : localUser.password;
          const isLocalValid = matchPassword?.trim() === trimmedPassword;
          if (isLocalValid) {
            onLoginSuccess(trimmedPhone, localUser.businessName, loginRole, trimmedPassword);
            return;
          }
        }

        const errData = await response.json();
        setError(errData.error || "Incorrect mobile number or password.");
        return;
      }
    } catch (networkErr) {
      // Offline fallback login check
      const localUser = dbUsers.find(u => u.phone.trim() === trimmedPhone);
      if (localUser) {
        const matchPassword = loginRole === 'clerk' ? (localUser.clerkPassword || 'clerk123') : localUser.password;
        const isLocalValid = matchPassword?.trim() === trimmedPassword;
        if (isLocalValid) {
          onLoginSuccess(trimmedPhone, localUser.businessName, loginRole, trimmedPassword);
          return;
        }
      }
      
      setError("Incorrect mobile number or password (Offline). Please try again.");
    }
  };

  return (
    <div id="auth-layout" className="min-h-screen flex items-center justify-center bg-[#030712] bg-gradient-to-tr from-[#030712] via-[#0f172a] to-[#1e1b4b] p-4 no-print select-none">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] w-full max-w-md p-8 border border-white/20 relative overflow-hidden transition-all duration-300">
        
        {/* Brand Banner */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl text-white mx-auto shadow-lg mb-3">
            📑
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">BillSync Pro</h2>
          <p className="text-xs text-slate-400 font-semibold mt-1">Enterprise Offline Billing Software</p>
        </div>

        {/* Info alerts */}
        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-lg flex items-start space-x-2 text-xs">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 p-3 rounded-lg flex items-start space-x-2 text-xs">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        {/* Real Carrier SMS dispatch notification */}
        {otpSentMessage && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-xl font-mono text-xs shadow-inner whitespace-pre-line relative">
            <span className="absolute top-2 right-2 text-[9px] bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md uppercase">
              Carrier SMS
            </span>
            {otpSentMessage}
          </div>
        )}

        {/* Forms Toggle View */}
        {!isRegister ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Account Log In</h3>
            
            {/* Role Selection Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => setLoginRole('admin')}
                className={`flex-1 text-center py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  loginRole === 'admin' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                👤 Owner / Admin
              </button>
              <button
                type="button"
                onClick={() => setLoginRole('clerk')}
                className={`flex-1 text-center py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  loginRole === 'clerk' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                💼 Billing Clerk
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">MOBILE NUMBER</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Enter 10-digit number"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 pl-10 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500 transition-all font-mono"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">PASSWORD</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-3 pl-10 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-all mt-2 flex items-center justify-center space-x-2"
            >
              <span>Access Dashboard</span>
              <LogIn className="w-4 h-4" />
            </button>

            <p className="text-xs text-center text-slate-500 mt-4">
              New Account? <button type="button" onClick={() => { setIsRegister(true); setError(null); setSuccess(null); }} className="text-blue-600 font-bold hover:underline mb-1">Register New Business</button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">New Registration</h3>

            {/* Step Indicator */}
            <div className="flex items-center justify-between text-[10px] font-bold px-2 py-1.5 bg-slate-100 rounded-xl text-slate-500">
              <span className={sentOtp === null ? 'text-blue-600' : 'text-emerald-600'}>
                1. Mobile Number
              </span>
              <span>→</span>
              <span className={
                otpVerificationState === 'success'
                  ? 'text-emerald-600'
                  : sentOtp !== null
                  ? 'text-blue-600'
                  : 'text-slate-400'
              }>
                2. Verify OTP
              </span>
              <span>→</span>
              <span className={otpVerificationState === 'success' ? 'text-blue-600' : 'text-slate-400'}>
                3. Business Setup
              </span>
            </div>
            
            <div className="space-y-2.5">
              {sentOtp === null && (
                <div className="flex items-center justify-between gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setOtpChannel('sms')}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      otpChannel === 'sms' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span>SMS OTP (Fast2SMS / Twilio)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpChannel('whatsapp')}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      otpChannel === 'whatsapp' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp OTP</span>
                  </button>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-slate-500">
                    MOBILE NUMBER (+91)
                  </label>
                  {sentOtp !== null && (
                    <button
                      type="button"
                      onClick={handleChangeMobileNumber}
                      className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Change Number
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="Enter 10-digit number"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                      disabled={sentOtp !== null || isSendingOtp}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 pl-10 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500 transition-all font-mono"
                    />
                  </div>
                  {sentOtp === null && (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isSendingOtp || regPhone.length !== 10}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1 text-xs rounded-xl transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{isSendingOtp ? 'Sending...' : (otpChannel === 'whatsapp' ? 'Send WhatsApp OTP' : 'Send SMS OTP')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* STEP 2: OTP INPUT VERIFICATION STEP (Appears after entering mobile number) */}
              {sentOtp !== null && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-medium space-y-1.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-bold">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{sentOtp === 'whatsapp' ? 'WhatsApp Delivery Active' : 'Fast2SMS / Twilio SMS Active'}</span>
                      </span>
                      <span className="bg-emerald-600 text-white text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold shadow-sm">
                        {trialRestrictionInfo?.isRestricted ? 'Action Ready' : 'Delivered'}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700 font-mono">
                      {otpSentMessage || (sentOtp === 'whatsapp'
                        ? `OTP sent to your registered WhatsApp number +91 ${regPhone.slice(0, 2)}XXX XX${regPhone.slice(-3)}`
                        : `OTP sent to your registered mobile number +91 ${regPhone.slice(0, 2)}XXX XX${regPhone.slice(-3)}`
                      )}
                    </p>

                    {trialRestrictionInfo && (
                      <div className="pt-2 mt-1.5 border-t border-emerald-200/80 space-y-2">
                        <p className="text-[10px] text-slate-600 leading-snug">
                          Phone par OTP nahi aaya? Twilio Trial me unverified +91 numbers ke liye neeche button dabayein — OTP seedha aapke WhatsApp app par aa jayega:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <a
                            href={trialRestrictionInfo.directDispatchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setTimeout(refreshAuditLogs, 600)}
                            className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg shadow-xs transition-all"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Receive OTP on WhatsApp App</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !showSandboxGuide;
                              setShowSandboxGuide(next);
                              if (next && regPhone.length === 10) {
                                checkTwilioNumberConnection(regPhone);
                              }
                            }}
                            className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-300 font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                          >
                            <span>{showSandboxGuide ? 'Hide Sandbox Guide' : 'How to Connect My Number to Sandbox'}</span>
                          </button>
                        </div>

                        {showSandboxGuide && (
                          <div className="bg-white border border-emerald-200 rounded-xl p-2.5 text-[10px] text-slate-700 space-y-2 mt-1">
                            <div className="font-bold text-slate-800 flex items-center justify-between">
                              <span>Connect +91 {regPhone} to Twilio Sandbox (+14155238886)</span>
                              <button
                                type="button"
                                onClick={() => checkTwilioNumberConnection(regPhone)}
                                className="text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold cursor-pointer"
                              >
                                {sandboxCheckStatus.loading ? 'Checking...' : 'Check Status'}
                              </button>
                            </div>

                            {sandboxCheckStatus.checked && (
                              <div className={`p-1.5 rounded-lg text-[10px] font-semibold ${
                                sandboxCheckStatus.isVerified
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}>
                                {sandboxCheckStatus.isVerified
                                  ? `✓ +91 ${regPhone} is verified in your Twilio account!`
                                  : `⚠ +91 ${regPhone} is not yet added in Twilio Verified Caller IDs (${sandboxCheckStatus.verifiedNumbers.length} numbers verified).`}
                              </div>
                            )}

                            <ol className="list-decimal pl-4 space-y-1.5 text-[10px] leading-relaxed">
                              <li>
                                <strong>Step 1 (Verify Number in Twilio):</strong> Open{' '}
                                <a
                                  href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 font-bold underline"
                                >
                                  Twilio Verified Caller IDs
                                </a>{' '}
                                and click <strong>Add a new Caller ID</strong> for <code>+91{regPhone}</code>.
                              </li>
                              <li>
                                <strong>Step 2 (Find Your Sandbox Code):</strong> Open{' '}
                                <a
                                  href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 font-bold underline"
                                >
                                  Twilio Try WhatsApp Sandbox
                                </a>{' '}
                                to see your 2-word code (e.g. <code>join apple-tiger</code>).
                              </li>
                              <li>
                                <strong>Step 3 (Send Join Message on WhatsApp):</strong> Type your code below and click Send:
                                <div className="flex gap-1.5 mt-1">
                                  <input
                                    type="text"
                                    value={sandboxJoinPhrase}
                                    onChange={(e) => {
                                      setSandboxJoinPhrase(e.target.value);
                                      try {
                                        localStorage.setItem('twilio_sandbox_join_phrase', e.target.value);
                                      } catch {}
                                    }}
                                    placeholder="e.g. join apple-tiger"
                                    className="flex-1 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-[10px] font-mono font-bold text-slate-800 outline-none focus:border-emerald-500"
                                  />
                                  <a
                                    href={`https://api.whatsapp.com/send?phone=14155238886&text=${encodeURIComponent(sandboxJoinPhrase.trim() || 'join')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-[10px] inline-flex items-center gap-1 shrink-0"
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

                  {/* Dedicated OTP Verification Input Box + Resend Countdown + Success/Failure State */}
                  <div className={`p-3 rounded-xl border transition-all space-y-2 ${
                    otpVerificationState === 'success'
                      ? 'bg-emerald-50/70 border-emerald-300'
                      : otpVerificationState === 'failure'
                      ? 'bg-red-50/60 border-red-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold text-slate-600">
                        {sentOtp === 'whatsapp' ? 'ENTER 6-DIGIT WHATSAPP OTP' : 'ENTER 6-DIGIT SMS OTP'}
                      </label>
                      {otpCountdown > 0 ? (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium font-mono tabular-nums">
                          <Clock className="w-3 h-3" />
                          <span>Resend in {otpCountdown}s</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isSendingOtp}
                          className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold underline cursor-pointer"
                        >
                          {sentOtp === 'whatsapp' ? 'Resend OTP on WhatsApp' : 'Resend OTP via SMS'}
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        autoFocus
                        disabled={otpVerificationState === 'success'}
                        placeholder="Enter 6-digit OTP"
                        value={regOtp}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setRegOtp(val);
                          if (otpVerificationState === 'failure') {
                            setOtpVerificationState('idle');
                            setOtpVerifyFeedback(null);
                          }
                        }}
                        className={`flex-1 bg-white border p-2.5 rounded-xl text-center text-base font-black tracking-widest outline-none transition-all font-mono shadow-inner ${
                          otpVerificationState === 'success'
                            ? 'border-emerald-500 text-emerald-800 bg-emerald-50'
                            : otpVerificationState === 'failure'
                            ? 'border-red-500 text-red-700 focus:border-red-600'
                            : 'border-slate-200 focus:border-emerald-500'
                        }`}
                      />
                      {otpVerificationState !== 'success' && (
                        <button
                          type="button"
                          onClick={handleVerifyOtpStep}
                          disabled={otpVerificationState === 'verifying' || regOtp.length !== 6}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-xs"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{otpVerificationState === 'verifying' ? 'Verifying...' : 'Verify OTP'}</span>
                        </button>
                      )}
                    </div>

                    {/* Verification Success Banner */}
                    {otpVerificationState === 'success' && (
                      <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-2.5 py-1.5 rounded-lg text-[11px] font-bold">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{otpVerifyFeedback || 'OTP Verified Successfully! Complete your business profile below.'}</span>
                      </div>
                    )}

                    {/* Verification Failure Banner */}
                    {otpVerificationState === 'failure' && (
                      <div className="flex items-start gap-1.5 text-red-700 bg-red-100/80 border border-red-300 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold">
                        <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span>{otpVerifyFeedback || 'OTP verification failed. Please check the 6-digit code and try again.'}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">BUSINESS / COUNTER NAME</label>
                    <div className="relative">
                      <Store className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="e.g., Ram & Sons Store"
                        value={regBusiness}
                        onChange={(e) => setRegBusiness(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 pl-10 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5 font-sans">PASSWORD</label>
                    <input
                      type="password"
                      placeholder="Create password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">CONFIRM PASSWORD</label>
                    <input
                      type="password"
                      placeholder="Confirm password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">CLERK PASSWORD (for Sales Staff)</label>
                    <input
                      type="password"
                      placeholder="Defaults to clerk123"
                      value={regClerkPassword}
                      onChange={(e) => setRegClerkPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs shadow-md transition-all mt-2 flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <span>Complete Registration</span>
                    <UserPlus className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            <p className="text-xs text-center text-slate-500 mt-4">
              Already have an account? <button type="button" onClick={() => { setIsRegister(false); setError(null); setSuccess(null); }} className="text-blue-600 font-bold hover:underline">Log in here</button>
            </p>
          </form>
        )}

        {/* Hidden 'audit_logs' Security Troubleshooting Inspector (Never displays sensitive OTP content) */}
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
              <span>{showAuditLogs ? 'Hide Security Troubleshooting (audit_logs)' : 'OTP Security Troubleshooting (audit_logs)'}</span>
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
                <span>COLLECTION: db.audit_logs (OTP REDACTED)</span>
                <span className="tabular-nums">{auditLogsList.length} records</span>
              </div>

              {auditLogsList.length === 0 ? (
                <p className="text-[11px] text-slate-400 py-2 text-center">
                  No OTP attempts recorded in audit_logs yet.
                </p>
              ) : (
                auditLogsList.slice(0, 15).map((item) => (
                  <div key={item.logId} className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        item.status === 'success'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                          : 'bg-red-950 text-red-300 border border-red-700/60'
                      }`}>
                        {item.status}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-300">
                      <span className="font-bold">{item.attemptType} ({item.channel.toUpperCase()})</span>
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
