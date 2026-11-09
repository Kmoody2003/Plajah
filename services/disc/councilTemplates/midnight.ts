// Midnight — the genre / horror disc.
// Animation lead: The Silhouette & Cutout Animator (24 fps on twos, ease-in-out — the hinge acts).
// Crew: Structural Filmmaker (single-frame flicker), Digital Compositing Director (bloom, the glow).
// Graphic designer: The Art Deco Showman — symmetry, gilded hairlines, sunbursts, the stepped reveal.
// Lighting director: one candle low centre, a warm 2000 K pool with irregular flicker, everything else
// falls to ink; a cold blue rim from behind.
// Structure: a reading. The menu is a fan of tarot cards held in an arc above the candle; each item is
// a card with its own arcana and emblem; the chosen card straightens, rises into the flame light and
// turns warm. Scenes are cards laid in a hexagram spread, setup is two rows of plaques under the
// candle, and the pop-up is a small fan of cards along the foot of the picture.
import { button, glow, roman, txt, T, W, H, type Ctx, type Design, type Item, type O, type State } from './kit';
import { eightStarPath, starPath } from '../../tela/ornaments';

const INK = '#07060A', FACE = '#1C1517', FACE_EDGE = '#3B2B24', GOLD = '#B98B42', GOLD_HI = '#F2C46D', BONE = '#DCCCA6', BONE_DIM = '#9A8B70';
const LIT = '#F1D8A2', LIT_INK = '#2A140C', LIT_GOLD = '#8C561C', FLAME = '#FF9A2E', FLAME_CORE = '#FFE7A3', RIM = '#6F9BFF', WAX = '#E7D9BC';
const BLACK = 'unifraktur', CAPS = 'cinzel';

/** Rigidly rotate a group of Tela objects by `deg` around (cx, cy). Tela rotates each object around
 *  its own centre, so the centre is moved and the object's own rotation added. */
function rot(objs: O[], cx: number, cy: number, deg: number): O[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const tp = (x: number, y: number): [number, number] => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  return objs.map(o => {
    if (o.kind === 'LINE' && (o as any).points) {
      const p = (o as any).points as number[];
      const [x1, y1] = tp(p[0], p[1]), [x2, y2] = tp(p[2], p[3]);
      return { ...o, points: [x1, y1, x2, y2], x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) } as O;
    }
    const [nx, ny] = tp(o.x + o.w / 2, o.y + o.h / 2);
    return { ...o, x: nx - o.w / 2, y: ny - o.h / 2, rotation: (o.rotation || 0) + deg };
  });
}

const ARCANA: Record<string, string> = { play: 'JOURNEY', playall: 'WORLD', scenes: 'WHEEL', setup: 'MAGICIAN', extras: 'STAR', episodes: 'MOON', setlist: 'WHEEL' };
const keyOf = (it: Item) => it.label.toLowerCase().replace(/\s+/g, '');

/** The emblem in the middle of a card, drawn in a size×size box at (x, y). */
function emblem(it: Item, x: number, y: number, size: number, color: string, ground: string): O[] {
  const k = keyOf(it), cx = x + size / 2, cy = y + size / 2, r = size / 2;
  if (k.startsWith('play')) {
    // The eye: almond + iris + pupil, rays.
    const out: O[] = [];
    for (let i = 0; i < 12; i++) { const a = (i * 30) * Math.PI / 180; out.push(T.line(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, cx + Math.cos(a) * r, cy + Math.sin(a) * r, color, 3)); }
    out.push(T.path(cx - r * 0.62, cy - r * 0.3, r * 1.24, r * 0.6, 'M0 50 Q50 -30 100 50 Q50 130 0 50 Z', ground, { stroke: color, strokeWidth: 3 }));
    out.push(T.circle(cx, cy, r * 0.22, color), T.circle(cx, cy, r * 0.08, ground));
    return out;
  }
  if (k === 'scenes' || k === 'setlist') {
    const out: O[] = [T.circle(cx, cy, r * 0.82, 'none', { stroke: color, strokeWidth: 4 }), T.circle(cx, cy, r * 0.2, color)];
    for (let i = 0; i < 8; i++) { const a = (i * 45) * Math.PI / 180; out.push(T.line(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2, cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82, color, 3)); }
    return out;
  }
  if (k === 'setup') return [T.path(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8, eightStarPath(), color), T.circle(cx, cy, r * 0.18, ground)];
  if (k === 'episodes') return [T.circle(cx, cy, r * 0.7, color), T.circle(cx + r * 0.3, cy - r * 0.16, r * 0.62, ground)];
  return [T.path(x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76, starPath(8, 0.38), color), T.circle(cx, cy, r * 0.1, ground)];
}

