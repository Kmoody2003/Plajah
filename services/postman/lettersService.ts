/**
 * The Post Man — Letters between Plajah accounts.
 *
 * When two Plajah people write to each other it is not email. A letter is a
 * Tela document — paper, hand, ink, stamp — and a correspondence reads as a
 * chain of those sheets, the way pen-pal letters stack up in a shoebox.
 *
 * ANCHORED TO THE DM ROOM. A correspondence IS the pair's chat room
 * (`chat_rooms/{roomId}`), with letters in a `letters` subcollection beside
 * `messages`. That is a deliberate choice, not a shortcut:
 *   - every protection chat already has applies to letters with no second
 *     copy to drift: the education DM policy, block pairs, the trust tier for
 *     cold DMs, Fair Process limits (createChatRoom + dmGuard + rules);
 *   - chat is integrated by construction: the room's quick messages sit in the
 *     margin of the letter chain, and the chat list shows a letter arrived.
 *
 * At rest the letter document is wrapped with the same per-room cipher chat
 * uses for its Tela messages (services/cryptoService). That is at-rest
 * protection, NOT end-to-end encryption — see the note in that file.
 *
 * SLOW POST and SEALED letters are pacing features, not secrecy. The letter is
 * in Firestore the moment it is sent; the reader's UI holds it as an envelope
 * until `deliverAt` / `sealedUntil`. The writer is told this plainly.
 */

import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { onSnapshot } from '../safeSnapshot';
import { auth, db } from '../firebase';
import { createChatRoom, fetchFollowingIds, fetchUserProfiles, sendMessage } from '../backendService';
import { decryptText, encryptText } from '../cryptoService';
import type { ChatRoom, TelaDoc, UserProfile } from '../../types';
import type { HandId, InkId, StationeryId } from './letterStationery';

/** Firestore caps a document at 1 MiB; chat caps a Tela message at 600 KB. Same here. */
export const MAX_LETTER_BYTES = 600_000;

export type Delivery = 'now' | 'slow' | 'sealed';

export interface LetterAttachment {
  kind: 'invitation';
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
}

export interface Letter {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  createdAt: number;
  /** When the reader's UI lets it out of the envelope. */
  deliverAt: number;
  delivery: Delivery;
  stationery: StationeryId | 'custom';
  hand?: HandId;
  ink?: InkId;
  stampId?: string;
  place?: string;
  /** Decrypted Tela snapshot. Null if it could not be read. */
  doc: TelaDoc | null;
  plainText: string;
  excerpt: string;
  /** True when the body was finished in the full Tela editor. */
  fromTela: boolean;
  attachments: LetterAttachment[];
  readBy: Record<string, number>;
  reactions: Record<string, string>;
}

export interface LetterMeta {
  count: number;
  lastAt: number;
  lastBy: string;
  /** Encrypted with the room cipher, like chat's lastMessage. */
  lastExcerpt?: string;
  lastDeliverAt?: number;
  stationery?: string;
  readAt?: Record<string, number>;
}

export interface Correspondence {
  roomId: string;
  room: ChatRoom & { letterMeta?: LetterMeta };
  /** Everyone but me. */
  others: Array<{ uid: string; name: string; photo?: string }>;
  meta?: LetterMeta;
  excerpt: string;
  /** A letter has arrived (delivered) that I have not opened. */
  unread: boolean;
  /** The last letter was theirs — the gentle "your turn" shelf. */
  yourTurn: boolean;
  /** A letter of theirs is still in transit or sealed. */
  inTransitUntil?: number;
}

const lettersCol = (roomId: string) => collection(db, 'chat_rooms', roomId, 'letters');

/* ── Correspondences ───────────────────────────────────────────────────────── */

