// Parametric 3D CAD assemblies for all 52 TONOS world string instruments.
// Dynamically switches shell/soundboard/gourd/bridge/neck/bow/wheel topology when presets
// change, reflecting Heritage Age patina, Craft Asymmetry, Jawari, Rattle, and Taraf strings.

import type { CadModel } from '../../../cad/model';
import type { TonosInstrument } from '../tonos/catalog';
import { TN } from '../tonos/params';
import {
  addSolidMesh, boxSolid, cylinderZ, extrude, finish, lathe, lerpHex, merge,
  newInstrumentCad, rodBetween, rotateX90, rotateY, rotateZ, scaleSolid, segmentedString,
  translate, tubeAlong, type InstrumentViewSpec,
} from './cadUtils';
import type { P2, Solid } from '../../../mech/geometry';

export type TonosCadFamily =
  | 'gourd-lute'
  | 'pear-lute'
  | 'board-zither'
  | 'trapezoid-dulcimer'
  | 'dan-bau'
  | 'hexagon-fiddle'
  | 'horsehead-fiddle'
  | 'spike-fiddle'
  | 'diamond-fiddle'
  | 'waisted-fiddle'
  | 'hurdy-gurdy'
  | 'triangular-lute'
  | 'shamisen'
  | 'double-bowl-tar'
  | 'skin-trough-lute'
  | 'calabash-harp'
  | 'lyre'
  | 'valiha-tube'
  | 'musical-bow';

export function resolveTonosCadFamily(inst: TonosInstrument): TonosCadFamily {
  const n = inst.name.toLowerCase();
  if (n.includes('sitar') || n.includes('tanpura') || n.includes('veena')) return 'gourd-lute';
  if (n.includes('hurdy')) return 'hurdy-gurdy';
  if (n.includes('morin')) return 'horsehead-fiddle';
  if (n.includes('erhu') || n.includes('haegeum')) return 'hexagon-fiddle';
  if (n.includes('masenqo')) return 'diamond-fiddle';
  if (n.includes('kamancheh') || n.includes('rebab') || n.includes('gusle') || n.includes('goje')) return 'spike-fiddle';
  if (n.includes('sarangi') || n.includes('esraj') || n.includes('dilruba') || n.includes('nyckel') || n.includes('hardanger')) return 'waisted-fiddle';
  if (n.includes('balalaika')) return 'triangular-lute';
  if (n.includes('shamisen')) return 'shamisen';
  if (n === 'tar') return 'double-bowl-tar';
  if (n.includes('gimbri') || n.includes('xalam') || n.includes('ekonting')) return 'skin-trough-lute';
  if (n.includes('kora') || n.includes('goni')) return 'calabash-harp';
  if (n.includes('krar') || n.includes('begena')) return 'lyre';
  if (n.includes('valiha')) return 'valiha-tube';
  if (n.includes('uhadi')) return 'musical-bow';
  if (n.includes('dan') && n.includes('b')) return 'dan-bau';
  if (n.includes('đàn')) return 'dan-bau';
  if (n.includes('yangqin') || n.includes('santoor') || n.includes('santur') || n.includes('qanun') || n.includes('cimbalom')) return 'trapezoid-dulcimer';
  if (n.includes('guzheng') || n.includes('koto') || n.includes('gayageum') || n.includes('kantele') || n.includes('inanga')) return 'board-zither';
  return 'pear-lute';
}

function domeShell(rx: number, ry: number, depth: number): Solid {
  const prof: P2[] = [];
  for (let i = 0; i <= 14; i++) {
    const th = (i / 14) * Math.PI * 0.5;
    prof.push([Math.sin(th) * rx, -Math.cos(th) * depth]);
  }
  prof.push([0, 0]);
  return scaleSolid(lathe(prof, 28), 1, ry / Math.max(1e-4, rx), 1);
}

