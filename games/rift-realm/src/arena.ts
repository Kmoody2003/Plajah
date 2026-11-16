// Fable-dominant Shifting Maze Sanctum with 4 switchable Rift Biomes using real textures & skyboxes.
import * as THREE from 'three/webgpu';
import {
  abs, color, float, fract, mix, smoothstep, step, texture as tslTexture, time, uniform, uv,
} from 'three/tsl';
import { collide } from './collision';

export interface BiomeConfig {
  id: string;
  name: string;
  skyUrl: string;
  floorUrl: string;
  wallUrl: string;
  accentHex: number;
  fogHex: number;
  track: 'main' | 'combat';
}

export const BIOMES: BiomeConfig[] = [
  {
    id: 'celestial',
    name: 'Celestial Void Citadel',
    skyUrl: '/games/rift-realm/assets/textures/celestial-sky.jpg',
    floorUrl: '/games/rift-realm/assets/textures/celestial-floor.jpg',
    wallUrl: '/games/rift-realm/assets/textures/celestial-stone.jpg',
    accentHex: 0xf59e0b,
    fogHex: 0x090b16,
    track: 'main',
  },
  {
    id: 'volcanic',
    name: 'Obsidian Volcanic Compound',
    skyUrl: '/games/rift-realm/assets/textures/volcanic-sky.jpg',
    floorUrl: '/games/rift-realm/assets/textures/volcanic-floor.jpg',
    wallUrl: '/games/rift-realm/assets/textures/volcanic-wall.jpg',
    accentHex: 0xf97316,
    fogHex: 0x160908,
    track: 'combat',
  },
  {
    id: 'glacial',
    name: 'Glacial Citadel Complex',
    skyUrl: '/games/rift-realm/assets/textures/glacial-sky.jpg',
    floorUrl: '/games/rift-realm/assets/textures/glacial-floor.jpg',
    wallUrl: '/games/rift-realm/assets/textures/glacial-wall.jpg',
    accentHex: 0x38bdf8,
    fogHex: 0x07121e,
    track: 'combat',
  },
  {
    id: 'marsh',
    name: 'Sunken Marshland Village',
    skyUrl: '/games/rift-realm/assets/textures/marsh-sky.jpg',
    floorUrl: '/games/rift-realm/assets/textures/marsh-floor.jpg',
    wallUrl: '/games/rift-realm/assets/textures/marsh-wall.jpg',
    accentHex: 0x4ade80,
    fogHex: 0x08130d,
    track: 'main',
  },
];

export interface ShiftingGate {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  slideAxis: THREE.Vector3;
  halfSize: THREE.Vector3;
  phaseOffset: number;
}

export interface HazardTrap {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardNodeMaterial;
  pos: THREE.Vector3;
  radius: number;
  phaseOffset: number;
  active: boolean;
}

export interface Arena {
  group: THREE.Group;
  uBeatPulse: { value: number };
  gates: ShiftingGate[];
  traps: HazardTrap[];
  biomeIndex: number;
  setBiome(index: number): BiomeConfig;
  update(dt: number, pulse: number, beatIndex: number): void;
  resolveDynamicGates(pos: THREE.Vector3, radius: number): void;
}

