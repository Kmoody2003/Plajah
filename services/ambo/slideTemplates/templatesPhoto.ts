// templatesPhoto — Photo slides: single hero, 2–3 photo arrangements, grids,
// mosaics, walls, collages.
//
// Every photo is a live `photo.well` (or the one `photo.wall`) object — see
// photoDrawers.ts — so frames, Ken Burns drift, reveals and the print settle
// are drawn per frame from cached bitmaps, in the theme's own frame language.
// Words are ordinary static TEXT and never move. Fields take image links one
// per line; `sample:N` lines are the built-in offline sample photographs.
import { rect, text, image, luminance } from '../../tela/templateKit';
import { box, fitText, Stack, lines, type Box } from './layout';
import { typeset } from './themes';
import { prelude } from './parts';
import { glowAt } from './motifKit';
import {
  resolvePhotoRef, frameStyle, framePad, looseThemes, sampleToken,
  type PhotoRef, type FrameStyle, type WellProps, type WallProps, type WallLane,
} from './photoDrawers';
import type { DesignCtx, FieldDef, SlideDesigner, SlideObj, SlideTemplateDef } from './types';

const F = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, default: def, ...o });
const samples = (...n: number[]) => n.map(sampleToken).join('\n');
const IMAGES_HINT = 'One image link per line. sample:1 … sample:24 are built-in sample photos.';
const IMAGE_HINT = 'Image link — or sample:1 … sample:24 for a built-in sample photo.';

const ctx = (d: DesignCtx) => ({ ...d, u: d.L.u, S: d.L.safe, ty: typeset(d.th), m: d.th.motif, c: d.th.c });

/** Photos from a field (only real links / sample tokens survive). */
function photosOf(v: string, max = 24): PhotoRef[] {
  const out: PhotoRef[] = [];
  for (const l of lines(v)) { const p = resolvePhotoRef(l); if (p) out.push(p); if (out.length >= max) break; }
  return out;
}

const contrast = (a: string, b: string) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };

interface WellOpts {
  motion?: WellProps['motion']; reveal?: WellProps['reveal']; spread?: number; rot?: number;
  compact?: boolean; rxCap?: number; style?: FrameStyle; focusY?: number; label?: string;
}

/** One photo well: an IMAGE (or empty RECT) drawn by the photo.well drawer. */
function well(d: DesignCtx, b: Box, p: PhotoRef | null, i: number, n: number, o: WellOpts = {}): SlideObj {
  const { th, L } = d, u = L.u;
  const style = o.style ?? frameStyle(th);
  const rx = Math.min(b.w, b.h) * Math.min(th.slot.rx, o.rxCap ?? .5);
  const obj: SlideObj = p
    ? image(b.x, b.y, b.w, b.h, p.src, 1500, 1000, { label: o.label || 'Photo', rotation: o.rot || 0, role: 'IMAGE_SLOT' })
    : rect(b.x, b.y, b.w, b.h, th.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', { label: 'Photo well', rotation: o.rot || 0, role: 'IMAGE_SLOT' });
  obj.rx = rx;
  const props: WellProps = {
    p, style, u, rx, i, n, seed: d.seed,
    motion: o.motion ?? 'kb', reveal: o.reveal ?? 'rise', spread: o.spread ?? .9,
    compact: o.compact, focusY: o.focusY,
  };
  obj.live = { drawer: 'photo.well', props: props as unknown as Record<string, unknown> };
  return obj;
}

/** The photo box inside a cell so that the theme's frame fits the cell. */
function inset(d: DesignCtx, b: Box, compact = false, style = frameStyle(d.th)): Box {
  const fp = framePad(style, b.w, b.h, d.L.u, compact);
  return box(b.x + fp.l, b.y + fp.t, Math.max(4, b.w - fp.l - fp.r), Math.max(4, b.h - fp.t - fp.b));
}

/** Fit a box of aspect `ar` inside b, centred. */
function fitAr(b: Box, ar: number): Box {
  const w = Math.min(b.w, b.h * ar), h = w / ar;
  return box(b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
}

/** Tilt for item i in a hand-made theme (alternating, a little irregular). */
function tiltFor(d: DesignCtx, i: number, k = 1): number {
  const t = d.th.slot.tilt;
  if (!t) return 0;
  const j = .65 + ((i * 37 + d.seed) % 10) / 20;
  return t * (i % 2 ? -1 : 1) * j * k;
}

interface HeadOpts { titleSize?: number; maxTitle: number; maxCaption?: number; caption?: boolean; credit?: boolean; divider?: boolean; captionKey?: string }
/** Kicker · title · divider · caption · credit in the theme's voice. */
function head(d: DesignCtx, x: number, w: number, align: 'left' | 'center', o: HeadOpts): Stack {
  const { f, u, ty, m, c, L } = ctx(d);
  const st = new Stack();
  if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.6, { align })));
  st.add(fitText(x, 0, w, f.title, ty.display(u * (o.titleSize ?? 6), { align }), o.maxTitle), u * 1.1);
  if (o.divider !== false) st.add(m.divider(x, 0, w, align, L).objs, u * 2);
  const cap = f[o.captionKey || 'caption'];
  if (o.caption !== false && cap) st.add(fitText(x, 0, w, cap, ty.body(u * 2.1, { align, leading: 1.42, label: 'Caption' }), o.maxCaption ?? u * 9), u * 1.9);
  if (o.credit !== false && f.credit) st.add(text(x, 0, w, f.credit, ty.label(u * 1.2, { align, color: c.muted, label: 'Photo credit' })), u * 1.7);
  return st;
}

