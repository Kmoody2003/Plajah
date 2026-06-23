// sceneTimeline.ts — the minimal single-track scene-block model for Timeline/NLE
// mode (chosen scope: one row of scene blocks, one scene at a time). A "scene" is a
// launcher column captured as a snapshot of its layers, so a block is fully
// self-describing and renderable offline without the live launcher.

export interface RenderClip {
  type: 'generator' | 'media' | 'color' | 'shader' | 'milkdrop' | 'text' | 'empty';
  sceneMode?: string;                 // generator / studio mode (UPPERCASE)
  mediaUrl?: string;
  mediaType?: 'video' | 'image';
  fillColor?: string;                 // color fill, or text color for type:'text'
  shaderSrc?: string;
  text?: string;                      // type:'text' — caption / title string (the "text generator")
  params?: number[];
  opacity?: number;
}

export interface RenderLayer {
  id: string;
  clip: RenderClip;
  blendMode: string;
  opacity: number;
  /** Per-layer source time in seconds (for multi-track: each layer/track has its
   *  own clip clock). Used to drive generators + media seek. */
  time?: number;
  /** Per-layer transform (translate UV fraction, scale, rotation radians) — e.g. a
   *  Fabula clip's position/scale/rotation fx applied to its whole scene. */
  transform?: { x: number; y: number; scale: number; rot: number };
}

/** A captured launcher column: layers bottom→top, exactly what the compositor stacks. */
export interface SceneSnapshot {
  name: string;
  layers: RenderLayer[];
}

export interface SceneBlock {
  id: string;
  snapshot: SceneSnapshot;
  start: number;     // seconds on the timeline
  duration: number;  // seconds on the timeline
  trimIn: number;    // seconds into the scene's own clock to begin at
  loop: boolean;     // (media) loop within the block vs. freeze on last frame
}

export interface SceneTimeline {
  blocks: SceneBlock[];
  duration: number;  // total timeline length (usually the song length)
}

/** The block covering time t (last block whose [start, start+duration) contains t). */
export function activeBlockAt(tl: SceneTimeline, t: number): SceneBlock | null {
  let found: SceneBlock | null = null;
  for (const b of tl.blocks) {
    if (t >= b.start && t < b.start + b.duration) found = b; // later blocks win on overlap
  }
  return found;
}

/** The scene's own clock at timeline time t (accounts for trim + the block start). */
export function localTime(b: SceneBlock, t: number): number {
  return Math.max(0, t - b.start + b.trimIn);
}

/**
 * Capture a launcher column as a renderable snapshot. `layers` is the launcher's
 * LauncherLayer[] (each has clips[]); `col` is the scene column index. Bypassed/
 * muted/empty layers are dropped. Kept generic (any[]) to avoid a hard import cycle
 * with ClipLauncher — the shape used is { id, blendMode, opacity, bypassed, muted,
 * clips: [{ type, sceneMode, mediaUrl, mediaType, fillColor, shaderSrc, params, opacity }] }.
 */
export function snapshotFromColumn(layers: any[], col: number, name: string): SceneSnapshot {
  const out: RenderLayer[] = [];
  for (const layer of layers) {
    if (!layer || layer.bypassed || layer.muted) continue;
    const clip = layer.clips?.[col];
    if (!clip || clip.type === 'empty') continue;
    out.push({
      id: layer.id,
      blendMode: layer.blendMode || 'normal',
      opacity: layer.opacity ?? 1,
      clip: {
        type: clip.type,
        sceneMode: clip.sceneMode,
        mediaUrl: clip.mediaUrl,
        mediaType: clip.mediaType,
        fillColor: clip.fillColor,
        shaderSrc: clip.shaderSrc,
        params: clip.params,
        opacity: clip.opacity ?? 1,
      },
    });
  }
  return { name, layers: out };
}

const uid = () => `blk_${Math.random().toString(36).slice(2, 9)}`;

export function makeBlock(snapshot: SceneSnapshot, start: number, duration: number): SceneBlock {
  return { id: uid(), snapshot, start, duration, trimIn: 0, loop: true };
}
