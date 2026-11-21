// Sculpted clearcoat rival, traffic, and online opponent cars.
// Replaces the legacy two-box placeholder mesh with three cached automotive silhouettes
// (widebody Track GT, low Mid-Engine Exotic, and sleek Sport Coupe) lofted from the
// metric Sovereign profile curves with smooth indexed normals, 3D wheel-arch recesses,
// flush curved tinted glass, carbon aero, concave multi-spoke alloys + brake rotors/calipers,
// HDR LED headlights/taillights, and a grounded chassis + 4-tire contact shadow decal.
// Every geometry and non-paint material is built once and shared across all cars (~6 draws/car).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bodyBot, bodyTop, surfaceX } from './sovbody';

export type RivalCarVariant = 'gt-track' | 'exotic-wedge' | 'sport-coupe';

interface VariantSpec {
  sx: number;
  sy: number;
  sz: number;
  noseDrop: number;
  rearDeckLift: number;
  haunchFlare: number;
  roofCarbon: boolean;
  wing: 'swan' | 'ducktail' | 'lip';
  exhaust: 'quad' | 'center-twin' | 'dual';
  caliperHex: number;
  rimShade: number;
}

const VARIANTS: Record<RivalCarVariant, VariantSpec> = {
  'gt-track': {
    sx: 1.01,
    sy: 0.96,
    sz: 0.99,
    noseDrop: 0.025,
    rearDeckLift: 0.015,
    haunchFlare: 0.035,
    roofCarbon: true,
    wing: 'swan',
    exhaust: 'quad',
    caliperHex: 0xd92121,
    rimShade: 0xb8bec8,
  },
  'exotic-wedge': {
    sx: 1.04,
    sy: 0.89,
    sz: 0.98,
    noseDrop: 0.07,
    rearDeckLift: 0.03,
    haunchFlare: 0.055,
    roofCarbon: true,
    wing: 'ducktail',
    exhaust: 'center-twin',
    caliperHex: 0xe0a114,
    rimShade: 0x8e95a0,
  },
  'sport-coupe': {
    sx: 0.95,
    sy: 1.02,
    sz: 0.96,
    noseDrop: 0.0,
    rearDeckLift: -0.01,
    haunchFlare: 0.0,
    roofCarbon: false,
    wing: 'lip',
    exhaust: 'dual',
    caliperHex: 0xc92828,
    rimShade: 0xcad0da,
  },
};

const VARIANT_ORDER: readonly RivalCarVariant[] = ['gt-track', 'exotic-wedge', 'sport-coupe'];

const FRONT_Z = 1.37;
const REAR_Z = -1.59;
const WHEEL_Y = 0.35;
const TYRE_R = 0.355;
const ARCH_R = TYRE_R + 0.068;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function sampleProfile(spec: VariantSpec, zRaw: number): { yb: number; yt: number } {
  const nose = smooth(0.65, 2.32, zRaw);
  const tail = smooth(-0.9, -2.32, zRaw);
  const yb = Math.max(0.11, bodyBot(zRaw) * (0.94 + 0.06 * spec.sy));
  const yt = Math.max(yb + 0.14, bodyTop(zRaw) * spec.sy - spec.noseDrop * nose + spec.rearDeckLift * tail);
  return { yb, yt };
}

function sampleSurfaceX(spec: VariantSpec, yWorld: number, zRaw: number): number {
  const { yb, yt } = sampleProfile(spec, zRaw);
  const t = Math.min(1, Math.max(0, (yWorld - yb) / Math.max(0.05, yt - yb)));
  const yRef = bodyBot(zRaw) + (bodyTop(zRaw) - bodyBot(zRaw)) * t;
  let x = surfaceX(yRef, zRaw) * spec.sx;
  // Extra widebody rear haunch flare for track GT and mid-engine exotic
  if (spec.haunchFlare > 0) {
    const band = smooth(0.24, 0.45, yRef) * (1 - smooth(0.95, 1.12, yRef));
    const rearG = Math.exp(-(((zRaw - REAR_Z) / 0.56) ** 2));
    const frontG = Math.exp(-(((zRaw - FRONT_Z) / 0.48) ** 2));
    x += band * spec.haunchFlare * (rearG + 0.55 * frontG);
  }
  return x;
}

