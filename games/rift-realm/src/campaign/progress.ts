// Campaign progress: saved on the device first (localStorage, works offline and for guests), then synced to the player's
// Plajah cloud save when the game runs inside Plajah (IframeGameFrame + services/gameSaves.ts, `plajah.save.*`
// postMessage protocol in services/gameSaveCore.ts, game id 'rift-realm').
//
// The cloud doc is one JSON string per player per game; the campaign lives under its `campaign` key so other features
// can share the doc. Merge rule (both directions): a chapter is cleared if either copy cleared it; the better best time,
// the higher kills / clears; `last` from the newer copy. A store that loses a rev race merges with the cloud and retries.
import { chapterKey } from './data';

const KEY = 'rift-realm-campaign';
const GAME_ID = 'rift-realm';

export interface ChapterRec { cleared: boolean; bestTime: number | null; kills: number; clears: number }
export interface CampaignSave {
  v: 1;
  updatedAt: number;
  last: { campaign: string; chapter: number } | null;
  chapters: Record<string, ChapterRec>;
}

const empty = (): CampaignSave => ({ v: 1, updatedAt: 0, last: null, chapters: {} });

function sane(x: unknown): CampaignSave {
  const s = empty();
  if (!x || typeof x !== 'object') return s;
  const o = x as Partial<CampaignSave>;
  s.updatedAt = typeof o.updatedAt === 'number' ? o.updatedAt : 0;
  if (o.last && typeof o.last.campaign === 'string' && typeof o.last.chapter === 'number') s.last = { campaign: o.last.campaign, chapter: o.last.chapter };
  for (const [k, r] of Object.entries(o.chapters ?? {})) {
    if (!r || typeof r !== 'object') continue;
    s.chapters[k] = { cleared: !!r.cleared, bestTime: typeof r.bestTime === 'number' ? r.bestTime : null, kills: Number(r.kills) || 0, clears: Number(r.clears) || 0 };
  }
  return s;
}

export function mergeSaves(a: CampaignSave, b: CampaignSave): CampaignSave {
  const out = empty();
  out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
  out.last = (a.updatedAt >= b.updatedAt ? a.last ?? b.last : b.last ?? a.last);
  for (const k of new Set([...Object.keys(a.chapters), ...Object.keys(b.chapters)])) {
    const x = a.chapters[k], y = b.chapters[k];
    if (!x || !y) { out.chapters[k] = { ...(x ?? y)! }; continue; }
    const times = [x.bestTime, y.bestTime].filter((t): t is number => t !== null);
    out.chapters[k] = { cleared: x.cleared || y.cleared, bestTime: times.length ? Math.min(...times) : null, kills: Math.max(x.kills, y.kills), clears: Math.max(x.clears, y.clears) };
  }
  return out;
}

let save: CampaignSave = (() => { try { return sane(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return empty(); } })();
const listeners = new Set<() => void>();
function writeLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode / full */ }
  for (const f of listeners) f();
}

