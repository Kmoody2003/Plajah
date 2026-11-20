import * as THREE from 'three';

/**
 * Shared helpers for the Plajah asset library pieces (src/library/*): a seeded random, a cached material palette, and box / cylinder / prism / beam
 * primitives that add a mesh to a group in one call. Pieces are plain geometry with flat materials (colour, roughness, metalness): the surfacing is
 * the graphics lane's, and a piece built here can be swapped for a modelled one under the same id without its callers changing.
 */
export type Rand = () => number;
export function seeded(seed: number): Rand { let s = (seed | 0) % 2147483647 || 1; if (s < 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** one material per colour / roughness / metalness, shared by every piece (so merged batches stay few) */
export function mat(color: number, rough = 0.85, metal = 0, emissive = 0): THREE.MeshStandardMaterial {
  const k = `${color}|${rough}|${metal}|${emissive}`;
  let m = mats.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ? new THREE.Color(emissive) : undefined, emissiveIntensity: emissive ? 1 : 0 }); mats.set(k, m); }
  return m;
}
export const PAL = {
  concrete: 0xa9a7a0, darkConcrete: 0x7d7c78, steel: 0x8b9298, darkSteel: 0x4b5157, galvanized: 0xb4b9bc, corrugated: 0x9ea5a8, brick: 0x8a4a35,
  glass: 0x2b3d4a, roofDark: 0x55595c, asphalt: 0x2f3133, ballast: 0x6f6a63, sleeper: 0x4a3a2e, rail: 0x6b6460, yellow: 0xd9a52a, navy: 0x2a3b5a,
  rust: 0x7a3b23, tankWhite: 0xe6e4de, safetyYellow: 0xe8c12c, black: 0x1d1e20, red: 0xa8322b, white: 0xf1f1ee, green: 0x2e5b3c,
};

export class Kit {
  readonly g: THREE.Group;
  constructor(name: string) { this.g = new THREE.Group(); this.g.name = name; }
  private add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = shadow; mesh.receiveShadow = true; this.g.add(mesh); return mesh;
  }
  /** a box centred at (x, y, z) */
  box(x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, ry = 0): THREE.Mesh { return this.add(new THREE.BoxGeometry(w, h, d), m, x, y, z, ry); }
  /** a box standing on y0 */
  slab(x: number, y0: number, z: number, w: number, h: number, d: number, m: THREE.Material, ry = 0): THREE.Mesh { return this.box(x, y0 + h / 2, z, w, h, d, m, ry); }
  /** an upright cylinder standing on y0 */
  cyl(x: number, y0: number, z: number, r: number, h: number, m: THREE.Material, seg = 16, rTop = r): THREE.Mesh { return this.add(new THREE.CylinderGeometry(rTop, r, h, seg), m, x, y0 + h / 2, z); }
  /** a cylinder lying along local x (pipes, tank cars) */
  cylX(x: number, y: number, z: number, r: number, len: number, m: THREE.Material, seg = 14): THREE.Mesh { return this.add(new THREE.CylinderGeometry(r, r, len, seg), m, x, y, z, 0, 0, Math.PI / 2); }
  /** a cylinder lying along local z */
  cylZ(x: number, y: number, z: number, r: number, len: number, m: THREE.Material, seg = 14): THREE.Mesh { return this.add(new THREE.CylinderGeometry(r, r, len, seg), m, x, y, z, 0, Math.PI / 2, 0); }
  sphere(x: number, y: number, z: number, r: number, m: THREE.Material, seg = 18): THREE.Mesh { return this.add(new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)), m, x, y, z); }
  /** a dome (upper hemisphere) of radius r, flattened to height h, on y0 */
  dome(x: number, y0: number, z: number, r: number, h: number, m: THREE.Material): THREE.Mesh { const g = new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, h / r, 1); return this.add(g, m, x, y0, z); }
  /** a gable roof over a w x d footprint (ridge along z), eaves at y0, ridge h above */
  gable(x: number, y0: number, z: number, w: number, d: number, h: number, m: THREE.Material, ry = 0): THREE.Mesh {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    return this.add(g, m, x, y0, z, ry);
  }
  /** one sawtooth bay (a north-light roof): vertical glazed face toward -z, slope down to +z; w across, d along the slope */
  sawtooth(x: number, y0: number, z: number, w: number, d: number, h: number, m: THREE.Material): THREE.Mesh {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(-d / 2, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2);
    return this.add(g, m, x, y0, z);
  }
  /** a thin round bar from a to b (handrails, struts, lattice members) */
  beam(a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material): THREE.Mesh {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb) || 0.01;
    const mesh = this.add(new THREE.CylinderGeometry(r, r, len, 6), m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0, 0, 0, r > 0.08);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    return mesh;
  }
}
