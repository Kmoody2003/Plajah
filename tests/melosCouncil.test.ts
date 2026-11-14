// Chora Studio phase 7: the composer council's pure half — context packet, rules arranger, the
// note-line format small on-device models write, validator, critic checks, repair and apply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type ArrangeTrack, type GrooveDoc, type NoteEvent } from '../services/melos/beats/grooveDoc';
import { buildComposeContext, syllables, guessRole } from '../services/melos/beats/council/composeContext';
import { applyComposition, critiqueComposition, validateComposition, type Composition } from '../services/melos/beats/council/composeCouncil';
import { readMood, regionChords, arrangeRole, voiceChord } from '../services/melos/beats/council/rulesArranger';
import { parseNoteLines, partPrompt, toLines } from '../services/melos/beats/council/noteLines';
import { repairComposition } from '../services/melos/beats/council/councilRepair';

let n = 0;
const uid = () => `id${++n}`;
const note = (startBeats: number, lengthBeats: number, key: number, vel = 90): NoteEvent => ({ id: uid(), startBeats, lengthBeats, key, vel });

function instrumentTrack(name: string, notes: NoteEvent[], startBeats = 0, lengthBeats = 16): ArrangeTrack {
  return {
    id: uid(), kind: 'instrument', name, color: '#888', mute: false, solo: false, gainDb: 0, pan: 0,
    instrument: { type: 'onda', patch: {} },
    clips: [{ id: uid(), startBeats, lengthBeats, notes }],
  };
}

/** C major: bars 1–2 = C, bars 3–4 = F (keys), lyrics on bars 1 and 3, bass under it. */
function song(): { doc: GrooveDoc; keys: ArrangeTrack; bass: ArrangeTrack } {
  const doc = newGrooveDoc('u', 'Window Light');
  doc.arrangement = [];
  doc.key = { tonic: 0, scale: 'major' };
  const keys = instrumentTrack('Keys', [
    note(0, 8, 60), note(0, 8, 64), note(0, 8, 67),
    note(8, 8, 60), note(8, 8, 65), note(8, 8, 69),
  ]);
  const bass = instrumentTrack('Bass', [note(0, 8, 36), note(8, 8, 41)]);
  doc.arrangement.push(keys, bass);
  doc.lyrics = [
    { id: 'l1', bar: 0, text: 'Light through a cold window' },
    { id: 'l2', bar: 2, text: 'I keep the morning' },
    { id: 'l3', bar: 6, text: 'Later line outside' },
  ];
  return { doc, keys, bass };
}

test('syllables and role guesses', () => {
  assert.equal(syllables('Light through a cold window'), 6);
  assert.equal(syllables('I keep the morning'), 5);
  assert.equal(syllables('little apple'), 4);
  assert.equal(guessRole('Bass', []), 'bass');
  assert.equal(guessRole('Synth 3', [[0, 1, 40, 90]]), 'bass');
  assert.equal(guessRole('Synth 3', [[0, 1, 60, 90], [0, 1, 64, 90], [0, 1, 67, 90]]), 'harmony');
});

test('context: bars with implied chords, lyrics on their bars, notes relative to the region', () => {
  const { doc, keys } = song();
  const ctx = buildComposeContext(doc, { description: 'hopeful', startBeats: 4, endBeats: 12, targets: [{ role: 'melody' }, { trackId: keys.id, role: 'harmony' }] });
  assert.equal(ctx.region.startBar, 2);
  assert.equal(ctx.region.endBar, 3);
  assert.equal(ctx.region.beats, 8);
  assert.equal(ctx.song.key, 'C major');
  const bar = (b: number) => ctx.bars.find((x) => x.bar === b)!;
  assert.equal(bar(1).inRegion, false);
  assert.equal(bar(2).inRegion, true);
  assert.equal(bar(1).at, -4);
  // The keys track is being rewritten, so the chords come from the bass alone (C, F roots).
  assert.ok(bar(2).chord?.startsWith('C'), bar(2).chord);
  assert.ok(bar(3).chord?.startsWith('F'), bar(3).chord);
  assert.equal(bar(3).lyric, 'I keep the morning');
  const keysCtx = ctx.tracks.find((t) => t.id === keys.id)!;
  assert.equal(keysCtx.target, true);
  assert.deepEqual(keysCtx.notes![0], [-4, 8, 60, 90]);
  assert.deepEqual(ctx.lyrics.map((l) => l.inRegion), [false, true, false]);
  assert.deepEqual(ctx.request.targetLabels.map((l) => l.split(' ')[0]), ['new:0', keys.id]);
  assert.deepEqual(bar(3).chordPcs?.[0], 5);   // F root first
});

