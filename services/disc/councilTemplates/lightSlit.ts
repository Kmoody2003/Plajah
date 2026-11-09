// Light Slit — 4K Collector's Edition.
// Animation lead: The Abstract 3D Loop Artist (30 fps on ones, ease-in-out; one material, one motion,
// an ending that is the beginning). Graphic designer: The Chrome Broadcast Designer (chrome type, the
// slit-scan streak, reflection). Lighting director: pure black ground, a narrow 1000-nit vertical slit
// with soft bloom, selection spills a horizontal beam, the slit breathes on a slow 12 s cycle.
// Structure: one vertical slit of light carries every item. Items hang off it as hairline notches;
// the selected item is where the beam spills out of the slit as a flat wedge of light.
import { button as kitButton, glow, linear, txt, T, W, H, type Ctx, type Design, type Item, type O, type State } from './kit';

/** Every button state carries an invisible gradient so its SVG has a <defs>: the font embedder
 *  (services/fabula/broadcastFontEmbed) only injects @font-face into an existing <defs>. */
const FONT_DEFS = () => T.rect(0, 0, 2, 2, '#000000', { opacity: 0, gradient: linear(0, [['#000000', 0, 0], ['#000000', 1, 0]]), label: 'defs' });
const button: typeof kitButton = (item, x, y, w, h, draw, nav) => kitButton(item, x, y, w, h, s => [FONT_DEFS(), ...draw(s)], nav);

const BLACK = '#000000', CORE = '#F7FAFF', BLOOM = '#8EC5FF', STEEL = '#B4BECC', DIM = '#7A8494', FAINT = '#2C333D';
const BEAM = '#E4F0FF', BEAM_EDGE = '#9CC6FF', AMBER = '#FFC56E', AMBER_EDGE = '#E89A3A', INK = '#03060B';
const CHROME = linear(90, [['#FFFFFF', 0], ['#DCE5F0', 0.42], ['#6F7A8C', 0.5], ['#AEB9C8', 0.62], ['#EEF3FA', 1]]);

