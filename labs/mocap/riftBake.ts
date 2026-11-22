// Rift Realm character clips from the characters' own motion videos (track 2), in the mocap lab:
//   capture (MediaPipe heavy, WebCodecs decode, camera cuts scored) → shots → solveTake per shot →
//   gameClip.bakeRecipe (level, face +Z, contact cleanup + re-lock, loop) → clipToThree → retarget onto the game rig
//   → clips/<character>.json (three AnimationClip JSON + where each clip came from), and side-by-side frames
//   (video | rig) under docs/rift-realm-mocap/.
//
//   rrBake.capture('888b0e94')                       raw take → D:/rr_work/mocap_t2/takes/888b0e94.json
//   rrBake.shots('888b0e94')                         camera shots inside it
//   rrBake.bake(SPEC)                                every clip of a character (see scripts/riftrealm/clips/*.json)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { captureVideo, compactTake, mergeTakes } from '../../services/mocap/capture';
import { solveTake, type SolveOptions } from '../../services/mocap/solve';
import { clipToThree } from '../../services/mocap/bvh';
import { retarget, CMU_TO_CONTRACT } from '../../services/mocap/retarget';
import { findShots, sliceTake, frameAt } from '../../services/mocap/shots';
import { bakeRecipe, closeLoopThree, yawThree, type ClipRecipe, type RootMotion } from '../../services/mocap/gameClip';
import type { RawTake, MotionClip } from '../../services/mocap/types';
import { loadLifter, type Lifter } from '../../services/mocap/lifter';

let lifter: Promise<Lifter> | null = null;

const save = async (to: 'work' | 'clips' | 'docs', rel: string, body: BodyInit) => {
  const r = await fetch(`/__rrsave?to=${to}&path=${encodeURIComponent(rel)}`, { method: 'POST', body });
  if (!r.ok) throw new Error(`save ${rel}: ${await r.text()}`);
};

const takes = new Map<string, RawTake>();
/** Capture a video once (cached in the work folder). `passes` runs several detector settings and merges them
 *  (capture.ts mergeTakes): e.g. [{}, { confidence: 0.2 }, { confidence: 0.2, pad: 0.3 }] for an armoured robot. */
