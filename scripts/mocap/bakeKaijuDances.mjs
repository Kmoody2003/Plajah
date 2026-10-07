// bakeKaijuDances — retarget CMU motion-capture dances onto the Chora / Reello kaiju skeleton.
//
//   node scripts/mocap/bakeKaijuDances.mjs
//
// IN : acquisitions/motion/cmu-fbx/*.fbx   (CMU Graphics Lab Motion Capture Database via the
//      gbionics/cmu-fbx mirror — "free for any use", credit: "Data from mocap.cs.cmu.edu (funded by
//      NSF EIA-0196217)". Raw FBX stay OUT of public/; only the baked result ships.)
//      public/models/mascots/chora.glb   (only the node/bone JSON chunk is read — no Draco needed)
// OUT: public/models/mascots/dances/dances.json + dances.bin
//
// Retarget method (rest-pose independent — the FBX "default pose" is NOT a T-pose, so we never use it):
//   • torso (hips / spine / chest / head): build an orthonormal basis from joint POSITIONS each frame
//     (pelvis: thigh line + hip→abdomen; chest: shoulder line + chest→neck; head: eye line + neck→head).
//     A T-pose-upright human gives the identity basis, and every kaiju torso bone has an identity rest
//     world rotation, so the basis is applied directly (yaw-aligned so frame 0 faces the kaiju's front).
//   • arms / hands / thighs: swing-only AIM — rotate the kaiju bone's rest axis onto the human limb
//     direction (shoulder→elbow drives arm_*, elbow→wrist drives hand_*, hip→knee drives leg_* at ~70%).
//   • tail: procedural follow-through from pelvis sway/yaw (a mocap human has no tail).
//   • hips translation: the horizontal travel is dropped (the dancer stays on their mark, a little sway
//     is kept), the vertical bob is scaled to the kaiju and clamped so the stubby legs never sink.
// Output frames hold LOCAL (parent-relative) quaternions for 14 bones + hips position at 30 fps, int16.
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const SRC = 'acquisitions/motion/cmu-fbx';
const GLB = 'public/models/mascots/chora.glb';
const OUT = 'public/models/mascots/dances';
const FPS = 30;
const MAX_SECONDS = 28;
const UNITS_PER_M = 8900;          // the FBX is ~0.1 mm units: a 1.75 m human spans ~15600 units
const KAIJU_SCALE = 0.42;          // human → chibi
const BONES = ['hips', 'spine', 'chest', 'head', 'arm_L', 'arm_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R', 'tail_1', 'tail_2', 'tail_3', 'tail_4'];

// id → { name, styles, (optional) window [start,end] seconds }
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

// ------------------------------------------------------------------ kaiju rest (from the GLB JSON chunk)
function readGlbJson(file) {
  const b = fs.readFileSync(file);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
}
function kaijuRest() {
  const j = readGlbJson(GLB);
  const objs = j.nodes.map(n => {
    const o = new T.Object3D(); o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    return o;
  });
  j.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const top = objs[j.scenes[0].nodes[0]];
  top.updateMatrixWorld(true);
  const byName = {}; objs.forEach(o => { byName[o.name] = o; });
  const tails = j.nodes.find(n => n.extras?.spring_tails).extras.spring_tails;
  const rest = {};
  for (const name of BONES) {
    const o = byName[name]; const head = o.getWorldPosition(new T.Vector3());
    const t = tails[name]; const tail = new T.Vector3(t[0], t[2], -t[1]);       // Blender Z-up → glTF Y-up
    rest[name] = { obj: o, parent: o.parent.name, head, axis: tail.sub(head).normalize(), q: o.getWorldQuaternion(new T.Quaternion()), local: o.quaternion.clone(), pos: o.position.clone() };
  }
  return rest;
}