function paintVertexColor(g: THREE.BufferGeometry, r: number, gCol: number, b: number): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = r;
    arr[i * 3 + 1] = gCol;
    arr[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function prepPart(
  geo: THREE.BufferGeometry,
  r: number,
  gCol: number,
  b: number,
  tx = 0,
  ty = 0,
  tz = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(tx, ty, tz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  out.applyMatrix4(m);
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) {
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  }
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') {
      out.deleteAttribute(name);
    }
  }
  out.clearGroups();
  paintVertexColor(out, r, gCol, b);
  return out;
}

function safeMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('rivalCars: failed to merge sub-geometries');
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Smooth indexed lofted car shell with indented 3D wheel arches and baked vertex AO. */
function buildBodyGeometry(spec: VariantSpec): THREE.BufferGeometry {
  // Hand-tuned station density: extra rings around nose, wheel arches, windshield base, and tail
  const zs = [
    2.38, 2.34, 2.27, 2.16, 2.02, 1.88,
    1.76, 1.64, 1.51, 1.37, 1.23, 1.09, 0.96,
    0.85, 0.68, 0.45, 0.18, -0.06, -0.36, -0.68, -0.96,
    -1.14, -1.27, -1.42, -1.59, -1.75, -1.90, -2.04,
    -2.17, -2.28, -2.35, -2.38,
  ];
  const K = 16;
  const taus: number[] = [];
  for (let k = 0; k <= K; k++) {
    const u = k / K;
    taus.push(0.5 * (0.5 - 0.5 * Math.cos(Math.PI * u)) + 0.5 * u);
  }

  const cols = K + 1;
  const rows = zs.length;

  const makeSide = (signX: 1 | -1): THREE.BufferGeometry => {
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];

    for (let i = 0; i < rows; i++) {
      const zRaw = zs[i];
      const z = zRaw * spec.sz;
      const { yb, yt } = sampleProfile(spec, zRaw);
      for (let k = 0; k < cols; k++) {
        const t = taus[k];
        const y = yb + (yt - yb) * t;
        let x = sampleSurfaceX(spec, y, zRaw);

        // 3D wheel-arch cutout recess so wheels sit inside dark sculpted arches
        const dF = Math.hypot((zRaw - FRONT_Z) * spec.sz, y - WHEEL_Y);
        const dR = Math.hypot((zRaw - REAR_Z) * spec.sz, y - WHEEL_Y);
        const dMin = Math.min(dF, dR);
        let archIndent = 0;
        if (dMin < ARCH_R + 0.02 && y < WHEEL_Y + ARCH_R * 0.98) {
          archIndent = 1 - smooth(ARCH_R - 0.045, ARCH_R + 0.015, dMin);
          const innerWall = Math.min(x, 0.56 * spec.sx);
          x = x + (innerWall - x) * archIndent;
        }

        // Subtle side air-intake recess behind the doors for mid-engine exotic
        let scoopAO = 1.0;
        if (spec.wing === 'ducktail' && zRaw < -0.58 && zRaw > -1.16 && y > 0.38 && y < 0.90) {
          const sMask = smooth(-0.58, -0.72, zRaw) * (1 - smooth(-1.02, -1.16, zRaw)) * smooth(0.38, 0.50, y) * (1 - smooth(0.78, 0.90, y));
          x -= 0.055 * sMask;
          scoopAO = 1 - 0.72 * sMask;
        }

        pos.push(signX * x, y, z);
        uv.push((zRaw + 2.39) / 4.78, t);

        // Baked vertex AO + optional exposed carbon roof panel
        let ao = (0.56 + 0.44 * smooth(0.16, 0.44, y)) * scoopAO;
        if (archIndent > 0.05) ao *= 1 - 0.84 * archIndent;
        // Subtle lower nose / rear valance grounding shadow
        if (y < 0.34 && Math.abs(zRaw) > 2.05) ao *= 0.74;
        // Exposed satin-dark roof insert on track GT and exotic variants
        if (spec.roofCarbon && t > 0.87 && zRaw < 0.04 && zRaw > -1.14 && x < 0.56 * spec.sx) {
          const rMask = smooth(0.87, 0.93, t) * (1 - smooth(0.46 * spec.sx, 0.55 * spec.sx, x));
          ao *= 1 - 0.76 * rMask;
        }
        col.push(ao, ao, ao);
      }
    }

    for (let i = 0; i < rows - 1; i++) {
      for (let k = 0; k < K; k++) {
        const a = i * cols + k;
        const b = (i + 1) * cols + k;
        const c = (i + 1) * cols + (k + 1);
        const d = i * cols + (k + 1);
        // zs runs +2.38 -> -2.38 (-Z), taus runs 0 -> 1 (+Y), so (b-a)x(c-a) = (-Z)x(+Y) = +X (outward for signX > 0)
        if (signX > 0) {
          idx.push(a, b, c, a, c, d);
        } else {
          idx.push(a, c, b, a, d, c);
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g.toNonIndexed();
  };

  // Nose cap, tail cap, and dark underbody floor strip (separate vertices for crisp end creases)
  const capParts: THREE.BufferGeometry[] = [makeSide(1), makeSide(-1)];

  const addCap = (rowIdx: number, zSign: 1 | -1): void => {
    const zRaw = zs[rowIdx];
    const z = zRaw * spec.sz;
    const { yb, yt } = sampleProfile(spec, zRaw);
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k <= K; k++) {
      const y = yb + (yt - yb) * taus[k];
      ring.push(new THREE.Vector3(sampleSurfaceX(spec, y, zRaw), y, z));
    }
    for (let k = K - 1; k >= 0; k--) {
      const y = yb + (yt - yb) * taus[k];
      ring.push(new THREE.Vector3(-sampleSurfaceX(spec, y, zRaw), y, z));
    }
    const cen = new THREE.Vector3(0, (yb + yt) * 0.5, z + zSign * 0.015);
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % ring.length];
      // Check outward winding against zSign
      const n = new THREE.Vector3().subVectors(p1, cen).cross(new THREE.Vector3().subVectors(p2, cen));
      if (n.z * zSign >= 0) {
        pos.push(cen.x, cen.y, cen.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      } else {
        pos.push(cen.x, cen.y, cen.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
      }
      const ao = zSign < 0 ? 0.68 : 0.78;
      col.push(ao, ao, ao, ao, ao, ao, ao, ao, ao);
      uv.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    capParts.push(g);
  };
  addCap(0, 1);
  addCap(rows - 1, -1);

  // Dark underbody floor pan
  const floorGeo = prepPart(
    new THREE.BoxGeometry(1.48 * spec.sx, 0.05, 4.46 * spec.sz),
    0.14,
    0.14,
    0.14,
    0,
    0.18,
    0,
  );
  capParts.push(floorGeo);

  return safeMerge(capParts);
}

/** Curved flush dark-tinted greenhouse glass hugging the exact lofted body surface. */
function buildGlassGeometry(spec: VariantSpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const OFF = 0.009; // 9 mm proud along outward surface normal — zero z-fighting, razor-sharp pillars

  // 1. Windshield & 2. Rear Fastback Glass (lofted strips along z from cowl/deck to roof header)
  const buildSlopeGlass = (zStart: number, zEnd: number, marginStart: number, marginEnd: number, nzSign: 1 | -1): void => {
    const nzSteps = 7;
    const nxSteps = 8;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const cols = nxSteps + 1;

    for (let i = 0; i <= nzSteps; i++) {
      const v = i / nzSteps;
      const zRaw = zStart + (zEnd - zStart) * v;
      const z = zRaw * spec.sz;
      const { yt } = sampleProfile(spec, zRaw);
      const margin = marginStart + (marginEnd - marginStart) * v;
      const halfW = Math.max(0.28, sampleSurfaceX(spec, yt - 0.06, zRaw) - margin);

      // Finite-difference slope for clean outward normal offset
      const zPrev = Math.max(-2.36, Math.min(2.36, zRaw - 0.03 * nzSign));
      const ytPrev = sampleProfile(spec, zPrev).yt;
      const dy = yt - ytPrev;
      const dz = (zRaw - zPrev) * spec.sz;
      const nVec = new THREE.Vector3(0, Math.abs(dz), nzSign * Math.abs(dy)).normalize();

      for (let j = 0; j <= nxSteps; j++) {
        const u = j / nxSteps;
        const frac = (u - 0.5) * 2; // -1..1
        const x = frac * halfW;
        // Subtle panoramic glass crown across width
        const crown = (1 - frac * frac) * 0.018;
        const y = yt - 0.012 * (frac * frac) + crown;
        pos.push(x + nVec.x * OFF, y + nVec.y * OFF, z + nVec.z * OFF);
        uv.push(u, v);
      }
    }
    for (let i = 0; i < nzSteps; i++) {
      for (let j = 0; j < nxSteps; j++) {
        const a = i * cols + j;
        const b = (i + 1) * cols + j;
        const c = (i + 1) * cols + (j + 1);
        const d = i * cols + (j + 1);
        // z runs front -> rear (-Z), x runs left -> right (+X): (c-a)x(b-a) = (+X)x(-Z) = +Y (outward upward normal for both windshield & rear fastback glass)
        idx.push(a, c, b, a, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g.toNonIndexed());
  };

  buildSlopeGlass(0.84, -0.02, 0.085, 0.095, 1);    // Windshield
  buildSlopeGlass(-1.12, -1.86, 0.11, 0.14, -1);   // Rear fastback glass

  // 3. Left & right curved side windows (hugging tumblehome surface)
  const sideZs = [0.64, 0.42, 0.15, -0.15, -0.48, -0.82, -1.12, -1.34];
  const vSteps = 4;
  for (const sx of [1, -1] as const) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const cols = vSteps + 1;
    for (let i = 0; i < sideZs.length; i++) {
      const zRaw = sideZs[i];
      const z = zRaw * spec.sz;
      const { yt } = sampleProfile(spec, zRaw);
      const belt = (1.01 + 0.04 * smooth(0.4, -1.2, zRaw)) * spec.sy;
      const topLim = Math.max(belt + 0.03, yt - 0.055);
      // Taper front and rear corners cleanly inside the A- and C-pillars
      const uFrac = i / (sideZs.length - 1);
      const pinch = uFrac === 0 || uFrac === 1 ? 0.42 : 0.0;
      const y0 = belt + (topLim - belt) * pinch * 0.45;
      const y1 = topLim - (topLim - belt) * pinch * 0.55;
      for (let k = 0; k <= vSteps; k++) {
        const v = k / vSteps;
        const y = y0 + (y1 - y0) * v;
        const x = sampleSurfaceX(spec, y, zRaw) + OFF;
        pos.push(sx * x, y + OFF * 0.45, z);
        uv.push(uFrac, v);
      }
    }
    for (let i = 0; i < sideZs.length - 1; i++) {
      for (let k = 0; k < vSteps; k++) {
        const a = i * cols + k;
        const b = (i + 1) * cols + k;
        const c = (i + 1) * cols + (k + 1);
        const d = i * cols + (k + 1);
        if (sx > 0) {
          idx.push(a, b, c, a, c, d);
        } else {
          idx.push(a, c, b, a, d, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g.toNonIndexed());
  }

  // Merge without vertex color (uses dedicated glass physical material)
  for (const p of parts) {
    if (!p.getAttribute('color')) paintVertexColor(p, 1, 1, 1);
  }
  return safeMerge(parts);
}

/** Satin carbon aero package + grilles + mirrors + wing + tires + wheel-well tubs. */
function buildCarbonAndTiresGeometry(spec: VariantSpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const C = 0.94;  // carbon trim brightness (on dark satin base material)
  const G = 0.28;  // recessed front/rear grille blackout
  const T = 0.42;  // matte rubber tire

  const zNose = 2.38 * spec.sz;
  const zTail = -2.38 * spec.sz;

  // Front carbon splitter + side winglets
  parts.push(prepPart(new THREE.BoxGeometry(1.90 * spec.sx, 0.04, 0.36), C, C, C, 0, 0.135, zNose - 0.10));
  for (const sx of [-1, 1]) {
    parts.push(prepPart(new THREE.BoxGeometry(0.035, 0.13, 0.24), C, C, C, sx * 0.94 * spec.sx, 0.19, zNose - 0.13, 0, 0, -sx * 0.08));
  }

  // Front grille & lower brake-duct intake recesses
  parts.push(prepPart(new THREE.BoxGeometry(0.98 * spec.sx, 0.19, 0.08), G, G, G, 0, 0.45 * spec.sy, zNose - 0.01));
  parts.push(prepPart(new THREE.BoxGeometry(1.14 * spec.sx, 0.13, 0.08), G, G, G, 0, 0.22, zNose - 0.015));
  for (const sx of [-1, 1]) {
    parts.push(prepPart(new THREE.BoxGeometry(0.32 * spec.sx, 0.16, 0.08), G, G, G, sx * 0.72 * spec.sx, 0.26, zNose - 0.07, 0, sx * 0.26, 0));
  }

  // Left & right carbon rocker skirts
  for (const sx of [-1, 1]) {
    parts.push(prepPart(new THREE.BoxGeometry(0.11, 0.055, 2.08 * spec.sz), C, C, C, sx * 0.93 * spec.sx, 0.175, -0.09 * spec.sz));
    // Sculpted wing mirror pods + stalks
    const mx = sampleSurfaceX(spec, 0.96 * spec.sy, 0.62) + 0.09;
    parts.push(prepPart(new THREE.BoxGeometry(0.14, 0.035, 0.07), C, C, C, sx * (mx - 0.05), 0.96 * spec.sy, 0.60 * spec.sz, 0, 0, sx * 0.22));
    parts.push(prepPart(new THREE.BoxGeometry(0.16, 0.085, 0.11), C, C, C, sx * (mx + 0.03), 1.01 * spec.sy, 0.59 * spec.sz, 0, -sx * 0.18, 0));
  }

  // Rear fascia recessed blackout band (proud of tail cap center) + tapered rear carbon diffuser with 4 strakes
  parts.push(prepPart(new THREE.BoxGeometry(1.52 * spec.sx, 0.115, 0.045), G, G, G, 0, 0.79 * spec.sy, zTail - 0.004));
  parts.push(prepPart(new THREE.BoxGeometry(1.42 * spec.sx, 0.19, 0.16), C, C, C, 0, 0.25, zTail + 0.07));
  for (const fx of [-0.46, -0.16, 0.16, 0.46]) {
    parts.push(prepPart(new THREE.BoxGeometry(0.024, 0.17, 0.22), C, C, C, fx * spec.sx, 0.23, zTail + 0.04, 0.14, 0, 0));
  }

  // Variant-specific rear wing / aero
  const rearDeckY = sampleProfile(spec, -2.20).yt;
  if (spec.wing === 'swan') {
    const wy = rearDeckY + 0.26;
    const wz = -2.18 * spec.sz;
    parts.push(prepPart(new THREE.BoxGeometry(1.80 * spec.sx, 0.038, 0.24), C, C, C, 0, wy, wz, 0.09, 0, 0));
    for (const sx of [-1, 1]) {
      // Swan-neck pylons
      parts.push(prepPart(new THREE.BoxGeometry(0.032, 0.28, 0.12), C, C, C, sx * 0.40 * spec.sx, rearDeckY + 0.12, wz + 0.06, -0.22, 0, 0));
      // Aerodynamic endplates
      parts.push(prepPart(new THREE.BoxGeometry(0.025, 0.18, 0.34), C, C, C, sx * 0.90 * spec.sx, wy - 0.01, wz - 0.01, 0.08, 0, 0));
    }
  } else if (spec.wing === 'ducktail') {
    parts.push(prepPart(new THREE.BoxGeometry(1.58 * spec.sx, 0.09, 0.15), C, C, C, 0, rearDeckY + 0.03, -2.26 * spec.sz, -0.35, 0, 0));
  } else {
    parts.push(prepPart(new THREE.BoxGeometry(1.42 * spec.sx, 0.045, 0.09), C, C, C, 0, rearDeckY + 0.015, -2.24 * spec.sz, -0.22, 0, 0));
  }

  // 4 performance tires + inner dark wheel-well liner drums (blocks daylight through arches)
  const wheels: [number, number, number][] = [
    [-0.81 * spec.sx, FRONT_Z * spec.sz, 0.28],
    [0.81 * spec.sx, FRONT_Z * spec.sz, 0.28],
    [-0.83 * spec.sx, REAR_Z * spec.sz, 0.32],
    [0.83 * spec.sx, REAR_Z * spec.sz, 0.32],
  ];
  for (const [wx, wz, width] of wheels) {
    const tire = new THREE.CylinderGeometry(TYRE_R, TYRE_R, width, 20);
    tire.rotateZ(Math.PI * 0.5);
    parts.push(prepPart(tire, T, T, T, wx, WHEEL_Y, wz));
    tire.dispose();

    // Inner wheel-well cavity drum
    const drum = new THREE.CylinderGeometry(TYRE_R + 0.03, TYRE_R + 0.03, 0.22, 14);
    drum.rotateZ(Math.PI * 0.5);
    parts.push(prepPart(drum, 0.12, 0.12, 0.12, wx * 0.72, WHEEL_Y + 0.03, wz));
    drum.dispose();
  }

  return safeMerge(parts);
}

/** Concave 5-twin-spoke alloy rims + machined brake rotors + colored calipers + titanium exhausts. */
function buildMetalHardwareGeometry(spec: VariantSpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rimCol = new THREE.Color(spec.rimShade);
  const calCol = new THREE.Color(spec.caliperHex);
  const rotor = 0.62;
  const hub = 0.24;

  const wheels: [number, number, number][] = [
    [-0.81 * spec.sx, FRONT_Z * spec.sz, 0.28],
    [0.81 * spec.sx, FRONT_Z * spec.sz, 0.28],
    [-0.83 * spec.sx, REAR_Z * spec.sz, 0.32],
    [0.83 * spec.sx, REAR_Z * spec.sz, 0.32],
  ];

  for (const [wx, wz, width] of wheels) {
    const sx = wx > 0 ? 1 : -1;
    const faceX = wx + sx * (width * 0.5 - 0.015);

    // Outer alloy rim lip ring
    const lip = new THREE.TorusGeometry(0.242, 0.022, 6, 18);
    lip.rotateY(Math.PI * 0.5);
    parts.push(prepPart(lip, rimCol.r, rimCol.g, rimCol.b, faceX, WHEEL_Y, wz));
    lip.dispose();

    // Inner concave barrel wall (gives real depth behind spokes)
    const barrel = new THREE.CylinderGeometry(0.235, 0.22, width * 0.65, 16, 1, true);
    barrel.rotateZ(Math.PI * 0.5);
    parts.push(prepPart(barrel, hub, hub, hub, wx + sx * 0.02, WHEEL_Y, wz));
    barrel.dispose();

    // Ventilated machined brake disc rotor tucked inside the barrel
    const disc = new THREE.CylinderGeometry(0.195, 0.195, 0.032, 16);
    disc.rotateZ(Math.PI * 0.5);
    parts.push(prepPart(disc, rotor, rotor, rotor, faceX - sx * 0.075, WHEEL_Y, wz));
    disc.dispose();

    // Performance brake caliper (visible through spokes!)
    const calZ = wz > 0 ? wz - 0.13 : wz + 0.13;
    parts.push(prepPart(new THREE.BoxGeometry(0.055, 0.13, 0.075), calCol.r, calCol.g, calCol.b, faceX - sx * 0.068, WHEEL_Y + 0.03, calZ));

    // Center hub cap
    const cap = new THREE.CylinderGeometry(0.055, 0.062, 0.04, 12);
    cap.rotateZ(Math.PI * 0.5);
    parts.push(prepPart(cap, rimCol.r * 0.7, rimCol.g * 0.7, rimCol.b * 0.7, faceX - sx * 0.03, WHEEL_Y, wz));
    cap.dispose();

    // 5 twin concave spokes (10 slim blades)
    for (let s = 0; s < 5; s++) {
      const baseAngle = (s / 5) * Math.PI * 2;
      for (const delta of [-0.14, 0.14]) {
        const a = baseAngle + delta;
        const rMid = 0.142;
        const py = WHEEL_Y + Math.cos(a) * rMid;
        const pz = wz + Math.sin(a) * rMid;
        parts.push(
          prepPart(
            new THREE.BoxGeometry(0.022, 0.185, 0.022),
            rimCol.r,
            rimCol.g,
            rimCol.b,
            faceX - sx * 0.022,
            py,
            pz,
            a,
            0,
            -sx * 0.16,
          ),
        );
      }
    }
  }

  // Polished titanium rear exhaust tips
  const zEx = -2.35 * spec.sz;
  const exXs =
    spec.exhaust === 'quad'
      ? [-0.47, -0.31, 0.31, 0.47]
      : spec.exhaust === 'center-twin'
        ? [-0.11, 0.11]
        : [-0.44, 0.44];
  const exR = spec.exhaust === 'center-twin' ? 0.055 : 0.046;
  for (const ex of exXs) {
    const tip = new THREE.CylinderGeometry(exR, exR * 0.92, 0.11, 12);
    tip.rotateX(Math.PI * 0.5);
    parts.push(prepPart(tip, 0.92, 0.93, 0.96, ex * spec.sx, 0.29, zEx));
    tip.dispose();
  }

  return safeMerge(parts);
}

/** HDR LED headlight spears + rear crimson LED lightbar signature + high-mount brake strip. */
function buildLampsGeometry(spec: VariantSpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const zNose = 2.34 * spec.sz;
  const zTail = -2.36 * spec.sz;

  // Front LED DRL blades + xenon cores (HDR > 1.0 triggers clean bloom at dusk/night)
  const hY = 0.62 * spec.sy;
  for (const sx of [-1, 1]) {
    parts.push(prepPart(new THREE.BoxGeometry(0.36 * spec.sx, 0.055, 0.14), 2.35, 2.28, 2.08, sx * 0.67 * spec.sx, hY, zNose - 0.09, 0.08, sx * 0.34, -sx * 0.12));
    parts.push(prepPart(new THREE.BoxGeometry(0.18 * spec.sx, 0.028, 0.10), 2.8, 2.85, 2.95, sx * 0.78 * spec.sx, hY + 0.032, zNose - 0.13, 0.06, sx * 0.44, -sx * 0.14));
  }

  // Rear aggressive slim twin-blade crimson LED taillight signature (cleanly seated on recessed fascia band)
  const tY = 0.795 * spec.sy;
  for (const sx of [-1, 1]) {
    parts.push(prepPart(new THREE.BoxGeometry(0.50 * spec.sx, 0.036, 0.038), 3.6, 0.14, 0.08, sx * 0.54 * spec.sx, tY + 0.012, zTail - 0.016, 0, -sx * 0.12, 0));
    parts.push(prepPart(new THREE.BoxGeometry(0.34 * spec.sx, 0.018, 0.036), 2.6, 0.10, 0.06, sx * 0.50 * spec.sx, tY - 0.026, zTail - 0.014, 0, -sx * 0.12, 0));
  }
  // Track GT & Exotic get a razor-thin full-width crimson LED bridge connecting both clusters
  if (spec.wing !== 'lip') {
    parts.push(prepPart(new THREE.BoxGeometry(0.62 * spec.sx, 0.018, 0.034), 3.0, 0.11, 0.06, 0, tY + 0.012, zTail - 0.020));
  }
  // High-mount third brake light tucked beneath rear roof edge
  const roofRearY = sampleProfile(spec, -1.16).yt;
  parts.push(prepPart(new THREE.BoxGeometry(0.34 * spec.sx, 0.022, 0.05), 2.4, 0.10, 0.05, 0, roofRearY - 0.01, -1.16 * spec.sz));

  return safeMerge(parts);
}

interface CachedVariant {
  bodyGeo: THREE.BufferGeometry;
  glassGeo: THREE.BufferGeometry;
  carbonGeo: THREE.BufferGeometry;
  metalGeo: THREE.BufferGeometry;
  lampsGeo: THREE.BufferGeometry;
}

const variantCache = new Map<RivalCarVariant, CachedVariant>();
const paintMatCache = new Map<string, THREE.MeshPhysicalMaterial>();

let sharedGlassMat: THREE.MeshPhysicalMaterial | null = null;
let sharedCarbonMat: THREE.MeshStandardMaterial | null = null;
let sharedMetalMat: THREE.MeshStandardMaterial | null = null;
let sharedLampsMat: THREE.MeshBasicMaterial | null = null;
let sharedShadowGeo: THREE.PlaneGeometry | null = null;
let sharedShadowMat: THREE.MeshBasicMaterial | null = null;

function getVariant(v: RivalCarVariant): CachedVariant {
  let c = variantCache.get(v);
  if (!c) {
    const spec = VARIANTS[v];
    c = {
      bodyGeo: buildBodyGeometry(spec),
      glassGeo: buildGlassGeometry(spec),
      carbonGeo: buildCarbonAndTiresGeometry(spec),
      metalGeo: buildMetalHardwareGeometry(spec),
      lampsGeo: buildLampsGeometry(spec),
    };
    variantCache.set(v, c);
  }
  return c;
}

function getSharedMaterials(): {
  glass: THREE.MeshPhysicalMaterial;
  carbon: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  lamps: THREE.MeshBasicMaterial;
  shadowGeo: THREE.PlaneGeometry;
  shadowMat: THREE.MeshBasicMaterial;
} {
  if (!sharedGlassMat) {
    sharedGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x050912,
      metalness: 0.08,
      roughness: 0.06,
      clearcoat: 0.65,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }
  if (!sharedCarbonMat) {
    sharedCarbonMat = new THREE.MeshStandardMaterial({
      color: 0x1b1e25,
      metalness: 0.22,
      roughness: 0.52,
      envMapIntensity: 0.85,
      vertexColors: true,
    });
  }
  if (!sharedMetalMat) {
    sharedMetalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.86,
      roughness: 0.28,
      envMapIntensity: 1.05,
      vertexColors: true,
    });
  }
  if (!sharedLampsMat) {
    sharedLampsMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      toneMapped: false,
    });
  }
  if (!sharedShadowGeo || !sharedShadowMat) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 256);
    const outer = g.createRadialGradient(64, 128, 18, 64, 128, 110);
    outer.addColorStop(0, 'rgba(0,0,0,0.82)');
    outer.addColorStop(0.55, 'rgba(0,0,0,0.48)');
    outer.addColorStop(0.86, 'rgba(0,0,0,0.14)');
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.scale(0.54, 1);
    g.fillStyle = outer;
    g.fillRect(0, 0, 240, 256);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.68)';
    g.beginPath();
    g.ellipse(64, 128, 32, 84, 0, 0, Math.PI * 2);
    g.fill();
    for (const [tx, ty] of [[34, 62], [94, 62], [34, 196], [94, 196]]) {
      const tg = g.createRadialGradient(tx, ty, 2, tx, ty, 17);
      tg.addColorStop(0, 'rgba(0,0,0,0.92)');
      tg.addColorStop(0.6, 'rgba(0,0,0,0.45)');
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = tg;
      g.beginPath();
      g.ellipse(tx, ty, 14, 21, 0, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    sharedShadowMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    sharedShadowGeo = new THREE.PlaneGeometry(2.38, 5.05);
    sharedShadowGeo.rotateX(-Math.PI * 0.5);
  }
  return {
    glass: sharedGlassMat,
    carbon: sharedCarbonMat,
    metal: sharedMetalMat,
    lamps: sharedLampsMat,
    shadowGeo: sharedShadowGeo,
    shadowMat: sharedShadowMat,
  };
}

/** Calibrated metallic OEM automotive clearcoat paint (keeps hue identity while eliminating flat neon plastic look). */
function getPaintMaterial(paintHex: number | string): THREE.MeshPhysicalMaterial {
  const raw = new THREE.Color(paintHex);
  const key = raw.getHexString();
  let mat = paintMatCache.get(key);
  if (!mat) {
    const hsl = { h: 0, s: 0, l: 0 };
    raw.getHSL(hsl);
    // Deepen garish high-saturation neon tones slightly into authentic multi-stage metallic lacquer
    const tuned = new THREE.Color().setHSL(
      hsl.h,
      Math.min(hsl.s, 0.82),
      hsl.s > 0.45 ? Math.min(hsl.l * 0.84, 0.44) : Math.min(hsl.l * 0.94, 0.72),
    );
    mat = new THREE.MeshPhysicalMaterial({
      color: tuned,
      metalness: hsl.s > 0.2 ? 0.40 : 0.32,
      roughness: 0.36,
      clearcoat: 0.50,
      clearcoatRoughness: 0.17,
      ior: 1.46,
      specularIntensity: 0.50,
      envMapIntensity: 0.74,
      vertexColors: true,
    });
    paintMatCache.set(key, mat);
  }
  return mat;
}

/**
 * Create a sculpted AAA rival, traffic, or online opponent car.
 * Shares cached variant geometries and materials so each car costs only 6 draw calls.
 */
export function makeRivalCar(
  paintHex: number | string,
  variantOrIndex: RivalCarVariant | number = 0,
): THREE.Group {
  const variant: RivalCarVariant =
    typeof variantOrIndex === 'number'
      ? VARIANT_ORDER[Math.abs(variantOrIndex) % VARIANT_ORDER.length]
      : variantOrIndex;
  const v = getVariant(variant);
  const mats = getSharedMaterials();
  const g = new THREE.Group();
  g.name = `rival-${variant}`;

  const body = new THREE.Mesh(v.bodyGeo, getPaintMaterial(paintHex));
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const glass = new THREE.Mesh(v.glassGeo, mats.glass);
  glass.receiveShadow = true;
  g.add(glass);

  const carbon = new THREE.Mesh(v.carbonGeo, mats.carbon);
  carbon.receiveShadow = true;
  g.add(carbon);

  const metal = new THREE.Mesh(v.metalGeo, mats.metal);
  g.add(metal);

  const lamps = new THREE.Mesh(v.lampsGeo, mats.lamps);
  g.add(lamps);

  const shadow = new THREE.Mesh(mats.shadowGeo, mats.shadowMat);
  shadow.position.set(0, 0.024, -0.10);
  shadow.renderOrder = 1;
  g.add(shadow);

  return g;
}
