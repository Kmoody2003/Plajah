// playkit/render/threeBridge.ts
//
// Live `three/webgpu` + `three/tsl` Runtime Render Bridge for ALL Plajah Games & Studio Previews.
// Turns Phase 1–4 engine math into live WebGPU pixels (with automatic WebGL2 fallback on mobile):
//   - TSL Micro-Detail Normal/Roughness distance blending (no flat/blurry textures up close)
//   - TSL Skin & Foliage Subsurface Scattering (SSS) wrap + rim translucency
//   - L2 SH9 Irradiance Probe GI ambient injection (`IrradianceProbeVolume`)
//   - CAD/BIM IFC multi-material 3D builder (`IfcWall`, `IfcDoor`, `IfcWindow`, `IfcSlab`)
//   - Live `PlaykitLiveStage` hosting Studio Prefab Previews AND 3D Parlor Broadcast / Tavern Overhauls!

import * as THREE from 'three/webgpu';
import {
  abs, color, dot, float, fract, max, mix, mx_fractal_noise_float,
  normalWorld, positionView, positionWorld, pow, smoothstep, time, uniform, uv, vec3,
} from 'three/tsl';
import type { CadModel } from '../../services/cad/model';
import type { IndexedTriMesh } from '../../services/gamestudio/compiler/schema';
import type { AriaProductionResult } from '../../services/gamestudio/ariaAgent';
import { buildTreeGeometry as buildRealVegetationTreeGeometry } from '../../services/vegetation/trees/mesh';
import { ADVANCED_PBR_PRESETS, type AdvancedPbrMaterialConfig } from './pbrAdvanced';
import { IrradianceProbeVolume } from './probesGi';
import { ClusteredLightManager } from './clusteredLights';
import { DecalPool } from './decals';
import { STAGE_VISUAL_PRESETS } from './pipeline';

/** Convert a Phase 2/3 compiled IndexedTriMesh into a Three.js BufferGeometry. */
export function indexedMeshToThreeGeometry(mesh: IndexedTriMesh): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  if (mesh.normals && mesh.normals.length === mesh.positions.length) {
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
  }
  if (mesh.uvs && mesh.uvs.length > 0) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(mesh.uvs), 2));
  }
  if (mesh.colors && mesh.colors.length > 0) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(mesh.colors), 4));
  }
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  if (!mesh.normals) geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export interface PlaykitTslMaterialHandle {
  material: THREE.MeshStandardNodeMaterial;
  uProbeAmbient: { value: THREE.Color };
  uBeatPulse: { value: number };
}

/**
 * Build a live Three.js WebGPU/TSL MeshStandardNodeMaterial driven by Phase 4's
 * AdvancedPbrMaterialConfig (distance-blended micro-detail relief, SSS glow, weathering & SH9 GI).
 */
export function createPlaykitTslMaterial(
  cfg: AdvancedPbrMaterialConfig,
  opts?: { wireframe?: boolean; vertexColors?: boolean; doubleSide?: boolean },
): PlaykitTslMaterialHandle {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    wireframe: Boolean(opts?.wireframe),
    vertexColors: Boolean(opts?.vertexColors),
    side: opts?.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });

  const uProbeAmbient = uniform(new THREE.Color(0x1f2738));
  const uBeatPulse = uniform(0);
  const baseCol = color(cfg.baseColorHex);

  // 1) Distance-blended micro-detail procedural grain (keeps surfaces crisp up close without aliasing far away)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let detailMod: any = float(0.0);
  if (cfg.detailNormal?.enabled) {
    const camDist = positionView.length();
    const fade = float(1.0).sub(
      smoothstep(float(cfg.detailNormal.fadeStartM), float(cfg.detailNormal.fadeEndM), camDist),
    );
    const micro = mx_fractal_noise_float(positionWorld.mul(cfg.detailNormal.tiling), 2, 2.0, 0.5);
    detailMod = micro.mul(cfg.detailNormal.strength).mul(fade);
  }

  // 2) Weathering: subtle upward moss/dust + wetness roughness tightening
  const upMask = smoothstep(float(0.45), float(0.92), normalWorld.y);
  const grimeAmt = float(cfg.weathering?.creviceGrimeStrength ?? 0.0);
  const baseVec = baseCol.rgb;
  const weatheredColor = mix(baseVec, baseVec.mul(vec3(0.76, 0.84, 0.72)), upMask.mul(grimeAmt.mul(0.35)));
  mat.colorNode = weatheredColor.add(vec3(detailMod.mul(0.08)));

  const wetness = cfg.weathering?.wetness ?? 0;
  const effRough = Math.max(0.08, cfg.roughness * (1 - wetness * 0.45));
  mat.roughnessNode = float(effRough).sub(detailMod.mul(0.18)).clamp(0.06, 0.98);

  // 3) Baked SH9 Irradiance Probe ambient bounce + optional Skin/Foliage SSS wrap backlight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let emissive: any = uProbeAmbient.rgb.mul(baseVec).mul(0.35);
  if (cfg.subsurface?.enabled) {
    const viewDir = positionView.negate().normalize();
    const rim = pow(float(1.0).sub(max(float(0.0), dot(normalWorld, viewDir))), float(cfg.subsurface.translucencyPower));
    const sssCol = vec3(cfg.subsurface.scatterColor[0], cfg.subsurface.scatterColor[1], cfg.subsurface.scatterColor[2]);
    emissive = emissive.add(sssCol.mul(rim).mul(0.42));
  }
  if (cfg.anisotropicHair?.enabled) {
    const sheen = pow(float(1.0).sub(abs(normalWorld.y)), float(3.0));
    emissive = emissive.add(baseVec.mul(sheen).mul(0.28));
  }
  mat.emissiveNode = emissive;

  return { material: mat, uProbeAmbient, uBeatPulse };
}

