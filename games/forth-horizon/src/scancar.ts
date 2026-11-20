/// <reference types="vite/client" />
// Scan cars: image-to-mesh body plus real parts, driven by car/<id>/spec.json. Process and rationale: docs/apex-elohim/car-pipeline.md.
// The generated mesh is only the shell. Paint is one solid clearcoat colour, wheels / brakes / suspension / engine / exhaust / lamps /
// trim are built from the spec, and the doors, hood and trunk are real separate panels that open.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { wheel, type CarRig, type WheelStyle } from './car';
import { batchStatic } from './carBatch';
import { buildBodyGeometry } from './sovbody';
import { buildDetailedEngine, type EngineArch } from './engineModels';
import { type Vtx, toTris, toGeometry, clipRegion, splitUnion, boxRegion, sideRegion, toMesh, thicken, plane, type Tri, type Region } from './scanparts';
import sovSpec from '../car/sovereign/spec.json';
import corsairSpec from '../car/corsair/spec.json';
import vanguardSpec from '../car/vanguard/spec.json';

export interface ScanSpec {
  id: string; glb: string; paint: string; accent?: string; body?: 'modelled'; cuts?: boolean; traffic?: boolean;
  wheels: { frontZ: number; rearZ: number; frontX: number; rearX: number; scale: number; discardR: number; centreY: number; tyreR: number; rimR: number; style?: WheelStyle };
  panels: Record<string, { hinge: number[]; axis: number[]; open: number }>;
  panelBoxes?: { hood?: [number[], number[]]; trunk?: [number[], number[]]; roof?: [number[], number[]]; preserveRoof?: boolean; preserveHood?: boolean; preserveTrunk?: boolean };
  glass: { belt: number; roofEdge: number; pillarBase: number; pillarTop: number; doorFront: number; doorRear: number; windBase: number; windTop: number; rearTop: number; rearBase: number; rearBase2: number; sideWindow: number[][]; handle: number[]; windHalfW?: number; rearHalfW?: number };
  front: { openings: Opening[] };
  engine?: { z: number; layout?: 'front-v8' | 'mid-v8' | 'ev'; arch?: EngineArch; texUrl?: string };
  trunk?: boolean;
  cabin?: { yOffset?: number; zOffset?: number; cowlZ?: number; cowlY?: number };
  exhaust?: { z: number; y: number; xs: number[] };
  aero?: {
    splitterZ?: number; splitterW?: number; splitterY?: number; splitterStruts?: boolean; canards?: boolean;
    diffuserW?: number; diffuserFins?: number;
    wing?: { type: 'ducktail' | 'swan' | 'none'; width: number; y: number; z: number; chord?: number; height?: number; pylonX?: number; endplates?: boolean };
    roofScoop?: { y: number; z: number; length: number; width: number };
  };
  lamps?: {
    head?: { x: number; y: number; w: number; h: number; tilt?: number; style?: 'swept' | 'u-drl' | 'blade' };
    tail?: { x: number; y: number; len: number; style?: 'twin-bar' | 'double-u' | 'full-blade' };
  };
  shader?: { bumperFrontY?: number; bumperRearY?: number; skirtY?: number; archLipAdd?: number; wingCarbonZ?: number; wingCarbonY?: number; grilleLoY?: number; grilleHiY?: number; grilleStyle?: 'ev' | 'sport' | 'truck' };
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

function buildEngine(z: number, layout: 'front-v8' | 'mid-v8' | 'ev' = 'front-v8'): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const bay = std(0x0d0e10, 0.8, 0.2), steel = std(0x8b8f96, 0.3, 0.95), gun = std(0x2b2e33, 0.4, 0.85);
  const red = std(0xa3141a, 0.45, 0.35), carbon = std(0x15161a, 0.3, 0.4), alu = std(0xb7bbc2, 0.35, 0.9), black = std(0x08080a, 0.6, 0.2);
  // bay shell: floor, inner fender walls, bulkhead, radiator support, so an open hood shows a built bay and not the hollow scan
  add(new THREE.BoxGeometry(1.3, 0.05, 1.1), bay, 0, 0.40, z + 0.05);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.34, 1.0), bay, sx * 0.62, 0.58, z + 0.05);
  add(new THREE.BoxGeometry(1.3, 0.4, 0.04), bay, 0, 0.6, z - 0.5);
  if (layout !== 'mid-v8') {
    add(new THREE.BoxGeometry(1.1, 0.3, 0.05), black, 0, 0.55, z + 0.58);
    add(new THREE.BoxGeometry(0.9, 0.22, 0.03), alu, 0, 0.55, z + 0.62);
  }
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
  if (layout !== 'mid-v8') {
    add(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 12), steel, 0, 0.86, z - 0.4, 0, 0, Math.PI / 2);          // strut tower bar
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 20), steel, sx * 0.62, 0.84, z - 0.4);
  } else {
    g.position.y = -0.09;
    g.scale.set(0.86, 0.82, 0.86);
  }
  add(new THREE.BoxGeometry(0.22, 0.18, 0.16), black, -0.5, 0.52, z - 0.3);                                       // battery
  add(new THREE.BoxGeometry(0.16, 0.18, 0.1), alu, 0.5, 0.52, z + 0.35);                                          // coolant tank
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), red, 0.5, 0.63, z + 0.35);
  return g;
}

let carbonTexCache: THREE.CanvasTexture | null = null;
function carbonWeaveTex(): THREE.CanvasTexture {
  if (carbonTexCache) return carbonTexCache;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0d0e11'; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      const diag = ((x + y) >> 3) & 1;
      ctx.fillStyle = diag ? '#202329' : '#14161b';
      ctx.fillRect(x, y, 7, 3);
      ctx.fillStyle = diag ? '#16181e' : '#262a32';
      ctx.fillRect(x + 1, y + 4, 6, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 16);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  carbonTexCache = t;
  return t;
}

