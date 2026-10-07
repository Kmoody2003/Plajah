// bakeKaiju2DDances — turn the same CMU mocap dances used by the 3D kaiju into a 2D "Pose" track
// for the 2D puppets (Lorik & Lumi, components/kaiju/KaijuFigure.tsx).
//
//   node scripts/mocap/bakeKaiju2DDances.mjs
//
// IN : acquisitions/motion/cmu-fbx/*.fbx   (CMU Graphics Lab Motion Capture Database via the
//      gbionics/cmu-fbx mirror, credit: "Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)")
// OUT: public/models/mascots/dances/dances2d.json + dances2d.bin
//
// Clip ids / names / styles / window selection / energy / beat are IDENTICAL to bakeKaijuDances.mjs
// (the sampling code is duplicated on purpose; that script is untouched).
//
// Per frame (30 fps) 16 int16 channels = round(value * scale) — see CHANNELS. They are the Pose fields in
// components/kaiju/kaijuPose.ts, plus `mane` and `squash` (squash: sy = 1 + squash, sx = 1 - 0.6*squash).
//
// Conventions (verified against KaijuFigure.apply()):
//   root  = translate(x y) rotate(rot) scale(sx*spin sy)       -> x,y,rot,spin act in SCREEN space
//   head  = translate(headX, headY+NECK_Y) rotate(headRot) ...  -> inside the root (so inside the spin mirror)
//   armL  = translate(-40,-103) rotate(+armL)   armR = translate(+40,-103) rotate(-armR)
//   legL  = translate(-24,-32+liftL) rotate(+legL)  legR = translate(+24, -32+liftR) rotate(-legR)
//   => armL/legL = SCREEN-LEFT limbs = the human's RIGHT limbs (character faces camera, its left is screen-right).
// Torso/limb/head angles are measured in a BODY-LOCAL frame (aligned frame with the pelvis yaw removed, x =
// body-left) and then un-rotated by the torso lean, because they live inside the spin mirror and the lean
// rotation; x / y / rot / spin are measured in the yaw-aligned WORLD frame (screen space).
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const SRC = 'acquisitions/motion/cmu-fbx';
const OUT = 'public/models/mascots/dances';
const FPS = 30;
const MAX_SECONDS = 28;
const UNITS_PER_M = 8900;          // FBX units per metre (same as the 3D bake)
const PU = 144;                    // puppet units per metre (252 units ~ 1.75 m)
const DEG = 180 / Math.PI;

const CHANNELS = [
  { name: 'x', scale: 200 }, { name: 'y', scale: 200 }, { name: 'rot', scale: 500 }, { name: 'spin', scale: 30000 },
  { name: 'headRot', scale: 500 }, { name: 'headX', scale: 300 }, { name: 'headY', scale: 300 },
  { name: 'armL', scale: 150 }, { name: 'armR', scale: 150 }, { name: 'legL', scale: 500 }, { name: 'legR', scale: 500 },
  { name: 'liftL', scale: 300 }, { name: 'liftR', scale: 300 }, { name: 'tail', scale: 500 },
  { name: 'mane', scale: 30000 }, { name: 'squash', scale: 30000 },
];
const CH = Object.fromEntries(CHANNELS.map((c, i) => [c.name, i]));

