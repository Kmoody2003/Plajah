// lensEngine — real-time "snap-style" video lenses.
//
//   googly    — big plastic googly eyes pinned to every face (up to 2), pupils that SLOSH: they fall
//               with gravity and swing the opposite way when your head accelerates.
//   cardboard — South Park cut-out animation: the real person is painted OUT of a construction-paper world
//               (clean plate) and replaced by a jointed paper puppet driven by face + pose tracking,
//               coloured from your skin/hair/shirt, in 12fps pose-to-pose holds.
//   comic     — a printed comic page: XDoG ink, cel tones, Ben-Day dots, hatching, newsprint; the subject
//               gets a heavy contour and the background a halftone panel with speed lines on action.
//   bigface   — big eyes + big mouth: a magnifying bulge on each tracked face's eyes and mouth ONLY.
//   matrix    — "Neo sees the code": the scene rebuilt from falling glyph columns sized by DEPTH, so the
//               code wraps onto objects; contours carry hotter streams.
//   silent / grindhouse / vhs / foundfootage — film & tape looks (lensShadersFilm.ts); Found Footage's
//               handheld rig reacts to the mouse, clicks and the action on screen.
//   colorize — believable colour for black-and-white film (lensShadersColor.ts): the grey is kept as the
//               film's measurement, chroma is chosen per region (sky, foliage, skin, wardrobe…) at low res,
//               held frame to frame, and edge-aware upsampled.
//   pixel / ascii — the frame redrawn as palette pixel art / a terminal, with the subject (selfie matte,
//               or Segment Anything when there's no person) and Depth Anything layering the scene.
//
// One engine serves BOTH the broadcaster (LiveComposer applies it to the published frame) and any
// <video> (LensVideoOverlay, for viewers and players). The contract is deliberately tiny:
//
//     engine.apply(ctx, canvas, srcVideo, nowMs)
//
// `canvas` already holds the frame (the composer's work canvas, or the overlay with the video drawn
// into it); the lens rewrites it IN PLACE. That keeps the captured output a plain 2D canvas — the
// rule the composer follows because phones won't reliably captureStream a WebGL canvas — while the
// shader work happens on a private offscreen WebGL2 canvas that is blitted back the same task.
//
// Everything degrades instead of throwing: no WebGL2 → shader lenses pass through; no face model →
// googly eyes simply don't appear; no segmenter → cardboard renders without the cut-out.

import { AsyncFaceTracker } from '../vtuber/faceTrackerAsync';
import { FaceTracker, type FaceFrame } from '../vtuber/faceTracker';
import { DetectFeed } from '../vtuber/detectFeed';
import type { FaceEyes } from '../vtuber/eyeGeometry';
import { PersonMatte } from './personMatte';
import { EmotionSmoother, scoreEmotions, EMOTIONS, type AuraState, type EmotionId } from './emotion';
import { AuraOrbs, type Collect } from './auraOrbs';
import { LENS_VERT, BIGFACE_FRAG, NIGHT_FRAG, HEAT_FRAG, AURA_FRAG } from './lensShaders';
import { MATRIX_FRAG, COMIC_FRAG, SOUTHPARK_FRAG, PIXEL_FRAG, ASCII_FRAG } from './lensShadersArt';
import { SILENT_FRAG, GRINDHOUSE_FRAG, VHS_FRAG, FOUND_FRAG } from './lensShadersFilm';
import { COLORIZE_ANALYZE_FRAG, COLORIZE_FRAG } from './lensShadersColor';
import { SceneSegment } from './sceneSegment';
import { ColorScriptPlayer, type ColorScript } from './colorScript';
import type { FilmLookahead, FilmKey } from './filmLookahead';
import { MotionMeter, PointerShake, SceneDepth, ObjectMatte } from './lensAux';
import { drawPuppet, paperTone, css, type PuppetPose, type PuppetColours } from './cutoutPuppet';
import { PoseTracker, POSE } from '../vtuber/poseTracker';
import { HalloweenFilterEngine, type HalloweenFilterId } from '../halloween/halloweenFilterEngine';

export type LensId =
  | 'none'
  | 'googly'
  | 'cardboard'
  | 'comic'
  | 'bigface'
  | 'matrix'
  | 'night'
  | 'heat'
  | 'aura'
  | 'silent'
  | 'grindhouse'
  | 'vhs'
  | 'foundfootage'
  | 'colorize'
  | 'pixel'
  | 'ascii'
  | 'jackolantern'
  | 'ghostface'
  | 'zombie'
  | 'werewolf'
  | 'vampire'
  | 'bats'
  | 'dimlights';

const HALLOWEEN_LENS_IDS = new Set<LensId>([
  'jackolantern',
  'ghostface',
  'zombie',
  'werewolf',
  'vampire',
  'bats',
  'dimlights',
]);

export const LENSES: { id: LensId; label: string; icon: string; blurb: string }[] = [
  { id: 'none', label: 'Off', icon: '🚫', blurb: 'No lens' },
  { id: 'jackolantern', label: "Jack-o'-Lantern", icon: '🎃', blurb: 'Carved 3D pumpkin head + talking fire jaw' },
  { id: 'ghostface', label: 'Ghost Face', icon: '👻', blurb: 'Shrouded phantom scream visage' },
  { id: 'zombie', label: 'Zombie', icon: '🧟', blurb: 'Necrotic undead veins, cataract eyes & jaw' },
  { id: 'werewolf', label: 'Werewolf', icon: '🐺', blurb: 'Lupine fur, glowing amber eyes & fangs' },
  { id: 'vampire', label: 'Vampire', icon: '🧛', blurb: 'Pale Nosferatu skin, crimson eyes & fangs' },
  { id: 'bats', label: 'Bat Swarm', icon: '🦇', blurb: '3D nocturnal bats circling your head' },
  { id: 'dimlights', label: 'Dim the Lights', icon: '🔦', blurb: 'Found-footage night cam & flashlight beam' },
  { id: 'googly', label: 'Googly eyes', icon: '👀', blurb: 'Wobbly plastic eyes' },
  { id: 'bigface', label: 'Big eyes & mouth', icon: '🤪', blurb: 'Faces only — goofy caricature' },
  { id: 'cardboard', label: 'South Park', icon: '✂️', blurb: 'Jointed paper cut-out puppet of you' },
  { id: 'comic', label: 'Comic book', icon: '💥', blurb: 'Ink, Ben-Day dots, speed lines' },
  { id: 'matrix', label: 'The Matrix', icon: '🟩', blurb: 'The world rebuilt from falling code' },
  { id: 'colorize', label: 'Colorize', icon: '🎨', blurb: 'Believable colour for black & white film' },
  { id: 'silent', label: 'Silent film', icon: '🎩', blurb: '1910s hand-cranked nitrate' },
  { id: 'grindhouse', label: 'Grindhouse', icon: '🎞️', blurb: 'Burns, splices, reel changes' },
  { id: 'vhs', label: 'VHS camcorder', icon: '📼', blurb: '80s/90s home tape + date stamp' },
  { id: 'foundfootage', label: 'Found footage', icon: '🎥', blurb: 'Shaky cam that reacts to you' },
  { id: 'pixel', label: 'Pixel art', icon: '👾', blurb: 'Sprite palette, depth planes' },
  { id: 'ascii', label: 'ASCII', icon: '🔤', blurb: 'Live terminal art, traced edges' },
  { id: 'night', label: 'Night vision', icon: '🌙', blurb: 'Goggle phosphor + grain' },
  { id: 'heat', label: 'Heat map', icon: '🔥', blurb: 'Thermal camera' },
  { id: 'aura', label: 'Aura', icon: '🔮', blurb: 'Emotion glow + orbs to collect' },
];

type Fit = 'cover' | 'contain';
type ShaderLens = 'matrix' | 'comic' | 'southpark' | 'bigface' | 'night' | 'heat' | 'aura' | 'silent' | 'grindhouse' | 'vhs' | 'found' | 'pixel' | 'ascii'
  | 'colorize' | 'colorizeA';
const FRAGS: Record<ShaderLens, string> = {
  matrix: MATRIX_FRAG, comic: COMIC_FRAG, southpark: SOUTHPARK_FRAG, bigface: BIGFACE_FRAG, night: NIGHT_FRAG, heat: HEAT_FRAG, aura: AURA_FRAG,
  silent: SILENT_FRAG, grindhouse: GRINDHOUSE_FRAG, vhs: VHS_FRAG, found: FOUND_FRAG, pixel: PIXEL_FRAG, ascii: ASCII_FRAG,
  colorize: COLORIZE_FRAG, colorizeA: COLORIZE_ANALYZE_FRAG,
};
const UNIFORMS = ['uTex', 'uGlyph', 'uMask', 'uRes', 'uT', 'uCell', 'uBoil', 'uHasMask', 'uMapA', 'uMapB', 'uBulge', 'uN', 'uAuraA', 'uAuraB', 'uAuraAmt',
  'uSeed', 'uEvt', 'uReel', 'uCam', 'uVel', 'uFocus', 'uExpo', 'uGlitch', 'uDepth', 'uHasDepth', 'uPlate', 'uHasPlate', 'uMotion', 'uPal', 'uPalN', 'uGrid',
  'uPrev', 'uCut', 'uStock', 'uFace', 'uLip', 'uNF', 'uChroma', 'uCRes', 'uAmt',
  'uSeg', 'uMatPal', 'uHasSeg', 'uSegRect', 'uSegOff', 'uSegTrust', 'uWard', 'uLook', 'uGrade'];