/** A tarot card centred on (0,0) local, unrotated. */
function cardFace(it: Item, num: number, cw: number, ch: number, s: State): O[] {
  const on = s !== 'normal', act = s === 'activated';
  const face = act ? FLAME_CORE : on ? LIT : FACE, gold = on ? LIT_GOLD : GOLD, ink = on ? LIT_INK : BONE, sub = on ? LIT_GOLD : BONE_DIM;
  const x = -cw / 2, y = -ch / 2;
  const out: O[] = [];
  if (on) out.push(T.rect(x - 8, y - 8, cw + 16, ch + 16, FLAME, { rx: 18, label: 'Flame edge' }));
  out.push(T.rect(x - 4, y - 5, cw, ch, RIM, { rx: 14, label: 'Blue rim' }));
  out.push(T.rect(x, y, cw, ch, face, { stroke: FACE_EDGE, strokeWidth: 2, rx: 14, label: 'Card' }));
  out.push(T.rect(x + 12, y + 12, cw - 24, ch - 24, 'none', { stroke: gold, strokeWidth: 2, rx: 8, label: 'Gilt line' }));
  out.push(T.rect(x + 20, y + 20, cw - 40, ch - 40, 'none', { stroke: gold, strokeWidth: 2, rx: 4, label: 'Gilt line' }));
  // Stepped deco crest at the head and foot.
  [0, 1].forEach(f => {
    const yy = f ? y + ch - 20 - 10 : y + 20;
    out.push(T.rect(-30, yy, 60, 10, gold), T.rect(-18, f ? yy - 8 : yy + 10, 36, 8, gold));
  });
  out.push(txt(x, y + 46, cw, roman(num), 30, CAPS, gold, { align: 'center', weight: 700 }));
  out.push(...emblem(it, -60, y + ch * 0.3, 120, gold, face));
  const label = it.label.toUpperCase();
  const size = Math.max(28, Math.min(36, Math.floor((cw - 48) / Math.max(1, label.length * 0.86))));
  out.push(txt(x + 10, y + ch - 142, cw - 20, label, size, CAPS, ink, { align: 'center', weight: 700, tracking: 0.04 }));
  out.push(txt(x + 10, y + ch - 88, cw - 20, ARCANA[keyOf(it)] || 'FOOL', 24, CAPS, sub, { align: 'center', weight: 700, tracking: 0.06 }));
  return out;
}

/** The candle, low centre: wax, drips, wick, flame. */
function candle(cx: number, base: number, k = 1): O[] {
  return [
    glow(cx, base - 150 * k, 520 * k, 360 * k, FLAME, 0.34, 'Candle pool'),
    glow(cx, base - 140 * k, 120 * k, 160 * k, FLAME_CORE, 0.5, 'Flame bloom'),
    T.rect(cx - 34 * k, base - 92 * k, 68 * k, 110 * k, WAX, { rx: 6 * k, label: 'Wax' }),
    T.rect(cx - 34 * k, base - 92 * k, 22 * k, 110 * k, '#F7EEDC', { rx: 6 * k, label: 'Wax light' }),
    T.ellipse(cx - 36 * k, base - 100 * k, 72 * k, 18 * k, '#F4E9D2', { label: 'Wax top' }),
    T.rect(cx + 12 * k, base - 96 * k, 12 * k, 48 * k, '#F4E9D2', { rx: 6 * k, label: 'Drip' }),
    T.line(cx, base - 100 * k, cx, base - 118 * k, '#2A1A10', 3),
    T.path(cx - 16 * k, base - 186 * k, 32 * k, 74 * k, 'M50 0 C70 30 100 55 100 75 C100 92 78 100 50 100 C22 100 0 92 0 75 C0 55 30 30 50 0 Z', FLAME, { label: 'Flame' }),
    T.path(cx - 8 * k, base - 156 * k, 16 * k, 40 * k, 'M50 0 C65 35 100 60 100 78 C100 92 78 100 50 100 C22 100 0 92 0 78 C0 60 35 35 50 0 Z', FLAME_CORE, { label: 'Flame core' }),
  ];
}

