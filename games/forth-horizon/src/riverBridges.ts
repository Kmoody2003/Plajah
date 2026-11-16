import * as THREE from 'three';
import { buildHeroBridge } from './heroBridge';

/**
 * The two high-level river bridges. Shipping uses this river, so the deck clears the water by 46 m (the tallest ships need about 40): the main span is the cable-stayed hero bridge
 * between the banks, and the road climbs to it on long viaduct approaches (5 % grade) carried on piers.
 */
export interface BridgeDef { name: string; a: { x: number; z: number }; b: { x: number; z: number }; deck: number; width: number }

export const RIVER_BRIDGES: BridgeDef[] = [
  { name: 'Halcyon Gateway Bridge', a: { x: 3288, z: 2748 }, b: { x: 4248, z: 2796 }, deck: 46, width: 22 },
  { name: 'Northgate Bridge', a: { x: 5928, z: -3888 }, b: { x: 6624, z: -3888 }, deck: 46, width: 22 },
];

export interface RiverBridges {
  group: THREE.Group;
  /** meshes the car can drive on (decks and approaches) */
  decks: THREE.Mesh[];
  /** the road's centre line, for surface lookups */
  path: { x: number; z: number }[];
  updateLed: (elapsed: number, nightFactor: number) => void;
}

export function buildRiverBridges(o: { ground: (x: number, z: number) => number; roadMaterial?: THREE.Material }): RiverBridges {
  const group = new THREE.Group(); group.name = 'river-bridges';
  const decks: THREE.Mesh[] = [];
  const path: { x: number; z: number }[] = [];
  const leds: ((t: number, n: number) => void)[] = [];
  const asphalt = o.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.85 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.92 });
  const rail = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, metalness: 0.6, roughness: 0.45 });
  const GRADE = 0.05;

  for (const br of RIVER_BRIDGES) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const hero = buildHeroBridge({ start: new THREE.Vector3(br.a.x, br.deck, br.a.z), end: new THREE.Vector3(br.b.x, br.deck, br.b.z), deckWidth: br.width, towerHeight: 118 });
    group.add(hero.group); leds.push(hero.updateLed);

    // the road: approach A (climbing), the span (level), approach B (descending): one ribbon, with its own piers
    const ga = o.ground(br.a.x, br.a.z), gb = o.ground(br.b.x, br.b.z);
    const la = Math.max(200, (br.deck - ga) / GRADE), lb = Math.max(200, (br.deck - gb) / GRADE);
    const pts: { x: number; z: number; y: number }[] = [];
    const step = 10;
    for (let t = -la; t <= L + lb; t += step) {
      const x = br.a.x + ux * t, z = br.a.z + uz * t;
      let y: number;
      if (t < 0) y = Math.max(o.ground(x, z) + 0.2, br.deck - (-t) * GRADE);                 // climbs, never under the ground
      else if (t > L) y = Math.max(o.ground(x, z) + 0.2, br.deck - (t - L) * GRADE);
      else y = br.deck;
      pts.push({ x, z, y });
    }
    const pos: number[] = [], uv: number[] = [], idx: number[] = []; let dist = 0;
    pts.forEach((p, i) => {
      if (i) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      pos.push(p.x + nx * br.width / 2, p.y, p.z + nz * br.width / 2, p.x - nx * br.width / 2, p.y, p.z - nz * br.width / 2); uv.push(0, dist / 10, 1, dist / 10);
    });
    for (let i = 0; i < pts.length - 1; i++) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    for (const p of pts) path.push({ x: p.x, z: p.z });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // the hero bridge draws its own deck over the main span: this ribbon is what the car drives on there, and the visible road on both approaches
    const road = new THREE.Mesh(g, asphalt); road.receiveShadow = true; road.name = br.name + ' road'; group.add(road); decks.push(road);

    // parapets and piers along the approaches (the span has its own)
    const barrierGeo = new THREE.BoxGeometry(2.0, 1.1, 0.5);
    const nb = pts.length;
    const rails = new THREE.InstancedMesh(barrierGeo, rail, nb * 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3();
    q.setFromAxisAngle(up, Math.atan2(-uz, ux));
    let k = 0;
    pts.forEach((p, i) => { if (i % 1 === 0 && (p.y < br.deck - 0.2 || true)) for (const s of [-1, 1]) { tp.set(p.x + nx * s * (br.width / 2 + 0.2), p.y + 0.55, p.z + nz * s * (br.width / 2 + 0.2)); rails.setMatrixAt(k++, m4.compose(tp, q, sc)); } });
    rails.count = k; rails.castShadow = true; group.add(rails);
    const piers: { x: number; z: number; top: number; bot: number }[] = [];
    pts.forEach((p, i) => {
      const t = i * step - la;
      if (i % 4 === 0 && (t < 0 || t > L)) { const gr = o.ground(p.x, p.z); if (p.y - gr > 4) piers.push({ x: p.x, z: p.z, top: p.y - 1.2, bot: gr - 1.5 }); }
    });
    const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), conc, piers.length * 2 + 1);
    let pk = 0;
    for (const p of piers) for (const s of [-1, 1]) { const h = p.top - p.bot; tp.set(p.x + nx * s * (br.width / 2 - 3.2), p.bot + h / 2, p.z + nz * s * (br.width / 2 - 3.2)); sc.set(2.4, h, 2.4); pil.setMatrixAt(pk++, m4.compose(tp, q, sc)); }
    pil.count = pk; pil.castShadow = pil.receiveShadow = true; group.add(pil);
    // the cross-beam on each pier cap
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), conc, piers.length + 1); let ck = 0;
    for (const p of piers) { tp.set(p.x, p.top + 0.3, p.z); sc.set(2.8, 1.5, br.width - 1.5); caps.setMatrixAt(ck++, m4.compose(tp, q, sc)); }
    caps.count = ck; caps.castShadow = true; group.add(caps);
    sc.set(1, 1, 1);
  }
  return { group, decks, path, updateLed: (t, n) => { for (const f of leds) f(t, n); } };
}
