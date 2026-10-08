// _plot2d — eyeball check for dances2d: ASCII stick figure of the 2D channels (left panel) beside the human
// mocap skeleton projected to the frontal plane (right panel), for ONE clip and a few frames.
//
//   node scripts/mocap/_plot2d.mjs 143_35 [frame ...]       (default: 6 evenly spaced frames)
//
// Letters: 'l' = SCREEN-LEFT limbs (Pose.armL/legL = the human's RIGHT limbs), 'r' = screen-right limbs,
// 'O' head, '|' torso, 'o' eyes, '_' ground.  The right panel is the raw skeleton (aligned so the pelvis faces the
// camera on frame 0, frontal plane = X/Y only, no yaw removal), so when the dancer turns away from the camera
// the two panels legitimately differ (left panel mirrors via `spin`).
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const DIR = 'public/models/mascots/dances';
const id = process.argv[2] || '143_35';
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'dances2d.json'), 'utf8'));
const clip = meta.clips.find(c => c.id === id);
if (!clip) throw new Error('unknown clip ' + id);
const bin = fs.readFileSync(path.join(DIR, 'dances2d.bin'));
const i16 = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
const pose = (f) => { const o = {}; meta.channels.forEach((c, i) => { o[c.name] = i16[clip.offset / 2 + f * meta.perFrame + i] / c.scale; }); return o; };
let frames = process.argv.slice(3).map(Number);
if (!frames.length) frames = [0, 1, 2, 3, 4, 5].map(i => Math.floor(i * (clip.frames - 1) / 5));

// ---- human (same sampling as the baker)
const buf = fs.readFileSync(path.join('acquisitions/motion/cmu-fbx', id + '.fbx'));
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const mixer = new T.AnimationMixer(root); mixer.clipAction(root.animations[0]).play();
const NEED = ['hip', 'abdomen', 'neck', 'head', 'lShldr', 'lForeArm', 'lHand', 'rShldr', 'rForeArm', 'rHand', 'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot', 'leftEye', 'rightEye'];
const J = Object.fromEntries(NEED.map(n => [n, root.getObjectByName(n)]));
const sample = (i) => { mixer.setTime(i / meta.fps); root.updateMatrixWorld(true); return Object.fromEntries(NEED.map(n => [n, J[n].getWorldPosition(new T.Vector3())])); };
const basis = (lat, up) => { const x = lat.clone().normalize(); const y = up.clone().sub(x.clone().multiplyScalar(up.dot(x))).normalize(); const z = new T.Vector3().crossVectors(x, y).normalize(); return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z)); };
const A = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -clip.alignYaw);   // same alignment as the baker
const UPM = 8900, PU = 144;
let footMin = Infinity, hipXs = [];
for (let k = 0; k < clip.frames; k++) { const P = sample(clip.srcStart + k); footMin = Math.min(footMin, P.lFoot.y, P.rFoot.y); hipXs.push(P.hip.clone().applyQuaternion(A).x); }
hipXs.sort((a, b) => a - b); const hipXmed = hipXs[hipXs.length >> 1];
const human = (k) => {
  const P = sample(clip.srcStart + k); const o = {};
  for (const n of NEED) { const v = P[n].clone().applyQuaternion(A); o[n] = [(v.x - hipXmed) / UPM * PU, -(v.y - footMin) / UPM * PU]; }
  return o;
};

// ---- canvas
const W = 64, H = 40, XS = 5, YS = 8, X0 = W >> 1, Y0 = H - 3, YTOP = 0;
const canvas = () => Array.from({ length: H }, () => Array(W).fill(' '));
const plot = (g, x, y, ch) => { const c = Math.round(X0 + x / XS), r = Math.round(Y0 + y / YS); if (r >= 0 && r < H && c >= 0 && c < W) g[r][c] = ch; };
const line = (g, a, b, ch) => { const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.5)); for (let i = 0; i <= n; i++) plot(g, a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, ch); };
const ground = (g) => { for (let c = 0; c < W; c++) if (g[Y0][c] === ' ') g[Y0][c] = '_'; };

