import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const [glbPath, outDir] = process.argv.slice(2);
if (!glbPath || !outDir) { console.error('usage: node render_turntable8.mjs <glb> <outDir>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../..');
const glbBuf = fs.readFileSync(glbPath);

const srv = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/model.glb') { res.writeHead(200, { 'Content-Type': 'model/gltf-binary' }); res.end(glbBuf); return; }
  if (u === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><body style="margin:0;background:transparent"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(512, 512);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.1;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(r);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.9));
const dl = new THREE.DirectionalLight(0xfff5e8, 1.9); dl.position.set(3, 5, 4); scene.add(dl);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 50);
const gltf = await new GLTFLoader().loadAsync('/model.glb');
const root = gltf.scene;
const box = new THREE.Box3().setFromObject(root);
const sz = box.getSize(new THREE.Vector3());
const sc = 1.72 / Math.max(sz.x, sz.y, sz.z, 0.01);
root.scale.setScalar(sc);
box.setFromObject(root);
const c = box.getCenter(new THREE.Vector3());
root.position.set(-c.x, -c.y, -c.z);
scene.add(root);
window.renderAngle = (deg) => {
  const rad = deg * Math.PI / 180;
  cam.position.set(Math.sin(rad) * 4, 0, Math.cos(rad) * 4);
  cam.lookAt(0, 0, 0);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
};
window.__READY = true;
</script></body></html>`);
    return;
  }
  const fp = path.join(ROOT, u.replace(/^\//, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp);
    const mime = ext === '.js' ? 'application/javascript' : ext === '.wasm' ? 'application/wasm' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(fp));
    return;
  }
  res.writeHead(404); res.end();
});

await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.__READY === true, { timeout: 60000 });
for (let i = 0; i < 8; i++) {
  const deg = i * 45;
  const dataUrl = await page.evaluate((d) => window.renderAngle(d), deg);
  fs.writeFileSync(path.join(outDir, `ang_${String(deg).padStart(3, '0')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await browser.close();
srv.close();
