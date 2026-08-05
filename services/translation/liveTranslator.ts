// liveTranslator.ts — drives the cascaded engine over a live MediaStream: energy-VAD segments the
// audio into utterances, each is transcribed → translated → spoken in a synthetic target-language
// voice, with caption callbacks. Phase 1 (synthetic voice). The output dub is the "language channel"
// a listener selects; later phases match the speaker's own voice + push the heavy models to native.

import { loadTranslationEngine, LANGS } from './translationEngine';

export interface LiveTranslatorOptions {
  targetLang: string;
  sourceLang?: string;
  onCaption?: (src: string, translated: string) => void;
  onStatus?: (s: string) => void;
  speak?: boolean;            // play the synthetic dub (default true)
}
export interface LiveTranslatorHandle {
  setTargetLang: (code: string) => void;
  setSpeak: (on: boolean) => void;
  stop: () => void;
}

const SILENCE_HANG_MS = 600;   // end an utterance after this much trailing silence
const RMS_THRESH = 0.012;      // speech vs. silence
const MIN_UTTERANCE_S = 0.4;   // ignore blips

function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = input[Math.floor(i * ratio)] || 0;
  return out;
}

export async function createLiveTranslator(stream: MediaStream, opts: LiveTranslatorOptions): Promise<LiveTranslatorHandle> {
  let targetLang = opts.targetLang;
  const sourceLang = opts.sourceLang || 'en';
  let speak = opts.speak !== false;

  const engine = await loadTranslationEngine(opts.onStatus);

  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain(); sink.gain.value = 0;     // silent sink so the processor runs without echo
  src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);

  const SR = ctx.sampleRate;
  let speaking = false, silenceMs = 0;
  let buf: Float32Array[] = [];
  const queue: Float32Array[] = [];
  let busy = false;
  let stopped = false;

  const flush = () => {
    speaking = false; silenceMs = 0;
    const segs = buf; buf = [];
    const total = segs.reduce((n, s) => n + s.length, 0);
    if (total / SR < MIN_UTTERANCE_S) return;
    const merged = new Float32Array(total); let o = 0;
    for (const s of segs) { merged.set(s, o); o += s.length; }
    queue.push(merged);
    if (!busy) drain();
  };

  const drain = async () => {
    busy = true;
    while (queue.length && !stopped) {
      const pcm = resampleTo16k(queue.shift()!, SR);
      try {
        const text = (await engine.transcribe(pcm)).trim();
        if (!text) continue;
        const translated = (await engine.translate(text, sourceLang, targetLang)).trim();
        opts.onCaption?.(text, translated);
        if (speak && translated) {
          const voice = LANGS.find(l => l.code === targetLang)?.voice || 'af_heart';
          const blob = await engine.synthesize(translated, voice);
          if (blob && !stopped) {
            const url = URL.createObjectURL(blob);
            const a = new Audio(url); a.onended = () => URL.revokeObjectURL(url);
            a.play().catch(() => URL.revokeObjectURL(url));
          }
        }
      } catch (e) { console.warn('[translate] pipeline error:', e); }
    }
    busy = false;
  };

  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const frameMs = (input.length / SR) * 1000;
    if (rms > RMS_THRESH) { speaking = true; silenceMs = 0; buf.push(new Float32Array(input)); }
    else if (speaking) { buf.push(new Float32Array(input)); silenceMs += frameMs; if (silenceMs > SILENCE_HANG_MS) flush(); }
  };

  return {
    setTargetLang: (c) => { targetLang = c; },
    setSpeak: (on) => { speak = on; },
    stop: () => { stopped = true; try { proc.disconnect(); src.disconnect(); sink.disconnect(); ctx.close(); } catch { /* */ } },
  };
}
