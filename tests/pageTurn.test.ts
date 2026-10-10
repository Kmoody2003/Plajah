import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DRAG, FORMAT_DEFAULTS, PAGE_TURNS, PAGE_TURN_IDS, PICKABLE_STYLES, REDUCED_DURATION_MS, decideDrag, defaultStyleForKind, dirForArrowKey,
  dirForOrderChange, dirForTapSide, dragDirection, dragProgress, easeTurn, effectiveTurn, epubTurnKind, getSpec, inferBookKind, isJump,
  isPageAnimationPref, isPageTurnId, originEdge, releaseVelocity, resolvePageTurn, sanitizeAuthorPageTurn, shouldStartDrag, springSettled,
  springStep, timedProgress, travelDirection, travelToward, type AuthorPageTurn, type PageTurnId,
} from '../services/lorea/pageTransitions';
import {
  clipRectByLine, curlGeometry, frameFor, gradientAlong, polygonArea, reflectPoint, reflectionMatrix, type FrameOut,
} from '../services/lorea/pageTurnFrames';
import { parsePrefs } from '../services/lorea/pageTurnPrefs';
import { PHASE3_TRANSITIONS } from '../components/plajahPixels/engine/fx/phase3Transitions';
import { FORGE_TRANSITIONS } from '../services/fabula/forgeTransitions';
import { createUpgrade, makeBundle } from '../services/bookTela/upgrade';
import { READER_ONLY_NOTES } from '../services/bookTela/model';
import { newReport } from '../services/bookTela/export/common';
import type { BookSource } from '../services/bookTela/types';

const REQUIRED: PageTurnId[] = ['none', 'curl', 'flip', 'slide', 'dissolve', 'wipe', 'iris', 'zoom', 'cardflip', 'cube'];

describe('page-turn registry integrity', () => {
  it('has every required style, unique ids, and a spec per id', () => {
    for (const id of REQUIRED) assert.ok(PAGE_TURN_IDS.includes(id), `${id} missing`);
    assert.equal(new Set(PAGE_TURN_IDS).size, PAGE_TURN_IDS.length);
    assert.equal(PAGE_TURNS.length, PAGE_TURN_IDS.length);
    assert.ok(!PICKABLE_STYLES.includes('none'));
    for (const t of PAGE_TURNS) assert.equal(getSpec(t.id), t);
    assert.equal(getSpec('bogus' as PageTurnId).id, 'none');
  });
  it('declares sane durations, easing and capability flags', () => {
    for (const t of PAGE_TURNS) {
      assert.ok(t.label.length > 0 && t.blurb.length > 0);
      if (t.id === 'none') { assert.equal(t.durationMs, 0); continue; }
      assert.ok(t.durationMs >= 200 && t.durationMs <= 1000, `${t.id} duration ${t.durationMs}`);
      assert.ok(t.needsIncoming);
      assert.equal(easeTurn(t.easing, 0), 0); assert.equal(easeTurn(t.easing, 1), 1);
    }
    assert.ok(getSpec('curl').needsFlap && getSpec('curl').interactive && getSpec('curl').reversible);
    assert.ok(getSpec('flip').spreadAware && getSpec('flip').interactive);
    assert.ok(!getSpec('dissolve').directionAware);
    assert.ok(PAGE_TURNS.filter(t => t.interactive).length >= 5);
  });
  it('type guards', () => {
    assert.ok(isPageTurnId('curl')); assert.ok(!isPageTurnId('__proto__')); assert.ok(!isPageTurnId(3));
    assert.ok(isPageAnimationPref('author') && isPageAnimationPref('reduce') && isPageAnimationPref('off') && isPageAnimationPref('cube'));
    assert.ok(!isPageAnimationPref('sparkle'));
  });
});