test('mood words steer energy, colour and lift', () => {
  const calm = readMood('hopeful but held back, gentle — lift on the last line');
  assert.ok(calm.energy < 0.45 && calm.brightness > 0.5 && calm.lift > 0.4);
  const hard = readMood('dark driving drill');
  assert.ok(hard.energy > 0.6 && hard.brightness < 0.4);
});

test('rules arranger: bass on roots, voice-led chords, a progression when the song is silent', () => {
  const { doc } = song();
  const ctx = buildComposeContext(doc, { description: 'calm', startBeats: 0, endBeats: 16, targets: [{ role: 'bass' }] });
  const mood = readMood('calm');
  const chords = regionChords(ctx, mood);
  assert.deepEqual(chords.map((c) => c.pcs[0]), [0, 0, 5, 5]);
  const bass = arrangeRole('bass', ctx, chords, mood);
  assert.deepEqual(bass.map((n) => n.pitch % 12), [0, 0, 5, 5]);
  assert.ok(bass.every((n) => n.pitch >= 28 && n.pitch <= 52));
  // Voice leading: C → F moves by small steps, not a block jump.
  const c = voiceChord([0, 4, 7], 60), f = voiceChord([5, 9, 0], 60, c);
  assert.ok(f.reduce((s, x, i) => s + Math.abs(x - c[i]), 0) <= 5, `${c} → ${f}`);
  // An empty song in A minor still gets chords (a minor-key progression).
  const empty = newGrooveDoc('u'); empty.arrangement = []; empty.key = { tonic: 9, scale: 'minor' };
  const ectx = buildComposeContext(empty, { description: 'dark', startBeats: 0, endBeats: 16, targets: [{ role: 'harmony' }] });
  const ech = regionChords(ectx, readMood('dark'));
  assert.equal(ech.length, 4);
  assert.equal(ech[0].pcs[0], 9);
  const harmony = arrangeRole('harmony', ectx, ech, readMood('dark'));
  assert.ok(harmony.length >= 12);
});

test('note lines: the prompt carries chords + syllables; the parser forgives prose and fences', () => {
  const { doc } = song();
  const ctx = buildComposeContext(doc, { description: 'tender', startBeats: 0, endBeats: 16, targets: [{ role: 'melody' }] });
  const { user } = partPrompt(ctx, 'melody');
  assert.match(user, /bar 1: 4 beats, chord C.*"Light through a cold window" \(6 syllables\)/);
  assert.match(user, /SUNG/);
  const notes = parseNoteLines([
    'Here is the melody:', '```', '1 1 1 A4', '1 2 0.5 C#5', 'bar 1, beat 2.5, 1/2, Bb4', '- 2 1 2 F#3', '9 1 1 C4', '3 7 1 C4', 'nonsense', '```',
  ].join(String.fromCharCode(10)), ctx);
  assert.deepEqual(notes.map((n) => [n.start, n.length, n.pitch]), [[0, 1, 69], [1, 0.5, 73], [1.5, 0.5, 70], [4, 2, 54]]);
  // Round trip.
  assert.deepEqual(parseNoteLines(toLines(ctx, notes).join(String.fromCharCode(10)), ctx).map((n) => n.pitch), [69, 73, 70, 54]);
});

test('repair: folds range, fixes key and rubs, fits words, un-doubles, shapes dynamics', () => {
  const { doc } = song();
  const ctx = buildComposeContext(doc, { description: '', startBeats: 0, endBeats: 16, targets: [{ role: 'melody' }, { role: 'counter-melody' }] });
  const draft: Composition = {
    brief: '', lyricReading: '', critique: '',
    parts: [
      { target: 'new:0', name: 'Lead', role: 'melody', instrument: 'cantus', intent: '', notes: [
        { start: 0, length: 4, pitch: 91, velocity: 80 },                 // too high, one note for six syllables
        { start: 8, length: 2, pitch: 61, velocity: 80 },                 // C# out of key and rubbing on the downbeat
        { start: 10, length: 2, pitch: 64, velocity: 80 },
      ] },
      // A one-voice line that just traces the keys' top note.
      { target: 'new:1', name: 'Counter', role: 'counter-melody', instrument: 'onda', intent: '', notes: [
        { start: 0, length: 4, pitch: 67, velocity: 70 }, { start: 4, length: 4, pitch: 67, velocity: 72 },
        { start: 8, length: 4, pitch: 69, velocity: 74 }, { start: 12, length: 4, pitch: 69, velocity: 70 },
      ] },
    ],
  };
  const { composition, fixes } = repairComposition(validateComposition(draft, ctx), ctx);
  const lead = composition.parts[0].notes;
  assert.ok(lead.every((n) => n.pitch >= 48 && n.pitch <= 79), JSON.stringify(lead));
  assert.ok(lead.every((n) => [0, 2, 4, 5, 7, 9, 11].includes(n.pitch % 12)));
  const line1 = lead.filter((n) => n.start < 8);
  assert.ok(line1.length >= 5, `line 1 has ${line1.length} notes`);
  const counter = composition.parts[1].notes;
  const keysAt = (t: number) => (t < 8 ? [60, 64, 67] : [60, 65, 69]);
  assert.equal(counter.filter((n) => keysAt(n.start).includes(n.pitch)).length, 0, JSON.stringify(counter));
  const msgs = fixes.map((f) => f.message).join(String.fromCharCode(10));
  assert.match(msgs, /singable range/);
  assert.match(msgs, /fitted "Light through a cold window"/);
  assert.match(msgs, /doubled Keys/);
});

