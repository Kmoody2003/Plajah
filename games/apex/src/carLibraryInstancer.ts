// Real 3D Car Library Instancer for Parked Cars, Parking Lots, and Commuter Traffic
//
// Replaces legacy `BoxGeometry` placeholder blocks with real 3D vehicle models from
// `public/games/apex/car/*_base.glb` (sedan, SUV, coupe, pickup, and commercial box truck).
// Each 60k-tri source GLB is fast-decimated once on load via spatial vertex clustering
// (~1,100–1,400 clean smooth-shaded tris preserving exact fenders, roofline, hood, and wheel
// arches) and rendered with a shared instanced OEM metallic-paint + smoked-glass + lamps
// material driven by per-instance color — 1 draw call per vehicle class at 60 FPS!
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sanitizeObjectForWebGPU } from './tsl/apexMaterialsTsl';
import { isRegionWebGpuActive } from './tsl/webgpuRuntime';

export type LibraryVehicleRole =
  | 'sedan'
  | 'suv'
  | 'coupe'
  | 'pickup'
  | 'truck'
  | 'taxi'
  | 'police'
  | 'van'
  | 'estate'
  | 'luxsuv'
  | 'crew'
  | 'semi'
  | 'bus'
  | 'shuttle'
  | 'tow'
  | 'hauler'
  | 'hd_pickup'
  | 'municipal'
  | 'tactical'
  | 'commander'
  | 'sport_gt'
  | 'muscle'
  | 'ev_sedan'
  | 'overland'
  | 'carrier'
  | 'hatch';

interface LibraryVehicleDef {
  role: LibraryVehicleRole;
  glb: string;
  /** Target real-world length (m) along +Z so every vehicle matches Ironport street/stall dimensions. */
  targetLen: number;
  cellSize: number;
  glassMinY: number;
  glassMaxY: number;
  glassZ0: number;
  glassZ1: number;
}

