// Act 4B: The Great Forest Wilderness (lexicon.wilds) & The Great Forest Elk Companion Mount!
// Inspired by S04, S08 (7.5 m antler peak / 4.5 m shoulder), S09, S11-S16, S22, S35-S39, S41-S42, S44, S47:
// - Opens at the splintered riverbank cart/raft wreckage (S04) into the Unwritten Clearing Ambush (S39/S44)
// - Surviving / unleashing LIGHT (S22) wakes the 7.5 m cyan-antlered Great Forest Elk (S47), which scatters
//   the Unwritten (S13-S14), bows to the Scribe (S11), lets you pet & bond (S36), and unlocks Mounted Riding (S35)!
// - Sprawling 340 m x 340 m open wilderness: fallen logs to leap (S15), overgrown stone aqueduct ruins (S41),
//   wild word herds to Lasso on Elk-back, 3 Infected Zones to reclaim, and the Root-Tree Word Shrine (S38)!
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  fbm, groundMaterial, hash, mat, mesh, motes, PAL, smooth, surface, textSprite,
  type Box, type BuiltLevel, type Circle, type LevelPortal, type SigilView, type WorldInteractable,
} from './world';
import { SIGILS } from './content';
import { createWildlife } from './wildlife';

export function heightWilds(x: number, z: number): number {
  let h = (fbm(x * 0.022 + 3, z * 0.022 + 5) - 0.46) * 11 + (fbm(x * 0.008, z * 0.008) - 0.45) * 15;
  // Flat riverbank landing & ambush clearing in the south (-18, 92..112)
  h *= smooth(16, 36, Math.hypot(x + 18, z - 98));
  // Flat overgrown stone ruins plaza (52, 18)
  h *= smooth(16, 32, Math.hypot(x - 52, z - 18));
  // Flat Root-Tree Word Shrine courtyard (-54, -84)
  h *= smooth(18, 36, Math.hypot(x + 54, z + 84));
  // Gentle canyon creek running along the southern/western edge
  if (z > 106) h -= smooth(106, 122, z) * 2.2;
  return h;
}

// ── THE GREAT FOREST ELK COMPANION MOUNT (7.5 m tall, cyan crystal antlers — S08 / S12) ──────────
export interface ElkCompanion {
  root: THREE.Group;
  x: number;
  y: number;
  z: number;
  yaw: number;
  visible: boolean;
  bowing: boolean;
  bonded: boolean;
  mounted: boolean;
  jumpY: number;
  jumpVel: number;
  surgeT: number;
  /** Appear from the mist & charge into the riverbank clearing (S47 / S13 / S11). */
  summonRescue(x: number, z: number, heightAt: (x: number, z: number) => number): void;
  update(dt: number, t: number, speed: number, heightAt: (x: number, z: number) => number): void;
}