describe('mapping to the Fabula/Pixels transition modules', () => {
  it('every referenced Forge transition and preset exists in the real modules', () => {
    const forge = new Map(FORGE_TRANSITIONS.map(t => [t.id, t]));
    for (const t of PAGE_TURNS) {
      const r = t.reuse;
      assert.ok(r.note.length > 20, `${t.id} needs an explanation of what was reused or why not`);
      if (!r.forgeId) { assert.equal(r.kind, 'new'); continue; }
      assert.ok(PHASE3_TRANSITIONS.some(p => p.id === r.forgeId) || forge.has(r.forgeId), `${t.id}: Forge transition ${r.forgeId} not found`);
      const f = forge.get(r.forgeId)!;
      assert.ok(f, `${t.id}: ${r.forgeId} not published through FORGE_TRANSITIONS`);
      if (r.presetId) assert.ok(f.presets.some(p => p.id === r.presetId), `${t.id}: preset ${r.presetId} missing on ${r.forgeId}`);
    }
  });
  it('shared params really equal the Forge preset values', () => {
    const forge = new Map(FORGE_TRANSITIONS.map(t => [t.id, t]));
    for (const t of PAGE_TURNS) {
      const r = t.reuse; if (r.kind !== 'forge-params') continue;
      assert.ok(r.sharedParams && r.sharedParams.length, `${t.id} claims forge-params but shares none`);
      const f = forge.get(r.forgeId!)!;
      const preset = f.presets.find(p => p.id === r.presetId);
      for (const k of r.sharedParams!) {
        const expected = preset ? preset.params[k] : f.defaults[k];
        assert.notEqual(expected, undefined, `${t.id}: ${r.forgeId} has no param ${k}`);
        assert.equal(t.params[k], expected, `${t.id}.${k} (${t.params[k]}) != ${r.forgeId}/${r.presetId}.${k} (${expected})`);
      }
    }
  });
  it('page easing reuses the film renderer curves', async () => {
    const motion = await import('../services/dossier/film/motion');
    for (const t of PAGE_TURNS) for (const x of [0, .2, .5, .8, 1]) assert.equal(easeTurn(t.easing, x), motion.ease(t.easing, x));
  });
  it('film-only styles are not claimed (GLSL needs textures; reader pages are live DOM)', () => {
    assert.ok(PAGE_TURNS.filter(t => t.reuse.kind !== 'forge-params').length >= 4, 'curl/cover/wipe/none are not straight ports');
    assert.equal(getSpec('curl').reuse.kind, 'forge-inspired');
  });
});

