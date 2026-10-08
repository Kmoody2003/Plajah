// themesUrban — twelve urban / gritty / youthful languages, joyful and
// church-appropriate (no brand marks, no gang or offensive imagery).
//   the Rebellious Hand         — Xerox Zine, Spray & Stencil, Wheat-Paste Wall,
//                                 Tape & Torn Paper, Chalk & Marker, Sticker Bomb, Halftone Copy
//   the Futurist                — VHS Glitch, Neon on Brick, Night City
//   the World-Eclectic Traveler — Concrete & Rust, Two-Ink Misprint
// Grit lives on the ground at low strength, in the margins, or on ornaments;
// where texture is busy the words sit on paper, plate or board.
import { rect, circle, line, path } from '../../tela/templateKit';
import type { Lay } from './layout';
import type { SlideObj, SlideTheme, ThemeMotif, ThemePalette } from './types';
import {
  amb, gnd, glowAt, pathPx, strokePx, grain, halftone, bands, brick, dCircle, dRect, dPoly, dLine,
  tornRectD, wobbleRectD, wobbleLineD, tapeD, sq, pad2, plain, alpha, orn,
} from './motifKit';

const sw = (L: Lay, k: number) => Math.max(1, L.u * k);
const inset = (L: Lay, k = .028) => Math.max(6, Math.min(L.W, L.H) * k);
const glowShadow = (o: SlideObj, color: string, blur: number): SlideObj => { o.shadow = { x: 0, y: 0, blur, color }; return o; };
/** A strip of tape (silver / coloured) centred at (cx, cy), rotated. */
function tape(cx: number, cy: number, w: number, h: number, color: string, rot: number, seed: number, label = 'Tape'): SlideObj {
  return pathPx(cx - w / 2, cy - h / 2, w, h, tapeD(cx - w / 2, cy - h / 2, w, h, seed), color, { rotation: rot, label });
}

// ── 25. Xerox Zine — the Rebellious Hand ────────────────────────────────────
// Photocopied at the library at midnight: toner speckle, copier-lid shadow,
// staples, a red marker circle, typewriter body. Skews on; shoved off.
const ZN: ThemePalette = { ground: '#ECEBE6', ground2: '#DFDED8', ink: '#111111', muted: '#454545', accent: '#D7002A', accent2: '#111111', accent3: '#FFE14D', panel: '#111111', panelInk: '#ECEBE6', panelMuted: '#BDBCB6', markerInk: '#ECEBE6' };
const zineMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H } = L, e = Math.max(L.safe.x * .55, W * .025);
    const lid = (x: number, angle: number) => rect(x, 0, e, H, ZN.ink, { gradient: { kind: 'LINEAR', angle, stops: [{ offset: 0, color: ZN.ink, opacity: .22 }, { offset: 1, color: ZN.ink, opacity: 0 }] }, label: 'Copier shadow' });
    return [
      gnd(rect(0, 0, W, H, ZN.ground), 'Copy paper'),
      gnd(lid(0, 0)), gnd(lid(W - e, 180)),
      grain(L, seed + 1, ZN.ink, 320, .16, .9, 'Toner speck'),
      gnd(amb(grain(L, seed + 9, ZN.ink, 50, .35, 1.4, 'Toner flecks'), { kind: 'jitter', ax: L.u * .15, ay: L.u * .1, step: .45 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 14), h = u * .9, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: h * 1.3, objs: [pathPx(x0, y, dw, h, tornRectD(x0, y, dw, h, 7, h * .35, 'lr'), ZN.ink, { rotation: -1.5, label: 'Cut strip' }), rect(x0 + dw * .7, y + h * .2, dw * .3, h * .6, ZN.accent, { rotation: -1.5, label: 'Red strip' })] };
  },
  frame(L) {
    const { W, u } = L, i = inset(L, .03), st = u * 2.2;
    return [
      rect(i + u * 2, i, st, u * .35, '#7A7A7A', { label: 'Staple' }), rect(W - i - u * 2 - st, i, st, u * .35, '#7A7A7A', { label: 'Staple' }),
      amb(tape(W / 2, i + u * .3, u * 9, u * 1.8, alpha(ZN.accent3, .8), -3, 4), { kind: 'sway', deg: 1.5, period: 5 }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), bx = cx - s * .38, by = cy - s * .36, bw = s * .76, bh = s * .7;
    return [
      pathPx(bx, by, bw, bh, tornRectD(bx, by, bw, bh, seed + 2, s * .025), '#FFFFFF', { rotation: -3, label: 'Copy sheet' }),
      halftone(bx + s * .05, by + s * .05, bw - s * .1, bh - s * .1, s * .03, ZN.ink, { grade: 'radial', rMin: s * .014, rMax: s * .002, label: 'Photocopied photo', max: 900 }),
      strokePx(cx - s * .3, cy - s * .3, s * .6, s * .6, `M${cx + s * .26} ${cy - s * .05}C${cx + s * .3} ${cy - s * .32} ${cx - s * .3} ${cy - s * .32} ${cx - s * .28} ${cy}C${cx - s * .26} ${cy + s * .28} ${cx + s * .28} ${cy + s * .3} ${cx + s * .24} ${cy - s * .12}`, ZN.accent, sw(L, .5), { label: 'Marker circle' }),
      amb(tape(bx + s * .04, by + s * .02, s * .26, s * .07, alpha(ZN.accent3, .85), -30, seed), { kind: 'sway', deg: 2, period: 4 }),
      amb(tape(bx + bw - s * .04, by + bh - s * .02, s * .26, s * .07, alpha(ZN.accent3, .85), -28, seed + 3), { kind: 'sway', deg: 2, period: 4.6, phase: .4 }),
    ];
  },
  marker(cx, cy, r) { return [pathPx(cx - r, cy - r, r * 2, r * 2, wobbleRectD(cx - r, cy - r, r * 2, r * 2, Math.round(cx), r * .2), ZN.ink, { label: 'Cut square' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, ZN.panel, { rotation: -.4, label: 'Panel' }), tape(x + w * .5, y, L.u * 7, L.u * 1.5, alpha(ZN.accent3, .85), 2, 9, 'Panel tape')]; },
  numeral: pad2,
};

// ── 26. Spray & Stencil — the Rebellious Hand ───────────────────────────────
// A legal wall on a sunny Saturday: charcoal render, pastel overspray, stencil
// bridges and paint drips. Sprayed on in one pass.
const ST: ThemePalette = { ground: '#2A2B2E', ground2: '#34353A', ink: '#F4F4F0', muted: '#C4C4BC', accent: '#53E0B5', accent2: '#FF5FA2', accent3: '#FFD23F', panel: '#F4F4F0', panelInk: '#2A2B2E', panelMuted: '#55565C', markerInk: '#2A2B2E' };
function drips(x: number, y: number, w: number, n: number, len: number, color: string, seed: number): SlideObj {
  const r = orn.rng(seed); let d = '';
  for (let i = 0; i < n; i++) { const dx = x + r() * w, l = len * (.3 + r() * .7), t = len * .05; d += dRect(dx - t / 2, y, t, l) + dCircle(dx, y + l, t * .9); }
  return pathPx(x - len * .1, y, w + len * .2, len * 1.1, d, color, { label: 'Paint drips' });
}
const stencilMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, m = Math.max(W, H);
    return [
      gnd(rect(0, 0, W, H, ST.ground), 'Charcoal render'),
      grain(L, seed + 2, '#FFFFFF', 200, .06, 1, 'Render grit'),
      gnd(amb(glowAt(W * .06, H * .1, m * .2, m * .16, ST.accent2, .32, 'Pink overspray'), { kind: 'pulse', min: .75, max: 1, period: 6 })),
      gnd(amb(glowAt(W * .96, H * .92, m * .22, m * .18, ST.accent, .3, 'Mint overspray'), { kind: 'pulse', min: .75, max: 1, period: 7, phase: .5 })),
      gnd(drips(W * .9, 0, W * .08, 5, u * 7, alpha(ST.accent3, .55), seed)),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 15), t = u * .7, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t * 1.6, objs: [
      rect(x0, y, dw, t, ST.accent, { rx: t / 2, gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: ST.accent, opacity: .2 }, { offset: .12, color: ST.accent }, { offset: .88, color: ST.accent }, { offset: 1, color: ST.accent, opacity: .2 }] }, label: 'Spray line' }),
      halftone(x0, y + t, dw, t * .6, u * .5, alpha(ST.accent, .5), { rMin: u * .06, rMax: u * .06, label: 'Overspray' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, s = u * 3, i = inset(L);
    // Stencil corner marks: square brackets broken by bridges.
    const br = (x: number, y: number, fx: number, fy: number) => dRect(x, y, fx * s * .4, fy * u * .5) + dRect(x + fx * s * .55, y, fx * s * .45, fy * u * .5) + dRect(x, y, fx * u * .5, fy * s * .4) + dRect(x, y + fy * s * .55, fx * u * .5, fy * s * .45);
    return [pathPx(0, 0, W, H, br(i, i, 1, 1) + br(W - i, i, -1, 1) + br(i, H - i, 1, -1) + br(W - i, H - i, -1, -1), alpha(ST.accent3, .9), { label: 'Stencil corners' })];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), R = s * .3, gap = s * .03;
    // A stencil sun: ring segments with bridges, a star cut in the middle, drips.
    let ring = '';
    for (let k = 0; k < 4; k++) { const a0 = k * 90 + 6, a1 = k * 90 + 84, p = (r: number, a: number) => `${(cx + r * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(cy + r * Math.sin(a * Math.PI / 180)).toFixed(1)}`; ring += `M${p(R, a0)}A${R} ${R} 0 0 1 ${p(R, a1)}L${p(R * .78, a1)}A${R * .78} ${R * .78} 0 0 0 ${p(R * .78, a0)}Z`; }
    return [
      glowAt(cx, cy, s * .46, s * .46, ST.accent2, .35, 'Overspray halo'),
      pathPx(cx - R, cy - R, R * 2, R * 2, ring, ST.accent2, { label: 'Stencil ring' }),
      amb(path(cx - R * .55, cy - R * .55, R * 1.1, R * 1.1, orn.starPath(5, .45), ST.accent3, { label: 'Stencil star' }), { kind: 'pulse', min: .8, max: 1, period: 3 }),
      ...orn.radialLines(cx, cy, R * 1.15, R * 1.5 - gap, 12, alpha(ST.accent, .9), sw(L, .5), { label: 'Spray ray' }) as SlideObj[],
      drips(cx - R * .8, cy + R * .7, R * 1.6, 6, s * .2, alpha(ST.accent2, .8), seed + 1),
    ];
  },
  marker(cx, cy, r) { return [glowAt(cx, cy, r * 1.5, r * 1.5, ST.accent, .4, 'Spray halo'), circle(cx, cy, r, ST.accent, { label: 'Spray dot' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, ST.panel, { label: 'Panel' }), drips(x + w * .1, y + h, w * .8, 6, L.u * 2.4, alpha(ST.panel, .9), 33)]; },
  numeral: plain,
};

