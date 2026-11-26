import * as THREE from 'three';

export interface CircuitDef {
  xz: number[][];
  y?: number[];
  name: string;
  kind: string;
  tunnel?: { from: number; to: number };
  corners?: { n?: number; name: string; turn: number; x: number; z: number }[];
}

export interface PinewoodRallyOptions {
  circuit: CircuitDef;
  ground: (x: number, z: number) => number;
  exag: number;
}

export interface PinewoodRallyResult {
  group: THREE.Group;
  road?: THREE.Mesh;
  setLights?: (state: 'red' | 'green' | 'off') => void;
}

interface PathSample {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  dist: number;
  curv: number; // signed turn angle (rad) over local window; + = right/left consistent with CircuitDef.corners
}

const ROAD_HALF = 4.0;          // 8.0 m drivable gravel stage
const SHOULDER_W = 1.4;         // banked dirt/gravel shoulder on each side
const ROAD_LIFT = 0.06;         // conformed to ground(x, z) + 0.06
const SHOULDER_DROP = -0.18;    // tucked into terrain so banked edges never float
const TEX_BASE = '/games/apex/tex/';

function makeRng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function canvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  repeat?: [number, number],
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const texLoader = new THREE.TextureLoader();

function loadRepeatTex(url: string, srgb: boolean, repX = 1, repY = 1): THREE.Texture {
  const t = texLoader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = 8;
  return t;
}

// Cached weathered PBR materials shared across rally trackside props
let steelPanelMatCache: THREE.MeshStandardMaterial | null = null;
let weatheredConcreteMatCache: THREE.MeshStandardMaterial | null = null;
let timberSidingMatCache: THREE.MeshStandardMaterial | null = null;
let gravelPadMatCache: THREE.MeshStandardMaterial | null = null;

function getSteelPanelMat(): THREE.MeshStandardMaterial {
  if (!steelPanelMatCache) {
    steelPanelMatCache = new THREE.MeshStandardMaterial({
      color: 0xc8cfd6,
      map: loadRepeatTex(`${TEX_BASE}tex-shared-14-steel-panel_base.png`, true, 2, 2),
      normalMap: loadRepeatTex(`${TEX_BASE}tex-shared-14-steel-panel_normal.png`, false, 2, 2),
      roughnessMap: loadRepeatTex(`${TEX_BASE}tex-shared-14-steel-panel_roughness.png`, false, 2, 2),
      roughness: 0.48,
      metalness: 0.82,
    });
  }
  return steelPanelMatCache;
}

function getWeatheredConcreteMat(): THREE.MeshStandardMaterial {
  if (!weatheredConcreteMatCache) {
    weatheredConcreteMatCache = new THREE.MeshStandardMaterial({
      color: 0xd6d3cc,
      map: loadRepeatTex(`${TEX_BASE}tex-shared-16-concrete-weathered_base.png`, true, 2, 2),
      normalMap: loadRepeatTex(`${TEX_BASE}tex-shared-16-concrete-weathered_normal.png`, false, 2, 2),
      roughnessMap: loadRepeatTex(`${TEX_BASE}tex-shared-16-concrete-weathered_roughness.png`, false, 2, 2),
      roughness: 0.88,
      metalness: 0.04,
    });
  }
  return weatheredConcreteMatCache;
}

function getTimberSidingMat(): THREE.MeshStandardMaterial {
  if (!timberSidingMatCache) {
    timberSidingMatCache = new THREE.MeshStandardMaterial({
      color: 0xb89674,
      map: loadRepeatTex(`${TEX_BASE}tex-shared-18-timber-siding_base.png`, true, 2, 2),
      roughness: 0.88,
      metalness: 0.04,
    });
  }
  return timberSidingMatCache;
}

