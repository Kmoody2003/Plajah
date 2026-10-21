// Melos Beats — MusicXML 4.0 in and out (partwise), so a Chora score opens in MuseScore, Dorico,
// Sibelius or Finale and their scores open here.
//
//   Export: each part is engraved with scoreModel (same measures, ties, triplets, spelling and
//           grand-staff split as the Score lens) and written with <staves>, <backup>, <tie>/<tied>,
//           <time-modification>/<tuplet>, accidentals, rests and tempo — what you see is the file.
//   Import: .musicxml (text) or .mxl (zipped, via META-INF/container.xml). Reads divisions, key,
//           time, tempo, notes, chords, rests, <backup>/<forward> voices and ties (merged into one
//           note) into NoteEvents per part. A tiny built-in XML parser keeps it dependency-free
//           and runnable in tests.

import { unzipSync, strFromU8 } from 'fflate';
import { grooveUid, type NoteEvent, type SongKey } from '../grooveDoc';
import type { MeterMap } from '../tempoMap';
import { buildScore, keyFifths, TPB, type Score, type ScoreElement } from './scoreModel';

// ── export ──────────────────────────────────────────────────────────────────

export interface XmlPartIn {
  name: string;
  notes: NoteEvent[];      // beats from the part's start (bar 1 of the export)
}

export interface XmlExportOpts {
  title: string;
  composer?: string;
  bpm: number;
  meter: MeterMap;
  key: SongKey | null;
  /** Song beat where the export starts (a bar line). Notes are relative to it. */
  songStart?: number;
  /** Content length in beats (rounded up to whole bars). */
  lengthBeats: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function exportMusicXml(parts: XmlPartIn[], o: XmlExportOpts): string {
  const songStart = o.songStart ?? 0;
  const scores: Score[] = parts.map((p) => buildScore(p.notes, {
    meter: o.meter, songOffset: songStart, fromContent: 0, toContent: Math.max(o.lengthBeats, 1e-3), key: o.key,
  }));
  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  L.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  L.push('<score-partwise version="4.0">');
  L.push(`  <work><work-title>${esc(o.title)}</work-title></work>`);
  L.push('  <identification>');
  if (o.composer) L.push(`    <creator type="composer">${esc(o.composer)}</creator>`);
  L.push('    <encoding><software>Plajah Chora Studio</software></encoding>');
  L.push('  </identification>');
  L.push('  <part-list>');
  parts.forEach((p, i) => L.push(`    <score-part id="P${i + 1}"><part-name>${esc(p.name)}</part-name></score-part>`));
  L.push('  </part-list>');
  scores.forEach((sc, pi) => {
    L.push(`  <part id="P${pi + 1}">`);
    let prevFifths: number | null = null;
    sc.measures.forEach((m, mi) => {
      L.push(`    <measure number="${mi + 1}">`);
      const attrs: string[] = [];
      if (mi === 0) attrs.push(`<divisions>${TPB}</divisions>`);
      if (prevFifths !== sc.fifths) { attrs.push(`<key><fifths>${sc.fifths}</fifths><mode>${sc.minor ? 'minor' : 'major'}</mode></key>`); prevFifths = sc.fifths; }
      if (m.showTime) attrs.push(`<time><beats>${m.num}</beats><beat-type>${m.den}</beat-type></time>`);
      if (mi === 0) {
        if (sc.clefs.length > 1) attrs.push('<staves>2</staves>');
        sc.clefs.forEach((c, si) => attrs.push(`<clef${sc.clefs.length > 1 ? ` number="${si + 1}"` : ''}>${c === 'treble' ? '<sign>G</sign><line>2</line>' : '<sign>F</sign><line>4</line>'}</clef>`));
      }
      if (attrs.length) L.push(`      <attributes>${attrs.join('')}</attributes>`);
      if (mi === 0) L.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(o.bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(o.bpm * 100) / 100}"/></direction>`);
      for (let s = 0; s < sc.clefs.length; s++) {
        if (s > 0) L.push(`      <backup><duration>${m.lenTicks}</duration></backup>`);
        for (const e of m.elements.filter((x) => x.staff === s)) L.push(...elementXml(e, s, sc.clefs.length > 1));
      }
      L.push('    </measure>');
    });
    L.push('  </part>');
  });
  L.push('</score-partwise>');
  return L.join('\n');
}

function elementXml(e: ScoreElement, staff: number, multi: boolean): string[] {
  const voice = staff * 4 + 1;
  const timeMod = e.triplet ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' : '';
  const dots = '<dot/>'.repeat(e.dots);
  const staffTag = multi ? `<staff>${staff + 1}</staff>` : '';
  const tuplet = e.triplet?.start ? '<tuplet type="start" bracket="yes"/>' : e.triplet?.stop ? '<tuplet type="stop"/>' : '';
  if (e.rest) {
    return [`      <note><rest/><duration>${e.ticks}</duration><voice>${voice}</voice><type>${e.type}</type>${dots}${timeMod}${staffTag}${tuplet ? `<notations>${tuplet}</notations>` : ''}</note>`];
  }
  return e.notes.map((n, i) => {
    const ties = (n.tieStop ? '<tie type="stop"/>' : '') + (n.tieStart ? '<tie type="start"/>' : '');
    const tied = (n.tieStop ? '<tied type="stop"/>' : '') + (n.tieStart ? '<tied type="start"/>' : '');
    const notations = tied + (i === 0 ? tuplet : '');
    return `      <note>${i > 0 ? '<chord/>' : ''}<pitch><step>${n.step}</step>${n.alter ? `<alter>${n.alter}</alter>` : ''}<octave>${n.octave}</octave></pitch>`
      + `<duration>${e.ticks}</duration>${ties}<voice>${voice}</voice><type>${e.type}</type>${dots}`
      + `${n.accidental ? `<accidental>${n.accidental}</accidental>` : ''}${timeMod}<stem>${staff === 0 ? 'up' : 'down'}</stem>${staffTag}`
      + `${notations ? `<notations>${notations}</notations>` : ''}</note>`;
  });
}

// ── import ──────────────────────────────────────────────────────────────────

export interface XmlNode { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }

/** Minimal XML parser: elements, attributes, text, CDATA; skips comments, PIs and DOCTYPE. */
export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const decode = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => (
    e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'"
      : e[1] === 'x' || e[1] === 'X' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(parseInt(e.slice(1), 10))));
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); stack[stack.length - 1].text += src.slice(lt + 9, e); i = e + 3; continue; }
    if (src.startsWith('<?', lt)) { i = src.indexOf('?>', lt) + 2; continue; }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE (possibly with an internal subset)
      let depth = 0, j = lt;
      for (; j < src.length; j++) { if (src[j] === '[') depth++; else if (src[j] === ']') depth--; else if (src[j] === '>' && depth <= 0) break; }
      i = j + 1; continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    let tag = src.slice(lt + 1, gt);
    if (tag.startsWith('/')) { if (stack.length > 1) stack.pop(); i = gt + 1; continue; }
    const selfClose = tag.endsWith('/');
    if (selfClose) tag = tag.slice(0, -1);
    const m = tag.match(/^([^\s/]+)/);
    const node: XmlNode = { name: m ? m[1] : tag, attrs: {}, children: [], text: '' };
    for (const a of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) node.attrs[a[1]] = decode(a[3] ?? a[4] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
    i = gt + 1;
  }
  return root;
}

