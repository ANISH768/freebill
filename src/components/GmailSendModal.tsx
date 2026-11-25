import React, { useEffect, useState } from 'react';
import { Mail, Send, X, AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useCloudAuth } from '../context/CloudAuthContext';
import { sendGmailMessage, type GmailDraftPayload } from '../services/gmailService';

interface GmailSendModalProps {
  draft: GmailDraftPayload | null;
  businessName: string;
  onClose: () => void;
  onSentSuccess: (message: string) => void;
}

function GoogleMarkSvg({ className = 'w-4 h-4' }: { className?: string }) {
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

export default function GmailSendModal({
  draft,
  businessName,
  onClose,
  onSentSuccess,
}: GmailSendModalProps) {
  const { cloudUser, hasGmailAccess, isSigningIn, signInWithGoogle, getGmailAccessToken } = useCloudAuth();
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  useEffect(() => {
    if (draft) {
      setToEmail(draft.to || '');
      setSubject(draft.subject || '');
      setBody(draft.textBody || '');
      setError(null);
      setNeedsReconnect(false);
    }
  }, [draft]);

  if (!draft) return null;

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail.trim());
  const canSend = isEmailValid && subject.trim().length > 0 && body.trim().length > 0 && hasGmailAccess && !needsReconnect;

  const handleReconnectGoogle = async () => {
    setError(null);
    const outcome = await signInWithGoogle();
    if (outcome?.gmailAccessToken) {
      setNeedsReconnect(false);
    } else if (outcome) {
      setError('Google sign-in completed, but Gmail permission was not granted. Please try again and allow Gmail access.');
    }
  };

  const handleConfirmSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isEmailValid) {
      setError('Please enter a valid customer email address.');
      return;
    }

    const token = getGmailAccessToken();
    if (!token) {
      setNeedsReconnect(true);
      setError('Your Gmail session needs quick re-verification before sending.');
      return;
    }

    setIsSending(true);
    try {
      await sendGmailMessage(token, {
        to: toEmail.trim(),
        subject: subject.trim(),
        textBody: body.trim(),
        businessName,
      });

      const label = draft.mode === 'bill'
        ? `Bill ${draft.billSerial || ''} emailed to ${toEmail.trim()} via Gmail.`
        : `Payment reminder emailed to ${toEmail.trim()} via Gmail.`;

      onSentSuccess(label);
      onClose();
    } catch (err: any) {
      if (err?.message === 'GMAIL_AUTH_EXPIRED') {
        setNeedsReconnect(true);
        setError('Gmail authorization expired. Please reconnect your Google account below to send.');
      } else {
        setError(err?.message || 'Failed to send email via Gmail. Please try again.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-modal-title"
    >
      <form
        onSubmit={handleConfirmSend}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="gmail-modal-title" className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {draft.mode === 'bill' ? 'Confirm & Email Bill via Gmail' : 'Confirm & Email Payment Reminder'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {draft.recipientName}
                {draft.billSerial ? ` · ${draft.billSerial}` : ''}
                {draft.amountDue !== undefined && draft.amountDue > 0
                  ? ` · Due ₹${draft.amountDue.toLocaleString('en-IN')}`
                  : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Gmail connection status / reconnect prompt */}
          {(!hasGmailAccess || needsReconnect) ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900 dark:text-white">
                  Connect Google Account for Gmail
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {cloudUser?.email
                    ? `Verify Gmail sending permission for ${cloudUser.email} to send this message.`
                    : 'Sign in with Google to send bills and payment reminders directly from your Gmail.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleReconnectGoogle()}
                disabled={isSigningIn}
                className="inline-flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-[#1f1f1f] border border-[#dadce0] shadow-xs text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <GoogleMarkSvg className="w-4 h-4 shrink-0" />
                <span>{isSigningIn ? 'Connecting...' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-[11px] font-medium">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">
                  Sending from <strong className="font-bold">{cloudUser?.email || 'your Gmail account'}</strong>
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Recipient Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Recipient Email (To) *
            </label>
            <input
              type="email"
              required
              placeholder="customer@example.com"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Subject *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500"
            />
          </div>

          {/* Message Preview & Editable Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Email Message Preview
            </label>
            <textarea
              rows={9}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono text-[12px] leading-relaxed outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 resize-y"
            />
          </div>

          {/* Explicit Confirmation Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <span>
              Please verify the recipient email and amounts above. Clicking <strong>Confirm &amp; Send via Gmail</strong> will immediately send this email from your Gmail account.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSend || isSending}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending via Gmail...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Confirm &amp; Send via Gmail</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