function getGravelMat(): THREE.MeshStandardMaterial {
  if (!gravelPadMatCache) {
    gravelPadMatCache = new THREE.MeshStandardMaterial({
      map: loadRepeatTex(`${TEX_BASE}ground_gravel_rally.png`, true, 1, 1),
      normalMap: loadRepeatTex(`${TEX_BASE}ground_gravel_rally_normal.png`, false, 1, 1),
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: loadRepeatTex(`${TEX_BASE}ground_gravel_rally_roughness.png`, false, 1, 1),
      roughness: 0.94,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
  }
  return gravelPadMatCache;
}

function densifyPath(
  circuit: CircuitDef,
  ground: (x: number, z: number) => number,
  step = 4.5,
): { samples: PathSample[]; isLoop: boolean } {
  const xz = circuit.xz;
  const n = xz.length;
  if (n < 2) return { samples: [], isLoop: false };

  const isLoop = Math.hypot(xz[0][0] - xz[n - 1][0], xz[0][1] - xz[n - 1][1]) < 45;
  const raw: { x: number; z: number }[] = [];
  const segCount = isLoop ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const a = xz[i];
    const b = xz[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      raw.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t });
    }
  }
  if (!isLoop) {
    raw.push({ x: xz[n - 1][0], z: xz[n - 1][1] });
  }

  const m = raw.length;
  const samples: PathSample[] = [];
  let dist = 0;

  for (let i = 0; i < m; i++) {
    const prev = isLoop ? raw[(i - 1 + m) % m] : raw[Math.max(0, i - 1)];
    const next = isLoop ? raw[(i + 1) % m] : raw[Math.min(m - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    const p = raw[i];
    if (i > 0) {
      dist += Math.hypot(p.x - raw[i - 1].x, p.z - raw[i - 1].z);
    }
    samples.push({
      x: p.x,
      y: ground(p.x, p.z),
      z: p.z,
      tx,
      tz,
      dist,
      curv: 0,
    });
  }

  // Compute signed curvature over a +-3 sample window (~27 m)
  for (let i = 0; i < m; i++) {
    const i0 = isLoop ? (i - 3 + m) % m : Math.max(0, i - 3);
    const i1 = isLoop ? (i + 3) % m : Math.min(m - 1, i + 3);
    const a = samples[i0];
    const b = samples[i1];
    const cross = a.tx * b.tz - a.tz * b.tx;
    const dot = a.tx * b.tx + a.tz * b.tz;
    samples[i].curv = Math.atan2(cross, dot);
  }

  return { samples, isLoop };
}

/** Offset point from sample `s`: `side` = +1 is right of travel, -1 is left of travel. */
function offsetAt(
  s: PathSample,
  off: number,
  side: number,
  ground: (x: number, z: number) => number,
  along = 0,
): { x: number; y: number; z: number } {
  const x = s.x - s.tz * off * side + s.tx * along;
  const z = s.z + s.tx * off * side + s.tz * along;
  return { x, y: ground(x, z), z };
}

function buildGravelRibbon(
  samples: PathSample[],
  isLoop: boolean,
  ground: (x: number, z: number) => number,
): THREE.Mesh {
  const m = samples.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const tileLength = 7.5;
  const ringCount = isLoop ? m + 1 : m;

  for (let r = 0; r < ringCount; r++) {
    const s = samples[r % m];
    const d = r === m ? s.dist + Math.hypot(samples[0].x - samples[m - 1].x, samples[0].z - samples[m - 1].z) : s.dist;
    const v = d / tileLength;

    const lxOut = s.x + s.tz * (ROAD_HALF + SHOULDER_W);
    const lzOut = s.z - s.tx * (ROAD_HALF + SHOULDER_W);
    const lyOut = ground(lxOut, lzOut) + SHOULDER_DROP;

    const lxIn = s.x + s.tz * ROAD_HALF;
    const lzIn = s.z - s.tx * ROAD_HALF;
    const lyIn = ground(lxIn, lzIn) + ROAD_LIFT;

    const rxIn = s.x - s.tz * ROAD_HALF;
    const rzIn = s.z + s.tx * ROAD_HALF;
    const ryIn = ground(rxIn, rzIn) + ROAD_LIFT;

    const rxOut = s.x - s.tz * (ROAD_HALF + SHOULDER_W);
    const rzOut = s.z + s.tx * (ROAD_HALF + SHOULDER_W);
    const ryOut = ground(rxOut, rzOut) + SHOULDER_DROP;

    pos.push(
      lxOut, lyOut, lzOut,
      lxIn, lyIn, lzIn,
      rxIn, ryIn, rzIn,
      rxOut, ryOut, rzOut,
    );

    uv.push(
      -0.18, v,
      0.0, v,
      1.0, v,
      1.18, v,
    );
  }

  for (let r = 0; r < ringCount - 1; r++) {
    const a = r * 4;
    const b = (r + 1) * 4;
    for (let k = 0; k < 3; k++) {
      const a0 = a + k;
      const a1 = a + k + 1;
      const b0 = b + k;
      const b1 = b + k + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, getGravelMat());
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function buildTimingArch(
  sample: PathSample,
  ground: (x: number, z: number) => number,
  label: string,
  withLights: boolean,
): { archGroup: THREE.Group; lamps: THREE.Mesh[]; lampMats: THREE.MeshBasicMaterial[] } {
  const archGroup = new THREE.Group();
  const spanHalf = ROAD_HALF + 1.8;
  const height = 6.2;

  const steelMat = getSteelPanelMat();
  const concreteMat = getWeatheredConcreteMat();
  const timberMat = getTimberSidingMat();

  // Twin steel/concrete A-frame legs with weathered concrete footings
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, height, 0.45), steelMat);
    leg.position.set(side * spanHalf, height / 2, 0);
    leg.castShadow = true;
    archGroup.add(leg);

    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.22), timberMat);
    brace.position.set(side * (spanHalf + 0.42), 0.9, 0);
    brace.rotation.z = side * 0.28;
    brace.castShadow = true;
    archGroup.add(brace);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 1.15), concreteMat);
    base.position.set(side * spanHalf, 0.275, 0);
    base.receiveShadow = true;
    archGroup.add(base);
  }

  // Overhead truss beam
  const beam = new THREE.Mesh(new THREE.BoxGeometry(spanHalf * 2 + 1.4, 0.92, 0.72), steelMat);
  beam.position.set(0, height + 0.3, 0);
  beam.castShadow = true;
  archGroup.add(beam);

  // Rally banner
  const bannerTex = canvasTex(1024, 192, (ctx) => {
    ctx.fillStyle = '#15181e';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = '#ff6a00';
    ctx.fillRect(0, 0, 1024, 24);
    ctx.fillRect(0, 168, 1024, 24);
    for (let x = 24; x < 140; x += 24) {
      for (let y = 36; y < 156; y += 24) {
        ctx.fillStyle = ((x + y) / 24) % 2 === 0 ? '#f4f4f4' : '#222';
        ctx.fillRect(x, y, 22, 22);
        ctx.fillRect(1024 - x - 22, y, 22, 22);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 56px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 512, 98);
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    roughness: 0.52,
    emissive: new THREE.Color(0x2a1400),
    emissiveIntensity: 0.45,
  });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(spanHalf * 2 - 0.6, 1.35, 0.78), bannerMat);
  banner.position.set(0, height + 0.3, 0);
  archGroup.add(banner);

  // Photoelectric timing beams at road edges
  const sensorMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.4, metalness: 0.25 });
  for (const side of [-1, 1]) {
    const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 8), sensorMat);
    sensor.position.set(side * (ROAD_HALF + 0.4), 0.55, 0);
    archGroup.add(sensor);
  }

  // Start line chalk/timing strip on gravel
  const stripTex = canvasTex(256, 64, (ctx) => {
    ctx.fillStyle = '#e8e2d5';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ff6a00';
    for (let x = 0; x < 256; x += 32) {
      ctx.fillRect(x, 0, 16, 64);
    }
  });
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, 0.75),
    new THREE.MeshStandardMaterial({
      map: stripTex,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.09, 0);
  archGroup.add(strip);

  // Start countdown lights pod
  const lamps: THREE.Mesh[] = [];
  const lampMats = [
    new THREE.MeshBasicMaterial({ color: 0x260c0c }), // off
    new THREE.MeshBasicMaterial({ color: 0xff2818 }), // red
    new THREE.MeshBasicMaterial({ color: 0x24f55a }), // green
  ];

  if (withLights) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.78, 0.85), steelMat);
    pod.position.set(0, height - 0.65, 0);
    archGroup.add(pod);

    const lampGeo = new THREE.CircleGeometry(0.24, 16);
    for (let k = 0; k < 5; k++) {
      const lx = (k - 2) * 0.78;
      const fLamp = new THREE.Mesh(lampGeo, lampMats[0]);
      fLamp.position.set(lx, height - 0.65, 0.44);
      archGroup.add(fLamp);
      lamps.push(fLamp);

      const bLamp = new THREE.Mesh(lampGeo, lampMats[0]);
      bLamp.rotation.y = Math.PI;
      bLamp.position.set(lx, height - 0.65, -0.44);
      archGroup.add(bLamp);
      lamps.push(bLamp);
    }
  }

  const y = ground(sample.x, sample.z);
  archGroup.position.set(sample.x, y, sample.z);
  archGroup.rotation.y = Math.atan2(sample.tx, sample.tz);

  return { archGroup, lamps, lampMats };
}

