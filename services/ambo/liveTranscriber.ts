// liveTranscriber — words from a live source, for Ambo.
//
// One transcriber feeds every "listen to the room" feature: auto-scripture,
// live lyrics / captions on screen, visualizers. Sources:
//
//   mic     the default microphone through the best native/Web Speech engine
//           (low latency, streams words as they stabilise)
//   device  a specific audio input (mixer feed, USB interface)    ┐ on-device Whisper
//   stream  any MediaStream (an NDI/SRT/stream audio track,        ├ with an energy VAD,
//           the account's live stream, the program mix)            ┘ one utterance at a time
//
// The Web Speech engine can only hear the system default mic, so anything else
// takes the Whisper path. That path is slower (an utterance at a time) and
// downloads models once; the caller is told through onStatus.

import { createRecognizer, listeningAvailable, MicMeter, type Recognizer } from '../voca/vocaSpeech';
import { loadTranslationEngine } from '../translation/translationEngine';

export type TranscribeSource =
  | { kind: 'mic' }
  | { kind: 'device'; deviceId: string }
  | { kind: 'stream'; stream: MediaStream };

export interface TranscriberEvents {
  /** NEW words since the last call (stable words, or a whole finished utterance). */
  onWords: (text: string, final: boolean) => void;
  onStatus?: (s: string) => void;
  onLevel?: (level: number, speaking: boolean) => void;
  onError?: (message: string) => void;
}

export interface TranscriberHandle {
  stop: () => void;
  engine: 'speech' | 'whisper';
}

const SILENCE_HANG_MS = 550;
const RMS_THRESH = 0.012;
const MIN_UTTERANCE_S = 0.35;
const MAX_UTTERANCE_S = 14;   // cut long speech so a verse is not held hostage by a sermon that never pauses

function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)] || 0;
  return out;
}

/** Whisper path: VAD-segmented utterances from any MediaStream. */
async function startWhisper(stream: MediaStream, ev: TranscriberEvents, ownsStream: boolean): Promise<TranscriberHandle> {
  const engine = await loadTranslationEngine(ev.onStatus);
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain(); sink.gain.value = 0;      // keeps the processor pulling without playing anything
  src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
  const SR = ctx.sampleRate;

  let stopped = false, speaking = false, silenceMs = 0, bufSec = 0, busy = false;
  let buf: Float32Array[] = [];
  const queue: Float32Array[] = [];

  const drain = async () => {
    busy = true;
    while (queue.length && !stopped) {
      try {
        const text = (await engine.transcribe(resampleTo16k(queue.shift()!, SR))).trim();
        // Whisper hallucinates these on near-silence.
        if (text && !/^[\s.\-♪\[\]()]*(?:thanks for watching|thank you\.?|you)?[\s.]*$/i.test(text)) ev.onWords(text, true);
      } catch (e) { ev.onError?.(String((e as Error)?.message || e)); }
    }
    busy = false;
  };
  const flush = () => {
    speaking = false; silenceMs = 0;
    const segs = buf; buf = []; const sec = bufSec; bufSec = 0;
    if (sec < MIN_UTTERANCE_S) return;
    const total = segs.reduce((n, s) => n + s.length, 0);
    const merged = new Float32Array(total); let o = 0;
    for (const s of segs) { merged.set(s, o); o += s.length; }
    queue.push(merged);
    if (!busy) void drain();
  };

  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const frameMs = (input.length / SR) * 1000;
    ev.onLevel?.(Math.min(1, rms * 6), rms > RMS_THRESH);
    if (rms > RMS_THRESH) { speaking = true; silenceMs = 0; buf.push(new Float32Array(input)); bufSec += frameMs / 1000; if (bufSec > MAX_UTTERANCE_S) flush(); }
    else if (speaking) { buf.push(new Float32Array(input)); bufSec += frameMs / 1000; silenceMs += frameMs; if (silenceMs > SILENCE_HANG_MS) flush(); }
  };

  ev.onStatus?.('Listening');
  return {
    engine: 'whisper',
    stop: () => {
      stopped = true;
      try { proc.disconnect(); src.disconnect(); sink.disconnect(); ctx.close(); } catch { /* */ }
      if (ownsStream) stream.getTracks().forEach(t => t.stop());
    },
  };
}

export async function startLiveTranscription(source: TranscribeSource, ev: TranscriberEvents, lang = 'en-US'): Promise<TranscriberHandle> {
  if (source.kind === 'mic' && listeningAvailable()) {
    const rec: Recognizer = createRecognizer({ lang });
    rec.onWords = words => { const t = words.map(w => w.text).join(' '); if (t) ev.onWords(t, false); };
    rec.onLevel = (l, sp) => ev.onLevel?.(l, sp);
    rec.onState = (s, err) => {
      if (s === 'listening') ev.onStatus?.('Listening');
      else if (s === 'error') ev.onError?.(err?.message || 'Speech recognition stopped');
    };
    // Web Speech reports no level of its own. A meter shows the operator the mic
    // is really live, and its boosted track (when the engine accepts one) lets a
    // soft voice through; it also tells the engine's watchdog someone is talking.
    let meter: MicMeter | null = null;
    if (rec.kind === 'web-speech' && !rec.providesLevel) {
      meter = new MicMeter();
      meter.onLevel = (l, sp) => { ev.onLevel?.(Math.min(1, l * 6), sp); if (sp) rec.noteVoiceActivity(); };
      const err = await meter.start();
      if (err) { meter = null; ev.onError?.(err.message); throw new Error(err.message); }
      (rec as unknown as { inputTrack: MediaStreamTrack | null }).inputTrack = meter.boostedTrack;
    }
    rec.start();
    return { engine: 'speech', stop: () => { try { rec.stop(); } catch { /* */ } meter?.stop(); } };
  }

  if (source.kind === 'stream') return startWhisper(source.stream, ev, false);

  // device, or a mic on a browser with no speech engine
  const constraints: MediaStreamConstraints = {
    audio: source.kind === 'device'
      ? { deviceId: { exact: source.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: false, noiseSuppression: false },
  };
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
  catch (e) { ev.onError?.('Microphone access was blocked'); throw e; }
  return startWhisper(stream, ev, true);
}

/** Audio inputs the operator can pick from (labels need a prior permission grant). */
export async function listAudioInputs(): Promise<Array<{ deviceId: string; label: string }>> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput' && d.deviceId)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio input ${i + 1}` }));
  } catch { return []; }
}

/**
 * Browsers hide input names until the page has used a mic once. Open and close
 * one briefly so the source list shows "Behringer X32 USB", not "Audio input 3".
 */
export async function unlockAudioInputLabels(): Promise<Array<{ deviceId: string; label: string }>> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
  } catch { /* denied: the list still works, just unnamed */ }
  return listAudioInputs();
}

/** True when the browser is still hiding input names. */
export const inputLabelsHidden = (inputs: Array<{ label: string }>) => inputs.length > 0 && inputs.every(d => /^Audio input \d+$/.test(d.label));
