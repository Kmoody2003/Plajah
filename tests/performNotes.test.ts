// Humanized MIDI: generated parts are played in by the band member who plays that instrument —
// bass in the pocket and articulated, chords rolled with the top voice sung out, leads phrased, pads
// gentle — while anything already played (off the grid) is left alone. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type NoteEvent } from '../services/melos/beats/grooveDoc';
import { guessPartRole, isOnGrid, performClipNotes, performDoc, performMeloLane, personaFor, playerForPart } from '../services/melos/beats/patterns/performNotes';
import { progressionToClip } from '../services/melos/composition/progressionToClip';

const n = (startBeats: number, key: number, lengthBeats = 1, vel = 90): NoteEvent => ({ id: `${startBeats}-${key}`, startBeats, lengthBeats, key, vel });
const traits = personaFor('theo').traits;

test('roles and players are recognised', () => {
  assert.equal(guessPartRole([n(0, 36), n(1, 38)], 'Bass'), 'bass');
  assert.equal(guessPartRole([n(0, 60), n(0, 64), n(0, 67), n(4, 62), n(4, 65), n(4, 69)], 'Keys'), 'chords');
  assert.equal(guessPartRole([n(0, 72), n(0.5, 74), n(1, 76)], 'Melody'), 'lead');
  assert.equal(playerForPart('Rhodes comp', 'chords'), 'theo');
  assert.equal(playerForPart('Tenor sax', 'lead'), 'lena');
  assert.equal(playerForPart('Sub bass', 'bass'), 'dwayne');
});

test('chords: rolled bottom-up, top voice louder, onsets off the grid', () => {
  const chord = [n(0, 48), n(0, 52), n(0, 55), n(0, 60)];
  const out = performClipNotes(chord, { role: 'chords', traits, seed: 1 });
  const sorted = [...out].sort((a, b) => a.key - b.key);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].startBeats >= sorted[i - 1].startBeats, 'rolls upward');
  assert.ok(sorted[3].vel > sorted[1].vel, 'top voice sings over the inner voices');
  assert.equal(isOnGrid(out), false);
});

test('bass: articulated (no smearing into the next note) and behind the beat on average', () => {
  const line = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => n(b, 36 + (b % 3), 1));
  const out = performClipNotes(line, { role: 'bass', traits: personaFor('dwayne').traits, seed: 2 });
  const sorted = [...out].sort((a, b) => a.startBeats - b.startBeats);
  for (let i = 0; i < sorted.length - 1; i++) assert.ok(sorted[i].startBeats + sorted[i].lengthBeats < sorted[i + 1].startBeats + 1e-6);
  const shift = sorted.reduce((a, x, i) => a + (x.startBeats - i), 0) / sorted.length;
  assert.ok(shift > -0.01, `pocket ${shift}`);
});

test('lead: phrased toward the peak, held notes get vibrato', () => {
  const tune = [n(0, 64, 0.5), n(0.5, 67, 0.5), n(1, 72, 2), n(3, 67, 0.5), n(3.5, 64, 0.5)];
  const out = performClipNotes(tune, { role: 'lead', traits: { ...personaFor('lena').traits, tightness: 1 }, seed: 3 });
  const peak = out.find((x) => x.key === 72)!;
  assert.ok(peak.vel > out.find((x) => x.key === 64)!.vel, 'the peak note sings');
  assert.ok(peak.expr?.vibratoDepth && peak.expr.vibratoDepth > 0, 'vibrato on the held note');
});

test('already-played parts are left alone; MEKA lanes get micro-timing', () => {
  const lane = { 0: [{ semi: 0, v: 100, len: 2 }], 4: [{ semi: 3, v: 100, len: 2 }], 8: [{ semi: 5, v: 100, len: 2 }] };
  const out = performMeloLane(lane, { role: 'bass', traits: personaFor('dwayne').traits, seed: 4 });
  assert.ok(Object.values(out).flat().some((m) => m.micro), 'feel as micro-timing');
  const again = performMeloLane(out, { role: 'bass', traits: personaFor('dwayne').traits, seed: 5 });
  assert.deepEqual(again, out, 'a played lane is not re-played');
});

test('progressions: exact by default, played when asked', () => {
  const plain = progressionToClip('pop', 0)!;
  assert.ok(isOnGrid(plain.notes!));
  const felt = progressionToClip('pop', 0, { feel: { seed: 9 } })!;
  assert.equal(felt.notes!.length, plain.notes!.length);
  assert.equal(isOnGrid(felt.notes!), false);
});

test('performDoc plays generated clips and patterns, leaves played ones', () => {
  const doc = newGrooveDoc('u', 'Score');
  doc.arrangement.push({ id: 'k', kind: 'instrument', name: 'Piano', clips: [{ id: 'c', startBeats: 0, lengthBeats: 8, notes: [n(0, 60), n(0, 64), n(0, 67), n(4, 62), n(4, 65), n(4, 69)] }],
    played: undefined } as any);
  doc.arrangement.push({ id: 'p', kind: 'instrument', name: 'Played', clips: [{ id: 'd', startBeats: 0, lengthBeats: 4, notes: [n(0.03, 60), n(1.02, 62)] }] } as any);
  doc.patterns[0].steps = { 0: { 0: { v: 110 }, 8: { v: 110 } }, 4: { 4: { v: 100 }, 12: { v: 100 } } };
  performDoc(doc, 7);
  const piano = (doc.arrangement.find((t) => t.id === 'k') as any).clips[0].notes as NoteEvent[];
  assert.equal(isOnGrid(piano), false);
  const played = (doc.arrangement.find((t) => t.id === 'p') as any).clips[0].notes as NoteEvent[];
  assert.deepEqual(played.map((x) => x.startBeats), [0.03, 1.02]);
  const drums = Object.values(doc.patterns[0].steps).flatMap((r) => Object.values(r));
  assert.ok(drums.some((h) => h.micro), 'default pattern drums get feel');
  assert.equal(doc.patterns[0].length, 16, 'same length — feel only');
});