interface CornerTarget {
  idx: number;
  turn: number; // >0 or <0 indicating turn direction
}

function collectCorners(circuit: CircuitDef, samples: PathSample[]): CornerTarget[] {
  const m = samples.length;
  const targets: CornerTarget[] = [];

  if (circuit.corners && circuit.corners.length > 0) {
    for (const cn of circuit.corners) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < m; i++) {
        const d = (samples[i].x - cn.x) ** 2 + (samples[i].z - cn.z) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      targets.push({ idx: bestIdx, turn: cn.turn });
    }
    return targets;
  }

  // Fallback: detect local curvature peaks from path geometry
  let i = 4;
  while (i < m - 4) {
    const c = Math.abs(samples[i].curv);
    if (c > 0.35) {
      let peakIdx = i;
      let peakVal = c;
      let j = i + 1;
      while (j < m - 2 && Math.abs(samples[j].curv) > 0.25) {
        if (Math.abs(samples[j].curv) > peakVal) {
          peakVal = Math.abs(samples[j].curv);
          peakIdx = j;
        }
        j++;
      }
      targets.push({ idx: peakIdx, turn: samples[peakIdx].curv });
      i = j + 6;
    } else {
      i++;
    }
  }

  return targets;
}

function buildChevronSigns(
  samples: PathSample[],
  corners: CornerTarget[],
  isLoop: boolean,
  ground: (x: number, z: number) => number,
): THREE.Group {
  const g = new THREE.Group();
  const m = samples.length;
  if (corners.length === 0) return g;

  const makeChevronTex = (pointRight: boolean): THREE.CanvasTexture =>
    canvasTex(256, 128, (ctx) => {
      ctx.fillStyle = '#f2c21a';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 248, 120);
      ctx.fillStyle = '#111111';
      for (let x = 26; x < 210; x += 68) {
        ctx.beginPath();
        if (pointRight) {
          ctx.moveTo(x, 20);
          ctx.lineTo(x + 34, 20);
          ctx.lineTo(x + 62, 64);
          ctx.lineTo(x + 34, 108);
          ctx.lineTo(x, 108);
          ctx.lineTo(x + 28, 64);
        } else {
          ctx.moveTo(x + 62, 20);
          ctx.lineTo(x + 28, 20);
          ctx.lineTo(x, 64);
          ctx.lineTo(x + 28, 108);
          ctx.lineTo(x + 62, 108);
          ctx.lineTo(x + 34, 64);
        }
        ctx.closePath();
        ctx.fill();
      }
    });

  const matRight = new THREE.MeshStandardMaterial({ map: makeChevronTex(true), roughness: 0.6 });
  const matLeft = new THREE.MeshStandardMaterial({ map: makeChevronTex(false), roughness: 0.6 });
  const backMat = getSteelPanelMat();
  const postMat = getTimberSidingMat();

  const boardGeo = new THREE.BoxGeometry(1.8, 0.9, 0.08);
  const postGeo = new THREE.CylinderGeometry(0.055, 0.065, 1.9, 6);

  const rightMats: THREE.Matrix4[] = [];
  const leftMats: THREE.Matrix4[] = [];
  const postMats: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  for (const cn of corners) {
    const outside = cn.turn > 0 ? -1 : 1;
    const isRightTurn = cn.turn > 0;
    for (const k of [-3, 0, 3]) {
      const idx = isLoop ? (cn.idx + k + m) % m : Math.max(0, Math.min(m - 1, cn.idx + k));
      const s = samples[idx];
      const p = offsetAt(s, ROAD_HALF + 2.1, outside, ground);
      const ry = Math.atan2(-s.tx, -s.tz);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      m4.compose(new THREE.Vector3(p.x, p.y + 1.45, p.z), q, new THREE.Vector3(1, 1, 1));
      if (isRightTurn) {
        rightMats.push(m4.clone());
      } else {
        leftMats.push(m4.clone());
      }
      for (const px of [-0.6, 0.6]) {
        const ox = Math.cos(ry) * px;
        const oz = -Math.sin(ry) * px;
        m4.makeTranslation(p.x + ox, p.y + 0.95, p.z + oz);
        postMats.push(m4.clone());
      }
    }
  }

  if (rightMats.length > 0) {
    const im = new THREE.InstancedMesh(
      boardGeo,
      [backMat, backMat, backMat, backMat, matRight, backMat] as unknown as THREE.Material,
      rightMats.length,
    );
    rightMats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }
  if (leftMats.length > 0) {
    const im = new THREE.InstancedMesh(
      boardGeo,
      [backMat, backMat, backMat, backMat, matLeft, backMat] as unknown as THREE.Material,
      leftMats.length,
    );
    leftMats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }
  if (postMats.length > 0) {
    const im = new THREE.InstancedMesh(postGeo, postMat, postMats.length);
    postMats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  return g;
}

