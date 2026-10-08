// Brake part generators. Corner-assembly parts are authored directly in the DISC CORNER FRAME (axis +Z, outboard +Z,
// rotor centred at origin, caliper at the top, +Y). Drum parts are authored in the DRUM CORNER FRAME (drum open to -Z).
// Hydraulic-circuit parts are authored around their own origin and positioned by the layout.
import type { BufferGeometry } from 'three';
import { PI as _PI } from './mathconst';
import { box, ball, ring, sector, tube, coil, torus, lathe, merge, cyl, cylZ, hex, COLORS as C, pnum, ppts, paint, xf, type V3 } from './kit';
import { ExtrudeGeometry, Shape, Path } from 'three';

type P = Record<string, number | string | boolean>;
const PI = _PI;

export function rotor(p: P): BufferGeometry {
  const R = pnum(p, 'outerR', 1.2), Ri = pnum(p, 'innerR', 0.66), fins = pnum(p, 'fins', 28), wear = pnum(p, 'wear', 0);
  const th = 0.07 * (1 - 0.4 * wear), gap = 0.12;
  const parts: BufferGeometry[] = [
    ring(R, Ri, th, gap / 2, C.castIron, undefined, 48), ring(R, Ri, th, -gap / 2 - th, C.castIron, undefined, 48),
    // hat: bell wall + mounting plate with centre bore and 5 bolt holes
    lathe([[0.52, 0], [0.52, 0.32]], C.darkIron, { r: [PI / 2, 0, 0], p: [0, 0, 0.06] }, 32),
    ring(0.56, 0.2, 0.05, 0.38, C.darkIron, { n: 5, at: 0.36, r: 0.045 }, 32),
    ring(0.66, 0.5, 0.06, 0.04, C.castIron, undefined, 32),
  ];
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * PI * 2 + 0.2, rm = (R + Ri) / 2;
    parts.push(box(0.035, R - Ri - 0.02, gap, C.darkIron, [Math.cos(a) * rm, Math.sin(a) * rm, 0], [0, 0, a - PI / 2]));
  }
  return merge(parts);
}

export function drum(p: P): BufferGeometry {
  // DRUM CORNER FRAME: open end faces inboard (-Z) at z0, closed face outboard.
  const R = pnum(p, 'R', 1.15), depth = pnum(p, 'depth', 0.75), z0 = -0.7;
  const parts = [
    lathe([[R - 0.06, 0], [R, 0], [R, depth], [R - 0.06, depth], [R - 0.06, 0]], C.castIron, { r: [PI / 2, 0, 0], p: [0, 0, z0] }, 40),
    ring(R, 0.3, 0.07, z0 + depth - 0.05, C.castIron, { n: 5, at: 0.5, r: 0.05 }, 40),
    ring(0.32, 0.12, 0.2, z0 + depth + 0.0, C.darkIron, undefined, 20),
  ];
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; parts.push(box(0.03, 0.03, depth * 0.8, C.darkIron, [Math.cos(a) * (R + 0.01), Math.sin(a) * (R + 0.01), z0 + depth * 0.45], [0, 0, a])); }
  return merge(parts);
}

export function backing_plate(_p: P): BufferGeometry {
  return merge([ring(1.08, 0.12, 0.05, -0.78, C.steel, undefined, 36), cylZ(0.32, 0.1, C.darkIron, [0, 0, -0.76])]);
}

export function caliper(p: P): BufferGeometry {
  const col = typeof p.color === 'string' ? p.color : C.caliperPaint;
  const parts = [
    box(0.9, 0.62, 0.42, col, [0, 1.1, -0.41]),              // inboard housing (piston side)
    box(0.9, 0.2, 0.86, col, [0, 1.35, -0.1]),               // bridge over the rotor rim
    box(0.9, 0.58, 0.1, col, [0, 1.1, 0.25]),                // outboard finger
    cylZ(0.24, 0.1, C.darkIron, [0, 1.06, -0.66], 24),       // piston bore boss
    box(0.14, 0.22, 0.3, col, [-0.5, 1.15, -0.45]), box(0.14, 0.22, 0.3, col, [0.5, 1.15, -0.45]), // slide ears
    hex(0.05, 0.1, C.steel, { p: [0.28, 1.72, -0.42] }),    // bleeder boss seat
    box(0.12, 0.12, 0.12, col, [-0.28, 1.5, -0.5]),          // hose port
  ];
  return merge(parts);
}

