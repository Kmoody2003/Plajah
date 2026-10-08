// themes — seven hand-authored visual languages for Ambo slide templates.
//
// Each theme is credited to an Art Council director and written in that
// director's lens (see services/aria/ariaCreativeRoles.ts). A theme is more
// than a palette: it owns type, motion character and an ornament vocabulary
// (ground, divider, frame, hero, marker, panel). Designers own the layout and
// call these, so every template speaks each theme's language natively.
// Motifs are generic geometry only — no community's sacred patterns.
import { rect, ellipse, circle, line, path, mix, alpha, type TextOpts } from '../../tela/templateKit';
import * as orn from '../../tela/ornaments';
import type { Lay } from './layout';
import type { Ambient, SlideObj, SlideTheme, ThemeMotif } from './types';
import { MODERN_THEMES_A } from './themesModernA';
import { MODERN_THEMES_B } from './themesModernB';
import { URBAN_THEMES } from './themesUrban';

// ── helpers ──────────────────────────────────────────────────────────────────

export const withAmb = (o: SlideObj, a: Ambient): SlideObj => { o.amb = a; return o; };
const ground = (o: SlideObj, label = 'Ground'): SlideObj => { o.templateRole = 'GROUND'; o.objectLabel = label; return o; };
/** Soft light: an ellipse filled with a radial falloff (cheap to animate — no blur). */
export function glow(cx: number, cy: number, rx: number, ry: number, color: string, a: number, label = 'Glow'): SlideObj {
  return ellipse(cx - rx, cy - ry, rx * 2, ry * 2, color, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color, opacity: a }, { offset: .55, color, opacity: a * .45 }, { offset: 1, color, opacity: 0 }] }, label });
}
const ROMAN: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(s: string): string {
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 3999 || String(n) !== s.trim()) return s;
  let out = '', v = n;
  for (const [k, r] of ROMAN) while (v >= k) { out += r; v -= k; }
  return out;
}
const plain = (s: string) => s;
const pad2 = (s: string) => /^\d$/.test(s.trim()) ? '0' + s.trim() : s;

/** Text option builders in the theme's voice. */
export function typeset(th: SlideTheme) {
  const t = th.t, c = th.c;
  return {
    display: (size: number, o: Partial<TextOpts> = {}): TextOpts => ({ size: size * (t.displayScale ?? 1), font: t.display, weight: t.displayWeight, italic: t.displayItalic, transform: t.displayTransform, tracking: t.displayTracking, leading: t.displayLeading, color: c.ink, label: 'Title', role: 'HEADLINE', ...o }),
    body: (size: number, o: Partial<TextOpts> = {}): TextOpts => ({ size, font: t.text, weight: t.textWeight, leading: 1.38, color: c.ink, label: 'Body', role: 'BODY', ...o }),
    label: (size: number, o: Partial<TextOpts> = {}): TextOpts => ({ size: size * 1.15, font: t.label, weight: t.labelWeight, transform: 'uppercase', tracking: t.labelTracking, leading: 1.25, color: c.accent, label: 'Kicker', role: 'LABEL', ...o }),
    accent: (size: number, o: Partial<TextOpts> = {}): TextOpts => ({ size, font: t.accent, weight: t.accentWeight ?? 400, italic: t.accentItalic, leading: 1.25, color: c.muted, label: 'Deck', role: 'DECK', ...o }),
    /** A full sentence at headline scale — all-caps display faces hand over to the text face. */
    sentence: (size: number, o: Partial<TextOpts> = {}): TextOpts => t.displayTransform === 'uppercase'
      ? { size, font: t.text, weight: Math.max(600, t.textWeight + 200), leading: 1.2, color: c.ink, label: 'Statement', role: 'HEADLINE', ...o }
      : { size: size * (t.displayScale ?? 1), font: t.display, weight: t.displayWeight, italic: t.displayItalic, tracking: t.displayTracking, leading: 1.12, color: c.ink, label: 'Statement', role: 'HEADLINE', ...o },
  };
}
export type Typeset = ReturnType<typeof typeset>;

// ── 1. Sanctuary Classic — the Classical Mind ────────────────────────────────
// Proportion and engraved restraint: midnight nave, gold hairlines, a round
// arch, Trajan-class capitals. Moves like a procession — slow, upright.

