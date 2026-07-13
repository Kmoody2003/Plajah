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
import { EQ_BANDS } from './fabula/audioGraph';
import { probeVideoFrameRate, sourceSafeRenderFrameRate } from './videoFrameRate';

interface RenderFabulaOpts {
  clips: any[];                 // Fabula clips on the active timeline
  mediaPool: any[];             // prod.mediaPool
  format: { w?: number; h?: number; fps?: number };
  palette?: string[];           // Pixels colorPalette carried through on export (fidelity)
  title?: string;
  trackSettings?: Record<string, any>; // per-track mixer: vol/pan/mute/eq/comp (render = live parity)
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

// Append an EQ + compressor stage (matching the live audioGraph chain) after `input`.
// Zero-gain EQ bands and comp.on=false are skipped entirely — bit-transparent bypass.
function applyEqComp(ctx: BaseAudioContext, input: AudioNode, eq?: number[], comp?: any): AudioNode {
  let node = input;
  if (eq && eq.some((v) => v)) {
    EQ_BANDS.forEach((b, i) => {
      const f = ctx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.f; f.Q.value = b.q || 1;
      f.gain.value = Math.max(-24, Math.min(24, eq[i] || 0));
      node.connect(f); node = f;
    });
  }
  if (comp && comp.on) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = Math.max(-100, Math.min(0, comp.threshold ?? -24));
    c.ratio.value = Math.max(1, Math.min(20, comp.ratio ?? 3));
    c.attack.value = Math.max(0, Math.min(1, comp.attack ?? 0.003));
    c.release.value = Math.max(0, Math.min(1, comp.release ?? 0.25));
    c.knee.value = Math.max(0, Math.min(40, comp.knee ?? 30));
    const mk = ctx.createGain(); mk.gain.value = Math.pow(10, (comp.makeup || 0) / 20);
    node.connect(c); c.connect(mk); node = mk;
  }
  return node;
}

// Mix ALL audio clips (any a-track) into one master buffer with FULL DSP PARITY to live
// playback: per-clip gain + fades + clip EQ/comp, summed into per-track buses that apply the
// track's EQ/comp, stereo pan, fader and mute — the same chain the editor's mixer runs, so
// what you hear in the edit is what the MP4 contains.
async function mixAudio(clips: any[], mediaPool: any[], durationSec: number, trackSettings?: Record<string, any>): Promise<AudioBuffer | null> {
  const aClips = clips.filter(c => /^a\d+$/.test(c.trackId) && c.assetId && !c.disabled);
  // Video clips with EMBEDDED audio (older clips with no linked A-track sibling) used to render
  // SILENT — the mixer only read a-tracks. Their sound now routes through the A1 track bus, so
  // the A1 fader/EQ/comp/pan govern it exactly like the rest of the mix. Skipped when the clip
  // has a live linked-audio sibling (`av` pairs) — that sibling already carries the sound.
  const linkedIds = new Set(aClips.map(c => c.linkId).filter(Boolean));
  const itemOf = (id: string) => mediaPool.find(m => m.id === id);
  const vAudio = clips
    .filter(c => /^v\d+$/.test(c.trackId) && c.assetId && !c.disabled && !c.av
      && !(c.linkId && linkedIds.has(c.linkId)) && itemOf(c.assetId)?.type === 'video')
    .map(c => ({ ...c, trackId: 'a1' }));
  const audioClips = [...aClips, ...vAudio];
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

  // One bus per audio track: input → track EQ/comp → pan → fader(mute) → destination.
  const buses = new Map<string, GainNode>();
  const trackBus = (tid: string): GainNode => {
    const hit = buses.get(tid); if (hit) return hit;
    const ts = (trackSettings || {})[tid] || {};
    const input = offline.createGain();
    let node: AudioNode = applyEqComp(offline, input, ts.eq, ts.comp);
    if (typeof (offline as any).createStereoPanner === 'function' && (ts.pan || 0) !== 0) {
      const p = (offline as any).createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, ts.pan || 0));
      node.connect(p); node = p;
    }
    const fader = offline.createGain();
    fader.gain.value = ts.mute ? 0 : Math.max(0, ts.vol == null ? 1 : ts.vol);
    node.connect(fader); fader.connect(offline.destination);
    buses.set(tid, input);
    return input;
  };

  for (const c of audioClips) {
    const ab = cache.get(c.assetId); if (!ab) continue;
    const start = Math.max(0, c.start || 0);
    const offset = Math.max(0, c.srcIn || 0);
    const dur = Math.max(0.01, Math.min(c.duration || (ab.duration - offset), ab.duration - offset));
    // clip gain: the inspector's clip-audio volume (c.audio.vol), falling back to legacy fx.vol
    const gainVal = c.audio?.vol != null ? c.audio.vol : (c.fx?.vol != null ? c.fx.vol : (c.vol != null ? c.vol : 1));
    const fi = Math.min(c.fx?.fadeIn || 0, dur), fo = Math.min(c.fx?.fadeOut || 0, dur);
    const src = offline.createBufferSource(); src.buffer = ab;
    const g = offline.createGain();
    g.gain.setValueAtTime(fi > 0 ? 0.0001 : gainVal, start);
    if (fi > 0) g.gain.linearRampToValueAtTime(gainVal, start + fi);
    if (fo > 0) { g.gain.setValueAtTime(gainVal, Math.max(start, start + dur - fo)); g.gain.linearRampToValueAtTime(0.0001, start + dur); }
    src.connect(g);
    const shaped = applyEqComp(offline, g, c.audio?.eq, c.audio?.comp); // clip EQ/comp
    shaped.connect(trackBus(c.trackId));
    try { src.start(start, offset, dur); } catch { /* out of range */ }
  }
  try { return await offline.startRendering(); } catch { return null; }
}

