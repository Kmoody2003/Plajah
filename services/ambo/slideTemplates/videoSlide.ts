// videoSlide — the live drawer behind every Video slide template.
//
// A video slide opens with the clip playing INSIDE the design (a framed well),
// then, after a settable delay, the well grows into the whole screen. When the
// clip ends it either holds its last frame and shrinks back into the well, or
// goes to black and fades back to the design.
//
//   well ──delay──▶ expanding ──▶ full ──ended──▶ ending ──▶ returning ──▶ done
//
// The pure timing (`wellState`) is separate from the media runtime so it can
// be unit-tested in node. The runtime owns one <video> per SlideHost (one per
// output window); galleries and thumbnails pass no host and get a designed
// still — no media element is ever created without a host.
//
// Audio follows VideoSource: only the host marked `audible` (Ambo's program
// window) makes sound, routed through the Ambo mixer's Video channel; every
// other window plays muted.
import { fontCss } from '../../tela/telaFonts';
import { setProgramVideoAudible } from '../audioPriority';
import { registerLiveDrawer, onHostDispose, type LiveEnv, type SlideHost } from './live';
import type { SlideObj, SlideTheme } from './types';

// ── fields → settings ───────────────────────────────────────────────────────

export type VideoEnding = 'last' | 'black';

export interface VideoSettings {
  url: string;
  /** True when the designer placed a poster IMAGE under the well. */
  poster: boolean;
  /** Seconds in the well before going full screen; 0 = start full screen; < 0 = stay in the slide. */
  delaySec: number;
  ending: VideoEnding;
  returnFadeSec: number;
  volume: number;
  muted: boolean;
  inSec: number;
  /** 0 = play to the end. */
  outSec: number;
}

const num = (s: string | undefined, d: number) => { const v = parseFloat(String(s ?? '').trim()); return Number.isFinite(v) ? v : d; };
const truthy = (s: string | undefined) => /^\s*(true|1|yes|on|muted)\b/i.test(String(s ?? ''));

export function parseVideoFields(f: Record<string, string>): VideoSettings {
  const rawDelay = String(f.delaySec ?? '').trim();
  const stay = /^(stay|never|off|no)/i.test(rawDelay);
  const delay = stay ? -1 : num(rawDelay, 2.5);
  const inSec = Math.max(0, num(f.inSec, 0));
  const out = num(f.outSec, 0);
  return {
    url: (f.videoUrl || '').trim(),
    poster: !!(f.posterUrl || '').trim(),
    delaySec: delay < 0 ? -1 : Math.min(600, delay),
    ending: /black/i.test(f.ending || '') ? 'black' : 'last',
    returnFadeSec: Math.max(0, Math.min(10, num(f.returnFadeSec, 1.2))),
    volume: Math.max(0, Math.min(1, num(f.volume, 1))),
    muted: truthy(f.muted),
    inSec,
    outSec: out > inSec ? out : 0,
  };
}

// ── pure timing ─────────────────────────────────────────────────────────────

export interface WellTiming {
  delaySec: number; ending: VideoEnding; returnFadeSec: number;
  /** Well → full-screen morph length. */
  expandSec: number;
  /** Last-frame hold before shrinking back. */
  holdSec: number;
  /** Fade to black, then the black hold, before fading to the design. */
  blackSec: number; blackHoldSec: number;
  reduced: boolean;
}

export const DEFAULT_TIMING: Omit<WellTiming, 'delaySec' | 'ending' | 'returnFadeSec' | 'reduced'> = { expandSec: .9, holdSec: .6, blackSec: .5, blackHoldSec: .35 };

export function timingFor(s: Pick<VideoSettings, 'delaySec' | 'ending' | 'returnFadeSec'>, reduced: boolean): WellTiming {
  return { ...DEFAULT_TIMING, delaySec: s.delaySec, ending: s.ending, returnFadeSec: s.returnFadeSec, reduced };
}

export type WellPhase = 'well' | 'expanding' | 'full' | 'ending' | 'returning' | 'done';

export interface WellEvents {
  /** Wall-clock second the expand began (-Infinity = started full screen), null = not yet. */
  expandAt: number | null;
  /** Wall-clock second playback ended, null = still playing. */
  endAt: number | null;
}

export interface WellState {
  phase: WellPhase;
  /** Eased morph position: 0 = in the well, 1 = full frame. */
  k: number;
  /** Black over the moving picture 0..1. */
  blackA: number;
  /** Opacity of the moving layer (picture + black) over the design 0..1. */
  layerA: number;
  /** Still needs per-frame redraws. */
  active: boolean;
}

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
export const easeInOut = (p: number) => { const q = clamp01(p); return q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2; };

