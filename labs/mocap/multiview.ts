// Multi-camera renders with ground truth. A CMU motion plays on a rigged Plajah character and is filmed at the same
// instant by every camera of a rig (services/cameraRig); each camera's picture goes through its own pose tracker,
// exactly like separate phones would. Truth is the character's bones in the world, and each camera's calibration is
// recorded per frame, so the result serves three jobs:
//   - triangulation tests (how much better two or four phones are than one)          → scoreViews
//   - training rows for the pose lifter (MediaPipe's output paired with the truth)   → pack / generate
//   - checking a staged camera rig by eye                                            → contact sheets (keep)
//
//   mocapMulti.render({ take: 'cmu:05_01', rig: RIG_PRESETS.fourCorners() })
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { retarget, findBone, CMU_TO_CONTRACT } from '../../services/mocap/retarget';
import { toRaw, nextTs, PerformerLock } from '../../services/mocap/capture';
import { PoseTracker } from '../../services/vtuber/poseTracker';
import { calibration, triangulate, randomRig, fitRadius, type CameraRig, type Calibration, type Vec3 } from '../../services/cameraRig/rig';
import type { RawFrame, RawTake, PoseModel } from '../../services/mocap/types';
import { syncByMotion, twoCamera } from '../../services/mocap/multicam';
import { PAIRS, BONES } from './bench';

export const CHARACTERS = ['peasant', 'samurai', 'knight', 'monk', 'viking', 'raider', 'fisherman', 'carpenter', 'chieftain'];
const CHARS = '/games/era-clash/3d/assets/characters/';
/** 'cmu:05_01' = a training clip (served from D: by the lab); otherwise a benchmark take in the game's mocap folder. */
const takeUrl = (take: string) => (take.startsWith('cmu:') ? `/__cmu/animations/${take.slice(4)}.fbx` : `/games/era-clash/3d/assets/mocap/${take}.fbx`);
const JOINT_KEYS = Object.keys(PAIRS);

export interface MultiOptions {
  take: string;
  rig: CameraRig;
  character?: string;
  seconds?: number; start?: number;
  fps?: number;
  model?: PoseModel;
  size?: [number, number];
  /** Fit every fixed camera so the whole path stays in frame (default true). */
  fit?: boolean;
  /**
   * When the performer travels: 'fit' = fixed cameras pulled back to see the whole path (a capture volume);
   * 'track' = every camera moves with them (dolly / handheld follow); 'auto' = track half the time on takes that
   * travel more than 1.5 m (training: keeps people a realistic size in frame). Default 'fit'.
   */
  travel?: 'fit' | 'track' | 'auto';
  /** 'plain' = the benchmark's grey studio; 'random' = random backdrop, floor and light (training). */
  look?: 'plain' | 'random';
  rand?: () => number;
  /** Frame indices to keep as a contact sheet (all cameras side by side, detected points drawn on). */
  keep?: number[];
}

export interface MultiResult {
  take: string; character: string; fps: number; width: number; height: number; start: number;
  rig: CameraRig;
  /** views[cam][frame] */
  frames: (RawFrame | null)[][];
  calib: Calibration[][];
  truth: { world: Record<string, Vec3>; footY: [number, number] }[];
  ms: { render: number; detect: number };
  shots: string[];
}

// One tracker per camera (VIDEO mode keeps per-stream state) and one renderer for every render.
const trackers: PoseTracker[] = [];
async function trackerFor(k: number, model: PoseModel) {
  while (trackers.length <= k) trackers.push(new PoseTracker());
  const t = trackers[k];
  if (!t.isReady && !(await t.init({ model, numPoses: 3 }))) throw new Error('The pose model could not start.');
  return t;
}
let gl: { r: THREE.WebGLRenderer; canvas: HTMLCanvasElement } | null = null;
function renderer(W: number, H: number) {
  if (!gl) {
    const canvas = document.createElement('canvas');
    gl = { canvas, r: new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }) };
    gl.r.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (gl.canvas.width !== W || gl.canvas.height !== H) { gl.canvas.width = W; gl.canvas.height = H; gl.r.setSize(W, H, false); }
  return gl;
}

