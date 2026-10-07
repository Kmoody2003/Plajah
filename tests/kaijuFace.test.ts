// Tests for the kaiju's emotional range: expression resolution against old/new rigs, blinks that are quick
// (never a long black eye), and music-driven emotion choices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPRESSIONS, EmotionDirector, resolveFace, type EmotionInput, type Expr } from '../components/kaiju/stage3d/kaijuFace';

const LEGACY = new Set(['eye_L', 'eye_R', 'heye_L', 'heye_R', 'brow_L', 'brow_R', 'mouth_frown', 'mouth_grin', 'mouth_o']);
const FULL = new Set([...LEGACY,
  'eye_half_L', 'eye_half_R', 'eye_wide_L', 'eye_wide_R', 'eye_sad_L', 'eye_sad_R', 'eye_closed_L', 'eye_closed_R', 'eye_squint_L', 'eye_squint_R', 'eye_heart_L', 'eye_heart_R',
  'brow_up_L', 'brow_up_R', 'brow_sad_L', 'brow_sad_R', 'brow_flat_L', 'brow_flat_R',
  'mouth_smile', 'mouth_laugh', 'mouth_sad', 'mouth_smirk', 'mouth_ooh', 'mouth_shout', 'blush_big_L', 'blush_big_R', 'tear_L', 'tear_R', 'sweat']);

test('every expression resolves on an OLD rig to bones that exist, with exactly one eye, brow and mouth set', () => {
  for (const [name, spec] of Object.entries(EXPRESSIONS)) {
    const bones = resolveFace(spec, b => LEGACY.has(b));
    assert.ok(bones.length >= 3, `${name} → ${bones}`);
    for (const b of bones) assert.ok(LEGACY.has(b), `${name} uses ${b}, which an old rig lacks`);
    assert.ok(bones.some(b => /^h?eye/.test(b)) && bones.some(b => b.startsWith('brow')) && bones.some(b => b.startsWith('mouth')), `${name} is missing a part`);
  }
});

test('on a full rig the expressions are really different from each other', () => {
  const sigs = new Set<string>();
  for (const [name, spec] of Object.entries(EXPRESSIONS)) {
    const bones = resolveFace(spec, b => FULL.has(b));
    for (const b of bones) assert.ok(FULL.has(b), `${name}: ${b}`);
    sigs.add(bones.slice().sort().join(','));
  }
  assert.ok(sigs.size >= 14, `only ${sigs.size} distinct faces out of ${Object.keys(EXPRESSIONS).length}`);
  const eyes = (e: Expr) => resolveFace(EXPRESSIONS[e], b => FULL.has(b)).filter(b => /eye/.test(b)).join();
  assert.match(eyes('surprised'), /eye_wide/); assert.match(eyes('love'), /eye_heart/); assert.match(eyes('sad'), /eye_sad/);
  assert.match(resolveFace(EXPRESSIONS.sad, b => FULL.has(b)).join(), /tear/);
});

const base = (o: Partial<EmotionInput> = {}): EmotionInput => ({
  dt: 1 / 60, t: 0, tier: 'groove', silent: false, asleep: false, singing: false, vocalEnv: 0, sustain: false,
  kick: 0, beat: false, beats: 0, drop: false, snapped: false, eFast: 0.5, ...o,
});
const run = (d: EmotionDirector, sec: number, f: (t: number) => Partial<EmotionInput>, hz = 60) => {
  const seen: Expr[] = []; const blinks: number[] = []; let t = 0;
  for (; t < sec; t += 1 / hz) { const o = d.update(base({ dt: 1 / hz, t, beats: t * 2, ...f(t) })); seen.push(o.expr); blinks.push(o.blink); }
  return { seen, blinks };
};

test('a blink is quick: the lid is down for well under a quarter second, then fully open', () => {
  const d = new EmotionDirector('chora');
  const { blinks } = run(d, 120, () => ({}));
  let longest = 0, run1 = 0, count = 0;
  for (const b of blinks) { if (b > 0.5) { run1++; longest = Math.max(longest, run1); } else { if (run1) count++; run1 = 0; } }
  assert.ok(count >= 8, `only ${count} blinks in 120 s`);
  assert.ok(longest / 60 < 0.12, `eyes mostly-closed for ${(longest / 60).toFixed(2)} s`);
  assert.ok(blinks.some(b => b > 0.99) && blinks.every(b => b >= 0 && b <= 1));
});

