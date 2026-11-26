import * as THREE from 'three';
import type { RailLine, RailNetwork, Train, TrainSim } from './sim/rail';
import { type RailProfile, profileModeAt } from './sim/railProfile';

/**
 * Railways in the world: ballast and rails laid on the carved ground, bridges on piers, tunnel portals, level crossings with flashing lights and gates,
 * platforms, canopies and station buildings, and the trains themselves (a few meshes per train, positioned from the sim every frame).
 */
interface Acc { pos: number[]; uv: number[]; idx: number[]; v: number }
const acc = (): Acc => ({ pos: [], uv: [], idx: [], v: 0 });
function accMesh(a: Acc, mat: THREE.Material, shadow = true): THREE.Mesh | null {
  if (!a.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2)); g.setIndex(a.idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = shadow; m.castShadow = false; m.frustumCulled = true; return m;
}
const rng = (seed: number): (() => number) => { let s = seed | 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** tangent and normal at a profile sample */
function frame(P: RailProfile, i: number): { tx: number; tz: number; nx: number; nz: number } {
  const a = P.pts[Math.max(0, i - 1)], b = P.pts[Math.min(P.pts.length - 1, i + 1)];
  let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  return { tx: dx, tz: dz, nx: -dz, nz: dx };
}

export interface RailScenes {
  group: THREE.Group;
  /** call every frame with the clock in seconds */
  update: (t: number, dt: number) => void;
  /** is this point within r metres of the track (for clearing trees and grass)? */
  near: (x: number, z: number, r: number) => boolean;
  /** world-space spots to look at */
  shots: { name: string; cam: [number, number, number]; at: [number, number, number] }[];
}

export function buildRailScenes(o: { net: RailNetwork; sim: TrainSim | null; ground: (x: number, z: number) => number }): RailScenes {
  const { net } = o, group = new THREE.Group(); group.name = 'rail-scenes';
  const ballastTex = canvasTex(128, 128, (g) => {
    const r = rng(3);
    g.fillStyle = '#5d5a55'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { const v = 70 + Math.floor(r() * 80); g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
    g.fillStyle = '#3b3329'; for (let y = 8; y < 128; y += 32) g.fillRect(14, y, 100, 7);                    // sleepers
  }, [1, 1]);
  const ballast = new THREE.MeshStandardMaterial({ map: ballastTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9da1, metalness: 0.85, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const concreteTex = canvasTex(128, 128, (g) => { const r = rng(9); g.fillStyle = '#8e8c87'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 1800; i++) { const v = 110 + r() * 60; g.fillStyle = `rgba(${v},${v},${v - 6},0.5)`; g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 2); } }, [1, 1]);
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1, side: THREE.DoubleSide });
  const A = { ballast: acc(), steel: acc(), deck: acc(), wall: acc(), lining: acc() };

  const strip = (P: RailProfile, i0: number, i1: number, lat0: number, lat1: number, y: number, a: Acc, uvLen: number, trackLat = 0): void => {
    const base = a.v; let dist = 0;
    for (let i = i0; i <= i1; i++) {
      const f = frame(P, i), p = P.pts[i];
      if (i > i0) dist += Math.hypot(p[0] - P.pts[i - 1][0], p[1] - P.pts[i - 1][1]);
      a.pos.push(p[0] + f.nx * (trackLat + lat0), P.y[i] + y, p[1] + f.nz * (trackLat + lat0), p[0] + f.nx * (trackLat + lat1), P.y[i] + y, p[1] + f.nz * (trackLat + lat1));
      a.uv.push(0, dist / uvLen, 1, dist / uvLen);
    }
    for (let i = 0; i < i1 - i0; i++) { const q = base + i * 2; a.idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    a.v += (i1 - i0 + 1) * 2;
  };
  const wall = (P: RailProfile, i0: number, i1: number, lat: number, yLo: number, yHi: number, a: Acc): void => {
    const base = a.v;
    for (let i = i0; i <= i1; i++) { const f = frame(P, i), p = P.pts[i]; a.pos.push(p[0] + f.nx * lat, P.y[i] + yLo, p[1] + f.nz * lat, p[0] + f.nx * lat, P.y[i] + yHi, p[1] + f.nz * lat); a.uv.push(0, i * 0.2, 1, i * 0.2); }
    for (let i = 0; i < i1 - i0; i++) { const q = base + i * 2; a.idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    a.v += (i1 - i0 + 1) * 2;
  };

  const pillars: { x: number; z: number; yaw: number; w: number; y0: number; y1: number }[] = [];
  const corridor = new Map<number, number[]>();
  const addCorr = (x: number, z: number): void => { const k = Math.floor(x / 24) * 8192 + Math.floor(z / 24); let a = corridor.get(k); if (!a) { a = []; corridor.set(k, a); } a.push(x, z); };
  const portals: { P: RailProfile; i: number; dir: 1 | -1; double: boolean }[] = [];

  for (const line of net.lines) {
    const P = line.profile, n = P.pts.length, dbl = line.tracks === 2, sp = line.trackSpacing;
    const lats = dbl ? [-sp / 2, sp / 2] : [0];
    // runs that are not in a tunnel
    for (let i = 0; i < n; i++) {
      if (P.mode[i] === 'tunnel') continue;
      let j = i; while (j + 1 < n && P.mode[j + 1] !== 'tunnel') j++;
      if (j > i) {
        for (const lat of lats) {
          strip(P, i, j, -2.6, 2.6, -0.2, A.ballast, 6, lat);
          for (const s of [-0.7175, 0.7175]) strip(P, i, j, s - 0.07, s + 0.07, 0.03, A.steel, 6, lat);
        }
      }
      i = j;
    }
    for (let i = 0; i < n; i += 2) if (P.mode[i] !== 'tunnel') addCorr(P.pts[i][0], P.pts[i][1]);
    // bridges and viaducts
    for (const b of P.bridges) {
      const w = (dbl ? sp + 5.4 : 5.6), a = Math.max(0, b.from), e = Math.min(n - 1, b.to);
      strip(P, a, e, -w / 2, w / 2, -1.95, A.deck, 4);
      wall(P, a, e, -w / 2, -1.95, -0.1, A.wall); wall(P, a, e, w / 2, -1.95, -0.1, A.wall);
      wall(P, a, e, -w / 2, -0.1, 0.55, A.wall); wall(P, a, e, w / 2, -0.1, 0.55, A.wall);                 // ballast retaining walls
      for (let i = a + 2; i < e - 1; i += 4) { const f = frame(P, i); pillars.push({ x: P.pts[i][0], z: P.pts[i][1], yaw: Math.atan2(f.tx, f.tz), w: w * 0.78, y0: Math.min(P.g[i], P.y[i] - 3) - 3, y1: P.y[i] - 1.9 }); }
    }
    for (const t of P.tunnels) {
      portals.push({ P, i: t.from, dir: 1, double: dbl }, { P, i: t.to, dir: -1, double: dbl });
      // a little lining at each mouth
      const ow = dbl ? 6.4 : 3.6, oh = 6.2;
      for (const [i0, i1] of [[t.from, Math.min(t.to, t.from + 6)], [Math.max(t.from, t.to - 6), t.to]] as [number, number][]) {
        wall(P, i0, i1, -ow, -0.3, oh, A.lining); wall(P, i0, i1, ow, -0.3, oh, A.lining); strip(P, i0, i1, -ow, ow, oh, A.lining, 6); strip(P, i0, i1, -ow, ow, -0.3, A.lining, 6);
      }
    }
  }
  for (const m of [accMesh(A.ballast, ballast), accMesh(A.steel, steel, false), accMesh(A.deck, concrete), accMesh(A.wall, concrete), accMesh(A.lining, dark)]) if (m) group.add(m);

  // bridge piers
  if (pillars.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, pillars.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), tp = new THREE.Vector3();
    pillars.forEach((p, k) => { q.setFromAxisAngle(up, p.yaw); const h = Math.max(1, p.y1 - p.y0); im.setMatrixAt(k, m4.compose(tp.set(p.x, p.y0 + h / 2, p.z), q, sc.set(p.w, h, 2.4))); });
    im.castShadow = im.receiveShadow = true; group.add(im);
  }
  // tunnel portals: a concrete face with an arched opening
  for (const pt of portals) {
    const { P, i } = pt, f = frame(P, i), x = P.pts[i][0], z = P.pts[i][1], y = P.y[i];
    const ow = pt.double ? 6.4 : 3.6, oh = 6.2, W2 = ow + 7, shape = new THREE.Shape();
    shape.moveTo(-W2, -2.5); shape.lineTo(W2, -2.5); shape.lineTo(W2, oh + 4.5); shape.lineTo(-W2, oh + 4.5); shape.closePath();
    const hole = new THREE.Path(); hole.moveTo(-ow, 0); hole.lineTo(ow, 0); hole.lineTo(ow, oh - ow * 0.6); hole.absarc(0, oh - ow * 0.6, ow, 0, Math.PI, false); hole.lineTo(-ow, 0); shape.holes.push(hole);
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }), concrete);
    mesh.rotation.y = Math.atan2(f.tx, f.tz); const back = pt.dir === 1 ? -3 : 0;
    mesh.position.set(x + f.tx * back, y, z + f.tz * back); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }

  // ---- level crossings ----
  const levels = net.crossings.filter((c) => c.level);
  const plank = acc();
  const postGeo = new THREE.BoxGeometry(0.2, 3.4, 0.2), armGeo = new THREE.BoxGeometry(1, 0.13, 0.13); armGeo.translate(0.5, 0, 0);
  const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const armTex = canvasTex(64, 8, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f0' : '#d22'; g.fillRect(i * 8, 0, 8, 8); } });
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.6 }), Math.max(1, levels.length * 2));
  const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.6 }), Math.max(1, levels.length * 2));
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, levels.length * 4));
  lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, levels.length * 4) * 3), 3);
  const lv = levels.map((c) => {
    const line = net.lines[c.line], P = line.profile, y = P.y[Math.max(0, Math.min(P.pts.length - 1, Math.round(c.s / 10)))];
    const span = line.tracks === 2 ? line.trackSpacing + 3 : 2.6, rx = c.rx, rz = c.rz, rgx = -rz, rgz = rx, d = span + 3.4;
    // the paving across the tracks
    const hw = c.half, hl = span + 1.4, v = plank.v;
    for (const [a, b] of [[-hl, -hw], [hl, -hw], [-hl, hw], [hl, hw]] as [number, number][]) { plank.pos.push(c.x + rx * a + rgx * b, y + 0.14, c.z + rz * a + rgz * b); plank.uv.push(0, 0); }
    plank.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); plank.v += 4;
    return { c, y, rx, rz, rgx, rgz, d, hw, prog: 0, line };
  });
  if (plank.pos.length) { const m = accMesh(plank, new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), true); if (m) group.add(m); }
  const m4 = new THREE.Matrix4(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3(), sc = new THREE.Vector3(), colr = new THREE.Color();
  lv.forEach((L, i) => {
    // post for traffic moving +road direction stands before the tracks on its right; the other mirrors it
    for (const s of [0, 1]) {
      const sign = s ? 1 : -1, px = L.c.x + L.rx * L.d * sign + L.rgx * (L.hw + 1.6) * -sign, pz = L.c.z + L.rz * L.d * sign + L.rgz * (L.hw + 1.6) * -sign;
      posts.setMatrixAt(i * 2 + s, m4.makeTranslation(px, L.y + 1.5, pz));
    }
  });
  posts.instanceMatrix.needsUpdate = true; group.add(posts, arms, lamps);
  posts.castShadow = true;

  // ---- stations ----
  const brick = new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, (g) => { g.fillStyle = '#8a4a3a'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#6e3a2e'; for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < 128; x += 16) g.fillRect(x, y, 14, 6); g.fillStyle = '#243447'; for (let x = 10; x < 128; x += 28) g.fillRect(x, 22, 12, 22); }, [3, 1]), roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3d4650, roughness: 0.7, metalness: 0.3 });
  const shedMat = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#7e8a93'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#6a757d'; for (let x = 0; x < 64; x += 6) g.fillRect(x, 0, 2, 64); }, [10, 1]), roughness: 0.6, metalness: 0.5 });
  const stationShots: RailScenes['shots'] = [];
  for (const line of net.lines) {
    const P = line.profile;
    for (const st of line.stops) {
      if (st.kind === 'terminus') continue;
      const i = Math.max(1, Math.min(P.pts.length - 2, Math.round(st.s / 10))), f = frame(P, i), x = P.pts[i][0], z = P.pts[i][1], y = P.y[i], yaw = Math.atan2(f.tx, f.tz);
      if (profileModeAt(P, st.s) === 'tunnel') continue;
      const G = new THREE.Group(); G.position.set(x, y, z); G.rotation.y = yaw; group.add(G);   // local +z along the track, +x to the right of travel (north-west of ... mirrors the normal)
      const dbl = line.tracks === 2, len = st.kind === 'station' ? 120 : st.kind === 'halt' ? 56 : 0;
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number): THREE.Mesh => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; G.add(m); return m; };
      // local x of the group (after rotation.y = yaw) points to the right of the tangent: the same side as frame normal's negative; sample it:
      const sideSign = -1;     // frame.n is -z,x of the tangent; the group's +x is (tz, -tx)·… so the platform side is -n
      const sides = dbl ? [-1, 1] : [1];
      if (len) {
        for (const sd of sides) {
          const px = sd * ((dbl ? line.trackSpacing / 2 : 0) + 1.7 + 2.1);
          add(new THREE.BoxGeometry(4.2, 1.5, len), concrete, px, -0.4, 0);
          if (st.kind === 'station') {
            for (let k = -len / 2 + 8; k <= len / 2 - 8; k += 14) add(new THREE.BoxGeometry(0.3, 3.4, 0.3), steel, px + sd * 1.6, 2.0, k);
            add(new THREE.BoxGeometry(4.4, 0.25, len - 8), roofMat, px, 3.8, 0);
          } else add(new THREE.BoxGeometry(2.6, 2.2, 5), roofMat, px + sd * 0.4, 2.0, 0);
        }
        if (st.kind === 'station') {
          const bx = sides[sides.length - 1] * ((dbl ? line.trackSpacing / 2 : 0) + 11.5);
          add(new THREE.BoxGeometry(9, 5.2, 26), brick, bx, 2.1, 0);
          const roof = add(new THREE.BoxGeometry(11, 0.6, 28), roofMat, bx, 5.1, 0); roof.rotation.z = 0;
          add(new THREE.BoxGeometry(1.6, 3.4, 1.6), brick, bx, 4.0, 14.5);       // clock tower stub
        }
      } else {
        // freight depot: a long shed, a loading dock and a few stacked containers
        add(new THREE.BoxGeometry(14, 7.5, 46), shedMat, 17 * sides[0], 3.0, 0);
        add(new THREE.BoxGeometry(5, 1.1, 46), concrete, 8.2 * sides[0], -0.4, 0);
        const cols = [0xb5453a, 0x2f6aa5, 0xd9a21b, 0x4d7a4c, 0x8a8f96];
        for (let k = 0; k < 6; k++) for (let h = 0; h < 2; h++) add(new THREE.BoxGeometry(2.6, 2.6, 12), new THREE.MeshStandardMaterial({ color: cols[(k * 2 + h) % cols.length], roughness: 0.7, metalness: 0.2 }), 30 * sides[0] + (k % 2) * 3, 1.3 + h * 2.7, -22 + k * 8);
      }
      void sideSign;
      // the name on a board
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const g = cv.getContext('2d')!;
      g.fillStyle = '#10243d'; g.fillRect(0, 0, 512, 96); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 86); g.fillStyle = '#fff'; g.font = '700 46px Outfit, Arial, sans-serif'; g.textAlign = 'center'; g.fillText(st.name, 256, 62);
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const board = add(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }), 0, 6.4, 0); board.castShadow = false; board.rotation.y = Math.PI / 2;
      stationShots.push({ name: 'Station: ' + st.name, cam: [x - f.nx * 40 + f.tx * 70, y + 14, z - f.nz * 40 + f.tz * 70], at: [x, y + 2, z] });
    }
  }

  // ---- trains ----
  const trainGroup = new THREE.Group(); trainGroup.name = 'trains'; group.add(trainGroup);
  const pax = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (g) => { g.fillStyle = '#dfe3e6'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#1d4e89'; g.fillRect(0, 44, 256, 12); g.fillStyle = '#1b2733'; for (let x = 8; x < 256; x += 32) g.fillRect(x, 12, 22, 20); }, [1, 1]), roughness: 0.45, metalness: 0.35 });
  const paxCab = new THREE.MeshStandardMaterial({ color: 0x1d4e89, roughness: 0.4, metalness: 0.4 });
  const frtLoco = new THREE.MeshStandardMaterial({ color: 0xb8461f, roughness: 0.55, metalness: 0.3 });
  const locoLightMat = new THREE.MeshBasicMaterial({ color: 0xfff6d2 });
  const frtCols = [0x7a3b2a, 0x4a4f55, 0x6b4a32, 0x2f4a68, 0x8a8f96, 0x5f6f52].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.25 }));
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.5, metalness: 0.6 });
  const bogieMat = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.65, metalness: 0.72 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x454a52, roughness: 0.38, metalness: 0.88 });
  const bogieFrameGeo = new THREE.BoxGeometry(1.94, 0.44, 2.75);
  const wheelSetGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.72, 12);
  wheelSetGeo.rotateZ(Math.PI / 2);
  const addBogies = (o2: THREE.Group, L: number): void => {
    const zOff = Math.max(2.1, L * 0.34);
    for (const sz of [-zOff, zOff]) {
      const fr = new THREE.Mesh(bogieFrameGeo, bogieMat);
      fr.position.set(0, 0.50, sz);
      o2.add(fr);
      for (const wz of [-0.9, 0.9]) {
        const wh = new THREE.Mesh(wheelSetGeo, wheelMat);
        wh.position.set(0, 0.42, sz + wz);
        o2.add(wh);
      }
    }
    const under = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.34, L * 0.95), bogieMat);
    under.position.set(0, 0.94, 0);
    o2.add(under);
  };
  type CarMesh = { mesh: THREE.Object3D; back: number; len: number };
  const meshes = new Map<number, { g: THREE.Group; cars: CarMesh[] }>();
  const makeTrain = (t: Train): { g: THREE.Group; cars: CarMesh[] } => {
    const g = new THREE.Group(), cars: CarMesh[] = [], r = rng(t.id * 31 + 7);
    for (let k = 0; k < t.cars; k++) {
      let mesh: THREE.Object3D;
      const L = t.carLen - 0.6;
      if (t.kind === 'passenger') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.45, L), k === 0 || k === t.cars - 1 ? paxCab : pax);
        const o2 = new THREE.Group();
        addBogies(o2, L);
        m.position.y = 2.78;
        o2.add(m);
        if (k === 0 || k === t.cars - 1) {
          const nose = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.55, 3), paxCab);
          nose.position.set(0, 2.30, (k === 0 ? 1 : -1) * (L / 2 + 0.6));
          o2.add(nose);
          // Bright twin locomotive headlights on lead cab
          for (const sx of [-0.75, 0.75]) {
            const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.16), locoLightMat);
            hl.position.set(sx, 2.25, (k === 0 ? 1 : -1) * (L / 2 + 2.15));
            o2.add(hl);
          }
        }
        mesh = o2;
      } else if (k === 0) {
        const o2 = new THREE.Group();
        addBogies(o2, L);
        const m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.55, L), frtLoco);
        m.position.y = 2.82;
        o2.add(m);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, L * 0.45), frtLoco);
        hood.position.set(0, 4.72, -L * 0.2);
        o2.add(hood);
        for (const sx of [-0.85, 0.85]) {
          const hl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.18), locoLightMat);
          hl.position.set(sx, 2.38, L / 2 + 0.1);
          o2.add(hl);
        }
        mesh = o2;
      } else {
        const kind = r() < 0.3 ? 'tank' : r() < 0.5 ? 'flat' : 'box', o2 = new THREE.Group();
        addBogies(o2, L);
        if (kind === 'tank') { const c = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, L - 1, 14), tankMat); c.rotation.x = Math.PI / 2; c.position.y = 2.50; o2.add(c); }
        else if (kind === 'flat') { const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.38, L), tankMat); b.position.y = 1.22; o2.add(b); const cc = [0xb5453a, 0x2f6aa5, 0xd9a21b, 0x4d7a4c]; for (let c = 0; c < 2; c++) { const ct = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, L / 2 - 0.5), new THREE.MeshStandardMaterial({ color: cc[Math.floor(r() * 4)], roughness: 0.7, metalness: 0.2 })); ct.position.set(0, 2.70, (c - 0.5) * (L / 2)); o2.add(ct); } }
        else { const b = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.45, L), frtCols[Math.floor(r() * frtCols.length)]); b.position.y = 2.78; o2.add(b); }
        mesh = o2;
      }
      mesh.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      g.add(mesh); cars.push({ mesh, back: k * t.carLen + t.carLen / 2, len: t.carLen });
    }
    trainGroup.add(g);
    return { g, cars };
  };
  const place = { x: 0, z: 0, yaw: 0, y: 0 }, pf = { x: 0, z: 0, yaw: 0, y: 0 }, pr = { x: 0, z: 0, yaw: 0, y: 0 };

  const update = (now: number, dt: number): void => {
    // trains
    if (o.sim) for (const t of o.sim.trains) {
      let rec = meshes.get(t.id); if (!rec) { rec = makeTrain(t); meshes.set(t.id, rec); }
      const P = net.lines[t.line].profile;
      rec.g.visible = true;
      for (const c of rec.cars) {
        o.sim.place(t, c.back, place);
        // a car inside a tunnel is not drawn
        if (profileModeAt(P, Math.max(0, Math.min(P.len, t.s - t.dir * c.back))) === 'tunnel') { c.mesh.visible = false; continue; }
        c.mesh.visible = true;
        o.sim.place(t, c.back - c.len / 2, pf); o.sim.place(t, c.back + c.len / 2, pr);
        c.mesh.position.set(place.x, place.y + 0.03, place.z);
        c.mesh.rotation.set(0, 0, 0, 'YXZ');
        c.mesh.rotation.y = Math.atan2(pf.x - pr.x, pf.z - pr.z);
        c.mesh.rotation.x = -Math.atan2(pf.y - pr.y, Math.hypot(pf.x - pr.x, pf.z - pr.z) || 1);
      }
    }
    // crossings: arms come down 3.5 s after the bells start, lamps flash alternately
    for (let i = 0; i < lv.length; i++) {
      const L = lv[i], closed = L.c.closed;
      L.prog += ((closed ? 1 : 0) - L.prog) * Math.min(1, dt * 1.4);
      if (!closed && L.prog < 0.02) L.prog = 0;
      const lift = Math.PI / 2 * (1 - (L.c.closedFor > 1.2 || (!closed && L.prog > 0) ? L.prog : 0));
      for (const s of [0, 1]) {
        const sign = s ? 1 : -1, px = L.c.x + L.rx * L.d * sign + L.rgx * (L.hw + 1.6) * -sign, pz = L.c.z + L.rz * L.d * sign + L.rgz * (L.hw + 1.6) * -sign;
        const dx = L.rgx * sign, dz = L.rgz * sign;                    // across the road, toward its centre line
        q1.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx)); q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), lift); q1.multiply(q2);
        arms.setMatrixAt(i * 2 + s, m4.compose(tp.set(px, L.y + 2.6, pz), q1, sc.set(L.hw + 0.6, 1, 1)));
        const on = (L.c.closed || L.prog > 0.05) ? (Math.floor(now * 2.4 + s) % 2 ? 1 : 0.12) : 0.1;
        for (const k of [0, 1]) { lamps.setMatrixAt(i * 4 + s * 2 + k, m4.compose(tp.set(px, L.y + 3.1, pz + 0), q2.identity(), one).setPosition(px + L.rx * (k ? 0.4 : -0.4) * 0.6, L.y + 3.15, pz + L.rz * (k ? 0.4 : -0.4) * 0.6)); lamps.setColorAt(i * 4 + s * 2 + k, colr.setRGB(on * ((k + Math.floor(now * 2.4)) % 2 ? 1 : 0.15), on * 0.05, on * 0.04)); }
      }
    }
    if (lv.length) { arms.instanceMatrix.needsUpdate = true; lamps.instanceMatrix.needsUpdate = true; if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true; }
  };

  const near = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor(x / 24), cz = Math.floor(z / 24), r2 = r * r;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = corridor.get((cx + i) * 8192 + cz + j); if (!a) continue; for (let k = 0; k < a.length; k += 2) { const dx = a[k] - x, dz = a[k + 1] - z; if (dx * dx + dz * dz < r2) return true; } }
    return false;
  };
  const shots: RailScenes['shots'] = [...stationShots];
  for (const line of net.lines) { const P = line.profile; for (const b of P.bridges) { const i = Math.round((b.from + b.to) / 2), f = frame(P, i); shots.push({ name: line.name + ': bridge', cam: [P.pts[i][0] + f.nx * 45, P.g[i] + 12, P.pts[i][1] + f.nz * 45], at: [P.pts[i][0], P.y[i], P.pts[i][1]] }); } }
  return { group, update, near, shots };
}

export type { RailLine };
