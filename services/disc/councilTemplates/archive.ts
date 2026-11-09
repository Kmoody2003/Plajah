// Archive — the documentary.
// Animation lead: The Structural Filmmaker (24 fps on ones, linear — the single frame is the material).
// Crew: Silhouette & Cutout (paper that moves on twos), Shoujo Romanticist (the held still).
// Graphic designer: The Collage Zinester — typewriter labels, redaction, rubber stamps, found paper.
// Lighting director: a desk-lamp pool from the top-left, paper warmth, a hard shadow under every tab,
// dust turning in the beam.
// Structure: an open case file on a desk. Manila folder tabs run along the TOP edge and are the main
// navigation; the selected tab rises out of the drawer and its folder opens — an index card slides
// out under it saying what is inside. Scenes are evidence photos pinned to index cards, setup is a
// card-catalogue drawer, and the pop-up is a row of file tabs hanging from the top of the picture.
import { button, glow, hms, linear, mins, txt, T, W, H, type Ctx, type Design, type Item, type O, type State } from './kit';
import { specks } from '../../tela/ornaments';

const DESK = '#2A1D15', GRAIN = '#3A2A1F', MANILA = '#E2C489', MANILA_BACK = '#B8975E', MANILA_EDGE = '#9A7A45';
const CARD = '#F4EEDD', CARD_DIM = '#D9CFB6', LABEL = '#F8F4EA', LABEL_DIM = '#E6DDC8';
const INK = '#221E1A', INK_DIM = '#5C5249', REDACT = '#141210', STAMP = '#B3322A', BLUE = '#93B4D6', HILITE = '#F4DA4C', SHADOW = '#000000';
const TYPE = 'specialElite', STAMPF = 'staatliches', HAND = 'permanentMarker';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '.' : s);
const typeW = (s: string, size: number) => s.length * size * 0.6;
/** A region minus a rectangular hole, as four rects (for photo windows over chapter stills). */
function mat(w: number, h: number, hx: number, hy: number, hw: number, hh: number, fill: string, ox = 0, oy = 0): O[] {
  return [
    T.rect(ox, oy, w, hy, fill), T.rect(ox, oy + hy + hh, w, h - hy - hh, fill),
    T.rect(ox, oy + hy, hx, hh, fill), T.rect(ox + hx + hw, oy + hy, w - hx - hw, hh, fill),
  ];
}
const TAB_D = 'M0 100 L5 16 Q7 0 20 0 L80 0 Q93 0 95 16 L100 100 Z';
const TAB_DOWN = 'M0 0 L100 0 L95 84 Q93 100 80 100 L20 100 Q7 100 5 84 Z';
const CLIP_D = 'M30 100 L30 18 Q30 4 50 4 Q70 4 70 18 L70 84 Q70 94 58 94 Q46 94 46 84 L46 26';

function contents(ctx: Ctx, it: Item): string {
  const a = it.action, m = ctx.main;
  if (a.kind === 'PLAY_TITLE') { const t = ctx.disc.titles.find(x => x.id === a.titleId); return t ? `RUNS ${hms(t.source.durationSec)}` : ''; }
  if (a.kind === 'PLAY_ALL') return `${a.titleIds.length} REELS`;
  if (/scene|setlist/i.test(it.label)) return `${m?.chapters.length ?? 0} EXHIBITS`;
  if (/setup/i.test(it.label)) return `${(m?.audio.length ?? 0) + (m?.subtitles.length ?? 0)} RECORDINGS`;
  if (/extra/i.test(it.label)) return `${ctx.disc.titles.filter(t => t.kind === 'EXTRA' || t.kind === 'TRAILER').length} ENCLOSURES`;
  if (/episode/i.test(it.label)) return `${ctx.disc.titles.filter(t => t.kind === 'EPISODE').length} FILES`;
  return '';
}

