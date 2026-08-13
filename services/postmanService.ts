/**
 * The Post Man — client service.
 *
 * Two halves, deliberately kept apart:
 *
 *   MAIL goes through Plajah's own server (`/api/postman`). OAuth tokens are
 *   held server-side and never reach the browser. The client only ever sees
 *   normalised messages. This is the whole reason the app moved in-house: the
 *   AI Studio applet it replaces ran on a different origin, so it could not read
 *   the Plajah session and stored every user's Gmail tokens under one shared
 *   Firestore document literally named `default_user`.
 *
 *   PREFERENCES go straight to Firestore from the client (users/{uid}/postman_prefs),
 *   because they are small, per-user, and there is no reason to burn a round trip
 *   through the server for "which letter skin did I pick".
 *
 * Small dedicated service rather than more surface on backendService.ts, which
 * is already ~11,000 lines. Same call as Ora and Melos made.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type {
  PostmanAccount,
  PostmanAddress,
  PostmanDraft,
  PostmanLetterSkin,
  PostmanMessage,
  PostmanMessageDetail,
  PostmanPrefs,
} from '../types';

const BASE = '/api/postman';

export const DEFAULT_POSTMAN_PREFS: PostmanPrefs = {
  letterSkin: 'plate',
  focusMode: false,
  updatedAt: 0,
};

/** Thrown for anything the UI should show the user a real sentence about. */
export class PostmanError extends Error {
  constructor(message: string, readonly code?: 'UNCONFIGURED' | 'REAUTH' | 'SIGNED_OUT') {
    super(message);
    this.name = 'PostmanError';
  }
}

/* ── Transport ────────────────────────────────────────────────────────────── */

/**
 * Authenticated fetch against the Postman API.
 *
 * Retries once with a force-refreshed ID token on a 401. Plajah supports hot
 * account switching, and a cached token belonging to the previously active
 * account is a known failure mode here — it is what made film uploads fail with
 * STORAGE/UNAUTHORIZED. One forced refresh is cheaper than making every call pay
 * for `getIdToken(true)`.
 */
async function callApi<T>(path: string, init: RequestInit = {}, forceRefresh = false): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new PostmanError('Sign in to read your mail.', 'SIGNED_OUT');

  const token = await user.getIdToken(forceRefresh);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401 && !forceRefresh) return callApi<T>(path, init, true);

  if (!res.ok) {
    // The server answers with JSON errors; fall back to the status if it did not.
    const body = await res.json().catch(() => null) as { error?: string; configured?: boolean; code?: string } | null;
    const message = body?.error || `Request failed (${res.status})`;
    if (res.status === 503 || body?.configured === false) throw new PostmanError(message, 'UNCONFIGURED');
    if (body?.code === 'REAUTH') throw new PostmanError(message, 'REAUTH');
    throw new PostmanError(message);
  }

  return res.json() as Promise<T>;
}

/* ── Accounts ─────────────────────────────────────────────────────────────── */

/** Whether mail is set up on this deployment at all. Unauthenticated on purpose:
 *  the empty state needs to know before the user has done anything. */
export async function getPostmanStatus(): Promise<{ googleConfigured: boolean; microsoftConfigured: boolean }> {
  try {
    const res = await fetch(`${BASE}/status`);
    if (!res.ok) return { googleConfigured: false, microsoftConfigured: false };
    return await res.json();
  } catch {
    return { googleConfigured: false, microsoftConfigured: false };
  }
}

export async function listAccounts(): Promise<PostmanAccount[]> {
  const { accounts } = await callApi<{ accounts: PostmanAccount[] }>('/accounts');
  return accounts ?? [];
}

/**
 * Opens Google's consent screen in a popup and resolves when the server's
 * callback page reports back.
 *
 * The popup is opened SYNCHRONOUSLY, before the await, because Safari and every
 * mobile browser block a window opened from a promise continuation — the user
 * gesture is gone by then. We open it blank and navigate it once we have the URL.
 */
export function connectGoogleAccount(): Promise<{ email: string }> {
  const popup = window.open('', 'plajah_postman_oauth', 'width=540,height=680');
  if (!popup) {
    return Promise.reject(new PostmanError('Your browser blocked the sign-in window. Allow pop-ups for Plajah and try again.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closedTimer);
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      // Same-origin only: the callback page is served by our own server.
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; ok?: boolean; email?: string; error?: string } | null;
      if (!data || data.type !== 'PLAJAH_POSTMAN_OAUTH') return;
      if (data.ok && data.email) finish(() => resolve({ email: data.email as string }));
      else finish(() => reject(new PostmanError(data.error || 'Could not connect that account.')));
    };
    window.addEventListener('message', onMessage);

    // If the user closes the popup themselves, stop waiting rather than hanging
    // on a promise that will never settle.
    const closedTimer = window.setInterval(() => {
      if (popup.closed) finish(() => reject(new PostmanError('Sign-in was cancelled.')));
    }, 600);

    callApi<{ url: string }>('/auth/google/url')
      .then(({ url }) => { popup.location.href = url; })
      .catch((err) => finish(() => { try { popup.close(); } catch { /* already gone */ } reject(err); }));
  });
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await callApi(`/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
}

/* ── Mail ─────────────────────────────────────────────────────────────────── */

export interface MessageListResult {
  messages: PostmanMessage[];
  /** True when the user has connected nothing yet — an empty state, not an error. */
  noAccounts?: boolean;
}

export async function listMessages(accountId?: string, limit = 25): Promise<MessageListResult> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (accountId) params.set('accountId', accountId);
  const res = await callApi<{ messages: PostmanMessage[]; noAccounts?: boolean }>(`/messages?${params}`);
  return { messages: res.messages ?? [], noAccounts: res.noAccounts };
}

export async function getMessage(id: string, accountId: string): Promise<PostmanMessageDetail> {
  const { message } = await callApi<{ message: PostmanMessageDetail }>(
    `/messages/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`,
  );
  return message;
}

export async function setMessageRead(id: string, accountId: string, read: boolean): Promise<void> {
  await callApi(`/messages/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    body: JSON.stringify({ accountId, read }),
  });
}

