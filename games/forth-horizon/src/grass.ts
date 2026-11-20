// Current-gen (Series S/X) continuous curved 3D blade-strand grass system.
// Uses Plajah's shared Strand/Fur engine (services/realtimeSim/strandFurEngine.ts):
// - Real 3D tapered, Bezier-arched blade clusters (zero flat crossed X-cards, zero patchy weeds)
// - Dual-ring continuous carpet (~200,000 individual curved 3D blades in 2 draw calls)
// - Kajiya-Kay anisotropic blade sheen + golden sunlit subsurface translucency (SSS) + deep soil-blended root AO
// - Travelling multi-octave wind gust waves + live 4-point vehicle tire-trample & aerodynamic wake bending
import * as THREE from 'three';
import { GRID } from './grid';
import { buildCurvedBladeClusterGeo, STRAND_WIND_TRAMPLE_GLSL } from '../../../services/realtimeSim/strandFurEngine';

const R_NEAR = 34;       // dense hero carpet around the car (m)
const CELL_NEAR = 0.44;  // continuous lush blade spacing (no sparse weed patches)
const R_MID = 96;        // mid-distance meadow reach (m)
const CELL_MID = 1.08;   // wider scaled clusters blending smoothly into PBR terrain

export interface GrassOpts {
  rw: number; rh: number;                                     // region size in metres (centred on the origin)
  albedoUrl: string;
  ground: (x: number, z: number) => number;                   // world height of the terrain mesh
  ok: (x: number, z: number) => boolean;                      // may grass grow here (not road, not water, not near the course)
}

export class GrassField {
  readonly group = new THREE.Group();
  private nearIm: THREE.InstancedMesh;
  private midIm: THREE.InstancedMesh;
  private albedo: { d: Uint8ClampedArray; w: number; h: number } | null = null;
  private uTime = { value: 0 };
  private uWind = { value: 0.35 };
  private uWet = { value: 0 };
  private uTrails = {
    value: [
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
      new THREE.Vector4(0, 0, 0, 0),
    ],
  };
  private uCarVel = { value: new THREE.Vector3() };
  private trailIdx = 0;
  private lastTrailPos = new THREE.Vector3(1e9, 0, 1e9);

  private nearCap = 16500;
  private midCap = 17500;
  private effNearR = R_NEAR;
  private effMidR = R_MID;
  private effNearCap = 16500;
  private effMidCap = 17500;
  private last = new THREE.Vector2(1e9, 1e9);
  private accT = 0;
  private mat: THREE.MeshStandardMaterial;