// ── 27. Wheat-Paste Wall — the Rebellious Hand ──────────────────────────────
// A fresh poster pasted over old ones: torn scraps at the edges, paste
// wrinkles, condensed gothic headlines. Slapped on; peeled away.
const WP: ThemePalette = { ground: '#F1E9D6', ground2: '#E6DCC4', ink: '#1E1B18', muted: '#4D463E', accent: '#C81F35', accent2: '#1B998B', accent3: '#F46036', panel: '#1E1B18', panelInk: '#F1E9D6', panelMuted: '#C9BFA9', markerInk: '#F1E9D6' };
const pasteMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, r = orn.rng(seed + 4), e = Math.max(L.safe.x * .5, u * 2.4);
    const out: SlideObj[] = [gnd(rect(0, 0, W, H, '#3B3A3F'), 'Wall')];
    // Old scraps peeking round the edges.
    const cols = [WP.accent2, WP.accent3, '#E7D7B0', WP.accent, '#9DB4C0'];
    for (let i = 0; i < 6; i++) {
      const left = i % 2 === 0, sx = left ? -u * 2 : W - e * 1.6, sy = r() * H * .85, sw2 = e * 1.6 + u * 2, sh = H * (.12 + r() * .2);
      out.push(gnd(i < 2 ? amb(pathPx(sx, sy, sw2, sh, tornRectD(sx, sy, sw2, sh, seed + i, u * 1.2), cols[i % cols.length], { label: 'Old poster scrap' }), { kind: 'sway', deg: .8, period: 4 + i }) : pathPx(sx, sy, sw2, sh, tornRectD(sx, sy, sw2, sh, seed + i, u * 1.2), cols[i % cols.length], { label: 'Old poster scrap' })));
    }
    // The fresh sheet, wrinkled with paste.
    out.push(gnd(pathPx(e, u * 1.2, W - e * 2, H - u * 2.4, tornRectD(e, u * 1.2, W - e * 2, H - u * 2.4, seed + 9, u * .9), WP.ground, { label: 'Fresh poster' })));
    let wr = ''; for (let k = 0; k < 7; k++) { const x0 = e + r() * (W - e * 2), y0 = r() * H; wr += wobbleLineD(x0, y0, x0 + (r() - .5) * W * .3, y0 + (r() - .3) * H * .2, seed + k, u * .6, 6); }
    out.push(gnd(strokePx(0, 0, W, H, wr, alpha(WP.ink, .07), sw(L, .25), { label: 'Paste wrinkles' })));
    out.push(grain(L, seed + 2, WP.ink, 160, .07, .8, 'Paper fibre'));
    return out;
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 16), t = u * .8, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t, objs: [rect(x0, y, dw * .62, t, WP.accent, { label: 'Print bar' }), rect(x0 + dw * .66, y, dw * .34, t, WP.ink, { label: 'Print bar' })] };
  },
  frame(L) {
    const { W, H, u } = L, e = Math.max(L.safe.x * .5, u * 2.4), c = u * 4;
    // Peeling corner: a triangle of wall + the curled back of the sheet.
    return [
      pathPx(W - e - c, H - u * 1.2 - c, c, c, dPoly([W - e, H - u * 1.2 - c, W - e, H - u * 1.2, W - e - c, H - u * 1.2]), '#3B3A3F', { label: 'Peel gap' }),
      amb(pathPx(W - e - c, H - u * 1.2 - c, c, c, dPoly([W - e, H - u * 1.2 - c, W - e - c, H - u * 1.2, W - e - c * .9, H - u * 1.2 - c * .9]), '#D9CCAE', { label: 'Peel curl' }), { kind: 'sway', deg: 2, period: 3.4 }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h);
    return [
      rect(cx - s * .42, cy - s * .44, s * .84, s * .88, WP.accent3, { rotation: 2, label: 'Poster block' }),
      halftone(cx - s * .42, cy - s * .44, s * .84, s * .88, s * .045, alpha(WP.accent, .9), { grade: '-y', rMin: s * .002, rMax: s * .02, label: 'Print screen', max: 800 }),
      path(cx - s * .3, cy - s * .32, s * .6, s * .6, orn.burstPath(12, seed + 1), WP.ground, { label: 'Burst' }),
      amb(circle(cx, cy - s * .02, s * .14, WP.accent2, { label: 'Dot' }), { kind: 'pulse', min: .8, max: 1, period: 2.4 }),
      strokePx(cx - s * .42, cy - s * .44, s * .84, s * .88, wobbleLineD(cx - s * .4, cy + s * .1, cx + s * .4, cy + s * .2, seed, s * .02), alpha(WP.ink, .25), sw(L, .2), { label: 'Paste crease' }),
    ];
  },
  marker(cx, cy, r) { return [pathPx(cx - r, cy - r, r * 2, r * 2, tornRectD(cx - r, cy - r, r * 2, r * 2, Math.round(cy), r * .25), WP.accent, { label: 'Torn tab' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, WP.panel, { label: 'Panel' }), rect(x, y - L.u * .5, w * .25, L.u * .5, WP.accent, { label: 'Panel tab' })]; },
  numeral: plain,
};

// ── 28. Tape & Torn Paper — the Rebellious Hand ─────────────────────────────
// A youth-room collage on kraft board: silver and blue tape, torn notebook
// paper, marker headlines. Dropped onto the board; slid off.
const DT: ThemePalette = { ground: '#C9A97A', ground2: '#BC9B6A', ink: '#1D1A16', muted: '#3F352A', accent: '#8E1B14', accent2: '#BFC3C7', accent3: '#2D5DA8', panel: '#F7F4EE', panelInk: '#1D1A16', panelMuted: '#4A4339', markerInk: '#1D1A16' };
const tapeMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L;
    let fib = ''; const r = orn.rng(seed + 5);
    for (let i = 0; i < 90; i++) { const x0 = r() * W, y0 = r() * H; fib += dLine(x0, y0, x0 + u * (1 + r() * 2), y0 + (r() - .5) * u * .6); }
    return [
      gnd(rect(0, 0, W, H, DT.ground), 'Kraft board'),
      gnd(strokePx(0, 0, W, H, fib, alpha(DT.ink, .12), sw(L, .08), { label: 'Board fibres' })),
      grain(L, seed + 1, '#FFFFFF', 140, .1, .8, 'Board fleck'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 13), h = u * 1.2, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: h * 1.2, objs: [tape(x0 + dw * .4, y + h / 2, dw * .8, h, DT.accent2, -1.5, 3, 'Silver tape'), tape(x0 + dw * .86, y + h / 2, dw * .28, h, DT.accent3, 2, 5, 'Blue tape')] };
  },
  frame(L) {
    const { W, H, u } = L, tw = u * 10, th = u * 2;
    return [
      amb(tape(u * 2.5, u * 2.5, tw, th, alpha(DT.accent2, .95), -40, 2, 'Corner tape'), { kind: 'sway', deg: 1.2, period: 5 }),
      amb(tape(W - u * 2.5, u * 2.5, tw, th, alpha(DT.accent3, .95), 40, 4, 'Corner tape'), { kind: 'sway', deg: 1.2, period: 5.6, phase: .3 }),
      tape(u * 2.5, H - u * 2.5, tw, th, alpha(DT.accent3, .95), 40, 6, 'Corner tape'),
      tape(W - u * 2.5, H - u * 2.5, tw, th, alpha(DT.accent2, .95), -40, 8, 'Corner tape'),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h);
    const sheet = (dx: number, dy: number, ww: number, hh: number, col: string, rot: number, k: number, label: string) => pathPx(cx + dx, cy + dy, ww, hh, tornRectD(cx + dx, cy + dy, ww, hh, seed + k, s * .02), col, { rotation: rot, label });
    let ruled = ''; for (let k = 1; k < 8; k++) ruled += dLine(cx - s * .3, cy - s * .3 + k * s * .075, cx + s * .26, cy - s * .3 + k * s * .075);
    return [
      sheet(-s * .44, -s * .1, s * .5, s * .52, DT.accent3, -8, 1, 'Blue paper'),
      sheet(-s * .32, -s * .38, s * .62, s * .72, '#FBF8F1', 4, 2, 'Notebook page'),
      strokePx(cx - s * .32, cy - s * .38, s * .62, s * .72, ruled, alpha(DT.accent3, .45), sw(L, .1), { label: 'Ruled lines' }),
      line(cx - s * .2, cy - s * .38, cx - s * .2, cy + s * .34, alpha(DT.accent, .45), sw(L, .12), { label: 'Margin line' }),
      amb(path(cx + s * .04, cy - s * .2, s * .3, s * .3, orn.starPath(5, .45), 'none', { stroke: DT.accent, strokeWidth: sw(L, .4), label: 'Marker star' }), { kind: 'sway', deg: 4, period: 3 }),
      amb(tape(cx - s * .02, cy - s * .38, s * .32, s * .08, alpha(DT.accent2, .95), -6, seed), { kind: 'sway', deg: 1.5, period: 4 }),
      tape(cx + s * .3, cy + s * .3, s * .26, s * .07, alpha(DT.accent3, .95), -35, seed + 2),
    ];
  },
  marker(cx, cy, r) { return [tape(cx, cy, r * 2.3, r * 1.9, DT.accent2, -4, Math.round(cx), 'Tape tab')]; },
  panel(x, y, w, h, L) {
    return [
      pathPx(x, y, w, h, tornRectD(x, y, w, h, 21, L.u * .7, 'tb'), DT.panel, { label: 'Torn sheet' }),
      rect(x + L.u * .4, y + L.u * .4, w - L.u * .8, h - L.u * .8, DT.panel, { label: 'Panel' }),
      tape(x + L.u * 2, y + L.u * .2, L.u * 6, L.u * 1.4, alpha(DT.accent2, .95), -20, 23, 'Panel tape'),
      tape(x + w - L.u * 2, y + L.u * .2, L.u * 6, L.u * 1.4, alpha(DT.accent2, .95), 20, 25, 'Panel tape'),
    ];
  },
  numeral: plain,
};

