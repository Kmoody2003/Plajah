// Trackside kit for the city circuit: tyre walls on the outside of corners, catch fencing, grandstands with crowds, pit-lane garages, marshal posts with flags,
// light towers and the five-lamp start gantry lights. Everything is placed from the circuit's dense path (`P`, about 6 m a sample) and sits on the terrain.
import * as THREE from 'three';
import { catchFence } from './catchFence';
import { detailedStand, pitGarage } from './trackArchitecture';

export interface KitInput {
  P: { x: number; y: number; z: number }[];
  corners: { x: number; z: number; turn: number }[];
  ground: (x: number, z: number) => number;          // terrain height at x,z (already exaggerated)
  HALF: number;                                       // half road width
  pitFrom: number; pitTo: number;                     // sample range of the pit lane (it runs along side -1)
  gantryAt: number;                                   // sample index of the start line
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rnd = (seed: number): (() => number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const texLoader = new THREE.TextureLoader();
const pbrTex = (file: string, srgb: boolean, rep = 2): THREE.Texture => {
  const t = texLoader.load('/games/forth-horizon/tex/' + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
let steelMatCache: THREE.MeshStandardMaterial | null = null;
let concreteMatCache: THREE.MeshStandardMaterial | null = null;
const mat = (color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial => {
  if (metal >= 0.5) {
    if (!steelMatCache) {
      steelMatCache = new THREE.MeshStandardMaterial({
        color: 0xcfd6de,
        map: pbrTex('tex-shared-14-steel-panel_base.png', true, 2),
        normalMap: pbrTex('tex-shared-14-steel-panel_normal.png', false, 2),
        roughnessMap: pbrTex('tex-shared-14-steel-panel_roughness.png', false, 2),
        roughness: 0.42,
        metalness: 0.86,
      });
    }
    return steelMatCache;
  }
  if (rough >= 0.78 && color > 0x606060) {
    if (!concreteMatCache) {
      concreteMatCache = new THREE.MeshStandardMaterial({
        color: 0xd8d6d0,
        map: pbrTex('tex-shared-16-concrete-weathered_base.png', true, 2),
        normalMap: pbrTex('tex-shared-16-concrete-weathered_normal.png', false, 2),
        roughnessMap: pbrTex('tex-shared-16-concrete-weathered_roughness.png', false, 2),
        roughness: 0.88,
        metalness: 0.04,
      });
    }
    return concreteMatCache;
  }
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
};

export class TrackKit {
  readonly group = new THREE.Group();
  private lamps: THREE.Mesh[] = [];
  private lampMat = [new THREE.MeshBasicMaterial({ color: 0x2a0c0c }), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), new THREE.MeshBasicMaterial({ color: 0x28ff5a })];
  private state = -1;

  constructor(private k: KitInput) {
    this.tyreWalls(); this.fencing(); this.stands(); this.pits(); this.marshals(); this.towers(); this.gantryLights();
  }

  private tan(i: number): [number, number] {
    const P = this.k.P, n = P.length, a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }
  /** point at sample i, `off` metres to side (+1 right of travel as the barriers use it), `along` metres forward */
  private at(i: number, off: number, side: number, along = 0): { x: number; y: number; z: number; tx: number; tz: number } {
    const P = this.k.P, n = P.length, p = P[((i % n) + n) % n], [tx, tz] = this.tan(i);
    const x = p.x - tz * off * side + tx * along, z = p.z + tx * off * side + tz * along;
    return { x, y: this.k.ground(x, z), z, tx, tz };
  }
  private inPit(i: number): boolean { return i >= this.k.pitFrom - 2 && i <= this.k.pitTo + 2; }

  // ---------- tyre walls: stacked tyres, red/white/black, on the outside of every corner ----------
  private tyreWalls(): void {
    const { P, corners, HALF } = this.k, n = P.length;
    // One real tyre, lying flat as in a tyre barrier: smooth-shaded revolved profile (80 tris instead of 264 tris -> saves >1.5M triangles on Ironport circuit with identical tread/bump appearance).
    const profile: THREE.Vector2[] = [
      [0.205, -0.105], [0.295, -0.114], [0.346, -0.055], [0.346, 0.055], [0.295, 0.114], [0.205, 0.105],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(profile, 8);
    const rubberTex = (paint: string | null): THREE.CanvasTexture => canvasTex(512, 256, (g) => {
      const R = rnd(paint ? (paint === '#d8d8d2' ? 5 : 9) : 3);
      g.fillStyle = '#15161a'; g.fillRect(0, 0, 512, 256);
      // v runs along the profile: the tread is the band in the middle, the two sidewalls on either side
      for (let y = 0; y < 256; y++) { const sw = y < 72 || y > 184; g.fillStyle = sw ? `rgb(${24 + (R() * 8) | 0},${25 + (R() * 8) | 0},${28 + (R() * 8) | 0})` : `rgb(${18 + (R() * 7) | 0},${19 + (R() * 7) | 0},${21 + (R() * 7) | 0})`; g.fillRect(0, y, 512, 1); }
      g.fillStyle = '#0a0a0c';
      for (let x = 0; x < 512; x += 16) { g.fillRect(x, 92, 3, 72); if ((x / 16) % 2) g.fillRect(x + 8, 92, 3, 34); else g.fillRect(x + 8, 130, 3, 34); }       // tread blocks and sipes
      g.fillRect(0, 126, 512, 4);                                                                                                                         // centre groove
      g.strokeStyle = 'rgba(70,72,78,0.55)'; g.lineWidth = 2;
      for (const y of [22, 40, 60, 196, 216, 234]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }                                          // sidewall rings
      g.fillStyle = 'rgba(150,152,158,0.55)'; g.font = '700 15px Arial'; g.textBaseline = 'middle';
      for (let x = 18; x < 512; x += 170) { g.fillText('TUBELESS RADIAL', x, 30); g.fillText('M+S  205/55 R16', x + 70, 224); }
      // dust, scuffs, a few cuts
      for (let i = 0; i < 360; i++) { g.fillStyle = `rgba(${150 + (R() * 60) | 0},${140 + (R() * 50) | 0},${120 + (R() * 40) | 0},${0.02 + R() * 0.07})`; g.fillRect(R() * 512, R() * 256, 2 + R() * 20, 1 + R() * 5); }
      if (paint) {
        // paint rolled on the sidewall and tread: thick, then chipped and scuffed away so the rubber shows through, more where tyres have knocked together
        g.globalAlpha = 0.97; g.fillStyle = paint; g.fillRect(0, 0, 512, 256); g.globalAlpha = 1;
        for (let i = 0; i < 620; i++) { g.fillStyle = `rgba(${20 + (R() * 30) | 0},${20 + (R() * 30) | 0},${24 + (R() * 30) | 0},${0.35 + R() * 0.6})`; g.beginPath(); g.ellipse(R() * 512, R() * 256, 1 + R() * 14, 1 + R() * 6, R() * 3, 0, 7); g.fill(); }
        for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(120,104,86,${0.04 + R() * 0.1})`; g.fillRect(R() * 512, R() * 256, 5 + R() * 40, 2 + R() * 10); }
        g.globalCompositeOperation = 'source-over';
      }
    }, [2, 1]);
    const mk = (paint: string | null): THREE.MeshStandardMaterial => {
      const t = rubberTex(paint);
      return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: paint ? 1.6 : 2.6, roughness: paint ? 0.78 : 0.93, metalness: 0, color: paint ? 0xffffff : 0xb8b8bc });
    };
    const mats = [mk(null), mk('#d8d8d2'), mk('#b01e1e')];
    const slots: THREE.Matrix4[][] = [[], [], []];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), r = rnd(7);
    const TYRE_H = 0.22, SPACING = 0.72;
    for (const cn of corners) {
      let bi = 0, best = 1e18;
      for (let i = 0; i < n; i++) { const d = (P[i].x - cn.x) ** 2 + (P[i].z - cn.z) ** 2; if (d < best) { best = d; bi = i; } }
      const outside = cn.turn > 0 ? -1 : 1;
      const K = 4;
      for (let k = -K; k <= K; k++) {
        const i = bi + k; if (this.inPit(((i % n) + n) % n)) continue;
        // a barrier is built like a pyramid at its ends: four tyres high in the middle, three, then two
        const layers = Math.abs(k) <= 3 ? 4 : Math.abs(k) === 4 ? 3 : 2;
        for (let row = 0; row < 2; row++) for (let a = -4; a <= 4; a += 1) {
          // the rows are staggered, as are the layers: each tyre rests in the gap of the ones below, like brickwork
          const stagger = (row % 2) * 0.5;
          const p = this.at(i, HALF + 2.5 + row * 0.6, outside, (a + stagger) * SPACING);
          const along = Math.atan2(p.tx, p.tz);
          for (let layer = 0; layer < layers; layer++) {
            const lift = layer * (TYRE_H * 0.93);
            const lx = (layer % 2) * 0.32;
            const px = p.x + p.tx * lx + (r() - 0.5) * 0.05, pz = p.z + p.tz * lx + (r() - 0.5) * 0.05;
            e.set((r() - 0.5) * 0.07, along + r() * 6.28, (r() - 0.5) * 0.07);
            q.setFromEuler(e);
            m4.compose(new THREE.Vector3(px, p.y + 0.11 + lift, pz), q, new THREE.Vector3(1 + (r() - 0.5) * 0.04, 0.93, 1 + (r() - 0.5) * 0.04));
            // the row facing the road is painted, alternating white and red along the barrier, the rest left black
            const painted = row === 0 && layer < 3 && ((Math.floor((k * 10 + a + 50) / 3) + layer) & 1) === 0;
            const which = !painted ? 0 : (Math.floor((k * 10 + a + 50) / 6) & 1) ? 2 : 1;
            slots[which].push(m4.clone());
          }
        }
      }
    }
    slots.forEach((list, vi) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mats[vi], list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = 'trackkit-tyres';
      im.frustumCulled = true; im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
    });
  }

  // ---------- catch fencing: posts and a diamond-mesh panel along both sides, leaning in at the top ----------
  private fencing(): void {
    const { P, HALF } = this.k, runs: { x: number; y: number; z: number }[][] = [];
    // 4.6 m off the road edge: clear of the tyre walls on the outside of corners (they reach about 9.2 m from the centre line, the fence used to stand at 9.0 and cut through them)
    const FENCE_OFF = HALF + 4.6;
    for (const side of [-1, 1]) {
      let run: { x: number; y: number; z: number }[] = [];
      const flush = (): void => { if (run.length > 1) runs.push(side < 0 ? run.reverse() : run); run = []; };
      for (let i = 0; i <= P.length; i++) {
        const sample = i % P.length;
        if (side < 0 && this.inPit(sample)) { flush(); continue; }
        // on the inside of a tight corner the offset line folds back across itself: that is where the fence used to tangle. Stop the run there and start again after it.
        const here = this.at(sample, FENCE_OFF, side), nxt = this.at(sample + 1, FENCE_OFF, side), [tx, tz] = this.tan(sample);
        const el = Math.hypot(nxt.x - here.x, nxt.z - here.z) || 1;
        if (((nxt.x - here.x) * tx + (nxt.z - here.z) * tz) / el < 0.3) { flush(); continue; }
        const p = here, last = run[run.length - 1];
        if (last) { const steps = Math.ceil(Math.hypot(p.x - last.x, p.z - last.z) / 3); for (let k = 1; k < steps; k++) { const x = last.x + (p.x - last.x) * k / steps, z = last.z + (p.z - last.z) * k / steps; run.push({ x, y: this.k.ground(x, z), z }); } }
        run.push(p);
      }
      flush();
    }
    this.group.add(catchFence(runs));
  }

  // ---------- grandstands ----------
  private makeStand(len: number, rows: number): THREE.Group {
    return detailedStand(len, rows);
  }

  private stands(): void {
    const { P, HALF, gantryAt } = this.k, n = P.length;
    const spots: [number, number, number, number][] = [[gantryAt + 4, 1, 54, 8], [gantryAt + 4, -1, 0, 0], [Math.floor(n * 0.42), 1, 36, 6], [Math.floor(n * 0.7), 1, 36, 6], [Math.floor(n * 0.2), -1, 30, 5]];
    for (const [i, side, len, rows] of spots) {
      if (len === 0) continue;
      if (side < 0 && this.inPit(((i % n) + n) % n)) continue;
      // the stand is straight and the track may curve under it: back it off until its whole front edge is clear of the barriers (front row stands at local z 0)
      const clearance = HALF + 4;
      const frontMin = (off: number): number => {
        const q = this.at(i, off, side); let worst = 1e9;
        const ox = q.tx * (side < 0 ? -1 : 1), oz = q.tz * (side < 0 ? -1 : 1);
        for (let t = -0.5; t <= 0.501; t += 0.125) { const x = q.x + ox * len * t, z = q.z + oz * len * t; let d = 1e9; for (let k = 0; k < n; k++) d = Math.min(d, Math.hypot(P[k].x - x, P[k].z - z)); worst = Math.min(worst, d); }
        return worst;
      };
      let off = HALF + 9;
      for (let k = 0; k < 20 && frontMin(off) < clearance; k++) off += 1;
      const p = this.at(i, off, side);
      const st = this.makeStand(len, rows);
      st.position.set(p.x, p.y, p.z);
      // local +x along the track, local +z away from it
      st.rotation.y = Math.atan2(-p.tz, p.tx) + (side < 0 ? Math.PI : 0);
      this.group.add(st);
    }
  }

  // ---------- pit garages ----------
  private pits(): void {
    const { pitFrom, pitTo } = this.k;
    for (let i = pitFrom; i <= pitTo; i++) {
      const p = this.at(i, 24.5, -1), garage = pitGarage(i - pitFrom);
      garage.position.set(p.x, p.y, p.z);
      garage.rotation.y = Math.atan2(-p.tz, p.tx) + Math.PI;
      this.group.add(garage);
    }
  }

  // ---------- marshal posts with flags, one on the outside of every corner ----------
  private marshals(): void {
    const { P, corners, HALF } = this.k, n = P.length;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 4.2, 5), mat(0xdfe2e6, 0.5, 0.4), Math.max(1, corners.length));
    const booth = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 2.1, 1.6), mat(0xdcdfe4, 0.8), Math.max(1, corners.length));
    const flag = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), Math.max(1, corners.length));
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const fc = [0xf2c230, 0x2aa05a, 0x1d6fd1];
    corners.forEach((cn, ci) => {
      let bi = 0, best = 1e18;
      for (let i = 0; i < n; i++) { const d = (P[i].x - cn.x) ** 2 + (P[i].z - cn.z) ** 2; if (d < best) { best = d; bi = i; } }
      const p = this.at(bi + 5, HALF + 6, cn.turn > 0 ? -1 : 1);
      m4.makeTranslation(p.x, p.y + 2.1, p.z); pole.setMatrixAt(ci, m4);
      m4.makeTranslation(p.x + p.tx * 1.6, p.y + 1.05, p.z + p.tz * 1.6); booth.setMatrixAt(ci, m4);
      m4.makeRotationY(Math.atan2(-p.tz, p.tx)); m4.setPosition(p.x + p.tx * 0.75, p.y + 3.6, p.z + p.tz * 0.75); flag.setMatrixAt(ci, m4);
      flag.setColorAt(ci, c.setHex(fc[ci % 3]));
    });
    for (const m of [pole, booth, flag]) { m.count = corners.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.frustumCulled = true; this.group.add(m); }
  }

  // ---------- light towers ----------
  private towers(): void {
    const { P, HALF } = this.k, n = P.length;
    const spots: { x: number; y: number; z: number; ry: number }[] = [];
    for (let i = 8; i < n; i += 26) { const p = this.at(i, HALF + 11, i % 52 < 26 ? 1 : -1); if (p.y > 0.1) spots.push({ x: p.x, y: p.y, z: p.z, ry: Math.atan2(-p.tz, p.tx) }); }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.32, 24, 8), mat(0x5a5f66, 0.5, 0.6), Math.max(1, spots.length));
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 1.5, 0.4), mat(0x2a2d33, 0.6, 0.4), Math.max(1, spots.length));
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(3.3, 1.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff1cf }), Math.max(1, spots.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    spots.forEach((s, i) => {
      m4.makeTranslation(s.x, s.y + 12, s.z); pole.setMatrixAt(i, m4);
      q.setFromEuler(new THREE.Euler(0.35, s.ry + Math.PI / 2, 0, 'YXZ'));
      m4.compose(new THREE.Vector3(s.x, s.y + 24.4, s.z), q, new THREE.Vector3(1, 1, 1)); head.setMatrixAt(i, m4);
      const off = new THREE.Vector3(0, 0, 0.26).applyQuaternion(q);
      m4.compose(new THREE.Vector3(s.x + off.x, s.y + 24.4 + off.y, s.z + off.z), q, new THREE.Vector3(1, 1, 1)); lamp.setMatrixAt(i, m4);
    });
    for (const m of [pole, head, lamp]) { m.count = spots.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.frustumCulled = true; this.group.add(m); }
  }

  // ---------- start gantry lights: five lamps that count down red, then go green ----------
  private gantryLights(): void {
    const { P, HALF, gantryAt } = this.k;
    const p = this.at(gantryAt, 0, 1), y = this.k.ground(P[gantryAt].x, P[gantryAt].z);
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5 * 1.5 + 0.8, 1.2, 0.5), mat(0x15181e, 0.5, 0.3)); g.add(bar);
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), this.lampMat[0]); l.position.set((k - 2) * 1.5, 0, 0.27); l.userData.keep = true; g.add(l); this.lamps.push(l);
      const l2 = l.clone(); l2.rotation.y = Math.PI; l2.position.z = -0.27; l2.userData.keep = true; g.add(l2); this.lamps.push(l2);
    }
    g.position.set(p.x, y + 7.0, p.z);
    g.rotation.y = Math.atan2(p.tx, p.tz);
    void HALF;
    this.group.add(g);
  }
  /** 'red' while the grid is held, 'green' on the go, 'off' otherwise */
  setLights(s: 'red' | 'green' | 'off'): void {
    const v = s === 'red' ? 1 : s === 'green' ? 2 : 0;
    if (v === this.state) return;
    this.state = v;
    for (const l of this.lamps) l.material = this.lampMat[v];
  }
}
