// Fabula subtitle clips <-> the caption engine's cues. A subtitle track IS a caption track: its
// clips are the cues, their `cap` field carries the broadcast presentation (mode, rows, placement,
// speaker), and the track itself carries language + 608 data channel. Pure, unit-tested.

import { rateById, rateFromFps, secToFrame, frameToSec, type CaptionCue, type FrameRate } from '../../../services/crossover/captions';

export interface CapFields { mode?: CaptionCue['mode']; rollRows?: CaptionCue['rollRows']; row?: number; align?: CaptionCue['align']; speaker?: string }

export const isCaptionClip = (c: any) => c?.kind === 'subtitle';

export function clipToCue(c: any): CaptionCue {
  const cap: CapFields = c.cap || {};
  return { id: c.id, startSec: c.start, endSec: c.start + c.duration, text: c.text || '', ...cap };
}

export function cuesOfTrack(clips: any[], trackId: string): CaptionCue[] {
  return clips.filter((c) => isCaptionClip(c) && c.trackId === trackId).map(clipToCue).sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
}

const capOf = (cue: CaptionCue): CapFields | undefined => {
  const cap: CapFields = {};
  if (cue.mode && cue.mode !== 'popon') cap.mode = cue.mode;
  if (cue.mode === 'rollup' && cue.rollRows) cap.rollRows = cue.rollRows;
  if (cue.row && cue.row !== 15) cap.row = cue.row;
  if (cue.align && cue.align !== 'center') cap.align = cue.align;
  if (cue.speaker) cap.speaker = cue.speaker;
  return Object.keys(cap).length ? cap : undefined;
};

/** Replace one track's caption clips with `cues`, keeping everything else on the timeline. */
export function applyCuesToTrack(clips: any[], trackId: string, cues: CaptionCue[], makeId: () => string, baseFx: any): any[] {
  const existing = new Map(clips.filter((c) => isCaptionClip(c) && c.trackId === trackId).map((c) => [c.id, c]));
  const others = clips.filter((c) => !(isCaptionClip(c) && c.trackId === trackId));
  const next = cues.map((cue) => {
    const prev = existing.get(cue.id);
    const cap = capOf(cue);
    const clip: any = {
      ...(prev || { kind: 'subtitle', srcIn: 0, fx: { ...baseFx } }),
      id: prev ? prev.id : (cue.id && !cue.id.startsWith('cue') ? cue.id : makeId()),
      trackId, kind: 'subtitle',
      start: Math.max(0, cue.startSec), duration: Math.max(0.05, cue.endSec - cue.startSec),
      text: cue.text, label: cue.text.replace(/<[^>]+>/g, '').split('\n')[0].slice(0, 28) || 'Caption',
    };
    if (cap) clip.cap = cap; else delete clip.cap;
    return clip;
  });
  return [...others, ...next];
}

/** The project's caption timecode rate: 29.97/59.94 honour the drop-frame switch. */
export function captionRate(fps: number, drop: boolean): FrameRate {
  const r = rateFromFps(fps);
  if (r.id === '29.97df' && !drop) return rateById('29.97ndf');
  if (r.id === '59.94df' && !drop) return rateById('59.94ndf');
  return r;
}

/** Round every in/out to the frame grid (what broadcast files can actually express). */
export function snapCuesToFrames(cues: CaptionCue[], rate: FrameRate): CaptionCue[] {
  return cues.map((c) => {
    const s = frameToSec(secToFrame(c.startSec, rate), rate);
    const e = Math.max(s + frameToSec(1, rate), frameToSec(secToFrame(c.endSec, rate), rate));
    return { ...c, startSec: s, endSec: e };
  });
}

/**
 * Enforce a minimum gap between captions: a gap smaller than `minGapFrames` is closed when it's at
 * most half the minimum (chained captions read better touching than flickering), otherwise opened
 * up to the minimum by pulling the earlier caption's out point in.
 */
export function enforceGaps(cues: CaptionCue[], rate: FrameRate, minGapFrames: number, closeUnderFrames = Math.floor(minGapFrames / 2)): CaptionCue[] {
  if (minGapFrames <= 0) return cues;
  const out = [...cues].sort((a, b) => a.startSec - b.startSec).map((c) => ({ ...c }));
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    const gap = secToFrame(b.startSec, rate) - secToFrame(a.endSec, rate);
    if (gap < 0 || gap >= minGapFrames) continue;
    if (gap > 0 && gap <= closeUnderFrames) a.endSec = b.startSec;
    else a.endSec = Math.max(a.startSec + frameToSec(1, rate), frameToSec(secToFrame(b.startSec, rate) - minGapFrames, rate));
  }
  return out;
}

/** Split a cue at a time (frame-snapped), dividing the words in proportion to the time. */
export function splitCue(cue: CaptionCue, at: number, makeId: () => string): [CaptionCue, CaptionCue] | null {
  if (at <= cue.startSec + 0.05 || at >= cue.endSec - 0.05) return null;
  const words = cue.text.replace(/\n/g, ' \n ').split(' ').filter((w) => w !== '');
  const frac = (at - cue.startSec) / (cue.endSec - cue.startSec);
  const cut = Math.max(1, Math.min(words.length - 1, Math.round(words.length * frac)));
  const join = (ws: string[]) => ws.join(' ').replace(/ ?\n ?/g, '\n').trim();
  return [
    { ...cue, endSec: at, text: join(words.slice(0, cut)) || cue.text },
    { ...cue, id: makeId(), startSec: at, text: join(words.slice(cut)) || '' },
  ];
}

export function mergeCues(a: CaptionCue, b: CaptionCue): CaptionCue {
  return { ...a, endSec: Math.max(a.endSec, b.endSec), text: `${a.text.trim()}\n${b.text.trim()}`.trim() };
}

/** Characters per second the way QC counts them. */
export const cpsOf = (c: CaptionCue) => {
  const chars = c.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
  const d = c.endSec - c.startSec;
  return d > 0 ? chars / d : Infinity;
};
