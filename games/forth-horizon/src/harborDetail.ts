import * as THREE from 'three';
import { DetailBatch } from './detailBatch';

interface HarborDetailPlan {
  heading: number; quays: { pts: number[][] }[];
  sheds: { c: number[]; w: number; d: number }[];
  tanks: number[][]; cranes: { c: number[]; dir: number }[];
  rail: number[][][];
}

/** Add small-scale construction to the existing plan; retain its shoreline and berths. */
export function harborDetail(plan: HarborDetailPlan, ground: (x: number, z: number) => number): THREE.Group {
  const kit = new DetailBatch('Ironport harbor hardware');
  const dark = 0x303a40, zinc = 0x9da6aa, rust = 0x795b42, yellow = 0xc8a44b;
  const frame = (x: number, y: number, z: number, heading: number): void => kit.frame(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(-heading)));
  for (const quay of plan.quays) {
    let carry = 0;
    for (let i = 1; i < quay.pts.length; i++) {
      const a = quay.pts[i - 1], b = quay.pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.001) continue;
      const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
      for (let t = carry; t < length; t += 12) {
        const x = a[0] + ux * t, z = a[1] + uz * t;
        const y = Math.max(ground(x, z), 1.6) + 0.5;
        frame(x, y, z, Math.atan2(uz, ux));
        // Rubber D-fender on each face: shoreline contour winding need not be known.
        for (const side of [-1, 1]) {
          kit.box(0, -1.25, side * 0.22, 0.55, 1.8, 0.45, 0x202624);
          kit.box(0, -0.5, side * 0.48, 0.75, 0.14, 0.08, dark, 1);
          for (const dx of [-0.22, 0.22]) kit.box(dx, -0.5, side * 0.54, 0.05, 0.07, 0.04, zinc, 1);
        }
        // Quay ladder drops below water level, handgrips continue above coping.
        for (const sx of [-0.3, 0.3]) kit.beam([sx, -y - 1, 0], [sx, 0.85, 0], 0.055, rust);
        for (let step = -y - 0.8; step < 0.3; step += 0.3) kit.beam([-0.3, step, 0], [0.3, step, 0], 0.04, zinc);
        kit.box(0, 0.12, 0, 0.85, 0.24, 0.65, dark, 1);
        kit.box(0, 0.4, 0, 0.22, 0.5, 0.22, dark, 1);
        kit.box(0, 0.66, 0, 0.65, 0.16, 0.26, dark, 1);
      }
      carry = ((carry - length) % 12 + 12) % 12;
    }
  }
  for (const shed of plan.sheds) {
    frame(shed.c[0], ground(shed.c[0], shed.c[1]), shed.c[1], plan.heading);
    for (const side of [-1, 1]) {
      const z = side * (shed.d / 2 + 0.13);
      for (let x = -shed.w / 2 + 4; x < shed.w / 2 - 2; x += 8) {
        kit.box(x, 2, z, 4, 4, 0.15, 0x43545e, 1);
        for (let y = 0.3; y < 4; y += 0.23) kit.box(x, y, z + side * 0.09, 3.85, 0.035, 0.045, zinc, 1);
        kit.box(x, 0.3, z + side * 1.1, 4.5, 0.6, 2, 0x656963);
        kit.box(x, 4.9, z + side * 0.2, 0.6, 0.18, 0.35, 0xe0c798);
        for (const dx of [-2.1, 2.1]) kit.box(x + dx, 1.0, z + side * 1.6, 0.16, 1.8, 0.16, yellow, 1);
      }
      kit.box(0, 11.1, z, shed.w, 0.18, 0.25, zinc, 1);
      for (const x of [-shed.w / 2 + 0.3, shed.w / 2 - 0.3]) kit.box(x, 5.5, z, 0.13, 11, 0.13, zinc, 1);
    }
    for (let x = -shed.w / 2 + 6; x < shed.w / 2; x += 18) {
      kit.box(x, 11.85, 0, 2.6, 1.0, 1.8, zinc, 1);
      for (let v = -0.7; v <= 0.7; v += 0.2) kit.box(x, 12.38, v, 2.4, 0.025, 0.05, dark, 1);
    }
  }
  for (const tank of plan.tanks) {
    frame(tank[0], ground(tank[0], tank[1]), tank[1], plan.heading);
    for (let i = 0; i < 40; i++) {
      const a = i * Math.PI / 20, b = (i + 1) * Math.PI / 20;
      const x = Math.cos(a) * 8.2, z = Math.sin(a) * 8.2;
      if (i % 2 === 0) kit.beam([x, 16, z], [x, 17.1, z], 0.045, zinc);
      for (const y of [16.55, 17.1]) kit.beam([x, y, z], [Math.cos(b) * 8.2, y, Math.sin(b) * 8.2], 0.04, zinc);
    }
    for (const x of [-0.28, 0.28]) kit.beam([x, 0, 9.15], [x, 17.15, 9.15], 0.055, zinc);
    for (let y = 0.3; y < 16.8; y += 0.3) kit.beam([-0.28, y, 9.15], [0.28, y, 9.15], 0.035, zinc);
    kit.box(0, 1.2, 10.5, 0.25, 0.25, 2.8, rust, 1);
    kit.box(0, 1.2, 11.8, 1.2, 0.6, 0.6, dark, 1);
  }
  for (const crane of plan.cranes) {
    frame(crane.c[0], ground(crane.c[0], crane.c[1]), crane.c[1], plan.heading + (crane.dir < 0 ? Math.PI : 0));
    for (const x of [-14, 14]) {
      kit.beam([x, 3, -14], [x, 36, 14], 0.35, dark);
      kit.beam([x, 3, 14], [x, 36, -14], 0.35, dark);
      for (const z of [-14, 14]) { kit.box(x, 1.6, z, 3.2, 2.4, 5.5, dark, 1); for (const dz of [-1.8, 1.8]) kit.box(x, 0.6, z + dz, 3.5, 1.2, 0.5, 0x20252a, 1); }
    }
    for (let z = -35; z < 58; z += 6) {
      for (const x of [-2.1, 2.1]) { kit.beam([x, 44, z], [x, 48, z + 3], 0.16, dark); kit.beam([x, 48, z + 3], [x, 44, z + 6], 0.16, dark); }
      kit.beam([-2.1, 48, z + 3], [2.1, 48, z + 3], 0.13, zinc);
    }
    for (const x of [-1.7, 1.7]) { kit.beam([x, 44, 22], [x, 17, 22], 0.04, dark); kit.beam([0, 65, -4], [x, 47, 58], 0.065, zinc); }
    kit.box(0, 17, 22, 3, 0.7, 12.2, yellow, 1);
  }
  // True twin rails at standard gauge, sleepers following ground, rather than one central stripe.
  kit.frame(new THREE.Matrix4());
  for (const track of plan.rail) {
    if (track.length < 2) continue;
    const a = track[0], b = track[track.length - 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.01) continue;
    const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
    for (let t = 0; t < length; t += 1.5) {
      const x = a[0] + ux * t, z = a[1] + uz * t, y = ground(x, z) + 0.5;
      kit.beam([x - uz * 1.2, y, z + ux * 1.2], [x + uz * 1.2, y, z - ux * 1.2], 0.15, 0x675a48, 0);
      const next = Math.min(t + 1.5, length), bx = a[0] + ux * next, bz = a[1] + uz * next;
      for (const s of [-1, 1]) kit.beam([x - uz * s * 0.7175, y + 0.14, z + ux * s * 0.7175], [bx - uz * s * 0.7175, ground(bx, bz) + 0.64, bz + ux * s * 0.7175], 0.075, zinc);
    }
  }
  return kit.build();
}