describe('reduced motion + reader/author resolution', () => {
  const base = { kind: 'novel' as const, systemReducedMotion: false };
  it("a style the reader picked themselves plays even when the device asks for reduced motion (a deliberate opt-in)", () => {
    for (const id of PICKABLE_STYLES) {
      const r = resolvePageTurn({ ...base, pref: id, systemReducedMotion: true });
      assert.equal(r.id, id); assert.equal(r.reason, 'user');
    }
  });
  it('system reduced motion softens the author pick and the format default into a short fade with no drag-following', () => {
    const f = resolvePageTurn({ ...base, pref: 'author', systemReducedMotion: true });
    assert.equal(f.id, 'dissolve'); assert.equal(f.durationMs, REDUCED_DURATION_MS); assert.equal(f.interactive, false); assert.equal(f.reason, 'reduced-system');
    const a = resolvePageTurn({ ...base, pref: 'author', systemReducedMotion: true, author: { style: 'curl' } });
    assert.equal(a.id, 'dissolve'); assert.equal(a.reason, 'reduced-system');
  });
  it("the reader's own 'reduce' does the same; 'off' is instant", () => {
    const r = resolvePageTurn({ ...base, pref: 'reduce', author: { style: 'cube' } });
    assert.equal(r.id, 'dissolve'); assert.equal(r.reason, 'reduced-pref'); assert.ok(r.durationMs <= 150);
    const o = resolvePageTurn({ ...base, pref: 'off', author: { style: 'cube' } });
    assert.equal(o.id, 'none'); assert.equal(o.durationMs, 0); assert.equal(o.reason, 'off');
  });
  it("an author's 'none' is never turned into an animation by reduced motion", () => {
    const r = resolvePageTurn({ ...base, pref: 'author', systemReducedMotion: true, author: { style: 'none' } });
    assert.equal(r.id, 'none');
  });
  it('precedence: page > chapter > book > format default; reader style overrides the author', () => {
    const author: AuthorPageTurn = { style: 'flip', perChapter: { c1: 'cube', c2: 'auto' }, perPage: { f9: 'wipe' } };
    const at = (o: Partial<Parameters<typeof resolvePageTurn>[0]>) => resolvePageTurn({ ...base, pref: 'author', author, ...o });
    assert.equal(at({ chapterId: 'c1', pageId: 'f9' }).id, 'wipe');
    assert.equal(at({ chapterId: 'c1', pageId: 'f2' }).id, 'cube');
    assert.equal(at({ chapterId: 'c2', pageId: 'f2' }).id, 'flip');
    assert.equal(at({ chapterId: 'zz' }).reason, 'author-book');
    assert.equal(resolvePageTurn({ ...base, pref: 'author' }).id, FORMAT_DEFAULTS.novel);
    assert.equal(resolvePageTurn({ ...base, pref: 'author' }).reason, 'format-default');
    assert.equal(resolvePageTurn({ ...base, pref: 'cardflip', author }).id, 'cardflip');
    assert.equal(resolvePageTurn({ ...base, pref: 'cardflip', author }).reason, 'user');
  });
  it('format defaults: picture flip/curl, comic+manga slide, textbook subtle', () => {
    assert.ok(['curl', 'flip'].includes(defaultStyleForKind('picture')));
    assert.equal(defaultStyleForKind('comic'), 'slide'); assert.equal(defaultStyleForKind('manga'), 'slide');
    assert.ok(['slide', 'dissolve'].includes(defaultStyleForKind('textbook')));
    assert.equal(inferBookKind({ format: 'MANGA' }), 'manga');
    assert.equal(inferBookKind({ visualLed: true, rtl: true }), 'manga');
    assert.equal(inferBookKind({ visualLed: true }), 'picture');
    assert.equal(inferBookKind({ format: 'GRAPHIC_NOVEL' }), 'comic');
    assert.equal(inferBookKind({ format: 'NON_FICTION' }), 'textbook');
    assert.equal(inferBookKind({}), 'novel');
  });
  it('sanitizes untrusted author data', () => {
    assert.equal(sanitizeAuthorPageTurn(null), undefined);
    assert.equal(sanitizeAuthorPageTurn({ style: 'explode' }), undefined);
    assert.deepEqual(sanitizeAuthorPageTurn({ style: 'curl', perChapter: { a: 'cube', b: 'nope', c: 'auto' }, junk: 1 }), { style: 'curl', perChapter: { a: 'cube', c: 'auto' } });
    const many = Object.fromEntries(Array.from({ length: 900 }, (_, i) => [`f${i}`, 'slide']));
    assert.equal(Object.keys(sanitizeAuthorPageTurn({ perPage: many })!.perPage!).length, 500);
  });
  it('stored prefs parse defensively; sound defaults OFF', () => {
    assert.deepEqual(parsePrefs(null), { animation: 'author', sound: false });
    assert.deepEqual(parsePrefs({ animation: 'wat', sound: 'yes' }), { animation: 'author', sound: false });
    assert.deepEqual(parsePrefs({ animation: 'cube', sound: true }), { animation: 'cube', sound: true });
  });
});

