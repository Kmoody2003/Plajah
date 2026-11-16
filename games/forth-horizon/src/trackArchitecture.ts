import * as THREE from 'three';
import { DetailBatch } from './detailBatch';

/** Modular steel grandstand with actual seats, aisles, stairs, handrails and roof trusses. */
export function detailedStand(length: number, rows: number): THREE.Group {
  const kit = new DetailBatch('Ironport grandstand');
  const steel = 0x404952, zinc = 0x9aa4aa, concrete = 0x969893;
  const depth = rows * 1.05 + 1.7, roof = rows * 0.78 + 4.3;
  const aisles = [-length / 3, 0, length / 3];
  for (let row = 0; row < rows; row++) {
    const y = 0.7 + row * 0.78, z = 0.6 + row * 1.05;
    kit.box(0, y - 0.14, z, length, 0.28, 1.05, concrete);
    kit.beam([-length / 2, y - 0.45, z], [length / 2, y - 0.45, z], 0.16, steel);
    for (let x = -length / 2 + 0.5, seat = 0; x < length / 2 - 0.3; x += 0.56, seat++) {
      if (aisles.some((a) => Math.abs(x - a) < 0.8)) continue;
      const color = [0x243e60, 0x344e6b, 0x607283, 0xb3b8b4][(seat + row * 3) % 4];
      kit.box(x, y + 0.13, z - 0.14, 0.46, 0.09, 0.43, color);
      kit.box(x, y + 0.42, z + 0.05, 0.46, 0.48, 0.07, color);
      kit.box(x, y - 0.02, z, 0.05, 0.32, 0.05, zinc, 1);
    }
    for (const x of aisles) {
      kit.box(x, y - 0.33, z - 0.5, 1.3, 0.25, 0.48, concrete);
      kit.box(x, y - 0.18, z - 0.75, 1.3, 0.035, 0.07, 0xc7b761);
      for (const sign of [-1, 1]) {
        kit.beam([x + sign * 0.67, y, z], [x + sign * 0.67, y + 1, z], 0.045, zinc);
        if (row < rows - 1) kit.beam([x + sign * 0.67, y + 1, z], [x + sign * 0.67, y + 1.78, z + 1.05], 0.045, zinc);
      }
    }
  }
  for (let x = -length / 2; x <= length / 2 + 0.01; x += length / Math.ceil(length / 6)) {
    for (const z of [0, depth]) kit.beam([x, 0, z], [x, roof, z], 0.17, steel);
    kit.beam([x, 0.25, 0], [x, rows * 0.78 + 0.25, depth - 1], 0.16, steel);
    kit.beam([x, roof - 0.7, -0.9], [x, roof - 0.7, depth + 0.5], 0.1, zinc);
    kit.beam([x, roof, -0.9], [x, roof, depth + 0.5], 0.1, zinc);
    for (let z = -0.9; z < depth; z += 1.3) {
      kit.beam([x, roof - 0.7, z], [x, roof, Math.min(z + 1.3, depth + 0.5)], 0.055, zinc);
      kit.beam([x, roof, z], [x, roof - 0.7, Math.min(z + 1.3, depth + 0.5)], 0.055, zinc);
    }
    kit.beam([x, rows * 0.78 + 0.5, depth], [x, rows * 0.78 + 1.6, depth], 0.05, zinc);
    if (x < length / 2 - 0.1) kit.beam([x, 0.4, depth], [Math.min(x + 6, length / 2), rows * 0.78, depth], 0.09, steel);
  }
  for (let x = -length / 2; x < length / 2; x += 1) kit.box(x + 0.5, roof + 0.08, depth / 2 - 0.2, 0.98, 0.11, depth + 1.5, 0xb9c0c2, 1);
  for (const y of [rows * 0.78 + 1, rows * 0.78 + 1.6]) kit.beam([-length / 2, y, depth], [length / 2, y, depth], 0.05, zinc);
  for (const side of [-1, 1]) {
    const x = side * length / 2;
    kit.beam([x, 1.6, 0], [x, rows * 0.78 + 1.6, depth - 1.5], 0.05, zinc);
    kit.beam([x, 0.1, depth + 0.3], [x, roof + 0.05, depth + 0.3], 0.09, steel);
  }
  kit.box(0, roof - 0.15, depth + 0.35, length + 0.4, 0.18, 0.25, zinc, 1);
  return kit.build();
}

/** One open-front pit garage: no painted-on door pretending to be a room. */
export function pitGarage(index: number): THREE.Group {
  const kit = new DetailBatch('Pit garage ' + (index + 1));
  const wall = 0xc2c2b9, steel = 0x444f58, dark = 0x202933;
  kit.box(0, 0.08, 0, 6.1, 0.16, 8, 0x8b8e8e);
  kit.box(0, 2.1, -3.9, 6.1, 4.2, 0.2, wall);
  for (const x of [-2.96, 2.96]) kit.box(x, 2.1, 0, 0.18, 4.2, 8, wall);
  for (const x of [-2.65, 2.65]) kit.box(x, 2.1, 3.93, 0.16, 4.2, 0.22, steel, 1);
  kit.box(0, 3.85, 3.95, 5.4, 0.7, 0.2, dark);
  for (let y = 3.6; y < 4.15; y += 0.12) kit.box(0, y, 4.08, 5.2, 0.05, 0.05, 0x9aa5a9, 1);
  kit.box(0, 4.25, 0, 6.25, 0.22, 8.2, 0xaeb6b9, 1);
  kit.box(0, 4.25, 4.85, 6.25, 0.12, 2, 0xaeb6b9, 1);
  for (const x of [-2.65, 2.65]) kit.beam([x, 3.4, 3.85], [x, 4.16, 5.7], 0.08, steel);
  kit.box(0, 4.13, 5.85, 6.25, 0.15, 0.16, steel, 1);
  kit.box(2.8, 2.1, 3.75, 0.08, 4.1, 0.08, steel, 1);
  // Service equipment, worktop, cabinets and wheel rack inside the garage.
  kit.box(0, 1.0, -3.5, 4.6, 0.9, 0.7, 0x4d6879, 1);
  kit.box(0, 1.5, -3.5, 4.8, 0.08, 0.8, 0x9da2a2, 1);
  for (let x = -1.8; x <= 1.8; x += 0.6) kit.box(x, 1.1, -3.12, 0.03, 0.04, 0.1, 0xc6cbca, 1);
  kit.box(-2.3, 1, 1, 0.65, 1.6, 1.2, index % 2 ? 0xa43525 : 0x285a78, 1);
  for (const z of [-2.5, 1.6]) kit.box(0, 4.1, z, 3.2, 0.07, 0.18, 0xe3e5d5);
  kit.box(1.1, 4.65, -1.3, 1.8, 0.6, 1.4, 0x6b767b, 1);
  for (let z = -1.8; z < -0.7; z += 0.13) kit.box(1.1, 4.97, z, 1.65, 0.025, 0.025, dark, 1);
  return kit.build();
}
