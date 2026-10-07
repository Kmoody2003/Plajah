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
 *              WebGPU only, ~3 GB first download (cached afterwards) — so it is an explicit
 *              opt-in, and if it cannot load we fall back to Qwen automatically.
 *
 * It reuses the approach proven in components/plajahPixels/engine/timeline/llm/localLLM.ts,
 * generalised to a chat completion so Aria can hold a conversation and follow the same
 * context/action protocol the server prompt defines.
 *
 * The default path stays cloud. This lane is opt-in (a "Run Aria on-device" toggle) and
 * always degrades gracefully: if the model can't load, callers fall back to the server.
 *
 * Install (already a dependency): @huggingface/transformers (>= 4, which ships Gemma4).
 */

import { isWindowsApp, invokeNativeLlm } from '../windowsBridgeService';

// Picked to balance quality vs. download/VRAM. WebGPU gets the 1.5B; wasm-only
// devices fall back to the tiny 0.5B so it still runs (slowly) anywhere.
const MODEL_WEBGPU = 'onnx-community/Qwen2.5-1.5B-Instruct';
const MODEL_WASM = 'onnx-community/Qwen2.5-0.5B-Instruct';
const MODEL_GEMMA4 = 'onnx-community/gemma-4-E2B-it-ONNX';

export type LocalChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LocalModelStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
export type LocalEngine = 'qwen' | 'gemma4';

const ENGINE_KEY = 'aria_local_engine';

function hasWebGPU(): boolean {
  try { return typeof navigator !== 'undefined' && !!(navigator as any).gpu; } catch { return false; }
}

class AriaLocalModel {
  private gen: any = null;           // Qwen text-generation pipeline
  private g4model: any = null;       // Gemma 4 model
  private g4proc: any = null;        // Gemma 4 processor (tokenizer + chat template)
  private loading: Promise<boolean> | null = null;
  status: LocalModelStatus = 'idle';
  modelId = '';
  backend: 'nvidia-rtx' | 'webgpu' | 'wasm' | '' = '';
  /** Which engine is actually loaded (may differ from the preference if Gemma 4 fell back). */
  engine: LocalEngine = 'qwen';
  lastError = '';

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

  static setPreferredEngine(e: LocalEngine): void {
    try { localStorage.setItem(ENGINE_KEY, e); } catch { /* private mode: preference just won't persist */ }
  }

  /** Drop the loaded model so the next warm() loads the (possibly different) preferred engine. */
  reset(): void {
    this.gen = null; this.g4model = null; this.g4proc = null;
    this.loading = null; this.status = 'idle'; this.modelId = ''; this.lastError = '';
  }

  /** Download + compile the model. Safe to call repeatedly; returns readiness. */
  async warm(onStatus?: (s: string) => void): Promise<boolean> {
    if (this.status === 'ready') return true;
    if (this.status === 'unavailable') return false;
    if (this.loading) return this.loading;

    this.status = 'loading';
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
        const webgpu = hasWebGPU();

        // ── Gemma 4 (opt-in). Any failure falls through to Qwen below. ──
        if (AriaLocalModel.preferredEngine() === 'gemma4') {
          try {
            onStatus?.('Loading Gemma 4 (first time downloads ~3 GB)…');
            const { Gemma4ForConditionalGeneration, AutoProcessor } = mod;
            if (!Gemma4ForConditionalGeneration || !AutoProcessor) throw new Error('this Transformers.js build has no Gemma 4 support');
            let lastPct = -1;
            const progress_callback = (info: any) => {
              if (info?.status === 'progress' && typeof info.progress === 'number') {
                const pct = Math.floor(info.progress);
                if (pct !== lastPct) { lastPct = pct; onStatus?.(`Downloading Gemma 4… ${pct}% (${String(info.file || '').split('/').pop()})`); }
              }
            };
            this.g4model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_GEMMA4, { dtype: 'q4f16', device: 'webgpu', progress_callback });
            this.g4proc = await AutoProcessor.from_pretrained(MODEL_GEMMA4);
            this.backend = 'webgpu';
            this.modelId = MODEL_GEMMA4;
            this.engine = 'gemma4';
            this.status = 'ready';
            onStatus?.('Aria on-device ready (Gemma 4 · webgpu).');
            return true;
          } catch (ge: any) {
            this.g4model = null; this.g4proc = null;
            this.lastError = `Gemma 4: ${String(ge?.message || ge).slice(0, 160)}`;
            console.warn('[AriaLocalModel] Gemma 4 failed, falling back to Qwen:', this.lastError);
            onStatus?.('Gemma 4 could not load here — using the lighter on-device model.');
          }
        }

        // ── Qwen (default / fallback) ──
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
    if (!this.ready) throw new Error('local model not ready');

    if (this.backend === 'nvidia-rtx') {
      const userMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const sysMsg = messages.find(m => m.role === 'system')?.content;
      const res = await invokeNativeLlm(userMsg, sysMsg);
      if (res.success && res.text) return res.text;
    }

    if (this.engine === 'gemma4' && this.g4model && this.g4proc) return this.chatGemma4(messages, opts);

    if (!this.gen) throw new Error('local model not ready');
    const out = await this.gen(messages, {
      max_new_tokens: opts.maxNewTokens ?? 512,
      temperature: opts.temperature ?? 0.7,
      do_sample: (opts.temperature ?? 0.7) > 0,
    });
    const content = out?.[0]?.generated_text?.at?.(-1)?.content;
    return typeof content === 'string' ? content : String(content ?? '');
  }

  /** Gemma 4 text-only chat: processor chat template → tokens → generate → decode the new tokens only. */
  private async chatGemma4(
    messages: LocalChatMessage[],
    opts: { maxNewTokens?: number; temperature?: number },
  ): Promise<string> {
    const temperature = opts.temperature ?? 0.7;
    // Gemma 4's processor template takes content as typed parts.
    const parts = messages.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
    const prompt = this.g4proc.apply_chat_template(parts, { enable_thinking: false, add_generation_prompt: true });
    const inputs = await this.g4proc(prompt, null, null, { add_special_tokens: false });
    const outputs = await this.g4model.generate({
      ...inputs,
      max_new_tokens: opts.maxNewTokens ?? 512,
      do_sample: temperature > 0,
      ...(temperature > 0 ? { temperature, top_p: 0.95 } : {}),
    });
    const promptLen = inputs.input_ids.dims.at(-1);
    const decoded = this.g4proc.tokenizer.batch_decode(outputs.slice(null, [promptLen, null]), { skip_special_tokens: true });
    return String(decoded?.[0] ?? '').trim();
  }
}

/** Process-wide singleton — one model load per tab. */
export const ariaLocalModel = new AriaLocalModel();
export { AriaLocalModel };
