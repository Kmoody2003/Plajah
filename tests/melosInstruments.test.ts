// Multisample instruments (KERA keygroups): every format parser, the sample-name zone mapper,
// fitting big libraries into the engine, WAV `smpl` facts, and loading onto a pad / track.
// Pure — tsx --test. Fixtures are built in-test to each format's layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, deflateSync, crc32 } from 'node:zlib';
import {
  fitToSlots, instrumentFormatFor, looksLikeMultisample, nameFacts, parseBitwigMultisample, parseDsInstrument,
  parseExs, parseInstrumentBytes, parseMultisampleXml, parseNki, parseSf2Instrument, parseSfzInstrument,
  zonesFromFileNames, zone, KONTAKT_LOCKED_NOTE,
} from '../services/melos/beats/kits/instruments';
import { wavFacts } from '../services/melos/beats/kits/bytes';
import { instrumentOnPad, instrumentTrack } from '../services/melos/beats/kits/applyInstrument';
import { newGrooveDoc, type ArrangeTrack } from '../services/melos/beats/grooveDoc';
import { parseSf2 } from '../services/melos/instruments/kera/sf2';
import { playbackRate, selectZones } from '../services/melos/instruments/kera/zones';
import type { ZoneSpec } from '../services/melos/beats/kits/types';

const enc = (s: string) => new TextEncoder().encode(s);
const u16le = (s: string) => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 0xff; b[i * 2 + 1] = s.charCodeAt(i) >> 8; } return b; };
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const junk = (n: number, seed = 7) => { const b = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x & 0x1f; } return b; };
const path = (z: ZoneSpec) => (z.sample.kind === 'path' ? z.sample.path : '#bytes');

function makeZip(files: Record<string, Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const nb = enc(name); const comp = deflateRawSync(data); const crc = crc32(data);
    const lh = new Uint8Array(30 + nb.length); const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 8, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, comp.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nb.length, true); lh.set(nb, 30);
    const ch = new Uint8Array(46 + nb.length); const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true); ch.set(nb, 46);
    locals.push(lh, comp); centrals.push(ch); off += lh.length + comp.length;
  }
  const cd = cat(...centrals);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cd.length, true); ev.setUint32(16, off, true);
  return cat(...locals, cd, end);
}

/** A WAV with an optional `smpl` chunk (root + one loop). */
function makeWav(rate: number, frames: number, smpl?: { root: number; loop?: [number, number] }): Uint8Array {
  const fmt = new Uint8Array(16); const fv = new DataView(fmt.buffer);
  fv.setUint16(0, 1, true); fv.setUint16(2, 1, true); fv.setUint32(4, rate, true); fv.setUint32(8, rate * 2, true); fv.setUint16(12, 2, true); fv.setUint16(14, 16, true);
  const ck = (id: string, d: Uint8Array) => { const h = new Uint8Array(8); h.set(enc(id)); new DataView(h.buffer).setUint32(4, d.length, true); return cat(h, d); };
  const parts = [ck('fmt ', fmt), ck('data', new Uint8Array(frames * 2))];
  if (smpl) {
    const loops = smpl.loop ? 1 : 0;
    const s = new Uint8Array(36 + loops * 24); const sv = new DataView(s.buffer);
    sv.setUint32(12, smpl.root, true); sv.setUint32(28, loops, true);
    if (smpl.loop) { sv.setUint32(36 + 8, smpl.loop[0], true); sv.setUint32(36 + 12, smpl.loop[1], true); }
    parts.push(ck('smpl', s));
  }
  const body = cat(enc('WAVE'), ...parts);
  const h = new Uint8Array(8); h.set(enc('RIFF')); new DataView(h.buffer).setUint32(4, body.length, true);
  return cat(h, body);
}

// ── Detection ────────────────────────────────────────────────────────────────

test('instrument formats are recognised by extension', () => {
  assert.equal(instrumentFormatFor('Grand.sfz'), 'sfz');
  assert.equal(instrumentFormatFor('Felt Piano.dspreset'), 'decent');
  assert.equal(instrumentFormatFor('GeneralUser GS.sf2'), 'soundfont');
  assert.equal(instrumentFormatFor('Strings.multisample'), 'bitwig-multisample');
  assert.equal(instrumentFormatFor('Steinway.exs'), 'exs');
  assert.equal(instrumentFormatFor('Upright.nki'), 'kontakt');
  assert.equal(instrumentFormatFor('Library.nkx'), null);
});