function buildHairpinTireStacks(
  samples: PathSample[],
  corners: CornerTarget[],
  isLoop: boolean,
  ground: (x: number, z: number) => number,
): THREE.Group | null {
  const m = samples.length;
  const hairpins = corners.filter((cn) => Math.abs(samples[cn.idx]?.curv ?? 0) > 0.45 || Math.abs(cn.turn) > 0.65);
  const active = hairpins.length > 0 ? hairpins : corners.slice(0, Math.ceil(corners.length * 0.75));
  if (active.length === 0) return null;

  // Revolved real-tire profile (0.68 m across, 0.24 m tall)
  const profile: THREE.Vector2[] = [
    [0.20, -0.105], [0.24, -0.12], [0.295, -0.112], [0.33, -0.08],
    [0.342, -0.042], [0.344, 0.042], [0.33, 0.08], [0.295, 0.112],
    [0.24, 0.12], [0.20, 0.105], [0.192, 0.0], [0.20, -0.105],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 12);

  const makeTireTex = (paint: string | null): THREE.CanvasTexture =>
    canvasTex(
      256,
      128,
      (ctx) => {
        const r = makeRng(paint === '#e05a10' ? 11 : paint === '#e6e4dc' ? 17 : 5);
        ctx.fillStyle = '#15161a';
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = '#0a0a0c';
        for (let x = 0; x < 256; x += 12) {
          ctx.fillRect(x, 44, 3, 40);
          ctx.fillRect(x + 6, (x / 12) % 2 ? 44 : 66, 2, 18);
        }
        ctx.fillRect(0, 62, 256, 3);
        if (paint) {
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = paint;
          ctx.fillRect(0, 0, 256, 128);
          ctx.globalAlpha = 1;
          for (let i = 0; i < 220; i++) {
            ctx.fillStyle = `rgba(22,22,26,${0.35 + r() * 0.55})`;
            ctx.beginPath();
            ctx.ellipse(r() * 256, r() * 128, 1 + r() * 10, 1 + r() * 4, r() * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Gravel dust scuffs
        for (let i = 0; i < 120; i++) {
          ctx.fillStyle = `rgba(145,126,102,${0.05 + r() * 0.12})`;
          ctx.fillRect(r() * 256, r() * 128, 3 + r() * 18, 1 + r() * 4);
        }
      },
      [2, 1],
    );

  const mkTireMat = (paint: string | null): THREE.MeshStandardMaterial => {
    const tex = makeTireTex(paint);
    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: paint ? 0.9 : 1.5,
      roughness: paint ? 0.8 : 0.94,
      metalness: 0.0,
      color: paint ? 0xffffff : 0xb8b8bc,
    });
  };

  // 0 = black rubber, 1 = rally white, 2 = rally orange
  const mats = [mkTireMat(null), mkTireMat('#e6e4dc'), mkTireMat('#e05a10')];
  const slots: THREE.Matrix4[][] = [[], [], []];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const rng = makeRng(42);
  const TYRE_H = 0.22;
  const SPACING = 0.66;

  for (const cn of active) {
    const outside = cn.turn > 0 ? -1 : 1;
    const K = 5;
    for (let k = -K; k <= K; k++) {
      const idx = isLoop ? (cn.idx + k + m) % m : Math.max(0, Math.min(m - 1, cn.idx + k));
      if (idx < 3) continue; // keep start/finish area clear
      const s = samples[idx];
      const layers = Math.abs(k) <= 3 ? 4 : Math.abs(k) === 4 ? 3 : 2;
      for (let row = 0; row < 2; row++) {
        const stagger = (row % 2) * 0.5;
        for (let a = -3; a <= 3; a++) {
          const p = offsetAt(s, ROAD_HALF + 1.85 + row * 0.62, outside, ground, (a + stagger) * SPACING);
          const along = Math.atan2(s.tx, s.tz);
          for (let layer = 0; layer < layers; layer++) {
            const lift = layer * (TYRE_H * 0.93);
            const lx = (layer % 2) * 0.22;
            const px = p.x + s.tx * lx + (rng() - 0.5) * 0.04;
            const pz = p.z + s.tz * lx + (rng() - 0.5) * 0.04;
            e.set((rng() - 0.5) * 0.06, along + rng() * Math.PI * 2, (rng() - 0.5) * 0.06);
            q.setFromEuler(e);
            m4.compose(
              new THREE.Vector3(px, p.y + 0.11 + lift, pz),
              q,
              new THREE.Vector3(1 + (rng() - 0.5) * 0.04, 0.94, 1 + (rng() - 0.5) * 0.04),
            );
            const painted = row === 0 && layer < 3 && ((Math.floor((k * 10 + a + 50) / 3) + layer) & 1) === 0;
            const which = !painted ? 0 : (Math.floor((k * 10 + a + 50) / 6) & 1) ? 2 : 1;
            slots[which].push(m4.clone());
          }
        }
      }
    }
  }

  const g = new THREE.Group();
  let total = 0;
  slots.forEach((list, vi) => {
    if (!list.length) return;
    total += list.length;
    const im = new THREE.InstancedMesh(geo, mats[vi], list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  });

  return total > 0 ? g : null;
}

function buildSteepDropGuardrails(
  samples: PathSample[],
  isLoop: boolean,
  ground: (x: number, z: number) => number,
  exag: number,
): THREE.Group {
  const g = new THREE.Group();
  const m = samples.length;
  const dropThreshold = 1.6 * Math.max(0.75, Math.min(2.0, exag));

  const postMatrices: THREE.Matrix4[] = [];
  const railMatrices: THREE.Matrix4[] = [];
  const reflectorMatrices: THREE.Matrix4[] = [];

  // Timber log retaining wall instances on steep embankments (both drop-offs and steep cut-banks)
  const logMatrices: THREE.Matrix4[] = [];
  const pilingMatrices: THREE.Matrix4[] = [];
  const footingMatrices: THREE.Matrix4[] = [];

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (const side of [-1, 1]) {
    let prevDropPos: THREE.Vector3 | null = null;
    let prevEmbankPos: THREE.Vector3 | null = null;

    for (let i = 0; i < m; i++) {
      const s = samples[i];
      const edge = offsetAt(s, ROAD_HALF + 1.35, side, ground);
      const outerMid = offsetAt(s, ROAD_HALF + 6.5, side, ground);
      const outerFar = offsetAt(s, ROAD_HALF + 11.5, side, ground);
      const drop = Math.max(edge.y - outerMid.y, edge.y - outerFar.y);
      const rise = Math.max(outerMid.y - edge.y, outerFar.y - edge.y);

      if (drop >= dropThreshold) {
        const curPos = new THREE.Vector3(edge.x, edge.y, edge.z);
        m4.makeTranslation(edge.x, edge.y + 0.45, edge.z);
        postMatrices.push(m4.clone());

        if (i % 2 === 0) {
          m4.makeTranslation(edge.x, edge.y + 0.72, edge.z);
          reflectorMatrices.push(m4.clone());
        }

        if (prevDropPos) {
          const mid = prevDropPos.clone().add(curPos).multiplyScalar(0.5);
          const dir = curPos.clone().sub(prevDropPos);
          const segLen = dir.length();
          if (segLen > 0.2 && segLen < 16) {
            dir.normalize();
            q.setFromUnitVectors(zAxis, dir);
            m4.compose(
              new THREE.Vector3(mid.x, mid.y + 0.62, mid.z),
              q,
              new THREE.Vector3(1, 1, segLen + 0.15),
            );
            railMatrices.push(m4.clone());
          }
        }
        prevDropPos = curPos;
      } else {
        prevDropPos = null;
      }

      // Timber log retaining wall on steep embankments (drop-offs or steep cut-banks)
      if (drop >= dropThreshold || rise >= dropThreshold * 1.1) {
        const wallPt = offsetAt(s, ROAD_HALF + 1.95, side, ground);
        const curWallPos = new THREE.Vector3(wallPt.x, wallPt.y, wallPt.z);
        m4.makeTranslation(wallPt.x, wallPt.y + 0.55, wallPt.z);
        pilingMatrices.push(m4.clone());
        m4.makeTranslation(wallPt.x, wallPt.y + 0.14, wallPt.z);
        footingMatrices.push(m4.clone());

        if (prevEmbankPos) {
          const mid = prevEmbankPos.clone().add(curWallPos).multiplyScalar(0.5);
          const dir = curWallPos.clone().sub(prevEmbankPos);
          const segLen = dir.length();
          if (segLen > 0.2 && segLen < 16) {
            dir.normalize();
            q.setFromUnitVectors(zAxis, dir);
            for (const logY of [0.18, 0.48, 0.78]) {
              m4.compose(
                new THREE.Vector3(mid.x, mid.y + logY, mid.z),
                q,
                new THREE.Vector3(1, 1, segLen + 0.1),
              );
              logMatrices.push(m4.clone());
            }
          }
        }
        prevEmbankPos = curWallPos;
      } else {
        prevEmbankPos = null;
      }
    }

    if (isLoop && prevDropPos) {
      const s0 = samples[0];
      const edge0 = offsetAt(s0, ROAD_HALF + 1.35, side, ground);
      const outer0 = offsetAt(s0, ROAD_HALF + 6.5, side, ground);
      if (edge0.y - outer0.y >= dropThreshold) {
        const curPos = new THREE.Vector3(edge0.x, edge0.y, edge0.z);
        const dir = curPos.clone().sub(prevDropPos);
        const segLen = dir.length();
        if (segLen > 0.2 && segLen < 16) {
          const mid = prevDropPos.clone().add(curPos).multiplyScalar(0.5);
          dir.normalize();
          q.setFromUnitVectors(zAxis, dir);
          m4.compose(new THREE.Vector3(mid.x, mid.y + 0.62, mid.z), q, new THREE.Vector3(1, 1, segLen + 0.15));
          railMatrices.push(m4.clone());
        }
      }
    }
  }

  if (postMatrices.length > 0) {
    const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.05, 6);
    const im = new THREE.InstancedMesh(postGeo, getTimberSidingMat(), postMatrices.length);
    postMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  if (railMatrices.length > 0) {
    const railGeo = new THREE.BoxGeometry(0.12, 0.28, 1.0);
    const im = new THREE.InstancedMesh(railGeo, getSteelPanelMat(), railMatrices.length);
    railMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  if (reflectorMatrices.length > 0) {
    const refGeo = new THREE.BoxGeometry(0.14, 0.12, 0.14);
    const refMat = new THREE.MeshStandardMaterial({
      color: 0xff981a,
      emissive: 0x552200,
      roughness: 0.35,
    });
    const im = new THREE.InstancedMesh(refGeo, refMat, reflectorMatrices.length);
    reflectorMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    g.add(im);
  }

  if (logMatrices.length > 0) {
    const logGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.0, 8);
    logGeo.rotateX(Math.PI / 2);
    const im = new THREE.InstancedMesh(logGeo, getTimberSidingMat(), logMatrices.length);
    logMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }

  if (pilingMatrices.length > 0) {
    const pilingGeo = new THREE.CylinderGeometry(0.105, 0.115, 1.25, 6);
    const im = new THREE.InstancedMesh(pilingGeo, getTimberSidingMat(), pilingMatrices.length);
    pilingMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  if (footingMatrices.length > 0) {
    const footGeo = new THREE.BoxGeometry(0.42, 0.32, 0.42);
    const im = new THREE.InstancedMesh(footGeo, getWeatheredConcreteMat(), footingMatrices.length);
    footingMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.receiveShadow = true;
    g.add(im);
  }

  return g;
}

function buildSpectatorSafetyFencing(
  samples: PathSample[],
  corners: CornerTarget[],
  isLoop: boolean,
  ground: (x: number, z: number) => number,
): THREE.Group {
  const g = new THREE.Group();
  const m = samples.length;
  if (m < 8) return g;

  const FENCE_OFF = ROAD_HALF + 4.35;
  const zoneSides = new Set<string>();

  // 1. Start / Finish spectator corridor
  for (let i = 2; i < Math.min(m, 14); i++) {
    zoneSides.add(`${i}:1`);
    if (i > 7) zoneSides.add(`${i}:-1`);
  }

  // 2. Spectator zones on outside of corners (behind tire stacks)
  for (const cn of corners) {
    const outside = cn.turn > 0 ? -1 : 1;
    for (let k = -6; k <= 6; k++) {
      const idx = isLoop ? (cn.idx + k + m) % m : Math.max(2, Math.min(m - 2, cn.idx + k));
      zoneSides.add(`${idx}:${outside}`);
    }
  }

  // 3. Periodic scenic straightaway viewing pockets
  for (let base = 24; base < m - 12; base += 48) {
    const side = (base / 48) % 2 === 0 ? 1 : -1;
    for (let k = 0; k < 8 && base + k < m; k++) {
      zoneSides.add(`${base + k}:${side}`);
    }
  }

  const postMatrices: THREE.Matrix4[] = [];
  const railMatrices: THREE.Matrix4[] = [];
  const meshMatrices: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (const side of [-1, 1]) {
    let prevPos: THREE.Vector3 | null = null;
    for (let i = 0; i < m; i++) {
      if (!zoneSides.has(`${i}:${side}`)) {
        prevPos = null;
        continue;
      }
      const s = samples[i];
      const next = samples[(i + 1) % m];
      const here = offsetAt(s, FENCE_OFF, side, ground);
      const nxt = offsetAt(next, FENCE_OFF, side, ground);
      const el = Math.hypot(nxt.x - here.x, nxt.z - here.z) || 1;
      // Avoid inside-corner self-intersection tangles
      if (((nxt.x - here.x) * s.tx + (nxt.z - here.z) * s.tz) / el < 0.35) {
        prevPos = null;
        continue;
      }

      const curPos = new THREE.Vector3(here.x, here.y, here.z);
      m4.makeTranslation(here.x, here.y + 0.65, here.z);
      postMatrices.push(m4.clone());

      if (prevPos) {
        const mid = prevPos.clone().add(curPos).multiplyScalar(0.5);
        const dir = curPos.clone().sub(prevPos);
        const segLen = dir.length();
        if (segLen > 0.3 && segLen < 12) {
          dir.normalize();
          q.setFromUnitVectors(zAxis, dir);
          for (const railY of [0.28, 1.12]) {
            m4.compose(
              new THREE.Vector3(mid.x, mid.y + railY, mid.z),
              q,
              new THREE.Vector3(1, 1, segLen + 0.05),
            );
            railMatrices.push(m4.clone());
          }
          m4.compose(
            new THREE.Vector3(mid.x, mid.y + 0.7, mid.z),
            q,
            new THREE.Vector3(1, 1, segLen),
          );
          meshMatrices.push(m4.clone());
        }
      }
      prevPos = curPos;
    }
  }

  if (postMatrices.length > 0) {
    const postGeo = new THREE.CylinderGeometry(0.055, 0.065, 1.35, 6);
    const im = new THREE.InstancedMesh(postGeo, getTimberSidingMat(), postMatrices.length);
    postMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  if (railMatrices.length > 0) {
    const railGeo = new THREE.BoxGeometry(0.05, 0.08, 1.0);
    const im = new THREE.InstancedMesh(railGeo, getTimberSidingMat(), railMatrices.length);
    railMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  if (meshMatrices.length > 0) {
    const safetyMeshTex = canvasTex(
      128,
      128,
      (ctx) => {
        ctx.clearRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(245, 102, 18, 0.92)';
        ctx.lineWidth = 4;
        for (let i = -128; i < 256; i += 20) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 128, 128);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(i + 128, 0);
          ctx.lineTo(i, 128);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(20, 22, 26, 0.85)';
        ctx.fillRect(0, 0, 128, 10);
        ctx.fillRect(0, 118, 128, 10);
      },
      [3, 1],
    );
    const meshGeo = new THREE.PlaneGeometry(1.0, 0.82);
    meshGeo.rotateY(Math.PI / 2);
    const meshMat = new THREE.MeshStandardMaterial({
      map: safetyMeshTex,
      transparent: true,
      alphaTest: 0.25,
      roughness: 0.75,
      side: THREE.DoubleSide,
    });
    const im = new THREE.InstancedMesh(meshGeo, meshMat, meshMatrices.length);
    meshMatrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    g.add(im);
  }

  return g;
}

function buildMarshalPosts(
  samples: PathSample[],
  corners: CornerTarget[],
  isLoop: boolean,
  ground: (x: number, z: number) => number,
): THREE.Group {
  const g = new THREE.Group();
  const m = samples.length;
  const placements: { idx: number; side: number }[] = [{ idx: 2, side: 1 }];

  for (const cn of corners) {
    const idx = isLoop ? (cn.idx + 5) % m : Math.min(m - 2, cn.idx + 5);
    const outside = cn.turn > 0 ? -1 : 1;
    placements.push({ idx, side: outside });
  }

  if (placements.length === 0) return g;

  const count = placements.length;
  const padGeo = new THREE.BoxGeometry(2.2, 0.16, 2.2);
  const hutGeo = new THREE.BoxGeometry(1.5, 1.9, 1.5);
  const roofGeo = new THREE.BoxGeometry(1.75, 0.14, 1.75);
  const poleGeo = new THREE.CylinderGeometry(0.035, 0.045, 3.8, 6);

  // Wind-rippled angled rally flag geometry
  const flagGeo = new THREE.PlaneGeometry(1.35, 0.85, 6, 2);
  const posAttr = flagGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const fx = posAttr.getX(i) + 0.675; // shift so left edge attaches to pole
    posAttr.setX(i, fx);
    posAttr.setZ(i, Math.sin(fx * 4.5) * 0.11);
  }
  flagGeo.computeVertexNormals();

  const padIM = new THREE.InstancedMesh(padGeo, getWeatheredConcreteMat(), count);
  const hutIM = new THREE.InstancedMesh(hutGeo, getTimberSidingMat(), count);
  const roofIM = new THREE.InstancedMesh(roofGeo, getSteelPanelMat(), count);
  const poleIM = new THREE.InstancedMesh(poleGeo, getSteelPanelMat(), count);
  const flagIM = new THREE.InstancedMesh(
    flagGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.72, side: THREE.DoubleSide }),
    count,
  );

  const flagPalette = [0xf2c230, 0x26a65b, 0x1d6fd1, 0xe84a1b];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();

  placements.forEach((pl, i) => {
    const s = samples[pl.idx];
    const p = offsetAt(s, ROAD_HALF + 3.85, pl.side, ground);
    const ry = Math.atan2(-s.tz, s.tx) + (pl.side < 0 ? Math.PI : 0);

    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    m4.compose(new THREE.Vector3(p.x, p.y + 0.08, p.z), q, new THREE.Vector3(1, 1, 1));
    padIM.setMatrixAt(i, m4);

    m4.compose(new THREE.Vector3(p.x, p.y + 1.05, p.z), q, new THREE.Vector3(1, 1, 1));
    hutIM.setMatrixAt(i, m4);

    m4.compose(new THREE.Vector3(p.x, p.y + 2.07, p.z), q, new THREE.Vector3(1, 1, 1));
    roofIM.setMatrixAt(i, m4);

    const px = p.x + s.tx * 1.1;
    const pz = p.z + s.tz * 1.1;
    const py = ground(px, pz);
    m4.makeTranslation(px, py + 1.9, pz);
    poleIM.setMatrixAt(i, m4);

    // Angled out in the breeze
    e.set(0.08, ry + 0.32, -0.14, 'YXZ');
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(px, py + 3.32, pz), q, new THREE.Vector3(1, 1, 1));
    flagIM.setMatrixAt(i, m4);
    flagIM.setColorAt(i, c.setHex(flagPalette[i % flagPalette.length]));
  });

  for (const im of [padIM, hutIM, roofIM, poleIM, flagIM]) {
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }

  return g;
}

