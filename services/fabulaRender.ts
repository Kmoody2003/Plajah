// fabulaRender.ts — Phase 2: Fabula's video renderer, powered by the Pixels engine.
//
// Fabula has no video export of its own — its code says rendering "belongs in the
// codebase render pipeline — the timeline data here is its exact input." This is
// that pipeline: it adapts a Fabula timeline (clips + mediaPool) into a Pixels
// SceneTimeline and runs the deterministic offline renderer, so Fabula finally
// writes a real, frame/beat/sample-accurate MP4.
//
// v1 scope: the V1 video track (Pixels-originated edits are single-track) + the
// first audio clip as the soundtrack. Each clip resolves to its mediaPool item — a
// Pixels scene snapshot (`item.pixels`) renders as the true composite; a plain
// media item renders as a video/image layer. Per-clip CSS transforms/blur and the
// V2 overlay track are follow-ups; structure, motion, audio-reactivity + sound are
// all accurate here.

import { renderTimeline } from '../components/plajahPixels/engine/core/offlineRenderer';
import type { SceneSnapshot, RenderLayer } from '../components/plajahPixels/engine/timeline/sceneTimeline';

interface RenderFabulaOpts {
  clips: any[];                 // Fabula clips on the active timeline
  mediaPool: any[];             // prod.mediaPool
  format: { w?: number; h?: number; fps?: number };
  palette?: string[];           // Pixels colorPalette carried through on export (fidelity)
  title?: string;
  onProgress?: (p: number, stage: string) => void;
  signal?: AbortSignal;
}

function itemToSnapshot(item: any, label: string): SceneSnapshot {
  if (item?.pixels) return item.pixels as SceneSnapshot;        // real Pixels scene
  if (item?.url && (item.type === 'video' || item.type === 'image')) {
    return {
      name: item.name || label,
      layers: [{
        id: 'v1', blendMode: 'normal', opacity: 1,
        clip: { type: 'media', mediaUrl: item.url, mediaType: item.type === 'image' ? 'image' : 'video', opacity: 1 },
      }],
    };
  }
  return { name: label || 'clip', layers: [] };                 // unresolved → black
}

async function decodeAudio(clips: any[], mediaPool: any[]): Promise<AudioBuffer | null> {
  const audioClip = clips
    .filter(c => (c.trackId === 'a1' || c.trackId === 'a2') && c.assetId)
    .sort((a, b) => a.start - b.start)[0];
  if (!audioClip) return null;
  const item = mediaPool.find(m => m.id === audioClip.assetId);
  if (!item?.url) return null;
  try {
    const buf = await (await fetch(item.url)).arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ab = await ctx.decodeAudioData(buf);
    ctx.close();
    return ab;
  } catch { return null; }
}

/** Render the Fabula timeline to an MP4 Blob via the Pixels offline renderer. Composites
 *  ALL video tracks (v1, v2, … unlimited; bottom→top) per frame, captions included. */
export async function renderFabulaToBlob(opts: RenderFabulaOpts): Promise<Blob | null> {
  const { clips, mediaPool, format, palette, onProgress, signal } = opts;
  const videoClips = clips.filter(c => /^v\d+$/.test(c.trackId));
  if (!videoClips.length) { console.warn('[Fabula render] no video clips to render'); return null; }

  // Distinct video tracks, bottom (v1) → top, numeric order (v2 before v10).
  const tracks = [...new Set(videoClips.map(c => c.trackId))].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  const itemById = new Map<string, any>(mediaPool.map(m => [m.id, m]));

  const resolveLayers = (t: number): RenderLayer[] => {
    const out: RenderLayer[] = [];
    for (const tid of tracks) {                       // bottom → top
      const clip = videoClips.find(c => c.trackId === tid && t >= c.start && t < c.start + c.duration);
      if (!clip) continue;
      const item = itemById.get(clip.assetId);
      const snap = itemToSnapshot(item, clip.label || 'clip');
      const lt = t - clip.start + (clip.srcIn || 0);
      const fx = clip.fx;
      const clipBlend = fx?.blend && fx.blend !== 'normal' ? fx.blend : null;
      const clipOp = fx?.op ?? 1;
      // Fabula fx → compositor transform: x/y are % (→ UV fraction), sc scale, rot deg→rad.
      const tf = fx ? { x: (fx.x || 0) / 100, y: (fx.y || 0) / 100, scale: fx.sc ?? 1, rot: ((fx.rot || 0) * Math.PI) / 180 } : null;
      const hasTf = tf && (tf.x !== 0 || tf.y !== 0 || tf.scale !== 1 || tf.rot !== 0);
      for (const layer of snap.layers) {
        out.push({
          ...layer,
          id: `${tid}:${layer.id}`,                    // unique per track for the generator pool
          blendMode: clipBlend || layer.blendMode,
          opacity: (layer.opacity ?? 1) * clipOp,
          time: lt,
          transform: hasTf ? tf : undefined,
        });
      }
    }
    return out;
  };

  const duration = Math.max(0, ...clips.map(c => c.start + c.duration));
  const audioBuffer = await decodeAudio(clips, mediaPool);
  const config = {
    colorPalette: palette || [],
    gradeBrightness: 1, gradeContrast: 1, gradeSaturation: 1, gradeGamma: 1,
    enableBassShake: false,
  };

  return renderTimeline({
    resolveLayers, duration, audioBuffer, config,
    width: format.w || 1920, height: format.h || 1080, fps: format.fps || 30,
    onProgress, signal,
  });
}
