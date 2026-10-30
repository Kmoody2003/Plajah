// Note FX on drawn notes: every device, the arp on clip notes, the scheduler (both play modes), live
// keys, and the proof that a pass plays the same every time. Pure — runs under `tsx --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type ArrangeTrack, type GrooveDoc } from '../services/melos/beats/grooveDoc';
import {
  NOTE_FX, applyNoteFx, newNoteFxDevice, padChain, padPassNotes, resolveChain, trackChain, trackPerformedNotes, trackSourceNotes,
  type FxNote, type NoteFxContext, type NoteFxKind, type ResolvedChain,
} from '../services/melos/beats/noteFx';
import { defaultArpPatch } from '../services/melos/arp';
import { StepScheduler, seededRng } from '../services/melos/beats/engine/scheduler';
import { LiveNoteFx } from '../services/melos/beats/engine/liveNoteFx';

const CTX: NoteFxContext = { key: { tonic: 0, scale: 'major' }, seed: 1234, to: 16 };
const note = (key: number, beat: number, len = 1, vel = 100, src = beat * 10 + key): FxNote => ({ key, vel, beat, len, src });
const run = (kind: NoteFxKind, notes: FxNote[], params: Record<string, number | string> = {}, ctx = CTX): FxNote[] => {
  const d = newNoteFxDevice(kind);
  Object.assign(d.params, params);
  return applyNoteFx(notes, resolveChain({ noteFx: [d] })!, ctx);
};

test('every device in the table has a test below', () => {
  const tested: NoteFxKind[] = ['chord', 'transpose', 'octaver', 'scale', 'gate', 'length', 'strum', 'echo', 'ratchet', 'velocity', 'humanize', 'chance'];
  assert.deepEqual([...NOTE_FX.map((d) => d.kind)].sort(), [...tested].sort());
});

test('chord: one note becomes a chord in the key', () => {
  assert.deepEqual(run('chord', [note(60, 0)]).map((n) => n.key), [60, 64, 67]); // C in C major
  assert.deepEqual(run('chord', [note(62, 0)]).map((n) => n.key), [62, 65, 69]); // Dm
  assert.deepEqual(run('chord', [note(67, 0)], { tones: 4 }).map((n) => n.key), [67, 71, 74, 77]); // G7
});

test('transpose and octaver move and double', () => {
  assert.deepEqual(run('transpose', [note(60, 0)], { semi: 2, oct: 1 }).map((n) => n.key), [74]);
  assert.deepEqual(run('octaver', [note(60, 0)], { up: 1, down: 1 }).map((n) => n.key), [48, 60, 72]);
});

test('scale pulls notes into the key', () => {
  assert.deepEqual(run('scale', [note(61, 0)]).map((n) => n.key), [60]);
  assert.deepEqual(run('scale', [note(61, 0)], { mode: 'up' }).map((n) => n.key), [62]);
});

test('gate chops a drawn note on the song grid and honours its pattern', () => {
  const out = run('gate', [note(60, 0, 1)], { rate: 4, duty: 0.5 });
  assert.deepEqual(out.map((n) => n.beat), [0, 0.25, 0.5, 0.75]);
  assert.ok(out.every((n) => Math.abs(n.len - 0.125) < 1e-9));
  assert.equal(run('gate', [note(60, 0, 1)], { rate: 4, duty: 0.5, pattern: 'x-x-' }).length, 2);
});

test('length: scale, fixed, legato', () => {
  assert.equal(run('length', [note(60, 0, 2)], { mode: 'scale', scale: 0.5 })[0].len, 1);
  assert.equal(run('length', [note(60, 0, 2)], { mode: 'fixed', beats: 0.25 })[0].len, 0.25);
  assert.equal(run('length', [note(60, 0, 0.1), note(62, 1, 0.1)], { mode: 'legato' })[0].len, 1);
});

test('strum rolls a chord and keeps where it ends', () => {
  const out = run('strum', [note(60, 0, 1), note(64, 0, 1), note(67, 0, 1)], { spread: 0.1, dir: 'up' });
  assert.deepEqual(out.map((n) => n.key), [60, 64, 67]);
  assert.deepEqual(out.map((n) => +n.beat.toFixed(3)), [0, 0.1, 0.2]);
  assert.ok(out.every((n) => Math.abs(n.beat + n.len - 1) < 1e-9));
  assert.deepEqual(run('strum', [note(60, 0), note(64, 0)], { spread: 0.1, dir: 'down' }).map((n) => n.key), [64, 60]);
});

