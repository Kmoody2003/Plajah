// Mastering Desk release logic: Red Book identifiers, side balancing, CUE/PQ output, the
// physical checks, and Music Intelligence corrections. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoSideBreaks, planSides, isValidUpc, isValidIsrc, formatIsrc, buildCueSheet, buildPqLog, checkPhysical,
  presetById, toFrame, allCredits, creditsToText,
} from '../services/melos/beats/releaseDesk';
import { applyIntelCorrections, type TrackIntel } from '../services/musicIntel/types';
import type { MasterProjectDoc, ProjectTrack } from '../services/melos/beats/masterProject';

const track = (id: string, sec: number, extra: Partial<ProjectTrack> = {}): ProjectTrack => ({
  id, title: `Song ${id}`, sample: { key: id, durationSec: sec } as ProjectTrack['sample'], gainDb: 0, ...extra,
});
const project = (tracks: ProjectTrack[], desk: MasterProjectDoc['desk'] = {}): MasterProjectDoc => ({
  id: 'album', ownerId: 'u', tracks, publishing: { title: 'T', artist: 'A', genre: '', year: '2026', label: '', copyright: '', description: '' },
  version: 1, createdAt: 0, updatedAt: 0, desk,
});
/** Sequential layout with no gaps — enough for the planners. */
const laid = (tracks: ProjectTrack[]) => {
  let t = 0;
  return tracks.map((track) => { const startSec = t; t += track.sample.durationSec; return { track, startSec, endSec: t }; });
};

test('UPC/EAN check digits', () => {
  assert.equal(isValidUpc('036000291452'), true);   // UPC-A
  assert.equal(isValidUpc('036000291453'), false);
  assert.equal(isValidUpc('4006381333931'), true);  // EAN-13
  assert.equal(isValidUpc('12345'), false);
});

test('ISRC format and normalisation', () => {
  assert.equal(isValidIsrc('US-S1Z-99-00001'), true);
  assert.equal(isValidIsrc('USS1Z9900001'), true);
  assert.equal(isValidIsrc('US-S1Z-99-0001'), false);
  assert.equal(formatIsrc('uss1z9900001'), 'US-S1Z-99-00001');
});

test('side breaks balance a running order without re-ordering it', () => {
  // 6 + 6 + 6 | 6 + 6 + 6 minutes → split after the third song
  assert.deepEqual(autoSideBreaks([360, 360, 360, 360, 360, 360], 2), [3]);
  // A long last song pulls the break earlier.
  assert.deepEqual(autoSideBreaks([300, 300, 300, 900], 2), [3]);
  assert.deepEqual(autoSideBreaks([100], 2), []);
  // Four sides of a double LP
  assert.equal(autoSideBreaks([600, 600, 600, 600, 600, 600, 600, 600], 4).length, 3);
});

test('planSides flags an over-long LP side', () => {
  const ts = [track('a', 11 * 60), track('b', 12 * 60), track('c', 5 * 60)];
  const sides = planSides(laid(ts), presetById('vinyl-12-33'), [2]);
  assert.equal(sides.length, 2);
  assert.equal(sides[0].level, 'over');   // 23 min > 22 max
  assert.equal(sides[1].level, 'ok');
});

test('Red Book checks: short track, bad ISRC, UPC', () => {
  const ts = [track('a', 200, { meta: { isrc: 'US-ABC-26-00001' } }), track('b', 3, { meta: { isrc: 'bad' } })];
  const checks = checkPhysical(project(ts, { album: { upc: '036000291453' }, physical: { presetId: 'cd-74' } }), laid(ts), presetById('cd-74'));
  const text = checks.map((c) => `${c.level}:${c.text}`).join('\n');
  assert.match(text, /error:Red Book needs ≥ 4 s per track/);
  assert.match(text, /error:ISRC malformed/);
  assert.match(text, /error:UPC\/EAN check digit is wrong/);
});

test('CUE sheet carries CATALOG, ISRC and frame-accurate indexes', () => {
  const cue = buildCueSheet({
    file: 'A.wav', title: 'Album', performer: 'Artist', upc: '036000291452', cdText: true,
    tracks: [
      { title: 'One', performer: 'Artist', isrc: 'US-S1Z-99-00001', index00: 0, index01: 2 },
      { title: 'Two', performer: 'Artist', index01: 2 + 61.5, subIndexes: [2 + 90] },
    ],
  });
  assert.match(cue, /CATALOG 0036000291452/);
  assert.match(cue, /TRACK 01 AUDIO/);
  assert.match(cue, /ISRC USS1Z9900001/);
  assert.match(cue, /INDEX 00 00:00:00/);
  assert.match(cue, /INDEX 01 00:02:00/);
  assert.match(cue, /INDEX 01 01:03:38/); // 63.5 s = 1:03 + 0.5 s × 75 = 37.5 → 38 frames
  assert.match(cue, /INDEX 02 01:32:00/);
  const pq = buildPqLog({ title: 'Album', performer: 'Artist', tracks: [{ title: 'One', performer: 'A', index01: 2, durationSec: 61.5 }], totalSec: 63.5 });
  assert.match(pq, /01 {2}00:02:00 {2}01:01:38/);
});

test('frame snapping', () => {
  assert.equal(toFrame(1 / 75 * 10.4), 10 / 75);
});

test('credits merge across album and songs, de-duplicated', () => {
  const p = project([
    track('a', 100, { meta: { credits: [{ id: '1', name: 'Kim', role: 'Producer', category: 'producer' }] } }),
    track('b', 100, { meta: { credits: [{ id: '2', name: 'kim ', role: 'producer', category: 'producer' }, { id: '3', name: 'Lee', role: 'Guitar', category: 'performer', instrument: 'Electric' }] } }),
  ], { album: { credits: [{ id: '4', name: 'Ray', role: 'Mastering Engineer', category: 'engineer' }] } });
  const all = allCredits(p);
  assert.equal(all.length, 3);
  assert.match(creditsToText(all), /Guitar \(Electric\) — Lee/);
});

test('intel corrections overlay without touching the analysis', () => {
  const intel = {
    trackId: 't', title: 'x', version: 1, analyzedAt: 0, sourceUrl: '', measured: null, summary: 'old', genreTags: ['pop'],
    mood: { primary: 'sad', secondary: [], valence: 0, arousal: 0 }, emotionalArc: [],
    sections: [{ startSec: 0, endSec: 10, label: 'Intro', description: '' }, { startSec: 10, endSec: 30, label: 'Verse', description: '' }],
    lyrics: { hasVocals: true, themes: [], imagery: [], perspective: '', storyArc: '', craft: '', standoutLines: [] },
    composition: { key: 'C major', tempoBpm: 60, timeSignature: '4/4', harmony: '', melody: '', rhythm: '', arrangement: '', instrumentation: [], chordChart: [] },
    production: { overview: '', techniques: [], vocals: '', lowEnd: '', space: '', dynamics: '' }, hostCards: [], linerNote: '',
  } as TrackIntel;
  const out = applyIntelCorrections(intel, { tempoBpm: 120, key: 'A minor', sectionLabels: { '1': 'Chorus' }, moodPrimary: 'hopeful' });
  assert.equal(out.composition.tempoBpm, 120);
  assert.equal(out.composition.key, 'A minor');
  assert.equal(out.sections[1].label, 'Chorus');
  assert.equal(out.mood.primary, 'hopeful');
  assert.equal(intel.composition.tempoBpm, 60);   // original untouched
  assert.equal(intel.sections[1].label, 'Verse');
});
