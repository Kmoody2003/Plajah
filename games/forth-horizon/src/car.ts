// Kestrel Sovereign GT-R: built from the turntable video and render in the racer folder.
// Copper-bronze metallic widebody coupe, long hood, fastback, quad exhaust, carbon splitter and diffuser,
// ten-spoke dark wheels with gold calipers. Car space: +z forward, +x left, +y up, metres, wheels touch y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fit from '../car/sovereign/fit.json';

export interface CarRig {
  group: THREE.Group;
  update: (speed: number, steer: number, dt: number, lights?: boolean, brake?: number, wetNight?: number) => void;
  /** scan cars: live paint (colour, optional pearl shift colour + amount, metallic flake 0..1, finish 0 gloss / 1 satin / 2 matte / 3 chrome) */
  paint?: { set: (o: { color?: number; pearl?: number; pearlAmount?: number; flake?: number; finish?: number }) => void };
  /** scan cars: panels that open (doors, hood, trunk); toggle or set a target 0..1 */
  panels?: { toggle: (k: string) => void; set: (k: string, t: number) => void; names: string[] };
}

function curve(keys: number[][]): (z: number) => number {
  const ks = [...keys].sort((a, b) => a[0] - b[0]);
  const N = 400, z0 = ks[0][0], z1 = ks[ks.length - 1][0];
  const raw: number[] = [];
  for (let i = 0; i <= N; i++) {
    const z = z0 + (z1 - z0) * i / N;
    let j = 0;
    while (j < ks.length - 2 && z > ks[j + 1][0]) j++;
    const t = (z - ks[j][0]) / (ks[j + 1][0] - ks[j][0] || 1);
    const s = t * t * (3 - 2 * t);
    raw.push(ks[j][1] + (ks[j + 1][1] - ks[j][1]) * Math.min(1, Math.max(0, s)));
  }
  const sm = raw.map((_, i) => {
    let a = 0, c = 0;
    for (let k = -6; k <= 6; k++) { const q = raw[Math.min(N, Math.max(0, i + k))]; a += q; c++; }
    return a / c;
  });
  return (z) => {
    const f = Math.min(1, Math.max(0, (z - z0) / (z1 - z0))) * N;
    const i = Math.floor(f), t = f - i;
    return sm[i] + (sm[Math.min(N, i + 1)] - sm[i]) * t;
  };
}