function puppet(f) {
  const q = pose(f);
  const rad = Math.PI / 180;
  const cs = Math.cos(q.rot * rad), sn = Math.sin(q.rot * rad);
  const spin = Math.abs(q.spin) < 0.08 ? Math.sign(q.spin || 1) * 0.08 : q.spin;
  const X = ([x, y]) => { const sx = x * spin; return [q.x + sx * cs - y * sn, q.y + sx * sn + y * cs]; };   // root: translate rotate scale
  const g = canvas();
  const HIP = 24, HIPY = -32, SH = 40, SHY = -103, ARM = 56, LEG = 34, NECK = -112;
  line(g, X([0, HIPY]), X([0, NECK]), '|');
  const arm = (side, raise) => { const s = side === 'l' ? -1 : 1; const a = raise * rad; const sh = [s * SH, SHY]; line(g, X(sh), X([sh[0] - s * ARM * Math.sin(a), sh[1] + ARM * Math.cos(a)]), side); };
  arm('l', q.armL); arm('r', q.armR);
  const leg = (side, sw, lift) => { const s = side === 'l' ? -1 : 1; const a = sw * rad; const hp = [s * HIP, HIPY + lift]; line(g, X([s * HIP * 0.5, HIPY]), X(hp), side); line(g, X(hp), X([hp[0] - s * LEG * Math.sin(a), hp[1] + LEG * Math.cos(a)]), side); };
  leg('l', q.legL, q.liftL); leg('r', q.legR, q.liftR);
  // head: rotate (headRot) about the neck pivot, offset by headX/headY, then through the root
  const hr = q.headRot * rad, hc = Math.cos(hr), hs = Math.sin(hr);
  const H_ = ([x, y]) => { const dy = y - NECK; return X([q.headX + x * hc - dy * hs, q.headY + NECK + x * hs + dy * hc]); };
  const c = H_([0, -150]); plot(g, c[0], c[1], 'O');
  for (const dx of [-14, -7, 7, 14]) { const p = H_([dx, -150]); plot(g, p[0], p[1], dx === -7 || dx === 7 ? 'o' : 'O'); }
  line(g, X([0, NECK]), H_([0, -120]), '|');
  ground(g);
  return { g, q };
}
function skeleton(k) {
  const h = human(k); const g = canvas();
  const seg = (a, b, ch) => line(g, h[a], h[b], ch);
  seg('hip', 'abdomen', '|'); seg('abdomen', 'neck', '|'); seg('neck', 'head', '|');
  seg('rShldr', 'rForeArm', 'l'); seg('rForeArm', 'rHand', 'l'); seg('lShldr', 'lForeArm', 'r'); seg('lForeArm', 'lHand', 'r');
  seg('rThigh', 'rShin', 'l'); seg('rShin', 'rFoot', 'l'); seg('lThigh', 'lShin', 'r'); seg('lShin', 'lFoot', 'r');
  seg('rShldr', 'lShldr', '-'); seg('rThigh', 'lThigh', '-');
  plot(g, h.head[0], h.head[1] - 5, 'O'); plot(g, h.leftEye[0], h.leftEye[1], 'o'); plot(g, h.rightEye[0], h.rightEye[1], 'o');
  ground(g);
  return g;
}

console.log(`${clip.id} ${clip.name}: ${clip.frames} frames @${meta.fps}fps (src start frame ${clip.srcStart})`);
for (const f of frames) {
  const { g, q } = puppet(f);
  const hg = skeleton(f);
  console.log(`\n=== frame ${f}  (t=${(f / meta.fps).toFixed(2)}s)  puppet(left panel) vs human frontal projection(right panel)`);
  console.log('  ' + Object.entries(q).map(([k, v]) => `${k}=${v.toFixed(k === 'spin' || k === 'mane' || k === 'squash' ? 2 : 0)}`).join(' '));
  for (let r = YTOP; r < H; r++) { const a = g[r].join(''), b = hg[r].join(''); if (a.trim() === '' && b.trim() === '') continue; console.log(a + ' | ' + b); }
}
