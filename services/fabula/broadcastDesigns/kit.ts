// broadcastDesigns/kit — what a broadcast identity is drawn with.
//
// Every identity in this directory is authored by hand against docs/tela/TEMPLATE_DESIGN_BRIEF.md:
// a specific grid, a deliberate type pairing from telaFonts, one strong idea, and a motif that
// belongs to the movement. Nothing here picks geometry from an index or a hash. The kit only
// makes the authoring terse: real fonts by FontKey, ornament paths from services/tela/ornaments
// scaled into a box, seeded fields, a comp-style image well, and SMIL motion helpers.
//
// Output is SVG markup. The library shows it inline (so Google Fonts apply) and the export path
// embeds the faces as @font-face data URIs, because an SVG inside an <img> cannot load a web font
// — which is the reason the previous factory was stuck with Arial, Georgia, Courier and Impact.
import { FONTS, fontCss, type FontKey } from '../../tela/telaFonts';
import { rng } from '../../tela/ornaments';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const n = (v: number) => Math.round(v * 100) / 100;

/* ─── Colour ─────────────────────────────────────────────────────────────────────────────── */
export const relLum = (hex: string) => {
  const v = hex.replace('#', '');
  const ch = (i: number) => { const c = parseInt(v.slice(i, i + 2), 16) / 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  return .2126 * ch(0) + .7152 * ch(2) + .0722 * ch(4);
};
export const contrast = (a: string, b: string) => { const l1 = relLum(a), l2 = relLum(b); const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]; return (hi + .05) / (lo + .05); };
export const isDark = (hex: string) => relLum(hex) < .35;
/** The most readable ink for a ground, preferring the identity's own palette. */
export function inkOn(ground: string, palette: readonly string[], min = 4) {
  const best = [...palette].sort((x, y) => contrast(y, ground) - contrast(x, ground))[0];
  if (contrast(best, ground) >= min) return best;
  return contrast('#FFFFFF', ground) >= contrast('#111111', ground) ? '#FFFFFF' : '#111111';
}
export function mix(hex: string, amount: number) {
  const v = hex.replace('#', ''); const c = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
  const t = amount > 0 ? 255 : 0, k = Math.abs(amount);
  return '#' + c.map(x => Math.round(x + (t - x) * k).toString(16).padStart(2, '0')).join('');
}
export const alpha = (hex: string, a: number) => { const v = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)); return `rgba(${r},${g},${b},${a})`; };