const MIP_KINDS: ShaderLens[] = ['southpark', 'matrix', 'comic', 'night', 'heat', 'aura', 'silent', 'grindhouse', 'vhs', 'found', 'pixel', 'ascii', 'colorize'];
/** Art lenses: subject mask on unit 2, depth on unit 3 (unit 1 = glyph atlas / plate / palette). */
const LAYERED: ShaderLens[] = ['matrix', 'comic', 'southpark', 'pixel', 'ascii'];
const DEPTH_LENSES = new Set<LensId>(['matrix', 'comic', 'pixel', 'ascii', 'colorize']);
const MATTE_LENSES = new Set<LensId>(['cardboard', 'comic', 'matrix', 'heat', 'aura', 'pixel', 'ascii', 'colorize']);
/** Spectral sensitivity of the b&w stock the footage was shot on (linear RGB weights, sum 1). */
export const FILM_STOCKS: Record<'panchromatic' | 'orthochromatic', [number, number, number]> = {
  panchromatic: [0.2126, 0.7152, 0.0722],     // 1930s on: close to the eye's luminance
  orthochromatic: [0.06, 0.5, 0.44],          // silent era: blind to red, so reds photographed dark
};
export type FilmStock = keyof typeof FILM_STOCKS;
const STOCK_KEY = 'plajah.lens.filmStock';
let filmStock: FilmStock = (() => { try { return localStorage.getItem(STOCK_KEY) === 'orthochromatic' ? 'orthochromatic' : 'panchromatic'; } catch { return 'panchromatic'; } })();
/** The viewer's "shot on" choice for Colorize — shared by every engine (picker and players need no wiring). */
export function getFilmStock(): FilmStock { return filmStock; }
export function setFilmStock(s: FilmStock) { filmStock = s; try { localStorage.setItem(STOCK_KEY, s); } catch { /* */ } }
/** Lenses that re-render at a film/animation frame rate and hold the frame in between. */
const HOLD_FPS: Partial<Record<LensId, number>> = { cardboard: 12, silent: 16, grindhouse: 24 };
const PIXEL_PALETTE = [   // pixel-art palette: 32 hand-picked colours, darkest first (index 0 = outline ink)
  '0d0b14', '241a2e', '3b2a45', '5c3c55', '8a2f3c', 'c4423f', 'e8784a', 'f5b06a', 'f9dc8a', 'fff6d6', '2c4a2e', '3f7a3a', '6aab45', 'a8d35f', '1f4f5a', '2f8a8a',
  '56c4b5', 'a7ecd9', '1a2a5c', '2e4fa3', '4f86d9', '8fc0f2', '4a2a6e', '7a46a8', 'b47ed6', '4a2f22', '7a4b32', 'b07a52', 'dba980', 'f2d2b3', '6e6a78', 'a9a4b2',
];
/** ASCII atlas (4×4): a 12-step density ramp, then the four edge characters the shader aligns to contours. */
const ASCII_CHARS = [' ', '.', '`', ':', '-', '=', '+', '*', 'o', '#', '%', '@', '|', '_', '/', '\\'];
const hasWebGPU = () => typeof navigator !== 'undefined' && !!(navigator as any).gpu;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
interface Prog { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/** Where a (vw×vh) video lands on a (W×H) canvas: x_px = x_norm·vw·s + ox. Same form for cover/contain. */
function placement(W: number, H: number, vw: number, vh: number, fit: Fit) {
  const s = fit === 'cover' ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh);
  return { s, ox: (W - vw * s) / 2, oy: (H - vh * s) / 2 };
}

// ── googly eye state ──────────────────────────────────────────────────────────
interface Eye {
  x: number; y: number; r: number;            // smoothed centre + radius (canvas px)
  tx: number; ty: number; tr: number;         // latest detection
  vx: number; vy: number; ax: number; ay: number; // frame velocity / low-passed acceleration (px/s, px/s²)
  px: number; py: number; pvx: number; pvy: number; // pupil, in unit-disc space
  gx: number; gy: number; tgx: number; tgy: number;  // iris gaze offset (eye-widths) — South Park pupils
  o: number; to: number;                      // lid opening (blink) — the cut-out puppet's eyes
}
/** Mouth centre/width (canvas px) + how open it is (inner-lip gap / width). */
interface Mouth { x: number; y: number; w: number; open: number; tx: number; ty: number; tw: number; topen: number }
/** Head oval (canvas px): centre + radii. */
interface Head { x: number; y: number; rx: number; ry: number; tx: number; ty: number; trx: number; try_: number }
interface Track { cx: number; cy: number; eyes: [Eye, Eye]; mouth: Mouth; head: Head; seen: number; alpha: number }
const newEye = (x: number, y: number, r: number, gx = 0, gy = 0): Eye =>
  ({ x, y, r, tx: x, ty: y, tr: r, vx: 0, vy: 0, ax: 0, ay: 0, px: 0, py: 0.5, pvx: 0, pvy: 0, gx, gy, tgx: gx, tgy: gy, o: 0.3, to: 0.3 });

const PUPIL = 0.44;                       // pupil radius ÷ eye radius
const REACH = 1 - PUPIL;                  // how far the pupil centre may roam
const GRAVITY = 26;                       // eye-radii / s²
const BOUNCE = 0.55, DRAG = 1.3;

export class LensEngine {
  private lens: LensId = 'none';
  private note = '';

  // ── GL (shader lenses) ──
  private glc = document.createElement('canvas');
  private gl: WebGL2RenderingContext | null = null;
  private progs: Partial<Record<ShaderLens, Prog>> = {};
  private quad: WebGLBuffer | null = null;
  private srcTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private glyphTex: WebGLTexture | null = null;
  private maskStamp = -1;
  private tainted = false;                // cross-origin video: the GPU can't read it, lens passes through

  // ── face (googly) ──
  private worker = new AsyncFaceTracker();
  private sync: FaceTracker | null = null;
  private faceBlend = false;                 // tracker was started WITH blendshapes (aura needs them)

  // ── aura: estimated emotion -> colours, plus the collectible orbs ──
  private emotion = new EmotionSmoother();
  private orbs = new AuraOrbs();
  private auraState: AuraState = this.emotion.get();
  private feed = new DetectFeed();
  private faceState: 'idle' | 'loading' | 'worker' | 'sync' | 'failed' = 'idle';
  private lastSend = -1e9; private lastTs = -1; private lastSync = -1e9;
  private tracks: Track[] = [];
  private lastApply = 0;

  // ── matte (comic / cardboard) ──
  private matte = new PersonMatte();

  // ── limited animation / projector rate: the whole frame re-renders at HOLD_FPS and is held in between ──
  private hold = document.createElement('canvas');
  private holdAt = 0;
  private holdGap = 83;
  private frameNo = 0;                    // advances once per rendered (not held) frame: film grain/dust seed

  // ── newer senses (lensAux) ──
  private motion = new MotionMeter();
  private pointer = new PointerShake();
  private depth = new SceneDepth();
  private sam = new ObjectMatte();
  private depthTex: WebGLTexture | null = null;
  private depthStamp = -1;
  private plateTex: WebGLTexture | null = null;
  private palTex: WebGLTexture | null = null;
  private asciiTex: WebGLTexture | null = null;
  private noPersonSince = 0;              // when the selfie matte last saw nobody (→ Segment Anything takes over)
  private personSeen = false;
  private samStamp = -1;

  // ── South Park: clean plate (background as last seen, video space) + body pose + paper colours ──
  private plate = document.createElement('canvas');
  private plateTmp = document.createElement('canvas');
  private plateAlpha = document.createElement('canvas');
  private plateStamp = -1;
  private plateReady = false;
  private pose: PoseTracker | null = null;
  private poseState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private poseTs = 0;
  private lastPose: PuppetPose | null = null;
  private colours: PuppetColours = { skin: 'rgb(242,206,170)', hair: 'rgb(90,60,40)', shirt: 'rgb(60,110,200)', pants: 'rgb(60,70,120)', glove: 'rgb(200,40,40)' };
  private coloursAt = 0;
  private swatch = document.createElement('canvas');

  // ── film/tape state ──
  private startedAt = 0;
  private freeze = document.createElement('canvas');      // grindhouse: the frame stuck in the gate while it burns
  private evt = { type: 0, start: 0, dur: 0, seed: 0 };
  private nextEvtAt = 0;
  private reel: [number, number, number, number] = [0.3, 0.5, 0.3, 1];
  private vhsYear = 1994;
  private track = { amt: 0, pos: 0.8, until: 0, next: 0 };
  // found footage handheld rig
  private rig = { x: 0, y: 0, r: 0, z: 1.12, vx: 0, vy: 0, vr: 0, vz: 0, px: 0, py: 0, panic: 0, focus: 0, expo: 1, glitch: 0, punch: 0 };

  // ── colorize: low-res chroma accumulator (ping-pong RGBA8 targets) ──
  private cz: { tex: [WebGLTexture, WebGLTexture]; fbo: [WebGLFramebuffer, WebGLFramebuffer]; w: number; h: number; cur: number; fresh: boolean } | null = null;
  private stock: FilmStock = filmStock;
  private seg = new SceneSegment();
  private segTex: WebGLTexture | null = null;
  private matPalTex: WebGLTexture | null = null;
  private matPalStamp = -1;
  private colorScript = new ColorScriptPlayer();
  /** The film's colour bible (colorScript.ts): per-shot set colours, wardrobe, cast, stock, print look. */
  setColorScript(s: ColorScript | null) {
    this.colorScript.set(s); if (this.cz) this.cz.fresh = true;
    // a known film is a fixed experience: worth the heavier scene model (desktop / WebGPU only) — unless the
    // lookahead is already running it ahead of the playhead, in which case live stays the light fallback
    if (s && this.segment && hasWebGPU() && !isAndroid() && !this.lookahead) this.seg.setTier('remaster');
  }
  /** Ahead-of-playhead analysis for this film (filmLookahead.ts): its cached labels replace the live model. */
  setLookahead(la: FilmLookahead | null) {
    this.lookahead = la; this.laShot = -1; this.driftKey = null;
    this.seg.setTier(la ? 'live' : this.colorScript.get() && hasWebGPU() && !isAndroid() ? 'remaster' : 'live');
  }
  private lookahead: FilmLookahead | null = null;
  private laShot = -1;
  private driftKey: FilmKey | null = null;
  private driftAt = 0;
  private drift = { dx: 0, dy: 0, agree: 1 };
  private segObj: object | null = null;
  /** 0 natural … 1 Technicolor 3-strip print; null = whatever the colour script says. */
  setColorGrade(g: number | null) { this.gradeOverride = g; }
  private gradeOverride: number | null = null;
  /** Pin the colour script's clock (seconds) — previews and stills; null = follow the video's currentTime. */
  setFilmTime(t: number | null) { this.filmTime = t; }
  private filmTime: number | null = null;

