/**
 * carCadBuilder.ts — Combines Argilla Hard-Surface SDF sculpting (hardSurface.ts + surfaceNets.ts)
 * with CAD precision sub-assemblies (model.ts) to build multi-part automotive .glb models.
 */

import { extractHardSurface, type HardPart } from '../argilla/hardSurface';
import { emptyModel, type CadMesh, type CadModel } from './model';

export interface CarWingSpec {
  z: number;
  y: number;
  halfW: number;
  chord: number;
  thickness?: number;
  endplateH?: number;
  pylonStyle?: 'swan' | 'upright' | 'rally';
  color?: string;
}

export interface CarLightSpec {
  x: number;
  y: number;
  z: number;
  halfW: number;
  halfH: number;
  halfD?: number;
  color?: string;
  mirror?: boolean;
}

export interface CarCadBlueprint {
  id: string;
  name: string;
  paintHex: string;
  accentHex: string;
  caliperHex?: string;
  rimHex?: string;
  rimStyle?: 'multi' | 'six' | 'steelie' | 'beadlock';
  tireWidth?: number;
  length: number;
  width: number;
  wheelbase: number;
  trackWidth: number;
  wheelRadius: number;
  frontWheelZ?: number;
  rearWheelZ?: number;
  bodyParts: HardPart[];
  canopyParts: HardPart[];
  carbonParts: HardPart[];
  accentParts?: HardPart[];
  chromeParts?: HardPart[];
  wing?: CarWingSpec;
  headlights?: CarLightSpec[];
  taillights?: CarLightSpec[];
  exhausts?: { x: number; y: number; z: number; r: number; mirror?: boolean }[];
}

function makeMesh(
  id: string,
  name: string,
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  color: string,
  opacity = 1
): CadMesh {
  return {
    id,
    name,
    elementId: id,
    layer: 'body',
    positions,
    normals,
    indices,
    color,
    opacity,
  };
}

class MeshAcc {
  pos: number[] = [];
  nrm: number[] = [];
  idx: number[] = [];

  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rx = 0): void {
    const base = this.pos.length / 3;
    const c = Math.cos(rx), s = Math.sin(rx);
    const faces: [number[], number[][]][] = [
      [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
      [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
      [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
      [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
      [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
      [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
    ];
    let vOff = base;
    for (const [n, verts] of faces) {
      const ny = n[1] * c - n[2] * s;
      const nz = n[1] * s + n[2] * c;
      for (const [vx, vy, vz] of verts) {
        const ry = vy * c - vz * s;
        const rz = vy * s + vz * c;
        this.pos.push(cx + vx, cy + ry, cz + rz);
        this.nrm.push(n[0], ny, nz);
      }
      this.idx.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3);
      vOff += 4;
    }
  }

  addCylX(cx: number, cy: number, cz: number, r: number, halfW: number, segs = 28, withCaps = true): void {
    const startSide = this.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ny = Math.cos(a), nz = Math.sin(a);
      this.pos.push(cx - halfW, cy + r * ny, cz + r * nz);
      this.nrm.push(0, ny, nz);
      this.pos.push(cx + halfW, cy + r * ny, cz + r * nz);
      this.nrm.push(0, ny, nz);
    }
    for (let i = 0; i < segs; i++) {
      const p = startSide + i * 2;
      // Outward winding around +X axis: (+X) x (dTheta) = inward, so reverse to face outward
      this.idx.push(p, p + 3, p + 2, p, p + 1, p + 3);
    }
    if (!withCaps) return;
    // End caps
    for (const sign of [-1, 1]) {
      const x = cx + sign * halfW;
      const centerIdx = this.pos.length / 3;
      this.pos.push(x, cy, cz);
      this.nrm.push(sign, 0, 0);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.pos.push(x, cy + r * Math.cos(a), cz + r * Math.sin(a));
        this.nrm.push(sign, 0, 0);
      }
      for (let i = 0; i < segs; i++) {
        if (sign > 0) this.idx.push(centerIdx, centerIdx + 2 + i, centerIdx + 1 + i);
        else this.idx.push(centerIdx, centerIdx + 1 + i, centerIdx + 2 + i);
      }
    }
  }

  addRingX(cx: number, cy: number, cz: number, rInner: number, rOuter: number, sign: number, segs = 32): void {
    const base = this.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ny = Math.cos(a), nz = Math.sin(a);
      this.pos.push(cx, cy + rInner * ny, cz + rInner * nz);
      this.nrm.push(sign, 0, 0);
      this.pos.push(cx, cy + rOuter * ny, cz + rOuter * nz);
      this.nrm.push(sign, 0, 0);
    }
    for (let i = 0; i < segs; i++) {
      const p = base + i * 2;
      if (sign > 0) this.idx.push(p, p + 3, p + 1, p, p + 2, p + 3);
      else this.idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
    }
  }

  addTube(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, segs = 12): void {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // Pick arbitrary perpendicular basis (v, w)
    const refX = Math.abs(ux) < 0.8 ? 1 : 0;
    const refY = Math.abs(ux) < 0.8 ? 0 : 1;
    let vx = uy * 0 - uz * refY;
    let vy = uz * refX - ux * 0;
    let vz = ux * refY - uy * refX;
    const vLen = Math.hypot(vx, vy, vz) || 1;
    vx /= vLen; vy /= vLen; vz /= vLen;
    const wx = uy * vz - uz * vy;
    const wy = uz * vx - ux * vz;
    const wz = ux * vy - uy * vx;

    const base = this.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = vx * ca + wx * sa;
      const ny = vy * ca + wy * sa;
      const nz = vz * ca + wz * sa;
      this.pos.push(ax + r * nx, ay + r * ny, az + r * nz);
      this.nrm.push(nx, ny, nz);
      this.pos.push(bx + r * nx, by + r * ny, bz + r * nz);
      this.nrm.push(nx, ny, nz);
    }
    for (let i = 0; i < segs; i++) {
      const p = base + i * 2;
      this.idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
    }
  }

  addCylZ(cx: number, cy: number, cz: number, r: number, halfL: number, segs = 20): void {
    const startSide = this.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const nx = Math.cos(a), ny = Math.sin(a);
      this.pos.push(cx + r * nx, cy + r * ny, cz - halfL);
      this.nrm.push(nx, ny, 0);
      this.pos.push(cx + r * nx, cy + r * ny, cz + halfL);
      this.nrm.push(nx, ny, 0);
    }
    for (let i = 0; i < segs; i++) {
      const p = startSide + i * 2;
      this.idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
    }
  }

  toMesh(id: string, name: string, color: string, opacity = 1): CadMesh {
    return makeMesh(id, name, new Float32Array(this.pos), new Float32Array(this.nrm), new Uint32Array(this.idx), color, opacity);
  }
}