function dispose(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) { for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose(); mat.dispose(); }
  });
}

export async function render(o: MultiOptions): Promise<MultiResult> {
  const rand = o.rand ?? Math.random;
  const [W, H] = o.size ?? [1280, 720], fps = o.fps ?? 30, model = o.model ?? 'heavy';
  const character = o.character ?? 'peasant';
  const fbx = await new FBXLoader().loadAsync(takeUrl(o.take));
  const ch = (await new GLTFLoader().loadAsync(`${CHARS}${character}.glb`)).scene;
  const clip = retarget(ch, fbx, fbx.animations[0], o.take, CMU_TO_CONTRACT, { travel: true, fps });
  dispose(fbx);

  const scene = new THREE.Scene();
  const random = o.look === 'random';
  const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l);
  scene.background = random ? hsl(rand(), rand() * 0.35, 0.25 + rand() * 0.65) : new THREE.Color(0xe9e7e3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, random ? 0.6 + rand() * 1.6 : 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, random ? 1 + rand() * 2.5 : 2.2);
  if (random) { const a = rand() * Math.PI * 2; sun.position.set(Math.cos(a) * 5, 3 + rand() * 5, Math.sin(a) * 5); } else sun.position.set(3, 6, 4);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: random ? hsl(rand(), rand() * 0.3, 0.2 + rand() * 0.6) : 0xd8d4cc, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  scene.add(ch);
  ch.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).frustumCulled = false; });

  const mixer = new THREE.AnimationMixer(ch);
  mixer.clipAction(clip).play();
  const wp = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3());
  const hips = findBone(ch, 'Hips')!;
  const bones = Object.fromEntries(Object.entries(PAIRS).map(([k, b]) => [k, findBone(ch, b)!]));
  const toes = { l: findBone(ch, 'LeftToeBase'), r: findBone(ch, 'RightToeBase') };

  const start = o.start ?? 0, secs = Math.max(0.5, Math.min(o.seconds ?? 8, clip.duration - start)), n = Math.floor(secs * fps);
  // The rig is described round a subject at the origin facing +Z: put that frame on the performer — centred on the
  // middle of their path for fixed cameras, turned to their facing at the start.
  mixer.setTime(start); ch.updateMatrixWorld(true);
  const lat = wp(findBone(ch, 'LeftUpLeg')!).sub(wp(findBone(ch, 'RightUpLeg')!)).setY(0).normalize();
  const face0 = lat.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const yaw = Math.atan2(face0.x, face0.z);
  const path: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 3) { mixer.setTime(start + i / fps); ch.updateMatrixWorld(true); path.push(wp(hips).setY(0)); }
  const box = new THREE.Box3().setFromPoints(path), center = box.getCenter(new THREE.Vector3()).setY(0);
  const radius = path.reduce((m, p) => Math.max(m, p.distanceTo(center)), 0);
  const track = o.travel === 'track' || (o.travel === 'auto' && radius > 1.5 && rand() < 0.5);
  const rig: CameraRig = track ? { ...o.rig, cameras: o.rig.cameras.map((c) => ({ ...c, follow: 'track' as const })) }
    : o.fit === false ? o.rig : fitRadius(o.rig, radius + 0.7, W / H);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const toW = (v: Vec3) => new THREE.Vector3(...v).applyQuaternion(q).add(center);

  const cams = rig.cameras.map((c) => { const cam = new THREE.PerspectiveCamera(1, W / H, 0.05, 500); cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.hfovDeg) / 2) / (W / H))); cam.updateProjectionMatrix(); return cam; });
  const trk = await Promise.all(rig.cameras.map((_, k) => trackerFor(k, model)));
  const locks = rig.cameras.map(() => new PerformerLock());
  const { r: R, canvas } = renderer(W, H);

  const frames: (RawFrame | null)[][] = rig.cameras.map(() => []), calib: Calibration[][] = rig.cameras.map(() => []);
  const truth: MultiResult['truth'] = [], shots: string[] = [];
  let tR = 0, tD = 0;
  for (let i = 0; i < n; i++) {
    mixer.setTime(start + i / fps); ch.updateMatrixWorld(true);
    const hipNow = wp(hips).setY(0), shift = hipNow.clone().sub(center);
    const sheet = o.keep?.includes(i) ? Object.assign(document.createElement('canvas'), { width: (W / 3) * rig.cameras.length, height: H / 3 }) : null;
    rig.cameras.forEach((spec, k) => {
      const cam = cams[k], f = spec.follow ?? 'none';
      const pos = toW(spec.position), tgt = toW(spec.target);
      if (f === 'track') { pos.add(shift); tgt.add(shift); }
      if (f === 'pan') tgt.add(shift);
      cam.position.copy(pos); cam.lookAt(tgt);
      if (spec.rollDeg) cam.rotateZ(THREE.MathUtils.degToRad(spec.rollDeg));
      cam.updateMatrixWorld(true);
      const a = performance.now();
      R.render(scene, cam);
      const b = performance.now();
      const fr = toRaw(i / fps, locks[k].pick(trk[k].detectAll(canvas, nextTs(b)), i / fps));
      tR += b - a; tD += performance.now() - b;
      frames[k].push(fr); calib[k].push(calibration(cam, W, H));
      if (sheet) {
        const g = sheet.getContext('2d')!, x0 = (W / 3) * k;
        g.drawImage(canvas, x0, 0, W / 3, H / 3);
        if (fr) { g.fillStyle = '#e11d48'; for (const p of fr.pts) { g.beginPath(); g.arc(x0 + (p.x * W) / 3, (p.y * H) / 3, 2.5, 0, 7); g.fill(); } }
        g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.fillText(`${spec.name ?? spec.id}${fr ? '' : ' — nobody found'}`, x0 + 6, 16);
      }
    });
    if (sheet) shots.push(sheet.toDataURL('image/jpeg', 0.8));
    const world: Record<string, Vec3> = {};
    for (const [k, b] of Object.entries(bones)) world[k] = wp(b).toArray() as Vec3;
    const fy = (s: 'l' | 'r') => Math.min(wp(bones[`${s}Foot`]).y, toes[s] ? wp(toes[s]!).y : Infinity);
    truth.push({ world, footY: [fy('l'), fy('r')] });
  }
  mixer.stopAllAction(); scene.remove(ch); dispose(scene);
  const per = Math.max(1, n * rig.cameras.length);
  return { take: o.take, character, fps, width: W, height: H, start, rig, frames, calib, truth, ms: { render: +(tR / per).toFixed(1), detect: +(tD / per).toFixed(1) }, shots };
}

