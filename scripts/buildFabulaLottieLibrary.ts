// buildFabulaLottieLibrary — the Fabula Motion Foundry.
//
// Generates the .lottie packages for services/fabulaLottieLibrary.ts. Two things decide what a
// piece looks like, and they are deliberately separate:
//
//   the MOTIF   — its composition, from the asset's own description ("twelve luminous blades"),
//   the COUNCIL — its palette, grid, mark, line weight and texture, from the art direction spec.
//
// The first version of this foundry only had the second half. Layout came from the asset's index
// in the array, so all six lower thirds were the same three diagonal bars and all six transitions
// the same rounded square; the pieces differed from their siblings by colour alone and none of
// them performed the motion their own description promised. Everything below the palette helpers
// exists to fix that.
//
// Run with: npx tsx scripts/buildFabulaLottieLibrary.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { FABULA_LOTTIE_LIBRARY, type FabulaLottieAsset } from '../services/fabulaLottieLibrary';

const outDir = join(process.cwd(), 'public', 'fabula', 'lottie');

/* ─── Lottie primitives ────────────────────────────────────────────── */

type RGB = [number, number, number, number];
const rgb = (hex: string): RGB => {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255, 1];
};
const ease = { i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } };
const key = (times: number[], values: number[][]) => ({
  a: 1,
  k: times.map((t, i) => (i === times.length - 1 ? { t, s: values[i] } : { t, s: values[i], e: values[i + 1], ...ease })),
});
const fixed = (value: number | number[]) => ({ a: 0, k: value });

const rect = (w: number, h: number, r = 0, p: number[] = [0, 0]) => ({ ty: 'rc', p: fixed(p), s: fixed([w, h]), r: fixed(r), nm: 'Rect' });
const ellipse = (w: number, h: number, p: number[] = [0, 0]) => ({ ty: 'el', p: fixed(p), s: fixed([w, h]), nm: 'Ellipse' });
const poly = (points: number, radius: number, rot = 0) => ({ ty: 'sr', sy: 2, pt: fixed(points), p: fixed([0, 0]), r: fixed(rot), or: fixed(radius), os: fixed(0), nm: 'Poly' });
const fill = (c: RGB, o = 100) => ({ ty: 'fl', c: fixed(c), o: fixed(o), r: 1, nm: 'Fill' });
const stroke = (c: RGB, w: number, o = 100) => ({ ty: 'st', c: fixed(c), o: fixed(o), w: fixed(w), lc: 2, lj: 2, nm: 'Stroke' });
const groupTr = (extra: Record<string, unknown> = {}) => ({
  ty: 'tr', p: fixed([0, 0]), a: fixed([0, 0]), s: fixed([100, 100]), r: fixed(0), o: fixed(100), sk: fixed(0), sa: fixed(0), nm: 'Transform', ...extra,
});

interface Ctx { item: FabulaLottieAsset; frames: number; W: number; H: number; ind: () => number; }

/** One shape layer. Shape coordinates are relative to the layer position. */
function layer(ctx: Ctx, nm: string, items: unknown[], ks: Record<string, unknown>, bm = 0) {
  return {
    ddd: 0, ind: ctx.ind(), ty: 4, nm, sr: 1,
    ks: { o: fixed(100), r: fixed(0), a: fixed([0, 0, 0]), s: fixed([100, 100, 100]), ...ks },
    ao: 0, shapes: [{ ty: 'gr', it: [...items, groupTr()], nm }],
    ip: 0, op: ctx.frames, st: 0, bm,
  };
}

