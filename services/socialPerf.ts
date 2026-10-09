// socialPerf — Firestore-bound helpers for the social performance pass (see docs/SOCIAL_MIGRATION_AND_PERF.md).
//   • snapshotWithIndexFallback: run the ordered/limited query; if Firestore says the composite index is
//     missing (failed-precondition — index not deployed yet), quietly fall back to the legacy query.
//   • message paging: live window = last N messages (limitToLast) + "load earlier" pages via endBefore(cursor).
//   • typing indicator: chat_rooms/{id}/meta/typing { users: { uid: lastTypedAtMs } }, throttled to ≤1 write/3s,
//     so typing no longer rewrites the room doc (which re-fired every participant's room-list listener).
// Imports only ./firebase (never backendService) so backendService can import this without a cycle.
import {
  collection, doc, query, orderBy, limitToLast, endBefore, getDocs, onSnapshot as rawOnSnapshot,
  setDoc, updateDoc, deleteField, arrayUnion, arrayRemove,
  type Query, type DocumentData, type QuerySnapshot, type QueryDocumentSnapshot, type FirestoreError,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { shouldSendTyping, activeTypers, type TypingSendState, TYPING_TTL_MS } from './socialPerfCore';

export const MESSAGE_PAGE_SIZE = 60;

const safeSnapshot = (q: Query<DocumentData>, next: (s: QuerySnapshot<DocumentData>) => void, err: (e: FirestoreError) => void): (() => void) => {
  try { return rawOnSnapshot(q, next, err); } catch (e) {
    console.warn('[socialPerf] snapshot subscription failed:', (e as Error)?.message?.slice(0, 200));
    return () => {};
  }
};

/**
 * Subscribe to `primary`; if it fails because its composite index isn't built/deployed yet, re-subscribe to
 * `fallback` (the old query) so the feature keeps working until `firebase deploy --only firestore:indexes`.
 */
export function snapshotWithIndexFallback(
  primary: Query<DocumentData>,
  fallback: Query<DocumentData> | null,
  onNext: (snap: QuerySnapshot<DocumentData>, usedFallback: boolean) => void,
  onError?: (e: FirestoreError) => void,
  label = 'query',
): () => void {
  let stopped = false;
  let unsub = safeSnapshot(primary, s => onNext(s, false), (e) => {
    if (!stopped && fallback && e?.code === 'failed-precondition') {
      console.warn(`[socialPerf] ${label}: composite index missing — using unordered fallback until indexes deploy`);
      unsub = safeSnapshot(fallback, s => onNext(s, true), (e2) => onError?.(e2));
      return;
    }
    onError?.(e);
  });
  return () => { stopped = true; unsub(); };
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface MessageWindowMeta {
  /** true when the window is full, i.e. there are (probably) older messages to page in. */
  hasMore: boolean;
  /** cursor for fetchEarlierMessages — the oldest doc in the window. */
  cursor: QueryDocumentSnapshot<DocumentData> | null;
}

/** Live window: the newest `pageSize` messages of a room, ascending. */
export function listenToRecentMessages<T = any>(
  roomId: string,
  cb: (messages: T[], meta: MessageWindowMeta) => void,
  pageSize = MESSAGE_PAGE_SIZE,
  onError?: (e: FirestoreError) => void,
): () => void {
  const q = query(collection(db, 'chat_rooms', roomId, 'messages'), orderBy('timestamp', 'asc'), limitToLast(pageSize));
  return safeSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as T)), { hasMore: snap.size >= pageSize, cursor: snap.docs[0] ?? null });
  }, e => onError?.(e));
}

/** One page of messages older than `cursor` (ascending). */
export async function fetchEarlierMessages<T = any>(
  roomId: string,
  cursor: QueryDocumentSnapshot<DocumentData>,
  pageSize = MESSAGE_PAGE_SIZE,
): Promise<{ messages: T[]; hasMore: boolean; cursor: QueryDocumentSnapshot<DocumentData> | null }> {
  const q = query(collection(db, 'chat_rooms', roomId, 'messages'), orderBy('timestamp', 'asc'), endBefore(cursor), limitToLast(pageSize));
  const snap = await getDocs(q);
  return {
    messages: snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as T)),
    hasMore: snap.size >= pageSize,
    cursor: snap.docs[0] ?? cursor,
  };
}

// ─── Typing ──────────────────────────────────────────────────────────────────

const typingSent = new Map<string, TypingSendState>();
// If the typing subdoc rule isn't deployed yet, writes are denied — fall back to the legacy room-doc field
// (still throttled) for the rest of the session instead of failing every keystroke.
let typingSubdocDenied = false;
const typingRef = (roomId: string) => doc(db, 'chat_rooms', roomId, 'meta', 'typing');

/**
 * Set/clear "typing" for the signed-in user. Safe to call on every keystroke: at most one write per 3s while
 * typing, and one immediate "stopped" write (only if we had said "typing"). Never throws.
 */
export async function setTypingStatus(roomId: string, isTyping: boolean, now = Date.now()): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !roomId) return;
  const key = `${uid}:${roomId}`;
  if (!shouldSendTyping(typingSent.get(key), isTyping, now)) return;
  typingSent.set(key, { lastSentAt: now, lastValue: isTyping });
  if (!typingSubdocDenied) {
    try {
      await setDoc(typingRef(roomId), { users: { [uid]: isTyping ? now : deleteField() } }, { merge: true });
      return;
    } catch (e: any) {
      if (e?.code !== 'permission-denied') return; // transient — next heartbeat retries
      typingSubdocDenied = true;
    }
  }
  try {
    await updateDoc(doc(db, 'chat_rooms', roomId), { typingUsers: isTyping ? arrayUnion(uid) : arrayRemove(uid) });
  } catch { /* typing is best-effort */ }
}

/** Live list of OTHER users typing in a room (entries expire after the TTL even if a "stopped" write was lost). */
export function listenToTyping(roomId: string, cb: (uids: string[]) => void): () => void {
  let users: Record<string, unknown> = {};
  let last = '';
  const emit = () => {
    const list = activeTypers(users, Date.now(), auth.currentUser?.uid);
    const sig = list.join(',');
    if (sig !== last) { last = sig; cb(list); }
  };
  let unsub: () => void = () => {};
  try {
    unsub = rawOnSnapshot(typingRef(roomId), s => { users = (s.data()?.users as Record<string, unknown>) || {}; emit(); }, () => { users = {}; emit(); });
  } catch { /* watch stream broken — typing is cosmetic */ }
  const timer = setInterval(emit, Math.max(1000, Math.floor(TYPING_TTL_MS / 3)));
  return () => { clearInterval(timer); unsub(); };
}
