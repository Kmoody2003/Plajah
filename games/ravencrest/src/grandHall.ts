// Grand Hall interior, anchored to concept art creation_3752887346 (HALL_SHOT, shift lens).
// Hall-local frame: entrance doorway at the origin, nave runs along −Z, floor y = 0.
// Walkable: nave, aisles, grand stair → landing → side galleries over the aisles.
import * as THREE from 'three/webgpu';
import { color, float, mix, smoothstep, texture, uv, vec2, length, mx_fractal_noise_float, positionWorld } from 'three/tsl';
import { ArtAnchor, HALL_SHOT } from './artAnchor';
import { triplanarMaterial, setReflect } from './materials';
import { collide } from './collision';
import { flameMaterial } from './fx';
import { knight } from './knight';
import { loadModel, fitSize, groundTo } from './assets';
import { crenellatedWall } from './kit';

export interface GrandHall {
  group: THREE.Group;
  anchor: ArtAnchor;
  torches: THREE.PointLight[];
  flames: THREE.Mesh[];
  spawn: { position: THREE.Vector3; yaw: number };
  exitTrigger: { position: THREE.Vector3; radius: number };
  props: Promise<unknown>;
}

export function buildGrandHall(): GrandHall {
  const A = new ArtAnchor(HALL_SHOT);
  const g = new THREE.Group();
  g.name = 'grandHall';

  // ── Materials ────────────────────────────────────────────────────────────
  // Large cut ashlar, grey-beige like the art's piers and walls.
  const stone = triplanarMaterial('marble_01', { metresPerTile: 2.6, tint: 0x726c64, desat: 0.6, bump: 1.6 });
  const pierStone = triplanarMaterial('marble_01', { metresPerTile: 1.9, tint: 0x837b70, desat: 0.55, bump: 1.8 });
  const timber = triplanarMaterial('dark_wooden_planks', { metresPerTile: 1.6, tint: 0x5a4636 });
  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x18191b, roughness: 0.45, metalness: 0.95 });
  const brass = new THREE.MeshStandardNodeMaterial({ color: 0x5e4824, roughness: 0.5, metalness: 1 });
  const floor = triplanarMaterial('large_floor_tiles_02', { metresPerTile: 3.2, tint: 0x3a3a40, roughnessScale: 0.25, bump: 0.3 });
  setReflect(floor, 0.85, 0.08);
  const flameMat = flameMaterial();
  const candleMat = new THREE.MeshStandardNodeMaterial({ color: 0xd8cdb4, roughness: 0.8 });
  const candleFlame = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffb35a).multiplyScalar(6) });

  const torches: THREE.PointLight[] = [];
  const flames: THREE.Mesh[] = [];
  const add = (o: THREE.Object3D, solid = false) => { g.add(solid ? collide(o) : o); return o; };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, solid = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    return add(mesh, solid) as THREE.Mesh;
  };

  // ── Key dimensions read from the art ────────────────────────────────────
  const carpetNear = A.onY(631, 610, 0);                  // carpet's near edge
  const stairBase = A.onY(629, 535, 0);                   // first riser
  const stairL = A.onY(528, 535, 0), stairR = A.onY(730, 535, 0);
  const pierL = A.onY(200, 612, 0), pierR = A.onY(1075, 620, 0);
  const naveHalf = (Math.abs(pierL.x) + Math.abs(pierR.x)) / 2;    // inner pier faces (~6 m)
  const PIER = 2.2, AISLE = 5.6;
  const outer = naveHalf + PIER + AISLE;                  // side walls
  const RISE = 0.18, TREAD = 0.32;
  // Landing height: stair top edge sits at art row 425 → solve with run = steps × tread.
  let landH = 5;
  for (let i = 0; i < 6; i++) {
    const run = Math.round(landH / RISE) * TREAD;
    landH = 1.6 + (HALL_SHOT.horizonY - 425) * (-stairBase.z + run) / A.focal;
  }
  const steps = Math.round(landH / RISE);
  landH = steps * RISE;
  const stairRun = steps * TREAD;
  const stairTopZ = stairBase.z - stairRun;
  const backZ = stairTopZ - 4.5;
  const stairHalfW = (stairR.x - stairL.x) / 2, stairX = (stairR.x + stairL.x) / 2;
  const frontZ = 3;           // porch edge
  const DOOR_Z = -1.4;        // inner face of the entrance wall: the viewer stands just outside it
  const clerestory = 17, vaultRise = 7;

  // ── Floor with raven medallion inlay ────────────────────────────────────
  {
    const fl = box(outer * 2, 0.4, frontZ - backZ + 2, floor, 0, -0.2, (frontZ + backZ) / 2);
    fl.receiveShadow = true;
    const med = A.onY(640, 655, 0);
    const tex = new THREE.TextureLoader().load('/models/halloween/ravencrest/ravencrest_medallion.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    const mm = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.2, transparent: true });
    const d = uv().sub(0.5).mul(2);
    const r = length(d);
    const rings = smoothstep(float(0.02), float(0), r.sub(0.98).abs()).add(smoothstep(float(0.015), float(0), r.sub(0.8).abs()));
    const emblem = texture(tex, uv().sub(0.5).mul(1.55).add(0.5));
    mm.colorNode = mix(color(0x15151a), color(0xa88a5a), rings.clamp()).add(emblem.rgb.mul(0.35).mul(smoothstep(float(0.8), float(0.7), r)));
    mm.opacityNode = smoothstep(float(1.0), float(0.97), r);
    setReflect(mm, 0.8, 0.1);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), mm);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(med.x, 0.005, med.z);
    add(disc);
  }

  // ── Red carpet: door → stair → up the treads ────────────────────────────
  const carpetMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    const u = uv();
    const edge = smoothstep(float(0.03), float(0.02), u.x.sub(0.5).abs().sub(0.42).abs());
    const nap = mx_fractal_noise_float(positionWorld.mul(6), 2, 2, 0.5, 1).mul(0.08);
    m.colorNode = mix(color(0x420a0c).add(nap), color(0x5e4722), edge);
    return m;
  })();
  {
    const cw = A.onY(758, 610, 0).x - A.onY(505, 610, 0).x;
    const len = carpetNear.z - stairBase.z;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(cw, len), carpetMat);
    c.rotation.x = -Math.PI / 2;
    c.position.set(carpetNear.x, 0.01, carpetNear.z - len / 2);
    add(c);
  }

  // ── Grand stair, landing, balustrades ───────────────────────────────────
  {
    for (let i = 0; i < steps; i++) {
      const y = (i + 1) * RISE;
      const z = stairBase.z - i * TREAD - TREAD / 2;
      box(stairHalfW * 2, y, TREAD, stone, stairX, y / 2, z);
      const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, TREAD), carpetMat);
      runner.rotation.x = -Math.PI / 2;
      runner.position.set(stairX, y + 0.006, z);
      add(runner);
    }
    // Landing spans the full hall width so it meets the side galleries.
    box(outer * 2, landH, stairTopZ - backZ, stone, 0, landH / 2, (stairTopZ + backZ) / 2);
    // Stair cheek walls with moulded caps.
    for (const s of [-1, 1]) {
      const x = stairX + s * (stairHalfW + 0.3);
      const cheek = new THREE.Shape();
      cheek.moveTo(0, 0); cheek.lineTo(stairRun, 0); cheek.lineTo(stairRun, landH + 1); cheek.lineTo(0, 1.1); cheek.closePath();
      const geo = new THREE.ExtrudeGeometry(cheek, { depth: 0.6, bevelEnabled: false });
      geo.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(geo, stone);
      m.position.set(x + 0.3, 0, stairBase.z);
      add(m, true);
      // Newel posts with candle lamps (art: lit lamps at the stair foot).
      box(0.7, 1.5, 0.7, stone, x, 0.75, stairBase.z + 0.2);
      candleCluster(x, 1.5, stairBase.z + 0.2, 3, 0.9);
    }
    // Landing balustrade along the stair-head (gap for the stair).
    // Only across the open nave — the aisle sides continue onto the galleries.
    for (const s of [-1, 1]) {
      const span = naveHalf - (stairHalfW + 0.6);
      if (span > 0.3) balustrade(stairX + s * (stairHalfW + 0.6 + span / 2), landH, stairTopZ + 0.1, span, 0);
    }
  }

  // ── Back wall: hearth arch, raven tapestry, twin lancets ────────────────
  {
    box(outer * 2, clerestory + vaultRise, 1.2, stone, 0, (clerestory + vaultRise) / 2, backZ - 0.6);
    // Hearth on the landing.
    const hw = 2.6, hh = 2.8;
    box(hw + 1.2, hh + 1.0, 1.0, pierStone, 0, landH + (hh + 1) / 2, backZ + 0.5);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), new THREE.MeshStandardNodeMaterial({ color: 0x050302, roughness: 1 }));
    mouth.position.set(0, landH + hh / 2, backZ + 1.02);
    add(mouth);
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), flameMat);
    fire.position.set(0, landH + 0.65, backZ + 1.1);
    add(fire); flames.push(fire);
    const fl = new THREE.PointLight(0xff8a3a, 32, 0, 2); fl.position.set(0, landH + 1.2, backZ + 2); add(fl); torches.push(fl);
    // Tapestry with the house raven.
    const tex = new THREE.TextureLoader().load('/models/halloween/ravencrest/banner_raven_navy.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    const tap = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 8.2), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.95 }));
    tap.position.set(0, landH + hh + 1.2 + 4.1, backZ + 0.05);
    add(tap);
    // Twin lancet windows, moonlit.
    const lancet = new THREE.Shape();
    lancet.moveTo(-1.1, 0); lancet.lineTo(-1.1, 5.2); lancet.quadraticCurveTo(-1.1, 6.8, 0, 7.3); lancet.quadraticCurveTo(1.1, 6.8, 1.1, 5.2); lancet.lineTo(1.1, 0); lancet.closePath();
    const glassMat = new THREE.MeshBasicNodeMaterial();
    const gu = uv();
    const mull = smoothstep(float(0.03), float(0.0), gu.x.sub(0.5).abs().sub(0.003)).add(smoothstep(float(0.02), float(0.0), gu.y.mul(8).fract().sub(0.5).abs().sub(0.47)));
    glassMat.colorNode = mix(color(0x3d5f8f).mul(2.4), color(0x050608), mull.clamp());
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ShapeGeometry(lancet), glassMat);
      const wg = w.geometry; wg.computeBoundingBox();
      const bb = wg.boundingBox!; const uvA = wg.attributes.uv as THREE.BufferAttribute; const pA = wg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, (pA.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pA.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
      w.position.set(s * 4.6, landH + 4.4, backZ + 0.02);
      add(w);
      const moon = new THREE.SpotLight(0x7f9cd0, 30, 45, 0.5, 0.6, 1.5);
      moon.position.set(s * 4.6, landH + 7, backZ + 0.5);
      moon.target.position.set(s * 2, 0, backZ + 18);
      add(moon); add(moon.target);
    }
  }

  // ── Nave arcade: compound piers, pointed arches, galleries, clerestory, vault ──
  const bayZs: number[] = [];
  for (let z = pierL.z; z > stairTopZ + 1; z -= 8.4) bayZs.push(z);
  {
    for (const s of [-1, 1]) {
      const x = s * (naveHalf + PIER / 2);
      for (const z of bayZs) {
        compoundPier(x, z);
      }
      // Gallery floor over the aisle, from the first pier to the landing (reached from the landing).
      const gz0 = (bayZs[1] ?? bayZs[0]) + 1.2, gz1 = stairTopZ;
      const gx = s * (naveHalf + PIER + AISLE / 2);
      box(AISLE + PIER, 0.5, gz0 - gz1, stone, gx - s * PIER / 2, landH - 0.25, (gz0 + gz1) / 2);
      balustrade(s * (naveHalf + 0.15), landH, (gz0 + gz1) / 2, gz0 - gz1, Math.PI / 2);
      balustrade(gx - s * PIER / 2, landH, gz0 - 0.1, AISLE + PIER, 0);
      // Arcade arches between piers (solid spandrels up to the gallery).
      for (let i = 0; i < bayZs.length - 1; i++) {
        const za = bayZs[i] - PIER / 2, zb = bayZs[i + 1] + PIER / 2, span = za - zb;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); shape.lineTo(span, 0); shape.lineTo(span, landH - 0.5); shape.lineTo(0, landH - 0.5); shape.closePath();
        const hole = new THREE.Path();
        const spring = (landH - 0.5) * 0.55;
        hole.moveTo(0.05, 0); hole.lineTo(0.05, spring); hole.quadraticCurveTo(0.05, landH - 0.7, span / 2, landH - 0.65);
        hole.quadraticCurveTo(span - 0.05, landH - 0.7, span - 0.05, spring); hole.lineTo(span - 0.05, 0); hole.closePath();
        shape.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 10 });
        geo.rotateY(-Math.PI / 2);
        const m = new THREE.Mesh(geo, stone);
        m.position.set(x + 0.45, 0, zb); // rotated extrude spans x−0.45…x+0.45, z zb…za
        add(m);
      }
      // Clerestory wall above the gallery, and the aisle outer wall.
      // First bay: solid wall above the arcade (the art shows only piers + banners up front).
      if (bayZs.length > 1) box(0.9, clerestory - landH + 0.5, bayZs[0] - bayZs[1], stone, x, landH - 0.5 + (clerestory - landH + 0.5) / 2, (bayZs[0] + bayZs[1]) / 2);
      // Clerestory starts above the gallery openings so the galleries look onto the nave.
      const cl0 = landH + 3.8;
      box(0.9, clerestory - cl0, bayZs[0] - backZ, stone, x, cl0 + (clerestory - cl0) / 2, (bayZs[0] + backZ) / 2);
      box(1.0, clerestory, frontZ - backZ, stone, s * (outer + 0.5), clerestory / 2, (frontZ + backZ) / 2);
      // Aisle ceiling under the gallery.
      box(AISLE, 0.3, bayZs[0] - backZ, stone, s * (naveHalf + PIER + AISLE / 2), landH - 0.65, (bayZs[0] + backZ) / 2, false);
    }
    // Pointed barrel vault with transverse ribs.
    const vaultShape = new THREE.Shape();
    const vw = naveHalf + PIER;
    vaultShape.moveTo(-vw - 0.5, 0); vaultShape.lineTo(-vw, 0);
    vaultShape.quadraticCurveTo(-vw, vaultRise * 0.9, 0, vaultRise);
    vaultShape.quadraticCurveTo(vw, vaultRise * 0.9, vw, 0);
    vaultShape.lineTo(vw + 0.5, 0); vaultShape.lineTo(vw + 0.5, vaultRise + 1); vaultShape.lineTo(-vw - 0.5, vaultRise + 1); vaultShape.closePath();
    const vault = new THREE.Mesh(new THREE.ExtrudeGeometry(vaultShape, { depth: frontZ - backZ, bevelEnabled: false, curveSegments: 16 }), stone);
    vault.position.set(0, clerestory, backZ);
    add(vault);
    const ribShape = new THREE.Shape();
    ribShape.moveTo(-vw, 0); ribShape.quadraticCurveTo(-vw, vaultRise * 0.9, 0, vaultRise); ribShape.quadraticCurveTo(vw, vaultRise * 0.9, vw, 0);
    ribShape.lineTo(vw - 0.4, 0); ribShape.quadraticCurveTo(vw - 0.4, vaultRise * 0.85, 0, vaultRise - 0.4); ribShape.quadraticCurveTo(-vw + 0.4, vaultRise * 0.85, -vw + 0.4, 0); ribShape.closePath();
    for (const z of bayZs) {
      const rib = new THREE.Mesh(new THREE.ExtrudeGeometry(ribShape, { depth: 0.5, bevelEnabled: false, curveSegments: 12 }), pierStone);
      rib.position.set(0, clerestory - 0.05, z - 0.25);
      add(rib);
    }
    // Entrance wall with the great doorway behind the viewer.
    const ew = new THREE.Shape();
    ew.moveTo(-outer, 0); ew.lineTo(outer, 0); ew.lineTo(outer, clerestory + vaultRise); ew.lineTo(-outer, clerestory + vaultRise); ew.closePath();
    const dh = new THREE.Path();
    dh.moveTo(-3.1, 0); dh.lineTo(-3.1, 5.8); dh.quadraticCurveTo(-3.1, 8.7, 0, 9.4); dh.quadraticCurveTo(3.1, 8.7, 3.1, 5.8); dh.lineTo(3.1, 0); dh.closePath();
    ew.holes.push(dh);
    const ewm = new THREE.Mesh(new THREE.ExtrudeGeometry(ew, { depth: 1.2, bevelEnabled: false, curveSegments: 16 }), stone);
    ewm.position.set(0, 0, DOOR_Z - 1.2);
    add(ewm, true);
  }

  // ── Aisles: candle sconces every bay, gilt-framed paintings (art: framed canvases) ──
  {
    const paintings = ['castle_exterior_moon.jpg', 'castle_moat_bridge.jpg', 'portrait_lord.png', 'forest_fork_bridge.jpg', 'castle_drawbridge_up.jpg', 'road_approach_plate.jpg'];
    const loaderP = new THREE.TextureLoader();
    let pi = 0;
    for (const s of [-1, 1]) {
      const wx = s * (outer - 0.06);
      for (let i = 0; i < bayZs.length - 1; i++) {
        const zc = (bayZs[i] + bayZs[i + 1]) / 2;
        // Sconces either side of each painting.
        for (const dz of [-2.6, 2.6]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), iron);
          arm.position.set(wx - s * 0.2, 2.75, zc + dz); add(arm);
          candleCluster(wx - s * 0.38, 2.78, zc + dz, 2, 0.8);
        }
        const file = paintings[pi++ % paintings.length];
        const tex = loaderP.load(`/models/halloween/ravencrest/${file}`);
        tex.colorSpace = THREE.SRGBColorSpace;
        const portrait = file.startsWith('portrait');
        const w = portrait ? 1.5 : 2.6, h = portrait ? 2.0 : 1.6;
        const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.6 }));
        canvas.rotation.y = -s * Math.PI / 2;
        canvas.position.set(wx - s * 0.05, 2.9, zc);
        add(canvas);
        for (const [fw, fh, fx, fy] of [[w + 0.3, 0.15, 0, h / 2 + 0.07], [w + 0.3, 0.15, 0, -h / 2 - 0.07], [0.15, h, -w / 2 - 0.07, 0], [0.15, h, w / 2 + 0.07, 0]] as const) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.08), brass);
          bar.rotation.y = -s * Math.PI / 2;
          bar.position.set(wx - s * 0.06, 2.9 + fy, zc + s * -fx);
          add(bar);
        }
      }
    }
  }

  // ── Door leaves swung inward (frame edges of the art) ───────────────────
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 8.6, 0.3), timber);
    slab.position.set(-s * 1.5, 4.3, 0);
    leaf.add(slab);
    for (const y of [1.2, 3.6, 6, 7.8]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.06), iron);
      strap.position.set(-s * 1.5, y, s * 0.0 + 0.18 * (s < 0 ? 1 : 1)); leaf.add(strap);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), iron);
    ring.position.set(-s * 2.4, 3.4, 0.2); leaf.add(ring);
    leaf.position.set(s * 3.1, 0, DOOR_Z - 1.25); // hinge placement sets the ~150 px door slivers in the art
    leaf.rotation.y = -s * 1.5; // swung wide open: thin carved slivers at the frame edges, as in the art
    add(leaf, true);
  }

  // ── Knights flanking the nave, floor braziers by the doors ──────────────
  for (const [px, py] of [[272, 602], [995, 602]] as const) {
    const p = A.onY(px, py, 0);
    const k = knight(pierStone, 2.25);
    k.position.copy(p);
    k.rotation.y = px < 640 ? 0.25 : -0.25;
    add(k, true);
  }
  for (const [px, py] of [[160, 645], [1112, 645]] as const) {
    const p = A.onY(px, py, 0);
    const stand = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 8), iron); leg.position.y = 1.3; stand.add(leg);
    for (let i = 0; i < 3; i++) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.55), iron);
      foot.rotation.y = (i / 3) * Math.PI * 2; foot.position.set(Math.sin(foot.rotation.y) * 0.2, 0.05, Math.cos(foot.rotation.y) * 0.2); stand.add(foot);
    }
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.15, 0.45, 10, 1, true), iron); basket.position.y = 2.75; stand.add(basket);
    stand.position.copy(p);
    add(stand, true);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), flameMat);
    f.position.set(p.x, 3.4, p.z); add(f); flames.push(f);
    const l = new THREE.PointLight(0xff9a50, 34, 0, 2); l.position.set(p.x, 3.5, p.z); add(l); torches.push(l);
  }

  // ── Hanging banners on the clerestory (art: tall raven banners) ─────────
  {
    const tex = new THREE.TextureLoader().load('/models/halloween/ravencrest/banner_raven_navy.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    const bm = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide });
    for (const z of bayZs.slice(1)) for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 6.2, 1, 6), bm);
      b.rotation.y = -s * Math.PI / 2;
      b.position.set(s * (naveHalf - 0.05), landH + 0.6 + 3.1 + 2.2, z - 4.2);
      add(b);
    }
  }

  // Near banners exactly where the art hangs them (left 290–375 px, right 905–985 px, rows 25–330).
  {
    const tex = new THREE.TextureLoader().load('/models/halloween/ravencrest/banner_raven_navy.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    const bm = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide });
    const onPlaneX = (px: number, py: number, X: number) => {
      const r = A.rayAt(px, py); const t = (X - r.origin.x) / r.direction.x; return r.at(t, new THREE.Vector3());
    };
    for (const [l, rr, s] of [[290, 375, -1], [905, 985, 1]] as const) {
      const X = s * (naveHalf - 0.15);
      const top = onPlaneX((l + rr) / 2, 25, X), bot = onPlaneX((l + rr) / 2, 330, X);
      const a = onPlaneX(l, 178, X), b = onPlaneX(rr, 178, X);
      const w = a.distanceTo(b), hgt = top.y - bot.y;
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1.6, w), hgt, 1, 6), bm);
      ban.rotation.y = -s * Math.PI / 2;
      ban.position.set(X, (top.y + bot.y) / 2, (top.z + bot.z) / 2);
      add(ban);
    }
  }

  // ── Chandeliers: two tiers of candles, hung from the vault ─────────────
  for (const [px, py, d, wpx] of [[625, 80, 17, 195], [628, 165, 30, 128]] as const) {
    const p = A.atDistance(px, py, d);
    const radius = (wpx / A.focal) * d / 2 * 0.72;
    const ch = new THREE.Group();
    for (const [r, dy, n] of [[radius, 0, 18], [radius * 0.62, -1.0, 12]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 48), iron);
      ring.rotation.x = Math.PI / 2; ring.position.y = dy; ch.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 6), candleMat);
        c.position.set(Math.cos(a) * r, dy + 0.18, Math.sin(a) * r); ch.add(c);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), candleFlame);
        fl.scale.y = 2; fl.position.set(Math.cos(a) * r, dy + 0.38, Math.sin(a) * r); ch.add(fl);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(radius, 1.6), 4), iron);
      strut.position.set(Math.cos(a) * radius / 2, 0.8, Math.sin(a) * radius / 2);
      strut.lookAt(new THREE.Vector3(0, 1.6, 0).add(strut.position.clone().multiplyScalar(-1)).add(strut.position));
      ch.add(strut);
    }
    const chainLen = Math.max(0.5, clerestory + vaultRise - p.y - 1.6);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, chainLen, 6), iron);
    chain.position.y = 1.6 + chainLen / 2; ch.add(chain);
    ch.position.copy(p);
    add(ch);
    const l = new THREE.PointLight(0xffc27a, 45, 0, 2); l.position.copy(p); add(l); torches.push(l);
  }

  // ── Candelabra stands, side tables, benches (art: warm points along the aisles) ──
  for (const [px, py] of [[400, 562], [865, 560], [497, 532], [760, 532]] as const) {
    const p = A.onY(px, py, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.7, 8), iron); pole.position.set(p.x, 0.85, p.z); add(pole, true);
    candleCluster(p.x, 1.7, p.z, 5, 1);
  }

  // ── Entrance porch (outside the doors): two torch pillars into the night ──
  {
    box(12, 0.4, 6, stone, 0, -0.2, frontZ + 3);
    for (const s of [-1, 1]) {
      box(1.0, 2.2, 1.0, stone, s * 4.2, 1.1, frontZ + 4.5);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), flameMat);
      f.position.set(s * 4.2, 2.6, frontZ + 4.5); add(f); flames.push(f);
      const l = new THREE.PointLight(0xff8a3c, 18, 0, 2); l.position.set(s * 4.2, 2.9, frontZ + 4.5); add(l); torches.push(l);
    }
    // Low parapet so the porch reads as a terrace over the bailey.
    const wall = new THREE.Mesh(crenellatedWall(12, 0.9, 0.6, 0.8, 0.6, 0.5), stone);
    wall.rotation.y = Math.PI; wall.position.set(0, 0, frontZ + 6);
    add(wall, true);
  }

  // Ambient candle warmth so the aisles aren't pure black.
  add(new THREE.HemisphereLight(0x34363c, 0x050505, 0.18));

  // ── CC0 props ───────────────────────────────────────────────────────────
  const place = async (id: string, size: number, x: number, y: number, z: number, ry = 0, solid = true) => {
    const m = await loadModel(id);
    fitSize(m, size);
    m.position.set(x, y, z); m.rotation.y = ry;
    add(m, solid);
    groundTo(m, y);
    return m;
  };
  const tL = A.onY(350, 577, 0), tR = A.onY(922, 580, 0);
  const props = Promise.allSettled([
    place('gothic_coffee_table', 1.6, tL.x, 0, tL.z, Math.PI / 2),
    place('gothic_coffee_table', 1.6, tR.x, 0, tR.z, Math.PI / 2),
    place('brass_candleholders', 0.5, tL.x, 0.75, tL.z, 0, false),
    place('brass_candleholders', 0.5, tR.x, 0.75, tR.z, 0, false),
    place('painted_wooden_bench', 1.8, -(naveHalf + PIER + 1.2), 0, bayZs[1] - 4, Math.PI / 2),
    place('painted_wooden_bench', 1.8, naveHalf + PIER + 1.2, 0, bayZs[1] - 4, -Math.PI / 2),
    place('kite_shield', 0.9, -(outer - 0.1), 3.2, bayZs[1], Math.PI / 2, false),
    place('kite_shield', 0.9, outer - 0.1, 3.2, bayZs[1], -Math.PI / 2, false),
    place('wooden_bookshelf_worn', 2.0, -(outer - 0.4), 0, bayZs[2] ?? bayZs[1] - 8, Math.PI / 2),
    place('treasure_chest', 0.9, outer - 0.8, landH, stairTopZ - 2, -Math.PI / 2),
  ]);

  /** Round compound pier: drum core, eight attached shafts, moulded base, capitals. */
  function compoundPier(x: number, z: number) {
    const R = PIER / 2;
    const H = clerestory + vaultRise * 0.55;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.86, H, 24), pierStone);
    core.position.set(x, H / 2, z); add(core, true);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, H, 10), pierStone);
      sh.position.set(x + Math.cos(a) * R * 0.86, H / 2, z + Math.sin(a) * R * 0.86); add(sh);
    }
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(PIER + 0.7, 0.35, PIER + 0.7), pierStone);
    plinth.position.set(x, 0.175, z); add(plinth, true);
    for (const [r0, r1, y, h] of [[R + 0.3, R + 0.42, 0.5, 0.3], [R + 0.18, R + 0.3, 0.78, 0.26]] as const) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 24), pierStone);
      ring.position.set(x, y, z); add(ring);
    }
    for (const y of [landH - 0.7, clerestory - 0.2]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.38, R + 0.12, 0.5, 24), pierStone);
      cap.position.set(x, y, z); add(cap);
      const abacus = new THREE.Mesh(new THREE.TorusGeometry(R + 0.3, 0.1, 6, 24), pierStone);
      abacus.rotation.x = Math.PI / 2; abacus.position.set(x, y + 0.27, z); add(abacus);
    }
  }

  function candleCluster(x: number, y: number, z: number, n: number, intensity: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = n > 1 ? 0.12 : 0;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), candleMat);
      c.position.set(x + Math.cos(a) * r, y + 0.11, z + Math.sin(a) * r); add(c);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), candleFlame);
      f.scale.y = 2; f.position.set(x + Math.cos(a) * r, y + 0.27, z + Math.sin(a) * r); add(f);
    }
    const l = new THREE.PointLight(0xffb870, 2.5 * intensity, 6, 2);
    l.position.set(x, y + 0.45, z); add(l);
  }
  function balustrade(cx: number, y: number, cz: number, length: number, rotY: number) {
    const grp = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.28), stone); rail.position.y = 1.0; grp.add(rail);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.32), stone); plinth.position.y = 0.08; grp.add(plinth);
    const n = Math.max(2, Math.floor(length / 0.32));
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.84, 8), stone);
      b.position.set(-length / 2 + (i + 0.5) * (length / n), 0.58, 0); grp.add(b);
    }
    grp.position.set(cx, y, cz); grp.rotation.y = rotY;
    add(grp, true);
  }
  void vec2;

  return {
    group: g, anchor: A, torches, flames, props,
    spawn: { position: new THREE.Vector3(0, 0.02, DOOR_Z - 2.5), yaw: Math.PI },  // just inside, facing the nave (−Z)
    exitTrigger: { position: new THREE.Vector3(0, 0, frontZ + 1.5), radius: 2.0 },
  };
}
