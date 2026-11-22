// Crossover captions: read any supported file, write any supported file, and prove the result by
// reading a broadcast file back and comparing it with what was asked for, frame by frame.

import { normalizeForCompare, stripMarkup, sortCues, type CaptionCue, type CaptionDoc, type CaptionFormat } from './model';
import { parseMcc, writeMcc, type MccOptions, type McDoc, type MccDiagnostics } from './mcc';
import { parseScc, writeScc, type SccOptions } from './scc';
import { COLS, canEncode, wrapLines, type LateCue } from './cea608';
import { parseAss, parseSbv, parseSrt, parseTtml, parseVtt, writeAss, writeSbv, writeSrt, writeTtml, writeTxt, writeVtt } from './textFormats';
import { fpsOf, rateById, secToFrame, type FrameRate } from './timecode';
import { parseSami, writeSami } from './sami';
import { isEbuStl, parseEbuStl, writeEbuStl, type StlOptions } from './ebuStl';

export { parseSami, writeSami, parseEbuStl, writeEbuStl, isEbuStl };

export * from './model';
export * from './timecode';
export * from './profiles';
export * from './embed';
export { writeMcc, parseMcc, writeScc, parseScc };
export type { McDoc, MccDiagnostics };

export interface CaptionFormatInfo { id: CaptionFormat; ext: string; label: string; note: string; broadcast?: boolean; canRead: boolean }

export const CAPTION_FORMATS: CaptionFormatInfo[] = [
  { id: 'mcc', ext: 'mcc', label: 'MCC', note: 'MacCaption. CEA-608 + 708 per frame, for playout servers.', broadcast: true, canRead: true },
  { id: 'scc', ext: 'scc', label: 'SCC', note: 'Scenarist. CEA-608 at 29.97, the broadcast standard.', broadcast: true, canRead: true },
  { id: 'srt', ext: 'srt', label: 'SRT', note: 'SubRip. Plain timed text, accepted almost everywhere.', canRead: true },
  { id: 'vtt', ext: 'vtt', label: 'WebVTT', note: 'For web players and HLS.', canRead: true },
  { id: 'ttml', ext: 'ttml', label: 'TTML', note: 'TTML / DFXP / IMSC, for streaming delivery.', canRead: true },
  { id: 'ass', ext: 'ass', label: 'ASS', note: 'Styled subtitles for burn-in tools.', canRead: true },
  { id: 'sbv', ext: 'sbv', label: 'SBV', note: 'YouTube captions.', canRead: true },
  { id: 'stl', ext: 'stl', label: 'EBU-STL', note: 'EBU Tech 3264 binary, European broadcast exchange.', broadcast: true, canRead: true },
  { id: 'smi', ext: 'smi', label: 'SAMI', note: 'Microsoft SAMI, for Windows Media and some broadcasters.', canRead: true },
  { id: 'txt', ext: 'txt', label: 'Transcript', note: 'Text only, no timing.', canRead: false },
];

export function detectFormat(name: string, text: string): CaptionFormat | null {
  const head = text.slice(0, 400).replace(/^﻿/, '');
  if (/^File Format=MacCaption_MCC/i.test(head)) return 'mcc';
  if (/^Scenarist_SCC/i.test(head)) return 'scc';
  if (/^WEBVTT/.test(head)) return 'vtt';
  if (/<tt[\s:>]/.test(head) || /<\?xml/.test(head)) return 'ttml';
  if (/\[Script Info\]/i.test(head)) return 'ass';
  if (/<SAMI\b/i.test(head)) return 'smi';
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'dfxp' || ext === 'xml' || ext === 'itt') return 'ttml';
  if (ext === 'ssa') return 'ass';
  if (ext === 'sami') return 'smi';
  const known = CAPTION_FORMATS.find(f => f.ext === ext && f.canRead);
  if (known) return known.id;
  if (/-->/.test(head)) return 'srt';
  if (/^\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}/m.test(head)) return 'sbv';
  return null;
}

export interface ReadOptions { startTc?: string; rateId?: string }

