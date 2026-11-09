// Shelf — Box Set.
// Animation lead: The Tabletop Miniaturist (12 fps on ones, ease-in-out; small, tactile, safe).
// Graphic designer: The Explainer Systematist (one numbering system, one colour per episode, a
// friendly bold sans, nothing that does not explain). Lighting director: a warm practical lamp from
// the left, a soft shelf shadow under each spine, the selected spine catches a rim light.
// Structure: upright spines standing on a wooden shelf. Selection pulls a spine forward and turns it
// so its face (number, title, runtime) is shown. Play All is the bookend; setup options are books
// lying flat in two stacks; chapters are framed photos standing on two shelves.
import { starPath } from '../../tela/ornaments';
import { button as kitButton, glow, linear, txt, T, W, H, type Ctx, type Design, type Item, type O, type State } from './kit';

/** Every button state carries an invisible gradient so its SVG has a <defs>: the font embedder
 *  (services/fabula/broadcastFontEmbed) only injects @font-face into an existing <defs>. */
const FONT_DEFS = () => T.rect(0, 0, 2, 2, '#000000', { opacity: 0, gradient: linear(0, [['#000000', 0, 0], ['#000000', 1, 0]]), label: 'defs' });
const button: typeof kitButton = (item, x, y, w, h, draw, nav) => kitButton(item, x, y, w, h, s => [FONT_DEFS(), ...draw(s)], nav);

const WALL = '#251B15', WOOD = '#7A4E2D', WOOD_TOP = '#A2703F', WOOD_DK = '#4B2F1B', CREAM = '#F5EBDA', INK = '#1F1712';
const RIM = '#FFD996', HONEY = '#C98F4E', TAG = '#EADBC0', MUTED = '#B9A58C';
/** The series system: one colour per episode, used everywhere that episode appears. */
const SERIES = ['#2F6F73', '#D9A441', '#B5523B', '#6F8F5E', '#2E4766', '#7A4466', '#C7703A', '#4F7F9E', '#8C5A3C', '#5E6B3A', '#A04B5A', '#3F5F5A'];
const inkOn = (c: string) => (T.isDark(c) ? CREAM : INK);
const F = 'bricolage';

