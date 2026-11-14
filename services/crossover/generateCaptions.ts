// Generate captions from a video's speech, on this device. Audio is cut at quiet points into pieces
// the recogniser handles well, each piece's timestamps are moved back to programme time, and the
// result is shaped into readable, broadcast-sized cues. Nothing leaves the device.

import { ensureBestAsr, type AsrChunk } from '../ambo/asrEngine';
import { newCueId, type CaptionCue } from './captions/model';
import { COLS, wrapLines } from './captions/cea608';

const RATE = 16000;
const WINDOW_SEC = 28;

/** Windows that end at the quietest moment near the limit, so no word is cut in half. */
export function planWindows(pcm: Float32Array, windowSec = WINDOW_SEC, rate = RATE): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const hop = Math.floor(rate * 0.05);
  let start = 0;
  while (start < pcm.length) {
    const hardEnd = Math.min(pcm.length, start + windowSec * rate);
    if (hardEnd >= pcm.length) { out.push({ start, end: pcm.length }); break; }
    let best = hardEnd;
    let bestEnergy = Infinity;
    for (let at = hardEnd - 5 * rate; at < hardEnd; at += hop) {
      let e = 0;
      for (let i = at; i < at + hop; i++) e += pcm[i] * pcm[i];
      if (e < bestEnergy) { bestEnergy = e; best = at + (hop >> 1); }
    }
    out.push({ start, end: best });
    start = best;
  }
  return out;
}

export interface ShapeOptions { maxRows?: number; maxCps?: number; minDurationSec?: number; maxDurationSec?: number }

/** Turn timed transcript segments into captions that fit the screen and can be read. */
export function shapeCues(chunks: { text: string; start: number; end: number }[], opts: ShapeOptions = {}): CaptionCue[] {
  const maxRows = opts.maxRows ?? 2;
  const minDur = opts.minDurationSec ?? 1;
  const maxDur = opts.maxDurationSec ?? 7;
  const cues: CaptionCue[] = [];

  for (const chunk of chunks) {
    const text = chunk.text.replace(/\s+/g, ' ').trim();
    if (!text || /^[\[(].*[\])]$/.test(text)) continue; // [Music], (silence): not speech we can vouch for
    const dur = Math.max(0.2, chunk.end - chunk.start);
    const pieces = splitForScreen(text, maxRows);
    const total = pieces.reduce((n, p) => n + p.length, 0) || 1;
    let t = chunk.start;
    pieces.forEach((piece, i) => {
      const share = i === pieces.length - 1 ? chunk.end - t : (dur * piece.length) / total;
      cues.push({ id: newCueId(), startSec: t, endSec: t + share, text: wrapLines(piece).join('\n') });
      t += share;
    });
  }

  // Readability: nothing flashes, nothing overlaps, nothing lingers after the words stop.
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const nextStart = cues[i + 1]?.startSec ?? Infinity;
    if (c.endSec - c.startSec < minDur) c.endSec = Math.min(c.startSec + minDur, nextStart);
    if (c.endSec - c.startSec > maxDur) c.endSec = c.startSec + maxDur;
    if (c.endSec > nextStart) c.endSec = nextStart;
  }
  return cues;
}

/** Break at sentence ends, then clauses, then spaces, so each piece fits `maxRows` rows. */
function splitForScreen(text: string, maxRows: number): string[] {
  if (wrapLines(text).length <= maxRows) return [text];
  const limit = Math.floor(COLS * maxRows * 0.9);
  const out: string[] = [];
  let rest = text;
  while (rest) {
    if (wrapLines(rest).length <= maxRows) { out.push(rest); break; }
    const slice = rest.slice(0, limit + 1);
    let cut = -1;
    for (const re of [/[.?!]["”]?\s/g, /[,;:]\s/g, /\s(?:and|but|so|or|because|that|which)\s/g]) {
      const found = [...slice.matchAll(re)];
      const last = found.reverse().find(m => m.index! > limit * 0.4);
      if (last) { cut = last.index! + (re.source.startsWith('\\s') ? 0 : 1); break; }
    }
    if (cut < 0) cut = slice.lastIndexOf(' ');
    if (cut <= 0) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return out;
}

export interface GenerateProgress { stage: 'audio' | 'model' | 'speech'; progress: number; message: string; partial?: CaptionCue[]; etaSec?: number }

export async function generateCaptions(
  pcm: Float32Array,
  onProgress: (p: GenerateProgress) => void,
  signal?: AbortSignal,
  shape?: ShapeOptions,
): Promise<CaptionCue[]> {
  onProgress({ stage: 'model', progress: 0, message: 'Loading the speech model' });
  const asr = await ensureBestAsr();
  const windows = planWindows(pcm);
  const chunks: AsrChunk[] = [];
  const started = performance.now();
  for (let i = 0; i < windows.length; i++) {
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    const w = windows[i];
    const piece = pcm.slice(w.start, w.end);
    const res = await asr.transcribe(piece, { timestamps: true, background: true });
    const offset = w.start / RATE;
    const windowEnd = w.end / RATE;
    for (const c of res.chunks) {
      chunks.push({ ...c, start: c.start + offset, end: Math.min(windowEnd, (c.end ?? c.start + 2) + offset) });
    }
    const done = i + 1;
    const elapsed = (performance.now() - started) / 1000;
    onProgress({
      stage: 'speech',
      progress: done / windows.length,
      message: `Listening: ${done} of ${windows.length}`,
      partial: shapeCues(chunks, shape),
      etaSec: (elapsed / done) * (windows.length - done),
    });
  }
  return shapeCues(chunks, shape);
}
