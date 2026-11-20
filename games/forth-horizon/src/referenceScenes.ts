import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HOLLOW, MILLBROOK, BRIDGE, type Pt } from './countryScenes';

/**
 * The reference scenes (docs/apex-elohim/reference-scenes.md): every one of Kenne's target shots has a real place on the map and a camera spot here.
 * buildReferenceDressing() adds what the places were missing to read as their shot:
 *  - 3  the dune coast road: sand blown across the shoulders onto the asphalt (shoreline highway along the dunes);
 *  - 4  the lake bridge (the straight east-west road at z -4380 crossing the lake south of the finger lake): lamp posts along its parapets;
 *  - 5  the Millbrook farm road: hedgerows along it, wind turbines on the high ground behind the farm (rotors turn);
 *  - 8  the autumn suburban street (Eastside straight): leaf piles on the tree lawns, leaves at the curb, utility poles and wires, a crowd watching;
 *  - 10 the industrial circuit: brick smokestacks in the works beside it;
 *  - 2  the cul-de-sac: leaves along the curb and on the tree lawns, rain puddles at the gutters;
 *  - 9  the cliff road: a light plane circling the coast above the cliff (prop turns, banks through the turns).
 * autumnLeaf() gives the street trees on the autumn street and round the court their autumn leaf colour (src/ezforest.ts takes it per tree).
 * Plain geometry and instanced meshes (no new materials work: the look is the graphics lane's).
 */
export interface RefScene { n: number; id: string; name: string; cam: [number, number, number]; at: [number, number, number]; /** heights above the ground there */ rel?: boolean }

/** the suburban straight lined with houses (Eastside), for scene 8; the cul-de-sac for scene 2 is beside it */
const AUTUMN = { a: { x: 7600, z: 2050 }, b: { x: 7934, z: 2209 } };
/** the lake crossing for scene 4: the country road at z -4380 */
const LAKE_ROAD_Z = -4380;
/** the cul-de-sac bulb for scene 2 */
const COURT = { x: 7261, z: 1960 };

/** autumn leaf colours, as multipliers on the leaf material (orange, red maple, yellow, rust) */
const AUTUMN_LEAF = [0xff9173, 0xf56161, 0xffb57a, 0xe8835c];
/** the street trees along the autumn street and round the court turn: a leaf colour for them, or undefined (r: the tree's own random 0..1) */
export function autumnLeaf(x: number, z: number, r: number): number | undefined {
  const ux0 = AUTUMN.b.x - AUTUMN.a.x, uz0 = AUTUMN.b.z - AUTUMN.a.z, L = Math.hypot(ux0, uz0), ux = ux0 / L, uz = uz0 / L;
  const t = (x - AUTUMN.a.x) * ux + (z - AUTUMN.a.z) * uz, d = Math.abs(-(x - AUTUMN.a.x) * uz + (z - AUTUMN.a.z) * ux);
  const onStreet = t > -60 && t < L + 60 && d < 24, atCourt = Math.hypot(x - COURT.x, z - COURT.z) < 90;
  if (!onStreet && !atCourt) return undefined;
  if (r > 0.92) return undefined;                                                           // the odd tree is still green
  return AUTUMN_LEAF[Math.floor(r * 97) % AUTUMN_LEAF.length];
}