  // ── Halloween Face & Camera Filter Engine ──
  private halloweenEngine: HalloweenFilterEngine | null = null;

  /** `models: false` = shaders only (no face/pose/matte/depth/SAM downloads) — the lab's still-frame review uses it. */
  private models: boolean;
  /** scene segmentation reads the frame being shaded (no <video> needed) — the lab turns it on alone for still review */
  private segment: boolean;
  constructor(opts: { models?: boolean; segment?: boolean } = {}) {
    this.models = opts.models !== false; this.segment = opts.segment ?? this.models; this.initGL();
  }

  getLens() { return this.lens; }
  /** Short human-readable state for diagnostics / a status pill ('' when all is well). */
  getStatus(): string {
    if (this.lens === 'none' || HALLOWEEN_LENS_IDS.has(this.lens)) return '';
    if (this.tainted && this.lens !== 'googly') return 'this video blocks filters (cross-origin)';
    if (this.lens !== 'googly' && !this.gl) return 'GPU filters unavailable on this device';
    if (this.lens === 'googly' || this.lens === 'cardboard' || this.lens === 'bigface' || this.lens === 'aura') {
      if (this.faceState === 'loading') return 'loading face tracker…';
      if (this.faceState === 'failed') return 'face tracker unavailable on this device';
      if (this.tracks.length === 0) return 'looking for a face…';
    }
    if (MATTE_LENSES.has(this.lens) && this.lens !== 'heat' && this.lens !== 'aura' && this.matte.state === 'loading') return 'loading cut-out model…';
    if (DEPTH_LENSES.has(this.lens) && this.depth.state() === 'loading') return 'loading depth model…';
    if (this.lens === 'colorize' && this.lookahead) { const st = this.lookahead.status(); if (st) return st; }
    if (this.lens === 'cardboard' && this.poseState === 'loading') return 'loading body tracker…';
    return this.note;
  }

  setLens(id: LensId) {
    if (id === this.lens) return;
    this.lens = id;
    this.note = '';
    if (HALLOWEEN_LENS_IDS.has(id)) {
      if (!this.halloweenEngine) this.halloweenEngine = new HalloweenFilterEngine();
      if (id === 'dimlights') {
        this.halloweenEngine.setFilter('none');
        this.halloweenEngine.setDimLights(true);
      } else {
        this.halloweenEngine.setDimLights(false);
        this.halloweenEngine.setFilter(id as HalloweenFilterId);
      }
      return;
    }
    if (this.models && (id === 'googly' || id === 'cardboard' || id === 'bigface' || id === 'aura' || id === 'colorize')) this.startFace(id === 'aura');   // all need eyes/mouth; aura also expressions
    if (this.models && MATTE_LENSES.has(id)) void this.matte.init();
    // depth + Segment Anything are transformer models: only where WebGPU can carry them (wasm would stall the frame)
    if (this.models && DEPTH_LENSES.has(id) && hasWebGPU() && !isAndroid()) this.depth.init();
    if (this.segment && id === 'colorize' && hasWebGPU() && !isAndroid()) this.seg.init();
    if (this.models && id === 'cardboard') this.startPose();
    if (id === 'foundfootage') this.pointer.start(); else this.pointer.stop();
    if (id !== 'googly' && id !== 'cardboard' && id !== 'bigface' && id !== 'aura' && id !== 'colorize') this.tracks = [];
    if (this.cz) this.cz.fresh = true;
    if (id !== 'aura') this.orbs.reset();
    this.holdAt = 0; this.frameNo = 0; this.startedAt = 0;
    this.evt.type = 0; this.nextEvtAt = 0; this.plateReady = false; this.plateStamp = -1;
    this.vhsYear = 1986 + Math.floor(Math.random() * 12);
    this.rig = { x: 0, y: 0, r: 0, z: 1.12, vx: 0, vy: 0, vr: 0, vz: 0, px: 0, py: 0, panic: 0, focus: 0.6, expo: 1, glitch: 0, punch: 0 };
  }