// ── 1. Single Hero ───────────────────────────────────────────────────────────
const hero: SlideDesigner = d => {
  const { L, f, u, S } = ctx(d);
  const out = prelude(d, false);
  const p = photosOf(f.photo, 1)[0] || null;
  const W = (b: Box) => well(d, inset(d, b), p, 0, 1, { motion: 'kb', reveal: 'zoom', label: 'Hero photo' });
  if (L.vertical) {
    const b = box(S.x, S.y, S.w, S.h * (L.cls === 'tall' ? .56 : .5));
    out.push(W(b));
    out.push(...head(d, S.x, S.w, 'center', { maxTitle: S.h * .14, maxCaption: S.h * .1 }).centre(b.bottom + u * 3, S.bottom - b.bottom - u * 3, 0));
    return out;
  }
  if (L.stretched) {
    const pw = Math.min(S.h * 1.5, S.w * .44), b = box(S.cx - pw / 2, S.y, pw, S.h);
    out.push(W(b));
    const cw = Math.min((S.w - pw) / 2 - u * 6, u * 70);
    const lx = b.x - u * 6 - cw, rx = b.right + u * 6;
    out.push(...head(d, lx, cw, 'left', { maxTitle: S.h * .5, caption: false, credit: false }).centre(S.y, S.h));
    const st = new Stack();
    if (f.caption) st.add(fitText(rx, 0, cw, f.caption, ctx(d).ty.body(u * 2.2, { leading: 1.45, label: 'Caption' }), S.h * .5));
    if (f.credit) st.add(text(rx, 0, cw, f.credit, ctx(d).ty.label(u * 1.2, { color: d.th.c.muted, label: 'Photo credit' })), u * 2);
    out.push(...st.centre(S.y, S.h));
    return out;
  }
  const tw = Math.min(S.w, u * 96), tx = S.cx - tw / 2;
  const st = head(d, tx, tw, 'center', { maxTitle: S.h * .13, maxCaption: S.h * .09, titleSize: 5.4 });
  const th0 = st.height(), ph = S.h - th0 - u * 3.4;
  const pw = Math.min(S.w, ph * 1.9);
  out.push(W(box(S.cx - pw / 2, S.y, pw, ph)));
  out.push(...st.place(S.bottom - th0));
  return out;
};

// ── 2. Side by Side ──────────────────────────────────────────────────────────
const pair: SlideDesigner = d => {
  const { L, f, u, S, ty, c } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(f.photos, 2), labels = lines(f.labels);
  const cells: Box[] = [];
  let hs: Stack, hb: Box;
  const gap = u * (L.vertical ? 3 : 4);
  if (L.stretched) {
    const hw = Math.min(S.w * .26, u * 60);
    hs = head(d, S.x, hw, 'left', { maxTitle: S.h * .5, maxCaption: S.h * .3 });
    hb = box(S.x, S.y, hw, S.h);
    const ax = S.x + hw + u * 7, aw = S.right - ax, cw = Math.min((aw - gap) / 2, S.h * 1.45);
    const x0 = ax + (aw - cw * 2 - gap) / 2;
    cells.push(box(x0, S.y, cw, S.h), box(x0 + cw + gap, S.y, cw, S.h));
  } else {
    const align = L.vertical ? 'center' : 'left';
    hs = head(d, S.x, S.w, align, { maxTitle: S.h * .12, caption: false, credit: false, divider: !L.vertical });
    const hh = hs.height(); hb = box(S.x, S.y, S.w, hh);
    const top = S.y + hh + u * 3.4, ah = S.bottom - top;
    if (L.vertical) { const ch = (ah - gap) / 2; cells.push(box(S.x, top, S.w, ch), box(S.x, top + ch + gap, S.w, ch)); }
    else { const cw = (S.w - gap) / 2; cells.push(box(S.x, top, cw, ah), box(S.x + cw + gap, top, cw, ah)); }
  }
  out.push(...(L.stretched ? hs.centre(hb.y, hb.h) : hs.place(hb.y)));
  cells.forEach((cb, i) => {
    const lbl = labels[i];
    let lo: SlideObj | null = null, pb = cb;
    if (lbl) {
      lo = fitText(cb.x, 0, cb.w, lbl, ty.label(u * 1.35, { align: L.vertical ? 'center' : 'left', color: c.muted, label: 'Photo label' }), u * 4);
      pb = box(cb.x, cb.y, cb.w, cb.h - lo.h - u * 1.6);
    }
    const ib = inset(d, pb);
    out.push(well(d, ib, ps[i] || null, i, 2, { rot: tiltFor(d, i, .6), reveal: looseThemes(d.th) ? 'drop' : 'rise' }));
    if (lo) { const fb = ib.bottom + framePad(frameStyle(d.th), ib.w, ib.h, u).b; lo.y = Math.min(fb + u * 1.4, S.bottom - lo.h); out.push(lo); }
  });
  return out;
};

