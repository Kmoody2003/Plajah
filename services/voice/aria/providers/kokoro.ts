import type { SpeakOptions, SpeakResult, VoiceProfile, VoiceProvider, WordMark } from '../types';
import { estimateMarks, splitSentences, wordCount } from '../text';

/**
 * Kokoro-82M on-device TTS (kokoro-js, loaded from CDN like services/translation/translationEngine.ts).
 * FULLY LAZY: importing this module downloads nothing. Nothing loads until warmUp() or synth() is called.
 * available() is false until a generation has actually succeeded once (a failed load never counts as "loaded"),
 * so call `kokoroProvider.warmUp()` (e.g. on idle / user opt-in) to enable it in the cascade.
 */

const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0';
const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_VOICE = 'af_heart';

export interface KokoroEngine { generate(text: string, o: { voice: string; speed?: number }): Promise<any> }
export type KokoroLoader = () => Promise<KokoroEngine>;

const defaultLoader: KokoroLoader = async () => {
  const kokoro: any = await import(/* @vite-ignore */ KOKORO_CDN);
  const device = typeof navigator !== 'undefined' && (navigator as any).gpu ? 'webgpu' : 'wasm';
  return kokoro.KokoroTTS.from_pretrained(TTS_MODEL, { dtype: device === 'webgpu' ? 'fp32' : 'q8', device });
};

/** Concatenate float PCM chunks into one 16-bit mono WAV blob. */
export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks) for (let i = 0; i < c.length; i++) { const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}

export function createKokoroProvider(loader: KokoroLoader = defaultLoader): VoiceProvider & { warmUp(): Promise<boolean> } {
  let engine: Promise<KokoroEngine> | null = null;
  let produced = false;
  let cancelled = 0;

  const load = () => {
    if (!engine) engine = loader().catch(e => { engine = null; throw e; });   // a failed load is retryable, never cached
    return engine;
  };

  const generateOne = async (eng: KokoroEngine, text: string, voice: string, speed: number) => {
    const a = await eng.generate(text, { voice, speed });
    const pcm: Float32Array | undefined = a?.audio;
    const sr: number = a?.sampling_rate ?? 24000;
    if (pcm && pcm.length) return { pcm, sr };
    const blob: Blob | null = a?.toBlob ? a.toBlob() : null;
    if (!blob) throw new Error('kokoro: empty audio');
    return { blob, sr };
  };

  const provider: VoiceProvider & { warmUp(): Promise<boolean> } = {
    id: 'kokoro',
    label: 'Kokoro (on-device neural)',
    kind: 'device',
    async available() { return produced; },
    async warmUp() {
      try { const eng = await load(); await generateOne(eng, 'Hello.', DEFAULT_VOICE, 1); produced = true; return true; }
      catch (e) { console.warn('[aria/kokoro] warm-up failed', e); return false; }
    },
    async synth(text: string, profile: VoiceProfile, opts: SpeakOptions = {}): Promise<SpeakResult> {
      const ticket = cancelled;
      const eng = await load();
      const voice = profile.providerPrefs?.kokoro?.voice ?? DEFAULT_VOICE;
      const speed = Math.max(0.5, Math.min(2, (profile.rate || 1) * (opts.speed ?? 1)));
      const pcms: Float32Array[] = [];
      const marks: WordMark[] = [];
      let sr = 24000, t = 0, wi = 0;
      for (const s of splitSentences(text)) {
        if (opts.signal?.aborted || ticket !== cancelled) throw new Error('aborted');
        const g: any = await generateOne(eng, s, voice, speed);
        if (!g.pcm) throw new Error('kokoro: no PCM available'); // blob-only engines can't be concatenated with marks
        sr = g.sr; pcms.push(g.pcm);
        const dur = (g.pcm.length / sr) * 1000;
        marks.push(...estimateMarks(s, dur, t, wi));            // estimated: proportional to characters within the sentence
        t += dur; wi += wordCount(s);
      }
      if (!pcms.length) throw new Error('kokoro: nothing to say');
      produced = true;
      return { audio: encodeWav(pcms, sr), marks, durationMs: Math.round(t), provider: 'kokoro', cached: false };
    },
    cancel() { cancelled++; },
  };
  return provider;
}

export const kokoroProvider = createKokoroProvider();
