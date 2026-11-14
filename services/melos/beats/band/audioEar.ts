// Chora Session Band — Studio Audio Ear.
// Lets virtual musicians hear and analyze:
//   1. Live microphone humming, singing, or beatboxing (`captureMicSnippet`)
//   2. System / browser-tab / computer audio (`captureDeviceAudioSnippet`)
//   3. The current Chora project master mix (`captureProjectMixSnippet`)
//   4. Imported/dropped audio files (`decodeAudioBlobToPcm`)
// Produces a unified `StudiedReference` (BPM, meter, key, chord progression, melodic hum contour,
// percussive beatbox hits, brightness, energy, and human summary) ready for `freshTake` or AI chat.

import { detectBeatsFromBuffer } from '../../../audioBeatDetection';
import { measureAudio } from '../../../musicIntel/dsp';
import { recognizeChordsFromAudio } from '../../transcribe/chordsFromAudio';
import { eventsToNotes, trackBuffer } from '../voice/pitchTrack';
import { classifyHit, hitFeatures, type DrumClass } from '../voice/beatbox';
import { liveBus, now } from './live/events';

export type EarSource = 'mic-hum' | 'system-audio' | 'project-mix' | 'file' | 'reference';

export interface StudiedNote {
  startBeats: number;
  lengthBeats: number;
  midi: number;
  vel: number;
}

export interface StudiedHit {
  beat: number;
  cls: DrumClass;
  vel: number;
}

export interface StudiedReference {
  id: string;
  title: string;
  source: EarSource;
  capturedAt: number;
  durationSec: number;
  bpm: number;
  bpmConfidence: number;
  beatsPerMeasure: number;
  keyLabel: string;
  keyTonic: number;
  keyScale: 'major' | 'minor';
  chords: string[];
  chart: string;
  brightnessHz: number | null;
  loudnessLufs: number | null;
  energy: number;
  contourNotes: StudiedNote[];
  beatboxHits: StudiedHit[];
  summary: string;
}

function scanBeatboxOnsets(pcm: Float32Array, sampleRate: number, bpm: number): StudiedHit[] {
  const hits: StudiedHit[] = [];
  const win = Math.max(256, Math.round(0.045 * sampleRate));
  const hop = Math.max(128, Math.round(0.015 * sampleRate));
  const secPerBeat = 60 / Math.max(40, bpm);
  let prevRms = 0;
  let lastHitSec = -1;
  for (let i = 0; i + win <= pcm.length; i += hop) {
    let sq = 0;
    for (let j = i; j < i + win; j++) sq += pcm[j] * pcm[j];
    const rms = Math.sqrt(sq / win);
    const tSec = i / sampleRate;
    const isRise = rms > 0.045 && rms > prevRms * 1.85 && tSec - lastHitSec >= 0.11;
    if (isRise) {
      const seg = pcm.subarray(i, Math.min(pcm.length, i + win));
      const { cls, confidence } = classifyHit(hitFeatures(seg, sampleRate), null);
      if (confidence >= 0.25) {
        const db = 20 * Math.log10(Math.max(1e-5, rms));
        const vel = Math.max(32, Math.min(127, Math.round(52 + (db + 36) * 2.2)));
        hits.push({ beat: Math.round((tSec / secPerBeat) * 16) / 16, cls, vel });
        lastHitSec = tSec;
      }
    }
    prevRms = rms * 0.7 + prevRms * 0.3;
  }
  return hits.slice(0, 64);
}

