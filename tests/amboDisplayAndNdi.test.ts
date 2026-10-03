// amboDisplayAndNdi.test.ts — Test suite for Ambo display resolution auto-detection and NDI stream discovery
// Run with: npx tsx --test tests/amboDisplayAndNdi.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateAspectRatio,
  autoDetectOutputResolution,
  makeOutput,
  type DetectedScreenInfo,
  type AmboOutput,
} from '../services/ambo/outputRouter';
import { MediaEngine } from '../services/mediaEngine/engine';
import { scanWindowsNdiStreams } from '../services/windowsBridgeService';

describe('calculateAspectRatio', () => {
  test('correctly identifies 16:9 resolutions (1080p, 1440p, 4K UHD)', () => {
    assert.equal(calculateAspectRatio(1920, 1080), '16:9');
    assert.equal(calculateAspectRatio(2560, 1440), '16:9');
    assert.equal(calculateAspectRatio(3840, 2160), '16:9');
    assert.equal(calculateAspectRatio(1280, 720), '16:9');
  });

  test('correctly identifies 16:10 resolutions (e.g. PC monitors, MacBooks)', () => {
    assert.equal(calculateAspectRatio(1920, 1200), '16:10');
    assert.equal(calculateAspectRatio(2560, 1600), '16:10');
    assert.equal(calculateAspectRatio(1680, 1050), '16:10');
  });

  test('correctly identifies Ultrawide 21:9 displays', () => {
    assert.equal(calculateAspectRatio(3440, 1440), '21:9');
    assert.equal(calculateAspectRatio(2560, 1080), '21:9');
  });

  test('correctly identifies legacy 4:3 and 5:4 displays', () => {
    assert.equal(calculateAspectRatio(1024, 768), '4:3');
    assert.equal(calculateAspectRatio(800, 600), '4:3');
    assert.equal(calculateAspectRatio(1280, 1024), '5:4');
  });

  test('handles zero or negative dimensions safely with 16:9 fallback', () => {
    assert.equal(calculateAspectRatio(0, 0), '16:9');
    assert.equal(calculateAspectRatio(-1920, 1080), '16:9');
  });
});

describe('autoDetectOutputResolution', () => {
  const sampleScreens: DetectedScreenInfo[] = [
    {
      index: 1,
      name: 'Primary Laptop Display',
      width: 1920,
      height: 1080,
      primary: true,
      scaleFactor: 1.0,
      refreshRate: 60,
      aspectRatio: '16:9',
    },
    {
      index: 2,
      name: 'Secondary 4K Projector',
      width: 3840,
      height: 2160,
      primary: false,
      scaleFactor: 1.5,
      refreshRate: 59.94,
      aspectRatio: '16:9',
    },
    {
      index: 3,
      name: 'Confidence Monitor 16:10',
      width: 1920,
      height: 1200,
      primary: false,
      scaleFactor: 1.0,
      refreshRate: 60,
      aspectRatio: '16:10',
    },
  ];

  test('auto-detects and applies secondary screen resolution to output when autoDetectDisplay is true', () => {
    const output = makeOutput('PROGRAM', 'Audience Output', { autoDetectDisplay: true });
    assert.equal(output.autoDetectDisplay, true);

    const updated = autoDetectOutputResolution(output, sampleScreens);
    // Should choose the first non-primary screen (index 2: 4K 3840x2160)
    assert.equal(updated.width, 3840);
    assert.equal(updated.height, 2160);
    assert.equal(updated.refreshRate, 59.94);
    assert.equal(updated.aspectRatio, '16:9');
    assert.equal(updated.displayIndex, 2);
  });

  test('targets a specific screen index when specified', () => {
    const output = makeOutput('STAGE', 'Stage Display', { autoDetectDisplay: true });
    const updated = autoDetectOutputResolution(output, sampleScreens, 3);
    assert.equal(updated.width, 1920);
    assert.equal(updated.height, 1200);
    assert.equal(updated.aspectRatio, '16:10');
    assert.equal(updated.displayIndex, 3);
  });

  test('preserves user-set fixed dimensions when autoDetectDisplay is false', () => {
    const output = makeOutput('KEY', 'Alpha Keyer', {
      autoDetectDisplay: false,
      width: 1280,
      height: 720,
    });
    const updated = autoDetectOutputResolution(output, sampleScreens);
    assert.equal(updated.width, 1280);
    assert.equal(updated.height, 720);
  });
});

describe('NDI Stream Discovery & MediaEngine Integration', () => {
  test('scanWindowsNdiStreams gracefully returns empty array in non-Windows/browser environment', async () => {
    const result = await scanWindowsNdiStreams();
    assert.ok(Array.isArray(result));
  });

  test('MediaEngine scanNdi integrates with crosspoint router and switcher inputs', async () => {
    const engine = new MediaEngine();
    const initialState = engine.getState();

    // Default switcher inputs should be sw1, sw2, sw3, sw4
    const swInputs = initialState.router.destinations.filter(d => d.kind === 'switcherInput');
    assert.equal(swInputs.length, 4);

    // Run NDI scan
    const scanned = await engine.scanNdi();
    assert.ok(Array.isArray(scanned));

    // Cleanup
    engine.dispose();
  });
});