/** Should the well start growing now? (media seconds since the in-point) */
export function shouldExpand(delaySec: number, mediaSec: number, playing: boolean): boolean {
  if (delaySec < 0) return false;
  if (delaySec === 0) return true;
  return playing && mediaSec >= delaySec;
}

export function wellState(tm: WellTiming, ev: WellEvents, now: number): WellState {
  const E = tm.reduced ? 0 : tm.expandSec;
  const kAt = (t: number) => ev.expandAt === null ? 0 : (E <= 0 || ev.expandAt === -Infinity) ? (t >= ev.expandAt ? 1 : 0) : easeInOut((t - ev.expandAt) / E);
  if (ev.endAt === null) {
    const k = kAt(now);
    return { phase: ev.expandAt === null ? 'well' : k < 1 ? 'expanding' : 'full', k, blackA: 0, layerA: 1, active: true };
  }
  const kEnd = kAt(ev.endAt), q = now - ev.endAt;
  if (tm.ending === 'last') {
    const R = tm.reduced ? 0 : tm.returnFadeSec;
    // Nothing to hold when the clip ended in the well.
    const p = q - (kEnd > 0 ? tm.holdSec : 0);
    if (p < 0) return { phase: 'ending', k: kEnd, blackA: 0, layerA: 1, active: true };
    if (p < R) return { phase: 'returning', k: kEnd * (1 - easeInOut(p / R)), blackA: 0, layerA: 1, active: true };
    return { phase: 'done', k: 0, blackA: 0, layerA: 1, active: false };
  }
  const B = tm.reduced ? Math.min(.25, tm.blackSec) : tm.blackSec;
  const blackA = B > 0 ? clamp01(q / B) : 1;
  const p = q - B - tm.blackHoldSec, R = tm.returnFadeSec;
  if (p < 0) return { phase: 'ending', k: kEnd, blackA, layerA: 1, active: true };
  if (p < R) return { phase: 'returning', k: kEnd, blackA: 1, layerA: 1 - easeInOut(p / R), active: true };
  return { phase: 'done', k: 0, blackA: 1, layerA: 0, active: false };
}

// ── geometry ────────────────────────────────────────────────────────────────

export interface WellRect { x: number; y: number; w: number; h: number; rx: number; rot: number }

export function lerpRect(a: WellRect, b: WellRect, k: number): WellRect {
  const l = (p: number, q: number) => p + (q - p) * k;
  return { x: l(a.x, b.x), y: l(a.y, b.y), w: l(a.w, b.w), h: l(a.h, b.h), rx: l(a.rx, b.rx), rot: l(a.rot, b.rot) };
}

/** Size of a srcW×srcH picture fitted to a box ('cover' fills, 'contain' letterboxes). */
export function fitSize(srcW: number, srcH: number, w: number, h: number, mode: 'cover' | 'contain'): { w: number; h: number } {
  if (!(srcW > 0) || !(srcH > 0)) return { w, h };
  const s = mode === 'cover' ? Math.max(w / srcW, h / srcH) : Math.min(w / srcW, h / srcH);
  return { w: srcW * s, h: srcH * s };
}

// ── media runtime (one per host) ────────────────────────────────────────────

const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const crossOriginUrl = (url: string) => {
  if (!/^https?:/i.test(url) || typeof location === 'undefined') return false;
  try { return new URL(url, location.href).origin !== location.origin; } catch { return false; }
};
const proxied = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

interface Runtime {
  v: HTMLVideoElement;
  url: string;
  mode: 'direct' | 'proxy';
  error: boolean;
  routed: boolean;
  ev: WellEvents;
  poster: HTMLCanvasElement | null;
  live: boolean;
  soundOn: boolean;
  /** Program audio was blocked by autoplay policy and fell back to muted. */
  autoplayMuted: boolean;
}

const runtimes = new Map<string, Runtime>();

/** Test / debug view of the runtime for a host. */
export function videoRuntimeState(hostId: string): { phase: WellPhase; currentTime: number; ended: boolean; error: boolean; muted: boolean; expandAt: number | null; endAt: number | null; autoplayMuted: boolean } | null {
  const rt = runtimes.get(hostId);
  if (!rt) return null;
  return { phase: lastPhase.get(hostId) ?? 'well', currentTime: rt.v.currentTime, ended: rt.ev.endAt !== null, error: rt.error, muted: rt.v.muted, expandAt: rt.ev.expandAt, endAt: rt.ev.endAt, autoplayMuted: rt.autoplayMuted };
}
const lastPhase = new Map<string, WellPhase>();

