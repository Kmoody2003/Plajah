// themesModernB — twelve more modern / abstract languages, through three
// further Art Council lenses (four each):
//   the World-Eclectic Traveler — Cut-Paper Garden, Atomic Lounge, Terrazzo, Truchet Tiles
//   the Baroque Dramatist       — Colour Field, Aurora Mesh, Spotlight Stage, Folded Ribbon
//   the Radical Minimalist      — Quiet Space, Generative Grid, Data Poem, Monochrome Blue
// Motifs are generic geometry (cut shapes, chips, tiles, fields, bars) — no
// community's sacred patterns.
import { rect, circle, line, path } from '../../tela/templateKit';
import type { Lay } from './layout';
import type { SlideObj, SlideTheme, ThemeMotif, ThemePalette } from './types';
import {
  amb, gnd, glowAt, pathPx, strokePx, grain, halftone, dCircle, dRect, dPoly, dLine,
  quarterArcD, sq, pad2, plain, alpha, orn,
} from './motifKit';

const sw = (L: Lay, k: number) => Math.max(1, L.u * k);
const inset = (L: Lay, k = .028) => Math.max(6, Math.min(L.W, L.H) * k);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Ellipse as a polygon path (so it can be rotated / combined in one `d`). */
function ellipseD(cx: number, cy: number, rx: number, ry: number, rotDeg = 0, n = 28): string {
  const a = rotDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), pts: number[] = [];
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry; pts.push(cx + x * ca - y * sa, cy + x * sa + y * ca); }
  return dPoly(pts);
}
/** A swooping band between two cubic curves (drapery / ribbon). */
function ribbonD(p: number[], ox: number, oy: number): string {
  const [x0, y0, c1x, c1y, c2x, c2y, x3, y3] = p;
  return `M${r1(x0)} ${r1(y0)}C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(x3)} ${r1(y3)}L${r1(x3 + ox)} ${r1(y3 + oy)}C${r1(c2x + ox * .4)} ${r1(c2y + oy * .4)} ${r1(c1x + ox * 1.3)} ${r1(c1y + oy * 1.3)} ${r1(x0 + ox)} ${r1(y0 + oy)}Z`;
}
/** Irregular chip (terrazzo). */
function chipD(cx: number, cy: number, r: number, rnd: () => number): string {
  const n = 5 + Math.floor(rnd() * 3), pts: number[] = [], a0 = rnd() * 6.28;
  for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2, rr = r * (.55 + rnd() * .5); pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (.7 + rnd() * .3)); }
  return dPoly(pts);
}