// ── 3. Feature + Two ─────────────────────────────────────────────────────────
const feature: SlideDesigner = d => {
  const { L, f, u, S } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(f.photos, 3);
  const g = u * 2.4;
  let big: Box, a: Box, b: Box;
  if (L.vertical) {
    const hs = head(d, S.x, S.w, 'center', { maxTitle: S.h * .1, maxCaption: S.h * .07, credit: false });
    const hh = hs.height();
    out.push(...hs.place(S.y));
    const top = S.y + hh + u * 3.2, ah = S.bottom - top, bh = (ah - g) * .6, sw = (S.w - g) / 2;
    big = box(S.x, top, S.w, bh); a = box(S.x, top + bh + g, sw, ah - bh - g); b = box(S.x + sw + g, a.y, sw, a.h);
  } else if (L.stretched) {
    const hw = Math.min(S.w * .25, u * 58);
    out.push(...head(d, S.x, hw, 'left', { maxTitle: S.h * .45, maxCaption: S.h * .3 }).centre(S.y, S.h));
    const ax = S.x + hw + u * 7, aw = Math.min(S.right - ax, S.h * 2.6), x0 = ax + (S.right - ax - aw) / 2;
    const bw = (aw - g) * .64;
    big = box(x0, S.y, bw, S.h); a = box(x0 + bw + g, S.y, aw - bw - g, (S.h - g) / 2); b = box(a.x, a.y + a.h + g, a.w, a.h);
  } else {
    const hs = head(d, S.x, S.w * .7, 'left', { maxTitle: S.h * .12, caption: false, credit: false, divider: false });
    const hh = hs.height();
    out.push(...hs.place(S.y));
    if (f.caption) {
      const cw = S.w * .28, cap = fitText(S.right - cw, 0, cw, f.caption, ctx(d).ty.body(u * 1.8, { leading: 1.4, color: d.th.c.muted, label: 'Caption' }), hh);
      cap.y = S.y + Math.max(0, hh - cap.h); out.push(cap);
    }
    const top = S.y + hh + u * 3, ah = S.bottom - top, bw = (S.w - g) * .64;
    big = box(S.x, top, bw, ah); a = box(S.x + bw + g, top, S.w - bw - g, (ah - g) / 2); b = box(a.x, a.y + a.h + g, a.w, a.h);
  }
  const loose = looseThemes(d.th);
  [big, a, b].forEach((cb, i) => out.push(well(d, inset(d, cb, i > 0), ps[i] || null, i, 3, { rot: tiltFor(d, i, .5), reveal: loose ? 'drop' : i ? 'rise' : 'zoom', spread: .7 })));
  return out;
};

// ── 4. Triptych ──────────────────────────────────────────────────────────────
const triptych: SlideDesigner = d => {
  const { L, f, u, S } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(f.photos, 3);
  const g = u * (L.vertical ? 2.2 : 3);
  const cells: Box[] = [];
  if (L.vertical) {
    const hs = head(d, S.x, S.w, 'center', { maxTitle: S.h * .1, maxCaption: S.h * .07, credit: false });
    const hh = hs.height(); out.push(...hs.place(S.y));
    const top = S.y + hh + u * 3.2, ch = (S.bottom - top - g * 2) / 3;
    for (let i = 0; i < 3; i++) cells.push(box(S.x, top + i * (ch + g), S.w, ch));
  } else if (L.stretched) {
    const hw = Math.min(S.w * .24, u * 56);
    out.push(...head(d, S.right - hw, hw, 'left', { maxTitle: S.h * .45, maxCaption: S.h * .3 }).centre(S.y, S.h));
    const aw = Math.min(S.w - hw - u * 8, S.h * .82 * 3 + g * 2), cw = (aw - g * 2) / 3, x0 = S.x + (S.w - hw - u * 8 - aw) / 2;
    for (let i = 0; i < 3; i++) cells.push(box(x0 + i * (cw + g), S.y, cw, S.h));
  } else {
    const tw = Math.min(S.w, u * 96);
    const hs = head(d, S.cx - tw / 2, tw, 'center', { maxTitle: S.h * .12, maxCaption: S.h * .07, credit: false, titleSize: 5 });
    const hh = hs.height(), ah = S.h - hh - u * 3.4;
    const aw = Math.min(S.w, ah * .8 * 3 + g * 2), cw = (aw - g * 2) / 3, x0 = S.cx - aw / 2;
    for (let i = 0; i < 3; i++) cells.push(box(x0 + i * (cw + g), S.y, cw, ah));
    out.push(...hs.place(S.bottom - hh));
  }
  cells.forEach((cb, i) => out.push(well(d, inset(d, cb), ps[i] || null, i, 3, { rot: tiltFor(d, i, .4), reveal: looseThemes(d.th) ? 'drop' : 'rise', spread: .5 })));
  return out;
};

