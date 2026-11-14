// The scale + chord library, auto-chord, and next-chord suggestions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHORDS, CHORD_FAMILIES, SCALES, SCALE_FAMILIES, chordFamily, identifyChord, scaleById, scaleFamily, snapToScale } from '../services/melos/theory';
import { keyLabel, parseKey, prefersFlats } from '../services/melos/beats/songKey';
import {
  assistKeys, buildVoicedChord, chordHistory, chordKeysFor, chordSymbol, identifyPlayedChord, keyChord, keyChords, parseChordSymbol, suggestNextChords, suggestionKeys, voiceNotes,
} from '../services/melos/beats/chordAssist';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc';

test('library: every scale is well formed, ids unique, each in a shown family', () => {
  assert.ok(SCALES.length >= 100, String(SCALES.length));
  assert.equal(new Set(SCALES.map((s) => s.id)).size, SCALES.length);
  const families = new Set(SCALE_FAMILIES.map((f) => f.id));
  for (const s of SCALES) {
    assert.equal(s.intervals[0], 0, s.id);
    assert.ok(s.intervals.every((v, i) => i === 0 || v > s.intervals[i - 1]), `${s.id} ascending`);
    assert.ok(s.intervals.every((v) => v < 12), `${s.id} within an octave`);
    assert.ok(families.has(scaleFamily(s)), s.id);
    assert.ok(s.character.length > 5, s.id);
  }
});

test('library: the modes of melodic and harmonic minor are rotations of their parents', () => {
  const rotate = (iv: number[], by: number) => iv.map((_, i) => (iv[(i + by) % iv.length] - iv[by] + 12) % 12);
  const mm = scaleById('melodic-minor').intervals;
  ['dorian-b2', 'lydian-augmented', 'lydian-dominant', 'mixolydian-b6', 'locrian-n2', 'altered'].forEach((id, i) =>
    assert.deepEqual(scaleById(id).intervals, rotate(mm, i + 1), id));
  const hm = scaleById('harmonic-minor').intervals;
  ['locrian-n6', 'ionian-augmented', 'dorian-s4', 'phrygian-dominant', 'lydian-s2', 'ultralocrian'].forEach((id, i) =>
    assert.deepEqual(scaleById(id).intervals, rotate(hm, i + 1), id));
});

test('library: every chord is well formed, ids unique, each in a shown family', () => {
  assert.ok(CHORDS.length >= 55, String(CHORDS.length));
  assert.equal(new Set(CHORDS.map((c) => c.id)).size, CHORDS.length);
  const families = new Set(CHORD_FAMILIES.map((f) => f.id));
  for (const c of CHORDS) {
    assert.equal(c.intervals[0], 0, c.id);
    assert.ok(families.has(chordFamily(c)), c.id);
  }
});