/** Is the council member's ground a light one? Half of them work on paper, half on a dark field. */
const lightGround = (item: FabulaLottieAsset): boolean => {
  const [r, g, b] = rgb(item.colors[0]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
};

/**
 * Blend mode for a council member's declared texture — but only where that mode means anything.
 *
 * Multiply is a PAPER effect: it darkens what is beneath it. On CEREMONIAL's #171329 ground it
 * multiplied every gold and teal node down to black, which is why the constellation rendered as an
 * empty ring. A texture has to be interpreted against the ground it sits on, not applied blind.
 */
const textureBlend = (item: FabulaLottieAsset): number => {
  const light = lightGround(item);
  switch (item.texture) {
    case 'GLOW': return light ? 0 : 8;    // hard light only reads as emission against a dark field
    case 'GRAIN': return light ? 3 : 0;   // multiply is ink into paper; on a dark ground it erases
    case 'GLASS': return light ? 5 : 8;   // overlay on paper, hard light on a dark ground
    default: return 0;
  }
};

const series = (item: FabulaLottieAsset, i: number): RGB => rgb(item.colors[2 + (i % Math.max(1, item.colors.length - 2))] || item.colors[1]);
const fg = (item: FabulaLottieAsset): RGB => rgb(item.colors[1]);
const bg = (item: FabulaLottieAsset): RGB => rgb(item.colors[0]);

/** The mark the council specified, at a given size. Bars stay bars; the SHAPE of them changes. */
function markShape(item: FabulaLottieAsset, w: number, h: number) {
  switch (item.mark) {
    case 'SHARP': return rect(w, h, 0);
    case 'ROUNDED': return rect(w, h, Math.min(w, h) * 0.28);
    case 'CAPSULE': return rect(w, h, Math.min(w, h) * 0.5);
    case 'DOT': return ellipse(Math.min(w, h) * 1.05, Math.min(w, h) * 1.05);
    case 'TICK': return rect(Math.max(2, w * 0.22), h, 0);
    case 'FACET': return poly(6, Math.min(w, h) * 0.62, 30);
    default: return rect(w, h, 0);
  }
}

/* ─── Motif generators ─────────────────────────────────────────────── */
// Each returns the layers ABOVE the ground, front to back.

/** Blades, petals or fan leaves radiating from a point and turning. */
function radialMotif(ctx: Ctx, opts: { count: number; inner: number; outer: number; spread: number; cx?: number; cy?: number; closing?: boolean; rounded?: number }) {
  const { item, frames, W, H } = ctx;
  const cx = opts.cx ?? W / 2, cy = opts.cy ?? H / 2;
  const out: unknown[] = [];
  for (let i = 0; i < opts.count; i++) {
    const a = (i / opts.count) * opts.spread - opts.spread / 2;
    const len = opts.outer - opts.inner;
    const wBlade = (2 * Math.PI * opts.outer / opts.count) * 0.62;
    const phase = Math.round((i / opts.count) * frames * 0.35);
    // A blade is a bar standing off the centre; rotating the group swings it round.
    const shape = rect(wBlade, len, opts.rounded ?? wBlade * 0.2, [0, -(opts.inner + len / 2)]);
    const items = [shape, fill(series(item, i)), item.lineWidth ? stroke(fg(item), item.lineWidth, 55) : null].filter(Boolean);
    out.push(layer(ctx, `Blade ${i + 1}`, items, {
      p: fixed([cx, cy, 0]),
      r: opts.closing
        ? key([phase, Math.round(frames * 0.55), frames], [[a - 40], [a], [a + 40]])
        : key([phase, frames], [[a - 18], [a + 18]]),
      s: key([phase, Math.min(frames - 4, phase + 14), Math.round(frames * 0.8), frames],
        [[0, 0, 100], [100, 100, 100], [100, 100, 100], opts.closing ? [0, 0, 100] : [100, 100, 100]]),
      o: key([phase, Math.min(frames - 4, phase + 10), frames - 6, frames], [[0], [100], [100], [0]]),
    }, textureBlend(item)));
  }
  return out;
}

/** Concentric rings: measures read against each other. */
function ringMotif(ctx: Ctx, opts: { count: number; max: number; cx?: number; cy?: number; filled?: boolean }) {
  const { item, frames, W, H } = ctx;
  const cx = opts.cx ?? W / 2, cy = opts.cy ?? H / 2;
  const out: unknown[] = [];
  for (let i = opts.count; i >= 1; i--) {
    const d = opts.max * (i / opts.count);
    const phase = Math.round(((opts.count - i) / opts.count) * frames * 0.4);
    const items = opts.filled
      ? [ellipse(d, d), fill(series(item, i))]
      : [ellipse(d, d), stroke(series(item, i), Math.max(3, (item.lineWidth || 3) * 2.2))];
    out.push(layer(ctx, `Ring ${i}`, items, {
      p: fixed([cx, cy, 0]),
      s: key([phase, Math.min(frames - 6, phase + 20), frames], [[30, 30, 100], [100, 100, 100], [108, 108, 100]]),
      o: key([phase, Math.min(frames - 6, phase + 14), frames - 8, frames], [[0], [opts.filled ? 92 : 100], [90], [0]]),
    }, textureBlend(item)));
  }
  return out;
}

/** A ranked series rising from a baseline. */
function barsMotif(ctx: Ctx, opts: { count: number; baseline: number; maxH: number; vertical?: boolean }) {
  const { item, frames, W } = ctx;
  const out: unknown[] = [];
  const slot = (W * 0.82) / opts.count;
  const bw = slot * 0.56;
  for (let i = 0; i < opts.count; i++) {
    const x = W * 0.09 + slot * (i + 0.5);
    // A deliberate ranking, so the piece reads as ordered data rather than as noise.
    const h = opts.maxH * (1 - i / (opts.count + 2)) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)));
    const phase = Math.round((i / opts.count) * frames * 0.45);
    const items = item.mark === 'DOT'
      ? [rect(Math.max(2, bw * 0.10), h, 0), ellipse(bw * 0.78, bw * 0.78, [0, -h / 2]), fill(series(item, i))]
      : [markShape(item, bw, h), fill(series(item, i))];
    out.push(layer(ctx, `Bar ${i + 1}`, items, {
      p: fixed([x, opts.baseline - h / 2, 0]),
      s: key([phase, Math.min(frames - 6, phase + 16), frames], [[100, 0, 100], [100, 100, 100], [100, 100, 100]]),
      a: fixed([0, h / 2, 0]),
      o: key([phase, Math.min(frames - 6, phase + 8), frames], [[0], [100], [100]]),
    }, textureBlend(item)));
  }
  return out;
}