// ── 5. Staggered Pair — two prints overlapping ───────────────────────────────
const overlap: SlideDesigner = d => {
  const { L, u, S } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(d.f.photos, 2);
  let reg: Box;
  if (L.vertical) {
    reg = box(S.x, S.y, S.w, S.h * .56);
    out.push(...head(d, S.x, S.w, 'center', { maxTitle: S.h * .13, maxCaption: S.h * .1 }).centre(reg.bottom + u * 4, S.bottom - reg.bottom - u * 4, 0));
  } else {
    const rw = L.stretched ? Math.min(S.w * .5, S.h * 1.9) : S.w * .58;
    const tw0 = L.stretched ? Math.min(u * 80, S.w - rw - u * 6) : 0;
    reg = box(L.stretched ? S.cx - (rw + u * 6 + tw0) / 2 : S.x, S.y, rw, S.h);
    const tx = reg.right + u * 6, tw = Math.min(S.right - tx, u * 80);
    out.push(...head(d, tx, tw, 'left', { maxTitle: S.h * .34, maxCaption: S.h * .26 }).centre(S.y, S.h));
  }
  const loose = looseThemes(d.th), t = d.th.slot.tilt || 0;
  const A = box(reg.x, reg.y, reg.w * .72, reg.h * .7);
  const B = box(reg.right - reg.w * .5, reg.bottom - reg.h * .56, reg.w * .5, reg.h * .56);
  out.push(well(d, inset(d, A), ps[0] || null, 0, 2, { rot: loose ? -Math.abs(t || 2) : 0, reveal: loose ? 'drop' : 'rise' }));
  out.push(well(d, inset(d, B), ps[1] || null, 1, 2, { rot: loose ? Math.abs(t || 2) * 1.3 : 0, reveal: loose ? 'drop' : 'rise' }));
  return out;
};

// ── 6. Staggered Trio — a cascade of three ───────────────────────────────────
const cascade: SlideDesigner = d => {
  const { L, u, S } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(d.f.photos, 3);
  let reg: Box, steps: Array<[number, number]>, cw: number, ch: number;
  if (L.vertical) {
    reg = box(S.x, S.y, S.w, S.h * .58);
    out.push(...head(d, S.x, S.w, 'center', { maxTitle: S.h * .13, maxCaption: S.h * .09 }).centre(reg.bottom + u * 4, S.bottom - reg.bottom - u * 4, 0));
    cw = .62; ch = .48; steps = [[0, 0], [.19, .26], [.38, .52]];
  } else {
    const rw = L.stretched ? Math.min(S.w * .56, S.h * 2.3) : S.w * .6;
    const tw = L.stretched ? Math.min(u * 80, S.w - rw - u * 6) : Math.min(S.w - rw - u * 6, u * 80);
    const x0 = L.stretched ? S.cx - (tw + u * 6 + rw) / 2 : S.x;
    reg = box(L.stretched ? x0 + tw + u * 6 : S.right - rw, S.y, rw, S.h);
    out.push(...head(d, x0, tw, 'left', { maxTitle: S.h * .34, maxCaption: S.h * .26 }).centre(S.y, S.h));
    cw = .52; ch = .56; steps = [[0, 0], [.24, .22], [.48, .44]];
  }
  const loose = looseThemes(d.th);
  steps.forEach(([sx, sy], i) => {
    const cb = box(reg.x + reg.w * sx, reg.y + reg.h * sy, reg.w * cw, reg.h * ch);
    out.push(well(d, inset(d, cb), ps[i] || null, i, 3, { rot: loose ? tiltFor(d, i + 1, 1.4) : 0, reveal: loose ? 'drop' : 'rise', spread: .6 }));
  });
  return out;
};

// ── 7. Photo Grid ────────────────────────────────────────────────────────────
/** Best grid for n tiles in an area: tile aspect kept between .75 and 1.6. */
function bestGrid(n: number, aw: number, ah: number, g: number, arTarget = 1.33) {
  let best = { cols: 1, rows: n, tw: 0, th: 0, score: -1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (aw - g * (cols - 1)) / cols, rh = (ah - g * (rows - 1)) / rows;
    if (cw <= 0 || rh <= 0) continue;
    const ar = Math.min(1.6, Math.max(.75, cw / rh));
    const tw = Math.min(cw, rh * ar), th = tw / ar;
    const waste = (cols * rows - n) / (cols * rows);
    const score = tw * th * (1 - waste * .5) * (1 - Math.abs(Math.log(ar / arTarget)) * .15);
    if (score > best.score) best = { cols, rows, tw, th, score };
  }
  return best;
}

