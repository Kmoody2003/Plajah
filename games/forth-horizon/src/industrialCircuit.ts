import * as THREE from 'three';

/**
 * The Ironworks Industrial Circuit: a short street course cut through the port's industrial yards (route planned by tools/plan_industrial_circuit.py).
 * Asphalt with white edge lines and a chequered start line, concrete barriers 6.9 m from the centre line (the same distance the city circuit's physics uses),
 * and tyre walls on the outside of the tight corners.
 */
export interface IndustrialCircuit { group: THREE.Group; road: THREE.Mesh; path: { x: number; z: number }[] }

/** where the road leaves the ground (region/industrial_circuit.json `grade`): over the railway on a bridge, or under it in a cutting */
export interface GradeFeature { kind: 'bridge' | 'underpass'; at: number[]; clear: number; ramp: number }

/**
 * The road's design height along the path: the ground, except over a bridge (the rail's height + clearance + the deck) and in an underpass (the rail's
 * height - clearance - the rail bridge's depth), each held level for 18 m either side of the crossing and eased back to the ground over `ramp` metres
 * (a cosine ease: the grade is steepest mid-ramp, about 9 % for a 7.5 m rise over 120 m). Worked out once from the ground as it is before any cutting.
 */
export function industrialProfile(P: { x: number; z: number }[], grade: GradeFeature[], ground: (x: number, z: number) => number): number[] {
  const n = P.length, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  const total = cum[n - 1] + Math.hypot(P[0].x - P[n - 1].x, P[0].z - P[n - 1].z);
  const ys = P.map((p) => ground(p.x, p.z));
  const base = ys.slice();
  for (const f of grade) {
    let k = 0, bd = 1e18; P.forEach((p, i) => { const d = (p.x - f.at[0]) ** 2 + (p.z - f.at[1]) ** 2; if (d < bd) { bd = d; k = i; } });
    const rail = ground(f.at[0], f.at[1]), FLAT = 18;
    const target = f.kind === 'bridge' ? rail + f.clear + 1.3 : rail - f.clear - 1.4;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(cum[i] - cum[k]); d = Math.min(d, total - d);
      if (d > FLAT + f.ramp) continue;
      const w = d <= FLAT ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (d - FLAT) / f.ramp);
      ys[i] = base[i] + (target - base[i]) * w;
    }
  }
  // never below the water: where the line crosses the edge of the inlet the road is carried over it at least 3.6 m up (a low bridge: the deck and piers
  // are built wherever the road stands clear of the ground)
  for (let i = 0; i < n; i++) ys[i] = Math.max(ys[i], 3.6);
  // ease every rise that is steeper than 10 % (the raised edge of the inlet, a ramp meeting a rise of the ground) by lifting the low side, round the loop
  const G = 0.10;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n + 1; i++) { const a = (i - 1) % n, b = i % n, d = Math.hypot(P[b].x - P[a].x, P[b].z - P[a].z); ys[b] = Math.max(ys[b], ys[a] - G * d); }
    for (let i = n - 1; i >= 0; i--) { const a = (i + 1) % n, b = i, d = Math.hypot(P[b].x - P[a].x, P[b].z - P[a].z); ys[b] = Math.max(ys[b], ys[a] - G * d); }
  }
  return ys;
}

/** cut the ground down under the road where it runs below it (the underpass and its ramps). The height map is a 12 m grid and the drawn terrain coarser
 *  still, so a narrow cut with vertical sides cannot exist in it (the ground would close over the road): it is an open cutting, at road level for 26 m
 *  either side of the centre line and easing back up to the ground by 52 m; the rail crosses it on a long span (buildIndustrialCircuit) */