const profileCache = new Map<string, UserProfile>();
async function profilesFor(uids: string[]): Promise<Map<string, UserProfile>> {
  const missing = [...new Set(uids)].filter((u) => !profileCache.has(u));
  if (missing.length) {
    try {
      const got = await fetchUserProfiles(missing);
      for (const p of got) if (p?.uid) profileCache.set(p.uid, p);
    } catch { /* names fall back below */ }
  }
  return profileCache;
}

/**
 * Every private conversation, letters-first. A DM with no letters yet still
 * appears (as a person you could write to), so starting a correspondence with
 * someone you already chat with is one tap.
 */
export function listenCorrespondences(cb: (list: Correspondence[]) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { cb([]); return () => {}; }
  let alive = true;
  const unsub = onSnapshot(
    query(collection(db, 'chat_rooms'), where('participants', 'array-contains', uid), orderBy('updatedAt', 'desc'), limit(150)),
    async (snap) => {
      const rooms = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ChatRoom & { letterMeta?: LetterMeta }))
        .filter((r) => (r.type === 'PRIVATE' || (r.type === 'GROUP' && r.letterMeta)) && (r.participants?.length ?? 0) >= 2 && (r.participants?.length ?? 0) <= 12);
      const profiles = await profilesFor(rooms.flatMap((r) => r.participants.filter((p) => p !== uid)));
      const now = Date.now();
      const list = await Promise.all(rooms.map(async (r): Promise<Correspondence> => {
        const m = r.letterMeta;
        const others = r.participants.filter((p) => p !== uid).map((p) => {
          const pr = profiles.get(p);
          return { uid: p, name: pr?.displayName || 'Someone', photo: pr?.photoURL || undefined };
        });
        let excerpt = '';
        if (m?.lastExcerpt) { try { excerpt = await decryptText(m.lastExcerpt, r.id); } catch { excerpt = ''; } }
        const theirs = !!m && m.lastBy !== uid;
        const arrived = !m?.lastDeliverAt || m.lastDeliverAt <= now;
        return {
          roomId: r.id,
          room: r,
          others,
          meta: m,
          excerpt: theirs && !arrived ? '' : excerpt,
          unread: !!m && theirs && arrived && (m.readAt?.[uid] ?? 0) < m.lastAt,
          yourTurn: !!m && theirs && arrived,
          inTransitUntil: theirs && !arrived ? m.lastDeliverAt : undefined,
        };
      }));
      if (alive) {
        list.sort((a, b) => (b.meta?.lastAt ?? 0) - (a.meta?.lastAt ?? 0) || (b.room.updatedAt ?? 0) - (a.room.updatedAt ?? 0));
        cb(list);
      }
    },
    (err) => { console.warn('[Letters] correspondence listener failed:', err); cb([]); },
  );
  return () => { alive = false; unsub(); };
}

/** Opens (or creates) the correspondence with a person. Goes through every DM safety check. */
export async function openCorrespondenceWith(otherUid: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to write letters.');
  if (otherUid === uid) throw new Error('You cannot write a letter to yourself — try a sealed letter to a friend instead.');
  return createChatRoom([uid, otherUid], 'PRIVATE');
}

export async function markCorrespondenceRead(roomId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'chat_rooms', roomId), { [`letterMeta.readAt.${uid}`]: Date.now() });
  } catch { /* read state is a nicety */ }
}

/* ── Letters ───────────────────────────────────────────────────────────────── */

interface StoredLetter extends Omit<Letter, 'id' | 'roomId' | 'doc' | 'plainText'> {
  /** enc: … — the Tela snapshot as JSON, wrapped with the room cipher. */
  docEnc: string;
  plainEnc: string;
  excerptEnc: string;
}