/** Render the Fabula timeline to an MP4 Blob via the Pixels offline renderer. Composites
 *  ALL video tracks (v1, v2, … unlimited; bottom→top) per frame, captions included. */
export async function renderFabulaToBlob(opts: RenderFabulaOpts): Promise<Blob | null> {
  const { clips, mediaPool, format, palette, trackSettings, onProgress, signal } = opts;
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
      // Per-clip GRADE rides into the export (monitor parity): exposure/contrast/saturation/
      // hue/warmth/soften were preview-only before — the MP4 ignored them entirely.
      const grade = fx ? { bri: fx.bri ?? 1, con: fx.con ?? 1, sat: fx.sat ?? 1, hue: fx.hue || 0, warm: fx.warm || 0, blur: fx.blur || 0 } : null;
      const hasGrade = grade && (grade.bri !== 1 || grade.con !== 1 || grade.sat !== 1 || grade.hue !== 0 || grade.warm !== 0 || grade.blur !== 0);
      // WHEEL grade (lift/gamma/gain + temp/tint from the color page) → the compositor's
      // per-input GPU grade stage. Separate from the ctx.filter primaries above — no overlap,
      // no double application: filters bake bri/con/sat/hue/warm; GL applies the wheels.
      const w = fx?.wheel;
      const glGrade = w && (
        (w.lift || []).some((v: number) => v !== 0) || (w.gamma || []).some((v: number) => v !== 1)
        || (w.gain || []).some((v: number) => v !== 1) || w.temp || w.tint
      ) ? { lift: w.lift, gamma: w.gamma, gain: w.gain, temp: w.temp || 0, tint: w.tint || 0 } : null;
      for (const layer of snap.layers) {
        out.push({
          ...layer,
          id: `${tid}:${layer.id}`,                    // unique per track for the generator pool
          blendMode: clipBlend || layer.blendMode,
          opacity: (layer.opacity ?? 1) * clipOp,
          time: lt,
          transform: hasTf ? tf : undefined,
          ...(hasGrade ? { grade } : {}),
          ...(glGrade ? { glGrade } : {}),
        } as any);
      }
    }
    // Subtitle + title clips burn in on top, screen-blended.
    for (const c of subtitleClips) {
      if (!(t >= c.start && t < c.start + c.duration)) continue;
      out.push({ id: `sub:${c.id}`, clip: { type: 'text', text: c.text }, blendMode: 'screen', opacity: 1, time: 0 });
    }
    for (const c of titleClips) {
      if (!(t >= c.start && t < c.start + c.duration)) continue;
      // titler overrides (font/color/size/position) ride along so the export matches the monitor
      out.push({ id: `title:${c.id}`, clip: { type: 'title', text: c.text, subtitle: c.subtitle, titleStyle: c.titleStyle, tFont: c.tFont, tColor: c.tColor, tSubColor: c.tSubColor, tSize: c.tSize, tx: c.tx, ty: c.ty } as any, blendMode: 'screen', opacity: 1, time: 0 });
    }
    return out;
  };

  const duration = Math.max(0, ...clips.map(c => c.start + c.duration));
  const audioBuffer = await mixAudio(clips, mediaPool, duration, trackSettings);
  // A grade can make an offline render slower, but it must never make the FILE
  // lower-FPS. Preserve the fastest active source cadence (up to 60fps). Imported
  // assets cache this value; older projects are measured once here at delivery.
  const activeAssetIds = new Set(videoClips.map(c => c.assetId).filter(Boolean));
  const sources = new Map<string, any>();
  for (const item of mediaPool.filter(asset => activeAssetIds.has(asset.id))) {
    if (item.type === 'video' && item.url) sources.set(item.url, item);
    for (const layer of item.pixels?.layers || []) {
      const clip = layer?.clip;
      if (clip?.type === 'media' && clip.mediaType !== 'image' && clip.mediaUrl) {
        sources.set(clip.mediaUrl, item);
      }
    }
  }
  onProgress?.(0, 'Checking source frame rates');
  const sourceRates = await Promise.all([...sources].map(async ([url, item]) => {
    if (item.url === url && item.fps) return item.fps as number;
    const measured = await probeVideoFrameRate(url, signal);
    if (measured && item.url === url) item.fps = measured; // cache ordinary media assets
    return measured;
  }));
  if (signal?.aborted) return null;
  const requestedFps = format.fps || 30;
  const renderFps = sourceSafeRenderFrameRate(requestedFps, sourceRates);
  if (renderFps > requestedFps + 0.001) onProgress?.(0, `Preserving source cadence at ${renderFps} fps`);
  const config = {
    colorPalette: palette || [],
    gradeBrightness: 1, gradeContrast: 1, gradeSaturation: 1, gradeGamma: 1,
    enableBassShake: false,
  };

  return renderTimeline({
    resolveLayers, duration, audioBuffer, config,
    width: format.w || 1920, height: format.h || 1080, fps: renderFps,
    onProgress, signal,
  });
}