// id → { name, styles }  (copied verbatim from bakeKaijuDances.mjs)
const CLIPS = {
  '05_03': { name: 'Arabesque turn', styles: ['ballet', 'zen'] },
  '05_05': { name: 'Jeté en tournant', styles: ['ballet'] },
  '05_07': { name: 'Small jetés & pirouette', styles: ['ballet'] },
  '05_09': { name: 'Glissade', styles: ['ballet', 'zen'] },
  '05_12': { name: 'Arms high, tendu', styles: ['ballet', 'zen'] },
  '05_17': { name: 'Grand jeté', styles: ['ballet'] },
  '49_09': { name: 'Side arabesque', styles: ['zen', 'ballet'] },
  '49_10': { name: 'Fold in, curl', styles: ['zen'] },
  '49_12': { name: 'Lean & arch arms', styles: ['zen', 'ballet'] },
  '49_22': { name: 'Balance, elbow by ear', styles: ['zen'] },
  '143_35': { name: 'Macarena', styles: ['edm', 'groove'] },
  '143_34': { name: 'Chicken dance', styles: ['edm', 'groove'] },
  '141_12': { name: 'The Twist', styles: ['edm', 'rock', 'groove'] },
  '90_28': { name: 'Breakdance', styles: ['edm', 'rock'] },
  '90_32': { name: 'Moonwalk', styles: ['edm', 'groove'] },
  '55_01': { name: 'Whirl', styles: ['edm', 'ballet'] },
  '143_08': { name: 'Jumping twists', styles: ['edm', 'rock'] },
  '143_09': { name: 'Jumping twists B', styles: ['edm', 'rock'] },
  '120_05': { name: 'Mickey dance', styles: ['edm', 'groove'] },
  '120_06': { name: 'Mickey dance B', styles: ['edm', 'groove'] },
  '79_18': { name: 'Air drums', styles: ['rock'] },
  '90_30': { name: 'Russian dance', styles: ['rock', 'edm'] },
  '120_21': { name: 'Robot', styles: ['edm', 'rock'] },
  '85_10': { name: 'Break finish', styles: ['rock', 'edm'] },
  '103_03': { name: 'Charleston', styles: ['groove', 'rock'] },
  '103_04': { name: 'Charleston side-by-side', styles: ['groove'] },
  '60_01': { name: 'Salsa', styles: ['groove'] },
  '60_05': { name: 'Salsa B', styles: ['groove'] },
  '60_10': { name: 'Salsa C', styles: ['groove'] },
  '61_03': { name: 'Salsa D', styles: ['groove'] },
  '55_02': { name: 'Lambada', styles: ['groove'] },
  '64_02': { name: 'Swing', styles: ['groove', 'rock'] },
  '111_37': { name: 'Wave', styles: ['greet'] },
  '141_16': { name: 'Wave hello', styles: ['greet'] },
  '120_04': { name: 'Conducting', styles: ['zen', 'ballet'] },
};

// ------------------------------------------------------------------ helpers
const V = (x, y, z) => new T.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function basis(lateral, up) {
  const x = lateral.clone().normalize();
  const y = up.clone().sub(x.clone().multiplyScalar(up.dot(x))).normalize();
  const z = new T.Vector3().crossVectors(x, y).normalize();
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
}
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length * 0.5)]; };
function smooth3(a) { const o = a.slice(); for (let i = 1; i < a.length - 1; i++) o[i] = (a[i - 1] + 2 * a[i] + a[i + 1]) / 4; return o; }
function movAvg(a, half) {
  const o = new Array(a.length);
  for (let i = 0; i < a.length; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - half); j <= Math.min(a.length - 1, i + half); j++) { s += a[j]; c++; } o[i] = s / c; }
  return o;
}
function lag(a, tau, tauDown = tau) {          // one-pole follow, optional faster attack / slower release
  const o = new Array(a.length); let v = a[0] ?? 0;
  for (let i = 0; i < a.length; i++) { const t = a[i] > v ? tau : tauDown; v += (a[i] - v) * (1 - Math.exp(-1 / FPS / t)); o[i] = v; }
  return o;
}
const ddt = (a) => a.map((_, i) => (a[Math.min(a.length - 1, i + 1)] - a[Math.max(0, i - 1)]) * FPS / (Math.min(a.length - 1, i + 1) - Math.max(0, i - 1) || 1));