const SC = { ground: '#111A2C', ground2: '#1D2944', ink: '#F4ECDC', muted: '#C4B89F', accent: '#CDA65E', accent2: '#8E6F3A', accent3: '#5C6F96', panel: '#17223A', panelInk: '#F4ECDC', panelMuted: '#C4B89F', markerInk: '#CDA65E' };
const sanctuaryMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L;
    return [
      ground(rect(0, 0, W, H, SC.ground, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: SC.ground2 }, { offset: 1, color: SC.ground }] } }), 'Nave ground'),
      ground(withAmb(glow(W / 2, -H * .05, Math.max(W * .45, u * 40), H * .7, SC.accent, .16, 'Clerestory light'), { kind: 'pulse', min: .75, max: 1, period: 9 }), 'Clerestory light'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 22), sw = Math.max(1, u * .12), d = u * 1.1, cy = y + d / 2;
    const sweep: Ambient = { kind: 'sweep', period: 7, color: mix(SC.accent, .55), width: .25 };
    if (align === 'center') {
      const cx = x + w / 2;
      return { h: d, objs: [
        withAmb(line(cx - dw / 2, cy, cx - d, cy, SC.accent, sw, { label: 'Engraved rule' }), sweep),
        withAmb(line(cx + d, cy, cx + dw / 2, cy, SC.accent, sw, { label: 'Engraved rule' }), { ...sweep, phase: .5 }),
        path(cx - d / 2, y, d, d, orn.polygonPath(4), SC.accent, { label: 'Lozenge' }),
      ] };
    }
    return { h: d, objs: [
      path(x, y, d, d, orn.polygonPath(4), SC.accent, { label: 'Lozenge' }),
      withAmb(line(x + d * 1.6, cy, x + dw, cy, SC.accent, sw, { label: 'Engraved rule' }), sweep),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, i = Math.max(6, Math.min(W, H) * .028), j = i + Math.max(4, u * .55), d = u * .9;
    return [
      rect(i, i, W - i * 2, H - i * 2, 'none', { stroke: alpha(SC.accent, .55), strokeWidth: Math.max(1, u * .12), label: 'Outer engraved frame' }),
      rect(j, j, W - j * 2, H - j * 2, 'none', { stroke: alpha(SC.accent, .22), strokeWidth: Math.max(1, u * .08), label: 'Inner engraved frame' }),
      ...[[i, i], [W - i, i], [i, H - i], [W - i, H - i]].map(([cx, cy]) => path(cx - d / 2, cy - d / 2, d, d, orn.polygonPath(4), SC.accent, { label: 'Corner lozenge' })),
    ];
  },
  hero(x, y, w, h, L) {
    const u = L.u, aw = Math.min(w, h * .64), ah = Math.min(h, aw / .64), ax = x + (w - aw) / 2, ay = y + (h - ah) / 2;
    const out: SlideObj[] = [
      withAmb(glow(ax + aw / 2, ay + ah * .45, aw * .75, ah * .55, SC.accent, .18, 'Window light'), { kind: 'pulse', min: .7, max: 1, period: 8 }),
      path(ax, ay, aw, ah, orn.archPath(.07), alpha(SC.accent, .85), { label: 'Round arch' }),
      path(ax + aw * .16, ay + ah * .12, aw * .68, ah * .88, orn.archPath(.035), alpha(SC.accent, .4), { label: 'Inner arch' }),
      line(ax + aw / 2, ay + ah * .3, ax + aw / 2, ay + ah, alpha(SC.accent, .35), Math.max(1, u * .1), { label: 'Mullion' }),
      line(ax + aw * .16, ay + ah * .62, ax + aw * .84, ay + ah * .62, alpha(SC.accent, .3), Math.max(1, u * .08), { label: 'Transom' }),
    ];
    out.push(...orn.radialLines(ax + aw / 2, ay + ah, ah * .1, ah * .55, 9, alpha(SC.accent, .22), Math.max(1, u * .08), { spread: 120, start: -150, label: 'Light ray' }) as SlideObj[]);
    return out;
  },
  marker(cx, cy, r, label, L) {
    return [
      circle(cx, cy, r, 'none', { stroke: SC.accent, strokeWidth: Math.max(1, L.u * .14), label: 'Numeral ring' }),
      circle(cx, cy, r * .84, 'none', { stroke: alpha(SC.accent, .4), strokeWidth: Math.max(1, L.u * .07), label: 'Numeral ring inner' }),
    ];
  },
  panel(x, y, w, h, L) {
    return [
      rect(x, y, w, h, alpha(SC.accent, .06), { stroke: alpha(SC.accent, .55), strokeWidth: Math.max(1, L.u * .1), label: 'Panel' }),
      rect(x + L.u * .5, y + L.u * .5, w - L.u, h - L.u, 'none', { stroke: alpha(SC.accent, .2), strokeWidth: Math.max(1, L.u * .06), label: 'Panel inner rule' }),
    ];
  },
  numeral: roman,
};

// ── 2. Modern Minimal — the Radical Minimalist ───────────────────────────────
// Every element earns its place: warm paper, one red mark, one hairline, a
// light grotesque. Motion is a fade and a rule drawn once.

