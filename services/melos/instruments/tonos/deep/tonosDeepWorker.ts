// TONOS deep body, off the main thread: build the instrument's body modes (deepBody.ts), record
// each note's bridge force and floors from a worker-side DSP engine (pa_tonos_excitation), match the
// floors' level, and render on WebGPU (soma/deep/gpuModal.ts — WebGPU works in dedicated workers).

import { applyScales, bandpassDrive, buildTonosDeepBody, floorScales, floorsBelow, layerFrames, type TonosDeepSet } from './deepBody';
import { modalGpu, renderModalBatch, type ModalJob } from '../../soma/deep/gpuModal';
import { lruSet, lruTouch, trimSilenceTail } from '../../soma/deep/deepUtil';

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
  return `${sr}|${m.get(TN_INSTRUMENT) ?? 0}|${m.get(2014) ?? 0.5}|${m.get(2015) ?? 0.5}|${m.get(2029) ?? 0.35}|${m.get(2030) ?? 0.25}`;
}
function setFor(params: Array<[number, number]>, sr: number): TonosDeepSet | null {
  const key = bodyKey(params, sr);
  const hit = lruTouch(sets, key);
  if (hit !== undefined || sets.has(key)) return hit ?? null;
  const m = new Map(params);
  const built = buildTonosDeepBody(m.get(TN_INSTRUMENT) ?? 0, (id) => m.get(id) ?? NaN, sr);
  lruSet(sets, key, built, 24);
  return built;
}

// Calibration (floorScales, ~1–2 s) depends on the note's partials and the body, hardly on how hard
// it's played (the drive scales with velocity): done once per patch × note, reused for every level.
const scaleCache = new Map<string, Float32Array | null>();
function scaleKey(j: TonosDeepJob): string {
  return `${j.params.map(([id, v]) => `${id}:${Math.round(v * 1e4)}`).join(',')}|${j.note}|${j.sr}`;
}

interface CachedTonosWasm {
  mod: WebAssembly.Module;
  x: Exports;
  eng: number;
  lastKey: string;
}
let cachedWasm: CachedTonosWasm | null = null;

function ensureTonosEngine(module: WebAssembly.Module, sr: number, params: Array<[number, number]>): { x: Exports; eng: number } {
  const key = `${sr}|${params.map(([id, v]) => `${id}=${v}`).join(',')}`;
  if (!cachedWasm || cachedWasm.mod !== module) {
    const x = new WebAssembly.Instance(module, {}).exports as unknown as Exports;
    const eng = x.pa_create(sr);
    for (const [id, v] of params) x.pa_set_param(eng, id, v);
    cachedWasm = { mod: module, x, eng, lastKey: key };
    return { x, eng };
  }
  if (cachedWasm.lastKey !== key) {
    if (cachedWasm.eng) cachedWasm.x.pa_destroy(cachedWasm.eng);
    cachedWasm.eng = cachedWasm.x.pa_create(sr);
    for (const [id, v] of params) cachedWasm.x.pa_set_param(cachedWasm.eng, id, v);
    cachedWasm.lastKey = key;
  }
  return { x: cachedWasm.x, eng: cachedWasm.eng };
}

/** Each job's note: the force on the bridge and the floors' sound, trimmed to where they've died. */
function notes(module: WebAssembly.Module, jobs: TonosDeepJob[]): Array<{ drive: Float32Array; floors: Float32Array; rest: Float32Array; below: Float32Array }> {
  return jobs.map((j) => {
    const { x, eng } = ensureTonosEngine(module, j.sr, j.params);
    const frames = Math.round(MAX_SECONDS * j.sr);
    const ptr = x.pa_tonos_excitation(eng, j.note, j.vb, j.variant, frames);
    const v = new Float32Array(x.memory.buffer, ptr, 3 * frames);
    const floors = v.slice(frames, 2 * frames);
    const len = layerFrames(floors, j.sr, frames);
    return {
      drive: bandpassDrive(v.subarray(0, len)),
      floors: floors.subarray(0, len),
      rest: v.slice(2 * frames, 2 * frames + len),
      below: floorsBelow(floors.subarray(0, len), j.sr),
    };
  });
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
    const hit = lruTouch(scaleCache, sk);
    if (hit !== undefined || scaleCache.has(sk)) return hit ? applyScales(bodies[i]!, hit) : null;
    const computed = floorScales(bodies[i]!, rec[k].drive, rec[k].floors, req.jobs[i].sr, rec[k].rest, rec[k].below);
    lruSet(scaleCache, sk, computed, 256);
    return computed ? applyScales(bodies[i]!, computed) : null;
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
      const raw = res.outputs[b], len = rec[k].drive.length, below = rec[k].below;
      for (let s = 0; s < len; s++) { raw[s] += below[s]; raw[len + s] += below[s]; }
      const trimmed = trimSilenceTail(raw, true, len, Math.min(len, 2048));
      out.results[i] = { data: trimmed.data, frames: trimmed.frames, modes: bodies[i]!.modes };
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