// ── 13. Cut-Paper Garden — the World-Eclectic Traveler ──────────────────────
// Gouache sheets cut with scissors: cobalt fronds, coral leaves, ochre stars on
// warm white. They drift down onto the page and wave a little in the air.
const CP: ThemePalette = { ground: '#F6F1E7', ground2: '#EDE5D6', ink: '#1C1B22', muted: '#55515C', accent: '#1F4FB4', accent2: '#F0623F', accent3: '#E8A33D', panel: '#1F4FB4', panelInk: '#FFFFFF', panelMuted: '#D6E2FF', markerInk: '#FFFFFF' };
const CP_G = '#2E8B57';
const frondD = (seed: number) => orn.blobPath(seed, 14, .42);
const cutMotif: ThemeMotif = {
  ground(L) {
    const { W, H } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, CP.ground), 'Warm paper'),
      gnd(amb(path(-m * .1, H - m * .2, m * .26, m * .3, frondD(11), CP.accent, { rotation: 18, label: 'Cobalt frond' }), { kind: 'sway', deg: 3, period: 8 })),
      gnd(amb(path(W - m * .18, -m * .08, m * .26, m * .22, orn.blobPath(4, 7, .3), CP.accent2, { label: 'Coral cut' }), { kind: 'sway', deg: 2.5, period: 10, phase: .4 })),
      gnd(amb(path(W - m * .12, H - m * .16, m * .09, m * .09, orn.starPath(7, .5), CP.accent3, { label: 'Ochre star' }), { kind: 'spin', degPerSec: 4 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, s = u * 1.4, gap = u * .7, total = s * 3 + gap * 2, x0 = align === 'center' ? x + (w - total) / 2 : x;
    return { h: s, objs: [
      path(x0, y, s * .7, s, orn.leafPath(), CP_G, { rotation: -30, label: 'Leaf' }),
      circle(x0 + s + gap + s / 2, y + s / 2, s * .32, CP.accent2, { label: 'Dot' }),
      path(x0 + (s + gap) * 2, y, s, s, orn.starPath(6, .5), CP.accent, { label: 'Star' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L), s = u * 2.6;
    return [
      amb(path(i, i, s, s, orn.starPath(5, .45), CP.accent, { rotation: 12, label: 'Cut star' }), { kind: 'sway', deg: 8, period: 6 }),
      amb(path(W - i - s * 1.6, H - i - s * 1.1, s * 1.6, s * 1.1, orn.leafPath(), CP_G, { rotation: 70, label: 'Cut leaf' }), { kind: 'sway', deg: 6, period: 7, phase: .5 }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h);
    return [
      rect(cx - s * .36, cy - s * .44, s * .7, s * .86, CP.accent, { rotation: -4, label: 'Cobalt sheet' }),
      amb(path(cx - s * .3, cy - s * .38, s * .52, s * .76, frondD(seed + 3), CP.ground, { rotation: -8, label: 'White frond' }), { kind: 'sway', deg: 2.5, period: 7 }),
      amb(path(cx + s * .08, cy - s * .2, s * .4, s * .56, frondD(seed + 9), CP.accent2, { rotation: 20, label: 'Coral frond' }), { kind: 'sway', deg: 3.5, period: 9, phase: .3 }),
      amb(path(cx - s * .48, cy + s * .14, s * .24, s * .34, orn.leafPath(), CP_G, { rotation: -40, label: 'Leaf' }), { kind: 'sway', deg: 5, period: 6, phase: .6 }),
      amb(path(cx + s * .24, cy - s * .48, s * .2, s * .2, orn.starPath(7, .5), CP.accent3, { label: 'Ochre star' }), { kind: 'spin', degPerSec: 6 }),
      circle(cx + s * .3, cy + s * .36, s * .06, CP.accent3, { label: 'Ochre dot' }),
    ];
  },
  marker(cx, cy, r) { return [path(cx - r * 1.1, cy - r * 1.1, r * 2.2, r * 2.2, orn.blobPath(5, 6, .14), CP.accent, { label: 'Cobalt cut' })]; },
  panel(x, y, w, h, L) { const s = L.u * 3; return [rect(x, y, w, h, CP.panel, { label: 'Panel' }), path(x + w - s * .7, y - s * .5, s, s * 1.4, orn.leafPath(), CP.accent2, { rotation: 35, label: 'Panel leaf' })]; },
  numeral: plain,
};

// ── 14. Atomic Lounge — the World-Eclectic Traveler ─────────────────────────
// A jet-age travel poster: boomerangs, starbursts and orbit diagrams on cream,
// walnut, burnt orange, teal and mustard. Rises like a departure board.
const AT: ThemePalette = { ground: '#F3E9D2', ground2: '#EADBBB', ink: '#2B2118', muted: '#6B5A48', accent: '#B9492F', accent2: '#2A7F7A', accent3: '#E3A72F', panel: '#2B2118', panelInk: '#F3E9D2', panelMuted: '#CDBFA4', markerInk: '#F3E9D2' };
const sparkD = orn.starPath(8, .16);
const atomicMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, AT.ground), 'Cream'),
      gnd(circle(W - m * .08, m * .06, m * .22, alpha(AT.accent3, .85), { label: 'Mustard sun' })),
      gnd(amb(path(-m * .04, H - m * .15, m * .19, m * .15, orn.boomerangPath(), AT.accent2, { rotation: -20, label: 'Boomerang' }), { kind: 'drift', ax: u * .6, ay: u * .4, period: 9 })),
      gnd(amb(path(m * .1, H - m * .09, m * .13, m * .1, orn.boomerangPath(), AT.accent, { rotation: 40, label: 'Boomerang' }), { kind: 'drift', ax: u * .5, ay: u * .5, period: 11, phase: .5 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 16), s = u * 1.6, cy = y + s / 2, st = sw(L, .16);
    if (align === 'center') {
      const cx = x + w / 2;
      return { h: s, objs: [
        line(cx - dw / 2, cy, cx - s * .8, cy, AT.ink, st, { label: 'Line', dash: [u * .5, u * .5] }),
        amb(path(cx - s / 2, y, s, s, sparkD, AT.accent, { label: 'Starburst' }), { kind: 'spin', degPerSec: 30 }),
        line(cx + s * .8, cy, cx + dw / 2, cy, AT.ink, st, { label: 'Line', dash: [u * .5, u * .5] }),
      ] };
    }
    return { h: s, objs: [
      amb(path(x, y, s, s, sparkD, AT.accent, { label: 'Starburst' }), { kind: 'spin', degPerSec: 30 }),
      line(x + s * 1.4, cy, x + dw, cy, AT.ink, st, { label: 'Line', dash: [u * .5, u * .5] }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .03), s = u * 3;
    return [
      rect(i, i, W - i * 2, H - i * 2, 'none', { rx: u * 2, stroke: alpha(AT.ink, .35), strokeWidth: sw(L, .14), dash: [u * .3, u * .7], label: 'Dotted border' }),
      amb(path(i - s / 2, H - i - s / 2, s, s, sparkD, AT.accent3, { label: 'Spark' }), { kind: 'spin', degPerSec: -20 }),
      amb(path(W - i - s / 2, i + u * 6, s * .7, s * .7, sparkD, AT.accent, { label: 'Spark' }), { kind: 'spin', degPerSec: 24 }),
    ];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), st = sw(L, .22);
    const orbit = (rot: number, spin: number) => amb(path(cx - s * .42, cy - s * .16, s * .84, s * .32, orn.polygonPath(40), 'none', { stroke: AT.ink, strokeWidth: st, rotation: rot, label: 'Orbit' }), { kind: 'spin', degPerSec: spin });
    return [
      path(cx - s * .5, cy - s * .2, s * .62, s * .62, orn.blobPath(8, 4, .28), AT.accent2, { label: 'Kidney' }),
      path(cx + s * .02, cy - s * .48, s * .46, s * .36, orn.boomerangPath(), AT.accent, { rotation: 10, label: 'Boomerang' }),
      orbit(0, 7), orbit(60, 7), orbit(120, 7),
      circle(cx, cy, s * .055, AT.accent3, { stroke: AT.ink, strokeWidth: st, label: 'Nucleus' }),
      amb(path(cx + s * .28, cy + s * .2, s * .18, s * .18, sparkD, AT.accent3, { label: 'Starburst' }), { kind: 'spin', degPerSec: 18 }),
      amb(path(cx - s * .44, cy - s * .44, s * .12, s * .12, sparkD, AT.ink, { label: 'Starburst' }), { kind: 'spin', degPerSec: -14 }),
    ];
  },
  marker(cx, cy, r) { return [path(cx - r * 1.15, cy - r, r * 2.3, r * 2, orn.blobPath(8, 4, .2), AT.accent2, { label: 'Kidney' })]; },
  panel(x, y, w, h, L) { const s = L.u * 3.2; return [rect(x, y, w, h, AT.panel, { rx: L.u * 1.6, label: 'Panel' }), path(x + w - s * 1.2, y - s * .45, s * 1.2, s * .9, orn.boomerangPath(), AT.accent3, { rotation: 15, label: 'Panel boomerang' })]; },
  numeral: plain,
};

// ── 15. Terrazzo — the World-Eclectic Traveler ──────────────────────────────
// A sunny stone floor: chips of terracotta, verdigris, ochre and blush set in
// pale stone, brass strips, an arch. Chips pop into place.
const TZ: ThemePalette = { ground: '#EFE9E1', ground2: '#E5DDD2', ink: '#22201F', muted: '#5C5650', accent: '#B4532A', accent2: '#2F6F6A', accent3: '#D9A441', panel: '#2F6F6A', panelInk: '#FFFFFF', panelMuted: '#CFE3E0', markerInk: '#FFFFFF' };
const TZ_PINK = '#E7A9A0', TZ_CHAR = '#3B3835';
function chipField(x: number, y: number, w: number, h: number, n: number, size: number, seed: number, avoid?: { x: number; y: number; w: number; h: number }, inCircle?: { cx: number; cy: number; r: number }): Record<string, string> {
  const r = orn.rng(seed), cols = [TZ.accent, TZ.accent2, TZ.accent3, TZ_PINK, TZ_CHAR], out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const px = x + r() * w, py = y + r() * h, s = size * (.4 + r() * .9);
    if (avoid && px > avoid.x && px < avoid.x + avoid.w && py > avoid.y && py < avoid.y + avoid.h) continue;
    if (inCircle && Math.hypot(px - inCircle.cx, py - inCircle.cy) > inCircle.r - s) continue;
    const c = cols[i % cols.length]; out[c] = (out[c] || '') + chipD(px, py, s, r);
  }
  return out;
}
const terrazzoMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, S = L.safe;
    const out: SlideObj[] = [gnd(rect(0, 0, W, H, TZ.ground), 'Stone')];
    const big = chipField(0, 0, W, H, Math.round(60 * Math.max(1, L.ar / 1.8)), u * 1.1, seed + 1, { x: S.x + u * 2, y: S.y + u * 2, w: S.w - u * 4, h: S.h - u * 4 });
    for (const [c, d] of Object.entries(big)) out.push(gnd(pathPx(0, 0, W, H, d, c, { label: 'Chips' })));
    const fine = chipField(0, 0, W, H, 140, u * .35, seed + 2);
    out.push(gnd(pathPx(0, 0, W, H, Object.values(fine).join(''), alpha(TZ_CHAR, .16), { label: 'Fine chips' })));
    return out;
  },
  divider(x, y, w, align, L) {
    const u = L.u, s = u * 1.1, dw = Math.min(w, u * 14), x0 = align === 'center' ? x + (w - dw) / 2 : x, r = orn.rng(9);
    const objs: SlideObj[] = [line(x0, y + s / 2, x0 + dw, y + s / 2, TZ.accent3, sw(L, .14), { label: 'Brass strip' })];
    [TZ.accent, TZ.accent2, TZ_PINK].forEach((c, i) => objs.push(pathPx(x0 + dw / 2 + (i - 1) * s * 1.6 - s / 2, y, s, s, chipD(x0 + dw / 2 + (i - 1) * s * 1.6, y + s / 2, s * .6, r), c, { label: 'Chip' })));
    return { h: s, objs };
  },
  frame(L) {
    const { W, H } = L, i = inset(L, .032);
    return [rect(i, i, W - i * 2, H - i * 2, 'none', { stroke: TZ.accent3, strokeWidth: sw(L, .16), label: 'Brass strip' })];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), R = s * .3, dcx = cx + s * .08, dcy = cy + s * .14;
    const chips = chipField(dcx - R, dcy - R, R * 2, R * 2, 70, s * .028, seed + 5, undefined, { cx: dcx, cy: dcy, r: R });
    const out: SlideObj[] = [
      path(cx - s * .46, cy - s * .48, s * .5, s * .7, orn.archPath(.5), TZ.accent, { label: 'Terracotta arch' }),
      pathPx(cx + s * .06, cy - s * .44, s * .36, s * .18, `M${r1(cx + s * .06)} ${r1(cy - s * .26)}A${r1(s * .18)} ${r1(s * .18)} 0 0 1 ${r1(cx + s * .42)} ${r1(cy - s * .26)}Z`, TZ.accent3, { label: 'Ochre half sun' }),
      circle(dcx, dcy, R, '#F7F3EC', { stroke: TZ.accent3, strokeWidth: sw(L, .2), label: 'Terrazzo disc' }),
    ];
    for (const [c, d] of Object.entries(chips)) out.push(amb(pathPx(dcx - R, dcy - R, R * 2, R * 2, d, c, { label: 'Disc chips' }), { kind: 'spin', degPerSec: 3 }));
    return out;
  },
  marker(cx, cy, r) { return [pathPx(cx - r, cy - r, r * 2, r * 2, chipD(cx, cy, r * 1.1, orn.rng(Math.round(cx + cy))), TZ.accent, { label: 'Chip marker' })]; },
  panel(x, y, w, h, L) {
    const chips = chipField(x + w * .78, y + h * .55, w * .2, h * .4, 16, L.u * .45, 77);
    return [rect(x, y, w, h, TZ.panel, { label: 'Panel' }), pathPx(x, y, w, h, Object.values(chips).join(''), alpha('#FFFFFF', .22), { label: 'Panel chips' })];
  },
  numeral: plain,
};