test('blinking does not depend on frame rate (14 fps pane vs 60 fps)', () => {
  const closedFor = (hz: number) => { const d = new EmotionDirector('reello'); const { blinks } = run(d, 40, () => ({}), hz); let longest = 0, r = 0; for (const b of blinks) { if (b > 0.5) { r++; longest = Math.max(longest, r); } else r = 0; } return longest / hz; };
  assert.ok(closedFor(14) < 0.16, `${closedFor(14)}`);
  assert.ok(closedFor(60) < 0.12);
});

test('the music steers the mood: peaks are bright and loud, quiet is soft; singers sing; long silence sleeps', () => {
  const peak = run(new EmotionDirector('chora'), 60, () => ({ tier: 'peak', eFast: 0.9 })).seen;
  const quiet = run(new EmotionDirector('chora'), 60, () => ({ tier: 'quiet', eFast: 0.1 })).seen;
  const bright = (xs: Expr[]) => xs.filter(e => ['excited', 'laugh', 'joy', 'shout', 'surprised'].includes(e)).length / xs.length;
  assert.ok(bright(peak) > 0.75 && bright(quiet) < 0.3, `peak ${bright(peak)} quiet ${bright(quiet)}`);
  assert.equal(new Set(peak).size >= 3, true, 'a peak should not wear one face for a minute');
  assert.ok(run(new EmotionDirector('reello'), 5, () => ({ singing: true })).seen.every(e => e === 'sing' || e === 'surprised' || e === 'wink'));
  assert.ok(run(new EmotionDirector('reello'), 5, () => ({ tier: 'silent', silent: true, asleep: true })).seen.slice(60).every(e => e === 'sleep'));
});

test('faces hold for a while — no flicker — and a drop triggers a quick reaction', () => {
  const d = new EmotionDirector('chora');
  const { seen } = run(d, 60, () => ({ tier: 'groove' }));
  let changes = 0; for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) changes++;
  assert.ok(changes <= 20, `${changes} face changes in a minute`);
  const d2 = new EmotionDirector('chora'); run(d2, 4, () => ({}));
  const o = d2.update(base({ drop: true, beats: 9 }));
  assert.equal(o.expr, 'surprised');
});

test('personalities differ: Chora is warmer, Reello is cooler', () => {
  const tally = (who: 'chora' | 'reello') => { const c: Record<string, number> = {}; for (const e of run(new EmotionDirector(who), 300, () => ({ tier: 'groove' })).seen) c[e] = (c[e] ?? 0) + 1; return c; };
  const a = tally('chora'), b = tally('reello');
  const warm = (c: Record<string, number>) => (c.joy ?? 0) + (c.love ?? 0);
  assert.ok(warm(a) > warm(b) && (b.smug ?? 0) > (a.smug ?? 0), JSON.stringify({ a, b }));
});

// ---------------------------------------------------------------------------------------------- 2D mapping
import { FACE_2D, applyExpression } from '../components/kaiju/stage2d/kaijuExpression2D';
import { REST } from '../components/kaiju/kaijuPose';

test('every expression has a 2D face with in-range channels, and they all look different', () => {
  const seen = new Set<string>();
  for (const e of Object.keys(EXPRESSIONS) as Expr[]) {
    assert.ok(FACE_2D[e], `no 2D face for ${e}`);
    const p = { ...REST };
    applyExpression(p, { expr: e, blink: 0, gazeX: 0, gazeY: 0, browLift: 0, mouth: 0 });
    for (const k of ['eyeOpen', 'eyeScale', 'mouth', 'mouthW', 'blush', 'happy', 'closed', 'squint', 'hearts', 'tear', 'sweat'] as const) assert.ok(p[k] >= 0 && p[k] <= 1.6, `${e}.${k}=${p[k]}`);
    assert.ok(p.brow >= -1.3 && p.brow <= 1.3 && p.smile >= -1 && p.smile <= 1);
    seen.add(JSON.stringify([p.brow, p.browY, p.eyeOpen, p.eyeScale, p.mouth, p.smile, p.happy, p.closed, p.squint, p.hearts, p.tear, p.sweat]));
  }
  assert.equal(seen.size, Object.keys(EXPRESSIONS).length, 'two expressions map to the same 2D face');
});

test('a 2D blink squashes the eye and releases it fully', () => {
  const open = { ...REST }; applyExpression(open, { expr: 'grumpy', blink: 0, gazeX: 0, gazeY: 0, browLift: 0, mouth: 0 });
  const shut = { ...REST }; applyExpression(shut, { expr: 'grumpy', blink: 1, gazeX: 0, gazeY: 0, browLift: 0, mouth: 0 });
  assert.ok(open.eyeOpen === 1 && shut.eyeOpen < 0.1);
});