test('echo repeats quieter at the delay, and can climb', () => {
  const out = run('echo', [note(60, 0, 0.25)], { repeats: 2, time: 2, decay: 0.5, pitch: 12 });
  assert.deepEqual(out.map((n) => n.beat), [0, 0.5, 1]);
  assert.deepEqual(out.map((n) => n.key), [60, 72, 84]);
  assert.deepEqual(out.map((n) => n.vel), [100, 50, 25]);
});

test('ratchet rolls inside the note; chance decides how often', () => {
  const out = run('ratchet', [note(60, 0, 1)], { hits: 4, chance: 1, taper: 1 });
  assert.deepEqual(out.map((n) => n.beat), [0, 0.25, 0.5, 0.75]);
  assert.equal(run('ratchet', [note(60, 0, 1)], { hits: 4, chance: 0 }).length, 1);
});

test('velocity: scale, offset, fixed, random stays in range', () => {
  assert.equal(run('velocity', [note(60, 0, 1, 100)], { scale: 0.5 })[0].vel, 50);
  assert.equal(run('velocity', [note(60, 0, 1, 100)], { offset: 10 })[0].vel, 110);
  assert.equal(run('velocity', [note(60, 0, 1, 100)], { fixed: 64 })[0].vel, 64);
  const many = run('velocity', Array.from({ length: 64 }, (_, i) => note(60, i / 4, 0.1, 120)), { random: 64 });
  assert.ok(many.every((n) => n.vel >= 1 && n.vel <= 127));
  assert.ok(new Set(many.map((n) => n.vel)).size > 8, 'random spreads');
});

test('humanize drifts, never early, the same every time', () => {
  const src = Array.from({ length: 16 }, (_, i) => note(60, i / 4, 0.2));
  const a = run('humanize', src, { timing: 0.05, vel: 20, len: 0.2 });
  const b = run('humanize', src, { timing: 0.05, vel: 20, len: 0.2 });
  assert.deepEqual(a, b);
  assert.ok(a.some((n, i) => n.beat !== src[i].beat));
  assert.ok(a.every((n, i) => n.beat >= src[i].beat));
});

test('chance plays about that share, the same every time', () => {
  const src = Array.from({ length: 400 }, (_, i) => note(60, i / 4, 0.2));
  const a = run('chance', src, { p: 0.5 });
  assert.ok(a.length > 150 && a.length < 250, String(a.length));
  assert.deepEqual(a, run('chance', src, { p: 0.5 }));
});

// ── the arp on drawn notes ───────────────────────────────────────────────────────────────────

const arpOf = (over: Partial<ReturnType<typeof defaultArpPatch>> = {}) => ({ ...defaultArpPatch(), enabled: true, ...over }) as unknown as Record<string, unknown>;

test('arp: a drawn chord arpeggiates for exactly as long as it was drawn', () => {
  const chain = resolveChain({ arp: arpOf({ rate: 4, gate: 1 }) })!;
  const chord = [note(60, 0, 2), note(64, 0, 2), note(67, 0, 2)];
  const out = applyNoteFx(chord, chain, CTX);
  assert.equal(out.length, 8, 'eight 16ths in two beats');
  assert.deepEqual(out.slice(0, 4).map((n) => n.key), [60, 64, 67, 60]);
  assert.ok(out.every((n) => n.beat < 2));
});

test('arp: the rate is real, a quarter-note arp plays quarters', () => {
  const out = applyNoteFx([note(60, 0, 4), note(64, 0, 4)], resolveChain({ arp: arpOf({ rate: 1 }) })!, CTX);
  assert.deepEqual(out.map((n) => n.beat), [0, 1, 2, 3]);
  const fast = applyNoteFx([note(60, 0, 1)], resolveChain({ arp: arpOf({ rate: 8 }) })!, CTX);
  assert.equal(fast.length, 8);
});

test('arp: a short stab between grid lines still sounds', () => {
  const out = applyNoteFx([note(60, 0.3, 0.05)], resolveChain({ arp: arpOf({ rate: 2 }) })!, CTX);
  assert.ok(out.length >= 1);
  assert.equal(out[0].key, 60);
  assert.ok(out[0].beat >= 0.3);
});

