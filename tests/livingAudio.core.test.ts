// Living Books audio: pure-logic tests (notation, scales, chords, arps, score expansion + seeded variation, scheduler with a fake clock,
// voice stealing, depth mapping, estimated word timing, narration with fake speech, catalogue integrity, the mock). No AudioContext needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Score } from '../services/living/contracts';
import {
  CHORDS, SCALES, arpeggiate, bassline, chord, concat, degree, diatonicChord, drums, makeScore, merge, midiToName, noteToMidi, parseAbc, parseNotation,
  progression, repeat, scale, shift, swing, track, transpose,
} from '../services/living/audio/compose';
import { DEMO_SCORES } from '../services/living/audio/demoScores';
import { Sequencer, RunCursor, expandPass, expandScore, type ScoreEvent } from '../services/living/audio/sequencer';
import { VoicePool } from '../services/living/audio/voices';
import { depthParams, duckGain, limiterCurve } from '../services/living/audio/graph';
import {
  Narrator, chunkText, countSyllables, estimateWordTimings, pauseAfterMs, pickVoice, splitWords, wordIndexAt, wordIndexForChar, wordStarts,
  timingsForTake, TapTimer, createAriaClient,
} from '../services/living/audio/narration';
import { SFX_BY_ID, SFX_CATALOG, SFX_IDS, resolveSfx } from '../services/living/audio/sfxCatalog';
import { INSTRUMENTS, noteForInstrument, resolveInstrument, resolveDrumPiece } from '../services/living/audio/instruments';
import { AMBIENCE_BEDS, resolveBed } from '../services/living/audio/ambience';
import { createMockAudio } from '../services/living/audio/mock';
import { analyse, encodeWav16, fft, spectralCentroid } from '../services/living/audio/analysis';
import { hash32, mulberry32 } from '../services/living/audio/dsp';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

// ───────────── notation ─────────────
test('note names <-> MIDI', () => {
  assert.equal(noteToMidi('C4'), 60); assert.equal(noteToMidi('A4'), 69); assert.equal(noteToMidi('F#3'), 54); assert.equal(noteToMidi('Bb3'), 58);
  assert.equal(noteToMidi('c4'), 60); assert.equal(noteToMidi(72), 72); assert.equal(noteToMidi('64'), 64);
  assert.equal(noteToMidi('x'), null); assert.equal(noteToMidi('banana'), null); assert.equal(noteToMidi(undefined), null);
  assert.equal(midiToName(60), 'C4'); assert.equal(midiToName(61), 'C#4'); assert.equal(midiToName(59), 'B3');
});

test('parseNotation: durations, sticky length, bars, chords, rests', () => {
  const p = parseNotation('C4:1 E4:.5 G4:.5 | rest:1 [C4,E4,G4]:2');
  assert.deepEqual(p.notes.map((n) => [n.n, n.t, n.d]), [['C4', 0, 1], ['E4', 1, 0.5], ['G4', 1.5, 0.5], ['C4', 3, 2], ['E4', 3, 2], ['G4', 3, 2]]);
  assert.equal(p.lengthBeats, 5);
  assert.deepEqual(p.bars, [2]);
  const sticky = parseNotation('C4:2 D4 E4');
  assert.deepEqual(sticky.notes.map((n) => [n.t, n.d]), [[0, 2], [2, 2], [4, 2]]);
});

test('parseNotation: velocity, repeat, ties, MIDI numbers, unpitched, start offset', () => {
  const p = parseNotation('C4:1@0.5 x:.25*4 60:1 G4:1~ G4:1', { startBeat: 10 });
  assert.equal(p.notes[0].v, 0.5);
  const hits = p.notes.filter((n) => n.n === 'x'); assert.equal(hits.length, 4); assert.deepEqual(hits.map((h) => h.t), [11, 11.25, 11.5, 11.75]);
  assert.ok(p.notes.some((n) => n.n === 60));
  const g = p.notes.filter((n) => n.n === 'G4'); assert.equal(g.length, 1); assert.equal(g[0].d, 2);       // tied into one note
  assert.equal(p.notes[0].t, 10);
  assert.throws(() => parseNotation('C4:1 banana:1'));
  assert.deepEqual(parseNotation('C4+E4+G4:1').notes.map((n) => n.n), ['C4', 'E4', 'G4']);
});

test('parseAbc: octave marks, accidentals, lengths, chords, rests', () => {
  const p = parseAbc("C D E F | G2 A2 | [CEG]4 z c c' ^F _B,", { unit: 0.5 });
  assert.deepEqual(p.notes.slice(0, 4).map((n) => n.n), ['C4', 'D4', 'E4', 'F4']);
  const g = p.notes.find((n) => n.n === 'G4')!; assert.equal(g.d, 1); assert.equal(g.t, 2);
  assert.equal(p.notes.filter((n) => n.t === 4).length, 3);                    // the chord: 3 notes at t=4
  assert.ok(p.notes.some((n) => n.n === 'C5')); assert.ok(p.notes.some((n) => n.n === 'C6')); assert.ok(p.notes.some((n) => n.n === 'F#4')); assert.ok(p.notes.some((n) => n.n === 'Bb3'));
  assert.deepEqual(p.bars, [2, 4]);
});