/** Convert a Plajah CAD/BIM 3D model (`bimTo3D` output) into a multi-material Three.js Group. */
export function cadModelToThreeGroup(
  cad: CadModel,
  opts?: { wireframe?: boolean; cutawayInterior?: boolean },
): THREE.Group {
  const group = new THREE.Group();
  const wallMat = createPlaykitTslMaterial(ADVANCED_PBR_PRESETS['fable-masonry'], { wireframe: opts?.wireframe }).material;
  const floorMat = createPlaykitTslMaterial({
    ...ADVANCED_PBR_PRESETS['fable-masonry'],
    id: 'bim.slab',
    baseColorHex: 0x3b404c,
    roughness: 0.72,
  }, { wireframe: opts?.wireframe }).material;
  const doorMat = new THREE.MeshStandardNodeMaterial({
    color: 0x8b5e3c, roughness: 0.65, metalness: 0.15, wireframe: Boolean(opts?.wireframe),
  });
  const glassMat = new THREE.MeshStandardNodeMaterial({
    color: 0x7dd3fc, emissive: 0x0ea5e9, emissiveIntensity: 0.35,
    roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.42,
    wireframe: Boolean(opts?.wireframe),
  });

  const elemById = new Map(cad.elements.map((e) => [e.id, e]));

  for (const m of cad.meshes) {
    const el = m.elementId ? elemById.get(m.elementId) : undefined;
    const cls = el?.cls ?? m.layer ?? 'IfcWall';

    // Convert CAD Z-up to Three Y-up
    const vc = m.positions.length / 3;
    const yUpPos = new Float32Array(m.positions.length);
    for (let i = 0; i < vc; i++) {
      yUpPos[i * 3] = m.positions[i * 3];
      yUpPos[i * 3 + 1] = m.positions[i * 3 + 2];
      yUpPos[i * 3 + 2] = -m.positions[i * 3 + 1];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(yUpPos, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(m.indices), 1));
    geo.computeVertexNormals();

    const mat =
      cls === 'IfcDoor' ? doorMat :
      cls === 'IfcWindow' ? glassMat :
      cls === 'IfcSlab' ? floorMat : wallMat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = m.name;
    mesh.userData.ifcClass = cls;
    // Cutaway mode clips exterior upper walls cleanly so creators inspect interior rooms!
    if (opts?.cutawayInterior && cls === 'IfcWall') {
      mesh.scale.y = 0.48;
    }
    group.add(mesh);
  }

  // Center horizontally around origin for comfortable orbit inspection
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const c = box.getCenter(new THREE.Vector3());
    group.position.set(-c.x, -box.min.y, -c.z);
  }
  return group;
}

