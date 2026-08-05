// walkieService.ts — the data layer for the two-way: send/receive transmissions, the rolling 5-deep
// ring buffer per sender→receiver (the 6th evicts the oldest), realtime subscription, and the
// hot(≤3)/pinned/blocked relationship prefs. Audio blobs live in Firebase Storage; metadata + the
// ring live in Firestore. Uses the standard Firebase SDK directly (no codebase-specific helpers).

import { db } from '../backendService';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export interface WalkieTransmission {
  id: string;
  pairId: string;
  fromUid: string;
  toUid: string;
  audioUrl: string;
  storagePath: string;
  durationMs: number;
  createdAt: number;
  seq: number;
}
export interface WalkiePrefs { hotUids: string[]; pinnedFromUids: string[]; blockedFromUids: string[]; liveStandby: boolean }
export type Relationship = 'blocked' | 'hot' | 'pinned' | 'normal';

export const MAX_HOT = 3;   // up to 3 hot contacts heard live like a walkie-talkie
export const RING = 5;      // keep the last 5 transmissions per sender→receiver

/** Stable, order-independent channel id for a pair of users. */
export const pairId = (a: string, b: string): string => [a, b].sort().join('__');

// ── Send ─────────────────────────────────────────────────────────────────────────
export async function sendTransmission(fromUid: string, toUid: string, blob: Blob, durationMs: number): Promise<WalkieTransmission> {
  const pid = pairId(fromUid, toUid);
  const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `walkie/${pid}/${id}.webm`;
  const sref = storageRef(getStorage(), path);
  await uploadBytes(sref, blob, { contentType: blob.type || 'audio/webm' });
  const audioUrl = await getDownloadURL(sref);
  const createdAt = Date.now();
  const tx: WalkieTransmission = { id, pairId: pid, fromUid, toUid, audioUrl, storagePath: path, durationMs, createdAt, seq: createdAt };
  await setDoc(doc(db, 'walkieChannels', pid, 'tx', id), tx);
  await evictBeyondRing(pid, fromUid);   // keep only the last RING from this sender
  return tx;
}

/** Delete everything older than the last RING transmissions from a given sender (blob + doc). */
async function evictBeyondRing(pid: string, fromUid: string): Promise<void> {
  // Order by createdAt only (no where+orderBy → no composite index needed), filter sender client-side.
  const snap = await getDocs(query(collection(db, 'walkieChannels', pid, 'tx'), orderBy('createdAt', 'desc')));
  const mine = snap.docs.filter(d => (d.data() as WalkieTransmission).fromUid === fromUid);
  const stale = mine.slice(RING);
  for (const d of stale) {
    const data = d.data() as WalkieTransmission;
    try { await deleteDoc(d.ref); } catch { /* */ }
    if (data.storagePath) { try { await deleteObject(storageRef(getStorage(), data.storagePath)); } catch { /* */ } }
  }
}

// ── Receive ────────────────────────────────────────────────────────────────────────
/** Subscribe to a channel's transmissions (both directions), oldest→newest. */
export function subscribeChannel(pid: string, cb: (txs: WalkieTransmission[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'walkieChannels', pid, 'tx'), orderBy('createdAt', 'asc')),
    snap => cb(snap.docs.map(d => d.data() as WalkieTransmission)),
    err => console.warn('[walkie] subscribe failed:', err),
  );
}

// ── Relationship prefs ──────────────────────────────────────────────────────────────
const emptyPrefs = (): WalkiePrefs => ({ hotUids: [], pinnedFromUids: [], blockedFromUids: [], liveStandby: false });

export async function loadPrefs(uid: string): Promise<WalkiePrefs> {
  try {
    const s = await getDoc(doc(db, 'walkiePrefs', uid));
    const d = s.data() as Partial<WalkiePrefs> | undefined;
    return { hotUids: d?.hotUids ?? [], pinnedFromUids: d?.pinnedFromUids ?? [], blockedFromUids: d?.blockedFromUids ?? [], liveStandby: d?.liveStandby ?? false };
  } catch { return emptyPrefs(); }
}
async function savePrefs(uid: string, prefs: WalkiePrefs): Promise<void> {
  await setDoc(doc(db, 'walkiePrefs', uid), prefs, { merge: true });
}

/** Turn the always-on hot-contact standby channel on/off. */
export async function setLiveStandby(uid: string, on: boolean): Promise<WalkiePrefs> {
  const p = await loadPrefs(uid);
  const next: WalkiePrefs = { ...p, liveStandby: on };
  await savePrefs(uid, next); return next;
}

/** Live subscription to a user's own prefs (so standby reflects hot-list changes immediately). */
export function subscribePrefs(uid: string, cb: (p: WalkiePrefs) => void): () => void {
  return onSnapshot(doc(db, 'walkiePrefs', uid), s => {
    const d = s.data() as Partial<WalkiePrefs> | undefined;
    cb({ hotUids: d?.hotUids ?? [], pinnedFromUids: d?.pinnedFromUids ?? [], blockedFromUids: d?.blockedFromUids ?? [], liveStandby: d?.liveStandby ?? false });
  }, () => cb(emptyPrefs()));
}

/** Add/remove a hot contact (capped at MAX_HOT, most-recent kept). Adding to hot clears block. */
export async function setHot(uid: string, targetUid: string, on: boolean): Promise<WalkiePrefs> {
  const p = await loadPrefs(uid);
  let hotUids = p.hotUids.filter(u => u !== targetUid);
  if (on) { hotUids.unshift(targetUid); hotUids = hotUids.slice(0, MAX_HOT); }
  const next: WalkiePrefs = { ...p, hotUids, blockedFromUids: on ? p.blockedFromUids.filter(u => u !== targetUid) : p.blockedFromUids };
  await savePrefs(uid, next); return next;
}
export async function setPinned(uid: string, targetUid: string, on: boolean): Promise<WalkiePrefs> {
  const p = await loadPrefs(uid);
  const pinnedFromUids = on ? Array.from(new Set([...p.pinnedFromUids, targetUid])) : p.pinnedFromUids.filter(u => u !== targetUid);
  const next: WalkiePrefs = { ...p, pinnedFromUids, blockedFromUids: on ? p.blockedFromUids.filter(u => u !== targetUid) : p.blockedFromUids };
  await savePrefs(uid, next); return next;
}
/** Block a sender (removes them from hot/pinned). */
export async function setBlocked(uid: string, targetUid: string, on: boolean): Promise<WalkiePrefs> {
  const p = await loadPrefs(uid);
  const blockedFromUids = on ? Array.from(new Set([...p.blockedFromUids, targetUid])) : p.blockedFromUids.filter(u => u !== targetUid);
  const next: WalkiePrefs = on
    ? { ...p, hotUids: p.hotUids.filter(u => u !== targetUid), pinnedFromUids: p.pinnedFromUids.filter(u => u !== targetUid), blockedFromUids }
    : { ...p, blockedFromUids };
  await savePrefs(uid, next); return next;
}

/** How should `fromUid`'s incoming transmission be handled, per these prefs? */
export function classify(prefs: WalkiePrefs, fromUid: string): Relationship {
  if (prefs.blockedFromUids.includes(fromUid)) return 'blocked';
  if (prefs.hotUids.includes(fromUid)) return 'hot';
  if (prefs.pinnedFromUids.includes(fromUid)) return 'pinned';
  return 'normal';
}