/** Ink room: the film loop ghosts through, darkest at the edges and top; a sunburst rises from the candle. */
function room(withFilm: boolean): O[] {
  const out: O[] = [];
  if (withFilm) out.push(T.rect(960 - 1500, 1000 - 1150, 3000, 2300, INK, { gradient: { kind: 'RADIAL', stops: [{ color: INK, offset: 0, opacity: 0.2 }, { color: INK, offset: 0.24, opacity: 0.55 }, { color: INK, offset: 0.42, opacity: 0.86 }, { color: INK, offset: 1, opacity: 0.97 }] }, label: 'Ink' }));
  for (let i = 0; i < 25; i++) {
    const a = Math.PI + (i / 24) * Math.PI;
    out.push(T.line(960 + Math.cos(a) * 150, 990 + Math.sin(a) * 150, 960 + Math.cos(a) * 1250, 990 + Math.sin(a) * 1250, GOLD, 2, { opacity: 0.09, label: 'Sunburst' }));
  }
  out.push(glow(960, 120, 1000, 380, RIM, 0.1, 'Cold rim'));
  // Gilded stepped frame, hairline, inside action safe.
  const fx = 110, fy = 66, fw = W - 220, fh = H - 132, st = 26;
  out.push(T.path(fx, fy, fw, fh, `M${st} 0 L${fw - st} 0 L${fw - st} ${st / 2} L${fw - st / 2} ${st / 2} L${fw - st / 2} ${st} L${fw} ${st} L${fw} ${fh - st} L${fw - st / 2} ${fh - st} L${fw - st / 2} ${fh - st / 2} L${fw - st} ${fh - st / 2} L${fw - st} ${fh} L${st} ${fh} L${st} ${fh - st / 2} L${st / 2} ${fh - st / 2} L${st / 2} ${fh - st} L0 ${fh - st} L0 ${st} L${st / 2} ${st} L${st / 2} ${st / 2} L${st} ${st / 2} Z`, 'none', { origin: { x: 0, y: 0, w: fw, h: fh }, stroke: GOLD, strokeWidth: 2, opacity: 0.55, label: 'Deco frame' }));
  return out;
}

