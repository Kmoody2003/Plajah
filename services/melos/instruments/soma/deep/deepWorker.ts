// SOMA deep skin, off the main thread: build each strike's modes (deepModes.ts), record the strike
// from a worker-side DSP engine (pa_soma_excitation), match the cloud's level and decay, and render
// on WebGPU (gpuModal.ts — WebGPU works in dedicated workers). A DAW's UI thread never pays for it.

import { buildDeepModes, DEEP_MODE_BUDGET, matchCloudLevel, type DeepModeSet } from './deepModes';
import { modalGpu, renderModalBatch, type ModalJob } from './gpuModal';

export interface DeepWorkerJob {
  params: Array<[number, number]>;
  note: number;
  vb: number;
  variant: number;
  sr: number;
}
export interface DeepWorkerRequest {
  id: number;
  module: WebAssembly.Module;
  jobs: DeepWorkerJob[];
}
export interface DeepWorkerResult {
  data: Float32Array;
  frames: number;
  topRatio: number;
  modes: number;
}
export interface DeepWorkerResponse {
  id: number;
  /** Per job: the layer, or null when the drum has nothing above its explicit modes. */
  results: Array<DeepWorkerResult | null>;
  /** True when the GPU was unavailable or failed (the caller cools down; strikes stay on the cloud). */
  failed: boolean;
  gpuMs: number;
  gpu: string;
}

const EXCITE_FRAMES = 12288; // 256 ms: the strike force is ~50 ms; the cloud it's matched to rings longer
const DRIVE_FRAMES = 4096;   // what the GPU is driven with (block 0)
const MAX_BATCH_GROUPS = 1536; // keeps the GPU scratch near 25 MB

type Exports = Record<string, (...a: number[]) => number> & { memory: WebAssembly.Memory };

/** Each job's strike: the force fed to the membrane and the cloud's output for the same strike. */
function strikes(module: WebAssembly.Module, jobs: DeepWorkerJob[]): Array<{ drive: Float32Array; cloud: Float32Array }> {
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
      const ptr = x.pa_soma_excitation(eng, j.note, j.vb, 0x5eed + j.variant * 7919 + j.note, EXCITE_FRAMES);
      const v = new Float32Array(x.memory.buffer, ptr, 2 * EXCITE_FRAMES);
      return { drive: v.slice(0, EXCITE_FRAMES), cloud: v.slice(EXCITE_FRAMES) };
    });
  } finally {
    if (eng) x.pa_destroy(eng);
  }
}

async function handle(req: DeepWorkerRequest): Promise<DeepWorkerResponse> {
  const gpu = await modalGpu();
  const out: DeepWorkerResponse = { id: req.id, results: req.jobs.map(() => null), failed: !gpu, gpuMs: 0, gpu: gpu?.label ?? '' };
  if (!gpu) return out;
  const sets: Array<DeepModeSet | null> = req.jobs.map((j) => {
    const m = new Map(j.params);
    return buildDeepModes((id) => m.get(id) ?? 0, j.note, j.vb, j.sr, j.variant, DEEP_MODE_BUDGET);
  });
  const live = req.jobs.map((_, i) => i).filter((i) => sets[i]);
  const hits = strikes(req.module, live.map((i) => req.jobs[i]));
  live.forEach((i, k) => matchCloudLevel(sets[i]!, hits[k].drive, hits[k].cloud, req.jobs[i].sr));
  // GPU batches sized to keep scratch memory bounded.
  let at = 0;
  while (at < live.length) {
    const batch: number[] = [];
    let groups = 0;
    while (at < live.length && (!batch.length || groups + 2 * sets[live[at]]!.groups <= MAX_BATCH_GROUPS)) {
      groups += 2 * sets[live[at]]!.groups;
      batch.push(at++);
    }
    const jobs: ModalJob[] = batch.map((k) => {
      const s = sets[live[k]]!;
      return { coef: s.coef, groups: s.groups, frames: s.frames, excite: hits[k].drive.subarray(0, DRIVE_FRAMES) };
    });
    const res = await renderModalBatch(jobs);
    if (!res) { out.failed = true; return out; }
    out.gpuMs += res.gpuMs;
    batch.forEach((k, b) => {
      const s = sets[live[k]]!;
      out.results[live[k]] = { data: res.outputs[b], frames: s.frames, topRatio: s.topRatio, modes: s.modes };
    });
  }
  return out;
}

self.onmessage = (e: MessageEvent<DeepWorkerRequest>) => {
  handle(e.data)
    .catch((): DeepWorkerResponse => ({ id: e.data.id, results: e.data.jobs.map(() => null), failed: true, gpuMs: 0, gpu: '' }))
    .then((res) => {
      const transfer = res.results.flatMap((r) => (r ? [r.data.buffer] : []));
      (self as unknown as Worker).postMessage(res, transfer);
    });
};