// ── Scoring: one camera vs triangulating two or more ─────────────────────────────────────────────────────────
const MPI: Record<string, number | [number, number]> = {
  lShldr: 11, rShldr: 12, lForeArm: 13, rForeArm: 14, lHand: 15, rHand: 16,
  lThigh: 23, rThigh: 24, lShin: 25, rShin: 26, lFoot: 27, rFoot: 28, hip: [23, 24], neck: [11, 12],
};
const ang = (a: THREE.Vector3, b: THREE.Vector3) => THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, a.dot(b)))));
const rot = (c: Calibration, v: THREE.Vector3) => new THREE.Vector3(
  c.R[0] * v.x + c.R[1] * v.y + c.R[2] * v.z, c.R[3] * v.x + c.R[4] * v.y + c.R[5] * v.z, c.R[6] * v.x + c.R[7] * v.y + c.R[8] * v.z);

/**
 * Mean bone direction error (degrees) for: each camera alone (MediaPipe's own 3D, in that camera's frame) and the
 * landmarks triangulated from the chosen cameras (default all). Also how often triangulation had ≥2 views.
 */
export function scoreViews(r: MultiResult, use: number[] = r.rig.cameras.map((_, k) => k)) {
  const single = r.rig.cameras.map(() => ({ s: 0, n: 0 }));
  let tri = 0, triN = 0, covered = 0, reproj = 0;
  const per: Record<string, number[]> = {};
  r.truth.forEach((t, f) => {
    const T = (k: string) => new THREE.Vector3(...t.world[k]);
    // single views
    r.frames.forEach((v, k) => {
      const fr = v[f]; if (!fr) return;
      const Wm = fr.world.map((p) => new THREE.Vector3(p.x, -p.y, -p.z));
      const at = (k2: string) => { const m = MPI[k2]; return Array.isArray(m) ? Wm[m[0]].clone().add(Wm[m[1]]).multiplyScalar(0.5) : Wm[m]; };
      for (const [a, b] of Object.values(BONES)) {
        single[k].s += ang(at(b).clone().sub(at(a)).normalize(), rot(r.calib[k][f], T(b).sub(T(a))).normalize()); single[k].n++;
      }
    });
    // triangulated
    const pts = new Map<number, THREE.Vector3>();
    let ok = true;
    for (const i of new Set(Object.values(MPI).flat())) {
      const views = use.map((k) => r.frames[k][f] ? { c: r.calib[k][f], u: r.frames[k][f]!.pts[i].x * r.width, v: r.frames[k][f]!.pts[i].y * r.height, w: r.frames[k][f]!.pts[i].v } : null).filter(Boolean) as Parameters<typeof triangulate>[0];
      const x = triangulate(views);
      if (!x) { ok = false; break; }
      pts.set(i, new THREE.Vector3(...x.p)); reproj += x.err;
    }
    if (!ok) return;
    covered++;
    const at = (k2: string) => { const m = MPI[k2]; return Array.isArray(m) ? pts.get(m[0])!.clone().add(pts.get(m[1])!).multiplyScalar(0.5) : pts.get(m)!; };
    for (const [name, [a, b]] of Object.entries(BONES)) {
      const e = ang(at(b).clone().sub(at(a)).normalize(), T(b).sub(T(a)).normalize());
      tri += e; triN++; (per[name] ??= []).push(e);
    }
  });
  const nPts = new Set(Object.values(MPI).flat()).size;
  return {
    singleDeg: single.map((x) => +(x.s / Math.max(1, x.n)).toFixed(1)),
    triangulatedDeg: +(tri / Math.max(1, triN)).toFixed(1),
    triangulatedBones: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)])),
    coverage: +(covered / r.truth.length).toFixed(2),
    reprojPx: +(reproj / Math.max(1, covered * nPts)).toFixed(1),
  };
}