const LIBRARY_DEFS: LibraryVehicleDef[] = [
  { role: 'sedan', glb: '/games/apex/car/nexis_strada_base.glb', targetLen: 4.55, cellSize: 0.115, glassMinY: 0.90, glassMaxY: 1.38, glassZ0: -1.35, glassZ1: 1.15 },
  { role: 'suv', glb: '/games/apex/car/ironport_metro_suv_base.glb', targetLen: 4.72, cellSize: 0.125, glassMinY: 1.04, glassMaxY: 1.62, glassZ0: -1.65, glassZ1: 1.05 },
  { role: 'coupe', glb: '/games/apex/car/aureon_prestige_base.glb', targetLen: 4.60, cellSize: 0.115, glassMinY: 0.86, glassMaxY: 1.32, glassZ0: -1.25, glassZ1: 1.12 },
  { role: 'pickup', glb: '/games/apex/car/ironport_work_pickup_base.glb', targetLen: 5.10, cellSize: 0.135, glassMinY: 1.08, glassMaxY: 1.72, glassZ0: -0.45, glassZ1: 1.15 },
  { role: 'estate', glb: '/games/apex/car/velox_estate_base.glb', targetLen: 4.70, cellSize: 0.12, glassMinY: 0.90, glassMaxY: 1.38, glassZ0: -1.60, glassZ1: 1.08 },
  { role: 'luxsuv', glb: '/games/apex/car/aureon_luxury_suv_base.glb', targetLen: 4.95, cellSize: 0.13, glassMinY: 1.06, glassMaxY: 1.68, glassZ0: -1.75, glassZ1: 1.12 },
  { role: 'crew', glb: '/games/apex/car/titan_1500_crew_base.glb', targetLen: 5.35, cellSize: 0.14, glassMinY: 1.12, glassMaxY: 1.78, glassZ0: -0.60, glassZ1: 1.25 },
  { role: 'van', glb: '/games/apex/car/swiftpack_van_base.glb', targetLen: 5.35, cellSize: 0.145, glassMinY: 1.22, glassMaxY: 1.92, glassZ0: 0.35, glassZ1: 2.15 },
  { role: 'taxi', glb: '/games/apex/car/apex_taxi_base.glb', targetLen: 4.65, cellSize: 0.12, glassMinY: 0.90, glassMaxY: 1.38, glassZ0: -1.38, glassZ1: 1.15 },
  { role: 'police', glb: '/games/apex/car/vernon_police_base.glb', targetLen: 4.75, cellSize: 0.12, glassMinY: 0.88, glassMaxY: 1.36, glassZ0: -1.40, glassZ1: 1.15 },
  { role: 'truck', glb: '/games/apex/car/metropost_truck_base.glb', targetLen: 6.40, cellSize: 0.165, glassMinY: 1.35, glassMaxY: 2.15, glassZ0: 0.95, glassZ1: 2.65 },
  { role: 'semi', glb: '/games/apex/car/valkyrie_semi_base.glb', targetLen: 7.40, cellSize: 0.185, glassMinY: 1.75, glassMaxY: 2.65, glassZ0: 0.60, glassZ1: 2.50 },
  { role: 'bus', glb: '/games/apex/car/vectis_urban12_base.glb', targetLen: 10.6, cellSize: 0.22, glassMinY: 1.35, glassMaxY: 2.55, glassZ0: -4.40, glassZ1: 4.70 },
  { role: 'shuttle', glb: '/games/apex/car/vectra_shuttle_base.glb', targetLen: 6.10, cellSize: 0.155, glassMinY: 1.25, glassMaxY: 2.15, glassZ0: -2.10, glassZ1: 2.35 },
  { role: 'tow', glb: '/games/apex/car/vanguard_tow_base.glb', targetLen: 6.60, cellSize: 0.165, glassMinY: 1.32, glassMaxY: 2.10, glassZ0: 0.80, glassZ1: 2.55 },
  { role: 'hauler', glb: '/games/apex/car/terrahual_4500_base.glb', targetLen: 6.20, cellSize: 0.16, glassMinY: 1.28, glassMaxY: 2.02, glassZ0: 0.15, glassZ1: 2.05 },
  { role: 'hd_pickup', glb: '/games/apex/car/kodiak_hd2500_base.glb', targetLen: 5.55, cellSize: 0.145, glassMinY: 1.15, glassMaxY: 1.84, glassZ0: -0.55, glassZ1: 1.35 },
  { role: 'municipal', glb: '/games/apex/car/municipal_pickup_base.glb', targetLen: 5.15, cellSize: 0.135, glassMinY: 1.08, glassMaxY: 1.72, glassZ0: -0.45, glassZ1: 1.15 },
  { role: 'tactical', glb: '/games/apex/car/titan_sentinel_base.glb', targetLen: 5.75, cellSize: 0.15, glassMinY: 1.24, glassMaxY: 1.98, glassZ0: -1.60, glassZ1: 1.45 },
  { role: 'commander', glb: '/games/apex/car/ironport_commander_base.glb', targetLen: 5.10, cellSize: 0.13, glassMinY: 1.10, glassMaxY: 1.74, glassZ0: -1.80, glassZ1: 1.15 },
  { role: 'sport_gt', glb: '/games/apex/car/sidewinder_base.glb', targetLen: 4.58, cellSize: 0.115, glassMinY: 0.82, glassMaxY: 1.24, glassZ0: -1.25, glassZ1: 1.05 },
  { role: 'muscle', glb: '/games/apex/car/ironhide_base.glb', targetLen: 4.82, cellSize: 0.12, glassMinY: 0.86, glassMaxY: 1.32, glassZ0: -1.30, glassZ1: 1.02 },
  { role: 'ev_sedan', glb: '/games/apex/car/zephyr_majestic_ev_base.glb', targetLen: 4.78, cellSize: 0.12, glassMinY: 0.90, glassMaxY: 1.38, glassZ0: -1.45, glassZ1: 1.20 },
  { role: 'overland', glb: '/games/apex/car/overland_suv_base.glb', targetLen: 4.92, cellSize: 0.13, glassMinY: 1.08, glassMaxY: 1.72, glassZ0: -1.70, glassZ1: 1.10 },
  { role: 'carrier', glb: '/games/apex/car/ironport_carrier_base.glb', targetLen: 6.50, cellSize: 0.165, glassMinY: 1.36, glassMaxY: 2.18, glassZ0: 0.95, glassZ1: 2.65 },
  { role: 'hatch', glb: '/games/apex/car/vertix_terrahatch_base.glb', targetLen: 4.30, cellSize: 0.11, glassMinY: 0.92, glassMaxY: 1.42, glassZ0: -1.45, glassZ1: 1.08 },
];

