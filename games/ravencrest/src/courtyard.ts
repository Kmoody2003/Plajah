// Outer bailey behind the gatehouse, laid out from the fortress floor plan
// (creation_3752884004, "1st floor — entrance & defense"): gate S, stable SW, carriage
// house SE, guard room NE, chapel NW (moved from N — see docs/ravencrest-engine.md),
// and the Great Hall portal N. Every roofline stays below the curtain-wall sightline
// from the reference camera, so the arrival shot still matches the art.
import * as THREE from 'three/webgpu';
import { triplanarMaterial, uvMaterial, setReflect } from './materials';
import { crenellatedWall, roundTower, rng, type KitMaterials } from './kit';
import { collide } from './collision';
import { loadModel, fitSize, groundTo } from './assets';
import { flameMaterial } from './fx';
import { VerletCloth, RopeChain, type DynOpts } from './physics';
import { foliagedTree, grassTufts, ivyPatch } from './foliage';
import { HeightfieldWater } from './water';

export interface Courtyard {
  group: THREE.Group;
  torches: THREE.PointLight[];
  flames: THREE.Mesh[];
  /** East postern (outer face), where the viaduct begins. */
  postern: { position: THREE.Vector3; local: THREE.Vector3 };
  /** World-space trigger in front of the Great Hall doors. */
  hallDoor: { position: THREE.Vector3; radius: number; exitPos: THREE.Vector3; exitYaw: number };
  props: Promise<unknown>;
  /** Simulated cloth (portal + gate banners), updated by the main loop. */
  cloth: VerletCloth[];
  /** Interactive well water. */
  well: HeightfieldWater;
  /** Verlet ropes (well rope; meshes are world-space — main adds them to the scene). */
  ropes: RopeChain[];
  /** Loose props to register as dynamic bodies once loaded (userData.dyn holds DynOpts). */
  loose: THREE.Object3D[];
  /** Dynamic/animated objects the static batcher must leave alone. */
  fxObjects: THREE.Object3D[];
}

const HALF_W = 30, DEPTH = 56, GATE_DEPTH = 12, POSTERN_Z = -33;

