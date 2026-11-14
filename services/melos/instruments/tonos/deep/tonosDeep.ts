// TONOS deep body: GPU-rendered upper body, cached per note and played inside the voice.
//
// A TONOS string on the CPU sounds through a handful of body modes plus broad "floor" bandpasses
// standing in for the dense upper body. Here that upper body is rendered for real — up to
// TONOS_DEEP_BUDGET modes (deepBody.ts) on the GPU, driven by the bridge force the string really
// produced — once per instrument settings × note × velocity level, and handed to the engine as a
// sample slot. `pa_note_on_deep` replays the string from the seed the layer was recorded with (so
// the two match sample for sample) and plays the layer in place of the floors.
//
// Plucked and struck instruments only: a bowed note's future depends on the bow. A bend, the mod
// wheel, a slur or the release hand the sound back to the floors in 30 ms. Nothing waits on the
// GPU: a note whose layer isn't cached plays exactly as before and asks for it.

import type { TonosDeepRequest, TonosDeepResponse } from './tonosDeepWorker';
import { TONOS_BODIES } from './bodies';

export interface TonosDeepHit {
  /** Channel-major stereo, length 2·frames. */
  data: Float32Array;
  frames: number;
  modes: number;
  variant: number;
}

const VEL_LEVELS = 4;
export const TONOS_DEEP_VARIANTS = 2;
const MAX_CACHE_FLOATS = 24 * 1024 * 1024; // 96 MB
const BATCH_NOTES = 4;
const SLOW_BATCH_MS = 8000;
const TN_ENABLE = 2000, TN_INSTRUMENT = 2001;

/** Velocity level a note's layer is rendered at; the voice scales the layer from it. */
export function tonosVelBucket(v: number): number {
  return Math.max(1, Math.min(VEL_LEVELS, Math.ceil(Math.max(0.02, Math.min(1, v)) * VEL_LEVELS))) / VEL_LEVELS;
}

/** Stable key of TONOS's parameter block (2000..2099) — everything that shapes the string. */
export function tonosParamsKey(params: Map<number, number>): string {
  const ids = [...params.keys()].filter((id) => id >= 2000 && id < 2100).sort((a, b) => a - b);
  return ids.map((id) => `${id}:${Math.round((params.get(id) ?? 0) * 1e4)}`).join(',');
}

/** A TONOS patch whose instrument can take a deep body (plucked or struck). */
export function tonosDeepCapable(params: Map<number, number>): boolean {
  if ((params.get(TN_ENABLE) ?? 0) <= 0.5) return false;
  const b = TONOS_BODIES[Math.max(0, Math.min(TONOS_BODIES.length - 1, Math.round(params.get(TN_INSTRUMENT) ?? 0)))];
  return !!b && !b.sustained;
}

const hitKey = (paramsKey: string, note: number, vb: number, variant: number, sr: number) => `${paramsKey}|${note}|${vb}|${variant}|${sr}`;

const cache = new Map<string, TonosDeepHit>();
let cacheFloats = 0;
const pending = new Set<string>();
const none = new Set<string>();

interface Job { key: string; params: Map<number, number>; note: number; vb: number; variant: number; sr: number; module: () => Promise<WebAssembly.Module> }
const queue: Job[] = [];
const waiters: Array<() => void> = [];
let running = false;
let cooldownUntil = 0;
let cooldownMs = 15000;
const stats = { batches: 0, notes: 0, lastBatchMs: 0, lastBatchWallMs: 0, lastModes: 0, gpu: '' };

function prefOff(): boolean {
  try { return globalThis.localStorage?.getItem('chora.tonosDeep') === 'off'; } catch { return false; }
}
export function tonosDeepAvailable(): boolean {
  return !!(globalThis.navigator as Navigator & { gpu?: unknown })?.gpu;
}
export function tonosDeepEnabled(): boolean {
  return !prefOff();
}
export function setTonosDeepEnabled(on: boolean): void {
  try { globalThis.localStorage?.setItem('chora.tonosDeep', on ? 'on' : 'off'); } catch { /* stays on */ }
}
export function tonosDeepSupported(): boolean {
  return !prefOff() && tonosDeepAvailable();
}

export function lookupTonosDeep(paramsKey: string, note: number, velocity: number, sr: number, variant = 0): TonosDeepHit | undefined {
  const k = hitKey(paramsKey, note, tonosVelBucket(velocity), variant % TONOS_DEEP_VARIANTS, sr);
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); }
  return hit;
}

/**
 * Ask for every velocity level and round-robin variant of `note` (the one just played first).
 * Resolves when the queue has drained; never rejects.
 */
