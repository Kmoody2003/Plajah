/**
 * Kith Sightings — client side.
 *
 * Deliberately thin. Every decision that matters (whether a sighting is due,
 * which mascot, what gets logged, what it pays) is made by the server in
 * routes/kithSightings.ts. This file asks and renders; it never decides.
 *
 * The local throttle below is politeness, not security — it keeps us from
 * pestering the API on rapid navigation. Removing it would not let anyone farm
 * anything, because the server's answer for a given window is fixed.
 */
import { auth } from './backendService';
import type {
  KithSpawnResponse, KithClaimResponse, KithSightingLogEntry,
} from './kith/types';

/** Don't ask the server more often than this, however much the user navigates. */
const ASK_THROTTLE_MS = 90 * 1000;
let lastAskedAt = 0;

/** Surfaces we never even ask about — mirrors the server blocklist, fails fast. */
const NEVER_ASK = new Set([
  'CHECKOUT', 'PAYMENT', 'CART', 'BILLING', 'SUBSCRIBE',
  'ASSESSMENT', 'EXAM', 'QUIZ_ACTIVE', 'WORKSHEET_ACTIVE', 'TEST_TAKING',
  'GO_LIVE', 'BROADCASTING', 'STREAM_ACTIVE',
  'SOURCE_VAULT', 'INTIMATE', 'INTIMATE_MODE',
  'WELLBEING', 'ORA_CRISIS', 'CRISIS',
  'CLASS_SESSION_ACTIVE', 'TEACHER_LIVE_CLASS',
]);

async function authedFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    return await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  } catch {
    return null;
  }
}

/**
 * Ask whether a sighting is due on this surface. Call on genuine view changes,
 * not on every render.
 *
 * Returns null when nothing is due, when we're throttled, or on any failure —
 * a missed sighting is always fine and never worth surfacing an error for.
 */
export async function checkForSighting(surface: string): Promise<KithSpawnResponse['sighting']> {
  const view = (surface || '').toUpperCase();
  if (!view || NEVER_ASK.has(view)) return null;

  const now = Date.now();
  if (now - lastAskedAt < ASK_THROTTLE_MS) return null;
  lastAskedAt = now;

  const res = await authedFetch('/api/kith/spawn-check', {
    method: 'POST',
    body: JSON.stringify({ surface: view }),
  });
  if (!res?.ok) return null;
  try {
    const data = (await res.json()) as KithSpawnResponse;
    return data.sighting ?? null;
  } catch {
    return null;
  }
}

/**
 * Log a sighting. Safe to call twice — the server is idempotent and will report
 * `alreadyClaimed` rather than paying out again.
 */
export async function logSighting(sightingId: string): Promise<KithClaimResponse | null> {
  const res = await authedFetch('/api/kith/claim', {
    method: 'POST',
    body: JSON.stringify({ sightingId }),
  });
  if (!res?.ok) return null;
  try {
    return (await res.json()) as KithClaimResponse;
  } catch {
    return null;
  }
}

export async function fetchFieldLog(): Promise<{
  total: number;
  dayCount: number;
  entries: KithSightingLogEntry[];
}> {
  const empty = { total: 0, dayCount: 0, entries: [] as KithSightingLogEntry[] };
  const res = await authedFetch('/api/kith/log', { method: 'GET' });
  if (!res?.ok) return empty;
  try {
    return await res.json();
  } catch {
    return empty;
  }
}

/** Reset the local throttle — for tests and for sign-out. */
export function resetSightingThrottle(): void {
  lastAskedAt = 0;
}