/* ─── Type ───────────────────────────────────────────────────────────────────────────────── */
export interface TextOpts {
  font: FontKey; size: number; weight?: number; fill: string; anchor?: 'start' | 'middle' | 'end';
  tracking?: number; italic?: boolean; upper?: boolean; lower?: boolean; rotate?: number; opacity?: number;
  /** Shrink the size so the string fits this width (approximate metrics; broadcast titles are short). */
  fitW?: number; lines?: string[]; leading?: number; baseline?: 'auto' | 'middle' | 'hanging';
  stroke?: string; strokeWidth?: number; blend?: string; id?: string; dx?: number;
}
const WIDTH_RATIO: Partial<Record<FontKey, number>> = {
  anton: .46, bebas: .44, oswald: .5, leagueGothic: .36, sixCaps: .26, staatliches: .44, bigShoulders: .46, archivoBlack: .76, archivo: .6,
  unbounded: .82, delaGothic: .8, rubikMono: .84, bungee: .76, monoton: .7, limelight: .62, righteous: .64, shrikhand: .62, bangers: .48,
  playfair: .55, fraunces: .55, bodoni: .5, cormorant: .48, ebGaramond: .5, libreBaskerville: .58, cinzel: .62, marcellus: .55, abril: .58, gloock: .56,
  spaceMono: .6, jetbrains: .6, ibmPlexMono: .6, dmMono: .6, courierPrime: .6, specialElite: .6, vt323: .45, pressStart: 1,
  permanentMarker: .58, kalam: .5, caveat: .42, patrickHand: .48, michroma: .88, audiowide: .74, orbitron: .78, tomorrow: .66, chakra: .64,
  inter: .56, manrope: .58, karla: .54, dmSans: .56, workSans: .57, syne: .74, epilogue: .58, bricolage: .57, outfit: .55, sora: .64, exo2: .6,
  shippori: .9, zenKaku: .9, notoSansJp: .9, notoSerifJp: .9, amiri: .5, cairo: .52, reemKufi: .55, martel: .52, tiro: .52, lexend: .56, raleway: .55, italiana: .5, forum: .55, tenor: .55, cardo: .5, crimson: .5, lora: .53, alegreya: .5, bitter: .55, zilla: .53, robotoSlab: .56, instrumentSerif: .46, nunito: .53, fredoka: .56, baloo: .54, federo: .52, poiret: .5,
};
export function fitSize(str: string, size: number, maxW: number, font: FontKey, tracking = 0) {
  const ratio = ((WIDTH_RATIO[font] ?? .58) + tracking) * 1.12;
  const w = str.length * size * ratio;
  return w <= maxW ? size : Math.max(12, Math.floor(size * maxW / w));
}
export function T(x: number, y: number, str: string, o: TextOpts) {
  const spec = FONTS[o.font];
  const s = o.upper ? str.toUpperCase() : o.lower ? str.toLowerCase() : str;
  const size = o.fitW ? fitSize(s, o.size, o.fitW, o.font, o.tracking ?? 0) : o.size;
  const weight = o.weight ?? (spec.class === 'display' || spec.class === 'blackletter' ? 400 : 700);
  const attrs = [
    `x="${n(x)}" y="${n(y)}"`, `font-family='${fontCss(o.font)}'`, `font-size="${n(size)}"`, `font-weight="${weight}"`, `fill="${o.fill}"`,
    o.anchor ? `text-anchor="${o.anchor}"` : '', o.tracking ? `letter-spacing="${n(size * o.tracking)}"` : '', o.italic ? 'font-style="italic"' : '',
    o.opacity !== undefined ? `opacity="${o.opacity}"` : '', o.rotate ? `transform="rotate(${o.rotate} ${n(x)} ${n(y)})"` : '',
    o.baseline ? `dominant-baseline="${o.baseline}"` : '', o.stroke ? `stroke="${o.stroke}" stroke-width="${o.strokeWidth ?? 1}" paint-order="stroke"` : '',
    o.blend ? `style="mix-blend-mode:${o.blend}"` : '', o.id ? `id="${o.id}"` : '',
  ].filter(Boolean).join(' ');
  if (o.lines) {
    const lh = size * (o.leading ?? 1.02);
    return `<text ${attrs}>${o.lines.map((l, i) => `<tspan x="${n(x)}" dy="${i ? n(lh) : 0}">${esc(o.upper ? l.toUpperCase() : l)}</tspan>`).join('')}</text>`;
  }
  return `<text ${attrs}>${esc(s)}</text>`;
}
/** Split a title into two balanced lines when it is long; keeps short names on one line. */
export function twoLines(str: string, minLen = 16): string[] {
  if (str.length < minLen || !/\s/.test(str)) return [str];
  const words = str.split(/\s+/); let best = [str], bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '); const d = Math.abs(a.length - b.length); if (d < bestDiff) { bestDiff = d; best = [a, b]; } }
  return best;
}