/** A deco plaque (cut corners) for nav / back / setup rows. */
function plaque(w: number, h: number, label: string, s: State, size = 30, sub?: string): O[] {
  const on = s !== 'normal', act = s === 'activated', c = 16;
  const d = `M${c} 0 L${w - c} 0 L${w} ${c} L${w} ${h - c} L${w - c} ${h} L${c} ${h} L0 ${h - c} L0 ${c} Z`;
  const box = { x: 0, y: 0, w, h };
  const out: O[] = [];
  if (on) out.push(T.path(-6, -6, w + 12, h + 12, `M${c + 6} 0 L${w - c + 6} 0 L${w + 12} ${c + 6} L${w + 12} ${h - c + 6} L${w - c + 6} ${h + 12} L${c + 6} ${h + 12} L0 ${h - c + 6} L0 ${c + 6} Z`, FLAME, { origin: { x: 0, y: 0, w: w + 12, h: h + 12 } }));
  out.push(T.path(0, 0, w, h, d, act ? FLAME_CORE : on ? LIT : FACE, { origin: box, stroke: on ? LIT_GOLD : GOLD, strokeWidth: 2, label: 'Plaque' }));
  out.push(T.rect(0, 0, w, 3, RIM, { opacity: on ? 0 : 0.9, label: 'Blue rim' }));
  out.push(T.path(8, 8, w - 16, h - 16, `M${c - 4} 0 L${w - 16 - c + 4} 0 L${w - 16} ${c - 4} L${w - 16} ${h - 16 - c + 4} L${w - 16 - c + 4} ${h - 16} L${c - 4} ${h - 16} L0 ${h - 16 - c + 4} L0 ${c - 4} Z`, 'none', { origin: { x: 0, y: 0, w: w - 16, h: h - 16 }, stroke: on ? LIT_GOLD : GOLD, strokeWidth: 2, opacity: 0.7 }));
  const ty = sub ? (h - size * 1.25 - 30) / 2 : (h - size * 1.25) / 2;
  out.push(txt(24, ty, w - 48, label, size, CAPS, on ? LIT_INK : BONE, { align: 'center', weight: 700, tracking: 0.06 }));
  if (sub) out.push(txt(24, ty + size * 1.25 + 2, w - 48, sub, 24, CAPS, on ? LIT_GOLD : BONE_DIM, { align: 'center', weight: 700, tracking: 0.06 }));
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);

function heading(s: string, sub: string): O[] {
  return [
    txt(0, 92, W, s, 76, BLACK, BONE, { align: 'center' }),
    T.rect(960 - 160, 196, 120, 2, GOLD), T.rect(960 + 40, 196, 120, 2, GOLD), T.path(950, 188, 20, 18, 'M50 0 L100 50 L50 100 L0 50 Z', GOLD),
    txt(0, 212, W, sub, 24, CAPS, BONE_DIM, { align: 'center', weight: 700, tracking: 0.3 }),
  ];
}