// ── SFZ: full zones ──────────────────────────────────────────────────────────

const PIANO_SFZ = `
/* A two-layer piano with round robins, a release trigger and a keyswitch */
#define $LOUD 64
<control> default_path=Samples/
<global> ampeg_release=0.6 ampeg_attack=0.002
<master> volume=-3
<group> lovel=1 hivel=$LOUD seq_length=2
<region> sample=Piano C3 soft rr1.wav lokey=58 hikey=62 pitch_keycenter=60 seq_position=1
<region> sample=Piano C3 soft rr2.wav lokey=58 hikey=62 pitch_keycenter=60 seq_position=2
<group> lovel=65 hivel=127
<region> sample=Piano C3 hard.wav lokey=58 hikey=62 pitch_keycenter=60 tune=-12 loop_mode=loop_sustain loop_start=100 loop_end=900
<region> sample=Piano E3 hard.wav key=64 offset=40 end=2000
<group> trigger=release
<region> sample=Release C3.wav lokey=58 hikey=62
`;

test('SFZ: velocity layers, round robins, roots, loops and play windows come across', () => {
  const spec = parseSfzInstrument(PIANO_SFZ, 'Piano');
  assert.equal(spec.zones.length, 4, 'release-trigger region skipped');
  assert.ok(spec.notes.some((n) => /release-trigger/.test(n)));
  const [rr1, rr2, hard, e3] = spec.zones;
  assert.equal(path(rr1), 'Samples/Piano C3 soft rr1.wav');
  assert.deepEqual([rr1.loKey, rr1.hiKey, rr1.loVel, rr1.hiVel, rr1.rootNote], [58, 62, 1, 64, 60]);
  assert.ok(rr1.rrGroup > 0 && rr1.rrGroup === rr2.rrGroup, 'round robins share a group');
  assert.deepEqual([rr1.rrIndex, rr2.rrIndex], [0, 1]);
  assert.equal(hard.loVel, 65);
  assert.equal(hard.rrGroup, 0);
  assert.equal(hard.tuneCents, -12);
  assert.equal(hard.gainDb, -3, '<master> volume cascades');
  assert.deepEqual([hard.loopMode, hard.loopStart, hard.loopEnd], ['sustain', 100, 900]);
  assert.deepEqual([e3.loKey, e3.hiKey, e3.rootNote, e3.startFrame, e3.endFrame], [64, 64, 64, 40, 2000]);
  assert.equal(spec.amp?.release, 0.6);
});

test('SFZ: keyswitched articulations load the default one only', () => {
  const sfz = `<global> sw_lokey=24 sw_hikey=26 sw_default=25
<group> sw_last=24 <region> sample=legato.wav lokey=40 hikey=80
<group> sw_last=25 <region> sample=sustain.wav lokey=40 hikey=80
<group> sw_last=26 <region> sample=pizz.wav lokey=40 hikey=80`;
  const spec = parseSfzInstrument(sfz, 'Strings');
  assert.deepEqual(spec.zones.map(path), ['sustain.wav']);
  assert.ok(spec.notes.some((n) => /keyswitched/.test(n)));
});

test('SFZ: random round robins (lorand/hirand) cycle in their slice order', () => {
  const sfz = `<region> sample=b.wav key=60 lorand=0.5 hirand=1
<region> sample=a.wav key=60 lorand=0 hirand=0.5`;
  const spec = parseSfzInstrument(sfz, 'Snare');
  const [b, a] = spec.zones;
  assert.ok(a.rrGroup && a.rrGroup === b.rrGroup);
  assert.ok(a.rrIndex < b.rrIndex, 'the low slice plays first');
});

// ── Selected zones play at the right pitch ───────────────────────────────────

