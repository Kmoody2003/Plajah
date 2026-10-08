// themesModernA — twelve modern / postmodern / abstract languages, authored
// through three Art Council lenses (four each):
//   the Classical Mind      — Bauhaus Primer, International Grid, De Stijl, Neo-Deco
//   the Rebellious Hand     — Memphis Party, Raw Brutalist, Deconstructed, Riso Bloom
//   the Futurist            — Suprematist Flight, Constructivist, Frosted Glass, Kinetic Op
// Each owns palette, type pairing, ornament grammar and motion. Ornaments live
// in the margins or behind words at low strength; words never sit on texture.
import { rect, circle, line, path } from '../../tela/templateKit';
import type { Lay } from './layout';
import type { SlideObj, SlideTheme, ThemeMotif, ThemePalette } from './types';
import {
  amb, gnd, glowAt, pathPx, strokePx, grain, halftone, bands, gridLines, dCircle, dRect, dPoly, dLine,
  halfDiscD, sq, pad2, plain, alpha, orn,
} from './motifKit';

const sw = (L: Lay, k: number) => Math.max(1, L.u * k);
const inset = (L: Lay, k = .028) => Math.max(6, Math.min(L.W, L.H) * k);

// ── 1. Bauhaus Primer — the Classical Mind ──────────────────────────────────
// Circle, square, triangle in the three primaries on cream; a construction
// grid under everything. Shapes drop into place like blocks on a workbench.
const BH: ThemePalette = { ground: '#F1EBDD', ground2: '#E6DDC8', ink: '#1A1A1A', muted: '#4F4A42', accent: '#C8302A', accent2: '#F2B705', accent3: '#1F4E9C', panel: '#1A1A1A', panelInk: '#F1EBDD', panelMuted: '#CFC6B4', markerInk: '#F1EBDD' };
const bauhausMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, BH.ground), 'Cream ground'),
      gnd(gridLines(0, 0, W, H, u * 8, u * 8, alpha(BH.ink, .05), sw(L, .06), { label: 'Construction grid' })),
      gnd(amb(circle(W, H, m * .2, BH.accent2, { label: 'Yellow disc' }), { kind: 'pulse', min: .85, max: 1, period: 7 })),
      gnd(rect(-m * .06, -m * .06, m * .2, m * .2, BH.accent3, { label: 'Blue square' })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, s = u * 1.1, gap = u * .55, rw = Math.min(w, u * 16), total = s * 3 + gap * 3 + rw * .5;
    const x0 = align === 'center' ? x + (w - total) / 2 : x;
    return { h: s, objs: [
      circle(x0 + s / 2, y + s / 2, s / 2, BH.accent, { label: 'Circle' }),
      rect(x0 + s + gap, y, s, s, BH.accent3, { label: 'Square' }),
      path(x0 + (s + gap) * 2, y, s, s, orn.polygonPath(3), BH.accent2, { label: 'Triangle' }),
      line(x0 + (s + gap) * 3, y + s / 2, x0 + total, y + s / 2, BH.ink, sw(L, .22), { label: 'Bar' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L), bw = u * .7;
    return [
      rect(i, H * .3, bw, H * .4, BH.accent, { label: 'Red bar' }),
      path(W - i - u * 3.2, i, u * 3.2, u * 2.8, orn.polygonPath(3), BH.ink, { label: 'Black triangle' }),
      line(W - i, H * .62, W - i, H - i, BH.ink, sw(L, .3), { label: 'Edge rule' }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h);
    return [
      rect(cx - s * .46, cy - s * .04, s * .5, s * .5, BH.accent3, { label: 'Blue square' }),
      circle(cx + s * .1, cy - s * .12, s * .3, BH.accent, { label: 'Red circle', blend: 'multiply' }),
      amb(path(cx - s * .1, cy + s * .02, s * .52, s * .44, orn.polygonPath(3), BH.accent2, { label: 'Yellow triangle', blend: 'multiply' }), { kind: 'sway', deg: 4, period: 9 }),
      rect(cx - s * .48, cy + s * .48, s * .96, s * .035, BH.ink, { label: 'Base bar' }),
      line(cx + s * .4, cy - s * .48, cx + s * .4, cy + s * .44, BH.ink, sw(L, .2), { label: 'Upright' }),
      amb(circle(cx + s * .4, cy - s * .42, s * .045, BH.ink, { label: 'Dot' }), { kind: 'orbit', cx: cx + s * .1, cy: cy - s * .12, degPerSec: 10 }),
    ];
  },
  marker(cx, cy, r) { return [circle(cx, cy, r, BH.accent, { label: 'Red disc' })]; },
  panel(x, y, w, h, L) { const t = L.u * 1.4; return [rect(x, y, w, h, BH.panel, { label: 'Panel' }), rect(x, y, t, t, BH.accent, { label: 'Panel tab' }), rect(x + t, y, t, t, BH.accent2, { label: 'Panel tab' })]; },
  numeral: plain,
};

// ── 2. International Grid — the Classical Mind ──────────────────────────────
// Swiss order: white, black, one red; the 12-column grid made visible; heavy
// tight grotesque flush left. Things wipe on along the grid.
const SW: ThemePalette = { ground: '#FFFFFF', ground2: '#F2F2F2', ink: '#111111', muted: '#595959', accent: '#E2231A', accent2: '#111111', accent3: '#D9D9D9', panel: '#111111', panelInk: '#FFFFFF', panelMuted: '#BDBDBD', markerInk: '#FFFFFF' };
const swissMotif: ThemeMotif = {
  ground(L) {
    const { W, H, safe } = L, cols = L.vertical ? 6 : L.stretched ? 24 : 12, cw = safe.w / cols;
    let d = '';
    for (let i = 0; i <= cols; i++) d += dLine(safe.x + i * cw, 0, safe.x + i * cw, H);
    return [gnd(rect(0, 0, W, H, SW.ground), 'White ground'), gnd(strokePx(0, 0, W, H, d, alpha(SW.ink, .07), sw(L, .07), { label: 'Column grid' }))];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 7), t = u * .55, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t, objs: [amb(rect(x0, y, dw, t, SW.ink, { label: 'Bold rule' }), { kind: 'sweep', period: 6, color: SW.accent, width: .4 })] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .02);
    return [rect(0, 0, u * 1.1, H, SW.accent, { label: 'Red edge' }), line(i + u * 2, i, W - i, i, SW.ink, sw(L, .14), { label: 'Head rule' })];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h);
    const g = s / 4;
    return [
      gridLines(cx - s / 2, cy - s / 2, s, s, g, g, alpha(SW.ink, .22), sw(L, .08), { label: 'Module grid' }),
      rect(cx - s / 2, cy - s / 2 + g, g * 3, g * 3, SW.accent, { label: 'Red field' }),
      amb(circle(cx + g * 1.3, cy - g * 1.3, g * .62, SW.ink, { label: 'Black disc' }), { kind: 'drift', ax: g * .08, ay: 0, period: 12 }),
      rect(cx - s / 2, cy - s / 2, g * 2, g * .18, SW.ink, { label: 'Index bar' }),
    ];
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, SW.ink, { label: 'Black square' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, SW.panel, { label: 'Panel' }), rect(x, y, w, L.u * .5, SW.accent, { label: 'Panel head' })]; },
  numeral: pad2,
};