function fullSphere(rx: number, ry: number, rz: number): Solid {
  const prof: P2[] = [];
  for (let i = 0; i <= 18; i++) {
    const th = (i / 18) * Math.PI;
    prof.push([Math.sin(th) * rx, -Math.cos(th) * rz]);
  }
  return scaleSolid(lathe(prof, 24), 1, ry / Math.max(1e-4, rx), 1);
}

export function buildTonosCadModel(
  inst: TonosInstrument,
  _instIndex: number,
  params: Record<number, number> = {},
): { model: CadModel; spec: InstrumentViewSpec } {
  const family = resolveTonosCadFamily(inst);
  const m = newInstrumentCad(`TONOS · ${inst.name}`);
  const age = params[TN.HERITAGE_AGE] ?? 0.35;
  const craft = params[TN.CRAFT_ASYMMETRY] ?? 0.28;
  const posNorm = Math.max(0.08, Math.min(0.88, params[TN.POSITION] ?? 0.45));
  const sympAmt = params[TN.SYMP] ?? (inst.sympathetic > 0 ? 0.55 : 0);

  const woodBody = lerpHex('#B46A34', '#4B220B', age);
  const soundboardWood = lerpHex('#E6BF83', '#9A632B', age);
  const darkEbony = '#1E1B18';
  const skinCol = lerpHex('#F4E4BC', '#B5844A', age);
  const boneCol = lerpHex('#F3EBDD', '#CBB589', age);
  const brassCol = lerpHex('#D4A64A', '#8E6A28', age * 0.7);
  const gourdCol = lerpHex('#C87D2E', '#6B3410', age);
  const wireCol = inst.material === 0 || inst.material === 1 ? '#E2E8F0' : inst.material === 4 ? '#FEF3C7' : '#F6D699';

  const courses = Math.max(1, Math.min(3, inst.courses));
  const skewY = (craft - 0.28) * 0.014;

  const addStringFan = (
    count: number,
    x0: number,
    x1: number,
    ySpan: number,
    zTop: number,
    radius = 0.0022,
    prefix = 'string',
  ) => {
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const y = u * ySpan * 0.5 + skewY * 0.3;
      addSolidMesh(
        m,
        `${prefix}_${i}`,
        `${prefix} ${i + 1}`,
        segmentedString([x0, y * 0.6, zTop], [x1, y, zTop + 0.004], radius, 20),
        wireCol,
      );
    }
  };

  if (family === 'gourd-lute') {
    // Sitar / Tanpura / Veena: pumpkin tumba gourd + teak tabli + curved jawari bridge + curved frets + tarafs
    const bodyBowl = domeShell(0.18, 0.17, 0.22);
    addSolidMesh(m, 'body', 'Tumba Gourd', translate(bodyBowl, -0.32, skewY, 0), gourdCol);
    const facePts: P2[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      facePts.push([0.175 * Math.cos(a), 0.165 * Math.sin(a)]);
    }
    addSolidMesh(m, 'soundboard', 'Teak Tabli', translate(extrude(facePts, [], 0, 0.012), -0.32, skewY, -0.004), soundboardWood);
    if (!inst.name.toLowerCase().includes('tanpura')) {
      addSolidMesh(m, 'upper_gourd', 'Secondary Tumba', translate(fullSphere(0.1, 0.1, 0.095), 0.36, 0, -0.11), gourdCol);
    }
    addSolidMesh(m, 'neck', 'Hollow Neck', boxSolid(0.76, 0.068, 0.032, 0.22, 0, -0.012), woodBody);
    addSolidMesh(m, 'head', 'Carved Finial', translate(fullSphere(0.055, 0.042, 0.045), 0.62, 0, 0.015), woodBody);
    // Curved Jawari bridge
    addSolidMesh(m, 'jawari', 'Jawari Bridge', boxSolid(0.032, 0.054, 0.028, -0.37, skewY, 0.008), boneCol);
    if (inst.stop === 'fret') {
      const fretSolids: Solid[] = [];
      for (let f = 0; f < 14; f++) {
        const fx = -0.1 + f * 0.048;
        fretSolids.push(boxSolid(0.006, 0.072, 0.012, fx, 0, 0.016));
      }
      addSolidMesh(m, 'frets', 'Curved Brass Pardas', merge(...fretSolids), brassCol);
    }
    const strCount = Math.max(4, Math.min(6, inst.opens.length + 3));
    addStringFan(strCount, 0.56, -0.38, 0.042, 0.036, 0.0021);
    if (inst.sympathetic > 0 || sympAmt > 0.05) {
      const nT = 11;
      for (let t = 0; t < nT; t++) {
        const fx = -0.04 + t * 0.045;
        addSolidMesh(
          m,
          `taraf_${t}`,
          `Taraf ${t + 1}`,
          segmentedString([fx, -0.028, 0.019], [-0.36, -0.022 + t * 0.004, 0.019], 0.0011, 14),
          '#FCD34D',
        );
      }
    }
  } else if (family === 'pear-lute') {
    // Oud / Pipa / Biwa / Bouzouki / Baglama / Lute / Sarod / Rubab
    const isSkin = inst.body === 'skin';
    const bowl = domeShell(0.2, 0.16, 0.16);
    addSolidMesh(m, 'body', 'Ribbed Bowl', translate(bowl, -0.22, skewY, 0), woodBody);
    const facePts: P2[] = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const pinch = a > -0.7 && a < 0.7 ? 1 + 0.18 * Math.cos(a) : 1;
      facePts.push([0.195 * Math.cos(a) * pinch, 0.156 * Math.sin(a)]);
    }
    addSolidMesh(m, 'soundboard', isSkin ? 'Skin Belly' : 'Soundboard', translate(extrude(facePts, [], -0.002, 0.01), -0.22, skewY, 0), isSkin ? skinCol : soundboardWood);
    if (!isSkin && !inst.name.toLowerCase().includes('pipa')) {
      addSolidMesh(m, 'rose', 'Soundhole Rose', cylinderZ(0.042, 0.042, 0.009, 0.012, 20), '#151210');
      addSolidMesh(m, 'rose_loc', 'Soundhole Rim', translate(cylinderZ(0.048, 0.048, 0.0085, 0.011, 20), -0.2, skewY, 0), darkEbony);
    }
    addSolidMesh(m, 'neck', 'Neck', boxSolid(0.46, 0.046, 0.024, 0.17, 0, -0.008), woodBody);
    addSolidMesh(m, 'fingerboard', 'Fingerboard', boxSolid(0.44, 0.044, 0.008, 0.14, 0, 0.012), inst.name.toLowerCase().includes('sarod') ? '#CBD5E1' : darkEbony);
    const bentPeg = rotateY(boxSolid(0.14, 0.042, 0.02, 0, 0, 0), inst.name.toLowerCase().includes('oud') || inst.name === 'Lute' ? 0.52 : 0.12);
    addSolidMesh(m, 'pegbox', 'Pegbox', translate(bentPeg, 0.45, 0, -0.004), darkEbony);
    addSolidMesh(m, 'bridge', 'Bridge', boxSolid(0.02, 0.1, 0.014, -0.33, skewY, 0.01), boneCol);
    addStringFan(Math.min(6, Math.max(3, courses * Math.max(2, inst.opens.length))), 0.39, -0.34, 0.046, 0.022, 0.002);
  } else if (family === 'board-zither' || family === 'trapezoid-dulcimer' || family === 'dan-bau') {
    const trap = family === 'trapezoid-dulcimer';
    const bau = family === 'dan-bau';
    const w0 = bau ? 0.08 : trap ? 0.18 : 0.135;
    const w1 = bau ? 0.075 : trap ? 0.32 : 0.155;
    const L = bau ? 0.96 : trap ? 0.68 : 0.92;
    const outline: P2[] = [[-L * 0.5, -w0], [L * 0.5, -w1], [L * 0.5, w1], [-L * 0.5, w0]];
    addSolidMesh(m, 'body', 'Hollow Box', extrude(outline, [], -0.055, 0.015), woodBody);
    addSolidMesh(m, 'soundboard', 'Paulownia Top', extrude(outline.map(([x, y]) => [x * 0.96, y * 0.94] as P2), [], 0.012, 0.024), soundboardWood);
    if (bau) {
      // Dan bau flexible buffalo-horn tension rod + gourd shell
      const rodPts: Array<[number, number, number]> = [
        [0.42, 0, 0.02], [0.43, 0, 0.12], [0.41, 0, 0.22], [0.36, 0, 0.29],
      ];
      addSolidMesh(m, 'bau_rod', 'Pitch Bend Lever', tubeAlong(rodPts, [0.009, 0.007, 0.005, 0.004], 10), '#1E1B18');
      addSolidMesh(m, 'bau_gourd', 'Neck Gourd Bell', translate(fullSphere(0.055, 0.055, 0.045), 0.41, 0, 0.09), gourdCol);
      addSolidMesh(m, 'string_0', 'Monochord String', segmentedString([0.36, 0, 0.285], [-0.43, 0, 0.036], 0.0024, 24), '#E2E8F0');
    } else if (trap) {
      // Twin chesspiece bridge rails + courses + beaters/hammers
      addSolidMesh(m, 'bridge_l', 'Treble Bridge Rail', boxSolid(0.016, 0.34, 0.022, -0.05, 0, 0.024), darkEbony);
      addSolidMesh(m, 'bridge_r', 'Bass Bridge Rail', boxSolid(0.016, 0.42, 0.022, 0.12, 0, 0.024), darkEbony);
      addStringFan(8, -0.29, 0.29, 0.42, 0.048, 0.0018);
      if (inst.excite === 'hammer') {
        addSolidMesh(m, 'hammer_0', 'Left Hammer', rodBetween([-0.08, -0.26, 0.11], [-0.08, -0.04, 0.068], 0.004, 0.008), boneCol);
        addSolidMesh(m, 'hammer_1', 'Right Hammer', rodBetween([0.08, -0.26, 0.11], [0.08, 0.05, 0.068], 0.004, 0.008), boneCol);
      }
    } else {
      // Guzheng / Koto: movable staggered ji bridges
      const nBridges = 8;
      const brSolids: Solid[] = [];
      for (let b = 0; b < nBridges; b++) {
        const bx = -0.18 + b * 0.048 + Math.sin(b * 0.7) * 0.02;
        const by = -0.105 + (0.21 * b) / (nBridges - 1);
        brSolids.push(boxSolid(0.012, 0.018, 0.024, bx, by, 0.024));
      }
      addSolidMesh(m, 'bridges', 'Movable Bridges', merge(...brSolids), boneCol);
      addStringFan(nBridges, -0.41, 0.41, 0.21, 0.049, 0.002);
    }
  } else if (family === 'hurdy-gurdy') {
    const bodyPts: P2[] = [];
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const wMod = 1 - 0.22 * Math.pow(Math.sin(a), 2);
      bodyPts.push([0.23 * Math.cos(a), 0.15 * Math.sin(a) * wMod]);
    }
    addSolidMesh(m, 'body', 'Lute Body', translate(extrude(bodyPts, [], -0.06, 0.04), -0.06, skewY, 0), woodBody);
    addSolidMesh(m, 'keybox', 'Tangent Keybox', boxSolid(0.32, 0.08, 0.05, 0.02, 0, 0.04), soundboardWood);
    const wheelDisc = rotateX90(cylinderZ(0.072, 0.072, -0.009, 0.009, 28));
    addSolidMesh(m, 'wheel', 'Rosined Crank Wheel', translate(wheelDisc, -0.19, 0, 0.052), '#F5E7C4');
    addSolidMesh(m, 'crank', 'Crank Handle', rodBetween([-0.31, 0, 0.052], [-0.36, -0.07, 0.08], 0.008), brassCol);
    addSolidMesh(m, 'rattle', 'Chien Trompette Bridge', boxSolid(0.014, 0.028, 0.016, -0.26, -0.042, 0.042), '#E2E8F0');
    addStringFan(4, 0.28, -0.26, 0.05, 0.095, 0.0022);
  } else if (family === 'calabash-harp' || family === 'lyre') {
    if (family === 'calabash-harp') {
      // Kora / Kamale n'goni
      addSolidMesh(m, 'body', 'Calabash Gourd', translate(domeShell(0.22, 0.21, 0.24), -0.16, 0, 0), gourdCol);
      const hid = extrude(
        Array.from({ length: 28 }, (_, k) => {
          const a = (k / 28) * Math.PI * 2;
          return [0.215 * Math.cos(a), 0.205 * Math.sin(a)] as P2;
        }),
        [],
        0,
        0.008,
      );
      addSolidMesh(m, 'soundboard', 'Cowhide Table', translate(hid, -0.16, 0, 0), skinCol);
      addSolidMesh(m, 'neck', 'Rosewood Neck Pole', rotateY(cylinderZ(0.018, 0.014, -0.25, 0.65, 16), Math.PI * 0.5), woodBody);
      addSolidMesh(m, 'bridge', 'Vertical Harp Bridge', boxSolid(0.014, 0.04, 0.14, -0.18, 0, 0.008), boneCol);
      addSolidMesh(m, 'rattle', 'Sesse Jingle Plate', boxSolid(0.06, 0.045, 0.004, -0.18, 0, 0.155), '#CBD5E1');
      for (let i = 0; i < 8; i++) {
        const side = i % 2 === 0 ? -0.018 : 0.018;
        const zNut = 0.04 + (i / 7) * 0.095;
        const xNut = 0.18 + (i / 7) * 0.38;
        addSolidMesh(m, `string_${i}`, `Harp String ${i + 1}`, segmentedString([xNut, side * 0.4, 0.02], [-0.18, side, zNut], 0.0017, 16), wireCol);
      }
    } else {
      // Krar / Begena lyre
      addSolidMesh(m, 'body', 'Skin Resonator Bowl', translate(domeShell(0.16, 0.15, 0.12), -0.22, 0, 0), woodBody);
      addSolidMesh(m, 'soundboard', 'Hide Membrane', translate(cylinderZ(0.155, 0.155, -0.002, 0.008, 24), -0.22, 0, 0), skinCol);
      addSolidMesh(m, 'arm_l', 'Left Yoke', rodBetween([-0.22, -0.09, 0.004], [0.36, -0.18, 0.02], 0.013), woodBody);
      addSolidMesh(m, 'arm_r', 'Right Yoke', rodBetween([-0.22, 0.09, 0.004], [0.36, 0.18, 0.02], 0.013), woodBody);
      addSolidMesh(m, 'crossbar', 'Yoke Crossbar', rodBetween([0.36, -0.22, 0.02], [0.36, 0.22, 0.02], 0.014), woodBody);
      addStringFan(6, 0.35, -0.28, 0.16, 0.024, 0.002);
    }
  } else if (family === 'valiha-tube' || family === 'musical-bow') {
    if (family === 'valiha-tube') {
      addSolidMesh(m, 'body', 'Bamboo Tube', rotateY(cylinderZ(0.068, 0.064, -0.38, 0.38, 24), Math.PI * 0.5), soundboardWood);
      addSolidMesh(m, 'node1', 'Bamboo Node L', translate(rotateY(cylinderZ(0.072, 0.072, -0.008, 0.008, 24), Math.PI * 0.5), -0.22, 0, 0), woodBody);
      addSolidMesh(m, 'node2', 'Bamboo Node R', translate(rotateY(cylinderZ(0.072, 0.072, -0.008, 0.008, 24), Math.PI * 0.5), 0.22, 0, 0), woodBody);
      for (let i = 0; i < 8; i++) {
        const th = (i / 8) * Math.PI * 2;
        const y = 0.076 * Math.cos(th), z = 0.076 * Math.sin(th);
        addSolidMesh(m, `string_${i}`, `Split-Cane String ${i + 1}`, segmentedString([-0.34, y, z], [0.34, y, z], 0.0017, 16), wireCol);
      }
    } else {
      // Uhadi musical bow + calabash chest resonator
      const bowPts: Array<[number, number, number]> = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        const th = (u - 0.5) * Math.PI * 0.72;
        bowPts.push([0.48 * Math.sin(th), 0, -0.14 + 0.22 * Math.cos(th)]);
      }
      addSolidMesh(m, 'body', 'Curved Bow Stave', tubeAlong(bowPts, 0.011, 10), woodBody);
      addSolidMesh(m, 'gourd', 'Calabash Resonator', translate(domeShell(0.11, 0.11, 0.14), -0.08, 0, 0.05), gourdCol);
      addSolidMesh(m, 'string_0', 'Steel Wire', segmentedString(bowPts[0]!, bowPts[bowPts.length - 1]!, 0.0022, 24), wireCol);
      addSolidMesh(m, 'hammer_0', 'Striking Reed', rodBetween([0.08, -0.24, 0.08], [0.06, 0.02, -0.02], 0.004), boneCol);
    }
  } else {
    // Bowed fiddles (hexagon/horsehead/spike/diamond/waisted) & shamisen / triangular-balalaika / double-bowl-tar / skin-trough-lute
    const fPts: P2[] = [];
    if (family === 'hexagon-fiddle') {
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; fPts.push([0.085 * Math.cos(a), 0.085 * Math.sin(a)]); }
      addSolidMesh(m, 'body', 'Hexagonal Redwood Soundbox', translate(extrude(fPts, [], -0.06, 0.06), -0.24, 0, 0), woodBody);
      addSolidMesh(m, 'soundboard', 'Python Skin Membrane', translate(extrude(fPts.map(([x, y]) => [x * 0.92, y * 0.92] as P2), [], 0.058, 0.063), -0.24, 0, 0), skinCol);
    } else if (family === 'diamond-fiddle') {
      fPts.push([0.14, 0], [0, 0.14], [-0.14, 0], [0, -0.14]);
      addSolidMesh(m, 'body', 'Diamond Skin Box', translate(extrude(fPts, [], -0.04, 0.01), -0.2, 0, 0), skinCol);
    } else if (family === 'triangular-lute') {
      fPts.push([0.16, 0], [-0.18, 0.19], [-0.18, -0.19]);
      addSolidMesh(m, 'body', 'Triangular Back', translate(extrude(fPts, [], -0.08, 0.01), -0.18, 0, 0), woodBody);
      addSolidMesh(m, 'soundboard', 'Spruce Top', translate(extrude(fPts, [], 0.008, 0.015), -0.18, 0, 0), soundboardWood);
    } else if (family === 'shamisen' || family === 'skin-trough-lute') {
      const rx = 0.13, ry = family === 'shamisen' ? 0.125 : 0.105;
      fPts.push([-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]);
      addSolidMesh(m, 'body', 'Dou Hardwood Box', translate(extrude(fPts, [], -0.06, 0.01), -0.22, 0, 0), woodBody);
      addSolidMesh(m, 'soundboard', 'Membrane Top', translate(extrude(fPts, [], 0.008, 0.014), -0.22, 0, 0), skinCol);
    } else if (family === 'double-bowl-tar') {
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const pinch = 0.55 + 0.45 * Math.cos(a * 2);
        fPts.push([0.19 * Math.cos(a), 0.12 * Math.sin(a) * pinch]);
      }
      addSolidMesh(m, 'body', 'Double-Bowl Mulberry Shell', translate(extrude(fPts, [], -0.075, 0.008), -0.22, 0, 0), woodBody);
      addSolidMesh(m, 'soundboard', 'Lambskin Belly', translate(extrude(fPts, [], 0.006, 0.012), -0.22, 0, 0), skinCol);
    } else if (family === 'horsehead-fiddle') {
      fPts.push([-0.14, -0.11], [0.14, -0.085], [0.14, 0.085], [-0.14, 0.11]);
      addSolidMesh(m, 'body', 'Trapezoid Soundbox', translate(extrude(fPts, [], -0.055, 0.015), -0.22, 0, 0), soundboardWood);
      // Carved Mongolian Horsehead scroll!
      const horsePts: Array<[number, number, number]> = [
        [0.44, 0, 0.01], [0.49, 0, 0.035], [0.52, 0, 0.075], [0.57, 0, 0.055],
      ];
      addSolidMesh(m, 'horsehead', 'Horsehead Scroll', tubeAlong(horsePts, [0.016, 0.018, 0.014, 0.009], 10), woodBody);
    } else if (family === 'spike-fiddle') {
      addSolidMesh(m, 'body', 'Turned Resonator Bowl', translate(domeShell(0.11, 0.11, 0.13), -0.22, 0, 0.004), gourdCol);
      addSolidMesh(m, 'soundboard', 'Membrane Top', translate(cylinderZ(0.105, 0.105, 0, 0.008, 22), -0.22, 0, 0), skinCol);
      addSolidMesh(m, 'endpin', 'Spike Foot', rodBetween([-0.33, 0, -0.02], [-0.52, 0, -0.02], 0.005), '#94A3B8');
    } else {
      // Waisted fiddle (Sarangi / Esraj / Nyckelharpa / Hardanger)
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const waist = 1 - 0.34 * Math.exp(-Math.pow(Math.cos(a) * 2.4, 2));
        fPts.push([0.19 * Math.cos(a), 0.125 * Math.sin(a) * waist]);
      }
      addSolidMesh(m, 'body', 'Waisted Resonator Box', translate(extrude(fPts, [], -0.05, 0.012), -0.2, 0, 0), woodBody);
      addSolidMesh(m, 'soundboard', inst.body === 'skin' ? 'Goat-Skin Belly' : 'Carved Spruce Top', translate(extrude(fPts, [], 0.01, 0.018), -0.2, 0, 0), inst.body === 'skin' ? skinCol : soundboardWood);
    }

    addSolidMesh(m, 'neck', 'Neck', boxSolid(0.46, 0.032, 0.022, 0.17, 0, -0.005), woodBody);
    addSolidMesh(m, 'bridge', 'Bridge', boxSolid(0.012, 0.055, 0.024, -0.27, skewY, 0.012), boneCol);
    if (inst.rattle === 'sersal') {
      addSolidMesh(m, 'rattle', 'Sersal Rattle Plate', boxSolid(0.05, 0.038, 0.004, 0.41, 0, 0.022), '#CBD5E1');
    }
    const nStr = Math.max(2, Math.min(5, inst.opens.length * courses));
    addStringFan(nStr, 0.38, -0.31, 0.034, 0.032, 0.002);

    if (inst.excite === 'bow') {
      const bowY = -0.24;
      const bowX = -0.27 + posNorm * 0.18;
      const stickPts: Array<[number, number, number]> = [
        [bowX, bowY, 0.072],
        [bowX + 0.015, 0, 0.058],
        [bowX, -bowY, 0.072],
      ];
      addSolidMesh(m, 'bow', 'Horsehair Bow', merge(
        tubeAlong(stickPts, 0.0045, 8),
        rodBetween([bowX, bowY + 0.02, 0.05], [bowX, -bowY - 0.02, 0.05], 0.0028),
      ), '#F8FAFC');
    }
  }

  // Excitation marker along string span for plucked instruments
  const exciteX = -0.34 + posNorm * 0.56;
  if (inst.excite !== 'bow' && inst.excite !== 'wheel' && inst.excite !== 'hammer') {
    addSolidMesh(m, 'excite_marker', 'Excitation Contact', cylinderZ(0.006, 0.006, -0.004, 0.055, 10), '#38BDF8', 0.45);
    const last = m.meshes[m.meshes.length - 1];
    if (last) {
      for (let i = 0; i < last.positions.length; i += 3) last.positions[i]! += exciteX;
    }
  }

  finish(m);
  return {
    model: m,
    spec: {
      family,
      cameraPos: [0.52, 0.62, 0.82],
      target: [0.02, 0, 0.02],
      accentHex: '#C98B4A',
    },
  };
}
