// games/apex/src/ironportSignatureTowers.ts
//
// Bespoke Sculpted 3D Architectural Landmarks for Downtown Ironport, Civic Riverfront & Track Corridors
// modeled directly from Kenne's multi-angle architectural asset sheets & night hero shots:
//   1. Grand Metropolis Riverfront Resort (curved twin terraced towers + SkyPark infinity bridge + biodomes + Supertree canopies)
//   2. Project: Helix Tower (twisting double-helix glass skyscraper + 4 helical ribbons + sky-terrace bridges)
//   3. Futuristic Glass Spiral Skyscraper (tapered cylindrical glass spire + 4 silver-cyan helical fins + wave podium + helipad)
//   4. Biomorphic Organic Bio-Tower (curving sculptural white exoskeleton + terraced sky-gardens + warm gold terrace rims)
//   5. Stepped Pyramid Glass High-Rise SP-X900 (7-tier glass ziggurat + ice-white setback rim accents + needle spire)
//   6. Cylindrical Tubular Steel Diagrid Tower (true 3D cylindrical glass shaft + exposed silver steel diagrid + crown ring)
//   7. Sculptural Twisted Pillar Skyscraper (4 brushed-titanium twisting corner mega-pillars + gold cove channels + crown lattice)
//   8. Floating Cantilever Tower (central core spine + 6 cantilevered truss sky-garden boxes + warm cedar lit soffits)
//   9. Project: Fragmented Monolith (deconstructivist shifted prism tower + origami crystal podium + cyan/magenta/gold chamfer ribs)
//  10. Cantilever Arch Loop Tower (leaning twin-leg diagrid sky-bridge), Obsidian Monolith & Riverfront Eco-Tower Pavilion!
//
// Architectural Lighting Rule:
//   - EVERY tower has its OWN architect-specific night lighting design (NEVER uniform neon boxes!)
//   - Night accents stay strictly OFF in daytime (smoothstep(0.26, 0.78, uNight) -> anodized dark metal trim in daylight,
//     crisp luminous architectural lighting at dusk & night!)
//   - All landmarks merge cleanly into ~5 shared GPU draw calls -> maintains silky 25-35+ FPS on Intel xe-lpg WebGPU!

import * as THREE from 'three';
import * as THREE_GPU from 'three/webgpu';
import { float, mix, smoothstep, vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  apexHeadlightSpotTsl,
  createApexGlassTslMaterial,
  sanitizeGeometryForWebGPU,
  type ApexTslSharedUniforms,
} from './tsl/apexMaterialsTsl';
import { getRegionTslContext, isRegionWebGpuActive } from './tsl/webgpuRuntime';

export type SignatureTowerKind =
  | 'grand_metropolis_resort'
  | 'helix_tower'
  | 'spiral_glass_tower'
  | 'biomorphic_bio_tower'
  | 'stepped_pyramid_tower'
  | 'tubular_diagrid_tower'
  | 'twisted_pillar_tower'
  | 'floating_cantilever_tower'
  | 'fragmented_monolith'
  | 'cantilever_arch_loop'
  | 'obsidian_monolith'
  | 'eco_tower_pavilion';

export interface SignaturePlacementSpec {
  id: string;
  kind: SignatureTowerKind;
  x: number;
  z: number;
  rotY: number;
  scale?: number;
  clearRadius: number;
}

export interface SignatureTowersOpts {
  groundAt: (x: number, z: number) => number;
  isWater: (x: number, z: number) => boolean;
  onCourse: (x: number, z: number, pad: number) => boolean;
  avoidPoints?: readonly { x: number; z: number; r: number }[];
  shore?: readonly number[][];
}

export interface SignatureTowerFootprint {
  id: string;
  kind: SignatureTowerKind;
  x: number;
  z: number;
  radius: number;
}

interface BatchBuckets {
  blueGlass: THREE.BufferGeometry[];
  warmGlass: THREE.BufferGeometry[];
  obsidianGlass: THREE.BufferGeometry[];
  structure: THREE.BufferGeometry[]; // vertex-colored titanium, stone, cedar soffits, greenery, steel trusses
  nightAccent: THREE.BufferGeometry[]; // vertex-colored night-ONLY architectural LED lines (dark metal in daylight!)
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const _col = new THREE.Color();

function paintGeo(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _col.setHex(hex);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _col.r;
    arr[i * 3 + 1] = _col.g;
    arr[i * 3 + 2] = _col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Normalize geometry to non-indexed with guaranteed position + normal (+ uv or color as needed) for safe mergeGeometries. */
function normalizeGeo(raw: THREE.BufferGeometry, wantColor: boolean, hex = 0xffffff): THREE.BufferGeometry {
  const g = raw.index ? raw.toNonIndexed() : raw.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (wantColor) {
    paintGeo(g, hex);
  } else if (g.attributes.color) {
    g.deleteAttribute('color');
  }
  // Keep only exact shared attribute set so mergeGeometries never returns null
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(wantColor && k === 'color')) {
      g.deleteAttribute(k);
    }
  }
  return g;
}

class TowerBuilder {
  private readonly rootMat: THREE.Matrix4;
  private readonly b: BatchBuckets;

