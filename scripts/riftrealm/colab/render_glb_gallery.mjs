// Fast headless Three.js Studio PBR Gallery Renderer (Front 0° / 3/4 Hero 35° / Back 180°) from final GLBs.
// Usage: node scripts/riftrealm/colab/render_glb_gallery.mjs <outPng> <cols> <glb1> <glb2> ...
// Or with 3-view rows per model: node scripts/riftrealm/colab/render_glb_gallery.mjs --3view <outPng> <glb1> <glb2> ...
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const threeView = argv[0] === '--3view';
const args = threeView ? argv.slice(1) : argv;
const outPng = args[0];
const cols = threeView ? 3 : parseInt(args[1], 10);
const glbPaths = threeView ? args.slice(1) : args.slice(2);
if (!outPng || !glbPaths.length) {
  console.error('Usage: node render_glb_gallery.mjs [--3view] <outPng> [cols] <glb1> ...');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../..');
const glbMap = new Map();
glbPaths.forEach((p, i) => glbMap.set(`/m_${i}.glb`, path.resolve(p)));

const srv = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (glbMap.has(u)) {
    res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
    res.end(fs.readFileSync(glbMap.get(u)));
    return;
  }
  if (u === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body style="margin:0;background:#0e121c">
<canvas id="sheet"></canvas>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const cell = 320;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(cell, cell);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x131824);
const pm = new THREE.PMREMGenerator(r);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.0;
scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85));
const key = new THREE.DirectionalLight(0xfff5e8, 2.0); key.position.set(3.5, 6, 4.5); scene.add(key);
const rim = new THREE.DirectionalLight(0x66c2ff, 1.3); rim.position.set(-4, 4, -5); scene.add(rim);
const cam = new THREE.PerspectiveCamera(34, 1, 0.05, 50);

window.renderSheet = async (items, numCols, isThreeView) => {
  const tiles = [];
  for (const it of items) {
    const gltf = await new GLTFLoader().loadAsync(it.url);
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) {
          if ('emissiveIntensity' in mt) mt.emissiveIntensity = 1.3;
        }
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const sz = box.getSize(new THREE.Vector3());
    const sc = 1.75 / Math.max(sz.x, sz.y, sz.z, 0.01);
    root.scale.setScalar(sc);
    box.setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -c.y, -c.z);
    scene.add(root);

    const angles = isThreeView
      ? [{ deg: 0, tag: 'front' }, { deg: 38, tag: '3/4' }, { deg: 180, tag: 'back' }]
      : [{ deg: 28, tag: '' }];
    for (const a of angles) {
      const rad = a.deg * Math.PI / 180;
      const dist = 3.25;
      cam.position.set(Math.sin(rad) * dist, 0.25, Math.cos(rad) * dist);
      cam.lookAt(0, 0, 0);
      r.render(scene, cam);
      const img = new Image();
      img.src = r.domElement.toDataURL('image/png');
      await new Promise((res) => (img.onload = res));
      tiles.push({ img, label: a.tag ? it.name + ' · ' + a.tag : it.name });
    }
    scene.remove(root);
  }
  const rows = Math.ceil(tiles.length / numCols);
  const sheet = document.getElementById('sheet');
  sheet.width = numCols * cell;
  sheet.height = rows * cell;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#0e121c';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  tiles.forEach((t, idx) => {
    const cx = (idx % numCols) * cell;
    const cy = Math.floor(idx / numCols) * cell;
    ctx.drawImage(t.img, cx, cy);
    ctx.fillStyle = 'rgba(10,14,22,0.78)';
    ctx.fillRect(cx, cy, cell, 26);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 13px sans-serif';
    ctx.fillText(t.label, cx + 10, cy + 17);
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
  });
  return sheet.toDataURL('image/png');
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
  res.writeHead(404);
  res.end();
});

await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.__READY === true, { timeout: 60000 });

const items = glbPaths.map((p, i) => ({ url: `/m_${i}.glb`, name: path.basename(p, '.glb') }));
const dataUrl = await page.evaluate(({ items, cols, threeView }) => window.renderSheet(items, cols, threeView), { items, cols, threeView });
fs.mkdirSync(path.dirname(path.resolve(outPng)), { recursive: true });
fs.writeFileSync(outPng, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('Wrote PBR studio gallery:', outPng, `(${items.length} models)`);
await browser.close();
srv.close();
