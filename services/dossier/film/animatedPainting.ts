/**
 * 'animatedPainting': a council-film shot in which a REAL, public-domain painting is shown at its real edges with its credit
 * slate, then given motion by code. The brushwork is never regenerated: every pixel on screen is a pixel of the painting,
 * moved, lit or veiled, and nothing is drawn onto a figure.
 *
 * OWNER-APPROVED EXCEPTION. The Motion Council's rules (docs/dossier/council/films-motion/synthesis.json) say archive plates
 * are never graded and the Council cut depth parallax, grain and generated smoke. This shot type is the one explicit exception,
 * for PAINTED battles only, never for photographs. The compile gates below enforce what keeps it honest:
 *   - the shot is labelled ANIMATED PAINTING for its whole length, with the one-line note, painter, date and credit slate;
 *   - it must follow its own content-note card (Silence Hold) in the same room;
 *   - it starts and ends on the whole painting at its real edges, and the effects ramp from zero and back to zero, so the
 *     first and last frames are the unaltered painting;
 *   - no lower third, graphic or other overlay on the painting; the medium is declared 'painting', never 'photograph'.
 *
 * What moves (all of it a pure function of time, so the player and the MP4 match):
 *   a. a slow, eased camera between focal groups (the camera arrives before the word that names the thing);
 *   b. three planes of soft procedural smoke in the painting's own sampled palette, each hidden behind everything nearer than
 *      its plane (the plane test uses a Depth Anything V2 map), kept off hand-marked faces;
 *   c. flags rippling by mesh warp, only inside hand-marked flag regions, pinned along their staff;
 *   d. parallax on the far plane only (sky, smoke, burning town): figure pixels are never displaced (verified by lockCheck);
 *   e. flicker on the burning town, and a drifting cloud shadow;
 *   f. foley hooks (distant musket thuds, wind), synthesised, scheduled here, rendered by scripts/dossier/renderFilm.ts.
 * No wounds are drawn and no figure is animated.
 *
 * Per-painting authoring: see data/dossier/foundingBattleLayers.ts and scripts/dossier/buildPaintingLayers.ts.
 */
import type { Box, CouncilFilm, FoleyEvent, Slate } from './councilTypes';
import { clamp, hash, noise1, span } from './motion';

// ── Spec ──────────────────────────────────────────────────────────────────────────

export type PaintingCamAt = number | { fromEnd: number } | { beat: string; word?: string; /** seconds, negative = before the word */ offset?: number };

/**
 * A camera key: centre (0..1 of the painting) and zoom (1 = the whole painting at its real edges). Keys are joined by Hermite
 * curves: a key the camera stops on (the default: arrives, lingers) has zero velocity; `through: true` keeps the camera moving
 * smoothly past the key (Catmull-Rom tangent), for waypoints that only shape the path.
 */
export interface PaintingCamKey { at: PaintingCamAt; x: number; y: number; zoom: number; through?: boolean }

/** The runtime half of a hand-marked flag (the polygon only matters when the mask is baked). */
export interface PaintingFlag {
  id: string;
  staff: [[number, number], [number, number]];
  cloth: [number, number];
  span: number; amp: number; cycles: number; hz: number; phase: number;
}

export interface AnimatedPaintingSpec {
  /** Only a painting may be animated. */
  medium: 'painting';
  /** Asset ids (FilmAsset) of the painting and its three baked layers (scripts/dossier/buildPaintingLayers.ts). */
  asset: string; depth: string; masks: string; fx: string;
  /** Pixel size of the painting file (its aspect decides the window). */
  size: { w: number; h: number };
  /** Must read exactly ANIMATED PAINTING. */
  label: string;
  /** The one-line note shown beside the painting for its whole length. */
  note: string;
  /** Painter, date, credit and licence: the engine's provenance slate. */
  slate: Slate;
  cam: PaintingCamKey[];
  flags: PaintingFlag[];
  /** Strength of each effect, 0..1 (default 1). */
  strength?: { smoke?: number; flags?: number; parallax?: number; fire?: number; cloud?: number };
  /** Synthesised foley: how many distant muskets, and a wind bed. */
  foley?: { muskets?: number; wind?: boolean };
  /** Seconds the camera holds after the last spoken word before the shot ends (default 3.2). */
  tail?: number;
  /** Seconds the effects take to come in after the still opening, and to go out before the closing still. */
  rampIn?: number; rampOut?: number;
  margin?: { year?: string; place?: string };
}