  constructor(b: BatchBuckets, x: number, y: number, z: number, rotY: number, scale = 1) {
    this.b = b;
    _q.setFromAxisAngle(_up, rotY);
    _s.set(scale, scale, scale);
    this.rootMat = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, _s);
  }

  private push(
    bucket: keyof BatchBuckets,
    geo: THREE.BufferGeometry,
    lx: number, ly: number, lz: number,
    rx = 0, ry = 0, rz = 0,
    sx = 1, sy = 1, sz = 1,
    hex = 0xd8dce4,
  ): void {
    const wantColor = bucket === 'structure' || bucket === 'nightAccent';
    const g = normalizeGeo(geo, wantColor, hex);
    geo.dispose();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m4.compose(_p.set(lx, ly, lz), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    g.applyMatrix4(this.rootMat);
    this.b[bucket].push(g);
  }

  box(bucket: keyof BatchBuckets, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, hex = 0xd8dce4, rx = 0, rz = 0): void {
    this.push(bucket, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz, 1, 1, 1, hex);
  }

  cyl(bucket: keyof BatchBuckets, rt: number, rb: number, h: number, segs: number, x: number, y: number, z: number, ry = 0, hex = 0xd8dce4, sx = 1, sz = 1, open = false): void {
    this.push(bucket, new THREE.CylinderGeometry(rt, rb, h, segs, 1, open), x, y, z, 0, ry, 0, sx, 1, sz, hex);
  }

  torus(bucket: keyof BatchBuckets, r: number, tube: number, segs: number, x: number, y: number, z: number, hex = 0x88e8ff, sx = 1, sz = 1): void {
    this.push(bucket, new THREE.TorusGeometry(r, tube, 6, segs), x, y, z, Math.PI / 2, 0, 0, sx, sz, 1, hex);
  }

  dome(bucket: keyof BatchBuckets, r: number, x: number, y: number, z: number, hex = 0xc8eeff, sy = 0.72): void {
    this.push(bucket, new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), x, y, z, 0, 0, 0, 1, sy, 1, hex);
  }

  /** Place a structural or glowing beam connecting 3D local points A -> B. */
  strut(bucket: keyof BatchBuckets, ax: number, ay: number, az: number, bx: number, by: number, bz: number, thickness: number, hex = 0xd8dce4): void {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    const g = normalizeGeo(new THREE.BoxGeometry(thickness, len, thickness), bucket === 'structure' || bucket === 'nightAccent', hex);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    _q.setFromUnitVectors(_up, dir);
    _m4.compose(_p.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5), _q, _s.set(1, 1, 1));
    g.applyMatrix4(_m4);
    g.applyMatrix4(this.rootMat);
    this.b[bucket].push(g);
  }
}

// =============================================================================
// 10 BESPOKE ARCHITECTURAL LANDMARKS (FROM USER ASSET SHEETS & NIGHT HERO SHOTS)
// =============================================================================

/** 1. Grand Metropolis Riverfront Resort (Marina Bay × Detroit Waterfront Skypark + Twin Curved Towers + Biodomes + Supertrees) */
function buildGrandMetropolisResort(tb: TowerBuilder): void {
  // Multi-level sweeping glass & limestone resort podium with terraced waterfront promenades
  tb.box('structure', 96, 2.2, 48, 0, 1.1, 0, 0, 0xd4ccbe);
  tb.box('warmGlass', 90, 9.5, 42, 0, 6.8, 0, 0);
  tb.box('structure', 94, 1.1, 46, 0, 12.0, 0, 0, 0xe4dfd4);
  tb.box('nightAccent', 94.4, 0.35, 46.4, 0, 11.4, 0, 0, 0xffd28a); // warm podium soffit ribbon
  // Upper podium terrace & glowing turquoise pool deck
  tb.box('warmGlass', 78, 6.5, 34, 0, 15.8, -1, 0);
  tb.box('structure', 82, 1.0, 38, 0, 19.4, -1, 0, 0xe6e2d8);
  tb.box('nightAccent', 36, 0.25, 11, 0, 20.0, 11, 0, 0x26e8ff); // glowing infinity resort pool on podium!
  // Lush terrace greenery rims
  tb.box('structure', 80, 1.2, 3.2, 0, 20.5, 16.5, 0, 0x2f6b3a);
  tb.box('structure', 80, 1.2, 3.2, 0, 20.5, -18.5, 0, 0x2f6b3a);

  // Twin sweeping curved stepped hotel towers rising from left & right wings
  for (const side of [-1, 1]) {
    const baseX = side * 26;
    const tiers = 10;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const y = 20 + i * 6.8;
      const w = 24 - t * 4.5;
      const d = 17 - t * 2.5;
      const curveX = baseX - side * Math.sin(t * Math.PI) * 3.8;
      const curveZ = Math.cos(t * Math.PI) * 2.4 * side;
      const yaw = side * (0.18 - t * 0.32);
      tb.box('warmGlass', w, 6.2, d, curveX, y + 3.1, curveZ, yaw);
      // Terraced white architectural balcony slabs + subtle champagne rim glow at night
      tb.box('structure', w + 1.8, 0.72, d + 1.8, curveX, y + 6.4, curveZ, yaw, 0xe8e4dc);
      if (i % 2 === 1) {
        tb.box('nightAccent', w + 2.0, 0.22, d + 2.0, curveX, y + 6.05, curveZ, yaw, 0xffd58f);
      }
    }
  }

  // Iconic Cantilevered Rooftop SkyPark Bridge spanning both curved towers (at y = 89..95 m)
  tb.box('structure', 86, 3.2, 18.5, 0, 89.5, 0, 0, 0xd8dce2);
  tb.box('warmGlass', 78, 3.8, 14.0, 0, 92.8, 0, 0);
  tb.box('structure', 88, 1.1, 19.5, 0, 95.1, 0, 0, 0xeef2f6);
  // Glowing cyan infinity sky-pool + warm sky-deck edge halo!
  tb.box('nightAccent', 88.6, 0.42, 20.0, 0, 88.2, 0, 0, 0x38e4ff);
  tb.box('nightAccent', 52, 0.30, 8.5, 0, 95.8, 2.0, 0, 0x20dcff);
  // SkyPark rooftop garden canopies
  for (const gx of [-32, -16, 16, 32]) {
    tb.cyl('structure', 3.4, 2.0, 2.6, 8, gx, 97.0, -4.5, 0, 0x336e3b);
  }

  // Twin Glowing Glass Geodesic Biodomes & 3 Illuminated Supertree Canopies in front waterfront plaza!
  for (const [dx, dz, rad] of [[-46, 32, 13.5], [-24, 40, 10.5]] as const) {
    tb.dome('blueGlass', rad, dx, 0.4, dz, 0x88ccff, 0.68);
    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI;
      tb.torus('nightAccent', rad + 0.15, 0.18, 16, dx, 0.6, dz, 0xffe4a8, 1, 1);
      void a;
    }
    tb.torus('structure', rad + 0.35, 0.45, 18, dx, 0.6, dz, 0xc8d0da);
  }
  for (const [sx, sz, sh] of [[32, 38, 26], [46, 32, 32], [56, 22, 24]] as const) {
    tb.cyl('structure', 1.2, 2.8, sh * 0.72, 10, sx, sh * 0.36, sz, 0, 0x355c42);
    tb.cyl('structure', 8.5, 1.8, sh * 0.28, 12, sx, sh * 0.84, sz, 0, 0x4b5c6e);
    tb.torus('nightAccent', 8.6, 0.32, 16, sx, sh * 0.96, sz, 0x8858ff);
    tb.torus('nightAccent', 5.2, 0.22, 14, sx, sh * 0.74, sz, 0x30e8ff);
  }
}

