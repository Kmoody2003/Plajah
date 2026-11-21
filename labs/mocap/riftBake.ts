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
import { bakeRecipe, type ClipRecipe, type RootMotion } from '../../services/mocap/gameClip';
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
  video: string;
  /** Seconds in the source video. */
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

export interface BakedClip { spec: ClipSpec; solved: MotionClip; game: MotionClip; anim: THREE.AnimationClip; rootMotion: RootMotion; levelDeg: number; faceDeg: number; shot: { from: number; to: number } }

/** Solve one clip spec: the whole camera shot that holds it is solved (more context for the smoothing, the floor
 *  and the contacts), then the move is cut out of it. */
export async function solveClip(spec: ClipSpec, rig: THREE.Object3D): Promise<BakedClip> {
  const take = await takeOf(spec.video);
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

export async function bake(spec: CharacterSpec, o: { frames?: boolean; merge?: boolean } = {}) {
  const rig = await loadRig(spec.glb);
  const out: BakedClip[] = [];
  const report: Record<string, unknown>[] = [];
  for (const c of spec.clips) {
    try {
      const b = await solveClip(c, rig);
      out.push(b);
      report.push({ name: c.name, video: c.video, from: c.from, to: c.to, grade: b.solved.quality.grade, occlusion: b.solved.quality.occlusion, jitter: b.solved.quality.jitter, skate: b.solved.quality.skate, level: b.levelDeg, face: b.faceDeg, rootMotion: b.rootMotion, frames: b.game.frames });
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
    source: Object.fromEntries([...Object.entries(old?.source ?? {}).filter(([k]) => !redone.has(k)), ...out.map((b) => [b.spec.name, { video: b.spec.video, from: b.spec.from, to: b.spec.to, note: b.spec.note, mirror: !!b.spec.mirror, reverse: !!b.spec.reverse, loop: !!b.spec.loop, grade: b.solved.quality.grade }] as const)]),
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
  // the solver's own skeleton (before retargeting), beside the rig, so a bad frame shows which stage went wrong
  const sk = clipToThree(b.game);
  const skRoot = new THREE.Group(); skRoot.add(sk.root); scene.add(skRoot);
  const helper = new THREE.SkeletonHelper(sk.root); (helper.material as THREE.LineBasicMaterial).linewidth = 2; scene.add(helper);
  const skMixer = new THREE.AnimationMixer(skRoot); skMixer.clipAction(sk.animation).play();
  // the camera where the video's camera was: the clip was turned by faceDeg to face +Z, so turn the camera back
  const yaw = THREE.MathUtils.degToRad(-b.faceDeg);
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
  const v = await videoEl(b.spec.video);
  const vw = v.videoWidth, vh = v.videoHeight, cw = Math.round(H * vw / vh);
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
    await seekTo(v, Math.max(0, tVid));
    mixer.setTime(tClip); model.updateMatrixWorld(true);
    skMixer.setTime(tClip);
    const hips = model.getObjectByName('Hips') ?? model;
    const c = hips.getWorldPosition(new THREE.Vector3());
    // stick figure stands to the rig's right (screen), hips level with the rig's
    const sh = sk.root.position;
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(1.3);
    skRoot.position.set(c.x - sh.x + side.x, 0, c.z - sh.z + side.z); skRoot.updateMatrixWorld(true);
    c.addScaledVector(side, 0.5);
    cam.position.set(c.x + Math.sin(yaw) * 6.5, 1.3, c.z + Math.cos(yaw) * 6.5); cam.lookAt(c.x, 0.95, c.z);
    gl.render(scene, cam);
    const row = document.createElement('canvas'); row.width = out.width; row.height = out.height;
    const rg = row.getContext('2d')!;
    rg.fillStyle = '#0b0a0f'; rg.fillRect(0, 0, row.width, row.height);
    rg.save(); if (b.spec.mirror) { rg.translate(cw, 0); rg.scale(-1, 1); }
    rg.drawImage(v, 0, 0, cw, H); rg.restore();
    rg.drawImage(gl.domElement, cw, 0, W, H);
    rg.fillStyle = '#e8e4ff'; rg.font = '15px sans-serif';
    rg.fillText(`${spec.id} · ${b.spec.name} · video ${b.spec.video} @ ${tVid.toFixed(2)}s${b.spec.mirror ? ' (mirrored)' : ''}${b.spec.reverse ? ' (reversed)' : ''}  |  rig t=${tClip.toFixed(2)}s`, 8, H + 19);
    rows.push(row);
  }
  v.remove();
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