// ── 16. Truchet Tiles — the World-Eclectic Traveler ─────────────────────────
// A hand-glazed tile run: quarter-circle tiles in indigo, terracotta and
// saffron, laid in borders that slowly travel. Scans in course by course.
const TR: ThemePalette = { ground: '#F4ECDF', ground2: '#EADFCC', ink: '#1E2340', muted: '#4E5470', accent: '#2B3A8C', accent2: '#D9603B', accent3: '#E8B04B', panel: '#1E2340', panelInk: '#F4ECDF', panelMuted: '#C3C7DA', markerInk: '#F4ECDF' };
/** One truchet tile (two quarter-arc bands) at (x, y) size t, orientation o (0..3). */
function tileD(x: number, y: number, t: number, o: number): string {
  const b = t * .22, r0 = t / 2 - b / 2, r1 = t / 2 + b / 2;
  return o % 2 === 0
    ? quarterArcD(x, y, r0, r1, 0) + quarterArcD(x + t, y + t, r0, r1, 180)
    : quarterArcD(x + t, y, r0, r1, 90) + quarterArcD(x, y + t, r0, r1, 270);
}
function tileStrip(x: number, y: number, w: number, t: number, seed: number): string {
  // Repeats every 4 tiles so a 4-tile scroll is seamless.
  const r = orn.rng(seed), pat = [0, 1, 2, 3].map(() => Math.floor(r() * 4)); let d = '';
  for (let i = 0, px = x; px < x + w; i++, px += t) d += tileD(px, y, t, pat[i % 4]);
  return d;
}
const truchetMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, u } = L, t = u * 2.2;
    let d = ''; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) d += tileD(W - t * (2 - i), t * j, t, (i + j) % 2 ? 1 : 2);
    return [gnd(rect(0, 0, L.W, L.H, TR.ground), 'Glaze cream'), grain(L, seed + 4, TR.ink, 120, .06, .8, 'Clay grain'), gnd(pathPx(W - t * 2, 0, t * 2, t * 2, d, alpha(TR.accent2, .3), { label: 'Corner tiles' }))];
  },
  divider(x, y, w, align, L) {
    const u = L.u, t = u * 1.3, n = 4, total = t * n, x0 = align === 'center' ? x + (w - total) / 2 : x;
    let d = ''; for (let i = 0; i < n; i++) d += tileD(x0 + i * t, y, t, i % 2);
    return { h: t, objs: [rect(x0, y, total, t, alpha(TR.accent, .1), { label: 'Tile bed' }), pathPx(x0, y, total, t, d, TR.accent, { label: 'Tile run' })] };
  },
  frame(L) {
    const { W, H } = L, t = Math.min(L.safe.y * .62, L.u * 3.4), out: SlideObj[] = [];
    for (const [yy, c, dir, seed] of [[0, TR.accent, 1, 3], [H - t, TR.accent2, -1, 5]] as Array<[number, string, number, number]>) {
      out.push(rect(0, yy, W, t, alpha(c, .08), { label: 'Tile course' }));
      out.push(amb(pathPx(-t * 4, yy, W + t * 8, t, tileStrip(-t * 4, yy, W + t * 8, t, seed), c, { label: 'Tile course' }), { kind: 'scroll', dx: dir * t * 4, dy: 0, period: 16 }));
    }
    return out;
  },
  hero(x, y, w, h, L, seed) {
    const { s, x0, y0 } = sq(x, y, w, h), n = 5, t = s / n, r = orn.rng(seed + 2);
    let dA = '', dB = '';
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const d = tileD(x0 + i * t, y0 + j * t, t, Math.floor(r() * 4)); if ((i + j) % 3 === 0) dB += d; else dA += d; }
    const hi = Math.floor(r() * n * n), hx = x0 + (hi % n) * t, hy = y0 + Math.floor(hi / n) * t;
    return [
      rect(x0, y0, s, s, alpha(TR.accent, .08), { label: 'Tile bed' }),
      pathPx(x0, y0, s, s, dA, TR.accent, { label: 'Indigo tiles' }),
      pathPx(x0, y0, s, s, dB, TR.accent2, { label: 'Terracotta tiles' }),
      amb(rect(hx, hy, t, t, alpha(TR.accent3, .55), { label: 'Saffron tile', blend: 'multiply' }), { kind: 'pulse', min: .2, max: 1, period: 5 }),
      rect(x0, y0, s, s, 'none', { stroke: TR.ink, strokeWidth: sw(L, .18), label: 'Tile edge' }),
    ];
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, TR.accent, { label: 'Tile' }), pathPx(cx - r, cy - r, r * 2, r * 2, tileD(cx - r, cy - r, r * 2, 0), alpha(TR.ground, .22), { label: 'Tile glaze' })]; },
  panel(x, y, w, h, L) { const t = L.u * 1.6; return [rect(x, y, w, h, TR.panel, { label: 'Panel' }), pathPx(x + w - t, y, t, t, tileD(x + w - t, y, t, 1), TR.accent3, { label: 'Panel tile' })]; },
  numeral: plain,
};

