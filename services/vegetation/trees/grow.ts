// Plajah Vegetation — tree grower (docs/plajah-vegetation.md §2, phase 2).
//
// Space colonization (Runions et al. 2007) inside the species' crown hull: attractor points fill the crown shape measured
// from the art (front profile × side depth), branches grow toward them and stop when they arrive, so the silhouette IS
// the art's while the structure is botanical. Radii follow the pipe model (Leonardo: parent r^n = Σ child r^n), branch
// order comes from which child continues its parent, and every node records the root of its branch and its distance
// along the tree — the wind skinning (trees/mesh.ts) sways trunk, branches and twigs about those pivots.
//
// Pure TypeScript (no three.js): deterministic for a (species, seed), unit-tested in node.
import { profileAt, type TreeSpecies } from '../species';

export interface TreeNode {
  x: number; y: number; z: number;
  parent: number;
  children: number[];
  radius: number;
  /** 0 = trunk, 1 = limbs off the trunk, 2 = branches off limbs … */
  order: number;
  /** Index of the node this node's branch starts from (its pivot for sway). */
  branchRoot: number;
  /** Path length from the base, metres. */
  dist: number;
  /** Root (above-ground buttress roots) rather than trunk/crown. */
  root?: boolean;
}

export interface TreeLeaf {
  x: number; y: number; z: number;
  /** Facing (unit): out of the crown, or down for hanging species. */
  nx: number; ny: number; nz: number;
  /** Twig node it hangs from. */
  node: number;
  size: number;
  /** Atlas cell index and a flutter phase 0…1. */
  cell: number; phase: number;
  /** Roll about the facing, radians. */
  roll: number;
}

export interface TreeSkeleton {
  species: string;
  seed: number;
  nodes: TreeNode[];
  leaves: TreeLeaf[];
  height: number;
  /** Crown centre (x, z) at each height is the trunk's lean line; kept for leaf facing and impostor framing. */
  crownCenter: { x: number; z: number };
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l] as const; };

export interface GrowOptions {
  /** Scale on the species height (instances vary ±15% by default via the seed). */
  scale?: number;
  /** Fewer attractors / coarser step for distant or low-tier trees (1 = full). */
  detail?: number;
}