function buildContactShadow(origin: THREE.Vector3, W: ScanSpec['wheels']): THREE.Mesh {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 512);
  // Soft outer chassis penumbra
  const outer = g.createRadialGradient(128, 256, 36, 128, 256, 220);
  outer.addColorStop(0, 'rgba(0,0,0,0.82)');
  outer.addColorStop(0.55, 'rgba(0,0,0,0.48)');
  outer.addColorStop(0.85, 'rgba(0,0,0,0.14)');
  outer.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(0.54, 1); g.fillStyle = outer; g.fillRect(0, 0, 480, 512); g.restore();
  // Deep grounded under-chassis core shadow
  g.fillStyle = 'rgba(0,0,0,0.68)';
  g.beginPath(); g.ellipse(128, 256, 62, 165, 0, 0, Math.PI * 2); g.fill();
  // Tight dark contact pools directly under all four tyres
  for (const [tx, ty] of [[68, 122], [188, 122], [68, 392], [188, 392]]) {
    const tg = g.createRadialGradient(tx, ty, 4, tx, ty, 34);
    tg.addColorStop(0, 'rgba(0,0,0,0.92)');
    tg.addColorStop(0.6, 'rgba(0,0,0,0.45)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = tg; g.beginPath(); g.ellipse(tx, ty, 28, 42, 0, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0.92,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const spanZ = Math.max(4.8, Math.abs(W.frontZ - W.rearZ) + 2.35);
  const spanX = Math.max(2.35, Math.max(W.frontX, W.rearX) * 2 + 0.95);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(spanX, spanZ), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(origin.x, origin.y + 0.025, origin.z + (W.frontZ + W.rearZ) * 0.5);
  m.renderOrder = 3;
  m.userData.keep = true;
  return m;
}

function buildGroundLightPools(origin: THREE.Vector3): {
  group: THREE.Group;
  rearMat: THREE.MeshBasicMaterial;
  frontMat: THREE.MeshBasicMaterial;
} {
  // Twin focused wet-asphalt taillight reflections aligned under left & right rear LED bars (never a giant airbrushed blob)
  const makeRearTwin = (): THREE.CanvasTexture => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 128);
    for (const cx of [74, 182]) {
      ctx.save();
      ctx.translate(cx, 54);
      ctx.scale(1.0, 1.45);
      const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
      gr.addColorStop(0, 'rgba(255,28,16,0.72)');
      gr.addColorStop(0.38, 'rgba(220,16,12,0.28)');
      gr.addColorStop(1, 'rgba(180,8,8,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return new THREE.CanvasTexture(c);
  };
  const makeFrontBeams = (): THREE.CanvasTexture => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);
    for (const cx of [88, 168]) {
      ctx.save();
      ctx.translate(cx, 128);
      ctx.scale(0.65, 1.5);
      const gr = ctx.createRadialGradient(0, 0, 4, 0, 0, 80);
      gr.addColorStop(0, 'rgba(225,240,255,0.62)');
      gr.addColorStop(0.45, 'rgba(205,225,250,0.22)');
      gr.addColorStop(1, 'rgba(190,215,245,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return new THREE.CanvasTexture(c);
  };
  const group = new THREE.Group();
  const rearMat = new THREE.MeshBasicMaterial({
    map: makeRearTwin(), transparent: true, opacity: 0.14, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const frontMat = new THREE.MeshBasicMaterial({
    map: makeFrontBeams(), transparent: true, opacity: 0.12, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.65), rearMat);
  rear.rotation.x = -Math.PI / 2;
  rear.position.set(origin.x, origin.y + 0.032, origin.z - 3.15);
  rear.renderOrder = 4; rear.userData.keep = true;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 9.0), frontMat);
  front.rotation.x = -Math.PI / 2;
  front.position.set(origin.x, origin.y + 0.032, origin.z + 6.2);
  front.renderOrder = 4; front.userData.keep = true;
  group.add(rear, front);
  return { group, rearMat, frontMat };
}

// exhaust, diffuser fins, front splitter, struts, canards, roof scoop and rear wing: data-driven per ScanSpec
function buildAero(ex: NonNullable<ScanSpec['exhaust']>, aero?: ScanSpec['aero']): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const ti = new THREE.MeshStandardMaterial({ color: 0x9d9486, roughness: 0.24, metalness: 1.0 });
  const burnt = new THREE.MeshStandardMaterial({ color: 0x4a3f7a, roughness: 0.30, metalness: 0.96 });
  const soot = std(0x050506, 0.9, 0.1);
  const chrome = std(0xd0d4dc, 0.16, 1.0);
  // Deep satin-gloss weave carbon (darkened albedo so flat diffuser undertray never flashes bright white under open sky)
  const carbon = new THREE.MeshPhysicalMaterial({ color: 0x363a42, map: carbonWeaveTex(), roughness: 0.32, metalness: 0.25, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 0.85 });
  const tipR = ex.xs.length <= 2 ? 0.068 : 0.058;
  for (const x of ex.xs) {
    const outer = new THREE.CylinderGeometry(tipR, tipR * 0.9, 0.12, 32, 1, true);
    add(outer, ti, x, ex.y, ex.z, Math.PI / 2, 0, 0).material = new THREE.MeshStandardMaterial({ color: 0x9d9486, roughness: 0.28, metalness: 1.0, side: THREE.DoubleSide });
    add(new THREE.CylinderGeometry(tipR * 0.81, tipR * 0.81, 0.22, 24, 1, true), soot, x, ex.y, ex.z - 0.01, Math.PI / 2, 0, 0).material = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, side: THREE.DoubleSide });
    add(new THREE.TorusGeometry(tipR * 0.97, 0.008, 10, 32), burnt, x, ex.y, ex.z - 0.1, 0, 0, 0);          // heat-blued rolled lip
    add(new THREE.TorusGeometry(tipR * 0.86, 0.005, 8, 28), ti, x, ex.y, ex.z + 0.08, 0, 0, 0);              // weld band
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.4, 16), ti, x, ex.y + 0.01, ex.z + 0.3, Math.PI / 2, 0, 0);   // pipe running forward under the car
  }
  // rear diffuser: carbon strakes between and outside the tips (tucked tightly under the bumper for per-car aero specs)
  const diffW = aero?.diffuserW ?? 1.7;
  const diffN = aero?.diffuserFins ?? 3;
  const diffY = aero ? Math.min(ex.y - 0.07, 0.21) : Math.min(ex.y - 0.1, 0.24);
  const finH = aero ? 0.11 : 0.16;
  const finD = aero ? 0.28 : 0.38;
  const diffZ = aero ? ex.z + 0.34 : ex.z + 0.28;
  if (diffN > 0 && diffW > 0) {
    for (let i = -diffN; i <= diffN; i++) {
      const step = (diffW * 0.44) / Math.max(1, diffN);
      add(new THREE.BoxGeometry(0.014, finH, finD), carbon, i * step, diffY, diffZ);
    }
    add(new THREE.BoxGeometry(diffW, 0.014, finD - 0.02), carbon, 0, Math.max(0.11, diffY - finH * 0.52), diffZ + 0.02);
  }

  // rear wing: Sovereign/Corsair ducktail lip OR Vanguard/Track swan-neck GT wing with endplates
  const wing = aero?.wing ?? { type: 'ducktail' as const, width: 1.46, y: 1.03, z: -2.27 };
  if (wing.type === 'ducktail') {
    add(new THREE.BoxGeometry(wing.width, 0.024, wing.chord ?? 0.14), carbon, 0, wing.y, wing.z, 0.22, 0, 0);
  } else if (wing.type === 'swan') {
    const chord = wing.chord ?? 0.26;
    const hgt = wing.height ?? 0.28;
    const px = wing.pylonX ?? 0.38;
    // Cambered main airfoil blade + subtle gurney flap
    add(new THREE.BoxGeometry(wing.width, 0.026, chord), carbon, 0, wing.y, wing.z, 0.09, 0, 0);
    add(new THREE.BoxGeometry(wing.width * 0.98, 0.018, 0.024), carbon, 0, wing.y + 0.018, wing.z - chord * 0.48, 0.25, 0, 0);
    for (const sx of [-1, 1]) {
      // Swan-neck pylons rising from deck and hooking cleanly over the leading edge
      add(new THREE.BoxGeometry(0.024, hgt, 0.11), carbon, sx * px, wing.y - hgt * 0.48, wing.z + 0.07, -0.22, 0, 0);
      add(new THREE.BoxGeometry(0.024, 0.036, 0.15), carbon, sx * px, wing.y + 0.022, wing.z + 0.03, 0.08, 0, 0);
      if (wing.endplates !== false) {
        add(new THREE.BoxGeometry(0.018, 0.19, chord + 0.12), carbon, sx * (wing.width * 0.5 + 0.008), wing.y - 0.01, wing.z - 0.01, 0.07, 0, 0);
      }
    }
  }

  // optional dorsal roof scoop (Vanguard Apex GT mid-engine intake)
  if (aero?.roofScoop) {
    const rs = aero.roofScoop;
    add(new THREE.BoxGeometry(rs.width, 0.075, rs.length), carbon, 0, rs.y, rs.z, -0.08, 0, 0);
    add(new THREE.BoxGeometry(rs.width * 0.78, 0.048, 0.06), soot, 0, rs.y + 0.004, rs.z + rs.length * 0.48);
  }

  // front splitter, optional metallic splitter tie-rod struts, and optional dive-plane canards
  const zf = aero?.splitterZ ?? 2.02;
  const sw = aero?.splitterW ?? 1.55;
  const sy = aero?.splitterY ?? 0.06;
  if (sw > 0) {
    add(new THREE.BoxGeometry(sw, 0.02, 0.28), carbon, 0, sy, zf);
    add(new THREE.BoxGeometry(sw * 0.96, 0.02, 0.03), std(0x1b1c20, 0.4, 0.5), 0, sy + 0.01, zf + 0.14);
  }
  if (aero?.splitterStruts) {
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 10), chrome, sx * 0.34, sy + 0.10, zf + 0.05, -0.22, 0, -sx * 0.14);
    }
  }
  if (aero?.canards !== false && sw > 0) {
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.1, 0.01, 0.08), carbon, sx * (sw * 0.5 + 0.01), sy + 0.14, zf - 0.12, 0.2, 0, -sx * 0.25);
      add(new THREE.BoxGeometry(0.1, 0.01, 0.08), carbon, sx * (sw * 0.5 + 0.01), sy + 0.18, zf - 0.12, 0.2, 0, -sx * 0.25);
      add(new THREE.BoxGeometry(0.01, 0.05, 0.16), carbon, sx * (sw * 0.5 + 0.015), sy + 0.04, zf);
    }
  }
  return g;
}