// ───────────── scales, chords, arps, patterns ─────────────
test('scales and degrees', () => {
  assert.deepEqual(scale('C4', 'major'), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.deepEqual(scale('C4', 'pentatonic'), [60, 62, 64, 67, 69, 72]);
  assert.deepEqual(scale('D4', 'dorian').slice(0, 7), [62, 64, 65, 67, 69, 71, 72]);
  assert.deepEqual(scale('F4', 'lydian').slice(0, 7), [65, 67, 69, 71, 72, 74, 76]);
  assert.deepEqual(scale('A3', 'minor').slice(0, 3), [57, 59, 60]);
  assert.equal(scale('C4', 'major', 2).length, 15);
  assert.equal(degree('C4', 'major', 0), 60); assert.equal(degree('C4', 'major', 7), 72); assert.equal(degree('C4', 'major', -1), 59); assert.equal(degree('C4', 'pentatonic', 5), 72);
  assert.throws(() => scale('C4', 'nope'));
  for (const s of Object.values(SCALES)) assert.equal(s[0], 0);
});

test('chords: qualities, inversions, diatonic, progression', () => {
  assert.deepEqual(chord('C4', 'maj'), [60, 64, 67]); assert.deepEqual(chord('A3', 'min7'), [57, 60, 64, 67]);
  assert.deepEqual(chord('C4', 'maj', 1), [64, 67, 72]); assert.deepEqual(chord('C4', 'maj', 2), [67, 72, 76]);
  assert.deepEqual(diatonicChord('C4', 'major', 1), [62, 65, 69]);             // D minor
  assert.deepEqual(progression('C3', 'major', [0, 3, 4]).map((c) => c[0]), [48, 53, 55]);
  for (const q of Object.keys(CHORDS)) assert.ok(chord('C4', q).length >= 3);
});

test('arpeggiator patterns + seeded random', () => {
  const c = chord('C4', 'maj');
  assert.deepEqual(arpeggiate(c, { pattern: 'up', count: 6 }).map((n) => n.n), [60, 64, 67, 60, 64, 67]);
  assert.deepEqual(arpeggiate(c, { pattern: 'down', count: 3 }).map((n) => n.n), [67, 64, 60]);
  assert.deepEqual(arpeggiate(c, { pattern: 'updown', count: 6 }).map((n) => n.n), [60, 64, 67, 64, 60, 64]);
  const a = arpeggiate(c, { pattern: 'random', count: 12, seed: 5 }).map((n) => n.n), b = arpeggiate(c, { pattern: 'random', count: 12, seed: 5 }).map((n) => n.n);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, arpeggiate(c, { pattern: 'random', count: 12, seed: 6 }).map((n) => n.n));
  const timed = arpeggiate(c, { step: 0.25, count: 4, t0: 2 }); assert.deepEqual(timed.map((n) => n.t), [2, 2.25, 2.5, 2.75]);
  assert.equal(arpeggiate(c, { octaves: 2, count: 6 })[3].n, 72);
});

test('bassline + drum patterns', () => {
  const b = bassline(['C2', 'F2'], 'root-fifth', { beatsPerBar: 4 });
  assert.deepEqual(b.map((n) => [n.t, n.n]), [[0, 36], [2, 43], [4, 41], [6, 48]]);
  assert.equal(bassline(['C2'], 'oompah').length, 4); assert.equal(bassline(['C2', 'G2'], 'walking').length, 8);
  const d = drums({ kick: 'x...x...', snare: '....X...', hat: 'x.x.x.x.' }, { stepBeats: 0.5, bars: 2 });
  assert.deepEqual(d.filter((n) => n.n === 36).map((n) => n.t), [0, 2, 4, 6]);
  assert.deepEqual(d.filter((n) => n.n === 38).map((n) => [n.t, n.v]), [[2, 1], [6, 1]]);
  assert.equal(d.filter((n) => n.n === 42).length, 8);
  for (let i = 1; i < d.length; i++) assert.ok(d[i].t >= d[i - 1].t);
});

test('transpose / shift / repeat / concat / merge / swing', () => {
  const n = parseNotation('C4:1 x:1 D4:1').notes;
  assert.deepEqual(transpose(n, 2).map((x) => x.n), [62, 'x', 64]);
  assert.deepEqual(shift(n, 4).map((x) => x.t), [4, 5, 6]);
  assert.equal(repeat(n, 3, 3).length, 9); assert.equal(repeat(n, 3, 3)[8].t, 8);
  const c = concat({ notes: n, lengthBeats: 3 }, { notes: n, lengthBeats: 3 }); assert.equal(c.lengthBeats, 6); assert.equal(c.notes[3].t, 3);
  assert.deepEqual(merge(shift(n, 1), n).map((x) => x.t), [0, 1, 1, 2, 2, 3]);
  const sw = swing(parseNotation('C4:.5*4').notes, 0.5); assert.deepEqual(sw.map((x) => x.t), [0, 0.75, 1, 1.75]);
});