  // ───────────────────────────── GL ─────────────────────────────
  private initGL() {
    try {
      const gl = this.glc.getContext('webgl2', { alpha: false, preserveDrawingBuffer: false, premultipliedAlpha: false, antialias: false });
      if (!gl) throw new Error('no webgl2');
      this.glc.addEventListener('webglcontextlost', e => { e.preventDefault(); this.gl = null; this.progs = {}; this.cz = null; this.segTex = null; this.matPalTex = null; }, false);
      this.glc.addEventListener('webglcontextrestored', () => { this.initGL(); }, false);
      const buf = gl.createBuffer(); this.quad = buf; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const mkTex = (filter: number) => {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      this.srcTex = mkTex(gl.LINEAR);
      this.maskTex = mkTex(gl.LINEAR);
      this.maskStamp = -1;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.depthTex = mkTex(gl.LINEAR); this.depthStamp = -1;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
      this.plateTex = mkTex(gl.LINEAR_MIPMAP_LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.generateMipmap(gl.TEXTURE_2D);
      this.glyphTex = null; this.palTex = null; this.asciiTex = null;
      this.gl = gl;
    } catch (e) {
      console.warn('[lens] WebGL2 unavailable — shader lenses pass through:', e);
      this.gl = null;
    }
  }

  private program(kind: ShaderLens): Prog | null {
    const gl = this.gl; if (!gl) return null;
    const have = this.progs[kind]; if (have) return have;
    try {
      const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, LENS_VERT); gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, FRAGS[kind]); gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs) || 'fragment shader');
      const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of UNIFORMS) u[n] = gl.getUniformLocation(prog, n);
      return (this.progs[kind] = { prog, u });
    } catch (e) {
      console.warn(`[lens] ${kind} shader failed:`, e);
      this.gl = null; // don't retry a broken GPU every frame
      return null;
    }
  }

  /** Katakana + digits atlas (8×8) for the Matrix rain, drawn once. */
  private ensureGlyphs() {
    const gl = this.gl; if (!gl || this.glyphTex) return;
    const S = 512, C = S / 8;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d')!;
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(C * 0.78)}px "MS Gothic","Noto Sans Mono CJK JP","Noto Sans JP","Hiragino Kaku Gothic ProN",monospace`;
    const chars: string[] = [];
    for (let k = 0xff66; k <= 0xff9d; k++) chars.push(String.fromCharCode(k));   // half-width katakana
    for (const d of '0123456789') chars.push(d);
    chars.slice(0, 64).forEach((ch, i) => x.fillText(ch, (i % 8) * C + C / 2, Math.floor(i / 8) * C + C / 2 + 2));
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.glyphTex = t;
  }

  /** Upload the latest person matte on texture `unit` and set the mask uniforms (+ canvas to video uv map). */
  private bindMatte(P: Prog, src: HTMLVideoElement, W: number, H: number, nowMs: number, fit: Fit, unit: number) {
    const gl = this.gl!;
    const m = this.matte.update(src, nowMs);
    const has = !!m && m.w > 0;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    if (has && m!.stamp !== this.maskStamp) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, m!.w, m!.h, 0, gl.RED, gl.UNSIGNED_BYTE, m!.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.maskStamp = m!.stamp;
    }
    gl.uniform1i(P.u.uMask, unit);
    gl.uniform1f(P.u.uHasMask, has ? 1 : 0);
    // canvas uv to video uv, so the matte lines up with however the video was cropped onto the canvas
    const vw = src.videoWidth || W, vh = src.videoHeight || H;
    const pl = placement(W, H, vw, vh, fit);
    gl.uniform2f(P.u.uMapA, W / (vw * pl.s), H / (vh * pl.s));
    gl.uniform2f(P.u.uMapB, -pl.ox / (vw * pl.s), -pl.oy / (vh * pl.s));
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Aura colours: driven by the emotion layer; neutral violet/teal until a face is read. */
  private auraA: [number, number, number] = [0.48, 0.36, 1];
  private auraB: [number, number, number] = [0.18, 0.9, 0.84];
  private auraAmt = 0.3;
  private setAuraUniforms(P: Prog) {
    const gl = this.gl!;
    gl.uniform3f(P.u.uAuraA, ...this.auraA); gl.uniform3f(P.u.uAuraB, ...this.auraB); gl.uniform1f(P.u.uAuraAmt, this.auraAmt);
  }

  /** Glyph atlas for the ASCII lens (4×4, monospace), drawn once. */
  private ensureAscii() {
    const gl = this.gl; if (!gl || this.asciiTex) return;
    const S = 512, C = S / 4;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d')!;
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(C * 0.92)}px "Consolas","Menlo","DejaVu Sans Mono","Courier New",monospace`;
    ASCII_CHARS.forEach((ch, i) => {
      x.save(); x.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2 + C * 0.04);
      x.scale(1.45, 1);                                     // the shader's cells are 0.6 wide: pre-widen so glyphs fill them
      x.fillText(ch, 0, 0); x.restore();
    });
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.asciiTex = t;
  }

  /** 32×1 palette texture for the pixel-art lens. */
  private ensurePalette() {
    const gl = this.gl; if (!gl || this.palTex) return;
    const d = new Uint8Array(32 * 4);
    PIXEL_PALETTE.forEach((h, i) => { d[i * 4] = parseInt(h.slice(0, 2), 16); d[i * 4 + 1] = parseInt(h.slice(2, 4), 16); d[i * 4 + 2] = parseInt(h.slice(4, 6), 16); d[i * 4 + 3] = 255; });
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.palTex = t;
  }

  /** The subject on texture `unit`: the selfie matte while it sees a person; after ~2.5s of nobody (and with
   *  WebGPU) Segment Anything, prompted where the action is, so pets/products/cars get cut out too. */
  private bindSubject(P: Prog, src: HTMLVideoElement, W: number, H: number, nowMs: number, fit: Fit, unit: number) {
    const gl = this.gl!;
    const m = this.matte.update(src, nowMs);
    if (m && m.stamp !== this.presenceStamp) {
      this.presenceStamp = m.stamp;
      let on = 0, n = 0;
      for (let i = 0; i < m.data.length; i += 61) { n++; if (m.data[i] > 140) on++; }
      this.personSeen = on / Math.max(1, n) > 0.015;
      if (this.personSeen) this.noPersonSince = 0; else if (!this.noPersonSince) this.noPersonSince = nowMs;
    }
    const wantSam = this.lens !== 'cardboard' && this.matte.state === 'ready' && !this.personSeen && this.noPersonSince > 0
      && nowMs - this.noPersonSince > 2500 && hasWebGPU() && !isAndroid();
    if (!wantSam) { this.bindMatte(P, src, W, H, nowMs, fit, unit); return; }
    this.sam.init();
    const vw = src.videoWidth || W, vh = src.videoHeight || H;
    const pl = placement(W, H, vw, vh, fit);
    // prompt point: the motion centroid pulled toward the centre, in video uv
    const cx = (0.5 + (this.motion.cx - 0.5) * 0.6) * W, cy = (0.5 + (this.motion.cy - 0.5) * 0.6) * H;
    const vx = Math.max(0.02, Math.min(0.98, (cx - pl.ox) / (vw * pl.s))), vy = Math.max(0.02, Math.min(0.98, (cy - pl.oy) / (vh * pl.s)));
    const c = this.sam.update(src, nowMs, vx, vy);
    if (!c) { this.bindMatte(P, src, W, H, nowMs, fit, unit); return; }
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    if (this.sam.stamp !== this.samStamp) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      this.samStamp = this.sam.stamp; this.maskStamp = -1;   // the person matte must re-upload when it returns
    }
    gl.uniform1i(P.u.uMask, unit);
    gl.uniform1f(P.u.uHasMask, 1);
    gl.uniform2f(P.u.uMapA, W / (vw * pl.s), H / (vh * pl.s));
    gl.uniform2f(P.u.uMapB, -pl.ox / (vw * pl.s), -pl.oy / (vh * pl.s));
    gl.activeTexture(gl.TEXTURE0);
  }
  private presenceStamp = -1;

  /** Depth Anything map on texture `unit` (video space, same uMapA/B as the matte). */
  private bindDepth(P: Prog, src: HTMLVideoElement, nowMs: number, unit: number) {
    const gl = this.gl!;
    const d = DEPTH_LENSES.has(this.lens) ? this.depth.update(src, nowMs) : null;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    if (d && this.depth.stamp !== this.depthStamp) {
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d); this.depthStamp = this.depth.stamp; } catch { /* */ }
    }
    gl.uniform1i(P.u.uDepth, unit);
    gl.uniform1f(P.u.uHasDepth, d && this.depthStamp >= 0 ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
  }

  private shade(kind: ShaderLens, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, src: HTMLVideoElement, nowMs: number, fit: Fit) {
    const gl = this.gl; if (!gl || this.tainted) return;
    const P = this.program(kind); if (!P || !this.gl) return;
    const W = canvas.width, H = canvas.height;
    if (this.glc.width !== W || this.glc.height !== H) { this.glc.width = W; this.glc.height = H; }
    gl.viewport(0, 0, W, H);
    gl.useProgram(P.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); }
    catch { this.tainted = true; return; }          // SecurityError: cross-origin video
    // lenses that sample blurred MIP levels (flat colour, local contrast, bloom); the rest read level 0
    if (MIP_KINDS.includes(kind)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.uniform1i(P.u.uTex, 0);
    gl.uniform2f(P.u.uRes, W, H);

    gl.uniform1f(P.u.uT, nowMs / 1000);
    gl.uniform1f(P.u.uSeed, this.frameNo);
    gl.uniform1f(P.u.uBoil, Math.floor(nowMs / 83));   // ~12 fps stop-motion
    if (LAYERED.includes(kind)) {
      this.bindSubject(P, src, W, H, nowMs, fit, 2);
      this.bindDepth(P, src, nowMs, 3);
    }
    if (kind === 'matrix') {
      this.ensureGlyphs();
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
      gl.uniform1i(P.u.uGlyph, 1);
      gl.uniform1f(P.u.uCell, Math.max(8, Math.round(W / 62)));
    } else if (kind === 'ascii') {
      this.ensureAscii();
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.asciiTex);
      gl.uniform1i(P.u.uGlyph, 1);
      gl.uniform1f(P.u.uCell, Math.max(9, Math.round(H / 50)));
    } else if (kind === 'pixel') {
      this.ensurePalette();
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.palTex);
      gl.uniform1i(P.u.uPal, 1);
      gl.uniform1f(P.u.uPalN, PIXEL_PALETTE.length);
      gl.uniform1f(P.u.uGrid, Math.max(4, Math.round(Math.max(W, H) / 170)));
    } else if (kind === 'comic') {
      gl.uniform3f(P.u.uMotion, this.motion.energy, this.motion.cx, this.motion.cy);
    } else if (kind === 'southpark') {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.plateTex);
      gl.uniform1i(P.u.uPlate, 1);
      // only paint the person out when a puppet will stand in for them
      gl.uniform1f(P.u.uHasPlate, this.plateReady && this.tracks.some(t => t.alpha > 0.3) ? 1 : 0);
    } else if (kind === 'grindhouse') {
      const e = this.evt;
      gl.uniform4f(P.u.uEvt, e.type, e.type ? Math.min(1, (nowMs - e.start) / e.dur) : 0, e.seed, 1);
      gl.uniform4f(P.u.uReel, ...this.reel);
    } else if (kind === 'vhs') {
      gl.uniform4f(P.u.uEvt, this.track.amt, this.track.pos, 0, 0);
    } else if (kind === 'found') {
      const r = this.rig;
      gl.uniform4f(P.u.uCam, r.x, r.y, r.r, r.z);
      gl.uniform2f(P.u.uVel, r.px, r.py);
      gl.uniform1f(P.u.uFocus, r.focus);
      gl.uniform1f(P.u.uExpo, r.expo);
      gl.uniform1f(P.u.uGlitch, r.glitch);
    } else if (kind === 'bigface') {
      // up to 3 faces x (2 eyes + mouth). Radii follow the face's own scale; the mouth swells further as it opens.
      const b = new Float32Array(36); let n = 0;
      for (const t of this.tracks) {
        if (t.alpha < 0.3 || n > 6) continue;
        const k = Math.min(1, t.alpha);
        for (const e of t.eyes) b.set([e.x, e.y, Math.max(6, e.r * 2.3), 0.72 * k], 4 * n++);
        const m = t.mouth;
        b.set([m.x, m.y, Math.max(8, m.w * (0.95 + m.open * 0.5)), (0.5 + Math.min(0.2, m.open * 0.6)) * k], 4 * n++);
      }
      gl.uniform4fv(P.u.uBulge, b); gl.uniform1i(P.u.uN, n);
    } else if (kind === 'colorize') {
      const cz = this.analyzeColour(src, canvas, W, H, nowMs, fit);
      if (!cz) return;
      gl.useProgram(P.prog); gl.viewport(0, 0, W, H);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cz.tex[cz.cur]);
      gl.uniform1i(P.u.uChroma, 1);
      gl.uniform2f(P.u.uCRes, cz.w, cz.h);
      gl.uniform3f(P.u.uStock, ...FILM_STOCKS[this.stock]);
      gl.uniform1f(P.u.uAmt, 1);
      gl.uniform1f(P.u.uGrade, this.gradeOverride ?? this.colorScript.grade());
      gl.activeTexture(gl.TEXTURE0);
    } else if (kind === 'heat' || kind === 'aura') {
      this.bindMatte(P, src, W, H, nowMs, fit, 1);
      if (kind === 'aura') this.setAuraUniforms(P);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ctx.drawImage(this.glc, 0, 0, W, H);            // same-task blit: spec-guaranteed to see this frame
  }

  /** Colorize, pass 1: decide each ~8px region's colour into the chroma accumulator (reads the previous one).
   *  Expects the frame already on TEXTURE0 with mips; leaves the default framebuffer bound. */
  /** Scene materials (unit 4, canvas space) + the shot's material palette (unit 5). */
  private bindScene(A: Prog, canvas: HTMLCanvasElement, src: HTMLVideoElement, nowMs: number): boolean {
    const gl = this.gl!;
    const mkNearest = () => {
      const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const t = this.filmTime ?? (Number.isFinite(src.currentTime) ? src.currentTime : 0);
    // the film's own analysis, done ahead of the playhead, before any live model
    let m = null as import('./sceneSegment').SegMap | null, cut = false, off = [0, 0], trust = 1;
    if (this.lookahead) {
      this.lookahead.follow(t);
      const hit = this.lookahead.mapAt(t);
      if (hit) {
        m = hit.map;
        if (hit.key !== this.driftKey || nowMs - this.driftAt > 100) {        // follow pans; distrust a changed picture
          try { this.drift = this.lookahead.drift(canvas, hit.key); } catch { this.drift = { dx: 0, dy: 0, agree: 0.5 }; }
          this.driftKey = hit.key; this.driftAt = nowMs;
        }
        off = [this.drift.dx, this.drift.dy]; trust = this.drift.agree;
        if (hit.shot !== this.laShot) { cut = this.laShot >= 0; this.laShot = hit.shot; }   // the cached cut, to the frame
        // the picture no longer matches the key (a cut the reader missed, or a new set-up): live labels instead
        if (this.drift.agree < 0.3) { m = null; trust = 1; off = [0, 0]; }
      }
    }
    if (!m && this.segment) m = this.seg.update(canvas, nowMs);
    gl.activeTexture(gl.TEXTURE4);
    if (!this.segTex) { this.segTex = mkNearest(); this.segObj = null; }
    gl.bindTexture(gl.TEXTURE_2D, this.segTex);
    if (m && m !== this.segObj) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, m.w, m.h, 0, gl.RG, gl.UNSIGNED_BYTE, m.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.segObj = m;
    }
    gl.uniform1i(A.u.uSeg, 4);
    gl.uniform1f(A.u.uHasSeg, m ? 1 : 0);
    if (m) gl.uniform4f(A.u.uSegRect, ...m.rect);
    gl.uniform2f(A.u.uSegOff, off[0], off[1]);
    gl.uniform1f(A.u.uSegTrust, trust);
    // the shot's palette follows the film's clock (a still or a live feed just keeps the defaults)
    this.colorScript.update(t);
    gl.activeTexture(gl.TEXTURE5);
    if (!this.matPalTex) { this.matPalTex = mkNearest(); this.matPalStamp = -1; }
    gl.bindTexture(gl.TEXTURE_2D, this.matPalTex);
    if (this.matPalStamp !== this.colorScript.stamp) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 32, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.colorScript.palettePixels());
      this.matPalStamp = this.colorScript.stamp;
    }
    gl.uniform1i(A.u.uMatPal, 5);
    gl.activeTexture(gl.TEXTURE0);
    return cut;
  }

  private analyzeColour(src: HTMLVideoElement, canvas: HTMLCanvasElement, W: number, H: number, nowMs: number, fit: Fit) {
    const gl = this.gl!;
    const A = this.program('colorizeA'); if (!A || !this.gl) return null;
    const w = Math.max(8, Math.round(W / 8)), h = Math.max(8, Math.round(H / 8));
    let cz = this.cz;
    if (!cz || cz.w !== w || cz.h !== h) {
      if (cz) { cz.tex.forEach(t => gl.deleteTexture(t)); cz.fbo.forEach(f => gl.deleteFramebuffer(f)); }
      const mk = () => {
        const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const f = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return [t, f] as const;
      };
      const a = mk(), b = mk();
      cz = this.cz = { tex: [a[0], b[0]], fbo: [a[1], b[1]], w, h, cur: 0, fresh: true };
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    }
    const prev = cz.cur; cz.cur ^= 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, cz.fbo[cz.cur]);
    gl.viewport(0, 0, w, h);
    gl.useProgram(A.prog);
    gl.uniform1i(A.u.uTex, 0);
    gl.uniform2f(A.u.uRes, W, H);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cz.tex[prev]);
    gl.uniform1i(A.u.uPrev, 1);
    // a cut (or a fresh start) throws the old colours away; otherwise regions keep theirs
    const want = this.colorScript.stock() ?? filmStock;
    if (this.stock !== want) { this.stock = want; cz.fresh = true; }   // re-read the greys through the new stock
    gl.uniform1f(A.u.uCut, cz.fresh || this.motion.burst > 0.45 ? 1 : 0);
    cz.fresh = false;
    gl.uniform3f(A.u.uStock, ...FILM_STOCKS[this.stock]);
    this.bindMatte(A, src, W, H, nowMs, fit, 2);
    this.bindDepth(A, src, nowMs, 3);
    // faces (canvas uv): head oval + mouth, from the tracker
    // faces left to right, so the colour script's "people in this shot" line up with them
    const face = new Float32Array(12), lip = new Float32Array(12), ward = new Float32Array(12), look = new Float32Array(12); let n = 0;
    const shown = this.tracks.filter(t => t.alpha >= 0.3).sort((a, b) => a.head.x - b.head.x).slice(0, 3);
    // one described person = the shot's focal character: the biggest face, whoever stands left of them
    const focal = this.colorScript.peopleCount() === 1 && shown.length > 1
      ? shown.reduce((bi, t, i) => (t.head.rx > shown[bi].head.rx ? i : bi), 0) : -1;
    for (const t of shown) {
      const k = Math.min(1, t.alpha);
      face.set([t.head.x / W, t.head.y / H, t.head.rx / W, t.head.ry / H], 4 * n);
      lip.set([t.mouth.x / W, t.mouth.y / H, t.mouth.w / W, k], 4 * n);
      const who = focal < 0 ? n : n === focal ? 0 : -1;
      ward.set(this.colorScript.wardrobe(who), 4 * n);
      look.set(this.colorScript.look(who), 4 * n);
      n++;
    }
    gl.uniform4fv(A.u.uFace, face); gl.uniform4fv(A.u.uLip, lip); gl.uniform1i(A.u.uNF, n);
    gl.uniform4fv(A.u.uWard, ward); gl.uniform4fv(A.u.uLook, look);
    if (this.bindScene(A, canvas, src, nowMs)) gl.uniform1f(A.u.uCut, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    return cz;
  }

  // ───────────────────────────── South Park: plate, pose, colours ─────────────────────────────
  private startPose() {
    if (this.poseState !== 'idle') return;
    this.poseState = 'loading';
    const p = new PoseTracker();
    p.init().then(ok => { if (ok) { this.pose = p; this.poseState = 'ready'; } else this.poseState = 'failed'; });
  }

  /** Body landmarks in canvas px (run at the 12fps hold rate — the puppet only moves on holds anyway). */
  private feedPose(src: HTMLVideoElement, W: number, H: number, fit: Fit) {
    if (!this.pose || src.readyState < 2 || !src.videoWidth) return;
    this.poseTs = Math.max(this.poseTs + 1, Math.round(performance.now()));
    const f = this.pose.detect(this.feed.src(src), this.poseTs);
    if (!f) { this.lastPose = null; return; }
    const vw = src.videoWidth, vh = src.videoHeight, pl = placement(W, H, vw, vh, fit);
    const at = (i: number) => { const p = f.pts[i]; return p ? { x: p.x * vw * pl.s + pl.ox, y: p.y * vh * pl.s + pl.oy, v: p.v } : undefined; };
    this.lastPose = {
      shoulderL: at(POSE.shoulderL), shoulderR: at(POSE.shoulderR),
      elbowL: at(POSE.elbowL), elbowR: at(POSE.elbowR),
      wristL: at(POSE.wristL), wristR: at(POSE.wristR),
    };
  }

  /** Keep the background as last seen (video space, premultiplied alpha = "known"), so the person can be painted out. */
  private updatePlate(src: HTMLVideoElement, nowMs: number) {
    const gl = this.gl; if (!gl) return;
    const m = this.matte.update(src, nowMs);
    if (!m || m.stamp === this.plateStamp || !src.videoWidth) return;
    this.plateStamp = m.stamp;
    const pw = 192, ph = Math.max(2, Math.round(192 * src.videoHeight / src.videoWidth));
    for (const c of [this.plate, this.plateTmp, this.plateAlpha]) if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; if (c === this.plate) this.plateReady = false; }
    // background alpha = NOT person (dilated: the matte's soft edge carries person colour)
    const ax = this.plateAlpha.getContext('2d')!;
    const img = ax.createImageData(pw, ph), d = img.data;
    const sx = m.w / pw, sy = m.h / ph, R = 3;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      let v = 0;
      for (let dy = -R; dy <= R; dy += R) for (let dx = -R; dx <= R; dx += R) {
        const mx = Math.min(m.w - 1, Math.max(0, Math.round((x + dx) * sx))), my = Math.min(m.h - 1, Math.max(0, Math.round((y + dy) * sy)));
        v = Math.max(v, m.data[my * m.w + mx]);
      }
      d[(y * pw + x) * 4 + 3] = v > 70 ? 0 : 255;
    }
    ax.putImageData(img, 0, 0);
    const tx = this.plateTmp.getContext('2d')!;
    tx.globalCompositeOperation = 'copy'; tx.drawImage(src, 0, 0, pw, ph);
    tx.globalCompositeOperation = 'destination-in'; tx.drawImage(this.plateAlpha, 0, 0);
    tx.globalCompositeOperation = 'source-over';
    const px = this.plate.getContext('2d')!;
    px.globalAlpha = this.plateReady ? 0.35 : 1; px.drawImage(this.plateTmp, 0, 0); px.globalAlpha = 1;
    this.plateReady = true;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.plateTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.plate);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Cut the puppet's paper from the person: skin at the nose, hair above the brow, shirt at the chest, trousers at the hips. */
  private sampleColours(canvas: HTMLCanvasElement, nowMs: number) {
    if (nowMs - this.coloursAt < 400) return;
    const t = this.tracks.find(k => k.alpha > 0.3); if (!t) return;
    this.coloursAt = nowMs;
    const W = canvas.width, H = canvas.height;
    const sw = this.swatch; sw.width = sw.height = 1;
    const sx = sw.getContext('2d', { willReadFrequently: true })!;
    const pick = (x: number, y: number, r: number): [number, number, number] | null => {
      if (x < 0 || y < 0 || x >= W || y >= H) return null;
      sx.drawImage(canvas, Math.max(0, x - r), Math.max(0, y - r), r * 2, r * 2, 0, 0, 1, 1);
      const d = sx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const ex = (t.eyes[0].x + t.eyes[1].x) / 2, ey = (t.eyes[0].y + t.eyes[1].y) / 2;
    const hr = Math.max(t.head.rx, t.head.ry), rr = Math.max(2, hr * 0.12);
    const mix = (old: string, c: [number, number, number] | null, minL?: number) => c ? css(paperTone(c, minL)) : old;
    const p = this.lastPose;
    const chest = p?.shoulderL && p.shoulderR && p.shoulderL.v > 0.5 && p.shoulderR.v > 0.5
      ? { x: (p.shoulderL.x + p.shoulderR.x) / 2, y: (p.shoulderL.y + p.shoulderR.y) / 2 + Math.abs(p.shoulderL.x - p.shoulderR.x) * 0.3 }
      : { x: t.head.x, y: t.head.y + t.head.ry * 1.9 };
    this.colours = {
      skin: mix(this.colours.skin, pick((ex + t.mouth.x) / 2, (ey + t.mouth.y) / 2, rr), 0.3),
      hair: mix(this.colours.hair, pick(t.head.x, t.head.y - t.head.ry * 0.92, rr), 0.12),
      shirt: mix(this.colours.shirt, pick(chest.x, Math.min(H - rr - 1, chest.y), rr * 2)),
      pants: this.colours.pants,
      glove: this.colours.glove,
    };
  }

  // ───────────────────────────── film / tape / handheld ─────────────────────────────
  /** Grindhouse projector events: burns, rolls, splices, changeovers, desyncs, a few seconds apart. */
  private stepGrindhouse(nowMs: number) {
    const e = this.evt;
    if (e.type && nowMs - e.start > e.dur) {
      if (e.type === 4 || e.type === 1) this.reel = [Math.random() * 0.7, Math.random(), Math.random() * 0.6, Math.random() * 10];   // next reel
      e.type = 0;
      this.nextEvtAt = nowMs + 2500 + Math.random() * 6000;
    }
    if (!this.nextEvtAt) this.nextEvtAt = nowMs + 2000;
    if (!e.type && nowMs > this.nextEvtAt) {
      const r = Math.random();
      const [type, dur] = r < 0.24 ? [2, 650] : r < 0.48 ? [3, 260] : r < 0.68 ? [5, 900] : r < 0.88 ? [4, 1100] : [1, 2600];
      Object.assign(e, { type, start: nowMs, dur, seed: Math.random() * 100 });
    }
  }

  private stepVhs(nowMs: number, dt: number) {
    const k = this.track;
    if (!k.next) k.next = nowMs + 4000 + Math.random() * 6000;
    if (nowMs > k.next) { k.until = nowMs + 700 + Math.random() * 1600; k.next = k.until + 5000 + Math.random() * 9000; k.pos = 0.95; }
    const on = nowMs < k.until ? 1 : 0;
    k.amt += (on - k.amt) * (1 - Math.exp(-dt * 6));
    k.pos -= dt * 0.25 * k.amt;                                    // the band crawls up the picture
    if (k.pos < 0.05) k.pos = 0.95;
  }

  /** Date stamp burned into the tape BEFORE the VHS pass, so it smears and wobbles with the picture. */
  private drawVhsStamp(c: CanvasRenderingContext2D, W: number, H: number, nowMs: number) {
    const d = new Date();
    const fs = Math.round(H / 15);
    c.save();
    c.font = `700 ${fs}px "VCR OSD Mono","Consolas","Courier New",monospace`;
    c.textBaseline = 'alphabetic';
    const line = (s: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
      c.textAlign = align;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(s, x + fs * 0.07, y + fs * 0.07);
      c.fillStyle = '#f4f4ee'; c.fillText(s, x, y);
    };
    if (nowMs - this.startedAt < 4500) line('PLAY ▶', W * 0.07, H * 0.12);
    const h = d.getHours(), ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
    const p2 = (n: number) => String(n).padStart(2, '0');
    line(`${ap} ${h12}:${p2(d.getMinutes())}`, W * 0.07, H * 0.86);
    line(`${MONTHS[d.getMonth()]}. ${p2(d.getDate())} ${this.vhsYear}`, W * 0.07, H * 0.86 + fs * 1.15);
    if (nowMs - this.startedAt > 4500) line('SP', W * 0.93, H * 0.12, 'right');
    c.restore();
  }

  /** The operator: springs pulled by a slow breath, by YOUR mouse (they whip after it), by clicks (a stumble),
   *  and by the action on screen (they panic, swing toward it, punch in). Calm scene + still mouse = calm camera. */
  private stepRig(dt: number, nowMs: number) {
    const r = this.rig, t = nowMs / 1000;
    this.pointer.step(dt);
    const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280, vh = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
    const mvx = this.pointer.vx / vw, mvy = this.pointer.vy / vh;         // screens / s
    const ms = Math.min(1, this.pointer.speed / Math.max(vw, vh) * 0.9);
    const clicks = this.pointer.takeClicks();
    const action = Math.min(1, this.motion.energy * 1.7), burst = this.motion.burst;
    const want = Math.min(1, action * 0.8 + ms * 0.9);
    r.panic += (want - r.panic) * (1 - Math.exp(-dt * (want > r.panic ? 6 : 0.7)));
    const P = r.panic;
    const n = (a: number, b: number) => (Math.sin(t * a + b) + Math.sin(t * a * 1.73 + b * 2.1) * 0.6) / 1.6;
    // targets: breath + tremble (grows with panic) + whip after the mouse + swing toward the action
    let tx = n(0.9, 1) * 0.006 + n(11, 3) * (0.0012 + P * 0.022) - mvx * 0.025 + (this.motion.cx - 0.5) * 0.06 * P;
    let ty = n(0.7, 5) * 0.008 + n(13, 7) * (0.0012 + P * 0.026) - mvy * 0.025 + (this.motion.cy - 0.5) * 0.05 * P;
    tx = Math.max(-0.07, Math.min(0.07, tx)); ty = Math.max(-0.07, Math.min(0.07, ty));
    const tr = n(0.5, 9) * 0.008 + n(9, 2) * P * 0.045 - mvx * 0.02;
    if (burst > 0.35 && r.punch <= 0) r.punch = 1.2;                         // sudden action: crash zoom
    r.punch = Math.max(0, r.punch - dt);
    const tz = 1.12 + n(0.15, 4) * 0.025 + (r.punch > 0 ? 0.28 : 0) + P * 0.04;
    if (clicks) {                                                           // stumble
      r.vx += (Math.random() - 0.5) * 1.6; r.vy += 0.6 + Math.random() * 1.2; r.vr += (Math.random() - 0.5) * 3;
      r.glitch = 1; r.focus = 1;
    }
    const ox = r.x, oy = r.y;
    const spring = (p: number, v: number, target: number, k: number, c: number) => { v += (k * (target - p) - c * v) * dt; return [p + v * dt, v]; };
    [r.x, r.vx] = spring(r.x, r.vx, tx, 90, 11);
    [r.y, r.vy] = spring(r.y, r.vy, ty, 90, 11);
    [r.r, r.vr] = spring(r.r, r.vr, tr, 70, 10);
    [r.z, r.vz] = spring(r.z, r.vz, tz, r.punch > 0 ? 160 : 25, r.punch > 0 ? 14 : 9);
    r.px = Math.max(-0.05, Math.min(0.05, r.x - ox)); r.py = Math.max(-0.05, Math.min(0.05, r.y - oy));
    // autofocus hunts after big moves and zoom changes, auto-exposure lags the scene
    const jolt = Math.hypot(r.px, r.py) * 40 + Math.abs(r.vz) * 0.4;
    r.focus = Math.max(r.focus * Math.exp(-dt * 1.6), Math.min(1, jolt * 0.6));
    r.focus = Math.min(1, r.focus * (0.85 + 0.15 * Math.abs(Math.sin(t * 7))));
    const expoT = Math.max(0.75, Math.min(1.8, 0.46 / Math.max(0.05, this.motion.luma)));   // AGC: lifts dark rooms into noise, never to white
    r.expo += (expoT - r.expo) * (1 - Math.exp(-dt * 1.4));
    r.glitch = Math.max(r.glitch * Math.exp(-dt * 3), P > 0.75 && Math.random() < 0.04 ? 0.6 : 0);
  }

  /** Camcorder viewfinder: blinking REC, tape counter, battery, corner brackets. Drawn after the shake — it lives on the glass. */
  private drawViewfinder(c: CanvasRenderingContext2D, W: number, H: number, nowMs: number) {
    const fs = Math.round(H / 22), m = H * 0.06;
    const el = Math.max(0, (nowMs - this.startedAt) / 1000);
    const p2 = (n: number) => String(Math.floor(n)).padStart(2, '0');
    c.save();
    c.font = `600 ${fs}px "Consolas","Courier New",monospace`;
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 2;
    c.fillStyle = 'rgba(255,255,255,0.88)'; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = Math.max(1.5, H / 360);
    if (Math.floor(nowMs / 600) % 2 === 0) { c.fillStyle = '#ff2a2a'; c.beginPath(); c.arc(m + fs * 0.4, m + fs * 0.5, fs * 0.32, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.88)';
    c.textAlign = 'left'; c.fillText('REC', m + fs, m + fs * 0.5);
    c.fillText(`SP ${p2(el / 3600)}:${p2((el / 60) % 60)}:${p2(el % 60)}`, m, H - m - fs * 0.5);
    // battery, top-right
    const bw = fs * 1.6, bh = fs * 0.75, bx = W - m - bw, by = m + fs * 0.12;
    c.strokeRect(bx, by, bw, bh); c.fillRect(bx + bw, by + bh * 0.3, bh * 0.18, bh * 0.4);
    const bars = Math.floor(nowMs / 4000) % 9 < 7 ? 2 : 1;
    for (let i = 0; i < bars; i++) c.fillRect(bx + 3 + i * (bw - 6) / 3, by + 3, (bw - 6) / 3 - 2, bh - 6);
    // corner brackets
    const L = H * 0.07, i0 = H * 0.035;
    c.beginPath();
    for (const [x, y, sx, sy] of [[i0, i0, 1, 1], [W - i0, i0, -1, 1], [i0, H - i0, 1, -1], [W - i0, H - i0, -1, -1]] as const) {
      c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y);
    }
    c.stroke();
    c.restore();
  }

  // ───────────────────────────── googly eyes ─────────────────────────────
  private startFace(blend = false) {
    // Started without expressions but the aura now needs them: rebuild the tracker with the fuller graph.
    if (blend && !this.faceBlend && (this.faceState === 'worker' || this.faceState === 'sync' || this.faceState === 'failed')) {
      this.worker.dispose(); this.worker = new AsyncFaceTracker();
      try { this.sync?.dispose(); } catch { /* */ }
      this.sync = null; this.faceState = 'idle';
    }
    if (this.faceState !== 'idle') return;
    this.faceState = 'loading';
    this.faceBlend = blend;
    const opts = { numFaces: 2, blendshapes: blend };       // landmarks only unless asked: cheaper graph on phones
    this.worker.init(opts).then(async ok => {
      if (ok) { this.faceState = 'worker'; return; }
      const s = new FaceTracker();
      if (await s.init(opts)) { this.sync = s; this.faceState = 'sync'; } else this.faceState = 'failed';
    });
  }

  private feedFaces(src: HTMLVideoElement, nowMs: number, W: number, H: number, fit: Fit) {
    if (src.readyState < 2 || !src.videoWidth) return;
    const gap = isAndroid() ? 1000 / 18 : 1000 / 30;
    let frame: FaceFrame | null = null, fresh = false;
    if (this.faceState === 'worker') {
      if (nowMs - this.lastSend >= gap) {
        this.lastTs = Math.max(this.lastTs + 1, Math.round(nowMs));
        this.worker.send(this.feed.src(src), this.lastTs);
        this.lastSend = nowMs;
      }
      const r = this.worker.poll(); fresh = r.fresh; frame = r.frame;
    } else if (this.faceState === 'sync' && this.sync && nowMs - this.lastSync >= 100) {
      this.lastTs = Math.max(this.lastTs + 1, Math.round(nowMs));
      frame = this.sync.detect(this.feed.src(src), this.lastTs);
      this.lastSync = nowMs; fresh = true;
    }
    if (!fresh) return;
    if (this.lens === 'aura') this.emotion.push(frame && Object.keys(frame.blendshapes).length ? scoreEmotions(frame.blendshapes) : null, gap / 1000);
    this.ingest(frame?.faces ?? [], src, nowMs, W, H, fit);
  }

  private ingest(faces: FaceEyes[], src: HTMLVideoElement, nowMs: number, W: number, H: number, fit: Fit) {
    const vw = src.videoWidth, vh = src.videoHeight;
    const pl = placement(W, H, vw, vh, fit);
    const used = new Set<Track>();
    for (const f of faces) {
      const eyes = f.eyes.map(e => ({
        x: e.cx * vw * pl.s + pl.ox, y: e.cy * vh * pl.s + pl.oy,
        // true eye width in canvas px, then enlarged: googly eyes are meant to be absurd
        r: Math.hypot(e.dx * vw, e.dy * vh) * pl.s * 0.95,
        gx: e.gx, gy: e.gy, open: e.open,
      }));
      const m = f.mouth, bb = f.bbox;
      const mouth = { x: m.cx * vw * pl.s + pl.ox, y: m.cy * vh * pl.s + pl.oy, w: Math.hypot(m.dx * vw, m.dy * vh) * pl.s, open: m.open };
      const head = {
        x: (bb.x + bb.w / 2) * vw * pl.s + pl.ox, y: (bb.y + bb.h / 2) * vh * pl.s + pl.oy,
        rx: (bb.w * vw * pl.s / 2) * 1.02, ry: (bb.h * vh * pl.s / 2) * 1.05,
      };
      const cx = (eyes[0].x + eyes[1].x) / 2, cy = (eyes[0].y + eyes[1].y) / 2;
      let best: Track | null = null, bd = W * 0.3;
      for (const t of this.tracks) {
        if (used.has(t)) continue;
        const d = Math.hypot(t.cx - cx, t.cy - cy);
        if (d < bd) { bd = d; best = t; }
      }
      if (!best) {
        if (this.tracks.length >= 3) continue;
        best = {
          cx, cy, seen: nowMs, alpha: 0,
          eyes: [newEye(eyes[0].x, eyes[0].y, eyes[0].r, eyes[0].gx, eyes[0].gy), newEye(eyes[1].x, eyes[1].y, eyes[1].r, eyes[1].gx, eyes[1].gy)],
          mouth: { ...mouth, tx: mouth.x, ty: mouth.y, tw: mouth.w, topen: mouth.open },
          head: { ...head, tx: head.x, ty: head.y, trx: head.rx, try_: head.ry },
        };
        this.tracks.push(best);
      }
      used.add(best);
      best.cx = cx; best.cy = cy; best.seen = nowMs;
      best.eyes.forEach((ey, i) => { ey.tx = eyes[i].x; ey.ty = eyes[i].y; ey.tr = eyes[i].r; ey.tgx = eyes[i].gx; ey.tgy = eyes[i].gy; ey.to = eyes[i].open; });
      best.mouth.tx = mouth.x; best.mouth.ty = mouth.y; best.mouth.tw = mouth.w; best.mouth.topen = mouth.open;
      best.head.tx = head.x; best.head.ty = head.y; best.head.trx = head.rx; best.head.try_ = head.ry;
    }
  }

  /** Per-frame smoothing for every tracked face (shared by all face lenses): eases the 15-30Hz
   *  detections into 30fps motion, derives eye acceleration for the pupil physics, fades/prunes tracks. */
  private stepTracks(dt: number, nowMs: number) {
    const kPos = 1 - Math.exp(-dt * 20), kMouth = 1 - Math.exp(-dt * 28);
    const keep: Track[] = [];
    for (const t of this.tracks) {
      const lost = nowMs - t.seen;
      t.alpha += ((lost < 350 ? 1 : 0) - t.alpha) * (1 - Math.exp(-dt * 10));
      if (lost > 900 && t.alpha < 0.02) continue;
      keep.push(t);
      for (const e of t.eyes) {
        const ox = e.x, oy = e.y;
        e.x += (e.tx - e.x) * kPos; e.y += (e.ty - e.y) * kPos; e.r += (e.tr - e.r) * kPos;
        e.gx += (e.tgx - e.gx) * kPos; e.gy += (e.tgy - e.gy) * kPos;
        e.o += (e.to - e.o) * kMouth;
        // frame acceleration (low-passed, clamped: tracker jitter must not fling the pupils)
        const vx = (e.x - ox) / dt, vy = (e.y - oy) / dt;
        const ax = Math.max(-1, Math.min(1, ((vx - e.vx) / dt) / (e.r * 120)));
        const ay = Math.max(-1, Math.min(1, ((vy - e.vy) / dt) / (e.r * 120)));
        e.vx = vx; e.vy = vy;
        e.ax += (ax - e.ax) * 0.35; e.ay += (ay - e.ay) * 0.35;
      }
      const m = t.mouth;
      m.x += (m.tx - m.x) * kPos; m.y += (m.ty - m.y) * kPos; m.w += (m.tw - m.w) * kPos;
      m.open += (m.topen - m.open) * kMouth;           // a mouth must snap open/shut, not glide
      const h = t.head;
      h.x += (h.tx - h.x) * kPos; h.y += (h.ty - h.y) * kPos; h.rx += (h.trx - h.rx) * kPos; h.ry += (h.try_ - h.ry) * kPos;
    }
    this.tracks = keep;
  }

  private drawGoogly(ctx: CanvasRenderingContext2D, dt: number) {
    for (const t of this.tracks) {
      if (t.alpha < 0.02) continue;
      for (const e of t.eyes) {
        // pupil dynamics in the eye's own frame: gravity, minus the frame's acceleration (inertia)
        const aX = -e.ax * 120, aY = GRAVITY - e.ay * 120;
        e.pvx += aX * dt; e.pvy += aY * dt;
        const damp = Math.exp(-DRAG * dt); e.pvx *= damp; e.pvy *= damp;
        e.px += e.pvx * dt; e.py += e.pvy * dt;
        const d = Math.hypot(e.px, e.py);
        if (d > REACH) {                                   // hit the rim: reflect with loss
          const nx = e.px / d, ny = e.py / d;
          e.px = nx * REACH; e.py = ny * REACH;
          const vn = e.pvx * nx + e.pvy * ny;
          if (vn > 0) { e.pvx -= (1 + BOUNCE) * vn * nx; e.pvy -= (1 + BOUNCE) * vn * ny; }
        }
        if (e.r < 3) continue;
        this.paintEye(ctx, e, t.alpha);
      }
    }
  }

  /** The cut-out puppets: one per tracked face (body pose drives the first). SP heads are huge — 1.3× the face. */
  private paintPuppets(c: CanvasRenderingContext2D) {
    this.tracks.filter(t => t.alpha > 0.3).slice(0, 2).forEach((t, i) => {
      const roll = Math.atan2(t.eyes[1].y - t.eyes[0].y, t.eyes[1].x - t.eyes[0].x);
      const r0 = Math.atan2(Math.sin(roll), Math.cos(roll));
      const rollUp = Math.abs(r0) > Math.PI / 2 ? r0 - Math.sign(r0) * Math.PI : r0;     // eye order may be either way round
      const [a, b] = t.eyes[0].x <= t.eyes[1].x ? [t.eyes[0], t.eyes[1]] : [t.eyes[1], t.eyes[0]];
      drawPuppet(c, {
        x: t.head.x, y: t.head.y - t.head.ry * 0.08, r: Math.max(t.head.rx, t.head.ry) * 1.3, roll: rollUp,
        eyes: [a, b].map(e => ({ x: e.x, y: e.y, gx: e.gx, gy: e.gy, open: e.o })),
        mouthOpen: t.mouth.open,
      }, i === 0 ? this.lastPose : null, this.colours, Math.min(1, t.alpha));
    });
  }

  /** Projector / limited-animation hold: true = this frame was the held one (already drawn). */
  private holdFrame(ctx: CanvasRenderingContext2D, W: number, H: number, nowMs: number): boolean {
    const h = this.hold;
    if (h.width === W && h.height === H && this.holdAt && nowMs - this.holdAt < this.holdGap) { ctx.drawImage(h, 0, 0, W, H); return true; }
    this.holdAt = nowMs; this.frameNo++;
    const base = 1000 / (HOLD_FPS[this.lens] ?? 30);
    // hand-cranked: the rate wanders 14-19fps; a worn print skips the odd frame
    this.holdGap = base * (this.lens === 'silent' ? 0.85 + Math.random() * 0.35 : this.lens === 'grindhouse' && Math.random() < 0.08 ? 2 : 1);
    return false;
  }
  private keepHold(canvas: HTMLCanvasElement, W: number, H: number) {
    const h = this.hold;
    if (h.width !== W || h.height !== H) { h.width = W; h.height = H; }
    h.getContext('2d')!.drawImage(canvas, 0, 0, W, H);
  }
  private freezeAt = -1;

  private paintEye(c: CanvasRenderingContext2D, e: Eye, alpha: number) {
    const { x, y, r } = e;
    c.save();
    c.globalAlpha = alpha;
    // soft contact shadow so the eye sits ON the face rather than floating over it
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath(); c.ellipse(x + r * 0.07, y + r * 0.13, r * 1.04, r * 1.0, 0, 0, Math.PI * 2); c.fill();
    // plastic dome
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#f4f4f2'); g.addColorStop(1, '#cfcfcc');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = Math.max(1.5, r * 0.09); c.strokeStyle = '#141414'; c.stroke();
    // pupil + fixed (screen-space) specular so it always reads as a glossy bead
    const pr = r * PUPIL, px = x + e.px * r, py = y + e.py * r;
    c.fillStyle = '#0b0b0b';
    c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.arc(px - pr * 0.32, py - pr * 0.34, pr * 0.24, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ───────────────────────────── public ─────────────────────────────
  /**
   * Rewrite `canvas` in place with the active lens. `src` is the video the frame came from (face and
   * person detection read it directly). Call once per drawn frame, after the frame is composited.
   */
  apply(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, src: HTMLVideoElement, nowMs: number, fit: Fit = 'cover') {
    if (this.lens === 'none') return;
    if (HALLOWEEN_LENS_IDS.has(this.lens)) {
      if (!this.halloweenEngine) {
        this.halloweenEngine = new HalloweenFilterEngine();
        if (this.lens === 'dimlights') {
          this.halloweenEngine.setFilter('none');
          this.halloweenEngine.setDimLights(true);
        } else {
          this.halloweenEngine.setDimLights(false);
          this.halloweenEngine.setFilter(this.lens as HalloweenFilterId);
        }
      }
      this.halloweenEngine.apply(ctx, canvas, src, nowMs);
      return;
    }
    const dt = Math.max(1 / 120, Math.min(0.1, this.lastApply ? (nowMs - this.lastApply) / 1000 : 1 / 30));
    this.lastApply = nowMs;
    ctx.globalAlpha = 1;
    const W = canvas.width, H = canvas.height;
    if (this.lens === 'googly') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      this.drawGoogly(ctx, dt);
    } else if (this.lens === 'aura') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      this.updateAura(nowMs);
      this.shade('aura', ctx, canvas, src, nowMs, fit);
      this.orbs.update(dt, nowMs);
      this.orbs.draw(ctx, W, H, nowMs);
      this.frameAspect = W / H;
    } else if (this.lens === 'bigface') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      if (this.tracks.some(t => t.alpha > 0.3)) this.shade('bigface', ctx, canvas, src, nowMs, fit);   // no face -> untouched
    } else if (this.lens === 'cardboard') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      // limited animation: re-render ~12x/s, hold the last frame in between - the jerky cut-out feel
      if (this.holdFrame(ctx, W, H, nowMs)) return;
      this.feedPose(src, W, H, fit);
      this.sampleColours(canvas, nowMs);
      this.updatePlate(src, nowMs);
      this.shade('southpark', ctx, canvas, src, nowMs, fit);
      if (!this.gl || this.tainted) return;                // shader unavailable -> leave the plain frame
      this.paintPuppets(ctx);
      this.keepHold(canvas, W, H);
    } else if (this.lens === 'silent' || this.lens === 'grindhouse') {
      if (this.lens === 'grindhouse') this.stepGrindhouse(nowMs);
      if (this.holdFrame(ctx, W, H, nowMs)) return;
      if (this.lens === 'grindhouse' && this.evt.type === 1) {       // the burn: the frame is stuck in the gate
        const fz = this.freeze;
        if (this.freezeAt !== this.evt.start || fz.width !== W || fz.height !== H) {
          fz.width = W; fz.height = H; fz.getContext('2d')!.drawImage(canvas, 0, 0, W, H); this.freezeAt = this.evt.start;
        }
        ctx.drawImage(fz, 0, 0, W, H);
      }
      this.shade(this.lens, ctx, canvas, src, nowMs, fit);
      this.keepHold(canvas, W, H);
    } else if (this.lens === 'vhs') {
      if (!this.startedAt) this.startedAt = nowMs;
      this.frameNo++;
      this.stepVhs(nowMs, dt);
      this.drawVhsStamp(ctx, W, H, nowMs);
      this.shade('vhs', ctx, canvas, src, nowMs, fit);
    } else if (this.lens === 'colorize') {
      this.motion.update(canvas);                         // its burst marks the cuts
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      this.shade('colorize', ctx, canvas, src, nowMs, fit);
    } else if (this.lens === 'foundfootage') {
      if (!this.startedAt) this.startedAt = nowMs;
      this.frameNo++;
      this.motion.update(canvas);
      this.stepRig(dt, nowMs);
      this.shade('found', ctx, canvas, src, nowMs, fit);
      if (this.gl && !this.tainted) this.drawViewfinder(ctx, W, H, nowMs);
    } else {
      // comic reads the action every frame (speed lines); the others only need it to aim Segment Anything
      if (this.lens === 'comic' || (++this.frameNo & 3) === 0) this.motion.update(canvas);
      this.shade(this.lens as ShaderLens, ctx, canvas, src, nowMs, fit);
    }
  }

  // ───────────────────────────── aura API ─────────────────────────────
  private frameAspect = 9 / 16;
  /** Fold the smoothed emotion (and a brief tint from the last collected orb) into the shader colours. */
  private updateAura(nowMs: number) {
    const st = (this.auraState = this.emotion.get());
    let a = st.a, b = st.b, amt = st.intensity;
    const lc = this.orbs.lastCollect;
    if (lc && nowMs - lc.at < 2200) {                    // collecting an orb washes its colour through your aura
      const k = (1 - (nowMs - lc.at) / 2200) * 0.7, c = EMOTIONS[lc.emo];
      a = a.map((v, i) => v + (c.a[i] - v) * k) as typeof a; b = b.map((v, i) => v + (c.b[i] - v) * k) as typeof b;
      amt = Math.min(1, amt + k * 0.6);
    }
    this.auraA = a as [number, number, number]; this.auraB = b as [number, number, number]; this.auraAmt = amt;
  }
  /** A tap on the frame (normalized 0..1). Returns true if it collected an orb. `who` = the tapper's name. */
  tap(nx: number, ny: number, who: string): boolean {
    return this.lens === 'aura' ? this.orbs.tap(nx, ny, who, this.frameAspect, performance.now()) : false;
  }
  setOrbListener(cb: ((c: Collect) => void) | undefined) { this.orbs.onCollect = cb; }
  getAuraInfo() {
    const st = this.auraState, e = EMOTIONS[st.dominant];
    return { emotion: st.dominant as EmotionId, label: e.label, icon: e.icon, intensity: st.intensity, leaderboard: this.orbs.leaderboard(5), orbsOnScreen: this.orbs.orbs.length };
  }

  dispose() {
    this.worker.dispose();
    try { this.sync?.dispose(); } catch { /* */ }
    this.halloweenEngine?.dispose();
    this.halloweenEngine = null;
    this.matte.dispose();
    this.pointer.stop();
    this.pose?.dispose(); this.pose = null; this.poseState = 'idle';
    const gl = this.gl;
    if (gl) {
      for (const t of [this.srcTex, this.maskTex, this.glyphTex, this.depthTex, this.plateTex, this.palTex, this.asciiTex]) if (t) gl.deleteTexture(t);
      for (const p of Object.values(this.progs)) if (p) gl.deleteProgram(p.prog);
      if (this.cz) { this.cz.tex.forEach(t => gl.deleteTexture(t)); this.cz.fbo.forEach(f => gl.deleteFramebuffer(f)); }
      for (const t of [this.segTex, this.matPalTex]) if (t) gl.deleteTexture(t);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl = null; this.progs = {}; this.tracks = []; this.cz = null; this.segTex = null; this.matPalTex = null;
  }
}
