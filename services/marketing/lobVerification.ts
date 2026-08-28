// ─── Marketing — Lob address verification (client) ───────────────────────────
// The one Local Reach vendor with a genuinely public, key-only API — no partner
// agreement needed (unlike Taradel/DOOH). Calls the server proxy in server.ts
// (POST /api/marketing/verify-address[-batch]); the API key never reaches the
// client. Degrades gracefully to `configured: false` when LOB_API_KEY isn't set
// server-side — callers should fall back to the raw/model count, not error out.
//
// See docs/MARKETING_LOCAL_REACH_SPEC.md §3 and services/marketing/reachEstimateService.ts.

import { auth } from '../firebase';

export interface MailAddress {
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

export interface AddressVerification {
  configured: boolean;
  deliverable?: boolean;
  deliverability?: string;
  error?: string;
}

export interface BatchVerification {
  configured: boolean;
  total?: number;
  deliverableCount?: number;
  results?: AddressVerification[];
  error?: string;
}

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 503) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export async function verifyAddress(address: MailAddress): Promise<AddressVerification> {
  return authedPost<AddressVerification>('/api/marketing/verify-address', { address });
}

/** Verifies up to 100 addresses in one call — used to turn an uploaded audience
 *  list's raw row count into a Lob-verified deliverable count before it's saved
 *  as a campaign's AudienceList.count. Returns `{configured:false}` (not a
 *  thrown error) when LOB_API_KEY isn't set server-side, so callers can fall
 *  back to the raw count without a try/catch dance. */
export async function verifyAddressBatch(addresses: MailAddress[]): Promise<BatchVerification> {
  if (!addresses.length) return { configured: false, error: 'No addresses supplied' };
  return authedPost<BatchVerification>('/api/marketing/verify-address-batch', { addresses });
}
