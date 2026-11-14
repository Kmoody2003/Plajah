// SOMA deep skin: GPU-rendered upper membranes, cached per strike and played inside the voice.
//
// A SOMA strike on the CPU steps 16 membrane modes against the striker and approximates the rest
// with a noise cloud. Here the rest is rendered for real — up to DEEP_MODE_BUDGET modes per strike
// (deepModes.ts) on the GPU (gpuModal.ts) — once per preset × note × velocity level × variant, and
// handed to the engine as a sample slot. `pa_note_on_deep` then plays that layer into the voice's
// top-skin radiation, so mic perspective, shell, early room and the Veil all apply, and the
// cloud bands it replaces go quiet.
//
// Nothing here is on the audio thread, the main thread only keeps the cache (the work runs in
// deepWorker.ts), and nothing waits on the GPU: a strike whose layer isn't cached plays exactly as
// before (cloud) and asks for it; the next one is deep. No WebGPU, a lost device, an error or a
// slow batch all land on that same path.

import type { DeepWorkerRequest, DeepWorkerResponse } from './deepWorker';

export interface DeepHit {
  /** Channel-major stereo, length 2·frames. */
  data: Float32Array;
  frames: number;
  /** Cloud bands below this ratio (× base pitch) are replaced by the layer. */
  topRatio: number;
  modes: number;
}

const VEL_LEVELS = 8;
export const DEEP_VARIANTS = 2;
const MAX_CACHE_FLOATS = 16 * 1024 * 1024; // 64 MB
const BATCH_STRIKES = 32;                   // one worker round trip: two notes' worth
const SLOW_BATCH_MS = 6000;

/** Velocity level a strike is rendered at; the voice scales the layer from it. */
export function deepVelBucket(v: number): number {
  return Math.max(1, Math.min(VEL_LEVELS, Math.ceil(Math.max(0.02, Math.min(1, v)) * VEL_LEVELS))) / VEL_LEVELS;
}

/** Stable key of everything in SOMA's parameter block (1800..1899) — what shapes a strike. */
export function somaParamsKey(params: Map<number, number>): string {
  const ids = [...params.keys()].filter((id) => id >= 1800 && id < 1900).sort((a, b) => a - b);
  return ids.map((id) => `${id}:${Math.round((params.get(id) ?? 0) * 1e4)}`).join(',');
}

const hitKey = (paramsKey: string, note: number, vb: number, variant: number, sr: number) => `${paramsKey}|${note}|${vb}|${variant}|${sr}`;

const cache = new Map<string, DeepHit>();
let cacheFloats = 0;
const pending = new Set<string>();
/** Strikes with nothing above their explicit modes (a dead-centre hit): never asked for again. */
const none = new Set<string>();

interface Job {
  key: string;
  params: Map<number, number>;
  note: number;
  vb: number;
  variant: number;
  sr: number;
  module: () => Promise<WebAssembly.Module>;
}
const queue: Job[] = [];
const waiters: Array<() => void> = [];
let running = false;
let cooldownUntil = 0;
let cooldownMs = 15000;

const stats = { batches: 0, hits: 0, lastBatchMs: 0, lastBatchWallMs: 0, lastBatchHits: 0, lastModes: 0, gpu: '' };

function prefOff(): boolean {
  try { return globalThis.localStorage?.getItem('chora.somaDeep') === 'off'; } catch { return false; }
}

/** Whether deep strikes can be produced here at all (WebGPU present, not switched off). */
export function somaDeepSupported(): boolean {
  return !prefOff() && somaDeepAvailable();
}

/** Whether this browser has WebGPU at all (the switch can't turn on without it). */
export function somaDeepAvailable(): boolean {
  return !!(globalThis.navigator as Navigator & { gpu?: unknown })?.gpu;
}

/** The user's switch (on unless turned off). Off: every strike plays on the CPU cloud. */
export function somaDeepEnabled(): boolean {
  return !prefOff();
}

export function setSomaDeepEnabled(on: boolean): void {
  try { globalThis.localStorage?.setItem('chora.somaDeep', on ? 'on' : 'off'); } catch { /* private mode: stays on */ }
}

export function lookupDeep(paramsKey: string, note: number, velocity: number, variant: number, sr: number): DeepHit | undefined {
  const k = hitKey(paramsKey, note, deepVelBucket(velocity), variant, sr);
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); } // LRU touch
  return hit;
}