export function createGreatForestElk(): ElkCompanion {
  const root = new THREE.Group();
  root.name = 'GreatForestElk';
  root.userData.dynamic = true;

  // Built to S08 exact scale (scaled cleanly to ~4.6 m antler peak / 2.8 m shoulder for 3rd-person playability while towering heroically over the 1.75 m Scribe!)
  const fur = mat(0x5b4a36);
  const moss = mat(0x475e32);
  const hoof = mat(0x28231d);
  const antlerMat = mat(PAL.cyan, 0x4ef0f6);

  const bodyGrp = new THREE.Group();
  // Muscular torso & neck
  bodyGrp.add(mesh(new THREE.CapsuleGeometry(0.72, 1.75, 8, 14).rotateX(Math.PI / 2), fur, 0, 2.25, 0));
  bodyGrp.add(mesh(new THREE.CapsuleGeometry(0.68, 1.35, 6, 12).rotateX(Math.PI / 2), moss, 0, 2.55, 0.15)); // mossy mane & back!
  const neckGrp = new THREE.Group();
  neckGrp.position.set(0, 2.5, 1.15);
  neckGrp.add(mesh(new THREE.CapsuleGeometry(0.42, 1.1, 6, 10), fur, 0, 0.65, 0.35));
  neckGrp.add(mesh(new THREE.CapsuleGeometry(0.32, 0.65, 6, 10).rotateX(Math.PI / 2), fur, 0, 1.28, 0.72)); // head & snout

  // Glowing luminous cyan crystal antlers (S08 / S12 / S14 signature — cleanly joined branching crown!)
  for (const s of [-1, 1]) {
    const beam = new THREE.Group();
    beam.position.set(s * 0.24, 1.44, 0.58);
    beam.rotation.z = -s * 0.46;
    beam.rotation.x = -0.22;
    beam.add(mesh(new THREE.CylinderGeometry(0.055, 0.11, 1.55, 7), antlerMat, 0, 0.76, 0));
    const t1 = mesh(new THREE.CylinderGeometry(0.035, 0.075, 0.85, 6), antlerMat, s * 0.16, 0.96, 0.14);
    t1.rotation.z = -s * 0.45; t1.rotation.x = 0.35;
    const t2 = mesh(new THREE.CylinderGeometry(0.032, 0.068, 0.88, 6), antlerMat, -s * 0.14, 1.22, -0.06);
    t2.rotation.z = s * 0.42;
    const t3 = mesh(new THREE.CylinderGeometry(0.028, 0.06, 0.78, 6), antlerMat, s * 0.18, 1.48, -0.04);
    t3.rotation.z = -s * 0.35;
    beam.add(t1, t2, t3);
    neckGrp.add(beam);
  }
  const antlerGlow = new THREE.PointLight(0x88f7f4, 28, 18, 1.5);
  antlerGlow.position.set(0, 2.2, 0.8);
  neckGrp.add(antlerGlow);
  bodyGrp.add(neckGrp);

  // 4 animated legs
  const legs: THREE.Mesh[] = [];
  const legPos: [number, number][] = [[-0.45, 0.88], [0.45, 0.88], [-0.45, -0.88], [0.45, -0.88]];
  for (const [lx, lz] of legPos) {
    const leg = mesh(new THREE.CylinderGeometry(0.15, 0.1, 1.85, 8), fur, lx, 0.95, lz);
    leg.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 8), hoof, 0, -0.92, 0));
    bodyGrp.add(leg);
    legs.push(leg);
  }
  // Leather saddle blanket (appears once bonded!)
  const saddle = mesh(new THREE.BoxGeometry(1.15, 0.18, 0.95), mat(PAL.leather), 0, 2.98, 0.05);
  saddle.visible = false;
  bodyGrp.add(saddle);

  // Antler surge shockwave ring (S14!)
  const surgeRing = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 2.2, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PAL.cyan, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  surgeRing.position.y = 1.4;
  root.add(bodyGrp, surgeRing);

  // Auto-upgrade to Colab Character Forge GLB when public/games/lexicon/assets/characters/elk.glb is added!
  new GLTFLoader().loadAsync('/games/lexicon/assets/characters/elk.glb').then((gltf) => {
    const model = gltf.scene;
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    bodyGrp.visible = false;
    root.add(model);
  }).catch(() => { /* procedural Great Forest Elk stays active until Milestone 5 GLB lands */ });

  const elk: ElkCompanion = {
    root, x: -18, y: 0, z: 82, yaw: 0, visible: false, bowing: false, bonded: false, mounted: false,
    jumpY: 0, jumpVel: 0, surgeT: 0,
    summonRescue(x, z, heightAt) {
      elk.x = x; elk.z = z; elk.y = heightAt(x, z);
      elk.visible = true; elk.bowing = true; elk.surgeT = 1.0;
      root.visible = true;
      root.position.set(x, elk.y, z);
    },
    update(dt, t, speed, heightAt) {
      root.visible = elk.visible;
      if (!elk.visible) return;
      saddle.visible = elk.bonded;

      // Vertical leap physics over fallen forest logs (S15!)
      if (elk.jumpY > 0 || elk.jumpVel > 0) {
        elk.jumpY += elk.jumpVel * dt;
        elk.jumpVel -= 22 * dt;
        if (elk.jumpY <= 0) { elk.jumpY = 0; elk.jumpVel = 0; }
      }
      elk.y = heightAt(elk.x, elk.z);
      root.position.set(elk.x, elk.y + elk.jumpY, elk.z);
      root.rotation.y = elk.yaw;

      // Bow gently when waiting for first bonding pet (S11 / S36)
      const targetBow = elk.bowing && !elk.bonded ? 0.58 : elk.jumpY > 0.2 ? -0.18 : Math.sin(t * 1.8) * 0.04;
      neckGrp.rotation.x += (targetBow - neckGrp.rotation.x) * Math.min(1, dt * 6);

      // Gallop leg stride animation
      const stride = Math.min(1, speed / 8);
      legs.forEach((leg, i) => {
        const ph = i < 2 ? 0 : Math.PI * 0.85;
        const sidePh = i % 2 === 0 ? 0 : 0.35;
        leg.rotation.x = elk.jumpY > 0.2
          ? (i < 2 ? -0.75 : 0.65)
          : Math.sin(t * 11 + ph + sidePh) * 0.58 * stride;
      });

      // Cyan antler surge visual (S14!)
      if (elk.surgeT > 0) {
        elk.surgeT = Math.max(0, elk.surgeT - dt * 1.8);
        const k = 1 - elk.surgeT;
        surgeRing.scale.setScalar(1 + k * 5.2);
        (surgeRing.material as THREE.MeshBasicMaterial).opacity = elk.surgeT * 0.85;
        antlerGlow.intensity = 28 + elk.surgeT * 95;
      } else {
        (surgeRing.material as THREE.MeshBasicMaterial).opacity = 0;
        antlerGlow.intensity = 26 + Math.sin(t * 2.5) * 6;
      }
    },
  };
  root.visible = false;
  return elk;
}

