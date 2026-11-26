/**
 * ruralTownsAndRoads.ts — Civil-Engineered Rural Small Towns & Country Road Network.
 *
 * Applies authentic rural civil-engineering & zoning principles across Ironport's countryside:
 *   1. Four Zoned Small Towns sited at real rail/road crossroads (strictly clear of closed race circuits):
 *      - Kettle Crossing (-1460, 1490): Rail-depot market town beside Kettle Hills Station
 *      - Section Corners ( 1360, -340): Heartland grain-elevator agricultural village beside Section Road Halt
 *      - Maple Ridge     (-2250, 2920): Hilly farmland crossroads village on the southern ridge
 *      - Cedar Creek     (  620,-4050): Northern wooded timber & sawmill village with twisting forest approaches
 *   2. Rural Zoning Logic inside every town:
 *      - Main Street Commercial Core (2-lane paved avenue, brick general store, diner, hardware, post office, bank)
 *      - Civic Square (green lawn, municipal steel water tower, town hall / church steeple / gazebo)
 *      - Rail / Edge Agri-Industrial Zone (grain elevators & feed silos next to tracks, sawmill on outer timber edge)
 *      - Quiet Residential Side Streets (pitched-roof clapboard & timber cottages set back behind sidewalks & streetlamps)
 *   3. >35 km of Brand-New Civil-Engineered Drivable Rural Roads (injected into countryNet BEFORE gradeRoads & planSim!):
 *      - Smooth Catmull-Rom cubic splines (no polygonal kinks, comfortable civil curve radii)
 *      - 2-lane paved county collectors linking all 4 towns, Halcyon Airport, Shoreline Highway & Southgate
 *      - Hilly farm rolling paved & packed-dirt backroads following natural agricultural ridges
 *      - Wooded twisting canyon/forest paved & dirt roads winding through dense pinewoods
 *      - Automatically graded into heights via roadGrade.ts, automatically gets working rail level crossings via planSim(),
 *        carries live AI traffic, and renders crisply on Map Overview via rebuildMapRoads()!
 */

import * as THREE from 'three';
import { buildRuralArchGlassMaterial, buildRuralArchPbrMaterial, registerRuralOmniFacadeMesh, type RuralArchetypeId } from './library/kit';
import type { Pad } from './pads';

export interface RuralRoadDef {
  name: string;
  kind: 'paved' | 'dirt';
  half: number;
  town?: boolean;
  xz: number[][];
}

export interface RuralTownDef {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;             // Main Street heading (radians)
  theme: 'rail_market' | 'grain_hub' | 'hill_farm' | 'timber_woods';
  mainLen: number;
  labelSubtitle: string;
}

export const RURAL_TOWNS: RuralTownDef[] = [
  { id: 'kettle_crossing', name: 'Kettle Crossing', x: -1460, z: 1490, yaw: 0.42, theme: 'rail_market', mainLen: 260, labelSubtitle: 'Rail Depot · Market Town' },
  { id: 'section_corners', name: 'Section Corners', x: 1360, z: -340, yaw: -0.18, theme: 'grain_hub', mainLen: 220, labelSubtitle: 'Grain Elevators · Farm Hub' },
  { id: 'maple_ridge', name: 'Maple Ridge', x: -2250, z: 2920, yaw: 0.12, theme: 'hill_farm', mainLen: 220, labelSubtitle: 'Hilly Farm Crossroads' },
  { id: 'cedar_creek', name: 'Cedar Creek', x: 620, z: -4050, yaw: -0.35, theme: 'timber_woods', mainLen: 210, labelSubtitle: 'Wooded Timber Village' },
];

