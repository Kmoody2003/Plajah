// SOMA hand-drum pattern library: every rhythm in every mood, role and persona plays sanely; bars are
// played, not copied; takes differ by seed; and applying one lands in the SOMA pad's piano roll, in
// that pad's own Group, on a hand drum with the hand map on. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc';
import { playerById } from '../services/melos/beats/band/roster';
import { HAND_RHYTHMS, handRhythmById } from '../services/melos/beats/patterns/handRhythms';
import { HAND_MOODS, HAND_ROLES, performHandDrum, seedOf } from '../services/melos/beats/patterns/handDrumPerformer';
import { applyHandPattern } from '../services/melos/beats/patterns/applyHandPattern';
import { deserializeSomaPatch, newSomaPatch, serializeSomaPatch, somaHandConfig } from '../services/melos/instruments/soma/patch';
import { addPadBank, firstEmptyPadIndex, type GrooveDoc } from '../services/melos/beats/grooveDoc';

/** SOMA on the first empty pad, as instrumentFactory does it (that module pulls in the audio engine). */
function addSoma(doc: GrooveDoc): number {
  let padIdx = firstEmptyPadIndex(doc.kit);
  if (padIdx < 0) padIdx = addPadBank(doc.kit);
  const id = `soma-${padIdx}`;
  doc.arrangement.push({ id, kind: 'instrument', name: 'SOMA', instrument: { type: 'soma', patch: serializeSomaPatch(newSomaPatch()) } } as any);
  Object.assign(doc.kit[padIdx], { source: 'instrument', instrumentTrackId: id, empty: false, name: 'SOMA', instrumentNote: 60 });
  return padIdx;
}

const amara = playerById('amara')!;

test('every rhythm × mood × role × persona plays sanely', () => {
  let n = 0;
  for (const r of HAND_RHYTHMS) for (const mood of HAND_MOODS) for (const role of HAND_ROLES) for (const persona of amara.personas) {
    const perf = performHandDrum({ rhythm: r, persona: persona.traits, mood: mood.id, role: role.id, bars: 4, seed: seedOf(r.id + mood.id + role.id + persona.id) });
    assert.ok(perf.strokes.length > 0, `${r.id}/${mood.id}/${role.id}`);
    for (const s of perf.strokes) {
      assert.ok(s.step >= 0 && s.step < perf.length && Math.abs(s.micro) <= 0.45 && s.vel >= 1 && s.vel <= 127, JSON.stringify(s));
    }
    n++;
  }
  assert.ok(n >= 1000, `${n} presets`);
});

test('a groove is played, not looped: bars differ, and takes differ by seed', () => {
  const r = handRhythmById('tumbao')!;
  const perf = performHandDrum({ rhythm: r, persona: amara.personas[1].traits, mood: 'steady', role: 'groove', bars: 4, seed: 7 });
  const bar = (b: number) => perf.strokes.filter((s) => s.step >= b * 16 && s.step < (b + 1) * 16).map((s) => `${s.step % 16}:${s.stroke}:${s.vel}:${s.micro}`).join(' ');
  assert.notEqual(bar(0), bar(1));
  const other = performHandDrum({ rhythm: r, persona: amara.personas[1].traits, mood: 'steady', role: 'groove', bars: 4, seed: 8 });
  assert.notDeepEqual(perf.strokes, other.strokes);
  // The written tumbao is still there: slap on 2, open tones on 4 and 4&.
  const first = perf.strokes.filter((s) => s.step < 16);
  assert.ok(first.some((s) => s.step === 4 && (s.stroke === 'slap' || s.stroke === 'tone')));
  assert.ok(first.some((s) => s.step === 12 && s.stroke === 'tone') || first.some((s) => s.step === 12 && s.stroke === 'slap'));
});

