/**
 * stage.ts — the finished creature, alive: skinned mesh, live muscle, shell fur, and reactions to you.
 *
 * WebGL2 on purpose: a skinned creature in a viewer needs to run wherever three's WebGL path does, and the shell
 * count is the one dial that decides cost on an iGPU. Muscle bulge is one float per vertex written from the CPU,
 * so the fur layers don't each pay for morph fetches.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { JOINTS, JointName, parentOf } from './anatomy';
import type { MotionStyle, SurfaceBrief } from './codex';
import type { CreatureModel } from './finish';
import { ClipName, CreatureMotion } from './motion';

export interface StageStats { frameMs: number; cpuMs: number; shells: number; triangles: number; drawCalls: number }

const STRAND_SIZE = 256;

/** Strand heights: tiny cones on a jittered grid, tiled over the atlas. */
function strandTexture() {
  const data = new Uint8Array(STRAND_SIZE * STRAND_SIZE);
  const cells = 64;
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jitter = Array.from({ length: cells * cells }, () => [rand(), rand(), 0.55 + rand() * 0.45] as const);
  const span = STRAND_SIZE / cells;
  for (let y = 0; y < STRAND_SIZE; y++) for (let x = 0; x < STRAND_SIZE; x++) {
    const gx = x / span, gy = y / span;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    let best = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const ix = (cx + ox + cells) % cells, iy = (cy + oy + cells) % cells;
      const [jx, jy, tall] = jitter[ix + iy * cells];
      const d = Math.hypot(cx + ox + jx - gx, cy + oy + jy - gy);
      best = Math.max(best, tall * Math.max(0, 1 - d / 0.62));
    }
    data[x + y * STRAND_SIZE] = best * 255;
  }
  const tex = new THREE.DataTexture(data, STRAND_SIZE, STRAND_SIZE, THREE.RedFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // No mips: averaging strands away would melt the upper layers into blotches at a distance.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export class CreatureStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
  readonly controls: OrbitControls;
  readonly root = new THREE.Group();
  motion: CreatureMotion | null = null;
  clip: ClipName = 'idle';
  /** Fur layers. Set before show(). */
  shells = 18;
  reactive = true;
  onStats?: (stats: StageStats) => void;
  /** Exposed so a lab can read what the muscles are doing. */
  muscleLevels = new Float32Array(0);

  private model: CreatureModel | null = null;
  private bones = new Map<JointName, THREE.Bone>();
  private meshes: THREE.SkinnedMesh[] = [];
  private geometry: THREE.BufferGeometry | null = null;
  private bulge: Float32Array | null = null;
  private bulgeAttr: THREE.BufferAttribute | null = null;
  private texture: THREE.DataTexture | null = null;
  private normalMap: THREE.DataTexture | null = null;
  private strands = strandTexture();
  private uniforms = {
    uGust: { value: new THREE.Vector3() },
    uBristle: { value: 0 },
    uReach: { value: 1 },
    uStrands: { value: this.strands as THREE.Texture },
    uStrandScale: { value: 24 },
  };
  private raf = 0;
  private clock = 0;
  private last = 0;
  private time = 0;
  private frameAvg = 16;
  private cpuAvg = 0;
  private statsAt = 0;
  private pointer = new THREE.Vector2(0, 0);
  private pointerActive = 0;
  private pointerSpeed = 0;
  private lookAt = new THREE.Vector3(0, 0.5, 3);
  private arousal = 0;
  private recoil = new THREE.Vector3();
  private recoilVel = new THREE.Vector3();
  private muscleSpring = new Float32Array(0);
  private muscleVel = new Float32Array(0);
  private gust = new THREE.Vector3();
  private gustVel = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private observer: ResizeObserver;
  private floor: THREE.Mesh | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#0d0c11');
    this.camera.position.set(1.4, 0.35, 4.1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, -0.05, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 9;

    const hemi = new THREE.HemisphereLight('#dfe4f2', '#4a4038', 1.05);
    const key = new THREE.DirectionalLight('#fff0dc', 3.1);
    key.position.set(1.6, 2.6, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
    key.shadow.camera.right = key.shadow.camera.top = 1.5;
    key.shadow.camera.far = 9;
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight('#9fb4ff', 2.2);
    rim.position.set(-2.4, 2.4, -2.8);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: '#17151b', roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.92;
    this.floor = floor;
    floor.receiveShadow = true;
    this.scene.add(hemi, key, rim, floor, this.root);

    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  private onMove = (ev: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 2 - 1, y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
    this.pointerSpeed = Math.min(6, this.pointerSpeed + Math.hypot(x - this.pointer.x, y - this.pointer.y) * 4);
    this.pointer.set(x, y);
    this.pointerActive = 1;
  };

  /** A poke: shoves it away from the camera, startles it, and ripples through the coat. */
  private onDown = (ev: PointerEvent) => {
    if (!this.reactive || !this.meshes.length || !this.motion) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    // Against the joints, not the skin: raycasting a skinned mesh of this size stalls the page.
    let closest = 0.14;
    let hit: THREE.Vector3 | null = null;
    for (const name of JOINTS) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      const at = bone.getWorldPosition(new THREE.Vector3());
      const d = this.raycaster.ray.distanceToPoint(at);
      if (d < closest) { closest = d; hit = at; }
    }
    if (!hit) return;
    const push = this.raycaster.ray.direction.clone().setY(0).normalize().multiplyScalar(0.55);
    this.poke(push);
  };

  poke(push: THREE.Vector3) {
    this.recoilVel.add(push);
    this.gustVel.addScaledVector(push, 4);
    this.arousal = Math.min(1, this.arousal + 0.65);
  }

  private buildMaterial(surface: SurfaceBrief, layer: number, count: number) {
    const shell = layer / Math.max(1, count);
    const material = new THREE.MeshStandardMaterial({
      map: this.texture, normalMap: this.normalMap, roughness: surface.roughness, metalness: 0,
      side: THREE.FrontSide,
    });
    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uShell = { value: shell };
      shader.uniforms.uGust = u.uGust;
      shader.uniforms.uBristle = u.uBristle;
      shader.uniforms.uStrands = u.uStrands;
      shader.uniforms.uStrandScale = u.uStrandScale;
      shader.vertexShader = `attribute float aBulge; attribute float aFur; attribute vec3 aFurDir;
        uniform float uShell; uniform vec3 uGust; uniform float uBristle; varying float vFur; varying vec2 vStrandUv;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 shellDir = normalize(objectNormal * (1.0 + uBristle) + aFurDir * uShell * 1.2);
          float shellLen = aFur * (1.0 + uBristle * 0.35);
          vec3 bend = (aFurDir * 0.25 + uGust * 0.5 + vec3(0.0, -0.3, 0.0)) * uShell * uShell;
          transformed += objectNormal * aBulge + (shellDir + bend) * shellLen * uShell;
          vFur = aFur; vStrandUv = uv;`);
      if (layer > 0) {
        shader.fragmentShader = `uniform sampler2D uStrands; uniform float uStrandScale; uniform float uShell; varying float vFur; varying vec2 vStrandUv;\n${shader.fragmentShader}`
          .replace('#include <map_fragment>', `#include <map_fragment>
            if (vFur < 0.0015) discard;
            float strand = texture2D(uStrands, vStrandUv * uStrandScale).r;
            if (strand < uShell * 0.95 + 0.06) discard;
            // Light is trapped at the roots of a coat and catches at the tips.
            diffuseColor.rgb *= mix(0.38, 1.05, uShell);`);
      }
    };
    material.customProgramCacheKey = () => `argilla-creature-${layer > 0 ? 'shell' : 'skin'}`;
    return material;
  }

  show(model: CreatureModel, style: MotionStyle, surface: SurfaceBrief) {
    this.clear();
    this.model = model;
    const anatomy = model.anatomy;
    this.motion = new CreatureMotion(anatomy, style);
    if (this.floor) this.floor.position.y = anatomy.floor;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(model.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(model.uvs, 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(model.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(model.skinWeight, 4));
    geo.setAttribute('aFur', new THREE.BufferAttribute(model.furLength, 1));
    geo.setAttribute('aFurDir', new THREE.BufferAttribute(model.furDir, 3));
    this.bulge = new Float32Array(model.positions.length / 3);
    this.bulgeAttr = new THREE.BufferAttribute(this.bulge, 1);
    this.bulgeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBulge', this.bulgeAttr);
    geo.setIndex(new THREE.BufferAttribute(model.indices, 1));
    this.geometry = geo;

    this.texture = new THREE.DataTexture(model.texture as unknown as Uint8Array, model.textureSize, model.textureSize, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 4;
    this.texture.needsUpdate = true;

    this.normalMap = null;
    if (model.normalMap) {
      this.normalMap = new THREE.DataTexture(model.normalMap as unknown as Uint8Array, model.normalSize, model.normalSize, THREE.RGBAFormat);
      this.normalMap.minFilter = THREE.LinearMipmapLinearFilter;
      this.normalMap.magFilter = THREE.LinearFilter;
      this.normalMap.generateMipmaps = true;
      this.normalMap.needsUpdate = true;
    }

    this.bones.clear();
    const list: THREE.Bone[] = [];
    for (const name of JOINTS) {
      const bone = new THREE.Bone();
      bone.name = name;
      bone.position.copy(this.motion.offsets[name]);
      this.bones.set(name, bone);
      list.push(bone);
    }
    for (const name of JOINTS) {
      const parent = parentOf(name);
      if (parent) this.bones.get(parent)!.add(this.bones.get(name)!);
    }
    const rootBone = this.bones.get('hips')!;
    this.root.add(rootBone);
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(list);
    // The skin maps its texture at one scale everywhere, so strands stay the same width across seams.
    const hasFur = model.furReach > 0.002;
    const layers = hasFur ? Math.max(1, this.shells) : 0;
    this.uniforms.uStrandScale.value = (model.textureSize / 2048) * 9;
    for (let i = 0; i <= layers; i++) {
      const mesh = new THREE.SkinnedMesh(geo, this.buildMaterial(surface, i, layers));
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false;
      mesh.castShadow = i === 0;
      mesh.receiveShadow = i === 0;
      mesh.renderOrder = i;
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    this.muscleSpring = new Float32Array(anatomy.muscles.length);
    this.muscleVel = new Float32Array(anatomy.muscles.length);
    this.muscleLevels = new Float32Array(anatomy.muscles.length);
    this.start();
  }

  private clear() {
    for (const mesh of this.meshes) { this.root.remove(mesh); (mesh.material as THREE.Material).dispose(); mesh.skeleton?.dispose(); }
    this.meshes = [];
    const hips = this.bones.get('hips');
    if (hips) this.root.remove(hips);
    this.geometry?.dispose();
    this.texture?.dispose();
    this.normalMap?.dispose();
    this.geometry = null; this.texture = null;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  /** One frame. Public so a lab can drive it while its pane is hidden. */
  frame(now: number) {
    const dtMs = now - this.last;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0.001, dtMs / 1000));
    this.time += dt;
    this.clock++;
    this.frameAvg += (dtMs - this.frameAvg) * 0.08;
    const cpuFrom = performance.now();
    if (this.motion && this.model) this.pose(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.cpuAvg += (performance.now() - cpuFrom - this.cpuAvg) * 0.08;
    if (now - this.statsAt > 500) {
      this.statsAt = now;
      this.onStats?.({
        frameMs: this.frameAvg, cpuMs: this.cpuAvg, shells: Math.max(0, this.meshes.length - 1),
        triangles: this.renderer.info.render.triangles, drawCalls: this.renderer.info.render.calls,
      });
    }
  }

  private pose(dt: number) {
    const motion = this.motion!, model = this.model!;
    // The pointer in the world: a point on the plane through the creature, facing the camera.
    this.pointerActive = Math.max(0, this.pointerActive - dt * 0.35);
    this.pointerSpeed = Math.max(0, this.pointerSpeed - dt * 3);
    let lookAmount = 0;
    if (this.reactive) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const facing = this.camera.getWorldDirection(new THREE.Vector3());
      const denom = this.raycaster.ray.direction.dot(facing);
      const dist = -this.raycaster.ray.origin.dot(facing) / (denom || 1);
      const target = this.raycaster.ray.at(Math.max(0.5, dist + 0.8), new THREE.Vector3());
      // A nervous creature tracks faster.
      this.lookAt.lerp(target, 1 - Math.exp(-dt * (3 + motion.style.tension * 8)));
      lookAmount = Math.min(1, this.pointerActive * 3);
      // Fast movement near it puts it on edge; quiet lets it settle.
      this.arousal = Math.min(1, Math.max(0, this.arousal + dt * (this.pointerSpeed * 0.32 * (0.4 + motion.style.tension) - 0.22)));
    } else {
      this.arousal = Math.max(0, this.arousal - dt * 0.5);
    }
    // Spring on the recoil, so a shove carries and rebounds.
    const k = 60, c = 9;
    this.recoilVel.addScaledVector(this.recoil, -k * dt).multiplyScalar(Math.exp(-c * dt));
    this.recoil.addScaledVector(this.recoilVel, dt);

    const out = motion.evaluate({
      clip: this.clip, t: this.time, look: this.lookAt, lookAmount, arousal: this.arousal,
      recoil: this.recoil.lengthSq() > 1e-6 ? this.recoil : null,
    });
    JOINTS.forEach((name, i) => {
      const bone = this.bones.get(name)!;
      bone.quaternion.fromArray(out.rotations, i * 4);
    });
    const hips = this.bones.get('hips')!;
    hips.position.copy(motion.offsets.hips).add(out.hipsOffset);
    // Recovered joint offsets the IK moved directly: the recoil is real translation on the chest.
    if (this.recoil.lengthSq() > 1e-6) hips.position.addScaledVector(this.recoil, 0.15);

    // Muscle reacts late and overshoots, which is most of why it reads as flesh.
    const bulge = this.bulge!;
    bulge.fill(0);
    model.muscles.forEach((m, i) => {
      const spring = 90, damp = 14;
      this.muscleVel[i] += (out.muscles[i] - this.muscleSpring[i]) * spring * dt;
      this.muscleVel[i] *= Math.exp(-damp * dt);
      this.muscleSpring[i] += this.muscleVel[i] * dt;
      const level = this.muscleSpring[i];
      this.muscleLevels[i] = level;
      if (Math.abs(level) < 0.005) return;
      const size = level * 0.36;
      for (let j = 0; j < m.verts.length; j++) bulge[m.verts[j]] += m.amounts[j] * size;
    });
    this.bulgeAttr!.needsUpdate = true;

    // The coat is dragged behind the body, on its own slower spring.
    this.gustVel.add(out.drag.clone().multiplyScalar(-dt * 16));
    this.gustVel.addScaledVector(this.gust, -28 * dt);
    this.gustVel.multiplyScalar(Math.exp(-6 * dt));
    this.gust.addScaledVector(this.gustVel, dt);
    this.uniforms.uGust.value.copy(this.gust).clampLength(0, 0.9);
    this.uniforms.uGust.value.x += Math.sin(this.time * 0.7) * 0.04;
    // Hackles rise with arousal.
    this.uniforms.uBristle.value = this.arousal * 0.75;
  }

  /** Bones and clips for the file export. */
  get liveBones() { return this.bones; }

  dispose() {
    this.stop();
    this.clear();
    this.observer.disconnect();
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.controls.dispose();
    this.strands.dispose();
    this.renderer.dispose();
  }
}
