// books — hand-designed publication page systems (see docs/tela/PUBLICATION_DESIGN_BRIEF.md).
//
// CHILDREN’S BOOK (story-*) and PHOTO BOOK (photo-*), 1024×768 landscape. One
// designer per template switches on pageType; pageIndex varies the repeated page
// types so no two spreads in a book share a composition. Picture books are
// picture-first with read-aloud type at 18–22 px; photo books sequence a hero,
// supporting details and breathing room, with numbered plates and dated captions.
import type { TelaGradientPaint, TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import type { FontKey } from '../../telaFonts';
import { rect, ellipse, circle, hr, vr, path, text, below, imageSlot, mix, alpha } from '../../templateKit';
import { copy } from '../../copy';
import * as orn from '../../ornaments';

// ── Shared vocabulary ─────────────────────────────────────────────────────────
type Stop = [offset: number, color: string, opacity?: number];
const stops = (s: Stop[]) => s.map(([offset, color, opacity]) => (opacity === undefined ? { offset, color } : { offset, color, opacity }));
const lin = (angle: number, ...s: Stop[]): TelaGradientPaint => ({ kind: 'LINEAR', angle, stops: stops(s) });
const rad = (...s: Stop[]): TelaGradientPaint => ({ kind: 'RADIAL', stops: stops(s) });
const verso = (i: number) => i % 2 === 0;
const K = 'kids' as const, P = 'photo' as const;

/** Page number at the bottom outer corner — verso left, recto right. */
function pageNo(ctx: PublicationCtx, color: string, font: FontKey, o: { size?: number; inset?: number; y?: number; weight?: number; opacity?: number } = {}): TelaVectorObject {
  const size = o.size ?? 11, inset = o.inset ?? 40, left = verso(ctx.pageIndex);
  return text(left ? inset : ctx.W - inset - 60, o.y ?? ctx.H - inset - size, 60, String(ctx.pageIndex + 1), { size, font, weight: o.weight ?? 600, color, opacity: o.opacity, align: left ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' });
}

/** Back-cover barcode: seeded bars of 1–3 px. */
function barcode(x: number, y: number, w: number, h: number, color: string, seed: number): TelaVectorObject[] {
  const r = orn.rng(seed); const out: TelaVectorObject[] = []; let cx = x;
  while (cx < x + w - 3) { const t = 1 + Math.floor(r() * 3); out.push(rect(cx, y, t, h, color, { label: 'Barcode bar' })); cx += t + 1 + Math.floor(r() * 3); }
  return out;
}

/** A band whose top edge is a sine wave and which fills to the bottom of its box (0..100). */
function waveTopPath(waves = 2, amp = 8, phase = 0): string {
  const n = 40; let d = '';
  for (let i = 0; i <= n; i++) { const x = i / n * 100; const y = amp + amp * Math.sin(phase + x / 100 * waves * Math.PI * 2); d += `${i ? ' L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`; }
  return d + ' L100 100 L0 100 Z';
}

/** A wandering thread from (0,startY) to (100,endY) in a 0..100 box — seeded cubic segments, so pages join up. */
function threadPath(startY: number, endY: number, seed: number, lo = 14, hi = 86): string {
  const r = orn.rng(seed); let d = `M0 ${startY}`; let x = 0, y = startY; const segs = 4;
  for (let i = 1; i <= segs; i++) {
    const nx = i * 100 / segs, ny = i === segs ? endY : lo + r() * (hi - lo);
    d += ` C${(x + (nx - x) * .4).toFixed(1)} ${y.toFixed(1)} ${(x + (nx - x) * .6).toFixed(1)} ${ny.toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`;
    x = nx; y = ny;
  }
  return d;
}

/** Printer’s crop marks just outside a box (8 short lines). */
function cropMarks(x: number, y: number, w: number, h: number, len: number, color: string, gap = 4): TelaVectorObject[] {
  const o = { label: 'Crop mark' };
  return [
    hr(x - gap - len, y, len, color, .75, o), vr(x, y - gap - len, len, color, .75, o),
    hr(x + w + gap, y, len, color, .75, o), vr(x + w, y - gap - len, len, color, .75, o),
    hr(x - gap - len, y + h, len, color, .75, o), vr(x, y + h + gap, len, color, .75, o),
    hr(x + w + gap, y + h, len, color, .75, o), vr(x + w, y + h + gap, len, color, .75, o),
  ];
}

/** Ruled write-lines for activity pages. */
function writeLines(x: number, y: number, w: number, n: number, gap: number, color: string, dash?: number[]): TelaVectorObject[] {
  return Array.from({ length: n }, (_, i) => hr(x, y + i * gap, w, color, 1, { dash, label: 'Write line' }));
}

/** Small seeded star scatter (circles). */
function stars(rng: () => number, x: number, y: number, w: number, h: number, n: number, color: string, rMax = 2): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  for (let i = 0; i < n; i++) { const rr = .7 + rng() * (rMax - .7); out.push(circle(x + rng() * w, y + rng() * h, rr, color, { opacity: .45 + rng() * .55, label: 'Star' })); }
  return out;
}


// ═════════════════════════════════════════════════════════════════════════════
// PHOTO BOOKS — shared helpers
// ═════════════════════════════════════════════════════════════════════════════
type Shot = { shade?: string; tone?: 'light' | 'dark'; rx?: number; frame?: string; fw?: number; rot?: number; shadow?: TelaVectorObject['shadow']; ink?: string; silent?: boolean };
/** A photo well (the placeholder a creator drops a picture into). */
const shot = (x: number, y: number, w: number, h: number, hint: string, o: Shot = {}): TelaVectorObject[] =>
  imageSlot(x, y, w, h, { tone: o.tone, shade: o.shade, rx: o.rx, frame: o.frame, frameWidth: o.fw, rotation: o.rot, shadow: o.shadow, ink: o.ink, silent: o.silent, caption: hint, label: 'Photo slot' });
const plateTag = (x: number, y: number, n: string, color: string, font: FontKey, o: { size?: number; align?: 'left' | 'right' | 'center'; w?: number; weight?: number; tracking?: number } = {}) =>
  text(x, y, o.w ?? 90, n, { size: o.size ?? 9, font, weight: o.weight ?? 700, color, tracking: o.tracking ?? .18, transform: 'uppercase', align: o.align, wrap: false, label: 'Plate number', role: 'LABEL' });

// ═════════════════════════════════════════════════════════════════════════════
// PHOTO-FAMILY — Family Archive
// ═════════════════════════════════════════════════════════════════════════════
const photoFamily: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: cream, ink, accent: clay, secondary: tan, seed } = ctx;
  const r = orn.rng(seed);
  const board = mix(cream, -.05), print = '#FFFDF8';
  const ground = (c = cream) => rect(0, 0, W, H, c, { role: 'GROUND', label: 'Album page' });
  /** A print mounted with a white border + two bits of tape. */
  const mounted = (x: number, y: number, w: number, h: number, hint: string, rot = 0, pad = 14, foot = 0): TelaVectorObject[] => [
    rect(x - pad, y - pad, w + pad * 2, h + pad * 2 + foot, print, { rotation: rot, shadow: { x: 2, y: 5, blur: 12, color: alpha(ink, .28) }, label: 'Print border' }),
    ...shot(x, y, w, h, hint, { rot, shade: alpha(clay, .12), ink: alpha(ink, .5) }),
    rect(x + w * .1, y - pad - 8, 62, 18, alpha(tan, .55), { rotation: rot - 8, label: 'Tape' }),
    rect(x + w * .72, y - pad - 8, 62, 18, alpha(tan, .55), { rotation: rot + 7, label: 'Tape' }),
  ];
  const date = (x: number, y: number, v: string, w = 220, color = clay, size = 12) => text(x, y, w, v, { size, font: 'courierPrime', weight: 700, color, tracking: .08, transform: 'uppercase', wrap: false, label: 'Dated caption', role: 'CAPTION' });
  const note = (x: number, y: number, w: number, v: string, size = 15, color = ink, align: 'left' | 'center' | 'right' = 'left') => text(x, y, w, v, { size, font: 'lora', italic: true, color, leading: 1.45, align, label: 'Caption', role: 'CAPTION' });
  const folioObj = () => pageNo(ctx, alpha(ink, .6), 'courierPrime', { size: 11, inset: 44 });

  switch (pageType) {
    case 'COVER': {
      const out = [ground(board)];
      out.push(rect(36, 36, W - 72, H - 72, 'none', { stroke: tan, strokeWidth: 1, label: 'Album border' }));
      out.push(...mounted(560, 100, 330, 410, 'Cover photograph · the whole family on the porch', 3.5, 16, 40), ...mounted(490, 420, 200, 150, 'Small print · the dog, mid-yawn', -6, 10, 28));
      out.push(text(72, 84, 400, 'Volume One · Edited by Marguerite Ellis', { size: 11, font: 'courierPrime', weight: 700, color: clay, tracking: .16, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
      const title = text(72, 170, 440, 'Family\nArchive', { size: 86, font: 'lora', weight: 600, color: ink, leading: .98, label: 'Title', role: 'HEADLINE' });
      out.push(title, hr(76, below(title, 22), 72, clay, 2, { label: 'Title rule' }));
      out.push(text(72, below(title, 42), 370, copy.deck(P, 0), { size: 18, font: 'lora', italic: true, color: ink, opacity: .85, leading: 1.5, label: 'Deck', role: 'DECK' }));
      out.push(date(72, 664, '1994 — 2026 · 412 photographs', 380, ink, 13));
      return out;
    }
    case 'FULL BLEED': {
      if (pageIndex === 1) {
        // Edge to edge; the caption lives on a cream label pinned bottom-left.
        const out = [ground(ink), ...shot(0, 0, W, H, 'Full-bleed photograph · the lake, Christmas week', { tone: 'dark', shade: alpha(clay, .35), ink: alpha('#FFFFFF', .6) })];
        out.push(rect(48, H - 176, 440, 128, print, { shadow: { x: 0, y: 6, blur: 14, color: alpha('#000000', .35) }, label: 'Caption label' }), rect(48, H - 176, 6, 128, clay, { label: 'Label edge' }));
        out.push(date(78, H - 156, '24 Dec 2009 · Lake Anna', 380), note(78, H - 130, 380, copy.caption(P, 0), 19));
        out.push(plateTag(W - 108, 40, 'Plate 01', print, 'courierPrime', { align: 'right' }), hr(48, 44, 24, print, 1.5, { label: 'Tab mark' }));
        out.push(pageNo(ctx, print, 'courierPrime', { size: 11, inset: 44, weight: 700 }));
        return out;
      }
      // pageIndex 4 — photo takes 62% of the page; a year numeral and a second small print sit in the margin.
      const out = [ground(board), ...shot(0, 0, 640, H, 'Photograph · graduation day, the long way round', { shade: alpha(clay, .2), ink: alpha(ink, .5) })];
      out.push(text(676, 60, 320, '1996', { size: 92, font: 'courierPrime', weight: 700, color: clay, wrap: false, label: 'Year numeral', role: 'HEADLINE' }));
      out.push(hr(680, 176, 52, ink, 1.5, { label: 'Rule' }), note(680, 198, 290, 'Mum ironed the gown twice. Dad stood in every photograph a little too close to the edge, so that he could see the stage.', 17));
      out.push(...mounted(716, 440, 220, 168, 'Small print · the stage, after', -3, 10, 30), date(680, 678, 'Back of print: “June, Lena 18”', 290, ink, 10));
      out.push(folioObj());
      return out;
    }
    case 'PHOTO GRID': {
      if (pageIndex === 2) {
        // One large print on the left, two small on the right, each with a dated line.
        const out = [ground(), rect(48, 48, 560, 600, print, { shadow: { x: 2, y: 4, blur: 10, color: alpha(ink, .2) }, label: 'Mount board' })];
        out.push(...shot(64, 64, 528, 568, 'Large photograph · first day at the new house', { shade: alpha(clay, .14), ink: alpha(ink, .5) }));
        out.push(date(64, 664, '9 Sep 1998 · Maple Street', 340), note(64, 686, 540, 'We had a sofa and a kettle. That was enough.', 14));
        out.push(...shot(648, 48, 328, 270, 'Small photograph · the stairs', { shade: alpha(tan, .3), ink: alpha(ink, .5) }), date(648, 330, 'Oct 1998', 200, clay, 11));
        out.push(...shot(648, 378, 328, 270, 'Small photograph · the garden', { shade: alpha(clay, .12), ink: alpha(ink, .5) }), date(648, 660, 'Apr 1999', 200, clay, 11));
        out.push(note(648, 684, 328, 'The apple tree that was already there.', 13), folioObj());
        return out;
      }
      // pageIndex 6 — contact-sheet page: caption column left, six frames in a 3×2.
      const out = [ground(board)];
      out.push(text(56, 64, 220, 'Summers', { size: 40, font: 'lora', weight: 600, color: ink, label: 'Section title', role: 'HEADLINE' }), hr(58, 126, 56, clay, 2, { label: 'Rule' }));
      out.push(note(56, 146, 200, 'Six weeks, one rented van, and whoever fit. Numbered in the order they were taken.', 15));
      const items = ['1 · Packing the van', '2 · Gas station breakfast', '3 · The river, first dip', '4 · Cousins on the dock', '5 · Burnt marshmallows', '6 · Last night, last light'];
      items.forEach((s, i) => out.push(text(56, 360 + i * 40, 220, s, { size: 11, font: 'courierPrime', weight: 700, color: ink, opacity: .85, wrap: false, label: 'Frame key', role: 'CAPTION' })));
      const cw = 224, ch = 292, gx = 14;
      items.forEach((s, i) => {
        const c = i % 3, rr = Math.floor(i / 3), x = 296 + c * (cw + gx), y = 64 + rr * (ch + 40);
        out.push(...shot(x, y, cw, ch, `Frame ${i + 1}`, { shade: alpha(i % 2 ? tan : clay, .2), ink: alpha(ink, .5) }));
        out.push(date(x, y + ch + 8, `No. ${String(i + 1).padStart(2, '0')}`, 80, clay, 10));
      });
      out.push(folioObj());
      return out;
    }
    case 'CAPTIONED PHOTO': {
      const out = [ground(board)];
      out.push(...mounted(104, 90, 480, 520, 'Photograph · Grandpa’s garden, the long row of beans', -1.5, 18, 52));
      out.push(note(104, 646, 480, 'Back of print: “For Ruth — the beans did well.”', 14));
      out.push(date(660, 96, '14 June 1994', 280, clay, 17));
      const t = text(660, 130, 300, 'Grandpa’s garden', { size: 40, font: 'lora', weight: 600, color: ink, leading: 1.1, label: 'Photo title', role: 'HEADLINE' });
      out.push(t, hr(662, below(t, 20), 52, clay, 2, { label: 'Rule' }));
      const p = text(660, below(t, 42), 300, copy.body(P, 0), { size: 15, font: 'lora', color: ink, leading: 1.6, label: 'Memory', role: 'BODY' });
      out.push(p, text(660, below(p, 22), 300, 'In the picture', { size: 10, font: 'courierPrime', weight: 700, color: clay, tracking: .16, transform: 'uppercase', wrap: false, label: 'Who label', role: 'LABEL' }));
      out.push(text(660, below(p, 42), 300, 'Walter (left) · Ruth · cousin Ana, aged six, refusing to wear a hat', { size: 13, font: 'lora', italic: true, color: ink, leading: 1.5, label: 'Names', role: 'CAPTION' }));
      out.push(folioObj());
      return out;
    }
    case 'TIMELINE': {
      const out = [ground()];
      out.push(text(64, 56, 600, 'Six years, one rail', { size: 42, font: 'lora', weight: 600, color: ink, wrap: false, label: 'Timeline title', role: 'HEADLINE' }), note(64, 112, 560, 'Where we were, year by year — the order the photographs fall in.', 16));
      out.push(hr(64, 396, W - 128, ink, 2, { label: 'Timeline rail' }));
      const years = ['1994', '1996', '1999', '2003', '2007', '2012'];
      years.forEach((y, i) => {
        const cx = 128 + i * 154, up = i % 2 === 0, ty = up ? 214 : 424;
        out.push(circle(cx, 396, 7, clay, { stroke: cream, strokeWidth: 3, label: 'Timeline node' }), vr(cx, up ? 340 : 404, 56, alpha(ink, .35), 1, { label: 'Stem' }));
        out.push(...shot(cx - 62, ty - (up ? 0 : 0), 124, 124, `${y} · photograph`, { shade: alpha(i % 2 ? tan : clay, .22), ink: alpha(ink, .5) }));
        out.push(date(cx - 62, up ? ty + 134 : ty + 134, y, 124, clay, 15), note(cx - 70, ty + 158, 140, ['Garden, the beans', 'Graduation', 'The first house', 'Cousins’ wedding', 'The long drive', 'Everyone, finally'][i], 12, ink, 'left'));
      });
      out.push(folioObj());
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [ground(board), rect(36, 36, W - 72, H - 72, 'none', { stroke: tan, strokeWidth: 1, label: 'Album border' })];
      out.push(...mounted(432, 120, 160, 200, 'Small closing photograph', 2, 10, 24));
      out.push(text(0, 380, W, 'Family Archive', { size: 40, font: 'lora', weight: 600, color: ink, align: 'center', wrap: false, label: 'Title, small', role: 'HEADLINE' }));
      out.push(note(212, 444, 600, 'Photographs by the family. Captions by whoever remembered. Edited by Marguerite Ellis, who is sorry about the thumb in the lower corner of page nine.', 17, ink, 'center'));
      out.push(hr(472, 564, 80, clay, 2, { label: 'Rule' }), text(0, 590, W, 'Volume One · printed 2026', { size: 12, font: 'courierPrime', weight: 700, color: ink, tracking: .1, align: 'center', transform: 'uppercase', wrap: false, label: 'Colophon line', role: 'CAPTION' }));
      out.push(text(64, 690, 300, 'Plajah Photo Books', { size: 11, font: 'courierPrime', weight: 700, color: clay, tracking: .16, transform: 'uppercase', wrap: false, label: 'Imprint', role: 'LABEL' }));
      out.push(rect(838, 668, 108, 62, print, { label: 'Barcode plate' }), ...barcode(848, 676, 88, 36, ink, seed));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PHOTO-TRAVEL — Road & Horizon
// ═════════════════════════════════════════════════════════════════════════════
const photoTravel: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: sand, ink: slate, accent: rust, secondary: gold, seed } = ctx;
  const white = '#FFFFFF';
  const ground = (c = sand) => rect(0, 0, W, H, c, { role: 'GROUND', label: 'Page ground' });
  const note = (x: number, y: number, w: number, v: string, color = slate, size = 12, o: { align?: 'left' | 'right' | 'center'; weight?: number } = {}) => text(x, y, w, v, { size, font: 'spaceGrotesk', weight: o.weight ?? 400, color, leading: 1.45, align: o.align, label: 'Caption', role: 'CAPTION' });
  const coord = (x: number, y: number, v: string, color = rust, w = 260) => text(x, y, w, v, { size: 10, font: 'courierPrime', weight: 700, color, tracking: .06, wrap: false, label: 'Coordinates', role: 'CAPTION' });
  const route = (x: number, y: number, w: number, h: number, color: string, opacity = 1, phase = 0) => path(x, y, w, h, orn.sineOpenPath(1.3, 22, phase), 'none', { stroke: color, strokeWidth: 2.5, dash: [2, 9], open: true, opacity, label: 'Route line' });
  const folioObj = (color = slate) => pageNo(ctx, alpha(color, .7), 'spaceGrotesk', { size: 11, inset: 40, weight: 600 });

  switch (pageType) {
    case 'COVER': {
      const out = [ground(slate), ...shot(0, 0, W, 520, 'Cover panorama · the road, the ridge, the long light', { tone: 'dark', shade: alpha(rust, .28), ink: alpha('#FFFFFF', .6) })];
      out.push(rect(0, 520, W, 6, rust, { label: 'Horizon rule' }), circle(880, 520, 48, gold, { label: 'Low sun' }), rect(0, 520, W, 248, slate, { label: 'Title band' }));
      out.push(text(56, 560, 300, 'Photographs · Volume 01', { size: 11, font: 'spaceGrotesk', weight: 700, color: gold, tracking: .24, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
      out.push(text(56, 590, 800, 'ROAD & HORIZON', { size: 76, font: 'spaceGrotesk', weight: 700, color: sand, tracking: .02, wrap: false, label: 'Title', role: 'HEADLINE' }));
      out.push(coord(56, 696, '34.0522° N · 118.2437° W  →  35.6762° N · 139.6503° E', gold, 520), route(560, 650, 400, 90, gold, .8));
      out.push(text(56, 718, 400, 'Nine weeks, eleven borders, one camera', { size: 14, font: 'spaceGrotesk', weight: 400, color: alpha(sand, .85), wrap: false, label: 'Deck', role: 'DECK' }));
      return out;
    }
    case 'FULL BLEED': {
      if (pageIndex === 1) {
        // Panorama edge to edge with a thin caption bar along the foot.
        const out = [ground(slate), ...shot(0, 0, W, H - 54, 'Panorama · Route 66, mile 412, dawn', { tone: 'dark', shade: alpha(rust, .3), ink: alpha('#FFFFFF', .6) })];
        out.push(rect(0, H - 54, W, 54, slate, { label: 'Caption bar' }), rect(0, H - 54, 8, 54, rust, { label: 'Bar accent' }));
        out.push(text(32, H - 36, 100, 'MILE 412', { size: 12, font: 'spaceGrotesk', weight: 700, color: gold, tracking: .18, wrap: false, label: 'Place', role: 'LABEL' }), note(140, H - 38, 640, copy.caption(P, 1), sand, 13));
        out.push(coord(W - 330, H - 36, '35.0°N 111.0°W · 1,740 m', gold, 260), plateTag(W - 60, H - 36, '01', sand, 'spaceGrotesk', { align: 'right', w: 24, size: 12 }), ...cropMarks(20, 20, W - 40, H - 94, 10, alpha('#FFFFFF', .55), 0));
        return out;
      }
      // pageIndex 4 — picture framed inside the margins; the elevation profile runs along the foot.
      const out = [ground(), ...shot(56, 56, W - 112, 520, 'Photograph · the pass at first light', { shade: alpha(slate, .2), frame: slate, fw: 2, ink: alpha(slate, .55) })];
      out.push(rect(56, 56, 300, 74, sand, { label: 'Caption plate' }), text(72, 68, 100, 'DAY 05', { size: 11, font: 'spaceGrotesk', weight: 700, color: rust, tracking: .18, wrap: false, label: 'Day', role: 'LABEL' }), note(72, 88, 270, 'Puna de Atacama, 4,400 m', slate, 14, { weight: 600 }));
      out.push(path(56, 604, W - 112, 100, orn.sineOpenPath(2.2, 34, 0.8), 'none', { stroke: rust, strokeWidth: 2.5, open: true, label: 'Elevation profile' }), hr(56, 722, W - 112, slate, 1, { label: 'Axis' }));
      ['0 km', '120', '240', '360', '480'].forEach((k, i) => out.push(text(56 + i * 214, 728, 60, k, { size: 9, font: 'courierPrime', weight: 700, color: slate, wrap: false, label: 'Axis label', role: 'CAPTION' })));
      out.push(note(56, 584, 500, 'Elevation along the day’s drive', slate, 11), folioObj());
      return out;
    }
    case 'PHOTO GRID': {
      if (pageIndex === 2) {
        // Three tall strips, ragged tops, coordinates under each.
        const out = [ground()];
        const strips: Array<[number, number, number, string, string]> = [[56, 56, 540, 'Strip one · the diner at dusk', '36.1° N · 112.1° W'], [364, 150, 440, 'Strip two · wind on the salt flats', '40.7° N · 113.8° W'], [672, 56, 540, 'Strip three · the border queue', '32.5° N · 117.0° W']];
        strips.forEach(([x, y, h, hint, c], i) => {
          out.push(...shot(x, y, 296, h, hint, { shade: alpha(i === 1 ? gold : rust, .24), ink: alpha(slate, .55) }), coord(x, y + h + 10, c), plateTag(x + 296 - 30, y + h + 10, `0${i + 2}`, slate, 'spaceGrotesk', { align: 'right', w: 30, size: 10 }));
        });
        out.push(note(56, 636, 296, copy.caption(P, 1), slate, 13), hr(364, 636, 120, rust, 2, { label: 'Rule' }), text(364, 650, 300, 'Three stops, one day', { size: 22, font: 'spaceGrotesk', weight: 700, color: slate, wrap: false, label: 'Grid title', role: 'DECK' }), folioObj());
        return out;
      }
      // pageIndex 6 — one wide frame over a row of three.
      const out = [ground(), ...shot(56, 56, W - 112, 340, 'Wide frame · the long plain', { shade: alpha(slate, .18), ink: alpha(slate, .55) })];
      out.push(coord(56, 408, '41.9° N · 12.5° E'), note(W - 456, 406, 400, 'From the roof, the whole plain at once.', slate, 12, { align: 'right' }));
      [0, 1, 2].forEach(i => {
        const x = 56 + i * 312;
        out.push(...shot(x, 452, 288, 216, `Detail ${i + 1}`, { shade: alpha(i === 1 ? gold : rust, .22), ink: alpha(slate, .55) }), coord(x, 680, ['Door, Rome', 'Tram, Lisbon', 'Steps, Valletta'][i], slate), plateTag(x + 288 - 24, 680, `0${i + 6}`, rust, 'spaceGrotesk', { align: 'right', w: 24, size: 10 }));
      });
      out.push(folioObj());
      return out;
    }
    case 'CAPTIONED PHOTO': {
      const out = [ground(slate), ...shot(0, 120, W, 400, 'Panorama · the salt flats, no horizon', { tone: 'dark', shade: alpha(gold, .2), ink: alpha('#FFFFFF', .55) })];
      out.push(rect(520, 440, 448, 200, sand, { shadow: { x: 0, y: 10, blur: 24, color: alpha('#000000', .4) }, label: 'Field-note card' }), rect(520, 440, 448, 6, rust, { label: 'Card edge' }));
      out.push(text(548, 468, 200, 'FIELD NOTE 07', { size: 11, font: 'courierPrime', weight: 700, color: rust, tracking: .2, wrap: false, label: 'Note label', role: 'LABEL' }));
      const t = text(548, 494, 392, 'Where the road stops arguing', { size: 26, font: 'spaceGrotesk', weight: 700, color: slate, leading: 1.15, label: 'Photo title', role: 'DECK' });
      out.push(t, text(548, below(t, 12), 392, 'Eleven hours, one flat tyre, a stranger who held the torch. The salt makes its own sky; you can’t tell where the ground ends.', { size: 13, font: 'spaceGrotesk', color: slate, leading: 1.5, label: 'Field note', role: 'BODY' }));
      out.push(circle(120, 566, 56, 'none', { stroke: gold, strokeWidth: 2.5, label: 'Stamp ring' }), circle(120, 566, 46, 'none', { stroke: gold, strokeWidth: 1, label: 'Stamp ring, inner' }), text(70, 556, 100, 'BONNEVILLE\n12 SEP', { size: 10, font: 'courierPrime', weight: 700, color: gold, align: 'center', leading: 1.2, tracking: .06, label: 'Stamp text', role: 'LABEL' }));
      out.push(text(56, 56, 500, 'ROAD & HORIZON', { size: 12, font: 'spaceGrotesk', weight: 700, color: gold, tracking: .3, wrap: false, label: 'Running head', role: 'LABEL' }), coord(56, 84, '40.7766° N · 113.8° W · elev. 1,288 m', sand, 460));
      out.push(route(60, 620, 420, 100, gold, .7, 2), plateTag(W - 100, 56, 'Plate 03', gold, 'spaceGrotesk', { align: 'right', w: 60 }), folioObj(sand));
      return out;
    }
    case 'TIMELINE': {
      const out = [ground(), text(56, 52, 700, 'Day one to day nine', { size: 46, font: 'spaceGrotesk', weight: 700, color: slate, wrap: false, label: 'Timeline title', role: 'HEADLINE' }), note(56, 112, 460, 'Nine nights, 5,812 km. The route in the order we slept.', slate, 15)];
      out.push(hr(72, 410, 880, slate, 2, { dash: [2, 8], label: 'Route' }));
      const stops: Array<[string, string, string]> = [['Los Angeles', 'Day 1', '0 km'], ['Flagstaff', 'Day 2', '720'], ['Moab', 'Day 3', '1,380'], ['Salt Lake', 'Day 5', '2,170'], ['Boise', 'Day 7', '2,980'], ['Seattle', 'Day 9', '3,640']];
      stops.forEach(([place, day, km], i) => {
        const t = i / 5, cx = 96 + t * 832;
        out.push(circle(cx, 410, 9, i === 0 || i === 5 ? rust : slate, { stroke: sand, strokeWidth: 3, label: 'Stop' }), vr(cx, i % 2 ? 420 : 340, 70, alpha(slate, .35), 1, { label: 'Stem' }));
        const ty = i % 2 ? 496 : 268;
        out.push(text(cx - 70, ty, 140, day, { size: 11, font: 'spaceGrotesk', weight: 700, color: rust, tracking: .2, transform: 'uppercase', align: 'center', wrap: false, label: 'Stop day', role: 'LABEL' }), text(cx - 70, ty + 18, 140, place, { size: 20, font: 'spaceGrotesk', weight: 700, color: slate, align: 'center', wrap: false, label: 'Stop place', role: 'DECK' }), coord(cx - 70, ty + 48, km, slate, 140));
      });
      out.push(...shot(56, 600, 180, 110, 'Thumbnail · day 1', { shade: alpha(rust, .22), ink: alpha(slate, .5) }), ...shot(780, 600, 180, 110, 'Thumbnail · day 9', { shade: alpha(gold, .3), ink: alpha(slate, .5) }), hr(250, 655, 516, slate, 1, { dash: [2, 6], label: 'Return line' }), note(250, 664, 516, 'Start to finish, 3,640 km as the crow flies. The road had other ideas.', slate, 12, { align: 'center' }), folioObj());
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [ground(slate), ...orn.dotField(0, 0, W, 460, 48, alpha(sand, .55), { rMin: 1, rMax: 4, grade: 'y', label: 'Map dots' })];
      out.push(route(120, 130, 760, 240, gold, .9, 1.6), circle(130, 292, 9, rust, { stroke: slate, strokeWidth: 3, label: 'Start' }), circle(870, 168, 9, gold, { stroke: slate, strokeWidth: 3, label: 'End' }));
      out.push(text(56, 500, 700, 'Road & Horizon', { size: 52, font: 'spaceGrotesk', weight: 700, color: sand, wrap: false, label: 'Title, small', role: 'HEADLINE' }));
      out.push(text(56, 574, 520, 'Photographs, notes and one broken radio. Printed on uncoated stock so the dust shows.', { size: 15, font: 'spaceGrotesk', color: alpha(sand, .85), leading: 1.5, label: 'Blurb', role: 'BODY' }));
      out.push(coord(56, 690, 'PLAJAH PHOTO BOOKS · VOLUME 01 · 2026', gold, 460), rect(828, 650, 140, 76, sand, { label: 'Barcode plate' }), ...barcode(840, 658, 116, 40, slate, seed), text(828, 704, 140, 'PPB-0102 · £34', { size: 8, font: 'courierPrime', weight: 700, color: slate, align: 'center', wrap: false, label: 'Price line', role: 'CAPTION' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PHOTO-PORTFOLIO — Photographer’s Edit
// ═════════════════════════════════════════════════════════════════════════════
const photoPortfolio: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: white, ink: black, accent: grey, secondary: red, seed } = ctx;
  const ground = (c = white) => rect(0, 0, W, H, c, { role: 'GROUND', label: 'Gallery wall' });
  const mark = (x: number, y: number, s = 14) => rect(x, y, s, s, red, { label: 'Red mark' });
  const small = (x: number, y: number, w: number, v: string, o: { color?: string; align?: 'left' | 'right' | 'center'; size?: number; weight?: number; tracking?: number } = {}) => text(x, y, w, v, { size: o.size ?? 9, font: 'inter', weight: o.weight ?? 500, color: o.color || grey, tracking: o.tracking ?? .14, align: o.align, transform: 'uppercase', wrap: false, label: 'Label', role: 'LABEL' });
  const wall = (x: number, y: number, w: number, h: number, hint: string, dark = false) => shot(x, y, w, h, hint, { tone: dark ? 'dark' : 'light', shade: dark ? '#262626' : '#E4E3DE', ink: dark ? alpha('#FFFFFF', .5) : alpha(black, .45) });
  const folioObj = (color = grey) => pageNo(ctx, color, 'inter', { size: 9, inset: 44, weight: 600 });

  switch (pageType) {
    case 'COVER': {
      const out = [ground(), ...wall(500, 72, 432, 576, 'Cover photograph · the single strongest frame')];
      out.push(mark(72, 76), small(96, 76, 300, 'Selected work · 2019 — 2026', { color: black, weight: 600, size: 10, tracking: .22 }));
      const title = text(72, 170, 400, 'Photo-\ngrapher’s\nEdit', { size: 62, font: 'inter', weight: 300, color: black, leading: 1.04, label: 'Title', role: 'HEADLINE' });
      out.push(title, hr(74, below(title, 28), 40, black, 1.5, { label: 'Rule' }), text(72, below(title, 48), 300, copy.deck(P, 1), { size: 13, font: 'inter', weight: 400, color: grey, leading: 1.6, label: 'Deck', role: 'DECK' }));
      out.push(small(72, 688, 300, 'Nadia Farouk · Monograph 01', { color: black, weight: 600 }), small(500, 664, 432, 'Plate 00 · Cover', { align: 'right' }));
      return out;
    }
    case 'FULL BLEED': {
      if (pageIndex === 1) {
        // One image, centred, a wide white field around it.
        const out = [ground(), ...wall(192, 72, 640, 560, 'Photograph · the stairwell, 4 p.m.')];
        out.push(small(192, 652, 200, 'Plate 01', { color: black, weight: 700 }), small(192, 668, 400, 'Stairwell, Marseille · 2022'), small(632, 652, 200, 'Gelatin silver print', { align: 'right' }), mark(818, 668, 10));
        out.push(hr(192, 648, 640, black, .75, { label: 'Hairline' }), small(192, 40, 300, 'Photographer’s Edit', { size: 8 }), folioObj());
        return out;
      }
      // pageIndex 4 — the rare full-bleed: edge to edge, the label sits inside the frame.
      const out = [ground(black), ...wall(0, 0, W, H, 'Full-bleed photograph · the field after rain', true)];
      out.push(mark(40, H - 52, 10), small(60, H - 52, 400, 'Plate 04 · Field after rain, Skåne · 2021', { color: '#FFFFFF', weight: 600 }), small(W - 240, H - 52, 200, '04 / 07', { color: '#FFFFFF', align: 'right', weight: 600 }));
      out.push(hr(40, H - 64, 24, '#FFFFFF', 1, { label: 'Tab mark' }), ...cropMarks(8, 8, W - 16, H - 16, 10, alpha('#FFFFFF', .5), 0));
      return out;
    }
    case 'PHOTO GRID': {
      if (pageIndex === 2) {
        // A pair, matched in size, on a shared baseline.
        const out = [ground()];
        out.push(...wall(96, 120, 392, 520, 'Photograph · left of pair'), ...wall(536, 120, 392, 520, 'Photograph · right of pair'));
        out.push(small(96, 664, 100, 'Plate 02', { color: black, weight: 700 }), small(96, 680, 392, 'Hands, Casablanca · 2020'), small(536, 664, 100, 'Plate 03', { color: black, weight: 700 }), small(536, 680, 392, 'Hands, Fez · 2020'));
        out.push(small(96, 80, 400, 'Diptych · Hands', { color: black, weight: 600, size: 10 }), mark(910, 82, 10), hr(96, 104, 832, black, .75, { label: 'Hairline' }), folioObj());
        return out;
      }
      // pageIndex 6 — triptych, three heights on one baseline.
      const out = [ground(), ...wall(96, 300, 252, 340, 'Photograph · one'), ...wall(386, 180, 252, 460, 'Photograph · two'), ...wall(676, 380, 252, 260, 'Photograph · three')];
      [['Plate 06', 'Rail, Gdańsk'], ['Plate 07', 'Window, Gdańsk'], ['Plate 08', 'Crane, Gdańsk']].forEach(([a, b], i) => out.push(small(96 + i * 290, 664, 252, a, { color: black, weight: 700 }), small(96 + i * 290, 680, 252, `${b} · 2023`)));
      out.push(small(96, 80, 400, 'Triptych · Harbour', { color: black, weight: 600, size: 10 }), hr(96, 104, 832, black, .75, { label: 'Hairline' }), mark(910, 82, 10), folioObj());
      return out;
    }
    case 'CAPTIONED PHOTO': {
      const out = [ground(), ...wall(96, 64, 440, 640, 'Photograph · portrait, north window')];
      out.push(text(600, 56, 330, '03', { size: 120, font: 'inter', weight: 200, color: '#D9D8D3', wrap: false, label: 'Plate numeral', role: 'HEADLINE' }), mark(604, 206, 14));
      out.push(text(600, 244, 330, 'Portrait, north window', { size: 22, font: 'inter', weight: 500, color: black, leading: 1.2, label: 'Photo title', role: 'DECK' }));
      out.push(text(600, 306, 320, copy.body(P, 1), { size: 12, font: 'inter', weight: 400, color: '#4A4A4A', leading: 1.65, label: 'Photo note', role: 'BODY' }));
      out.push(hr(600, 466, 330, black, .75, { label: 'Hairline' }));
      [['Place', 'Tbilisi, Georgia'], ['Year', '2022'], ['Camera', 'Mamiya 7 · 80 mm'], ['Film', 'Tri-X 400'], ['Edition', '1 of 8']].forEach(([k, v], i) => out.push(small(600, 482 + i * 28, 90, k), text(700, 480 + i * 28, 230, v, { size: 11, font: 'inter', weight: 500, color: black, wrap: false, label: 'Plate datum', role: 'CAPTION' })));
      out.push(folioObj());
      return out;
    }
    case 'TIMELINE': {
      const out = [ground(), text(96, 64, 600, 'Index of plates', { size: 36, font: 'inter', weight: 300, color: black, wrap: false, label: 'Index title', role: 'HEADLINE' }), mark(900, 78, 14)];
      out.push(hr(96, 142, 832, black, 1, { label: 'Table rule' }), small(96, 120, 60, 'No.', { weight: 700, color: black }), small(240, 120, 300, 'Title', { weight: 700, color: black }), small(560, 120, 200, 'Place', { weight: 700, color: black }), small(820, 120, 108, 'Year', { weight: 700, color: black, align: 'right' }));
      const rows: Array<[string, string, string, string]> = [['01', 'Stairwell, 4 p.m.', 'Marseille', '2022'], ['02', 'Hands', 'Casablanca', '2020'], ['03', 'Portrait, north window', 'Tbilisi', '2022'], ['04', 'Field after rain', 'Skåne', '2021'], ['05', 'Rail', 'Gdańsk', '2023'], ['06', 'Window', 'Gdańsk', '2023'], ['07', 'Crane', 'Gdańsk', '2023']];
      rows.forEach(([n, t, p, y], i) => {
        const yy = 160 + i * 66;
        out.push(...wall(172, yy + 6, 52, 42, `${n}`).slice(0, 1), small(96, yy + 22, 60, n, { color: black, weight: 700 }), text(240, yy + 18, 300, t, { size: 14, font: 'inter', weight: 500, color: black, wrap: false, label: 'Plate title', role: 'BODY' }), small(560, yy + 22, 200, p), small(820, yy + 22, 108, y, { align: 'right' }), hr(96, yy + 58, 832, '#D9D8D3', .75, { label: 'Row rule' }));
      });
      out.push(folioObj());
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [ground(), mark(96, 96, 14)];
      out.push(text(96, 150, 420, 'Photographer’s Edit', { size: 40, font: 'inter', weight: 300, color: black, wrap: false, label: 'Title, small', role: 'HEADLINE' }));
      out.push(text(96, 218, 380, 'Seven plates, selected from nine years and some forty thousand frames. Printed in two colours on uncoated stock; the red is the only one that was a decision.', { size: 12, font: 'inter', color: '#4A4A4A', leading: 1.7, label: 'Colophon', role: 'BODY' }));
      out.push(hr(96, 404, 380, black, .75, { label: 'Hairline' }), small(96, 420, 380, 'Nadia Farouk', { color: black, weight: 700, size: 10 }), small(96, 440, 380, 'studio@nadiafarouk.example'), small(96, 458, 380, 'Edition of 500 · Plajah Photo Books'));
      out.push(...wall(600, 96, 328, 440, 'Closing photograph · quiet, small'), small(600, 552, 328, 'Plate 08 · Endpaper', { align: 'right' }));
      out.push(rect(96, 640, 112, 64, '#FFFFFF', { stroke: black, strokeWidth: .75, label: 'Barcode plate' }), ...barcode(108, 648, 88, 36, black, seed));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PHOTO-WEDDING — Vows & Light
// ═════════════════════════════════════════════════════════════════════════════
const photoWedding: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: ivory, ink: plum, accent: rose, secondary: gold, seed } = ctx;
  const blush = mix(rose, .82);
  const ground = (c = ivory) => rect(0, 0, W, H, c, { role: 'GROUND', label: 'Page ground' });
  const lens = (x: number, y: number, w: number, h: number, hint: string, o: Shot = {}) => shot(x, y, w, h, hint, { shade: alpha(rose, .16), ink: alpha(plum, .5), ...o });
  const cap = (x: number, y: number, w: number, v: string, o: { size?: number; align?: 'left' | 'right' | 'center'; color?: string } = {}) => text(x, y, w, v, { size: o.size ?? 15, font: 'cormorant', weight: 500, italic: true, color: o.color || plum, align: o.align, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  const smallcaps = (x: number, y: number, w: number, v: string, color = gold, align: 'left' | 'center' | 'right' = 'left', size = 11) => text(x, y, w, v, { size, font: 'cormorant', weight: 700, color, tracking: .3, transform: 'uppercase', align, wrap: false, label: 'Small caps', role: 'LABEL' });
  const hair = (x: number, y: number, w: number) => hr(x, y, w, gold, .9, { label: 'Gold hairline' });
  const folioObj = (color = plum) => pageNo(ctx, alpha(color, .65), 'cormorant', { size: 14, inset: 48, weight: 600 });
  const diamond = (cx: number, cy: number, s = 5) => path(cx - s, cy - s, s * 2, s * 2, orn.polygonPath(4, 0), gold, { label: 'Diamond' });

  switch (pageType) {
    case 'COVER': {
      const out = [ground(), rect(32, 32, W - 64, H - 64, 'none', { stroke: gold, strokeWidth: 1, label: 'Hairline frame' }), rect(42, 42, W - 84, H - 84, 'none', { stroke: alpha(gold, .5), strokeWidth: .75, label: 'Hairline frame, inner' })];
      out.push(...lens(367, 96, 290, 390, 'Cover portrait', { rx: 145, frame: gold, fw: 1.5 }));
      out.push(smallcaps(0, 66, W, 'Vows & Light', gold, 'center', 12));
      out.push(text(0, 510, W, 'Amara & Daniel', { size: 70, font: 'cormorant', weight: 500, italic: true, color: plum, align: 'center', wrap: false, label: 'Names', role: 'HEADLINE' }));
      out.push(hair(432, 612, 160), diamond(512, 612), smallcaps(0, 636, W, '12 · 06 · 2026  —  Lisbon', plum, 'center', 12), cap(0, 676, W, 'The ceremony, the light, and everything in between.', { align: 'center', size: 16, color: alpha(plum, .75) }));
      return out;
    }
    case 'FULL BLEED': {
      if (pageIndex === 1) {
        // Full page, a hairline inset frame and one centred italic line over a soft foot.
        const out = [ground(plum), ...shot(0, 0, W, H, 'Full-bleed photograph · the aisle, light through the doors', { tone: 'dark', shade: alpha(rose, .3), ink: alpha('#FFFFFF', .6) })];
        out.push(rect(0, 520, W, 248, plum, { gradient: lin(90, [0, plum, 0], [1, plum, .72]), label: 'Foot shade' }), rect(36, 36, W - 72, H - 72, 'none', { stroke: alpha('#FFFFFF', .7), strokeWidth: .9, label: 'Inset hairline' }));
        out.push(cap(0, 672, W, copy.caption(P, 3), { size: 22, align: 'center', color: '#FFFFFF' }), smallcaps(0, 712, W, 'The first dance · 8:15 p.m.', gold, 'center', 10), smallcaps(0, 66, W, 'Vows & Light', '#FFFFFF', 'center', 11), diamond(512, 100), hr(432, 100, 60, '#FFFFFF', .8, { label: 'Hairline' }), hr(532, 100, 60, '#FFFFFF', .8, { label: 'Hairline' }));
        return out;
      }
      // pageIndex 4 — half picture, half page; the date set large in the quiet half.
      const out = [ground(blush), ...shot(0, 0, 512, H, 'Photograph · the first look, from behind', { shade: alpha(rose, .2), ink: alpha(plum, .5) })];
      out.push(smallcaps(556, 130, 400, 'The day', gold, 'left', 12), text(556, 160, 420, '12.06\n2026', { size: 96, font: 'cormorant', weight: 300, color: plum, leading: .95, label: 'Date numerals', role: 'HEADLINE' }), hair(560, 380, 80));
      out.push(cap(556, 404, 380, 'The first look was supposed to take two minutes. It took twelve, and nobody was counting.', { size: 20 }));
      out.push(...lens(556, 520, 180, 130, 'Small photo', { frame: gold, fw: .9 }), cap(756, 600, 190, 'His hands, then hers.', { size: 14 }), folioObj());
      return out;
    }
    case 'PHOTO GRID': {
      if (pageIndex === 2) {
        // Paired portraits with a gold hairline between and a caption under each.
        const out = [ground(), smallcaps(0, 56, W, 'Portraits', gold, 'center', 11)];
        out.push(...lens(96, 100, 400, 530, 'Portrait · Amara'), ...lens(528, 100, 400, 530, 'Portrait · Daniel'), vr(512, 130, 470, gold, .9, { label: 'Gold divider' }), diamond(512, 365));
        out.push(cap(96, 650, 400, 'Amara, before the veil went on.', { align: 'center' }), cap(528, 650, 400, 'Daniel, rehearsing the first line.', { align: 'center' }), hair(472, 710, 80), folioObj());
        return out;
      }
      // pageIndex 6 — one tall centre portrait flanked by two small details.
      const out = [ground(blush)];
      out.push(...lens(352, 64, 320, 600, 'Tall portrait · the dance, in motion'), ...lens(96, 160, 220, 300, 'Detail · the ring', { frame: gold, fw: .9 }), ...lens(708, 300, 220, 300, 'Detail · the bouquet', { frame: gold, fw: .9 }));
      out.push(cap(96, 476, 220, 'The ring, on its cushion of petals.', { size: 14 }), cap(708, 616, 220, 'The bouquet, thrown wrong on purpose.', { size: 14 }), smallcaps(352, 690, 320, 'The first dance', gold, 'center', 11), hair(96, 130, 220), hair(708, 270, 220), folioObj());
      return out;
    }
    case 'CAPTIONED PHOTO': {
      const out = [ground(), ...lens(72, 96, 330, 440, 'Portrait · reading the vows', { frame: gold, fw: 1 })];
      out.push(smallcaps(470, 92, 470, 'Her vow', gold, 'left', 11), hair(472, 118, 60));
      out.push(text(470, 140, 470, 'I promise to be\nyour home when the\nroads run long, your\nlight when the lamps\nare low.', { size: 40, font: 'cormorant', weight: 400, italic: true, color: plum, leading: 1.18, label: 'Vow', role: 'HEADLINE' }));
      out.push(diamond(476, 448), cap(470, 478, 430, '— Amara, under the old olive tree, with a pocketful of folded paper she did not need.', { size: 17, color: alpha(plum, .8) }), cap(72, 556, 330, 'Page 3 of 9, the one she kept dry.', { size: 14, align: 'left' }), folioObj());
      return out;
    }
    case 'TIMELINE': {
      const out = [ground(), smallcaps(0, 56, W, 'The day, in hours', gold, 'center', 12), text(0, 84, W, 'From first light', { size: 40, font: 'cormorant', weight: 400, italic: true, color: plum, align: 'center', wrap: false, label: 'Timeline title', role: 'HEADLINE' })];
      out.push(vr(512, 160, 520, gold, .9, { label: 'Timeline spine' }));
      const hours: Array<[string, string]> = [['10:00', 'Getting ready'], ['13:30', 'The first look'], ['15:40', 'Ceremony'], ['17:15', 'Toasts'], ['19:00', 'First dance'], ['22:30', 'Last song']];
      hours.forEach(([t, v], i) => {
        const y = 176 + i * 86, left = i % 2 === 0;
        out.push(circle(512, y + 26, 5, ivory, { stroke: gold, strokeWidth: 1.5, label: 'Hour node' }));
        out.push(text(left ? 120 : 548, y + 6, 340, t, { size: 30, font: 'cormorant', weight: 500, color: plum, align: left ? 'right' : 'left', wrap: false, label: 'Time', role: 'DECK' }), cap(left ? 120 : 548, y + 42, 340, v, { align: left ? 'right' : 'left', size: 16, color: alpha(plum, .75) }));
        out.push(...lens(left ? 560 : 340 - 40, y + 4, 124, 70, `Photo · ${v}`, { silent: true, frame: gold, fw: .75 }));
      });
      out.push(folioObj());
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [ground(), rect(32, 32, W - 64, H - 64, 'none', { stroke: gold, strokeWidth: 1, label: 'Hairline frame' })];
      out.push(diamond(512, 150, 7), hair(432, 150, 60), hair(532, 150, 60));
      out.push(text(0, 210, W, 'With love, and light', { size: 56, font: 'cormorant', weight: 400, italic: true, color: plum, align: 'center', wrap: false, label: 'Closing line', role: 'HEADLINE' }));
      out.push(cap(262, 310, 500, 'To everyone who stood, danced and cried at the right moments: thank you for being in the photographs, and for being there when no one was taking any.', { size: 20, align: 'center', color: alpha(plum, .85) }));
      out.push(...lens(452, 470, 120, 150, 'Small closing portrait', { frame: gold, fw: .9 }), smallcaps(0, 650, W, 'Amara & Daniel · Lisbon · 2026', plum, 'center', 11), smallcaps(0, 676, W, 'Photographs by Elena Marsh · Plajah Photo Books', gold, 'center', 9));
      out.push(rect(838, 662, 112, 64, '#FFFFFF', { label: 'Barcode plate' }), ...barcode(848, 670, 92, 36, plum, seed));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PHOTO-YEARBOOK — The Year We Made
// ═════════════════════════════════════════════════════════════════════════════
const photoYearbook: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: cream, ink: navy, accent: red, secondary: teal, seed } = ctx;
  const gold = '#F2B84B', tints = [mix(red, .6), mix(teal, .6), mix(gold, .5), mix(navy, .75)];
  const ground = (c = cream) => rect(0, 0, W, H, c, { role: 'GROUND', label: 'Page ground' });
  const snap = (x: number, y: number, w: number, h: number, hint: string, i = 0, rot = 0, rx = 14) => shot(x, y, w, h, hint, { rx, rot, shade: tints[i % tints.length], ink: alpha(navy, .55), frame: navy, fw: 2.5, shadow: { x: 3, y: 4, blur: 0, color: alpha(navy, .22) } });
  /** A sticker-like label: rounded rect + outfit type, tilted. */
  const sticker = (x: number, y: number, v: string, fill: string, color = '#FFFFFF', rot = -3, size = 15): TelaVectorObject[] => {
    const w = Math.ceil(v.length * size * .62 + 28), h = size + 18;
    return [rect(x, y, w, h, fill, { rx: h / 2, rotation: rot, stroke: navy, strokeWidth: 2, shadow: { x: 2, y: 3, blur: 0, color: alpha(navy, .3) }, label: 'Sticker' }), text(x, y + (h - size * 1.2) / 2, w, v, { size, font: 'outfit', weight: 800, color, align: 'center', wrap: false, rotation: rot, label: 'Sticker text', role: 'LABEL' })];
  };
  const body = (x: number, y: number, w: number, v: string, size = 15, color = navy) => text(x, y, w, v, { size, font: 'outfit', weight: 500, color, leading: 1.5, label: 'Caption', role: 'CAPTION' });
  const folioObj = () => pageNo(ctx, navy, 'outfit', { size: 13, inset: 40, weight: 800 });

  switch (pageType) {
    case 'COVER': {
      const out = [ground(), ...orn.confetti(0, 0, W, H, 34, [red, teal, gold, navy], seed, 1)];
      out.push(...snap(520, 70, 200, 250, 'Photo 1', 0, 4), ...snap(750, 110, 220, 170, 'Photo 2', 1, -5), ...snap(560, 350, 230, 280, 'Photo 3', 2, -3), ...snap(810, 330, 170, 210, 'Photo 4', 3, 6), ...snap(800, 570, 180, 130, 'Photo 5', 0, -4));
      out.push(...sticker(64, 70, 'CLASS OF 2026', red, '#FFFFFF', -4, 16));
      const title = text(64, 140, 480, 'The\nYear\nWe Made', { size: 100, font: 'outfit', weight: 900, color: navy, leading: .94, label: 'Title', role: 'HEADLINE' });
      out.push(title, ...sticker(64, below(title, 36), 'Room 14 · Ms. Alvarez', teal, '#FFFFFF', 2, 16), body(64, below(title, 96), 400, copy.deck(P, 0), 15));
      out.push(text(64, 704, 400, '184 days · 41 field trips · 1 very loud assembly', { size: 12, font: 'outfit', weight: 800, color: red, tracking: .06, wrap: false, label: 'Stats line', role: 'LABEL' }));
      return out;
    }
    case 'FULL BLEED': {
      if (pageIndex === 1) {
        const out = [ground(navy), ...shot(0, 0, W, H, 'Full-bleed photograph · Spirit Week', { tone: 'dark', shade: alpha(red, .3), ink: alpha('#FFFFFF', .6) })];
        out.push(...sticker(56, 560, 'SPIRIT WEEK!', red, '#FFFFFF', -5, 34), ...sticker(70, 646, 'everyone came in blue', teal, '#FFFFFF', 2, 18), ...sticker(790, 60, 'p. 02', gold, navy, 4, 15));
        out.push(folioObj());
        return out;
      }
      // pageIndex 4 — photo on the left, a column of number stickers on the right.
      const out = [ground(), ...snap(48, 48, 590, 672, 'Photograph · the championship game, last second', 1, 0, 20)];
      out.push(...sticker(676, 70, 'THE GAME', red, '#FFFFFF', 3, 18));
      [['24', 'games won'], ['3,208', 'laps run'], ['1', 'last second']].forEach(([n, l], i) => {
        const y = 150 + i * 160;
        out.push(rect(676, y, 300, 130, tints[i], { rx: 20, stroke: navy, strokeWidth: 2.5, shadow: { x: 4, y: 5, blur: 0, color: alpha(navy, .25) }, label: 'Stat card' }), text(692, y + 12, 268, n, { size: 62, font: 'outfit', weight: 900, color: navy, wrap: false, label: 'Stat number', role: 'HEADLINE' }), text(694, y + 92, 268, l, { size: 16, font: 'outfit', weight: 700, color: navy, wrap: false, label: 'Stat label', role: 'LABEL' }));
      });
      out.push(body(676, 650, 300, 'Final score: 61–60. We still can’t explain it.', 14), folioObj());
      return out;
    }
    case 'PHOTO GRID': {
      if (pageIndex === 2) {
        // Nine squares, three stickers.
        const out = [ground(), text(48, 36, 700, 'Faces of Room 14', { size: 40, font: 'outfit', weight: 900, color: navy, wrap: false, label: 'Grid title', role: 'HEADLINE' })];
        const cw = 288, ch = 192, gx = 16, gy = 16;
        for (let i = 0; i < 9; i++) { const c = i % 3, rr = Math.floor(i / 3); out.push(...snap(48 + c * (cw + gx), 100 + rr * (ch + gy), cw, ch, `Photo ${i + 1}`, i, 0, 14)); }
        out.push(...sticker(84, 332, 'Most likely to nap', red, '#FFFFFF', -4, 14), ...sticker(500, 214, 'Lunch champion', teal, '#FFFFFF', 3, 14), ...sticker(300, 548, 'Best laugh', gold, navy, -3, 14));
        out.push(...sticker(780, 44, 'Room 14', navy, '#FFFFFF', 3, 14), folioObj());
        return out;
      }
      // pageIndex 6 — six, in a 3×2, with the big one wide.
      const out = [ground(tints[1]), text(48, 36, 700, 'Field Day', { size: 56, font: 'outfit', weight: 900, color: navy, wrap: false, label: 'Grid title', role: 'HEADLINE' })];
      out.push(...snap(48, 120, 592, 330, 'Wide photo · the tug-of-war', 0, 0, 20), ...snap(660, 120, 316, 330, 'Photo · three-legged race', 2, 0, 20));
      [0, 1, 2].forEach(i => out.push(...snap(48 + i * 328, 480, 304, 220, `Photo · event ${i + 1}`, i + 1, 0, 20)));
      out.push(...sticker(70, 100, 'TUG-OF-WAR', red, '#FFFFFF', -4, 16), ...sticker(690, 100, 'Clumsy but proud', navy, '#FFFFFF', 3, 14), ...sticker(750, 676, '9/10 would sweat again', gold, navy, -2, 14), folioObj());
      return out;
    }
    case 'CAPTIONED PHOTO': {
      const out = [ground(), ...orn.confetti(0, 0, W, H, 20, [red, teal, gold], seed + 3, .9)];
      out.push(...snap(380, 70, 440, 540, 'Polaroid · the class on the bus, window seats', 0, 3.5, 12));
      out.push(...sticker(70, 90, 'BEST MOMENT', red, '#FFFFFF', -4, 22));
      const t = text(70, 160, 270, 'The bus broke down.\nNobody minded.', { size: 38, font: 'outfit', weight: 900, color: navy, leading: 1.08, label: 'Photo title', role: 'HEADLINE' });
      out.push(t, body(70, below(t, 18), 270, 'Forty minutes on the side of the highway, one guitar, and the whole of Room 14 learning every verse of a song nobody has ever admitted to knowing.', 16));
      out.push(...sticker(70, 520, '#1 field trip', teal, '#FFFFFF', 3, 16), body(70, 590, 270, 'Photo: Maya R. — taken through a window, which is why it is perfect.', 13, alpha(navy, .8)), folioObj());
      return out;
    }
    case 'TIMELINE': {
      const out = [ground(), text(48, 36, 700, 'Ten months, six moments', { size: 44, font: 'outfit', weight: 900, color: navy, wrap: false, label: 'Timeline title', role: 'HEADLINE' })];
      const months = ['SEP', 'OCT', 'DEC', 'FEB', 'APR', 'JUN'], notes = ['First day: 31 new faces', 'The haunted hallway', 'Winter concert, row C', 'Science fair, volcano 3', 'Spring trip to the coast', 'Last bell, 2:55 p.m.'];
          months.forEach((m, i) => {
        const c = i % 3, rr = Math.floor(i / 3), x = 48 + c * 316, y = 150 + rr * 290;
        out.push(rect(x, y, 296, 250, tints[i % tints.length], { rx: 22, stroke: navy, strokeWidth: 2.5, shadow: { x: 4, y: 5, blur: 0, color: alpha(navy, .25) }, label: 'Milestone card' }));
        out.push(circle(x + 36, y + 36, 24, navy, { label: 'Number disc' }), text(x + 12, y + 22, 48, String(i + 1).padStart(2, '0'), { size: 20, font: 'outfit', weight: 900, color: '#FFFFFF', align: 'center', wrap: false, label: 'Milestone number', role: 'LABEL' }));
        out.push(text(x + 76, y + 24, 200, m, { size: 26, font: 'outfit', weight: 900, color: navy, tracking: .08, wrap: false, label: 'Month', role: 'DECK' }));
        out.push(...shot(x + 16, y + 74, 264, 114, `Photo · ${notes[i]}`, { rx: 12, shade: alpha('#FFFFFF', .5), ink: alpha(navy, .5) }), body(x + 16, y + 200, 264, notes[i], 14));
      });
      out.push(folioObj());
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [ground(navy), ...orn.confetti(0, 0, W, H, 16, [red, teal, gold, cream], seed + 9, 1)];
      out.push(text(64, 70, 600, 'Sign here!', { size: 82, font: 'outfit', weight: 900, color: cream, wrap: false, rotation: -2, label: 'Signature title', role: 'HEADLINE' }));
      out.push(...sticker(70, 190, 'Write something nice', red, '#FFFFFF', 2, 18), ...sticker(430, 196, 'Draw a doodle', teal, '#FFFFFF', -3, 18));
      for (let i = 0; i < 5; i++) out.push(hr(64, 312 + i * 62, 560, alpha(cream, .5), 2, { dash: [2, 8], label: 'Signature line' }));
      out.push(text(680, 190, 280, 'The Year We Made', { size: 28, font: 'outfit', weight: 900, color: cream, leading: 1.1, label: 'Title, small', role: 'DECK' }), text(680, 262, 270, 'Room 14 · Ms. Alvarez\nGreenwood Elementary\n2025 – 2026', { size: 15, font: 'outfit', weight: 600, color: alpha(cream, .85), leading: 1.55, label: 'Colophon', role: 'BODY' }));
      out.push(...shot(680, 400, 270, 200, 'Closing photograph · everyone, jumping', { tone: 'dark', rx: 18, shade: alpha(cream, .12), frame: cream, fw: 3, rot: 2 }), rect(838, 662, 112, 64, cream, { rx: 6, label: 'Barcode plate' }), ...barcode(848, 670, 92, 36, navy, seed));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PHOTO-MINIMAL — Quiet Frames
// ═════════════════════════════════════════════════════════════════════════════
const photoMinimal: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: bone, ink: black, accent: stone, secondary: graphite, seed } = ctx;
  const ground = (c = bone) => rect(0, 0, W, H, c, { role: 'GROUND', label: 'Page field' });
  const frame = (x: number, y: number, w: number, h: number, hint: string, dark = false) => shot(x, y, w, h, hint, { tone: dark ? 'dark' : 'light', shade: dark ? '#2A2A2A' : '#E1E0DB', ink: dark ? alpha('#FFFFFF', .5) : alpha(black, .4) });
  const cap = (x: number, y: number, w: number, v: string, o: { align?: 'left' | 'right' | 'center'; color?: string; size?: number } = {}) => text(x, y, w, v, { size: o.size ?? 10.5, font: 'manrope', weight: 300, color: o.color || graphite, tracking: .06, leading: 1.6, align: o.align, label: 'Caption', role: 'CAPTION' });
  const marks = (x: number, y: number, w: number, h: number, dark = false) => cropMarks(x, y, w, h, 9, dark ? alpha('#FFFFFF', .5) : alpha(black, .5), 6);
  const folioObj = (dark = false) => pageNo(ctx, dark ? alpha('#FFFFFF', .5) : stone, 'manrope', { size: 9, inset: 44, weight: 300 });

  switch (pageType) {
    case 'COVER': {
      const out = [ground(), ...frame(432, 180, 160, 220, 'Cover photograph'), ...marks(432, 180, 160, 220)];
      out.push(text(0, 456, W, 'Quiet Frames', { size: 34, font: 'manrope', weight: 200, color: black, tracking: .3, align: 'center', transform: 'uppercase', wrap: false, label: 'Title', role: 'HEADLINE' }));
      out.push(cap(0, 510, W, 'Photographs, 2019 — 2025', { align: 'center', color: stone }), hr(482, 552, 60, stone, .75, { label: 'Hairline' }), cap(0, 690, W, 'Plajah Photo Books · Edition of 300', { align: 'center', color: stone, size: 9 }));
      return out;
    }
    case 'FULL BLEED': {
      if (pageIndex === 1) {
        const out = [ground(), ...frame(332, 224, 360, 270, 'Photograph · the empty chair, 6 a.m.'), ...marks(332, 224, 360, 270)];
        out.push(cap(332, 516, 360, 'Empty chair, 6 a.m.', { color: black }), cap(332, 534, 360, 'Lisbon, 2021 · gelatin silver', { color: stone, size: 9.5 }), text(332, 120, 360, '01', { size: 10, font: 'manrope', weight: 300, color: stone, tracking: .3, wrap: false, label: 'Plate number', role: 'LABEL' }), folioObj());
        return out;
      }
      // pageIndex 4 — the field turns dark; the picture is small and lit.
      const out = [ground(black), ...frame(302, 234, 420, 300, 'Photograph · pale light through a closed door', true), ...marks(302, 234, 420, 300, true)];
      out.push(cap(302, 556, 420, 'Pale light through a closed door', { color: '#EDEDEA' }), cap(302, 574, 420, 'Reykjavík, 2023', { color: alpha('#FFFFFF', .5), size: 9.5 }), text(302, 140, 100, '04', { size: 10, font: 'manrope', weight: 300, color: alpha('#FFFFFF', .5), tracking: .3, wrap: false, label: 'Plate number', role: 'LABEL' }), folioObj(true));
      return out;
    }
    case 'PHOTO GRID': {
      if (pageIndex === 2) {
        // Two small frames set on a diagonal — the page is the white between them.
        const out = [ground(), ...frame(168, 150, 230, 300, 'Photograph · upper left'), ...frame(630, 360, 230, 300, 'Photograph · lower right'), ...marks(168, 150, 230, 300), ...marks(630, 360, 230, 300)];
        out.push(cap(168, 470, 230, 'Steam, Hakone', { color: black }), cap(630, 680, 230, 'Steam, Hakone — later', { color: black }), hr(412, 300, 190, stone, .5, { label: 'Hairline' }), folioObj());
        return out;
      }
      // pageIndex 6 — three small frames on one baseline.
      const out = [ground()];
      const specs: Array<[number, number, number]> = [[120, 190, 250], [400, 150, 290], [660, 240, 200]];
      specs.forEach(([x, w, h], i) => out.push(...frame(x + (i === 2 ? 40 : 0), 540 - h, w, h, `Photograph · ${i + 1}`), ...marks(x + (i === 2 ? 40 : 0), 540 - h, w, h), cap(x + (i === 2 ? 40 : 0), 560, w, ['Stone wall', 'Winter hedge', 'Single door'][i], { color: black })));
      out.push(text(120, 120, 300, '06 — 08', { size: 10, font: 'manrope', weight: 300, color: stone, tracking: .3, wrap: false, label: 'Plate range', role: 'LABEL' }), folioObj());
      return out;
    }
    case 'CAPTIONED PHOTO': {
      const out = [ground(), ...frame(260, 130, 300, 400, 'Photograph · a coat on a hook'), ...marks(260, 130, 300, 400)];
      out.push(text(620, 130, 200, '03', { size: 10, font: 'manrope', weight: 300, color: stone, tracking: .3, wrap: false, label: 'Plate number', role: 'LABEL' }), cap(620, 156, 190, 'A coat on a hook', { color: black, size: 13 }));
      out.push(cap(620, 190, 190, copy.caption(P, 2), { size: 10.5 }), hr(620, 290, 40, stone, .75, { label: 'Hairline' }), cap(620, 304, 190, 'Gelatin silver print\n24 × 30 cm\nEdition of 12', { color: stone, size: 9.5 }), folioObj());
      return out;
    }
    case 'TIMELINE': {
      const out = [ground(), hr(120, 384, W - 240, black, .5, { label: 'Sequence line' })];
      for (let i = 0; i < 5; i++) {
        const x = 168 + i * 172;
        out.push(vr(x + 30, 372, 24, black, .5, { label: 'Tick' }), ...frame(x, 296, 60, 72, `Frame ${i + 1}`, false).slice(0, 1), cap(x - 10, 410, 80, ['2019', '2020', '2021', '2022', '2023'][i], { align: 'center', color: stone, size: 9.5 }), cap(x - 20, 428, 100, ['Spring', 'Fog', 'Chair', 'Heat', 'Door'][i], { align: 'center', color: black, size: 10 }));
      }
      out.push(text(120, 150, 400, 'Sequence', { size: 10, font: 'manrope', weight: 300, color: stone, tracking: .3, transform: 'uppercase', wrap: false, label: 'Section label', role: 'LABEL' }), cap(120, 172, 420, 'Five frames, one a year, in the order they were made.', { size: 12, color: black }), folioObj());
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [ground(), ...marks(472, 280, 80, 100)];
      out.push(...frame(472, 280, 80, 100, 'Closing frame', false).slice(0, 1));
      out.push(cap(0, 420, W, 'Quiet Frames', { align: 'center', color: black, size: 13 }), cap(312, 448, 400, 'Printed on uncoated paper in a single black. Photographs by Idris Mbeki. Set in Manrope.', { align: 'center', color: stone }), hr(492, 520, 40, stone, .75, { label: 'Hairline' }), cap(0, 536, W, 'Plajah Photo Books · 2026', { align: 'center', color: stone, size: 9 }));
      out.push(rect(446, 640, 132, 56, '#FFFFFF', { label: 'Barcode plate' }), ...barcode(458, 648, 108, 32, black, seed));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// Registry
// ═════════════════════════════════════════════════════════════════════════════
export const DESIGNS: Record<string, PublicationDesigner> = {
  'photo-family': photoFamily,
  'photo-travel': photoTravel,
  'photo-portfolio': photoPortfolio,
  'photo-wedding': photoWedding,
  'photo-yearbook': photoYearbook,
  'photo-minimal': photoMinimal,
};

export const LESSONS: Record<string, DesignLesson> = {
  'photo-family': {
    principle: 'A family album is a sequence of unequal moments: one big photograph for the day that mattered, two small ones for what came after, and a dated caption so that in fifty years a stranger knows who is in the picture.',
    history: 'Family photograph albums became common in the late nineteenth century, when cheap cartes de visite and then Kodak’s box cameras put photography into households. Mounting prints with corner tabs and handwriting captions on the page was a domestic craft before it became a design style, and the white-bordered snapshot defined the look of the album for generations.',
    tryThis: 'Write the date and one name on the back of three real prints today. Then add the same caption to the template; future readers will thank you.',
    interestTag: 'Photo books',
    related: ['Photo albums', 'Family history', 'Captions'],
  },
  'photo-travel': {
    principle: 'A travel book is a sequence in space: a panorama to establish the land, a run of tall strips for the detail, and a map or elevation line that makes the reader feel how far they came. Captions work best as field notes, with a place and a coordinate.',
    history: 'Travel photography grew with railways and magazines such as National Geographic, which from the early twentieth century paired wide landscapes with exact captions. Road-trip books, from Robert Frank’s The Americans (1958) to Stephen Shore’s Uncommon Places, taught photographers to sequence pictures like a journey rather than a collection.',
    tryThis: 'Re-sequence three of your own travel photographs from the order you took them into the order that tells the best story. Notice which one now opens the page.',
    interestTag: 'Photo books',
    related: ['Travel photography', 'Panorama', 'Sequencing'],
  },
  'photo-portfolio': {
    principle: 'Let the picture hang on the wall: one image per page, a wide field of white, tiny plate numbers and a single red mark for the author. The restraint is the design; every extra element competes with the work.',
    history: 'The photographer’s monograph followed the gallery: the plate-by-plate sequences of Alfred Stieglitz’s Camera Work (1903–17) established the idea of a photograph as a single, titled artwork, and the Swiss-influenced modernist books of the 1950s and 60s refined the white page and small sans-serif captions that still define portfolios.',
    tryThis: 'Print your favourite photograph at half the size you normally would and centre it. The extra white often makes the picture feel larger.',
    interestTag: 'Photo books',
    related: ['Photography portfolios', 'Monographs', 'White space'],
  },
  'photo-wedding': {
    principle: 'Weddings are remembered as a feeling, not a schedule: pair portraits so each person has equal weight, set the vow large in italic, and let hairline gold and a lot of ivory carry the ceremony’s calm.',
    history: 'The formal wedding album emerged in the Victorian era and, after Kodak, became a standard family keepsake. The softly lit, light-filled look of contemporary wedding books comes from fine-art photography and from the elegant high-contrast serifs of fashion magazines such as Harper’s Bazaar under Alexey Brodovitch.',
    tryThis: 'Choose the one sentence from the ceremony you most want to remember and set it at twice the size of the other text. Notice how everything else steps back.',
    interestTag: 'Photo books',
    related: ['Wedding photography', 'Serif typography', 'Italic'],
  },
  'photo-yearbook': {
    principle: 'A yearbook is a crowd: a loose grid of many faces, loud stickers for the jokes, and a milestone timeline with big numbers so every student can find their own month. Fun is not the opposite of order; a strict grid lets the sticker be a surprise.',
    history: 'School yearbooks began in the nineteenth century in the United States as class records and became a mass tradition in the 1920s, as school photographers and offset printing made affordable portrait grids possible. The sticker-and-superlative style is borrowed from 1980s and 90s teen magazines and from scrapbooks.',
    tryThis: 'Give each photograph in your own grid a two-word label, such as “Best laugh”. Notice how the page becomes funnier without any extra photographs.',
    interestTag: 'Photo books',
    related: ['Yearbooks', 'Scrapbooks', 'Grid design'],
  },
  'photo-minimal': {
    principle: 'Smallness is a form of respect: a tiny photograph on a huge field forces the viewer to lean in, and a crop mark and a single caption line say all that needs saying. If the page looks empty, you have done it right.',
    history: 'Minimalist photo books came from the same tradition as gallery presentation: the museum wall label and the mat board. Japanese photobooks of the 1960s and 70s and the sparse Dutch photobooks of recent decades helped make white pages, small plates and understated captions a language of their own.',
    tryThis: 'Take a photograph you love, print it at half the width you planned and place it off-centre. See which feels quieter: the empty field or the picture.',
    interestTag: 'Photo books',
    related: ['Minimalism', 'Fine-art photography', 'Photobooks'],
  },
};
