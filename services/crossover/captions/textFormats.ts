// The text-based sidecars: SRT, WebVTT, TTML/IMSC, SBV, ASS and a plain transcript.

import { newCueId, stripMarkup, type CaptionCue, type CaptionDoc } from './model';
import { formatClock } from './timecode';

const clockToSec = (s: string): number | null => {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if (!m) return null;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +m[4].padEnd(3, '0') / 1000 : 0);
};

// SRT and VTT share the shape: blocks with a "start --> end" line.
function parseArrowBlocks(text: string, format: 'srt' | 'vtt'): CaptionDoc {
  const warnings: string[] = [];
  const cues: CaptionCue[] = [];
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const [a, bRaw] = lines[at].split('-->');
    const b = bRaw.trim().split(/\s+/)[0];
    const startSec = clockToSec(a);
    const endSec = clockToSec(b);
    if (startSec === null || endSec === null) { warnings.push(`Skipped a bad time line: "${lines[at].trim()}".`); continue; }
    const body = lines.slice(at + 1).join('\n').replace(/<(?!\/?i>)[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (!body) continue;
    cues.push({ id: newCueId(), startSec, endSec, text: decodeEntities(body) });
  }
  return { cues, sourceFormat: format, warnings };
}

const decodeEntities = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const parseSrt = (t: string) => parseArrowBlocks(t, 'srt');
export const parseVtt = (t: string) => parseArrowBlocks(t, 'vtt');

export const writeSrt = (cues: CaptionCue[]) =>
  cues.map((c, i) => `${i + 1}\n${formatClock(c.startSec, true)} --> ${formatClock(c.endSec, true)}\n${c.text}\n`).join('\n');

export const writeVtt = (cues: CaptionCue[]) =>
  `WEBVTT\n\n${cues.map(c => `${formatClock(c.startSec)} --> ${formatClock(c.endSec)}\n${c.text.replace(/&/g, '&amp;')}\n`).join('\n')}`;

export function parseSbv(text: string): CaptionDoc {
  const cues: CaptionCue[] = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const m = /^([\d:.]+),([\d:.]+)$/.exec(lines[0].trim());
    if (!m) continue;
    const s = clockToSec(m[1]);
    const e = clockToSec(m[2]);
    if (s === null || e === null) continue;
    const body = lines.slice(1).join('\n').trim();
    if (body) cues.push({ id: newCueId(), startSec: s, endSec: e, text: body });
  }
  return { cues, sourceFormat: 'sbv', warnings: [] };
}

export const writeSbv = (cues: CaptionCue[]) =>
  cues.map(c => `${formatClock(c.startSec, false).replace(/^0/, '')},${formatClock(c.endSec, false).replace(/^0/, '')}\n${stripMarkup(c.text)}\n`).join('\n');

