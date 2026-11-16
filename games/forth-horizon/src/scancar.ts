// Scan cars: image-to-mesh body plus real parts, driven by car/<id>/spec.json. Process and rationale: docs/apex-elohim/car-pipeline.md.
// The generated mesh is only the shell. Paint is one solid clearcoat colour, wheels / brakes / suspension / engine / exhaust / lamps /
// trim are built from the spec, and the doors, hood and trunk are real separate panels that open.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { wheel, type CarRig } from './car';
import { buildBodyGeometry } from './sovbody';
import { toTris, toGeometry, clipRegion, splitUnion, boxRegion, sideRegion, toMesh, thicken, plane, type Tri, type Region } from './scanparts';
import sovSpec from '../car/sovereign/spec.json';

export interface ScanSpec {
  id: string; glb: string; paint: string; body?: 'modelled'; cuts?: boolean;
  wheels: { frontZ: number; rearZ: number; frontX: number; rearX: number; scale: number; discardR: number; centreY: number; tyreR: number; rimR: number };
  panels: Record<string, { hinge: number[]; axis: number[]; open: number }>;
  glass: { belt: number; roofEdge: number; pillarBase: number; pillarTop: number; doorFront: number; doorRear: number; windBase: number; windTop: number; rearTop: number; rearBase: number; rearBase2: number; sideWindow: number[][]; handle: number[] };
  front: { openings: Opening[] };
  engine?: { z: number };
  exhaust?: { z: number; y: number; xs: number[] };
}

const std = (color: number, rough = 0.6, metal = 0.5): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function mesher(g: THREE.Group) {
  return (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z); me.rotation.set(rx, ry, rz);
    g.add(me);
    return me;
  };
}

function buildEngine(z: number): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const bay = std(0x0d0e10, 0.8, 0.2), steel = std(0x8b8f96, 0.3, 0.95), gun = std(0x2b2e33, 0.4, 0.85);
  const red = std(0xa3141a, 0.45, 0.35), carbon = std(0x15161a, 0.3, 0.4), alu = std(0xb7bbc2, 0.35, 0.9), black = std(0x08080a, 0.6, 0.2);
  // bay shell: floor, inner fender walls, bulkhead, radiator support, so an open hood shows a built bay and not the hollow scan
  add(new THREE.BoxGeometry(1.3, 0.05, 1.1), bay, 0, 0.40, z + 0.05);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.34, 1.0), bay, sx * 0.62, 0.58, z + 0.05);
  add(new THREE.BoxGeometry(1.3, 0.4, 0.04), bay, 0, 0.6, z - 0.5);
  add(new THREE.BoxGeometry(1.1, 0.3, 0.05), black, 0, 0.55, z + 0.58);
  add(new THREE.BoxGeometry(0.9, 0.22, 0.03), alu, 0, 0.55, z + 0.62);
  // V8: block, banks, red cam covers, plenum, runners, throttle body, belt cover, exhaust manifolds
  add(new THREE.BoxGeometry(0.46, 0.26, 0.7), gun, 0, 0.55, z);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.2, 0.2, 0.66), gun, sx * 0.2, 0.66, z, 0, 0, -sx * 0.34);
    add(new THREE.BoxGeometry(0.17, 0.045, 0.6), red, sx * 0.27, 0.77, z, 0, 0, -sx * 0.34);
    add(new THREE.BoxGeometry(0.09, 0.09, 0.62), steel, sx * 0.31, 0.5, z);
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 14), carbon, sx * 0.1, 0.77, z - 0.24 + i * 0.16, 0, 0, sx * 1.2);
  }
  add(new THREE.BoxGeometry(0.26, 0.09, 0.56), carbon, 0, 0.83, z);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 20), alu, 0, 0.85, z - 0.36, Math.PI / 2, 0, 0);
  add(new THREE.BoxGeometry(0.4, 0.34, 0.05), black, 0, 0.62, z + 0.36);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 20), steel, 0, 0.62, z + 0.39, Math.PI / 2, 0, 0);
  add(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 12), steel, 0, 0.86, z - 0.4, 0, 0, Math.PI / 2);          // strut tower bar
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 20), steel, sx * 0.62, 0.84, z - 0.4);
  add(new THREE.BoxGeometry(0.22, 0.18, 0.16), black, -0.5, 0.52, z - 0.3);                                       // battery
  add(new THREE.BoxGeometry(0.16, 0.18, 0.1), alu, 0.5, 0.52, z + 0.35);                                          // coolant tank
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), red, 0.5, 0.63, z + 0.35);
  return g;
}

// quad exhaust, diffuser fins, front splitter and canards: the fascia parts the scan only suggests
function buildAero(ex: NonNullable<ScanSpec['exhaust']>): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const ti = new THREE.MeshStandardMaterial({ color: 0x9d9486, roughness: 0.28, metalness: 1.0 });
  const burnt = new THREE.MeshStandardMaterial({ color: 0x4a3f7a, roughness: 0.35, metalness: 0.95 });
  const soot = std(0x050506, 0.9, 0.1), carbon = std(0x101114, 0.28, 0.5);
  for (const x of ex.xs) {
    const outer = new THREE.CylinderGeometry(0.058, 0.052, 0.12, 32, 1, true);
    add(outer, ti, x, ex.y, ex.z, Math.PI / 2, 0, 0).material = new THREE.MeshStandardMaterial({ color: 0x9d9486, roughness: 0.28, metalness: 1.0, side: THREE.DoubleSide });
    add(new THREE.CylinderGeometry(0.047, 0.047, 0.22, 24, 1, true), soot, x, ex.y, ex.z - 0.01, Math.PI / 2, 0, 0).material = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, side: THREE.DoubleSide });
    add(new THREE.TorusGeometry(0.056, 0.008, 10, 32), burnt, x, ex.y, ex.z - 0.1, 0, 0, 0);          // heat-blued rolled lip
    add(new THREE.TorusGeometry(0.05, 0.005, 8, 28), ti, x, ex.y, ex.z + 0.08, 0, 0, 0);              // weld band
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 16), ti, x, ex.y + 0.01, ex.z + 0.3, Math.PI / 2, 0, 0);   // pipe running forward under the car
  }
  // rear diffuser: carbon strakes between and outside the tips
  for (let i = -3; i <= 3; i++) add(new THREE.BoxGeometry(0.012, 0.15, 0.36), carbon, i * 0.23, ex.y - 0.1, ex.z + 0.3);
  add(new THREE.BoxGeometry(1.7, 0.012, 0.34), carbon, 0, ex.y - 0.2, ex.z + 0.32);
  // front splitter, canards, brake ducts
  const zf = 2.02;
  add(new THREE.BoxGeometry(1.55, 0.02, 0.26), carbon, 0, 0.06, zf);
  add(new THREE.BoxGeometry(1.5, 0.02, 0.03), std(0x1b1c20, 0.4, 0.5), 0, 0.07, zf + 0.13);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.01, 0.08), carbon, sx * 0.78, 0.2, zf - 0.12, 0.2, 0, -sx * 0.25);
    add(new THREE.BoxGeometry(0.1, 0.01, 0.08), carbon, sx * 0.78, 0.24, zf - 0.12, 0.2, 0, -sx * 0.25);
    add(new THREE.BoxGeometry(0.01, 0.05, 0.16), carbon, sx * 0.79, 0.1, zf);
  }
  return g;
}

// real lamp assemblies: housing, clear lens, projector with chrome ring, LED strips. Placed on the scan's surface by ray cast.
function lampShape(w: number, h: number, tilt: number, taper: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w, tilt); s.lineTo(w, tilt + h * taper); s.quadraticCurveTo(w * 0.5, h * 1.15 + tilt * 0.5, 0, h); s.lineTo(0, 0);
  return s;
}
function buildLamps(shells: THREE.Mesh[], origin: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const rc = new THREE.Raycaster();
  const surf = (x: number, y: number, dir: number, fallback: number): number => {
    rc.set(new THREE.Vector3(origin.x + x, origin.y + y, origin.z + dir * 6), new THREE.Vector3(0, 0, -dir));
    rc.far = 12;
    const hit = rc.intersectObjects(shells, false)[0];
    return hit ? hit.point.z - origin.z : fallback;
  };
  const housing = new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.22, metalness: 0.85, side: THREE.DoubleSide });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0xdfeaff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.26, clearcoat: 1, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.12, metalness: 1 });
  const ledW = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeaff, emissiveIntensity: 2.4, roughness: 0.3 });
  const ledA = new THREE.MeshStandardMaterial({ color: 0xffb03a, emissive: 0xff8a10, emissiveIntensity: 1.6, roughness: 0.4 });
  const lensR = new THREE.MeshPhysicalMaterial({ color: 0xb0121a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false });
  const ledR = new THREE.MeshStandardMaterial({ color: 0xff2a20, emissive: 0xff1208, emissiveIntensity: 2.6, roughness: 0.4 });
  const ex = (shape: THREE.Shape, depth: number, m: THREE.Material): THREE.Mesh => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
    return new THREE.Mesh(geo, m);
  };
  for (const sx of [-1, 1]) {
    // ---- headlight: slim swept-back housing, lens, DRL blade along the top, projector, amber cornering strip ----
    {
      const cx = sx * 0.58, cy = 0.62, zs = surf(sx * 0.72, 0.66, 1, 2.1);
      const L = new THREE.Group();
      L.position.set(cx, cy, zs - 0.045);
      L.rotation.y = sx * 0.3;
      const sh = lampShape(0.30, 0.085, 0.045, 0.85);
      const flip = (m: THREE.Mesh): THREE.Mesh => { m.scale.x = sx; return m; };
      L.add(flip(ex(sh, 0.05, housing)));
      const lensM = flip(ex(lampShape(0.285, 0.075, 0.045, 0.85), 0.012, lens)); lensM.position.set(sx * 0.008, 0.005, 0.06); L.add(lensM);
      const drl = flip(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.012, 0.012), ledW)); drl.position.set(sx * 0.14, 0.08, 0.064); drl.rotation.z = sx * 0.16; L.add(drl);
      const amber = flip(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.008, 0.01), ledA)); amber.position.set(sx * 0.2, 0.012, 0.062); amber.rotation.z = sx * 0.16; L.add(amber);
      for (const [px, py, pr] of [[0.09, 0.045, 0.026], [0.19, 0.058, 0.02]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(pr, 0.0045, 10, 28), chrome); ring.position.set(sx * px, py, 0.058); L.add(ring);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.92, pr * 0.5, 0.03, 24, 1, true), chrome); cup.rotation.x = Math.PI / 2; cup.position.set(sx * px, py, 0.044); L.add(cup);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(pr * 0.5, 16, 12), ledW); bulb.position.set(sx * px, py, 0.048); L.add(bulb);
      }
      g.add(L);
    }
    // ---- taillight: full-width-style LED bar, red lens, three light blades, reverse lamp ----
    {
      const cx = sx * 0.3, cy = 0.74, zs = surf(sx * 0.55, 0.78, -1, -2.3);
      const L = new THREE.Group();
      L.position.set(cx, cy, zs + 0.04);
      L.rotation.y = Math.PI - sx * 0.25;
      const sh = lampShape(0.56, 0.1, 0.03, 0.8);
      const flip = (m: THREE.Mesh): THREE.Mesh => { m.scale.x = -sx; return m; };
      L.add(flip(ex(sh, 0.05, housing)));
      const lensM = flip(ex(lampShape(0.54, 0.09, 0.03, 0.8), 0.012, lensR)); lensM.position.set(-sx * 0.008, 0.005, 0.06); L.add(lensM);
      for (let i = 0; i < 3; i++) {
        const blade = flip(new THREE.Mesh(new THREE.BoxGeometry(0.4 - i * 0.07, 0.01, 0.012), ledR));
        blade.position.set(-sx * (0.22 - i * 0.02), 0.025 + i * 0.026, 0.062); blade.rotation.z = -sx * 0.05; L.add(blade);
      }
      const rev = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), ledW); rev.position.set(-sx * 0.07, 0.05, 0.066); L.add(rev);
      g.add(L);
    }
  }
  return g;
}