export const REF_SCENES: RefScene[] = [
  { n: 1, id: 'covered-bridge', name: 'Covered bridge, misty river', cam: [BRIDGE.at.x - 38, 5, BRIDGE.at.z + 30], at: [BRIDGE.at.x, 4, BRIDGE.at.z], rel: true },
  { n: 2, id: 'cul-de-sac', name: 'Suburban cul-de-sac', cam: [7225, 2.2, 1990], at: [7261, 0.5, 1960], rel: true },
  { n: 3, id: 'dune-coast-road', name: 'Dune coast road', cam: [-5339, 2.2, -144], at: [-5588, 1.5, 100], rel: true },
  { n: 4, id: 'lake-bridge', name: 'Long bridge over the lake', cam: [1780, 4, -4240], at: [2050, 5, LAKE_ROAD_Z] },
  { n: 5, id: 'farm-s-curve', name: 'Farm S-curve and hairpin', cam: [-900, 90, -1350], at: [-1150, 30, -2300], rel: true },
  { n: 6, id: 'barn-silo', name: 'Red barn, silo and corn', cam: [-1390, 4, -1210], at: [-1330, 6, -1255], rel: true },
  { n: 7, id: 'dune-circuit', name: 'Dune circuit, pines and kerbs', cam: [-5880, 6, 2200], at: [-5904, 1, 2600], rel: true },
  { n: 8, id: 'autumn-street', name: 'Autumn suburban street', cam: [7700, 1.7, 2108], at: [7880, 1.5, 2190], rel: true },
  { n: 9, id: 'cliff-road', name: 'Coast cliff road', cam: [-5396, 30, 1549], at: [-5068, 3, 1524], rel: true },
  { n: 10, id: 'industrial-circuit', name: 'Industrial street circuit', cam: [3700, 3, 215], at: [4050, 2, 215], rel: true },
  { n: 11, id: 'tunnel-exit', name: 'Tunnel exit', cam: [-5430, 2.5, 735], at: [-5367, 3, 941], rel: true },
];

export interface RefDressing { group: THREE.Group; update: (t: number) => void; counts: Record<string, number> }