describe('RTL direction mapping', () => {
  it('forward leaves left in LTR, right in RTL; back is the opposite', () => {
    assert.equal(travelDirection(1, false), 'left'); assert.equal(travelDirection(-1, false), 'right');
    assert.equal(travelDirection(1, true), 'right'); assert.equal(travelDirection(-1, true), 'left');
    assert.equal(originEdge(1, false), 'right'); assert.equal(originEdge(1, true), 'left');
  });
  it('tap zones and arrow keys mirror in RTL', () => {
    assert.equal(dirForTapSide('right', false), 1); assert.equal(dirForTapSide('left', false), -1);
    assert.equal(dirForTapSide('right', true), -1); assert.equal(dirForTapSide('left', true), 1);
    assert.equal(dirForArrowKey('ArrowRight', false), 1); assert.equal(dirForArrowKey('ArrowLeft', false), -1);
    assert.equal(dirForArrowKey('ArrowRight', true), -1); assert.equal(dirForArrowKey('ArrowLeft', true), 1);
    assert.equal(dirForArrowKey('Enter', false), 0);
  });
  it('drag direction and travel mirror in RTL', () => {
    assert.equal(dragDirection(-30, false), 1); assert.equal(dragDirection(30, false), -1);
    assert.equal(dragDirection(-30, true), -1); assert.equal(dragDirection(30, true), 1);
    assert.equal(dragDirection(0, false), 0);
    assert.equal(travelToward(-100, 1, false), 100); assert.equal(travelToward(100, 1, true), 100);
    assert.equal(travelToward(100, -1, false), 100); assert.equal(travelToward(-100, -1, true), 100);
  });
  it('the curl fold line is the exact mirror image in RTL', () => {
    const l = curlGeometry(0.4, 400, 560, false, 11), r = curlGeometry(0.4, 400, 560, true, 11);
    assert.ok(Math.abs(l.P[0] - (400 - r.P[0])) < 1e-9); assert.ok(Math.abs(l.n[0] + r.n[0]) < 1e-9); assert.ok(Math.abs(l.n[1] - r.n[1]) < 1e-9);
    assert.ok(Math.abs(polygonArea(l.peel) - polygonArea(r.peel)) < 1e-6);
  });
  it('frames: slide travels left forward in LTR and right forward in RTL', () => {
    const f = (rtl: boolean, dir: 1 | -1) => frameFor({ id: 'slide', p: 0.5, dir, rtl, w: 400, h: 560 });
    assert.match(f(false, 1).frame.from.transform, /-50%/); assert.match(f(true, 1).frame.from.transform, /50%/);
    assert.doesNotMatch(f(true, 1).frame.from.transform, /-50%/);
    // back = forward in reverse with roles swapped
    const back = f(false, -1); assert.equal(back.swap, true); assert.match(back.frame.from.transform, /-50%/);
  });
  it('wipe sweeps from the edge the page is pulled from, mirrored for RTL and for back', () => {
    const m = (rtl: boolean, dir: 1 | -1) => frameFor({ id: 'wipe', p: 0.4, dir, rtl, w: 400, h: 560 }).frame.to.mask;
    assert.match(m(false, 1), /to left/); assert.match(m(true, 1), /to right/);
    assert.match(m(false, -1), /to right/); assert.match(m(true, -1), /to left/);
  });
});

