// watchScripture — the scripture panel beside the Elevate player, as data.
//
//   faithForOrg      which scripture (if any) an org page's player shows. Only faith
//                    institutions get the panel; a nonprofit, business or label never does.
//   watch sessions   one per (org, source): the passages that came up while it played
//                    and the notes the viewer stamped on it. Kept in memory for the
//                    session and saved to the viewer's own notebook (users/{uid}/notebook,
//                    owner-only), so switching sources and coming back finds them again,
//                    on any device.
//
// Nothing here is seeded. A session starts empty and only fills from the feed itself
// (speech heard in the stream, the org's Stage cues) or from what the viewer does.

import type { Organization } from '../types';
import type { FaithId } from '../data/sacredLibrary/readerCatalog';
import { keyedNotesStore } from './keyedNotes';

// ── Which scripture ─────────────────────────────────────────────────────────

const FAITH_WORDS: Array<[FaithId, RegExp]> = [
  ['islam', /\b(mosque|masjid|islam\w*|muslim|jami|musalla)\b/i],
  ['judaism', /\b(synagogue|shul|jewish|judaism|torah|kehilla|chabad|beth\s+\w+|temple\s+(beth|emanu|israel|sinai)|congregation\s+(beth|b'nai|shaarei|kol))\b/i],
  ['sikhism', /\b(gurdwara|gurudwara|sikh\w*|khalsa)\b/i],
  ['buddhism', /\b(buddh\w*|zen|dharma|sangha|vihara|wat|theravada|mahayana|meditation\s+center)\b/i],
  ['hinduism', /\b(hindu\w*|mandir|vedanta|iskcon|sanatan\w*|ashram|temple)\b/i],
  ['christianity', /\b(church|chapel|cathedral|parish|christian|catholic|orthodox|baptist|methodist|lutheran|presbyterian|pentecostal|anglican|episcopal|ministr(y|ies)|fellowship|tabernacle|assembly of god|non-?denominational)\b/i],
];

/** The faith whose scripture this org's player shows, or null for no panel at all. */
export function faithForOrg(org: Pick<Organization, 'orgType' | 'orgKindLabel' | 'denomination' | 'name'> | null | undefined): FaithId | null {
  if (!org) return null;
  if (org.orgType === 'CHURCH') return 'christianity';
  if (org.orgType !== 'RELIGIOUS') return null;
  // A faith institution other than a church: read its own description, most specific first.
  const said = [org.orgKindLabel, org.denomination, org.name].filter(Boolean).join(' · ');
  for (const [faith, re] of FAITH_WORDS) if (re.test(said)) return faith;
  return null; // unknown tradition: show nothing rather than the wrong scripture
}

export const FAITH_SCRIPTURE_NAME: Record<FaithId, string> = {
  christianity: 'Bible',
  judaism: 'Tanakh',
  islam: 'Qur’an',
  hinduism: 'Bhagavad Gita',
  sikhism: 'Guru Granth Sahib',
  buddhism: 'Dhammapada',
};

/** Faiths whose references the spoken-reference detector understands. The Tanakh shares the
 *  Hebrew Bible's book names, so "Isaiah 6" heard in a synagogue stream lands on Tanakh Isaiah 6. */
export const faithHearsReferences = (f: FaithId | null) => f === 'christianity' || f === 'judaism';

// ── Watch sessions ──────────────────────────────────────────────────────────

export type PassageSource = 'heard' | 'stage' | 'picked';

export interface WatchPassage {
  /** getbible ref id for Bible/Tanakh ("23.6.1"); `${workId}#${section}#${segment}` otherwise. */
  refId: string;
  label: string;
  /** Seconds into the source when it came up. */
  tc: number;
  at: number;
  source: PassageSource;
  /** What the speaker said, when heard from the stream. */
  heard?: string;
}

export interface WatchNote {
  id: string;
  tc: number;
  refId: string;
  label: string;
  text: string;
  at: number;
}

export interface WatchSession {
  v: 1;
  orgId: string;
  sourceId: string;
  title: string;
  channel: string;
  passages: WatchPassage[];
  notes: WatchNote[];
  updatedAt: number;
}

const store = keyedNotesStore({ bucket: 'watchSessions', source: 'elevate-player', maxLength: 20000, debounceMs: 1200 });
const memory = new Map<string, WatchSession>();
const keyOf = (orgId: string, sourceId: string) => `${orgId}/${sourceId}`;
const MAX_PASSAGES = 120;
const MAX_NOTES = 200;

function parse(text: string | undefined): WatchSession | null {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    return s && s.v === 1 && Array.isArray(s.passages) && Array.isArray(s.notes) ? (s as WatchSession) : null;
  } catch {
    return null;
  }
}

/** The session for this source: memory first, then the notebook, else a fresh empty one. */
export function readWatchSession(orgId: string, sourceId: string, title = '', channel = ''): WatchSession {
  const key = keyOf(orgId, sourceId);
  const hot = memory.get(key);
  if (hot) return hot;
  const saved = parse(store.read()[key]);
  const s: WatchSession = saved ?? { v: 1, orgId, sourceId, title, channel, passages: [], notes: [], updatedAt: 0 };
  memory.set(key, s);
  return s;
}

function save(s: WatchSession) {
  const key = keyOf(s.orgId, s.sourceId);
  memory.set(key, s);
  // Only sessions with something in them are worth a notebook entry.
  if (s.passages.length || s.notes.length) store.write(key, JSON.stringify(s));
}

/** Record a passage. The same passage twice in a row is one entry (a long reading, a repeat). */
export function addWatchPassage(s: WatchSession, p: WatchPassage): WatchSession {
  const last = s.passages[s.passages.length - 1];
  if (last && last.refId === p.refId && Math.abs(last.tc - p.tc) < 90) return s;
  const next: WatchSession = { ...s, passages: [...s.passages, p].slice(-MAX_PASSAGES), updatedAt: Date.now() };
  save(next);
  return next;
}

export function addWatchNote(s: WatchSession, n: WatchNote): WatchSession {
  const next: WatchSession = { ...s, notes: [n, ...s.notes].slice(0, MAX_NOTES), updatedAt: Date.now() };
  save(next);
  return next;
}

export function removeWatchNote(s: WatchSession, id: string): WatchSession {
  const next: WatchSession = { ...s, notes: s.notes.filter(n => n.id !== id), updatedAt: Date.now() };
  memory.set(keyOf(s.orgId, s.sourceId), next);
  store.write(keyOf(s.orgId, s.sourceId), next.passages.length || next.notes.length ? JSON.stringify(next) : '');
  return next;
}

/** The passage on screen at `tc`: for a replay the last one at or before the playhead, for live the newest. */
export function passageAt(s: WatchSession, tc: number, live: boolean): WatchPassage | null {
  if (!s.passages.length) return null;
  if (live) return s.passages[s.passages.length - 1];
  let best: WatchPassage | null = null;
  for (const p of s.passages) if (p.tc <= tc + 1 && (!best || p.tc >= best.tc)) best = p;
  return best ?? null;
}

/** Pull the account copy (other devices) into memory. Call once when the viewer mounts. */
export async function syncWatchSessions(): Promise<void> {
  const map = await store.sync();
  for (const [key, text] of Object.entries(map)) {
    const remote = parse(text);
    const local = memory.get(key);
    if (remote && (!local || remote.updatedAt > local.updatedAt)) memory.set(key, remote);
  }
}

export const subscribeWatchSessions = (fn: () => void) => store.subscribe(fn);
