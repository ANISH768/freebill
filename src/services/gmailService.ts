import type { Estimate } from '../types';

export interface GmailDraftPayload {
  mode: 'bill' | 'reminder';
  to: string;
  recipientName: string;
  subject: string;
  textBody: string;
  billSerial?: string;
  amountDue?: number;
  grandTotal?: number;
  itemsCount?: number;
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeMimeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  const bytes = new TextEncoder().encode(clean);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildBillEmailDraft(params: {
  estimate: Estimate;
  businessName: string;
  recipientEmail?: string;
}): GmailDraftPayload {
  const { estimate, businessName, recipientEmail = '' } = params;
  const clientName = estimate.clientName || 'Valued Customer';
  const items = Array.isArray(estimate.items) ? estimate.items : [];

  const itemLines = items.map((it, idx) => {
    const qty = Number(it.qty) || 0;
    const rate = Number(it.price) || 0;
    const total = Number(it.total) || qty * rate;
    return `${idx + 1}. ${it.name} — ${qty} ${it.unit || 'Pcs'} x Rs.${rate.toLocaleString('en-IN')} = Rs.${Math.round(total).toLocaleString('en-IN')}`;
  });

  const textLines = [
    `Namaskar ${clientName},`,
    '',
    `Please find your bill summary from ${businessName}:`,
    '',
    `Bill No: ${estimate.serial}`,
    `Date: ${estimate.date}`,
    ...(estimate.dueDate ? [`Due Date: ${estimate.dueDate}`] : []),
    '',
    'Items:',
    ...(itemLines.length > 0 ? itemLines : ['(No itemized rows)']),
    '',
    `Grand Total: Rs.${Math.round(estimate.grandTotal || 0).toLocaleString('en-IN')}`,
    `Paid Amount: Rs.${Math.round(estimate.paidAmount || 0).toLocaleString('en-IN')}`,
    `Balance Due: Rs.${Math.round(estimate.balanceDue || 0).toLocaleString('en-IN')}`,
    `Status: ${estimate.status}`,
    '',
    `Thank you for your business!`,
    businessName,
  ];

  return {
    mode: 'bill',
    to: recipientEmail.trim(),
    recipientName: clientName,
    subject: `Invoice ${estimate.serial} from ${businessName} (Rs.${Math.round(estimate.grandTotal || 0).toLocaleString('en-IN')})`,
    textBody: textLines.join('\n'),
    billSerial: estimate.serial,
    grandTotal: Math.round(estimate.grandTotal || 0),
    amountDue: Math.round(estimate.balanceDue || 0),
    itemsCount: items.length,
  };
}

export function buildReminderEmailDraft(params: {
  clientName: string;
  businessName: string;
  amountDue: number;
  recipientEmail?: string;
  billSerial?: string;
}): GmailDraftPayload {
  const { clientName, businessName, amountDue, recipientEmail = '', billSerial } = params;
  const roundedDue = Math.max(0, Math.round(amountDue || 0));
  const safeName = clientName || 'Valued Customer';

  const textLines = [
    `Namaskar ${safeName},`,
    '',
    billSerial
      ? `This is a friendly payment reminder from ${businessName} regarding Bill ${billSerial}.`
      : `This is a friendly payment reminder from ${businessName} regarding your account statement.`,
    '',
    `Outstanding Balance Due: Rs.${roundedDue.toLocaleString('en-IN')}`,
    '',
    'Kindly arrange the payment at your earliest convenience. Please ignore this email if you have already settled the balance.',
    '',
    'Warm regards,',
    businessName,
  ];

  return {
    mode: 'reminder',
    to: recipientEmail.trim(),
    recipientName: safeName,
    subject: billSerial
      ? `Payment Reminder: Bill ${billSerial} — Rs.${roundedDue.toLocaleString('en-IN')} Due (${businessName})`
      : `Payment Reminder: Rs.${roundedDue.toLocaleString('en-IN')} Outstanding (${businessName})`,
    textBody: textLines.join('\n'),
    billSerial,
    amountDue: roundedDue,
  };
}

export async function sendGmailMessage(
  accessToken: string,
  params: {
    to: string;
    subject: string;
    textBody: string;
    businessName?: string;
  }
): Promise<{ id: string }> {
  const cleanTo = params.to.trim();
  if (!cleanTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTo)) {
    throw new Error('Please enter a valid recipient email address.');
  }

  const boundary = `billsync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const htmlBody = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; color: #1e293b; max-width: 600px; line-height: 1.6;">',
    `<div style="padding: 16px 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; white-space: pre-wrap; font-size: 14px;">${escapeHtml(params.textBody)}</div>`,
    params.businessName
      ? `<p style="margin-top: 12px; font-size: 12px; color: #64748b;">Sent via ${escapeHtml(params.businessName)}</p>`
      : '',
    '</div>',
  ].join('');

  const mimeMessage = [
    `To: ${cleanTo}`,
    `Subject: ${encodeMimeHeader(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const raw = encodeBase64Url(mimeMessage);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new Error('GMAIL_AUTH_EXPIRED');
    }
    throw new Error(errBody?.error?.message || `Gmail send failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  return { id: data.id };
}
