// Reader-side page-turn settings (device-local). The AUTHOR's choice lives on the book edition; this is the
// reader's own override: follow the author, reduce to a quick fade, turn animation off, or force one style.
// Reduced-motion is also read from the OS (see components/lorea/usePageTurn.ts) and always wins.

import { isPageAnimationPref, type PageAnimationPref } from './pageTransitions';

export interface PageTurnPrefs { animation: PageAnimationPref; /** Soft page-rustle sound. OFF by default. */ sound: boolean }
export const DEFAULT_PAGE_TURN_PREFS: PageTurnPrefs = { animation: 'author', sound: false };

const KEY = 'lorea_page_turn_prefs';
const EVT = 'lorea:pageturn-prefs';

export function parsePrefs(raw: unknown): PageTurnPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PAGE_TURN_PREFS };
  const r = raw as Record<string, unknown>;
  return { animation: isPageAnimationPref(r.animation) ? r.animation : 'author', sound: r.sound === true };
}

export function readPageTurnPrefs(): PageTurnPrefs {
  try { const s = localStorage.getItem(KEY); return s ? parsePrefs(JSON.parse(s)) : { ...DEFAULT_PAGE_TURN_PREFS }; } catch { return { ...DEFAULT_PAGE_TURN_PREFS }; }
}
export function writePageTurnPrefs(p: PageTurnPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode / quota: setting just won't persist */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: p })); } catch { /* non-browser */ }
}
export function subscribePageTurnPrefs(fn: (p: PageTurnPrefs) => void): () => void {
  const h = () => fn(readPageTurnPrefs());
  window.addEventListener(EVT, h); window.addEventListener('storage', h);
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
}
