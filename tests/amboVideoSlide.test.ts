// amboVideoSlide.test.ts — the Video slide timing state machine and field parsing.
//
// Run (tsx is not installed here):
//   node node_modules/esbuild/bin/esbuild tests/amboVideoSlide.test.ts --bundle --platform=node --format=esm --outfile=<tmp>/videoSlide.test.mjs
//   node --test <tmp>/videoSlide.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVideoFields, timingFor, wellState, shouldExpand, easeInOut, lerpRect, fitSize, DEFAULT_TIMING,
} from '../services/ambo/slideTemplates/videoSlide';
import { SLIDE_TEMPLATES, SLIDE_THEMES, buildSlideObjects, defaultFields } from '../services/ambo/slideTemplates/registry';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('Video slide fields', () => {
  test('defaults: 2.5 s delay, last frame, 1.2 s return, full volume', () => {
    const s = parseVideoFields({});
    assert.equal(s.delaySec, 2.5); assert.equal(s.ending, 'last'); assert.equal(s.returnFadeSec, 1.2);
    assert.equal(s.volume, 1); assert.equal(s.muted, false); assert.equal(s.inSec, 0); assert.equal(s.outSec, 0); assert.equal(s.url, '');
  });
  test('stay / negative / zero delay, black ending, clamps and trims', () => {
    assert.equal(parseVideoFields({ delaySec: '-1' }).delaySec, -1);
    assert.equal(parseVideoFields({ delaySec: 'Stay in slide' }).delaySec, -1);
    assert.equal(parseVideoFields({ delaySec: '0' }).delaySec, 0);
    assert.equal(parseVideoFields({ ending: 'Black' }).ending, 'black');
    assert.equal(parseVideoFields({ volume: '4' }).volume, 1);
    assert.equal(parseVideoFields({ muted: 'true' }).muted, true);
    assert.equal(parseVideoFields({ muted: 'false' }).muted, false);
    const t = parseVideoFields({ inSec: '3', outSec: '2' });
    assert.equal(t.inSec, 3); assert.equal(t.outSec, 0, 'out before in = play to the end');
    assert.equal(parseVideoFields({ inSec: '1', outSec: '9' }).outSec, 9);
    assert.equal(parseVideoFields({ delaySec: 'garbage' }).delaySec, 2.5);
  });
});

