// photoDrawers — live drawers for the Photo slide templates, plus the offline
// sample "photographs" they ship with.
//
//   photo.well   one framed photo: the theme's frame language (mat, polaroid,
//                tape, sticker, hard-shadow pop, neon glow, clean edge), a slow
//                Ken Burns drift or a print "settle", and a staggered reveal
//   photo.wall   a full wall of photos in lanes that pan slowly, alternating
//                direction, wrapping seamlessly
//
// Cost model: every photo is decoded/painted ONCE into a bitmap at the size it
// is drawn (with the theme's photo treatment — mono, duotone, scanlines —
// baked in), and every frame / shadow is baked once into a sprite. A frame is
// then a handful of drawImage calls; nothing big is allocated per frame.
// Drawers draw a sensible still when there is no host (gallery thumbnails) and
// hold still under reduced motion.
import { registerLiveDrawer, type LiveEnv } from './live';
import type { SlideObj, SlideTheme } from './types';

type Ctx = CanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2 = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const TAU = Math.PI * 2;
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const outBack = (p: number) => { const c = 1.4, q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };

// ── photo references ────────────────────────────────────────────────────────
/** A photo: a real URL, or one of the built-in procedural samples. */
export interface PhotoRef { src: string; sample?: number }

export const SAMPLE_COUNT = 24;
/** `sample:N` tokens are the offline placeholder photographs. */
export const sampleToken = (n: number) => `sample:${((n - 1) % SAMPLE_COUNT + SAMPLE_COUNT) % SAMPLE_COUNT + 1}`;