export function readCaptions(name: string, text: string, opts: ReadOptions = {}): CaptionDoc {
  const fmt = detectFormat(name, text);
  let doc: CaptionDoc;
  switch (fmt) {
    case 'mcc': doc = parseMcc(text, { startTc: opts.startTc }); break;
    case 'scc': doc = parseScc(text, { startTc: opts.startTc, rateId: opts.rateId }); break;
    case 'vtt': doc = parseVtt(text); break;
    case 'ttml': doc = parseTtml(text); break;
    case 'ass': doc = parseAss(text); break;
    case 'sbv': doc = parseSbv(text); break;
    case 'srt': doc = parseSrt(text); break;
    case 'smi': doc = parseSami(text); break;
    case 'stl': throw new Error(`${name} is a binary EBU-STL file; read it with readCaptionBytes.`);
    default: throw new Error(`Couldn't recognise ${name} as a caption file.`);
  }
  doc.cues = sortCues(doc.cues);
  return doc;
}

/** Read any caption file from its bytes: EBU-STL is binary, everything else is text (UTF-8 or UTF-16). */
export function readCaptionBytes(name: string, bytes: Uint8Array, opts: ReadOptions = {}): CaptionDoc {
  if (isEbuStl(bytes)) { const doc = parseEbuStl(bytes); doc.cues = sortCues(doc.cues); return doc; }
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
  else {
    text = new TextDecoder('utf-8').decode(bytes);
    // Old Windows-1252 SAMI/SRT: invalid UTF-8 shows as U+FFFD; re-read as Latin-1 so accents survive.
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(bytes);
  }
  return readCaptions(name, text, opts);
}

export interface WriteOptions extends MccOptions, SccOptions {
  /** EBU-STL frame base and teletext width. */
  stl?: StlOptions;
  title?: string;
  lang?: string;
}

export interface WrittenCaptions {
  text: string;
  /** Binary formats (EBU-STL) carry their bytes here; `text` is then empty. */
  bytes?: Uint8Array;
  /** The MIME type for the download. */
  mime: string;
  ext: string;
  late?: LateCue[];
  unsupported?: string[];
  /** What the broadcast encoder was asked to deliver, after splitting to the row limit. */
  encodedCues?: CaptionCue[];
  rate?: FrameRate;
}

export function writeCaptions(input: CaptionCue[], format: CaptionFormat, opts: WriteOptions = {}): WrittenCaptions {
  const cues = sortCues(input);
  const ext = CAPTION_FORMATS.find(f => f.id === format)!.ext;
  switch (format) {
    case 'mcc': { const w = writeMcc(cues, opts); return { text: w.text, mime: 'text/plain', ext, late: w.late, unsupported: w.unsupported, encodedCues: w.encodedCues, rate: w.rate }; }
    case 'scc': { const w = writeScc(cues, opts); return { text: w.text, mime: 'text/plain', ext, late: w.late, unsupported: w.unsupported, encodedCues: w.encodedCues, rate: w.rate }; }
    case 'srt': return { text: writeSrt(cues), mime: 'application/x-subrip', ext };
    case 'vtt': return { text: writeVtt(cues), mime: 'text/vtt', ext };
    case 'ttml': return { text: writeTtml(cues), mime: 'application/ttml+xml', ext };
    case 'ass': return { text: writeAss(cues), mime: 'text/plain', ext };
    case 'sbv': return { text: writeSbv(cues), mime: 'text/plain', ext };
    case 'txt': return { text: writeTxt(cues), mime: 'text/plain', ext };
    case 'smi': return { text: writeSami(cues, { title: opts.title, lang: opts.lang }), mime: 'application/smil', ext };
    case 'stl': return { text: '', bytes: writeEbuStl(cues, { title: opts.title, startTc: opts.startTc, ...opts.stl }), mime: 'application/octet-stream', ext };
  }
}

// ── Read-back ───────────────────────────────────────────────────────────────

export interface CueCheck {
  id: string;
  expected: string;
  /** What actually came back; null when nothing did. */
  actual: string | null;
  textMatch: boolean;
  /** Frames late (+) or early (-), at the file's rate. */
  startDeltaFrames: number | null;
  endDeltaFrames: number | null;
}

export interface LayerResult {
  layer: 'SCC' | 'CEA-608' | 'CEA-708';
  checks: CueCheck[];
  missing: number;
  extra: number;
  textErrors: number;
  worstStartFrames: number;
  worstEndFrames: number;
  pass: boolean;
}

export interface ReadbackReport {
  format: 'mcc' | 'scc';
  rateId: string;
  layers: LayerResult[];
  diagnostics?: MccDiagnostics;
  warnings: string[];
  late: LateCue[];
  unsupported: string[];
  /** Within one frame on every cue, every word intact, and a structurally clean file. */
  pass: boolean;
}