/** Desk ground: faint grain (the ground colour itself is the background so dust shows through). */
function desk(): O[] {
  const out: O[] = [];
  for (let i = 0; i < 18; i++) out.push(T.rect(0, 30 + i * 61 + (i % 3) * 7, W, 2 + (i % 2), GRAIN, { opacity: 0.55, label: 'Grain' }));
  return out;
}
/** Lamp pool from the top-left + falloff. Drawn over the paper, under the buttons. */
function lamp(): O[] {
  return [
    glow(300, 60, 1100, 820, '#FFD9A0', 0.2, 'Lamp pool'),
    T.rect(0, 0, W, H, '#000', { gradient: linear(45, [['#000', 0, 0], ['#000', 0.55, 0.06], ['#000', 1, 0.5]]), label: 'Lamp falloff' }),
  ];
}
/** A typed label strip. */
const labelStrip = (x: number, y: number, w: number, h: number, s: string, size: number, fill = LABEL, ink = INK, align: 'left' | 'center' = 'left') => [
  T.rect(x, y, w, h, fill, { label: 'Label strip' }),
  txt(x + (align === 'left' ? 16 : 0), y + (h - size * 1.2) / 2, w - (align === 'left' ? 24 : 0), s, size, TYPE, ink, { align }),
];
/** Index card ruling (red head line, blue lines). */
function ruling(x: number, y: number, w: number, h: number, head: number, step = 34): O[] {
  const out: O[] = [T.rect(x, y + head, w, 2, STAMP, { opacity: 0.7, label: 'Head line' })];
  for (let ly = y + head + step; ly < y + h - 6; ly += step) out.push(T.rect(x, ly, w, 2, BLUE, { opacity: 0.55, label: 'Rule' }));
  return out;
}
const stamp = (x: number, y: number, s: string, size: number, rot: number, color = STAMP, opacity = 0.75): O[] => {
  const w = typeW(s, size) * 0.82 + 40, h = size * 1.35;
  return [
    T.rect(x, y, w, h, 'none', { stroke: color, strokeWidth: 5, rotation: rot, opacity, rx: 6, label: 'Stamp box' }),
    txt(x, y + (h - size * 1.2) / 2 + 2, w, s, size, STAMPF, color, { align: 'center', rotation: rot, opacity, tracking: 0.08 }),
  ];
};

/** A small manila tab used for nav/back buttons on sub pages. */
function navTab(it: Item, w: number, h: number, s: State, text: string): O[] {
  const on = s !== 'normal', rise = on ? 0 : 14;
  return [
    T.path(on ? 8 : 4, rise + 8, w - 8, h - rise - 8, TAB_D, SHADOW, { opacity: 0.35, label: 'Tab shadow' }),
    T.path(0, rise, w - 8, h - rise, TAB_D, on ? MANILA : MANILA_BACK, { label: 'Tab' }),
    ...labelStrip(18, rise + 16, w - 44, 46, text, on ? 30 : 28, s === 'activated' ? STAMP : on ? LABEL : LABEL_DIM, s === 'activated' ? LABEL : on ? INK : INK_DIM, 'center'),
  ];
}

const FX0 = 300, FX1 = 1770, FY = 196, FY1 = 1000;

