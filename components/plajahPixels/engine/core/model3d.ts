// model3d — the three.js renderer behind Fabula's 3D node (imported geometry).
//
// A raymarched generator covers the LOOK of a particle field or terrain, but nothing in the FX
// registry can load an actual .glb. This does: it renders a loaded model to an offscreen canvas
// that the compositor uploads as a layer element, exactly like an image clip. That is the whole
// design — bridging through a canvas rather than sharing the compositor's GL context means the
// monitor and the export composite the identical frame with no new plumbing, and every Forge
// effect, grade and mask applies on top for free.
//
// Parity rule, kept deliberately: the model's own animation is driven to clip-local time, never to
// a wall clock, so the monitor at t and the export frame at t are the same picture. All the camera
// and framing maths live in services/fabula/model3dNode.ts (pure, unit-tested); this file only
// turns those numbers into a three.js render.
//
// three.js and its loaders are lazy-imported: a project with no 3D node never pays for them.
import { normalizeModel3dSpec, resolveCamera, directionFromAngles, model3dLoaderFor, type Model3DSpec } from '../../../../services/fabula/model3dNode';

let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export function model3dStatus() { return status; }

interface Loaded { root: any; mixer: any | null; center: any; radius: number; }
interface ThreeEnv { THREE: any; renderer: any; scene: any; camera: any; key: any; fill: any; rim: any; ground: any; groundMat: any; pmrem: any; envTex: any | null; }

let env: ThreeEnv | null = null;
let envLoading: Promise<ThreeEnv | null> | null = null;
const models = new Map<string, Promise<Loaded | null>>();

async function ensureEnv(): Promise<ThreeEnv | null> {
  if (env) return env;
  if (envLoading) return envLoading;
  envLoading = (async () => {
    try {
      const THREE: any = await import(/* @vite-ignore */ 'three');
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (!canvas) return null;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.01, 5000);
      // A three-point rig at the world origin; the model is centred there, so the lights read the same
      // regardless of the model's own coordinates.
      const key = new THREE.DirectionalLight(0xffffff, 3); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
      const fill = new THREE.DirectionalLight(0xdfe6ff, 0.8);
      const rim = new THREE.DirectionalLight(0xffffff, 1.6);
      scene.add(key, fill, rim);
      // Shadow catcher, toggled per spec.
      const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.visible = false;
      scene.add(ground);
      const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
      env = { THREE, renderer, scene, camera, key, fill, rim, ground, groundMat, pmrem, envTex: null };
      return env;
    } catch (e) { console.warn('[model3d] three init failed:', (e as Error)?.message || e); status = 'failed'; return null; }
  })();
  return envLoading;
}

async function neutralEnv(e: ThreeEnv): Promise<any | null> {
  if (e.envTex) return e.envTex;
  try {
    const room: any = await import(/* @vite-ignore */ 'three/examples/jsm/environments/RoomEnvironment.js');
    const scene = new room.RoomEnvironment();
    e.envTex = e.pmrem.fromScene(scene, 0.04).texture;
    return e.envTex;
  } catch (e2) { console.warn('[model3d] RoomEnvironment unavailable:', (e2 as Error)?.message || e2); return null; }
}

async function loadModel(url: string): Promise<Loaded | null> {
  const e = await ensureEnv(); if (!e) return null;
  const { THREE } = e;
  const kind = model3dLoaderFor(url) || 'gltf';
  try {
    let root: any = null, mixer: any = null, clips: any[] = [];
    if (kind === 'gltf') {
      const mod: any = await import(/* @vite-ignore */ 'three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new mod.GLTFLoader();
      // Draco/KTX2 are optional; a mesh that needs them will error and we fall back to null.
      const gltf: any = await loader.loadAsync(url);
      root = gltf.scene; clips = gltf.animations || [];
    } else if (kind === 'obj') {
      const mod: any = await import(/* @vite-ignore */ 'three/examples/jsm/loaders/OBJLoader.js');
      root = await new mod.OBJLoader().loadAsync(url);
    } else if (kind === 'fbx') {
      const mod: any = await import(/* @vite-ignore */ 'three/examples/jsm/loaders/FBXLoader.js');
      root = await new mod.FBXLoader().loadAsync(url); clips = root.animations || [];
    } else if (kind === 'stl') {
      const mod: any = await import(/* @vite-ignore */ 'three/examples/jsm/loaders/STLLoader.js');
      const geo = await new mod.STLLoader().loadAsync(url);
      geo.computeVertexNormals();
      root = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xcfcfd6, metalness: 0.1, roughness: 0.6 }));
    }
    if (!root) return null;
    root.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Centre the model at the origin and record its bounding radius for framing.
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    root.position.sub(center);                 // now centred at origin
    if (clips.length) { mixer = new THREE.AnimationMixer(root); for (const c of clips) mixer.clipAction(c).play(); }
    return { root, mixer, center: new THREE.Vector3(0, 0, 0), radius: Math.max(1e-3, sphere.radius) };
  } catch (err) { console.warn('[model3d] load failed:', url, (err as Error)?.message || err); return null; }
}