/** Broad bands travelling across the frame: water, ribbon, spectrum. */
function bandMotif(ctx: Ctx, opts: { count: number; angle: number; thickness: number; stagger: number; travel: number }) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  for (let i = 0; i < opts.count; i++) {
    const t = i / Math.max(1, opts.count - 1);
    const y = H * (0.14 + 0.72 * t);
    const phase = Math.round(t * frames * opts.stagger);
    const items = [rect(W * 1.5, opts.thickness, opts.thickness * 0.5), fill(series(item, i))];
    out.push(layer(ctx, `Band ${i + 1}`, items, {
      p: key([phase, frames], [[W / 2 - opts.travel, y, 0], [W / 2 + opts.travel, y, 0]]),
      r: fixed(opts.angle),
      o: key([phase, Math.min(frames - 6, phase + 12), frames - 8, frames], [[0], [86], [86], [0]]),
      s: key([phase, Math.min(frames - 6, phase + 14), frames], [[100, 20, 100], [100, 100, 100], [100, 100, 100]]),
    }, textureBlend(item)));
  }
  return out;
}

/** A grid of tiles that assemble, fold or converge. */
function tileMotif(ctx: Ctx, opts: { cols: number; rows: number; fold?: boolean; converge?: boolean }) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  const tw = W / opts.cols, th = H / opts.rows;
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const i = r * opts.cols + c;
      const x = tw * (c + 0.5), y = th * (r + 0.5);
      // Diagonal stagger: the wave crosses the frame instead of arriving all at once.
      const phase = Math.round(((c + r) / (opts.cols + opts.rows)) * frames * 0.55);
      const items = [rect(tw * 0.94, th * 0.94, opts.fold ? 0 : Math.min(tw, th) * 0.12), fill(series(item, i))];
      const from = opts.converge ? [W / 2 + (x - W / 2) * 2.2, H / 2 + (y - H / 2) * 2.2, 0] : [x, y, 0];
      out.push(layer(ctx, `Tile ${c}_${r}`, items, {
        p: opts.converge ? key([phase, Math.min(frames - 4, phase + 22), frames], [from, [x, y, 0], [x, y, 0]]) : fixed([x, y, 0]),
        s: opts.fold
          ? key([phase, Math.min(frames - 4, phase + 16), frames], [[0, 100, 100], [100, 100, 100], [100, 100, 100]])
          : key([phase, Math.min(frames - 4, phase + 16), frames], [[0, 0, 100], [100, 100, 100], [100, 100, 100]]),
        o: key([phase, Math.min(frames - 4, phase + 10), frames], [[0], [100], [100]]),
      }, textureBlend(item)));
    }
  }
  return out;
}

