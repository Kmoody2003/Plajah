// serviceNotes — notes the platform wrote for you, kept apart from the ones you wrote.
//
// When Kairos puts a passage on your phone it records that you were there for
// it: the service, the moment, the date. That is genuinely useful — it is how a
// verse you read on Tuesday knows it was preached on Sunday — but it is NOT a
// thought you had, and mixing the two would mean the app quoting itself back at
// you under the heading "your notes".
//
// So they live in their own store, grouped by day. Consequences that matter:
//   · a receipt can never overwrite or block a note you typed on the same verse
//   · you can have both on one verse, which is the normal case
//   · clearing one never clears the other
//
// Local-first by design. These are a by-product of attending, not something the
// church needs a copy of.

import { parseRefId, formatRef, type ScriptureRef } from './scriptureRef';

const KEY = 'plajah_lectio_service_notes_v1';
/** Per-user cloud mirror. Doc id is `{uid}__{sessionId}`; owner-only in rules. */
const CLOUD_COL = 'lectioServiceNotes';
/** The map service notes used to be mixed into. Read once, for migration. */
const LEGACY_NOTES_KEY = 'plajah_bible_notes_v1';
const MIGRATED_FLAG = 'plajah_lectio_service_notes_migrated_v1';

export interface ServiceNote {
  /** "45:8:28" — matches the key the reader and highlights use. */
  verseKey: string;
  refId: string;
  /** "Romans 8:28" */
  label: string;
  sessionId: string;
  serviceTitle: string;
  /** Seconds into the service — deep-links the replay. */
  programTC: number;
  /** Epoch ms, so notes can be grouped by the day they were heard. */
  at: number;
}

type Store = Record<string, ServiceNote[]>;

function read(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw as Store : {};
  } catch { return {}; }
}

function write(s: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

export const verseKeyOf = (ref: ScriptureRef) => `${ref.book}:${ref.chapter}:${ref.verse ?? 1}`;

/**
 * One-time move of the receipts an earlier build wrote into the authored-notes
 * map. Without this they'd be stranded there, still masquerading as something
 * the member typed.
 */
export function migrateLegacyReceipts(): number {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return 0;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_NOTES_KEY) || '{}') as Record<string, string>;
    const store = read();
    let moved = 0;

    for (const [verseKey, text] of Object.entries(legacy)) {
      const m = /^Heard at (\d+):(\d\d) — (.*)$/.exec(String(text || ''));
      if (!m) continue;
      const programTC = Number(m[1]) * 60 + Number(m[2]);
      const [book, chapter, verse] = verseKey.split(':').map(Number);
      const refId = `${book}.${chapter}.${verse}`;
      const ref = parseRefId(refId);
      (store[verseKey] ||= []).push({
        verseKey, refId,
        label: ref ? formatRef(ref, 'display') : verseKey,
        sessionId: 'legacy',
        serviceTitle: m[3] || 'Service',
        programTC,
        at: Date.now(),
      });
      delete legacy[verseKey];
      moved++;
    }

    if (moved) {
      write(store);
      localStorage.setItem(LEGACY_NOTES_KEY, JSON.stringify(legacy));
    }
    localStorage.setItem(MIGRATED_FLAG, '1');
    return moved;
  } catch { return 0; }
}

/** Record that a passage was put in front of this member during a service. */
export function recordServiceNote(n: Omit<ServiceNote, 'at'> & { at?: number }): void {
  const store = read();
  const list = store[n.verseKey] ||= [];
  // One entry per passage per service — an operator re-taking a slide is not a
  // second occasion.
  if (list.some(e => e.sessionId === n.sessionId && e.refId === n.refId)) return;
  list.push({ ...n, at: n.at ?? Date.now() });
  write(store);
}

export function serviceNotesFor(verseKey: string): ServiceNote[] {
  return (read()[verseKey] ?? []).slice().sort((a, b) => b.at - a.at);
}

export function serviceNotesForSession(sessionId: string): ServiceNote[] {
  return Object.values(read()).flat()
    .filter(n => n.sessionId === sessionId)
    .sort((a, b) => a.programTC - b.programTC);
}

export function allServiceNotes(): ServiceNote[] {
  return Object.values(read()).flat().sort((a, b) => b.at - a.at);
}

