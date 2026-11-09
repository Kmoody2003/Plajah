// Stage Rig — Concert.
// Animation lead: The Visual Music Abstractionist (24 fps on ones, ease-in-out; form choreographed like
// a score — the beam layers run in 2:3 polyrhythm). Graphic designer: The Psychedelic Colourist
// (saturated gel colour, liquid lettering, xerox and gaffer tape). Lighting director: a truss of PAR
// cans across the top throwing coloured beams into haze; a hard white follow-spot on the selection;
// the beams sweep on a slow chase.
// Structure: the menu is a handwritten setlist taped to the stage floor at an angle. Each item is a
// line in marker; the follow-spot's hard pool lands on the selected line. Scenes are instant-photo
// polaroids taped to the backline; lists are a second taped sheet; the pop-up is the setlist taped at
// the stage edge (bottom-left), clear of the picture.
import { button as kitButton, glow, linear, txt, T, W, H, type Ctx, type Design, type Item, type O, type State } from './kit';

/** Every button state carries an invisible gradient so its SVG has a <defs>: the font embedder
 *  (services/fabula/broadcastFontEmbed) only injects @font-face into an existing <defs>. */
const FONT_DEFS = () => T.rect(0, 0, 2, 2, '#000000', { opacity: 0, gradient: linear(0, [['#000000', 0, 0], ['#000000', 1, 0]]), label: 'defs' });
const button: typeof kitButton = (item, x, y, w, h, draw, nav) => kitButton(item, x, y, w, h, s => [FONT_DEFS(), ...draw(s)], nav);

const FLOOR = '#0A090E', PAPER = '#ABA597', PAPER_LIT = '#FFFDF5', MARKER = '#141216', RED = '#E5302C';
const TAPE = '#5D6068', TAPE_LIT = '#9A9EA6', TRUSS = '#8D929B', TRUSS_DK = '#4A4E56', AMBER = '#FFB42E', STENCIL = '#D8D3C7';
const GELS = ['#FF2E9A', '#21D4FD', '#FFB42E', '#8C4BFF', '#B6FF3B', '#FF5A36', '#21D4FD', '#FF2E9A', '#FFB42E', '#8C4BFF'];
const HAND = 'permanentMarker', POSTER = 'righteous', STEN = 'staatliches';