/** Nodes discovering their relationships, then holding. */
function networkMotif(ctx: Ctx, opts: { nodes: number }) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.34;
  const at = (i: number) => {
    const a = (i / opts.nodes) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  };
  // Edges first so the nodes sit on top of them.
  for (let i = 0; i < opts.nodes; i++) {
    const j = (i + 3) % opts.nodes;
    const [x0, y0] = at(i), [x1, y1] = at(j);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const phase = Math.round((i / opts.nodes) * frames * 0.5);
    const items = [rect(len, Math.max(3, (item.lineWidth || 3) * 1.4), 0), fill(series(item, i + 1), 95)];
    out.push(layer(ctx, `Edge ${i}`, items, {
      p: fixed([(x0 + x1) / 2, (y0 + y1) / 2, 0]),
      r: fixed(ang),
      s: key([phase, Math.min(frames - 6, phase + 18), frames], [[0, 100, 100], [100, 100, 100], [100, 100, 100]]),
      o: key([phase, Math.min(frames - 6, phase + 12), frames], [[0], [72], [72]]),
    }, textureBlend(item)));
  }
  for (let i = 0; i < opts.nodes; i++) {
    const [x, y] = at(i);
    const phase = Math.round((i / opts.nodes) * frames * 0.35);
    const size = Math.min(W, H) * (0.075 + (i % 3) * 0.022);
    out.push(layer(ctx, `Node ${i}`, [markShape(item, size, size), fill(series(item, i))], {
      p: fixed([x, y, 0]),
      s: key([phase, Math.min(frames - 6, phase + 14), Math.round(frames * 0.7), frames], [[0, 0, 100], [124, 124, 100], [100, 100, 100], [100, 100, 100]]),
      o: key([phase, Math.min(frames - 6, phase + 8), frames], [[0], [100], [100]]),
    }, textureBlend(item)));
  }
  return out;
}

/** Primary forms in orbit, or confetti arriving with a bounce. */
function orbitMotif(ctx: Ctx, opts: { count: number; scatter?: boolean }) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.26;
  for (let i = 0; i < opts.count; i++) {
    const a = (i / opts.count) * Math.PI * 2;
    const x = opts.scatter ? W * (0.12 + 0.76 * ((i * 0.61803398875) % 1)) : cx + Math.cos(a) * rad;
    const y = opts.scatter ? H * (0.2 + 0.6 * ((i * 0.41421356237) % 1)) : cy + Math.sin(a) * rad;
    const size = Math.min(W, H) * (0.10 + (i % 3) * 0.045);
    const phase = Math.round((i / opts.count) * frames * 0.4);
    // Three primary forms, cycled: the Bauhaus vocabulary rather than one repeated module.
    const prim = i % 3 === 0 ? ellipse(size, size) : i % 3 === 1 ? rect(size, size, 0) : poly(3, size * 0.62, 0);
    out.push(layer(ctx, `Form ${i + 1}`, [prim, fill(series(item, i))], {
      p: opts.scatter
        ? key([phase, Math.min(frames - 8, phase + 14), Math.min(frames - 4, phase + 22), frames], [[x, y - H * 0.3, 0], [x, y + H * 0.03, 0], [x, y, 0], [x, y, 0]])
        : fixed([x, y, 0]),
      r: opts.scatter ? key([phase, frames], [[-25], [14]]) : key([0, frames], [[0], [i % 2 ? -360 : 360]]),
      s: key([phase, Math.min(frames - 6, phase + 16), frames], [[0, 0, 100], [100, 100, 100], [100, 100, 100]]),
      o: key([phase, Math.min(frames - 6, phase + 8), frames], [[0], [100], [100]]),
    }, textureBlend(item)));
  }
  return out;
}