const P = (x: number, y: number, w: number, h: number, d: string, fill: string, o: T.ShapeOpts = {}) => T.path(x, y, w, h, d, fill, { ...o, origin: { x: 0, y: 0, w, h } });
const est = (s: string, size: number, k = 0.56) => s.length * size * k;
const fit = (s: string, maxW: number, size: number, k = 0.56) => {
  if (est(s, size, k) <= maxW) return s;
  let t = s; while (t.length > 3 && est(t + '…', size, k) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
};

/** A shelf board: lit top surface, front lip, the shadow it throws on the wall below. */
function board(y: number, x0 = 0, x1 = W): O[] {
  return [
    T.rect(x0, y + 52, x1 - x0, 70, '#000', { gradient: linear(90, [['#000', 0, 0.55], ['#000', 1, 0]]), label: 'Shelf shadow' }),
    T.rect(x0, y, x1 - x0, 18, WOOD_TOP, { gradient: linear(0, [[WOOD_TOP, 0, 1], ['#8E6036', 1, 1]]), label: 'Shelf top' }),
    T.rect(x0, y + 18, x1 - x0, 34, WOOD, { gradient: linear(0, [['#8A5A33', 0, 1], [WOOD_DK, 1, 1]]), label: 'Shelf lip' }),
    T.rect(x0, y + 18, x1 - x0, 2, '#C08A55', { opacity: 0.8 }),
  ];
}
/** Warm room: wall, lamp pool from the left, a vignette. */
function room(opaque = true): O[] {
  return [
    ...(opaque ? [T.rect(0, 0, W, H, WALL, { label: 'Wall' })] : []),
    glow(80, 360, 1000, 760, '#FFB868', 0.22, 'Lamp pool'),
    T.rect(0, 0, W, H, '#000', { gradient: linear(0, [['#000', 0, 0], ['#000', 0.6, 0.1], ['#000', 1, 0.5]]), label: 'Fall-off right' }),
  ];
}
/** The soft contact shadow under a spine (on the shelf, drawn in the page art). */
const footShadow = (x: number, w: number, y: number) => T.ellipse(x - 10, y - 8, w + 20, 18, '#000', { opacity: 0.45, label: 'Contact shadow' });

type Icon = 'play' | 'list' | 'dial' | 'star';
interface Spine { colour: string; num: string; title: string; meta?: string; icon?: Icon }

/** The menu's icon system (episodes get numbers; menu spines get a glyph). */
function icon(kind: Icon, cx: number, cy: number, r: number, color: string): O[] {
  if (kind === 'play') return [P(cx - r * 0.45, cy - r * 0.6, r * 1.1, r * 1.2, `M0 0 L${r * 1.1} ${r * 0.6} L0 ${r * 1.2} Z`, color)];
  if (kind === 'list') return [0, 1, 2].map(k => T.rect(cx - r * 0.6, cy - r * 0.5 + k * r * 0.42, r * 1.2, Math.max(4, r * 0.18), color, { rx: 2 }));
  if (kind === 'dial') return [T.circle(cx, cy, r * 0.62, 'none', { stroke: color, strokeWidth: Math.max(4, r * 0.16) }), T.rect(cx - r * 0.08, cy - r * 0.62, r * 0.16, r * 0.62, color)];
  return [T.path(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5, starPath(5, 0.45), color)];
}
const menuIcon = (label: string): Icon => (/play|resume/i.test(label) ? 'play' : /episode|scene|setlist/i.test(label) ? 'list' : /setup|audio|subtitle/i.test(label) ? 'dial' : 'star');

/**
 * An upright spine in a button box of bw×bh. Normal: the spine stands on the shelf (bottom of box
 * minus `lift`). Selected: it is pulled forward (down onto the lip) and turned — a narrow spine
 * strip plus the face: big number, title, runtime, with the lamp's rim light on its edge.
 */
function spine(sp: Spine, bw: number, bh: number, sw: number, s: State, lip = 22): O[] {
  const c = sp.colour, ink = inkOn(c), on = s !== 'normal';
  const sh = bh - lip, out: O[] = [];
  if (!on) {
    const x = (bw - sw) / 2;
    out.push(T.rect(x, 0, sw, sh, c, { rx: 5, label: 'Spine' }));
    out.push(T.rect(x, 0, 7, sh, T.mix(c, 0.22), { label: 'Lamp side' }), T.rect(x + sw - 7, 0, 7, sh, T.mix(c, -0.3), { label: 'Shade side' }));
    out.push(T.rect(x, 20, sw, 4, ink, { opacity: 0.35 }), T.rect(x, sh - 24, sw, 4, ink, { opacity: 0.35 }));
    const r = Math.min(sh < 400 ? 24 : 30, sw / 2 - 12);
    if (sp.icon === 'play') out.push(...icon('play', x + sw / 2, 44 + r, r, ink));
    else if (sp.icon) out.push(T.circle(x + sw / 2, 44 + r, r, ink), ...icon(sp.icon, x + sw / 2, 44 + r, r * 0.8, c));
    else {
      out.push(T.circle(x + sw / 2, 44 + r, r, ink));
      out.push(txt(x, 44 + r - 20, sw, sp.num, 32, F, c, { align: 'center', weight: 800 }));
    }
    // Title reads top-to-bottom down the spine (English convention).
    const top = 44 + r * 2 + 26, len = sh - top - 40;
    const ts = sh < 400 ? 28 : 30, label = fit(sp.title.toUpperCase(), len, ts, 0.6);
    out.push(T.text(x + sw / 2 - len / 2, top + len / 2 - ts * 0.62, len, label, { size: ts, font: F, weight: 700, color: ink, tracking: 0.06, wrap: false, rotation: 90 }));
    return out;
  }
  // Pulled out and turned: strip + face, dropped `lip` px forward onto the shelf lip.
  const act = s === 'activated';
  const y = lip, strip = Math.max(22, Math.round(bw * 0.16)), fx = strip, fw = bw - strip;
  out.push(T.rect(0, y + 10, bw, sh - 10, '#000', { opacity: 0.35, label: 'Pulled shadow' }));
  out.push(T.rect(0, y, strip + 6, sh, T.mix(c, -0.35), { rx: 4, label: 'Spine strip' }));
  out.push(T.rect(fx, y, fw, sh, act ? T.mix(c, 0.18) : c, { rx: 5, label: 'Face' }));
  out.push(T.rect(fx, y, 6, sh, RIM, { label: 'Rim light' }), T.rect(fx, y, fw, 5, RIM, { label: 'Rim light top' }));
  const pad = 18, iw = fw - pad * 2;
  if (sp.icon) out.push(...icon(sp.icon, fx + pad + 40, y + 74, 44, ink));
  else out.push(txt(fx + pad, y + 22, iw, sp.num, Math.min(110, Math.round(fw * 0.58)), F, ink, { weight: 800 }));
  const tsize = fw > 170 ? 32 : 28;
  out.push(T.text(fx + pad, y + Math.min(150, Math.round(fw * 0.7)) + 10, iw, sp.title, { size: tsize, font: F, weight: 700, color: ink, wrap: true, leading: 1.08 }));
  if (sp.meta) out.push(txt(fx + pad, y + sh - 58, iw, sp.meta, 24, F, ink, { weight: 500 }));
  out.push(T.rect(fx + pad, y + sh - 22, Math.min(80, iw), 4, ink, { opacity: 0.5 }));
  return out;
}

/** A flat-lying book (setup options): selection slides it out sideways and lights its edge. */
function flatBook(label: string, colour: string, bw: number, bh: number, s: State): O[] {
  const on = s !== 'normal', act = s === 'activated';
  const slide = on ? 44 : 0, w = bw - 50, x = slide, ink = inkOn(colour);
  const out: O[] = [
    T.rect(x, 4, w, bh - 8, act ? T.mix(colour, 0.18) : colour, { rx: 4, label: 'Book' }),
    T.rect(x + w - 20, 10, 14, bh - 20, CREAM, { label: 'Page block' }),
    T.rect(x + w - 20, bh / 2 - 1, 14, 2, MUTED),
    T.rect(x, 4, w, 5, T.mix(colour, 0.25)),
  ];
  if (on) out.push(T.rect(x, 4, 6, bh - 8, RIM), T.rect(x, 4, w - 20, 5, RIM));
  out.push(txt(x + 28, bh / 2 - 19, w - 70, fit(label, w - 70, 30), 30, F, ink, { weight: on ? 800 : 600 }));
  return out;
}

/** A tag hung under the shelf lip (nav / back on the scenes page). */
function tag(label: string, w: number, h: number, s: State, glyph?: 'left' | 'right'): O[] {
  const on = s !== 'normal';
  const fill = s === 'activated' ? RIM : on ? CREAM : TAG;
  const o: O[] = [
    T.rect(w / 2 - 1, 0, 2, 12, MUTED),
    T.rect(4, 10, w - 8, h - 14, fill, { rx: 8, stroke: on ? RIM : 'none', strokeWidth: on ? 4 : 0 }),
    T.circle(w / 2, 20, 4, WOOD_DK),
  ];
  const arrow = glyph === 'left' ? '‹ ' : '';
  const tail = glyph === 'right' ? ' ›' : '';
  o.push(txt(4, 10 + (h - 14) / 2 - 15, w - 8, `${arrow}${label}${tail}`, 28, F, INK, { align: 'center', weight: on ? 800 : 600 }));
  return o;
}

const colourFor = (i: number) => SERIES[i % SERIES.length];
const seriesLine = (ctx: Ctx) => {
  const eps = ctx.disc.titles.filter(t => t.kind === 'EPISODE');
  if (eps.length < 2) return ctx.tagline;
  const total = Math.round(eps.reduce((a, e) => a + e.source.durationSec, 0) / 60);
  return `The complete series · ${eps.length} episodes · ${Math.floor(total / 60)} h ${total % 60} min`;
};

/** Lay a row of spines (any count) across one or two shelves. */
function spineRows(n: number, opts: { x0: number; x1: number; maxBW: number; perRow: number; tops: number[] }) {
  const rows = Math.max(1, Math.ceil(n / opts.perRow));
  const per = Math.ceil(n / rows);
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / per), k = i % per, inRow = Math.min(per, n - r * per);
    const bw = Math.min(opts.maxBW, Math.floor((opts.x1 - opts.x0) / per));
    const x = Math.round((opts.x0 + opts.x1) / 2 - (inRow * bw) / 2 + k * bw);
    return { x, bw, shelfY: opts.tops[Math.min(r, opts.tops.length - 1)], row: r, rows };
  });
}

