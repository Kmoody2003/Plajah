// Modular gothic fortress kit. Everything is real geometry (openings, merlons,
// cones) so silhouettes hold from any angle — no painted castle cards.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface KitMaterials {
  stone: THREE.Material;
  roof: THREE.Material;
  dark: THREE.Material;     // arch interiors / window voids
  iron: THREE.Material;
  windowGlow: THREE.Material;
}

const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;

/** Straight curtain wall with merlons along its top. Origin: bottom-centre of the outer face. */
export function crenellatedWall(length: number, height: number, thick = 3, merlonW = 1.3, gapW = 1.0, merlonH = 1.3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(length, height, thick);
  body.translate(0, height / 2, -thick / 2);
  parts.push(body);
  const step = merlonW + gapW;
  const n = Math.max(1, Math.floor((length + gapW) / step));
  const start = -((n * step - gapW) / 2) + merlonW / 2;
  for (let i = 0; i < n; i++) {
    const m = new THREE.BoxGeometry(merlonW, merlonH, 0.8);
    m.translate(start + i * step, height + merlonH / 2, -0.4);
    parts.push(m);
  }
  // Corbel course under the parapet — the shadow line that reads in the art.
  const corbel = new THREE.BoxGeometry(length, 0.45, 0.5);
  corbel.translate(0, height - 0.9, 0.2);
  parts.push(corbel);
  return merge(parts);
}

/** Round tower with corbelled crenellated parapet and steep conical slate roof. Origin: base centre. */
export function roundTower(m: KitMaterials, radius: number, height: number, roofH: number, opts: { merlons?: number; slits?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, height, 28, 1), m.stone);
  body.position.y = height / 2;
  const parapetR = radius * 1.12;
  const parapet = new THREE.Mesh(new THREE.CylinderGeometry(parapetR, radius, 1.2, 28, 1, true), m.stone);
  parapet.position.y = height + 0.6;
  const ringTop = new THREE.Mesh(new THREE.CylinderGeometry(parapetR, parapetR, 1.1, 28, 1), m.stone);
  ringTop.position.y = height + 1.75;
  const merlonParts: THREE.BufferGeometry[] = [];
  const n = opts.merlons ?? Math.max(8, Math.round((Math.PI * 2 * parapetR) / 2.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = new THREE.BoxGeometry(1.1, 1.2, 0.7);
    b.rotateY(-a);
    b.translate(Math.cos(a) * (parapetR - 0.3), height + 2.9, Math.sin(a) * (parapetR - 0.3));
    merlonParts.push(b);
  }
  const merlons = new THREE.Mesh(merge(merlonParts), m.stone);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(parapetR * 0.98, roofH, 28, 6), m.roof);
  roof.position.y = height + 2.3 + roofH / 2;
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.2, 6), m.iron);
  finial.position.y = height + 2.3 + roofH + 1.0;
  g.add(body, parapet, ringTop, merlons, roof, finial);
  // Arrow slits facing outward (+Z is towards the viewer by convention).
  for (let i = 0; i < (opts.slits ?? 2); i++) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.8, 0.3), m.dark);
    slit.position.set(0, height * (0.35 + i * 0.3), radius * 1.02);
    g.add(slit);
  }
  return g;
}

/** Gatehouse block with a real pointed-arch passage. Origin: bottom-centre of the outer face. */
export function gatehouse(m: KitMaterials, width: number, height: number, depth: number, archW: number, archH: number): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(width / 2, height); shape.lineTo(-width / 2, height); shape.closePath();
  const hole = new THREE.Path();
  const spring = archH - archW * 0.55;
  hole.moveTo(-archW / 2, 0);
  hole.lineTo(-archW / 2, spring);
  hole.quadraticCurveTo(-archW / 2, archH * 0.97, 0, archH);
  hole.quadraticCurveTo(archW / 2, archH * 0.97, archW / 2, spring);
  hole.lineTo(archW / 2, 0);
  hole.closePath();
  shape.holes.push(hole);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 }), m.stone);
  body.position.z = -depth;
  g.add(body);
  // The passage is open all the way through to the courtyard.
  // Arch voussoir ring, slightly proud of the face.
  const ring = new THREE.Shape();
  const o = 0.7;
  ring.moveTo(-archW / 2 - o, 0); ring.lineTo(-archW / 2 - o, spring);
  ring.quadraticCurveTo(-archW / 2 - o, archH * 0.97 + o, 0, archH + o);
  ring.quadraticCurveTo(archW / 2 + o, archH * 0.97 + o, archW / 2 + o, spring);
  ring.lineTo(archW / 2 + o, 0); ring.lineTo(archW / 2, 0);
  ring.lineTo(archW / 2, spring); ring.quadraticCurveTo(archW / 2, archH * 0.97, 0, archH);
  ring.quadraticCurveTo(-archW / 2, archH * 0.97, -archW / 2, spring); ring.lineTo(-archW / 2, 0); ring.closePath();
  const ringMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.35, bevelEnabled: false, curveSegments: 16 }), m.stone);
  g.add(ringMesh);
  const merlons = new THREE.Mesh(crenellatedWall(width, 0.01, 0.8), m.stone);
  merlons.position.y = height;
  g.add(merlons);
  return g;
}