/** Nested frames receding: a portal with real depth. */
function portalMotif(ctx: Ctx, opts: { count: number }) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  for (let i = opts.count; i >= 1; i--) {
    const k = i / opts.count;
    const w = W * 0.82 * k, h = H * 0.82 * k;
    const phase = Math.round(((opts.count - i) / opts.count) * frames * 0.3);
    out.push(layer(ctx, `Frame ${i}`, [rect(w, h, Math.min(w, h) * 0.04), stroke(series(item, i), Math.max(3, (item.lineWidth || 4) * 1.6))], {
      p: fixed([W / 2, H / 2, 0]),
      s: key([phase, frames], [[92, 92, 100], [116, 116, 100]]),
      o: key([phase, Math.min(frames - 6, phase + 14), frames - 10, frames], [[0], [100], [86], [0]]),
    }, textureBlend(item)));
  }
  return out;
}

/** A precision gauge: an arc of ticks and a sweeping needle. */
function gaugeMotif(ctx: Ctx) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  const cx = W / 2, cy = H * 0.66, rad = Math.min(W, H) * 0.42;
  const ticks = 24;
  for (let i = 0; i < ticks; i++) {
    const a = -120 + (i / (ticks - 1)) * 240;
    const long = i % 4 === 0;
    const len = rad * (long ? 0.20 : 0.11);
    out.push(layer(ctx, `Tick ${i}`, [rect(long ? 5 : 3, len, 0, [0, -(rad - len / 2)]), fill(i > ticks * 0.72 ? series(item, 0) : fg(item), long ? 92 : 55)], {
      p: fixed([cx, cy, 0]),
      r: fixed(a),
      o: key([Math.round((i / ticks) * frames * 0.3), Math.round((i / ticks) * frames * 0.3) + 8, frames], [[0], [100], [100]]),
    }));
  }
  out.push(layer(ctx, 'Arc', [ellipse(rad * 2, rad * 2), stroke(series(item, 1), Math.max(3, (item.lineWidth || 3) * 1.2), 40)], { p: fixed([cx, cy, 0]) }));
  // The needle sweeps, overshoots, settles, then breathes — the confirmation the description promises.
  out.push(layer(ctx, 'Needle', [rect(6, rad * 0.92, 3, [0, -rad * 0.46]), fill(series(item, 0))], {
    p: fixed([cx, cy, 0]),
    r: key([0, Math.round(frames * 0.45), Math.round(frames * 0.62), Math.round(frames * 0.8), frames], [[-120], [96], [64], [82], [78]]),
  }, textureBlend(item)));
  out.push(layer(ctx, 'Hub', [ellipse(rad * 0.16, rad * 0.16), fill(fg(item))], { p: fixed([cx, cy, 0]) }));
  return out;
}

/** Soft bands flowing through time with relative weight. */
function streamMotif(ctx: Ctx, opts: { count: number }) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  for (let i = 0; i < opts.count; i++) {
    const t = i / Math.max(1, opts.count - 1);
    const thick = H * (0.09 + 0.13 * Math.abs(Math.sin(i * 2.1)));
    const y = H * (0.22 + 0.56 * t);
    const phase = Math.round(t * frames * 0.3);
    out.push(layer(ctx, `Stream ${i + 1}`, [rect(W * 1.1, thick, thick * 0.5), fill(series(item, i), 88)], {
      p: key([phase, Math.round(frames * 0.5), frames], [[W / 2, y + H * 0.05, 0], [W / 2, y - H * 0.03, 0], [W / 2, y + H * 0.02, 0]]),
      s: key([phase, Math.min(frames - 6, phase + 18), Math.round(frames * 0.7), frames], [[100, 30, 100], [100, 118, 100], [100, 92, 100], [100, 104, 100]]),
      o: key([phase, Math.min(frames - 6, phase + 12), frames], [[0], [88], [88]]),
    }, textureBlend(item)));
  }
  return out;
}

