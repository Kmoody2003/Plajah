// SAMI (.smi): Microsoft's Synchronized Accessible Media Interchange. HTML-like; each <SYNC Start=ms>
// replaces what's on screen, and a SYNC holding only &nbsp; clears it. Still asked for by some
// broadcasters, Korean/Japanese distribution and older Windows Media pipelines.

import { newCueId, stripMarkup, type CaptionCue, type CaptionDoc } from './model';

const decode = (s: string) => s
  .replace(/&nbsp;/gi, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function parseSami(text: string): CaptionDoc {
  const warnings: string[] = [];
  const syncs: { ms: number; text: string }[] = [];
  const re = /<SYNC\b[^>]*\bStart\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)(?=<SYNC\b|<\/BODY|$)/gi;
  let m: RegExpExecArray | null;
  const classes = new Set<string>();
  while ((m = re.exec(text))) {
    const body = m[2];
    const cls = /<P\b[^>]*\bClass\s*=\s*["']?([\w-]+)/i.exec(body)?.[1];
    if (cls) classes.add(cls.toUpperCase());
    const t = decode(body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<(\/?)i>/gi, '\u0001$1i\u0002')       // keep italics through the tag strip
      .replace(/<[^>]+>/g, '')
      .replace(/\u0001(\/?)i\u0002/g, '<$1i>'))
      .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    syncs.push({ ms: +m[1], text: t });
  }
  if (classes.size > 1) warnings.push(`This file has ${classes.size} language classes; all were read into one track.`);
  syncs.sort((a, b) => a.ms - b.ms);
  const cues: CaptionCue[] = [];
  syncs.forEach((s, i) => {
    if (!stripMarkup(s.text).trim()) return;
    const next = syncs.slice(i + 1).find((n) => n.ms > s.ms);
    const end = next ? next.ms : s.ms + 3000;
    cues.push({ id: newCueId(), startSec: s.ms / 1000, endSec: end / 1000, text: s.text });
  });
  return { cues, sourceFormat: 'smi', warnings };
}

export function writeSami(cues: CaptionCue[], opts: { title?: string; lang?: string } = {}): string {
  const lang = opts.lang || 'en-US';
  const cls = lang.replace(/[^a-z]/gi, '').toUpperCase() + 'CC';
  const out: string[] = [
    '<SAMI>', '<HEAD>', `<TITLE>${esc(opts.title || 'Captions')}</TITLE>`,
    '<STYLE TYPE="text/css">', '<!--',
    'P { margin-left: 8pt; margin-right: 8pt; margin-bottom: 2pt; margin-top: 2pt; text-align: center; font-size: 20pt; font-family: Arial, sans-serif; font-weight: normal; color: white; }',
    `.${cls} { Name: Captions; lang: ${lang}; SAMIType: CC; }`,
    '-->', '</STYLE>', '</HEAD>', '<BODY>',
  ];
  const ms = (s: number) => Math.round(s * 1000);
  cues.forEach((c, i) => {
    const body = esc(c.text).replace(/&lt;(\/?)i&gt;/g, '<$1i>').replace(/\n/g, '<br>');
    out.push(`<SYNC Start=${ms(c.startSec)}><P Class=${cls}>${body}</P></SYNC>`);
    const next = cues[i + 1];
    if (!next || ms(next.startSec) > ms(c.endSec)) out.push(`<SYNC Start=${ms(c.endSec)}><P Class=${cls}>&nbsp;</P></SYNC>`);
  });
  out.push('</BODY>', '</SAMI>', '');
  return out.join('\r\n');
}