/* ─── Shapes ─────────────────────────────────────────────────────────────────────────────── */
export interface ShapeOpts { stroke?: string; sw?: number; opacity?: number; rotate?: number; rx?: number; dash?: string; blend?: string; filter?: string; id?: string; clip?: string; transform?: string }
const common = (o: ShapeOpts, cx?: number, cy?: number) => [
  o.stroke ? `stroke="${o.stroke}" stroke-width="${o.sw ?? 2}"` : '', o.opacity !== undefined ? `opacity="${o.opacity}"` : '',
  o.dash ? `stroke-dasharray="${o.dash}"` : '', o.blend ? `style="mix-blend-mode:${o.blend}"` : '', o.filter ? `filter="url(#${o.filter})"` : '',
  o.id ? `id="${o.id}"` : '', o.clip ? `clip-path="url(#${o.clip})"` : '',
  (o.rotate || o.transform) ? `transform="${o.transform ?? ''}${o.rotate ? ` rotate(${o.rotate} ${n(cx ?? 0)} ${n(cy ?? 0)})` : ''}"` : '',
].filter(Boolean).join(' ');
export const R = (x: number, y: number, w: number, h: number, fill: string, o: ShapeOpts = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${o.rx ? ` rx="${n(o.rx)}"` : ''} ${common(o, x + w / 2, y + h / 2)}/>`;
export const C = (cx: number, cy: number, r: number, fill: string, o: ShapeOpts = {}) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" ${common(o, cx, cy)}/>`;
export const E = (cx: number, cy: number, rx: number, ry: number, fill: string, o: ShapeOpts = {}) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${common(o, cx, cy)}/>`;
export const L = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 2, o: ShapeOpts = {}) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${common({ ...o, stroke, sw }, (x1 + x2) / 2, (y1 + y2) / 2)}/>`;
export const PolyG = (pts: Array<[number, number]>, fill: string, o: ShapeOpts = {}) => `<polygon points="${pts.map(p => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="${fill}" ${common(o)}/>`;
export const D = (d: string, fill: string, o: ShapeOpts = {}) => `<path d="${d}" fill="${fill}" ${common(o)}/>`;
/** An ornament path authored in a 0..100 box, scaled into x/y/w/h. Strokes stay one width. */
export function P(x: number, y: number, w: number, h: number, d: string, fill: string, o: ShapeOpts = {}) {
  const rot = o.rotate ? ` rotate(${o.rotate} 50 50)` : '';
  return `<path d="${d}" fill="${fill}" transform="translate(${n(x)} ${n(y)}) scale(${n(w / 100)} ${n(h / 100)})${rot}" vector-effect="non-scaling-stroke" ${common({ ...o, rotate: 0 })}/>`;
}

/* ─── Fields (seeded, deterministic) ─────────────────────────────────────────────────────── */
export interface FieldOpts { seed?: number; opacity?: number; r?: number; jitter?: number; grade?: 'x' | 'y' | 'none'; stagger?: boolean; angle?: number }
export function dots(x: number, y: number, w: number, h: number, spacing: number, fill: string, o: FieldOpts = {}) {
  const r = rng(o.seed ?? 1); const out: string[] = []; const rad = o.r ?? spacing * .16;
  for (let j = 0, row = 0; j <= h; j += spacing, row++) for (let i = (o.stagger && row % 2 ? spacing / 2 : 0); i <= w; i += spacing) {
    const g = o.grade === 'x' ? i / w : o.grade === 'y' ? j / h : 1;
    const jx = o.jitter ? (r() - .5) * o.jitter : 0, jy = o.jitter ? (r() - .5) * o.jitter : 0;
    out.push(`<circle cx="${n(x + i + jx)}" cy="${n(y + j + jy)}" r="${n(rad * (o.grade && o.grade !== 'none' ? .25 + g : 1))}"/>`);
  }
  return `<g fill="${fill}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}>${out.join('')}</g>`;
}
export function stripes(x: number, y: number, w: number, h: number, count: number, thick: number, fill: string, o: FieldOpts & { vertical?: boolean; alternate?: number[] } = {}) {
  const out: string[] = []; const step = (o.vertical ? w : h) / count;
  for (let i = 0; i < count; i++) { const t = o.alternate ? o.alternate[i % o.alternate.length] : thick; out.push(o.vertical ? `<rect x="${n(x + i * step)}" y="${n(y)}" width="${n(t)}" height="${n(h)}"/>` : `<rect x="${n(x)}" y="${n(y + i * step)}" width="${n(w)}" height="${n(t)}"/>`); }
  return `<g fill="${fill}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}${o.angle ? ` transform="rotate(${o.angle} ${n(x + w / 2)} ${n(y + h / 2)})"` : ''}>${out.join('')}</g>`;
}
export function radial(cx: number, cy: number, r0: number, r1: number, count: number, stroke: string, sw = 2, o: FieldOpts & { start?: number; sweep?: number } = {}) {
  const out: string[] = []; const start = o.start ?? 0, sweep = o.sweep ?? 360;
  for (let i = 0; i < count; i++) { const a = (start + i * sweep / count) * Math.PI / 180; out.push(`<line x1="${n(cx + r0 * Math.cos(a))}" y1="${n(cy + r0 * Math.sin(a))}" x2="${n(cx + r1 * Math.cos(a))}" y2="${n(cy + r1 * Math.sin(a))}"/>`); }
  return `<g stroke="${stroke}" stroke-width="${sw}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}>${out.join('')}</g>`;
}
export function rings(cx: number, cy: number, radii: number[], stroke: string, sw = 2, o: FieldOpts & { dash?: string } = {}) {
  return `<g fill="none" stroke="${stroke}" stroke-width="${sw}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}>${radii.map(r => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`).join('')}</g>`;
}
export function checker(x: number, y: number, w: number, h: number, cell: number, fill: string, o: FieldOpts = {}) {
  const out: string[] = [];
  for (let j = 0; j * cell < h; j++) for (let i = 0; i * cell < w; i++) if ((i + j) % 2 === 0) out.push(`<rect x="${n(x + i * cell)}" y="${n(y + j * cell)}" width="${n(cell)}" height="${n(cell)}"/>`);
  return `<g fill="${fill}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}>${out.join('')}</g>`;
}
/** Eight-point-star tessellation: the seed of girih and zellige. Stars in one colour, crosses in another. */
export function starTess(x: number, y: number, w: number, h: number, cell: number, star: string, cross?: string, o: FieldOpts = {}) {
  const out: string[] = []; const s = cell / 2;
  const starD = (cx: number, cy: number) => { const pts: string[] = []; for (let k = 0; k < 16; k++) { const r = k % 2 ? s * .42 : s; const a = (k * 22.5 - 90) * Math.PI / 180; pts.push(`${n(cx + r * Math.cos(a))},${n(cy + r * Math.sin(a))}`); } return pts.join(' '); };
  for (let j = 0; j * cell <= h; j++) for (let i = 0; i * cell <= w; i++) {
    out.push(`<polygon points="${starD(x + i * cell, y + j * cell)}" fill="${star}"/>`);
    if (cross) out.push(`<polygon points="${starD(x + i * cell + s, y + j * cell + s)}" fill="${cross}" transform="rotate(22.5 ${n(x + i * cell + s)} ${n(y + j * cell + s)}) scale(1)" opacity=".6"/>`);
  }
  return `<g${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}>${out.join('')}</g>`;
}
export function specks(x: number, y: number, w: number, h: number, count: number, fill: string, seed = 4, opacity = .5) {
  const r = rng(seed); const out: string[] = [];
  for (let i = 0; i < count; i++) { const s = .6 + r() * 2.6; out.push(`<rect x="${n(x + r() * w)}" y="${n(y + r() * h)}" width="${n(s)}" height="${n(s * (0.5 + r()))}" transform="rotate(${n(r() * 90)})"/>`); }
  return `<g fill="${fill}" opacity="${opacity}">${out.join('')}</g>`;
}
export function mosaic(x: number, y: number, w: number, h: number, tile: number, colors: string[], seed = 1, o: FieldOpts = {}) {
  const r = rng(seed); const out: string[] = []; const gap = tile * .12;
  for (let j = 0; j * tile < h; j++) for (let i = 0; i * tile < w; i++) out.push(`<rect x="${n(x + i * tile + (r() - .5) * gap)}" y="${n(y + j * tile + (r() - .5) * gap)}" width="${n(tile - gap)}" height="${n(tile - gap)}" fill="${colors[Math.floor(r() * colors.length)]}" transform="rotate(${n((r() - .5) * 6)} ${n(x + i * tile + tile / 2)} ${n(y + j * tile + tile / 2)})"/>`);
  return `<g${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}>${out.join('')}</g>`;
}
export function perspectiveGrid(x: number, y: number, w: number, h: number, stroke: string, sw = 1.5, o: FieldOpts & { vanishY?: number; columns?: number; rows?: number } = {}) {
  const vx = x + w / 2, vy = o.vanishY ?? y - h * .6; const cols = o.columns ?? 12, rows = o.rows ?? 7; const out: string[] = [];
  for (let i = 0; i <= cols; i++) out.push(`<line x1="${n(x + i * w / cols)}" y1="${n(y + h)}" x2="${n(vx)}" y2="${n(vy)}"/>`);
  for (let j = 0; j < rows; j++) { const t = Math.pow(j / rows, 2.2); const yy = y + h - t * h; const half = (w / 2) * (yy - vy) / (y + h - vy); out.push(`<line x1="${n(vx - half)}" y1="${n(yy)}" x2="${n(vx + half)}" y2="${n(yy)}"/>`); }
  return `<g stroke="${stroke}" stroke-width="${sw}"${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''} clip-path="inset(0)">${out.join('')}</g>`;
}
/** Halftone: a graded dot screen inside a box, dark at one end. */
export function halftone(x: number, y: number, w: number, h: number, spacing: number, fill: string, o: FieldOpts & { direction?: 'x' | 'y' } = {}) {
  return dots(x, y, w, h, spacing, fill, { ...o, grade: o.direction ?? 'x', stagger: true, r: spacing * .48 });
}

