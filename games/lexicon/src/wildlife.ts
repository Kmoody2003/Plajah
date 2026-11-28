// Living Meadow & Woodland Wildlife for Glossa Hollow & Great Forest Wilderness:
// - Fluttering golden, cyan & monarch butterflies over wildflowers and cottage gardens
// - Darting woodland squirrels with bushy tails scampering near trees & logs (scurry when you approach!)
// - Soaring valley birds wheeling high above the treetops and Grand Triple Waterfall
import * as THREE from 'three/webgpu';
import { hash, mat } from './world';

export interface WildlifeSystem {
  group: THREE.Group;
  update(dt: number, t: number, px: number, pz: number, nightK: number): void;
}

export function createWildlife(heightAt: (x: number, z: number) => number, spread = 90): WildlifeSystem {
  const group = new THREE.Group();
  group.name = 'lexicon.wildlife';
  group.userData.dynamic = true;

  // ── 1. Fluttering Butterflies (18 lively butterflies dancing over gardens & meadows) ──
  interface Butterfly {
    root: THREE.Group;
    wL: THREE.Mesh;
    wR: THREE.Mesh;
    cx: number;
    cz: number;
    rad: number;
    speed: number;
    phase: number;
  }
  const butterflies: Butterfly[] = [];
  const bfColors = [0xffcf5c, 0x9ef4f0, 0xf28b42, 0xffe896, 0xc7a8ff];
  const wingGeo = new THREE.PlaneGeometry(0.2, 0.16);
  for (let i = 0; i < 18; i++) {
    const a = hash(i, 11) * Math.PI * 2;
    const r = 10 + hash(i, 19) * (spread * 0.65);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const m = new THREE.MeshBasicMaterial({ color: bfColors[i % bfColors.length], side: THREE.DoubleSide });
    const root = new THREE.Group();
    const wL = new THREE.Mesh(wingGeo, m); wL.position.x = -0.09;
    const wR = new THREE.Mesh(wingGeo, m); wR.position.x = 0.09;
    root.add(wL, wR);
    group.add(root);
    butterflies.push({
      root, wL, wR, cx, cz,
      rad: 2.2 + hash(i, 23) * 3.8,
      speed: 0.65 + hash(i, 29) * 0.65,
      phase: hash(i, 31) * Math.PI * 2,
    });
  }

  // ── 2. Woodland Squirrels (8 bushy-tailed squirrels hopping near gardens, trees & meadow paths) ──
  interface Squirrel {
    root: THREE.Group;
    tail: THREE.Mesh;
    homeX: number;
    homeZ: number;
    x: number;
    z: number;
    tx: number;
    tz: number;
    waitT: number;
    phase: number;
  }
  const squirrels: Squirrel[] = [];
  const sqSpots: [number, number][] = [
    [-25, 11], [24, -14], [28, 12], [-18, -26], [16, -32], [-30, -2], [8, 34], [-10, 32],
  ];
  const sqFur = mat(0x8e5630);
  const sqTail = mat(0xa86b3e);
  for (let i = 0; i < sqSpots.length; i++) {
    const [sx, sz] = sqSpots[i]!;
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.22, 4, 8).rotateX(Math.PI / 2), sqFur);
    body.position.y = 0.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), sqFur);
    head.position.set(0, 0.23, 0.18);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.28, 4, 8), sqTail);
    tail.position.set(0, 0.28, -0.18);
    tail.rotation.x = -0.55;
    root.add(body, head, tail);
    root.position.set(sx, heightAt(sx, sz), sz);
    group.add(root);
    squirrels.push({
      root, tail, homeX: sx, homeZ: sz, x: sx, z: sz, tx: sx + 2, tz: sz - 1, waitT: i * 0.4, phase: i * 1.3,
    });
  }

  // ── 3. Soaring Valley Birds (10 gliding & flapping birds wheeling over the village & waterfall) ──
  interface Bird {
    root: THREE.Group;
    wL: THREE.Mesh;
    wR: THREE.Mesh;
    cx: number;
    cz: number;
    alt: number;
    rad: number;
    speed: number;
    phase: number;
  }
  const birds: Bird[] = [];
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2c3038, side: THREE.DoubleSide });
  const bWingGeo = new THREE.PlaneGeometry(0.55, 0.22);
  for (let i = 0; i < 10; i++) {
    const root = new THREE.Group();
    const wL = new THREE.Mesh(bWingGeo, birdMat); wL.position.x = -0.26;
    const wR = new THREE.Mesh(bWingGeo, birdMat); wR.position.x = 0.26;
    root.add(wL, wR);
    group.add(root);
    birds.push({
      root, wL, wR,
      cx: i < 4 ? -34 : (hash(i, 41) - 0.5) * 60,
      cz: i < 4 ? -16 : (hash(i, 43) - 0.5) * 60,
      alt: 18 + hash(i, 47) * 16,
      rad: 16 + hash(i, 53) * 24,
      speed: 0.22 + hash(i, 59) * 0.16,
      phase: hash(i, 61) * Math.PI * 2,
    });
  }

  return {
    group,
    update(dt, t, px, pz, nightK) {
      const daytimeVis = nightK < 0.72;

      // Butterflies rest at night, flutter joyfully by day!
      for (const bf of butterflies) {
        bf.root.visible = daytimeVis;
        if (!daytimeVis) continue;
        const a = t * bf.speed + bf.phase;
        const x = bf.cx + Math.cos(a) * bf.rad + Math.sin(a * 2.3) * 0.7;
        const z = bf.cz + Math.sin(a) * bf.rad + Math.cos(a * 1.9) * 0.7;
        const y = heightAt(x, z) + 1.15 + Math.sin(t * 3.4 + bf.phase) * 0.45;
        bf.root.position.set(x, y, z);
        bf.root.rotation.y = -a;
        const flap = Math.sin(t * 18 + bf.phase) * 0.95;
        bf.wL.rotation.y = flap;
        bf.wR.rotation.y = -flap;
      }

      // Woodland squirrels scamper between nearby spots and scurry away if the Scribe walks close!
      for (const sq of squirrels) {
        sq.root.visible = daytimeVis;
        if (!daytimeVis) continue;
        const dPlayer = Math.hypot(sq.x - px, sq.z - pz);
        if (dPlayer < 6.5) {
          // Playful scurry away from the Scribe toward shelter
          const awayA = Math.atan2(sq.x - px, sq.z - pz);
          sq.tx = sq.homeX + Math.sin(awayA) * 5.5;
          sq.tz = sq.homeZ + Math.cos(awayA) * 5.5;
          sq.waitT = 0;
        }
        const dx = sq.tx - sq.x, dz = sq.tz - sq.z, d = Math.hypot(dx, dz);
        if (d > 0.25) {
          const sp = dPlayer < 7 ? 4.4 : 2.2;
          const step = Math.min(d, sp * dt);
          sq.x += (dx / d) * step;
          sq.z += (dz / d) * step;
          sq.root.rotation.y = Math.atan2(dx, dz);
          const hop = Math.abs(Math.sin(t * 14 + sq.phase)) * 0.16;
          sq.root.position.set(sq.x, heightAt(sq.x, sq.z) + hop, sq.z);
          sq.tail.rotation.x = -0.4 + Math.sin(t * 18 + sq.phase) * 0.25;
        } else {
          sq.root.position.set(sq.x, heightAt(sq.x, sq.z), sq.z);
          sq.tail.rotation.x = -0.65 + Math.sin(t * 4 + sq.phase) * 0.12;
          sq.waitT -= dt;
          if (sq.waitT <= 0) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 1.5 + Math.random() * 4.5;
            sq.tx = sq.homeX + Math.cos(ang) * rad;
            sq.tz = sq.homeZ + Math.sin(ang) * rad;
            sq.waitT = 1.4 + Math.random() * 2.8;
          }
        }
      }

      // Valley birds circle overhead during the day and roost at dusk
      for (const b of birds) {
        b.root.visible = nightK < 0.82;
        if (!b.root.visible) continue;
        const a = t * b.speed + b.phase;
        const x = b.cx + Math.cos(a) * b.rad;
        const z = b.cz + Math.sin(a) * b.rad;
        const y = b.alt + Math.sin(t * 0.9 + b.phase) * 2.2;
        b.root.position.set(x, y, z);
        b.root.rotation.y = -a;
        const flap = Math.sin(t * 6.5 + b.phase) * 0.45 * (Math.sin(t * 0.6 + b.phase) > -0.2 ? 1 : 0.15);
        b.wL.rotation.z = flap;
        b.wR.rotation.z = -flap;
      }
    },
  };
}
