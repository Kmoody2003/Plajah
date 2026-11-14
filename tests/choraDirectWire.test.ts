// Pure TypeScript tests for Phase 2 (`services/melos/direct/applyBriefToDoc.ts`).

import test from 'node:test';
import assert from 'node:assert/strict';
import type { GrooveDoc } from '../services/melos/beats/grooveDoc';
import { parseSongPrompt } from '../services/melos/direct/songPrompt';
import { compileSongBrief } from '../services/melos/direct/songBrief';
import { applyBriefToDoc, buildBriefStudioHandoffs } from '../services/melos/direct/applyBriefToDoc';
import { parseChart } from '../services/melos/beats/band/chords';

test('applyBriefToDoc: populates GrooveDoc bpm, key, meter, sections, lyrics, and Session Band chart from SongBrief', () => {
  const brief = compileSongBrief(
    parseSongPrompt(
      [
        'Title: Midnight Rain',
        'viennese waltz, 3/4, D major',
        '[Intro | 4 bars | p]',
        '[Theme | 8 bars | mp]',
        'Lanterns glowing on the river stone',
      ].join('\n'),
    ),
  );

  const doc = {
    id: 'doc-1',
    name: 'Untitled',
    bpm: 120,
    scenes: [{ id: 'sc-main', name: 'Main' }],
    arrangement: [],
    patterns: [],
    kit: [],
    tempoMap: [{ beat: 0, bpm: 120 }, { beat: 8, bpm: 100 }],
  } as unknown as GrooveDoc;

  applyBriefToDoc(doc, brief);

  assert.equal(doc.name, 'Midnight Rain');
  assert.equal(doc.bpm, brief.bpm);
  assert.equal(doc.tempoMap, undefined);
  assert.deepEqual(doc.key, { tonic: 2, scale: 'major' });
  assert.deepEqual(doc.meter, [{ bar: 0, num: 3, den: 4 }]);
  assert.equal(doc.sections?.length, 2);
  assert.equal(doc.sections?.[0].bars, 4);
  assert.equal(doc.sections?.[1].name, 'Theme');
  assert.equal(doc.lyrics?.length, 1);
  assert.equal(doc.lyrics?.[0].bar, 4);
  assert.equal(doc.lyrics?.[0].text, 'Lanterns glowing on the river stone');
  assert.ok(doc.band?.genre);
  assert.ok(doc.band?.chart && parseChart(doc.band.chart) !== null);
});

test('buildBriefStudioHandoffs: produces council grounding, band chart, and Music Lab render request from one brief', () => {
  const brief = compileSongBrief(
    parseSongPrompt(
      [
        'deep house, 122 bpm, F minor',
        '[Intro | 4 bars | mp]',
        '[Drop | 8 bars | ff]',
        'City lights are calling out my name',
      ].join('\n'),
    ),
  );

  const handoffs = buildBriefStudioHandoffs(brief, { sectionId: 's2' });
  assert.match(handoffs.councilDescription, /STYLE: Deep house/);
  assert.match(handoffs.councilDescription, /122 BPM/);
  assert.equal(handoffs.bandGenre, brief.pack.bandGenre);
  assert.ok(parseChart(handoffs.bandChart) !== null);
  assert.equal(handoffs.musicLab.bpm, 122);
  assert.equal(handoffs.musicLab.key, 'F minor');
  assert.match(handoffs.musicLab.lyrics, /City lights are calling out my name/);
});