function ring(a: number, hw: number, yMid: number, hy: number, n: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a), e = 2 / n;
  return [hw * Math.sign(c) * Math.pow(Math.abs(c), e), yMid + hy * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

interface Station { z: number; hw: number; yTop: number; yBot: number; n: number }
function loft(st: Station[], N: number, a0 = 0, a1 = Math.PI * 2, cap = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const s of st) {
    const yMid = (s.yTop + s.yBot) / 2, hy = (s.yTop - s.yBot) / 2;
    for (let i = 0; i <= N; i++) {
      const a = a0 + (a1 - a0) * i / N;
      const [x, y] = ring(a, s.hw, yMid, Math.max(hy, 0.001), s.n);
      pos.push(x, y, s.z);
    }
  }
  const row = N + 1;
  for (let k = 0; k < st.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const a = k * row + i, b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  if (cap) {
    for (const [k, flip] of [[0, true], [st.length - 1, false]] as [number, boolean][]) {
      const c = pos.length / 3;
      const s = st[k];
      pos.push(0, (s.yTop + s.yBot) / 2, s.z);
      for (let i = 0; i < N; i++) {
        const a = k * row + i;
        if (flip) idx.push(c, a + 1, a); else idx.push(c, a, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function mat(color: number, rough: number, metal: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

export type WheelStyle = 'forged' | 'classic' | 'offroad' | 'street' | 'heavy';

export function wheel(front: boolean, left: boolean, style: WheelStyle = 'forged'): { root: THREE.Group; steer: THREE.Group; spin: THREE.Group; discMat: THREE.MeshPhysicalMaterial } {
  const isOff = style === 'offroad';
  const isHeavy = style === 'heavy';
  const isClassic = style === 'classic';
  const isStreet = style === 'street';
  const R = front ? 0.352 : 0.358;
  const W = isOff ? 0.325 : isHeavy ? 0.295 : isStreet ? 0.235 : (front ? 0.285 : 0.315);
  const RIM = isOff ? 0.200 : isClassic ? 0.220 : isStreet ? 0.228 : isHeavy ? 0.224 : 0.255;
  const root = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
  root.add(steer);
  steer.add(spin);
  // tyre: deep satin vulcanised rubber sidewall with realistic shoulder profile
  const prof: THREE.Vector2[] = [];
  const hw = W / 2;
  const sh = isOff ? 0.065 : isHeavy ? 0.058 : 0.05;
  const pts: [number, number][] = [[RIM, -hw * 0.98], [RIM + 0.04, -hw], [R - sh, -hw * 0.94], [R - 0.012, -hw * 0.60], [R, -hw * 0.22], [R, hw * 0.22], [R - 0.012, hw * 0.60], [R - sh, hw * 0.94], [RIM + 0.04, hw], [RIM, hw * 0.98]];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const tg = new THREE.LatheGeometry(prof, 40);
  tg.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(tg, mat(isOff || isHeavy ? 0x111214 : 0x131416, isOff ? 0.92 : 0.84, 0.02)));
  // rim finish per authentic vehicle archetype
  const spokeMat = isOff
    ? mat(0x1c1e22, 0.48, 0.72)
    : isHeavy
      ? mat(0x9ca2aa, 0.38, 0.88)
      : isClassic
        ? mat(0xc8cdd4, 0.20, 0.96)
        : isStreet
          ? mat(0xb2b8c2, 0.24, 0.92)
          : mat(0x4b4640, 0.30, 0.94);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(RIM, RIM, W * 0.9, 40, 1, true), mat(isHeavy ? 0x5c626a : 0x202226, 0.48, 0.85, { side: THREE.DoubleSide }));
  barrel.rotation.z = Math.PI / 2;
  spin.add(barrel);
  const outer = left ? 1 : -1;
  const faceX = outer * (W / 2 - (isClassic || isHeavy ? 0.075 : 0.05));
  const bar = (y0: number, z0: number, y1: number, z1: number, w0: number, w1: number, dx: number): void => {
    const len = Math.hypot(y1 - y0, z1 - z0);
    const geo = new THREE.CylinderGeometry(w1 / 2, w0 / 2, len, 6);
    const me = new THREE.Mesh(geo, spokeMat);
    me.scale.x = isOff || isHeavy ? 0.85 : 0.55;
    me.position.set(faceX + dx, (y0 + y1) / 2, (z0 + z1) / 2);
    me.rotation.x = Math.atan2(z1 - z0, y1 - y0);
    spin.add(me);
  };
  if (isOff) {
    // 6-spoke rugged beadlock off-road rim + 16 machined silver perimeter bolts
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2;
      bar(Math.cos(a0) * 0.06, Math.sin(a0) * 0.06, Math.cos(a0) * (RIM - 0.012), Math.sin(a0) * (RIM - 0.012), 0.062, 0.048, 0);
    }
    const boltMat = mat(0xd2d6dc, 0.22, 0.96);
    for (let i = 0; i < 16; i++) {
      const ab = (i / 16) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.014, 6), boltMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(outer * (W / 2 - 0.010), Math.cos(ab) * (RIM - 0.006), Math.sin(ab) * (RIM - 0.006));
      spin.add(b);
    }
  } else if (isHeavy) {
    // Heavy commercial steel disc wheel with 8 reinforced ventilation spokes & deep hub bell
    const discFace = new THREE.Mesh(new THREE.CylinderGeometry(RIM - 0.008, RIM - 0.008, 0.022, 28), spokeMat);
    discFace.rotation.z = Math.PI / 2;
    discFace.position.x = faceX;
    spin.add(discFace);
    const slotMat = mat(0x0c0d10, 0.85, 0.2);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.026, 10), slotMat);
      sl.rotation.z = Math.PI / 2;
      sl.position.set(faceX, Math.cos(a0) * (RIM * 0.64), Math.sin(a0) * (RIM * 0.64));
      spin.add(sl);
    }
  } else if (isClassic) {
    // Classic 5-spoke deep-dish heritage alloy
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2;
      bar(Math.cos(a0) * 0.055, Math.sin(a0) * 0.055, Math.cos(a0) * (RIM - 0.012), Math.sin(a0) * (RIM - 0.012), 0.068, 0.044, 0);
    }
  } else if (isStreet) {
    // Clean OEM twin-5-spoke machined alloy for everyday cars/SUVs/vans
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2;
      for (const off of [-0.14, 0.14]) {
        const a1 = a0 + off;
        bar(Math.cos(a0) * 0.055, Math.sin(a0) * 0.055, Math.cos(a1) * (RIM - 0.010), Math.sin(a1) * (RIM - 0.010), 0.036, 0.026, 0);
      }
    }
  } else {
    // Forged motorsport 10-spoke split-Y wheel
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2;
      const c = Math.cos(a0), sn = Math.sin(a0);
      const r1 = RIM * 0.55;
      bar(c * 0.06, sn * 0.06, c * r1, sn * r1, 0.05, 0.034, 0);
      for (const sgn of [-1, 1]) {
        const a1 = a0 + sgn * 0.17;
        bar(c * r1, sn * r1, Math.cos(a1) * (RIM - 0.012), Math.sin(a1) * (RIM - 0.012), 0.03, 0.022, -outer * 0.004);
      }
    }
  }
  const lipColor = isOff ? 0x2c2e34 : isClassic ? 0xd8dce2 : isStreet ? 0xbec4ce : 0x9a9ea5;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(RIM - 0.004, isOff ? 0.015 : 0.011, 8, 48), mat(lipColor, isOff ? 0.42 : 0.18, 0.96));
  lip.rotation.y = Math.PI / 2;
  lip.position.x = outer * (W / 2 - 0.012);
  spin.add(lip);
  const hubC = new THREE.Mesh(new THREE.CylinderGeometry(isHeavy ? 0.088 : 0.07, isHeavy ? 0.095 : 0.075, isHeavy ? 0.09 : 0.055, 24), mat(isClassic || isStreet ? 0x3a3d42 : 0x1b1c1f, 0.4, 0.85));
  hubC.rotation.z = Math.PI / 2;
  hubC.position.x = faceX + (isHeavy ? outer * 0.02 : 0);
  spin.add(hubC);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 18), mat(0x2a2b2e, 0.3, 0.9));
  cap.rotation.z = Math.PI / 2;
  cap.position.x = faceX + outer * 0.003;
  spin.add(cap);
  const lugCount = isHeavy ? 8 : isOff ? 6 : 5;
  for (let i = 0; i < lugCount; i++) {
    const a2 = (i / lugCount) * Math.PI * 2;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6), mat(0x9a9ea5, 0.3, 0.95));
    nut.rotation.z = Math.PI / 2;
    nut.position.set(faceX + outer * 0.02, Math.cos(a2) * (isHeavy ? 0.062 : 0.048), Math.sin(a2) * (isHeavy ? 0.062 : 0.048));
    spin.add(nut);
  }
  // brake disc + archetype-matched caliper
  const DR = (isOff || isHeavy ? 0.165 : isStreet || isClassic ? 0.175 : (front ? 0.2 : 0.19));
  const discMat = mat(0x8e9197, 0.34, 0.92, { emissive: 0xff3a00, emissiveIntensity: 0 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(DR, DR, 0.032, 48), discMat);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = -outer * 0.06;
  spin.add(disc);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 24), mat(0x1d1e21, 0.5, 0.8));
  hat.rotation.z = Math.PI / 2;
  hat.position.x = -outer * 0.045;
  spin.add(hat);
  if (style === 'forged') {
    const holeM = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 24; i++) {
      const a3 = (i / 24) * Math.PI * 2 + ring * 0.13;
      const rr = DR * (0.62 + ring * 0.18);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.034, 8), holeM);
      hole.rotation.z = Math.PI / 2;
      hole.position.set(-outer * 0.06, Math.cos(a3) * rr, Math.sin(a3) * rr);
      spin.add(hole);
    }
  }
  const calColor = style === 'forged' ? 0xd49a2b : isOff ? 0xb82424 : isStreet ? 0x626770 : isClassic ? 0x45484f : 0x2c2e32;
  const calTopColor = style === 'forged' ? 0xb88224 : isOff ? 0x901c1c : 0x3c3f45;
  const calScale = isStreet || isClassic || isHeavy ? 0.72 : 1.0;
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.075 * calScale, 0.12 * calScale, 0.25 * calScale), mat(calColor, 0.34, 0.55));
  cal.position.set(-outer * 0.06, 0.09, front ? 0.11 : -0.11);
  cal.rotation.x = front ? 0.25 : -0.25;
  steer.add(cal);
  const calTop = new THREE.Mesh(new THREE.BoxGeometry(0.082 * calScale, 0.028 * calScale, 0.21 * calScale), mat(calTopColor, 0.4, 0.6));
  calTop.position.set(-outer * 0.06, 0.15 * calScale + 0.02, front ? 0.11 : -0.11);
  steer.add(calTop);
  return { root, steer, spin, discMat };
}