/* ─── Image well ─────────────────────────────────────────────────────────────────────────── */
export interface SlotOpts { shape?: 'rect' | 'circle' | 'soft' | 'path'; d?: string; rx?: number; rotate?: number; tone?: 'light' | 'dark'; caption?: string; filter?: string; frame?: string; frameWidth?: number; silent?: boolean; opacity?: number; font?: FontKey }
/**
 * Where the user's footage goes. Renders the supplied image if there is one; otherwise a quiet
 * tonal well the way a comp does — never a grey box that says ADD IMAGE.
 */
export function slot(c: Ctx, x: number, y: number, w: number, h: number, o: SlotOpts = {}) {
  const id = c.uid('clip');
  const dark = o.tone ? o.tone === 'dark' : isDark(c.ground);
  const clip = o.shape === 'circle' ? `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}"/>`
    : o.shape === 'path' && o.d ? `<path d="${o.d}" transform="translate(${n(x)} ${n(y)}) scale(${n(w / 100)} ${n(h / 100)})"/>`
    : `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(o.rx ?? (o.shape === 'soft' ? Math.min(w, h) * .12 : 0))}"/>`;
  const rot = o.rotate ? ` transform="rotate(${o.rotate} ${n(x + w / 2)} ${n(y + h / 2)})"` : '';
  const filt = o.filter ? ` filter="url(#${o.filter})"` : '';
  let body: string;
  if (c.imageUrl) body = `<image href="${esc(c.imageUrl)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"${filt}/>`;
  else {
    const fill = dark ? 'rgba(255,255,255,.10)' : 'rgba(20,16,24,.09)'; const ink = dark ? 'rgba(255,255,255,.55)' : 'rgba(20,16,24,.5)';
    const hint = !o.silent && Math.min(w, h) > 90 ? T(x + w / 2, y + h / 2 + 4, o.caption ?? 'Drop footage', { font: o.font ?? 'inter', size: Math.max(13, Math.min(18, Math.min(w, h) * .05)), weight: 700, fill: ink, anchor: 'middle', tracking: .14, upper: true }) : '';
    // A soft tonal wash inside the well so it reads as a picture area, not a swatch.
    const wash = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${c.uid('wash')}-g)"/>`;
    body = `<g clip-path="url(#${id})"${filt}><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>${wash.replace(/url\(#[^)]+\)/, dark ? 'rgba(255,255,255,.05)' : 'rgba(20,16,24,.04)')}${hint}</g>`;
  }
  const frame = o.frame ? `<g clip-path="url(#${id})"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${o.frame}" stroke-width="${(o.frameWidth ?? 2) * 2}"/></g>` : '';
  return `<g${rot}${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}><defs><clipPath id="${id}">${clip}</clipPath></defs>${body}${frame}</g>`;
}