export function buildArena(scene: THREE.Scene): Arena {
  const group = new THREE.Group();
  const uBeatPulse = uniform(0);
  const gates: ShiftingGate[] = [];
  const traps: HazardTrap[] = [];
  const loader = new THREE.TextureLoader();

  const loadTex = (url: string, repeat = 1) => {
    const t = loader.load(url);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // Initial textures (Celestial Void Citadel)
  const floorTex = loadTex(BIOMES[0].floorUrl, 6);
  const wallTex = loadTex(BIOMES[0].wallUrl, 2);

  // ── 1. Textured Fable Stone Floor with Subtle Beat-Pulsing Rune Veins ──
  const floorMat = new THREE.MeshStandardNodeMaterial({
    map: floorTex,
    roughness: 0.78,
    metalness: 0.2,
  });
  const radial = uv().sub(0.5).length().mul(2.0);
  const runeRing = smoothstep(float(0.025), float(0.0), abs(fract(radial.mul(3.0).sub(time.mul(0.08))).sub(0.5)));
  const uAccent = uniform(new THREE.Color(BIOMES[0].accentHex));
  floorMat.emissiveNode = uAccent.mul(runeRing.mul(0.45)).mul(float(0.4).add(uBeatPulse.mul(0.95)));

  const mainPlatform = collide(new THREE.Mesh(new THREE.CylinderGeometry(28, 26, 1.6, 8), floorMat));
  mainPlatform.position.y = -0.8;
  group.add(mainPlatform);

  // ── 2. Textured Fable-Style Stone Maze Walls & Ruined Battlements ──
  const stoneWallMat = new THREE.MeshStandardNodeMaterial({
    map: wallTex,
    roughness: 0.84,
    metalness: 0.14,
  });
  const runeBand = step(float(0.92), fract(uv().y.mul(4.0)));
  stoneWallMat.emissiveNode = mix(color(0x000000), uAccent, runeBand).mul(float(0.3).add(uBeatPulse.mul(0.6)));

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const wall = collide(new THREE.Mesh(new THREE.BoxGeometry(10.5, 3.6, 1.4), stoneWallMat));
    wall.position.set(Math.cos(a) * 25.2, 1.8, Math.sin(a) * 25.2);
    wall.rotation.y = -a + Math.PI / 2;
    group.add(wall);
  }

  const mazeSegments: Array<[number, number, number, number, number, number]> = [
    [9.5, 0, 1.4, 3.4, 7.5, 0.25],
    [-9.5, 0, 1.4, 3.4, 7.5, -0.25],
    [0, 9.5, 7.5, 3.4, 1.4, 0.15],
    [0, -9.5, 7.5, 3.4, 1.4, -0.15],
    [16.5, 11.5, 6.0, 3.8, 1.4, 0.78],
    [-16.5, -11.5, 6.0, 3.8, 1.4, 0.78],
    [-16.5, 11.5, 6.0, 3.8, 1.4, -0.78],
    [16.5, -11.5, 6.0, 3.8, 1.4, -0.78],
  ];
  for (const [x, z, w, h, d, ry] of mazeSegments) {
    const m = collide(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneWallMat));
    m.position.set(x, h * 0.5, z);
    m.rotation.y = ry;
    group.add(m);
  }

  // Warm Fable-style Brazier Torches
  const flameMat = new THREE.MeshStandardNodeMaterial({
    color: 0xf59e0b,
    emissive: 0xf97316,
    emissiveIntensity: 2.2,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = Math.cos(a) * 7.2;
    const bz = Math.sin(a) * 7.2;
    const pedestal = collide(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.6, 6), stoneWallMat));
    pedestal.position.set(bx, 0.8, bz);
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), flameMat);
    flame.position.set(bx, 1.95, bz);
    const torchLight = new THREE.PointLight(0xf97316, 4.5, 16);
    torchLight.position.set(bx, 2.3, bz);
    group.add(pedestal, flame, torchLight);
  }

  // ── 3. Maze-Runner Shifting Stone Gates ──
  const gateMat = new THREE.MeshStandardNodeMaterial({
    map: wallTex,
    roughness: 0.72,
    metalness: 0.25,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.22,
  });
  const gateConfigs: Array<{ pos: [number, number, number]; size: [number, number, number]; axis: [number, number, number]; phase: number }> = [
    { pos: [0, 1.9, 15.5], size: [5.4, 3.8, 1.2], axis: [4.8, 0, 0], phase: 0 },
    { pos: [0, 1.9, -15.5], size: [5.4, 3.8, 1.2], axis: [-4.8, 0, 0], phase: Math.PI },
    { pos: [15.5, 1.9, 0], size: [1.2, 3.8, 5.4], axis: [0, 0, 4.8], phase: Math.PI * 0.5 },
    { pos: [-15.5, 1.9, 0], size: [1.2, 3.8, 5.4], axis: [0, 0, -4.8], phase: Math.PI * 1.5 },
  ];
  for (const cfg of gateConfigs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...cfg.size), gateMat);
    mesh.position.set(...cfg.pos);
    group.add(mesh);
    gates.push({
      mesh,
      basePos: new THREE.Vector3(...cfg.pos),
      slideAxis: new THREE.Vector3(...cfg.axis),
      halfSize: new THREE.Vector3(cfg.size[0] * 0.5, cfg.size[1] * 0.5, cfg.size[2] * 0.5),
      phaseOffset: cfg.phase,
    });
  }

  // ── 4. Hunger-Games Void Hazard Sigil Traps ──
  const trapCoords: Array<[number, number, number]> = [
    [0, 0, 0],
    [12.5, 12.5, 2],
    [-12.5, -12.5, 4],
    [12.5, -12.5, 6],
    [-12.5, 12.5, 8],
  ];
  for (const [x, z, phaseOffset] of trapCoords) {
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0x1e1b2e,
      emissive: 0xd97706,
      emissiveIntensity: 0.4,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.08, 16), mat);
    mesh.position.set(x, 0.04, z);
    group.add(mesh);
    traps.push({
      mesh,
      mat,
      pos: new THREE.Vector3(x, 0, z),
      radius: 2.3,
      phaseOffset,
      active: false,
    });
  }

  // ── 5. Hovering Banished Archangel Halo & Sanctum Spire ──
  const haloGroup = new THREE.Group();
  haloGroup.position.set(0, 15.5, 0);
  const haloMat = new THREE.MeshStandardNodeMaterial({
    color: 0xf59e0b,
    emissive: 0xfbbf24,
    emissiveIntensity: 1.35,
    roughness: 0.25,
    metalness: 0.85,
  });
  const outerHalo = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.14, 12, 48), haloMat);
  const innerHalo = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.1, 10, 36), haloMat);
  const coreCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.35, 0),
    new THREE.MeshStandardNodeMaterial({
      color: 0x38bdf8,
      emissive: 0x7c3aed,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
  );
  haloGroup.add(outerHalo, innerHalo, coreCrystal);
  group.add(haloGroup);

  // ── 6. Lighting & Skybox ──
  const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1c140d, 1.05);
  const moonDir = new THREE.DirectionalLight(0xfef3c7, 1.65);
  moonDir.position.set(16, 26, 12);
  const voidLight = new THREE.PointLight(0x7c3aed, 3.5, 48);
  voidLight.position.set(0, 13, 0);
  group.add(hemi, moonDir, voidLight);

  const applySky = (url: string, fogHex: number) => {
    loader.load(url, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
    });
    scene.fog = new THREE.FogExp2(fogHex, 0.011);
  };
  applySky(BIOMES[0].skyUrl, BIOMES[0].fogHex);
  scene.add(group);

  let elapsed = 0;
  let biomeIndex = 0;

  return {
    group,
    uBeatPulse,
    gates,
    traps,
    get biomeIndex() { return biomeIndex; },
    setBiome(index: number) {
      biomeIndex = ((index % BIOMES.length) + BIOMES.length) % BIOMES.length;
      const b = BIOMES[biomeIndex];
      floorMat.map = loadTex(b.floorUrl, 6);
      floorMat.needsUpdate = true;
      const newWall = loadTex(b.wallUrl, 2);
      stoneWallMat.map = newWall;
      stoneWallMat.needsUpdate = true;
      gateMat.map = newWall;
      gateMat.needsUpdate = true;
      uAccent.value.setHex(b.accentHex);
      applySky(b.skyUrl, b.fogHex);
      return b;
    },
    update(dt: number, pulse: number, beatIndex: number) {
      elapsed += dt;
      uBeatPulse.value = pulse;

      outerHalo.rotation.x += dt * 0.3;
      outerHalo.rotation.y += dt * 0.45;
      innerHalo.rotation.z -= dt * 0.65;
      coreCrystal.rotation.y += dt * 0.85;
      coreCrystal.scale.setScalar(1 + pulse * 0.16);
      voidLight.intensity = 2.8 + pulse * 3.0;

      for (const g of gates) {
        const s = Math.sin(elapsed * 0.48 + g.phaseOffset);
        g.mesh.position.copy(g.basePos).addScaledVector(g.slideAxis, s);
      }

      for (const t of traps) {
        const step8 = (beatIndex + t.phaseOffset) % 8;
        if (step8 >= 6) {
          t.active = true;
          t.mat.emissive.setHex(0xf43f5e);
          t.mat.emissiveIntensity = 2.4 + pulse * 1.5;
        } else if (step8 >= 4) {
          t.active = false;
          t.mat.emissive.setHex(0xf59e0b);
          t.mat.emissiveIntensity = 0.8 + pulse * 1.2;
        } else {
          t.active = false;
          t.mat.emissive.setHex(0x0ea5e9);
          t.mat.emissiveIntensity = 0.25;
        }
      }
    },
    resolveDynamicGates(pos: THREE.Vector3, radius: number) {
      for (const g of gates) {
        const gx = g.mesh.position.x;
        const gz = g.mesh.position.z;
        const dx = pos.x - gx;
        const dz = pos.z - gz;
        const ox = g.halfSize.x + radius - Math.abs(dx);
        const oz = g.halfSize.z + radius - Math.abs(dz);
        if (ox > 0 && oz > 0 && pos.y < g.halfSize.y * 2) {
          if (ox < oz) pos.x += dx >= 0 ? ox : -ox;
          else pos.z += dz >= 0 ? oz : -oz;
        }
      }
    },
  };
}