test('demo scores are valid and use real instruments', () => {
  assert.deepEqual(Object.keys(DEMO_SCORES).sort(), ['city', 'folk', 'lullaby']);
  for (const [id, s] of Object.entries(DEMO_SCORES)) {
    assert.equal(s.id, id); assert.ok(s.tempo > 40 && s.tempo < 200); assert.ok(s.lengthBeats > 0); assert.ok(s.tracks.length >= 3);
    for (const t of s.tracks) {
      assert.ok(resolveInstrument(t.instrument), `${id}: unknown instrument ${t.instrument}`);
      assert.ok(t.notes.length > 0);
      for (const n of t.notes) {
        assert.ok(n.t >= 0 && n.t < s.lengthBeats + 1e-9, `${id}/${t.instrument}: note starts at ${n.t} outside 0..${s.lengthBeats}`);
        assert.ok(n.d > 0 && n.t + n.d <= s.lengthBeats + 2, `${id}/${t.instrument}: note at ${n.t} runs more than 2 beats past the loop end`);   // ringing over the seam is fine
        assert.ok(typeof n.n === 'number' || n.n === 'x' || noteToMidi(n.n) != null);
      }
    }
  }
});

// ───────────── score expansion + seeded variation ─────────────
function simpleScore(over: Partial<Score> = {}): Score {
  return makeScore({ id: 't', tempo: 120, lengthBeats: 4, tracks: [track('pluck', parseNotation('C4:1 D4:1 E4:1 F4:1').notes)], ...over });
}

test('seeded variation is deterministic, bounded, and seed-dependent', () => {
  const s = simpleScore({ variation: { seed: 9, humanizeMs: 30, dropout: 0.3 } });
  const a = expandPass(s, 0), b = expandPass(s, 0);
  assert.deepEqual(a, b);
  for (const e of a) assert.ok(Math.abs(e.jitterSec) <= 0.03 + 1e-9);
  const many = simpleScore({ tracks: [track('pluck', parseNotation('C4:.1*200').notes)], lengthBeats: 20, variation: { seed: 1, dropout: 0.5 } });
  const kept = expandPass(many, 0).length; assert.ok(kept > 70 && kept < 130, `kept ${kept}`);
  assert.notDeepEqual(expandPass(many, 0).map((e) => e.beat), expandPass({ ...many, variation: { seed: 2, dropout: 0.5 } }, 0).map((e) => e.beat));
  assert.notDeepEqual(expandPass(many, 0).map((e) => e.beat), expandPass(many, 1).map((e) => e.beat - 20));       // each pass varies differently
  const none = expandPass(simpleScore(), 0); assert.equal(none.length, 4); assert.ok(none.every((e) => e.jitterSec === 0));
});

test('loop:false tracks play only in the first pass', () => {
  const s = simpleScore({ tracks: [track('pluck', parseNotation('C4:1').notes, { loop: false }), track('bass', parseNotation('C2:4').notes)] });
  assert.equal(expandPass(s, 0).length, 2); assert.equal(expandPass(s, 1).length, 1);
  const only = simpleScore({ tracks: [track('pluck', parseNotation('C4:1').notes, { loop: false })] });
  const cur = new RunCursor(only, 0, { scaleAt: () => 1 }); cur.pull(100); assert.equal(cur.finished, true);
});

test('expandScore: event times follow tempo, loop, and the tempo scale', () => {
  const s = simpleScore();
  const ev = expandScore(s, 4.1);
  assert.deepEqual(ev.map((e) => Math.round(e.time * 1000) / 1000), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);       // 120 bpm = 0.5 s/beat, looped
  assert.equal(ev[0].durSec, 0.5);
  const slow = expandScore(s, 4.1, { tempoScale: 0.5 }); assert.equal(slow.length, 5); near(slow[1].time, 1);
  const ramp = expandScore(s, 20, { tempo: { scaleAt: (t) => 1 - 0.5 * Math.min(1, t / 4) } });
  const gaps = ramp.slice(1).map((e, i) => e.time - ramp[i].time);
  for (let i = 1; i < 8; i++) assert.ok(gaps[i] >= gaps[i - 1] - 1e-9, 'gaps must not shrink while the tempo ramps down');
  assert.ok(gaps[7] > gaps[0] * 1.5);
  const offset = expandScore(s, 2, { startTime: 10 }); assert.equal(offset.length, 0);
});

// ───────────── scheduler with a fake clock ─────────────
function makeSeq(over: Partial<Score> = {}) {
  let now = 0;
  const events: ScoreEvent[] = []; const log: string[] = [];
  const seq = new Sequencer({
    now: () => now,
    emit: (e) => events.push(e),
    onStart: (r, f) => log.push(`start:${r.scoreId}:${f}`), onStop: (r, f) => log.push(`stop:${r.scoreId}:${f}`), onEnd: (r) => log.push(`end:${r.scoreId}`),
    timer: { set: () => 1, clear: () => {} },
  }, { lookaheadSec: 0.3 });
  seq.register({ a: simpleScore({ id: 'a', ...over }), b: simpleScore({ id: 'b', tempo: 60 }) });
  return { seq, events, log, advance(to: number) { now = to; seq.tick(); }, get now() { return now; } };
}

test('scheduler only schedules inside the lookahead window, at the right times', () => {
  const h = makeSeq();
  h.seq.play('a', { fadeMs: 0 });
  assert.equal(h.events.length, 1); near(h.events[0].time, 0.06);                  // first beat only: next is at 0.56 > 0.3 lookahead
  h.advance(0.3); assert.equal(h.events.length, 2); near(h.events[1].time, 0.56);
  for (let t = 0.6; t < 2.4; t += 0.1) h.advance(t);
  const times = h.events.map((e) => e.time);
  for (let i = 1; i < times.length; i++) near(times[i] - times[i - 1], 0.5, 1e-6);   // steady 120 bpm across the loop boundary (pass 0 -> 1)
  assert.ok(h.events.some((e) => e.pass === 1));
  for (const e of h.events) assert.ok(e.time >= 0);
});

