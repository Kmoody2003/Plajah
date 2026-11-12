// Motion capture benchmark with ground truth. A CMU motion-capture take plays on a rigged Plajah character, is
// rendered from a chosen camera (still or following), and every frame goes through the same pose model and solver
// as real footage. Truth comes from the character's own bones in the camera's frame, which is the frame the
// solver works in (x right, y up, z toward the camera), so the two compare directly.
//
//   mocapBench.run({ take: '02_01' })  →  per-bone angle errors, joint position errors, root path, contacts, speed
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { retarget, findBone, CMU_TO_CONTRACT } from '../../services/mocap/retarget';
import { tracker, toRaw, nextTs, PerformerLock } from '../../services/mocap/capture';
import { solveTake, clipFrame, fk, JOINTS, type SolveOptions } from '../../services/mocap/solve';
import { detectStrikes } from '../../services/mocap/moves';
import { loadLifter } from '../../services/mocap/lifter';
import type { RawTake, RawFrame, PoseModel, MotionClip } from '../../services/mocap/types';

const MOCAP = '/games/era-clash/3d/assets/mocap/';
const CHARS = '/games/era-clash/3d/assets/characters/';

/** Our joints ↔ the character's bones (truth positions). */
export const PAIRS: Record<string, string> = {
  hip: 'Hips', neck: 'Neck', head: 'Head',
  lShldr: 'LeftArm', lForeArm: 'LeftForeArm', lHand: 'LeftHand', rShldr: 'RightArm', rForeArm: 'RightForeArm', rHand: 'RightHand',
  lThigh: 'LeftUpLeg', lShin: 'LeftLeg', lFoot: 'LeftFoot', rThigh: 'RightUpLeg', rShin: 'RightLeg', rFoot: 'RightFoot',
};
/** Bones compared by direction (proportion-free): name → [from joint, to joint]. */
export const BONES: Record<string, [string, string]> = {
  'L upper arm': ['lShldr', 'lForeArm'], 'L forearm': ['lForeArm', 'lHand'], 'R upper arm': ['rShldr', 'rForeArm'], 'R forearm': ['rForeArm', 'rHand'],
  'L thigh': ['lThigh', 'lShin'], 'L shin': ['lShin', 'lFoot'], 'R thigh': ['rThigh', 'rShin'], 'R shin': ['rShin', 'rFoot'],
  spine: ['hip', 'neck'],
};

export interface BenchOptions {
  take: string;
  character?: string;
  /** Seconds of the take to use (from `start`). */
  seconds?: number; start?: number;
  /** Camera azimuth around the performer's starting facing, degrees (0 = from the front, 90 = from their left). */
  azimuth?: number;
  distance?: number; height?: number;
  /** Camera tracks the hips sideways and in depth (a followed shot). */
  follow?: boolean;
  /** Camera pitch down, degrees (0 = level). */
  pitch?: number;
  model?: PoseModel;
  size?: [number, number];
  hfovDeg?: number;
  solve?: SolveOptions;
  /** Keep a picture of these frame indices (with the detected landmarks drawn on), for checking by eye. */
  keep?: number[];
}

export interface Truth { pos: Record<string, THREE.Vector3>; footY: { l: number; r: number }; footW: { l: THREE.Vector3; r: THREE.Vector3 }; hipWorldY: number;
  /** Hips in the world turned into the camera's axes (travel survives a following camera). */
  hipTravel: THREE.Vector3 }

const loaded = new Map<string, Promise<unknown>>();
const once = <T,>(key: string, f: () => Promise<T>): Promise<T> => { if (!loaded.has(key)) loaded.set(key, f()); return loaded.get(key) as Promise<T>; };