/**
 * Ask for every velocity level and variant of `note` on this preset (one GPU batch renders them
 * together). Resolves when the queue has drained; never rejects.
 */
export function requestDeep(params: Map<number, number>, paramsKey: string, note: number, sr: number, module: () => Promise<WebAssembly.Module>): Promise<void> {
  if (!somaDeepSupported() || performance.now() < cooldownUntil) return Promise.resolve();
  const snapshot = new Map(params);
  for (let l = 1; l <= VEL_LEVELS; l++) {
    for (let variant = 0; variant < DEEP_VARIANTS; variant++) {
      const vb = l / VEL_LEVELS;
      const key = hitKey(paramsKey, note, vb, variant, sr);
      if (cache.has(key) || pending.has(key) || none.has(key)) continue;
      pending.add(key);
      queue.push({ key, params: snapshot, note, vb, variant, sr, module });
    }
  }
  const done = new Promise<void>((res) => waiters.push(res));
  if (!running) { running = true; setTimeout(() => { void pump(); }, 0); }
  return done;
}

function store(key: string, hit: DeepHit): void {
  cache.set(key, hit);
  cacheFloats += hit.data.length;
  while (cacheFloats > MAX_CACHE_FLOATS && cache.size > 1) {
    const [k, v] = cache.entries().next().value as [string, DeepHit];
    cache.delete(k);
    cacheFloats -= v.data.length;
  }
}

let worker: Worker | null = null;
let nextId = 1;
const replies = new Map<number, (r: DeepWorkerResponse) => void>();

function deepWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./deepWorker.ts', import.meta.url), { type: 'module', name: 'soma-deep' });
    worker.onmessage = (e: MessageEvent<DeepWorkerResponse>) => { replies.get(e.data.id)?.(e.data); replies.delete(e.data.id); };
    worker.onerror = () => {
      for (const [id, r] of replies) r({ id, results: [], failed: true, gpuMs: 0, gpu: '' });
      replies.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function ask(req: DeepWorkerRequest): Promise<DeepWorkerResponse> {
  return new Promise((resolve) => {
    replies.set(req.id, resolve);
    deepWorker().postMessage(req);
  });
}

async function pump(): Promise<void> {
  try {
    while (queue.length && performance.now() >= cooldownUntil) {
      const batch = queue.splice(0, BATCH_STRIKES);
      const module = await batch[0].module();
      const shared = new Map<Map<number, number>, Array<[number, number]>>();
      const jobs = batch.map((j) => {
        if (!shared.has(j.params)) shared.set(j.params, [...j.params]);
        return { params: shared.get(j.params)!, note: j.note, vb: j.vb, variant: j.variant, sr: j.sr };
      });
      const t0 = performance.now();
      const res = await ask({ id: nextId++, module, jobs });
      const ms = performance.now() - t0;
      if (res.gpu) stats.gpu = res.gpu;
      if (res.failed || ms > SLOW_BATCH_MS) {
        // Late or failed: strikes keep playing on the CPU cloud; try the GPU again later.
        cooldownUntil = performance.now() + cooldownMs;
        console.warn(`[soma deep] GPU ${res.failed ? 'unavailable' : `slow (${ms.toFixed(0)} ms)`}; CPU cloud for ${cooldownMs / 1000}s`);
        cooldownMs = Math.min(cooldownMs * 2, 240000);
      } else {
        cooldownMs = Math.max(15000, cooldownMs / 2);
      }
      let modes = 0;
      batch.forEach((j, i) => {
        pending.delete(j.key);
        const r = res.results[i];
        if (r) { store(j.key, r); modes += r.modes; } else if (!res.failed) none.add(j.key);
      });
      if (!res.failed) {
        stats.batches++;
        stats.hits += batch.length;
        stats.lastBatchMs = res.gpuMs;
        stats.lastBatchWallMs = ms;
        stats.lastBatchHits = batch.length;
        stats.lastModes = modes;
      }
    }
  } catch (e) {
    console.warn('[soma deep] render failed', e);
    cooldownUntil = performance.now() + cooldownMs;
  } finally {
    for (const j of queue.splice(0)) pending.delete(j.key);
    running = false;
    for (const w of waiters.splice(0)) w();
  }
}

/** For the diagnostics panel, the lab and tests. */
export function somaDeepStats() {
  return { ...stats, entries: cache.size, pending: pending.size, cacheMB: (cacheFloats * 4) / 1048576, coolingDown: performance.now() < cooldownUntil };
}