test('arp keeps the drawn velocity: soft notes arpeggiate softly', () => {
  const out = applyNoteFx([note(60, 0, 1, 40)], resolveChain({ arp: arpOf({ rate: 4 }) })!, CTX);
  assert.ok(out.every((n) => n.vel === 40));
});

test('chain order: one note → chord → arp → gate', () => {
  const chain = resolveChain({ arp: arpOf({ rate: 2, gate: 1 }), noteFx: [newNoteFxDevice('gate'), newNoteFxDevice('chord')] })!;
  assert.equal(chain.pitch[0].kind, 'chord');
  assert.equal(chain.rhythm[0].kind, 'gate');
  const out = applyNoteFx([note(60, 0, 2)], chain, CTX);
  assert.ok(new Set(out.map((n) => n.key)).size === 3, 'arp walks the chord the note became');
  assert.ok(out.length > 4, 'gate chops the arp');
});

test('AURA: its own arp block plays through the shared chain', () => {
  const chain = resolveChain({}, { arp: { enabled: true, mode: 'seq', rate: '1/8', gate: 0.5, octaves: 1, steps: [0, 7, 12] } })!;
  assert.equal(chain.arp!.rate, 2);
  const out = applyNoteFx([note(60, 0, 1.5)], chain, CTX);
  assert.deepEqual(out.map((n) => n.key), [60, 67, 72]);
});

test('no chain = no change: a plain track stays on the plain path', () => {
  assert.equal(resolveChain({}), null);
  assert.equal(resolveChain({ arp: arpOf({ enabled: false }) }), null);
  assert.equal(resolveChain({ noteFx: [{ ...newNoteFxDevice('gate'), on: false }] }), null);
});

// ── the scheduler ────────────────────────────────────────────────────────────────────────────

function instrumentDoc(): { doc: GrooveDoc; track: ArrangeTrack } {
  const doc = newGrooveDoc('t');
  const track: ArrangeTrack = {
    id: 'inst', kind: 'instrument', name: 'Keys', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0,
    instrument: { type: 'onda', patch: {} },
    clips: [{ id: 'c', startBeats: 0, lengthBeats: 4, notes: [
      { id: 'a', startBeats: 0, lengthBeats: 2, key: 60, vel: 100 },
      { id: 'b', startBeats: 0, lengthBeats: 2, key: 64, vel: 100 },
    ] }],
  };
  doc.arrangement.unshift(track);
  return { doc, track };
}

function capture(doc: GrooveDoc) {
  const clip: { key: number; when: number; dur: number }[] = [];
  const pad: { pad: number; vel: number; when: number; gate?: number; semi?: number }[] = [];
  const s = new StepScheduler({
    doc: () => doc, toTime: (b) => b / 2, secBetween: (a, b) => (b - a) / 2, rng: seededRng(7),
    trigger: (padIdx, vel, when, gate, semi) => { pad.push({ pad: padIdx, vel, when, gate, semi }); },
    startAudioClip: () => {},
    startInstrumentNote: (_t, n, when, dur) => { clip.push({ key: n.key, when, dur }); },
  });
  return { s, clip, pad };
}

test('song mode: drawn clip notes play through the arp (they used to vanish)', () => {
  const { doc, track } = instrumentDoc();
  track.instrument!.arp = arpOf({ rate: 4, gate: 1 });
  const { s, clip } = capture(doc);
  s.start('song', 0);
  s.scheduleAll(4);
  assert.equal(clip.length, 8);
  assert.deepEqual(clip.slice(0, 2).map((n) => n.key), [60, 64]);
});

test('song mode: every device reaches the instrument, gate shown here', () => {
  const { doc, track } = instrumentDoc();
  track.instrument!.noteFx = [newNoteFxDevice('gate')];
  const { s, clip } = capture(doc);
  s.start('song', 0);
  s.scheduleAll(4);
  assert.equal(clip.length, 16, 'two notes × eight gate cells');
  assert.ok(clip.every((n) => n.dur < 0.1));
});

