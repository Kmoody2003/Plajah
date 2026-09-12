// broadcastDesigns — the registry of hand-authored broadcast identities and the six derived formats.
//
// A design writes its opener, lower third and full page in full. The bug, stinger, transition,
// score strip, overlay and credits are composed here from that design's own vocabulary — type
// trio, mark, field, palette — unless the design overrides them. Nothing in this file decides
// what an identity looks like; it only carries the identity into the formats it did not author.
import type { FabulaBroadcastPack } from '../broadcastPacks';
import type { FabulaBroadcastTemplate } from '../broadcastTemplateFactory';
import { DATA_VIZ_ART_DIRECTIONS } from '../dataVizArtDirection';
import { rng } from '../../tela/ornaments';
import type { FontKey } from '../../tela/telaFonts';
import { type Ctx, R, T, enter, esc, filters, inkOn, isDark, relLum, twoLines } from './kit';
import type { BroadcastDesign } from './types';
import { GLOBAL_DESIGNS } from './globalTraditions';
import { SPORTS_DESIGNS } from './sports';
import { IMAGE_MATTE_DESIGNS } from './imageMatte';
import { COUNTERCULTURE_DESIGNS } from './counterculture';

export const BROADCAST_DESIGNS: Record<string, BroadcastDesign> = { ...GLOBAL_DESIGNS, ...SPORTS_DESIGNS, ...IMAGE_MATTE_DESIGNS, ...COUNTERCULTURE_DESIGNS };
export const designFor = (packId: string): BroadcastDesign | undefined => BROADCAST_DESIGNS[packId];
export const fontKeysFor = (packId: string): FontKey[] => { const d = BROADCAST_DESIGNS[packId]; return d ? [...new Set([d.type.display, d.type.text, d.type.utility])] : []; };

const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export function buildCtx(t: FabulaBroadcastTemplate, pack: FabulaBroadcastPack, design?: BroadcastDesign): Ctx {
  const { accent: a, secondary: b, foreground: c, background: d } = t.controls;
  const pal = [a, b, c, d];
  const byLum = [...pal].sort((x, y) => relLum(x) - relLum(y));
  const seed = hash(pack.id) % 100000;
  let counter = 0;
  const g = design?.ground ?? 'd';
  const ground = g === 'paper' ? byLum[3] : g === 'dark' ? byLum[0] : { a, b, c, d }[g];
  return {
    w: t.width, h: t.height, kind: t.kind,
    beat: .6 / Math.max(.25, t.controls.motionSpeed), total: t.durationMs / 1000,
    a, b, c, d, ground, ink: inkOn(ground, pal), paper: byLum[3], dark: byLum[0],
    accent: a, secondary: b,
    title: t.controls.title, subtitle: t.controls.subtitle, eyebrow: t.controls.eyebrow,
    scoreHome: t.controls.scoreHome, scoreAway: t.controls.scoreAway, imageUrl: t.controls.imageUrl,
    tex: Math.max(0, Math.min(1, t.controls.texture)), seed, r: rng(seed),
    uid: (p: string) => `${p}${seed.toString(36)}${(counter++).toString(36)}`, defs: [],
  };
}

/* ─── Surfaces ───────────────────────────────────────────────────────────────────────────── */
type Surface = NonNullable<BroadcastDesign['surface']>;
const surfaceFilter = (s: Surface, amount: number, seed: number) => {
  switch (s) {
    case 'PAPER': return filters.paper('surface', amount, seed % 50);
    case 'GLOW': return filters.glow('surface', amount);
    case 'GLASS': return filters.glass('surface', amount, seed % 50);
    case 'INK': return filters.ink('surface', amount, seed % 50);
    case 'TOPO': return `<filter id="surface"><feTurbulence type="fractalNoise" baseFrequency=".004 .009" numOctaves="3" seed="${seed % 50}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${(amount * .5).toFixed(2)} 0" result="c"/><feComponentTransfer in="c"><feFuncA type="discrete" tableValues="0 0 .35 0 0 .35 0 0 .35 0"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="over"/></filter>`;
    case 'SCAN': return filters.scan('surface', amount);
    case 'GRAIN': return filters.grain('surface', amount * .55, seed % 50);
    default: return `<filter id="surface"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>`;
  }
};
const surfaceIsOverlay = (s: Surface) => s !== 'GLASS' && s !== 'INK' && s !== 'CLEAN';

