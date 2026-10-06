/**
 * postAnalyticsService — author-facing post stats.
 *
 * postStats/{postId}: {
 *   authorId, impressions, uniqueViewers, dwellMs, profileVisits, followsFromPost,
 *   hourly: { "0".."23": n }  (local hour of day an impression happened),
 *   referrers: { FEED|PROFILE|SEARCH|HASHTAG|SHARE|OTHER: n }, updatedAt }
 *
 * Privacy/abuse model: only the author can READ the doc. Any signed-in viewer
 * may write ONLY bounded increments (rules cap each batched write), and the
 * doc can only be created with the post's real authorId. There are no
 * per-viewer docs; de-dupe happens client-side:
 *   - one impression per viewer per post per day  (localStorage day set)
 *   - "unique viewer" counted once ever per browser (localStorage seen set)
 * so numbers are approximate (cleared storage / second device re-counts).
 * The author's own views are never counted.
 */
import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  classifyImpression, dayKey, stripUndefined, type PostStatsDoc, type StatReferrer,
} from './postingLogic';

const MAX_DWELL_PER_VIEW_MS = 60_000;
const FLUSH_MS = 8_000;

// ── localStorage dedupe sets ─────────────────────────────────────────────────

function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function writeSet(key: string, s: Set<string>, cap: number) {
  try { localStorage.setItem(key, JSON.stringify([...s].slice(-cap))); } catch { /* ignore */ }
}
const todayKeyFor = (uid: string) => `plajah.imp.${uid}.${dayKey(Date.now())}`;
const everKeyFor = (uid: string) => `plajah.seen.${uid}`;

// ── Batched writer ───────────────────────────────────────────────────────────

interface Pending {
  authorId: string;
  impressions: number; unique: number; dwellMs: number;
  hourly: Record<string, number>; referrers: Record<string, number>;
}
const queue = new Map<string, Pending>();
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

function pendingFor(postId: string, authorId: string): Pending {
  let p = queue.get(postId);
  if (!p) { p = { authorId, impressions: 0, unique: 0, dwellMs: 0, hourly: {}, referrers: {} }; queue.set(postId, p); }
  return p;
}

function schedule() {
  if (!hooked && typeof document !== 'undefined') {
    hooked = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushPostStats(); });
    window.addEventListener('pagehide', () => { void flushPostStats(); });
  }
  if (!timer) timer = setTimeout(() => { timer = null; void flushPostStats(); }, FLUSH_MS);
}

/** Count an impression (once per viewer/post/day). Returns true if it counted. */
export function queueImpression(postId: string, authorId: string, referrer: StatReferrer = 'FEED'): boolean {
  const uid = auth.currentUser?.uid;
  if (!uid || uid === authorId) return false;
  const dayK = todayKeyFor(uid), everK = everKeyFor(uid);
  const seenToday = readSet(dayK), seenEver = readSet(everK);
  const c = classifyImpression(postId, { seenToday, seenEver });
  if (!c.impression) return false;
  seenToday.add(postId); writeSet(dayK, seenToday, 600);
  if (c.unique) { seenEver.add(postId); writeSet(everK, seenEver, 2000); }
  const p = pendingFor(postId, authorId);
  p.impressions += 1;
  if (c.unique) p.unique += 1;
  const h = String(new Date().getHours());
  p.hourly[h] = (p.hourly[h] || 0) + 1;
  p.referrers[referrer] = (p.referrers[referrer] || 0) + 1;
  schedule();
  return true;
}

/** Add visible time for a post the viewer has been counted on. */
export function queueDwell(postId: string, authorId: string, ms: number): void {
  const uid = auth.currentUser?.uid;
  if (!uid || uid === authorId || !(ms > 0)) return;
  pendingFor(postId, authorId).dwellMs += Math.min(Math.round(ms), MAX_DWELL_PER_VIEW_MS);
  schedule();
}

/** Write everything queued (one bounded setDoc per post). Never throws. */
export async function flushPostStats(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!auth.currentUser || queue.size === 0) return;
  const batch = [...queue.entries()];
  queue.clear();
  await Promise.all(batch.map(async ([postId, p]) => {
    const hourly: Record<string, any> = {};
    for (const [h, n] of Object.entries(p.hourly)) hourly[h] = increment(Math.min(n, 25));
    const referrers: Record<string, any> = {};
    for (const [r, n] of Object.entries(p.referrers)) referrers[r] = increment(Math.min(n, 25));
    const data: Record<string, any> = { authorId: p.authorId, updatedAt: Date.now() };
    if (p.impressions) data.impressions = increment(Math.min(p.impressions, 25));
    if (p.unique) data.uniqueViewers = increment(Math.min(p.unique, 25));
    if (p.dwellMs) data.dwellMs = increment(Math.min(p.dwellMs, 120_000));
    if (Object.keys(hourly).length) data.hourly = hourly;
    if (Object.keys(referrers).length) data.referrers = referrers;
    try { await setDoc(doc(db, 'postStats', postId), data, { merge: true }); } catch { /* stats are best-effort */ }
  }));
}

/** Call from the profile-open / follow-button code paths when they originate from a post card. */
export async function recordPostStat(postId: string, authorId: string, kind: 'profileVisits' | 'followsFromPost'): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || uid === authorId) return;
  try {
    await setDoc(doc(db, 'postStats', postId), { authorId, [kind]: increment(1), updatedAt: Date.now() }, { merge: true });
  } catch { /* best-effort */ }
}

/** Author-only read. Null if there are no stats yet (or caller isn't the author). */
export async function fetchPostStats(postId: string): Promise<PostStatsDoc | null> {
  try {
    const s = await getDoc(doc(db, 'postStats', postId));
    return s.exists() ? (stripUndefined(s.data()) as PostStatsDoc) : null;
  } catch { return null; }
}
