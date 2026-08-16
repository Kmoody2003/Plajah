// KERA parser + zone verification. Pure functions, headless:
//   npx tsx --test tests/melosKera.test.ts
//
// The SF2 test builds a minimal-but-valid SoundFont in memory rather than shipping a binary
// fixture — binary parsing is exactly where subtle bugs hide, so the bytes are constructed
// explicitly and read back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSfz, parseNote } from '../services/melos/instruments/kera/sfz';
import { parseSf2 } from '../services/melos/instruments/kera/sf2';
import { emptyProgram, selectZones, playbackRate, type KeraProgram, type KeraZone } from '../services/melos/instruments/kera/zones';

// ── SFZ ──────────────────────────────────────────────────────────────────────

test('SFZ note names parse against middle-C = 60', () => {
  assert.equal(parseNote('c4'), 60);
  assert.equal(parseNote('a4'), 69);
  assert.equal(parseNote('c#4'), 61);
  assert.equal(parseNote('db4'), 61);
  assert.equal(parseNote('c-1'), 0);
  assert.equal(parseNote('60'), 60);
});

test('SFZ region cascade: global and group opcodes flow into regions', () => {
  const sfz = `
    <global> ampeg_release=0.5 volume=-3
    <group> lokey=48 hikey=59
    <region> sample=low.wav pitch_keycenter=53
    <region> sample=low2.wav pitch_keycenter=55
    <group> lokey=60 hikey=71
    <region> sample=high.wav pitch_keycenter=65
  `;
  const r = parseSfz(sfz);
  assert.equal(r.regions.length, 3);
  assert.equal(r.regions[0].loKey, 48);
  assert.equal(r.regions[0].hiKey, 59, 'first two regions inherit the first group range');
  assert.equal(r.regions[2].loKey, 60, 'third region takes the second group range');
  assert.equal(r.regions[0].rootNote, 53);
  assert.equal(r.amp.release, 0.5, 'amp env comes from global');
  assert.deepEqual(r.samplePaths.sort(), ['high.wav', 'low.wav', 'low2.wav']);
});

test('SFZ key= sets range and root together', () => {
  const r = parseSfz('<region> sample=kick.wav key=36');
  assert.equal(r.regions[0].loKey, 36);
  assert.equal(r.regions[0].hiKey, 36);
  assert.equal(r.regions[0].rootNote, 36);
});

test('SFZ default_path prefixes every sample', () => {
  const r = parseSfz('<control> default_path=samples/ \n <region> sample=a.wav key=60');
  assert.equal(r.regions[0].samplePath, 'samples/a.wav');
  assert.deepEqual(r.samplePaths, ['samples/a.wav']);
});

test('SFZ round-robins become a cycling group', () => {
  const r = parseSfz(`
    <region> sample=rr1.wav key=38 seq_length=3 seq_position=1
    <region> sample=rr2.wav key=38 seq_length=3 seq_position=2
    <region> sample=rr3.wav key=38 seq_length=3 seq_position=3
  `);
  assert.equal(r.regions.length, 3);
  const g = r.regions[0].rrGroup;
  assert.ok(g > 0, 'seq_length assigns a round-robin group');
  assert.ok(r.regions.every((x) => x.rrGroup === g), 'same key range shares the group');
  assert.deepEqual(r.regions.map((x) => x.rrIndex), [0, 1, 2]);
});

test('SFZ tune, pan and volume map correctly', () => {
  const r = parseSfz('<region> sample=a.wav key=60 tune=-25 pan=50 volume=-6 transpose=12');
  assert.equal(r.regions[0].tuneCents, -25);
  assert.equal(r.regions[0].pan, 0.5, 'SFZ pan -100..100 maps to -1..1');
  assert.equal(r.regions[0].gainDb, -6);
  assert.equal(r.regions[0].tuneSemis, 12);
});

test('SFZ reports opcodes it does not model, rather than swallowing them', () => {
  const r = parseSfz('<region> sample=a.wav key=60 fil_type=lpf_2p cutoff=800 amp_veltrack=100');
  assert.ok(r.ignoredOpcodes.includes('cutoff'));
  assert.ok(r.ignoredOpcodes.includes('fil_type'));
});

