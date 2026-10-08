import type { WordMark } from './types';

const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'e.g', 'i.e', 'inc', 'ltd', 'fig', 'approx', 'dept', 'gen', 'lt', 'sgt', 'capt', 'gov', 'sen', 'rev', 'hon', 'cf', 'ph.d']);

/** Sentence splitter that survives abbreviations (Mr., e.g.), decimals, quotes and ellipses. */
export function splitSentences(text: string): string[] {
  const t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!t) return [];
  const out: string[] = [];
  let start = 0;
  let i = 0;
  const push = (end: number) => { const s = t.slice(start, end).replace(/\s+/g, ' ').trim(); if (s) out.push(s); start = end; };
  while (i < t.length) {
    const c = t[i];
    if (c === '\n') {
      const m = /^\n\s*\n/.exec(t.slice(i));
      if (m) { push(i); i += m[0].length; start = i; continue; }
      i++; continue;
    }
    if (c === '.' || c === '!' || c === '?' || c === '…') {
      let j = i;
      while (j + 1 < t.length && '.!?…'.includes(t[j + 1])) j++;
      let k = j + 1;
      while (k < t.length && /["'”’)\]]/.test(t[k])) k++;
      if (k < t.length && !/\s/.test(t[k])) { i = k; continue; }          // 3.14, example.com
      let m = k;
      while (m < t.length && /\s/.test(t[m])) m++;
      let boundary = true;
      if (m < t.length && /\p{Ll}/u.test(t[m])) boundary = false;          // "wait... what?"
      if (boundary && c === '.' && j === i && k === j + 1) {
        const tok = /[\p{L}.]+$/u.exec(t.slice(0, i))?.[0] ?? '';
        if (ABBR.has(tok.toLowerCase()) || (tok.length === 1 && /\p{Lu}/u.test(tok) && tok !== 'I')) boundary = false;
      }
      if (boundary) push(k);
      i = k; continue;
    }
    i++;
  }
  push(t.length);
  return out;
}

/** Break one sentence into <= max-char speech chunks (Chrome cuts off ~15s utterances). */
export function chunkForSpeech(sentence: string, max = 220): string[] {
  const s = sentence.trim();
  if (s.length <= max) return s ? [s] : [];
  const parts = s.split(/(?<=[,;:])\s+/);
  const out: string[] = [];
  let cur = '';
  const flush = () => { if (cur) out.push(cur); cur = ''; };
  for (const p of parts) {
    if (p.length > max) {
      flush();
      let rest = p;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      cur = rest;
    } else if ((cur + ' ' + p).trim().length > max) { flush(); cur = p; }
    else cur = (cur + ' ' + p).trim();
  }
  flush();
  return out;
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Index of the word containing (or just before) the given char offset. */
export function wordIndexAt(text: string, charIndex: number): number {
  const re = /\S+/g;
  let n = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { if (m.index <= charIndex) n++; else break; }
  return Math.max(0, n);
}

/** Estimated word timings proportional to character count (small extra weight on punctuation pauses). Monotonic; last endMs === durationMs. */
export function estimateMarks(text: string, durationMs: number, startOffsetMs = 0, indexOffset = 0): WordMark[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const dur = Math.max(0, durationMs);
  const w = words.map(x => x.length + 1 + (/[.!?…]["'”’)]*$/.test(x) ? 4 : /[,;:]["'”’)]*$/.test(x) ? 2 : 0));
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return words.map((t, k) => {
    const s = Math.round((acc / total) * dur);
    acc += w[k];
    const e = k === words.length - 1 ? Math.round(dur) : Math.round((acc / total) * dur);
    return { i: indexOffset + k, startMs: startOffsetMs + s, endMs: startOffsetMs + e, text: t };
  });
}
