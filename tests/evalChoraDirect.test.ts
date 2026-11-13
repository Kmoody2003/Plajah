// Pure TypeScript tests for G5 (`tests/fixtures/directPrompts.json` & `scripts/evalChoraDirect.ts`).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STYLE_PACKS } from '../services/melos/direct/styleKnowledge';
import {
  decodeWavBuffer,
  evaluatePromptFixtures,
  evaluateRenderedWavFolder,
  formatPromptEvalTable,
  formatWavEvalTable,
  loadPromptFixtures,
} from '../scripts/evalChoraDirect';

/** Encode interleaved Float32 samples into a standard 16-bit PCM RIFF/WAVE Buffer. */
function encodePcm16Wav(interleaved: Float32Array, sampleRate: number, channels: 1 | 2): Buffer {
  const dataBytes = interleaved.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < interleaved.length; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

test('directPrompts.json: covers all 78 STYLE_PACKS with 3 variants each (plain, lyrics, marks) and 100% pass', () => {
  const fixtures = loadPromptFixtures();
  assert.equal(fixtures.length, STYLE_PACKS.length * 3);

  for (const pack of STYLE_PACKS) {
    const group = fixtures.filter((f) => f.expect.packId === pack.id);
    assert.equal(group.length, 3, `Expected 3 fixtures for ${pack.id}`);
    assert.deepEqual(
      group.map((g) => g.variant).sort(),
      ['lyrics', 'marks', 'plain'],
    );
  }

  const summary = evaluatePromptFixtures(fixtures);
  assert.equal(summary.failed, 0, formatPromptEvalTable(summary));
  assert.equal(summary.passed, STYLE_PACKS.length * 3);
  assert.equal(summary.packsCovered, STYLE_PACKS.length);

  const table = formatPromptEvalTable(summary);
  assert.match(table, /Prompts: 234\/234 passed/);
});

test('evalChoraDirect WAV mode: decodes WAVs and reports measured tempo, key and BS.1770 integrated loudness vs brief', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chora-eval-wav-'));
  try {
    const sampleRate = 22050;
    const durationSec = 8;
    const frames = sampleRate * durationSec;
    const stereo = new Float32Array(frames * 2);

    // Synthesise a 120 BPM pulsed C-major progression (C4-E4-G4 + C3 root) with crisp beat attacks.
    const freqs = [130.81, 261.63, 329.63, 392.0, 523.25];
    const beatPeriod = 0.5; // 120 BPM
    for (let i = 0; i < frames; i++) {
      const t = i / sampleRate;
      const posInBeat = (t % beatPeriod) / beatPeriod;
      const env = Math.exp(-posInBeat * 4.5) * 0.85 + 0.15;
      let sample = 0;
      for (const f of freqs) {
        sample += Math.sin(2 * Math.PI * f * t);
      }
      sample = (sample / freqs.length) * env * 0.45;
      stereo[i * 2] = sample;
      stereo[i * 2 + 1] = sample * 0.96;
    }

    const wavBuf = encodePcm16Wav(stereo, sampleRate, 2);
    const decoded = decodeWavBuffer(wavBuf);
    assert.equal(decoded.sampleRate, sampleRate);
    assert.equal(decoded.channels, 2);
    assert.ok(Math.abs(decoded.durationSec - durationSec) < 0.01);

    const wavPath = path.join(tmpDir, 'edm-house.wav');
    const sidecarPath = path.join(tmpDir, 'edm-house.prompt.txt');
    fs.writeFileSync(wavPath, wavBuf);
    fs.writeFileSync(sidecarPath, 'classic Chicago piano house, 120 bpm, C major\n', 'utf8');

    const rows = evaluateRenderedWavFolder(tmpDir);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.packId, 'edm-house');
    assert.equal(row.briefBpm, 120);
    assert.equal(row.briefKey, 'C major');
    assert.ok(row.tempoWithinRangeOrOctave, `Expected measured BPM ${row.measuredBpm} near 120 BPM`);
    assert.equal(row.keyMatch, 'exact');
    assert.ok(row.measuredLufs !== null && Number.isFinite(row.measuredLufs) && row.measuredLufs < 0);

    const table = formatWavEvalTable(rows);
    assert.match(table, /edm-house\.wav/);
    assert.match(table, /C major \(exact\)/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