// ── 29. Chalk & Marker — the Rebellious Hand ────────────────────────────────
// The youth-room blackboard: dusty green-black, wobbly chalk border, doodled
// sun and stars in coloured chalk, handwritten type. Written on left to right.
const CH: ThemePalette = { ground: '#1F2A26', ground2: '#263330', ink: '#F2F1EA', muted: '#BAC4BE', accent: '#FFD966', accent2: '#FF8FAB', accent3: '#8FD3FF', panel: '#2C3A35', panelInk: '#F2F1EA', panelMuted: '#C3CCC6', markerInk: '#F2F1EA' };
const chalkLine = (L: Lay) => ({ dash: [L.u * 1.4, L.u * .25] });
const chalkMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, m = Math.max(W, H), r = orn.rng(seed + 2);
    let swirl = ''; for (let k = 0; k < 5; k++) { const cx = r() * W, cy = r() * H, rr = m * (.08 + r() * .1); swirl += `M${(cx - rr).toFixed(1)} ${cy.toFixed(1)}a${rr.toFixed(1)} ${(rr * .5).toFixed(1)} 0 1 0 ${(rr * 2).toFixed(1)} 0`; }
    return [
      gnd(rect(0, 0, W, H, CH.ground), 'Blackboard'),
      gnd(glowAt(W * .3, H * .4, m * .4, m * .25, '#FFFFFF', .05, 'Chalk dust')),
      gnd(glowAt(W * .8, H * .75, m * .3, m * .2, '#FFFFFF', .04, 'Chalk dust')),
      gnd(strokePx(0, 0, W, H, swirl, alpha('#FFFFFF', .05), u * 3, { label: 'Eraser swirls' })),
      grain(L, seed + 6, '#FFFFFF', 220, .08, .7, 'Chalk grain'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 14), x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: u * 1.2, objs: [
      strokePx(x0, y, dw, u * .6, wobbleLineD(x0, y + u * .3, x0 + dw, y + u * .2, 3, u * .3, 6), CH.accent, sw(L, .35), { label: 'Chalk underline' }),
      strokePx(x0, y + u * .5, dw, u * .6, wobbleLineD(x0 + dw * .1, y + u * .9, x0 + dw * .9, y + u * .8, 5, u * .3, 5), alpha(CH.accent, .7), sw(L, .25), { label: 'Chalk underline' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .035), s = u * 2.2;
    return [
      strokePx(0, 0, W, H, wobbleRectD(i, i, W - i * 2, H - i * 2, 9, u * .7), alpha(CH.ink, .6), sw(L, .3), { label: 'Chalk border', ...chalkLine(L) }),
      amb(path(i - s / 2, i - s / 2, s, s, orn.starPath(5, .45), 'none', { stroke: CH.accent, strokeWidth: sw(L, .3), label: 'Doodle star' }), { kind: 'pulse', min: .5, max: 1, period: 2.2 }),
      amb(path(W - i - s / 2, H - i - s / 2, s, s, orn.starPath(5, .45), 'none', { stroke: CH.accent2, strokeWidth: sw(L, .3), label: 'Doodle star' }), { kind: 'pulse', min: .5, max: 1, period: 2.6, phase: .5 }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), R = s * .16, sx = cx - s * .12, sy = cy - s * .12;
    let rays = ''; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; rays += wobbleLineD(sx + Math.cos(a) * R * 1.3, sy + Math.sin(a) * R * 1.3, sx + Math.cos(a) * R * 1.9, sy + Math.sin(a) * R * 1.9, seed + k, s * .01, 2); }
    const cloud = (ccx: number, ccy: number, k: number) => dCircle(ccx, ccy, s * .07 * k) + dCircle(ccx + s * .09 * k, ccy - s * .03 * k, s * .09 * k) + dCircle(ccx + s * .19 * k, ccy, s * .07 * k);
    return [
      strokePx(sx - R, sy - R, R * 2, R * 2, dCircle(sx, sy, R), CH.accent, sw(L, .45), { label: 'Chalk sun', ...chalkLine(L) }),
      amb(strokePx(sx - R * 2, sy - R * 2, R * 4, R * 4, rays, CH.accent, sw(L, .35), { label: 'Sun rays' }), { kind: 'spin', degPerSec: 6 }),
      amb(strokePx(cx - s * .02, cy + s * .08, s * .36, s * .2, cloud(cx + s * .04, cy + s * .2, 1), CH.accent3, sw(L, .35), { label: 'Chalk cloud' }), { kind: 'drift', ax: s * .03, ay: 0, period: 8 }),
      amb(path(cx + s * .26, cy - s * .38, s * .12, s * .12, orn.starPath(5, .45), 'none', { stroke: CH.accent2, strokeWidth: sw(L, .3), label: 'Doodle star' }), { kind: 'pulse', min: .4, max: 1, period: 1.8 }),
      amb(path(cx - s * .44, cy + s * .28, s * .1, s * .1, orn.starPath(5, .45), 'none', { stroke: CH.ink, strokeWidth: sw(L, .3), label: 'Doodle star' }), { kind: 'pulse', min: .4, max: 1, period: 2.3, phase: .5 }),
      strokePx(cx - s * .46, cy + s * .42, s * .92, s * .04, wobbleLineD(cx - s * .46, cy + s * .44, cx + s * .46, cy + s * .43, seed + 4, s * .015, 8), alpha(CH.ink, .7), sw(L, .3), { label: 'Chalk ground line' }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [strokePx(cx - r, cy - r, r * 2, r * 2, wobbleRectD(cx - r, cy - r, r * 2, r * 2, Math.round(cx + cy), r * .25), CH.accent, sw(L, .3), { label: 'Chalk box' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, CH.panel, { label: 'Panel' }), strokePx(x, y, w, h, wobbleRectD(x, y, w, h, 13, L.u * .4), alpha(CH.ink, .55), sw(L, .25), { label: 'Chalk outline' })]; },
  numeral: plain,
};

// ── 30. Sticker Bomb — the Rebellious Hand ──────────────────────────────────
// A laptop lid of good news: die-cut stickers with white borders and shadows
// — stars, hearts, smiles, bolts — clustered in the corners. Pops on.
const SB: ThemePalette = { ground: '#1B1B3A', ground2: '#24244A', ink: '#FFFFFF', muted: '#C9C9E8', accent: '#FFD23F', accent2: '#FF6B9A', accent3: '#4ADEDE', panel: '#FFFFFF', panelInk: '#1B1B3A', panelMuted: '#4A4A72', markerInk: '#1B1B3A' };
const SB_V = '#9B5DE5', SB_G = '#00E09A';
const heartD = 'M50 92 C20 70 0 52 4 30 C8 10 34 4 50 24 C66 4 92 10 96 30 C100 52 80 70 50 92 Z';
const boltD = 'M58 0 L18 56 L46 56 L36 100 L82 40 L54 40 Z';
function sticker(kind: number, cx: number, cy: number, s: number, rot: number, L: Lay, color: string): SlideObj[] {
  const st = { stroke: '#FFFFFF', strokeWidth: Math.max(2, s * .09), rotation: rot, shadow: { x: s * .04, y: s * .06, blur: s * .05, color: 'rgba(0,0,0,0.35)' } };
  const x = cx - s / 2, y = cy - s / 2;
  switch (kind % 5) {
    case 0: return [path(x, y, s, s, orn.starPath(5, .5), color, { ...st, label: 'Star sticker' })];
    case 1: return [path(x, y, s, s, heartD, color, { ...st, label: 'Heart sticker' })];
    case 2: return [circle(cx, cy, s / 2, color, { ...st, label: 'Smile sticker' }), circle(cx - s * .15, cy - s * .08, s * .06, SB.ground, { label: 'Smile eye' }), circle(cx + s * .15, cy - s * .08, s * .06, SB.ground, { label: 'Smile eye' }), strokePx(cx - s * .22, cy, s * .44, s * .24, `M${cx - s * .2} ${cy + s * .06}Q${cx} ${cy + s * .3} ${cx + s * .2} ${cy + s * .06}`, SB.ground, Math.max(1.5, s * .06), { label: 'Smile' })];
    case 3: return [path(x + s * .15, y, s * .7, s, boltD, color, { ...st, label: 'Bolt sticker' })];
    default: return [rect(x, y + s * .2, s, s * .6, color, { ...st, rx: s * .3, label: 'Pill sticker' }), rect(x + s * .2, y + s * .44, s * .6, s * .12, '#FFFFFF', { rx: s * .06, rotation: rot, label: 'Pill stripe' })];
  }
}
const stickerMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L;
    return [gnd(rect(0, 0, W, H, SB.ground), 'Navy lid'), gnd(halftone(0, 0, W, H, u * 3, alpha('#FFFFFF', .06), { rMin: u * .12, rMax: u * .12, label: 'Dot grid', max: 3000 }))];
  },
  divider(x, y, w, align, L) {
    const u = L.u, s = u * 1.5, gap = u * .6, total = s * 3 + gap * 2, x0 = align === 'center' ? x + (w - total) / 2 : x;
    return { h: s, objs: [...sticker(0, x0 + s / 2, y + s / 2, s, -8, L, SB.accent), ...sticker(1, x0 + s * 1.5 + gap, y + s / 2, s, 6, L, SB.accent2), ...sticker(3, x0 + s * 2.5 + gap * 2, y + s / 2, s, -4, L, SB.accent3)] };
  },
  frame(L) {
    const { W, H, u } = L, s = Math.min(u * 6, L.safe.y * 1.5), out: SlideObj[] = [];
    const spots: Array<[number, number, number, number, string]> = [[s * .6, s * .5, 0, -14, SB.accent], [s * 1.5, s * .25, 2, 10, SB_G], [W - s * .6, H - s * .5, 1, 12, SB.accent2], [W - s * 1.55, H - s * .3, 3, -8, SB_V], [W - s * .5, s * .45, 4, 20, SB.accent3]];
    spots.forEach(([cx, cy, k, rot, c], i) => { const st = sticker(k, cx, cy, s * .9, rot, L, c); amb(st[0], { kind: 'sway', deg: 3, period: 3 + i * .7, phase: i * .2 }); out.push(...st); });
    return out;
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), out: SlideObj[] = [];
    const set: Array<[number, number, number, number, number, string]> = [
      [-.2, -.2, .42, 2, -10, SB.accent], [.2, -.22, .34, 0, 12, SB.accent2], [.22, .18, .38, 1, -6, SB_V],
      [-.22, .22, .32, 3, 14, SB.accent3], [0, .02, .3, 4, -24, SB_G], [.36, -.4, .18, 0, 20, SB.accent3],
    ];
    set.forEach(([dx, dy, k, kind, rot, c], i) => { const st = sticker(kind, cx + dx * s, cy + dy * s, k * s, rot, L, c); amb(st[0], i % 2 ? { kind: 'sway', deg: 4, period: 2.6 + i * .4 } : { kind: 'pulse', min: .85, max: 1, period: 3 + i * .5 }); out.push(...st); });
    return out;
  },
  marker(cx, cy, r) { return [circle(cx, cy, r, SB.accent, { stroke: '#FFFFFF', strokeWidth: Math.max(2, r * .16), label: 'Dot sticker' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, SB.panel, { rx: L.u * 1.4, shadow: { x: L.u * .3, y: L.u * .5, blur: L.u * .6, color: 'rgba(0,0,0,0.35)' }, label: 'Panel' }), ...sticker(0, x + w - L.u * 1.2, y + L.u * .6, L.u * 2.8, 14, L, SB.accent2)]; },
  numeral: plain,
};

// ── 31. Halftone Copy — the Rebellious Hand ─────────────────────────────────
// Comic-shop pop: magenta and cyan dot screens, heavy black borders, speed
// lines, shouted lettering. Stamped on; the dot screens crawl.
const HT: ThemePalette = { ground: '#F7F3EA', ground2: '#EDE6D6', ink: '#121212', muted: '#424242', accent: '#D6105A', accent2: '#121212', accent3: '#00A6D6', panel: '#121212', panelInk: '#F7F3EA', panelMuted: '#BEB8AA', markerInk: '#FFFFFF' };
const halftoneMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.min(W, H), st = u * 1.6;
    return [
      gnd(rect(0, 0, W, H, HT.ground), 'Newsprint'),
      gnd(amb(halftone(-st * 2, -st * 2, m * .5, m * .4, st, alpha(HT.accent3, .7), { grade: 'radial', rMin: st * .38, rMax: 0, label: 'Cyan screen' }), { kind: 'scroll', dx: st, dy: 0, period: 3 })),
      gnd(amb(halftone(W - m * .5 + st * 2, H - m * .4 + st * 2, m * .5, m * .4, st, alpha(HT.accent, .7), { grade: 'radial', rMin: st * .38, rMax: 0, label: 'Magenta screen' }), { kind: 'scroll', dx: -st, dy: 0, period: 3 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 15), h = u * 1.1, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h, objs: [halftone(x0, y, dw, h, h, HT.accent, { grade: align === 'center' ? 'radial' : '-x', rMin: h * .45, rMax: h * .08, label: 'Dot strip', max: 60 })] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .025), o = u * .7;
    return [
      rect(i + o, i + o, W - i * 2, H - i * 2, 'none', { stroke: alpha(HT.accent, .9), strokeWidth: Math.max(2, u * .5), label: 'Offset border' }),
      rect(i, i, W - i * 2, H - i * 2, 'none', { stroke: HT.ink, strokeWidth: Math.max(2, u * .5), label: 'Comic border' }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), R = s * .3;
    const lines = orn.radialLines(cx, cy, R * 1.2, s * .5, 18, HT.ink, sw(L, .3), { label: 'Speed line' }) as SlideObj[];
    return [
      ...lines.map((l, i) => i % 3 === 0 ? amb(l, { kind: 'pulse', min: .3, max: 1, period: 1.2, phase: i / 18 }) : l),
      path(cx - R * 1.15, cy - R * 1.15, R * 2.3, R * 2.3, orn.burstPath(14, seed + 2), HT.accent3, { stroke: HT.ink, strokeWidth: sw(L, .35), label: 'Burst' }),
      circle(cx, cy, R * .78, HT.accent, { stroke: HT.ink, strokeWidth: sw(L, .35), label: 'Pop disc' }),
      halftone(cx - R * .78, cy - R * .78, R * 1.56, R * 1.56, R * .14, alpha(HT.ink, .6), { grade: 'radial', rMin: 0, rMax: R * .06, label: 'Disc shading', max: 300 }),
      circle(cx - R * .28, cy - R * .3, R * .16, '#FFFFFF', { label: 'Highlight' }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [circle(cx, cy, r, HT.accent, { stroke: HT.ink, strokeWidth: sw(L, .25), label: 'Pop dot' })]; },
  panel(x, y, w, h, L) { const o = L.u * .8; return [halftone(x + o, y + o, w, h, L.u * .9, HT.accent, { rMin: L.u * .3, rMax: L.u * .3, label: 'Panel screen', max: 900 }), rect(x, y, w, h, HT.panel, { label: 'Panel' })]; },
  numeral: plain,
};

// ── 32. VHS Glitch — the Futurist ───────────────────────────────────────────
// Rewound and replayed: scanlines, a rolling tracking band, RGB-split rules,
// colour bars that tear sideways. Glitches in; glitches out.
const VH: ThemePalette = { ground: '#0D0B1A', ground2: '#16122A', ink: '#F5F3FF', muted: '#B3AEDB', accent: '#FF3EA5', accent2: '#21E6E6', accent3: '#FFE45E', panel: '#1A1630', panelInk: '#F5F3FF', panelMuted: '#B3AEDB', markerInk: '#0D0B1A' };
const vhsMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L;
    return [
      gnd(rect(0, 0, W, H, VH.ground, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: VH.ground2 }, { offset: 1, color: VH.ground }] } }), 'CRT black'),
      gnd(bands(0, 0, W, H, Math.max(3, u * .45), Math.max(1, u * .16), alpha('#FFFFFF', .05), { label: 'Scanlines' })),
      gnd(amb(rect(0, -H * .08, W, H * .1, '#FFFFFF', { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: '#FFFFFF', opacity: 0 }, { offset: .5, color: '#FFFFFF', opacity: .07 }, { offset: 1, color: '#FFFFFF', opacity: 0 }] }, label: 'Tracking band' }), { kind: 'scroll', dx: 0, dy: H * 1.1, period: 7 })),
      gnd(amb(rect(W * .02, H * .3, W * .14, u * .7, alpha(VH.accent, .5), { label: 'Glitch slice' }), { kind: 'jitter', ax: u * 3, ay: u * 2, step: .35 })),
      gnd(amb(rect(W * .84, H * .66, W * .14, u * .5, alpha(VH.accent2, .5), { label: 'Glitch slice' }), { kind: 'jitter', ax: u * 3, ay: u * 2, step: .42, phase: .5 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 15), t = sw(L, .3), x0 = align === 'center' ? x + (w - dw) / 2 : x, o = u * .3;
    return { h: u * 1, objs: [
      amb(line(x0 - o, y + u * .3, x0 + dw - o, y + u * .3, VH.accent, t, { label: 'Red channel' }), { kind: 'jitter', ax: o, ay: 0, step: .5 }),
      amb(line(x0 + o, y + u * .7, x0 + dw + o, y + u * .7, VH.accent2, t, { label: 'Cyan channel' }), { kind: 'jitter', ax: o, ay: 0, step: .6, phase: .3 }),
      line(x0, y + u * .5, x0 + dw, y + u * .5, VH.ink, t, { label: 'Luma rule' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .035), s = u * 3.2;
    return [
      ...(orn.frameCorners(i, i, W - i * 2, H - i * 2, s, alpha(VH.ink, .6), 8) as SlideObj[]),
      amb(circle(i + s + u * 1.2, i + s * .5, u * .7, VH.accent, { label: 'Record dot' }), { kind: 'flicker', rate: 1.2, depth: 1 }),
      path(i + s + u * 2.6, i + s * .5 - u * .7, u * 1.4, u * 1.4, orn.polygonPath(3, 0), alpha(VH.ink, .8), { label: 'Play mark' }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), tw = s * .9, th = s * .62, tx = cx - tw / 2, ty = cy - th / 2;
    const cols = ['#C0C0C0', VH.accent3, VH.accent2, '#3BE36B', VH.accent, '#E5333A', '#3B4BFF'];
    const bw = (tw - s * .08) / cols.length, out: SlideObj[] = [rect(tx, ty, tw, th, '#05040C', { rx: s * .05, stroke: alpha(VH.ink, .6), strokeWidth: sw(L, .2), label: 'Screen' })];
    cols.forEach((c, i) => out.push(rect(tx + s * .04 + i * bw, ty + s * .04, bw, th * .66, c, { label: 'Colour bar' })));
    out.push(bands(tx + s * .04, ty + s * .04, tw - s * .08, th - s * .08, Math.max(3, s * .02), Math.max(1, s * .007), alpha('#000000', .35), { label: 'Screen scanlines' }));
    out.push(amb(rect(tx + s * .04, ty + th * .3, tw - s * .08, th * .08, alpha(VH.accent2, .7), { label: 'Torn line' }), { kind: 'jitter', ax: s * .05, ay: s * .1, step: .3 }));
    out.push(amb(rect(tx + s * .04, ty + th * .55, tw * .5, th * .05, alpha(VH.accent, .7), { label: 'Torn line' }), { kind: 'jitter', ax: s * .06, ay: s * .08, step: .38, phase: .4 }));
    out.push(rect(tx + s * .04, ty + th * .72, tw - s * .08, th * .2, '#141026', { label: 'Lower bars' }));
    return out;
  },
  marker(cx, cy, r, _l, L) { const o = L.u * .3; return [rect(cx - r - o, cy - r, r * 2, r * 2, alpha(VH.accent, .8), { label: 'Red offset' }), rect(cx - r, cy - r, r * 2, r * 2, VH.accent2, { label: 'Cyan block' })]; },
  panel(x, y, w, h, L) { const o = L.u * .35; return [rect(x - o, y, w, h, 'none', { stroke: VH.accent, strokeWidth: sw(L, .15), label: 'Red edge' }), rect(x + o, y, w, h, 'none', { stroke: VH.accent2, strokeWidth: sw(L, .15), label: 'Cyan edge' }), rect(x, y, w, h, VH.panel, { label: 'Panel' })]; },
  numeral: pad2,
};

// ── 33. Neon on Brick — the Futurist ────────────────────────────────────────
// A café wall at night: dark brick, pink and cyan tubes that buzz and catch,
// a heart, a star, an arrow. Strikes on like a sign; flickers off.
const NB: ThemePalette = { ground: '#231614', ground2: '#2E1D1A', ink: '#FFF1F6', muted: '#E0C2B8', accent: '#FF6FB5', accent2: '#39E6FF', accent3: '#FFB13B', panel: '#140B0A', panelInk: '#FFF1F6', panelMuted: '#E0C2B8', markerInk: '#FFF1F6' };
const neon = (o: SlideObj, color: string, L: Lay): SlideObj => glowShadow(o, alpha(color, .95), L.u * 1.1);
const neonMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, m = Math.max(W, H);
    return [
      gnd(rect(0, 0, W, H, NB.ground), 'Night brick'),
      gnd(brick(L, alpha('#5A3029', .5), { seed, course: u * 3 })),
      gnd(rect(0, 0, W, H, NB.ground, { gradient: { kind: 'RADIAL', stops: [{ offset: .35, color: '#000000', opacity: 0 }, { offset: 1, color: '#000000', opacity: .6 }] }, label: 'Vignette' })),
      gnd(amb(glowAt(W * .5, H * .45, m * .4, m * .28, NB.accent, .1, 'Neon wash'), { kind: 'flicker', rate: 3, depth: .5 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 13), x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: u, objs: [amb(neon(line(x0, y + u * .5, x0 + dw, y + u * .5, NB.accent2, sw(L, .35), { label: 'Neon tube' }), NB.accent2, L), { kind: 'flicker', rate: 2.5, depth: .7, phase: .2 })] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .035);
    return [amb(neon(rect(i, i, W - i * 2, H - i * 2, 'none', { rx: u * 2.4, stroke: NB.accent, strokeWidth: sw(L, .3), label: 'Neon border' }), NB.accent, L), { kind: 'flicker', rate: 1.6, depth: .8 })];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), t = sw(L, .45);
    return [
      glowAt(cx, cy, s * .5, s * .45, NB.accent, .16, 'Tube glow'),
      amb(neon(path(cx - s * .3, cy - s * .32, s * .52, s * .5, heartD, 'none', { stroke: NB.accent, strokeWidth: t, label: 'Neon heart' }), NB.accent, L), { kind: 'flicker', rate: 2, depth: .85 }),
      amb(neon(path(cx + s * .14, cy - s * .44, s * .26, s * .26, orn.starPath(5, .45), 'none', { stroke: NB.accent3, strokeWidth: t, label: 'Neon star' }), NB.accent3, L), { kind: 'flicker', rate: 3, depth: .9, phase: .4 }),
      amb(neon(strokePx(cx - s * .44, cy + s * .16, s * .88, s * .2, `M${cx - s * .42} ${cy + s * .3}L${cx + s * .36} ${cy + s * .3}M${cx + s * .24} ${cy + s * .2}L${cx + s * .38} ${cy + s * .3}L${cx + s * .24} ${cy + s * .4}`, NB.accent2, t, { label: 'Neon arrow' }), NB.accent2, L), { kind: 'flicker', rate: 2.4, depth: .7, phase: .7 }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [neon(circle(cx, cy, r, 'none', { stroke: NB.accent2, strokeWidth: sw(L, .3), label: 'Neon ring' }), NB.accent2, L)]; },
  panel(x, y, w, h, L) { return [neon(rect(x, y, w, h, NB.panel, { rx: L.u, stroke: NB.accent, strokeWidth: sw(L, .2), label: 'Panel' }), NB.accent, L)]; },
  numeral: plain,
};

// ── 34. Night City — the Futurist ───────────────────────────────────────────
// Downtown after the service: a skyline with lit windows, bokeh drifting,
// film light-leaks burning in at the edges. Glows in; floats up and away.
const NC: ThemePalette = { ground: '#070B18', ground2: '#101A33', ink: '#F4F6FF', muted: '#AEB6D6', accent: '#FFB547', accent2: '#FF4D8D', accent3: '#4DA8FF', panel: 'rgba(10,14,30,0.72)', panelInk: '#F4F6FF', panelMuted: '#AEB6D6', markerInk: '#070B18' };
function skyline(x: number, base: number, w: number, hMax: number, seed: number): { body: string; lit: string } {
  const r = orn.rng(seed); let body = '', lit = '', px = x;
  while (px < x + w) {
    const bw = hMax * (.12 + r() * .16), bh = hMax * (.3 + r() * .7), ww = bw * .12;
    body += dRect(px, base - bh, bw, bh);
    for (let wy = base - bh + ww * 2; wy < base - ww * 2; wy += ww * 2.4) for (let wx = px + ww; wx < px + bw - ww * 1.5; wx += ww * 2.2) if (r() < .32) lit += dRect(wx, wy, ww, ww * 1.2);
    px += bw + hMax * .015;
  }
  return { body, lit };
}
const cityMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, m = Math.max(W, H), r = orn.rng(seed + 3), hb = Math.min(H * .12, L.safe.y * 1.3);
    const sk = skyline(0, H, W, hb, seed + 1);
    let bokeh = ''; for (let i = 0; i < 14; i++) bokeh += dCircle(r() * W, r() * H * .8, u * (1 + r() * 2.5));
    return [
      gnd(rect(0, 0, W, H, NC.ground, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: NC.ground }, { offset: 1, color: NC.ground2 }] } }), 'Night sky'),
      gnd(amb(glowAt(-m * .02, H * .2, m * .3, m * .45, NC.accent, .35, 'Light leak'), { kind: 'pulse', min: .6, max: 1, period: 5 })),
      gnd(amb(glowAt(W + m * .02, H * .7, m * .26, m * .4, NC.accent2, .3, 'Light leak'), { kind: 'pulse', min: .55, max: 1, period: 6.5, phase: .4 })),
      gnd(amb(pathPx(0, 0, W, H, bokeh, alpha(NC.accent3, .12), { label: 'Bokeh' }), { kind: 'drift', ax: u * 3, ay: u * 1.5, period: 16 })),
      gnd(pathPx(0, H - hb, W, hb, sk.body, '#03050C', { label: 'Skyline' })),
      gnd(amb(pathPx(0, H - hb, W, hb, sk.lit || dRect(0, H - 1, 1, 1), alpha(NC.accent, .75), { label: 'Lit windows' }), { kind: 'pulse', min: .7, max: 1, period: 3.7 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 14), x0 = align === 'center' ? x + (w - dw) / 2 : x, cx = align === 'center' ? x0 + dw / 2 : x0 + dw;
    return { h: u, objs: [
      amb(line(x0, y + u * .5, x0 + dw, y + u * .5, NC.accent, sw(L, .16), { label: 'Street line' }), { kind: 'sweep', period: 3.5, color: '#FFFFFF', width: .2 }),
      amb(glowAt(cx, y + u * .5, u * 1.2, u * 1.2, NC.accent2, .7, 'Bokeh dot'), { kind: 'pulse', min: .5, max: 1, period: 2 }),
    ] };
  },
  frame(L) {
    const { W, H } = L, bw = Math.max(4, L.safe.x * .35);
    return [rect(0, 0, bw, H, NC.accent, { gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: NC.accent2, opacity: .35 }, { offset: 1, color: NC.accent, opacity: 0 }] }, label: 'Film burn' }), line(W - bw, H * .15, W - bw, H * .85, alpha(NC.ink, .15), sw(L, .08), { label: 'Film edge' })];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), base = cy + s * .4, sk = skyline(cx - s * .46, base, s * .92, s * .6, seed + 7);
    return [
      amb(glowAt(cx + s * .2, cy - s * .2, s * .3, s * .3, NC.accent, .35, 'Moon glow'), { kind: 'pulse', min: .7, max: 1, period: 6 }),
      circle(cx + s * .2, cy - s * .2, s * .1, '#FFE7B8', { label: 'Moon' }),
      pathPx(cx - s * .46, base - s * .6, s * .92, s * .6, sk.body, '#1A2340', { label: 'Towers' }),
      amb(pathPx(cx - s * .46, base - s * .6, s * .92, s * .6, sk.lit || dRect(cx, base - 1, 1, 1), NC.accent, { label: 'Windows' }), { kind: 'flicker', rate: 1.5, depth: .3 }),
      line(cx - s * .48, base, cx + s * .48, base, alpha(NC.accent2, .8), sw(L, .2), { label: 'Street glow' }),
      amb(circle(cx - s * .3, cy - s * .3, s * .05, alpha(NC.accent3, .4), { label: 'Bokeh' }), { kind: 'drift', ax: s * .04, ay: s * .03, period: 8 }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [glowAt(cx, cy, r * 1.5, r * 1.5, NC.accent, .45, 'Bokeh glow'), circle(cx, cy, r, NC.accent, { stroke: '#FFE7B8', strokeWidth: sw(L, .1), label: 'Bokeh disc' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, NC.panel, { rx: L.u, stroke: alpha(NC.accent, .4), strokeWidth: sw(L, .1), label: 'Panel' })]; },
  numeral: pad2,
};

// ── 35. Concrete & Rust — the World-Eclectic Traveler ───────────────────────
// Docklands converted to a church hall: board-formed concrete with tie holes
// weeping rust, riveted steel plates, stencilled heavy type. Slams; drops.
const CR: ThemePalette = { ground: '#BDBAB3', ground2: '#AEAAA2', ink: '#1C1A18', muted: '#3F3A35', accent: '#8F3B12', accent2: '#C7652B', accent3: '#4E5A63', panel: '#2E3439', panelInk: '#F1EEE8', panelMuted: '#BFC6CB', markerInk: '#F1EEE8' };
const rivets = (pts: number[][], r: number): SlideObj => pathPx(Math.min(...pts.map(p => p[0])) - r, Math.min(...pts.map(p => p[1])) - r, Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])) + r * 2, Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1])) + r * 2, pts.map(p => dCircle(p[0], p[1], r)).join(''), '#9AA3A9', { label: 'Rivets' });
const concreteMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, S = L.safe, r = orn.rng(seed + 2);
    const out: SlideObj[] = [gnd(rect(0, 0, W, H, CR.ground), 'Concrete'), grain(L, seed + 4, CR.ink, 280, .12, .9, 'Aggregate')];
    out.push(gnd(bands(0, 0, W, H, u * 9, sw(L, .1), alpha(CR.ink, .08), { label: 'Form joints' })));
    // Tie holes in the margins, each weeping a rust streak.
    let holes = ''; const streaks: SlideObj[] = [];
    const cols = Math.max(2, Math.round(W / (u * 18)));
    for (let k = 0; k < cols; k++) for (const yy of [S.y * .45, H - S.y * .55]) {
      const hx = (k + .5) * W / cols, hr = u * .5; holes += dCircle(hx, yy, hr);
      if (r() < .6) streaks.push(gnd(rect(hx - hr * .7, yy, hr * 1.4, Math.min(u * (4 + r() * 6), H - yy), CR.accent2, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: CR.accent, opacity: .6 }, { offset: 1, color: CR.accent2, opacity: 0 }] }, label: 'Rust streak' })));
    }
    out.push(...streaks, gnd(pathPx(0, 0, W, H, holes, alpha(CR.ink, .5), { label: 'Tie holes' })));
    return out;
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 16), t = u * .9, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t, objs: [rect(x0, y, dw, t, CR.accent, { gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: CR.accent }, { offset: .6, color: CR.accent2 }, { offset: 1, color: CR.accent }] }, label: 'Rust bar' }), rivets([[x0 + t * .6, y + t / 2], [x0 + dw - t * .6, y + t / 2]], t * .2)] };
  },
  frame(L) {
    const { W, H, u } = L, p = u * 5.5, i = inset(L, .02);
    const plate = (x: number, y: number) => [rect(x, y, p, p * .7, CR.accent3, { label: 'Steel plate' }), rivets([[x + p * .15, y + p * .12], [x + p * .85, y + p * .12], [x + p * .15, y + p * .58], [x + p * .85, y + p * .58]], u * .25)];
    return [...plate(i, i), ...plate(W - i - p, H - i - p * .7)];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h);
    const beam = (yy: number, ww: number, col: string) => [rect(cx - ww / 2, yy, ww, s * .05, col, { label: 'Flange' }), rect(cx - s * .03, yy + s * .05, s * .06, s * .2, col, { label: 'Web' }), rect(cx - ww / 2, yy + s * .25, ww, s * .05, col, { label: 'Flange' })];
    return [
      rect(cx - s * .44, cy - s * .44, s * .88, s * .88, CR.accent3, { label: 'Steel plate' }),
      rect(cx - s * .44, cy + s * .1, s * .88, s * .34, CR.accent2, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: CR.accent2, opacity: 0 }, { offset: 1, color: CR.accent, opacity: .85 }] }, label: 'Rust bloom' }),
      ...beam(cy - s * .3, s * .56, '#1F2428'),
      rivets([[cx - s * .38, cy - s * .38], [cx + s * .38, cy - s * .38], [cx - s * .38, cy + s * .38], [cx + s * .38, cy + s * .38]], s * .025),
      amb(circle(cx + s * .22, cy + s * .2, s * .07, alpha(CR.accent2, .8), { label: 'Weld glow' }), { kind: 'pulse', min: .5, max: 1, period: 2.8 }),
    ];
  },
  marker(cx, cy, r) { return [path(cx - r, cy - r, r * 2, r * 2, orn.polygonPath(6, 0), CR.accent3, { label: 'Hex nut' })]; },
  panel(x, y, w, h, L) { const q = L.u * .9; return [rect(x, y, w, h, CR.panel, { label: 'Panel' }), rivets([[x + q, y + q], [x + w - q, y + q], [x + q, y + h - q], [x + w - q, y + h - q]], L.u * .22)]; },
  numeral: pad2,
};