export const shelf: Design = {
  id: 'boxset',
  background: ctx => (ctx.main ? { kind: 'title', value: WALL, titleId: ctx.main.id, fromSec: Math.min(300, ctx.main.source.durationSec * 0.2), loopSec: 20 } : { kind: 'color', value: WALL }),
  subBackground: () => ({ kind: 'color', value: WALL }),

  main(ctx, items) {
    const SHELF = 880, SH = 460, LIP = 22;
    const art: O[] = [
      // The film plays on the wall above the shelf; the room closes in beneath it.
      T.rect(0, 0, W, H, WALL, { gradient: linear(90, [[WALL, 0, 0.35], [WALL, 0.3, 0.55], [WALL, 0.52, 0.97], [WALL, 1, 1]]), label: 'Wall' }),
      ...room(false),
    ];
    const t = T.text(192, 110, 1100, ctx.title, { size: 76, font: F, weight: 800, color: CREAM, wrap: true, leading: 1.0 });
    art.push(t, txt(192, T.below(t, 16), 1100, seriesLine(ctx), 28, F, RIM, { weight: 500 }));
    // Menu spines from the left (Play All is the chunky bookend), then the box set itself, standing.
    const bw = 220, sw = 180;
    const buttons = items.map((it, i) => {
      const primary = it.role === 'primary';
      const w = primary ? 250 : bw, x = 192 + (primary ? 0 : 250 + (i - 1) * bw);
      art.push(footShadow(x + (w - (primary ? 230 : sw)) / 2, primary ? 230 : sw, SHELF));
      return button(it, x, SHELF - SH, w, SH + LIP, s => {
        if (primary && s === 'normal') {
          // The bookend: a solid block of oak with a play mark.
          return [
            T.rect(10, 0, w - 20, SH, WOOD_TOP, { rx: 6 }), T.rect(10, 0, 10, SH, '#C08A55'), T.rect(w - 22, 0, 12, SH, WOOD_DK),
            P(w / 2 - 34, 120, 72, 80, 'M0 0 L72 40 L0 80 Z', CREAM),
            txt(10, 250, w - 20, it.label, 40, F, CREAM, { align: 'center', weight: 800 }),
            txt(10, 302, w - 20, 'from the start', 24, F, TAG, { align: 'center', weight: 500 }),
          ];
        }
        return spine({ colour: primary ? HONEY : colourFor(i + 2), num: '', title: it.label, icon: menuIcon(it.label), meta: primary ? 'from the start' : undefined }, w, SH + LIP, sw, s, LIP);
      });
    });
    // The series' own spines stand to the right: the box set, unselectable here.
    const eps = ctx.disc.titles.filter(x => x.kind === 'EPISODE');
    const deco = Math.max(4, Math.min(10, eps.length || 6));
    const startX = 192 + 250 + (items.length - 1) * bw + 70, dw = Math.min(100, Math.floor((1728 - 150 - startX) / deco));
    // The box set's closing bookend.
    const endX = startX + deco * dw + 8;
    art.push(footShadow(endX, 120, SHELF), T.rect(endX, SHELF - 260, 120, 260, WOOD_TOP, { rx: 6 }), T.rect(endX, SHELF - 260, 10, 260, '#C08A55'), T.rect(endX + 108, SHELF - 260, 12, 260, WOOD_DK));
    if (eps.length) art.push(T.text(endX + 8, SHELF - 180, 104, `${eps.length || deco} episodes`, { size: 24, font: F, weight: 800, color: CREAM, align: 'center', wrap: true, leading: 1.05 }));
    for (let k = 0; k < deco; k++) {
      const x = startX + k * dw, hh = SH - 60 - ((k * 37) % 46);
      art.push(footShadow(x, dw - 6, SHELF), T.rect(x, SHELF - hh, dw - 6, hh, colourFor(k), { rx: 4 }), T.rect(x, SHELF - hh, 5, hh, T.mix(colourFor(k), 0.2)));
      if (eps.length) art.push(T.circle(x + (dw - 6) / 2, SHELF - hh + 44, 26, inkOn(colourFor(k))), txt(x, SHELF - hh + 26, dw - 6, String(k + 1).padStart(2, '0'), 28, F, colourFor(k), { align: 'center', weight: 800 }));
      const name = eps[k]?.name; if (name) art.push(T.text(x + (dw - 6) / 2 - (hh - 130) / 2, SHELF - hh + 90 + (hh - 130) / 2 - 16, hh - 130, fit(name.toUpperCase(), hh - 130, 26, 0.62), { size: 26, font: F, weight: 700, color: inkOn(colourFor(k)), tracking: 0.06, wrap: false, rotation: 90 }));
    }
    art.push(...board(SHELF));
    // Board goes under the spines visually: the buttons draw above the art, so the lip sits in front
    // only of the static spines. Re-draw a thin lip strip for the box set.
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    const FW = 440, FH = 248, tops = [500, 900];
    const art: O[] = [...room(),
      txt(192, 110, 1000, 'Scenes', 56, F, CREAM, { weight: 800 }),
      txt(192, 180, 1000, ctx.title, 28, F, RIM, { weight: 500 }),
    ];
    if (pages > 1) art.push(txt(1328, 124, 400, `Shelf ${page + 1} of ${pages}`, 28, F, MUTED, { align: 'right', weight: 600 }));
    tops.forEach(y => art.push(...board(y)));
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    const buttons = chapters.map((it, i) => {
      const r = Math.floor(i / 3), k = i % 3, inRow = Math.min(3, chapters.length - r * 3);
      const x = Math.round(W / 2 - (inRow * FW + (inRow - 1) * 90) / 2 + k * (FW + 90)), y = tops[r] - FH;
      art.push(footShadow(x, FW, tops[r]));
      // The caption is a label on the shelf lip under the frame, in the episode colour system.
      art.push(T.rect(x + 20, tops[r] + 22, 44, 26, colourFor(it.index! - 1), { rx: 4 }), txt(x + 20, tops[r] + 22, 44, String(it.index), 24, F, inkOn(colourFor(it.index! - 1)), { align: 'center', weight: 800 }));
      art.push(txt(x + 74, tops[r] + 21, FW - 74 - 120, fit(it.label, FW - 200, 24), 24, F, CREAM, { weight: 700 }));
      art.push(txt(x + FW - 120, tops[r] + 21, 120, it.meta || '', 24, F, TAG, { align: 'right', weight: 500 }));
      return button(it, x, y, FW, FH, s => {
        const on = s !== 'normal', act = s === 'activated', B = 18, frame = act ? RIM : on ? HONEY : WOOD_DK;
        const o: O[] = [
          T.rect(0, 0, FW, B, frame), T.rect(0, FH - B, FW, B, frame), T.rect(0, 0, B, FH, frame), T.rect(FW - B, 0, B, FH, frame),
          T.rect(B, B, FW - B * 2, FH - B * 2, 'none', { stroke: CREAM, strokeWidth: 2, opacity: 0.7 }),
        ];
        if (on) {
          o.push(T.rect(0, 0, FW, 5, RIM), T.rect(0, 0, 5, FH, RIM));
          o.push(T.circle(B + 34, B + 34, 30, colourFor(it.index! - 1), { stroke: CREAM, strokeWidth: 4 }), txt(B + 4, B + 14, 60, String(it.index), 32, F, inkOn(colourFor(it.index! - 1)), { align: 'center', weight: 800 }));
        }
        return o;
      });
    });
    // Tags hang under the lower shelf: ‹ Previous, Back, Next ›.
    nav.forEach((it, i) => {
      const w = it.role === 'back' ? 200 : 240;
      const x = 1728 - (nav.length - i) * 260 + (260 - w);
      buttons.push(button(it, x, 958, w, 64, s => tag(it.label, w, 64, s, it.label === 'Previous' ? 'left' : it.label === 'Next' ? 'right' : undefined)));
    });
    return { art, buttons };
  },

  list(ctx, heading, kind, items) {
    const art: O[] = [...room()];
    const back = items.find(i => i.role === 'back'), rows = items.filter(i => i.role !== 'back');
    const titleObj = T.text(192, 104, 1200, heading, { size: 60, font: F, weight: 800, color: CREAM, wrap: false });
    art.push(titleObj, txt(192, T.below(titleObj, 8), 1200, kind === 'SETUP' ? 'Choose a book from each stack' : `${ctx.title} · ${rows.length} on the shelf`, 28, F, RIM, { weight: 500 }));
    const buttons: ReturnType<typeof button>[] = [];

    if (kind === 'SETUP') {
      // Two stacks of flat books on one long shelf, one per group.
      const SHELF = 880, BH = 74, BW = 560;
      art.push(...board(SHELF));
      const groups = [...new Set(rows.map(r => r.sub || 'Options'))];
      groups.forEach((g, gi) => {
        const gx = 192 + gi * 680;
        const list = rows.filter(r => (r.sub || 'Options') === g);
        art.push(footShadow(gx, BW - 50, SHELF));
        // Label tag on the shelf lip under the stack.
        art.push(T.rect(gx, SHELF + 22, 200, 28, TAG, { rx: 4 }), txt(gx, SHELF + 22, 200, g.toUpperCase(), 24, F, INK, { align: 'center', weight: 800, tracking: 0.12 }));
        list.forEach((it, k) => buttons.push(button(it, gx, SHELF - (k + 1) * BH, BW, BH, s => flatBook(it.label, colourFor(gi * 3 + k), BW, BH, s))));
      });
      if (back) buttons.push(button(back, 1560, SHELF - 300, 168, 300 + 22, s => bookend(back.label, 168, 322, s)));
      return { art, buttons };
    }

    // Episodes / Special Features: the hero — a run of spines, any count, one or two shelves.
    const n = rows.length + (back ? 1 : 0);
    const two = n > 8;
    const SH = two ? 330 : 580, LIP = 22;
    const tops = two ? [580, 980] : [880];
    tops.forEach(y => art.push(...board(y)));
    const lay = spineRows(rows.length, { x0: 192, x1: back ? 1540 : 1728, maxBW: 216, perRow: two ? Math.ceil(rows.length / 2) : 8, tops });
    rows.forEach((it, i) => {
      const L = lay[i], sw = Math.round(L.bw * 0.84);
      art.push(footShadow(L.x + (L.bw - sw) / 2, sw, L.shelfY));
      buttons.push(button(it, L.x, L.shelfY - SH, L.bw, SH + LIP, s => spine({ colour: colourFor((it.index ?? i + 1) - 1 + (kind === 'EXTRAS' ? 4 : 0)), num: String(it.index ?? i + 1).padStart(2, '0'), title: it.label, meta: it.meta }, L.bw, SH + LIP, sw, s, LIP)));
    });
    if (back) {
      const bh = Math.min(SH, 300), y = tops[tops.length - 1];
      art.push(footShadow(1570, 150, y));
      buttons.push(button(back, 1560, y - bh, 168, bh + LIP, s => bookend(back.label, 168, bh + LIP, s)));
    }
    return { art, buttons };
  },

  popup(ctx, items) {
    // A short shelf along the foot of the picture; the centre stays open.
    const SHELF = 968, SH = 150, LIP = 22, top = SHELF - SH;
    const art: O[] = [
      T.rect(0, 780, W, H - 780, '#120C08', { gradient: linear(90, [['#120C08', 0, 0], ['#120C08', 0.45, 0.78], ['#120C08', 1, 0.92]]), label: 'Wall band' }),
      glow(160, 940, 600, 220, '#FFB868', 0.16, 'Lamp'),
      ...board(SHELF),
    ];
    const resume = items.find(i => i.role === 'primary'), home = items.find(i => i.role === 'back');
    const chapters = items.filter(i => i.index != null);
    const buttons: ReturnType<typeof button>[] = [];
    if (resume) buttons.push(button(resume, 120, top, 200, SH + LIP, s => bookend(resume.label, 200, SH + LIP, s, true)));
    const bw = Math.min(150, Math.floor(1240 / Math.max(1, chapters.length))), x0 = Math.round(W / 2 - (chapters.length * bw) / 2);
    chapters.forEach((it, i) => {
      const x = x0 + i * bw, c = colourFor(it.index! - 1), sw = bw - 26;
      art.push(footShadow(x + 13, sw, SHELF));
      buttons.push(button(it, x, top - 60, bw, SH + 60 + LIP, s => {
        const on = s !== 'normal';
        if (!on) return [
          T.rect(13, 60, sw, SH, c, { rx: 4 }), T.rect(13, 60, 6, SH, T.mix(c, 0.22)),
          txt(13, 60 + SH / 2 - 26, sw, String(it.index), 44, F, inkOn(c), { align: 'center', weight: 800 }),
        ];
        // Slid up and turned to its face: number + chapter name.
        const fy = 0, fh = SH + 60 + LIP - 4;
        return [
          T.rect(2, fy + 6, bw - 4, fh - 6, s === 'activated' ? T.mix(c, 0.2) : c, { rx: 5 }),
          T.rect(2, fy + 6, 6, fh - 6, RIM), T.rect(2, fy + 6, bw - 4, 5, RIM),
          txt(14, fy + 18, bw - 24, String(it.index), 48, F, inkOn(c), { weight: 800 }),
          T.text(14, fy + 84, bw - 24, it.label, { size: 24, font: F, weight: 700, color: inkOn(c), wrap: true, leading: 1.05 }),
        ];
      }));
    });
    if (home) buttons.push(button(home, 1824 - 200, top, 200, SH + LIP, s => bookend(home.label, 200, SH + LIP, s)));
    return { art, buttons };
  },

  motion: () => ({
    // Miniature: the lamp breathes a little (a practical, not a light show) and dust drifts through it.
    layers: [
      { art: [glow(500, 400, 500, 400, '#FFC27A', 0.16, 'Lamp breath')], w: 1000, h: 800, from: [-360, 40], to: [-300, 70], periodSec: 9, ease: 'sine', blend: 'screen' },
      { art: dust(), w: 900, h: 700, from: [40, 80], to: [140, 20], periodSec: 22, ease: 'sine', opacity: 0.7, blend: 'screen' },
    ],
    flicker: { amount: 0.025, hz: 0.6 },
    grain: 9,
    note: 'Tabletop miniaturist: 12 fps on ones; the spine pull is a 3-frame ease-in-out; the lamp and dust are the only ambient motion.',
  }),
};