function appendWheels(bp: CarCadBlueprint, model: CadModel): void {
  const tireAcc = new MeshAcc();
  const rimAcc = new MeshAcc();
  const rotorAcc = new MeshAcc();
  const caliperAcc = new MeshAcc();

  const halfT = bp.trackWidth * 0.5;
  const zF = bp.frontWheelZ ?? bp.wheelbase * 0.5;
  const zR = bp.rearWheelZ ?? -bp.wheelbase * 0.5;
  const r = bp.wheelRadius;
  const halfW = (bp.tireWidth ?? 0.27) * 0.5;
  const rimR = r * (bp.rimStyle === 'beadlock' ? 0.58 : bp.rimStyle === 'steelie' ? 0.62 : 0.72);
  const spokeCount = bp.rimStyle === 'six' ? 6 : bp.rimStyle === 'steelie' ? 5 : bp.rimStyle === 'beadlock' ? 8 : 10;

  const corners: [number, number][] = [
    [-halfT, zF],
    [halfT, zF],
    [-halfT, zR],
    [halfT, zR],
  ];

  for (const [wx, wz] of corners) {
    const outSign = wx >= 0 ? 1 : -1;
    // Hollow tire tread + outer/inner sidewall rings (open center so rotor/caliper/spokes show cleanly!)
    tireAcc.addCylX(wx, r, wz, r, halfW, 32, false);
    tireAcc.addRingX(wx + outSign * halfW, r, wz, rimR * 0.96, r, outSign, 32);
    tireAcc.addRingX(wx - outSign * halfW, r, wz, rimR * 0.96, r, -outSign, 32);
    // Recessed inner rim barrel (leaves outer face open to show rotor, caliper & spokes!)
    rimAcc.addCylX(wx - outSign * (halfW * 0.35), r, wz, rimR * 0.95, halfW * 0.45, 24);
    rimAcc.addCylX(wx + outSign * (halfW * 0.86), r, wz, rimR * 0.24, 0.024, 16);
    // Spokes (clean radial Y/multi-spoke geometry)
    const spokeX = wx + outSign * (halfW * 0.84);
    for (let s = 0; s < spokeCount; s++) {
      const a = (s / spokeCount) * Math.PI * 2;
      const sr = rimR * 0.54;
      const sy = r + Math.cos(a) * sr;
      const sz = wz + Math.sin(a) * sr;
      rimAcc.addBox(spokeX, sy, sz, 0.015, rimR * 0.40, 0.014, -a);
    }
    // Brake rotor & caliper clearly visible behind spokes
    rotorAcc.addCylX(wx + outSign * (halfW * 0.45), r, wz, rimR * 0.74, 0.022, 24);
    caliperAcc.addBox(wx + outSign * (halfW * 0.56), r + rimR * 0.36, wz - rimR * 0.42, 0.032, 0.068, 0.048, 0.4);
  }

  model.meshes.push(tireAcc.toMesh(`${bp.id}_tires`, 'TireRubber', '#0a0b0e', 1));
  model.meshes.push(rimAcc.toMesh(`${bp.id}_rims`, 'ForgedRim', bp.rimHex ?? '#525864', 1));
  model.meshes.push(rotorAcc.toMesh(`${bp.id}_rotors`, 'BrakeRotor', '#7c8492', 1));
  model.meshes.push(caliperAcc.toMesh(`${bp.id}_calipers`, 'BrakeCaliper', bp.caliperHex ?? bp.accentHex, 1));
}