// underbody: flat carbon undertray with stiffening ribs, transmission tunnel, gearbox, propshaft, exhaust runs with mufflers,
// front and rear subframes, fuel tank, skid plate. Hangs between the axles, below the cabin pan.
function buildUnderbody(spec: ScanSpec): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const W = spec.wheels;
  const carbon = std(0x0b0c0f, 0.55, 0.45), gun = std(0x2a2d32, 0.45, 0.85), alu = std(0xa6aab1, 0.35, 0.9), blk = std(0x09090b, 0.7, 0.4), ti = std(0x8d857a, 0.3, 1.0);
  const zf = W.frontZ, zr = W.rearZ;
  const len = zf - zr + 0.5, zc = (zf + zr) / 2;
  add(new THREE.BoxGeometry(1.5, 0.025, len), carbon, 0, 0.155, zc);
  for (let z = zr; z <= zf; z += 0.42) add(new THREE.BoxGeometry(1.4, 0.02, 0.025), blk, 0, 0.14, z);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.06, len - 0.3), blk, sx * 0.72, 0.185, zc);
    add(new THREE.BoxGeometry(0.03, 0.05, 1.2), carbon, sx * 0.62, 0.13, zc);
  }
  add(new THREE.BoxGeometry(0.34, 0.1, len - 1.1), gun, 0, 0.22, zc - 0.1);
  add(new THREE.CylinderGeometry(0.16, 0.19, 0.62, 24), gun, 0, 0.3, zf - 0.95, Math.PI / 2, 0, 0);
  add(new THREE.BoxGeometry(0.3, 0.26, 0.6), gun, 0, 0.28, zf - 1.5);
  add(new THREE.CylinderGeometry(0.04, 0.04, zf - zr - 1.9, 16), alu, 0, 0.24, (zf - 2.0 + zr + 0.5) / 2 - 0.1, Math.PI / 2, 0, 0);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.038, 0.038, zf - zr - 0.55, 16), ti, sx * 0.28, 0.19, zc - 0.05, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 24), ti, sx * 0.3, 0.2, zr + 0.35, Math.PI / 2, 0, 0);
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.016, 24), gun, sx * 0.3, 0.2, zr + 0.1, Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(0.113, 0.004, 8, 28), alu, sx * 0.3, 0.2, zr + 0.2 + i * 0.14, 0, Math.PI / 2, 0);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 12), ti, sx * 0.38, 0.2, zr + 0.05, Math.PI / 2, 0, 0);
  }
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.07, 0.09, 1.0), blk, sx * 0.4, 0.26, zf + 0.4);
    add(new THREE.BoxGeometry(0.07, 0.09, 0.9), blk, sx * 0.4, 0.26, zr - 0.15);
  }
  add(new THREE.BoxGeometry(1.0, 0.07, 0.08), blk, 0, 0.26, zf + 0.78);
  add(new THREE.BoxGeometry(0.9, 0.07, 0.08), blk, 0, 0.26, zr - 0.55);
  add(new THREE.BoxGeometry(0.9, 0.07, 0.08), blk, 0, 0.26, zf - 0.2);
  add(new THREE.BoxGeometry(1.05, 0.02, 0.5), carbon, 0, 0.115, zf + 0.5);
  add(new THREE.BoxGeometry(0.95, 0.2, 0.5), blk, 0, 0.255, zr + 0.95);
  for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.01, 0.03, 0.5), carbon, i * 0.18, 0.15, zr + 0.95);
  return g;
}

// front grille and intakes as real geometry behind the cuts in the nose, matching each opening's polygon from the reference: carbon frame that
// follows the bumper curve, honeycomb or slat mesh, dark cavity and a radiator core behind. Surface z is ray cast on a coarse grid.
export interface Opening { name: string; poly: number[][]; mesh: 'hex' | 'slats'; divider?: number }
function buildFront(shells: THREE.Mesh[], origin: THREE.Vector3, openings: Opening[]): THREE.Group {
  const g = new THREE.Group();
  const rc = new THREE.Raycaster();
  const surfZ = (x: number, y: number): number => {
    rc.set(new THREE.Vector3(origin.x + x, origin.y + y, origin.z + 6), new THREE.Vector3(0, 0, -1)); rc.far = 12;
    const h = rc.intersectObjects(shells, false)[0];
    return h ? h.point.z - origin.z : 2.25;
  };
  const carbon = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.38, metalness: 0.6 });
  const wire = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.3, metalness: 0.95, side: THREE.DoubleSide });
  const cavity = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.9, metalness: 0.1 });
  const core = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9bcc3, roughness: 0.18, metalness: 1 });
  const hexGeo = new THREE.CylinderGeometry(0.0155, 0.0155, 0.028, 6, 1, true);
  hexGeo.rotateX(Math.PI / 2);
  const inside = (poly: number[][], x: number, y: number, m: number): boolean => {
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      const nx = y1 - y0, ny = -(x1 - x0), len = Math.hypot(nx, ny) || 1;
      if ((nx * (x - x0) + ny * (y - y0)) / len > -m) return false;
    }
    return true;
  };
  for (const op of openings) {
    const P = op.poly;
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const nx = 6, ny = 4;
    const grid: number[][] = [];
    for (let j = 0; j <= ny; j++) { grid.push([]); for (let i = 0; i <= nx; i++) grid[j].push(surfZ(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny)); }
    const zAt = (x: number, y: number): number => {
      const u = Math.min(nx - 1e-6, Math.max(0, (x - x0) / (x1 - x0) * nx)), v = Math.min(ny - 1e-6, Math.max(0, (y - y0) / (y1 - y0) * ny));
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      return grid[j][i] * (1 - fu) * (1 - fv) + grid[j][i + 1] * fu * (1 - fv) + grid[j + 1][i] * (1 - fu) * fv + grid[j + 1][i + 1] * fu * fv;
    };
    const zMin = Math.min(...grid.flat());
    const shape = new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, y)));
    const cav = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false }), cavity); cav.position.z = zMin - 0.5; g.add(cav);
    const cm = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), core); cm.position.z = zMin - 0.16; cm.scale.set(0.94, 0.9, 1); cm.position.x = (1 - 0.94) * -((x0 + x1) / 2); cm.position.y = (1 - 0.9) * -((y0 + y1) / 2); g.add(cm);
    // mesh: instanced hex tubes on a hex lattice, or horizontal slats, clipped to the polygon
    const cells: THREE.Matrix4[] = [];
    if (op.mesh === 'hex') {
      const pitch = 0.0315, rowH = pitch * 0.866;
      for (let j = 0, y = y0; y < y1; j++, y += rowH) for (let x = x0 + (j % 2) * pitch / 2; x < x1; x += pitch) {
        if (!inside(P, x, y, 0.016)) continue;
        if (op.divider !== undefined && Math.abs(Math.abs(x) - op.divider) < 0.016) continue;
        cells.push(new THREE.Matrix4().makeTranslation(x, y, zAt(x, y) - 0.034));
      }
      const im = new THREE.InstancedMesh(hexGeo, wire, cells.length);
      cells.forEach((m, i) => im.setMatrixAt(i, m));
      g.add(im);
    } else {
      for (let y = y0 + 0.018; y < y1 - 0.01; y += 0.034) {
        const xsAt: number[] = []; for (let x = x0; x <= x1; x += 0.01) if (inside(P, x, y, 0.012)) xsAt.push(x);
        if (xsAt.length < 3) continue;
        const a = xsAt[0], b = xsAt[xsAt.length - 1];
        const s = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.014, 0.03), wire);
        s.position.set((a + b) / 2, y, zAt((a + b) / 2, y) - 0.04); s.rotation.x = -0.25; g.add(s);
      }
    }
    // frame: a carbon tube following the polygon edge at the surface depth, so it hugs the bumper's curve
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.04));
      for (let k = 0; k < n; k++) { const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n; pts.push(new THREE.Vector3(x, y, zAt(x, y) - 0.012)); }
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.05), pts.length * 3, 0.0085, 8, true), carbon));
    if (op.divider !== undefined) for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.02, y1 - y0, 0.03), carbon); d.position.set(s * op.divider, (y0 + y1) / 2, zAt(op.divider, (y0 + y1) / 2) - 0.02); g.add(d); }
  }
  return g;
}