const P = (x: number, y: number, w: number, h: number, d: string, fill: string, o: T.ShapeOpts = {}) => T.path(x, y, w, h, d, fill, { ...o, origin: { x: 0, y: 0, w, h } });
/** Rough width of Michroma caps (it is a wide face). */
const wide = (s: string, size: number, tracking = 0) => s.length * size * (0.82 + tracking);
const fit = (s: string, maxW: number, size: number, tracking = 0) => {
  if (wide(s, size, tracking) <= maxW) return s;
  let t = s; while (t.length > 3 && wide(t + '…', size, tracking) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
};
const two = (n?: number) => (n == null ? '' : String(n).padStart(2, '0'));

/** The slit itself: hot core, tight bloom and a wide soft halo, ends tapering into the black. */
function slit(x: number, y0: number, y1: number, strength = 1): O[] {
  const len = y1 - y0, mid = (y0 + y1) / 2;
  const taper = (c: string, peak: number) => linear(90, [[c, 0, 0], [c, 0.12, peak], [c, 0.88, peak], [c, 1, 0]]);
  return [
    glow(x, mid, 260, len / 2 + 80, BLOOM, 0.10 * strength, 'Slit halo'),
    T.rect(x - 22, y0, 44, len, BLOOM, { gradient: linear(0, [[BLOOM, 0, 0], [BLOOM, 0.5, 0.38 * strength], [BLOOM, 1, 0]]), label: 'Slit bloom' }),
    T.rect(x - 7, y0 + 6, 14, len - 12, '#CFE5FF', { gradient: taper('#CFE5FF', 0.75 * strength), label: 'Slit glow' }),
    T.rect(x - 2, y0, 4, len, CORE, { gradient: taper(CORE, 1), label: 'Slit core' }),
  ];
}

/** The monolith: black everywhere, the film barely there behind black glass. */
function monolith(veil = 0.9): O[] {
  return [
    T.rect(0, 0, W, H, BLACK, { gradient: linear(0, [[BLACK, 0, 1], [BLACK, 0.45, veil + 0.06], [BLACK, 1, veil - 0.1]]), label: 'Black glass' }),
    T.rect(0, H - 220, W, 220, BLACK, { gradient: linear(90, [[BLACK, 0, 0], [BLACK, 1, 0.9]]), label: 'Floor fall-off' }),
  ];
}

/**
 * A label hanging off the slit. `side` is where the label sits relative to the slit (the button's
 * slit edge is x=0 for 'right', x=w for 'left'). Normal: a hairline notch + steel label.
 * Selected: the beam spills out of the slit as a flat wedge; the label turns to ink inside it.
 */
function hang(label: string, w: number, h: number, s: State, side: 'right' | 'left', o: { meta?: string; size?: number; beam?: number } = {}): O[] {
  const on = s !== 'normal', act = s === 'activated';
  const size = o.size ?? 30, beam = Math.min(w, o.beam ?? w), cy = h / 2;
  const out: O[] = [];
  const mx = (x: number) => (side === 'right' ? x : w - x); // mirror for left-hanging labels
  const tw = w - 48 - (o.meta ? 150 : 0);
  const lab = fit(label.toUpperCase(), tw - 20, size, 0.14);
  // The bright core always covers the writing (and the meta, when there is one).
  const core = Math.min(w - 8, Math.max(beam * 0.6, o.meta ? w - 8 : 48 + wide(lab, size, 0.14) + 36));
  const tail = Math.min(w, core + 320), taper = Math.min(w, core + 150);
  if (on) {
    const fill = act ? AMBER : BEAM, edge = act ? AMBER_EDGE : BEAM_EDGE;
    const seg = (a: number, b: number, s0: number, s1: number) => {
      const pts = [[a, cy - s0], [b, cy - s1], [b, cy + s1], [a, cy + s0]];
      return 'M' + pts.map(([x, y]) => `${mx(x)} ${y}`).join(' L') + ' Z';
    };
    // The spill: a flat beam that leaves the slit nearly label-high and widens a little.
    // Past the writing the beam tapers to a slit-scan streak (flat steps, no gradient in a button).
    out.push(P(0, 0, w, h, seg(core - 2, tail, 3, 1), edge, { opacity: 0.7, label: 'Streak' }));
    out.push(P(0, 0, w, h, seg(core - 2, taper, h / 2 - 8, 3), edge, { opacity: 0.45, label: 'Beam taper' }));
    out.push(P(0, 0, w, h, seg(0, core + 18, h / 2 - 10, h / 2 - 5), edge, { opacity: 0.6, label: 'Beam spill' }));
    out.push(P(0, 0, w, h, seg(0, core, h / 2 - 12, h / 2 - 8), fill, { label: 'Beam' }));
    out.push(T.rect(side === 'right' ? 0 : w - 8, 4, 8, h - 8, CORE, { label: 'Slit flare' }));
  } else {
    out.push(T.rect(side === 'right' ? 0 : w - 22, cy - 1, 22, 2, STEEL, { opacity: 0.8, label: 'Notch' }));
  }
  const tx = side === 'right' ? 48 : 0;
  const color = on ? INK : STEEL;
  out.push(txt(side === 'right' ? tx : (o.meta ? 150 : 0) + 20, cy - size * 0.62, tw - 20, lab, size, 'michroma', color, { tracking: 0.14, align: side === 'right' ? 'left' : 'right' }));
  if (o.meta) out.push(txt(side === 'right' ? w - 150 - 26 : 26, cy - 15, 150, o.meta, 24, 'sora', on ? INK : DIM, { align: side === 'right' ? 'right' : 'left', weight: 500 }));
  return out;
}

/** Chrome caps set by hand (Michroma is wide; canvas metrics may not have it yet): the largest size
 *  that fits in two lines, each line its own right-aligned text. */
function chromeHead(text: string, right: number, top: number, maxW: number, maxSize: number, tracking = 0.06): { objs: O[]; bottom: number } {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  let size = maxSize, lines: string[] = [];
  for (; size >= 34; size -= 2) {
    lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && wide(t, size, tracking) > maxW) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    if (lines.length <= 2 && lines.every(l => wide(l, size, tracking) <= maxW)) break;
  }
  const pitch = Math.round(size * 1.14);
  const objs = lines.map((l, i) => T.text(right - maxW, top + i * pitch, maxW, l, { size, font: 'michroma', color: '#E6ECF4', gradient: CHROME, tracking, align: 'right', wrap: false }));
  return { objs, bottom: top + lines.length * pitch };
}

