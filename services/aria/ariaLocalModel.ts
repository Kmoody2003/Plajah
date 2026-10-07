/**
 * ariaLocalModel.ts — Aria's optional on-device brain.
 *
 * Runs a small instruct model entirely in the browser via Transformers.js
 * (WebGPU when available, wasm otherwise): free, private, and offline once the
 * weights are cached — but only on capable browsers, and weaker than the cloud
 * (Gemini Flash) lane on hard tasks.
 *
 * Two engines:
 *   • 'qwen'   (default) Qwen2.5 1.5B on WebGPU / 0.5B on wasm — small download, runs anywhere.
 *   • 'gemma4' Google Gemma 4 E2B (Apache 2.0): native system prompt + function-calling
 *              training, so it follows Aria's persona and <ARIA_ACTION> protocol better.
 *              WebGPU only, ~3 GB first download (cached afterwards).
 *
 * HOT-SWAP: when Gemma 4 is preferred but not cached yet, Aria starts on Qwen immediately
 * and Gemma 4 downloads in the background; the moment it is ready we switch over (and free
 * Qwen's GPU memory). If Gemma 4 is already cached it loads directly. If it cannot load for
 * any reason Aria simply stays on Qwen.
 *
 * NOTE ON CACHING: browsers keep this cache per ORIGIN (scheme + host + PORT). A dev server
 * that changes port between runs starts with an empty cache every time and re-downloads —
 * use a fixed port. We also ask the browser for persistent storage so the cache isn't evicted.
 *
 * The default path stays cloud. This lane is opt-in (a "Run Aria on-device" toggle) and
 * always degrades gracefully: if nothing can load, callers fall back to the server.
 *
 * Install (already a dependency): @huggingface/transformers (>= 4, which ships Gemma4).
 */

import { isWindowsApp, invokeNativeLlm } from '../windowsBridgeService';

// Picked to balance quality vs. download/VRAM. WebGPU gets the 1.5B; wasm-only
// devices fall back to the tiny 0.5B so it still runs (slowly) anywhere.
const MODEL_WEBGPU = 'onnx-community/Qwen2.5-1.5B-Instruct';
const MODEL_WASM = 'onnx-community/Qwen2.5-0.5B-Instruct';
const MODEL_GEMMA4 = 'onnx-community/gemma-4-E2B-it-ONNX';
const GEMMA_CACHE_MATCH = /gemma-4-E2B-it-ONNX[^?]*\.onnx/i;

export type LocalChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LocalModelStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
export type LocalEngine = 'qwen' | 'gemma4';

const ENGINE_KEY = 'aria_local_engine';
const GEMMA_FAILED_KEY = 'aria_gemma_failed_at';
const GEMMA_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

function hasWebGPU(): boolean {
  try { return typeof navigator !== 'undefined' && !!(navigator as any).gpu; } catch { return false; }
}

/** Turn "142 MB of 2.9 GB" style numbers into something readable. */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return '?';
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;
}

class AriaLocalModel {
  private gen: any = null;           // Qwen text-generation pipeline
  private g4model: any = null;       // Gemma 4 model
  private g4proc: any = null;        // Gemma 4 processor (tokenizer + chat template)
  private loading: Promise<boolean> | null = null;
  private busy = 0;                  // chats in flight (so a swap never pulls a model out from under one)
  private epoch = 0;                 // bumped by reset(); a stale background load must not swap in
  status: LocalModelStatus = 'idle';
  modelId = '';
  backend: 'nvidia-rtx' | 'webgpu' | 'wasm' | '' = '';
  /** Which engine is answering right now (Qwen while Gemma 4 is still downloading). */
  engine: LocalEngine = 'qwen';
  /** Gemma 4 is downloading/compiling in the background while Qwen answers. */
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

