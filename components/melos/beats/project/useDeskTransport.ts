// The Mastering Desk transport — play the album from a cursor and roll track to track, the way
// Studio One's Project page plays. Each track auditions through its own inserts + pressing on
// the live master bus (BeatsEngine.playAudition), so what you hear is what the render prints;
// gaps wait in silence and a crossfaded neighbour picks up where the overlap puts it. Exact
// crossfade blending is what "In→Out" (an offline render of the range) is for.
//
// Loop: while the In/Out locators are set and loop is on, crossing Out jumps back to In.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { albumLayout, effectiveDur, type MasterProjectDoc, type ProjectTrack } from '../../../../services/melos/beats/masterProject';

export interface DeskTransport {
  cursorSec: number;
  setCursor: (sec: number) => void;
  playing: boolean;
  play: (fromSec?: number) => Promise<void>;
  stop: () => void;
  /** Album-clock position while the transport is rolling, else null. */
  getPlayPos: () => number | null;
  /** Where the current audition sits on the album clock (for the strip playhead). */
  originRef: React.MutableRefObject<number>;
}

export function useDeskTransport(
  project: MasterProjectDoc,
  ensureBuffer: (t: ProjectTrack) => Promise<AudioBuffer | null>,
  onError?: (msg: string) => void,
): DeskTransport {
  const [cursorSec, setCursorSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const projectRef = useRef(project); projectRef.current = project;
  const originRef = useRef(0);
  const rollId = useRef(0);             // bumps on every play/stop — stale callbacks bail
  const rollingTrack = useRef<string | null>(null);
  /** A track start is in flight (decoding / engine init) — the bus is legitimately empty. */
  const starting = useRef(false);
  const gap = useRef<{ fromSec: number; at: number; timer: number } | null>(null);

  const clearGap = () => { if (gap.current) { window.clearTimeout(gap.current.timer); gap.current = null; } };

  const getPlayPos = useCallback((): number | null => {
    if (gap.current) return gap.current.fromSec + (performance.now() - gap.current.at) / 1000;
    const e = BeatsEngine.get();
    const id = e.auditionId();
    if (!id || id !== rollingTrack.current) return null;
    return originRef.current + e.auditionPosSec();
  }, []);

  const stop = useCallback(() => {
    rollId.current++;
    clearGap();
    rollingTrack.current = null;
    BeatsEngine.get().stopAudition();
    setPlaying(false);
  }, []);

  /** Start the track that owns album time `sec` (or the next one after a gap). */
  const playAt = useCallback(async (sec: number, roll: number): Promise<void> => {
    if (roll !== rollId.current) return;
    const layout = albumLayout(projectRef.current);
    const p = projectRef.current;
    const loopOut = p.loopOn && p.inSec != null && p.outSec != null && p.outSec > p.inSec ? p.outSec : null;
    // The LAST track that has started by `sec` — inside a crossfade that's the incoming one.
    let laid = [...layout.tracks].reverse().find((l) => sec >= l.startSec - 1e-3 && sec < l.endSec);
    if (!laid) {
      const next = layout.tracks.find((l) => l.startSec > sec);
      if (!next) {
        if (loopOut != null) { void playAt(p.inSec!, roll); return; }
        stop(); return;
      }
      // In a gap: wait it out, with the clock still moving.
      const wait = next.startSec - sec;
      clearGap();
      gap.current = { fromSec: sec, at: performance.now(), timer: window.setTimeout(() => { gap.current = null; void playAt(next.startSec, roll); }, wait * 1000) };
      rollingTrack.current = null;
      return;
    }
    laid = laid!;
    const t = laid.track;
    starting.current = true;
    try {
      const buf = await ensureBuffer(t);
      if (roll !== rollId.current) return;
      if (!buf) { onError?.(`Couldn't load ${t.title}`); stop(); return; }
      const dur = effectiveDur(t);
      const offsetSec = Math.max(0, sec - laid.startSec);
      const startSec = laid.startSec;
      const endSec = laid.endSec;
      await BeatsEngine.get().playAudition(t.id, buf, t.mastering ?? null, t.insertFx, {
        fileOffsetSec: t.startOffsetSec ?? 0,
        offsetSec,
        durationSec: dur,
        onEnded: () => { if (roll !== rollId.current) return; rollingTrack.current = null; void playAt(endSec, roll); },
      });
      if (roll !== rollId.current) return;
      // Only once the engine owns the audition is it "ours" for the watcher and the clock.
      originRef.current = startSec;
      rollingTrack.current = t.id;
    } finally {
      starting.current = false;
    }
  }, [ensureBuffer, onError, stop]);

  const play = useCallback(async (fromSec?: number) => {
    stop();
    const roll = ++rollId.current;
    setPlaying(true);
    const at = fromSec ?? cursorSec;
    await playAt(at, roll);
  }, [cursorSec, playAt, stop]);

  // Loop watcher — crossing Out jumps to In.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const p = projectRef.current;
      if (!p.loopOn || p.inSec == null || p.outSec == null || p.outSec <= p.inSec) return;
      const pos = getPlayPos();
      if (pos != null && pos >= p.outSec) { void play(p.inSec); }
    }, 30);
    return () => window.clearInterval(id);
  }, [playing, getPlayPos, play]);

  // Something else took the bus (a row's ▶, the lyric sync, a range render) — we're not rolling.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const e = BeatsEngine.get().auditionId();
      if (!gap.current && !starting.current && rollingTrack.current && e !== rollingTrack.current) { rollId.current++; rollingTrack.current = null; setPlaying(false); }
    }, 200);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => () => { rollId.current++; clearGap(); }, []);

  const setCursor = useCallback((sec: number) => {
    setCursorSec(Math.max(0, sec));
    // Seeking while rolling continues from the new spot, like any DAW.
    if (rollingTrack.current || gap.current) void play(Math.max(0, sec));
  }, [play]);

  return { cursorSec, setCursor, playing, play, stop, getPlayPos, originRef };
}