export const midnight: Design = {
  id: 'genre',
  background: ctx => (ctx.main ? { kind: 'title', value: INK, titleId: ctx.main.id, fromSec: Math.min(900, ctx.main.source.durationSec * 0.45), loopSec: 24 } : { kind: 'color', value: INK }),
  subBackground: () => ({ kind: 'color', value: INK }),

  main(ctx, items) {
    const n = items.length;
    const title = ctx.title;
    const tSize = Math.min(120, Math.floor(1500 / Math.max(1, title.length * 0.55)));
    const art: O[] = [...room(true),
      txt(0, 88, W, title, tSize, BLACK, BONE, { align: 'center' }),
      T.rect(960 - 220, 96 + tSize * 1.2, 160, 2, GOLD), T.rect(960 + 60, 96 + tSize * 1.2, 160, 2, GOLD),
      T.path(948, 88 + tSize * 1.2, 24, 20, 'M50 0 L100 50 L50 100 L0 50 Z', GOLD),
      txt(0, 116 + tSize * 1.2, W, ctx.tagline.toUpperCase(), 28, CAPS, BONE_DIM, { align: 'center', weight: 700, tracking: 0.24 }),
      ...candle(960, 1010),
    ];
    // The fan: cards on an arc, tilted outward; boxes never overlap.
    const CW = 228, CH = 372, LIFT = 46, step = n > 4 ? 336 : 360, spread = n > 4 ? 8 : 9;
    const buttons = items.map((it, i) => {
      const kk = i - (n - 1) / 2, ang = kk * spread;
      const a = Math.abs(ang) * Math.PI / 180;
      const bw = Math.ceil(CW * Math.cos(a) + CH * Math.sin(a)) + 28, bh = Math.ceil(CW * Math.sin(a) + CH * Math.cos(a)) + LIFT + 28;
      const cx = 960 + kk * step, cy = 610 + kk * kk * 26;
      return button(it, cx - bw / 2, cy - bh / 2, bw, bh, s => {
        const on = s !== 'normal';
        const lx = bw / 2, ly = bh / 2 + (on ? -LIFT / 2 : LIFT / 2);
        const face = cardFace(it, i + 1, CW, CH, s).map(o => ({ ...o, x: o.x + lx, y: o.y + ly, ...(o.kind === 'LINE' && (o as any).points ? { points: ((o as any).points as number[]).map((v, j) => v + (j % 2 ? ly : lx)) } : {}) }) as O);
        return rot(face, lx, ly, on ? ang * 0.4 : ang);
      });
    });
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    const art: O[] = [...room(false), ...heading('The Spread', `SCENES  ·  ${roman(page + 1)} OF ${roman(pages)}`), ...candle(960, 1018, 0.8)];
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    // Hexagram spread: top, middle row of three, two at the foot (a subset for shorter pages).
    const CW = 384, CH = 216, colX = [960 - 450, 960, 960 + 450], rowY = [256, 486, 716];
    const all: Array<[number, number]> = [[colX[1], rowY[0]], [colX[0], rowY[1]], [colX[1], rowY[1]], [colX[2], rowY[1]], [960 - 230, rowY[2]], [960 + 230, rowY[2]]];
    const pick: Record<number, number[]> = { 1: [2], 2: [1, 3], 3: [0, 4, 5], 4: [0, 1, 3, 2], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
    const n = chapters.length;
    let pos = (pick[n] || pick[6]).map(k => all[k]);
    if (n === 4) pos = [[colX[1], rowY[0]], [colX[0], rowY[1]], [colX[2], rowY[1]], [colX[1], rowY[2] - 20]];
    if (n === 5) pos = [[colX[1], rowY[0]], [colX[0], rowY[1]], [colX[1], rowY[1]], [colX[2], rowY[1]], [colX[1], rowY[2] - 20]];
    // Hairlines of the spread joining the cards (drawn under them).
    if (n > 1) pos.forEach((p, i) => { const q = pos[(i + 1) % n]; art.push(T.line(p[0], p[1] + CH / 2, q[0], q[1] + CH / 2, GOLD, 2, { opacity: 0.35, label: 'Spread line' })); });
    const buttons = chapters.map((it, i) => {
      const [cx, top] = pos[i];
      return button(it, cx - CW / 2, top, CW, CH, s => spreadCard(it, CW, CH, s));
    });
    nav.forEach((it, i) => {
      const w = 300, h = 76;
      const label = it.role === 'back' ? 'MAIN MENU' : it.label === 'Next' ? 'NEXT  ›' : '‹  PREVIOUS';
      const x = it.role === 'back' ? 1728 - w : 192 + i * (w + 24);
      buttons.push(button(it, x, 944, w, h, s => plaque(w, h, label, s)));
    });
    return { art, buttons };
  },

  list(ctx, heading_, kind, items) {
    const art: O[] = [...room(false), ...heading(kind === 'SETUP' ? 'The Ritual' : kind === 'EPISODES' ? 'The Chapters' : 'The Relics', heading_.toUpperCase()), ...candle(960, 1018, 0.8)];
    const back = items.find(i => i.role === 'back');
    const rest = items.filter(i => i.role !== 'back');
    const groups: Array<{ name: string; items: Item[] }> = [];
    rest.forEach(it => { const g = it.sub || ''; const last = groups[groups.length - 1]; if (last && last.name === g && last.items.length < 4) last.items.push(it); else groups.push({ name: last && last.name === g ? '' : g, items: [it] }); });
    const cols = groups.length, PW = cols > 1 ? 600 : 760, PH = 104, gapX = 120;
    const x0 = (W - (cols * PW + (cols - 1) * gapX)) / 2;
    const buttons = [] as ReturnType<typeof button>[];
    let num = 0;
    groups.forEach((g, gi) => {
      const x = x0 + gi * (PW + gapX);
      if (g.name) art.push(txt(x, 286, PW, g.name.toUpperCase(), 28, CAPS, GOLD_HI, { align: 'center', weight: 700, tracking: 0.3 }), T.rect(x + PW / 2 - 60, 330, 120, 2, GOLD));
      g.items.forEach((it, k) => {
        num++;
        const sub = it.meta ? it.meta.toUpperCase() : roman(num);
        buttons.push(button(it, x, 356 + k * (PH + 22), PW, PH, s => plaque(PW, PH, clip(it.label.toUpperCase(), 26), s, 30, sub)));
      });
    });
    if (back) buttons.push(button(back, 1728 - 300, 944, 300, 76, s => plaque(300, 76, 'MAIN MENU', s)));
    void ctx;
    return { art, buttons };
  },

  popup(ctx, items) {
    // A small fan of cards along the foot of the picture; Resume and Main Menu are the end cards.
    const chapters = items.filter(i => i.index != null);
    const resume = items.find(i => i.role === 'primary'), home = items.find(i => i.role === 'back');
    const ordered = [resume, ...chapters, home].filter(Boolean) as Item[];
    const n = ordered.length, CH = 164;
    const cwOf = (it: Item) => (it.index == null ? 176 : 112);
    const angOf = (i: number) => (i - (n - 1) / 2) * (n > 6 ? 3.6 : 6);
    const dims = ordered.map((it, i) => { const a = Math.abs(angOf(i)) * Math.PI / 180, cw = cwOf(it); return { cw, w: Math.ceil(cw * Math.cos(a) + CH * Math.sin(a)) + 16, h: Math.ceil(cw * Math.sin(a) + CH * Math.cos(a)) + 40 }; });
    const gap = 6, total = dims.reduce((s, d) => s + d.w, 0) + gap * (n - 1);
    let x = (W - total) / 2;
    const art: O[] = [T.rect(0, 740, W, 340, INK, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ color: INK, offset: 0, opacity: 0 }, { color: INK, offset: 1, opacity: 0.8 }] }, label: 'Foot shade' })];
    const buttons = ordered.map((it, i) => {
      const d = dims[i], bx = x; x += d.w + gap;
      const t = (i - (n - 1) / 2) / ((n - 1) / 2 || 1);
      const cyMid = 912 - t * t * 46;
      return button(it, bx, cyMid - d.h / 2, d.w, d.h, s => {
        const on = s !== 'normal', act = s === 'activated';
        const lx = d.w / 2, ly = d.h / 2 + (on ? -12 : 12);
        const cw = d.cw, cx0 = lx - cw / 2, cy0 = ly - CH / 2;
        const face = act ? FLAME_CORE : on ? LIT : FACE, gold = on ? LIT_GOLD : GOLD, ink = on ? LIT_INK : BONE;
        const o: O[] = [];
        if (on) o.push(T.rect(cx0 - 6, cy0 - 6, cw + 12, CH + 12, FLAME, { rx: 12 }));
        o.push(T.rect(cx0 - 3, cy0 - 4, cw, CH, RIM, { rx: 10 }));
        o.push(T.rect(cx0, cy0, cw, CH, face, { stroke: FACE_EDGE, strokeWidth: 2, rx: 10 }));
        o.push(T.rect(cx0 + 8, cy0 + 8, cw - 16, CH - 16, 'none', { stroke: gold, strokeWidth: 2, rx: 6 }));
        if (it.index == null) {
          o.push(...emblem(it.role === 'primary' ? { ...it, label: 'Play' } : { ...it, label: 'Extras' }, lx - 30, cy0 + 22, 60, gold, face));
          o.push(txt(cx0, cy0 + 96, cw, it.role === 'primary' ? 'RESUME' : 'MENU', 28, CAPS, ink, { align: 'center', weight: 700 }));
        } else {
          o.push(txt(cx0, cy0 + 30, cw, roman(it.index), 40, CAPS, ink, { align: 'center', weight: 700 }));
          o.push(T.path(lx - 10, cy0 + 90, 20, 20, 'M50 0 L100 50 L50 100 L0 50 Z', gold));
          o.push(txt(cx0, cy0 + 118, cw, (it.meta || '').replace(/^0:/, ''), 24, CAPS, on ? LIT_GOLD : BONE_DIM, { align: 'center', weight: 700 }));
        }
        return rot(o, lx, ly, on ? angOf(i) * 0.4 : angOf(i));
      });
    });
    void ctx;
    return { art, buttons };
  },

  motion: () => ({
    // Two incommensurate glow drifts + the flicker make the candle irregular; the blue rim breathes.
    layers: [
      { art: [glow(420, 320, 420, 320, FLAME, 0.3, 'Candle sway')], w: 840, h: 640, from: [528, 520], to: [552, 506], periodSec: 2.3, ease: 'sine', blend: 'screen' },
      { art: [glow(160, 200, 160, 200, FLAME_CORE, 0.35, 'Flame lick')], w: 320, h: 400, from: [796, 690], to: [808, 676], periodSec: 0.83, ease: 'sine', blend: 'screen' },
      { art: [glow(700, 200, 700, 200, RIM, 0.14, 'Rim breath')], w: 1400, h: 400, from: [260, -120], to: [260, -60], periodSec: 13, ease: 'sine', blend: 'screen' },
    ],
    flicker: { amount: 0.08, hz: 1.7 },
    grain: 16,
    note: 'Cards hinge on twos (Silhouette); the flame flickers on irregular single frames (Structural); bloom by Satsuei.',
  }),
};

