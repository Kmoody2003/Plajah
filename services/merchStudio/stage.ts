// services/merchStudio/stage.ts — the three.js photo stage behind the Merch Designer.
//
// One renderer, one product, one set. The set (backdrop, pedestal, props, lights) is rebuilt from a
// MerchScene whenever the scene changes; the product is rebuilt when it changes; artwork only swaps
// textures. Renders on demand (orbiting, edits), not every frame.
//
// capture() is what makes the 3D stage drive generation: besides the photo ("beauty") it renders a
// product mask (white = product pixels, kept exactly) and a depth pass, at the shot's resolution and
// from the same camera, so the generator restyles the set around a product that stays pixel-true.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { buildProductModel, getProductTemplate } from './products';
import type { MerchScene, MerchSetPattern, MerchSetSurface } from './scenes';
import type { MerchCameraSetup, MerchDecalPlacement, MerchShotSetup } from './types';

export interface StageProductInput {
  kind: 'template' | 'model';
  templateId?: string;
  /** For models: a loadable URL and a file name (its extension picks the loader). */
  modelUrl?: string;
  modelName?: string;
  color: string;
}

export interface StageCapture {
  width: number;
  height: number;
  beauty: string;
  /** White where the product is. */
  mask: string;
  depth: string;
}

const DEG = Math.PI / 180;

// ── Procedural surface textures ──────────────────────────────────────────────

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 5) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); f *= 2; amp *= 0.5; }
  return s;
}

const textureCache = new Map<string, THREE.Texture>();

