// Shared architectural builders for levels (stairs with glide ramps, gothic walls, crenellated walls, towers, scaffolds).
import * as THREE from 'three/webgpu';
import type { StaticKit } from './geom';

export function builders(kit: StaticKit) {
  const invisible = new THREE.MeshBasicNodeMaterial({ visible: false });

  /** Invisible collision ramp from A to B; its top surface passes through both points. */
  const ramp = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number) => {
    const h = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const g = new THREE.BoxGeometry(width, 0.2, Math.hypot(h, by - ay));
    kit.place(g, (ax + bx) / 2, (ay + by) / 2 - 0.1, (az + bz) / 2, yaw, -Math.atan2(by - ay, h));
    kit.add(invisible, g, { shadow: false });
  };

  /** A flight of steps from (x0,y0,z0) climbing along yaw to y1, solid underneath, with a glide ramp through the noses. */
  const flight = (mat: THREE.Material, x0: number, y0: number, z0: number, yaw: number, y1: number, width: number, rise = 0.25, run = 0.4, cheeks = true) => {
    const steps = Math.max(1, Math.round((y1 - y0) / rise)), r = (y1 - y0) / steps;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    for (let i = 0; i < steps; i++) {
      const top = y0 + (i + 1) * r, d = run * i + run / 2;
      kit.box(mat, width, top - y0 + 1.5, run, x0 + dx * d, (top + y0 - 1.5) / 2, z0 + dz * d, yaw, { tpm: 0.5 });
    }
    ramp(x0, y0 + r, z0, x0 + dx * run * (steps - 0.5), y1, z0 + dz * run * (steps - 0.5), width);
    if (!cheeks) return;
    for (const s of [-1, 1]) {
      const cx = x0 + dx * (run * steps) / 2 + dz * s * (width / 2 + 0.3), cz = z0 + dz * (run * steps) / 2 - dx * s * (width / 2 + 0.3);
      const len = run * steps;
      const g = new THREE.BoxGeometry(0.6, 0.9, Math.hypot(len, y1 - y0) + 0.4);
      kit.place(g, cx, (y0 + y1) / 2 + 0.45, cz, yaw, -Math.atan2(y1 - y0, len));
      kit.add(mat, g, { tpm: 0.5 });
    }
  };

  /** Steel open-tread stair (scaffold style) with handrails. */
  const steelStair = (mat: THREE.Material, x0: number, y0: number, z0: number, yaw: number, y1: number, width = 1.6) => {
    const steps = Math.max(1, Math.round((y1 - y0) / 0.24)), r = (y1 - y0) / steps, run = 0.3;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    for (let i = 0; i < steps; i++) kit.box(mat, width, 0.08, run + 0.02, x0 + dx * (run * i + run / 2), y0 + (i + 1) * r, z0 + dz * (run * i + run / 2), yaw, { tpm: 1, shadow: false });
    const len = run * steps;
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.08, 0.08, Math.hypot(len, y1 - y0));
      kit.place(g, x0 + dx * len / 2 + dz * s * width / 2, (y0 + y1) / 2 + 1.0, z0 + dz * len / 2 - dx * s * width / 2, yaw, -Math.atan2(y1 - y0, len));
      kit.add(mat, g, { tpm: 1, shadow: false, solid: false });
      const stringer = new THREE.BoxGeometry(0.12, 0.3, Math.hypot(len, y1 - y0));
      kit.place(stringer, x0 + dx * len / 2 + dz * s * width / 2, (y0 + y1) / 2, z0 + dz * len / 2 - dx * s * width / 2, yaw, -Math.atan2(y1 - y0, len));
      kit.add(mat, stringer, { tpm: 1, shadow: false });
    }
    ramp(x0, y0 + r, z0, x0 + dx * run * (steps - 0.5), y1, z0 + dz * run * (steps - 0.5), width);
  };

  /** Gothic wall with pointed-arch openings (bays) between piers. */
  const gothicWall = (mat: THREE.Material, cx: number, cz: number, yaw: number, len: number, h: number, bays: number, y0 = 0, thick = 1.2, openTo = 0.62) => {
    const dx = Math.cos(yaw), dz = -Math.sin(yaw), bay = len / bays;
    for (let i = 0; i <= bays; i++) kit.box(mat, 1.3, h, thick + 0.5, cx + dx * (-len / 2 + i * bay), y0 + h / 2, cz + dz * (-len / 2 + i * bay), yaw, { tpm: 0.5 });
    for (let i = 0; i < bays; i++) {
      const o = -len / 2 + (i + 0.5) * bay, w = bay - 1.3, archTop = h * openTo;
      kit.box(mat, w, 1.0, thick, cx + dx * o, y0 + 0.5, cz + dz * o, yaw, { tpm: 0.5 });
      kit.box(mat, w, h - archTop - w * 0.35, thick, cx + dx * o, y0 + (h + archTop + w * 0.35) / 2, cz + dz * o, yaw, { tpm: 0.5 });
      for (let j = 0; j < 7; j++) {
        const ang = Math.PI * (j + 0.5) / 7, ox = Math.cos(ang) * w / 2, oy = Math.pow(Math.sin(ang), 0.7) * w * 0.38;
        kit.box(mat, w / 7 + 0.25, 0.55, thick, cx + dx * (o + ox), y0 + archTop + oy, cz + dz * (o + ox), yaw, { tpm: 0.5, rz: -Math.cos(ang) * 0.6 });
      }
    }
    kit.box(mat, len + 1.2, 0.6, thick + 0.7, cx, y0 + h + 0.3, cz, yaw, { tpm: 0.5 });
  };

  /** Solid curtain wall with merlons on top. */
  const curtain = (mat: THREE.Material, cx: number, cz: number, yaw: number, len: number, h: number, y0 = 0, thick = 2.0) => {
    kit.box(mat, len, h, thick, cx, y0 + h / 2, cz, yaw, { tpm: 0.4 });
    const dx = Math.cos(yaw), dz = -Math.sin(yaw), n = Math.floor(len / 1.8);
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + 0.9 + i * 1.8;
      if (i % 2 === 0) kit.box(mat, 0.95, 0.9, thick + 0.1, cx + dx * o, y0 + h + 0.45, cz + dz * o, yaw, { tpm: 0.6 });
    }
  };

  /** Square tower with crenellated crown (or spiked crown). */
  const tower = (mat: THREE.Material, x: number, z: number, w: number, h: number, y0 = 0, spikes = false) => {
    kit.box(mat, w, h, w, x, y0 + h / 2, z, 0, { tpm: 0.4 });
    kit.box(mat, w + 0.8, 0.6, w + 0.8, x, y0 + h + 0.3, z, 0, { tpm: 0.5 });
    const n = Math.max(2, Math.round(w / 1.6));
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const o = -w / 2 + (i + 0.5) * (w / n);
      if (spikes) {
        for (const [px, pz] of [[x + o, z + s * w / 2], [x + s * w / 2, z + o]]) {
          const c = new THREE.ConeGeometry(0.35, 2.4 + (i % 2) * 1.2, 5); kit.place(c, px, y0 + h + 1.5, pz); kit.add(mat, c, { tpm: 0.6, solid: false });
        }
      } else if (i % 2 === 0) {
        kit.box(mat, w / n * 0.8, 1.0, 0.7, x + o, y0 + h + 1.1, z + s * (w / 2 + 0.05), 0, { tpm: 0.6 });
        kit.box(mat, 0.7, 1.0, w / n * 0.8, x + s * (w / 2 + 0.05), y0 + h + 1.1, z + o, 0, { tpm: 0.6 });
      }
    }
  };

  return { invisible, ramp, flight, steelStair, gothicWall, curtain, tower };
}
