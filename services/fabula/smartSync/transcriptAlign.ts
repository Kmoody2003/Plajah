// Transcript sync — line angles up by WHAT WAS SAID, not how it sounded.
//
// Every camera mic hears the same words, even when one is a board feed, one is a phone at the back and one
// is a shotgun pointing at the choir. Word triples ("turn with me", "with me to") that occur in both
// transcripts vote for the time difference between them; the votes pile up at the true lag. Works at any
// lag (hours), survives muddy audio that defeats waveform correlation, and — because anchors are spread over
// the whole take — measures clock drift between devices too.
//
// It is coarser than audio (word timestamps are ±100 ms), so it is the referee: it confirms the audio lock,
// or rescues it when the waveform matched a repeated chorus.

import type { SyncCandidate, TimedWord } from './types';

const STOP = new Set(['the', 'a', 'an', 'and', 'uh', 'um', 'to', 'of', 'in', 'is', 'it', 'that', 'you', 'i']);

export const normWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '').replace(/'/g, '');

function grams(words: TimedWord[], n: number): Array<{ key: string; t: number }> {
  const clean = words.map((w) => ({ w: normWord(w.text), t: w.t })).filter((x) => x.w);
  const out: Array<{ key: string; t: number }> = [];
  for (let i = 0; i + n <= clean.length; i++) {
    const slice = clean.slice(i, i + n);
    // Skip grams made only of filler — they repeat everywhere.
    if (slice.every((s) => STOP.has(s.w))) continue;
    out.push({ key: slice.map((s) => s.w).join(' '), t: slice[0].t });
  }
  return out;
}

export interface TranscriptAlignResult extends SyncCandidate {
  anchors: number;
  /** Inlier anchor pairs (angle time, lag) — for drift. */
  inliers: Array<{ t: number; lag: number }>;
  driftPpm?: number;
}

/**
 * Lag that maps angle time to master time (t_master = t_angle + lag), from word-gram agreement.
 * `maxRepeat`: a gram that occurs more than this often in the master is ignored (refrains, "amen").
 */
export function alignTranscripts(master: TimedWord[], angle: TimedWord[], o: { n?: number; bin?: number; maxRepeat?: number } = {}): TranscriptAlignResult | null {
  const n = o.n ?? 3, bin = o.bin ?? 0.25, maxRepeat = o.maxRepeat ?? 3;
  const idx = new Map<string, number[]>();
  for (const g of grams(master, n)) { const a = idx.get(g.key); if (a) a.push(g.t); else idx.set(g.key, [g.t]); }
  const probe = grams(angle, n);
  if (!probe.length) return null;
  const votes: Array<{ t: number; lag: number; w: number }> = [];
  for (const g of probe) {
    const hits = idx.get(g.key);
    if (!hits || hits.length > maxRepeat) continue;
    const w = 1 / hits.length;
    for (const tm of hits) votes.push({ t: g.t, lag: tm - g.t, w });
  }
  if (votes.length < 3) return null;
  // Histogram of lags.
  const hist = new Map<number, number>();
  for (const v of votes) { const b = Math.round(v.lag / bin); hist.set(b, (hist.get(b) || 0) + v.w); }
  const smooth = (b: number) => (hist.get(b - 1) || 0) * 0.5 + (hist.get(b) || 0) + (hist.get(b + 1) || 0) * 0.5;
  let bestB = 0, best = -1;
  for (const b of hist.keys()) { const s = smooth(b); if (s > best) { best = s; bestB = b; } }
  let second = 0;
  for (const b of hist.keys()) if (Math.abs(b - bestB) > Math.ceil(1.5 / bin)) second = Math.max(second, smooth(b));
  const center = bestB * bin;
  const inl = votes.filter((v) => Math.abs(v.lag - center) <= bin * 1.6);
  const lags = inl.map((v) => v.lag).sort((a, b) => a - b);
  const lag = lags[lags.length >> 1];
  // Drift: least-squares slope of lag against angle time (needs anchors spread over ≥ 2 minutes).
  let driftPpm: number | undefined;
  const ts = inl.map((v) => v.t);
  if (inl.length >= 6 && Math.max(...ts) - Math.min(...ts) > 120) {
    const mt = ts.reduce((a, b) => a + b, 0) / ts.length, ml = inl.reduce((a, v) => a + v.lag, 0) / inl.length;
    let num = 0, den = 0; for (const v of inl) { num += (v.t - mt) * (v.lag - ml); den += (v.t - mt) ** 2; }
    if (den > 0) driftPpm = Math.round((num / den) * 1e6);
  }
  const support = inl.length;
  const margin = second > 0 ? best / second : 99;
  const conf = Math.max(0, Math.min(1, Math.min(1, support / 12) * Math.min(1, (margin - 1) / 1.5)));
  return {
    method: 'transcript', lag, confidence: conf, anchors: support,
    inliers: inl.map((v) => ({ t: v.t, lag: v.lag })), driftPpm,
    note: `${support} word anchors agree${second ? `, ×${margin.toFixed(1)} over the next lag` : ''}`,
  };
}

/** ASR chunks ({text,start,end} phrases) → per-word timestamps, spreading each phrase's time over its words. */
export function chunksToWords(chunks: Array<{ text: string; start: number; end: number }>, offset = 0): TimedWord[] {
  const out: TimedWord[] = [];
  for (const c of chunks) {
    const ws = String(c.text || '').trim().split(/\s+/).filter(Boolean);
    if (!ws.length || !Number.isFinite(c.start)) continue;
    const end = Number.isFinite(c.end) && c.end > c.start ? c.end : c.start + ws.length * 0.33;
    // Weight by length so long words take longer.
    const total = ws.reduce((a, w) => a + Math.max(2, w.length), 0);
    let t = c.start;
    for (const w of ws) { const d = (end - c.start) * Math.max(2, w.length) / total; out.push({ t: t + offset, end: t + d + offset, text: w }); t += d; }
  }
  return out;
}