/** Render the take and capture it. Returns the raw take (as from a camera) and the truth per frame. */
export async function render(o: BenchOptions): Promise<{ take: RawTake; truth: Truth[]; ms: { render: number; detect: number }; shots: string[] }> {
  const [W, H] = o.size ?? [1280, 720], fps = 30, hfov = o.hfovDeg ?? 60;
  const fbx = await once(`fbx:${o.take}`, () => new FBXLoader().loadAsync(`${MOCAP}${o.take}.fbx`)) as THREE.Group;
  const gltf = await new GLTFLoader().loadAsync(`${CHARS}${o.character ?? 'samurai'}.glb`);
  const ch = gltf.scene;
  const clip = retarget(ch, fbx, fbx.animations[0], o.take, CMU_TO_CONTRACT, { travel: true, fps });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e7e3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 4); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  scene.add(ch);
  ch.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).frustumCulled = false; });

  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) * (H / W)));
  const cam = new THREE.PerspectiveCamera(vfov, W / H, 0.05, 200);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false); renderer.outputColorSpace = THREE.SRGBColorSpace;

  const mixer = new THREE.AnimationMixer(ch);
  mixer.clipAction(clip).play();
  const hips = findBone(ch, 'Hips')!;
  const bones = Object.fromEntries(Object.entries(PAIRS).map(([k, b]) => [k, findBone(ch, b)!]));
  const toes = { l: findBone(ch, 'LeftToeBase'), r: findBone(ch, 'RightToeBase') };

  // Camera placement from the performer's facing at the start.
  const start = o.start ?? 0, secs = Math.min(o.seconds ?? 8, clip.duration - start), n = Math.floor(secs * fps);
  mixer.setTime(start); ch.updateMatrixWorld(true);
  const wp = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3());
  const lat = wp(findBone(ch, 'LeftUpLeg')!).sub(wp(findBone(ch, 'RightUpLeg')!)).setY(0).normalize();
  const face0 = lat.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const az = THREE.MathUtils.degToRad(o.azimuth ?? 0);
  const camDir = face0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), az); // from performer toward camera
  const dist = o.distance ?? 4.2, camH = o.height ?? 1.0, pitch = THREE.MathUtils.degToRad(o.pitch ?? 0);
  const hip0 = wp(hips);
  const place = (target: THREE.Vector3) => {
    cam.position.copy(target).addScaledVector(camDir, dist).setY(camH);
    const look = cam.position.clone().addScaledVector(camDir, -1).setY(camH - Math.tan(pitch));
    cam.lookAt(look);
    cam.updateMatrixWorld(true);
  };
  place(hip0);

  const pose = await tracker(o.model ?? 'heavy');
  const lock = new PerformerLock();
  const frames: (RawFrame | null)[] = [], truth: Truth[] = [];
  const shots: string[] = [];
  let tRender = 0, tDetect = 0;
  for (let i = 0; i < n; i++) {
    const t = start + i / fps;
    mixer.setTime(t); ch.updateMatrixWorld(true);
    if (o.follow) place(wp(hips).setY(0));
    const a = performance.now();
    renderer.render(scene, cam);
    const b = performance.now();
    frames.push(toRaw(i / fps, lock.pick(pose.detectAll(canvas, nextTs(b)), i / fps)));
    if (o.keep?.includes(i)) {
      const c2 = document.createElement('canvas'); c2.width = W / 2; c2.height = H / 2; const g = c2.getContext('2d')!;
      g.drawImage(canvas, 0, 0, W / 2, H / 2);
      const fr = frames[frames.length - 1];
      if (fr) { g.fillStyle = '#e11d48'; for (const [k, p] of fr.pts.entries()) { g.beginPath(); g.arc(p.x * W / 2, p.y * H / 2, k === 15 || k === 27 ? 5 : 3, 0, 7); g.fill(); } }
      g.fillStyle = '#000'; g.font = '14px sans-serif'; g.fillText(`frame ${i}${fr ? '' : ' (nobody found)'}`, 8, 18);
      shots.push(c2.toDataURL('image/jpeg', 0.8));
    }
    tRender += b - a; tDetect += performance.now() - b;
    // Truth in the camera's frame (x right, y up, z toward the camera), feet in the world.
    const view = cam.matrixWorldInverse;
    const pos: Record<string, THREE.Vector3> = {};
    for (const [k, bone] of Object.entries(bones)) pos[k] = wp(bone).applyMatrix4(view);
    const fy = (s: 'l' | 'r') => Math.min(wp(bones[`${s}Foot`]).y, toes[s] ? wp(toes[s]!).y : Infinity);
    truth.push({ pos, footY: { l: fy('l'), r: fy('r') }, footW: { l: wp(bones.lFoot), r: wp(bones.rFoot) }, hipWorldY: wp(hips).y, hipTravel: wp(hips).applyQuaternion(cam.quaternion.clone().invert()) });
  }
  renderer.dispose(); mixer.stopAllAction();
  return {
    take: { fps, frames, width: W, height: H, hfovDeg: hfov, source: { kind: 'upload', label: `bench ${o.take}`, model: o.model ?? 'heavy' } },
    truth, ms: { render: tRender / n, detect: tDetect / n }, shots,
  };
}