// ── 36. Two-Ink Misprint — the World-Eclectic Traveler ──────────────────────
// A market-stall flyer run on a tired press: orange and green inks overprint
// out of register, roller streaks, crop marks and a colour bar. Rolled on.
const MI: ThemePalette = { ground: '#F2EEE3', ground2: '#E7E1D2', ink: '#2B1D52', muted: '#5D5470', accent: '#C9430D', accent2: '#00A57A', accent3: '#FF6C2F', panel: '#2B1D52', panelInk: '#F2EEE3', panelMuted: '#CBC3DD', markerInk: '#FFFFFF' };
const misprintMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, MI.ground), 'Newsprint'),
      gnd(bands(0, 0, W, H, u * 7, u * 2.2, alpha(MI.ink, .025), { label: 'Roller streaks', vertical: true })),
      gnd(circle(W - m * .06, m * .04, m * .2, alpha(MI.accent3, .85), { label: 'Orange ink', blend: 'multiply' })),
      gnd(amb(path(W - m * .34, -m * .04, m * .3, m * .26, orn.polygonPath(3), alpha(MI.accent2, .75), { label: 'Green ink', blend: 'multiply' }), { kind: 'jitter', ax: m * .004, ay: m * .003, step: .55 })),
      grain(L, seed + 3, MI.ink, 260, .1, .8, 'Press grain'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 12), t = u * .6, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t + u * .3, objs: [
      rect(x0, y, dw, t, alpha(MI.accent3, .9), { label: 'Orange bar', blend: 'multiply' }),
      amb(rect(x0 + u * .4, y + u * .3, dw, t, alpha(MI.accent2, .75), { label: 'Green bar', blend: 'multiply' }), { kind: 'jitter', ax: u * .15, ay: u * .1, step: .6 }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .03), c = u * 1.8, g = u * .5;
    const crop = (x: number, y: number, fx: number, fy: number) => dLine(x - fx * g, y, x - fx * (g + c), y) + dLine(x, y - fy * g, x, y - fy * (g + c));
    const bar: SlideObj[] = [MI.accent3, MI.accent2, MI.ink, MI.accent, '#FFFFFF'].map((col, k) => rect(W / 2 - u * 3.5 + k * u * 1.4, H - i - u * .6, u * 1.2, u * 1.2, col, { stroke: alpha(MI.ink, .4), strokeWidth: sw(L, .06), label: 'Colour bar' }));
    return [strokePx(0, 0, W, H, crop(i, i, 1, 1) + crop(W - i, i, -1, 1) + crop(i, H - i, 1, -1) + crop(W - i, H - i, -1, -1), alpha(MI.ink, .7), sw(L, .1), { label: 'Crop marks' }), ...bar];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), o = s * .025;
    return [
      circle(cx + s * .1, cy - s * .12, s * .26, alpha(MI.accent3, .9), { label: 'Orange sun', blend: 'multiply' }),
      amb(path(cx - s * .48, cy, s * .96, s * .42, orn.wavePath(2, 30, 60), alpha(MI.accent2, .8), { label: 'Green hills', blend: 'multiply' }), { kind: 'jitter', ax: o, ay: o * .6, step: .5 }),
      amb(circle(cx + s * .1 + o * 2, cy - s * .12 + o, s * .26, 'none', { stroke: MI.ink, strokeWidth: sw(L, .2), label: 'Key line' }), { kind: 'jitter', ax: o * .5, ay: o * .5, step: .7, phase: .3 }),
      halftone(cx - s * .1, cy + s * .2, s * .5, s * .22, s * .035, alpha(MI.ink, .5), { grade: 'x', rMin: s * .002, rMax: s * .012, label: 'Shade screen', max: 300 }),
    ];
  },
  marker(cx, cy, r, _l, L) { const o = L.u * .3; return [circle(cx + o, cy + o, r, 'none', { stroke: MI.accent3, strokeWidth: sw(L, .25), label: 'Orange ring' }), circle(cx, cy, r, alpha(MI.accent2, .95), { label: 'Green dot' })]; },
  panel(x, y, w, h, L) { const o = L.u * .5; return [rect(x + o, y + o, w, h, alpha(MI.accent3, .85), { label: 'Panel offset', blend: 'multiply' }), rect(x, y, w, h, MI.panel, { label: 'Panel' })]; },
  numeral: pad2,
};