export function makeSovereign(): CarRig {
  const g = new THREE.Group();
  const paint = mat(0xb9531a, 0.34, 0.42, { clearcoat: 0.52, clearcoatRoughness: 0.16, ior: 1.46, specularIntensity: 0.50, envMapIntensity: 0.78 });
  const carbon = mat(0x15171a, 0.40, 0.28, { clearcoat: 0.45, clearcoatRoughness: 0.18, envMapIntensity: 0.85 });
  const glass = mat(0x0b121a, 0.06, 0.08, { clearcoat: 0.65, clearcoatRoughness: 0.06, envMapIntensity: 1.15 });
  const black = mat(0x0d0e10, 0.7, 0.1);

  // ---- body tub ----
  // roofline from the turntable side silhouette (car/sovereign/fit_profile.py), smoothed and sampled at 0.01 m
  const fp = (fit.profile as { z: number; top: number }[]).slice().sort((p1, p2) => p1.z - p2.z);
  const fitTopRaw = (z: number): number => {
    if (z <= fp[0].z) return fp[0].top;
    for (let i = 0; i < fp.length - 1; i++) if (z <= fp[i + 1].z) { const t = (z - fp[i].z) / (fp[i + 1].z - fp[i].z || 1); return fp[i].top + (fp[i + 1].top - fp[i].top) * t; }
    return fp[fp.length - 1].top;
  };
  // the reference silhouette is about 9% lower against its length than a 1.37 m height gives; follow the reference
  const HK = 0.92;
  const fitTop = (z: number): number => { let a = 0; for (let k = -3; k <= 3; k++) a += fitTopRaw(z + k * 0.03); return HK * a / 7; };
  const BELT = 0.92;
  const topC = (z: number): number => Math.min(fitTop(z), BELT);
  const hwC = curve([[-2.43, 0.76], [-2.38, 0.90], [-2.2, 0.99], [-1.6, 1.00], [-1.0, 1.00], [0.2, 0.985], [1.2, 0.97], [1.9, 0.95], [2.25, 0.88], [2.43, 0.74]]);
  const WZ = [1.53, -1.25];
  const botC = (z: number) => {
    let b = 0.20 + (z > 2.2 ? (z - 2.2) * 0.9 : 0) + (z < -2.2 ? (-2.2 - z) * 1.4 : 0);
    for (const zc of WZ) {
      const dz = Math.abs(z - zc), R = 0.46;
      if (dz < R) b = Math.max(b, 0.35 + Math.sqrt(R * R - dz * dz) * 0.98);
    }
    return b;
  };
  const sts: Station[] = [];
  for (let z = -2.43; z <= 2.4301; z += 0.03) sts.push({ z, hw: hwC(z), yTop: topC(z), yBot: Math.min(botC(z), topC(z) - 0.2), n: 3.2 });
  g.add(new THREE.Mesh(loft(sts, 64), paint));

  // ---- cabin ----
  const roofC = (z: number): number => fitTop(z);
  const cwC = curve([[-1.55, 0.84], [-1.2, 0.80], [-0.5, 0.78], [0.1, 0.77], [0.62, 0.80]]);
  let CAB0 = 0, CAB1 = 0;
  for (let z = -2.3; z <= 2.3; z += 0.01) if (fitTop(z) > BELT + 0.04) { if (!CAB0) CAB0 = z; CAB1 = z; }
  const cab: Station[] = [];
  for (let z = CAB0; z <= CAB1; z += 0.03) cab.push({ z, hw: cwC(z), yTop: Math.max(roofC(z), BELT + 0.02), yBot: BELT - 0.04, n: 2.35 });
  g.add(new THREE.Mesh(loft(cab, 40, 0, Math.PI, true), paint));
  // glass: side windows, windshield and backlight as slightly proud skins on the cabin surface
  const sideGlass = new THREE.BufferGeometry();
  {
    const pos: number[] = [], idx: number[] = [];
    for (const sgn of [1, -1]) {
      const base = pos.length / 3;
      const zs: number[] = [];
      for (let z = CAB0 + 0.28; z <= CAB1 - 0.2; z += 0.03) zs.push(z);
      zs.forEach((z) => {
        const s = cab[Math.min(cab.length - 1, Math.max(0, Math.round((z - CAB0) / 0.03)))];
        for (const a of [0.08, 0.62]) {
          const [x, y] = ring(a, s.hw, (s.yTop + BELT - 0.04) / 2, (s.yTop - BELT + 0.04) / 2, 2.35);
          pos.push(sgn * (x + 0.004), y, z);
        }
      });
      for (let i = 0; i < zs.length - 1; i++) {
        const a = base + i * 2;
        if (sgn > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    sideGlass.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sideGlass.setIndex(idx);
    sideGlass.computeVertexNormals();
  }
  g.add(new THREE.Mesh(sideGlass, new THREE.MeshPhysicalMaterial({ color: 0x0b121a, roughness: 0.04, metalness: 0.2, clearcoat: 1, side: THREE.DoubleSide })));
  const quad = (a: number[][], m: THREE.Material): THREE.Mesh => {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(a.flat(), 3));
    gg.setIndex([0, 1, 2, 0, 2, 3]);
    gg.computeVertexNormals();
    return new THREE.Mesh(gg, m);
  };
  const gm = new THREE.MeshPhysicalMaterial({ color: 0x0b121a, roughness: 0.04, metalness: 0.2, clearcoat: 1, side: THREE.DoubleSide });
  g.add(quad([[-0.66, 1.07, 0.56], [0.66, 1.07, 0.56], [0.52, 1.28, 0.2], [-0.52, 1.28, 0.2]], gm));          // windshield
  g.add(quad([[0.56, 1.10, -1.5], [-0.56, 1.10, -1.5], [-0.50, 1.18, -1.22], [0.50, 1.18, -1.22]], gm));      // backlight
  // interior seen through the glass
  box(g, 1.3, 0.05, 0.5, 0x101114, 0, 1.0, 0.42);                    // dash
  for (const sx of [-0.33, 0.33]) { box(g, 0.45, 0.5, 0.22, 0x141518, sx, 0.88, -0.35); box(g, 0.45, 0.1, 0.55, 0x141518, sx, 0.66, -0.15); }
  box(g, 0.32, 0.04, 0.32, 0x0e0f11, 0.36, 1.0, 0.3);               // steering wheel

  // ---- aero and trim ----
  box(g, 1.78, 0.045, 0.34, 0x15171a, 0, 0.18, 2.42, carbon);        // front splitter
  box(g, 0.30, 0.06, 0.16, 0x15171a, 0.88, 0.2, 2.28, carbon);       // canards
  box(g, 0.30, 0.06, 0.16, 0x15171a, -0.88, 0.2, 2.28, carbon);
  box(g, 0.04, 0.09, 2.5, 0x15171a, 0.985, 0.2, 0.0, carbon);        // side skirts
  box(g, 0.04, 0.09, 2.5, 0x15171a, -0.985, 0.2, 0.0, carbon);
  box(g, 1.6, 0.1, 0.5, 0x15171a, 0, 0.3, -2.4, carbon);             // diffuser
  for (let i = -3; i <= 3; i++) box(g, 0.012, 0.12, 0.5, 0x0a0b0c, i * 0.22, 0.3, -2.42, carbon);
  box(g, 1.7, 0.035, 0.3, 0x15171a, 0, 1.115, -2.22, carbon);        // wing lip
  // grille and lower intakes
  box(g, 0.78, 0.2, 0.05, 0x0a0b0c, 0, 0.60, 2.40, black);
  for (let i = 0; i < 4; i++) box(g, 0.76, 0.012, 0.06, 0x2a2c30, 0, 0.53 + i * 0.045, 2.405, carbon);
  box(g, 0.32, 0.075, 0.05, 0xc79a3a, 0, 0.64, 2.43, mat(0xc79a3a, 0.3, 0.9));
  for (const sx of [-0.55, 0.55]) box(g, 0.4, 0.17, 0.05, 0x0a0b0c, sx, 0.38, 2.38, black);
  // hood vents and side vents
  for (const sx of [-0.22, 0.22]) box(g, 0.2, 0.012, 0.4, 0x0a0b0c, sx, 0.985, 1.25, black);
  for (const sx of [-1, 1]) { box(g, 0.012, 0.22, 0.34, 0x0a0b0c, sx * 0.975, 0.62, 0.92, black); box(g, 0.012, 0.16, 0.36, 0x0a0b0c, sx * 1.0, 0.7, -0.98, black); }
  // lights (emissive)
  const head = new THREE.MeshBasicMaterial({ color: 0xf4fbff });
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-1, 1]) {
    const h = box(g, 0.44, 0.03, 0.05, 0xf4fbff, sx * 0.56, 0.74, 2.2, head);
    h.rotation.y = sx * -0.22;
    box(g, 0.36, 0.03, 0.05, 0xf4fbff, sx * 0.6, 0.69, 2.18, head).rotation.y = sx * -0.22;
  }
  box(g, 1.62, 0.06, 0.05, 0xff2a2a, 0, 0.98, -2.41, tail);          // full-width tail band
  for (const sx of [-1, 1]) box(g, 0.34, 0.12, 0.05, 0xff2a2a, sx * 0.62, 0.96, -2.40, tail);
  // exhaust: four tips
  const chrome = mat(0xc9ccd2, 0.15, 1);
  for (const sx of [-0.62, -0.38, 0.38, 0.62]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 18, 1, true), chrome);
    t.rotation.x = Math.PI / 2;
    t.position.set(sx, 0.27, -2.45);
    g.add(t);
  }
  // mirrors
  for (const sx of [-1, 1]) { box(g, 0.1, 0.07, 0.17, 0xb9531a, sx * 0.93, 1.1, 0.4, paint); box(g, 0.04, 0.04, 0.08, 0x15171a, sx * 0.86, 1.07, 0.42, carbon); }
  // underbody and a soft shadow blob
  box(g, 1.7, 0.02, 4.6, 0x08090a, 0, 0.17, 0, black);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const cx = c.getContext('2d')!;
  const gr = cx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  g.add(blob);

  // ---- wheels ----
  const W: { root: THREE.Group; steer: THREE.Group; spin: THREE.Group; discMat: THREE.MeshPhysicalMaterial; front: boolean; left: boolean }[] = [];
  for (const [front, left, x, z] of [[true, true, 0.81, 1.43], [true, false, -0.81, 1.43], [false, true, 0.83, -1.35], [false, false, -0.83, -1.35]] as [boolean, boolean, number, number][]) {
    const w = wheel(front, left);
    w.root.position.set(x, front ? 0.352 : 0.358, z);
    g.add(w.root);
    W.push({ ...w, front, left });
  }
  let spinAng = 0;
  let rotorHeat = 0;
  return {
    group: g,
    update(speed: number, steer: number, dt: number, _lights?: boolean, brake = 0) {
      spinAng += (speed / 0.355) * dt;
      const heatTarget = brake > 0.15 && Math.abs(speed) > 8 ? Math.min(1, brake * Math.min(1, Math.abs(speed) / 42)) : 0;
      rotorHeat += (heatTarget - rotorHeat) * Math.min(1, dt * (heatTarget > rotorHeat ? 2.4 : 0.65));
      const glow = Math.max(0, (rotorHeat - 0.18) / 0.82) * 3.4;
      for (const w of W) {
        w.spin.rotation.x = w.left ? -spinAng : spinAng;
        w.steer.rotation.y = w.front ? steer : 0;
        w.discMat.emissiveIntensity = w.front ? glow : glow * 0.72;
      }
    },
  };
}

function box(g: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, m?: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m ?? new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 }));
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}