// ── 17. Colour Field — the Baroque Dramatist ────────────────────────────────
// Emotion at the scale of a wall: two soft-edged fields of oxblood and ember
// that breathe; words float on the colour. Glows in; fades like dusk.
const CF: ThemePalette = { ground: '#3A0F12', ground2: '#5A1A17', ink: '#F7E9DA', muted: '#E2B9A0', accent: '#FF9E5E', accent2: '#C9302C', accent3: '#FFC58A', panel: '#1E0708', panelInk: '#F7E9DA', panelMuted: '#E2B9A0', markerInk: '#2A0A0C' };
function softField(x: number, y: number, w: number, h: number, color: string, label: string, a = 1): SlideObj {
  return rect(x, y, w, h, color, { label, gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color, opacity: 0 }, { offset: .14, color, opacity: a }, { offset: .86, color, opacity: a }, { offset: 1, color, opacity: 0 }] } });
}
const fieldMotif: ThemeMotif = {
  ground(L) {
    const { W, H } = L, mx = W * .045;
    return [
      gnd(rect(0, 0, W, H, CF.ground), 'Oxblood'),
      gnd(softField(mx, H * .04, W - mx * 2, H * .5, '#8E2A1C', 'Ember field')),
      gnd(softField(mx, H * .52, W - mx * 2, H * .44, '#22080A', 'Night field', .9)),
      gnd(amb(glowAt(W / 2, H * .53, W * .5, H * .1, CF.accent, .22, 'Seam light'), { kind: 'pulse', min: .5, max: 1, period: 7 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 16), t = u * .45, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: t, objs: [amb(rect(x0, y, dw, t, CF.accent, { gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: CF.accent, opacity: align === 'center' ? 0 : 1 }, { offset: .5, color: CF.accent3 }, { offset: 1, color: CF.accent, opacity: 0 }] }, label: 'Ember bar' }), { kind: 'pulse', min: .65, max: 1, period: 4 })] };
  },
  frame() { return []; },
  hero(x, y, w, h) {
    const { s, cx, cy } = sq(x, y, w, h), fw = s * .7;
    return [
      softField(cx - fw / 2, cy - s * .46, fw, s * .3, '#E0662A', 'Field'),
      softField(cx - fw / 2, cy - s * .18, fw, s * .3, '#B32A22', 'Field'),
      softField(cx - fw / 2, cy + s * .1, fw, s * .36, '#1A0507', 'Field'),
      amb(glowAt(cx, cy - s * .18, fw * .7, s * .16, CF.accent3, .3, 'Field light'), { kind: 'pulse', min: .4, max: 1, period: 6 }),
    ];
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, CF.accent, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: CF.accent3 }, { offset: 1, color: CF.accent }] }, label: 'Ember square' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, CF.panel, { label: 'Panel' }), rect(x, y, w, Math.max(2, L.u * .3), CF.accent, { gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: CF.accent, opacity: 0 }, { offset: .5, color: CF.accent3 }, { offset: 1, color: CF.accent, opacity: 0 }] }, label: 'Panel glow' })]; },
  numeral: plain,
};

// ── 18. Aurora Mesh — the Baroque Dramatist ─────────────────────────────────
// A lush gradient mesh — magenta, amber, cobalt — with silk threads drawn
// through it and a kaleidoscope bloom turning slowly. Floats up from below.
const AM: ThemePalette = { ground: '#120A24', ground2: '#1E1036', ink: '#FFF7FB', muted: '#D7C6E6', accent: '#FF7AC6', accent2: '#FFB547', accent3: '#5B7CFF', panel: 'rgba(18,10,36,0.62)', panelInk: '#FFF7FB', panelMuted: '#D7C6E6', markerInk: '#120A24' };
const meshMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.max(W, H);
    let threads = '';
    for (let k = 0; k < 4; k++) {
      const y0 = H * (.7 + k * .06), a = H * (.12 + k * .03);
      threads += `M${r1(-W * .05)} ${r1(y0)}C${r1(W * .3)} ${r1(y0 - a)} ${r1(W * .6)} ${r1(y0 + a)} ${r1(W * 1.05)} ${r1(y0 - a * .6)}`;
    }
    return [
      gnd(rect(0, 0, W, H, AM.ground, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: AM.ground }, { offset: 1, color: AM.ground2 }] } }), 'Night'),
      gnd(amb(glowAt(W * .1, H * .1, m * .42, m * .34, AM.accent, .5, 'Magenta bloom'), { kind: 'drift', ax: u * 6, ay: u * 4, period: 18 })),
      gnd(amb(glowAt(W * .92, H * .95, m * .44, m * .34, AM.accent2, .42, 'Amber bloom'), { kind: 'drift', ax: u * 5, ay: u * 5, period: 23, phase: .3 })),
      gnd(amb(glowAt(W * .85, H * .08, m * .34, m * .26, AM.accent3, .45, 'Cobalt bloom'), { kind: 'drift', ax: u * 4, ay: u * 3, period: 20, phase: .6 })),
      gnd(amb(strokePx(-W * .05, H * .5, W * 1.1, H * .5, threads, alpha('#FFFFFF', .14), sw(L, .1), { label: 'Silk threads' }), { kind: 'drift', ax: u * 2, ay: u * 1.4, period: 13 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 13), t = u * .4, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    const bar = rect(x0, y + u * .3, dw, t, AM.accent, { rx: t / 2, gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: AM.accent }, { offset: 1, color: AM.accent2 }] }, label: 'Mesh bar' });
    bar.shadow = { x: 0, y: 0, blur: u * .8, color: alpha(AM.accent, .8) };
    return { h: u, objs: [amb(bar, { kind: 'sweep', period: 5, color: '#FFFFFF', width: .25 })] };
  },
  frame() { return []; },
  hero(x, y, w, h) {
    const { s, cx, cy } = sq(x, y, w, h);
    let d = ''; for (let k = 0; k < 6; k++) { const a = k * 60 * Math.PI / 180; d += ellipseD(cx + Math.cos(a) * s * .16, cy + Math.sin(a) * s * .16, s * .26, s * .11, k * 60); }
    return [
      amb(glowAt(cx, cy, s * .52, s * .52, AM.accent, .35, 'Bloom glow'), { kind: 'pulse', min: .6, max: 1, period: 5 }),
      amb(pathPx(cx - s * .45, cy - s * .45, s * .9, s * .9, d, AM.accent, { gradient: { kind: 'LINEAR', angle: 45, stops: [{ offset: 0, color: AM.accent3 }, { offset: .5, color: AM.accent }, { offset: 1, color: AM.accent2 }] }, label: 'Kaleidoscope bloom' }), { kind: 'spin', degPerSec: 4 }),
      circle(cx, cy, s * .05, '#FFFFFF', { label: 'Bloom heart' }),
    ];
  },
  marker(cx, cy, r) { return [circle(cx, cy, r, AM.accent, { gradient: { kind: 'LINEAR', angle: 45, stops: [{ offset: 0, color: AM.accent }, { offset: 1, color: AM.accent2 }] }, label: 'Mesh disc' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, AM.panel, { rx: L.u * 1.2, stroke: alpha(AM.accent, .55), strokeWidth: sw(L, .12), label: 'Panel' })]; },
  numeral: pad2,
};