function appendWingAndDetails(bp: CarCadBlueprint, model: CadModel): void {
  if (bp.wing) {
    const w = bp.wing;
    const acc = new MeshAcc();
    const th = w.thickness ?? 0.026;
    const epH = w.endplateH ?? 0.14;
    // Main airfoil blade (slight angle of attack)
    acc.addBox(0, w.y, w.z, w.halfW, th * 0.5, w.chord * 0.5, 0.14);
    // Endplates
    acc.addBox(-w.halfW, w.y - epH * 0.15, w.z, 0.014, epH * 0.55, w.chord * 0.65, 0.08);
    acc.addBox(w.halfW, w.y - epH * 0.15, w.z, 0.014, epH * 0.55, w.chord * 0.65, 0.08);
    // Pylons
    const pylonX = w.halfW * 0.42;
    const pylonH = w.pylonStyle === 'rally' ? 0.22 : 0.26;
    acc.addBox(-pylonX, w.y - pylonH * 0.5, w.z + 0.03, 0.014, pylonH * 0.5, 0.065, -0.2);
    acc.addBox(pylonX, w.y - pylonH * 0.5, w.z + 0.03, 0.014, pylonH * 0.5, 0.065, -0.2);
    model.meshes.push(acc.toMesh(`${bp.id}_wing`, 'CarbonAero', w.color ?? '#161920', 1));
  }

  if (bp.headlights?.length) {
    const acc = new MeshAcc();
    for (const h of bp.headlights) {
      acc.addBox(h.x, h.y, h.z, h.halfW, h.halfH, h.halfD ?? 0.03);
      if (h.mirror && Math.abs(h.x) > 1e-4) {
        acc.addBox(-h.x, h.y, h.z, h.halfW, h.halfH, h.halfD ?? 0.03);
      }
    }
    model.meshes.push(acc.toMesh(`${bp.id}_headlights`, 'HeadlightLED', bp.headlights[0].color ?? '#eef6ff', 1));
  }

  if (bp.taillights?.length) {
    const acc = new MeshAcc();
    for (const t of bp.taillights) {
      acc.addBox(t.x, t.y, t.z, t.halfW, t.halfH, t.halfD ?? 0.03);
      if (t.mirror && Math.abs(t.x) > 1e-4) {
        acc.addBox(-t.x, t.y, t.z, t.halfW, t.halfH, t.halfD ?? 0.03);
      }
    }
    model.meshes.push(acc.toMesh(`${bp.id}_taillights`, 'TaillightLED', bp.taillights[0].color ?? '#ff1e2d', 1));
  }

  if (bp.exhausts?.length) {
    const acc = new MeshAcc();
    for (const e of bp.exhausts) {
      acc.addCylZ(e.x, e.y, e.z, e.r, 0.07, 16);
      if (e.mirror && Math.abs(e.x) > 1e-4) {
        acc.addCylZ(-e.x, e.y, e.z, e.r, 0.07, 16);
      }
    }
    model.meshes.push(acc.toMesh(`${bp.id}_exhausts`, 'ChromeTrim', '#b8c0cc', 1));
  }
}

/**
 * Builds a complete CadModel for a car by extracting Argilla SDF surfaces for the
 * sculpted bodywork, glass canopy, carbon aero kit, and CAD wheel/wing/lighting assemblies.
 */
