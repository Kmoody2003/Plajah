// bakeKaijuDancesV2 — retarget CMU motion capture onto the NEW rigged Chora / Reello (public/models/mascots/v2/*.glb).
//
//   node scripts/mocap/bakeKaijuDancesV2.mjs [chora|reello] [--only=id,id]
//
// IN : acquisitions/motion/cmu-fbx/*.fbx   (CMU Graphics Lab Motion Capture Database via the gbionics/cmu-fbx mirror —
//      "free for any use", credit: "Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)". Raw FBX stay out of public/.)
//      public/models/mascots/v2/{chora,reello}.glb  (only the node/bone JSON chunk is read — the mesh is Draco, not decoded)
//      scripts/mocap/v2_foot_soles.json              (sole contact points, made by scripts/mocap/v2_foot_soles.py)
// OUT: public/models/mascots/v2/dances/{chora,reello}/dances.{json,bin}    (same format as the v1 dances.json/bin,
//      + optional extra fields, see public/models/mascots/v2/dances/README.md)
//
// This is bakeKaijuDances.mjs (read its header for the rest-pose-independent retarget method: torso bases from joint
// positions, swing-only aim for the limbs, procedural tail) adapted to the v2 skeleton, plus:
//   • foot_L / foot_R are baked (16 bones). Foot world rotation = the human foot's rotation from its frame-0 T-pose
//     (a flat, forward-facing foot) applied on the kaiju foot's rest rotation, so a planted foot stays flat and swings
//     toe-up / toe-down with the gait.
//   • ground contact: the posed sole points of the REAL v2 foot meshes are forward-kinematics'd every frame. Dances
//     never sink (hips y = max(old scaled bob, height that puts the lowest sole point on the floor)). Locomotion
//     rides the contact exactly (lowest sole point == floor, so the planted foot cannot slide vertically) and adds the
//     scaled flight height for runs.
//   • locomotion (walk / run / turn / stand / idle): treadmill — horizontal hips travel removed (small sway kept),
//     legs aim hip→ankle (so foot trajectories survive the stubby legs) with an optional stride gain, loops are
//     found by minimising pose+velocity distance over 1–2 gait cycles and the last 6 frames are crossfaded into the
//     first (circular smoothing) so the loop is seamless. `speed` = measured planted ground speed of the baked
//     clip (m/s, kaiju world), `speedHuman` = the original hips speed × KAIJU_SCALE.
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const SRC = 'acquisitions/motion/cmu-fbx';
const GLBDIR = 'public/models/mascots/v2';
const OUT = 'public/models/mascots/v2/dances';
const SOLES = JSON.parse(fs.readFileSync('scripts/mocap/v2_foot_soles.json', 'utf8'));
const FPS = 30;
const MAX_SECONDS = 28;
const UNITS_PER_M = 8900;          // the FBX is ~0.1 mm units: a 1.75 m human spans ~15600 units
const KAIJU_SCALE = 0.42;          // human → chibi
const BLEND = 6;                   // loop crossfade frames
const BONES = ['hips', 'spine', 'chest', 'head', 'arm_L', 'arm_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R', 'tail_1', 'tail_2', 'tail_3', 'tail_4', 'foot_L', 'foot_R'];

