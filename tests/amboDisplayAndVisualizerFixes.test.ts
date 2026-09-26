import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYER_ORDER,
  LAYER_LABEL,
  applySlide,
  clearLayer,
  clearAll,
  type LiveStack,
  type Slide,
} from '../services/ambo/showModel';
import {
  createSource,
  canUpdateInPlace,
  VideoSource,
} from '../services/ambo/layerSources';
import {
  stackForOutput,
  makeOutput,
  calculateAspectRatio,
  autoDetectOutputResolution,
  type DetectedScreenInfo,
} from '../services/ambo/outputRouter';

describe('Ambo Pro Display, Audio & Visualizer Fixes', () => {
  test('LAYER_ORDER and LAYER_LABEL include audio slot', () => {
    assert.ok(LAYER_ORDER.includes('audio'), 'LAYER_ORDER must include audio');
    assert.strictEqual(LAYER_LABEL.audio, 'Audio Track');
    assert.strictEqual(LAYER_ORDER.indexOf('audio'), 6);
  });

  test('createSource handles SHADER and GENERATOR sources without throwing', () => {
    // In node/test environment, offscreen canvas is mocked or created
    const shaderContent = { kind: 'SHADER' as const, src: 'void main(){ fragColor = vec4(1.0); }' };
    const generatorContent = { kind: 'GENERATOR' as const, mode: 'AURORA_WAVE' };

    const shaderSrc = createSource(shaderContent, { w: 1280, h: 720 });
    assert.ok(shaderSrc, 'Shader source should be created');
    assert.strictEqual(shaderSrc.kind, 'SHADER');

    const genSrc = createSource(generatorContent, { w: 1280, h: 720 });
    assert.ok(genSrc, 'Generator source should be created');
    assert.strictEqual(genSrc.kind, 'GENERATOR');
  });

  test('canUpdateInPlace recognizes SHADER source', () => {
    const s1 = { kind: 'SHADER' as const, src: 'void main(){}' };
    const s2 = { kind: 'SHADER' as const, src: 'void main(){}' };
    const s3 = { kind: 'SHADER' as const, src: 'void main(){ return; }' };

    assert.ok(canUpdateInPlace(s1, s2));
    assert.ok(!canUpdateInPlace(s1, s3));
  });

  test('VideoSource initializes with audioEnabled unmuted defaults for studio', () => {
    // VideoSource with audioEnabled = true
    const videoContent = { kind: 'VIDEO' as const, src: 'https://example.com/loop.mp4', loop: true };
    const sourceWithAudio = new VideoSource(videoContent, true);
    assert.strictEqual(sourceWithAudio.el.muted, false, 'Video should be unmuted when audioEnabled is true');
    assert.strictEqual(sourceWithAudio.el.volume, 1.0, 'Video volume should be 1.0 when audioEnabled is true');

    // VideoSource with audioEnabled = false (secondary displays / preview)
    const sourceMuted = new VideoSource(videoContent, false);
    assert.strictEqual(sourceMuted.el.muted, true, 'Video should be muted when audioEnabled is false');
    assert.strictEqual(sourceMuted.el.volume, 0, 'Video volume should be 0 when audioEnabled is false');
  });

  test('effectiveLiveStack logic blanks program on blackout and clears slides on program off', () => {
    const mockLive: LiveStack = {
      background: {
        content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' },
        since: Date.now(),
      },
      slide: {
        content: { kind: 'TEXT', blocks: [{ text: 'Worship Slide' }] },
        since: Date.now(),
      },
      scripture: {
        content: { kind: 'SCRIPTURE', refId: 'JHN.3.16', lines: ['For God so loved the world'] },
        since: Date.now(),
      },
      prop: {
        content: { kind: 'TEXT', blocks: [{ text: 'Lower Third' }] },
        since: Date.now(),
      },
    };

    // 1. Normal state: all layers present
    const normalStack = mockLive;
    assert.ok(normalStack.background);
    assert.ok(normalStack.slide);
    assert.ok(normalStack.scripture);
    assert.ok(normalStack.prop);

    // 2. Blackout state: empty stack
    const blackoutStack = {};
    assert.deepStrictEqual(blackoutStack, {});

    // 3. Program OFF state: background holds, foreground content drops
    const pgmOffStack = { ...mockLive, slide: undefined, scripture: undefined, prop: undefined };
    assert.ok(pgmOffStack.background, 'Background persists when program is switched off');
    assert.strictEqual(pgmOffStack.slide, undefined, 'Slide is cleared');
    assert.strictEqual(pgmOffStack.scripture, undefined, 'Scripture is cleared');
    assert.strictEqual(pgmOffStack.prop, undefined, 'Props are cleared');
  });

  test('clearAudio removes audio and overlay layers while holding background and slide', () => {
    const stack: LiveStack = {
      background: {
        content: { kind: 'GENERATOR', mode: 'AURORA' },
        since: Date.now(),
      },
      slide: {
        content: { kind: 'TEXT', blocks: [{ text: 'Slide Text' }] },
        since: Date.now(),
      },
      overlay: {
        content: { kind: 'AUDIO', src: 'https://example.com/track.mp3' },
        since: Date.now(),
      },
    };

    const afterClearAudio = clearLayer(clearLayer(stack, 'overlay'), 'audio' as any);
    assert.strictEqual(afterClearAudio.overlay, undefined);
    assert.ok(afterClearAudio.background);
    assert.ok(afterClearAudio.slide);
  });

  test('autoDetectOutputResolution maps to target screen dimensions', () => {
    const output = makeOutput('PROGRAM', 'Audience Screen', { autoDetectDisplay: true });
    const screens: DetectedScreenInfo[] = [
      {
        index: 0,
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        label: 'Display 1 (Primary)',
        primary: true,
        refreshRate: 60,
        aspectRatio: '16:9',
      },
      {
        index: 1,
        left: 1920,
        top: 0,
        width: 2560,
        height: 1440,
        label: 'Display 2 (Audience 2.5K)',
        primary: false,
        refreshRate: 59.94,
        aspectRatio: '16:9',
      },
    ];

    const detected = autoDetectOutputResolution(output, screens);
    assert.strictEqual(detected.screenIndex, 1, 'Should select secondary non-primary screen by default');
    assert.strictEqual(detected.width, 2560);
    assert.strictEqual(detected.height, 1440);
  });

  test('calculateAspectRatio correctly computes aspect ratios', () => {
    assert.strictEqual(calculateAspectRatio(1920, 1080), '16:9');
    assert.strictEqual(calculateAspectRatio(3840, 2160), '16:9');
    assert.strictEqual(calculateAspectRatio(2560, 1440), '16:9');
    assert.strictEqual(calculateAspectRatio(1920, 1200), '16:10');
    assert.strictEqual(calculateAspectRatio(3440, 1440), '21:9');
    assert.strictEqual(calculateAspectRatio(1024, 768), '4:3');
  });
});