export function requestTonosDeep(params: Map<number, number>, paramsKey: string, note: number, sr: number, module: () => Promise<WebAssembly.Module>, velocity = 0.7): Promise<void> {
  if (!tonosDeepSupported() || !tonosDeepCapable(params) || performance.now() < cooldownUntil) return Promise.resolve();
  const snapshot = new Map(params);
  const first = tonosVelBucket(velocity);
  const levels = [first, ...Array.from({ length: VEL_LEVELS }, (_, i) => (i + 1) / VEL_LEVELS).filter((v) => v !== first)];
  levels.forEach((vb, i) => {
    for (let variant = 0; variant < TONOS_DEEP_VARIANTS; variant++) {
      const key = hitKey(paramsKey, note, vb, variant, sr);
      if (cache.has(key) || pending.has(key) || none.has(key)) continue;
      pending.add(key);
      const job = { key, params: snapshot, note, vb, variant, sr, module };
      if (i === 0 && variant === 0) queue.unshift(job); else queue.push(job);
    }
  });
  const done = new Promise<void>((res) => waiters.push(res));
  if (!running) { running = true; setTimeout(() => { void pump(); }, 0); }
  return done;
}

function store(key: string, hit: TonosDeepHit): void {
  cache.set(key, hit);
  cacheFloats += hit.data.length;
  while (cacheFloats > MAX_CACHE_FLOATS && cache.size > 1) {
    const [k, v] = cache.entries().next().value as [string, TonosDeepHit];
    cache.delete(k);
    cacheFloats -= v.data.length;
  }
}

let worker: Worker | null = null;
let nextId = 1;
const replies = new Map<number, (r: TonosDeepResponse) => void>();

function deepWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./tonosDeepWorker.ts', import.meta.url), { type: 'module', name: 'tonos-deep' });
    worker.onmessage = (e: MessageEvent<TonosDeepResponse>) => { replies.get(e.data.id)?.(e.data); replies.delete(e.data.id); };
    worker.onerror = () => {
      for (const [id, r] of replies) r({ id, results: [], failed: true, gpuMs: 0, gpu: '' });
      replies.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function ask(req: TonosDeepRequest): Promise<TonosDeepResponse> {
  return new Promise((resolve) => {
    replies.set(req.id, resolve);
    deepWorker().postMessage(req);
  });
}

async function pump(): Promise<void> {
  try {
    while (queue.length && performance.now() >= cooldownUntil) {
      const batch = queue.splice(0, BATCH_NOTES);
      const module = await batch[0].module();
      const shared = new Map<Map<number, number>, Array<[number, number]>>();
      const jobs = batch.map((j) => {
        if (!shared.has(j.params)) shared.set(j.params, [...j.params]);
        // Replayed from deep_seed(note, variant) so round-robin takes never machine-gun.
        return { params: shared.get(j.params)!, note: j.note, vb: j.vb, variant: j.variant, sr: j.sr };
      });
      const t0 = performance.now();
      const res = await ask({ id: nextId++, module, jobs });
      const ms = performance.now() - t0;
      if (res.gpu) stats.gpu = res.gpu;
      if (res.failed || ms > SLOW_BATCH_MS) {
        cooldownUntil = performance.now() + cooldownMs;
        console.warn(`[tonos deep] GPU ${res.failed ? 'unavailable' : `slow (${ms.toFixed(0)} ms)`}; CPU floors for ${cooldownMs / 1000}s`);
        cooldownMs = Math.min(cooldownMs * 2, 240000);
      } else {
        cooldownMs = Math.max(15000, cooldownMs / 2);
      }
      let modes = 0;
      batch.forEach((j, i) => {
        pending.delete(j.key);
        const r = res.results[i];
        if (r) { store(j.key, { ...r, variant: j.variant }); modes = Math.max(modes, r.modes); } else if (!res.failed) { if (none.size > 4096) none.clear(); none.add(j.key); }
      });
      if (!res.failed) {
        stats.batches++;
        stats.notes += batch.length;
        stats.lastBatchMs = res.gpuMs;
        stats.lastBatchWallMs = ms;
        stats.lastModes = modes;
      }
    }
  } catch (e) {
    console.warn('[tonos deep] render failed', e);
    cooldownUntil = performance.now() + cooldownMs;
  } finally {
    for (const j of queue.splice(0)) pending.delete(j.key);
    running = false;
    for (const w of waiters.splice(0)) w();
  }
}

export function tonosDeepStats() {
  return { ...stats, entries: cache.size, pending: pending.size, cacheMB: (cacheFloats * 4) / 1048576, coolingDown: performance.now() < cooldownUntil };
}