/** 2. Project: Helix Tower — Twisting Double-Helix Skyscraper (4 helical structural ribbons + sky-terrace bridges) */
function buildHelixTower(tb: TowerBuilder): void {
  // Undulating circular luxury glass podium
  tb.cyl('warmGlass', 26, 28, 11, 20, 0, 5.5, 0, 0);
  tb.cyl('structure', 28.5, 29.0, 1.2, 20, 0, 11.4, 0, 0, 0xe2e6ec);
  tb.torus('nightAccent', 28.6, 0.28, 24, 0, 11.0, 0, 0xffe0a0);

  const H = 178;
  const segs = 22;
  const rX = 16.5;
  const rZ = 11.8;
  const totalTwist = Math.PI * 0.92;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const y0 = 11 + t * (H - 11);
    const stepH = (H - 11) / segs;
    const ang = t * totalTwist;
    const pinch = 1 - Math.sin(t * Math.PI) * 0.08;
    tb.cyl('blueGlass', rX * pinch, rX * pinch, stepH + 0.15, 14, 0, y0 + stepH * 0.5, 0, ang, 0xffffff, 1, rZ / rX);
    if (i % 4 === 2) {
      // Sculpted recessed terrace atrium deck cutting through the double helix
      tb.cyl('structure', rX * pinch * 1.06, rX * pinch * 1.06, 0.9, 14, 0, y0, 0, ang, 0xe0e4ea, 1, rZ / rX);
      tb.cyl('structure', rX * pinch * 0.96, rX * pinch * 0.96, 1.1, 10, 0, y0 + 0.8, 0, ang, 0x356b3e, 1, rZ / rX);
    }
  }
  // 4 Continuous Sweeping 3D Helical Structural Ribbons + alternating Ice-Cyan & Warm-Gold Night LED channels!
  for (let rib = 0; rib < 4; rib++) {
    const baseA = (rib / 4) * Math.PI * 2;
    const ledHex = rib % 2 === 0 ? 0x52e0ff : 0xffd180;
    const steps = 26;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const a0 = baseA + t0 * totalTwist, a1 = baseA + t1 * totalTwist;
      const y0 = 11 + t0 * (H - 11), y1 = 11 + t1 * (H - 11);
      const p0 = 1.04 - Math.sin(t0 * Math.PI) * 0.08, p1 = 1.04 - Math.sin(t1 * Math.PI) * 0.08;
      const x0 = Math.cos(a0) * rX * p0, z0 = Math.sin(a0) * rZ * p0;
      const x1 = Math.cos(a1) * rX * p1, z1 = Math.sin(a1) * rZ * p1;
      tb.strut('structure', x0, y0, z0, x1, y1, z1, 1.35, 0xe4e8ef);
      tb.strut('nightAccent', x0 * 1.03, y0, z0 * 1.03, x1 * 1.03, y1, z1 * 1.03, 0.42, ledHex);
    }
  }
  // Sculpted double-arc crown halo
  tb.torus('structure', rX * 0.95, 0.85, 20, 0, H, 0, 0xdde2ea, 1, rZ / rX);
  tb.torus('nightAccent', rX * 0.98, 0.34, 20, 0, H + 0.5, 0, 0x62e5ff, 1, rZ / rX);
}

/** 3. Futuristic Glass Spiral Skyscraper (tapered spiral glass cylinder + 4 silver-cyan helical fins + wave podium + helipad) */
function buildSpiralGlassTower(tb: TowerBuilder): void {
  // Undulating wave podium canopy
  tb.cyl('warmGlass', 25, 27, 9.5, 22, 0, 4.75, 0, 0);
  tb.cyl('structure', 29.5, 28.0, 1.4, 22, 0, 10.2, 0, 0, 0xe8edf2, 1.15, 0.92);
  tb.torus('nightAccent', 29.0, 0.30, 24, 0, 10.4, 0, 0x82ecff, 1.15, 0.92);

  const H = 160;
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const y0 = 10 + t * (H - 10);
    const stepH = (H - 10) / segs;
    const rad = 16.5 * (1 - t * 0.22);
    tb.cyl('blueGlass', rad * 0.98, rad, stepH + 0.12, 18, 0, y0 + stepH * 0.5, 0, t * 1.2);
  }
  // 4 Sweeping Spiral Exo-Fins glowing crisp ice-cyan at night
  for (let f = 0; f < 4; f++) {
    const baseA = (f / 4) * Math.PI * 2;
    const steps = 24;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const a0 = baseA + t0 * Math.PI * 1.35, a1 = baseA + t1 * Math.PI * 1.35;
      const r0 = 17.2 * (1 - t0 * 0.22), r1 = 17.2 * (1 - t1 * 0.22);
      const y0 = 10 + t0 * (H - 10), y1 = 10 + t1 * (H - 10);
      tb.strut('structure', Math.cos(a0) * r0, y0, Math.sin(a0) * r0, Math.cos(a1) * r1, y1, Math.sin(a1) * r1, 1.15, 0xd8e2ec);
      tb.strut('nightAccent', Math.cos(a0) * (r0 + 0.45), y0, Math.sin(a0) * (r0 + 0.45), Math.cos(a1) * (r1 + 0.45), y1, Math.sin(a1) * (r1 + 0.45), 0.36, 0x6ae6ff);
    }
  }
  // Crown ring & rooftop helipad
  tb.torus('structure', 13.0, 0.9, 20, 0, H, 0, 0xdce4ee);
  tb.torus('nightAccent', 13.2, 0.32, 20, 0, H + 0.6, 0, 0x80eeff);
  tb.cyl('structure', 9.5, 9.5, 0.6, 16, 0, H + 0.2, 0, 0, 0x454d58);
  tb.torus('nightAccent', 7.2, 0.22, 16, 0, H + 0.65, 0, 0xffd570);
}