// ── BUILD GREAT FOREST WILDERNESS (lexicon.wilds) ────────────────────────────────────────────────
export interface WildsCallbacks {
  isElkUnlocked: () => boolean;
  onPetElk: () => void;
  onConstellationShrine: () => void;
}

export function buildWilds(cb: WildsCallbacks): BuiltLevel {
  const group = new THREE.Group();
  group.name = 'lexicon.wilds';
  const circles: Circle[] = [];
  const boxes: Box[] = [];
  const interactables: WorldInteractable[] = [];

  // Vast 340 m x 340 m undulating ancient wilderness terrain
  const geo = new THREE.PlaneGeometry(340, 340, 150, 150);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const deepMoss = new THREE.Color(0x3a4d2c), glade = new THREE.Color(0x6e8042), bank = new THREE.Color(0x8e8064), trail = new THREE.Color(0x8f836d);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightWilds(x, z);
    pos.setY(i, h);
    c.copy(deepMoss).lerp(glade, fbm(x * 0.05, z * 0.05));
    if (z > 98) c.lerp(bank, smooth(98, 112, z));
    // Winding dirt path from Riverbank Landing -> Ruin Plaza -> Root-Tree Shrine
    if (Math.hypot(x + 54, z + 84) < 16 || Math.hypot(x - 52, z - 18) < 14) c.lerp(trail, 0.5);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, groundMaterial());
  ground.receiveShadow = true;
  group.add(ground);

  // Southern canyon river edge
  const riverWater = mesh(
    new THREE.PlaneGeometry(340, 60).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x33758a, roughness: 0.15, transparent: true, opacity: 0.88 }),
    0, -0.5, 130, false,
  );
  group.add(riverWater);

  // 1. Splintered Mine-Cart / Raft Wreckage on the Riverbank (S04 / S37)
  const timber = surface('dark_wooden_planks', [2, 2]);
  const wreck = new THREE.Group();
  wreck.position.set(-18, heightWilds(-18, 108) + 0.3, 108);
  wreck.add(mesh(new THREE.BoxGeometry(2.4, 0.9, 3.2), timber, 0, 0.35, 0));
  const brokenWheel = mesh(new THREE.TorusGeometry(0.65, 0.08, 6, 14), timber, 1.8, 0.1, 1.2);
  brokenWheel.rotation.x = Math.PI / 2;
  wreck.add(brokenWheel);
  wreck.rotation.set(0.18, 0.6, -0.25);
  group.add(wreck);

  // 2. Ancient Towering Pines & Mossy Boulders across the Wilderness (static-batched cleanly!)
  const trunkMat = mat(PAL.bark);
  const canopyMat = mat(0x2f4725);
  const canopyLight = mat(0x466432);
  const stoneMat = surface('medieval_blocks_02', [3, 2], 0x828478);

  const clearZones: [number, number, number][] = [
    [-18, 98, 22], [52, 18, 20], [-54, -84, 24], [14, 42, 12], [-12, -26, 12],
  ];
  for (let i = 0; i < 165; i++) {
    const x = (hash(i, 11) - 0.5) * 280;
    const z = (hash(i, 23) - 0.5) * 240;
    if (z > 104 || clearZones.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
    const y = heightWilds(x, z);
    const sc = 0.9 + hash(i, 7) * 1.15;
    group.add(mesh(new THREE.CylinderGeometry(0.45 * sc, 0.72 * sc, 7 * sc, 7), trunkMat, x, y + 3.5 * sc, z));
    group.add(mesh(new THREE.ConeGeometry(3.4 * sc, 9.5 * sc, 7), i % 3 ? canopyMat : canopyLight, x, y + 9 * sc, z));
    circles.push({ x, z, r: 0.9 * sc });
  }

  // 3. Fallen Giant Mossy Logs to Leap on Elk-back (S15 / S42!)
  for (const [lx, lz, yaw] of [[8, 62, 0.4], [-28, 36, -0.35], [24, -18, 0.8], [-32, -38, -0.5]] as const) {
    const log = mesh(new THREE.CylinderGeometry(0.65, 0.8, 12, 10).rotateZ(Math.PI / 2), trunkMat, lx, heightWilds(lx, lz) + 0.55, lz);
    log.rotation.y = yaw;
    group.add(log);
  }

  // 4. Overgrown Stone Aqueduct & Ruins (S41) at (52, 18)
  const ruinG = new THREE.Group();
  const ry = heightWilds(52, 18);
  ruinG.position.set(52, ry, 18);
  for (let i = -2; i <= 2; i++) {
    ruinG.add(mesh(new THREE.BoxGeometry(1.4, 7.5, 1.4), stoneMat, i * 4.5, 3.75, -5));
    if (i < 2) ruinG.add(mesh(new THREE.BoxGeometry(4.8, 1.2, 1.6), stoneMat, i * 4.5 + 2.25, 7.6, -5));
  }
  const ruinAltar = mesh(new THREE.CylinderGeometry(1.2, 1.5, 1.4, 10), stoneMat, 0, 0.7, 2);
  ruinG.add(ruinAltar);
  const ruinOrb = mesh(new THREE.OctahedronGeometry(0.48), mat(PAL.cyan, 0x4ae8ef), 0, 2.2, 2);
  ruinG.add(ruinOrb);
  group.add(ruinG);
  interactables.push({
    id: 'wilds-ruin-shrine', x: 52, z: 20, r: 4.0,
    label: () => 'Inspect Overgrown Astronomer’s Ruin (Constellation Geometry)',
    act: cb.onConstellationShrine,
  });

  // 5. THE ROOT-TREE WORD SHRINE (S38!) at (-54, -84)
  const sy = heightWilds(-54, -84);
  const shrine = new THREE.Group();
  shrine.position.set(-54, sy, -84);
  // Massive ancient mother tree crowning the sanctuary
  shrine.add(mesh(new THREE.CylinderGeometry(3.6, 5.8, 16, 12), trunkMat, 0, 12, -5));
  shrine.add(mesh(new THREE.DodecahedronGeometry(11.5, 1), canopyLight, 0, 22, -5));
  // Grand arched glowing sanctuary entrance flanked by twin cyan rune portals & warm lanterns (S38)
  shrine.add(mesh(new THREE.BoxGeometry(14, 7.5, 6), stoneMat, 0, 3.75, -2));
  shrine.add(mesh(new THREE.BoxGeometry(3.8, 5.2, 0.4), mat(PAL.brass, 0xffc858), 0, 2.6, 1.1, false)); // golden inner doorway
  for (const sx of [-4.6, 4.6]) {
    shrine.add(mesh(new THREE.BoxGeometry(2.4, 4.4, 0.4), mat(PAL.cyan, 0x3ce8f0), sx, 2.2, 1.1, false)); // flanking cyan rune arches
    shrine.add(mesh(new THREE.BoxGeometry(0.45, 1.6, 0.45), mat(0xffcf70, 0xffa838), sx * 0.7, 1.0, 4.2, false));
  }
  shrine.add(mesh(new THREE.BoxGeometry(9, 0.5, 4.5), stoneMat, 0, 0.25, 3.5)); // stone stairs
  const shSign = textSprite('✦ Root-Tree Word Sanctuary ✦', { size: 48, scale: 0.78, color: '#ffe9a8', bg: 'rgba(16,28,24,.78)' });
  shSign.position.set(0, 9.2, 1.5); shrine.add(shSign);
  group.add(shrine);
  boxes.push({ minx: -61, maxx: -47, minz: -89, maxz: -83 });

  // Song Sigil at the Root-Tree Shrine
  const sigils = new Map<string, SigilView>();
  for (const def of SIGILS.filter((s) => s.level === 'wilds')) {
    const g = new THREE.Group(); g.userData.dynamic = true;
    g.position.set(def.pos[0], heightWilds(def.pos[0], def.pos[1]), def.pos[1] + 5.5);
    const gem = mesh(new THREE.OctahedronGeometry(0.55), mat(PAL.cyan, 0x3ad8e8), 0, 1.8, 0);
    g.add(gem); group.add(g);
    const v: SigilView = { def, obj: g, solved: false, setSolved(s) { v.solved = s; gem.material = mat(PAL.brass, s ? 0xffe080 : 0x3ad8e8); } };
    sigils.set(def.id, v);
  }

  // Return Archway Portal from the Root-Tree Shrine directly back to Glossa Hollow Valley!
  const portals: LevelPortal[] = [
    {
      id: 'wilds-to-glossa',
      label: 'Step through the Sanctuary Arch → Glossa Hollow Valley',
      x: -54, z: -78, r: 4.5, target: 'glossa', spawn: [70, 0, 14], yaw: -Math.PI / 2,
    },
  ];

  const m = motes(260, 260, new THREE.Vector3(0, 2, 0), 0xb1f9f6, '✦');
  group.add(m);

  // Living woodland wildlife: butterflies, darting forest squirrels & soaring valley birds!
  const wildlife = createWildlife(heightWilds, 118);
  group.add(wildlife.group);

  return {
    id: 'wilds', name: 'The Great Forest Wilderness', outdoor: true, group,
    heightAt: heightWilds, circles, boxes, gates: new Map(), sigils, villagers: new Map(),
    portals, interactables, grappleAnchors: [], hazards: [], torches: [], braziers: [], pillars: [],
    constrain(x, z) { return [Math.max(-145, Math.min(145, x)), Math.max(-135, Math.min(115, z))]; },
    sky: { day: 0x8eb4be, night: 0x0b1624, fog: 0xb7c9bc, fogNear: 45, fogFar: 205 },
    motes: m,
    update(dt, t, _timeSlow, nightK = 0, px = 0, pz = 0) {
      ruinOrb.rotation.y = t * 1.4;
      ruinOrb.position.y = 2.2 + Math.sin(t * 2.2) * 0.22;
      wildlife.update(dt, t, px, pz, nightK);
    },
  };
}