/** Pure DSP analyzer (safe in Node tests and browsers): turns mono PCM into a StudiedReference. */
export function analyzeAudioBufferToReference(
  pcm: Float32Array,
  sampleRate: number,
  source: EarSource,
  title = 'Listened Snippet',
): StudiedReference {
  const durationSec = pcm.length / Math.max(8000, sampleRate);
  const measured = measureAudio(pcm, sampleRate, 1);
  const beatInfo = detectBeatsFromBuffer(pcm, sampleRate, durationSec);
  const chordRes = recognizeChordsFromAudio(pcm, sampleRate, beatInfo.beats.length >= 2 ? beatInfo.beats : undefined);

  const bpm = Math.round(
    (beatInfo.confidence >= 0.22 && beatInfo.bpm ? beatInfo.bpm : chordRes.bpm || measured.tempo.bpm || 120) * 10,
  ) / 10;
  const secPerBeat = 60 / Math.max(40, bpm);

  // Extract sung/hummed melodic phrase via YIN pitch segmentation.
  const segEvents = trackBuffer(pcm, sampleRate, { minNoteSec: 0.08 });
  const rawNotes = eventsToNotes(segEvents, 0.08);
  const tZero = rawNotes[0]?.t0 ?? 0;
  const contourNotes: StudiedNote[] = rawNotes.slice(0, 64).map((n) => ({
    startBeats: Math.max(0, Math.round(((n.t0 - tZero) / secPerBeat) * 16) / 16),
    lengthBeats: Math.max(0.125, Math.round(((n.t1 - n.t0) / secPerBeat) * 16) / 16),
    midi: n.midi,
    vel: n.vel,
  }));

  const beatboxHits = scanBeatboxOnsets(pcm, sampleRate, bpm);
  const lufs = measured.integratedLufs;
  const energy = lufs === null || !Number.isFinite(lufs)
    ? (contourNotes.length ? 0.55 : 0.4)
    : Math.max(0.15, Math.min(1, (lufs + 36) / 26));

  const chords = chordRes.chords.slice(0, 8);
  const keyLabel = chordRes.key.label || measured.key.key || 'C major';
  const summaryParts = [
    `${source}: "${title}"`,
    `${bpm} BPM (${beatInfo.beatsPerMeasure ?? 4}/4)`,
    `Key ${keyLabel}`,
    chords.length ? `Chords ${chords.join(' | ')}` : '',
    contourNotes.length ? `${contourNotes.length} hummed/melody notes` : '',
    beatboxHits.length ? `${beatboxHits.length} percussive accents` : '',
  ].filter(Boolean);

  return {
    id: `ear_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    source,
    capturedAt: Date.now(),
    durationSec: Math.round(durationSec * 100) / 100,
    bpm,
    bpmConfidence: Math.max(beatInfo.confidence, measured.tempo.confidence),
    beatsPerMeasure: beatInfo.beatsPerMeasure ?? 4,
    keyLabel,
    keyTonic: chordRes.key.tonic,
    keyScale: chordRes.key.mode,
    chords,
    chart: chordRes.chart,
    brightnessHz: measured.brightnessHz,
    loudnessLufs: lufs,
    energy: Math.round(energy * 100) / 100,
    contourNotes,
    beatboxHits,
    summary: summaryParts.join(' · '),
  };
}

/** Broadcast an already-analyzed reference on the studio bus so live musicians react. */
export function publishStudiedReference(ref: StudiedReference): StudiedReference {
  liveBus.emit({
    kind: 'study',
    instrument: 'studio',
    source: ref.source,
    bpm: ref.bpm,
    key: ref.keyLabel,
    chords: ref.chords,
    summary: ref.summary,
    at: now(),
  });
  return ref;
}

/** Decode an uploaded/recorded audio Blob/ArrayBuffer into mono PCM via OfflineAudioContext. */
export async function decodeAudioArrayBufferToMono(arrayBuf: ArrayBuffer): Promise<{ data: Float32Array; sampleRate: number }> {
  const Ctx: typeof OfflineAudioContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!Ctx) throw new Error('Audio decoding requires a browser AudioContext.');
  const tmp = new Ctx(1, 1, 44100);
  const audioBuf = await tmp.decodeAudioData(arrayBuf.slice(0));
  const ch = audioBuf.numberOfChannels;
  const len = audioBuf.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const channelData = audioBuf.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += channelData[i] / ch;
  }
  return { data: mono, sampleRate: audioBuf.sampleRate };
}

/** Record a short clip from any browser MediaStream into mono PCM using MediaRecorder + decodeAudioData. */
export async function captureStreamToMono(stream: MediaStream, durationMs = 4500, signal?: AbortSignal): Promise<{ data: Float32Array; sampleRate: number }> {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder unavailable on this device.');
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) throw new Error('No audio track was shared or found.');
  const audioOnly = new MediaStream(audioTracks);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(audioOnly);

  const recorded = await new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    };
    const timer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
    const onAbort = () => {
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      if (!settled) { settled = true; reject(new DOMException('Aborted', 'AbortError')); }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
    recorder.onerror = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (!settled) { settled = true; reject(new Error('Audio capture failed.')); }
    };
    recorder.onstop = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      finish();
    };
    recorder.start(150);
  });

  const buf = await recorded.arrayBuffer();
  return decodeAudioArrayBufferToMono(buf);
}

/** Capture live microphone humming, singing, or beatboxing (4.5 s default) and analyze it. */
export async function captureMicSnippet(durationMs = 4500, title = 'Vocal / Hum Idea', signal?: AbortSignal): Promise<StudiedReference> {
  if (!navigator?.mediaDevices?.getUserMedia) throw new Error('Microphone unavailable in this browser.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  try {
    const { data, sampleRate } = await captureStreamToMono(stream, durationMs, signal);
    return publishStudiedReference(analyzeAudioBufferToReference(data, sampleRate, 'mic-hum', title));
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Capture audio from another browser tab or system output (`getDisplayMedia` with audio) and analyze it. */
export async function captureDeviceAudioSnippet(durationMs = 5000, title = 'Computer / Tab Reference', signal?: AbortSignal): Promise<StudiedReference> {
  const md = navigator?.mediaDevices as MediaDevices & { getDisplayMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> };
  if (!md?.getDisplayMedia) throw new Error('System / tab audio sharing is not supported on this device.');
  const stream = await md.getDisplayMedia({ audio: true, video: true });
  try {
    const { data, sampleRate } = await captureStreamToMono(stream, durationMs, signal);
    return publishStudiedReference(analyzeAudioBufferToReference(data, sampleRate, 'system-audio', title));
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Tap the live Chora project master output without re-routing to speakers and analyze it. */
export async function captureProjectMixSnippet(durationMs = 4500, title = 'Current Chora Mix', signal?: AbortSignal): Promise<StudiedReference> {
  const { BeatsEngine } = await import('../engine/BeatsEngine');
  const tap = BeatsEngine.get().masterMeterTap();
  if (!tap) throw new Error('Start Chora audio first before listening to the project mix.');
  const ctx = tap.ctx as AudioContext;
  if (typeof ctx.createMediaStreamDestination !== 'function') {
    throw new Error('Master mix capture unavailable in this AudioContext.');
  }
  const dest = ctx.createMediaStreamDestination();
  tap.node.connect(dest);
  try {
    const { data, sampleRate } = await captureStreamToMono(dest.stream, durationMs, signal);
    return publishStudiedReference(analyzeAudioBufferToReference(data, sampleRate, 'project-mix', title));
  } finally {
    try { tap.node.disconnect(dest); } catch { /* already disconnected */ }
  }
}

/** Analyze a local audio File uploaded by the user. */
export async function studyAudioFile(file: File): Promise<StudiedReference> {
  const { data, sampleRate } = await decodeAudioArrayBufferToMono(await file.arrayBuffer());
  const cleanName = file.name.replace(/\.[^.]+$/, '') || 'Audio File';
  return publishStudiedReference(analyzeAudioBufferToReference(data, sampleRate, 'file', cleanName));
}