/** 4. Biomorphic Organic Bio-Tower (curving white sculptural exoskeleton + warm champagne-gold terraced ribbons + sky-gardens) */
function buildBiomorphicBioTower(tb: TowerBuilder): void {
  // Triple-wing organic terraced podium
  for (let w = 0; w < 3; w++) {
    const a = (w / 3) * Math.PI * 2;
    const wx = Math.cos(a) * 18, wz = Math.sin(a) * 18;
    tb.cyl('warmGlass', 14, 15, 11, 14, wx, 5.5, wz, a, 0xffffff, 1.35, 0.85);
    tb.cyl('structure', 15.2, 15.8, 0.9, 14, wx, 11.3, wz, a, 0xf0ebe2, 1.35, 0.85);
    tb.torus('nightAccent', 15.4, 0.26, 18, wx, 11.0, wz, 0xffd796, 1.35, 0.85);
    tb.cyl('structure', 13.5, 13.5, 1.1, 12, wx, 12.2, wz, a, 0x356f3d, 1.25, 0.78);
  }
  const H = 152;
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const y = 11 + t * (H - 11);
    const stepH = (H - 11) / segs;
    const bulge = 1 + Math.sin(t * Math.PI) * 0.14 - t * 0.18;
    const swayX = Math.sin(t * Math.PI * 1.2) * 3.0;
    const swayZ = Math.cos(t * Math.PI * 1.2) * 2.2;
    tb.cyl('warmGlass', 14.5 * bulge, 14.5 * bulge, stepH + 0.12, 16, swayX, y + stepH * 0.5, swayZ, t * 0.8, 0xffffff, 1.12, 0.88);
    if (i % 3 === 1) {
      tb.cyl('structure', 15.4 * bulge, 15.4 * bulge, 0.8, 16, swayX, y + stepH, swayZ, t * 0.8, 0xf2ede4, 1.12, 0.88);
      tb.torus('nightAccent', 15.6 * bulge, 0.24, 18, swayX, y + stepH - 0.15, swayZ, 0xffd68e, 1.12, 0.88);
    }
  }
  // 5 Organic White Parametric Curving Ribs wrapping the entire tower up to a sculpted petal crown
  for (let r = 0; r < 5; r++) {
    const baseA = (r / 5) * Math.PI * 2;
    const steps = 22;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const b0 = 1 + Math.sin(t0 * Math.PI) * 0.14 - t0 * 0.18;
      const b1 = 1 + Math.sin(t1 * Math.PI) * 0.14 - t1 * 0.18;
      const a0 = baseA + t0 * Math.PI * 0.85, a1 = baseA + t1 * Math.PI * 0.85;
      const sx0 = Math.sin(t0 * Math.PI * 1.2) * 3.0, sz0 = Math.cos(t0 * Math.PI * 1.2) * 2.2;
      const sx1 = Math.sin(t1 * Math.PI * 1.2) * 3.0, sz1 = Math.cos(t1 * Math.PI * 1.2) * 2.2;
      const x0 = sx0 + Math.cos(a0) * 16.0 * b0 * 1.12, z0 = sz0 + Math.sin(a0) * 16.0 * b0 * 0.88;
      const x1 = sx1 + Math.cos(a1) * 16.0 * b1 * 1.12, z1 = sz1 + Math.sin(a1) * 16.0 * b1 * 0.88;
      const y0 = 11 + t0 * (H - 11), y1 = 11 + t1 * (H - 11);
      tb.strut('structure', x0, y0, z0, x1, y1, z1, 1.35, 0xf2eee6);
      tb.strut('nightAccent', x0 * 1.02, y0, z0 * 1.02, x1 * 1.02, y1, z1 * 1.02, 0.34, 0xffe0a2);
    }
  }
}

/** 5. Stepped Pyramid Glass High-Rise SP-X900 (7-tier glass ziggurat + cool-white setback edge rims + needle spire) */
function buildSteppedPyramidTower(tb: TowerBuilder): void {
  const tiers: Array<[number, number, number]> = [
    [48, 48, 16],
    [41, 41, 22],
    [34, 34, 24],
    [27, 27, 25],
    [21, 21, 24],
    [15, 15, 22],
    [10, 10, 18],
  ];
  let curY = 0;
  for (let i = 0; i < tiers.length; i++) {
    const [w, d, h] = tiers[i];
    // Core stepped glass block + flanking wing setbacks
    tb.box('blueGlass', w, h, d, 0, curY + h * 0.5, 0);
    // Crisp architectural mullion cornice cap & cool ice-white LED terrace rim at night!
    tb.box('structure', w + 0.9, 0.9, d + 0.9, 0, curY + h + 0.25, 0, 0, 0xcad4e0);
    tb.box('nightAccent', w + 1.1, 0.32, d + 1.1, 0, curY + h - 0.1, 0, 0, 0xa8e8ff);
    // Landscaped sky-terrace planters on the stepped shoulders
    if (i < tiers.length - 1) {
      const nw = tiers[i + 1][0];
      const off = (w + nw) * 0.25;
      tb.box('structure', w - 2, 1.0, 2.2, 0, curY + h + 1.0, off, 0, 0x2f6838);
      tb.box('structure', w - 2, 1.0, 2.2, 0, curY + h + 1.0, -off, 0, 0x2f6838);
    }
    curY += h;
  }
  // Dramatic stepped glass apex pyramid + illuminated needle spire
  tb.cyl('blueGlass', 0.8, 6.2, 10, 4, 0, curY + 5, 0, Math.PI / 4);
  tb.cyl('structure', 0.22, 0.65, 18, 8, 0, curY + 18, 0, 0, 0xd8e2ee);
  tb.cyl('nightAccent', 0.35, 0.35, 1.6, 8, 0, curY + 27.5, 0, 0, 0xff3b30); // aviation beacon
}

