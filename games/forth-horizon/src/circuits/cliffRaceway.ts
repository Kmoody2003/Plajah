import * as THREE from 'three';
import { catchFence, type FencePoint } from '../catchFence';
import { detailedStand, pitGarage } from '../trackArchitecture';
import { TRACK_HALF, cliffSurface, indexTrack, type TrackDesign } from './cliffTrack';

export interface CircuitCorner {
  n?: number;
  name: string;
  turn: number;
  x: number;
  z: number;
}

export interface CircuitDef {
  xz: number[][];
  y?: number[];
  name: string;
  kind: string;
  tunnel?: { from: number; to: number };
  corners?: CircuitCorner[];
}

export interface CliffRacewayOptions {
  circuit: CircuitDef;
  ground: (x: number, z: number) => number;     // the height of the terrain MESH that is drawn, for things beside the road
  exag: number;
  /** the asphalt the other circuits use (with its lane markings and wet-road shading); otherwise the raceway's own */
  roadMaterial?: THREE.Material;
  /** the engineered road (cliffTrack.ts): smooth plan, profile and banking; the ground was graded to it before the terrain was meshed */
  design: TrackDesign;
}

export interface CliffRacewayHandle {
  group: THREE.Group;
  setLights: (state: 'red' | 'green' | 'off') => void;
  /** the road surface: the game rides on it, so it must be registered as a drivable surface */
  road: THREE.Mesh;
  /** the centre line, and the part of it that runs through the tunnel (where the terrain above must not hold the car up) */
  path: { x: number; z: number }[];
  tunnelPath: { x: number; z: number }[];
}

interface DensePoint {
  bank?: number;
  curv?: number;
  x: number;
  y: number;
  z: number;
  srcIdx: number;
}

const TEX_BASE = '/games/forth-horizon/tex/';
const ROAD_HALF = TRACK_HALF;
const ROAD_WIDTH = ROAD_HALF * 2;
const ROAD_LIFT = 0.1;
const KERB_LIFT = 0.125;

const COLS = 5;
const texLoader = new THREE.TextureLoader();

function loadPbrTex(file: string, isColor: boolean, repeat: boolean | number = true): THREE.Texture {
  const tex = texLoader.load(TEX_BASE + file);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (typeof repeat === 'number') {
      tex.repeat.set(repeat, repeat);
    }
  }
  return tex;
}

function makeWeatheredSteelMat(color = 0xcfd6de, rep = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map: loadPbrTex('tex-shared-14-steel-panel_base.png', true, rep),
    normalMap: loadPbrTex('tex-shared-14-steel-panel_normal.png', false, rep),
    roughnessMap: loadPbrTex('tex-shared-14-steel-panel_roughness.png', false, rep),
    roughness: 0.42,
    metalness: 0.86,
  });
}

function makeWeatheredConcreteMat(color = 0xd8d6d0, rep = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map: loadPbrTex('tex-shared-16-concrete-weathered_base.png', true, rep),
    normalMap: loadPbrTex('tex-shared-16-concrete-weathered_normal.png', false, rep),
    roughnessMap: loadPbrTex('tex-shared-16-concrete-weathered_roughness.png', false, rep),
    roughness: 0.88,
    metalness: 0.04,
  });
}

function makeCanvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  repeat?: [number, number],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function densifyCircuit(
  circuit: CircuitDef,
  ground: (x: number, z: number) => number,
  exag: number,
  step = 6,
): DensePoint[] {
  const out: DensePoint[] = [];
  const n = circuit.xz.length;
  for (let i = 0; i < n; i++) {
    const a = circuit.xz[i];
    const b = circuit.xz[(i + 1) % n];
    const ya = circuit.y ? circuit.y[i] * exag : ground(a[0], a[1]);
    const yb = circuit.y ? circuit.y[(i + 1) % n] * exag : ground(b[0], b[1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({
        x: a[0] + (b[0] - a[0]) * t,
        y: ya + (yb - ya) * t,
        z: a[1] + (b[1] - a[1]) * t,
        srcIdx: i,
      });
    }
  }
  return out;
}


/** A strip along the road between lateral offsets o1..o2 (metres, + toward the +normal side), on the banked profile; only where include(i) and include(i+1). `drop` hangs it down (a skirt). */
function buildStrip(P: DensePoint[], o1: number, o2: number, lift: number, tile: number, include: (i: number) => boolean, drop = 0): THREE.BufferGeometry {
  const n = P.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0, base = 0;
  const vert = (i: number, o: number, dy: number, vv: number, u: number): void => {
    const p = P[i % n], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    pos.push(p.x - tz * o, p.y + o * Math.sin(p.bank ?? 0) + lift + dy, p.z + tx * o); uv.push(u, vv);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    dist += Math.hypot(P[j].x - P[i].x, P[j].z - P[i].z);
    if (!include(i) || !include(j)) continue;
    const d0 = dist - Math.hypot(P[j].x - P[i].x, P[j].z - P[i].z) , d1 = dist;
    if (drop) { vert(i, o1, 0, d0 / tile, 0); vert(j, o1, 0, d1 / tile, 0); vert(i, o1, -drop, d0 / tile, 1); vert(j, o1, -drop, d1 / tile, 1); }
    else { vert(i, o1, 0, d0 / tile, 0); vert(j, o1, 0, d1 / tile, 0); vert(i, o2, 0, d0 / tile, 1); vert(j, o2, 0, d1 / tile, 1); }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); base += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function buildRibbonGeometry(
  pts: { x: number; z: number; y?: number; bank?: number }[],
  width: number,
  tileLength: number,
  ground: (x: number, z: number) => number,
  lift: number,
  closed: boolean,
  fixedHeight?: (i: number) => boolean,
): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  if (n < 2) {
    return new THREE.BufferGeometry();
  }

  let dist = 0;
  const count = closed ? n + 1 : n;
  for (let i = 0; i < count; i++) {
    const curr = pts[i % n];
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(i + 1, n - 1)];

    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;

    const nx = (-dz * width) / 2;
    const nz = (dx * width) / 2;

    const lx = curr.x + nx;
    const lz = curr.z + nz;
    const rx = curr.x - nx;
    const rz = curr.z - nz;

    // five points across on the engineered profile: the road's own height, crowned by its bank (the ground was graded to it, so nothing pokes through)
    const bank = (curr as { bank?: number }).bank ?? 0, sb = Math.sin(bank);
    for (let c = 0; c < COLS; c++) {
      const f = (c / (COLS - 1)) * 2 - 1;                   // -1 (left edge) .. +1 (right edge)
      const x = curr.x + nx * f, z = curr.z + nz * f;
      pos.push(x, (curr.y as number) + f * (width / 2) * sb + lift, z);
      uv.push((f + 1) / 2, dist / tileLength);
    }

    if (i < count - 1) {
      const nxt = pts[(i + 1) % n];
      dist += Math.hypot(nxt.x - curr.x, nxt.z - curr.z);
    }
  }

  for (let i = 0; i < count - 1; i++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = i * COLS + c, b = a + COLS;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildCliffRacewayCircuit(opts: CliffRacewayOptions): CliffRacewayHandle {
  const { circuit, exag } = opts;
  const trackIx = indexTrack(opts.design);
  // every object on or beside the road stands on the drawn road surface (crown, bank, grade), and on the graded ground beyond it
  const ground = (x: number, z: number): number => { const sy = cliffSurface(trackIx, x, z); return Number.isNaN(sy) ? opts.ground(x, z) : sy * exag; };
  const emptyRoad = new THREE.Mesh();
  const group = new THREE.Group();
  group.name = 'cliffRacewayCircuit';

  const P: DensePoint[] = opts.design.pts.map((p) => ({ x: p.x, y: p.y * exag, z: p.z, srcIdx: p.src, bank: p.bank, curv: p.curv }));
  const n = P.length;
  if (n < 4) {
    return { group, setLights: () => {}, road: emptyRoad, path: [], tunnelPath: [] };
  }

  const tan = (i: number): [number, number] => {
    const a = P[(i - 1 + n) % n];
    const b = P[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };

  const at = (i: number, off: number, side: number, along = 0) => {
    const wrapped = ((i % n) + n) % n;
    const p = P[wrapped];
    const [tx, tz] = tan(wrapped);
    const x = p.x - tz * off * side + tx * along;
    const z = p.z + tx * off * side + tz * along;
    return { x, y: ground(x, z), z, tx, tz };
  };

  // Resolve tunnel range in dense indices
  let tunnelDenseFrom = -1;
  let tunnelDenseTo = -1;
  if (circuit.tunnel) {
    tunnelDenseFrom = P.findIndex((p) => p.srcIdx >= circuit.tunnel!.from);
    for (let i = n - 1; i >= 0; i--) {
      if (P[i].srcIdx <= circuit.tunnel.to) {
        tunnelDenseTo = i;
        break;
      }
    }
  }
  const inTunnel = (i: number): boolean => {
    if (tunnelDenseFrom < 0 || tunnelDenseTo < 0) return false;
    const w = ((i % n) + n) % n;
    return w >= tunnelDenseFrom && w <= tunnelDenseTo;
  };

  // Shared weathered PBR materials
  const steelMat = makeWeatheredSteelMat(0xcfd6de, 2);
  const darkSteelMat = makeWeatheredSteelMat(0x525a66, 2);
  const concreteMat = makeWeatheredConcreteMat(0xd8d6d0, 2);
  const portalConcreteMat = makeWeatheredConcreteMat(0x9ea4ac, 2);

  // Pit-lane sample range on side -1 near start/finish (gantryAt = 0)
  const pitCount = Math.min(8, Math.max(4, Math.floor(n * 0.08)));
  const pitIndices: number[] = [];
  for (let k = 1; k <= pitCount; k++) {
    const idx = (k + 1) % n;
    if (!inTunnel(idx)) pitIndices.push(idx);
  }
  const pitSet = new Set(pitIndices);
  const inPit = (i: number): boolean => {
    const w = ((i % n) + n) % n;
    return pitSet.has(w) || pitSet.has((w + 1) % n) || pitSet.has((w - 1 + n) % n);
  };

  // 1. Coastal raceway asphalt ribbon
  const asphaltGeo = buildRibbonGeometry(P, ROAD_WIDTH, 7.5, ground, ROAD_LIFT, true, inTunnel);
  const asphaltMat = opts.roadMaterial ?? new THREE.MeshStandardMaterial({
    map: loadPbrTex('ground_asphalt_dry.png', true),
    normalMap: loadPbrTex('ground_asphalt_dry_normal.png', false),
    roughnessMap: loadPbrTex('ground_asphalt_dry_roughness.png', false),
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.name = 'cliffRacewayAsphalt';
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  // 1b. Edge lines, inside kerbs on every corner, and the road's side skirts (the bench under a banked road is lower than its outer edge: the skirt closes that gap)
  {
    const strip = (g: THREE.BufferGeometry, mat: THREE.Material, name: string): void => { if (!g.getAttribute('position') || g.getAttribute('position').count === 0) return; const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; group.add(m); };
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.55, roughnessMap: loadPbrTex('ground_asphalt_dry_roughness.png', false), normalMap: loadPbrTex('ground_asphalt_dry_normal.png', false), normalScale: new THREE.Vector2(0.6, 0.6), polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, side: THREE.DoubleSide });
    for (const sd of [-1, 1]) strip(buildStrip(P, sd * (ROAD_HALF - 0.62), sd * (ROAD_HALF - 0.4), ROAD_LIFT + 0.02, 6, () => true), lineMat, 'cliffEdgeLine');
    const rumble = new THREE.MeshStandardMaterial({ map: loadPbrTex('ground_rumble_strip.png', true), normalMap: loadPbrTex('ground_rumble_strip_normal.png', false), roughnessMap: loadPbrTex('ground_rumble_strip_roughness.png', false), normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 });
    for (const sd of [-1, 1]) {
      const bend = (i: number): boolean => !inTunnel(i) && (sd > 0 ? (P[i].curv ?? 0) > 0.0042 : (P[i].curv ?? 0) < -0.0042);       // tighter than about a 240 m radius
      strip(buildStrip(P, sd * (ROAD_HALF - 1.0), sd * (ROAD_HALF + 0.35), ROAD_LIFT + 0.03, 3.2, bend), rumble, 'cliffKerb');
    }
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.9, side: THREE.DoubleSide });
    for (const sd of [-1, 1]) strip(buildStrip(P, sd * ROAD_HALF, sd * ROAD_HALF, ROAD_LIFT - 0.02, 6, () => true, 1.6), skirtMat, 'cliffSkirt');
  }

  // 2. Red-and-white rumble kerbs on apexes
  const corners = circuit.corners ?? [];
  if (corners.length > 0) {
    const kerbMat = new THREE.MeshStandardMaterial({
      map: loadPbrTex('ground_rumble_strip.png', true),
      normalMap: loadPbrTex('ground_rumble_strip_normal.png', false),
      roughnessMap: loadPbrTex('ground_rumble_strip_roughness.png', false),
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });

    for (const cn of corners) {
      let bi = 0;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (P[i].x - cn.x) ** 2 + (P[i].z - cn.z) ** 2;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      const inside = cn.turn > 0 ? 1 : -1;
      const kerbPts: { x: number; z: number; y?: number; bank?: number }[] = [];
      for (let k = -8; k <= 8; k++) {
        const idx = (bi + k + n) % n;
        const [tx, tz] = tan(idx);
        kerbPts.push({
          y: P[idx].y + (ROAD_HALF - 0.55) * inside * Math.sin(P[idx].bank ?? 0), bank: P[idx].bank,
          x: P[idx].x - tz * (ROAD_HALF - 0.55) * inside,
          z: P[idx].z + tx * (ROAD_HALF - 0.55) * inside,
        });
      }
      const kGeo = buildRibbonGeometry(kerbPts, 1.85, 3.2, ground, KERB_LIFT, false);
      const kMesh = new THREE.Mesh(kGeo, kerbMat);
      kMesh.receiveShadow = true;
      group.add(kMesh);
    }
  }

  // 3. Start/finish timing gantry with setLights + chequered line
  const gantryAt = 0;
  const gPos = at(gantryAt, 0, 1);
  const gantryGroup = new THREE.Group();
  gantryGroup.name = 'startFinishGantry';
  gantryGroup.position.set(gPos.x, gPos.y, gPos.z);
  gantryGroup.rotation.y = Math.atan2(gPos.tx, gPos.tz);

  const gantrySteelMat = darkSteelMat;
  const pillarGeo = new THREE.BoxGeometry(1.1, 8.2, 1.1);
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, gantrySteelMat);
    pillar.position.set(sx * (ROAD_HALF + 2.3), 4.1, 0);
    pillar.castShadow = true;
    gantryGroup.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * (ROAD_HALF + 2.9), 1.4, 1.3), gantrySteelMat);
  beam.position.set(0, 8.3, 0);
  beam.castShadow = true;
  gantryGroup.add(beam);

  const bannerTex = makeCanvasTex(1024, 128, (ctx) => {
    ctx.fillStyle = '#0d1826';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#00daf3';
    ctx.fillRect(0, 0, 1024, 10);
    ctx.fillRect(0, 118, 1024, 10);
    ctx.fillStyle = '#f2f6fa';
    ctx.font = '800 52px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GREAT LAKES CLIFF RACEWAY', 512, 66);
  });
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(2 * ROAD_HALF, 1.2, 0.25),
    new THREE.MeshStandardMaterial({
      map: bannerTex,
      emissive: new THREE.Color(0x0a3b4a),
      emissiveIntensity: 0.7,
      roughness: 0.4,
    }),
  );
  banner.position.set(0, 8.3, 0.78);
  gantryGroup.add(banner);
  const bannerBack = banner.clone();
  bannerBack.position.z = -0.78;
  bannerBack.rotation.y = Math.PI;
  gantryGroup.add(bannerBack);

  // 5-lamp start light pod
  const lampHousing = new THREE.Mesh(
    new THREE.BoxGeometry(5 * 1.45 + 0.8, 1.15, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x12151b, roughness: 0.5, metalness: 0.4 }),
  );
  lampHousing.position.set(0, 6.95, 0);
  gantryGroup.add(lampHousing);

  const lampMats = [
    new THREE.MeshBasicMaterial({ color: 0x2a0c0c }), // off
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }), // red
    new THREE.MeshBasicMaterial({ color: 0x28ff5a }), // green
  ];
  const lamps: THREE.Mesh[] = [];
  const lampGeo = new THREE.CircleGeometry(0.42, 20);
  for (let k = 0; k < 5; k++) {
    const front = new THREE.Mesh(lampGeo, lampMats[0]);
    front.position.set((k - 2) * 1.45, 6.95, 0.27);
    gantryGroup.add(front);
    lamps.push(front);

    const back = new THREE.Mesh(lampGeo, lampMats[0]);
    back.position.set((k - 2) * 1.45, 6.95, -0.27);
    back.rotation.y = Math.PI;
    gantryGroup.add(back);
    lamps.push(back);
  }
  group.add(gantryGroup);

  let lightState = 0;
  const setLights = (state: 'red' | 'green' | 'off'): void => {
    const next = state === 'red' ? 1 : state === 'green' ? 2 : 0;
    if (next === lightState) return;
    lightState = next;
    for (const lamp of lamps) {
      lamp.material = lampMats[next];
    }
  };

  // Chequered start/finish line
  const chkCols = Math.floor(ROAD_WIDTH / 1.1);
  const chkMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.1, 0.05, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }),
    chkCols * 2,
  );
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let ci = 0;
  for (let a = 0; a < chkCols; a++) {
    for (let b = 0; b < 2; b++) {
      const lx = (a - chkCols / 2 + 0.5) * 1.1;
      const lz = (b - 0.5) * 1.1;
      const wx = gPos.x - gPos.tz * lx + gPos.tx * lz;
      const wz = gPos.z + gPos.tx * lx + gPos.tz * lz;
      m4.makeRotationY(Math.atan2(gPos.tx, gPos.tz));
      m4.setPosition(wx, ground(wx, wz) + ROAD_LIFT + 0.03, wz);
      chkMesh.setMatrixAt(ci, m4);
      chkMesh.setColorAt(ci, col.setHex((a + b) & 1 ? 0x121418 : 0xf2f4f7));
      ci++;
    }
  }
  chkMesh.count = ci;
  chkMesh.frustumCulled = false;
  group.add(chkMesh);

  // 4. Cliffside Armco & concrete barriers
  const concreteMatrices: THREE.Matrix4[] = [];
  const armcoRailMatrices: THREE.Matrix4[] = [];
  const armcoPostMatrices: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < n; i++) {
    if (inTunnel(i)) continue;
    const [tx, tz] = tan(i);
    const ry = Math.atan2(tx, tz);
    q.setFromAxisAngle(yAxis, ry);

    for (const side of [-1, 1]) {
      if (side === -1 && inPit(i)) continue;
      const off = ROAD_HALF + 1.35;
      const bp = at(i, off, side);

      // Alternating concrete Jersey base + Armco guardrail along the coastal cliffside
      if (side === 1 || i % 3 === 0) {
        for (const along of [-1.5, 1.5]) {
          const px = bp.x + tx * along;
          const pz = bp.z + tz * along;
          const py = ground(px, pz);
          m4.compose(new THREE.Vector3(px, py + 0.42, pz), q, new THREE.Vector3(1, 1, 1));
          concreteMatrices.push(m4.clone());
        }
      }

      // Steel Armco W-beam rail + posts
      const nextP = at((i + 1) % n, off, side);
      const segLen = Math.hypot(nextP.x - bp.x, nextP.z - bp.z) || 6;
      const mx = (bp.x + nextP.x) * 0.5;
      const mz = (bp.z + nextP.z) * 0.5;
      const my = ground(mx, mz);
      const segRy = Math.atan2(nextP.x - bp.x, nextP.z - bp.z);
      q.setFromAxisAngle(yAxis, segRy);
      m4.compose(new THREE.Vector3(mx, my + 0.72, mz), q, new THREE.Vector3(1, 1, segLen / 6));
      armcoRailMatrices.push(m4.clone());

      m4.compose(new THREE.Vector3(bp.x, bp.y + 0.48, bp.z), q, new THREE.Vector3(1, 1, 1));
      armcoPostMatrices.push(m4.clone());
    }
  }

  if (concreteMatrices.length > 0) {
    const jerseyGeo = new THREE.BoxGeometry(0.55, 0.84, 2.95);
    const jerseyInst = new THREE.InstancedMesh(jerseyGeo, concreteMat, concreteMatrices.length);
    concreteMatrices.forEach((mm, idx) => jerseyInst.setMatrixAt(idx, mm));
    jerseyInst.count = concreteMatrices.length;
    jerseyInst.frustumCulled = false;
    jerseyInst.castShadow = true;
    jerseyInst.receiveShadow = true;
    group.add(jerseyInst);
  }

  if (armcoRailMatrices.length > 0) {
    const railGeo = new THREE.BoxGeometry(0.14, 0.32, 6.05);
    const railInst = new THREE.InstancedMesh(railGeo, steelMat, armcoRailMatrices.length);
    armcoRailMatrices.forEach((mm, idx) => railInst.setMatrixAt(idx, mm));
    railInst.count = armcoRailMatrices.length;
    railInst.frustumCulled = false;
    railInst.castShadow = true;
    group.add(railInst);

    const postGeo = new THREE.BoxGeometry(0.14, 0.96, 0.14);
    const postInst = new THREE.InstancedMesh(postGeo, darkSteelMat, armcoPostMatrices.length);
    armcoPostMatrices.forEach((mm, idx) => postInst.setMatrixAt(idx, mm));
    postInst.count = armcoPostMatrices.length;
    postInst.frustumCulled = false;
    group.add(postInst);
  }

  // 5. Tunnel portal lighting strips, overhead LEDs & glowing chevron reflectors for circuit.tunnel
  if (circuit.tunnel && tunnelDenseFrom >= 0 && tunnelDenseTo >= 0) {
    const portalMat = portalConcreteMat;
    const ledStripMat = new THREE.MeshBasicMaterial({ color: 0xffd27d });
    const overheadBarMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00daf3 });

    for (const portalIdx of [tunnelDenseFrom, tunnelDenseTo]) {
      const pp = at(portalIdx, 0, 1);
      const portal = new THREE.Group();
      portal.position.set(pp.x, pp.y, pp.z);
      portal.rotation.y = Math.atan2(pp.tx, pp.tz);

      const spanW = ROAD_WIDTH + 3.2;
      const archH = 6.6;

      // Portal walls + lintel
      for (const sx of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, archH, 3.2), portalMat);
        wall.position.set(sx * (spanW / 2 - 0.7), archH / 2, 0);
        wall.castShadow = true;
        wall.receiveShadow = true;
        portal.add(wall);

        const vertLed = new THREE.Mesh(new THREE.BoxGeometry(0.18, archH - 0.8, 0.18), ledStripMat);
        vertLed.position.set(sx * (spanW / 2 - 1.45), (archH - 0.8) / 2, 1.55);
        portal.add(vertLed);

        const vertLedBack = vertLed.clone();
        vertLedBack.position.z = -1.55;
        portal.add(vertLedBack);
      }

      const lintel = new THREE.Mesh(new THREE.BoxGeometry(spanW, 1.4, 3.2), portalMat);
      lintel.position.set(0, archH + 0.7, 0);
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      portal.add(lintel);

      const topLed = new THREE.Mesh(new THREE.BoxGeometry(spanW - 2.8, 0.22, 0.2), beaconMat);
      topLed.position.set(0, archH + 0.05, 1.62);
      portal.add(topLed);

      const topLedBack = topLed.clone();
      topLedBack.position.z = -1.62;
      portal.add(topLedBack);

      group.add(portal);
    }

    // Interior tunnel overhead longitudinal + transverse LED strips
    const stripGeo = new THREE.BoxGeometry(0.3, 0.14, 2.8);
    const barGeo = new THREE.BoxGeometry(ROAD_WIDTH - 2.2, 0.12, 0.28);
    const stripMatrices: THREE.Matrix4[] = [];
    const barMatrices: THREE.Matrix4[] = [];
    for (let i = tunnelDenseFrom + 2; i < tunnelDenseTo; i += 3) {
      const tp = at(i, 0, 1);
      q.setFromAxisAngle(yAxis, Math.atan2(tp.tx, tp.tz));
      for (const sx of [-ROAD_HALF + 0.8, ROAD_HALF - 0.8]) {
        const lx = tp.x - tp.tz * sx;
        const lz = tp.z + tp.tx * sx;
        m4.compose(new THREE.Vector3(lx, ground(lx, lz) + 5.8, lz), q, new THREE.Vector3(1, 1, 1));
        stripMatrices.push(m4.clone());
      }
      m4.compose(new THREE.Vector3(tp.x, tp.y + 5.95, tp.z), q, new THREE.Vector3(1, 1, 1));
      barMatrices.push(m4.clone());
    }
    if (stripMatrices.length > 0) {
      const stripInst = new THREE.InstancedMesh(stripGeo, ledStripMat, stripMatrices.length);
      stripMatrices.forEach((mm, idx) => stripInst.setMatrixAt(idx, mm));
      stripInst.count = stripMatrices.length;
      stripInst.frustumCulled = false;
      group.add(stripInst);
    }
    if (barMatrices.length > 0) {
      const barInst = new THREE.InstancedMesh(barGeo, overheadBarMat, barMatrices.length);
      barMatrices.forEach((mm, idx) => barInst.setMatrixAt(idx, mm));
      barInst.count = barMatrices.length;
      barInst.frustumCulled = false;
      group.add(barInst);
    }

    // Glowing tunnel chevron reflectors along both walls
    const chevronTex = makeCanvasTex(256, 128, (ctx) => {
      ctx.fillStyle = '#0d1118';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#ffb81c';
      for (const ox of [32, 136]) {
        ctx.beginPath();
        ctx.moveTo(ox, 16);
        ctx.lineTo(ox + 48, 16);
        ctx.lineTo(ox + 92, 64);
        ctx.lineTo(ox + 48, 112);
        ctx.lineTo(ox, 112);
        ctx.lineTo(ox + 44, 64);
        ctx.closePath();
        ctx.fill();
      }
    });
    const chevronMat = new THREE.MeshBasicMaterial({ map: chevronTex, side: THREE.DoubleSide });
    const chevronGeo = new THREE.PlaneGeometry(1.05, 0.56);
    const chevronMatrices: THREE.Matrix4[] = [];
    for (let i = tunnelDenseFrom + 1; i < tunnelDenseTo; i += 2) {
      const tp = at(i, 0, 1);
      const baseRy = Math.atan2(tp.tx, tp.tz);
      for (const side of [-1, 1]) {
        const wallOff = ROAD_HALF + 0.95;
        const wx = tp.x - tp.tz * wallOff * side;
        const wz = tp.z + tp.tx * wallOff * side;
        const wy = ground(wx, wz) + 1.45;
        // Face inward toward the track centreline
        q.setFromAxisAngle(yAxis, baseRy + (side > 0 ? -Math.PI / 2 : Math.PI / 2));
        m4.compose(new THREE.Vector3(wx, wy, wz), q, new THREE.Vector3(1, 1, 1));
        chevronMatrices.push(m4.clone());
      }
    }
    if (chevronMatrices.length > 0) {
      const chevronInst = new THREE.InstancedMesh(chevronGeo, chevronMat, chevronMatrices.length);
      chevronMatrices.forEach((mm, idx) => chevronInst.setMatrixAt(idx, mm));
      chevronInst.count = chevronMatrices.length;
      chevronInst.frustumCulled = false;
      group.add(chevronInst);
    }
  }

  // 6. Distance boards (200m, 150m, 100m, 50m) before corners
  const boardDistances = [200, 150, 100, 50];
  const boardMats = new Map<number, THREE.MeshStandardMaterial>();
  for (const d of boardDistances) {
    const tex = makeCanvasTex(256, 160, (ctx) => {
      ctx.fillStyle = '#f4f6f8';
      ctx.fillRect(0, 0, 256, 160);
      ctx.strokeStyle = '#141820';
      ctx.lineWidth = 10;
      ctx.strokeRect(6, 6, 244, 148);
      ctx.fillStyle = '#141820';
      ctx.font = '900 92px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d), 128, 84);
    });
    boardMats.set(d, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  }

  const postBoardMat = darkSteelMat;
  const boardGeo = new THREE.BoxGeometry(1.6, 1.0, 0.08);
  const boardPostGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6);

  for (const cn of corners) {
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (P[i].x - cn.x) ** 2 + (P[i].z - cn.z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    const outside = cn.turn > 0 ? -1 : 1;
    for (const distM of boardDistances) {
      const sampleBack = Math.round(distM / 6);
      const si = ((bi - sampleBack) % n + n) % n;
      if (inTunnel(si) || (outside === -1 && inPit(si))) continue;

      const bp = at(si, ROAD_HALF + 2.4, outside);
      const boardGroup = new THREE.Group();
      boardGroup.position.set(bp.x, bp.y, bp.z);
      boardGroup.rotation.y = Math.atan2(bp.tx, bp.tz);

      const post = new THREE.Mesh(boardPostGeo, postBoardMat);
      post.position.y = 1.1;
      boardGroup.add(post);

      const face = new THREE.Mesh(boardGeo, boardMats.get(distM)!);
      face.position.y = 2.05;
      face.castShadow = true;
      boardGroup.add(face);

      group.add(boardGroup);
    }
  }

  // 7. Coastal spectator grandstands (TrackArchitecture detailedStand)
  const standSpots: [number, number, number, number][] = [
    [gantryAt + 5, 1, 48, 7],
    [Math.floor(n * 0.25), -1, 34, 5],
    [Math.floor(n * 0.52), 1, 38, 6],
    [Math.floor(n * 0.78), -1, 32, 5],
  ];

  for (const [sampleIdx, side, len, rows] of standSpots) {
    const wrapped = ((sampleIdx % n) + n) % n;
    if (inTunnel(wrapped) || (side < 0 && inPit(wrapped))) continue;
    const sp = at(wrapped, ROAD_HALF + 9.0, side);
    const stand = detailedStand(len, rows);
    stand.position.set(sp.x, sp.y, sp.z);
    stand.rotation.y = Math.atan2(-sp.tz, sp.tx) + (side < 0 ? Math.PI : 0);
    group.add(stand);
  }

  // 8. FIA catch fencing along cliff drops and circuit perimeter
  {
    const FENCE_OFF = ROAD_HALF + 3.6;
    const runs: FencePoint[][] = [];
    for (const side of [-1, 1]) {
      let run: FencePoint[] = [];
      const flush = (): void => {
        if (run.length > 1) runs.push(side < 0 ? run.reverse() : run);
        run = [];
      };
      for (let i = 0; i <= n; i++) {
        const sample = i % n;
        if (inTunnel(sample) || (side < 0 && inPit(sample))) {
          flush();
          continue;
        }
        const here = at(sample, FENCE_OFF, side);
        const nxt = at(sample + 1, FENCE_OFF, side);
        const [tx, tz] = tan(sample);
        const el = Math.hypot(nxt.x - here.x, nxt.z - here.z) || 1;
        // Stop the run if the offset path folds back on itself on a tight inside corner
        if (((nxt.x - here.x) * tx + (nxt.z - here.z) * tz) / el < 0.3) {
          flush();
          continue;
        }
        const last = run[run.length - 1];
        if (last) {
          const steps = Math.ceil(Math.hypot(here.x - last.x, here.z - last.z) / 3);
          for (let k = 1; k < steps; k++) {
            const x = last.x + ((here.x - last.x) * k) / steps;
            const z = last.z + ((here.z - last.z) * k) / steps;
            run.push({ x, y: ground(x, z), z });
          }
        }
        run.push({ x: here.x, y: here.y, z: here.z });
      }
      flush();
    }
    if (runs.length > 0) {
      group.add(catchFence(runs));
    }
  }

  // 9. Marshal posts with flags at corners
  if (corners.length > 0) {
    const marshalPole = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.04, 0.05, 4.2, 6),
      steelMat,
      corners.length,
    );
    const marshalBooth = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.6, 2.1, 1.6),
      concreteMat,
      corners.length,
    );
    const marshalFlag = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.5, 1.0),
      new THREE.MeshStandardMaterial({ roughness: 0.78, side: THREE.DoubleSide }),
      corners.length,
    );
    const flagColors = [0xf2c230, 0x2aa05a, 0x1d6fd1];
    let mc = 0;
    corners.forEach((cn, ci) => {
      let bi = 0;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (P[i].x - cn.x) ** 2 + (P[i].z - cn.z) ** 2;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      const si = (bi + 5) % n;
      const side = cn.turn > 0 ? -1 : 1;
      if (inTunnel(si) || (side < 0 && inPit(si))) return;
      const p = at(si, ROAD_HALF + 5.8, side);
      m4.makeTranslation(p.x, p.y + 2.1, p.z);
      marshalPole.setMatrixAt(mc, m4);
      m4.makeTranslation(p.x + p.tx * 1.6, p.y + 1.05, p.z + p.tz * 1.6);
      marshalBooth.setMatrixAt(mc, m4);
      m4.makeRotationY(Math.atan2(-p.tz, p.tx));
      m4.setPosition(p.x + p.tx * 0.75, p.y + 3.6, p.z + p.tz * 0.75);
      marshalFlag.setMatrixAt(mc, m4);
      marshalFlag.setColorAt(mc, col.setHex(flagColors[ci % 3]));
      mc++;
    });
    if (mc > 0) {
      for (const m of [marshalPole, marshalBooth, marshalFlag]) {
        m.count = mc;
        m.frustumCulled = false;
        m.castShadow = true;
        group.add(m);
      }
    }
  }

  // 10. Stadium light towers
  {
    const towerSpots: { x: number; y: number; z: number; ry: number }[] = [];
    for (let i = 8; i < n; i += 24) {
      if (inTunnel(i)) continue;
      const side = i % 48 < 24 ? 1 : -1;
      if (side < 0 && inPit(i)) continue;
      const p = at(i, ROAD_HALF + 11.5, side);
      if (p.y > 0.1) {
        towerSpots.push({ x: p.x, y: p.y, z: p.z, ry: Math.atan2(-p.tz, p.tx) });
      }
    }
    if (towerSpots.length > 0) {
      const poleInst = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.2, 0.34, 24, 8),
        darkSteelMat,
        towerSpots.length,
      );
      const headInst = new THREE.InstancedMesh(
        new THREE.BoxGeometry(3.6, 1.5, 0.4),
        darkSteelMat,
        towerSpots.length,
      );
      const lampInst = new THREE.InstancedMesh(
        new THREE.BoxGeometry(3.3, 1.2, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xfff1cf }),
        towerSpots.length,
      );
      const euler = new THREE.Euler();
      towerSpots.forEach((s, i) => {
        m4.makeTranslation(s.x, s.y + 12, s.z);
        poleInst.setMatrixAt(i, m4);
        euler.set(0.35, s.ry + Math.PI / 2, 0, 'YXZ');
        q.setFromEuler(euler);
        m4.compose(new THREE.Vector3(s.x, s.y + 24.4, s.z), q, new THREE.Vector3(1, 1, 1));
        headInst.setMatrixAt(i, m4);
        const off = new THREE.Vector3(0, 0, 0.26).applyQuaternion(q);
        m4.compose(
          new THREE.Vector3(s.x + off.x, s.y + 24.4 + off.y, s.z + off.z),
          q,
          new THREE.Vector3(1, 1, 1),
        );
        lampInst.setMatrixAt(i, m4);
      });
      for (const m of [poleInst, headInst, lampInst]) {
        m.count = towerSpots.length;
        m.frustumCulled = false;
        m.castShadow = true;
        group.add(m);
      }
    }
  }

  // 11. Coastal pit-lane / paddock garages near start/finish
  if (pitIndices.length > 0) {
    const pitGroup = new THREE.Group();
    pitGroup.name = 'coastalPitPaddock';
    pitIndices.forEach((idx, gi) => {
      const p = at(idx, ROAD_HALF + 10.5, -1);
      const garage = pitGarage(gi);
      garage.position.set(p.x, p.y, p.z);
      garage.rotation.y = Math.atan2(-p.tz, p.tx) + Math.PI;
      pitGroup.add(garage);
    });
    group.add(pitGroup);
  }

  // The tunnel's own walls and arched roof: the terrain over it is the mountain, drawn from above only, so without a shell you look straight up through the rock at the
  // forest. A concrete tube round the road from portal to portal, with the road's own height, lit by the strips already placed inside.
  if (tunnelDenseFrom >= 0 && tunnelDenseTo > tunnelDenseFrom) {
    const R = ROAD_HALF + 1.9, WALL = 3.0, ARCH = 3.4, ARC_N = 12;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const section: [number, number][] = [[-R, 0], [-R, WALL]];
    for (let k = 1; k < ARC_N; k++) { const th = Math.PI - (k / ARC_N) * Math.PI; section.push([R * Math.cos(th), WALL + ARCH * Math.sin(th)]); }
    section.push([R, WALL], [R, 0]);
    let dist = 0;
    for (let i = tunnelDenseFrom; i <= tunnelDenseTo; i++) {
      const [tx, tz] = tan(i), nx = -tz, nz = tx, p = P[i];
      if (i > tunnelDenseFrom) dist += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z);
      let around = 0;
      section.forEach(([sx, sy], k) => {
        if (k > 0) around += Math.hypot(sx - section[k - 1][0], sy - section[k - 1][1]);
        pos.push(p.x + nx * sx, p.y + sy, p.z + nz * sx);
        uv.push(around / 5, dist / 5);
      });
    }
    const m = section.length, rows = tunnelDenseTo - tunnelDenseFrom + 1;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < m - 1; c++) { const a0 = r * m + c, b0 = a0 + m; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const shellMat = portalConcreteMat.clone();
    shellMat.side = THREE.DoubleSide;
    const shellMesh = new THREE.Mesh(g, shellMat);
    shellMesh.name = 'cliffRacewayTunnelShell';
    shellMesh.receiveShadow = true;
    group.add(shellMesh);
  }
  // the tunnel corridor runs 40 m past each portal: the hillside is cut back to a rock face at the opening and the car must keep to the road surface through it
  const tunnelPath = tunnelDenseFrom >= 0 ? P.slice(Math.max(0, tunnelDenseFrom - 7), Math.min(n, tunnelDenseTo + 8)).map((p) => ({ x: p.x, z: p.z })) : [];
  return { group, setLights, road: asphaltMesh, path: P.map((p) => ({ x: p.x, z: p.z })), tunnelPath };
}