export const ANIMATED_LABEL = 'ANIMATED PAINTING';
export const MAX_ZOOM = 2.6;
/** The painting's window on the 1920x1080 frame (design units). Aspect = the painting's. */
export const PAINTING_WIN_H = 696;
export const PAINTING_MARGIN_X = 1216;
export const PAINTING_MARGIN_W = 608;
/** Parallax: far-plane offset in painting-uv per unit of camera offset from the centre. 0.022 * 0.27 = about 11 source px at most. */
const PAR_K = 0.022;

export interface ResolvedCamKey { t: number; x: number; y: number; zoom: number; through: boolean }
export interface LaidPainting { win: Box; slateBox: Box; cam: ResolvedCamKey[]; rampIn: number; rampOut: number }

export function layoutPainting(spec: AnimatedPaintingSpec): { win: Box; slateBox: Box } {
  const h = PAINTING_WIN_H, w = Math.round(h * spec.size.w / spec.size.h);
  const win: Box = { x: 96, y: 36, w, h };
  return { win, slateBox: { x: 96, y: win.y + h + 16, w: PAINTING_MARGIN_X - 96 - 40, h: 84 } };
}

/** Resolve beat/word anchors to seconds from the shot's start. `beats` carry film-clock word times; `shotStart` is the shot's start. */
export function resolveCam(keys: PaintingCamKey[], beats: Array<{ id: string; a: number; words: Array<{ text: string; a: number }> }>, shotStart: number, dur: number, issues: string[], id: string): ResolvedCamKey[] {
  const strip = (w: string) => w.replace(/^[“"'(]+|[.,;:!?”"')—]+$/g, '').toLowerCase();
  const out = keys.map(k => {
    let t: number;
    if (typeof k.at === 'number') t = k.at;
    else if ('fromEnd' in k.at) t = dur - k.at.fromEnd;
    else {
      const b = beats.find(x => x.id === (k.at as { beat: string }).beat);
      if (!b) { issues.push(`${id}: camera key anchors to unknown beat "${(k.at as { beat: string }).beat}"`); t = 0; }
      else {
        const word = (k.at as { word?: string }).word;
        const w = word ? b.words.find(x => strip(x.text) === word.toLowerCase()) : undefined;
        if (word && !w) issues.push(`${id}: camera key anchors to word "${word}", which is not in beat ${b.id}`);
        t = (w ? w.a : b.a) - shotStart + ((k.at as { offset?: number }).offset ?? 0);
      }
    }
    return { t: clamp(t, 0, dur), x: k.x, y: k.y, zoom: k.zoom, through: !!k.through };
  });
  return out;
}

/** Camera at shot-local time t: Hermite curves between keys; zero velocity on stops, smooth tangents through waypoints. */
export function paintingCamAt(keys: ResolvedCamKey[], t: number): { x: number; y: number; zoom: number } {
  if (!keys.length) return { x: .5, y: .5, zoom: 1 };
  if (t <= keys[0].t) return { x: keys[0].x, y: keys[0].y, zoom: keys[0].zoom };
  const tangent = (i: number, c: 'x' | 'y' | 'zoom') => {
    const k = keys[i];
    if (!k.through || i === 0 || i === keys.length - 1) return 0;
    return (keys[i + 1][c] - keys[i - 1][c]) / Math.max(1e-6, keys[i + 1].t - keys[i - 1].t);
  };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const d = Math.max(1e-6, b.t - a.t), u = clamp((t - a.t) / d);
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
      const at = (c: 'x' | 'y' | 'zoom') => h00 * a[c] + h10 * d * tangent(i - 1, c) + h01 * b[c] + h11 * d * tangent(i, c);
      return { x: at('x'), y: at('y'), zoom: Math.max(1, at('zoom')) };
    }
  }
  const l = keys[keys.length - 1];
  return { x: l.x, y: l.y, zoom: l.zoom };
}

