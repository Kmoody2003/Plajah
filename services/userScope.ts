// One browser, many accounts. Whatever this device keeps for a person lives under their uid, so the
// next account on a shared computer finds nothing of theirs and they get it all back when they return.
//
// Old stores had no uid. A row or value moves into an account only when it proves it belongs there
// (the owner field matches, or the cloud lists it under this uid). Anything else stays on the device,
// unread, so no unsynced work is ever destroyed. See services/hqScopeWall.ts for the same rule in HQ.

import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { auth } from './firebase';

/** The one spelling of a per-account key. No uid means the signed-out guest's own space. */
export const userScopedKey = (uid: string | null | undefined, name: string) => `plajah:u:${uid || 'guest'}:${name}`;

let pageUid: string | null = null;

/**
 * Whose space this page is working in. An editor can still save in the moment between sign-out and
 * the page reload that follows it; that save lands with the person who wrote it, never with a guest.
 */
export function activeScopeUid(): string | null {
  const u = auth.currentUser as { uid: string; isAnonymous?: boolean } | null;
  if (u?.uid && !u.isAnonymous) pageUid = u.uid;
  return pageUid;
}

export const scopedKey = (name: string) => userScopedKey(activeScopeUid(), name);

/** Waits for Firebase to restore the session, so a page never reads a guest's list by mistake. */
export async function whenAuthKnown(timeoutMs = 5000): Promise<void> {
  const ready = (auth as { authStateReady?: () => Promise<void> }).authStateReady;
  if (typeof ready !== 'function') return;
  await Promise.race([ready.call(auth).catch(() => {}), new Promise<void>(r => setTimeout(r, timeoutMs))]);
}

// ── Moving old rows in ───────────────────────────────────────────────────────

/** Moves the rows this account proves it owns out of an old shared list. The rest stay where they were. */
export function adoptOwnedRows<T>(legacyKey: string, targetKey: string, isMine: (row: T) => boolean): void {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return;
    const mine = (rows as T[]).filter(isMine);
    if (!mine.length) return;
    const current = JSON.parse(localStorage.getItem(targetKey) || '[]');
    const merged = [...(Array.isArray(current) ? current : []), ...mine];
    localStorage.setItem(targetKey, JSON.stringify(merged)); // written first: a failure here loses nothing
    const rest = (rows as T[]).filter(r => !isMine(r));
    if (rest.length) localStorage.setItem(legacyKey, JSON.stringify(rest));
    else localStorage.removeItem(legacyKey);
  } catch { /* corrupt or blocked storage: the old copy stays as it was */ }
}

/** Moves a whole old value into an account, unless the account already has its own copy. */
export function adoptOwnedValue(legacyKey: string, targetKey: string): void {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (raw == null || localStorage.getItem(targetKey) != null) return;
    localStorage.setItem(targetKey, raw);
    localStorage.removeItem(legacyKey);
  } catch { /* blocked storage */ }
}

/** The same move in IndexedDB. Returns whether the account now has the value. */
export async function adoptOwnedIdbValue(legacyKey: string, targetKey: string): Promise<boolean> {
  try {
    if ((await idbGet(targetKey)) !== undefined) return true;
    const value = await idbGet(legacyKey);
    if (value === undefined) return false;
    await idbSet(targetKey, value);
    await idbDel(legacyKey);
    return true;
  } catch {
    return false;
  }
}

// ── Sign-out ─────────────────────────────────────────────────────────────────

type SignOutTask = () => void | Promise<unknown>;
const beforeSignOut = new Set<SignOutTask>();

/** Open editors register here: unsaved edits are written while the account is still signed in. */
export function onBeforeSignOut(task: SignOutTask): () => void {
  beforeSignOut.add(task);
  return () => { beforeSignOut.delete(task); };
}

export async function runBeforeSignOut(timeoutMs = 2500): Promise<void> {
  const work = Promise.all([...beforeSignOut].map(async t => { try { await t(); } catch { /* the others still run */ } }));
  await Promise.race([work, new Promise<void>(r => setTimeout(r, timeoutMs))]);
}

/**
 * Pointers and tokens from before this scoping, with no owner on them. They are sign-in state rather
 * than anyone's work, and the next person must not inherit them.
 */
const LEGACY_ACCOUNT_POINTERS = ['plajah:activeOrgId', 'plajah_audius_session', 'plajah_hub_token', 'plajah_hub_url'];

/** Clears what must not outlive a session. Per-account stores stay, waiting for their owner. */
export function purgeAccountResidue(): void {
  try { for (const k of LEGACY_ACCOUNT_POINTERS) localStorage.removeItem(k); } catch { /* blocked storage */ }
  try { sessionStorage.clear(); } catch { /* blocked storage */ }
}

function restartPage(): void {
  try {
    if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
  } catch { /* no page to reload */ }
}

let lastRealUid: string | null = null;
let signingOut = false;

/** Called by logout around signOut: logout does the purge and restart itself, once its own work is done. */
export function markSigningOut(on: boolean): void { signingOut = on; }

/** Sign-out finished: nothing of the last account stays in this page's memory. */
export function finishSignOut(): void {
  purgeAccountResidue();
  restartPage();
}

/**
 * Every account change, including an expired session or a switch that skipped logout. A reload is the
 * only reset that reaches every module cache and open editor. Guest to account needs none.
 */
export function noteAuthUser(user: { uid: string; isAnonymous?: boolean } | null): void {
  const next = user && !user.isAnonymous ? user.uid : null;
  const prev = lastRealUid;
  if (next) { lastRealUid = next; pageUid = next; }
  if (!prev || prev === next) return;
  lastRealUid = next;
  if (signingOut) return;
  purgeAccountResidue();
  setTimeout(restartPage, 250); // lets a just-finished sign-in write its profile first
}

if (typeof window !== 'undefined' && typeof auth.onAuthStateChanged === 'function') {
  auth.onAuthStateChanged(u => noteAuthUser(u));
}

/** Tests only: the page reload that would have emptied this module. */
export function forgetPageAccountForTests(): void { pageUid = null; lastRealUid = null; signingOut = false; }
