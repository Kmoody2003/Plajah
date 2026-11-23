// Rift Realm wings + glide: deploy on the run (with hysteresis), fold on a stop / combat stance / landing, glide
// in the air with wings out, settle to the sink, carry with the wind. Run: npx tsx --test tests/riftWingsGlide.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { Glide, GLIDE, type GlideInput } from '../games/rift-realm/src/glide';

/** A stand-in for the rig's wings: open chases the target at a fixed rate. */
function fakeRig() {
  const wings = { open: 0, target: { open: 0, sweep: 1, liftL: 0, liftR: 0 }, mesh: new THREE.Mesh(), view: null as unknown, setAimClear() {} };
  const root = new THREE.Group(); root.add(new THREE.Group());
  return { wings, root, setPoseLayer() {}, poseLayerW: 0, glidePose: { w: 0, pitch: 0 } } as unknown as Parameters<Glide['pose']>[0] & { wings: typeof wings };
}

function frame(g: Glide, rig: ReturnType<typeof fakeRig>, inp: Partial<GlideInput>, dt = 1 / 60) {
  g.pose(rig, { firstPerson: false, yaw: 0, scene: null });
  const w = rig!.wings;
  w.open += Math.sign(w.target.open - w.open) * Math.min(Math.abs(w.target.open - w.open), dt * 4);
  g.update(dt, { onGround: true, hsp: 0, vy: 0, jumpHeld: false, crouch: false, combat: false, busy: false, pos: new THREE.Vector3(), ...inp });
}

describe('rift realm wings', () => {
  it('deploy only on a sustained run, fold after a stop (no flicker)', () => {
    const g = new Glide(), rig = fakeRig();
    frame(g, rig, {});                                     // learns it has wings
    for (let i = 0; i < 5; i++) frame(g, rig, { hsp: 9 });  // 0.08 s: not yet
    assert.equal(g.wantOpen, 0);
    for (let i = 0; i < 10; i++) frame(g, rig, { hsp: 9 });
    assert.equal(g.wantOpen, 1);
    for (let i = 0; i < 6; i++) frame(g, rig, { hsp: 5 });  // between fold and deploy speeds: stays out
    assert.equal(g.wantOpen, 1);
    for (let i = 0; i < 20; i++) frame(g, rig, { hsp: 0 });
    assert.equal(g.wantOpen, 0);
  });

  it('a combat stance folds them', () => {
    const g = new Glide(), rig = fakeRig();
    for (let i = 0; i < 20; i++) frame(g, rig, { hsp: 9 });
    for (let i = 0; i < 20; i++) frame(g, rig, { hsp: 9, combat: true });
    assert.equal(g.wantOpen, 0);
  });

  it('a running jump glides on the way down; landing folds and locks out', () => {
    const g = new Glide(), rig = fakeRig();
    for (let i = 0; i < 40; i++) frame(g, rig, { hsp: 9 });
    assert.ok(rig!.wings.open > 0.6);
    frame(g, rig, { onGround: false, hsp: 9, vy: 8 });
    assert.equal(g.gliding, false, 'not while rising');
    for (let i = 0; i < 30; i++) frame(g, rig, { onGround: false, hsp: 9, vy: -1 });
    assert.equal(g.gliding, true);
    frame(g, rig, { onGround: true, hsp: 9 });
    assert.equal(g.gliding, false);
    assert.equal(g.wantOpen, 0, 'landing folds the wings');
    for (let i = 0; i < 10; i++) frame(g, rig, { hsp: 9 });
    assert.equal(g.wantOpen, 0, 'locked out right after landing');
  });

  it('hold jump while falling unfurls and glides; a tap does not', () => {
    const g = new Glide(), rig = fakeRig();
    frame(g, rig, {});
    for (let i = 0; i < 8; i++) frame(g, rig, { onGround: false, vy: -5, jumpHeld: true });   // < holdAfter
    assert.equal(g.wantOpen, 0);
    for (let i = 0; i < 40; i++) frame(g, rig, { onGround: false, vy: -5, jumpHeld: true });
    assert.equal(g.wantOpen, 1);
    assert.equal(g.gliding, true);
  });

  it('the glide settles to the sink and carries forward', () => {
    const g = new Glide();
    let vy = -12;
    const vel = new THREE.Vector3(0, 0, -9), wish = new THREE.Vector3(0, 0, -1);
    g.wind.set(0, 0, 0);
    for (let i = 0; i < 180; i++) { g.steer(vel, wish, 1 / 60); vy = g.fall(vy, 1 / 60); }
    assert.ok(Math.abs(vy + GLIDE.sink) < 0.15, `sink ${vy}`);
    assert.ok(vel.length() > GLIDE.minSpeed && vel.length() <= GLIDE.speed + 0.01);
  });

  it('a headwind floats it, a tailwind sinks it, and the wind pushes it', () => {
    const sinkWith = (wz: number) => {
      const g = new Glide(); let vy = -GLIDE.sink;
      const vel = new THREE.Vector3(0, 0, -10), wish = new THREE.Vector3(0, 0, -1);
      g.wind.set(0, 0, wz);
      for (let i = 0; i < 240; i++) { g.steer(vel, wish, 1 / 60); vy = g.fall(vy, 1 / 60); }
      return { vy, vz: vel.z };
    };
    const head = sinkWith(6), tail = sinkWith(-6);
    assert.ok(head.vy > -GLIDE.sink && tail.vy < -GLIDE.sink);
    assert.ok(head.vz > tail.vz, 'headwind slows the ground speed');
  });
});
