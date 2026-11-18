// The depressed downtown freeways (tools/plan_trench.py → region/trench.json): the carriageways and ramps on their bed below the street grid, board-formed concrete retaining
// walls up to the street, Jersey barriers along the medians, and an overpass for every surface street that crosses the trench. The terrain is cut away over the trench by the
// street mask's alpha (the terrain shader discards there), so the trench is real geometry seen through a hole in the ground.
import * as THREE from 'three';

export interface TrenchLine { c: string; half: number; xz: number[][]; y: number[]; depth: number[] }
export interface TrenchOpts {
  lines: TrenchLine[];
  ground: (x: number, z: number) => number;          // the drawn terrain at grade
  hole: (x: number, z: number) => boolean;           // inside the cut in the ground
  crossings: { half: number; p: number[][] }[];      // surface streets (centre lines, half width) that may cross the trench
  roadMaterial?: THREE.Material;
}
export interface Trench { group: THREE.Group; surfaces: THREE.Mesh[]; overpasses: number }

const TEX = '/games/forth-horizon/tex/';
function concrete(color: number): THREE.MeshStandardMaterial {
  const tl = new THREE.TextureLoader();
  const t = (f: string, srgb: boolean): THREE.Texture => { const x = tl.load(TEX + f); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; x.anisotropy = 4; return x; };
  return new THREE.MeshStandardMaterial({ color, map: t('ground_concrete_sidewalk.png', true), normalMap: t('ground_concrete_sidewalk_normal.png', false), roughness: 0.92, side: THREE.DoubleSide });
}

