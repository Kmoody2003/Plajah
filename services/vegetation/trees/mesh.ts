// Plajah Vegetation — skeleton → geometry with the wind skinning baked in (docs/plajah-vegetation.md §2.2).
//
// Wood: one generalized cylinder per segment (parent → node), radial count by thickness, bark UVs in metres (u round,
// v along the path), twisted strands where the species twists. Leaves: one card per TreeLeaf, facing out of the crown or
// hanging, UVs into the species atlas cell.
// Every vertex carries the data the wind shader needs, so swaying costs a few ALU ops:
//   aPivot  vec3 — the root of its branch (branches swing about it)
//   aSway   vec4 — x trunk weight ((height/H)^2: the crown bows, the base stays), y bend weight (flexibility summed
//                  from the base along the path, so a side branch moves with the limb it grows from — no tearing at
//                  joints), z phase (per branch), w own-branch weight (0 where the branch starts: its own swing)
import * as THREE from 'three/webgpu';
import type { TreeSkeleton } from './grow';
import type { TreeSpecies } from '../species';

export interface TreeGeometry { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry; height: number }

const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

export function buildTreeGeometry(sk: TreeSkeleton, sp: TreeSpecies, o: { radial?: number; barkTile?: number } = {}): TreeGeometry {
  const H = Math.max(1, sk.height), nodes = sk.nodes, tile = o.barkTile ?? 1.6;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], piv: number[] = [], sway: number[] = [], idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3();
  const side = new THREE.Vector3(), side2 = new THREE.Vector3(), tmp = new THREE.Vector3();
  const flexOf = (order: number) => [0.08, 0.5, 0.85, 1.0, 1.0][Math.min(4, order)];
  // bend weight: accumulated along the path from the base (continuous at every joint); own: within the branch only
  const cum = new Float32Array(nodes.length), own = new Float32Array(nodes.length);
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i], p = nodes[n.parent], seg = Math.hypot(n.x - p.x, n.y - p.y, n.z - p.z) / Math.max(1, H * 0.25);
    cum[i] = cum[n.parent] + seg * flexOf(n.order);
    own[i] = n.parent === n.branchRoot && n.order > p.order ? seg * flexOf(n.order) : own[n.parent] + seg * flexOf(n.order);
    if (n.root) { cum[i] = 0; own[i] = 0; }
  }
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i], p = nodes[n.parent];
    a.set(p.x, p.y, p.z); b.set(n.x, n.y, n.z);
    dir.subVectors(b, a); const len = dir.length(); if (len < 1e-4) continue; dir.divideScalar(len);
    const r0 = n.root ? Math.max(n.radius, nodes[n.parent].radius * 0.6) : p.radius, r1 = n.radius;
    const fur = sp.trunk.furrow ?? 0, big = fur > 0 && p.radius > 0.5;
    const radial = Math.max(4, Math.min(big ? Math.max(o.radial ?? 14, Math.round(14 + p.radius * 10)) : (o.radial ?? 14), Math.round(5 + p.radius * 18)));
    // a frame for the ring (stable-ish: project "up", or x when the segment is vertical)
    side.copy(Math.abs(dir.y) > 0.95 ? tmp.set(1, 0, 0) : up).cross(dir).normalize();
    side2.crossVectors(dir, side).normalize();
    const twist = (sp.trunk.twist * Math.PI * 2) * (n.order === 0 ? 1 : 0.3);
    const base = pos.length / 3, piv0 = nodes[n.branchRoot], phase = hash(n.branchRoot + sk.seed * 31);
    for (let e = 0; e < 2; e++) {
      const c = e ? b : a, r = e ? r1 : r0, nd = e ? n : p;
      // root flare at the base of the trunk
      const flare = nd === nodes[0] || (nd.order === 0 && nd.y < sp.trunk.radius * 2) ? 1 + (sp.trunk.flare - 1) * Math.max(0, 1 - nd.y / (sp.trunk.radius * 3)) : 1;
      const tw = twist * (nd.dist / H);
      for (let k = 0; k <= radial; k++) {
        const ang = (k / radial) * Math.PI * 2 + tw;
        const cx = Math.cos(ang), sx = Math.sin(ang);
        // twisted species: strands — the ring is lobed so the trunk reads as braided cords
        const lobes = sp.trunk.twist > 0.8 && nd.order === 0 ? 1 + 0.12 * Math.cos(ang * 5) : 1;
        // furrowed bark: sharp-bottomed grooves between rounded ridges, wandering along the trunk (continuous in dist)
        let fk = 1, fd = 0;
        if (fur > 0 && r > 0.25 && !n.root) {
          const ph = ang * 13 + Math.sin(nd.dist * 0.23 + sk.seed) * 1.6, ph2 = ang * 29 + nd.dist * 0.11;
          const g = Math.abs(Math.sin(ph)), g2 = Math.abs(Math.sin(ph2));
          const amp = fur * Math.min(1, r / 0.8);
          fk = 1 + amp * (Math.sqrt(g) - 0.6) + amp * 0.35 * (Math.sqrt(g2) - 0.6);
          fd = amp * (Math.cos(ph) * Math.sign(Math.sin(ph)) * 13 / (2 * Math.sqrt(g + 1e-3)) + 0.35 * Math.cos(ph2) * Math.sign(Math.sin(ph2)) * 29 / (2 * Math.sqrt(g2 + 1e-3)));
          fd = Math.max(-3, Math.min(3, fd / fk));
        }
        const rr = r * flare * lobes * fk;
        const nx = side.x * cx + side2.x * sx, ny = side.y * cx + side2.y * sx, nz = side.z * cx + side2.z * sx;
        pos.push(c.x + nx * rr, c.y + ny * rr, c.z + nz * rr);
        if (fd) { // normal of r(ang): the radial direction tilted against the slope round the ring
          const tx = -side.x * sx + side2.x * cx, ty = -side.y * sx + side2.y * cx, tz = -side.z * sx + side2.z * cx;
          const mx = nx - tx * fd * 0.5, my = ny - ty * fd * 0.5, mz = nz - tz * fd * 0.5, ml = Math.hypot(mx, my, mz) || 1;
          nor.push(mx / ml, my / ml, mz / ml);
        } else nor.push(nx, ny, nz);
        uv.push((k / radial) * Math.max(1, Math.round((2 * Math.PI * Math.max(r, 0.05)) / tile)), nd.dist / tile);
        piv.push(piv0.x, piv0.y, piv0.z);
        const tw2 = Math.pow(Math.max(0, c.y) / H, 2), ni = e ? i : n.parent;
        const ownW = e ? own[i] : (n.parent === n.branchRoot && n.order > p.order ? 0 : own[n.parent]);
        sway.push(tw2, cum[ni], phase, ownW);
      }
    }
    for (let k = 0; k < radial; k++) {
      const i0 = base + k, i1 = base + k + 1, j0 = base + radial + 1 + k, j1 = j0 + 1;
      idx.push(i0, j0, i1, i1, j0, j1);
    }
  }
  const wood = new THREE.BufferGeometry();
  wood.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wood.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  wood.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wood.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
  wood.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 4));
  wood.setIndex(idx);

  // leaves: one card each, centred on the leaf, facing n, rolled; hanging species hang from the top edge
  const lp: number[] = [], ln: number[] = [], lu: number[] = [], lpv: number[] = [], lsw: number[] = [], li: number[] = [];
  const [cx, cy] = sp.leaves.cells;
  const c = new THREE.Vector3(sk.crownCenter.x, H * 0.6, sk.crownCenter.z);
  for (const L of sk.leaves) {
    const nrm = new THREE.Vector3(L.nx, L.ny, L.nz);
    const half = L.size / 2, tall = sp.leaves.hang ? 2 : 1;
    // card axes: for hanging cards, a vertical card facing out of the crown; else a card facing nrm, rolled
    let ax: THREE.Vector3, ay: THREE.Vector3;
    if (sp.leaves.hang) {
      const out = new THREE.Vector3(L.x - c.x, 0, L.z - c.z).normalize();
      ax = new THREE.Vector3(-out.z, 0, out.x).applyAxisAngle(up, (L.roll - Math.PI) * 0.4); ay = new THREE.Vector3(0, 1, 0);
    } else {
      const ref = Math.abs(nrm.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
      ax = new THREE.Vector3().crossVectors(ref, nrm).normalize().applyAxisAngle(nrm, L.roll);
      ay = new THREE.Vector3().crossVectors(nrm, ax).normalize();
    }
    const cell = L.cell % (cx * cy), u0 = (cell % cx) / cx, v0 = 1 - (Math.floor(cell / cx) + 1) / cy;
    const base = lp.length / 3;
    // soft "crown normal" (from the crown centre) lights the cards as one volume instead of flat planes
    const cn = new THREE.Vector3(L.x - c.x, (L.y - c.y) * 0.6, L.z - c.z).normalize().lerp(nrm, 0.3).normalize();
    const n = nodes[L.node], pv = nodes[n.branchRoot];
    const top = sp.leaves.hang ? 0 : -half * tall; // hanging: the card hangs below its twig
    for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      const yy = sp.leaves.hang ? (sy > 0 ? 0 : -L.size * tall) : sy * half;
      const p = new THREE.Vector3(L.x, L.y, L.z).addScaledVector(ax, sx * half).addScaledVector(ay, yy + (sp.leaves.hang ? 0 : top * 0));
      lp.push(p.x, p.y, p.z); ln.push(cn.x, cn.y, cn.z);
      lu.push(u0 + (sx > 0 ? 1 : 0) / cx, v0 + (sy > 0 ? 1 : 0) / cy);
      lpv.push(pv.x, pv.y, pv.z);
      // leaves: the twig's bend + own swing; x carries the hang factor for strands (bottom edge swings most)
      const hangK = sp.leaves.hang ? (sy > 0 ? 0 : 1) : 0.5;
      lsw.push(Math.pow(Math.max(0, p.y) / H, 2), cum[L.node] + hangK * 0.4, L.phase, own[L.node] + hangK);
    }
    li.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
  leaves.setAttribute('aPivot', new THREE.Float32BufferAttribute(lpv, 3));
  leaves.setAttribute('aSway', new THREE.Float32BufferAttribute(lsw, 4));
  leaves.setIndex(li);
  wood.computeBoundingSphere(); leaves.computeBoundingSphere();
  return { wood, leaves, height: H };
}