export function caliper_piston(p: P): BufferGeometry {
  const ext = pnum(p, 'ext', 0);
  return merge([cylZ(0.17, 0.2, C.steel, [0, 1.06, -0.27 + ext], 24), cylZ(0.12, 0.02, C.darkIron, [0, 1.06, -0.165 + ext], 20)]);
}

export function piston_seal(_p: P): BufferGeometry {
  return merge([torus(0.17, 0.014, C.rubber, [0, 1.06, -0.4]), torus(0.185, 0.02, C.rubber, [0, 1.06, -0.3])]);
}

export function brake_pads(p: P): BufferGeometry {
  const wear = Math.min(1, Math.max(0, pnum(p, 'wear', 0))), a0 = PI / 2 - 0.42, a1 = PI / 2 + 0.42;
  const lin = 0.06 * (1 - 0.85 * wear);
  const parts = [
    sector(0.78, 1.17, a0, a1, 0.03, -0.215, C.backing), sector(0.78, 1.17, a0, a1, lin, -0.185 + (0.06 - lin), C.friction),
    sector(0.78, 1.17, a0, a1, 0.03, 0.17, C.backing), sector(0.78, 1.17, a0, a1, lin, 0.14 - (0.06 - lin) + 0.0, C.friction),
  ];
  // wear slot (chamfer groove) on each friction face
  parts.push(box(0.03, 0.34, 0.012, C.black, [0, 0.98, -0.125 - (0.06 - lin) * 0]), box(0.03, 0.34, 0.012, C.black, [0, 0.98, 0.13]));
  return merge(parts);
}

export function pad_wear_indicator(_p: P): BufferGeometry {
  return merge([box(0.05, 0.3, 0.012, C.zinc, [0.34, 0.95, -0.2]), box(0.05, 0.05, 0.1, C.zinc, [0.34, 1.1, -0.2])]);
}

export function caliper_bracket(_p: P): BufferGeometry {
  return merge([
    box(0.13, 0.5, 0.95, C.darkIron, [-0.52, 1.0, -0.15]), box(0.13, 0.5, 0.95, C.darkIron, [0.52, 1.0, -0.15]),
    box(1.2, 0.1, 0.12, C.darkIron, [0, 0.76, -0.6]), cylZ(0.1, 0.12, C.darkIron, [-0.55, 1.1, -0.62]), cylZ(0.1, 0.12, C.darkIron, [0.55, 1.1, -0.62]),
  ]);
}

export function slide_pins(_p: P): BufferGeometry {
  const one = (x: number) => [cylZ(0.05, 0.72, C.steel, [x, 1.1, -0.45], 12), cylZ(0.09, 0.2, C.rubber, [x, 1.1, -0.76], 12)];
  return merge([...one(-0.56), ...one(0.56)]);
}

export function hub(_p: P): BufferGeometry {
  const parts = [ring(0.6, 0.12, 0.1, 0.46, C.steel, undefined, 32), cylZ(0.24, 0.95, C.steel, [0, 0, 0.0], 24), cylZ(0.16, 1.0, C.darkIron, [0, 0, 0.0], 16)];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; parts.push(cylZ(0.035, 0.36, C.zinc, [Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.7], 8)); }
  return merge(parts);
}

export function wheel_stub(_p: P): BufferGeometry {
  return merge([ring(1.5, 0.3, 0.08, 0.72, '#33353a', { n: 5, at: 0.4, r: 0.05 }, 40), cylZ(0.5, 0.2, C.steel, [0, 0, 0.8], 20)]);
}