// ── 3. De Stijl — the Classical Mind ────────────────────────────────────────
// Neo-plastic balance: black bars, white fields, three primaries. The margin
// becomes a ring of coloured cells; the words keep the calm white centre.
const DS: ThemePalette = { ground: '#F7F5EF', ground2: '#ECE9E0', ink: '#121212', muted: '#4A4A4A', accent: '#C8202F', accent2: '#1E3F94', accent3: '#F4C20D', panel: '#FFFFFF', panelInk: '#121212', panelMuted: '#4A4A4A', markerInk: '#FFFFFF' };
function mondrian(x: number, y: number, w: number, h: number, L: Lay, seed: number, label: string): SlideObj[] {
  // Split the box into cells with thick black bars; fill three cells.
  const r = orn.rng(seed), t = Math.max(2, L.u * .55), out: SlideObj[] = [];
  const xs = [0, .28 + r() * .14, .7 + r() * .1, 1], ys = [0, .34 + r() * .1, .76 + r() * .08, 1];
  const fills = [DS.accent, DS.accent2, DS.accent3];
  const pick = [[0, 0], [2, 1], [1, 2]].map(([i, j]) => [(i + seed) % 3, j]);
  pick.forEach(([i, j], k) => out.push(rect(x + w * xs[i], y + h * ys[j], w * (xs[i + 1] - xs[i]), h * (ys[j + 1] - ys[j]), fills[k], { label })));
  let d = '';
  for (const fx of xs.slice(1, -1)) d += dRect(x + w * fx - t / 2, y, t, h);
  for (const fy of ys.slice(1, -1)) d += dRect(x, y + h * fy - t / 2, w, t);
  out.push(pathPx(x, y, w, h, d, DS.ink, { label: 'Black bars' }));
  out.push(rect(x, y, w, h, 'none', { stroke: DS.ink, strokeWidth: t, label: 'Black bars' }));
  return out;
}
const destijlMotif: ThemeMotif = {
  ground(L) { return [gnd(rect(0, 0, L.W, L.H, DS.ground), 'White field')]; },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 14), t = u * .5, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: u * 1.2, objs: [
      rect(x0, y + u * .35, dw, t, DS.ink, { label: 'Black bar' }),
      rect(x0 + dw * .62, y, u * 1.2, u * 1.2, DS.accent, { label: 'Red cell' }),
      rect(x0 + dw * .62 + u * 1.2, y, u * 2.4, u * 1.2, DS.accent2, { label: 'Blue cell' }),
    ] };
  },
  frame(L) {
    // A ring of cells in the margin: top + bottom strips (and sides when stretched).
    const { W, H, u } = L, t = Math.max(2, u * .45), band = Math.min(L.safe.y * .55, u * 3.6);
    const out: SlideObj[] = [];
    const strip = (y0: number, seed: number) => {
      const r = orn.rng(seed); let x = 0; const cols = [DS.accent, DS.ground, DS.accent3, DS.ground, DS.accent2, DS.ground, DS.ground];
      let k = 0, d = '';
      while (x < W) { const cw = (u * 6 + r() * u * 14); const c = cols[(k++ + seed) % cols.length]; if (c !== DS.ground) out.push(rect(x, y0, Math.min(cw, W - x), band, c, { label: 'Margin cell' })); x += cw; if (x < W) d += dRect(x - t / 2, y0, t, band); }
      out.push(pathPx(0, y0, W, band, d + dRect(0, y0 + (y0 > 0 ? 0 : band - t), W, t), DS.ink, { label: 'Margin bars' }));
    };
    strip(0, 3); strip(H - band, 6);
    return out;
  },
  hero(x, y, w, h, L, seed) {
    const out = mondrian(x + w * .04, y + h * .04, w * .92, h * .92, L, seed, 'Neo-plastic cell');
    const y3 = out.find(o => o.fill === DS.accent3); if (y3) amb(y3, { kind: 'pulse', min: .78, max: 1, period: 6 });
    return out;
  },
  marker(cx, cy, r, _l, L) { return [rect(cx - r, cy - r, r * 2, r * 2, DS.accent2, { stroke: DS.ink, strokeWidth: sw(L, .3), label: 'Blue cell' })]; },
  panel(x, y, w, h, L) { const s = L.u * 1.6; return [rect(x, y, w, h, DS.panel, { stroke: DS.ink, strokeWidth: Math.max(2, L.u * .35), label: 'Panel' }), rect(x + w - s, y + h - s, s, s, DS.accent, { label: 'Panel cell' })]; },
  numeral: plain,
};

