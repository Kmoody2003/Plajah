import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Power: the power plant (turbine halls, stacks, cooling towers, fuel tanks, a switchyard), the substations and the lattice pylons and wires that join them
 * (planned in tools/plan_utilities.py, data in region/utilities.json). Pylons are one merged lattice geometry, instanced; wires are one line mesh with sag.
 */
export interface UtilitiesData {
  platform: { poly: number[][]; y: number };
  plant: {
    halls: { x: number; z: number; w: number; d: number; h: number; rot: number }[]; stacks: { x: number; z: number; h: number; r: number }[];
    cooling: { x: number; z: number; r: number; h: number }[]; tanks: { x: number; z: number; r: number; h: number }[];
    switchyard: { x: number; z: number; w: number; d: number }; admin: { x: number; z: number };
  };
  substations: { name: string; x: number; z: number; rot: number }[];
  pylons: { x: number; z: number; rot: number; h: number }[];
  spans: number[][];
}

function latticePylon(h: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0): void => { g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); parts.push(g); };
  const base = h * 0.17, top = h * 0.035;
  // four legs, tapering, as slim boxes along the slope
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const len = Math.hypot(h * 0.78, base - top);
    const g = new THREE.BoxGeometry(0.35, len, 0.35);
    const tx = (base - top) / (h * 0.78);
    // lean toward the axis: rotate about z for x legs, x for z legs
    g.rotateZ(-sx * Math.atan(tx)); g.rotateX(sz * Math.atan(tx));
    g.translate(sx * (base + top) / 2, h * 0.39, sz * (base + top) / 2);
    parts.push(g);
  }
  // horizontal rings and cross braces on each of five stages
  for (let k = 0; k <= 5; k++) {
    const y = k * h * 0.78 / 5 + 0.5, w = base + (top - base) * (k / 5);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(w * 2, 0.2, 0.2), 0, y, s * w); add(new THREE.BoxGeometry(0.2, 0.2, w * 2), s * w, y, 0); }
    if (k < 5) { const w2 = base + (top - base) * ((k + 1) / 5), y2 = (k + 1) * h * 0.78 / 5 + 0.5, len = Math.hypot(w + w2, y2 - y); const ang = Math.atan2(w + w2, y2 - y); add(new THREE.BoxGeometry(0.15, len, 0.15), 0, (y + y2) / 2, (w + w2) / 2, 0, 0); void ang; }
  }
  // the head: a narrow mast and three crossarms carrying the three phases
  add(new THREE.BoxGeometry(0.9, h * 0.22, 0.9), 0, h * 0.78 + h * 0.11, 0);
  for (const [k, w] of [[0.70, 6.2], [0.82, 7.4], [0.94, 6.2]] as [number, number][]) add(new THREE.BoxGeometry(w * 2, 0.35, 0.35), 0, h * k, 0);
  return mergeGeometries(parts, false)!;
}