function extractWithTubes(
  parts: HardPart[],
  halfExt: number,
  resolution: number,
  id: string,
  name: string,
  color: string,
  model: CadModel
): void {
  const sdfParts = parts.filter((p) => p.kind !== 'tube');
  const tubeParts = parts.filter((p) => p.kind === 'tube');

  if (sdfParts.length > 0) {
    const surf = extractHardSurface(sdfParts, halfExt, resolution);
    if (surf.positions.length > 0) {
      model.meshes.push(makeMesh(id, name, surf.positions, surf.normals, surf.indices, color, 1));
    }
  }

  if (tubeParts.length > 0) {
    const acc = new MeshAcc();
    for (const t of tubeParts) {
      const r = t.round ?? 0.03;
      acc.addTube(t.center[0], t.center[1], t.center[2], t.size[0], t.size[1], t.size[2], r, 14);
      if (t.mirror && (Math.abs(t.center[0]) > 1e-4 || Math.abs(t.size[0]) > 1e-4)) {
        acc.addTube(-t.center[0], t.center[1], t.center[2], -t.size[0], t.size[1], t.size[2], r, 14);
      }
    }
    if (acc.pos.length > 0) {
      model.meshes.push(acc.toMesh(`${id}_tubes`, name, color, 1));
    }
  }
}

export function buildCarCadModel(bp: CarCadBlueprint, resolution = 124): CadModel {
  const model = emptyModel(bp.name, 'glb', 'argilla-cad');
  model.units = 'm';
  model.meta.upAxis = 'Y';

  const halfExt = Math.max(2.7, bp.length * 0.56);

  // 1. Argilla Sculpted Paint Bodywork (with boolean-carved wheel wells & intakes)
  if (bp.bodyParts.length > 0) {
    const bodySurf = extractHardSurface(bp.bodyParts, halfExt, resolution);
    if (bodySurf.positions.length > 0) {
      model.meshes.push(
        makeMesh(`${bp.id}_body`, 'Bodywork', bodySurf.positions, bodySurf.normals, bodySurf.indices, bp.paintHex, 1)
      );
    }
  }

  // 2. Argilla Glass Canopy / Greenhouse
  if (bp.canopyParts.length > 0) {
    const glassSurf = extractHardSurface(bp.canopyParts, halfExt, Math.round(resolution * 0.8));
    if (glassSurf.positions.length > 0) {
      model.meshes.push(
        makeMesh(`${bp.id}_glass`, 'CanopyGlass', glassSurf.positions, glassSurf.normals, glassSurf.indices, '#0b1320', 0.86)
      );
    }
  }

  // 3. Argilla Carbon Aero Kit + Analytical Tubes (splitter, diffuser, flares, side skirts, snorkels)
  if (bp.carbonParts.length > 0) {
    extractWithTubes(bp.carbonParts, halfExt, Math.round(resolution * 0.8), `${bp.id}_carbon`, 'CarbonAero', '#0b0d11', model);
  }

  // 4. Optional Livery / Accent Stripes
  if (bp.accentParts?.length) {
    const accSurf = extractHardSurface(bp.accentParts, halfExt, Math.round(resolution * 0.75));
    if (accSurf.positions.length > 0) {
      model.meshes.push(
        makeMesh(`${bp.id}_accent`, 'AccentLivery', accSurf.positions, accSurf.normals, accSurf.indices, bp.accentHex, 1)
      );
    }
  }

  // 5. Optional Chrome / Tubular Steel Hardware (bumpers, bull bars, roll cages)
  if (bp.chromeParts?.length) {
    extractWithTubes(bp.chromeParts, halfExt, Math.round(resolution * 0.75), `${bp.id}_chrome`, 'ChromeTrim', '#3b424e', model);
  }

  // 6. Side mirrors on non-buggy vehicles
  if (bp.id !== 'dunerunner') {
    const mirAcc = new MeshAcc();
    const mx = bp.width * 0.5 + 0.05;
    const my = bp.wheelRadius > 0.40 ? 1.38 : 0.96;
    const mz = bp.wheelbase * 0.22;
    mirAcc.addBox(mx, my, mz, 0.08, 0.045, 0.055);
    mirAcc.addBox(-mx, my, mz, 0.08, 0.045, 0.055);
    model.meshes.push(mirAcc.toMesh(`${bp.id}_mirrors`, 'CarbonAero', '#0b0d11', 1));
  }

  // 7. Precision CAD Wheels, Forged Rims, Rotors, Calipers, Wing & LEDs
  appendWheels(bp, model);
  appendWingAndDetails(bp, model);

  return model;
}