// ── 4. Neo-Deco — the Classical Mind ────────────────────────────────────────
// Symmetry with sparkle: emerald lacquer, brass, stepped fans and triple
// lines. Curtains of light open top-down.
const ND: ThemePalette = { ground: '#0E1F1B', ground2: '#143A31', ink: '#F3EAD3', muted: '#BFB49A', accent: '#D4AF63', accent2: '#2E7D67', accent3: '#8C6A35', panel: '#0B1714', panelInk: '#F3EAD3', panelMuted: '#BFB49A', markerInk: '#0E1F1B' };
function stepCornerD(x: number, y: number, s: number, fx: number, fy: number): string {
  // A stepped L-bracket drawn as an outline path (open), mirrored by fx/fy (±1).
  const p = (a: number, b: number) => `${(x + fx * a * s).toFixed(1)} ${(y + fy * b * s).toFixed(1)}`;
  return `M${p(0, 1)}L${p(0, .45)}L${p(.18, .45)}L${p(.18, .18)}L${p(.45, .18)}L${p(.45, 0)}L${p(1, 0)}`;
}
const neodecoMotif: ThemeMotif = {
  ground(L) {
    const { W, H } = L, m = Math.max(W, H);
    return [
      gnd(rect(0, 0, W, H, ND.ground, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: ND.ground }, { offset: 1, color: ND.ground2 }] } }), 'Lacquer ground'),
      gnd(path(W / 2 - m * .55, H - m * .55, m * 1.1, m * .55, orn.sunburstPath(15, 180, .5), alpha(ND.accent, .06), { label: 'Fan' })),
      gnd(amb(glowAt(W / 2, H * 1.02, m * .5, m * .3, ND.accent, .14, 'Footlight'), { kind: 'pulse', min: .7, max: 1, period: 6 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 22), d = u * 1.2, cy = y + d / 2, s = sw(L, .12);
    const sweep = { kind: 'sweep' as const, period: 5.5, color: '#FFF4D6', width: .2 };
    if (align === 'center') {
      const cx = x + w / 2;
      return { h: d, objs: [
        amb(line(cx - dw / 2, cy, cx - d, cy, ND.accent, s, { label: 'Triple line' }), sweep),
        line(cx - dw * .38, cy - d * .32, cx - d, cy - d * .32, alpha(ND.accent, .6), s),
        line(cx - dw * .38, cy + d * .32, cx - d, cy + d * .32, alpha(ND.accent, .6), s),
        amb(line(cx + d, cy, cx + dw / 2, cy, ND.accent, s, { label: 'Triple line' }), { ...sweep, phase: .5 }),
        line(cx + d, cy - d * .32, cx + dw * .38, cy - d * .32, alpha(ND.accent, .6), s),
        line(cx + d, cy + d * .32, cx + dw * .38, cy + d * .32, alpha(ND.accent, .6), s),
        path(cx - d * .6, y, d * 1.2, d, orn.stepPyramidPath(3), ND.accent, { label: 'Stepped crown' }),
      ] };
    }
    return { h: d, objs: [
      path(x, y, d * 1.2, d, orn.stepPyramidPath(3), ND.accent, { label: 'Stepped crown' }),
      amb(line(x + d * 1.6, cy, x + dw, cy, ND.accent, s, { label: 'Triple line' }), sweep),
      line(x + d * 1.6, cy - d * .32, x + dw * .7, cy - d * .32, alpha(ND.accent, .6), s),
      line(x + d * 1.6, cy + d * .32, x + dw * .7, cy + d * .32, alpha(ND.accent, .6), s),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .03), s = u * 5, j = i + u * .6;
    const d = stepCornerD(i, i, s, 1, 1) + stepCornerD(W - i, i, s, -1, 1) + stepCornerD(i, H - i, s, 1, -1) + stepCornerD(W - i, H - i, s, -1, -1);
    const d2 = stepCornerD(j, j, s * .7, 1, 1) + stepCornerD(W - j, j, s * .7, -1, 1) + stepCornerD(j, H - j, s * .7, 1, -1) + stepCornerD(W - j, H - j, s * .7, -1, -1);
    return [
      strokePx(0, 0, W, H, d, ND.accent, sw(L, .18), { label: 'Stepped corners' }),
      strokePx(0, 0, W, H, d2, alpha(ND.accent, .45), sw(L, .1), { label: 'Stepped corners inner' }),
      line(i + s * 1.2, i, W - i - s * 1.2, i, alpha(ND.accent, .3), sw(L, .08), { label: 'Frame line' }),
      line(i + s * 1.2, H - i, W - i - s * 1.2, H - i, alpha(ND.accent, .3), sw(L, .08), { label: 'Frame line' }),
    ];
  },
  hero(x, y, w, h, L) {
    const s = Math.min(w, h), cx = x + w / 2, by = y + (h + s * .9) / 2;
    const out: SlideObj[] = [amb(glowAt(cx, by - s * .3, s * .55, s * .5, ND.accent, .16, 'Fan glow'), { kind: 'pulse', min: .7, max: 1, period: 5 })];
    const rays = orn.radialLines(cx, by, s * .2, s * .62, 13, alpha(ND.accent, .55), sw(L, .14), { spread: 150, start: -165, label: 'Fan ray' }) as SlideObj[];
    rays.forEach((r, i) => out.push(amb(r, { kind: 'pulse', min: .35, max: 1, period: 4.5, phase: i / 13 })));
    for (const k of [.72, .58]) out.push(path(cx - s * k * .62, by - s * k * .9, s * k * 1.24, s * k * .9, orn.archPath(.035), alpha(ND.accent, k > .6 ? .8 : .5), { label: 'Stepped arch' }));
    out.push(path(cx - s * .18, by - s * .26, s * .36, s * .26, orn.stepPyramidPath(4), ND.accent, { label: 'Ziggurat' }));
    out.push(line(cx - s * .46, by, cx + s * .46, by, ND.accent, sw(L, .2), { label: 'Plinth' }));
    out.push(path(cx - s * .04, by - s * .78, s * .08, s * .08, orn.polygonPath(4), ND.accent, { label: 'Finial' }));
    return out;
  },
  marker(cx, cy, r) { return [path(cx - r, cy - r, r * 2, r * 2, orn.polygonPath(8, -67.5), ND.accent, { label: 'Brass octagon' })]; },
  panel(x, y, w, h, L) { const j = L.u * .5; return [rect(x, y, w, h, ND.panel, { stroke: ND.accent, strokeWidth: sw(L, .14), label: 'Panel' }), rect(x + j, y + j, w - j * 2, h - j * 2, 'none', { stroke: alpha(ND.accent, .35), strokeWidth: sw(L, .07), label: 'Panel inner line' })]; },
  numeral: plain,
};

// ── 5. Memphis Party — the Rebellious Hand ──────────────────────────────────
// Milan 1981 at a church picnic: squiggles, terrazzo dots, pastel blocks,
// black outlines and drop shadows. Everything pops in.
const MP: ThemePalette = { ground: '#FDF1E4', ground2: '#F7E3CF', ink: '#1B1B1B', muted: '#555049', accent: '#D92B66', accent2: '#24B3A8', accent3: '#FFC93C', panel: '#24B3A8', panelInk: '#1B1B1B', panelMuted: '#163C38', markerInk: '#1B1B1B' };
const MP_PURPLE = '#7B5CE0';
const memphisMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, S = L.safe, r = orn.rng(seed + 5);
    const out: SlideObj[] = [gnd(rect(0, 0, W, H, MP.ground), 'Cream ground')];
    out.push(gnd(halftone(0, 0, Math.min(W * .22, u * 26), Math.min(H * .2, u * 16), u * 1.6, alpha(MP.ink, .5), { rMax: u * .22, rMin: u * .22, label: 'Dot patch' })));
    out.push(gnd(halftone(W - Math.min(W * .2, u * 22), H - Math.min(H * .18, u * 14), Math.min(W * .2, u * 22), Math.min(H * .18, u * 14), u * 1.6, alpha(MP_PURPLE, .5), { rMax: u * .22, rMin: u * .22, label: 'Dot patch' })));
    // Confetti in the margin band only.
    const cols = [MP.accent, MP.accent2, MP.accent3, MP_PURPLE, MP.ink];
    for (let i = 0; i < 14; i++) {
      const top = i % 2 === 0, px = r() * W, py = top ? r() * S.y * .8 : S.bottom + S.y * .15 + r() * (H - S.bottom) * .6;
      const c = cols[i % cols.length], s = u * (1 + r() * 1.2), k = i % 4;
      let o: SlideObj;
      if (k === 0) o = circle(px, py, s * .45, c, { label: 'Confetti' });
      else if (k === 1) o = rect(px, py, s * 2.2, s * .4, c, { rotation: r() * 180, label: 'Confetti' });
      else if (k === 2) o = path(px, py, s, s, orn.polygonPath(3), c, { rotation: r() * 360, label: 'Confetti' });
      else o = path(px, py, s * 2.6, s, orn.sineOpenPath(2, 40), 'none', { stroke: c, strokeWidth: sw(L, .3), rotation: r() * 40 - 20, open: true, label: 'Confetti' });
      if (i % 3 === 0) amb(o, k === 2 ? { kind: 'spin', degPerSec: 14 * (i % 2 ? 1 : -1) } : { kind: 'drift', ax: u * .5, ay: u * .4, period: 4 + i % 4, phase: i * .2 });
      out.push(gnd(o));
    }
    return out;
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 12), h = u * 1.4, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h, objs: [
      path(x0, y, dw * .78, h, orn.sineOpenPath(4, 34), 'none', { stroke: MP.ink, strokeWidth: sw(L, .32), open: true, label: 'Squiggle' }),
      circle(x0 + dw * .9, y + h / 2, h * .38, MP.accent2, { label: 'Dot' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, zh = Math.min(u * 1.4, L.safe.y * .4);
    return [
      path(0, H - zh, W, zh, orn.zigzagPath(Math.max(8, Math.round(W / (u * 3))), 60), MP.accent, { label: 'Zigzag hem' }),
      path(W - u * 9 - inset(L), inset(L), u * 9, u * 2.2, orn.sineOpenPath(3, 36), 'none', { stroke: MP.ink, strokeWidth: sw(L, .35), open: true, label: 'Squiggle' }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), off = L.u * .5;
    return [
      circle(cx - s * .1 + off, cy - s * .08 + off, s * .3, MP.ink, { label: 'Shadow' }),
      circle(cx - s * .1, cy - s * .08, s * .3, MP.accent, { label: 'Pink disc' }),
      pathPx(cx - s * .48, cy + s * .06, s * .5, s * .26, halfDiscD(cx - s * .23, cy + s * .32, s * .25, 0), MP.accent2, { label: 'Teal dome', stroke: MP.ink, strokeWidth: sw(L, .25) }),
      amb(path(cx + s * .08, cy - s * .44, s * .34, s * .3, orn.polygonPath(3), MP.accent3, { stroke: MP.ink, strokeWidth: sw(L, .25), label: 'Triangle' }), { kind: 'spin', degPerSec: 8 }),
      halftone(cx + s * .12, cy + s * .08, s * .34, s * .3, s * .055, MP_PURPLE, { rMin: s * .012, rMax: s * .012, label: 'Dot grid' }),
      amb(path(cx - s * .46, cy - s * .46, s * .5, s * .14, orn.sineOpenPath(3, 40), 'none', { stroke: MP.ink, strokeWidth: sw(L, .35), open: true, label: 'Squiggle' }), { kind: 'drift', ax: s * .02, ay: s * .015, period: 3.2 }),
      amb(rect(cx + s * .2, cy + s * .34, s * .26, s * .06, MP.ink, { rotation: -20 + (seed % 3) * 10, label: 'Dash' }), { kind: 'sway', deg: 8, period: 2.6 }),
    ];
  },
  marker(cx, cy, r, _l, L) { const o = L.u * .35; return [circle(cx + o, cy + o, r, MP.ink, { label: 'Shadow' }), circle(cx, cy, r, MP.accent3, { stroke: MP.ink, strokeWidth: sw(L, .2), label: 'Yellow disc' })]; },
  panel(x, y, w, h, L) { const o = L.u * .7; return [rect(x + o, y + o, w, h, MP.ink, { label: 'Panel shadow' }), rect(x, y, w, h, MP.panel, { stroke: MP.ink, strokeWidth: sw(L, .22), label: 'Panel' })]; },
  numeral: plain,
};

// ── 6. Raw Brutalist — the Rebellious Hand ──────────────────────────────────
// Board-marked concrete, black slabs, a signal-orange block, monospace
// coordinates. Hits like a door; leaves like a shove.
const BR: ThemePalette = { ground: '#D8D6CF', ground2: '#C9C7BF', ink: '#0A0A0A', muted: '#3B3B38', accent: '#A8360A', accent2: '#FF5A1F', accent3: '#0A0A0A', panel: '#0A0A0A', panelInk: '#D8D6CF', panelMuted: '#A3A19A', markerInk: '#D8D6CF' };
const brutalMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L;
    return [
      gnd(rect(0, 0, W, H, BR.ground), 'Concrete'),
      gnd(bands(0, 0, W, H, u * 6, sw(L, .08), alpha(BR.ink, .06), { label: 'Board marks' })),
      grain(L, seed + 2, BR.ink, 260, .14, 1, 'Aggregate'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 20), t = u * .7, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t, objs: [rect(x0, y, dw - t * 1.6, t, BR.ink, { label: 'Slab rule' }), rect(x0 + dw - t, y, t, t, BR.accent2, { label: 'Signal block' })] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .025), c = u * 1.6;
    const cross = (x: number, y: number) => dLine(x - c, y, x + c, y) + dLine(x, y - c, x, y + c);
    return [
      rect(i, i, W - i * 2, H - i * 2, 'none', { stroke: BR.ink, strokeWidth: Math.max(2, u * .45), label: 'Slab border' }),
      rect(i + u * 4, i - u * .6, u * 10, u * 1.2, BR.accent2, { label: 'Signal tab' }),
      strokePx(0, 0, W, H, cross(i, i) + cross(W - i, i) + cross(i, H - i) + cross(W - i, H - i), BR.accent, sw(L, .2), { label: 'Crosshairs' }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), u = L.u;
    const ch = s * .08;
    return [
      rect(cx - s * .46, cy - s * .3, s * .6, s * .74, BR.ink, { label: 'Slab' }),
      rect(cx - s * .02, cy - s * .46, s * .48, s * .42, BR.accent2, { label: 'Signal block' }),
      rect(cx + s * .06, cy + s * .02, s * .4, s * .42, 'none', { stroke: BR.ink, strokeWidth: Math.max(2, u * .4), label: 'Open box' }),
      amb(strokePx(cx + s * .26 - ch, cy + s * .23 - ch, ch * 2, ch * 2, dLine(cx + s * .26 - ch, cy + s * .23, cx + s * .26 + ch, cy + s * .23) + dLine(cx + s * .26, cy + s * .23 - ch, cx + s * .26, cy + s * .23 + ch) + dCircle(cx + s * .26, cy + s * .23, ch * .55), BR.ink, sw(L, .18), { label: 'Crosshair' }), { kind: 'jitter', ax: s * .03, ay: s * .03, step: .7 }),
      amb(rect(cx - s * .38, cy + s * .3, s * .1, s * .05, BR.accent2, { label: 'Cursor' }), { kind: 'flicker', rate: 2, depth: 1 }),
    ];
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, BR.ink, { label: 'Slab mark' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, BR.panel, { label: 'Panel' }), rect(x, y - L.u * .6, w * .3, L.u * .6, BR.accent2, { label: 'Panel tab' })]; },
  numeral: pad2,
};