// ---- interior, trunk, hinges and struts (car frame, metres) ----
function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: r * 0.35, bevelThickness: r * 0.35, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  return new THREE.Mesh(g, mat);
}

function buildSeat(sx: number, x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const alc = std(0x141416, 0.95, 0.05), leather = std(0x0e0e10, 0.55, 0.1), accent = std(0xb9531a, 0.5, 0.2), metal = std(0x2a2c30, 0.4, 0.9);
  const put = (m: THREE.Mesh, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => { m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  put(rbox(0.5, 0.13, 0.56, 0.04, alc), 0, 0.44, 0.0, Math.PI / 2, 0, 0).scale.set(1, 1, 1);          // cushion (rbox is built in xy, so lay it flat)
  put(rbox(0.46, 0.62, 0.12, 0.05, alc), 0, 0.76, -0.34, -0.38, 0, 0);                                  // backrest
  for (const s of [-1, 1]) {
    put(rbox(0.07, 0.5, 0.16, 0.03, leather), s * 0.25, 0.72, -0.3, -0.38, 0, 0);                     // backrest bolsters
    put(rbox(0.07, 0.12, 0.5, 0.03, leather), s * 0.27, 0.48, 0.0, Math.PI / 2, 0, 0);                // cushion bolsters
  }
  put(rbox(0.26, 0.22, 0.1, 0.04, alc), 0, 1.1, -0.47, -0.38, 0, 0);                                    // integrated headrest
  put(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.012), accent), 0, 0.76, -0.275, -0.38, 0, 0);    // copper centre stripe
  put(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.46), accent), 0, 0.51, 0.0);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.4), metal), 0, 0.33, 0.0);                      // seat base plate
  for (const s of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.5), metal), s * 0.18, 0.3, 0.0);   // rails
  g.position.set(x, -0.07, z);                       // seats folded down and back so a helmeted driver clears the roof
  g.userData.sx = sx;
  return g;
}

function buildCabin(): THREE.Group {
  const g = new THREE.Group();
  const dark = std(0x0d0e10, 0.8, 0.1), carpet = std(0x16171a, 0.98, 0), accent = std(0xb9531a, 0.5, 0.2), plastic = std(0x1b1c20, 0.6, 0.2);
  const lea = std(0x0a0a0c, 0.5, 0.1), chrome = std(0xb9bcc3, 0.2, 1), screen = new THREE.MeshStandardMaterial({ color: 0x06121a, emissive: 0x0a3a58, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.2 });
  const dial = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, emissive: 0xff8a2a, emissiveIntensity: 0.9, roughness: 0.4 });
  const add = mesher(g);
  add(new THREE.BoxGeometry(1.5, 0.02, 2.0), carpet, 0, 0.315, -0.1);                           // floor
  add(new THREE.BoxGeometry(0.3, 0.12, 1.9), carpet, 0, 0.38, -0.1);                            // transmission tunnel
  // dashboard: side profile extruded across the car
  const prof = new THREE.Shape([[0.84, 0.58], [0.84, 0.97], [0.62, 0.97], [0.44, 0.94], [0.36, 0.88], [0.34, 0.6]].map(([zz, yy]) => new THREE.Vector2(-zz, yy)));
  const dg = new THREE.ExtrudeGeometry(prof, { depth: 1.56, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  dg.translate(0, 0, -0.78); dg.rotateY(Math.PI / 2);
  add(dg, plastic, 0, 0, 0);
  add(new THREE.BoxGeometry(1.5, 0.012, 0.5), lea, 0, 0.98, 0.62);                              // leather dash pad
  add(new THREE.BoxGeometry(1.5, 0.008, 0.012), accent, 0, 0.95, 0.40);                         // copper stitch line
  add(new THREE.BoxGeometry(0.56, 0.13, 0.24), lea, 0.38, 1.0, 0.6);                            // instrument hood (driver, left)
  for (const dx of [0.24, 0.5]) add(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 28), dial, dx + 0.02, 0.99, 0.49, Math.PI / 2 - 0.45, 0, 0);
  add(new THREE.BoxGeometry(0.3, 0.17, 0.025), screen, -0.05, 0.9, 0.39, -0.32, 0, 0);          // centre screen
  for (const vx of [-0.45, -0.3, 0.2, 0.34]) add(new THREE.BoxGeometry(0.1, 0.03, 0.02), chrome, vx, 0.86, 0.385);   // air vents
  add(new THREE.BoxGeometry(0.22, 0.2, 1.0), plastic, 0, 0.46, -0.05);                          // centre console
  add(new THREE.BoxGeometry(0.18, 0.012, 0.3), lea, 0, 0.565, -0.2);                            // armrest pad
  add(new THREE.CylinderGeometry(0.028, 0.02, 0.1, 18), chrome, 0, 0.63, 0.22);                  // shifter
  add(new THREE.SphereGeometry(0.035, 18, 14), lea, 0, 0.69, 0.22);
  for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 14), chrome, -0.04 + (i % 3) * 0.04, 0.575, 0.0 + Math.floor(i / 3) * 0.04);   // switchgear
  // steering wheel (driver is on the left, +x)
  const sw = new THREE.Group();
  sw.position.set(0.4, 0.9, 0.38); sw.rotation.x = -0.35;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.017, 14, 48), lea); rim.scale.set(1, 0.92, 1); sw.add(rim);
  const stitch = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.0045, 6, 48), accent); stitch.position.z = 0.017; stitch.scale.set(1, 0.92, 1); sw.add(stitch);
  sw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 20), dark).rotateX(Math.PI / 2));
  for (const a of [Math.PI / 2, Math.PI * 0.18, Math.PI * 0.82]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.028, 0.012), plastic); sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09 - 0.0, 0); sp.rotation.z = a; sw.add(sp);
  }
  g.add(sw);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 14), dark, 0.4, 0.78, 0.5, Math.PI / 2 + 0.35, 0, 0);       // column
  for (const px of [0.3, 0.42]) add(new THREE.BoxGeometry(0.09, 0.012, 0.05), chrome, px, 0.4, 0.74, 0.7, 0, 0);   // pedals
  g.add(buildSeat(1, 0.4, -0.2), buildSeat(-1, -0.4, -0.2));
  // rear bulkhead / parcel shelf, headliner, mirror
  add(new THREE.BoxGeometry(1.5, 0.5, 0.05), dark, 0, 0.62, -0.98);
  add(new THREE.BoxGeometry(1.4, 0.03, 0.9), dark, 0, 0.9, -1.4);                              // parcel shelf under the fastback glass
  add(new THREE.BoxGeometry(0.95, 0.03, 1.2), std(0x18191c, 0.95, 0), 0, 1.3, -0.5);             // headliner, inside the roof
  add(new THREE.BoxGeometry(0.16, 0.05, 0.03), dark, 0, 1.2, 0.45);                              // rear-view mirror
  return g;
}

function buildTrunk(): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const carpet = std(0x18191c, 0.98, 0), trim = std(0x101114, 0.85, 0.1), metal = std(0x3a3d42, 0.5, 0.8);
  add(new THREE.BoxGeometry(1.3, 0.04, 1.0), carpet, 0, 0.58, -1.55);                           // cargo floor
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.45, 1.0), trim, sx * 0.66, 0.78, -1.55);                  // side trims
    add(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 28, 1, false, 0, Math.PI), trim, sx * 0.55, 0.35, -1.59, 0, 0, Math.PI / 2 * sx);   // wheel-arch hump
  }
  add(new THREE.BoxGeometry(1.34, 0.5, 0.04), trim, 0, 0.82, -2.18);                            // tail panel inner
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 36), carpet, 0, 0.61, -1.85);                 // spare-wheel cover
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), metal, 0, 0.625, -1.85);               // hold-down knob
  add(new THREE.BoxGeometry(1.0, 0.18, 0.04), trim, 0, 0.7, -1.04);                            // rear seat-back bulkhead
  add(new THREE.BoxGeometry(0.2, 0.012, 0.1), metal, 0.45, 0.61, -1.2);                          // tie-down plate
  return g;
}