// Limb → raise angle (deg). d = unit direction (body-local, tilt-corrected); sgn = +1 for the body-LEFT limb
// (screen-right, armR/legR), -1 for the body-RIGHT limb (screen-left, armL/legL). 0 = down, 90 = sideways.
function raiseOf(d, sgn) {
  const phi = Math.acos(clamp(-d.y, -1, 1)) * DEG;
  const outward = sgn * d.x;
  if (outward >= -0.25) {
    const horiz = Math.hypot(d.x, d.z);
    const fwdShare = horiz > 1e-6 ? Math.max(0, d.z) / horiz : 0;      // forward reach foreshortens: read it as outward, damp 0.8
    return phi * (1 - 0.2 * fwdShare);
  }
  return -phi * Math.min(1, (-outward - 0.25) / 0.5);
}

// ------------------------------------------------------------------ bake one clip
const NEED = ['hip', 'abdomen', 'chest', 'neck', 'head', 'lShldr', 'lForeArm', 'lHand', 'rShldr', 'rForeArm', 'rHand',
  'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot', 'lCollar', 'rCollar', 'leftEye', 'rightEye'];

function bake(id, meta) {
  const buf = fs.readFileSync(path.join(SRC, id + '.fbx'));
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = root.animations[0];
  const mixer = new T.AnimationMixer(root); mixer.clipAction(clip).play();
  const J = {}; for (const n of NEED) { J[n] = root.getObjectByName(n); if (!J[n]) throw new Error(`${id}: missing joint ${n}`); }
  const p = n => J[n].getWorldPosition(new T.Vector3());

  const n = Math.floor(clip.duration * FPS);
  const S = [];
  for (let i = 0; i < n; i++) { mixer.setTime(i / FPS); root.updateMatrixWorld(true); const P = {}; for (const k of NEED) P[k] = p(k); S.push(P); }

  // alignment: yaw so the pelvis faces +Z on the first frame (identical to the 3D bake)
  const pel = (P) => basis(P.lThigh.clone().sub(P.rThigh), P.abdomen.clone().sub(P.hip));
  const f0 = V(0, 0, 1).applyQuaternion(pel(S[0]));
  const theta0 = Math.atan2(f0.x, f0.z);
  const A0 = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), -theta0);

  // window (identical to the 3D bake)
  const speed = (i) => { const a = S[i], b = S[Math.min(n - 1, i + 1)]; let s = 0; for (const k of ['lHand', 'rHand', 'head', 'hip']) s += a[k].distanceTo(b[k]); return s * FPS / UNITS_PER_M; };
  const sp = Array.from({ length: n }, (_, i) => speed(i));
  let start = 0, len = n;
  const maxN = Math.floor(MAX_SECONDS * FPS);
  if (n > maxN) {
    let cur = 0; for (let i = 0; i < maxN; i++) cur += sp[i];
    let best = cur; start = 0;
    for (let i = 1; i + maxN <= n; i++) { cur += sp[i + maxN - 1] - sp[i - 1]; if (cur > best) { best = cur; start = i; } }
    len = maxN;
  }

  // CMU frame 0 is a T-pose calibration frame (arms out, arbitrary heading): never let it into the 2D track.
  const SS = S.slice(); if (n > 1) SS[0] = S[1];
  // Facing alignment: frame 0's heading is NOT the dance's heading (Macarena starts ~150 deg off it), so on top of
  // the frame-0 alignment A0 rotate by the circular-mean pelvis heading of the whole window: spin ~ 1 = facing camera.
  let cx = 0, cz = 0;
  for (let k = 0; k < len; k++) { const f = V(0, 0, 1).applyQuaternion(pel(SS[start + k])).applyQuaternion(A0); const hh = Math.hypot(f.x, f.z) || 1; cx += f.x / hh; cz += f.z / hh; }
  const alignYaw = theta0 + Math.atan2(cx, cz);
  const A = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), -alignYaw);

  // ---- aligned-frame positions (metres) + per-frame pelvis yaw
  const W = [], yaw = [];
  for (let k = 0; k < len; k++) {
    const P = SS[start + k]; const Q = {};
    for (const nm of NEED) Q[nm] = P[nm].clone().applyQuaternion(A).multiplyScalar(1 / UNITS_PER_M);
    W.push(Q);
    const fwd = V(0, 0, 1).applyQuaternion(pel(P)).applyQuaternion(A);
    yaw.push(Math.atan2(fwd.x, fwd.z));
  }
  // body-local: remove pelvis yaw about Y (x = body-left, z = forward)
  const loc = (v, k) => { const c = Math.cos(yaw[k]), s = Math.sin(yaw[k]); return V(v.x * c - v.z * s, v.y, v.x * s + v.z * c); };
  const dirLoc = (a, b, k) => loc(W[k][b].clone().sub(W[k][a]), k).normalize();
  const sgnS = yaw.map(y => (Math.cos(y) >= 0 ? 1 : -1));

  // ---- world-frame (screen-space) channels
  const hipH = W.map(Q => Q.hip.y);
  const hipMed = median(hipH);
  const yCh = hipH.map(h => clamp(-(h - hipMed) * PU * 1.2, -150, 14));
  const hipX = W.map(Q => Q.hip.x);
  const hipXd = movAvg(hipX, 60);                                         // remove travel, keep sway
  const xCh = hipX.map((v, i) => clamp((v - hipXd[i]) * PU * 0.6, -55, 55));
  const lean = W.map(Q => Math.atan2(Q.neck.x - Q.hip.x, Q.neck.y - Q.hip.y) * DEG);
  const leanMed = median(lean);
  const rotCh = lean.map(l => clamp((l - leanMed) * 1.1, -35, 35));
  const spinCh = yaw.map(y => Math.cos(y));

  // ---- body-local channels
  const headRoll = [], headXs = [], headYs = [], armLs = [], armRs = [], legLs = [], legRs = [];
  const raw = { hx: [], hy: [], hh: [] };
  for (let k = 0; k < len; k++) {
    const Q = W[k];
    const e = loc(Q.leftEye.clone().sub(Q.rightEye), k);
    headRoll.push(-Math.atan2(e.y, e.x) * DEG);
    const L = sgnS[k] * rotCh[k] / DEG;                                     // lean in the body-local frame
    const cL = Math.cos(L), sL = Math.sin(L);
    const unTilt = (d) => V(d.x * cL - d.y * sL, d.x * sL + d.y * cL, d.z);
    const hv = loc(Q.head.clone().sub(Q.neck), k); const hvu = unTilt(hv);
    raw.hx.push(hvu.x); raw.hy.push(hvu.y);
    raw.hh.push(loc(Q.head.clone().sub(Q.hip), k).y);
    // human RIGHT limbs are SCREEN-LEFT (armL/legL, sgn -1); human LEFT limbs are screen-right (armR/legR, sgn +1)
    armLs.push(clamp(raiseOf(unTilt(dirLoc('rShldr', 'rForeArm', k)), -1), -120, 185));
    armRs.push(clamp(raiseOf(unTilt(dirLoc('lShldr', 'lForeArm', k)), +1), -120, 185));
    legLs.push(clamp(raiseOf(unTilt(dirLoc('rThigh', 'rShin', k)), -1), -55, 55));
    legRs.push(clamp(raiseOf(unTilt(dirLoc('lThigh', 'lShin', k)), +1), -55, 55));
  }
  const hxMed = median(raw.hx), hyMed = median(raw.hy), hhMed = median(raw.hh);
  const rollMed = median(headRoll);
  const headRotCh = headRoll.map((a, k) => clamp(a - rollMed - sgnS[k] * rotCh[k], -40, 40));
  const headXCh = raw.hx.map(v => clamp((v - hxMed) * PU, -12, 12));
  const headYCh = raw.hy.map((v, k) => clamp(-((v - hyMed) + 0.5 * (raw.hh[k] - hhMed)) * PU, -10, 10));

  // ---- feet: raise relative to the lowest foot position, minus whatever the hips already rose
  const footMin = { l: Math.min(...W.map(Q => Q.lFoot.y)), r: Math.min(...W.map(Q => Q.rFoot.y)) };
  const liftOf = (foot, mn, k) => -clamp(((W[k][foot].y - mn) - Math.max(0, hipH[k] - hipMed)) * PU * 0.9, 0, 40);
  const liftLCh = W.map((_, k) => liftOf('rFoot', footMin.r, k));          // screen-left = human right
  const liftRCh = W.map((_, k) => liftOf('lFoot', footMin.l, k));

  // ---- tail: follow-through of (lateral hip velocity, yaw rate, torso twist)
  const hipXs = smooth3(hipX);
  const latVel = lag(ddt(hipXs), 0.05);                                     // m/s, screen-right positive
  const yawU = []; { let off = 0; for (let k = 0; k < len; k++) { if (k) { const d = yaw[k] - yaw[k - 1]; if (d > Math.PI) off -= 2 * Math.PI; else if (d < -Math.PI) off += 2 * Math.PI; } yawU.push(yaw[k] + off); } }
  const yawRate = lag(ddt(smooth3(yawU)), 0.05);
  const twist = W.map((Q, k) => { const c = V(0, 0, 1).applyQuaternion(basis(P0(k).lShldr.clone().sub(P0(k).rShldr), P0(k).neck.clone().sub(P0(k).chest))).applyQuaternion(A); let t = Math.atan2(c.x, c.z) - yaw[k]; while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI; return t; });
  function P0(k) { return SS[start + k]; }
  const tailDrive = latVel.map((v, k) => clamp(60 * v + 5 * yawRate[k] - 30 * Math.sin(twist[k]), -45, 45));
  const tailCh = lag(tailDrive, 0.09);

  // ---- mane + squash
  const hipV = lag(ddt(smooth3(hipH)), 0.04);                               // m/s, up positive
  const headV = ddt(smooth3(W.map(Q => Q.head.y)));
  const headAcc = ddt(headV).map(Math.abs);
  const maneRaw = headV.map((v, k) => 0.1 + clamp(0.22 * Math.max(0, v) + 0.012 * headAcc[k] + 0.18 * Math.max(0, hipV[k]), 0, 0.9));
  const maneCh = lag(maneRaw, 0.04, 0.25).map(v => clamp(v, 0, 1));
  const squashCh = hipV.map(v => clamp(0.09 * v, -0.3, 0.3));

  // ---- assemble + light smoothing (not on spin; tail/mane/squash already filtered)
  const ch = {
    x: smooth3(xCh), y: smooth3(yCh), rot: smooth3(rotCh), spin: spinCh,
    headRot: smooth3(headRotCh), headX: smooth3(headXCh), headY: smooth3(headYCh),
    armL: smooth3(armLs), armR: smooth3(armRs), legL: smooth3(legLs), legR: smooth3(legRs),
    liftL: smooth3(liftLCh), liftR: smooth3(liftRCh), tail: tailCh, mane: maneCh, squash: squashCh,
  };
  // final clamps (smoothing can't exceed them, but keep the contract explicit)
  ch.armL = ch.armL.map(v => clamp(v, -120, 185)); ch.armR = ch.armR.map(v => clamp(v, -120, 185));

  // ---- analysis: energy (0..1) and beat period (identical to the 3D bake)
  const seg = sp.slice(start, start + len);
  const meanSpeed = seg.reduce((a, b) => a + b, 0) / seg.length;
  const energy = clamp((meanSpeed - 0.8) / 2.6, 0, 1);
  const sig = [];
  for (let k = 0; k < len; k++) { const P = S[start + k]; sig.push((P.hip.y * 1.2 + P.head.y * 0.6 + P.lHand.y * 0.5 + P.rHand.y * 0.5) / UNITS_PER_M); }
  const dsig = sig.map((v, i) => { let m = 0, c = 0; for (let j = Math.max(0, i - 45); j <= Math.min(sig.length - 1, i + 45); j++) { m += sig[j]; c++; } return v - m / c; });
  const ac = [];
  for (let lg = Math.round(0.2 * FPS); lg <= Math.round(1.7 * FPS); lg++) {
    let s = 0, e1 = 0, e2 = 0; for (let i = 0; i + lg < dsig.length; i++) { s += dsig[i] * dsig[i + lg]; e1 += dsig[i] ** 2; e2 += dsig[i + lg] ** 2; }
    ac.push([lg, s / Math.sqrt(e1 * e2 + 1e-9)]);
  }
  const peaks = ac.filter(([, c], i) => i > 0 && i < ac.length - 1 && c > ac[i - 1][1] && c >= ac[i + 1][1] && c > 0.05);
  const bestPk = peaks.reduce((m, x) => (x[1] > m[1] ? x : m), [Math.round(0.5 * FPS), 0]);
  const pickPk = peaks.find(([, c]) => c > bestPk[1] * 0.8) ?? bestPk;

  return { id, name: meta.name, styles: meta.styles, len, start, alignYaw, ch, duration: len / FPS, energy, beat: pickPk[0] / FPS, beatConf: clamp(pickPk[1], 0, 1) };
}