// ── 7. Deconstructed — the Rebellious Hand ──────────────────────────────────
// Postmodern layering: planes knocked off-axis, a serif in conversation with
// a typewriter mono, registration crosses, coral offsets. Arrives at a tilt.
const DC: ThemePalette = { ground: '#EEEAE2', ground2: '#E2DDD2', ink: '#16161D', muted: '#55525A', accent: '#2F3DD6', accent2: '#FF6A4D', accent3: '#B9C7B0', panel: '#16161D', panelInk: '#EEEAE2', panelMuted: '#B6B2AA', markerInk: '#EEEAE2' };
const deconMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, DC.ground), 'Paper'),
      gnd(amb(rect(-m * .12, H * .55, m * .5, m * .7, alpha(DC.accent, .1), { rotation: -9, label: 'Blue plane' }), { kind: 'sway', deg: 1.2, period: 14 })),
      gnd(bands(W * .78, -u, W * .3, H * .3, u * 1.1, sw(L, .1), alpha(DC.ink, .16), { label: 'Ruled fragment' })),
      gnd(circle(W * .92, H * .82, m * .16, 'none', { stroke: alpha(DC.accent2, .55), strokeWidth: sw(L, .2), label: 'Coral orbit' })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 15), x0 = align === 'center' ? x + (w - dw) / 2 : x, s = sw(L, .18);
    return { h: u * 1.1, objs: [
      line(x0, y + u * .3, x0 + dw * .8, y + u * .3, DC.ink, s, { label: 'Rule' }),
      line(x0 + dw * .2, y + u * .8, x0 + dw, y + u * .8, DC.accent2, s, { label: 'Offset rule' }),
      rect(x0 + dw * .8 - u * .2, y, u * 1.1, u * 1.1, DC.accent, { rotation: 12, label: 'Chip' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L), c = u * 1.4;
    const reg = (x: number, y: number) => dLine(x - c, y, x + c, y) + dLine(x, y - c, x, y + c) + dCircle(x, y, c * .55);
    return [
      strokePx(0, 0, W, H, reg(i + c, i + c) + reg(W - i - c, H - i - c), DC.ink, sw(L, .12), { label: 'Registration marks' }),
      line(W - i - u * 14, i + u * .6, W - i, i + u * .6, DC.accent2, sw(L, .3), { label: 'Coral slash' }),
      line(i, H - i - u * .6, i + u * 14, H - i - u * .6, DC.accent, sw(L, .3), { label: 'Blue slash' }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h);
    return [
      amb(rect(cx - s * .4, cy - s * .36, s * .5, s * .66, DC.accent, { rotation: -8, label: 'Blue plane' }), { kind: 'sway', deg: 2, period: 11 }),
      gridLines(cx - s * .05, cy - s * .44, s * .44, s * .44, s * .055, s * .055, alpha(DC.ink, .45), sw(L, .08), { label: 'Grid fragment' }),
      amb(pathPx(cx - s * .1, cy - s * .1, s * .56, s * .28, halfDiscD(cx + s * .18, cy + s * .18, s * .28, 0), DC.accent2, { label: 'Coral dome', blend: 'multiply' }), { kind: 'drift', ax: s * .02, ay: s * .01, period: 7 }),
      circle(cx - s * .2, cy + s * .26, s * .16, 'none', { stroke: DC.ink, strokeWidth: sw(L, .18), label: 'Outline disc' }),
      bands(cx - s * .46, cy + s * .3, s * .4, s * .14, s * .035, s * .012, DC.ink, { label: 'Ruled strip' }),
      amb(rect(cx + s * .22, cy + s * .26, s * .2, s * .2, DC.accent3, { rotation: 18 + (seed % 2) * 6, label: 'Sage tile' }), { kind: 'sway', deg: 3, period: 8, phase: .3 }),
      line(cx - s * .48, cy - s * .48, cx + s * .48, cy + s * .14, alpha(DC.ink, .7), sw(L, .12), { label: 'Cut line' }),
    ];
  },
  marker(cx, cy, r, _l, L) { const o = L.u * .4; return [rect(cx - r + o, cy - r + o, r * 2, r * 2, 'none', { stroke: DC.accent2, strokeWidth: sw(L, .2), rotation: 8, label: 'Offset outline' }), rect(cx - r, cy - r, r * 2, r * 2, DC.accent, { rotation: -6, label: 'Blue chip' })]; },
  panel(x, y, w, h, L) { const o = L.u * .8; return [rect(x - o, y + o, w, h, 'none', { stroke: DC.accent2, strokeWidth: sw(L, .25), label: 'Panel offset' }), rect(x, y, w, h, DC.panel, { label: 'Panel' })]; },
  numeral: pad2,
};

// ── 8. Riso Bloom — the Rebellious Hand ─────────────────────────────────────
// Two-drum risograph: fluoro pink over riso blue, overprints going purple,
// a hair out of register, paper tooth. Inked on like a stamp.
const RI: ThemePalette = { ground: '#F4EFE6', ground2: '#ECE5D8', ink: '#1F2A60', muted: '#56507A', accent: '#D81F84', accent2: '#0078BF', accent3: '#FFE800', panel: '#0078BF', panelInk: '#FFFFFF', panelMuted: '#DCEBFA', markerInk: '#FFFFFF' };
const RI_PINK = '#FF48B0';
const risoMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, RI.ground), 'Paper'),
      gnd(circle(W - m * .02, -m * .02, m * .26, alpha(RI_PINK, .8), { label: 'Pink ink', blend: 'multiply' })),
      gnd(amb(circle(W - m * .1, m * .06, m * .2, alpha(RI.accent2, .65), { label: 'Blue ink', blend: 'multiply' }), { kind: 'jitter', ax: m * .004, ay: m * .003, step: .6 })),
      gnd(halftone(0, H - m * .24, m * .36, m * .24, m * .02, alpha(RI.accent2, .75), { grade: '-x', rMin: m * .001, rMax: m * .008, label: 'Halftone corner' })),
      grain(L, seed + 7, RI.ink, 220, .1, .8, 'Paper tooth'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 13), t = u * .6, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t + u * .3, objs: [rect(x0, y, dw, t, alpha(RI_PINK, .9), { label: 'Pink stroke', blend: 'multiply' }), rect(x0 + u * .35, y + u * .3, dw, t, alpha(RI.accent2, .75), { label: 'Blue stroke', blend: 'multiply' })] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .03), o = u * .35;
    return [
      rect(i, i, W - i * 2, H - i * 2, 'none', { stroke: alpha(RI_PINK, .9), strokeWidth: sw(L, .3), label: 'Pink rule', blend: 'multiply' }),
      amb(rect(i + o, i + o * .6, W - i * 2, H - i * 2, 'none', { stroke: alpha(RI.accent2, .8), strokeWidth: sw(L, .3), label: 'Blue rule', blend: 'multiply' }), { kind: 'jitter', ax: o * .4, ay: o * .3, step: .8 }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h);
    return [
      circle(cx - s * .12, cy - s * .06, s * .3, alpha(RI_PINK, .88), { label: 'Pink bloom', blend: 'multiply' }),
      amb(circle(cx + s * .1, cy + s * .08, s * .28, alpha(RI.accent2, .72), { label: 'Blue bloom', blend: 'multiply' }), { kind: 'jitter', ax: s * .006, ay: s * .006, step: .5 }),
      halftone(cx - s * .42, cy - s * .36, s * .5, s * .6, s * .04, alpha(RI.ink, .55), { grade: 'radial', rMin: s * .016, rMax: 0, label: 'Shade' }),
      amb(circle(cx + s * .32, cy - s * .3, s * .08, RI.accent3, { label: 'Yellow dot', blend: 'multiply' }), { kind: 'drift', ax: s * .02, ay: s * .02, period: 6 }),
      path(cx - s * .46, cy + s * .3, s * .44, s * .14, orn.wavePath(3, 30, 26), alpha(RI.accent2, .8), { label: 'Ink wave', blend: 'multiply' }),
    ];
  },
  marker(cx, cy, r, _l, L) { const o = L.u * .25; return [circle(cx + o, cy + o, r, alpha(RI.accent2, .8), { label: 'Blue offset', blend: 'multiply' }), circle(cx, cy, r, alpha(RI.accent, .92), { label: 'Pink dot', blend: 'multiply' })]; },
  panel(x, y, w, h, L) { const o = L.u * .45; return [rect(x + o, y + o, w, h, alpha(RI_PINK, .85), { label: 'Panel offset', blend: 'multiply' }), rect(x, y, w, h, RI.panel, { label: 'Panel' })]; },
  numeral: pad2,
};

