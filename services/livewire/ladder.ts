// services/livewire/ladder.ts — pick the rungs a broadcaster should encode.
//
// The efficiency edge of Livewire lives here:
//   • content-aware bitrates: slides and a talking head need a fraction of what sports needs,
//     and delivery cost is bitrate × viewers, so this is the biggest lever we control;
//   • the ladder must fit the broadcaster's real upload (we keep 30% headroom for jitter);
//   • AV1 rungs (≈35% fewer bits than H.264 at the same quality) are added on top of the
//     H.264 ladder when the GPU and uplink allow — H.264 stays for every device that can't
//     decode AV1;
//   • consumer NVENC allows 8 concurrent sessions; we never plan more.
// Pure: no I/O. Numbers are starting points to tune with real player telemetry.

import type { ContentKind, EncoderFamily, LadderInput, LadderPlan, Rung, RungName } from './types';

/** H.264 kbps at 30 fps for "sports-grade" motion; scaled down by content below. */
const BASE_KBPS: Record<1080 | 720 | 480 | 360, number> = { 1080: 5000, 720: 2800, 480: 1200, 360: 700 };

/** How much of the sports-grade bitrate each kind of content actually needs. */
export const CONTENT_FACTOR: Record<ContentKind, number> = {
  slides: 0.45,   // mostly still pages; motion only on transitions
  talk: 0.6,      // lectures, sermons, podcasts on camera
  worship: 0.8,   // stage lights, crowd, camera moves
  music: 0.85,
  sports: 1.0,
  game: 1.05,     // fine detail + fast motion
};

const FPS60_FACTOR = 1.5;
export const AV1_FACTOR = 0.65;
export const AUDIO_KBPS = 128;
/** Upload we let the ladder use; the rest absorbs Wi-Fi jitter and retransmits. */
export const UPLINK_USE = 0.7;
export const MAX_SESSIONS: Record<EncoderFamily, number> = { nvenc: 8, qsv: 8, amf: 8, x264: 3 };
/** Never plan below this per-rung video bitrate: below it the picture falls apart. */
const FLOOR_KBPS = 300;

const round50 = (n: number) => Math.max(FLOOR_KBPS, Math.round(n / 50) * 50);

function videoKbps(height: 1080 | 720 | 480 | 360, fps: number, content: ContentKind, av1 = false): number {
  let k = BASE_KBPS[height] * CONTENT_FACTOR[content];
  if (fps > 30) k *= FPS60_FACTOR;
  if (av1) k *= AV1_FACTOR;
  return round50(k);
}

function makeRung(name: RungName, height: 1080 | 720 | 480 | 360, aspect: number, fps: number,
  content: ContentKind, av1 = false): Rung {
  const width = Math.round((height * aspect) / 2) * 2; // even width (encoder requirement)
  const v = videoKbps(height, fps, content, av1);
  return { name, codec: av1 ? 'av1' : 'h264', width, height, fps, videoKbps: v, maxKbps: Math.round(v * 1.2), audioKbps: AUDIO_KBPS };
}

const uploadOf = (rungs: Rung[]) => rungs.reduce((s, r) => s + r.maxKbps + r.audioKbps, 0);

export function planLadder(input: LadderInput): LadderPlan {
  const notes: string[] = [];
  const aspect = input.sourceWidth > 0 && input.sourceHeight > 0 ? input.sourceWidth / input.sourceHeight : 16 / 9;
  const cap = Math.min(input.maxHeight ?? 1080, input.sourceHeight || 1080);
  const budget = Math.floor(input.uplinkKbps * UPLINK_USE);
  // Small rungs keep 30 fps: phones on weak networks gain nothing from 60.
  const fpsFor = (h: number) => (h >= 720 ? input.fps : Math.min(input.fps, 30));

  const heights = ([1080, 720, 480, 360] as const).filter(h => h <= cap);
  if (!heights.length) heights.push(360 as never);

  let rungs: Rung[] = heights.map(h => makeRung(`${h}p` as RungName, h, aspect, fpsFor(h), input.content));

  // Drop the top rung until the H.264 ladder fits the uplink (keep at least two video rungs if we can).
  while (rungs.length > 1 && uploadOf(rungs) > budget) {
    notes.push(`dropped ${rungs[0].name}: ladder needs ${uploadOf(rungs)} kbps, upload allows ${budget}`);
    rungs = rungs.slice(1);
  }

  const audio: Rung = { name: 'audio', codec: 'none', width: 0, height: 0, fps: 0, videoKbps: 0, maxKbps: 0, audioKbps: AUDIO_KBPS };

  // Too weak to carry even one rung + audio-only comfortably → let the relay build the ladder.
  if (uploadOf(rungs) > budget || (input.encoder === 'x264' && rungs.length > 2)) {
    const single = rungs[0];
    notes.push(input.encoder === 'x264'
      ? 'no GPU encoder: send one rung, the Livewire relay builds the ladder'
      : 'upload too slow for a ladder: send one rung, the Livewire relay builds the ladder');
    return { rungs: [single], uploadKbps: uploadOf([single]), encoderSessions: 1, mode: 'relay', notes };
  }

  // AV1 on top, biggest first, while upload and encoder sessions allow.
  if (input.av1 && input.encoder !== 'x264') {
    for (const h of [1080, 720] as const) {
      if (!rungs.some(r => r.height === h)) continue;
      const extra = makeRung(`av1_${h}p` as RungName, h, aspect, fpsFor(h), input.content, true);
      const next = [...rungs, extra];
      if (uploadOf(next) + audio.audioKbps <= budget && next.length + 1 <= MAX_SESSIONS[input.encoder]) rungs = next;
      else notes.push(`skipped ${extra.name}: not enough upload`);
    }
  }

  rungs.push(audio);
  const sessions = rungs.filter(r => r.codec !== 'none').length;
  return { rungs, uploadKbps: uploadOf(rungs), encoderSessions: sessions, mode: 'desktop', notes };
}

/** Average kbps a viewer pulls, given a share of viewers on each rung (for cost estimates). */
export function deliveredKbps(plan: LadderPlan, share?: Partial<Record<RungName, number>>): number {
  const video = plan.rungs.filter(r => r.codec !== 'none');
  if (!video.length) return AUDIO_KBPS;
  const weights = video.map(r => share?.[r.name] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return Math.round(video.reduce((s, r, i) => s + (r.videoKbps + r.audioKbps) * (weights[i] / total), 0));
}
