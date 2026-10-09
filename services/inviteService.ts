// inviteService — personal invite links (plajah.com/join/:code). Server: services/socialMigrationServer.ts.
//
//   getMyInvite()            → { code, url, redeemedCount } (created on first call; one code per user)
//   shareMyInvite()          → native share sheet / clipboard with "<name> invited you to Plajah" card link
//   initInviteRedemption()   → index.tsx calls this only when a /join/ code is pending. Once the visitor is
//                              signed in with a NEW account (server checks ≤7 days old, never your own code,
//                              one redemption per account) it redeems: both follow each other (private
//                              accounts get a follow request instead) and the inviter's invitedCount ticks up.
//
// The code is stashed by index.html's inline boot script (path /join/:code) or here (?join=code), so it
// survives the sign-up flow, OAuth redirects and reloads.
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { isInviteCode, INVITE_REDEEM_WINDOW_MS } from './socialPerfCore';

const STASH_KEY = 'plajah_invite_code';
export const INVITE_REDEEMED_EVENT = 'plajah:invite-redeemed';

export interface MyInvite { code: string; url: string; redeemedCount: number }

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first');
  const token = await u.getIdToken();
  return fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
}

export async function getMyInvite(): Promise<MyInvite | null> {
  try {
    const r = await authed('/api/invite/me');
    if (!r.ok) return null;
    return await r.json() as MyInvite;
  } catch { return null; }
}

/** Opens the share sheet (or copies). Returns 'shared' | 'copied' | 'failed'. */
export async function shareMyInvite(): Promise<'shared' | 'copied' | 'failed'> {
  const inv = await getMyInvite();
  if (!inv) return 'failed';
  const text = 'Come hang out with me on Plajah — we\'ll follow each other automatically.';
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share({ title: 'Join me on Plajah', text, url: inv.url });
      return 'shared';
    }
  } catch (e: any) { if (e?.name === 'AbortError') return 'failed'; }
  try { await navigator.clipboard.writeText(inv.url); return 'copied'; } catch { return 'failed'; }
}

function readStash(): string | null {
  try {
    const raw = localStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: string; at?: number };
    if (!isInviteCode(v?.code) || !v.at || Date.now() - v.at > INVITE_REDEEM_WINDOW_MS) { localStorage.removeItem(STASH_KEY); return null; }
    return v.code;
  } catch { return null; }
}
const clearStash = () => { try { localStorage.removeItem(STASH_KEY); } catch { /* */ } };

/** ?join=code → stash it and drop the param from the address bar. */
export function captureInviteFromUrl(): void {
  try {
    const sp = new URLSearchParams(window.location.search);
    const code = (sp.get('join') || '').toLowerCase();
    if (!code) return;
    if (isInviteCode(code)) localStorage.setItem(STASH_KEY, JSON.stringify({ code, at: Date.now() }));
    sp.delete('join');
    const q = sp.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
  } catch { /* */ }
}

let inFlight = false;
let retries = 0;
/** Redeem the stashed code for the signed-in user (no-op when nothing is pending). */
export async function redeemPendingInvite(): Promise<void> {
  const code = readStash();
  const u = auth.currentUser;
  if (!code || !u || u.isAnonymous || inFlight) return;
  inFlight = true;
  try {
    const r = await authed('/api/invite/redeem', { method: 'POST', body: JSON.stringify({ code }) });
    if (r.status === 429 || r.status >= 500) return; // transient — keep the stash, retry next sign-in
    const j = await r.json().catch(() => ({})) as { ok?: boolean; reason?: string; inviter?: { uid: string; displayName: string } };
    if (j.reason === 'profile_pending') { // sign-up still writing the profile — try again shortly
      if (retries++ < 4) setTimeout(() => { void redeemPendingInvite(); }, 10_000);
      return;
    }
    clearStash(); // terminal either way: redeemed, own code, not a new account, already redeemed, bad code
    if (j.ok) window.dispatchEvent(new CustomEvent(INVITE_REDEEMED_EVENT, { detail: j.inviter }));
  } catch { /* network — keep the stash */ }
  finally { inFlight = false; }
}

let started = false;
export function initInviteRedemption(): void {
  if (started) return;
  started = true;
  captureInviteFromUrl();
  if (!readStash()) return;
  const unsub = onAuthStateChanged(auth, (user) => {
    if (!user || user.isAnonymous) return;
    void redeemPendingInvite().then(() => { if (!readStash()) unsub(); });
  });
}