  // Reusable scratch objects (zero per-rebuild GC allocation spikes)
  private _m4 = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);
  private _pos = new THREE.Vector3();
  private _sc = new THREE.Vector3();
  private _col = new THREE.Color();
  private _sr = 0;
  private _sg = 0;
  private _sb = 0;
  count = 0;

  constructor(private o: GrassOpts) {
    // High-density 6-blade curved 3D cluster for near hero carpet, lighter 4-blade cluster for mid field
    const nearGeo = buildCurvedBladeClusterGeo(6, 4);
    const midGeo = buildCurvedBladeClusterGeo(4, 2);

    this.mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.68,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uWind = this.uWind;
      sh.uniforms.uWet = this.uWet;
      sh.uniforms.uTrails = this.uTrails;
      sh.uniforms.uCarVel = this.uCarVel;

      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aBlade;
          varying float vGrassH;
          varying float vBladePhase;
          varying vec3 vGrassWorld;
          ${STRAND_WIND_TRAMPLE_GLSL}`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vGrassH = aBlade.x;
          vBladePhase = aBlade.y;
          #ifdef USE_INSTANCING
            vec3 wRoot = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
            transformed = strandDisplace(transformed, wRoot, aBlade.x, aBlade.y, aBlade.w);
            vGrassWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          #else
            vGrassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #endif`
        );

      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uWet;
          varying float vGrassH;
          varying float vBladePhase;
          varying vec3 vGrassWorld;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Rich vertical chlorophyll gradient: deep shaded soil-matched roots -> lush mid-blade -> warm sunlit straw tips
          float h = clamp(vGrassH, 0.0, 1.0);
          float dryTint = smoothstep(0.68, 0.98, vBladePhase);
          vec3 rootTone = diffuseColor.rgb * vec3(0.30, 0.34, 0.24);
          vec3 midTone  = diffuseColor.rgb * mix(vec3(0.92, 1.14, 0.72), vec3(1.18, 1.06, 0.62), dryTint * 0.65);
          vec3 tipTone  = diffuseColor.rgb * mix(vec3(1.26, 1.38, 0.86), vec3(1.42, 1.24, 0.76), dryTint);
          vec3 grad = mix(rootTone, midTone, smoothstep(0.0, 0.45, h));
          diffuseColor.rgb = mix(grad, tipTone, smoothstep(0.45, 1.0, h));
          // Macro sunlit cloud/meadow dapple variation so fields never look uniform
          float dapple = 0.88 + 0.24 * sin(vGrassWorld.x * 0.055 + sin(vGrassWorld.z * 0.042) * 2.1);
          diffuseColor.rgb *= dapple * (1.0 - 0.26 * uWet);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          // Waxy blade cuticle sheen (tighter near tip, glossy dew when wet)
          roughnessFactor = mix(0.84, 0.42, vGrassH) * (1.0 - 0.45 * uWet);`
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          // Deep root-to-tip self-shadowing AO + Kajiya-Kay hair/blade anisotropic sheen + warm backlit SSS translucency
          float rootAO = 0.36 + 0.64 * smoothstep(0.0, 0.68, vGrassH);
          reflectedLight.indirectDiffuse *= rootAO;
          reflectedLight.directDiffuse *= (0.48 + 0.52 * smoothstep(0.0, 0.55, vGrassH));
          #if NUM_DIR_LIGHTS > 0
          {
            vec3 Vd = normalize(vViewPosition);
            vec3 Ld = directionalLights[0].direction;
            vec3 Hd = normalize(Ld + Vd);
            // Warm golden-green subsurface translucency when sunlight shines through grass tips
            float backRaw = clamp(dot(Vd, -Ld), 0.0, 1.0);
            float back = backRaw * backRaw * backRaw;
            vec3 sssCol = diffuseColor.rgb * vec3(1.35, 1.22, 0.64);
            reflectedLight.directDiffuse += sssCol * directionalLights[0].color * (0.14 + 0.62 * back) * vGrassH * vGrassH;
            // Kajiya-Kay anisotropic blade cuticle glint along vertical strand direction
            vec3 T = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            float tdh = clamp(dot(T, Hd), -1.0, 1.0);
            float sinTH = sqrt(max(0.0001, 1.0 - tdh * tdh));
            float sheen = sinTH * sinTH;
            sheen = sheen * sheen * sheen * sheen; // sinTH^8 crisp silky highlight (zero pow(0) NaN risk)
            reflectedLight.directSpecular += directionalLights[0].color * sheen * (0.18 + 0.32 * uWet) * vGrassH;
          }
          #endif`
        );
    };
    this.mat.customProgramCacheKey = () => 'grass-strand-v3';

    this.nearIm = new THREE.InstancedMesh(nearGeo, this.mat, this.nearCap);
    this.midIm = new THREE.InstancedMesh(midGeo, this.mat, this.midCap);
    for (const im of [this.nearIm, this.midIm]) {
      im.count = 0;
      im.frustumCulled = false;
      im.receiveShadow = true;
      im.castShadow = false;
      this.group.add(im);
    }

    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0);
      this.albedo = { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      this.last.set(1e9, 1e9);
    };
    img.src = o.albedoUrl;
  }

  setWind(w: number): void { this.uWind.value = w; }
  setWet(w: number): void { this.uWet.value = w; }

  /** Feed live vehicle position & velocity so nearby blades physically part & flatten under tires + aero wake! */
  setCarWake(pos: THREE.Vector3 | null, vel?: THREE.Vector3 | null): void {
    const trails = this.uTrails.value;
    if (!pos) {
      for (let i = 0; i < 4; i++) trails[i].w = 0;
      this.uCarVel.value.set(0, 0, 0);
      return;
    }
    if (vel) this.uCarVel.value.copy(vel);
    const spd = vel ? Math.hypot(vel.x, vel.z) : 0;
    // Slot 0 tracks live car chassis footprint immediately; slots 1..3 hold rolling tire/wake trail
    trails[0].set(pos.x, pos.y, pos.z, 2.3 + Math.min(2.2, spd * 0.045));
    if (this.lastTrailPos.distanceToSquared(pos) > 2.4 * 2.4) {
      this.lastTrailPos.copy(pos);
      this.trailIdx = 1 + (this.trailIdx % 3);
      trails[this.trailIdx].set(pos.x, pos.y, pos.z, 1.9 + Math.min(1.6, spd * 0.03));
    }
  }

  setQuality(scale: number): void {
    const s = Math.max(0.5, Math.min(1, scale));
    const nNearR = R_NEAR * (0.68 + 0.32 * s);
    const nMidR = R_MID * (0.65 + 0.35 * s);
    const nNearCap = Math.floor(this.nearCap * (0.50 + 0.50 * s));
    const nMidCap = Math.floor(this.midCap * (0.45 + 0.55 * s));
    if (Math.abs(nNearR - this.effNearR) > 2 || Math.abs(nMidR - this.effMidR) > 3) {
      this.effNearR = nNearR;
      this.effMidR = nMidR;
      this.effNearCap = nNearCap;
      this.effMidCap = nMidCap;
      this.last.set(1e9, 1e9);
    }
  }

  private sample(x: number, z: number): boolean {
    const a = this.albedo!;
    const u = (x - GRID.ox + this.o.rw / 2) / this.o.rw, v = (z - GRID.oz + this.o.rh / 2) / this.o.rh;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
    const i = (Math.floor(v * a.h) * a.w + Math.floor(u * a.w)) * 4;
    this._sr = a.d[i] / 255; this._sg = a.d[i + 1] / 255; this._sb = a.d[i + 2] / 255;
    return true;
  }

  private fillRing(
    im: THREE.InstancedMesh,
    cam: THREE.Vector3,
    minR: number,
    maxR: number,
    cell: number,
    maxCap: number,
    scaleMult: number
  ): number {
    const minR2 = minR * minR;
    const maxR2 = maxR * maxR;
    const m4 = this._m4, q = this._q, up = this._up, pos = this._pos, sc = this._sc, col = this._col;
    const i0 = Math.floor((cam.x - maxR) / cell), i1 = Math.floor((cam.x + maxR) / cell);
    const j0 = Math.floor((cam.z - maxR) / cell), j1 = Math.floor((cam.z + maxR) / cell);
    const hash = (a: number, b: number, s: number): number => {
      const t = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
      return t - Math.floor(t);
    };

    let n = 0;
    for (let i = i0; i <= i1 && n < maxCap; i++) {
      for (let j = j0; j <= j1 && n < maxCap; j++) {
        const x = (i + hash(i, j, 1)) * cell;
        const z = (j + hash(i, j, 2)) * cell;
        const dx = x - cam.x, dz = z - cam.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > maxR2 || d2 < minR2) continue;
        const d = Math.sqrt(d2);
        // Smooth radial dissolve at outer edge + seamless overlap between Near & Mid rings
        const outerFade = 1 - Math.min(1, Math.max(0, (d - maxR * 0.68) / (maxR * 0.32)));
        if (outerFade <= 0.03) continue;
        if (minR > 0 && hash(i, j, 3) > 0.35 + 0.65 * outerFade) continue;
        if (!this.sample(x, z)) continue;

        const r0 = this._sr, g0 = this._sg, b0 = this._sb;
        const green = g0 - Math.max(r0, b0);
        const lum = r0 * 0.3 + g0 * 0.59 + b0 * 0.11;
        // Continuous coverage across lawns, meadows, parks, verges & golden dry grass fields
        if (!(green > 0.008 || (r0 > b0 * 1.14 && g0 > b0 * 1.06 && lum > 0.18 && lum < 0.66)) || lum < 0.10 || lum > 0.74) continue;
        if (!this.o.ok(x, z)) continue;

        // Low-frequency meadow height patches (rolling natural turf variation, never uniform buzzcut or weed clumps)
        const patch = 0.5 + 0.5 * Math.sin(x * 0.08 + Math.sin(z * 0.06) * 2.0);
        const baseH = (0.24 + hash(i, j, 4) * 0.22 + patch * 0.22 + Math.max(0, green) * 0.52);
        const h = Math.min(0.68, baseH) * outerFade;
        const w = (0.95 + hash(i, j, 5) * 0.55) * scaleMult * (0.75 + 0.25 * outerFade);

        q.setFromAxisAngle(up, hash(i, j, 6) * 6.28318);
        pos.set(x, this.o.ground(x, z) - 0.025, z);
        sc.set(w, h, w);
        m4.compose(pos, q, sc);
        im.setMatrixAt(n, m4);

        // Rich natural turf chroma lifted cleanly from ground albedo
        const tone = 0.74 + hash(i, j, 7) * 0.34;
        col.setRGB(
          Math.min(1, r0 * 1.06 + 0.045) * tone,
          Math.min(1, g0 * 1.18 + 0.075) * tone,
          Math.min(1, b0 * 0.92 + 0.025) * tone
        );
        im.setColorAt(n, col);
        n++;
      }
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    return n;
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.uTime.value += dt;
    // Gently decay rolling car wake trail radii so flattened grass springs back naturally over ~2.5s
    const trails = this.uTrails.value;
    for (let i = 1; i < 4; i++) {
      if (trails[i].w > 0) trails[i].w = Math.max(0, trails[i].w - dt * 0.85);
    }
    this.accT += dt;
    if (!this.albedo || this.accT < 0.16 || Math.hypot(cam.x - this.last.x, cam.z - this.last.y) < 3.8) return;
    this.accT = 0;
    this.last.set(cam.x, cam.z);
    const nNear = this.fillRing(this.nearIm, cam, 0, this.effNearR, CELL_NEAR, this.effNearCap, 1.0);
    const nMid = this.fillRing(this.midIm, cam, this.effNearR * 0.72, this.effMidR, CELL_MID, this.effMidCap, 1.85);
    this.count = nNear + nMid;
  }
}