// A clean top skin for a panel: rasterise the scan's top-facing triangles into a height grid over the panel's footprint, fill the holes from their
// neighbours, lightly smooth, and mesh it. This keeps the scan's shape but drops its tears, folds and overlapping sheets.
function topSkin(tris: Tri[], origin: THREE.Vector3, b: number[], nx: number, nz: number): Tri[] {
  const X0 = origin.x + b[0], X1 = origin.x + b[1], Z0 = origin.z + b[2], Z1 = origin.z + b[3];
  const gx = (X1 - X0) / nx, gz = (Z1 - Z0) / nz, W = nx + 1;
  const H = new Float32Array(W * (nz + 1)).fill(-1e9);
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const t of tris) {
    const a = t[0].p, bv = t[1].p, c = t[2].p;
    const minx = Math.min(a.x, bv.x, c.x), maxx = Math.max(a.x, bv.x, c.x), minz = Math.min(a.z, bv.z, c.z), maxz = Math.max(a.z, bv.z, c.z);
    if (maxx < X0 || minx > X1 || maxz < Z0 || minz > Z1) continue;
    n.copy(e1.copy(bv).sub(a)).cross(e2.copy(c).sub(a));
    const len = n.length();
    if (len < 1e-12 || Math.abs(n.y) / len < 0.25) continue;
    const den = (bv.z - c.z) * (a.x - c.x) + (c.x - bv.x) * (a.z - c.z);
    if (Math.abs(den) < 1e-14) continue;
    for (let j = Math.max(0, Math.ceil((minz - Z0) / gz)); j <= Math.min(nz, Math.floor((maxz - Z0) / gz)); j++) for (let i = Math.max(0, Math.ceil((minx - X0) / gx)); i <= Math.min(nx, Math.floor((maxx - X0) / gx)); i++) {
      const x = X0 + i * gx, z = Z0 + j * gz;
      const l1 = ((bv.z - c.z) * (x - c.x) + (c.x - bv.x) * (z - c.z)) / den, l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * a.y + l2 * bv.y + l3 * c.y;
      if (y > H[j * W + i]) H[j * W + i] = y;
    }
  }
  // fill holes from known neighbours
  for (let pass = 0; pass < 400; pass++) {
    let any = false;
    const next = H.slice();
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      if (H[j * W + i] > -1e8) continue;
      let s = 0, k = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii > nx || jj > nz) continue; const v = H[jj * W + ii]; if (v > -1e8) { s += v; k++; } }
      if (k) { next[j * W + i] = s / k; any = true; }
    }
    H.set(next);
    if (!any) break;
  }
  for (let i = 0; i < H.length; i++) if (H[i] < -1e8) H[i] = 0;
  for (let pass = 0; pass < 2; pass++) {           // light smoothing, edges kept
    const s = H.slice();
    for (let j = 1; j < nz; j++) for (let i = 1; i < nx; i++) H[j * W + i] = 0.5 * s[j * W + i] + 0.125 * (s[j * W + i - 1] + s[j * W + i + 1] + s[(j - 1) * W + i] + s[(j + 1) * W + i]);
  }
  const vx = (i: number, j: number): Vtx => {
    const h = H[j * W + i];
    const dx = (H[j * W + Math.min(nx, i + 1)] - H[j * W + Math.max(0, i - 1)]) / (gx * (Math.min(nx, i + 1) - Math.max(0, i - 1)));
    const dz = (H[Math.min(nz, j + 1) * W + i] - H[Math.max(0, j - 1) * W + i]) / (gz * (Math.min(nz, j + 1) - Math.max(0, j - 1)));
    return { p: new THREE.Vector3(X0 + i * gx, h, Z0 + j * gz), n: new THREE.Vector3(-dx, 1, -dz).normalize(), uv: new THREE.Vector2(i / nx, j / nz) };
  };
  const out: Tri[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = vx(i, j), bb = vx(i + 1, j), c = vx(i + 1, j + 1), d = vx(i, j + 1);
    out.push([a, d, bb], [bb, d, c]);              // wound so the normal faces up
  }
  return out;
}

// the driver: racing suit, gloves on the wheel, boots on the pedals and a full-face helmet with a tinted visor, seated in the left (driver) seat
function buildDriver(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'driver';
  const suit = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.7, metalness: 0.05 });
  const suitAcc = new THREE.MeshStandardMaterial({ color: 0xb9531a, roughness: 0.6, metalness: 0.05 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.8 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, metalness: 0.1 });
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f4, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const stripe = new THREE.MeshPhysicalMaterial({ color: 0xb9531a, roughness: 0.3, metalness: 0.2, clearcoat: 1 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x0a1018, roughness: 0.05, metalness: 0.6, clearcoat: 1, envMapIntensity: 2 });
  const X = 0.4;
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): void => {
    const len = a.distanceTo(b);
    const me = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 12), m);
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(me);
  };
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const pelvis = V(X, 0.58, -0.22), chest = V(X, 0.88, -0.4), neck = V(X, 1.0, -0.45);
  limb(pelvis, chest, 0.15, suit);                                   // torso
  limb(V(X, 0.84, -0.3), V(X, 0.84, -0.3), 0.001, suit);
  const shoulderL = V(X + 0.2, 0.91, -0.4), shoulderR = V(X - 0.2, 0.91, -0.4);
  const elbowL = V(X + 0.26, 0.82, 0.02), elbowR = V(X - 0.26, 0.82, 0.02);
  const handL = V(X + 0.17, 0.93, 0.36), handR = V(X - 0.17, 0.93, 0.36);   // ten and two on the wheel
  for (const [s, e, h] of [[shoulderL, elbowL, handL], [shoulderR, elbowR, handR]] as [THREE.Vector3, THREE.Vector3, THREE.Vector3][]) {
    limb(s, e, 0.05, suit); limb(e, h, 0.045, suit);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), glove); gl.position.copy(h); gl.scale.set(1, 0.9, 1.15); g.add(gl);
  }
  for (const s of [-1, 1]) {                                          // legs
    const hip = V(X + s * 0.1, 0.55, -0.15), knee = V(X + s * 0.11, 0.62, 0.22), ankle = V(X + s * 0.1, 0.42, 0.62);
    limb(hip, knee, 0.075, suit); limb(knee, ankle, 0.06, suit);
    const bt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.22), boot); bt.position.set(X + s * 0.1, 0.4, 0.7); bt.rotation.x = 0.5; g.add(bt);
  }
  limb(V(X - 0.16, 0.95, -0.3), V(X + 0.16, 0.95, -0.3), 0.03, suitAcc);      // shoulder harness bar
  const belt1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.01), suitAcc); belt1.position.set(X - 0.1, 0.86, -0.18); belt1.rotation.x = -0.25; belt1.rotation.z = 0.12; g.add(belt1);
  const belt2 = belt1.clone(); belt2.position.x = X + 0.1; belt2.rotation.z = -0.12; g.add(belt2);
  limb(neck, V(X, 1.05, -0.45), 0.06, suit);                          // neck / HANS collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 10, 24), suitAcc); collar.position.set(X, 0.98, -0.44); collar.rotation.x = Math.PI / 2 - 0.3; g.add(collar);
  // helmet: shell, visor opening, chin bar, rear spoiler, copper stripes
  const head = new THREE.Group();
  head.position.set(X, 1.14, -0.47);
  head.rotation.x = 0.05;
  const hs = new THREE.Mesh(new THREE.SphereGeometry(0.155, 36, 26), shell); hs.scale.set(0.92, 1.0, 1.1); head.add(hs);
  const vs = new THREE.Mesh(new THREE.SphereGeometry(0.16, 28, 18, Math.PI / 2 - 0.95, 1.9, 1.2, 0.5), visor); vs.scale.set(0.93, 1.0, 1.11); head.add(vs);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), shell); chin.position.set(0, -0.075, 0.095); chin.scale.set(1.0, 0.8, 1.1); head.add(chin);
  for (const sz of [-0.02, 0.02]) { const st = new THREE.Mesh(new THREE.TorusGeometry(0.157, 0.008, 6, 40, Math.PI), stripe); st.rotation.y = Math.PI / 2; st.rotation.z = Math.PI / 2; st.position.set(sz * 0, 0.0, 0.0); st.scale.set(1.1, 0.92, 1); st.position.x = sz; head.add(st); }
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.07), stripe); spoiler.position.set(0, 0.06, -0.17); spoiler.rotation.x = -0.2; head.add(spoiler);
  g.add(head);
  g.position.y = -0.06;
  return g;
}

// black cowl panel with the wiper trough: closes the gap between the hood and the windshield (the scan has holes there) and reads as a real part
function buildCowl(): THREE.Group {
  const g = new THREE.Group();
  const plastic = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.75, metalness: 0.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9bcc3, roughness: 0.2, metalness: 1 });
  for (const sx of [-1, 1]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.025, 0.15), plastic);
    seg.position.set(sx * 0.32, 1.035, 0.87);
    seg.rotation.z = -sx * 0.03;
    g.add(seg);
  }
  for (let i = 0; i < 8; i++) { const slot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: 0x020203 })); slot.position.set(-0.45 + i * 0.13, 1.049, 0.925); g.add(slot); }   // drain slots
  for (const sx of [-1, 1]) {                                                                                                                                         // wiper pivots
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 12), chrome); p.position.set(sx * 0.3, 1.055, 0.86); g.add(p);
  }
  return g;
}