const grid: SlideDesigner = d => {
  const { L, f, u, S } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(f.photos, 24);
  const n = Math.max(1, ps.length || 6);
  let area: Box;
  if (L.stretched) {
    const hw = Math.min(S.w * .22, u * 52);
    out.push(...head(d, S.x, hw, 'left', { maxTitle: S.h * .5, maxCaption: S.h * .26 }).centre(S.y, S.h));
    area = box(S.x + hw + u * 6, S.y, S.right - S.x - hw - u * 6, S.h);
  } else {
    const align = L.vertical ? 'center' : 'left';
    const hs = head(d, S.x, L.vertical ? S.w : S.w * .75, align, { maxTitle: S.h * .11, caption: false, divider: false });
    const hh = hs.height();
    out.push(...hs.place(S.y));
    area = box(S.x, S.y + hh + u * 3, S.w, S.bottom - S.y - hh - u * 3);
  }
  const style = frameStyle(d.th), compact = n > 8;
  const g = u * (n > 12 ? 1.3 : 1.9) + (style === 'polaroid' ? u * .8 : 0);
  const G = bestGrid(n, area.w, area.h, g);
  const totalH = G.rows * G.th + (G.rows - 1) * g;
  const y0 = area.y + (area.h - totalH) / 2;
  const loose = looseThemes(d.th);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / G.cols), col = i % G.cols;
    const inRow = row === G.rows - 1 ? n - row * G.cols : G.cols;
    const rowW = inRow * G.tw + (inRow - 1) * g, x0 = area.x + (area.w - rowW) / 2;
    const cb = box(x0 + col * (G.tw + g), y0 + row * (G.th + g), G.tw, G.th);
    out.push(well(d, inset(d, cb, compact), ps.length ? ps[i] : null, i, n, { compact, rot: tiltFor(d, i, .45), reveal: loose ? 'drop' : 'rise', spread: Math.min(1.4, .07 * n), rxCap: .5 }));
  }
  return out;
};

