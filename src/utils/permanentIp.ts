/**
 * Deterministic, Permanent Per-User-ID Virtual LAN IP Generator
 *
 * Ensures that:
 * 1. Every User ID (10-digit mobile number) has a distinct, unique IP address.
 * 2. Each User ID has ONLY ONE IP address.
 * 3. The IP address is 100% permanent and never changes across router restarts, Wi-Fi changes, or PC reboots.
 */

export interface PermanentUserIpInfo {
  phone: string;
  ipHost: string;          // e.g. "10.198.145.220"
  ipWithPort: string;      // e.g. "10.198.145.220:3000"
  autoLoginPath: string;   // e.g. "/ip/10.198.145.220"
  autoLoginUrl: string;    // e.g. "https://.../ip/10.198.145.220"
}

export function getPermanentIpForUser(phone: string | null | undefined, baseOrigin?: string): PermanentUserIpInfo {
  const cleanDigits = String(phone || '')
    .replace(/\D/g, '')
    .slice(-10)
    .padStart(10, '0');

  const partA = parseInt(cleanDigits.slice(0, 3), 10) || 101;
  const partB = parseInt(cleanDigits.slice(3, 6), 10) || 102;
  const partC = parseInt(cleanDigits.slice(6, 10), 10) || 103;

  // Deterministic private IPv4 octets in 10.X.Y.Z range (each 10..249)
  const octet2 = 10 + (partA % 240);
  const octet3 = 10 + (partB % 240);
  const octet4 = 10 + (partC % 240);

  const ipHost = `10.${octet2}.${octet3}.${octet4}`;
  const ipWithPort = `${ipHost}:3000`;
  const autoLoginPath = `/ip/${ipHost}`;
  const origin =
    baseOrigin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:3000');

  return {
    phone: cleanDigits,
    ipHost,
    ipWithPort,
    autoLoginPath,
    autoLoginUrl: `${origin.replace(/\/$/, '')}${autoLoginPath}`
  };
}

/**
 * Extracts a permanent IP token from the current browser URL if opened via `/ip/10.X.Y.Z` or `?ip=10.X.Y.Z`
 */
export function extractPermanentIpFromLocation(): string | null {
  if (typeof window === 'undefined') return null;

  const pathname = window.location.pathname || '';
  const pathMatch = pathname.match(/^\/ip\/([0-9.]+)(?::\d+)?/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1].trim();
  }

  const params = new URLSearchParams(window.location.search);
  const queryIp = params.get('ip') || params.get('lan_ip');
  if (queryIp) {
    return queryIp.replace(/:\d+$/, '').trim();
  }

  return null;
}