test('song mode: without a chain the notes are untouched', () => {
  const { doc } = instrumentDoc();
  const { s, clip } = capture(doc);
  s.start('song', 0);
  s.scheduleAll(4);
  assert.deepEqual(clip.map((n) => n.key), [60, 64]);
});

function padDoc(): GrooveDoc {
  const doc = newGrooveDoc('p');
  const track: ArrangeTrack = { id: 'padinst', kind: 'instrument', name: 'Pad', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0, padOwned: true, clips: [], instrument: { type: 'onda', patch: {} } };
  doc.arrangement.unshift(track);
  doc.kit[0] = { ...doc.kit[0], source: 'instrument', instrumentTrackId: 'padinst', instrumentNote: 60, pitchSemis: 0, empty: false };
  const pat = doc.patterns[0];
  pat.length = 16;
  pat.steps = {};
  pat.melo = { 0: { 0: [{ semi: 0, v: 100, len: 8 }, { semi: 4, v: 100, len: 8 }] } };
  return doc;
}

test('pattern mode: pitch-roll notes run the chain on an instrument pad', () => {
  const doc = padDoc();
  doc.arrangement[0].instrument!.arp = arpOf({ rate: 4, gate: 1 });
  const { s, pad } = capture(doc);
  s.start('pattern', 0, doc.patterns[0].id);
  s.scheduleAll(4);
  assert.equal(pad.length, 8, 'eight 16ths under the two-beat chord');
  assert.deepEqual(pad.slice(0, 3).map((h) => h.semi), [0, 4, 0]);
});

test('pattern mode: step-sequencer hits run the chain too', () => {
  const doc = padDoc();
  doc.patterns[0].melo = {};
  doc.patterns[0].steps = { 0: { 0: { v: 110 }, 8: { v: 110 } } };
  doc.arrangement[0].instrument!.noteFx = [newNoteFxDevice('chord')];
  const { s, pad } = capture(doc);
  s.start('pattern', 0, doc.patterns[0].id);
  s.scheduleAll(4);
  assert.equal(pad.length, 6, 'two steps × a triad');
  assert.deepEqual(pad.slice(0, 3).map((h) => h.semi), [0, 4, 7]);
});

test('pattern mode: a one-shot pad carries its own chain', () => {
  const doc = newGrooveDoc('s');
  const pat = doc.patterns[0];
  pat.length = 16;
  pat.steps = { 2: { 0: { v: 100 } } };
  pat.melo = {};
  doc.kit[2] = { ...doc.kit[2], source: 'sample', empty: false, noteFx: [{ ...newNoteFxDevice('ratchet'), params: { hits: 4, chance: 1, taper: 1 } }] };
  assert.ok(padChain(doc, 2));
  const { s, pad } = capture(doc);
  s.start('pattern', 0, pat.id);
  s.scheduleAll(4);
  assert.equal(pad.length, 4);
  assert.ok(pad.every((h) => h.pad === 2));
});

test('pattern mode: an arp keeps running across the loop point', () => {
  const doc = padDoc();
  doc.patterns[0].melo = { 0: { 12: [{ semi: 0, v: 100, len: 8 }] } }; // hangs over the end of the loop
  doc.arrangement[0].instrument!.arp = arpOf({ rate: 4, gate: 1 });
  const chain = padChain(doc, 0)!;
  const second = padPassNotes(doc, doc.patterns[0], 0, chain, 16, 1, () => 0);
  assert.ok(second.some((n) => n.beat === 4), 'the note that started last pass still sounds on the downbeat');
});

test('a pass reads the same twice; the next pass may differ (chance)', () => {
  const doc = padDoc();
  doc.patterns[0].melo = { 0: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, [{ semi: 0, v: 100, len: 1 }]])) };
  doc.arrangement[0].instrument!.noteFx = [newNoteFxDevice('chance')];
  const chain = padChain(doc, 0)!;
  const read = (pass: number) => padPassNotes(doc, doc.patterns[0], 0, chain, 16, pass, () => 0).map((n) => n.beat % 4);
  assert.deepEqual(read(0), read(0));
  assert.notDeepEqual(read(0), read(1));
});