/** Square-plan tower for the distant castle massing. */
export function squareTurret(m: KitMaterials, w: number, h: number, roofH: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m.stone);
  body.position.y = h / 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, roofH, 4, 1), m.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + roofH / 2;
  g.add(body, roof);
  return g;
}

/** Slender gothic spire turret (cylinder + needle cone), the castle's signature silhouette. */
export function spireTurret(m: KitMaterials, r: number, h: number, roofH: number, sides = 8): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, sides), m.stone);
  body.position.y = h / 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.2, roofH, sides), m.roof);
  roof.position.y = h + roofH / 2;
  g.add(body, roof);
  // Corner pinnacles around the roof base — the bristling skyline in the art.
  if (roofH > r * 1.5) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, roofH * 0.38, 6), m.roof);
      p.position.set(Math.cos(a) * r * 1.05, h + roofH * 0.19, Math.sin(a) * r * 1.05);
      g.add(p);
    }
  }
  return g;
}

/** Deterministic PRNG so procedural layouts are stable between reloads. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Bare, gnarled deciduous tree (the dead oaks framing the art's left edge). */
export function bareTree(seed: number, height: number, mat: THREE.Material): THREE.Mesh {
  const rand = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const pts: THREE.Vector3[] = [start.clone()];
    const p = start.clone();
    const d = dir.clone();
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      d.add(new THREE.Vector3((rand() - 0.5) * 0.5, (rand() - 0.3) * 0.25, (rand() - 0.5) * 0.5)).normalize();
      p.addScaledVector(d, len / segs);
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 6, rad, 5, false);
    // Taper: scale ring radius along the tube.
    const pos = tube.attributes.position as THREE.BufferAttribute;
    const rings = 7;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / 6);
      const t = ring / (rings - 1);
      const c = curve.getPointAt(Math.min(1, t));
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - t * 0.55).add(c);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    parts.push(tube);
    if (depth <= 0 || rad < 0.02) return;
    const kids = depth > 2 ? 2 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3);
    for (let k = 0; k < kids; k++) {
      const t = 0.45 + rand() * 0.55;
      const from = curve.getPointAt(t);
      const nd = d.clone().add(new THREE.Vector3((rand() - 0.5) * 1.6, rand() * 0.6, (rand() - 0.5) * 1.6)).normalize();
      grow(from, nd, len * (0.55 + rand() * 0.2), rad * 0.5, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), height * 0.42, height * 0.03, 4);
  const mesh = new THREE.Mesh(merge(parts), mat);
  // No moon shadows: the low backlight would throw the crown across the whole road.
  return mesh;
}

/** Instanced conifer silhouettes (three stacked cones) for distant forest. */
export function coniferForest(positions: { p: THREE.Vector3; h: number }[], mat: THREE.Material): THREE.InstancedMesh {
  // Seven drooping, jagged branch tiers (spruce/fir silhouette) on a visible trunk.
  const tiers: THREE.BufferGeometry[] = [];
  const jag = rng(5);
  const TIERS = 7;
  for (let i = 0; i < TIERS; i++) {
    const t = i / (TIERS - 1);
    const r = 0.36 * (1 - t * 0.82);
    const c = new THREE.ConeGeometry(r, 0.24 + (1 - t) * 0.08, 11, 1, true);
    const pos = c.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) < 0) { // skirt ring: alternate long/short branch tips, tips droop
        const k = 0.7 + jag() * 0.55;
        pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) - 0.04 * k, pos.getZ(v) * k);
      }
    }
    c.computeVertexNormals();
    c.rotateY(i * 0.9);
    c.translate(0, 0.16 + t * 0.78, 0);
    tiers.push(c);
  }
  const trunk = new THREE.CylinderGeometry(0.018, 0.035, 0.5, 6);
  trunk.translate(0, 0.25, 0);
  tiers.push(trunk);
  const geo = merge(tiers);
  const inst = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  const rand = rng(77);
  positions.forEach(({ p, h }, i) => {
    const s = h * (0.8 + rand() * 0.4);
    m.compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), new THREE.Vector3(s * (0.8 + rand() * 0.3), s, s * (0.8 + rand() * 0.3)));
    inst.setMatrixAt(i, m);
  });
  return inst;
}
