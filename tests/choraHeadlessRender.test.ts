// Pure TypeScript tests for Phase 5 (`services/melos/render/headlessProjectRenderer.ts`).
// Zero WASM/engine imports (uses pure-TS DSP backend and an injected mock WASM track hook).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GrooveDoc } from '../services/melos/beats/grooveDoc';
import { compileSongBrief } from '../services/melos/direct/songBrief';
import { parseSongPrompt } from '../services/melos/direct/songPrompt';
import { validateGenerationRequest } from '../services/melos/generation/types';
import {
  buildScoreConditionedAceRequest,
  renderBriefHeadless,
  renderGrooveHeadless,
} from '../services/melos/render';
import { decodeWavBuffer, evaluateRenderedWavFolder } from '../scripts/evalChoraDirect';

test('renderGrooveHeadless: respects GrooveDoc TempoMap, clip loops/offsets, and drum patterns', async () => {
  // 120 BPM for beats 0..4 (2.0 s), then 60 BPM for beats 4..8 (4.0 s) => 6.0 s of music + 0.4 s tail = 6.4 s.
  const doc = {
    bpm: 120,
    tempoMap: [
      { beat: 0, bpm: 120 },
      { beat: 4, bpm: 60 },
    ],
    meter: [{ bar: 0, num: 4, den: 4 }],
    key: { tonic: 0, scale: 'major' },
    kit: [
      {
        id: 'pad-kick',
        name: 'Kick',
        color: '#fff',
        source: 'synth',
        sample: null,
        synthVoice: 'kick',
        group: 0,
        choke: 0,
        gainDb: 0,
        pan: 0,
        pitchSemis: 0,
        startSec: 0,
        env: { attackMs: 1, holdMs: 20, decayMs: 120, sustain: 0, releaseMs: 40 },
        filter: { type: 'off', cutoff: 20000, q: 1 },
        velCurve: 'linear',
      },
    ],
    patterns: [
      {
        id: 'pat-1',
        name: 'Four-on-floor',
        length: 16,
        steps: {
          0: {
            0: { v: 115 },
            4: { v: 105 },
            8: { v: 110 },
            12: { v: 105 },
          },
        },
      },
    ],
    arrangement: [
      {
        id: 'trk-drums',
        name: 'Drums',
        kind: 'pattern',
        gainDb: 0,
        pan: 0,
        clips: [{ id: 'c-d', startBeats: 0, lengthBeats: 8, patternId: 'pat-1' }],
      },
      {
        id: 'trk-keys',
        name: 'Piano Chords',
        kind: 'instrument',
        gainDb: -2,
        pan: 0.1,
        instrument: { type: 'onda', patch: { presetId: 'warm-keys' } },
        clips: [
          {
            id: 'c-k',
            startBeats: 0,
            lengthBeats: 8,
            loop: { startBeats: 0, lengthBeats: 4 },
            notes: [
              { id: 'n1', startBeats: 0, lengthBeats: 2, key: 60, vel: 95 },
              { id: 'n2', startBeats: 0, lengthBeats: 2, key: 64, vel: 90 },
              { id: 'n3', startBeats: 2, lengthBeats: 2, key: 67, vel: 90, articulation: 'staccato' },
            ],
          },
        ],
      },
    ],
  } as unknown as GrooveDoc;

  const res = await renderGrooveHeadless(doc, { sampleRate: 22050, tailSec: 0.4, bitDepth: 16 });
  assert.equal(res.backend, 'dsp');
  assert.equal(res.fallbackUsed, false);
  assert.deepEqual(res.renderedTracks, ['trk-drums', 'trk-keys']);
  assert.equal(res.drumHitCount, 8); // 2 passes of 4-step kick pattern
  assert.equal(res.noteCount, 6); // 2 loop passes of 3 notes
  //TempoMap makes 8 beats take 6.0 s (+0.4 s tail = 6.4 s), whereas naive 60/120 * 8 = 4.0 s!
  assert.ok(res.durationSec >= 6.3 && res.durationSec <= 6.5, `Expected ~6.4 s from TempoMap, got ${res.durationSec}`);

  const decoded = decodeWavBuffer(Buffer.from(res.wavBytes));
  assert.equal(decoded.sampleRate, 22050);
  assert.equal(decoded.channels, 2);
  assert.ok(res.measured && res.measured.integratedLufs !== null && res.measured.integratedLufs > -40);
});