const kid = (n: XmlNode | undefined, name: string) => n?.children.find((c) => c.name === name);
const kids = (n: XmlNode | undefined, name: string) => n?.children.filter((c) => c.name === name) ?? [];
const num = (n: XmlNode | undefined, d = 0) => { const v = parseFloat(n?.text ?? ''); return Number.isFinite(v) ? v : d; };

export interface XmlImportPart { id: string; name: string; notes: NoteEvent[] }
export interface XmlImport {
  title: string;
  parts: XmlImportPart[];
  bpm: number | null;
  /** Time signatures by bar (first entry at bar 0). */
  meter: { bar: number; num: number; den: number }[];
  key: SongKey | null;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Bytes of a .mxl (zip) or .musicxml/.xml file → the score XML text. */
export function musicXmlText(bytes: Uint8Array): string {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const container = files['META-INF/container.xml'];
    let path = '';
    if (container) {
      const root = parseXml(strFromU8(container));
      const rf = findAll(root, 'rootfile')[0];
      path = rf?.attrs['full-path'] ?? '';
    }
    if (!path || !files[path]) path = Object.keys(files).find((k) => /\.(musicxml|xml)$/i.test(k) && !k.startsWith('META-INF')) ?? '';
    if (!path) throw new Error('No score inside this .mxl');
    return strFromU8(files[path]);
  }
  return new TextDecoder().decode(bytes);
}

function findAll(n: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (x: XmlNode) => { if (x.name === name) out.push(x); x.children.forEach(walk); };
  walk(n);
  return out;
}