export const archive: Design = {
  id: 'documentary',
  background: () => ({ kind: 'color', value: DESK }),
  subBackground: () => ({ kind: 'color', value: DESK }),

  main(ctx, items) {
    const m = ctx.main, n = items.length;
    const art: O[] = [...desk(),
      // Pencil + loupe on the lit desk to the left of the file.
      T.rect(150, 560, 26, 300, '#E4B33A', { rotation: -8, label: 'Pencil' }), T.rect(150, 546, 26, 22, '#E7A9A0', { rotation: -8 }),
      T.circle(186, 330, 62, 'none', { stroke: '#1B1410', strokeWidth: 12, label: 'Loupe' }), T.circle(186, 330, 50, '#FFF6DE', { opacity: 0.12 }),
      // The folder: hard shadow, body, crease.
      T.rect(FX0 + 18, FY + 20, FX1 - FX0, FY1 - FY, SHADOW, { opacity: 0.45, label: 'Folder shadow' }),
      T.rect(FX0, FY, FX1 - FX0, FY1 - FY, MANILA, { label: 'Open folder' }),
      T.rect(FX0, FY1 - 10, FX1 - FX0, 10, MANILA_EDGE, { label: 'Folder edge' }),
      T.rect(1030, FY + 12, 3, FY1 - FY - 24, MANILA_EDGE, { opacity: 0.6, label: 'Crease' }),
    ];
    // Left page: the case sheet with the title on a typed label.
    const title = ctx.title.toUpperCase();
    const tSize = Math.min(64, Math.floor(600 / Math.max(1, title.length * 0.62)));
    art.push(T.rect(352, 452, 640, 520, CARD, { label: 'Case sheet' }));
    art.push(txt(376, 470, 600, 'CASE FILE  No. ' + (ctx.uhd ? 'UHD' : 'BD') + '-' + String(m?.chapters.length ?? 0).padStart(2, '0') + '-' + String(Math.round((m?.source.durationSec ?? 0) / 60)).padStart(3, '0'), 24, TYPE, INK_DIM));
    art.push(...labelStrip(376, 510, 592, tSize * 1.5, title, tSize, LABEL, INK));
    const ly = 510 + tSize * 1.5 + 26;
    const lines: Array<[string, string | null]> = [
      ['SUBJECT', ctx.title.toUpperCase()], ['RUNTIME', m ? hms(m.source.durationSec) : '--'], ['CHAPTERS', String(m?.chapters.length ?? 0)],
      ['SOURCE', null], ['WITNESS', null],
    ];
    lines.forEach(([k, v], i) => {
      const y = ly + i * 48;
      art.push(txt(376, y, 180, k + ':', 28, TYPE, INK));
      if (v == null) art.push(T.rect(560, y + 6, 240 + (i * 97) % 160, 30, REDACT, { label: 'Redaction' }));
      else art.push(txt(560, y, 410, clip(v, 23), 28, TYPE, INK));
    });
    art.push(...stamp(560, 884, 'DECLASSIFIED', 50, -6));
    // Right page: index card with the paperclip, a contact strip of redactions, a coffee ring.
    art.push(T.rect(1090, 470, 600, 360, CARD, { label: 'Index card' }), ...ruling(1090, 470, 600, 360, 64));
    art.push(txt(1114, 486, 560, 'FILED UNDER', 28, TYPE, STAMP));
    art.push(txt(1114, 548, 560, 'DOCUMENTARY  /  ' + (ctx.uhd ? '4K MASTER' : 'HD MASTER'), 28, TYPE, INK));
    art.push(txt(1114, 582, 560, 'ORIGINAL ELEMENTS ON FILE', 28, TYPE, INK));
    art.push(T.rect(1114, 624, 330, 26, REDACT), T.rect(1460, 624, 120, 26, REDACT));
    art.push(txt(1114, 650, 560, 'RESTORED ' + new Date(ctx.disc.createdAt).getFullYear(), 28, TYPE, INK));
    art.push(T.rect(1114, 692, 220, 26, REDACT), T.rect(1350, 692, 280, 26, REDACT));
    art.push(txt(1114, 760, 560, 'HANDLE WITH CARE', 34, HAND, STAMP, { rotation: -3 }));
    art.push(T.path(1600, 440, 50, 120, CLIP_D, 'none', { stroke: '#8E959C', strokeWidth: 6, open: true, label: 'Paperclip' }));
    art.push(T.circle(1590, 900, 66, 'none', { stroke: '#6B4A2A', strokeWidth: 7, opacity: 0.3, label: 'Coffee ring' }));
    art.push(txt(1114, 880, 420, 'DRAWER  ' + (ctx.disc.region || 'A') + '  ·  ' + n + ' FOLDERS', 24, TYPE, INK_DIM));
    // A strip of negatives tucked into the top of the right page.
    const strip: O[] = [T.rect(1090, 262, 600, 120, '#1A1714', { label: 'Negative strip' })];
    for (let i = 0; i < 15; i++) strip.push(T.rect(1100 + i * 40, 270, 22, 14, '#B79A6A', { rx: 3 }), T.rect(1100 + i * 40, 360, 22, 14, '#B79A6A', { rx: 3 }));
    for (let i = 0; i < 4; i++) strip.push(T.rect(1102 + i * 148, 292, 136, 60, '#4A3A2C', { label: 'Frame' }), T.rect(1102 + i * 148 + 12, 300, 112, 44, '#6E5A44', { opacity: 0.6 }));
    art.push(...strip.map(o => ({ ...o, rotation: 0 })));
    art.push(txt(1100, 392, 560, 'NEG. 1-4  ·  CONTACT ON REQUEST', 24, TYPE, INK_DIM));
    art.push(...lamp());

    // Tabs along the top edge. Each button = the tab + the column of folder under it, where the
    // selected folder's index card slides out.
    const gap = 26, tw = Math.min(310, Math.floor((FX1 - FX0 - 60 - gap * (n - 1)) / n));
    const buttons = items.map((it, i) => {
      const bx = FX0 + 30 + i * (tw + gap), BH = 380;
      return button(it, bx, 56, tw, BH, s => {
        const on = s !== 'normal', act = s === 'activated';
        const top = on ? 0 : 40, th = 140 - top + (on ? 12 : 0);
        const out: O[] = [
          T.path(on ? 12 : 8, top + 8, tw - 12, th - 8, TAB_D, SHADOW, { opacity: on ? 0.5 : 0.35, label: 'Hard tab shadow' }),
          T.path(0, top, tw - 4, th, TAB_D, on ? MANILA : MANILA_BACK, { label: 'Folder tab' }),
        ];
        const size = Math.min(on ? 34 : 30, Math.floor((tw - 60) / Math.max(1, it.label.length * 0.62)));
        out.push(...labelStrip(20, top + 22, tw - 44, 56, it.label.toUpperCase(), size, act ? STAMP : on ? LABEL : LABEL_DIM, act ? LABEL : on ? INK : INK_DIM, 'center'));
        if (on) {
          out.push(txt(20, top + 88, tw - 44, `FILE ${String(i + 1).padStart(2, '0')}`, 24, TYPE, INK_DIM, { align: 'center', tracking: 0.1 }));
          // The folder opens: its index card slides out below the tab.
          const cy = 172, ch = 196, cw = tw - 28;
          out.push(T.rect(22, cy + 10, cw, ch, SHADOW, { opacity: 0.35, label: 'Card shadow' }));
          out.push(T.rect(14, cy, cw, ch, CARD, { label: 'Index card' }), ...ruling(14, cy, cw, ch, 50));
          out.push(txt(30, cy + 10, cw - 32, act ? 'OPENING...' : 'CONTENTS', 24, TYPE, STAMP, { tracking: 0.1 }));
          out.push(T.rect(28, cy + 64, Math.min(cw - 30, typeW(contents(ctx, it), 28) + 12), 34, HILITE, { opacity: 0.85, label: 'Highlighter' }));
          out.push(txt(34, cy + 64, cw - 36, clip(contents(ctx, it), Math.floor((cw - 40) / 16.8)), 28, TYPE, INK));
          out.push(txt(30, cy + 124, cw - 40, it.role === 'primary' ? 'PRESS OK TO RUN' : 'PRESS OK TO OPEN', 24, TYPE, INK_DIM));
        }
        return out;
      });
    });
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    const art: O[] = [...desk(),
      ...labelStrip(144, 70, 620, 64, 'EVIDENCE  ·  SCENE INDEX', 36, LABEL, INK),
      txt(1776 - 520, 78, 520, `SHEET ${page + 1} OF ${pages}`, 40, HAND, LABEL_DIM, { align: 'right', rotation: -2 }),
    ];
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    const CW = 512, CH = 288, GX = 48, GY = 60, x0 = (W - (3 * CW + 2 * GX)) / 2, y0 = 176;
    // Photo window inside each card (the chapter still shows through).
    const WX = 24, WY = 52, WW = CW - 48, WH = 170;
    const buttons = chapters.map((it, i) => {
      const x = x0 + (i % 3) * (CW + GX), y = y0 + Math.floor(i / 3) * (CH + GY);
      art.push(T.rect(x + 14, y + 16, CW, CH, SHADOW, { opacity: 0.45, label: 'Card shadow' }));
      return button(it, x, y, CW, CH, s => {
        const on = s !== 'normal', act = s === 'activated';
        const card = on ? CARD : CARD_DIM;
        const out: O[] = [
          ...mat(CW, CH, WX - 8, WY - 8, WW + 16, WH + 16, card),
          ...mat(WW + 16, WH + 16, 8, 8, WW, WH, LABEL, WX - 8, WY - 8),
          T.rect(0, 34, CW, 2, STAMP, { opacity: 0.6 }), T.rect(0, CH - 30, CW, 2, BLUE, { opacity: 0.6 }),
          txt(16, 4, 260, `EXHIBIT ${String(it.index).padStart(2, '0')}`, 24, TYPE, on ? STAMP : INK_DIM, { tracking: 0.08 }),
          txt(CW - 16 - 200, 4, 200, it.meta || '', 24, TYPE, INK_DIM, { align: 'right' }),
          T.circle(CW / 2, WY - 6, 13, act ? '#7A1D17' : '#C0392B', { label: 'Pushpin' }), T.circle(CW / 2 - 4, WY - 10, 4, '#F2A79E'),
        ];
        const label = clip(it.label.toUpperCase(), 26);
        if (on) out.push(T.rect(18, WY + WH + 14, Math.min(CW - 36, typeW(label, 30) + 16), 40, act ? STAMP : HILITE, { opacity: 0.9, label: 'Highlighter' }));
        out.push(txt(26, WY + WH + 16, CW - 40, label, 30, TYPE, act ? LABEL : INK));
        if (on) out.push(T.rect(WX - 14, WY - 14, WW + 28, WH + 28, 'none', { stroke: STAMP, strokeWidth: 7, rx: 10, label: 'Grease-pencil ring' }));
        return out;
      });
    });
    const ny = 900;
    nav.forEach((it, i) => {
      const label = it.role === 'back' ? 'RETURN TO FILE' : it.label === 'Next' ? 'NEXT SHEET  >' : '<  PREV SHEET';
      const w = 330, x = it.role === 'back' ? 1776 - w : 144 + i * (w + 30);
      buttons.push(button(it, x, ny, w, 110, s => navTab(it, w, 110, s, label)));
    });
    art.push(...lamp());
    return { art, buttons };
  },

  list(ctx, heading, kind, items) {
    const art: O[] = [...desk(),
      ...labelStrip(240, 84, 760, 72, heading.toUpperCase() + '  ·  CARD CATALOGUE', 38, LABEL, INK),
      txt(1060, 98, 600, ctx.title.toUpperCase(), 32, HAND, LABEL_DIM, { rotation: -2 }),
      // The drawer: its sides and floor, the cards stand in it.
      T.rect(220, 190, 1300, 820, '#1C130D', { label: 'Drawer' }), T.rect(220, 190, 16, 820, '#4A3324'), T.rect(1504, 190, 16, 820, '#4A3324'),
    ];
    const CW = 1090, RH = 82, STEP = items.length > 7 ? 86 : 94;
    let y = 220, group = '';
    const buttons = items.map(it => {
      if (it.role === 'back') {
        const w = 360;
        return button(it, 1776 - w, 900, w, 110, s => navTab(it, w, 110, s, 'RETURN TO FILE'));
      }
      if (it.sub && it.sub !== group) {
        group = it.sub;
        // Divider card with its tab on the right.
        art.push(T.path(1080, y - 4, 230, 52, TAB_D, MANILA, { label: 'Divider tab' }));
        art.push(txt(1080, y + 6, 230, group.toUpperCase(), 30, TYPE, INK, { align: 'center' }));
        art.push(T.rect(260, y + 44, CW, 12, MANILA, { label: 'Divider' }));
        y += 66;
      }
      const idx = it.index != null ? String(it.index).padStart(2, '0') : it.sub === 'Audio' ? 'AUD' : 'SUB';
      const b = button(it, 260, y, CW + 60, RH, s => {
        const on = s !== 'normal', act = s === 'activated', dx = on ? 50 : 0;
        const out: O[] = [];
        if (on) out.push(T.rect(dx + 10, 10, CW, RH - 4, SHADOW, { opacity: 0.45, label: 'Pulled-card shadow' }));
        out.push(T.rect(dx, 0, CW, RH - 6, on ? CARD : CARD_DIM, { label: 'Index card' }));
        out.push(T.rect(dx + 110, 0, 3, RH - 6, STAMP, { opacity: 0.55, label: 'Margin line' }));
        out.push(T.rect(dx, RH - 22, CW, 2, BLUE, { opacity: 0.5 }));
        out.push(txt(dx + 18, (RH - 6 - 30) / 2, 90, idx, 24, TYPE, on ? STAMP : INK_DIM, { tracking: 0.06 }));
        const label = clip(it.label.toUpperCase(), 34);
        if (on) out.push(T.rect(dx + 132, 14, Math.min(760, typeW(label, 32) + 16), 44, act ? STAMP : HILITE, { opacity: 0.9, label: 'Highlighter' }));
        out.push(txt(dx + 140, (RH - 6 - 40) / 2, 760, label, 32, TYPE, act ? LABEL : INK));
        if (it.meta) out.push(txt(dx + CW - 24 - 240, (RH - 6 - 36) / 2, 240, it.meta.toUpperCase(), 28, TYPE, INK_DIM, { align: 'right' }));
        if (act) out.push(...stamp(dx + CW - 300, 12, it.sub ? 'SET' : 'PULLED', 34, -6, STAMP, 0.9));
        return out;
      });
      y += STEP;
      return b;
    });
    art.push(...lamp());
    return { art, buttons };
  },

  popup(ctx, items) {
    // File tabs hanging from the top edge of the picture; the centre stays clear.
    const chapters = items.filter(i => i.index != null);
    const resume = items.find(i => i.role === 'primary'), home = items.find(i => i.role === 'back');
    const ordered = [resume, ...chapters, home].filter(Boolean) as Item[];
    const wide = (it: Item) => (it.index == null ? 220 : 150);
    const gap = 8, total = ordered.reduce((s, it) => s + wide(it), 0) + gap * (ordered.length - 1);
    let x = Math.max(96, (W - total) / 2);
    const art: O[] = [T.rect(0, 0, W, 64, '#000', { gradient: linear(90, [['#000', 0, 0.55], ['#000', 1, 0]]), label: 'Top shade' })];
    const buttons = ordered.map(it => {
      const w = wide(it), bx = x; x += w + gap;
      return button(it, bx, 54, w, 150, s => {
        const on = s !== 'normal', act = s === 'activated', th = on ? 146 : 96;
        const out: O[] = [
          T.path(6, 6, w - 6, th, TAB_DOWN, SHADOW, { opacity: 0.4, label: 'Tab shadow' }),
          T.path(0, 0, w - 6, th, TAB_DOWN, act ? STAMP : on ? MANILA : MANILA_BACK, { label: 'Hanging tab' }),
        ];
        const ink = act ? LABEL : on ? INK : INK_DIM;
        if (it.index == null) {
          out.push(txt(0, 26, w - 6, it.role === 'primary' ? 'RESUME' : 'MAIN MENU', 28, TYPE, ink, { align: 'center' }));
          if (on) out.push(txt(0, 80, w - 6, it.role === 'primary' ? 'BACK TO REEL' : 'TO THE FILE', 24, TYPE, ink, { align: 'center' }));
        } else {
          out.push(txt(0, 14, w - 6, String(it.index).padStart(2, '0'), 36, TYPE, ink, { align: 'center' }));
          out.push(txt(0, 58, w - 6, it.meta || '', 24, TYPE, ink, { align: 'center' }));
          if (on) out.push(T.rect(12, 96, w - 30, 36, LABEL), txt(12, 100, w - 30, clip(it.label.toUpperCase(), 9), 24, TYPE, INK, { align: 'center' }));
        }
        return out;
      });
    });
    return { art, buttons };
  },

  motion: () => ({
    // Structural: dust turns in the lamp beam on a linear single-frame rhythm; the pool sways.
    layers: [
      { art: specks(0, 0, 700, 700, 70, '#FFE7B8', 11, 0.7), w: 700, h: 700, from: [-60, -80], to: [40, 120], periodSec: 22, ease: 'sine', blend: 'screen' },
      { art: specks(0, 0, 500, 500, 40, '#FFF3D6', 23, 0.9), w: 500, h: 500, from: [60, 380], to: [-20, 300], periodSec: 15, ease: 'sine', blend: 'screen' },
      { art: [glow(400, 300, 400, 300, '#FFD9A0', 0.12, 'Lamp sway')], w: 800, h: 600, from: [-260, -200], to: [-180, -170], periodSec: 9, ease: 'sine', blend: 'screen' },
    ],
    grain: 12,
    note: 'Paper moves on threes (Collage), the lamp on ones (Structural). Dust only drifts in the beam.',
  }),
};
void mins;