// ── Training rows ───────────────────────────────────────────────────────────────────────────────────────────
/** One row per (frame, camera), Float32. Offsets into a row. */
export const LAYOUT = {
  pts: [0, 99],        // 33 × (x, y, visibility), picture coordinates 0..1
  mpWorld: [99, 198],  // 33 × (x, y, z) MediaPipe world metres, its own axes (x right, y down, z away), hip-centred
  truth: [198, 243],   // 15 joints (JOINT_ORDER) × (x, y, z) in this camera's frame (x right, y up, z toward camera)
  R: [243, 252],       // world → camera rotation, row-major
  t: [252, 255],       // world → camera shift
  lens: [255, 258],    // f / width, cx / width, cy / height
  footY: [258, 260],   // lowest point of each foot above the world floor, metres (L, R)
  found: [260, 261],   // 1 if the tracker found the performer, else 0 (the MediaPipe fields are then zero)
  size: 261,
} as const;
export const JOINT_ORDER = JOINT_KEYS;

export function pack(r: MultiResult): Float32Array {
  const nC = r.rig.cameras.length, n = r.truth.length, S = LAYOUT.size;
  const out = new Float32Array(n * nC * S);
  for (let f = 0; f < n; f++) {
    for (let k = 0; k < nC; k++) {
      const o = (f * nC + k) * S, fr = r.frames[k][f], c = r.calib[k][f];
      if (fr) {
        fr.pts.forEach((p, i) => { out[o + i * 3] = p.x; out[o + i * 3 + 1] = p.y; out[o + i * 3 + 2] = p.v; });
        fr.world.forEach((p, i) => { out[o + 99 + i * 3] = p.x; out[o + 99 + i * 3 + 1] = p.y; out[o + 99 + i * 3 + 2] = p.z; });
        out[o + 260] = 1;
      }
      JOINT_KEYS.forEach((j, i) => {
        const w = r.truth[f].world[j];
        for (let a = 0; a < 3; a++) out[o + 198 + i * 3 + a] = c.R[a * 3] * w[0] + c.R[a * 3 + 1] * w[1] + c.R[a * 3 + 2] * w[2] + c.t[a];
      });
      c.R.forEach((v, i) => { out[o + 243 + i] = v; });
      c.t.forEach((v, i) => { out[o + 252 + i] = v; });
      out[o + 255] = c.f / c.w; out[o + 256] = c.cx / c.w; out[o + 257] = c.cy / c.h;
      out[o + 258] = r.truth[f].footY[0]; out[o + 259] = r.truth[f].footY[1];
    }
  }
  return out;
}