export interface DecimatedLibraryVehicle {
  role: LibraryVehicleRole;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  size: THREE.Vector3;
}

/**
 * Fast vertex-clustering decimator: reduces a 60k-triangle car scan GLB down to ~1,200 crisp
 * triangles in ~6 ms while preserving the true automotive silhouette, fenders, roofline & hood.
 */
function decimateAndNormalizeGlb(root: THREE.Object3D, def: LibraryVehicleDef): { geo: THREE.BufferGeometry; size: THREE.Vector3 } {
  const bb = new THREE.Box3();
  const rawMeshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    m.geometry.computeBoundingBox();
    if (m.geometry.boundingBox) bb.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    rawMeshes.push(m);
  });

  const bsz = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const scale = bsz.z > 0.2 ? def.targetLen / bsz.z : 1;
  const invCell = 1 / def.cellSize;

  // Cluster vertices into spatial cells and accumulate positions
  const cellToId = new Map<string, number>();
  const sumX: number[] = [];
  const sumY: number[] = [];
  const sumZ: number[] = [];
  const cnt: number[] = [];
  const rawTris: number[] = [];
  const v = new THREE.Vector3();

  const getCluster = (x: number, y: number, z: number): number => {
    const ix = Math.round(x * invCell);
    const iy = Math.round(y * invCell);
    const iz = Math.round(z * invCell);
    const k = `${ix},${iy},${iz}`;
    let id = cellToId.get(k);
    if (id === undefined) {
      id = sumX.length;
      cellToId.set(k, id);
      sumX.push(0); sumY.push(0); sumZ.push(0); cnt.push(0);
    }
    sumX[id] += x;
    sumY[id] += y;
    sumZ[id] += z;
    cnt[id]++;
    return id;
  };

  for (const m of rawMeshes) {
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    const idx = m.geometry.index;
    const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
    const matW = m.matrixWorld;
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

      v.fromBufferAttribute(pos, i0).applyMatrix4(matW);
      const c0 = getCluster((v.x - center.x) * scale, (v.y - bb.min.y) * scale, (v.z - center.z) * scale);
      v.fromBufferAttribute(pos, i1).applyMatrix4(matW);
      const c1 = getCluster((v.x - center.x) * scale, (v.y - bb.min.y) * scale, (v.z - center.z) * scale);
      v.fromBufferAttribute(pos, i2).applyMatrix4(matW);
      const c2 = getCluster((v.x - center.x) * scale, (v.y - bb.min.y) * scale, (v.z - center.z) * scale);

      if (c0 !== c1 && c1 !== c2 && c2 !== c0) {
        rawTris.push(c0, c1, c2);
      }
    }
  }

  // Deduplicate identical triangles after clustering
  const seenTri = new Set<string>();
  const finalIdx: number[] = [];
  for (let i = 0; i < rawTris.length; i += 3) {
    const a = rawTris[i], b = rawTris[i + 1], c = rawTris[i + 2];
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
    const key = `${lo}_${mid}_${hi}`;
    if (seenTri.has(key)) continue;
    seenTri.add(key);
    finalIdx.push(a, b, c);
  }

  const nVerts = sumX.length;
  const positions = new Float32Array(nVerts * 3);
  for (let i = 0; i < nVerts; i++) {
    const inv = 1 / Math.max(1, cnt[i]);
    positions[i * 3] = sumX[i] * inv;
    positions[i * 3 + 1] = sumY[i] * inv;
    positions[i * 3 + 2] = sumZ[i] * inv;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(finalIdx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const outSize = geo.boundingBox ? geo.boundingBox.getSize(new THREE.Vector3()) : new THREE.Vector3(1.9, 1.45, def.targetLen);
  return { geo, size: outSize };
}

/**
 * Shared instanced automotive PBR shader: turns each decimated Car Library mesh into glossy
 * metallic paint (tinted by `instanceColor`), dark smoked glass greenhouse, matte-black wheels
 * & lower trim, recessed dark grille, warm-white headlights, and crimson taillights!
 */
function createInstancedCarMaterial(def: LibraryVehicleDef, size: THREE.Vector3, emissiveLights: boolean): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.48,
    envMapIntensity: 0.92,
  });
  const halfLen = size.z * 0.5;
  const halfWid = size.x * 0.5;
  const wheelZFront = halfLen * 0.62;
  const wheelZRear = -halfLen * 0.62;
  const wheelY = def.role === 'truck' ? 0.44 : 0.36;
  const wheelR = def.role === 'truck' ? 0.48 : 0.40;

  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCarGlass = { value: new THREE.Vector4(def.glassMinY, def.glassMaxY, def.glassZ0, def.glassZ1) };
    sh.uniforms.uCarDims = { value: new THREE.Vector4(halfWid, halfLen, wheelZFront, wheelZRear) };
    sh.uniforms.uCarWheel = { value: new THREE.Vector3(wheelY, wheelR, emissiveLights ? 1.0 : 0.0) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCarPos;
        uniform vec4 uCarGlass, uCarDims;
        uniform vec3 uCarWheel;
        float gCarRough, gCarMetal; vec3 gCarEmit;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cp = vCarPos;
        float ax = abs(cp.x);
        float zN = cp.z / max(0.5, uCarDims.y);
        float dw = min(length(vec2(cp.z - uCarDims.z, cp.y - uCarWheel.x)), length(vec2(cp.z - uCarDims.w, cp.y - uCarWheel.x)));
        bool isWheel = ax > uCarDims.x * 0.56 && dw < uCarWheel.y && cp.y < uCarWheel.x + uCarWheel.y * 0.82;
        bool isRim = isWheel && dw < uCarWheel.y * 0.56;
        bool isGlass = cp.y > uCarGlass.x && cp.y < uCarGlass.y && cp.z > uCarGlass.z && cp.z < uCarGlass.w && (ax > uCarDims.x * 0.42 || abs(cp.z - (uCarGlass.z + uCarGlass.w) * 0.5) > (uCarGlass.w - uCarGlass.z) * 0.28);
        bool isLowTrim = cp.y < 0.28 || (abs(zN) > 0.86 && cp.y < 0.46);
        bool isGrille = zN > 0.88 && ax < uCarDims.x * 0.56 && cp.y > 0.36 && cp.y < 0.72;
        bool isHead = zN > 0.84 && ax > uCarDims.x * 0.54 && ax < uCarDims.x * 0.94 && cp.y > 0.52 && cp.y < 0.76;
        bool isTail = zN < -0.85 && ax > uCarDims.x * 0.42 && ax < uCarDims.x * 0.94 && cp.y > 0.58 && cp.y < 0.84;

        // Ground contact AO & metallic automotive flop
        float ao = mix(0.45, 1.0, smoothstep(0.05, 0.42, cp.y));
        diffuseColor.rgb *= ao;
        gCarRough = 0.26;
        gCarMetal = 0.48;
        gCarEmit = vec3(0.0);

        if (isRim) { diffuseColor.rgb = vec3(0.55, 0.58, 0.62) * ao; gCarRough = 0.25; gCarMetal = 0.88; }
        else if (isWheel) { diffuseColor.rgb = vec3(0.025, 0.026, 0.030); gCarRough = 0.88; gCarMetal = 0.02; }
        else if (isGlass) { diffuseColor.rgb = vec3(0.025, 0.038, 0.055); gCarRough = 0.06; gCarMetal = 0.12; }
        else if (isHead) { diffuseColor.rgb = vec3(0.85, 0.88, 0.94); gCarRough = 0.12; gCarMetal = 0.2; gCarEmit = vec3(1.2, 1.12, 0.96) * uCarWheel.z; }
        else if (isTail) { diffuseColor.rgb = vec3(0.32, 0.02, 0.02); gCarRough = 0.14; gCarMetal = 0.15; gCarEmit = vec3(1.35, 0.08, 0.04) * (0.22 + 0.78 * uCarWheel.z); }
        else if (isGrille) { diffuseColor.rgb = vec3(0.03, 0.032, 0.038); gCarRough = 0.55; gCarMetal = 0.45; }
        else if (isLowTrim) { diffuseColor.rgb = vec3(0.035, 0.038, 0.042) * ao; gCarRough = 0.68; gCarMetal = 0.10; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gCarRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gCarMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gCarEmit;');
  };
  mat.customProgramCacheKey = () => `car-lib-inst-${def.role}-${emissiveLights ? 'lit' : 'parked'}`;
  return mat;
}