/** 1 frame either side: the rounding limit of placing a time on a frame grid. */
const FRAME_TOLERANCE = 1;

function compareLayer(layer: LayerResult['layer'], expected: CaptionCue[], actual: CaptionCue[], rate: FrameRate): LayerResult {
  const toFrames = (sec: number) => secToFrame(sec, rate);
  const used = new Set<number>();
  const checks: CueCheck[] = expected.map(e => {
    const want = normalizeForCompare(e.text);
    let best = -1;
    let bestDist = Infinity;
    actual.forEach((a, i) => {
      if (used.has(i)) return;
      const dist = Math.abs(a.startSec - e.startSec) + (normalizeForCompare(a.text) === want ? 0 : 1000);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    if (best < 0 || bestDist > 1010) return { id: e.id, expected: e.text, actual: null, textMatch: false, startDeltaFrames: null, endDeltaFrames: null };
    used.add(best);
    const a = actual[best];
    return {
      id: e.id,
      expected: e.text,
      actual: a.text,
      textMatch: normalizeForCompare(a.text) === want,
      startDeltaFrames: toFrames(a.startSec) - toFrames(e.startSec),
      endDeltaFrames: toFrames(a.endSec) - toFrames(e.endSec),
    };
  });
  const found = checks.filter(c => c.startDeltaFrames !== null);
  // A roll-up line leaves the screen when it scrolls off the top, which no file states as an end
  // time; those lines are checked on their start frame and their words.
  const rolled = new Set(expected.filter(e => e.mode === 'rollup').map(e => e.id));
  const worstStartFrames = found.reduce((m, c) => Math.max(m, Math.abs(c.startDeltaFrames!)), 0);
  const worstEndFrames = found.filter(c => !rolled.has(c.id)).reduce((m, c) => Math.max(m, Math.abs(c.endDeltaFrames!)), 0);
  const missing = checks.length - found.length;
  const extra = actual.length - used.size;
  const textErrors = found.filter(c => !c.textMatch).length;
  return {
    layer, checks, missing, extra, textErrors, worstStartFrames, worstEndFrames,
    pass: !missing && !extra && !textErrors && worstStartFrames <= FRAME_TOLERANCE && worstEndFrames <= FRAME_TOLERANCE,
  };
}

/** Read the bytes of a written file back through the decoders and compare with the cues. */
export function verifyBroadcast(written: WrittenCaptions, format: 'mcc' | 'scc', opts: { startTc?: string; channel?: 1 | 2 } = {}): ReadbackReport {
  const expected = written.encodedCues ?? [];
  const rate = written.rate ?? rateById('29.97df');
  const layers: LayerResult[] = [];
  let diagnostics: MccDiagnostics | undefined;
  let warnings: string[];
  if (format === 'mcc') {
    const doc = parseMcc(written.text, { startTc: opts.startTc, channel: opts.channel });
    diagnostics = doc.diagnostics;
    warnings = doc.warnings;
    layers.push(compareLayer('CEA-608', expected, doc.cues608, rate), compareLayer('CEA-708', expected, doc.cues708, rate));
  } else {
    const doc = parseScc(written.text, { startTc: opts.startTc, rateId: rate.id, channel: opts.channel });
    warnings = doc.warnings;
    layers.push(compareLayer('SCC', expected, doc.cues, rate));
  }
  const unsupported = written.unsupported ?? [];
  const structural = !diagnostics || (!diagnostics.badAncChecksums && !diagnostics.badCdpChecksums && !diagnostics.sequenceBreaks && !diagnostics.timecodeGaps);
  return {
    format, rateId: rate.id, layers, diagnostics, warnings,
    late: written.late ?? [], unsupported,
    pass: structural && layers.every(l => l.pass) && !unsupported.length,
  };
}

// ── Timing QC ───────────────────────────────────────────────────────────────

export type QcKind = 'overlap' | 'too-fast' | 'too-short' | 'too-long' | 'line-too-long' | 'too-many-rows' | 'unsupported-char' | 'empty' | 'past-end' | 'gap-too-small' | 'off-frame';
export interface QcIssue { cueId: string; kind: QcKind; severity: 'error' | 'warn'; message: string }

export interface QcOptions {
  /** Characters per second before reading gets hard. 20 is a common broadcast ceiling. */
  maxCps?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  maxRows?: number;
  videoDurationSec?: number;
  /** Characters per line (608 = 32). Defaults to the 608 limit. */
  maxCols?: number;
  /** Minimum frames between one caption's end and the next one's start (0 = touching is fine). */
  minGapFrames?: number;
  /** Frame rate used for gap and frame-grid checks. */
  rate?: FrameRate;
  /** Flag characters the CEA-608 character set can't carry. */
  check608Chars?: boolean;
}

export function qcCaptions(cues: CaptionCue[], opts: QcOptions = {}): QcIssue[] {
  const { maxCps = 20, minDurationSec = 0.8, maxDurationSec = 8, maxRows = 3, videoDurationSec, maxCols = COLS, minGapFrames = 0, rate, check608Chars } = opts;
  const issues: QcIssue[] = [];
  const sorted = sortCues(cues);
  sorted.forEach((c, i) => {
    const plain = stripMarkup(c.text);
    const dur = c.endSec - c.startSec;
    const chars = plain.replace(/\s+/g, ' ').trim().length;
    if (!chars) issues.push({ cueId: c.id, kind: 'empty', severity: 'warn', message: 'No text.' });
    const next = sorted[i + 1];
    if (next && next.startSec < c.endSec - 0.001) {
      issues.push({ cueId: c.id, kind: 'overlap', severity: 'error', message: `Overlaps the next caption by ${(c.endSec - next.startSec).toFixed(2)} s.` });
    }
    if (dur <= 0) issues.push({ cueId: c.id, kind: 'too-short', severity: 'error', message: 'Ends before it starts.' });
    else {
      if (dur < minDurationSec) issues.push({ cueId: c.id, kind: 'too-short', severity: 'warn', message: `On screen only ${dur.toFixed(2)} s.` });
      if (dur > maxDurationSec) issues.push({ cueId: c.id, kind: 'too-long', severity: 'warn', message: `On screen for ${dur.toFixed(1)} s.` });
      const cps = chars / dur;
      if (cps > maxCps) issues.push({ cueId: c.id, kind: 'too-fast', severity: 'warn', message: `${cps.toFixed(0)} characters a second, over the ${maxCps} limit.` });
    }
    if (plain.split('\n').some(l => l.length > maxCols)) issues.push({ cueId: c.id, kind: 'line-too-long', severity: 'warn', message: `A line is over ${maxCols} characters; it will be rewrapped.` });
    if (wrapLines(c.text, maxCols).length > maxRows) issues.push({ cueId: c.id, kind: 'too-many-rows', severity: 'warn', message: `Needs more than ${maxRows} rows; it will be split.` });
    if (rate && next && minGapFrames > 0 && next.startSec >= c.endSec - 0.001) {
      const gap = secToFrame(next.startSec, rate) - secToFrame(c.endSec, rate);
      if (gap > 0 && gap < minGapFrames) issues.push({ cueId: c.id, kind: 'gap-too-small', severity: 'warn', message: `Only ${gap} frame${gap === 1 ? '' : 's'} before the next caption; the spec wants ${minGapFrames} (or close the gap).` });
    }
    if (rate) {
      const off = (t: number) => Math.abs(t * fpsOf(rate) - Math.round(t * fpsOf(rate))) > 0.01;
      if (off(c.startSec) || off(c.endSec)) issues.push({ cueId: c.id, kind: 'off-frame', severity: 'warn', message: 'In or out point is between frames; it will be rounded to the nearest frame.' });
    }
    if (check608Chars) {
      const bad = [...new Set([...plain.replace(/\n/g, '')].filter(ch => !canEncode(ch)))];
      if (bad.length) issues.push({ cueId: c.id, kind: 'unsupported-char', severity: 'error', message: `CEA-608 can't carry ${bad.map(b => `"${b}"`).join(' ')}; it will be sent as a space.` });
    }
    if (videoDurationSec && c.startSec >= videoDurationSec) issues.push({ cueId: c.id, kind: 'past-end', severity: 'error', message: 'Starts after the video ends.' });
  });
  return issues;
}

/** Slide every cue, or stretch them for a file made at the wrong frame rate. */
export function retimeCues(cues: CaptionCue[], offsetSec: number, scale = 1): CaptionCue[] {
  return cues.map(c => ({ ...c, startSec: Math.max(0, c.startSec * scale + offsetSec), endSec: Math.max(0, c.endSec * scale + offsetSec) }));
}

export { fpsOf };
