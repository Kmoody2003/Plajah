// kaijuDances — loads the baked CMU motion-capture dances (scripts/mocap/bakeKaijuDances.mjs) and turns
// them into THREE.AnimationClips for the Chora / Reello skeleton.
//
//   /models/mascots/dances/dances.json   index (names, style tags, energy, beat period)
//   /models/mascots/dances/dances.bin    int16 frames: 14 bones × quaternion + hips position
//
// Mocap credit (shown in the stage HUD): "Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)".

import * as THREE from 'three';

import { type DanceMeta } from './kaijuDanceCommon';
export { danceTimeScale, pickDance } from './kaijuDanceCommon';
export type { DanceMeta, DanceStyle } from './kaijuDanceCommon';

interface DanceIndex { fps: number; bones: string[]; perFrame: number; posScale: number; quatScale: number; credit: string; clips: DanceMeta[] }

export interface Dances {
  index: DanceIndex;
  credit: string;
  metas: DanceMeta[];
  clip(meta: DanceMeta): THREE.AnimationClip;
}

const BASE = '/models/mascots/dances/';
let loading: Promise<Dances | null> | null = null;

export function loadDances(): Promise<Dances | null> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [jr, br] = await Promise.all([fetch(BASE + 'dances.json'), fetch(BASE + 'dances.bin')]);
      if (!jr.ok || !br.ok) return null;
      const index: DanceIndex = await jr.json();
      const data = new Int16Array(await br.arrayBuffer());
      const cache = new Map<string, THREE.AnimationClip>();
      const dances: Dances = {
        index, credit: index.credit, metas: index.clips,
        clip(meta) {
          const hit = cache.get(meta.id); if (hit) return hit;
          const n = meta.frames, per = index.perFrame, base = meta.offset / 2, nb = index.bones.length;
          const times = new Float32Array(n); for (let k = 0; k < n; k++) times[k] = k / index.fps;
          const tracks: THREE.KeyframeTrack[] = [];
          for (let b = 0; b < nb; b++) {
            const v = new Float32Array(n * 4);
            for (let k = 0; k < n; k++) for (let c = 0; c < 4; c++) v[k * 4 + c] = data[base + k * per + b * 4 + c] / index.quatScale;
            tracks.push(new THREE.QuaternionKeyframeTrack(`${index.bones[b]}.quaternion`, times, v));
          }
          const p = new Float32Array(n * 3);
          for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) p[k * 3 + c] = data[base + k * per + nb * 4 + c] / index.posScale;
          tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, p));
          const clip = new THREE.AnimationClip(meta.id, n / index.fps, tracks);
          cache.set(meta.id, clip); return clip;
        },
      };
      return dances;
    } catch { return null; }
  })();
  return loading;
}