export function buildReferenceDressing(o: {
  ground: (x: number, z: number) => number;
  water: (x: number, z: number) => boolean;
  /** inside a building footprint, with margin */
  building: (x: number, z: number, m: number) => boolean;
  /** distance to the nearest road centreline we know about */
  roadDist: (x: number, z: number) => number;
  /** the paved roads as drawn (countryScenes.pavedRuns) */
  paved: { line: Pt[]; ys: number[]; half: number }[];
  /** the shoreline highway */
  shore?: { xz: number[][]; y: number[]; gallery: { from: number; to: number } } | null;
  /** the industrial circuit's centreline */
  industrial?: { x: number; z: number }[];
  /** driveway mouths (no leaf piles across a drive) */
  mouths: { x: number; z: number }[];
  /** the town streets (user_streets.json), carriageway half-width */
  streets?: { line: Pt[]; half: number }[];
}): RefDressing {
  const group = new THREE.Group(); group.name = 'reference-dressing';
  let seed = 4421; const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const counts: Record<string, number> = {};
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: { x: number; y: number; z: number; ry?: number; rx?: number; rz?: number; sx?: number; sy?: number; sz?: number; c?: number }[], name: string, shadow = true): void => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0); q.setFromEuler(e);
      m.setMatrixAt(i, m4.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)));
      if (it.c !== undefined) m.setColorAt(i, col.setHex(it.c));
    });
    m.castShadow = shadow; m.receiveShadow = true; m.name = name; m.computeBoundingSphere(); group.add(m);
    counts[name] = (counts[name] ?? 0) + list.length;
  };
  const near = (pts: { x: number; z: number }[], x: number, z: number, r: number): boolean => pts.some((m) => (m.x - x) ** 2 + (m.z - z) ** 2 < r * r);
  const segDist = (line: Pt[], x: number, z: number): number => {
    let best = 1e9;
    for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)); best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z)); }
    return best;
  };
  const runNear = (x: number, z: number): { line: Pt[]; ys: number[]; half: number } | null => {
    let best = null, bd = 30;
    for (const r of o.paved) for (let i = 0; i < r.line.length; i += 3) { const d = Math.hypot(r.line[i].x - x, r.line[i].z - z); if (d < bd) { bd = d; best = r; } }
    return best;
  };
  const updates: ((t: number) => void)[] = [];

  // ---- 5: hedgerows along Millbrook Road, and wind turbines on the high ground behind the farm ----
  {
    const mill = runNear(MILLBROOK[3].x, MILLBROOK[3].z);
    const hollow = HOLLOW;
    const hedges: { x: number; y: number; z: number; ry: number; sx: number; sy: number; c: number }[] = [];
    if (mill) {
      const L = mill.line, off = mill.half + 5.5;
      for (const side of [-1, 1]) for (let i = 1; i < L.length - 1; i++) {
        const a = L[i - 1], b = L[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * side, nz = dx / l * side;
        const x = L[i].x + nx * off, z = L[i].z + nz * off;
        if (Math.hypot(x - BRIDGE.at.x, z - BRIDGE.at.z) < 70 || o.water(x, z) || segDist(hollow, x, z) < 12 || o.building(x, z, 3)) continue;
        if (segDist(L, x, z) < off - 0.5) continue;                                        // the inside of a tight bend: the hedge would cross the road
        if (rnd() < 0.08) continue;                                                         // field gates
        hedges.push({ x, y: o.ground(x, z) + 0.75, z, ry: Math.atan2(dx, dz), sx: 1.1 + rnd() * 0.5, sy: 1.0 + rnd() * 0.5, c: [0x2f4a22, 0x35552a, 0x2a4220][Math.floor(rnd() * 3)] });
      }
    }
    inst(hedgeGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.95 }), hedges, 'hedgerows');
    // turbines: the highest ground 450-1150 m round the farm road, 160 m apart, clear of roads and water
    const cand: { x: number; z: number; h: number }[] = [];
    for (let x = -2600; x <= -200; x += 40) for (let z = -3200; z <= -800; z += 40) {
      const d = Math.hypot(x + 1050, z + 1600); if (d < 450 || d > 1150) continue;                                    // within sight of the S-curve and the hairpin
      if (o.water(x, z) || o.roadDist(x, z) < 45 || Math.hypot(x - BRIDGE.at.x, z - BRIDGE.at.z) < 250 || o.building(x, z, 20) || segDist(MILLBROOK, x, z) < 60 || segDist(hollow, x, z) < 40) continue;
      cand.push({ x, z, h: o.ground(x, z) });
    }
    cand.sort((a, b) => b.h - a.h);
    const sites: { x: number; z: number; h: number }[] = [];
    for (const c of cand) { if (sites.length >= 6) break; if (sites.every((s2) => Math.hypot(s2.x - c.x, s2.z - c.z) > 170)) sites.push(c); }
    const white = new THREE.MeshStandardMaterial({ color: 0xeef0f0, roughness: 0.5, metalness: 0.1 });
    const towerGeo = new THREE.CylinderGeometry(1.4, 2.4, 78, 14); towerGeo.translate(0, 39, 0);
    const nacGeo = new THREE.BoxGeometry(3.4, 3.6, 10); nacGeo.translate(0, 0, -2.5);
    const hubGeo = new THREE.SphereGeometry(1.5, 12, 8); hubGeo.scale(1, 1, 1.5);
    const bladeGeo = new THREE.BoxGeometry(1.6, 38, 0.35); bladeGeo.translate(0, 20, 0);
    const yaw = -Math.PI / 2 + 0.25;                                                       // into the prevailing westerly
    const rotors: THREE.Object3D[] = [];
    sites.forEach((st, k) => {
      const tower = new THREE.Mesh(towerGeo, white); tower.position.set(st.x, st.h - 1, st.z); tower.castShadow = true;
      const head = new THREE.Group(); head.position.set(st.x, st.h - 1 + 79, st.z); head.rotation.y = yaw;
      const nac = new THREE.Mesh(nacGeo, white); nac.castShadow = true; head.add(nac);
      const rotor = new THREE.Group(); rotor.position.set(0, 0, 3.4);
      rotor.add(new THREE.Mesh(hubGeo, white));
      for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(bladeGeo, white); bl.rotation.z = (b * Math.PI * 2) / 3; bl.castShadow = true; rotor.add(bl); }
      rotor.rotation.z = k * 0.7; head.add(rotor); rotors.push(rotor);
      group.add(tower, head);
    });
    counts.turbines = sites.length;
    console.log('turbines at', JSON.stringify(sites.map((t) => [Math.round(t.x), Math.round(t.h), Math.round(t.z)])));
    updates.push((t) => { rotors.forEach((r, k) => { r.rotation.z = k * 0.7 + t * (1.35 + (k % 3) * 0.08); }); });
  }

  // ---- 3: sand drifting onto the shoreline highway along the dunes ----
  if (o.shore) {
    const hw = o.shore, patches: { x: number; y: number; z: number; ry: number; sx: number; sz: number; c: number }[] = [];
    const HALF = 4.4;
    for (let i = 55; i < Math.min(hw.xz.length - 1, 150); i++) {
      if (i >= hw.gallery.from - 2 && i <= hw.gallery.to + 2) continue;
      const a = hw.xz[i], b = hw.xz[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      for (let t = 0; t < L; t += 4) {
        for (const side of [-1, 1]) {
          if (rnd() > (side < 0 ? 0.5 : 0.3)) continue;                                    // more on one side: the wind off the lake
          const x = a[0] + ux * t, z = a[1] + uz * t, y = hw.y[i] + (hw.y[i + 1] - hw.y[i]) * (t / L) + 0.12;     // the carriageway is drawn 0.12 m over the design line
          // a drift: three or four overlapping blobs, deepest at the edge line, tapering in toward the lane, so the edge is ragged
          const along = 3 + rnd() * 6, depth = 0.8 + rnd() * 1.6, blobs = 3 + Math.floor(rnd() * 2), ry = Math.atan2(ux, uz);
          for (let k = 0; k < blobs; k++) {
            const f = (k / (blobs - 1) - 0.5) * along, w = depth * (1 - Math.abs(f) / along) * (0.7 + rnd() * 0.5);
            const inset = HALF + 0.3 - w * 0.5 - rnd() * 0.4;
            const cx = x - uz * side * inset + ux * f, cz = z + ux * side * inset + uz * f;
            patches.push({ x: cx, y: y + 0.03 + k * 0.002, z: cz, ry: ry + (rnd() - 0.5) * 0.5, sx: w, sz: along * (0.35 + rnd() * 0.3), c: [0xd9c69e, 0xcfb98c, 0xe2d2ae, 0xc8b086][Math.floor(rnd() * 4)] });
          }
        }
      }
    }
    const sandGeo = new THREE.CircleGeometry(0.5, 14); sandGeo.rotateX(-Math.PI / 2);
    inst(sandGeo, new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), patches, 'sand-drift', false);
  }

  // ---- 4: lamp posts along the lake bridge ----
  {
    const br = runNear(2000, LAKE_ROAD_Z);
    const posts: { x: number; y: number; z: number; ry: number }[] = [], heads: { x: number; y: number; z: number; ry: number }[] = [];
    if (br) {
      let acc = 0, side = 1;
      for (let i = 1; i < br.line.length; i++) {
        const a = br.line[i - 1], b = br.line[i]; acc += Math.hypot(b.x - a.x, b.z - a.z);
        if (acc < 44 || !o.water(b.x, b.z)) continue;
        acc = 0; side = -side;
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * side, nz = dx / l * side, off = br.half + 0.55;
        const x = b.x + nx * off, z = b.z + nz * off, y = br.ys[i] + 0.9;
        const ry = Math.atan2(-nx, -nz);                                                     // the arm reaches over the road
        posts.push({ x, y, z, ry }); heads.push({ x: x - nx * 2.2, y: y + 9.6, z: z - nz * 2.2, ry });
      }
    }
    const pole = new THREE.CylinderGeometry(0.11, 0.17, 10, 8); pole.translate(0, 5, 0);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 2.4); arm.translate(0, 9.8, -1.1);
    const grey = new THREE.MeshStandardMaterial({ color: 0x6d7175, metalness: 0.6, roughness: 0.45 });
    inst(pole, grey, posts, 'bridge-lamps');
    inst(arm, grey, posts, 'bridge-lamp-arms', false);
    inst(new THREE.BoxGeometry(0.42, 0.16, 0.9), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, emissive: 0xffd49a, emissiveIntensity: 0.55 }), heads, 'bridge-lamp-heads', false);
  }

  // ---- 8: the autumn street ----
  {
    const ux0 = AUTUMN.b.x - AUTUMN.a.x, uz0 = AUTUMN.b.z - AUTUMN.a.z, L = Math.hypot(ux0, uz0), ux = ux0 / L, uz = uz0 / L, nx = -uz, nz = ux;
    const HALF = 4.25, LAWN = HALF + 0.2 + 1.1;                                              // the middle of the 2.2 m tree lawn (src/townStreets.ts)
    const piles: { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; c: number }[] = [];
    const litter: { x: number; y: number; z: number; ry: number; sx: number; sz: number; c: number }[] = [];
    const leafC = [0x9a4f22, 0x86401a, 0xae6a2a, 0x6e3414, 0xb98a3c, 0x7d5a26];
    const ok = (x: number, z: number): boolean => !o.water(x, z) && !o.building(x, z, 0.5) && !near(o.mouths, x, z, 4.5);
    for (let t = -40; t < L + 40; t += 3) {
      for (const side of [-1, 1]) {
        const bx = AUTUMN.a.x + ux * t, bz = AUTUMN.a.z + uz * t;
        if (rnd() < 0.3) {                                                                   // a raked pile on the tree lawn
          const x = bx + nx * side * (LAWN + (rnd() - 0.5) * 0.8), z = bz + nz * side * (LAWN + (rnd() - 0.5) * 0.8);
          if (ok(x, z)) piles.push({ x, y: o.ground(x, z) + 0.02, z, ry: rnd() * 6.28, sx: 0.45 + rnd() * 0.4, sy: 0.16 + rnd() * 0.16, sz: 0.5 + rnd() * 0.6, c: leafC[Math.floor(rnd() * leafC.length)] });
        }
        if (rnd() < 0.6) {                                                                  // leaves gathered in the gutter and blown onto the road edge
          const x = bx + nx * side * (HALF - 0.4 - rnd() * 1.1), z = bz + nz * side * (HALF - 0.4 - rnd() * 1.1);
          if (!o.water(x, z) && !near(o.mouths, x, z, 3)) litter.push({ x, y: o.ground(x, z) + 0.12, z, ry: Math.atan2(ux, uz) + (rnd() - 0.5) * 0.6, sx: 0.3 + rnd() * 0.4, sz: 0.6 + rnd() * 1.2, c: leafC[Math.floor(rnd() * leafC.length)] });
        }
      }
    }
    const pileGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    inst(pileGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), piles, 'leaf-piles');
    const litGeo = new THREE.CircleGeometry(0.5, 10); litGeo.rotateX(-Math.PI / 2);
    inst(litGeo, new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), litter, 'leaf-litter', false);
    // utility poles on the west side, 38 m apart, three wires sagging between them
    const poles: { x: number; y: number; z: number; ry: number }[] = [];
    const PO = HALF + 0.2 + 2.2 + 1.5 + 0.6;                                                 // just behind the sidewalk
    for (let t = -30; t < L + 30; t += 38) {
      const x = AUTUMN.a.x + ux * t - nx * PO, z = AUTUMN.a.z + uz * t - nz * PO;
      if (o.water(x, z) || o.building(x, z, 1) || near(o.mouths, x, z, 3)) continue;
      poles.push({ x, y: o.ground(x, z), z, ry: Math.atan2(ux, uz) });
    }
    const pg = new THREE.CylinderGeometry(0.13, 0.17, 11, 8); pg.translate(0, 5.5, 0);
    const xg = new THREE.BoxGeometry(2.4, 0.14, 0.14); xg.translate(0, 10.2, 0);
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
    inst(pg, wood, poles, 'utility-poles'); inst(xg, wood, poles, 'utility-crossarms', false);
    const wire: number[] = [];
    for (let i = 0; i < poles.length - 1; i++) {
      const A = poles[i], B = poles[i + 1];
      if (Math.hypot(B.x - A.x, B.z - A.z) > 60) continue;
      for (const lat of [-1.05, 0, 1.05]) {
        const ax = A.x + nx * lat, az = A.z + nz * lat, bx = B.x + nx * lat, bz = B.z + nz * lat;
        let px = ax, py = A.y + 10.3, pz = az;
        for (let k = 1; k <= 10; k++) { const f = k / 10, x = ax + (bx - ax) * f, z = az + (bz - az) * f, y = A.y + (B.y - A.y) * f + 10.3 - Math.sin(f * Math.PI) * 0.7; wire.push(px, py, pz, x, y, z); px = x; py = y; pz = z; }
      }
    }
    if (wire.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)); const w = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1c1c1c })); w.name = 'utility-wires'; group.add(w); }
    // a crowd along both sidewalks around the middle of the straight, watching the road
    const bodies: { x: number; y: number; z: number; ry: number; sy: number; c: number }[] = [], headsP: { x: number; y: number; z: number; c: number }[] = [];
    const shirts = [0x2b4c7e, 0xb83a2e, 0x2e6b46, 0xd8b23a, 0x444444, 0xe8e2d6, 0x6a3d7a, 0x1f1f1f, 0xc46a2c], skin = [0xe8c2a0, 0xc68c64, 0x8d5a3b, 0x5c3a24, 0xf1d3b8];
    for (let k = 0; k < 64; k++) {
      const side = k % 2 ? 1 : -1, t = L * 0.35 + rnd() * L * 0.3, off = HALF + 0.2 + 2.2 + 0.3 + rnd() * 1.2;
      const x = AUTUMN.a.x + ux * t + nx * side * off, z = AUTUMN.a.z + uz * t + nz * side * off;
      if (o.building(x, z, 0.4) || near(o.mouths, x, z, 2.2) || near(bodies, x, z, 0.75)) continue;
      const h = 0.85 + rnd() * 0.25, gy = o.ground(x, z);
      bodies.push({ x, y: gy, z, ry: Math.atan2(-nx * side, -nz * side) + (rnd() - 0.5) * 0.8, sy: h, c: shirts[Math.floor(rnd() * shirts.length)] });
      headsP.push({ x, y: gy + 1.62 * h + 0.13, z, c: skin[Math.floor(rnd() * skin.length)] });
    }
    const bodyGeo = new THREE.CapsuleGeometry(0.24, 1.0, 3, 8); bodyGeo.translate(0, 0.74, 0);
    inst(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), bodies, 'spectators');
    inst(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), headsP, 'spectator-heads', false);
  }

  // ---- 10: brick smokestacks in the works beside the industrial circuit ----
  if (o.industrial?.length) {
    const path = o.industrial.map((pt) => ({ x: pt.x, z: pt.z }));
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const pt of path) { x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x); z0 = Math.min(z0, pt.z); z1 = Math.max(z1, pt.z); }
    const cand: { x: number; z: number; d: number }[] = [];
    for (let x = x0 - 200; x <= x1 + 200; x += 12) for (let z = z0 - 200; z <= z1 + 200; z += 12) {
      const d = segDist(path, x, z); if (d < 28 || d > 140) continue;
      if (o.water(x, z) || o.building(x, z, 5) || o.roadDist(x, z) < 16) continue;
      cand.push({ x, z, d });
    }
    // near the start straight first (it is the shot), then the rest
    const st = path[0];
    cand.sort((a, b) => Math.hypot(a.x - st.x - 200, a.z - st.z) - Math.hypot(b.x - st.x - 200, b.z - st.z));
    const sites: { x: number; z: number }[] = [];
    for (const c of cand) { if (sites.length >= 3) break; if (sites.every((s2) => Math.hypot(s2.x - c.x, s2.z - c.z) > 45)) sites.push(c); }
    const brick = new THREE.MeshStandardMaterial({ color: 0x74402e, roughness: 0.9 }), band = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.8 }), cap = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.9 });
    sites.forEach((c, k) => {
      const h = 62 + k * 9, y = o.ground(c.x, c.z) - 0.5;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.4, h, 18), brick); stack.position.set(c.x, y + h / 2, c.z); stack.castShadow = true; group.add(stack);
      for (const f of [0.55, 0.9]) { const r = 2.1 + (3.4 - 2.1) * (1 - f); const b = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.12, r + 0.12, 2.2, 18), band); b.position.set(c.x, y + h * f, c.z); group.add(b); }
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.2, 1.6, 18), cap); top.position.set(c.x, y + h + 0.6, c.z); group.add(top);
      const base = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4, 8.5), brick); base.position.set(c.x, y + 2, c.z); base.castShadow = true; group.add(base);
    });
    counts.smokestacks = sites.length;
  }

  // ---- 2: the cul-de-sac after the rain: leaves along the curb and on the tree lawns, puddles at the gutters ----
  if (o.streets?.length) {
    const litter: { x: number; y: number; z: number; ry: number; sx: number; sz: number; c: number }[] = [];
    const puddles: { x: number; y: number; z: number; ry: number; sx: number; sz: number }[] = [];
    const leafC = [0x9a4f22, 0x86401a, 0xae6a2a, 0x6e3414, 0xb98a3c, 0x7d5a26];
    for (const r of o.streets) {
      if (!r.line.some((pt) => Math.hypot(pt.x - COURT.x, pt.z - COURT.z) < 40)) continue;
      const Ln = r.line;
      for (let i = 0; i < Ln.length - 1; i++) {
        const a = Ln[i], b = Ln[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
        for (let t = 0; t < l; t += 1.6) {
          const bx = a.x + ux * t, bz = a.z + uz * t;
          if (Math.hypot(bx - COURT.x, bz - COURT.z) > 75) continue;
          for (const side of [-1, 1]) {
            if (rnd() < 0.75) {                                                              // wet leaves in the gutter, a few blown out into the lane
              const off = r.half - 0.25 - Math.pow(rnd(), 2.2) * 2.6, x = bx + nx * side * off, z = bz + nz * side * off;
              if (!near(o.mouths, x, z, 2.5) && !o.water(x, z)) litter.push({ x, y: o.ground(x, z) + 0.12, z, ry: rnd() * 6.28, sx: 0.25 + rnd() * 0.35, sz: 0.3 + rnd() * 0.6, c: leafC[Math.floor(rnd() * leafC.length)] });
            }
            if (rnd() < 0.35) {                                                              // on the tree lawn
              const off = r.half + 0.2 + 0.3 + rnd() * 1.6, x = bx + nx * side * off, z = bz + nz * side * off;
              if (!near(o.mouths, x, z, 2.5) && !o.building(x, z, 0.3)) litter.push({ x, y: o.ground(x, z) + 0.05, z, ry: rnd() * 6.28, sx: 0.35 + rnd() * 0.5, sz: 0.4 + rnd() * 0.7, c: leafC[Math.floor(rnd() * leafC.length)] });
            }
            if (rnd() < 0.045) {                                                             // a puddle where the gutter holds water
              const off = r.half - 0.5 - rnd() * 0.9, x = bx + nx * side * off, z = bz + nz * side * off;
              if (!near(puddles, x, z, 3)) puddles.push({ x, y: o.ground(x, z) + 0.125, z, ry: Math.atan2(ux, uz) + (rnd() - 0.5) * 0.4, sx: 0.9 + rnd() * 1.1, sz: 1.6 + rnd() * 2.4 });
            }
          }
        }
      }
    }
    const disc = new THREE.CircleGeometry(0.5, 16); disc.rotateX(-Math.PI / 2);
    inst(disc, new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), litter, 'court-leaves', false);
    // standing water: dark and smooth (the proper wet-road look is the graphics lane's)
    inst(disc, new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.06, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), puddles, 'court-puddles', false);
  }

  // ---- 9: a light plane circling the coast above the cliff road ----
  {
    const C = { x: -5240, z: 1560 }, AX = 320, AZ = 820;                                     // along the shore, crossing the cliff shot
    const alt = Math.max(o.ground(-5068, 1524), o.ground(C.x, C.z), 0) + 125;
    const plane = lightPlane();
    group.add(plane.g);
    const period = 64;
    updates.push((t) => {
      const th = (t / period) * Math.PI * 2, x = C.x + AX * Math.cos(th), z = C.z + AZ * Math.sin(th);
      const vx = -AX * Math.sin(th), vz = AZ * Math.cos(th), ax = -AX * Math.cos(th), az = -AZ * Math.sin(th);
      const v = Math.hypot(vx, vz) || 1, k = (vx * az - vz * ax) / (v * v * v);              // signed curvature
      plane.g.position.set(x, alt + Math.sin(th * 2) * 6, z);
      plane.g.rotation.set(0, Math.atan2(vx, vz), Math.max(-0.5, Math.min(0.5, -k * 900)), 'YXZ');
      plane.prop.rotation.z = t * 55;
    });
    counts.plane = 1;
  }

  return { group, update: (t) => { for (const u of updates) u(t); }, counts };
}

