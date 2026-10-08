// transcriptParse — turns whatever the operator pastes into timed cues for an
// Audio slide's transcript. Pure (no DOM), unit-tested in amboAudioSlide.test.
//
// Accepted:
//   SRT     1 / 00:00:01,000 --> 00:00:04,200 / text…
//   WebVTT  WEBVTT / [id] / 00:01.000 --> 00:04.200 align:start / text…
//   LRC     [00:12.50] text   (several tags per line, [offset:+250], [ar:…] ignored)
//   lines   "0:12 text", "1:02:03 text", "(0:12) text", "[0:12] text", "0:12 - text"
//   plain   anything else — split into readable phrases and spread over the
//           audio's duration by length (see timeCues)
// Untimed lines that follow a timed one continue that cue.

export interface Cue {
  /** Seconds from the start of the file. */
  start: number;
  /** Seconds; always > start once timed. */
  end: number;
  text: string;
}
export interface ParsedTranscript {
  cues: Cue[];
  /** False when the text carried no timestamps (times are placeholders until timeCues). */
  timed: boolean;
}

const TS = String.raw`(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?`;
const ARROW = new RegExp(`^\\s*${TS}\\s*-->\\s*${TS}`);
const LRC_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_META = /^\s*\[(ar|ti|al|au|by|re|ve|length|offset|la|id):([^\]]*)\]\s*$/i;
const LINE_TS = new RegExp(`^\\s*[\\[(]?${TS}[\\])]?\\s*(?:[-–—:|]\\s*)?(.*)$`);

const frac = (s?: string) => s ? +s / Math.pow(10, s.length) : 0;
function secs(h: string | undefined, m: string, s: string, f?: string): number {
  return (h ? +h * 3600 : 0) + +m * 60 + +s + frac(f);
}
/** "1:02:03.5" / "02:03" / "75" → seconds (NaN if unreadable). */
export function parseClock(s: string): number {
  const t = (s || '').trim();
  if (/^\d+(\.\d+)?$/.test(t)) return +t;
  const m = t.match(new RegExp(`^${TS}$`));
  return m ? secs(m[1], m[2], m[3], m[4]) : NaN;
}

const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

function finish(cues: Cue[]): Cue[] {
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    if (!(cues[i].end > cues[i].start)) cues[i].end = next ? next.start : cues[i].start + Math.max(2.5, cues[i].text.length / 14);
  }
  return cues.filter(c => c.text);
}

function parseBlocks(src: string): Cue[] {
  const out: Cue[] = [];
  let cur: Cue | null = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(ARROW);
    if (m) {
      cur = { start: secs(m[1], m[2], m[3], m[4]), end: secs(m[5], m[6], m[7], m[8]), text: '' };
      out.push(cur);
      continue;
    }
    if (!line) { cur = null; continue; }
    if (!cur) continue; // cue ids, WEBVTT header, NOTE blocks
    cur.text = clean(cur.text ? `${cur.text} ${line}` : line);
  }
  return out;
}

function parseLrc(src: string): Cue[] {
  let offset = 0;
  const out: Cue[] = [];
  for (const raw of src.split(/\r?\n/)) {
    const meta = raw.match(LRC_META);
    if (meta) { if (meta[1].toLowerCase() === 'offset') offset = (parseFloat(meta[2]) || 0) / 1000; continue; }
    const tags = [...raw.matchAll(LRC_TAG)];
    if (!tags.length) { if (out.length && raw.trim()) out[out.length - 1].text = clean(`${out[out.length - 1].text} ${raw}`); continue; }
    const text = clean(raw.replace(LRC_TAG, ''));
    for (const t of tags) out.push({ start: Math.max(0, +t[1] * 60 + +t[2] + frac(t[3]) - offset), end: NaN, text });
  }
  return out;
}

function parseLines(src: string): Cue[] | null {
  const out: Cue[] = [];
  let timedLines = 0, lines = 0;
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    lines++;
    const m = raw.match(LINE_TS);
    if (m && m[5] !== undefined) {
      const start = secs(m[1], m[2], m[3], m[4]);
      if (Number.isFinite(start)) { timedLines++; out.push({ start, end: NaN, text: clean(m[5]) }); continue; }
    }
    if (out.length) out[out.length - 1].text = clean(`${out[out.length - 1].text} ${raw}`);
    else return null; // text before any time: not this format
  }
  return timedLines && timedLines >= Math.min(2, lines) ? out : null;
}