test('same cue twice does not restart; unknown cue is ignored', () => {
  const h = makeSeq(); h.seq.play('a'); const n = h.events.length;
  assert.equal(h.seq.play('a'), null); assert.equal(h.seq.play('nope'), null); assert.equal(h.events.length, n); assert.equal(h.seq.activeRuns.length, 1);
});

test('crossfade: new cue fades in while the old fades out, then the old run ends', () => {
  const h = makeSeq();
  h.seq.play('a', { fadeMs: 0 }); h.advance(1);
  h.seq.play('b', { fadeMs: 800 });
  assert.deepEqual(h.log.slice(0, 3), ['start:a:0', 'stop:a:0.8', 'start:b:0.8']);
  assert.equal(h.seq.currentCue, 'b'); assert.equal(h.seq.activeRuns.length, 2);
  h.advance(1.5); assert.ok(!h.log.includes('end:a'));
  h.advance(2.0); assert.ok(h.log.includes('end:a')); assert.equal(h.seq.activeRuns.length, 1);
  h.seq.stop({ fadeMs: 200 }); h.advance(3); assert.ok(h.log.includes('end:b')); assert.equal(h.seq.activeRuns.length, 0);
});

test('tempo scale with a ramp slows the beat gradually (the lullaby slows as the book ends)', () => {
  const h = makeSeq();
  h.seq.play('a', { fadeMs: 0 });
  for (let t = 0.1; t < 2; t += 0.1) h.advance(t);
  h.seq.setTempoScale(0.5, 2000);
  for (let t = 2; t < 14; t += 0.1) h.advance(t);
  const late = h.events.filter((e) => e.time > 4.2); assert.ok(late.length > 3);
  const gaps = late.slice(1).map((e, i) => e.time - late[i].time);
  for (const g of gaps) near(g, 1.0, 0.02);                                         // settled at half speed = 1 s per beat
  const early = h.events.filter((e) => e.time < 2); const eg = early.slice(1).map((e, i) => e.time - early[i].time);
  for (const g of eg) near(g, 0.5, 1e-6);
  const mid = h.events.filter((e) => e.time >= 2 && e.time <= 4.3).map((e) => e.time); const mg = mid.slice(1).map((t, i) => t - mid[i]);
  assert.ok(mg.length >= 2 && mg[mg.length - 1] > mg[0], 'gaps grow during the ramp');
  near(h.seq.tempoScale, 0.5);
});

test('after a long stall the scheduler does not burst-fire old notes', () => {
  const h = makeSeq(); h.seq.play('a', { fadeMs: 0 });
  const before = h.events.length;
  h.advance(60);                                                                    // tab was throttled for a minute
  const burst = h.events.length - before;
  assert.ok(burst <= 3, `burst of ${burst} events after a stall`);
  assert.ok(h.events.slice(before).every((e) => e.time >= 59.9));
});

// ───────────── voice pool ─────────────
test('voice pool: global cap steals the oldest, per-key cap steals within the key, retrigger guard', () => {
  const released: string[] = [];
  const mk = (name: string) => () => released.push(name);
  const pool = new VoicePool(4, 2, 0.05);
  pool.acquire('a', 0, 10, mk('a1')); pool.acquire('a', 0.1, 10, mk('a2'));
  const r = pool.acquire('a', 0.2, 10, mk('a3'));
  assert.deepEqual(released, ['a1']); assert.equal(r.stolen.length, 1); assert.equal(pool.activeKey('a', 0.2), 2);
  pool.acquire('b', 0.3, 10, mk('b1')); pool.acquire('c', 0.4, 10, mk('c1'));
  assert.equal(pool.active(0.4), 4);
  pool.acquire('d', 0.5, 10, mk('d1'));
  assert.deepEqual(released, ['a1', 'a2']); assert.equal(pool.active(0.5), 4); assert.equal(pool.stolen, 2);
  assert.ok(pool.tooSoon('d', 0.52)); assert.ok(!pool.tooSoon('d', 0.6)); assert.ok(!pool.tooSoon('zzz', 0.5));
  assert.equal(pool.active(11), 0);                                                   // everything rang out
  pool.acquire('e', 12, 20, mk('e1')); pool.releaseAll(); assert.ok(released.includes('e1'));
});

// ───────────── depth / duck / limiter ─────────────
test('depth mapping is monotonic and safe', () => {
  const ds = [0, 0.25, 0.5, 0.75, 1].map(depthParams);
  for (let i = 1; i < ds.length; i++) { assert.ok(ds[i].cutoffHz < ds[i - 1].cutoffHz); assert.ok(ds[i].gain < ds[i - 1].gain); assert.ok(ds[i].reverbSend > ds[i - 1].reverbSend); }
  near(ds[0].cutoffHz, 18000, 1); near(ds[4].cutoffHz, 380, 0.5); near(ds[0].gain, 1);
  assert.deepEqual(depthParams(NaN), depthParams(0)); assert.deepEqual(depthParams(5), depthParams(1)); assert.deepEqual(depthParams(-3), depthParams(0));
  assert.ok(ds[4].gain >= 0.4);
  near(duckGain(0), 1); near(duckGain(0.5), 0.5); assert.ok(duckGain(1) > 0); assert.equal(duckGain(7), duckGain(1));
});