function buildFloodlightTowers(
  samples: PathSample[],
  ground: (x: number, z: number) => number,
): THREE.Group {
  const g = new THREE.Group();
  const m = samples.length;
  const spots: { x: number; y: number; z: number; ry: number }[] = [];

  const addSpot = (idx: number, side: number, off = ROAD_HALF + 5.6): void => {
    if (idx < 0 || idx >= m) return;
    const s = samples[idx];
    const p = offsetAt(s, off, side, ground);
    const ry = Math.atan2(-s.tz, s.tx) + (side < 0 ? Math.PI : 0);
    spots.push({ x: p.x, y: p.y, z: p.z, ry });
  };

  // Pair flanking the start / service park area
  addSpot(1, 1, ROAD_HALF + 5.8);
  addSpot(4, -1, ROAD_HALF + 6.2);

  // Portable rally floodlight trailers along the stage
  for (let i = 28; i < m - 6; i += 32) {
    const side = (i / 32) % 2 < 1 ? 1 : -1;
    addSpot(i, side);
  }

  if (spots.length === 0) return g;
  const count = spots.length;

  const baseGeo = new THREE.BoxGeometry(1.6, 0.35, 2.2);
  const genGeo = new THREE.BoxGeometry(1.1, 0.95, 1.5);
  const mastGeo = new THREE.CylinderGeometry(0.08, 0.14, 9.6, 8);
  const headGeo = new THREE.BoxGeometry(2.6, 0.72, 0.32);
  const lampGeo = new THREE.BoxGeometry(2.35, 0.52, 0.08);

  const baseIM = new THREE.InstancedMesh(baseGeo, getWeatheredConcreteMat(), count);
  const genIM = new THREE.InstancedMesh(genGeo, getSteelPanelMat(), count);
  const mastIM = new THREE.InstancedMesh(mastGeo, getSteelPanelMat(), count);
  const headIM = new THREE.InstancedMesh(headGeo, getSteelPanelMat(), count);
  const lampIM = new THREE.InstancedMesh(
    lampGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff3d6 }),
    count,
  );

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  spots.forEach((sp, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.ry);
    m4.compose(new THREE.Vector3(sp.x, sp.y + 0.175, sp.z), q, new THREE.Vector3(1, 1, 1));
    baseIM.setMatrixAt(i, m4);

    m4.compose(new THREE.Vector3(sp.x, sp.y + 0.82, sp.z), q, new THREE.Vector3(1, 1, 1));
    genIM.setMatrixAt(i, m4);

    m4.makeTranslation(sp.x, sp.y + 5.1, sp.z);
    mastIM.setMatrixAt(i, m4);

    // Tilt floodlight head down toward the gravel stage
    e.set(0.42, sp.ry + Math.PI / 2, 0, 'YXZ');
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(sp.x, sp.y + 9.9, sp.z), q, new THREE.Vector3(1, 1, 1));
    headIM.setMatrixAt(i, m4);

    const fwd = new THREE.Vector3(0, 0, 0.18).applyQuaternion(q);
    m4.compose(
      new THREE.Vector3(sp.x + fwd.x, sp.y + 9.9 + fwd.y, sp.z + fwd.z),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    lampIM.setMatrixAt(i, m4);
  });

  for (const im of [baseIM, genIM, mastIM, headIM, lampIM]) {
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  return g;
}

