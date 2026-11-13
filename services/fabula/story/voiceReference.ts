// voiceReference — turning a voice lock into something a voice model can use.
//
// A voice lock is a list of timed stretches of one character speaking, spread across clips. Voice
// models that clone from a sample (Fish Speech on-platform; most hosted ones the same way) want ONE
// short clean file. This module picks the stretches (`planVoiceReference`, pure) and renders them
// into a single mono WAV on this device (`renderVoiceReference`, browser) — nothing is uploaded.
//
// The reference is what makes the lock model-independent in practice: any provider that clones from
// audio takes the same file, and `speakInLockedVoice` shows the shape of using it with a delivery
// direction from the performance engine.

import type { VoiceLock, VoiceSample } from './characterIntel';
import type { PerformanceBeat } from './performance';

export interface ReferenceCut { assetId: string; srcIn: number; duration: number }

/** Seconds of reference a zero-shot cloner uses well. More mostly adds noise and upload size. */
export const REFERENCE_TARGET_SEC = 20;
const MAX_PER_CUT = 8;

/** Choose what goes into the reference file: a few seconds from each of the lock's samples in turn, so
 *  no single take dominates, until the target length is reached. A sample with no known length (an
 *  untimed audio file) contributes its opening seconds only. */
export function planVoiceReference(lock: Pick<VoiceLock, 'samples'>, targetSec = REFERENCE_TARGET_SEC): { cuts: ReferenceCut[]; totalSec: number } {
  const cuts: ReferenceCut[] = [];
  let totalSec = 0;
  // Round-robin: a few seconds from each sample, then — if that falls short — the next few seconds
  // of the samples that have more, so one long take can still fill the reference on its own.
  const taken = new Map<VoiceSample, number>();
  for (let round = 0; round < 6 && totalSec < targetSec; round++) {
    let progressed = false;
    for (const s of lock.samples as VoiceSample[]) {
      if (totalSec >= targetSec) break;
      const used = taken.get(s) || 0;
      const left = s.duration > 0 ? s.duration - used : (used ? 0 : MAX_PER_CUT);
      const want = Math.min(MAX_PER_CUT, targetSec - totalSec, left);
      if (want < 1) continue;
      cuts.push({ assetId: s.assetId, srcIn: Math.round((Math.max(0, s.srcIn || 0) + used) * 100) / 100, duration: Math.round(want * 100) / 100 });
      taken.set(s, used + want); totalSec += want; progressed = true;
    }
    if (!progressed) break;
  }
  return { cuts, totalSec: Math.round(totalSec * 100) / 100 };
}

/** The emotion tag a tag-driven voice model (Fish Speech) takes, from the performance engine's beat. */
export function voiceTagFor(beat: PerformanceBeat | undefined): 'neutral' | 'urgent' | 'whisper' | 'dramatic' | 'intimate' | 'shout' {
  if (!beat) return 'neutral';
  const { arousal, valence, dominance, intensity } = beat.emotion;
  if (arousal > 0.75 && dominance > 0.6 && intensity > 0.7) return 'shout';
  if (arousal > 0.65) return 'urgent';
  if (arousal < 0.35 && valence > 0.3) return 'intimate';
  if (arousal < 0.3) return 'whisper';
  if (intensity > 0.6) return 'dramatic';
  return 'neutral';
}

/** Render the planned cuts into one mono WAV. `resolveBlob` returns the bytes of an asset (audio or
 *  video — the audio track is decoded either way). Cuts that can't be decoded are skipped and
 *  reported; the call fails only if nothing usable is left. */
export async function renderVoiceReference(
  cuts: ReferenceCut[],
  resolveBlob: (assetId: string) => Promise<Blob>,
  encodeWav: (samples: Float32Array, sampleRate: number) => Blob,
): Promise<{ wav: Blob; seconds: number; skipped: string[] }> {
  const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const rate = ctx.sampleRate;
  const decoded = new Map<string, AudioBuffer | null>();
  const parts: Float32Array[] = [];
  const skipped: string[] = [];
  const gap = new Float32Array(Math.round(rate * 0.15));
  try {
    for (const cut of cuts) {
      if (!decoded.has(cut.assetId)) {
        try { decoded.set(cut.assetId, await ctx.decodeAudioData(await (await resolveBlob(cut.assetId)).arrayBuffer())); }
        catch { decoded.set(cut.assetId, null); }
      }
      const buf = decoded.get(cut.assetId);
      if (!buf) { if (!skipped.includes(cut.assetId)) skipped.push(cut.assetId); continue; }
      const from = Math.min(buf.length, Math.round(cut.srcIn * buf.sampleRate));
      const to = Math.min(buf.length, from + Math.round(cut.duration * buf.sampleRate));
      if (to - from < buf.sampleRate * 0.5) continue;
      const mono = new Float32Array(to - from);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = from; i < to; i++) mono[i - from] += data[i] / buf.numberOfChannels;
      }
      // Short fades so the joins don't click.
      const fade = Math.min(mono.length >> 1, Math.round(buf.sampleRate * 0.01));
      for (let i = 0; i < fade; i++) { const k = i / fade; mono[i] *= k; mono[mono.length - 1 - i] *= k; }
      if (parts.length) parts.push(gap);
      parts.push(mono);
    }
  } finally { ctx.close().catch(() => {}); }
  if (!parts.length) throw new Error('None of the voice samples could be decoded on this device.');
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return { wav: encodeWav(out, rate), seconds: Math.round((out.length / rate) * 10) / 10, skipped };
}