export const progress = {
  get(): CampaignSave { return save; },
  onChange(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  rec(id: string, n: number): ChapterRec | undefined { return save.chapters[chapterKey(id, n)]; },
  cleared(id: string, n: number) { return !!save.chapters[chapterKey(id, n)]?.cleared; },
  /** chapter 1 is always open; n opens when n-1 is cleared (?campaignunlock opens everything, for testing) */
  unlocked(id: string, n: number) { return n <= 1 || this.cleared(id, n - 1) || new URLSearchParams(location.search).has('campaignunlock'); },
  clearedCount(id: string, total: number) { let k = 0; for (let n = 1; n <= total; n++) if (this.cleared(id, n)) k++; return k; },
  /** the chapter was started: remembered as "continue" */
  started(id: string, n: number) { save.last = { campaign: id, chapter: n }; save.updatedAt = Date.now(); writeLocal(); void cloud.push(); },
  /** a chapter was cleared: record it, save, sync. Returns whether it was a new best time. */
  recordClear(id: string, n: number, time: number, kills: number): { best: boolean; rec: ChapterRec } {
    const k = chapterKey(id, n), old = save.chapters[k];
    const best = !old?.bestTime || time < old.bestTime;
    const rec: ChapterRec = { cleared: true, bestTime: best ? time : old!.bestTime, kills: Math.max(old?.kills ?? 0, kills), clears: (old?.clears ?? 0) + 1 };
    save.chapters[k] = rec; save.last = { campaign: id, chapter: n }; save.updatedAt = Date.now();
    writeLocal(); void cloud.push();
    return { best, rec };
  },
  /** for tests: forget everything on this device */
  reset() { save = empty(); writeLocal(); },
};

// ── cloud: the Plajah game-save bridge (only inside Plajah's game frame, signed in) ──
type Result = { type: 'plajah.save.result'; reqId: string; op: 'load' | 'store'; ok: boolean; rev: number; data: string | null; conflict?: boolean; error?: string };
const embedded = () => window.parent !== window;
let available: boolean | null = null;
let rev = 0;
let other: Record<string, unknown> = {}; // the rest of the shared cloud doc, kept as-is
let seq = 0;
let pushing: Promise<void> | null = null, again = false;

function ask<T>(msg: Record<string, unknown>, match: (d: any) => boolean, ms = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    const on = (e: MessageEvent) => { if (e.source !== window.parent || !match(e.data)) return; window.removeEventListener('message', on); clearTimeout(t); resolve(e.data as T); };
    const t = window.setTimeout(() => { window.removeEventListener('message', on); resolve(null); }, ms);
    window.addEventListener('message', on);
    window.parent.postMessage({ ...msg, gameId: GAME_ID }, '*');
  });
}
const request = (type: 'plajah.save.load' | 'plajah.save.store', extra: Record<string, unknown> = {}) => {
  const reqId = `rr-camp-${Date.now()}-${++seq}`;
  return ask<Result>({ type, reqId, ...extra }, (d) => d?.type === 'plajah.save.result' && d.reqId === reqId);
};
/** Merge the cloud doc in; returns the cloud's campaign part (null when there was none). */
function absorb(data: string | null): CampaignSave | null {
  if (!data) return null;
  try {
    const doc = JSON.parse(data) as Record<string, unknown>;
    const { campaign, ...rest } = doc;
    other = rest;
    const theirs = sane(campaign), merged = mergeSaves(save, theirs);
    if (JSON.stringify(merged) !== JSON.stringify(save)) { save = merged; writeLocal(); }
    return theirs;
  } catch { return null; /* someone else's shape: leave it, ours wins on the next store */ }
}

async function hello(): Promise<boolean> {
  if (!embedded()) available = false;
  if (available === null) {
    const h = await ask<{ available: boolean }>({ type: 'plajah.save.hello' }, (d) => d?.type === 'plajah.save.hello.result', 3000);
    available = !!h?.available;
  }
  return available;
}

export const cloud = {
  get available() { return available; },
  /** On boot: is there a cloud save? Pull and merge it, then push the merge if the device had more. */
  async sync(): Promise<void> {
    if (!(await hello())) return;
    const r = await request('plajah.save.load');
    if (!r?.ok) return;
    rev = r.rev;
    const theirs = absorb(r.data);
    // the device had something the cloud didn't: store the merge
    if (!theirs || JSON.stringify(mergeSaves(theirs, empty())) !== JSON.stringify(mergeSaves(save, empty()))) await cloud.push();
  },
  /** Store the save (coalesced; merges and retries once on a rev conflict). */
  push(): Promise<void> {
    if (!embedded() || available === false) return Promise.resolve();
    if (pushing) { again = true; return pushing; }
    pushing = (async () => {
      if (!(await hello())) return; // rev unknown before a sync: a conflict reply carries the cloud copy to merge
      for (let tries = 0; tries < 2; tries++) {
        const r = await request('plajah.save.store', { baseRev: rev, data: JSON.stringify({ ...other, campaign: save }) });
        if (!r) return;
        if (r.ok) { rev = r.rev; return; }
        if (r.conflict) { rev = r.rev; absorb(r.data); continue; }
        return; // too fast / too large: the device copy is safe, the next change pushes again
      }
    })().finally(() => { pushing = null; if (again) { again = false; window.setTimeout(() => void cloud.push(), 2200); } });
    return pushing;
  },
};
