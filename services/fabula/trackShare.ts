// trackShare — reuse a VectorTrack from one clip on another (the pragmatic form of "shared
// track assets"): the track is COPIED and re-based so that its frame indices line up with the
// destination clip's local timeline. Both clips must show the same footage for the copy to
// mean anything; the caller checks that (same assetId) and the time relationship.
//
// frameOffset = destination local frame that corresponds to source local frame 0
//             = round((srcClip.start - dstClip.start + (srcClip.srcIn - dstClip.srcIn)) * fps)
// (identical source time → identical frame content, regardless of where each clip sits.)
import type { VectorTrackAsset } from './vectorTrack';
import type { PlanarTrackSequence } from './planarSequence';

export interface ClipTimeRef { start: number; srcIn?: number; duration: number; assetId?: string; }

/** Destination-local frame index of the source clip's local frame 0. */
export function trackFrameOffset(src: ClipTimeRef, dst: ClipTimeRef, fps: number): number {
  return Math.round(((src.srcIn || 0) - (dst.srcIn || 0)) * fps);
}

/** Can `src`'s track be reused on `dst`? Same footage and overlapping source time. */
export function canShareTrack(src: ClipTimeRef, dst: ClipTimeRef, fps: number, trackFrames: { start: number; end: number }): { ok: boolean; reason?: string } {
  if (!src.assetId || src.assetId !== dst.assetId) return { ok: false, reason: 'different footage' };
  const off = trackFrameOffset(src, dst, fps);
  const dstFrames = Math.round(dst.duration * fps);
  const lo = trackFrames.start + off, hi = trackFrames.end + off;
  if (hi < 0 || lo > dstFrames) return { ok: false, reason: 'tracked range does not overlap this clip' };
  return { ok: true };
}

export function rebaseVectorTrack(track: VectorTrackAsset, frameOffset: number, id = `${track.id}-shared`): VectorTrackAsset {
  return { ...track, id, samples: track.samples.map(s => ({ ...s, frame: s.frame + frameOffset })).sort((a, b) => a.frame - b.frame) };
}

export function rebasePlanarTrack(seq: PlanarTrackSequence, frameOffset: number, id = `${seq.id}-shared`): PlanarTrackSequence {
  return { ...seq, id, referenceFrame: seq.referenceFrame + frameOffset, samples: seq.samples.map(s => ({ ...s, frame: s.frame + frameOffset })).sort((a, b) => a.frame - b.frame) };
}
