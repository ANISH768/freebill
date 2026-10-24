import { Estimate, Client } from '../types';

/**
 * Robust, strict matcher to check whether a bill/estimate belongs to a specific client.
 *
 * Prevents cross-customer bill pollution:
 * 1. If an invoice has a valid, non-zero clientId, it MUST strictly match the target client's id.
 * 2. If the invoice has NO clientId (legacy/walk-in), it matches strictly by verified 10-digit phone number.
 * 3. Fallback to exact non-generic customer name ONLY when neither has a foreign client ID
 *    and neither name is a placeholder (like "Cash Sale", "Unknown Client", etc.).
 */
export function isEstimateForClient(
  estimate: Estimate | null | undefined,
  client: (Pick<Client, 'id'> & Partial<Pick<Client, 'name' | 'phone'>>) | null | undefined
): boolean {
  if (!estimate || !client) return false;

  const targetClientId = Number(client.id);

  // Parse estimate's clientId safely
  let estClientId: number | null = null;
  if (
    estimate.clientId !== undefined &&
    estimate.clientId !== null &&
    String(estimate.clientId).trim() !== ''
  ) {
    const parsed = Number(estimate.clientId);
    if (!isNaN(parsed) && parsed > 0) {
      estClientId = parsed;
    }
  }

  // 1. Strict ID Match
  // If the invoice explicitly carries a valid client ID (> 0):
  if (estClientId !== null) {
    if (!isNaN(targetClientId) && targetClientId > 0) {
      return estClientId === targetClientId;
    }
    // If the estimate has a client ID but target doesn't, no match
    return false;
  }

  // 2. Verified 10-digit Mobile Number Match (only if invoice has no foreign clientId)
  const cleanTargetPhone = (client.phone || '').replace(/\D/g, '').slice(-10);
  const cleanEstPhone = (estimate.clientPhone || '').replace(/\D/g, '').slice(-10);

  if (
    cleanTargetPhone.length === 10 &&
    cleanEstPhone.length === 10 &&
    cleanTargetPhone === cleanEstPhone
  ) {
    return true;
  }

  // 3. Exact Name Match (only for non-generic party names)
  const targetName = (client.name || '').trim().toLowerCase();
  const estName = (estimate.clientName || '').trim().toLowerCase();

  const GENERIC_NAMES = new Set([
    '',
    'unknown client',
    'unknown',
    'cash sale',
    'counter sale',
    'walk-in',
    'walk in',
    'walk-in customer',
    'customer',
    'grahak',
    'nakad',
    'cash',
    'retail sale',
    'direct sale'
  ]);

  if (
    targetName &&
    estName &&
    !GENERIC_NAMES.has(targetName) &&
    !GENERIC_NAMES.has(estName)
  ) {
    return targetName === estName;
  }

  return false;
}
