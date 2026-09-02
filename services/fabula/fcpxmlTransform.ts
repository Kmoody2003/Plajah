// fcpxmlTransform — VectorTrack motion → FCPXML <adjust-transform> keyframes.
//
// Resolve / Final Cut cannot import a corner pin, but they import keyframed position / scale /
// rotation. For a PLANAR-stabilised clip we decompose the per-frame inverse plane into the
// affine part; for a POINT-stabilised clip the translation; for a PINNED overlay the placement
// matrix (unit square → tracked surface). Perspective is dropped (documented in the export).
//
// FCPXML conventions: position in project pixels with the origin at frame centre and y UP;
// scale as a factor; rotation in degrees, counter-clockwise positive. Our tracks are
// normalized top-left y-DOWN, so y and rotation flip sign.
import { decomposePlanar, invertHomography, type Mat3 } from './planarTrack';
import { samplePlanarAt, cornerPinAt, type PlanarTrackSequence } from './planarSequence';
import { sampleTrackAt, type VectorTrackAsset } from './vectorTrack';

export interface TransformKey { t: number; x: number; y: number; scale: number; rotation: number; }
export interface ClipMotionSource {
  trackMode?: string;
  vectorTrack?: VectorTrackAsset | null;
  planarTrack?: PlanarTrackSequence | null;
  /** For pinned overlays: the SOURCE clip's planar track and the time offset between the two clips. */
  pinTo?: { seq: PlanarTrackSequence; startOffset: number } | null;
}

/** Affine transform keys for every frame of `[0, duration)` at `fps`, or null when the clip has no motion. */
export function motionKeys(src: ClipMotionSource, duration: number, fps: number, width: number, height: number): TransformKey[] | null {
  const frames = Math.max(1, Math.round(duration * fps));
  const keys: TransformKey[] = [];
  const affine = (m: Mat3): { x: number; y: number; scale: number; rotation: number } => {
    const d = decomposePlanar(m);
    // Translation of the frame CENTRE under m (not m's raw tx, which is the origin's move).
    const cx = (m[0] * .5 + m[1] * .5 + m[2]) / (m[6] * .5 + m[7] * .5 + m[8]) - .5;
    const cy = (m[3] * .5 + m[4] * .5 + m[5]) / (m[6] * .5 + m[7] * .5 + m[8]) - .5;
    return { x: cx * width, y: -cy * height, scale: (Math.abs(d.scaleX) + Math.abs(d.scaleY)) / 2, rotation: -(d.rotation * 180) / Math.PI };
  };
  if (src.trackMode === 'planar' && src.planarTrack?.samples?.length) {
    for (let f = 0; f < frames; f++) {
      const s = samplePlanarAt(src.planarTrack, f); if (!s) return null;
      const inv = invertHomography(s.matrix); if (!inv) continue; // placement = inverse of the sampling matrix
      keys.push({ t: f / fps, ...affine(inv) });
    }
  } else if (src.trackMode === 'stabilize' && src.vectorTrack?.samples?.length) {
    const ref = sampleTrackAt(src.vectorTrack, src.vectorTrack.samples[0].frame)!;
    for (let f = 0; f < frames; f++) {
      const s = sampleTrackAt(src.vectorTrack, f); if (!s) return null;
      keys.push({ t: f / fps, x: (ref.x - s.x) * width, y: -(ref.y - s.y) * height, scale: 1, rotation: 0 });
    }
  } else if (src.pinTo?.seq) {
    for (let f = 0; f < frames; f++) {
      const pin = cornerPinAt(src.pinTo.seq, Math.max(0, Math.round((f / fps + src.pinTo.startOffset) * (src.pinTo.seq.fps || fps)))); if (!pin) return null;
      keys.push({ t: f / fps, ...affine(pin.place) });
    }
  } else return null;
  return keys.length ? keys : null;
}

/** Drop keys that a linear interpolation of their neighbours reproduces within tolerance. */
export function thinKeys(keys: TransformKey[], tol = { pos: .25, scale: .002, rot: .05 }): TransformKey[] {
  if (keys.length <= 2) return keys;
  const out: TransformKey[] = [keys[0]];
  for (let i = 1; i < keys.length - 1; i++) {
    const a = out[out.length - 1], b = keys[i], c = keys[i + 1];
    const u = (b.t - a.t) / Math.max(1e-6, c.t - a.t);
    const lerp = (p: number, q: number) => p + (q - p) * u;
    const fits = Math.abs(lerp(a.x, c.x) - b.x) <= tol.pos && Math.abs(lerp(a.y, c.y) - b.y) <= tol.pos && Math.abs(lerp(a.scale, c.scale) - b.scale) <= tol.scale && Math.abs(lerp(a.rotation, c.rotation) - b.rotation) <= tol.rot;
    if (!fits) out.push(b);
  }
  out.push(keys[keys.length - 1]);
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** `<adjust-transform>` XML (empty string when there is nothing to animate). `toTime` renders a
 *  clip-local second as an FCPXML rational time string on the frame grid. */
export function adjustTransformXml(keys: TransformKey[] | null, toTime: (sec: number) => string): string {
  if (!keys || !keys.length) return '';
  const thinned = thinKeys(keys);
  const one = (name: string, fmt: (k: TransformKey) => string) =>
    `<param name="${name}"><keyframeAnimation>${thinned.map(k => `<keyframe time="${esc(toTime(k.t))}" value="${fmt(k)}"/>`).join('')}</keyframeAnimation></param>`;
  const anim = thinned.length > 1;
  const f = (v: number) => (Math.abs(v) < 1e-6 ? '0' : v.toFixed(3).replace(/\.?0+$/, ''));
  if (!anim) { const k = thinned[0]; return `<adjust-transform position="${f(k.x)} ${f(k.y)}" scale="${f(k.scale)} ${f(k.scale)}" rotation="${f(k.rotation)}"/>`; }
  return `<adjust-transform>${one('position', k => `${f(k.x)} ${f(k.y)}`)}${one('scale', k => `${f(k.scale)} ${f(k.scale)}`)}${one('rotation', k => f(k.rotation))}</adjust-transform>`;
}
