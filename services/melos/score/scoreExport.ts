/**
 * scoreExport.ts — a Score (scoreEngine.ts) out to MusicXML full score, type-1 MIDI, and the
 * track list the Chora renderer (melosWasmSongEngine.renderSongWithMelosWasm) plays.
 */

import { compileScore, pitchMidi, scoreLengthBeats, type Clef, type Pitch, type Score, type ScoreEvent, type Step } from './scoreEngine';
import type { MelosSongRenderRequest, MelosSongTrackSpec } from '../melosWasmSongEngine';

// ── MusicXML ──────────────────────────────────────────────────────────────────────────────────

const DIVISIONS = 8; // per quarter → thirty-second resolution
const KEY_ORDER_SHARPS: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

function keyAlter(fifths: number, step: Step): number {
  if (fifths > 0) return KEY_ORDER_SHARPS.slice(0, fifths).includes(step) ? 1 : 0;
  if (fifths < 0) return [...KEY_ORDER_SHARPS].reverse().slice(0, -fifths).includes(step) ? -1 : 0;
  return 0;
}

const TYPE_BY_DIV: Record<number, [string, number]> = {
  1: ['32nd', 0], 2: ['16th', 0], 3: ['16th', 1], 4: ['eighth', 0], 6: ['eighth', 1],
  8: ['quarter', 0], 12: ['quarter', 1], 16: ['half', 0], 24: ['half', 1], 32: ['whole', 0], 48: ['whole', 1],
};

const ACC_NAME: Record<number, string> = { [-2]: 'flat-flat', [-1]: 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };

function clefXml(clef: Clef): string {
  switch (clef) {
    case 'bass': return '<clef><sign>F</sign><line>4</line></clef>';
    case 'alto': return '<clef><sign>C</sign><line>3</line></clef>';
    case 'treble8vb': return '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>';
    default: return '<clef><sign>G</sign><line>2</line></clef>';
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function scoreToMusicXml(score: Score): string {
  const groups: Array<[string, string]> = [
    ['woodwinds', 'bracket'], ['brass', 'bracket'], ['harp', 'brace'], ['piano', 'brace'], ['strings', 'bracket'],
  ];
  let partList = '';
  let gi = 1;
  for (const [g, symbol] of groups) {
    const members = score.parts.filter((p) => p.group === g);
    if (!members.length) continue;
    const grouped = members.length > 1;
    if (grouped) partList += `<part-group type="start" number="${gi}"><group-symbol>${symbol}</group-symbol><group-barline>yes</group-barline></part-group>`;
    for (const p of members) {
      partList += `<score-part id="${p.id}"><part-name>${esc(p.name)}</part-name><part-abbreviation>${esc(p.abbr)}</part-abbreviation>`
        + `<score-instrument id="${p.id}-I"><instrument-name>${esc(p.name)}</instrument-name></score-instrument>`
        + `<midi-instrument id="${p.id}-I"><midi-program>${p.gmProgram + 1}</midi-program></midi-instrument></score-part>`;
    }
    if (grouped) partList += `<part-group type="stop" number="${gi}"/>`;
    gi++;
  }

  const sectionAt = new Map(score.sections.map((s) => [s.bar, s]));
  const firstPartId = score.parts[0].id;
  const barDiv = score.beatsPerBar * DIVISIONS;

  const partsXml = score.parts.map((part) => {
    const bars = score.bars[part.id];
    const measures = bars.map((events, bi) => {
      const barNo = bi + 1;
      let xml = `<measure number="${barNo}">`;
      if (bi === 0) {
        xml += `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${score.keyFifths}</fifths><mode>${score.keyMode}</mode></key>`
          + `<time><beats>${score.beatsPerBar}</beats><beat-type>${score.beatUnit}</beat-type></time>${clefXml(part.clef)}`
          + (part.octaveTranspose ? `<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>${part.octaveTranspose}</octave-change></transpose>` : '')
          + `</attributes>`;
      }
      if (part.id === firstPartId) {
        const sec = sectionAt.get(barNo);
        if (bi === 0) {
          xml += `<direction placement="above"><direction-type><words font-weight="bold">${esc(sec?.title ?? '')}</words></direction-type>`
            + `<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${score.bpm}</per-minute></metronome></direction-type><sound tempo="${score.bpm}"/></direction>`;
        } else if (sec) {
          xml += `<direction placement="above"><direction-type><rehearsal>${esc(sec.label)}</rehearsal></direction-type>`
            + `<direction-type><words font-style="italic">${esc(sec.title)}</words></direction-type></direction>`;
        }
      }
      const accState = new Map<string, number>();
      const allRest = events.every((e) => !e.pitches.length);
      if (allRest) {
        return `${xml}<note><rest measure="yes"/><duration>${barDiv}</duration></note></measure>`;
      }
      let pos = 0;
      // beam eighths/sixteenths per beat
      const beamInfo = events.map((e, i) => {
        if (!e.pitches.length || e.dur >= 1) return null;
        const beat = Math.floor(events.slice(0, i).reduce((s, x) => s + x.dur, 0) + 1e-6);
        return beat;
      });
      events.forEach((e, i) => {
        if (e.dynamic) xml += `<direction placement="below"><direction-type><dynamics><${e.dynamic}/></dynamics></direction-type></direction>`;
        if (e.words) xml += `<direction placement="above"><direction-type><words font-style="italic">${esc(e.words)}</words></direction-type></direction>`;
        const div = Math.round(e.dur * DIVISIONS);
        const t = TYPE_BY_DIV[div];
        if (!t) throw new Error(`${part.id} bar ${barNo}: unnotatable duration ${e.dur}`);
        const typeXml = `<type>${t[0]}</type>${t[1] ? '<dot/>' : ''}`;
        if (!e.pitches.length) {
          xml += `<note><rest/><duration>${div}</duration>${typeXml}</note>`;
          pos += div;
          return;
        }
        const b = beamInfo[i];
        let beam = '';
        if (b !== null) {
          const prevSame = i > 0 && beamInfo[i - 1] === b;
          const nextSame = i < events.length - 1 && beamInfo[i + 1] === b;
          const kind = prevSame && nextSame ? 'continue' : prevSame ? 'end' : nextSame ? 'begin' : '';
          if (kind) beam = `<beam number="1">${kind}</beam>`;
        }
        const tiedFromPrev = (() => {
          // tie stop when the previous event (this bar or last bar's final) tied into this pitch
          const prevEv: ScoreEvent | undefined = i > 0 ? events[i - 1] : bi > 0 ? bars[bi - 1][bars[bi - 1].length - 1] : undefined;
          return (p: Pitch) => !!prevEv?.tieToNext && prevEv.pitches.some((q) => pitchMidi(q) === pitchMidi(p));
        })();
        const sorted = [...e.pitches].sort((a, c) => pitchMidi(a) - pitchMidi(c));
        sorted.forEach((p, k) => {
          const keyName = `${p.step}${p.octave}`;
          const current = accState.has(keyName) ? accState.get(keyName)! : keyAlter(score.keyFifths, p.step);
          const stop = tiedFromPrev(p);
          const showAcc = p.alter !== current && !stop;
          accState.set(keyName, p.alter);
          const ties = `${stop ? '<tie type="stop"/>' : ''}${e.tieToNext ? '<tie type="start"/>' : ''}`;
          const tieds = `${stop ? '<tied type="stop"/>' : ''}${e.tieToNext ? '<tied type="start"/>' : ''}`;
          const artics = (e.artics ?? []).filter((a) => a === 'staccato' || a === 'accent' || a === 'tenuto');
          const trem = e.artics?.includes('tremolo') ? '<ornaments><tremolo type="single">3</tremolo></ornaments>' : '';
          const notations = tieds || artics.length || trem
            ? `<notations>${tieds}${artics.length && k === 0 ? `<articulations>${artics.map((a) => `<${a}/>`).join('')}</articulations>` : ''}${k === 0 ? trem : ''}</notations>`
            : '';
          xml += `<note>${k > 0 ? '<chord/>' : ''}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`
            + `<duration>${div}</duration>${ties}${typeXml}${showAcc ? `<accidental>${ACC_NAME[p.alter]}</accidental>` : ''}${k === 0 ? beam : ''}${notations}</note>`;
        });
        pos += div;
      });
      if (pos !== barDiv) throw new Error(`${part.id} bar ${barNo}: ${pos}/${barDiv} divisions`);
      if (barNo === bars.length) xml += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
      return `${xml}</measure>`;
    }).join('');
    return `<part id="${part.id}">${measures}</part>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${esc(score.title)}</work-title></work><movement-title>${esc(score.subtitle)}</movement-title>
<identification><creator type="composer">${esc(score.composer)}</creator></identification>
<part-list>${partList}</part-list>${partsXml}</score-partwise>`;
}

// ── MIDI (SMF type 1) ─────────────────────────────────────────────────────────────────────────

function varLen(v: number): number[] {
  const out = [v & 0x7f];
  let x = v >> 7;
  while (x > 0) { out.unshift((x & 0x7f) | 0x80); x >>= 7; }
  return out;
}

function chunk(tag: string, data: number[]): number[] {
  const len = data.length;
  return [...tag].map((c) => c.charCodeAt(0)).concat([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255], data);
}

function trackBytes(events: Array<{ tick: number; bytes: number[] }>): number[] {
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0));
  const out: number[] = [];
  let last = 0;
  for (const e of events) { out.push(...varLen(e.tick - last), ...e.bytes); last = e.tick; }
  out.push(0, 0xff, 0x2f, 0);
  return out;
}

const textMeta = (type: number, s: string) => { const b = [...new TextEncoder().encode(s)]; return [0xff, type, ...varLen(b.length), ...b]; };

export function scoreToMidi(score: Score): Uint8Array {
  const PPQ = 480;
  const notes = compileScore(score);
  const usPerQ = Math.round(60_000_000 / score.bpm);
  const tracks: number[][] = [];
  tracks.push(trackBytes([
    { tick: 0, bytes: textMeta(0x03, score.title) },
    { tick: 0, bytes: [0xff, 0x51, 3, (usPerQ >> 16) & 255, (usPerQ >> 8) & 255, usPerQ & 255] },
    { tick: 0, bytes: [0xff, 0x58, 4, score.beatsPerBar, Math.log2(score.beatUnit), 24, 8] },
    { tick: 0, bytes: [0xff, 0x59, 2, score.keyFifths & 255, score.keyMode === 'minor' ? 1 : 0] },
    ...score.sections.map((s) => ({ tick: (s.bar - 1) * score.beatsPerBar * PPQ, bytes: textMeta(0x06, `${s.label} ${s.title}`) })),
  ]));
  let ch = 0;
  const chanByProgram = new Map<string, number>();
  for (const part of score.parts) {
    const groupKey = part.id.replace(/(R|L)$/, ''); // piano/harp hands share a channel
    if (!chanByProgram.has(groupKey)) { chanByProgram.set(groupKey, ch); ch = ch === 8 ? 10 : ch + 1; }
    const c = chanByProgram.get(groupKey)!;
    const ev: Array<{ tick: number; bytes: number[] }> = [
      { tick: 0, bytes: textMeta(0x03, part.name) },
      { tick: 0, bytes: [0xc0 | c, part.gmProgram] },
      { tick: 0, bytes: [0xb0 | c, 10, Math.round(64 + part.chora.pan * 50)] },
    ];
    for (const n of notes[part.id]) {
      const on = Math.round(n.startBeats * PPQ);
      const gate = n.articulation === 'staccato' || n.articulation === 'pizzicato' ? 0.45 : 0.96;
      const off = on + Math.max(30, Math.round(n.lengthBeats * PPQ * gate));
      ev.push({ tick: on, bytes: [0x90 | c, n.key, n.vel] }, { tick: off, bytes: [0x80 | c, n.key, 0] });
    }
    tracks.push(trackBytes(ev));
  }
  const header = chunk('MThd', [0, 1, 0, tracks.length, PPQ >> 8, PPQ & 255]);
  return new Uint8Array([...header, ...tracks.flatMap((t) => chunk('MTrk', t))]);
}

// ── Chora render request ──────────────────────────────────────────────────────────────────────

/**
 * Each Chora engine instance has 4 voices, so chordal parts are split into one track per
 * chord layer (lowest note, next, …) before rendering — otherwise held chords steal each other.
 */
export function scoreToChoraRequest(score: Score, opts: { hallReverbDecaySec?: number; wetReverbMix?: number; sampleRate?: number } = {}): MelosSongRenderRequest {
  const notes = compileScore(score);
  const tracks: MelosSongTrackSpec[] = [];
  for (const part of score.parts) {
    const all = notes[part.id];
    if (!all.length) continue;
    // group simultaneous onsets and deal them into layers by pitch order
    const layers: typeof all[] = [];
    const byOnset = new Map<number, typeof all>();
    for (const n of all) {
      const k = Math.round(n.startBeats * 1000);
      if (!byOnset.has(k)) byOnset.set(k, []);
      byOnset.get(k)!.push(n);
    }
    for (const group of byOnset.values()) {
      group.sort((a, b) => a.key - b.key).forEach((n, i) => { (layers[i] ??= []).push(n); });
    }
    layers.forEach((layer, li) => tracks.push({
      role: part.group === 'strings' && part.id === 'vc' ? 'bass' : 'harmony',
      trackName: layers.length > 1 ? `${part.name} ${li + 1}` : part.name,
      instrumentType: part.chora.instrumentType,
      presetId: part.chora.presetId,
      gainDb: part.chora.gainDb - (layers.length > 1 ? 10 * Math.log10(layers.length) : 0),
      pan: part.chora.pan,
      notes: layer.sort((a, b) => a.startBeats - b.startBeats),
    }));
  }
  return {
    songId: score.id,
    bpm: score.bpm,
    lengthBeats: scoreLengthBeats(score),
    rootMidi: 62,
    hallReverbDecaySec: opts.hallReverbDecaySec ?? 2.2,
    hallReverbDamping: 0.45,
    wetReverbMix: opts.wetReverbMix ?? 0.26,
    percussionStyle: 'none',
    enableAceStepHybridStems: false,
    sampleRate: opts.sampleRate ?? 32000,
    tracks,
  };
}