export interface ServiceNoteDay {
  /** "2026-08-14" */
  day: string;
  label: string;
  serviceTitle: string;
  sessionId: string;
  notes: ServiceNote[];
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Grouped the way a member actually thinks about them: by the day they were
 * heard, newest first, each group naming the service it came from.
 */
export function serviceNotesByDay(): ServiceNoteDay[] {
  const groups = new Map<string, ServiceNoteDay>();

  for (const n of allServiceNotes()) {
    const day = dayKey(n.at);
    const k = `${day}|${n.sessionId}`;
    let g = groups.get(k);
    if (!g) {
      g = {
        day,
        label: new Date(n.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
        serviceTitle: n.serviceTitle,
        sessionId: n.sessionId,
        notes: [],
      };
      groups.set(k, g);
    }
    g.notes.push(n);
  }

  for (const g of groups.values()) g.notes.sort((a, b) => a.programTC - b.programTC);
  return [...groups.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

// ── Personal cloud sync ──────────────────────────────────────────────────────
//
// These follow the member, not the church. One doc per user per service,
// readable and writable only by them — the same shape and the same owner-only
// rule as bibleNotes. Nothing here is visible to the org: what a person was
// shown, and when, is a fact about their spiritual life.
//
// Local stays authoritative for what is on screen. The cloud is the copy that
// survives a new phone, so every path degrades to local-only in silence.

/** One service's records, as stored. Doc id is `{uid}__{sessionId}`. */
interface SessionDoc {
  uid: string;
  sessionId: string;
  serviceTitle: string;
  at: number;
  notes: ServiceNote[];
}

/**
 * Union two sets of records. Never last-write-wins: a member who followed the
 * same service on a phone and a tablet should end up with the union, and the
 * earliest timestamp is the one that's true (when they first heard it).
 */
export function mergeNotes(a: ServiceNote[], b: ServiceNote[]): ServiceNote[] {
  const by = new Map<string, ServiceNote>();
  for (const n of [...a, ...b]) {
    const k = `${n.sessionId}|${n.refId}`;
    const prev = by.get(k);
    if (!prev || n.at < prev.at) by.set(k, prev ? { ...n, at: Math.min(n.at, prev.at) } : n);
  }
  return [...by.values()];
}

/** Push one service's records. Called after a cue lands; cheap and idempotent. */
export async function pushSession(uid: string, sessionId: string): Promise<void> {
  const notes = serviceNotesForSession(sessionId);
  if (!uid || !notes.length) return;
  try {
    const { db } = await import('./firebase');
    const { doc, setDoc } = await import('firebase/firestore');
    const payload: SessionDoc = {
      uid,
      sessionId,
      serviceTitle: notes[0].serviceTitle,
      at: Math.min(...notes.map(n => n.at)),
      notes: notes.slice(0, 200),
    };
    await setDoc(doc(db, CLOUD_COL, `${uid}__${sessionId}`), payload, { merge: true });
  } catch { /* offline, signed out, or rules — local still holds everything */ }
}

/**
 * Pull every service this member has followed and union it into local. Safe to
 * call on mount; returns how many records local gained.
 */
export async function syncServiceNotes(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    const { db } = await import('./firebase');
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    const snap = await getDocs(query(collection(db, CLOUD_COL), where('uid', '==', uid)));

    const remote: ServiceNote[] = [];
    snap.forEach(d => {
      const data = d.data() as SessionDoc;
      if (Array.isArray(data?.notes)) remote.push(...data.notes.filter(n => n && n.verseKey && n.refId));
    });
    if (!remote.length) return 0;

    const before = allServiceNotes().length;
    const merged = mergeNotes(allServiceNotes(), remote);

    const store: Store = {};
    for (const n of merged) (store[n.verseKey] ||= []).push(n);
    write(store);

    return Math.max(0, merged.length - before);
  } catch { return 0; }
}

/**
 * Push everything local that the cloud may not have — used once after a member
 * signs in on a device that has been recording offline.
 */
export async function pushAllSessions(uid: string): Promise<number> {
  if (!uid) return 0;
  const ids = [...new Set(allServiceNotes().map(n => n.sessionId))].filter(id => id !== 'legacy');
  let pushed = 0;
  for (const id of ids) { await pushSession(uid, id); pushed++; }
  return pushed;
}

/** Forget one service's records. Never touches anything the member wrote. */
export function forgetSession(sessionId: string): void {
  const store = read();
  for (const key of Object.keys(store)) {
    store[key] = store[key].filter(n => n.sessionId !== sessionId);
    if (!store[key].length) delete store[key];
  }
  write(store);
}

export const formatTC = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