const MM = { ground: '#F3F1EC', ground2: '#EAE7E0', ink: '#141416', muted: '#5E5C58', accent: '#D93A25', accent2: '#141416', accent3: '#B9B5AD', panel: '#F3F1EC', panelInk: '#141416', panelMuted: '#5E5C58', markerInk: '#141416' };
const minimalMotif: ThemeMotif = {
  ground(L) { return [ground(rect(0, 0, L.W, L.H, MM.ground), 'Paper')]; },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 7), sw = Math.max(1, u * .14);
    const x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: sw, objs: [withAmb(line(x0, y, x0 + dw, y, MM.ink, sw, { label: 'Hairline' }), { kind: 'sweep', period: 9, color: MM.accent, width: .35 })] };
  },
  frame() { return []; },
  hero(x, y, w, h, L) {
    const u = L.u, r = Math.min(w, h) * .42, cx = x + w / 2, cy = y + h / 2, s = Math.max(u * .9, r * .09);
    // One circle, one red square that travels its circumference — slowly.
    const dot = withAmb(rect(cx + r - s / 2, cy - s / 2, s, s, MM.accent, { label: 'Red square (orbit)' }), { kind: 'orbit', cx, cy, degPerSec: -4 });
    return [circle(cx, cy, r, 'none', { stroke: alpha(MM.ink, .28), strokeWidth: Math.max(1, u * .1), label: 'Hairline circle' }), dot];
  },
  marker(cx, cy, r, _label, L) { const s = r * .32; return [rect(cx - r, cy - r * .95, s, s, MM.accent, { label: 'Red mark' }), line(cx - r, cy + r, cx + r, cy + r, alpha(MM.ink, .3), Math.max(1, L.u * .08), { label: 'Base hairline' })]; },
  panel(x, y, w, _h, L) { return [line(x, y, x + w, y, MM.ink, Math.max(1, L.u * .14), { label: 'Card rule' })]; },
  numeral: pad2,
};

// ── 3. Bold Youth — the Rebellious Hand ──────────────────────────────────────
// Material evidence: photocopy specks, tape, a slab of acid yellow knocked
// slightly off true, condensed poster type. Slams in; rips out.

const BY = { ground: '#0F0F12', ground2: '#1B1B21', ink: '#F6F3EA', muted: '#BDB8AB', accent: '#E6FF3D', accent2: '#FF3D7F', accent3: '#3DD9FF', panel: '#E6FF3D', panelInk: '#0F0F12', panelMuted: '#2B2B2B', markerInk: '#0F0F12' };
const youthMotif: ThemeMotif = {
  ground(L, seed) {
    const { W, H, u } = L;
    const specks = (orn.specks(0, 0, W, H, 70, BY.ink, seed + 11, .22) as SlideObj[]).map(s => { s.w *= u / 6; s.h *= u / 6; return s; });
    return [
      ground(rect(0, 0, W, H, BY.ground), 'Black ground'),
      ground(withAmb(glow(W * .82, H * .2, Math.max(W, H) * .4, Math.max(W, H) * .35, BY.accent2, .14, 'Magenta haze'), { kind: 'drift', ax: u * 4, ay: u * 2, period: 14 }), 'Magenta haze'),
      ...specks.map((s, i) => ground(i % 7 === 0 ? withAmb(s, { kind: 'pulse', min: .2, max: 1, period: 1.6 + (i % 5) * .4, phase: i * .3 }) : s, 'Photocopy speck')),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 13), h = u * 1.1, x0 = align === 'center' ? x + (w - dw) / 2 : x;
    return { h: h * 1.4, objs: [rect(x0, y + h * .2, dw, h, BY.accent, { rotation: -2, label: 'Tape slab' }), rect(x0 + dw * .72, y + h * .2, dw * .28, h, BY.accent2, { rotation: -2, label: 'Tape slab tail' })] };
  },
  frame(L) {
    const { W, H, u } = L, tw = u * 9, th = u * 2.2;
    return [
      rect(-tw * .2, H * .06, tw, th, alpha(BY.accent, .9), { rotation: -38, label: 'Corner tape' }),
      rect(W - tw * .8, H - H * .06 - th, tw, th, alpha(BY.accent2, .9), { rotation: -38, label: 'Corner tape' }),
    ];
  },
  hero(x, y, w, h, L, seed) {
    const u = L.u, s = Math.min(w, h), cx = x + w / 2, cy = y + h / 2;
    const out: SlideObj[] = [path(cx - s * .48, cy - s * .48, s * .96, s * .96, orn.burstPath(16, seed + 3), BY.accent2, { rotation: 8, label: 'Burst' })];
    const n = 4, cw = s * .34, ch = s * .3;
    for (let i = 0; i < n; i++) out.push(withAmb(path(cx - cw * .9 + i * cw * .32, cy - ch / 2, cw, ch, orn.chevronPath(38), i % 2 ? BY.ink : BY.accent, { label: 'Chevron' }), { kind: 'drift', ax: u * .8, ay: 0, period: 1.8, phase: i * .25 }));
    return out;
  },
  marker(cx, cy, r) { return [rect(cx - r, cy - r, r * 2, r * 2, BY.accent, { rotation: -5, label: 'Number block' })]; },
  panel(x, y, w, h, L) { const o = L.u * .8; return [rect(x + o, y + o, w, h, BY.accent2, { rotation: -1, label: 'Offset print' }), rect(x, y, w, h, BY.accent, { rotation: -1, label: 'Panel' })]; },
  numeral: plain,
};