  /** Gemma 4 failed here recently (e.g. out of GPU memory) — don't retry on every load. */
  private static gemmaRecentlyFailed(): boolean {
    try {
      const at = Number(localStorage.getItem(GEMMA_FAILED_KEY) || 0);
      return at > 0 && Date.now() - at < GEMMA_RETRY_AFTER_MS;
    } catch { return false; }
  }
  private static markGemmaFailed(): void {
    try { localStorage.setItem(GEMMA_FAILED_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  /** Are the Gemma 4 weights already in this origin's browser cache? (then loading is quick) */
  static async gemmaCached(): Promise<boolean> {
    try {
      if (typeof caches === 'undefined' || !(await caches.has('transformers-cache'))) return false;
      const cache = await caches.open('transformers-cache');
      return (await cache.keys()).some(r => GEMMA_CACHE_MATCH.test(r.url));
    } catch { return false; }
  }

  /** Drop everything so the next warm() starts clean (also cancels a pending background upgrade). */
  reset(): void {
    this.epoch++;
    this.gen = null; this.g4model = null; this.g4proc = null;
    this.loading = null; this.status = 'idle'; this.modelId = ''; this.lastError = '';
    this.upgrading = false; this.cacheWarning = ''; this.engine = 'qwen';
  }

  /**
   * Make Aria ready to answer on-device. Resolves as soon as ONE engine can answer
   * (Qwen, if Gemma 4 still has to download); a Gemma 4 download carries on in the background.
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

        const wantGemma = AriaLocalModel.preferredEngine() === 'gemma4' && !AriaLocalModel.gemmaRecentlyFailed();
        if (wantGemma) {
          if (await AriaLocalModel.gemmaCached()) {
            // Already on this device: load it straight from the cache.
            onStatus?.('Loading Gemma 4 from this device…');
            if (await this.loadGemma(mod, onStatus, epoch, /* swap */ false)) return true;
            onStatus?.('Gemma 4 could not load here — using the lighter on-device model.');
          } else {
            // Not downloaded yet: get Aria talking on Qwen right now, fetch Gemma 4 in the background.
            await this.loadQwen(mod, onStatus);
            this.upgradeToGemma(mod, onStatus, epoch);
            return true;
          }
        }

        await this.loadQwen(mod, onStatus);
        return true;
      } catch (e: any) {
        this.lastError = String(e?.message || e).slice(0, 220);
        console.warn('[AriaLocalModel] unavailable:', this.lastError);
        this.status = 'unavailable';
        onStatus?.(`On-device model unavailable (${this.lastError}) — using the cloud.`);
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  private async loadQwen(mod: any, onStatus?: (s: string) => void): Promise<void> {
    const webgpu = hasWebGPU();
    onStatus?.('Loading Aria on-device…');
    this.backend = webgpu ? 'webgpu' : 'wasm';
    this.modelId = webgpu ? MODEL_WEBGPU : MODEL_WASM;
    this.engine = 'qwen';
    const { pipeline } = mod;
    this.gen = await pipeline('text-generation', this.modelId, {
      ...(webgpu ? { device: 'webgpu' } : {}),
      dtype: 'q4',
    } as any);
    this.status = 'ready';
    onStatus?.(`Aria on-device ready (${this.backend}).`);
  }

  /**
   * Load Gemma 4. `swap=false` makes it the answering engine immediately (nothing else is loaded);
   * `swap=true` is the background upgrade: Qwen keeps answering until Gemma 4 is fully ready.
   * Returns true on success. Never throws.
   */
  private async loadGemma(mod: any, onStatus: ((s: string) => void) | undefined, epoch: number, swap: boolean): Promise<boolean> {
    try {
      const { Gemma4ForConditionalGeneration, AutoProcessor } = mod;
      if (!Gemma4ForConditionalGeneration || !AutoProcessor) throw new Error('this Transformers.js build has no Gemma 4 support');

      // Ask the browser not to evict the cache, and tell the user how much room there is.
      try { await (navigator as any).storage?.persist?.(); } catch { /* optional */ }

      let lastPct = -1;
      const fileTotals = new Map<string, { loaded: number; total: number }>();
      const progress_callback = (info: any) => {
        if (info?.status === 'progress' && typeof info.total === 'number' && info.total > 0) {
          fileTotals.set(String(info.file), { loaded: info.loaded ?? 0, total: info.total });
          let loaded = 0, total = 0;
          fileTotals.forEach(v => { loaded += v.loaded; total += v.total; });
          const pct = Math.floor((loaded / total) * 100);
          if (pct !== lastPct) {
            lastPct = pct;
            const prefix = swap ? 'Aria is ready · Gemma 4 downloading in the background' : 'Loading Gemma 4';
            onStatus?.(`${prefix}… ${pct}% (${fmtBytes(loaded)} of ${fmtBytes(total)} so far)`);
          }
        }
      };

      const model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_GEMMA4, { dtype: 'q4f16', device: 'webgpu', progress_callback });
      const proc = await AutoProcessor.from_pretrained(MODEL_GEMMA4);
      if (epoch !== this.epoch) return false; // the user switched engines / reset while we were loading

      // Did the browser actually keep the download? If not it will re-download every time — say so.
      if (!(await AriaLocalModel.gemmaCached())) {
        let room = '';
        try { const est = await (navigator as any).storage?.estimate?.(); if (est?.quota) room = ` (this site may use ${fmtBytes(est.quota)}, ${fmtBytes(est.usage ?? 0)} used)`; } catch { /* ignore */ }
        this.cacheWarning = `Your browser did not keep the Gemma 4 download, so it will download again next time${room}. Check free disk space and that the address (including the port) stays the same.`;
        console.warn('[AriaLocalModel]', this.cacheWarning);
      } else {
        this.cacheWarning = '';
      }

      const old = this.gen;
      this.g4model = model; this.g4proc = proc;
      this.modelId = MODEL_GEMMA4; this.backend = 'webgpu'; this.engine = 'gemma4';
      this.gen = null;
      this.status = 'ready';
      if (old) this.disposeWhenIdle(old);
      onStatus?.('Aria on-device ready (Gemma 4 · webgpu).');
      return true;
    } catch (ge: any) {
      this.lastError = `Gemma 4: ${String(ge?.message || ge).slice(0, 180)}`;
      console.warn('[AriaLocalModel] Gemma 4 failed:', this.lastError);
      AriaLocalModel.markGemmaFailed();
      return false;
    }
  }

  /** Background Gemma 4 download; Qwen keeps answering until it is ready, then we swap. */
  private upgradeToGemma(mod: any, onStatus: ((s: string) => void) | undefined, epoch: number): void {
    this.upgrading = true;
    void (async () => {
      const ok = await this.loadGemma(mod, onStatus, epoch, /* swap */ true);
      if (epoch === this.epoch) {
        this.upgrading = false;
        if (!ok) onStatus?.(`Gemma 4 couldn't load on this device — staying on the lighter model. (${this.lastError})`);
      }
    })();
  }

  /** Free a model's GPU memory once no chat is using it. */
  private disposeWhenIdle(model: any): void {
    let tries = 0;
    const tick = () => {
      if (this.busy === 0 || ++tries > 240) { try { void model?.dispose?.(); } catch { /* best effort */ } return; }
      setTimeout(tick, 500);
    };
    setTimeout(tick, 500);
  }

  get ready(): boolean { return this.status === 'ready'; }

  /**
   * Generate a chat reply. Throws if the model isn't ready (callers should have
   * awaited warm() and checked `ready`, then fall back to cloud on throw).
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

    this.busy++;
    try {
      // Capture the engine for THIS chat so a hot-swap mid-answer can't pull it away.
      if (this.engine === 'gemma4' && this.g4model && this.g4proc) return await this.chatGemma4(this.g4model, this.g4proc, messages, opts);

      const gen = this.gen;
      if (!gen) throw new Error('local model not ready');
      const out = await gen(messages, {
        max_new_tokens: opts.maxNewTokens ?? 512,
        temperature: opts.temperature ?? 0.7,
        do_sample: (opts.temperature ?? 0.7) > 0,
      });
      const content = out?.[0]?.generated_text?.at?.(-1)?.content;
      return typeof content === 'string' ? content : String(content ?? '');
    } finally {
      this.busy--;
    }
  }

  /** Gemma 4 text-only chat: processor chat template → tokens → generate → decode the new tokens only. */
  private async chatGemma4(
    model: any, proc: any,
    messages: LocalChatMessage[],
    opts: { maxNewTokens?: number; temperature?: number },
  ): Promise<string> {
    const temperature = opts.temperature ?? 0.7;
    // Gemma 4's processor template takes content as typed parts.
    const parts = messages.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
    const prompt = proc.apply_chat_template(parts, { enable_thinking: false, add_generation_prompt: true });
    const inputs = await proc(prompt, null, null, { add_special_tokens: false });
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: opts.maxNewTokens ?? 512,
      do_sample: temperature > 0,
      ...(temperature > 0 ? { temperature, top_p: 0.95 } : {}),
    });
    const promptLen = inputs.input_ids.dims.at(-1);
    const decoded = proc.tokenizer.batch_decode(outputs.slice(null, [promptLen, null]), { skip_special_tokens: true });
    return String(decoded?.[0] ?? '').trim();
  }
}

/** Process-wide singleton — one model load per tab. */
export const ariaLocalModel = new AriaLocalModel();
export { AriaLocalModel };