export interface BenchReport {
  take: string; frames: number; found: number;
  /** Mean bone direction error per bone, degrees, and overall. */
  boneDeg: Record<string, number>; meanDeg: number;
  /** Mean joint position error relative to the hips, cm, after scaling our skeleton to the truth's leg length. */
  jointCm: number;
  /** Root travel: truth and solved distance start→end (m), and the mean drift of the solved path from the truth (cm). */
  travel: { truthM: number; solvedM: number; driftCm: number };
  /** Hip height above the floor: mean absolute error, cm. */
  hipHeightCm: number;
  /** Foot contacts vs truth (foot within 5 cm of the floor and slower than 0.3 m/s). */
  contacts: { precision: number; recall: number };
  /** The same bone errors for MediaPipe's own 3D landmarks, before our solver (the baseline). */
  rawDeg: number;
  quality: MotionClip['quality'];
  ms: { render: number; detect: number; solve: number };
  moves: string[];
}

/** Score a solved clip against the truth. */
/** MediaPipe's own world landmarks scored the same way (limb bones only). */
function rawBoneDeg(take: RawTake, truth: Truth[]): number {
  const MPI: Record<string, number> = { lShldr: 11, rShldr: 12, lForeArm: 13, rForeArm: 14, lHand: 15, rHand: 16, lThigh: 23, rThigh: 24, lShin: 25, rShin: 26, lFoot: 27, rFoot: 28, hip: -1, neck: -2 };
  let sum = 0, cnt = 0;
  take.frames.forEach((fr, f) => {
    if (!fr || !truth[f]) return;
    const W = fr.world.map((p) => new THREE.Vector3(p.x, -p.y, -p.z));
    const at = (k: string) => (MPI[k] === -1 ? W[23].clone().add(W[24]).multiplyScalar(0.5) : MPI[k] === -2 ? W[11].clone().add(W[12]).multiplyScalar(0.5) : W[MPI[k]]);
    for (const [a, b] of Object.values(BONES)) {
      const dm = at(b).clone().sub(at(a)).normalize(), dt = truth[f].pos[b].clone().sub(truth[f].pos[a]).normalize();
      sum += THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, dm.dot(dt))))); cnt++;
    }
  });
  return +(sum / Math.max(1, cnt)).toFixed(1);
}

export function score(o: BenchOptions, clip: MotionClip, truth: Truth[], ms: { render: number; detect: number; solve: number }, found: number, take?: RawTake): BenchReport {
  const n = Math.min(clip.frames, truth.length), J = (x: string) => (JOINTS as readonly string[]).indexOf(x);
  const ang: Record<string, number[]> = Object.fromEntries(Object.keys(BONES).map((k) => [k, []]));
  let jSum = 0, jN = 0, hSum = 0;
  // Leg length scale (our skeleton vs truth), from the first frame.
  const legT = truth[0].pos.lThigh.distanceTo(truth[0].pos.lShin) + truth[0].pos.lShin.distanceTo(truth[0].pos.lFoot);
  const sk = clip.skeleton.joints;
  const P0 = fk(clipFrame(clip, 0).local, sk).pos;
  const legS = P0[J('lThigh')].distanceTo(P0[J('lShin')]) + P0[J('lShin')].distanceTo(P0[J('lFoot')]);
  const sc = legT / legS;
  // The floor a planted foot sits at: the 10th percentile of each frame's lowest foot point (the toe bone sits at
  // the ball of the foot, a few cm up, so the single lowest point of the take would be too low).
  const lows = truth.map((t) => Math.min(t.footY.l, t.footY.r)).sort((a, b) => a - b);
  const floorY = lows[Math.floor(lows.length * 0.1)];
  for (let f = 0; f < n; f++) {
    const { local, root } = clipFrame(clip, f);
    const P = fk(local, sk, root).pos;
    const T = truth[f].pos;
    for (const [name, [a, b]] of Object.entries(BONES)) {
      const ds = P[J(b)].clone().sub(P[J(a)]).normalize(), dt = T[b].clone().sub(T[a]).normalize();
      ang[name].push(THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, ds.dot(dt))))));
    }
    for (const k of Object.keys(PAIRS)) {
      if (k === 'hip') continue;
      const s = P[J(k)].clone().sub(P[J('hip')]).multiplyScalar(sc), t = T[k].clone().sub(T.hip);
      jSum += s.distanceTo(t) * 100; jN++;
    }
  }
  // Root path across the floor: truth hips (camera frame) vs solved root, both from their start, ours scaled.
  let drift = 0;
  const tr0 = truth[0].hipTravel, so0 = new THREE.Vector3(clip.root[0], 0, clip.root[2]);
  for (let f = 0; f < n; f++) {
    const tr = truth[f].hipTravel.clone().sub(tr0); tr.y = 0;
    const so = new THREE.Vector3(clip.root[f * 3], 0, clip.root[f * 3 + 2]).sub(so0).multiplyScalar(sc);
    drift += tr.distanceTo(so) * 100;
  }
  // Hip height above the floor: truth world hips minus the lowest foot point of the take; ours scaled.
  for (let f = 0; f < n; f++) hSum += Math.abs(clip.root[f * 3 + 1] * sc - (truth[f].hipWorldY - floorY)) * 100;
  // Contacts.
  let tp = 0, fp = 0, fn = 0;
  for (const s of ['l', 'r'] as const) {
    for (let f = 1; f < n; f++) {
      const v = truth[f].footW[s].clone().sub(truth[f - 1].footW[s]).setY(0).length() * 30;
      const truthOn = truth[f].footY[s] - floorY < 0.04 && v < 0.5;
      const on = !!clip.contacts[s][f];
      if (on && truthOn) tp++; else if (on) fp++; else if (truthOn) fn++;
    }
  }
  const boneDeg = Object.fromEntries(Object.entries(ang).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)]));
  const tEnd = truth[n - 1].hipTravel.clone().sub(tr0).setY(0).length();
  const sEnd = new THREE.Vector3(clip.root[(n - 1) * 3], 0, clip.root[(n - 1) * 3 + 2]).sub(so0).length() * sc;
  return {
    take: o.take, frames: n, found,
    boneDeg, meanDeg: +(Object.values(boneDeg).reduce((a, b) => a + b, 0) / Object.keys(boneDeg).length).toFixed(1),
    jointCm: +(jSum / jN).toFixed(1),
    rawDeg: take ? rawBoneDeg(take, truth) : NaN,
    travel: { truthM: +tEnd.toFixed(2), solvedM: +sEnd.toFixed(2), driftCm: +(drift / n).toFixed(1) },
    hipHeightCm: +(hSum / n).toFixed(1),
    contacts: { precision: +(tp / Math.max(1, tp + fp)).toFixed(2), recall: +(tp / Math.max(1, tp + fn)).toFixed(2) },
    quality: clip.quality, ms: { render: +ms.render.toFixed(1), detect: +ms.detect.toFixed(1), solve: +ms.solve.toFixed(0) },
    moves: clip.moves.map((m) => m.name),
  };
}