// ------------------------------------------------------------------ dances (identical CLIPS table to bakeKaijuDances.mjs)
const DANCES = {
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

// ------------------------------------------------------------------ locomotion + stands (new)
// kind: walk | run | turn | stand | idle; gait: how the legs/ground are treated (walk: no flight, run: flight height kept)
// loop: { cyc: [min,max] seconds of ONE cycle, tries 1 then 2 cycles } or { win: [min,max] seconds } for stands.
const LOCO = {
  '02_01': { name: 'Walk — easy', kind: 'walk', gait: 'walk', loop: { cyc: [0.85, 1.5], minSpeed: 0.8 }, legGain: 1.25 },
  '08_01': { name: 'Walk — brisk', kind: 'walk', gait: 'walk', loop: { cyc: [0.7, 1.3], minSpeed: 1.0 }, legGain: 1.25 },
  '09_01': { name: 'Run', kind: 'run', gait: 'run', loop: { cyc: [0.5, 0.95], minSpeed: 2.0 }, legGain: 1.2 },
  '09_02': { name: 'Jog', kind: 'run', gait: 'run', loop: { cyc: [0.5, 0.95], minSpeed: 2.0 }, legGain: 1.2 },
  '102_01': { name: 'Run turn — right, wide', kind: 'turn', gait: 'run', align: 'start', legGain: 1.2, trim: [1, null] },
  '102_02': { name: 'Run turn — left, wide', kind: 'turn', gait: 'run', align: 'start', legGain: 1.2, trim: [1, null] },
  '102_33': { name: 'Run turn — right, tight', kind: 'turn', gait: 'run', align: 'start', legGain: 1.2, trim: [1, null] },
  '104_06': { name: 'Jog start', kind: 'run', role: 'start', gait: 'run', align: 'start', legGain: 1.2, trim: [1, null] },
  '104_09': { name: 'Jog stop', kind: 'run', role: 'stop', gait: 'run', align: 'start', legGain: 1.2, trim: [1, null] },
  '137_26': { name: 'Stand — calm', kind: 'stand', gait: 'walk', loop: { win: [4.5, 6.5] }, legGain: 1.0 },
  '137_28': { name: 'Wait — weight shifts', kind: 'idle', gait: 'walk', loop: { win: [3, 5] }, legGain: 1.0 },
  '137_29': { name: 'Walk — normal', kind: 'walk', gait: 'walk', loop: { cyc: [0.85, 1.5], minSpeed: 0.9 }, legGain: 1.25 },
};

// ------------------------------------------------------------------ kaiju rest (from the GLB JSON chunk)
function readGlbJson(file) {
  const b = fs.readFileSync(file);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
}
function kaijuRest(who) {
  const j = readGlbJson(path.join(GLBDIR, who + '.glb'));
  const objs = j.nodes.map(n => {
    const o = new T.Object3D(); o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  j.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const top = objs[j.scenes[0].nodes[0]];
  top.updateMatrixWorld(true);
  const byName = {}; objs.forEach(o => { byName[o.name] = o; });
  const tails = j.nodes.find(n => n.extras?.spring_tails).extras.spring_tails;
  const rest = { __top: top, __who: who };
  for (const name of BONES) {
    const o = byName[name]; const head = o.getWorldPosition(new T.Vector3());
    const t = tails[name]; const tail = new T.Vector3(t[0], t[2], -t[1]);       // Blender Z-up → glTF Y-up
    rest[name] = { obj: o, parent: o.parent.name, head, axis: tail.sub(head).normalize(), q: o.getWorldQuaternion(new T.Quaternion()), local: o.quaternion.clone(), pos: o.position.clone() };
  }
  for (const f of ['foot_L', 'foot_R']) {
    rest[f].invWorld = rest[f].obj.matrixWorld.clone().invert();
    rest[f].sole = SOLES[who][f].sole.map(p => new T.Vector3(...p));
  }
  return rest;
}

// forward kinematics: pose the kaiju (16 baked bones + hips position), return posed sole points per foot
function fkSoles(rest, L, hipsPos) {
  for (const nm of BONES) rest[nm].obj.quaternion.copy(L[nm]);
  rest.hips.obj.position.copy(hipsPos);
  rest.__top.updateMatrixWorld(true);
  const out = {};
  for (const f of ['foot_L', 'foot_R']) {
    const D = rest[f].obj.matrixWorld.clone().multiply(rest[f].invWorld);
    out[f] = rest[f].sole.map(p => p.clone().applyMatrix4(D));
  }
  return out;
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
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const NEED = ['hip', 'abdomen', 'chest', 'neck', 'head', 'lShldr', 'lForeArm', 'lHand', 'rShldr', 'rForeArm', 'rHand', 'lThigh', 'lShin', 'rThigh', 'rShin', 'lCollar', 'rCollar', 'leftEye', 'rightEye', 'lFoot', 'rFoot'];

function loadFbx(id) {
  const buf = fs.readFileSync(path.join(SRC, id + '.fbx'));
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = root.animations[0];
  const mixer = new T.AnimationMixer(root); mixer.clipAction(clip).play();
  const J = {}; for (const n of NEED) { J[n] = root.getObjectByName(n); if (!J[n]) throw new Error(`${id}: missing joint ${n}`); }
  const FQ0 = {};
  mixer.setTime(0); root.updateMatrixWorld(true);
  for (const k of ['lFoot', 'rFoot']) FQ0[k] = J[k].getWorldQuaternion(new T.Quaternion());
  const n = Math.floor(clip.duration * FPS);
  const S = [], FQ = [];
  for (let i = 0; i < n; i++) {
    mixer.setTime(i / FPS); root.updateMatrixWorld(true);
    const P = {}; for (const k of NEED) P[k] = J[k].getWorldPosition(new T.Vector3());
    S.push(P);
    FQ.push({ lFoot: J.lFoot.getWorldQuaternion(new T.Quaternion()), rFoot: J.rFoot.getWorldQuaternion(new T.Quaternion()) });
  }
  if (S.length > 2) { S[0] = S[1]; FQ[0] = FQ[1]; }          // frame 0 is the T-pose calibration frame
  return { S, FQ, FQ0, n, dur: clip.duration };
}
const pelBasis = (P) => basis(P.lThigh.clone().sub(P.rThigh), P.abdomen.clone().sub(P.hip));
const headingOf = (P) => { const fw = V(0, 0, 1).applyQuaternion(pelBasis(P)); return Math.atan2(fw.x, fw.z); };

// ------------------------------------------------------------------ loop finder (locomotion / stands)
function features(S, h) {
  const joints = ['lFoot', 'rFoot', 'lHand', 'rHand', 'head', 'lShin', 'rShin'];
  return S.map((P, i) => {
    const f = []; const c = Math.cos(h[i]), s = Math.sin(h[i]);
    for (const j of joints) {
      const d = P[j].clone().sub(P.hip).multiplyScalar(1 / UNITS_PER_M);
      // rotate by -heading about Y so the features are in the pelvis frame
      f.push(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
    }
    f.push(P.hip.y / UNITS_PER_M);
    return f;
  });
}
function findLoop(S, h, spec, kind) {
  const n = S.length; const F = features(S, h);
  const vel = F.map((f, i) => f.map((x, k) => (F[Math.min(n - 1, i + 1)][k] - F[Math.max(0, i - 1)][k]) * FPS / 2));
  const rms = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2; return Math.sqrt(s / a.length); };
  const hipH = S.map(P => P.hip.clone());
  const cost = (s, L) => {
    const dp = rms(F[s], F[s + L]), dv = rms(vel[s], vel[s + L]);
    const dh = Math.abs(wrapPi(h[s + L] - h[s]));
    // mean over the window also checks the loop is not just a coincidence of two end frames
    let mid = 0, cnt = 0;
    for (let k = 1; k < L; k += 3) { mid += rms(F[s + k], F[s + ((k + L / 2) | 0) % L]) * 0; cnt++; }
    let c = dp + 0.1 * dv + 1.0 * dh;
    if (spec.minSpeed) { const nt = hipH[s + L].clone().sub(hipH[s]); nt.y = 0; const spd = nt.length() / UNITS_PER_M / (L / FPS); if (spd < spec.minSpeed) c += 10; }
    if (kind === 'stand' || kind === 'idle') {
      // calm: no net travel, little heading wander, little foot stepping around
      let dev = 0, tr = 0; for (let k = 0; k < L; k += 3) { dev = Math.max(dev, Math.abs(wrapPi(h[s + k] - h[s]))); }
      const net = hipH[s + L].clone().sub(hipH[s]); net.y = 0; tr = net.length() / UNITS_PER_M;
      let path_ = 0; for (let k = 0; k < L; k += 2) { const d = hipH[s + k + 2 > s + L ? s + L : s + k + 2].clone().sub(hipH[s + k]); d.y = 0; path_ += d.length() / UNITS_PER_M; }
      c += 2.0 * dev + (dev > 0.3 ? 5 : 0) + 1.0 * tr + 0.25 * path_ / (L / FPS);
    }
    void mid; void cnt;
    return c;
  };
  const cands = [];
  const lo = 2, hi = n - 2;
  const tryRange = (Lmin, Lmax, margin) => {
    let best = null;
    for (let L = Math.round(Lmin * FPS); L <= Math.round(Lmax * FPS); L++) {
      for (let s = lo; s + L + margin <= hi; s++) {
        const c = cost(s, L);
        if (!best || c < best.c) best = { s, L, c, after: true };
      }
      // "before" variant: crossfade with the frames preceding the window
      for (let s = lo + margin; s + L <= hi; s++) {
        const c = cost(s, L);
        if (!best || c < best.c - 1e-9) best = { s, L, c, after: false };
      }
    }
    return best;
  };
  if (spec.cyc) {
    const b1 = tryRange(spec.cyc[0], spec.cyc[1], BLEND);
    const b2 = 2 * spec.cyc[1] * FPS + BLEND < n - 4 ? tryRange(spec.cyc[0] * 2, spec.cyc[1] * 2, BLEND) : null;
    cands.push({ ...b1, cycles: 1 });
    if (b2) cands.push({ ...b2, cycles: 2 });
    const pick = (b2 && b2.c < 0.6 * b1.c) ? cands[1] : cands[0];
    return pick;
  }
  const b = tryRange(spec.win[0], spec.win[1], BLEND);
  return { ...b, cycles: 1 };
}

// ------------------------------------------------------------------ bake one clip
function bake(id, meta, rest, who) {
  const loco = !!meta.kind && meta.kind !== 'dance';
  const { S, FQ, FQ0, n, dur } = loadFbx(id);
  const kind = meta.kind ?? 'dance';
  const hRaw = S.map(headingOf); for (let i = 1; i < n; i++) hRaw[i] = hRaw[i - 1] + wrapPi(hRaw[i] - hRaw[i - 1]);   // unwrapped
  const speedEst = (i) => { const a = S[i], b = S[Math.min(n - 1, i + 1)]; let s = 0; for (const k of ['lHand', 'rHand', 'head', 'hip']) s += a[k].distanceTo(b[k]); return s * FPS / UNITS_PER_M; };
  const sp = Array.from({ length: n }, (_, i) => speedEst(i));

  // ---- window
  let start = 0, len = n, loop = null;
  if (!loco) {
    const maxN = Math.floor(MAX_SECONDS * FPS);
    if (n > maxN) {
      let cur = 0; for (let i = 0; i < maxN; i++) cur += sp[i];
      let best = cur; start = 0;
      for (let i = 1; i + maxN <= n; i++) { cur += sp[i + maxN - 1] - sp[i - 1]; if (cur > best) { best = cur; start = i; } }
      len = maxN;
    }
    if (meta.window) { start = Math.floor(meta.window[0] * FPS); len = Math.min(n - start, Math.floor((meta.window[1] - meta.window[0]) * FPS)); }
  } else if (meta.loop) {
    loop = findLoop(S, hRaw, meta.loop, kind);
    start = loop.s; len = loop.L;
  } else {
    const t0 = meta.trim?.[0] ?? 1, t1 = meta.trim?.[1] ?? n - 1;
    start = t0; len = t1 - t0;
  }
  const isLoop = !!loop;
  // retarget range: window + crossfade margin
  const margin = isLoop ? BLEND : 0;
  const rs = isLoop && !loop.after ? start - margin : start;
  const re = isLoop && loop.after ? start + len + margin : start + len;      // exclusive

  // ---- alignment: the dance faces +Z (towards the camera); locomotion treadmill faces +Z too
  let hx = 0, hz = 0;
  const alignFrom = meta.align === 'start' ? [start, Math.min(start + 6, start + len)] : [start, start + len];
  for (let k = alignFrom[0]; k < alignFrom[1]; k++) { const fw = V(0, 0, 1).applyQuaternion(pelBasis(S[k])); hx += fw.x; hz += fw.z; }
  const A = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.atan2(hx, hz));
  const world = (q) => A.clone().multiply(q);
  const dirA = (a, b) => b.clone().sub(a).normalize().applyQuaternion(A);

  // ---- horizontal hips motion (human world) ----
  const hip = S.map(P => P.hip.clone().multiplyScalar(1 / UNITS_PER_M));
  const swayH = new Array(n).fill(null);
  if (!loco) {
    const baseHip = S.slice(start, start + len).reduce((acc, P) => acc.add(P.hip), V(0, 0, 0)).multiplyScalar(1 / len);
    for (let i = rs; i < re; i++) swayH[i] = V((S[i].hip.x - baseHip.x) / UNITS_PER_M, 0, (S[i].hip.z - baseHip.z) / UNITS_PER_M);
  } else if (isLoop) {
    const a = hip[start], b = hip[start + len];
    for (let i = rs; i < re; i++) { const t = (i - start) / len; swayH[i] = V(hip[i].x - a.x - (b.x - a.x) * t, 0, hip[i].z - a.z - (b.z - a.z) * t); }
  } else {
    const hw = 8;     // ~0.5 s box: removes the travel, keeps the per-step pelvis sway
    for (let i = rs; i < re; i++) {
      let mx = 0, mz = 0, c = 0; for (let j = Math.max(1, i - hw); j <= Math.min(n - 1, i + hw); j++) { mx += hip[j].x; mz += hip[j].z; c++; }
      swayH[i] = V(hip[i].x - mx / c, 0, hip[i].z - mz / c);
    }
  }

  // ---- retarget ---------------------------------------------------------------------------------------------------
  const gains = { leg: loco ? (meta.legGain ?? 1.0) : 0.7, head: 0.9, foot: 0.9 };
  const hipsH = S.map(P => P.hip.y / UNITS_PER_M);
  const hipsBase = [...hipsH.slice(start, start + len)].sort((a, b) => a - b)[Math.floor(len * 0.5)];
  const footMin = S.map(P => Math.min(P.lFoot.y, P.rFoot.y) / UNITS_PER_M);
  const footBase = [...footMin.slice(start, start + len)].sort((a, b) => a - b)[Math.floor(len * 0.1)];
  const raw = new Array(n).fill(null);
  const tailAng = [0, 0, 0, 0]; let prevYaw = null, prevLat = 0, latVel = 0, lastYawRaw = 0;
  const warm = Math.max(0, rs - 30);
  const swing = (q, lim) => { const ang = 2 * Math.acos(clamp(q.w, -1, 1)); return ang > lim ? new T.Quaternion().slerpQuaternions(new T.Quaternion(), q, lim / ang) : q; };
  for (let i = warm; i < re; i++) {
    const P = S[i];
    const Rp = world(pelBasis(P));
    const Rc = world(basis(P.lShldr.clone().sub(P.rShldr), P.neck.clone().sub(P.chest)));
    const Rh = world(basis(P.leftEye.clone().sub(P.rightEye), P.head.clone().sub(P.neck)));
    const W = {};
    W.hips = Rp.clone(); W.chest = Rc.clone(); W.spine = slerp(Rp, Rc, 0.5); W.head = slerp(new T.Quaternion(), Rh, gains.head);
    // arms (chibi arms are short and the head is huge — keep a little forward bias so hands don't vanish inside the ruff)
    const bias = (d) => d.clone().lerp(V(0, 0, 1), 0.12).normalize();
    const dL1 = dirA(P.lShldr, P.lForeArm), dL2 = dirA(P.lForeArm, P.lHand);
    const dR1 = dirA(P.rShldr, P.rForeArm), dR2 = dirA(P.rForeArm, P.rHand);
    W.arm_L = aim(rest.arm_L.axis, bias(dL1)).multiply(rest.arm_L.q);
    W.arm_R = aim(rest.arm_R.axis, bias(dR1)).multiply(rest.arm_R.q);
    const handAxisL = rest.hand_L.axis.clone().applyQuaternion(W.arm_L.clone().multiply(rest.arm_L.q.clone().invert()));
    const handAxisR = rest.hand_R.axis.clone().applyQuaternion(W.arm_R.clone().multiply(rest.arm_R.q.clone().invert()));
    W.hand_L = aim(handAxisL, bias(dL2)).multiply(W.arm_L.clone().multiply(rest.arm_L.q.clone().invert())).multiply(rest.hand_L.q);
    W.hand_R = aim(handAxisR, bias(dR2)).multiply(W.arm_R.clone().multiply(rest.arm_R.q.clone().invert())).multiply(rest.hand_R.q);
    // legs: dances = hip→knee at 70% (as v1); locomotion = hip→ankle so the foot trajectory survives the stubby leg
    const down = V(0, -1, 0);
    const legSwing = (a, b) => slerp(new T.Quaternion(), swing(aim(down, dirA(P[a], P[b])), 1.35), Math.min(1, gains.leg)).multiply(new T.Quaternion()).clone();
    const legSwingAmp = (a, b) => {
      let q = swing(aim(down, dirA(P[a], P[b])), loco ? 1.5 : 1.35);
      if (gains.leg <= 1) return slerp(new T.Quaternion(), q, gains.leg);
      const ang = 2 * Math.acos(clamp(q.w, -1, 1)); if (ang < 1e-6) return q;
      const ax = V(q.x, q.y, q.z).normalize();
      return new T.Quaternion().setFromAxisAngle(ax, Math.min(1.5, ang * gains.leg));
    };
    void legSwing;
    W.leg_L = legSwingAmp('lThigh', loco ? 'lFoot' : 'lShin').multiply(rest.leg_L.q);
    W.leg_R = legSwingAmp('rThigh', loco ? 'rFoot' : 'rShin').multiply(rest.leg_R.q);
    // feet: the human foot's rotation from its T-pose (flat) pose, yaw-aligned, applied on the kaiju foot's rest rotation
    const footW = (k) => { const d = FQ[i][k].clone().multiply(FQ0[k].clone().invert()); return slerp(new T.Quaternion(), world(d), gains.foot); };
    W.foot_L = footW('lFoot').multiply(rest.foot_L.q);
    W.foot_R = footW('rFoot').multiply(rest.foot_R.q);
    // tail: follow-through driven by pelvis yaw vs. chest yaw and lateral hip motion
    const fwd = V(0, 0, 1).applyQuaternion(Rp); const yaw = Math.atan2(fwd.x, fwd.z);
    let dy = wrapPi(yaw - lastYawRaw); lastYawRaw = yaw;
    const lat = (P.hip.x - S[warm].hip.x) / UNITS_PER_M;
    latVel += (((lat - prevLat) * FPS) - latVel) * 0.25; prevLat = lat;
    const yawRate = prevYaw == null ? 0 : dy * FPS; prevYaw = yaw;
    const fwdC = V(0, 0, 1).applyQuaternion(Rc); const twist = Math.atan2(fwdC.x, fwdC.z) - yaw;
    const drive = clamp(-0.35 * yawRate - 0.5 * latVel + 0.9 * Math.sin(wrapPi(twist)), -0.9, 0.9);
    const dt = 1 / FPS; let upstream = drive;
    for (let t = 0; t < 4; t++) { const tau = 0.07 + 0.05 * t; tailAng[t] += (upstream - tailAng[t]) * (1 - Math.exp(-dt / tau)); upstream = tailAng[t]; }
    const tailBend = [0.5, 0.45, 0.4, 0.35]; let cum = 0;
    for (let t = 0; t < 4; t++) { cum += tailAng[t] * tailBend[t]; W['tail_' + (t + 1)] = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), cum).multiply(rest['tail_' + (t + 1)].q); }
    // world → local
    const Lq = {}; const root0 = new T.Quaternion();
    for (const nm of BONES) {
      const par = rest[nm].parent;
      const pq = par === 'root' ? root0 : (W[par] ?? rest[par]?.q ?? root0);
      Lq[nm] = pq.clone().invert().multiply(W[nm]);
    }
    if (i < rs) continue;           // tail warm-up frames are not emitted
    // hips offsets
    const sw = swayH[i];
    const dx = clamp(sw.x * KAIJU_SCALE * 0.5, -0.06, 0.06), dz = clamp(sw.z * KAIJU_SCALE * 0.5, -0.06, 0.06);
    const sway = V(dx, 0, dz).applyQuaternion(A);
    const dyBob = clamp((hipsH[i] - hipsBase) * KAIJU_SCALE * 1.5, -0.035, 0.36);
    const air = gains && meta.gait === 'run' ? clamp((footMin[i] - footBase - 0.03) * KAIJU_SCALE * 1.2, 0, 0.08) : 0;
    const dlift = (P.lFoot.y - P.rFoot.y) / UNITS_PER_M * KAIJU_SCALE * (meta.liftGain ?? 1.0);
    raw[i] = { L: Lq, sx: sway.x, sz: sway.z, dyBob, air, dlift };
  }
  // hemisphere continuity across the emitted range
  for (const nm of BONES) for (let i = rs + 1; i < re; i++) { if (raw[i].L[nm].dot(raw[i - 1].L[nm]) < 0) { const q = raw[i].L[nm]; q.set(-q.x, -q.y, -q.z, -q.w); } }

  // ---- loop crossfade → final frames -----------------------------------------------------------------------------
  const mix = (fa, fb, t) => {
    const L = {}; for (const nm of BONES) L[nm] = fa.L[nm].clone().slerp(fb.L[nm], t);
    return { L, sx: fa.sx + (fb.sx - fa.sx) * t, sz: fa.sz + (fb.sz - fa.sz) * t, dyBob: fa.dyBob + (fb.dyBob - fa.dyBob) * t, air: fa.air + (fb.air - fa.air) * t, dlift: fa.dlift + (fb.dlift - fa.dlift) * t };
  };
  const fr = [];
  for (let k = 0; k < len; k++) {
    let f = raw[start + k];
    if (isLoop && loop.after && k < BLEND) f = mix(raw[start + len + k], raw[start + k], (k + 1) / (BLEND + 1));
    if (isLoop && !loop.after && k >= len - BLEND) f = mix(raw[start + k], raw[start + k - len], (k - (len - BLEND) + 1) / (BLEND + 1));
    fr.push({ L: Object.fromEntries(BONES.map(b => [b, f.L[b].clone()])), sx: f.sx, sz: f.sz, dyBob: f.dyBob, air: f.air, dlift: f.dlift });
  }
  // light temporal smoothing (3-tap, circular for loops)
  const idx = (k) => isLoop ? (k + len) % len : clamp(k, 0, len - 1);
  const sm = fr.map((f, k) => {
    const o = { L: {}, sx: 0, sz: 0, dyBob: 0, air: 0, dlift: 0 };
    const a = fr[idx(k - 1)], c = fr[idx(k + 1)];
    for (const nm of BONES) {
      const q = f.L[nm];
      const nq = new T.Quaternion((a.L[nm].x + 2 * q.x + c.L[nm].x) / 4, (a.L[nm].y + 2 * q.y + c.L[nm].y) / 4, (a.L[nm].z + 2 * q.z + c.L[nm].z) / 4, (a.L[nm].w + 2 * q.w + c.L[nm].w) / 4).normalize();
      o.L[nm] = nq;
    }
    for (const key of ['sx', 'sz', 'dyBob', 'air', 'dlift']) o[key] = (a[key] + 2 * f[key] + c[key]) / 4;
    return o;
  });
  // (circular-smoothed quats may flip hemisphere at the seam — fix pairwise)
  for (const nm of BONES) for (let k = 1; k < len; k++) { if (sm[k].L[nm].dot(sm[k - 1].L[nm]) < 0) { const q = sm[k].L[nm]; q.set(-q.x, -q.y, -q.z, -q.w); } }

  // ---- locomotion: pelvis roll lifts the swing foot ---------------------------------------------------------------
  // The kaiju legs are rigid and stubby (no knee), so the human's swing-foot lift cannot come from the leg. Instead the
  // pelvis rolls about its forward axis (children keep their world rotation) until the sole-height difference between
  // the feet matches the (scaled) human ankle-height difference — the weight-shift waddle of a chibi walk.
  const MAXROLL = 0.3;
  const applyRoll = (L, phi) => {
    if (Math.abs(phi) < 1e-9) return L;
    const out = { ...L }; const R = L.hips;
    const Rr = new T.Quaternion().setFromAxisAngle(V(0, 0, 1).applyQuaternion(R), phi);
    const conj = R.clone().invert().multiply(Rr.clone().invert()).multiply(R);
    out.hips = Rr.clone().multiply(R);
    for (const c of ['spine', 'leg_L', 'leg_R', 'tail_1']) out[c] = conj.clone().multiply(L[c]);
    return out;
  };
  let rollSeries = null;
  if (loco) {
    const diffAt = (f, phi) => { const so = fkSoles(rest, applyRoll(f.L, phi), rest.hips.pos.clone().add(V(f.sx, 0, f.sz))); return Math.min(...so.foot_L.map(p => p.y)) - Math.min(...so.foot_R.map(p => p.y)); };
    let phis = sm.map(f => {
      let p0 = 0, g0 = diffAt(f, p0) - f.dlift, p1 = 0.1, g1 = diffAt(f, p1) - f.dlift;
      for (let it = 0; it < 4 && Math.abs(g1) > 1e-4; it++) {
        if (Math.abs(p1 - p0) < 1e-9) break; const d = (g1 - g0) / (p1 - p0); if (!(Math.abs(d) > 1e-6)) break;
        const p2 = clamp(p1 - g1 / d, -MAXROLL, MAXROLL); p0 = p1; g0 = g1; p1 = p2; g1 = diffAt(f, p1) - f.dlift;
      }
      return p1;
    });
    phis = phis.map((_, k) => (phis[idx(k - 1)] + 2 * phis[k] + phis[idx(k + 1)]) / 4);
    sm.forEach((f, k) => { f.L = applyRoll(f.L, phis[k]); });
    rollSeries = phis;
    for (const nm of BONES) for (let k = 1; k < len; k++) { if (sm[k].L[nm].dot(sm[k - 1].L[nm]) < 0) { sm[k].L[nm] = sm[k].L[nm].clone(); const q = sm[k].L[nm]; q.set(-q.x, -q.y, -q.z, -q.w); } }
  }

  // ---- hips position: ground contact from the real foot meshes ------------------------------------------------------
  const frames = [];
  const clearance = [];       // per frame: { fL, fR, zL, zR }  (min sole height above the floor per foot, centre z)
  let sink = 0;
  for (let k = 0; k < len; k++) {
    const f = sm[k];
    const base = rest.hips.pos.clone().add(V(f.sx, 0, f.sz));
    const so = fkSoles(rest, f.L, base);
    const lowest = Math.min(...so.foot_L.map(p => p.y), ...so.foot_R.map(p => p.y));
    const ground = -lowest;                                  // raise (+) / lower (-) the hips so the lowest sole point is on the floor
    let dy;
    if (loco) dy = ground + f.air;
    else dy = Math.max(f.dyBob, ground);
    frames.push({ L: f.L, pos: base.clone().add(V(0, dy, 0)), ground, dyBob: f.dyBob });
  }
  if (loco) {         // smooth the contact-ride height a touch (foot swaps give kinks), keep loops circular
    const ys = frames.map(f => f.pos.y);
    frames.forEach((f, k) => { f.pos.y = Math.max((ys[idx(k - 1)] + 2 * ys[k] + ys[idx(k + 1)]) / 4, rest.hips.pos.y + f.ground); });
  }
  for (let k = 0; k < len; k++) {
    const f = frames[k];
    const so = fkSoles(rest, f.L, f.pos);
    const cl = (arr) => Math.min(...arr.map(p => p.y));
    const cz = (arr) => arr.reduce((a, p) => a + p.z, 0) / arr.length;
    clearance.push({ cL: cl(so.foot_L), cR: cl(so.foot_R), zL: cz(so.foot_L), zR: cz(so.foot_R) });
    if (Math.min(cl(so.foot_L), cl(so.foot_R)) < -0.004) sink++;
  }
  if (process.env.DBG === id) clearance.forEach((c, k) => console.log(k, 'cL', c.cL.toFixed(3), 'cR', c.cR.toFixed(3), 'zL', c.zL.toFixed(3), 'zR', c.zR.toFixed(3), 'hipsY', frames[k].pos.y.toFixed(3), 'ground', frames[k].ground.toFixed(3)));
  const minClear = Math.min(...clearance.map(c => Math.min(c.cL, c.cR)));

  // ---- analysis ----------------------------------------------------------------------------------------------------
  const out = { id, name: meta.name, styles: meta.styles ?? [], frames, duration: len / FPS, kind };
  const seg = sp.slice(start, start + len);
  const meanSpeed = seg.reduce((a, b) => a + b, 0) / seg.length;
  out.energy = clamp((meanSpeed - 0.8) / 2.6, 0, 1);
  const sig = [];
  for (let k = 0; k < len; k++) { const P = S[start + k]; sig.push((P.hip.y * 1.2 + P.head.y * 0.6 + P.lHand.y * 0.5 + P.rHand.y * 0.5) / UNITS_PER_M); }
  const dsig = sig.map((v, i) => { let m = 0, c = 0; for (let j = Math.max(0, i - 45); j <= Math.min(sig.length - 1, i + 45); j++) { m += sig[j]; c++; } return v - m / c; });
  const ac = [];
  for (let lag = Math.round(0.2 * FPS); lag <= Math.min(Math.round(1.7 * FPS), dsig.length - 4); lag++) {
    let s = 0, e1 = 0, e2 = 0; for (let i = 0; i + lag < dsig.length; i++) { s += dsig[i] * dsig[i + lag]; e1 += dsig[i] ** 2; e2 += dsig[i + lag] ** 2; }
    ac.push([lag, s / Math.sqrt(e1 * e2 + 1e-9)]);
  }
  const peaks = ac.filter(([, c], i) => i > 0 && i < ac.length - 1 && c > ac[i - 1][1] && c >= ac[i + 1][1] && c > 0.05);
  const bestPk = peaks.reduce((m, x) => (x[1] > m[1] ? x : m), [Math.round(0.5 * FPS), 0]);
  const pickPk = peaks.find(([, c]) => c > bestPk[1] * 0.8) ?? bestPk;
  out.beat = pickPk[0] / FPS; out.beatConf = clamp(pickPk[1], 0, 1);

  out.sinkFrames = sink; out.minClear = minClear;
  out.maxRollDeg = rollSeries ? Math.max(...rollSeries.map(Math.abs)) * 180 / Math.PI : 0;
  out.srcStart = +(start / FPS).toFixed(3);

  if (loco) {
    out.loop = isLoop; out.gait = meta.gait;
    if (meta.role) out.role = meta.role;
    // human ground speed (original hips travel × KAIJU_SCALE)
    let humanSpeed;
    if (isLoop) { const a = hip[start], b = hip[start + len]; const d = b.clone().sub(a); d.y = 0; humanSpeed = d.length() / (len / FPS); }
    else { let pathLen = 0; for (let i = start + 1; i < start + len; i++) { const d = hip[i].clone().sub(hip[i - 1]); d.y = 0; pathLen += d.length(); } humanSpeed = pathLen / (len / FPS); }
    out.speedHuman = humanSpeed * KAIJU_SCALE;
    // planted ground speed of the BAKED clip: speed of the foot that is on the floor (relative to the treadmill body)
    const vs = [];
    for (let k = 0; k < len - 1; k++) {
      const c0 = clearance[k], c1 = clearance[k + 1];
      for (const [cc, zz] of [['cL', 'zL'], ['cR', 'zR']]) if (c0[cc] < 0.004 && c1[cc] < 0.004) vs.push(-(c1[zz] - c0[zz]) * FPS);
    }
    vs.sort((a, b) => a - b);
    const med = vs.length ? vs[Math.floor(vs.length / 2)] : 0;
    const mad = vs.length ? [...vs.map(v => Math.abs(v - med))].sort((a, b) => a - b)[Math.floor(vs.length / 2)] : 0;
    out.plantSpeed = Math.max(0, isLoop ? med : (vs.length ? vs[Math.floor(vs.length * 0.75)] : 0)); out.plantSd = mad; out.plantFrames = vs.length;
    // planted speed in the first / last 0.5 s (start / stop / turn clips: the ramp the runtime should blend from/into)
    const wv = (a0, a1) => { const q = []; for (let k = a0; k < a1; k++) for (const [cc, zz] of [['cL', 'zL'], ['cR', 'zR']]) if (clearance[k][cc] < 0.004 && clearance[k + 1][cc] < 0.004) q.push(-(clearance[k + 1][zz] - clearance[k][zz]) * FPS); q.sort((x, y) => x - y); return q.length ? Math.max(0, q[Math.floor(q.length / 2)]) : 0; };
    const w5 = Math.min(15, Math.floor((len - 1) / 2)); out.plantStart = wv(0, w5); out.plantEnd = wv(len - 1 - w5, len - 1);
    if (['walk', 'run'].includes(kind) && isLoop) {
      const cycles = loop.cycles;
      out.cycleSec = len / FPS / cycles; out.cycles = cycles;
      out.beat = out.cycleSec / 2; out.beatConf = 0.9;
    }
    // heading → yawDeg (positive = counter-clockwise from above = toward the character's LEFT)
    const hs = (i) => { let m = 0, c = 0; for (let j = Math.max(1, i - 6); j <= Math.min(n - 1, i + 6); j++) { m += hRaw[j]; c++; } return m / c; };
    out.yawDeg = (hs(start + len - 1) - hs(start)) * 180 / Math.PI;
    // loop seam quality: angular step across the seam vs the typical step
    const angStep = (fa, fb) => { let s = 0; for (const nm of BONES) { const d = Math.abs(fa.L[nm].dot(fb.L[nm])); s += 2 * Math.acos(clamp(d, 0, 1)); } return s / BONES.length; };
    if (isLoop) {
      let typ = 0; for (let k = 1; k < len; k++) typ += angStep(frames[k - 1], frames[k]); typ /= len - 1;
      out.seamRatio = angStep(frames[len - 1], frames[0]) / Math.max(1e-6, typ);
      const dy0 = Math.abs(frames[len - 1].pos.y - frames[0].pos.y);
      out.seamDy = dy0; out.seamDeg = angStep(frames[len - 1], frames[0]) * 180 / Math.PI;
    }
    if (!isLoop) {
      const w = Math.round(0.4 * FPS); const sp0 = (a, b) => { let p = 0; for (let i = a + 1; i <= b; i++) { const d = hip[i].clone().sub(hip[i - 1]); d.y = 0; p += d.length(); } return p / ((b - a) / FPS) * KAIJU_SCALE; };
      out.speedStartHuman = sp0(start, Math.min(n - 1, start + w)); out.speedEndHuman = sp0(Math.max(start, start + len - 1 - w), start + len - 1);
    }
  }
  return out;
}

// ------------------------------------------------------------------ main
const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const whos = args.filter(a => !a.startsWith('--')).length ? args.filter(a => !a.startsWith('--')) : ['chora', 'reello'];
const per = BONES.length * 4 + 3;

for (const who of whos) {
  const rest = kaijuRest(who);
  const dir = path.join(OUT, who); fs.mkdirSync(dir, { recursive: true });
  const chunks = []; const index = []; let offset = 0;
  const table = [...Object.entries(DANCES).map(([id, m]) => [id, { ...m, kind: 'dance' }]), ...Object.entries(LOCO)];
  console.log(`\n=== ${who} ===`);
  for (const [id, meta] of table) {
    if (only.length && !only.includes(id)) continue;
    if (!fs.existsSync(path.join(SRC, id + '.fbx'))) { console.log('skip (not downloaded):', id); continue; }
    let r; try { r = bake(id, meta.kind === 'dance' ? { ...meta, kind: undefined } : meta, rest, who); } catch (e) { console.log('FAIL', id, String(e.stack).split('\n').slice(0, 4).join(' | ')); continue; }
    if (meta.kind === 'dance') r.kind = 'dance';
    const arr = new Int16Array(r.frames.length * per);
    r.frames.forEach((f, k) => {
      let o = k * per;
      BONES.forEach(b => { const q = f.L[b]; arr[o++] = Math.round(q.x * 32767); arr[o++] = Math.round(q.y * 32767); arr[o++] = Math.round(q.z * 32767); arr[o++] = Math.round(q.w * 32767); });
      arr[o++] = Math.round(f.pos.x * 4000); arr[o++] = Math.round(f.pos.y * 4000); arr[o++] = Math.round(f.pos.z * 4000);
    });
    chunks.push(Buffer.from(arr.buffer));
    const e = { id: r.id, name: r.name, styles: r.styles, frames: r.frames.length, duration: +r.duration.toFixed(2), energy: +r.energy.toFixed(2), beat: +r.beat.toFixed(3), beatConf: +r.beatConf.toFixed(2), offset, kind: r.kind };
    if (r.kind !== 'dance') {
      e.loop = r.loop; e.gait = r.gait;
      if (r.role) e.role = r.role;
      e.speed = +r.plantSpeed.toFixed(3); e.speedHuman = +r.speedHuman.toFixed(3);
      if (r.cycleSec) { e.cycleSec = +r.cycleSec.toFixed(3); e.cycles = r.cycles; e.stride = +(r.plantSpeed * r.cycleSec).toFixed(3); }
      else e.stride = +(r.plantSpeed * r.duration).toFixed(3);          // metres covered by the whole clip
      e.yawDeg = +r.yawDeg.toFixed(1);
      if (!r.loop) { e.speedStart = +r.plantStart.toFixed(3); e.speedEnd = +r.plantEnd.toFixed(3); }
      if (r.speedStartHuman != null) { e.speedStartHuman = +r.speedStartHuman.toFixed(3); e.speedEndHuman = +r.speedEndHuman.toFixed(3); }
    }
    e.srcStart = r.srcStart;
    index.push(e);
    offset += arr.byteLength;
    const x = r.kind === 'dance' ? '' : ` loop=${r.loop} speed=${r.plantSpeed.toFixed(2)}±${r.plantSd.toFixed(2)} (human*${KAIJU_SCALE}=${r.speedHuman.toFixed(2)}) cyc=${r.cycles ?? '-'} cycleSec=${r.cycleSec?.toFixed(2) ?? '-'} yaw=${r.yawDeg.toFixed(0)} seam=${r.seamRatio?.toFixed(2) ?? '-'} seamDy=${r.seamDy?.toFixed(4) ?? '-'} seamDeg=${r.seamDeg?.toFixed(1) ?? '-'}`;
    console.log(r.id.padEnd(7), r.kind.padEnd(6), r.name.padEnd(26), `${r.duration.toFixed(1)}s`.padStart(6), 'src', r.srcStart.toFixed(2), 'sink', r.sinkFrames, 'minClear', r.minClear.toFixed(3), r.kind === 'dance' ? '' : `roll<=${r.maxRollDeg.toFixed(0)}deg`, x);
  }
  fs.writeFileSync(path.join(dir, 'dances.bin'), Buffer.concat(chunks));
  fs.writeFileSync(path.join(dir, 'dances.json'), JSON.stringify({
    fps: FPS, bones: BONES, perFrame: per, posScale: 4000, quatScale: 32767,
    credit: 'Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)',
    skeleton: 'v2', character: who,
    clips: index,
  }, null, 1));
  console.log(`wrote ${index.length} clips (${index.filter(c => c.kind === 'dance').length} dances), ${(offset / 1024).toFixed(0)} KB -> ${dir}`);
}