export function tone_ring(p: P): BufferGeometry {
  const teeth = pnum(p, 'teeth', 40), s = new Shape(), r0 = 0.32, r1 = 0.37;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * PI * 2, r = i % 2 ? r0 : r1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath(); const h = new Path(); h.absarc(0, 0, 0.26, 0, PI * 2, true); s.holes.push(h);
  return merge([paint(xf(new ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }), { p: [0, 0, -0.56] }), C.zinc)]);
}

export function wheel_speed_sensor(_p: P): BufferGeometry {
  return merge([
    cyl(0.05, 0.3, C.plastic, { p: [0.5, 0, -0.52], r: [0, 0, PI / 2] }, 12), box(0.16, 0.12, 0.1, C.black, [0.7, 0, -0.52]),
    box(0.1, 0.35, 0.05, C.steel, [0.78, -0.1, -0.52]), tube([[0.74, 0, -0.52], [1.0, -0.2, -0.8], [1.3, -0.4, -1.3]], 0.025, C.black, 12, 5),
  ]);
}

// ---------- hydraulic circuit parts (own origin; axes along +X unless noted) ----------
export function brake_pedal(_p: P): BufferGeometry {
  return merge([box(0.18, 1.7, 0.18, C.steel, [0, -0.7, 0], [0, 0, 0.12]), box(0.7, 0.2, 0.5, C.black, [0.18, -1.55, 0]), cyl(0.12, 0.5, C.darkIron, { p: [-0.1, 0.15, 0], r: [PI / 2, 0, 0] }), box(0.3, 0.1, 0.1, C.steel, [0.05, -0.05, 0])]);
}
export function pushrod(_p: P): BufferGeometry {
  return merge([cyl(0.045, 1.9, C.steel, { r: [0, 0, PI / 2] }, 10), box(0.18, 0.18, 0.1, C.darkIron, [-0.95, 0, 0]), ball(0.08, C.zinc, [0.95, 0, 0])]);
}
export function brake_booster(_p: P): BufferGeometry {
  const half = (z: number, s: number) => lathe([[0.001, 0], [1.4, 0], [1.5, 0.12], [1.35, 0.6 * s]], C.darkIron, { r: [PI / 2, 0, 0], p: [0, 0, z] }, 40);
  return merge([half(-0.6, 1), half(0.6, -1), ring(1.52, 1.38, 0.1, -0.05, C.steel, undefined, 40), cylZ(0.25, 0.6, C.black, [0, 0, 0.9]), cylZ(0.08, 0.3, C.steel, [0, 0, -0.78]),
    cylZ(0.04, 0.4, C.zinc, [0.8, 0.8, 0.85], 8), cylZ(0.04, 0.4, C.zinc, [-0.8, -0.8, 0.85], 8), cyl(0.08, 0.3, C.black, { p: [0, 1.5, -0.2] }, 10)]);
}
export function master_cylinder(_p: P): BufferGeometry {
  return merge([cylZ(0.38, 1.0, C.alu, [0, 0, 0.0], 24), cylZ(0.3, 0.9, C.alu, [0, 0, 0.95], 24), cylZ(0.45, 0.12, C.alu, [0, 0, -0.5], 24),
    cyl(0.11, 0.25, C.alu, { p: [-0.2, 0.45, 0.1] }, 12), cyl(0.11, 0.25, C.alu, { p: [0.2, 0.45, 0.8] }, 12),
    hex(0.07, 0.16, C.brass, { p: [0.0, -0.36, 0.2] }), hex(0.07, 0.16, C.brass, { p: [0.0, -0.3, 0.9] })]);
}
export function fluid_reservoir(_p: P): BufferGeometry {
  return merge([box(0.5, 0.45, 1.1, '#3a3d44', [0, 0.1, 0]), cyl(0.15, 0.1, C.plastic, { p: [0, 0.38, -0.3] }, 14), cyl(0.15, 0.1, C.plastic, { p: [0, 0.38, 0.3] }, 14),
    box(0.46, 0.2, 1.06, C.fluidAmber, [0, -0.05, 0]), cyl(0.07, 0.3, '#3a3d44', { p: [-0.1, -0.3, -0.1] }, 8), cyl(0.07, 0.3, '#3a3d44', { p: [0.1, -0.3, 0.5] }, 8)]);
}
export function proportioning_valve(_p: P): BufferGeometry {
  return merge([cyl(0.2, 0.9, C.alu, { r: [0, 0, PI / 2] }, 16), hex(0.14, 0.2, C.brass, { p: [0.5, 0, 0], r: [0, 0, PI / 2] }), cyl(0.09, 0.3, C.steel, { p: [0, 0.3, 0] }, 10), cyl(0.07, 0.25, C.steel, { p: [-0.2, -0.2, 0] }, 10), cyl(0.07, 0.25, C.steel, { p: [0.2, -0.2, 0] }, 10)]);
}
export function abs_hcu(_p: P): BufferGeometry {
  const parts = [box(1.5, 0.9, 1.0, C.alu, [0, 0, 0]), cylZ(0.34, 0.5, C.black, [-1.0, 0, 0.1], 16)];
  for (let i = 0; i < 4; i++) for (const s of [0.18, -0.18]) parts.push(cyl(0.11, 0.42, C.black, { p: [-0.5 + i * 0.35, 0.65, s * 1.6] }, 10));
  for (let i = 0; i < 4; i++) parts.push(hex(0.07, 0.2, C.brass, { p: [-0.5 + i * 0.35, -0.55, 0.4], r: [0, 0, 0] }));
  parts.push(cylZ(0.12, 0.22, C.steel, [0.3, -0.1, 0.6], 10));
  return merge(parts);
}
export function abs_ecu(_p: P): BufferGeometry {
  return merge([box(1.3, 0.25, 0.9, '#2a2d35', [0, 0, 0]), box(0.5, 0.2, 0.3, C.plastic, [0.2, 0.2, 0.45]), box(1.2, 0.02, 0.8, C.green, [0, 0.12, 0])]);
}
export function brake_line(p: P): BufferGeometry {
  return tube(ppts(p, 'pts', [[0, 0, 0], [1, 0.2, 0], [2, 0, 0]]), pnum(p, 'r', 0.045), C.steel, 40, 6);
}
export function flex_hose(p: P): BufferGeometry {
  const pts = ppts(p, 'pts', [[0, 0, 0], [0.4, 0.5, 0], [1, 0.4, 0]]);
  const a = pts[0], b = pts[pts.length - 1];
  return merge([tube(pts, pnum(p, 'r', 0.07), C.rubber, 30, 8), hex(0.1, 0.18, C.brass, { p: a }), hex(0.1, 0.18, C.brass, { p: b })]);
}
export function bleeder_screw(_p: P): BufferGeometry {
  return merge([cyl(0.05, 0.3, C.brass, { p: [0.28, 1.62, -0.42] }, 8), hex(0.07, 0.08, C.brass, { p: [0.28, 1.8, -0.42] }), cyl(0.02, 0.1, C.red, { p: [0.28, 1.85, -0.42] }, 6)]);
}
export function brake_light_switch(_p: P): BufferGeometry {
  return merge([cyl(0.1, 0.4, C.plastic, { r: [0, 0, PI / 2] }, 12), cyl(0.04, 0.3, C.steel, { p: [0.3, 0, 0], r: [0, 0, PI / 2] }, 8), box(0.12, 0.14, 0.2, C.black, [-0.25, 0.14, 0])]);
}
export function brake_fluid(_p: P): BufferGeometry {
  return merge([cyl(0.24, 0.6, '#d8d4c4', { p: [0, 0, 0] }, 16), cyl(0.12, 0.2, '#d8d4c4', { p: [0, 0.4, 0] }, 12), cyl(0.14, 0.1, C.black, { p: [0, 0.55, 0] }, 12), cyl(0.245, 0.3, C.fluidAmber, { p: [0, -0.1, 0] }, 16)]);
}

