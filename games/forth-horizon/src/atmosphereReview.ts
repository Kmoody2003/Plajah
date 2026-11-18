// Small, asset-free WebGL integration fixture. No production renderer changes.
import * as THREE from 'three';
import { Atmosphere } from './atmosphere';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7ce);
scene.fog = new THREE.Fog(0x9bb7ce, 3000, 15000);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 20000);
scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x5a503f, 2));
const sun = new THREE.DirectionalLight(0xffd7a1, 3);
sun.position.set(1, 1, -2); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ color: 0x525b46, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(30, 70, 30), new THREE.MeshStandardMaterial({ color: 0x776e60, roughness: 0.85 }), 48);
const matrix = new THREE.Matrix4();
for (let i = 0; i < 48; i++) {
  const row = Math.floor(i / 4), x = [-180, -70, 70, 180][i % 4];
  matrix.makeTranslation(x, 35, -row * 220 - 100); blocks.setMatrixAt(i, matrix);
}
scene.add(blocks);
const atmosphere = new Atmosphere();
const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
const mist = document.querySelector<HTMLInputElement>('#mist')!;
const height = document.querySelector<HTMLInputElement>('#height')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
let frames = 0, since = performance.now();
const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
const adapter = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : 'Adapter unavailable';
function frame(now: number): void {
  camera.position.set(0, Number(height.value), 170); camera.lookAt(0, 25, -1800);
  atmosphere.update(scene, camera, sun.position, sun.color, Number(mist.value), 0.8, 0, !enabled.checked, now);
  renderer.render(scene, camera);
  frames++;
  if (now - since > 1000) {
    status.textContent = `${enabled.checked ? 'Height haze' : 'Original fog'} · ${(frames * 1000 / (now - since)).toFixed(1)} FPS in diagnostic scene only. ${adapter}`;
    since = now; frames = 0;
  }
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
requestAnimationFrame(frame);