// ------------------------------------------------------------------ main
const stat = (a) => { let mn = Infinity, mx = -Infinity, s = 0; for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; s += v; } return `${mn.toFixed(1)}/${mx.toFixed(1)}/${(s / a.length).toFixed(1)}`; };
fs.mkdirSync(OUT, { recursive: true });
const per = CHANNELS.length;
const chunks = []; const index = []; let offset = 0;
for (const [id, meta] of Object.entries(CLIPS)) {
  if (!fs.existsSync(path.join(SRC, id + '.fbx'))) { console.log('skip (not downloaded):', id); continue; }
  let r; try { r = bake(id, meta); } catch (e) { console.log('FAIL', id, String(e.stack).split('\n').slice(0, 3).join(' | ')); continue; }
  const arr = new Int16Array(r.len * per);
  for (let k = 0; k < r.len; k++) CHANNELS.forEach((c, i) => { arr[k * per + i] = clamp(Math.round(r.ch[c.name][k] * c.scale), -32768, 32767); });
  chunks.push(Buffer.from(arr.buffer));
  index.push({ id: r.id, name: r.name, styles: r.styles, frames: r.len, duration: +r.duration.toFixed(2), energy: +r.energy.toFixed(2), beat: +r.beat.toFixed(3), beatConf: +r.beatConf.toFixed(2), offset, srcStart: r.start, alignYaw: +r.alignYaw.toFixed(4) });
  offset += arr.byteLength;
  const hi = (a) => (a.filter(v => v > 60).length / a.length * 100).toFixed(0);
  console.log(`${r.id.padEnd(7)} ${r.name.padEnd(26)} ${r.len}f ${r.duration.toFixed(1)}s energy ${r.energy.toFixed(2)} beat ${(60 / r.beat).toFixed(0)}bpm conf ${r.beatConf.toFixed(2)} | arms>60deg L ${hi(r.ch.armL)}% R ${hi(r.ch.armR)}%`);
  if (process.argv.includes('-v') || ['143_35', '60_01'].includes(id)) {
    for (const c of CHANNELS) console.log(`     ${c.name.padEnd(8)} min/max/mean ${stat(r.ch[c.name])}`);
  }
}
fs.writeFileSync(path.join(OUT, 'dances2d.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'dances2d.json'), JSON.stringify({
  fps: FPS, perFrame: per, channels: CHANNELS,
  credit: 'Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)',
  clips: index,
}, null, 1));
console.log(`wrote ${index.length} 2D dances, ${(offset / 1024).toFixed(0)} KB`);
