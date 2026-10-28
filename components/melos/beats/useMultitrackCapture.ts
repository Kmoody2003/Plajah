// Record + rolling transport + armed hardware-input tracks → one native ASIO multitrack take.
//
// Capture starts on the record pass's rising edge (desktop app only) and stops on the falling
// edge; the per-input files are then imported as clips at the beat where the take's first sample
// sits (takeImport.ts). Every track of a take shares the driver's buffers, so tracks are
// sample-aligned with each other. Overdubs are placed against what the performer heard: the
// driver's reported input latency and the browser's output latency are both taken out.

import { useEffect, useRef } from 'react';
import type { GrooveDoc } from '../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample } from '../../../services/melos/beats/sampleStore';
import { audioPeaks } from '../../../services/melos/beats/jamLink';
import { applyTake, armedInputTracks, captureInputs, encodeWavFloat, sampleZeroBeat, type TakeClip } from '../../../services/melos/beats/mixerLink/takeImport';
import type { MultitrackTake } from '../../../services/melos/beats/mixerLink/types';
import { isWindowsApp, startAsioCapture, stopAsioCapture, type AsioTakeResult } from '../../../services/windowsBridgeService';

/** Decoded takes live in memory like every other clip; past this the take stays on disk. */
const IMPORT_BUDGET_BYTES = 1.5 * 1024 ** 3;

/** How late Chora's playback reaches the speakers (what the performer plays along to). */
function outputLatencySec(): number {
  const c = BeatsEngine.get().getContext() as (AudioContext & { outputLatency?: number }) | null;
  return Math.max(0, c?.outputLatency || c?.baseLatency || 0);
}

export const asioDriverOf = (endpointId: string) => endpointId.replace(/^asio:/, '');

interface Pass {
  takeId: string;
  driver: string;
  deviceId: string;
  sampleRate: number;
  anchor: { wallMs: number; beats: number };
  outputSec: number;
  tracks: Array<{ trackId: string; name: string; input: number; inputR?: number }>;
}

