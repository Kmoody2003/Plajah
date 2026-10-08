/**
 * ariaLocalModel.ts — Aria's optional on-device brain.
 *
 * Runs a small instruct model entirely in the browser via Transformers.js
 * (WebGPU when available, wasm otherwise): free, private, and offline once the
 * weights are cached — but only on capable browsers, and weaker than the cloud
 * (Gemini Flash) lane on hard tasks.
 *
 * Two engines, both loaded as a TEXT-GENERATION pipeline:
 *   • 'qwen'   (default) Qwen2.5 1.5B on WebGPU / 0.5B on wasm — small download, runs anywhere.
 *   • 'gemma4' Google Gemma 4 E2B (Apache 2.0): native system prompt + function-calling training,
 *              so it follows Aria's persona and <ARIA_ACTION> protocol better. WebGPU only.
 *              Loaded TEXT-ONLY (embed_tokens + decoder) — the vision/audio encoders Aria never
 *              uses are not downloaded or loaded, which keeps it inside the tab's memory budget.
 *
 * MEMORY RULE — never two models at once. The in-browser runtime has a ~4 GB per-tab ceiling and
 * does not give memory back after a failed load (that was the `std::bad_alloc` crash). So:
 *   – Gemma 4 not downloaded yet → Qwen loads and answers; Gemma 4's files are only DOWNLOADED to
 *     the browser cache in the background (no model session, no runtime memory).
 *   – Download done → when no reply is being generated, Qwen is fully disposed FIRST, then Gemma 4
 *     is loaded from the cache. If Gemma 4 can't load, Qwen comes back.
 *   – Gemma 4 already cached → it loads directly.
 *
 * NOTE ON CACHING: browsers keep this cache per ORIGIN (scheme + host + PORT). A dev server
 * that changes port between runs starts with an empty cache every time and re-downloads —
 * use a fixed port. We also ask the browser for persistent storage so the cache isn't evicted.
 *
 * The default path stays cloud. This lane is opt-in (a "Run Aria on-device" toggle).
 *
 * Install (already a dependency): @huggingface/transformers (>= 4, which ships Gemma 4).
 */

import { isWindowsApp, invokeNativeLlm } from '../windowsBridgeService';

// Picked to balance quality vs. download/VRAM. WebGPU gets the 1.5B; wasm-only
// devices fall back to the tiny 0.5B so it still runs (slowly) anywhere.
const MODEL_WEBGPU = 'onnx-community/Qwen2.5-1.5B-Instruct';
const MODEL_WASM = 'onnx-community/Qwen2.5-0.5B-Instruct';
const MODEL_GEMMA4 = 'onnx-community/gemma-4-E2B-it-ONNX';
const GEMMA_OPTS = { dtype: 'q4f16', device: 'webgpu' } as const;
const CACHE_NAME = 'transformers-cache';

export type LocalChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LocalModelStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
export type LocalEngine = 'qwen' | 'gemma4';
type StatusFn = ((s: string) => void) | undefined;

const ENGINE_KEY = 'aria_local_engine';
const GEMMA_FAILED_KEY = 'aria_gemma_failed_at';
const GEMMA_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

function hasWebGPU(): boolean {
  try { return typeof navigator !== 'undefined' && !!(navigator as any).gpu; } catch { return false; }
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;
}

/** Turn runtime errors into something a person can act on. */
export function explainLocalError(e: unknown): string {
  const raw = String((e as any)?.message || e || '').slice(0, 220);
  if (/bad_alloc|out of memory|ERROR_CODE:\s*6|Aborted\(OOM\)|memory access out of bounds/i.test(raw)) {
    return 'this browser tab ran out of memory for the on-device model. Reload the page and try again — if it keeps happening, this device can\'t run it';
  }
  return raw || 'unknown error';
}

class AriaLocalModel {
  private gen: any = null;           // the ONE loaded text-generation pipeline (Qwen or Gemma 4)
  private loading: Promise<boolean> | null = null;
  private busy = 0;                  // replies being generated (a swap waits for these)
  private epoch = 0;                 // bumped by reset(); stale background work must not act
  status: LocalModelStatus = 'idle';
  modelId = '';
  backend: 'nvidia-rtx' | 'webgpu' | 'wasm' | '' = '';
  /** Which engine is answering right now (Qwen while Gemma 4 is still downloading). */
  engine: LocalEngine = 'qwen';
  /** Gemma 4 is downloading (or about to be swapped in) in the background while Qwen answers. */
  upgrading = false;
  lastError = '';
  /** Set when the browser did not keep the Gemma 4 download (so it would re-download next time). */
  cacheWarning = '';