const formatTag = (ctx: Ctx) => (ctx.uhd ? '4K ULTRA HD  ·  HDR' : 'BLU-RAY  ·  1080P');

/** Title block, right-aligned to the slit: chrome caps, a steel rule running into the light. */
function titleBlock(ctx: Ctx, right: number, top: number, maxW: number): O[] {
  const head = chromeHead(ctx.title, right, top, maxW, 70);
  const y = head.bottom + 18;
  return [
    ...head.objs,
    T.rect(right - 260, y, 260, 2, STEEL, { gradient: linear(0, [[STEEL, 0, 0], [STEEL, 1, 1]]), label: 'Chrome rule' }),
    txt(right - maxW, y + 22, maxW, formatTag(ctx), 24, 'michroma', BLOOM, { align: 'right', tracking: 0.3 }),
    txt(right - maxW, y + 62, maxW, ctx.tagline, 28, 'sora', DIM, { align: 'right', weight: 300 }),
  ];
}

const MAIN_X = 820;

export const lightSlit: Design = {
  id: 'collector4k',
  background: ctx => (ctx.main ? { kind: 'title', value: '#05070A', titleId: ctx.main.id, fromSec: Math.min(900, ctx.main.source.durationSec * 0.42), loopSec: 24 } : { kind: 'color', value: BLACK }),
  subBackground: () => ({ kind: 'color', value: BLACK }),

  main(ctx, items) {
    const art: O[] = [...monolith(0.9), ...slit(MAIN_X, 96, 984)];
    const pitch = 92, h = 72;
    const y0 = Math.round(540 - (items.length * pitch) / 2 + (pitch - h) / 2);
    art.push(...titleBlock(ctx, MAIN_X - 72, Math.max(120, y0 - 10), 620));
    const buttons = items.map((it, i) => button(it, MAIN_X + 2, y0 + i * pitch, 780, h, s => hang(it.label, 780, h, s, 'right', { size: it.role === 'primary' ? 34 : 30, beam: 640 })));
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    const X = 960, FW = 400, FH = 225, GAP = 14;
    const art: O[] = [...monolith(1), ...slit(X, 112, 900, 0.9),
      txt(192, 112, 520, 'SCENE SELECTION', 28, 'michroma', BLOOM, { tracking: 0.3 }),
      txt(192, 156, 520, ctx.title.toUpperCase(), 24, 'michroma', DIM, { tracking: 0.2 }),
    ];
    if (pages > 1) art.push(txt(1728 - 400, 112, 400, `${two(page + 1)} / ${two(pages)}`, 28, 'michroma', STEEL, { align: 'right', tracking: 0.2 }));
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    const rowY = (r: number) => 190 + r * (FH + 30);
    const buttons = chapters.map((it, i) => {
      const left = i % 2 === 0, r = Math.floor(i / 2);
      const x = left ? X - GAP - FW : X + GAP, y = rowY(r);
      // Caption on the far side of the frame, away from the light.
      const cx = left ? 96 : X + GAP + FW + 28, cw = left ? x - 28 - 96 : 1824 - cx;
      const al = left ? 'right' : 'left';
      art.push(txt(cx, y + 56, cw, two(it.index), 36, 'michroma', BLOOM, { align: al, tracking: 0.1 }));
      art.push(txt(cx, y + 108, cw, fit(it.label, cw, 28, -0.32), 28, 'sora', STEEL, { align: al, weight: 400 }));
      art.push(txt(cx, y + 150, cw, it.meta || '', 24, 'sora', DIM, { align: al, weight: 300 }));
      // A hairline tether from slit to frame.
      art.push(T.rect(left ? x + FW : X, y + FH / 2 - 1, GAP, 2, STEEL, { opacity: 0.7 }));
      return button(it, x, y, FW, FH, s => {
        const on = s !== 'normal', act = s === 'activated';
        const lit = act ? AMBER : CORE, edgeX = left ? FW - 10 : 0;
        const o: O[] = [T.rect(1, 1, FW - 2, FH - 2, 'none', { stroke: on ? (act ? AMBER_EDGE : BEAM_EDGE) : FAINT, strokeWidth: on ? 4 : 2, label: 'Frame' })];
        if (on) {
          // The beam enters the frame from the slit side.
          const d = left ? `M${FW} 20 L${FW - 150} 0 L${FW - 150} ${FH} L${FW} ${FH - 20} Z` : `M0 20 L150 0 L150 ${FH} L0 ${FH - 20} Z`;
          o.push(P(0, 0, FW, FH, d, lit, { opacity: 0.22, label: 'Light leak' }));
          o.push(T.rect(edgeX, 0, 10, FH, lit, { label: 'Lit edge' }));
        } else o.push(T.rect(left ? FW - 3 : 0, 0, 3, FH, STEEL, { opacity: 0.6 }));
        return o;
      });
    });
    // Previous / Back / Next sit at the foot of the slit; the beam spills sideways out of its end.
    const foot = 940, order = ['nav-prev', 'back', 'nav-next'];
    nav.forEach(it => {
      const kind = it.role === 'back' ? 'back' : it.label === 'Previous' ? 'nav-prev' : 'nav-next';
      const slot = order.indexOf(kind);
      const bw = kind === 'back' ? 300 : 360, h = 64;
      const x = slot === 1 ? X - bw / 2 : slot === 0 ? X - 170 - bw : X + 170;
      if (slot === 1) buttons.push(button(it, x, foot, bw, h, s => {
        const on = s !== 'normal', act = s === 'activated';
        const o: O[] = [];
        if (on) o.push(P(0, 0, bw, h, `M${bw / 2 - 16} 0 L${bw / 2 + 16} 0 L${bw} ${h / 2} L${bw / 2 + 16} ${h} L${bw / 2 - 16} ${h} L0 ${h / 2} Z`, act ? AMBER : BEAM));
        else o.push(T.rect(bw / 2 - 1, 0, 2, 14, STEEL, { opacity: 0.8 }));
        o.push(txt(0, h / 2 - 18, bw, it.label.toUpperCase(), 28, 'michroma', on ? INK : STEEL, { align: 'center', tracking: 0.16 }));
        return o;
      }));
      else buttons.push(button(it, x, foot, bw, h, s => hang(it.label, bw, h, s, slot === 0 ? 'left' : 'right', { size: 28 })));
    });
    return { art, buttons };
  },

  list(ctx, heading, kind, items) {
    const rows = items.filter(i => i.role !== 'back'), back = items.find(i => i.role === 'back');
    // Long runs (a big box set) hang off both sides of the slit; otherwise the left side is the margin.
    const split = rows.length > 8 && !rows.some(r => r.sub);
    const X = split ? 960 : 760;
    const art: O[] = [...monolith(1), ...slit(X, 96, 984, 0.95)];
    if (split) {
      const head = chromeHead(heading, X - 64, 100, 760, 40, 0.08);
      art.push(...head.objs, txt(X + 64, 112, 760, ctx.title.toUpperCase(), 24, 'michroma', DIM, { tracking: 0.2 }));
      const per = Math.ceil(rows.length / 2), y0 = Math.max(230, head.bottom + 60);
      const pitch = Math.min(84, Math.floor((900 - y0) / per)), h = Math.min(68, pitch - 8), bw = 760;
      const buttons = rows.map((it, i) => {
        const left = i < per, y = y0 + (left ? i : i - per) * pitch;
        const label = it.index != null ? `${two(it.index)}  ${it.label}` : it.label;
        return button(it, left ? X - 2 - bw : X + 2, y, bw, h, s => hang(label, bw, h, s, left ? 'left' : 'right', { meta: it.meta, size: 28 }));
      });
      if (back) buttons.push(button(back, X + 2, Math.max(y0 + per * pitch + 16, 920), 520, 64, s => hang(back.label, 520, 64, s, 'right', { size: 28, beam: 400 })));
      return { art, buttons };
    }
    const head = chromeHead(heading, X - 64, 150, X - 64 - 120, 46, 0.08);
    art.push(...head.objs, T.rect(X - 64 - 200, head.bottom + 14, 200, 2, STEEL, { gradient: linear(0, [[STEEL, 0, 0], [STEEL, 1, 1]]) }));
    art.push(txt(120, head.bottom + 34, X - 64 - 120, ctx.title.toUpperCase(), 24, 'michroma', DIM, { align: 'right', tracking: 0.2 }));
    const groups = new Set(rows.map(r => r.sub).filter(Boolean)).size;
    let y = Math.max(300, head.bottom + 96), group = '';
    const pitch = Math.max(56, Math.min(84, Math.floor((880 - y) / Math.max(1, rows.length + Math.max(0, groups - 1) * 0.5))));
    const h = Math.min(68, pitch - 8);
    const buttons = rows.map(it => {
      if (it.sub && it.sub !== group) {
        if (group) y += Math.round(pitch * 0.5);
        group = it.sub;
      }
      // Left of the slit: the group name (once) or the index — the slit is the spine of the page.
      const leftText = it.sub ? (art.some(o => o.text === it.sub!.toUpperCase()) ? '' : it.sub.toUpperCase()) : two(it.index);
      if (leftText) art.push(txt(192, y + h / 2 - 16, X - 48 - 192, leftText, it.sub ? 24 : 30, 'michroma', it.sub ? BLOOM : DIM, { align: 'right', tracking: it.sub ? 0.3 : 0.1 }));
      const b = button(it, X + 2, y, 900, h, s => hang(it.label, 900, h, s, 'right', { meta: it.meta, beam: 820, size: 28 }));
      y += pitch;
      return b;
    });
    if (back) buttons.push(button(back, X + 2, Math.min(940, Math.max(y + 24, 900)), 600, 64, s => hang(back.label, 600, 64, s, 'right', { size: 28, beam: 420 })));
    return { art, buttons };
  },

  popup(ctx, items) {
    // A slit down the right edge; the picture centre stays open. The beam spills leftwards.
    const X = 1790;
    const art: O[] = [
      T.rect(1240, 0, W - 1240, H, BLACK, { gradient: linear(0, [[BLACK, 0, 0], [BLACK, 0.38, 0.72], [BLACK, 1, 0.88]]), label: 'Black glass' }),
      ...slit(X, 96, 984, 0.9),
      txt(1240, 104, X - 44 - 1240, fit(ctx.title.toUpperCase(), 500, 24, 0.24), 24, 'michroma', BLOOM, { align: 'right', tracking: 0.24 }),
    ];
    const pitch = Math.min(80, Math.floor(820 / Math.max(1, items.length))), h = pitch - 10;
    const bw = 540;
    const buttons = items.map((it, i) => {
      const label = it.index != null ? `${two(it.index)}  ${it.label}` : it.label;
      return button(it, X - bw - 2, 160 + i * pitch, bw, h, s => hang(label, bw, h, s, 'left', { size: it.index != null ? 24 : 28 }));
    });
    return { art, buttons };
  },

  motion: () => ({
    // One material (light), one motion (a hot spot breathing up and down the slit), a perfect loop.
    layers: [
      { art: [glow(260, 260, 240, 250, '#DCEBFF', 0.32, 'Slit breath')], w: 520, h: 520, from: [MAIN_X - 260, 40], to: [MAIN_X - 260, 520], periodSec: 12, ease: 'sine', blend: 'screen' },
      { art: [glow(90, 160, 80, 150, CORE, 0.7, 'Hot spot')], w: 180, h: 320, from: [MAIN_X - 90, 600], to: [MAIN_X - 90, 120], periodSec: 12, ease: 'sine', blend: 'screen' },
      { art: [T.rect(0, 0, 1100, 3, BEAM, { gradient: linear(0, [[BEAM, 0, 0], [BEAM, 0.08, 0.5], [BEAM, 0.4, 0.18], [BEAM, 1, 0]]), label: 'Slit-scan streak' })], w: 1100, h: 3, from: [MAIN_X, 180], to: [MAIN_X, 900], periodSec: 18, ease: 'sine', opacity: 0.6, blend: 'screen' },
    ],
    grain: 3,
    note: 'Abstract loop: the slit breathes on 12 s and a slit-scan streak crosses the items on 18 s; state changes cut on ones at 30 fps.',
  }),
};