function buildServiceParkAndTiming(
  samples: PathSample[],
  ground: (x: number, z: number) => number,
): THREE.Group {
  const g = new THREE.Group();
  if (samples.length < 6) return g;

  const steelMat = getSteelPanelMat();
  const concreteMat = getWeatheredConcreteMat();
  const timberMat = getTimberSidingMat();

  // 1. Digital rally timing clock cluster beside the start arch
  const s0 = samples[0];
  const clockPos = offsetAt(s0, ROAD_HALF + 2.45, 1, ground, 1.2);
  const clockGroup = new THREE.Group();
  clockGroup.position.set(clockPos.x, clockPos.y, clockPos.z);
  clockGroup.rotation.y = Math.atan2(-s0.tx, -s0.tz);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.9), concreteMat);
  plinth.position.y = 0.3;
  plinth.receiveShadow = true;
  clockGroup.add(plinth);

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.85, 0.32), steelMat);
  stand.position.y = 1.5;
  stand.castShadow = true;
  clockGroup.add(stand);

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.05, 0.36), steelMat);
  cabinet.position.y = 2.65;
  cabinet.castShadow = true;
  clockGroup.add(cabinet);

  const clockTex = canvasTex(512, 256, (ctx) => {
    ctx.fillStyle = '#0d1015';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#ff6a00';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 244);
    ctx.fillStyle = '#ff6a00';
    ctx.font = '800 32px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE 01  ·  TIMING CONTROL', 256, 48);
    ctx.fillStyle = '#ff3b1f';
    ctx.font = '900 92px monospace';
    ctx.fillText('00:00.0', 256, 146);
    ctx.fillStyle = '#24f55a';
    ctx.font = '700 26px Inter, Arial, sans-serif';
    ctx.fillText('NEXT CAR  ·  INTERVAL 01:00', 256, 214);
  });
  const faceMat = new THREE.MeshStandardMaterial({
    map: clockTex,
    emissiveMap: clockTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.75,
    roughness: 0.35,
  });
  const faceFront = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.9), faceMat);
  faceFront.position.set(0, 2.65, 0.19);
  clockGroup.add(faceFront);

  const faceBack = faceFront.clone();
  faceBack.rotation.y = Math.PI;
  faceBack.position.z = -0.19;
  clockGroup.add(faceBack);
  g.add(clockGroup);

  // 2. Rally Service-Park Canopy Tents & Gravel Apron near start arch (side = -1)
  const tentConfigs = [
    { idx: 2, off: ROAD_HALF + 7.2, accent: '#ff6a00', body: '#1c2026', label: 'HORIZON RALLY TEAM' },
    { idx: 4, off: ROAD_HALF + 7.4, accent: '#1d6fd1', body: '#e9ecf0', label: 'PINEWOOD SERVICE' },
  ];

  for (const cfg of tentConfigs) {
    const s = samples[Math.min(samples.length - 1, cfg.idx)];
    const p = offsetAt(s, cfg.off, -1, ground);
    const ry = Math.atan2(-s.tz, s.tx) + Math.PI;

    const tent = new THREE.Group();
    tent.position.set(p.x, p.y, p.z);
    tent.rotation.y = ry;

    // Compacted gravel service pad under tent
    const pad = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.12, 5.4), getGravelMat());
    pad.position.y = 0.04;
    pad.receiveShadow = true;
    tent.add(pad);

    // 4 steel corner legs
    for (const lx of [-2.7, 2.7]) {
      for (const lz of [-2.1, 2.1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), steelMat);
        leg.position.set(lx, 1.4, lz);
        leg.castShadow = true;
        tent.add(leg);
      }
    }

    // Canopy valance & peaked roof
    const canopyTex = canvasTex(512, 128, (ctx) => {
      ctx.fillStyle = cfg.body;
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = cfg.accent;
      ctx.fillRect(0, 0, 512, 26);
      ctx.fillRect(0, 102, 512, 26);
      ctx.fillStyle = cfg.body === '#e9ecf0' ? '#14181f' : '#ffffff';
      ctx.font = '900 34px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.label, 256, 64);
    });
    const valanceMat = new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.68 });
    const roofMat = new THREE.MeshStandardMaterial({ color: cfg.accent, roughness: 0.65 });

    const valance = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.55, 4.5), valanceMat);
    valance.position.y = 2.95;
    valance.castShadow = true;
    tent.add(valance);

    const peak = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.05, 4), roofMat);
    peak.rotation.y = Math.PI / 4;
    peak.scale.set(1.15, 1, 0.92);
    peak.position.y = 3.72;
    peak.castShadow = true;
    tent.add(peak);

    // Service workbench & tool chest inside tent
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.8), timberMat);
    bench.position.set(0, 0.45, 1.35);
    bench.castShadow = true;
    tent.add(bench);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.05, 0.65),
      new THREE.MeshStandardMaterial({ color: 0xc92a1d, roughness: 0.45, metalness: 0.35 }),
    );
    chest.position.set(-1.7, 0.52, 1.35);
    chest.castShadow = true;
    tent.add(chest);

    g.add(tent);
  }

  return g;
}