  /** Is on-device inference even plausible here? (WebGPU or Windows native preferred.) */
  static isSupported(): boolean {
    if (isWindowsApp()) return true;
    return typeof WebAssembly !== 'undefined';
  }

  static prefersWebGPU(): boolean { return hasWebGPU() || isWindowsApp(); }

  /** Gemma 4 needs WebGPU (no wasm path) — only offer it where it can work. */
  static gemmaSupported(): boolean { return hasWebGPU() && !isWindowsApp(); }

  /** The user's saved engine preference (defaults to the light Qwen). */
  static preferredEngine(): LocalEngine {
    try { return localStorage.getItem(ENGINE_KEY) === 'gemma4' && AriaLocalModel.gemmaSupported() ? 'gemma4' : 'qwen'; }
    catch { return 'qwen'; }
  }

  /** Choosing Gemma 4 explicitly also clears any earlier "it failed on this device" memory. */
  static setPreferredEngine(e: LocalEngine): void {
    try {
      localStorage.setItem(ENGINE_KEY, e);
      if (e === 'gemma4') localStorage.removeItem(GEMMA_FAILED_KEY);
    } catch { /* private mode: preference just won't persist */ }
  }

  private static gemmaRecentlyFailed(): boolean {
    try {
      const at = Number(localStorage.getItem(GEMMA_FAILED_KEY) || 0);
      return at > 0 && Date.now() - at < GEMMA_RETRY_AFTER_MS;
    } catch { return false; }
  }
  private static markGemmaFailed(): void {
    try { localStorage.setItem(GEMMA_FAILED_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  /** Drop everything so the next warm() starts clean (also cancels pending background work). */
  reset(): void {
    this.epoch++;
    const old = this.gen;
    this.gen = null;
    if (old) void Promise.resolve(old.dispose?.()).catch(() => {});
    this.loading = null; this.status = 'idle'; this.modelId = ''; this.lastError = '';
    this.upgrading = false; this.cacheWarning = ''; this.engine = 'qwen';
  }

  /**
   * Make Aria ready to answer on-device. Resolves as soon as ONE engine can answer
   * (Qwen, if Gemma 4 still has to download); the Gemma 4 download carries on in the background.
   */
  async warm(onStatus?: (s: string) => void): Promise<boolean> {
    if (this.status === 'ready') return true;
    if (this.status === 'unavailable') return false;
    if (this.loading) return this.loading;

    this.status = 'loading';
    const epoch = this.epoch;
    this.loading = (async () => {
      try {
        if (isWindowsApp()) {
          onStatus?.('Connecting Aria to NVIDIA RTX local engine…');
          this.backend = 'nvidia-rtx';
          this.modelId = 'Nemotron-Mini-4B-Instruct-INT4';
          this.engine = 'qwen';
          this.status = 'ready';
          onStatus?.('Aria on-device ready (NVIDIA RTX / Nemotron).');
          return true;
        }

        // @vite-ignore keeps the bundler from resolving the optional dep at build time.
        const mod: any = await import(/* @vite-ignore */ '@huggingface/transformers');

        if (AriaLocalModel.preferredEngine() === 'gemma4' && !AriaLocalModel.gemmaRecentlyFailed()) {
          if (await this.gemmaCached(mod)) {
            onStatus?.('Loading Gemma 4 from this device…');
            if (await this.loadGemma(mod, onStatus, epoch)) return true;
            // fall through to Qwen with the reason already reported
          } else {
            await this.loadQwen(mod, onStatus);
            this.downloadGemmaThenSwap(mod, onStatus, epoch);
            return true;
          }
        }

        await this.loadQwen(mod, onStatus);
        return true;
      } catch (e: any) {
        this.lastError = explainLocalError(e);
        console.warn('[AriaLocalModel] unavailable:', e);
        this.status = 'unavailable';
        onStatus?.(`On-device model unavailable (${this.lastError}).`);
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  private async loadQwen(mod: any, onStatus: StatusFn): Promise<void> {
    const webgpu = hasWebGPU();
    onStatus?.('Loading Aria on-device…');
    this.backend = webgpu ? 'webgpu' : 'wasm';
    this.modelId = webgpu ? MODEL_WEBGPU : MODEL_WASM;
    this.engine = 'qwen';
    this.gen = await mod.pipeline('text-generation', this.modelId, {
      ...(webgpu ? { device: 'webgpu' } : {}),
      dtype: 'q4',
    } as any);
    this.status = 'ready';
    onStatus?.(`Aria on-device ready (${this.backend}).`);
  }

  /** Are all of Gemma 4's text-only files already in this origin's cache? */
  private async gemmaCached(mod: any): Promise<boolean> {
    try {
      const reg = mod.ModelRegistry;
      if (reg?.is_pipeline_cached) return !!(await reg.is_pipeline_cached('text-generation', MODEL_GEMMA4, GEMMA_OPTS));
    } catch { /* fall through */ }
    return false;
  }

  /** Load Gemma 4 as the ONLY model (caller guarantees nothing else is loaded). Never throws. */
  private async loadGemma(mod: any, onStatus: StatusFn, epoch: number): Promise<boolean> {
    try {
      const pipe = await mod.pipeline('text-generation', MODEL_GEMMA4, GEMMA_OPTS as any);
      if (epoch !== this.epoch) { void Promise.resolve(pipe?.dispose?.()).catch(() => {}); return false; }
      this.gen = pipe;
      this.modelId = MODEL_GEMMA4; this.backend = 'webgpu'; this.engine = 'gemma4';
      this.status = 'ready';
      onStatus?.('Aria on-device ready (Gemma 4 · webgpu).');
      return true;
    } catch (e: any) {
      this.lastError = `Gemma 4: ${explainLocalError(e)}`;
      console.warn('[AriaLocalModel] Gemma 4 failed:', e);
      AriaLocalModel.markGemmaFailed();
      onStatus?.(`Gemma 4 couldn't load here — ${explainLocalError(e)}. Using the lighter on-device model.`);
      return false;
    }
  }

  /**
   * Background: DOWNLOAD Gemma 4's files into the cache (no model session, so no runtime memory)
   * while Qwen answers; then swap — dispose Qwen first, load Gemma 4, fall back to Qwen on failure.
   */
  private downloadGemmaThenSwap(mod: any, onStatus: StatusFn, epoch: number): void {
    this.upgrading = true;
    void (async () => {
      try {
        try { await (navigator as any).storage?.persist?.(); } catch { /* optional */ }
        await this.downloadGemmaFiles(mod, onStatus, epoch);
        if (epoch !== this.epoch) return;

        if (!(await this.gemmaCached(mod))) {
          let room = '';
          try { const est = await (navigator as any).storage?.estimate?.(); if (est?.quota) room = ` (this site may use ${fmtBytes(est.quota)}, ${fmtBytes(est.usage ?? 0)} used)`; } catch { /* ignore */ }
          this.cacheWarning = `Your browser did not keep the Gemma 4 download, so it can't switch over${room}. Check free disk space and keep the same address (including the port).`;
          onStatus?.('Gemma 4 download was not kept by the browser — staying on the lighter model.');
          return;
        }

        // Wait until no reply is being generated, then swap with only ONE model in memory at a time.
        while (this.busy > 0) { await new Promise(r => setTimeout(r, 300)); if (epoch !== this.epoch) return; }
        onStatus?.('Gemma 4 downloaded — switching Aria over (about a minute)…');
        const swap = (async () => {
          this.status = 'loading';
          const old = this.gen; this.gen = null;
          try { await old?.dispose?.(); } catch { /* best effort */ }
          if (await this.loadGemma(mod, onStatus, epoch)) return true;
          if (epoch !== this.epoch) return false;
          // Gemma 4 could not load: bring Qwen back (from cache).
          try { await this.loadQwen(mod, onStatus); return true; }
          catch (e: any) {
            this.lastError = explainLocalError(e);
            this.status = 'unavailable';
            onStatus?.(`On-device model unavailable (${this.lastError}).`);
            return false;
          }
        })();
        this.loading = swap;                 // warm() callers wait for the swap instead of racing it
        try { await swap; } finally { if (this.loading === swap) this.loading = null; }
      } catch (e: any) {
        if (epoch !== this.epoch) return;
        this.lastError = `Gemma 4 download: ${explainLocalError(e)}`;
        console.warn('[AriaLocalModel] Gemma 4 download failed:', e);
        onStatus?.(`Gemma 4 download stopped (${explainLocalError(e)}) — staying on the lighter model.`);
      } finally {
        if (epoch === this.epoch) this.upgrading = false;
      }
    })();
  }

  /** Stream each needed file straight into the Cache API (disk-backed — never held in memory). */
  private async downloadGemmaFiles(mod: any, onStatus: StatusFn, epoch: number): Promise<void> {
    const reg = mod.ModelRegistry;
    if (!reg?.get_pipeline_files) throw new Error('this Transformers.js build cannot list model files');
    const files: string[] = await reg.get_pipeline_files('text-generation', MODEL_GEMMA4, GEMMA_OPTS);
    const cache = await caches.open(CACHE_NAME);
    const urlFor = (f: string) => `https://huggingface.co/${MODEL_GEMMA4}/resolve/main/${f}`;

    // Sizes up front so progress is honest across all files.
    const sizes = new Map<string, number>();
    let total = 0, done = 0;
    for (const f of files) {
      if (await cache.match(urlFor(f))) { sizes.set(f, 0); continue; }
      try {
        const h = await fetch(urlFor(f), { method: 'HEAD' });
        const n = Number(h.headers.get('content-length') || 0);
        sizes.set(f, n); total += n;
      } catch { sizes.set(f, 0); }
    }

    let lastPct = -1;
    const report = () => {
      if (total <= 0) { // sizes unknown: report bytes, throttled to ~every 50 MB
        const step = Math.floor(done / 5e7);
        if (step !== lastPct) { lastPct = step; onStatus?.(`Aria is ready · Gemma 4 downloading in the background… ${fmtBytes(done)}`); }
        return;
      }
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPct) { lastPct = pct; onStatus?.(`Aria is ready · Gemma 4 downloading in the background… ${pct}% (${fmtBytes(done)} of ${fmtBytes(total)})`); }
    };

    for (const f of files) {
      if (epoch !== this.epoch) return;
      const url = urlFor(f);
      if (await cache.match(url)) continue;
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`download failed for ${f} (HTTP ${res.status})`);
      // tee: one branch counts bytes for progress, the other streams into the cache.
      const [counter, store] = res.body.tee();
      const headers = new Headers(res.headers);
      const putting = cache.put(url, new Response(store, { status: 200, headers }));
      const reader = counter.getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        done += value?.byteLength ?? 0;
        report();
      }
      await putting;
    }
    onStatus?.('Gemma 4 downloaded.');
  }

  get ready(): boolean { return this.status === 'ready'; }

  /**
   * Generate a chat reply. Throws if the model isn't ready (callers should have
   * awaited warm() and checked `ready`).
   */
  async chat(
    messages: LocalChatMessage[],
    opts: { maxNewTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    if (!this.ready) throw new Error('local model not ready');

    if (this.backend === 'nvidia-rtx') {
      const userMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const sysMsg = messages.find(m => m.role === 'system')?.content;
      const res = await invokeNativeLlm(userMsg, sysMsg);
      if (res.success && res.text) return res.text;
    }

    const gen = this.gen; // captured: a swap waits for busy === 0, so this stays valid for the whole reply
    if (!gen) throw new Error('local model not ready');
    this.busy++;
    try {
      const temperature = opts.temperature ?? 0.7;
      const out = await gen(messages, {
        max_new_tokens: opts.maxNewTokens ?? 512,
        temperature,
        do_sample: temperature > 0,
      });
      const content = out?.[0]?.generated_text?.at?.(-1)?.content;
      return typeof content === 'string' ? content.trim() : String(content ?? '').trim();
    } finally {
      this.busy--;
    }
  }
}

/** Process-wide singleton — one model load per tab. */
export const ariaLocalModel = new AriaLocalModel();
export { AriaLocalModel };
