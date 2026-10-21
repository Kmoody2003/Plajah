// Chora Studio — the composer council's on-device model (councilModel.worker.ts runs it).
//
// Engine ladder, best first, stepping down whenever a model can't load on this machine:
//   Gemma 4 E2B (q4f16, WebGPU) — when chosen in Aria's settings and WebGPU is here;
//   Qwen 2.5 1.5B (q4, WebGPU);
//   Qwen 2.5 0.5B (q4, WebGPU or CPU) — small enough to load almost anywhere.
// Each attempt gets a FRESH worker (a failed load can leave a wasm heap that never shrinks), and
// release() terminates it so the studio gets all that memory back when the council closes.
// Weights download once into the browser cache (shared with Aria's models on the same origin).

import { AriaLocalModel } from '../../../aria/ariaLocalModel';

export type CouncilEngine = 'gemma4' | 'qwen15' | 'qwen05';
interface EngineSpec { id: CouncilEngine; label: string; model: string; device?: 'webgpu'; dtype: string; size: string }

const hasWebGPU = () => { try { return typeof navigator !== 'undefined' && !!(navigator as { gpu?: unknown }).gpu; } catch { return false; } };

function ladder(): EngineSpec[] {
  const gpu = hasWebGPU();
  const out: EngineSpec[] = [];
  if (gpu && AriaLocalModel.preferredEngine() === 'gemma4') {
    out.push({ id: 'gemma4', label: 'Gemma 4', model: 'onnx-community/gemma-4-E2B-it-ONNX', device: 'webgpu', dtype: 'q4f16', size: '≈2 GB' });
  }
  if (gpu) out.push({ id: 'qwen15', label: 'Qwen 2.5 1.5B', model: 'onnx-community/Qwen2.5-1.5B-Instruct', device: 'webgpu', dtype: 'q4', size: '≈1.8 GB' });
  out.push({ id: 'qwen05', label: 'Qwen 2.5 0.5B', model: 'onnx-community/Qwen2.5-0.5B-Instruct', device: gpu ? 'webgpu' : undefined, dtype: 'q4', size: '≈0.8 GB' });
  return out;
}

/** The model the council will try first here (for labels before anything loads). */
export function preferredCouncilEngine(): { label: string; size: string } {
  const all = ladder();
  const top = all.find((s, i) => i === all.length - 1 || !failedRecently(s.id))!;
  return { label: top.label, size: top.size };
}

const FAILED_KEY = 'melos:council:modelFailed';
const failedRecently = (id: CouncilEngine) => {
  try { const m = JSON.parse(localStorage.getItem(FAILED_KEY) || '{}'); return Date.now() - (m[id] || 0) < 24 * 3600 * 1000; } catch { return false; }
};
const markFailed = (id: CouncilEngine) => {
  try { const m = JSON.parse(localStorage.getItem(FAILED_KEY) || '{}'); m[id] = Date.now(); localStorage.setItem(FAILED_KEY, JSON.stringify(m)); } catch { /* */ }
};

const fmtMB = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);

class CouncilModel {
  private worker: Worker | null = null;
  private spec: EngineSpec | null = null;
  private loading: Promise<EngineSpec | null> | null = null;
  private seq = 0;
  private pending = new Set<(e: Error) => void>();
  lastError = '';

  get label(): string { return this.spec?.label ?? ''; }
  get ready(): boolean { return !!this.spec && !!this.worker; }

  private call<T>(msg: Record<string, unknown>, onProgress?: (file: string, loaded: number, total: number) => void): Promise<T> {
    const w = this.worker!;
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const done = () => { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); this.pending.delete(fail); };
      const fail = (err: Error) => { done(); reject(err); };
      this.pending.add(fail);
      const onMsg = (e: MessageEvent) => {
        const m = e.data || {};
        if (m.id !== id) return;
        if (m.type === 'progress') { onProgress?.(m.file, m.loaded, m.total); return; }
        done();
        if (m.type === 'loaded' || m.type === 'result') resolve(m as T);
        else reject(new Error(m.error || 'the on-device model failed'));
      };
      const onErr = (e: ErrorEvent) => fail(new Error(e.message || 'the model worker crashed'));
      w.addEventListener('message', onMsg);
      w.addEventListener('error', onErr);
      w.postMessage({ ...msg, id });
    });
  }

  /** Load the best model this machine can hold. Resolves null when none can load. */
  ensure(onStatus?: (s: string) => void): Promise<EngineSpec | null> {
    if (this.ready) return Promise.resolve(this.spec);
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const options = ladder();
      for (const [i, spec] of options.entries()) {
        if (failedRecently(spec.id) && i < options.length - 1) continue;
        this.release();
        this.worker = new Worker(new URL('./councilModel.worker.ts', import.meta.url), { type: 'module' });
        onStatus?.(`Loading ${spec.label} on this device…`);
        const seen = new Map<string, [number, number]>();
        let lastPct = -1;
        try {
          await this.call({ type: 'load', model: spec.model, device: spec.device, dtype: spec.dtype }, (file, loaded, total) => {
            seen.set(file, [loaded, total]);
            let l = 0, t = 0;
            for (const [a, b] of seen.values()) { l += a; t += b; }
            const pct = Math.floor((l / Math.max(1, t)) * 100);
            if (t > 20e6 && pct !== lastPct && pct % 5 === 0) { lastPct = pct; onStatus?.(`Getting ${spec.label} ready — ${pct}% of ${fmtMB(t)} (downloaded only the first time)`); }
          });
          this.spec = spec;
          onStatus?.(`${spec.label} is ready on this device.`);
          return spec;
        } catch (e) {
          this.lastError = (e as Error).message;
          markFailed(spec.id);
          const next = options[i + 1];
          onStatus?.(`${spec.label} couldn't load here${/bad_alloc|memory|OOM/i.test(this.lastError) ? ' (not enough memory)' : ''}${next ? ` — trying ${next.label}.` : '.'}`);
        }
      }
      this.release();
      return null;
    })().finally(() => { this.loading = null; });
    return this.loading;
  }

  /** Generate. A cancel or a time limit terminates the worker (the only way to stop a running
   *  generation); the next ensure() reloads from the browser cache. */
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    opts: { maxNewTokens?: number; temperature?: number; signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<string> {
    if (!this.ready) throw new Error('the on-device model is not loaded');
    const stop = () => this.release();
    opts.signal?.addEventListener('abort', stop, { once: true });
    const timer = opts.timeoutMs ? setTimeout(() => { this.lastError = 'timed out'; this.release(new Error('timed out')); }, opts.timeoutMs) : null;
    try {
      const r = await this.call<{ text: string }>({ type: 'generate', messages, maxNewTokens: opts.maxNewTokens ?? 512, temperature: opts.temperature ?? 0.7 });
      return r.text;
    } finally {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', stop);
    }
  }

  /** Terminate the worker — all of the model's memory goes back to the studio. */
  release(reason: Error = new Error('cancelled')): void {
    for (const fail of [...this.pending]) fail(reason);
    this.worker?.terminate();
    this.worker = null;
    this.spec = null;
  }
}

/** One per tab; the council panel releases it when it closes. */
export const councilModel = new CouncilModel();
