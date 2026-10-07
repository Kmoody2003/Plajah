// Tests for the 3D Kaiju disco's directors: what the stage does with the music's energy, when the
// camera cuts, and how dances are chosen / timed. Deterministic: the directors are pure functions of
// the audio features fed in, so we drive them with synthetic energy curves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraDirector, StageDirector, type DirectorInput } from '../components/kaiju/stage3d/kaijuStageDirector';
import { danceTimeScale, pickDance, type DanceMeta } from '../components/kaiju/stage3d/kaijuDances';

const DT = 1 / 30;
function input(t: number, level: number, intensity: number, extra: Partial<DirectorInput> = {}): DirectorInput {
  return { dt: DT, t, beats: t * 2, beat: false, kick: 0, onset: 0, level, bass: level, treble: level, intensity, bpm: 120, silent: false, style: 'edm', vocalMode: 'none', ...extra };
}
/** Run the stage director for `sec` seconds at a constant energy; returns the final state + every tier seen. */
function run(d: StageDirector, from: number, sec: number, level: number, intensity: number) {
  const tiers = new Set<string>(); let drops = 0; let last = d.s;
  for (let t = from; t < from + sec; t += DT) { last = d.update(input(t, level, intensity)); tiers.add(last.tier); if (last.drop) drops++; }
  return { s: last, tiers, drops };
}

test('loud, sustained music brings the disco ball down; props glide rather than pop', () => {
  const d = new StageDirector();
  run(d, 0, 2, 0.5, 1);
  const mid = run(d, 2, 14, 0.9, 1.5);
  assert.equal(mid.s.tier, 'peak');
  assert.ok(mid.s.prop.ball > 0.95, `ball should be fully lowered, got ${mid.s.prop.ball}`);
  assert.ok(mid.s.prop.lasers > 0.9 && mid.s.prop.heads > 0.9);
  // no single frame may move the ball by more than its glide rate
  const e = new StageDirector(); run(e, 0, 2, 0.5, 1);
  let prev = e.s.prop.ball, maxStep = 0;
  for (let t = 2; t < 16; t += DT) { const s = e.update(input(t, 0.9, 1.5)); maxStep = Math.max(maxStep, Math.abs(s.prop.ball - prev)); prev = s.prop.ball; }
  assert.ok(maxStep < 0.02, `ball moved ${maxStep} in one frame`);
});

test('a quiet passage dims the scene, finds the follow-spot and sends the ball back up', () => {
  const d = new StageDirector();
  run(d, 0, 18, 0.9, 1.5);                       // peak first, ball down
  assert.ok(d.s.prop.ball > 0.9);
  const q = run(d, 18, 25, 0.08, 0.5);
  assert.equal(q.s.tier, 'quiet');
  assert.ok(q.s.dim > 0.65, `dim ${q.s.dim}`);
  assert.ok(q.s.spot > 0.9, `spot ${q.s.spot}`);
  assert.ok(q.s.prop.ball < 0.05, `ball ${q.s.prop.ball}`);
  assert.ok(q.s.prop.heads < 0.05);
});

test('tier changes need the energy to HOLD — a single loud second does not flip the room', () => {
  const d = new StageDirector();
  run(d, 0, 40, 0.45, 1);                        // settled groove
  const start = d.s.tier;
  const blip = run(d, 10, 1.2, 0.95, 1.8);
  assert.equal(start, 'groove');
  assert.ok(!blip.tiers.has('peak'), 'a 1.2 s spike must not reach peak');
});

test('a drop fires confetti once, then respects its cooldown', () => {
  const d = new StageDirector();
  run(d, 0, 12, 0.35, 1);
  const hit = run(d, 12, 3, 0.95, 1.8);
  assert.equal(hit.drops, 1);
  const again = run(d, 15, 3, 0.2, 0.7); const second = run(d, 18, 2, 0.95, 1.8);
  assert.equal(again.drops + second.drops, 0, 'no second drop inside the 12 s cooldown');
});

test('silence parks the room: dimmed, no props out', () => {
  const d = new StageDirector();
  run(d, 0, 12, 0.9, 1.5);
  for (let t = 12; t < 30; t += DT) d.update(input(t, 0, 0, { silent: true }));
  assert.equal(d.s.tier, 'silent');
  assert.ok(d.s.dim > 0.7);
  assert.ok(d.s.prop.ball < 0.05 && d.s.prop.lasers < 0.05);
});

// ---------------------------------------------------------------------------------------------- camera
const ctx = (over: Partial<Parameters<CameraDirector['update']>[1]> = {}) => ({
  a: new THREE.Vector3(-1.3, 0.9, 0), b: new THREE.Vector3(1.3, 0.9, 0), tier: 'groove' as const, drop: false, ball: 0, singer: -1, eFast: 0.5, vocal: false, ...over,
});

test('the camera only cuts on the bar, and quicker when the music is intense', () => {
  const count = (tier: 'quiet' | 'peak') => {
    const c = new CameraDirector(); let cuts = 0;
    for (let i = 0; i < 30 * 60; i++) { const t = i * DT; const p = c.update(input(t, 0.5, 1, { beats: t * 2 }), ctx({ tier, eFast: tier === 'peak' ? 0.9 : 0.1 })); if (p.cut) cuts++; }
    return cuts;
  };
  const quiet = count('quiet'), peak = count('peak');
  assert.ok(peak > quiet * 1.8, `peak ${peak} vs quiet ${quiet} cuts per minute`);
  assert.ok(quiet >= 2 && peak <= 60);
});