function release(hostId: string) {
  const rt = runtimes.get(hostId);
  runtimes.delete(hostId); lastPhase.delete(hostId);
  if (!rt) return;
  try { rt.v.pause(); rt.v.removeAttribute('src'); rt.v.load(); } catch { /* */ }
  if (rt.routed) void import('../amboAudioEngine').then(m => m.amboAudio.detachElement(rt.v)).catch(() => {});
  if (rt.soundOn) setProgramVideoAudible(false);
}

function runtimeFor(host: SlideHost, s: VideoSettings): Runtime | null {
  if (!s.url || typeof document === 'undefined') return null;
  let rt = runtimes.get(host.id);
  if (rt && rt.url === s.url) return rt;
  if (rt) release(host.id);
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.playsInline = true;
  v.preload = 'auto';
  v.loop = false;
  // Non-program windows are always silent (no doubled audio in the room).
  v.muted = !host.audible || s.muted;
  v.volume = host.audible ? s.volume : 0;
  const r: Runtime = { v, url: s.url, mode: 'direct', error: false, routed: false, ev: { expandAt: s.delaySec === 0 ? -Infinity : null, endAt: null }, poster: null, live: false, soundOn: false, autoplayMuted: false };
  rt = r;
  runtimes.set(host.id, r);
  onHostDispose(host.id, () => release(host.id));

  const play = () => {
    if (runtimes.get(host.id) !== r) return;
    void v.play().catch((e: any) => {
      // Autoplay policy: a program window with no gesture yet still shows the
      // picture — muted — rather than sitting frozen.
      if (e?.name === 'NotAllowedError' && !v.muted) { v.muted = true; r.autoplayMuted = true; void v.play().catch(() => {}); }
    });
  };
  v.addEventListener('loadedmetadata', () => { if (s.inSec > 0 && v.currentTime < s.inSec - .05) { try { v.currentTime = s.inSec; } catch { /* */ } } });
  v.addEventListener('ended', () => { if (r.ev.endAt === null) r.ev.endAt = nowSec(); });
  v.addEventListener('error', () => {
    if (runtimes.get(host.id) !== r) return;
    // A cross-origin host without CORS: retry through the same-origin proxy.
    if (r.mode === 'direct' && crossOriginUrl(s.url)) { r.mode = 'proxy'; v.src = proxied(s.url); v.load(); play(); return; }
    r.error = true;
  });
  const start = () => {
    if (runtimes.get(host.id) !== r) return;
    v.src = s.url + (s.inSec > 0 && !/#t=/.test(s.url) ? `#t=${s.inSec}` : '');
    play();
  };
  if (host.audible && !s.muted) {
    // Route through the Ambo mixer BEFORE playback so the room never hears an unmixed blip.
    void import('../amboAudioEngine').then(m => { r.routed = m.amboAudio.attachElement(v, 'video'); }).catch(() => {}).then(start);
  } else start();
  return r;
}

/** Advance one runtime for this frame; returns the well state. */
function tick(host: SlideHost, rt: Runtime, s: VideoSettings, tm: WellTiming): WellState {
  const v = rt.v, now = nowSec();
  if (rt.ev.endAt === null && !rt.error) {
    if (s.outSec > 0 && v.currentTime >= s.outSec) { try { v.pause(); } catch { /* */ } rt.ev.endAt = now; }
    else if (v.ended) rt.ev.endAt = now;
  }
  const playing = !v.paused && v.readyState >= 2;
  if (rt.ev.expandAt === null && rt.ev.endAt === null && !rt.error && shouldExpand(s.delaySec, v.currentTime - s.inSec, playing)) rt.ev.expandAt = now;
  // First decoded frame becomes the rest poster (shown after a Black ending).
  if (!rt.poster && v.readyState >= 2 && v.videoWidth > 0 && v.currentTime >= s.inSec - .05) {
    try {
      const sc = Math.min(1, 960 / v.videoWidth), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(v.videoWidth * sc)); c.height = Math.max(1, Math.round(v.videoHeight * sc));
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
      rt.poster = c;
    } catch { /* */ }
  }
  // An unplayable clip never takes over the screen.
  const st = rt.error ? { phase: 'well' as WellPhase, k: 0, blackA: 0, layerA: 1, active: false } : wellState(tm, rt.ev, now);
  lastPhase.set(host.id, rt.error ? 'done' : st.phase);
  if (st.active !== rt.live) { rt.live = st.active; host.requestLive(st.active); }
  // Volume follows the slide's exit so a cleared slide never cuts sound dead.
  if (host.audible && !s.muted) { const vol = s.volume * (1 - host.exitP); if (Math.abs(v.volume - vol) > .005) v.volume = vol; }
  if (host.exitP >= 1 && !v.paused) { try { v.pause(); } catch { /* */ } }
  const sound = host.audible && !v.muted && v.volume > 0 && playing && rt.ev.endAt === null;
  if (sound !== rt.soundOn) { rt.soundOn = sound; setProgramVideoAudible(sound); }
  return st;
}