test('zones pick by key + velocity and resample from their root', () => {
  // A KERA program shaped like the SFZ above (what buildInstrumentProgram produces).
  const sample = (id: string, root: number) => ({ id, name: id, channels: [], sampleRate: 48000, rootNote: root, fineTune: 0, loopStart: 0, loopEnd: 0, loopMode: 'off' as const });
  const z = (sampleId: string, loKey: number, hiKey: number, loVel: number, hiVel: number) => ({ sampleId, loKey, hiKey, loVel, hiVel, rrGroup: 0, rrIndex: 0, tuneSemis: 0, tuneCents: 0, gainDb: 0, pan: 0, offGroup: 0 });
  const prog = { id: 'p', name: 'P', source: 'sfz' as const, samples: [sample('soft', 60), sample('hard', 60), sample('e', 64)], zones: [z('soft', 0, 62, 1, 64), z('hard', 0, 62, 65, 127), z('e', 63, 127, 1, 127)], amp: { attack: 0, hold: 0, decay: 0, sustain: 1, release: 0.1 }, playMode: 'repitch' as const, transpose: 0, gainDb: 0, polyphony: 24 };
  const rr = new Map<number, number>();
  assert.deepEqual(selectZones(prog, 60, 30, rr).map((x) => x.sampleId), ['soft']);
  assert.deepEqual(selectZones(prog, 60, 110, rr).map((x) => x.sampleId), ['hard']);
  const up = selectZones(prog, 62, 100, rr)[0];
  assert.ok(Math.abs(playbackRate(prog.samples[1], up, 62, 0) - 2 ** (2 / 12)) < 1e-9, 'D3 plays the C3 sample two semitones up');
  const e = selectZones(prog, 64, 100, rr)[0];
  assert.equal(playbackRate(prog.samples[2], e, 64, 0), 1, 'a key on its own root plays at unity');
});

// ── Decent Sampler ───────────────────────────────────────────────────────────

test('Decent Sampler: groups cascade, round robins, loops, release triggers skipped', () => {
  const xml = `<?xml version="1.0"?>
<DecentSampler>
  <groups attack="0.01" release="0.8" volume="-2dB">
    <group name="Soft" loVel="1" hiVel="80" seqMode="round_robin">
      <sample path="Samples/Felt C3 1.wav" rootNote="60" loNote="55" hiNote="65" seqPosition="1" tuning="0.25"/>
      <sample path="Samples/Felt C3 2.wav" rootNote="60" loNote="55" hiNote="65" seqPosition="2"/>
    </group>
    <group name="Loud" loVel="81" hiVel="127" volume="0.5">
      <sample path="Samples/Felt C3 hard.wav" rootNote="60" loNote="55" hiNote="65" loopEnabled="true" loopStart="10" loopEnd="500" pan="50"/>
      <sample path="Samples/Felt rel.wav" rootNote="60" trigger="release"/>
    </group>
  </groups>
  <effects><effect type="reverb"/></effects>
</DecentSampler>`;
  const spec = parseDsInstrument(xml, 'Felt');
  assert.equal(spec.zones.length, 3);
  const [a, b, c] = spec.zones;
  assert.deepEqual([a.loKey, a.hiKey, a.loVel, a.hiVel, a.rootNote], [55, 65, 1, 80, 60]);
  assert.ok(a.rrGroup > 0 && a.rrGroup === b.rrGroup && a.rrIndex === 0 && b.rrIndex === 1);
  assert.equal(a.tuneCents, 25);
  assert.equal(a.gainDb, -2);
  assert.ok(Math.abs(c.gainDb - (-2 + 20 * Math.log10(0.5))) < 0.01, 'linear group volume → dB on top of the <groups> level');
  assert.deepEqual([c.loopMode, c.loopStart, c.loopEnd, c.pan], ['forward', 10, 500, 0.5]);
  assert.equal(spec.amp?.release, 0.8);
  assert.ok(spec.notes.some((n) => /release-trigger/.test(n)) && spec.notes.some((n) => /effects/.test(n)));
});

// ── SoundFont (melodic) ──────────────────────────────────────────────────────

/** Two presets: a melodic one (bank 0, two instrument zones split at E3, the upper one with a root
 *  override + sustain loop, the preset zone clipping keys to 36–96), and a drum kit (bank 128). */
