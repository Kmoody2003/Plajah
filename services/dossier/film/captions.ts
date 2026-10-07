/**
 * Council captions: word timings, phrase chunking and sidecar files.
 *
 * Word timings are the film's master clock. With no audio they are ESTIMATED from a deterministic speech model
 * (about 143 words a minute with clause pauses). With a voiced line the model is stretched to the line's measured
 * duration, so line boundaries are verified and word onsets inside a line are still estimated (the TTS provider does
 * not return alignment). Replace estimateWords with a forced aligner and nothing else changes.
 */
import type { CaptionCue, TWord } from './councilTypes';

const MONTHS = /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i;

const strip = (w: string) => w.replace(/^[“"'(]+|[.,;:!?”"')—]+$/g, '');

/** Speech duration (s) of one token, without the pause after it. */
export function spokenSeconds(token: string): number {
  const w = strip(token);
  if (/^\d{4}$/.test(w)) return 0.95;                  // "nineteen fourteen"
  if (/^\$?\d[\d,.]*$/.test(w)) return 0.45 + 0.1 * w.replace(/\D/g, '').length;
  if (/^\d/.test(w)) return 0.5 + 0.08 * w.length;
  return 0.09 + 0.058 * w.length;
}

/** Pause (s) after a token, from its punctuation. */
export function pauseAfter(token: string): number {
  if (/[.!?]["'”’)]*$/.test(token)) return 0.38;
  if (/[;:]$/.test(token)) return 0.26;
  if (/,["'”’)]*$/.test(token)) return 0.17;
  if (/—$/.test(token)) return 0.2;
  return 0;
}

export interface WordTime { text: string; a: number; b: number }

/** Deterministic word onsets for a beat. `duration` (a measured voiced line) stretches the model to fit. */
export function estimateWords(text: string, duration?: number): { words: WordTime[]; total: number } {
  const tokens = text.split(/\s+/).filter(Boolean);
  const spans = tokens.map(t => ({ t, d: spokenSeconds(t), p: pauseAfter(t) }));
  const raw = spans.reduce((n, s) => n + s.d + s.p, 0) - (spans.length ? spans[spans.length - 1].p : 0);
  const k = duration && raw > 0 ? duration / raw : 1;
  let at = 0;
  const words = spans.map(s => {
    const a = at, b = at + s.d * k;
    at = b + s.p * k;
    return { text: s.t, a, b };
  });
  return { words, total: duration ?? raw };
}

/** Which words are names, dates or numbers: set in the accent colour at the same size. */
export function markAccents(words: string[], terms: string[]): boolean[] {
  const flags = words.map(w => {
    const s = strip(w);
    return /\d/.test(s) || MONTHS.test(s) || /^\$/.test(s);
  });
  const lower = words.map(w => strip(w).toLowerCase().replace(/['’]s$/, ''));
  for (const term of terms) {
    const parts = term.toLowerCase().split(/\s+/);
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((p, j) => lower[i + j] === p)) for (let j = 0; j < parts.length; j++) flags[i + j] = true;
    }
  }
  return flags;
}

export const MAX_CAPTION_CHARS = 112;   // two lines of about 56
const CLAUSE_END = /[,;:—]["'”’)]*$/;
const SENT_END = /[.!?]["'”’)]*$/;
const SOFT_BREAK = /^(and|but|which|where|that|while|when|so|because|though|including)$/i;

/** Phrase-chunk a beat's words: one chunk per spoken clause, never more than two lines of text. */
export function chunkWords(words: TWord[]): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  let from = 0, chars = 0;
  const len = (i: number) => words[i].text.length + 1;
  for (let i = 0; i < words.length; i++) {
    chars += len(i);
    const last = i === words.length - 1;
    const text = words[i].text;
    const next = words[i + 1];
    let cut = last || SENT_END.test(text) || (CLAUSE_END.test(text) && chars >= 30);
    if (!cut && next && chars + len(i + 1) > MAX_CAPTION_CHARS) {
      // Forced break: back up to the last clause or soft-break word if one sits past 40% of the chunk.
      let best = -1;
      for (let j = i; j > from; j--) {
        if (CLAUSE_END.test(words[j].text) || (SOFT_BREAK.test(strip(words[j + 1]?.text ?? '')) && j + 1 <= i)) {
          const used = words.slice(from, j + 1).reduce((n, w) => n + w.text.length + 1, 0);
          if (used >= chars * 0.4) { best = j; break; }
        }
      }
      if (best >= 0) { i = best; }
      cut = true;
    }
    if (cut) {
      // Never leave a one-word orphan at the end of a beat.
      if (!last && next && i + 1 === words.length - 1 && !SENT_END.test(text) && chars + len(i + 1) <= MAX_CAPTION_CHARS) continue;
      out.push({ from, to: i });
      from = i + 1; chars = 0;
    }
  }
  return out;
}

/** Caption windows: in 2 frames before the first word, out 6 frames after the last; a later chunk cuts the earlier one. */
export function buildCues(shotIndex: number, words: TWord[], fps: number): CaptionCue[] {
  const lead = 2 / fps, tail = 6 / fps;
  const chunks = chunkWords(words);
  return chunks.map((c, i) => {
    const a = words[c.from].a - lead;
    let b = words[c.to].b + tail;
    const nextA = i + 1 < chunks.length ? words[chunks[i + 1].from].a - lead : Infinity;
    b = Math.min(b, nextA);
    return { shot: shotIndex, a: Math.max(0, a), b, text: words.slice(c.from, c.to + 1).map(w => w.text).join(' '), wordFrom: c.from, wordTo: c.to, words: words.slice(c.from, c.to + 1) };
  });
}

const ts = (x: number, sep: string) => {
  x = Math.max(0, x);
  const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), s = Math.floor(x % 60), ms = Math.round((x % 1) * 1000);
  const f = ms === 1000 ? [s + 1, 0] : [s, ms];
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(f[0]).padStart(2, '0')}${sep}${String(f[1]).padStart(3, '0')}`;
};

export const toSRT = (cues: Array<{ a: number; b: number; text: string }>) =>
  cues.map((c, i) => `${i + 1}\n${ts(c.a, ',')} --> ${ts(c.b, ',')}\n${c.text}\n`).join('\n');

export const toVTT = (cues: Array<{ a: number; b: number; text: string }>) =>
  `WEBVTT\n\n${cues.map(c => `${ts(c.a, '.')} --> ${ts(c.b, '.')}\n${c.text}\n`).join('\n')}`;

/** Two lines at most: split at the break that balances the line lengths. Pure, for tests and the painter alike. */
export function balanceLines(words: string[], width: (s: string) => number, maxW: number): string[] | null {
  const whole = words.join(' ');
  if (width(whole) <= maxW) return [whole];
  let best: string[] | null = null, bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' '), l2 = words.slice(i).join(' ');
    const w = Math.max(width(l1), width(l2));
    if (w <= maxW && w < bestW) { best = [l1, l2]; bestW = w; }
  }
  return best;
}