test('limiter curve never reaches 1 and is identity below the knee', () => {
  const c = limiterCurve();
  assert.ok(Math.max(...c) < 0.99 && Math.min(...c) > -0.99);
  const mid = c[Math.floor(c.length * 0.75)]; near(mid, 0.5, 0.01);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1]);
});

// ───────────── narration ─────────────
test('syllable counting', () => {
  const cases: Record<string, number> = { cat: 1, the: 1, little: 2, banana: 3, bedtime: 2, beautiful: 3, rabbit: 2, lullaby: 3, sleepy: 2, moon: 1, jumped: 1, stories: 2, dinosaur: 3, '42': 2 };
  for (const [w, n] of Object.entries(cases)) assert.equal(countSyllables(w), n, w);
  assert.equal(countSyllables('...'), 0); assert.ok(countSyllables('a') >= 1);
});

test('estimated word timing: ordered, rate-scaled, pause on punctuation, stretches to total', () => {
  const text = 'Bramble the bear was sleepy, and the moon was bright. Goodnight!';
  const words = splitWords(text); assert.equal(words.length, 11);
  const tm = estimateWordTimings(text, { rate: 1 });
  assert.equal(tm.length, 11);
  for (let i = 0; i < tm.length; i++) { assert.equal(tm[i].i, i); assert.ok(tm[i].endMs > tm[i].startMs); if (i) assert.ok(tm[i].startMs >= tm[i - 1].endMs - 1e-9); }
  const gapAfterComma = tm[5].startMs - tm[4].endMs; assert.ok(gapAfterComma >= pauseAfterMs('sleepy,') - 1e-6);
  assert.ok(tm[10].startMs - tm[9].endMs >= 380);                                         // sentence stop
  const slow = estimateWordTimings(text, { rate: 0.5 }); assert.ok(slow[10].endMs > tm[10].endMs * 1.9);
  const fit = estimateWordTimings(text, { totalMs: 9000 }); near(fit[10].endMs, 9000, 1e-6);
  assert.ok(wordIndexAt(tm, -5) === -1); assert.equal(wordIndexAt(tm, 0), 0); assert.equal(wordIndexAt(tm, tm[3].startMs + 1), 3); assert.equal(wordIndexAt(tm, 1e9), 10);
  assert.deepEqual(estimateWordTimings('   '), []);
  const pace = tm[10].endMs / 1000 / 11; assert.ok(pace > 0.2 && pace < 0.8, `~${pace}s per word`);
});

test('word starts, char -> word index, sentence chunking keeps every word once and in order', () => {
  const text = 'One two  three.\nFour five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen. ' + 'seventeen '.repeat(30).trim();
  const starts = wordStarts(text); assert.equal(starts.length, splitWords(text).length);
  assert.equal(wordIndexForChar(starts, 0), 0); assert.equal(wordIndexForChar(starts, starts[2]), 2); assert.equal(wordIndexForChar(starts, starts[2] + 2), 2); assert.equal(wordIndexForChar(starts, 99999), starts.length - 1);
  const chunks = chunkText(text, 80);
  assert.ok(chunks.length > 3);
  let seen: string[] = [];
  chunks.forEach((c) => { assert.ok(c.text.length <= 100, `chunk too long ${c.text.length}`); assert.equal(c.firstWord, seen.length); seen = seen.concat(splitWords(c.text)); });
  assert.deepEqual(seen, splitWords(text));
  assert.deepEqual(chunkText('', 80), []);
});

test('pickVoice prefers natural English voices and avoids novelty ones', () => {
  const voices = [
    { name: 'Zarvox', lang: 'en-US', localService: true }, { name: 'Microsoft Jenny Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Thomas', lang: 'fr-FR', localService: true }, { name: 'Daniel', lang: 'en-GB', localService: true },
  ];
  assert.match(pickVoice(voices, 'warm')!.name, /Jenny/);
  assert.equal(pickVoice([], 'warm'), null);
  assert.equal(pickVoice([{ name: 'Thomas', lang: 'fr-FR' }], 'warm')!.name, 'Thomas');   // better than silence
  assert.match(pickVoice([...voices, { name: 'Moira', lang: 'en-IE', localService: true }], 'soft')!.name, /Jenny|Moira/);
});

function fakeTimers() {
  let now = 0; let id = 0;
  const ints = new Map<number, { fn: () => void; ms: number; next: number }>(); const tos = new Map<number, { fn: () => void; at: number }>();
  return {
    api: {
      setInterval: (fn: () => void, ms: number) => { ints.set(++id, { fn, ms, next: now + ms }); return id; }, clearInterval: (h: unknown) => { ints.delete(h as number); },
      setTimeout: (fn: () => void, ms: number) => { tos.set(++id, { fn, at: now + ms }); return id; }, clearTimeout: (h: unknown) => { tos.delete(h as number); },
    },
    now: () => now,
    advance(ms: number) {
      const end = now + ms;
      while (true) {
        let best: { t: number; run: () => void } | null = null;
        for (const [k, v] of ints) if (v.next <= end && (!best || v.next < best.t)) best = { t: v.next, run: () => { v.next += v.ms; v.fn(); } };
        for (const [k, v] of tos) if (v.at <= end && (!best || v.at < best.t)) best = { t: v.at, run: () => { tos.delete(k); v.fn(); } };
        if (!best) break; now = Math.max(now, best.t); best.run();
      }
      now = end;
    },
  };
}