test('SFZ comments are stripped', () => {
  const r = parseSfz('// a comment\n<region> sample=a.wav key=60 // trailing\n');
  assert.equal(r.regions.length, 1);
  assert.equal(r.regions[0].samplePath, 'a.wav');
});

// ── Zone selection ───────────────────────────────────────────────────────────

function zone(over: Partial<KeraZone> = {}): KeraZone {
  return { sampleId: 's', loKey: 0, hiKey: 127, loVel: 1, hiVel: 127, rrGroup: 0, rrIndex: 0,
    tuneSemis: 0, tuneCents: 0, gainDb: 0, pan: 0, offGroup: 0, ...over };
}

test('selectZones picks by key and velocity range', () => {
  const p: KeraProgram = { ...emptyProgram(), zones: [
    zone({ sampleId: 'lo', loKey: 0, hiKey: 59 }),
    zone({ sampleId: 'hi', loKey: 60, hiKey: 127 }),
  ] };
  assert.equal(selectZones(p, 48, 100, new Map())[0].sampleId, 'lo');
  assert.equal(selectZones(p, 72, 100, new Map())[0].sampleId, 'hi');
  assert.equal(selectZones(p, 200, 100, new Map()).length, 0, 'out of range = nothing');
});

test('velocity layers both fire when they overlap', () => {
  const p: KeraProgram = { ...emptyProgram(), zones: [
    zone({ sampleId: 'soft', loVel: 1, hiVel: 63 }),
    zone({ sampleId: 'hard', loVel: 64, hiVel: 127 }),
  ] };
  assert.equal(selectZones(p, 60, 30, new Map())[0].sampleId, 'soft');
  assert.equal(selectZones(p, 60, 100, new Map())[0].sampleId, 'hard');
});

test('round-robin cycles across consecutive notes and repeats', () => {
  const p: KeraProgram = { ...emptyProgram(), zones: [
    zone({ sampleId: 'rr0', rrGroup: 5, rrIndex: 0 }),
    zone({ sampleId: 'rr1', rrGroup: 5, rrIndex: 1 }),
    zone({ sampleId: 'rr2', rrGroup: 5, rrIndex: 2 }),
  ] };
  const rr = new Map<number, number>();
  const seq = [0, 1, 2, 3, 4].map(() => selectZones(p, 60, 100, rr)[0].sampleId);
  assert.deepEqual(seq, ['rr0', 'rr1', 'rr2', 'rr0', 'rr1'], 'cycles and wraps');
});

test('playbackRate resamples by pitch distance from the root', () => {
  const sample = { id: 's', name: 's', channels: [new Float32Array(0)], sampleRate: 44100,
    rootNote: 60, fineTune: 0, loopStart: 0, loopEnd: 0, loopMode: 'off' as const };
  assert.equal(playbackRate(sample, zone(), 60, 0), 1, 'the root plays at unity');
  assert.ok(Math.abs(playbackRate(sample, zone(), 72, 0) - 2) < 1e-6, 'an octave up doubles the rate');
  assert.ok(Math.abs(playbackRate(sample, zone(), 48, 0) - 0.5) < 1e-6, 'an octave down halves it');
});

// ── SF2 (synthetic binary) ──────────────────────────────────────────────────

