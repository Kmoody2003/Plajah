// Storybook Hills — the family disc (built for ages 4–10).
// Animation lead: The Rubber-Hose Vaudevillian (24 fps on twos, overshoot — everything bounces).
// Crew: Golden-Age Naturalist (weight, appeal), Rotoscope Painter (the painterly wobble).
// Graphic designer: The Bold-Flat TV Stylist — thick outlines, flat shapes, hit the pose and hold.
// Lighting director: a bright warm sun high left, soft cel shadows under each button, clouds drift.
// Structure: a landscape. Big round pill buttons sit on rolling hill crests like little houses, each
// with a picture badge so pre-readers can choose; selection hops the button up off its hill and rings
// it with sunshine. Scenes are picture-book page tiles, setup is two signposted paths (Sound / Words),
// and the pop-up is a little hill along the bottom with number bubbles sitting on its crest.
import { button, glow, txt, T, W, type Ctx, type Design, type Item, type O, type State } from './kit';
import { starPath } from '../../tela/ornaments';

const SKY = '#8FD6F6', HORIZON = '#C9EEFB', HILL_FAR = '#B3DE86', HILL_MID = '#86C96A', HILL_NEAR = '#5DB157', HILL_FRONT = '#4CA14C';
const LINE = '#283659', CREAM = '#FFF8EA', SUN = '#FFD23F', SUN_PALE = '#FFF1A6', CEL = '#2F6E35', WOOD = '#D89A5B';
const BADGES = ['#FF6F59', '#4AA3FF', '#9B6BFF', '#33C59A', '#FF5FA2', '#FFA630'];
const DISPLAY = 'dynaPuff', ROUND = 'fredoka';
const ABS = { x: 0, y: 0, w: W, h: 1080 };