// ── drawing ─────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (!rr) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

/** Enter a rect's local frame (centre origin, rotated) and clip to it. Caller restores. */
function enterRect(ctx: Ctx, r: WellRect) {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  if (r.rot) ctx.rotate(r.rot * Math.PI / 180);
  roundRect(ctx, -r.w / 2, -r.h / 2, r.w, r.h, r.rx);
  ctx.clip();
}

const hexRgb = (hex: string): [number, number, number] | null => {
  const m = (hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};
const rgba = (hex: string, a: number) => { const c = hexRgb(hex); return c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : hex; };

function playGlyph(ctx: Ctx, cx: number, cy: number, r: number, th: SlideTheme, filled = true) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = filled ? rgba(th.c.accent, .92) : 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.lineWidth = Math.max(1, r * .06); ctx.strokeStyle = filled ? 'rgba(255,255,255,0.0)' : rgba(th.c.accent, .85); ctx.stroke();
  const t = r * .42;
  ctx.beginPath(); ctx.moveTo(cx - t * .62, cy - t); ctx.lineTo(cx + t * 1.05, cy); ctx.lineTo(cx - t * .62, cy + t); ctx.closePath();
  ctx.fillStyle = filled ? (th.c.markerInk || '#111') : '#FFFFFF'; ctx.fill();
  ctx.restore();
}

function labelFont(th: SlideTheme, px: number) { return `${th.t.labelWeight || 600} ${Math.round(px)}px ${fontCss(th.t.label)}`; }

/** The designed "no video yet" / "unavailable" well. Drawn in the well's local frame. */
function drawPlaceholder(ctx: Ctx, w: number, h: number, th: SlideTheme, msg: string, u: number) {
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, rgba(th.c.accent, th.dark ? .16 : .12)); g.addColorStop(1, rgba(th.c.accent3 || th.c.accent, th.dark ? .06 : .05));
  ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
  const inset = Math.min(w, h) * .06;
  ctx.save(); ctx.setLineDash([u * .9, u * .7]); ctx.lineWidth = Math.max(1, u * .12); ctx.strokeStyle = rgba(th.c.accent, .55);
  ctx.strokeRect(-w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2); ctx.restore();
  const r = Math.min(w, h) * .11;
  playGlyph(ctx, 0, -r * .45, r, th, true);
  const px = Math.max(u * 1.1, Math.min(r * .62, u * 2.4));
  ctx.font = labelFont(th, px); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = th.c.ink;
  ctx.fillText(msg.toUpperCase(), 0, r * .9, w * .8);
}

/** A representative still for galleries: theme-graded frame, play disc, scrub bar. */
function drawStill(ctx: Ctx, w: number, h: number, th: SlideTheme, s: VideoSettings, u: number, posterUnder: boolean) {
  if (!posterUnder) {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, rgba(th.c.accent3 || th.c.accent, .9)); g.addColorStop(.55, rgba(th.c.accent2 || th.c.accent, .65)); g.addColorStop(1, '#0B0A10');
    ctx.fillStyle = '#0B0A10'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
    // Soft light + horizon so it reads as a frame of footage, not a flat card.
    const rg = ctx.createRadialGradient(w * .18, -h * .18, 0, w * .18, -h * .18, Math.max(w, h) * .55);
    rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.beginPath(); ctx.moveTo(-w / 2, h * .22);
    for (let i = 0; i <= 12; i++) { const x = -w / 2 + w * i / 12; ctx.lineTo(x, h * (.12 + .1 * Math.sin(i * 1.3) * Math.cos(i * .7))); }
    ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
    ctx.fillStyle = 'rgba(8,7,12,0.55)'; ctx.fill();
  }
  const r = Math.min(w, h) * .12;
  playGlyph(ctx, 0, 0, r, th, false);
  // Scrub bar + "auto full screen" note: what the operator should expect.
  const bw = w * .78, by = h / 2 - Math.max(u * 1.6, h * .09), bh = Math.max(2, u * .22);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-bw / 2, by, bw, bh);
  ctx.fillStyle = th.c.accent; ctx.fillRect(-bw / 2, by, bw * .32, bh);
  const note = s.delaySec < 0 ? 'Plays in the slide' : s.delaySec === 0 ? 'Opens full screen' : `Full screen after ${+s.delaySec.toFixed(1)} s`;
  const px = Math.max(u * .95, Math.min(u * 1.4, h * .06));
  ctx.font = labelFont(th, px); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,255,255,0.92)';
  if (h > px * 5) ctx.fillText(note.toUpperCase(), -bw / 2, by - px * .5, bw);
}