// ── 4. Warm Editorial — the World-Eclectic Traveler ──────────────────────────
// A field notebook: sun-warmed paper, terracotta + deep green + ochre, a woven
// band of plain geometry (steps, triangles, dots) and a soft serif with wonk.

const WE = { ground: '#F2E8D8', ground2: '#E8DAC3', ink: '#2A1D15', muted: '#5F4C3E', accent: '#B24E27', accent2: '#2F5D50', accent3: '#C9922F', panel: '#E9DCC6', panelInk: '#2A1D15', panelMuted: '#5F4C3E', markerInk: '#2A1D15' };
const editorialMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L;
    return [
      ground(rect(0, 0, W, H, WE.ground), 'Paper'),
      ground(withAmb(glow(W * .86, H * .1, Math.max(W, H) * .42, Math.max(W, H) * .38, WE.accent3, .2, 'Afternoon light'), { kind: 'drift', ax: u * 3, ay: u * 1.5, period: 18 }), 'Afternoon light'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, s = u * .9, n = 5, gap = s * .55, total = n * s + (n - 1) * gap, x0 = align === 'center' ? x + (w - total) / 2 : x;
    const cols = [WE.accent, WE.accent3, WE.accent2];
    const objs: SlideObj[] = [];
    for (let i = 0; i < n; i++) {
      const px = x0 + i * (s + gap);
      objs.push(i % 2 ? circle(px + s / 2, y + s / 2, s * .28, cols[i % 3], { label: 'Dot' }) : path(px, y, s, s, orn.polygonPath(3), cols[i % 3], { label: 'Triangle' }));
    }
    return { h: s, objs };
  },
  frame(L) {
    const { W, H, u } = L, bh = Math.max(8, u * 1.5), y = H - bh;
    const cols = [WE.accent, WE.accent3, WE.accent2, WE.ink];
    const objs: SlideObj[] = [rect(0, y, W, bh, WE.accent2, { label: 'Woven band' })];
    const cell = bh * 1.6, n = Math.ceil(W / cell);
    for (let i = 0; i < n; i++) objs.push(path(i * cell, y + bh * .18, cell, bh * .64, i % 2 ? orn.stepPyramidPath(3) : orn.polygonPath(4), cols[i % 4] === WE.accent2 ? WE.ground : cols[i % 4], { opacity: .95, label: 'Band motif' }));
    if (objs.length > 80) objs.length = 80;
    return objs;
  },
  hero(x, y, w, h, L) {
    const u = L.u, s = Math.min(w, h), cx = x + w / 2, cy = y + h / 2;
    return [
      withAmb(circle(cx + s * .12, cy - s * .16, s * .26, WE.accent3, { label: 'Sun' }), { kind: 'drift', ax: 0, ay: u * .8, period: 10 }),
      path(cx - s * .46, cy - s * .05, s * .62, s * .5, orn.stepPyramidPath(4), WE.accent, { label: 'Stepped hill' }),
      path(cx - s * .04, cy + s * .08, s * .5, s * .38, orn.stepPyramidPath(3), WE.accent2, { label: 'Stepped hill' }),
      ...orn.rings(cx + s * .12, cy - s * .16, [s * .34, s * .42], alpha(WE.accent3, .55), Math.max(1, u * .1), { label: 'Sun ring' }) as SlideObj[],
      line(cx - s * .48, cy + s * .46, cx + s * .48, cy + s * .46, WE.ink, Math.max(1, u * .14), { label: 'Ground line' }),
    ];
  },
  marker(cx, cy, r) { return [circle(cx, cy, r, WE.accent3, { label: 'Numeral disc' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, alpha(WE.accent2, .09), { label: 'Panel' }), rect(x, y, Math.max(3, L.u * .45), h, WE.accent, { label: 'Panel spine' })]; },
  numeral: plain,
};

// ── 5. Night Glow — the Futurist ─────────────────────────────────────────────
// Light as material: indigo depth, cyan and violet emission, orbits that keep
// turning, a wide geometric display face. Things arrive by resolving into focus.

const NG = { ground: '#060818', ground2: '#17113F', ink: '#F2F4FF', muted: '#A5ADD3', accent: '#00DAF3', accent2: '#D0BCFF', accent3: '#FF8C00', panel: '#0E1233', panelInk: '#F2F4FF', panelMuted: '#A5ADD3', markerInk: '#F2F4FF' };
const nightMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.max(W, H);
    return [
      ground(rect(0, 0, W, H, NG.ground, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: NG.ground }, { offset: 1, color: NG.ground2 }] } }), 'Indigo ground'),
      ground(withAmb(glow(W * .18, H * .85, m * .42, m * .32, NG.accent, .16, 'Cyan emission'), { kind: 'drift', ax: u * 6, ay: u * 3, period: 16 }), 'Cyan emission'),
      ground(withAmb(glow(W * .85, H * .15, m * .4, m * .3, NG.accent2, .18, 'Violet emission'), { kind: 'drift', ax: u * 5, ay: u * 4, period: 21, phase: .4 }), 'Violet emission'),
      ...(orn.perspectiveGrid(0, H * .78, W, H * .22, alpha(NG.accent, .12), { columns: Math.round(12 * Math.max(1, L.ar)), rows: 5, width: Math.max(1, u * .08) }) as SlideObj[]).map(g => ground(g, 'Horizon grid')),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 16), sw = Math.max(1.5, u * .2), x0 = align === 'center' ? x + (w - dw) / 2 : x;
    const l = withAmb(line(x0, y + sw, x0 + dw, y + sw, NG.accent, sw, { label: 'Light rule' }), { kind: 'sweep', period: 4.5, color: '#FFFFFF', width: .3 });
    l.shadow = { x: 0, y: 0, blur: u * .6, color: alpha(NG.accent, .9) };
    return { h: sw * 2, objs: [l] };
  },
  frame(L) {
    const { W, H, u } = L, i = Math.max(8, Math.min(W, H) * .03), s = u * 3.2;
    return (orn.frameCorners(i, i, W - i * 2, H - i * 2, s, alpha(NG.accent, .55), 7) as SlideObj[]);
  },
  hero(x, y, w, h, L) {
    const u = L.u, s = Math.min(w, h), cx = x + w / 2, cy = y + h / 2;
    const planet = circle(cx, cy, s * .2, NG.accent2, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: '#FFFFFF' }, { offset: .45, color: NG.accent2 }, { offset: 1, color: '#3A2C8C' }] }, label: 'Planet' });
    planet.shadow = { x: 0, y: 0, blur: u * 2.5, color: alpha(NG.accent2, .7) };
    const orbit = (rx: number, ry: number, rot: number, col: string, spin: number) => withAmb(ellipse(cx - rx, cy - ry, rx * 2, ry * 2, 'none', { stroke: col, strokeWidth: Math.max(1, u * .14), rotation: rot, label: 'Orbit' }), { kind: 'spin', degPerSec: spin });
    const moon = withAmb(circle(cx + s * .46, cy, s * .035, NG.accent3, { label: 'Moon' }), { kind: 'orbit', cx, cy, degPerSec: 9, squash: .35, tilt: -18 });
    return [
      withAmb(glow(cx, cy, s * .5, s * .5, NG.accent2, .22, 'Planet halo'), { kind: 'pulse', min: .6, max: 1, period: 5 }),
      orbit(s * .46, s * .16, -18, alpha(NG.accent, .7), 3), orbit(s * .4, s * .12, 24, alpha(NG.accent2, .5), -2),
      planet, moon,
    ];
  },
  marker(cx, cy, r, _l, L) {
    const ring = circle(cx, cy, r, 'none', { stroke: NG.accent, strokeWidth: Math.max(1.5, L.u * .2), label: 'Glow ring' });
    ring.shadow = { x: 0, y: 0, blur: L.u * .8, color: alpha(NG.accent, .9) };
    return [circle(cx, cy, r, alpha(NG.accent, .08), { label: 'Ring fill' }), ring];
  },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, 'rgba(255,255,255,0.05)', { rx: L.u * 1.2, stroke: alpha(NG.accent, .38), strokeWidth: Math.max(1, L.u * .1), label: 'Glass panel' })]; },
  numeral: pad2,
};

