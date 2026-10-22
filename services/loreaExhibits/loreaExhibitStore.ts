// loreaExhibitStore — loading, reading depth, opening, and nugget picking for the Lorea hall.
//
// The exhibits are one lazy chunk (data/loreaExhibits/all), so planting nuggets across Lorea and
// the feed never weighs down the pages they sit on. Reading depth is one shared preference so the
// hall, the nuggets and the feed card agree on whether the reader is seven or a graduate student.
import { useEffect, useState } from 'react';
import type { DepthLevel, LoreaExhibit, LoreaExhibitId, LoreaNugget } from './loreaExhibitTypes';

let cache: Promise<LoreaExhibit[]> | null = null;
export function loadLoreaExhibits(): Promise<LoreaExhibit[]> {
  if (!cache) cache = import('../../data/loreaExhibits/all').then(m => m.LOREA_EXHIBITS).catch(err => { cache = null; throw err; });
  return cache;
}

export function useLoreaExhibits(): LoreaExhibit[] | null {
  const [list, setList] = useState<LoreaExhibit[] | null>(null);
  useEffect(() => { let live = true; loadLoreaExhibits().then(l => { if (live) setList(l); }).catch(() => {}); return () => { live = false; }; }, []);
  return list;
}

// ── reading depth ──
const DEPTH_KEY = 'lorea:depth';
const DEPTH_EVENT = 'lorea:depth';
export function getLoreaDepth(): DepthLevel {
  try { const v = localStorage.getItem(DEPTH_KEY) as DepthLevel | null; if (v) return v; } catch { /* private mode */ }
  return 'high';
}
export function setLoreaDepth(d: DepthLevel) {
  try { localStorage.setItem(DEPTH_KEY, d); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(DEPTH_EVENT, { detail: d })); } catch { /* non-browser */ }
}
export function useLoreaDepth(): [DepthLevel, (d: DepthLevel) => void] {
  const [d, setD] = useState<DepthLevel>(getLoreaDepth);
  useEffect(() => {
    const h = (e: Event) => setD((e as CustomEvent).detail as DepthLevel);
    window.addEventListener(DEPTH_EVENT, h);
    return () => window.removeEventListener(DEPTH_EVENT, h);
  }, []);
  return [d, setLoreaDepth];
}

// ── opening ──
let requested: { id: LoreaExhibitId; roomId?: string } | null = null;
/** Open an exhibit (or the lobby with no id) from anywhere; App switches to the LOREA_EXHIBITS view. */
export function openLoreaExhibit(id?: LoreaExhibitId | null, roomId?: string) {
  try { window.dispatchEvent(new CustomEvent('plajah:openLoreaExhibit', { detail: { id: id ?? null, roomId } })); } catch { /* non-browser */ }
}
/** Called by App's listener before it switches views. */
export const requestLoreaExhibit = (id?: LoreaExhibitId | null, roomId?: string) => { requested = id ? { id, roomId } : null; };
export const takeRequestedLoreaExhibit = () => { const r = requested; requested = null; return r; };

// ── nuggets ──
const SEEN_KEY = 'lorea:nuggetsSeen';
function seenSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}
export function markNuggetSeen(id: string) {
  const s = seenSet(); if (s.has(id)) return; s.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300))); } catch { /* private mode */ }
}

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export interface PickedNugget { nugget: LoreaNugget; exhibit: LoreaExhibit }

/**
 * Pick the nugget for a spot. A spot shows something only on some days (`chance`), and what it
 * shows changes daily and prefers nuggets this reader has not met — so you never quite know where
 * the next one will turn up. `salt` lets one page host several spots without repeats.
 */
export function pickNugget(exhibits: LoreaExhibit[], spot: string, depth: DepthLevel, opts: { chance?: number; day?: number; exhibitId?: LoreaExhibitId } = {}): PickedNugget | null {
  const day = opts.day ?? Math.floor(Date.now() / 86_400_000);
  const chance = opts.chance ?? 1;
  if ((hash(`${spot}|gate|${day}`) % 1000) / 1000 >= chance) return null;
  const pool: PickedNugget[] = [];
  for (const ex of exhibits) {
    if (opts.exhibitId && ex.id !== opts.exhibitId) continue;
    for (const n of ex.nuggets) if (!n.depths || n.depths.includes(depth)) pool.push({ nugget: n, exhibit: ex });
  }
  if (!pool.length) return null;
  const seen = seenSet();
  const fresh = pool.filter(p => !seen.has(p.nugget.id));
  const from = fresh.length ? fresh : pool;
  return from[hash(`${spot}|${day}`) % from.length];
}

/** All nuggets suited to a depth, in a stable daily shuffle (for the feed). */
export function dailyNuggets(exhibits: LoreaExhibit[], depth: DepthLevel, day = Math.floor(Date.now() / 86_400_000)): PickedNugget[] {
  const out: PickedNugget[] = [];
  for (const ex of exhibits) for (const n of ex.nuggets) if (!n.depths || n.depths.includes(depth)) out.push({ nugget: n, exhibit: ex });
  return out.sort((a, b) => hash(`${a.nugget.id}|${day}`) - hash(`${b.nugget.id}|${day}`));
}