const mulberry = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

export interface GenerateOptions {
  /** Output set name: rows go to D:/Plajah Models/mocap/lifter-data/<set>/ (default 'v1'). */
  set?: string;
  cams?: number; seconds?: number; size?: [number, number]; model?: PoseModel;
  /** Only the first `limit` clips still to do. */
  limit?: number;
  onClip?: (msg: string) => void;
  signal?: { stop?: boolean };
}

/**
 * Render every CMU training clip on a random character from a random rig and write the rows. Resumable: clips
 * already written are skipped. Each clip's choices come from a seed of its name, so a rerun makes the same data.
 */
export async function generate(o: GenerateOptions = {}) {
  const set = o.set ?? 'v1', cams = o.cams ?? 4;
  const manifest = await (await fetch('/__cmu/manifest.json')).json() as { clips: Record<string, { kind: string }> };
  const done = new Set<string>(await (await fetch(`/__train/done?set=${set}`)).json());
  const todo = Object.keys(manifest.clips).filter((c) => !done.has(c)).slice(0, o.limit ?? Infinity);
  const log: string[] = [];
  for (const [i, id] of todo.entries()) {
    if (o.signal?.stop) break;
    const rand = mulberry(hash(id + set));
    const t0 = performance.now();
    try {
      const character = CHARACTERS[Math.floor(rand() * CHARACTERS.length)];
      const r = await render({ take: `cmu:${id}`, rig: randomRig(cams, rand), character, seconds: o.seconds ?? 8, start: 0.5 + rand() * 1.5, model: o.model ?? 'heavy', size: o.size ?? [960, 540], look: 'random', travel: 'auto', rand });
      const rows = pack(r);
      const meta = { id, kind: manifest.clips[id].kind, character, tracked: r.rig.cameras[0].follow === 'track', fps: r.fps, start: r.start, width: r.width, height: r.height, frames: r.truth.length, cams, rig: r.rig, layout: LAYOUT, joints: JOINT_ORDER, found: r.frames.map((v) => +(v.filter(Boolean).length / v.length).toFixed(2)), ms: r.ms, source: 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu, NSF EIA-0196217) — training only, not for resale' };
      const up = await fetch(`/__train?set=${set}&name=${id}`, { method: 'POST', headers: { 'x-meta': encodeURIComponent(JSON.stringify(meta)) }, body: rows });
      if (!up.ok) throw new Error(await up.text());
      const msg = `${i + 1}/${todo.length} ${id} (${meta.kind}, ${character}) ${meta.frames}f × ${cams} found ${meta.found.join('/')} in ${((performance.now() - t0) / 1000).toFixed(0)}s`;
      log.push(msg); o.onClip?.(msg);
    } catch (e) { const msg = `${id} failed: ${(e as Error).message}`; log.push(msg); o.onClip?.(msg); }
  }
  return log;
}

// ── Two-phone mode check (services/mocap/multicam.ts) ──────────────────────────────────────────────────────
/**
 * Score the two-camera pipeline on a render: cameras `a` and `b` become two separate "phone recordings" (camera B
 * starts `lagFrames` late, no calibration handed over), then sync, self-calibration and fusion run as for real
 * uploads. Bone error is in camera A's axes against the truth, beside each single camera and the triangulation
 * with the true calibration.
 */