const P = (x: number, y: number, w: number, h: number, d: string, fill: string, o: T.ShapeOpts = {}) => T.path(x, y, w, h, d, fill, { ...o, origin: { x: 0, y: 0, w, h } });
const est = (s: string, size: number, k = 0.62) => s.length * size * k;
const fit = (s: string, maxW: number, size: number, k = 0.62) => {
  if (est(s, size, k) <= maxW) return s;
  let t = s; while (t.length > 3 && est(t + '…', size, k) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
};
const rad = (d: number) => (d * Math.PI) / 180;
/** Point on a rotated sheet: local (u, v) from the sheet centre → plane. */
const onSheet = (cx: number, cy: number, deg: number, u: number, v: number): [number, number] => {
  const a = rad(deg); return [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
};

/** A strip of gaffer tape with torn ends, centred at (cx, cy). */
function tape(cx: number, cy: number, w: number, h: number, deg: number, fill = TAPE, opacity = 0.92): O {
  const d = `M0 3 L${w * 0.25} 0 L${w * 0.5} 4 L${w * 0.75} 0 L${w} 3 L${w - 5} ${h * 0.5} L${w} ${h - 3} L${w * 0.7} ${h} L${w * 0.4} ${h - 4} L${w * 0.15} ${h} L0 ${h - 2} L6 ${h * 0.5} Z`;
  return P(cx - w / 2, cy - h / 2, w, h, d, fill, { rotation: deg, opacity, label: 'Gaffer tape' });
}

/** The truss: two chords and a zig-zag lattice, with PAR cans hanging under it. */
function truss(y = 64, cans = 9, beams = true): O[] {
  const out: O[] = [];
  const x0 = 60, x1 = W - 60;
  if (beams) for (let i = 0; i < cans; i++) {
    const cx = x0 + 70 + (i * (x1 - x0 - 140)) / (cans - 1), g = GELS[i % GELS.length];
    const lean = (i - (cans - 1) / 2) * 34, len = 980;
    out.push(P(cx - 380 + lean, y + 96, 760, len, `M370 0 L390 0 L${760} ${len} L0 ${len} Z`, g, { gradient: linear(90, [[g, 0, 0.34], [g, 0.55, 0.08], [g, 1, 0]]), label: 'Beam' }));
  }
  out.push(T.rect(x0, y, x1 - x0, 7, TRUSS, { label: 'Truss chord' }), T.rect(x0, y + 46, x1 - x0, 7, TRUSS, { label: 'Truss chord' }));
  for (let x = x0; x < x1 - 40; x += 46) out.push(T.line(x, y + 4, x + 46, y + 50, TRUSS_DK, 4), T.line(x + 46, y + 4, x + 46, y + 50, TRUSS_DK, 3));
  for (let i = 0; i < cans; i++) {
    const cx = x0 + 70 + (i * (x1 - x0 - 140)) / (cans - 1), g = GELS[i % GELS.length];
    const lean = (i - (cans - 1) / 2) * 3;
    out.push(T.rect(cx - 3, y + 50, 6, 16, TRUSS_DK));
    out.push(T.rect(cx - 30, y + 62, 60, 40, '#1C1D22', { rx: 6, rotation: lean, stroke: '#30323A', strokeWidth: 2, label: 'PAR can' }));
    out.push(glow(cx, y + 104, 70, 34, g, 0.75, 'Lens bloom'), T.ellipse(cx - 24, y + 96, 48, 14, g, { label: 'Lens' }), T.ellipse(cx - 12, y + 99, 24, 6, '#FFFFFF', { opacity: 0.8 }));
  }
  return out;
}

/** Stage floor + haze + black masking, under everything. */
function stage(veil: number): O[] {
  return [
    T.rect(0, 0, W, H, FLOOR, { gradient: linear(90, [[FLOOR, 0, veil], [FLOOR, 0.45, veil * 0.55], [FLOOR, 0.62, 0.86], [FLOOR, 1, 0.97]]), label: 'Stage dark' }),
    ...[0.66, 0.74, 0.84, 0.97].map(f => T.rect(0, H * f, W, 2, '#2A2730', { opacity: 0.8, label: 'Floor seam' })),
    glow(960, 300, 1100, 260, '#C9B8FF', 0.07, 'Haze'),
  ];
}

/** A sheet of setlist paper, rotated, with tape at its corners. Lit dimly by the stage wash. */
function sheet(cx: number, cy: number, w: number, h: number, deg: number): O[] {
  const out: O[] = [
    T.rect(cx - w / 2 + 14, cy - h / 2 + 18, w, h, '#000', { rotation: deg, opacity: 0.55, label: 'Sheet shadow' }),
    T.rect(cx - w / 2, cy - h / 2, w, h, PAPER, { rotation: deg, label: 'Setlist paper' }),
    T.rect(cx - w / 2, cy - h / 2, w, h, '#000', { rotation: deg, gradient: linear(0, [['#000', 0, 0], ['#000', 1, 0.18]]), label: 'Paper shade' }),
  ];
  const corner = (u: number, v: number, rot: number) => { const [x, y] = onSheet(cx, cy, deg, u, v); out.push(tape(x, y, 130, 40, deg + rot)); };
  corner(-w / 2 + 10, -h / 2 + 8, -38); corner(w / 2 - 10, -h / 2 + 8, 38); corner(-w / 2 + 10, h / 2 - 8, 38); corner(w / 2 - 10, h / 2 - 8, -38);
  return out;
}

/**
 * One line of the setlist, written in marker on the tilted sheet. The button box is axis-aligned;
 * the writing and the follow-spot pool inside it carry the sheet's tilt.
 * Selected: a hard-edged white follow-spot pool lands on the line; a red marker arrow points at it.
 */
function setLine(text: string, w: number, h: number, deg: number, s: State, o: { size?: number; meta?: string } = {}): O[] {
  const on = s !== 'normal', act = s === 'activated', size = o.size ?? 40;
  const out: O[] = [];
  if (on) {
    out.push(T.ellipse(6, 3, w - 12, h - 6, act ? AMBER : PAPER_LIT, { rotation: deg, opacity: 0.96, stroke: '#FFFFFF', strokeWidth: 3, label: 'Follow-spot pool' }));
    out.push(P(18, h / 2 - 14, 40, 28, 'M0 14 L26 14 M16 2 L30 14 L16 26', 'none', { stroke: RED, strokeWidth: 6, rotation: deg, label: 'Marker arrow' }));
  }
  const metaW = o.meta ? 130 : 0;
  out.push(txt(64, h / 2 - size * 0.66, w - 90 - metaW, fit(text, w - 100 - metaW, size), size, HAND, MARKER, { rotation: deg }));
  if (o.meta) out.push(txt(w - 40 - metaW, h / 2 - 16, metaW, o.meta, 26, HAND, on ? RED : '#3B3840', { align: 'right', rotation: deg }));
  return out;
}

/** Lines of a sheet: the button boxes, following the sheet's tilt down its middle. */
function linesOn(cx: number, cy: number, deg: number, sheetH: number, startV: number, pitch: number, n: number, bw: number, bh: number, u = 0) {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = onSheet(cx, cy, deg, u, -sheetH / 2 + startV + i * pitch);
    return { x: Math.round(x - bw / 2), y: Math.round(y - bh / 2) };
  });
}