/* ─── Motion (SMIL) ──────────────────────────────────────────────────────────────────────── */
export type Ease = 'out' | 'inOut' | 'expo' | 'back' | 'linear' | 'in';
const SPLINE: Record<Ease, string> = { out: '.2 .8 .2 1', inOut: '.45 0 .2 1', expo: '.16 1 .3 1', back: '.34 1.56 .64 1', linear: '0 0 1 1', in: '.6 0 .9 .4' };
export interface MotionOpts { dur?: number; delay?: number; ease?: Ease; amount?: number; /** total loop length; when set the element also leaves near the end */ loop?: number; outDur?: number; origin?: [number, number] }
type MotionType = 'slideL' | 'slideR' | 'slideU' | 'slideD' | 'fade' | 'pop' | 'wipeR' | 'wipeL' | 'wipeU' | 'wipeD' | 'draw' | 'spin' | 'drop' | 'growX' | 'growY' | 'blur' | 'none';
const times = (dur: number, delay: number, loop?: number, outDur?: number) => {
  if (!loop) return { dur: `${n(dur)}s`, begin: `${n(delay)}s`, fill: 'freeze', repeat: '', keyTimes: '', values: (a: string, b: string) => `${a};${b}` , splines: (s: string) => s };
  const o = outDur ?? Math.min(dur, .6); const t1 = delay / loop, t2 = (delay + dur) / loop, t3 = 1 - o / loop;
  return { dur: `${n(loop)}s`, begin: '0s', fill: 'freeze', repeat: 'indefinite', keyTimes: `0;${n(t1)};${n(t2)};${n(t3)};1`, values: (a: string, b: string) => `${a};${a};${b};${b};${a}`, splines: (s: string) => `0 0 1 1;${s};0 0 1 1;${SPLINE.inOut}` };
};
/** Wrap markup in a group that animates in (and out again if `loop` is given). */
export function enter(inner: string, type: MotionType, o: MotionOpts = {}) {
  if (type === 'none') return inner;
  const dur = o.dur ?? .6, delay = o.delay ?? 0, ease = o.ease ?? 'out'; const t = times(dur, delay, o.loop, o.outDur);
  const amt = o.amount ?? 1; const [ox, oy] = o.origin ?? [0, 0];
  const spline = (s: string) => t.repeat ? `calcMode="spline" keyTimes="${t.keyTimes}" keySplines="${t.splines(s)}"` : `calcMode="spline" keySplines="${s}"`;
  const A = (attr: string, from: string, to: string, extra = '') => `<animate attributeName="${attr}" values="${t.values(from, to)}" dur="${t.dur}" begin="${t.begin}" fill="${t.fill}"${t.repeat ? ` repeatCount="${t.repeat}"` : ''} ${spline(SPLINE[ease])}${extra}/>`;
  const AT = (type: string, from: string, to: string) => `<animateTransform attributeName="transform" type="${type}" additive="sum" values="${t.values(from, to)}" dur="${t.dur}" begin="${t.begin}" fill="${t.fill}"${t.repeat ? ` repeatCount="${t.repeat}"` : ''} ${spline(SPLINE[ease])}/>`;
  switch (type) {
    case 'slideL': return `<g>${AT('translate', `${n(-140 * amt)} 0`, '0 0')}${A('opacity', '0', '1')}${inner}</g>`;
    case 'slideR': return `<g>${AT('translate', `${n(140 * amt)} 0`, '0 0')}${A('opacity', '0', '1')}${inner}</g>`;
    case 'slideU': return `<g>${AT('translate', `0 ${n(90 * amt)}`, '0 0')}${A('opacity', '0', '1')}${inner}</g>`;
    case 'slideD': return `<g>${AT('translate', `0 ${n(-90 * amt)}`, '0 0')}${A('opacity', '0', '1')}${inner}</g>`;
    case 'drop': return `<g>${AT('translate', `0 ${n(-260 * amt)}`, '0 0')}${inner}</g>`;
    case 'fade': return `<g>${A('opacity', '0', '1')}${inner}</g>`;
    case 'blur': return `<g>${A('opacity', '0', '1')}<g>${inner}</g></g>`;
    case 'pop': return `<g transform="translate(${n(ox)} ${n(oy)})"><g>${AT('scale', `${n(1 - .55 * amt)}`, '1')}${A('opacity', '0', '1')}<g transform="translate(${n(-ox)} ${n(-oy)})">${inner}</g></g></g>`;
    case 'spin': return `<g transform="translate(${n(ox)} ${n(oy)})"><g>${AT('rotate', `${n(-45 * amt)}`, '0')}${A('opacity', '0', '1')}<g transform="translate(${n(-ox)} ${n(-oy)})">${inner}</g></g></g>`;
    case 'growX': return `<g transform="translate(${n(ox)} ${n(oy)})"><g>${AT('scale', '0.001 1', '1 1')}<g transform="translate(${n(-ox)} ${n(-oy)})">${inner}</g></g></g>`;
    case 'growY': return `<g transform="translate(${n(ox)} ${n(oy)})"><g>${AT('scale', '1 0.001', '1 1')}<g transform="translate(${n(-ox)} ${n(-oy)})">${inner}</g></g></g>`;
    case 'draw': return `<g stroke-dasharray="1 1" pathLength="1" style="stroke-dasharray:1 1">${A('stroke-dashoffset', '1', '0')}${inner.replace(/<path /g, '<path pathLength="1" ').replace(/<(circle|line|polyline|ellipse|rect) /g, '<$1 pathLength="1" ')}</g>`;
    case 'wipeR': case 'wipeL': case 'wipeU': case 'wipeD': {
      const id = `w${Math.floor(Math.abs(Math.sin(delay * 97 + dur * 13 + inner.length)) * 1e6)}`;
      const W = 4000, H = 4000; const rect = type === 'wipeR' ? A('width', '0', `${W}`) : type === 'wipeL' ? `${A('x', `${W}`, `${-W / 2}`)}` : type === 'wipeD' ? A('height', '0', `${H}`) : `${A('y', `${H}`, `${-H / 2}`)}`;
      const init = type === 'wipeR' ? `x="${-W / 2}" y="${-H / 2}" width="0" height="${H}"` : type === 'wipeL' ? `x="${W}" y="${-H / 2}" width="${W * 1.5}" height="${H}"` : type === 'wipeD' ? `x="${-W / 2}" y="${-H / 2}" width="${W}" height="0"` : `x="${-W / 2}" y="${H}" width="${W}" height="${H * 1.5}"`;
      return `<g clip-path="url(#${id})"><defs><clipPath id="${id}"><rect ${init}>${rect}</rect></clipPath></defs>${inner}</g>`;
    }
  }
  return inner;
}
/** A continuous drift — for backgrounds that should never sit still. */
export function drift(inner: string, dx: number, dy: number, dur: number) {
  return `<g><animateTransform attributeName="transform" type="translate" values="0 0;${n(dx)} ${n(dy)};0 0" dur="${n(dur)}s" repeatCount="indefinite" calcMode="spline" keySplines="${SPLINE.inOut};${SPLINE.inOut}"/>${inner}</g>`;
}
export function rotateLoop(inner: string, cx: number, cy: number, dur: number, from = 0, to = 360) {
  return `<g><animateTransform attributeName="transform" type="rotate" from="${from} ${n(cx)} ${n(cy)}" to="${to} ${n(cx)} ${n(cy)}" dur="${n(dur)}s" repeatCount="indefinite"/>${inner}</g>`;
}
export function pulse(inner: string, dur: number, lo = .75, hi = 1) {
  return `<g><animate attributeName="opacity" values="${lo};${hi};${lo}" dur="${n(dur)}s" repeatCount="indefinite"/>${inner}</g>`;
}