/** Smooth closed hill band through sample points (quadratic midpoints), filled down to the bottom. */
function hillPath(f: (x: number) => number, bottom = 1080): string {
  const pts: Array<[number, number]> = [];
  for (let x = -40; x <= W + 40; x += 48) pts.push([x, f(x)]);
  let d = `M-40 ${bottom} L${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += ` Q${pts[i][0]} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`; }
  const last = pts[pts.length - 1];
  return d + ` L${last[0]} ${last[1].toFixed(1)} L${W + 40} ${bottom} Z`;
}
const hill = (f: (x: number) => number, fill: string, label: string, stroke = true) =>
  T.path(0, 0, W, 1080, hillPath(f), fill, { origin: ABS, stroke: stroke ? LINE : 'none', strokeWidth: stroke ? 6 : 0, label });

/** A cel-shaded tree: trunk + round crown + flat shadow side. */
const tree = (x: number, y: number, r: number): O[] => [
  T.rect(x - 7, y - 10, 14, 40, '#8A5A35', { stroke: LINE, strokeWidth: 4, rx: 4 }),
  T.circle(x, y - r, r, '#3E9A4E', { stroke: LINE, strokeWidth: 5, label: 'Tree' }),
  T.ellipse(x - r * 0.15, y - r * 1.75, r * 0.9, r * 0.8, '#5DBB62', { label: 'Tree light' }),
];
const flower = (x: number, y: number, c: string): O[] => [T.circle(x, y, 9, c, { stroke: LINE, strokeWidth: 3 }), T.circle(x, y, 3, SUN)];

function sun(cx: number, cy: number, r: number): O[] {
  const out: O[] = [glow(cx, cy, r * 3.2, r * 3.2, SUN_PALE, 0.55, 'Sun glow')];
  for (let i = 0; i < 12; i++) {
    const a = (i * 30) * Math.PI / 180, r0 = r + 22, r1 = r + (i % 2 ? 48 : 70);
    out.push(T.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, '#FFB627', 10, { label: 'Ray' }));
  }
  out.push(T.circle(cx, cy, r, SUN, { stroke: LINE, strokeWidth: 6, label: 'Sun' }));
  out.push(T.circle(cx - r * 0.35, cy + r * 0.05, r * 0.11, LINE), T.circle(cx + r * 0.35, cy + r * 0.05, r * 0.11, LINE));
  out.push(T.path(cx - r * 0.4, cy + r * 0.2, r * 0.8, r * 0.38, 'M0 0 Q50 100 100 0', 'none', { stroke: LINE, strokeWidth: 6, open: true, label: 'Smile' }));
  return out;
}

/** Picture badges so pre-readers can choose: play, frames, sound, words, star, stack, house, arrows. */
function icon(kind: string, x: number, y: number, s: number, c = CREAM): O[] {
  const k = s / 100;
  switch (kind) {
    case 'play': return [T.path(x + 30 * k, y + 20 * k, 52 * k, 60 * k, 'M0 0 L100 50 L0 100 Z', c, { label: 'Play icon' })];
    case 'scenes': return [0, 1, 2, 3].map(i => T.rect(x + (22 + (i % 2) * 31) * k, y + (22 + Math.floor(i / 2) * 31) * k, 25 * k, 25 * k, c, { rx: 5 * k }));
    case 'sound': return [T.path(x + 18 * k, y + 26 * k, 36 * k, 48 * k, 'M0 30 L35 30 L100 0 L100 100 L35 70 L0 70 Z', c), T.path(x + 60 * k, y + 30 * k, 22 * k, 40 * k, 'M0 0 Q100 50 0 100', 'none', { stroke: c, strokeWidth: 7 * k, open: true })];
    case 'words': return [T.path(x + 18 * k, y + 22 * k, 64 * k, 56 * k, 'M10 0 L90 0 Q100 0 100 10 L100 62 Q100 72 90 72 L40 72 L18 100 L22 72 L10 72 Q0 72 0 62 L0 10 Q0 0 10 0 Z', c), T.rect(x + 30 * k, y + 34 * k, 40 * k, 6 * k, BADGES[1]), T.rect(x + 30 * k, y + 48 * k, 28 * k, 6 * k, BADGES[1])];
    case 'off': return [T.circle(x + 50 * k, y + 50 * k, 28 * k, 'none', { stroke: c, strokeWidth: 8 * k }), T.line(x + 30 * k, y + 70 * k, x + 70 * k, y + 30 * k, c, 8 * k)];
    case 'star': return [T.path(x + 18 * k, y + 16 * k, 64 * k, 64 * k, starPath(5, 0.45), c)];
    case 'home': return [T.path(x + 20 * k, y + 18 * k, 60 * k, 62 * k, 'M50 0 L100 45 L86 45 L86 100 L14 100 L14 45 L0 45 Z', c)];
    case 'left': return [T.path(x + 22 * k, y + 22 * k, 56 * k, 56 * k, 'M100 40 L45 40 L45 10 L0 50 L45 90 L45 60 L100 60 Z', c)];
    case 'right': return [T.path(x + 22 * k, y + 22 * k, 56 * k, 56 * k, 'M0 40 L55 40 L55 10 L100 50 L55 90 L55 60 L0 60 Z', c)];
    default: return [T.circle(x + 50 * k, y + 50 * k, 16 * k, c)];
  }
}
function iconFor(it: Item): string {
  const a = it.action;
  if (it.role === 'back') return /menu/i.test(it.label) ? 'home' : 'left';
  if (it.role === 'nav') return it.label === 'Next' ? 'right' : 'left';
  if (a.kind === 'PLAY_TITLE' || a.kind === 'PLAY_ALL' || a.kind === 'CLOSE_POPUP' || it.role === 'primary') return 'play';
  if (a.kind === 'SET_AUDIO') return 'sound';
  if (a.kind === 'SET_SUBTITLE') return a.trackIndex === 'off' ? 'off' : 'words';
  if (/scene|setlist/i.test(it.label)) return 'scenes';
  if (/setup/i.test(it.label)) return 'sound';
  if (/episode/i.test(it.label)) return 'scenes';
  return 'star';
}
const kidLabel = (it: Item) => (it.role === 'back' ? (/menu/i.test(it.label) ? 'Home' : 'Back') : it.role === 'nav' ? (it.label === 'Next' ? 'More' : 'Before') : it.label === 'Setup' ? 'Sound' : it.label);

const RING = 22, LIFT = 26, GROUND_PAD = 20;
/** Pill button: badge + label. Box = pill + ring margin + lift room + cel shadow. */
function pill(it: Item, pw: number, ph: number, color: string, s: State, size = 48): O[] {
  const on = s !== 'normal', act = s === 'activated';
  const w = pw + RING * 2;
  const squash = act ? 10 : 0;
  const px = RING - squash / 2, py = (on && !act ? RING : RING + LIFT) + squash, pww = pw + squash, phh = ph - squash;
  const groundY = RING + LIFT + ph;
  const out: O[] = [];
  // Cel shadow on the hill: shrinks and lightens while the pill hops.
  const sw = on && !act ? pw * 0.7 : pw * 0.94;
  out.push(T.ellipse((w - sw) / 2, groundY - 12, sw, 26, CEL, { opacity: on && !act ? 0.35 : 0.55, label: 'Cel shadow' }));
  if (on) out.push(T.rect(px - 16, py - 16, pww + 32, phh + 32, 'none', { stroke: act ? '#FFB627' : SUN, strokeWidth: 12, rx: (phh + 32) / 2, label: 'Sun ring' }));
  out.push(T.rect(px, py + 8, pww, phh, LINE, { rx: phh / 2, label: 'Pill base' }));
  out.push(T.rect(px, py, pww, phh, act ? SUN : on ? SUN_PALE : CREAM, { stroke: LINE, strokeWidth: 6, rx: phh / 2, label: 'Pill' }));
  const bd = phh - 28;
  out.push(T.circle(px + 14 + bd / 2, py + phh / 2, bd / 2, color, { stroke: LINE, strokeWidth: 5, label: 'Badge' }));
  out.push(...icon(iconFor(it), px + 14, py + 14, bd));
  const label = kidLabel(it);
  const lx = px + bd + 36, lw = pww - bd - 56;
  const sz = Math.max(30, Math.min(size, Math.floor(lw / Math.max(1, label.length * 0.56))));
  out.push(txt(lx, py + (phh - sz * 1.22) / 2, lw, label, sz, ROUND, LINE, { weight: 600, align: 'center' }));
  return out;
}
const pillBox = (pw: number, ph: number) => ({ w: pw + RING * 2, h: RING + LIFT + ph + GROUND_PAD });

/** Rolling ground for sub pages. */
function lowHills(): O[] {
  return [
    hill(x => 900 + 40 * Math.sin(x / 260 + 1.2), HILL_MID, 'Back hill'),
    hill(x => 960 + 30 * Math.sin(x / 210 + 0.3), HILL_NEAR, 'Front hill'),
    ...tree(130, 900, 40), ...tree(1810, 880, 46),
    ...flower(420, 1010, '#FF6F59'), ...flower(1500, 1020, '#9B6BFF'), ...flower(980, 1030, '#FFFFFF'),
  ];
}
function heading(s: string, x: number, y: number, size: number, align: 'left' | 'center' = 'left', w = 1200): O[] {
  return [
    txt(x + 6, y + 7, w, s, size, DISPLAY, LINE, { weight: 700, align }),
    txt(x, y, w, s, size, DISPLAY, CREAM, { weight: 700, align, stroke: LINE, strokeWidth: 3 }),
  ];
}

export const storybook: Design = {
  id: 'family',
  background: () => ({ kind: 'color', value: SKY }),
  subBackground: () => ({ kind: 'color', value: SKY }),

  main(ctx, items) {
    const n = items.length;
    // Button slots: Play is the biggest house.
    const sizes = items.map(it => (it.role === 'primary' ? { pw: 360, ph: 150 } : { pw: 300, ph: 128 }));
    const boxes = sizes.map(s => pillBox(s.pw, s.ph));
    const totalW = boxes.reduce((a, b) => a + b.w, 0), gap = Math.min(80, (1728 - totalW) / Math.max(1, n - 1));
    let cx = (W - (totalW + gap * (n - 1))) / 2;
    const slots = boxes.map((b, i) => { const x = cx; cx += b.w + gap; return { x, cx: x + b.w / 2, crest: 830 + (i % 2 ? 46 : 0) + (i === 0 ? -20 : 0) }; });
    // The front hill gets a little flat-topped mound under every button.
    const bump = (x: number) => slots.reduce((acc, sl, i) => { const d = (x - sl.cx) / (boxes[i].w * 0.62); return Math.min(acc, sl.crest + 6 + 70 * d * d * (d * d < 1 ? 1 : 1)); }, 1080);
    const front = (x: number) => Math.min(990 + 16 * Math.sin(x / 140), bump(x));
    const art: O[] = [
      T.rect(0, 300, W, 260, HORIZON, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ color: HORIZON, offset: 0, opacity: 0 }, { color: HORIZON, offset: 1, opacity: 0.85 }] }, label: 'Horizon haze' }),
      ...sun(290, 230, 108),
      hill(x => 500 + 50 * Math.sin(x / 300 + 2.1) + 16 * Math.sin(x / 90), HILL_FAR, 'Far hill'),
      ...tree(1560, 505, 30), ...tree(1630, 515, 22), ...tree(760, 530, 26),
      hill(x => 600 + 44 * Math.sin(x / 240 + 0.4), HILL_MID, 'Middle hill'),
      ...flower(560, 660, '#FFFFFF'), ...flower(1300, 650, '#FF5FA2'), ...flower(1360, 668, '#FFFFFF'),
      hill(front, HILL_FRONT, 'Front hill'),
      ...flower(220, 1030, '#FF6F59'), ...flower(1720, 1040, '#FFFFFF'), ...flower(980, 1050, '#9B6BFF'),
    ];
    const title = ctx.title;
    const tSize = Math.min(124, Math.floor(1100 / Math.max(1, title.length * 0.58)));
    art.push(...heading(title, 560, 120, tSize, 'center', 1220));
    art.push(txt(560, 120 + tSize * 1.25 + 8, 1220, 'Pick a button to start!', 40, ROUND, LINE, { weight: 600, align: 'center' }));
    const buttons = items.map((it, i) => {
      const { pw, ph } = sizes[i], b = boxes[i], sl = slots[i];
      return button(it, sl.x, sl.crest - (RING + LIFT + ph), b.w, b.h, s => pill(it, pw, ph, BADGES[i % BADGES.length], s, it.role === 'primary' ? 60 : 48));
    });
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    const art: O[] = [...lowHills(), ...heading('Pick a scene!', 192, 60, 76)];
    // Page dots: big and countable.
    for (let i = 0; i < pages; i++) art.push(T.circle(1728 - (pages - 1 - i) * 56, 112, 18, i === page ? SUN : CREAM, { stroke: LINE, strokeWidth: 5, label: 'Page dot' }));
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    const BW = 480, BH = 270, GX = 48, x0 = (W - (3 * BW + 2 * GX)) / 2, y0 = 196, GY = 40;
    const buttons = chapters.map((it, i) => {
      const x = x0 + (i % 3) * (BW + GX), y = y0 + Math.floor(i / 3) * (BH + GY);
      return button(it, x, y, BW, BH, s => tile(it, BW, BH, s, BADGES[(it.index! - 1) % BADGES.length]));
    });
    const ny = 1026 - pillBox(300, 124).h;
    nav.forEach((it, i) => {
      const pw = 300, ph = 124, b = pillBox(pw, ph);
      const x = it.role === 'back' ? 1824 - b.w : 96 + i * (b.w + 20);
      buttons.push(button(it, x, ny, b.w, b.h, s => pill(it, pw, ph, it.role === 'back' ? BADGES[0] : BADGES[3], s)));
    });
    return { art, buttons };
  },

  list(ctx, heading_, kind, items) {
    const art: O[] = [...lowHills(), ...heading(kind === 'SETUP' ? 'Sound & Words' : heading_, 192, 56, 64)];
    const back = items.find(i => i.role === 'back');
    const rest = items.filter(i => i.role !== 'back');
    // Columns: one per group (Sound / Words), split long groups so nothing runs into the hills.
    const groups: Array<{ name: string; items: Item[] }> = [];
    rest.forEach(it => { const g = it.sub || ''; const last = groups[groups.length - 1]; if (last && last.name === g && last.items.length < 3) last.items.push(it); else groups.push({ name: last && last.name === g ? '' : g, items: [it] }); });
    const cols = groups.length, PW = cols > 2 ? 470 : 600, PH = 120, b = pillBox(PW, PH);
    const colW = b.w + 40, x0 = (W - colW * cols + 40) / 2;
    const buttons = [] as ReturnType<typeof button>[];
    let bi = 0;
    groups.forEach((g, gi) => {
      const x = x0 + gi * colW;
      if (g.name) {
        // Signpost: plank + post.
        const sign = g.name === 'Audio' ? 'Sound' : g.name === 'Subtitles' ? 'Words' : g.name;
        art.push(T.rect(x + b.w / 2 - 10, 220, 20, 60, '#8A5A35', { stroke: LINE, strokeWidth: 4 }));
        art.push(T.rect(x + b.w / 2 - 150, 156, 300, 72, WOOD, { stroke: LINE, strokeWidth: 6, rx: 14, label: 'Signpost' }));
        art.push(txt(x + b.w / 2 - 150, 164, 300, sign, 44, ROUND, LINE, { weight: 600, align: 'center' }));
      }
      g.items.forEach((it, k) => { const c = BADGES[bi++ % BADGES.length]; buttons.push(button(it, x, 252 + k * b.h, b.w, b.h, s => pill(it, PW, PH, c, s, 44))); });
    });
    if (back) { const bb = pillBox(300, 124); buttons.push(button(back, 96, 1026 - bb.h, bb.w, bb.h, s => pill(back, 300, 124, BADGES[0], s))); }
    void ctx;
    return { art, buttons };
  },

  popup(ctx, items) {
    // A little hill along the bottom; number bubbles sit on its crest. The picture stays clear above.
    const chapters = items.filter(i => i.index != null);
    const resume = items.find(i => i.role === 'primary'), home = items.find(i => i.role === 'back');
    const BR = 14;
    const ordered = [resume, ...chapters, home].filter(Boolean) as Item[];
    // Resume (play) and Home (house) are picture bubbles: no reading needed.
    const dia = (it: Item) => (it.role === 'primary' ? 140 : 120);
    const widths = ordered.map(it => dia(it) + BR * 2);
    const total = widths.reduce((a, b) => a + b, 0), gap = Math.max(4, Math.min(24, (1728 - total) / Math.max(1, ordered.length - 1)));
    let x = (W - (total + gap * (ordered.length - 1))) / 2;
    const crest = (px: number) => 990 + 12 * Math.sin(px / 150);
    const art: O[] = [T.path(0, 0, W, 1080, hillPath(px => crest(px) - 6 + 8, 1080), HILL_NEAR, { origin: ABS, stroke: LINE, strokeWidth: 6, label: 'Pop-up hill' })];
    const buttons = ordered.map((it, i) => {
      const w = widths[i], bx = x; x += w + gap;
      const ground = crest(bx + w / 2);
      const BD = dia(it);
      const h = BR + LIFT + BD + 16;
      return button(it, bx, ground - (BR + LIFT + BD), w, h, s => {
        const on = s !== 'normal', act = s === 'activated', cy = (on && !act ? BR : BR + LIFT) + BD / 2;
        const out: O[] = [T.ellipse(BR + 10, BR + LIFT + BD - 10, BD - 20, 22, CEL, { opacity: on && !act ? 0.3 : 0.55 })];
        if (on) out.push(T.circle(w / 2, cy, BD / 2 + 10, 'none', { stroke: SUN, strokeWidth: 10, label: 'Sun ring' }));
        out.push(T.circle(w / 2, cy + 6, BD / 2, LINE));
        const base = it.role === 'primary' ? BADGES[3] : it.role === 'back' ? BADGES[0] : BADGES[(it.index! - 1) % BADGES.length];
        out.push(T.circle(w / 2, cy, BD / 2, act ? SUN : on ? SUN_PALE : base, { stroke: LINE, strokeWidth: 6, label: 'Bubble' }));
        if (it.index == null) out.push(...icon(it.role === 'primary' ? 'play' : 'home', w / 2 - BD * 0.36, cy - BD * 0.36, BD * 0.72, on ? LINE : CREAM));
        else out.push(txt(0, cy - 60 * 0.62, w, String(it.index), 60, ROUND, on ? LINE : CREAM, { weight: 700, align: 'center' }));
        return out;
      });
    });
    void ctx;
    return { art, buttons };
  },

  motion: () => ({
    // Rubber-hose: the sky keeps time — clouds bob along on slow sine drifts.
    layers: [
      { art: cloud(0, 0, 1), w: 360, h: 150, from: [520, 300], to: [900, 280], periodSec: 38, ease: 'sine' },
      { art: cloud(0, 0, 0.7), w: 260, h: 110, from: [1500, 120], to: [1180, 140], periodSec: 30, ease: 'sine' },
      { art: cloud(0, 0, 0.85), w: 310, h: 130, from: [1720, 400], to: [1440, 380], periodSec: 44, ease: 'sine' },
    ],
    note: 'Buttons hop on twos with overshoot (Rubber-hose) and hold the pose (Bold-Flat); clouds drift behind the hills.',
  }),
};

/** Flat cartoon cloud with an outline and a cel shade. */
function cloud(x: number, y: number, k: number): O[] {
  const puffs: Array<[number, number, number]> = [[70, 95, 48], [140, 70, 62], [220, 82, 54], [285, 100, 42]];
  const out: O[] = [];
  puffs.forEach(([px, py, r]) => out.push(T.circle(x + px * k, y + py * k, r * k + 3, LINE)));
  out.push(T.rect(x + 60 * k, y + 95 * k, 230 * k, 47 * k, LINE, { rx: 22 * k }));
  puffs.forEach(([px, py, r]) => out.push(T.circle(x + px * k, y + py * k, r * k - 3, '#FFFFFF')));
  out.push(T.rect(x + 63 * k, y + 98 * k, 224 * k, 40 * k, '#FFFFFF', { rx: 20 * k }));
  out.push(T.rect(x + 70 * k, y + 120 * k, 210 * k, 16 * k, '#DDEFF8', { rx: 8 * k, label: 'Cloud shade' }));
  return out;
}

/** Picture-book page tile around a chapter still. Corners are rounded by painting sky spandrels. */
function tile(it: Item, BW: number, BH: number, s: State, color: string): O[] {
  const on = s !== 'normal', act = s === 'activated';
  const M = 14, lift = on && !act ? 0 : 14;
  const tx = M, ty = M + lift, tw = BW - 2 * M, th = BH - 2 * M - 14;
  const wx = tx + 16, wy = ty + 16, ww = tw - 32, wh = th - 16 - 58;
  const paper = act ? SUN : on ? SUN_PALE : CREAM;
  const out: O[] = [
    // Hide the still everywhere except the window: sky outside the tile, paper inside it.
    T.rect(0, 0, BW, ty, SKY), T.rect(0, ty + th, BW, BH - ty - th, SKY), T.rect(0, ty, tx, th, SKY), T.rect(tx + tw, ty, BW - tx - tw, th, SKY),
    T.rect(tx, ty, tw, wy - ty, paper), T.rect(tx, wy + wh, tw, ty + th - wy - wh, paper), T.rect(tx, wy, wx - tx, wh, paper), T.rect(wx + ww, wy, tx + tw - wx - ww, wh, paper),
  ];
  const R = 26, SP = 'M0 0 L100 0 C44.8 0 0 44.8 0 100 Z';
  [[tx, ty, 0], [tx + tw - R, ty, 90], [tx + tw - R, ty + th - R, 180], [tx, ty + th - R, 270]].forEach(([x, y, r]) => out.push(T.path(x, y, R, R, SP, SKY, { rotation: r, label: 'Corner' })));
  if (lift) out.push(T.rect(tx + 4, ty + th - 2, tw - 8, 10, CEL, { opacity: 0.3, rx: 5, label: 'Cel shadow' }));
  out.push(T.rect(tx, ty, tw, th, 'none', { stroke: LINE, strokeWidth: on ? 8 : 6, rx: R, label: 'Tile outline' }));
  out.push(T.rect(wx, wy, ww, wh, 'none', { stroke: LINE, strokeWidth: 4, rx: 6, label: 'Window' }));
  if (on) out.push(T.rect(tx - 9, ty - 9, tw + 18, th + 18, 'none', { stroke: SUN, strokeWidth: 8, rx: R + 9, label: 'Sun ring' }));
  out.push(T.circle(wx + 30, wy + 30, 30, color, { stroke: LINE, strokeWidth: 5, label: 'Number badge' }));
  out.push(txt(wx, wy + 30 - 40 * 0.62, 60, String(it.index), 40, ROUND, CREAM, { weight: 700, align: 'center' }));
  const label = it.label.length > 22 ? it.label.slice(0, 21) + '…' : it.label;
  out.push(txt(tx + 16, wy + wh + 10, tw - 32, label, 36, ROUND, LINE, { weight: 600, align: 'center' }));
  return out;
}