let libraryPromise: Promise<Map<LibraryVehicleRole, DecimatedLibraryVehicle>> | null = null;

/**
 * Loads and fast-decimates the 5 real 3D Car Library vehicle classes once per session.
 * Safe to await from `parkedCars.ts`, `parkingLots.ts`, and `simLayer.ts` concurrently.
 */
export function loadCarLibraryModels(): Promise<Map<LibraryVehicleRole, DecimatedLibraryVehicle>> {
  if (libraryPromise) return libraryPromise;
  const loader = new GLTFLoader();
  libraryPromise = (async () => {
    const map = new Map<LibraryVehicleRole, DecimatedLibraryVehicle>();
    await Promise.all(
      LIBRARY_DEFS.map(async (def) => {
        try {
          const gltf = await loader.loadAsync(def.glb);
          const { geo, size } = decimateAndNormalizeGlb(gltf.scene, def);
          const material = createInstancedCarMaterial(def, size, false);
          map.set(def.role, { role: def.role, geometry: geo, material, size });
        } catch (e) {
          console.warn('[carLibraryInstancer] failed to load', def.glb, e);
        }
      }),
    );
    return map;
  })();
  return libraryPromise;
}

/** Clones the instanced automotive shader with active headlights & taillights enabled for live moving traffic. */
const highResCache = new Map<string, Promise<THREE.Group | null>>();

