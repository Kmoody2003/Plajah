import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aspectLabel, busRenderSize, busSize, feedSizeForBus, mirrorsProgram, monitorSize,
  normalizeBus, parseAspect, sameAspect, setBusAspect, setBusResolution, sizeForAspect,
} from '../services/ambo/busFormat';
import { computePlacement, defaultFitMode } from '../services/ambo/outputFit';
import { makeOutput } from '../services/ambo/outputRouter';

const near = (a: number, b: number, e = 0.001) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

describe('bus aspect ratios', () => {
  test('any W:H parses, nonsense does not', () => {
    near(parseAspect('32:9')!, 32 / 9);
    near(parseAspect('4x1')!, 4);
    near(parseAspect('9:16')!, 9 / 16);
    near(parseAspect('2.39')!, 2.39);
    near(parseAspect('2.39:1')!, 2.39);
    near(parseAspect('137:50')!, 2.74);
    for (const bad of ['', 'wide', '0:9', '16:0', '-4:3', '4:3:1', '1000:1']) assert.equal(parseAspect(bad), null, bad);
  });

  test('a ratio gets a resolution on a 1080 short edge', () => {
    assert.deepEqual(sizeForAspect('16:9'), { w: 1920, h: 1080 });
    assert.deepEqual(sizeForAspect('32:9'), { w: 3840, h: 1080 });
    assert.deepEqual(sizeForAspect('4:1'), { w: 4320, h: 1080 });
    assert.deepEqual(sizeForAspect('9:16'), { w: 1080, h: 1920 });
    assert.deepEqual(sizeForAspect('1:1'), { w: 1080, h: 1080 });
    assert.deepEqual(sizeForAspect('21:9'), { w: 2560, h: 1080 });
  });

  test('labels name known ratios and reduce the rest', () => {
    assert.equal(aspectLabel(1920, 1080), '16:9');
    assert.equal(aspectLabel(3840, 2160), '16:9');
    assert.equal(aspectLabel(1920, 1200), '16:10');
    assert.equal(aspectLabel(2560, 1080), '21:9');
    assert.equal(aspectLabel(5120, 1440), '32:9');
    assert.equal(aspectLabel(1080, 1920), '9:16');
    assert.equal(aspectLabel(1000, 500), '2:1');
    assert.equal(aspectLabel(1367, 411), '3.33:1');
  });
});

describe('each bus has its own format', () => {
  test('a new bus matches its display, and the window size wins over stale numbers', () => {
    const o = makeOutput('PROGRAM', 'Program Out');
    assert.equal(o.autoDetectDisplay, true);
    assert.deepEqual(busSize(o, { w: 1920, h: 1200 }), { w: 1920, h: 1200 });
    assert.deepEqual(busSize(o, { w: 3840, h: 1080 }), { w: 3840, h: 1080 });
  });

  test('a fixed format ignores the display', () => {
    const o = { ...makeOutput('AUX', 'Ribbon'), ...setBusAspect('4:1')! };
    assert.deepEqual(busSize(o, { w: 1920, h: 1080 }), { w: 4320, h: 1080 });
    assert.equal(o.aspectRatio, '4:1');
    assert.equal(o.autoDetectDisplay, false);
  });

  test('a custom resolution sets the ratio and refuses a junk size', () => {
    assert.deepEqual(setBusResolution(1367, 411), { autoDetectDisplay: false, width: 1367, height: 411, aspectRatio: '3.33:1' });
    assert.equal(setBusResolution(0, 1080), null);
    assert.equal(setBusResolution(NaN, 1080), null);
  });

  test('the master canvas keeps 4K at 1080p but never squeezes an odd shape', () => {
    assert.deepEqual(busRenderSize(1920, 1080), { w: 1920, h: 1080 });
    assert.deepEqual(busRenderSize(3840, 2160), { w: 1920, h: 1080 });
    assert.deepEqual(busRenderSize(3840, 1080), { w: 3840, h: 1080 });
    assert.deepEqual(busRenderSize(1080, 1920), { w: 1080, h: 1920 });
    assert.ok(sameAspect(busRenderSize(1920, 1200), { w: 1920, h: 1200 }));
  });

  test('monitors take the bus shape', () => {
    assert.deepEqual(monitorSize(16 / 9), { w: 960, h: 540 });
    assert.deepEqual(monitorSize(4), { w: 960, h: 240 });
    assert.deepEqual(monitorSize(9 / 16), { w: 540, h: 960 });
  });

  test('a network feed keeps the shape, with even sizes, inside 4K', () => {
    assert.deepEqual(feedSizeForBus(1920, 1200), { w: 1920, h: 1200 });
    assert.deepEqual(feedSizeForBus(1367, 411), { w: 1368, h: 412 });
    assert.deepEqual(feedSizeForBus(7680, 1080), { w: 3840, h: 540 });
  });
});