// real lamp assemblies: housing, clear lens, projector with chrome ring, LED strips. Placed on the scan's surface by ray cast.
function lampShape(w: number, h: number, tilt: number, taper: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w, tilt); s.lineTo(w, tilt + h * taper); s.quadraticCurveTo(w * 0.5, h * 1.15 + tilt * 0.5, 0, h); s.lineTo(0, 0);
  return s;
}
function buildLamps(shells: THREE.Mesh[], origin: THREE.Vector3, lampsCfg?: ScanSpec['lamps']): {
  group: THREE.Group;
  ledR: THREE.MeshStandardMaterial;
  ledW: THREE.MeshStandardMaterial;
} {
  const g = new THREE.Group();
  const rc = new THREE.Raycaster();
  const surf = (x: number, y: number, dir: number, fallback: number): number => {
    rc.set(new THREE.Vector3(origin.x + x, origin.y + y, origin.z + dir * 6), new THREE.Vector3(0, 0, -dir));
    rc.far = 12;
    const hit = rc.intersectObjects(shells, false)[0];
    return hit ? hit.point.z - origin.z : fallback;
  };
  const housing = new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.22, metalness: 0.85, side: THREE.DoubleSide });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0xdfeaff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.26, clearcoat: 1, envMapIntensity: 2.4, side: THREE.DoubleSide, depthWrite: false });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.10, metalness: 1 });
  const ledW = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6f2ff, emissiveIntensity: 4.4, roughness: 0.2 });
  const ledA = new THREE.MeshStandardMaterial({ color: 0xffb03a, emissive: 0xff8a10, emissiveIntensity: 2.2, roughness: 0.35 });
  const lensR = new THREE.MeshPhysicalMaterial({ color: 0xb0121a, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false });
  const ledR = new THREE.MeshStandardMaterial({ color: 0xff2a20, emissive: 0xff1608, emissiveIntensity: 3.8, roughness: 0.3 });
  const ex = (shape: THREE.Shape, depth: number, m: THREE.Material): THREE.Mesh => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
    return new THREE.Mesh(geo, m);
  };
  const hd = lampsCfg?.head ?? { x: 0.58, y: 0.62, w: 0.30, h: 0.085, tilt: 0.045, style: 'swept' as const };
  const tl = lampsCfg?.tail ?? { x: 0.56, y: 0.80, len: 0.34, style: 'twin-bar' as const };
  const bar = (len: number, r: number, m: THREE.Material, dz: number): THREE.Mesh => {
    const me = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 14), m);
    me.rotation.z = Math.PI / 2; me.scale.set(0.6, 1, 0.7); me.position.set(0, 0, dz); return me;
  };
  for (const sx of [-1, 1]) {
    // ---- headlight: ray-cast onto scan surface, styled per car (swept / angular u-drl / sharp blade) ----
    {
      const cx = sx * hd.x, cy = hd.y, zs = surf(sx * (hd.x + hd.w * 0.45), cy + hd.h * 0.45, 1, 2.1);
      const L = new THREE.Group();
      L.position.set(cx, cy, zs - (hd.style === 'u-drl' || hd.style === 'blade' ? 0.075 : 0.045));
      L.rotation.y = sx * (hd.style === 'blade' ? 0.36 : hd.style === 'u-drl' ? 0.26 : 0.3);
      const tilt = hd.tilt ?? 0.045;
      const sh = lampShape(hd.w, hd.h, tilt, 0.85);
      const flip = (m: THREE.Mesh): THREE.Mesh => { m.scale.x = sx; return m; };
      L.add(flip(ex(sh, 0.05, housing)));
      const lensM = flip(ex(lampShape(hd.w * 0.95, hd.h * 0.88, tilt, 0.85), 0.012, lens)); lensM.position.set(sx * 0.008, 0.005, 0.06); L.add(lensM);
      if (hd.style === 'u-drl') {
        // Corsair RS angular lower-U signature DRL wrapping under twin dark projectors
        const bot = flip(new THREE.Mesh(new THREE.BoxGeometry(hd.w * 0.88, 0.012, 0.014), ledW)); bot.position.set(sx * (hd.w * 0.48), 0.014, 0.066); bot.rotation.z = sx * 0.08; L.add(bot);
        const sideL = flip(new THREE.Mesh(new THREE.BoxGeometry(0.012, hd.h * 0.72, 0.014), ledW)); sideL.position.set(sx * (hd.w * 0.06), hd.h * 0.44, 0.066); sideL.rotation.z = -sx * 0.38; L.add(sideL);
        const sideR = flip(new THREE.Mesh(new THREE.BoxGeometry(0.012, hd.h * 0.76, 0.014), ledW)); sideR.position.set(sx * (hd.w * 0.92), hd.h * 0.54, 0.066); sideR.rotation.z = sx * 0.25; L.add(sideR);
      } else if (hd.style === 'blade') {
        // Vanguard Apex GT dual-spear hypercar LED blades
        const b1 = flip(new THREE.Mesh(new THREE.BoxGeometry(hd.w * 0.96, 0.013, 0.014), ledW)); b1.position.set(sx * (hd.w * 0.5), hd.h * 0.85, 0.066); b1.rotation.z = sx * 0.24; L.add(b1);
        const b2 = flip(new THREE.Mesh(new THREE.BoxGeometry(hd.w * 0.80, 0.010, 0.014), ledW)); b2.position.set(sx * (hd.w * 0.42), hd.h * 0.22, 0.066); b2.rotation.z = sx * 0.14; L.add(b2);
      } else {
        const drl = flip(new THREE.Mesh(new THREE.BoxGeometry(hd.w * 0.9, 0.012, 0.012), ledW)); drl.position.set(sx * (hd.w * 0.47), hd.h * 0.94, 0.064); drl.rotation.z = sx * 0.16; L.add(drl);
        const amber = flip(new THREE.Mesh(new THREE.BoxGeometry(hd.w * 0.4, 0.008, 0.01), ledA)); amber.position.set(sx * (hd.w * 0.67), 0.012, 0.062); amber.rotation.z = sx * 0.16; L.add(amber);
      }
      for (const [px, py, pr] of [[hd.w * 0.30, hd.h * 0.52, 0.024], [hd.w * 0.64, hd.h * 0.66, 0.02]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(pr, 0.0045, 10, 28), chrome); ring.position.set(sx * px, py, 0.058); L.add(ring);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.92, pr * 0.5, 0.03, 24, 1, true), chrome); cup.rotation.x = Math.PI / 2; cup.position.set(sx * px, py, 0.044); L.add(cup);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(pr * 0.5, 16, 12), ledW); bulb.position.set(sx * px, py, 0.048); L.add(bulb);
      }
      g.add(L);
    }
    // ---- taillight: ray-cast onto rear scan surface, styled per car ----
    {
      const zs = surf(sx * (tl.x + 0.02), tl.y, -1, -2.3);
      const L = new THREE.Group();
      L.position.set(sx * tl.x, tl.y, zs + (tl.style === 'double-u' ? 0.014 : tl.style === 'full-blade' ? -0.006 : -0.025));
      L.rotation.y = Math.PI;
      if (tl.style === 'double-u') {
        // Corsair RS recessed dual-ring red LED cluster
        L.add(bar(tl.len, 0.062, housing, 0));
        L.add(bar(tl.len * 0.96, 0.052, lensR, 0.012));
        const topC = bar(tl.len * 0.86, 0.011, ledR, 0.024); topC.position.y = 0.022; L.add(topC);
        const botC = bar(tl.len * 0.86, 0.011, ledR, 0.024); botC.position.y = -0.022; L.add(botC);
      } else {
        L.add(bar(tl.len, 0.046, housing, 0));
        L.add(bar(tl.len * 0.96, 0.04, lensR, 0.012));
        const core = bar(tl.len * 0.86, 0.014, ledR, 0.022); core.position.y = 0.006; L.add(core);
        if (tl.style === 'full-blade') {
          const core2 = bar(tl.len * 0.72, 0.010, ledR, 0.022); core2.position.y = -0.018; L.add(core2);
        }
      }
      g.add(L);
    }
  }
  // Full-width center LED bridge for hypercars (Vanguard Apex GT)
  if (tl.style === 'full-blade') {
    const zc = surf(0, tl.y, -1, -2.25);
    const C = new THREE.Group();
    C.position.set(0, tl.y, zc - 0.025);
    C.rotation.y = Math.PI;
    C.add(bar(tl.x * 1.9, 0.026, housing, 0));
    C.add(bar(tl.x * 1.88, 0.020, lensR, 0.010));
    C.add(bar(tl.x * 1.84, 0.011, ledR, 0.018));
    g.add(C);
  }
  return { group: g, ledR, ledW };
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
    add(new THREE.BoxGeometry(0.07, 0.09, 0.72), blk, sx * 0.4, 0.26, zf + 0.20);
    add(new THREE.BoxGeometry(0.07, 0.09, 0.72), blk, sx * 0.4, 0.26, zr - 0.04);
  }
  add(new THREE.BoxGeometry(0.95, 0.07, 0.08), blk, 0, 0.26, zf + 0.50);
  add(new THREE.BoxGeometry(0.86, 0.07, 0.08), blk, 0, 0.26, zr - 0.36);
  add(new THREE.BoxGeometry(0.9, 0.07, 0.08), blk, 0, 0.26, zf - 0.2);
  add(new THREE.BoxGeometry(1.0, 0.02, 0.42), carbon, 0, 0.115, zf + 0.28);
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

function buildSeat(sx: number, x: number, z: number, accentHex = 0xb9531a): THREE.Group {
  const g = new THREE.Group();
  const alc = std(0x141416, 0.95, 0.05), leather = std(0x0e0e10, 0.55, 0.1), accent = std(accentHex, 0.5, 0.2), metal = std(0x2a2c30, 0.4, 0.9);
  const put = (m: THREE.Mesh, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => { m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  put(rbox(0.5, 0.13, 0.56, 0.04, alc), 0, 0.44, 0.0, Math.PI / 2, 0, 0).scale.set(1, 1, 1);          // cushion (rbox is built in xy, so lay it flat)
  put(rbox(0.46, 0.62, 0.12, 0.05, alc), 0, 0.76, -0.34, -0.38, 0, 0);                                  // backrest
  for (const s of [-1, 1]) {
    put(rbox(0.07, 0.5, 0.16, 0.03, leather), s * 0.25, 0.72, -0.3, -0.38, 0, 0);                     // backrest bolsters
    put(rbox(0.07, 0.12, 0.5, 0.03, leather), s * 0.27, 0.48, 0.0, Math.PI / 2, 0, 0);                // cushion bolsters
  }
  put(rbox(0.26, 0.22, 0.1, 0.04, alc), 0, 1.1, -0.47, -0.38, 0, 0);                                    // integrated headrest
  put(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.012), accent), 0, 0.76, -0.275, -0.38, 0, 0);    // accent centre stripe
  put(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.46), accent), 0, 0.51, 0.0);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.4), metal), 0, 0.33, 0.0);                      // seat base plate
  for (const s of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.5), metal), s * 0.18, 0.3, 0.0);   // rails
  g.position.set(x, -0.07, z);                       // seats folded down and back so a helmeted driver clears the roof
  g.userData.sx = sx;
  return g;
}

function buildCabin(accentHex = 0xb9531a, cabin?: ScanSpec['cabin'], hasTrunk = true): THREE.Group {
  const g = new THREE.Group();
  const dark = std(0x0d0e10, 0.8, 0.1), carpet = std(0x16171a, 0.98, 0), accent = std(accentHex, 0.5, 0.2), plastic = std(0x1b1c20, 0.6, 0.2);
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
  g.add(buildSeat(1, 0.4, -0.2, accentHex), buildSeat(-1, -0.4, -0.2, accentHex));
  // rear bulkhead / parcel shelf, headliner, mirror (tighter inside low mid-engine teardrop canopies)
  if (hasTrunk) {
    add(new THREE.BoxGeometry(1.5, 0.5, 0.05), dark, 0, 0.62, -0.98);
    add(new THREE.BoxGeometry(1.4, 0.03, 0.9), dark, 0, 0.9, -1.4);                              // parcel shelf under the fastback glass
    add(new THREE.BoxGeometry(0.95, 0.03, 1.2), std(0x18191c, 0.95, 0), 0, 1.3, -0.5);             // headliner, inside the roof
  } else {
    add(new THREE.BoxGeometry(1.25, 0.44, 0.05), dark, 0, 0.58, -0.78);
    add(new THREE.BoxGeometry(0.68, 0.02, 0.52), std(0x18191c, 0.95, 0), 0, 1.15, -0.06);
  }
  add(new THREE.BoxGeometry(0.16, 0.05, 0.03), dark, 0, hasTrunk ? 1.2 : 1.12, 0.45);              // rear-view mirror
  if (cabin?.yOffset) g.position.y += cabin.yOffset;
  if (cabin?.zOffset) g.position.z += cabin.zOffset;
  return g;
}

function buildTrunk(rearLimitZ = -2.18, halfW = 0.65, beltY = 1.08): THREE.Group {
  const g = new THREE.Group();
  const add = mesher(g);
  const carpet = std(0x18191c, 0.98, 0), trim = std(0x101114, 0.85, 0.1), metal = std(0x3a3d42, 0.5, 0.8);
  const zBack = Math.max(-2.18, rearLimitZ);
  const zFront = Math.min(-1.04, zBack + 0.92);
  const len = Math.max(0.42, zFront - zBack);
  const zMid = (zFront + zBack) * 0.5;
  const w = Math.min(1.26, halfW * 2);
  const wallH = Math.min(0.42, Math.max(0.22, beltY - 0.62));
  const yWall = 0.58 + wallH * 0.5;
  add(new THREE.BoxGeometry(w, 0.04, len), carpet, 0, 0.58, zMid);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, wallH, len), trim, sx * (w * 0.5), yWall, zMid);
    add(new THREE.CylinderGeometry(0.40, 0.40, 0.18, 28, 1, false, 0, Math.PI), trim, sx * (w * 0.42), 0.35, zMid, 0, 0, Math.PI / 2);
  }
  add(new THREE.BoxGeometry(w + 0.04, wallH, 0.04), trim, 0, yWall, zBack);
  add(new THREE.CylinderGeometry(Math.min(0.28, len * 0.32), Math.min(0.28, len * 0.32), 0.025, 36), carpet, 0, 0.61, zMid - len * 0.14);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), metal, 0, 0.625, zMid - len * 0.14);
  add(new THREE.BoxGeometry(w * 0.78, Math.min(0.18, wallH * 0.6), 0.04), trim, 0, 0.68, zFront);
  add(new THREE.BoxGeometry(0.2, 0.012, 0.1), metal, w * 0.34, 0.61, zFront - 0.14);
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
function buildDriver(accentHex = 0xb9531a, cabin?: ScanSpec['cabin']): THREE.Group {
  const g = new THREE.Group();
  g.name = 'driver';
  const suit = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.7, metalness: 0.05 });
  const suitAcc = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.6, metalness: 0.05 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.8 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.6, metalness: 0.1 });
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f4, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const stripe = new THREE.MeshPhysicalMaterial({ color: accentHex, roughness: 0.3, metalness: 0.2, clearcoat: 1 });
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
  g.position.y = -0.06 + (cabin?.yOffset ?? 0);
  g.position.z = cabin?.zOffset ?? 0;
  return g;
}

