import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './backendService';

// ─────────────────────────────────────────────────────────────────────────
// Intimate in-chat games. First game: a shared Magic 8-Ball where each partner
// secretly seeds their own custom answers — you never see what the OTHER put in,
// only the answer the ball reveals when shaken. Stored per intimate room at
// chat_rooms/{roomId}/games/magic8, participant-gated by rules.
// ─────────────────────────────────────────────────────────────────────────

const GAME_ID = 'magic8';

export interface Magic8Doc {
  answersByUid?: Record<string, string[]>;                 // each partner's private pool
  lastResult?: { text: string; at: number; byUid: string } | null;
}

const CLASSIC_ANSWERS = [
  'It is certain', 'Without a doubt', 'Yes — definitely', 'Signs point to yes',
  'Ask again later', 'Better not tell you now', 'Cannot predict now',
  "Don't count on it", 'My reply is no', 'Very doubtful', 'Most likely', 'Absolutely 💗',
];

const ref = (roomId: string) => doc(db, 'chat_rooms', roomId, 'games', GAME_ID);

/** Live-subscribe to the room's Magic 8-Ball. */
export function subscribeMagic8(roomId: string, cb: (d: Magic8Doc | null) => void) {
  return onSnapshot(ref(roomId), (snap) => cb(snap.exists() ? (snap.data() as Magic8Doc) : null),
    () => cb(null));
}

/** Add a secret answer to MY pool (the other partner never sees it — only shaken results). */
export async function addMyAnswer(roomId: string, text: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !text.trim()) return;
  const snap = await getDoc(ref(roomId));
  const data = (snap.exists() ? snap.data() : {}) as Magic8Doc;
  const mine = [...((data.answersByUid || {})[uid] || []), text.trim()];
  await setDoc(ref(roomId), { answersByUid: { ...(data.answersByUid || {}), [uid]: mine } }, { merge: true });
}

/** Replace MY pool (used for delete). */
export async function setMyAnswers(roomId: string, answers: string[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const snap = await getDoc(ref(roomId));
  const data = (snap.exists() ? snap.data() : {}) as Magic8Doc;
  await setDoc(ref(roomId), { answersByUid: { ...(data.answersByUid || {}), [uid]: answers } }, { merge: true });
}

/** Shake: pick a random answer from BOTH pools (or classics if empty) and reveal only it. */
export async function shakeMagic8(roomId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const snap = await getDoc(ref(roomId));
  const data = (snap.exists() ? snap.data() : {}) as Magic8Doc;
  const pool = Object.values(data.answersByUid || {}).flat().filter(Boolean);
  const source = pool.length ? pool : CLASSIC_ANSWERS;
  const text = source[Math.floor(Math.random() * source.length)];
  await setDoc(ref(roomId), { lastResult: { text, at: Date.now(), byUid: uid } }, { merge: true });
}
