// services/ambo/worshipVisualizers/cinematicFx.ts
// High-Craft Cinema Optical, Architectural, Botanical & Material Compositor Engine
// Filtered through the 6-Voice Art Director Council:
//  - Classical Mind (🏛️): True Gothic Rose Windows, 3D Vaulted Colonnades, Ashlar Masonry, Fibonacci Spirals
//  - Baroque Dramatist (🕯️): Caravaggio Chiaroscuro, Ornate Sanctuary Censer Lamps, Beeswax Candles, Incense Plumes
//  - Radical Minimalist (◯): Turrell Skyspace Apertures, 4-Plane Cinema Bokeh, Razor-Sharp Horizon Optics
//  - Futurist (✦): Engraved Brass Astrolabes, Ophanim Gyroscopic Wheels, Anamorphic Flares, Harmonic Lattices
//  - World-Eclectic Traveller (🌿): Nihonga Mineral Gold-Leaf, Byzantine Mosaic Tesserae, Woven Tapestry Borders
//  - Rebellious Hand (✒️): Voronoi Kintsugi Gold-Leaf Seams, Woodcut Halftone, Botanical Herbarium Filigree

import { WORSHIP_BUILDS } from './builds';
import type {
  WorshipRenderContext,
  WorshipVisualizerDef,
  CouncilDirector,
} from './types';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function hash11(p: number): number {
  const x = Math.sin(p * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
function hash21(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x: number, y: number, octaves = 3): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2D(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return v;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#000000').replace('#', '');
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
export function hexRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
}
export function mixHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const k = clamp01(t);
  const r = Math.round(lerp(r1, r2, k));
  const g = Math.round(lerp(g1, g2, k));
  const b = Math.round(lerp(b1, b2, k));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
function resolveDirectorLocal(vis?: WorshipVisualizerDef): CouncilDirector {
  if (!vis) return 'Baroque Dramatist';
  // The lead the Art Council cast (councilBuilds.ts) or the authored lead (authored*Builds.ts) is the voice of record.
  const built = WORSHIP_BUILDS[vis.id];
  if (built) return built.director;
  if (vis.director) return vis.director;
  const dirs: CouncilDirector[] = [
    'Classical Mind',
    'Baroque Dramatist',
    'Radical Minimalist',
    'Futurist',
    'World-Eclectic Traveller',
    'Rebellious Hand',
  ];
  return dirs[(vis.number - 1) % dirs.length];
}

// ── 1. Punchy Contemporary Color Vibrance Helper ─────────────────────────────

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Boosts saturation and luminance so contemporary palettes feel rich, luminous, and expressive. */
export function punchHex(hex: string, satBoost = 1.36, lumLift = 0.04): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newS = clamp01(s * satBoost + (s > 0.08 ? 0.08 : 0));
  const newL = clamp01(l + lumLift * (1 - l * 0.5));
  const [nr, ng, nb] = hslToRgb(h, newS, newL);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

// ── 2. Hexagonal & Anamorphic Cinema Aperture Bokeh ─────────────────────────

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  sides: number,
  rotation: number,
) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawCinematicBokeh(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    count: number;
    palette: string[];
    t: number;
    intensity: number;
    anamorphic?: boolean;
    seed?: number;
  },
) {
  if (opts.intensity <= 0.01) return;
  const seed = opts.seed ?? 31;
  const scale = Math.min(w, h) / 720;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < opts.count; i++) {
    const h1 = hash11(i * 17.3 + seed);
    const h2 = hash11(i * 41.9 + seed);
    const h3 = hash11(i * 73.1 + seed);
    const h4 = hash11(i * 97.7 + seed);

    const plane = i % 6 === 0 ? 2 : i % 2 === 0 ? 1 : 0;
    const spd = plane === 2 ? 0.018 : plane === 1 ? 0.012 : 0.007;

    const px = ((h1 + Math.sin(opts.t * 0.25 + h2 * 6.28) * 0.06 + opts.t * spd * (h3 - 0.5)) % 1 + 1) % 1;
    const py = ((h2 - opts.t * spd * (0.4 + h3 * 0.5)) % 1 + 1) % 1;
    const x = px * w;
    const y = py * h;

    // Keep giant bokeh out of the dead center reading area so it frames the art rather than clouding it
    const centerDist = Math.hypot((px - 0.5) * 1.4, (py - 0.5) * 1.8);
    if (plane === 2 && centerDist < 0.35) continue;

    const baseR =
      plane === 2
        ? lerp(28, 62, h3) * scale
        : plane === 1
        ? lerp(11, 26, h3) * scale
        : lerp(4, 11, h3) * scale;

    const rx = opts.anamorphic ? baseR * 0.78 : baseR;
    const ry = opts.anamorphic ? baseR * 1.25 : baseR;

    const pulse = 0.55 + 0.45 * Math.sin(opts.t * (0.9 + h1 * 1.4) + h4 * 6.28);
    const edgeFade = Math.sin(py * Math.PI);
    const planeAlpha = plane === 2 ? 0.16 : plane === 1 ? 0.30 : 0.44;
    const alpha = clamp01(opts.intensity * pulse * edgeFade * planeAlpha);
    if (alpha < 0.015) continue;

    const col = opts.palette[i % opts.palette.length] || '#FFD98E';
    const rimCol = opts.palette[(i + 1) % opts.palette.length] || '#FFF6E0';
    const rot = h4 * Math.PI + opts.t * 0.06 * (h1 - 0.5);

    const rg = ctx.createRadialGradient(x, y, baseR * 0.1, x, y, Math.max(rx, ry));
    rg.addColorStop(0, hexRgba(col, alpha * 0.12));
    rg.addColorStop(0.72, hexRgba(col, alpha * 0.28));
    rg.addColorStop(0.92, hexRgba(rimCol, alpha * 0.68));
    rg.addColorStop(1, hexRgba(rimCol, 0));

    ctx.fillStyle = rg;
    if (plane >= 1) {
      const blades = i % 2 === 0 ? 6 : 8;
      tracePolygon(ctx, x, y, rx, ry, blades, rot);
      ctx.fill();
      ctx.strokeStyle = hexRgba('#FFFFFF', alpha * 0.24);
      ctx.lineWidth = Math.max(0.8, 1.1 * scale);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ── 3. 35mm Kodak Film Light Leaks & Prismatic Edge Bleeds ───────────────────

export function drawFilmLightLeaks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    t: number;
    intensity: number;
    warmHex: string;
    coolHex: string;
    roseHex?: string;
    seed?: number;
  },
) {
  if (opts.intensity <= 0.01) return;
  const seed = opts.seed ?? 11;
  const rose = opts.roseHex ?? '#FF6B7E';
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Leak 1: Warm Kodak Amber / Gold corner film burn (hugs perimeter so center art stays crisp)
  const drift1 = 0.5 + 0.5 * Math.sin(opts.t * 0.31 + seed);
  const lx1 = (seed % 2 === 0 ? 0.02 : 0.98) * w;
  const ly1 = h * (0.12 + 0.65 * drift1);
  const lr1 = Math.max(w, h) * (0.28 + 0.12 * drift1);
  const g1 = ctx.createRadialGradient(lx1, ly1, 0, lx1, ly1, lr1);
  const a1 = clamp01(opts.intensity * (0.22 + 0.16 * drift1));
  g1.addColorStop(0, hexRgba('#FFF2CC', a1 * 0.58));
  g1.addColorStop(0.32, hexRgba(opts.warmHex, a1 * 0.72));
  g1.addColorStop(0.68, hexRgba(rose, a1 * 0.28));
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  // Leak 2: Opposite corner complementary edge bleed
  const drift2 = 0.5 + 0.5 * Math.cos(opts.t * 0.27 + seed * 1.7);
  const lx2 = (seed % 2 === 0 ? 0.98 : 0.02) * w;
  const ly2 = h * (0.88 - 0.62 * drift2);
  const lr2 = Math.max(w, h) * (0.25 + 0.12 * drift2);
  const g2 = ctx.createRadialGradient(lx2, ly2, 0, lx2, ly2, lr2);
  const a2 = clamp01(opts.intensity * (0.18 + 0.14 * drift2));
  g2.addColorStop(0, hexRgba(opts.coolHex, a2 * 0.55));
  g2.addColorStop(0.45, hexRgba(opts.warmHex, a2 * 0.25));
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

// ── 4. Multi-Element Optical & Anamorphic Lens Flare Engine ──────────────────

export function drawOpticalLensFlare(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    x: number;
    y: number;
    intensity: number;
    primaryColor: string;
    secondaryColor: string;
    anamorphic?: boolean;
    t: number;
  },
) {
  if (opts.intensity <= 0.02) return;
  const { x, y, intensity, primaryColor, secondaryColor } = opts;
  const minDim = Math.min(w, h);
  const alpha = clamp01(intensity);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // 1. Key source halation bloom
  const haloR = minDim * (0.26 + 0.08 * Math.sin(opts.t * 0.8));
  const hg = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  hg.addColorStop(0, hexRgba('#FFFFFF', alpha * 0.72));
  hg.addColorStop(0.16, hexRgba(primaryColor, alpha * 0.58));
  hg.addColorStop(0.48, hexRgba(secondaryColor, alpha * 0.22));
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Anamorphic horizontal cinema streak
  if (opts.anamorphic !== false) {
    const streakW = w * (0.52 + alpha * 0.28);
    const streakH = Math.max(2, minDim * 0.012);
    const sg = ctx.createLinearGradient(x - streakW, y, x + streakW, y);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(0.28, hexRgba(secondaryColor, alpha * 0.24));
    sg.addColorStop(0.47, hexRgba(primaryColor, alpha * 0.58));
    sg.addColorStop(0.5, hexRgba('#FFFFFF', alpha * 0.85));
    sg.addColorStop(0.53, hexRgba(primaryColor, alpha * 0.58));
    sg.addColorStop(0.72, hexRgba(secondaryColor, alpha * 0.24));
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y, streakW, streakH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Starburst diffraction spikes
  const spikes = 8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(opts.t * 0.05);
  for (let s = 0; s < spikes; s++) {
    const a = (s / spikes) * Math.PI;
    const len = minDim * (s % 2 === 0 ? 0.18 : 0.09) * (0.85 + 0.15 * Math.sin(opts.t * 1.5 + s));
    ctx.save();
    ctx.rotate(a);
    const rg = ctx.createLinearGradient(-len, 0, len, 0);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(0.5, hexRgba('#FFF8E7', alpha * 0.46));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = rg;
    ctx.lineWidth = Math.max(1, minDim * 0.002);
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // 4. Subtle Optical Ghost Elements along the optical axis
  const cx = w * 0.5;
  const cy = h * 0.5;
  const vx = cx - x;
  const vy = cy - y;
  const ghosts = [
    { tPos: 0.42, rScale: 0.038, col: primaryColor, ring: false, hex: true, a: 0.22 },
    { tPos: 0.78, rScale: 0.024, col: secondaryColor, ring: true, hex: false, a: 0.26 },
    { tPos: 1.32, rScale: 0.055, col: primaryColor, ring: true, hex: true, a: 0.18 },
    { tPos: 1.75, rScale: 0.072, col: secondaryColor, ring: true, hex: false, a: 0.14 },
  ];

  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    const gx = x + vx * g.tPos;
    const gy = y + vy * g.tPos;
    const gr = minDim * g.rScale;
    const ga = clamp01(alpha * g.a);

    const grad = ctx.createRadialGradient(gx, gy, gr * 0.1, gx, gy, gr);
    if (g.ring) {
      grad.addColorStop(0, hexRgba(g.col, ga * 0.06));
      grad.addColorStop(0.75, hexRgba(g.col, ga * 0.18));
      grad.addColorStop(0.92, hexRgba(g.col, ga * 0.72));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      grad.addColorStop(0, hexRgba('#FFFFFF', ga * 0.38));
      grad.addColorStop(0.55, hexRgba(g.col, ga * 0.45));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    }

    ctx.fillStyle = grad;
    if (g.hex) {
      tracePolygon(ctx, gx, gy, gr, gr, 6, i * 0.4 + opts.t * 0.04);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ── 5. Spectral Prism Caustic Ribbons ────────────────────────────────────────

export function drawPrismCaustics(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    t: number;
    intensity: number;
    colorA: string;
    colorB: string;
    colorC: string;
    seed?: number;
  },
) {
  if (opts.intensity <= 0.02) return;
  const seed = opts.seed ?? 7;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const ribbons = 2;
  const cols = [opts.colorA, opts.colorB, opts.colorC];
  for (let r = 0; r < ribbons; r++) {
    const col = cols[r % cols.length];
    const baseY = h * (r === 0 ? 0.18 : 0.82);
    const amp = h * (0.055 + 0.025 * Math.sin(opts.t * 0.3 + r + seed));
    const bandThick = h * (0.075 + 0.02 * r);
    const alpha = clamp01(opts.intensity * (0.15 - r * 0.02));

    const grad = ctx.createLinearGradient(0, baseY - bandThick, w, baseY + bandThick);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.28, hexRgba(col, alpha));
    grad.addColorStop(0.5, hexRgba('#FFFFFF', alpha * 0.45));
    grad.addColorStop(0.72, hexRgba(cols[(r + 1) % cols.length], alpha));
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    const steps = 20;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const px = u * w;
      const py =
        baseY +
        Math.sin(u * 4.5 + opts.t * 0.55 + r * 1.7 + seed) * amp +
        Math.cos(u * 2.3 - opts.t * 0.38 + r) * (amp * 0.45);
      if (s === 0) ctx.moveTo(px, py - bandThick * 0.5);
      else ctx.lineTo(px, py - bandThick * 0.5);
    }
    for (let s = steps; s >= 0; s--) {
      const u = s / steps;
      const px = u * w;
      const py =
        baseY +
        Math.sin(u * 4.5 + opts.t * 0.55 + r * 1.7 + seed) * amp +
        Math.cos(u * 2.3 - opts.t * 0.38 + r) * (amp * 0.45);
      ctx.lineTo(px, py + bandThick * 0.5);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ── 6. Tactile Offscreen-Cached Material Textures (Council Craft) ────────────

const texCache = new Map<string, HTMLCanvasElement>();

function getCachedTexture(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g, w, h);
  texCache.set(key, c);
  return c;
}

export function drawTactileTextureOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  grainAmount = 0.55,
  director: CouncilDirector = 'Classical Mind',
) {
  if (grainAmount <= 0.02) return;
  ctx.save();

  // 1. Director-Specific Material Surface Weave
  if (director === 'World-Eclectic Traveller') {
    // Nihonga crushed mineral pigment & gold-leaf foil flecks
    const nihonga = getCachedTexture('nihonga-mineral', 220, 220, (g, tw, th) => {
      for (let i = 0; i < 1800; i++) {
        const x = hash11(i * 11.3) * tw;
        const y = hash11(i * 27.9) * th;
        const isGold = hash11(i * 43.1) > 0.88;
        g.fillStyle = isGold
          ? `rgba(255, 215, 115, ${(0.08 + hash11(i) * 0.14).toFixed(3)})`
          : `rgba(220, 235, 255, ${(0.02 + hash11(i) * 0.04).toFixed(3)})`;
        g.fillRect(x, y, isGold ? 2.2 : 1.4, isGold ? 2.2 : 1.4);
      }
    });
    if (nihonga) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clamp01(grainAmount * 0.55);
      const pat = ctx.createPattern(nihonga, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
      }
    }
  } else if (director === 'Rebellious Hand') {
    // Artisan woodcut / engraved cross-hatch & deckle fiber grain
    const woodcut = getCachedTexture('rebellious-woodcut', 180, 180, (g, tw, th) => {
      g.strokeStyle = 'rgba(255, 236, 195, 0.045)';
      g.lineWidth = 0.8;
      for (let i = 0; i < 160; i++) {
        const x = hash11(i * 19.7) * tw;
        const y = hash11(i * 31.3) * th;
        const ang = (hash11(i * 7.1) - 0.5) * 0.6;
        const len = 8 + hash11(i * 13.3) * 18;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        g.stroke();
      }
    });
    if (woodcut) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = clamp01(grainAmount * 0.65);
      const pat = ctx.createPattern(woodcut, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
      }
    }
  } else {
    // Museum linen & scriptorium vellum weave
    const linen = getCachedTexture('museum-linen', 160, 160, (g, tw, th) => {
      for (let y = 0; y < th; y += 3) {
        const a = 0.025 + 0.04 * hash11(y * 7.1);
        g.fillStyle = `rgba(255, 244, 218, ${a.toFixed(3)})`;
        g.fillRect(0, y, tw, 1);
      }
      for (let x = 0; x < tw; x += 4) {
        const a = 0.02 + 0.035 * hash11(x * 11.3);
        g.fillStyle = `rgba(255, 232, 185, ${a.toFixed(3)})`;
        g.fillRect(x, 0, 1, th);
      }
    });
    if (linen) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = clamp01(grainAmount * 0.42);
      const pat = ctx.createPattern(linen, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  // 2. Animated 24fps 35mm Cinema Grain
  const grain = getCachedTexture('cinema-grain-35mm', 180, 180, (g, tw, th) => {
    const img = g.createImageData(tw, th);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const idx = i >> 2;
      const n = hash11(idx * 13.37);
      const v = Math.floor(n * 255);
      if (n > 0.988) {
        d[i] = 255;
        d[i + 1] = 220;
        d[i + 2] = 140;
        d[i + 3] = 95;
      } else {
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 34;
      }
    }
    g.putImageData(img, 0, 0);
  });

  if (grain) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = clamp01(grainAmount * 0.36);
    const frameStep = Math.floor(t * 24);
    const ox = Math.floor(hash11(frameStep * 19.1) * 180);
    const oy = Math.floor(hash11(frameStep * 37.7) * 180);
    ctx.translate(ox, oy);
    const pat = ctx.createPattern(grain, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(-ox, -oy, w + 180, h + 180);
    }
  }

  ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. ART COUNCIL BESPOKE ARCHITECTURAL, BOTANICAL & GEOMETRIC MASTER PRIMITIVES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CLASSICAL MIND & BAROQUE DRAMATIST:
 * Draws an authentic multi-ring Gothic Cathedral Rose Window with pointed cusps,
 * stained-glass jewel lancets, quatrefoil rosettes, and leaded stone tracery.
 */
export function drawGothicRoseWindow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  opts: {
    petals?: number;
    t: number;
    palette: string[];
    leadColor?: string;
    vocalEnergy?: number;
    swellEnergy?: number;
    pulseEnergy?: number;
    causticThrow?: boolean;
  },
) {
  const petals = opts.petals ?? 12;
  const lead = opts.leadColor ?? '#E8C170';
  const vocal = opts.vocalEnergy ?? 0.4;
  const swell = opts.swellEnergy ?? 0.4;
  const pulse = opts.pulseEnergy ?? 0.2;

  ctx.save();
  ctx.translate(cx, cy);

  // 1. Optional projected stained-glass caustic floor/wall throw
  if (opts.causticThrow !== false) {
    ctx.save();
    ctx.rotate(opts.t * 0.035);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const col = opts.palette[i % opts.palette.length] || '#3B82F6';
      const dist = radius * (0.62 + 0.06 * Math.sin(opts.t * 0.7 + i));
      const px = Math.cos(a) * dist;
      const py = Math.sin(a) * dist;
      const cr = radius * (0.38 + swell * 0.12);
      const g = ctx.createRadialGradient(px, py, cr * 0.05, px, py, cr);
      g.addColorStop(0, hexRgba(col, 0.34 + vocal * 0.22));
      g.addColorStop(0.55, hexRgba(col, 0.14));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, cr, cr * 0.62, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Main Rose Window Wheel (slow ceremonial rotation)
  ctx.rotate(opts.t * 0.025);

  // Outer stone moulding shadow & glow
  const outerGlow = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius * 1.08);
  outerGlow.addColorStop(0, hexRgba(opts.palette[0] || '#FFE08A', 0.28 + vocal * 0.2));
  outerGlow.addColorStop(0.7, hexRgba(opts.palette[1] || '#2563EB', 0.18 + swell * 0.15));
  outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.08, 0, Math.PI * 2);
  ctx.fill();

  // Inner lancet petals + outer pointed trefoil cusps
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const dAngle = (Math.PI * 2) / petals;
    const col1 = opts.palette[i % opts.palette.length];
    const col2 = opts.palette[(i + 1) % opts.palette.length];

    ctx.save();
    ctx.rotate(a);

    // Inner pointed lancet petal (r = 0.22 to 0.64)
    const rIn = radius * 0.20;
    const rMid = radius * (0.62 + pulse * 0.03);
    const wHalf = rMid * Math.sin(dAngle * 0.44);

    const pg = ctx.createLinearGradient(rIn, 0, rMid, 0);
    pg.addColorStop(0, hexRgba('#FFF6D6', 0.55 + vocal * 0.3));
    pg.addColorStop(0.45, hexRgba(col1, 0.48 + swell * 0.28));
    pg.addColorStop(1, hexRgba(col2, 0.32));

    ctx.fillStyle = pg;
    ctx.strokeStyle = hexRgba(lead, 0.52 + vocal * 0.28);
    ctx.lineWidth = Math.max(1.2, radius * 0.008);
    ctx.beginPath();
    ctx.moveTo(rIn, 0);
    ctx.quadraticCurveTo(rMid * 0.65, -wHalf, rMid, 0);
    ctx.quadraticCurveTo(rMid * 0.65, wHalf, rIn, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Outer quatrefoil / oculus medallion (at r = 0.78)
    const oculusR = radius * dAngle * 0.32;
    const ox = radius * 0.79;
    const og = ctx.createRadialGradient(ox, 0, 0, ox, 0, oculusR);
    og.addColorStop(0, hexRgba('#FFFFFF', 0.65 + pulse * 0.25));
    og.addColorStop(0.55, hexRgba(col2, 0.55 + vocal * 0.25));
    og.addColorStop(1, hexRgba(col1, 0.18));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(ox, 0, oculusR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4 tiny cusps inside each oculus medallion
    for (let c = 0; c < 4; c++) {
      const ca = (c / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(ox + Math.cos(ca) * oculusR * 0.52, Math.sin(ca) * oculusR * 0.52, oculusR * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Concentric stone & brass tracery rings
  ctx.strokeStyle = hexRgba(lead, 0.62 + vocal * 0.25);
  for (const [idx, ratio] of [0.20, 0.63, 0.94, 0.98].entries()) {
    ctx.lineWidth = idx >= 2 ? Math.max(2, radius * 0.014) : Math.max(1.2, radius * 0.008);
    ctx.beginPath();
    ctx.arc(0, 0, radius * ratio, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Central Agnus Dei / Trinity star rosette core
  const coreG = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.20);
  coreG.addColorStop(0, hexRgba('#FFFFFF', 0.85));
  coreG.addColorStop(0.5, hexRgba(lead, 0.65 + vocal * 0.3));
  coreG.addColorStop(1, hexRgba(opts.palette[0] || lead, 0.2));
  ctx.fillStyle = coreG;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * CLASSICAL MIND:
 * Draws a receding 3D perspective Gothic or Romanesque vaulted sanctuary arcade
 * with clustered stone piers, moulded capitals, vaulting ribs, and floor reflections.
 */
export function drawCathedralArcade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    bays?: number;
    pointed?: boolean;
    stoneColor: string;
    highlightColor: string;
    t: number;
    progressOffset?: number;
    vocalEnergy?: number;
    swellEnergy?: number;
  },
) {
  const bays = opts.bays ?? 5;
  const pointed = opts.pointed !== false;
  const vocal = opts.vocalEnergy ?? 0.4;
  const swell = opts.swellEnergy ?? 0.4;
  const progOff = opts.progressOffset ?? 0;

  ctx.save();
  const vpX = w * 0.5;
  const vpY = h * 0.48;
  const floorY = h * 0.88;

  // Nave polished stone floor reflection
  const floorG = ctx.createLinearGradient(0, vpY, 0, h);
  floorG.addColorStop(0, 'rgba(0,0,0,0)');
  floorG.addColorStop(0.45, hexRgba(opts.stoneColor, 0.25));
  floorG.addColorStop(1, hexRgba(opts.highlightColor, 0.14 + swell * 0.12));
  ctx.fillStyle = floorG;
  ctx.fillRect(0, vpY, w, h - vpY);

  // Perspective paving grid lines on floor
  ctx.strokeStyle = hexRgba(opts.highlightColor, 0.12 + vocal * 0.1);
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(vpX + i * w * 0.03, vpY + h * 0.08);
    ctx.lineTo(vpX + i * w * 0.18, h);
    ctx.stroke();
  }

  // Draw receding bays from back (small) to front (large framing)
  for (let b = 0; b < bays; b++) {
    const rawP = (b + progOff) / bays;
    const p = ((rawP % 1) + 1) % 1;
    // Exponential perspective depth
    const scale = 0.24 + Math.pow(p, 1.45) * 0.86;
    const archW = w * 0.88 * scale;
    const springY = vpY + (floorY - vpY) * (0.12 - 0.18 * scale);
    const baseLineY = vpY + (floorY - vpY) * scale;
    const crownY = vpY - h * 0.44 * scale;

    const leftX = vpX - archW * 0.5;
    const rightX = vpX + archW * 0.5;
    const pierW = Math.max(4, w * 0.028 * scale);

    const alpha = Math.sin(p * Math.PI) * (0.45 + vocal * 0.35);

    // Clustered stone piers (left and right)
    const pierGLeft = ctx.createLinearGradient(leftX - pierW, 0, leftX + pierW, 0);
    pierGLeft.addColorStop(0, hexRgba(opts.stoneColor, alpha * 0.9));
    pierGLeft.addColorStop(0.7, hexRgba(opts.highlightColor, alpha * (0.45 + swell * 0.35)));
    pierGLeft.addColorStop(1, hexRgba(opts.stoneColor, alpha * 0.5));
    ctx.fillStyle = pierGLeft;
    ctx.fillRect(leftX - pierW * 0.5, springY, pierW, baseLineY - springY);
    ctx.fillRect(rightX - pierW * 0.5, springY, pierW, baseLineY - springY);

    // Moulded Capitals & Plinth bases
    ctx.fillStyle = hexRgba(opts.highlightColor, alpha * 0.72);
    ctx.fillRect(leftX - pierW * 0.75, springY - pierW * 0.35, pierW * 1.5, pierW * 0.45);
    ctx.fillRect(rightX - pierW * 0.75, springY - pierW * 0.35, pierW * 1.5, pierW * 0.45);
    ctx.fillRect(leftX - pierW * 0.8, baseLineY - pierW * 0.3, pierW * 1.6, pierW * 0.4);
    ctx.fillRect(rightX - pierW * 0.8, baseLineY - pierW * 0.3, pierW * 1.6, pierW * 0.4);

    // Vaulted Arch Ribbing (double-order mouldings)
    for (let order = 0; order < 2; order++) {
      const inset = order * pierW * 0.45;
      ctx.strokeStyle = hexRgba(
        order === 0 ? opts.highlightColor : opts.stoneColor,
        alpha * (order === 0 ? 0.82 : 0.48),
      );
      ctx.lineWidth = Math.max(1.5, pierW * (order === 0 ? 0.38 : 0.22));
      ctx.beginPath();
      ctx.moveTo(leftX + inset, springY);
      if (pointed) {
        ctx.quadraticCurveTo(leftX + archW * 0.14, crownY + (springY - crownY) * 0.22, vpX, crownY + inset);
        ctx.quadraticCurveTo(rightX - archW * 0.14, crownY + (springY - crownY) * 0.22, rightX - inset, springY);
      } else {
        ctx.arc(vpX, springY, archW * 0.5 - inset, Math.PI, Math.PI * 2);
      }
      ctx.stroke();
    }

    // Keystone diamond boss at crown of arch
    const bossSz = Math.max(3, pierW * 0.48);
    ctx.fillStyle = hexRgba('#FFF4D2', alpha * (0.75 + vocal * 0.25));
    ctx.beginPath();
    ctx.moveTo(vpX, crownY - bossSz);
    ctx.lineTo(vpX + bossSz, crownY);
    ctx.lineTo(vpX, crownY + bossSz);
    ctx.lineTo(vpX - bossSz, crownY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * REBELLIOUS HAND & WORLD-ECLECTIC TRAVELLER:
 * Draws an authentic Japanese Kintsugi fracture network with dark slate relief,
 * branching molten 24k gold-leaf seams, capillary sub-cracks, and glowing gold nodes.
 */
export function drawKintsugiFractureNetwork(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    t: number;
    goldColor?: string;
    glowColor?: string;
    vocalEnergy?: number;
    swellEnergy?: number;
    seed?: number;
  },
) {
  const gold = opts.goldColor ?? '#F5C85C';
  const glow = opts.glowColor ?? '#FF9E3B';
  const vocal = opts.vocalEnergy ?? 0.45;
  const swell = opts.swellEnergy ?? 0.45;
  const seed = opts.seed ?? 12;

  ctx.save();
  // 1. Primary fracture paths (perimeter & diagonal tectonic seams)
  const veins = [
    { x0: 0, y0: h * 0.18, x1: w * 0.38, y1: h * 0.34, x2: w * 0.68, y2: h * 0.16, x3: w, y3: h * 0.28 },
    { x0: 0, y0: h * 0.78, x1: w * 0.28, y1: h * 0.64, x2: w * 0.62, y2: h * 0.82, x3: w, y3: h * 0.71 },
    { x0: w * 0.16, y0: 0, x1: w * 0.26, y1: h * 0.36, x2: w * 0.14, y2: h * 0.68, x3: w * 0.24, y3: h },
    { x0: w * 0.84, y0: 0, x1: w * 0.76, y1: h * 0.38, x2: w * 0.88, y2: h * 0.66, x3: w * 0.78, y3: h },
  ];

  const scale = Math.min(w, h) / 720;

  for (let v = 0; v < veins.length; v++) {
    const vn = veins[v];
    const pts: Array<[number, number]> = [];
    const steps = 36;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const iu = 1 - u;
      // Cubic Bezier base + high-frequency mineral fracture jitter
      const bx =
        iu * iu * iu * vn.x0 +
        3 * iu * iu * u * vn.x1 +
        3 * iu * u * u * vn.x2 +
        u * u * u * vn.x3;
      const by =
        iu * iu * iu * vn.y0 +
        3 * iu * iu * u * vn.y1 +
        3 * iu * u * u * vn.y2 +
        u * u * u * vn.y3;
      const jagX = (fbm(u * 9 + v * 3.1 + seed, v * 1.7, 3) - 0.5) * w * 0.045;
      const jagY = (fbm(v * 2.3, u * 9 + v * 4.7 + seed, 3) - 0.5) * h * 0.045;
      pts.push([bx + jagX, by + jagY]);
    }

    // Dark stone bevel shadow beneath the gold seam
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = Math.max(2.5, 4.5 * scale);
    ctx.lineJoin = 'bevel';
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py + 2) : ctx.lineTo(px, py + 2)));
    ctx.stroke();

    // Molten gold outer halation
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = glow;
    ctx.shadowBlur = (14 + swell * 24) * scale;
    ctx.strokeStyle = hexRgba(gold, 0.55 + vocal * 0.42);
    ctx.lineWidth = Math.max(1.8, (2.6 + vocal * 1.4) * scale);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();

    // Specular 24k gold core filament + travelling light pulse
    ctx.strokeStyle = hexRgba('#FFF8DC', 0.72 + vocal * 0.28);
    ctx.lineWidth = Math.max(0.9, 1.2 * scale);
    ctx.stroke();

    // Branching capillary sub-cracks
    for (let b = 4; b < pts.length - 4; b += 6) {
      const [bx, by] = pts[b];
      const ang = (hash11(v * 31 + b + seed) - 0.5) * Math.PI * 1.4;
      const bLen = (22 + hash11(b * 17) * 48) * scale;
      ctx.strokeStyle = hexRgba(gold, 0.38 + swell * 0.3);
      ctx.lineWidth = Math.max(0.8, 1.1 * scale);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const mx = bx + Math.cos(ang) * bLen * 0.5 + (hash11(b) - 0.5) * 12;
      const my = by + Math.sin(ang) * bLen * 0.5 + (hash11(b + 5) - 0.5) * 12;
      ctx.lineTo(mx, my);
      ctx.lineTo(bx + Math.cos(ang + 0.25) * bLen, by + Math.sin(ang + 0.25) * bLen);
      ctx.stroke();

      // Golden lacquer pool node at fork
      const nr = (2.5 + hash11(b * 9) * 3.0) * scale * (1 + vocal * 0.3);
      ctx.fillStyle = '#FFF5CC';
      ctx.beginPath();
      ctx.arc(bx, by, nr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * FUTURIST & CLASSICAL MIND:
 * Draws a precision engraved brass Celestial Astrolabe / Ezekiel Ophanim wheel-within-wheel
 * with degree vernier ticks, ecliptic horizon arcs, constellation nodes, and 8-pointed zenith star.
 */
export function drawSacredAstrolabe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  opts: {
    t: number;
    primaryColor: string;
    secondaryColor: string;
    vocalEnergy?: number;
    swellEnergy?: number;
    showStar?: boolean;
  },
) {
  const vocal = opts.vocalEnergy ?? 0.4;
  const swell = opts.swellEnergy ?? 0.4;
  const col1 = opts.primaryColor;
  const col2 = opts.secondaryColor;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'screen';

  // 1. Three counter-rotating engraved brass armillary rings
  const rings = [
    { r: 0.98, spd: 0.04, ticks: 72, dash: [], w: 1.6 },
    { r: 0.82, spd: -0.065, ticks: 36, dash: [14, 6], w: 2.0 },
    { r: 0.64, spd: 0.09, ticks: 24, dash: [4, 8], w: 1.3 },
  ];

  for (let i = 0; i < rings.length; i++) {
    const rg = rings[i];
    const rad = radius * rg.r;
    ctx.save();
    ctx.rotate(opts.t * rg.spd);
    ctx.strokeStyle = hexRgba(i % 2 === 0 ? col1 : col2, 0.36 + vocal * 0.28);
    ctx.lineWidth = rg.w;
    ctx.setLineDash(rg.dash);
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vernier degree tick marks
    const tickLen = radius * (i === 0 ? 0.028 : 0.02);
    for (let k = 0; k < rg.ticks; k++) {
      const a = (k / rg.ticks) * Math.PI * 2;
      const major = k % 6 === 0 ? 1.8 : 1.0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (rad - tickLen * major), Math.sin(a) * (rad - tickLen * major));
      ctx.lineTo(Math.cos(a) * (rad + tickLen * 0.5), Math.sin(a) * (rad + tickLen * 0.5));
      ctx.stroke();

      // Glowing orbital bead on major cardinal points
      if (k % 9 === 0) {
        ctx.fillStyle = hexRgba('#FFF6D6', 0.65 + swell * 0.3);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rad, Math.sin(a) * rad, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 2. Tilted 3D Ecliptic Gyroscopic Ellipses (Ezekiel "wheel within a wheel")
  for (let e = 0; e < 3; e++) {
    ctx.save();
    ctx.rotate((e * Math.PI) / 3 + opts.t * 0.05 * (e % 2 === 0 ? 1 : -1));
    ctx.strokeStyle = hexRgba(col1, 0.24 + swell * 0.22);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.92, radius * (0.28 + 0.08 * Math.sin(opts.t * 0.4 + e)), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Optional 8-Pointed Bethlehem / Logos Star at Zenith
  if (opts.showStar !== false) {
    const sy = -radius * 0.82;
    const starR = radius * (0.14 + vocal * 0.05);
    const sg = ctx.createRadialGradient(0, sy, 0, 0, sy, starR * 1.8);
    sg.addColorStop(0, '#FFFFFF');
    sg.addColorStop(0.35, hexRgba(col1, 0.75));
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, sy, starR * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFF9E6';
    ctx.lineWidth = 1.5;
    for (let s = 0; s < 4; s++) {
      const sa = (s * Math.PI) / 4;
      const len = s % 2 === 0 ? starR * 1.6 : starR * 0.85;
      ctx.beginPath();
      ctx.moveTo(Math.cos(sa) * -len, sy + Math.sin(sa) * -len);
      ctx.lineTo(Math.cos(sa) * len, sy + Math.sin(sa) * len);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * BAROQUE DRAMATIST:
 * Draws an ornate suspended brass & ruby-glass Chancel Sanctuary Lamp / Thurible Censer
 * with triple suspension chains, pierced metalwork crown, glowing ruby vessel, flame, and smoke plumes.
 */
export function drawSanctuaryCenserLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opts: {
    t: number;
    brassColor?: string;
    rubyColor?: string;
    vocalEnergy?: number;
    swellEnergy?: number;
    emitSmoke?: boolean;
  },
) {
  const brass = opts.brassColor ?? '#E8B254';
  const ruby = opts.rubyColor ?? '#E03838';
  const vocal = opts.vocalEnergy ?? 0.45;
  const swell = opts.swellEnergy ?? 0.45;

  ctx.save();

  // 1. Warm radial Caravaggio sanctuary halo around the lamp
  const haloR = size * (4.2 + swell * 1.2);
  const hg = ctx.createRadialGradient(x, y, 0, x, y, haloR);
  hg.addColorStop(0, hexRgba('#FFF4D0', 0.78 + vocal * 0.2));
  hg.addColorStop(0.24, hexRgba(ruby, 0.45 + swell * 0.22));
  hg.addColorStop(0.58, hexRgba(brass, 0.18));
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Rising aromatic frankincense smoke curls above the censer
  if (opts.emitSmoke !== false) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let p = 0; p < 14; p++) {
      const prog = ((opts.t * 0.08 + p / 14) % 1);
      const sy = y - size * 0.4 - prog * size * 3.8;
      const sx = x + Math.sin(prog * 5.2 - opts.t * 0.7 + p) * size * (0.3 + prog * 1.4);
      const sr = size * (0.35 + prog * 1.35);
      const sa = Math.sin(prog * Math.PI) * (0.14 + swell * 0.12);
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, hexRgba('#FFE3B3', sa));
      sg.addColorStop(0.55, hexRgba(brass, sa * 0.5));
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. Triple brass suspension chains from top canopy to censer rim
  const topY = 0;
  ctx.strokeStyle = hexRgba(brass, 0.68);
  ctx.lineWidth = Math.max(1.2, size * 0.045);
  ctx.setLineDash([size * 0.12, size * 0.06]);
  for (const offset of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(x + offset * size * 0.25, topY);
    ctx.lineTo(x + offset * size, y - size * 0.2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 4. Pierced Gothic brass upper canopy & lower thurible bowl
  const bg = ctx.createLinearGradient(x - size, y, x + size, y);
  bg.addColorStop(0, '#3D260E');
  bg.addColorStop(0.45, brass);
  bg.addColorStop(0.55, '#FFF2C2');
  bg.addColorStop(1, '#4A2E10');

  // Ruby glass inner sanctuary vessel
  const rg = ctx.createRadialGradient(x, y - size * 0.1, size * 0.05, x, y, size * 0.65);
  rg.addColorStop(0, '#FFFFFF');
  rg.addColorStop(0.35, '#FFB84D');
  rg.addColorStop(0.75, ruby);
  rg.addColorStop(1, '#4A0810');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.48, y - size * 0.25);
  ctx.quadraticCurveTo(x - size * 0.58, y + size * 0.45, x, y + size * 0.62);
  ctx.quadraticCurveTo(x + size * 0.58, y + size * 0.45, x + size * 0.48, y - size * 0.25);
  ctx.closePath();
  ctx.fill();

  // Ornate brass collar & lower finial cone
  ctx.fillStyle = bg;
  ctx.fillRect(x - size * 0.62, y - size * 0.28, size * 1.24, size * 0.16);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.52, y + size * 0.28);
  ctx.quadraticCurveTo(x, y + size * 0.85, x, y + size * 1.05);
  ctx.quadraticCurveTo(x, y + size * 0.85, x + size * 0.52, y + size * 0.28);
  ctx.closePath();
  ctx.fill();

  // Living beeswax flame tip inside the ruby glass
  const flicker = Math.sin(opts.t * 4.2) * size * 0.06;
  ctx.fillStyle = '#FFFBE6';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, y - size * 0.28);
  ctx.quadraticCurveTo(x - size * 0.14, y - size * 0.55, x + flicker, y - size * (0.72 + vocal * 0.22));
  ctx.quadraticCurveTo(x + size * 0.14, y - size * 0.55, x + size * 0.12, y - size * 0.28);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ── 8. Master 6-Voice Art Director Council Optical & Expression Pass ─────────

/**
 * Applies the Art Director Council's high-expression contemporary visual direction:
 * tailored to each Council Director's signature lens so that all 72 visualizers
 * preserve their unique color palette, contrast, and bespoke art direction.
 */
export function renderCouncilOpticalPass(
  rc: WorshipRenderContext,
  vis?: WorshipVisualizerDef,
) {
  const { ctx, w, h, t, audio, params } = rc;
  const targetVis = vis ?? rc.visualizer;
  const dir: CouncilDirector = resolveDirectorLocal(targetVis);
  const visNum = targetVis?.number ?? 1;
  const visCat = targetVis?.category ?? 'calm-lyric';

  const leakAmt = params.lightLeaks ?? 0.65;
  const flareAmt = params.bokehFlare ?? 0.68;
  const grainAmt = params.textureGrain ?? 0.52;
  const punchAmt = params.colorPunch ?? 0.72;

  // Derive colors strictly from the visualizer's own curated palette so every card keeps its unique identity
  const rawC1 = targetVis?.palette?.[1] || '#2D5A88';
  const rawC2 = targetVis?.palette?.[2] || '#E5B84B';
  const rawC3 = targetVis?.palette?.[3] || '#FFE6A3';

  const p1 = punchHex(rawC1, 1.32 + punchAmt * 0.38, 0.05 * punchAmt);
  const p2 = punchHex(rawC2, 1.42 + punchAmt * 0.45, 0.07 * punchAmt);
  const p3 = punchHex(rawC3, 1.28 + punchAmt * 0.35, 0.04 * punchAmt);

  const isUptempo = visCat === 'uptempo-lyric';
  const isScripture = visCat === 'scripture-reading';
  const energy = isUptempo
    ? clamp01(0.42 + audio.pulse * 0.42 + audio.vocal * 0.32 + audio.shimmer * 0.22)
    : isScripture
    ? clamp01(0.28 + audio.vocal * 0.38 + audio.swell * 0.24)
    : clamp01(0.34 + audio.swell * 0.38 + audio.vocal * 0.34);

  // 1. Director-Specific Signature Optical / Architectural Accent Pass
  ctx.save();
  if (dir === 'Classical Mind') {
    // Classical Mind: Subtle Golden-Ratio / Imperial Corner Framing & Top Zenith Warmth
    const m = Math.min(w, h) * 0.032;
    ctx.strokeStyle = hexRgba(p2, 0.22 + audio.vocal * 0.16);
    ctx.lineWidth = 1;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  } else if (dir === 'Baroque Dramatist') {
    // Baroque Dramatist: Deep Caravaggio tenebrism perimeter + warm directional key-light spill
    const keyG = ctx.createRadialGradient(w * 0.22, h * 0.18, 0, w * 0.22, h * 0.18, Math.max(w, h) * 0.65);
    keyG.addColorStop(0, hexRgba(p2, clamp01(punchAmt * (0.18 + energy * 0.16))));
    keyG.addColorStop(0.55, hexRgba(p1, clamp01(punchAmt * 0.08)));
    keyG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = keyG;
    ctx.fillRect(0, 0, w, h);
  } else if (dir === 'Radical Minimalist') {
    // Radical Minimalist: Clean Turrell luminous aperture vignette & crisp horizon hairline
    const apG = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    apG.addColorStop(0, hexRgba(p2, clamp01(punchAmt * 0.14)));
    apG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = apG;
    ctx.fillRect(0, 0, w, h);
  } else if (dir === 'Futurist') {
    // Futurist: Spectral prism caustics + anamorphic horizon dispersion
    drawPrismCaustics(ctx, w, h, {
      t: t * (isUptempo ? 1.1 : 0.6),
      intensity: clamp01(leakAmt * (0.42 + energy * 0.45)),
      colorA: p2,
      colorB: p3,
      colorC: p1,
      seed: visNum * 13,
    });
  } else if (dir === 'World-Eclectic Traveller') {
    // World-Eclectic Traveller: Warm mineral pigment aura & subtle geometric border ticks
    const minG = ctx.createRadialGradient(w * 0.5, h * 0.22, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    minG.addColorStop(0, hexRgba(p2, clamp01(punchAmt * 0.16)));
    minG.addColorStop(0.6, hexRgba(p1, clamp01(punchAmt * 0.10)));
    minG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = minG;
    ctx.fillRect(0, 0, w, h);
  } else if (dir === 'Rebellious Hand') {
    // Rebellious Hand: Tactile artisan copper-gold edge warmth
    const rebG = ctx.createRadialGradient(w * 0.82, h * 0.78, 0, w * 0.82, h * 0.78, Math.max(w, h) * 0.58);
    rebG.addColorStop(0, hexRgba(p2, clamp01(punchAmt * 0.18)));
    rebG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = rebG;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // 2. 35mm Kodak Film Light Leaks (hugs edges, preserves center contrast)
  if (leakAmt > 0.05) {
    drawFilmLightLeaks(ctx, w, h, {
      t: t * (isUptempo ? 0.85 : 0.45),
      intensity: clamp01(leakAmt * (0.42 + energy * 0.38)),
      warmHex: p2,
      coolHex: p1,
      roseHex: mixHex(p2, '#FF6B8B', 0.35),
      seed: visNum * 7,
    });
  }

  // 3. Multi-Plane Polygonal Cinema Aperture Bokeh
  if (flareAmt > 0.05) {
    const bokehCount = w < 500 ? 10 : isScripture ? 16 : isUptempo ? 28 : 22;
    drawCinematicBokeh(ctx, w, h, {
      count: bokehCount,
      palette: [p2, p3, p1],
      t: t * (isUptempo ? 0.95 : 0.55),
      intensity: clamp01(flareAmt * (0.45 + energy * 0.45)),
      anamorphic: dir === 'Futurist' || dir === 'Classical Mind' || dir === 'Baroque Dramatist',
      seed: visNum * 29,
    });

    // 4. Key-Light Optical Lens Flare (positioned in the upper perimeter so it never blinds the text)
    const flareAngle = t * 0.16 + visNum * 1.37;
    const fx = w * (0.5 + Math.cos(flareAngle) * 0.34);
    const fy = h * (0.14 + Math.sin(flareAngle * 0.7) * 0.06);
    drawOpticalLensFlare(ctx, w, h, {
      x: fx,
      y: fy,
      intensity: clamp01(flareAmt * (isScripture ? 0.32 : 0.48) * (0.48 + energy * 0.52)),
      primaryColor: p3,
      secondaryColor: p2,
      anamorphic: dir === 'Futurist' || dir === 'Radical Minimalist',
      t,
    });
  }

  // 5. Tactile Material Weave & 24fps 35mm Film Grain
  if (w >= 320 && grainAmt > 0.04) {
    drawTactileTextureOverlay(ctx, w, h, t, grainAmt, dir);
  }
}
