import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listWindowsAudioDevices, selectWindowsAudioDevice } from '../services/windowsBridgeService';
import { denoiseChannel, estimateNoiseSpectrum } from '../services/audio/spectralDenoise';

test('listWindowsAudioDevices returns default device fallback outside Windows', async () => {
  const devices = await listWindowsAudioDevices();
  assert.ok(Array.isArray(devices));
  assert.ok(devices.length >= 1);
  const def = devices.find(d => d.isDefault);
  assert.ok(def);
  assert.ok(def.supportedSampleRates.includes(44100));
  assert.ok(def.supportedSampleRates.includes(48000));
});

test('selectWindowsAudioDevice handles selection safely', async () => {
  const ok = await selectWindowsAudioDevice('wasapi:exclusive:default', 'WASAPI_EXCLUSIVE');
  assert.equal(ok, true);
});

test('estimateNoiseSpectrum computes valid non-negative magnitude bins', () => {
  const sampleRate = 48000;
  const fftSize = 1024;
  const numSamples = sampleRate * 0.5;
  const whiteNoise = new Float32Array(numSamples);

  // Synthesize white noise at -40 dB
  for (let i = 0; i < numSamples; i++) {
    whiteNoise[i] = (Math.random() * 2 - 1) * 0.01;
  }

  const spectrum = estimateNoiseSpectrum(whiteNoise, sampleRate, 0.25, fftSize);
  const expectedBins = (fftSize >> 1) + 1;
  assert.equal(spectrum.length, expectedBins);

  for (let b = 0; b < spectrum.length; b++) {
    assert.ok(spectrum[b] >= 0, `bin ${b} is non-negative`);
    assert.ok(!Number.isNaN(spectrum[b]), `bin ${b} is not NaN`);
  }
});

test('denoiseChannel with reductionDb = 0 passes through audio unchanged', () => {
  const sampleRate = 44100;
  const length = 4096;
  const input = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }

  const output = denoiseChannel(input, sampleRate, { reductionDb: 0 });
  assert.equal(output.length, input.length);
  for (let i = 0; i < length; i++) {
    assert.equal(output[i], input[i]);
  }
});

test('denoiseChannel attenuates low-level noise floor without corrupting signal length', () => {
  const sampleRate = 48000;
  const length = 8192;
  const noisySignal = new Float32Array(length);

  // 1. Initial 0.25s has pure low-level hiss (noise floor)
  const noiseFloor = 0.02;
  for (let i = 0; i < length; i++) {
    noisySignal[i] = (Math.random() * 2 - 1) * noiseFloor;
  }

  // 2. Add strong 440Hz sine tone in the second half
  for (let i = 4000; i < length; i++) {
    noisySignal[i] += Math.sin((2 * Math.PI * 440 * (i - 4000)) / sampleRate) * 0.7;
  }

  const cleaned = denoiseChannel(noisySignal, sampleRate, {
    reductionDb: 18,
    thresholdRatio: 1.2,
    noiseProfileDuration: 0.08,
    fftSize: 1024,
  });

  assert.equal(cleaned.length, length);

  // Verify that noise section is attenuated
  let noiseEnergy = 0;
  let cleanNoiseEnergy = 0;
  for (let i = 1000; i < 3000; i++) {
    noiseEnergy += noisySignal[i] * noisySignal[i];
    cleanNoiseEnergy += cleaned[i] * cleaned[i];
  }

  assert.ok(cleanNoiseEnergy < noiseEnergy, 'noise section energy is reduced');
  // Verify that active tone section preserves dominant energy
  let toneEnergy = 0;
  let cleanToneEnergy = 0;
  for (let i = 4500; i < 7500; i++) {
    toneEnergy += noisySignal[i] * noisySignal[i];
    cleanToneEnergy += cleaned[i] * cleaned[i];
  }
  assert.ok(cleanToneEnergy > toneEnergy * 0.7, 'harmonic tone is substantially preserved');
});