// ── 9. Suprematist Flight — the Futurist ────────────────────────────────────
// Pure planes in weightless flight: black square, red beam, blue slivers on
// warm white, all riding one diagonal. Slips in at an angle; floats away.
const SU: ThemePalette = { ground: '#F3EFE6', ground2: '#E9E3D6', ink: '#111111', muted: '#4E4B45', accent: '#D7261E', accent2: '#111111', accent3: '#2B4C9B', panel: '#111111', panelInk: '#F3EFE6', panelMuted: '#BDB8AE', markerInk: '#F3EFE6' };
const SU_Y = '#E9B824';
const supremMotif: ThemeMotif = {
  ground(L) {
    const { W, H } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, SU.ground), 'Warm white'),
      gnd(circle(W * .1, H * .12, m * .36, 'none', { stroke: alpha(SU.ink, .08), strokeWidth: sw(L, .12), label: 'Faint orbit' })),
      gnd(line(W * .7, H, W, H * .55, alpha(SU.accent, .25), sw(L, .2), { label: 'Trajectory' })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 12), x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: u * 1.4, objs: [rect(x0, y + u * .4, dw * .8, u * .6, SU.accent, { rotation: -6, label: 'Red beam' }), rect(x0 + dw * .85, y + u * .1, u * 1.2, u * 1.2, SU.ink, { rotation: -6, label: 'Black square' })] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L);
    return [
      amb(rect(W - i - u * 14, i + u * .6, u * 13, u * 1, SU.accent3, { rotation: -14, label: 'Blue sliver' }), { kind: 'drift', ax: u * .6, ay: u * .3, period: 9 }),
      amb(rect(W - i - u * 9, i + u * 2.6, u * 7, u * .45, SU.accent, { rotation: -14, label: 'Red sliver' }), { kind: 'drift', ax: u * .8, ay: u * .4, period: 7, phase: .3 }),
      amb(rect(i, H - i - u * 3, u * 3, u * 3, SU.ink, { rotation: -14, label: 'Small square' }), { kind: 'drift', ax: u * .4, ay: u * .5, period: 11, phase: .4 }),
      amb(rect(i + u * 4.4, H - i - u * 1.4, u * 9, u * .5, SU_Y, { rotation: -14, label: 'Yellow sliver' }), { kind: 'drift', ax: u * .5, ay: u * .3, period: 8, phase: .7 }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h);
    const fly = (o: SlideObj, ax: number, per: number, ph: number) => amb(o, { kind: 'drift', ax: s * ax, ay: s * ax * .6, period: per, phase: ph });
    return [
      fly(rect(cx - s * .42, cy - s * .4, s * .4, s * .4, SU.ink, { rotation: -14, label: 'Black square' }), .01, 13, 0),
      fly(rect(cx - s * .3, cy + s * .02, s * .78, s * .08, SU.accent, { rotation: -24, label: 'Red beam' }), .018, 9, .3),
      fly(rect(cx + s * .06, cy - s * .36, s * .3, s * .04, SU.accent3, { rotation: -24, label: 'Blue sliver' }), .025, 7, .6),
      fly(rect(cx - s * .1, cy + s * .3, s * .36, s * .028, SU_Y, { rotation: -24, label: 'Yellow sliver' }), .03, 8, .1),
      fly(rect(cx + s * .28, cy + s * .16, s * .12, s * .12, SU.accent3, { rotation: -24, label: 'Blue chip' }), .02, 10, .8),
      amb(circle(cx + s * .32, cy - s * .2, s * .06, SU.ink, { label: 'Black disc' }), { kind: 'orbit', cx, cy, degPerSec: 5, squash: .4, tilt: -24 }),
      line(cx - s * .46, cy + s * .46, cx + s * .44, cy + s * .06, SU.ink, sw(L, .12), { label: 'Hairline' }),
    ];
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, SU.ink, { rotation: -12, label: 'Black square' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, SU.panel, { label: 'Panel' }), rect(x + w * .6, y - L.u * .5, w * .38, L.u * .9, SU.accent, { rotation: -4, label: 'Panel beam' })]; },
  numeral: plain,
};