export function importMusicXml(text: string): XmlImport {
  const root = parseXml(text);
  const score = root.children.find((c) => c.name === 'score-partwise');
  if (!score) {
    if (root.children.some((c) => c.name === 'score-timewise')) throw new Error('Timewise MusicXML isn’t supported — re-export as partwise');
    throw new Error('Not a MusicXML score');
  }
  const title = kid(kid(score, 'work'), 'work-title')?.text.trim() || kid(score, 'movement-title')?.text.trim() || 'Imported score';
  const names = new Map<string, string>();
  for (const sp of kids(kid(score, 'part-list'), 'score-part')) names.set(sp.attrs.id, kid(sp, 'part-name')?.text.trim() || sp.attrs.id);
  let bpm: number | null = null;
  const meter: XmlImport['meter'] = [];
  let key: SongKey | null = null;
  const parts: XmlImportPart[] = [];

  kids(score, 'part').forEach((part, pi) => {
    let divisions = 1;
    let measureStart = 0;          // beats
    let cursor = 0;                // beats within the measure
    let lastStart = 0;
    const notes: NoteEvent[] = [];
    const open = new Map<string, NoteEvent>(); // tie chains by pitch+voice
    kids(part, 'measure').forEach((meas, mi) => {
      cursor = 0;
      let measureLen = 0;
      for (const el of meas.children) {
        if (el.name === 'attributes') {
          const dv = kid(el, 'divisions'); if (dv) divisions = num(dv, 1) || 1;
          const t = kid(el, 'time');
          if (t && pi === 0) {
            const nb = num(kid(t, 'beats'), 4), bt = num(kid(t, 'beat-type'), 4);
            if (!meter.length || meter[meter.length - 1].num !== nb || meter[meter.length - 1].den !== bt) meter.push({ bar: mi, num: nb, den: bt });
          }
          const k = kid(el, 'key');
          if (k && pi === 0 && !key) {
            const f = num(kid(k, 'fifths'), 0);
            const minor = kid(k, 'mode')?.text.trim() === 'minor';
            const majorPc = (((f * 7) % 12) + 12) % 12; // each fifth up the circle is 7 semitones
            key = { tonic: minor ? (majorPc + 9) % 12 : majorPc, scale: minor ? 'minor' : 'major' };
          }
        } else if (el.name === 'direction' || el.name === 'sound') {
          const snd = el.name === 'sound' ? el : kid(el, 'sound');
          const tempo = parseFloat(snd?.attrs.tempo ?? '');
          if (Number.isFinite(tempo) && tempo > 0 && bpm === null) bpm = tempo;
          if (bpm === null) {
            const pm = num(kid(kid(kid(el, 'direction-type'), 'metronome'), 'per-minute'), 0);
            if (pm > 0) bpm = pm;
          }
        } else if (el.name === 'backup') {
          cursor -= num(kid(el, 'duration')) / divisions;
        } else if (el.name === 'forward') {
          cursor += num(kid(el, 'duration')) / divisions;
          measureLen = Math.max(measureLen, cursor);
        } else if (el.name === 'note') {
          if (kid(el, 'grace') || kid(el, 'cue')) continue;
          const dur = num(kid(el, 'duration')) / divisions;
          const isChord = !!kid(el, 'chord');
          const start = isChord ? lastStart : cursor;
          if (!isChord) { lastStart = cursor; cursor += dur; measureLen = Math.max(measureLen, cursor); }
          const p = kid(el, 'pitch');
          if (!p || kid(el, 'rest')) continue;
          const step = kid(p, 'step')?.text.trim() ?? 'C';
          const midi = (num(kid(p, 'octave'), 4) + 1) * 12 + (STEP_PC[step] ?? 0) + num(kid(p, 'alter'), 0);
          const voice = kid(el, 'voice')?.text.trim() ?? '1';
          const ties = kids(el, 'tie').map((t) => t.attrs.type);
          const tieKey = `${voice}:${midi}`;
          const abs = measureStart + start;
          const prev = open.get(tieKey);
          if (ties.includes('stop') && prev) {
            prev.lengthBeats = abs + dur - prev.startBeats;
            if (!ties.includes('start')) open.delete(tieKey);
            continue;
          }
          const vel = parseFloat(el.attrs.dynamics ?? '') ? Math.round(Math.min(127, (parseFloat(el.attrs.dynamics) / 100) * 90)) : 90;
          const n: NoteEvent = { id: grooveUid(), startBeats: +abs.toFixed(6), lengthBeats: Math.max(0.01, +dur.toFixed(6)), key: Math.round(midi), vel };
          notes.push(n);
          if (ties.includes('start')) open.set(tieKey, n);
        }
      }
      // Bar length: the time signature in force, or what the notes filled (pickups).
      const ts = meter.filter((x) => x.bar <= mi).pop();
      const sigLen = ts ? ts.num * 4 / ts.den : 4;
      measureStart += mi === 0 && measureLen > 0 && measureLen < sigLen - 1e-6 && meas.attrs.implicit === 'yes' ? measureLen : sigLen;
    });
    parts.push({ id: part.attrs.id, name: names.get(part.attrs.id) ?? `Part ${pi + 1}`, notes: notes.sort((a, b) => a.startBeats - b.startBeats) });
  });
  if (!meter.length) meter.push({ bar: 0, num: 4, den: 4 });
  return { title, parts, bpm, meter, key };
}

/** Save MusicXML text as a download. */
export function downloadMusicXml(xml: string, name: string): void {
  const safe = (name || 'score').replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'score';
  const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.musicxml`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export { keyFifths };