function patternTexture(pattern: MerchSetPattern, base: string, accent: string): THREE.Texture | null {
  if (pattern === 'none') return null;
  const key = `${pattern}|${base}|${accent}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const N = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const b = new THREE.Color(base), a = new THREE.Color(accent);
  const mix = new THREE.Color();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let t = 0;
      if (pattern === 'marble') {
        const turb = fbm(u * 4, v * 4, 6);
        t = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 2 + turb * 3.2) * Math.PI)), 6) * 0.9 + fbm(u * 20, v * 20, 3) * 0.08;
      } else if (pattern === 'concrete') {
        t = fbm(u * 8, v * 8, 6) * 0.55 + (hash(x, y) > 0.985 ? 0.6 : 0) + hash(x * 3, y * 7) * 0.12;
      } else if (pattern === 'wood') {
        const grain = fbm(u * 2, v * 18, 5);
        t = 0.5 + 0.5 * Math.sin((v * 40 + grain * 6) * Math.PI);
        t = t * 0.6 + fbm(u * 30, v * 120, 3) * 0.4;
      } else if (pattern === 'rubber') {
        t = fbm(u * 30, v * 30, 3) * 0.4 + (hash(x, y) > 0.97 ? 0.8 : 0);
      } else if (pattern === 'grid') {
        const gx = (x % 64), gy = (y % 64);
        t = gx < 2 || gy < 2 ? 1 : fbm(u * 6, v * 6, 3) * 0.15;
      }
      mix.copy(b).lerp(a, Math.max(0, Math.min(1, t)));
      const i = (y * N + x) * 4;
      img.data[i] = mix.r * 255; img.data[i + 1] = mix.g * 255; img.data[i + 2] = mix.b * 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  textureCache.set(key, tex);
  return tex;
}

function surfaceMaterial(s: MerchSetSurface, repeat = 1): THREE.MeshPhysicalMaterial {
  const map = s.pattern ? patternTexture(s.pattern, s.color, s.accent ?? s.color) : null;
  if (map) { map.repeat.set(repeat, repeat); }
  return new THREE.MeshPhysicalMaterial({
    color: map ? '#ffffff' : s.color, map, roughness: s.roughness, metalness: s.metalness,
    clearcoat: s.roughness < 0.25 ? 0.6 : 0, clearcoatRoughness: 0.1,
  });
}

function gradientTexture(top: string, bottom: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A photo-studio cyclorama: floor that curves up into a back wall, no visible corner. */
function sweepGeometry(): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [];
  const R = 2.2, zWall = -2.4;
  for (let z = 8; z > zWall; z -= 0.5) profile.push([0, z]);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    profile.push([R - R * Math.cos(a), zWall - R * Math.sin(a)]);
  }
  for (let y = R + 0.5; y <= 9; y += 0.5) profile.push([y, zWall - R]);
  const W = 18, cols = 2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let along = 0;
  profile.forEach(([y, z], i) => {
    if (i > 0) along += Math.hypot(y - profile[i - 1][0], z - profile[i - 1][1]);
    for (let c = 0; c <= cols; c++) {
      pos.push(-W / 2 + (c / cols) * W, y, z);
      uv.push((c / cols) * W / 4, along / 4);
    }
  });
  for (let i = 0; i < profile.length - 1; i++) {
    for (let c = 0; c < cols; c++) {
      const a = i * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function propGeometry(shape: string): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere': return new THREE.SphereGeometry(1, 48, 32);
    case 'box': return new RoundedBoxGeometry(1, 1, 1, 3, 0.04);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 64);
    case 'torus': return new THREE.TorusGeometry(1, 0.12, 24, 96);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 48);
    case 'capsule': return new THREE.CapsuleGeometry(0.5, 1, 8, 24);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        // Shared pattern textures stay cached; only per-object maps go.
        for (const v of Object.values(mat as any)) if (v instanceof THREE.Texture && ![...textureCache.values()].includes(v)) v.dispose();
        mat.dispose();
      }
    }
  });
}

async function loadModel(url: string, name: string): Promise<THREE.Object3D> {
  const ext = (name.split('.').pop() || 'glb').toLowerCase();
  if (ext === 'obj') return new (await import('three/examples/jsm/loaders/OBJLoader.js')).OBJLoader().loadAsync(url);
  if (ext === 'fbx') return new (await import('three/examples/jsm/loaders/FBXLoader.js')).FBXLoader().loadAsync(url);
  if (ext === 'stl') {
    const geo = await new (await import('three/examples/jsm/loaders/STLLoader.js')).STLLoader().loadAsync(url);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#d8d8dc', roughness: 0.5 }));
  }
  const gltf = await new (await import('three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader().loadAsync(url);
  return gltf.scene;
}

// ── Stage ─────────────────────────────────────────────────────────────────────

let rectLightsReady = false;

export class MerchStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  private controls: OrbitControls;
  private pmrem: THREE.PMREMGenerator;
  private set = new THREE.Group();
  private product = new THREE.Group();
  private productBody: THREE.Object3D | null = null;
  private productMount: 'stand' | 'hang' = 'stand';
  private printMeshes: Record<string, THREE.Mesh> = {};
  private colorMaterials: THREE.MeshPhysicalMaterial[] = [];
  private decal: THREE.Mesh | null = null;
  private sceneDef: MerchScene | null = null;
  private setup: MerchShotSetup | null = null;
  private pedestalTop = 0;
  private frame = { center: new THREE.Vector3(0, 0.6, 0), radius: 0.8 };
  private dirty = true;
  private raf = 0;
  private resizeObs: ResizeObserver;
  private disposed = false;
  /** Called when the user finishes orbiting, with the camera as a MerchCameraSetup. */
  onCameraChange?: (cam: MerchCameraSetup) => void;

  constructor(private container: HTMLElement) {
    if (!rectLightsReady) { RectAreaLightUniformsLib.init(); rectLightsReady = true; }
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r184; PCF is soft now
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(this.set, this.product);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = 88 * DEG;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('end', () => this.onCameraChange?.(this.readCamera()));

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      if (this.controls.update()) this.dirty = true;
      if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ── Product ────────────────────────────────────────────────────────────────

  async setProduct(input: StageProductInput): Promise<void> {
    disposeTree(this.product);
    this.product.clear();
    this.printMeshes = {};
    this.colorMaterials = [];
    this.decal = null;
    this.productBody = null;
    if (input.kind === 'template') {
      const built = buildProductModel(input.templateId ?? 'tee', input.color);
      this.productBody = built.root;
      this.printMeshes = built.printMeshes;
      this.colorMaterials = built.colorMaterials;
      this.productMount = getProductTemplate(input.templateId).mount;
    } else if (input.modelUrl) {
      const root = await loadModel(input.modelUrl, input.modelName ?? 'model.glb');
      if (this.disposed) return;
      // Normalize: ~1.1 units on the longest side, centred on x/z, resting on y = 0.
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const s = 1.1 / Math.max(1e-6, size.x, size.y, size.z);
      root.scale.multiplyScalar(s);
      const box2 = new THREE.Box3().setFromObject(root);
      const c = box2.getCenter(new THREE.Vector3());
      root.position.sub(new THREE.Vector3(c.x, box2.min.y, c.z));
      const holder = new THREE.Group();
      holder.add(root);
      holder.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        // Untextured meshes (sculpts, STL, plain OBJ) take the product colour.
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!Array.isArray(m.material) && !mat?.map && !(mat as any)?.vertexColors) {
          const pm = new THREE.MeshPhysicalMaterial({ color: input.color, roughness: mat?.roughness ?? 0.45, metalness: mat?.metalness ?? 0, clearcoat: 0.3 });
          m.material = pm;
          this.colorMaterials.push(pm);
        }
      });
      this.productBody = holder;
      this.productMount = 'stand';
    }
    if (this.productBody) {
      this.productBody.traverse((o) => { o.userData.merchProduct = true; });
      this.product.add(this.productBody);
    }
    this.placeProduct();
  }

  setProductColor(color: string) {
    for (const m of this.colorMaterials) {
      m.color.set(color);
      if (m.sheen) m.sheenColor.set(color).lerp(new THREE.Color('#ffffff'), 0.4);
    }
    this.dirty = true;
  }

  /** Swaps a print area's artwork texture. */
  setPrintCanvas(areaId: string, canvas: HTMLCanvasElement) {
    const mesh = this.printMeshes[areaId];
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat.map && (mat.map as THREE.CanvasTexture).image === canvas) {
      mat.map.needsUpdate = true;
    } else {
      mat.map?.dispose();
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      mat.map = tex;
      mat.needsUpdate = true;
    }
    this.dirty = true;
  }

  private productMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.productBody?.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.name.startsWith('print:')) out.push(o as THREE.Mesh); });
    return out;
  }

  /** Where a click lands on a model product, in the product's own space (for decal placement). */
  pick(clientX: number, clientY: number): Omit<MerchDecalPlacement, 'size' | 'rotation'> | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = this.productMeshes();
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit || !hit.face || !this.productBody) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const local = this.productBody.worldToLocal(hit.point.clone());
    const inv = new THREE.Matrix4().copy(this.productBody.matrixWorld).invert();
    const ln = n.transformDirection(inv);
    return { meshIndex: meshes.indexOf(hit.object as THREE.Mesh), point: [local.x, local.y, local.z], normal: [ln.x, ln.y, ln.z] };
  }

  /** Projects the artwork onto a model product. */
  setDecal(placement: MerchDecalPlacement | undefined, canvas: HTMLCanvasElement | null) {
    if (this.decal) { this.decal.parent?.remove(this.decal); disposeTree(this.decal); this.decal = null; }
    if (!placement || !canvas || !this.productBody) { this.dirty = true; return; }
    const mesh = this.productMeshes()[placement.meshIndex];
    if (!mesh) return;
    this.product.updateMatrixWorld(true);
    const p = this.productBody.localToWorld(new THREE.Vector3(...placement.point));
    const n = new THREE.Vector3(...placement.normal).transformDirection(this.productBody.matrixWorld);
    const orient = new THREE.Object3D();
    orient.position.copy(p);
    orient.lookAt(p.clone().add(n));
    orient.rotateZ(placement.rotation * DEG);
    const aspect = canvas.width / Math.max(1, canvas.height);
    const geo = new DecalGeometry(mesh, p, orient.rotation, new THREE.Vector3(placement.size, placement.size / aspect, placement.size));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    // Decal vertices come out in world space; parent them to the product so they follow it when a
    // set change moves the product (onto or off a pedestal).
    geo.applyMatrix4(new THREE.Matrix4().copy(this.product.matrixWorld).invert());
    this.decal = new THREE.Mesh(geo, mat);
    this.decal.userData.merchProduct = true;
    this.decal.receiveShadow = true;
    this.product.add(this.decal);
    this.dirty = true;
  }

  /** Re-uploads the decal texture after the artwork canvas was redrawn in place. */
  refreshDecal() {
    const map = (this.decal?.material as THREE.MeshStandardMaterial | undefined)?.map;
    if (map) { map.needsUpdate = true; this.dirty = true; }
  }

  private placeProduct() {
    if (!this.productBody) return;
    const hang = this.productMount === 'hang';
    this.product.position.set(0, hang ? 0.14 : this.pedestalTop, 0);
    this.product.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.productBody);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.frame = { center: sphere.center, radius: Math.max(0.2, sphere.radius) };
    if (this.setup) this.applyCamera(this.setup.camera);
    this.dirty = true;
  }

  // ── Set ────────────────────────────────────────────────────────────────────

  applyScene(def: MerchScene, setup: MerchShotSetup) {
    this.sceneDef = def;
    this.setup = setup;
    disposeTree(this.set);
    this.set.clear();

    const bg = gradientTexture(def.backdrop.top, def.backdrop.bottom);
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.scene.background = bg;
    this.scene.fog = def.fog ? new THREE.Fog(def.fog.color, def.fog.near, def.fog.far) : null;
    this.scene.environmentIntensity = def.envIntensity;

    const surf = def.backdrop.surface;
    if (def.backdrop.kind === 'sweep') {
      const m = new THREE.Mesh(sweepGeometry(), surfaceMaterial(surf, 1));
      m.receiveShadow = true;
      this.set.add(m);
    } else if (def.backdrop.kind === 'void') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(14, 96), surfaceMaterial(surf, 8));
      m.rotation.x = -Math.PI / 2;
      m.receiveShadow = true;
      this.set.add(m);
    } else {
      const top = new THREE.Mesh(new RoundedBoxGeometry(6, 0.1, 3.6, 3, 0.03), surfaceMaterial(surf, 1));
      top.position.set(0, -0.05, -0.2);
      top.receiveShadow = true;
      this.set.add(top);
    }

    const hang = this.productMount === 'hang';
    this.pedestalTop = 0;
    if (def.pedestal && !hang) {
      const pd = def.pedestal;
      const mat = surfaceMaterial(pd.surface, 1);
      if (pd.shape === 'stack') {
        for (const [r, y0, h] of [[pd.width / 2, 0, pd.height * 0.5], [pd.width / 2.6, pd.height * 0.5, pd.height * 0.5]]) {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 96), mat);
          m.position.y = y0 + h / 2;
          this.set.add(m);
        }
      } else {
        const geo = pd.shape === 'cylinder'
          ? new THREE.CylinderGeometry(pd.width / 2, pd.width / 2, pd.height, 128)
          : new RoundedBoxGeometry(pd.width, pd.height, pd.width * 0.7, 4, 0.02);
        const m = new THREE.Mesh(geo, mat);
        m.position.y = pd.height / 2;
        this.set.add(m);
      }
      this.pedestalTop = pd.height;
    }

    if (setup.props) {
      for (const p of def.props) {
        const mat = surfaceMaterial(p.surface, 1);
        if (p.emissive) { mat.emissive.set(p.emissive); mat.emissiveIntensity = p.emissiveIntensity ?? 1; }
        const m = new THREE.Mesh(propGeometry(p.shape), mat);
        m.position.set(...p.position);
        m.scale.set(...p.scale);
        if (p.rotation) m.rotation.set(...p.rotation);
        this.set.add(m);
      }
    }
    this.set.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    this.placeProduct();
    this.buildLights();
    this.applyCamera(setup.camera);
    this.dirty = true;
  }

  /** Light rig only (light sliders), without rebuilding the set. */
  updateLighting(setup: MerchShotSetup) {
    this.setup = setup;
    this.buildLights();
    this.renderer.toneMappingExposure = setup.exposure;
    this.dirty = true;
  }

  private buildLights() {
    const def = this.sceneDef, setup = this.setup;
    if (!def || !setup) return;
    for (const o of [...this.set.children]) if ((o as THREE.Light).isLight) { this.set.remove(o); (o as THREE.Light).dispose?.(); }
    const target = this.frame.center;
    const k = setup.lightScale;
    const hemi = new THREE.HemisphereLight(def.ambient.sky, def.ambient.ground, def.ambient.intensity * k);
    this.set.add(hemi);
    for (const L of def.lights) {
      const pos = new THREE.Vector3(...L.position);
      if (L.role === 'key' && setup.keyYaw) pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), setup.keyYaw * DEG);
      pos.y += this.pedestalTop;
      let light: THREE.Light;
      if (L.kind === 'area') {
        const rl = new THREE.RectAreaLight(L.color, L.intensity * k, L.size?.[0] ?? 2, L.size?.[1] ?? 2);
        rl.position.copy(pos);
        rl.lookAt(target);
        light = rl;
      } else if (L.kind === 'spot') {
        const sl = new THREE.SpotLight(L.color, L.intensity * k, 0, (L.angle ?? 30) * DEG, L.penumbra ?? 0.5, 2);
        sl.position.copy(pos);
        sl.target.position.copy(target);
        this.set.add(sl.target);
        light = sl;
      } else if (L.kind === 'point') {
        light = new THREE.PointLight(L.color, L.intensity * k, 0, 2);
        light.position.copy(pos);
      } else {
        const dl = new THREE.DirectionalLight(L.color, L.intensity * k);
        dl.position.copy(pos);
        dl.target.position.copy(target);
        this.set.add(dl.target);
        light = dl;
      }
      if (L.castShadow && (light as THREE.DirectionalLight | THREE.SpotLight).shadow) {
        const sh = (light as THREE.DirectionalLight).shadow;
        light.castShadow = true;
        sh.mapSize.set(2048, 2048);
        sh.bias = -0.0004;
        sh.normalBias = 0.02;
        sh.radius = 6;
        const cam = sh.camera as THREE.OrthographicCamera;
        if (cam.isOrthographicCamera) { cam.left = -3; cam.right = 3; cam.top = 3; cam.bottom = -3; cam.near = 0.1; cam.far = 20; cam.updateProjectionMatrix(); }
      }
      this.set.add(light);
    }
    this.renderer.toneMappingExposure = setup.exposure;
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private baseDistance(fov: number) {
    return this.frame.radius / Math.sin((fov * DEG) / 2);
  }

  applyCamera(cam: MerchCameraSetup) {
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();
    const d = this.baseDistance(cam.fov) * cam.distance;
    const yaw = cam.yaw * DEG, pitch = cam.pitch * DEG;
    const c = this.frame.center;
    this.camera.position.set(c.x + d * Math.cos(pitch) * Math.sin(yaw), c.y + d * Math.sin(pitch), c.z + d * Math.cos(pitch) * Math.cos(yaw));
    this.controls.target.copy(c);
    this.controls.minDistance = this.frame.radius * 1.2;
    this.controls.maxDistance = this.baseDistance(cam.fov) * 3;
    this.controls.update();
    this.dirty = true;
  }

  readCamera(): MerchCameraSetup {
    const off = this.camera.position.clone().sub(this.controls.target);
    const d = off.length();
    return {
      yaw: Math.round((Math.atan2(off.x, off.z) / DEG) * 10) / 10,
      pitch: Math.round((Math.asin(off.y / Math.max(1e-6, d)) / DEG) * 10) / 10,
      distance: Math.round((d / this.baseDistance(this.camera.fov)) * 100) / 100,
      fov: this.camera.fov,
    };
  }

  // ── Capture ────────────────────────────────────────────────────────────────

  /** Renders the shot at w×h: beauty, product mask, depth. */
  capture(w: number, h: number): StageCapture {
    const r = this.renderer;
    const prevSize = r.getSize(new THREE.Vector2());
    const prevRatio = r.getPixelRatio();
    const prevAspect = this.camera.aspect;
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    r.render(this.scene, this.camera);
    const beauty = r.domElement.toDataURL('image/png');

    // Flat passes: swap every material, no tone mapping, no background/fog.
    const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const bg = this.scene.background, fog = this.scene.fog, tm = r.toneMapping;
    this.scene.background = new THREE.Color('#000000');
    this.scene.fog = null;
    r.toneMapping = THREE.NoToneMapping;
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const black = new THREE.MeshBasicMaterial({ color: '#000000' });
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      saved.set(m, m.material);
      const isPrint = o.name.startsWith('print:');
      m.material = o.userData.merchProduct || isPrint ? white : black;
      if (isPrint) m.visible = false; // print skins sit on the body, which already covers them
    });
    r.render(this.scene, this.camera);
    const mask = r.domElement.toDataURL('image/png');

    const depthMat = new THREE.MeshDepthMaterial();
    const near = this.camera.near, far = this.camera.far;
    const dist = this.camera.position.distanceTo(this.frame.center);
    // Tight range around the product so depth uses the full grey scale (near = white).
    this.camera.near = Math.max(0.05, dist - this.frame.radius * 1.6);
    this.camera.far = dist + this.frame.radius * 3;
    this.camera.updateProjectionMatrix();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = depthMat; });
    r.render(this.scene, this.camera);
    const depth = r.domElement.toDataURL('image/png');

    for (const [m, mat] of saved) { m.material = mat; if (m.name.startsWith('print:')) m.visible = true; }
    white.dispose(); black.dispose(); depthMat.dispose();
    this.scene.background = bg;
    this.scene.fog = fog;
    r.toneMapping = tm;
    this.camera.near = near;
    this.camera.far = far;
    r.setPixelRatio(prevRatio);
    r.setSize(prevSize.x, prevSize.y, false);
    this.camera.aspect = prevAspect;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    return { width: w, height: h, beauty, mask, depth };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    disposeTree(this.set);
    disposeTree(this.product);
    if (this.decal) disposeTree(this.decal);
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
