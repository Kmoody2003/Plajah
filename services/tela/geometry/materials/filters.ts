// materials/filters — reusable SVG filter graphs that turn flat vector fills into media:
// watercolour, gouache, crayon, pencil, felt, linocut, risograph, paper grain, ink bleed,
// chalk, and "volume" (soft inner light/shadow that rounds a flat shape).
//
// Why filters: they are part of SVG 1.1, deterministic (feTurbulence takes a seed), and
// render the same in Chrome, the puppeteer exporter and resvg-class renderers, so a page
// looks identical on screen and in print. PDF export rasterises filtered objects (see
// docs/tela/GEOMETRY_ENGINE.md). Noise is in USER SPACE units, so grain has one physical
// scale across the whole page (like real paper) no matter how big an object is.
//
// Each preset returns the inner primitives of a <filter>, reading SourceGraphic and
// ending in a primitive whose result is "out". The serialiser wraps them in a <filter>
// with an explicit user-space region (bbox + margin), so thin objects never lose their filter.
import type { MaterialRef } from '../model';

export interface MaterialPreset {
  id: string; name: string;
  /** How far (px) the effect can paint outside the object's bbox. */
  margin: (p: Params) => number;
  build: (p: Params, seed: number) => string;
  defaults: Params;
  description: string;
}
type Params = Record<string, number | string>;
const n = (p: Params, k: string, d: number) => { const v = p[k]; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !isNaN(+v) ? +v : d; };
const s = (p: Params, k: string, d: string) => { const v = p[k]; return typeof v === 'string' ? v : d; };
const f = (x: number) => String(Math.round(x * 10000) / 10000);
/**
 * Alpha-threshold row for an feColorMatrix reading a fractalNoise ALPHA channel (≈ N(0.5, 0.09)):
 * keeps ≈ `coverage` of the area opaque, with `soft` controlling the edge (higher = crisper).
 */
