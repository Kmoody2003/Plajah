// Melos Beats — the offline bounce. Builds the IDENTICAL graph over an OfflineAudioContext
// (graph.ts is context-agnostic by construction) and enumerates every event through the same
// scheduler code path as live playback, with a SEEDED rng so probability steps render
// deterministically — render the same groove twice, get byte-identical files (quality gate #1).
// Pattern: components/spatialMixer/useSpatialAudioEngine.ts:185 renderMixToBlob.

import type { GrooveDoc } from './grooveDoc';
import { buildGraph } from './engine/graph';
import { VoiceBank } from './engine/voices';
import { StepScheduler, seededRng } from './engine/scheduler';
import { startAudioClipSource } from './engine/clips';
import { encodeWav } from '../../audio/wavEncode';
import { uploadFile } from '../../backendService';
import { auth } from '../../firebase';

const SAMPLE_RATE = 48000;
const TAIL_SEC = 2; // let releases/reverbs ring out past the last step

export interface RenderResult { blob: Blob; buffer: AudioBuffer; seconds: number }

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export async function renderGroove(
  doc: GrooveDoc,
  buffers: [string, AudioBuffer][],
  opts: { range: 'pattern' | 'song'; patternId?: string; loops?: number; bitDepth?: 16 | 24 } = { range: 'song' },
): Promise<RenderResult | null> {
  const spb = 60 / (doc.bpm || 120);
  let endBeats: number;
  if (opts.range === 'pattern') {
    const pattern = doc.patterns.find((p) => p.id === opts.patternId) || doc.patterns[0];
    if (!pattern) return null;
    endBeats = (pattern.length / 4) * Math.max(1, opts.loops ?? 2);
  } else {
    endBeats = Math.max(4, ...doc.arrangement.flatMap((t) => t.clips.map((c) => c.startBeats + c.lengthBeats)));
  }
  const seconds = endBeats * spb + TAIL_SEC;
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);

  const graph = buildGraph(offline, 16);
  graph.applyDoc(doc);
  const voices = new VoiceBank(graph);
  for (const [key, buf] of buffers) voices.setBuffer(key, buf);

  const anchor = 0.05; // tiny lead-in so t=0 events get their attack ramp
  const scheduler = new StepScheduler({
    doc: () => doc,
    toTime: (beats) => anchor + beats * spb,
    secPerBeat: () => spb,
    rng: seededRng(hashSeed(doc.id || 'groove')),
    trigger: (padIdx, vel, when, gateSec, semiOffset) => voices.trigger(doc, padIdx, vel, when, gateSec, semiOffset),
    startAudioClip: (track, clip, when, offset) =>
      void startAudioClipSource(offline, graph, (k) => voices.getBuffer(k), track, clip, when, offset, spb),
  });
  if (opts.range === 'pattern') {
    scheduler.start('pattern', 0, opts.patternId);
    scheduler.scheduleAll(endBeats);
  } else {
    scheduler.start('song', 0);
    scheduler.scheduleAll(endBeats);
  }

  const rendered = await offline.startRendering();
  return { blob: encodeWav(rendered, opts.bitDepth ?? 24), buffer: rendered, seconds };
}

/** Bounce → locker upload → seed the Album Creator (the Spatial Mixer publish flow, verbatim shape). */
export async function publishGroove(doc: GrooveDoc, buffers: [string, AudioBuffer][]): Promise<'ok' | 'no-auth' | 'failed'> {
  const user = auth.currentUser;
  if (!user) return 'no-auth';
  const result = await renderGroove(doc, buffers, { range: 'song', bitDepth: 24 });
  if (!result) return 'failed';
  const safe = (doc.name || 'Groove').replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'Groove';
  const file = new File([result.blob], `${safe}.wav`, { type: 'audio/wav' });
  try { void uploadFile(`personal/${user.uid}/melos/beats/renders/${doc.id}-${Date.now()}.wav`, result.blob); } catch { /* best-effort archive copy */ }
  const artist = user.displayName || '';
  const seed = {
    id: `album_${Math.random().toString(36).slice(2, 11)}`,
    title: doc.name || 'Groove',
    artist,
    type: 'MUSIC',
    subType: 'SINGLE',
    genre: 'Beats',
    coverImage: '',
    description: 'Made in Melos Beats.',
    createdAt: Date.now(),
    tracks: [{
      id: `t_${Math.random().toString(36).slice(2, 9)}`,
      title: doc.name || 'Groove',
      artist,
      file,
      url: URL.createObjectURL(result.blob),
      price: 0,
      isPaywalled: false,
      genre: 'Beats',
      mediaKind: 'AUDIO',
    }],
  };
  window.dispatchEvent(new CustomEvent('OPEN_ALBUM_CREATOR', { detail: { album: seed } }));
  return 'ok';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
