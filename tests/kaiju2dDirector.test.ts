// Tests for the 2D Kaiju disco: the 2D camera director and the mocap dance player (using the real baked data).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CameraDirector2D, WORLD_H, WORLD_W, type Cam2DContext } from '../components/kaiju/stage2d/kaijuCamera2D';
import { Dance2D, type Dances2D } from '../components/kaiju/stage2d/kaijuDances2D';
import { REST } from '../components/kaiju/kaijuPose';

const DT = 1 / 30;
const inp = (t: number, kick = 0, eFast = 0.5) => ({ dt: DT, beats: t * 2, kick, eFast });
const ctx = (over: Partial<Cam2DContext> = {}): Cam2DContext => ({ headA: { x: 560, y: 560 }, headB: { x: 1040, y: 560 }, tier: 'groove', drop: false, ball: 0, singer: -1, ...over });

test('2D camera cuts on the bar, faster when the music is intense', () => {
  const cuts = (tier: 'quiet' | 'peak') => { const c = new CameraDirector2D(); let n = 0; for (let i = 0; i < 30 * 60; i++) if (c.update(inp(i * DT), ctx({ tier })).cut) n++; return n; };
  const q = cuts('quiet'), p = cuts('peak');
  assert.ok(p > q * 1.8, `peak ${p} vs quiet ${q}`);
});

test('a drop forces an impact cut and the descending ball earns a ball-cam', () => {
  const c = new CameraDirector2D();
  for (let i = 0; i < 90; i++) c.update(inp(i * DT), ctx());
  const d = c.update(inp(3.1), ctx({ drop: true, tier: 'peak' }));
  assert.ok(d.cut && (d.kind === 'snap' || d.kind === 'whip'), `drop → ${d.kind}`);
  const c2 = new CameraDirector2D(); let ball = false;
  for (let i = 0; i < 300; i++) if (c2.update(inp(i * DT), ctx({ tier: 'peak', ball: 0.4 })).kind === 'ball') ball = true;
  assert.ok(ball);
});

test('whoever is singing gets the close-ups', () => {
  const c = new CameraDirector2D(); const seen: Record<string, number> = {};
  for (let i = 0; i < 30 * 120; i++) { const p = c.update(inp(i * DT), ctx({ singer: 1 })); if (p.cut) seen[p.kind] = (seen[p.kind] ?? 0) + 1; }
  assert.ok((seen.closeB ?? 0) > (seen.closeA ?? 0) && (seen.closeB ?? 0) >= 3, JSON.stringify(seen));
});

test('the camera always stays on the stage: sane zoom, centre inside the world, small roll', () => {
  const c = new CameraDirector2D();
  for (let i = 0; i < 30 * 300; i++) {
    const t = i * DT, p = c.update(inp(t, i % 15 === 0 ? 1 : 0, 0.8), ctx({ tier: i % 900 < 450 ? 'peak' : 'groove', ball: Math.min(1, t / 30), singer: i % 600 < 300 ? 1 : -1 }));
    assert.ok(p.zoom >= 0.95 && p.zoom <= 4.6, `zoom ${p.zoom} (${p.kind})`);
    assert.ok(p.cx > 150 && p.cx < WORLD_W - 150 && p.cy > 150 && p.cy < WORLD_H, `centre ${p.cx},${p.cy} (${p.kind})`);
    assert.ok(Math.abs(p.roll) < 0.25);
    // the visible window never leaves the oversized backdrop (-400..2000 × -300..1200)
    const hw = (WORLD_W / 2) / p.zoom, hh = (WORLD_H / 2) / p.zoom;
    assert.ok(p.cx - hw > -400 && p.cx + hw < 2000 && p.cy - hh > -300 && p.cy + hh < 1200);
  }
});

// ---------------------------------------------------------------------------------------------- mocap dances
function realDances(): Dances2D | null {
  try {
    const index = JSON.parse(fs.readFileSync('public/models/mascots/dances/dances2d.json', 'utf8'));
    const buf = fs.readFileSync('public/models/mascots/dances/dances2d.bin');
    return { index, metas: index.clips, data: new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), credit: index.credit };
  } catch { return null; }
}

test('every baked 2D dance plays: finite, bounded channels and sensible arm/leg ranges', () => {
  const d = realDances(); if (!d) return;   // data not baked in this checkout
  for (const m of d.metas) {
    const dn = new Dance2D(d); dn.start(m, 120, 0.1, 0);
    let armMax = -999, armMin = 999, moved = 0, prev = 0;
    for (let k = 0; k < Math.min(900, m.frames * 2); k++) {
      const p = { ...REST }; dn.step(DT, p);
      for (const key of ['x', 'y', 'rot', 'spin', 'headRot', 'armL', 'armR', 'legL', 'legR', 'liftL', 'liftR', 'tail', 'mane', 'sx', 'sy'] as const) assert.ok(Number.isFinite(p[key]), `${m.id} ${key}`);
      assert.ok(p.armL >= -121 && p.armL <= 186 && p.armR >= -121 && p.armR <= 186, `${m.id} arm ${p.armL}/${p.armR}`);
      assert.ok(Math.abs(p.legL) <= 56 && Math.abs(p.legR) <= 56 && p.liftL <= 0.01 && p.liftR <= 0.01 && p.liftL >= -41, `${m.id} legs`);
      assert.ok(Math.abs(p.x) <= 56 && p.y <= 15 && p.y >= -151, `${m.id} root ${p.x},${p.y}`);
      armMax = Math.max(armMax, p.armL, p.armR); armMin = Math.min(armMin, p.armL, p.armR);
      if (Math.abs(p.armL - prev) > 0.5) moved++; prev = p.armL;
    }
    assert.ok(armMax - armMin > 10 || m.energy < 0.05, `${m.id} (${m.name}) hardly moves its arms`);
    assert.ok(moved > 5 || m.energy < 0.05, `${m.id} frozen`);
  }
});

test('crossfading to another dance never jumps the pose', () => {
  const d = realDances(); if (!d) return;
  const a = d.metas.find(m => m.id === '60_01')!, b = d.metas.find(m => m.id === '143_35')!;
  const dn = new Dance2D(d); dn.start(a, 120, 0.5, 0.2);
  const p0 = { ...REST }; for (let i = 0; i < 30; i++) dn.step(DT, p0);
  dn.start(b, 120, 0.5, 0.2);
  let last = { ...p0 }, worst = 0;
  for (let i = 0; i < 40; i++) { const p = { ...REST }; dn.step(DT, p); worst = Math.max(worst, Math.abs(p.armL - last.armL), Math.abs(p.armR - last.armR)); last = p; }
  assert.ok(worst < 40, `arm jumped ${worst}° in one frame during the crossfade`);
});
