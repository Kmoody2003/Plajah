// Melos Beats phase 5: score model (measures, ties, triplets, spelling, staves) and MusicXML
// round-trips (.musicxml + .mxl). Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { MeterMap } from '../services/melos/beats/tempoMap';
import { buildScore, keyFifths, spell } from '../services/melos/beats/notation/scoreModel';
import { exportMusicXml, importMusicXml, musicXmlText, parseXml } from '../services/melos/beats/notation/musicXml';
import type { NoteEvent } from '../services/melos/beats/grooveDoc';

const n = (start: number, len: number, key: number, id = `n${start}-${key}`): NoteEvent => ({ id, startBeats: start, lengthBeats: len, key, vel: 100 });
const m44 = MeterMap.fromDoc({});
const build = (notes: NoteEvent[], to = 4, key: { tonic: number; scale: string } | null = null, meter = m44) =>
  buildScore(notes, { meter, songOffset: 0, fromContent: 0, toContent: to, key });

test('quarters in 4/4: one treble bar, four quarter notes', () => {
  const sc = build([n(0, 1, 60), n(1, 1, 62), n(2, 1, 64), n(3, 1, 65)]);
  assert.deepEqual(sc.clefs, ['treble']);
  assert.equal(sc.measures.length, 1);
  assert.deepEqual(sc.measures[0].elements.map((e) => [e.type, e.rest, e.notes.map((x) => x.step).join('')]), [
    ['quarter', false, 'C'], ['quarter', false, 'D'], ['quarter', false, 'E'], ['quarter', false, 'F'],
  ]);
});

test('a note across the bar line is tied; rests fill the gaps', () => {
  const sc = build([n(3, 2, 67)], 8);
  const [a, b] = sc.measures;
  assert.deepEqual(a.elements.map((e) => [e.type, e.dots, e.rest]), [['half', 1, true], ['quarter', 0, false]]);
  assert.ok(a.elements[1].notes[0].tieStart);
  assert.ok(b.elements[0].notes[0].tieStop && !b.elements[0].notes[0].tieStart);
  assert.equal(b.elements[0].type, 'quarter');
  assert.deepEqual(b.elements.slice(1).map((e) => [e.type, e.dots, e.rest]), [['half', 1, true]]);
});

test('triplet eighths are notated as a triplet group', () => {
  const sc = build([n(0, 1 / 3, 60), n(1 / 3, 1 / 3, 62), n(2 / 3, 1 / 3, 64), n(1, 3, 65)]);
  const els = sc.measures[0].elements;
  assert.deepEqual(els.slice(0, 3).map((e) => [e.type, !!e.triplet]), [['eighth', true], ['eighth', true], ['eighth', true]]);
  assert.ok(els[0].triplet?.start && els[2].triplet?.stop);
  assert.equal(els[3].type, 'half'); assert.equal(els[3].dots, 1);
});

test('spelling follows the key; accidentals carry through the bar', () => {
  assert.deepEqual(keyFifths({ tonic: 5, scale: 'major' }), { fifths: -1, minor: false }); // F major
  assert.deepEqual(keyFifths({ tonic: 9, scale: 'minor' }), { fifths: 0, minor: true });   // A minor
  assert.deepEqual(keyFifths({ tonic: 2, scale: 'dorian' }), { fifths: 0, minor: true });  // D dorian
  assert.deepEqual(spell(70, -1), { step: 'B', alter: -1, octave: 4 });
  assert.deepEqual(spell(61, 2), { step: 'C', alter: 1, octave: 4 });
  const sc = build([n(0, 1, 70), n(1, 1, 71), n(2, 1, 71), n(3, 1, 70)], 4, { tonic: 5, scale: 'major' });
  assert.deepEqual(sc.measures[0].elements.map((e) => e.notes[0].accidental ?? null), [null, 'natural', null, 'flat']);
});

test('a wide line gets a grand staff split at middle C; chords group', () => {
  const sc = build([n(0, 4, 48), n(0, 4, 72), n(0, 4, 76)]);
  assert.deepEqual(sc.clefs, ['treble', 'bass']);
  const top = sc.measures[0].elements.filter((e) => e.staff === 0);
  assert.equal(top[0].type, 'whole');
  assert.equal(top[0].notes.length, 2);
  assert.equal(sc.measures[0].elements.filter((e) => e.staff === 1)[0].notes[0].midi, 48);
});

test('6/8 bars are 3 beats', () => {
  const m68 = MeterMap.fromDoc({ meter: [{ bar: 0, num: 6, den: 8 }] });
  const sc = build([n(0, 1.5, 60), n(1.5, 1.5, 62)], 6, null, m68);
  assert.equal(sc.measures.length, 2);
  assert.deepEqual(sc.measures[0].elements.map((e) => [e.type, e.dots]), [['quarter', 1], ['quarter', 1]]);
});

test('MusicXML round-trip: notes, ties, triplets, tempo, meter and key survive', () => {
  const notes = [n(0, 1, 60), n(1, 0.5, 64), n(1.5, 0.5, 67), n(2, 1 / 3, 72), n(2 + 1 / 3, 1 / 3, 71), n(2 + 2 / 3, 1 / 3, 69), n(3, 2, 65), n(5, 3, 48)];
  const xml = exportMusicXml([{ name: 'Keys', notes }], { title: 'Round & Trip', bpm: 96, meter: m44, key: { tonic: 7, scale: 'major' }, lengthBeats: 8 });
  assert.ok(xml.includes('<fifths>1</fifths>') && xml.includes('<staves>2</staves>') && xml.includes('<tuplet type="start"'));
  const back = importMusicXml(xml);
  assert.equal(back.title, 'Round & Trip');
  assert.equal(back.bpm, 96);
  assert.deepEqual(back.key, { tonic: 7, scale: 'major' });
  assert.deepEqual(back.meter, [{ bar: 0, num: 4, den: 4 }]);
  const got = back.parts[0].notes.map((x) => [+x.startBeats.toFixed(3), +x.lengthBeats.toFixed(3), x.key]);
  const want = notes.map((x) => [+x.startBeats.toFixed(3), +x.lengthBeats.toFixed(3), x.key]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(got.sort((a, b) => a[0] - b[0] || a[2] - b[2]), want.sort((a, b) => a[0] - b[0] || a[2] - b[2]));
});

test('.mxl container import and the XML parser basics', () => {
  const xml = exportMusicXml([{ name: 'Lead', notes: [n(0, 4, 67)] }], { title: 'Zipped', bpm: 120, meter: m44, key: null, lengthBeats: 4 });
  const zip = zipSync({
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>'),
    'score.musicxml': strToU8(xml),
  });
  const back = importMusicXml(musicXmlText(zip));
  assert.equal(back.parts[0].name, 'Lead');
  assert.deepEqual(back.parts[0].notes.map((x) => [x.startBeats, x.lengthBeats, x.key]), [[0, 4, 67]]);
  const t = parseXml('<!-- c --><a x="1 &amp; 2"><b>hi &lt;3</b><c/></a>');
  assert.equal(t.children[0].attrs.x, '1 & 2');
  assert.equal(t.children[0].children[0].text, 'hi <3');
  assert.throws(() => importMusicXml('<html/>'));
});

test('triplets on one staff do not chop the other staff', () => {
  const sc = build([n(0, 1 / 3, 72), n(1 / 3, 1 / 3, 74), n(2 / 3, 1 / 3, 72), n(1, 3, 70), n(0, 4, 46)]);
  const bass = sc.measures[0].elements.filter((e) => e.staff === 1);
  assert.deepEqual(bass.map((e) => [e.type, !!e.triplet]), [['whole', false]]);
});
