// Melos Beats phase 6: voice → notes (YIN + segmenter) and beatbox → drums (onsets, features,
// rules, taught templates). Synthetic signals, no Web Audio — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsToNotes, hzToMidi, midiToHz, trackBuffer, yin, NoteSegmenter } from '../services/melos/beats/voice/pitchTrack';
import { classifyByRules, classifyHit, hitFeatures, OnsetDetector, defaultPadMap, type MouthModel } from '../services/melos/beats/voice/beatbox';

const SR = 48000;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/** A sung-ish tone: fundamental + 2 harmonics, gentle vibrato, amplitude envelope. */
function sing(notes: { midi: number; dur: number; gap?: number }[], vibrato = 0.15): Float32Array {
  const total = notes.reduce((s, n) => s + n.dur + (n.gap ?? 0.12), 0.2);
  const x = new Float32Array(Math.ceil(total * SR));
  let t0 = 0.1, phase = 0;
  for (const n of notes) {
    const i0 = Math.round(t0 * SR), i1 = Math.round((t0 + n.dur) * SR);
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR;
      const hz = midiToHz(n.midi + vibrato * Math.sin(2 * Math.PI * 5.5 * t));
      phase += (2 * Math.PI * hz) / SR;
      const env = Math.min(1, t / 0.02, (n.dur - t) / 0.03);
      x[i] = 0.3 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
    }
    t0 += n.dur + (n.gap ?? 0.12);
  }
  return x;
}

test('YIN finds the fundamental of a harmonic tone (not an octave)', () => {
  for (const midi of [45, 57, 64, 72, 79]) {
    const f = midiToHz(midi);
    const x = new Float32Array(1024);
    for (let i = 0; i < x.length; i++) { const p = (2 * Math.PI * f * i) / 16000; x[i] = Math.sin(p) + 0.6 * Math.sin(2 * p) + 0.3 * Math.sin(3 * p); }
    const r = yin(x, 16000)!;
    assert.ok(Math.abs(hzToMidi(r.f0) - midi) < 0.15, `${midi} → ${hzToMidi(r.f0)}`);
    assert.ok(r.clarity > 0.8);
  }
  const noise = new Float32Array(1024).map(() => rnd() * 0.3);
  const rn = yin(noise, 16000);
  assert.ok(!rn || rn.clarity < 0.75);
});

test('a sung phrase with vibrato becomes the right notes, on time', () => {
  const phrase = [{ midi: 60, dur: 0.4 }, { midi: 62, dur: 0.3 }, { midi: 64, dur: 0.5 }, { midi: 67, dur: 0.6 }];
  const notes = eventsToNotes(trackBuffer(sing(phrase), SR));
  assert.deepEqual(notes.map((n) => n.midi), [60, 62, 64, 67]);
  let t0 = 0.1;
  phrase.forEach((p, i) => {
    assert.ok(Math.abs(notes[i].t0 - t0) < 0.05, `onset ${i}: ${notes[i].t0} vs ${t0}`);
    assert.ok(Math.abs(notes[i].t1 - notes[i].t0 - p.dur) < 0.09, `length ${i}`);
    t0 += p.dur + 0.12;
  });
});

test('legato: a slur to a new pitch re-articulates without a gap; vibrato alone does not', () => {
  const legato = eventsToNotes(trackBuffer(sing([{ midi: 64, dur: 0.4, gap: 0 }, { midi: 67, dur: 0.4 }], 0.25), SR));
  assert.deepEqual(legato.map((n) => n.midi), [64, 67]);
  const held = eventsToNotes(trackBuffer(sing([{ midi: 69, dur: 1.2 }], 0.45), SR));
  assert.deepEqual(held.map((n) => n.midi), [69]);
});

test('segmenter ignores a lone octave slip and short blips', () => {
  const seg = new NoteSegmenter();
  const ev: string[] = [];
  const f = (t: number, hz: number | null) => ({ t, f0: hz, clarity: hz ? 0.95 : 0, rmsDb: hz ? -20 : -80 });
  for (let i = 0; i < 30; i++) {
    const hz = i === 15 ? midiToHz(72) : midiToHz(60); // one frame jumps an octave
    for (const e of seg.push(f(i * 0.01, hz))) if (e.type !== 'pitch') ev.push(`${e.type}${e.type === 'on' ? e.midi : ''}`);
  }
  for (let i = 30; i < 45; i++) for (const e of seg.push(f(i * 0.01, null))) if (e.type !== 'pitch') ev.push(e.type);
  assert.deepEqual(ev, ['on60', 'off']);
});

// ── beatbox ─────────────────────────────────────────────────────────────────

const N = Math.round(0.04 * SR);
const kick = () => { const x = new Float32Array(N); for (let i = 0; i < N; i++) { const t = i / SR; x[i] = 0.8 * Math.exp(-t * 30) * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-t * 60)) * t); } return x; };
const hat = () => { const x = new Float32Array(N); let p = 0; for (let i = 0; i < N; i++) { const w = rnd(); x[i] = 0.4 * Math.exp(-(i / SR) * 60) * (w - p); p = w; } return x; }; // differentiated noise = bright
const snare = () => { const x = new Float32Array(N); for (let i = 0; i < N; i++) { const t = i / SR; x[i] = Math.exp(-t * 35) * (0.35 * rnd() + 0.3 * Math.sin(2 * Math.PI * 190 * t)); } return x; };

test('rules tell a synthetic kick, snare and hat apart', () => {
  assert.equal(classifyByRules(hitFeatures(kick(), SR)), 'kick');
  assert.equal(classifyByRules(hitFeatures(hat(), SR)), 'hat');
  assert.equal(classifyByRules(hitFeatures(snare(), SR)), 'snare');
});

test('taught templates win over the rules (your mouth, your sounds)', () => {
  // This "mouth" makes a bright click for its kick — the rules would call it a hat.
  const click = () => hat().map((v, i) => v * (i < N / 3 ? 1 : 0.1));
  const model: MouthModel = { examples: {
    kick: Array.from({ length: 5 }, () => hitFeatures(click(), SR)),
    snare: Array.from({ length: 5 }, () => hitFeatures(snare(), SR)),
    hat: Array.from({ length: 5 }, () => hitFeatures(hat(), SR)),
  } };
  assert.equal(classifyHit(hitFeatures(click(), SR), model).cls, 'kick');
  assert.equal(classifyHit(hitFeatures(snare(), SR), model).cls, 'snare');
  assert.equal(classifyHit(hitFeatures(kick(), SR), null).cls, 'kick'); // untrained → rules
});

test('onset detector: one trigger per hit, none on the decay', () => {
  const det = new OnsetDetector();
  const hits: number[] = [];
  const level = (t: number) => {
    for (const h of [0.1, 0.35, 0.6]) if (t >= h && t < h + 0.2) return -10 - (t - h) * 120;
    return -70;
  };
  for (let t = 0; t < 0.9; t += 0.005) if (det.push(t, level(t))) hits.push(+t.toFixed(3));
  assert.equal(hits.length, 3);
  assert.ok(Math.abs(hits[0] - 0.1) < 0.006);
});

test('default pad map finds kick / snare / hat pads by name or voice', () => {
  const kit = [{ name: 'Kick', synthVoice: 'kick' }, { name: 'Clap', synthVoice: 'clap' }, { name: 'Snare', synthVoice: 'snare' }, { name: 'Closed Hat', synthVoice: 'hat-closed' }];
  assert.deepEqual(defaultPadMap(kit), { kick: 0, snare: 2, hat: 3, perc: 1 });
});