// TTML: times may be clock (00:00:01.500), frames (00:00:01:12) or offset (1.5s, 90f, 1500ms).
export function parseTtml(text: string): CaptionDoc {
  const warnings: string[] = [];
  const cues: CaptionCue[] = [];
  const frameRate = +(/ttp:frameRate="(\d+)"/.exec(text)?.[1] || 30);
  const mult = /ttp:frameRateMultiplier="(\d+)\s+(\d+)"/.exec(text);
  const fps = mult ? (frameRate * +mult[1]) / +mult[2] : frameRate;
  const parseTime = (v: string | undefined): number | null => {
    if (!v) return null;
    const off = /^([\d.]+)(h|m|s|ms|f)$/.exec(v);
    if (off) {
      const n = +off[1];
      return off[2] === 'h' ? n * 3600 : off[2] === 'm' ? n * 60 : off[2] === 's' ? n : off[2] === 'ms' ? n / 1000 : n / fps;
    }
    const fr = /^(\d+):(\d{2}):(\d{2}):(\d{2})$/.exec(v);
    if (fr) return +fr[1] * 3600 + +fr[2] * 60 + +fr[3] + +fr[4] / fps;
    return clockToSec(v);
  };
  const re = /<(?:\w+:)?p\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]+)"`).exec(m![1])?.[1];
    const startSec = parseTime(attr('begin'));
    let endSec = parseTime(attr('end'));
    const dur = parseTime(attr('dur'));
    if (startSec === null) { warnings.push('Skipped a paragraph with no begin time.'); continue; }
    if (endSec === null && dur !== null) endSec = startSec + dur;
    if (endSec === null) { warnings.push('Skipped a paragraph with no end time.'); continue; }
    const body = decodeEntities(m[2]
      .replace(/<(?:\w+:)?br\s*\/?>/g, '\n')
      .replace(/<(?:\w+:)?span\b[^>]*tts:fontStyle="italic"[^>]*>([\s\S]*?)<\/(?:\w+:)?span>/g, '[[i]]$1[[/i]]')
      .replace(/<[^>]+>/g, '')
      .replace(/\[\[(\/?)i\]\]/g, '<$1i>')).trim();
    if (body) cues.push({ id: newCueId(), startSec, endSec, text: body });
  }
  return { cues, sourceFormat: 'ttml', warnings };
}

export function writeTtml(cues: CaptionCue[]): string {
  const body = cues.map(c => {
    const content = xmlEscape(c.text)
      .replace(/&lt;i&gt;/g, '<span tts:fontStyle="italic">').replace(/&lt;\/i&gt;/g, '</span>')
      .replace(/\n/g, '<br/>');
    return `      <p begin="${formatClock(c.startSec)}" end="${formatClock(c.endSec)}" region="bottom">${content}</p>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:tts="http://www.w3.org/ns/ttml#styling" ttp:timeBase="media" xml:lang="en">
  <head>
    <layout>
      <region xml:id="bottom" tts:origin="10% 80%" tts:extent="80% 15%" tts:displayAlign="after" tts:textAlign="center"/>
    </layout>
  </head>
  <body>
    <div>
${body}
    </div>
  </body>
</tt>
`;
}

export function parseAss(text: string): CaptionDoc {
  const cues: CaptionCue[] = [];
  const warnings: string[] = [];
  const events = /\[Events\]([\s\S]*)$/i.exec(text)?.[1] || '';
  const fmt = /^Format:\s*(.+)$/im.exec(events)?.[1].split(',').map(s => s.trim().toLowerCase());
  if (!fmt) return { cues, sourceFormat: 'ass', warnings: ['No [Events] format line.'] };
  const si = fmt.indexOf('start'), ei = fmt.indexOf('end'), ti = fmt.indexOf('text');
  for (const line of events.split(/\r?\n/)) {
    const m = /^Dialogue:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const parts = m[1].split(',');
    const s = clockToSec(parts[si] || '');
    const e = clockToSec(parts[ei] || '');
    if (s === null || e === null) continue;
    const body = parts.slice(ti).join(',')
      .replace(/\{\\i1\}/g, '<i>').replace(/\{\\i0\}/g, '</i>').replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').trim();
    if (body) cues.push({ id: newCueId(), startSec: s, endSec: e, text: body });
  }
  return { cues, sourceFormat: 'ass', warnings };
}

export function writeAss(cues: CaptionCue[]): string {
  const stamp = (sec: number) => {
    const cs = Math.round(sec * 100);
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
  };
  const rows = cues.map(c =>
    `Dialogue: 0,${stamp(c.startSec)},${stamp(c.endSec)},Default,,0,0,0,,${c.text.replace(/<i>/g, '{\\i1}').replace(/<\/i>/g, '{\\i0}').replace(/\n/g, '\\N')}`);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,54,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,60,60,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${rows.join('\n')}
`;
}

export const writeTxt = (cues: CaptionCue[]) => cues.map(c => stripMarkup(c.text).replace(/\n/g, ' ')).join('\n') + '\n';