test('validator: unknown targets dropped, notes quantized into the region, self-overlaps trimmed', () => {
  const { doc } = song();
  const ctx = buildComposeContext(doc, { description: '', startBeats: 0, endBeats: 8, targets: [{ role: 'melody' }] });
  const comp = validateComposition({
    brief: 'b', lyricReading: '', critique: 'c',
    parts: [
      { target: 'new:7', name: 'x', role: 'melody', instrument: 'onda', intent: '', notes: [{ start: 0, length: 1, pitch: 60, velocity: 80 }] },
      { target: 'new:0', name: 'Lead', role: 'melody', instrument: 'cantus', intent: 'sing', notes: [
        { start: 0.01, length: 2, pitch: 72, velocity: 90 },
        { start: 1, length: 1, pitch: 72, velocity: 90 },       // overlaps the first 72
        { start: 7.5, length: 4, pitch: 74, velocity: 200 },    // runs past the end; velocity too high
        { start: 9, length: 1, pitch: 76, velocity: 90 },       // outside the region
        { start: 2, length: 1, pitch: 300, velocity: 90 },      // impossible pitch
      ] },
    ],
  }, ctx);
  assert.equal(comp.parts.length, 1);
  const notes = comp.parts[0].notes;
  assert.deepEqual(notes.map((x) => [x.start, x.length, x.pitch, x.velocity]), [[0, 1, 72, 90], [1, 1, 72, 90], [7.5, 0.5, 74, 127]]);
  assert.throws(() => validateComposition({ parts: [] }, ctx));
});

test('critic: range, clashes, doubling and words-vs-notes findings', () => {
  const { doc, keys } = song();
  const ctx = buildComposeContext(doc, { description: '', startBeats: 0, endBeats: 16, targets: [{ role: 'melody' }, { role: 'counter-melody' }] });
  const comp: Composition = {
    brief: '', lyricReading: '', critique: '',
    parts: [
      // Sung melody: two notes for a six-syllable line, one far too high, rubbing against the keys.
      { target: 'new:0', name: 'Lead', role: 'melody', instrument: 'cantus', intent: '', notes: [
        { start: 0, length: 2, pitch: 61, velocity: 90 }, { start: 2, length: 2, pitch: 61, velocity: 90 },
        { start: 4, length: 2, pitch: 61, velocity: 90 },
        { start: 8, length: 1, pitch: 66, velocity: 90 }, { start: 9, length: 1, pitch: 66, velocity: 90 },
        { start: 10, length: 1, pitch: 67, velocity: 90 }, { start: 11, length: 1, pitch: 69, velocity: 90 },
        { start: 12, length: 4, pitch: 91, velocity: 90 },
      ] },
      // Counter-melody that just doubles the keys' top line.
      { target: 'new:1', name: 'Counter', role: 'counter-melody', instrument: 'onda', intent: '', notes: [
        { start: 0, length: 8, pitch: 67, velocity: 80 }, { start: 8, length: 8, pitch: 69, velocity: 80 },
        { start: 0, length: 8, pitch: 64, velocity: 70 }, { start: 8, length: 8, pitch: 65, velocity: 70 },
      ] },
    ],
  };
  const issues = critiqueComposition(comp, ctx);
  const lead = issues.filter((i) => i.target === 'new:0').map((i) => i.message).join('\n');
  const counter = issues.filter((i) => i.target === 'new:1').map((i) => i.message).join('\n');
  assert.match(lead, /outside the singable range/);
  assert.match(lead, /minor-second rubs/);
  assert.match(lead, /"Light through a cold window" \(bar 1\) has ~6 syllables but the melody gives it 3 notes/);
  assert.match(counter, /double Keys/);
  assert.ok(!issues.some((i) => /no part was written/.test(i.message)));
  assert.ok(keys);
});

