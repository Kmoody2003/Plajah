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

export interface TreeGeometry { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry; height: number;
  /** Glowing conduit cables (species with bark.conduits), with the same wind attributes as the wood. */
  cables: THREE.BufferGeometry | null }

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
    const fur = sp.trunk.furrow ?? 0, gn = sp.trunk.gnarl ?? 0, plank = sp.trunk.buttress ?? 0, big = (fur > 0 || gn > 0) && p.radius > 0.5;
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
      // the ring's shape round its axis, r(ang) = r·(1 + F(ang)): braided lobes (twisted species), furrowed bark (sharp
      // grooves between rounded ridges), gnarl (slow bulges and burls, strongest low on the trunk); all continuous in
      // dist so neighbouring rings meet
      const lob = sp.trunk.twist > 0.8 && nd.order === 0, furOn = fur > 0 && r > 0.25 && !n.root, gnOn = gn > 0 && !n.root && nd.order <= 1 && r > 0.3;
      const gf = gnOn ? gn * Math.max(0.3, 1 - nd.y / (H * 0.6)) : 0, amp = furOn ? fur * Math.min(1, r / 0.8) : 0, dd = nd.dist, sd = sk.seed;
      const F = (ang: number) => {
        let f = lob ? 0.12 * Math.cos(ang * 5) : 0;
        if (amp) f += amp * (Math.sqrt(Math.abs(Math.sin(ang * 13 + Math.sin(dd * 0.23 + sd) * 1.6))) - 0.6) + amp * 0.35 * (Math.sqrt(Math.abs(Math.sin(ang * 29 + dd * 0.11))) - 0.6);
        if (gf) f += gf * (0.55 * Math.sin(ang * 3 + dd * 0.37 + sd) + 0.3 * Math.sin(ang * 2 - dd * 0.61 + sd * 1.3) + 0.15 * Math.sin(ang * 7 + dd * 1.1));
        return f;
      };
      // plank buttresses: near the trunk a root's cross-section is a tall thin wall (ellipse, wide vertically)
      const pk = n.root && plank > 0 ? plank * Math.max(0, 1 - Math.hypot(nd.x, nd.z) / (sp.trunk.radius * sp.trunk.rootReach * 0.9)) : 0;
      const ea = 1 - 0.3 * pk, eb = 1 + 0.55 * pk;                 // a rounded wall, not a blade
      for (let k = 0; k <= radial; k++) {
        const ang = (k / radial) * Math.PI * 2 + tw;
        const cx = Math.cos(ang), sx = Math.sin(ang);
        const f = F(ang), fd = (amp || gf || lob) ? Math.max(-3, Math.min(3, (F(ang + 0.01) - F(ang - 0.01)) / 0.02 / (1 + f))) : 0;
        const rr = r * flare * (1 + f);
        const nx = side.x * cx * ea + side2.x * sx * eb, ny = side.y * cx * ea + side2.y * sx * eb, nz = side.z * cx * ea + side2.z * sx * eb;
        pos.push(c.x + nx * rr, c.y + ny * rr, c.z + nz * rr);
        // normal: the ellipse's own (cx/a, sx/b), tilted against the slope of r(ang) round the ring
        let mx = side.x * cx / ea + side2.x * sx / eb, my = side.y * cx / ea + side2.y * sx / eb, mz = side.z * cx / ea + side2.z * sx / eb;
        if (fd) { const tx = -side.x * sx + side2.x * cx, ty = -side.y * sx + side2.y * cx, tz = -side.z * sx + side2.z * cx; mx -= tx * fd * 0.6; my -= ty * fd * 0.6; mz -= tz * fd * 0.6; }
        const ml = Math.hypot(mx, my, mz) || 1;
        nor.push(mx / ml, my / ml, mz / ml);
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

  // ── conduit cables (Cyber Forest sheets and the rotating tree): glowing cords spiralling up the trunk and running out
  //    along the biggest limbs; they carry the wood's wind attributes so they sway with it, u = metres along the cord ──
  let cables: THREE.BufferGeometry | null = null;
  const cd = sp.bark.conduits;
  if (cd && cd.count > 0) {
    const cp: number[] = [], cn: number[] = [], cu: number[] = [], cpv: number[] = [], csw: number[] = [], ci: number[] = [];
    const kids = (i: number) => nodes[i].children.filter((c) => !nodes[c].root);
    const trunk = [0]; for (let cur = 0; ;) { const ks = kids(cur).filter((c) => nodes[c].order === 0); if (!ks.length) break; cur = ks[0]; trunk.push(cur); }
    const starts: number[] = []; for (const t of trunk) for (const c of kids(t)) if (nodes[c].order === 1 && nodes[c].radius > 0.1) starts.push(c);
    starts.sort((x, y) => nodes[y].radius - nodes[x].radius);
    const paths: { idx: number[]; cords: number }[] = [{ idx: trunk, cords: cd.count }];
    for (const s0 of starts.slice(0, cd.limbs ?? 3)) {
      const pth = [nodes[s0].parent, s0];
      for (let c = s0; ;) { const ks = kids(c); if (!ks.length) break; c = ks.reduce((x, y) => (nodes[y].radius > nodes[x].radius ? y : x)); if (nodes[c].radius < 0.07) break; pth.push(c); }
      if (pth.length > 3) paths.push({ idx: pth, cords: 1 });
    }
    const margin = 1.03 + (sp.trunk.gnarl ?? 0) * 0.5 + (sp.trunk.furrow ?? 0) * 0.3, crad = cd.radius, turns = cd.turns ?? 1.2, SEG = 5;
    const T = new THREE.Vector3(), S1 = new THREE.Vector3(), S2 = new THREE.Vector3(), P = new THREE.Vector3();
    paths.forEach((pth, pi) => {
      for (let k = 0; k < pth.cords; k++) {
        const a0 = (k / pth.cords) * Math.PI * 2 + pi * 1.7 + hash(pi * 7 + k) * 0.8;
        const ringBase = cp.length / 3; let rings = 0;
        for (let q = 0; q < pth.idx.length; q++) {
          const nd = nodes[pth.idx[q]], nb = nodes[pth.idx[Math.min(pth.idx.length - 1, q + 1)]], na = nodes[pth.idx[Math.max(0, q - 1)]];
          T.set(nb.x - na.x, nb.y - na.y, nb.z - na.z).normalize();
          S1.copy(Math.abs(T.y) > 0.95 ? tmp.set(1, 0, 0) : up).cross(T).normalize(); S2.crossVectors(T, S1).normalize();
          const ang = a0 + (nd.dist / H) * turns * Math.PI * 2 * (pi === 0 ? 1 : 0.4);
          const flare = q === 0 && pi === 0 ? sp.trunk.flare : 1, off = nd.radius * margin * flare + crad;
          P.set(nd.x, nd.y, nd.z).addScaledVector(S1, Math.cos(ang) * off).addScaledVector(S2, Math.sin(ang) * off);
          const ni = pth.idx[q], pv = nodes[nd.branchRoot], ph = hash(nd.branchRoot + sk.seed * 31);
          for (let j = 0; j <= SEG; j++) {
            const ra = (j / SEG) * Math.PI * 2, rx = Math.cos(ra), ry = Math.sin(ra);
            const ox = S1.x * rx + S2.x * ry, oy = S1.y * rx + S2.y * ry, oz = S1.z * rx + S2.z * ry;
            cp.push(P.x + ox * crad, P.y + oy * crad, P.z + oz * crad); cn.push(ox, oy, oz); cu.push(nd.dist, j / SEG);
            cpv.push(pv.x, pv.y, pv.z); csw.push(Math.pow(Math.max(0, P.y) / H, 2), cum[ni], ph, own[ni]);
          }
          if (rings > 0) for (let j = 0; j < SEG; j++) { const i0 = ringBase + (rings - 1) * (SEG + 1) + j, i1 = i0 + 1, j0 = i0 + SEG + 1, j1 = j0 + 1; ci.push(i0, j0, i1, i1, j0, j1); }
          rings++;
        }
      }
    });
    cables = new THREE.BufferGeometry();
    cables.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cables.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3));
    cables.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    cables.setAttribute('aPivot', new THREE.Float32BufferAttribute(cpv, 3));
    cables.setAttribute('aSway', new THREE.Float32BufferAttribute(csw, 4));
    cables.setIndex(ci);
  }
  return { wood, leaves, height: H, cables };
}