class FakeUtterance { onstart: any; onend: any; onboundary: any; onerror: any; voice: any; lang = ''; rate = 1; pitch = 1; volume = 1; constructor(public text: string) {} }
function fakeSpeech(o: { boundaries: boolean }) {
  const spoken: FakeUtterance[] = []; let cancels = 0;
  return {
    spoken, get cancels() { return cancels; },
    getVoices: () => [{ name: 'Microsoft Jenny Online (Natural)', lang: 'en-US' }],
    speak(u: FakeUtterance) { spoken.push(u); queueMicrotask(() => u.onstart?.()); },
    cancel() { cancels++; }, pause() {}, resume() {},
    finishCurrent() { const u = spoken[spoken.length - 1]; u.onend?.(); },
    boundary(u: FakeUtterance, charIndex: number) { u.onboundary?.({ name: 'word', charIndex }); },
    boundaries: o.boundaries,
  };
}

test('Narrator + Web Speech boundary events drive onWord and duck music', async () => {
  const ft = fakeTimers(); const sp = fakeSpeech({ boundaries: true });
  const duck: boolean[] = []; const words: number[] = [];
  const n = new Narrator({ getCtx: () => null, voiceBus: () => null, speech: sp as any, makeUtterance: (t) => new FakeUtterance(t), onSpeaking: (on) => duck.push(on), timers: ft.api, now: ft.now });
  const text = 'The little bear yawned. Then the moon came up.';
  const h = n.speak(text, { onWord: (i) => words.push(i) });
  assert.deepEqual(duck, [true]);
  await Promise.resolve();
  assert.equal(sp.spoken.length, 1); assert.equal(sp.spoken[0].text, 'The little bear yawned. Then the moon came up.'); assert.ok(Math.abs(sp.spoken[0].rate - 0.85) < 1e-9, 'child-friendly default rate');
  const starts = wordStarts(text);
  [0, 1, 2, 3, 4].forEach((i) => sp.boundary(sp.spoken[0], starts[i]));
  assert.deepEqual(words, [0, 1, 2, 3, 4]);
  ft.advance(5000); assert.deepEqual(words, [0, 1, 2, 3, 4], 'boundary events are trusted: no estimated words on top');
  sp.finishCurrent(); await h.done;
  assert.deepEqual(duck, [true, false]); assert.equal(n.speaking, false);
});

test('Narrator falls back to estimated timing when the platform sends no boundary events', async () => {
  const ft = fakeTimers(); const sp = fakeSpeech({ boundaries: false });
  const words: number[] = [];
  const n = new Narrator({ getCtx: () => null, voiceBus: () => null, speech: sp as any, makeUtterance: (t) => new FakeUtterance(t), timers: ft.api, now: ft.now });
  const text = 'Sleep tight little bear';
  const h = n.speak(text, { onWord: (i) => words.push(i), rate: 0.85 });
  await Promise.resolve();
  ft.advance(850); assert.deepEqual(words, [], 'waits before deciding there are no boundaries');
  ft.advance(3000);
  assert.deepEqual(words, [0, 1, 2, 3]);
  for (let i = 1; i < words.length; i++) assert.ok(words[i] > words[i - 1]);
  h.cancel(); await h.done;
});

test('Narrator with no speech engine runs a silent read-along and resolves; cancel resolves too', async () => {
  const ft = fakeTimers(); const words: number[] = [];
  const n = new Narrator({ getCtx: () => null, voiceBus: () => null, speech: null, timers: ft.api, now: ft.now });
  const h = n.speak('Goodnight moon, goodnight stars.', { onWord: (i) => words.push(i) });
  let done = false; void h.done.then(() => { done = true; });
  ft.advance(10000); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(words, [0, 1, 2, 3]); assert.equal(done, true); assert.equal(n.lastMode, 'silent');
  const h2 = n.speak('One two three four five six', {}); let d2 = false; void h2.done.then(() => { d2 = true; });
  ft.advance(300); h2.cancel(); await Promise.resolve(); await Promise.resolve(); assert.equal(d2, true);
  const empty = n.speak('   '); await empty.done;
});

test('a new speak() cancels the previous one; long text is spoken chunk by chunk', async () => {
  const ft = fakeTimers(); const sp = fakeSpeech({ boundaries: true });
  const n = new Narrator({ getCtx: () => null, voiceBus: () => null, speech: sp as any, makeUtterance: (t) => new FakeUtterance(t), timers: ft.api, now: ft.now });
  const a = n.speak('First page text here.'); let aDone = false; void a.done.then(() => { aDone = true; });
  const long = 'This is a rather long sentence about a bear who could not sleep. '.repeat(8).trim();
  const words: number[] = [];
  const b = n.speak(long, { onWord: (i) => words.push(i) });
  await Promise.resolve(); await Promise.resolve(); assert.equal(aDone, true);
  assert.ok(sp.cancels >= 2);
  const u0 = sp.spoken[sp.spoken.length - 1]; assert.ok(u0.text.length <= 210);
  sp.boundary(u0, 0); sp.finishCurrent();
  await Promise.resolve();
  const u1 = sp.spoken[sp.spoken.length - 1]; assert.notEqual(u1, u0);
  sp.boundary(u1, 0);
  assert.ok(words.includes(0)); assert.ok(words[words.length - 1] > 5, 'second chunk continues the word numbering');
  b.cancel(); await b.done;
});

