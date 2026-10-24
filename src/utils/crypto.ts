// Web Crypto API helpers for AES-GCM encryption, HMAC bill signatures, and backup encryption

const APP_HMAC_SECRET = 'BILL_SYNC_OFFLINE_SECRET_2026_KEY';

/**
 * Derives a CryptoKey for AES-GCM from a passphrase or default key
 */
async function deriveAESKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('OfflineBillingSalt2026'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts plain text or JSON object using AES-GCM
 */
export async function encryptData(data: unknown, passphrase = 'SessionEncryptionKey2026'): Promise<string> {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const enc = new TextEncoder();
    const key = await deriveAESKey(passphrase);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(text)
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Convert to Base64
    let binary = '';
    for (let i = 0; i < combined.byteLength; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.warn("Encryption failed, returning fallback string:", err);
    return typeof data === 'string' ? data : JSON.stringify(data);
  }
}

/**
 * Decrypts AES-GCM encrypted base64 string back to plaintext/object
 */
export async function decryptData<T = any>(encryptedBase64: string, passphrase = 'SessionEncryptionKey2026'): Promise<T | null> {
  try {
    const binary = atob(encryptedBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const iv = bytes.slice(0, 12);
    const dataBytes = bytes.slice(12);

    const key = await deriveAESKey(passphrase);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBytes
    );

    const dec = new TextDecoder();
    const plainText = dec.decode(decrypted);

    try {
      return JSON.parse(plainText) as T;
    } catch {
      return plainText as unknown as T;
    }
  } catch (err) {
    console.warn("Decryption failed:", err);
    return null;
  }
}

/**
 * Generates an HMAC-SHA256 signature for an invoice to detect tampering
 */
export async function generateInvoiceSignature(serial: string, date: string, grandTotal: number, clientId: number): Promise<string> {
  try {
    const enc = new TextEncoder();
    const message = `${serial}|${date}|${grandTotal.toFixed(2)}|${clientId}`;
    const key = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(APP_HMAC_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', key, enc.encode(message));
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return `SIG-${serial}-${Date.now()}`;
  }
}

/**
 * Verifies an invoice HMAC signature
 */
export async function verifyInvoiceSignature(serial: string, date: string, grandTotal: number, clientId: number, expectedSignature: string): Promise<boolean> {
  if (!expectedSignature) return false;
  const computed = await generateInvoiceSignature(serial, date, grandTotal, clientId);
  return computed === expectedSignature;
}

/**
 * Requests browser persistent storage access to prevent auto-deletion
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      const result = await navigator.storage.persist();
      console.log(`Persistent storage granted: ${result}`);
      return result;
    }
    return true;
  }
  return false;
}
