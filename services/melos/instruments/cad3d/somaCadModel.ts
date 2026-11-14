// Parametric 3D CAD drum assemblies for SOMA physical percussion synthesis.
// Dynamically morphs kettle/goblet/barrel/hourglass/taiko/frame/udu shells, hardware lugs,
// jingles, rope lacing, skin patina, eccentric C.V. Raman syahi paste, and batter membranes.

import type { CadModel } from '../../../cad/model';
import { SM } from '../soma/params';
import {
  addSolidMesh, boxSolid, cylinderZ, extrude, finish, lathe, lerpHex, merge,
  newInstrumentCad, polarMembraneDisc, rodBetween, rotateY, translate, tubeAlong,
  type InstrumentViewSpec,
} from './cadUtils';
import type { P2, Solid } from '../../../mech/geometry';

export type SomaCadFamily = 'kettle' | 'goblet' | 'barrel' | 'hourglass' | 'taiko' | 'frame' | 'udu';

function hollowShellLathe(profileOuter: P2[], wall = 0.014, segs = 36): Solid {
  // Build a watertight closed cross-section ring from outer wall (bottom -> top) back down inner wall
  const prof: P2[] = [];
  for (const [r, z] of profileOuter) prof.push([r, z]);
  for (let i = profileOuter.length - 1; i >= 0; i--) {
    const [r, z] = profileOuter[i]!;
    prof.push([Math.max(0.012, r - wall), z]);
  }
  return lathe(prof, segs);
}

