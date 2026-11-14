/**
 * chatActions — the Firestore/Storage side of the chat basics: edit, delete-as-tombstone,
 * Storage-backed attachments and notes, forward, per-room read cursor + mute, and quiet hours.
 * Rules for every write here live next to chat_rooms/{id}/messages and users/{uid}/chat_prefs
 * in firestore.rules; the pure decisions live in ./chatCore.
 */
import {
  doc, updateDoc, setDoc, deleteField, collection, onSnapshot, getDoc,
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { encryptText } from '../cryptoService';
import { uploadFile, sendMessage } from '../backendService';
import { firstUrl, fetchLinkPreview } from '../linkPreviewService';
import { mayUnfurlLinks } from '../protectedThreads';
import {
  TOMBSTONE_CLEAR_KEYS, attachmentKind, buildForwardPayload, DEFAULT_QUIET_HOURS, isValidHHMM,
  type ChatAttachment, type RoomPrefs, type QuietHours,
} from './chatCore';

const me = () => auth.currentUser?.uid ?? null;

// ── Edit + delete ────────────────────────────────────────────────────────────

export async function editMessage(roomId: string, messageId: string, plainText: string, previewUrl?: string): Promise<void> {
  const text = plainText.trim();
  if (!text) throw new Error('A message cannot be empty. Delete it instead.');
  await updateDoc(doc(db, 'chat_rooms', roomId, 'messages', messageId), {
    text: await encryptText(text, roomId),
    editedAt: Date.now(),
    // A link card for a link the edit removed would be misleading.
    ...(previewUrl && !text.includes(previewUrl) ? { linkPreview: deleteField() } : {}),
  });
}

/**
 * "Delete for everyone": clears the content and leaves a tombstone so replies and threads
 * still make sense. Any Storage object the message owned is removed too.
 */
export async function deleteMessageForEveryone(roomId: string, message: Record<string, any>): Promise<void> {
  const patch: Record<string, unknown> = { deletedAt: Date.now() };
  for (const k of TOMBSTONE_CLEAR_KEYS) if (k in message && message[k] !== undefined) patch[k] = deleteField();
  await updateDoc(doc(db, 'chat_rooms', roomId, 'messages', message.id), patch);
  const paths = [message.storagePath, message.attachment?.storagePath].filter((p): p is string => typeof p === 'string' && !!p);
  for (const p of paths) deleteObject(storageRef(storage, p)).catch(() => { /* already gone */ });
}

// ── Storage-backed uploads ───────────────────────────────────────────────────

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file';

/** Upload chat bytes to chat/{roomId}/{folder}/… and return the download URL and path. */
export async function uploadChatBlob(
  roomId: string, folder: 'voice' | 'video' | 'files', blob: Blob, name: string,
  onProgress?: (p: number) => void,
): Promise<{ url: string; path: string }> {
  const path = `chat/${roomId}/${folder}/${Date.now()}_${safeName(name)}`;
  const url = await uploadFile(path, blob, onProgress);
  if (!url) throw new Error('Upload failed. Check your connection and try again.');
  return { url, path };
}

export async function uploadChatAttachment(roomId: string, file: File, onProgress?: (p: number) => void): Promise<ChatAttachment> {
  const { url, path } = await uploadChatBlob(roomId, 'files', file, file.name, onProgress);
  return {
    url, name: file.name.slice(0, 200), size: file.size, mime: file.type || 'application/octet-stream',
    kind: attachmentKind(file.type, file.name), storagePath: path,
  };
}

// ── Link previews ────────────────────────────────────────────────────────────

export interface ChatLinkPreview { url: string; title: string; description?: string; image?: string; siteName: string }

/** Preview for the first link in a message, or null (none, protected thread, or nothing useful). */
export async function previewForMessage(roomId: string, text: string): Promise<ChatLinkPreview | null> {
  const url = firstUrl(text);
  if (!url) return null;
  if (!(await mayUnfurlLinks(roomId).catch(() => false))) return null;
  let siteName = url;
  try { siteName = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  const p = await fetchLinkPreview(url);
  if (!p.description && !p.image && (!p.title || p.title === siteName)) return null;
  const out: ChatLinkPreview = { url, title: (p.title || siteName).slice(0, 200), siteName };
  if (p.description) out.description = p.description.slice(0, 300);
  if (p.image && /^https:\/\//.test(p.image)) out.image = p.image.slice(0, 800);
  return out;
}

// ── Forward ──────────────────────────────────────────────────────────────────

/** Re-send a (decrypted) message into another room, labelled with who wrote it. */
export async function forwardMessage(targetRoomId: string, message: Record<string, any>): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to forward messages.');
  const payload = buildForwardPayload(message);
  if (message.text) payload.text = await encryptText(String(message.text), targetRoomId);
  await sendMessage(targetRoomId, {
    ...payload,
    senderId: u.uid,
    senderName: u.displayName || 'Anonymous',
    senderPhoto: u.photoURL || '',
    forwardedFrom: String(message.senderName || 'Someone').slice(0, 100),
  } as any);
}

// ── Per-room read cursor + mute ──────────────────────────────────────────────

type PrefsMap = Record<string, RoomPrefs>;
let prefsState: { uid: string; map: PrefsMap; unsub: () => void; subs: Set<(m: PrefsMap) => void> } | null = null;

/** One shared listener on users/{uid}/chat_prefs for every room list and chat window. */
export function listenMyRoomPrefs(cb: (prefs: PrefsMap) => void): () => void {
  const uid = me();
  if (!uid) { cb({}); return () => {}; }
  if (!prefsState || prefsState.uid !== uid) {
    prefsState?.unsub();
    const state = { uid, map: {} as PrefsMap, unsub: () => {}, subs: new Set<(m: PrefsMap) => void>() };
    state.unsub = onSnapshot(collection(db, 'users', uid, 'chat_prefs'), (snap) => {
      const next: PrefsMap = {};
      snap.forEach(d => { next[d.id] = d.data() as RoomPrefs; });
      state.map = next;
      state.subs.forEach(s => s({ ...next }));
    }, () => { /* rules not deployed yet → behave as "no prefs" */ });
    prefsState = state;
  }
  const state = prefsState;
  state.subs.add(cb);
  cb({ ...state.map });
  return () => {
    state.subs.delete(cb);
    if (!state.subs.size && prefsState === state) { state.unsub(); prefsState = null; }
  };
}

const lastReadWrite: Record<string, number> = {};

/** Move your read cursor to now. Throttled per room; skipped when nothing new arrived. */
export async function markRoomRead(roomId: string, roomUpdatedAt?: number): Promise<void> {
  const uid = me();
  if (!uid || !roomId) return;
  const known = prefsState?.uid === uid ? prefsState.map[roomId]?.lastReadAt || 0 : 0;
  if (roomUpdatedAt && known >= roomUpdatedAt) return;
  const now = Date.now();
  if (now - (lastReadWrite[roomId] || 0) < 4000) return;
  lastReadWrite[roomId] = now;
  await setDoc(doc(db, 'users', uid, 'chat_prefs', roomId), { lastReadAt: now, updatedAt: now }, { merge: true })
    .catch(() => { /* best-effort */ });
}

/** until: epoch ms, MUTE_FOREVER, or null to unmute. */
export async function setRoomMute(roomId: string, until: number | null): Promise<void> {
  const uid = me();
  if (!uid) throw new Error('Sign in to change notifications.');
  await setDoc(doc(db, 'users', uid, 'chat_prefs', roomId), { mutedUntil: until, updatedAt: Date.now() }, { merge: true });
}

// ── Quiet hours ──────────────────────────────────────────────────────────────

const quietRef = (uid: string) => doc(db, 'users', uid, 'chat_settings', 'quiet_hours');

export async function getQuietHours(): Promise<QuietHours> {
  const uid = me();
  if (!uid) return DEFAULT_QUIET_HOURS;
  try {
    const snap = await getDoc(quietRef(uid));
    return snap.exists() ? { ...DEFAULT_QUIET_HOURS, ...(snap.data() as QuietHours) } : DEFAULT_QUIET_HOURS;
  } catch { return DEFAULT_QUIET_HOURS; }
}

export async function saveQuietHours(qh: QuietHours): Promise<void> {
  const uid = me();
  if (!uid) throw new Error('Sign in to set quiet hours.');
  if (!isValidHHMM(qh.start) || !isValidHHMM(qh.end)) throw new Error('Use a time like 22:00.');
  const tz = qh.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  await setDoc(quietRef(uid), { enabled: !!qh.enabled, start: qh.start, end: qh.end, tz, updatedAt: Date.now() });
}