test('offline and live read the same list: trackPerformedNotes is what the bounce prints', () => {
  const { doc, track } = instrumentDoc();
  track.instrument!.arp = arpOf({ rate: 4 });
  track.instrument!.noteFx = [newNoteFxDevice('humanize'), newNoteFxDevice('chance')];
  doc.updatedAt = 1;
  const a = trackPerformedNotes(doc, track, trackChain(track)!);
  doc.updatedAt = 2;
  const b = trackPerformedNotes(doc, track, trackChain(track)!);
  assert.deepEqual(a.map((n) => [n.key, n.beat, n.vel]), b.map((n) => [n.key, n.beat, n.vel]));
  const { s, clip } = capture(doc);
  s.start('song', 0);
  s.scheduleAll(4);
  assert.deepEqual(clip.map((n) => n.key), b.map((n) => n.key));
});

test('clip windows and loops feed the chain the same way the plain path reads them', () => {
  const { track } = instrumentDoc();
  track.clips[0].loop = { startBeats: 0, lengthBeats: 1 };
  track.clips[0].lengthBeats = 3;
  assert.equal(trackSourceNotes(track).length, 6, 'three passes of two notes');
});

// ── live keys ────────────────────────────────────────────────────────────────────────────────

function liveRig(chain: ResolvedChain) {
  let now = 10;
  const played: { key: number; when: number; dur: number | null }[] = [];
  const stopped: number[] = [];
  let running = false;
  const fx = new LiveNoteFx({
    now: () => now, running: () => running, beatAt: (t) => t * 2, timeAt: (b) => b / 2, bpm: () => 120, songKey: () => ({ tonic: 0, scale: 'major' }),
    play: (_c, n, when, dur) => { played.push({ key: n.key, when, dur }); return dur === null ? () => stopped.push(n.key) : undefined; },
  });
  return { fx, played, stopped, chain, advance(s: number) { for (let t = 0; t < s; t += 0.02) { now += 0.02; fx.tick(); } }, setRunning(r: boolean) { running = r; } };
}

test('live: a held key under an arp plays with the transport stopped', () => {
  const chain = resolveChain({ arp: arpOf({ rate: 4, gate: 0.5 }) })!;
  const r = liveRig(chain);
  r.fx.noteOn('t', chain, 60, 100, 1);
  r.fx.noteOn('t', chain, 64, 100, 1);
  r.advance(1); // 1 s at 120 bpm = 2 beats = 8 sixteenths
  assert.ok(r.played.length >= 7 && r.played.length <= 10, String(r.played.length));
  assert.deepEqual([...new Set(r.played.map((p) => p.key))].sort(), [60, 64]);
  r.fx.noteOff('t', 60);
  r.fx.noteOff('t', 64);
  const n = r.played.length;
  r.advance(0.5);
  assert.ok(r.played.length <= n + 1, 'stops on release');
});

test('live: a chord device fires once, holds, and lets go with the key', () => {
  const chain = resolveChain({ noteFx: [newNoteFxDevice('chord')] })!;
  const r = liveRig(chain);
  r.fx.noteOn('t', chain, 60, 100, 1);
  assert.deepEqual(r.played.map((p) => p.key), [60, 64, 67]);
  assert.ok(r.played.every((p) => p.dur === null));
  r.advance(1);
  assert.equal(r.played.length, 3, 'no retrigger while held');
  r.fx.noteOff('t', 60);
  assert.deepEqual(r.stopped.sort(), [60, 64, 67]);
});

test('live: latch keeps an arp going until a new chord', () => {
  const chain = resolveChain({ arp: arpOf({ rate: 4, latch: true }) })!;
  const r = liveRig(chain);
  r.fx.noteOn('t', chain, 60, 100, 1);
  r.fx.noteOff('t', 60);
  const n = r.played.length;
  r.advance(0.5);
  assert.ok(r.played.length > n, 'keeps playing after release');
  r.fx.noteOn('t', chain, 72, 100, 1);
  const before = r.played.length;
  r.advance(0.5);
  assert.ok(r.played.slice(before).every((p) => p.key === 72), 'the new note replaces the latched one');
});

test('live: a long hold stays cheap and keeps playing', () => {
  const chain = resolveChain({ arp: arpOf({ rate: 4 }) })!;
  const r = liveRig(chain);
  r.fx.noteOn('t', chain, 60, 100, 1);
  r.advance(60); // two minutes of beats
  assert.ok(r.played.length > 400);
  r.fx.clear();
  assert.equal(r.fx.active(), false);
});