function ensureModel(url: string): Promise<Loaded | null> {
  let p = models.get(url);
  if (!p) { status = 'loading'; p = loadModel(url).then(m => { status = m ? 'ready' : 'failed'; return m; }); models.set(url, p); }
  return p;
}

/** Render one frame of `model` into the shared renderer at w×h and return its canvas. */
function renderFrame(e: ThreeEnv, model: Loaded, specIn: Partial<Model3DSpec>, w: number, h: number, localT: number, envTex: any | null): HTMLCanvasElement {
  const { THREE, renderer, scene, camera, key, fill, rim, ground, groundMat } = e;
  const spec = normalizeModel3dSpec(specIn);

  // The scene holds exactly one model at a time; swap if needed.
  if ((scene as any).__model !== model.root) {
    if ((scene as any).__model) scene.remove((scene as any).__model);
    scene.add(model.root); (scene as any).__model = model.root;
  }
  // Model orientation offset (for Z-up authoring etc.).
  model.root.rotation.set(spec.modelPitch * Math.PI / 180, spec.modelYaw * Math.PI / 180, 0);

  // Deterministic animation: drive the mixer to clip-local time, never a wall clock.
  if (model.mixer) model.mixer.setTime(Math.max(0, localT));

  const aspect = w / Math.max(1, h);
  const cam = resolveCamera(spec, { center: model.center, radius: model.radius }, aspect, localT);
  camera.fov = cam.fov; camera.aspect = aspect;
  camera.near = Math.max(1e-3, cam.distance - model.radius * 2); camera.far = cam.distance + model.radius * 4;
  camera.position.set(cam.eye.x, cam.eye.y, cam.eye.z);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
  camera.updateProjectionMatrix();

  // Lights, scaled to the model so a huge or tiny mesh lights the same.
  const kd = directionFromAngles(spec.lightYaw, spec.lightPitch);
  const r = model.radius;
  key.position.set(kd.x * r * 3, kd.y * r * 3, kd.z * r * 3); key.intensity = spec.keyIntensity;
  key.shadow.camera.near = 0.1; key.shadow.camera.far = r * 10;
  key.shadow.camera.left = -r * 2; key.shadow.camera.right = r * 2; key.shadow.camera.top = r * 2; key.shadow.camera.bottom = -r * 2;
  key.shadow.camera.updateProjectionMatrix?.();
  fill.position.set(-kd.x * r * 3, r * 2, -kd.z * r * 3 + r); fill.intensity = spec.fillIntensity;
  rim.position.set(-cam.eye.x, cam.eye.y + r, -cam.eye.z); rim.intensity = spec.rimIntensity;

  scene.environment = spec.envIntensity > 0 ? envTex : null;
  if ((scene as any).environmentIntensity !== undefined) (scene as any).environmentIntensity = spec.envIntensity;
  renderer.toneMappingExposure = spec.exposure;

  // Shadow-catcher ground just under the model's lowest point.
  ground.visible = !!spec.ground;
  ground.position.y = -model.radius;

  if (spec.transparent) { renderer.setClearColor(0x000000, 0); scene.background = null; }
  else { const c = new THREE.Color(spec.background); renderer.setClearColor(c, 1); scene.background = c; }

  renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  return renderer.domElement as HTMLCanvasElement;
}

/** Exact per-frame render (offline export). Awaits the model load; returns null if unavailable. */
export async function renderModel3d(url: string, spec: Partial<Model3DSpec>, w: number, h: number, localT: number): Promise<HTMLCanvasElement | null> {
  if (!url) return null;
  const e = await ensureEnv(); if (!e) return null;
  const model = await ensureModel(url); if (!model) return null;
  const envTex = normalizeModel3dSpec(spec).envIntensity > 0 ? await neutralEnv(e) : null;
  try { return renderFrame(e, model, spec, w, h, localT, envTex); }
  catch (err) { console.warn('[model3d] render failed:', (err as Error)?.message || err); return null; }
}

// ── Live path ────────────────────────────────────────────────────────────────────────────────
// three.js renders fast enough to run synchronously each rAF once the model and env are loaded, so
// the live path just returns null until they are, kicking off the loads.
let liveEnvTex: any | null = null; let liveEnvKicked = false;
export function renderModel3dLatest(url: string, spec: Partial<Model3DSpec>, w: number, h: number, localT: number): HTMLCanvasElement | null {
  if (!url || !env) { ensureEnv(); return null; }
  const p = models.get(url);
  if (!p) { ensureModel(url); return null; }
  let model: Loaded | null = null;
  (p as any).__resolved !== undefined ? (model = (p as any).__resolved) : p.then(m => { (p as any).__resolved = m; });
  if (!model) return null;
  const wantEnv = normalizeModel3dSpec(spec).envIntensity > 0;
  if (wantEnv && !liveEnvTex && !liveEnvKicked) { liveEnvKicked = true; neutralEnv(env).then(t => { liveEnvTex = t; }); }
  try { return renderFrame(env, model, spec, w, h, localT, wantEnv ? liveEnvTex : null); }
  catch (err) { console.warn('[model3d] live render failed:', (err as Error)?.message || err); return null; }
}