/** Master effect envelope: 0 on the opening still, 1 in the middle, 0 again on the closing still. */
export function paintingMotion(t: number, dur: number, rampIn: number, rampOut: number): number {
  const a = span(t, 0.4, 0.4 + rampIn), b = 1 - span(t, dur - 0.3 - rampOut, dur - 0.3);
  const s = (x: number) => x * x * (3 - 2 * x);
  return s(Math.min(a, b));
}

// ── Compile-time gates ────────────────────────────────────────────────────────────

/** Honesty gates for animated-painting shots (called by compileCouncil). Returns issues; the compiler throws if any. */
export function animatedPaintingIssues(film: CouncilFilm): string[] {
  const issues: string[] = [];
  film.shots.forEach((s, i) => {
    if (s.kind !== 'animatedPainting') return;
    const p = s.painting;
    if (!p) { issues.push(`${s.id}: animatedPainting shot has no painting spec`); return; }
    if (p.medium !== 'painting') issues.push(`${s.id}: only a painting may be animated, never a photograph`);
    if (p.label !== ANIMATED_LABEL) issues.push(`${s.id}: the label must read ${ANIMATED_LABEL}`);
    if (!p.note || p.note.trim().length < 30) issues.push(`${s.id}: animated painting lacks its one-line note`);
    const sl = p.slate;
    if (!(sl.title && sl.source && sl.year && sl.licence)) issues.push(`${s.id}: animated painting lacks title, painter/source, year or licence in its slate`);
    if (s.lowerThird || s.graphic) issues.push(`${s.id}: nothing may be laid over an animated painting (no lower third or graphic)`);
    const prev = i > 0 ? film.shots[i - 1] : undefined;
    if (!prev || prev.kind !== 'card' || prev.transition !== 'silenceHold' || prev.room !== s.room) issues.push(`${s.id}: a painted battle must follow its content-note card (Silence Hold) in the same room`);
    if (!p.cam.length) issues.push(`${s.id}: no camera`);
    else {
      const first = p.cam[0], last = p.cam[p.cam.length - 1];
      if (first.zoom !== 1 || last.zoom !== 1) issues.push(`${s.id}: the camera must start and end on the whole painting (zoom 1) so its real edges are shown`);
      if (p.cam.some(k => k.zoom < 1 || k.zoom > MAX_ZOOM)) issues.push(`${s.id}: camera zoom outside 1..${MAX_ZOOM}`);
    }
    if (!p.rampIn && p.rampIn !== undefined) issues.push(`${s.id}: rampIn must be positive so the first frame is the unaltered painting`);
  });
  return issues;
}

/** Synthesised foley for the shot: soft, distant musket thuds at irregular, deterministic times, and a wind bed. */
export function paintingFoley(spec: AnimatedPaintingSpec, start: number, end: number, seed: number): { events: FoleyEvent[]; wind?: { from: number; to: number } } {
  const n = spec.foley?.muskets ?? 8;
  const events: FoleyEvent[] = [];
  const from = start + 1.4, to = end - 1.2;
  let t = from + 0.6 + hash(seed) * 1.2;
  for (let i = 0; i < n && t < to; i++) {
    events.push({ at: +t.toFixed(3), kind: 'musket', gain: +(0.45 + 0.55 * hash(seed * 7 + i)).toFixed(2) });
    t += 1.5 + hash(seed * 13 + i * 3) * 2.4;
    if (hash(seed * 19 + i) < 0.28) { events.push({ at: +(t - 0.9 + 0.35 * hash(i)).toFixed(3), kind: 'musket', gain: 0.35 }); }   // an answering report
  }
  return { events: events.sort((a, b) => a.at - b.at), wind: spec.foley?.wind === false ? undefined : { from: start, to: end } };
}

// ── Noise texture and palette (CPU, deterministic) ───────────────────────────────