const SONG = (it: Item, n: number) => (it.role === 'back' ? `← ${it.label.toUpperCase()}` : `${n}. ${it.label.toUpperCase()}`);

export const stageRig: Design = {
  id: 'concert',
  background: ctx => (ctx.main ? { kind: 'title', value: '#1A1424', titleId: ctx.main.id, fromSec: Math.min(1200, ctx.main.source.durationSec * 0.5), loopSec: 16 } : { kind: 'color', value: FLOOR }),
  subBackground: () => ({ kind: 'color', value: FLOOR }),

  main(ctx, items) {
    const CX = 1290, CY = 640, SW = 620, SHT = Math.min(660, Math.max(470, 250 + items.length * 96)), DEG = -5;
    const art: O[] = [...stage(0.25), ...truss(64, 9, true)];
    // Gig-poster lettering: the show's name in liquid gel colour, stencil strap-line under it.
    const name = ctx.title.toUpperCase();
    const size = Math.max(72, Math.min(132, Math.floor(1300 / Math.max(6, name.length))));
    const title = T.text(150, 250, 720, name, { size, font: POSTER, color: '#FF2E9A', wrap: true, leading: 0.98, gradient: linear(90, [['#FF2E9A', 0], ['#FFB42E', 0.5], ['#21D4FD', 1]]), shadow: { x: 6, y: 6, blur: 0, color: '#2A0A3A' } });
    art.push(title);
    art.push(txt(156, T.below(title, 18), 700, 'LIVE  ·  ONE NIGHT ONLY', 34, STEN, STENCIL, { tracking: 0.2 }));
    art.push(txt(156, T.below(title, 64), 700, ctx.tagline.toUpperCase(), 28, STEN, '#8E8A9A', { tracking: 0.14 }));
    // The follow-spot fixture's throw, coming in from out front (top right), aimed at the setlist.
    art.push(P(1260, 150, 660, 420, 'M600 0 L660 0 L300 420 L0 420 Z', '#FFFFFF', { gradient: linear(90, [['#FFFFFF', 0, 0.0], ['#FFFFFF', 1, 0.07]]), label: 'Follow-spot throw' }));
    art.push(...sheet(CX, CY, SW, SHT, DEG));
    const [hx, hy] = onSheet(CX, CY, DEG, -SW / 2 + 60, -SHT / 2 + 54);
    art.push(txt(hx, hy - 4, 420, 'SETLIST', 46, HAND, RED, { rotation: DEG }));
    art.push(txt(hx + 260, hy + 4, 260, ctx.uhd ? '4K' : 'BLU-RAY', 28, HAND, '#3B3840', { rotation: DEG, align: 'right' }));
    const pitch = Math.min(96, Math.floor((SHT - 190) / Math.max(1, items.length))), bh = pitch - 6, bw = SW - 40;
    const pos = linesOn(CX, CY, DEG, SHT, 170 + pitch / 2, pitch, items.length, bw, bh);
    const buttons = items.map((it, i) => button(it, pos[i].x, pos[i].y, bw, bh, s => setLine(SONG(it, i + 1), bw, bh, DEG, s, { size: it.role === 'primary' ? 46 : 40 })));
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    // Polaroids taped to the backline: a loose, hand-placed grid.
    const art: O[] = [...stage(0.98), ...truss(64, 9, false),
      T.rect(0, 150, W, 760, '#15131B', { label: 'Backline' }),
      ...Array.from({ length: 12 }, (_, i) => T.rect(i * 168, 150, 2, 760, '#211E28')),
    ];
    art.push(txt(150, 170, 900, 'THE SETLIST', 52, HAND, RED, { rotation: -2 }));
    art.push(txt(150, 236, 900, ctx.title.toUpperCase(), 28, STEN, STENCIL, { tracking: 0.16 }));
    if (pages > 1) art.push(txt(1370, 186, 400, `SET ${page + 1} OF ${pages}`, 30, STEN, STENCIL, { align: 'right', tracking: 0.16 }));
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    const PW = 432, PH = 243, B = 14, BB = 60;
    const jitter = [[0, 12], [10, -10], [-8, 18], [14, 6], [-10, -6], [6, 14]];
    const tilt = [-3, 2, -1.5, 2.5, -2, 1.5];
    const buttons = chapters.map((it, i) => {
      const k = i % 3, r = Math.floor(i / 3);
      const x = 196 + k * 532 + jitter[i % 6][0], y = 300 + r * 316 + jitter[i % 6][1];
      // Tape holding each polaroid to the backline (in the page art, over the frame top).
      return { it, x, y, i };
    }).map(({ it, x, y, i }) => {
      art.push(T.rect(x + 10, y + 14, PW, PH, '#000', { opacity: 0.6 }));
      return button(it, x, y, PW, PH, s => {
        const on = s !== 'normal', act = s === 'activated';
        const frame = act ? AMBER : on ? PAPER_LIT : '#8C877C';
        const o: O[] = [
          T.rect(0, 0, PW, B, frame), T.rect(0, 0, B, PH, frame), T.rect(PW - B, 0, B, PH, frame), T.rect(0, PH - BB, PW, BB, frame),
          tape(PW / 2, 6, 120, 30, tilt[i % 6] * 2, on ? TAPE_LIT : TAPE, 0.95),
          txt(B + 8, PH - BB + 8, PW - 150, fit(`${it.index}. ${it.label.toUpperCase()}`, PW - 160, 28), 28, HAND, MARKER),
          txt(PW - 130, PH - BB + 14, 112, it.meta || '', 24, STEN, '#3B3840', { align: 'right', tracking: 0.06 }),
        ];
        if (on) o.push(T.ellipse(B, PH - BB + 4, 58, 50, 'none', { stroke: RED, strokeWidth: 4, rotation: -8, label: 'Marker ring' }));
        return o;
      });
    });
    // Gaffer-tape labels on the stage lip for Previous / Back / Next.
    nav.forEach((it, i) => {
      const w = 260, x = W / 2 - (nav.length * (w + 40)) / 2 + i * (w + 40) + 20;
      buttons.push(button(it, x, 948, w, 64, s => tapeLabel(it.label, w, 64, s)));
    });
    return { art, buttons };
  },

  list(ctx, heading, kind, items) {
    const back = items.find(i => i.role === 'back'), rows = items.filter(i => i.role !== 'back');
    const groups = new Set(rows.map(r => r.sub).filter(Boolean)).size;
    // A long run (a big box set) is written in two columns on a wider sheet.
    const cols = rows.length > 9 && !groups ? 2 : 1;
    const DEG = cols === 2 ? 2 : 3, CX = 960, CY = 606, SW = cols === 2 ? 1400 : 820;
    const per = Math.ceil(rows.length / cols);
    const lines = (cols === 2 ? per : rows.length + groups + Math.max(0, groups - 1) * 0.5) + (back ? 1.3 : 0);
    const SHT = Math.min(780, Math.round(190 + lines * 76));
    const pitch = Math.min(76, Math.floor((SHT - 175) / Math.max(1, lines)));
    const art: O[] = [...stage(0.98), ...truss(64, 9, false), ...sheet(CX, CY, SW, SHT, DEG)];
    const [hx, hy] = onSheet(CX, CY, DEG, -SW / 2 + 64, -SHT / 2 + 40);
    art.push(txt(hx, hy, 640, heading.toUpperCase(), 46, HAND, RED, { rotation: DEG }));
    const bw = SW / cols - 60, bh = pitch - 4, size = Math.max(28, Math.min(36, Math.round(bh * 0.62)));
    const buttons: ReturnType<typeof button>[] = [];
    const at = (k: number, col = 0) => linesOn(CX, CY, DEG, SHT, 150 + pitch / 2 + k * pitch, 0, 1, bw, bh, cols === 2 ? (col ? SW / 4 : -SW / 4) : 0)[0];
    if (cols === 2) {
      rows.forEach((it, i) => {
        const col = i < per ? 0 : 1, p = at(col ? i - per : i, col);
        buttons.push(button(it, p.x, p.y, bw, bh, s => setLine(`${it.index ?? i + 1}. ${it.label.toUpperCase()}`, bw, bh, DEG, s, { size, meta: it.meta?.toUpperCase() })));
      });
      if (back) { const p = at(per + 0.3); buttons.push(button(back, p.x, p.y, bw, bh, s => setLine(SONG(back, 0), bw, bh, DEG, s, { size }))); }
      return { art, buttons };
    }
    let line = 0, group = '', n = 0;
    for (const it of rows) {
      if (it.sub && it.sub !== group) {
        if (group) line += 0.5;
        group = it.sub;
        const [gx, gy] = onSheet(CX, CY, DEG, -SW / 2 + 70, -SHT / 2 + 150 + line * pitch + 6);
        art.push(txt(gx, gy, 400, `${group.toUpperCase()}:`, 30, HAND, '#3B3840', { rotation: DEG }));
        const [ux, uy] = onSheet(CX, CY, DEG, -SW / 2 + 70, -SHT / 2 + 150 + line * pitch + 48);
        art.push(T.rect(ux, uy, 200, 4, RED, { rotation: DEG }));
        line++;
      }
      n++;
      const p = at(line);
      buttons.push(button(it, p.x, p.y, bw, bh, s => setLine(it.sub ? it.label.toUpperCase() : `${it.index ?? n}. ${it.label.toUpperCase()}`, bw, bh, DEG, s, { size, meta: it.meta?.toUpperCase() })));
      line++;
    }
    if (back) { const p = at(line + 0.3); buttons.push(button(back, p.x, p.y, bw, bh, s => setLine(SONG(back, 0), bw, bh, DEG, s, { size }))); }
    return { art, buttons };
  },

  popup(ctx, items) {
    // The setlist taped at the stage edge, bottom-left; the picture centre stays clear.
    const DEG = -3, CX = 330, CY = 690, SW = 460;
    const SHT = Math.min(640, 110 + items.length * 52);
    const art: O[] = [
      T.rect(0, 0, 760, H, '#000', { gradient: linear(0, [['#000', 0, 0.6], ['#000', 1, 0]]), label: 'Edge shade' }),
      ...sheet(CX, CY, SW, SHT, DEG),
    ];
    const [hx, hy] = onSheet(CX, CY, DEG, -SW / 2 + 40, -SHT / 2 + 22);
    art.push(txt(hx, hy, 380, fit(ctx.title.toUpperCase(), 360, 30), 30, HAND, RED, { rotation: DEG }));
    const pitch = Math.min(54, Math.floor((SHT - 90) / items.length)), bw = SW - 30, bh = pitch - 2;
    const pos = linesOn(CX, CY, DEG, SHT, 84 + pitch / 2, pitch, items.length, bw, bh);
    const buttons = items.map((it, i) => button(it, pos[i].x, pos[i].y, bw, bh, s => setLine(it.index != null ? `${it.index}. ${it.label.toUpperCase()}` : it.role === 'primary' ? `▶ ${it.label.toUpperCase()}` : `← ${it.label.toUpperCase()}`, bw, bh, DEG, s, { size: 28 })));
    return { art, buttons };
  },

  motion: () => ({
    // Visual music: two beam choruses in 2:3 (8 s against 12 s), a slow haze roll, a beat-rate flicker.
    layers: [
      { art: beamFan(['#FF2E9A', '#21D4FD', '#FFB42E'], 0), w: 1400, h: 960, from: [-180, 100], to: [420, 100], periodSec: 8, ease: 'sine', opacity: 0.55, blend: 'screen' },
      { art: beamFan(['#8C4BFF', '#B6FF3B', '#FF5A36'], 1), w: 1400, h: 960, from: [700, 100], to: [80, 100], periodSec: 12, ease: 'sine', opacity: 0.45, blend: 'screen' },
      { art: [glow(700, 200, 700, 200, '#B9A8FF', 0.12, 'Haze roll')], w: 1400, h: 400, from: [-200, 420], to: [700, 380], periodSec: 24, ease: 'sine', blend: 'screen' },
    ],
    flicker: { amount: 0.06, hz: 2 },
    grain: 14,
    note: 'Beams chase in 2:3 polyrhythm (8 s / 12 s) under a 24 fps on-ones follow-spot snap; flicker sits on the 120 bpm beat.',
  }),
};

