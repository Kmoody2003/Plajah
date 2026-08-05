// engine/timeline/llm/localLLM.ts
// On-device natural-language marker parser. Lazy-loads a small instruction
// model in the browser (via Transformers.js, WebGPU when available) and asks
// it to emit the SAME ParamDiff JSON the rule parser produces — so it is a
// drop-in upgrade. If the model can't load (no network / no WebGPU / slow
// device), it transparently falls back to the offline RuleParser.
//
// Install (in the host app):  npm i @huggingface/transformers
// Default model leans small/fast so it runs anywhere; swap MODEL_ID for a
// larger instruct model (e.g. Qwen2.5-1.5B-Instruct) when targeting WebGPU.

import { ParamDiff, InstructionParser } from '../types';
import { parseInstruction } from '../parser';

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'; // tiny, broad device support

const SYSTEM_PROMPT = `You translate a VJ's plain-English cue into a strict JSON ParamDiff.
Scenes: aurora, chrome, bauhaus, nebula, gravity, kinetic, ripple, plasma, raymarch.
Palettes (index): 0 neon violet, 1 synth pop, 2 sunset heat, 3 deep ocean, 4 amethyst, 5 mono.
Set fields may include: speed (0.1-3), glow (0-2), trail (0-0.95), sens (0.2-3), mirror (bool).
Reply with ONLY JSON: {"scene":<id|null>,"palette":<index|null>,"set":{...}}. No prose.`;

export class LocalLLM implements InstructionParser {
  private gen: any = null;
  private loading: Promise<void> | null = null;
  ready = false;
  failed = false;

  /** Kick off model download/compile. Safe to call repeatedly. */
  async warm(onStatus?: (s: string) => void): Promise<void> {
    if (this.ready || this.failed) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        onStatus?.('Loading on-device model…');
        // @ts-ignore — optional dependency; install @huggingface/transformers to enable.
        // @vite-ignore keeps the bundler from trying to resolve it at build time.
        const { pipeline } = await import(/* @vite-ignore */ '@huggingface/transformers');
        this.gen = await pipeline('text-generation', MODEL_ID, {
          // device:'webgpu' when supported; library auto-falls back to wasm
          dtype: 'q4',
        } as any);
        this.ready = true;
        onStatus?.('On-device model ready.');
      } catch (e) {
        console.warn('LocalLLM unavailable, using rule parser:', e);
        this.failed = true;
        onStatus?.('Model unavailable — using built-in parser.');
      }
    })();
    return this.loading;
  }

  async parse(text: string): Promise<ParamDiff> {
    // Always have an instant, correct answer ready.
    const fallback = parseInstruction(text);
    if (!this.ready) { this.warm(); return fallback; }
    try {
      const out = await this.gen([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ], { max_new_tokens: 96, do_sample: false });
      const raw = out?.[0]?.generated_text?.at?.(-1)?.content ?? '';
      const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      return {
        set: json.set ?? {},
        mul: {},
        scene: json.scene ?? fallback.scene,
        palette: json.palette ?? fallback.palette,
        label: text.trim(),
      };
    } catch (e) {
      // Any parse hiccup → deterministic fallback. Never breaks the show.
      return fallback;
    }
  }
}