// ------------------------------------------------------------------ helpers
const V = (x, y, z) => new T.Vector3(x, y, z);
function basis(lateral, up) {
  const x = lateral.clone().normalize();
  const y = up.clone().sub(x.clone().multiplyScalar(up.dot(x))).normalize();
  const z = new T.Vector3().crossVectors(x, y).normalize();
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
}
const slerp = (a, b, t) => a.clone().slerp(b, t);
const aim = (from, to) => new T.Quaternion().setFromUnitVectors(from, to);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ------------------------------------------------------------------ bake one clip
function bake(id, meta, rest) {
  const buf = fs.readFileSync(path.join(SRC, id + '.fbx'));
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = root.animations[0];
  const mixer = new T.AnimationMixer(root); mixer.clipAction(clip).play();
  const get = n => root.getObjectByName(n);
  const need = ['hip', 'abdomen', 'chest', 'neck', 'head', 'lShldr', 'lForeArm', 'lHand', 'rShldr', 'rForeArm', 'rHand', 'lThigh', 'lShin', 'rThigh', 'rShin', 'lCollar', 'rCollar', 'leftEye', 'rightEye'];
  const J = {}; for (const n of need) { J[n] = get(n); if (!J[n]) throw new Error(`${id}: missing joint ${n}`); }
  const p = n => J[n].getWorldPosition(new T.Vector3());

  const dur = clip.duration;
  const n = Math.floor(dur * FPS);
  // ---- pass 1: sample the human
  const S = [];
  for (let i = 0; i < n; i++) {
    mixer.setTime(i / FPS); root.updateMatrixWorld(true);
    const P = {}; for (const k of need) P[k] = p(k);
    S.push(P);
  }
  if (S.length > 2) S[0] = S[1];                    // frame 0 is the T-pose calibration frame

  // window: pick the most energetic MAX_SECONDS span for long clips
  const speed = (i) => { const a = S[i], b = S[Math.min(n - 1, i + 1)]; let s = 0; for (const k of ['lHand', 'rHand', 'head', 'hip']) s += a[k].distanceTo(b[k]); return s * FPS / UNITS_PER_M; };
  const sp = Array.from({ length: n }, (_, i) => speed(i));
  let start = 0, len = n;
  const maxN = Math.floor(MAX_SECONDS * FPS);
  if (n > maxN) {
    let best = -1, cur = 0; for (let i = 0; i < maxN; i++) cur += sp[i];
    best = cur; start = 0;
    for (let i = 1; i + maxN <= n; i++) { cur += sp[i + maxN - 1] - sp[i - 1]; if (cur > best) { best = cur; start = i; } }
    len = maxN;
  }
  if (meta.window) { start = Math.floor(meta.window[0] * FPS); len = Math.min(n - start, Math.floor((meta.window[1] - meta.window[0]) * FPS)); }
  // alignment: CMU frame 0 is a T-pose calibration frame (and a dance rarely faces the way the capture began), so
  // take the circular-mean pelvis heading of the chosen window and rotate the whole frame so the dance faces +Z
  // (towards the camera). NB the torso bases are absolute orientations, so the frame rotation is a LEFT multiply.
  const pel = (P) => basis(P.lThigh.clone().sub(P.rThigh), P.abdomen.clone().sub(P.hip));
  let hx = 0, hz = 0; for (let k = start; k < start + len; k++) { const fw = V(0, 0, 1).applyQuaternion(pel(S[k])); hx += fw.x; hz += fw.z; }
  const A = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.atan2(hx, hz)), Ai = A.clone().invert(); void Ai;
  const world = (q) => A.clone().multiply(q);                                       // basis in the aligned frame
  const dirA = (a, b) => b.clone().sub(a).normalize().applyQuaternion(A);

  // ---- pass 2: retarget
  const gains = { leg: 0.7, head: 0.9 };
  const frames = [];       // per frame: { q: Quaternion[14], pos: Vector3 }
  const hipsH = S.map(P => P.hip.y / UNITS_PER_M);
  const hipsBase = [...hipsH.slice(start, start + len)].sort((a, b) => a - b)[Math.floor(len * 0.5)];
  const baseHip = S.slice(start, start + len).reduce((acc, P) => acc.add(P.hip), V(0, 0, 0)).multiplyScalar(1 / len);
  // tail follow-through state
  const tailAng = [0, 0, 0, 0]; let prevYaw = null, prevLat = 0, latVel = 0;
  let yawUnwrap = 0, lastYawRaw = 0;
  for (let k = 0; k < len; k++) {
    const P = S[start + k];
    const Rp = world(pel(P));
    const Rc = world(basis(P.lShldr.clone().sub(P.rShldr), P.neck.clone().sub(P.chest)));
    const eyeMid = P.leftEye.clone().add(P.rightEye).multiplyScalar(0.5);
    const Rh = world(basis(P.leftEye.clone().sub(P.rightEye), P.head.clone().sub(P.neck)));
    void eyeMid;
    const W = {};          // new world rotations for the kaiju bones
    W.hips = Rp.clone();
    W.chest = Rc.clone();
    W.spine = slerp(Rp, Rc, 0.5);
    W.head = slerp(new T.Quaternion(), Rh, gains.head);
    // arms
    const armDir = (s, e) => { const d = dirA(P[s], P[e]); return d; };
    const dL1 = armDir('lShldr', 'lForeArm'), dL2 = armDir('lForeArm', 'lHand');
    const dR1 = armDir('rShldr', 'rForeArm'), dR2 = armDir('rForeArm', 'rHand');
    // chibi arms are short and the head is huge — keep a little forward bias so hands don't vanish inside the ruff
    const bias = (d) => d.clone().lerp(V(0, 0, 1), 0.12).normalize();
    W.arm_L = aim(rest.arm_L.axis, bias(dL1)).multiply(rest.arm_L.q);
    W.arm_R = aim(rest.arm_R.axis, bias(dR1)).multiply(rest.arm_R.q);
    // hands are children of the arms: aim from the arm's NEW world axis frame (rest axis carried by rotation)
    const handAxisL = rest.hand_L.axis.clone().applyQuaternion(W.arm_L.clone().multiply(rest.arm_L.q.clone().invert()));
    const handAxisR = rest.hand_R.axis.clone().applyQuaternion(W.arm_R.clone().multiply(rest.arm_R.q.clone().invert()));
    W.hand_L = aim(handAxisL, bias(dL2)).multiply(W.arm_L.clone().multiply(rest.arm_L.q.clone().invert())).multiply(rest.hand_L.q);
    W.hand_R = aim(handAxisR, bias(dR2)).multiply(W.arm_R.clone().multiply(rest.arm_R.q.clone().invert())).multiply(rest.hand_R.q);
    // legs: the thigh's swing away from straight-down, applied to the kaiju leg's rest orientation
    const down = V(0, -1, 0);
    const legSwing = (a, b) => {
      let q = aim(down, dirA(P[a], P[b]));
      const ang = 2 * Math.acos(clamp(q.w, -1, 1)); const lim = 1.35;
      if (ang > lim) q = new T.Quaternion().slerpQuaternions(new T.Quaternion(), q, lim / ang);
      return slerp(new T.Quaternion(), q, gains.leg);
    };
    W.leg_L = legSwing('lThigh', 'lShin').multiply(rest.leg_L.q);
    W.leg_R = legSwing('rThigh', 'rShin').multiply(rest.leg_R.q);
    // tail: follow-through driven by pelvis yaw vs. chest yaw and lateral hip motion
    const fwd = V(0, 0, 1).applyQuaternion(Rp); const yaw = Math.atan2(fwd.x, fwd.z);
    let dy = yaw - lastYawRaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI; yawUnwrap += k ? dy : 0; lastYawRaw = yaw;
    const lat = (P.hip.x - baseHip.x) / UNITS_PER_M;           // raw lateral (world) — only used as a driver
    latVel += (((lat - prevLat) * FPS) - latVel) * 0.25; prevLat = lat;
    const yawRate = prevYaw == null ? 0 : dy * FPS; prevYaw = yaw;
    const fwdC = V(0, 0, 1).applyQuaternion(Rc); const twist = Math.atan2(fwdC.x, fwdC.z) - yaw;
    const drive = clamp(-0.35 * yawRate - 0.5 * latVel + 0.9 * Math.sin(twist), -0.9, 0.9);
    const dt = 1 / FPS; let upstream = drive;
    for (let i = 0; i < 4; i++) { const tau = 0.07 + 0.05 * i; tailAng[i] += (upstream - tailAng[i]) * (1 - Math.exp(-dt / tau)); upstream = tailAng[i]; }
    const tailBend = [0.5, 0.45, 0.4, 0.35];
    let cum = 0;
    for (let i = 0; i < 4; i++) {
      cum += tailAng[i] * tailBend[i];
      const nm = 'tail_' + (i + 1);
      W[nm] = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), cum).multiply(rest[nm].q);
    }
    // ---- world → local (parent-relative), in chain order
    const L = {};
    const worldOf = {}; const root0 = new T.Quaternion();
    for (const nm of BONES) {
      const par = rest[nm].parent;
      const pq = par === 'root' ? root0 : (worldOf[par] ?? rest[par]?.q ?? root0);
      L[nm] = pq.clone().invert().multiply(W[nm]);
      worldOf[nm] = W[nm];
    }
    // tails: tail_1's parent is hips, then chained
    // hips translation
    const dx = clamp((P.hip.x - baseHip.x) / UNITS_PER_M * KAIJU_SCALE * 0.5, -0.06, 0.06);
    const dz = clamp((P.hip.z - baseHip.z) / UNITS_PER_M * KAIJU_SCALE * 0.5, -0.06, 0.06);
    const dyv = clamp((hipsH[start + k] - hipsBase) * KAIJU_SCALE * 1.5, -0.035, 0.36);
    const sway = V(dx, 0, dz).applyQuaternion(A);                                  // into the kaiju's facing frame
    const pos = rest.hips.pos.clone().add(V(sway.x, dyv, sway.z));
    frames.push({ L, pos });
  }
  // continuity of quaternion hemispheres
  for (const nm of BONES) for (let k = 1; k < frames.length; k++) { if (frames[k].L[nm].dot(frames[k - 1].L[nm]) < 0) { const q = frames[k].L[nm]; q.set(-q.x, -q.y, -q.z, -q.w); } }
  // light temporal smoothing (mocap jitter) — 3-tap on every quaternion
  const sm = frames.map(f => ({ L: Object.fromEntries(BONES.map(b => [b, f.L[b].clone()])), pos: f.pos.clone() }));
  for (let k = 1; k < frames.length - 1; k++) for (const nm of BONES) { const q = sm[k].L[nm]; q.x = (frames[k - 1].L[nm].x + 2 * q.x + frames[k + 1].L[nm].x) / 4; q.y = (frames[k - 1].L[nm].y + 2 * q.y + frames[k + 1].L[nm].y) / 4; q.z = (frames[k - 1].L[nm].z + 2 * q.z + frames[k + 1].L[nm].z) / 4; q.w = (frames[k - 1].L[nm].w + 2 * q.w + frames[k + 1].L[nm].w) / 4; q.normalize(); }

  // ---- analysis: energy (0..1) and beat period
  const seg = sp.slice(start, start + len);
  const meanSpeed = seg.reduce((a, b) => a + b, 0) / seg.length;
  const energy = clamp((meanSpeed - 0.8) / 2.6, 0, 1); console.log('   meanSpeed', meanSpeed.toFixed(2));
  const sig = []; // vertical motion of hips + wrists + head, detrended
  for (let k = 0; k < len; k++) { const P = S[start + k]; sig.push((P.hip.y * 1.2 + P.head.y * 0.6 + P.lHand.y * 0.5 + P.rHand.y * 0.5) / UNITS_PER_M); }
  const mean = sig.reduce((a, b) => a + b, 0) / sig.length;
  const dsig = sig.map((v, i) => { let m = 0, c = 0; for (let j = Math.max(0, i - 45); j <= Math.min(sig.length - 1, i + 45); j++) { m += sig[j]; c++; } return v - m / c; });
  const ac = [];
  for (let lag = Math.round(0.2 * FPS); lag <= Math.round(1.7 * FPS); lag++) {
    let s = 0, e1 = 0, e2 = 0; for (let i = 0; i + lag < dsig.length; i++) { s += dsig[i] * dsig[i + lag]; e1 += dsig[i] ** 2; e2 += dsig[i + lag] ** 2; }
    ac.push([lag, s / Math.sqrt(e1 * e2 + 1e-9)]);
  }
  // local maxima only (smooth signals correlate trivially at tiny lags); prefer the fastest strong repeat
  const peaks = ac.filter(([, c], i) => i > 0 && i < ac.length - 1 && c > ac[i - 1][1] && c >= ac[i + 1][1] && c > 0.05);
  const bestPk = peaks.reduce((m, x) => (x[1] > m[1] ? x : m), [Math.round(0.5 * FPS), 0]);
  const pickPk = peaks.find(([, c]) => c > bestPk[1] * 0.8) ?? bestPk;
  const lagPick = pickPk[0], peak = pickPk[1];

  return { id, name: meta.name, styles: meta.styles, frames: sm, duration: len / FPS, energy, beat: lagPick / FPS, beatConf: clamp(peak, 0, 1) };
}

