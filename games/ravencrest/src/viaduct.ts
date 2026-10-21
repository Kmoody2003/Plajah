// Outer viaduct from the east postern up to a terrace on the crag — the art's
// "G. Outer wall & viaduct" (creation_3752931231) and the arched approach in
// creation_3752931199. Arched stone spans over the moat, parapets, lanterns; ends at
// the sealed gate to the upper ward (the castle road continues in a later chapter).
import * as THREE from 'three/webgpu';
import { triplanarMaterial } from './materials';
import { crenellatedWall } from './kit';
import { collide } from './collision';
import { flameMaterial } from './fx';

export interface Viaduct {
  group: THREE.Group;
  flames: THREE.Mesh[];
  torches: THREE.PointLight[];
  sealedGate: { position: THREE.Vector3; radius: number };
  terrace: THREE.Vector3;
}

const WATER_LOCAL = -1.35;   // moat surface in fortress-local y (deck level = 0)
const DECK_W = 5, SPAN = 8;

export function buildViaduct(frame: { origin: THREE.Vector3; yaw: number }, postern: THREE.Vector3, crag: THREE.Object3D | undefined): Viaduct {
  const g = new THREE.Group();
  g.name = 'viaduct';
  g.position.copy(frame.origin);
  g.rotation.y = frame.yaw;
  g.updateMatrixWorld(true);

  const stone = triplanarMaterial('castle_wall_slates', { metresPerTile: 3.2, tint: 0x8e959f, desat: 0.45, wetBase: WATER_LOCAL + 0.15 });
  const paving = triplanarMaterial('cobblestone_floor_04', { metresPerTile: 2.2, tint: 0x5f636b, roughnessScale: 0.5 });
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.9 });
  const flameMat = flameMaterial();
  const flames: THREE.Mesh[] = [];
  const torches: THREE.PointLight[] = [];

  // Route (fortress-local): east out of the postern, then north up toward the crag.
  const start = postern.clone().setY(0);
  const bend = new THREE.Vector3(start.x + 17, 0.4, start.z);
  const endZ = start.z - 232;
  // Land on the crag: sample its surface under the terrace (fallback if the ray misses).
  let endH = 20;
  if (crag) {
    const w = new THREE.Vector3(bend.x, 400, endZ).applyMatrix4(g.matrixWorld);
    const ray = new THREE.Raycaster(w, new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(crag, false)[0];
    if (hit) endH = THREE.MathUtils.clamp(hit.point.y - frame.origin.y + 1.5, 8, 38);
  }
  const end = new THREE.Vector3(bend.x, endH, endZ);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const deckY = (z: number) => {
    const t = THREE.MathUtils.clamp((bend.z - z) / (bend.z - end.z), 0, 1);
    return bend.y + (end.y - bend.y) * (0.25 * t + 0.75 * ease(t));
  };

  const add = (o: THREE.Object3D, solid = true) => { g.add(solid ? collide(o) : o); return o; };
  const lantern = (x: number, y: number, z: number) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 8), iron);
    post.position.set(x, y + 0.85, z); add(post, false);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 6, 1, true), iron);
    cage.position.set(x, y + 1.9, z); add(cage, false);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.45), flameMat);
    f.position.set(x, y + 1.85, z); add(f, false); flames.push(f);
    const l = new THREE.PointLight(0xff9a4a, 7, 18, 2); l.position.set(x, y + 2.0, z); add(l, false); torches.push(l);
  };

  // A span: sloped deck, parapets each side, pier under its start, arch between piers.
  const span = (a: THREE.Vector3, b: THREE.Vector3, withPier: boolean) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const run = Math.hypot(dir.x, dir.z), rise = dir.y;
    const yaw = Math.atan2(dir.x, dir.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const piece = new THREE.Group();
    piece.position.copy(mid);
    piece.rotation.order = 'YXZ';
    piece.rotation.y = yaw;
    piece.rotation.x = -Math.atan2(rise, run);
    const len = Math.hypot(run, rise) + 0.05;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, 0.6, len), paving);
    deck.position.y = -0.3;
    deck.receiveShadow = true;
    piece.add(deck);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(crenellatedWall(len, 0.95, 0.45, 0.7, 0.55, 0.45), stone);
      wall.rotation.y = s * Math.PI / 2;
      wall.position.x = s * (DECK_W / 2); // rotated wall body sits just inside the deck edge
      piece.add(wall);
    }
    add(piece);
    if (withPier) {
      const top = Math.min(a.y, b.y) - 0.6;
      const h = top - WATER_LOCAL + 2;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(DECK_W + 0.6, h, 2.2), stone);
      pier.position.set(a.x, top - h / 2, a.z);
      pier.rotation.y = yaw;
      add(pier);
      // Cutwater on the pier's upstream face.
      const cut = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.4, Math.max(1, h - 2), 3), stone);
      cut.rotation.y = yaw + Math.PI / 6;
      cut.position.set(a.x, WATER_LOCAL + (h - 2) / 2, a.z);
      add(cut, false);
      // Arch spandrel between this pier and the next.
      const spanLen = run - 2.2;
      const archTop = Math.min(a.y, b.y) - 0.6;
      const archH = archTop - WATER_LOCAL;
      if (spanLen > 1 && archH > 1.2) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); shape.lineTo(spanLen, 0); shape.lineTo(spanLen, archH); shape.lineTo(0, archH); shape.closePath();
        const rise2 = Math.min(spanLen * 0.5, archH * 0.85);
        const spring = Math.max(0.2, archH * 0.85 - rise2);
        const hole = new THREE.Path();
        hole.moveTo(0.05, 0); hole.lineTo(0.05, spring);
        hole.quadraticCurveTo(0.05, spring + rise2, spanLen / 2, spring + rise2);
        hole.quadraticCurveTo(spanLen - 0.05, spring + rise2, spanLen - 0.05, spring);
        hole.lineTo(spanLen - 0.05, 0); hole.closePath();
        shape.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: DECK_W, bevelEnabled: false, curveSegments: 10 });
        geo.translate(-spanLen / 2, 0, -DECK_W / 2);
        const arch = new THREE.Mesh(geo, stone);
        const c = a.clone().add(b).multiplyScalar(0.5);
        arch.position.set(c.x, WATER_LOCAL, c.z);
        arch.rotation.y = yaw - Math.PI / 2;
        add(arch, false);
      }
    }
  };

  // East span out of the postern to a corner landing, then the long climb north.
  const half = DECK_W / 2;
  span(start, new THREE.Vector3(bend.x - half, bend.y, bend.z), false);
  {
    const land = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, 0.6, DECK_W), paving);
    land.position.set(bend.x, bend.y - 0.3, bend.z); add(land);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(DECK_W + 0.6, bend.y - WATER_LOCAL + 2, DECK_W + 0.6), stone);
    pier.position.set(bend.x, (bend.y + WATER_LOCAL - 2) / 2 - 0.3, bend.z); add(pier);
    // Walled on the outer (south, east) sides; open west (from the postern) and north (the climb).
    for (const [x, z, ry] of [[bend.x, bend.z + half, Math.PI], [bend.x + half, bend.z, -Math.PI / 2]] as const) {
      const w = new THREE.Mesh(crenellatedWall(DECK_W, 0.95, 0.45, 0.7, 0.55, 0.45), stone);
      w.rotation.y = ry; w.position.set(x, bend.y, z); add(w);
    }
    lantern(bend.x + half - 0.5, bend.y, bend.z + half - 0.5);
  }
  let prev = new THREE.Vector3(bend.x, bend.y, bend.z - half);
  let i = 0;
  for (let z = bend.z - half - SPAN; z >= end.z - 0.01; z -= SPAN, i++) {
    const p = new THREE.Vector3(bend.x, deckY(z), z);
    span(prev, p, true);
    if (i % 3 === 1) lantern(bend.x + (i % 6 === 1 ? 1 : -1) * (DECK_W / 2 - 0.45), (prev.y + p.y) / 2, (prev.z + p.z) / 2);
    prev = p;
  }

  // Terrace on the crag: rock-cut platform, braziers, low walls, sealed gate onward.
  const T = prev.clone();
  {
    const base = new THREE.Mesh(new THREE.BoxGeometry(20, T.y + 30, 16), stone);
    base.position.set(T.x, T.y - (T.y + 30) / 2 - 0.3, T.z - 8);
    add(base);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.6, 16), paving);
    floor.position.set(T.x, T.y - 0.3, T.z - 8);
    add(floor);
    for (const [w, d, x, z, ry] of [[20, 0, T.x, T.z - 16, 0], [16, 0, T.x - 10, T.z - 8, Math.PI / 2], [16, 0, T.x + 10, T.z - 8, -Math.PI / 2]] as const) {
      const wall = new THREE.Mesh(crenellatedWall(w, 1.0, 0.6, 0.8, 0.6, 0.5), stone);
      wall.rotation.y = ry; wall.position.set(x, T.y, z);
      add(wall);
      void d;
    }
    // Sealed gate: stone arch with iron bars, set into the back wall.
    const arch = new THREE.Shape();
    arch.moveTo(-3.2, 0); arch.lineTo(3.2, 0); arch.lineTo(3.2, 6.5); arch.lineTo(-3.2, 6.5); arch.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-1.8, 0); hole.lineTo(-1.8, 3.2); hole.quadraticCurveTo(-1.8, 4.6, 0, 4.9); hole.quadraticCurveTo(1.8, 4.6, 1.8, 3.2); hole.lineTo(1.8, 0); hole.closePath();
    arch.holes.push(hole);
    const gate = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: 1.4, bevelEnabled: false, curveSegments: 12 }), stone);
    gate.position.set(T.x, T.y, T.z - 16.8);
    add(gate);
    for (let k = -4; k <= 4; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 4.6, 0.07), iron);
      bar.position.set(T.x + k * 0.4, T.y + 2.3, T.z - 16.2); add(bar);
    }
    for (const y of [1.2, 3.4]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.1), iron);
      rail.position.set(T.x, T.y + y, T.z - 16.2); add(rail, false);
    }
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 1.1), stone);
      p.position.set(T.x + s * 4.4, T.y + 0.9, T.z - 14.4); add(p);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.85), flameMat);
      f.position.set(T.x + s * 4.4, T.y + 2.25, T.z - 14.4); add(f, false); flames.push(f);
      const l = new THREE.PointLight(0xff8a3c, 16, 0, 2); l.position.set(T.x + s * 4.4, T.y + 2.6, T.z - 14.4); add(l, false); torches.push(l);
    }
  }

  g.updateMatrixWorld(true);
  const toWorld = (v: THREE.Vector3) => v.clone().applyMatrix4(g.matrixWorld);
  return {
    group: g, flames, torches,
    sealedGate: { position: toWorld(new THREE.Vector3(T.x, T.y, T.z - 15)), radius: 3.2 },
    terrace: toWorld(new THREE.Vector3(T.x, T.y, T.z - 6)),
  };
}