test('Aria client: cheap probe, no token means unavailable, caches, never throws', async () => {
  let calls = 0;
  const ok = createAriaClient({ getToken: async () => 'tok', fetchImpl: (async (url: string) => { calls++; return { ok: true, status: 200, json: async () => ({ available: true, eligible: true }), arrayBuffer: async () => new ArrayBuffer(8) }; }) as any });
  assert.equal(ok.isAvailable(), false);
  assert.equal(await ok.probe(), true); assert.equal(ok.isAvailable(), true); await ok.probe(); assert.equal(calls, 1, 'probe result is cached');
  assert.equal((await ok.fetchAudio('hello'))?.byteLength, 8);
  const signedOut = createAriaClient({ getToken: async () => null, fetchImpl: (async () => { throw new Error('should not be called'); }) as any });
  assert.equal(await signedOut.probe(), false); assert.equal(await signedOut.fetchAudio('x'), null);
  const boom = createAriaClient({ getToken: async () => { throw new Error('auth down'); } });
  assert.equal(await boom.probe(), false);
  const notConfigured = createAriaClient({ getToken: async () => 't', fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({ available: false, eligible: false }) })) as any });
  assert.equal(await notConfigured.probe(), false);
});

test('recorded-take timings: taps win, otherwise stretched to the real duration', () => {
  const text = 'one two three';
  const est = timingsForTake(text, { durationMs: 3000 }); assert.equal(est.length, 3); near(est[2].endMs, 3000, 1e-6);
  const taps = timingsForTake(text, { durationMs: 3000 }, [100, 900, 1600]); assert.deepEqual(taps.map((t) => t.startMs), [100, 900, 1600]); assert.equal(taps[2].endMs, 3000);
  let t = 0; const tt = new TapTimer(2, () => t); t = 1000; tt.start(); t = 1300; tt.tap(); t = 1900; tt.tap(); t = 2500; tt.tap();
  assert.deepEqual(tt.taps, [300, 900]); assert.ok(tt.complete);
});

// ───────────── catalogue integrity ─────────────
const REQUIRED_SFX = ['beep', 'beep-low', 'beep-high', 'beep-car', 'honk', 'toot', 'pop', 'boing', 'whoosh', 'swoosh', 'sparkle', 'twinkle', 'chime', 'glass-chime', 'bell', 'knock', 'thud', 'crunch', 'rustle', 'splash', 'bubble', 'drip', 'jelly-squish', 'hum', 'snore', 'yawn', 'wings', 'owl-hoo', 'cricket', 'footstep-left', 'footstep-right', 'stitch', 'thread-tug', 'thread-pluck', 'unravel', 'harp-gliss', 'kazoo-toot', 'pop-balloon', 'confetti', 'success-jingle', 'gentle-no', 'whale-call', 'heartbeat', 'candle-flicker', 'candle-blow', 'magic-appear', 'page-flip', 'button-click', 'boop', 'ding', 'squeak', 'rumble'];

