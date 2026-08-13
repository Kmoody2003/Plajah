/**
 * sourceVaultService — the vault's storage layer and in-memory key session.
 *
 * Firestore holds only ciphertext:
 *   users/{uid}/vault_meta/config      — salt, KDF params, the two wrapped keys
 *   users/{uid}/vault_records/{id}     — { v, iv, ct, createdAt, updatedAt } and nothing else
 *
 * The session key lives in a module-scoped variable — never localStorage, never
 * IndexedDB — and is dropped on lock(), on an idle timeout, and when the tab is
 * hidden or closed. Firestore security rules restrict both collections to the owner,
 * and even a rules failure only exposes ciphertext.
 */

import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  assessPassphrase,
  createVault,
  isCryptoAvailable,
  openRecord,
  sealRecord,
  unlockWithPassphrase,
  unlockWithRecovery,
  WrongSecretError,
  type Sealed,
  type VaultKdfInfo,
} from './vaultCrypto';
import type { SourceRecord, SourceRecordInput, VaultState } from '../types';

export { WrongSecretError };

/** Auto-lock after this long without the vault being touched. */
const IDLE_LOCK_MS = 5 * 60 * 1000;

interface VaultMeta {
  v: number;
  kdf: VaultKdfInfo;
  salt: string;
  wrappedByPassphrase: Sealed;
  wrappedByRecovery: Sealed;
  createdAt: number;
  updatedAt: number;
}

/* ── Session state (in memory only) ─────────────────────────────────────────── */

let sessionKey: CryptoKey | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(state: VaultState) => void>();

function currentState(hasVault: boolean | 'unknown' = 'unknown'): VaultState {
  return { unlocked: !!sessionKey, exists: hasVault };
}

function emit(hasVault: boolean | 'unknown' = 'unknown') {
  const state = currentState(hasVault);
  listeners.forEach((fn) => {
    try { fn(state); } catch { /* a listener must never break the vault */ }
  });
}

/** Subscribe to lock/unlock changes. Returns an unsubscribe function. */
export function onVaultState(fn: (state: VaultState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isUnlocked(): boolean {
  return !!sessionKey;
}

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lock(), IDLE_LOCK_MS);
}

export function lock(): void {
  sessionKey = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  emit();
}

// Drop the key the moment the tab is backgrounded or closed. A vault left open on a
// screen someone walks away from is the most likely real-world failure.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => lock());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lock();
  });
}

/* ── Firestore paths ────────────────────────────────────────────────────────── */

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to use the vault.');
  return uid;
}

const metaRef = (uid: string) => doc(db, 'users', uid, 'vault_meta', 'config');
const recordsCol = (uid: string) => collection(db, 'users', uid, 'vault_records');
const recordRef = (uid: string, id: string) => doc(db, 'users', uid, 'vault_records', id);

/* ── Meta ───────────────────────────────────────────────────────────────────── */