/** A fan of coloured beams from the truss line, for the chase layers. */
function beamFan(cols: string[], seed: number): O[] {
  return cols.map((c, i) => {
    const top = 260 + i * 380, spread = seed ? -220 + i * 120 : 180 - i * 140;
    return P(0, 0, 1400, 960, `M${top} 0 L${top + 24} 0 L${top + 200 + spread} 960 L${top - 200 + spread} 960 Z`, c, { gradient: linear(90, [[c, 0, 0.5], [c, 0.6, 0.12], [c, 1, 0]]), label: 'Chase beam' });
  });
}

/** A gaffer-tape label with marker writing (nav on the scenes page). */
function tapeLabel(label: string, w: number, h: number, s: State): O[] {
  const on = s !== 'normal', act = s === 'activated';
  const o: O[] = [];
  if (on) o.push(T.ellipse(-0, 0, w, h, act ? AMBER : PAPER_LIT, { opacity: 0.25 }));
  o.push(tape(w / 2, h / 2, w - 16, h - 12, -1.5, act ? AMBER : on ? PAPER_LIT : TAPE, 1));
  o.push(txt(8, h / 2 - 20, w - 16, label.toUpperCase(), 30, HAND, on ? MARKER : STENCIL, { align: 'center', rotation: -1.5 }));
  return o;
}