export function carveIndustrialCutting(heights: Float32Array, W: number, H: number, mpp: number, ox: number, oz: number, P: { x: number; z: number }[], ys: number[], ground: (x: number, z: number) => number): number {
  let cells = 0;
  P.forEach((p, i) => {
    const g = ground(p.x, p.z); if (ys[i] > g - 0.4) return;
    const R0 = 26, R = 52, ci = Math.round((p.x - ox) / mpp + W / 2), cj = Math.round((p.z - oz) / mpp + H / 2), rc = Math.ceil(R / mpp);
    for (let j = Math.max(0, cj - rc); j <= Math.min(H - 1, cj + rc); j++) for (let ii = Math.max(0, ci - rc); ii <= Math.min(W - 1, ci + rc); ii++) {
      const x = ((ii - W / 2) * mpp) + ox, z = ((j - H / 2) * mpp) + oz;
      const d = Math.hypot(x - p.x, z - p.z); if (d > R) continue;
      const w = d <= R0 ? 1 : 1 - ((d - R0) / (R - R0)) ** 2 * (3 - 2 * (d - R0) / (R - R0));
      const k = j * W + ii, t = ys[i] - 0.3, nh = heights[k] + (t - heights[k]) * w;
      if (nh < heights[k]) { heights[k] = nh; cells++; }
    }
  });
  return cells;
}

/**
 * The road's formation, the way a civil engineer builds one: the ground under the course and its verges is made flat at the road's own design height
 * across the whole width (cut on the high side, fill on the low side), then eased back into the land with a cut slope and a fill embankment. The cutting
 * above only digs where the course runs below ground; on a hillside the 12 m terrain grid otherwise rose through the pavement on the uphill edge.
 * Fill first, cut second, so where two legs meet (the bridge over the underpass) the lower leg's cutting wins; no fill under a deck (> 4 m up) or into the water (piers stand out over it).
 */
export function carveCourseFormation(heights: Float32Array, W: number, H: number, mpp: number, ox: number, oz: number, P: { x: number; z: number }[], ys: number[]): { cut: number; filled: number } {
  const FLAT = 20, CUT_R = 52, FILL_R = 44, n = H * W;
  const ease = (t: number): number => 1 - t * t * (3 - 2 * t);
  const each = (R: number, fn: (k: number, d: number, i: number) => void): void => P.forEach((p, i) => {
    const ci = Math.round((p.x - ox) / mpp + W / 2), cj = Math.round((p.z - oz) / mpp + H / 2), rc = Math.ceil(R / mpp);
    for (let j = Math.max(0, cj - rc); j <= Math.min(H - 1, cj + rc); j++) for (let ii = Math.max(0, ci - rc); ii <= Math.min(W - 1, ci + rc); ii++) {
      const d = Math.hypot((ii - W / 2) * mpp + ox - p.x, (j - H / 2) * mpp + oz - p.z); if (d <= R) fn(j * W + ii, d, i);
    }
  });
  // fill: the nearest course point sets the level (an embankment), raise only
  const best = new Float32Array(n).fill(1e9), lvl = new Float32Array(n);
  each(FILL_R, (k, d, i) => { if (d < best[k]) { best[k] = d; lvl[k] = ys[i] - 0.3; } });
  let filled = 0, cut = 0;
  for (let k = 0; k < n; k++) {
    if (best[k] > FILL_R) continue;
    const t = lvl[k], h = heights[k]; if (t <= h || t - h > 4 || h < 2.5) continue;   // and never fill the water under a pier or a wharf
    const w = best[k] <= FLAT ? 1 : ease((best[k] - FLAT) / (FILL_R - FLAT));
    heights[k] = h + (t - h) * w; filled++;
  }
  // cut: every course point digs down to its level, lower only (the lowest leg wins)
  each(CUT_R, (k, d, i) => {
    const t = ys[i] - 0.3, h = heights[k]; if (t >= h) return;
    const w = d <= FLAT ? 1 : ease((d - FLAT) / (CUT_R - FLAT)), nh = h + (t - h) * w;
    if (nh < h) { heights[k] = nh; cut++; }
  });
  return { cut, filled };
}

