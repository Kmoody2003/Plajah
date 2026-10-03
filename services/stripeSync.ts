// stripeSync — client for the Elevate Stripe ↔ Finance Hub endpoints (server.ts /api/elevate/stripe/*).
// Money people never key in Stripe numbers: the server pulls payouts + balance transactions through the
// church's connected account and matches them to gifts. Access is verified server-side from the org doc.
import { auth } from './firebase';

export interface StripeSyncSummary { payouts: number; lines: number; giftsAdded: number; mismatches: number }
export interface StripeStatus {
  connected: boolean; accountId?: string;
  chargesEnabled?: boolean; payoutsEnabled: boolean; detailsSubmitted?: boolean; disabledReason?: string | null;
  lastSyncAt: number | null; availableBalance?: number | null; pendingBalance?: number | null;
  nextPayoutEstimate?: { date?: string; amount?: number; status?: string; schedule?: string } | null;
  missingRequirements: string[];
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in required');
  const res = await fetch(path, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(json?.error || `Request failed (${res.status})`); e.code = json?.code; throw e; }
  return json as T;
}

/** Pull payouts + lines from Stripe, backfill missed gifts, post journals. */
export const syncStripeNow = (orgId: string, sinceDays = 90) =>
  call<StripeSyncSummary>('/api/elevate/stripe/sync', { method: 'POST', body: { orgId, sinceDays } });

export const fetchStripeStatus = (orgId: string) =>
  call<StripeStatus>(`/api/elevate/stripe/status?orgId=${encodeURIComponent(orgId)}`);

/** kind 'fix' = Stripe-hosted form that collects whatever is missing; 'dashboard' = Express dashboard login. */
export const getStripeLink = (orgId: string, kind: 'fix' | 'dashboard' = 'fix') =>
  call<{ url: string }>('/api/elevate/stripe/link', { method: 'POST', body: { orgId, kind } }).then(r => r.url);

// ── Auto-sync throttle (once per N minutes per org, shared across tab re-opens) ──
const AUTO_SYNC_MS = 10 * 60_000;
const lastAuto = new Map<string, number>();
const inflight = new Map<string, Promise<StripeSyncSummary | null>>();

/** Debounced sync for "on open": skips if one ran/started within the window. Never throws. */
export function autoSyncStripe(orgId: string, force = false): Promise<StripeSyncSummary | null> {
  const run = inflight.get(orgId);
  if (run) return run;
  if (!force && Date.now() - (lastAuto.get(orgId) || 0) < AUTO_SYNC_MS) return Promise.resolve(null);
  lastAuto.set(orgId, Date.now());
  const p = syncStripeNow(orgId).catch(() => null).finally(() => { inflight.delete(orgId); });
  inflight.set(orgId, p);
  return p;
}

/** Human labels for Stripe's requirement keys (e.g. "external_account", "individual.verification.document"). */
export function describeRequirement(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('external_account')) return 'Add a bank account for payouts';
  if (k.includes('verification.document') || k.includes('verification.additional_document')) return 'Upload an ID document';
  if (k.includes('ssn') || k.includes('id_number')) return 'Confirm a tax / ID number';
  if (k.includes('tos_acceptance')) return 'Accept Stripe’s terms';
  if (k.includes('business_profile')) return 'Complete the organization profile';
  if (k.includes('dob')) return 'Confirm date of birth';
  if (k.includes('address')) return 'Confirm the address';
  if (k.includes('representative') || k.includes('person')) return 'Confirm the account representative';
  return key.replace(/[._]/g, ' ');
}
