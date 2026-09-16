import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser globals before importing voiceSoundscapeEngine
(globalThis as any).window = {
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
};

let frameCallbacks: Array<(t: number) => void> = [];
(globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => {
  frameCallbacks.push(cb);
  return frameCallbacks.length;
};
(globalThis as any).cancelAnimationFrame = () => {
  frameCallbacks = [];
};

import { startVoiceSoundscape } from '../services/voiceSoundscapeEngine';

function createMockCanvas() {
  const colorStops: Array<{ offset: number; color: string }> = [];
  const mockCtx = {
    clearRect: () => {},
    createRadialGradient: () => ({
      addColorStop: (offset: number, color: string) => {
        colorStops.push({ offset, color });
      },
    }),
    createLinearGradient: () => ({
      addColorStop: (offset: number, color: string) => {
        colorStops.push({ offset, color });
      },
    }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    closePath: () => {},
    arc: () => {},
    fillRect: () => {},
    quadraticCurveTo: () => {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
  };

  const canvas = {
    getContext: () => mockCtx,
    width: 800,
    height: 200,
    clientWidth: 800,
    clientHeight: 200,
    parentElement: null,
  };

  return { canvas: canvas as any, colorStops };
}

test('voiceSoundscapeEngine renders speech theme without ReferenceError', () => {
  const { canvas, colorStops } = createMockCanvas();
  frameCallbacks = [];

  const stop = startVoiceSoundscape(canvas, null, true, { theme: 'speech' });
  assert.ok(typeof stop === 'function');

  // Trigger one animation frame
  const cb = frameCallbacks.shift();
  assert.ok(cb, 'Expected an animation frame callback');
  cb(performance.now());

  // Verify radial gradient color stops exist and are valid rgba strings
  const rgbaStops = colorStops.filter(s => s.color.startsWith('rgba('));
  assert.ok(rgbaStops.length >= 2, 'Expected at least 2 rgba stops in speech oratory gradient');
  for (const s of rgbaStops) {
    assert.ok(s.color.startsWith('rgba('), `Stop color should start with rgba: ${s.color}`);
    assert.ok(s.color.endsWith(')'), `Stop color should end with ): ${s.color}`);
  }

  stop();
});

test('voiceSoundscapeEngine renders interview theme without ReferenceError', () => {
  const { canvas, colorStops } = createMockCanvas();
  frameCallbacks = [];

  const stop = startVoiceSoundscape(canvas, null, true, { theme: 'interview' });
  assert.ok(typeof stop === 'function');

  const cb = frameCallbacks.shift();
  assert.ok(cb, 'Expected an animation frame callback');
  cb(performance.now());

  const rgbaStops = colorStops.filter(s => s.color.startsWith('rgba('));
  assert.ok(rgbaStops.length >= 2, 'Expected at least 2 rgba stops in interview cadence gradient');
  for (const s of rgbaStops) {
    assert.ok(s.color.startsWith('rgba('), `Stop color should start with rgba: ${s.color}`);
    assert.ok(s.color.endsWith(')'), `Stop color should end with ): ${s.color}`);
  }

  stop();
});

test('voiceSoundscapeEngine renders audiobook theme without error', () => {
  const { canvas, colorStops } = createMockCanvas();
  frameCallbacks = [];

  const stop = startVoiceSoundscape(canvas, null, true, { theme: 'audiobook' });
  assert.ok(typeof stop === 'function');

  const cb = frameCallbacks.shift();
  assert.ok(cb, 'Expected an animation frame callback');
  cb(performance.now());

  assert.ok(colorStops.length > 0, 'Expected color stops for audiobook terrain');
  stop();
});
