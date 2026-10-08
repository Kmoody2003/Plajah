// looksOverlay — whether the album art itself is currently "dressed" in a Look, and which one.
//
// Distinct from looksSession (a transient council PREVIEW) and looksLibrary (the saved set / per-track pins):
// this is the user's persistent choice for the Art view. Priority when picking what to draw over the cover:
//   council preview (looksSession) > the look the user stepped to here (lookId) > this track's pin > house default.

import { useSyncExternalStore } from 'react';

export interface LooksOverlayState { enabled: boolean; lookId?: string }

const KEY = 'plajah.looks.overlay.v1';
let state: LooksOverlayState = (() => {
  try { const s = localStorage.getItem(KEY); if (s) { const o = JSON.parse(s); return { enabled: !!o.enabled, lookId: typeof o.lookId === 'string' ? o.lookId : undefined }; } } catch { /* private mode */ }
  return { enabled: false };
})();
const subs = new Set<() => void>();

export const getLooksOverlay = () => state;
export function setLooksOverlay(patch: Partial<LooksOverlayState> | ((s: LooksOverlayState) => Partial<LooksOverlayState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* convenience only */ }
  subs.forEach(f => { try { f(); } catch { /* a bad subscriber must not break the toggle */ } });
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useLooksOverlay = (): LooksOverlayState => useSyncExternalStore(subscribe, getLooksOverlay, getLooksOverlay);