export function buildUtilities(d: UtilitiesData, ground: (x: number, z: number) => number): { group: THREE.Group } {
  const group = new THREE.Group(); group.name = 'utilities';
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c949b, roughness: 0.6, metalness: 0.5 });
  const conc = new THREE.MeshStandardMaterial({ color: 0xa3a099, roughness: 0.93 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.85 });
  const y0 = d.platform.y;
  const box = (w: number, h: number, dp: number, mat: THREE.Material, x: number, y: number, z: number, rot = 0): THREE.Mesh => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat); m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; group.add(m); return m; };

  // ---- the plant ----
  const P = d.plant;
  for (const h of P.halls) { box(h.w, h.h, h.d, new THREE.MeshStandardMaterial({ color: 0xb8b9b4, roughness: 0.85 }), h.x, y0 + h.h / 2, h.z, h.rot); box(h.w + 2, 2, h.d + 2, conc, h.x, y0 + h.h + 1, h.z, h.rot); }
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc8372b, roughness: 0.7 }), white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 });
  for (const s of P.stacks) {
    const bands = 6;
    for (let i = 0; i < bands; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r * (1 - (i + 1) / bands * 0.35), s.r * (1 - i / bands * 0.35), s.h / bands, 18), i % 2 ? stripe : white); m.position.set(s.x, y0 + s.h / bands * (i + 0.5), s.z); m.castShadow = true; group.add(m); }
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.35 })); smoke.position.set(s.x + 8, y0 + s.h + 6, s.z); smoke.scale.set(1.8, 1, 1.2); group.add(smoke);
  }
  // hyperbolic cooling towers: a lathe profile
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; prof.push(new THREE.Vector2(1 + 0.55 * Math.pow(Math.abs(t - 0.62) * 2, 1.7) * (t < 0.62 ? 1 : 1.15) - 0.1, t)); }
  for (const c of P.cooling) {
    const geo = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x * c.r, p.y * c.h)), 36);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb9b8b2, roughness: 0.9, side: THREE.DoubleSide })); m.position.set(c.x, y0, c.z); m.castShadow = m.receiveShadow = true; group.add(m);
    const steam = new THREE.Mesh(new THREE.SphereGeometry(c.r * 0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })); steam.position.set(c.x, y0 + c.h + c.r * 0.5, c.z); steam.scale.set(1, 1.2, 1); group.add(steam);
  }
  for (const t of P.tanks) { const m = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, t.h, 24), new THREE.MeshStandardMaterial({ color: 0xd9dbd8, roughness: 0.55, metalness: 0.3 })); m.position.set(t.x, y0 + t.h / 2, t.z); m.castShadow = true; group.add(m); }
  box(40, 12, 24, new THREE.MeshStandardMaterial({ color: 0xcfc9bd, roughness: 0.85 }), P.admin.x, y0 + 6, P.admin.z, 0);
  // switchyard: a grid of transformers with a gantry over each row
  const swy = (cx: number, cz: number, w: number, dp: number, rows: number): void => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, dp), new THREE.MeshStandardMaterial({ color: 0x8f8d86, roughness: 1 })); g.position.set(cx, ground(cx, cz) + 0.1, cz); group.add(g);
    for (let r = 0; r < rows; r++) for (let c = 0; c < 4; c++) {
      const x = cx - w / 2 + 12 + c * (w - 24) / 3, z = cz - dp / 2 + 10 + r * (dp - 20) / Math.max(1, rows - 1);
      const y = ground(x, z); box(6, 5, 4, dark, x, y + 2.7, z); box(1, 3, 1, steel, x - 1.5, y + 6.5, z); box(1, 3, 1, steel, x + 1.5, y + 6.5, z);
    }
    for (let r = 0; r < rows; r++) { const z = cz - dp / 2 + 10 + r * (dp - 20) / Math.max(1, rows - 1), y = ground(cx, z); box(w - 8, 0.4, 0.4, steel, cx, y + 11, z); for (const s of [-1, 1]) box(0.5, 11, 0.5, steel, cx + s * (w / 2 - 4), y + 5.5, z); }
  };
  swy(P.switchyard.x, P.switchyard.z, P.switchyard.w, P.switchyard.d, 2);
  // ---- substations ----
  for (const s of d.substations) { swy(s.x, s.z, 44, 34, 2); const f = new THREE.Mesh(new THREE.BoxGeometry(46, 2.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x777b7e, roughness: 0.7, transparent: true, opacity: 0.5 })); for (const [dx, dz, rot] of [[0, 17, 0], [0, -17, 0], [23, 0, Math.PI / 2], [-23, 0, Math.PI / 2]] as [number, number, number][]) { const m = f.clone(); m.position.set(s.x + dx, ground(s.x, s.z) + 1.3, s.z + dz); m.rotation.y = rot; if (rot) m.scale.x = 34 / 46; group.add(m); } }

  // ---- pylons and wires ----
  const geoNormal = latticePylon(38), geoTall = latticePylon(105);
  const normal = d.pylons.filter((p) => p.h < 60), tall = d.pylons.filter((p) => p.h >= 60);
  const mk = (list: typeof d.pylons, geo: THREE.BufferGeometry): void => {
    const im = new THREE.InstancedMesh(geo, steel, list.length || 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    list.forEach((t, i) => { q.setFromAxisAngle(up, t.rot); p.set(t.x, ground(t.x, t.z) - 0.5, t.z); im.setMatrixAt(i, m4.compose(p, q, sc)); });
    im.count = list.length; im.castShadow = true; group.add(im);
  };
  mk(normal, geoNormal); mk(tall, geoTall);
  const wires: number[] = [];
  const armY = (h: number): number[] => [h * 0.70, h * 0.82, h * 0.94];
  const armW = [6.2, 7.4, 6.2];
  for (const [u, v] of d.spans) {
    const A = d.pylons[u], B = d.pylons[v], L = Math.hypot(B.x - A.x, B.z - A.z);
    const ax = Math.cos(A.rot), az = -Math.sin(A.rot), bx = Math.cos(B.rot), bz = -Math.sin(B.rot);     // the crossarm direction (perpendicular to the line)
    const ya = ground(A.x, A.z), yb = ground(B.x, B.z), ha = armY(A.h), hb = armY(B.h);
    for (let s = 0; s < 3; s++) for (const side of [-1, 1]) {
      let px = A.x + ax * armW[s] * side, pz = A.z + az * armW[s] * side, py = ya + ha[s];
      const N = 8;
      for (let i = 1; i <= N; i++) {
        const t = i / N, qx = A.x + (B.x - A.x) * t + (ax + (bx - ax) * t) * armW[s] * side, qz = A.z + (B.z - A.z) * t + (az + (bz - az) * t) * armW[s] * side;
        const qy = ya + ha[s] + ((yb + hb[s]) - (ya + ha[s])) * t - Math.sin(Math.PI * t) * Math.min(14, L * 0.04);
        wires.push(px, py, pz, qx, qy, qz); px = qx; pz = qz; py = qy;
      }
    }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1c1f })));
  return { group };
}
