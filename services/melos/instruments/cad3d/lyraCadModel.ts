// Parametric 3D CAD instrument assemblies for all 11 LYRA physical models.
// Reflects variant hardware (piano vs upright, acoustic vs electric pickup configs,
// muted vs open trumpet), Heritage Age patina, Craft Character, and real-time animation parts.

import type { CadModel } from '../../../cad/model';
import { LY, type LyraModel } from '../lyra/params';
import {
  addSolidMesh, boxSolid, cylinderZ, extrude, finish, lathe, lerpHex, merge,
  newInstrumentCad, rodBetween, rotateY, rotateZ, segmentedString, translate, tubeAlong,
  type InstrumentViewSpec,
} from './cadUtils';
import type { P2, Solid } from '../../../mech/geometry';

export function buildLyraCadModel(
  model: LyraModel,
  variant: number,
  params: Record<number, number> = {},
): { model: CadModel; spec: InstrumentViewSpec } {
  const m = newInstrumentCad(`LYRA · ${model}`);
  const age = params[LY.HERITAGE_AGE] ?? 0.35;
  const craft = params[LY.CRAFT_CHARACTER] ?? 0.3;
  const symp = params[LY.SYMPATHETIC] ?? 0.3;
  const excitePos = Math.max(0.08, Math.min(0.6, params[LY.EXCITE_POS] ?? 0.22));
  const pickupSel = params[LY.PICKUP] ?? 0.5;

  const spruce = lerpHex('#E8C384', '#A46828', age);
  const varnish = lerpHex('#B85D22', '#5C2209', age);
  const ebony = '#1C1917';
  const brassCol = lerpHex('#EAB308', '#9A6F18', age * 0.65);
  const silverCol = lerpHex('#E2E8F0', '#94A3B8', age * 0.35);
  const ivory = lerpHex('#F8FAFC', '#E5D5B5', age);
  const skewY = (craft - 0.3) * 0.012;

  if (model === 'piano') {
    // Grand / Upright Piano Rim + Cast-Iron Harp Plate + 3x Trichord Strings + Felt Hammers
    const grandPts: P2[] = [
      [-0.42, -0.28], [0.42, -0.28], [0.42, -0.05],
      [0.34, 0.14], [0.16, 0.36], [-0.08, 0.44],
      [-0.36, 0.36], [-0.42, 0.1],
    ];
    addSolidMesh(m, 'rim', 'S-Curve Rim Case', extrude(grandPts, [], -0.09, 0.06), ebony);
    addSolidMesh(m, 'soundboard', 'Sitka Spruce Soundboard', extrude(grandPts.map(([x, y]) => [x * 0.9, y * 0.88] as P2), [], -0.03, -0.015), spruce);
    addSolidMesh(m, 'harp', 'Gilt Cast-Iron Harp Plate', extrude(grandPts.map(([x, y]) => [x * 0.85, y * 0.82] as P2), [], -0.008, 0.005), brassCol);
    // Keybed + 14 articulated playable keys
    addSolidMesh(m, 'keybed', 'Ivory & Ebony Keybed', boxSolid(0.76, 0.14, 0.032, 0, -0.32, 0.008), ebony);
    for (let k = 0; k < 14; k++) {
      const kx = -0.325 + k * 0.05;
      const isSharp = k === 1 || k === 3 || k === 6 || k === 8 || k === 10 || k === 13;
      addSolidMesh(
        m,
        `pkey_${k}`,
        `Key ${k + 1}`,
        boxSolid(isSharp ? 0.026 : 0.044, isSharp ? 0.08 : 0.12, 0.016, kx, isSharp ? -0.30 : -0.32, isSharp ? 0.044 : 0.038),
        isSharp ? '#111827' : ivory,
      );
    }
    // Trichord unison strings & duplex fan + hammers
    for (let i = 0; i < 8; i++) {
      const x = -0.32 + i * 0.09;
      const yEnd = 0.34 - i * 0.038;
      addSolidMesh(m, `string_${i}`, `Trichord Choir ${i + 1}`, segmentedString([x, -0.2, 0.024], [x + 0.02, yEnd, 0.024], 0.0022, 16), silverCol);
    }
    for (let h = 0; h < 6; h++) {
      const hx = -0.28 + h * 0.11;
      const hy = -0.2 + excitePos * 0.25;
      addSolidMesh(m, `hammer_${h}`, `Felt Hammer ${h + 1}`, boxSolid(0.028, 0.04, 0.022, hx, hy, 0.032), ivory);
    }
    if (symp > 0.2) {
      addSolidMesh(m, 'prop_lid', 'Raised Concert Lid', translate(rotateY(boxSolid(0.78, 0.54, 0.014, 0, 0.1, 0.18), 0.18), 0, 0, 0.02), '#111827', 0.55);
    }
  } else if (model === 'tine') {
    // Stage/Suitcase Rhodes Tine Piano: Tolex Cabinet, Pickup Coils, Cantilever Tines + Tonebars + Hammers
    addSolidMesh(m, 'cabinet', 'Stage Tolex Chassis', boxSolid(0.84, 0.42, 0.1, 0, 0, -0.08), '#18181B');
    addSolidMesh(m, 'rail', 'Harps & Aluminum Rail', boxSolid(0.76, 0.06, 0.04, 0, -0.14, 0.02), silverCol);
    // Stage Keybed + 14 playable keys
    addSolidMesh(m, 'keybed', 'Aluminum Keybed', boxSolid(0.76, 0.14, 0.025, 0, -0.26, -0.02), '#27272A');
    for (let k = 0; k < 14; k++) {
      const kx = -0.325 + k * 0.05;
      const isSharp = k === 1 || k === 3 || k === 6 || k === 8 || k === 10 || k === 13;
      addSolidMesh(
        m,
        `pkey_${k}`,
        `Tine Key ${k + 1}`,
        boxSolid(isSharp ? 0.026 : 0.044, isSharp ? 0.08 : 0.12, 0.015, kx, isSharp ? -0.24 : -0.26, isSharp ? 0.014 : 0.008),
        isSharp ? '#111827' : ivory,
      );
    }
    for (let i = 0; i < 8; i++) {
      const x = -0.3 + i * 0.085;
      const len = 0.24 - i * 0.016;
      addSolidMesh(m, `tine_${i}`, `Cantilever Steel Tine ${i + 1}`, segmentedString([x, -0.12, 0.03], [x, -0.12 + len, 0.03], 0.0032, 14), silverCol);
      addSolidMesh(m, `tonebar_${i}`, `Resonator Tonebar ${i + 1}`, boxSolid(0.02, len * 0.9, 0.01, x, -0.1 + len * 0.45, 0.062), brassCol);
      addSolidMesh(m, `pickup_${i}`, `Magnetic Pickup Coil ${i + 1}`, translate(cylinderZ(0.014, 0.014, 0.012, 0.042, 12), x, -0.12 + len + 0.018, 0), '#B45309');
    }
    for (let h = 0; h < 6; h++) {
      const hx = -0.26 + h * 0.1;
      addSolidMesh(m, `hammer_${h}`, `Neoprene Hammer ${h + 1}`, boxSolid(0.024, 0.036, 0.02, hx, -0.05, 0.008), '#E59A38');
    }
  } else if (model === 'violin') {
    // Cremonese Violin / Cello + Carved Spruce Arch + Twin F-Holes + Scroll + 4 Strings + Horsehair Bow
    const boutPts: P2[] = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const cBout = 1 - 0.36 * Math.exp(-Math.pow(Math.cos(a) * 2.5, 2));
      const upperTaper = Math.cos(a) > 0 ? 0.88 : 1.05;
      boutPts.push([0.2 * Math.cos(a), 0.135 * Math.sin(a) * cBout * upperTaper]);
    }
    addSolidMesh(m, 'body', 'Flamed Maple Back & Ribs', translate(extrude(boutPts, [], -0.038, 0.005), -0.16, skewY, 0), varnish);
    addSolidMesh(m, 'soundboard', 'Spruce Belly', translate(extrude(boutPts, [], 0.003, 0.015), -0.16, skewY, 0), spruce);
    addSolidMesh(m, 'f_holes', 'Cremonese f-holes', merge(
      boxSolid(0.075, 0.01, 0.006, -0.16, -0.048, 0.014),
      boxSolid(0.075, 0.01, 0.006, -0.16, 0.048, 0.014),
    ), '#110C09');
    addSolidMesh(m, 'neck', 'Neck & Ebony Fingerboard', boxSolid(0.32, 0.032, 0.018, 0.14, 0, 0.012), ebony);
    addSolidMesh(m, 'scroll', 'Carved Scroll', tubeAlong([[0.3, 0, 0.02], [0.35, 0, 0.025], [0.37, 0, 0.048], [0.34, 0, 0.055]], 0.012, 10), varnish);
    addSolidMesh(m, 'bridge', 'Despiau Maple Bridge', boxSolid(0.009, 0.054, 0.026, -0.16, skewY, 0.015), '#F3E5AB');
    for (let s = 0; s < 4; s++) {
      const sy = -0.016 + (0.032 * s) / 3;
      addSolidMesh(m, `string_${s}`, `Violin String ${s + 1}`, segmentedString([0.29, sy * 0.65, 0.028], [-0.3, sy, 0.036], 0.0019, 20), silverCol);
    }
    const bx = -0.14 + excitePos * 0.12;
    addSolidMesh(m, 'bow', 'Pernambuco Horsehair Bow', merge(
      tubeAlong([[bx, -0.24, 0.068], [bx + 0.012, 0, 0.055], [bx, 0.24, 0.068]], 0.0045, 8),
      rodBetween([bx, -0.22, 0.044], [bx, 0.22, 0.044], 0.0028),
    ), ivory);
  } else if (model === 'guitar' || model === 'pluck') {
    // Acoustic Dreadnought / Solidbody Cutaway Guitar / Sympathetic Harp
    const gPts: P2[] = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const waist = 1 - 0.28 * Math.exp(-Math.pow(Math.cos(a) * 2.2, 2));
      const cut = variant === 0 && model === 'guitar' && a > 0.25 && a < 1.05 ? 0.72 : 1;
      gPts.push([0.23 * Math.cos(a), 0.175 * Math.sin(a) * waist * cut]);
    }
    const col = variant >= 2 && model === 'guitar' ? '#991B1B' : varnish;
    addSolidMesh(m, 'body', 'Contoured Guitar Body', translate(extrude(gPts, [], -0.055, 0.015), -0.18, skewY, 0), model === 'pluck' ? spruce : col);
    addSolidMesh(m, 'neck', 'Rosewood Fretboard Neck', boxSolid(0.46, 0.052, 0.022, 0.22, 0, 0.004), ebony);
    addSolidMesh(m, 'bridge', 'Bridge & Saddle', boxSolid(0.032, 0.12, 0.014, -0.28, skewY, 0.016), ebony);
    if (model === 'guitar' && variant >= 2) {
      // Electric single-coil (variant 2) or humbucker (variant 3) pickup coils!
      const isHb = variant === 3 || pickupSel > 0.65;
      addSolidMesh(m, 'pickup_n', isHb ? 'Neck Humbucker' : 'Neck Single Coil', boxSolid(isHb ? 0.036 : 0.018, 0.088, 0.014, -0.04, 0, 0.014), silverCol);
      addSolidMesh(m, 'pickup_b', isHb ? 'Bridge Humbucker' : 'Bridge Single Coil', boxSolid(isHb ? 0.036 : 0.018, 0.088, 0.014, -0.19, 0, 0.014), silverCol);
    } else {
      addSolidMesh(m, 'soundhole', 'Rosette Soundhole', translate(cylinderZ(0.052, 0.052, 0.013, 0.017, 24), -0.09, skewY, 0), '#151210');
    }
    for (let s = 0; s < 6; s++) {
      const sy = -0.026 + (0.052 * s) / 5;
      addSolidMesh(m, `string_${s}`, `Guitar String ${s + 1}`, segmentedString([0.42, sy * 0.72, 0.029], [-0.28, sy, 0.032], 0.0018, 18), brassCol);
    }
  } else {
    // Wind & Brass Family: Sax, Trumpet, Brass, Flute, Clarinet, Reed
    const isBrass = model === 'trumpet' || model === 'brass' || model === 'sax';
    const hornCol = isBrass ? brassCol : model === 'flute' ? silverCol : '#1F1B18';
    const keyCol = isBrass ? brassCol : silverCol;

    if (model === 'trumpet' || model === 'brass') {
      const isTrombone = model === 'brass' && (variant === 2 || variant === 3);
      const isTuba = model === 'brass' && variant === 4;
      const boreScale = isTuba ? 1.45 : isTrombone ? 1.15 : 1.0;
      const foldPts: Array<[number, number, number]> = [
        [0.42 * boreScale, 0, 0.04],
        [0.08 * boreScale, 0, 0.04],
        [-0.22 * boreScale, 0, 0.04],
        [-0.26 * boreScale, 0, -0.04],
        [0.05 * boreScale, 0, -0.04],
        [0.24 * boreScale, 0, 0],
        [-0.18 * boreScale, 0, 0.08],
      ];
      addSolidMesh(m, 'bore', 'Folded Brass Leadpipe', tubeAlong(foldPts, isTuba ? 0.019 : 0.012, 12), hornCol);
      // Exponential Bell Flare
      const bellProf: P2[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const r = 0.013 * boreScale + (isTuba ? 0.145 : 0.085) * Math.pow(u, 3.1);
        bellProf.push([r, -0.22 + u * 0.2]);
      }
      addSolidMesh(m, 'bell', 'Exponential Flared Bell', translate(rotateY(lathe(bellProf, 28), -Math.PI * 0.5), -0.2 * boreScale, 0, 0.08), hornCol);
      if (isTrombone) {
        const slidePts: Array<[number, number, number]> = [
          [0.06, 0, 0.042],
          [0.46, 0, 0.042],
          [0.49, 0, 0.018],
          [0.46, 0, -0.008],
          [0.06, 0, -0.008],
        ];
        addSolidMesh(m, 'slide', 'Outer Brass Hand-Slide', tubeAlong(slidePts, 0.013, 12), keyCol);
        addSolidMesh(m, 'slide_brace', 'Slide Cross Brace', boxSolid(0.014, 0.022, 0.064, 0.24, 0, -0.015), keyCol);
      } else {
        for (let v = 0; v < 3; v++) {
          addSolidMesh(m, `valve_${v}`, `Piston Valve ${v + 1}`, translate(cylinderZ(0.015, 0.015, -0.05, 0.095, 14), -0.06 + v * 0.042, 0, 0), keyCol);
        }
      }
      if (model === 'trumpet' && variant > 0) {
        addSolidMesh(m, 'mute', 'Straight Harmon Mute', translate(rotateY(cylinderZ(0.022, 0.052, 0, 0.11, 20), -Math.PI * 0.5), -0.34, 0, 0.08), '#94A3B8');
      }
    } else if (model === 'sax') {
      const saxPts: Array<[number, number, number]> = [
        [-0.14, 0, 0.24], [-0.04, 0, 0.2], [0.02, 0, 0.08], [0.02, 0, -0.2], [0.08, 0, -0.26], [0.16, 0, -0.18],
      ];
      addSolidMesh(m, 'bore', 'Conical Brass Body & Bow', tubeAlong(saxPts, [0.008, 0.012, 0.018, 0.028, 0.036, 0.042], 14), brassCol);
      addSolidMesh(m, 'bell', 'Saxophone Bell', translate(cylinderZ(0.042, 0.088, -0.18, -0.05, 24), 0.16, 0, 0), brassCol);
      for (let k = 0; k < 6; k++) {
        addSolidMesh(m, `key_${k}`, `Brass Key Cup ${k + 1}`, translate(rotateZ(cylinderZ(0.016, 0.016, 0, 0.008, 12), 0), 0.036, 0, 0.055 - k * 0.044), keyCol);
      }
    } else {
      // Flute / Clarinet / Double Reed linear bore + bell & individual silver keywork
      const cone = model === 'reed';
      const pipe = rotateY(cylinderZ(cone ? 0.008 : 0.012, model === 'clarinet' || cone ? 0.042 : 0.014, -0.34, 0.34, 24), Math.PI * 0.5);
      addSolidMesh(m, 'bore', `${model} Resonant Bore`, pipe, hornCol);
      for (let k = 0; k < 6; k++) {
        addSolidMesh(
          m,
          `key_${k}`,
          `Silver Key Cup ${k + 1}`,
          translate(cylinderZ(0.013, 0.013, 0.013, 0.021, 12), -0.16 + k * 0.058, 0, 0),
          keyCol,
        );
      }
    }
  }

  finish(m);
  return {
    model: m,
    spec: {
      family: model,
      cameraPos: [0.54, 0.48, 0.72],
      target: [0, 0, 0.02],
      accentHex: '#D9B36C',
    },
  };
}