/** 6. Cylindrical Tubular Steel Diagrid Tower (true cylindrical glass shaft + exposed silver steel diagrid + crown ring) */
function buildTubularDiagridTower(tb: TowerBuilder): void {
  const H = 148;
  const R = 17.5;
  // Ground entrance pavilion & glass atrium base
  tb.cyl('warmGlass', R * 1.12, R * 1.16, 12, 20, 0, 6, 0);
  tb.cyl('structure', R * 1.18, R * 1.18, 1.0, 20, 0, 12.2, 0, 0, 0xd6dce4);
  // Main glazed cylinder
  tb.cyl('warmGlass', R * 0.96, R * 0.96, H - 12, 22, 0, 12 + (H - 12) * 0.5, 0);

  // Full 3D Criss-Cross Exposed Silver Tubular Steel Diagrid Exoskeleton (12 cols x 10 diamond stories!)
  const cols = 12;
  const rows = 10;
  const rowH = (H - 12) / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = 12 + r * rowH;
    const y1 = y0 + rowH;
    // Horizontal structural ring beam
    tb.torus('structure', R + 0.35, 0.32, 22, 0, y1, 0, 0xcfd6e0);
    for (let c = 0; c < cols; c++) {
      const a0 = (c / cols) * Math.PI * 2;
      const a1 = ((c + 1) / cols) * Math.PI * 2;
      const aPrev = ((c - 1 + cols) / cols) * Math.PI * 2;
      const x0 = Math.cos(a0) * (R + 0.4), z0 = Math.sin(a0) * (R + 0.4);
      const x1 = Math.cos(a1) * (R + 0.4), z1 = Math.sin(a1) * (R + 0.4);
      const xP = Math.cos(aPrev) * (R + 0.4), zP = Math.sin(aPrev) * (R + 0.4);
      tb.strut('structure', x0, y0, z0, x1, y1, z1, 0.62, 0xd2dae4);
      tb.strut('structure', x0, y0, z0, xP, y1, zP, 0.62, 0xd2dae4);
    }
  }
  // Illuminated circular crown diagrid halo + rooftop helipad!
  tb.torus('structure', R + 0.5, 0.85, 24, 0, H + 1.5, 0, 0xe0e6ee);
  tb.torus('nightAccent', R + 0.65, 0.36, 24, 0, H + 1.8, 0, 0xffe4aa);
  tb.cyl('structure', R * 0.72, R * 0.72, 0.6, 18, 0, H + 0.4, 0, 0, 0x454d58);
}

/** 7. Sculptural Twisted Pillar Skyscraper (4 massive twisting brushed-titanium pillars + gold inner cove lights + lattice crown) */
function buildTwistedPillarTower(tb: TowerBuilder): void {
  const H = 172;
  const R = 15.5;
  // Grand cantilevered plaza canopy
  tb.box('warmGlass', 32, 10, 32, 0, 5, 0);
  tb.box('structure', 39, 1.3, 39, 0, 10.6, 0, 0, 0xc8cfd8);
  tb.box('nightAccent', 38.4, 0.28, 38.4, 0, 9.9, 0, 0, 0xffd58a);

  // Recessed curved glass core
  tb.cyl('blueGlass', R * 0.90, R * 0.96, H - 10, 18, 0, 10 + (H - 10) * 0.5, 0);

  // 4 Massive Sculptural Brushed-Titanium Twisting Pillars rotating 90 degrees with warm gold cove-light channels!
  const steps = 20;
  for (let p = 0; p < 4; p++) {
    const baseA = (p / 4) * Math.PI * 2 + Math.PI * 0.25;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const a0 = baseA + t0 * (Math.PI * 0.52), a1 = baseA + t1 * (Math.PI * 0.52);
      const r0 = R * (1.12 - t0 * 0.14), r1 = R * (1.12 - t1 * 0.14);
      const y0 = 2 + t0 * (H + 6), y1 = 2 + t1 * (H + 6);
      const x0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0;
      const x1 = Math.cos(a1) * r1, z1 = Math.sin(a1) * r1;
      tb.strut('structure', x0, y0, z0, x1, y1, z1, 4.4, 0xbec7d2);
      // Warm champagne-gold cove light tucked inside each twisted pillar seam
      const ix0 = Math.cos(a0 + 0.14) * (r0 - 0.8), iz0 = Math.sin(a0 + 0.14) * (r0 - 0.8);
      const ix1 = Math.cos(a1 + 0.14) * (r1 - 0.8), iz1 = Math.sin(a1 + 0.14) * (r1 - 0.8);
      tb.strut('nightAccent', ix0, y0, iz0, ix1, y1, iz1, 0.42, 0xffd284);
    }
  }
  // Open rooftop crown lattice ring
  tb.torus('structure', R * 0.92, 0.75, 20, 0, H + 4.5, 0, 0xd0d8e2);
  tb.torus('nightAccent', R * 0.90, 0.30, 20, 0, H + 4.8, 0, 0xffe4aa);
}

/** 8. Floating Cantilever Tower (central core spine + 6 cantilevered truss sky-garden volumes + warm cedar lit soffits) */
function buildFloatingCantileverTower(tb: TowerBuilder): void {
  const H = 152;
  // Landscaped plaza podium
  tb.box('warmGlass', 46, 11, 34, 0, 5.5, 0);
  tb.box('structure', 48, 1.0, 36, 0, 11.4, 0, 0, 0xd8dce2);
  tb.box('structure', 44, 1.0, 32, 0, 12.2, 0, 0, 0x346b3c);

  // Tall central glass & brushed concrete structural core spine
  tb.box('blueGlass', 16, H, 16, 0, H * 0.5, 0);
  tb.box('structure', 5.2, H + 1.5, 16.8, -6.2, (H + 1.5) * 0.5, 0, 0, 0xc4cbd4);
  tb.box('structure', 5.2, H + 1.5, 16.8, 6.2, (H + 1.5) * 0.5, 0, 0, 0xc4cbd4);

  // 6 Dramatic Cantilevered Glass Truss Sky-Garden Volumes projecting alternately outward!
  const cantilevers: Array<[number, number, number, number, number]> = [
    [-14, 34,  4, 24, 16],
    [ 14, 52, -3, 24, 16],
    [-14, 74, -4, 24, 16],
    [ 14, 92,  4, 24, 16],
    [-14, 114, 3, 24, 16],
    [ 14, 130,-3, 22, 15],
  ];
  for (const [cx, cy, cz, cw, cd] of cantilevers) {
    const ch = 12.5;
    tb.box('blueGlass', cw, ch, cd, cx, cy, cz);
    // Warm cedar wood-lit soffit underside + recessed linear night uplight strip
    tb.box('structure', cw + 0.6, 0.9, cd + 0.6, cx, cy - ch * 0.5 - 0.3, cz, 0, 0xc49562);
    tb.box('nightAccent', cw - 2.0, 0.25, cd - 2.0, cx, cy - ch * 0.5 - 0.85, cz, 0, 0xffd288);
    // Rooftop sky-garden cap
    tb.box('structure', cw + 0.6, 0.8, cd + 0.6, cx, cy + ch * 0.5 + 0.3, cz, 0, 0xd8dee6);
    tb.box('structure', cw - 2.0, 1.1, cd - 2.0, cx, cy + ch * 0.5 + 1.1, cz, 0, 0x35703e);
    // Exposed diagonal steel side trusses supporting the cantilever
    for (const s of [-1, 1]) {
      const tz = cz + s * (cd * 0.5 + 0.25);
      tb.strut('structure', cx - cw * 0.48, cy - ch * 0.48, tz, cx, cy + ch * 0.48, tz, 0.65, 0x5c6672);
      tb.strut('structure', cx, cy + ch * 0.48, tz, cx + cw * 0.48, cy - ch * 0.48, tz, 0.65, 0x5c6672);
    }
  }
}