/** Render, capture, solve and score one take. `solveOpts` can be changed and re-scored without re-rendering (see rescore). */
export async function run(o: BenchOptions): Promise<BenchReport & { raw: RawTake; truth: Truth[] }> {
  const r = await render(o);
  lastTruth = r.truth;
  return { ...rescore(o, r.take, r.truth, r.ms), raw: r.take, truth: r.truth };
}
let lastTruth: Truth[] = [];

export function rescore(o: BenchOptions, take: RawTake, truth: Truth[] = lastTruth, ms = { render: 0, detect: 0 }): BenchReport {
  const a = performance.now();
  const clip = solveTake(take, o.solve ?? {});
  clip.moves = detectStrikes(clip);
  const solveMs = performance.now() - a;
  return score(o, clip, truth, { ...ms, solve: solveMs }, take.frames.filter(Boolean).length / take.frames.length, take);
}


// ── Stored suites: render once, re-score solver changes in seconds ──────────────────────────────────────
const ser = (t: Truth) => ({ pos: Object.fromEntries(Object.entries(t.pos).map(([k, v]) => [k, v.toArray()])), footY: t.footY, footW: { l: t.footW.l.toArray(), r: t.footW.r.toArray() }, hipWorldY: t.hipWorldY, hipTravel: t.hipTravel.toArray() });
type SerTruth = ReturnType<typeof ser>;
const de = (t: SerTruth): Truth => ({ pos: Object.fromEntries(Object.entries(t.pos).map(([k, v]) => [k, new THREE.Vector3(...(v as [number, number, number]))])), footY: t.footY, footW: { l: new THREE.Vector3(...(t.footW.l as [number, number, number])), r: new THREE.Vector3(...(t.footW.r as [number, number, number])) }, hipWorldY: t.hipWorldY, hipTravel: new THREE.Vector3(...(t.hipTravel as [number, number, number])) });

/** Render every case, store raw + truth in IndexedDB under `plajah.mocapbench.<key>`, return the reports. */
export async function runSuite(cases: (BenchOptions & { key: string })[], onEach?: (r: BenchReport & { key: string }) => void) {
  const { set } = await import('idb-keyval');
  const out: (BenchReport & { key: string })[] = [];
  for (const c of cases) {
    const r = await render(c);
    await set(`plajah.mocapbench.${c.key}`, { o: c, raw: r.take, truth: r.truth.map(ser), ms: r.ms });
    const rep = { key: c.key, ...rescore(c, r.take, r.truth, r.ms) };
    out.push(rep); onEach?.(rep);
  }
  return out;
}