// wheel-well hardware per corner: control arms, knuckle, damper with coil spring, tie rod, anti-roll bars, rear driveshaft
function buildSuspension(spec: ScanSpec): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const W = spec.wheels;
  const alu = std(0xa9adb4, 0.35, 0.9), blk = std(0x101113, 0.55, 0.6), spring = std(0xe2561f, 0.4, 0.5), damper = std(0x1d1e22, 0.35, 0.8), gold = std(0xd3a13a, 0.3, 0.9);
  const bar = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): void => {
    const len = a.distanceTo(b);
    const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(me);
  };
  const corners: [boolean, number][] = [[true, 1], [true, -1], [false, 1], [false, -1]];
  for (const [front, sx] of corners) {
    const z = front ? W.frontZ : W.rearZ, x = (front ? W.frontX : W.rearX) * sx, inward = -sx;
    const hub = new THREE.Vector3(x + inward * 0.1, W.centreY * W.scale, z);
    // lower wishbone (two legs to the subframe), upper arm, tie rod
    bar(hub.clone().add(new THREE.Vector3(0, -0.13, 0)), new THREE.Vector3(x + inward * 0.5, 0.27, z + 0.25), 0.014, alu);
    bar(hub.clone().add(new THREE.Vector3(0, -0.13, 0)), new THREE.Vector3(x + inward * 0.5, 0.27, z - 0.25), 0.014, alu);
    bar(hub.clone().add(new THREE.Vector3(0, 0.16, 0)), new THREE.Vector3(x + inward * 0.5, 0.58, z + 0.1), 0.012, alu);
    bar(hub.clone().add(new THREE.Vector3(0, 0.04, front ? -0.1 : 0.1)), new THREE.Vector3(x + inward * 0.5, 0.36, front ? -0.28 : 0.28), 0.008, blk);
    // knuckle
    add(new THREE.BoxGeometry(0.05, 0.32, 0.1), blk, hub.x, hub.y, hub.z - (front ? 0.02 : -0.02));
    // damper + coil spring (a real helix), mounted on the lower arm and running to the arch top
    const lo = new THREE.Vector3(x + inward * 0.12, 0.3, z + (front ? 0.04 : -0.04)), hi = new THREE.Vector3(x + inward * 0.2, 0.78, z + (front ? 0.02 : -0.02));
    bar(lo, hi, 0.022, damper);
    bar(lo.clone().lerp(hi, 0.55), hi, 0.016, gold);
    const pts: THREE.Vector3[] = [];
    const axis = hi.clone().sub(lo), up = axis.clone().normalize();
    const side = new THREE.Vector3(1, 0, 0).cross(up).normalize(), side2 = up.clone().cross(side);
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, a = t * Math.PI * 2 * 7;
      pts.push(lo.clone().addScaledVector(axis, 0.08 + t * 0.84).addScaledVector(side, Math.cos(a) * 0.052).addScaledVector(side2, Math.sin(a) * 0.052));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.0065, 6), spring));
    if (!front) bar(new THREE.Vector3(inward * 0.2 * sx, 0.34, z), new THREE.Vector3(hub.x, hub.y, hub.z), 0.026, blk);   // driveshaft
  }
  // anti-roll bars
  for (const [z, y] of [[W.frontZ - 0.28, 0.3], [W.rearZ + 0.28, 0.32]]) {
    bar(new THREE.Vector3(-0.6, y, z), new THREE.Vector3(0.6, y, z), 0.016, blk);
    bar(new THREE.Vector3(0.6, y, z), new THREE.Vector3(0.68, y + 0.04, z + (z > 0 ? 0.22 : -0.22)), 0.012, blk);
    bar(new THREE.Vector3(-0.6, y, z), new THREE.Vector3(-0.68, y + 0.04, z + (z > 0 ? 0.22 : -0.22)), 0.012, blk);
  }
  add(new THREE.BoxGeometry(0.34, 0.2, 0.3), blk, 0, 0.28, W.rearZ);        // rear differential
  return g;
}