// ── 19. Spotlight Stage — the Baroque Dramatist ─────────────────────────────
// Theatre: a black stage, crimson curtain edges with a scalloped valance,
// gold light cones that sway, dust in the beams. Revealed as the house lights fall.
const SP: ThemePalette = { ground: '#08080B', ground2: '#16131A', ink: '#FFF8EE', muted: '#C9BFB2', accent: '#FFC857', accent2: '#B3122E', accent3: '#7FD1FF', panel: '#141218', panelInk: '#FFF8EE', panelMuted: '#C9BFB2', markerInk: '#08080B' };
function coneObj(ax: number, ay: number, len: number, spread: number, a: number, label: string): SlideObj {
  const half = len * Math.tan(spread * Math.PI / 360);
  return pathPx(ax - half, ay, half * 2, len, dPoly([ax - half * .06, ay, ax + half * .06, ay, ax + half, ay + len, ax - half, ay + len]), SP.accent, { label, gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: '#FFF1C9', opacity: a }, { offset: 1, color: SP.accent, opacity: 0 }] } });
}
const stageMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, r = orn.rng(seed + 8);
    let dust = ''; for (let i = 0; i < 40; i++) dust += dCircle(W * (.15 + r() * .7), H * r() * .9, u * (.08 + r() * .14));
    return [
      gnd(rect(0, 0, W, H, SP.ground), 'Stage black'),
      gnd(amb(coneObj(W * .3, -H * .05, H * 1.1, 34, .2, 'Light cone'), { kind: 'sway', deg: 2.5, period: 11 })),
      gnd(amb(coneObj(W * .72, -H * .05, H * 1.1, 30, .16, 'Light cone'), { kind: 'sway', deg: 2.5, period: 13, phase: .5 })),
      gnd(glowAt(W / 2, H * 1.02, W * .45, H * .16, SP.accent, .22, 'Stage floor')),
      gnd(amb(pathPx(0, 0, W, H, dust, alpha('#FFF1C9', .45), { label: 'Dust motes' }), { kind: 'drift', ax: u * 1.2, ay: u * 2, period: 14 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 18), s = u * 1.4, cy = y + s / 2, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    const cx = align === 'center' ? x0 + dw / 2 : x0 + s / 2;
    const objs: SlideObj[] = [amb(path(cx - s / 2, y, s, s, orn.starPath(4, .22), SP.accent, { label: 'Spot star' }), { kind: 'pulse', min: .55, max: 1, period: 2.6 })];
    if (align === 'center') objs.push(line(x0, cy, cx - s, cy, alpha(SP.accent, .8), sw(L, .12)), line(cx + s, cy, x0 + dw, cy, alpha(SP.accent, .8), sw(L, .12)));
    else objs.push(line(x0 + s * 1.5, cy, x0 + dw, cy, alpha(SP.accent, .8), sw(L, .12)));
    return { h: s, objs };
  },
  frame(L) {
    const { W, H, u } = L, cw = Math.min(L.safe.x * .8, u * 6), vh = Math.min(L.safe.y * .7, u * 3.2);
    const curtain = (x: number, flip: boolean) => rect(x, 0, cw, H, SP.accent2, { label: 'Curtain', gradient: { kind: 'LINEAR', angle: 0, stops: flip ? [{ offset: 0, color: '#3A0610', opacity: 0 }, { offset: .4, color: '#5E0A1A' }, { offset: .7, color: SP.accent2 }, { offset: 1, color: '#4A0814' }] : [{ offset: 0, color: '#4A0814' }, { offset: .3, color: SP.accent2 }, { offset: .6, color: '#5E0A1A' }, { offset: 1, color: '#3A0610', opacity: 0 }] } });
    const n = Math.max(6, Math.round(W / (u * 9)));
    return [curtain(0, false), curtain(W - cw, true), path(0, 0, W, vh, orn.scallopPath(n), SP.accent2, { rotation: 180, label: 'Valance' }), rect(0, 0, W, vh * .35, '#5E0A1A', { label: 'Valance head' })];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h), c = s * .2, top = cy + s * .02;
    const iso = (pts: number[], col: string, label: string) => pathPx(cx - c * 1.1, top - c, c * 2.2, c * 2.4, dPoly(pts), col, { label });
    return [
      amb(coneObj(cx, cy - s * .5, s * .9, 40, .3, 'Spot cone'), { kind: 'sway', deg: 1.6, period: 9 }),
      glowAt(cx, cy + s * .38, s * .42, s * .08, SP.accent, .45, 'Spot pool'),
      iso([cx, top - c * .55, cx + c, top, cx, top + c * .55, cx - c, top], '#FFE3A1', 'Lit top'),
      iso([cx - c, top, cx, top + c * .55, cx, top + c * 1.55, cx - c, top + c], SP.accent, 'Lit side'),
      iso([cx + c, top, cx, top + c * .55, cx, top + c * 1.55, cx + c, top + c], '#8A5A12', 'Shade side'),
      amb(circle(cx + s * .3, cy - s * .2, s * .02, '#FFF1C9', { label: 'Mote' }), { kind: 'drift', ax: s * .04, ay: s * .06, period: 7 }),
      amb(circle(cx - s * .22, cy - s * .05, s * .015, '#FFF1C9', { label: 'Mote' }), { kind: 'drift', ax: s * .05, ay: s * .04, period: 9, phase: .5 }),
    ];
  },
  marker(cx, cy, r) { return [glowAt(cx, cy, r * 1.6, r * 1.6, SP.accent, .3, 'Marker glow'), circle(cx, cy, r, SP.accent, { label: 'Gold disc' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, SP.panel, { label: 'Panel' }), rect(x, y, w, Math.max(2, L.u * .25), SP.accent, { label: 'Panel footlight' })]; },
  numeral: plain,
};

// ── 20. Folded Ribbon — the Baroque Dramatist ───────────────────────────────
// Drapery abstracted: ultramarine-to-rose ribbons sweeping through the
// corners of an ivory page. Wipes on like silk drawn across; floats away.
const RB: ThemePalette = { ground: '#F7F1E8', ground2: '#EFE6D8', ink: '#1C1730', muted: '#5A5068', accent: '#6A2C91', accent2: '#E2577A', accent3: '#23308F', panel: '#1C1730', panelInk: '#F7F1E8', panelMuted: '#CFC6DB', markerInk: '#FFFFFF' };
const silk = (angle: number) => ({ kind: 'LINEAR' as const, angle, stops: [{ offset: 0, color: RB.accent3 }, { offset: .55, color: RB.accent }, { offset: 1, color: RB.accent2 }] });
const ribbonMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.min(W, H);
    const a = ribbonD([-m * .06, m * .2, m * .04, m * .02, m * .1, m * .06, m * .26, -m * .06], m * .06, m * .05);
    const a2 = ribbonD([-m * .06, m * .26, m * .06, m * .08, m * .14, m * .1, m * .32, -m * .06], m * .02, m * .015);
    const b = ribbonD([W - m * .3, H + m * .05, W - m * .14, H - m * .08, W - m * .08, H - m * .02, W + m * .05, H - m * .3], m * .07, m * .07);
    return [
      gnd(rect(0, 0, W, H, RB.ground), 'Ivory'),
      gnd(glowAt(W * .5, H * .45, W * .5, H * .5, RB.accent2, .08, 'Rose air')),
      gnd(amb(pathPx(-m * .1, -m * .1, m * .5, m * .4, a, RB.accent, { gradient: silk(30), label: 'Ribbon' }), { kind: 'drift', ax: u * .8, ay: u * .6, period: 12 })),
      gnd(amb(pathPx(-m * .1, -m * .1, m * .5, m * .4, a2, alpha('#FFFFFF', .5), { label: 'Ribbon sheen' }), { kind: 'drift', ax: u * .8, ay: u * .6, period: 12 })),
      gnd(amb(pathPx(W - m * .32, H - m * .32, m * .4, m * .4, b, RB.accent, { gradient: silk(210), label: 'Ribbon' }), { kind: 'drift', ax: u * .9, ay: u * .5, period: 14, phase: .4 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 10), h = u * 1.2, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h, objs: [path(x0, y, dw, h, orn.wavePath(2, 34, 30), RB.accent, { gradient: silk(0), label: 'Ribbon twist' })] };
  },
  frame() { return []; },
  hero(x, y, w, h) {
    const { s, cx, cy } = sq(x, y, w, h), X = cx - s / 2, Y = cy - s / 2;
    const p1 = ribbonD([X, Y + s * .7, X + s * .2, Y - s * .1, X + s * .9, Y + s * .1, X + s * .7, Y + s * .5], s * .12, s * .1);
    const p2 = ribbonD([X + s * .7, Y + s * .5, X + s * .5, Y + s * .9, X + s * .1, Y + s * .8, X + s * .3, Y + s * .4], s * .1, s * .12);
    return [
      amb(pathPx(X, Y, s, s, p1, RB.accent, { gradient: silk(20), label: 'Ribbon loop' }), { kind: 'drift', ax: s * .015, ay: s * .012, period: 9 }),
      amb(pathPx(X, Y, s, s, p2, RB.accent2, { gradient: silk(200), label: 'Ribbon loop', blend: 'multiply' }), { kind: 'drift', ax: s * .012, ay: s * .015, period: 11, phase: .5 }),
      amb(circle(cx + s * .32, cy - s * .36, s * .04, RB.accent2, { label: 'Bead' }), { kind: 'drift', ax: s * .03, ay: s * .02, period: 6 }),
    ];
  },
  marker(cx, cy, r) { return [circle(cx, cy, r, RB.accent, { gradient: silk(45), label: 'Silk disc' })]; },
  panel(x, y, w, h, L) { const m = L.u * 4; return [rect(x, y, w, h, RB.panel, { rx: L.u * .6, label: 'Panel' }), pathPx(x + w - m * 1.6, y - m * .5, m * 2, m, ribbonD([x + w - m * 1.6, y + m * .2, x + w - m, y - m * .6, x + w, y, x + w + m * .3, y - m * .5], m * .18, m * .22), RB.accent2, { gradient: silk(0), label: 'Panel ribbon' })]; },
  numeral: plain,
};

// ── 21. Quiet Space — the Radical Minimalist ────────────────────────────────
// Whitespace as the subject: warm paper, a stone circle, one hairline, one
// small vermilion square. Nothing hurries.
const QS: ThemePalette = { ground: '#F2EFE9', ground2: '#EAE6DE', ink: '#2A2A2A', muted: '#66635D', accent: '#A23B2A', accent2: '#8C8A84', accent3: '#D8D3C9', panel: '#E8E3DA', panelInk: '#2A2A2A', panelMuted: '#5F5C56', markerInk: '#2A2A2A' };
const quietMotif: ThemeMotif = {
  ground(L) {
    const { W, H } = L, m = Math.min(W, H);
    return [gnd(rect(0, 0, W, H, QS.ground), 'Paper'), gnd(amb(circle(W * .86, H * .78, m * .3, alpha(QS.accent3, .55), { label: 'Stone circle' }), { kind: 'pulse', min: .7, max: 1, period: 12 }))];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 5), s = u * .55, x0 = align === 'center' ? x + (w - dw - s * 2) / 2 : x;
    return { h: s, objs: [line(x0, y + s / 2, x0 + dw, y + s / 2, QS.ink, sw(L, .08), { label: 'Hairline' }), rect(x0 + dw + s, y, s, s, QS.accent, { label: 'Vermilion square' })] };
  },
  frame(L) {
    const { W, H, u } = L, x = Math.max(6, L.safe.x * .45);
    return [line(x, H * .22, x, H * .78, alpha(QS.ink, .4), sw(L, .08), { label: 'Hairline' }), rect(W - L.safe.x * .5 - u * .5, H - L.safe.y * .5 - u * .5, u, u, QS.accent, { label: 'Vermilion square' })];
  },
  hero(x, y, w, h, L) {
    const { s, cx, cy } = sq(x, y, w, h);
    return [
      amb(circle(cx + s * .05, cy - s * .08, s * .34, QS.accent3, { label: 'Pale circle' }), { kind: 'pulse', min: .75, max: 1, period: 10 }),
      line(cx - s * .46, cy + s * .3, cx + s * .46, cy + s * .3, alpha(QS.ink, .5), sw(L, .08), { label: 'Horizon' }),
      circle(cx - s * .16, cy + s * .2, s * .1, QS.accent2, { label: 'Stone' }),
      amb(rect(cx + s * .26, cy - s * .36, s * .035, s * .035, QS.accent, { label: 'Vermilion square' }), { kind: 'drift', ax: 0, ay: s * .01, period: 9 }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [circle(cx, cy, r, 'none', { stroke: alpha(QS.ink, .55), strokeWidth: sw(L, .08), label: 'Hairline ring' })]; },
  panel(x, y, w, h) { return [rect(x, y, w, h, QS.panel, { label: 'Panel' })]; },
  numeral: plain,
};

// ── 22. Generative Grid — the Radical Minimalist ────────────────────────────
// A rule, not a picture: a dot lattice on charcoal and a few cells lit by a
// seeded rule, blinking in sequence. One mint signal.
const GG: ThemePalette = { ground: '#111317', ground2: '#181B21', ink: '#ECEDEF', muted: '#9DA1AA', accent: '#4CE0B3', accent2: '#ECEDEF', accent3: '#3A3F4A', panel: '#1A1D23', panelInk: '#ECEDEF', panelMuted: '#9DA1AA', markerInk: '#111317' };
const gridMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, st = u * 2.4, r = orn.rng(seed + 3), S = L.safe;
    const out: SlideObj[] = [gnd(rect(0, 0, W, H, GG.ground), 'Charcoal'), gnd(halftone(0, 0, W, H, st, alpha(GG.ink, .16), { rMin: u * .1, rMax: u * .1, label: 'Dot lattice', max: 5000 }))];
    // A few lit cells in the margins, blinking in sequence.
    for (let i = 0; i < 8; i++) {
      const top = i % 2 === 0, col = Math.floor(r() * (W / st)), px = col * st, py = top ? Math.floor(r() * Math.max(1, S.y / st)) * st : H - st * (1 + Math.floor(r() * Math.max(1, (H - S.bottom) / st)));
      out.push(gnd(amb(rect(px + st * .1, py + st * .1, st * .8, st * .8, i % 3 ? alpha(GG.ink, .5) : GG.accent, { label: 'Lit cell' }), { kind: 'pulse', min: .1, max: 1, period: 4, phase: i / 8 })));
    }
    return out;
  },
  divider(x, y, w, align, L) {
    const u = L.u, s = u * .8, gap = u * .4, n = 6, total = n * s + (n - 1) * gap, x0 = align === 'center' ? x + (w - total) / 2 : x;
    const objs: SlideObj[] = [];
    for (let i = 0; i < n; i++) objs.push(rect(x0 + i * (s + gap), y, s, s, i === 1 || i === 4 ? GG.accent : 'none', { stroke: i === 1 || i === 4 ? undefined : alpha(GG.ink, .5), strokeWidth: sw(L, .08), label: 'Cell' }));
    return { h: s, objs };
  },
  frame(L) {
    const { W, H, u } = L, i = inset(L, .03), c = u * .9;
    const tick = (x: number, y: number) => dLine(x - c, y, x + c, y) + dLine(x, y - c, x, y + c);
    return [strokePx(0, 0, W, H, tick(i, i) + tick(W - i, i) + tick(i, H - i) + tick(W - i, H - i) + tick(W / 2, i) + tick(W / 2, H - i), alpha(GG.ink, .55), sw(L, .1), { label: 'Grid ticks' })];
  },
  hero(x, y, w, h, L, seed) {
    const { s, x0, y0 } = sq(x, y, w, h), n = 8, c = s / n, r = orn.rng(seed + 11);
    let dOn = '', dOff = '';
    const live: SlideObj[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = Math.sin(i * .9 + seed) * Math.cos(j * .7) + r() * .6, px = x0 + i * c, py = y0 + j * c;
      if (v > .7 && live.length < 6) live.push(amb(rect(px + c * .12, py + c * .12, c * .76, c * .76, GG.accent, { label: 'Signal cell' }), { kind: 'pulse', min: .15, max: 1, period: 3.2, phase: live.length / 6 }));
      else if (v > .25) { const k = .2 + (v - .25) * .7; dOn += dRect(px + c * (.5 - k / 2), py + c * (.5 - k / 2), c * k, c * k); }
      else dOff += dCircle(px + c / 2, py + c / 2, c * .06);
    }
    return [pathPx(x0, y0, s, s, dOff || dRect(x0, y0, 1, 1), alpha(GG.ink, .35), { label: 'Empty cells' }), pathPx(x0, y0, s, s, dOn || dRect(x0, y0, 1, 1), GG.ink, { label: 'Grown cells' }), ...live];
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, GG.accent, { label: 'Mint cell' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, GG.panel, { label: 'Panel' }), rect(x, y, L.u * .8, L.u * .8, GG.accent, { label: 'Panel cell' })]; },
  numeral: pad2,
};