// ── 6. Candlelight — the Baroque Dramatist ───────────────────────────────────
// Chiaroscuro: a single warm source in deep darkness, gilded scrollwork,
// Bodoni italic at operatic scale. Rises out of the dark; sinks back into it.

const CL = { ground: '#0A0705', ground2: '#2B1A0D', ink: '#F6E7C9', muted: '#CDB389', accent: '#DBA846', accent2: '#8C2F1B', accent3: '#F2D493', panel: '#140D07', panelInk: '#F6E7C9', panelMuted: '#CDB389', markerInk: '#DBA846' };
const baroqueMotif: ThemeMotif = {
  ground(L) {
    const { W, H } = L, m = Math.max(W, H);
    return [
      ground(rect(0, 0, W, H, CL.ground), 'Darkness'),
      ground(rect(0, 0, W, H, CL.ground, { gradient: { kind: 'RADIAL', stops: [{ offset: .55, color: '#000000', opacity: 0 }, { offset: 1, color: '#000000', opacity: .55 }] } }), 'Vignette'),
      ground(withAmb(glow(W * .22, H * .12, m * .62, m * .5, CL.accent, .34, 'Candle light'), { kind: 'pulse', min: .82, max: 1, period: 2.7 }), 'Candle light'),
      ground(withAmb(glow(W * .22, H * .12, m * .25, m * .2, CL.accent3, .18, 'Candle core'), { kind: 'pulse', min: .6, max: 1, period: 1.3, phase: .3 }), 'Candle core'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 24), s = u * 1.8, sw = Math.max(1, u * .14);
    const x0 = align === 'center' ? x + (w - dw) / 2 : x, cy = y + s / 2;
    return { h: s, objs: [
      path(x0, y, s, s, orn.cScrollPath(), CL.accent, { label: 'C-scroll' }),
      withAmb(line(x0 + s * 1.2, cy, x0 + dw - s * 1.2, cy, CL.accent, sw, { label: 'Gilt rule' }), { kind: 'sweep', period: 6, color: CL.accent3, width: .2 }),
      path(x0 + dw - s, y, s, s, orn.cScrollPath(), CL.accent, { rotation: 180, label: 'C-scroll' }),
    ] };
  },
  frame(L) {
    const { W, H, u } = L, s = u * 5.5, i = Math.max(6, Math.min(W, H) * .03);
    const sc = (x: number, y: number, rot: number) => path(x, y, s, s, orn.cScrollPath(), alpha(CL.accent, .75), { rotation: rot, label: 'Corner scroll' });
    return [sc(i, i, 0), sc(W - i - s, i, 90), sc(W - i - s, H - i - s, 180), sc(i, H - i - s, 270)];
  },
  hero(x, y, w, h, L) {
    const u = L.u, s = Math.min(w, h), cx = x + w / 2, cy = y + h / 2;
    const rays = (orn.radialLines(cx, cy, s * .12, s * .55, 24, alpha(CL.accent, .3), Math.max(1, u * .12), { label: 'Gilt ray' }) as SlideObj[]);
    return [
      withAmb(glow(cx, cy, s * .55, s * .55, CL.accent, .3, 'Glory light'), { kind: 'pulse', min: .75, max: 1, period: 3.1 }),
      ...rays.map((r, i) => withAmb(r, { kind: 'pulse', min: .45, max: 1, period: 4, phase: i / 24 })),
      ellipse(cx - s * .17, cy - s * .23, s * .34, s * .46, 'none', { stroke: CL.accent, strokeWidth: Math.max(1, u * .2), label: 'Gilt medallion' }),
      ellipse(cx - s * .13, cy - s * .19, s * .26, s * .38, 'none', { stroke: alpha(CL.accent, .45), strokeWidth: Math.max(1, u * .08), label: 'Medallion inner ring' }),
      withAmb(path(cx - s * .07, cy - s * .07, s * .14, s * .14, orn.starPath(4, .28), CL.accent3, { label: 'Light point' }), { kind: 'pulse', min: .55, max: 1, period: 2.2 }),
      path(cx - s * .46, cy - s * .12, s * .26, s * .26, orn.cScrollPath(), CL.accent, { label: 'Scroll (left)' }),
      path(cx + s * .2, cy - s * .12, s * .26, s * .26, orn.cScrollPath(), CL.accent, { rotation: 180, label: 'Scroll (right)' }),
    ];
  },
  marker(cx, cy, r, _l, L) { return [circle(cx, cy, r, 'none', { stroke: alpha(CL.accent, .7), strokeWidth: Math.max(1, L.u * .1), label: 'Gilt ring' }), withAmb(glow(cx, cy, r * 1.4, r * 1.4, CL.accent, .22, 'Numeral glow'), { kind: 'pulse', min: .7, max: 1, period: 2.4 })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, alpha('#000000', .45), { label: 'Panel' }), ...(orn.frameCorners(x, y, w, h, L.u * 2.4, CL.accent, 8) as SlideObj[])]; },
  numeral: plain,
};