describe('which windows copy the master bus', () => {
  const pgm = (w: number, h: number) => makeOutput('PROGRAM', 'Program Out', { width: w, height: h });

  test('the Program window itself, once the master is its shape', () => {
    const p = pgm(1920, 1200);
    assert.equal(mirrorsProgram(p, p, { w: 1920, h: 1200 }), true);
  });

  // A stream bus has Program's layers by default, so only the thing under test sets these apart.
  const bus = () => makeOutput('STREAM', 'Stream');

  test('another bus of the same layers, shape and fit shares it; no second renderer', () => {
    assert.equal(mirrorsProgram(bus(), pgm(1920, 1080), { w: 1280, h: 720 }), true);
    assert.equal(mirrorsProgram(makeOutput('LED_WALL', 'Wall'), pgm(1920, 1080), { w: 1920, h: 1080 }), true);
  });

  test('a display of another shape renders for itself instead of getting bars', () => {
    assert.equal(mirrorsProgram(bus(), pgm(1920, 1080), { w: 1920, h: 1200 }), false);
  });

  test('a fixed format of another shape renders for itself', () => {
    const fixed = { ...bus(), ...setBusAspect('9:16')! };
    assert.equal(mirrorsProgram(fixed, pgm(1920, 1080), { w: 1920, h: 1080 }), false);
  });

  test('its own fit or placement renders for itself', () => {
    const p = pgm(1920, 1080);
    const auto = { ...bus(), fit: { mode: 'auto' as const, zoom: 1.5 } };
    const moved = { ...bus(), transform: { rect: { x: 0, y: 0, w: 0.5, h: 0.5 } } };
    assert.equal(mirrorsProgram(auto, p, { w: 1920, h: 1080 }), false);
    assert.equal(mirrorsProgram(moved, p, { w: 1920, h: 1080 }), false);
  });

  test('stage, key and cleared buses still composite their own stack', () => {
    const p = pgm(1920, 1080);
    for (const o of [makeOutput('STAGE', 'S'), makeOutput('KEY', 'K'), { ...bus(), clearedSlots: ['slide' as const] }]) {
      assert.equal(mirrorsProgram(o, p, { w: 1920, h: 1080 }), false);
    }
  });

  test('a bus with other layers renders only those, at any shape', () => {
    const p = pgm(1920, 1080), screen = { w: 1920, h: 1080 };
    for (const kind of ['LOOP', 'SIGNAGE', 'AUX'] as const) {
      assert.equal(mirrorsProgram(makeOutput(kind, kind), p, screen), false, kind);
    }
    assert.equal(mirrorsProgram({ ...bus(), layers: ['background'] }, p, screen), false);
  });

  test('two lists that let the same picture through still share', () => {
    const p = pgm(1920, 1080), screen = { w: 1920, h: 1080 };
    assert.equal(mirrorsProgram({ ...bus(), layers: [...p.layers].reverse() }, p, screen), true, 'order');
    assert.equal(mirrorsProgram({ ...bus(), layers: [...p.layers, 'audio'] }, p, screen), true, 'audio is not picture');
    const old = p.layers.filter(s => s !== 'lyrics');
    assert.equal(mirrorsProgram({ ...bus(), layers: old }, p, screen), true, 'saved before the lyrics slot');
  });

  test('the Program window itself shares whatever its list says', () => {
    const p = { ...pgm(1920, 1080), layers: ['background' as const] };
    assert.equal(mirrorsProgram(p, p, { w: 1920, h: 1080 }), true);
  });
});

describe('saved shows', () => {
  test('a bus saved before formats matches its display', () => {
    const { autoDetectDisplay: _gone, ...old } = makeOutput('PROGRAM', 'Old');
    const n = normalizeBus(old as any);
    assert.equal(n.autoDetectDisplay, true);
    assert.deepEqual(busSize(n, { w: 2560, h: 1080 }), { w: 2560, h: 1080 });
  });

  test('a stale 16:9 on an auto bus does not stick', () => {
    const n = normalizeBus(makeOutput('PROGRAM', 'Old', { autoDetectDisplay: true, width: 1920, height: 1080, aspectRatio: '16:9' }));
    assert.deepEqual(busSize(n, { w: 1920, h: 1200 }), { w: 1920, h: 1200 });
  });

  test('a format the operator fixed stays, and bad sizes are repaired', () => {
    const fixed = normalizeBus(makeOutput('AUX', 'Fixed', { autoDetectDisplay: false, width: 1280, height: 1024 }));
    assert.deepEqual(busSize(fixed, { w: 1920, h: 1080 }), { w: 1280, h: 1024 });
    assert.equal(fixed.aspectRatio, '5:4');
    const bad = normalizeBus({ ...makeOutput('AUX', 'Bad'), width: 0, height: undefined });
    assert.equal(bad.width, 1920);
    assert.equal(bad.height, 1080);
  });
});

describe('default media placement', () => {
  test('full-screen media fills with no bars, props stay whole', () => {
    assert.equal(defaultFitMode('background'), 'fill');
    assert.equal(defaultFitMode('fill'), 'fill');
    assert.equal(defaultFitMode('slide'), 'fill');
    assert.equal(defaultFitMode('prop'), 'auto');
    assert.equal(defaultFitMode('overlay'), 'auto');
    const onUltrawide = computePlacement({ w: 1920, h: 1080 }, { w: 3840, h: 1080 }, { mode: defaultFitMode('background') });
    assert.equal(onUltrawide.letterboxed, false);
    assert.equal(onUltrawide.bars, 'none');
  });

  test('letterbox is still there for whoever chose it', () => {
    const p = computePlacement({ w: 1920, h: 1080 }, { w: 3840, h: 1080 }, { mode: 'auto' });
    assert.equal(p.bars, 'side');
  });
});
