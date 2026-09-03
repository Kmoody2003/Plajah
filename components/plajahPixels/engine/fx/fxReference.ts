// fxReference — a rendered fingerprint for every effect in the registry.
//
// Four real bugs this suite has shipped and then caught by hand (glofi rendering nothing, echo
// rendering nothing on opaque clips, shape-wipe playing backwards, channel-surf never settling)
// all COMPILED, rendered a non-black frame and animated. Unit tests cannot see them, because what
// was wrong was the picture. This renders every effect under fixed conditions and hashes the
// pixels, so an edit that changes an effect nobody meant to touch shows up as a changed hash.
//
// It needs a GPU, so it runs in the browser rather than in `npm test`:
//
//   const r = await import('/components/plajahPixels/engine/fx/fxReference.ts');
//   const hashes = await r.sweepReferenceHashes();
//   // compare against docs/fabula/fx-reference-hashes.json
//   r.compareHashes(baseline, hashes)
//
// The hashes are only comparable on the SAME machine and browser: a different driver rounds
// arithmetic differently. This catches "did my edit change something else", not "does this render
// identically everywhere".
import { FX_EFFECTS, type FxEffect } from './effects';
import { FxRenderer } from './fxRenderer';
import { AudioTexture } from '../core/audioTexture';
import { createGL, makeSourceTexture, uploadElement, makeTarget } from '../core/glUtil';

export interface SweepOptions {
  width?: number;
  height?: number;
  /** Clip times rendered per effect. Several, so a static frame cannot hide animation bugs. */
  times?: number[];
  /** Frames rendered before the hashed one, so temporal effects reach a settled state. */
  warmFrames?: number;
  /** Low bits dropped before hashing, to tolerate a driver's last-place rounding. */
  tolerance?: number;
}

const DEFAULTS: Required<SweepOptions> = { width: 192, height: 108, times: [0, 0.37, 1.13], warmFrames: 3, tolerance: 2 };

/**
 * A deterministic source frame with flat areas, hard edges, a gradient and saturated colour, so
 * an effect has something to bite on whatever it does.
 *
 * `phase` MOVES the content. Feeding a temporal effect the same frame twice makes it correctly
 * output a constant, which reads as a dead shader — that false positive flagged all eleven
 * temporal effects at once before the source was made to move.
 */
export function referenceSource(width: number, height: number, phase = 0, reuse?: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = reuse && reuse.width === width && reuse.height === height ? reuse : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const shift = (phase % 16) / 16;
  const grad = g.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#10243c');
  grad.addColorStop(0.5, '#8f5a20');
  grad.addColorStop(1, '#d8d2c4');
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#101014';
    g.fillRect(Math.round((i + shift) * width / 8) % width, Math.round(height * 0.42), Math.round(width / 16), Math.round(height * 0.3));
  }
  g.fillStyle = '#c81e28';
  g.beginPath();
  g.arc(width * (0.62 + 0.18 * shift), height * (0.28 + 0.1 * shift), Math.min(width, height) * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1ec8a0';
  g.fillRect(Math.round(width * 0.06), Math.round(height * 0.06), Math.round(width * 0.16), Math.round(height * 0.16));
  return canvas;
}