// ── 23. Data Poem — the Radical Minimalist ──────────────────────────────────
// Data drawn as verse: a radial of measured bars turning slowly, a bar-code
// horizon, an axis of ticks. Blue for the data, one orange for the point.
const DP: ThemePalette = { ground: '#FAFAF7', ground2: '#F0F0EB', ink: '#16181D', muted: '#5C6068', accent: '#2F5BEA', accent2: '#F25C3B', accent3: '#C8CCD4', panel: '#16181D', panelInk: '#FAFAF7', panelMuted: '#B5B9C2', markerInk: '#FFFFFF' };
const dataMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L, r = orn.rng(seed + 6), bh = Math.min(L.safe.y * .7, u * 4), bw = u * .5, gap = u * .5;
    let d = '', hiX = 0, hiH = 0;
    for (let i = 0, x = 0; x < W; i++, x += bw + gap) { const v = .25 + Math.abs(Math.sin(i * .37 + seed)) * .5 + r() * .25; d += dRect(x, H - bh * v, bw, bh * v); if (i === 23) { hiX = x; hiH = bh * v; } }
    return [
      gnd(rect(0, 0, W, H, DP.ground), 'Paper'),
      gnd(pathPx(0, H - bh, W, bh, d, DP.accent3, { label: 'Bar horizon' })),
      gnd(amb(rect(hiX, H - hiH, bw, hiH, DP.accent2, { label: 'The point' }), { kind: 'pulse', min: .5, max: 1, period: 3 })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, bw = u * .45, gap = u * .35, n = 7, h = u * 1.6, total = n * bw + (n - 1) * gap, x0 = align === 'center' ? x + (w - total) / 2 : x;
    const objs: SlideObj[] = [];
    for (let i = 0; i < n; i++) { const v = .3 + i / (n - 1) * .7; objs.push(rect(x0 + i * (bw + gap), y + h * (1 - v), bw, h * v, i === n - 1 ? DP.accent2 : DP.accent, { label: 'Bar' })); }
    return { h, objs };
  },
  frame(L) {
    const { H, u } = L, x = Math.max(6, L.safe.x * .5); let d = '';
    for (let y = H * .2, k = 0; y <= H * .8; y += u * 1.4, k++) d += dLine(x, y, x + (k % 5 === 0 ? u * 1.6 : u * .8), y);
    return [strokePx(x, H * .2, u * 2, H * .6, d + dLine(x, H * .2, x, H * .8), alpha(DP.ink, .5), sw(L, .08), { label: 'Axis ticks' })];
  },
  hero(x, y, w, h, L, seed) {
    const { s, cx, cy } = sq(x, y, w, h), n = 72, r0 = s * .16, r = orn.rng(seed + 4);
    let d = '', dHi = '';
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 - Math.PI / 2, v = .3 + Math.abs(Math.sin(i * .21 + seed * .1)) * .55 + r() * .15, r1v = r0 + (s * .48 - r0) * v;
      const seg = dLine(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1v, cy + Math.sin(a) * r1v);
      if (i % 17 === 5) dHi += seg; else d += seg;
    }
    return [
      circle(cx, cy, r0 * .9, 'none', { stroke: alpha(DP.ink, .35), strokeWidth: sw(L, .08), label: 'Inner ring' }),
      amb(strokePx(cx - s / 2, cy - s / 2, s, s, d, DP.accent, sw(L, .22), { label: 'Radial data' }), { kind: 'spin', degPerSec: 2 }),
      amb(strokePx(cx - s / 2, cy - s / 2, s, s, dHi, DP.accent2, sw(L, .3), { label: 'Radial highlight' }), { kind: 'spin', degPerSec: 2 }),
      circle(cx, cy, s * .03, DP.ink, { label: 'Origin' }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [circle(cx, cy, r, DP.accent, { label: 'Data dot' }), circle(cx, cy, r * 1.25, 'none', { stroke: alpha(DP.accent, .4), strokeWidth: sw(L, .08), label: 'Ring' })]; },
  panel(x, y, w, h) { return [rect(x, y, w, h, DP.panel, { label: 'Panel' })]; },
  numeral: pad2,
};

// ── 24. Monochrome Blue — the Radical Minimalist ────────────────────────────
// One colour, many values: nested squares in ultramarine tones, a single
// light hairline, one type family throughout.
const MB: ThemePalette = { ground: '#1D2D8C', ground2: '#22349C', ink: '#FFFFFF', muted: '#C5CCF5', accent: '#A9B8FF', accent2: '#2B3DB0', accent3: '#16236E', panel: '#16236E', panelInk: '#FFFFFF', panelMuted: '#C5CCF5', markerInk: '#1D2D8C' };
const monoMotif: ThemeMotif = {
  ground(L) {
    const { W, H } = L, m = Math.min(W, H);
    return [
      gnd(rect(0, 0, W, H, MB.ground), 'Ultramarine'),
      gnd(amb(circle(W * .95, H * 1.05, m * .5, MB.accent2, { label: 'Tone circle' }), { kind: 'pulse', min: .7, max: 1, period: 9 })),
      gnd(rect(-m * .1, -m * .1, m * .34, m * .34, MB.accent3, { label: 'Tone square' })),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 8), x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: u * .3, objs: [amb(line(x0, y, x0 + dw, y, MB.accent, sw(L, .14), { label: 'Hairline' }), { kind: 'sweep', period: 7, color: '#FFFFFF', width: .3 })] };
  },
  frame() { return []; },
  hero(x, y, w, h) {
    const { s, x0, y0 } = sq(x, y, w, h);
    const tones = ['#16236E', '#22349C', '#2E43B8', '#4459D0', '#6A7FE6'];
    // Nested squares sit low and centred — the weight settles to the floor.
    return tones.map((c, i) => {
      const k = 1 - i * .18, ss = s * k, sx = x0 + (s - ss) / 2, sy = y0 + (s - ss) * .75;
      const o = rect(sx, sy, ss, ss, c, { label: 'Tone square' });
      return i === tones.length - 1 ? amb(o, { kind: 'pulse', min: .75, max: 1, period: 6 }) : o;
    });
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, MB.accent, { label: 'Light square' })]; },
  panel(x, y, w, h) { return [rect(x, y, w, h, MB.panel, { label: 'Panel' })]; },
  numeral: plain,
};