/** a hedge section 1 m wide, 1.5 m high, 4.6 m long: overlapping lumpy clumps instead of a box (each vertex pushed by a hash of where it is, so the clumps stay closed) */
function hedgeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const clumps: [number, number, number, number, number, number][] = [                       // x, y, z, rx, ry, rz
    [0, -0.1, -1.7, 0.55, 0.7, 0.95], [0.05, 0.05, -0.55, 0.6, 0.78, 0.9], [-0.05, 0, 0.6, 0.58, 0.75, 0.95], [0, -0.05, 1.7, 0.55, 0.7, 0.9],
    [0, 0.45, -1.1, 0.45, 0.4, 0.8], [0, 0.5, 1.1, 0.45, 0.38, 0.8], [0, -0.55, 0, 0.6, 0.25, 2.3],
  ];
  for (const [x, y, z, rx, ry, rz] of clumps) { const g = new THREE.IcosahedronGeometry(1, 2); g.scale(rx, ry, rz); g.translate(x, y, z); g.deleteAttribute('uv'); parts.push(g); }
  const g = mergeGeometries(parts, false)!;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453, n = (h - Math.floor(h)) - 0.5;
    const f = 1 + n * 0.22;
    pos.setXYZ(i, x * f, y + (y > 0 ? n * 0.12 : 0), z + n * 0.08);
  }
  g.computeVertexNormals();
  return g;
}