/* ─── Filters ────────────────────────────────────────────────────────────────────────────── */
export const filters = {
  grain: (id: string, amount: number, seed = 7) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n(amount)} 0"/><feComposite in2="SourceGraphic" operator="over"/></filter>`,
  paper: (id: string, amount: number, seed = 3) => `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="3" seed="${seed}" result="n"/><feDiffuseLighting in="n" lighting-color="#fff" surfaceScale="${n(1.6 * amount)}" result="l"><feDistantLight azimuth="45" elevation="60"/></feDiffuseLighting><feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1=".3" k2="0" k3=".72" k4="0"/></filter>`,
  glow: (id: string, amount: number) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${n(6 + 22 * amount)}" result="b"/><feComponentTransfer in="b"><feFuncA type="linear" slope="${n(.9 + amount)}"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  // Refraction has to stay under the threshold where type stops being type: a few pixels of
  // low-frequency displacement and a faint caustic sheen. The first cut used ten times this and
  // turned every glass identity into grey embossed leather.
  glass: (id: string, amount: number, seed = 5) => `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency=".003 .006" numOctaves="2" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${n(2 + 6 * amount)}" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".004 .009" numOctaves="1" seed="${seed + 3}" result="c"/><feColorMatrix in="c" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${n(.09 * amount)} -${n(.04 * amount)}" result="sheen"/><feComposite in="sheen" in2="d" operator="in" result="sp"/><feComposite in="sp" in2="d" operator="over"/></filter>`,
  ink: (id: string, amount: number, seed = 9) => `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="3" seed="${seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${n(2 + 7 * amount)}" result="d"/><feMorphology in="d" operator="dilate" radius="${n(.4 * amount)}"/></filter>`,
  scan: (id: string, amount: number) => `<filter id="${id}"><feFlood flood-color="#000" flood-opacity="${n(.1 * amount)}" result="f"/><feTurbulence type="fractalNoise" baseFrequency="0 .9" numOctaves="1" result="s"/><feColorMatrix in="s" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n(.5 * amount)} 0" result="lines"/><feComposite in="lines" in2="SourceGraphic" operator="over"/></filter>`,
  xerox: (id: string, amount: number, seed = 11) => `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="${seed}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n(.6 * amount)} 0" result="t"/><feComposite in="t" in2="SourceGraphic" operator="in" result="tn"/><feComponentTransfer in="SourceGraphic"><feFuncR type="discrete" tableValues="0 0 .12 .95 1"/><feFuncG type="discrete" tableValues="0 0 .12 .95 1"/><feFuncB type="discrete" tableValues="0 0 .12 .95 1"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="tn"/></feMerge></filter>`,
  duotone: (id: string, dark: string, light: string) => { const c = (h: string) => [0, 2, 4].map(i => parseInt(h.replace('#', '').slice(i, i + 2), 16) / 255); const d = c(dark), l = c(light); return `<filter id="${id}"><feColorMatrix type="matrix" values=".33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${n(d[0])} ${n(l[0])}"/><feFuncG type="table" tableValues="${n(d[1])} ${n(l[1])}"/><feFuncB type="table" tableValues="${n(d[2])} ${n(l[2])}"/></feComponentTransfer></filter>`; },
  posterize: (id: string, levels = 3) => { const tv = Array.from({ length: levels }, (_, i) => n(i / (levels - 1))).join(' '); return `<filter id="${id}"><feComponentTransfer><feFuncR type="discrete" tableValues="${tv}"/><feFuncG type="discrete" tableValues="${tv}"/><feFuncB type="discrete" tableValues="${tv}"/></feComponentTransfer></filter>`; },
  softShadow: (id: string, dy = 18, blur = 22, opacity = .35) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-opacity="${opacity}"/></filter>`,
  rim: (id: string, color: string, width = 6) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feMorphology operator="dilate" radius="${width}" in="SourceAlpha" result="d"/><feFlood flood-color="${color}" result="c"/><feComposite in="c" in2="d" operator="in" result="rim"/><feGaussianBlur in="rim" stdDeviation="${width}" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
  chroma: (id: string, offset = 6) => `<filter id="${id}"><feOffset in="SourceGraphic" dx="${-offset}" result="l"/><feColorMatrix in="l" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/><feOffset in="SourceGraphic" dx="${offset}" result="rr"/><feColorMatrix in="rr" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/><feBlend in="r" in2="b" mode="screen" result="rb"/><feBlend in="SourceGraphic" in2="rb" mode="screen"/></filter>`,
  emboss: (id: string, amount = 1) => `<filter id="${id}"><feConvolveMatrix order="3" kernelMatrix="${n(-2 * amount)} -1 0 -1 1 1 0 1 ${n(2 * amount)}" preserveAlpha="true"/></filter>`,
};
export const gradient = (id: string, stops: Array<[number, string, number?]>, o: { angle?: number; radial?: boolean; cx?: number; cy?: number; r?: number } = {}) => {
  const st = stops.map(([off, col, op]) => `<stop offset="${n(off)}" stop-color="${col}"${op !== undefined ? ` stop-opacity="${op}"` : ''}/>`).join('');
  if (o.radial) return `<radialGradient id="${id}" cx="${o.cx ?? .5}" cy="${o.cy ?? .5}" r="${o.r ?? .6}">${st}</radialGradient>`;
  const a = ((o.angle ?? 90) - 90) * Math.PI / 180; const x2 = n(.5 + .5 * Math.cos(a)), y2 = n(.5 + .5 * Math.sin(a)), x1 = n(1 - x2), y1 = n(1 - y2);
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${st}</linearGradient>`;
};

/* ─── The authoring context ──────────────────────────────────────────────────────────────── */
export interface Ctx {
  w: number; h: number; kind: string;
  /** motion-speed adjusted base beat in seconds (≈ .6 at 1×) and the whole clip length */
  beat: number; total: number;
  a: string; b: string; c: string; d: string;
  /** chosen inks: `ink` reads on `ground`; `paper` is the palette's lightest, `dark` its darkest */
  ground: string; ink: string; paper: string; dark: string; accent: string; secondary: string;
  title: string; subtitle: string; eyebrow: string; scoreHome: string; scoreAway: string; imageUrl?: string;
  tex: number; seed: number; r: () => number;
  uid: (p: string) => string; defs: string[];
}
