/**
 * wildlifeWorld.ts — Living Michigan Countryside Wildlife & Farm Ecosystem:
 *   - Grazing Dairy & Beef Cows (Holstein black-and-white + Hereford brown) in fenced pastures beside hay bales
 *   - Grazing & Trotting Horses (chestnut, bay, palomino, white) in countryside paddocks
 *   - White-Tail Deer (antlered bucks & does) along countryside clearings & forest edges that
 *     naturally alert and bound gracefully away into the woods when a car drives near!
 *   - Flocks of Flying Canada Geese (V-formations) & Individual Soaring Coastal Seagulls / Woodland Hawks
 *     with GPU vertex-shader wing-flapping across the sky!
 *
 * Ultra-lightweight GPU InstancedMeshes (~8 draw calls total, zero FPS regression, strictly road-cleared).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createApexBirdWingTslMaterial } from './tsl/apexMaterialsTsl';
import { isRegionWebGpuActive } from './tsl/webgpuRuntime';

export interface WildlifeOptions {
  ground: (x: number, z: number) => number;
  clearCheck: (x: number, z: number) => boolean;
}

export interface WildlifeWorld {
  group: THREE.Group;
  update: (dt: number, nowSec: number, playerPos: THREE.Vector3 | null) => void;
  counts: { cows: number; horses: number; deer: number; birds: number; pastureHay: number };
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Build articulated quadruped body geometry (cow, horse, or deer) with grounded hooves at y = 0, facing +Z. */
function buildAnimalGeo(kind: 'cow' | 'horse' | 'deer'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, rz = 0): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  if (kind === 'cow') {
    // Stocky barrel torso, low head, 4 sturdy legs, ears & tail
    box(0.82, 0.78, 1.72, 0, 1.02, 0);
    box(0.46, 0.44, 0.54, 0, 1.06, 1.05, 0.22); // neck + head
    box(0.36, 0.28, 0.36, 0, 0.92, 1.38, 0.15); // muzzle
    for (const sx of [-0.28, 0.28]) {
      box(0.16, 0.72, 0.16, sx, 0.36, 0.58);
      box(0.16, 0.72, 0.16, sx, 0.36, -0.58);
      box(0.22, 0.08, 0.10, sx * 1.15, 1.24, 1.15); // ears
    }
    box(0.08, 0.52, 0.08, 0, 0.90, -0.92, 0.22); // tail
  } else if (kind === 'horse') {
    // Athletic barrel chest, tall arched neck, slender legs, mane & flowing tail
    box(0.68, 0.74, 1.82, 0, 1.24, 0);
    box(0.32, 0.76, 0.40, 0, 1.66, 0.88, 0.42); // arched neck
    box(0.26, 0.28, 0.56, 0, 1.92, 1.26, 0.48); // head & snout
    for (const sx of [-0.24, 0.24]) {
      box(0.13, 0.96, 0.14, sx, 0.48, 0.66);
      box(0.13, 0.96, 0.14, sx, 0.48, -0.68);
      box(0.06, 0.16, 0.06, sx * 0.48, 2.08, 1.12); // ears
    }
    box(0.14, 0.78, 0.16, 0, 1.04, -1.04, 0.34); // tail
  } else {
    // Graceful slender white-tail deer with tall alert neck & small branched antlers
    box(0.46, 0.50, 1.26, 0, 0.98, 0);
    box(0.20, 0.58, 0.24, 0, 1.36, 0.58, 0.30); // slender neck
    box(0.18, 0.20, 0.38, 0, 1.56, 0.84, 0.18); // head
    for (const sx of [-0.17, 0.17]) {
      box(0.08, 0.78, 0.09, sx, 0.39, 0.44);
      box(0.08, 0.78, 0.09, sx, 0.39, -0.44);
      // Graceful antlers
      box(0.04, 0.34, 0.04, sx * 0.85, 1.78, 0.72, -0.18, sx * 0.45);
      box(0.035, 0.22, 0.035, sx * 1.35, 1.88, 0.78, 0.25, sx * 0.25);
    }
    box(0.10, 0.24, 0.12, 0, 1.12, -0.68, -0.42); // white-tail flag
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

/** Build sleek swept-wing bird geometry (wings span along X so shader flaps Y cleanly by |x|!). */
function buildBirdGeo(): THREE.BufferGeometry {
  const pos: number[] = [
    // Slender body fuselage (2 triangles)
    0, 0, 0.42,   -0.09, 0, -0.36,   0.09, 0, -0.36,
    // Left wing (inner + outer tapered tip)
    -0.06, 0.02, 0.14,   -0.55, 0.04, 0.02,   -0.06, 0, -0.16,
    -0.55, 0.04, 0.02,   -1.08, 0.02, -0.18,  -0.46, 0, -0.18,
    -0.06, 0, -0.16,     -0.55, 0.04, 0.02,   -0.46, 0, -0.18,
    // Right wing (mirrored)
    0.06, 0.02, 0.14,    0.06, 0, -0.16,      0.55, 0.04, 0.02,
    0.55, 0.04, 0.02,    0.46, 0, -0.18,      1.08, 0.02, -0.18,
    0.06, 0, -0.16,      0.46, 0, -0.18,      0.55, 0.04, 0.02,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Holstein black-and-white spotted cow texture so dairy cattle read unmistakably from the road! */
function makeCowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f0eee8';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1c1e22';
  for (const [x, y, rx, ry] of [[24, 30, 22, 16], [88, 28, 24, 18], [52, 74, 28, 20], [104, 96, 20, 18], [16, 102, 18, 16]]) {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface GrazingAgent {
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  yaw: number;
  targetYaw: number;
  speed: number;
  phase: number;
  scale: number;
  fleeing?: number;
}

interface FlyingBird {
  flockCx: number;
  flockCz: number;
  orbitRx: number;
  orbitRz: number;
  alt: number;
  ang: number;
  angSpeed: number;
  offX: number;
  offY: number;
  offZ: number;
  scale: number;
  phase: number;
}

export function buildWildlifeWorld(opts: WildlifeOptions): WildlifeWorld {
  const group = new THREE.Group();
  group.name = 'CountrysideWildlifeAndLivestock';
  const rnd = makeRng(88421);

  // Curated pasture & clearing anchors across Michigan farmland, rural towns & pinewoods (all outside Ironport downtown!)
  const pastureHubs: [number, number][] = [
    [-1980, -1380], [-3340, 1080], [-1180, -2520], [1560, -2840], [-4520, -680],
    [-2720, -2840], [-920, -3340], [720, -3120], [-3780, -2260], [-4680, 620],
    [-2260, 2060], [-1360, 1680], [490, -2140], [-3040, -360], [-1760, -340],
    [-4120, 2080], [-2540, 3120], [-1620, 1180], [-2880, 680], [-1120, 420],
    // Immediate roadside pastures around Kettle Crossing, Millbrook Hollow & Coastal Highway farmland
    [-1405, 1515], [-1625, 1535], [-1420, 1745], [-1585, 1785],
    [-1245, -1235], [-4380, 1780], [-4240, 2140], [-3820, 2480],
  ];

  const cows: GrazingAgent[] = [];
  const horses: GrazingAgent[] = [];
  const deer: GrazingAgent[] = [];
  const hayMatrices: THREE.Matrix4[] = [];

  const qTmp = new THREE.Quaternion();
  const eTmp = new THREE.Euler();
  const vPos = new THREE.Vector3();
  const vScl = new THREE.Vector3();
  const m4 = new THREE.Matrix4();

  const flatDryClear = (x: number, z: number): boolean => {
    const y = opts.ground(x, z);
    if (y < 2.6 || y > 165) return false;
    if (!opts.clearCheck(x, z)) return false;
    const sl = Math.max(Math.abs(opts.ground(x + 3, z) - y), Math.abs(opts.ground(x, z + 3) - y));
    return sl < 0.92;
  };

  // 1. Populate Pasture Hay Bales + Grazing Cow Herds + Horse Paddocks
  pastureHubs.forEach(([hx, hz], idx) => {
    const isHorsePaddock = idx % 3 === 1;
    // Scatter 3-6 golden round hay bales across grassy pastures
    const baleN = 3 + Math.floor(rnd() * 4);
    for (let b = 0; b < baleN; b++) {
      const bx = hx + (rnd() - 0.5) * 90;
      const bz = hz + (rnd() - 0.5) * 90;
      if (!flatDryClear(bx, bz)) continue;
      const by = opts.ground(bx, bz);
      eTmp.set(Math.PI / 2, rnd() * Math.PI, 0);
      qTmp.setFromEuler(eTmp);
      hayMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(bx, by + 0.82, bz), qTmp, new THREE.Vector3(0.88, 1.38, 0.88)));
    }

    const herdSize = isHorsePaddock ? (4 + Math.floor(rnd() * 3)) : (6 + Math.floor(rnd() * 5));
    for (let k = 0; k < herdSize; k++) {
      const ax = hx + (rnd() - 0.5) * 76;
      const az = hz + (rnd() - 0.5) * 76;
      if (!flatDryClear(ax, az)) continue;
      const agent: GrazingAgent = {
        x: ax, z: az, homeX: hx, homeZ: hz,
        yaw: rnd() * Math.PI * 2,
        targetYaw: rnd() * Math.PI * 2,
        speed: isHorsePaddock ? (0.45 + rnd() * 0.55) : (0.18 + rnd() * 0.24),
        phase: rnd() * Math.PI * 2,
        scale: 0.92 + rnd() * 0.18,
      };
      if (isHorsePaddock) horses.push(agent);
      else cows.push(agent);
    }
  });

  // 2. Populate White-Tail Deer along Michigan countryside clearings, pinewood edges & rural roadsides (strictly off roads!)
  const deerClearings: [number, number][] = [
    [-2450, -950], [-3650, -1450], [-1480, -1820], [-2850, -3450], [-4280, -1850],
    [-1920, 820], [-3480, 1780], [-820, -2120], [1120, -3480], [-4920, 1220],
    [-2180, 2650], [-3920, 220], [-1280, 2280], [-3120, -2120], [2180, -3280],
    [-4620, -2820], [-1640, -3850], [-560, -1120], [-2740, 1520], [-3520, -480],
    [-1565, 1660], [-1340, 1410], [-4460, 1940], [-4560, 1520],
  ];
  for (const [dx0, dz0] of deerClearings) {
    const groupSize = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < groupSize; k++) {
      const dx = dx0 + (rnd() - 0.5) * 68;
      const dz = dz0 + (rnd() - 0.5) * 68;
      if (!flatDryClear(dx, dz)) continue;
      deer.push({
        x: dx, z: dz, homeX: dx0, homeZ: dz0,
        yaw: rnd() * Math.PI * 2,
        targetYaw: rnd() * Math.PI * 2,
        speed: 0.35 + rnd() * 0.35,
        phase: rnd() * Math.PI * 2,
        scale: 0.90 + rnd() * 0.22,
        fleeing: 0,
      });
    }
  }

  // 3. Populate Flocks of Birds (V-formation migrating geese) + Individual Soaring Seagulls & Hawks across the entire region!
  const birds: FlyingBird[] = [];
  const flockCenters: [number, number, number, number][] = [
    [-2200, -1200, 320, 42],  // Central Michigan farmland
    [-1500, 1520, 220, 32],   // Kettle Crossing low-gliding farmland flock
    [-4480, 1820, 260, 34],   // Coastal Highway soaring seagulls & geese
    [-4800, 1100, 420, 38],   // Great Lakes Dune Coast seagulls
    [-4600, 3850, 360, 56],   // Airport / South coast
    [-3100, -2600, 380, 48],  // Pinewood Forest hawks & geese
    [4200, 900, 460, 46],     // Ironport Riverfront gulls
    [5400, -1200, 440, 48],   // Harbor & North bay gulls
    [-600, -2800, 360, 46],   // North hills
    [-3500, 2200, 320, 40],   // Maple Ridge countryside
    [1600, -2600, 360, 44],   // Cedar Creek valley
  ];
  flockCenters.forEach(([cx, cz, rad, alt], fi) => {
    const isVFlock = fi % 2 === 0;
    const count = isVFlock ? 11 : 7;
    const ang0 = rnd() * Math.PI * 2;
    const angSpd = (0.048 + rnd() * 0.032) * (fi % 3 === 0 ? -1 : 1);
    for (let k = 0; k < count; k++) {
      if (isVFlock) {
        const side = k === 0 ? 0 : (k % 2 === 1 ? -1 : 1);
        const rank = Math.ceil(k / 2);
        birds.push({
          flockCx: cx, flockCz: cz, orbitRx: rad, orbitRz: rad * 0.72,
          alt: alt + (rnd() - 0.5) * 3,
          ang: ang0, angSpeed: angSpd,
          offX: side * rank * 3.6 + (rnd() - 0.5) * 0.8,
          offY: (rnd() - 0.5) * 1.0,
          offZ: -rank * 4.0 + (rnd() - 0.5) * 0.8,
          scale: 1.25 + rnd() * 0.30,
          phase: rnd() * Math.PI * 2,
        });
      } else {
        // Individual soaring birds wheeling independently at varied altitudes & radii
        birds.push({
          flockCx: cx + (rnd() - 0.5) * 180, flockCz: cz + (rnd() - 0.5) * 180,
          orbitRx: 110 + rnd() * 210, orbitRz: 95 + rnd() * 190,
          alt: Math.max(22, alt - 10 + rnd() * 26),
          ang: rnd() * Math.PI * 2, angSpeed: (0.052 + rnd() * 0.048) * (k % 2 ? 1 : -1),
          offX: 0, offY: 0, offZ: 0,
          scale: 1.12 + rnd() * 0.48,
          phase: rnd() * Math.PI * 2,
        });
      }
    }
  });

  // ---- Build GPU InstancedMeshes ----
  const col = new THREE.Color();

  // Golden Pasture Round Hay Bales
  if (hayMatrices.length) {
    const hayGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xc9a34c, roughness: 0.96 });
    const hayIm = new THREE.InstancedMesh(hayGeo, hayMat, hayMatrices.length);
    hayMatrices.forEach((m, i) => hayIm.setMatrixAt(i, m));
    hayIm.instanceMatrix.needsUpdate = true;
    hayIm.castShadow = true;
    hayIm.receiveShadow = true;
    hayIm.userData.maxDist = 420;
    group.add(hayIm);
  }

  // Cows (Holstein spotted texture + brown/cream/black tints)
  const cowMesh = cows.length
    ? new THREE.InstancedMesh(buildAnimalGeo('cow'), new THREE.MeshStandardMaterial({ map: makeCowTexture(), roughness: 0.88 }), cows.length)
    : null;
  if (cowMesh) {
    const cowTints = [0xffffff, 0xf6f3ee, 0x7c5338, 0x3b2a20, 0xd8c3a5];
    cows.forEach((_, i) => cowMesh.setColorAt(i, col.setHex(cowTints[i % cowTints.length])));
    if (cowMesh.instanceColor) cowMesh.instanceColor.needsUpdate = true;
    cowMesh.castShadow = true;
    cowMesh.receiveShadow = true;
    cowMesh.frustumCulled = false;
    group.add(cowMesh);
  }

  // Horses (chestnut, bay, palomino, white, dapple gray)
  const horseMesh = horses.length
    ? new THREE.InstancedMesh(buildAnimalGeo('horse'), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }), horses.length)
    : null;
  if (horseMesh) {
    const horseCols = [0x6e3b1f, 0x4b2814, 0xc79a56, 0xdedad2, 0x262220, 0x8a522e];
    horses.forEach((_, i) => horseMesh.setColorAt(i, col.setHex(horseCols[i % horseCols.length])));
    if (horseMesh.instanceColor) horseMesh.instanceColor.needsUpdate = true;
    horseMesh.castShadow = true;
    horseMesh.receiveShadow = true;
    horseMesh.frustumCulled = false;
    group.add(horseMesh);
  }

  // White-Tail Deer (tawny reddish-brown coats)
  const deerMesh = deer.length
    ? new THREE.InstancedMesh(buildAnimalGeo('deer'), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 }), deer.length)
    : null;
  if (deerMesh) {
    const deerCols = [0x9c6e46, 0x8b603b, 0xa87c52, 0x7a5436];
    deer.forEach((_, i) => deerMesh.setColorAt(i, col.setHex(deerCols[i % deerCols.length])));
    if (deerMesh.instanceColor) deerMesh.instanceColor.needsUpdate = true;
    deerMesh.castShadow = true;
    deerMesh.receiveShadow = true;
    deerMesh.frustumCulled = false;
    group.add(deerMesh);
  }

  // Flying Birds with GPU vertex-shader wing flapping (TSL in WebGPU, onBeforeCompile in WebGL2)!
  const uBirdTime = { value: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tslBirdTime: any = null;
  let birdMat: THREE.Material;
  if (isRegionWebGpuActive()) {
    const bw = createApexBirdWingTslMaterial();
    tslBirdTime = bw.uBirdTime;
    birdMat = bw.material as unknown as THREE.Material;
  } else {
    const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
    wm.onBeforeCompile = (sh) => {
      sh.uniforms.uBirdTime = uBirdTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uBirdTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float wingSpan = abs(position.x);
          if (wingSpan > 0.08) {
            float instSeed = instanceMatrix[3][0] * 0.07 + instanceMatrix[3][2] * 0.05;
            float flap = sin(uBirdTime * 7.8 + instSeed) * wingSpan * 0.44;
            transformed.y += flap;
          }`,
        );
    };
    wm.customProgramCacheKey = () => 'apex-flying-bird-v1';
    birdMat = wm;
  }
  const birdMesh = birds.length ? new THREE.InstancedMesh(buildBirdGeo(), birdMat, birds.length) : null;
  if (birdMesh) {
    const birdCols = [0x2b2d30, 0xeaeef2, 0x3b352d, 0xd8dfe6, 0x4a3d30];
    birds.forEach((_, i) => birdMesh.setColorAt(i, col.setHex(birdCols[i % birdCols.length])));
    if (birdMesh.instanceColor) birdMesh.instanceColor.needsUpdate = true;
    birdMesh.castShadow = false;
    birdMesh.frustumCulled = false;
    group.add(birdMesh);
  }

  const updateAgents = (list: GrazingAgent[], mesh: THREE.InstancedMesh | null, dt: number, nowSec: number, canFlee: boolean, playerPos: THREE.Vector3 | null): void => {
    if (!mesh) return;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      let spd = a.speed;
      if (canFlee && playerPos) {
        const dx = a.x - playerPos.x, dz = a.z - playerPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 46 * 46) {
          a.targetYaw = Math.atan2(dx, dz);
          a.fleeing = 3.5;
        }
      }
      if (a.fleeing && a.fleeing > 0) {
        a.fleeing = Math.max(0, a.fleeing - dt);
        spd = 5.4; // bounding away gracefully!
      } else {
        // Gentle wandering inside home pasture / clearing
        if (Math.sin(nowSec * 0.35 + a.phase) > 0.92) {
          const toHomeX = a.homeX - a.x, toHomeZ = a.homeZ - a.z;
          const distHome = Math.hypot(toHomeX, toHomeZ);
          a.targetYaw = distHome > 48 ? Math.atan2(toHomeX, toHomeZ) : a.yaw + (Math.sin(nowSec + a.phase * 3) * 0.8);
        }
      }
      let dyaw = a.targetYaw - a.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      a.yaw += dyaw * Math.min(1, dt * (a.fleeing ? 4.5 : 1.2));

      const nx = a.x + Math.sin(a.yaw) * spd * dt;
      const nz = a.z + Math.cos(a.yaw) * spd * dt;
      // Never step onto any road or into water!
      if (opts.clearCheck(nx, nz) && opts.ground(nx, nz) > 3.5) {
        a.x = nx; a.z = nz;
      } else {
        a.targetYaw = a.yaw + Math.PI * 0.75;
      }
      const gy = opts.ground(a.x, a.z);
      const boundHop = a.fleeing && a.fleeing > 0 ? Math.abs(Math.sin(nowSec * 10.5 + a.phase)) * 0.42 : 0;
      const grazePitch = a.fleeing && a.fleeing > 0
        ? Math.sin(nowSec * 10.5 + a.phase) * 0.14
        : Math.max(0, Math.sin(nowSec * 0.65 + a.phase)) * 0.14;
      eTmp.set(grazePitch, a.yaw, 0, 'YXZ');
      qTmp.setFromEuler(eTmp);
      mesh.setMatrixAt(i, m4.compose(vPos.set(a.x, gy + boundHop, a.z), qTmp, vScl.setScalar(a.scale)));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  let animalAccum = 0;
  const update = (dt: number, nowSec: number, playerPos: THREE.Vector3 | null): void => {
    uBirdTime.value = nowSec;
    if (tslBirdTime) tslBirdTime.value = nowSec;
    // Smooth 60 Hz flying birds across skies
    if (birdMesh) {
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        b.ang += b.angSpeed * dt;
        const cx = b.flockCx + Math.cos(b.ang) * b.orbitRx;
        const cz = b.flockCz + Math.sin(b.ang) * b.orbitRz;
        const vx = -Math.sin(b.ang) * b.orbitRx * b.angSpeed;
        const vz = Math.cos(b.ang) * b.orbitRz * b.angSpeed;
        const yaw = Math.atan2(vx, vz);
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const bx = cx + cy * b.offX + sy * b.offZ;
        const bz = cz - sy * b.offX + cy * b.offZ;
        const gy = opts.ground(bx, bz);
        const by = Math.max(gy + 16, b.alt + b.offY + Math.sin(nowSec * 1.4 + b.phase) * 2.2);
        const bank = Math.sign(b.angSpeed) * 0.22;
        eTmp.set(0, yaw, bank, 'YXZ');
        qTmp.setFromEuler(eTmp);
        birdMesh.setMatrixAt(i, m4.compose(vPos.set(bx, by, bz), qTmp, vScl.setScalar(b.scale)));
      }
      birdMesh.instanceMatrix.needsUpdate = true;
    }

    // Update ground livestock & deer smoothly at ~20 Hz (zero CPU overhead!)
    animalAccum += dt;
    if (animalAccum >= 0.05) {
      const stepDt = Math.min(0.15, animalAccum);
      animalAccum = 0;
      updateAgents(cows, cowMesh, stepDt, nowSec, false, null);
      updateAgents(horses, horseMesh, stepDt, nowSec, false, null);
      updateAgents(deer, deerMesh, stepDt, nowSec, true, playerPos);
    }
  };

  // Seed initial transforms immediately so animals are grounded on frame 1
  update(0.05, 0, null);

  return {
    group,
    update,
    counts: { cows: cows.length, horses: horses.length, deer: deer.length, birds: birds.length, pastureHay: hayMatrices.length },
  };
}