// smooth normals by shared position: the generated mesh is lumpy, and flat per-triangle normals make the clearcoat reflect blotchy
function smoothNormals(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const acc = new Map<string, number[]>();
  const key = (i: number): string => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.copy(b).sub(a).cross(c.clone().sub(a));            // area-weighted
    for (let v = 0; v < 3; v++) {
      const k = key(t + v);
      const e = acc.get(k);
      if (e) { e[0] += n.x; e[1] += n.y; e[2] += n.z; } else acc.set(k, [n.x, n.y, n.z]);
    }
  }
  const nm = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const e = acc.get(key(i))!;
    n.set(e[0], e[1], e[2]).normalize();
    nm[i * 3] = n.x; nm[i * 3 + 1] = n.y; nm[i * 3 + 2] = n.z;
  }
  // second, wider pass: average the normals inside 4 cm cells and blend, so the lumpy scan shell reflects as smoothly as the clean hood and roof skins
  const coarse = new Map<string, number[]>();
  const ck = (i: number): string => `${Math.round(pos.getX(i) * 14)},${Math.round(pos.getY(i) * 14)},${Math.round(pos.getZ(i) * 14)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = ck(i), e = coarse.get(k);
    if (e) { e[0] += nm[i * 3]; e[1] += nm[i * 3 + 1]; e[2] += nm[i * 3 + 2]; } else coarse.set(k, [nm[i * 3], nm[i * 3 + 1], nm[i * 3 + 2]]);
  }
  for (let i = 0; i < pos.count; i++) {
    const e = coarse.get(ck(i))!;
    n.set(e[0], e[1], e[2]).normalize();
    const bx = nm[i * 3] * 0.2 + n.x * 0.8, by = nm[i * 3 + 1] * 0.2 + n.y * 0.8, bz = nm[i * 3 + 2] * 0.2 + n.z * 0.8;
    const l = Math.hypot(bx, by, bz) || 1;
    nm[i * 3] = bx / l; nm[i * 3 + 1] = by / l; nm[i * 3 + 2] = bz / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
}

export async function loadScanCar(spec: ScanSpec): Promise<CarRig> {
  // body source: the clean modelled body (sovbody.ts, from the reference measurements) or, for an old scan car, a generated mesh
  const modelled = spec.body === 'modelled';
  const root: THREE.Object3D = modelled ? new THREE.Group() : (await new GLTFLoader().loadAsync(spec.glb)).scene;
  if (modelled) root.add(new THREE.Mesh(buildBodyGeometry(), new THREE.MeshStandardMaterial()));
  const paint = new THREE.Color(Number(spec.paint));
  const bb = new THREE.Box3();
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox!); } });
  const bmin = bb.min.clone(), bsz = bb.getSize(new THREE.Vector3());
  const origin = modelled ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(bmin.x + bsz.x / 2, bmin.y, bmin.z + bsz.z / 2);
  const W = spec.wheels;
  const cuts = spec.cuts !== false;                 // false = the whole scan shell with shader glass (the earlier look), no openable panels
  const pnames = cuts ? Object.keys(spec.panels).slice(0, 4) : [];
  const pmin: THREE.Vector3[] = [], pmax: THREE.Vector3[] = [];      // seam boxes are gone: the gaps are real cuts now
  for (let i = 0; i < 4; i++) { pmin.push(new THREE.Vector3(9, 9, 9)); pmax.push(new THREE.Vector3(9, 9, 9)); }
  const noDisc = location.search.includes('nodisc');

  // paint is a live material the player can change: colour, metallic flake, finish (0 gloss, 1 satin, 2 matte, 3 chrome)
  const uni = { uPaint: { value: new THREE.Vector3(paint.r, paint.g, paint.b) }, uFlake: { value: 0.35 }, uFinish: { value: 0 }, uPearl: { value: new THREE.Vector3(paint.r, paint.g, paint.b) }, uPearlAmt: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ metalness: 0.5, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.4, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = uni.uPaint; sh.uniforms.uFlake = uni.uFlake; sh.uniforms.uFinish = uni.uFinish; sh.uniforms.uPearl = uni.uPearl; sh.uniforms.uPearlAmt = uni.uPearlAmt;
    sh.uniforms.uOrg = { value: origin };
    sh.uniforms.uLen = { value: bsz.z };
    sh.uniforms.uWid = { value: bsz.x };
    sh.uniforms.uDisc = { value: noDisc ? 0 : 1 };
    sh.uniforms.uCut = { value: cuts ? 1 : 0 };
    sh.uniforms.uSide = { value: Array.from({ length: 8 }, (_, i) => new THREE.Vector2(spec.glass.sideWindow[i % spec.glass.sideWindow.length][0], spec.glass.sideWindow[i % spec.glass.sideWindow.length][1])) };
    sh.uniforms.uGl = { value: new THREE.Vector4(spec.glass.windTop, spec.glass.windBase, spec.glass.rearBase2, spec.glass.rearTop) };
    sh.uniforms.uWh = { value: new THREE.Vector4(W.frontZ, W.rearZ, W.centreY, W.discardR) };
    sh.uniforms.uWr = { value: new THREE.Vector2(W.tyreR, W.rimR) };
    sh.uniforms.uPMin = { value: pmin };
    sh.uniforms.uPMax = { value: pmax };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uFlake, uFinish, uPearlAmt, uCut; uniform vec3 uPearl; uniform vec2 uSide[8]; uniform vec4 uGl;
      bool inSide(vec2 p) { for (int i = 0; i < 8; i++) { int j = i == 7 ? 0 : i + 1; vec2 e = uSide[j] - uSide[i]; if (dot(vec2(e.y, -e.x), p - uSide[i]) > 0.0) return false; } return true; }
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      uniform float uDisc, uLen, uWid; uniform vec3 uPaint, uOrg; uniform vec4 uWh; uniform vec2 uWr; uniform vec3 uPMin[4]; uniform vec3 uPMax[4]; varying vec3 vObj;
      float gBody; float gMetal; float gRough; vec3 gLamp;
      float hexEdge(vec2 p, float s) { p /= s; vec2 r = vec2(1.0, 1.7320508), h = r * 0.5; vec2 a = mod(p, r) - h, b = mod(p - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b; return max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)); }
      float sdBox(vec3 p, vec3 lo, vec3 hi) { vec3 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5, q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }`)
    .replace('#include <map_fragment>', `
      // the baked texture is only read to find the glass (dark) and the old wheel spokes; paint is always one solid colour
      vec4 bk = texture2D(map, vMapUv);
      float lum = dot(bk.rgb, vec3(0.299, 0.587, 0.114));
      vec3 cp = vec3(vObj.x - uOrg.x, vObj.y - uOrg.y, vObj.z - uOrg.z);   // car frame: x across, y up, z along (nose +)
      float zN = cp.z / uLen, ax = abs(cp.x);
      float dw = min(length(vec2(cp.z - uWh.x, cp.y - uWh.z)), length(vec2(cp.z - uWh.y, cp.y - uWh.z)));
      if (ax > uWid * 0.22 && dw < uWh.w && uDisc > 0.5) discard;           // baked wheels are replaced by real ones
      bool wheelZone = ax > uWid * 0.27 && dw < uWr.x;
      bool tyre = wheelZone && dw > uWr.y;
      bool rim = wheelZone && dw <= uWr.y;
      bool cabin = cp.y > 0.86 && zN < 0.2 && zN > -0.32 && ax < uWid * 0.46;
      // glass is the window openings, read from the source image (dark, with a wide blur so reflections do not punch holes); roof and pillars stay paint
      float lumB = dot(textureLod(map, vMapUv, 3.0).rgb, vec3(0.299, 0.587, 0.114));
      bool glass = uCut < 0.5 && ((ax > 0.45 && inSide(vec2(cp.z, cp.y))) || (cp.z > uGl.x && cp.z < uGl.y && ax < 0.5 + 0.13 * (cp.z - uGl.x) && cp.y > 1.0) || (cp.z > uGl.z && cp.z < uGl.w && ax < 0.52 && cp.y > 1.08));
      bool nose = zN > 0.40;
      // the grille and intakes are real geometry now: the bumper is cut open here and the parts sit behind the cut
      bool openG = nose && ax < 0.46 && cp.y > 0.37 && cp.y < 0.62;
      bool openI = nose && ax > 0.10 && ax < 0.74 && cp.y > 0.14 && cp.y < 0.31;
      bool grille = uCut < 0.5 && nose && ax < 0.46 && cp.y > 0.37 && cp.y < 0.62;
      bool intake = uCut < 0.5 && nose && ax > 0.10 && ax < 0.74 && cp.y > 0.14 && cp.y < 0.31;
      float slat = 0.5 + 0.5 * sin(cp.y * 90.0);
      bool headL = nose && ax > 0.54 && ax < 0.88 && cp.y > 0.60 + (ax - 0.54) * 0.25 && cp.y < 0.70 + (ax - 0.54) * 0.25;
      bool tailL = zN < -0.40 && ax > 0.30 && ax < 0.86 && cp.y > 0.70 && cp.y < 0.86;
      // black trim: both bumpers, side skirts, arch lips
      bool bumper = (zN > 0.43 && cp.y < 0.58) || (zN < -0.43 && cp.y < 0.62);
      bool skirt = ax > 0.60 && cp.y < 0.30 && abs(zN) < 0.30;
      bool archLip = ax > uWid * 0.30 && dw < uWr.x + 0.095;
      vec3 col = uPaint; gBody = 1.0; gMetal = 0.5; gRough = 0.28; gLamp = vec3(0.0);
      {
        float fl = h31(floor(cp * 900.0));
        col = mix(col, uPearl, uPearlAmt * smoothstep(-0.8, 0.8, cp.x * sign(cp.z + 0.01) + cp.y * 0.4));
        col *= 1.0 + uFlake * (fl - 0.5) * 0.7 * step(uFinish, 1.5);
        if (uFinish > 2.5) { gMetal = 1.0; gRough = 0.07; gBody = 0.0; }
        else if (uFinish > 1.5) { gMetal = 0.15; gRough = 0.82; gBody = 0.0; }
        else if (uFinish > 0.5) { gMetal = 0.4; gRough = 0.45; gBody = 0.35; }
      }
      if (tyre) { col = vec3(0.018, 0.018, 0.02); gBody = 0.0; gMetal = 0.0; gRough = 0.88; }
      else if (rim) { col = vec3(0.04); gBody = 0.0; gMetal = 1.0; gRough = 0.3; }
      else if (glass) {
        // tinted glass: a very soft, blurred hint of the interior behind a clean dark tint, so no smeared bands cross the pillars and hood line
        vec3 soft = textureLod(map, vMapUv, 5.0).rgb;
        col = vec3(0.007, 0.009, 0.013) + soft * 0.05; gBody = 1.0; gMetal = 0.0; gRough = 0.02;
      }
      else if (headL) {
        // dark glossy lamp housing, a thin DRL strip along the top edge and one projector lens
        float hy = cp.y - (0.60 + (ax - 0.54) * 0.25);
        float lit = max(smoothstep(0.012, 0.006, abs(hy - 0.085)), smoothstep(0.034, 0.026, length(vec2(ax - 0.66, hy - 0.045))));
        col = vec3(0.012, 0.014, 0.018);                                         // the lamp assembly itself is real geometry now
        gBody = 0.0; gMetal = 0.3; gRough = 0.12; gLamp = vec3(0.0);
      }
      else if (tailL) { col = vec3(0.02, 0.004, 0.004); gBody = 0.0; gMetal = 0.2; gRough = 0.12; gLamp = vec3(0.0); }
      else if (grille || intake) {
        // race-car openings: carbon-black frame, then wire honeycomb over a deep dark cavity (grille also gets horizontal bars)
        float fe = grille ? min(min(0.50 - ax, cp.y - 0.34), 0.64 - cp.y) : min(min(0.78 - ax, cp.y - 0.12), 0.34 - cp.y);
        float hd = hexEdge(vec2(cp.x, cp.y), 0.026);
        float wire = smoothstep(0.36, 0.43, hd);                          // 1 on the wire, 0 in the hole
        float depth = smoothstep(0.0, 0.10, fe);                          // cavity gets darker away from the frame
        float bars = grille ? smoothstep(0.82, 0.95, 0.5 + 0.5 * sin(cp.y * 95.0)) : 0.0;
        float divider = smoothstep(0.02, 0.012, abs(ax - 0.0)) * float(intake) + smoothstep(0.016, 0.01, abs(ax - 0.40)) * float(intake);
        float frame = 1.0 - smoothstep(0.018, 0.03, fe);
        vec3 holeC = vec3(0.004, 0.004, 0.005);
        vec3 wireC = vec3(0.34, 0.35, 0.38) * (0.35 + 0.65 * (1.0 - depth * 0.7));
        col = mix(holeC, wireC, max(wire * 0.85, bars * 0.7));
        col = mix(col, vec3(0.03, 0.03, 0.034), max(frame, divider));
        gBody = 0.0; gMetal = mix(0.1, 0.9, max(wire, bars) * (1.0 - frame)); gRough = mix(0.8, 0.32, max(wire, bars));
      }
      else if (bumper || skirt || archLip) { col = vec3(0.016, 0.016, 0.018); gBody = 0.15; gMetal = 0.15; gRough = 0.5; }
      else {
        float sd = 9.0;                                                        // panel seams: dark gap where the surface crosses a panel boundary
        for (int i = 0; i < 4; i++) sd = min(sd, abs(sdBox(cp, uPMin[i], uPMax[i])));
        // a real panel gap is a few millimetres: a hairline dark cut with a faint bevel highlight beside it
        float seam = 1.0 - smoothstep(0.0012, 0.0028, sd);
        float bevel = smoothstep(0.0028, 0.0045, sd) * (1.0 - smoothstep(0.0045, 0.009, sd));
        col = mix(col, vec3(0.012), seam) * (1.0 + 0.16 * bevel); gBody *= 1.0 - seam; gRough = mix(gRough, 0.7, seam);
      }
      if (!gl_FrontFacing && zN > 0.30 && cp.y > 0.5) discard;                 // stray one-sided scan sheets around the nose
      if (!gl_FrontFacing) { col *= 0.88; gLamp = vec3(0.0); }   // folds and inner faces of the scan read as inner painted panel, not black teeth
      diffuseColor.rgb = col;
    `)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMetal;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gLamp;')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= gBody;');
  };
  mat.customProgramCacheKey = () => 'scan-car-v21';

  // ---- mesh surgery: cut the scan into separate real pieces with clean edges, gaps and thickness (see scanparts.ts) ----
  const g = new THREE.Group();
  const pivots: Record<string, { pivot: THREE.Group; axis: THREE.Vector3; angle: number; t: number; target: number }> = {};
  const shells: THREE.Mesh[] = [];                 // uncut copies, only used to ray cast the true surface
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) meshes.push(m); });
  const GAP = 0.0015;
  const gl = spec.glass, fr = spec.front;
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x06090d, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.5, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4, side: THREE.DoubleSide });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.65, metalness: 0.5, side: THREE.DoubleSide });
  const mk = (tris: Tri[], m: THREE.Material): THREE.Mesh => new THREE.Mesh(toGeometry(tris), m);
  // prism through a convex polygon in the front (x, y) plane, nose side only (z >= zLo)
  const frontPrism = (poly: number[][], zLo: number): Region => {
    const r: Region = [];
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      const nx = y1 - y0, ny = -(x1 - x0), len = Math.hypot(nx, ny) || 1;
      r.push(plane(nx / len, ny / len, 0, (nx * x0 + ny * y0) / len, false));
    }
    r.push(plane(0, 0, -1, -zLo, false));
    return r;
  };
  const doorZ0 = gl.doorFront, doorZ1 = gl.doorRear;
  const mirrorPts = (pts: number[][]): number[][] => pts.map(([z, y]) => [z, y]);
  const panelRegions = (name: string): Region[] => {
    const s = name === 'doorR' ? -1 : 1;
    const bx = (lo: number[], hi: number[], edge: boolean[]): Region => (s > 0 ? boxRegion(lo, hi, edge) : boxRegion([-hi[0], lo[1], lo[2]], [-lo[0], hi[1], hi[2]], [edge[1], edge[0], edge[2], edge[3], edge[4], edge[5]]));
    if (name === 'doorL' || name === 'doorR') {
      const yB = gl.belt;
      return [
        bx([0.45, 0.2, doorZ1], [1.4, yB + 0.03, doorZ0], [false, false, false, true, true, true]),
        sideRegion([[doorZ1, yB - 0.03], [gl.pillarBase, yB - 0.03], [gl.pillarTop, gl.roofEdge], [doorZ1, gl.roofEdge]], s, 0.5, true).map((p, i) => (i === 0 ? { ...p, g: false } : p)),
      ];
    }
    if (name === 'hood') return [boxRegion([-0.74, 0.78, gl.windBase + 0.04], [0.74, 1.3, 2.02])];
    return [boxRegion([-0.82, 0.95, -2.45], [0.82, 1.3, gl.rearBase - 0.02])];     // trunk
  };
  // side glass: the side surface only (so the roof edge stays paint), plus a wider band at the A-pillar so the pillar is thin like the reference
  const sideGlass = (s: number): Region[] => {
    const a = sideRegion(gl.sideWindow, s, 0.58, false);
    const b = sideRegion(gl.sideWindow, s, 0.4, false);
    b.push(plane(0, 0, -1, 0.05, false));                                                    // only ahead of z = -0.05
    b.push(s > 0 ? plane(-1, 0, -0.089, -0.5756, false) : plane(1, 0, -0.089, -0.5756, false));   // xMin falls from 0.58 to about 0.50 at the pillar base
    return [a, b];
  };
  const windGlass: Region = [
    plane(0, 0, 1, gl.windBase, false), plane(0, 0, -1, -gl.windTop, false), plane(0, -1, 0, -1.0, false), plane(0, 1, 0, 1.5, false),
    plane(1, 0, -0.13, 0.58 - 0.13 * gl.windTop, false), plane(-1, 0, -0.13, 0.58 - 0.13 * gl.windTop, false),
  ];
  const rearGlass: Region = [
    plane(0, 0, 1, gl.rearTop, false), plane(0, 0, -1, -gl.rearBase2, false), plane(0, -1, 0, -1.08, false), plane(0, 1, 0, 1.5, false),
    plane(1, 0, 0, 0.52, false), plane(-1, 0, 0, 0.52, false),
  ];
  for (const m of meshes) {
    const geo0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    smoothNormals(geo0);
    shells.push(new THREE.Mesh(geo0, mat));
    const bakedMap = (m.material as THREE.MeshStandardMaterial).map;
    if (bakedMap) mat.map = bakedMap;
    if (modelled && !mat.map) { mat.map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); mat.map.needsUpdate = true; }
    let tris = toTris(geo0);
    // grille and intakes: cut the openings out of the nose (shape from spec.front.openings)
    if (cuts) for (const op of fr.openings) tris = clipRegion(tris, toMesh(frontPrism(op.poly, 1.6), origin), 0, 'outside');
    const toGeom = (r: Region): Region => toMesh(r, origin);
    const pieces: Record<string, { skin: Tri[]; glass: Tri[] }> = {};
    let rest = tris;
    for (const name of pnames) {
      let sp: { panel: Tri[]; rest: Tri[] };
      if (name === 'doorL' || name === 'doorR') {
        // a door is only the side-facing skin: the fender top, cowl and roof rail (which face up) stay on the body, so they do not swing open with the door
        const s = name === 'doorR' ? -1 : 1;
        const sideT: Tri[] = [], other: Tri[] = [];
        for (const t of rest) ((t[0].n.x + t[1].n.x + t[2].n.x) * s / 3 > 0.42 ? sideT : other).push(t);
        const d = splitUnion(sideT, panelRegions(name).map(toGeom), GAP);
        sp = { panel: d.panel, rest: other.concat(d.rest) };
      } else sp = splitUnion(rest, panelRegions(name).map(toGeom), GAP);
      rest = sp.rest;
      let skin = sp.panel, glass: Tri[] = [];
      if (name === 'doorL' || name === 'doorR') {
        const sg = splitUnion(skin, sideGlass(name === 'doorR' ? -1 : 1).map(toGeom), 0);
        skin = sg.rest; glass = sg.panel;
      }
      pieces[name] = { skin, glass };
    }
    // hood and trunk lid: replace the scan's torn top surface with a clean skin of the same shape
    if (pieces.hood) pieces.hood.skin = topSkin(tris, origin, [-0.7385, 0.7385, gl.windBase + 0.04 + GAP / 2, 2.02 - GAP / 2], 48, 58);
    if (pieces.trunk) pieces.trunk.skin = topSkin(tris, origin, [-0.8185, 0.8185, -2.3, gl.rearBase - 0.02 - GAP / 2], 54, 14);
    // glass that stays on the body: windshield, rear window, quarter windows
    let bodyGlass: Tri[] = [];
    if (cuts) for (const r of [windGlass, rearGlass, ...sideGlass(1), ...sideGlass(-1)].map(toGeom)) {
      const sg = splitUnion(rest, [r], 0); rest = sg.rest; bodyGlass = bodyGlass.concat(sg.panel);
    }
    if (cuts) {
      // roof: the scan's roof has holes and folds along the glass edges, so replace it with a clean skin of the same shape
      rest = clipRegion(rest, toGeom(boxRegion([-0.6, 1.22, gl.rearTop], [0.6, 1.6, gl.windTop], [false, false, false, false, false, false])), 0, 'outside');
      rest = rest.concat(topSkin(tris, origin, [-0.6, 0.6, gl.rearTop, gl.windTop], 50, 56));
    }
    g.add(mk(rest, mat));
    g.add(mk(bodyGlass, glassMat));
    for (const name of pnames) {
      const sp = spec.panels[name];
      const pv = new THREE.Group();
      const hp = new THREE.Vector3(sp.hinge[0], sp.hinge[1], sp.hinge[2]).add(origin);
      pv.position.copy(hp);
      const parts = new THREE.Group();
      parts.position.copy(hp).negate();
      parts.add(mk(pieces[name].skin, mat));
      if (pieces[name].glass.length) parts.add(mk(pieces[name].glass, glassMat));
      // edge strips follow the panel's true outer outline (skin + its glass), the liner covers only the metal, so the window stays see-through
      const th = thicken(pieces[name].skin.concat(pieces[name].glass), name === 'hood' || name === 'trunk' ? 0.045 : 0.06, pieces[name].skin);
      parts.add(mk(th.liner, innerMat), mk(th.edges, innerMat));
      pv.add(parts);
      g.add(pv);
      pivots[name] = { pivot: pv, axis: new THREE.Vector3(sp.axis[0], sp.axis[1], sp.axis[2]), angle: sp.open, t: 0, target: 0 };
    }
  }
  (window as any).__scan = { shells, origin, THREE };   // review-room debugging: ray cast the true surface
  // real door handles: recessed pocket plus a flush pull, parented to the door so they swing with it
  g.updateMatrixWorld(true);
  {
    const rc = new THREE.Raycaster();
    const dark = std(0x050506, 0.5, 0.3), grip = std(0x16171a, 0.22, 0.85), chrome = std(0xcfd2d8, 0.15, 1);
    for (const [name, sx] of [['doorL', 1], ['doorR', -1]] as [string, number][]) {
      const pv = pivots[name]; if (!pv) continue;
      const hy = gl.handle[1], hz = gl.handle[0];
      rc.set(new THREE.Vector3(origin.x + sx * 3, origin.y + hy, origin.z + hz), new THREE.Vector3(-sx, 0, 0)); rc.far = 6;
      const hit = rc.intersectObjects(shells, false)[0];
      const sxSurf = hit ? hit.point.x - origin.x : sx * 0.93;
      const H = new THREE.Group();
      H.rotation.y = sx * Math.PI / 2;                                      // local +z faces outward
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.066, 0.01), dark); pocket.position.z = 0.002; H.add(pocket);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.026, 0.016), grip); bar.position.set(0, 0, 0.012); H.add(bar);
      for (const s2 of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.022, 0.014), chrome); post.position.set(s2 * 0.066, 0, 0.006); H.add(post); }
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.008), chrome); btn.position.set(0.1, 0.036, 0.008); H.add(btn);
      const world = new THREE.Vector3(origin.x + sxSurf - sx * 0.004, origin.y + hy, origin.z + hz);
      H.position.copy(world).sub(pv.pivot.position);
      pv.pivot.add(H);
    }
  }

  // rubber window seals: a black bead around every glass outline, ray cast onto the surface. It hides the cut and makes the glass sit in a frame.
  if (false as boolean) {              // window beads removed: they wandered over the roof as black lines, and the plane cuts are clean without them
    const rc = new THREE.Raycaster();
    const rubber = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8, metalness: 0.1 });
    const hitAt = (from: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null => { rc.set(from, dir); rc.far = 8; const h = rc.intersectObjects(shells, false)[0]; return h ? h.point : null; };
    const bead = (pts: THREE.Vector3[], parent: THREE.Object3D, closed = false): void => {
      if (pts.length < 3) return;
      parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), pts.length * 3, 0.011, 6, closed), rubber));
    };
    const walk = (poly: number[][], step: number): number[][] => {
      const out: number[][] = [];
      for (let i = 0; i < poly.length; i++) {
        const [a0, a1] = poly[i], [b0, b1] = poly[(i + 1) % poly.length];
        const n = Math.max(1, Math.ceil(Math.hypot(b0 - a0, b1 - a1) / step));
        for (let k = 0; k < n; k++) out.push([a0 + (b0 - a0) * k / n, a1 + (b1 - a1) * k / n]);
      }
      return out;
    };
    for (const s of [1, -1]) {
      const runs: { door: boolean; pts: THREE.Vector3[] }[] = [];
      for (const [z, y] of walk(gl.sideWindow, 0.05)) {
        const p = hitAt(new THREE.Vector3(origin.x + s * 3, origin.y + y, origin.z + z), new THREE.Vector3(-s, 0, 0));
        const door = z <= gl.doorFront && z >= gl.doorRear && y <= gl.roofEdge;
        if (!p) continue;
        const pt = p.clone(); pt.x -= s * 0.002;
        const last = runs[runs.length - 1];
        if (last && last.door === door) last.pts.push(pt); else runs.push({ door, pts: [pt] });
      }
      const doorParent = (pivots[s > 0 ? 'doorL' : 'doorR'].pivot.children[0]) as THREE.Object3D;
      for (const r of runs) bead(r.pts, r.door ? doorParent : g);
    }
    const loop = (outline: number[][], dirY: number): THREE.Vector3[] => outline.map(([x, z]) => { const p = hitAt(new THREE.Vector3(origin.x + x, origin.y + 3, origin.z + z), new THREE.Vector3(0, -1, 0)); return p ? p.clone() : null; }).filter((p): p is THREE.Vector3 => !!p);
    const wb = gl.windBase, wt = gl.windTop;
    const wind: number[][] = [];
    for (let i = 0; i <= 10; i++) wind.push([-0.62 + 1.24 * i / 10, wb]);
    for (let i = 1; i <= 8; i++) wind.push([0.62 - 0.12 * i / 8, wb - (wb - wt) * i / 8]);
    for (let i = 1; i <= 8; i++) wind.push([0.5 - 1.0 * i / 8, wt]);
    for (let i = 1; i < 8; i++) wind.push([-0.5 - 0.12 * i / 8, wt + (wb - wt) * i / 8]);
    bead(loop(wind, -1), g, true);
    const rear: number[][] = [];
    for (let i = 0; i <= 8; i++) rear.push([-0.52 + 1.04 * i / 8, gl.rearTop]);
    for (let i = 1; i <= 4; i++) rear.push([0.52, gl.rearTop + (gl.rearBase2 - gl.rearTop) * i / 4]);
    for (let i = 1; i <= 8; i++) rear.push([0.52 - 1.04 * i / 8, gl.rearBase2]);
    for (let i = 1; i < 4; i++) rear.push([-0.52, gl.rearBase2 + (gl.rearTop - gl.rearBase2) * i / 4]);
    bead(loop(rear, -1), g, true);
  }

  // ---- hinges, gas struts, door cards ----
  const struts: { update: () => void }[] = [];
  if (cuts) {
    const steel = std(0x8b8f96, 0.3, 0.95), blkm = std(0x0b0c0f, 0.5, 0.7), chromeM = std(0xcfd2d8, 0.12, 1), cardM = std(0x15161a, 0.8, 0.1), acc = std(0xb9531a, 0.5, 0.2), lea = std(0x0a0a0c, 0.55, 0.1);
    const W = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(origin.x + x, origin.y + y, origin.z + z);
    const partsOf = (n: string): THREE.Object3D => pivots[n].pivot.children[0];
    const box = (w: number, h: number, d: number, m: THREE.Material, p: THREE.Vector3, parent: THREE.Object3D): THREE.Mesh => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.copy(p); parent.add(me); return me; };
    const strut = (a: THREE.Vector3, parts: THREE.Object3D, bLocal: THREE.Vector3, r = 0.013): void => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), blkm), rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 1, 8), chromeM);
      g.add(body, rod);
      const up = new THREE.Vector3(0, 1, 0);
      struts.push({
        update: () => {
          const b = g.worldToLocal(parts.localToWorld(bLocal.clone()));      // into the car's own space, so the struts stay put when the car is driven across the world
          const d = b.clone().sub(a), len = d.length(); d.normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(up, d);
          body.position.copy(a).addScaledVector(d, len * 0.25); body.scale.y = len * 0.5; body.quaternion.copy(q);
          rod.position.copy(a).addScaledVector(d, len * 0.75); rod.scale.y = len * 0.5; rod.quaternion.copy(q);
        },
      });
    };
    // hood: two hinge brackets at the cowl, hinge arms on the hood, a gas strut each side
    for (const s of [-1, 1]) {
      box(0.1, 0.02, 0.1, steel, W(s * 0.52, 0.92, 0.82), g);                                                 // body bracket, under the hood skin
      box(0.012, 0.05, 0.1, steel, W(s * 0.52 - s * 0.05, 0.91, 0.82), g);
      const arm = box(0.07, 0.014, 0.26, steel, W(s * 0.52, 0.94, 1.0), partsOf('hood')); arm.rotation.x = 0.0;   // hinge arm under the hood
      box(0.03, 0.03, 0.03, chromeM, W(s * 0.52, 0.94, 0.88), partsOf('hood'));                              // pivot pin
      strut(W(s * 0.64, 0.66, 1.0), partsOf('hood'), W(s * 0.6, 1.0, 1.45));
    }
    // trunk: hinge brackets and struts
    for (const s of [-1, 1]) {
      box(0.1, 0.02, 0.1, steel, W(s * 0.55, 1.05, -1.84), g);
      box(0.07, 0.014, 0.22, steel, W(s * 0.55, 1.08, -2.02), partsOf('trunk'));
      box(0.03, 0.03, 0.03, chromeM, W(s * 0.55, 1.08, -1.92), partsOf('trunk'));
      strut(W(s * 0.62, 0.8, -1.65), partsOf('trunk'), W(s * 0.6, 1.07, -2.2));
    }
    // doors: two hinges each at the A-pillar side, a check strap, an interior card with pull, armrest, speaker and window switches
    for (const [name, sx] of [['doorL', 1], ['doorR', -1]] as [string, number][]) {
      const parts = partsOf(name);
      for (const hy of [0.5, 0.74]) {                                                                          // door hinges sit low on the A-pillar, inside the skin
        box(0.07, 0.1, 0.06, steel, W(sx * 0.86, hy, 0.86), g);
        box(0.05, 0.08, 0.05, blkm, W(sx * 0.88, hy, 0.91), parts);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 10), chromeM); pin.position.copy(W(sx * 0.9, hy, 0.89)); g.add(pin);
      }
      strut(W(sx * 0.74, 0.7, 0.8), parts, W(sx * 0.78, 0.72, 0.3), 0.01);                                    // door check strap
      const cx = sx * 0.78;
      box(0.045, 0.6, 1.4, cardM, W(cx, 0.72, 0.1), parts);                                                  // door card
      box(0.06, 0.05, 0.5, lea, W(cx - sx * 0.02, 0.9, -0.05), parts);                                       // armrest
      box(0.06, 0.012, 0.5, acc, W(cx - sx * 0.025, 0.93, -0.05), parts);                                    // copper stitch
      box(0.05, 0.05, 0.2, std(0x2a2c30, 0.5, 0.8), W(cx - sx * 0.02, 0.75, 0.35), parts);                    // pull handle
      const spk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24), std(0x0a0a0c, 0.9, 0.3)); spk.rotation.z = Math.PI / 2; spk.position.copy(W(cx - sx * 0.02, 0.55, 0.35)); parts.add(spk);
      for (let i = 0; i < 3; i++) box(0.03, 0.012, 0.035, chromeM, W(cx - sx * 0.035, 0.92, 0.1 + i * 0.05), parts);   // window switches
    }
  }

  // parts built from the spec, all placed in the scan's car frame
  const carFrame = new THREE.Group();
  carFrame.position.copy(origin);
  g.add(carFrame);
  if (spec.engine) carFrame.add(buildEngine(spec.engine.z));
  if (spec.exhaust) carFrame.add(buildAero(spec.exhaust));
  carFrame.add(buildSuspension(spec));
  carFrame.add(buildUnderbody(spec));
  carFrame.add(buildCabin());
  carFrame.add(buildCowl());
  carFrame.add(buildDriver());
  carFrame.add(buildTrunk());
  g.updateMatrixWorld(true);
  carFrame.add(buildLamps(shells, origin));
  carFrame.add(buildFront(shells, origin, cuts ? spec.front.openings : []));
  const wl = [[true, true, W.frontX, W.frontZ], [true, false, -W.frontX, W.frontZ], [false, true, W.rearX, W.rearZ], [false, false, -W.rearX, W.rearZ]] as [boolean, boolean, number, number][];
  const WH: { spin: THREE.Group; steer: THREE.Group; front: boolean; left: boolean }[] = [];
  for (const [front, left, x, z] of wl) {
    const w = wheel(front, left);
    w.root.position.set(origin.x + x, origin.y + (front ? 0.352 : 0.358) * W.scale, origin.z + z);
    w.root.scale.setScalar(W.scale);
    if (!noDisc) g.add(w.root);
    WH.push({ spin: w.spin, steer: w.steer, front, left });
  }
  let ang = 0;
  return {
    group: g,
    paint: {
      set: (o) => {
        if (o.color !== undefined) { const c = new THREE.Color(o.color); uni.uPaint.value.set(c.r, c.g, c.b); if (o.pearl === undefined) uni.uPearl.value.set(c.r, c.g, c.b); }
        if (o.pearl !== undefined) { const c = new THREE.Color(o.pearl); uni.uPearl.value.set(c.r, c.g, c.b); }
        if (o.pearlAmount !== undefined) uni.uPearlAmt.value = o.pearlAmount;
        if (o.flake !== undefined) uni.uFlake.value = o.flake;
        if (o.finish !== undefined) uni.uFinish.value = o.finish;
      },
    },
    panels: {
      names: pnames,
      toggle: (k) => { const p = pivots[k]; if (p) p.target = p.target > 0.5 ? 0 : 1; },
      set: (k, t) => { const p = pivots[k]; if (p) p.target = t; },
    },
    update(speed: number, steer: number, dt: number) {
      ang += (speed / 0.355) * dt;
      for (const w of WH) { w.spin.rotation.x = w.left ? -ang : ang; w.steer.rotation.y = w.front ? steer : 0; }
      for (const k of pnames) {
        const p = pivots[k];
        p.t += (p.target - p.t) * Math.min(1, dt * 5);
        p.pivot.quaternion.setFromAxisAngle(p.axis, p.angle * p.t);
      }
      g.updateMatrixWorld(true);
      for (const st of struts) st.update();
    },
  };
}

export function loadSovereignScan(): Promise<CarRig> {
  return loadScanCar(sovSpec as unknown as ScanSpec);
}