/** Split untimed prose into readable phrases (≈ one projected line each). */
export function phrases(src: string, maxChars = 84): string[] {
  const out: string[] = [];
  const paras = src.split(/\r?\n/).map(clean).filter(Boolean);
  for (const p of paras) {
    const sentences = p.match(/[^.!?;]+[.!?;]+["'”’)]*|[^.!?;]+$/g) || [p];
    for (let s of sentences) {
      s = s.trim();
      if (!s) continue;
      if (s.length <= maxChars) { out.push(s); continue; }
      // Long sentence: break at commas, then at word boundaries.
      const parts = s.split(/(?<=[,:—–])\s+/);
      let acc = '';
      for (const part of parts) {
        if ((acc + ' ' + part).trim().length <= maxChars) { acc = (acc + ' ' + part).trim(); continue; }
        if (acc) out.push(acc);
        if (part.length <= maxChars) { acc = part; continue; }
        acc = '';
        const words = part.split(/\s+/);
        for (const w of words) {
          if ((acc + ' ' + w).trim().length > maxChars && acc) { out.push(acc); acc = w; }
          else acc = (acc + ' ' + w).trim();
        }
      }
      if (acc) out.push(acc);
    }
  }
  return out;
}

/** LRC when most content lines open with a [mm:ss] tag (mixed "(0:05)" / "0:05" lines go to parseLines). */
const LINE_BREAK = /\r?\n/;
function looksLrc(s: string): boolean {
  const ls = s.split(LINE_BREAK).filter(l => l.trim() && !LRC_META.test(l));
  const tagged = ls.filter(l => /^\s*\[\d{1,3}:\d{2}([.:]\d{1,3})?\]/.test(l)).length;
  return tagged > 0 && tagged >= ls.length * .6;
}

const parseMemo = new Map<string, ParsedTranscript>();
/** Parse any accepted format. Memoised by text (drawers call it every frame). */
export function parseTranscript(src: string): ParsedTranscript {
  const key = src || '';
  const hit = parseMemo.get(key);
  if (hit) return hit;
  let res: ParsedTranscript;
  const s = key.replace(/^﻿/, '');
  if (!s.trim()) res = { cues: [], timed: false };
  else if (ARROW.test(s.split(/\r?\n/).find(l => /-->/.test(l)) || '')) res = { cues: finish(parseBlocks(s)), timed: true };
  else if (looksLrc(s)) res = { cues: finish(parseLrc(s)), timed: true };
  else {
    const ln = parseLines(s);
    if (ln) res = { cues: finish(ln), timed: true };
    else res = { cues: phrases(s).map(text => ({ start: NaN, end: NaN, text })), timed: false };
  }
  if (parseMemo.size > 64) parseMemo.clear();
  parseMemo.set(key, res);
  return res;
}

/**
 * Give untimed cues real times over [t0, t1] (e.g. startSec → duration), each
 * phrase's share proportional to its length, with a short breath between.
 * Timed cues pass through; the last one is held to t1 so the final line stays.
 */
export function timeCues(p: ParsedTranscript, t0: number, t1: number): Cue[] {
  const n = p.cues.length;
  if (!n) return [];
  if (p.timed) {
    const out = p.cues.map(c => ({ ...c }));
    if (t1 > out[n - 1].start) out[n - 1].end = Math.max(out[n - 1].end, Math.min(t1, out[n - 1].end + 30));
    return out;
  }
  const span = Math.max(1, t1 - t0);
  const weights = p.cues.map(c => c.text.length + 12);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = t0;
  return p.cues.map((c, i) => {
    const d = span * weights[i] / total;
    const cue = { start: t, end: t + d, text: c.text };
    t += d;
    return cue;
  });
}

/** Index of the cue on air at time t (the last one started), -1 before the first. */
export function cueIndexAt(cues: Cue[], t: number): number {
  let lo = 0, hi = cues.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** 0..1 through a cue (for karaoke sweeps); 1 once it has ended. */
export function cueProgress(c: Cue | undefined, t: number): number {
  if (!c) return 0;
  const d = Math.max(.2, c.end - c.start);
  return Math.max(0, Math.min(1, (t - c.start) / (d * .92)));
}

/** A transcript formatted as "m:ss text" lines (for the editor / a transcription hook). */
export function cuesToLines(cues: Cue[]): string {
  return cues.map(c => `${formatClock(c.start)} ${c.text}`).join('\n');
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