/** A wooden bookend (Back / Main Menu / Resume). Selection tips it forward with the rim light. */
function bookend(label: string, w: number, h: number, s: State, play = false): O[] {
  const on = s !== 'normal', lip = 22, y = on ? lip : 0, bh = h - lip;
  const face = s === 'activated' ? RIM : on ? HONEY : WOOD_TOP;
  const o: O[] = [
    T.rect(6, y + bh - 30, w - 12, 30, WOOD_DK, { rx: 3 }),
    T.rect(6, y, w - 12, bh - 24, face, { rx: 6 }),
    T.rect(6, y, 8, bh - 24, '#C08A55'),
  ];
  if (on) o.push(T.rect(6, y, w - 12, 5, RIM), T.rect(6, y, 5, bh - 24, RIM));
  const cy = y + (bh - 24) / 2;
  if (play) o.push(P(w / 2 - 22, cy - 50, 44, 48, 'M0 0 L44 24 L0 48 Z', on ? INK : CREAM));
  o.push(T.text(10, play ? cy + 8 : cy - 20, w - 20, label, { size: 30, font: F, weight: 800, color: on ? INK : CREAM, align: 'center', wrap: true, leading: 1.0 }));
  return o;
}

function dust(): O[] {
  const out: O[] = [];
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 46; i++) out.push(T.circle(r() * 900, r() * 700, 1.5 + r() * 2.5, '#FFE6B8', { opacity: 0.25 + r() * 0.45 }));
  return out;
}
