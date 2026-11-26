import * as THREE from 'three';
import { GRID } from './grid';
import { quayCrane, shippingContainerMaterials } from './library/industrial';

/**
 * The Ironworks port district's ground and props (planned in tools/plan_port_district.py, data in region/port_district.json):
 * the bluff is cut down to a level platform with graded slopes, then the quay, two piers on piles, gantry cranes, ships alongside, container stacks, a tank farm with bunds, a pipe rack,
 * a flare stack and a fence are built on it. Everything is instanced or merged: a few dozen draw calls for a whole port.
 */
export interface PortData {
  platform: { poly: number[][]; y: number };
  piers: { x: number; z: number; len: number; w: number }[];
  ships: { x: number; z: number; len: number; w: number; rot: number; color: number }[];
  cranes: { x: number; z: number; rot: number }[];
  containers: number[][];                         // x, z, columns (length-wise), rows
  tanks: { x: number; z: number; r: number; h: number; roof: string }[];
  pipeRack: number[][];
  flare: number[];
  fence: number[][];
}

function inPoly(poly: number[][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function distToPoly(poly: number[][], x: number, z: number): number {
  let d = 1e18;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return d;
}
export function inPort(p: PortData | null, x: number, z: number, margin = 0): boolean {
  if (!p) return false;
  return inPoly(p.platform.poly, x, z) || (margin > 0 && distToPoly(p.platform.poly, x, z) < margin);
}

/** cut (or fill) the ground to the platform: flat inside the outline, sloping 1:2.2 back up to the old ground outside it, never raised above the old water-side ground */
export function carvePlatform(heights: Float32Array, W: number, H: number, mpp: number, p: PortData): void {
  const poly = p.platform.poly, y = p.platform.y;
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (const q of poly) { mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mnz = Math.min(mnz, q[1]); mxz = Math.max(mxz, q[1]); }
  const R = 90;
  const x0 = Math.max(0, Math.floor(((mnx - R) - GRID.ox) / mpp + W / 2)), x1 = Math.min(W - 1, Math.ceil(((mxx + R) - GRID.ox) / mpp + W / 2));
  const z0 = Math.max(0, Math.floor(((mnz - R) - GRID.oz) / mpp + H / 2)), z1 = Math.min(H - 1, Math.ceil(((mxz + R) - GRID.oz) / mpp + H / 2));
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
    const x = (((ix - W / 2) * mpp) + GRID.ox), z = (((iz - H / 2) * mpp) + GRID.oz), k = iz * W + ix, old = heights[k];
    if (inPoly(poly, x, z)) { heights[k] = y; continue; }
    if (old <= y) continue;                                                    // lower ground outside (the water side) stays
    const d = distToPoly(poly, x, z), reach = Math.min(R, Math.max(12, (old - y) * 2.2));
    if (d >= reach) continue;
    const t = d / reach, w = 1 - t * t * (3 - 2 * t);
    heights[k] = old * (1 - w) + (y + (old - y) * Math.min(1, d / reach)) * w;
  }
}

function rng(seed: number): () => number { let s = seed | 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export interface PortSolid { x: number; z: number; hw: number; hd: number; rot: number; kind: 'container' | 'pillar' }
export interface Port { group: THREE.Group; solids: PortSolid[] }

export function buildPortDistrict(p: PortData, o: { waterY: number }): Port {
  const group = new THREE.Group(); group.name = 'port-district';
  const solids: PortSolid[] = [];
  const r = rng(77), y0 = p.platform.y;
  const conc = new THREE.MeshStandardMaterial({ color: 0x9c9a94, roughness: 0.93 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.55, metalness: 0.5 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3();
  const place = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rot: number, sx = 1, sy = 1, sz = 1, col?: THREE.Color): void => {
    q.setFromAxisAngle(up, rot); sc.set(sx, sy, sz); tp.set(x, y, z); im.setMatrixAt(i, m4.compose(tp, q, sc)); if (col) im.setColorAt(i, col);
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rot = 0, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };

  // ---- piers: a concrete deck on piles over the river, bollards along the edge ----
  const pileGeo = new THREE.CylinderGeometry(0.55, 0.55, 12, 8);
  const piles = new THREE.InstancedMesh(pileGeo, dark, 600);
  let pk = 0;
  for (const pr of p.piers) {
    box(pr.len, 1.4, pr.w, conc, pr.x + pr.len / 2, y0 - 0.7, pr.z, 0);
    for (let x = 4; x < pr.len; x += 8) for (const s of [-1, 1]) if (pk < 600) place(piles, pk++, pr.x + x, y0 - 6.5, pr.z + s * (pr.w / 2 - 1.2), 0);
    for (let x = 6; x < pr.len; x += 14) for (const s of [-1, 1]) box(0.5, 0.6, 0.5, steel, pr.x + x, y0 + 0.3, pr.z + s * (pr.w / 2 - 0.6), 0);
  }
  piles.count = pk; group.add(piles);

  // ---- ships alongside (sculpted tapered freighter hulls, red boot-top, bridge windows, radar mast, funnel & ISO containers) ----
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x7a1e18, roughness: 0.72, metalness: 0.12 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x454a50, roughness: 0.85, metalness: 0.15 });
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xeaece8, roughness: 0.68, metalness: 0.08 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101c28, roughness: 0.12, metalness: 0.65 });
  const funnelMat = new THREE.MeshStandardMaterial({ color: 0xc83c24, roughness: 0.55, metalness: 0.25 });
  for (const sh of p.ships) {
    const g = new THREE.Group(); g.position.set(sh.x, 0, sh.z); g.rotation.y = sh.rot; group.add(g);
    const hull = new THREE.MeshStandardMaterial({ color: sh.color, roughness: 0.68, metalness: 0.22 });
    const shape = new THREE.Shape();
    shape.moveTo(-sh.len * 0.5, -sh.w * 0.48);
    shape.lineTo(sh.len * 0.26, -sh.w * 0.5);
    shape.quadraticCurveTo(sh.len * 0.45, -sh.w * 0.36, sh.len * 0.5, 0);
    shape.quadraticCurveTo(sh.len * 0.45, sh.w * 0.36, sh.len * 0.26, sh.w * 0.5);
    shape.lineTo(-sh.len * 0.5, sh.w * 0.48);
    shape.closePath();
    const lowGeo = new THREE.ExtrudeGeometry(shape, { depth: 7.5, bevelEnabled: false }); lowGeo.rotateX(-Math.PI / 2);
    const lowHull = new THREE.Mesh(lowGeo, bootMat); lowHull.position.y = o.waterY - 5.5; lowHull.receiveShadow = true; g.add(lowHull);
    const upGeo = new THREE.ExtrudeGeometry(shape, { depth: 9.5, bevelEnabled: false }); upGeo.rotateX(-Math.PI / 2);
    const upHull = new THREE.Mesh(upGeo, hull); upHull.position.y = o.waterY + 2.0; upHull.castShadow = upHull.receiveShadow = true; g.add(upHull);
    box(sh.len * 0.90, 0.8, sh.w * 0.92, deckMat, -sh.len * 0.03, o.waterY + 11.7, 0, 0, g);
    // Multi-tier aft accommodation house + panoramic navigation bridge wings + radar mast + funnel
    const bx = -sh.len * 0.34;
    box(sh.len * 0.13, 18, sh.w * 0.78, bridgeMat, bx, o.waterY + 20.5, 0, 0, g);
    box(sh.len * 0.09, 4.2, sh.w * 1.04, bridgeMat, bx + 1.5, o.waterY + 29.5, 0, 0, g); // bridge wings
    box(sh.len * 0.092, 1.8, sh.w * 0.96, glassMat, bx + 2.0, o.waterY + 29.8, 0, 0, g); // panoramic windows
    box(4.8, 9.0, 5.2, funnelMat, bx - 4.5, o.waterY + 33.5, 0, 0, g);
    box(0.5, 11, 0.5, steel, bx + 1.5, o.waterY + 37, 0, 0, g); // radar mast
    const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.6, 2.44), shippingContainerMaterials(), 400);
    let ck = 0; const col = new THREE.Color();
    for (let ix = -5; ix <= 6; ix++) for (let iz = -4; iz <= 4; iz++) for (let l = 0; l < 4; l++) {
      if (r() < 0.16 || ck >= 400) continue;
      col.setHSL([0.6, 0.02, 0.08, 0.55, 0.0, 0.33][Math.floor(r() * 6)], 0.5 + r() * 0.3, 0.28 + r() * 0.2);
      place(cont, ck++, ix * 12.6 * 0.52 + sh.len * 0.06, o.waterY + 13.4 + l * 2.65, iz * 2.55, 0, 0.52, 1, 1, col);
    }
    cont.count = ck; cont.castShadow = true; g.add(cont);
  }

  // ---- Harbor Tugboats & Additional Coastal Container Feeder Vessel alongside piers ----
  const tugHullMat = new THREE.MeshStandardMaterial({ color: 0x1c242c, roughness: 0.65, metalness: 0.25 });
  const tugTrimMat = new THREE.MeshStandardMaterial({ color: 0xb82e24, roughness: 0.58, metalness: 0.18 });
  const tugFenderMat = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.92 });
  const addTugboat = (tx: number, tz: number, rotY: number): void => {
    const tg = new THREE.Group(); tg.position.set(tx, o.waterY, tz); tg.rotation.y = rotY; group.add(tg);
    box(24, 3.2, 8.6, bootMat, 0, -0.8, 0, 0, tg);
    box(25, 2.2, 9.0, tugHullMat, 0, 1.8, 0, 0, tg);
    box(25.4, 0.65, 9.4, tugFenderMat, 0, 2.3, 0, 0, tg); // heavy rubber fender belt
    box(11.5, 4.2, 6.4, tugTrimMat, -1.5, 4.8, 0, 0, tg);
    box(6.4, 3.6, 5.4, bridgeMat, 0.5, 8.4, 0, 0, tg);
    box(6.6, 1.4, 5.6, glassMat, 0.7, 9.0, 0, 0, tg);
    box(1.5, 4.8, 1.5, funnelMat, -4.2, 8.6, 0, 0, tg);
    box(0.35, 6.5, 0.35, steel, 0.8, 13.0, 0, 0, tg);
  };
  // Moor 3 harbor tugs assisting the container berths & piers
  if (p.piers.length > 0) {
    addTugboat(p.piers[0].x + p.piers[0].len + 26, p.piers[0].z - 32, 0.35);
    addTugboat(p.piers[0].x + p.piers[0].len * 0.45, p.piers[0].z - 28, 0.04);
  }
  if (p.piers.length > 1) {
    addTugboat(p.piers[1].x + p.piers[1].len + 24, p.piers[1].z - 30, -0.25);
  }

  // ---- Working Port Yard Equipment: RTG Straddle Cranes, Reach Stackers, Terminal Yard Tractors/Chassis & High-Mast Floodlights ----
  const rtgYellow = new THREE.MeshStandardMaterial({ color: 0xe0a21c, roughness: 0.45, metalness: 0.55 });
  const rtgRed = new THREE.MeshStandardMaterial({ color: 0xc23526, roughness: 0.48, metalness: 0.45 });
  const floodGlow = new THREE.MeshBasicMaterial({ color: 0xfff3cf });
  for (let bi = 0; bi < p.containers.length; bi++) {
    const b = p.containers[bi];
    const [bx, bz, cols, rows] = b;
    const spanW = rows * 2.6 + 5.0;
    const cx = bx + cols * 6.3 + (bi % 2 === 0 ? -4 : 4);
    const cz = bz + rows * 1.3 - 1.3;
    // Rubber-Tyred Gantry (RTG) Straddle Crane spanning the container rows!
    const rtg = new THREE.Group(); rtg.position.set(cx, y0, cz); group.add(rtg);
    for (const sx of [-4.5, 4.5]) {
      for (const sz of [-spanW * 0.5, spanW * 0.5]) {
        box(1.1, 16.5, 1.1, rtgYellow, sx, 8.25, sz, 0, rtg);
        box(2.8, 1.6, 1.6, dark, sx, 0.85, sz, 0, rtg); // heavy rubber bogie wheels
      }
      box(1.1, 1.3, spanW + 1.2, rtgRed, sx, 16.8, 0, 0, rtg);
    }
    box(9.8, 1.1, 1.4, rtgYellow, 0, 16.8, -spanW * 0.5, 0, rtg);
    box(9.8, 1.1, 1.4, rtgYellow, 0, 16.8, spanW * 0.5, 0, rtg);
    box(12.2, 0.9, 2.5, rtgRed, 0, 12.2, 0, 0, rtg); // spreader beam
    solids.push({ x: cx, z: cz - spanW * 0.5, hw: 5, hd: 1.5, rot: 0, kind: 'pillar' });
    solids.push({ x: cx, z: cz + spanW * 0.5, hw: 5, hd: 1.5, rot: 0, kind: 'pillar' });

    // Reach Stacker / Container Handler staged in the transfer lane beside each block
    const rx = bx - 12, rz = cz + (bi % 2 === 0 ? -4 : 4);
    const rs = new THREE.Group(); rs.position.set(rx, y0, rz); rs.rotation.y = bi % 2 === 0 ? 0.25 : -0.35; group.add(rs);
    box(6.8, 2.1, 3.2, rtgRed, 0, 1.6, 0, 0, rs);
    box(2.2, 1.8, 2.2, glassMat, 1.1, 3.1, 0, 0, rs);
    const boom = box(8.5, 0.85, 0.95, dark, 2.2, 4.4, 0, 0, rs);
    boom.rotation.z = 0.48;
    box(4.8, 0.45, 2.4, rtgYellow, 5.8, 6.4, 0, 0, rs); // top-lift spreader
    solids.push({ x: rx, z: rz, hw: 4.0, hd: 2.2, rot: rs.rotation.y, kind: 'pillar' });
  }
  // Terminal Yard Tractors & 40-ft Flatbed Container Chassis staged under the Ship-to-Shore cranes + High-Mast Yard Floodlights
  p.cranes.forEach((c, ci) => {
    const tx = c.x - 16, tz = c.z + (ci % 2 === 0 ? 8 : -8);
    box(2.5, 2.8, 3.4, rtgYellow, tx, y0 + 1.8, tz - 6.8, 0); // yard tractor cab
    box(2.5, 0.65, 13.0, dark, tx, y0 + 1.1, tz + 1.5, 0);    // 40-ft container chassis trailer
    box(2.45, 2.6, 12.2, ci % 2 === 0 ? funnelMat : glassMat, tx, y0 + 2.7, tz + 1.5, 0);
    // 30 m High-Mast Port Floodlight Tower behind each crane
    const fx = c.x - 42, fz = c.z;
    box(0.75, 30, 0.75, steel, fx, y0 + 15, fz, 0);
    box(4.8, 1.2, 1.4, floodGlow, fx, y0 + 30.2, fz, 0);
  });

  // ---- Plajah Industrial Library ship-to-shore quay cranes (A-frame, cables, machinery house, trolley cab!) ----
  p.cranes.forEach((c, ci) => {
    const g = quayCrane(ci + 1);
    g.position.set(c.x, y0, c.z);
    g.rotation.y = c.rot;
    group.add(g);
    solids.push({ x: c.x, z: c.z, hw: 8.5, hd: 14, rot: c.rot, kind: 'pillar' });
  });

  // ---- container yard: stacks in rows square to the quay ----
  {
    const total = p.containers.reduce((a, c) => a + c[2] * c[3] * 4, 0);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.6, 2.44), shippingContainerMaterials(), total);
    const palette = [0x1f4e8c, 0xa32c26, 0x2d6a3a, 0xc27a20, 0x6b6e72, 0x3a3a3c, 0x8c2f5b, 0x2c7a85, 0xd9d4c4];
    const col = new THREE.Color(); let k = 0;
    for (const b of p.containers) {
      const [bx, bz, cols, rows] = b;
      for (let cx = 0; cx < cols; cx++) for (let rz = 0; rz < rows; rz++) {
        const levels = 1 + Math.floor(r() * 4);
        const base = palette[Math.floor(r() * palette.length)];
        for (let l = 0; l < levels && k < total; l++) {
          col.setHex(palette[r() < 0.7 ? Math.floor(r() * palette.length) : palette.indexOf(base)]).multiplyScalar(0.8 + r() * 0.3);
          place(im, k++, bx + cx * 12.6 + 6.2, y0 + 1.3 + l * 2.6, bz + rz * 2.6, 0, 1, 1, 1, col);
        }
      }
    }
    im.count = k; im.castShadow = true; im.receiveShadow = true; group.add(im);
    // the yard's tarmac, a shade darker than the platform + register each stack block as a solid obstacle
    for (const b of p.containers) {
      box(b[2] * 12.6 + 10, 0.12, b[3] * 2.6 + 12, dark, b[0] + b[2] * 6.3, y0 + 0.07, b[1] + b[3] * 1.3 - 1.3, 0);
      solids.push({ x: b[0] + b[2] * 6.3, z: b[1] + b[3] * 1.3 - 1.3, hw: b[2] * 6.3, hd: b[3] * 1.3, rot: 0, kind: 'container' });
    }
  }

  // ---- tank farm: cylinders with roofs and stripes, each inside a low bund wall ----
  {
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xd9dbd8, roughness: 0.55, metalness: 0.35 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xb04a2a, roughness: 0.7 });
    for (const t of p.tanks) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, t.h, 28), tankMat); body.position.set(t.x, y0 + t.h / 2, t.z); body.castShadow = body.receiveShadow = true; group.add(body);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.08, t.r + 0.08, 0.6, 28), stripe); ring.position.set(t.x, y0 + t.h * 0.82, t.z); group.add(ring);
      if (t.roof === 'dome') { const d = new THREE.Mesh(new THREE.SphereGeometry(t.r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), tankMat); d.scale.y = 0.55; d.position.set(t.x, y0 + t.h, t.z); d.castShadow = true; group.add(d); }
      else { const d = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.96, t.r * 0.96, 0.5, 28), steel); d.position.set(t.x, y0 + t.h - 0.8, t.z); group.add(d); }
      // walkway stair spiralling is too fine to show: a ladder strip and a bund
      box(0.5, t.h, 1.0, steel, t.x + t.r, y0 + t.h / 2, t.z, 0);
      const bw = t.r * 2 + 14, bt = 0.8, bh = 1.1;
      for (const s of [-1, 1]) { box(bw, bh, bt, conc, t.x, y0 + bh / 2, t.z + s * bw / 2); box(bt, bh, bw, conc, t.x + s * bw / 2, y0 + bh / 2, t.z); }
    }
    // pipe rack: a steel frame carrying the lines between the tanks and the quay
    if (p.pipeRack.length >= 2) {                                                     // (left out when a race course runs through it)
    const [a, b] = p.pipeRack; const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let s = 0; s <= len; s += 12) { const x = a[0] + (b[0] - a[0]) * s / len, z = a[1] + (b[1] - a[1]) * s / len; box(0.5, 6, 3.4, steel, x, y0 + 3, z, -ang); }
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len, 8), i % 2 ? stripe : tankMat); m.rotation.z = Math.PI / 2; m.rotation.y = -ang; m.position.set((a[0] + b[0]) / 2, y0 + 5.2 + (i % 2) * 0.1, (a[1] + b[1]) / 2 + (i - 1.5) * 0.7); m.rotation.set(0, -ang, Math.PI / 2); group.add(m); }
    }
    // flare stack
    if (p.flare.length >= 2) {
    box(1.1, 40, 1.1, steel, p.flare[0], y0 + 20, p.flare[1], 0);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 })); fl.position.set(p.flare[0], y0 + 41, p.flare[1]); group.add(fl);
    }
    // fence round the plant
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), steel, 400); let fk = 0;
    for (let i = 0; i < p.fence.length; i++) {
      const A = p.fence[i], B = p.fence[(i + 1) % p.fence.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      for (let s = 0; s < L && fk < 400; s += 4) place(posts, fk++, A[0] + (B[0] - A[0]) * s / L, y0 + 1.1, A[1] + (B[1] - A[1]) * s / L, 0);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(L, 1.8, 0.05), new THREE.MeshStandardMaterial({ color: 0x777b7e, roughness: 0.7, transparent: true, opacity: 0.55 }));
      wall.position.set((A[0] + B[0]) / 2, y0 + 1.1, (A[1] + B[1]) / 2); wall.rotation.y = -Math.atan2(B[1] - A[1], B[0] - A[0]); group.add(wall);
    }
    posts.count = fk; group.add(posts);
  }

  // ---- floodlight masts along the quay lane ----
  {
    const mast = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 24, 8), steel, 40), lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffe2a0, emissiveIntensity: 1.5 }), 40);
    let k = 0;
    for (let x = 3700; x < 4060; x += 90) { place(mast, k, x, y0 + 12, 195, 0); place(lamp, k, x, y0 + 24, 195, 0); k++; }
    for (let z = 300; z < 600; z += 90) { place(mast, k, 4098, y0 + 12, z, 0); place(lamp, k, 4098, y0 + 24, z, 0); k++; }
    mast.count = k; lamp.count = k; group.add(mast, lamp);
  }
  return { group, solids };
}