// ── 10. Constructivist — the Futurist ───────────────────────────────────────
// Agit-prop geometry on newsprint: a red wedge, a black beam, rays from a
// circle, condensed capitals. Slams like a press; pulls out in one wipe.
const CO: ThemePalette = { ground: '#E9E1CF', ground2: '#DDD3BE', ink: '#141414', muted: '#4A4339', accent: '#C1121F', accent2: '#141414', accent3: '#8A7D66', panel: '#C1121F', panelInk: '#FFFFFF', panelMuted: '#F5D3CF', markerInk: '#FFFFFF' };
const constructMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H } = L;
    return [
      gnd(rect(0, 0, W, H, CO.ground), 'Newsprint'),
      gnd(pathPx(0, H * .78, W * .12, H * .22, dPoly([0, H * .78, W * .12, H, 0, H]), CO.accent, { label: 'Red wedge' })),
      gnd(pathPx(W * .86, 0, W * .14, H * .16, dPoly([W * .86, 0, W, 0, W, H * .16]), CO.ink, { label: 'Black wedge' })),
      grain(L, seed + 3, CO.ink, 160, .08, .9, 'Newsprint grain'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 15), t = u * .7, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: u * 1.4, objs: [rect(x0, y + (u * 1.4 - t) / 2, dw - u * 1.6, t, CO.accent, { label: 'Red beam' }), path(x0 + dw - u * 1.4, y, u * 1.4, u * 1.4, orn.chevronPath(40), CO.ink, { label: 'Arrow' })] };
  },
  frame(L) {
    const { W, H, u } = L, m = Math.min(W, H);
    return [
      rect(W * .9 - u * 3, H - L.safe.y * .7, u * 22, u * 1.1, CO.ink, { rotation: -24, label: 'Black beam' }),
      circle(-m * .02, m * .06, m * .06, CO.accent, { label: 'Red sun' }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h);
    const rays = orn.radialLines(cx - s * .1, cy + s * .05, s * .3, s * .5, 9, CO.ink, sw(L, .25), { spread: 100, start: -150, label: 'Ray' }) as SlideObj[];
    return [
      circle(cx - s * .1, cy + s * .05, s * .26, CO.accent, { label: 'Red circle' }),
      ...rays.map((r, i) => amb(r, { kind: 'pulse', min: .3, max: 1, period: 3, phase: i / 9 })),
      rect(cx - s * .5, cy - s * .02, s * 1, s * .1, CO.ink, { rotation: -28, label: 'Black beam' }),
      path(cx + s * .18, cy + s * .14, s * .3, s * .3, orn.polygonPath(3, 0), CO.ink, { label: 'Wedge' }),
      amb(line(cx - s * .46, cy + s * .44, cx + s * .46, cy + s * .44, CO.ink, sw(L, .25), { label: 'Base rule' }), { kind: 'sweep', period: 4, color: '#FFFFFF', width: .25 }),
    ];
  },
  marker(cx, cy, r) { return [circle(cx, cy, r, CO.accent, { label: 'Red disc' })]; },
  panel(x, y, w, h, L) { return [rect(x - L.u * .8, y + L.u * .8, w, h, CO.ink, { label: 'Panel shadow' }), rect(x, y, w, h, CO.panel, { label: 'Panel' })]; },
  numeral: plain,
};

