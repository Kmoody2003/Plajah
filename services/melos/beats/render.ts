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
import { Instrument } from './engine/InstrumentHost';
import { applyPatch, deserializePatch } from '../instruments/onda/patch';
import { encodeWav } from '../../audio/wavEncode';
import { uploadFile } from '../../backendService';
import { auth } from '../../firebase';

const SAMPLE_RATE = 48000;
const TAIL_SEC = 2; // let releases/reverbs ring out past the last step

export interface RenderResult {
  blob: Blob;
  buffer: AudioBuffer;
  seconds: number;
  /** Instrument tracks that could not be rendered (engine failed to load). Normally 0. */
  skippedInstruments: number;
}

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
  const anchor = 0.05; // tiny lead-in so t=0 events get their attack ramp

  const graph = buildGraph(offline, 16);
  graph.applyDoc(doc);
  const voices = new VoiceBank(graph);
  for (const [key, buf] of buffers) voices.setBuffer(key, buf);

  // ── Instruments ───────────────────────────────────────────────────────────
  // Worklet nodes work in an OfflineAudioContext, but rendering outruns message delivery — so
  // every note is queued at an ABSOLUTE sample frame BEFORE startRendering(), and the engine's
  // own frame counter fires it. That's what pa_schedule_note_* exists for.
  // Tracks that back an instrument pad have no clips but must still be created — the pad sequencer
  // drives them (via the trigger() dep below), not the arranger.
  const padInstrumentTrackIds = new Set(
    doc.kit.filter((p) => p.source === 'instrument' && p.instrumentTrackId).map((p) => p.instrumentTrackId!),
  );
  const instrumentTracks = doc.arrangement.filter(
    (t) => t.kind === 'instrument' && !t.mute && !t.foreign &&
      (t.clips.some((c) => c.notes?.length) || padInstrumentTrackIds.has(t.id)),
  );
  const anySolo = doc.arrangement.some((t) => t.solo);
  const instByTrackId = new Map<string, Instrument>();
  let skippedInstruments = 0;

  for (const track of instrumentTracks) {
    if (anySolo && !track.solo) continue;
    try {
      const inst = await Instrument.create(offline, {
        onError: (m) => console.warn('[beats] offline instrument error', track.name, m),
      });
      await inst.whenReady();
      inst.output.connect(graph.trackDestination(track));
      inst.setTempo(1 / spb);
      if (track.position) inst.setSpatial({ position: track.position });
      if (track.instrument?.patch) {
        const patch = deserializePatch(track.instrument.patch);
        if (patch) applyPatch(inst, patch);
      }
      inst.resetTransport(0);
      inst.clearSchedule();
      instByTrackId.set(track.id, inst);

      for (const clip of track.clips) {
        if (!clip.notes?.length) continue;
        for (const note of clip.notes) {
          const startBeats = clip.startBeats + note.startBeats;
          if (startBeats >= endBeats) continue;
          const maxLen = clip.lengthBeats - note.startBeats;
          const lenBeats = Math.max(0.05, Math.min(note.lengthBeats, maxLen));
          // anchor mirrors the drum scheduler's lead-in so both land on the same grid.
          const onFrame = Math.round((anchor + startBeats * spb) * SAMPLE_RATE);
          const offFrame = Math.round((anchor + (startBeats + lenBeats) * spb) * SAMPLE_RATE);
          const voiceId = inst.scheduleNoteOn(note.key, Math.max(0.05, note.vel / 127), onFrame);
          inst.scheduleNoteOff(voiceId, offFrame);
        }
      }
    } catch (e) {
      console.warn('[beats] offline instrument failed', track.name, e);
      skippedInstruments++;
    }
  }

  // KERA pads can't render offline yet — a KERA program is decoded audio loaded at runtime, not
  // part of the serialized patch, so there's nothing to re-instantiate here. Count them honestly
  // rather than bouncing silence that reads as "rendered".
  const trackById = new Map(doc.arrangement.map((t) => [t.id, t]));
  const keraPadTrackIds = new Set(
    [...padInstrumentTrackIds].filter((id) => trackById.get(id)?.instrument?.type === 'kera'),
  );
  skippedInstruments += keraPadTrackIds.size;

  const scheduler = new StepScheduler({
    doc: () => doc,
    toTime: (beats) => anchor + beats * spb,
    secPerBeat: () => spb,
    rng: seededRng(hashSeed(doc.id || 'groove')),
    trigger: (padIdx, vel, when, gateSec, semiOffset) => {
      const pad = doc.kit[padIdx];
      if (pad?.source === 'instrument' && pad.instrumentTrackId) {
        // ONDA pad: pre-schedule at absolute frames, the same path clip notes use.
        if (keraPadTrackIds.has(pad.instrumentTrackId)) return; // KERA offline: see above
        const inst = instByTrackId.get(pad.instrumentTrackId);
        if (!inst) return;
        const note = Math.max(0, Math.min(127, (pad.instrumentNote ?? 60) + (pad.pitchSemis || 0) + (semiOffset || 0)));
        const onFrame = Math.round(when * SAMPLE_RATE);
        const gate = gateSec ?? 0.25; // one-shot instrument pads get a short articulating gate
        const offFrame = Math.round((when + gate) * SAMPLE_RATE);
        const voiceId = inst.scheduleNoteOn(note, Math.max(0.05, vel / 127), onFrame);
        inst.scheduleNoteOff(voiceId, offFrame);
        return;
      }
      voices.trigger(doc, padIdx, vel, when, gateSec, semiOffset);
    },
    startAudioClip: (track, clip, when, offset) =>
      void startAudioClipSource(offline, graph, (k) => voices.getBuffer(k), track, clip, when, offset, spb),
    startInstrumentNote: () => { /* see RenderResult.skippedInstruments */ },
  });
  if (opts.range === 'pattern') {
    scheduler.start('pattern', 0, opts.patternId);
    scheduler.scheduleAll(endBeats);
  } else {
    scheduler.start('song', 0);
    scheduler.scheduleAll(endBeats);
  }

  // Drain every instrument's message queue before rendering. Wavetable/sample uploads are async
  // postMessage with a synchronous mip build on the far side; the OfflineAudioContext renders
  // faster than messages deliver, so without this flush a bounce can read an uncommitted table and
  // go silent (live playback is unaffected — it always has real time between load and note).
  await Promise.all([...instByTrackId.values()].map((i) => i.flush()));

  const rendered = await offline.startRendering();
  return { blob: encodeWav(rendered, opts.bitDepth ?? 24), buffer: rendered, seconds, skippedInstruments };
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