/** 9. Project: Fragmented Monolith — Deconstructivist Skyscraper (faceted origami podium + shifted prisms + cyan/magenta/gold ribs) */
function buildFragmentedMonolith(tb: TowerBuilder): void {
  // Crystalline faceted origami podium wings
  tb.box('obsidianGlass', 42, 13, 30, 0, 6.5, 0, 0.12);
  tb.box('warmGlass', 34, 11, 24, -14, 5.5, 10, -0.35);
  tb.box('warmGlass', 32, 10, 22, 15, 5.0, -9, 0.38);
  tb.box('nightAccent', 43, 0.34, 31, 0, 13.2, 0, 0.12, 0x34e4ff);

  // 5 Shifted Deconstructivist Geometric Prism Blocks stacking up to 176 m
  const blocks: Array<{ x: number; y: number; z: number; w: number; h: number; d: number; ry: number; rz: number; cL: number; cR: number }> = [
    { x:  0.0, y:  34, z:  0.0, w: 26, h: 42, d: 22, ry:  0.06, rz:  0.04, cL: 0x38e4ff, cR: 0xff46c8 },
    { x:  2.8, y:  74, z: -1.4, w: 24, h: 38, d: 20, ry: -0.10, rz: -0.05, cL: 0xffc658, cR: 0x38e4ff },
    { x: -2.6, y: 110, z:  1.6, w: 22, h: 36, d: 19, ry:  0.12, rz:  0.06, cL: 0x38e4ff, cR: 0xff46c8 },
    { x:  1.8, y: 142, z: -0.8, w: 18, h: 30, d: 16, ry: -0.08, rz: -0.04, cL: 0xff46c8, cR: 0xffc658 },
    { x: -0.6, y: 168, z:  0.4, w: 13, h: 24, d: 12, ry:  0.08, rz:  0.02, cL: 0x70ecff, cR: 0x70ecff },
  ];
  for (const bl of blocks) {
    tb.box('obsidianGlass', bl.w, bl.h, bl.d, bl.x, bl.y, bl.z, bl.ry, 0xffffff, 0, bl.rz);
    tb.box('blueGlass', bl.w * 0.94, bl.h * 0.96, bl.d * 1.01, bl.x, bl.y, bl.z, bl.ry, 0xffffff, 0, bl.rz);
    // Diagonal/chamfer bespoke night-only LED ribs along opposite prism edges!
    const hw = bl.w * 0.52, hh = bl.h * 0.50, hd = bl.d * 0.52;
    tb.strut('nightAccent', bl.x - hw, bl.y - hh, bl.z + hd, bl.x - hw * 0.92, bl.y + hh, bl.z + hd, 0.44, bl.cL);
    tb.strut('nightAccent', bl.x + hw, bl.y - hh, bl.z + hd, bl.x + hw * 0.92, bl.y + hh, bl.z + hd, 0.44, bl.cR);
    tb.strut('nightAccent', bl.x - hw, bl.y - hh, bl.z - hd, bl.x - hw * 0.92, bl.y + hh, bl.z - hd, 0.44, bl.cR);
    tb.strut('nightAccent', bl.x + hw, bl.y - hh, bl.z - hd, bl.x + hw * 0.92, bl.y + hh, bl.z - hd, 0.44, bl.cL);
    tb.box('nightAccent', bl.w + 0.5, 0.36, bl.d + 0.5, bl.x, bl.y + hh, bl.z, bl.ry, bl.cL, 0, bl.rz);
  }
  // Twin asymmetric crystalline spire needles
  tb.cyl('structure', 0.25, 0.85, 22, 6, 1.5, 190, 0, 0, 0xc8d8ea);
  tb.cyl('nightAccent', 0.32, 0.32, 12, 6, 1.5, 194, 0, 0, 0x62e8ff);
}

/** 10A. Cantilevered Monumental Arch Loop Tower (CCTV-style leaning twin-leg sky-bridge monolith from Hero Shots!) */
function buildCantileverArchLoop(tb: TowerBuilder): void {
  const H = 152;
  // Wide dark podium linking both leaning legs
  tb.box('obsidianGlass', 68, 12, 34, 0, 6, 0);
  // Twin leaning glass legs converging upward
  tb.box('blueGlass', 20, H - 12, 22, -20, 12 + (H - 12) * 0.5, 0, 0, 0xffffff, 0, -0.10);
  tb.box('blueGlass', 20, H - 12, 22,  20, 12 + (H - 12) * 0.5, 0, 0, 0xffffff, 0,  0.10);
  // Dramatic cantilevered upper sky-bridge connecting & overhanging both legs!
  tb.box('blueGlass', 66, 26, 24, 4, H - 12, 0);
  // Bold champagne-gold structural outline along the giant arch soffit & cantilevered roof edge (night-only!)
  tb.box('nightAccent', 66.8, 0.55, 24.8, 4, H + 1.2, 0, 0, 0xffd278);
  tb.box('nightAccent', 66.8, 0.55, 24.8, 4, H - 25.2, 0, 0, 0xff9e44);
  // Diagonal structural diagrid X-bracing across the front face of the upper sky-bridge
  for (const fx of [-22, -4, 14, 30]) {
    tb.strut('structure', fx - 9, H - 24, 12.4, fx + 9, H, 12.4, 0.65, 0xbcc6d4);
    tb.strut('structure', fx + 9, H - 24, 12.4, fx - 9, H, 12.4, 0.65, 0xbcc6d4);
  }
}

/** 10B. Obsidian Monolith Skyscraper (ultra-sleek dark mirror obsidian chamfered tower + black granite canopy, zero loud neon!) */
function buildObsidianMonolith(tb: TowerBuilder): void {
  const H = 144;
  tb.box('obsidianGlass', 34, 10, 26, 0, 5, 0);
  tb.box('structure', 20, 0.9, 10, 0, 9.6, 16, 0, 0x20242c); // cantilevered black granite canopy
  tb.box('nightAccent', 18, 0.22, 8.5, 0, 9.0, 16, 0, 0xffe0aa); // subtle warm architectural entry downlight only
  // Tapered dark obsidian 6-sided chamfered monolith
  tb.cyl('obsidianGlass', 15.5, 18.2, H, 6, 0, H * 0.5, 0, Math.PI / 6, 0xffffff, 1.12, 0.88);
  // Slanted mechanical crown parapet + helipad
  tb.cyl('structure', 15.8, 15.8, 1.4, 6, 0, H + 0.5, 0, Math.PI / 6, 0x1c2028, 1.12, 0.88);
}