function buildDistanceBoards(
  samples: PathSample[],
  corners: CornerTarget[],
  isLoop: boolean,
  ground: (x: number, z: number) => number,
): THREE.Group {
  const g = new THREE.Group();
  const m = samples.length;
  if (m < 10) return g;

  const makeBoardTex = (text: string, accent: string, sub?: string): THREE.CanvasTexture =>
    canvasTex(128, 192, (ctx) => {
      ctx.fillStyle = '#f2f2ef';
      ctx.fillRect(0, 0, 128, 192);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 128, 38);
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, 122, 186);
      ctx.fillStyle = '#141414';
      ctx.font = sub ? '900 40px Inter, Arial, sans-serif' : '900 44px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, sub ? 102 : 114);
      if (sub) {
        ctx.fillStyle = accent;
        ctx.font = '800 22px Inter, Arial, sans-serif';
        ctx.fillText(sub, 64, 150);
      }
    });

  const boardGeo = new THREE.BoxGeometry(0.7, 1.05, 0.06);
  const postGeo = new THREE.CylinderGeometry(0.045, 0.055, 1.6, 6);
  const postMat = getTimberSidingMat();
  const backMat = getSteelPanelMat();

  const postMats: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();

  const placeBoard = (sampleIdx: number, side: number, tex: THREE.CanvasTexture): void => {
    const s = samples[sampleIdx];
    const p = offsetAt(s, ROAD_HALF + 2.0, side, ground);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const mesh = new THREE.Mesh(boardGeo, [backMat, backMat, backMat, backMat, mat, backMat]);
    mesh.position.set(p.x, p.y + 1.35, p.z);
    mesh.rotation.y = Math.atan2(-s.tx, -s.tz);
    mesh.castShadow = true;
    g.add(mesh);

    m4.makeTranslation(p.x, p.y + 0.8, p.z);
    postMats.push(m4.clone());
  };

  // Braking distance boards (150m, 100m, 50m) before major corners
  const tex150 = makeBoardTex('150', '#ff6a00', 'M');
  const tex100 = makeBoardTex('100', '#ff6a00', 'M');
  const tex50 = makeBoardTex('50', '#d92518', 'M');

  const used = new Set<number>();
  for (const cn of corners.slice(0, 8)) {
    const outside = cn.turn > 0 ? -1 : 1;
    const offsets: [number, THREE.CanvasTexture][] = [
      [33, tex150],
      [22, tex100],
      [11, tex50],
    ];
    for (const [backSteps, tex] of offsets) {
      const idx = isLoop ? (cn.idx - backSteps + m) % m : cn.idx - backSteps;
      if (idx < 4 || idx >= m) continue;
      if (used.has(idx)) continue;
      used.add(idx);
      placeBoard(idx, outside, tex);
    }
  }

  // Stage kilometer markers every 250 m
  const totalDist = samples[m - 1].dist;
  for (let kmDist = 250; kmDist < totalDist - 100; kmDist += 250) {
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < m; i++) {
      const diff = Math.abs(samples[i].dist - kmDist);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const kmStr = (kmDist / 1000).toFixed(kmDist % 500 === 0 ? 1 : 2);
    placeBoard(bestIdx, 1, makeBoardTex(kmStr, '#1c6b3a', 'KM'));
  }

  if (postMats.length > 0) {
    const im = new THREE.InstancedMesh(postGeo, postMat, postMats.length);
    postMats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    im.castShadow = true;
    g.add(im);
  }

  return g;
}