/** Tileable value-noise fbm, three channels (large, medium, fine), 8-bit. */
export function makeNoise(size = 512): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const lattice = (period: number, seed: number) => {
    const g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = hash(i * 2654435761 + seed * 977);
    return (x: number, y: number) => {   // x,y in 0..1, periodic
      const fx = x * period, fy = y * period, ix = Math.floor(fx), iy = Math.floor(fy);
      const ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const at = (a: number, b: number) => g[((b % period + period) % period) * period + ((a % period + period) % period)];
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return top + (bot - top) * sy;
    };
  };
  const chans = [[4, 5, 0.52], [8, 5, 0.5], [16, 4, 0.48]].map(([base, oct, gain], c) => {
    const layers = Array.from({ length: oct }, (_, o) => lattice(base * 2 ** o, c * 31 + o));
    let norm = 0, a = 1; for (let o = 0; o < oct; o++) { norm += a; a *= gain; }
    return (x: number, y: number) => { let v = 0, amp = 1; for (let o = 0; o < oct; o++) { v += amp * layers[o](x, y); amp *= gain; } return v / norm; };
  });
  // Contrast stretch so smoothstep thresholds in the shader land on real structure (raw fbm clusters near 0.5).
  const raw = chans.map(f => { const a = new Float32Array(size * size); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) a[y * size + x] = f(x / size, y / size); return a; });
  raw.forEach((a, c) => {
    let lo = 1, hi = 0; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < a.length; i++) out[i * 4 + c] = Math.round(255 * clamp((a[i] - lo) / (hi - lo)));
  });
  for (let i = 0; i < size * size; i++) out[i * 4 + 3] = 255;
  return out;
}

/**
 * The painting's own smoke colours: among far-plane pixels (sky, smoke, burning town) the mean colour of the dark tail, the
 * middle, and the light tail of the low-saturation ones. So the veils drift in the painter's pigments, not a stock grey.
 */
export function samplePalette(img: ImageData, far: ImageData): { lo: [number, number, number]; mid: [number, number, number]; hi: [number, number, number] } {
  const px: Array<{ l: number; c: [number, number, number] }> = [];
  for (let i = 0; i < img.data.length; i += 4) {
    if (far.data[i] < 200) continue;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 70) continue;   // flame orange and sky blue are not smoke
    px.push({ l: .3 * r + .59 * g + .11 * b, c: [r, g, b] });
  }
  if (px.length < 50) return { lo: [.22, .2, .2], mid: [.5, .47, .44], hi: [.78, .74, .68] };
  px.sort((a, b) => a.l - b.l);
  const band = (a: number, b: number): [number, number, number] => {
    const s = px.slice(Math.floor(px.length * a), Math.max(Math.floor(px.length * a) + 1, Math.floor(px.length * b)));
    const m = [0, 0, 0]; for (const p of s) { m[0] += p.c[0]; m[1] += p.c[1]; m[2] += p.c[2]; }
    return [m[0] / s.length / 255, m[1] / s.length / 255, m[2] / s.length / 255];
  };
  return { lo: band(.04, .16), mid: band(.42, .58), hi: band(.86, .97) };
}