export function buildSomaCadModel(
  params: Record<number, number>,
  presetId?: string,
): { model: CadModel; spec: InstrumentViewSpec } {
  const cavType = Math.round(params[SM.CAVITY_TYPE] ?? 0);
  const isUdu = Boolean(presetId && presetId.includes('udu'));
  const family: SomaCadFamily = isUdu
    ? 'udu'
    : cavType === 0
      ? 'kettle'
      : cavType === 1
        ? 'goblet'
        : cavType === 2
          ? 'barrel'
          : cavType === 3
            ? 'hourglass'
            : cavType === 4
              ? 'taiko'
              : 'frame';

  const age = params[SM.HERITAGE_AGE] ?? 0.35;
  const craft = params[SM.CRAFT_ASYMMETRY] ?? 0.25;
  const diamNorm = params[SM.HEAD_DIAMETER] ?? 0.55;
  const cavVol = params[SM.CAVITY_VOLUME] ?? 0.65;
  const syahi = params[SM.SYAHI_LOAD] ?? 0;
  const buzz = params[SM.BUZZ_AMOUNT] ?? 0;
  const strikeR = Math.max(0.02, Math.min(0.95, params[SM.STRIKE_POS] ?? 0.62));
  const strikeAng = (params[SM.STRIKE_ANGLE] ?? 0.5) * Math.PI - Math.PI;

  const shellIdx = Math.round(params[SM.SHELL_MATERIAL] ?? 1);
  const skinIdx = Math.round(params[SM.SKIN_MATERIAL] ?? 0);

  const shellPalette = ['#8B4513', '#D97736', '#C89B3C', '#C45A3B', '#94A3B8'];
  const skinPalette = ['#F3E5AB', '#D6B88A', '#E8D3B3', '#C89D66', '#B88655', '#E2E8F0'];
  const shellCol = lerpHex(shellPalette[shellIdx] ?? '#D97736', '#3A1E0D', age * 0.55);
  const skinCol = lerpHex(skinPalette[skinIdx] ?? '#F3E5AB', '#8A5622', age * 0.45);
  const metalCol = lerpHex('#CBD5E1', '#64748B', age * 0.4);
  const cordCol = lerpHex('#E5C794', '#6E4C23', age * 0.65);

  const R = 0.14 + 0.18 * diamNorm;
  const H = family === 'frame' ? 0.08 + 0.04 * cavVol : 0.24 + 0.34 * cavVol;
  const m = newInstrumentCad(`SOMA · ${presetId ?? family}`);

  if (family === 'udu') {
    // Glazed Igbo ceramic Udu spherical clay pot with cylindrical spout & side opening
    const outer: P2[] = [];
    for (let i = 0; i <= 14; i++) {
      const th = (i / 14) * Math.PI * 0.85;
      const rr = Math.max(0.04, R * 0.85 * Math.sin(th) + (i === 14 ? 0.05 : 0));
      const zz = H * 0.45 * (1 - Math.cos(th));
      outer.push([rr, zz]);
    }
    outer.push([0.052, H * 0.98]);
    addSolidMesh(m, 'shell', 'Terracotta Pot Body', hollowShellLathe(outer, 0.012, 32), lerpHex('#B95638', '#5E2717', age * 0.6));
    addSolidMesh(m, 'side_collar', 'Side Bung Aperture', translate(rotateY(cylinderZ(0.046, 0.05, -0.02, 0.02, 20), Math.PI * 0.5), R * 0.8, 0, H * 0.48), '#3A1C12');
    addSolidMesh(m, 'membrane', 'Top Acoustic Air Rim', polarMembraneDisc(0.048, H * 0.96, 10, 24), skinCol);
  } else if (family === 'kettle') {
    // Parabolic spun-copper timpani bowl + 6 structural struts + base ring + pedal
    const outer: P2[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      outer.push([0.025 + Math.sqrt(u) * (R * 0.98 - 0.025), 0.06 + u * (H - 0.06)]);
    }
    const baseProf: P2[] = [[0, 0.06], ...outer.slice(1)];
    baseProf.push([outer[outer.length - 1]![0] - 0.012, H], [0.02, 0.072]);
    addSolidMesh(m, 'shell', 'Copper Kettle Bowl', lathe(baseProf, 36), shellCol);
    const struts: Solid[] = [];
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      struts.push(rodBetween([R * 1.03 * Math.cos(a), R * 1.03 * Math.sin(a), H], [R * 0.78 * Math.cos(a), R * 0.78 * Math.sin(a), 0], 0.008));
    }
    addSolidMesh(m, 'hardware', 'Tension Struts & Hoop', merge(...struts), metalCol);
    addSolidMesh(m, 'pedal', 'Tuning Rocker Pedal', boxSolid(0.09, 0.048, 0.025, R * 0.72, 0, 0.01), '#475569');
  } else if (family === 'goblet') {
    // Djembe / Darbuka waisted goblet profile
    const outer: P2[] = [
      [R * 0.58, 0],
      [R * 0.46, H * 0.2],
      [R * 0.34, H * 0.46],
      [R * 0.44, H * 0.62],
      [R * 0.96, H * 0.88],
      [R, H],
    ];
    addSolidMesh(m, 'shell', 'Carved Goblet Shell', hollowShellLathe(outer, 0.016, 36), shellCol);
    const ropes: Solid[] = [];
    for (let r = 0; r < 14; r++) {
      const a = (r / 14) * Math.PI * 2;
      ropes.push(rodBetween([R * 1.01 * Math.cos(a), R * 1.01 * Math.sin(a), H * 0.98], [R * 0.37 * Math.cos(a + 0.12), R * 0.37 * Math.sin(a + 0.12), H * 0.48], 0.0038));
    }
    addSolidMesh(m, 'hardware', 'Alpine Rope Tuning Lacing', merge(...ropes), cordCol);
  } else if (family === 'hourglass') {
    // Talking drum / Tama / Bata dual-head pinched hourglass
    const outer: P2[] = [
      [R * 0.92, 0],
      [R * 0.62, H * 0.25],
      [R * 0.38, H * 0.5],
      [R * 0.62, H * 0.75],
      [R, H],
    ];
    addSolidMesh(m, 'shell', 'Hourglass Shell', hollowShellLathe(outer, 0.013, 32), shellCol);
    const cords: Solid[] = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      cords.push(rodBetween([R * 0.94 * Math.cos(a), R * 0.94 * Math.sin(a), 0], [R * 1.01 * Math.cos(a), R * 1.01 * Math.sin(a), H], 0.0042));
    }
    addSolidMesh(m, 'hardware', 'Tension Squeeze Cords', merge(...cords), cordCol);
    addSolidMesh(m, 'resonant_head', 'Bottom Resonant Head', polarMembraneDisc(R * 0.9, 0.004, 6, 24), skinCol);
  } else if (family === 'barrel' || family === 'taiko') {
    // Conga / Tumba (tapered barrel) or Deep Taiko barrel + chrome lugs / brass studs
    const swell = family === 'taiko' ? 1.24 : 1.15;
    const botR = family === 'taiko' ? R * 0.92 : R * 0.7;
    const outer: P2[] = [
      [botR, 0],
      [R * swell * 0.92, H * 0.32],
      [R * swell, H * 0.58],
      [R * 1.02, H * 0.85],
      [R, H],
    ];
    addSolidMesh(m, 'shell', family === 'taiko' ? 'Keyaki Taiko Barrel' : 'Staved Barrel Shell', hollowShellLathe(outer, 0.018, 36), shellCol);
    const lugs: Solid[] = [];
    const lugN = family === 'taiko' ? 12 : 6;
    for (let l = 0; l < lugN; l++) {
      const a = (l / lugN) * Math.PI * 2;
      if (family === 'taiko') {
        lugs.push(boxSolid(0.016, 0.016, 0.014, R * 1.01 * Math.cos(a), R * 1.01 * Math.sin(a), H * 0.88));
      } else {
        lugs.push(rodBetween([R * 1.03 * Math.cos(a), R * 1.03 * Math.sin(a), H], [R * 1.08 * Math.cos(a), R * 1.08 * Math.sin(a), H * 0.45], 0.0055));
      }
    }
    addSolidMesh(m, 'hardware', family === 'taiko' ? 'Byo Brass Tacks' : 'Chrome Tension Lugs', merge(...lugs), family === 'taiko' ? '#F59E0B' : metalCol);
    if (family === 'taiko') {
      addSolidMesh(m, 'resonant_head', 'Bottom Taiko Skin', polarMembraneDisc(botR * 0.96, 0.005, 6, 24), skinCol);
    }
  } else {
    // Frame drum (Bendir / Daf / Pandeiro / Bodhran) + brass jingle pairs when buzz > 0.04
    const outer: P2[] = [[R, 0], [R * 1.01, H], [R - 0.014, H], [R - 0.014, 0]];
    addSolidMesh(m, 'shell', 'Steam-Bent Frame Hoop', lathe(outer, 36), shellCol);
    if (buzz > 0.04) {
      const jingles: Solid[] = [];
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2;
        const jx = (R - 0.004) * Math.cos(a), jy = (R - 0.004) * Math.sin(a);
        jingles.push(translate(cylinderZ(0.018, 0.018, H * 0.42, H * 0.46, 14), jx, jy, 0));
      }
      addSolidMesh(m, 'rattle', 'Hammered Brass Zills / Jingles', merge(...jingles), '#FBBF24');
    }
  }

  // Shared top counterhoop rim, live deformable Bessel membrane & eccentric Syahi paste
  if (family !== 'udu') {
    const rimPts: P2[] = [[R + 0.008, H - 0.012], [R + 0.012, H + 0.008], [R - 0.004, H + 0.008], [R - 0.004, H - 0.012]];
    addSolidMesh(m, 'counterhoop', 'Counterhoop Rim', lathe(rimPts, 36), metalCol);
    addSolidMesh(m, 'membrane', 'Vibrating Drumhead Membrane', polarMembraneDisc(R * 0.99, H + 0.001, 12, 32), skinCol);
    if (syahi > 0.03) {
      const sRad = R * (0.14 + 0.24 * syahi);
      const ecc = R * 0.06 * craft;
      const syahiSolid = translate(cylinderZ(sRad, sRad * 0.92, H + 0.0015, H + 0.0045, 24), ecc, -ecc * 0.5, 0);
      addSolidMesh(m, 'syahi', 'Harmonic Iron-Oxide Syahi', syahiSolid, '#18181B');
    }
  }

  // Striker target sphere / mallet head hovering right over the active strike spot
  const stX = strikeR * R * 0.92 * Math.cos(strikeAng);
  const stY = strikeR * R * 0.92 * Math.sin(strikeAng);
  const strikerStem = rodBetween([stX, stY, H + 0.045], [stX * 1.15 + 0.08, stY - 0.14, H + 0.16], 0.0045);
  const strikerHead = translate(lathe([[0, 0], [0.018, 0.006], [0.018, 0.022], [0, 0.028]], 16), stX, stY, H + 0.028);
  addSolidMesh(m, 'striker', 'Exciter / Striker Target', merge(strikerStem, strikerHead), '#E86A33');

  // Slight organic handcraft offset vector stored subtly via shell angle
  if (craft > 0.01 && m.meshes[0]) {
    m.meshes[0] = { ...m.meshes[0], name: `${m.meshes[0].name} (craft ${Math.round(craft * 100)}%)` };
  }
  void rotateY; void tubeAlong;

  finish(m);
  return {
    model: m,
    spec: {
      family,
      cameraPos: [0.46, 0.44, 0.52],
      target: [0, H * 0.55, 0],
      accentHex: '#E86A33',
    },
  };
}