// ── 7. Light & Airy — the Classical Mind (morning) ───────────────────────────
// The same faith in proportion, at dawn: sky-to-linen gradient, overlapping
// translucent circles, a hairline arch, Cormorant. Floats up like breath.

const LA = { ground: '#F8F5F0', ground2: '#E2ECF4', ink: '#24303C', muted: '#56636F', accent: '#94613A', accent2: '#8FB3CF', accent3: '#E9C9A8', panel: '#FFFFFF', panelInk: '#24303C', panelMuted: '#56636F', markerInk: '#24303C' };
const airyMotif: ThemeMotif = {
  ground(L) {
    const { W, H, u } = L, m = Math.max(W, H);
    return [
      ground(rect(0, 0, W, H, LA.ground, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: LA.ground2 }, { offset: .7, color: LA.ground }] } }), 'Dawn ground'),
      ground(withAmb(glow(W * .78, H * .18, m * .36, m * .3, LA.accent3, .45, 'Morning sun'), { kind: 'drift', ax: u * 2, ay: u * 1.5, period: 20 }), 'Morning sun'),
      ground(withAmb(glow(W * .12, H * .9, m * .3, m * .25, LA.accent2, .3, 'Sky haze'), { kind: 'drift', ax: u * 3, ay: u, period: 24, phase: .5 }), 'Sky haze'),
    ];
  },
  divider(x, y, w, align, L) {
    const u = L.u, dw = Math.min(w, u * 18), sw = Math.max(1, u * .1), r = u * .45, x0 = align === 'center' ? x + (w - dw) / 2 : x, cy = y + r;
    const cx = align === 'center' ? x0 + dw / 2 : x0 + r;
    const objs: SlideObj[] = [circle(cx, cy, r, 'none', { stroke: LA.accent, strokeWidth: sw * 1.4, label: 'Ring' })];
    if (align === 'center') objs.push(line(x0, cy, cx - r * 2, cy, alpha(LA.accent, .7), sw), line(cx + r * 2, cy, x0 + dw, cy, alpha(LA.accent, .7), sw));
    else objs.push(line(x0 + r * 3, cy, x0 + dw, cy, alpha(LA.accent, .7), sw));
    return { h: r * 2, objs };
  },
  frame(L) { const { W, H, u } = L, i = Math.max(8, Math.min(W, H) * .035); return [rect(i, i, W - i * 2, H - i * 2, 'none', { stroke: alpha(LA.accent, .28), strokeWidth: Math.max(1, u * .08), rx: u * 1.5, label: 'Hairline frame' })]; },
  hero(x, y, w, h, L) {
    const u = L.u, s = Math.min(w, h), cx = x + w / 2, cy = y + h / 2;
    const c = (dx: number, dy: number, r: number, col: string, a: number, per: number, ph: number) => withAmb(circle(cx + dx, cy + dy, r, alpha(col, a), { label: 'Translucent circle', blend: 'multiply' }), { kind: 'drift', ax: u * .9, ay: u * .7, period: per, phase: ph });
    return [
      c(-s * .12, -s * .06, s * .28, LA.accent2, .35, 11, 0), c(s * .12, -s * .02, s * .24, LA.accent3, .55, 13, .3), c(0, s * .14, s * .2, LA.accent, .22, 15, .6),
      path(cx - s * .32, cy - s * .44, s * .64, s * .88, orn.archPath(.02), alpha(LA.accent, .55), { label: 'Hairline arch' }),
    ];
  },
  marker(cx, cy, r) { return [circle(cx, cy, r, alpha(LA.accent2, .3), { label: 'Numeral disc' }), circle(cx, cy, r * 1.18, 'none', { stroke: alpha(LA.accent, .5), strokeWidth: 1.2, label: 'Numeral ring' })]; },
  panel(x, y, w, h, L) { return [rect(x, y, w, h, alpha('#FFFFFF', .72), { rx: L.u * 1.2, shadow: { x: 0, y: L.u * .4, blur: L.u * 1.6, color: 'rgba(36,48,60,0.12)' }, label: 'Card' })]; },
  numeral: plain,
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const SLIDE_THEMES: SlideTheme[] = [
  {
    id: 'sanctuary', name: 'Sanctuary Classic', director: 'the Classical Mind', council: 'Art Council', dark: true,
    lens: 'Proportion, counterpoint and engraved restraint — the nave at evensong.',
    use: 'Traditional and liturgical services, communion, hymns', c: SC,
    t: { display: 'cinzel', text: 'ebGaramond', label: 'marcellus', accent: 'cormorant', displayWeight: 600, displayTransform: 'uppercase', displayTracking: .06, displayLeading: 1.08, textWeight: 400, labelWeight: 400, labelTracking: .28, accentItalic: true, accentWeight: 500 },
    motion: { enter: 'rise', enterSec: 1.2, exit: 'fade-up', exitSec: .65, ruleGrow: true }, motif: sanctuaryMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'minimal', name: 'Modern Minimal', director: 'the Radical Minimalist', council: 'Art Council', dark: false,
    lens: 'Every element earns its place: paper, one hairline, one red mark.',
    use: 'Contemporary services, teaching series, clean screens', c: MM,
    t: { display: 'manrope', text: 'inter', label: 'dmMono', accent: 'inter', displayWeight: 300, displayTransform: 'none', displayTracking: -.02, displayLeading: 1.06, textWeight: 400, labelWeight: 500, labelTracking: .14, accentWeight: 400 },
    motion: { enter: 'fade', enterSec: .85, exit: 'fade', exitSec: .4, ruleGrow: true }, motif: minimalMotif, slot: { rx: 0, tilt: 0 },
  },
  {
    id: 'youth', name: 'Bold Youth', director: 'the Rebellious Hand', council: 'Art Council', dark: true,
    lens: 'Risk something: photocopy grain, tape, acid yellow knocked off true.',
    use: 'Youth nights, camps, rallies, high-energy worship', c: BY,
    t: { displayScale: 1.1, display: 'anton', text: 'dmSans', label: 'spaceMono', accent: 'permanentMarker', displayWeight: 400, displayTransform: 'uppercase', displayTracking: .01, displayLeading: .98, textWeight: 500, labelWeight: 700, labelTracking: .1, accentWeight: 400 },
    motion: { enter: 'slam', enterSec: .7, exit: 'slide', exitSec: .42, ruleGrow: false }, motif: youthMotif, slot: { rx: 0, tilt: -2 },
  },
  {
    id: 'editorial', name: 'Warm Editorial', director: 'the World-Eclectic Traveler', council: 'Art Council', dark: false,
    lens: 'A field notebook: sun-warmed paper, earth inks, a woven band of plain geometry.',
    use: 'Community news, testimonies, missions, family services', c: WE,
    t: { display: 'fraunces', text: 'workSans', label: 'dmMono', accent: 'fraunces', displayWeight: 600, displayTransform: 'none', displayTracking: -.01, displayLeading: 1.04, textWeight: 400, labelWeight: 500, labelTracking: .16, accentItalic: true, accentWeight: 400 },
    motion: { enter: 'wipe', enterSec: 1.0, exit: 'wipe-out', exitSec: .55, ruleGrow: false }, motif: editorialMotif, slot: { rx: .04, tilt: 0 },
  },
  {
    id: 'night', name: 'Night Glow', director: 'the Futurist', council: 'Art Council', dark: true,
    lens: 'Light as material: indigo depth, cyan and violet emission, orbits in motion.',
    use: 'Evening worship, conferences, LED walls, concerts', c: NG,
    t: { displayScale: 0.9, display: 'unbounded', text: 'sora', label: 'jetbrains', accent: 'sora', displayWeight: 600, displayTransform: 'uppercase', displayTracking: .01, displayLeading: 1.08, textWeight: 400, labelWeight: 500, labelTracking: .18, accentWeight: 300 },
    motion: { enter: 'glow', enterSec: 1.05, exit: 'zoom-fade', exitSec: .5, ruleGrow: true }, motif: nightMotif, slot: { rx: .08, tilt: 0 },
  },
  {
    id: 'candlelight', name: 'Candlelight', director: 'the Baroque Dramatist', council: 'Art Council', dark: true,
    lens: 'Chiaroscuro and gilt: one warm source in deep darkness, emotion at full scale.',
    use: 'Christmas Eve, Good Friday, Tenebrae, candlelight vigils', c: CL,
    t: { displayScale: 1.05, display: 'bodoni', text: 'libreBaskerville', label: 'cormorant', accent: 'cormorant', displayWeight: 600, displayItalic: true, displayTransform: 'none', displayTracking: 0, displayLeading: 1.04, textWeight: 400, labelWeight: 600, labelTracking: .24, accentItalic: true, accentWeight: 500 },
    motion: { enter: 'reveal', enterSec: 1.3, exit: 'fade', exitSec: .7, ruleGrow: true }, motif: baroqueMotif, slot: { rx: .5, tilt: 0 },
  },
  {
    id: 'airy', name: 'Light & Airy', director: 'the Classical Mind', council: 'Art Council', dark: false,
    lens: 'Proportion at dawn: sky-to-linen light, translucent circles, a hairline arch.',
    use: 'Easter morning, baby dedications, weddings, daytime services', c: LA,
    t: { displayScale: 1.2, display: 'cormorant', text: 'karla', label: 'tenor', accent: 'cormorant', displayWeight: 500, displayTransform: 'none', displayTracking: 0, displayLeading: 1.02, textWeight: 400, labelWeight: 400, labelTracking: .24, accentItalic: true, accentWeight: 500 },
    motion: { enter: 'float', enterSec: 1.15, exit: 'float-up', exitSec: .6, ruleGrow: true }, motif: airyMotif, slot: { rx: .5, tilt: 0 },
  },
  // Modern / postmodern / abstract and urban families live in their own files.
  ...MODERN_THEMES_A,
  ...MODERN_THEMES_B,
  ...URBAN_THEMES,
];

export const DEFAULT_THEME_ID = 'sanctuary';
export function themeById(id?: string): SlideTheme { return SLIDE_THEMES.find(t => t.id === id) || SLIDE_THEMES[0]; }