export function growTree(sp: TreeSpecies, seed: number, opt: GrowOptions = {}): TreeSkeleton {
  const R = rng(seed * 7919 + 17);
  const H = sp.height * (opt.scale ?? (0.85 + R() * 0.3));
  const detail = Math.max(0.2, Math.min(1, opt.detail ?? 1));
  const step = sp.crown.step * (H / sp.height) / Math.sqrt(detail);
  const kill = sp.crown.kill * (H / sp.height), infl = sp.crown.influence * (H / sp.height);
  const nodes: TreeNode[] = [];
  const add = (x: number, y: number, z: number, parent: number, extra: Partial<TreeNode> = {}) => {
    const p = parent >= 0 ? nodes[parent] : null;
    const n: TreeNode = { x, y, z, parent, children: [], radius: 0, order: 0, branchRoot: 0, dist: p ? p.dist + Math.hypot(x - p.x, y - p.y, z - p.z) : 0, ...extra };
    nodes.push(n);
    if (p) p.children.push(nodes.length - 1);
    return nodes.length - 1;
  };

  // ── trunk: base to crown base, leaning and wandering ──
  const leanA = R() * Math.PI * 2, leanM = sp.trunk.lean * H;
  const trunkAt = (t: number) => {
    const w = sp.trunk.wobble * H * 0.04;
    return {
      x: Math.cos(leanA) * leanM * Math.pow(t, 1.4) + Math.sin(t * 7.1 + seed) * w * t,
      z: Math.sin(leanA) * leanM * Math.pow(t, 1.4) + Math.cos(t * 6.3 + seed * 1.7) * w * t,
    };
  };
  const crownY0 = sp.trunk.crownBase * H;
  let tip = add(0, 0, 0, -1);
  const trunkSteps = Math.max(2, Math.round(crownY0 / step));
  for (let i = 1; i <= trunkSteps; i++) {
    const t = i / trunkSteps, p = trunkAt(t * sp.trunk.crownBase);
    tip = add(p.x, t * crownY0, p.z, tip);
  }
  const top = trunkAt(1);

  // ── attractors filling the crown hull (front profile × side depth), denser where the crown is wider ──
  const prof = sp.crown.profile;
  const y0 = Math.max(prof[0].y, sp.trunk.crownBase * 0.9), y1 = prof[prof.length - 1].y;
  const rMax = Math.max(...prof.map((p) => p.r)) || 0.1;
  const att: [number, number, number][] = [];
  const want = Math.round(sp.crown.attractors * detail);
  for (let guard = 0; att.length < want && guard < want * 40; guard++) {
    const yf = y0 + (y1 - y0) * R(), rf = profileAt(prof, yf);
    if (R() > (rf / rMax) ** 2) continue;                 // area-weighted
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rf * H;
    const c = trunkAt(yf);
    att.push([c.x + Math.cos(a) * d, yf * H, c.z + Math.sin(a) * d * sp.crown.depthScale]);
  }

  // ── colonize ──
  const cell = infl, key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  const index = (i: number) => { const n = nodes[i], k = key(n.x, n.y, n.z); let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(i); };
  nodes.forEach((_, i) => index(i));
  const alive = new Uint8Array(att.length).fill(1);
  let remaining = att.length;
  for (let iter = 0; iter < 400 && remaining > 0; iter++) {
    const pull = new Map<number, [number, number, number, number]>();
    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      const [ax, ay, az] = att[a];
      let best = -1, bd = infl * infl;
      const cx = Math.floor(ax / cell), cy = Math.floor(ay / cell), cz = Math.floor(az / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const b = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!b) continue;
        for (const i of b) {
          const n = nodes[i], d2 = (n.x - ax) ** 2 + (n.y - ay) ** 2 + (n.z - az) ** 2;
          if (d2 < kill * kill) { alive[a] = 0; remaining--; best = -2; break; }
          if (d2 < bd) { bd = d2; best = i; }
        }
        if (best === -2) break;
      }
      if (best < 0) continue;
      const n = nodes[best], [ux, uy, uz] = norm(ax - n.x, ay - n.y, az - n.z);
      const p = pull.get(best) ?? [0, 0, 0, 0];
      pull.set(best, [p[0] + ux, p[1] + uy, p[2] + uz, p[3] + 1]);
    }
    if (!pull.size) {
      // nothing within reach yet: the trunk keeps climbing toward the crown
      const n = nodes[tip];
      if (n.y > y1 * H) break;
      const p = trunkAt(Math.min(1, (n.y + step) / H));
      tip = add(p.x, n.y + step, p.z, tip); index(tip);
      continue;
    }
    let grew = 0;
    for (const [i, [sx, sy, sz]] of pull) {
      const n = nodes[i];
      let [dx, dy, dz] = norm(sx, sy, sz);
      [dx, dy, dz] = norm(dx + (R() - 0.5) * 0.12, dy + sp.crown.gravitropism * 0.35, dz + (R() - 0.5) * 0.12);
      const x = n.x + dx * step, y = n.y + dy * step, z = n.z + dz * step;
      if (n.children.some((c) => (nodes[c].x - x) ** 2 + (nodes[c].y - y) ** 2 + (nodes[c].z - z) ** 2 < (step * 0.3) ** 2)) continue;
      const j = add(x, Math.max(0.3, y), z, i); index(j); grew++;
    }
    if (!grew) break;
  }

  // ── radii by the pipe model, then scaled so the trunk base has the species' radius ──
  const nPipe = sp.branches.pipe;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    n.radius = n.children.length ? Math.pow(n.children.reduce((s, c) => s + Math.pow(nodes[c].radius, nPipe), 0), 1 / nPipe) : 1;
  }
  const k = sp.trunk.radius / nodes[0].radius;
  for (const n of nodes) n.radius = Math.max(sp.branches.tipRadius, n.radius * k);

  // ── order and branch roots: the thickest child continues its parent ──
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (i === 0) { n.order = 0; n.branchRoot = 0; }
    if (!n.children.length) continue;
    const main = n.children.reduce((a, b) => (nodes[b].radius > nodes[a].radius ? b : a), n.children[0]);
    for (const c of n.children) {
      const ch = nodes[c];
      if (c === main) { ch.order = n.order; ch.branchRoot = n.branchRoot; }
      else { ch.order = n.order + 1; ch.branchRoot = i; }
    }
  }

  // ── buttress roots: short arching chains from the base out to the ground ──
  // they leave the trunk well above the ground (the art's root mass rises a trunk-width or more) and arch out
  const tr = sp.trunk.radius * (H / sp.height);
  for (let r = 0; r < sp.trunk.roots; r++) {
    const a = (r / sp.trunk.roots) * Math.PI * 2 + (R() - 0.5) * 0.6, reach = tr * sp.trunk.rootReach * (0.7 + R() * 0.6);
    const rise = tr * (1.6 + R() * 1.6);
    let prev = 0;
    for (let s = 1; s <= 6; s++) {
      const t = s / 6, d = tr * 0.7 + (reach - tr * 0.7) * Math.pow(t, 0.8), y = rise * (1 - t) * (1 - t) * (1 + 0.3 * Math.sin(t * Math.PI));
      prev = add(Math.cos(a) * d, y, Math.sin(a) * d, prev, { root: true, order: 1, branchRoot: 0 });
      nodes[prev].radius = tr * 0.55 * (1 - t * 0.85);
    }
  }

  // ── leaf cards at the twigs ──
  const leaves: TreeLeaf[] = [];
  const [cellsX, cellsY] = sp.leaves.cells;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.root || n.order === 0) continue;
    const isTip = n.children.length === 0, fine = n.radius < sp.branches.tipRadius * 2.2;
    if (!isTip && !(fine && R() < 0.35)) continue;
    const c = trunkAt(Math.min(1, n.y / H));
    for (let k2 = 0; k2 < (isTip ? sp.leaves.perTip : 1); k2++) {
      const size = sp.leaves.size * (1 + (R() - 0.5) * 2 * sp.leaves.sizeJitter) * (H / sp.height);
      const jx = (R() - 0.5) * size * 0.6, jy = (R() - 0.5) * size * 0.4, jz = (R() - 0.5) * size * 0.6;
      const [nx, ny, nz] = sp.leaves.hang ? norm((R() - 0.5) * 0.3, -1, (R() - 0.5) * 0.3) : norm(n.x - c.x + jx, (n.y - H * 0.55) * 0.4 + size * 0.3, n.z - c.z + jz);
      leaves.push({ x: n.x + jx, y: n.y + jy, z: n.z + jz, nx, ny, nz, node: i, size, cell: Math.floor(R() * cellsX * cellsY), phase: R(), roll: R() * Math.PI * 2 });
    }
  }

  let maxY = 0; for (const n of nodes) maxY = Math.max(maxY, n.y);
  return { species: sp.id, seed, nodes, leaves, height: maxY, crownCenter: { x: top.x, z: top.z } };
}