// ── 11. Frosted Glass — the Futurist ────────────────────────────────────────
// Light through frosted panes: violet, teal and peach orbs drifting under a
// translucent sheet with a bright edge. Resolves in like a focus pull.
const GL: ThemePalette = { ground: '#E9ECF7', ground2: '#F6F2FB', ink: '#151A33', muted: '#4A5070', accent: '#5B4BDB', accent2: '#16B8C6', accent3: '#FF9A76', panel: 'rgba(255,255,255,0.6)', panelInk: '#151A33', panelMuted: '#4A5070', markerInk: '#151A33' };
const glassMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.max(W, H);
    return [
      gnd(rect(0, 0, W, H, GL.ground, { gradient: { kind: 'LINEAR', angle: 45, stops: [{ offset: 0, color: GL.ground2 }, { offset: 1, color: GL.ground }] } }), 'Mist ground'),
      gnd(amb(glowAt(W * .15, H * .2, m * .34, m * .3, GL.accent, .42, 'Violet orb'), { kind: 'drift', ax: u * 5, ay: u * 3, period: 17 })),
      gnd(amb(glowAt(W * .88, H * .3, m * .3, m * .28, GL.accent2, .38, 'Teal orb'), { kind: 'drift', ax: u * 4, ay: u * 5, period: 21, phase: .3 })),
      gnd(amb(glowAt(W * .6, H * 1.02, m * .36, m * .26, GL.accent3, .45, 'Peach orb'), { kind: 'drift', ax: u * 6, ay: u * 2, period: 19, phase: .6 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 12), t = u * .55, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t, objs: [amb(rect(x0, y, dw, t, GL.accent, { rx: t / 2, gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: GL.accent }, { offset: 1, color: GL.accent2 }] }, label: 'Gradient pill' }), { kind: 'sweep', period: 5, color: '#FFFFFF', width: .3 })] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .035);
    return [rect(i, i, W - i * 2, H - i * 2, 'rgba(255,255,255,0.26)', { rx: u * 2.4, stroke: 'rgba(255,255,255,0.85)', strokeWidth: sw(L, .14), label: 'Glass sheet', shadow: { x: 0, y: u * .5, blur: u * 2, color: 'rgba(40,40,90,0.10)' } })];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), u = L.u;
    const orb = (dx: number, dy: number, r: number, c1: string, c2: string, label: string) => circle(cx + dx, cy + dy, r, c1, { gradient: { kind: 'LINEAR', angle: 45, stops: [{ offset: 0, color: c1 }, { offset: 1, color: c2 }] }, label });
    return [
      amb(orb(-s * .14, -s * .1, s * .26, GL.accent, '#9C8CFF', 'Violet sphere'), { kind: 'drift', ax: u * .8, ay: u * .6, period: 9 }),
      amb(orb(s * .18, s * .12, s * .2, GL.accent2, '#7FE3EC', 'Teal sphere'), { kind: 'drift', ax: u * .7, ay: u * .9, period: 11, phase: .4 }),
      amb(orb(s * .22, -s * .26, s * .1, GL.accent3, '#FFD0B5', 'Peach sphere'), { kind: 'orbit', cx, cy, degPerSec: 6, squash: .6 }),
      rect(cx - s * .34, cy - s * .2, s * .62, s * .52, 'rgba(255,255,255,0.38)', { rx: s * .06, stroke: 'rgba(255,255,255,0.9)', strokeWidth: sw(L, .14), label: 'Frosted pane' }),
      rect(cx - s * .3, cy - s * .16, s * .2, s * .025, 'rgba(255,255,255,0.9)', { rx: s * .0125, label: 'Glint' }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [circle(cx, cy, r, 'rgba(255,255,255,0.7)', { stroke: GL.accent, strokeWidth: sw(L, .16), label: 'Frosted disc' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, GL.panel, { rx: L.u * 1.4, stroke: 'rgba(255,255,255,0.95)', strokeWidth: sw(L, .12), shadow: { x: 0, y: L.u * .4, blur: L.u * 1.8, color: 'rgba(40,40,90,0.12)' }, label: 'Panel' })]; },
  numeral: pad2,
};

// ── 12. Kinetic Op — the Futurist ───────────────────────────────────────────
// Op-art in motion: concentric rings drifting into moiré on black, stripes
// that run in the margins, one lime signal. Stretches on; zooms away.
const KO: ThemePalette = { ground: '#0B0B0D', ground2: '#151518', ink: '#F5F5F0', muted: '#A9A9A2', accent: '#C6FF3D', accent2: '#FFFFFF', accent3: '#FF3DBE', panel: '#F5F5F0', panelInk: '#0B0B0D', panelMuted: '#4A4A46', markerInk: '#0B0B0D' };
function ringsD(cx: number, cy: number, r0: number, r1: number, step: number): string { let d = ''; for (let r = r0; r <= r1; r += step) d += dCircle(cx, cy, r); return d; }
const kineticMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.max(W, H), cx = W * .08, cy = H * .5, R = m * .7, st = u * 2.2;
    return [
      gnd(rect(0, 0, W, H, KO.ground), 'Black'),
      gnd(strokePx(cx - R, cy - R, R * 2, R * 2, ringsD(cx, cy, st, R, st), alpha(KO.ink, .07), sw(L, .5), { label: 'Rings' })),
      gnd(amb(strokePx(cx - R + st, cy - R, R * 2, R * 2, ringsD(cx + st, cy, st, R, st), alpha(KO.ink, .07), sw(L, .5), { label: 'Moiré rings' }), { kind: 'drift', ax: u * 2.4, ay: u * 1.2, period: 12 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, t = u * .5, ws = [8, 4, 2, 1].map(k => k * u), gap = u * .6, total = ws.reduce((a, b) => a + b, 0) + gap * 3;
    let px = align === 'center' ? x + (w - total) / 2 : x;
    const objs: SlideObj[] = [];
    ws.forEach((dw, i) => { objs.push(amb(rect(px, y, dw, t, i ? alpha(KO.accent, 1 - i * .2) : KO.accent, { label: 'Speed line' }), { kind: 'pulse', min: .4, max: 1, period: 1.6, phase: -i * .15 })); px += dw + gap; });
    return { h: t, objs };
  },
  frame(L) {
    const { W, H, u } = L, bw = Math.min(L.safe.x * .45, u * 2.6), gap = u * 1.2;
    return [
      amb(bands(0, -gap * 2, bw, H + gap * 4, gap, gap * .5, alpha(KO.ink, .7), { label: 'Running stripes' }), { kind: 'scroll', dx: 0, dy: gap * 2, period: 1.6 }),
      amb(bands(W - bw, -gap * 2, bw, H + gap * 4, gap, gap * .5, alpha(KO.accent, .8), { label: 'Running stripes' }), { kind: 'scroll', dx: 0, dy: -gap * 2, period: 1.6 }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), st = s * .035;
    return [
      strokePx(cx - s / 2, cy - s / 2, s, s, ringsD(cx, cy, st, s * .48, st * 2), KO.ink, st, { label: 'Op rings' }),
      amb(strokePx(cx - s / 2, cy - s / 2, s, s, ringsD(cx + st * .9, cy, st, s * .44, st * 2), alpha(KO.ink, .55), st * .6, { label: 'Moiré rings' }), { kind: 'drift', ax: st * 1.6, ay: st, period: 6 }),
      amb(circle(cx + s * .3, cy - s * .3, s * .07, KO.accent, { label: 'Signal dot' }), { kind: 'orbit', cx, cy, degPerSec: 24 }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [circle(cx, cy, r, KO.accent, { label: 'Lime disc' }), circle(cx, cy, r * 1.22, 'none', { stroke: KO.ink, strokeWidth: sw(L, .14), label: 'Ring' })]; },
  panel(x, y, w, h) { return [rect(x, y, w, h, KO.panel, { label: 'Panel' })]; },
  numeral: pad2,
};

// ── Registry ─────────────────────────────────────────────────────────────────
const AC = 'Art Council' as const;
export const MODERN_THEMES_A: SlideTheme[] = [
  {
    id: 'bauhaus', name: 'Bauhaus Primer', director: 'the Classical Mind', council: AC, dark: false,
    lens: 'Form follows function: circle, square, triangle in the three primaries on a construction grid.',
    use: 'Teaching series, kids & family, foundations classes', c: BH,
    t: { display: 'josefin', text: 'outfit', label: 'josefin', accent: 'outfit', displayWeight: 700, displayTransform: 'uppercase', displayTracking: .03, displayLeading: 1.0, displayScale: 1.04, textWeight: 400, labelWeight: 600, labelTracking: .3, accentWeight: 300 },
    motion: { enter: 'drop', enterSec: .95, exit: 'shrink', exitSec: .45, ruleGrow: true }, motif: bauhausMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'swiss', name: 'International Grid', director: 'the Classical Mind', council: AC, dark: false,
    lens: 'Objective clarity: the visible column grid, black and one red, a heavy grotesque flush left.',
    use: 'Announcements, reports, data-heavy screens, modern services', c: SW,
    t: { display: 'inter', text: 'inter', label: 'inter', accent: 'inter', displayWeight: 800, displayTransform: 'none', displayTracking: -.035, displayLeading: .98, textWeight: 400, labelWeight: 700, labelTracking: .08, accentWeight: 400 },
    motion: { enter: 'wipe', enterSec: .8, exit: 'slide', exitSec: .4, ruleGrow: true }, motif: swissMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'destijl', name: 'De Stijl', director: 'the Classical Mind', council: AC, dark: false,
    lens: 'Neo-plastic balance: black bars, white fields and three primaries kept in tension at the edge.',
    use: 'Section breaks, art & design nights, creative ministries', c: DS,
    t: { display: 'spaceGrotesk', text: 'manrope', label: 'spaceMono', accent: 'manrope', displayWeight: 700, displayTransform: 'uppercase', displayTracking: .02, displayLeading: 1.0, textWeight: 400, labelWeight: 700, labelTracking: .14, accentWeight: 400 },
    motion: { enter: 'stretch', enterSec: .9, exit: 'scan-out', exitSec: .45, ruleGrow: true }, motif: destijlMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'neodeco', name: 'Neo-Deco', director: 'the Classical Mind', council: AC, dark: true,
    lens: 'Symmetry with sparkle: emerald lacquer, brass fans, triple lines and stepped crowns.',
    use: 'Galas, anniversaries, New Year, choir concerts', c: ND,
    t: { display: 'limelight', text: 'raleway', label: 'raleway', accent: 'raleway', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .05, displayLeading: 1.06, displayScale: .96, textWeight: 400, labelWeight: 600, labelTracking: .32, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'scan', enterSec: 1.1, exit: 'fade', exitSec: .6, ruleGrow: true }, motif: neodecoMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'memphis', name: 'Memphis Party', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'Joy without apology: squiggles, terrazzo dots, pastel blocks and hard black outlines.',
    use: 'Kids church, VBS, birthdays, summer events', c: MP,
    t: { display: 'syne', text: 'nunito', label: 'dmMono', accent: 'shrikhand', displayWeight: 800, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.0, displayScale: .88, textWeight: 600, labelWeight: 500, labelTracking: .12, accentWeight: 400 },
    motion: { enter: 'pop', enterSec: .8, exit: 'drop', exitSec: .5, ruleGrow: true }, motif: memphisMotif, slot: { rx: .06, tilt: -2 },
  },
  {
    id: 'brutalist', name: 'Raw Brutalist', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'Truth to materials: board-marked concrete, black slabs, a signal-orange block, raw mono.',
    use: 'Young adults, city campuses, bold sermon series', c: BR,
    t: { display: 'archivoBlack', text: 'archivo', label: 'ibmPlexMono', accent: 'ibmPlexMono', displayWeight: 400, displayTransform: 'uppercase', displayTracking: -.01, displayLeading: .94, textWeight: 500, labelWeight: 600, labelTracking: .04, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'slam', enterSec: .55, exit: 'slide-right', exitSec: .35, ruleGrow: false }, motif: brutalMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'deconstruct', name: 'Deconstructed', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'Postmodern layering: planes off-axis, serif against mono, registration marks left showing.',
    use: 'Questions series, apologetics, arts & culture nights', c: DC,
    t: { display: 'gloock', text: 'spaceGrotesk', label: 'spaceMono', accent: 'instrumentSerif', displayWeight: 400, displayTransform: 'none', displayTracking: -.02, displayLeading: 1.02, textWeight: 400, labelWeight: 400, labelTracking: .2, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'tilt', enterSec: .9, exit: 'glitch-out', exitSec: .45, ruleGrow: false }, motif: deconMotif, slot: { rx: 0, tilt: 3 },
  },
  {
    id: 'riso', name: 'Riso Bloom', director: 'the Rebellious Hand', council: AC, dark: false,
    lens: 'Two-drum risograph: fluoro pink over riso blue, purple overprints, a hair out of register.',
    use: 'Small groups, zines, craft fairs, creative workshops', c: RI,
    t: { display: 'bricolage', text: 'epilogue', label: 'dmMono', accent: 'epilogue', displayWeight: 800, displayTransform: 'none', displayTracking: -.03, displayLeading: .98, textWeight: 400, labelWeight: 500, labelTracking: .12, accentItalic: true, accentWeight: 300 },
    motion: { enter: 'stamp', enterSec: .8, exit: 'fade-up', exitSec: .45, ruleGrow: false }, motif: risoMotif, slot: { rx: .05, tilt: 1.5 },
  },
  {
    id: 'suprematist', name: 'Suprematist Flight', director: 'the Futurist', council: AC, dark: false,
    lens: 'Pure feeling in pure planes: a black square, a red beam and slivers flying one diagonal.',
    use: 'Vision Sunday, launches, sermon series on hope', c: SU,
    t: { display: 'bigShoulders', text: 'spaceGrotesk', label: 'chakra', accent: 'spaceGrotesk', displayWeight: 800, displayTransform: 'uppercase', displayTracking: .02, displayLeading: .92, displayScale: 1.12, textWeight: 400, labelWeight: 600, labelTracking: .2, accentWeight: 300 },
    motion: { enter: 'float', enterSec: 1.0, exit: 'drop', exitSec: .5, ruleGrow: true }, motif: supremMotif, slot: { rx: 0, tilt: -4 },
  },
  {
    id: 'constructivist', name: 'Constructivist', director: 'the Futurist', council: AC, dark: false,
    lens: 'Geometry that builds: a red wedge, a black beam, rays from a circle, condensed capitals.',
    use: 'Outreach, service days, building campaigns, rallies', c: CO,
    t: { display: 'oswald', text: 'archivo', label: 'staatliches', accent: 'archivo', displayWeight: 700, displayTransform: 'uppercase', displayTracking: .01, displayLeading: .95, textWeight: 400, labelWeight: 400, labelTracking: .14, accentItalic: true, accentWeight: 500 },
    motion: { enter: 'slam', enterSec: .65, exit: 'wipe-out', exitSec: .45, ruleGrow: true }, motif: constructMotif, slot: { rx: 0, tilt: -3 },
  },
  {
    id: 'glass', name: 'Frosted Glass', director: 'the Futurist', council: AC, dark: false,
    lens: 'Light through frosted panes: drifting colour orbs under a translucent sheet with a bright edge.',
    use: 'Contemporary worship, conferences, livestream lower-energy moments', c: GL,
    t: { display: 'outfit', text: 'dmSans', label: 'outfit', accent: 'outfit', displayWeight: 600, displayTransform: 'none', displayTracking: -.02, displayLeading: 1.02, textWeight: 400, labelWeight: 500, labelTracking: .18, accentWeight: 300 },
    motion: { enter: 'reveal', enterSec: 1.0, exit: 'shrink', exitSec: .45, ruleGrow: true }, motif: glassMotif, slot: { rx: .08, tilt: 0 },
  },
  {
    id: 'kinetic', name: 'Kinetic Op', director: 'the Futurist', council: AC, dark: true,
    lens: 'Op-art in motion: rings drifting into moiré, running stripes, one lime signal.',
    use: 'Youth nights, countdowns, LED walls, high-energy openers', c: KO,
    t: { display: 'michroma', text: 'manrope', label: 'tomorrow', accent: 'tomorrow', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .02, displayLeading: 1.1, displayScale: .8, textWeight: 500, labelWeight: 500, labelTracking: .2, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'stretch', enterSec: .85, exit: 'zoom-fade', exitSec: .45, ruleGrow: true }, motif: kineticMotif, slot: { rx: 0, tilt: 0 },
  },
];
