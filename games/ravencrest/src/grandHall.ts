// Grand Hall interior, anchored to concept art creation_3752887346 (HALL_SHOT, shift lens).
// Hall-local frame: entrance doorway at the origin, nave runs along −Z, floor y = 0.
// Walkable: nave, aisles, grand stair → landing → side galleries over the aisles.
import * as THREE from 'three/webgpu';
import { color, float, mix, smoothstep, texture, uv, vec2, length, mx_fractal_noise_float, positionWorld } from 'three/tsl';
import { ArtAnchor, HALL_SHOT } from './artAnchor';
import { triplanarMaterial, setReflect, glassMaterial } from './materials';
import { collide } from './collision';
import { flameMaterial, lightShaft } from './fx';
import { VerletCloth } from './physics';
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
  /** Gilt frames awaiting film posters (cinema.ts fills them; slot 0 is the hero frame). */
  paintingSlots: PaintingSlot[];
  /** The great doors: set 0 (shut) … 1 (wide open, as in the art). */
  setDoors(open: number): void;
  /** Far end of the hall (back wall z) and the landing height, for cutscene cameras. */
  farZ: number;
  landH: number;
  /** The upper wing behind the landing: room centres for monsters and staging. */
  wing: { corridor: THREE.Vector3; library: THREE.Vector3; cinema: THREE.Vector3; banquet: THREE.Vector3 };
  /** Simulated cloth (the raven tapestry), updated by the main loop. */
  cloth: VerletCloth[];
}

