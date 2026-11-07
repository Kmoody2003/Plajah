// Analyse a decoded song off the main thread: Music Intelligence's measureAudio → a SongMap.
import { measureAudio } from '../musicIntel/dsp';
import { buildSongMap, fineEnvelope } from './songMap';

self.onmessage = (e: MessageEvent<{ pcm: Float32Array; sampleRate: number; bpm?: number; firstBeat?: number }>) => {
  try {
    const { pcm, sampleRate, bpm, firstBeat } = e.data;
    const measured = measureAudio(pcm, sampleRate, 1);
    (self as any).postMessage({ map: buildSongMap(measured, { bpm, firstBeat }, fineEnvelope(pcm, sampleRate)), measured: { tempo: measured.tempo, key: measured.key, sections: measured.sections.length } });
  } catch (err) { (self as any).postMessage({ error: String((err as Error)?.message || err) }); }
};