/** Build a live 3D Three.js Group from any `AriaStudioAgent.produce()` result (+ optional probe gizmos). */
export function ariaResultToThreeGroup(
  result: AriaProductionResult,
  opts?: { wireframe?: boolean; showProbes?: boolean; cutawayInterior?: boolean },
): THREE.Group {
  const root = new THREE.Group();

  if (result.bim3d && result.bim3d.meshes.length > 0) {
    const bimGroup = cadModelToThreeGroup(result.bim3d, opts);
    root.add(bimGroup);
  } else if (result.treeSkeleton && result.treeSpecies) {
    // Use Plajah's real space-colonization + braided-trunk vegetation builder (`services/vegetation/trees/mesh.ts`)!
    const treeGeo = buildRealVegetationTreeGeometry(result.treeSkeleton, result.treeSpecies);
    const barkMat = createPlaykitTslMaterial({
      ...ADVANCED_PBR_PRESETS['fable-masonry'],
      id: 'veg.bark',
      baseColorHex: result.treeSpecies.bark.tint,
      roughness: 0.9,
      metalness: 0.04,
    }, { wireframe: opts?.wireframe }).material;
    const leafMat = createPlaykitTslMaterial({
      ...ADVANCED_PBR_PRESETS['foliage-canopy'],
      id: 'veg.leaves',
      baseColorHex: result.treeSpecies.leaves.tint,
    }, { wireframe: opts?.wireframe, doubleSide: true }).material;
    const woodMesh = new THREE.Mesh(treeGeo.wood, barkMat);
    const leafMesh = new THREE.Mesh(treeGeo.leaves, leafMat);
    const treeGrp = new THREE.Group();
    treeGrp.add(woodMesh, leafMesh);
    root.add(treeGrp);
  } else if (result.previewMesh) {
    const geo = indexedMeshToThreeGeometry(result.previewMesh);
    const preset: AdvancedPbrMaterialConfig =
      result.pipeline === 'organic' ? ADVANCED_PBR_PRESETS['hero-skin'] :
      result.pipeline === 'vegetation' ? ADVANCED_PBR_PRESETS['foliage-canopy'] :
      result.pipeline === 'hard-surface'
        ? { id: 'hs.metal', baseColorHex: 0x64748b, roughness: 0.3, metalness: 0.85, detailNormal: { enabled: true, tiling: 20, strength: 0.4, fadeStartM: 2, fadeEndM: 14 } }
        : ADVANCED_PBR_PRESETS['fable-masonry'];

    const matHandle = createPlaykitTslMaterial(preset, {
      wireframe: opts?.wireframe,
      doubleSide: result.pipeline === 'vegetation',
    });

    if (result.probes.length > 0) {
      const vol = new IrradianceProbeVolume(result.probes);
      const irr = vol.sampleIrradiance([0, 1.5, 0], [0, 1, 0]);
      matHandle.uProbeAmbient.value.setRGB(irr[0], irr[1], irr[2]);
    }

    const mesh = new THREE.Mesh(geo, matHandle.material);
    const box = new THREE.Box3().setFromObject(mesh);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      mesh.position.set(-c.x, -box.min.y, -c.z);
    }
    root.add(mesh);
  } else {
    // 2D Sprite card preview
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.8),
      new THREE.MeshStandardNodeMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.5, side: THREE.DoubleSide }),
    );
    card.position.y = 0.9;
    root.add(card);
  }

  // Optional SH9 GI Probe & Parallax Reflection Box debug gizmos
  if (opts?.showProbes) {
    const probeMat = new THREE.MeshBasicNodeMaterial({ color: 0xfbbf24 });
    const boxMat = new THREE.MeshBasicNodeMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.4 });
    const offset = root.children[0]?.position ?? new THREE.Vector3();

    for (const p of result.probes) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), probeMat);
      sphere.position.set(p.position[0] + offset.x, p.position[1] + offset.y, p.position[2] + offset.z);
      root.add(sphere);
    }
    for (const rb of result.reflectionBoxes) {
      const sx = rb.boxMax[0] - rb.boxMin[0];
      const sy = rb.boxMax[1] - rb.boxMin[1];
      const sz = rb.boxMax[2] - rb.boxMin[2];
      const wire = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), boxMat);
      wire.position.set(rb.center[0] + offset.x, rb.center[1] + offset.y, rb.center[2] + offset.z);
      root.add(wire);
    }
  }

  return root;
}

/**
 * Self-contained Cross-Platform WebGPU / WebGL2 Live Stage.
 * Powers BOTH the Game Studio Aria 3D Inspector AND the 3D Parlor Broadcast / Fable Tavern Stage!
 */