// ── 8. Mosaic ────────────────────────────────────────────────────────────────
function rngOf(seed: number) { let a = seed >>> 0 || 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

const mosaic: SlideDesigner = d => {
  const { L, f, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(f.photos, 24);
  const rows = { tall: 6, portrait: 5, standard: 4, wide: 4, ultra: 3, panorama: 3 }[L.cls];
  const cols = Math.max(3, Math.round(S.w / (S.h / rows) * .96));
  const T = L.cls === 'tall' ? { c: 0, r: 0, w: 3, h: 2 }
    : L.cls === 'portrait' ? { c: 0, r: 0, w: Math.min(cols, 3), h: 2 }
    : L.cls === 'panorama' ? { c: Math.floor((cols - 3) / 2), r: 0, w: 3, h: 3 }
    : L.cls === 'ultra' ? { c: Math.floor((cols - 2) / 2), r: 0, w: 2, h: 3 }
    : { c: 0, r: rows - 2, w: 2, h: 2 };
  T.w = Math.min(T.w, cols);
  const g = u * .55, cw = (S.w - g * (cols - 1)) / cols, rh = (S.h - g * (rows - 1)) / rows;
  const cell = (c0: number, r0: number, w: number, h: number) => box(S.x + c0 * (cw + g), S.y + r0 * (rh + g), w * cw + (w - 1) * g, h * rh + (h - 1) * g);
  const occ: boolean[] = new Array(cols * rows).fill(false);
  const take = (c0: number, r0: number, w: number, h: number) => { for (let j = r0; j < r0 + h; j++) for (let i = c0; i < c0 + w; i++) occ[j * cols + i] = true; };
  const free = (c0: number, r0: number, w: number, h: number) => {
    if (c0 + w > cols || r0 + h > rows) return false;
    for (let j = r0; j < r0 + h; j++) for (let i = c0; i < c0 + w; i++) if (occ[j * cols + i]) return false;
    return true;
  };
  take(T.c, T.r, T.w, T.h);
  const r = rngOf(d.seed * 7 + cols * 13 + rows);
  const tiles: Array<{ b: Box; dist: number }> = [];
  const tb = cell(T.c, T.r, T.w, T.h);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (occ[j * cols + i]) continue;
    const roll = r();
    const opts: Array<[number, number]> = roll < .2 ? [[2, 2], [2, 1], [1, 1]] : roll < .42 ? [[2, 1], [1, 1]] : roll < .6 ? [[1, 2], [1, 1]] : [[1, 1]];
    const [w, h] = opts.find(([w, h]) => free(i, j, w, h)) || [1, 1];
    take(i, j, w, h);
    const b = cell(i, j, w, h);
    tiles.push({ b, dist: Math.hypot(b.cx - tb.cx, b.cy - tb.cy) });
  }
  // Ripple outward from the title tile.
  const order = tiles.map((t, k) => k).sort((a, b) => tiles[a].dist - tiles[b].dist);
  const rank = new Array(tiles.length); order.forEach((k, i) => { rank[k] = i; });
  const fs = frameStyle(th), style: FrameStyle = fs === 'pop' || fs === 'glow' ? fs : 'clean';
  tiles.forEach((t, k) => {
    const p = ps.length ? ps[(k * 5 + 1) % ps.length] : null;
    const ib = style === 'pop' ? inset(d, t.b, true, 'pop') : t.b;
    out.push(well(d, ib, p, rank[k], tiles.length, { style, compact: true, reveal: 'flip', spread: 1.3, rxCap: .12 }));
  });
  // The title tile: the theme's panel and the words, in panel ink.
  const pad = Math.min(u * 2.6, tb.w * .08);
  const solid = /^#[0-9a-f]{6}$/i.test(c.panel);
  out.push(rect(tb.x, tb.y, tb.w, tb.h, solid ? c.panel : c.ground, { label: 'Title tile', rx: Math.min(tb.w, tb.h) * Math.min(th.slot.rx, .12) }));
  out.push(...m.panel(tb.x, tb.y, tb.w, tb.h, L));
  const ink = solid ? c.panelInk : c.ink, muted = solid ? c.panelMuted : c.muted;
  const kick = solid && contrast(c.accent, c.panel) >= 3 ? c.accent : muted;
  const iw = tb.w - pad * 2, ix = tb.x + pad;
  const st = new Stack();
  if (f.kicker) st.add(fitText(ix, 0, iw, f.kicker, ty.label(u * 1.5, { color: kick }), u * 4));
  st.add(fitText(ix, 0, iw, f.title, ty.display(Math.min(u * 8, Math.max(u * 4.6, iw * .13)), { color: ink }), tb.h - pad * 2 - u * 7), u * 1);
  if (f.credit) st.add(fitText(ix, 0, iw, f.credit, ty.label(u * 1.15, { color: muted, label: 'Photo credit' }), u * 3), u * 1.6);
  out.push(...st.centre(tb.y + pad, tb.h - pad * 2, 0));
  return out;
};

// ── 9. Photo Wall — lanes of photos that pan slowly behind a title plate ─────
const wall: SlideDesigner = d => {
  const { L, f, u, S, ty, m, c, th, W, H } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(f.photos, 24);
  const horiz = !L.vertical;
  const lanesN = L.vertical ? (L.cls === 'tall' ? 3 : 3.4) : L.cls === 'standard' ? 4 : L.cls === 'wide' ? 3.6 : 3;
  const cross = horiz ? H : W, along = horiz ? W : H;
  const gap = u * .8, size = (cross - gap * (Math.ceil(lanesN) - 1)) / (lanesN - .35);
  const r = rngOf(d.seed * 3 + Math.round(along / 10));
  const ARS = [1.5, 1, 1.33, .8, 1.25, 1.5, .75, 1.33];
  const count = Math.max(1, ps.length || 8);
  const lanes: WallLane[] = [];
  for (let k = 0, pos = -size * .32; pos < cross; k++, pos += size + gap) {
    const seq: WallLane['seq'] = [];
    let len = 0, j = 0;
    const need = along + size * 2;
    while (len < need || j < count) {
      // One aspect per photo: the wall's working set is one bitmap per photo.
      const i = (k * 3 + j) % count, ar = ARS[(i * 5 + 2) % ARS.length], l = horiz ? size * ar : size / ar;
      seq.push({ i, len: l }); len += l + gap; j++;
      if (j > 60) break;
    }
    lanes.push({ pos, size, seq, speed: u * 1.7 * (.8 + r() * .45) * (k % 2 ? -1 : 1) });
  }
  const props: WallProps = { photos: ps, orient: horiz ? 'h' : 'v', lanes, gap, rx: size * Math.min(th.slot.rx, .08), style: frameStyle(th), u };
  const w: SlideObj = ps.length ? image(0, 0, W, H, ps[0].src, 1500, 1000, { label: 'Photo wall', role: 'IMAGE_SLOT' }) : rect(0, 0, W, H, 'none', { label: 'Photo wall', role: 'IMAGE_SLOT' });
  w.live = { drawer: 'photo.wall', props: props as unknown as Record<string, unknown> };
  out.push(w);
  // Plate.
  const pw = L.vertical ? S.w : L.stretched ? Math.min(S.w * .36, u * 92) : Math.min(S.w * .62, u * 92);
  const pad = u * (L.vertical ? 3 : 3.4), iw = pw - pad * 2, px = S.cx - pw / 2;
  const solid = /^#[0-9a-f]{6}$/i.test(c.panel);
  const fill = solid ? c.panel : c.ground, ink = solid ? c.panelInk : c.ink, muted = solid ? c.panelMuted : c.muted;
  const kick = contrast(c.accent, fill) >= 3 ? c.accent : muted;
  const st = new Stack();
  if (f.kicker) st.add(text(px + pad, 0, iw, f.kicker, ty.label(u * 1.6, { align: 'center', color: kick })));
  st.add(fitText(px + pad, 0, iw, f.title, ty.display(u * 6.4, { align: 'center', color: ink }), S.h * .3), u * 1.1);
  if (f.caption) st.add(fitText(px + pad, 0, iw, f.caption, ty.body(u * 2.1, { align: 'center', color: muted, leading: 1.4, label: 'Caption' }), S.h * .16), u * 1.8);
  const sh = st.height(), ph = Math.min(S.h, sh + pad * 2), py = S.cy - ph / 2;
  out.push(glowAt(S.cx, S.cy, pw * .95, ph * 1.25, th.dark ? '#000000' : c.ground, th.dark ? .55 : .6, 'Plate scrim'));
  out.push(...m.frame(L));
  out.push(rect(px, py, pw, ph, fill, { label: 'Title plate', rx: Math.min(pw, ph) * Math.min(th.slot.rx, .1), shadow: { x: 0, y: u * .5, blur: u * 1.6, color: 'rgba(0,0,0,0.35)' } }));
  out.push(...m.panel(px, py, pw, ph, L));
  out.push(...st.place(py + (ph - sh) / 2));
  return out;
};

// ── 10. Collage — scattered prints that drop and settle ──────────────────────
const collage: SlideDesigner = d => {
  const { L, f, u, S } = ctx(d);
  const out = prelude(d, false);
  const ps = photosOf(f.photos, 8);
  const n = Math.max(1, Math.min(8, ps.length || 5));
  const regions: Box[] = [];
  if (L.vertical) {
    const rb = box(S.x, S.y, S.w, S.h * .6);
    regions.push(rb);
    out.push(...head(d, S.x, S.w, 'center', { maxTitle: S.h * .12, maxCaption: S.h * .09 }).centre(rb.bottom + u * 4, S.bottom - rb.bottom - u * 4, 0));
  } else if (L.cls === 'panorama') {
    const tw = Math.min(S.w * .26, u * 70);
    out.push(...head(d, S.cx - tw / 2, tw, 'center', { maxTitle: S.h * .4, maxCaption: S.h * .26 }).centre(S.y, S.h));
    const side = (S.w - tw) / 2 - u * 6;
    regions.push(box(S.x, S.y, side, S.h), box(S.right - side, S.y, side, S.h));
  } else {
    const tw = L.cls === 'ultra' ? Math.min(S.w * .28, u * 70) : S.w * .32;
    out.push(...head(d, S.x, tw, 'left', { maxTitle: S.h * .34, maxCaption: S.h * .26 }).centre(S.y, S.h));
    regions.push(box(S.x + tw + u * 5, S.y, S.w - tw - u * 5, S.h));
  }
  const loose = looseThemes(d.th);
  const r = rngOf(d.seed * 11 + Math.round(d.W / 7));
  const per = regions.length === 2 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
  let i = 0;
  regions.forEach((reg, ri) => {
    const k = per[ri]; if (!k) return;
    const G = bestGrid(k, reg.w, reg.h, 0, 1.2);
    const totalW = G.cols * G.tw, totalH = G.rows * G.th;
    const x0 = reg.x + (reg.w - totalW) / 2, y0 = reg.y + (reg.h - totalH) / 2;
    for (let j = 0; j < k; j++, i++) {
      const row = Math.floor(j / G.cols), col = j % G.cols;
      const inRow = row === G.rows - 1 ? k - row * G.cols : G.cols;
      const rx0 = x0 + (G.cols - inRow) * G.tw / 2;
      const cx = rx0 + (col + .5) * G.tw + (r() - .5) * G.tw * .26, cy = y0 + (row + .5) * G.th + (r() - .5) * G.th * .26 + (col % 2 ? G.th * .06 : -G.th * .06);
      const portrait = r() < .4;
      const ar = portrait ? .8 : 1.32;
      // Prints are a touch larger than their cell, so they overlap like a real pile.
      const k2 = 1.12 + r() * .16, cell = box(cx - G.tw * k2 / 2, cy - G.th * k2 / 2, G.tw * k2, G.th * k2);
      let b = fitAr(cell, ar);
      // Keep every print inside its region.
      b = box(Math.min(Math.max(b.x, reg.x), reg.right - b.w), Math.min(Math.max(b.y, reg.y), reg.bottom - b.h), b.w, b.h);
      const rot = loose ? (j % 2 ? -1 : 1) * (2.5 + r() * 5) : (j % 2 ? -1 : 1) * (.6 + r() * 1.8);
      out.push(well(d, inset(d, b), ps.length ? ps[i % ps.length] : null, i, n, { motion: 'settle', reveal: 'drop', rot, spread: .9, rxCap: .06 }));
    }
  });
  return out;
};

export const PHOTO_TEMPLATES: SlideTemplateDef[] = [
  { id: 'photo-hero', name: 'Single Hero', category: 'Photo', media: 'photo', slot: 'slide', design: hero,
    blurb: 'One large photograph in the theme’s frame, drifting slowly, with title and caption.',
    fields: [F('kicker', 'Kicker', 'Ministry moment'), F('title', 'Title', 'Baptism Sunday'), F('caption', 'Caption', 'Twelve people went public with their faith at the river this morning.', { multiline: true }), F('credit', 'Credit', 'Photo · Media Team'), F('photo', 'Photo', sampleToken(2), { kind: 'image', hint: IMAGE_HINT })] },
  { id: 'photo-pair', name: 'Side by Side', category: 'Photo', media: 'photo', slot: 'slide', design: pair,
    blurb: 'Two photos, equal weight, with a label under each — then and now, before and after.',
    fields: [F('kicker', 'Kicker', 'Then & now'), F('title', 'Title', 'The Fellowship Hall'), F('labels', 'Labels (one per photo)', 'Groundbreaking · 1998\nRededication · 2026', { multiline: true }), F('photos', 'Photos', samples(16, 4), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-feature', name: 'Feature + Two', category: 'Photo', media: 'photo', slot: 'slide', design: feature,
    blurb: 'One large photo and two supporting shots.',
    fields: [F('kicker', 'Kicker', 'Serve Day'), F('title', 'Title', 'Two Hundred Hands'), F('caption', 'Caption', 'Classrooms painted, the pantry stocked, the garden planted.', { multiline: true }), F('credit', 'Credit', 'Photos · Communications'), F('photos', 'Photos', samples(7, 13, 22), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-triptych', name: 'Triptych', category: 'Photo', media: 'photo', slot: 'slide', design: triptych,
    blurb: 'Three tall panels side by side; stacked bands on a portrait screen.',
    fields: [F('kicker', 'Kicker', 'Creation care'), F('title', 'Title', 'Morning · Noon · Night'), F('caption', 'Caption', 'The heavens declare the glory of God.', { multiline: true }), F('credit', 'Credit', ''), F('photos', 'Photos', samples(1, 4, 9), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-overlap', name: 'Staggered Pair', category: 'Photo', media: 'photo', slot: 'slide', design: overlap,
    blurb: 'Two prints overlapping at an angle, the story beside them.',
    fields: [F('kicker', 'Kicker', 'Missions'), F('title', 'Title', 'Ten Days in Guatemala'), F('caption', 'Caption', 'Our team built two homes and ran a kids’ camp for 180 children.', { multiline: true }), F('credit', 'Credit', 'Photos · Mission Team'), F('photos', 'Photos', samples(18, 7), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-cascade', name: 'Staggered Trio', category: 'Photo', media: 'photo', slot: 'slide', design: cascade,
    blurb: 'Three photos cascading corner to corner.',
    fields: [F('kicker', 'Kicker', 'Youth retreat'), F('title', 'Title', 'Up the Mountain'), F('caption', 'Caption', 'Three days of worship, hiking and late-night talks.', { multiline: true }), F('credit', 'Credit', ''), F('photos', 'Photos', samples(1, 13, 5), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-grid', name: 'Photo Grid', category: 'Photo', media: 'photo', slot: 'slide', design: grid,
    blurb: '6–24 photos in a clean grid that re-columns for every screen.',
    fields: [F('kicker', 'Kicker', 'Gallery'), F('title', 'Title', 'Summer Camp 2026'), F('credit', 'Credit', 'Photos · Youth Team'), F('photos', 'Photos (6–24)', samples(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-mosaic', name: 'Mosaic', category: 'Photo', media: 'photo', slot: 'slide', design: mosaic,
    blurb: 'An irregular tile mosaic that ripples in from the title tile.',
    fields: [F('kicker', 'Kicker', 'Our church family'), F('title', 'Title', 'This Is Us'), F('credit', 'Credit', 'Photos · Members'), F('photos', 'Photos', samples(3, 6, 9, 12, 15, 18, 21, 24, 2, 5, 8, 11, 14, 17), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-wall', name: 'Photo Wall', category: 'Photo', media: 'photo', slot: 'slide', design: wall,
    blurb: 'A wall of photos panning slowly behind a title plate — walk-in loops and LED walls.',
    fields: [F('kicker', 'Kicker', 'Thank you, volunteers'), F('title', 'Title', 'You Made It Happen'), F('caption', 'Caption', 'Vacation Bible School 2026 · 340 kids · 96 volunteers', { multiline: true }), F('photos', 'Photos', samples(1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 2, 6, 10, 14), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
  { id: 'photo-collage', name: 'Collage', category: 'Photo', media: 'photo', slot: 'slide', design: collage,
    blurb: 'Prints scattered on the table — they drop in and settle, in the theme’s own paper.',
    fields: [F('kicker', 'Kicker', 'Family camp'), F('title', 'Title', 'Memories from the Lake'), F('caption', 'Caption', 'Thank you to every family who joined us this summer.', { multiline: true }), F('credit', 'Credit', ''), F('photos', 'Photos (up to 8)', samples(2, 14, 7, 20, 11, 4), { kind: 'images', multiline: true, hint: IMAGES_HINT })] },
];