/** FNV-1a over the frame, with the low bits masked off so driver rounding does not trip it. */
export function hashPixels(pixels: Uint8Array, tolerance: number): string {
  const mask = 0xff & ~((1 << tolerance) - 1);
  let h = 0x811c9dc5;
  for (let i = 0; i < pixels.length; i++) {
    h ^= pixels[i] & mask;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Render every effect under fixed conditions and fingerprint the result. */
export async function sweepReferenceHashes(options: SweepOptions = {}): Promise<Record<string, string>> {
  const opt = { ...DEFAULTS, ...options };
  const canvas = document.createElement('canvas');
  canvas.width = opt.width;
  canvas.height = opt.height;
  const gl = createGL(canvas);
  if (!gl) throw new Error('No WebGL2 context for the reference sweep.');

  const source = makeSourceTexture(gl);
  const sourceCanvas = referenceSource(opt.width, opt.height, 0);
  const audio = new AudioTexture(gl);
  const readback = makeTarget(gl, opt.width, opt.height);
  const pixels = new Uint8Array(opt.width * opt.height * 4);
  const out: Record<string, string> = {};

  for (const effect of FX_EFFECTS) {
    try {
      out[effect.id] = hashEffect(gl, effect, source, sourceCanvas, audio, readback, pixels, opt);
    } catch (err) {
      out[effect.id] = `error:${(err as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}

function hashEffect(
  gl: WebGL2RenderingContext,
  effect: FxEffect,
  source: WebGLTexture,
  sourceCanvas: HTMLCanvasElement,
  audio: AudioTexture,
  readback: { fbo: WebGLFramebuffer },
  pixels: Uint8Array,
  opt: Required<SweepOptions>,
): string {
  // A fresh renderer per effect, so one effect's frame history can never leak into the next.
  const renderer = new FxRenderer(gl);
  const params = effect.params.map((p) => p.default);
  const parts: string[] = [];

  for (let ti = 0; ti < opt.times.length; ti++) {
    const time = opt.times[ti];
    let result: WebGLTexture = source;
    for (let w = 0; w <= opt.warmFrames; w++) {
      const t = time + w * 0.0166;
      // Re-upload a MOVED source each frame so temporal effects have motion to work on.
      referenceSource(opt.width, opt.height, ti * (opt.warmFrames + 1) + w, sourceCanvas);
      uploadElement(gl, source, sourceCanvas);
      result = renderer.render(`ref:${effect.id}`, effect.id, params, source, opt.width, opt.height, { time: t, audio });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, readback.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, result, 0);
    gl.readPixels(0, 0, opt.width, opt.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    parts.push(hashPixels(pixels, opt.tolerance));
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return parts.join('-');
}

export interface HashDiff {
  changed: string[];
  added: string[];
  removed: string[];
  /** Effects whose every sampled time hashes the same — usually a passthrough or a dead shader. */
  errored: string[];
}

/** What moved between two sweeps. Pure, so it is unit-testable without a GPU. */
export function compareHashes(baseline: Record<string, string>, next: Record<string, string>): HashDiff {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const errored: string[] = [];
  for (const [id, hash] of Object.entries(next)) {
    if (String(hash).startsWith('error:')) errored.push(id);
    if (!(id in baseline)) { added.push(id); continue; }
    if (baseline[id] !== hash) changed.push(id);
  }
  for (const id of Object.keys(baseline)) if (!(id in next)) removed.push(id);
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort(), errored: errored.sort() };
}

/** Effects whose sampled times all hash identically. */
export function staticEffects(hashes: Record<string, string>): string[] {
  return Object.entries(hashes)
    .filter(([, h]) => {
      const parts = String(h).split('-');
      return parts.length > 1 && new Set(parts).size === 1;
    })
    .map(([id]) => id)
    .sort();
}

/**
 * Effects that READ THE CLOCK yet render the same picture at every sampled time. Being static is
 * not itself a fault — a colour grade or a key should not move — so the signal is the mismatch
 * between an effect reaching for uTime and nothing changing. That is the shape of the bugs this
 * suite has actually shipped: channel-surf never settling, echo compositing nothing.
 */
export function suspiciousStatic(hashes: Record<string, string>): string[] {
  const stuck = new Set(staticEffects(hashes));
  return FX_EFFECTS
    .filter((e) => stuck.has(e.id))
    .filter((e) => {
      const bodies = e.passes?.length ? e.passes.map((p) => p.glsl) : [e.glsl || ''];
      return e.temporal || bodies.some((b) => /uTime|uFrame|uDeltaT/.test(b));
    })
    .map((e) => e.id)
    .sort();
}