/** A tarot card laid on its side for the spread: the chapter still shows through an arched window. */
function spreadCard(it: Item, CW: number, CH: number, s: State): O[] {
  const on = s !== 'normal', act = s === 'activated';
  const face = act ? FLAME_CORE : on ? LIT : FACE, gold = on ? LIT_GOLD : GOLD, ink = on ? LIT_INK : BONE;
  const WX = 16, WY = 42, WW = CW - 32, WH = CH - 42 - 52;
  const out: O[] = [
    T.rect(0, 0, CW, WY, face), T.rect(0, WY + WH, CW, CH - WY - WH, face), T.rect(0, WY, WX, WH, face), T.rect(WX + WW, WY, CW - WX - WW, WH, face),
  ];
  // Arch the window's top corners with face-coloured spandrels.
  const R = 44, SP = 'M0 0 L100 0 C44.8 0 0 44.8 0 100 Z';
  out.push(T.path(WX, WY, R, R, SP, face), T.path(WX + WW - R, WY, R, R, SP, face, { rotation: 90 }));
  out.push(T.rect(0, 0, CW, 3, RIM, { label: 'Blue rim' }));
  out.push(T.rect(6, 6, CW - 12, CH - 12, 'none', { stroke: on ? FLAME : GOLD, strokeWidth: on ? 5 : 2, label: 'Gilt line' }));
  out.push(T.path(WX - 2, WY - 2, WW + 4, WH + 4, `M0 ${WH + 4} L0 ${R} C0 ${R * 0.45} ${R * 0.45} 0 ${R} 0 L${WW + 4 - R} 0 C${WW + 4 - R * 0.45} 0 ${WW + 4} ${R * 0.45} ${WW + 4} ${R} L${WW + 4} ${WH + 4} Z`, 'none', { origin: { x: 0, y: 0, w: WW + 4, h: WH + 4 }, stroke: gold, strokeWidth: on ? 4 : 2, label: 'Window line' }));
  out.push(txt(20, 5, 120, roman(it.index!), 28, CAPS, gold, { weight: 700 }));
  out.push(T.path(CW / 2 - 9, 13, 18, 16, 'M50 0 L100 50 L50 100 L0 50 Z', gold));
  out.push(txt(CW - 20 - 140, 8, 140, it.meta || '', 24, CAPS, on ? LIT_GOLD : BONE_DIM, { align: 'right', weight: 700 }));
  out.push(txt(12, WY + WH + 9, CW - 24, clip(it.label.toUpperCase(), 20), 28, CAPS, ink, { weight: 700, align: 'center', tracking: 0.04 }));
  return out;
}