test('library: the old fifteen scales and sixteen chords keep their exact notes', () => {
  assert.deepEqual(scaleById('major').intervals, [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(scaleById('minor').intervals, [0, 2, 3, 5, 7, 8, 10]);
  assert.equal(snapToScale(61, 0, 'major'), 60);
  assert.equal(identifyChord([60, 63, 67])?.symbol, 'Cm');
  assert.equal(identifyChord([60, 64, 67, 70])?.symbol, 'C7');
});

test('song key: new scales parse and spell themselves', () => {
  assert.deepEqual(parseKey('D melodic minor'), { tonic: 2, scale: 'melodic-minor' });
  assert.deepEqual(parseKey('A raga yaman'), { tonic: 9, scale: 'raga-yaman' });
  assert.deepEqual(parseKey('D minor'), { tonic: 2, scale: 'minor' });
  assert.deepEqual(parseKey('C major'), { tonic: 0, scale: 'major' });
  assert.equal(prefersFlats({ tonic: 5, scale: 'phrygian-dominant' }), true, 'major-third scales read as major keys');
  assert.equal(prefersFlats({ tonic: 2, scale: 'melodic-minor' }), true);
  assert.match(keyLabel({ tonic: 9, scale: 'hungarian-minor' }), /^A Hungarian minor$/);
});

test('diatonic chords in major', () => {
  const k = { tonic: 0, scale: 'major' };
  assert.deepEqual(keyChords(k).map((c) => c.symbol), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']);
  assert.deepEqual(keyChords(k).map((c) => c.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(keyChords(k, 4).map((c) => c.chordId), ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'hdim7']);
});

test('diatonic chords in other scales: harmonic minor, a pentatonic, an eight-note scale', () => {
  const hm = keyChords({ tonic: 9, scale: 'harmonic-minor' });
  assert.equal(hm[4].symbol, 'E', 'the raised seventh makes the dominant major');
  const pent = keyChord({ tonic: 0, scale: 'minor-pent' }, 0);
  assert.equal(pent.intervals.length, 3);
  assert.deepEqual(pent.intervals, [0, 5, 10], 'stacks every other scale note');
  assert.equal(keyChords({ tonic: 0, scale: 'diminished' }).length, 8);
});

test('auto-chord: a note in the key plays the chord the key gives it', () => {
  const k = { tonic: 0, scale: 'major' };
  assert.deepEqual(chordKeysFor(69, k, { tones: 3 }), [69, 72, 76]); // Am
  assert.deepEqual(chordKeysFor(67, k, { tones: 4 }), [67, 71, 74, 77]); // G7
});

test('auto-chord: a note outside the key still sounds, as the root', () => {
  const keys = chordKeysFor(61, { tonic: 0, scale: 'major' }, { tones: 3 });
  assert.equal(keys[0], 61);
  assert.equal(keys.length, 3);
});

test('auto-chord: no key still gives a chord; a fixed type overrides the key', () => {
  assert.deepEqual(chordKeysFor(60, null, { tones: 3 }), [60, 64, 67]);
  assert.deepEqual(chordKeysFor(60, { tonic: 0, scale: 'major' }, { chordId: 'min7' }), [60, 63, 67, 70]);
});

test('auto-chord: off leaves the note alone; on reads the doc key', () => {
  const doc = newGrooveDoc('x');
  assert.deepEqual(assistKeys(doc, 62), [62]);
  doc.key = { tonic: 0, scale: 'major' };
  doc.chordAssist = { on: true, tones: 3, voicing: 'close', inversion: 0 };
  assert.deepEqual(assistKeys(doc, 62), [62, 65, 69]);
});

test('voicings and inversions', () => {
  const c = [60, 64, 67, 71];
  assert.deepEqual(voiceNotes(c, 'close', 1), [64, 67, 71, 72]);
  assert.deepEqual(voiceNotes(c, 'drop2'), [55, 60, 64, 71]);
  assert.deepEqual(voiceNotes(c, 'drop3'), [52, 60, 67, 71]);
  assert.deepEqual(voiceNotes(c, 'shell'), [60, 64, 71]);
  assert.deepEqual(voiceNotes(c, 'rootless'), [64, 67, 71]);
  assert.equal(voiceNotes(c, 'open')[0], 48);
});

test('chord symbols round-trip, slash chords put the bass underneath', () => {
  for (const c of CHORDS) {
    const name = chordSymbol(7, c.id);
    const p = parseChordSymbol(name);
    assert.ok(p, name);
    assert.deepEqual(CHORDS.find((x) => x.id === p!.chordId)!.intervals, c.intervals, name);
    assert.equal(p!.rootPc, 7, name);
  }
  assert.deepEqual(parseChordSymbol('Cm7/Bb'), { rootPc: 0, chordId: 'min7', bassPc: 10 });
  assert.equal(chordSymbol(0, 'min7', true, 10), 'Cm7/Bb');
  const slash = buildVoicedChord(60, 'maj', { bassPc: 7 });
  assert.equal(((slash[0] % 12) + 12) % 12, 7);
  assert.ok(slash[0] < 60);
  assert.equal(parseChordSymbol('not a chord'), null);
});

test('reading played chords, in any inversion', () => {
  const k = { tonic: 0, scale: 'major' };
  assert.equal(identifyPlayedChord([60, 64, 67], k)?.chordId, 'maj');
  const inv = identifyPlayedChord([64, 67, 72], k)!;
  assert.equal(inv.rootPc, 0);
  assert.equal(inv.degree, 0);
  assert.equal(identifyPlayedChord([61, 65, 68], k)?.degree, null, 'Db is outside C major');
});

test('chord history groups notes and skips repeats', () => {
  const k = { tonic: 0, scale: 'major' };
  const h = chordHistory([
    { startBeats: 0, key: 60 }, { startBeats: 0, key: 64 }, { startBeats: 0, key: 67 },
    { startBeats: 2, key: 60 }, { startBeats: 2, key: 64 }, { startBeats: 2, key: 67 },
    { startBeats: 4, key: 65 }, { startBeats: 4, key: 69 }, { startBeats: 4, key: 72 },
  ], k);
  assert.deepEqual(h.map((c) => c.degree), [0, 3]);
});

const degOf = (s: { id: string }) => (s.id.startsWith('d') ? Number(s.id.slice(1)) : -1);

test('next chord: V wants home; a fresh song starts at home', () => {
  const k = { tonic: 0, scale: 'major' };
  const afterV = suggestNextChords(k, [{ rootPc: 7, chordId: 'maj', degree: 4 }]);
  assert.equal(degOf(afterV[0]), 0);
  assert.equal(afterV[0].symbol, 'C');
  assert.equal(degOf(suggestNextChords(k, [])[0]), 0);
});

test('next chord: ii goes to V (the ii–V–I), and a known progression is named', () => {
  const k = { tonic: 0, scale: 'major' };
  const afterII = suggestNextChords(k, [{ rootPc: 2, chordId: 'min', degree: 1 }]);
  assert.equal(afterII[0].symbol, 'G');
  const pop = suggestNextChords(k, [{ rootPc: 0, chordId: 'maj', degree: 0 }, { rootPc: 7, chordId: 'maj', degree: 4 }, { rootPc: 9, chordId: 'min', degree: 5 }]);
  assert.equal(pop[0].symbol, 'F', 'I–V–vi leads to IV');
  assert.equal(pop[0].kind, 'progression');
  assert.match(pop[0].why, /four chords/i);
});

test('next chord: minor keys answer in minor', () => {
  const k = { tonic: 9, scale: 'minor' };
  const s = suggestNextChords(k, [{ rootPc: 9, chordId: 'min', degree: 0 }], { colour: false });
  assert.ok(s.length >= 3);
  assert.ok(s.every((x) => x.symbol !== 'Am'), 'not the chord just played');
  assert.ok(s.some((x) => x.symbol === 'Dm' || x.symbol === 'F'));
});

test('next chord: colour moves are offered last and are labelled', () => {
  const s = suggestNextChords({ tonic: 0, scale: 'major' }, [{ rootPc: 0, chordId: 'maj', degree: 0 }]);
  const firstColour = s.findIndex((x) => x.kind === 'colour');
  assert.ok(firstColour > 0);
  assert.ok(s.slice(firstColour).every((x) => x.kind === 'colour'));
  assert.ok(s.some((x) => x.roman === 'iv'));
  assert.ok(s.some((x) => x.roman.startsWith('V7/')));
});

test('next chord: every scale gets playable suggestions', () => {
  for (const sc of SCALES) {
    if (sc.id === 'chromatic') continue;
    const s = suggestNextChords({ tonic: 2, scale: sc.id }, [{ rootPc: 2, chordId: null, degree: 0 }]);
    assert.ok(s.length > 0, sc.id);
    for (const x of s) assert.ok(suggestionKeys(x, 60).length >= 2, `${sc.id} ${x.symbol}`);
  }
});

test('an inserted chord sits in the register around it', () => {
  const keys = suggestionKeys({ rootPc: 7, intervals: [0, 4, 7] }, 60);
  assert.ok(keys.every((k) => k >= 48 && k <= 76), String(keys));
  assert.equal(((keys[0] % 12) + 12) % 12, 7);
});
