// routineHost — the bridge between the routine engine and the live presenter.
//
// routines.ts is pure and knows nothing about React. The presenter hands this
// file a PresenterHandlers object (its real take / clear / output functions);
// buildRoutineHost() turns that into the RoutineHost the registry calls, adding
// the pieces that need no presenter state (audio bus, auto-scripture, look).
// A module-level engine + layout store let the Routines tab and the scheduler
// in the presenter share one source of truth.

import { RoutineEngine, type RoutineHost } from './routines';
import { loadLayouts, saveLayouts, type OutputLayoutPreset } from './outputLayouts';
import { bus as audioBus, type BusTrack } from './audioBus';
import { startAutoScripture, stopAutoScripture } from './autoScripture';
import { setScriptureLook } from './scriptureLook';

// ── Shared singletons ────────────────────────────────────────────────────────

let engine: RoutineEngine | null = null;
/** One engine per window. Created lazily so tests/SSR never touch localStorage. */
export function getRoutineEngine(): RoutineEngine {
  if (!engine) engine = new RoutineEngine();
  return engine;
}

let layouts: OutputLayoutPreset[] | null = null;
const layoutListeners = new Set<() => void>();
let layoutVersion = 0;
export function getLayouts(): OutputLayoutPreset[] { if (!layouts) layouts = loadLayouts(); return layouts; }
export function setLayouts(next: OutputLayoutPreset[]): void {
  layouts = next; layoutVersion++; saveLayouts(next); layoutListeners.forEach(l => l());
}
export const subscribeLayouts = (fn: () => void) => { layoutListeners.add(fn); return () => { layoutListeners.delete(fn); }; };
export const getLayoutsVersion = () => layoutVersion;

// ── Presenter handlers ───────────────────────────────────────────────────────

export interface PresenterHandlers {
  takeSlide(a: { showId?: string; slideId?: string; index?: number }): void | Promise<void>;
  cueFirstSong(a: { showId?: string; take?: boolean }): void | Promise<void>;
  startVisualizer(a: { sourceId: string }): void | Promise<void>;
  clearLayers(a: { slot: string }): void | Promise<void>;
  openOutputs(a: { layoutId?: string; outputIds?: string[] }): void | Promise<void>;
  closeOutputs(a: { outputIds?: string[] }): void | Promise<void>;
  /** Optional: a countdown slide to put up while the timer runs. */
  startCountdown?(a: { timerId: string; seconds: number; label?: string; showId?: string }): void | Promise<void>;
  switchProject?(a: { projectId: string }): void | Promise<void>;
  showProp?(a: { propId: string }): void | Promise<void>;
  hideProp?(a: { propId?: string }): void | Promise<void>;
  switcherCut?(a: { sourceId: string }): void | Promise<void>;
  /** Optional: resolve a playlist id/name to tracks (Chora / project playlist). */
  resolvePlaylist?(a: { playlistId?: string; name?: string }): BusTrack[] | Promise<BusTrack[]>;
}

let fadeTimer: ReturnType<typeof setInterval> | null = null;
function fadeVolume(to: number, sec: number): Promise<void> {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  const from = audioBus.getSnapshot().volume;
  if (sec <= 0 || from === to) { audioBus.setVolume(to); return Promise.resolve(); }
  const steps = Math.max(1, Math.round(sec * 10));
  let i = 0;
  return new Promise(res => {
    fadeTimer = setInterval(() => {
      i++;
      audioBus.setVolume(from + (to - from) * (i / steps));
      if (i >= steps) { if (fadeTimer) clearInterval(fadeTimer); fadeTimer = null; res(); }
    }, 100);
  });
}

export function buildRoutineHost(h: () => PresenterHandlers): RoutineHost {
  return {
    takeSlide: a => h().takeSlide(a),
    takeShow: a => h().takeSlide({ showId: a.showId, index: a.index ?? 0 }),
    cueFirstSong: a => h().cueFirstSong(a),
    cue: a => h().takeSlide({ slideId: a.refId }),
    startVisualizer: a => h().startVisualizer(a),
    clearLayers: a => h().clearLayers(a),
    openOutputs: a => h().openOutputs(a),
    closeOutputs: a => h().closeOutputs(a),
    startCountdown: a => h().startCountdown?.(a),
    switchProject: a => { const f = h().switchProject; if (!f) throw new Error('Project switching not available'); return f(a); },
    showProp: a => { const f = h().showProp; if (!f) throw new Error('Props not available'); return f(a); },
    hideProp: a => (h().hideProp ? h().hideProp!(a) : h().clearLayers({ slot: 'prop' })),
    switcherCut: a => { const f = h().switcherCut; if (!f) throw new Error('No switcher connected'); return f(a); },

    // — audio bus (no presenter state needed)
    playAudio: a => {
      const t: BusTrack = { id: `routine_${a.src}`, title: a.src.split(/[\\/]/).pop() || a.src, url: a.src };
      audioBus.setVolume(a.volume ?? 1);
      audioBus.playQueue([t]);
      audioBus.setRepeat(a.loop ? 'one' : 'off');
    },
    stopAudio: async a => {
      if (a?.fadeSec && a.fadeSec > 0) audioBus.fadeOut(a.fadeSec); else audioBus.pause();
    },
    setVolume: a => fadeVolume(a.volume, a.fadeSec ?? 0),
    playPlaylist: async a => {
      const tracks = (await h().resolvePlaylist?.({ playlistId: a.playlistId, name: a.name })) ?? [];
      if (a.volume != null) audioBus.setVolume(a.volume);
      if (tracks.length) { audioBus.playQueue(tracks, 0, { shuffle: !!a.shuffle }); return; }
      // No resolver / empty: play whatever the operator already queued rather than staying silent.
      if (audioBus.getSnapshot().queue.length) { audioBus.play(); return; }
      throw new Error(`Playlist not found: ${a.name || a.playlistId || '(none selected)'}`);
    },

    // — look
    setScriptureLook: a => { setScriptureLook({ layoutId: a.lookId }); },
    autoScripture: async a => { if (a.on) await startAutoScripture(); else stopAutoScripture(); },
  };
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}:${p(m)}:${p(sec)}`;
  return `${m}:${p(sec)}`;
}

/**
 * Layout actions the live presenter registers (needs its outputs, router and
 * screens). The Routines tab calls through this so it holds no presenter state.
 */
export const layoutApi: {
  capture?: (name: string) => Promise<OutputLayoutPreset | null>;
  apply?: (layoutId: string) => Promise<void>;
  closeAll?: () => void;
} = {};