export function buildPinewoodRallyCircuit(opts: PinewoodRallyOptions): PinewoodRallyResult {
  const { circuit, ground, exag } = opts;
  const group = new THREE.Group();
  group.name = `circuit:${circuit.name || 'pinewood_rally'}`;

  const { samples, isLoop } = densifyPath(circuit, ground, 4.5);
  if (samples.length < 2) {
    return { group };
  }

  // 1. Gravel/dirt rally stage road ribbon with banked edges
  const roadMesh = buildGravelRibbon(samples, isLoop, ground);
  group.add(roadMesh);

  // 2. Start / Finish rally timing arch (and separate finish arch if point-to-point)
  const startLabel = isLoop ? 'PINEWOOD RALLY  ·  START / FINISH' : 'PINEWOOD RALLY  ·  STAGE START';
  const { archGroup: startArch, lamps, lampMats } = buildTimingArch(samples[0], ground, startLabel, true);
  group.add(startArch);

  if (!isLoop && samples.length > 12) {
    const { archGroup: finishArch } = buildTimingArch(
      samples[samples.length - 4],
      ground,
      'STAGE FINISH  ·  TIME CONTROL',
      false,
    );
    group.add(finishArch);
  }

  // 3. Corner chevron direction signs
  const corners = collectCorners(circuit, samples);
  group.add(buildChevronSigns(samples, corners, isLoop, ground));

  // 4. Dense tire-barrier stacks on hairpins
  const tireStacks = buildHairpinTireStacks(samples, corners, isLoop, ground);
  if (tireStacks) group.add(tireStacks);

  // 5. Steel W-beam guardrails + timber log retaining walls on steep embankments
  group.add(buildSteepDropGuardrails(samples, isLoop, ground, exag));

  // 6. Wooden/mesh rally safety fencing along spectator zones
  group.add(buildSpectatorSafetyFencing(samples, corners, isLoop, ground));

  // 7. Marshal posts with angled, wind-rippled colored flags
  group.add(buildMarshalPosts(samples, corners, isLoop, ground));

  // 8. Portable rally floodlight towers
  group.add(buildFloodlightTowers(samples, ground));

  // 9. Rally service-park tents & digital timing clock cluster near start arch
  group.add(buildServiceParkAndTiming(samples, ground));

  // 10. Braking distance & stage km distance markers
  group.add(buildDistanceBoards(samples, corners, isLoop, ground));

  let lightState = -1;
  const setLights = (state: 'red' | 'green' | 'off'): void => {
    const v = state === 'red' ? 1 : state === 'green' ? 2 : 0;
    if (v === lightState) return;
    lightState = v;
    for (const lamp of lamps) {
      lamp.material = lampMats[v];
    }
  };

  return { group, road: roadMesh, setLights };
}