/** Re-solve and re-score stored cases with other solve options (no rendering). */
export async function rescoreStored(keys: string[], solve: SolveOptions = {}, o: { lifter?: string | false; gate?: import('../../services/mocap/lifter').LiftGate | false } = {}) {
  const { get } = await import('idb-keyval');
  const lifter = o.lifter ? await loadLifter(o.lifter) : null;
  const out: (BenchReport & { key: string })[] = [];
  for (const key of keys) {
    const b = await get(`plajah.mocapbench.${key}`) as { o: BenchOptions; raw: RawTake; truth: SerTruth[]; ms: { render: number; detect: number } } | undefined;
    if (!b) continue;
    out.push({ key, ...rescore({ ...b.o, solve }, lifter ? lifter.apply(b.raw, o.gate) : b.raw, b.truth.map(de), b.ms) });
  }
  return out;
}

/** One line per report. */
export const line = (r: BenchReport & { key?: string }) => `${r.key ?? r.take}: found ${Math.round(r.found * 100)}% | bones MP ${r.rawDeg}° → ours ${r.meanDeg}° | joints ${r.jointCm}cm | travel ${r.travel.truthM}→${r.travel.solvedM}m drift ${r.travel.driftCm}cm | hipH ${r.hipHeightCm}cm | contacts P${r.contacts.precision} R${r.contacts.recall} | slide ${r.quality.skate} | ${r.quality.grade} | moves ${r.moves.length} | detect ${r.ms.detect}ms solve ${r.ms.solve}ms`;

/** Where the error comes from, per joint: MediaPipe's 2D points vs the true joints projected into the image (px),
 *  and per bone: MediaPipe 3D direction error split into in-picture angle and depth angle (degrees). */
export async function diagnose(key: string) {
  const { get } = await import('idb-keyval');
  const b = await get(`plajah.mocapbench.${key}`) as { o: BenchOptions; raw: RawTake; truth: SerTruth[] };
  const truth = b.truth.map(de), take = b.raw, W = take.width, H = take.height;
  const f = (W / 2) / Math.tan(THREE.MathUtils.degToRad(take.hfovDeg ?? 60) / 2);
  const MPI: Record<string, number> = { lShldr: 11, rShldr: 12, lForeArm: 13, rForeArm: 14, lHand: 15, rHand: 16, lThigh: 23, rThigh: 24, lShin: 25, rShin: 26, lFoot: 27, rFoot: 28 };
  const px: Record<string, number[]> = {}, inPic: Record<string, number[]> = {}, depth: Record<string, number[]> = {};
  take.frames.forEach((fr, i) => {
    if (!fr || !truth[i]) return;
    for (const [k, m] of Object.entries(MPI)) {
      const p = truth[i].pos[k];
      const u = W / 2 + (f * p.x) / -p.z, v = H / 2 - (f * p.y) / -p.z;
      (px[k] ??= []).push(Math.hypot(u - fr.pts[m].x * W, v - fr.pts[m].y * H));
    }
    const Wm = fr.world.map((q) => new THREE.Vector3(q.x, -q.y, -q.z));
    for (const [name, [a, c]] of Object.entries(BONES)) {
      if (!(a in MPI) || !(c in MPI)) continue;
      const dm = Wm[MPI[c]].clone().sub(Wm[MPI[a]]).normalize(), dt = truth[i].pos[c].clone().sub(truth[i].pos[a]).normalize();
      // angle in the picture plane (x,y) and the depth tilt difference
      const ang2 = Math.abs(Math.atan2(dm.y, dm.x) - Math.atan2(dt.y, dt.x)); (inPic[name] ??= []).push(THREE.MathUtils.radToDeg(Math.min(ang2, 2 * Math.PI - ang2)));
      (depth[name] ??= []).push(Math.abs(THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, dm.z))) - Math.asin(Math.max(-1, Math.min(1, dt.z))))));
    }
  });
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(1); };
  return { key, px2d: Object.fromEntries(Object.entries(px).map(([k, v]) => [k, med(v)])), boneInPictureDeg: Object.fromEntries(Object.entries(inPic).map(([k, v]) => [k, med(v)])), boneDepthTiltDeg: Object.fromEntries(Object.entries(depth).map(([k, v]) => [k, med(v)])) };
}
