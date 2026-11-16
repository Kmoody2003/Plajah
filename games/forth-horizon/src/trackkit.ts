// Trackside kit for the city circuit: tyre walls on the outside of corners, catch fencing, grandstands with crowds, pit-lane garages, marshal posts with flags,
// light towers and the five-lamp start gantry lights. Everything is placed from the circuit's dense path (`P`, about 6 m a sample) and sits on the terrain.
import * as THREE from 'three';

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
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rnd = (seed: number): (() => number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const mat = (color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

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
    const geo = new THREE.TorusGeometry(0.34, 0.17, 8, 18); geo.rotateX(Math.PI / 2);
    const cols = [0xd8d8d8, 0xb81818, 0x1b1b1b, 0xb81818];
    const list: THREE.Matrix4[] = [], colr: number[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), r = rnd(7);
    for (const cn of corners) {
      let bi = 0, best = 1e18;
      for (let i = 0; i < n; i++) { const d = (P[i].x - cn.x) ** 2 + (P[i].z - cn.z) ** 2; if (d < best) { best = d; bi = i; } }
      const outside = cn.turn > 0 ? -1 : 1;
      for (let k = -5; k <= 5; k++) {
        const i = bi + k; if (this.inPit(((i % n) + n) % n)) continue;
        for (let a = -2; a <= 2; a++) for (let row = 0; row < 2; row++) {
          const p = this.at(i, HALF + 2.5 + row * 0.62, outside, a * 1.15);
          for (let layer = 0; layer < 3; layer++) {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
            m4.compose(new THREE.Vector3(p.x + (r() - 0.5) * 0.06, p.y + 0.17 + layer * 0.34, p.z + (r() - 0.5) * 0.06), q, new THREE.Vector3(1, 1, 1));
            list.push(m4.clone()); colr.push(cols[(Math.floor(k / 2) + layer + row) & 3]);
          }
        }
      }
    }
    const im = new THREE.InstancedMesh(geo, mat(0xffffff, 0.95), Math.max(1, list.length));
    const c = new THREE.Color();
    list.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(colr[i])); });
    im.count = list.length; im.frustumCulled = false; im.castShadow = true;
    this.group.add(im);
  }

  // ---------- catch fencing: posts and a diamond-mesh panel along both sides, leaning in at the top ----------
  private fencing(): void {
    const { P, HALF } = this.k, n = P.length;
    const tex = canvasTex(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128); g.strokeStyle = 'rgba(205,210,215,0.95)'; g.lineWidth = 3;
      for (let k = -128; k < 256; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke(); }
    }, [1, 1]);
    for (const side of [-1, 1]) {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      let dist = 0, prev: { x: number; z: number } | null = null, strips = 0;
      const posts: THREE.Matrix4[] = [];
      for (let i = 0; i < n; i++) {
        if (side < 0 && this.inPit(i)) { prev = null; continue; }
        const p = this.at(i, HALF + 3.5, side), top = this.at(i, HALF + 3.5 - 0.45, side);
        if (prev) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
        if (!prev && pos.length) { strips = 0; }
        prev = p;
        const b = pos.length / 3;
        pos.push(p.x, p.y + 0.5, p.z, top.x, p.y + 4.6, top.z);
        uv.push(dist / 3.2, 0, dist / 3.2, 1.3);
        if (strips > 0) idx.push(b - 2, b, b - 1, b - 1, b, b + 1);
        strips++;
        if (i % 2 === 0) { const m = new THREE.Matrix4().makeTranslation(p.x, p.y + 2.4, p.z); posts.push(m); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      const t = tex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }));
      m.frustumCulled = false; this.group.add(m);
      const pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6), mat(0x4b5057, 0.5, 0.6), Math.max(1, posts.length));
      posts.forEach((mm, i) => pi.setMatrixAt(i, mm)); pi.count = posts.length; pi.frustumCulled = false; this.group.add(pi);
    }
  }

  // ---------- grandstands ----------
  private makeStand(len: number, rows: number): THREE.Group {
    const g = new THREE.Group();
    const crowd = canvasTex(256, 64, (c) => {
      const r = rnd(3); c.fillStyle = '#2a2d36'; c.fillRect(0, 0, 256, 64);
      const pal = ['#d8352a', '#f0f0f0', '#1d6fd1', '#f2c230', '#2aa05a', '#222', '#e87ab0', '#ff8c00'];
      for (let y = 6; y < 64; y += 9) for (let x = 3; x < 256; x += 6) { c.fillStyle = pal[Math.floor(r() * pal.length)]; c.beginPath(); c.arc(x + r() * 2, y, 2.4, 0, 7); c.fill(); c.fillStyle = '#c99a78'; c.fillRect(x - 1, y - 6, 2, 2); }
    }, [Math.max(1, len / 12), 1]);
    const concrete = mat(0x9b9ea3, 0.9), seat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
    for (let r = 0; r < rows; r++) {
      const h = 0.7 + r * 0.78;
      const step = new THREE.Mesh(new THREE.BoxGeometry(len, h, 1.05), concrete); step.position.set(0, h / 2, 0.6 + r * 1.05); g.add(step);
      const row = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.9, 0.5), seat); row.position.set(0, h + 0.45, 0.35 + r * 1.05); g.add(row);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.7 + rows * 0.78 + 0.6, 0.4), mat(0x6f737a, 0.9)); back.position.set(0, (0.7 + rows * 0.78 + 0.6) / 2, 0.6 + rows * 1.05 + 0.2); g.add(back);
    const roofH = 0.7 + rows * 0.78 + 3.6, roofZ = 0.6 + rows * 0.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.32, rows * 1.05 + 1.5), mat(0xe8eaee, 0.5, 0.2)); roof.position.set(0, roofH, roofZ + 0.6); roof.rotation.x = -0.06; g.add(roof);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 1.3, 0.12), new THREE.MeshStandardMaterial({
      map: canvasTex(1024, 96, (c) => { c.fillStyle = '#10131c'; c.fillRect(0, 0, 1024, 96); c.fillStyle = '#ff8c00'; c.font = '800 54px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('APEX ELOHIM  ·  IRONPORT GRAND CIRCUIT', 512, 50); }),
      emissive: 0x331c00, roughness: 0.6,
    }));
    banner.position.set(0, roofH - 0.8, roofZ - rows * 0.5 - 0.25); g.add(banner);
    for (let x = -len / 2 + 1; x <= len / 2; x += len / 5) for (const z of [0.5, 0.6 + rows * 1.05]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, roofH, 6), mat(0x50555c, 0.5, 0.6)); p.position.set(x, roofH / 2, z); g.add(p); }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  private stands(): void {
    const { P, HALF, gantryAt } = this.k, n = P.length;
    const spots: [number, number, number, number][] = [[gantryAt + 4, 1, 54, 8], [gantryAt + 4, -1, 0, 0], [Math.floor(n * 0.42), 1, 36, 6], [Math.floor(n * 0.7), 1, 36, 6], [Math.floor(n * 0.2), -1, 30, 5]];
    for (const [i, side, len, rows] of spots) {
      if (len === 0) continue;
      if (side < 0 && this.inPit(((i % n) + n) % n)) continue;
      const p = this.at(i, HALF + 9, side);
      const st = this.makeStand(len, rows);
      st.position.set(p.x, p.y, p.z);
      // local +x along the track, local +z away from it
      st.rotation.y = Math.atan2(-p.tz, p.tx) + (side < 0 ? Math.PI : 0);
      this.group.add(st);
    }
  }

  // ---------- pit garages ----------
  private pits(): void {
    const { HALF, pitFrom, pitTo } = this.k;
    const door = canvasTex(256, 128, (c) => {
      c.fillStyle = '#d9dbe0'; c.fillRect(0, 0, 256, 128);
      c.fillStyle = '#3a3f4a'; c.fillRect(20, 40, 216, 74);
      c.strokeStyle = '#5b6170'; c.lineWidth = 2; for (let y = 46; y < 114; y += 8) { c.beginPath(); c.moveTo(20, y); c.lineTo(236, y); c.stroke(); }
      c.fillStyle = '#ff8c00'; c.fillRect(0, 0, 256, 18);
    });
    const geo = new THREE.BoxGeometry(6.1, 4.2, 8);
    const list: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = pitFrom; i <= pitTo; i++) {
      const p = this.at(i, 15.5 + 9, -1);
      // box long side (x) along the track tangent; the pit is on side -1, so turn it half way round to put the doors (+z) toward the lane
      q.setFromEuler(new THREE.Euler(0, Math.atan2(-p.tz, p.tx) + Math.PI, 0));
      m4.compose(new THREE.Vector3(p.x, p.y + 2.1, p.z), q, new THREE.Vector3(1, 1, 1));
      list.push(m4.clone());
    }
    void HALF;
    const mats = [mat(0xc9ccd2), mat(0xc9ccd2), mat(0xaeb2ba), mat(0xaeb2ba), new THREE.MeshStandardMaterial({ map: door, roughness: 0.7 }), mat(0xaeb2ba)];
    const im = new THREE.InstancedMesh(geo, mats as unknown as THREE.Material, Math.max(1, list.length));
    list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.count = list.length; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
    this.group.add(im);
    // flat roof slab and a long canopy over the lane
    const first = this.at(pitFrom, 15.5 + 9, -1), last = this.at(pitTo, 15.5 + 9, -1);
    const len = Math.hypot(last.x - first.x, last.z - first.z) + 6;
    const mid = this.at(Math.floor((pitFrom + pitTo) / 2), 15.5 + 4.6, -1);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, 5), mat(0xe8eaee, 0.5, 0.2));
    canopy.position.set(mid.x, mid.y + 4.9, mid.z); canopy.rotation.y = Math.atan2(-(last.z - first.z), last.x - first.x); canopy.castShadow = true;
    this.group.add(canopy);
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
    for (const m of [pole, booth, flag]) { m.count = corners.length; m.frustumCulled = false; this.group.add(m); }
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
    for (const m of [pole, head, lamp]) { m.count = spots.length; m.frustumCulled = false; this.group.add(m); }
  }

  // ---------- start gantry lights: five lamps that count down red, then go green ----------
  private gantryLights(): void {
    const { P, HALF, gantryAt } = this.k;
    const p = this.at(gantryAt, 0, 1), y = this.k.ground(P[gantryAt].x, P[gantryAt].z);
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5 * 1.5 + 0.8, 1.2, 0.5), mat(0x15181e, 0.5, 0.3)); g.add(bar);
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), this.lampMat[0]); l.position.set((k - 2) * 1.5, 0, 0.27); g.add(l); this.lamps.push(l);
      const l2 = l.clone(); l2.rotation.y = Math.PI; l2.position.z = -0.27; g.add(l2); this.lamps.push(l2);
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