test('moods and personas change the playing', () => {
  const r = handRhythmById('maqsum')!;
  const avg = (mood: any, persona = amara.personas[0].traits) => {
    const p = performHandDrum({ rhythm: r, persona, mood, role: 'groove', bars: 4, seed: 3 });
    return p.strokes.reduce((a, s) => a + s.vel, 0) / p.strokes.length;
  };
  assert.ok(avg('intense') > avg('tender') + 10, 'intense is louder than tender');
  const ghost = performHandDrum({ rhythm: r, persona: amara.personas[2].traits, mood: 'steady', role: 'groove', bars: 4, seed: 3 }).strokes.length;
  const griot = performHandDrum({ rhythm: r, persona: amara.personas[0].traits, mood: 'steady', role: 'groove', bars: 4, seed: 3 }).strokes.length;
  assert.ok(griot > ghost, 'the Griot plays busier than Shaker Ghost');
});

test('12/8 rhythms sit on triplets via micro-timing', () => {
  const p = performHandDrum({ rhythm: handRhythmById('bell-128')!, persona: { ...amara.personas[1].traits, tightness: 1, pocket: 0, swing: 0 }, mood: 'hypnotic', role: 'groove', bars: 2, seed: 1 });
  // Cell 2 of 12 is 2.667 sixteenths: step 3, micro about -0.33.
  assert.ok(p.strokes.some((s) => s.step === 3 && s.micro < -0.2), JSON.stringify(p.strokes.slice(0, 4)));
});

test('apply: lands in the SOMA pad\'s piano roll, in its Group, on a hand drum', () => {
  const doc = newGrooveDoc('u', 'Hands');
  const padIdx = addSoma(doc); // the default SOMA preset is a timpani
  const res = applyHandPattern(doc, padIdx, { rhythm: handRhythmById('tumbao')!, persona: amara.personas[1].traits, mood: 'joyful', role: 'fills', bars: 4, seed: 11, name: 'Tumbao', setTempo: true }, addSoma);
  assert.equal(res.padIdx, padIdx);
  const pat = doc.patterns.find((p) => p.id === res.patternId)!;
  assert.equal(pat.groupIdx ?? 0, Math.floor(padIdx / 16));
  assert.ok(Object.keys(pat.melo![padIdx]).length > 8, 'notes in the pad\'s piano roll');
  assert.ok(Object.values(pat.melo![padIdx]).flat().some((n) => n.micro), 'with micro-timing');
  const track = doc.arrangement.find((t) => t.id === doc.kit[padIdx].instrumentTrackId)!;
  const patch = deserializeSomaPatch(track.instrument!.patch as any)!;
  assert.equal(somaHandConfig(patch).enabled, true);
  assert.equal(patch.presetId, 'conga-habana-open', 'a timpani becomes the rhythm\'s hand drum');
  assert.equal(doc.bpm, 96);
});

test('apply with no SOMA anywhere puts SOMA on the next free pad', () => {
  const doc = newGrooveDoc('u', 'Hands');
  const res = applyHandPattern(doc, 0, { rhythm: handRhythmById('saidi')!, persona: amara.personas[0].traits, mood: 'steady', role: 'groove', bars: 2, seed: 2, name: 'Saidi', setTempo: false }, addSoma);
  assert.ok(res.padIdx >= 0);
  assert.equal(doc.kit[res.padIdx].source, 'instrument');
});

test('genre patterns are played by the band drummer: four bars, varied, in the pocket, a fill', async () => {
  const { GENRE_PRESETS, applyGenrePreset } = await import('../services/melos/beats/genrePresets');
  const doc = newGrooveDoc('u', 'Genres');
  for (const g of GENRE_PRESETS) {
    const id = applyGenrePreset(doc, g, 42);
    const pat = doc.patterns.find((p) => p.id === id)!;
    assert.equal(pat.length, 64, g.id);
    assert.equal(pat.groupIdx ?? 0, 0, 'genre patterns live in Group A with the default kit');
    const hits = Object.values(pat.steps).flatMap((row) => Object.values(row));
    assert.ok(hits.some((h) => h.micro), `${g.id} has feel`);
    const vel = (bar: number) => Object.values(pat.steps).flatMap((row) => Object.entries(row).filter(([s]) => Math.floor(Number(s) / 16) === bar).map(([, h]) => h.v)).join(',');
    assert.notEqual(vel(0), vel(1), `${g.id}: bars differ`);
  }
});
