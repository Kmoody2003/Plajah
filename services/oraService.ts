import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, orderBy, limit as fsLimit, where,
} from 'firebase/firestore';
import { db, auth } from './backendService';
import { encryptWith, decryptWith, isEncrypted } from './cryptoService';
import type {
  OraProfile, OraCheckin, OraEntry, OraGoal, OraRitual, OraStreak, OraSession,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Ora — personal productivity & wellbeing suite.
// Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md
//
// PRIVACY CONTRACT — read before adding anything to this file:
//   1. Every document lives under users/{uid}/ora_* and is owner-only by rule.
//   2. Nothing here may be copied into a feed, search index, OG preview,
//      recommendation surface, ad rail, or training set. There is deliberately
//      no denormalisation helper in this service, because denormalising Ora
//      data is how it would leak (see the displayName propagation problem).
//   3. Journal bodies and check-in notes are encrypted before they are written.
//      The key is derived per-user; a database dump is ciphertext.
//   4. Deletion is real deletion, not a tombstone.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = 'users';
const SUB = {
  profile: 'ora_profile',
  checkins: 'ora_checkins',
  entries: 'ora_entries',
  goals: 'ora_goals',
  rituals: 'ora_rituals',
  sessions: 'ora_sessions',
} as const;

/** Current uid, or null when signed out. Every call is a no-op without one. */
const uid = (): string | null => auth.currentUser?.uid ?? null;

const subcol = (u: string, name: string) => collection(db, ROOT, u, name);
const subdoc = (u: string, name: string, id: string) => doc(db, ROOT, u, name, id);

/**
 * Per-user encryption secret. Derived from the uid so it is stable across
 * devices without a password prompt, which is the honest trade Phase 1 makes:
 * it defeats a database dump, not a compromised backend. True end-to-end
 * (a user-held key) is a Phase 2 decision — it costs server-side search and
 * account recovery, so it is not something to switch on silently.
 */
const secretFor = (u: string) => `ora::${u}`;

/** Firestore throws on undefined values, so strip them before every write. */
function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Local calendar day, YYYY-MM-DD. Local, not UTC — a day is where the user is. */
export function today(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Season key for goals, e.g. "2026-Q3". */
export function currentSeason(d: Date = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ── profile ──────────────────────────────────────────────────────────────

const DEFAULT_STREAK: OraStreak = { current: 0, longest: 0, gracesLeft: 3 };

/** Read the Ora profile. Returns null when signed out or Ora was never opened. */
export async function getProfile(): Promise<OraProfile | null> {
  const u = uid();
  if (!u) return null;
  try {
    const snap = await getDoc(subdoc(u, SUB.profile, 'self'));
    return snap.exists() ? (snap.data() as OraProfile) : null;
  } catch {
    return null; // rules denial / offline — Ora never blocks the app
  }
}

/** Turn Ora on for this account. Nothing is written anywhere until this runs. */
export async function enableOra(): Promise<OraProfile | null> {
  const u = uid();
  if (!u) return null;
  const existing = await getProfile();
  const now = Date.now();
  const profile: OraProfile = existing
    ? { ...existing, enabled: true, updatedAt: now }
    : { uid: u, enabled: true, quietHours: false, streak: { ...DEFAULT_STREAK }, createdAt: now, updatedAt: now };
  await setDoc(subdoc(u, SUB.profile, 'self'), clean(profile));
  return profile;
}

export async function updateProfile(patch: Partial<OraProfile>): Promise<void> {
  const u = uid();
  if (!u) return;
  await setDoc(subdoc(u, SUB.profile, 'self'), clean({ ...patch, updatedAt: Date.now() }), { merge: true });
}

// ── Tides: check-ins ─────────────────────────────────────────────────────

/**
 * Record today's check-in. The doc id IS the day, so a second check-in
 * overwrites rather than accumulating — the mechanic is "how are you now",
 * not a log to be completionist about.
 */
export async function saveCheckin(
  input: Pick<OraCheckin, 'mood'> & Partial<Pick<OraCheckin, 'energy' | 'note' | 'surface'>>,
): Promise<OraCheckin | null> {
  const u = uid();
  if (!u) return null;
  const day = today();
  const checkin: OraCheckin = clean({
    id: day,
    day,
    mood: input.mood,
    energy: input.energy,
    note: input.note ? await encryptWith(input.note, secretFor(u)) : undefined,
    surface: input.surface ?? 'RAIL',
    createdAt: Date.now(),
  });
  await setDoc(subdoc(u, SUB.checkins, day), checkin);
  await touchStreak(day);
  return checkin;
}

export async function getCheckin(day: string = today()): Promise<OraCheckin | null> {
  const u = uid();
  if (!u) return null;
  try {
    const snap = await getDoc(subdoc(u, SUB.checkins, day));
    if (!snap.exists()) return null;
    const c = snap.data() as OraCheckin;
    if (c.note && isEncrypted(c.note)) c.note = await decryptWith(c.note, secretFor(u));
    return c;
  } catch {
    return null;
  }
}

/** Recent check-ins, newest first. Used by the room's mood ribbon. */
export async function listCheckins(days = 30): Promise<OraCheckin[]> {
  const u = uid();
  if (!u) return [];
  try {
    const snap = await getDocs(query(subcol(u, SUB.checkins), orderBy('day', 'desc'), fsLimit(days)));
    const out: OraCheckin[] = [];
    for (const d of snap.docs) {
      const c = d.data() as OraCheckin;
      if (c.note && isEncrypted(c.note)) c.note = await decryptWith(c.note, secretFor(u));
      out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

// ── Longhand: journal ────────────────────────────────────────────────────

export async function saveEntry(
  input: Partial<OraEntry> & Pick<OraEntry, 'body'>,
): Promise<OraEntry | null> {
  const u = uid();
  if (!u) return null;
  const now = Date.now();
  const id = input.id ?? newId();
  const entry: OraEntry = clean({
    id,
    day: input.day ?? today(),
    title: input.title,
    body: await encryptWith(input.body, secretFor(u)),
    assetIds: input.assetIds,
    moodAtWriting: input.moodAtWriting,
    promptId: input.promptId,
    // Private is the floor. Raising it is always an explicit, separate act.
    visibility: input.visibility ?? 'PRIVATE',
    sharedWithUid: input.sharedWithUid,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });
  await setDoc(subdoc(u, SUB.entries, id), entry);
  await touchStreak(entry.day);
  return { ...entry, body: input.body };
}

export async function listEntries(max = 50): Promise<OraEntry[]> {
  const u = uid();
  if (!u) return [];
  try {
    const snap = await getDocs(query(subcol(u, SUB.entries), orderBy('createdAt', 'desc'), fsLimit(max)));
    const out: OraEntry[] = [];
    for (const d of snap.docs) {
      const e = d.data() as OraEntry;
      if (isEncrypted(e.body)) e.body = await decryptWith(e.body, secretFor(u));
      out.push(e);
    }
    return out;
  } catch {
    return [];
  }
}

/** Real deletion, not a tombstone. */
export async function deleteEntry(id: string): Promise<void> {
  const u = uid();
  if (!u) return;
  await deleteDoc(subdoc(u, SUB.entries, id));
}

// ── Compass: goals ───────────────────────────────────────────────────────

export async function saveGoal(
  input: Partial<OraGoal> & Pick<OraGoal, 'title'>,
): Promise<OraGoal | null> {
  const u = uid();
  if (!u) return null;
  const now = Date.now();
  const id = input.id ?? newId();
  const goal: OraGoal = clean({
    id,
    title: input.title,
    detail: input.detail,
    season: input.season ?? currentSeason(),
    target: input.target,
    progress: input.progress ?? 0,
    unit: input.unit,
    mode: input.mode ?? 'MANUAL',
    adapter: input.adapter,
    provenance: input.provenance,
    status: input.status ?? 'ACTIVE',
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    completedAt: input.completedAt,
  });
  await setDoc(subdoc(u, SUB.goals, id), goal);
  return goal;
}

export async function listGoals(season?: string): Promise<OraGoal[]> {
  const u = uid();
  if (!u) return [];
  try {
    // Single-field filter only — a where + orderBy pair needs a composite index,
    // and a missing one fails silently. Sorting happens in memory instead.
    const snap = season
      ? await getDocs(query(subcol(u, SUB.goals), where('season', '==', season)))
      : await getDocs(subcol(u, SUB.goals));
    return snap.docs
      .map((d) => d.data() as OraGoal)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function deleteGoal(id: string): Promise<void> {
  const u = uid();
  if (!u) return;
  await deleteDoc(subdoc(u, SUB.goals, id));
}

// ── rituals ──────────────────────────────────────────────────────────────

export async function listRituals(): Promise<OraRitual[]> {
  const u = uid();
  if (!u) return [];
  try {
    const snap = await getDocs(subcol(u, SUB.rituals));
    return snap.docs.map((d) => d.data() as OraRitual);
  } catch {
    return [];
  }
}

export async function saveRitual(
  input: Partial<OraRitual> & Pick<OraRitual, 'name' | 'steps'>,
): Promise<OraRitual | null> {
  const u = uid();
  if (!u) return null;
  const id = input.id ?? newId();
  const ritual: OraRitual = clean({
    id,
    name: input.name,
    at: input.at,
    steps: input.steps,
    days: input.days ?? [],
    active: input.active ?? true,
    createdAt: input.createdAt ?? Date.now(),
  });
  await setDoc(subdoc(u, SUB.rituals, id), ritual);
  return ritual;
}

// ── Stillness: practice sessions ─────────────────────────────────────────

/**
 * Log a finished practice session.
 *
 * `seconds` is what was actually practised, never what was scheduled — a
 * session stopped at 40 seconds logs 40. Practice minutes feed a goal adapter,
 * so inflating them here would corrupt the one thing Ora promises to get right.
 */
export async function saveSession(
  input: Pick<OraSession, 'kind' | 'seconds' | 'completed'> & Partial<Pick<OraSession, 'pattern'>>,
): Promise<OraSession | null> {
  const u = uid();
  if (!u) return null;
  // A session too short to be a session. Below this it is a mis-tap, not practice.
  if (!Number.isFinite(input.seconds) || input.seconds < 5) return null;
  const id = newId();
  const session: OraSession = clean({
    id,
    day: today(),
    kind: input.kind,
    pattern: input.pattern,
    seconds: Math.round(input.seconds),
    completed: input.completed,
    createdAt: Date.now(),
  });
  await setDoc(subdoc(u, SUB.sessions, id), session);
  await touchStreak(session.day);
  return session;
}

export async function listSessions(max = 200): Promise<OraSession[]> {
  const u = uid();
  if (!u) return [];
  try {
    const snap = await getDocs(query(subcol(u, SUB.sessions), orderBy('createdAt', 'desc'), fsLimit(max)));
    return snap.docs.map((d) => d.data() as OraSession);
  } catch {
    return [];
  }
}

/** Total minutes practised, all time. Backs the `ora.minutes` goal adapter. */
export async function totalPracticeMinutes(): Promise<number | null> {
  const u = uid();
  if (!u) return null;
  try {
    const snap = await getDocs(subcol(u, SUB.sessions));
    return Math.floor(snap.docs.reduce((n, d) => n + (Number((d.data() as OraSession).seconds) || 0), 0) / 60);
  } catch {
    // Unreadable is not zero — the adapter contract depends on this distinction.
    return null;
  }
}

// ── streaks that forgive ─────────────────────────────────────────────────

const dayBefore = (d: string): string => {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  dt.setDate(dt.getDate() - 1);
  return today(dt);
};

/**
 * Advance the streak for a day of activity.
 *
 * A gap of one day spends a grace instead of resetting — the whole point is
 * that lapsing must not feel like failure, because shame is why people delete
 * these apps. Graces refill monthly. A streak is never shown in red.
 */
export async function touchStreak(day: string = today()): Promise<OraStreak | null> {
  const u = uid();
  if (!u) return null;
  const profile = await getProfile();
  if (!profile) return null;
  const s: OraStreak = { ...DEFAULT_STREAK, ...profile.streak };
  if (s.lastDay === day) return s; // already counted today

  if (!s.lastDay || s.lastDay === dayBefore(day)) {
    s.current += 1;
  } else if (s.gracesLeft > 0 && s.lastDay === dayBefore(dayBefore(day))) {
    // Exactly one missed day, and a grace to cover it.
    s.gracesLeft -= 1;
    s.current += 1;
  } else {
    s.current = 1;
  }
  s.longest = Math.max(s.longest, s.current);
  s.lastDay = day;
  await updateProfile({ streak: s });
  return s;
}

/** Full export — the user's data is theirs, in one call, decrypted. */
export async function exportAll(): Promise<{
  profile: OraProfile | null; checkins: OraCheckin[]; entries: OraEntry[];
  goals: OraGoal[]; rituals: OraRitual[]; sessions: OraSession[];
} | null> {
  if (!uid()) return null;
  const [profile, checkins, entries, goals, rituals, sessions] = await Promise.all([
    getProfile(), listCheckins(3650), listEntries(10000), listGoals(), listRituals(), listSessions(10000),
  ]);
  return { profile, checkins, entries, goals, rituals, sessions };
}