export function buildCourtyard(frame: { origin: THREE.Vector3; yaw: number; gateWidth: number }): Courtyard {
  const g = new THREE.Group();
  g.name = 'courtyard';
  g.position.copy(frame.origin);
  g.rotation.y = frame.yaw;
  const R = rng(4242);

  const stone = triplanarMaterial('castle_wall_slates', { metresPerTile: 3.4, tint: 0x8e959f, desat: 0.45 });
  const ashlar = triplanarMaterial('marble_01', { metresPerTile: 2.4, tint: 0x6f7178, desat: 0.75, bump: 1.4 });
  const roof = triplanarMaterial('roof_slates_02', { metresPerTile: 2.2, tint: 0x56606d, roughnessScale: 0.7, bump: 0.8 });
  const timber = triplanarMaterial('dark_wooden_planks', { metresPerTile: 2, tint: 0x6a5a4a });
  const cobble = triplanarMaterial('cobblestone_floor_04', { metresPerTile: 2.4, tint: 0x5f636b, roughnessScale: 0.5 });
  setReflect(cobble, 0.5, 0.18);
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.9 });
  let trimCache: THREE.Material | null = null;
  const trimStoneEarly = () => (trimCache ??= triplanarMaterial('castle_wall_slates', { metresPerTile: 1.6, tint: 0x9aa0a8, desat: 0.5, bump: 1.6 }));
  const glow = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffa04a).multiplyScalar(3.5) });
  const voidMat = new THREE.MeshStandardNodeMaterial({ color: 0x030304, roughness: 1 });
  const K: KitMaterials = { stone, roof, dark: voidMat, iron, windowGlow: glow };

  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, solid = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(solid ? collide(mesh) : mesh);
    return mesh;
  };

  // ── Ground: wet cobbles from the gate passage to the north range ─────────
  box(HALF_W * 2 + 6, 1, DEPTH - GATE_DEPTH + 4, cobble, 0, -0.5, -(GATE_DEPTH + DEPTH) / 2 + 1);

  // ── Enclosure: side walls, inner south range (behind the curtain), north range ──
  const wallH = 9.5;
  // East wall has a postern (z −31…−35) out to the viaduct; west wall is solid.
  const sideWall = (s: number, zA: number, zB: number) => {
    const w = new THREE.Mesh(crenellatedWall(zA - zB, wallH, 3), stone);
    w.rotation.y = s * Math.PI / 2;
    w.position.set(s * (HALF_W + 3), 0, (zA + zB) / 2);
    g.add(collide(w));
  };
  sideWall(-1, -1, -DEPTH - 1);
  sideWall(1, -1, POSTERN_Z + 2);
  sideWall(1, POSTERN_Z - 2, -DEPTH - 1);
  box(3, wallH - 3.8, 4, stone, HALF_W + 1.5, 3.8 + (wallH - 3.8) / 2, POSTERN_Z);      // lintel block
  box(3.2, 0.5, 4.4, trimStoneEarly(), HALF_W + 1.5, 3.95, POSTERN_Z, false);          // arch label
  for (const s of [-1, 1]) {
    // Inner south range flanking the passage (gatehouse guard rooms).
    const span = HALF_W - frame.gateWidth / 2;
    box(span, 8, 3, stone, s * (frame.gateWidth / 2 + span / 2), 4, -GATE_DEPTH + 4.5);
  }
  // Corner towers inside the bailey (NW/NE), below the sightline.
  for (const s of [-1, 1]) {
    const t = roundTower(K, 3.2, 8.5, 2.6, { slits: 2 });
    t.position.set(s * (HALF_W + 1.5), 0, -DEPTH + 1);
    g.add(collide(t));
  }

  const torches: THREE.PointLight[] = [];
  const flames: THREE.Mesh[] = [];
  const flameMat = flameMaterial();
  const cloths: VerletCloth[] = [];
  const fxObjects: THREE.Object3D[] = [];
  const loose: THREE.Object3D[] = [];
  let well!: HeightfieldWater;
  let wellBeam: THREE.Object3D | null = null;
  const addTorch = (x: number, y: number, z: number, intensity = 9, size = 0.45) => {
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.35, 8), iron);
    bracket.position.set(x, y, z);
    g.add(bracket);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.6, size), flameMat);
    f.position.set(x, y + 0.18 + size / 2, z);
    g.add(f); flames.push(f);
    const l = new THREE.PointLight(0xff8a3c, intensity, 11, 2);
    l.position.set(x, y + 0.5, z);
    g.add(l); torches.push(l);
  };

  // ── SW: Stable — open timber arcade facing the courtyard, stalls inside ───
  {
    const x0 = -HALF_W, x1 = -15, z0 = -GATE_DEPTH - 3, z1 = -31, h = 5.5;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = z0 - z1, w = x1 - x0;
    box(0.8, h, d, stone, x0 + 0.4, h / 2, cz);                    // back wall
    box(w, h, 0.8, stone, cx, h / 2, z0 - 0.4);                    // south gable
    box(w, h, 0.8, stone, cx, h / 2, z1 + 0.4);                    // north gable
    for (let i = 0; i <= 5; i++) {                                 // arcade posts
      const z = z0 - 0.6 - (i * (d - 1.2)) / 5;
      box(0.35, h, 0.35, timber, x1 - 0.2, h / 2, z);
      if (i < 5) box(w - 1.2, 1.4, 0.12, timber, cx + 0.2, 0.7, z - (d - 1.2) / 10); // stall partitions
    }
    box(0.3, 0.35, d, timber, x1 - 0.2, h - 0.2, cz, false);       // lintel beam
    const lean = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.3, d + 0.8), roof);
    lean.position.set(cx + 0.2, h + 1.1, cz);
    lean.rotation.z = 0.32;
    g.add(lean);
    // Hay: low warm-brown mounds in stalls.
    const hay = new THREE.MeshStandardNodeMaterial({ color: 0x5c4a2a, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hay);
      m.scale.set(1.4, 0.45, 1);
      m.position.set(x0 + 2.2, 0, z0 - 2 - i * (d - 1.2) / 5);
      g.add(m);
    }
    addTorch(x1 + 0.3, 3.2, z0 - 0.8);
  }

  // ── SE: Carriage house — closed timber doors, cart outside ────────────────
  {
    const x0 = 15, x1 = HALF_W, z0 = -GATE_DEPTH - 3, z1 = -31, h = 6.5;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = z0 - z1, w = x1 - x0;
    box(w, h, d, ashlar, cx + 0.8, h / 2, cz);
    const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.62, d + 0.8, 4, 1), roof);
    gable.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    gable.scale.set(1, 1, 0.42);
    gable.position.set(cx + 0.8, h + 1.4, cz);
    g.add(gable);
    for (const dz of [-4.2, 4.2]) {                                  // two bays of doors
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.6, 5.6), timber);
      door.position.set(x0 + 0.7, 2.3, cz + dz);
      g.add(collide(door));
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 5.6), iron);
      for (const y of [1, 3.4]) { const s = strap.clone(); s.position.set(x0 + 0.6, y, cz + dz); g.add(s); }
    }
    addTorch(x0 + 0.2, 3.4, cz);
    // Cart: bed, sideboards, two spoked wheels, shafts.
    const cart = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 3), timber); bed.position.y = 0.95; cart.add(bed);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 3), timber); side.position.set(s * 0.82, 1.2, 0); cart.add(side);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 6, 24), timber);
      wheel.rotation.y = Math.PI / 2; wheel.position.set(s * 0.98, 0.65, 0.2); cart.add(wheel);
      for (let k = 0; k < 6; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.05), timber);
        spoke.position.copy(wheel.position); spoke.rotation.x = (k / 6) * Math.PI; cart.add(spoke);
      }
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 2.6), timber);
      shaft.position.set(s * 0.45, 0.6, 2.5); shaft.rotation.x = 0.28; cart.add(shaft);
    }
    cart.position.set(x0 - 3.2, 0, cz - 1.5);
    cart.rotation.y = 0.35;
    g.add(collide(cart));
  }

  // ── NE: Guard room — stone, iron-bound door, barred lit windows ───────────
  {
    const x0 = 15, x1 = HALF_W, z0 = -35, z1 = -DEPTH + 4, h = 7.5;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = z0 - z1, w = x1 - x0;
    box(w, h, d, ashlar, cx + 0.5, h / 2, cz);
    const parapet = new THREE.Mesh(crenellatedWall(d, 0.01, 1, 1.1, 0.9, 1.1), stone);
    parapet.rotation.y = -Math.PI / 2;
    parapet.position.set(x0 + 0.1, h, cz);
    g.add(parapet);
    box(0.2, 2.6, 1.6, timber, x0 - 0.05, 1.3, cz);
    for (const dz of [-4.5, 4.5]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), glow);
      win.rotation.y = -Math.PI / 2; win.position.set(x0 - 0.06, 3.6, cz + dz); g.add(win);
      for (let b = -1; b <= 1; b++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.04), iron); bar.position.set(x0 - 0.1, 3.6, cz + dz + b * 0.25); g.add(bar); }
    }
    const l = new THREE.PointLight(0xffa04a, 6, 9, 2); l.position.set(x0 - 1.5, 3.6, cz); g.add(l);
    addTorch(x0 - 0.2, 3.0, cz + 1.4);
  }

  // ── NW: Chapel — gothic front, lancet windows, small belfry ──────────────
  {
    const x0 = -HALF_W, x1 = -15, z0 = -35, z1 = -DEPTH + 4, h = 7;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = z0 - z1, w = x1 - x0;
    box(w, h, d, ashlar, cx - 0.5, h / 2, cz);
    const ridge = new THREE.Shape();
    ridge.moveTo(-d / 2, 0); ridge.lineTo(d / 2, 0); ridge.lineTo(0, 3.6); ridge.closePath();
    const rg = new THREE.ExtrudeGeometry(ridge, { depth: w + 0.6, bevelEnabled: false });
    rg.translate(0, 0, -(w + 0.6) / 2); rg.rotateY(Math.PI / 2);
    const rmesh = new THREE.Mesh(rg, roof); rmesh.position.set(cx - 0.5, h, cz); g.add(rmesh);
    // Pointed doorway (facing east, into the courtyard) and lancets glowing with candlelight.
    const door = new THREE.Shape();
    door.moveTo(-1, 0); door.lineTo(-1, 2.4); door.quadraticCurveTo(-1, 3.5, 0, 3.7); door.quadraticCurveTo(1, 3.5, 1, 2.4); door.lineTo(1, 0); door.closePath();
    const dm = new THREE.Mesh(new THREE.ShapeGeometry(door), timber);
    dm.rotation.y = Math.PI / 2; dm.position.set(x1 + 0.02, 0, cz); g.add(dm);
    const lancet = new THREE.Shape();
    lancet.moveTo(-0.35, 0); lancet.lineTo(-0.35, 1.7); lancet.quadraticCurveTo(-0.35, 2.3, 0, 2.45); lancet.quadraticCurveTo(0.35, 2.3, 0.35, 1.7); lancet.lineTo(0.35, 0); lancet.closePath();
    for (const dz of [-5.5, -3, 3, 5.5]) {
      const lm = new THREE.Mesh(new THREE.ShapeGeometry(lancet), glow);
      lm.rotation.y = Math.PI / 2; lm.position.set(x1 + 0.03, 3.2, cz + dz); g.add(lm);
    }
    const bel = roundTower(K, 1.1, 2.2, 2.2, { merlons: 6, slits: 0 });
    bel.position.set(x1 - 2, h + 1.2, cz);
    g.add(bel);
    const l = new THREE.PointLight(0xffa860, 5, 10, 2); l.position.set(x1 + 1.5, 3.5, cz); g.add(l);
  }

  // ── N: Great Hall portal — the way into the castle ──────────────────────
  const portalZ = -DEPTH + 2;
  {
    const pw = 22, ph = 10.5;
    const shape = new THREE.Shape();
    shape.moveTo(-pw / 2, 0); shape.lineTo(pw / 2, 0); shape.lineTo(pw / 2, ph); shape.lineTo(-pw / 2, ph); shape.closePath();
    const aw = 6, ah = 8.2, spring = ah - aw * 0.55;
    const hole = new THREE.Path();
    hole.moveTo(-aw / 2, 0); hole.lineTo(-aw / 2, spring);
    hole.quadraticCurveTo(-aw / 2, ah * 0.97, 0, ah); hole.quadraticCurveTo(aw / 2, ah * 0.97, aw / 2, spring);
    hole.lineTo(aw / 2, 0); hole.closePath();
    shape.holes.push(hole);
    const front = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 18 }), ashlar);
    front.position.set(0, 0.6, portalZ - 3);
    g.add(collide(front));
    const crown = new THREE.Mesh(crenellatedWall(pw, 0.01, 1.2, 1.2, 1, 1.2), stone);
    crown.position.set(0, ph + 0.6, portalZ);
    g.add(crown);
    // Steps up to the doors.
    // Solid steps, with a hidden ramp over their noses so Jack walks straight up (no snagging).
    for (let i = 0; i < 3; i++) box(aw + 4 - i * 0.6, 0.2 * (i + 1), 1.2, ashlar, 0, 0.1 * (i + 1), portalZ + 2.4 - i * 1.0);
    {
      const z0 = portalZ + 4.0, z1 = portalZ + 1.0, rise = 0.6, len = Math.hypot(z0 - z1, rise);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(aw + 4, 0.04, len), ashlar);
      ramp.position.set(0, rise / 2 - 0.02, (z0 + z1) / 2);
      ramp.rotation.x = Math.atan2(rise, z0 - z1);
      ramp.visible = false;
      g.add(collide(ramp));
    }
    // Doorway: deep, warm-lit vestibule glimpsed through half-open raven doors.
    box(aw, ah, 0.3, voidMat, 0, 0.6 + ah / 2, portalZ - 6, true);
    const warm = new THREE.PointLight(0xffa25a, 9, 14, 2);
    warm.position.set(0, 3.2, portalZ - 4.5);
    g.add(warm);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(aw / 2, ah * 0.78, 0.22), timber);
      leaf.geometry.translate(-s * aw / 4, ah * 0.39, 0);
      leaf.position.set(s * aw / 2, 0.6, portalZ - 2.4);
      leaf.rotation.y = -s * 1.1; // swung inward
      g.add(collide(leaf));
      // Flanking braziers + raven banners.
      const pillar = box(1.3, 2.4, 1.3, stone, s * (aw / 2 + 2.6), 1.8, portalZ + 1.4);
      void pillar;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.4, 12, 1, true), iron);
      bowl.position.set(s * (aw / 2 + 2.6), 3.2, portalZ + 1.4); g.add(bowl);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9), flameMat);
      f.position.set(s * (aw / 2 + 2.6), 3.75, portalZ + 1.4); g.add(f); flames.push(f);
      const l = new THREE.PointLight(0xff8a3c, 15, 12, 2); l.position.set(s * (aw / 2 + 2.6), 4.1, portalZ + 1.4); g.add(l); torches.push(l);
    }
    const bannerTex = new THREE.TextureLoader().load('/models/halloween/ravencrest/banner_raven_navy.png');
    bannerTex.colorSpace = THREE.SRGBColorSpace;
    const bm = new THREE.MeshStandardNodeMaterial({ map: bannerTex, roughness: 0.9, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      // Verlet cloth now — the banner hangs from its top edge and moves.
      const c = new VerletCloth(2.2, 5.2, 8, 14, bm);
      c.mesh.position.set(s * 7.4, 8.8, portalZ + 0.05);
      g.add(c.mesh);
      cloths.push(c); fxObjects.push(c.mesh);
    }
  }

  // ── Architectural detail: plinths, string courses, cornices, quoins ─────
  // (faceX: courtyard-facing wall plane; dir: +1 if that face looks toward +X)
  const trimStone = trimStoneEarly();
  const dressFace = (faceX: number, dir: number, z0: number, z1: number, h: number) => {
    const d = Math.abs(z0 - z1), cz = (z0 + z1) / 2;
    box(0.3, 0.7, d, trimStone, faceX + dir * 0.15, 0.35, cz, false);           // plinth
    box(0.18, 0.22, d, trimStone, faceX + dir * 0.09, h * 0.55, cz, false);       // string course
    box(0.4, 0.32, d + 0.5, trimStone, faceX + dir * 0.2, h - 0.16, cz, false);   // cornice
    for (const zc of [Math.max(z0, z1), Math.min(z0, z1)]) {                       // quoins
      for (let y = 0.7, i = 0; y < h - 0.4; y += 0.55, i++) {
        const long = i % 2 === 0;
        box(0.12, 0.5, long ? 0.9 : 0.55, trimStone, faceX + dir * 0.06, y + 0.25, zc - Math.sign(zc - cz) * (long ? 0.45 : 0.28), false);
      }
    }
  };
  dressFace(15.8, -1, -GATE_DEPTH - 3, -31, 6.5);     // carriage house
  dressFace(15.5, -1, -35, -DEPTH + 4, 7.5);          // guard room
  dressFace(-15.5, 1, -35, -DEPTH + 4, 7);            // chapel
  // Recessed window surrounds + sills on the guard room's lit windows.
  for (const dz of [-4.5, 4.5]) {
    const cz = (-35 + -DEPTH + 4) / 2 + dz;
    for (const [w, h, y, zz] of [[1.25, 0.14, 4.37, 0], [1.25, 0.18, 2.83, 0], [0.14, 1.4, 3.6, -0.56], [0.14, 1.4, 3.6, 0.56]] as const) {
      box(0.32, h, w, trimStone, 15.5 - 0.16, y, cz + zz, false);
    }
  }
  // Chapel: stepped buttresses between the lancets.
  for (const dz of [-7.4, -4.25, 4.25, 7.4]) {
    const cz = (-35 + -DEPTH + 4) / 2 + dz;
    box(0.9, 5.2, 0.7, trimStone, -15.5 + 0.45, 2.6, cz);
    box(0.6, 1.4, 0.6, trimStone, -15.5 + 0.3, 5.9, cz, false);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 4), roof);
    cap.rotation.y = Math.PI / 4; cap.position.set(-15.5 + 0.3, 6.95, cz); g.add(cap);
  }
  // Stable: diagonal braces between posts and the lintel; hayloft beam.
  {
    const x1 = -15, z0 = -GATE_DEPTH - 3, z1 = -31, d = z0 - z1;
    for (let i = 0; i < 5; i++) {
      const za = z0 - 0.6 - (i * (d - 1.2)) / 5;
      for (const sgn of [-1, 1]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18), timber);
        brace.position.set(x1 - 0.2, 4.7, za - sgn * 0.55); // knee braces either side of each post
        brace.rotation.x = sgn * 0.75;
        g.add(brace);
      }
    }
    box(0.25, 0.25, d, timber, x1 - 2.5, 3.6, (z0 + z1) / 2, false);
  }
  // Rain puddles on the cobbles (reflective, slightly sunken look).
  {
    const pm = new THREE.MeshStandardNodeMaterial({ color: 0x14161a, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.85 });
    setReflect(pm, 0.7, 0.16);
    const R2 = rng(91);
    for (let i = 0; i < 18; i++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.6 + R2() * 1.4, 18), pm);
      p.rotation.x = -Math.PI / 2;
      p.scale.set(1, 0.5 + R2() * 0.8, 1);
      p.position.set((R2() - 0.5) * 24, 0.012, -16 - R2() * 34);
      if (Math.hypot(p.position.x, p.position.z + 33) < 2.6) continue; // not in the well
      g.add(p);
    }
  }
  // Raven banners on the inner walls, flanking the gate passage.
  {
    const bt = new THREE.TextureLoader().load('/models/halloween/ravencrest/banner_raven_red.png');
    bt.colorSpace = THREE.SRGBColorSpace;
    const bm = new THREE.MeshStandardNodeMaterial({ map: bt, roughness: 0.9, side: THREE.DoubleSide, transparent: true, alphaTest: 0.2 });
    for (const s of [-1, 1]) {
      const c = new VerletCloth(1.8, 4.2, 8, 12, bm);
      c.mesh.rotation.y = Math.PI;
      c.mesh.position.set(s * (frame.gateWidth / 2 + 3.2), 6.7, -GATE_DEPTH + 2.95);
      g.add(c.mesh);
      cloths.push(c); fxObjects.push(c.mesh);
    }
  }

  // ── Centre: well ──────────────────────────────────────────────────────────
  {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.9, 24, 1, true), stone);
    ring.position.set(0, 0.45, -33); g.add(collide(ring));
    const cap = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.18, 8, 24), stone);
    cap.rotation.x = Math.PI / 2; cap.position.set(0, 0.92, -33); g.add(cap);
    // Interactive heightfield water — ripples from drips, wind and disturbances.
    well = new HeightfieldWater(2.9, 44);
    well.mesh.position.set(0, 0.35, -33); g.add(well.mesh); fxObjects.push(well.mesh);
    for (const s of [-1, 1]) box(0.18, 2.6, 0.18, timber, s * 1.5, 1.3, -33, false);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.18, 0.18), timber); beam.position.set(0, 2.6, -33); g.add(beam);
    wellBeam = beam;
    const wroof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.3, 4), roof); wroof.rotation.y = Math.PI / 4; wroof.position.set(0, 3.3, -33); g.add(wroof);
  }

  // ── Living greenery: full-foliage oaks, grass tufts, wall ivy ────────────
  // (Wind-swayed leaf cards — see foliage.ts. Trunks collide; cards don't.)
  for (const [tx, tz, th, seed] of [[-8, -38, 8.5, 11], [10, -42, 9.5, 23], [-11, -24, 7.5, 37]] as const) {
    const t = foliagedTree(seed, th);
    t.group.position.set(tx, 0, tz);
    g.add(t.group);
    collide(t.trunk);
    fxObjects.push(t.foliage);
  }
  {
    const R3 = rng(5150);
    const tufts: THREE.Vector3[] = [];
    let guard = 0;
    while (tufts.length < 150 && guard++ < 3000) {
      const x = (R3() - 0.5) * 56, z = -2 - R3() * 52;
      if (Math.abs(x) < 5.5) continue;                          // main walk
      if (Math.hypot(x, z + 33) < 3.4) continue;                // well
      if (Math.abs(x) > 14 && z < -13 && z > -33) continue;     // stable / carriage house
      if (Math.abs(x) > 14 && z <= -33) continue;              // guard room / chapel
      tufts.push(new THREE.Vector3(x, 0.02, z));
    }
    const grass = grassTufts(tufts);
    g.add(grass); fxObjects.push(grass);
  }
  for (const s of [-1, 1]) {
    const ivy = ivyPatch(5.5, 7.5, 90, s < 0 ? 41 : 43);
    ivy.position.set(s * 8.8, 0.5, portalZ + 0.08);
    g.add(ivy); fxObjects.push(ivy);
  }
  {
    const ivy = ivyPatch(7, 5.5, 80, 47);
    ivy.rotation.y = Math.PI / 2;
    ivy.position.set(-14.9, 0.4, -43.5);
    g.add(ivy); fxObjects.push(ivy);
  }

  // Wall torches around the bailey.
  for (const s of [-1, 1]) {
    addTorch(s * (HALF_W - 0.1), 3.4, s > 0 ? POSTERN_Z + 2.6 : -33); // side walls (east: beside the postern)
    addTorch(s * 10, 3.6, -GATE_DEPTH + 2.9);           // inner south range, facing north
  }

  // ── Props (CC0 scans), loaded async; collision rebuilt by the caller after. ──
  const place = async (id: string, size: number, x: number, z: number, ry = 0, solid = true) => {
    const m = await loadModel(id);
    fitSize(m, size);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    g.add(solid ? collide(m) : m);
    groundTo(m, 0);
    return m;
  };
  // Barrels and crates are LOOSE: no static collider — the DynWorld owns them,
  // so they roll, bounce, get shoved and settle like real props.
  const placeLoose = async (id: string, size: number, x: number, z: number, ry: number, dyn: DynOpts) => {
    const m = await place(id, size, x, z, ry, false);
    m.userData.dyn = dyn;
    loose.push(m);
    return m;
  };
  const props = Promise.allSettled([
    placeLoose('wine_barrel_01', 0.9, -13.5, -15.5, 0, { radius: 0.42, restitution: 0.35, roll: true, friction: 3.5 }),
    placeLoose('wine_barrel_01', 0.9, -12.6, -16.4, 1, { radius: 0.42, restitution: 0.35, roll: true, friction: 3.5 }),
    placeLoose('wooden_barrels_01', 1.8, -13, -28.5, 0.4, { radius: 0.85, restitution: 0.2, roll: false, friction: 6 }),
    placeLoose('wooden_crate_01', 1.0, 13, -14.5, 0.2, { radius: 0.55, restitution: 0.22, roll: false, friction: 6.5 }),
    placeLoose('wooden_crate_01', 0.9, 13.4, -15.6, 0.9, { radius: 0.55, restitution: 0.22, roll: false, friction: 6.5 }),
    placeLoose('wooden_crate_01', 0.8, 12.4, -15.2, 0.5, { radius: 0.55, restitution: 0.22, roll: false, friction: 6.5 }),
    place('treasure_chest', 1.0, 3.5, -50, -0.3),
    place('stone_fire_pit', 2.2, 8, -24, 0),
    place('wooden_lantern_01', 0.45, -14.6, -34.5, 0, false),
  ]).then(() => {
    // Fire pit flame + light.
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), flameMat);
    f.position.set(8, 0.95, -24); g.add(f); flames.push(f);
    const l = new THREE.PointLight(0xff7a30, 26, 14, 2); l.position.set(8, 1.4, -24); g.add(l); torches.push(l);
  });
  void R;

  g.updateMatrixWorld(true);
  // Cloth pins bake from world transforms; the well rope anchors to the beam.
  cloths.forEach((c) => c.init());
  const ropes: RopeChain[] = [];
  if (wellBeam) {
    const hemp = new THREE.MeshStandardNodeMaterial({ color: 0x4a3b28, roughness: 1 });
    ropes.push(new RopeChain(wellBeam, new THREE.Vector3(0, -0.1, 0), {
      segments: 10, length: 2.05, radius: 0.02, material: hemp,
    }));
  }
  const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
  return {
    group: g, torches, flames, props, cloth: cloths, well, ropes, loose, fxObjects,
    postern: { position: toWorld(HALF_W + 3, 0, POSTERN_Z), local: new THREE.Vector3(HALF_W + 3, 0, POSTERN_Z) },
    hallDoor: {
      position: toWorld(0, 0, portalZ - 2.2),
      radius: 2.2,
      exitPos: toWorld(0, 0.7, portalZ + 4.5),
      exitYaw: frame.yaw, // facing back toward the gate (model +Z = fortress +Z)
    },
  };
}
