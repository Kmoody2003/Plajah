// Lab helpers for the VTuber rig builder (fanroom-lab only). In the page console:
//   const L = await import('/components/taleo/dev/vtuberRigLab.ts');
//   await L.build('jack_thorne');   // GLB → VRM, saved to public/games/ravencrest/assets/vtuber
//   await L.sheet('jack_thorne');   // expression sheet overlay + MediaPipe read-back scores
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildVtuberRig, type BuildOptions } from '../../../services/vtuber/rigBuilder/buildVtuberRig';
import { FRONT_VIEW, frontCamera } from '../../../services/vtuber/rigBuilder/anchorFit';
import { loadVrmRig, poseStageRig } from '../../../services/halloween/ravencrestCastStage';
import { NEUTRAL_FACE } from '../../../services/halloween/castFaceRig';

const CHARS = '/games/ravencrest/assets/characters';
const OUT = '/games/ravencrest/assets/vtuber';

export async function build(name: string, displayName = name, opts: BuildOptions = {}) {
  const t0 = performance.now();
  let report: unknown;
  try {
    const r = await buildVtuberRig(`${CHARS}/${name}.glb`, { name: displayName, authors: ['Plajah · Ravencrest'] }, opts);
    const resp = await fetch(`/__vtuber?name=${name}.vrm`, { method: 'POST', body: r.vrm });
    report = { ...r.report, ms: Math.round(performance.now() - t0), saved: resp.status };
  } catch (e: any) {
    report = { error: String(e?.stack || e).slice(0, 1200), ms: Math.round(performance.now() - t0) };
  }
  await fetch(`/__vtuber?name=${name}_report.json`, { method: 'POST', body: JSON.stringify(report, null, 1) });
  return report;
}

/** Tests in PERFORMER terms (the puppet mirrors them); `check` = what MediaPipe should read back. */
const TESTS: Array<[string, Record<string, number>, string[]]> = [
  ['neutral', {}, ['jawOpen', 'eyeBlinkLeft', 'mouthSmileLeft']],
  ['jawOpen', { jawOpen: 0.8 }, ['jawOpen']],
  ['blink', { eyeBlinkLeft: 1, eyeBlinkRight: 1 }, ['eyeBlinkLeft', 'eyeBlinkRight']],
  ['smile', { mouthSmileLeft: 1, mouthSmileRight: 1 }, ['mouthSmileLeft', 'mouthSmileRight']],
  ['ooh', { mouthFunnel: 1, mouthPucker: 0.6 }, ['mouthFunnel', 'mouthPucker']],
  ['surprise', { browInnerUp: 1, eyeWideLeft: 1, eyeWideRight: 1, jawOpen: 0.35 }, ['browInnerUp', 'eyeWideLeft']],
  ['angry', { browDownLeft: 1, browDownRight: 1, noseSneerLeft: 0.7, noseSneerRight: 0.7 }, ['browDownLeft', 'browDownRight']],
  ['gaze', { eyeLookOutLeft: 1, eyeLookInRight: 1 }, ['eyeLookOutLeft', 'eyeLookInRight']],
  ['frown', { mouthFrownLeft: 1, mouthFrownRight: 1, browInnerUp: 0.6 }, ['mouthFrownLeft', 'mouthFrownRight']],
  ['winkL', { eyeBlinkLeft: 1 }, ['eyeBlinkLeft', 'eyeBlinkRight']],
];

let landmarker: Promise<any> | null = null;

export async function sheet(name: string) {
  const rig = await loadVrmRig(`${OUT}/${name}.vrm`);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6a6a70);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffeedd, 2.6);
  key.position.set(0.5, 1.6, 3);
  scene.add(key);
  scene.add(rig.root);
  const W = 200, H = 240;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(W, H);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.3;
  landmarker ??= (async () => {
    const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const vision: any = await import(/* @vite-ignore */ CDN);
    const fs = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    return vision.FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputFaceBlendshapes: true,
    });
  })();
  const fl = await landmarker;
  const strip = document.createElement('canvas');
  strip.width = W * 5;
  strip.height = H * 2;
  const sx = strip.getContext('2d')!;
  sx.font = '12px sans-serif';
  sx.fillStyle = '#fff';
  const scores: Record<string, unknown> = {};
  TESTS.forEach(([label, blend, check], i) => {
    rig.blend = blend;
    rig.expression = { ...NEUTRAL_FACE };
    for (let k = 0; k < 3; k++) poseStageRig(rig, 1 / 30, { yaw: 0, pitch: 0, roll: 0 }, 0);
    rig.root.updateMatrixWorld(true);
    // Same head framing as the hand-fit view (copes with every head size).
    let body: THREE.SkinnedMesh | null = null;
    rig.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && (o.name === 'Body' || !body)) body = o as THREE.SkinnedMesh; });
    const cam = frontCamera(rig.head!, body!);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    r.render(scene, cam);
    sx.drawImage(r.domElement, (i % 5) * W, Math.floor(i / 5) * H);
    sx.fillText(label, (i % 5) * W + 4, Math.floor(i / 5) * H + 14);
    const cats = fl.detect(r.domElement)?.faceBlendshapes?.[0]?.categories ?? [];
    const m = Object.fromEntries(cats.map((c: any) => [c.categoryName, +c.score.toFixed(2)]));
    scores[label] = cats.length ? Object.fromEntries(check.map((k) => [k, m[k]])) : 'no face';
  });
  r.dispose();
  document.getElementById('__strip')?.remove();
  const holder = document.createElement('div');
  holder.id = '__strip';
  holder.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000';
  holder.appendChild(strip);
  document.body.appendChild(holder);
  const blob = await new Promise<Blob>((res) => strip.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  await fetch(`/__vtuber?name=${name}_sheet.jpg`, { method: 'POST', body: blob });
  return scores;
}

/** Head-on render (the hand-fit camera) with a labelled 64 px grid, saved as <name>_front.jpg. */
export async function frontShot(name: string) {
  const gltf = await new GLTFLoader().loadAsync(`${CHARS}/${name}.glb`);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x777777);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(0, 1.5, 3);
  scene.add(key);
  scene.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const head = gltf.scene.getObjectByName('Head')!;
  let mesh: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => { if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  const N = FRONT_VIEW.size;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(N, N);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.5;
  r.render(scene, frontCamera(head, mesh!));
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.drawImage(r.domElement, 0, 0);
  r.dispose();
  g.strokeStyle = 'rgba(0,255,255,0.35)';
  g.fillStyle = '#0ff';
  g.font = '11px monospace';
  for (let v = 64; v < N; v += 64) {
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, N); g.stroke();
    g.beginPath(); g.moveTo(0, v); g.lineTo(N, v); g.stroke();
    g.fillText(String(v), v + 2, 11);
    g.fillText(String(v), 2, v - 2);
  }
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9));
  return (await fetch(`/__vtuber?name=${name}_front.jpg`, { method: 'POST', body: blob })).status;
}