describe('Video slide state machine', () => {
  const tm = (o: Partial<ReturnType<typeof timingFor>> = {}) => ({ ...timingFor({ delaySec: 2.5, ending: 'last', returnFadeSec: 1.2 }, false), ...o });

  test('expands only once media time passes the delay', () => {
    assert.equal(shouldExpand(2.5, 1, true), false);
    assert.equal(shouldExpand(2.5, 2.6, true), true);
    assert.equal(shouldExpand(2.5, 3, false), false, 'buffering never expands');
    assert.equal(shouldExpand(0, 0, false), true);
    assert.equal(shouldExpand(-1, 99, true), false);
  });

  test('well → expanding → full with an eased morph', () => {
    const t = tm();
    assert.deepEqual(wellState(t, { expandAt: null, endAt: null }, 5).phase, 'well');
    const mid = wellState(t, { expandAt: 10, endAt: null }, 10 + DEFAULT_TIMING.expandSec / 2);
    assert.equal(mid.phase, 'expanding'); assert.ok(near(mid.k, .5));
    const early = wellState(t, { expandAt: 10, endAt: null }, 10 + DEFAULT_TIMING.expandSec * .1);
    assert.ok(early.k < .1, 'ease-in start');
    const full = wellState(t, { expandAt: 10, endAt: null }, 12);
    assert.equal(full.phase, 'full'); assert.equal(full.k, 1); assert.ok(full.active);
  });

  test('last frame: hold, shrink back into the well, settle', () => {
    const t = tm(), ev = { expandAt: 0, endAt: 20 };
    assert.equal(wellState(t, ev, 20.3).phase, 'ending');
    assert.equal(wellState(t, ev, 20.3).k, 1);
    const r = wellState(t, ev, 20 + DEFAULT_TIMING.holdSec + .6);
    assert.equal(r.phase, 'returning'); assert.ok(near(r.k, .5));
    const done = wellState(t, ev, 30);
    assert.equal(done.phase, 'done'); assert.equal(done.k, 0); assert.equal(done.layerA, 1); assert.equal(done.active, false);
  });

  test('black: fade to black, hold, fade to the design', () => {
    const t = tm({ ending: 'black' }), ev = { expandAt: 0, endAt: 20 };
    const a = wellState(t, ev, 20 + DEFAULT_TIMING.blackSec / 2);
    assert.equal(a.phase, 'ending'); assert.ok(near(a.blackA, .5)); assert.equal(a.layerA, 1);
    const p0 = 20 + DEFAULT_TIMING.blackSec + DEFAULT_TIMING.blackHoldSec;
    const r = wellState(t, ev, p0 + .6);
    assert.equal(r.phase, 'returning'); assert.equal(r.blackA, 1); assert.ok(near(r.layerA, .5)); assert.equal(r.k, 1);
    const done = wellState(t, ev, p0 + 2);
    assert.equal(done.phase, 'done'); assert.equal(done.layerA, 0); assert.equal(done.active, false);
  });

  test('ending mid-expand returns from where it was; ending in the well skips the hold', () => {
    const t = tm(), ev = { expandAt: 10, endAt: 10 + DEFAULT_TIMING.expandSec / 2 };
    const s = wellState(t, ev, ev.endAt + .1);
    assert.ok(near(s.k, .5)); assert.equal(s.phase, 'ending');
    const inWell = wellState(t, { expandAt: null, endAt: 5 }, 5.01);
    assert.equal(inWell.phase, 'returning'); assert.equal(inWell.k, 0);
  });

  test('zero delay starts full screen; reduced motion cuts instead of morphing', () => {
    const s = wellState(tm({ delaySec: 0 }), { expandAt: -Infinity, endAt: null }, 0);
    assert.equal(s.phase, 'full'); assert.equal(s.k, 1);
    const r = tm({ reduced: true });
    assert.equal(wellState(r, { expandAt: 10, endAt: null }, 10).k, 1, 'jump cut to full');
    assert.equal(wellState(r, { expandAt: 0, endAt: 20 }, 20 + DEFAULT_TIMING.holdSec + .01).phase, 'done', 'jump cut back');
  });

  test('geometry helpers', () => {
    assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1); assert.ok(near(easeInOut(.5), .5));
    const r = lerpRect({ x: 100, y: 100, w: 400, h: 225, rx: 20, rot: 4 }, { x: 0, y: 0, w: 1920, h: 1080, rx: 0, rot: 0 }, .5);
    assert.deepEqual(r, { x: 50, y: 50, w: 1160, h: 652.5, rx: 10, rot: 2 });
    const c = fitSize(1920, 1080, 1000, 1000, 'contain'), v = fitSize(1920, 1080, 1000, 1000, 'cover');
    assert.ok(near(c.w, 1000, 1e-6) && near(c.h, 562.5, 1e-6));
    assert.ok(near(v.w, 1777.7778, 1e-3) && near(v.h, 1000, 1e-6));
  });
});

describe('Video templates', () => {
  const vids = SLIDE_TEMPLATES.filter(t => t.category === 'Video');
  test('≥ 6 video templates, all media: video, one front live well emitted last', () => {
    assert.ok(vids.length >= 6, `${vids.length}`);
    for (const t of vids) {
      assert.equal(t.media, 'video', t.id);
      for (const th of SLIDE_THEMES) for (const [W, H] of [[1920, 1080], [1080, 1920], [3840, 1080], [1440, 1080]]) {
        const objs = buildSlideObjects(t.id, th.id, defaultFields(t), W, H)!;
        const lives = objs.filter(o => o.live?.drawer === 'video.well');
        assert.equal(lives.length, 1, `${t.id} ${th.id}`);
        assert.equal(objs[objs.length - 1], lives[0], `${t.id} ${th.id} live well is last`);
        assert.ok(lives[0].front);
        const w = (lives[0].live!.props as any).well;
        assert.ok(w.w * w.h >= W * H * .05 && w.x >= -1 && w.y >= -1 && w.x + w.w <= W + 1 && w.y + w.h <= H + 1, `${t.id} ${th.id} ${W}x${H} well ${JSON.stringify(w)}`);
      }
    }
  });
});
