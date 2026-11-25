// games/forth-horizon/src/apexLighting.ts
//
// Plajah Motorsport: Apex — Unified Playkit Lighting, Baked L2 SH9 GI Probes,
// Per-District Local Look Volumes, and Live Clustered Street / Tunnel / Harbor / Car Lights.
//
// Built directly on `playkit/render/webglLighting.ts` using the exact same `ClusteredLightManager`,
// `IrradianceProbeVolume`, `WorldProbeSite`, `WorldLightSpec`, and `LocalLookVolume` schema as
// Vesselbound (`playkit/render/liveLighting.ts`) so Ironport's entire lighting world transfers
// 1:1 when Apex migrates to WebGPU/TSL.

import * as THREE from 'three';
import type { ClusteredLightManager } from '../../../playkit/render/clusteredLights';
import {
  PlaykitWebGLLightingController,
  enhanceStandardMaterialWithPlaykitGi,
  type LocalLookVolume,
  type PlaykitWebGLGiUniforms,
  type WorldLightSpec,
  type WorldProbeSite,
} from '../../../playkit/render/webglLighting';

export interface ApexLightingMeta {
  places?: Array<{ name: string; xz: number[] }>;
  circuits?: Record<string, { name: string; xz: number[][]; tunnel?: { from: number; to: number } }>;
}

export interface ApexHarborLightSource {
  cranes?: Array<{ c: number[]; dir: number }>;
  terminals?: Array<{ name: string; c: number[]; w: number; d: number }>;
}

export interface ApexLightingInit {
  scene: THREE.Scene;
  clusterManager: ClusteredLightManager;
  lowTier: boolean;
}

export class ApexPlaykitLighting {
  readonly controller: PlaykitWebGLLightingController;
  readonly uniforms: PlaykitWebGLGiUniforms;

  private streetLightsRegistered = false;
  private harborLightsRegistered = false;
  private regionBuilt = false;
  private readonly tmpFocus = new THREE.Vector3();

  constructor(opts: ApexLightingInit) {
    this.controller = new PlaykitWebGLLightingController(opts.scene, {
      clusterManager: opts.clusterManager,
      lowTier: opts.lowTier,
      // Fixed small WebGL2 PointLight pool created once before warmShaders() (zero mid-race shader recompiles)
      activePointLights: opts.lowTier ? 2 : 4,
      maxLightDistanceM: opts.lowTier ? 140 : 240,
      palette: {
        skyColor: [0.46, 0.68, 0.96],
        canopyBounceColor: [0.22, 0.44, 0.26],
        groundColor: [0.26, 0.24, 0.21],
        interiorWarmColor: [0.76, 0.50, 0.22],
        sunColor: [1.0, 0.86, 0.64],
        sunDir: [-0.88, 0.39, -0.15],
      },
    });
    this.uniforms = this.controller.uniforms;
    // Balanced photographic bounce strength: lifts shaded architectural undersides & interiors
    // without flattening AgX contrast or overriding v4 CUDA-baked vertex AO / screen-space contact shadows.
    this.controller.setGiStrength(0.22);
  }

  /** Enhance any standard WebGL2 material (terrain, roads, bridges, props, cars) with Playkit SH9 GI bounce. */
  enhanceMaterial(mat: THREE.MeshStandardMaterial, giScale = 1.0): THREE.MeshStandardMaterial {
    return enhanceStandardMaterialWithPlaykitGi(mat, this.uniforms, { giScale });
  }