// ── Registry ─────────────────────────────────────────────────────────────────
const AC = 'Art Council' as const;
export const MODERN_THEMES_B: SlideTheme[] = [
  {
    id: 'cutpaper', name: 'Cut-Paper Garden', director: 'the World-Eclectic Traveler', council: AC, dark: false,
    lens: 'Drawing with scissors: gouache fronds, leaves and stars cut free and laid on warm white.',
    use: 'Spring, creation care, kids & family, garden or harvest Sundays', c: CP,
    t: { display: 'dmSerif', text: 'lexend', label: 'lexend', accent: 'dmSerif', displayWeight: 400, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.0, textWeight: 400, labelWeight: 600, labelTracking: .16, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'drop', enterSec: 1.0, exit: 'float-up', exitSec: .55, ruleGrow: false }, motif: cutMotif, slot: { rx: .04, tilt: -2 },
  },
  {
    id: 'atomic', name: 'Atomic Lounge', director: 'the World-Eclectic Traveler', council: AC, dark: false,
    lens: 'A jet-age travel poster: boomerangs, starbursts and orbit diagrams in walnut, teal and mustard.',
    use: 'Potlucks, socials, seniors’ lunches, retro nights', c: AT,
    t: { display: 'righteous', text: 'nunito', label: 'quicksand', accent: 'pacifico', displayWeight: 400, displayTransform: 'none', displayTracking: 0, displayLeading: 1.02, textWeight: 500, labelWeight: 700, labelTracking: .22, accentWeight: 400 },
    motion: { enter: 'rise', enterSec: .95, exit: 'slide', exitSec: .45, ruleGrow: true }, motif: atomicMotif, slot: { rx: .12, tilt: 0 },
  },
  {
    id: 'terrazzo', name: 'Terrazzo', director: 'the World-Eclectic Traveler', council: AC, dark: false,
    lens: 'A sunny stone floor: terracotta, verdigris, ochre and blush chips with brass strips and an arch.',
    use: 'Summer series, welcome Sundays, cafés and fellowship halls', c: TZ,
    t: { display: 'playfair', text: 'workSans', label: 'workSans', accent: 'playfair', displayWeight: 700, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.02, textWeight: 400, labelWeight: 600, labelTracking: .22, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'pop', enterSec: .85, exit: 'fade', exitSec: .45, ruleGrow: true }, motif: terrazzoMotif, slot: { rx: .06, tilt: 0 },
  },
  {
    id: 'truchet', name: 'Truchet Tiles', director: 'the World-Eclectic Traveler', council: AC, dark: false,
    lens: 'Hand-glazed quarter-circle tiles in indigo, terracotta and saffron, laid in travelling courses.',
    use: 'Missions, multicultural Sundays, community meals', c: TR,
    t: { display: 'bitter', text: 'manrope', label: 'bitter', accent: 'spectral', displayWeight: 700, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.04, textWeight: 400, labelWeight: 600, labelTracking: .2, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'scan', enterSec: 1.0, exit: 'scan-out', exitSec: .5, ruleGrow: true }, motif: truchetMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'colorfield', name: 'Colour Field', director: 'the Baroque Dramatist', council: AC, dark: true,
    lens: 'Emotion at the scale of a wall: two soft-edged fields of ember and oxblood that breathe.',
    use: 'Lament, Lent, reflective worship, prayer nights', c: CF,
    t: { display: 'instrumentSerif', text: 'crimson', label: 'spectral', accent: 'instrumentSerif', displayWeight: 400, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.0, displayScale: 1.14, textWeight: 400, labelWeight: 600, labelTracking: .26, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'glow', enterSec: 1.4, exit: 'fade', exitSec: .8, ruleGrow: true }, motif: fieldMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'mesh', name: 'Aurora Mesh', director: 'the Baroque Dramatist', council: AC, dark: true,
    lens: 'A lush gradient mesh with silk threads and a kaleidoscope bloom turning in the dark.',
    use: 'Night of worship, Pentecost, conferences, concerts', c: AM,
    t: { display: 'abril', text: 'dmSans', label: 'syne', accent: 'dmSans', displayWeight: 400, displayTransform: 'none', displayTracking: 0, displayLeading: 1.02, textWeight: 400, labelWeight: 700, labelTracking: .2, accentItalic: true, accentWeight: 300 },
    motion: { enter: 'float', enterSec: 1.2, exit: 'zoom-fade', exitSec: .55, ruleGrow: true }, motif: meshMotif, slot: { rx: .1, tilt: 0 },
  },
  {
    id: 'spotlight', name: 'Spotlight Stage', director: 'the Baroque Dramatist', council: AC, dark: true,
    lens: 'Theatre: crimson curtain, gold light cones that sway, dust turning in the beams.',
    use: 'Drama ministry, Christmas pageants, talent nights, premieres', c: SP,
    t: { display: 'bebas', text: 'lora', label: 'bebas', accent: 'lora', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .04, displayLeading: .95, displayScale: 1.14, textWeight: 400, labelWeight: 400, labelTracking: .22, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'reveal', enterSec: 1.2, exit: 'zoom-fade', exitSec: .6, ruleGrow: true }, motif: stageMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'ribbon', name: 'Folded Ribbon', director: 'the Baroque Dramatist', council: AC, dark: false,
    lens: 'Drapery abstracted: ultramarine-to-rose silk sweeping through the corners of an ivory page.',
    use: 'Weddings, celebrations, Palm Sunday, women’s events', c: RB,
    t: { display: 'yeseva', text: 'alegreya', label: 'outfit', accent: 'alegreya', displayWeight: 400, displayTransform: 'none', displayTracking: 0, displayLeading: 1.04, textWeight: 400, labelWeight: 500, labelTracking: .24, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'wipe', enterSec: 1.05, exit: 'float-up', exitSec: .55, ruleGrow: true }, motif: ribbonMotif, slot: { rx: .5, tilt: 0 },
  },
  {
    id: 'quiet', name: 'Quiet Space', director: 'the Radical Minimalist', council: AC, dark: false,
    lens: 'Whitespace as the subject: a stone circle, one hairline and one small vermilion square.',
    use: 'Contemplative services, silence, retreats, communion', c: QS,
    t: { display: 'shippori', text: 'zenKaku', label: 'zenKaku', accent: 'shippori', displayWeight: 500, displayTransform: 'none', displayTracking: .01, displayLeading: 1.18, displayScale: .94, textWeight: 400, labelWeight: 500, labelTracking: .3, accentWeight: 400 },
    motion: { enter: 'fade', enterSec: 1.5, exit: 'fade', exitSec: .8, ruleGrow: true }, motif: quietMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'gengrid', name: 'Generative Grid', director: 'the Radical Minimalist', council: AC, dark: true,
    lens: 'A rule, not a picture: a dot lattice and a few cells lit by a seeded rule, blinking in sequence.',
    use: 'Tech teams, livestream, data & vision nights, young adults', c: GG,
    t: { display: 'jetbrains', text: 'inter', label: 'jetbrains', accent: 'inter', displayWeight: 500, displayTransform: 'none', displayTracking: -.03, displayLeading: 1.06, displayScale: .9, textWeight: 400, labelWeight: 400, labelTracking: .1, accentWeight: 300 },
    motion: { enter: 'stretch', enterSec: .8, exit: 'fade', exitSec: .4, ruleGrow: true }, motif: gridMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'datapoem', name: 'Data Poem', director: 'the Radical Minimalist', council: AC, dark: false,
    lens: 'Data drawn as verse: a radial of measured bars, a bar-code horizon, one orange point.',
    use: 'Annual meetings, giving reports, vision casting, stewardship', c: DP,
    t: { display: 'spaceGrotesk', text: 'inter', label: 'ibmPlexMono', accent: 'ibmPlexMono', displayWeight: 300, displayTransform: 'none', displayTracking: -.03, displayLeading: 1.02, textWeight: 400, labelWeight: 500, labelTracking: .08, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'wipe', enterSec: .85, exit: 'shrink', exitSec: .4, ruleGrow: true }, motif: dataMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'monoblue', name: 'Monochrome Blue', director: 'the Radical Minimalist', council: AC, dark: true,
    lens: 'One colour, many values: nested ultramarine squares, a single light hairline, one family.',
    use: 'Baptism, Advent, focused teaching, clean livestream screens', c: MB,
    t: { display: 'epilogue', text: 'epilogue', label: 'epilogue', accent: 'epilogue', displayWeight: 800, displayTransform: 'none', displayTracking: -.03, displayLeading: .98, textWeight: 400, labelWeight: 600, labelTracking: .18, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'rise', enterSec: .9, exit: 'scan-out', exitSec: .45, ruleGrow: true }, motif: monoMotif, slot: { rx: 0, tilt: 0 },
  },
];
