// TONOS deep body, off the main thread: build the instrument's body modes (deepBody.ts), record
// each note's bridge force and floors from a worker-side DSP engine (pa_tonos_excitation), match the
// floors' level, and render on WebGPU (soma/deep/gpuModal.ts — WebGPU works in dedicated workers).

import { applyScales, bandpassDrive, buildTonosDeepBody, floorScales, floorsBelow, layerFrames, type TonosDeepSet } from './deepBody';
import { modalGpu, renderModalBatch, type ModalJob } from '../../soma/deep/gpuModal';

export interface TonosDeepJob {
  params: Array<[number, number]>;
  note: number;
  vb: number;
  variant: number;
  sr: number;
}
export interface TonosDeepRequest {
  id: number;
  module: WebAssembly.Module;
  jobs: TonosDeepJob[];
}
export interface TonosDeepResult {
  data: Float32Array;
  frames: number;
  modes: number;
}
export interface TonosDeepResponse {
  id: number;
  /** Per job: the layer, or null when the instrument has no deep body (bowed) or no floors. */
  results: Array<TonosDeepResult | null>;
  failed: boolean;
  gpuMs: number;
  gpu: string;
}

const MAX_SECONDS = 3;
const MAX_BATCH_GROUPS = 1024;
const TN_INSTRUMENT = 2001;

type Exports = Record<string, (...a: number[]) => number> & { memory: WebAssembly.Memory };

const sets = new Map<string, TonosDeepSet | null>();
function bodyKey(params: Array<[number, number]>, sr: number): string {
  const m = new Map(params);
  return `${sr}|${m.get(TN_INSTRUMENT) ?? 0}|${m.get(2014) ?? 0.5}|${m.get(2015) ?? 0.5}`;
}
function setFor(params: Array<[number, number]>, sr: number): TonosDeepSet | null {
  const m = new Map(params);
  const key = bodyKey(params, sr);
  if (!sets.has(key)) {
    if (sets.size > 24) sets.clear();
    sets.set(key, buildTonosDeepBody(m.get(TN_INSTRUMENT) ?? 0, (id) => m.get(id) ?? NaN, sr));
  }
  return sets.get(key)!;
}

// Calibration (floorScales, ~1–2 s) depends on the note's partials and the body, hardly on how hard
// it's played (the drive scales with velocity): done once per patch × note, reused for every level.
const scaleCache = new Map<string, Float32Array | null>();
function scaleKey(j: TonosDeepJob): string {
  return `${j.params.map(([id, v]) => `${id}:${Math.round(v * 1e4)}`).join(',')}|${j.note}|${j.sr}`;
}

/** Each job's note: the force on the bridge and the floors' sound, trimmed to where they've died. */
function notes(module: WebAssembly.Module, jobs: TonosDeepJob[]): Array<{ drive: Float32Array; floors: Float32Array; rest: Float32Array; below: Float32Array }> {
  const x = new WebAssembly.Instance(module, {}).exports as unknown as Exports;
  let eng = 0;
  let lastParams: Array<[number, number]> | null = null;
  try {
    return jobs.map((j) => {
      if (j.params !== lastParams) {
        if (eng) x.pa_destroy(eng);
        eng = x.pa_create(j.sr);
        for (const [id, v] of j.params) x.pa_set_param(eng, id, v);
        lastParams = j.params;
      }
      const frames = Math.round(MAX_SECONDS * j.sr);
      const ptr = x.pa_tonos_excitation(eng, j.note, j.vb, j.variant, frames);
      const v = new Float32Array(x.memory.buffer, ptr, 3 * frames);
      const floors = v.slice(frames, 2 * frames);
      const len = layerFrames(floors, j.sr, frames);
      return { drive: bandpassDrive(v.subarray(0, len)), floors: floors.subarray(0, len), rest: v.slice(2 * frames, 2 * frames + len), below: floorsBelow(floors.subarray(0, len), j.sr) };
    });
  } finally {
    if (eng) x.pa_destroy(eng);
  }
}

async function handle(req: TonosDeepRequest): Promise<TonosDeepResponse> {
  const gpu = await modalGpu();
  const out: TonosDeepResponse = { id: req.id, results: req.jobs.map(() => null), failed: !gpu, gpuMs: 0, gpu: gpu?.label ?? '' };
  if (!gpu) return out;
  const bodies = req.jobs.map((j) => setFor(j.params, j.sr));
  const live = req.jobs.map((_, i) => i).filter((i) => bodies[i]);
  const rec = notes(req.module, live.map((i) => req.jobs[i]));
  const coefs = live.map((i, k) => {
    const sk = scaleKey(req.jobs[i]);
    if (!scaleCache.has(sk)) {
      if (scaleCache.size > 256) scaleCache.clear();
      scaleCache.set(sk, floorScales(bodies[i]!, rec[k].drive, rec[k].floors, req.jobs[i].sr, rec[k].rest, rec[k].below));
    }
    const sc = scaleCache.get(sk);
    return sc ? applyScales(bodies[i]!, sc) : null;
  });
  const ready = live.map((i, k) => ({ i, k })).filter(({ k }) => coefs[k] && rec[k].drive.length >= 64);
  let at = 0;
  while (at < ready.length) {
    const batch: typeof ready = [];
    let groups = 0;
    while (at < ready.length && (!batch.length || groups + 2 * bodies[ready[at].i]!.groups <= MAX_BATCH_GROUPS)) {
      groups += 2 * bodies[ready[at].i]!.groups;
      batch.push(ready[at++]);
    }
    const jobs: ModalJob[] = batch.map(({ i, k }) => ({ coef: coefs[k]!, groups: bodies[i]!.groups, frames: rec[k].drive.length, excite: rec[k].drive }));
    const res = await renderModalBatch(jobs);
    if (!res) { out.failed = true; return out; }
    out.gpuMs += res.gpuMs;
    batch.forEach(({ i, k }, b) => {
      // The layer = the GPU's modes plus the floors' own part below them (both channels).
      const data = res.outputs[b], len = rec[k].drive.length, below = rec[k].below;
      for (let s = 0; s < len; s++) { data[s] += below[s]; data[len + s] += below[s]; }
      out.results[i] = { data, frames: len, modes: bodies[i]!.modes };
    });
  }
  return out;
}

self.onmessage = (e: MessageEvent<TonosDeepRequest>) => {
  handle(e.data)
    .catch((err): TonosDeepResponse => { console.warn('[tonos deep] worker', err); return { id: e.data.id, results: e.data.jobs.map(() => null), failed: true, gpuMs: 0, gpu: '' }; })
    .then((res) => {
      const transfer = res.results.flatMap((r) => (r ? [r.data.buffer] : []));
      (self as unknown as Worker).postMessage(res, transfer);
    });
};