/** Leaves unfurling around a reading field. */
function leafMotif(ctx: Ctx, opts: { count: number }) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  const cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.36;
  for (let i = 0; i < opts.count; i++) {
    const a = (i / opts.count) * 360;
    const len = rad * (0.72 + 0.28 * Math.abs(Math.sin(i * 1.3)));
    const phase = Math.round((i / opts.count) * frames * 0.5);
    // A leaf is an ellipse standing off the centre; unfurling is a scale on its long axis.
    out.push(layer(ctx, `Leaf ${i + 1}`, [ellipse(len * 0.34, len, [0, -(rad * 0.42 + len / 2)]), fill(series(item, i), 90)], {
      p: fixed([cx, cy, 0]),
      r: key([phase, frames], [[a - 8], [a + 8]]),
      s: key([phase, Math.min(frames - 6, phase + 22), frames], [[24, 0, 100], [100, 100, 100], [100, 100, 100]]),
      o: key([phase, Math.min(frames - 6, phase + 12), frames], [[0], [92], [92]]),
    }, textureBlend(item)));
  }
  out.push(layer(ctx, 'Field', [ellipse(rad * 0.86, rad * 0.86), fill(bg(item), 88)], { p: fixed([cx, cy, 0]) }));
  return out;
}

/** Hard diagonals and a kinetic locator: the constructivist cut. */
function slashMotif(ctx: Ctx) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  for (let i = 0; i < 4; i++) {
    const phase = i * Math.round(frames * 0.07);
    const y = H * (0.24 + i * 0.18);
    out.push(layer(ctx, `Slash ${i + 1}`, [rect(W * 1.3, H * (0.10 - i * 0.014), 0), fill(series(item, i))], {
      p: fixed([W / 2, y, 0]),
      r: fixed(-14),
      s: key([phase, Math.min(frames - 6, phase + 12), frames], [[0, 100, 100], [100, 100, 100], [100, 100, 100]]),
      a: fixed([-W * 0.65, 0, 0]),
      o: key([phase, Math.min(frames - 6, phase + 6), frames], [[0], [100], [100]]),
    }, textureBlend(item)));
  }
  out.push(layer(ctx, 'Locator', [rect(H * 0.30, H * 0.30, 0), fill(series(item, 0))], {
    p: key([0, Math.round(frames * 0.4), frames], [[W * 0.06, H * 0.5, 0], [W * 0.16, H * 0.5, 0], [W * 0.14, H * 0.5, 0]]),
    r: key([0, frames], [[0], [90]]),
    s: key([0, Math.round(frames * 0.3), frames], [[0, 0, 100], [100, 100, 100], [100, 100, 100]]),
  }, textureBlend(item)));
  return out;
}

/** A nameplate: the slab and rules a lower third sets its type on. */
function platePart(ctx: Ctx, opts: { accentRule?: boolean } = {}) {
  const { item, frames, W, H } = ctx;
  const out: unknown[] = [];
  const px = W * 0.30, pw = W * 0.52;
  out.push(layer(ctx, 'Plate', [rect(pw, H * 0.44, item.mark === 'CAPSULE' ? H * 0.22 : 0), fill(fg(item), 12)], {
    p: fixed([px + pw / 2, H * 0.5, 0]),
    s: key([0, Math.round(frames * 0.22), frames], [[0, 100, 100], [100, 100, 100], [100, 100, 100]]),
    a: fixed([-pw / 2, 0, 0]),
  }));
  // Two type slugs: where the name and the role would set.
  out.push(layer(ctx, 'Name', [rect(pw * 0.62, H * 0.13, H * 0.02), fill(fg(item), 92)], {
    p: fixed([px + pw * 0.34, H * 0.42, 0]),
    s: key([Math.round(frames * 0.16), Math.round(frames * 0.36), frames], [[0, 100, 100], [100, 100, 100], [100, 100, 100]]),
    a: fixed([-pw * 0.31, 0, 0]),
  }));
  out.push(layer(ctx, 'Role', [rect(pw * 0.38, H * 0.07, H * 0.012), fill(fg(item), 55)], {
    p: fixed([px + pw * 0.21, H * 0.62, 0]),
    s: key([Math.round(frames * 0.26), Math.round(frames * 0.46), frames], [[0, 100, 100], [100, 100, 100], [100, 100, 100]]),
    a: fixed([-pw * 0.19, 0, 0]),
  }));
  if (opts.accentRule) {
    // The single intervention: one exact rule in the accent colour.
    out.push(layer(ctx, 'Signal Rule', [rect(W * 0.012, H * 0.52, 0), fill(series(item, 0))], {
      p: fixed([px - W * 0.02, H * 0.5, 0]),
      s: key([Math.round(frames * 0.1), Math.round(frames * 0.3), frames], [[100, 0, 100], [100, 100, 100], [100, 100, 100]]),
    }));
  }
  return out;
}