describe('drag commit / cancel decision math', () => {
  it('only starts on a clearly horizontal gesture; mouse needs an edge zone, touch does not', () => {
    assert.equal(shouldStartDrag({ dx: -4, dy: 0, pointerType: 'touch', startXFrac: .5 }), false);
    assert.equal(shouldStartDrag({ dx: -40, dy: 40, pointerType: 'touch', startXFrac: .5 }), false);   // diagonal = scroll
    assert.equal(shouldStartDrag({ dx: -40, dy: 5, pointerType: 'touch', startXFrac: .5 }), true);
    assert.equal(shouldStartDrag({ dx: -40, dy: 5, pointerType: 'mouse', startXFrac: .5 }), false);
    assert.equal(shouldStartDrag({ dx: -40, dy: 5, pointerType: 'mouse', startXFrac: .95 }), true);
    assert.equal(shouldStartDrag({ dx: 40, dy: 5, pen: true, pointerType: 'pen', startXFrac: .05 } as any), true);
  });
  it('progress is clamped and scales with width', () => {
    assert.equal(dragProgress(-50, 400), 0); assert.equal(dragProgress(0, 400), 0);
    assert.equal(dragProgress(10_000, 400), 1); assert.equal(dragProgress(100, 0), 0);
    assert.ok(Math.abs(dragProgress(170, 400) - 0.5) < 1e-9);
  });
  it('commits on progress, flicks override both ways, cancels when dropped back', () => {
    assert.equal(decideDrag({ progress: 0.7, velocityPxPerS: 0 }), 'commit');
    assert.equal(decideDrag({ progress: 0.1, velocityPxPerS: 0 }), 'cancel');
    assert.equal(decideDrag({ progress: DRAG.commitProgress, velocityPxPerS: 0 }), 'commit');
    assert.equal(decideDrag({ progress: 0.12, velocityPxPerS: DRAG.flickPxPerS }), 'commit');
    assert.equal(decideDrag({ progress: 0.9, velocityPxPerS: -DRAG.flickPxPerS }), 'cancel');
    assert.equal(decideDrag({ progress: 0.9, velocityPxPerS: -100 }), 'commit');           // a slow drift back does not cancel
  });
  it('estimates release velocity from the last ~90ms of samples', () => {
    assert.equal(releaseVelocity([]), 0); assert.equal(releaseVelocity([{ t: 0, x: 0 }]), 0);
    const v = releaseVelocity([{ t: 0, x: 400 }, { t: 400, x: 380 }, { t: 450, x: 300 }, { t: 490, x: 250 }]);
    assert.ok(v < -1300 && v > -1600, `v=${v}`);
  });
  it('spring settles on its target without large overshoot, at 30 and 60 fps', () => {
    for (const dt of [1 / 30, 1 / 60]) {
      for (const target of [0, 1] as const) {
        let s = { x: target === 1 ? 0.55 : 0.4, v: target === 1 ? 2 : -1 };
        let max = s.x, min = s.x, steps = 0;
        while (!springSettled(s, target) && steps < 400) { s = springStep(s, target, dt); max = Math.max(max, s.x); min = Math.min(min, s.x); steps++; }
        assert.ok(steps < 400, 'did not settle');
        assert.ok(steps * dt < 1.0, `slow settle ${steps * dt}s`);
        assert.ok(max <= 1.06 && min >= -0.06, `overshoot ${min}..${max}`);
      }
    }
  });
  it('timed progress is monotonic and bounded for every style', () => {
    for (const t of PAGE_TURNS) {
      let last = -1;
      for (let ms = 0; ms <= t.durationMs + 50; ms += 10) { const p = timedProgress(t, ms); assert.ok(p >= last - 1e-12 && p >= 0 && p <= 1); last = p; }
      if (t.durationMs) assert.equal(timedProgress(t, t.durationMs), 1);
    }
  });
});

describe('long-book behaviour (240 pages)', () => {
  const turn = resolvePageTurn({ pref: 'author', systemReducedMotion: false, kind: 'novel' });
  it('steps animate with the right direction; jumps fade', () => {
    let animated = 0, jumps = 0;
    for (let i = 0; i < 239; i++) { const e = effectiveTurn(turn, i, i + 1); assert.equal(e.dir, 1); assert.equal(e.id, turn.id); animated++; }
    for (const [a, b] of [[0, 120], [200, 3], [10, 12], [50, 49]] as const) {
      const e = effectiveTurn(turn, a, b);
      if (isJump(a, b)) { assert.equal(e.id, 'dissolve'); assert.ok(e.durationMs <= 240); jumps++; } else assert.equal(e.id, turn.id);
      assert.equal(e.dir, dirForOrderChange(a, b));
    }
    assert.equal(animated, 239); assert.equal(jumps, 3);
  });
  it('rapid chained turns shorten, and none stays instant', () => {
    assert.ok(effectiveTurn(turn, 5, 6, true).durationMs < effectiveTurn(turn, 5, 6, false).durationMs);
    assert.equal(effectiveTurn({ ...turn, id: 'none', durationMs: 0 }, 1, 2).durationMs, 0);
  });
});

