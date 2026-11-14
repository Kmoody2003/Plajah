// Chora Session Band — Virtual Musicians' Project Awareness, Audio Ear, Creative Research,
// Fresh-Take & Accompaniment Composer, Timeline Capture, and Consent Gate Tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newGrooveDoc, type GrooveDoc } from '../services/melos/beats/grooveDoc';
import { summarizeStudioContext } from '../services/melos/beats/band/studioContext';
import { analyzeAudioBufferToReference } from '../services/melos/beats/band/audioEar';
import { researchReferenceOffline, researchCreativeReference } from '../services/melos/beats/band/referenceResearch';
import { composeFreshTake, writeFreshTakeToDoc } from '../services/melos/beats/band/freshTake';
import { teacherSystem } from '../services/melos/beats/band/teacherPrompt';
import { askPlayer } from '../services/melos/beats/band/bandMind';
import { playerById } from '../services/melos/beats/band/roster';
import { listPresets } from '../services/melos/beats/presetHub';
import { scalePitchClasses } from '../services/melos/theory';

function makeSongDoc(): GrooveDoc {
  const doc = newGrooveDoc('u_test', 'Midnight Harbour');
  doc.bpm = 96;
  doc.key = { tonic: 2, scale: 'minor' };
  doc.band = { genre: 'jazz', chart: 'Dm7 | G7 | Cmaj7 | A7', seats: {} };
  doc.lyrics = [{ id: 'l1', bar: 0, text: 'Rain against the iron pier' }];
  doc.arrangement.push({
    id: 'tr_tonos',
    kind: 'instrument',
    name: 'TONOS Oud',
    color: '#D4A543',
    mute: false,
    solo: false,
    gainDb: 0,
    pan: 0,
    instrument: { type: 'tonos', patch: {}, presetName: 'Arabic Oud' },
    clips: [{
      id: 'c1',
      startBeats: 0,
      lengthBeats: 8,
      notes: [
        { id: 'n1', startBeats: 0, lengthBeats: 1, key: 62, vel: 96 },
        { id: 'n2', startBeats: 1, lengthBeats: 1, key: 65, vel: 90 },
      ],
    }],
  });
  return doc;
}

function synthMelodyPcm(sampleRate = 44100): Float32Array {
  // 4.0s A minor melodic hum contour: A3 (220Hz), C4 (261.63Hz), E4 (329.63Hz), A4 (440Hz)
  // pulsed at 120 BPM (0.5s notes) with slight amplitude envelope.
  const freqs = [220, 261.6256, 329.6276, 440, 329.6276, 261.6256, 220, 196];
  const noteSec = 0.5;
  const totalSamples = Math.round(sampleRate * freqs.length * noteSec);
  const out = new Float32Array(totalSamples);
  for (let n = 0; n < freqs.length; n++) {
    const start = Math.floor(n * noteSec * sampleRate);
    const end = Math.min(totalSamples, Math.floor((n + 1) * noteSec * sampleRate));
    const f = freqs[n];
    for (let i = start; i < end; i++) {
      const local = (i - start) / sampleRate;
      const env = Math.min(1, local / 0.025) * Math.min(1, (noteSec - local) / 0.05);
      const val = (Math.sin(2 * Math.PI * f * local) * 0.72 + Math.sin(4 * Math.PI * f * local) * 0.2) * env;
      out[i] = val * 0.65;
    }
  }
  return out;
}

test('studioContext summarizes BPM, key, chart, tracks, played chords & lyrics cleanly', () => {
  const doc = makeSongDoc();
  const snap = summarizeStudioContext(doc, {
    trackId: 'tr_tonos',
    recentChords: [{ rootPc: 2, chordId: 'm7', degree: 0 }, { rootPc: 7, chordId: '7', degree: 4 }],
    activeInstrument: 'tonos',
    activePreset: 'Arabic Oud',
  });
  assert.equal(snap.bpm, 96);
  assert.equal(snap.keyTonic, 2);
  assert.equal(snap.tracks.length, 2);
  assert.ok(snap.promptSummary.includes('Midnight Harbour'));
  assert.ok(snap.promptSummary.includes('96 BPM'));
  assert.ok(snap.promptSummary.includes('Arabic Oud'));
  assert.ok(snap.promptSummary.includes('Dm7 | G7 | Cmaj7 | A7'));
  assert.ok(snap.promptSummary.includes('Dm7 -> G7'));
  assert.ok(snap.promptSummary.includes('Rain against the iron pier'));
});

test('audioEar analyzes a hummed melody PCM into key, notes & studied summary', () => {
  const sr = 44100;
  const pcm = synthMelodyPcm(sr);
  const studied = analyzeAudioBufferToReference(pcm, sr, 'mic-hum', 'Test Hum');
  assert.equal(studied.source, 'mic-hum');
  assert.ok(studied.bpm >= 45 && studied.bpm <= 200, `BPM in sane range: ${studied.bpm}`);
  assert.ok(studied.contourNotes.length >= 3, `Expected >= 3 tracked notes, got ${studied.contourNotes.length}`);
  assert.ok(studied.chords.length >= 1, 'Recognized chord progression from audio');
  assert.ok(studied.summary.includes('BPM'));
});

