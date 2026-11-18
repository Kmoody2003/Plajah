// WebGPU spike for Apex (step 5 of the graphics roadmap, docs/apex-elohim/webgpu-migration.md).
//
// The real game (region.ts) runs on WebGLRenderer with ~23 GLSL shader patches and 8 GLSL post passes, none of which run on three's WebGPURenderer. Before rewriting any of that,
// this page answers one question on the Intel Arc: how fast is the same world load on the WebGPU backend? It draws the real terrain (the 6 m height grid) and every one of the
// ~9,500 city buildings as box footprints in ONE instanced draw, with a sun shadow, height fog and bloom, on a looping fly path, and reports the frame time.
//   /webgpu-spike.html            WebGPU (falls back to WebGL2 inside the same renderer when WebGPU is not available)
//   /webgpu-spike.html?webgl=1    the same renderer forced onto its WebGL2 backend, for comparison
import * as THREE from 'three/webgpu';
import { pass, uniform, color, positionWorld, mix, smoothstep, float, vec3, fog, exponentialHeightFogFactor } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const REGION = '/games/forth-horizon/region/';
const hud = document.getElementById('hud') as HTMLDivElement;
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance', forceWebGL: params.has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
await renderer.init();
const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7d4);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 2, 40000);

// light: low golden sun with a shadow around the camera's focus, sky fill
const sun = new THREE.DirectionalLight(0xffd7a8, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 10, far: 6000 });
scene.add(sun, sun.target, new THREE.HemisphereLight(0xb8cde8, 0x3a3428, 0.9));
const sunDir = new THREE.Vector3(0.55, 0.35, 0.3).normalize();

// height fog: dense low, thin with height (the same idea as ao.ts's atmosphere)
scene.fogNode = fog(color(0xc9cfd8), exponentialHeightFogFactor(float(0.00011), float(1 / 350)));

// terrain from the real height grid (every 4th sample, 24 m)
const meta = (await (await fetch(REGION + 'height2.json')).json()) as { w: number; h: number; mpp: number; min: number; max: number };
const raw = new Uint16Array(await (await fetch(REGION + 'height2.u16')).arrayBuffer());
const k = (meta.max - meta.min) / 65535;
const hAt = (x: number, z: number): number => {
  const ix = Math.max(0, Math.min(meta.w - 1, Math.round(x / meta.mpp + meta.w / 2))), iz = Math.max(0, Math.min(meta.h - 1, Math.round(z / meta.mpp + meta.h / 2)));
  return meta.min + raw[iz * meta.w + ix] * k;
};
const S = 4, gw = Math.floor(meta.w / S), gh = Math.floor(meta.h / S);
const tg = new THREE.PlaneGeometry(meta.w * meta.mpp, meta.h * meta.mpp, gw - 1, gh - 1);
tg.rotateX(-Math.PI / 2);
const tp = tg.getAttribute('position') as THREE.BufferAttribute;
for (let i = 0; i < tp.count; i++) tp.setY(i, hAt(tp.getX(i), tp.getZ(i)));
tg.computeVertexNormals();
const tMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
// colour by height: sand at the shore, grass, darker forest up the slopes, rock high up
const hgt = positionWorld.y;
tMat.colorNode = mix(mix(mix(color(0xcbb68a), color(0x6f7d45), smoothstep(2.5, 8.0, hgt)), color(0x3f5232), smoothstep(30.0, 80.0, hgt)), color(0x8a8378), smoothstep(110.0, 160.0, hgt));
const terrain = new THREE.Mesh(tg, tMat);
terrain.receiveShadow = true;
scene.add(terrain);
// the lake
const water = new THREE.Mesh(new THREE.PlaneGeometry(meta.w * meta.mpp * 1.5, meta.h * meta.mpp * 1.5), new THREE.MeshStandardNodeMaterial({ color: 0x1d4b6b, roughness: 0.08, metalness: 0.1 }));
water.rotation.x = -Math.PI / 2; water.position.y = 2.4;
scene.add(water);

// every city building as a box footprint: one instanced draw
const city = (await (await fetch(REGION + 'city.json')).json()) as { items: { bx: number; bz: number; w: number; d: number; h: number; rotY: number; kind: string }[] };
const items = city.items;
const bMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
const tint = uniform(1.0);
bMat.colorNode = mix(color(0xb9b2a6), color(0x7d8794), smoothstep(20.0, 120.0, positionWorld.y)).mul(tint);
const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
const inst = new THREE.InstancedMesh(bGeo, bMat, items.length);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
items.forEach((it, i) => {
  q.setFromAxisAngle(up, it.rotY ?? 0);
  m4.compose(new THREE.Vector3(it.bx, hAt(it.bx, it.bz) - 0.5, it.bz), q, new THREE.Vector3(Math.max(4, it.w), Math.max(4, it.h ?? 10), Math.max(4, it.d)));
  inst.setMatrixAt(i, m4);
});
inst.castShadow = inst.receiveShadow = true;
scene.add(inst);

// post: scene pass + bloom
const post = new THREE.PostProcessing(renderer);
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode('output');
post.outputNode = sceneColor.add(bloom(sceneColor, 0.35, 0.5, 0.85));

// fly path: a loop over downtown and out over the coast
let cx = 0, cz = 0;
for (const it of items) { cx += it.bx; cz += it.bz; }
cx /= items.length; cz /= items.length;
const look = new THREE.Vector3();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const times: number[] = [];
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  times.push(now - last); last = now; if (times.length > 120) times.shift();
  const t = now * 0.00004;
  const x = cx + Math.cos(t) * 2600, z = cz + Math.sin(t) * 1800;
  camera.position.set(x, hAt(x, z) + 90 + 60 * Math.sin(t * 3), z);
  look.set(cx + Math.cos(t + 0.35) * 1400, 20, cz + Math.sin(t + 0.35) * 900);
  camera.lookAt(look);
  sun.target.position.copy(look); sun.position.copy(look).addScaledVector(sunDir, 3000);
  void vec3; tint.value = 1.0;
  post.render();
  if (times.length % 15 === 0) {
    const s = [...times].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)], p90 = s[Math.floor(s.length * 0.9)];
    const info = renderer.info.render as unknown as { drawCalls?: number; calls?: number; triangles: number };
    hud.textContent = `Apex WebGPU spike\nbackend    ${backend}\nframe      ${med.toFixed(1)} ms median  (${(1000 / med).toFixed(0)} fps)\n           ${p90.toFixed(1)} ms p90\ndraw calls ${info.drawCalls ?? info.calls ?? '?'}\ntriangles  ${(info.triangles / 1e6).toFixed(2)} M\nbuildings  ${items.length} (one instanced draw)\npixel ratio ${renderer.getPixelRatio()}`;
    (window as unknown as { spike: unknown }).spike = { backend, med, p90, calls: info.drawCalls ?? info.calls, tris: info.triangles };
  }
});