/** a high-wing light plane, ~8 m long and 11 m span, nose toward +z */
function lightPlane(): { g: THREE.Group; prop: THREE.Mesh } {
  const g = new THREE.Group(); g.name = 'ref-light-plane';
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.4, metalness: 0.15 }), red = new THREE.MeshStandardMaterial({ color: 0xa8262c, roughness: 0.45 }), dark = new THREE.MeshStandardMaterial({ color: 0x222628, roughness: 0.5, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1e2a33, roughness: 0.1, metalness: 0.3 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; g.add(mesh); return mesh; };
  add(new THREE.CylinderGeometry(0.62, 0.7, 3.2, 12), white, 0, 0, 0.9, Math.PI / 2);          // cabin
  add(new THREE.CylinderGeometry(0.7, 0.18, 4.2, 12), white, 0, 0.12, -2.8, Math.PI / 2);      // tail cone
  add(new THREE.CylinderGeometry(0.45, 0.62, 1.1, 12), white, 0, -0.05, 3.05, Math.PI / 2);    // cowling
  add(new THREE.BoxGeometry(1.0, 0.5, 1.6), glass, 0, 0.45, 1.2);                               // windows
  add(new THREE.BoxGeometry(1.32, 0.18, 3.6), red, 0, -0.15, 0.4);                             // cheat line
  add(new THREE.BoxGeometry(11, 0.16, 1.5), white, 0, 0.78, 1.0);                              // the high wing
  for (const sd of [-1, 1]) { add(new THREE.BoxGeometry(0.08, 1.2, 0.12), dark, sd * 1.5, 0.15, 1.2, 0, 0, sd * 0.45); add(new THREE.BoxGeometry(0.25, 0.17, 1.5), red, sd * 5.4, 0.78, 1.0); }   // struts, wing tips
  add(new THREE.BoxGeometry(3.4, 0.1, 0.9), white, 0, 0.2, -4.6);                              // tailplane
  add(new THREE.BoxGeometry(0.1, 1.3, 1.1), red, 0, 0.85, -4.7, -0.3);                         // fin
  for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12), dark, sd * 1.0, -1.05, 1.0, 0, 0, Math.PI / 2);   // wheels
  add(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), dark, 0, -0.95, 2.9, 0, 0, Math.PI / 2);
  const prop = add(new THREE.BoxGeometry(1.9, 0.16, 0.05), dark, 0, -0.05, 3.65);
  g.scale.setScalar(1.15);
  return { g, prop };
}