function makeMelodicSf2(): Uint8Array {
  const chunk = (id: string, data: Uint8Array) => { const h = new Uint8Array(8); h.set(enc(id)); new DataView(h.buffer).setUint32(4, data.length, true); return cat(h, data, new Uint8Array(data.length % 2)); };
  const list = (type: string, ...subs: Uint8Array[]) => chunk('LIST', cat(enc(type), ...subs));
  const name20 = (s: string) => { const b = new Uint8Array(20); b.set(enc(s).subarray(0, 19)); return b; };
  const phdr = (n: string, preset: number, bank: number, bag: number) => { const b = new Uint8Array(38); b.set(name20(n)); const v = new DataView(b.buffer); v.setUint16(20, preset, true); v.setUint16(22, bank, true); v.setUint16(24, bag, true); return b; };
  const bag = (g: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint16(0, g, true); return b; };
  const gen = (op: number, amt: number, range?: [number, number]) => { const b = new Uint8Array(4); const v = new DataView(b.buffer); v.setUint16(0, op, true); if (range) { b[2] = range[0]; b[3] = range[1]; } else v.setInt16(2, amt, true); return b; };
  const instRec = (n: string, bagIdx: number) => { const b = new Uint8Array(22); b.set(name20(n)); new DataView(b.buffer).setUint16(20, bagIdx, true); return b; };
  const shdrRec = (n: string, start: number, end: number, ls: number, le: number, rate: number, pitch: number) => { const b = new Uint8Array(46); b.set(name20(n)); const v = new DataView(b.buffer); v.setUint32(20, start, true); v.setUint32(24, end, true); v.setUint32(28, ls, true); v.setUint32(32, le, true); v.setUint32(36, rate, true); v.setUint8(40, pitch); return b; };
  const smpl = new Uint8Array(300 * 2);
  // Presets: 0 "Keys" (bank 0) → pbag 0; 1 "Kit" (bank 128) → pbag 1; EOP → pbag 2.
  const PHDR = cat(phdr('Kit', 0, 128, 0), phdr('Keys', 0, 0, 1), phdr('EOP', 0, 0, 2));
  const PBAG = cat(bag(0), bag(1), bag(3));
  const PGEN = cat(gen(41, 1), gen(43, 0, [36, 96]), gen(41, 0), gen(0, 0));
  // Instruments: 0 "Keys" (ibag 0..2), 1 "Kit" (ibag 2..3), EOI.
  const INST = cat(instRec('Keys', 0), instRec('Kit', 2), instRec('EOI', 3));
  const IBAG = cat(bag(0), bag(2), bag(6), bag(8));
  const IGEN = cat(
    gen(43, 0, [0, 63]), gen(53, 0),                                   // low zone: sample 0 (root 60)
    gen(43, 0, [64, 127]), gen(58, 67), gen(54, 3), gen(53, 1),         // high zone: sample 1 recorded at 64, root overridden to 67, sustain loop
    gen(43, 0, [36, 36]), gen(53, 2),                                  // kit: kick
    gen(0, 0),
  );
  const SHDR = cat(shdrRec('C3', 0, 100, 20, 80, 44100, 60), shdrRec('E3', 100, 200, 120, 180, 44100, 64), shdrRec('Kick', 200, 300, 0, 0, 44100, 60), shdrRec('EOS', 0, 0, 0, 0, 0, 0));
  return chunk('RIFF', cat(enc('sfbk'), list('sdta', chunk('smpl', smpl)), list('pdta', chunk('phdr', PHDR), chunk('pbag', PBAG), chunk('pgen', PGEN), chunk('inst', INST), chunk('ibag', IBAG), chunk('igen', IGEN), chunk('shdr', SHDR))));
}

test('SoundFont: the melodic preset is chosen, zones keep their ranges, preset key range clips them', () => {
  const spec = parseSf2Instrument(makeMelodicSf2(), 'Bank');
  assert.equal(spec.presetIndex, 1, 'skips the bank-128 drum preset');
  assert.equal(spec.presets?.length, 2);
  assert.equal(spec.zones.length, 2);
  const [lo, hi] = spec.zones;
  assert.deepEqual([lo.loKey, lo.hiKey], [36, 63], 'preset range 36–96 clips the low zone');
  assert.deepEqual([hi.loKey, hi.hiKey], [64, 96]);
  assert.equal(hi.loopMode, 'sustain');
  const drums = parseSf2Instrument(makeMelodicSf2(), 'Bank', 0);
  assert.ok(drums.notes.some((n) => /percussion/.test(n)));
});

test('SoundFont: an overridden root plays in tune (sample recorded at E3, mapped with root G3)', () => {
  const prog = parseSf2(makeMelodicSf2())!.load(1)!;
  const z = prog.zones.find((x) => x.loKey === 64)!;
  const s = prog.samples.find((x) => x.id === z.sampleId)!;
  assert.equal(s.rootNote, 64);
  // Key 67 is the zone's root: it must play the recording untransposed.
  assert.ok(Math.abs(playbackRate(s, z, 67, 0) - 1) < 1e-9);
  assert.deepEqual([s.loopStart, s.loopEnd], [20, 80], 'loop points relative to the sample start');
});