/** 10C. Eco-Tower Waterfront Pavilion (stepped timber-slat & glass riverfront terraces with rooftop green pergolas) */
function buildEcoTowerPavilion(tb: TowerBuilder): void {
  const steps: Array<[number, number, number, number]> = [
    [54, 30, 12,  0],
    [42, 26, 12, -5],
    [32, 22, 13, -10],
    [22, 18, 14, -14],
    [15, 15, 15, -17],
  ];
  let curY = 0;
  for (const [w, d, h, ox] of steps) {
    tb.box('warmGlass', w, h, d, ox, curY + h * 0.5, 0);
    // Warm vertical timber louver slats along the sides
    tb.box('structure', w + 0.8, 0.85, d + 0.8, ox, curY + h + 0.3, 0, 0, 0x9c744c);
    tb.box('nightAccent', w + 0.9, 0.22, d + 0.9, ox, curY + h - 0.15, 0, 0, 0xffd288);
    // Green sky-park roof deck
    tb.box('structure', w - 2.0, 1.1, d - 2.0, ox, curY + h + 1.1, 0, 0, 0x36733f);
    curY += h;
  }
}

function buildTowerKind(tb: TowerBuilder, kind: SignatureTowerKind): void {
  switch (kind) {
    case 'grand_metropolis_resort':   buildGrandMetropolisResort(tb); break;
    case 'helix_tower':               buildHelixTower(tb); break;
    case 'spiral_glass_tower':        buildSpiralGlassTower(tb); break;
    case 'biomorphic_bio_tower':      buildBiomorphicBioTower(tb); break;
    case 'stepped_pyramid_tower':     buildSteppedPyramidTower(tb); break;
    case 'tubular_diagrid_tower':     buildTubularDiagridTower(tb); break;
    case 'twisted_pillar_tower':      buildTwistedPillarTower(tb); break;
    case 'floating_cantilever_tower': buildFloatingCantileverTower(tb); break;
    case 'fragmented_monolith':       buildFragmentedMonolith(tb); break;
    case 'cantilever_arch_loop':      buildCantileverArchLoop(tb); break;
    case 'obsidian_monolith':         buildObsidianMonolith(tb); break;
    case 'eco_tower_pavilion':        buildEcoTowerPavilion(tb); break;
  }
}

/**
 * Curated placement roster across Downtown Ironport, Ironport Grand Circuit & Civic Riverfront Promenade!
 * Positioned so drivers launching off the Start/Finish straightaway, racing through the Downtown canyon,
 * and cruising the East Bank Riverfront Promenade see all 12 architect-distinct sculpted hero towers!
 * Each candidate searches outward along safe radial offsets if the nominal coordinate touches water, a race course, or an existing historic Detroit hero.
 */
const SIGNATURE_ROSTER: SignaturePlacementSpec[] = [
  // ── HERO START/FINISH STRAIGHT & DOWNTOWN RIVERFRONT SKYLINE (Immediately prominent on Ironport Grand Circuit!) ──
  { id: 'grand-metropolis-riverfront', kind: 'grand_metropolis_resort',   x: 5065, z: 1455, rotY:  1.25, scale: 1.05, clearRadius: 54 },
  { id: 'helix-tower-downtown',        kind: 'helix_tower',               x: 5115, z: 1695, rotY:  0.40, scale: 1.02, clearRadius: 34 },
  { id: 'spiral-waterfront',           kind: 'spiral_glass_tower',        x: 5025, z: 1895, rotY:  1.10, scale: 1.00, clearRadius: 32 },
  { id: 'twisted-pillar-river',        kind: 'twisted_pillar_tower',      x: 4945, z: 2055, rotY:  0.55, scale: 0.98, clearRadius: 28 },
  { id: 'tubular-diagrid-downtown',    kind: 'tubular_diagrid_tower',     x: 5255, z: 1615, rotY:  0.00, scale: 0.96, clearRadius: 26 },
  { id: 'fragmented-monolith-core',    kind: 'fragmented_monolith',       x: 5365, z: 1435, rotY: -0.25, scale: 1.00, clearRadius: 32 },
  { id: 'stepped-pyramid-woodward',    kind: 'stepped_pyramid_tower',     x: 5540, z: 1295, rotY:  0.00, scale: 0.98, clearRadius: 32 },
  { id: 'biomorphic-civic-bay',        kind: 'biomorphic_bio_tower',      x: 5655, z: 1410, rotY:  0.85, scale: 1.02, clearRadius: 34 },
  { id: 'cantilever-arch-skybridge',   kind: 'cantilever_arch_loop',      x: 5525, z: 1650, rotY: -0.35, scale: 1.00, clearRadius: 40 },
  { id: 'floating-cantilever-east',    kind: 'floating_cantilever_tower', x: 5690, z: 1125, rotY:  0.15, scale: 0.98, clearRadius: 30 },
  { id: 'obsidian-monolith-central',   kind: 'obsidian_monolith',         x: 5430, z: 1110, rotY:  0.22, scale: 1.00, clearRadius: 26 },
  { id: 'eco-tower-promenade',         kind: 'eco_tower_pavilion',        x: 5180, z:  990, rotY:  1.40, scale: 0.96, clearRadius: 32 },

  // ── NORTH CIVIC RIVERFRONT PROMENADE & WATERFRONT MARINA CORRIDOR ──
  { id: 'eco-tower-north-park',        kind: 'eco_tower_pavilion',        x: 5420, z:  620, rotY:  1.30, scale: 0.98, clearRadius: 32 },
  { id: 'biomorphic-north-promenade',  kind: 'biomorphic_bio_tower',      x: 5580, z:  160, rotY:  1.05, scale: 1.00, clearRadius: 34 },
  { id: 'spiral-north-marina',         kind: 'spiral_glass_tower',        x: 5860, z: -480, rotY:  0.90, scale: 0.96, clearRadius: 32 },
  { id: 'tubular-diagrid-marina',      kind: 'tubular_diagrid_tower',     x: 6180, z: -1350, rotY: 0.40, scale: 0.96, clearRadius: 28 },
];