function drawFrameOf(ctx: Ctx, src: CanvasImageSource, sw: number, sh: number, r: WellRect, well: WellRect, full: WellRect, k: number) {
  // Picture size eases from "cover the well" to "contain the screen" (no crop at full screen).
  const a = fitSize(sw, sh, well.w, well.h, 'cover'), b = fitSize(sw, sh, full.w, full.h, 'contain');
  const w = a.w + (b.w - a.w) * k, h = a.h + (b.h - a.h) * k;
  if (k > 0) { ctx.fillStyle = `rgba(0,0,0,${clamp01(k * 1.6)})`; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); }
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
}

export const VIDEO_WELL_DRAWER = 'video.well';

export interface VideoWellProps extends VideoSettings {
  well: WellRect;
  /** Type unit of the layout (for drawn labels). */
  u: number;
}

function drawWell(ctx: Ctx, o: SlideObj, env: LiveEnv) {
  const p = o.live?.props as unknown as VideoWellProps | undefined;
  if (!p?.well) return;
  const th = env.th, well = p.well, u = p.u || Math.max(2, env.H / 68);
  const full: WellRect = { x: 0, y: 0, w: env.W, h: env.H, rx: 0, rot: 0 };
  const host = env.host;

  // Gallery / thumbnail / no clip yet: a designed still, never a media element.
  const rt = host ? runtimeFor(host, p) : null;
  if (!rt) {
    enterRect(ctx, well);
    if (!p.url) { if (!p.poster) drawPlaceholder(ctx, well.w, well.h, th, 'Add a video', u); else playGlyph(ctx, 0, 0, Math.min(well.w, well.h) * .12, th, false); }
    else drawStill(ctx, well.w, well.h, th, p, u, p.poster);
    ctx.restore();
    return;
  }
  const tm = timingFor(p, env.reduced);
  const st = tick(host!, rt, p, tm);
  const v = rt.v, hasFrame = v.readyState >= 2 && v.videoWidth > 0;

  if (rt.error) {
    enterRect(ctx, well);
    if (!p.poster) drawPlaceholder(ctx, well.w, well.h, th, 'Video unavailable', u);
    ctx.restore();
    return;
  }

  // 1) The well at rest, visible whenever the moving layer is translucent.
  if (st.layerA < 1) {
    enterRect(ctx, well);
    const rest: CanvasImageSource | null = p.ending === 'black' ? rt.poster : (hasFrame ? v : rt.poster);
    if (rest) {
      const sw = rest === v ? v.videoWidth : (rest as HTMLCanvasElement).width, sh = rest === v ? v.videoHeight : (rest as HTMLCanvasElement).height;
      drawFrameOf(ctx, rest, sw, sh, well, well, full, 0);
      if (st.phase === 'done' || st.phase === 'returning') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-well.w / 2, -well.h / 2, well.w, well.h); playGlyph(ctx, 0, 0, Math.min(well.w, well.h) * .1, th, false); }
    } else if (!p.poster) drawPlaceholder(ctx, well.w, well.h, th, 'Video', u);
    ctx.restore();
  }

  // 2) The moving layer: morphing rect with the picture (and black) inside.
  if (st.layerA > 0) {
    const r = lerpRect(well, full, st.k);
    ctx.save();
    ctx.globalAlpha *= st.layerA;
    enterRect(ctx, r);
    if (hasFrame) drawFrameOf(ctx, v, v.videoWidth, v.videoHeight, r, well, full, st.k);
    else {
      // Buffering: poster if we have one, else a quiet dark screen with a breathing glyph.
      if (!p.poster || st.k > 0) { ctx.fillStyle = '#060509'; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); }
      const pulse = env.reduced ? .8 : .6 + .4 * Math.sin(env.t * 3);
      ctx.save(); ctx.globalAlpha *= pulse; playGlyph(ctx, 0, 0, Math.min(r.w, r.h) * .08, th, false); ctx.restore();
    }
    if (st.blackA > 0) { ctx.fillStyle = `rgba(0,0,0,${st.blackA})`; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); }
    ctx.restore();
    ctx.restore();
  }
}

registerLiveDrawer(VIDEO_WELL_DRAWER, drawWell);