// ── Bitwig .multisample ──────────────────────────────────────────────────────

const MULTISAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<multisample name="Mellow Keys">
  <generator>Bitwig Studio</generator>
  <sample file="Keys C3.wav" gain="-1.5" sample-start="0" sample-stop="44100" zone-logic="round-robin" tune="0.1">
    <key root="60" low="0" high="63" tune="0"/><velocity low="0" high="127"/>
    <loop mode="sustain" start="1000" stop="40000"/>
  </sample>
  <sample file="Keys C3 b.wav" zone-logic="round-robin"><key root="60" low="0" high="63"/><velocity low="0" high="127"/></sample>
  <sample file="Keys G3.wav"><key root="67" low="64" high="127"/><velocity low="64" high="127"/><loop mode="off"/></sample>
</multisample>`;

test('Bitwig multisample: keys, velocity, round robins, loops; samples come out of the zip', async () => {
  const wav = makeWav(44100, 10);
  const bytes = makeZip({ 'multisample.xml': enc(MULTISAMPLE_XML), 'Keys C3.wav': wav, 'Keys C3 b.wav': wav, 'Keys G3.wav': wav });
  const spec = await parseBitwigMultisample(bytes, 'file');
  assert.equal(spec.name, 'Mellow Keys');
  assert.equal(spec.zones.length, 3);
  const [a, b, g] = spec.zones;
  assert.equal(a.sample.kind, 'bytes', 'zip samples handed over as bytes');
  assert.deepEqual([a.rootNote, a.loKey, a.hiKey, a.loVel, a.hiVel], [60, 0, 63, 1, 127]);
  assert.ok(a.rrGroup && a.rrGroup === b.rrGroup && a.rrIndex === 0 && b.rrIndex === 1);
  assert.deepEqual([a.loopMode, a.loopStart, a.loopEnd, a.endFrame, a.tuneCents, a.gainDb], ['sustain', 1000, 40000, 44100, 10, -1.5]);
  assert.deepEqual([g.rootNote, g.loKey, g.loVel, g.loopMode, g.rrGroup], [67, 64, 64, 'off', 0]);
  assert.equal(parseMultisampleXml(MULTISAMPLE_XML, 'x').zones.length, 3);
  const notZip = await parseBitwigMultisample(enc('nope'), 'x');
  assert.equal(notZip.zones.length, 0);
});

// ── Logic EXS24 ──────────────────────────────────────────────────────────────

/** `flagged`: later Logic versions set 0x8000 in the size word (seen in real GarageBand .exs). */
function makeExs(little: boolean, flagged = false): Uint8Array {
  const chunk = (type: number, name: string, bodySize: number, fill: (v: DataView, b: Uint8Array) => void) => {
    const b = new Uint8Array(84 + bodySize); const v = new DataView(b.buffer);
    v.setUint32(0, (type << 24) | 0x0101, little); v.setUint32(4, bodySize | (flagged ? 0x8000 : 0), little);
    b.set(enc(little ? 'SOBT' : 'TBOS'), 16); b.set(enc(name).subarray(0, 63), 20);
    fill(v, b);
    return b;
  };
  const zoneChunk = (name: string, root: number, lo: number, hi: number, vel: [number, number] | null, sampleIdx: number, loop?: [number, number]) =>
    chunk(1, name, 104, (v, b) => {
      b[84] = vel ? 8 : 0; b[85] = root; v.setInt8(86, -5); v.setInt8(87, 25); v.setInt8(88, -6);
      b[90] = lo; b[91] = hi; if (vel) { b[93] = vel[0]; b[94] = vel[1]; }
      v.setUint32(96, 0, little); v.setUint32(100, 0, little);
      if (loop) { v.setUint32(104, loop[0], little); v.setUint32(108, loop[1], little); b[117] = 1; }
      v.setInt8(164, 0); v.setUint32(176, sampleIdx, little);
    });
  const sampleChunk = (name: string, folder: string, file: string) => chunk(3, name, 592, (_v, b) => { b.set(enc(folder), 164); b.set(enc(file), 420); });
  return cat(
    chunk(0, 'Steinway D', 40, () => {}),
    zoneChunk('C3 soft', 60, 0, 62, [1, 90], 0),
    zoneChunk('C3 hard', 60, 0, 62, [91, 127], 1, [500, 8000]),
    zoneChunk('E3', 64, 63, 127, null, 2),
    chunk(2, 'Group 1', 64, () => {}),
    sampleChunk('C3 soft', 'Macintosh HD:Samples:Steinway:', 'Steinway C3 pp.aif'),
    sampleChunk('C3 hard', 'Macintosh HD:Samples:Steinway', 'Steinway C3 ff.aif'),
    sampleChunk('E3', '/Users/me/Samples/Steinway', 'Steinway E3.aif'),
  );
}

for (const [little, flagged] of [[true, false], [false, false], [true, true]]) {
  test(`EXS24: zones, velocity ranges, loops and sample files (${little ? 'little' : 'big'}-endian${flagged ? ', flagged sizes' : ''})`, async () => {
    const spec = await parseExs(makeExs(little, flagged), 'file');
    assert.equal(spec.name, 'Steinway D');
    assert.equal(spec.zones.length, 3);
    const [soft, hard, e3] = spec.zones;
    assert.deepEqual([soft.rootNote, soft.loKey, soft.hiKey, soft.loVel, soft.hiVel], [60, 0, 62, 1, 90]);
    assert.deepEqual([hard.loVel, hard.loopMode, hard.loopStart, hard.loopEnd], [91, 'sustain', 500, 8000]);
    assert.deepEqual([e3.loVel, e3.hiVel, e3.loKey], [1, 127, 63], 'velocity range off = full range');
    assert.equal(soft.tuneCents, -5);
    assert.equal(soft.gainDb, -6);
    assert.equal(soft.pan, 0.5);
    assert.equal(path(soft), 'Macintosh HD/Samples/Steinway/Steinway C3 pp.aif', 'HFS folder normalised');
    assert.equal(path(e3), '/Users/me/Samples/Steinway/Steinway E3.aif');
  });
}

// ── Kontakt .nki ─────────────────────────────────────────────────────────────

test('Kontakt 5+ (closed binary): sample paths are recovered, zones rebuilt from the names', async () => {
  const names = ['Upright C2 v1.wav', 'Upright C2 v2.wav', 'Upright F#2 v1.wav', 'Upright F#2 v2.wav', 'Upright C3 v1.wav', 'Upright C3 v2.wav'];
  const bytes = cat(enc('hsin'), junk(300), ...names.flatMap((n) => [u16le(`C:\\Libraries\\Upright\\Samples\\${n}`), new Uint8Array([0, 0]), junk(40, n.length)]));
  const spec = await parseNki(bytes, 'Upright');
  assert.equal(spec.locked, undefined);
  assert.equal(spec.zones.length, 6);
  assert.ok(spec.notes[0].includes('rebuilt from the sample names'));
  const c3soft = spec.zones.find((z) => path(z).endsWith('Upright C3 v1.wav'))!;
  assert.deepEqual([c3soft.rootNote, c3soft.loVel, c3soft.hiVel, c3soft.hiKey], [60, 1, 64, 127]);
  const fs2 = spec.zones.find((z) => path(z).endsWith('F#2 v2.wav'))!;
  assert.deepEqual([fs2.rootNote, fs2.loKey, fs2.hiKey, fs2.loVel], [54, 52, 57, 65]);
});

test('Kontakt 2–4: the zone map is read from the zlib-packed XML', async () => {
  const xml = `<?xml version="1.0"?><K2_Container><Programs><Program><Zones>
    <Zone><Parameters><V name="rootKey" value="48"/><V name="lowKey" value="40"/><V name="highKey" value="52"/><V name="lowVelocity" value="1"/><V name="highVelocity" value="100"/></Parameters><Sample><V name="file" value="..\\Samples\\Cello C2.wav"/></Sample></Zone>
    <Zone><Parameters><V name="rootKey" value="55"/><V name="lowKey" value="53"/><V name="highKey" value="60"/></Parameters><Sample><V name="file" value="..\\Samples\\Cello G2.wav"/></Sample></Zone>
  </Zones></Program></Programs></K2_Container>`;
  const bytes = cat(enc('KON2'), junk(64), deflateSync(enc(xml)), junk(32));
  const spec = await parseNki(bytes, 'Cello');
  assert.equal(spec.zones.length, 2);
  assert.ok(spec.notes[0].startsWith('Zone map read'));
  assert.deepEqual([spec.zones[0].rootNote, spec.zones[0].loKey, spec.zones[0].hiKey, spec.zones[0].hiVel], [48, 40, 52, 100]);
  assert.equal(path(spec.zones[1]), '../Samples/Cello G2.wav');
});

test('Kontakt: encrypted content is reported as locked, pointing at the NKS preview', async () => {
  const monolith = await parseNki(cat(enc('hsin'), junk(200), u16le('Grand Piano.nkx'), new Uint8Array(2), junk(50)), 'Grand');
  assert.equal(monolith.locked, true);
  assert.equal(monolith.zones.length, 0);
  assert.ok(monolith.notes.includes(KONTAKT_LOCKED_NOTE));
  const ncw = await parseNki(cat(junk(100), u16le('Samples\\Grand C3.ncw'), new Uint8Array(2), junk(20)), 'Grand');
  assert.equal(ncw.locked, true);
  assert.ok(/\.ncw/.test(ncw.notes[0]));
  assert.ok(/NKS/.test(KONTAKT_LOCKED_NOTE));
});

test('parseInstrumentBytes dispatches by format', async () => {
  const spec = await parseInstrumentBytes('sfz', enc('<region> sample=x.wav key=60'), 'Lead.sfz');
  assert.equal(spec.name, 'Lead');
  assert.equal(spec.zones.length, 1);
});

// ── Sample names → zones ─────────────────────────────────────────────────────

test('name facts: notes, accidentals, octaves, layers, round robins', () => {
  assert.equal(nameFacts('Piano C3 v2.wav').note, 60);
  assert.equal(nameFacts('Piano C3 v2.wav').layer, 2);
  assert.equal(nameFacts('Strings_F#2_rr3.wav').note, 54);
  assert.equal(nameFacts('Strings_F#2_rr3.wav').rr, 3);
  assert.equal(nameFacts('Choir-Db4-mf.aif').note, 73);
  assert.equal(nameFacts('Choir-Db4-mf.aif').layerKind, 'dynamic');
  assert.equal(nameFacts('Bass A-1.wav').note, 21, 'C3 = 60, so C-2 = 0');
  assert.equal(nameFacts('Rhodes_072_vel_100.wav').note, 72);
  assert.equal(nameFacts('Rhodes_072_vel_100.wav').layerKind, 'velocity');
  assert.equal(nameFacts('Mic C414 room.wav').note, -1, 'a mic model is not a note');
  assert.equal(nameFacts('Piano C4.wav', 4).note, 60, 'C4 = middle C convention');
});

test('zones from names: keys split halfway, layers split 1–127, round robins cycle', () => {
  const files = ['C2 soft.wav', 'C2 hard.wav', 'G2 soft.wav', 'G2 hard.wav', 'C3 soft rr1.wav', 'C3 soft rr2.wav', 'C3 hard.wav', 'readme.txt', 'Room tone.wav'];
  const spec = zonesFromFileNames(files.map((f) => `Lib/${f}`), 'Lib');
  assert.equal(spec.zones.length, 7);
  assert.ok(spec.notes.some((n) => /1 sample without a key/.test(n)));
  const c2s = spec.zones.find((z) => path(z) === 'Lib/C2 soft.wav')!;
  assert.deepEqual([c2s.loKey, c2s.hiKey, c2s.loVel, c2s.hiVel], [0, 51, 1, 64]);
  const g2h = spec.zones.find((z) => path(z) === 'Lib/G2 hard.wav')!;
  assert.deepEqual([g2h.loKey, g2h.hiKey, g2h.loVel, g2h.hiVel], [52, 57, 65, 127]);
  const rr = spec.zones.filter((z) => path(z).includes('C3 soft'));
  assert.ok(rr[0].rrGroup && rr[0].rrGroup === rr[1].rrGroup);
  assert.deepEqual(rr.map((z) => z.rrIndex), [0, 1]);
  assert.equal(spec.zones.find((z) => path(z) === 'Lib/C3 hard.wav')!.hiKey, 127);
});

test('melodic folders are told apart from drum folders', () => {
  assert.ok(looksLikeMultisample(['Harp C2.wav', 'Harp E2.wav', 'Harp G2.wav', 'Harp C3.wav', 'Harp E3.wav']));
  assert.ok(!looksLikeMultisample(['Kick.wav', 'Snare.wav', 'Hat.wav', 'Clap.wav', 'Tom.wav']));
  assert.ok(!looksLikeMultisample(['Pad C3.wav', 'Kick.wav', 'Snare.wav']));
});

// ── Fitting the engine's 128 slots ───────────────────────────────────────────

test('a library bigger than 128 samples is thinned: round robins, then layers, then keys', () => {
  const zones: ZoneSpec[] = [];
  for (let k = 21; k <= 108; k++) for (let l = 0; l < 4; l++) for (let r = 0; r < 2; r++) {
    zones.push(zone({ kind: 'path', path: `p${k}_${l}_${r}.wav` }, { rootNote: k, loKey: k, hiKey: k, loVel: l * 32 + 1, hiVel: l * 32 + 32, rrGroup: k * 10 + l + 1, rrIndex: r }));
  }
  const fitted = fitToSlots({ name: 'Big', format: 'sfz', zones, notes: [] });
  const samples = new Set(fitted.zones.map(path));
  assert.ok(samples.size <= 128, `${samples.size} samples`);
  assert.ok(fitted.zones.every((z) => z.rrGroup === 0), 'round robins dropped first');
  // Every key 21–108 and every velocity still sounds.
  for (let k = 21; k <= 108; k++) for (const v of [1, 64, 127]) {
    assert.ok(fitted.zones.some((z) => k >= z.loKey && k <= z.hiKey && v >= z.loVel && v <= z.hiVel), `key ${k} vel ${v}`);
  }
  assert.ok(fitted.notes.at(-1)!.includes('704 samples'));
  const small = { name: 'S', format: 'sfz' as const, zones: zones.slice(0, 10), notes: [] };
  assert.equal(fitToSlots(small), small, 'small instruments untouched');
});

// ── WAV facts ────────────────────────────────────────────────────────────────

test('WAV facts: rate, smpl root note and loop (end inclusive → exclusive)', () => {
  const f = wavFacts(makeWav(44100, 100, { root: 57, loop: [10, 89] }))!;
  assert.deepEqual([f.sampleRate, f.rootNote, f.loopStart, f.loopEnd], [44100, 57, 10, 90]);
  assert.deepEqual(wavFacts(makeWav(48000, 10)), { sampleRate: 48000 });
  assert.equal(wavFacts(enc('not a wav at all')), null);
});

// ── Into the song ────────────────────────────────────────────────────────────

/** The shape instrumentFactory.makeInstrumentTrack('kera', …) builds (it needs the WASM host). */
const keraTrack = (id: string, kera: Record<string, unknown>): ArrangeTrack => ({
  id, kind: 'instrument', name: 'KERA', color: '#00DAF3', mute: false, solo: false, gainDb: 0, pan: 0, clips: [],
  instrument: { type: 'kera', patch: {} as never, kera }, armed: true, position: [0, 0, -1],
});

test('an instrument loads onto a pad as a pad-owned KERA track', () => {
  const doc = newGrooveDoc('u1');
  const kera = { v: 1, name: 'Upright', zones: [], samples: [] };
  const id = instrumentOnPad(doc, 2, keraTrack('t1', kera), 'Upright Piano')!;
  const pad = doc.kit[2];
  const track = doc.arrangement.find((t) => t.id === id)!;
  assert.equal(pad.source, 'instrument');
  assert.equal(pad.instrumentTrackId, id);
  assert.equal(pad.instrumentNote, 60);
  assert.equal(pad.name, 'Upright Piano');
  assert.equal(track.instrument?.kera, kera);
  assert.ok(track.padOwned && track.padIndex === 2 && !track.armed);
  // Loading again replaces, never stacks, the pad's instrument.
  const id2 = instrumentOnPad(doc, 2, keraTrack('t2', kera), 'Again')!;
  assert.equal(doc.arrangement.filter((t) => t.padOwned && t.padIndex === 2).length, 1);
  assert.ok(!doc.arrangement.some((t) => t.id === id));
  assert.equal(doc.kit[2].instrumentTrackId, id2);
});

test('an instrument loads as an armed Timeline track, disarming the last one', () => {
  const doc = newGrooveDoc('u1');
  const a = instrumentTrack(doc, keraTrack('a', {}), 'Strings');
  const b = instrumentTrack(doc, keraTrack('b', {}), 'Choir');
  const ta = doc.arrangement.find((t) => t.id === a)!, tb = doc.arrangement.find((t) => t.id === b)!;
  assert.equal(tb.name, 'Choir');
  assert.ok(tb.armed && !ta.armed && !tb.padOwned);
});
