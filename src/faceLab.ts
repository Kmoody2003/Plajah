// Dev-only: the kaiju FACE LAB. Loads a v2 model, frames the head, steps through every eye / brow / mouth state and a
// handful of full expressions, lets you tune the per-slot decal anchors (head-local front projection x,y · cell size ·
// roll) — the grid is re-projected onto the mesh live — and writes them to
// public/models/mascots/v2/face/{who}_anchors.json (served at runtime by kaijuFaceRig.loadFaceAssets).
//
//   /face-lab.html?who=chora|reello        window.__lab is the scripting surface used by the screenshot tools
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { KaijuV2Rig, V2_LOOK } from '../components/kaiju/stage3d/kaijuV2Rig';
import { FaceDecalRig, SLOTS, createFaceRig, DEFAULT_ANCHORS, type FaceAnchors, type SlotName } from '../components/kaiju/stage3d/kaijuFaceRig';
import { decalsFromExpr, neutralDecalFace, type DecalFace } from '../components/kaiju/stage3d/kaijuFaceDecals';
import { EXPRESSIONS, type EmotionOut, type Expr } from '../components/kaiju/stage3d/kaijuFace';

const q = new URLSearchParams(location.search);
const who = (q.get('who') === 'reello' ? 'reello' : 'chora') as 'chora' | 'reello';
const noUi = q.get('ui') === '0';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
document.getElementById('app')!.appendChild(renderer.domElement);
renderer.domElement.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2040');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
// the stage-ish studio rig the artifact viewer used (× V2_LOOK.light is applied inside the skin material)
const hemi = new THREE.HemisphereLight(0xffffff, 0x6b5a85, 0.9); scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1e6, 2.2); key.position.set(-2, 3, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xff7ab8, 1.4); rim.position.set(2.5, 1.6, -3); scene.add(rim);
const fill = new THREE.DirectionalLight(0x9fd4ff, 0.6); fill.position.set(3, 0.5, 2); scene.add(fill);
const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 50);

