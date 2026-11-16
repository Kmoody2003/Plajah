import * as THREE from 'three/webgpu';
import { loadIronportBuilding, loadRepeatingTexture } from './assets';
import {
  createWorldMapData,
  type CircuitDef,
  type CircuitId,
  type FastTravelPoint,
} from './worldMap';

export type SurfaceType = 'asphalt' | 'sand' | 'grass';

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BroadcastCam {
  id: string;
  label: string;
  pos: THREE.Vector3;
}

export interface WorldData {
  circuits: Record<CircuitId, CircuitDef>;
  fastTravelPoints: FastTravelPoint[];
  i196Samples: THREE.Vector3[];
  suburbSamples: THREE.Vector3[];
  riverSamples: THREE.Vector3[];
  broadcastCams: BroadcastCam[];
  colliders: BoxCollider[];
  skyMat: THREE.MeshBasicMaterial;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  waterMesh: THREE.Mesh;
  updateWorld: (t: number, timeOfDay: TimeOfDay) => void;
  terrainHeight: (x: number, z: number) => number;
  surfaceAt: (x: number, z: number) => SurfaceType;
  zoneNameAt: (x: number, z: number) => string;
}

export type TimeOfDay = 'golden' | 'night' | 'overcast';

export function buildWorld(scene: THREE.Scene): WorldData {
  const map = createWorldMapData();
  const { riverSamples, i196Samples, suburbSamples, circuits, fastTravelPoints } = map;
  const allCircuits = Object.values(circuits);

  function distToSamples(samples: THREE.Vector3[], x: number, z: number, step = 2): number {
    let minD2 = Infinity;
    for (let i = 0; i < samples.length; i += step) {
      const p = samples[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) minD2 = d2;
    }
    return Math.sqrt(minD2);
  }

  function distToRiver(x: number, z: number): number {
    return distToSamples(riverSamples, x, z, 2);
  }

  // Elevation function for the 10-mile macro world
  function terrainHeight(x: number, z: number): number {
    // 1. River channel carved below water level (y = -2.2)
    const dr = distToRiver(x, z);
    const riverHalfW = x < -2000 && x > -5200 ? 220 : 125; // wider in River Deltas
    const riverCarve = dr < riverHalfW ? -5.0 * (1 - dr / riverHalfW) : 0;

    // 2. Ironport City (x > 5600) is flat urban grid, except bridges over the river
    const cityBlend = x > 5600 ? 0 : THREE.MathUtils.clamp((5600 - x) / 900, 0, 1);

    // 3. Great Lakes International Raceway & Lakeshore Bluffs (west coast x < -5400, z < 400)
    const bluffWeight =
      THREE.MathUtils.smoothstep(-x, 5400, 7400) *
      THREE.MathUtils.smoothstep(-z, -400, 1200);
    const bluffBase = 26 * bluffWeight;
    const racewayFlow =
      Math.sin(x * 0.0022) * Math.cos(z * 0.0024) * 11 * bluffWeight;

    // 4. Rolling Moraine Hills (north-central & northeast countryside)
    const hillWeight =
      THREE.MathUtils.smoothstep(-z, 800, 2600) *
      THREE.MathUtils.smoothstep(x, -5600, -1800) *
      THREE.MathUtils.smoothstep(-x, -4200, -1200);
    const hills =
      (Math.sin(x * 0.0014) * Math.cos(z * 0.0016) * 32 +
        Math.sin(x * 0.0031 + 0.7) * Math.sin(z * 0.0028) * 12) *
      hillWeight;

    // 5. Western Dune Sea (Silver Lake style, southwest x < -6400, z > 1300)
    const duneWeight =
      THREE.MathUtils.smoothstep(-x, 6300, 7600) *
      THREE.MathUtils.smoothstep(z, 1300, 2200);
    const dunes =
      (Math.sin(x * 0.0045) * Math.cos(z * 0.0042) * 24 +
        Math.cos(x * 0.009 - z * 0.008) * 9 +
        18) *
      duneWeight;

    // 6. Lake Michigan drop-off on the far west (x < -8050)
    const lakeDrop = x < -8050 ? Math.max(-6, (-8050 - x) * -0.04) : 0;

    let h = (bluffBase + racewayFlow + hills + dunes) * cityBlend + riverCarve + lakeDrop;

    // Keep bridge decks on Foundry & Bridge Circuit elevated above river (y = +4.8m)
    const dfb = distToSamples(circuits.foundry_bridge.samples, x, z, 2);
    if (dfb < 22 && dr < 155) {
      const bridgeBlend = 1 - THREE.MathUtils.smoothstep(dr, 95, 155);
      h = THREE.MathUtils.lerp(h, 4.8, bridgeBlend);
    }

    return Math.max(-5.5, h);
  }

  // Stamp road Y onto all splines (with bridge elevation over the river)
  function stampSamplesY(samples: THREE.Vector3[], liftBridge = false) {
    for (const p of samples) {
      let y = terrainHeight(p.x, p.z);
      if (liftBridge && distToRiver(p.x, p.z) < 150) {
        y = Math.max(y, 4.8);
      }
      p.y = y;
    }
  }

  stampSamplesY(circuits.ironport_gp.samples, false);
  stampSamplesY(circuits.foundry_bridge.samples, true);
  stampSamplesY(circuits.great_lakes_raceway.samples, false);
  stampSamplesY(i196Samples, true);
  stampSamplesY(suburbSamples, false);

  function surfaceAt(x: number, z: number): SurfaceType {
    for (const c of allCircuits) {
      if (distToSamples(c.samples, x, z, 2) <= c.roadWidth * 0.62) return 'asphalt';
    }
    if (distToSamples(i196Samples, x, z, 2) <= 10) return 'asphalt';
    if (distToSamples(suburbSamples, x, z, 2) <= 8) return 'asphalt';
    if (x < -6400 && z > 1250) return 'sand';
    if (x < -7850) return 'sand';
    return 'grass';
  }

  function zoneNameAt(x: number, z: number): string {
    for (const c of allCircuits) {
      if (distToSamples(c.samples, x, z, 3) <= c.roadWidth * 0.95) return c.name;
    }
    if (x < -8050) return 'Lake Michigan Shoreline';
    if (x < -6400 && z > 1250) return 'Silver Lake Dune Sea';
    if (x < -6400 && z <= 1250 && z > 650) return 'Harborfest Waterfront';
    if (x < -6200) return 'Lakeshore Bluffs';
    if (distToRiver(x, z) < 220 && x < -1000 && x > -5200) return 'River Deltas';
    if (x > 5600 && z < 150) return 'Ironport North (Downtown)';
    if (x > 5600 && z >= 150) return 'Ironport South (Foundry & Harbor)';
    if (x >= 2800 && x <= 5600) return 'Ironport Suburban Loops';
    if (z < -1200 && x >= -5800 && x <= 2800) return 'Pinewood Forest & Moraine Hills';
    return 'Harvest Valley · Farmland Grid';
  }

  // ── Lighting & Sky Dome ──
  const hemiLight = new THREE.HemisphereLight(0xffd6a5, 0x1e2b3a, 1.15);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffb870, 3.2);
  sunLight.position.set(-1600, 680, 900);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 50;
  sunLight.shadow.camera.far = 4500;
  const d = 1200;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const skyTex = loadRepeatingTexture('/racer-refs/Twilight_sky_with_city_horizon_3d4b775b.jpg', 2, 1);
  const skyGeo = new THREE.SphereGeometry(12000, 32, 20);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    color: 0xffcca3,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  scene.fog = new THREE.FogExp2(0xd99b72, 0.00014);

  // ── Macro Terrain Mesh (18 km x 12 km) ──
  const terrainGeo = new THREE.PlaneGeometry(18400, 12000, 220, 150);
  terrainGeo.rotateX(-Math.PI * 0.5);
  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x2e4d2b);
  const cFarm = new THREE.Color(0x56682f);
  const cSand = new THREE.Color(0xd6bf8f);
  const cCity = new THREE.Color(0x232831);
  const cSuburb = new THREE.Color(0x365134);
  const tmpC = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);

    if (x < -6400 && z > 1200) {
      tmpC.copy(cSand);
    } else if (x < -7650) {
      tmpC.copy(cSand);
    } else if (x > 5600) {
      tmpC.copy(cCity);
    } else if (x > 2800) {
      tmpC.copy(cSuburb);
    } else if (z > -1000 && z < 1600 && x > -4600 && x < 2200) {
      const patch = (Math.floor((x + 5000) / 650) + Math.floor((z + 1200) / 600)) % 2;
      tmpC.copy(patch === 0 ? cFarm : cGrass);
    } else {
      tmpC.copy(cGrass);
    }
    colors[i * 3] = tmpC.r;
    colors[i * 3 + 1] = tmpC.g;
    colors[i * 3 + 2] = tmpC.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04 })
  );
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // ── Lake Michigan & Ironport River Water Plane ──
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d4f68,
    roughness: 0.14,
    metalness: 0.18,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  });
  const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(24000, 14000), waterMat);
  waterMesh.rotation.x = -Math.PI * 0.5;
  waterMesh.position.set(-2000, -1.5, 0);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // ── Road & Circuit Ribbon Builder ──
  const tarmacTex = loadRepeatingTexture('/racer-refs/Wet_black_tarmac_texture_map_bf1ed680.jpg', 2, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: tarmacTex,
    color: 0x727882,
    roughness: 0.34,
    metalness: 0.18,
  });

  function buildRoadRibbon(samples: THREE.Vector3[], width: number, closed: boolean, withKerbs: boolean) {
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const kVerts: number[] = [];
    const kCols: number[] = [];
    const kIdx: number[] = [];

    const N = samples.length;
    const hw = width * 0.5;
    const kw = 1.1;

    for (let i = 0; i < N; i++) {
      const curr = samples[i];
      const next = samples[closed ? (i + 1) % N : Math.min(N - 1, i + 1)];
      const prev = samples[closed ? (i - 1 + N) % N : Math.max(0, i - 1)];
      const dir = new THREE.Vector3().subVectors(next, prev).normalize();
      const right = new THREE.Vector3(-dir.z, 0, dir.x);

      const lx = curr.x - right.x * hw;
      const lz = curr.z - right.z * hw;
      const rx = curr.x + right.x * hw;
      const rz = curr.z + right.z * hw;
      const y = curr.y + 0.12;

      verts.push(lx, y, lz, rx, y, rz);
      uvs.push(0, i * 0.35, 1, i * 0.35);

      if (withKerbs) {
        const klx = curr.x - right.x * (hw + kw);
        const klz = curr.z - right.z * (hw + kw);
        const krx = curr.x + right.x * (hw + kw);
        const krz = curr.z + right.z * (hw + kw);
        kVerts.push(klx, y + 0.02, klz, lx, y + 0.02, lz);
        kVerts.push(rx, y + 0.02, rz, krx, y + 0.02, krz);
        const isRed = Math.floor(i / 2) % 2 === 0;
        const kr = isRed ? 0.86 : 0.92;
        const kg = isRed ? 0.16 : 0.92;
        const kb = isRed ? 0.14 : 0.92;
        for (let k = 0; k < 4; k++) kCols.push(kr, kg, kb);
      }

      if (closed || i < N - 1) {
        const a = i * 2;
        const b = ((i + 1) % N) * 2;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
        if (withKerbs) {
          const ka = i * 4;
          const kbIdx = ((i + 1) % N) * 4;
          kIdx.push(ka, ka + 1, kbIdx, ka + 1, kbIdx + 1, kbIdx);
          kIdx.push(ka + 2, ka + 3, kbIdx + 2, ka + 3, kbIdx + 3, kbIdx + 2);
        }
      }
    }

    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    rGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rGeo.setIndex(idx);
    rGeo.computeVertexNormals();
    const rMesh = new THREE.Mesh(rGeo, roadMat);
    rMesh.receiveShadow = true;
    scene.add(rMesh);

    if (withKerbs) {
      const kGeo = new THREE.BufferGeometry();
      kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kVerts, 3));
      kGeo.setAttribute('color', new THREE.Float32BufferAttribute(kCols, 3));
      kGeo.setIndex(kIdx);
      kGeo.computeVertexNormals();
      const kMesh = new THREE.Mesh(kGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
      kMesh.receiveShadow = true;
      scene.add(kMesh);
    }
  }

  for (const c of allCircuits) {
    buildRoadRibbon(c.samples, c.roadWidth, true, true);
    // Start/Finish Gantry per circuit
    const startPt = c.samples[0];
    const startNext = c.samples[1];
    const startDir = new THREE.Vector3().subVectors(startNext, startPt).normalize();
    const gantry = new THREE.Group();
    gantry.position.copy(startPt);
    gantry.rotation.y = Math.atan2(startDir.x, startDir.z);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x222730, metalness: 0.7, roughness: 0.3 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x11151d, emissive: 0xff6b2b, emissiveIntensity: 0.9 });
    for (const sx of [-c.roadWidth * 0.5 - 1.2, c.roadWidth * 0.5 + 1.2]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 8.5, 1.1), pillarMat);
      pillar.position.set(sx, 4.25, 0);
      gantry.add(pillar);
    }
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(c.roadWidth + 3.5, 1.8, 1.2), bannerMat);
    crossBeam.position.set(0, 7.8, 0);
    gantry.add(crossBeam);

    const checkerMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.6 });
    for (let k = -8; k <= 8; k += 2) {
      const sq = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 1.8), checkerMat);
      sq.position.set(k, 0.14, 0);
      gantry.add(sq);
    }
    scene.add(gantry);
  }

  buildRoadRibbon(i196Samples, 15, false, false);
  buildRoadRibbon(suburbSamples, 12, true, false);

  // ── Stream Validated glTF Buildings Across Ironport North, South, Suburbs, Farmland & Harborfest ──
  const colliders: BoxCollider[] = [];
  const placements: { kind: 'hero' | 'generic'; slug: string; x: number; z: number; rotY?: number; lod?: 0 | 1 }[] = [
    // Ironport North (Downtown)
    { kind: 'hero', slug: 'ironport-towers', x: 7450, z: -480, rotY: 0 },
    { kind: 'hero', slug: 'foundry-tower', x: 7340, z: -460, rotY: 0 },
    { kind: 'hero', slug: 'the-guardian', x: 6940, z: -1680, rotY: 0.2 },
    { kind: 'hero', slug: 'penobscot-tower', x: 6420, z: -490, rotY: 0 },
    { kind: 'hero', slug: 'city-hall', x: 7020, z: -1150, rotY: 0 },
    { kind: 'hero', slug: 'central-library', x: 6950, z: -780, rotY: Math.PI },
    { kind: 'hero', slug: 'grand-theatre-garage', x: 6540, z: -2020, rotY: 0 },
    { kind: 'hero', slug: 'ironport-ballpark', x: 6340, z: -1480, rotY: 0.4 },
    { kind: 'hero', slug: 'ironport-dome', x: 5960, z: -1580, rotY: 0 },
    { kind: 'hero', slug: 'market-hall-a', x: 5960, z: -920, rotY: Math.PI * 0.5 },
    { kind: 'hero', slug: 'market-hall-b', x: 5960, z: -760, rotY: Math.PI * 0.5 },
    { kind: 'hero', slug: 'kestrel-hq', x: 7360, z: -860, rotY: -Math.PI * 0.5 },
    { kind: 'hero', slug: 'aurelia-hq', x: 7180, z: -1240, rotY: 0 },
    { kind: 'generic', slug: 'brick-office-block', x: 6750, z: -560, rotY: 0, lod: 1 },
    { kind: 'generic', slug: 'midtown-office-tower', x: 6620, z: -980, rotY: 0, lod: 1 },
    { kind: 'generic', slug: 'downtown-hotel', x: 7280, z: -1560, rotY: 0, lod: 1 },
    // Ironport South (Foundry & Harbor across the river)
    { kind: 'hero', slug: 'halcyon-hq', x: 6880, z: 620, rotY: Math.PI },
    { kind: 'hero', slug: 'meridian-hq', x: 6480, z: 580, rotY: 0 },
    { kind: 'hero', slug: 'ferry-terminal', x: 7050, z: 320, rotY: Math.PI },
    { kind: 'hero', slug: 'ironport-arena', x: 7260, z: 640, rotY: 0 },
    { kind: 'hero', slug: 'riverfront-silos', x: 6040, z: 620, rotY: 0 },
    { kind: 'generic', slug: 'auto-repair-shop', x: 6220, z: 910, rotY: 0, lod: 1 },
    { kind: 'generic', slug: 'gas-station', x: 6040, z: 880, rotY: 0, lod: 1 },
    // Suburban Loops
    { kind: 'generic', slug: 'craftsman-bungalow', x: 4550, z: -720, rotY: 0, lod: 1 },
    { kind: 'generic', slug: 'colonial-house', x: 4250, z: -1120, rotY: 0.4, lod: 1 },
    { kind: 'generic', slug: 'split-level-house', x: 3750, z: -980, rotY: -0.3, lod: 1 },
    { kind: 'generic', slug: 'strip-mall', x: 4650, z: -320, rotY: 0, lod: 1 },
    // Harvest Valley Farmland Grid
    { kind: 'generic', slug: 'classic-red-barn', x: -1650, z: 80, rotY: 0, lod: 1 },
    { kind: 'generic', slug: 'grain-silo-twin', x: -1720, z: 120, rotY: 0, lod: 1 },
    { kind: 'generic', slug: 'dairy-barn', x: -2950, z: -180, rotY: 0.5, lod: 1 },
    { kind: 'generic', slug: 'farmhouse', x: -1950, z: 420, rotY: 0, lod: 1 },
    { kind: 'generic', slug: 'windmill', x: -2450, z: -120, rotY: 0, lod: 1 },
    // Harborfest Waterfront (West Coast)
    { kind: 'hero', slug: 'harborfront-expo', x: -6760, z: 1180, rotY: -0.4 },
    { kind: 'hero', slug: 'marina-clubhouse', x: -7050, z: 1120, rotY: 0.3 },
    { kind: 'generic', slug: 'neighborhood-diner', x: -6620, z: 880, rotY: 0, lod: 1 },
  ];

  for (const bp of placements) {
    void loadIronportBuilding(bp.kind, bp.slug, bp.lod ?? 0).then((group) => {
      if (!group) return;
      group.position.set(bp.x, terrainHeight(bp.x, bp.z), bp.z);
      if (bp.rotY) group.rotation.y = bp.rotY;
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    });
  }

  // ── Lighthouse Point (Northwest Bluffs) ──
  const lhX = -7320;
  const lhZ = -3900;
  const lhY = terrainHeight(lhX, lhZ);
  const lhTower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.8, 30, 14),
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 })
  );
  lhTower.position.set(lhX, lhY + 15, lhZ);
  scene.add(lhTower);
  const lhBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 3.0, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 3.5 })
  );
  lhBeacon.position.set(lhX, lhY + 31, lhZ);
  scene.add(lhBeacon);

  // ── Instanced Pinewood Forest (320 trees in 2 draw calls for 60 FPS across 17km) ──
  const treeCount = 320;
  const trunkInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.4, 0.55, 5, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 0.9 }),
    treeCount
  );
  const leafInst = new THREE.InstancedMesh(
    new THREE.ConeGeometry(3.4, 10, 7),
    new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.85 }),
    treeCount
  );
  const dummy = new THREE.Object3D();
  let seed = 4242;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  let placed = 0;
  for (let i = 0; i < 900 && placed < treeCount; i++) {
    const tx = -6800 + rand() * 11600;
    const tz = -5100 + rand() * 8200;
    if (distToRiver(tx, tz) < 260) continue;
    if (distToSamples(i196Samples, tx, tz, 4) < 28) continue;
    if (distToSamples(circuits.great_lakes_raceway.samples, tx, tz, 4) < 35) continue;
    const ty = terrainHeight(tx, tz);
    if (ty < 0.2) continue;
    const sc = 0.9 + rand() * 0.8;
    dummy.position.set(tx, ty + 2.5 * sc, tz);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(tx, ty + 8.5 * sc, tz);
    dummy.updateMatrix();
    leafInst.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunkInst.count = placed;
  leafInst.count = placed;
  scene.add(trunkInst, leafInst);

  // ── Fixed Broadcast Replay Cameras ──
  const broadcastCams: BroadcastCam[] = [
    { id: 'TV1', label: 'Ironport GP Gantry', pos: new THREE.Vector3(6580, 10, -300) },
    { id: 'TV2', label: 'RenCen Plaza', pos: new THREE.Vector3(7520, 22, -440) },
    { id: 'TV3', label: 'Foundry Bridge North', pos: new THREE.Vector3(7480, 14, 140) },
    { id: 'TV4', label: 'Great Lakes Pit Straight', pos: new THREE.Vector3(-6520, 38, -2060) },
    { id: 'TV5', label: 'Coastal Carousel', pos: new THREE.Vector3(-7560, 38, -2480) },
  ];

  function updateWorld(t: number, timeOfDay: TimeOfDay) {
    waterMesh.position.y = -1.5 + Math.sin(t * 0.9) * 0.08;
    if (timeOfDay === 'golden') {
      skyMat.color.setHex(0xffcca3);
      (scene.fog as THREE.FogExp2).color.setHex(0xd99b72);
      sunLight.color.setHex(0xffb870);
      sunLight.intensity = 3.2;
    } else if (timeOfDay === 'night') {
      skyMat.color.setHex(0x283c66);
      (scene.fog as THREE.FogExp2).color.setHex(0x0a1326);
      sunLight.color.setHex(0x7aa2f7);
      sunLight.intensity = 1.25;
    } else {
      skyMat.color.setHex(0xb8cde0);
      (scene.fog as THREE.FogExp2).color.setHex(0x889cb0);
      sunLight.color.setHex(0xe2ecf5);
      sunLight.intensity = 2.1;
    }
  }

  return {
    circuits,
    fastTravelPoints,
    i196Samples,
    suburbSamples,
    riverSamples,
    broadcastCams,
    colliders,
    skyMat,
    sunLight,
    hemiLight,
    waterMesh,
    updateWorld,
    terrainHeight,
    surfaceAt,
    zoneNameAt,
  };
}