// ------------------------------------------------------------------ main
const rest = kaijuRest();
fs.mkdirSync(OUT, { recursive: true });
const per = BONES.length * 4 + 3;
const chunks = []; const index = []; let offset = 0;
for (const [id, meta] of Object.entries(CLIPS)) {
  if (!fs.existsSync(path.join(SRC, id + '.fbx'))) { console.log('skip (not downloaded):', id); continue; }
  let r; try { r = bake(id, meta, rest); } catch (e) { console.log('FAIL', id, String(e.stack).split(String.fromCharCode(10)).slice(0, 3).join(' | ')); continue; }
  const arr = new Int16Array(r.frames.length * per);
  r.frames.forEach((f, k) => {
    let o = k * per;
    BONES.forEach(b => { const q = f.L[b]; arr[o++] = Math.round(q.x * 32767); arr[o++] = Math.round(q.y * 32767); arr[o++] = Math.round(q.z * 32767); arr[o++] = Math.round(q.w * 32767); });
    arr[o++] = Math.round(f.pos.x * 4000); arr[o++] = Math.round(f.pos.y * 4000); arr[o++] = Math.round(f.pos.z * 4000);
  });
  chunks.push(Buffer.from(arr.buffer));
  index.push({ id: r.id, name: r.name, styles: r.styles, frames: r.frames.length, duration: +r.duration.toFixed(2), energy: +r.energy.toFixed(2), beat: +r.beat.toFixed(3), beatConf: +r.beatConf.toFixed(2), offset });
  offset += arr.byteLength;
  console.log(r.id.padEnd(7), r.name.padEnd(26), `${r.duration.toFixed(1)}s`.padStart(6), 'energy', r.energy.toFixed(2), 'beat', (60 / r.beat).toFixed(0) + 'bpm', 'conf', r.beatConf.toFixed(2));
}
fs.writeFileSync(path.join(OUT, 'dances.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'dances.json'), JSON.stringify({
  fps: FPS, bones: BONES, perFrame: per, posScale: 4000, quatScale: 32767,
  credit: 'Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)',
  clips: index,
}, null, 1));
console.log(`wrote ${index.length} dances, ${(offset / 1024).toFixed(0)} KB`);