describe('frame geometry', () => {
  const W = 400, H = 560;
  const nums = (f: FrameOut) => JSON.stringify(f);
  it('no style ever emits NaN/Infinity across progress, direction, RTL and spread', () => {
    for (const id of PAGE_TURN_IDS) for (const dir of [1, -1] as const) for (const rtl of [false, true]) for (const spread of [false, true]) {
      for (let i = 0; i <= 20; i++) {
        const { frame } = frameFor({ id, p: i / 20, dir, rtl, w: spread ? W * 2 : W, h: H, spread });
        const s = nums(frame); assert.doesNotMatch(s, /NaN|Infinity|undefined/, `${id} p=${i / 20} dir=${dir} rtl=${rtl} spread=${spread}`);
      }
    }
  });
  it('p=0 shows the outgoing page untouched and p=1 leaves the incoming page showing', () => {
    for (const id of PICKABLE_STYLES) {
      const a = frameFor({ id, p: 0, dir: 1, rtl: false, w: W, h: H });
      assert.equal(a.frame.from.hidden, false, `${id} from hidden at 0`);
      assert.ok(a.frame.from.opacity >= 0.999, `${id} from opacity at 0`);
      const z = frameFor({ id, p: 1, dir: 1, rtl: false, w: W, h: H });
      assert.equal(z.frame.to.hidden, false, `${id} to hidden at 1`);
      assert.ok(z.frame.to.opacity >= 0.999, `${id} to opacity at 1`);
      assert.equal(z.frame.to.mask === 'none' || z.frame.to.mask.length > 0, true);
    }
  });
  it('reversible styles play back as the reverse of forward', () => {
    for (const id of PICKABLE_STYLES.filter(i => getSpec(i).reversible)) {
      const fwd = frameFor({ id, p: 0.25, dir: 1, rtl: false, w: W, h: H });
      const back = frameFor({ id, p: 0.75, dir: -1, rtl: false, w: W, h: H });
      assert.equal(back.swap, true); assert.ok(Math.abs(back.q - 0.25) < 1e-12);
      assert.equal(nums(back.frame), nums(fwd.frame));
    }
    assert.equal(frameFor({ id: 'wipe', p: 0.5, dir: -1, rtl: false, w: W, h: H }).swap, false);
  });
  it('curl: fold sweeps the whole page, peel + keep tile the page, flap reflects into the kept side', () => {
    let lastPeel = -1;
    for (let i = 0; i <= 20; i++) {
      const q = i / 20, g = curlGeometry(q, W, H, false, 11);
      const peel = polygonArea(g.peel), keep = polygonArea(g.keep);
      assert.ok(Math.abs(peel + keep - W * H) < 1, `areas at q=${q}: ${peel}+${keep}`);
      assert.ok(peel >= lastPeel - 1e-6); lastPeel = peel;
    }
    assert.ok(polygonArea(curlGeometry(0, W, H, false, 11).peel) < 1);
    assert.ok(polygonArea(curlGeometry(1, W, H, false, 11).keep) < 1);
  });
  it('reflection matrix: fixes the fold line, is an involution, preserves distances', () => {
    const g = curlGeometry(0.5, W, H, false, 11);
    const m = reflectionMatrix(g.P, g.n);
    const onLine: [number, number] = [g.P[0] - g.n[1] * 50, g.P[1] + g.n[0] * 50];
    const r = reflectPoint(g.P, g.n, onLine); assert.ok(Math.hypot(r[0] - onLine[0], r[1] - onLine[1]) < 1e-9);
    const p: [number, number] = [310, 200]; const rr = reflectPoint(g.P, g.n, reflectPoint(g.P, g.n, p));
    assert.ok(Math.hypot(rr[0] - p[0], rr[1] - p[1]) < 1e-9);
    const q2 = reflectPoint(g.P, g.n, p);
    assert.ok(Math.abs((m.a * p[0] + m.c * p[1] + m.e) - q2[0]) < 1e-9 && Math.abs((m.b * p[0] + m.d * p[1] + m.f) - q2[1]) < 1e-9);
    assert.ok(Math.abs(m.a * m.d - m.b * m.c + 1) < 1e-9);       // determinant -1: a true mirror
  });
  it('clipRectByLine and gradientAlong behave', () => {
    assert.equal(polygonArea(clipRectByLine(100, 100, [50, 0], [1, 0], 'pos')), 5000);
    assert.equal(clipRectByLine(100, 100, [500, 0], [1, 0], 'pos').length, 0);
    assert.match(gradientAlong([1, 0], [50, 0], 100, 100, [[0, 'red'], [10, 'blue']]), /^linear-gradient\(90deg, red 50px, blue 60px\)$/);
  });
  it('a spread curl is a flip (the spine is the fold)', () => {
    assert.equal(frameFor({ id: 'curl', p: 0.5, dir: 1, rtl: false, w: 800, h: 560, spread: true }).effectiveId, 'flip');
    assert.ok(frameFor({ id: 'flip', p: 0.5, dir: 1, rtl: false, w: 800, h: 560, spread: true }).frame.leafFront);
    assert.equal(frameFor({ id: 'flip', p: 0.5, dir: 1, rtl: false, w: 400, h: 560 }).frame.leafFront, null);
  });
  it('3D styles use transforms only (no layout properties) and a perspective', () => {
    for (const id of ['flip', 'cube', 'cardflip'] as const) {
      const f = frameFor({ id, p: 0.4, dir: 1, rtl: false, w: W, h: H }).frame;
      assert.ok(f.perspectivePx > W / 2, `${id} perspective`);
      assert.match(f.from.transform, /rotateY/);
    }
  });
});