test('renderGrooveHeadless: wasmTrackRenderer reports wasm-hybrid and flags partial fallback honestly', async () => {
  const doc = {
    bpm: 120,
    kit: [],
    patterns: [],
    arrangement: [
      {
        id: 't-wasm',
        name: 'Lead',
        kind: 'instrument',
        gainDb: 0,
        pan: 0,
        instrument: { type: 'aura', patch: { presetId: 'solina' } },
        clips: [{ id: 'c1', startBeats: 0, lengthBeats: 4, notes: [{ id: 'a', startBeats: 0, lengthBeats: 2, key: 69, vel: 100 }] }],
      },
      {
        id: 't-fallback',
        name: 'Bass',
        kind: 'instrument',
        gainDb: 0,
        pan: 0,
        instrument: { type: 'bajo', patch: { presetId: 'sub' } },
        clips: [{ id: 'c2', startBeats: 0, lengthBeats: 4, notes: [{ id: 'b', startBeats: 0, lengthBeats: 2, key: 45, vel: 100 }] }],
      },
    ],
  } as unknown as GrooveDoc;

  const res = await renderGrooveHeadless(doc, {
    sampleRate: 22050,
    tailSec: 0.2,
    measure: false,
    wasmTrackRenderer: async ({ trackId, totalFrames }) => {
      if (trackId === 't-wasm') {
        const left = new Float32Array(totalFrames).fill(0.05);
        const right = new Float32Array(totalFrames).fill(0.05);
        return { left, right };
      }
      return null;
    },
  });

  assert.equal(res.backend, 'wasm-hybrid');
  assert.equal(res.fallbackUsed, true);
  assert.deepEqual(res.renderedTracks, ['t-wasm', 't-fallback']);
});

test('renderBriefHeadless + evalChoraDirect: renders SongBrief WAV that passes --wav-dir QA measurement', async () => {
  const prompt = [
    'indie pop rock, 122 bpm, C major',
    '[Intro | 4 bars | mf]',
    '{C | C | F | G}',
    '[Chorus | 8 bars | f]',
    '{C | Am | F | G}',
  ].join('\n');
  const brief = compileSongBrief(parseSongPrompt(prompt));
  const res = await renderBriefHeadless(brief, { sampleRate: 22050, maxDurationSec: 12 });

  assert.ok(res.noteCount > 0 && res.drumHitCount > 0);
  assert.ok(res.measured && res.measured.integratedLufs !== null);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chora-headless-brief-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'song.wav'), res.wavBytes);
    fs.writeFileSync(path.join(tmpDir, 'song.prompt.txt'), prompt, 'utf8');
    const rows = evaluateRenderedWavFolder(tmpDir);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].packId, 'song');
    assert.equal(rows[0].briefBpm, 122);
    assert.ok(rows[0].tempoWithinRangeOrOctave, `Measured BPM ${rows[0].measuredBpm} should align with 122 BPM`);
    assert.ok(rows[0].keyMatch === 'exact' || rows[0].keyMatch === 'relative', `Got keyMatch=${rows[0].keyMatch} (${rows[0].measuredKey} vs ${rows[0].briefKey})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildScoreConditionedAceRequest: produces valid ACE-Step cover and lego GenerationRequests with WAV bytes', async () => {
  const brief = compileSongBrief(parseSongPrompt('deep house, 122 bpm, F minor'));

  const cover = await buildScoreConditionedAceRequest(brief, { maxDurationSec: 4, task: 'cover', coverStrength: 0.7 });
  assert.equal(cover.request.engine, 'ace-step');
  assert.equal(cover.request.task, 'cover');
  assert.equal(cover.request.coverStrength, 0.7);
  assert.ok(cover.request.sourceAudio && Buffer.from(cover.request.sourceAudio, 'base64').toString('ascii', 0, 4) === 'RIFF');
  assert.doesNotThrow(() => validateGenerationRequest(cover.request));

  const lego = await buildScoreConditionedAceRequest(brief, { maxDurationSec: 4, task: 'lego', trackName: 'vocals' });
  assert.equal(lego.request.engine, 'ace-step');
  assert.equal(lego.request.task, 'lego');
  assert.equal(lego.request.trackName, 'vocals');
  assert.doesNotThrow(() => validateGenerationRequest(lego.request));
});