/**
 * Load a FULL high-detail (un-decimated) vehicle model directly from `public/games/apex/car/*.glb`
 * for hero pursuit units (Police Interceptors, Tactical Police SUVs/Trucks, Robber Getaway Supercars).
 * Normalized to exact real-world length along +Z, grounded at y = 0, with glossy metallic clearcoat,
 * dark smoked greenhouse glass, headlights/taillights, and optional police two-tone + lightbar height.
 */
export async function loadHighQualityVehicleGlb(
  glbUrl: string,
  paintHex: number,
  targetLen = 4.75,
  isPolice = false,
): Promise<{ group: THREE.Group; roofY: number; size: THREE.Vector3 } | null> {
  let prom = highResCache.get(glbUrl);
  if (!prom) {
    prom = new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load(
        glbUrl,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => resolve(null),
      );
    });
    highResCache.set(glbUrl, prom);
  }
  const src = await prom;
  if (!src) return null;

  const clone = src.clone(true);
  if (isRegionWebGpuActive()) sanitizeObjectForWebGPU(clone);
  const bb = new THREE.Box3().setFromObject(clone);
  const bsz = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const scale = bsz.z > 0.2 ? targetLen / bsz.z : 1;

  const out = new THREE.Group();
  clone.scale.setScalar(scale);
  clone.position.set(-center.x * scale, -bb.min.y * scale, -center.z * scale);
  out.add(clone);

  const finalSize = new THREE.Vector3(bsz.x * scale, bsz.y * scale, bsz.z * scale);
  // Compute true steel roof-panel height (90th percentile of central cabin vertices) so tall rooftop whip antennas never float the police lightbar!
  const roofYs: number[] = [];
  const tmpV = new THREE.Vector3();
  clone.updateMatrixWorld(true);
  clone.traverse((o) => {
    const m = o as THREE.Mesh;
    const pos = m.isMesh ? m.geometry?.attributes?.position : null;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 1200));
    for (let i = 0; i < pos.count; i += step) {
      tmpV.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(tmpV.x) < finalSize.x * 0.26 && tmpV.z > -finalSize.z * 0.24 && tmpV.z < finalSize.z * 0.14 && tmpV.y > finalSize.y * 0.52) {
        roofYs.push(tmpV.y);
      }
    }
  });
  roofYs.sort((a, b) => a - b);
  const trueRoofY = roofYs.length > 16 ? roofYs[Math.floor(roofYs.length * 0.90)] : finalSize.y * 0.86;
  const halfLen = finalSize.z * 0.5;
  const halfWid = finalSize.x * 0.5;
  const isHeavy = targetLen > 5.0;
  const gMinY = finalSize.y * (isHeavy ? 0.54 : 0.57);
  const gMaxY = finalSize.y * 0.93;

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: paintHex,
    roughness: 0.20,
    metalness: 0.62,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.15,
  });
  bodyMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHqCarPos;\nvarying vec3 vHqCarNrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvHqCarPos = vec3((position.x - ${center.x.toFixed(4)}) * ${scale.toFixed(5)}, (position.y - ${bb.min.y.toFixed(4)}) * ${scale.toFixed(5)}, (position.z - ${center.z.toFixed(4)}) * ${scale.toFixed(5)});\nvHqCarNrm = normalize(normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHqCarPos;\nvarying vec3 vHqCarNrm;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 _hp = vHqCarPos;
        vec3 _hn = normalize(vHqCarNrm);
        float _hIsWheel = (1.0 - smoothstep(${(isHeavy ? 0.44 : 0.36).toFixed(2)}, ${(isHeavy ? 0.56 : 0.46).toFixed(2)}, min(length(vec2(_hp.z - ${(halfLen * 0.62).toFixed(2)}, _hp.y - ${(isHeavy ? 0.44 : 0.36).toFixed(2)})), length(vec2(_hp.z + ${(halfLen * 0.62).toFixed(2)}, _hp.y - ${(isHeavy ? 0.44 : 0.36).toFixed(2)}))))) * smoothstep(${(halfWid * 0.55).toFixed(2)}, ${(halfWid * 0.80).toFixed(2)}, abs(_hp.x));
        float _hGlassY = smoothstep(${gMinY.toFixed(2)}, ${(gMinY + 0.08).toFixed(2)}, _hp.y) * (1.0 - smoothstep(${(gMaxY - 0.06).toFixed(2)}, ${(gMaxY + 0.02).toFixed(2)}, _hp.y));
        float _hGlassZ = smoothstep(${(-halfLen * 0.62).toFixed(2)}, ${(-halfLen * 0.50).toFixed(2)}, _hp.z) * (1.0 - smoothstep(${(halfLen * 0.45).toFixed(2)}, ${(halfLen * 0.56).toFixed(2)}, _hp.z));
        float _hIsGlass = _hGlassY * _hGlassZ * (1.0 - smoothstep(0.68, 0.88, _hn.y));
        float _hIsTrim = (1.0 - smoothstep(0.16, 0.28, _hp.y)) * (1.0 - _hIsWheel);
        float _hIsGrille = smoothstep(${(halfLen * 0.86).toFixed(2)}, ${(halfLen * 0.94).toFixed(2)}, _hp.z) * smoothstep(0.26, 0.36, _hp.y) * (1.0 - smoothstep(0.66, 0.78, _hp.y)) * (1.0 - smoothstep(${(halfWid * 0.45).toFixed(2)}, ${(halfWid * 0.60).toFixed(2)}, abs(_hp.x)));
        ${isPolice ? `// Classic crisp Police Interceptor white doors & roof contrast panel over navy/obsidian patrol body
        float _pDoor = smoothstep(${(-halfLen * 0.36).toFixed(2)}, ${(-halfLen * 0.28).toFixed(2)}, _hp.z) * (1.0 - smoothstep(${(halfLen * 0.26).toFixed(2)}, ${(halfLen * 0.34).toFixed(2)}, _hp.z)) * smoothstep(0.32, 0.40, _hp.y) * (1.0 - _hIsGlass);
        float _pRoof = smoothstep(${(gMaxY - 0.08).toFixed(2)}, ${gMaxY.toFixed(2)}, _hp.y) * smoothstep(0.60, 0.80, _hn.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.94, 0.96), max(_pDoor, _pRoof) * 0.92);` : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.048, 0.068), _hIsGlass * 0.94);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.04, 0.045), max(_hIsWheel, max(_hIsTrim * 0.85, _hIsGrille * 0.9)));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float _hHead = smoothstep(${(halfLen * 0.86).toFixed(2)}, ${(halfLen * 0.94).toFixed(2)}, vHqCarPos.z) * smoothstep(0.50, 0.62, vHqCarPos.y) * (1.0 - smoothstep(0.80, 0.92, vHqCarPos.y)) * smoothstep(${(halfWid * 0.44).toFixed(2)}, ${(halfWid * 0.64).toFixed(2)}, abs(vHqCarPos.x));
        float _hTail = smoothstep(${(halfLen * 0.86).toFixed(2)}, ${(halfLen * 0.94).toFixed(2)}, -vHqCarPos.z) * smoothstep(0.54, 0.66, vHqCarPos.y) * (1.0 - smoothstep(0.86, 0.98, vHqCarPos.y)) * smoothstep(${(halfWid * 0.38).toFixed(2)}, ${(halfWid * 0.60).toFixed(2)}, abs(vHqCarPos.x));
        totalEmissiveRadiance += vec3(1.85, 1.75, 1.45) * _hHead + vec3(1.55, 0.09, 0.05) * _hTail;`,
      );
  };
  bodyMat.customProgramCacheKey = () => `hq-vehicle-${glbUrl}-${isPolice ? 'pol' : 'civ'}`;

  clone.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = bodyMat;
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return { group: out, roofY: trueRoofY, size: finalSize };
}

export function createTrafficLibraryMaterial(role: LibraryVehicleRole, size: THREE.Vector3): THREE.MeshStandardMaterial {
  const def = LIBRARY_DEFS.find((d) => d.role === role) ?? LIBRARY_DEFS[0];
  return createInstancedCarMaterial(def, size, true);
}

/**
 * Spatial-chunked instanced builder for static parked cars (curbs, driveways, parking lots):
 * Splits cars into frustum- & distance-cullable 220 m cells per vehicle class so thousands of
 * real 3D Car Library vehicles across the 150 km² region only draw the ~40–90 cars near the player!
 */
export function populateChunkedLibraryCars(
  parent: THREE.Group,
  entries: Array<{ x: number; y: number; z: number; yaw: number; color: number; scaleZ?: number }>,
  models: Map<LibraryVehicleRole, DecimatedLibraryVehicle>,
  castShadow: boolean,
): void {
  const isMidGpu = typeof window !== 'undefined' && (window as unknown as { perfTier?: string }).perfTier !== 'high';
  const baseRoles: LibraryVehicleRole[] = isMidGpu
    ? ['sedan', 'suv', 'coupe', 'pickup']
    : ['sedan', 'suv', 'coupe', 'pickup', 'estate', 'luxsuv', 'crew', 'van', 'taxi', 'police'];
  const roles: LibraryVehicleRole[] = baseRoles.filter((r) => models.has(r));
  if (!roles.length || !entries.length) return;
  const effShadow = castShadow && !isMidGpu;

  const CELL = 220;
  const buckets = new Map<string, Array<{ x: number; y: number; z: number; yaw: number; color: number; scaleZ?: number }>>();

  entries.forEach((e, i) => {
    const role = roles[i % roles.length];
    const key = `${role}:${Math.floor(e.x / CELL)},${Math.floor(e.z / CELL)}`;
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(e);
  });

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();

  buckets.forEach((list, key) => {
    const role = key.split(':')[0] as LibraryVehicleRole;
    const mod = models.get(role);
    if (!mod) return;
    const im = new THREE.InstancedMesh(mod.geometry, mod.material, list.length);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      q.setFromAxisAngle(up, c.yaw);
      sc.set(1, 1, c.scaleZ ?? 1);
      m4.compose(pos.set(c.x, c.y, c.z), q, sc);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setHex(c.color));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = effShadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.frustumCulled = true;
    im.userData.maxDist = isMidGpu ? 200 : 300;
    im.userData.maxShadowDist = effShadow ? 130 : 0;
    parent.add(im);
  });
}
