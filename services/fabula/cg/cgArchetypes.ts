// cgArchetypes — element builders. Each archetype turns a package (style system)
// into one broadcast-ready CgGraphic: a lower third, a full page, a stinger…
// Package tokens drive shape, type, colour and motion, so 24 packages × N
// archetypes gives a coherent, complete kit per show rather than a pile of
// unrelated templates.
import type { TitleAnim } from '../titleAnimators';
import type { CgPackage } from './cgPackages';
import { measureTiming } from './cgEvaluate';
import type {
  CgCategory, CgField, CgGraphic, CgLayer, CgLiveMode, CgMove, CgMoveType, CgEase, CgTextStyle, CgColor,
} from './cgTypes';

// ── colour helpers ───────────────────────────────────────────────────────────
function lum(c: string): number {
  const hex = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  let r = 0, g = 0, b = 0;
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return .5;
    [r, g, b] = m[1].split(',').map(s => parseFloat(s));
  }
  const f = (v: number) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
}
/** Text colour token that reads on the given background colour. */
function onColor(pk: CgPackage, bg: string): CgColor {
  const inkL = lum(pk.palette.ink), shadeL = lum(pk.palette.shade);
  const bgL = lum(bg);
  const contrast = (a: number, b: number) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const options: [CgColor, number][] = [['ink', contrast(inkL, bgL)], ['shade', contrast(shadeL, bgL)], ['#ffffff', contrast(1, bgL)], ['#0b0b0b', contrast(.003, bgL)]];
  options.sort((a, b) => b[1] - a[1]);
  // Prefer palette tokens when they're legible (≥ 4.5:1).
  const tok = options.find(o => (o[0] === 'ink' || o[0] === 'shade') && o[1] >= 4.5);
  return tok ? tok[0] : options[0][0];
}

// ── motion helpers ───────────────────────────────────────────────────────────
const mv = (type: CgMoveType, dur: number, delay = 0, ease: CgEase = 'out', amount?: number): CgMove => ({ type, dur, delay, ease, ...(amount != null ? { amount } : {}) });
const D = (pk: CgPackage, f = 1) => Math.round(pk.motion.dur * f * 100) / 100;
function textAnim(pk: CgPackage, delay: number, f = 1): TitleAnim {
  return { type: pk.motion.textAnim, duration: Math.max(.3, D(pk, f) * 1.1), delay, out: Math.max(.2, D(pk, .6)), stagger: pk.motion.stagger };
}

// ── layer kit ────────────────────────────────────────────────────────────────
interface Box { x: number; y: number; w: number; h: number }
let seq = 0;
const lid = (p: string) => `${p}${++seq}`;