test('sfx catalogue: at least 50, unique ids, every sound has a gain, category, bounds and a label', () => {
  assert.ok(SFX_CATALOG.length >= 50, `only ${SFX_CATALOG.length}`);
  assert.equal(new Set(SFX_IDS).size, SFX_IDS.length, 'duplicate ids');
  assert.equal(SFX_BY_ID.size, SFX_IDS.length);
  for (const d of SFX_CATALOG) {
    assert.match(d.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${d.id}`);
    assert.ok(d.defaultGain > 0 && d.defaultGain <= 6, `${d.id} defaultGain ${d.defaultGain}`);
    assert.ok(d.category, d.id); assert.ok(d.label.length > 1, d.id); assert.ok(d.maxSec > 0 && d.maxSec <= 5, d.id); assert.equal(typeof d.play, 'function');
  }
  for (const id of REQUIRED_SFX) assert.ok(SFX_BY_ID.has(id), `missing sfx ${id}`);
  assert.ok(resolveSfx('car-horn')); assert.equal(resolveSfx('car-horn')!.id, 'beep-car'); assert.equal(resolveSfx('not-a-sound'), undefined);
});

test('instruments: at least 12 pitched/voiced + drum pieces, voices for the sustained ones', () => {
  const ids = INSTRUMENTS.map((i) => i.id); assert.equal(new Set(ids).size, ids.length);
  for (const id of ['musicbox', 'marimba', 'felt-piano', 'harp', 'pluck', 'flute', 'whistle', 'pad', 'bass', 'kalimba', 'bell', 'glass', 'kazoo', 'kick', 'snare', 'hat', 'shaker', 'click', 'choir', 'drum']) assert.ok(resolveInstrument(id), `missing ${id}`);
  assert.ok(INSTRUMENTS.filter((i) => i.family !== 'drum').length >= 12);
  for (const id of ['kazoo', 'whale', 'hum', 'flute', 'whistle', 'pad', 'choir']) assert.ok(resolveInstrument(id)!.voice, `${id} should be holdable`);
  assert.equal(resolveInstrument('harp')!.voice, undefined);
  for (const i of INSTRUMENTS) { assert.ok(i.level > 0 && i.level <= 3, `${i.id} level ${i.level}`); assert.ok(i.tail >= 0); }
  assert.equal(resolveInstrument('piano')!.id, 'felt-piano');
  assert.equal(noteForInstrument(resolveInstrument('harp')!, 'C4'), 60); assert.equal(noteForInstrument(resolveInstrument('harp')!, 'x'), 60); assert.equal(noteForInstrument(resolveInstrument('harp')!, 'zzz'), null);
  assert.equal(noteForInstrument(resolveInstrument('drum')!, 'kick'), 36); assert.equal(noteForInstrument(resolveInstrument('drum')!, 'x'), 36); assert.equal(noteForInstrument(resolveInstrument('drum')!, 38), 38);
  assert.equal(resolveDrumPiece(42), 'hat'); assert.equal(resolveDrumPiece('snare'), 'snare');
});

test('ambience beds: the contract names exist', () => {
  for (const id of ['night-crickets', 'forest-wind', 'ocean-hum', 'city-murmur', 'room-tone', 'space-drone', 'wind', 'rain-soft']) assert.ok(resolveBed(id), id);
  assert.equal(new Set(AMBIENCE_BEDS.map((b) => b.id)).size, AMBIENCE_BEDS.length);
  for (const b of AMBIENCE_BEDS) assert.ok(b.level > 0 && b.level < 4, b.id);
});

// ───────────── mock + analysis helpers ─────────────
test('mock audio records calls and flags typos and sound-before-unlock', async () => {
  const m = createMockAudio({ clock: () => 7 });
  m.sfx('beep'); assert.ok(m.problems.some((p) => /before unlock/.test(p)));
  await m.unlock(); m.reset();
  m.sfx('beep', { pitch: 2 }); m.sfx('beeeep'); m.note('marimba', 'C4'); m.note('nonsuch', 'C4'); m.setAmbience('rain-soft'); m.setAmbience('lava');
  assert.deepEqual(m.sfxIds(), ['beep', 'beeeep']); assert.equal(m.callsOf('note').length, 2);
  assert.deepEqual(m.problems, ['unknown sfx "beeeep"', 'unknown instrument "nonsuch"', 'unknown ambience bed "lava"']);
  const v = m.voice('kazoo', 'C4')!; assert.equal(m.openVoices, 1); v.setPitch('E4', 80); v.stop(); assert.equal(m.openVoices, 0);
  assert.equal(m.voice('harp', 'C4'), null);
  m.registerScores(DEMO_SCORES); m.playCue('lullaby'); assert.equal(m.currentCue, 'lullaby'); m.playCue('missing'); assert.ok(m.problems.some((p) => /unknown cue/.test(p)));
  m.setDepth(0.6); assert.equal(m.depth, 0.6); m.setTempoScale(0.5, 1000); assert.equal(m.tempoScale, 0.5);
  const sp = m.speak('a b c', { onWord: () => {} }); let finished = false; void sp.done.then(() => { finished = true; }); m.finishSpeech(); await sp.done; assert.ok(finished);
  m.stopAll(); assert.equal(m.currentCue, null); m.reset(); assert.equal(m.calls.length, 0);
  const locked = createMockAudio(); locked.allowUnlock = false; await locked.unlock(); locked.sfx('beep'); assert.ok(locked.problems.length === 1);
});

test('analysis helpers: FFT peak bin, centroid, stats, NaN detection, WAV header', () => {
  const sr = 8000, n = 4096, f = 1000;
  const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / sr);
  near(spectralCentroid(x, sr), f, 30);
  const lo = new Float32Array(n), hi = new Float32Array(n); for (let i = 0; i < n; i++) { lo[i] = Math.sin((2 * Math.PI * 200 * i) / sr); hi[i] = Math.sin((2 * Math.PI * 2500 * i) / sr); }
  assert.ok(spectralCentroid(hi, sr) > 5 * spectralCentroid(lo, sr));
  const st = analyse(x, sr); near(st.peak, 0.5, 1e-3); near(st.rms, 0.3536, 1e-2); assert.equal(st.hasNaN, false); assert.equal(st.silent, false);
  const bad = new Float32Array(10); bad[3] = NaN; assert.equal(analyse(bad, sr).hasNaN, true);
  assert.equal(analyse(new Float32Array(100), sr).silent, true);
  const re = new Float32Array(8), im = new Float32Array(8); re[1] = 1; fft(re, im); near(Math.hypot(re[1], im[1]), 1);
  const wav = encodeWav16(x, sr); assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF'); assert.equal(wav.length, 44 + n * 2);
  assert.equal(hash32(1, 2, 3), hash32(1, 2, 3)); assert.notEqual(hash32(1, 2, 3), hash32(1, 2, 4));
  const r1 = mulberry32(5), r2 = mulberry32(5); assert.equal(r1(), r2());
});
