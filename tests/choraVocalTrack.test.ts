import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSongPrompt } from '../services/melos/direct/songPrompt';
import { compileSongBrief } from '../services/melos/direct/songBrief';
import { VOICES, markRendered, vocalGuideNotes } from '../services/melos/direct/vocalScore';
import {
  applyVocalNoteEdit,
  applyVocalPhraseDelivery,
  applyVocalPhraseMove,
  applyVocalPhraseRetext,
  applyVocalPhraseSplit,
  ensureVocalLayer,
  getVocalStaleSummary,
  vocalNotesToMidiClipNotes,
} from '../services/melos/direct/vocalTimeline';

const SONG = `deep house, 122 bpm, F minor, female vocal

[Verse 1]
City lights are calling out my name
I keep on running from the flame

[Chorus]
Hold me in the moment
Never let it fade away`;

function makeBrief() {
  return compileSongBrief(parseSongPrompt(SONG));
}

test('ensureVocalLayer creates from brief when missing/empty and preserves valid existing layer', () => {
  const brief = makeBrief();
  const created = ensureVocalLayer(brief, null);
  assert.equal(created.phrases.length, 4);
  assert.equal(created.voice.id, VOICES.female.id);

  // Empty phrases array triggers fresh layout
  const fromEmpty = ensureVocalLayer(brief, { ...created, phrases: [] }, VOICES.male);
  assert.equal(fromEmpty.phrases.length, 4);
  assert.equal(fromEmpty.voice.id, VOICES.male.id);

  // Valid existing layer is returned as-is
  const preserved = ensureVocalLayer(brief, created, VOICES.male);
  assert.strictEqual(preserved, created);
});

test('inline retext, move, note edit, delivery, and split mark only affected phrases stale', () => {
  const brief = makeBrief();
  const initial = ensureVocalLayer(brief);
  const allIds = initial.phrases.map((p) => p.id);
  const rendered = markRendered(initial, allIds, { sampleKey: 'melos/beats/samples/v1', engine: 'acestep' });
  assert.ok(rendered.phrases.every((p) => p.take.status === 'fresh'));

  // 1. Retext phrase 0 only
  const p0 = rendered.phrases[0];
  const retexted = applyVocalPhraseRetext(rendered, p0.id, 'Neon signs are calling out my name');
  assert.equal(retexted.phrases[0].take.status, 'stale');
  assert.equal(retexted.phrases[1].take.status, 'fresh');
  assert.equal(retexted.phrases[2].take.status, 'fresh');

  // 2. Move phrase 1 forward by 0.5b (clamped at >= 0)
  const p1 = rendered.phrases[1];
  const moved = applyVocalPhraseMove(rendered, p1.id, 0.5);
  assert.equal(moved.phrases[1].startBeats, p1.startBeats + 0.5);
  assert.equal(moved.phrases[1].take.status, 'stale');
  assert.equal(moved.phrases[0].take.status, 'fresh');

  // Moving earlier than 0 clamps to 0
  const clamped = applyVocalPhraseMove(rendered, p0.id, -9999);
  assert.equal(clamped.phrases[0].startBeats, 0);

  // 3. Edit a single note on phrase 2
  const p2 = rendered.phrases[2];
  const targetNote = p2.notes[0];
  const repitched = applyVocalNoteEdit(rendered, p2.id, targetNote.id, { key: targetNote.key + 2 });
  assert.equal(repitched.phrases[2].notes[0].key, targetNote.key + 2);
  assert.equal(repitched.phrases[2].take.status, 'stale');
  assert.equal(repitched.phrases[0].take.status, 'fresh');
  assert.equal(repitched.phrases[3].take.status, 'fresh');

  // 4. Delivery update on phrase 3
  const p3 = rendered.phrases[3];
  const delivered = applyVocalPhraseDelivery(rendered, p3.id, ['belted']);
  assert.deepEqual(delivered.phrases[3].delivery, ['belted']);
  assert.equal(delivered.phrases[3].take.status, 'stale');
  assert.equal(delivered.phrases[0].take.status, 'fresh');

  // 5. Split phrase 0 at its second note
  assert.ok(p0.notes.length >= 2);
  const split = applyVocalPhraseSplit(rendered, p0.id, p0.notes[1].id);
  assert.equal(split.phrases.length, rendered.phrases.length + 1);
  assert.equal(split.phrases[0].take.status, 'stale');
  assert.equal(split.phrases[1].take.status, 'stale');
  assert.equal(split.phrases[2].take.status, 'fresh');
});

test('getVocalStaleSummary returns stale regions, regen requests, stale phrase IDs, and guide notes', () => {
  const brief = makeBrief();
  const initial = ensureVocalLayer(brief);
  const rendered = markRendered(
    initial,
    initial.phrases.map((p) => p.id),
    { sampleKey: 'melos/beats/samples/v1', engine: 'acestep' },
  );

  const freshSummary = getVocalStaleSummary(rendered, brief);
  assert.equal(freshSummary.staleRegions.length, 0);
  assert.equal(freshSummary.requests.length, 0);
  assert.equal(freshSummary.stalePhraseIds.size, 0);
  assert.equal(freshSummary.guideNotes.length, vocalGuideNotes(rendered).length);

  const edited = applyVocalPhraseRetext(rendered, rendered.phrases[1].id, 'Running through the night again');
  const dirtySummary = getVocalStaleSummary(edited, brief);
  assert.equal(dirtySummary.staleRegions.length, 1);
  assert.equal(dirtySummary.requests.length, 1);
  assert.ok(dirtySummary.stalePhraseIds.has(edited.phrases[1].id));
  assert.ok(!dirtySummary.stalePhraseIds.has(edited.phrases[0].id));
  assert.equal(dirtySummary.requests[0].bpm, brief.bpm);
  assert.equal(dirtySummary.requests[0].lyrics, edited.phrases[1].text);
});

test('vocalNotesToMidiClipNotes converts guide notes with unique IDs and sorted startBeats', () => {
  const brief = makeBrief();
  const layer = ensureVocalLayer(brief);
  const guide = vocalGuideNotes(layer);
  const clipNotes = vocalNotesToMidiClipNotes(layer);

  assert.equal(clipNotes.length, guide.length);
  assert.ok(clipNotes.length > 0);
  const ids = new Set(clipNotes.map((n) => n.id));
  assert.equal(ids.size, clipNotes.length);

  for (let i = 0; i < clipNotes.length; i++) {
    assert.equal(clipNotes[i].startBeats, guide[i].startBeats);
    assert.equal(clipNotes[i].lengthBeats, guide[i].lengthBeats);
    assert.equal(clipNotes[i].key, guide[i].key);
    assert.equal(clipNotes[i].vel, guide[i].vel);
    if (i > 0) {
      assert.ok(clipNotes[i].startBeats >= clipNotes[i - 1].startBeats);
    }
  }
});