export function buildTrench(o: TrenchOpts): Trench {
  const group = new THREE.Group(); group.name = 'freeway-trench';
  const surfaces: THREE.Mesh[] = [];
  const asphalt = o.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.85 });
  const wallMat = concrete(0xb8b4ac), barrierMat = concrete(0xd0ccc4);
  const deck = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };
  const wall = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };
  const barrierLst = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };
  const floor = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };                  // the trench floor: medians and verges at bed level, so no gap shows through the cut
  const quad = (b: typeof wall, a0: number[], a1: number[], b0: number[], b1: number[], u0: number, u1: number, vh: number): void => {
    const i = b.pos.length / 3;
    b.pos.push(...a0, ...a1, ...b0, ...b1); b.uv.push(u0, 0, u1, 0, u0, vh, u1, vh);
    b.idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
  };
  for (const l of o.lines) {
    const n = l.xz.length; if (n < 2) continue;
    const w = l.half + 0.8;                                     // carriageway + shoulders
    let dist = 0, base = deck.pos.length / 3;
    const nrm = (i: number): [number, number] => { const a = l.xz[Math.max(0, i - 1)], b = l.xz[Math.min(n - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [-dz / L, dx / L]; };
    for (let i = 0; i < n; i++) {
      const [nx, nz] = nrm(i), p = l.xz[i], y = l.y[i] + 0.05;
      if (i > 0) dist += Math.hypot(p[0] - l.xz[i - 1][0], p[1] - l.xz[i - 1][1]);
      deck.pos.push(p[0] + nx * w, y, p[1] + nz * w, p[0] - nx * w, y, p[1] - nz * w); deck.uv.push(0, dist / 8, 1, dist / 8);
    }
    for (let i = 0; i < n - 1; i++) { const q = base + i * 2; deck.idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    {
      const fw = l.half + 3.2, fb = floor.pos.length / 3; let fd = 0;
      for (let i = 0; i < n; i++) {
        const [nx, nz] = nrm(i), p = l.xz[i], y = l.y[i] - 0.06;
        if (i > 0) fd += Math.hypot(p[0] - l.xz[i - 1][0], p[1] - l.xz[i - 1][1]);
        floor.pos.push(p[0] + nx * fw, y, p[1] + nz * fw, p[0] - nx * fw, y, p[1] - nz * fw); floor.uv.push(0, fd / 4, fw / 2, fd / 4);
      }
      for (let i = 0; i < n - 1; i++) { const q = fb + i * 2; floor.idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    // walls (or median barriers) along both edges wherever the bed is well below the street
    for (const side of [1, -1]) {
      for (let i = 0; i < n - 1; i++) {
        if (Math.min(l.depth[i], l.depth[i + 1]) < 1.0) continue;
        const [n0x, n0z] = nrm(i), [n1x, n1z] = nrm(i + 1), p0 = l.xz[i], p1 = l.xz[i + 1];
        const e = l.half + 1.0, out = l.half + 2.6;
        const e0 = [p0[0] + n0x * e * side, p0[1] + n0z * e * side], e1 = [p1[0] + n1x * e * side, p1[1] + n1z * e * side];
        const median = o.hole(p0[0] + n0x * out * side, p0[1] + n0z * out * side) && o.hole(p1[0] + n1x * out * side, p1[1] + n1z * out * side);
        const y0 = l.y[i], y1 = l.y[i + 1];
        const t0 = median ? y0 + 0.95 : o.ground(e0[0], e0[1]) + 0.9, t1 = median ? y1 + 0.95 : o.ground(e1[0], e1[1]) + 0.9;   // coping a little above the street
        const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
        quad(median ? barrierLst : wall, [e0[0], y0, e0[1]], [e1[0], y1, e1[1]], [e0[0], t0, e0[1]], [e1[0], t1, e1[1]], 0, len / 4, (Math.max(t0, t1) - Math.min(y0, y1)) / 4);
      }
    }
  }
  const mesh = (b: { pos: number[]; uv: number[]; idx: number[] }, m: THREE.Material, name: string): THREE.Mesh | null => {
    if (!b.idx.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setIndex(b.idx); g.computeVertexNormals();
    const me = new THREE.Mesh(g, m); me.name = name; me.receiveShadow = true; group.add(me); return me;
  };
  const deckMesh = mesh(deck, asphalt, 'trench-bed'); if (deckMesh) surfaces.push(deckMesh);
  const wm = mesh(wall, wallMat, 'trench-walls'); if (wm) wm.castShadow = true;
  mesh(barrierLst, barrierMat, 'trench-medians');
  mesh(floor, concrete(0x8f8b84), 'trench-floor');

  // overpasses: every surface street over the cut, a deck at street level from one side to the other, with fascia and parapets
  const ov = { pos: [] as number[], uv: [] as number[], idx: [] as number[] }, side = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };
  let overpasses = 0;
  for (const s of o.crossings) {
    const pts: number[][] = [];
    for (let i = 0; i < s.p.length - 1; i++) { const a = s.p[i], b = s.p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 2)); for (let j = 0; j < k; j++) pts.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
    pts.push(s.p[s.p.length - 1]);
    let i = 0;
    while (i < pts.length) {
      if (!o.hole(pts[i][0], pts[i][1])) { i++; continue; }
      const a = Math.max(0, i - 2); while (i < pts.length && o.hole(pts[i][0], pts[i][1])) i++;
      const b = Math.min(pts.length - 1, i + 1);
      if (b - a < 3) continue;
      overpasses++;
      const ya = o.ground(pts[a][0], pts[a][1]) + 0.12, yb = o.ground(pts[b][0], pts[b][1]) + 0.12;
      const w = s.half + 1.6;                                  // carriageway + sidewalks
      let dist = 0; const base = ov.pos.length / 3;
      const prev: number[][] = [];
      for (let k = a; k <= b; k++) {
        const t = (k - a) / (b - a), y = ya + (yb - ya) * t;
        const q0 = pts[Math.max(a, k - 1)], q1 = pts[Math.min(b, k + 1)];
        const dx = q1[0] - q0[0], dz = q1[1] - q0[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        if (k > a) dist += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        ov.pos.push(pts[k][0] + nx * w, y, pts[k][1] + nz * w, pts[k][0] - nx * w, y, pts[k][1] - nz * w); ov.uv.push(0, dist / 8, 1, dist / 8);
        prev.push([pts[k][0] + nx * w, pts[k][1] + nz * w, pts[k][0] - nx * w, pts[k][1] - nz * w, y]);
      }
      for (let k = 0; k < b - a; k++) { const q = base + k * 2; ov.idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      // fascia (1.4 m girders) and parapets (1.0 m) on both edges
      for (let k = 0; k < prev.length - 1; k++) {
        const A = prev[k], B = prev[k + 1], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        for (const [ox, oz, bx, bz] of [[A[0], A[1], B[0], B[1]], [A[2], A[3], B[2], B[3]]]) {
          quad(side, [ox, A[4] - 1.4, oz], [bx, B[4] - 1.4, bz], [ox, A[4] + 1.0, oz], [bx, B[4] + 1.0, bz], 0, len / 4, 0.6);
        }
      }
      // soffit (the underside you see from the freeway)
      for (let k = 0; k < prev.length - 1; k++) { const A = prev[k], B = prev[k + 1]; quad(side, [A[0], A[4] - 1.4, A[1]], [B[0], B[4] - 1.4, B[1]], [A[2], A[4] - 1.4, A[3]], [B[2], B[4] - 1.4, B[3]], 0, 1, 1); }
    }
  }
  const ovMesh = mesh(ov, asphalt, 'overpass-decks'); if (ovMesh) { surfaces.push(ovMesh); ovMesh.castShadow = true; }
  const sm = mesh(side, wallMat, 'overpass-structure'); if (sm) sm.castShadow = true;
  return { group, surfaces, overpasses };
}