async function loadMeta(uid: string): Promise<VaultMeta | null> {
  const snap = await getDoc(metaRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as VaultMeta;
}

/** Whether the signed-in user has ever created a vault. */
export async function vaultExists(): Promise<boolean> {
  if (!isCryptoAvailable()) return false;
  try {
    const uid = requireUid();
    const meta = await loadMeta(uid);
    emit(!!meta);
    return !!meta;
  } catch {
    return false;
  }
}

/* ── Setup / unlock ─────────────────────────────────────────────────────────── */

export interface VaultCreation {
  /** Show this to the user exactly once. It is never stored. */
  recoveryCode: string;
}

/**
 * Create the vault. The passphrase never leaves the device. Returns the recovery code
 * to display once. Refuses if a vault already exists (creating a second would orphan
 * every existing record).
 */
export async function setupVault(passphrase: string): Promise<VaultCreation> {
  if (!isCryptoAvailable()) throw new Error('This browser cannot run the vault. Use the Plajah app.');
  // The passphrase is the whole guarantee — enforce real strength, not just length.
  const assessment = assessPassphrase(passphrase);
  if (!assessment.ok) throw new Error(assessment.reason || 'Please choose a stronger passphrase.');
  const uid = requireUid();
  if (await loadMeta(uid)) throw new Error('A vault already exists for this account.');

  const material = await createVault(passphrase);
  const now = Date.now();
  const meta: VaultMeta = {
    v: 1,
    kdf: material.kdf,
    salt: material.salt,
    wrappedByPassphrase: material.wrappedByPassphrase,
    wrappedByRecovery: material.wrappedByRecovery,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(metaRef(uid), meta as unknown as Record<string, unknown>);

  sessionKey = material.sessionKey;
  touch();
  emit(true);
  return { recoveryCode: material.recoveryCode };
}

export async function unlockVault(passphrase: string): Promise<void> {
  const uid = requireUid();
  const meta = await loadMeta(uid);
  if (!meta) throw new Error('No vault to unlock.');
  sessionKey = await unlockWithPassphrase(passphrase, meta.salt, meta.wrappedByPassphrase, meta.kdf.iterations);
  touch();
  emit(true);
}

export async function unlockVaultWithRecovery(recoveryCode: string): Promise<void> {
  const uid = requireUid();
  const meta = await loadMeta(uid);
  if (!meta) throw new Error('No vault to unlock.');
  sessionKey = await unlockWithRecovery(recoveryCode, meta.salt, meta.wrappedByRecovery, meta.kdf.iterations);
  touch();
  emit(true);
}

/* ── Records ────────────────────────────────────────────────────────────────── */

function assertUnlocked(): CryptoKey {
  if (!sessionKey) throw new Error('The vault is locked.');
  touch();
  return sessionKey;
}

/** Decrypt and return every record, newest first. */
export async function listRecords(): Promise<SourceRecord[]> {
  const key = assertUnlocked();
  const uid = requireUid();
  const snap = await getDocs(recordsCol(uid));
  const out: SourceRecord[] = [];
  for (const d of snap.docs) {
    const data = d.data() as { iv?: string; ct?: string; createdAt?: number; updatedAt?: number };
    if (!data.iv || !data.ct) continue;
    try {
      const body = await openRecord<SourceRecordInput>(key, { iv: data.iv, ct: data.ct });
      out.push({ id: d.id, ...body, createdAt: data.createdAt ?? 0, updatedAt: data.updatedAt ?? 0 });
    } catch {
      // A record that will not decrypt is not fatal — surface a placeholder so the
      // user knows it exists rather than silently dropping it.
      out.push({
        id: d.id, codename: '⚠ Could not decrypt', contacts: [], linkedThreadIds: [],
        createdAt: data.createdAt ?? 0, updatedAt: data.updatedAt ?? 0, corrupt: true,
      });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Random doc id — no timestamp embedded, so the id itself leaks nothing about when a
 * source was added. (createdAt/updatedAt are still stored for sorting; a breach adversary
 * learns the count and timeline, which is acceptable for v1 and noted in the audit.)
 */
function newId(): string {
  const r = crypto.getRandomValues(new Uint32Array(4));
  return `src_${Array.from(r, (x) => x.toString(36)).join('')}`;
}

export async function saveRecord(input: SourceRecordInput, id?: string): Promise<string> {
  const key = assertUnlocked();
  const uid = requireUid();
  const recordId = id || newId();
  const sealed = await sealRecord(key, input);
  const now = Date.now();

  // Read existing createdAt so an edit does not reset it. Cheap; records are small.
  let createdAt = now;
  if (id) {
    const existing = await getDoc(recordRef(uid, id));
    if (existing.exists()) createdAt = (existing.data() as { createdAt?: number }).createdAt ?? now;
  }

  await setDoc(recordRef(uid, recordId), {
    v: 1,
    iv: sealed.iv,
    ct: sealed.ct,
    createdAt,
    updatedAt: now,
  });
  return recordId;
}

export async function deleteRecord(id: string): Promise<void> {
  assertUnlocked();
  const uid = requireUid();
  await deleteDoc(recordRef(uid, id));
}