/** Catmull-Rom smooth polyline densifier (~18 m spacing so roadGrade & buildCountryScenes produce silky smooth civil curves). */
function smoothRoad(ctrl: [number, number][], stepM = 18): number[][] {
  if (ctrl.length < 2) return ctrl.map((p) => [p[0], p[1]]);
  const out: number[][] = [];
  const P = (i: number): [number, number] => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(segLen / stepM));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = ctrl[ctrl.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/** Generate civil-engineered rural roads + all 4 towns' Main Streets & zoned residential side streets. */
export function buildRuralRoadNetwork(): RuralRoadDef[] {
  const roads: RuralRoadDef[] = [];

  // ── 1. Regional 2-Lane Paved County Collectors (connecting all 4 rural towns, Halcyon Airport, Shoreline & Southgate) ──
  roads.push({
    name: 'Kettle Valley County Highway (2-Lane)',
    kind: 'paved',
    half: 5.0,
    xz: smoothRoad([
      [-4500, 3915],  // Halcyon Airport Road junction
      [-3920, 3680],
      [-3280, 3360],
      [-2680, 3120],
      [-2250, 2920],  // Maple Ridge Main St
      [-1960, 2480],
      [-1720, 1980],
      [-1460, 1490],  // Kettle Crossing Main St
    ]),
  });

  roads.push({
    name: 'Heartland Rail-Corridor Highway (2-Lane)',
    kind: 'paved',
    half: 5.0,
    xz: smoothRoad([
      [-1460, 1490],  // Kettle Crossing
      [-1040, 1120],
      [-580, 740],
      [-120, 320],
      [380, -80],
      [920, -280],
      [1360, -340],   // Section Corners Main St
      [1820, -420],
      [2320, -560],
      [2780, -780],   // Joins western suburban boulevard
    ]),
  });

  roads.push({
    name: 'Northern Timber & Farm Collector (2-Lane)',
    kind: 'paved',
    half: 4.8,
    xz: smoothRoad([
      [1360, -340],   // Section Corners
      [1480, -980],
      [1540, -1620],
      [1380, -2280],
      [1120, -2960],
      [880, -3560],
      [620, -4050],   // Cedar Creek Main St
      [280, -4380],   // Joins Northern Highway
    ]),
  });

  roads.push({
    name: 'Maple Ridge – Southgate Hilly Farm Road (2-Lane)',
    kind: 'paved',
    half: 4.6,
    xz: smoothRoad([
      [-2250, 2920],  // Maple Ridge
      [-1650, 3040],
      [-980, 2920],
      [-320, 2680],
      [360, 2560],
      [1080, 2480],
      [1840, 2360],
      [2560, 2240],
      [3040, 2190],   // Approaches Southgate Station & West Bank
    ]),
  });

  // ── 2. Wooded Twisting Canyon / Pinewood Backroads (Paved & Packed-Dirt — strictly clear of Cliff Raceway & Pinewood Rally) ──
  roads.push({
    name: 'Pinewood Ridge Twisting Backroad (2-Lane)',
    kind: 'paved',
    half: 4.2,
    xz: smoothRoad([
      [-3780, -420],  // East of Shoreline Highway in western woods
      [-3420, -120],
      [-3180, 240],
      [-3360, 620],   // Wooded S-bend
      [-2980, 920],
      [-2520, 740],   // Twisting ridge sweeper
      [-2140, 980],
      [-1860, 1280],
      [-1460, 1490],  // Enters Kettle Crossing from NW woods
    ], 14),
  });

  roads.push({
    name: 'Whispering Pines Twisting Dirt Track',
    kind: 'dirt',
    half: 3.8,
    xz: smoothRoad([
      [-3420, -120],
      [-2960, -480],
      [-2480, -760],
      [-1920, -540],
      [-1480, -820],
      [-980, -640],
      [-540, -320],
      [-120, 320],    // Rejoins Heartland County Highway
    ], 14),
  });

  roads.push({
    name: 'Cedar Creek Northern Wooded Twister (Dirt)',
    kind: 'dirt',
    half: 3.8,
    xz: smoothRoad([
      [620, -4050],   // Cedar Creek Village
      [140, -4180],
      [-360, -3960],
      [-880, -4240],
      [-1420, -4020],
      [-1960, -4280],
      [-2540, -4060],
      [-3120, -4180], // Connects out toward western coastal highway
    ], 14),
  });

  // ── 3. Hilly Farmland Rolling Dirt Backroads (linking hilltop barns, silos & valleys) ──
  roads.push({
    name: 'Heartland Hilltop Farm Road (Dirt)',
    kind: 'dirt',
    half: 3.8,
    xz: smoothRoad([
      [-980, 2920],
      [-740, 2360],
      [-340, 1860],
      [180, 1440],
      [680, 1020],
      [1140, 560],
      [1360, -340],   // Section Corners
    ], 16),
  });

  roads.push({
    name: 'Kettle Hollow Farm Lane (Dirt)',
    kind: 'dirt',
    half: 3.6,
    xz: smoothRoad([
      [-3280, 3360],
      [-3140, 2720],
      [-2860, 2180],
      [-2340, 1860],
      [-1860, 1680],
      [-1460, 1490],
    ], 16),
  });

  // ── 4. Zoned Town Main Streets & Residential Cross-Streets for All 4 Small Towns ──
  for (const t of RURAL_TOWNS) {
    const ux = Math.sin(t.yaw), uz = Math.cos(t.yaw);
    const rx = Math.cos(t.yaw), rz = -Math.sin(t.yaw);
    const hl = t.mainLen * 0.5;
    // Main Street (2-lane paved commercial spine)
    roads.push({
      name: `${t.name} Main St`,
      kind: 'paved',
      half: 5.2,
      town: true,
      xz: [
        [t.x - ux * hl, t.z - uz * hl],
        [t.x, t.z],
        [t.x + ux * hl, t.z + uz * hl],
      ],
    });
    // Two perpendicular residential cross streets + quiet back residential loop street
    for (const along of [-hl * 0.45, hl * 0.45]) {
      const cx = t.x + ux * along, cz = t.z + uz * along;
      roads.push({
        name: `${t.name} Cross St`,
        kind: 'paved',
        half: 3.8,
        town: true,
        xz: [
          [cx - rx * 95, cz - rz * 95],
          [cx, cz],
          [cx + rx * 95, cz + rz * 95],
        ],
      });
    }
    // Residential parallel lane on the east/right side of Main St
    roads.push({
      name: `${t.name} Oak Ave`,
      kind: 'paved',
      half: 3.6,
      town: true,
      xz: [
        [t.x + rx * 68 - ux * (hl * 0.7), t.z + rz * 68 - uz * (hl * 0.7)],
        [t.x + rx * 68 + ux * (hl * 0.7), t.z + rz * 68 + uz * (hl * 0.7)],
      ],
    });
  }

  return roads;
}

/** Graded flat building pads for all 4 small town cores (passed to carvePads BEFORE buildTerrain!). */
export function buildRuralTownPads(): Pad[] {
  return RURAL_TOWNS.map((t) => ({
    x: t.x,
    z: t.z,
    w: 195,
    d: t.mainLen + 40,
    rot: t.yaw,
  }));
}

export interface RuralTownSolid { x: number; z: number; hw: number; hd: number; rot: number; kind: 'building' | 'pillar' }
export interface RuralTownBreakable { x: number; y: number; z: number; kind: 'pole' | 'fence'; radius: number }

export interface RuralTownsResult {
  group: THREE.Group;
  mapProxy: THREE.Group;
  solids: RuralTownSolid[];
  breakables: RuralTownBreakable[];
  counts: Record<string, number>;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pbr(stem: string, repX = 2, repY = 2, roughness = 0.86, metalness = 0.04, tileMeters = 3.6, tintHex?: number): THREE.MeshStandardMaterial {
  return buildRuralArchPbrMaterial(stem, { repX, repY, roughness, metalness, tileMeters, tintHex });
}

/** Build all 4 Zoned Michigan Rural Small Towns (GPU-instanced into ~14 draw calls total!). */
export function buildRuralTowns(opts: {
  ground: (x: number, z: number) => number;
  blocked: (x: number, z: number, r: number) => boolean;
  /** All rural & town road polylines so ZERO town buildings ever intersect any road or intersection. */
  roads?: { xz: number[][]; half?: number }[];
}): RuralTownsResult {
  const group = new THREE.Group();
  group.name = 'RuralSmallTowns';
  const mapProxy = new THREE.Group();
  mapProxy.name = 'RuralTownsMapProxy';
  const solids: RuralTownSolid[] = [];
  const breakables: RuralTownBreakable[] = [];
  const counts: Record<string, number> = { towns: 0, commercial: 0, civic: 0, agriIndustrial: 0, homes: 0, lamps: 0 };
  const rnd = makeRng(71299);

  // Build exact segment-distance spatial hash for ALL roads so no building footprint ever touches asphalt or an intersection!
  const ROAD_CELL = 40;
  type Seg = { ax: number; az: number; bx: number; bz: number; half: number };
  const segGrid = new Map<number, Seg[]>();
  const rKey = (cx: number, cz: number): number => (cx + 2048) * 4096 + (cz + 2048);
  for (const r of opts.roads ?? []) {
    const half = r.half ?? 4.8;
    for (let i = 0; i < r.xz.length - 1; i++) {
      const a = r.xz[i], b = r.xz[i + 1];
      const seg: Seg = { ax: a[0], az: a[1], bx: b[0], bz: b[1], half };
      const x0 = Math.floor((Math.min(a[0], b[0]) - 24) / ROAD_CELL);
      const x1 = Math.floor((Math.max(a[0], b[0]) + 24) / ROAD_CELL);
      const z0 = Math.floor((Math.min(a[1], b[1]) - 24) / ROAD_CELL);
      const z1 = Math.floor((Math.max(a[1], b[1]) + 24) / ROAD_CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = rKey(cx, cz);
        let arr = segGrid.get(k);
        if (!arr) { arr = []; segGrid.set(k, arr); }
        arr.push(seg);
      }
    }
  }
  const hitsAnyRoad = (x: number, z: number, radius: number): boolean => {
    const cx = Math.floor(x / ROAD_CELL), cz = Math.floor(z / ROAD_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = segGrid.get(rKey(cx + dx, cz + dz));
      if (!arr) continue;
      for (const s of arr) {
        const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l2));
        const px = s.ax + ex * t, pz = s.az + ez * t;
        const clearR = radius + s.half + 2.2;
        if ((x - px) * (x - px) + (z - pz) * (z - pz) < clearR * clearR) return true;
      }
    }
    return false;
  };
  const isSiteBlocked = (x: number, z: number, radius: number): boolean =>
    opts.blocked(x, z, radius) || hitsAnyRoad(x, z, radius);

  const brickMat = pbr('tex-shared-01-red-brick', 3, 2, 0.88, 0.03, 3.2);
  const orangeBrickMat = pbr('tex-shared-03-orange-brick', 3, 2, 0.88, 0.03, 3.2);
  const whiteClapMat = pbr('tex-shared-20-white-clapboard', 3, 2, 0.80, 0.02, 2.8);
  const timberMat = pbr('tex-shared-18-timber-siding', 3, 2, 0.86, 0.02, 3.0);
  const redTimberMat = pbr('tex-shared-19-red-timber', 3, 2, 0.88, 0.02, 3.2);
  const steelMat = pbr('tex-shared-21-corrugated-steel', 2, 2, 0.42, 0.78, 2.8);
  const shingleMat = pbr('tex-shared-22-asphalt-shingle', 3, 2, 0.90, 0.02, 2.6);
  const limestoneMat = pbr('tex-shared-04-limestone', 3, 2, 0.84, 0.03, 3.4);
  const awningMat = pbr('tex-shared-10-terracotta', 2, 1, 0.78, 0.02, 2.4, 0xb83428);
  const waterTowerMat = pbr('tex-shared-14-steel-panel', 2, 2, 0.45, 0.55, 3.8, 0xe2e8ee);
  const trimWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.62, metalness: 0.02 });
  const shutterMat = new THREE.MeshStandardMaterial({ color: 0x243b2f, roughness: 0.72, metalness: 0.02 });
  const doorWoodMat = pbr('tex-shared-18-timber-siding', 2, 2, 0.72, 0.04, 2.0, 0x6b4226);
  const signBoardMat = new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.48, metalness: 0.14 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x262d36, roughness: 0.42, metalness: 0.76 });
  const winGlowMat = buildRuralArchGlassMaterial('blue');
  const lampGlowMat = new THREE.MeshStandardMaterial({ color: 0xfff3cc, emissive: 0xffcb66, emissiveIntensity: 2.0, roughness: 0.25 });

  const brickM: THREE.Matrix4[] = [];
  const oBrickM: THREE.Matrix4[] = [];
  const whiteM: THREE.Matrix4[] = [];
  const timberM: THREE.Matrix4[] = [];
  const redBarnM: THREE.Matrix4[] = [];
  const steelM: THREE.Matrix4[] = [];
  const roofM: THREE.Matrix4[] = [];
  const stoneM: THREE.Matrix4[] = [];
  const awningM: THREE.Matrix4[] = [];
  const winM: THREE.Matrix4[] = [];
  const trimWhiteM: THREE.Matrix4[] = [];
  const shutterM: THREE.Matrix4[] = [];
  const doorWoodM: THREE.Matrix4[] = [];
  const signBoardM: THREE.Matrix4[] = [];
  const gableWhiteM: THREE.Matrix4[] = [];
  const gableTimberM: THREE.Matrix4[] = [];
  const gableRedM: THREE.Matrix4[] = [];
  const towerTankM: THREE.Matrix4[] = [];
  const towerLegM: THREE.Matrix4[] = [];
  const steepleM: THREE.Matrix4[] = [];
  const lampHeadM: THREE.Matrix4[] = [];
  const proxyM: THREE.Matrix4[] = [];
  // UV-locked front facade overlay buckets (hidden until Colab Omni/FLUX 2K rural textures are ingested via v4-manifest.json)
  const omniBuckets: Record<RuralArchetypeId, THREE.Matrix4[]> = {
    rural_storefront_brick: [],
    rural_storefront_diner: [],
    rural_depot_hall: [],
    rural_barn_red: [],
    rural_farmhouse_clapboard: [],
    rural_church_civic: [],
  };

  const lotM = new THREE.Matrix4();
  const pM = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const vP = new THREE.Vector3();
  const vS = new THREE.Vector3();

  const pushLocal = (list: THREE.Matrix4[], lx: number, ly: number, lz: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): void => {
    eul.set(rx, ry, rz);
    q.setFromEuler(eul);
    pM.compose(vP.set(lx, ly, lz), q, vS.set(sx, sy, sz));
    list.push(lotM.clone().multiply(pM));
  };

  /** Emit a real 3D framed multi-pane architectural window (stone lintel/sill, crisp white backing frame + mullion cross, glass pane, optional wood shutters). */
  const pushFramedWindow = (cx: number, cy: number, cz: number, ry: number, ww: number, wh: number, withShutters = false): void => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const addOff = (list: THREE.Matrix4[], ox: number, oy: number, oz: number, sx: number, sy: number, sz: number): void => {
      pushLocal(list, cx + ox * c + oz * s, cy + oy, cz - ox * s + oz * c, 0, ry, 0, sx, sy, sz);
    };
    // Single outer white sash frame backing + recessed glass pane + central cross mullions (3 trim instances instead of 6!)
    addOff(trimWhiteM, 0, 0, 0.04, ww + 0.22, wh + 0.24, 0.10);
    addOff(winM, 0, 0, 0.08, ww, wh, 0.06);
    addOff(trimWhiteM, 0, 0, 0.115, 0.07, wh, 0.05);
    addOff(trimWhiteM, 0, 0.06, 0.115, ww, 0.07, 0.05);
    // Stone lintel cap on commercial / brick walls
    addOff(stoneM, 0, wh * 0.5 + 0.18, 0.11, ww + 0.34, 0.16, 0.20);
    if (withShutters) {
      const sw = Math.min(0.46, ww * 0.36);
      addOff(shutterM, -ww * 0.5 - sw * 0.5 - 0.10, 0, 0.09, sw, wh + 0.04, 0.07);
      addOff(shutterM, ww * 0.5 + sw * 0.5 + 0.10, 0, 0.09, sw, wh + 0.04, 0.07);
    }
  };

  for (const town of RURAL_TOWNS) {
    counts.towns++;
    const ux = Math.sin(town.yaw), uz = Math.cos(town.yaw);
    const rx = Math.cos(town.yaw), rz = -Math.sin(town.yaw);
    const toWorld = (along: number, across: number): [number, number] => [
      town.x + ux * along + rx * across,
      town.z + uz * along + rz * across,
    ];

    // ── ZONE A: Main Street Commercial Storefronts (both sides of Main St, rich 3D brick pilasters, rhythmic sash windows, cornices, recessed doors & signboards!) ──
    for (const side of [-1, 1]) {
      for (let along = -town.mainLen * 0.38; along <= town.mainLen * 0.38; along += 24) {
        if (side === -1 && Math.abs(along) < 26) continue;
        const [bx, bz] = toWorld(along, side * 19.5);
        if (isSiteBlocked(bx, bz, 11.5)) continue;
        const by = opts.ground(bx, bz);
        const rot = town.yaw + (side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        lotM.makeTranslation(bx, by, bz).multiply(new THREE.Matrix4().makeRotationY(rot));
        const w = 13 + rnd() * 5, d = 11 + rnd() * 4, h = 6.2 + (rnd() > 0.42 ? 3.8 : 0);
        const wallBucket = town.theme === 'timber_woods'
          ? (rnd() > 0.35 ? timberM : brickM)
          : (rnd() > 0.5 ? brickM : oBrickM);
        // Stepped limestone plinth + main brick volume + projecting corner pilasters + molded roof cornice & parapet
        pushLocal(stoneM, 0, -0.7, 0, 0, 0, 0, w + 0.6, 1.8, d + 0.6);
        pushLocal(wallBucket, 0, h * 0.5, 0, 0, 0, 0, w, h, d);
        pushLocal(
          omniBuckets[wallBucket === oBrickM ? 'rural_storefront_diner' : 'rural_storefront_brick'],
          0, h * 0.5, d * 0.5 + 0.025, 0, 0, 0, w, h, 1,
        );
        for (const px of [-w * 0.5, w * 0.5]) {
          for (const pz of [-d * 0.5, d * 0.5]) {
            pushLocal(stoneM, px, h * 0.5, pz, 0, 0, 0, 0.52, h + 0.2, 0.52);
          }
        }
        // Horizontal limestone belt course between ground & 2nd floor + stepped cornice cap
        pushLocal(stoneM, 0, 4.15, d * 0.5 + 0.08, 0, 0, 0, w + 0.36, 0.28, 0.24);
        pushLocal(stoneM, 0, h + 0.30, 0, 0, 0, 0, w + 0.72, 0.52, d + 0.72);
        pushLocal(wallBucket, 0, h + 0.82, d * 0.5 - 0.28, 0, 0, 0, w + 0.20, 0.72, 0.56);
        // Painted fascia signboard + sloped canvas storefront awning + front valance
        pushLocal(signBoardM, 0, 4.72, d * 0.5 + 0.14, 0, 0, 0, w * 0.68, 0.88, 0.14);
        pushLocal(trimWhiteM, 0, 4.72, d * 0.5 + 0.22, 0, 0, 0, w * 0.64, 0.12, 0.04);
        pushLocal(awningM, 0, 3.35, d * 0.5 + 1.15, 0.30, 0, 0, w * 0.88, 0.14, 2.35);
        pushLocal(awningM, 0, 2.86, d * 0.5 + 2.24, 0, 0, 0, w * 0.88, 0.36, 0.08);
        // Central recessed timber entry door + transom + paired ground-floor display bays
        pushLocal(doorWoodM, 0, 1.25, d * 0.5 + 0.05, 0, 0, 0, 1.65, 2.45, 0.14);
        pushLocal(trimWhiteM, 0, 2.68, d * 0.5 + 0.08, 0, 0, 0, 1.85, 0.16, 0.16);
        const bayOff = w * 0.28;
        const bayW = Math.max(2.4, w * 0.28);
        pushFramedWindow(-bayOff, 1.75, d * 0.5, 0, bayW, 2.15, false);
        pushFramedWindow(bayOff, 1.75, d * 0.5, 0, bayW, 2.15, false);
        // Rhythmic upper-story sash windows with limestone lintels & sills (front + side return bays)
        if (h > 8) {
          const nWin = w > 15 ? 4 : 3;
          for (let wi = 0; wi < nWin; wi++) {
            const wx = -w * 0.36 + (wi / Math.max(1, nWin - 1)) * (w * 0.72);
            pushFramedWindow(wx, 7.15, d * 0.5, 0, 1.45, 2.15, false);
          }
          for (const sx of [-1, 1]) {
            pushFramedWindow(sx * d * 0.0 + sx * (w * 0.5), 7.15, d * 0.22, sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 1.35, 2.0, false);
            pushFramedWindow(sx * (w * 0.5), 7.15, -d * 0.22, sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 1.35, 2.0, false);
          }
        }
        pushLocal(proxyM, 0, h * 0.5, 0, 0, 0, 0, w, h, d);
        solids.push({ x: bx, z: bz, hw: w * 0.52, hd: d * 0.52, rot, kind: 'building' });
        counts.commercial++;
      }
      // Warm Main Street lamps (breakable!)
      for (let along = -town.mainLen * 0.45; along <= town.mainLen * 0.45; along += 34) {
        const [lx, lz] = toWorld(along, side * 7.2);
        if (opts.blocked(lx, lz, 2)) continue;
        const ly = opts.ground(lx, lz);
        lotM.makeTranslation(lx, ly, lz);
        pushLocal(towerLegM, 0, 2.7, 0, 0, 0, 0, 0.16, 5.4, 0.16);
        pushLocal(lampHeadM, 0, 5.5, 0, 0, 0, 0, 0.44, 0.44, 0.44);
        breakables.push({ x: lx, y: ly, z: lz, kind: 'pole', radius: 0.42 });
        counts.lamps++;
      }
    }

    // ── ZONE B: Civic Center (Village Church / Town Hall with portico columns, sealed gable peaks, framed windows & steeple + Water Tower) ──
    {
      const [cx, cz] = toWorld(0, -32);
      if (!isSiteBlocked(cx, cz, 14.5)) {
        const cy = opts.ground(cx, cz);
        const rot = town.yaw - Math.PI * 0.5;
        lotM.makeTranslation(cx, cy, cz).multiply(new THREE.Matrix4().makeRotationY(rot));
        pushLocal(stoneM, 0, -0.6, 0, 0, 0, 0, 14.6, 1.8, 21.6);
        pushLocal(whiteM, 0, 4.2, 0, 0, 0, 0, 13.5, 8.4, 20);
        pushLocal(omniBuckets.rural_church_civic, 0, 4.2, 10.025, 0, 0, 0, 13.5, 8.4, 1);
        // Sealed triangular clapboard gable infill (front & rear) + pitched shingle roof
        pushLocal(gableWhiteM, 0, 10.35, 0, 0, 0, 0, 13.5, 3.9, 20.0);
        pushLocal(roofM, -3.7, 10.2, 0, 0, 0, 0.52, 8.8, 0.35, 21.2);
        pushLocal(roofM, 3.7, 10.2, 0, 0, 0, -0.52, 8.8, 0.35, 21.2);
        // Front entry portico: stone steps, 4 fluted white columns, pediment beam & double wood doors
        pushLocal(stoneM, 0, 0.35, 11.4, 0, 0, 0, 8.2, 0.75, 2.8);
        for (const colX of [-3.3, -1.2, 1.2, 3.3]) {
          pushLocal(trimWhiteM, colX, 3.4, 12.1, 0, 0, 0, 0.42, 5.8, 0.42);
        }
        pushLocal(trimWhiteM, 0, 6.45, 11.3, 0, 0, 0, 8.2, 0.55, 2.8);
        pushLocal(doorWoodM, 0, 2.15, 10.05, 0, 0, 0, 2.3, 3.3, 0.18);
        // Rhythmic tall framed windows along both side facades
        for (const sx of [-1, 1]) {
          for (const wz of [-6.5, -2.2, 2.2, 6.5]) {
            pushFramedWindow(sx * 6.75, 4.4, wz, sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 1.55, 3.4, false);
          }
        }
        pushLocal(whiteM, 0, 13.6, 6.5, 0, 0, 0, 3.8, 6.4, 3.8);
        pushLocal(trimWhiteM, 0, 16.85, 6.5, 0, 0, 0, 4.2, 0.35, 4.2);
        pushLocal(steepleM, 0, 21.0, 6.5, 0, 0, 0, 2.3, 9.4, 2.3);
        pushLocal(proxyM, 0, 10, 0, 0, 0, 0, 14, 20, 20);
        solids.push({ x: cx, z: cz, hw: 7.2, hd: 10.5, rot, kind: 'building' });
        counts.civic++;
      }
      // Elevated Municipal Water Tower
      const [wx, wz] = toWorld(-55, -52);
      if (!isSiteBlocked(wx, wz, 11)) {
        const wy = opts.ground(wx, wz);
        lotM.makeTranslation(wx, wy, wz);
        for (const [lx, lz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
          pushLocal(towerLegM, lx, 11.5, lz, 0, 0, 0, 0.45, 23, 0.45);
        }
        pushLocal(towerLegM, 0, 11.5, 0, 0, 0, 0, 1.2, 23, 1.2);
        pushLocal(towerTankM, 0, 25.5, 0, 0, 0, 0, 5.4, 7.6, 5.4);
        pushLocal(steepleM, 0, 30.8, 0, 0, 0, 0, 5.6, 3.2, 5.6);
        pushLocal(proxyM, 0, 16, 0, 0, 0, 0, 10, 32, 10);
        solids.push({ x: wx, z: wz, hw: 4.5, hd: 4.5, rot: 0, kind: 'pillar' });
        counts.civic++;
      }
    }

    // ── ZONE C: Edge Agri-Industrial Zone (Grain Elevators / Co-Op Feed Mill / Timber Sawmill) ──
    {
      const [ix, iz] = toWorld(town.mainLen * 0.46, -42);
      if (!isSiteBlocked(ix, iz, 18)) {
        const iy = opts.ground(ix, iz);
        lotM.makeTranslation(ix, iy, iz).multiply(new THREE.Matrix4().makeRotationY(town.yaw));
        if (town.theme === 'timber_woods') {
          pushLocal(redBarnM, 0, 4.0, 0, 0, 0, 0, 16, 8, 28);
          pushLocal(omniBuckets.rural_barn_red, 0, 4.0, 14.025, 0, 0, 0, 16, 8, 1);
          pushLocal(gableRedM, 0, 9.6, 0, 0, 0, 0, 16, 3.2, 28);
          pushLocal(steelM, -4.4, 9.5, 0, 0, 0, 0.38, 9.2, 0.35, 29.2);
          pushLocal(steelM, 4.4, 9.5, 0, 0, 0, -0.38, 9.2, 0.35, 29.2);
          pushLocal(timberM, 14, 1.8, -6, 0, 0, 0, 6.5, 3.6, 12);
          pushLocal(timberM, 14, 1.8, 8, 0, 0, 0, 6.5, 3.6, 12);
        } else {
          pushLocal(stoneM, 0, 12, 0, 0, 0, 0, 14, 24, 14);
          pushLocal(omniBuckets.rural_depot_hall, 0, 12, 7.025, 0, 0, 0, 14, 24, 1);
          pushLocal(steelM, 0, 27, 0, 0, 0, 0, 9, 6.5, 11);
          pushLocal(trimWhiteM, 0, 24.1, 0, 0, 0, 0, 14.6, 0.45, 14.6);
          for (const sz of [-12, 12]) {
            pushLocal(towerTankM, 0, 11, sz, 0, 0, 0, 4.4, 22, 4.4);
            pushLocal(steepleM, 0, 23.2, sz, 0, 0, 0, 4.6, 2.6, 4.6);
          }
          pushLocal(redBarnM, -14, 3.5, 0, 0, 0, 0, 12, 7, 18);
          pushLocal(omniBuckets.rural_barn_red, -14, 3.5, 9.025, 0, 0, 0, 12, 7, 1);
          pushLocal(gableRedM, -14, 8.4, 0, 0, 0, 0, 12, 2.8, 18);
          pushLocal(roofM, -17.2, 8.3, 0, 0, 0, 0.42, 7.2, 0.32, 18.8);
          pushLocal(roofM, -10.8, 8.3, 0, 0, 0, -0.42, 7.2, 0.32, 18.8);
        }
        pushLocal(proxyM, 0, 13, 0, 0, 0, 0, 22, 26, 26);
        solids.push({ x: ix, z: iz, hw: 14, hd: 16, rot: town.yaw, kind: 'building' });
        counts.agriIndustrial++;
      }
    }

    // ── ZONE D: Quiet Residential Side-Street Neighborhoods (Sealed gables, covered front porches, shuttered multi-pane windows & brick chimneys!) ──
    for (const across of [48, 86, -68]) {
      for (let along = -town.mainLen * 0.36; along <= town.mainLen * 0.36; along += 28) {
        const [hx, hz] = toWorld(along + (rnd() - 0.5) * 5, across + (rnd() - 0.5) * 4);
        if (isSiteBlocked(hx, hz, 10.5)) continue;
        const hy = opts.ground(hx, hz);
        const hRot = town.yaw + (across > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) + (rnd() - 0.5) * 0.14;
        lotM.makeTranslation(hx, hy, hz).multiply(new THREE.Matrix4().makeRotationY(hRot));
        const hw = 9.5 + rnd() * 3.5, hd = 8.0 + rnd() * 3.0, hh = 4.4 + rnd() * 1.6;
        const isTimber = town.theme === 'timber_woods' ? rnd() > 0.35 : rnd() <= 0.42;
        const wList = isTimber ? timberM : whiteM;
        const gList = isTimber ? gableTimberM : gableWhiteM;
        // Stone foundation + clapboard/timber body + sealed triangular gable ends
        pushLocal(stoneM, 0, -0.6, 0, 0, 0, 0, hw + 0.55, 1.6, hd + 0.55);
        pushLocal(wList, 0, hh * 0.5, 0, 0, 0, 0, hw, hh, hd);
        pushLocal(omniBuckets.rural_farmhouse_clapboard, 0, hh * 0.5, hd * 0.5 + 0.025, 0, 0, 0, hw, hh, 1);
        const gPeakH = (hd * 0.5) * Math.tan(0.46);
        pushLocal(gList, 0, hh + gPeakH * 0.5, 0, 0, Math.PI * 0.5, 0, hd, gPeakH, hw);
        const sLen = (hd * 0.5 + 0.85) / Math.cos(0.46);
        const rY = hh + Math.sin(0.46) * (sLen * 0.5) - 0.14;
        pushLocal(roofM, 0, rY, -hd * 0.25 - 0.14, -0.46, 0, 0, hw + 1.0, 0.28, sLen);
        pushLocal(roofM, 0, rY, hd * 0.25 + 0.14, 0.46, 0, 0, hw + 1.0, 0.28, sLen);
        // Brick chimney rising cleanly above the roof ridge
        pushLocal(brickM, hw * 0.26, hh + gPeakH + 0.65, -hd * 0.15, 0, 0, 0, 0.95, 2.4, 0.95);
        // Covered front porch (deck, timber roof overhang, 3 white columns & front wood entry door)
        const porchW = hw * 0.56;
        pushLocal(stoneM, 0, 0.22, hd * 0.5 + 1.15, 0, 0, 0, porchW, 0.45, 2.3);
        pushLocal(roofM, 0, 3.05, hd * 0.5 + 1.25, 0.22, 0, 0, porchW + 0.4, 0.18, 2.65);
        for (const px of [-porchW * 0.44, 0, porchW * 0.44]) {
          pushLocal(trimWhiteM, px, 1.62, hd * 0.5 + 2.15, 0, 0, 0, 0.18, 2.55, 0.18);
        }
        pushLocal(doorWoodM, 0, 1.42, hd * 0.5 + 0.04, 0, 0, 0, 1.12, 2.20, 0.12);
        // Paired shuttered front & side windows
        pushFramedWindow(-hw * 0.30, hh * 0.56, hd * 0.5, 0, 1.35, 1.55, true);
        pushFramedWindow(hw * 0.30, hh * 0.56, hd * 0.5, 0, 1.35, 1.55, true);
        pushFramedWindow(-hw * 0.5, hh * 0.56, 0, -Math.PI * 0.5, 1.35, 1.55, true);
        pushFramedWindow(hw * 0.5, hh * 0.56, 0, Math.PI * 0.5, 1.35, 1.55, true);
        pushLocal(proxyM, 0, hh * 0.6, 0, 0, 0, 0, hw, hh + 2, hd);
        solids.push({ x: hx, z: hz, hw: hw * 0.52, hd: hd * 0.52, rot: hRot, kind: 'building' });
        counts.homes++;
      }
    }
  }

  const emit = (target: THREE.Group, geo: THREE.BufferGeometry, list: THREE.Matrix4[], mat: THREE.Material, cast = true, recv = true): void => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = cast;
    im.receiveShadow = recv;
    target.add(im);
  };

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  const unitCone = new THREE.ConeGeometry(1, 1, 12);
  // Triangular gable-end prism (width=1 along X, height=1 along Y [-0.5..+0.5], depth=1 along Z)
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-0.5, -0.5);
  gableShape.lineTo(0.5, -0.5);
  gableShape.lineTo(0, 0.5);
  gableShape.closePath();
  const unitGable = new THREE.ExtrudeGeometry(gableShape, { depth: 1, bevelEnabled: false });
  unitGable.translate(0, 0, -0.5);

  emit(group, unitBox, brickM, brickMat, true, true);
  emit(group, unitBox, oBrickM, orangeBrickMat, true, true);
  emit(group, unitBox, whiteM, whiteClapMat, true, true);
  emit(group, unitBox, timberM, timberMat, true, true);
  emit(group, unitBox, redBarnM, redTimberMat, true, true);
  emit(group, unitBox, steelM, steelMat, true, true);
  emit(group, unitBox, roofM, shingleMat, true, true);
  emit(group, unitBox, stoneM, limestoneMat, true, true);
  emit(group, unitBox, awningM, awningMat, true, true);
  emit(group, unitBox, winM, winGlowMat, false, false);
  emit(group, unitBox, trimWhiteM, trimWhiteMat, false, true);
  emit(group, unitBox, shutterM, shutterMat, false, true);
  emit(group, unitBox, doorWoodM, doorWoodMat, false, true);
  emit(group, unitBox, signBoardM, signBoardMat, false, true);
  emit(group, unitGable, gableWhiteM, whiteClapMat, true, true);
  emit(group, unitGable, gableTimberM, timberMat, true, true);
  emit(group, unitGable, gableRedM, redTimberMat, true, true);
  emit(group, unitCyl, towerTankM, waterTowerMat, true, true);
  emit(group, unitCyl, towerLegM, darkMetalMat, false, false);
  emit(group, unitCone, steepleM, waterTowerMat, true, false);
  emit(group, unitBox, lampHeadM, lampGlowMat, false, false);

  // UV-locked Colab Omni/FLUX 2K rural facade overlays (hidden until `v4-manifest.json` lists `ruralTextures`)
  const unitFacadePlane = new THREE.PlaneGeometry(1, 1);
  for (const [arch, list] of Object.entries(omniBuckets) as [RuralArchetypeId, THREE.Matrix4[]][]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(unitFacadePlane, trimWhiteMat, list.length);
    for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = false;
    im.receiveShadow = true;
    registerRuralOmniFacadeMesh(arch, im);
    group.add(im);
  }

  // Lightweight 1-draw-call Map Overview rural town proxy so all 4 towns stand out crisply from Map Overview!
  emit(mapProxy, unitBox, proxyM, brickMat, false, false);

  return { group, mapProxy, solids, breakables, counts };
}
