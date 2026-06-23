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
import type { SceneTimeline, SceneSnapshot, SceneBlock } from '../components/plajahPixels/engine/timeline/sceneTimeline';

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

/** Render the Fabula timeline to an MP4 Blob via the Pixels offline renderer. */
export async function renderFabulaToBlob(opts: RenderFabulaOpts): Promise<Blob | null> {
  const { clips, mediaPool, format, palette, onProgress, signal } = opts;
  const vClips = clips.filter(c => c.trackId === 'v1').sort((a, b) => a.start - b.start);
  if (!vClips.length) { console.warn('[Fabula render] no V1 clips to render'); return null; }

  const blocks: SceneBlock[] = vClips.map(c => {
    const item = mediaPool.find(m => m.id === c.assetId);
    return {
      id: c.id, snapshot: itemToSnapshot(item, c.label || 'clip'),
      start: c.start, duration: c.duration, trimIn: c.srcIn || 0, loop: true,
    };
  });
  const duration = Math.max(0, ...clips.map(c => c.start + c.duration));
  const timeline: SceneTimeline = { blocks, duration };

  const audioBuffer = await decodeAudio(clips, mediaPool);

  const config = {
    colorPalette: palette || [],
    gradeBrightness: 1, gradeContrast: 1, gradeSaturation: 1, gradeGamma: 1,
    enableBassShake: false,
  };

  return renderTimeline({
    timeline, audioBuffer, config,
    width: format.w || 1920, height: format.h || 1080, fps: format.fps || 30,
    onProgress, signal,
  });
}