// ── The GPU compositor ────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 p; out vec2 v;
void main(){ v = p * .5 + .5; v.y = 1. - v.y; gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D uImg, uDepth, uMask, uFx, uNoise;
uniform vec4 uView;          // x0, y0, vw, vh in painting uv
uniform vec2 uImgPx;
uniform float uT, uMotion;
uniform vec4 uAmt;           // smoke, flags, fire, cloud
uniform vec2 uPar;           // far-plane parallax offset, painting uv
uniform vec3 uLo, uMid, uHi, uFireCol;
uniform float uFlick;
uniform int uFlagN;
uniform vec4 uFA[4], uFB[4], uFC[4];   // P0.xy t.xy | n.xy span amp | cycles hz phase -

vec2 flagD(vec2 pp, int i, out float w) {
  vec4 A = uFA[i], B = uFB[i], C = uFC[i];
  vec2 r = pp - A.xy;
  float s = dot(r, B.xy) / B.z, tt = dot(r, A.zw) / B.z;      // s: distance from the staff, tt: along it
  float sc = clamp(s, 0., 1.);
  float env = smoothstep(.02, .6, s) * (.3 + .7 * sc);          // pinned on the staff, free at the fly
  w = smoothstep(-.08, .02, s) * (1. - smoothstep(1.15, 1.4, s));
  float ph = 6.2831853 * (C.x * sc - C.y * uT) + C.z + 2.4 * tt;
  float wv = sin(ph) + .35 * sin(2.1 * ph + 1.3);
  return (A.zw * wv * .74 + B.xy * .3 * cos(ph + .7)) * B.w * env;
}

void main() {
  vec2 uv = uView.xy + v * uView.zw;
  vec3 mk = texture(uMask, uv).rgb;      // far plane, flags, fire
  vec3 fx = texture(uFx, uv).rgb;        // fire glow, smoke envelope, face protection
  float dep = texture(uDepth, uv).r;
  float far = mk.r;
  vec2 asp = vec2(uImgPx.x / uImgPx.y, 1.);

  // (d) parallax: only the far plane moves. (c) flags: only inside the hand-marked regions.
  vec2 uvS = uv - uPar * far;
  vec2 pp = uv * uImgPx, fd = vec2(0.); float ws = 0.;
  for (int i = 0; i < 4; i++) { if (i >= uFlagN) break; float w; vec2 d = flagD(pp, i, w); fd += d * w; ws += w; }
  fd /= max(1., ws);
  vec3 c = texture(uImg, uvS + (fd / uImgPx) * mk.g * uAmt.y * uMotion).rgb;

  // (b) smoke, three planes. Each is hidden wherever the painting is nearer than its plane, and kept off the faces.
  float M = uMotion * uAmt.x;
  { // far: the dark column of the burning town, multiplied toward the painter's own dark smoke
    vec2 pos = (uv - uPar) * asp * 1.15 + vec2(uT * .010, -uT * .004);
    vec2 wv = texture(uNoise, pos * .5 + vec2(.21, .63)).gb - .5;
    float n = texture(uNoise, pos + wv * .5).r;
    float a = smoothstep(.30, .86, n) * max(fx.g, .12 * far) * (1. - smoothstep(.12, .20, dep)) * M * .62;
    c = mix(c, c * .5 + mix(uLo, uMid, n) * .5, a);
  }
  { // middle: powder smoke drifting behind the front figures, screened
    vec2 pos = (uv - uPar * .5) * asp * 1.7 + vec2(-uT * .016, uT * .002);
    vec2 wv = texture(uNoise, pos * .45 + vec2(.7, .1)).gb - .5;
    float n = texture(uNoise, pos + wv * .9).g * .7 + texture(uNoise, pos * 2.3 + vec2(.3, uT * .01)).b * .3;
    float a = smoothstep(.34, .86, n) * (fx.g * (1. - .5 * far) + .05) * (1. - smoothstep(.31, .47, dep)) * (1. - fx.b) * M * .55;
    c = 1. - (1. - c) * (1. - mix(uMid, uHi, n) * a * .9);
  }
  { // near: thin wisps, only the nearest figures in front of them
    vec2 pos = (uv + uPar * .3) * asp * 2.6 + vec2(uT * .022, -uT * .006);
    vec2 wv = texture(uNoise, pos * .4 + vec2(.5, .9)).gb - .5;
    float n = texture(uNoise, pos + wv * 1.1).g;
    float a = smoothstep(.42, .88, n) * (fx.g * .8 + .03) * (1. - smoothstep(.55, .66, dep)) * (1. - fx.b) * M * .30;
    c = 1. - (1. - c) * (1. - uHi * a * .8);
  }

  // (e) fire flicker on the burning town, and the cloud shadow
  float sh = texture(uNoise, uv * asp * 7. + vec2(0., -uT * .45)).b - .5;
  float fl = uFlick * .5 + sh * 1.4, FM = uAmt.z * uMotion;
  c *= 1. + FM * mk.b * (.22 * fl + .05);
  c = 1. - (1. - c) * (1. - uFireCol * fx.r * FM * (.10 + .12 * (uFlick * .5 + sh * .6)));
  float cs = texture(uNoise, uv * asp * .30 + vec2(uT * .010, uT * .0035)).r;
  c *= 1. - uAmt.w * uMotion * .17 * smoothstep(.46, .72, cs) * (.6 + .4 * far);
  o = vec4(clamp(c, 0., 1.), 1.);
}`;

export interface FxFrame {
  t: number; motion: number;
  cam: { x: number; y: number; zoom: number };
  amt?: { smoke?: number; flags?: number; parallax?: number; fire?: number; cloud?: number };
}

export class PaintingFx {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  ready = false;
  palette = samplePalette({ data: new Uint8ClampedArray(0) } as ImageData, { data: new Uint8ClampedArray(0) } as ImageData);
  /** CPU copies for the figure-lock check. */
  cpu?: { depth: Uint8ClampedArray; masks: Uint8ClampedArray; w: number; h: number };

  constructor(readonly w: number, readonly h: number, private spec: AnimatedPaintingSpec) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false });
  }

  get ok() { return !!this.gl && !!this.prog && this.ready; }

  load(images: { img: HTMLImageElement; depth: HTMLImageElement; masks: HTMLImageElement; fx: HTMLImageElement }): boolean {
    const gl = this.gl; if (!gl) return false;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return false; }
    this.prog = p; gl.useProgram(p);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uImg', 'uDepth', 'uMask', 'uFx', 'uNoise', 'uView', 'uImgPx', 'uT', 'uMotion', 'uAmt', 'uPar', 'uLo', 'uMid', 'uHi', 'uFireCol', 'uFlick', 'uFlagN', 'uFA', 'uFB', 'uFC']) this.u[n] = gl.getUniformLocation(p, n);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const tex = (unit: number, src: TexImageSource | null, mip: boolean, repeat = false, data?: { px: Uint8Array; size: number }) => {
      const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.size, data.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data.px);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src!);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      return t;
    };
    tex(0, images.img, true); tex(1, images.depth, false); tex(2, images.masks, false); tex(3, images.fx, false);
    tex(4, null, true, true, { px: makeNoise(512), size: 512 });
    ['uImg', 'uDepth', 'uMask', 'uFx', 'uNoise'].forEach((n, i) => gl.uniform1i(this.u[n], i));
    gl.uniform2f(this.u.uImgPx, images.img.naturalWidth, images.img.naturalHeight);
    // CPU copies of depth and masks: the palette, and the figure-lock check.
    const cpu = (el: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(el, 0, 0); return g; };
    const small = (el: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * el.naturalHeight / el.naturalWidth); const g = c.getContext('2d', { willReadFrequently: true })!; g.imageSmoothingQuality = 'high'; g.drawImage(el, 0, 0, c.width, c.height); return g.getImageData(0, 0, c.width, c.height); };
    this.palette = samplePalette(small(images.img), small(images.masks));
    const d = cpu(images.depth), m = cpu(images.masks);
    this.cpu = { depth: d.getImageData(0, 0, images.depth.naturalWidth, images.depth.naturalHeight).data, masks: m.getImageData(0, 0, images.masks.naturalWidth, images.masks.naturalHeight).data, w: images.img.naturalWidth, h: images.img.naturalHeight };
    this.ready = true;
    return true;
  }

  /** View rectangle for a camera: window aspect = painting aspect, so the view is square in painting-uv. */
  static view(cam: { x: number; y: number; zoom: number }) {
    const vw = 1 / Math.max(1, cam.zoom);
    return { x0: clamp(cam.x - vw / 2, 0, 1 - vw), y0: clamp(cam.y - vw / 2, 0, 1 - vw), vw };
  }

  render(f: FxFrame): HTMLCanvasElement | null {
    const gl = this.gl; if (!gl || !this.prog || !this.ready) return null;
    const A = { smoke: 1, flags: 1, parallax: 1, fire: 1, cloud: 1, ...this.spec.strength, ...f.amt };
    const v = PaintingFx.view(f.cam);
    const flags = this.spec.flags.slice(0, 4);
    const fa: number[] = [], fb: number[] = [], fc: number[] = [];
    for (const fl of flags) {
      const [p0, p1] = fl.staff;
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
      let nx = ty, ny = -tx;   // a normal; flip so it points to the cloth side
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if ((fl.cloth[0] - mx) * nx + (fl.cloth[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
      fa.push(p0[0], p0[1], tx, ty); fb.push(nx, ny, fl.span, fl.amp); fc.push(fl.cycles, fl.hz, fl.phase, 0);
    }
    while (fa.length < 16) { fa.push(0, 0, 1, 0); fb.push(1, 0, 1, 0); fc.push(0, 0, 0, 0); }
    gl.useProgram(this.prog);
    gl.viewport(0, 0, this.w, this.h);
    const u = this.u;
    gl.uniform4f(u.uView, v.x0, v.y0, v.vw, v.vw);
    gl.uniform1f(u.uT, f.t); gl.uniform1f(u.uMotion, f.motion);
    gl.uniform4f(u.uAmt, A.smoke, A.flags, A.fire, A.cloud);
    gl.uniform2f(u.uPar, PAR_K * A.parallax * (f.cam.x - .5), PAR_K * A.parallax * (f.cam.y - .5));
    const pal = this.palette;
    gl.uniform3f(u.uLo, ...pal.lo); gl.uniform3f(u.uMid, ...pal.mid); gl.uniform3f(u.uHi, ...pal.hi);
    gl.uniform3f(u.uFireCol, 1.0, .52, .16);
    gl.uniform1f(u.uFlick, (noise1(f.t * 7.3, 11) - .5) * 1.6 + (noise1(f.t * 2.1, 5) - .5) * .8);
    gl.uniform1i(u.uFlagN, flags.length);
    gl.uniform4fv(u.uFA, fa); gl.uniform4fv(u.uFB, fb); gl.uniform4fv(u.uFC, fc);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  /**
   * Figure lock: render with ONLY parallax and flags on, then with everything off, at the same camera; every pixel whose
   * painting-space position is a figure (nearer than the sky, outside the flag regions) must be identical.
   * Returns the largest channel difference over figure pixels and how many pixels were compared.
   */
  lockCheck(cam: { x: number; y: number; zoom: number }, t: number, scratch: CanvasRenderingContext2D): { maxDiff: number; compared: number; farMoved: number } {
    const cpu = this.cpu; if (!cpu) return { maxDiff: 0, compared: 0, farMoved: 0 };
    const grab = (f: FxFrame) => { const c = this.render(f)!; scratch.canvas.width = c.width; scratch.canvas.height = c.height; scratch.drawImage(c, 0, 0); return scratch.getImageData(0, 0, c.width, c.height).data; };
    const off = grab({ t, motion: 0, cam, amt: { parallax: 0 } });
    const on = grab({ t, motion: 1, cam, amt: { smoke: 0, fire: 0, cloud: 0 } });
    const v = PaintingFx.view(cam);
    let maxDiff = 0, compared = 0, farMoved = 0;
    for (let y = 0; y < this.h; y += 2) for (let x = 0; x < this.w; x += 2) {
      const ux = v.x0 + (x + .5) / this.w * v.vw, uy = v.y0 + (y + .5) / this.h * v.vw;
      const ci = (Math.min(cpu.h - 1, Math.floor(uy * cpu.h)) * cpu.w + Math.min(cpu.w - 1, Math.floor(ux * cpu.w))) * 4;
      const i = (y * this.w + x) * 4;
      const d = Math.max(Math.abs(on[i] - off[i]), Math.abs(on[i + 1] - off[i + 1]), Math.abs(on[i + 2] - off[i + 2]));
      if (cpu.masks[ci] < 1 && cpu.masks[ci + 1] < 1 && cpu.depth[ci] > 60) { compared++; maxDiff = Math.max(maxDiff, d); }
      else if (cpu.masks[ci] > 250 && d > 1) farMoved++;
    }
    return { maxDiff, compared, farMoved };
  }
}
