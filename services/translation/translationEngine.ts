// translationEngine.ts — Phase 1 of live translation/dubbing: a cascaded, on-device pipeline
// (ASR → MT → TTS) with a SYNTHETIC voice. Everything runs locally in the browser on WebGPU via
// transformers.js (Whisper ASR + NLLB translation) and kokoro-js (TTS) — loaded from CDN like the
// app's other ML (MediaPipe), so no bundle/dep changes and nothing leaves the device.
//
// Voice-matching (clone the speaker), expressive/streaming (Seamless-class), and lip-sync are later
// phases — and the heavy ones belong in the native app per the GPU ceiling. This is the light cascade.
//
// NOTE: requires WebGPU + a sizeable one-time model download; first real run may need model/voice
// tuning. Built correct-by-construction to the documented APIs with graceful failure + status events.

const TF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0';

const ASR_MODEL = 'onnx-community/whisper-base';                    // multilingual ASR
const MT_MODEL = 'Xenova/nllb-200-distilled-600M';                 // 200-language translation
const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';           // synthetic neural TTS

// UI language code → NLLB FLORES code (extend as needed)
export const NLLB_CODES: Record<string, string> = {
  en: 'eng_Latn', es: 'spa_Latn', fr: 'fra_Latn', de: 'deu_Latn', it: 'ita_Latn', pt: 'por_Latn',
  ja: 'jpn_Jpan', ko: 'kor_Hang', zh: 'zho_Hans', hi: 'hin_Deva', ar: 'arb_Arab', ru: 'rus_Cyrl',
};
export const LANGS: Array<{ code: string; label: string; voice: string }> = [
  { code: 'en', label: 'English', voice: 'af_heart' },
  { code: 'es', label: 'Español', voice: 'ef_dora' },
  { code: 'fr', label: 'Français', voice: 'ff_siwis' },
  { code: 'it', label: 'Italiano', voice: 'if_sara' },
  { code: 'pt', label: 'Português', voice: 'pf_dora' },
  { code: 'ja', label: '日本語', voice: 'jf_alpha' },
  { code: 'zh', label: '中文', voice: 'zf_xiaobei' },
  { code: 'hi', label: 'हिन्दी', voice: 'hf_alpha' },
];

export interface TranslationEngine {
  ready: boolean;
  transcribe: (pcm: Float32Array) => Promise<string>;       // 16kHz mono → source text
  translate: (text: string, src: string, tgt: string) => Promise<string>;
  synthesize: (text: string, voice: string) => Promise<Blob | null>; // → audio/wav blob
}

let loading: Promise<TranslationEngine> | null = null;

export function loadTranslationEngine(onStatus?: (s: string) => void): Promise<TranslationEngine> {
  if (loading) return loading;
  loading = (async () => {
    onStatus?.('Loading translation models… (one-time download)');
    const tf: any = await import(/* @vite-ignore */ TF_CDN);
    const device = (navigator as any).gpu ? 'webgpu' : 'wasm';

    onStatus?.('Loading speech recognition…');
    const asr = await tf.pipeline('automatic-speech-recognition', ASR_MODEL, { device });
    onStatus?.('Loading translator…');
    const mt = await tf.pipeline('translation', MT_MODEL, { device });
    onStatus?.('Loading voice…');
    const kokoro: any = await import(/* @vite-ignore */ KOKORO_CDN);
    const tts = await kokoro.KokoroTTS.from_pretrained(TTS_MODEL, { dtype: device === 'webgpu' ? 'fp32' : 'q8', device });

    onStatus?.('Ready');
    return {
      ready: true,
      transcribe: async (pcm: Float32Array) => {
        const out = await asr(pcm, { chunk_length_s: 30, return_timestamps: false });
        return (Array.isArray(out) ? out[0]?.text : out?.text) ?? '';
      },
      translate: async (text: string, src: string, tgt: string) => {
        const srcCode = NLLB_CODES[src] || 'eng_Latn';
        const tgtCode = NLLB_CODES[tgt] || 'spa_Latn';
        if (srcCode === tgtCode) return text;
        const r = await mt(text, { src_lang: srcCode, tgt_lang: tgtCode });
        return (Array.isArray(r) ? r[0]?.translation_text : r?.translation_text) ?? '';
      },
      synthesize: async (text: string, voice: string) => {
        try {
          const audio = await tts.generate(text, { voice });
          return audio?.toBlob ? audio.toBlob() : null;
        } catch (e) { console.warn('[translate] TTS failed:', e); return null; }
      },
    } as TranslationEngine;
  })().catch(err => { loading = null; throw err; });
  return loading;
}