async function hydrate(roomId: string, id: string, s: StoredLetter): Promise<Letter> {
  let parsed: TelaDoc | null = null;
  let plain = '';
  let excerpt = '';
  try { parsed = JSON.parse(await decryptText(s.docEnc, roomId)) as TelaDoc; } catch { parsed = null; }
  try { plain = await decryptText(s.plainEnc, roomId); } catch { plain = ''; }
  try { excerpt = await decryptText(s.excerptEnc, roomId); } catch { excerpt = ''; }
  return {
    id, roomId,
    authorId: s.authorId, authorName: s.authorName, authorPhoto: s.authorPhoto,
    createdAt: s.createdAt, deliverAt: s.deliverAt ?? s.createdAt, delivery: s.delivery ?? 'now',
    stationery: s.stationery, hand: s.hand, ink: s.ink, stampId: s.stampId, place: s.place,
    doc: parsed && Array.isArray(parsed.frames) && parsed.devices ? parsed : null,
    plainText: plain, excerpt, fromTela: !!s.fromTela,
    attachments: Array.isArray(s.attachments) ? s.attachments : [],
    readBy: s.readBy ?? {}, reactions: s.reactions ?? {},
  };
}

export function listenLetters(roomId: string, cb: (letters: Letter[]) => void): () => void {
  let alive = true;
  const unsub = onSnapshot(
    query(lettersCol(roomId), orderBy('createdAt', 'asc'), limit(300)),
    async (snap) => {
      const out = await Promise.all(snap.docs.map((d) => hydrate(roomId, d.id, d.data() as StoredLetter)));
      if (alive) cb(out);
    },
    (err) => { console.warn('[Letters] letters listener failed:', err); cb([]); },
  );
  return () => { alive = false; unsub(); };
}

export interface SendLetterInput {
  roomId: string;
  doc: TelaDoc;
  plainText: string;
  delivery: Delivery;
  /** For slow post: when it lands. For sealed: when it may be opened. */
  deliverAt?: number;
  stationery: StationeryId | 'custom';
  hand?: HandId;
  ink?: InkId;
  stampId?: string;
  place?: string;
  fromTela?: boolean;
  attachments?: LetterAttachment[];
}

/** "Tomorrow, 8 in the morning" — slow post lands at a humane hour, never at 3am. */
export function slowPostArrival(now = new Date()): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