// ── Registry ─────────────────────────────────────────────────────────────────
const AC = 'Art Council' as const;
export const URBAN_THEMES: SlideTheme[] = [
  {
    id: 'zine', name: 'Xerox Zine', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'Photocopied at midnight: toner speckle, copier-lid shadow, staples, a red marker circle.',
    use: 'Youth group, student ministry, small-group handouts on screen', c: ZN,
    t: { display: 'rubikMono', text: 'courierPrime', label: 'specialElite', accent: 'caveat', displayWeight: 400, displayTransform: 'uppercase', displayTracking: 0, displayLeading: 1.04, displayScale: .8, textWeight: 400, labelWeight: 400, labelTracking: .1, accentWeight: 600 },
    motion: { enter: 'tilt', enterSec: .75, exit: 'slide', exitSec: .38, ruleGrow: false }, motif: zineMotif, slot: { rx: 0, tilt: -3 },
  },
  {
    id: 'stencil', name: 'Spray & Stencil', director: 'the Rebellious Hand', council: AC, dark: true,
    lens: 'A legal wall on a sunny Saturday: pastel overspray, stencil bridges and paint drips.',
    use: 'Youth rallies, serve days, art & mural projects', c: ST,
    t: { display: 'bungee', text: 'workSans', label: 'staatliches', accent: 'permanentMarker', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .01, displayLeading: 1.0, displayScale: .84, textWeight: 500, labelWeight: 400, labelTracking: .16, accentWeight: 400 },
    motion: { enter: 'wipe', enterSec: .75, exit: 'fade', exitSec: .4, ruleGrow: false }, motif: stencilMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'wheatpaste', name: 'Wheat-Paste Wall', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'A fresh poster pasted over old ones: torn scraps, paste wrinkles, condensed gothic.',
    use: 'Events, concerts, block parties, city outreach', c: WP,
    t: { display: 'leagueGothic', text: 'robotoSlab', label: 'robotoSlab', accent: 'zilla', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .01, displayLeading: .92, displayScale: 1.2, textWeight: 400, labelWeight: 700, labelTracking: .14, accentItalic: true, accentWeight: 500 },
    motion: { enter: 'stamp', enterSec: .7, exit: 'wipe-out', exitSec: .42, ruleGrow: false }, motif: pasteMotif, slot: { rx: 0, tilt: 1.5 },
  },
  {
    id: 'ducttape', name: 'Tape & Torn Paper', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'A youth-room collage on kraft board: silver and blue tape, torn notebook paper, marker.',
    use: 'Youth nights, camps, kids ministry, mission-trip recaps', c: DT,
    t: { display: 'permanentMarker', text: 'nunito', label: 'courierPrime', accent: 'kalam', displayWeight: 400, displayTransform: 'none', displayTracking: 0, displayLeading: 1.06, displayScale: .95, textWeight: 600, labelWeight: 700, labelTracking: .12, accentWeight: 700 },
    motion: { enter: 'drop', enterSec: .85, exit: 'slide', exitSec: .4, ruleGrow: false }, motif: tapeMotif, slot: { rx: 0, tilt: -2 },
  },
  {
    id: 'chalk', name: 'Chalk & Marker', director: 'the Rebellious Hand', council: AC, dark: true,
    lens: 'The youth-room blackboard: dusty green-black, wobbly borders, coloured-chalk doodles.',
    use: 'Kids church, Sunday school, back-to-school, teaching nights', c: CH,
    t: { display: 'caveat', text: 'patrickHand', label: 'kalam', accent: 'caveat', displayWeight: 700, displayTransform: 'none', displayTracking: 0, displayLeading: 1.0, displayScale: 1.28, textWeight: 400, labelWeight: 700, labelTracking: .12, accentWeight: 500 },
    motion: { enter: 'wipe', enterSec: 1.1, exit: 'fade', exitSec: .5, ruleGrow: true }, motif: chalkMotif, slot: { rx: 0, tilt: -1 },
  },
  {
    id: 'stickers', name: 'Sticker Bomb', director: 'the Rebellious Hand', council: AC, dark: true,
    lens: 'A laptop lid of good news: die-cut stars, hearts, smiles and bolts with white borders.',
    use: 'Kids & youth, VBS, celebrations, sign-ups', c: SB,
    t: { display: 'baloo', text: 'fredoka', label: 'fredoka', accent: 'baloo', displayWeight: 800, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.0, textWeight: 500, labelWeight: 600, labelTracking: .14, accentWeight: 600 },
    motion: { enter: 'pop', enterSec: .75, exit: 'shrink', exitSec: .4, ruleGrow: false }, motif: stickerMotif, slot: { rx: .1, tilt: -3 },
  },
  {
    id: 'halftone', name: 'Halftone Copy', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'Comic-shop pop: magenta and cyan dot screens, heavy black borders, speed lines.',
    use: 'Youth series, superhero VBS, fun announcements', c: HT,
    t: { display: 'bangers', text: 'comicNeue', label: 'bangers', accent: 'comicNeue', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .03, displayLeading: .98, displayScale: 1.12, textWeight: 700, labelWeight: 400, labelTracking: .1, accentItalic: true, accentWeight: 700 },
    motion: { enter: 'stamp', enterSec: .65, exit: 'shrink', exitSec: .38, ruleGrow: false }, motif: halftoneMotif, slot: { rx: 0, tilt: -2 },
  },
  {
    id: 'vhs', name: 'VHS Glitch', director: 'the Futurist', council: AC, dark: true,
    lens: 'Rewound and replayed: scanlines, a rolling tracking band, RGB-split rules, tearing bars.',
    use: 'Youth throwback nights, video announcements, countdowns', c: VH,
    t: { display: 'audiowide', text: 'chakra', label: 'vt323', accent: 'vt323', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .02, displayLeading: 1.06, displayScale: .9, textWeight: 400, labelWeight: 400, labelTracking: .12, accentWeight: 400 },
    motion: { enter: 'glitch', enterSec: .8, exit: 'glitch-out', exitSec: .45, ruleGrow: false }, motif: vhsMotif, slot: { rx: .04, tilt: 0 },
  },
  {
    id: 'neonbrick', name: 'Neon on Brick', director: 'the Futurist', council: AC, dark: true,
    lens: 'A café wall at night: dark brick, pink and cyan tubes that buzz — a heart, a star, an arrow.',
    use: 'Young adults, coffeehouse worship, date nights, open mic', c: NB,
    t: { display: 'lobster', text: 'outfit', label: 'josefin', accent: 'outfit', displayWeight: 400, displayTransform: 'none', displayTracking: 0, displayLeading: 1.08, displayScale: 1.05, textWeight: 400, labelWeight: 600, labelTracking: .3, accentItalic: true, accentWeight: 300 },
    motion: { enter: 'flicker', enterSec: .9, exit: 'flicker-out', exitSec: .5, ruleGrow: false }, motif: neonMotif, slot: { rx: .06, tilt: 0 },
  },
  {
    id: 'nightcity', name: 'Night City', director: 'the Futurist', council: AC, dark: true,
    lens: 'Downtown after the service: lit windows, drifting bokeh, film light-leaks at the edges.',
    use: 'City campuses, evening services, young professionals', c: NC,
    t: { display: 'exo2', text: 'manrope', label: 'exo2', accent: 'manrope', displayWeight: 800, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.02, textWeight: 400, labelWeight: 600, labelTracking: .24, accentWeight: 300 },
    motion: { enter: 'glow', enterSec: 1.1, exit: 'float-up', exitSec: .55, ruleGrow: true }, motif: cityMotif, slot: { rx: .06, tilt: 0 },
  },
  {
    id: 'concrete', name: 'Concrete & Rust', director: 'the World-Eclectic Traveler', council: AC, dark: false,
    lens: 'Docklands made a church hall: board-formed concrete, tie holes weeping rust, riveted steel.',
    use: 'Men’s ministry, building projects, warehouse churches, work days', c: CR,
    t: { display: 'delaGothic', text: 'archivo', label: 'jetbrains', accent: 'archivo', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .01, displayLeading: 1.02, displayScale: .84, textWeight: 400, labelWeight: 600, labelTracking: .14, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'slam', enterSec: .6, exit: 'drop', exitSec: .45, ruleGrow: false }, motif: concreteMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'misprint', name: 'Two-Ink Misprint', director: 'the World-Eclectic Traveler', council: AC, dark: false,
    lens: 'A market-stall flyer on a tired press: orange and green out of register, crop marks, a colour bar.',
    use: 'Farmers-market outreach, fairs, community festivals', c: MI,
    t: { display: 'shrikhand', text: 'workSans', label: 'spaceMono', accent: 'zilla', displayWeight: 400, displayTransform: 'none', displayTracking: 0, displayLeading: 1.04, displayScale: .9, textWeight: 400, labelWeight: 700, labelTracking: .12, accentItalic: true, accentWeight: 500 },
    motion: { enter: 'scan', enterSec: .9, exit: 'fade-up', exitSec: .45, ruleGrow: false }, motif: misprintMotif, slot: { rx: 0, tilt: 1 },
  },
];