export function scoreTwoCamera(r: MultiResult, a: number, b: number, o: { lagFrames?: number; offset?: number; fovDeg?: number } = {}) {
  const lag = o.lagFrames ?? 0;
  const asTake = (k: number, from: number): RawTake => ({
    fps: r.fps, width: r.width, height: r.height,
    frames: r.frames[k].slice(from).map((f, i) => (f ? { ...f, t: i / r.fps } : null)),
    source: { kind: 'upload', label: `cam ${k}`, model: 'heavy' },
  });
  const ta = asTake(a, 0), tb = asTake(b, lag);
  const sync = o.offset !== undefined ? undefined : syncByMotion(ta, tb);
  const out = twoCamera(ta, tb, o.offset !== undefined ? { offset: o.offset, fovDeg: o.fovDeg } : { sync, fovDeg: o.fovDeg });
  if (!('take' in out)) return { error: out.error, sync: out.sync };
  let e = 0, n = 0, eA = 0, nA = 0;
  const per: Record<string, number[]> = {};
  r.truth.forEach((t, f) => {
    const fr = out.take.frames[f], raw = ta.frames[f];
    if (!fr) return;
    const T = (k: string) => new THREE.Vector3(...t.world[k]);
    const at = (w: { x: number; y: number; z: number }[], k2: string) => {
      const m = MPI[k2], P = (i: number) => new THREE.Vector3(w[i].x, -w[i].y, -w[i].z);
      return Array.isArray(m) ? P(m[0]).add(P(m[1])).multiplyScalar(0.5) : P(m);
    };
    for (const [name, [x, y]] of Object.entries(BONES)) {
      const truth = rot(r.calib[a][f], T(y).sub(T(x))).normalize();
      const d = ang(at(fr.world, y).sub(at(fr.world, x)).normalize(), truth);
      e += d; n++; (per[name] ??= []).push(d);
      if (raw) { eA += ang(at(raw.world, y).sub(at(raw.world, x)).normalize(), truth); nA++; }
    }
  });
  const known = scoreViews(r, [a, b]);
  const c = out.report.calibration;
  return {
    cams: [a, b], lagFrames: lag,
    sync: { method: out.report.sync.method, offsetFrames: +(out.report.sync.offset * r.fps).toFixed(2), score: +out.report.sync.score.toFixed(2), margin: +out.report.sync.margin.toFixed(2) },
    calibration: { fov: c.fovDeg[0], angleDeg: +c.angleDeg.toFixed(1), baselineM: +c.baselineM.toFixed(2), reprojPct: +(c.reproj * 100).toFixed(2), notes: c.notes },
    trueAngleDeg: +relAngle(r.calib[a][0], r.calib[b][0]).toFixed(1),
    trueBaselineM: +camDist(r.calib[a][0], r.calib[b][0]).toFixed(2),
    singleADeg: +(eA / Math.max(1, nA)).toFixed(1),
    twoPhoneDeg: +(e / Math.max(1, n)).toFixed(1),
    knownCalibDeg: known.triangulatedDeg,
    bones: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, +(v.reduce((p, q) => p + q, 0) / v.length).toFixed(1)])),
    hiddenFixes: out.report.hiddenFixes, fused: +out.report.fused.toFixed(2),
  };
}
const relAngle = (ca: Calibration, cb: Calibration) => {
  const A = new THREE.Matrix3().set(...(ca.R as [number, number, number, number, number, number, number, number, number]));
  const B = new THREE.Matrix3().set(...(cb.R as [number, number, number, number, number, number, number, number, number]));
  const M = B.multiply(A.transpose()).elements;
  return THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, (M[0] + M[4] + M[8] - 1) / 2))));
};
const camCentre = (c: Calibration) => {
  const R = c.R, t = c.t;
  return new THREE.Vector3(-(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]), -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]), -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2]));
};
const camDist = (ca: Calibration, cb: Calibration) => camCentre(ca).distanceTo(camCentre(cb));