/* ─── Derived formats ────────────────────────────────────────────────────────────────────── */
const firstWord = (s: string) => s.split(/\s+/)[0];
const title = (c: Ctx, d: BroadcastDesign, x: number, y: number, size: number, fill: string, anchor: 'start' | 'middle' | 'end' = 'start', fitW?: number) =>
  T(x, y, c.title, { font: d.type.display, size, fill, anchor, upper: d.titleCase === 'upper', lower: d.titleCase === 'lower', fitW });

function bug(c: Ctx, d: BroadcastDesign) {
  const { w, h } = c;
  const word = firstWord(c.title);
  // A bug sits over footage nobody has seen yet, so it brings its own ground.
  return enter(`${R(w * .04, h * .04, w * .92, h * .92, c.ground, { rx: w * .06, opacity: .94 })}${d.mark(c, w / 2, h * .44, w * .56)}${T(w / 2, h * .86, word, { font: d.type.display, size: w * .11, fill: c.ink, anchor: 'middle', upper: d.titleCase === 'upper', lower: d.titleCase === 'lower', fitW: w * .8 })}`, 'pop', { dur: c.beat * 1.1, ease: 'back', origin: [w / 2, h / 2] });
}
function stinger(c: Ctx, d: BroadcastDesign) {
  const { w, h } = c;
  // The field can be busy (a lattice, a court, a contact sheet), so the title stands on its own plate.
  const plate = `${R(0, 0, w, h, c.a)}${d.field(c, 0, 0, w, h, 1)}`;
  const body = `${enter(plate, 'wipeR', { dur: c.total * .3, ease: 'expo' })}${enter(`${R(w * .3, h * .2, w * .4, h * .6, c.ground, { opacity: .94 })}${d.mark(c, w * .5, h * .42, h * .3)}${title(c, d, w / 2, h * .72, h * .09, c.ink, 'middle', w * .34)}`, 'pop', { dur: c.total * .28, delay: c.total * .18, ease: 'back', origin: [w / 2, h / 2] })}`;
  return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;${w} 0" keyTimes="0;.72;1" dur="${c.total}s" repeatCount="indefinite" calcMode="spline" keySplines="0 0 1 1;.6 0 .9 .4"/>${body}</g>`;
}
function transition(c: Ctx, d: BroadcastDesign) {
  const { w, h } = c;
  const plate = `${R(-w * .1, 0, w * 1.2, h, c.a)}${d.field(c, 0, 0, w, h, 1)}${d.mark(c, w / 2, h / 2, h * .42)}`;
  return `<g><animateTransform attributeName="transform" type="translate" values="-${w * 1.25} 0;0 0;${w * 1.25} 0" keyTimes="0;.5;1" dur="${c.total}s" repeatCount="indefinite" calcMode="spline" keySplines=".16 1 .3 1;.6 0 .9 .4"/>${plate}</g>`;
}
function scoreStrip(c: Ctx, d: BroadcastDesign) {
  const { w, h } = c;
  return `${R(0, 0, w, h, c.ground)}<g opacity=".22">${d.field(c, 0, 0, w, h, .6)}</g>${R(0, 0, w * .012, h, c.a)}
    ${d.mark(c, w * .06, h / 2, h * .62)}
    ${enter(title(c, d, w * .11, h * .64, h * .36, c.ink, 'start', w * .4), 'slideL', { dur: c.beat, amount: .4 })}
    ${enter(`${T(w * .7, h * .66, c.scoreHome, { font: d.type.utility, size: h * .44, weight: 800, fill: c.ink, anchor: 'end' })}${R(w * .715, h * .28, w * .016, h * .44, c.a)}${T(w * .762, h * .66, c.scoreAway, { font: d.type.utility, size: h * .44, weight: 800, fill: c.ink })}${T(w * .93, h * .62, c.subtitle, { font: d.type.utility, size: h * .15, fill: c.b, anchor: 'end', tracking: .08, upper: true, fitW: w * .14 })}`, 'fade', { dur: c.beat, delay: c.beat * .4 })}`;
}
function overlay(c: Ctx, d: BroadcastDesign) {
  const { w, h } = c; const px = w * .6;
  const lines = twoLines(c.title);
  return `<g opacity=".18">${d.field(c, 0, 0, w, h, .5)}</g>${enter(`${R(px, 0, w - px, h, c.ground, { opacity: .94 })}${R(px, 0, 6, h, c.a)}<g opacity=".35">${d.field(c, px, h * .55, w - px, h * .45, .7)}</g>${d.mark(c, px + (w - px) * .5, h * .22, h * .2)}
    ${T(px + w * .04, h * .46, lines[0], { font: d.type.display, size: h * .07, fill: c.ink, upper: d.titleCase === 'upper', lower: d.titleCase === 'lower', lines, fitW: (w - px) * .86 })}
    ${T(px + w * .04, h * .46 + (lines.length) * h * .075, c.subtitle, { font: d.type.text, size: h * .028, weight: 400, fill: c.b, fitW: (w - px) * .86 })}`, 'slideR', { dur: c.beat * 1.4, ease: 'expo', amount: 2.5 })}`;
}
function credits(c: Ctx, d: BroadcastDesign) {
  const { w, h } = c;
  const roles = ['Directed by', 'Produced by', 'Written by', 'Cinematography', 'Edited by', 'Music', 'Sound design', 'Colour'];
  const rows = roles.map((r, i) => `${T(w * .47, h * (.6 + i * .11), r, { font: d.type.utility, size: h * .024, fill: c.b, anchor: 'end', tracking: .1, upper: true })}${T(w * .5, h * (.6 + i * .11), 'Replaceable Name', { font: d.type.text, size: h * .036, weight: 500, fill: c.ink })}`).join('');
  return `<g opacity=".14">${d.field(c, 0, 0, w, h, .6)}</g><g><animateTransform attributeName="transform" type="translate" values="0 ${h * .75};0 -${h * .95}" dur="${c.total}s" repeatCount="indefinite"/>${d.mark(c, w / 2, h * .12, h * .22)}${title(c, d, w / 2, h * .38, h * .085, c.ink, 'middle', w * .8)}${T(w / 2, h * .45, c.subtitle, { font: d.type.text, size: h * .03, weight: 400, fill: c.b, anchor: 'middle', fitW: w * .7 })}${rows}</g>`;
}

