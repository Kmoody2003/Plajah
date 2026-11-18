// Headless three.js check: loads a GLB with GLTFLoader, reports tris/bones/clips, renders orthographic
// front / side / back views (unlit base colour, transparent bg) for scoring against the turnaround sheet.
//   node scripts/riftrealm/render_views.mjs <glb> <outDir> [--clip name --t 0.3]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const [glb, outDir, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const clip = opt('--clip', ''); const tcl = parseFloat(opt('--t', '0'));
fs.mkdirSync(outDir, { recursive: true });
const glbAbs = path.resolve(glb);
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f;
  if (u === '/page.html') { res.setHeader('content-type', 'text/html'); return res.end(PAGE); }
  if (u === '/model.glb') f = glbAbs; else f = path.join(ROOT, 'node_modules', u.replace(/^\/nm\//, ''));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
const PAGE = `<!doctype html><body style="margin:0"><script type="importmap">{"imports":{"three":"/nm/three/build/three.module.js","three/addons/":"/nm/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const q = new URLSearchParams(location.search);
const S = 1024;
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(S, S); r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
const g = await new GLTFLoader().loadAsync('/model.glb');
const scene = new THREE.Scene(); scene.add(g.scene);
let tris = 0, bones = 0; const mats = [];
g.scene.traverse(o => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; const m = o.material;
  const maps = {}; for (const k of ['map','normalMap','roughnessMap','emissiveMap','metalnessMap','aoMap']) if (m[k]?.image) maps[k] = m[k].image.width + 'x' + m[k].image.height;
  mats.push(maps); const nm = new THREE.MeshBasicMaterial({ map: m.map, side: THREE.DoubleSide, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest }); if (m.emissiveMap) nm.userData.emi = 1; o.material = nm; o.frustumCulled = false; }
  if (o.isBone) bones++; });
const clipName = q.get('clip'); const mixer = new THREE.AnimationMixer(g.scene);
if (clipName) { const c = g.animations.find(a => a.name === clipName); if (c) { mixer.clipAction(c).play(); mixer.setTime(parseFloat(q.get('t') || '0')); } }
g.scene.updateMatrixWorld(true);
const box = new THREE.Box3(); g.scene.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); const b = new THREE.Box3(); const p = new THREE.Vector3(); const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i += 7) { o.getVertexPosition(i, p); p.applyMatrix4(o.matrixWorld); b.expandByPoint(p); } box.union(b); } else if (o.isMesh) box.union(new THREE.Box3().setFromObject(o)); });
const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
const out = { tris, bones, clips: g.animations.map(a => a.name + ':' + a.duration.toFixed(2)), maps: mats, bbox: { min: box.min.toArray(), max: box.max.toArray() } };
const H = Math.max(size.y * 1.1, 0.01); const cam = new THREE.OrthographicCamera(-H / 2, H / 2, H / 2, -H / 2, 0.01, 100);
const shots = {};
for (const [name, dir] of [['front', [0, 0, 1]], ['side', [1, 0, 0]], ['back', [0, 0, -1]], ['three_q', [0.7, 0.15, 0.7]]]) {
  cam.position.set(ctr.x + dir[0] * 10, ctr.y + dir[1] * 10, ctr.z + dir[2] * 10); cam.lookAt(ctr.x, ctr.y, ctr.z); cam.updateMatrixWorld();
  r.render(scene, cam); shots[name] = r.domElement.toDataURL('image/png');
}
out.shots = shots; out.pxPerUnit = S / H; out.centre = ctr.toArray();
window.__result = out;
</script></body>`;
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/page.html?clip=${clip}&t=${tcl}`);
await page.waitForFunction('window.__result', null, { timeout: 120000 });
const res = await page.evaluate('window.__result');
for (const [k, v] of Object.entries(res.shots)) fs.writeFileSync(path.join(outDir, `${k}.png`), Buffer.from(v.split(',')[1], 'base64'));
delete res.shots;
fs.writeFileSync(path.join(outDir, 'info.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
await browser.close(); server.close();