/**
 * Packs a CadModel into a standard glTF 2.0 binary (.glb) buffer with PBR metallic materials.
 */
export function packCadModelToGlb(model: CadModel): Uint8Array {
  const binChunks: Uint8Array[] = [];
  let byteOffset = 0;

  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const materials: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];

  const pad4 = (n: number) => (n + 3) & ~3;

  const pushBuf = (arr: Float32Array | Uint32Array) => {
    const raw = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const paddedLen = pad4(raw.byteLength);
    const copy = new Uint8Array(paddedLen);
    copy.set(raw);
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: raw.byteLength });
    binChunks.push(copy);
    byteOffset += paddedLen;
    return bvIdx;
  };

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16) || 0xcccccc;
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  };

  for (let i = 0; i < model.meshes.length; i++) {
    const m = model.meshes[i];
    if (m.positions.length === 0 || m.indices.length === 0) continue;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < m.positions.length; k += 3) {
      const x = m.positions[k], y = m.positions[k + 1], z = m.positions[k + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    const posBv = pushBuf(m.positions);
    const nrmBv = pushBuf(m.normals ?? new Float32Array(m.positions.length));
    const idxBv = pushBuf(m.indices);

    const posAcc = accessors.length;
    accessors.push({
      bufferView: posBv,
      componentType: 5126, // FLOAT
      count: m.positions.length / 3,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });
    const nrmAcc = accessors.length;
    accessors.push({
      bufferView: nrmBv,
      componentType: 5126,
      count: m.positions.length / 3,
      type: 'VEC3',
    });
    const idxAcc = accessors.length;
    accessors.push({
      bufferView: idxBv,
      componentType: 5125, // UNSIGNED_INT
      count: m.indices.length,
      type: 'SCALAR',
    });

    const [r, g, b] = hexToRgb(m.color ?? '#cccccc');
    const isGlass = m.name === 'CanopyGlass' || (m.opacity ?? 1) < 0.99;
    const isBody = m.name === 'Bodywork' || m.name === 'AccentLivery';
    const isChrome = m.name === 'ChromeTrim' || m.name === 'BrakeRotor' || m.name === 'ForgedRim';
    const isTire = m.name === 'TireRubber';
    const isCarbon = m.name === 'CarbonAero';
    const isEmissive = m.name === 'HeadlightLED' || m.name === 'TaillightLED';

    const matDef: Record<string, unknown> = {
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, m.opacity ?? 1],
        metallicFactor: isChrome ? 0.88 : isBody ? 0.48 : isCarbon ? 0.08 : isTire ? 0.02 : isGlass ? 0.1 : 0.25,
        roughnessFactor: isChrome ? 0.20 : isBody ? 0.22 : isCarbon ? 0.62 : isTire ? 0.90 : isGlass ? 0.06 : 0.45,
      },
      alphaMode: isGlass ? 'BLEND' : 'OPAQUE',
    };
    if (isEmissive) {
      matDef.emissiveFactor = [r * 0.95, g * 0.95, b * 0.95];
    }

    const matIdx = materials.length;
    materials.push(matDef);

    const meshIdx = meshes.length;
    meshes.push({
      name: m.name,
      primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: idxAcc, material: matIdx }],
    });
    nodes.push({ name: m.name, mesh: meshIdx });
  }

  const gltfJson = JSON.stringify({
    asset: { version: '2.0', generator: 'Plajah Argilla-CAD Automotive Modeler' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  });

  const jsonBytes = new TextEncoder().encode(gltfJson);
  const jsonPadLen = pad4(jsonBytes.byteLength);
  const jsonChunk = new Uint8Array(jsonPadLen);
  jsonChunk.fill(0x20); // space-pad JSON chunk per glTF 2.0 spec
  jsonChunk.set(jsonBytes);

  const totalLen = 12 + 8 + jsonPadLen + 8 + byteOffset;
  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer);

  // Header
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalLen, true);

  // JSON chunk
  dv.setUint32(12, jsonPadLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonChunk, 20);

  // BIN chunk
  const binHeaderOffset = 20 + jsonPadLen;
  dv.setUint32(binHeaderOffset, byteOffset, true);
  dv.setUint32(binHeaderOffset + 4, 0x004e4942, true); // 'BIN\0'
  let writePos = binHeaderOffset + 8;
  for (const chunk of binChunks) {
    out.set(chunk, writePos);
    writePos += chunk.byteLength;
  }

  return out;
}