/* ─── Render ─────────────────────────────────────────────────────────────────────────────── */
export function renderDesign(t: FabulaBroadcastTemplate, pack: FabulaBroadcastPack, d: BroadcastDesign): string {
  const c = buildCtx(t, pack, d);
  const { w, h } = c;
  let body = '';
  switch (t.kind) {
    case 'OPENER': body = d.opener(c); break;
    case 'LOWER_THIRD': body = d.lowerThird(c); break;
    case 'FULL_PAGE': body = d.fullPage(c); break;
    case 'BUG': body = d.bug ? d.bug(c) : bug(c, d); break;
    case 'STINGER': body = d.stinger ? d.stinger(c) : stinger(c, d); break;
    case 'TRANSITION': body = d.transition ? d.transition(c) : transition(c, d); break;
    case 'SCORE_STRIP': body = d.scoreStrip ? d.scoreStrip(c) : scoreStrip(c, d); break;
    case 'OVERLAY': body = d.overlay ? d.overlay(c) : overlay(c, d); break;
    case 'CREDITS': body = d.credits ? d.credits(c) : credits(c, d); break;
  }
  const surface = d.surface ?? DATA_VIZ_ART_DIRECTIONS[pack.councilStyle].texture;
  const filter = surfaceFilter(surface, c.tex, c.seed);
  // Lower thirds, bugs and score strips sit over footage, so their ground is transparent.
  const transparent = t.kind === 'LOWER_THIRD' || t.kind === 'BUG' || t.kind === 'OVERLAY';
  const groundRect = transparent ? '' : R(0, 0, w, h, c.ground);
  const artwork = surfaceIsOverlay(surface) ? body : `<g filter="url(#surface)">${body}</g>`;
  // Dark noise over a light ground reads as dirt, not material; keep it faint there.
  const over = surfaceIsOverlay(surface) && c.tex > 0 ? `<rect width="${w}" height="${h}" filter="url(#surface)" opacity="${(c.tex * (isDark(c.ground) ? .8 : .22)).toFixed(2)}" pointer-events="none"${transparent ? ' fill="none"' : ''}/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" font-kerning="normal"><title>${esc(t.name)}</title><defs>${filter}${c.defs.join('')}</defs>${groundRect}${artwork}${over}</svg>`;
}