// ---------- drum corner (drum open toward -Z, shoes in z ~ -0.45) ----------
export function brake_shoes(p: P): BufferGeometry {
  const wear = pnum(p, 'wear', 0), lin = 0.07 * (1 - 0.8 * wear);
  const shoe = (a0: number, a1: number) => [sector(0.9, 0.98, a0, a1, 0.26, -0.58, C.backing), sector(0.98 - 0.0, 1.0 + lin, a0 + 0.05, a1 - 0.05, 0.22, -0.56, C.friction), sector(0.62, 0.9, (a0 + a1) / 2 - 0.05, (a0 + a1) / 2 + 0.05, 0.12, -0.51, C.backing)];
  return merge([...shoe(PI * 0.12, PI * 0.88), ...shoe(PI * 1.12, PI * 1.88)]);
}
export function wheel_cylinder(_p: P): BufferGeometry {
  return merge([cyl(0.14, 0.62, C.alu, { p: [0, 0.85, -0.45], r: [0, 0, PI / 2] }, 14), cyl(0.1, 0.16, C.rubber, { p: [-0.35, 0.85, -0.45], r: [0, 0, PI / 2] }, 10), cyl(0.1, 0.16, C.rubber, { p: [0.35, 0.85, -0.45], r: [0, 0, PI / 2] }, 10), hex(0.06, 0.16, C.brass, { p: [0, 0.98, -0.5] })]);
}
export function return_springs(_p: P): BufferGeometry {
  return merge([coil(0.045, 0.7, 9, 0.012, C.steel, [0, -0.5, -0.4], [0, PI / 2, 0]), coil(0.04, 0.55, 8, 0.011, C.steel, [0, 0.55, -0.62], [0, PI / 2, 0]), coil(0.04, 0.5, 8, 0.011, C.steel, [0.05, -0.2, -0.62], [PI / 2, 0, 0])]);
}
export function shoe_adjuster(_p: P): BufferGeometry {
  return merge([cyl(0.04, 0.5, C.steel, { p: [0, -0.8, -0.45], r: [0, 0, PI / 2] }, 8), cyl(0.12, 0.08, C.zinc, { p: [0, -0.8, -0.45], r: [0, 0, PI / 2] }, 12), box(0.22, 0.05, 0.1, C.zinc, [-0.2, -0.8, -0.38]), box(0.22, 0.05, 0.1, C.zinc, [0.2, -0.8, -0.38])]);
}
export function parking_brake_cable(p: P): BufferGeometry {
  const pts = ppts(p, 'pts', [[0, -0.3, -0.5], [0.3, -0.8, -0.8], [1.4, -1.0, -1.4]]);
  return merge([tube(pts, 0.03, C.steel, 28, 6), tube(pts, 0.05, C.rubber, 28, 6), box(0.3, 0.06, 0.1, C.steel, [0, -0.3, -0.5], [0, 0, 0.5])]);
}

export const GENERATORS: Record<string, (p: P) => BufferGeometry> = {
  rotor, drum, backing_plate, caliper, caliper_piston, piston_seal, brake_pads, pad_wear_indicator, caliper_bracket, slide_pins, hub, wheel_stub,
  tone_ring, wheel_speed_sensor, brake_pedal, pushrod, brake_booster, master_cylinder, fluid_reservoir, proportioning_valve, abs_hcu, abs_ecu,
  brake_line, flex_hose, bleeder_screw, brake_light_switch, brake_fluid, brake_shoes, wheel_cylinder, return_springs, shoe_adjuster, parking_brake_cable,
};
export type { V3 };