export class PlaykitLiveStage {
  private renderer!: THREE.WebGPURenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 220);
  private contentRoot = new THREE.Group();
  private stageRoot = new THREE.Group();
  private lights = new ClusteredLightManager();
  private decals = new DecalPool('medium');
  private spotLights: THREE.PointLight[] = [];

  private rafId = 0;
  private disposed = false;
  private orbitYaw = 0.65;
  private orbitPitch = 0.34;
  private orbitDist = 14;
  private targetY = 2.0;
  private autoRotate = true;
  private dragging = false;
  private lastPtrX = 0;
  private lastPtrY = 0;
  private parlorTension = 0.25;
  private uPulse = uniform(0);
  private resizeObs: ResizeObserver | null = null;

  constructor(private container: HTMLElement) {
    this.scene.add(this.stageRoot, this.contentRoot);
  }

  async init(presetId: keyof typeof STAGE_VISUAL_PRESETS = 'fable-void-sanctum'): Promise<'webgpu' | 'webgl'> {
    let backend: 'webgpu' | 'webgl' = 'webgpu';
    try {
      this.renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
      await this.renderer.init();
    } catch {
      backend = 'webgl';
      this.renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: true });
      await this.renderer.init();
    }

    if (this.disposed) {
      this.renderer.dispose();
      return backend;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.container.appendChild(this.renderer.domElement);
    this.resize();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.container);
    this.bindOrbit();

    this.applyStagePreset(presetId);
    this.buildStudioFloor();

    let last = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt, now * 0.001);
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
    return backend;
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private bindOrbit(): void {
    const dom = this.renderer.domElement;
    dom.style.width = '100%';
    dom.style.height = '100%';
    dom.style.display = 'block';
    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.autoRotate = false;
      this.lastPtrX = e.clientX;
      this.lastPtrY = e.clientY;
    });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.orbitYaw -= (e.clientX - this.lastPtrX) * 0.008;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + (e.clientY - this.lastPtrY) * 0.006, 0.08, 1.35);
      this.lastPtrX = e.clientX;
      this.lastPtrY = e.clientY;
    });
    dom.addEventListener('wheel', (e) => {
      this.orbitDist = THREE.MathUtils.clamp(this.orbitDist + e.deltaY * 0.012, 2.5, 42);
    }, { passive: true });
  }

  applyStagePreset(presetId: keyof typeof STAGE_VISUAL_PRESETS): void {
    const preset = STAGE_VISUAL_PRESETS[presetId] ?? STAGE_VISUAL_PRESETS['fable-void-sanctum'];
    this.scene.background = new THREE.Color(preset.fogTintHex);
    this.scene.fog = new THREE.FogExp2(preset.fogTintHex, 0.022);

    this.stageRoot.clear();
    this.spotLights = [];

    const hemi = new THREE.HemisphereLight(preset.sunTintHex, preset.fogTintHex, 0.95);
    const key = new THREE.DirectionalLight(preset.sunTintHex, 1.8);
    key.position.set(12, 22, 10);
    const rim = new THREE.PointLight(preset.rimAccentHex, 5.5, 36);
    rim.position.set(-10, 7, -10);
    const fill = new THREE.PointLight(preset.sunTintHex, 3.5, 30);
    fill.position.set(10, 5, 8);
    this.spotLights.push(rim, fill);
    this.stageRoot.add(hemi, key, rim, fill);

    this.lights.clear();
    this.lights.upsert({ id: 'rim', kind: 'point', position: [-10, 7, -10], color: [0.4, 0.7, 1], intensity: 5.5, range: 36 });
    this.lights.upsert({ id: 'fill', kind: 'point', position: [10, 5, 8], color: [1, 0.85, 0.65], intensity: 3.5, range: 30 });
  }

  private buildStudioFloor(): void {
    const floorMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.35 });
    const gUv = uv().mul(22.0);
    const cell = abs(fract(gUv.sub(0.5)).sub(0.5));
    const line = smoothstep(float(0.03), float(0.0), cell.x).max(smoothstep(float(0.03), float(0.0), cell.y));
    const radial = uv().sub(0.5).length().mul(2.0);
    const pulseRing = smoothstep(float(0.03), float(0.0), abs(fract(radial.mul(3.0).sub(time.mul(0.12))).sub(0.5)));

    floorMat.colorNode = mix(color(0x0c101b), color(0x161d2e), line);
    floorMat.emissiveNode = color(0x38bdf8).mul(line.mul(0.22).add(pulseRing.mul(0.45))).mul(float(0.6).add(this.uPulse));

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(20, 19, 0.4, 32), floorMat);
    disc.position.y = -0.2;
    this.stageRoot.add(disc);
  }

  /** Display any compiled `AriaProductionResult` and auto-frame the camera to its bounds. */
  showAriaResult(
    result: AriaProductionResult,
    opts?: { wireframe?: boolean; showProbes?: boolean; cutawayInterior?: boolean },
  ): void {
    this.contentRoot.clear();
    const grp = ariaResultToThreeGroup(result, opts);
    this.contentRoot.add(grp);

    const box = new THREE.Box3().setFromObject(grp);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 2);
      this.targetY = size.y * 0.46;
      this.orbitDist = Math.max(3.5, maxDim * 1.45);
    }
    this.autoRotate = true;
  }

  /** Load an animated 3D Parlor Game-Show or Candlelit Fable Tavern venue behind PartyPlay. */
  loadParlorVenue(kind: 'broadcast' | 'tavern', tension = 0.25): void {
    this.parlorTension = tension;
    this.applyStagePreset(kind === 'tavern' ? 'parlor-fable-tavern-3d' : 'parlor-broadcast-studio-3d');
    this.buildStudioFloor();
    this.contentRoot.clear();

    const accent = kind === 'tavern' ? 0xf59e0b : 0x38bdf8;
    const secondary = kind === 'tavern' ? 0xf97316 : 0xe879f9;

    const ringMat = new THREE.MeshStandardNodeMaterial({
      color: accent, emissive: accent, emissiveIntensity: 1.4, metalness: 0.85, roughness: 0.2,
    });
    const pillarMat = createPlaykitTslMaterial(ADVANCED_PBR_PRESETS['fable-masonry']).material;

    // Central raised host stage + glowing overhead halo rings + 6 perimeter arches/pillars
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.8, 0.6, 24), pillarMat);
    stage.position.y = 0.3;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.14, 12, 48), ringMat);
    halo.position.y = 6.2;
    halo.rotation.x = Math.PI * 0.5;
    this.contentRoot.add(stage, halo);

    const podMat = new THREE.MeshStandardNodeMaterial({
      color: 0x161b2e, emissive: secondary, emissiveIntensity: 0.45, metalness: 0.7, roughness: 0.3,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.5, 0.9), pillarMat);
      pillar.position.set(Math.cos(a) * 10.5, 3.25, Math.sin(a) * 10.5);
      const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.2, 8), podMat);
      podium.position.set(Math.cos(a) * 3.8, 1.2, Math.sin(a) * 3.8);
      this.contentRoot.add(pillar, podium);
    }

    this.targetY = 2.6;
    this.orbitDist = 15.5;
    this.orbitPitch = 0.28;
    this.autoRotate = true;
  }

  setParlorTension(tension01: number): void {
    this.parlorTension = Math.max(0, Math.min(1, tension01));
  }

  private update(dt: number, elapsedSec: number): void {
    this.decals.update(dt);
    const pulse = 0.5 + 0.5 * Math.sin(elapsedSec * (2.2 + this.parlorTension * 5.0));
    this.uPulse.value = pulse * (0.35 + this.parlorTension * 0.65);

    if (this.autoRotate) {
      this.orbitYaw += dt * (0.22 + this.parlorTension * 0.25);
    }

    // Sweep dynamic rim/fill stage lights
    if (this.spotLights[0]) {
      this.spotLights[0].position.x = Math.cos(elapsedSec * 0.7) * 11;
      this.spotLights[0].position.z = Math.sin(elapsedSec * 0.7) * 11;
      this.spotLights[0].intensity = 4.5 + pulse * 3.5;
    }

    const r = this.orbitDist * Math.cos(this.orbitPitch);
    this.camera.position.set(
      Math.sin(this.orbitYaw) * r,
      this.targetY + Math.sin(this.orbitPitch) * this.orbitDist,
      Math.cos(this.orbitYaw) * r,
    );
    this.camera.lookAt(0, this.targetY, 0);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObs?.disconnect();
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer?.dispose();
  }
}
