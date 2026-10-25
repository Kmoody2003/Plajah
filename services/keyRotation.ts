/**
 * Key rotation — the registry of third-party credentials that expire on a schedule, and the pure
 * countdown math the admin dashboard shows.
 *
 * Why this exists: some keys simply stop working after a fixed time (the SAM.gov API key expires
 * after 90 days). Nothing warns you; the feature just goes dark. So an admin records the day a key was
 * rotated, and the dashboard counts down to the day it must be rotated again.
 *
 * What is stored: only the DATE a key was rotated, who recorded it, and when the platform last saw
 * the provider reject the key. The key itself is never read, logged or stored here.
 */

export interface TrackedKey {
  id: string;
  label: string;
  /** What this key powers, so an admin knows what breaks if it lapses. */
  powers: string;
  intervalDays: number;
  /** Server environment variable that holds it (name only). */
  envVar: string;
  /** Where the replacement is created. */
  rotateUrl: string;
  steps: string[];
}

export const TRACKED_KEYS: TrackedKey[] = [
  {
    id: 'sam_gov',
    label: 'SAM.gov API key',
    powers: 'Contracts & loans: federal contract opportunities for small businesses (Elevate → Grants).',
    intervalDays: 90,
    envVar: 'SAM_GOV_API_KEY',
    rotateUrl: 'https://sam.gov',
    steps: [
      'Sign in to SAM.gov and open your profile menu → Account Details.',
      'Generate a new API key and copy it right away (it is only shown once).',
      'Set SAM_GOV_API_KEY to the new value: in .env.local for development, and in the production server environment.',
      'Restart or redeploy the server so it reads the new value.',
      'Run one search in Contracts & loans to confirm it works, then press "I rotated it" below.',
    ],
  },
];

export const KEY_BY_ID: Record<string, TrackedKey> = Object.fromEntries(TRACKED_KEYS.map(k => [k.id, k]));

export type KeyState = 'unknown' | 'ok' | 'soon' | 'urgent' | 'overdue';

export interface KeyStatus {
  state: KeyState;
  /** When it lapses (ms), once we know when it was rotated. */
  dueAt?: number;
  /** Whole days remaining; negative once overdue. */
  daysLeft?: number;
  ageDays?: number;
}

const DAY = 86_400_000;
/** Reminders begin two weeks out, and escalate in the final three days. */
export const SOON_DAYS = 14;
export const URGENT_DAYS = 3;

export function keyStatus(rotatedAt: number | undefined, intervalDays: number, now = Date.now()): KeyStatus {
  if (!rotatedAt || !Number.isFinite(rotatedAt)) return { state: 'unknown' };
  const dueAt = rotatedAt + intervalDays * DAY;
  const daysLeft = Math.ceil((dueAt - now) / DAY);
  const ageDays = Math.floor((now - rotatedAt) / DAY);
  const state: KeyState = daysLeft < 0 ? 'overdue' : daysLeft <= URGENT_DAYS ? 'urgent' : daysLeft <= SOON_DAYS ? 'soon' : 'ok';
  return { state, dueAt, daysLeft, ageDays };
}

/**
 * Validate a rotation date from an admin. It cannot be in the future (that would silently extend
 * the countdown) or more than a year back (almost certainly a typo).
 */
export function parseRotationDate(input: unknown, now = Date.now()): number | null {
  if (input === undefined || input === null || input === '') return now;
  const t = typeof input === 'number' ? input : Date.parse(String(input));
  if (!Number.isFinite(t)) return null;
  if (t > now + DAY) return null;          // one day of slack for time zones
  if (t < now - 366 * DAY) return null;
  return Math.min(t, now);
}

/** The worst state across all tracked keys — what the dashboard banner keys off. */
export function worstState(states: KeyState[]): KeyState {
  const order: KeyState[] = ['overdue', 'urgent', 'soon', 'unknown', 'ok'];
  return order.find(s => states.includes(s)) || 'ok';
}