export class IronportSignatureTowers {
  readonly group = new THREE.Group();
  readonly placed: SignatureTowerFootprint[] = [];
  private webglAccentMat: THREE.MeshBasicMaterial | null = null;

  constructor(opts: SignatureTowersOpts) {
    this.group.name = 'ironport-signature-towers';
    const buckets: BatchBuckets = {
      blueGlass: [],
      warmGlass: [],
      obsidianGlass: [],
      structure: [],
      nightAccent: [],
    };

    const isClear = (x: number, z: number, rad: number): boolean => {
      if (opts.onCourse(x, z, rad + 6)) return false;
      // Ensure footprint sits on dry ground (not submerged in the river!)
      for (const [ox, oz] of [[0, 0], [rad * 0.7, 0], [-rad * 0.7, 0], [0, rad * 0.7], [0, -rad * 0.7]]) {
        if (opts.isWater(x + ox, z + oz)) return false;
      }
      if (opts.avoidPoints) {
        for (const av of opts.avoidPoints) {
          if (Math.hypot(av.x - x, av.z - z) < av.r + rad) return false;
        }
      }
      for (const p of this.placed) {
        if (Math.hypot(p.x - x, p.z - z) < p.radius + rad + 12) return false;
      }
      return true;
    };

    for (const spec of SIGNATURE_ROSTER) {
      let px = spec.x;
      let pz = spec.z;
      let ok = isClear(px, pz, spec.clearRadius);
      if (!ok) {
        // Search clean concentric rings nearby (up to 160 m) so the landmark lands right in its intended district without touching track/water!
        outer: for (let dist = 24; dist <= 180; dist += 22) {
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const cx = spec.x + Math.cos(a) * dist;
            const cz = spec.z + Math.sin(a) * dist;
            if (isClear(cx, cz, spec.clearRadius)) {
              px = cx; pz = cz; ok = true;
              break outer;
            }
          }
        }
      }
      if (!ok) continue;

      const gy = opts.groundAt(px, pz) - 0.6;
      const tb = new TowerBuilder(buckets, px, gy, pz, spec.rotY, spec.scale ?? 1);
      buildTowerKind(tb, spec.kind);
      this.placed.push({ id: spec.id, kind: spec.kind, x: px, z: pz, radius: spec.clearRadius });
    }

    const useWebGpu = isRegionWebGpuActive();
    const tslCtx = getRegionTslContext();

    // 1) Blue architectural curtain-wall glass (3D parallax night interiors + sky mirror)
    const blueGlassMat: THREE.Material = (useWebGpu && tslCtx)
      ? (createApexGlassTslMaterial({ tint: 'blue', shared: tslCtx.shared, gi: tslCtx.gi }) as unknown as THREE.Material)
      : new THREE.MeshStandardMaterial({ color: 0x3a526e, roughness: 0.08, metalness: 0.42 });

    // 2) Warm bronze/resort architectural curtain-wall glass
    const warmGlassMat: THREE.Material = (useWebGpu && tslCtx)
      ? (createApexGlassTslMaterial({ tint: 'bronze', shared: tslCtx.shared, gi: tslCtx.gi }) as unknown as THREE.Material)
      : new THREE.MeshStandardMaterial({ color: 0x5c4f44, roughness: 0.08, metalness: 0.36 });

    // 3) Obsidian dark mirror glass (Obsidian Monolith & Fragmented Monolith)
    const obsidianMat: THREE.Material = (useWebGpu && tslCtx)
      ? (() => {
          const m = new THREE_GPU.MeshStandardNodeMaterial({ color: 0x101520, roughness: 0.05, metalness: 0.35, envMapIntensity: 2.6 });
          return m as unknown as THREE.Material;
        })()
      : new THREE.MeshStandardMaterial({ color: 0x101520, roughness: 0.06, metalness: 0.38 });

    // 4) Vertex-colored brushed titanium, limestone, cedar soffits, steel trusses & terrace sky-gardens (+ TSL car headlight illumination!)
    const structMat: THREE.Material = (useWebGpu && tslCtx)
      ? (() => {
          const m = new THREE_GPU.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.44, metalness: 0.46, envMapIntensity: 1.4 });
          m.emissiveNode = apexHeadlightSpotTsl(tslCtx.shared, vertexColor().rgb).mul(0.55);
          return m as unknown as THREE.Material;
        })()
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.42 });

    // 5) STRICTLY NIGHT-ONLY Bespoke Architectural Accent LEDs (anodized dark metallic channel in daylight -> crisp luminous glow at dusk & night!)
    let accentMat: THREE.Material;
    if (useWebGpu && tslCtx) {
      const m = new THREE_GPU.MeshBasicNodeMaterial({ vertexColors: true, fog: true });
      const nightOn = smoothstep(float(0.26), float(0.76), tslCtx.shared.uNight);
      const dayTrim = vertexColor().rgb.mul(0.14);
      const nightGlow = vertexColor().rgb.mul(1.55);
      m.colorNode = mix(dayTrim, nightGlow, nightOn);
      accentMat = m as unknown as THREE.Material;
    } else {
      this.webglAccentMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x22262e, fog: true });
      accentMat = this.webglAccentMat;
    }

    const addBucket = (geos: THREE.BufferGeometry[], mat: THREE.Material, name: string, shadow: boolean): void => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) return;
      if (useWebGpu) sanitizeGeometryForWebGPU(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = name;
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    };

    addBucket(buckets.blueGlass,     blueGlassMat, 'sig-towers-blue-glass',     true);
    addBucket(buckets.warmGlass,     warmGlassMat, 'sig-towers-warm-glass',     true);
    addBucket(buckets.obsidianGlass, obsidianMat,  'sig-towers-obsidian-glass', true);
    addBucket(buckets.structure,     structMat,    'sig-towers-structure',      true);
    addBucket(buckets.nightAccent,   accentMat,    'sig-towers-night-accents',  false);
  }

  /** Sync WebGL2 fallback brightness (WebGPU auto-tracks `tslCtx.shared.uNight` natively!). */
  update(nightK: number): void {
    if (this.webglAccentMat) {
      const k = Math.max(0, Math.min(1, (nightK - 0.26) / 0.50));
      const v = 0.14 + k * 0.86;
      this.webglAccentMat.color.setRGB(v, v, v);
    }
  }
}