// black cowl panel with the wiper trough: closes the gap between the hood and the windshield (the scan has holes there) and reads as a real part
function buildCowl(cowlZ = 0.87, cowlY = 1.035): THREE.Group {
  const g = new THREE.Group();
  if (cowlY <= 0) return g;
  const plastic = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.75, metalness: 0.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9bcc3, roughness: 0.2, metalness: 1 });
  for (const sx of [-1, 1]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.025, 0.15), plastic);
    seg.position.set(sx * 0.32, cowlY, cowlZ);
    seg.rotation.z = -sx * 0.03;
    g.add(seg);
  }
  for (let i = 0; i < 8; i++) { const slot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: 0x020203 })); slot.position.set(-0.45 + i * 0.13, cowlY + 0.014, cowlZ + 0.055); g.add(slot); }   // drain slots
  for (const sx of [-1, 1]) {                                                                                                                                         // wiper pivots
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 12), chrome); p.position.set(sx * 0.3, cowlY + 0.02, cowlZ - 0.01); g.add(p);
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

// Class-A automotive smooth normals: area-weighted shared-vertex normals + 3-pass crease-preserving edge-adjacency fairing
// (eliminates 7cm voxel stepping artifacts so clearcoat & skyline reflections glide cleanly across curved sheetmetal)
function smoothNormals(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const keyToId = new Map<string, number>();
  const vertIds = new Int32Array(pos.count);
  const acc: number[] = [];
  let uniq = 0;
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    let id = keyToId.get(k);
    if (id === undefined) { id = uniq++; keyToId.set(k, id); acc.push(0, 0, 0); }
    vertIds[i] = id;
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const adj: number[][] = Array.from({ length: uniq }, () => []);
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.copy(b).sub(a).cross(c.clone().sub(a));
    const i0 = vertIds[t], i1 = vertIds[t + 1], i2 = vertIds[t + 2];
    acc[i0 * 3] += n.x; acc[i0 * 3 + 1] += n.y; acc[i0 * 3 + 2] += n.z;
    acc[i1 * 3] += n.x; acc[i1 * 3 + 1] += n.y; acc[i1 * 3 + 2] += n.z;
    acc[i2 * 3] += n.x; acc[i2 * 3 + 1] += n.y; acc[i2 * 3 + 2] += n.z;
    adj[i0].push(i1, i2); adj[i1].push(i0, i2); adj[i2].push(i0, i1);
  }
  let cur = new Float32Array(uniq * 3);
  for (let u = 0; u < uniq; u++) {
    const x = acc[u * 3], y = acc[u * 3 + 1], z = acc[u * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    cur[u * 3] = x / l; cur[u * 3 + 1] = y / l; cur[u * 3 + 2] = z / l;
  }
  // 4-pass crease-preserving Laplacian normal smoothing (preserves sharp >42 deg character lines, removes micro-dimples)
  let nxt = new Float32Array(uniq * 3);
  for (let pass = 0; pass < 4; pass++) {
    for (let u = 0; u < uniq; u++) {
      const nx = cur[u * 3], ny = cur[u * 3 + 1], nz = cur[u * 3 + 2];
      let sx = nx * 1.4, sy = ny * 1.4, sz = nz * 1.4;
      const nb = adj[u];
      for (let k = 0; k < nb.length; k++) {
        const v = nb[k];
        const vx = cur[v * 3], vy = cur[v * 3 + 1], vz = cur[v * 3 + 2];
        const d = nx * vx + ny * vy + nz * vz;
        if (d > 0.72) {
          const w = (d - 0.72) / 0.28;
          sx += vx * w; sy += vy * w; sz += vz * w;
        }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      nxt[u * 3] = sx / l; nxt[u * 3 + 1] = sy / l; nxt[u * 3 + 2] = sz / l;
    }
    const tmp = cur; cur = nxt; nxt = tmp;
  }
  const nm = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = vertIds[i];
    nm[i * 3] = cur[u * 3]; nm[i * 3 + 1] = cur[u * 3 + 1]; nm[i * 3 + 2] = cur[u * 3 + 2];
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
  const uni = { uPaint: { value: new THREE.Vector3(paint.r, paint.g, paint.b) }, uFlake: { value: 0.44 }, uFinish: { value: 0 }, uPearl: { value: new THREE.Vector3(paint.r, paint.g, paint.b) }, uPearlAmt: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ metalness: 0.72, roughness: 0.19, clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1.95, side: THREE.DoubleSide });
  const grilleStyleNum = spec.shader?.grilleStyle === 'ev' ? 0 : spec.shader?.grilleStyle === 'truck' ? 2 : 1;
  const gLoY = spec.shader?.grilleLoY ?? (grilleStyleNum === 2 ? 0.52 : 0.34);
  const gHiY = spec.shader?.grilleHiY ?? (grilleStyleNum === 2 ? 1.02 : 0.60);
  const hasPhysOpenings = cuts && spec.front.openings.length > 0 ? 1 : 0;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = uni.uPaint; sh.uniforms.uFlake = uni.uFlake; sh.uniforms.uFinish = uni.uFinish; sh.uniforms.uPearl = uni.uPearl; sh.uniforms.uPearlAmt = uni.uPearlAmt;
    sh.uniforms.uOrg = { value: origin };
    sh.uniforms.uLen = { value: bsz.z };
    sh.uniforms.uWid = { value: bsz.x };
    sh.uniforms.uDisc = { value: noDisc ? 0 : 1 };
    sh.uniforms.uCut = { value: cuts ? 1 : 0 };
    sh.uniforms.uHasOpen = { value: hasPhysOpenings };
    sh.uniforms.uGrille = { value: new THREE.Vector4(gLoY, gHiY, grilleStyleNum === 2 ? 0.28 : 0.14, grilleStyleNum) };
    sh.uniforms.uSide = { value: Array.from({ length: 8 }, (_, i) => new THREE.Vector2(spec.glass.sideWindow[i % spec.glass.sideWindow.length][0], spec.glass.sideWindow[i % spec.glass.sideWindow.length][1])) };
    sh.uniforms.uGl = { value: new THREE.Vector4(spec.glass.windTop, spec.glass.windBase, spec.glass.rearBase2, spec.glass.rearTop) };
    sh.uniforms.uGlY = { value: new THREE.Vector4(spec.glass.belt - 0.04, spec.glass.belt + 0.04, spec.glass.windHalfW ?? 0.58, spec.glass.rearHalfW ?? 0.52) };
    sh.uniforms.uWh = { value: new THREE.Vector4(W.frontZ, W.rearZ, W.centreY, W.discardR) };
    sh.uniforms.uWr = { value: new THREE.Vector2(W.tyreR, W.rimR) };
    sh.uniforms.uTrim = { value: new THREE.Vector4(spec.shader?.bumperFrontY ?? 0.58, spec.shader?.bumperRearY ?? 0.62, spec.shader?.skirtY ?? 0.30, spec.shader?.archLipAdd ?? 0.095) };
    sh.uniforms.uWingC = { value: new THREE.Vector2(spec.shader?.wingCarbonZ ?? -9.0, spec.shader?.wingCarbonY ?? 9.0) };
    const hdS = spec.lamps?.head;
    const tlS = spec.lamps?.tail;
    sh.uniforms.uHeadL = { value: hdS ? new THREE.Vector4(hdS.x - 0.04, hdS.x + hdS.w + 0.02, hdS.y - 0.02, hdS.y + hdS.h + 0.02) : new THREE.Vector4(0.54, 0.88, 0.60, 0.70) };
    sh.uniforms.uHeadSlope = { value: hdS ? (hdS.tilt ?? 0.045) / Math.max(0.1, hdS.w) : 0.25 };
    sh.uniforms.uTailL = { value: tlS ? new THREE.Vector4(tlS.style === 'full-blade' ? 0.0 : Math.max(0, tlS.x - tlS.len * 0.52), tlS.x + tlS.len * 0.52, tlS.y - 0.04, tlS.y + 0.04) : new THREE.Vector4(0.34, 0.78, 0.765, 0.835) };
    sh.uniforms.uPMin = { value: pmin };
    sh.uniforms.uPMax = { value: pmax };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uFlake, uFinish, uPearlAmt, uCut, uHasOpen, uHeadSlope; uniform vec3 uPearl; uniform vec2 uSide[8], uWingC; uniform vec4 uGl, uGlY, uTrim, uHeadL, uTailL, uGrille;
      bool inSide(vec2 p) { for (int i = 0; i < 8; i++) { int j = i == 7 ? 0 : i + 1; vec2 e = uSide[j] - uSide[i]; if (dot(vec2(e.y, -e.x), p - uSide[i]) > 0.0) return false; } return true; }
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      uniform float uDisc, uLen, uWid; uniform vec3 uPaint, uOrg; uniform vec4 uWh; uniform vec2 uWr; uniform vec3 uPMin[4]; uniform vec3 uPMax[4]; varying vec3 vObj;
      float gBody; float gMetal; float gRough; vec3 gLamp;
      float hexEdge(vec2 p, float s) { p /= s; vec2 r = vec2(1.0, 1.7320508), h = r * 0.5; vec2 a = mod(p, r) - h, b = mod(p - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b; return max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)); }
      float sdBox(vec3 p, vec3 lo, vec3 hi) { vec3 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5, q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }`)
    .replace('#include <map_fragment>', `
      vec4 bk = texture2D(map, vMapUv);
      vec3 cp = vec3(vObj.x - uOrg.x, vObj.y - uOrg.y, vObj.z - uOrg.z);   // car frame: x across, y up, z along (nose +)
      float zN = cp.z / uLen, ax = abs(cp.x);
      float dw = min(length(vec2(cp.z - uWh.x, cp.y - uWh.z)), length(vec2(cp.z - uWh.y, cp.y - uWh.z)));
      if (ax > uWid * 0.22 && dw < uWh.w && uDisc > 0.5) discard;           // baked wheels are replaced by real ones
      bool wheelZone = ax > uWid * 0.27 && dw < uWr.x;
      bool tyre = wheelZone && dw > uWr.y;
      bool rim = wheelZone && dw <= uWr.y;
      bool glass = uCut < 0.5 && ((ax > 0.45 && inSide(vec2(cp.z, cp.y))) || (cp.z > uGl.x && cp.z < uGl.y && ax < uGlY.z - 0.08 + 0.13 * (cp.z - uGl.x) && cp.y > uGlY.x) || (cp.z > uGl.z && cp.z < uGl.w && ax < uGlY.w && cp.y > uGlY.y));
      bool nose = zN > 0.42;
      float gHalfW = uGrille.w > 1.5 ? uWid * 0.30 : uWid * 0.24;
      bool grille = uHasOpen < 0.5 && uGrille.w > 0.5 && nose && ax < gHalfW && cp.y > uGrille.x && cp.y < uGrille.y;
      bool intake = uHasOpen < 0.5 && nose && ax < uWid * 0.36 && cp.y > uGrille.z && cp.y < uGrille.x - 0.03;
      bool headL = nose && ax > uHeadL.x && ax < uHeadL.y && cp.y > uHeadL.z + (ax - uHeadL.x) * uHeadSlope && cp.y < uHeadL.w + (ax - uHeadL.x) * uHeadSlope;
      bool tailL = zN < -0.40 && ax >= uTailL.x && ax < uTailL.y && cp.y > uTailL.z && cp.y < uTailL.w;
      // black satin trim: lower bumpers, side skirts, arch lips, and optional baked carbon rear wing
      bool bumper = (zN > 0.44 && cp.y < uTrim.x) || (zN < -0.44 && cp.y < uTrim.y);
      bool skirt = ax > uWid * 0.32 && cp.y < uTrim.z && abs(zN) < 0.30;
      bool archLip = ax > uWid * 0.30 && dw < uWr.x + uTrim.w;
      bool carbonWing = cp.z < uWingC.x && cp.y > uWingC.y;
      float pLum = dot(uPaint, vec3(0.299, 0.587, 0.114));
      vec3 col = uPaint; gBody = 1.0; gMetal = mix(0.74, 0.54, smoothstep(0.22, 0.68, pLum)); gRough = mix(0.18, 0.28, smoothstep(0.22, 0.68, pLum)); gLamp = vec3(0.0);
      // Physical contact ambient occlusion: grounds lower rockers, wheel wells, and downward overhangs
      float aoGround = mix(0.46, 1.0, smoothstep(0.04, 0.34, cp.y));
      float aoArch = mix(0.54, 1.0, smoothstep(uWr.x, uWr.x + 0.15, dw));
      float aoUnder = mix(0.58, 1.0, smoothstep(-0.55, 0.12, normalize(vNormal).y));
      float ao = aoGround * aoArch * aoUnder;
      {
        float fl = h31(floor(cp * 1100.0));
        float ndv = clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
        // Photorealistic multi-stage automotive lacquer flop + grazing depth + subtle cool clearcoat highlight
        float flop = mix(0.58, 1.18, pow(ndv, 0.58));
        col *= mix(1.0, flop, step(uFinish, 0.5));
        col += vec3(0.015, 0.020, 0.030) * pow(1.0 - ndv, 3.2) * step(uFinish, 0.5);
        col = mix(col, uPearl, uPearlAmt * smoothstep(-0.8, 0.8, cp.x * sign(cp.z + 0.01) + cp.y * 0.4));
        float aaF = 1.0 - smoothstep(0.35, 1.0, length(fwidth(cp)) * 1100.0);
        col *= 1.0 + uFlake * (fl - 0.5) * 0.82 * step(uFinish, 1.5) * aaF;
        gRough = clamp(gRough + (fl - 0.5) * 0.07 * uFlake * step(uFinish, 1.5) * aaF, 0.08, 0.90);
        if (uFinish > 2.5) { gMetal = 1.0; gRough = 0.05; gBody = 0.0; }
        else if (uFinish > 1.5) { gMetal = 0.14; gRough = 0.78; gBody = 0.0; }
        else if (uFinish > 0.5) { gMetal = 0.48; gRough = 0.36; gBody = 0.40; }
        col *= mix(0.74, 1.0, ao);
      }
      if (tyre) { col = vec3(0.016, 0.016, 0.018); gBody = 0.0; gMetal = 0.0; gRough = 0.88; }
      else if (rim) { col = vec3(0.04); gBody = 0.0; gMetal = 1.0; gRough = 0.28; }
      else if (glass) {
        float ndvG = clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
        col = mix(vec3(0.03, 0.045, 0.065), vec3(0.005, 0.007, 0.011), pow(ndvG, 0.7));
        gBody = 1.0; gMetal = 0.04; gRough = 0.018;
      }
      else if (headL) {
        col = vec3(0.010, 0.012, 0.016);
        gBody = 0.25; gMetal = 0.35; gRough = 0.10; gLamp = vec3(0.0);
      }
      else if (tailL) { col = vec3(0.02, 0.004, 0.004); gBody = 0.25; gMetal = 0.2; gRough = 0.10; gLamp = vec3(0.0); }
      else if (grille || intake) {
        // Recessed automotive grille: satin frame + 3D hex honeycomb mesh / truck chrome slats over deep radiator cavity
        float fe = grille
          ? min(min(gHalfW - ax, cp.y - uGrille.x), uGrille.y - cp.y)
          : min(min(uWid * 0.36 - ax, cp.y - uGrille.z), (uGrille.x - 0.03) - cp.y);
        float hd = hexEdge(vec2(cp.x, cp.y), 0.024);
        float wire = smoothstep(0.35, 0.43, hd);
        float depth = smoothstep(0.0, 0.09, fe);
        float barFreq = uGrille.w > 1.5 ? 62.0 : 95.0;
        float bars = grille ? smoothstep(0.80, 0.94, 0.5 + 0.5 * sin(cp.y * barFreq)) : 0.0;
        float frame = 1.0 - smoothstep(0.014, 0.026, fe);
        vec3 holeC = vec3(0.003, 0.003, 0.004);
        vec3 wireC = (uGrille.w > 1.5 ? vec3(0.46, 0.48, 0.52) : vec3(0.28, 0.30, 0.34)) * (0.32 + 0.68 * (1.0 - depth * 0.65));
        col = mix(holeC, wireC, max(wire * 0.80, bars * (uGrille.w > 1.5 ? 0.92 : 0.65)));
        vec3 frameC = uGrille.w > 1.5 ? vec3(0.22, 0.24, 0.27) : vec3(0.022, 0.024, 0.028);
        col = mix(col, frameC, frame);
        gBody = 0.0; gMetal = mix(0.12, 0.92, max(wire, bars) * (1.0 - frame)); gRough = mix(0.82, 0.26, max(wire, bars));
      }
      else if (carbonWing) {
        float cw = step(0.5, fract((cp.x + cp.z) * 55.0)) * 0.006;
        col = vec3(0.018 + cw, 0.020 + cw, 0.024 + cw); gBody = 0.55; gMetal = 0.28; gRough = 0.28;
      }
      else if (bumper || skirt || archLip) {
        float grain = (h31(floor(cp * 420.0)) - 0.5) * 0.008;
        col = vec3(0.015 + grain, 0.016 + grain, 0.018 + grain) * mix(0.65, 1.0, ao);
        gBody = 0.10; gMetal = 0.12; gRough = 0.62;
      }
      else {
        float sd = 9.0;
        for (int i = 0; i < 4; i++) sd = min(sd, abs(sdBox(cp, uPMin[i], uPMax[i])));
        float seam = 1.0 - smoothstep(0.0012, 0.0028, sd);
        float bevel = smoothstep(0.0028, 0.0045, sd) * (1.0 - smoothstep(0.0045, 0.009, sd));
        col = mix(col, vec3(0.010), seam) * (1.0 + 0.16 * bevel); gBody *= 1.0 - seam; gRough = mix(gRough, 0.72, seam);
      }
      if (!gl_FrontFacing && zN > 0.30 && cp.y > 0.5) discard;
      if (!gl_FrontFacing) { col *= 0.88; gLamp = vec3(0.0); }
      diffuseColor.rgb = col;
    `)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMetal;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gLamp;')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= gBody;');
  };
  mat.customProgramCacheKey = () => 'scan-car-v26';

  // ---- mesh surgery: cut the scan into separate real pieces with clean edges, gaps and thickness (see scanparts.ts) ----
  const g = new THREE.Group();
  const pivots: Record<string, { pivot: THREE.Group; axis: THREE.Vector3; angle: number; t: number; target: number }> = {};
  const shells: THREE.Mesh[] = [];                 // uncut copies, only used to ray cast the true surface
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) meshes.push(m); });
  const GAP = 0.0015;
  const gl = spec.glass, fr = spec.front;
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x05080d, roughness: 0.018, metalness: 0.02, ior: 1.52, reflectivity: 0.96, transparent: true, opacity: 0.68, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 3.0, side: THREE.DoubleSide });
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
  const hoodBox = spec.panelBoxes?.hood ?? [[-0.74, 0.78, gl.windBase + 0.04], [0.74, 1.3, 2.02]];
  const trunkBox = spec.panelBoxes?.trunk ?? [[-0.82, 0.95, -2.45], [0.82, 1.3, gl.rearBase - 0.02]];
  const roofBox = spec.panelBoxes?.roof ?? [[-0.6, 1.22, gl.rearTop], [0.6, 1.6, gl.windTop]];
  const windHW = gl.windHalfW ?? 0.58;
  const rearHW = gl.rearHalfW ?? 0.52;
  const windMinY = gl.belt - 0.04;
  const rearMinY = gl.belt + 0.04;
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
    if (name === 'hood') return [boxRegion(hoodBox[0], hoodBox[1])];
    return [boxRegion(trunkBox[0], trunkBox[1])];     // trunk
  };
  // side glass: the side surface only (so the roof edge stays paint), plus a wider band at the A-pillar so the pillar is thin like the reference
  const sideGlass = (s: number): Region[] => {
    const a = sideRegion(gl.sideWindow, s, 0.58, false);
    const b = sideRegion(gl.sideWindow, s, 0.4, false);
    b.push(plane(0, 0, -1, 0.05, false));                                                    // only ahead of z = -0.05
    b.push(s > 0 ? plane(-1, 0, -0.089, -0.5756, false) : plane(1, 0, -0.089, -0.5756, false));   // xMin falls from 0.58 to about 0.50 at the pillar base
    return [a, b];
  };
  const glassTopY = gl.roofEdge + 0.12;
  const windGlass: Region = [
    plane(0, 0, 1, gl.windBase, false), plane(0, 0, -1, -gl.windTop, false), plane(0, -1, 0, -windMinY, false), plane(0, 1, 0, glassTopY, false),
    plane(1, 0, -0.13, windHW - 0.13 * gl.windTop, false), plane(-1, 0, -0.13, windHW - 0.13 * gl.windTop, false),
  ];
  const rearGlass: Region = [
    plane(0, 0, 1, gl.rearTop, false), plane(0, 0, -1, -gl.rearBase2, false), plane(0, -1, 0, -rearMinY, false), plane(0, 1, 0, glassTopY, false),
    plane(1, 0, 0, rearHW, false), plane(-1, 0, 0, rearHW, false),
  ];
  for (const m of meshes) {
    const geo0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    if (!geo0.attributes.uv) geo0.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo0.attributes.position.count * 2), 2));
    smoothNormals(geo0);
    shells.push(new THREE.Mesh(geo0, mat));
    const bakedMap = (m.material as THREE.MeshStandardMaterial).map;
    if (bakedMap) mat.map = bakedMap;
    if (!mat.map) { mat.map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); mat.map.needsUpdate = true; }
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
    // hood and trunk lid: replace torn top surfaces with a clean height-grid skin (unless preserveHood keeps a sculpted scoop)
    if (pieces.hood && !spec.panelBoxes?.preserveHood) {
      pieces.hood.skin = topSkin(tris, origin, [hoodBox[0][0] + GAP, hoodBox[1][0] - GAP, hoodBox[0][2] + GAP / 2, hoodBox[1][2] - GAP / 2], 48, 58);
    }
    if (pieces.trunk && !spec.panelBoxes?.preserveTrunk) {
      pieces.trunk.skin = topSkin(tris, origin, [trunkBox[0][0] + GAP, trunkBox[1][0] - GAP, Math.max(trunkBox[0][2], -2.32), trunkBox[1][2] - GAP / 2], 54, 14);
    }
    // glass that stays on the body: windshield, rear window, quarter windows
    let bodyGlass: Tri[] = [];
    if (cuts) for (const r of [windGlass, rearGlass, ...sideGlass(1), ...sideGlass(-1)].map(toGeom)) {
      const sg = splitUnion(rest, [r], 0); rest = sg.rest; bodyGlass = bodyGlass.concat(sg.panel);
    }
    if (cuts && !spec.panelBoxes?.preserveRoof) {
      // roof: the scan's roof has holes and folds along the glass edges, so replace it with a clean skin of the same shape
      rest = clipRegion(rest, toGeom(boxRegion(roofBox[0], roofBox[1], [false, false, false, false, false, false])), 0, 'outside');
      rest = rest.concat(topSkin(tris, origin, [roofBox[0][0], roofBox[1][0], roofBox[0][2], roofBox[1][2]], 50, 56));
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
      pivots[name] = { pivot: pv, axis: new THREE.Vector3(sp.axis[0], sp.axis[1], sp.axis[2]).normalize(), angle: sp.open, t: 0, target: 0 };
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
  const accentHex = spec.accent ? Number(spec.accent) : 0xb9531a;
  const struts: { update: () => void }[] = [];
  if (cuts) {
    const steel = std(0x8b8f96, 0.3, 0.95), blkm = std(0x0b0c0f, 0.5, 0.7), chromeM = std(0xcfd2d8, 0.12, 1), cardM = std(0x15161a, 0.8, 0.1), acc = std(accentHex, 0.5, 0.2), lea = std(0x0a0a0c, 0.55, 0.1);
    const P = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(origin.x + x, origin.y + y, origin.z + z);
    const partsOf = (n: string): THREE.Object3D => pivots[n].pivot.children[0];
    const box = (w: number, h: number, d: number, m: THREE.Material, p: THREE.Vector3, parent: THREE.Object3D): THREE.Mesh => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.copy(p); parent.add(me); return me; };
    const strut = (a: THREE.Vector3, parts: THREE.Object3D, bLocal: THREE.Vector3, r = 0.013): void => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), blkm), rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 1, 8), chromeM);
      body.userData.keep = rod.userData.keep = true;                             // moved one by one every frame: never batched
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
    if (pivots.hood && spec.panels.hood) {
      const hh = spec.panels.hood.hinge;
      const hy = hh[1] - 0.11, hz = hh[2];
      for (const s of [-1, 1]) {
        box(0.1, 0.02, 0.1, steel, P(s * 0.52, hy, hz - 0.06), g);
        box(0.012, 0.05, 0.1, steel, P(s * 0.52 - s * 0.05, hy - 0.01, hz - 0.06), g);
        const arm = box(0.07, 0.014, 0.26, steel, P(s * 0.52, hy + 0.02, hz + 0.12), partsOf('hood')); arm.rotation.x = 0.0;
        box(0.03, 0.03, 0.03, chromeM, P(s * 0.52, hy + 0.02, hz), partsOf('hood'));
        strut(P(s * 0.64, hy - 0.28, hz + 0.12), partsOf('hood'), P(s * 0.6, hy - 0.01, hz + 0.52));
      }
    }
    // trunk: hinge brackets and struts (tucked cleanly beneath sloped fastback rear decks)
    if (pivots.trunk && spec.panels.trunk) {
      const th = spec.panels.trunk.hinge;
      const ty = th[1] - 0.14, tz = th[2];
      for (const s of [-1, 1]) {
        box(0.08, 0.02, 0.08, steel, P(s * 0.44, ty, tz + 0.08), g);
        box(0.05, 0.014, 0.18, steel, P(s * 0.44, ty + 0.02, tz - 0.08), partsOf('trunk'));
        box(0.024, 0.024, 0.024, chromeM, P(s * 0.44, ty + 0.02, tz), partsOf('trunk'));
        strut(P(s * 0.48, ty - 0.22, tz + 0.24), partsOf('trunk'), P(s * 0.46, ty + 0.01, tz - 0.22));
      }
    }
    // doors: two hinges each at the A-pillar side, a check strap, an interior card with pull, armrest, speaker and window switches
    const dyOff = spec.cabin?.yOffset ?? 0;
    for (const [name, sx] of [['doorL', 1], ['doorR', -1]] as [string, number][]) {
      if (!pivots[name] || !spec.panels[name]) continue;
      const parts = partsOf(name);
      const dh = spec.panels[name].hinge;
      const hx = Math.abs(dh[0]) - 0.07, hz = dh[2] - 0.04;
      const midZ = (gl.doorFront + gl.doorRear) * 0.5;
      const cardLen = Math.min(1.4, Math.max(0.95, gl.doorFront - gl.doorRear - 0.12));
      for (const hy of [0.5 + dyOff * 0.5, 0.74 + dyOff * 0.5]) {
        box(0.07, 0.1, 0.06, steel, P(sx * hx, hy, hz), g);
        box(0.05, 0.08, 0.05, blkm, P(sx * (hx + 0.02), hy, hz + 0.05), parts);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 10), chromeM); pin.position.copy(P(sx * (hx + 0.04), hy, hz + 0.03)); g.add(pin);
      }
      strut(P(sx * (hx - 0.12), 0.7 + dyOff * 0.5, hz - 0.06), parts, P(sx * (hx - 0.08), 0.72 + dyOff * 0.5, hz - 0.56), 0.01);
      const cx = sx * Math.max(0.50, hx - 0.16);
      box(0.036, 0.44, cardLen * 0.88, cardM, P(cx, 0.68 + dyOff * 0.65, midZ), parts);
      box(0.045, 0.045, 0.42, lea, P(cx - sx * 0.02, 0.84 + dyOff * 0.65, midZ - 0.10), parts);
      box(0.045, 0.012, 0.42, acc, P(cx - sx * 0.025, 0.87 + dyOff * 0.65, midZ - 0.10), parts);
      box(0.04, 0.045, 0.18, std(0x2a2c30, 0.5, 0.8), P(cx - sx * 0.02, 0.72 + dyOff * 0.65, midZ + 0.20), parts);
      const spk = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 24), std(0x0a0a0c, 0.9, 0.3)); spk.rotation.z = Math.PI / 2; spk.position.copy(P(cx - sx * 0.02, 0.54 + dyOff * 0.55, midZ + 0.20)); parts.add(spk);
      for (let i = 0; i < 3; i++) box(0.025, 0.012, 0.032, chromeM, P(cx - sx * 0.035, 0.86 + dyOff * 0.65, midZ + i * 0.045), parts);
    }
  }

  // parts built from the spec, all placed in the scan's car frame
  const carFrame = new THREE.Group();
  carFrame.position.copy(origin);
  g.add(carFrame);
  if (spec.engine) carFrame.add(buildDetailedEngine(spec.engine));
  if (spec.exhaust) carFrame.add(buildAero(spec.exhaust, spec.aero));
  carFrame.add(buildSuspension(spec));
  carFrame.add(buildUnderbody(spec));
  const cabGrp = buildCabin(accentHex, spec.cabin, spec.trunk !== false);
  cabGrp.scale.x = Math.min(1.0, Math.max(0.68, (bsz.x - 0.56) / 1.56));
  carFrame.add(cabGrp);
  carFrame.add(buildCowl(spec.cabin?.cowlZ, spec.cabin?.cowlY));
  carFrame.add(buildDriver(accentHex, spec.cabin));
  if (spec.trunk !== false) carFrame.add(buildTrunk(-bsz.z * 0.5 + 0.38, bsz.x * 0.28, gl.belt));
  g.updateMatrixWorld(true);
  const lamps = buildLamps(shells, origin, spec.lamps);
  carFrame.add(lamps.group);
  carFrame.add(buildFront(shells, origin, cuts ? spec.front.openings : []));
  g.add(buildContactShadow(origin, W));
  const lightPools = buildGroundLightPools(origin);
  g.add(lightPools.group);
  const wl = [[true, true, W.frontX, W.frontZ], [true, false, -W.frontX, W.frontZ], [false, true, W.rearX, W.rearZ], [false, false, -W.rearX, W.rearZ]] as [boolean, boolean, number, number][];
  const WH: { spin: THREE.Group; steer: THREE.Group; discMat: THREE.MeshPhysicalMaterial; front: boolean; left: boolean }[] = [];
  for (const [front, left, x, z] of wl) {
    const w = wheel(front, left, W.style);
    w.root.position.set(origin.x + x, origin.y + (front ? 0.352 : 0.358) * W.scale, origin.z + z);
    w.root.scale.setScalar(W.scale);
    if (!noDisc) g.add(w.root);
    WH.push({ spin: w.spin, steer: w.steer, discMat: w.discMat, front, left });
  }
  // about 1,200 small meshes were 1,200 draw calls a frame: merge what cannot move relative to its parent (carBatch.ts); ?nobatch keeps the original for comparing
  if (!location.search.includes('nobatch')) { const st = batchStatic(g, [...WH.flatMap((w) => [w.spin, w.steer]), ...Object.values(pivots).map((p) => p.pivot)]); console.log('car batched', st.before, '->', st.after, 'meshes'); (window as unknown as { carBatch: unknown }).carBatch = st; }
  let ang = 0;
  let rotorHeat = 0;
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
    update(speed: number, steer: number, dt: number, _lights?: boolean, brake = 0, wetNight = 0) {
      ang += (speed / (W.tyreR || 0.355)) * dt;
      // Thermal brake rotor glow under heavy high-speed braking + HDR brake-light surge
      const heatTarget = brake > 0.15 && Math.abs(speed) > 8 ? Math.min(1, brake * Math.min(1, Math.abs(speed) / 42)) : 0;
      rotorHeat += (heatTarget - rotorHeat) * Math.min(1, dt * (heatTarget > rotorHeat ? 2.4 : 0.65));
      const glow = Math.max(0, (rotorHeat - 0.18) / 0.82) * 3.8;
      lamps.ledR.emissiveIntensity = 3.6 + brake * 5.4 + wetNight * 1.4;
      lamps.ledW.emissiveIntensity = 4.2 + wetNight * 2.6;
      lightPools.rearMat.opacity = Math.min(0.46, (0.08 + brake * 0.24) * (0.18 + wetNight * 1.1));
      lightPools.frontMat.opacity = Math.min(0.42, 0.04 + wetNight * 0.36);
      for (const w of WH) {
        w.spin.rotation.x = w.left ? -ang : ang;
        w.steer.rotation.y = w.front ? steer : 0;
        w.discMat.emissiveIntensity = w.front ? glow : glow * 0.72;
      }
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

// Automatically discover every built vehicle spec in games/forth-horizon/car/<id>/spec.json
// Must stay a literal `import.meta.glob(...)` call so Vite's AST transform expands it!
const _autoSpecModules = import.meta.glob<ScanSpec>('../car/*/spec.json', { eager: true, import: 'default' });

export const SCAN_SPECS: Record<string, ScanSpec> = {
  kestrel: sovSpec as unknown as ScanSpec,
  sovereign: sovSpec as unknown as ScanSpec,
  corsair: corsairSpec as unknown as ScanSpec,
  vanguard: vanguardSpec as unknown as ScanSpec,
};
for (const [modPath, modSpec] of Object.entries(_autoSpecModules)) {
  const m = modPath.match(/\/car\/([^/]+)\/spec\.json$/);
  if (m && modSpec) {
    const key = m[1] === 'sovereign' ? 'kestrel' : m[1];
    if (!(key in SCAN_SPECS)) SCAN_SPECS[key] = modSpec;
  }
}

const CIRCUIT_OPP_CANDIDATES = [
  'vanguard', 'aurelia', 'solstice_r', 'helios', 'solstice',
  'veloce', 'voltstrike', 'kestrel', 'kuronuma', 'sidewinder',
  'corsair', 'apex_tcr', 'zephyr_emotion', 'ironhide',
  'stratos_wrc', 'terracorsa', 'legacy_gtr', 'continental',
];

/** Built high-performance scan cars automatically used as AI race opponents on street circuits */
export const RACE_OPPONENT_SCAN_IDS: string[] = CIRCUIT_OPP_CANDIDATES.filter((id) => id in SCAN_SPECS);

/** Built everyday street & commercial scan vehicles automatically spawned in Ironport free-roam traffic */
export const TRAFFIC_SCAN_IDS: string[] = Object.entries(SCAN_SPECS)
  .filter(([id, spec]) => id !== 'sovereign' && spec.traffic === true)
  .map(([id]) => id);

export function hasScanCar(id: string): boolean {
  return id in SCAN_SPECS;
}

export function loadScanCarById(id: string): Promise<CarRig> {
  return loadScanCar(SCAN_SPECS[id] ?? SCAN_SPECS.kestrel);
}

export function loadSovereignScan(): Promise<CarRig> {
  return loadScanCar(SCAN_SPECS.kestrel);
}

interface OpponentTemplate {
  spec: ScanSpec;
  origin: THREE.Vector3;
  bsz: THREE.Vector3;
  bodyGeos: THREE.BufferGeometry[];
  bakedMap: THREE.Texture | null;
  extras: THREE.Group;
}

const opponentTemplates = new Map<string, Promise<OpponentTemplate>>();

const oppWheelMats = (() => ({
  tire: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.86, metalness: 0.04 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xbec3cc, roughness: 0.24, metalness: 0.92 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.55, metalness: 0.45 }),
  disc: new THREE.MeshStandardMaterial({ color: 0x7e838c, roughness: 0.36, metalness: 0.88 }),
  caliper: new THREE.MeshStandardMaterial({ color: 0xc81c22, roughness: 0.34, metalness: 0.42 }),
}))();

function buildOpponentWheel(front: boolean, left: boolean): THREE.Group {
  const g = new THREE.Group();
  const s = left ? 1 : -1;
  const r = front ? 0.352 : 0.358;
  const w = front ? 0.265 : 0.305;
  // Clean exterior-only performance tire + concave 10-spoke alloy wheel + brake disc + red caliper (~700 tris total, shared mats -> batches to 5 draws!)
  const tread = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 24, 1, false), oppWheelMats.tire);
  tread.rotation.z = Math.PI / 2;
  g.add(tread);
  const rimBarrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, w * 0.92, 20, 1, true), oppWheelMats.dark);
  rimBarrel.rotation.z = Math.PI / 2;
  g.add(rimBarrel);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.70, 0.016, 8, 22), oppWheelMats.rim);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = s * (w * 0.45);
  g.add(lip);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.055, 14), oppWheelMats.rim);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = s * (w * 0.36);
  g.add(hub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    for (const off of [-0.14, 0.14]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.024, r * 0.62, 0.022), oppWheelMats.rim);
      const ang = a + off;
      sp.position.set(s * (w * 0.38), Math.cos(ang) * r * 0.36, Math.sin(ang) * r * 0.36);
      sp.rotation.x = -ang;
      g.add(sp);
    }
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.56, 0.026, 18), oppWheelMats.disc);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = s * (w * 0.14);
  g.add(disc);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.14, 0.095), oppWheelMats.caliper);
  cal.position.set(s * (w * 0.16), 0.02, front ? -r * 0.40 : r * 0.40);
  g.add(cal);
  return g;
}

async function getOpponentTemplate(id: string): Promise<OpponentTemplate> {
  let prom = opponentTemplates.get(id);
  if (prom) return prom;
  const spec = SCAN_SPECS[id] ?? SCAN_SPECS.kestrel;
  prom = (async () => {
    const root: THREE.Object3D = spec.body === 'modelled'
      ? (() => { const rg = new THREE.Group(); rg.add(new THREE.Mesh(buildBodyGeometry(), new THREE.MeshStandardMaterial())); return rg; })()
      : (await new GLTFLoader().loadAsync(spec.glb)).scene;
    const bb = new THREE.Box3();
    const rawMeshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox!); rawMeshes.push(m); }
    });
    const bmin = bb.min.clone(), bsz = bb.getSize(new THREE.Vector3());
    const origin = spec.body === 'modelled' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(bmin.x + bsz.x / 2, bmin.y, bmin.z + bsz.z / 2);

    const bodyGeos: THREE.BufferGeometry[] = [];
    const shells: THREE.Mesh[] = [];
    let bakedMap: THREE.Texture | null = null;
    const dummyMat = new THREE.MeshBasicMaterial();
    for (const m of rawMeshes) {
      const geo0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      if (!geo0.attributes.uv) geo0.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo0.attributes.position.count * 2), 2));
      smoothNormals(geo0);
      const bm = (m.material as THREE.MeshStandardMaterial).map;
      if (bm && !bakedMap) bakedMap = bm;
      bodyGeos.push(geo0);
      shells.push(new THREE.Mesh(geo0, dummyMat));
    }

    // Build shared exterior-only hardware (aero, lamps, 4 lightweight wheels, contact shadow) and batch to ~7 meshes!
    const extras = new THREE.Group();
    const frame = new THREE.Group();
    frame.position.copy(origin);
    extras.add(frame);
    if (spec.exhaust) frame.add(buildAero(spec.exhaust, spec.aero));
    extras.updateMatrixWorld(true);
    const lamps = buildLamps(shells, origin, spec.lamps);
    frame.add(lamps.group);
    extras.add(buildContactShadow(origin, spec.wheels));
    const W = spec.wheels;
    const wl = [[true, true, W.frontX, W.frontZ], [true, false, -W.frontX, W.frontZ], [false, true, W.rearX, W.rearZ], [false, false, -W.rearX, W.rearZ]] as [boolean, boolean, number, number][];
    for (const [front, left, x, z] of wl) {
      const w = buildOpponentWheel(front, left);
      w.position.set(origin.x + x, origin.y + (front ? 0.352 : 0.358) * W.scale, origin.z + z);
      w.scale.setScalar(W.scale);
      extras.add(w);
    }
    batchStatic(extras, []);
    extras.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; }
    });
    // Low-poly 12-tri interior shadow-caster core (replaces 60k-face shadow pass per opponent!)
    const shadowHull = new THREE.Mesh(
      new THREE.BoxGeometry(bsz.x * 0.78, bsz.y * 0.62, bsz.z * 0.84),
      oppWheelMats.dark
    );
    shadowHull.position.set(origin.x, origin.y + bsz.y * 0.42, origin.z);
    shadowHull.castShadow = true;
    shadowHull.receiveShadow = false;
    extras.add(shadowHull);
    return { spec, origin, bsz, bodyGeos, bakedMap, extras };
  })();
  opponentTemplates.set(id, prom);
  return prom;
}

/**
 * Lightweight exterior-only instance of a built high-performance scan car for AI race opponents.
 * Reuses cached geometry & compiled scan-car shader with per-opponent metallic livery (~9 draw calls/car).
 */
export async function loadScanOpponentCar(id: string, paintHex: number | string): Promise<THREE.Group> {
  const tpl = await getOpponentTemplate(id);
  const { spec, origin, bsz, bodyGeos, bakedMap, extras } = tpl;
  const W = spec.wheels;
  const paint = new THREE.Color(paintHex);
  const mapTex = bakedMap ?? (() => { const d = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); d.needsUpdate = true; return d; })();
  const pmin = [new THREE.Vector3(9, 9, 9), new THREE.Vector3(9, 9, 9), new THREE.Vector3(9, 9, 9), new THREE.Vector3(9, 9, 9)];
  const pmax = [new THREE.Vector3(9, 9, 9), new THREE.Vector3(9, 9, 9), new THREE.Vector3(9, 9, 9), new THREE.Vector3(9, 9, 9)];
  const mat = new THREE.MeshPhysicalMaterial({ map: mapTex, metalness: 0.72, roughness: 0.20, clearcoat: 1, clearcoatRoughness: 0.028, envMapIntensity: 1.85, side: THREE.DoubleSide });
  const grilleStyleNum = spec.shader?.grilleStyle === 'ev' ? 0 : spec.shader?.grilleStyle === 'truck' ? 2 : 1;
  const gLoY = spec.shader?.grilleLoY ?? (grilleStyleNum === 2 ? 0.52 : 0.34);
  const gHiY = spec.shader?.grilleHiY ?? (grilleStyleNum === 2 ? 1.02 : 0.60);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = { value: new THREE.Vector3(paint.r, paint.g, paint.b) };
    sh.uniforms.uFlake = { value: 0.36 };
    sh.uniforms.uFinish = { value: 0 };
    sh.uniforms.uPearl = { value: new THREE.Vector3(paint.r, paint.g, paint.b) };
    sh.uniforms.uPearlAmt = { value: 0 };
    sh.uniforms.uOrg = { value: origin };
    sh.uniforms.uLen = { value: bsz.z };
    sh.uniforms.uWid = { value: bsz.x };
    sh.uniforms.uDisc = { value: 1 };
    sh.uniforms.uCut = { value: 0 }; // shader renders crisp smoked jet-black glass + honeycomb grille + carbon trim in one pass!
    sh.uniforms.uGrille = { value: new THREE.Vector4(gLoY, gHiY, grilleStyleNum === 2 ? 0.28 : 0.14, grilleStyleNum) };
    sh.uniforms.uSide = { value: Array.from({ length: 8 }, (_, i) => new THREE.Vector2(spec.glass.sideWindow[i % spec.glass.sideWindow.length][0], spec.glass.sideWindow[i % spec.glass.sideWindow.length][1])) };
    sh.uniforms.uGl = { value: new THREE.Vector4(spec.glass.windTop, spec.glass.windBase, spec.glass.rearBase2, spec.glass.rearTop) };
    sh.uniforms.uGlY = { value: new THREE.Vector4(spec.glass.belt - 0.05, spec.glass.belt - 0.01, (spec.glass.windHalfW ?? 0.58) + 0.04, (spec.glass.rearHalfW ?? 0.52) + 0.05) };
    sh.uniforms.uWh = { value: new THREE.Vector4(W.frontZ, W.rearZ, W.centreY, W.discardR) };
    sh.uniforms.uWr = { value: new THREE.Vector2(W.tyreR, W.rimR) };
    sh.uniforms.uTrim = { value: new THREE.Vector4(spec.shader?.bumperFrontY ?? 0.58, spec.shader?.bumperRearY ?? 0.62, spec.shader?.skirtY ?? 0.30, spec.shader?.archLipAdd ?? 0.095) };
    sh.uniforms.uWingC = { value: new THREE.Vector2(spec.shader?.wingCarbonZ ?? -9.0, spec.shader?.wingCarbonY ?? 9.0) };
    const hdS = spec.lamps?.head, tlS = spec.lamps?.tail;
    sh.uniforms.uHeadL = { value: hdS ? new THREE.Vector4(hdS.x - 0.04, hdS.x + hdS.w + 0.02, hdS.y - 0.02, hdS.y + hdS.h + 0.02) : new THREE.Vector4(0.54, 0.88, 0.60, 0.70) };
    sh.uniforms.uHeadSlope = { value: hdS ? (hdS.tilt ?? 0.045) / Math.max(0.1, hdS.w) : 0.25 };
    sh.uniforms.uTailL = { value: tlS ? new THREE.Vector4(tlS.style === 'full-blade' ? 0.0 : Math.max(0, tlS.x - tlS.len * 0.52), tlS.x + tlS.len * 0.52, tlS.y - 0.04, tlS.y + 0.04) : new THREE.Vector4(0.34, 0.78, 0.765, 0.835) };
    sh.uniforms.uPMin = { value: pmin };
    sh.uniforms.uPMax = { value: pmax };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uFlake, uFinish, uPearlAmt, uCut, uHeadSlope; uniform vec3 uPearl; uniform vec2 uSide[8], uWingC; uniform vec4 uGl, uGlY, uTrim, uHeadL, uTailL, uGrille;
      bool inSide(vec2 p) { for (int i = 0; i < 8; i++) { int j = i == 7 ? 0 : i + 1; vec2 e = uSide[j] - uSide[i]; if (dot(vec2(e.y, -e.x), p - uSide[i]) > 0.0) return false; } return true; }
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      uniform float uDisc, uLen, uWid; uniform vec3 uPaint, uOrg; uniform vec4 uWh; uniform vec2 uWr; uniform vec3 uPMin[4]; uniform vec3 uPMax[4]; varying vec3 vObj;
      float gBody; float gMetal; float gRough; vec3 gLamp;
      float hexEdge(vec2 p, float s) { p /= s; vec2 r = vec2(1.0, 1.7320508), h = r * 0.5; vec2 a = mod(p, r) - h, b = mod(p - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b; return max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)); }
      float sdBox(vec3 p, vec3 lo, vec3 hi) { vec3 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5, q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }`)
    .replace('#include <map_fragment>', `
      vec4 bk = texture2D(map, vMapUv);
      vec3 cp = vec3(vObj.x - uOrg.x, vObj.y - uOrg.y, vObj.z - uOrg.z);
      float zN = cp.z / uLen, ax = abs(cp.x);
      float dw = min(length(vec2(cp.z - uWh.x, cp.y - uWh.z)), length(vec2(cp.z - uWh.y, cp.y - uWh.z)));
      if (ax > uWid * 0.22 && dw < uWh.w && uDisc > 0.5) discard;
      bool wheelZone = ax > uWid * 0.27 && dw < uWr.x;
      bool tyre = wheelZone && dw > uWr.y;
      bool rim = wheelZone && dw <= uWr.y;
      bool glass = uCut < 0.5 && ((ax > 0.45 && inSide(vec2(cp.z, cp.y))) || (cp.z > uGl.x && cp.z < uGl.y && ax < uGlY.z - 0.08 + 0.13 * (cp.z - uGl.x) && cp.y > uGlY.x) || (cp.z > uGl.z && cp.z < uGl.w && ax < uGlY.w && cp.y > uGlY.y));
      bool nose = zN > 0.42;
      float gHalfW = uGrille.w > 1.5 ? uWid * 0.30 : uWid * 0.24;
      bool grille = uGrille.w > 0.5 && nose && ax < gHalfW && cp.y > uGrille.x && cp.y < uGrille.y;
      bool intake = nose && ax < uWid * 0.36 && cp.y > uGrille.z && cp.y < uGrille.x - 0.03;
      bool headL = nose && ax > uHeadL.x && ax < uHeadL.y && cp.y > uHeadL.z + (ax - uHeadL.x) * uHeadSlope && cp.y < uHeadL.w + (ax - uHeadL.x) * uHeadSlope;
      bool tailL = zN < -0.40 && ax >= uTailL.x && ax < uTailL.y && cp.y > uTailL.z && cp.y < uTailL.w;
      bool bumper = (zN > 0.44 && cp.y < uTrim.x) || (zN < -0.44 && cp.y < uTrim.y);
      bool skirt = ax > uWid * 0.32 && cp.y < uTrim.z && abs(zN) < 0.30;
      bool archLip = ax > uWid * 0.30 && dw < uWr.x + uTrim.w;
      bool carbonWing = cp.z < uWingC.x && cp.y > uWingC.y;
      float pLum = dot(uPaint, vec3(0.299, 0.587, 0.114));
      vec3 col = uPaint; gBody = 1.0; gMetal = mix(0.74, 0.54, smoothstep(0.22, 0.68, pLum)); gRough = mix(0.18, 0.28, smoothstep(0.22, 0.68, pLum)); gLamp = vec3(0.0);
      float aoGround = mix(0.46, 1.0, smoothstep(0.04, 0.34, cp.y));
      float aoArch = mix(0.54, 1.0, smoothstep(uWr.x, uWr.x + 0.15, dw));
      float aoUnder = mix(0.58, 1.0, smoothstep(-0.55, 0.12, normalize(vNormal).y));
      float ao = aoGround * aoArch * aoUnder;
      {
        float ndv = clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
        col *= mix(0.60, 1.16, pow(ndv, 0.58)) * mix(0.74, 1.0, ao);
      }
      if (tyre) { col = vec3(0.016, 0.016, 0.018); gBody = 0.0; gMetal = 0.0; gRough = 0.88; }
      else if (rim) { col = vec3(0.04); gBody = 0.0; gMetal = 1.0; gRough = 0.28; }
      else if (glass) {
        float ndvG = clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
        col = mix(vec3(0.032, 0.046, 0.068), vec3(0.004, 0.006, 0.010), pow(ndvG, 0.68));
        gBody = 0.92; gMetal = 0.04; gRough = 0.025;
      }
      else if (headL) { col = vec3(0.010, 0.012, 0.016); gBody = 0.25; gMetal = 0.35; gRough = 0.10; }
      else if (tailL) { col = vec3(0.02, 0.004, 0.004); gBody = 0.25; gMetal = 0.2; gRough = 0.10; }
      else if (grille || intake) {
        float hd = hexEdge(vec2(cp.x, cp.y), 0.026);
        float wire = smoothstep(0.35, 0.44, hd);
        float bars = grille ? smoothstep(0.80, 0.94, 0.5 + 0.5 * sin(cp.y * (uGrille.w > 1.5 ? 62.0 : 95.0))) : 0.0;
        col = mix(vec3(0.004, 0.004, 0.005), uGrille.w > 1.5 ? vec3(0.36, 0.38, 0.42) : vec3(0.18, 0.20, 0.23), max(wire * 0.72, bars * 0.78));
        gBody = 0.0; gMetal = 0.68; gRough = 0.38;
      }
      else if (carbonWing) { col = vec3(0.020, 0.022, 0.026); gBody = 0.52; gMetal = 0.28; gRough = 0.28; }
      else if (bumper || skirt || archLip) { col = vec3(0.015, 0.016, 0.018) * mix(0.65, 1.0, ao); gBody = 0.10; gMetal = 0.12; gRough = 0.62; }
      if (!gl_FrontFacing && zN > 0.30 && cp.y > 0.5) discard;
      diffuseColor.rgb = col;
    `)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gMetal;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gLamp;')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= gBody;');
  };
  mat.customProgramCacheKey = () => 'scan-car-opp-v3';

  const g = new THREE.Group();
  for (const geo of bodyGeos) {
    const bm = new THREE.Mesh(geo, mat);
    bm.castShadow = false; // shadow handled by the 12-tri interior shadowHull in extras!
    bm.receiveShadow = true;
    g.add(bm);
  }
  g.add(extras.clone(true));
  return g;
}