export interface PaintingSlot {
  canvas: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardNodeMaterial>;
  /** Centre of the canvas and the direction it faces (into the room). */
  position: THREE.Vector3;
  normal: THREE.Vector3;
  hero: boolean;
  /** 'screen' = wide 2:1 cinema screen (billboard layout) instead of a 2:3 canvas. */
  kind?: 'canvas' | 'screen';
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
  const cloths: VerletCloth[] = [];
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
    // Back wall, with two doorways at landing level into the upper wing (built below).
    const WH = clerestory + vaultRise, DX = 9.5, DW = 2.6, DH = 3.8;
    const seg = (x0: number, x1: number, y0: number, y1: number) => box(x1 - x0, y1 - y0, 1.2, stone, (x0 + x1) / 2, (y0 + y1) / 2, backZ - 0.6);
    seg(-outer, -DX - DW / 2, 0, WH);
    seg(-DX + DW / 2, DX - DW / 2, 0, WH);
    seg(DX + DW / 2, outer, 0, WH);
    for (const s of [-1, 1]) {
      seg(s * DX - DW / 2, s * DX + DW / 2, 0, landH);
      seg(s * DX - DW / 2, s * DX + DW / 2, landH + DH, WH);
      // Pointed-arch trim and a torch either side of each doorway.
      const trim = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.5, 0.35, 0.3), pierStone);
      trim.position.set(s * DX, landH + DH + 0.1, backZ + 0.12); add(trim);
      for (const side of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.28, DH, 0.3), pierStone);
        jamb.position.set(s * DX + side * (DW / 2 + 0.1), landH + DH / 2, backZ + 0.12); add(jamb);
      }
      const tf = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), flameMat);
      tf.position.set(s * DX + (DW / 2 + 0.6), landH + 2.9, backZ + 0.35); add(tf); flames.push(tf);
      const tl = new THREE.PointLight(0xff9a4a, 9, 9, 2); tl.position.set(s * DX + (DW / 2 + 0.6), landH + 2.9, backZ + 0.9); add(tl); torches.push(tl);
    }
    // Hearth on the landing.
    const hw = 2.6, hh = 2.8;
    box(hw + 1.2, hh + 1.0, 1.0, pierStone, 0, landH + (hh + 1) / 2, backZ + 0.5);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), new THREE.MeshStandardNodeMaterial({ color: 0x050302, roughness: 1 }));
    mouth.position.set(0, landH + hh / 2, backZ + 1.02);
    add(mouth);
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), flameMat);
    fire.position.set(0, landH + 0.65, backZ + 1.1);
    add(fire); flames.push(fire);
    const fl = new THREE.PointLight(0xff8a3a, 32, 15, 2); fl.position.set(0, landH + 1.2, backZ + 2); add(fl); torches.push(fl);
    // Tapestry with the house raven — verlet cloth now, stirring in the
    // hearth's air currents (the main loop updates it at indoor wind scale).
    const tex = new THREE.TextureLoader().load('/models/halloween/ravencrest/banner_raven_navy.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    const tap = new VerletCloth(4.2, 8.2, 10, 16, new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide }));
    tap.mesh.position.set(0, landH + hh + 1.2 + 8.2, backZ + 0.05);
    add(tap.mesh);
    tap.init();
    cloths.push(tap);
    // Twin lancet windows: a moonlit tracery glow BEHIND real glass. The
    // physical glass (transmission + roughness) bends and diffuses the glow,
    // so the window reads as frosted, light-scattering glass, not a poster.
    const lancet = new THREE.Shape();
    lancet.moveTo(-1.1, 0); lancet.lineTo(-1.1, 5.2); lancet.quadraticCurveTo(-1.1, 6.8, 0, 7.3); lancet.quadraticCurveTo(1.1, 6.8, 1.1, 5.2); lancet.lineTo(1.1, 0); lancet.closePath();
    const glowMat = new THREE.MeshBasicNodeMaterial();
    const gu = uv();
    const mull = smoothstep(float(0.03), float(0.0), gu.x.sub(0.5).abs().sub(0.003)).add(smoothstep(float(0.02), float(0.0), gu.y.mul(8).fract().sub(0.5).abs().sub(0.47)));
    glowMat.colorNode = mix(color(0x3d5f8f).mul(0.85), color(0x050608), mull.clamp());
    const realGlass = glassMaterial();
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ShapeGeometry(lancet), glowMat);
      const wg = w.geometry; wg.computeBoundingBox();
      const bb = wg.boundingBox!; const uvA = wg.attributes.uv as THREE.BufferAttribute; const pA = wg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, (pA.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pA.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
      w.position.set(s * 4.6, landH + 4.4, backZ + 0.02);
      add(w);
      const pane = new THREE.Mesh(new THREE.ShapeGeometry(lancet), realGlass);
      pane.position.set(s * 4.6, landH + 4.4, backZ + 0.09);
      add(pane);
      const moon = new THREE.SpotLight(0x7f9cd0, 30, 45, 0.5, 0.6, 1.5);
      moon.position.set(s * 4.6, landH + 7, backZ + 0.5);
      moon.target.position.set(s * 2, 0, backZ + 18);
      add(moon); add(moon.target);
      // Dusty moonlight shaft falling along the spot's direction.
      const shaft = lightShaft(2.4, 17, 0.10);
      shaft.position.set(s * 4.6, landH + 5.6, backZ + 0.3);
      const dir = new THREE.Vector3(-s * 2.6, -(landH + 7), 17.5).normalize();
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      add(shaft);
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

  // ── Aisles + galleries: gilt frames hung with the collection's film posters ──
  // (the art's framed canvases). Lower aisle frames get candle sconces; the gallery level
  // above repeats the hang. Frames are 2:3 like the Cinema cover art; cinema.ts letterboxes
  // covers of other shapes onto a painted ground.
  const paintingSlots: PaintingSlot[] = [];
  {
    const gz0 = (bayZs[1] ?? bayZs[0]) + 1.2, gz1 = stairTopZ;
    const hang = (wx: number, s: number, y: number, zc: number, w: number, h: number, hero: boolean) => {
      const mat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1612, roughness: 0.62 });
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      canvas.rotation.y = -s * Math.PI / 2;
      canvas.position.set(wx - s * 0.05, y, zc);
      canvas.userData.dynamic = true; // texture swaps in later: keep it out of static batching
      add(canvas);
      const fr = hero ? 0.24 : 0.15;
      for (const [fw, fh, fx, fy] of [[w + fr * 2, fr, 0, h / 2 + fr / 2], [w + fr * 2, fr, 0, -h / 2 - fr / 2], [fr, h, -w / 2 - fr / 2, 0], [fr, h, w / 2 + fr / 2, 0]] as const) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.1), brass);
        bar.rotation.y = -s * Math.PI / 2;
        bar.position.set(wx - s * 0.06, y + fy, zc + s * -fx);
        add(bar);
      }
      paintingSlots.push({ canvas, position: canvas.position.clone(), normal: new THREE.Vector3(-s, 0, 0), hero });
    };
    for (const s of [-1, 1]) {
      const wx = s * (outer - 0.06);
      for (let i = 0; i < bayZs.length - 1; i++) {
        const zc = (bayZs[i] + bayZs[i + 1]) / 2;
        for (const dz of [-2.6, 2.6]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), iron);
          arm.position.set(wx - s * 0.2, 2.75, zc + dz); add(arm);
          candleCluster(wx - s * 0.38, 2.78, zc + dz, 2, 0.8);
        }
        // First bay on the left (nearest the doors) holds the hero: Pumpkin Patch.
        const hero = s === -1 && i === 0;
        hang(wx, s, hero ? 2.75 : 2.6, zc, hero ? 2.2 : 1.8, hero ? 3.3 : 2.7, hero);
      }
      // Gallery hang (only where the gallery floor runs).
      for (let i = 0; i < bayZs.length - 1; i++) {
        const zc = (bayZs[i] + bayZs[i + 1]) / 2;
        if (zc > gz0 - 1.5 || zc < gz1 + 1.5) continue;
        hang(wx, s, landH + 2.3, zc, 2.0, 3.0, false);
      }
    }
  }

  // ── Door leaves swung inward (frame edges of the art); they animate for the entrance
  // cutscene and on approach, so they stay out of batching and the collision BVH.
  const leaves: { leaf: THREE.Group; s: number }[] = [];
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.userData.dynamic = true;
    leaves.push({ leaf, s });
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
    add(leaf);
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
    const l = new THREE.PointLight(0xff9a50, 22, 11, 2); l.position.set(p.x, 3.5, p.z); add(l); torches.push(l);
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
    const l = new THREE.PointLight(0xffc27a, 45, 16, 2); l.position.copy(p); add(l); torches.push(l);
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
      const l = new THREE.PointLight(0xff8a3c, 18, 11, 2); l.position.set(s * 4.2, 2.9, frontZ + 4.5); add(l); torches.push(l);
    }
    // Low parapet so the porch reads as a terrace over the bailey.
    const wall = new THREE.Mesh(crenellatedWall(12, 0.9, 0.6, 0.8, 0.6, 0.5), stone);
    wall.rotation.y = Math.PI; wall.position.set(0, 0, frontZ + 6);
    add(wall, true);
  }

  // Ambient candle warmth so the aisles aren't pure black.
  add(new THREE.HemisphereLight(0x34363c, 0x050505, 0.18));

  // ── Upper wing (behind the back wall, at landing height) ──────────────────
  // Cross corridor → library (west), projection room (centre), banquet hall (east).
  const W0 = backZ - 1.2, Y0 = landH, CH = 5.2, XW = 17;
  const zC = W0 - 4, zR = W0 - 16.5;                   // corridor back wall, rooms' far wall
  const plank = triplanarMaterial('dark_wooden_planks', { metresPerTile: 1.4, tint: 0x4a3a2c, roughnessScale: 0.6 });
  setReflect(plank, 0.5, 0.2);
  const wingWall = triplanarMaterial('marble_01', { metresPerTile: 2.2, tint: 0x5e5850, desat: 0.6, bump: 1.4 });
  {
    box(XW * 2, 0.4, W0 - zR, plank, 0, Y0 - 0.2, (W0 + zR) / 2);                 // floor
    box(XW * 2, 0.4, W0 - zR, wingWall, 0, Y0 + CH + 0.2, (W0 + zR) / 2);         // ceiling
    box(0.6, CH, W0 - zR, wingWall, -XW, Y0 + CH / 2, (W0 + zR) / 2);              // end walls
    box(0.6, CH, W0 - zR, wingWall, XW, Y0 + CH / 2, (W0 + zR) / 2);
    box(XW * 2, CH, 0.6, wingWall, 0, Y0 + CH / 2, zR - 0.3);                      // far wall
    // Corridor's back wall with three room doorways.
    const doors = [-10.5, 0, 10.5], dW = 2.4, dH = 3.4;
    let x = -XW;
    for (const dx of doors) {
      box(dx - dW / 2 - x, CH, 0.5, wingWall, (x + dx - dW / 2) / 2, Y0 + CH / 2, zC - 0.25);
      box(dW, CH - dH, 0.5, wingWall, dx, Y0 + dH + (CH - dH) / 2, zC - 0.25);
      x = dx + dW / 2;
    }
    box(XW - x, CH, 0.5, wingWall, (x + XW) / 2, Y0 + CH / 2, zC - 0.25);
    // Room dividers.
    for (const dx of [-4.2, 4.2]) box(0.5, CH, zC - 0.5 - zR, wingWall, dx, Y0 + CH / 2, (zC - 0.5 + zR) / 2);
    // Ceiling beams.
    for (let bz = W0 - 2; bz > zR; bz -= 3.2) box(XW * 2, 0.35, 0.35, timber, 0, Y0 + CH - 0.2, bz, false);
    // Corridor sconces.
    for (const sx of [-14, -6, 6, 14]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.55), flameMat);
      f.position.set(sx, Y0 + 2.8, zC + 0.3); add(f); flames.push(f);
      const l = new THREE.PointLight(0xff9a4a, 8, 8, 2); l.position.set(sx, Y0 + 2.8, zC + 0.9); add(l); torches.push(l);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), iron); arm.position.set(sx, Y0 + 2.6, zC + 0.15); add(arm);
    }
    // Runner carpet down the corridor.
    const run = new THREE.Mesh(new THREE.PlaneGeometry(XW * 2 - 2, 1.6), new THREE.MeshStandardNodeMaterial({ color: 0x4a0d0d, roughness: 0.95 }));
    run.rotation.x = -Math.PI / 2; run.position.set(0, Y0 + 0.01, (W0 + zC) / 2); add(run);
    // Library: shelves, reading table, candles.
    for (const [cx, cz] of [[-13, zR + 3.5], [-8, zR + 6.5]] as const) candleCluster(cx, Y0 + 0.8, cz, 3, 1.1);
    const libLight = new THREE.PointLight(0xffb070, 14, 12, 2); libLight.position.set(-10.5, Y0 + 3.8, (zC + zR) / 2); add(libLight); torches.push(libLight);
    // Banquet: long table with settings.
    box(2.0, 0.12, 8.5, timber, 10.5, Y0 + 0.82, (zC + zR) / 2 - 0.5);
    for (const lx of [9.7, 11.3]) for (const lz of [zC - 2, zR + 2.2]) box(0.14, 0.8, 0.14, timber, lx, Y0 + 0.4, lz);
    for (let tz = zC - 2.3; tz > zR + 2; tz -= 1.4) {
      for (const sx of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.02, 14), brass);
        plate.position.set(10.5 + sx * 0.6, Y0 + 0.89, tz); add(plate);
        box(0.5, 0.06, 0.5, timber, 10.5 + sx * 1.5, Y0 + 0.48, tz, false); // bench seats
      }
    }
    const banqLight = new THREE.PointLight(0xffb070, 16, 13, 2); banqLight.position.set(10.5, Y0 + 3.9, (zC + zR) / 2); add(banqLight); torches.push(banqLight);
    // Projection room: a faint beam from the booth to the screen.
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, zC - zR - 1.5, 24, 1, true), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(0.018), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.rotation.x = -Math.PI / 2; beam.position.set(0, Y0 + 2.9, (zC + zR) / 2); add(beam);
    const cinLight = new THREE.PointLight(0x9ab0ff, 6, 10, 2); cinLight.position.set(0, Y0 + 2.5, zR + 2.5); add(cinLight); torches.push(cinLight);
  }
  // Frames in the wing: corridor (facing the hall side) and the library; plus the cinema screen.
  const hangZ = (x: number, y: number, z: number, facing: number, w: number, h: number, kind: 'canvas' | 'screen', hero = false) => {
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1612, roughness: 0.62 });
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    canvas.rotation.y = facing > 0 ? 0 : Math.PI;
    canvas.position.set(x, y, z);
    canvas.userData.dynamic = true;
    add(canvas);
    const fr = kind === 'screen' ? 0.12 : 0.15;
    const fm = kind === 'screen' ? iron : brass;
    for (const [fw, fh, fx, fy] of [[w + fr * 2, fr, 0, h / 2 + fr / 2], [w + fr * 2, fr, 0, -h / 2 - fr / 2], [fr, h, -w / 2 - fr / 2, 0], [fr, h, w / 2 + fr / 2, 0]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.1), fm);
      bar.position.set(x + fx, y + fy, z - facing * 0.03);
      add(bar);
    }
    paintingSlots.push({ canvas, position: canvas.position.clone(), normal: new THREE.Vector3(0, 0, facing), hero, kind });
  };
  for (const sx of [-14.5, -6.2, 6.2, 14.5]) hangZ(sx, Y0 + 2.3, zC + 0.02, 1, 1.5, 2.2, 'canvas');
  hangZ(-13.5, Y0 + 2.4, zR + 0.02, 1, 1.6, 2.4, 'canvas');
  hangZ(0, Y0 + 2.6, zR + 0.02, 1, 6.4, 3.2, 'screen', true);

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
    // Upper wing furniture.
    ...[-16.2, -16.2, -16.2].map((_, i) => place('wooden_bookshelf_worn', 2.2, -16.4, landH, zR + 2.5 + i * 2.6, Math.PI / 2)),
    ...[-12.5, -9.5, -6.8].map((x) => place('wooden_bookshelf_worn', 2.2, x, landH, zR + 0.6, 0)),
    place('gothic_coffee_table', 1.8, -10.5, landH, (zC + zR) / 2, 0),
    place('wooden_candlestick', 0.45, -10.2, landH + 0.75, (zC + zR) / 2, 0, false),
    place('lantern_chandelier_01', 1.4, -10.5, landH + 3.6, (zC + zR) / 2, 0, false),
    place('lantern_chandelier_01', 1.6, 10.5, landH + 3.4, (zC + zR) / 2, 0, false),
    ...[zC - 2.6, zC - 5.4, zR + 2.2].flatMap((z) => [place('brass_candleholders', 0.45, 10.5, landH + 0.88, z, 0, false)]),
    place('wine_barrel_01', 1.0, 15.6, landH, zC - 1.5, 0),
    place('wooden_barrels_01', 1.6, 15.4, landH, zR + 1.6, 0),
    place('treasure_chest', 0.9, 6.0, landH, zR + 1.2, 0.3),
    place('kite_shield', 0.9, 16.6, landH + 2.6, (zC + zR) / 2, -Math.PI / 2, false),
    ...[[-2.2, zR + 6], [2.2, zR + 6], [-2.2, zR + 8.6], [2.2, zR + 8.6]].map(([x, z]) => place('painted_wooden_bench', 1.8, x, landH, z, Math.PI)),
    place('gothic_statue', 1.9, -15.5, landH, zC + 2, Math.PI / 2),
    place('vintage_cabinet_01', 1.6, 15.8, landH, zC + 2, -Math.PI / 2),
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
    group: g, anchor: A, torches, flames, props, cloth: cloths, paintingSlots, farZ: backZ, landH,
    wing: {
      corridor: new THREE.Vector3(0, landH, (W0 + zC) / 2),
      library: new THREE.Vector3(-10.5, landH, (zC + zR) / 2 + 2),
      cinema: new THREE.Vector3(0, landH, zR + 10),
      banquet: new THREE.Vector3(10.5, landH, (zC + zR) / 2 + 1),
    },
    setDoors: (open: number) => { for (const { leaf, s } of leaves) leaf.rotation.y = -s * 1.5 * THREE.MathUtils.clamp(open, 0, 1); },
    spawn: { position: new THREE.Vector3(0, 0.02, DOOR_Z - 6.5), yaw: Math.PI },  // inside, clear of the door leaves, facing the nave (−Z)
    exitTrigger: { position: new THREE.Vector3(0, 0, frontZ + 1.5), radius: 2.0 },
  };
}