const keep = (coverage: number, soft = 14) => { const T = .5 + (Math.max(.01, Math.min(.99, coverage)) - .5) * .26; return `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${f(-soft)} ${f(soft * T)}`; };
/** Same, but the noise must be ABOVE the threshold (sparse specks: coverage = fraction kept). */
const specks = (coverage: number, soft = 14, rgb = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0') => { const T = .5 + (.5 - Math.max(.01, Math.min(.99, coverage))) * .26; return `${rgb}  0 0 0 ${f(soft)} ${f(-soft * T)}`; };

// ── Photoshop layer styles ───────────────────────────────────────────────────────────
// One preset whose `style` param carries the effect stack as JSON (see services/tela/import/layerStyles).
// Effect order follows Photoshop's compositing, bottom to top: drop shadow, outer glow, the layer
// (with bevel, satin, overlays and inner effects on top of it), stroke. Filters cannot see the
// backdrop, so shadow and glow blend modes composite as Normal; the import report says so.
export interface LayerStyleSpec {
  fillOpacity?: number;
  dropShadow?: { color: string; opacity: number; dx: number; dy: number; blur: number; spread: number };
  outerGlow?: { color: string; opacity: number; blur: number; spread: number };
  innerShadow?: { color: string; opacity: number; dx: number; dy: number; blur: number; choke: number; blend?: string };
  innerGlow?: { color: string; opacity: number; blur: number; choke: number; center?: boolean; blend?: string };
  overlay?: { color: string; opacity: number; blend?: string };
  /** Gradient overlay as a data-URI SVG image covering the filter region. */
  gradient?: { href: string; opacity: number; blend?: string };
  /** Pattern overlay: a bitmap tile repeated over the layer. */
  pattern?: { href: string; w: number; h: number; x: number; y: number; opacity: number; blend?: string };
  satin?: { color: string; opacity: number; dx: number; dy: number; blur: number; blend?: string };
  bevel?: { size: number; soften: number; angle: number; altitude: number; highlight: string; highlightOpacity: number; shadow: string; shadowOpacity: number; highlightBlend?: string; shadowBlend?: string };
  stroke?: { color: string; opacity: number; size: number; position: 'outside' | 'inside' | 'center' };
}
const layerStyleOf = (p: Params): LayerStyleSpec => { try { return JSON.parse(s(p, 'style', '{}')); } catch { return {}; } };
const layerStyleMargin = (st: LayerStyleSpec) => Math.max(4,
  st.dropShadow ? Math.hypot(st.dropShadow.dx, st.dropShadow.dy) + st.dropShadow.blur * 3 + st.dropShadow.spread : 0,
  st.outerGlow ? st.outerGlow.blur * 3 + st.outerGlow.spread : 0,
  st.stroke ? st.stroke.size + 2 : 0);
function buildLayerStyle(st: LayerStyleSpec): string {
  const out: string[] = []; const under: string[] = []; const over: Array<[string, string | undefined]> = [];
  const colorize = (src: string, color: string, op: number, res: string) => `<feFlood flood-color="${color}" flood-opacity="${f(op)}" result="${res}_c"/><feComposite in="${res}_c" in2="${src}" operator="in" result="${res}"/>`;
  const fillOp = st.fillOpacity ?? 1;
  if (st.dropShadow) {
    const d = st.dropShadow;
    out.push(`<feMorphology in="SourceAlpha" operator="dilate" radius="${f(d.spread)}" result="dsS"/><feOffset in="dsS" dx="${f(d.dx)}" dy="${f(d.dy)}" result="dsO"/><feGaussianBlur in="dsO" stdDeviation="${f(d.blur)}" result="dsB"/>${colorize('dsB', d.color, d.opacity, 'ds')}`);
    under.push('ds');
  }
  if (st.outerGlow) {
    const d = st.outerGlow;
    out.push(`<feMorphology in="SourceAlpha" operator="dilate" radius="${f(d.spread)}" result="ogS"/><feGaussianBlur in="ogS" stdDeviation="${f(d.blur)}" result="ogB"/>${colorize('ogB', d.color, d.opacity, 'og')}`);
    under.push('og');
  }
  if (st.overlay) { out.push(colorize('SourceAlpha', st.overlay.color, st.overlay.opacity, 'ov')); over.push(['ov', st.overlay.blend]); }
  if (st.gradient) { out.push(`<feImage href="${st.gradient.href}" preserveAspectRatio="none" result="grI"/><feComponentTransfer in="grI" result="grO"><feFuncA type="linear" slope="${f(st.gradient.opacity)}"/></feComponentTransfer><feComposite in="grO" in2="SourceAlpha" operator="in" result="gr"/>`); over.push(['gr', st.gradient.blend]); }
  if (st.pattern) { const d = st.pattern; out.push(`<feImage href="${d.href}" x="${f(d.x)}" y="${f(d.y)}" width="${f(d.w)}" height="${f(d.h)}" preserveAspectRatio="none" result="ptI"/><feTile in="ptI" result="ptT"/><feComponentTransfer in="ptT" result="ptO"><feFuncA type="linear" slope="${f(d.opacity)}"/></feComponentTransfer><feComposite in="ptO" in2="SourceAlpha" operator="in" result="pt"/>`); over.push(['pt', d.blend]); }
  if (st.satin) {
    const d = st.satin;
    out.push(`<feOffset in="SourceAlpha" dx="${f(d.dx)}" dy="${f(d.dy)}" result="saA"/><feOffset in="SourceAlpha" dx="${f(-d.dx)}" dy="${f(-d.dy)}" result="saB"/><feComposite in="saA" in2="saB" operator="xor" result="saX"/><feGaussianBlur in="saX" stdDeviation="${f(d.blur)}" result="saG"/><feComposite in="saG" in2="SourceAlpha" operator="in" result="saI"/>${colorize('saI', d.color, d.opacity, 'sa')}`);
    over.push(['sa', d.blend]);
  }
  if (st.innerGlow) {
    const d = st.innerGlow;
    out.push(d.center
      ? `<feMorphology in="SourceAlpha" operator="erode" radius="${f(d.blur)}" result="igE"/><feGaussianBlur in="igE" stdDeviation="${f(d.blur)}" result="igB"/><feComposite in="igB" in2="SourceAlpha" operator="in" result="igM"/>${colorize('igM', d.color, d.opacity, 'ig')}`
      : `<feMorphology in="SourceAlpha" operator="erode" radius="${f(d.choke)}" result="igE"/><feGaussianBlur in="igE" stdDeviation="${f(d.blur)}" result="igB"/><feComposite in="SourceAlpha" in2="igB" operator="out" result="igM"/>${colorize('igM', d.color, d.opacity, 'ig')}`);
    over.push(['ig', d.blend]);
  }
  if (st.innerShadow) {
    const d = st.innerShadow;
    out.push(`<feMorphology in="SourceAlpha" operator="erode" radius="${f(d.choke)}" result="isE"/><feOffset in="isE" dx="${f(d.dx)}" dy="${f(d.dy)}" result="isO"/><feGaussianBlur in="isO" stdDeviation="${f(d.blur)}" result="isB"/><feComposite in="SourceAlpha" in2="isB" operator="out" result="isM"/>${colorize('isM', d.color, d.opacity, 'is')}`);
    over.push(['is', d.blend]);
  }
  if (st.bevel) {
    const d = st.bevel; const a = d.angle;
    out.push(`<feGaussianBlur in="SourceAlpha" stdDeviation="${f(Math.max(.5, d.size / 2))}" result="bvH"/>
<feDiffuseLighting in="bvH" surfaceScale="${f(Math.max(1, d.size / 2))}" diffuseConstant="1" lighting-color="#fff" result="bvL"><feDistantLight azimuth="${f(-a)}" elevation="${f(d.altitude)}"/></feDiffuseLighting>
<feComposite in="bvL" in2="SourceAlpha" operator="in" result="bvC"/>
<feColorMatrix in="bvC" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 0 0 0 -1.8" result="bvHiR"/><feComposite in="bvHiR" in2="SourceAlpha" operator="in" result="bvHiA"/>${colorize('bvHiA', d.highlight, d.highlightOpacity, 'bvHi')}
<feColorMatrix in="bvC" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.2" result="bvLoR"/><feComposite in="bvLoR" in2="SourceAlpha" operator="in" result="bvLoA"/>${colorize('bvLoA', d.shadow, d.shadowOpacity, 'bvLo')}`);
    over.push(['bvLo', d.shadowBlend], ['bvHi', d.highlightBlend]);
  }
  const stack: string[] = [...under];
  let body = 'SourceGraphic';
  if (fillOp < 1) { out.push(`<feComponentTransfer in="SourceGraphic" result="body"><feFuncA type="linear" slope="${f(fillOp)}"/></feComponentTransfer>`); body = 'body'; }
  // Effects inside the layer really can blend, because the layer itself is in the filter.
  over.forEach(([res, mode], i) => { out.push(`<feBlend in="${res}" in2="${body}" mode="${mode || 'normal'}" result="ob${i}"/>`); body = `ob${i}`; });
  stack.push(body);
  if (st.stroke) {
    const d = st.stroke; const r = d.size;
    if (d.position === 'inside') out.push(`<feMorphology in="SourceAlpha" operator="erode" radius="${f(r)}" result="stE"/><feComposite in="SourceAlpha" in2="stE" operator="out" result="stM"/>`);
    else if (d.position === 'center') out.push(`<feMorphology in="SourceAlpha" operator="dilate" radius="${f(r / 2)}" result="stD"/><feMorphology in="SourceAlpha" operator="erode" radius="${f(r / 2)}" result="stE"/><feComposite in="stD" in2="stE" operator="out" result="stM"/>`);
    else out.push(`<feMorphology in="SourceAlpha" operator="dilate" radius="${f(r)}" result="stD"/><feComposite in="stD" in2="SourceAlpha" operator="out" result="stM"/>`);
    out.push(colorize('stM', d.color, d.opacity, 'st')); stack.push('st');
  }
  out.push(`<feMerge result="out">${stack.map(n => `<feMergeNode in="${n}"/>`).join('')}</feMerge>`);
  return out.join('');
}

export const MATERIALS: Record<string, MaterialPreset> = {
  layerStyle: {
    id: 'layerStyle', name: 'Photoshop layer style', description: 'Drop shadow, glow, bevel, satin, overlays and stroke imported from a PSD.',
    defaults: { style: '{}' },
    margin: p => layerStyleMargin(layerStyleOf(p)),
    build: p => buildLayerStyle(layerStyleOf(p)),
  },
  watercolor: {
    id: 'watercolor', name: 'Watercolour wash', description: 'Wobbly bled edge, darker pooled rim, uneven pigment and granulation.',
    defaults: { edge: 9, rim: .75, mottle: .22, grain: .45, freq: .018 },
    margin: p => n(p, 'edge', 9) * 1.6 + 6,
    build: (p, seed) => {
      const edge = n(p, 'edge', 9), rim = n(p, 'rim', .55), mottle = n(p, 'mottle', .35), grain = n(p, 'grain', .5), fq = n(p, 'freq', .018);
      return `<feTurbulence type="fractalNoise" baseFrequency="${f(fq)}" numOctaves="4" seed="${seed}" result="wn"/>
<feDisplacementMap in="SourceGraphic" in2="wn" scale="${f(edge)}" xChannelSelector="R" yChannelSelector="G" result="bled"/>
<feGaussianBlur in="bled" stdDeviation="${f(Math.max(.4, edge * .07))}" result="soft"/>
<feMorphology in="soft" operator="erode" radius="${f(Math.max(1.2, edge * .3))}" result="inner"/>
<feGaussianBlur in="inner" stdDeviation="${f(Math.max(.8, edge * .18))}" result="innerSoft"/>
<feComposite in="soft" in2="innerSoft" operator="out" result="rimA"/>
<feColorMatrix in="rimA" type="matrix" values="0.55 0 0 0 0  0 0.55 0 0 0  0 0 0.6 0 0  0 0 0 ${f(rim)} 0" result="rimC"/>
<feTurbulence type="fractalNoise" baseFrequency="${f(fq * 1.3)}" numOctaves="3" seed="${seed + 7}" result="mn"/>
<feColorMatrix in="mn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${f(-mottle * 2.2)} ${f(1 + mottle * .55)}" result="mAlpha"/>
<feComposite in="soft" in2="mAlpha" operator="in" result="body"/>
<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed + 13}" result="gn"/>
<feColorMatrix in="gn" type="matrix" values="${specks(.025 + grain * .05, 10, '0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.12')}" result="gSpecks"/>
<feComposite in="gSpecks" in2="soft" operator="in" result="gran"/>
<feComponentTransfer in="gran" result="granA"><feFuncA type="linear" slope="${f(.35 + grain * .3)}"/></feComponentTransfer>
<feMerge result="out"><feMergeNode in="body"/><feMergeNode in="rimC"/><feMergeNode in="granA"/></feMerge>`;
    },
  },
  gouache: {
    id: 'gouache', name: 'Gouache', description: 'Opaque matte paint: slightly irregular edge, soft lightness mottling, faint dry-brush streaks.',
    defaults: { edge: 3, mottle: .1, streak: .05, angle: 0 },
    margin: p => n(p, 'edge', 3) * 1.5 + 3,
    build: (p, seed) => {
      const edge = n(p, 'edge', 3), mottle = n(p, 'mottle', .12), streak = n(p, 'streak', .1); const horiz = n(p, 'angle', 0) % 180 < 45 || n(p, 'angle', 0) % 180 > 135;
      return `<feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="${seed}" result="en"/>
<feDisplacementMap in="SourceGraphic" in2="en" scale="${f(edge)}" xChannelSelector="R" yChannelSelector="G" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="2" seed="${seed + 3}" result="mn"/>
<feColorMatrix in="mn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${f(mottle * 2)} 0 0 0 ${f(-mottle)}" result="dark"/>
<feComposite in="dark" in2="shape" operator="in" result="darkIn"/>
<feTurbulence type="fractalNoise" baseFrequency="${horiz ? '.004 .16' : '.16 .004'}" numOctaves="2" seed="${seed + 5}" result="sn"/>
<feColorMatrix in="sn" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${f(streak * 3)} 0 0 0 ${f(-streak * 1.2)}" result="light"/>
<feComposite in="light" in2="shape" operator="in" result="lightIn"/>
<feMerge result="out"><feMergeNode in="shape"/><feMergeNode in="darkIn"/><feMergeNode in="lightIn"/></feMerge>`;
    },
  },
  crayon: {
    id: 'crayon', name: 'Wax crayon', description: 'Waxy strokes skipping over paper tooth; scratchy edge.',
    defaults: { coverage: .74, tooth: .32, edge: 2.5, vertical: 0 },
    margin: p => n(p, 'edge', 2.5) * 2 + 2,
    build: (p, seed) => {
      const cov = n(p, 'coverage', .74), tooth = n(p, 'tooth', .32), edge = n(p, 'edge', 2.5); const v = n(p, 'vertical', 0) > 0;
      return `<feTurbulence type="fractalNoise" baseFrequency="${f(tooth)}" numOctaves="2" seed="${seed}" result="tn"/>
<feTurbulence type="fractalNoise" baseFrequency="${v ? '.25 .02' : '.02 .25'}" numOctaves="2" seed="${seed + 3}" result="sn"/>
<feComposite in="tn" in2="sn" operator="arithmetic" k1="0" k2=".62" k3=".5" k4="-.06" result="mixN"/>
<feDisplacementMap in="SourceGraphic" in2="tn" scale="${f(edge)}" xChannelSelector="R" yChannelSelector="G" result="shape"/>
<feColorMatrix in="mixN" type="matrix" values="${keep(cov, 16)}" result="mask"/>
<feComposite in="shape" in2="mask" operator="in" result="out"/>`;
    },
  },
  pencil: {
    id: 'pencil', name: 'Coloured pencil', description: 'Directional strokes with paper tooth; light pressure leaves gaps.',
    defaults: { coverage: .62, angle: 30, tooth: .7 },
    margin: () => 3,
    build: (p, seed) => {
      const cov = n(p, 'coverage', .5), tooth = n(p, 'tooth', .9);
      return `<feTurbulence type="fractalNoise" baseFrequency="${f(tooth * .06)} ${f(tooth * .9)}" numOctaves="2" seed="${seed}" result="sn"/>
<feTurbulence type="fractalNoise" baseFrequency="${f(tooth)}" numOctaves="1" seed="${seed + 1}" result="tn"/>
<feComposite in="sn" in2="tn" operator="arithmetic" k1="0" k2=".7" k3=".5" k4="-.1" result="mix"/>
<feColorMatrix in="mix" type="matrix" values="${keep(cov, 12)}" result="mask"/>
<feComposite in="SourceGraphic" in2="mask" operator="in" result="out"/>`;
    },
  },
  chalk: {
    id: 'chalk', name: 'Chalk / soft pastel', description: 'Powdery, broken, slightly lifted edges.',
    defaults: { coverage: .78, edge: 4 },
    margin: p => n(p, 'edge', 4) * 2,
    build: (p, seed) => {
      const cov = n(p, 'coverage', .7), edge = n(p, 'edge', 4);
      return `<feTurbulence type="fractalNoise" baseFrequency=".28" numOctaves="3" seed="${seed}" result="tn"/>
<feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="${seed + 9}" result="en"/>
<feDisplacementMap in="SourceGraphic" in2="en" scale="${f(edge)}" xChannelSelector="R" yChannelSelector="G" result="shape"/>
<feGaussianBlur in="shape" stdDeviation=".7" result="powder"/>
<feColorMatrix in="tn" type="matrix" values="${keep(cov, 9)}" result="mask"/>
<feComposite in="powder" in2="mask" operator="in" result="out"/>`;
    },
  },
  felt: {
    id: 'felt', name: 'Felt', description: 'Fibrous fuzzy edge, fibre flecks, soft thickness (inner shade).',
    defaults: { fuzz: 3.2, fleck: .35, depth: .35 },
    margin: p => n(p, 'fuzz', 3.2) * 2 + 4,
    build: (p, seed) => {
      const fuzz = n(p, 'fuzz', 3.2), fleck = n(p, 'fleck', .35), depth = n(p, 'depth', .35);
      return `<feTurbulence type="turbulence" baseFrequency=".55" numOctaves="3" seed="${seed}" result="fn"/>
<feDisplacementMap in="SourceGraphic" in2="fn" scale="${f(fuzz)}" xChannelSelector="R" yChannelSelector="B" result="fuzzy"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="${f(fuzz * 1.4)}" result="ab"/>
<feComposite in="SourceAlpha" in2="ab" operator="out" result="edgeBand"/>
<feFlood flood-color="#000" flood-opacity="${f(depth)}"/>
<feComposite in2="edgeBand" operator="in" result="edgeShade"/>
<feComposite in="edgeShade" in2="fuzzy" operator="in" result="shadeIn"/>
<feTurbulence type="fractalNoise" baseFrequency=".9 .22" numOctaves="2" seed="${seed + 4}" result="fl"/>
<feColorMatrix in="fl" type="matrix" values="${specks(.12 + fleck * .2, 10, '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1')}" result="flecks"/>
<feComposite in="flecks" in2="fuzzy" operator="in" result="fleckIn"/>
<feComponentTransfer in="fleckIn" result="fleckA"><feFuncA type="linear" slope="${f(fleck)}"/></feComponentTransfer>
<feMerge result="out"><feMergeNode in="fuzzy"/><feMergeNode in="shadeIn"/><feMergeNode in="fleckA"/></feMerge>`;
    },
  },
  linocut: {
    id: 'linocut', name: 'Linocut', description: 'Inked block with carved gouge marks and a pressed, slightly broken edge.',
    defaults: { gouge: .35, angle: 0, edge: 2 },
    margin: p => n(p, 'edge', 2) * 2 + 2,
    build: (p, seed) => {
      const g = n(p, 'gouge', .35), edge = n(p, 'edge', 2); const horiz = n(p, 'angle', 0) % 180 < 45 || n(p, 'angle', 0) % 180 > 135;
      return `<feTurbulence type="fractalNoise" baseFrequency=".3" numOctaves="2" seed="${seed}" result="en"/>
<feDisplacementMap in="SourceGraphic" in2="en" scale="${f(edge)}" xChannelSelector="R" yChannelSelector="G" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency="${horiz ? '.012 .07' : '.07 .012'}" numOctaves="2" seed="${seed + 2}" result="gn"/>
<feColorMatrix in="gn" type="matrix" values="${keep(1 - g * .28, 26)}" result="keep"/>
<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${seed + 6}" result="sp"/>
<feColorMatrix in="sp" type="matrix" values="${keep(.995, 20)}" result="speck"/>
<feComposite in="keep" in2="speck" operator="arithmetic" k1=".35" k2=".65" k3="0" k4="0" result="mask"/>
<feComposite in="shape" in2="mask" operator="in" result="out"/>`;
    },
  },
  riso: {
    id: 'riso', name: 'Risograph', description: 'Grainy stochastic ink coverage with a faint misregistered ghost.',
    defaults: { grain: .35, offsetX: 1.6, offsetY: -1.1, ghost: .22 },
    margin: p => Math.abs(n(p, 'offsetX', 1.6)) + Math.abs(n(p, 'offsetY', 1.1)) + 3,
    build: (p, seed) => {
      const grain = n(p, 'grain', .55), ox = n(p, 'offsetX', 1.6), oy = n(p, 'offsetY', -1.1), ghost = n(p, 'ghost', .22);
      return `<feTurbulence type="fractalNoise" baseFrequency="1.05" numOctaves="2" seed="${seed}" result="gn"/>
<feColorMatrix in="gn" type="matrix" values="${keep(.995 - grain * .14, 12)}" result="mask"/>
<feComposite in="SourceGraphic" in2="mask" operator="in" result="ink"/>
<feOffset in="ink" dx="${f(ox)}" dy="${f(oy)}" result="mis"/>
<feComponentTransfer in="mis" result="ghost"><feFuncA type="linear" slope="${f(ghost)}"/></feComponentTransfer>
<feMerge result="out"><feMergeNode in="ghost"/><feMergeNode in="ink"/></feMerge>`;
    },
  },
  paper: {
    id: 'paper', name: 'Paper grain', description: 'Multiplies a fine paper tooth and fibre into the paint.',
    defaults: { amount: .18, scale: .75 },
    margin: () => 1,
    build: (p, seed) => {
      const a = n(p, 'amount', .18), sc = n(p, 'scale', .75);
      return `<feTurbulence type="fractalNoise" baseFrequency="${f(sc)}" numOctaves="3" seed="${seed}" result="pn"/>
<feColorMatrix in="pn" type="matrix" values="0 0 0 0 .36  0 0 0 0 .28  0 0 0 0 .2  0 0 0 ${f(-a * 6)} ${f(a * 3.4)}" result="tooth"/>
<feComposite in="tooth" in2="SourceAlpha" operator="in" result="toothIn"/>
<feMerge result="out"><feMergeNode in="SourceGraphic"/><feMergeNode in="toothIn"/></feMerge>`;
    },
  },
  ink: {
    id: 'ink', name: 'Ink on paper', description: 'Slight feathering and wobble of an inked line into paper fibres.',
    defaults: { feather: 1.1, wobble: 1.4 },
    margin: p => n(p, 'wobble', 1.4) * 2 + n(p, 'feather', 1.1) * 3,
    build: (p, seed) => {
      const fe = n(p, 'feather', 1.1), wb = n(p, 'wobble', 1.4);
      return `<feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="${seed}" result="wn"/>
<feDisplacementMap in="SourceGraphic" in2="wn" scale="${f(wb)}" xChannelSelector="R" yChannelSelector="G" result="line"/>
<feGaussianBlur in="line" stdDeviation="${f(fe * .55)}" result="bleed"/>
<feComponentTransfer in="bleed" result="bleedA"><feFuncA type="linear" slope=".45"/></feComponentTransfer>
<feMerge result="out"><feMergeNode in="bleedA"/><feMergeNode in="line"/></feMerge>`;
    },
  },
  volume: {
    id: 'volume', name: 'Volume (soft light)', description: 'Inner shadow away from the light and a soft inner highlight toward it: rounds a flat shape.',
    defaults: { light: 225, depth: 14, shadow: .32, highlight: .28, shadowColor: '#1d1430', highlightColor: '#fff6e0' },
    margin: () => 2,
    build: (p) => {
      const ang = n(p, 'light', 225) * Math.PI / 180, d = n(p, 'depth', 14); const dx = Math.cos(ang) * d, dy = Math.sin(ang) * d;
      return `<feGaussianBlur in="SourceAlpha" stdDeviation="${f(d * .55)}" result="b"/>
<feOffset in="b" dx="${f(-dx)}" dy="${f(-dy)}" result="bS"/>
<feComposite in="SourceAlpha" in2="bS" operator="out" result="shA"/>
<feFlood flood-color="${s(p, 'shadowColor', '#1d1430')}" flood-opacity="${f(n(p, 'shadow', .32))}"/>
<feComposite in2="shA" operator="in" result="shade"/>
<feOffset in="b" dx="${f(dx * .8)}" dy="${f(dy * .8)}" result="bH"/>
<feComposite in="SourceAlpha" in2="bH" operator="out" result="hlA"/>
<feFlood flood-color="${s(p, 'highlightColor', '#fff6e0')}" flood-opacity="${f(n(p, 'highlight', .28))}"/>
<feComposite in2="hlA" operator="in" result="hl"/>
<feMerge result="out"><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="hl"/></feMerge>`;
    },
  },
  roughEdge: {
    id: 'roughEdge', name: 'Torn / rough edge', description: 'Displaces only the outline (cut paper, torn edges).',
    defaults: { amount: 5, freq: .06 },
    margin: p => n(p, 'amount', 5) * 1.5,
    build: (p, seed) => `<feTurbulence type="fractalNoise" baseFrequency="${f(n(p, 'freq', .06))}" numOctaves="4" seed="${seed}" result="rn"/>
<feDisplacementMap in="SourceGraphic" in2="rn" scale="${f(n(p, 'amount', 5))}" xChannelSelector="R" yChannelSelector="G" result="out"/>`,
  },
};

/** Full <filter> element for a material on an object with the given bbox. */
export function materialFilter(id: string, m: MaterialRef, bbox: { x: number; y: number; w: number; h: number }, extra = ''): string {
  const preset = MATERIALS[m.preset]; if (!preset) return '';
  const params = { ...preset.defaults, ...(m.params || {}) };
  const mg = preset.margin(params) + 2; const seed = Math.abs(Math.floor(m.seed ?? 1)) % 100000;
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${f(bbox.x - mg)}" y="${f(bbox.y - mg)}" width="${f(bbox.w + mg * 2)}" height="${f(bbox.h + mg * 2)}" color-interpolation-filters="sRGB">${preset.build(params, seed).replace(/\n/g, '')}${extra}</filter>`;
}
export const material = (preset: keyof typeof MATERIALS | string, params?: Params, seed?: number): MaterialRef => ({ preset, params, seed });