/* ─── Motif dispatch ───────────────────────────────────────────────── */

function motifLayers(ctx: Ctx): unknown[] {
  const { item, W, H } = ctx;
  const R = Math.min(W, H);
  switch (item.motif) {
    case 'RULE_PLATE': return [...platePart(ctx, { accentRule: true }), ...barsMotif(ctx, { count: 7, baseline: H * 0.86, maxH: H * 0.42 })];
    case 'FAN': return [...platePart(ctx), ...radialMotif(ctx, { count: 9, inner: H * 0.05, outer: H * 0.44, spread: 150, cx: W * 0.115, cy: H * 0.5 })];
    case 'CONFETTI': return [...platePart(ctx), ...orbitMotif(ctx, { count: 9, scatter: true })];
    case 'PULSE_RINGS': return [...platePart(ctx), ...ringMotif(ctx, { count: 4, max: H * 0.92, cx: W * 0.115, cy: H * 0.5 })];
    case 'WAVE_BANDS': return [...platePart(ctx), ...bandMotif(ctx, { count: 6, angle: -4, thickness: H * 0.10, stagger: 0.5, travel: W * 0.08 })];
    case 'SLASH': return [...platePart(ctx), ...slashMotif(ctx)];

    case 'ORBIT': return orbitMotif(ctx, { count: 9 });
    case 'CASCADE': return tileMotif(ctx, { cols: 3, rows: 5 });
    case 'HALO': return ringMotif(ctx, { count: 6, max: R * 0.94 });
    case 'PORTAL': return portalMotif(ctx, { count: 7 });
    case 'RHYTHM_FRAME': return [...portalMotif(ctx, { count: 2 }), ...barsMotif(ctx, { count: 9, baseline: H * 0.84, maxH: H * 0.40 })];
    case 'LEAF_RING': return leafMotif(ctx, { count: 11 });

    case 'BARS': return barsMotif(ctx, { count: 9, baseline: H * 0.84, maxH: H * 0.62 });
    case 'NETWORK': return networkMotif(ctx, { nodes: 10 });
    case 'RADIAL_BARS': return radialMotif(ctx, { count: 14, inner: R * 0.16, outer: R * 0.46, spread: 360 });
    case 'STREAM': return streamMotif(ctx, { count: 6 });
    case 'GAUGE': return gaugeMotif(ctx);
    case 'TILES': return tileMotif(ctx, { cols: 6, rows: 3 });

    case 'IRIS': return radialMotif(ctx, { count: 10, inner: R * 0.04, outer: R * 1.15, spread: 360, closing: true, rounded: R * 0.06 });
    case 'MOSAIC': return tileMotif(ctx, { cols: 10, rows: 6, fold: true });
    case 'CHROMA_BANDS': return bandMotif(ctx, { count: 7, angle: 0, thickness: H * 0.16, stagger: 0.35, travel: W * 0.5 });
    case 'RIBBONS': return bandMotif(ctx, { count: 5, angle: -8, thickness: H * 0.20, stagger: 0.45, travel: W * 0.7 });
    case 'BLADES': return radialMotif(ctx, { count: 12, inner: R * 0.02, outer: R * 1.2, spread: 360, closing: true });
    case 'CONVERGE': return tileMotif(ctx, { cols: 12, rows: 7, converge: true });
    default: return barsMotif(ctx, { count: 8, baseline: H * 0.8, maxH: H * 0.5 });
  }
}

/* ─── Grid, ground, assembly ───────────────────────────────────────── */

