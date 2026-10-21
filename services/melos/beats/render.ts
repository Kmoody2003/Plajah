// Melos Beats — the offline bounce. Builds the IDENTICAL graph over an OfflineAudioContext
// (graph.ts is context-agnostic by construction) and enumerates every event through the same
// scheduler code path as live playback, with a SEEDED rng so probability steps render
// deterministically — render the same groove twice, get byte-identical files (quality gate #1).
// Pattern: components/spatialMixer/useSpatialAudioEngine.ts:185 renderMixToBlob.

import type { GrooveDoc } from './grooveDoc';
import { songTime } from './tempoMap';
import { noteOccurrences } from './clipContent';
import { effectiveLanes, isMessageTarget, laneValueAt, sustainedEnd } from './automation';
import { AutomationPlayer, applyMessage } from './engine/automationPlayer';
import { buildGraph } from './engine/graph';
import { MasteringChain, type MasteringState } from './fx/mastering';
import { FxChainHost } from './fx/devices';
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
  // The bounce walks the same tempo track the transport does — a ritardando prints as one.
  const { tempo } = songTime(doc);
  let endBeats: number;
  if (opts.range === 'pattern') {
    const pattern = doc.patterns.find((p) => p.id === opts.patternId) || doc.patterns[0];
    if (!pattern) return null;
    endBeats = (pattern.length / 4) * Math.max(1, opts.loops ?? 2);
  } else {
    endBeats = Math.max(4, ...doc.arrangement.flatMap((t) => t.clips.map((c) => c.startBeats + c.lengthBeats)));
  }
  const seconds = tempo.beatToSec(endBeats) + TAIL_SEC;
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const anchor = 0.05; // tiny lead-in so t=0 events get their attack ramp

  const graph = buildGraph(offline, 16);
  // Automation prints too: param lanes are scheduled on the offline graph below, so applyDoc
  // leaves the params they own alone.
  const automation = new AutomationPlayer();
  automation.refresh(doc);
  graph.applyDoc(doc, automation.automated);
  // The Pressing renders too — the bounce must sound like the room did (quality gate #1 again).
  // MasteringChain is context-agnostic native nodes, so the identical device rebuilds offline.
  const masteringState = doc.mixer.master.mastering as unknown as MasteringState | undefined;
  if (masteringState?.on) {
    const chain = new MasteringChain(offline);
    chain.setState(masteringState);
    graph.setMasterChain(chain.input, chain.output);
    graph.setGlueOn(!!masteringState.glue);
  }
  // The mixer's inserts + aux sends print too — FxChainHost is context-agnostic, so the bounce
  // is the same board the live room heard (BeatsEngine.syncMixerFx, offline). Every channel.
  // Tempo-synced devices (Gater, Beatmasher) need the song's BPM before the chain builds.
  const chain = (instances: Parameters<FxChainHost['setChain']>[0]) => {
    const h = new FxChainHost(offline);
    h.setTempo(doc.bpm || 120);
    h.setChain(instances);
    return h;
  };
  doc.kit.forEach((pad, i) => {
    const inserts = (pad.inserts ?? []).filter((f) => f.on);
    if (inserts.length) { const h = chain(pad.inserts ?? []); graph.setPadInsert(i, h.input, h.output); }
    const sends = pad.sends ?? [];
    for (let s = 0; s < 2; s++) graph.setPadSend(i, s, sends[s] ?? 0);
  });
  for (const t of doc.arrangement) {
    // Audio AND instrument tracks print their inserts/sends (instrument tracks used to be skipped
    // here, so a synth's channel FX were heard live but missing from the bounce).
    if (t.kind !== 'audio' && t.kind !== 'instrument') continue;
    if (t.foreign) continue;
    graph.trackDestination(t); // ensure the strip exists before wiring its insert/sends
    const inserts = (t.inserts ?? []).filter((f) => f.on);
    if (inserts.length) { const h = chain(t.inserts ?? []); graph.setTrackInsert(t.id, h.input, h.output); }
    const sends = t.sends ?? [];
    for (let s = 0; s < 2; s++) graph.setTrackSend(t.id, s, sends[s] ?? 0);
  }
  doc.mixer.groups.forEach((ch, i) => {
    const inserts = (ch.inserts ?? []).filter((f) => f.on);
    if (inserts.length) { const h = chain(ch.inserts ?? []); graph.setGroupInsert(i, h.input, h.output); }
    const sends = ch.sends ?? [];
    for (let s = 0; s < 2; s++) graph.setGroupSend(i, s, sends[s] ?? 0);
  });
  (doc.mixer.sendBuses ?? []).forEach((b, s) => {
    graph.setSendReturnGain(s, b.gainDb ?? 0);
    const inserts = (b.inserts ?? []).filter((f) => f.on);
    if (inserts.length) { const h = chain(b.inserts ?? []); graph.setSendInsert(s, h.input, h.output); }
  });
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
        const tType = track.instrument.type;
        if (tType === 'vela' || tType === 'cantus' || tType === 'ison' || tType === 'pneuma') {
          const { deserializeVelaPatch, velaEngineParams } = await import('../instruments/vela/patch');
          const p = deserializeVelaPatch(track.instrument.patch);
          if (p) inst.setParams(velaEngineParams(p));
        } else if (tType === 'aura') {
          const { deserializeAuraPatch, applyAuraPatch } = await import('../instruments/aura/patch');
          const p = deserializeAuraPatch(track.instrument.patch);
          if (p) applyAuraPatch(inst, p);
        } else if (tType === 'soma') {
          const { deserializeSomaPatch, applySomaPatch } = await import('../instruments/soma/patch');
          const p = deserializeSomaPatch(track.instrument.patch);
          if (p) applySomaPatch(inst, p);
        } else if (tType === 'bajo') {
          const { deserializeBajoPatch, applyBajoPatch } = await import('../instruments/bajo/patch');
          const p = deserializeBajoPatch(track.instrument.patch);
          if (p) applyBajoPatch(inst, p);
        } else {
          const patch = deserializePatch(track.instrument.patch);
          if (patch) applyPatch(inst, patch);
        }
      }
      inst.resetTransport(0);
      inst.clearSchedule();
      instByTrackId.set(track.id, inst);

      const sustain = effectiveLanes(track).get('sustain');
      for (const clip of track.clips) {
        if (!clip.notes?.length) continue;
        // Same window (slip offset + loop) and sustain-pedal rules as the live scheduler.
        for (const occ of noteOccurrences(clip, -Infinity, endBeats)) {
          const startBeats = occ.songBeat;
          const end = sustainedEnd(sustain, startBeats + Math.max(0.05, occ.lengthBeats), clip.startBeats + clip.lengthBeats);
          // anchor mirrors the drum scheduler's lead-in so both land on the same grid.
          const onFrame = Math.round((anchor + tempo.beatToSec(startBeats)) * SAMPLE_RATE);
          const offFrame = Math.round((anchor + tempo.beatToSec(end)) * SAMPLE_RATE);
          const voiceId = inst.scheduleNoteOn(occ.note.key, Math.max(0.05, occ.note.vel / 127), onFrame);
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
    toTime: (beats) => anchor + tempo.beatToSec(beats),
    secBetween: (a, b) => tempo.secBetween(a, b),
    rng: seededRng(hashSeed(doc.id || 'groove')),
    trigger: (padIdx, vel, when, gateSec, semiOffset, pan, _stepFx, skipChoke, mods) => {
      const pad = doc.kit[padIdx];
      if (pad?.empty || pad?.mute) return; // placeholder / muted pad prints nothing
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
      // Per-step pan prints in the bounce; Step-FX offline routing is a follow-up.
      voices.trigger(doc, padIdx, vel, when, gateSec, semiOffset, pan, undefined, skipChoke, mods);
    },
    startAudioClip: (track, clip, when, offset) =>
      void startAudioClipSource(offline, graph, (k) => voices.getBuffer(k), track, clip, when, offset,
        tempo.secBetween(clip.startBeats, clip.startBeats + clip.lengthBeats)),
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
  // Track automation: AudioParam lanes as sample-accurate ramps; instrument-message lanes (macros,
  // mod wheel, pitch bend) by suspending the render at each change and posting the message.
  if (opts.range === 'song') {
    automation.scheduleParams(doc, graph, 0, 0, endBeats, (b) => anchor + tempo.beatToSec(b));
    const QUANTUM = 128 / SAMPLE_RATE;
    const events = new Map<number, (() => void)[]>();
    const MAX_EVENTS = 4000;
    let count = 0;
    for (const [trackId, inst] of instByTrackId) {
      const lanes = automation.lanesFor(trackId);
      if (!lanes) continue;
      for (const lane of lanes.values()) {
        if (!isMessageTarget(lane.target)) continue;
        let last: number | undefined;
        for (let b = 0; b <= endBeats + 1e-9 && count < MAX_EVENTS; b += 1 / 16) {
          const v = laneValueAt(lane, b);
          if (v === undefined) break;
          if (last !== undefined && Math.abs(v - last) < 0.002) continue;
          last = v;
          const q = Math.floor((anchor + tempo.beatToSec(b)) / QUANTUM) * QUANTUM;
          const target = lane.target;
          const act = () => applyMessage(inst, target, v);
          if (q <= 0) { act(); continue; } // initial values: before the first sample
          const list = events.get(q) ?? [];
          list.push(act);
          events.set(q, list);
          count++;
        }
      }
    }
    const insts = [...instByTrackId.values()];
    for (const [q, acts] of events) {
      if (q >= seconds) continue;
      void offline.suspend(q).then(async () => {
        for (const a of acts) a();
        await Promise.all(insts.map((i) => i.flush()));
        await offline.resume();
      });
    }
  }

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
