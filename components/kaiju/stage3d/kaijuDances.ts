// kaijuDances — loads the baked CMU motion-capture dances (scripts/mocap/bakeKaijuDances.mjs) and turns
// them into THREE.AnimationClips for the Chora / Reello skeleton.
//
//   /models/mascots/dances/dances.json   index (names, style tags, energy, beat period)
//   /models/mascots/dances/dances.bin    int16 frames: 14 bones × quaternion + hips position
//
// Mocap credit (shown in the stage HUD): "Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)".

import * as THREE from 'three';

import { type DanceMeta } from './kaijuDanceCommon';
export { danceTimeScale, pickDance, isDance } from './kaijuDanceCommon';
export type { DanceMeta, DanceStyle } from './kaijuDanceCommon';

interface DanceIndex { fps: number; bones: string[]; perFrame: number; posScale: number; quatScale: number; credit: string; clips: DanceMeta[] }

export interface Dances {
  index: DanceIndex;
  /** where it was loaded from, and whether it is the v2 (per-character, 16-bone) bake */
  base: string; v2: boolean;
  byId: Map<string, DanceMeta>;
  credit: string;
  metas: DanceMeta[];
  clip(meta: DanceMeta): THREE.AnimationClip;
}

/** v1 bake (old skeleton, shared by both characters) and the v2 per-character bakes (old 14 bones + foot_L/foot_R). */
export const DANCES_V1 = '/models/mascots/dances/';
export const dancesV2Base = (who: string) => `/models/mascots/v2/dances/${who}/`;
const loading = new Map<string, Promise<Dances | null>>();

/** Load one bake. Returns null (never throws) when it is missing — the dev server answers 404s with index.html, so the JSON is validated. */
export function loadDancesFrom(base: string): Promise<Dances | null> {
  let p = loading.get(base);
  if (p) return p;
  p = (async () => {
    try {
      const [jr, br] = await Promise.all([fetch(base + 'dances.json'), fetch(base + 'dances.bin')]);
      if (!jr.ok || !br.ok) return null;
      const index: DanceIndex = await jr.json();
      if (!Array.isArray(index?.clips) || !Array.isArray(index?.bones)) return null;
      const buf = await br.arrayBuffer(); if (buf.byteLength < 1000) return null;
      const data = new Int16Array(buf);
      const cache = new Map<string, THREE.AnimationClip>();
      const dances: Dances = {
        index, credit: index.credit, metas: index.clips, base, v2: base !== DANCES_V1,
        byId: new Map(index.clips.map(c => [c.id, c])),
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
  loading.set(base, p);
  return p;
}

/** The dances for a character: the v2 per-character bake for the v2 rig (falls back to the v1 bake if it is missing), v1 for the old rig. */
export async function loadDances(who: string = 'chora', rig: 'v2' | 'old' = 'old'): Promise<Dances | null> {
  if (rig === 'v2') { const d = await loadDancesFrom(dancesV2Base(who)); if (d) return d; }
  return loadDancesFrom(DANCES_V1);
}