function plate(pk: CgPackage, name: string, b: Box, delay = 0, opts: { fill?: CgColor; radius?: number; noSkew?: boolean; loop?: boolean } = {}): CgLayer[] {
  const s = pk.shape, r = opts.radius ?? s.radius, skew = opts.noSkew ? 0 : s.skew;
  const inM = mv(pk.motion.plateIn, D(pk), delay, pk.motion.ease);
  const outM = mv(pk.motion.plateOut, D(pk, .7), 0, 'inOut');
  const base: CgLayer = { id: lid('plate'), name, kind: 'rect', ...b, radius: r, skew, in: inM, out: outM };
  const fill = opts.fill;
  const loop = opts.loop !== false && (pk.motion.loop === 'shimmer' || pk.motion.loop === 'sweep') ? { type: pk.motion.loop, period: 4.5, amount: .22 } as CgLayer['loop'] : undefined;
  switch (fill ? 'solid' : s.plate) {
    case 'glass':
      return [{ ...base, fill: 'paper', stroke: 'rgba(255,255,255,.28)', strokeWidth: s.stroke || 1.5, shadow: { color: 'rgba(0,0,0,.35)', blur: 30, y: 10 }, loop }];
    case 'outline':
      return [{ ...base, fill: 'shade', opacity: .82, stroke: 'accent', strokeWidth: s.stroke || 2, loop }];
    case 'gradient':
      return [{ ...base, gradient: { type: 'linear', angle: 90, stops: [[0, 'paper'], [1, 'shade']] }, loop }];
    case 'duo':
      return [
        { ...base, fill: 'paper', loop },
        { id: lid('duo'), name: `${name} band`, kind: 'rect', x: b.x, y: b.y + b.h - Math.max(6, b.h * .12), w: b.w, h: Math.max(6, b.h * .12), skew, fill: 'secondary', in: mv('wipeR', D(pk), delay + D(pk, .4), pk.motion.ease), out: mv('fade', D(pk, .5)) },
      ];
    case 'paper':
      return [{ ...base, fill: 'paper', shadow: { color: 'rgba(0,0,0,.35)', blur: 18, x: 4, y: 8 }, rotation: s.skew ? -s.skew * .3 : 0, skew: 0 }];
    case 'none':
      return [{ ...base, name: `${name} scrim`, x: b.x - 60, w: b.w + 120, y: b.y - 20, h: b.h + 40, radius: 0, skew: 0, gradient: { type: 'linear', angle: 90, stops: [[0, 'rgba(0,0,0,.55)'], [.7, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']] }, in: mv('fade', D(pk), delay, 'inOut'), out: mv('fade', D(pk, .6)) }];
    default:
      return [{ ...base, fill: fill || 'paper', loop }];
  }
}

function accent(pk: CgPackage, b: Box, delay = 0, where: CgPackage['shape']['accent'] = pk.shape.accent): CgLayer[] {
  const im = (t: CgMoveType) => mv(t, D(pk, .8), delay, pk.motion.ease);
  const om = mv('fade', D(pk, .5));
  switch (where) {
    case 'left': return [{ id: lid('acc'), name: 'Accent bar', kind: 'rect', x: b.x - 14, y: b.y, w: 10, h: b.h, skew: pk.shape.skew, fill: 'accent', in: im(pk.motion.accentIn === 'growY' ? 'growY' : 'wipeD'), out: om }];
    case 'top': return [{ id: lid('acc'), name: 'Accent bar', kind: 'rect', x: b.x, y: b.y - 6, w: b.w, h: 6, fill: 'accent', in: im('growX'), out: om, loop: pk.motion.loop === 'sweep' ? { type: 'sweep', period: 3.2, amount: .3 } : undefined }];
    case 'under': return [{ id: lid('acc'), name: 'Accent rule', kind: 'rect', x: b.x, y: b.y + b.h + 8, w: Math.min(b.w, 220), h: 4, fill: 'accent', in: im(pk.motion.accentIn === 'wipeCenterX' ? 'wipeCenterX' : 'growX'), out: om }];
    case 'block': return [{ id: lid('acc'), name: 'Accent block', kind: 'rect', x: b.x - b.h * .55, y: b.y, w: b.h * .45, h: b.h, radius: Math.min(pk.shape.radius, b.h * .2), skew: pk.shape.skew, fill: 'accent', in: im(pk.motion.accentIn), out: om }];
    case 'slash': return [{ id: lid('acc'), name: 'Accent slash', kind: 'rect', x: b.x - 46, y: b.y, w: 28, h: b.h, skew: (pk.shape.skew || -14) * 1.2, fill: 'accent', in: im('slideL'), out: om, loop: { type: 'shimmer', period: 3, amount: .6 } }];
    default: return [];
  }
}

type Role = 'title' | 'sub' | 'tag' | 'body' | 'big' | 'hero' | 'mono';
function style(pk: CgPackage, role: Role, color: CgColor, extra: Partial<CgTextStyle> = {}): CgTextStyle {
  const t = pk.type;
  const base: Record<Role, CgTextStyle> = {
    title: { font: pk.fonts.display, weight: t.titleWeight, size: 54, color, align: 'left', upper: t.upper, tracking: t.tracking, italic: t.italic, maxLines: 1 },
    sub: { font: pk.fonts.text, weight: t.subWeight, size: 30, color, align: 'left', tracking: t.upper ? .04 : .01, maxLines: 1 },
    tag: { font: pk.fonts.utility, weight: 700, size: 22, color, align: 'center', upper: true, tracking: .12, maxLines: 1 },
    body: { font: pk.fonts.text, weight: 400, size: 40, color, align: 'left', lineHeight: 1.3, maxLines: 3 },
    big: { font: pk.fonts.display, weight: t.titleWeight, size: 110, color, align: 'left', upper: t.upper, tracking: t.tracking - .01, lineHeight: 1.02, maxLines: 2, italic: t.italic },
    hero: { font: pk.fonts.display, weight: t.titleWeight, size: 230, color, align: 'center', tracking: -.02, maxLines: 1 },
    mono: { font: pk.fonts.utility, weight: 500, size: 26, color, align: 'left', upper: true, tracking: .08, maxLines: 1 },
  };
  return { ...base[role], ...extra };
}

function text(pk: CgPackage, name: string, b: Box, content: string, role: Role, color: CgColor, delay: number, extra: Partial<CgTextStyle> = {}): CgLayer {
  const st = style(pk, role, color, extra);
  st.anim = textAnim(pk, delay, role === 'big' || role === 'hero' ? 1.2 : 1);
  return { id: lid('txt'), name, kind: 'text', ...b, text: content, style: st, out: mv('fade', D(pk, .5), 0, 'inOut') };
}

function ornament(pk: CgPackage, region: Box, delay = 0): CgLayer[] {
  const o = mv('fade', 1, delay, 'inOut'), out = mv('fade', D(pk, .6));
  switch (pk.ornament) {
    case 'grid': return [{ id: lid('orn'), name: 'Grid', kind: 'grid', ...region, stroke: 'accent', fill: 'accent', opacity: .14, strokeWidth: 1, deco: { spacing: 48 }, in: o, out }];
    case 'glow': return [{ id: lid('orn'), name: 'Glow', kind: 'glow', x: region.x - region.w * .1, y: region.y - region.h * .4, w: region.w * .7, h: region.h * 1.8, fill: 'highlight', opacity: .22, blend: 'screen', in: o, out, loop: { type: 'breathe', period: 5, amount: .4 } }];
    case 'particles': return [{ id: lid('orn'), name: 'Particles', kind: 'particles', ...region, fill: 'highlight', opacity: .7, blend: 'screen', deco: { count: 36, size: 2.5, seed: region.x + region.y }, in: o, out, loop: { type: 'drift', period: 9, amount: 0 } }];
    case 'ticks': return Array.from({ length: 5 }, (_, i) => ({ id: lid('orn'), name: `Tick ${i + 1}`, kind: 'rect' as const, x: region.x + region.w - 150 + i * 26, y: region.y - 22, w: 12, h: 8, skew: pk.shape.skew, fill: 'accent', opacity: 1 - i * .16, in: mv('fade', .2, delay + i * .05), out }));
    case 'double-rule': return [
      { id: lid('orn'), name: 'Rule top', kind: 'rect', x: region.x, y: region.y - 14, w: region.w, h: 1.5, fill: 'accent', in: mv('wipeCenterX', D(pk), delay, 'inOut'), out },
      { id: lid('orn'), name: 'Rule top 2', kind: 'rect', x: region.x, y: region.y - 9, w: region.w, h: 1, fill: 'accent', opacity: .6, in: mv('wipeCenterX', D(pk), delay + .08, 'inOut'), out },
    ];
    case 'dots': return Array.from({ length: 3 }, (_, i) => ({ id: lid('orn'), name: `Dot ${i + 1}`, kind: 'ellipse' as const, x: region.x + region.w + 18 + i * 22, y: region.y + region.h / 2 - 6, w: 12, h: 12, fill: i === 1 ? 'secondary' : 'accent', in: mv('pop', .35, delay + .1 * i, 'back'), out, loop: { type: 'float', period: 2.4 + i * .3, amount: 3 } }));
    case 'scan': return [{ id: lid('orn'), name: 'Scanlines', kind: 'grid', x: region.x, y: region.y, w: region.w, h: region.h, stroke: 'rgba(255,255,255,.08)', strokeWidth: 1, deco: { spacing: 4 }, in: o, out }];
    default: return [];
  }
}

// ── archetypes ───────────────────────────────────────────────────────────────
export interface CgArchetype {
  id: string; name: string; category: CgCategory; live: CgLiveMode; coverage: 'region' | 'full';
  hold: number; tags: string[]; fields: CgField[];
  build(pk: CgPackage): CgLayer[];
  /** Transition cut point (seconds) when live === 'transition'. */
  cut?(pk: CgPackage): number;
}
const F = (key: string, label: string, def: string, type: CgField['type'] = 'text'): CgField => ({ key, label, type, default: def });

// Lower-third zone
const LX = 150, LY = 820;

export const CG_ARCHETYPES: CgArchetype[] = [
  // ─── LOWER THIRDS ───
  {
    id: 'lt-strap', name: 'Name Strap', category: 'lower-third', live: 'hold', coverage: 'region', hold: 5, tags: ['name', 'super', 'two-line'],
    fields: [F('name', 'Name', 'Jordan Ellis'), F('title', 'Title', 'Senior Correspondent')],
    build: pk => {
      const main = { x: LX, y: LY, w: 760, h: 92 }, sub = { x: LX, y: LY + 92, w: 620, h: 52 };
      const c = onColor(pk, pk.palette.paper);
      return [
        ...ornament(pk, main, .1),
        ...plate(pk, 'Name plate', main, 0),
        ...plate(pk, 'Title plate', sub, D(pk, .35), { fill: pk.shape.plate === 'none' ? undefined : 'secondary', loop: false }),
        ...accent(pk, { x: main.x, y: main.y, w: main.w, h: main.h + sub.h }, D(pk, .2)),
        text(pk, 'Name', { x: main.x + 32, y: main.y + 8, w: main.w - 64, h: main.h - 16 }, '{name}', 'title', c, D(pk, .45)),
        text(pk, 'Title', { x: sub.x + 32, y: sub.y + 4, w: sub.w - 64, h: sub.h - 8 }, '{title}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.secondary), D(pk, .7)),
      ];
    },
  },
  {
    id: 'lt-kicker', name: 'Kicker Two-Line', category: 'lower-third', live: 'hold', coverage: 'region', hold: 5, tags: ['kicker', 'tag', 'name'],
    fields: [F('tag', 'Kicker', 'Live'), F('name', 'Name', 'Amara Okafor'), F('title', 'Title', 'Climate Scientist · Lagos')],
    build: pk => {
      const tagB = { x: LX, y: LY - 46, w: 150, h: 40 }, main = { x: LX, y: LY, w: 820, h: 130 };
      return [
        ...plate(pk, 'Plate', main, 0),
        { id: lid('tag'), name: 'Kicker pill', kind: 'rect', ...tagB, radius: Math.min(pk.shape.radius, 20), skew: pk.shape.skew, fill: 'accent', in: mv('pop', D(pk, .6), D(pk, .3), 'back'), out: mv('fade', .3) },
        text(pk, 'Kicker', { x: tagB.x + 8, y: tagB.y, w: tagB.w - 16, h: tagB.h }, '{tag}', 'tag', onColor(pk, pk.palette.accent), D(pk, .5)),
        text(pk, 'Name', { x: main.x + 34, y: main.y + 10, w: main.w - 68, h: 70 }, '{name}', 'title', onColor(pk, pk.palette.paper), D(pk, .4), { size: 58 }),
        text(pk, 'Title', { x: main.x + 34, y: main.y + 78, w: main.w - 68, h: 40 }, '{title}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.paper), D(pk, .65), { size: 28 }),
        ...accent(pk, main, D(pk, .2), pk.shape.accent === 'block' ? 'left' : pk.shape.accent),
      ];
    },
  },
  {
    id: 'lt-minimal', name: 'Hairline Minimal', category: 'lower-third', live: 'hold', coverage: 'region', hold: 5, tags: ['minimal', 'clean', 'documentary'],
    fields: [F('name', 'Name', 'Mira Castellanos'), F('title', 'Title', 'Architect')],
    build: pk => {
      const b = { x: LX, y: LY + 10, w: 700, h: 120 };
      return [
        { id: lid('scrim'), name: 'Scrim', kind: 'rect', x: 0, y: 700, w: 1100, h: 380, gradient: { type: 'linear', angle: 45, stops: [[0, 'rgba(0,0,0,.5)'], [.6, 'rgba(0,0,0,0)']] }, in: mv('fade', 1, 0, 'inOut'), out: mv('fade', .6) },
        { id: lid('rule'), name: 'Hairline', kind: 'rect', x: b.x, y: b.y + 72, w: 340, h: 2, fill: 'accent', in: mv('growX', D(pk, 1.2), 0, 'inOut'), out: mv('wipeL', D(pk, .6), 0, 'inOut') },
        text(pk, 'Name', { x: b.x, y: b.y, w: b.w, h: 66 }, '{name}', 'title', '#ffffff', D(pk, .3), { shadow: { color: 'rgba(0,0,0,.6)', blur: 12 }, valign: 'bottom' }),
        text(pk, 'Title', { x: b.x, y: b.y + 82, w: b.w, h: 40 }, '{title}', 'sub', '#ffffffcc', D(pk, .6), { shadow: { color: 'rgba(0,0,0,.6)', blur: 10 }, valign: 'top', upper: true, tracking: .16, size: 24 }),
      ];
    },
  },
  {
    id: 'lt-block', name: 'Logo Block', category: 'lower-third', live: 'hold', coverage: 'region', hold: 5, tags: ['logo', 'brand', 'monogram'],
    fields: [F('mark', 'Mark (2–3 letters)', 'PJ'), F('name', 'Name', 'Plajah Live'), F('title', 'Title', 'Weeknights at 9')],
    build: pk => {
      const sq = { x: LX, y: LY, w: 130, h: 130 }, main = { x: LX + 130, y: LY + 14, w: 680, h: 102 };
      return [
        { id: lid('mk'), name: 'Mark block', kind: 'rect', ...sq, radius: pk.shape.radius, fill: 'accent', in: mv('pop', D(pk, .8), 0, 'back'), out: mv('pop', D(pk, .5), 0, 'inOut'), loop: pk.motion.loop === 'pulse' ? { type: 'pulse', period: 2.4, amount: .03 } : undefined },
        text(pk, 'Mark', sq, '{mark}', 'title', onColor(pk, pk.palette.accent), D(pk, .5), { align: 'center', size: 62 }),
        ...plate(pk, 'Plate', main, D(pk, .3), { noSkew: true }),
        text(pk, 'Name', { x: main.x + 30, y: main.y + 6, w: main.w - 60, h: 58 }, '{name}', 'title', onColor(pk, pk.palette.paper), D(pk, .6)),
        text(pk, 'Title', { x: main.x + 30, y: main.y + 60, w: main.w - 60, h: 36 }, '{title}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.paper), D(pk, .8), { size: 26 }),
      ];
    },
  },
  {
    id: 'lt-headline', name: 'Headline Strap', category: 'lower-third', live: 'hold', coverage: 'region', hold: 8, tags: ['news', 'headline', 'strap', 'full-width'],
    fields: [F('tag', 'Tag', 'Developing'), F('headline', 'Headline', 'City council approves new transit corridor')],
    build: pk => {
      const strap = { x: 96, y: 870, w: 1728, h: 96 }, tagB = { x: 96, y: 870, w: 280, h: 96 };
      return [
        ...plate(pk, 'Strap', strap, 0, { noSkew: true }),
        { id: lid('tag'), name: 'Tag block', kind: 'rect', ...tagB, fill: 'accent', skew: pk.shape.skew ? pk.shape.skew / 2 : 0, in: mv('wipeR', D(pk, .7), D(pk, .2), pk.motion.ease), out: mv('wipeL', D(pk, .5)) },
        text(pk, 'Tag', { x: tagB.x + 12, y: tagB.y, w: tagB.w - 24, h: tagB.h }, '{tag}', 'tag', onColor(pk, pk.palette.accent), D(pk, .5), { size: 26 }),
        text(pk, 'Headline', { x: 408, y: 876, w: 1390, h: 84 }, '{headline}', 'title', onColor(pk, pk.palette.paper), D(pk, .6), { size: 50 }),
      ];
    },
  },
  {
    id: 'lt-guest', name: 'Guest with Photo', category: 'lower-third', live: 'hold', coverage: 'region', hold: 6, tags: ['guest', 'photo', 'avatar', 'remote'],
    fields: [F('photo', 'Photo URL', '', 'image'), F('name', 'Name', 'Dr. Lena Park'), F('title', 'Title', 'Joining from Seoul')],
    build: pk => {
      const ph = { x: LX, y: LY - 10, w: 150, h: 150 }, main = { x: LX + 110, y: LY + 14, w: 720, h: 104 };
      return [
        ...plate(pk, 'Plate', main, D(pk, .25), { noSkew: true }),
        { id: lid('ring'), name: 'Photo ring', kind: 'ellipse', x: ph.x - 6, y: ph.y - 6, w: ph.w + 12, h: ph.h + 12, fill: 'accent', in: mv('pop', D(pk, .7), 0, 'back'), out: mv('pop', D(pk, .5)) },
        { id: lid('img'), name: 'Photo', kind: 'image', ...ph, src: 'photo', radius: 75, fit: 'cover', in: mv('pop', D(pk, .7), .05, 'back'), out: mv('pop', D(pk, .5)) },
        text(pk, 'Name', { x: main.x + 70, y: main.y + 6, w: main.w - 100, h: 58 }, '{name}', 'title', onColor(pk, pk.palette.paper), D(pk, .55)),
        text(pk, 'Title', { x: main.x + 70, y: main.y + 62, w: main.w - 100, h: 36 }, '{title}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.paper), D(pk, .75), { size: 26 }),
      ];
    },
  },
  {
    id: 'lt-social', name: 'Social Handle', category: 'social', live: 'hold', coverage: 'region', hold: 5, tags: ['social', 'handle', 'follow'],
    fields: [F('platform', 'Platform glyph', '@'), F('handle', 'Handle', '@plajahlive'), F('cta', 'Call to action', 'Follow for more')],
    build: pk => {
      const pill = { x: LX, y: LY + 20, w: 560, h: 90 };
      return [
        ...plate(pk, 'Pill', pill, 0, { radius: 45, noSkew: true }),
        { id: lid('ic'), name: 'Glyph disc', kind: 'ellipse', x: pill.x + 14, y: pill.y + 12, w: 66, h: 66, fill: 'accent', in: mv('spin', D(pk, .9), D(pk, .2), 'back', 180), out: mv('pop', .3) },
        text(pk, 'Glyph', { x: pill.x + 14, y: pill.y + 12, w: 66, h: 66 }, '{platform}', 'title', onColor(pk, pk.palette.accent), D(pk, .5), { align: 'center', size: 38, upper: false }),
        text(pk, 'Handle', { x: pill.x + 100, y: pill.y + 6, w: 430, h: 50 }, '{handle}', 'title', onColor(pk, pk.palette.paper), D(pk, .5), { size: 40, upper: false }),
        text(pk, 'CTA', { x: pill.x + 100, y: pill.y + 52, w: 430, h: 30 }, '{cta}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.paper), D(pk, .7), { size: 22 }),
      ];
    },
  },
  {
    id: 'lt-breaking', name: 'Breaking Flash', category: 'lower-third', live: 'hold', coverage: 'region', hold: 10, tags: ['breaking', 'alert', 'news', 'ticker'],
    fields: [F('tag', 'Flash', 'Breaking'), F('headline', 'Headline', 'Severe storm warning issued for the coast'), F('items', 'Crawl items', 'Schools close early | Ferries suspended | Shelters open downtown', 'list')],
    build: pk => {
      const strap = { x: 0, y: 860, w: 1920, h: 110 }, crawl = { x: 0, y: 970, w: 1920, h: 54 };
      return [
        { id: lid('flash'), name: 'Flash bar', kind: 'rect', ...strap, fill: 'accent', in: mv('wipeR', D(pk, .6), 0, 'expo'), out: mv('wipeR', D(pk, .5)) },
        { id: lid('tagb'), name: 'Flash tag', kind: 'rect', x: 96, y: 878, w: 300, h: 74, fill: 'shade', skew: pk.shape.skew, in: mv('pop', .4, D(pk, .6), 'back'), out: mv('fade', .3), loop: { type: 'blink', period: 1.2 } },
        text(pk, 'Flash', { x: 106, y: 878, w: 280, h: 74 }, '{tag}', 'tag', '#ffffff', D(pk, .7), { size: 32 }),
        text(pk, 'Headline', { x: 430, y: 868, w: 1390, h: 94 }, '{headline}', 'title', onColor(pk, pk.palette.accent), D(pk, .8), { size: 52 }),
        { id: lid('cb'), name: 'Crawl bed', kind: 'rect', ...crawl, fill: 'shade', in: mv('wipeD', .3, D(pk, .9)), out: mv('fade', .3) },
        { id: lid('crawl'), name: 'Crawl', kind: 'ticker', x: 0, y: crawl.y, w: 1920, h: crawl.h, ticker: { field: 'items', speed: 140, gap: 28 }, style: style(pk, 'sub', '#ffffff', { size: 28, upper: true }), in: mv('fade', .3, D(pk, 1.1)), out: mv('fade', .3) },
      ];
    },
  },
  {
    id: 'lt-split', name: 'Split Duo', category: 'lower-third', live: 'hold', coverage: 'region', hold: 6, tags: ['interview', 'two-shot', 'debate'],
    fields: [F('nameA', 'Left name', 'Sam Rivera'), F('titleA', 'Left title', 'Host'), F('nameB', 'Right name', 'Noor Haddad'), F('titleB', 'Right title', 'Guest')],
    build: pk => {
      const a = { x: 130, y: LY + 10, w: 640, h: 110 }, b = { x: 1150, y: LY + 10, w: 640, h: 110 };
      return [
        ...plate(pk, 'Left plate', a, 0),
        ...plate(pk, 'Right plate', b, D(pk, .25)),
        ...accent(pk, a, D(pk, .15)),
        text(pk, 'Left name', { x: a.x + 30, y: a.y + 6, w: a.w - 60, h: 60 }, '{nameA}', 'title', onColor(pk, pk.palette.paper), D(pk, .4), { size: 48 }),
        text(pk, 'Left title', { x: a.x + 30, y: a.y + 66, w: a.w - 60, h: 36 }, '{titleA}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.paper), D(pk, .6), { size: 26 }),
        text(pk, 'Right name', { x: b.x + 30, y: b.y + 6, w: b.w - 60, h: 60 }, '{nameB}', 'title', onColor(pk, pk.palette.paper), D(pk, .65), { size: 48, align: 'right' }),
        text(pk, 'Right title', { x: b.x + 30, y: b.y + 66, w: b.w - 60, h: 36 }, '{titleB}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.paper), D(pk, .85), { size: 26, align: 'right' }),
      ];
    },
  },
  {
    id: 'lt-center', name: 'Center Super', category: 'lower-third', live: 'hold', coverage: 'region', hold: 5, tags: ['centered', 'ceremony', 'speaker'],
    fields: [F('name', 'Name', 'Pastor Daniel Hughes'), F('title', 'Title', 'Lead Pastor')],
    build: pk => {
      const b = { x: 560, y: LY, w: 800, h: 140 };
      return [
        ...plate(pk, 'Plate', b, 0, { noSkew: true }),
        { id: lid('rule'), name: 'Center rule', kind: 'rect', x: 860, y: b.y + 82, w: 200, h: 3, fill: 'accent', in: mv('wipeCenterX', D(pk), D(pk, .3), 'inOut'), out: mv('wipeCenterX', D(pk, .5)) },
        text(pk, 'Name', { x: b.x + 30, y: b.y + 8, w: b.w - 60, h: 70 }, '{name}', 'title', onColor(pk, pk.palette.paper), D(pk, .4), { align: 'center' }),
        text(pk, 'Title', { x: b.x + 30, y: b.y + 92, w: b.w - 60, h: 40 }, '{title}', 'sub', pk.shape.plate === 'none' ? 'secondary' : onColor(pk, pk.palette.paper), D(pk, .7), { align: 'center', upper: true, tracking: .14, size: 24 }),
      ];
    },
  },

  // ─── FULL PAGES ───
  {
    id: 'fp-headline', name: 'Headline Board', category: 'full-page', live: 'hold', coverage: 'full', hold: 6, tags: ['headline', 'board', 'story'],
    fields: [F('kicker', 'Kicker', 'Tonight'), F('headline', 'Headline', 'The future of the city starts underground'), F('deck', 'Deck', 'A ten-year plan to rebuild transit, block by block.', 'multiline')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, gradient: { type: 'linear', angle: 160, stops: [[0, 'paper'], [1, 'shade']] }, in: mv(pk.motion.plateIn === 'pop' ? 'fade' : pk.motion.plateIn, D(pk, 1.1), 0, pk.motion.ease), out: mv('fade', D(pk, .7)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .2),
      { id: lid('bar'), name: 'Accent bar', kind: 'rect', x: 160, y: 300, w: 12, h: 420, fill: 'accent', skew: pk.shape.skew, in: mv('growY', D(pk), D(pk, .5), pk.motion.ease), out: mv('fade', .4) },
      text(pk, 'Kicker', { x: 210, y: 300, w: 900, h: 50 }, '{kicker}', 'mono', 'accent', D(pk, .7)),
      text(pk, 'Headline', { x: 210, y: 360, w: 1400, h: 250 }, '{headline}', 'big', onColor(pk, pk.palette.paper), D(pk, .8), { valign: 'top' }),
      text(pk, 'Deck', { x: 210, y: 630, w: 1200, h: 110 }, '{deck}', 'body', 'secondary', D(pk, 1.1), { valign: 'top', maxLines: 2 }),
    ],
  },
  {
    id: 'fp-bullets', name: 'Three Points', category: 'full-page', live: 'hold', coverage: 'full', hold: 8, tags: ['bullets', 'agenda', 'explainer'],
    fields: [F('title', 'Title', 'What we know'), F('b1', 'Point 1', 'The bridge reopens Monday at 6 AM'), F('b2', 'Point 2', 'Two lanes stay closed through spring'), F('b3', 'Point 3', 'Buses reroute via 5th Avenue')],
    build: pk => {
      const L: CgLayer[] = [
        { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, fill: 'paper', in: mv('fade', D(pk), 0, 'inOut'), out: mv('fade', D(pk, .7)) },
        ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .1),
        text(pk, 'Title', { x: 180, y: 180, w: 1500, h: 120 }, '{title}', 'big', onColor(pk, pk.palette.paper), D(pk, .5), { size: 96, maxLines: 1 }),
        { id: lid('rule'), name: 'Rule', kind: 'rect', x: 180, y: 318, w: 260, h: 6, fill: 'accent', in: mv('growX', D(pk), D(pk, .7), pk.motion.ease), out: mv('fade', .4) },
      ];
      ['b1', 'b2', 'b3'].forEach((k, i) => {
        const y = 420 + i * 170, dl = D(pk, 1) + i * .22;
        L.push({ id: lid('n'), name: `Number ${i + 1}`, kind: 'rect', x: 180, y, w: 96, h: 96, radius: pk.shape.radius ? 48 : 0, skew: pk.shape.skew, fill: 'accent', in: mv('pop', D(pk, .7), dl, 'back'), out: mv('fade', .3) });
        L.push(text(pk, `Number label ${i + 1}`, { x: 180, y, w: 96, h: 96 }, String(i + 1), 'title', onColor(pk, pk.palette.accent), dl + .1, { align: 'center', size: 52 }));
        L.push(text(pk, `Point ${i + 1}`, { x: 320, y: y - 4, w: 1400, h: 104 }, `{${k}}`, 'body', onColor(pk, pk.palette.paper), dl + .15, { size: 46, maxLines: 2 }));
      });
      return L;
    },
  },
  {
    id: 'fp-stat', name: 'Big Stat', category: 'data', live: 'hold', coverage: 'full', hold: 6, tags: ['stat', 'number', 'data'],
    fields: [F('value', 'Value', '87%'), F('label', 'Label', 'of viewers watched live'), F('source', 'Source', 'Source: Plajah Analytics, 2026')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, gradient: { type: 'radial', stops: [[0, 'paper'], [1, 'shade']] }, in: mv('fade', D(pk), 0, 'inOut'), out: mv('fade', D(pk, .7)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .1),
      { id: lid('ring'), name: 'Ring', kind: 'ellipse', x: 660, y: 140, w: 600, h: 600, stroke: 'accent', strokeWidth: 6, in: mv('iris', D(pk, 1.4), .1, 'inOut'), out: mv('fade', .4), loop: { type: 'rotate', period: 30, amount: 360 }, dash: [40, 18] },
      text(pk, 'Value', { x: 260, y: 300, w: 1400, h: 280 }, '{value}', 'hero', 'accent', D(pk, .6)),
      text(pk, 'Label', { x: 360, y: 780, w: 1200, h: 80 }, '{label}', 'body', onColor(pk, pk.palette.paper), D(pk, 1), { align: 'center', size: 50, maxLines: 1 }),
      text(pk, 'Source', { x: 360, y: 880, w: 1200, h: 40 }, '{source}', 'mono', 'secondary', D(pk, 1.3), { align: 'center', size: 20 }),
    ],
  },
  {
    id: 'fp-quote', name: 'Pull Quote', category: 'quote', live: 'hold', coverage: 'full', hold: 8, tags: ['quote', 'testimony', 'verse'],
    fields: [F('quote', 'Quote', 'We do not inherit the earth from our ancestors; we borrow it from our children.', 'multiline'), F('who', 'Attribution', 'Proverb')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, fill: 'paper', in: mv('fade', D(pk, 1.2), 0, 'inOut'), out: mv('fade', D(pk, .8)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .2),
      text(pk, 'Quote mark', { x: 200, y: 120, w: 300, h: 300 }, '“', 'hero', 'accent', D(pk, .4), { align: 'left', size: 360, upper: false }),
      text(pk, 'Quote', { x: 300, y: 320, w: 1320, h: 420 }, '{quote}', 'body', onColor(pk, pk.palette.paper), D(pk, .8), { font: pk.fonts.display, size: 66, lineHeight: 1.2, maxLines: 5, align: 'left', valign: 'top' }),
      { id: lid('rule'), name: 'Rule', kind: 'rect', x: 300, y: 790, w: 90, h: 4, fill: 'accent', in: mv('growX', D(pk), D(pk, 1.4)), out: mv('fade', .3) },
      text(pk, 'Attribution', { x: 410, y: 768, w: 1000, h: 50 }, '{who}', 'mono', 'secondary', D(pk, 1.5)),
    ],
  },
  {
    id: 'fp-split', name: 'Split Feature', category: 'full-page', live: 'hold', coverage: 'full', hold: 7, tags: ['photo', 'feature', 'profile'],
    fields: [F('image', 'Image URL', '', 'image'), F('kicker', 'Kicker', 'Profile'), F('title', 'Title', 'The architect of quiet rooms'), F('body', 'Body', 'How one designer rebuilt a neighbourhood library around silence.', 'multiline')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, fill: 'paper', in: mv('fade', D(pk), 0, 'inOut'), out: mv('fade', D(pk, .7)) },
      { id: lid('img'), name: 'Image', kind: 'image', x: 0, y: 0, w: 900, h: 1080, src: 'image', fit: 'cover', in: mv('wipeR', D(pk, 1.2), .1, pk.motion.ease), out: mv('wipeL', D(pk, .7)) },
      { id: lid('bar'), name: 'Seam', kind: 'rect', x: 900, y: 0, w: 14, h: 1080, fill: 'accent', in: mv('growY', D(pk), D(pk, .8)), out: mv('fade', .3) },
      text(pk, 'Kicker', { x: 1000, y: 330, w: 800, h: 44 }, '{kicker}', 'mono', 'accent', D(pk, 1)),
      text(pk, 'Title', { x: 1000, y: 390, w: 800, h: 240 }, '{title}', 'big', onColor(pk, pk.palette.paper), D(pk, 1.1), { size: 86, valign: 'top' }),
      text(pk, 'Body', { x: 1000, y: 650, w: 760, h: 160 }, '{body}', 'body', 'secondary', D(pk, 1.4), { size: 36, valign: 'top' }),
    ],
  },
  {
    id: 'fp-lineup', name: 'Lineup / Agenda', category: 'full-page', live: 'hold', coverage: 'full', hold: 8, tags: ['schedule', 'run of show', 'agenda'],
    fields: [F('title', 'Title', 'Coming up'), F('t1', 'Time 1', '7:00'), F('i1', 'Item 1', 'Opening worship'), F('t2', 'Time 2', '7:20'), F('i2', 'Item 2', 'Community news'), F('t3', 'Time 3', '7:35'), F('i3', 'Item 3', 'The message'), F('t4', 'Time 4', '8:15'), F('i4', 'Item 4', 'Closing & prayer')],
    build: pk => {
      const L: CgLayer[] = [
        { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, gradient: { type: 'linear', angle: 180, stops: [[0, 'paper'], [1, 'shade']] }, in: mv('fade', D(pk), 0, 'inOut'), out: mv('fade', D(pk, .7)) },
        ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .1),
        text(pk, 'Title', { x: 200, y: 150, w: 1500, h: 120 }, '{title}', 'big', onColor(pk, pk.palette.paper), D(pk, .5), { size: 100, maxLines: 1 }),
      ];
      for (let i = 0; i < 4; i++) {
        const y = 340 + i * 150, dl = D(pk, .9) + i * .18;
        L.push(...plate(pk, `Row ${i + 1}`, { x: 200, y, w: 1520, h: 120 }, dl, { fill: 'shade', loop: false }));
        L.push({ id: lid('t'), name: `Time chip ${i + 1}`, kind: 'rect', x: 200, y, w: 220, h: 120, skew: pk.shape.skew, radius: pk.shape.radius, fill: 'accent', in: mv('wipeR', D(pk, .7), dl + .05), out: mv('fade', .3) });
        L.push(text(pk, `Time ${i + 1}`, { x: 210, y, w: 200, h: 120 }, `{t${i + 1}}`, 'title', onColor(pk, pk.palette.accent), dl + .15, { align: 'center', size: 50 }));
        L.push(text(pk, `Item ${i + 1}`, { x: 460, y, w: 1220, h: 120 }, `{i${i + 1}}`, 'title', onColor(pk, pk.palette.shade), dl + .2, { size: 48, upper: false }));
      }
      return L;
    },
  },
  {
    id: 'fp-compare', name: 'Head to Head', category: 'data', live: 'hold', coverage: 'full', hold: 7, tags: ['compare', 'versus', 'election', 'match'],
    fields: [F('title', 'Title', 'Head to head'), F('a', 'Left', 'North'), F('av', 'Left value', '52%'), F('b', 'Right', 'South'), F('bv', 'Right value', '48%')],
    build: pk => [
      { id: lid('bgA'), name: 'Left field', kind: 'rect', x: 0, y: 0, w: 960, h: 1080, fill: 'paper', in: mv('slideD', D(pk, 1.1), 0, pk.motion.ease), out: mv('slideU', D(pk, .7)) },
      { id: lid('bgB'), name: 'Right field', kind: 'rect', x: 960, y: 0, w: 960, h: 1080, fill: 'shade', in: mv('slideU', D(pk, 1.1), 0, pk.motion.ease), out: mv('slideD', D(pk, .7)) },
      { id: lid('vs'), name: 'VS disc', kind: 'ellipse', x: 880, y: 460, w: 160, h: 160, fill: 'accent', in: mv('pop', D(pk, .8), D(pk, 1), 'back'), out: mv('pop', .3), loop: { type: 'pulse', period: 2, amount: .05 } },
      text(pk, 'VS', { x: 880, y: 460, w: 160, h: 160 }, 'VS', 'title', onColor(pk, pk.palette.accent), D(pk, 1.2), { align: 'center', size: 58, upper: true }),
      text(pk, 'Title', { x: 360, y: 90, w: 1200, h: 80 }, '{title}', 'mono', 'accent', D(pk, .9), { align: 'center', size: 34 }),
      text(pk, 'Left name', { x: 120, y: 300, w: 720, h: 100 }, '{a}', 'title', onColor(pk, pk.palette.paper), D(pk, 1.1), { align: 'center', size: 72 }),
      text(pk, 'Left value', { x: 120, y: 420, w: 720, h: 260 }, '{av}', 'hero', onColor(pk, pk.palette.paper), D(pk, 1.3), { size: 210 }),
      text(pk, 'Right name', { x: 1080, y: 300, w: 720, h: 100 }, '{b}', 'title', onColor(pk, pk.palette.shade), D(pk, 1.2), { align: 'center', size: 72 }),
      text(pk, 'Right value', { x: 1080, y: 420, w: 720, h: 260 }, '{bv}', 'hero', onColor(pk, pk.palette.shade), D(pk, 1.4), { size: 210 }),
    ],
  },
  {
    id: 'fp-chart', name: 'Bar Chart Board', category: 'data', live: 'hold', coverage: 'full', hold: 8, tags: ['chart', 'bars', 'trend'],
    fields: [F('title', 'Title', 'Weekly viewers'), F('values', 'Values (comma)', '12, 18, 15, 22, 27, 31, 40', 'list'), F('caption', 'Caption', 'Up 233% since launch')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, fill: 'paper', in: mv('fade', D(pk), 0, 'inOut'), out: mv('fade', D(pk, .7)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .1),
      text(pk, 'Title', { x: 200, y: 140, w: 1500, h: 110 }, '{title}', 'big', onColor(pk, pk.palette.paper), D(pk, .5), { size: 90, maxLines: 1 }),
      { id: lid('axis'), name: 'Axis', kind: 'rect', x: 200, y: 850, w: 1520, h: 3, fill: 'secondary', in: mv('growX', D(pk), D(pk, .7)), out: mv('fade', .3) },
      { id: lid('bars'), name: 'Bars', kind: 'bars', x: 220, y: 330, w: 1480, h: 518, fill: 'accent', deco: { values: '12, 18, 15, 22, 27, 31, 40', spacing: 28 }, in: mv('growY', D(pk, 1.6), D(pk, 1), pk.motion.ease), out: mv('fade', .4) },
      text(pk, 'Caption', { x: 200, y: 890, w: 1500, h: 60 }, '{caption}', 'mono', 'accent', D(pk, 1.8)),
    ],
  },

  // ─── TRANSITIONS ───
  {
    id: 'tr-panels', name: 'Panel Sweep', category: 'transition', live: 'transition', coverage: 'full', hold: 0, tags: ['stinger', 'wipe', 'panels'],
    fields: [],
    build: pk => (['accent', 'secondary', 'paper'] as CgColor[]).map((c, i) => ({ id: lid('pan'), name: `Panel ${i + 1}`, kind: 'rect' as const, x: -200, y: 0, w: 2320, h: 1080, skew: pk.shape.skew || -10, fill: c, in: mv('slideL', .45, i * .08, 'quart', 1), out: mv('slideR', .45, (2 - i) * .08, 'in', 1) })),
    cut: () => .62,
  },
  {
    id: 'tr-slash', name: 'Diagonal Slash', category: 'transition', live: 'transition', coverage: 'full', hold: 0, tags: ['stinger', 'slash', 'diagonal'],
    fields: [F('mark', 'Mark', 'PLAJAH')],
    build: pk => ([
      { id: lid('sl'), name: 'Slash A', kind: 'rect', x: -400, y: -100, w: 1500, h: 1280, skew: -24, fill: 'accent', in: mv('slideL', .4, 0, 'expo', 1.4), out: mv('slideL', .4, .05, 'in', 1.4) },
      { id: lid('sl'), name: 'Slash B', kind: 'rect', x: 800, y: -100, w: 1600, h: 1280, skew: -24, fill: 'paper', in: mv('slideR', .4, .05, 'expo', 1.4), out: mv('slideR', .4, 0, 'in', 1.4) },
      text(pk, 'Mark', { x: 360, y: 440, w: 1200, h: 200 }, '{mark}', 'hero', onColor(pk, pk.palette.paper), .3, { size: 150, anim: undefined }),
    ] as CgLayer[]).map(l => l.kind === 'text' ? { ...l, in: mv('zoom', .3, .25, 'out', 1.3), out: mv('fade', .2, .2) } : l),
    cut: () => .5,
  },
  {
    id: 'tr-iris', name: 'Iris Bloom', category: 'transition', live: 'transition', coverage: 'full', hold: 0, tags: ['stinger', 'iris', 'circle'],
    fields: [],
    build: () => [
      { id: lid('ir'), name: 'Outer ring', kind: 'ellipse', x: -240, y: -660, w: 2400, h: 2400, fill: 'accent', in: mv('pop', .5, 0, 'quart'), out: mv('pop', .45, .1, 'in') },
      { id: lid('ir'), name: 'Inner ring', kind: 'ellipse', x: -240, y: -660, w: 2400, h: 2400, fill: 'paper', in: mv('pop', .5, .1, 'quart'), out: mv('pop', .45, 0, 'in') },
    ],
    cut: () => .62,
  },
  {
    id: 'tr-shutter', name: 'Shutter Blinds', category: 'transition', live: 'transition', coverage: 'full', hold: 0, tags: ['stinger', 'blinds', 'shutter'],
    fields: [],
    build: pk => Array.from({ length: 8 }, (_, i) => ({ id: lid('sh'), name: `Blind ${i + 1}`, kind: 'rect' as const, x: 0, y: i * 135, w: 1920, h: 136, fill: (i % 2 ? 'accent' : 'paper') as CgColor, in: mv('growY', .35, i * .035, pk.motion.ease === 'elastic' ? 'back' : 'quart'), out: mv('growY', .35, (7 - i) * .035, 'in') })),
    cut: () => .62,
  },
  {
    id: 'tr-logo', name: 'Logo Sting', category: 'transition', live: 'transition', coverage: 'full', hold: 0, tags: ['stinger', 'logo', 'brand'],
    fields: [F('mark', 'Logo text', 'PLAJAH'), F('sub', 'Sub line', 'LIVE')],
    build: pk => [
      { id: lid('bg'), name: 'Field', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, gradient: { type: 'radial', stops: [[0, 'paper'], [1, 'shade']] }, in: mv('iris', .45, 0, 'quart'), out: mv('iris', .4, 0, 'in') },
      { id: lid('bar'), name: 'Bar', kind: 'rect', x: 560, y: 600, w: 800, h: 8, fill: 'accent', in: mv('wipeCenterX', .3, .3, 'expo'), out: mv('wipeCenterX', .2, .2) },
      { id: lid('mk'), name: 'Logo', kind: 'text', x: 260, y: 400, w: 1400, h: 200, text: '{mark}', style: style(pk, 'hero', onColor(pk, pk.palette.paper), { size: 170 }), in: mv('zoom', .35, .2, 'expo', 1.4), out: mv('blur', .25, .15) },
      { id: lid('sb'), name: 'Sub', kind: 'text', x: 560, y: 620, w: 800, h: 60, text: '{sub}', style: style(pk, 'tag', 'accent', { size: 34, tracking: .5 }), in: mv('fade', .25, .4), out: mv('fade', .2, .15) },
    ],
    cut: () => .55,
  },

  // ─── TITLES / OPENERS / END CARDS ───
  {
    id: 'ti-center', name: 'Center Title', category: 'title', live: 'hold', coverage: 'region', hold: 4, tags: ['title', 'card', 'centered'],
    fields: [F('title', 'Title', 'Chapter One'), F('subtitle', 'Subtitle', 'The long way home')],
    build: pk => [
      ...ornament(pk, { x: 360, y: 380, w: 1200, h: 300 }, .2),
      text(pk, 'Title', { x: 160, y: 380, w: 1600, h: 200 }, '{title}', 'big', '#ffffff', .2, { align: 'center', size: 140, shadow: { color: 'rgba(0,0,0,.55)', blur: 24 }, maxLines: 1 }),
      { id: lid('rule'), name: 'Rule', kind: 'rect', x: 860, y: 600, w: 200, h: 3, fill: 'accent', in: mv('wipeCenterX', D(pk), D(pk, .8), 'inOut'), out: mv('wipeCenterX', D(pk, .5)) },
      text(pk, 'Subtitle', { x: 360, y: 625, w: 1200, h: 70 }, '{subtitle}', 'sub', '#ffffffdd', D(pk, 1), { align: 'center', size: 40, upper: true, tracking: .2, shadow: { color: 'rgba(0,0,0,.55)', blur: 16 } }),
    ],
  },
  {
    id: 'ti-chapter', name: 'Chapter Card', category: 'title', live: 'hold', coverage: 'full', hold: 4, tags: ['chapter', 'section', 'number'],
    fields: [F('num', 'Number', '01'), F('title', 'Title', 'Origins')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, fill: 'paper', in: mv(pk.motion.plateIn === 'pop' ? 'fade' : pk.motion.plateIn, D(pk, 1.1), 0, pk.motion.ease), out: mv('fade', D(pk, .7)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .2),
      text(pk, 'Number', { x: 200, y: 260, w: 700, h: 400 }, '{num}', 'hero', 'accent', D(pk, .5), { align: 'left', size: 380 }),
      { id: lid('bar'), name: 'Bar', kind: 'rect', x: 210, y: 690, w: 120, h: 8, fill: 'accent', skew: pk.shape.skew, in: mv('growX', D(pk), D(pk, .8)), out: mv('fade', .3) },
      text(pk, 'Title', { x: 200, y: 720, w: 1500, h: 140 }, '{title}', 'big', onColor(pk, pk.palette.paper), D(pk, 1), { maxLines: 1 }),
    ],
  },
  {
    id: 'op-reveal', name: 'Show Open', category: 'opener', live: 'auto', coverage: 'full', hold: 3, tags: ['open', 'intro', 'identity'],
    fields: [F('show', 'Show name', 'Night Signal'), F('tagline', 'Tagline', 'Stories after dark')],
    build: pk => [
      { id: lid('bg'), name: 'Field', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, gradient: { type: 'radial', stops: [[0, 'paper'], [1, 'shade']] }, in: mv('fade', .6, 0, 'inOut'), out: mv('fade', D(pk, .8)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .3),
      ...[0, 1, 2].map(i => ({ id: lid('ring'), name: `Ring ${i + 1}`, kind: 'ellipse' as const, x: 960 - (300 + i * 180), y: 540 - (300 + i * 180), w: (300 + i * 180) * 2, h: (300 + i * 180) * 2, stroke: (i === 1 ? 'secondary' : 'accent') as CgColor, strokeWidth: 3 - i * .7, opacity: .8 - i * .2, in: mv('pop', 1.2, .15 * i, 'expo'), out: mv('zoom', .6, 0, 'in', 1.6), loop: { type: 'rotate' as const, period: 40 + i * 12, amount: i % 2 ? -360 : 360 }, dash: [60 - i * 15, 22] })),
      text(pk, 'Show', { x: 160, y: 400, w: 1600, h: 220 }, '{show}', 'hero', onColor(pk, pk.palette.paper), .8, { size: 180 }),
      text(pk, 'Tagline', { x: 360, y: 640, w: 1200, h: 70 }, '{tagline}', 'sub', 'accent', 1.4, { align: 'center', upper: true, tracking: .3, size: 34 }),
    ],
  },
  {
    id: 'ec-outro', name: 'End Card', category: 'end-card', live: 'hold', coverage: 'full', hold: 10, tags: ['outro', 'subscribe', 'end screen'],
    fields: [F('thanks', 'Headline', 'Thanks for watching'), F('handle', 'Handle', '@plajahlive'), F('next', 'Up next', 'Up next'), F('watch', 'Watch more', 'More episodes')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, gradient: { type: 'linear', angle: 135, stops: [[0, 'paper'], [1, 'shade']] }, in: mv('fade', D(pk), 0, 'inOut'), out: mv('fade', D(pk, .7)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .1),
      text(pk, 'Headline', { x: 160, y: 130, w: 1600, h: 140 }, '{thanks}', 'big', onColor(pk, pk.palette.paper), D(pk, .5), { align: 'center', maxLines: 1 }),
      ...[0, 1].map(i => ({ id: lid('slot'), name: `Video slot ${i + 1}`, kind: 'rect' as const, x: 260 + i * 740, y: 360, w: 660, h: 372, radius: pk.shape.radius, stroke: 'accent' as CgColor, strokeWidth: 4, fill: 'rgba(0,0,0,.25)', in: mv('pop', D(pk, .9), D(pk, .8) + i * .15, 'back'), out: mv('fade', .3) })),
      text(pk, 'Up next', { x: 260, y: 750, w: 660, h: 50 }, '{next}', 'mono', 'accent', D(pk, 1.1), { align: 'center' }),
      text(pk, 'Watch more', { x: 1000, y: 750, w: 660, h: 50 }, '{watch}', 'mono', 'accent', D(pk, 1.2), { align: 'center' }),
      ...plate(pk, 'Handle pill', { x: 660, y: 860, w: 600, h: 90 }, D(pk, 1.3), { radius: 45, noSkew: true, fill: 'accent' }),
      text(pk, 'Handle', { x: 660, y: 860, w: 600, h: 90 }, '{handle}', 'title', onColor(pk, pk.palette.accent), D(pk, 1.5), { align: 'center', size: 44, upper: false }),
    ],
  },

  // ─── PERSISTENT: BUGS, TICKERS, CLOCKS, SCORES ───
  {
    id: 'bug-corner', name: 'Corner Bug', category: 'bug', live: 'hold', coverage: 'region', hold: 30, tags: ['bug', 'logo', 'watermark', 'persistent'],
    fields: [F('mark', 'Mark', 'PLAJAH'), F('sub', 'Sub', 'LIVE')],
    build: pk => [
      ...plate(pk, 'Bug plate', { x: 1560, y: 70, w: 270, h: 76 }, 0, { noSkew: false, loop: true }),
      text(pk, 'Mark', { x: 1576, y: 72, w: 180, h: 72 }, '{mark}', 'title', onColor(pk, pk.palette.paper), D(pk, .3), { size: 36, maxLines: 1 }),
      { id: lid('sb'), name: 'Sub chip', kind: 'rect', x: 1756, y: 90, w: 60, h: 36, radius: Math.min(pk.shape.radius, 10), fill: 'accent', in: mv('pop', .35, D(pk, .5), 'back'), out: mv('fade', .3) },
      text(pk, 'Sub', { x: 1756, y: 90, w: 60, h: 36 }, '{sub}', 'tag', onColor(pk, pk.palette.accent), D(pk, .6), { size: 16, tracking: .06 }),
    ],
  },
  {
    id: 'bug-live', name: 'LIVE Flag', category: 'bug', live: 'hold', coverage: 'region', hold: 30, tags: ['live', 'flag', 'on air', 'persistent'],
    fields: [F('label', 'Label', 'LIVE'), F('where', 'Location', 'Atlanta')],
    build: pk => [
      { id: lid('pill'), name: 'LIVE pill', kind: 'rect', x: 96, y: 70, w: 150, h: 56, radius: Math.min(28, pk.shape.radius + 6), skew: pk.shape.skew, fill: 'accent', in: mv('wipeR', D(pk, .6), 0, pk.motion.ease), out: mv('wipeL', .4) },
      { id: lid('dot'), name: 'Tally dot', kind: 'ellipse', x: 116, y: 89, w: 18, h: 18, fill: onColor(pk, pk.palette.accent), in: mv('pop', .3, D(pk, .4), 'back'), out: mv('fade', .2), loop: { type: 'blink', period: 1.4 } },
      text(pk, 'Label', { x: 140, y: 70, w: 100, h: 56 }, '{label}', 'tag', onColor(pk, pk.palette.accent), D(pk, .4), { size: 26, tracking: .14 }),
      ...plate(pk, 'Location', { x: 246, y: 70, w: 260, h: 56 }, D(pk, .3), { radius: Math.min(pk.shape.radius, 10), loop: false }),
      text(pk, 'Location', { x: 262, y: 70, w: 232, h: 56 }, '{where}', 'sub', onColor(pk, pk.palette.paper), D(pk, .55), { size: 24, upper: true, tracking: .1 }),
    ],
  },
  {
    id: 'tk-crawl', name: 'News Crawl', category: 'ticker', live: 'hold', coverage: 'region', hold: 30, tags: ['ticker', 'crawl', 'scroll', 'persistent'],
    fields: [F('label', 'Label', 'Headlines'), F('items', 'Items (| separated)', 'Markets close higher | New stadium opens Friday | Rain expected this weekend | Library extends hours', 'list')],
    build: pk => [
      { id: lid('bed'), name: 'Crawl bed', kind: 'rect', x: 0, y: 958, w: 1920, h: 62, fill: 'paper', in: mv('slideD', D(pk, .7), 0, pk.motion.ease, 1.4), out: mv('slideD', .4, 0, 'in', 1.4) },
      { id: lid('lab'), name: 'Label block', kind: 'rect', x: 0, y: 958, w: 330, h: 62, fill: 'accent', skew: pk.shape.skew ? pk.shape.skew / 2 : 0, in: mv('wipeR', D(pk, .6), D(pk, .4)), out: mv('fade', .3) },
      text(pk, 'Label', { x: 100, y: 958, w: 220, h: 62 }, '{label}', 'tag', onColor(pk, pk.palette.accent), D(pk, .6), { size: 24 }),
      { id: lid('tk'), name: 'Crawl', kind: 'ticker', x: 350, y: 958, w: 1570, h: 62, ticker: { field: 'items', speed: 120, gap: 32 }, style: style(pk, 'sub', onColor(pk, pk.palette.paper), { size: 30 }), in: mv('fade', .3, D(pk, .8)), out: mv('fade', .3) },
    ],
  },
  {
    id: 'sb-strip', name: 'Score Strip', category: 'scoreboard', live: 'hold', coverage: 'region', hold: 30, tags: ['score', 'sports', 'match', 'persistent'],
    fields: [F('home', 'Home', 'ATL'), F('hs', 'Home score', '2'), F('away', 'Away', 'NYC'), F('as', 'Away score', '1'), F('period', 'Period', '2ND'), F('clock', 'Clock start (mm:ss)', '45:00', 'duration')],
    build: pk => [
      ...plate(pk, 'Strip', { x: 96, y: 60, w: 560, h: 64 }, 0, { loop: true }),
      text(pk, 'Home', { x: 110, y: 60, w: 110, h: 64 }, '{home}', 'title', onColor(pk, pk.palette.paper), D(pk, .3), { size: 34, align: 'center' }),
      { id: lid('hs'), name: 'Home score box', kind: 'rect', x: 222, y: 64, w: 64, h: 56, fill: 'accent', skew: pk.shape.skew / 2, in: mv('pop', .3, D(pk, .4), 'back'), out: mv('fade', .2) },
      text(pk, 'Home score', { x: 222, y: 64, w: 64, h: 56 }, '{hs}', 'title', onColor(pk, pk.palette.accent), D(pk, .5), { size: 38, align: 'center', anim: undefined }),
      text(pk, 'Away', { x: 296, y: 60, w: 110, h: 64 }, '{away}', 'title', onColor(pk, pk.palette.paper), D(pk, .35), { size: 34, align: 'center' }),
      { id: lid('as'), name: 'Away score box', kind: 'rect', x: 408, y: 64, w: 64, h: 56, fill: 'accent', skew: pk.shape.skew / 2, in: mv('pop', .3, D(pk, .45), 'back'), out: mv('fade', .2) },
      text(pk, 'Away score', { x: 408, y: 64, w: 64, h: 56 }, '{as}', 'title', onColor(pk, pk.palette.accent), D(pk, .55), { size: 38, align: 'center', anim: undefined }),
      text(pk, 'Period', { x: 482, y: 60, w: 70, h: 64 }, '{period}', 'tag', 'secondary', D(pk, .6), { size: 20 }),
      { id: lid('clk'), name: 'Clock', kind: 'clock', x: 552, y: 60, w: 100, h: 64, clock: { mode: 'countup', field: 'clock' }, style: style(pk, 'mono', onColor(pk, pk.palette.paper), { size: 28, align: 'center' }), in: mv('fade', .3, D(pk, .6)), out: mv('fade', .2) },
    ],
  },
  {
    id: 'ck-corner', name: 'Time of Day', category: 'clock', live: 'hold', coverage: 'region', hold: 30, tags: ['clock', 'time', 'persistent'],
    fields: [F('zone', 'Label', 'ATL')],
    build: pk => [
      ...plate(pk, 'Clock plate', { x: 1600, y: 960, w: 224, h: 60 }, 0, { loop: false }),
      { id: lid('zl'), name: 'Zone chip', kind: 'rect', x: 1600, y: 960, w: 70, h: 60, fill: 'accent', in: mv('wipeR', .3, D(pk, .3)), out: mv('fade', .2) },
      text(pk, 'Zone', { x: 1600, y: 960, w: 70, h: 60 }, '{zone}', 'tag', onColor(pk, pk.palette.accent), D(pk, .4), { size: 18 }),
      { id: lid('clk'), name: 'Clock', kind: 'clock', x: 1676, y: 960, w: 140, h: 60, clock: { mode: 'time' }, style: style(pk, 'mono', onColor(pk, pk.palette.paper), { size: 28, align: 'center', upper: true }), in: mv('fade', .3, D(pk, .4)), out: mv('fade', .2) },
    ],
  },
  {
    id: 'cd-starting', name: 'Starting Soon', category: 'countdown', live: 'hold', coverage: 'full', hold: 300, tags: ['countdown', 'pre-show', 'starting soon', 'break'],
    fields: [F('title', 'Title', 'Starting soon'), F('time', 'Countdown (mm:ss)', '05:00', 'duration'), F('note', 'Note', 'Grab a seat — we go live shortly')],
    build: pk => [
      { id: lid('bg'), name: 'Background', kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, gradient: { type: 'radial', stops: [[0, 'paper'], [1, 'shade']] }, in: mv('fade', D(pk), 0, 'inOut'), out: mv('fade', D(pk, .7)) },
      ...ornament(pk, { x: 0, y: 0, w: 1920, h: 1080 }, .2),
      { id: lid('pt'), name: 'Particles', kind: 'particles', x: 0, y: 0, w: 1920, h: 1080, fill: 'accent', opacity: .35, deco: { count: 60, size: 2, seed: 7 }, in: mv('fade', 1.2, .2), out: mv('fade', .5), loop: { type: 'drift', period: 12, amount: 0 } },
      text(pk, 'Title', { x: 160, y: 250, w: 1600, h: 150 }, '{title}', 'big', onColor(pk, pk.palette.paper), D(pk, .5), { align: 'center', maxLines: 1 }),
      { id: lid('cd'), name: 'Countdown', kind: 'clock', x: 460, y: 430, w: 1000, h: 260, clock: { mode: 'countdown', field: 'time' }, style: style(pk, 'hero', 'accent', { size: 240, font: pk.fonts.utility }), in: mv('pop', D(pk, .8), D(pk, .7), 'back'), out: mv('fade', .3) },
      text(pk, 'Note', { x: 360, y: 760, w: 1200, h: 60 }, '{note}', 'sub', 'secondary', D(pk, 1.1), { align: 'center', size: 34 }),
    ],
  },
  {
    id: 'so-comment', name: 'Chat Comment', category: 'social', live: 'hold', coverage: 'region', hold: 8, tags: ['chat', 'comment', 'audience', 'q&a'],
    fields: [F('avatar', 'Avatar URL', '', 'image'), F('user', 'User', 'maya_draws'), F('comment', 'Comment', 'This is the best explanation of color grading I have ever heard!', 'multiline')],
    build: pk => {
      const card = { x: 120, y: 700, w: 760, h: 200 };
      return [
        ...plate(pk, 'Card', card, 0, { noSkew: true }),
        { id: lid('av'), name: 'Avatar', kind: 'image', x: card.x + 24, y: card.y + 24, w: 72, h: 72, src: 'avatar', radius: 36, in: mv('pop', .4, D(pk, .3), 'back'), out: mv('fade', .2) },
        text(pk, 'User', { x: card.x + 112, y: card.y + 26, w: 600, h: 40 }, '{user}', 'mono', 'accent', D(pk, .4), { upper: false, size: 28 }),
        text(pk, 'Comment', { x: card.x + 112, y: card.y + 66, w: 620, h: 120 }, '{comment}', 'body', onColor(pk, pk.palette.paper), D(pk, .6), { size: 32, maxLines: 3, valign: 'top' }),
      ];
    },
  },
  {
    id: 'qt-lower', name: 'Quote Lower', category: 'quote', live: 'hold', coverage: 'region', hold: 8, tags: ['quote', 'verse', 'scripture', 'lower'],
    fields: [F('quote', 'Quote', 'Let all that you do be done in love.', 'multiline'), F('who', 'Reference', '1 Corinthians 16:14')],
    build: pk => {
      const b = { x: 200, y: 760, w: 1520, h: 200 };
      return [
        ...plate(pk, 'Plate', b, 0, { noSkew: true }),
        text(pk, 'Mark', { x: b.x + 20, y: b.y - 20, w: 120, h: 140 }, '“', 'hero', 'accent', D(pk, .3), { size: 180, align: 'left', upper: false }),
        text(pk, 'Quote', { x: b.x + 150, y: b.y + 20, w: b.w - 200, h: 110 }, '{quote}', 'body', onColor(pk, pk.palette.paper), D(pk, .5), { font: pk.fonts.display, size: 48, maxLines: 2 }),
        text(pk, 'Reference', { x: b.x + 150, y: b.y + 140, w: b.w - 200, h: 40 }, '{who}', 'mono', 'accent', D(pk, .8)),
      ];
    },
  },
  {
    id: 'co-pointer', name: 'Pointer Callout', category: 'callout', live: 'hold', coverage: 'region', hold: 5, tags: ['callout', 'label', 'annotation', 'pointer'],
    fields: [F('label', 'Label', 'New skyline tower'), F('detail', 'Detail', '412 m · opens 2027')],
    build: pk => [
      { id: lid('dot'), name: 'Target', kind: 'ellipse', x: 1180, y: 380, w: 28, h: 28, fill: 'accent', in: mv('pop', .35, 0, 'back'), out: mv('pop', .3), loop: { type: 'pulse', period: 1.6, amount: .25 } },
      { id: lid('rng'), name: 'Target ring', kind: 'ellipse', x: 1166, y: 366, w: 56, h: 56, stroke: 'accent', strokeWidth: 2, in: mv('pop', .4, .1, 'back'), out: mv('fade', .2), loop: { type: 'breathe', period: 1.6, amount: .6 } },
      { id: lid('ln'), name: 'Leader', kind: 'line', x: 1205, y: 390, w: 170, h: -120, stroke: 'accent', strokeWidth: 3, in: mv('wipeR', .35, .2), out: mv('fade', .2) },
      ...plate(pk, 'Label plate', { x: 1375, y: 220, w: 420, h: 110 }, .45, { loop: false }),
      text(pk, 'Label', { x: 1395, y: 226, w: 380, h: 56 }, '{label}', 'title', onColor(pk, pk.palette.paper), .6, { size: 36 }),
      text(pk, 'Detail', { x: 1395, y: 280, w: 380, h: 40 }, '{detail}', 'mono', 'accent', .75, { size: 22 }),
    ],
  },
  {
    id: 'lo-dateline', name: 'Dateline Locator', category: 'locator', live: 'hold', coverage: 'region', hold: 6, tags: ['location', 'dateline', 'weather'],
    fields: [F('place', 'Place', 'Nairobi, Kenya'), F('note', 'Note', '24°C · Clear')],
    build: pk => [
      ...plate(pk, 'Locator', { x: 96, y: 150, w: 440, h: 100 }, 0, { loop: false }),
      { id: lid('pin'), name: 'Pin', kind: 'path', x: 112, y: 168, w: 44, h: 60, path: 'M50 0 C22 0 0 22 0 50 C0 85 50 100 50 100 C50 100 100 85 100 50 C100 22 78 0 50 0 Z M50 32 A18 18 0 1 0 50.1 32 Z', fill: 'accent', in: mv('drop', .45, D(pk, .3), 'bounce'), out: mv('fade', .2) },
      text(pk, 'Place', { x: 170, y: 152, w: 350, h: 56 }, '{place}', 'title', onColor(pk, pk.palette.paper), D(pk, .45), { size: 36 }),
      { id: lid('dt'), name: 'Date', kind: 'clock', x: 170, y: 206, w: 200, h: 36, clock: { mode: 'date' }, style: style(pk, 'mono', 'accent', { size: 20 }), in: mv('fade', .3, D(pk, .6)), out: mv('fade', .2) },
      text(pk, 'Note', { x: 340, y: 206, w: 180, h: 36 }, '{note}', 'mono', 'secondary', D(pk, .7), { size: 20, align: 'right' }),
    ],
  },
  {
    id: 'da-poll', name: 'Live Poll', category: 'data', live: 'hold', coverage: 'region', hold: 10, tags: ['poll', 'vote', 'audience', 'results'],
    fields: [F('q', 'Question', 'Which song should close tonight?'), F('a', 'Option A', 'Way Maker'), F('ap', 'A %', '64'), F('b', 'Option B', 'Goodness of God'), F('bp', 'B %', '36')],
    build: pk => {
      const b = { x: 1200, y: 560, w: 620, h: 360 };
      return [
        ...plate(pk, 'Card', b, 0, { noSkew: true }),
        text(pk, 'Question', { x: b.x + 30, y: b.y + 20, w: b.w - 60, h: 100 }, '{q}', 'title', onColor(pk, pk.palette.paper), D(pk, .4), { size: 38, upper: false, maxLines: 2 }),
        ...(['a', 'b'] as const).flatMap((k, i) => {
          const y = b.y + 140 + i * 105;
          return [
            text(pk, `Option ${k.toUpperCase()}`, { x: b.x + 30, y, w: 420, h: 40 }, `{${k}}`, 'sub', onColor(pk, pk.palette.paper), D(pk, .6) + i * .1, { size: 26 }),
            text(pk, `Percent ${k.toUpperCase()}`, { x: b.x + 450, y, w: 140, h: 40 }, `{${k}p}%`, 'mono', 'accent', D(pk, .7) + i * .1, { align: 'right', size: 28 }),
            { id: lid('trk'), name: `Track ${k.toUpperCase()}`, kind: 'rect' as const, x: b.x + 30, y: y + 46, w: b.w - 60, h: 18, radius: 9, fill: 'rgba(127,127,127,.25)', in: mv('fade', .3, D(pk, .6)), out: mv('fade', .2) },
            { id: lid('bar'), name: `Bar ${k.toUpperCase()}`, kind: 'rect' as const, x: b.x + 30, y: y + 46, w: (b.w - 60) * (i === 0 ? .64 : .36), h: 18, radius: 9, fill: (i === 0 ? 'accent' : 'secondary') as CgColor, in: mv('growX', 1, D(pk, .8) + i * .15, 'quart'), out: mv('fade', .2) },
          ];
        }),
      ];
    },
  },
  {
    id: 'fr-pip', name: 'Guest Frame', category: 'frame', live: 'hold', coverage: 'region', hold: 30, tags: ['pip', 'frame', 'remote guest', 'box'],
    fields: [F('name', 'Name tab', 'Remote guest')],
    build: pk => [
      { id: lid('fr'), name: 'Frame', kind: 'rect', x: 1100, y: 160, w: 720, h: 405, radius: pk.shape.radius, stroke: 'accent', strokeWidth: 6, in: mv('pop', D(pk, .8), 0, 'back'), out: mv('pop', .35), shadow: { color: 'rgba(0,0,0,.4)', blur: 30, y: 10 } },
      ...plate(pk, 'Name tab', { x: 1100, y: 565, w: 360, h: 60 }, D(pk, .4), { noSkew: false, loop: false }),
      text(pk, 'Name', { x: 1116, y: 565, w: 330, h: 60 }, '{name}', 'sub', onColor(pk, pk.palette.paper), D(pk, .6), { size: 26, upper: true, tracking: .08 }),
    ],
  },
];

/** Build the graphic for (package, archetype). Deterministic ids: `${pkg}.${archetype}`. */
export function buildGraphic(pk: CgPackage, a: CgArchetype): CgGraphic {
  seq = 0;
  const layers = a.build(pk);
  // stable layer ids per graphic (so ref overrides survive library updates)
  const used = new Set<string>();
  for (const l of layers) {
    let base = l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer';
    let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    const old = l.id; l.id = id;
    for (const o of layers) if (o.matte === old) o.matte = id;
  }
  const g: CgGraphic = {
    id: `${pk.id}.${a.id}`,
    name: `${pk.name} · ${a.name}`,
    category: a.category,
    packageId: pk.id,
    archetype: a.id,
    tagline: pk.tagline,
    tags: [...a.tags, pk.group.toLowerCase(), pk.id],
    palette: { ...pk.palette },
    fonts: { ...pk.fonts },
    fields: a.fields.map(f => ({ ...f })),
    layers,
    timing: { in: 0, out: 0, hold: a.hold },
    live: a.live,
    coverage: a.coverage,
    credit: { council: 'roster', member: pk.hand },
    version: 1,
  };
  const t = measureTiming(g);
  g.timing.in = t.in; g.timing.out = Math.max(t.out, .3);
  if (a.live === 'transition') {
    g.timing.cutPoint = a.cut ? a.cut(pk) : t.in;
    g.timing.in = g.timing.cutPoint;
  }
  return g;
}