  /**
   * Populate Ironport & regional L2 SH9 GI probes, district LocalLookVolumes, and 24/7 tunnel lights
   * once `region.json` + heightfield (`hAt`) have finished loading.
   */
  populateRegion(meta: ApexLightingMeta, hAt: (x: number, z: number) => number): void {
    if (this.regionBuilt) return;
    this.regionBuilt = true;

    const gy = (x: number, z: number, lift = 6): number => Math.max(0, hAt(x, z)) + lift;

    // 1) Bake L2 SH9 Irradiance Probes across all Ironport districts & North Lands biomes
    const sites: WorldProbeSite[] = [
      // Downtown Ironport skyline canyons (proxy twin-facade canyon bounce)
      { x: 5513, y: gy(5513, 934, 8), z: 934, kind: 'urban' },
      { x: 5904, y: gy(5904, 852, 8), z: 852, kind: 'urban' },
      { x: 5180, y: gy(5180, 1280, 8), z: 1280, kind: 'urban' },
      { x: 4671, y: gy(4671, 2179, 8), z: 2179, kind: 'urban' },
      // North Harbor & Port Halcyon maritime waterfronts (cool aqua bounce from below)
      { x: 5900, y: gy(5900, -1100, 6), z: -1100, kind: 'water' },
      { x: 6180, y: gy(6180, -1557, 6), z: -1557, kind: 'industrial' },
      { x: -6216, y: gy(-6216, 3072, 6), z: 3072, kind: 'water' },
      { x: -3456, y: gy(-3456, -3096, 8), z: -3096, kind: 'water' },
      // Pinewood Rally Stage & Giant Forest (emerald canopy bounce)
      { x: -1596, y: gy(-1596, -1212, 6), z: -1212, kind: 'canopy' },
      { x: -5000, y: gy(-5000, -8300, 8), z: -8300, kind: 'canopy' },
      // Wine Country, Tulip Flats & Finger Lake
      { x: 3200, y: gy(3200, -6000, 6), z: -6000, kind: 'clearing', groundColor: [0.34, 0.30, 0.18] },
      { x: -300, y: gy(-300, -5900, 6), z: -5900, kind: 'clearing', groundColor: [0.32, 0.28, 0.20] },
      { x: 1450, y: gy(1450, -6900, 6), z: -6900, kind: 'water' },
      // Escarpment & Dry Canyons (warm ochre/sandstone bounce)
      { x: 2600, y: gy(2600, -9250, 8), z: -9250, kind: 'clearing', groundColor: [0.38, 0.28, 0.20] },
      { x: 1000, y: gy(1000, -11300, 8), z: -11300, kind: 'clearing', groundColor: [0.40, 0.29, 0.20] },
      // Alpine Superior Range, Glacier, Fjord Coast & North Shore (crisp snow/sky bounce)
      { x: -3300, y: gy(-3300, -12500, 10), z: -12500, kind: 'alpine' },
      { x: -4400, y: gy(-4400, -12100, 10), z: -12100, kind: 'alpine' },
      { x: -6700, y: gy(-6700, -11400, 8), z: -11400, kind: 'water' },
      { x: -2500, y: gy(-2500, -14100, 8), z: -14100, kind: 'alpine' },
    ];

    // 2) Per-District Local Look Volumes (same schema as Vesselbound's liveLighting.ts)
    const volumes: LocalLookVolume[] = [
      {
        id: 'downtown-ironport',
        name: 'Downtown Ironport',
        center: [5550, gy(5550, 1000, 20), 1000],
        radiusM: 920,
        featherM: 340,
        preset: 'urban-canyon',
      },
      {
        id: 'north-harbor',
        name: 'North Harbor',
        center: [5920, gy(5920, -1150, 10), -1150],
        radiusM: 760,
        featherM: 280,
        preset: 'harbor-maritime',
      },
      {
        id: 'ironworks-industrial',
        name: 'Ironworks District',
        center: [4550, gy(4550, -350, 10), -350],
        radiusM: 680,
        featherM: 260,
        preset: 'industrial-foundry',
      },
      {
        id: 'port-halcyon',
        name: 'Port Halcyon',
        center: [-6216, gy(-6216, 3072, 10), 3072],
        radiusM: 720,
        featherM: 280,
        preset: 'harbor-maritime',
      },
      {
        id: 'pinewood-rally',
        name: 'Pinewood Forest',
        center: [-1596, gy(-1596, -1212, 10), -1212],
        radiusM: 980,
        featherM: 360,
        preset: 'pinewood-canopy',
      },
      {
        id: 'giant-forest',
        name: 'The Giant Forest',
        center: [-5000, gy(-5000, -8300, 12), -8300],
        radiusM: 1200,
        featherM: 420,
        preset: 'pinewood-canopy',
      },
      {
        id: 'wine-country',
        name: 'Wine Country',
        center: [2200, gy(2200, -6100, 10), -6100],
        radiusM: 1650,
        featherM: 500,
        preset: 'wine-valley',
      },
      {
        id: 'superior-alpine',
        name: 'Superior Range & Glacier',
        center: [-3900, gy(-3900, -12300, 40), -12300],
        radiusM: 1800,
        featherM: 600,
        preset: 'alpine-glacier',
      },
    ];

    // 3) Great Lakes Cliff Raceway Tunnel: bake enclosed tunnel SH9 probes, look volume & 24/7 sodium lamps
    const cliff = meta.circuits?.great_lakes_cliff_raceway;
    const tunnelLights: WorldLightSpec[] = [];
    if (cliff?.tunnel && cliff.xz?.length) {
      const from = Math.max(0, cliff.tunnel.from);
      const to = Math.min(cliff.xz.length - 1, cliff.tunnel.to);
      if (to > from) {
        let midX = 0, midZ = 0, nPts = 0;
        let lastLx = 1e9, lastLz = 1e9;
        for (let i = from; i <= to; i++) {
          const pt = cliff.xz[i];
          if (!pt) continue;
          const x = pt[0], z = pt[1];
          midX += x; midZ += z; nPts++;
          if (Math.hypot(x - lastLx, z - lastLz) >= 34) {
            lastLx = x; lastLz = z;
            const y = hAt(x, z);
            tunnelLights.push({
              id: `tunnel_cliff_${i}`,
              x,
              y: y + 5.2,
              z,
              colorHex: 0xffaa42,
              intensity: 48,
              range: 36,
              nightOnly: false,
              tag: 'tunnel',
            });
            sites.push({ x, y: y + 2.5, z, kind: 'tunnel' });
          }
        }
        if (nPts > 0) {
          midX /= nPts; midZ /= nPts;
          const startPt = cliff.xz[from], endPt = cliff.xz[to];
          const spanR = Math.max(45, Math.hypot(endPt[0] - startPt[0], endPt[1] - startPt[1]) * 0.55);
          volumes.push({
            id: 'cliff-tunnel',
            name: 'Cliff Raceway Tunnel',
            center: [midX, hAt(midX, midZ) + 2, midZ],
            radiusM: spanR,
            featherM: 28,
            preset: 'road-tunnel',
          });
        }
      }
    }

    // 4) Campus Martius & Civic downtown plaza warm accent lights (glow at dusk/night)
    const plazaLights: WorldLightSpec[] = [
      { id: 'plaza_cm_n', x: 5513, y: gy(5513, 914, 9), z: 914, colorHex: 0xffd28c, intensity: 44, range: 42, nightOnly: true, tag: 'plaza' },
      { id: 'plaza_cm_s', x: 5513, y: gy(5513, 954, 9), z: 954, colorHex: 0xffd28c, intensity: 44, range: 42, nightOnly: true, tag: 'plaza' },
      { id: 'plaza_dt_e', x: 5904, y: gy(5904, 852, 9), z: 852, colorHex: 0xffe4b8, intensity: 40, range: 38, nightOnly: true, tag: 'plaza' },
      { id: 'plaza_civic', x: 4671, y: gy(4671, 2179, 9), z: 2179, colorHex: 0xffd99c, intensity: 42, range: 40, nightOnly: true, tag: 'plaza' },
    ];

    this.controller.bakeProbes(sites);
    this.controller.addLookVolumes(volumes);
    this.controller.addLights([...tunnelLights, ...plazaLights]);
  }