export function buildIndustrialCircuit(o: { path: { x: number; z: number }[]; ground: (x: number, z: number) => number; roadMaterial?: THREE.Material; ys?: number[]; grade?: GradeFeature[] }): IndustrialCircuit {
  const P = o.path, n = P.length;
  const group = new THREE.Group(); group.name = 'industrial-circuit';
  const LIFT = 0.42;                                              // over the yard pads (0.3 m above the ground)
  const asphalt = o.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.85 });
  // the road's own height: its design profile where it has one (bridge, underpass), else the ground
  const yAt = (i: number): number => (o.ys ? o.ys[i] : o.ground(P[i].x, P[i].z)) + LIFT;
  const tan = (i: number): { tx: number; tz: number } => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n]; const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { tx: dx / l, tz: dz / l }; };

  const strip = (half: number, off: number, lift: number, mat: THREE.Material, uvLen: number, closed = true): THREE.Mesh => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = []; let dist = 0;
    const m = closed ? n + 1 : n;
    for (let k = 0; k < m; k++) {
      const i = k % n, { tx, tz } = tan(i), nx = -tz, nz = tx, p = P[i];
      if (k > 0) dist += Math.hypot(p.x - P[(k - 1) % n].x, p.z - P[(k - 1) % n].z);
      const y = yAt(i) + lift;
      pos.push(p.x + nx * (off + half), y, p.z + nz * (off + half), p.x + nx * (off - half), y, p.z + nz * (off - half)); uv.push(0, dist / uvLen, 1, dist / uvLen);
    }
    for (let k = 0; k < m - 1; k++) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; return mesh;
  };
  const road = strip(6.2, 0, 0, asphalt, 8); road.name = 'industrial-circuit-road'; group.add(road);
  const paint = (c: number): THREE.Material => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  group.add(strip(0.09, -5.7, 0.03, paint(0xeeeeea), 8), strip(0.09, 5.7, 0.03, paint(0xeeeeea), 8));

  // start line: a chequered band across the road at the first point
  {
    const { tx, tz } = tan(0), nx = -tz, nz = tx, p = P[0], y = yAt(0) + 0.04;
    const cells = 12, rows = 2, len = 1.2;
    for (let c = 0; c < cells; c++) for (let r = 0; r < rows; r++) {
      const off = -6.0 + (c + 0.5) * (12.0 / cells), along = (r - 0.5) * len * 0.5;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(12.0 / cells, len * 0.5), paint((c + r) % 2 ? 0x111111 : 0xf2f2f2));
      q.rotation.x = -Math.PI / 2; q.rotation.z = -Math.atan2(tx, tz) + Math.PI; q.position.set(p.x + nx * off + tx * along, y, p.z + nz * off + tz * along); group.add(q);
    }
  }

  // where the course passes close to itself (a hairpin, two legs side by side) one leg's barriers would stand on the other leg's road, and the car (whose barrier
  // test only looks at the nearest leg) drove straight through them: nothing stands within 7.6 m of another part of the line
  const CELL = 12, hash = new Map<number, number[]>();
  P.forEach((p, i) => { const key = Math.floor(p.x / CELL) * 100003 + Math.floor(p.z / CELL); let a = hash.get(key); if (!a) hash.set(key, a = []); a.push(i); });
  const onOtherLeg = (x: number, z: number, i: number, r = 7.6): boolean => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of hash.get((cx + a) * 100003 + cz + b) ?? []) {
      const di = Math.min(Math.abs(j - i), n - Math.abs(j - i)); if (di < 8) continue;           // this leg itself
      if (Math.hypot(P[j].x - x, P[j].z - z) < r) return true;
    }
    return false;
  };
  /** within the road and its edge strip (6.3 m) of any point of the line, this leg included */
  const inRoad = (x: number, z: number): boolean => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of hash.get((cx + a) * 100003 + cz + b) ?? []) if (Math.hypot(P[j].x - x, P[j].z - z) < 6.3) return true;
    return false;
  };
  // concrete barriers either side, a block every 3 m
  {
    const geo = new THREE.BoxGeometry(0.55, 0.95, 3.0), mat = new THREE.MeshStandardMaterial({ color: 0xb5b3ac, roughness: 0.92 });
    const im = new THREE.InstancedMesh(geo, mat, n * 6 * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], len = Math.hypot(b.x - a.x, b.z - a.z), { tx, tz } = tan(i), nx = -tz, nz = tx;
      q.setFromAxisAngle(up, Math.atan2(b.x - a.x, b.z - a.z));
      for (let s = 1.5; s < len; s += 3.0) for (const side of [-1, 1]) {
        const x = a.x + (b.x - a.x) * (s / len) + nx * side * 6.9, z = a.z + (b.z - a.z) * (s / len) + nz * side * 6.9;
        if (onOtherLeg(x, z, i)) continue;
        // a 3 m block square to its segment: through a sharp chicane its ends swing in over the road edge (5.3 m from the line on the civic boulevard)
        const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
        if (inRoad(x + ux * 1.5, z + uz * 1.5) || inRoad(x - ux * 1.5, z - uz * 1.5)) continue;
        const yb = o.ys ? Math.max(o.ys[i], Math.min(o.ground(x, z), o.ys[i] + 0.3)) + LIFT - 0.42 : o.ground(x, z);   // on the deck or in the cutting: the road's height
        tp.set(x, yb + 0.45, z); im.setMatrixAt(k++, m4.compose(tp, q, sc));
      }
    }
    im.count = k; im.castShadow = true; im.receiveShadow = true; group.add(im);
  }

  // tyre walls on the outside of the tight corners
  {
    const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.34, 10), mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.95 });
    const im = new THREE.InstancedMesh(geo, mat, 3000);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < n; i += 2) {
      const a = tan((i - 2 + n) % n), b = tan((i + 2) % n);
      const turn = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz);                  // signed: which way the road bends
      if (Math.abs(turn) < 0.16) continue;
      const side = turn > 0 ? -1 : 1, { tx, tz } = tan(i), nx = -tz, nz = tx;
      for (let row = 0; row < 3; row++) for (let h = 0; h < 3; h++) {
        if (k >= 3000) break;
        const off = 8.0 + row * 0.75, x = P[i].x + nx * side * off, z = P[i].z + nz * side * off;
        if (onOtherLeg(x, z, i)) continue;
        tp.set(x, (o.ys ? o.ys[i] : o.ground(x, z)) + 0.2 + h * 0.34, z); im.setMatrixAt(k++, m4.compose(tp, q, sc));
      }
    }
    im.count = k; im.castShadow = true; group.add(im);
  }
  // ---- the bridge and the underpass: structure where the road leaves the ground ----
  if (o.ys) {
    const conc = new THREE.MeshStandardMaterial({ color: 0x9c9a94, roughness: 0.88 }), steelM = new THREE.MeshStandardMaterial({ color: 0x5d6368, roughness: 0.55, metalness: 0.5 });
    const deckPos: number[] = [], deckIdx: number[] = [], wallPos: number[] = [], wallIdx: number[] = [];
    const pierGeo = new THREE.BoxGeometry(2.2, 1, 2.2), capGeo = new THREE.BoxGeometry(15.5, 1.1, 2.6);
    const piers: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let lastPier = -1e9, dist = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, { tx, tz } = tan(i), nx = -tz, nz = tx, p = P[i], q = P[j], { tx: tx2, tz: tz2 } = tan(j), nx2 = -tz2, nz2 = tx2;
      if (i) dist += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z);
      const y = yAt(i), y2 = yAt(j), g = o.ground(p.x, p.z), g2 = o.ground(q.x, q.z);
      // deck: a 1.2 m slab under the road wherever it stands clear of the ground, its edges dropped to show the deck's depth
      if (y - g > 1.6 || y2 - g2 > 1.6) {
        const b = deckPos.length / 3, W2 = 7.6;
        for (const [px, pz, yy, ax, az] of [[p.x, p.z, y, nx, nz], [q.x, q.z, y2, nx2, nz2]] as number[][]) deckPos.push(px + ax * W2, yy - 0.06, pz + az * W2, px - ax * W2, yy - 0.06, pz - az * W2, px + ax * W2, yy - 1.3, pz + az * W2, px - ax * W2, yy - 1.3, pz - az * W2);
        // top, bottom, both sides (vertex order: 0 L-top, 1 R-top, 2 L-bot, 3 R-bot for this point; +4 for the next)
        deckIdx.push(b, b + 4, b + 1, b + 1, b + 4, b + 5, b + 2, b + 3, b + 6, b + 3, b + 7, b + 6, b, b + 2, b + 4, b + 2, b + 6, b + 4, b + 1, b + 5, b + 3, b + 3, b + 5, b + 7);
        if (y - g > 2 && dist - lastPier > 26) {
          lastPier = dist; const h = y - 1.3 - (g - 0.5);
          qq.setFromAxisAngle(up, Math.atan2(tx, tz));
          for (const off of [-4.2, 4.2]) piers.push(m4.compose(new THREE.Vector3(p.x + nx * off, g - 0.5 + h / 2, p.z + nz * off), qq, new THREE.Vector3(1, h, 1)).clone());
          caps.push(m4.compose(new THREE.Vector3(p.x, y - 1.3 - 0.55, p.z), qq, new THREE.Vector3(1, 1, 1)).clone());
        }
      }
      // retaining walls: in the cutting, from the road up to the ground beside it, both sides
      for (const side of [-1, 1]) {
        const off = 8.4, ax = p.x + nx * side * off, az = p.z + nz * side * off, bx = q.x + nx2 * side * off, bz = q.z + nz2 * side * off;
        const ga = o.ground(ax, az), gb = o.ground(bx, bz);
        if (ga - y < 0.8 && gb - y2 < 0.8) continue;
        const b = wallPos.length / 3;
        wallPos.push(ax, y - 0.3, az, ax, Math.max(y, ga) + 0.9, az, bx, y2 - 0.3, bz, bx, Math.max(y2, gb) + 0.9, bz);
        wallIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const mk = (pos: number[], idx: number[], m: THREE.Material, name: string): void => {
      if (!idx.length) return;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    };
    const dm = conc.clone(); dm.side = THREE.DoubleSide;
    mk(deckPos, deckIdx, dm, 'industrial-bridge-deck');
    mk(wallPos, wallIdx, dm, 'industrial-retaining-walls');
    const inst = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], m: THREE.Material, name: string): void => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((x, k) => im.setMatrixAt(k, x)); im.name = name; im.castShadow = im.receiveShadow = true; group.add(im); };
    inst(pierGeo, piers, conc, 'industrial-bridge-piers'); inst(capGeo, caps, conc, 'industrial-bridge-pier-caps');
    // the rail bridge over the underpass: where the road is deepest below the ground, a steel girder span carrying the railway across the cutting
    for (const f of (o.grade ?? []).filter((g) => g.kind === 'underpass')) {
      let deep = 0, bd = 1e18; P.forEach((p, i) => { const d = (p.x - f.at[0]) ** 2 + (p.z - f.at[1]) ** 2; if (d < bd) { bd = d; deep = i; } });
      const { tx, tz } = tan(deep), p = P[deep], yr = o.ys[deep] + f.clear + 1.4;               // the rail's own height (the ground there is cut away)
      const span = new THREE.Group(); span.name = 'industrial-rail-bridge'; span.position.set(p.x, yr, p.z); span.rotation.y = Math.atan2(tx, tz);
      // local z along the road; the span runs across it (local x)
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): void => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; span.add(me); };
      const SPAN = 64;                                                                            // across the whole open cutting
      add(new THREE.BoxGeometry(SPAN, 1.1, 7), conc, 0, -0.75, 0);                               // deck slab
      for (const sz of [-3.3, 3.3]) add(new THREE.BoxGeometry(SPAN, 1.9, 0.5), steelM, 0, -1.6, sz); // girders
      for (const sz of [-3.5, 3.5]) add(new THREE.BoxGeometry(SPAN, 1.1, 0.25), steelM, 0, 0.55, sz); // parapets
      // piers: either side of the road (clear of the barriers) and halfway out, standing on the cutting floor
      const floor = yAt(deep) - 0.42 - 0.3 - yr;
      for (const sx of [-11, 11, -30, 30]) { const h = -2.55 - floor; if (h > 0.5) add(new THREE.BoxGeometry(1.8, h, 5), conc, sx, floor + h / 2, 0); }
      span.updateMatrixWorld(); group.add(span);
    }
  }
  return { group, road, path: P };
}