/** Parse one field line into a photo (or null when it is not an image link). */
export function resolvePhotoRef(line: string): PhotoRef | null {
  const s = (line || '').trim();
  if (!s) return null;
  const m = s.match(/^sample:(\d{1,3})$/i);
  if (m) { const n = ((+m[1] - 1) % SAMPLE_COUNT + SAMPLE_COUNT) % SAMPLE_COUNT + 1; return { src: sampleSvgUri(n), sample: n }; }
  if (/^data:image\//i.test(s)) return { src: s };
  if (/\s/.test(s)) return null;
  if (/^(https?:|blob:|\/|\.\.?\/)/i.test(s)) return { src: s };
  return null;
}

// ── sample photographs (procedural, offline, no copyright) ──────────────────
// A scene is a tiny display list in a 1500×1000 artboard, painted either to a
// canvas (crisp, synchronous — drawers) or to an SVG data URI (sourceImageSrc
// for anything that draws IMAGE objects without the live drawers).
const AW = 1500, AH = 1000;
type Shape =
  | { k: 'grad'; p: number[]; y0: number; y1: number; c: Array<[number, string]>; a?: number }
  | { k: 'glow'; x: number; y: number; rx: number; ry: number; c: string; a: number }
  | { k: 'fill'; p: number[]; c: string; a?: number }
  | { k: 'disc'; x: number; y: number; r: number; c: string; a?: number };

interface Pal { sky: [string, string, string]; sun: string; far: string; near: string; water?: string; night?: boolean }
const PALS: Pal[] = [
  { sky: ['#2B3A67', '#C9806B', '#F7CF9B'], sun: '#FFF3D6', far: '#9C7C8E', near: '#2A2340' },           // 0 dawn
  { sky: ['#3F6EA8', '#E8B26A', '#FCE6B2'], sun: '#FFF6DC', far: '#B98C66', near: '#3B2A22' },           // 1 golden hour
  { sky: ['#1E1A3C', '#7A4A92', '#F08A68'], sun: '#FFD9B0', far: '#6B4A7A', near: '#1A1328' },           // 2 dusk violet
  { sky: ['#2F78D6', '#86C1F0', '#E4F3FC'], sun: '#FFFFFF', far: '#7FA6B8', near: '#2F5D3A' },           // 3 clear noon
  { sky: ['#123F48', '#4F8A8B', '#D2E6DA'], sun: '#F4FBF6', far: '#6F9C97', near: '#173A36' },           // 4 teal mist
  { sky: ['#060A1C', '#17204A', '#3A4878'], sun: '#F2F0E6', far: '#2C3863', near: '#0B1024', night: true }, // 5 night
  { sky: ['#5F3768', '#DB7A8E', '#FFD8C2'], sun: '#FFF1E6', far: '#B0748A', near: '#3A2238' },           // 6 rose
  { sky: ['#1E5F74', '#7FB7A8', '#F2E6C9'], sun: '#FFFBEF', far: '#5E9488', near: '#20443F', water: '#2D7184' }, // 7 sea green
];

function rngOf(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hexMix(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/** Ridge polygon from x=0..AW, closed to the bottom. */
function ridge(r: () => number, base: number, amp: number, rough: number, steps = 40, sharp = false): number[] {
  const pts: number[] = [];
  const f1 = .6 + r() * 1.4, f2 = 2 + r() * 3, f3 = 6 + r() * 6, p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  for (let i = 0; i <= steps; i++) {
    const x = AW * i / steps, u = i / steps;
    let n = Math.sin(u * TAU * f1 / 2 + p1) * .55 + Math.sin(u * TAU * f2 / 2 + p2) * .3 * rough + Math.sin(u * TAU * f3 / 2 + p3) * .15 * rough;
    if (sharp) n = 1 - Math.abs(n) * 1.6;
    pts.push(x, base - n * amp);
  }
  pts.push(AW, AH + 2, 0, AH + 2);
  return pts;
}

type SceneKind = 'mountains' | 'hills' | 'coast' | 'dunes' | 'forest' | 'city' | 'worship' | 'meadow';
const SAMPLES: Array<[SceneKind, number]> = [
  ['mountains', 0], ['coast', 7], ['worship', 2], ['hills', 1], ['forest', 4], ['city', 2], ['meadow', 3], ['dunes', 1],
  ['mountains', 5], ['hills', 6], ['coast', 1], ['worship', 6], ['forest', 0], ['meadow', 1], ['city', 5], ['mountains', 3],
  ['dunes', 2], ['coast', 0], ['hills', 4], ['worship', 5], ['forest', 6], ['meadow', 7], ['mountains', 6], ['coast', 3],
];

const sceneCache = new Map<number, Shape[]>();
function scene(n: number): Shape[] {
  const hit = sceneCache.get(n); if (hit) return hit;
  const [kind, pi] = SAMPLES[(n - 1) % SAMPLES.length];
  const P = PALS[pi], r = rngOf(n * 97 + 13), out: Shape[] = [];
  const full = [0, 0, AW, 0, AW, AH, 0, AH];
  const horizon = kind === 'worship' ? AH : AH * (.52 + r() * .14);
  out.push({ k: 'grad', p: full, y0: 0, y1: horizon, c: [[0, P.sky[0]], [.62, P.sky[1]], [1, P.sky[2]]] });
  const sx = AW * (.2 + r() * .6), sy = horizon - AH * (.08 + r() * .2), sr = AH * (.045 + r() * .03);
  const sunny = kind !== 'worship';
  if (sunny) {
    out.push({ k: 'glow', x: sx, y: sy, rx: AW * .5, ry: AH * .42, c: P.sun, a: P.night ? .16 : .5 });
    out.push({ k: 'disc', x: sx, y: sy, r: sr, c: P.sun, a: P.night ? .95 : .92 });
  }
  if (P.night || kind === 'city') for (let i = 0; i < 70; i++) out.push({ k: 'disc', x: r() * AW, y: r() * horizon * .75, r: .8 + r() * 2.2, c: '#FFFFFF', a: .25 + r() * .6 });
  const layers = (k: number, base: number, amp: number, rough: number, sharp: boolean) => {
    for (let i = 0; i < k; i++) {
      const t = (i + 1) / k;
      out.push({ k: 'fill', p: ridge(r, base + (AH - base) * t * .55, amp * (1 - t * .45), rough, 48, sharp && i < k - 1), c: hexMix(P.sky[2], P.near, .25 + t * .75) });
    }
  };
  switch (kind) {
    case 'mountains': {
      layers(3, horizon - AH * .02, AH * .2, .9, true);
      const wy = horizon + AH * .2;
      out.push({ k: 'grad', p: [0, wy, AW, wy, AW, AH, 0, AH], y0: wy, y1: AH, c: [[0, hexMix(P.sky[2], P.near, .35)], [1, P.near]] });
      out.push({ k: 'glow', x: sx, y: wy + AH * .08, rx: AW * .08, ry: AH * .2, c: P.sun, a: .35 });
      for (let i = 0; i < 9; i++) { const y = wy + AH * .03 + i * AH * .025, w = AW * (.03 + r() * .07), x = sx - w / 2 + (r() - .5) * AW * .05; out.push({ k: 'fill', p: [x, y, x + w, y, x + w, y + 2.5, x, y + 2.5], c: P.sun, a: .4 }); }
      break;
    }
    case 'hills': {
      for (let i = 0; i < 4; i++) { const t = (i + 1) / 4; out.push({ k: 'fill', p: ridge(r, horizon + AH * .06 + AH * .2 * t, AH * .06, .35, 32), c: hexMix(hexMix(P.sky[2], P.far, .5), P.near, t * .9) }); }
      const tx = AW * (.12 + r() * .25), ty = horizon + AH * .22;
      out.push({ k: 'fill', p: [tx - 7, ty, tx + 7, ty, tx + 5, ty - 90, tx - 5, ty - 90], c: P.near });
      for (let i = 0; i < 7; i++) out.push({ k: 'disc', x: tx + (r() - .5) * 120, y: ty - 120 - r() * 70, r: 38 + r() * 30, c: hexMix(P.near, P.far, .1) });
      break;
    }
    case 'coast': {
      const wy = horizon;
      out.push({ k: 'grad', p: [0, wy, AW, wy, AW, AH, 0, AH], y0: wy, y1: AH, c: [[0, hexMix(P.sky[2], P.water || P.far, .45)], [1, hexMix(P.water || P.far, P.near, .5)]] });
      out.push({ k: 'glow', x: sx, y: wy + AH * .1, rx: AW * .07, ry: AH * .25, c: P.sun, a: .4 });
      for (let i = 0; i < 16; i++) { const y = wy + 8 + i * i * 1.6, w = AW * (.02 + r() * .06), x = sx - w / 2 + (r() - .5) * AW * .12; out.push({ k: 'fill', p: [x, y, x + w, y, x + w, y + 2 + i * .25, x, y + 2 + i * .25], c: P.sun, a: .35 }); }
      const left = r() < .5, pts: number[] = [];
      for (let i = 0; i <= 20; i++) { const u = i / 20, x = left ? u * AW * .42 : AW - u * AW * .42; pts.push(x, wy - (1 - u) * AH * .18 * (.8 + .2 * Math.sin(u * 9)) + u * AH * .02); }
      pts.push(left ? 0 : AW, wy + AH * .02);
      out.push({ k: 'fill', p: pts, c: hexMix(P.far, P.near, .55) });
      out.push({ k: 'fill', p: [0, AH * .9, AW, AH * .88, AW, AH, 0, AH], c: hexMix(P.sky[2], '#E9D9B8', .5), a: .9 });
      break;
    }
    case 'dunes': {
      for (let i = 0; i < 4; i++) {
        const t = (i + 1) / 4, base = horizon + AH * .05 + t * AH * .22;
        const pts = ridge(r, base, AH * .07, .2, 36);
        out.push({ k: 'grad', p: pts, y0: base - AH * .1, y1: AH, c: [[0, hexMix('#F4C98A', P.sky[1], .35 - t * .2)], [1, hexMix('#A8643A', P.near, t * .55)]] });
      }
      break;
    }
    case 'forest': {
      layers(2, horizon, AH * .1, .6, false);
      for (let L = 0; L < 3; L++) {
        const t = (L + 1) / 3, base = horizon + AH * (.08 + t * .24), col = hexMix(hexMix(P.sky[2], P.far, .4), P.near, .35 + t * .65);
        for (let x = -20; x < AW + 40; x += 26 + r() * 30 - t * 8) {
          const h = (60 + r() * 90) * (.6 + t), w = h * (.32 + r() * .1);
          out.push({ k: 'fill', p: [x, base - h, x + w / 2, base + 4, x - w / 2, base + 4], c: col });
        }
        out.push({ k: 'fill', p: [0, base, AW, base, AW, AH, 0, AH], c: col });
      }
      out.push({ k: 'glow', x: AW / 2, y: horizon + AH * .1, rx: AW * .7, ry: AH * .12, c: P.sky[2], a: .35 });
      break;
    }
    case 'city': {
      const base = AH * .86;
      for (let L = 0; L < 2; L++) {
        const col = L ? P.near : hexMix(P.far, P.near, .4);
        for (let x = -10; x < AW; ) {
          const w = 50 + r() * 90, h = AH * (.12 + r() * (L ? .3 : .4)) * (L ? .9 : 1.1);
          out.push({ k: 'fill', p: [x, base - h, x + w, base - h, x + w, AH, x, AH], c: col });
          if (r() < .12) { const cx = x + w / 2; out.push({ k: 'fill', p: [cx - 10, base - h, cx, base - h - 120, cx + 10, base - h], c: col }); }
          if (L) for (let i = 0; i < 3; i++) { const wx = x + 8 + r() * (w - 20), wy = base - h + 14 + r() * (h - 30); out.push({ k: 'fill', p: [wx, wy, wx + 7, wy, wx + 7, wy + 9, wx, wy + 9], c: '#FFD98A', a: .55 + r() * .4 }); }
          x += w + (L ? 4 : 10);
        }
      }
      out.push({ k: 'grad', p: [0, base, AW, base, AW, AH, 0, AH], y0: base, y1: AH, c: [[0, P.near], [1, hexMix(P.near, '#000000', .5)]] });
      break;
    }
    case 'worship': {
      out.length = 0;
      out.push({ k: 'grad', p: full, y0: 0, y1: AH, c: [[0, hexMix(P.near, '#000000', .45)], [.6, hexMix(P.sky[0], P.near, .3)], [1, P.near]] });
      for (let i = 0; i < 6; i++) {
        const x = AW * (.1 + i * .16 + (r() - .5) * .05), spread = AW * (.1 + r() * .08), col = [P.sky[1], P.sky[2], P.sun][i % 3];
        out.push({ k: 'grad', p: [x - 12, -10, x + 12, -10, x + spread, AH * .82, x - spread, AH * .82], y0: 0, y1: AH * .82, c: [[0, col], [1, col]], a: .16 + r() * .1 });
      }
      out.push({ k: 'glow', x: AW / 2, y: AH * .6, rx: AW * .6, ry: AH * .3, c: P.sky[2], a: .38 });
      // A crowd in silhouette, some hands raised.
      for (let row = 0; row < 2; row++) {
        const base = AH * (row ? 1.02 : .9), s = row ? 1.25 : .95, col = row ? hexMix(P.near, '#000000', .55) : hexMix(P.near, '#000000', .25);
        for (let x = -30; x < AW + 40; x += (58 + r() * 30) * s) {
          const hy = base - (150 + r() * 40) * s, hr = (22 + r() * 6) * s;
          out.push({ k: 'disc', x, y: hy, r: hr, c: col });
          out.push({ k: 'fill', p: [x - hr * 2.2, AH + 5, x - hr * 1.9, hy + hr * 1.6, x - hr * .6, hy + hr * 1.1, x + hr * .6, hy + hr * 1.1, x + hr * 1.9, hy + hr * 1.6, x + hr * 2.2, AH + 5], c: col });
          if (r() < .3) { const side = r() < .5 ? -1 : 1, ax = x + side * hr * 1.5, top = hy - hr * (3.2 + r() * 1.5); out.push({ k: 'fill', p: [ax - hr * .3, hy + hr * 1.4, ax + hr * .3, hy + hr * 1.4, ax + side * hr * .9 + hr * .3, top, ax + side * hr * .9 - hr * .3, top], c: col }); }
        }
      }
      break;
    }
    case 'meadow': {
      out.push({ k: 'fill', p: ridge(r, horizon + AH * .02, AH * .04, .3, 30), c: hexMix(P.sky[2], P.far, .6) });
      const gy = horizon + AH * .08;
      out.push({ k: 'grad', p: [0, gy, AW, gy - 10, AW, AH, 0, AH], y0: gy, y1: AH, c: [[0, '#8DBF5A'], [1, '#2E6B33']] });
      const flowers = ['#FFFFFF', '#F7D154', '#F28CA6', '#B58CF2'];
      for (let i = 0; i < 90; i++) { const y = gy + 20 + Math.pow(r(), 1.4) * (AH - gy - 20); out.push({ k: 'disc', x: r() * AW, y, r: 2 + (y - gy) / (AH - gy) * 7, c: flowers[i % 4], a: .85 }); }
      const tx = AW * (.65 + r() * .2), ty = gy + AH * .05;
      out.push({ k: 'fill', p: [tx - 9, ty, tx + 9, ty, tx + 6, ty - 140, tx - 6, ty - 140], c: '#3B2A1E' });
      for (let i = 0; i < 9; i++) out.push({ k: 'disc', x: tx + (r() - .5) * 170, y: ty - 170 - r() * 100, r: 45 + r() * 35, c: hexMix('#2F6B34', '#1C3F22', r()) });
      break;
    }
  }
  // Gentle lens vignette.
  out.push({ k: 'glow', x: AW / 2, y: AH / 2, rx: AW * .9, ry: AH * .9, c: '#000000', a: 0 });
  sceneCache.set(n, out);
  return out;
}

function paintScene(c: Ctx2, n: number): void {
  for (const s of scene(n)) {
    c.globalAlpha = 1;
    if (s.k === 'glow') {
      if (s.a <= 0) continue;
      c.save(); c.translate(s.x, s.y); c.scale(s.rx, s.ry);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgbaHex(s.c, s.a)); g.addColorStop(.5, rgbaHex(s.c, s.a * .35)); g.addColorStop(1, rgbaHex(s.c, 0));
      c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
      continue;
    }
    if (s.k === 'disc') { c.globalAlpha = s.a ?? 1; c.fillStyle = s.c; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); continue; }
    c.globalAlpha = s.a ?? 1;
    if (s.k === 'grad') { const g = c.createLinearGradient(0, s.y0, 0, s.y1); for (const [o, col] of s.c) g.addColorStop(o, col); c.fillStyle = g; }
    else c.fillStyle = s.c;
    c.beginPath(); c.moveTo(s.p[0], s.p[1]); for (let i = 2; i < s.p.length; i += 2) c.lineTo(s.p[i], s.p[i + 1]); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;
  // Vignette (cheap, once per bake).
  const v = c.createRadialGradient(AW / 2, AH * .48, AH * .35, AW / 2, AH * .48, AW * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
  c.fillStyle = v; c.fillRect(0, 0, AW, AH);
}

function rgbaHex(hex: string, a: number): string {
  const m = hex.replace('#', '');
  return `rgba(${parseInt(m.slice(0, 2), 16)},${parseInt(m.slice(2, 4), 16)},${parseInt(m.slice(4, 6), 16)},${a})`;
}

const svgCache = new Map<number, string>();
/** The sample as an SVG data URI (for renderers that draw IMAGE objects directly). */
export function sampleSvgUri(n: number): string {
  const hit = svgCache.get(n); if (hit) return hit;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  let defs = '', body = '', id = 0;
  for (const s of scene(n)) {
    if (s.k === 'glow') {
      if (s.a <= 0) continue;
      const g = `g${id++}`;
      defs += `<radialGradient id="${g}"><stop offset="0" stop-color="${s.c}" stop-opacity="${s.a}"/><stop offset=".5" stop-color="${s.c}" stop-opacity="${r1(s.a * .35 * 100) / 100}"/><stop offset="1" stop-color="${s.c}" stop-opacity="0"/></radialGradient>`;
      body += `<ellipse cx="${r1(s.x)}" cy="${r1(s.y)}" rx="${r1(s.rx)}" ry="${r1(s.ry)}" fill="url(#${g})"/>`;
    } else if (s.k === 'disc') body += `<circle cx="${r1(s.x)}" cy="${r1(s.y)}" r="${r1(s.r)}" fill="${s.c}"${s.a !== undefined ? ` fill-opacity="${r1(s.a * 100) / 100}"` : ''}/>`;
    else {
      let fill = s.c as string;
      if (s.k === 'grad') {
        const g = `g${id++}`;
        defs += `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="${r1(s.y0)}" x2="0" y2="${r1(s.y1)}">${s.c.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
        fill = `url(#${g})`;
      }
      let d = `M${r1(s.p[0])} ${r1(s.p[1])}`; for (let i = 2; i < s.p.length; i += 2) d += `L${r1(s.p[i])} ${r1(s.p[i + 1])}`;
      body += `<path d="${d}Z" fill="${fill}"${s.a !== undefined ? ` fill-opacity="${r1(s.a * 100) / 100}"` : ''}/>`;
    }
  }
  defs += '<radialGradient id="vg" cx=".5" cy=".48" r=".75"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>';
  body += `<rect width="${AW}" height="${AH}" fill="url(#vg)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${AW} ${AH}" width="${AW}" height="${AH}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  svgCache.set(n, uri);
  return uri;
}

// ── theme language ──────────────────────────────────────────────────────────
/** How a theme frames a photograph. */
export type FrameStyle = 'mat' | 'polaroid' | 'tape' | 'sticker' | 'pop' | 'glow' | 'clean';
const STYLE_BY_THEME: Record<string, FrameStyle> = {
  sanctuary: 'mat', minimal: 'clean', youth: 'polaroid', editorial: 'mat', night: 'glow', candlelight: 'mat', airy: 'mat',
  bauhaus: 'pop', swiss: 'clean', destijl: 'pop', neodeco: 'mat', memphis: 'pop', brutalist: 'pop', deconstruct: 'tape', riso: 'polaroid',
  suprematist: 'clean', constructivist: 'clean', glass: 'sticker', kinetic: 'clean',
  cutpaper: 'sticker', atomic: 'mat', terrazzo: 'mat', truchet: 'clean', colorfield: 'clean', mesh: 'glow', spotlight: 'mat', ribbon: 'mat',
  quiet: 'clean', gengrid: 'clean', datapoem: 'clean', monoblue: 'clean',
  zine: 'tape', stencil: 'clean', wheatpaste: 'tape', ducttape: 'tape', chalk: 'polaroid', stickers: 'sticker', halftone: 'tape',
  vhs: 'glow', neonbrick: 'glow', nightcity: 'glow', concrete: 'clean', misprint: 'polaroid',
};
export function frameStyle(th: SlideTheme): FrameStyle {
  const s = STYLE_BY_THEME[th.id];
  if (s) return s;
  if (th.slot.tilt) return 'polaroid';
  if (th.dark && th.slot.rx > 0) return 'glow';
  return th.slot.rx > .2 ? 'mat' : 'clean';
}
/** Hand-made themes scatter their prints; ordered themes keep them square. */
export const looseThemes = (th: SlideTheme) => !!th.slot.tilt || ['polaroid', 'tape', 'sticker'].includes(frameStyle(th));

/** Frame extents around a photo of w×h (px), per side. */
export function framePad(style: FrameStyle, w: number, h: number, u: number, compact = false): { l: number; t: number; r: number; b: number } {
  const m = Math.min(w, h), k = compact ? .6 : 1;
  switch (style) {
    case 'mat': { const p = Math.max(u * .55, m * .045) * k; return { l: p, t: p, r: p, b: p }; }
    case 'polaroid': { const p = Math.max(u * .4, m * .05) * k; return { l: p, t: p, r: p, b: p * (compact ? 2 : 3.4) }; }
    case 'sticker': { const p = Math.max(u * .35, m * .035) * k; return { l: p, t: p, r: p, b: p }; }
    case 'tape': { const p = Math.max(u * .25, m * .028) * k; return { l: p, t: p, r: p, b: p }; }
    case 'pop': { const o = Math.max(u * .35, m * .04) * k, s = Math.max(1, u * .2); return { l: s, t: s, r: s + o, b: s + o }; }
    case 'glow': { const s = Math.max(1, u * .2); return { l: s, t: s, r: s, b: s }; }
    default: return { l: 0, t: 0, r: 0, b: 0 };
  }
}

interface Treatment { key: string; filter?: string; duo?: [string, string]; tint?: [string, number, GlobalCompositeOperation]; scan?: boolean }
function treatmentOf(th: SlideTheme): Treatment {
  const c = th.c;
  switch (th.id) {
    case 'zine': case 'halftone': return { key: 'mono', filter: 'grayscale(1) contrast(1.2) brightness(.96)', tint: [c.ground, .9, 'multiply'] };
    case 'stencil': case 'brutalist': return { key: 'mono-hard', filter: 'grayscale(1) contrast(1.22) brightness(.9)' };
    case 'wheatpaste': return { key: 'paste', filter: 'sepia(.35) contrast(1.12) saturate(.85)', tint: [c.ground, .55, 'multiply'] };
    case 'ducttape': case 'concrete': return { key: 'aged', filter: 'sepia(.18) saturate(.8) contrast(1.06)' };
    case 'chalk': return { key: 'chalk', filter: 'grayscale(.55) contrast(1.08)' };
    case 'riso': case 'misprint': return { key: 'duo-' + th.id, duo: [c.accent2 || c.ink, c.ground] };
    case 'monoblue': return { key: 'duo-blue', duo: [c.ground, c.ink] };
    case 'kinetic': return { key: 'mono-k', filter: 'grayscale(1) contrast(1.25)' };
    case 'candlelight': return { key: 'warm', filter: 'sepia(.3) saturate(1.1) brightness(.94)' };
    case 'sanctuary': case 'editorial': case 'neodeco': return { key: 'soft-warm', filter: 'sepia(.12) saturate(.95)' };
    case 'vhs': return { key: 'vhs', filter: 'saturate(1.35) contrast(1.1)', scan: true };
    case 'nightcity': case 'neonbrick': return { key: 'night', filter: 'saturate(1.2) contrast(1.06)', tint: [c.accent, .1, 'soft-light'] };
    case 'quiet': case 'airy': return { key: 'airy', filter: 'saturate(.78) brightness(1.04)' };
    default: return { key: 'none' };
  }
}

// ── bitmaps (LRU by pixel budget) ───────────────────────────────────────────
function makeCanvas(w: number, h: number): AnyCanvas | null {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}
const ctx2 = (c: AnyCanvas) => c.getContext('2d') as Ctx2 | null;

const BUDGET = 28e6; // px (~110 MB)
const bitmaps = new Map<string, { c: AnyCanvas; px: number }>();
let used = 0;
function cacheGet(key: string): AnyCanvas | undefined {
  const e = bitmaps.get(key); if (!e) return undefined;
  bitmaps.delete(key); bitmaps.set(key, e); return e.c;
}
function cachePut(key: string, c: AnyCanvas): AnyCanvas {
  const px = c.width * c.height;
  bitmaps.set(key, { c, px }); used += px;
  for (const [k, e] of bitmaps) { if (used <= BUDGET || k === key) break; bitmaps.delete(k); used -= e.px; }
  return c;
}

const images = new Map<string, HTMLImageElement>();
function imageFor(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !src) return null;
  let img = images.get(src);
  if (!img) {
    img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = src;
    if (images.size > 200) images.clear();
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * The photo cover-cropped to exactly w×h px (rounded), theme treatment baked in.
 * `focus` biases the crop (0..1 in each axis). Null while a URL is loading.
 */
export function photoBitmap(p: PhotoRef, w: number, h: number, th: SlideTheme, focusY = .5): AnyCanvas | null {
  const bw = Math.max(2, Math.min(2400, Math.round(w))), bh = Math.max(2, Math.min(2400, Math.round(h)));
  const tr = treatmentOf(th);
  const key = `${p.sample ? 's' + p.sample : p.src.length > 200 ? p.src.slice(0, 80) + p.src.length + p.src.slice(-60) : p.src}|${bw}x${bh}|${tr.key}|${focusY}`;
  const hit = cacheGet(key); if (hit) return hit;
  let sw: number, sh: number, draw: (c: Ctx2) => void;
  if (p.sample) {
    sw = AW; sh = AH;
    draw = c => paintScene(c, p.sample!);
  } else {
    const img = imageFor(p.src); if (!img) return null;
    sw = img.naturalWidth; sh = img.naturalHeight;
    draw = c => c.drawImage(img, 0, 0);
  }
  const s = Math.max(bw / sw, bh / sh), cw = bw / s, ch = bh / s;
  const ox = (sw - cw) / 2, oy = (sh - ch) * focusY;
  const out = makeCanvas(bw, bh); if (!out) return null;
  const c = ctx2(out); if (!c) return null;
  const filtered = !!(tr.filter && 'filter' in c);
  let src: AnyCanvas = out;
  if (filtered || tr.duo) { const tmp = makeCanvas(bw, bh); if (tmp) src = tmp; }
  const sc = ctx2(src)!;
  sc.save(); sc.scale(s, s); sc.translate(-ox, -oy); draw(sc); sc.restore();
  if (src !== out) {
    if (tr.duo) c.filter = 'grayscale(1) contrast(1.15)';
    else if (filtered) c.filter = tr.filter!;
    c.drawImage(src as CanvasImageSource, 0, 0);
    c.filter = 'none';
  }
  if (tr.duo) {
    c.globalCompositeOperation = 'multiply'; c.fillStyle = tr.duo[1]; c.fillRect(0, 0, bw, bh);
    c.globalCompositeOperation = 'screen'; c.fillStyle = tr.duo[0]; c.fillRect(0, 0, bw, bh);
  }
  if (tr.tint) { c.globalCompositeOperation = tr.tint[2]; c.globalAlpha = tr.tint[1]; c.fillStyle = tr.tint[0]; c.fillRect(0, 0, bw, bh); c.globalAlpha = 1; }
  if (tr.scan) { c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgba(0,0,0,0.22)'; const g = Math.max(2, Math.round(bh / 180)); for (let y = 0; y < bh; y += g * 2) c.fillRect(0, y, bw, g); }
  c.globalCompositeOperation = 'source-over';
  return cachePut(key, out);
}

// ── frame sprites (border + shadow, baked once) ─────────────────────────────
function roundRect(c: Ctx2, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (!rr) { c.rect(x, y, w, h); return; }
  c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath();
}

interface FrameSpec { style: FrameStyle; w: number; h: number; u: number; rx: number; compact: boolean; seed: number; i: number }

/** Paper / border colour for a frame on this theme. */
function paperOf(th: SlideTheme, style: FrameStyle): string {
  if (style === 'mat') return th.dark ? hexMix(th.c.ground, '#FFFFFF', .07) : (th.c.ground.toUpperCase() === '#FFFFFF' ? '#F6F4F0' : '#FFFFFF');
  if (style === 'polaroid') return '#FBF9F4';
  if (style === 'tape') return th.dark ? '#ECE8DE' : '#FFFFFF';
  return '#FFFFFF';
}
const POP_COLORS = (th: SlideTheme) => [th.c.accent, th.c.accent2, th.c.accent3];

function frameSprite(th: SlideTheme, f: FrameSpec): { c: AnyCanvas; pad: number } | null {
  const fp = framePad(f.style, f.w, f.h, f.u, f.compact);
  const pad = Math.ceil(Math.max(fp.l, fp.t, fp.r, fp.b) + Math.max(f.u * 2.4, Math.min(f.w, f.h) * .04));
  const key = `F|${th.id}|${f.style}|${Math.round(f.w)}x${Math.round(f.h)}|${f.compact ? 1 : 0}|${f.i % 3}|${Math.round(f.rx)}`;
  const hit = cacheGet(key); if (hit) return { c: hit, pad };
  const W = f.w + pad * 2, H = f.h + pad * 2;
  const cv = makeCanvas(W, H); if (!cv) return null;
  const c = ctx2(cv)!;
  const x = pad - fp.l, y = pad - fp.t, w = f.w + fp.l + fp.r, h = f.h + fp.t + fp.b;
  const soft = (blur: number, oy: number, a: number) => { c.shadowColor = `rgba(0,0,0,${a})`; c.shadowBlur = blur; c.shadowOffsetY = oy; c.shadowOffsetX = 0; };
  const u = f.u;
  switch (f.style) {
    case 'mat': {
      soft(u * 1.6, u * .5, th.dark ? .5 : .22);
      c.fillStyle = paperOf(th, 'mat'); roundRect(c, x, y, w, h, f.rx ? f.rx + fp.l : 0); c.fill();
      c.shadowColor = 'transparent';
      c.strokeStyle = rgbaHex(th.c.accent, .55); c.lineWidth = Math.max(1, u * .1);
      const ins = fp.l * .45; roundRect(c, x + ins, y + ins, w - ins * 2, h - ins * 2, f.rx ? f.rx + fp.l - ins : 0); c.stroke();
      break;
    }
    case 'polaroid': case 'tape': case 'sticker': {
      soft(u * (f.style === 'sticker' ? 1 : 1.4), u * .45, th.dark ? .55 : .25);
      c.fillStyle = paperOf(th, f.style);
      roundRect(c, x, y, w, h, f.style === 'sticker' ? Math.max(f.rx + fp.l, Math.min(w, h) * .06) : f.rx ? f.rx + fp.l : 0); c.fill();
      break;
    }
    case 'pop': {
      const o = Math.max(u * .35, Math.min(f.w, f.h) * .04) * (f.compact ? .6 : 1), s = Math.max(1, u * .2);
      const shadowCol = th.id === 'memphis' || th.id === 'bauhaus' ? POP_COLORS(th)[f.i % 3] : th.c.ink;
      c.fillStyle = shadowCol; roundRect(c, pad - s + o, pad - s + o, f.w + s * 2, f.h + s * 2, f.rx ? f.rx + s : 0); c.fill();
      c.fillStyle = th.id === 'memphis' ? POP_COLORS(th)[(f.i + 1) % 3] : th.c.ink;
      roundRect(c, pad - s, pad - s, f.w + s * 2, f.h + s * 2, f.rx ? f.rx + s : 0); c.fill();
      break;
    }
    case 'glow': {
      const s = Math.max(1, u * .2);
      c.shadowColor = rgbaHex(th.c.accent, .85); c.shadowBlur = u * 1.6;
      c.strokeStyle = th.c.accent; c.lineWidth = s;
      roundRect(c, pad - s / 2, pad - s / 2, f.w + s, f.h + s, f.rx ? f.rx + s / 2 : 0); c.stroke(); c.stroke();
      break;
    }
    default: {
      soft(u * 1.4, u * .4, th.dark ? .45 : .14);
      c.fillStyle = th.dark ? '#000000' : '#FFFFFF'; roundRect(c, pad, pad, f.w, f.h, f.rx); c.fill();
    }
  }
  return { c: cachePut(key, cv), pad };
}

/** Tape strips over the top edge (drawn per frame — two small rects). */
function drawTape(c: Ctx, th: SlideTheme, x: number, y: number, w: number, h: number, u: number, seed: number) {
  const r = rngOf(seed + 5), tw = Math.max(u * 3.2, Math.min(w * .32, u * 9)), thh = Math.max(u * .9, tw * .26);
  const col = th.id === 'ducttape' ? rgbaHex(th.c.accent2.startsWith('#') ? th.c.accent2 : '#C9C2B0', .88) : 'rgba(238,230,205,0.78)';
  const two = r() < .55 && w > u * 10;
  const strips = two ? [[x + w * .08, y, -38 - r() * 10], [x + w * .92, y, 38 + r() * 10]] : [[x + w * (.4 + r() * .2), y, (r() - .5) * 14]];
  for (const [sx, sy, deg] of strips) {
    c.save(); c.translate(sx, sy); c.rotate(deg * Math.PI / 180);
    c.fillStyle = col; c.fillRect(-tw / 2, -thh / 2, tw, thh);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(-tw / 2, -thh / 2, tw, thh * .3);
    c.restore();
  }
}

/** Empty-well marker: a small mountain-and-sun glyph. */
function drawEmpty(c: Ctx, th: SlideTheme, x: number, y: number, w: number, h: number, u: number, rx: number) {
  c.fillStyle = th.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; roundRect(c, x, y, w, h, rx); c.fill();
  c.strokeStyle = rgbaHex(th.c.accent, .45); c.lineWidth = Math.max(1, u * .1); c.setLineDash([u * .6, u * .5]); roundRect(c, x, y, w, h, rx); c.stroke(); c.setLineDash([]);
  const s = Math.min(w, h) * .18, cx = x + w / 2, cy = y + h / 2;
  c.strokeStyle = rgbaHex(th.c.muted, .7); c.lineWidth = Math.max(1, s * .07); c.lineJoin = 'round';
  c.beginPath(); c.moveTo(cx - s, cy + s * .55); c.lineTo(cx - s * .3, cy - s * .25); c.lineTo(cx + s * .1, cy + s * .2); c.lineTo(cx + s * .45, cy - s * .1); c.lineTo(cx + s, cy + s * .55); c.closePath(); c.stroke();
  c.beginPath(); c.arc(cx + s * .45, cy - s * .55, s * .16, 0, TAU); c.stroke();
}

// ── reveal ──────────────────────────────────────────────────────────────────
/**
 * Per-item reveal 0..1. On an output (host) the items enter on their own
 * clock — a ripple longer than the theme's group entrance; in a gallery the
 * object's entrance alpha is spread across the items instead.
 */
function revealP(env: LiveEnv, i: number, n: number, spread: number, dur = .6, base = .12): number {
  if (env.reduced) return 1;
  const k = n > 1 ? i / (n - 1) : 0, h = env.host;
  if (h && h.exitP > 0) return clamp01(env.alpha * (1 + .6) - (1 - k) * .6);
  if (h && h.shownSec >= 0) return clamp01((h.shownSec - base - k * spread) / dur);
  return clamp01(env.alpha * 1.6 - k * .6);
}

// ── photo.well ──────────────────────────────────────────────────────────────
export interface WellProps {
  p: PhotoRef | null; style: FrameStyle; u: number; rx: number; i: number; n: number; seed: number;
  /** 'kb' slow Ken Burns; 'settle' print drops into place and breathes; 'still'. */
  motion: 'kb' | 'settle' | 'still';
  reveal: 'fade' | 'rise' | 'flip' | 'zoom' | 'drop';
  /** Reveal ripple length in seconds (host clock). */
  spread: number;
  compact?: boolean; focusY?: number; tape?: boolean;
}

function drawWell(c: Ctx, o: SlideObj, env: LiveEnv): void {
  const P = o.live!.props as unknown as WellProps;
  const th = env.th, { u } = P, x = o.x, y = o.y, w = o.w, h = o.h;
  const q = revealP(env, P.i, P.n, P.spread, P.reveal === 'drop' ? .75 : .6);
  if (q <= 0) return;
  const e = outCubic(q), t = env.reduced ? 0 : env.t;
  const r = rngOf(P.seed * 31 + P.i * 7 + 3);
  c.save();
  c.globalAlpha *= clamp01(q * (P.reveal === 'drop' ? 3 : 1.6));
  const cx = x + w / 2, cy = y + h / 2;
  // Reveal transform.
  if (q < 1) {
    switch (P.reveal) {
      case 'rise': c.translate(0, (1 - e) * u * 2.6); break;
      case 'flip': c.translate(cx, cy); c.scale(Math.max(.02, e), 1); c.translate(-cx, -cy); break;
      case 'zoom': { const s = 1.08 - .08 * e; c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy); break; }
      case 'drop': {
        const b = outBack(q), s = 1 + (1 - b) * .22, rot = (1 - b) * (r() < .5 ? -9 : 9);
        c.translate(cx, cy - (1 - b) * h * .1); c.rotate(rot * Math.PI / 180); c.scale(s, s); c.translate(-cx, -cy);
        break;
      }
      default: break;
    }
  }
  // Ambient breathing for prints.
  if (P.motion === 'settle' && t) {
    const rot = .45 * Math.sin(TAU * t / (9 + r() * 5) + P.i * 1.7);
    c.translate(cx, cy); c.rotate(rot * Math.PI / 180); c.translate(-cx, -cy);
  }
  // Frame sprite (shadow + border).
  const sp = frameSprite(th, { style: P.style, w, h, u, rx: P.rx, compact: !!P.compact, seed: P.seed, i: P.i });
  if (sp) c.drawImage(sp.c as CanvasImageSource, x - sp.pad, y - sp.pad);
  // The photograph.
  const bmp = P.p ? photoBitmap(P.p, w * (P.motion === 'kb' ? 1.12 : 1), h * (P.motion === 'kb' ? 1.12 : 1), th, P.focusY ?? .5) : null;
  if (!P.p) drawEmpty(c, th, x, y, w, h, u, P.rx);
  else if (!bmp) { c.fillStyle = th.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; roundRect(c, x, y, w, h, P.rx); c.fill(); }
  else {
    c.save();
    if (P.rx > .5) { roundRect(c, x, y, w, h, P.rx); c.clip(); }
    if (P.motion === 'kb') {
      // Zoom 1.0..1.12 of the baked (1.12×) bitmap, with a slow pan.
      const per = 22 + r() * 12, ph = r() * TAU, dirx = r() - .5, diry = r() - .5;
      // The bitmap is baked at 1.12× so a zoom of 1.03–1.11 stays sharp.
      const s = .5 + .5 * Math.sin(TAU * t / per + ph), z = 1.03 + .08 * s;
      const bw = bmp.width, bh = bmp.height, sw = bw / z, sh = bh / z;
      const mx = (bw - sw) / 2, my = (bh - sh) / 2;
      const sx = mx * (1 + 1.6 * dirx * Math.sin(TAU * t / (per * 1.3) + ph)), sy = my * (1 + 1.6 * diry * Math.cos(TAU * t / (per * 1.5) + ph));
      c.drawImage(bmp as CanvasImageSource, Math.max(0, Math.min(bw - sw, sx)), Math.max(0, Math.min(bh - sh, sy)), sw, sh, x, y, w, h);
    } else c.drawImage(bmp as CanvasImageSource, x, y, w, h);
    c.restore();
    if (P.style === 'mat' || P.style === 'clean') { c.strokeStyle = th.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'; c.lineWidth = Math.max(1, u * .06); roundRect(c, x, y, w, h, P.rx); c.stroke(); }
  }
  if (P.tape || P.style === 'tape') drawTape(c, th, x, y - framePad(P.style, w, h, u, P.compact).t, w, h, u, P.seed * 13 + P.i);
  c.restore();
}

// ── photo.wall ──────────────────────────────────────────────────────────────
export interface WallLane { pos: number; size: number; speed: number; seq: Array<{ i: number; len: number }> }
export interface WallProps { photos: Array<PhotoRef | null>; orient: 'h' | 'v'; lanes: WallLane[]; gap: number; rx: number; style: FrameStyle; u: number }

function drawWall(c: Ctx, o: SlideObj, env: LiveEnv): void {
  const P = o.live!.props as unknown as WallProps;
  const th = env.th, t = env.reduced ? 0 : env.t, horiz = P.orient === 'h';
  const boxLen = horiz ? o.w : o.h;
  const e = env.reduced ? 1 : outCubic(clamp01(env.alpha));
  c.save();
  c.beginPath(); c.rect(o.x, o.y, o.w, o.h); c.clip();
  const pad = P.style === 'clean' || P.style === 'glow' || P.style === 'mat' ? 0 : Math.max(1, P.u * .3);
  P.lanes.forEach((ln, li) => {
    const period = ln.seq.reduce((a, s) => a + s.len + P.gap, 0);
    if (!(period > 0)) return;
    const shift = (1 - e) * (1 - e) * boxLen * .22 * (ln.speed >= 0 ? -1 : 1);
    let off = ((t * ln.speed + shift + li * period * .37) % period + period) % period;
    let pos = -off, k = 0;
    while (pos < boxLen && k < 400) {
      const it = ln.seq[k % ln.seq.length]; k++;
      const len = it.len;
      if (pos + len > 0) {
        const x = horiz ? o.x + pos : o.x + ln.pos, y = horiz ? o.y + ln.pos : o.y + pos;
        const w = horiz ? len : ln.size, h = horiz ? ln.size : len;
        const p = P.photos.length ? P.photos[it.i % P.photos.length] : null;
        if (pad && p) { c.fillStyle = paperOf(th, P.style); c.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2); }
        if (P.style === 'pop' && p) { c.fillStyle = th.c.ink; c.fillRect(x + P.u * .4, y + P.u * .4, w, h); }
        const bmp = p ? photoBitmap(p, w, h, th) : null;
        if (bmp) {
          if (P.rx > .5) { c.save(); roundRect(c, x, y, w, h, P.rx); c.clip(); c.drawImage(bmp as CanvasImageSource, x, y, w, h); c.restore(); }
          else c.drawImage(bmp as CanvasImageSource, x, y, w, h);
        } else { c.fillStyle = th.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'; roundRect(c, x, y, w, h, P.rx); c.fill(); }
        if (P.style === 'glow') { c.strokeStyle = rgbaHex(th.c.accent, .7); c.lineWidth = Math.max(1, P.u * .15); roundRect(c, x, y, w, h, P.rx); c.stroke(); }
        else if (P.style === 'mat') { c.strokeStyle = rgbaHex(th.c.accent, .45); c.lineWidth = Math.max(1, P.u * .08); roundRect(c, x, y, w, h, P.rx); c.stroke(); }
      }
      pos += len + P.gap;
    }
  });
  c.restore();
}

registerLiveDrawer('photo.well', drawWell);
registerLiveDrawer('photo.wall', drawWall);