  /**
   * Register real streetlamp heads built by `buildStreetscape()` into `ClusteredLightManager`.
   * Spatially thins overly-dense clusters so lamps smoothly illuminate streets from dusk through night.
   */
  registerStreetLights(
    lamps: ReadonlyArray<number[]>,
    hAt: (x: number, z: number) => number,
    exag = 1,
  ): number {
    if (this.streetLightsRegistered) this.controller.clearStaticLights('street');
    this.streetLightsRegistered = true;

    const specs: WorldLightSpec[] = [];
    const cmx = 5513, cmz = 934;
    // Spatial 32 m cell dedup prevents overlapping lamps on parallel avenues from crowding the 256-light cluster window
    const seen = new Set<string>();
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      const fx = Math.sin(l[2]), fz = Math.cos(l[2]);
      const x = l[0] + fx * 2.1;
      const z = l[1] + fz * 2.1;
      const cell = `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
      if (seen.has(cell)) continue;
      seen.add(cell);
      const y = hAt(l[0], l[1]) * exag + 8.1;
      const isDowntown = Math.hypot(x - cmx, z - cmz) < 750;
      specs.push({
        id: `street_lamp_${i}`,
        x,
        y,
        z,
        // Warm modern LED downtown, classic sodium amber on outer arterials & neighborhoods
        colorHex: isDowntown ? 0xffe2b4 : 0xffbe68,
        intensity: isDowntown ? 42 : 34,
        range: isDowntown ? 38 : 34,
        nightOnly: true,
        tag: 'street',
      });
    }
    return this.controller.addLights(specs);
  }

  /** Register ship-to-shore crane & container terminal sodium floodlights from `harbor.json`. */
  registerHarborLights(harbor: ApexHarborLightSource, hAt: (x: number, z: number) => number): number {
    if (this.harborLightsRegistered) this.controller.clearStaticLights('harbor');
    this.harborLightsRegistered = true;

    const specs: WorldLightSpec[] = [];
    if (harbor.cranes) {
      harbor.cranes.forEach((cr, i) => {
        const [x, z] = cr.c;
        specs.push({
          id: `harbor_crane_${i}`,
          x,
          y: Math.max(0, hAt(x, z)) + 26,
          z,
          colorHex: 0xffd699,
          intensity: 68,
          range: 56,
          nightOnly: true,
          tag: 'harbor',
        });
      });
    }
    if (harbor.terminals) {
      harbor.terminals.forEach((tm, i) => {
        const [x, z] = tm.c;
        specs.push({
          id: `harbor_term_${i}`,
          x,
          y: Math.max(0, hAt(x, z)) + 16,
          z,
          colorHex: 0xffe8c8,
          intensity: 54,
          range: 48,
          nightOnly: true,
          tag: 'harbor',
        });
      });
    }
    return this.controller.addLights(specs);
  }

  /** Update player car dynamic headlight road-bounce & brake-light ground glow in the clustered pool. */
  updateVehicleLights(
    active: boolean,
    carPos?: THREE.Vector3,
    yaw = 0,
    headlightsOn = false,
    brakeAmt = 0,
  ): void {
    if (!active || !carPos) {
      this.controller.removeLight('player_headlight_bounce');
      this.controller.removeLight('player_brakelight_glow');
      return;
    }

    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (headlightsOn) {
      this.controller.upsertDynamicLight({
        id: 'player_headlight_bounce',
        x: carPos.x + fx * 11.5,
        y: carPos.y + 1.35,
        z: carPos.z + fz * 11.5,
        colorHex: 0xfff0d4,
        intensity: 42,
        range: 34,
        nightOnly: false,
        tag: 'vehicle',
      });
    } else {
      this.controller.removeLight('player_headlight_bounce');
    }

    if (brakeAmt > 0.15 && headlightsOn) {
      this.controller.upsertDynamicLight({
        id: 'player_brakelight_glow',
        x: carPos.x - fx * 3.1,
        y: carPos.y + 0.85,
        z: carPos.z - fz * 3.1,
        colorHex: 0xff2218,
        intensity: 14 * Math.min(1, brakeAmt),
        range: 14,
        nightOnly: false,
        tag: 'vehicle',
      });
    } else {
      this.controller.removeLight('player_brakelight_glow');
    }
  }

  /** Per-frame update: evaluates SH9 probes, LocalLookVolumes, clustered lights & fog mood. */
  update(
    dt: number,
    camera: THREE.Camera,
    focusPos: THREE.Vector3,
    nightFactor: number,
    weatherDim: number,
    sunDir: THREE.Vector3,
    mapMode: boolean,
  ): void {
    this.tmpFocus.copy(focusPos);
    this.controller.update(dt, camera, this.tmpFocus, nightFactor, weatherDim, sunDir, mapMode);
  }
}
