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

/** A wandering thread from (0,50) to (100,endY) — seeded cubic segments. */
function threadPath(endY: number, seed: number): string {
  const r = orn.rng(seed); let d = 'M0 50'; let x = 0, y = 50; const segs = 4;
  for (let i = 1; i <= segs; i++) {
    const nx = i * 100 / segs, ny = i === segs ? endY : 14 + r() * 72;
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
// STORY-FOREST — The Lantern Forest
// ═════════════════════════════════════════════════════════════════════════════
const storyForest: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: cream, ink: green, accent: orange, secondary: gold, seed } = ctx;
  const r = orn.rng(seed);
  const deep = mix(green, -.5), dusk = mix(green, -.22), moss = mix(green, .16), bark = mix(green, -.62), glowText = mix(gold, .35);
  const lantern = (cx: number, cy: number, rad_: number, label = 'Lantern'): TelaVectorObject[] => [
    circle(cx, cy, rad_ * 2.8, gold, { gradient: rad([0, gold, .6], [.5, gold, .14], [1, gold, 0]), blend: 'screen', label: `${label} glow` }),
    rect(cx - rad_ * .36, cy - rad_ * 1.36, rad_ * .72, rad_ * .42, bark, { rx: 2, label: `${label} cap` }),
    circle(cx, cy, rad_, orange, { gradient: rad([0, mix(gold, .35)], [.6, gold], [1, orange]), label: `${label} body` }),
    circle(cx - rad_ * .3, cy - rad_ * .32, rad_ * .2, '#FFF6DC', { opacity: .9, label: `${label} highlight` }),
  ];
  const trunks = (spec: number[][], opacity = 1) => spec.map(([x, top, w]) => rect(x, top, w, H - top, bark, { rx: w / 2, opacity, label: 'Tree trunk' }));
  const canopies = (opacity = .55) => [ellipse(-80, -130, 420, 300, moss, { opacity, label: 'Canopy' }), ellipse(250, -170, 520, 330, dusk, { opacity, label: 'Canopy' }), ellipse(610, -150, 520, 310, moss, { opacity, label: 'Canopy' }), ellipse(900, -110, 320, 250, dusk, { opacity, label: 'Canopy' })];
  const woods = (top = dusk, bottom = deep) => rect(0, 0, W, H, bottom, { role: 'GROUND', label: 'Forest ground', gradient: lin(90, [0, top], [1, bottom]) });
  const read = (x: number, y: number, w: number, value: string, size = 20) => text(x, y, w, value, { size, font: 'lora', color: green, leading: 1.55, label: 'Read-aloud text', role: 'BODY' });
  const panel = (x: number, y: number, w: number, body: TelaVectorObject[], pad = 28): TelaVectorObject[] => {
    const h = Math.max(...body.map(b => b.y + b.h)) - y + pad;
    return [rect(x, y, w, h, cream, { rx: 24, opacity: .97, shadow: { x: 0, y: 10, blur: 24, color: alpha(deep, .5) }, label: 'Story text panel' }), ...body];
  };
  const folioObj = (color = cream) => pageNo(ctx, color, 'baloo', { size: 13, inset: 36 });

  switch (pageType) {
    case 'COVER': {
      const out = [woods(), ...canopies(), ...trunks([[36, 300, 22], [128, 380, 14], [300, 250, 30], [470, 430, 12], [984, 380, 18]])];
      out.push(...imageSlot(540, 84, 420, 540, { tone: 'dark', rx: 30, frame: alpha(gold, .45), frameWidth: 1.5, caption: 'Cover art · the fox and her lantern', label: 'Cover illustration slot' }));
      out.push(...lantern(150, 190, 18), ...lantern(330, 110, 12), ...lantern(450, 320, 24), ...lantern(240, 560, 14), ...lantern(900, 70, 9), ...lantern(600, 690, 16));
      out.push(text(64, 60, 400, 'A Plajah picture book', { size: 11, font: 'baloo', weight: 700, color: gold, tracking: .22, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
      const title = text(64, 96, 460, 'The Lantern\nForest', { size: 86, font: 'baloo', weight: 800, color: cream, leading: .98, label: 'Title', role: 'HEADLINE' });
      out.push(title, text(64, below(title, 18), 420, copy.deck(K, 0), { size: 19, font: 'lora', italic: true, color: glowText, leading: 1.45, label: 'Deck', role: 'DECK' }));
      out.push(text(64, 664, 400, copy.byline(K, 0), { size: 14, font: 'baloo', weight: 600, color: cream, opacity: .9, wrap: false, label: 'Byline', role: 'LABEL' }));
      out.push(circle(486, 636, 32, orange, { label: 'Age badge' }), text(452, 622, 68, 'Ages\n4–8', { size: 13, font: 'baloo', weight: 700, color: cream, align: 'center', leading: 1.1, label: 'Age badge label', role: 'LABEL' }));
      return out;
    }
    case 'STORY SPREAD': {
      if (pageIndex === 1) {
        // Full-bleed picture, text panel low-left, three lanterns high-right.
        const out = [woods(), ...canopies(.4), ...trunks([[10, 200, 26], [990, 260, 22]])];
        out.push(...imageSlot(48, 48, W - 96, H - 96, { tone: 'dark', rx: 32, frame: alpha(gold, .3), frameWidth: 1, caption: 'Spread art · the fox counting fireflies', label: 'Spread illustration slot' }));
        out.push(...lantern(760, 150, 14), ...lantern(880, 250, 20), ...lantern(680, 92, 9));
        const body = read(100, 476, 384, copy.body(K, 0));
        out.push(...panel(72, 448, 440, [body]));
        out.push(text(560, 690, 400, copy.caption(K, 1), { size: 14, font: 'lora', italic: true, color: glowText, align: 'right', wrap: false, label: 'Reader prompt', role: 'CAPTION' }));
        out.push(folioObj());
        return out;
      }
      if (pageIndex === 2) {
        // Picture on the left half, text on the right, a counting row of lanterns along the foot.
        const out = [woods(), ...canopies(.45), ...trunks([[600, 300, 16], [960, 240, 28], [880, 420, 12]])];
        out.push(...imageSlot(0, 0, 560, H, { tone: 'dark', caption: 'Spread art · waiting for the fireflies', label: 'Spread illustration slot' }));
        const body = read(638, 178, 294, 'One night the fireflies were late.\nThe fox waited.\nShe counted the stars instead — one, two, three —\nbut stars are very far away,\nand far away is not the same as near.');
        out.push(...panel(610, 150, 350, [body]));
        [612, 690, 768, 846, 924].forEach((x, i) => out.push(...lantern(x, 690, 9 + i * 2, `Counting lantern ${i + 1}`)));
        out.push(folioObj());
        return out;
      }
      // pageIndex 4 — the picture IS the lantern: a round slot with its own glow; hundreds of small lights.
      const out = [woods(mix(green, -.3), deep), ...canopies(.35), ...trunks([[20, 240, 24], [140, 360, 12]])];
      out.push(circle(740, 360, 330, gold, { gradient: rad([0, gold, .5], [.6, gold, .1], [1, gold, 0]), blend: 'screen', label: 'Picture glow' }));
      out.push(...imageSlot(500, 120, 480, 480, { tone: 'dark', rx: 240, frame: alpha(gold, .7), frameWidth: 3, caption: 'Spread art · the forest glows', label: 'Round illustration slot' }));
      for (let i = 0; i < 12; i++) out.push(...lantern(40 + r() * 440, 420 + r() * 300, 4 + r() * 6, 'Small firefly'));
      const body = read(92, 124, 344, 'The fireflies came, in ones and twos and then in hundreds,\nand each one stopped beside her small warm light.');
      const quote = text(92, below(body, 18), 344, copy.quote(K, 0), { size: 26, font: 'baloo', weight: 700, color: orange, leading: 1.2, label: 'Read-aloud emphasis', role: 'DECK' });
      out.push(...panel(64, 96, 400, [body, quote]));
      out.push(folioObj());
      return out;
    }
    case 'QUIET SPREAD': {
      const out = [woods(mix(green, -.4), mix(green, -.6)), ...trunks([[60, 180, 20], [500, 300, 10], [940, 220, 26]], .35)];
      out.push(...lantern(512, 380, 11, 'The fox’s lantern'));
      out.push(text(0, 470, W, 'So she lit one herself.', { size: 22, font: 'lora', italic: true, color: cream, align: 'center', label: 'Quiet line', role: 'BODY' }));
      out.push(text(0, 700, W, copy.caption(K, 0), { size: 11, font: 'baloo', weight: 600, color: gold, align: 'center', tracking: .2, transform: 'uppercase', label: 'Reader prompt', role: 'CAPTION' }));
      out.push(folioObj(alpha(cream, .6)));
      return out;
    }
    case 'ACTIVITY': {
      const out = [rect(0, 0, W, H, cream, { role: 'GROUND', label: 'Paper ground' })];
      const head = text(64, 52, 620, 'Count the lanterns', { size: 44, font: 'baloo', weight: 800, color: green, label: 'Activity title', role: 'HEADLINE' });
      out.push(head, text(64, below(head, 6), 600, 'How many lanterns are glowing in the forest tonight? Count them out loud, then circle the number.', { size: 18, font: 'lora', color: green, leading: 1.45, label: 'Instructions', role: 'BODY' }));
      out.push(rect(64, 172, 600, 430, deep, { rx: 24, label: 'Forest scene box', gradient: lin(90, [0, dusk], [1, deep]) }));
      out.push(rect(96, 300, 20, 302, bark, { rx: 10, label: 'Tree trunk' }), rect(380, 240, 28, 362, bark, { rx: 14, label: 'Tree trunk' }), rect(600, 330, 16, 272, bark, { rx: 8, label: 'Tree trunk' }));
      const spots: Array<[number, number, number]> = [[170, 260, 14], [290, 340, 11], [470, 230, 16], [540, 420, 12], [220, 500, 13], [420, 520, 10], [640, 500, 9]];
      spots.forEach(([x, y, s], i) => out.push(...lantern(x, y, s, `Lantern to count ${i + 1}`)));
      for (let i = 0; i < 10; i++) {
        const cx = 88 + i * 60;
        out.push(circle(cx, 660, 22, 'none', { stroke: green, strokeWidth: 2, label: `Number ring ${i + 1}` }), text(cx - 22, 649, 44, String(i + 1), { size: 18, font: 'baloo', weight: 700, color: green, align: 'center', wrap: false, label: `Number ${i + 1}`, role: 'LABEL' }));
      }
      out.push(text(700, 176, 260, 'Draw your own lantern', { size: 24, font: 'baloo', weight: 700, color: orange, leading: 1.1, label: 'Draw prompt', role: 'DECK' }));
      out.push(rect(700, 224, 260, 260, 'none', { rx: 28, stroke: orange, strokeWidth: 2, dash: [10, 8], label: 'Drawing box' }));
      out.push(text(700, 516, 260, 'What colour does it glow?', { size: 16, font: 'lora', italic: true, color: green, label: 'Write prompt', role: 'BODY' }));
      out.push(...writeLines(700, 566, 260, 3, 36, alpha(green, .45), [2, 4]));
      out.push(pageNo(ctx, green, 'baloo', { size: 13, inset: 36 }));
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [woods(), ...canopies(.4), ...trunks([[900, 300, 30], [40, 420, 16]])];
      out.push(...lantern(860, 150, 22, 'Back-cover lantern'));
      out.push(text(96, 72, 400, 'The Lantern Forest', { size: 24, font: 'baloo', weight: 800, color: cream, wrap: false, label: 'Title, small', role: 'LABEL' }));
      const blurb = text(124, 168, 424, 'A very small fox. A very dark forest. And ten small lights that were there all along.\n\nA story for the last ten minutes before sleep, with lanterns to count on every page.', { size: 17, font: 'lora', color: green, leading: 1.55, label: 'Blurb', role: 'BODY' });
      const ages = text(124, below(blurb, 14), 424, 'Ages 4–8 · 32 pages · read-aloud', { size: 13, font: 'baloo', weight: 700, color: orange, tracking: .06, wrap: false, label: 'Age line', role: 'LABEL' });
      out.push(...panel(96, 140, 480, [blurb, ages]));
      out.push(text(96, 640, 300, 'Plajah Books', { size: 13, font: 'baloo', weight: 800, color: gold, tracking: .22, transform: 'uppercase', wrap: false, label: 'Imprint', role: 'LABEL' }));
      out.push(text(96, 662, 400, copy.byline(K, 0), { size: 12, font: 'lora', italic: true, color: alpha(cream, .8), wrap: false, label: 'Credits', role: 'CAPTION' }));
      out.push(rect(796, 632, 124, 72, cream, { rx: 6, label: 'Barcode plate' }), ...barcode(808, 640, 100, 44, deep, seed), text(796, 688, 124, 'PLB-0001 · £7.99', { size: 8, font: 'baloo', weight: 700, color: deep, align: 'center', wrap: false, label: 'Price line', role: 'CAPTION' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// STORY-SPACE — Little Orbit
// ═════════════════════════════════════════════════════════════════════════════
const storySpace: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper: navy, ink: cream, accent: violet, secondary: yellow, seed } = ctx;
  const r = orn.rng(seed);
  const ground = () => rect(0, 0, W, H, navy, { role: 'GROUND', label: 'Night ground', gradient: lin(90, [0, mix(navy, -.35)], [1, mix(navy, .06)]) });
  const planet = (cx: number, cy: number, rad_: number, tint: string, caption: string, ring = false): TelaVectorObject[] => {
    const out = imageSlot(cx - rad_, cy - rad_, rad_ * 2, rad_ * 2, { tone: 'dark', rx: rad_, shade: alpha(tint, .38), frame: alpha(cream, .35), frameWidth: 1.5, caption, label: 'Planet image slot' });
    if (ring) out.push(ellipse(cx - rad_ * 1.55, cy - rad_ * .26, rad_ * 3.1, rad_ * .52, 'none', { stroke: yellow, strokeWidth: 3, rotation: -16, opacity: .9, label: 'Planet ring' }));
    return out;
  };
  const rocket = (x: number, y: number, s: number, rot: number): TelaVectorObject[] => [
    rect(x, y + s * .3, s * .5, s, cream, { rx: s * .25, rotation: rot, label: 'Rocket body' }),
    path(x, y, s * .5, s * .36, orn.polygonPath(3), violet, { rotation: rot, label: 'Rocket nose' }),
    rect(x - s * .16, y + s * .95, s * .82, s * .3, yellow, { rx: 4, rotation: rot, label: 'Rocket fins' }),
    circle(x + s * .25, y + s * .68, s * .12, navy, { rotation: rot, label: 'Rocket window' }),
  ];
  const read = (x: number, y: number, w: number, value: string, align: 'left' | 'center' = 'left') => text(x, y, w, value, { size: 20, font: 'nunito', weight: 600, color: cream, leading: 1.6, align, label: 'Read-aloud text', role: 'BODY' });
  const folioObj = () => pageNo(ctx, yellow, 'fredoka', { size: 13, inset: 36 });

  switch (pageType) {
    case 'COVER': {
      const out = [ground(), ...stars(r, 0, 0, W, H, 44, cream, 2.2)];
      out.push(...planet(770, 400, 250, yellow, 'Cover art · the small blue planet', true));
      out.push(text(64, 60, 400, 'A Plajah picture book', { size: 11, font: 'fredoka', weight: 600, color: violet, tracking: .22, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
      const title = text(64, 120, 520, 'Little\nOrbit', { size: 100, font: 'fredoka', weight: 700, color: cream, leading: .96, label: 'Title', role: 'HEADLINE' });
      out.push(title, text(64, below(title, 20), 400, 'A very small rocket, a very brave mouse, and three sandwiches for the way home.', { size: 19, font: 'nunito', weight: 600, color: mix(violet, .45), leading: 1.45, label: 'Deck', role: 'DECK' }));
      out.push(path(320, 440, 420, 220, orn.sineOpenPath(1, 26, .5), 'none', { stroke: yellow, strokeWidth: 2, dash: [4, 9], open: true, opacity: .8, label: 'Flight path' }));
      out.push(...rocket(300, 520, 64, 28));
      out.push(text(64, 690, 400, copy.byline(K, 1), { size: 14, font: 'fredoka', weight: 500, color: cream, opacity: .9, wrap: false, label: 'Byline', role: 'LABEL' }));
      return out;
    }
    case 'STORY SPREAD': {
      if (pageIndex === 1) {
        // Three planets on an arc, text across the foot.
        const out = [ground(), ...stars(r, 0, 0, W, 500, 34, cream)];
        out.push(...orn.rings(512, 980, [720, 790], alpha(cream, .14), 1.5, { label: 'Orbit' }));
        out.push(...planet(200, 300, 90, violet, 'Planet one'), ...planet(512, 210, 130, yellow, 'The Moon, too busy to wave', true), ...planet(830, 320, 70, mix(violet, .4), 'Mars, red from running'));
        out.push(...rocket(360, 380, 40, 60));
        out.push(read(112, 540, 800, copy.body(K, 1), 'center'));
        out.push(folioObj());
        return out;
      }
      if (pageIndex === 2) {
        // One huge planet cropped off the left, text column on the right.
        const out = [ground(), ...stars(r, 400, 0, W - 400, H, 30, cream)];
        out.push(...planet(180, 384, 320, yellow, 'Spread art · past the Moon', true));
        out.push(...rocket(560, 120, 46, 110));
        out.push(read(600, 230, 370, 'Past the Moon, who was too busy to wave.\nPast Mars, who was red from running.\nThe mouse ate the first sandwich\nand looked out the window\nfor a very long time.'));
        out.push(folioObj());
        return out;
      }
      // pageIndex 4 — small planet high-right, the small blue planet low-left, a flight path between.
      const out = [ground(), ...stars(r, 0, 0, W, H, 40, cream)];
      out.push(...planet(890, 110, 62, violet, 'A moon'));
      out.push(path(300, 120, 620, 420, orn.sineOpenPath(1, 22, 2.6), 'none', { stroke: yellow, strokeWidth: 2, dash: [4, 9], open: true, opacity: .75, rotation: 14, label: 'Flight path' }));
      out.push(...planet(270, 620, 230, mix(violet, -.1), 'The small blue planet, with a garden'));
      out.push(ellipse(150, 470, 200, 60, mix(yellow, -.1), { opacity: .55, rotation: -8, label: 'Garden hint' }));
      out.push(...rocket(470, 400, 44, 200));
      out.push(read(540, 150, 420, 'Then a small blue planet rolled into view,\nwith a small green garden\nand a small back door left open.\n“Home,” said the mouse,\nand saved the last sandwich for later.'));
      out.push(folioObj());
      return out;
    }
    case 'QUIET SPREAD': {
      const out = [ground(), ...stars(r, 0, 0, W, H, 18, cream, 1.6)];
      out.push(circle(700, 300, 4, yellow, { label: 'One small planet' }));
      out.push(text(0, 380, W, 'Space is quiet. The mouse listened anyway.', { size: 22, font: 'nunito', weight: 600, color: cream, align: 'center', label: 'Quiet line', role: 'BODY' }));
      out.push(folioObj());
      return out;
    }
    case 'ACTIVITY': {
      const out = [ground(), ...stars(r, 0, 0, W, H, 24, alpha(cream, .5), 1.4)];
      const head = text(64, 56, 400, 'Connect the stars', { size: 44, font: 'fredoka', weight: 700, color: yellow, label: 'Activity title', role: 'HEADLINE' });
      out.push(head, text(64, below(head, 10), 360, 'Start at star 1 and draw a line to 2, then 3, all the way to 12. What did the mouse see out of the window?', { size: 18, font: 'nunito', weight: 600, color: cream, leading: 1.5, label: 'Instructions', role: 'BODY' }));
      const pts: Array<[number, number]> = [[.5, 0], [.62, .12], [.7, .35], [.7, .7], [.86, .9], [.62, .8], [.5, .96], [.38, .8], [.14, .9], [.3, .7], [.3, .35], [.38, .12]];
      pts.forEach(([px, py], i) => {
        const cx = 520 + px * 420, cy = 130 + py * 540;
        out.push(circle(cx, cy, 7, yellow, { label: `Star ${i + 1}` }), text(cx + 10, cy - 16, 40, String(i + 1), { size: 14, font: 'fredoka', weight: 600, color: cream, wrap: false, label: `Star number ${i + 1}`, role: 'LABEL' }));
      });
      out.push(text(64, 330, 360, 'I connected', { size: 16, font: 'nunito', weight: 700, color: violet, tracking: .1, transform: 'uppercase', wrap: false, label: 'Answer prompt', role: 'LABEL' }));
      out.push(rect(64, 360, 120, 70, 'none', { rx: 16, stroke: yellow, strokeWidth: 2, dash: [8, 6], label: 'Answer box' }), text(196, 386, 200, 'stars.', { size: 18, font: 'nunito', weight: 600, color: cream, wrap: false, label: 'Answer suffix', role: 'BODY' }));
      out.push(text(64, 480, 360, 'Now draw your own constellation here:', { size: 16, font: 'nunito', weight: 600, color: cream, label: 'Draw prompt', role: 'BODY' }));
      out.push(rect(64, 516, 360, 180, 'none', { rx: 18, stroke: violet, strokeWidth: 2, dash: [8, 6], label: 'Drawing box' }));
      out.push(folioObj());
      return out;
    }
    case 'BACK COVER':
    default: {
      const out = [ground(), ...stars(r, 0, 0, W, H, 36, cream)];
      out.push(circle(860, 150, 90, violet, { gradient: rad([0, mix(violet, .3)], [1, mix(violet, -.3)]), label: 'Back-cover planet' }), ellipse(720, 128, 280, 46, 'none', { stroke: yellow, strokeWidth: 3, rotation: -14, label: 'Planet ring' }));
      out.push(text(96, 80, 400, 'Little Orbit', { size: 26, font: 'fredoka', weight: 700, color: cream, wrap: false, label: 'Title, small', role: 'LABEL' }));
      const blurb = text(96, 180, 440, 'The rocket is the size of a teapot. The mouse is the size of a mouse. The journey is exactly as long as three sandwiches.\n\nA first space story with planets to name, a moon to wave at, and a small blue home to come back to.', { size: 17, font: 'nunito', weight: 600, color: cream, leading: 1.6, label: 'Blurb', role: 'BODY' });
      out.push(blurb, text(96, below(blurb, 16), 440, 'Ages 3–7 · 32 pages', { size: 13, font: 'fredoka', weight: 600, color: yellow, tracking: .08, wrap: false, label: 'Age line', role: 'LABEL' }));
      out.push(text(96, 656, 300, 'Plajah Books', { size: 13, font: 'fredoka', weight: 600, color: violet, tracking: .22, transform: 'uppercase', wrap: false, label: 'Imprint', role: 'LABEL' }));
      out.push(text(96, 680, 400, copy.byline(K, 1), { size: 12, font: 'nunito', color: alpha(cream, .8), wrap: false, label: 'Credits', role: 'CAPTION' }));
      out.push(rect(796, 632, 124, 72, cream, { rx: 6, label: 'Barcode plate' }), ...barcode(808, 640, 100, 44, navy, seed), text(796, 688, 124, 'PLB-0002 · £7.99', { size: 8, font: 'nunito', weight: 800, color: navy, align: 'center', wrap: false, label: 'Price line', role: 'CAPTION' }));
      return out;
    }
  }
};

// __PART2__
