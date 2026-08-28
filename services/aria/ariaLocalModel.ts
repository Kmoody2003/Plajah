/**
 * ariaLocalModel.ts — Aria's optional on-device brain.
 *
 * Runs a small Qwen2.5 instruct model entirely in the browser via
 * Transformers.js (WebGPU when available, wasm otherwise). This is the "local
 * Qwen" lane of Aria's hybrid model strategy: free, private, and offline once
 * the weights are cached — but only on capable browsers, and weaker than the
 * cloud (Gemini Flash) lane on hard tasks.
 *
 * It reuses the exact approach already proven in
 * components/plajahPixels/engine/timeline/llm/localLLM.ts, generalised to a
 * chat completion so Aria can hold a conversation and follow the same
 * context/action protocol the server prompt defines.
 *
 * The default path stays cloud. This lane is opt-in (a "Run Aria on-device"
 * toggle) and always degrades gracefully: if the model can't load, callers fall
 * back to the server.
 *
 * Install (already a dependency): @huggingface/transformers
 */

// Picked to balance quality vs. download/VRAM. WebGPU gets the 1.5B; wasm-only
// devices fall back to the tiny 0.5B so it still runs (slowly) anywhere.
const MODEL_WEBGPU = 'onnx-community/Qwen2.5-1.5B-Instruct';
const MODEL_WASM = 'onnx-community/Qwen2.5-0.5B-Instruct';

export type LocalChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LocalModelStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

function hasWebGPU(): boolean {
  try { return typeof navigator !== 'undefined' && !!(navigator as any).gpu; } catch { return false; }
}

class AriaLocalModel {
  private gen: any = null;
  private loading: Promise<boolean> | null = null;
  status: LocalModelStatus = 'idle';
  modelId = '';
  backend: 'webgpu' | 'wasm' | '' = '';
  lastError = '';

  /** Is on-device inference even plausible here? (WebGPU strongly preferred.) */
  static isSupported(): boolean {
    // wasm works but a 0.5–1.5B model on wasm is painfully slow; we still allow
    // it, but callers can use this to decide whether to *offer* the toggle.
    return typeof WebAssembly !== 'undefined';
  }

  static prefersWebGPU(): boolean { return hasWebGPU(); }

  /** Download + compile the model. Safe to call repeatedly; returns readiness. */
  async warm(onStatus?: (s: string) => void): Promise<boolean> {
    if (this.status === 'ready') return true;
    if (this.status === 'unavailable') return false;
    if (this.loading) return this.loading;

    this.status = 'loading';
    this.loading = (async () => {
      try {
        onStatus?.('Loading Aria on-device…');
        const webgpu = hasWebGPU();
        this.backend = webgpu ? 'webgpu' : 'wasm';
        this.modelId = webgpu ? MODEL_WEBGPU : MODEL_WASM;

        // @vite-ignore keeps the bundler from resolving the optional dep at build time.
        const mod: any = await import(/* @vite-ignore */ '@huggingface/transformers');
        const { pipeline } = mod;
        this.gen = await pipeline('text-generation', this.modelId, {
          ...(webgpu ? { device: 'webgpu' } : {}),
          dtype: 'q4',
        } as any);

        this.status = 'ready';
        onStatus?.(`Aria on-device ready (${this.backend}).`);
        return true;
      } catch (e: any) {
        this.lastError = String(e?.message || e).slice(0, 200);
        console.warn('[AriaLocalModel] unavailable:', this.lastError);
        this.status = 'unavailable';
        onStatus?.('On-device model unavailable — using the cloud.');
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
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
    if (!this.ready || !this.gen) throw new Error('local model not ready');
    const out = await this.gen(messages, {
      max_new_tokens: opts.maxNewTokens ?? 512,
      temperature: opts.temperature ?? 0.7,
      do_sample: (opts.temperature ?? 0.7) > 0,
    });
    const content = out?.[0]?.generated_text?.at?.(-1)?.content;
    return typeof content === 'string' ? content : String(content ?? '');
  }
}

/** Process-wide singleton — one model load per tab. */
export const ariaLocalModel = new AriaLocalModel();
export { AriaLocalModel };