test('apply: a rewrite of a busy track lands on a take track under it; new parts get new tracks', () => {
  const { doc, keys } = song();
  const ctx = buildComposeContext(doc, { description: '', startBeats: 0, endBeats: 8, targets: [{ trackId: keys.id, role: 'harmony' }, { role: 'melody' }] });
  const comp = validateComposition({
    brief: '', lyricReading: '', critique: '',
    parts: [
      { target: keys.id, name: 'Keys', role: 'harmony', instrument: 'aura', intent: '', notes: [{ start: 0, length: 4, pitch: 60, velocity: 70 }] },
      { target: 'new:1', name: 'Lead', role: 'melody', instrument: 'cantus', intent: '', notes: [{ start: 0, length: 1, pitch: 67, velocity: 90 }] },
    ],
  }, ctx);
  const made: string[] = [];
  const ids = applyComposition(doc, ctx, comp, {
    uid, takeLabel: 'A',
    createTrack: (d, instrument, name, after) => {
      const t = instrumentTrack(name, []);
      t.clips = [];
      t.instrument = { type: instrument, patch: {} };
      made.push(`${instrument}:${name}`);
      const at = after ? d.arrangement.findIndex((x) => x.id === after.id) + 1 : d.arrangement.length;
      d.arrangement.splice(at, 0, t);
      return t;
    },
  });
  assert.deepEqual(made, ['onda:Keys · take A', 'cantus:Lead · A']);
  assert.equal(doc.arrangement[1].name, 'Keys · take A');     // right under the original
  assert.equal(doc.arrangement[1].instrument?.type, 'onda');  // the original's instrument, copied
  assert.equal(keys.clips.length, 1);                          // the original is untouched
  const take = doc.arrangement[1].clips[0];
  assert.equal(take.startBeats, 0);
  assert.equal(take.lengthBeats, 8);
  // The part as written, played in by the band (feel moves timing and dynamics a little, never the notes).
  assert.deepEqual(take.notes!.map((x) => x.key), [60]);
  assert.ok(Math.abs(take.notes![0].startBeats) < 0.05 && Math.abs(take.notes![0].lengthBeats - 4) < 0.05);
  assert.ok(Math.abs(take.notes![0].vel - 70) <= 20);
  assert.equal(ids.length, 2);
});

test('earlier council takes are alternatives: not chords, not clashes, not doubling', () => {
  const { doc } = song();
  const takeA = instrumentTrack('Lead · A', [note(0, 4, 61), note(4, 4, 62)]);
  takeA.clips[0].generativeEngine = 'local-council:rules';
  doc.arrangement.push(takeA);
  const ctx = buildComposeContext(doc, { description: '', startBeats: 0, endBeats: 16, targets: [{ role: 'melody' }] });
  assert.equal(ctx.tracks.find((t) => t.id === takeA.id)?.councilTake, true);
  assert.ok(ctx.bars.find((b) => b.bar === 1)?.chord?.startsWith('C'));   // C# from take A ignored
  const comp = validateComposition({ brief: '', lyricReading: '', critique: '', parts: [
    { target: 'new:0', name: 'Lead', role: 'melody', instrument: 'cantus', intent: '', notes: [{ start: 0, length: 4, pitch: 61, velocity: 80 }, { start: 4, length: 4, pitch: 62, velocity: 80 }] },
  ] }, ctx);
  const { fixes } = repairComposition(comp, ctx);
  assert.ok(!fixes.some((f) => /doubled Lead/.test(f.message)));
});

test('repair: a melody is one voice, and the words are fitted after the stacks are gone', () => {
  const { doc } = song();
  const ctx = buildComposeContext(doc, { description: '', startBeats: 0, endBeats: 16, targets: [{ role: 'melody' }] });
  const comp = validateComposition({ brief: '', lyricReading: '', critique: '', parts: [
    { target: 'new:0', name: 'Lead', role: 'melody', instrument: 'cantus', intent: '', notes: [
      { start: 0, length: 1, pitch: 62, velocity: 80 }, { start: 0, length: 1, pitch: 64, velocity: 80 },
      { start: 1, length: 0.5, pitch: 76, velocity: 80 }, { start: 1, length: 0.5, pitch: 88, velocity: 80 },
      { start: 1.5, length: 2, pitch: 76, velocity: 80 },
    ] },
  ] }, ctx);
  const { composition, fixes } = repairComposition(comp, ctx);
  const line1 = composition.parts[0].notes.filter((n) => n.start < 8);
  const starts = line1.map((n) => n.start);
  assert.equal(new Set(starts).size, starts.length, 'one note per start');
  assert.ok(line1.length >= 5, `line 1 has ${line1.length} notes`);
  assert.match(fixes.map((f) => f.message).join(' '), /one voice/);
});