const draco = new DRACOLoader().setDecoderPath('/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const lab: any = (window as any).__lab = { THREE, scene, camera, renderer, who, ready: false, freeze: false, clock: 0 };
const PANEL_W = noUi ? 0 : 300;
function resize() { const w = innerWidth - PANEL_W, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
lab.setSize = (w: number, h: number) => { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
lab.headCenter = new THREE.Vector3(0, 0.64, 0.1);
lab.view = (o: { az?: number; el?: number; dist?: number; target?: [number, number, number]; fov?: number }) => {
  const az = (o.az ?? 0) * Math.PI / 180, el = (o.el ?? 3) * Math.PI / 180, d = o.dist ?? 0.9;
  const t = new THREE.Vector3(...(o.target ?? (lab.headCenter.toArray() as [number, number, number])));
  camera.position.set(t.x + Math.sin(az) * Math.cos(el) * d, t.y + Math.sin(el) * d, t.z + Math.cos(az) * Math.cos(el) * d);
  if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
  camera.lookAt(t);
};

const em = (expr: Expr, o: Partial<EmotionOut> = {}): EmotionOut => ({ expr, blink: 0, gazeX: 0, gazeY: 0, browLift: 0, mouth: 0, ...o });
lab.expr = (name: Expr, o: Partial<EmotionOut> = {}, extra: Partial<DecalFace> = {}) => { const f = { ...decalsFromExpr(em(name, o)), ...extra }; lab.setFace(f); return f; };
lab.setFace = (f: Partial<DecalFace>) => { lab.cur = { ...(lab.cur ?? neutralDecalFace()), ...f }; lab.face?.apply(lab.cur); lab.step(0.3); };
/** advance the decal animation (dissolves, extras) without moving the body */
lab.step = (secs: number) => { const n = Math.ceil(secs / 0.016); for (let i = 0; i < n; i++) lab.face?.update(0.016); };
lab.setAnchor = (slot: SlotName, p: Record<string, number>) => { Object.assign(lab.face.anchors.slots[slot], p); lab.face.rebuild(); };
lab.anchors = () => JSON.parse(JSON.stringify(lab.face.anchors));
lab.save = async () => { const r = await fetch(`/__save_anchors?who=${who}`, { method: 'POST', body: JSON.stringify(lab.anchors()) }); return r.text(); };
lab.look = (l: any) => lab.rig.setLook(l);

Promise.all([loader.loadAsync(`/models/mascots/v2/${who}.glb`)]).then(async ([gltf]) => {
  console.log('[lab] gltf loaded', performance.now() | 0);
  const rig = new KaijuV2Rig({ scene: cloneSkinned(gltf.scene), animations: gltf.animations });
  lab.rig = rig; scene.add(rig.root); rig.update(0.016);
  console.log('[lab] rig built', performance.now() | 0);
  const face = await createFaceRig(who, rig.mesh!, rig.bones.head);
  console.log('[lab] face built', performance.now() | 0);
  lab.face = face; lab.cur = neutralDecalFace(); face.apply(lab.cur); face.update(0.3);
  lab.view({ az: 0, el: 3, dist: 0.8 });
  const tick = () => { requestAnimationFrame(tick); if (!lab.freeze) { lab.clock += 0.016; rig.update(0.016); } face.update(lab.freeze ? 0 : 0.016); renderer.render(scene, camera); };
  requestAnimationFrame(tick);
  if (!noUi) buildUi(face, rig);
  lab.ready = true;
});

// ------------------------------------------------------------------------------------------------ UI
function buildUi(face: FaceDecalRig, rig: KaijuV2Rig) {
  const p = document.createElement('div');
  p.style.cssText = `position:fixed;right:0;top:0;bottom:0;width:${PANEL_W}px;overflow:auto;background:#150d22;border-left:1px solid #4a3a66;padding:10px;box-sizing:border-box;font-size:12px`;
  document.body.appendChild(p);
  const h = (html: string) => { const d = document.createElement('div'); d.style.margin = '6px 0'; d.innerHTML = html; p.appendChild(d); return d; };
  const btn = (label: string, fn: () => void, parent: HTMLElement = p) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'margin:2px;padding:3px 7px;border-radius:8px;border:1px solid #4a3a66;background:#2a1d44;color:#fff;cursor:pointer;font-size:11px'; b.onclick = fn; parent.appendChild(b); return b; };
  h(`<b>${who}</b> · <a style="color:#ff8cc8" href="?who=${who === 'chora' ? 'reello' : 'chora'}">switch to ${who === 'chora' ? 'reello' : 'chora'}</a>`);
  const views = h('view: ');
  const V: Record<string, any> = { front: { az: 0, el: 3, dist: 0.8 }, '3/4': { az: 35, el: 6, dist: 0.9 }, side: { az: 75, el: 4, dist: 1 }, body: { az: 0, el: 3, dist: 3, target: [0, 0.58, 0] } };
  for (const k of Object.keys(V)) btn(k, () => lab.view(V[k]), views);
  const ex = h('<b>expressions</b><br>');
  for (const e of Object.keys(EXPRESSIONS) as Expr[]) btn(e, () => lab.expr(e), ex);
  const sel = (label: string, opts: string[], onChange: (v: string) => void) => { const d = h(`${label} `); const s = document.createElement('select'); s.style.cssText = 'background:#2a1d44;color:#fff;border:1px solid #4a3a66'; for (const o of opts) s.add(new Option(o, o)); s.onchange = () => onChange(s.value); d.appendChild(s); return s; };
  const eyes = ['open', 'half', 'closed', 'wide', 'squint', 'happy', 'sad', 'heart', 'star', 'look_up_left', 'spiral', 'sleepy'];
  const brows = ['angry', 'flat', 'raised', 'sad', 'worried', 'skeptic', 'furrowed', 'thin', 'surprised', 'villain', 'soft', 'wavy'];
  const mouths = ['rest_frown', 'smile_small', 'smile_wide', 'smirk', 'sad', 'flat', 'viseme_A', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_FV', 'viseme_L', 'laugh', 'shout', 'tongue_out'];
  sel('eyes', eyes, v => lab.setFace({ eyeL: v, eyeR: v })); sel('brows', brows, v => lab.setFace({ browL: v, browR: v })); sel('mouth', mouths, v => lab.setFace({ mouth: v }));
  const sl = (label: string, min: number, max: number, step: number, val: number, fn: (v: number) => void) => {
    const d = h(`<span style="display:inline-block;width:78px">${label}</span>`); const i = document.createElement('input'); i.type = 'range'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(val); i.style.width = '150px';
    const o = document.createElement('span'); o.textContent = String(val); i.oninput = () => { o.textContent = i.value; fn(+i.value); }; d.append(i, o);
  };
  sl('gazeX', -1, 1, 0.05, 0, v => lab.setFace({ gazeX: v })); sl('gazeY', -1, 1, 0.05, 0, v => lab.setFace({ gazeY: v }));
  sl('openL', 0.07, 1, 0.01, 1, v => lab.setFace({ openL: v })); sl('openR', 0.07, 1, 0.01, 1, v => lab.setFace({ openR: v }));
  sl('browLift', -1, 1, 0.05, 0, v => lab.setFace({ browLiftL: v, browLiftR: v })); sl('browTilt', -0.6, 0.6, 0.02, 0, v => lab.setFace({ browTilt: v }));
  sl('mouthOpen', 0.7, 1.3, 0.02, 1, v => lab.setFace({ mouthOpen: v }));
  const exs = h('<b>extras</b><br>');
  for (const e of ['blush', 'blush_big', 'tear', 'tear_streams', 'sweat', 'anger', 'heart', 'sparkle', 'zzz', 'notes', 'exclaim', 'question']) btn(e, () => { const c: string[] = lab.cur.extras; const i = c.indexOf(e); if (i >= 0) c.splice(i, 1); else c.push(e); lab.setFace({ extras: c }); }, exs);
  btn('clear', () => lab.setFace({ extras: [] }), exs);
  h('<b>look</b>');
  sl('exposure', 0.4, 1.4, 0.01, V2_LOOK.exposure, v => rig.setLook({ exposure: v })); sl('saturation', 0.7, 1.6, 0.01, V2_LOOK.saturation, v => rig.setLook({ saturation: v })); sl('light', 0.2, 1.4, 0.01, V2_LOOK.light, v => rig.setLook({ light: v }));
  sl('decal bright', 0.4, 1.4, 0.01, face.anchors.brightness, v => { face.anchors.brightness = v; face.setBrightness(v); });
  btn('freeze body', () => { lab.freeze = !lab.freeze; });
  h('<b>anchors</b> (head-local front projection)');
  const slotSel = sel('slot', SLOTS, () => fill());
  const fields = ['x', 'y', 's', 'rot', 'aspect'];
  const inputs: Record<string, HTMLInputElement> = {};
  const row = h('');
  for (const f of fields) { const l = document.createElement('label'); l.textContent = f + ' '; const i = document.createElement('input'); i.type = 'number'; i.step = f === 'rot' ? '0.05' : '0.002'; i.style.cssText = 'width:62px;background:#2a1d44;color:#fff;border:1px solid #4a3a66'; i.onchange = () => { lab.setAnchor(slotSel.value as SlotName, { [f]: +i.value }); }; l.appendChild(i); row.appendChild(l); row.appendChild(document.createElement('br')); inputs[f] = i; }
  const fill = () => { const a: any = face.anchors.slots[slotSel.value as SlotName]; for (const f of fields) inputs[f].value = String(a[f] ?? (f === 'aspect' ? 1 : 0)); };
  fill();
  btn('save anchors', async () => { msg.textContent = await lab.save(); });
  btn('reset', () => { face.anchors = JSON.parse(JSON.stringify(DEFAULT_ANCHORS[who])) as FaceAnchors; face.rebuild(); fill(); });
  const msg = h('');
}