describe('EPUB degrade', () => {
  it('3D/curl styles become a slide on the live EPUB container; gentle ones keep their kind', () => {
    for (const id of ['curl', 'flip', 'cube', 'cardflip', 'cover', 'slide'] as const) assert.equal(epubTurnKind(id), 'slide');
    assert.equal(epubTurnKind('dissolve'), 'dissolve'); assert.equal(epubTurnKind('wipe'), 'wipe');
    assert.equal(epubTurnKind('iris'), 'iris'); assert.equal(epubTurnKind('zoom'), 'zoom'); assert.equal(epubTurnKind('none'), 'none');
  });
  it('every style has an EPUB kind', () => { for (const id of PAGE_TURN_IDS) assert.ok(['none', 'slide', 'dissolve', 'wipe', 'iris', 'zoom'].includes(epubTurnKind(id))); });
  it('REQUIRED list is covered', () => { for (const id of REQUIRED) assert.ok(isPageTurnId(id)); });
});

describe('author control on the Tela edition', () => {
  const book: BookSource = { id: 'b1', title: 'T', authors: ['A'], language: 'en', chapters: [{ id: 'c1', title: 'One', html: '<p>Hello world.</p>' }, { id: 'c2', title: 'Two', html: '<p>More text.</p>' }] };
  it('the upgrade record keeps a sanitized choice and the published bundle carries it', () => {
    const r = createUpgrade(book, { pageTurn: { style: 'curl', perChapter: { c2: 'wipe', c1: 'nope' as any } } });
    assert.deepEqual(r.upgrade.pageTurn, { style: 'curl', perChapter: { c2: 'wipe' } });
    const bundle = makeBundle(book, r.upgrade, r.doc, 'v1');
    assert.deepEqual(bundle.pageTurn, { style: 'curl', perChapter: { c2: 'wipe' } });
    // and the resolver sees it as the author's choice
    const t = resolvePageTurn({ pref: 'author', systemReducedMotion: false, kind: 'novel', author: bundle.pageTurn, chapterId: 'c2' });
    assert.equal(t.id, 'wipe'); assert.equal(t.reason, 'author-chapter');
  });
  it('no choice stored means no field (Firestore rejects undefined) and the format default applies', () => {
    const r = createUpgrade(book, {});
    assert.ok(!('pageTurn' in r.upgrade));
    assert.ok(!('pageTurn' in makeBundle(book, r.upgrade, r.doc, 'v1')));
    assert.equal(resolvePageTurn({ pref: 'author', systemReducedMotion: false, kind: 'picture' }).id, 'flip');
  });
  it('the export fidelity report says page turns do not export', () => {
    assert.ok(READER_ONLY_NOTES.some(n => /page-turn/i.test(n) && /not carry|do not/i.test(n)));
    const r = createUpgrade(book, {});
    const model: any = { fidelity: [], omitted: [], exportedAt: 'x' };
    assert.deepEqual(newReport('EPUB_REFLOW', model).readerOnly, READER_ONLY_NOTES);
    void r;
  });
});