test('referenceResearch resolves books, films, and genres to real Chora presets offline', async () => {
  const dune = researchReferenceOffline('Dune desert epic', { activeInstrument: 'tonos' });
  assert.equal(dune.category, 'book');
  assert.ok(dune.bpm >= 60 && dune.bpm <= 140);
  assert.ok(dune.recommendedPresets.length >= 3);
  for (const rec of dune.recommendedPresets) {
    const bankIds = new Set(listPresets(rec.instrument).map((p) => p.id));
    assert.ok(bankIds.has(rec.presetId), `Preset "${rec.presetId}" must exist in ${rec.instrument} bank`);
  }

  const noir = await researchCreativeReference('Blade Runner cyberpunk noir', { activeInstrument: 'aura' });
  assert.equal(noir.lane, 'built-in');
  assert.ok(noir.chords.length >= 3);
  assert.ok(noir.recommendedPresets.some((p) => p.instrument === 'aura'));
});

test('composeFreshTake generates scale-locked fresh takes & accompaniments within range', () => {
  const sr = 44100;
  const studied = analyzeAudioBufferToReference(synthMelodyPcm(sr), sr, 'mic-hum', 'Vocal Hook');
  const scaleMask = scalePitchClasses(2, 'dorian');

  const fresh = composeFreshTake({
    role: 'melody',
    keyTonic: 2,
    keyScale: 'dorian',
    bpm: 96,
    bars: 4,
    beatsPerBar: 4,
    range: [55, 79],
    mode: 'fresh-take',
    reference: studied,
  });
  assert.ok(fresh.notes.length >= 4, 'Fresh take generates melodic notes');
  for (const n of fresh.notes) {
    assert.ok(n.key >= 55 && n.key <= 79, `Pitch ${n.key} out of [55, 79]`);
    assert.ok(scaleMask[n.key % 12], `Pitch class ${n.key % 12} must belong to D dorian`);
  }

  const acc = composeFreshTake({
    role: 'bass',
    keyTonic: 2,
    keyScale: 'dorian',
    bpm: 96,
    bars: 4,
    beatsPerBar: 4,
    range: [28, 55],
    mode: 'accompany',
    reference: studied,
  });
  assert.ok(acc.notes.length >= 4, 'Bass accompaniment generates pocket notes');
  for (const n of acc.notes) {
    assert.ok(n.key >= 28 && n.key <= 55);
  }
});

test('writeFreshTakeToDoc records notes onto an instrument track and drum hits onto MEKA pattern', () => {
  const doc = makeSongDoc();
  const res = composeFreshTake({
    role: 'melody',
    keyTonic: 2,
    keyScale: 'minor',
    bpm: 96,
    bars: 2,
    range: [50, 76],
    mode: 'fresh-take',
  });
  const count = writeFreshTakeToDoc(doc, 'tr_tonos', res, { startBeats: 0, label: 'Elena Take' });
  assert.equal(count, res.notes.length);
  const tonos = doc.arrangement.find((t) => t.id === 'tr_tonos')!;
  assert.equal(tonos.clips.length, 2);
  assert.equal(tonos.clips[1].name, 'Elena Take');

  const drumRes = composeFreshTake({
    role: 'percussion',
    keyTonic: 2,
    keyScale: 'minor',
    bpm: 96,
    bars: 2,
    range: [36, 72],
    mode: 'accompany',
  });
  const drumCount = writeFreshTakeToDoc(doc, undefined, drumRes, { startBeats: 0, label: 'Amara Pocket' });
  assert.ok(drumCount > 0, 'Drum hits written into MEKA pattern');
});

test('teacherPrompt and offline askPlayer surface live project & studied audio context cleanly', async () => {
  const player = playerById('rosa')!;
  const sys = teacherSystem(player, {
    activeInstrument: 'LYRA · Flamenco Nylon',
    projectSummary: 'Song "Midnight Harbour" at 96 BPM, 4/4, Key D minor',
    referenceSummary: 'mic-hum: "Vocal Hook" · 110 BPM · Key D minor',
  }, 'What key am I in?');
  assert.ok(sys.includes('Midnight Harbour'));
  assert.ok(sys.includes('LYRA · Flamenco Nylon'));
  assert.ok(sys.includes('Vocal Hook'));

  const reply = await askPlayer('rosa', [{ role: 'user', content: 'What key is the song in right now?' }], {
    projectSummary: 'Song "Midnight Harbour" at 96 BPM, 4/4, Key D minor',
    referenceSummary: 'mic-hum: "Vocal Hook"',
  });
  assert.equal(reply.lane, 'built-in');
  assert.ok(reply.text.includes('Midnight Harbour'));
});

test('server /api/band/research enforces HTTP 428 cloudConsent gate and AppCheck strict coverage', () => {
  const srv = fs.readFileSync('server.ts', 'utf8');
  const idx = srv.indexOf("app.post('/api/band/research'");
  assert.ok(idx > 0, '/api/band/research route must exist in server.ts');
  const snippet = srv.slice(idx, idx + 400);
  assert.ok(snippet.includes('req.body?.cloudConsent !== true') && snippet.includes('428'), 'Must enforce 428 consent check');

  const appCheck = fs.readFileSync('services/appCheckServer.ts', 'utf8');
  assert.ok(appCheck.includes("'/api/band/research'"), 'AppCheck strict prefixes must include /api/band/research');
});
