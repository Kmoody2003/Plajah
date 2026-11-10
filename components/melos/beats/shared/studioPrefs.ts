// Chora Studio view preferences — how the Mixer and Timeline are laid out on THIS device (which
// sections show, whether MEKA is folded). They're layout, not the song, so they live outside the
// groove doc (no undo entries, nothing synced to collaborators) and every view reads one store —
// fold MEKA in the Mixer and the Timeline's MEKA lanes fold too.

import { useSyncExternalStore } from 'react';

export type MekaMode = 'open' | 'folded' | 'hidden';

export interface StudioPrefs {
  /** MEKA pads in the Mixer + Timeline: every pad, one folder strip/row, or hidden (Mixer). */
  meka: MekaMode;
  mixerTracks: boolean;
  mixerBuses: boolean;
  mixerReturns: boolean;
  /** Master column: the compact meter readout (expands to the full Meter Bridge). */
  mixerMeters: boolean;
  mixerBridgeOpen: boolean;
  mixerCouncil: boolean;
}

const KEY = 'chora:studio:prefs';
const DEFAULTS: StudioPrefs = {
  meka: 'open', mixerTracks: true, mixerBuses: true, mixerReturns: true,
  mixerMeters: true, mixerBridgeOpen: false, mixerCouncil: false,
};

let state: StudioPrefs = (() => {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<StudioPrefs>) }; } catch { return DEFAULTS; }
})();
const subs = new Set<() => void>();

export function setStudioPref<K extends keyof StudioPrefs>(k: K, v: StudioPrefs[K]): void {
  state = { ...state, [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}

export function useStudioPrefs(): StudioPrefs {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => state);
}