/** Build a minimal valid SF2 with one preset → one instrument → one zone → one sample. */
function buildMinimalSf2(): Uint8Array {
  // A tiny sample: 8 frames of PCM.
  const sampleFrames = 8;
  const parts: { id: string; body: Uint8Array }[] = [];
  const str20 = (s: string) => { const b = new Uint8Array(20); for (let i = 0; i < s.length && i < 19; i++) b[i] = s.charCodeAt(i); return b; };
  const u16 = (n: number) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
  const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  const i16 = (n: number) => { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, n, true); return b; };
  const cat = (...arrs: Uint8Array[]) => { const t = new Uint8Array(arrs.reduce((a, x) => a + x.length, 0)); let o = 0; for (const a of arrs) { t.set(a, o); o += a.length; } return t; };

  // sdta/smpl: 8 int16 frames.
  const smplData = new Uint8Array(sampleFrames * 2);
  for (let i = 0; i < sampleFrames; i++) new DataView(smplData.buffer).setInt16(i * 2, i * 1000, true);

  // phdr: one real preset + terminal.
  const phdr = cat(
    str20('Piano'), u16(0), u16(0), u16(0), u32(0), u32(0), u32(0),
    str20('EOP'), u16(0), u16(0), u16(1), u32(0), u32(0), u32(0),
  );
  // pbag: preset zone 0 (gen 0), terminal (gen 1).
  const pbag = cat(u16(0), u16(0), u16(1), u16(0));
  // pgen: instrument=0 (op 41), terminal.
  const pgen = cat(u16(41), u16(0), u16(0), u16(0));
  // inst: one real + terminal.
  const inst = cat(str20('PianoInst'), u16(0), str20('EOI'), u16(2));
  // ibag: instrument zone 0 (gen 0), terminal (gen 4).
  const ibag = cat(u16(0), u16(0), u16(4), u16(0));
  // igen: keyRange 48-72 (op 43), velRange 1-127 (op 44), rootKey 60 (op 58), sampleID 0 (op 53), terminal.
  const igen = cat(
    u16(43), u8pair(48, 72),
    u16(44), u8pair(1, 127),
    u16(58), i16(60),
    u16(53), u16(0),
    u16(0), u16(0),
  );
  // shdr: one sample header + terminal.
  const shdr = cat(
    str20('PianoC'), u32(0), u32(sampleFrames), u32(2), u32(sampleFrames - 1),
    u32(44100), new Uint8Array([60]), new Uint8Array([0]), u16(0), u16(1),
    str20('EOS'), u32(0), u32(0), u32(0), u32(0), u32(0), new Uint8Array([0]), new Uint8Array([0]), u16(0), u16(0),
  );

  parts.push({ id: 'phdr', body: phdr }, { id: 'pbag', body: pbag }, { id: 'pgen', body: pgen },
    { id: 'inst', body: inst }, { id: 'ibag', body: ibag }, { id: 'igen', body: igen }, { id: 'shdr', body: shdr });

  const listChunk = (type: string, chunks: { id: string; body: Uint8Array }[]) => {
    const inner = cat(...chunks.map((c) => cat(ascii(c.id), u32(c.body.length), c.body, c.body.length & 1 ? new Uint8Array(1) : new Uint8Array(0))));
    return cat(ascii('LIST'), u32(inner.length + 4), ascii(type), inner);
  };
  const sdta = listChunk('sdta', [{ id: 'smpl', body: smplData }]);
  const pdta = listChunk('pdta', parts);
  const body = cat(ascii('sfbk'), sdta, pdta);
  return cat(ascii('RIFF'), u32(body.length), body);

  function ascii(s: string) { const b = new Uint8Array(4); for (let i = 0; i < 4; i++) b[i] = s.charCodeAt(i); return b; }
  function u8pair(a: number, b: number) { return new Uint8Array([a, b]); }
}

test('SF2: a synthetic SoundFont parses to a playable program', () => {
  const bytes = buildMinimalSf2();
  const sf = parseSf2(bytes);
  assert.ok(sf, 'the file parses');
  assert.equal(sf!.presets.length, 1);
  assert.equal(sf!.presets[0].name, 'Piano');

  const prog = sf!.load(0);
  assert.ok(prog, 'the preset loads');
  assert.equal(prog!.source, 'sf2');
  assert.equal(prog!.samples.length, 1);
  assert.equal(prog!.samples[0].name, 'PianoC');
  assert.equal(prog!.samples[0].channels[0].length, 8, 'all 8 PCM frames decoded');
  assert.equal(prog!.zones.length, 1);
  assert.equal(prog!.zones[0].loKey, 48);
  assert.equal(prog!.zones[0].hiKey, 72);
  assert.equal(prog!.samples[0].rootNote, 60);

  // And it selects correctly.
  const z = selectZones(prog!, 60, 100, new Map());
  assert.equal(z.length, 1, 'a note in range picks the zone');
  assert.equal(selectZones(prog!, 80, 100, new Map()).length, 0, 'out of range picks nothing');
});

test('SF2: a non-SoundFont byte blob is rejected, not mis-parsed', () => {
  assert.equal(parseSf2(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
  assert.equal(parseSf2(new TextEncoder().encode('RIFFxxxxWAVEfmt ')), null, 'a WAV is not an sfbk');
});