export async function sendLetter(input: SendLetterInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to send letters.');
  const json = JSON.stringify(input.doc);
  if (json.length > MAX_LETTER_BYTES) {
    throw new Error('This letter is too large to post. Large images belong in your library — link them instead of pasting them in.');
  }
  const now = Date.now();
  const deliverAt = input.delivery === 'now' ? now : Math.max(now, input.deliverAt ?? slowPostArrival());
  const excerpt = input.plainText.replace(/\s+/g, ' ').trim().slice(0, 160);

  const [docEnc, plainEnc, excerptEnc] = await Promise.all([
    encryptText(json, input.roomId),
    encryptText(input.plainText.slice(0, 20_000), input.roomId),
    encryptText(excerpt, input.roomId),
  ]);

  const stored: Record<string, unknown> = {
    authorId: user.uid,
    authorName: user.displayName || 'A friend',
    authorPhoto: user.photoURL || '',
    createdAt: now,
    deliverAt,
    delivery: input.delivery,
    stationery: input.stationery,
    docEnc, plainEnc, excerptEnc,
    fromTela: !!input.fromTela,
    attachments: (input.attachments ?? []).map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))),
    readBy: { [user.uid]: now },
    reactions: {},
  };
  for (const k of ['hand', 'ink', 'stampId', 'place'] as const) if (input[k]) stored[k] = input[k];

  // The letter is written, then announced with a chat line. The line runs the
  // Fair Process DM guard, notifies the other side and puts the letter in the
  // chat list; if the guard refuses, the letter is withdrawn again.
  const line = input.delivery === 'sealed'
    ? `✉ sealed a letter for you — it opens ${new Date(deliverAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
    : input.delivery === 'slow'
      ? '✉ posted you a letter — it arrives tomorrow morning'
      : '✉ wrote you a letter';
  const ref = await addDoc(lettersCol(input.roomId), stored);
  try {
    await sendMessage(input.roomId, {
      senderId: user.uid,
      senderName: user.displayName || 'A friend',
      senderPhoto: user.photoURL || '',
      text: await encryptText(line, input.roomId),
      type: 'ACTION',
      letterId: ref.id,
    } as never);
  } catch (err) {
    // The DM guard refused — withdraw the letter so the two stay consistent.
    try { const { deleteDoc } = await import('firebase/firestore'); await deleteDoc(ref); } catch { /* best effort */ }
    throw err;
  }

  const roomRef = doc(db, 'chat_rooms', input.roomId);
  const prev = (await getDoc(roomRef)).data()?.letterMeta as LetterMeta | undefined;
  await setDoc(roomRef, {
    letterMeta: {
      count: (prev?.count ?? 0) + 1,
      lastAt: now,
      lastBy: user.uid,
      lastExcerpt: excerptEnc,
      lastDeliverAt: deliverAt,
      stationery: input.stationery,
      readAt: { ...(prev?.readAt ?? {}), [user.uid]: now },
    },
    updatedAt: now,
  }, { merge: true });
  return ref.id;
}

export async function reactToLetter(roomId: string, letterId: string, emoji: string | null): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const { deleteField } = await import('firebase/firestore');
  await updateDoc(doc(lettersCol(roomId), letterId), { [`reactions.${uid}`]: emoji ?? deleteField() });
}

export async function markLetterRead(roomId: string, letterId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try { await updateDoc(doc(lettersCol(roomId), letterId), { [`readBy.${uid}`]: Date.now() }); } catch { /* nicety */ }
}

/* ── Bulletins: business letters to followers ─────────────────────────────── */

/**
 * A business writing to everyone who follows it. Kept on its own shelf, never
 * mixed into personal letters — the single biggest frustration with email is a
 * friend's note buried under newsletters, and this makes that impossible by
 * construction. It is also pull, not push: a bulletin only reaches people who
 * follow the sender, and unfollowing removes the whole shelf at once. No list to
 * be sold onto, no unsubscribe link to hunt for.
 */
export interface Bulletin {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  title: string;
  excerpt: string;
  doc: TelaDoc | null;
  createdAt: number;
  campaignId?: string;
}

export async function postBulletin(input: { title: string; doc: TelaDoc; excerpt: string; campaignId?: string }): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const json = JSON.stringify(input.doc);
  if (json.length > MAX_LETTER_BYTES) throw new Error('This bulletin is too large to post.');
  const ref = await addDoc(collection(db, 'bulletins'), {
    authorId: user.uid,
    authorName: user.displayName || 'A Plajah business',
    authorPhoto: user.photoURL || '',
    title: input.title.slice(0, 200),
    excerpt: input.excerpt.slice(0, 280),
    doc: json,
    createdAt: Date.now(),
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
  });
  return ref.id;
}

export async function fetchBulletins(max = 40): Promise<Bulletin[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const following = await fetchFollowingIds(uid, 400).catch(() => [] as string[]);
  const chunks: string[][] = [];
  for (let i = 0; i < following.length && chunks.length < 20; i += 10) chunks.push(following.slice(i, i + 10));
  const snaps = await Promise.all(chunks.map((c) =>
    getDocs(query(collection(db, 'bulletins'), where('authorId', 'in', c), limit(12))).catch(() => null)));
  const out: Bulletin[] = [];
  for (const s of snaps) {
    if (!s) continue;
    for (const d of s.docs) {
      const x = d.data() as Record<string, any>;
      let parsed: TelaDoc | null = null;
      try { parsed = JSON.parse(String(x.doc ?? 'null')); } catch { parsed = null; }
      out.push({
        id: d.id, authorId: x.authorId, authorName: x.authorName, authorPhoto: x.authorPhoto || undefined,
        title: x.title ?? '', excerpt: x.excerpt ?? '', doc: parsed, createdAt: Number(x.createdAt) || 0, campaignId: x.campaignId,
      });
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}