export async function setMessageStarred(id: string, accountId: string, starred: boolean): Promise<void> {
  await callApi(`/messages/${encodeURIComponent(id)}/star`, {
    method: 'POST',
    body: JSON.stringify({ accountId, starred }),
  });
}

export async function sendLetter(draft: PostmanDraft): Promise<{ id: string }> {
  const { id } = await callApi<{ ok: boolean; id: string }>('/send', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
  return { id };
}

/* ── Assist ───────────────────────────────────────────────────────────────── */

/**
 * Rewrites a draft more clearly, through Plajah's server-side Gemini proxy.
 *
 * The applet this replaces called Gemini straight from the browser with an API
 * key that Vite compiled into the client bundle. `/api/ai/gemini` already exists,
 * already requires a Plajah session, and keeps the key on the server — there is
 * no reason for a second path.
 *
 * Returns null when the model gives nothing usable, so the caller leaves the
 * user's own words alone rather than replacing them with an empty string.
 */
export async function polishLetterText(text: string): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) throw new PostmanError('Sign in first.', 'SIGNED_OUT');
  if (!text.trim()) return null;

  const token = await user.getIdToken();
  const res = await fetch('/api/ai/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      contents:
        'Rewrite this email so it reads clearly and professionally. Keep the author\'s meaning, ' +
        'facts and intent exactly; do not invent details, do not add a greeting or sign-off that ' +
        'is not already there, and keep it about the same length. Reply with the rewritten plain ' +
        `text only — no preamble, no markdown, no quotes.\n\n${text}`,
    }),
  });

  if (res.status === 503) throw new PostmanError('Writing help is not configured on this server.', 'UNCONFIGURED');
  if (!res.ok) throw new PostmanError('Could not rewrite that just now.');

  const { text: out } = (await res.json()) as { text?: string };
  const cleaned = (out ?? '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/* ── Preferences ──────────────────────────────────────────────────────────── */

const prefsPath = (uid: string) => doc(db, 'users', uid, 'postman_prefs', 'settings');

export async function loadPrefs(): Promise<PostmanPrefs> {
  const uid = auth.currentUser?.uid;
  if (!uid) return DEFAULT_POSTMAN_PREFS;
  try {
    const snap = await getDoc(prefsPath(uid));
    if (!snap.exists()) return DEFAULT_POSTMAN_PREFS;
    return { ...DEFAULT_POSTMAN_PREFS, ...(snap.data() as Partial<PostmanPrefs>) };
  } catch {
    // Preferences are a nicety. Losing them must never stop the mail loading.
    return DEFAULT_POSTMAN_PREFS;
  }
}

export async function savePrefs(patch: Partial<Omit<PostmanPrefs, 'updatedAt'>>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    // Every field is defined here — Firestore throws on an undefined value, and
    // that failure is silent enough to look like the write simply not happening.
    const clean: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
    await setDoc(prefsPath(uid), clean, { merge: true });
  } catch (err) {
    console.warn('[Postman] preference save failed:', err);
  }
}

/* ── Presentation helpers ─────────────────────────────────────────────────── */

export const LETTER_SKINS: { id: PostmanLetterSkin; label: string; description: string }[] = [
  { id: 'plate', label: 'Plate', description: 'Serif on the platform ground. Matches the chrome exactly.' },
  { id: 'ink',   label: 'Ink',   description: 'Warmer black, rose marginalia. The original editorial page.' },
  { id: 'void',  label: 'Void',  description: 'Paper white, wide margins. For long drafting.' },
  { id: 'brute', label: 'Brute', description: 'Monospace, hard edges, no radius.' },
];

/** "Rowan Adeyemi" from an address, falling back to the local part. */
export function displayNameFor(addr: PostmanAddress | undefined): string {
  if (!addr) return 'Unknown sender';
  if (addr.name && addr.name.trim()) return addr.name.trim();
  return addr.email?.split('@')[0] || 'Unknown sender';
}

/** Two letters for an avatar, from a name or an address. */
export function initialsFor(addr: PostmanAddress | undefined): string {
  const name = displayNameFor(addr);
  const parts = name.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Relative time for the list, absolute once it stops being useful.
 * Mail lists live or die on this column being scannable.
 */
export function formatMailTime(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.round(diffMs / 60000);

  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;

  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) return then.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const days = Math.floor(diffMs / 86400000);
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'short' });
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return then.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** Splits a comma/semicolon separated recipient field into addresses. */
export function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
