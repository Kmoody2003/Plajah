// components/Fabula/anima/frameStore.ts — the playhead, outside React state.
// Playback changes the frame up to 60 times a second; only the parts that show it (timeline
// playhead, transport readout, inspector values) subscribe. The stage reads it every paint.

import { useSyncExternalStore } from 'react';

export interface FrameStore {
  get: () => number;
  set: (frame: number) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createFrameStore(initial = 1): FrameStore {
  let frame = initial;
  const subs = new Set<() => void>();
  return {
    get: () => frame,
    set: (f) => {
      if (f === frame) return;
      frame = f;
      subs.forEach((s) => s());
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useFrame(store: FrameStore): number {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