export function useMultitrackCapture(opts: {
  doc: GrooveDoc;
  mutate: (fn: (d: GrooveDoc) => void) => void;
  recording: boolean;
  running: boolean;
  flash: (msg: string) => void;
}): void {
  const { doc, mutate, recording, running, flash } = opts;
  const docRef = useRef(doc);
  docRef.current = doc;
  const pass = useRef<Pass | null>(null);
  const starting = useRef(false);

  const armed = isWindowsApp() ? armedInputTracks(doc) : [];
  const want = recording && running && armed.length > 0;

  useEffect(() => {
    if (want && !pass.current && !starting.current) {
      const tracks = armedInputTracks(docRef.current);
      const endpointId = tracks[0].input!.endpointId;
      const same = tracks.filter((t) => t.input!.endpointId === endpointId);
      if (same.length < tracks.length) flash(`Recording ${same.length} of ${tracks.length} armed tracks — one interface at a time`);
      const takeId = `take${Date.now().toString(36)}`;
      const sampleRate = docRef.current.mixerLink?.sampleRate ?? 48000;
      starting.current = true;
      void startAsioCapture({ driver: asioDriverOf(endpointId), inputs: captureInputs(same), sampleRate, takeId, write: true })
        .then((r) => {
          if (!r.ok) { flash(`Couldn't start recording: ${r.error ?? 'driver error'}`); return; }
          pass.current = {
            takeId, driver: asioDriverOf(endpointId), deviceId: same[0].input!.deviceId, sampleRate,
            anchor: { wallMs: performance.timeOrigin + performance.now(), beats: BeatsEngine.get().posBeats() },
            outputSec: outputLatencySec(),
            tracks: same.map((t) => ({ trackId: t.id, name: t.name, input: t.input!.input, inputR: t.input!.inputR })),
          };
        })
        .catch((e) => flash(`Couldn't start recording: ${e instanceof Error ? e.message : e}`))
        .finally(() => { starting.current = false; });
    } else if (!want && pass.current) {
      const p = pass.current;
      pass.current = null;
      void stopAsioCapture(p.takeId)
        .then((r) => importTake(p, r))
        .catch((e) => flash(`Recording stopped with an error: ${e instanceof Error ? e.message : e}`));
    }
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving Chora mid-take still closes the files cleanly.
  useEffect(() => () => { const p = pass.current; if (p) { pass.current = null; void stopAsioCapture(p.takeId).catch(() => {}); } }, []);

  async function importTake(p: Pass, r: AsioTakeResult): Promise<void> {
    if (!r.files.length) { flash(`Nothing was recorded${r.error ? `: ${r.error}` : ''}`); return; }
    const folder = r.files[0].path.replace(/[\\/][^\\/]+$/, '');
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const ratio = ctx.sampleRate / r.sampleRate;
    const decodedBytes = r.files.reduce((n, f) => n + f.frames * 4 * ratio, 0);
    if (decodedBytes > IMPORT_BUDGET_BYTES) {
      flash(`Take saved (${Math.round(r.durationSec / 60)} min, ${r.files.length} tracks) to ${folder} — too large to load into the timeline yet`);
      return;
    }
    const byInput = new Map(r.files.map((f) => [f.input, f]));
    const fetchBlob = async (input: number) => { const f = byInput.get(input); return f ? (await fetch(f.url)).blob() : null; };

    const clips: TakeClip[] = [];
    for (const t of p.tracks) {
      let blob: Blob | null;
      if (t.inputR == null) blob = await fetchBlob(t.input);
      else {
        const [l, rr] = await Promise.all([fetchBlob(t.input), fetchBlob(t.inputR)]);
        if (!l || !rr) blob = l ?? rr;
        else {
          const [bl, br] = await Promise.all([ctx.decodeAudioData(await l.arrayBuffer()), ctx.decodeAudioData(await rr.arrayBuffer())]);
          blob = new Blob([encodeWavFloat([bl.getChannelData(0), br.getChannelData(0)], bl.sampleRate)], { type: 'audio/wav' });
        }
      }
      if (!blob) continue;
      const res = await ingestSample(blob, t.name, ctx);
      if (!res) continue;
      engine.setSampleBuffer(res.ref.key, res.buffer);
      clips.push({ trackId: t.trackId, sampleKey: res.ref.key, name: t.name, durationSec: res.buffer.duration, peaks: audioPeaks(res.buffer) });
    }

    const live = docRef.current;
    const startBeats = r.firstBufferMs
      ? sampleZeroBeat(live, p.anchor, r.firstBufferMs, r.bufferFrames, r.sampleRate, { inputFrames: r.inputLatencyFrames, outputSec: p.outputSec })
      : p.anchor.beats;
    const clippedIdx = new Set(r.clippedInputs);
    const take: MultitrackTake = {
      id: p.takeId, deviceId: p.deviceId, transport: 'usb-asio', sampleRate: r.sampleRate,
      startedAt: r.firstBufferMs || Date.now(), startBeats, durationSec: r.durationSec, folder,
      tracks: p.tracks.flatMap((t) => {
        const c = clips.find((x) => x.trackId === t.trackId);
        return c ? [{ trackId: t.trackId, input: t.input, ...(t.inputR != null ? { inputR: t.inputR } : {}), sampleKey: c.sampleKey }] : [];
      }),
      health: {
        droppedFrames: r.droppedFrames,
        clippedTracks: p.tracks.filter((t) => clippedIdx.has(t.input) || (t.inputR != null && clippedIdx.has(t.inputR))).map((t) => t.trackId),
      },
    };
    mutate((d) => applyTake(d, take, clips, grooveUid, { model: p.driver, family: 'generic' }));
    const notes = [
      r.droppedFrames > 0 ? `${r.droppedFrames} frames dropped (disk fell behind)` : '',
      take.health.clippedTracks.length ? `${take.health.clippedTracks.length} track(s) clipped` : '',
    ].filter(Boolean).join(' · ');
    flash(`Recorded ${clips.length} track${clips.length === 1 ? '' : 's'}${notes ? ` — ${notes}` : ''}`);
  }
}