/** The council's grid, drawn faintly under the motif. */
function gridLayer(ctx: Ctx) {
  const { item, W, H } = ctx;
  const lw = Math.max(1, item.lineWidth || 1);
  const col = rgb(item.colors[1]);
  const shapes: unknown[] = [];
  if (item.grid === 'RULES') {
    for (let i = 1; i <= 9; i++) shapes.push(rect(W * 0.9, lw, 0, [0, -H / 2 + (H / 10) * i]));
  } else if (item.grid === 'DOTS') {
    const cols = 18, rows = Math.max(3, Math.round(cols * (H / W)));
    for (let x = 1; x <= cols; x++) for (let y = 1; y <= rows; y++) {
      shapes.push(ellipse(lw + 2, lw + 2, [-W / 2 + (W / (cols + 1)) * x, -H / 2 + (H / (rows + 1)) * y]));
    }
  } else if (item.grid === 'CROSSHAIR') {
    shapes.push(rect(W * 0.94, lw, 0, [0, 0]), rect(lw, H * 0.94, 0, [0, 0]));
    const tl = Math.min(W, H) * 0.07;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      shapes.push(rect(tl, lw, 0, [sx * W * 0.4, sy * H * 0.4]), rect(lw, tl, 0, [sx * W * 0.4, sy * H * 0.4]));
    }
  } else if (item.grid === 'RADIAL') {
    for (let i = 1; i <= 5; i++) { const d = Math.min(W, H) * 0.95 * (i / 5); shapes.push(ellipse(d, d)); }
  } else if (item.grid === 'CONTOUR') {
    for (let i = 1; i <= 7; i++) {
      shapes.push(ellipse(W * (0.55 + i * 0.06), H * 0.30 + i * 6, [W * 0.04 * ((i % 3) - 1), -H / 2 + (H / 8) * i]));
    }
  }
  if (!shapes.length) return null;
  // Visible, but never competing with the motif. The first build left this at 12% — invisible.
  shapes.push(stroke(col, lw, item.grid === 'DOTS' ? 30 : 26));
  return layer(ctx, 'Grid', shapes, { p: fixed([W / 2, H / 2, 0]) });
}

function buildAnimation(item: FabulaLottieAsset) {
  const fr = 30;
  const frames = Math.round(item.duration * fr);
  let n = 0;
  const ctx: Ctx = { item, frames, W: item.width, H: item.height, ind: () => ++n };

  const motif = motifLayers(ctx);
  const grid = gridLayer(ctx);

  const ground = layer(ctx, 'Ground', [
    rect(item.width, item.height, 0),
    fill(bg(item), item.category === 'TRANSITION' ? 40 : 100),
  ], { p: fixed([item.width / 2, item.height / 2, 0]) });

  // Front to back: motif, then the grid under it, then the ground.
  const layers = [...motif, ...(grid ? [grid] : []), ground];
  return { v: '5.12.2', fr, ip: 0, op: frames, w: item.width, h: item.height, nm: item.name, ddd: 0, assets: [], layers, markers: [] };
}

/* ─── Build & export ───────────────────────────────────────────────── */

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const item of FABULA_LOTTIE_LIBRARY) {
    const animation = buildAnimation(item);
    const manifest = {
      version: '1.0', generator: 'Plajah Fabula Motion Foundry 2.0', author: 'Plajah',
      animations: [{ id: item.id, name: item.name, loop: true, autoplay: true, speed: 1, direction: 1, playMode: 'normal' }],
      activeAnimationId: item.id,
      custom: {
        license: item.license, category: item.category, styleEra: item.styleEra,
        description: item.description, colors: item.colors, artDirector: item.artDirector,
        motif: item.motif, grid: item.grid, mark: item.mark, texture: item.texture,
      },
    };
    const archive = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      [`animations/${item.id}.json`]: strToU8(JSON.stringify(animation)),
    }, { level: 9 });
    await writeFile(join(outDir, `${item.id}.lottie`), archive);
  }
  await writeFile(join(outDir, 'catalog.json'), JSON.stringify({ version: 2, generatedAt: new Date().toISOString(), license: 'CC0-1.0', assets: FABULA_LOTTIE_LIBRARY }, null, 2));
  await writeFile(join(outDir, 'LICENSE.txt'), 'Fabula Original Motion Library\n\nTo the extent possible under law, Plajah has waived all copyright and related or neighboring rights to these generated animation files under CC0 1.0 Universal.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n');
  console.log(`Built ${FABULA_LOTTIE_LIBRARY.length} .lottie files -> ${outDir}`);
}

void main();