export async function capture(video: string, o: { fps?: number; force?: boolean; passes?: { confidence?: number; pad?: number }[] } = {}): Promise<{ frames: number; found: number; cuts: number }> {
  let take: RawTake | null = null;
  if (!o.force) take = await fetch(`/__rrwork/takes/${video}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!take) {
    const blob = await fetch(`/__rrvideo/${video}`).then((r) => { if (!r.ok) throw new Error(`no video ${video}`); return r.blob(); });
    const runs: RawTake[] = [];
    for (const [k, p] of (o.passes ?? [{}]).entries()) {
      const r = compactTake(await captureVideo(blob, { fps: o.fps ?? 24, model: 'heavy', mode: 'decode', label: video, ...p }));
      runs.push(r);
      await save('work', `takes/${video}.p${k}.json`, JSON.stringify({ ...r, pass: p }));
    }
    take = compactTake(runs.length > 1 ? mergeTakes(runs) : runs[0]);
    await save('work', `takes/${video}.json`, JSON.stringify(take));
  }
  takes.set(video, take);
  return { frames: take.frames.length, found: take.frames.filter(Boolean).length, cuts: findShots(take).length - 1 };
}
const takeOf = async (video: string) => { if (!takes.has(video)) await capture(video); return takes.get(video)!; };

export async function shots(video: string) {
  const t = await takeOf(video);
  return findShots(t).map((s) => ({ ...s, from: +(s.start / t.fps).toFixed(2), to: +((s.end + 1) / t.fps).toFixed(2) }));
}

/** One clip: which video, the seconds of the move inside it, and how to solve and clean it. */
export interface ClipSpec extends Omit<ClipRecipe, 'from' | 'to'> {
  /** The character's own motion video (hash in the file name)… */
  video?: string;
  /** …or a CMU Motion Capture Library take (e.g. '127_13'), for moves no video shows (Kenne, 2026-11-21). */
  cmu?: string;
  /** Seconds in the source video / take. */
  from: number; to: number;
  /** What the move is in the footage, in plain words (kept with the clip). */
  note: string;
  solve?: Pick<SolveOptions, 'smooth' | 'lockFeet' | 'lift' | 'straighten'>;
  /** Replace MediaPipe's depth with the Plajah pose lifter (services/mocap/lifter.ts) before solving. Default on:
   *  a camera-facing performer's knees and arms are otherwise guessed forward/back by MediaPipe's world points. */
  lifter?: boolean;
}
export interface CharacterSpec {
  id: string;
  /** The rig the clips are retargeted onto (public URL). */
  glb: string;
  clips: ClipSpec[];
  /** Side-by-side frames: clip names to render (default all). */
  frames?: string[] | false;
}

const gltfCache = new Map<string, Promise<THREE.Group>>();
const loadRig = (url: string) => {
  if (!gltfCache.has(url)) gltfCache.set(url, new GLTFLoader().loadAsync(url).then((g) => g.scene));
  return gltfCache.get(url)!;
};

export interface BakedClip { spec: ClipSpec; solved?: MotionClip; game?: MotionClip; /** CMU: the source take and its cut, for the side-by-side */ cmuSrc?: { obj: THREE.Object3D; clip: THREE.AnimationClip; yaw: number }; anim: THREE.AnimationClip; rootMotion: RootMotion; levelDeg: number; faceDeg: number; shot: { from: number; to: number } }

/** Solve one clip spec: the whole camera shot that holds it is solved (more context for the smoothing, the floor
 *  and the contacts), then the move is cut out of it. */
export async function solveClip(spec: ClipSpec, rig: THREE.Object3D): Promise<BakedClip> {
  if (spec.cmu) return cmuClip(spec, rig);
  const take = await takeOf(spec.video!);
  const mid = frameAt(take, (spec.from + spec.to) / 2);
  const shot = findShots(take).find((s) => s.start <= mid && mid <= s.end) ?? { start: 0, end: take.frames.length - 1 };
  // never past the move by more than a second either side: long shots of other action only add drift
  const a = Math.max(shot.start, frameAt(take, spec.from - 1)), b = Math.min(shot.end, frameAt(take, spec.to + 1));
  let sub = sliceTake(take, a, b);
  if (spec.lifter !== false) { lifter ??= loadLifter(); sub = (await lifter).apply(sub); }
  const solved = solveTake(sub, { name: spec.name, ...spec.solve });
  const t0 = a / take.fps;
  const { clip: game, rootMotion, levelDeg, faceDeg } = bakeRecipe(solved, { ...spec, from: spec.from - t0, to: spec.to - t0 });
  const { root, animation } = clipToThree(game);
  const src = new THREE.Group(); src.add(root); src.updateMatrixWorld(true);
  const anim = retarget(rig, src, animation, spec.name, CMU_TO_CONTRACT, { fps: 30 });
  return { spec, solved, game, anim, rootMotion, levelDeg, faceDeg, shot: { from: +(a / take.fps).toFixed(2), to: +((b + 1) / take.fps).toFixed(2) } };
}

// ── CMU library takes (D:/Plajah Models/mocap/cmu-fbx, served by the lab at /__cmu) ────────────────────────────
const fbxCache = new Map<string, Promise<THREE.Group>>();
export const loadCmu = (id: string) => {
  if (!fbxCache.has(id)) fbxCache.set(id, import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => new FBXLoader().loadAsync(`/__cmu/animations/${id}.fbx`)));
  return fbxCache.get(id)!;
};
/** Facing (yaw, radians, 0 = +Z) of a CMU body: forward = (left hip − right hip) × up. */
function cmuYaw(src: THREE.Object3D) {
  src.updateMatrixWorld(true);
  const l = src.getObjectByName('lThigh')!.getWorldPosition(new THREE.Vector3()), r = src.getObjectByName('rThigh')!.getWorldPosition(new THREE.Vector3());
  const f = l.sub(r).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0));
  return Math.atan2(f.x, f.z);
}
/** A CMU take cut to [from, to], retargeted onto the rig with its travel, turned to face +Z (from its facing at the
 *  start, or the mean), its travel measured and then taken out (clips play in place), and looped if asked. */
async function cmuClip(spec: ClipSpec, rig: THREE.Object3D): Promise<BakedClip> {
  const fbx = await loadCmu(spec.cmu!);
  const full = fbx.animations[0];
  const FPS = 120;
  const cut = THREE.AnimationUtils.subclip(full, spec.name, Math.round(spec.from * FPS), Math.round(spec.to * FPS), FPS);
  // the take's facing at rest and over the cut (sampled on the source)
  restPoseOf(fbx);
  const restYaw = cmuYaw(fbx);
  const mixer = new THREE.AnimationMixer(fbx); mixer.clipAction(cut).play();
  let sx = 0, sz = 0;
  const k = spec.face === 'mean' ? 8 : 1;
  for (let i = 0; i < k; i++) { mixer.setTime((cut.duration * i) / Math.max(1, k)); const y = cmuYaw(fbx) - restYaw; sx += Math.sin(y); sz += Math.cos(y); }
  mixer.stopAllAction(); mixer.uncacheRoot(fbx);
  const yaw = Math.atan2(sx, sz);
  restPoseOf(fbx); // the retargeter snapshots the source's rest the first time it sees it: hand it the bind pose
  const anim = retarget(rig, fbx, cut, spec.name, CMU_TO_CONTRACT, { fps: 30, travel: true });
  yawThree(anim, 'Hips', -yaw);
  const pos = anim.tracks.find((t) => t.name === 'Hips.position')!;
  const n = pos.times.length, v = pos.values;
  const d = new THREE.Vector3(v[(n - 1) * 3] - v[0], v[(n - 1) * 3 + 1] - v[1], v[(n - 1) * 3 + 2] - v[2]);
  // in place: the straight-line travel comes out, the sway and bob stay
  for (let i = 0; i < n; i++) { const u = i / (n - 1); v[i * 3] -= d.x * u; v[i * 3 + 2] -= d.z * u; }
  if (spec.mirror) { mirrorThree(anim); d.x = -d.x; }
  if (spec.loop) closeLoopThree(anim, typeof spec.loop === 'object' && spec.loop.blend ? spec.loop.blend / 30 : 0.15);
  const scale = rig.scale.x || 1;
  const rootMotion: RootMotion = { dx: +(d.x * scale).toFixed(3), dy: +(d.y * scale).toFixed(3), dz: +(d.z * scale).toFixed(3), speed: +(Math.hypot(d.x, d.z) * scale / Math.max(1e-3, cut.duration)).toFixed(2), durationSec: +cut.duration.toFixed(3) };
  return { spec, anim, rootMotion, levelDeg: 0, faceDeg: 0, cmuSrc: { obj: fbx, clip: cut, yaw: yaw + restYaw }, shot: { from: spec.from, to: spec.to } };
}
const RESTS = new WeakMap<THREE.Object3D, Map<string, [THREE.Vector3, THREE.Quaternion]>>();
function restPoseOf(o: THREE.Object3D) {
  let rest = RESTS.get(o);
  if (!rest) { rest = new Map(); RESTS.set(o, rest); }
  if (!rest.size) o.traverse((b) => { if ((b as THREE.Bone).isBone) rest.set(b.uuid, [b.position.clone(), b.quaternion.clone()]); });
  o.traverse((b) => { const r = rest.get(b.uuid); if (r) { b.position.copy(r[0]); b.quaternion.copy(r[1]); } });
  o.updateMatrixWorld(true);
}
/** Left ↔ right mirror of a baked clip on a symmetric rig whose bones rest unrotated (the Forge's). */
function mirrorThree(clip: THREE.AnimationClip) {
  const swap = (n: string) => n.replace(/^Left/, '#').replace(/^Right/, 'Left').replace(/^#/, 'Right');
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    t.name = `${swap(bone)}.${prop}`;
    const s = t.getValueSize();
    for (let o = 0; o < t.values.length; o += s) {
      if (s === 4) { t.values[o + 1] = -t.values[o + 1]; t.values[o + 2] = -t.values[o + 2]; }
      else if (s === 3) t.values[o] = -t.values[o];
    }
  }
}

export async function bake(spec: CharacterSpec, o: { frames?: boolean; merge?: boolean } = {}) {
  const rig = await loadRig(spec.glb);
  const out: BakedClip[] = [];
  const report: Record<string, unknown>[] = [];
  for (const c of spec.clips) {
    try {
      const b = await solveClip(c, rig);
      out.push(b);
      report.push({ name: c.name, video: c.video ?? `cmu ${c.cmu}`, from: c.from, to: c.to, grade: b.solved?.quality.grade ?? 'mocap', occlusion: b.solved?.quality.occlusion ?? 0, jitter: b.solved?.quality.jitter ?? 0, skate: b.solved?.quality.skate ?? 0, level: b.levelDeg, face: b.faceDeg, rootMotion: b.rootMotion, frames: b.game?.frames ?? b.anim.tracks[0].times.length });
    } catch (e) {
      report.push({ name: c.name, video: c.video, error: String((e as Error).message ?? e) });
    }
  }
  // merge: a partial re-bake keeps the clips it didn't touch
  const old = o.merge ? await fetch(`/games/rift-realm/assets/characters/clips/${spec.id}.json?${Date.now()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  const redone = new Set(out.map((b) => b.spec.name));
  const json = {
    character: spec.id,
    pipeline: 'services/mocap: captureVideo(heavy, decode, ShotCuts) → findShots → solveTake(lockFeet) → gameClip.bakeRecipe(level, faceForward, cleanContacts+relock, makeLoop) → clipToThree → retarget(CMU_TO_CONTRACT). Baked by labs/mocap/riftBake.ts from scripts/riftrealm/clips/' + spec.id + '.json',
    bakedAt: new Date().toISOString(),
    source: Object.fromEntries([...Object.entries(old?.source ?? {}).filter(([k]) => !redone.has(k)), ...out.map((b) => [b.spec.name, { ...(b.spec.cmu ? { cmu: b.spec.cmu, licence: 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu, NSF EIA-0196217)' } : { video: b.spec.video }), from: b.spec.from, to: b.spec.to, note: b.spec.note, mirror: !!b.spec.mirror, reverse: !!b.spec.reverse, loop: !!b.spec.loop, grade: b.solved?.quality.grade ?? 'mocap' }] as const)]),
    rootMotion: Object.fromEntries([...Object.entries(old?.rootMotion ?? {}).filter(([k]) => !redone.has(k)), ...out.map((b) => [b.spec.name, b.rootMotion] as const)]),
    clips: [...((old?.clips ?? []) as { name: string }[]).filter((c) => !redone.has(c.name)), ...out.map((b) => b.anim.toJSON())],
  };
  await save('clips', `${spec.id}.json`, JSON.stringify(json));
  if (o.frames !== false && spec.frames !== false) {
    for (const b of out) if (!spec.frames || spec.frames.includes(b.spec.name)) await sideBySide(spec, b, rig);
  }
  return report;
}

// ── side-by-side frames: the source video next to the rig playing the baked clip ─────────────────────────────
let gl: THREE.WebGLRenderer | null = null;
const W = 720, H = 540;
const videoEl = async (id: string) => {
  const v = document.createElement('video');
  // a blob URL: the dev middleware streams without Range support, so a plain URL can't seek
  const blob = await fetch(`/__rrvideo/${id}`).then((r) => r.blob());
  v.muted = true; v.src = URL.createObjectURL(blob); v.preload = 'auto';
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0' });
  document.body.appendChild(v);
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video')); });
  return v;
};
const seekTo = (v: HTMLVideoElement, t: number) => new Promise<void>((res) => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 3000); });

export async function sideBySide(spec: CharacterSpec, b: BakedClip, rig: THREE.Object3D, count = 4) {
  gl ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, canvas: document.createElement('canvas') });
  gl.setSize(W, H, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x15131c);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 2.2));
  const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(2, 4, 3); scene.add(dl);
  const grid = new THREE.GridHelper(6, 12, 0x6a5acd, 0x2a2840); scene.add(grid);
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const model = clone(rig);
  const box = new THREE.Box3().setFromObject(model), h = box.max.y - box.min.y;
  model.scale.setScalar(1.9 / h);
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const act = mixer.clipAction(b.anim); act.play();
  // the source skeleton beside the rig, so a bad frame shows which stage went wrong: the solver's own skeleton for a
  // video clip, the CMU performer (turned to face +Z, scaled to the rig) for a library take
  let skRoot: THREE.Object3D, skMixer: THREE.AnimationMixer, skHip: () => THREE.Vector3;
  if (b.cmuSrc) {
    const { clone: cl } = await import('three/examples/jsm/utils/SkeletonUtils.js');
    const fb = cl(b.cmuSrc.obj); restPoseOf(fb);
    const hipY = fb.getObjectByName('hip')!.getWorldPosition(new THREE.Vector3()).y;
    const wrap = new THREE.Group(); wrap.add(fb); wrap.rotation.y = -b.cmuSrc.yaw; wrap.scale.setScalar(1.0 / Math.max(1e-3, hipY));
    skRoot = wrap; skMixer = new THREE.AnimationMixer(fb); skMixer.clipAction(b.cmuSrc.clip).play();
    const hip = fb.getObjectByName('hip')!;
    skHip = () => { wrap.position.set(0, 0, 0); wrap.updateMatrixWorld(true); return hip.getWorldPosition(new THREE.Vector3()); };
    scene.add(new THREE.SkeletonHelper(fb));
  } else {
    const sk = clipToThree(b.game!);
    skRoot = new THREE.Group(); skRoot.add(sk.root);
    skMixer = new THREE.AnimationMixer(skRoot); skMixer.clipAction(sk.animation).play();
    scene.add(new THREE.SkeletonHelper(sk.root));
    skHip = () => { skRoot.position.set(0, 0, 0); skRoot.updateMatrixWorld(true); return sk.root.getWorldPosition(new THREE.Vector3()); };
  }
  scene.add(skRoot);
  // the camera where the video's camera was: the clip was turned by faceDeg to face +Z, so turn the camera back
  const yaw = THREE.MathUtils.degToRad(-b.faceDeg);
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
  const v = b.spec.video ? await videoEl(b.spec.video) : null;
  const cw = v ? Math.round(H * v.videoWidth / v.videoHeight) : 0;
  const out = document.createElement('canvas'); out.width = cw + W; out.height = H + 28;
  const g = out.getContext('2d')!;
  g.fillStyle = '#0b0a0f'; g.fillRect(0, 0, out.width, out.height);
  const dur = b.anim.duration;
  const rows: HTMLCanvasElement[] = [];
  for (let k = 0; k < count; k++) {
    const u = count === 1 ? 0.5 : k / (count - 1);
    const tClip = Math.min(dur - 1e-3, u * dur);
    // reversed / mirrored clips map back onto the footage by time-reversal; mirrored ones are drawn flipped
    const tVid = b.spec.reverse ? b.spec.to - tClip / (b.spec.rate ?? 1) : b.spec.from + tClip * (b.spec.rate ?? 1) / 1;
    if (v) await seekTo(v, Math.max(0, tVid));
    mixer.setTime(tClip); model.updateMatrixWorld(true);
    skMixer.setTime(b.cmuSrc ? Math.min(b.cmuSrc.clip.duration - 1e-3, tClip) : tClip);
    const hips = model.getObjectByName('Hips') ?? model;
    const c = hips.getWorldPosition(new THREE.Vector3());
    // stick figure stands to the rig's right (screen), hips level with the rig's
    const sh = skHip();
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(1.3);
    skRoot.position.set(c.x - sh.x + side.x, 0, c.z - sh.z + side.z); skRoot.updateMatrixWorld(true);
    c.addScaledVector(side, 0.5);
    cam.position.set(c.x + Math.sin(yaw) * 6.5, 1.3, c.z + Math.cos(yaw) * 6.5); cam.lookAt(c.x, 0.95, c.z);
    gl.render(scene, cam);
    const row = document.createElement('canvas'); row.width = out.width; row.height = out.height;
    const rg = row.getContext('2d')!;
    rg.fillStyle = '#0b0a0f'; rg.fillRect(0, 0, row.width, row.height);
    if (v) { rg.save(); if (b.spec.mirror) { rg.translate(cw, 0); rg.scale(-1, 1); } rg.drawImage(v, 0, 0, cw, H); rg.restore(); }
    rg.drawImage(gl.domElement, cw, 0, W, H);
    rg.fillStyle = '#e8e4ff'; rg.font = '15px sans-serif';
    rg.fillText(`${spec.id} · ${b.spec.name} · ${b.spec.video ? `video ${b.spec.video}` : `CMU ${b.spec.cmu} (stick figure)`} @ ${tVid.toFixed(2)}s${b.spec.mirror ? ' (mirrored)' : ''}${b.spec.reverse ? ' (reversed)' : ''}  |  rig t=${tClip.toFixed(2)}s`, 8, H + 19);
    rows.push(row);
  }
  v?.remove();
  const sheet = document.createElement('canvas'); sheet.width = out.width; sheet.height = out.height * rows.length;
  rows.forEach((r, i) => sheet.getContext('2d')!.drawImage(r, 0, i * out.height));
  const blob = await new Promise<Blob>((res) => sheet.toBlob((x) => res(x!), 'image/jpeg', 0.82));
  await save('docs', `${spec.id}/${b.spec.name}.jpg`, blob);
  mixer.stopAllAction();
}

const SPECS = import.meta.glob('../../scripts/riftrealm/clips/*.json', { import: 'default' });
/** Bake a character from its spec, scripts/riftrealm/clips/<id>.json; `only` re-bakes some clips and keeps the rest. */
export async function bakeFile(id: string, o: { frames?: boolean; only?: string[] } = {}) {
  const load = SPECS[`../../scripts/riftrealm/clips/${id}.json`];
  if (!load) throw new Error(`no spec ${id}`);
  const spec = structuredClone(await load()) as CharacterSpec;
  if (o.only) spec.clips = spec.clips.filter((c) => o.only!.includes(c.name));
  return bake(spec, { ...o, merge: !!o.only });
}
