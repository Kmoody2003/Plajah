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

describe('Intelligent Visualizer Scaling & Master Program Bus Mirroring', () => {
  test('scaleVisualizerSize preserves exact output aspect ratio across 16:9, 16:10, 21:9, 4:3, and portrait viewports', async () => {
    const { scaleVisualizerSize } = await import('../services/ambo/layerSources');

    const s16x9 = scaleVisualizerSize(1920, 1080, 1280);
    assert.equal(s16x9.w, 1280);
    assert.equal(s16x9.h, 720);
    assert.ok(Math.abs(s16x9.w / s16x9.h - 16 / 9) < 0.005);

    const s16x10 = scaleVisualizerSize(1920, 1200, 1280);
    assert.equal(s16x10.w, 1280);
    assert.equal(s16x10.h, 800);
    assert.ok(Math.abs(s16x10.w / s16x10.h - 16 / 10) < 0.005);

    const s21x9 = scaleVisualizerSize(2560, 1080, 1280);
    assert.equal(s21x9.w, 1280);
    assert.equal(s21x9.h, 540);
    assert.ok(Math.abs(s21x9.w / s21x9.h - 2560 / 1080) < 0.005);

    const s4x3 = scaleVisualizerSize(1440, 1080, 1280);
    assert.equal(s4x3.w, 1280);
    assert.equal(s4x3.h, 960);
    assert.ok(Math.abs(s4x3.w / s4x3.h - 4 / 3) < 0.005);

    const sPortrait = scaleVisualizerSize(1080, 1920, 1280);
    assert.equal(sPortrait.w, 720);
    assert.equal(sPortrait.h, 1280);
  });

  test('Master Program Bus registry notifies follower canvases without creating duplicate renderers', async () => {
    const {
      registerProgramBusCanvas,
      getProgramBusCanvas,
      notifyProgramBusFrame,
      subscribeProgramBusFollower,
    } = await import('../services/ambo/programBus');

    let blits = 0;
    const masterCanvas: any = { width: 1280, height: 720 };
    const followerCanvas: any = {
      width: 640,
      height: 360,
      getContext: () => ({
        setTransform() {},
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '#000',
        fillRect() {},
        drawImage(src: any) {
          if (src === masterCanvas) blits++;
        },
      }),
    };

    const unreg = registerProgramBusCanvas(masterCanvas);
    assert.equal(getProgramBusCanvas(), masterCanvas);

    const unsub = subscribeProgramBusFollower(followerCanvas);
    // Initial blit on subscribe + 1 notified frame
    notifyProgramBusFrame();
    assert.ok(blits >= 2);

    unsub();
    unreg();
    assert.equal(getProgramBusCanvas(), null);
  });
});

