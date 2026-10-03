// oraEdu — Ora wellbeing inside the education stack, built around one rule: a student's feelings
// belong to the student. Nothing here ever copies a mood, a journal word or a check-in to a teacher or
// parent. Two things cross the line, and only because the student chooses them or because they are
// anonymous by construction:
//   1. Class weather — an anonymous tally. Teachers see it only once 5 or more students have answered,
//      and never see who answered what.
//   2. "I need a hand" — the student presses a button. The grown-up learns that a student asked for a
//      talk or a break and nothing else (no mood, no note, no history).
// Not a clinical tool. It does not diagnose, score or monitor.
import { db, auth } from './firebase';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, limit, runTransaction, updateDoc } from 'firebase/firestore';
import { today } from './oraService';

export const K_MIN = 5;
export type Mood = 1 | 2 | 3 | 4 | 5;
export const MOODS: Array<{ v: Mood; emoji: string; label: string }> = [
  { v: 1, emoji: '⛈️', label: 'Stormy' }, { v: 2, emoji: '🌧️', label: 'Rainy' }, { v: 3, emoji: '⛅', label: 'Cloudy' }, { v: 4, emoji: '🌤️', label: 'Fair' }, { v: 5, emoji: '☀️', label: 'Sunny' },
];

// ── Class weather ────────────────────────────────────────────────────────────────────────────────────
export interface Weather { classId: string; day: string; counts: Record<Mood, number> }
const wid = (classId: string, day: string) => `${classId}_${day}`;
const votedKey = (classId: string, day: string) => `plajah:weather:${wid(classId, day)}`;
export const hasVoted = (classId: string, day = today()): boolean => { try { return localStorage.getItem(votedKey(classId, day)) === '1'; } catch { return false; } };

/** Anonymous: increments a counter. The document holds no user ids, so who voted what cannot be recovered. */
export async function submitWeather(classId: string, mood: Mood, day = today()): Promise<boolean> {
  if (hasVoted(classId, day)) return false;
  const ref = doc(db, 'classWeather', wid(classId, day));
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ...(snap.exists() ? snap.data().counts : {}) } as Record<number, number>;
    counts[mood] = (counts[mood] || 0) + 1;
    tx.set(ref, { classId, day, counts });
  });
  try { localStorage.setItem(votedKey(classId, day), '1'); } catch { /* private mode */ }
  return true;
}

export async function getWeather(classId: string, day = today()): Promise<Weather | null> {
  const s = await getDoc(doc(db, 'classWeather', wid(classId, day)));
  return s.exists() ? (s.data() as Weather) : null;
}
export interface WeatherSummary { total: number; shown: boolean; share?: Record<Mood, number>; headline?: string }
/** Below K_MIN answers nothing is shown, so a small class can never expose an individual. */
export function summarizeWeather(w: Weather | null): WeatherSummary {
  if (!w) return { total: 0, shown: false };
  const total = ([1, 2, 3, 4, 5] as Mood[]).reduce((a, m) => a + (w.counts[m] || 0), 0);
  if (total < K_MIN) return { total, shown: false };
  const share = Object.fromEntries(([1, 2, 3, 4, 5] as Mood[]).map(m => [m, Math.round(((w.counts[m] || 0) / total) * 100)])) as Record<Mood, number>;
  const low = share[1] + share[2], high = share[4] + share[5];
  const headline = low >= 40 ? 'A heavy day for many. A calm start may help.' : high >= 60 ? 'A bright day. Good energy to use.' : 'A mixed day, as usual.';
  return { total, shown: true, share, headline };
}

// ── "I need a hand" ──────────────────────────────────────────────────────────────────────────────────
export type HandKind = 'TALK' | 'BREAK' | 'QUIET';
export const HAND_LABEL: Record<HandKind, string> = { TALK: 'I would like to talk to someone', BREAK: 'I need a break', QUIET: 'I need a quiet minute' };
export interface HandRequest { id: string; studentUid: string; studentName: string; toUids: string[]; kind: HandKind; classId?: string; createdAt: number; seenBy: string[] }

/** Tells the chosen grown-ups that the student asked, and which kind of help. Nothing else is sent. */
export async function askForHand(opts: { studentName: string; kind: HandKind; toUids: string[]; classId?: string }): Promise<string> {
  const uid = auth.currentUser?.uid; if (!uid) throw new Error('Sign in first');
  const toUids = [...new Set(opts.toUids.filter(u => u && u !== uid))];
  const payload: Omit<HandRequest, 'id'> = { studentUid: uid, studentName: opts.studentName, toUids, kind: opts.kind, createdAt: Date.now(), seenBy: [] };
  if (opts.classId) payload.classId = opts.classId;
  const r = await addDoc(collection(db, 'wellbeingRequests'), payload);
  return r.id;
}
export async function listHandRequests(max = 30): Promise<HandRequest[]> {
  const uid = auth.currentUser?.uid; if (!uid) return [];
  const snap = await getDocs(query(collection(db, 'wellbeingRequests'), where('toUids', 'array-contains', uid), limit(max)));
  return snap.docs.map(d => ({ ...(d.data() as Omit<HandRequest, 'id'>), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
}
export async function markSeen(id: string): Promise<void> {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const ref = doc(db, 'wellbeingRequests', id); const s = await getDoc(ref); if (!s.exists()) return;
  const seen: string[] = s.data().seenBy || []; if (!seen.includes(uid)) await updateDoc(ref, { seenBy: [...seen, uid] });
}

// ── Local-only "my calm corner" preference ───────────────────────────────────────────────────────────
export const HELP_LINE = 'If you or someone you know is in danger or thinking about self-harm, tell a trusted adult now. In the United States you can call or text 988 at any time.';
void setDoc;
