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

// Mix ALL audio clips (any a-track) into one master buffer — placed at each clip's start with its
// srcIn offset, duration, per-clip gain (fx.vol) and fade-in/out envelope. (Previously only the first
// audio clip played, anchored at t=0.)
async function mixAudio(clips: any[], mediaPool: any[], durationSec: number): Promise<AudioBuffer | null> {
  const audioClips = clips.filter(c => /^a\d+$/.test(c.trackId) && c.assetId && !c.disabled);
  if (!audioClips.length || durationSec <= 0) return null;
  const SR = 48000;

  // decode each unique asset once
  const cache = new Map<string, AudioBuffer>();
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  for (const c of audioClips) {
    if (cache.has(c.assetId)) continue;
    const item = mediaPool.find(m => m.id === c.assetId);
    if (!item?.url) continue;
    try { cache.set(c.assetId, await decodeCtx.decodeAudioData(await (await fetch(item.url)).arrayBuffer())); }
    catch { /* skip undecodable */ }
  }
  try { decodeCtx.close(); } catch { /* */ }

  const offline = new OfflineAudioContext(2, Math.ceil(durationSec * SR), SR);
  for (const c of audioClips) {
    const ab = cache.get(c.assetId); if (!ab) continue;
    const start = Math.max(0, c.start || 0);
    const offset = Math.max(0, c.srcIn || 0);
    const dur = Math.max(0.01, Math.min(c.duration || (ab.duration - offset), ab.duration - offset));
    const gainVal = c.fx?.vol != null ? c.fx.vol : (c.vol != null ? c.vol : 1);
    const fi = Math.min(c.fx?.fadeIn || 0, dur), fo = Math.min(c.fx?.fadeOut || 0, dur);
    const src = offline.createBufferSource(); src.buffer = ab;
    const g = offline.createGain();
    g.gain.setValueAtTime(fi > 0 ? 0.0001 : gainVal, start);
    if (fi > 0) g.gain.linearRampToValueAtTime(gainVal, start + fi);
    if (fo > 0) { g.gain.setValueAtTime(gainVal, Math.max(start, start + dur - fo)); g.gain.linearRampToValueAtTime(0.0001, start + dur); }
    src.connect(g); g.connect(offline.destination);
    try { src.start(start, offset, dur); } catch { /* out of range */ }
  }
  try { return await offline.startRendering(); } catch { return null; }
}

/** Render the Fabula timeline to an MP4 Blob via the Pixels offline renderer. Composites
 *  ALL video tracks (v1, v2, … unlimited; bottom→top) per frame, captions included. */
export async function renderFabulaToBlob(opts: RenderFabulaOpts): Promise<Blob | null> {
  const { clips, mediaPool, format, palette, onProgress, signal } = opts;
  const videoClips = clips.filter(c => /^v\d+$/.test(c.trackId) && !c.disabled);
  const subtitleClips = clips.filter(c => c.kind === 'subtitle' && c.text);
  const titleClips = clips.filter(c => c.kind === 'title' && c.text);
  if (!videoClips.length && !subtitleClips.length && !titleClips.length) { console.warn('[Fabula render] nothing visual to render'); return null; }

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
    // Subtitle + title clips burn in on top, screen-blended.
    for (const c of subtitleClips) {
      if (!(t >= c.start && t < c.start + c.duration)) continue;
      out.push({ id: `sub:${c.id}`, clip: { type: 'text', text: c.text }, blendMode: 'screen', opacity: 1, time: 0 });
    }
    for (const c of titleClips) {
      if (!(t >= c.start && t < c.start + c.duration)) continue;
      out.push({ id: `title:${c.id}`, clip: { type: 'title', text: c.text, subtitle: c.subtitle, titleStyle: c.titleStyle }, blendMode: 'screen', opacity: 1, time: 0 });
    }
    return out;
  };

  const duration = Math.max(0, ...clips.map(c => c.start + c.duration));
  const audioBuffer = await mixAudio(clips, mediaPool, duration);
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