test('a drop forces a cut to an impact shot; the ball coming down earns a ball-cam', () => {
  const c = new CameraDirector();
  for (let i = 0; i < 90; i++) c.update(input(i * DT, 0.5, 1, { beats: i * DT * 2 }), ctx());
  let p = c.update(input(3.1, 0.9, 1.6, { beats: 6.2 }), ctx({ drop: true, tier: 'peak' }));
  assert.ok(p.cut && (p.kind === 'snap' || p.kind === 'hero'), `drop cut to ${p.kind}`);
  const c2 = new CameraDirector(); let sawBall = false;
  for (let i = 0; i < 300; i++) { p = c2.update(input(i * DT, 0.8, 1.4, { beats: i * DT * 2 }), ctx({ tier: 'peak', ball: 0.4 })); if (p.kind === 'ball') sawBall = true; }
  assert.ok(sawBall);
});

test('whoever is singing gets close-ups', () => {
  const c = new CameraDirector(); const seen: Record<string, number> = {};
  for (let i = 0; i < 30 * 120; i++) { const t = i * DT; const p = c.update(input(t, 0.6, 1.1, { beats: t * 2, vocalMode: 'sing' }), ctx({ singer: 1, vocal: true })); if (p.cut) seen[p.kind] = (seen[p.kind] ?? 0) + 1; }
  assert.ok((seen.closeB ?? 0) > (seen.closeA ?? 0), JSON.stringify(seen));
  assert.ok((seen.closeB ?? 0) >= 3);
});

test('the camera never ends up inside the dancers or under the floor', () => {
  const c = new CameraDirector();
  for (let i = 0; i < 30 * 240; i++) {
    const t = i * DT; const p = c.update(input(t, 0.7, 1.2, { beats: t * 2, kick: i % 15 === 0 ? 1 : 0 }), ctx({ tier: 'peak', ball: Math.min(1, t / 20) }));
    assert.ok(p.pos.y > 0.1, `camera under the floor at t=${t}: ${p.pos.y}`);
    for (const d of [-1.3, 1.3]) assert.ok(Math.hypot(p.pos.x - d, p.pos.z) > 0.9 || p.pos.y > 2, `camera inside a dancer at t=${t}`);
    assert.ok(p.fov > 15 && p.fov < 70);
  }
});

// ---------------------------------------------------------------------------------------------- dances
const metas: DanceMeta[] = [
  { id: 'a', name: 'Waltz', styles: ['ballet'], frames: 100, duration: 3, energy: 0.2, beat: 0.6, beatConf: 0.6, offset: 0 },
  { id: 'b', name: 'Arabesque', styles: ['ballet', 'zen'], frames: 100, duration: 3, energy: 0.1, beat: 0, beatConf: 0, offset: 0 },
  { id: 'c', name: 'Macarena', styles: ['edm', 'groove'], frames: 100, duration: 3, energy: 0.6, beat: 0.5, beatConf: 0.7, offset: 0 },
  { id: 'd', name: 'Breakdance', styles: ['edm', 'rock'], frames: 100, duration: 3, energy: 1, beat: 0, beatConf: 0, offset: 0 },
  { id: 'e', name: 'Salsa', styles: ['groove'], frames: 100, duration: 3, energy: 0.7, beat: 0.5, beatConf: 0.5, offset: 0 },
  { id: 'f', name: 'Wave', styles: ['greet'], frames: 100, duration: 3, energy: 0.3, beat: 0, beatConf: 0, offset: 0 },
];

test('dance choice respects style and energy, and avoids repeats', () => {
  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const counts: Record<string, number> = {};
  for (let i = 0; i < 400; i++) { const m = pickDance(metas, 'edm', 0.9, [], rnd)!; counts[m.id] = (counts[m.id] ?? 0) + 1; }
  assert.ok(!counts.a && !counts.b && !counts.f, 'no ballet or greeting clips in an EDM set');
  assert.ok((counts.d ?? 0) > (counts.c ?? 0), 'high-energy music prefers the high-energy dance');
  let repeats = 0; for (let i = 0; i < 400; i++) if (pickDance(metas, 'edm', 0.9, ['d', 'c'], rnd)!.id === 'd') repeats++;
  assert.ok(repeats < 400 * 0.08, `a recently danced move came back ${repeats}/400 times`);
});

test('dance speed lines the dance pulse up with the music, within a natural range', () => {
  const macarena = metas[2];                       // pulse 0.5 s = 120 bpm
  assert.ok(Math.abs(danceTimeScale(macarena, 120) - 1) < 0.01);
  assert.ok(Math.abs(danceTimeScale(macarena, 90) - 0.75) < 0.01);
  for (const bpm of [50, 80, 120, 150, 200]) for (const m of metas) { const ts = danceTimeScale(m, bpm); assert.ok(ts >= 0.65 && ts <= 1.5, `${m.name}@${bpm} → ${ts}`); }
});
