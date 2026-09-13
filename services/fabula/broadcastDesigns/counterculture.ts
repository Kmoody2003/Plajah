// counterculture — eighteen authored print-and-motion positions from punk to postmodern.
//
// These identities argue with their own frame: xerox toner, ransom type, misregistered plates,
// elastic grids, marker annotation, corroded metal. Every disruption is deterministic and every
// headline is still readable — the brief is a wall you can read from across the street.
import * as orn from '../../tela/ornaments';
import { type Ctx, C, D, E, L, P, PolyG, R, T, checker, dots, drift, enter, gradient, mix, alpha, perspectiveGrid, pulse, radial, rings, rotateLoop, slot, stripes, specks, twoLines, halftone, filters } from './kit';
import type { BroadcastDesign } from './types';

const lt = (k: Ctx, inner: string, type: Parameters<typeof enter>[1], o: Parameters<typeof enter>[2] = {}) => enter(inner, type, { dur: k.beat * .8, ease: 'expo', loop: k.total, outDur: k.beat * .5, ...o });
/** Ransom-note setting: each word on its own scrap, rotated by a seeded few degrees. */
function ransom(k: Ctx, x: number, y: number, str: string, size: number, fonts: Array<Parameters<typeof T>[3]['font']>, scraps: string[], inks: string[]) {
  const r = orn.rng(k.seed + 11); let cx = x; const out: string[] = [];
  str.split(/\s+/).forEach((word, n) => { const f = fonts[n % fonts.length]; const ww = word.length * size * .62 + size * .5; const rot = (r() - .5) * 8; out.push(`${R(cx, y - size * .82, ww, size * 1.1, scraps[n % scraps.length], { rotate: rot })}${T(cx + size * .25, y, word, { font: f, size, fill: inks[n % inks.length], upper: true, rotate: rot })}`); cx += ww + size * .3; });
  return out.join('');
}

export const COUNTERCULTURE_DESIGNS: Record<string, BroadcastDesign> = {

  /* ── Punk Xerox Stack — photocopy urgency, torn hierarchy, deterministic roughness ── */
  'punk-xerox-stack': {
    type: { display: 'anton', text: 'specialElite', utility: 'archivoBlack' }, idea: 'A stack of photocopied flyers: crushed blacks, ransom-cut words on tape, and a headline in a black bar that reads from across the street.', ground: 'a', surface: 'SCAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .4, s, s * .8, k.b, { rotate: -4 })}${R(cx - s * .4, cy - s * .12, s * .8, s * .24, k.paper, { rotate: 3 })}${T(cx, cy + s * .05, 'X', { font: 'anton', size: s * .5, fill: k.b, anchor: 'middle', rotate: 3 })}`,
    field: (k, x, y, w, h, i = 1) => `${specks(x, y, w, h, 400 * i, alpha(k.b, .7), k.seed, .6)}${[0, 1, 2].map(n => R(x + w * (.1 + n * .3), y + h * .3, w * .22, h * .1, alpha(k.b, .9 * i), { rotate: -6 + n * 5 })).join('')}`,
    opener: k => { const { w, h } = k; const xer = k.uid('xr'); k.defs.push(filters.xerox(xer, .8, k.seed % 20));
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 900, alpha(k.b, .5), k.seed, .5)}
        ${enter(`<g filter="url(#${xer})">${slot(k, w * .5, h * .08, w * .44, h * .6, { tone: 'light', rotate: 3, silent: true })}</g>${R(w * .48, h * .06, w * .12, h * .04, alpha(k.paper, .8), { rotate: -20 })}${R(w * .86, h * .6, w * .12, h * .04, alpha(k.paper, .8), { rotate: 30 })}`, 'slideD', { dur: k.beat * .4, ease: 'in', amount: 1 })}
        ${enter(`${R(w * .04, h * .28, w * .58, h * .2, k.b, { rotate: -2 })}${T(w * .07, h * .43, k.title, { font: 'anton', size: h * .15, fill: k.a, upper: true, rotate: -2, fitW: w * .52 })}`, 'pop', { dur: k.beat * .3, delay: k.beat * .4, ease: 'back', origin: [w * .33, h * .38] })}
        ${enter(ransom(k, w * .06, h * .62, k.subtitle, h * .045, ['anton', 'archivoBlack', 'specialElite'], [k.paper, k.b, k.c], [k.b, k.a, k.paper]), 'fade', { dur: k.beat * .3, delay: k.beat * .9 })}
        ${enter(`${T(w * .06, h * .9, 'NO FUTURE · REPLACEABLE · ADMISSION AT THE DOOR', { font: 'specialElite', size: h * .024, fill: k.b })}`, 'fade', { dur: k.beat * .3, delay: k.beat * 1.3 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .04, h * .76, w * .5, h * .14, k.b, { rotate: -1.5 })}${R(w * .03, h * .73, w * .1, h * .035, alpha(k.paper, .85), { rotate: -25 })}${R(w * .5, h * .88, w * .1, h * .035, alpha(k.paper, .85), { rotate: 20 })}
        ${T(w * .07, h * .86, k.title, { font: 'anton', size: h * .08, fill: k.a, upper: true, rotate: -1.5, fitW: w * .3 })}${T(w * .38, h * .86, k.subtitle, { font: 'specialElite', size: h * .024, fill: k.a, rotate: -1.5, fitW: w * .14 })}`, 'slideD', { dur: k.beat * .35, ease: 'in', amount: 1.2 }); },
    fullPage: k => { const { w, h } = k; const xer = k.uid('xr'); k.defs.push(filters.xerox(xer, .7, k.seed % 20));
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 900, alpha(k.b, .5), k.seed + 3, .5)}<g filter="url(#${xer})">${slot(k, w * .06, h * .08, w * .46, h * .7, { tone: 'light', rotate: -2, silent: true })}</g>${R(w * .04, h * .06, w * .1, h * .035, alpha(k.paper, .85), { rotate: -25 })}
        ${enter(`${R(w * .54, h * .24, w * .42, h * .2, k.b, { rotate: 2 })}${T(w * .56, h * .385, k.title, { font: 'anton', size: h * .11, fill: k.a, upper: true, rotate: 2, fitW: w * .37 })}`, 'pop', { dur: k.beat * .3, ease: 'back', origin: [w * .75, h * .34] })}
        ${enter(ransom(k, w * .55, h * .62, k.subtitle, h * .04, ['archivoBlack', 'specialElite', 'anton'], [k.paper, k.c, k.b], [k.b, k.a, k.a]), 'fade', { dur: k.beat * .3, delay: k.beat * .5 })}${T(w * .06, h * .9, 'XEROX · GENERATION 4 · REPLACEABLE', { font: 'specialElite', size: h * .024, fill: k.b })}`; },
  },

  /* ── Riot Grrrl Cut & Paste — personal, political zine intimacy with handwritten interruption ── */
  'riot-grrrl-cutpaste': {
    type: { display: 'permanentMarker', text: 'karla', utility: 'kalam' }, idea: 'A zine spread: cut photo, marker headline, a hand-drawn heart and stars, and a typed column interrupted by handwriting.', ground: 'a', surface: 'PAPER', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .5, s, s, orn.starPath(5, .45), k.c, { rotate: -12 })}${T(cx, cy + s * .12, '!', { font: 'permanentMarker', size: s * .5, fill: k.b, anchor: 'middle' })}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3, 4].map(n => P(x + w * (.05 + n * .2), y + h * (.2 + (n % 2) * .4), 60 * i, 60 * i, orn.starPath(5, .45), n % 2 ? alpha(k.c, .9) : alpha(k.d, .9), { rotate: n * 20 })).join('')}${D(`M${x + w * .1} ${y + h * .7}Q${x + w * .5} ${y + h * .9} ${x + w * .9} ${y + h * .6}`, 'none', { stroke: alpha(k.b, .8 * i), sw: 5 })}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${enter(`${slot(k, w * .08, h * .1, w * .4, h * .56, { tone: 'light', rotate: -4, silent: true })}${R(w * .06, h * .08, w * .1, h * .03, alpha(k.d, .9), { rotate: -15 })}`, 'pop', { dur: k.beat * .5, ease: 'back', origin: [w * .28, h * .38] })}
        ${enter(`${T(w * .52, h * .34, twoLines(k.title)[0], { font: 'permanentMarker', size: h * .12, fill: k.b, upper: true, rotate: -3, lines: twoLines(k.title), leading: .95, fitW: w * .42 })}${D(`M${w * .52} ${h * (.36 + (twoLines(k.title).length - 1) * .12)}Q${w * .7} ${h * (.4 + (twoLines(k.title).length - 1) * .12)} ${w * .9} ${h * (.35 + (twoLines(k.title).length - 1) * .12)}`, 'none', { stroke: k.c, sw: 8 })}`, 'fade', { dur: k.beat * .4, delay: k.beat * .4 })}
        ${[[.86, .16, 0], [.62, .68, 20], [.14, .8, -15]].map(([px, py, rot], n) => enter(P(w * px, h * py, 90, 90, orn.starPath(5, .45), n % 2 ? k.c : k.d, { rotate: rot }), 'pop', { dur: k.beat * .4, delay: k.beat * (.8 + n * .15), ease: 'back', origin: [w * px + 45, h * py + 45] })).join('')}
        ${enter(`${[0, 1, 2, 3, 4].map(n => R(w * .08, h * (.72 + n * .04), w * (.34 - (n % 3) * .06), 7, alpha(k.b, .5))).join('')}${T(w * .52, h * .8, k.subtitle, { font: 'kalam', size: h * .045, weight: 700, fill: k.d, rotate: 2, fitW: w * .42 })}`, 'fade', { dur: k.beat * .4, delay: k.beat * 1.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .76, w * .46, h * .14, k.a, { rotate: -1, stroke: k.b, sw: 3 })}${P(w * .03, h * .7, 80, 80, orn.starPath(5, .45), k.c, { rotate: -12 })}
        ${T(w * .1, h * .855, k.title, { font: 'permanentMarker', size: h * .064, fill: k.b, upper: true, rotate: -1, fitW: w * .3 })}${T(w * .42, h * .855, k.subtitle, { font: 'kalam', size: h * .03, weight: 700, fill: k.d, rotate: -1, fitW: w * .12 })}`, 'pop', { dur: k.beat * .4, ease: 'back', origin: [w * .28, h * .83] }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['riot-grrrl-cutpaste'].field(k, w * .5, 0, w * .5, h, .6)}${slot(k, w * .06, h * .1, w * .44, h * .6, { tone: 'light', rotate: -3, silent: true })}${R(w * .04, h * .08, w * .1, h * .03, alpha(k.d, .9), { rotate: -15 })}
        ${enter(`${T(w * .56, h * .36, twoLines(k.title)[0], { font: 'permanentMarker', size: h * .1, fill: k.b, upper: true, rotate: -2, lines: twoLines(k.title), leading: .95, fitW: w * .38 })}${T(w * .56, h * .66, k.subtitle, { font: 'kalam', size: h * .04, weight: 700, fill: k.d, fitW: w * .38 })}${[0, 1, 2, 3, 4, 5].map(n => R(w * .56, h * (.74 + n * .034), w * (.34 - (n % 3) * .06), 6, alpha(k.b, .5))).join('')}${D(`M${w * .56} ${h * .84}Q${w * .7} ${h * .9} ${w * .9} ${h * .83}`, 'none', { stroke: k.c, sw: 7 })}`, 'fade', { dur: k.beat * .5, delay: k.beat * .4 })}${[0, 1, 2, 3, 4].map(n => R(w * .06, h * (.74 + n * .04), w * (.4 - (n % 2) * .08), 7, alpha(k.b, .45))).join('')}`; },
  },

  /* ── Hardcore Stencil — one-colour venue-poster force with spray edges and hard timing ── */
  'hardcore-stencil': {
    type: { display: 'staatliches', text: 'oswald', utility: 'spaceMono' }, idea: 'One colour, one stencil: bridged letters cut from a plate, overspray at the edges, and two-frame timing.', ground: 'a', surface: 'INK', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s, s, k.b)}${R(cx - s * .38, cy - s * .38, s * .76, s * .76, k.a)}${R(cx - s * .5, cy - s * .06, s, s * .12, k.b)}${R(cx - s * .06, cy - s * .5, s * .12, s, k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${stripes(x, y, w, h, 6, h * .04, alpha(k.b, .9 * i), { angle: -8 })}${specks(x, y, w, h, 200 * i, alpha(k.b, .6), k.seed, .6)}`,
    opener: k => { const { w, h } = k; const spray = k.uid('sp'); k.defs.push(`<filter id="${spray}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="2" seed="${k.seed % 20}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6"/><feGaussianBlur stdDeviation=".8"/></filter>`);
      const lines = twoLines(k.title);
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 500, alpha(k.b, .5), k.seed, .5)}
        ${enter(`<g filter="url(#${spray})">${R(w * .06, h * .1, w * .88, h * .58, k.b)}</g>`, 'fade', { dur: k.beat * .1 })}
        ${enter(`<g filter="url(#${spray})">${T(w / 2, h * .42, lines[0], { font: 'staatliches', size: h * .24, fill: k.a, anchor: 'middle', upper: true, lines, leading: .86, fitW: w * .8, tracking: .02 })}</g>${stripes(w * .06, h * .1, w * .88, h * .58, 3, 10, k.b, { vertical: false })}`, 'fade', { dur: k.beat * .1, delay: k.beat * .3 })}
        ${enter(`${R(w * .06, h * .72, w * .88, h * .16, k.b)}${T(w / 2, h * .83, k.subtitle, { font: 'staatliches', size: h * .08, fill: k.a, anchor: 'middle', upper: true, tracking: .06, fitW: w * .8 })}`, 'fade', { dur: k.beat * .1, delay: k.beat * .6 })}
        ${T(w * .06, h * .95, 'ALL AGES · REPLACEABLE · DOORS 7', { font: 'spaceMono', size: h * .022, weight: 700, fill: k.b, tracking: .1 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .76, w * .48, h * .14, k.b)}${stripes(w * .05, h * .76, w * .48, h * .14, 2, 8, k.a)}${T(w * .08, h * .87, k.title, { font: 'staatliches', size: h * .09, fill: k.a, upper: true, fitW: w * .3 })}${T(w * .4, h * .865, k.subtitle, { font: 'spaceMono', size: h * .022, weight: 700, fill: k.a, tracking: .08, upper: true, fitW: w * .12 })}`, 'fade', { dur: k.beat * .1, outDur: .1 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 600, alpha(k.b, .5), k.seed + 1, .5)}${R(w * .06, h * .08, w * .44, h * .84, k.b)}${slot(k, w * .09, h * .11, w * .38, h * .6, { tone: 'dark', silent: true })}${stripes(w * .09, h * .11, w * .38, h * .6, 4, 8, k.b)}${T(w * .28, h * .84, k.eyebrow, { font: 'staatliches', size: h * .07, fill: k.a, anchor: 'middle', upper: true, tracking: .06 })}
        ${enter(`${T(w * .54, h * .4, twoLines(k.title)[0], { font: 'staatliches', size: h * .16, fill: k.b, upper: true, lines: twoLines(k.title), leading: .88, fitW: w * .4 })}${R(w * .54, h * .58, w * .4, h * .1, k.b)}${T(w * .56, h * .655, k.subtitle, { font: 'staatliches', size: h * .06, fill: k.a, upper: true, tracking: .04, fitW: w * .36 })}${T(w * .54, h * .8, 'ONE COLOUR · ONE PLATE · REPLACEABLE', { font: 'spaceMono', size: h * .02, weight: 700, fill: k.b, tracking: .1 })}`, 'fade', { dur: k.beat * .1, delay: k.beat * .2 })}`; },
  },

  /* ── Post-Punk Cold Grid — severe negative space, thin rules, emotionally distant photography ── */
  'postpunk-coldgrid': {
    type: { display: 'archivo', text: 'crimson', utility: 'jetbrains' }, idea: 'A cold Swiss grid held at a distance: thin rules, a small severe photograph, a narrow grotesk arriving late.', ground: 'a', surface: 'CLEAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${L(cx - s * .5, cy - s * .5, cx + s * .5, cy - s * .5, k.b, s * .02)}${L(cx - s * .5, cy + s * .5, cx + s * .5, cy + s * .5, k.b, s * .02)}${R(cx - s * .16, cy - s * .3, s * .32, s * .6, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3, 4, 5].map(n => L(x, y + n * h / 6, x + w, y + n * h / 6, alpha(k.b, .5 * i), 1)).join('')}${[0, 1, 2, 3].map(n => L(x + n * w / 4, y, x + n * w / 4, y + h, alpha(k.b, .5 * i), 1)).join('')}`,
    opener: k => { const { w, h } = k;
      const rules = [.1, .3, .5, .7, .9].map((py, n) => enter(L(w * .06, h * py, w * .94, h * py, alpha(k.b, .7), 1), 'growX', { dur: k.beat * 1.6, delay: k.beat * .25 * n, ease: 'inOut', origin: [w * .06, h * py] })).join('');
      return `${R(0, 0, w, h, k.a)}${rules}${enter(slot(k, w * .62, h * .32, w * .18, h * .36, { tone: 'dark', silent: true }), 'fade', { dur: k.beat * 2.4, delay: k.beat * 1.4 })}
        ${enter(`${T(w * .06, h * .26, k.title, { font: 'archivo', size: h * .05, weight: 500, fill: k.b, upper: true, tracking: .3, fitW: w * .5 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 2.8 })}
        ${enter(`${T(w * .06, h * .66, k.subtitle, { font: 'crimson', size: h * .026, weight: 400, fill: k.c, fitW: w * .4 })}${T(w * .94, h * .96, '00 · 00 · 00', { font: 'jetbrains', size: h * .018, weight: 400, fill: k.c, anchor: 'end', tracking: .2 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 3.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${L(w * .05, h * .78, w * .5, h * .78, alpha(k.b, .8), 1)}${L(w * .05, h * .9, w * .5, h * .9, alpha(k.b, .8), 1)}${T(w * .05, h * .845, k.title, { font: 'archivo', size: h * .036, weight: 500, fill: k.b, upper: true, tracking: .28, fitW: w * .3 })}${T(w * .5, h * .845, k.subtitle, { font: 'jetbrains', size: h * .018, weight: 400, fill: k.c, anchor: 'end', tracking: .16, upper: true, fitW: w * .14 })}`, 'fade', { dur: k.beat * 2.2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['postpunk-coldgrid'].field(k, w * .06, h * .08, w * .88, h * .84, .7)}${slot(k, w * .5, h * .22, w * .22, h * .42, { tone: 'dark', silent: true })}
        ${enter(`${T(w * .06, h * .2, k.title, { font: 'archivo', size: h * .045, weight: 500, fill: k.b, upper: true, tracking: .3, fitW: w * .4 })}${T(w * .06, h * .5, k.subtitle, { font: 'crimson', size: h * .028, weight: 400, fill: k.c, fitW: w * .38 })}${[0, 1, 2, 3, 4, 5, 6].map(n => R(w * .06, h * (.58 + n * .03), w * (.28 - (n % 3) * .04), 2, alpha(k.b, .5))).join('')}${T(w * .94, h * .96, 'SIDE A · 00:00', { font: 'jetbrains', size: h * .018, weight: 400, fill: k.c, anchor: 'end', tracking: .2 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 1.4 })}`; },
  },

  /* ── Grunge Misregister — offset inks and distressed scale make imperfection structural ── */
  'grunge-misregister': {
    type: { display: 'oswald', text: 'bitter', utility: 'specialElite' }, idea: 'Two colour plates arrive out of register over a brush-swiped ground; the title is set twice and never lines up.', ground: 'a', surface: 'GRAIN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .3, s, s * .6, orn.brushStrokePath(4), k.c, { blend: 'multiply' })}${P(cx - s * .44, cy - s * .22, s, s * .6, orn.brushStrokePath(6), k.d, { blend: 'multiply', opacity: .8 })}`,
    field: (k, x, y, w, h, i = 1) => `${P(x, y + h * .2, w, h * .5, orn.brushStrokePath(2), alpha(k.c, .8 * i), { blend: 'multiply' })}${P(x + 14, y + h * .28, w, h * .5, orn.brushStrokePath(5), alpha(k.d, .7 * i), { blend: 'multiply' })}${specks(x, y, w, h, 250 * i, alpha(k.b, .5), k.seed, .6)}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 700, alpha(k.b, .4), k.seed, .5)}
        ${enter(P(-w * .05, h * .16, w * 1.1, h * .5, orn.brushStrokePath(3), k.c, { blend: 'multiply', opacity: .85 }), 'wipeR', { dur: k.beat * .7, ease: 'in' })}
        ${enter(P(w * .02, h * .24, w * 1.1, h * .5, orn.brushStrokePath(7), k.d, { blend: 'multiply', opacity: .75 }), 'wipeR', { dur: k.beat * .7, delay: k.beat * .35, ease: 'in' })}
        ${enter(T(w * .08 + 10, h * .58 + 8, k.title, { font: 'oswald', size: h * .2, weight: 700, fill: k.d, upper: true, rotate: -1.5, opacity: .7, fitW: w * .7, blend: 'multiply' }), 'fade', { dur: k.beat * .3, delay: k.beat * 1.1 })}
        ${enter(T(w * .08, h * .58, k.title, { font: 'oswald', size: h * .2, weight: 700, fill: k.b, upper: true, rotate: -1.5, fitW: w * .7 }), 'fade', { dur: k.beat * .3, delay: k.beat * .9 })}
        ${enter(`${T(w * .09, h * .72, k.subtitle, { font: 'specialElite', size: h * .03, fill: k.b, fitW: w * .6 })}${P(w * .06, h * .84, w * .5, h * .1, orn.tornEdgePath(4, 30), k.b, { opacity: .85 })}`, 'fade', { dur: k.beat * .4, delay: k.beat * 1.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${P(w * .02, h * .7, w * .56, h * .24, orn.brushStrokePath(3), k.c, { blend: 'multiply', opacity: .9 })}${P(w * .04, h * .73, w * .56, h * .24, orn.brushStrokePath(6), k.d, { blend: 'multiply', opacity: .7 })}
        ${T(w * .08 + 5, h * .85 + 4, k.title, { font: 'oswald', size: h * .07, weight: 700, fill: k.d, upper: true, rotate: -1, opacity: .7, blend: 'multiply', fitW: w * .3 })}${T(w * .08, h * .85, k.title, { font: 'oswald', size: h * .07, weight: 700, fill: k.b, upper: true, rotate: -1, fitW: w * .3 })}${T(w * .4, h * .85, k.subtitle, { font: 'specialElite', size: h * .024, fill: k.b, rotate: -1, fitW: w * .14 })}`, 'wipeR', { dur: k.beat * .6, ease: 'in' }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['grunge-misregister'].field(k, 0, 0, w, h, .6)}${slot(k, w * .06, h * .08, w * .46, h * .78, { tone: 'light', shape: 'path', d: orn.tornEdgePath(2, 8), silent: true })}${P(w * .04, h * .8, w * .5, h * .1, orn.tornEdgePath(5, 30), k.b, { opacity: .85 })}
        ${enter(`${T(w * .56 + 8, h * .42 + 6, twoLines(k.title)[0], { font: 'oswald', size: h * .12, weight: 700, fill: k.d, upper: true, lines: twoLines(k.title), leading: .9, opacity: .7, blend: 'multiply', fitW: w * .38 })}${T(w * .56, h * .42, twoLines(k.title)[0], { font: 'oswald', size: h * .12, weight: 700, fill: k.b, upper: true, lines: twoLines(k.title), leading: .9, fitW: w * .38 })}${T(w * .56, h * .7, k.subtitle, { font: 'bitter', size: h * .028, weight: 700, fill: k.b, fitW: w * .38 })}${T(w * .56, h * .78, 'PLATE 2 OF 2 · REPLACEABLE', { font: 'specialElite', size: h * .022, fill: k.c })}`, 'fade', { dur: k.beat * .4, delay: k.beat * .6 })}`; },
  },

  /* ── Acid House Flyer — day-glo event systems, smile-scale circles, cheap-print intensity ── */
  'acid-house-flyer': {
    type: { display: 'bungee', text: 'archivo', utility: 'spaceMono' }, idea: 'A day-glo club flyer: one enormous circle, radial pulses, and stacked event type on a cheap-print ground.', ground: 'a', surface: 'SCAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${C(cx, cy, s * .5, k.c)}${C(cx - s * .16, cy - s * .12, s * .06, k.a)}${C(cx + s * .16, cy - s * .12, s * .06, k.a)}${D(`M${cx - s * .26} ${cy + s * .1}A${s * .26} ${s * .26} 0 0 0 ${cx + s * .26} ${cy + s * .1}`, 'none', { stroke: k.a, sw: s * .06 })}`,
    field: (k, x, y, w, h, i = 1) => `${rings(x + w / 2, y + h / 2, [h * .15, h * .3, h * .45, h * .6], alpha(k.c, .6 * i), 8)}${radial(x + w / 2, y + h / 2, h * .1, h * .7, 24, alpha(k.d, .4 * i), 3)}`,
    opener: k => { const { w, h } = k; const cx = w * .68, cy = h * .5;
      const pulses = [0, 1, 2, 3].map(n => enter(C(cx, cy, h * (.2 + n * .12), 'none', { stroke: n % 2 ? k.c : k.d, sw: 14 }), 'pop', { dur: k.beat * .6, delay: k.beat * .18 * n, ease: 'expo', origin: [cx, cy] })).join('');
      return `${R(0, 0, w, h, k.a)}${radial(cx, cy, h * .1, h * 1.2, 36, alpha(k.d, .18), 3)}${pulses}${enter(`${C(cx, cy, h * .18, k.c)}${C(cx - h * .06, cy - h * .04, h * .022, k.a)}${C(cx + h * .06, cy - h * .04, h * .022, k.a)}${D(`M${cx - h * .1} ${cy + h * .03}A${h * .1} ${h * .1} 0 0 0 ${cx + h * .1} ${cy + h * .03}`, 'none', { stroke: k.a, sw: 10 })}`, 'pop', { dur: k.beat * .5, delay: k.beat * .7, ease: 'back', origin: [cx, cy] })}
        ${enter(`${T(w * .05, h * .34, twoLines(k.title)[0], { font: 'bungee', size: h * .13, fill: k.b, upper: true, lines: twoLines(k.title), leading: .92, fitW: w * .46 })}`, 'slideL', { dur: k.beat * .5, delay: k.beat * .3, ease: 'expo', amount: 2 })}
        ${enter(`${R(w * .05, h * .64, w * .42, h * .08, k.d)}${T(w * .07, h * .7, k.subtitle, { font: 'archivo', size: h * .036, weight: 900, fill: k.a, upper: true, tracking: .06, fitW: w * .38 })}${T(w * .05, h * .8, '10 PM – LATE · £5 B4 11 · REPLACEABLE', { font: 'spaceMono', size: h * .024, weight: 700, fill: k.b, tracking: .06 })}`, 'slideU', { dur: k.beat * .5, delay: k.beat * 1.1, ease: 'expo' })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${C(w * .11, h * .82, h * .09, k.c)}${C(w * .11 - h * .03, h * .8, h * .012, k.a)}${C(w * .11 + h * .03, h * .8, h * .012, k.a)}${D(`M${w * .11 - h * .05} ${h * .84}A${h * .05} ${h * .05} 0 0 0 ${w * .11 + h * .05} ${h * .84}`, 'none', { stroke: k.a, sw: 6 })}${R(w * .18, h * .76, w * .36, h * .12, k.d)}
        ${T(w * .2, h * .84, k.title, { font: 'bungee', size: h * .05, fill: k.a, upper: true, fitW: w * .24 })}${T(w * .46, h * .84, k.subtitle, { font: 'spaceMono', size: h * .02, weight: 700, fill: k.a, tracking: .06, fitW: w * .07 })}`, 'pop', { dur: k.beat * .4, ease: 'back', origin: [w * .11, h * .82] }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['acid-house-flyer'].field(k, w * .4, 0, w * .6, h, .5)}${C(w * .3, h * .5, h * .38, k.c)}${slot(k, w * .3 - h * .34, h * .16, h * .68, h * .68, { tone: 'light', shape: 'circle', silent: true })}
        ${enter(`${T(w * .62, h * .38, twoLines(k.title)[0], { font: 'bungee', size: h * .1, fill: k.b, upper: true, lines: twoLines(k.title), leading: .92, fitW: w * .34 })}${R(w * .62, h * .56, w * .32, h * .08, k.d)}${T(w * .64, h * .62, k.subtitle, { font: 'archivo', size: h * .034, weight: 900, fill: k.a, upper: true, fitW: w * .28 })}${['DOORS 10', 'RESIDENTS + GUESTS', 'REPLACEABLE'].map((l, n) => T(w * .62, h * (.72 + n * .05), l, { font: 'spaceMono', size: h * .024, weight: 700, fill: k.c, tracking: .06 })).join('')}`, 'slideL', { dur: k.beat * .5, ease: 'expo', amount: 1.5 })}`; },
  },

  /* ── New Wave Elastic Type — the Swiss grid bends, layers, and changes scale ── */
  'newwave-elastic': {
    type: { display: 'syne', text: 'dmSans', utility: 'spaceMono' }, idea: 'Stepped rules and a title set at three scales — ghost, mid, solid — overlapping across an elastic column grid.', ground: 'a', surface: 'CLEAN',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .4, s * .7, s * .08, k.c)}${R(cx - s * .3, cy - s * .12, s * .8, s * .08, k.b)}${R(cx - s * .5, cy + s * .16, s * .5, s * .08, k.d)}${T(cx + s * .1, cy + s * .48, 'a', { font: 'syne', size: s * .5, weight: 800, fill: k.b, anchor: 'middle' })}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3, 4].map(n => R(x + w * (n % 2 ? .3 : .05), y + h * (.1 + n * .2), w * (.3 + (n % 3) * .15), 6 * i, [k.c, k.b, k.d][n % 3])).join('')}`,
    opener: k => { const { w, h } = k;
      const steps = [[.06, .2, .4], [.3, .3, .5], [.12, .58, .32], [.5, .72, .44], [.2, .86, .6]].map(([px, py, pw], n) => enter(R(w * px, h * py, w * pw, 8, [k.c, k.b, k.d][n % 3]), 'growX', { dur: k.beat * .8, delay: k.beat * .15 * n, ease: 'expo', origin: [w * px, h * py] })).join('');
      return `${R(0, 0, w, h, k.a)}${steps}
        ${enter(T(w * .08, h * .62, k.title, { font: 'syne', size: h * .3, weight: 800, fill: k.b, opacity: .12, fitW: w * .9 }), 'fade', { dur: k.beat, delay: k.beat * .6 })}
        ${enter(T(w * .3, h * .5, k.title, { font: 'syne', size: h * .16, weight: 800, fill: k.d, opacity: .5, fitW: w * .64 }), 'slideL', { dur: k.beat * .8, delay: k.beat * .9, ease: 'expo', amount: 1.2 })}
        ${enter(T(w * .34, h * .46, k.title, { font: 'syne', size: h * .1, weight: 800, fill: k.b, fitW: w * .6 }), 'slideL', { dur: k.beat * .8, delay: k.beat * 1.2, ease: 'expo', amount: 1.8 })}
        ${enter(`${T(w * .08, h * .3, k.subtitle, { font: 'spaceMono', size: h * .02, weight: 700, fill: k.c, tracking: .3, upper: true, rotate: -90, anchor: 'end' })}${T(w * .5, h * .8, k.subtitle, { font: 'dmSans', size: h * .026, weight: 500, fill: k.b, tracking: .12, upper: true, fitW: w * .44 })}`, 'fade', { dur: k.beat, delay: k.beat * 1.6 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${[0, 1, 2].map(n => R(w * (.05 + n * .04), h * (.74 + n * .07), w * (.3 - n * .04), 7, [k.c, k.b, k.d][n])).join('')}${T(w * .1, h * .87, k.title, { font: 'syne', size: h * .14, weight: 800, fill: k.d, opacity: .3, fitW: w * .4 })}${T(w * .12, h * .87, k.title, { font: 'syne', size: h * .06, weight: 800, fill: k.b, fitW: w * .3 })}${T(w * .44, h * .87, k.subtitle, { font: 'spaceMono', size: h * .02, weight: 700, fill: k.c, tracking: .16, upper: true, fitW: w * .1 })}`, 'slideL', { amount: 1.6 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['newwave-elastic'].field(k, w * .5, h * .1, w * .5, h * .8, 1)}${slot(k, w * .06, h * .16, w * .38, h * .68, { tone: 'light', silent: true })}${R(w * .04, h * .12, w * .3, 8, k.c)}${R(w * .2, h * .86, w * .3, 8, k.d)}
        ${enter(`${T(w * .5, h * .5, twoLines(k.title)[0], { font: 'syne', size: h * .18, weight: 800, fill: k.d, opacity: .25, lines: twoLines(k.title), leading: .9, fitW: w * .48 })}${T(w * .54, h * .46, twoLines(k.title)[0], { font: 'syne', size: h * .09, weight: 800, fill: k.b, lines: twoLines(k.title), leading: .95, fitW: w * .4 })}${T(w * .54, h * .72, k.subtitle, { font: 'dmSans', size: h * .026, weight: 500, fill: k.b, tracking: .1, upper: true, fitW: w * .4 })}`, 'slideL', { dur: k.beat, ease: 'expo', amount: 1.4 })}`; },
  },

  /* ── Neo-Dada Broadcast — chance-looking collage built from deterministic editorial rules ── */
  'neo-dada-broadcast': {
    type: { display: 'playfair', text: 'specialElite', utility: 'spaceMono' }, idea: 'A found-fragment collage: a huge italic serif numeral, a typed strip, a cut circle, an upside-down word — composed, not random.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${C(cx + s * .1, cy - s * .1, s * .34, k.c)}${R(cx - s * .5, cy, s * .7, s * .22, k.b, { rotate: -7 })}${T(cx - s * .28, cy + s * .42, '7', { font: 'playfair', size: s * .5, weight: 900, fill: k.d, italic: true, rotate: 4 })}`,
    field: (k, x, y, w, h, i = 1) => `${C(x + w * .7, y + h * .3, h * .25, alpha(k.c, .9 * i))}${R(x + w * .05, y + h * .5, w * .4, h * .12, alpha(k.b, .9 * i), { rotate: -5 })}${R(x + w * .55, y + h * .7, w * .3, h * .08, alpha(k.d, .9 * i), { rotate: 4 })}${T(x + w * .15, y + h * .4, 'No.', { font: 'playfair', size: h * .3, weight: 900, fill: alpha(k.b, .5 * i), italic: true, rotate: -3 })}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${enter(C(w * .68, h * .36, h * .24, k.c), 'pop', { dur: k.beat * .5, ease: 'back', origin: [w * .68, h * .36] })}${enter(R(w * .04, h * .3, w * .5, h * .18, k.b, { rotate: -5 }), 'slideL', { dur: k.beat * .5, delay: k.beat * .2, ease: 'expo', amount: 1.5 })}
        ${enter(T(w * .08, h * .44, k.title, { font: 'playfair', size: h * .12, weight: 900, fill: k.a, rotate: -5, fitW: w * .44 }), 'fade', { dur: k.beat * .3, delay: k.beat * .5 })}
        ${enter(T(w * .12, h * .82, 'No. 7', { font: 'playfair', size: h * .2, weight: 900, fill: k.d, italic: true, rotate: 3 }), 'pop', { dur: k.beat * .5, delay: k.beat * .7, ease: 'back', origin: [w * .2, h * .74] })}
        ${enter(`${R(w * .5, h * .62, w * .42, h * .07, k.paper, { rotate: 2, stroke: k.b, sw: 1 })}${T(w * .52, h * .67, k.subtitle, { font: 'specialElite', size: h * .028, fill: k.b, rotate: 2, fitW: w * .38 })}`, 'slideU', { dur: k.beat * .5, delay: k.beat * 1, ease: 'back' })}
        ${enter(`${R(w * .74, h * .76, w * .2, h * .1, k.c, { rotate: 178 })}${T(w * .84, h * .835, 'ANTI', { font: 'playfair', size: h * .06, weight: 900, fill: k.a, anchor: 'middle', rotate: 178 })}`, 'fade', { dur: k.beat * .3, delay: k.beat * 1.3 })}
        ${T(w * .06, h * .95, 'READ ALOUD, QUICKLY, IN TWO LANGUAGES AT ONCE', { font: 'spaceMono', size: h * .018, weight: 700, fill: k.b, tracking: .12 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${C(w * .1, h * .8, h * .09, k.c)}${R(w * .14, h * .77, w * .38, h * .12, k.b, { rotate: -2 })}${R(w * .5, h * .85, w * .1, h * .05, k.paper, { rotate: 6, stroke: k.b, sw: 1 })}
        ${T(w * .17, h * .855, k.title, { font: 'playfair', size: h * .06, weight: 900, fill: k.a, rotate: -2, fitW: w * .3 })}${T(w * .51, h * .885, k.subtitle, { font: 'specialElite', size: h * .02, fill: k.b, rotate: 6, fitW: w * .09 })}`, 'pop', { dur: k.beat * .5, ease: 'back', origin: [w * .3, h * .82] }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['neo-dada-broadcast'].field(k, w * .5, 0, w * .5, h, .6)}${slot(k, w * .08, h * .1, w * .38, h * .5, { tone: 'light', rotate: -4, silent: true })}${C(w * .44, h * .62, h * .12, k.c)}
        ${enter(`${R(w * .52, h * .3, w * .42, h * .16, k.b, { rotate: 3 })}${T(w * .54, h * .42, k.title, { font: 'playfair', size: h * .1, weight: 900, fill: k.a, rotate: 3, fitW: w * .38 })}${T(w * .1, h * .86, 'No. 7', { font: 'playfair', size: h * .18, weight: 900, fill: k.d, italic: true, rotate: 2 })}${R(w * .54, h * .56, w * .36, h * .07, k.paper, { rotate: -2, stroke: k.b, sw: 1 })}${T(w * .56, h * .61, k.subtitle, { font: 'specialElite', size: h * .026, fill: k.b, rotate: -2, fitW: w * .32 })}${[0, 1, 2, 3].map(n => R(w * .54, h * (.7 + n * .04), w * (.34 - (n % 2) * .08), 6, alpha(k.b, .5), { rotate: n % 2 ? 1 : -1 })).join('')}`, 'pop', { dur: k.beat * .5, ease: 'back', origin: [w * .72, h * .5] })}`; },
  },

  /* ── Deconstructed Editorial — footnotes, crop marks, and the production system become content ── */
  'deconstructed-editorial': {
    type: { display: 'bodoni', text: 'inter', utility: 'dmMono' }, idea: 'The hidden production layer shown: crop marks, a registration target, column guides, and footnotes that annotate and revise the headline.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${C(cx, cy, s * .3, 'none', { stroke: k.b, sw: s * .02 })}${L(cx - s * .5, cy, cx + s * .5, cy, k.b, s * .02)}${L(cx, cy - s * .5, cx, cy + s * .5, k.b, s * .02)}${T(cx + s * .34, cy - s * .3, '¹', { font: 'bodoni', size: s * .3, fill: k.c })}`,
    field: (k, x, y, w, h, i = 1) => `${[.25, .5, .75].map(px => L(x + w * px, y, x + w * px, y + h, alpha(k.b, .5 * i), 1, { dash: '6 6' })).join('')}${[[x + 20, y + 20], [x + w - 20, y + 20], [x + 20, y + h - 20], [x + w - 20, y + h - 20]].map(([cx, cy]) => `${L(cx - 26, cy, cx + 26, cy, alpha(k.b, .8 * i), 1)}${L(cx, cy - 26, cx, cy + 26, alpha(k.b, .8 * i), 1)}`).join('')}`,
    opener: k => { const { w, h } = k;
      const crop = (x: number, y: number) => `${L(x - 40, y, x - 12, y, k.b, 1.5)}${L(x + 12, y, x + 40, y, k.b, 1.5)}${L(x, y - 40, x, y - 12, k.b, 1.5)}${L(x, y + 12, x, y + 40, k.b, 1.5)}`;
      return `${R(0, 0, w, h, k.a)}${enter(`${crop(w * .06, h * .08)}${crop(w * .94, h * .08)}${crop(w * .06, h * .92)}${crop(w * .94, h * .92)}${[.3, .5, .7].map(px => L(w * px, h * .08, w * px, h * .92, alpha(k.b, .4), 1, { dash: '6 6' })).join('')}${C(w * .9, h * .16, 18, 'none', { stroke: k.b, sw: 1.5 })}${L(w * .9 - 26, h * .16, w * .9 + 26, h * .16, k.b, 1)}${L(w * .9, h * .16 - 26, w * .9, h * .16 + 26, k.b, 1)}`, 'fade', { dur: k.beat })}
        ${enter(`${T(w * .1, h * .46, twoLines(k.title)[0], { font: 'bodoni', size: h * .13, weight: 700, fill: k.b, lines: twoLines(k.title), fitW: w * .6 })}${T(w * .1 + Math.min(w * .6, k.title.length * h * .13 * .5) + 10, h * .38, '¹', { font: 'bodoni', size: h * .05, fill: k.c })}`, 'fade', { dur: k.beat, delay: k.beat * .6 })}
        ${enter(`${L(w * .1, h * .62, w * .44, h * .62, k.c, 4)}${T(w * .1, h * .6, 'revised', { font: 'dmMono', size: h * .018, fill: k.c, tracking: .1 })}`, 'growX', { dur: k.beat * .8, delay: k.beat * 1.4, ease: 'expo', origin: [w * .1, h * .62] })}
        ${enter(`${T(w * .1, h * .78, `¹ ${k.subtitle}`, { font: 'inter', size: h * .022, weight: 400, fill: k.b, fitW: w * .5 })}${T(w * .1, h * .82, '² Set in Bodoni Moda. Crop marks retained on purpose.', { font: 'inter', size: h * .02, weight: 400, fill: k.c, fitW: w * .5 })}${T(w * .94, h * .88, 'p. 7 / GALLEY 02 / REPLACEABLE', { font: 'dmMono', size: h * .016, fill: k.b, anchor: 'end', tracking: .12 })}`, 'fade', { dur: k.beat, delay: k.beat * 1.8 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${L(w * .05, h * .78, w * .05, h * .9, k.b, 1.5)}${L(w * .03, h * .8, w * .07, h * .8, k.b, 1.5)}${R(w * .06, h * .78, w * .46, h * .12, k.a)}${T(w * .08, h * .84, k.title, { font: 'bodoni', size: h * .05, weight: 700, fill: k.b, fitW: w * .32 })}${T(w * .08 + Math.min(w * .32, k.title.length * h * .05 * .5) + 6, h * .81, '¹', { font: 'bodoni', size: h * .024, fill: k.c })}${T(w * .08, h * .88, `¹ ${k.subtitle}`, { font: 'inter', size: h * .018, weight: 400, fill: k.c, fitW: w * .4 })}`, 'fade', { dur: k.beat }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['deconstructed-editorial'].field(k, w * .04, h * .06, w * .92, h * .88, 1)}${slot(k, w * .08, h * .12, w * .4, h * .56, { tone: 'light' })}${T(w * .08, h * .72, 'FIG. 1 — CROP RETAINED', { font: 'dmMono', size: h * .016, fill: k.c, tracking: .12 })}
        ${enter(`${T(w * .54, h * .34, twoLines(k.title)[0], { font: 'bodoni', size: h * .09, weight: 700, fill: k.b, lines: twoLines(k.title), fitW: w * .38 })}${L(w * .54, h * .5, w * .74, h * .5, k.c, 3)}${T(w * .54, h * .58, `¹ ${k.subtitle}`, { font: 'inter', size: h * .022, weight: 400, fill: k.b, fitW: w * .38 })}${[0, 1, 2, 3, 4].map(n => R(w * .54, h * (.66 + n * .034), w * (.34 - (n % 3) * .05), 2, alpha(k.b, .5))).join('')}${T(w * .54, h * .88, '² Column guides retained. Footnotes are the content.', { font: 'inter', size: h * .018, weight: 400, fill: k.c })}`, 'fade', { dur: k.beat, delay: k.beat * .6 })}`; },
  },

  /* ── Radical Typeset — type alone creates image, rhythm, and transition ── */
  'radical-typeset': {
    type: { display: 'archivo', text: 'archivo', utility: 'jetbrains' }, idea: 'No image, no ornament: the title at three widths of a variable grotesk stacked edge to edge becomes the picture.', ground: 'a', surface: 'CLEAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${T(cx, cy + s * .35, 'A', { font: 'archivo', size: s, weight: 900, fill: k.b, anchor: 'middle' })}${R(cx - s * .5, cy + s * .42, s, s * .06, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3].map(n => T(x, y + h * (.3 + n * .22), 'TYPE', { font: 'archivo', size: h * .24, weight: 900, fill: alpha(k.b, (.15 + n * .1) * i), tracking: -.04 })).join('')}`,
    opener: k => { const { w, h } = k; const word = k.title.toUpperCase();
      return `${R(0, 0, w, h, k.a)}${enter(T(w * .04, h * .32, word, { font: 'archivo', size: h * .3, weight: 900, fill: k.b, fitW: w * .92, tracking: -.05 }), 'slideL', { dur: k.beat * .6, ease: 'expo', amount: 1.5 })}
        ${enter(T(w * .04, h * .6, word, { font: 'archivo', size: h * .3, weight: 300, fill: k.b, fitW: w * .92, tracking: -.02 }), 'slideR', { dur: k.beat * .6, delay: k.beat * .25, ease: 'expo', amount: 1.5 })}
        ${enter(T(w * .04, h * .88, word, { font: 'archivo', size: h * .3, weight: 900, fill: k.c, fitW: w * .92, tracking: .02 }), 'slideL', { dur: k.beat * .6, delay: k.beat * .5, ease: 'expo', amount: 1.5 })}
        ${enter(`${R(w * .04, h * .655, w * .92, 4, k.b)}${T(w * .96, h * .69, k.subtitle, { font: 'jetbrains', size: h * .02, weight: 700, fill: k.b, anchor: 'end', tracking: .18, upper: true, fitW: w * .5 })}`, 'fade', { dur: k.beat * .4, delay: k.beat * 1 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .03, h * .72, w * .52, h * .22, k.a)}${T(w * .05, h * .84, k.title, { font: 'archivo', size: h * .12, weight: 900, fill: k.b, upper: true, tracking: -.04, fitW: w * .48 })}${T(w * .05, h * .89, k.subtitle, { font: 'archivo', size: h * .032, weight: 300, fill: k.b, upper: true, tracking: .1, fitW: w * .48 })}${R(w * .05, h * .905, w * .48, 4, k.c)}`, 'slideL', { amount: 1.5 }); },
    fullPage: k => { const { w, h } = k; const word = k.title.toUpperCase();
      return `${R(0, 0, w, h, k.a)}${[0, 1, 2, 3, 4].map(n => T(w * .04, h * (.22 + n * .19), word, { font: 'archivo', size: h * .2, weight: n % 2 ? 300 : 900, fill: n === 2 ? k.c : k.b, opacity: n === 2 ? 1 : .18 + n * .12, fitW: w * .92, tracking: n % 2 ? .02 : -.04 })).join('')}
        ${enter(`${R(w * .04, h * .62, w * .92, h * .12, k.a)}${T(w * .05, h * .705, k.subtitle, { font: 'archivo', size: h * .05, weight: 300, fill: k.b, upper: true, tracking: .06, fitW: w * .9 })}${R(w * .04, h * .74, w * .92, 4, k.c)}`, 'fade', { dur: k.beat * .4, delay: k.beat * .8 })}`; },
  },

  /* ── Cyber Collage — browser fragments, scans, and luminous compression artifacts form a lucid stack ── */
  'cyber-collage': {
    type: { display: 'pressStart', text: 'inter', utility: 'vt323' }, idea: 'Stacked browser windows with title bars, a pixel-font headline, and localised compression tears that never spread.', ground: 'a', surface: 'SCAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .4, s, s * .8, k.b)}${R(cx - s * .5, cy - s * .4, s, s * .14, k.c)}${[0, 1, 2].map(n => C(cx - s * .4 + n * s * .12, cy - s * .33, s * .04, k.a)).join('')}${checker(cx - s * .3, cy - s * .1, s * .6, s * .3, s * .06, k.d)}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2].map(n => `${R(x + w * (.1 + n * .22), y + h * (.15 + n * .18), w * .36, h * .4, alpha(k.b, .9 * i), { stroke: alpha(k.c, .9), sw: 2 })}${R(x + w * (.1 + n * .22), y + h * (.15 + n * .18), w * .36, 22, alpha(k.c, .9 * i))}`).join('')}${checker(x + w * .6, y + h * .6, w * .2, h * .2, 10, alpha(k.d, .6 * i))}`,
    opener: k => { const { w, h } = k;
      const win = (x: number, y: number, ww: number, hh: number, delay: number, title: string, inner: string) => enter(`${R(x + 8, y + 8, ww, hh, alpha(k.dark, .5))}${R(x, y, ww, hh, k.b, { stroke: k.c, sw: 2 })}${R(x, y, ww, 30, k.c)}${[0, 1, 2].map(n => C(x + 16 + n * 20, y + 15, 6, k.a)).join('')}${T(x + 80, y + 21, title, { font: 'vt323', size: 22, fill: k.a })}${inner}`, 'pop', { dur: k.beat * .35, delay, ease: 'expo', origin: [x + ww / 2, y + hh / 2] });
      return `${R(0, 0, w, h, k.a)}${dots(0, 0, w, h, 24, alpha(k.c, .25), { r: 1 })}
        ${win(w * .08, h * .12, w * .46, h * .5, 0, 'image_01.jpg — 1024 × 768', slot(k, w * .08 + 2, h * .12 + 32, w * .46 - 4, h * .5 - 34, { tone: 'light', silent: true }))}
        ${win(w * .4, h * .3, w * .4, h * .42, k.beat * .3, 'scan_004.tif', `${checker(w * .4 + 2, h * .3 + 32, w * .4 - 4, h * .42 - 34, 18, alpha(k.d, .35))}${R(w * .46, h * .48, w * .28, h * .06, k.d)}${R(w * .5, h * .56, w * .2, h * .04, k.d, { opacity: .6 })}`)}
        ${win(w * .58, h * .1, w * .34, h * .14, k.beat * .5, 'alert', T(w * .6, h * .21, 'ARTIFACT LOCALISED · OK', { font: 'vt323', size: 26, fill: k.a }))}
        ${enter(`${R(w * .06, h * .74, w * .7, h * .16, k.a, { stroke: k.c, sw: 2 })}${T(w * .08, h * .85, k.title, { font: 'pressStart', size: h * .06, fill: k.c, upper: true, fitW: w * .64 })}`, 'fade', { dur: k.beat * .2, delay: k.beat * .8 })}
        ${enter(T(w * .08, h * .95, `> ${k.subtitle}_`, { font: 'vt323', size: h * .034, fill: k.d, fitW: w * .8 }), 'fade', { dur: k.beat * .2, delay: k.beat * 1.1 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05 + 6, h * .76 + 6, w * .48, h * .14, alpha(k.dark, .5))}${R(w * .05, h * .76, w * .48, h * .14, k.b, { stroke: k.c, sw: 2 })}${R(w * .05, h * .76, w * .48, 26, k.c)}${[0, 1, 2].map(n => C(w * .05 + 14 + n * 18, h * .76 + 13, 5, k.a)).join('')}${T(w * .05 + 72, h * .76 + 19, 'lower_third.svg', { font: 'vt323', size: 20, fill: k.a })}
        ${T(w * .07, h * .855, k.title, { font: 'pressStart', size: h * .036, fill: k.a, upper: true, fitW: w * .3 })}${T(w * .07, h * .89, `> ${k.subtitle}`, { font: 'vt323', size: h * .026, fill: k.d, fitW: w * .44 })}`, 'pop', { dur: k.beat * .3, ease: 'expo', origin: [w * .29, h * .83] }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${dots(0, 0, w, h, 24, alpha(k.c, .2), { r: 1 })}${COUNTERCULTURE_DESIGNS['cyber-collage'].field(k, w * .5, 0, w * .5, h, .5)}${R(w * .06 + 8, h * .1 + 8, w * .46, h * .7, alpha(k.dark, .5))}${R(w * .06, h * .1, w * .46, h * .7, k.b, { stroke: k.c, sw: 2 })}${R(w * .06, h * .1, w * .46, 30, k.c)}${[0, 1, 2].map(n => C(w * .06 + 16 + n * 20, h * .1 + 15, 6, k.a)).join('')}${slot(k, w * .06 + 2, h * .1 + 32, w * .46 - 4, h * .7 - 34, { tone: 'light', silent: true })}
        ${enter(`${R(w * .56, h * .3, w * .38, h * .4, k.a, { stroke: k.c, sw: 2 })}${T(w * .58, h * .44, twoLines(k.title)[0], { font: 'pressStart', size: h * .045, fill: k.c, upper: true, lines: twoLines(k.title), leading: 1.3, fitW: w * .34 })}${T(w * .58, h * .62, `> ${k.subtitle}_`, { font: 'vt323', size: h * .032, fill: k.d, fitW: w * .34 })}${checker(w * .82, h * .72, w * .12, h * .08, 10, alpha(k.d, .6))}`, 'pop', { dur: k.beat * .3, ease: 'expo', origin: [w * .75, h * .5] })}`; },
  },

  /* ── Art School Assemblage — sculptural paper, paint, diagram, and found-photo relations ── */
  'artschool-assemblage': {
    type: { display: 'workSans', text: 'fraunces', utility: 'spaceMono' }, idea: 'A tabletop of things: a painted swatch, a folded paper shape, a diagram, a found photo — each with its own shadow and weight.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${PolyG([[cx - s * .5, cy + s * .4], [cx - s * .1, cy - s * .4], [cx + s * .5, cy + s * .2]], k.c)}${C(cx + s * .2, cy - s * .2, s * .2, k.d)}${L(cx - s * .5, cy + s * .48, cx + s * .5, cy + s * .48, k.b, s * .03)}`,
    field: (k, x, y, w, h, i = 1) => `${R(x + w * .08, y + h * .2, w * .22, h * .3, alpha(k.c, .9 * i), { rotate: -6 })}${PolyG([[x + w * .4, y + h * .7], [x + w * .55, y + h * .2], [x + w * .7, y + h * .75]], alpha(k.d, .9 * i))}${C(x + w * .82, y + h * .35, h * .12, 'none', { stroke: alpha(k.b, .8 * i), sw: 2, dash: '6 5' })}`,
    opener: k => { const { w, h } = k; const shadow = k.uid('sd'); k.defs.push(filters.softShadow(shadow, 12, 14, .28));
      const obj = (inner: string, cx: number, cy: number, delay: number) => enter(`<g filter="url(#${shadow})">${inner}</g>`, 'drop', { dur: k.beat * .7, delay, ease: 'back', amount: .5, origin: [cx, cy] });
      return `${R(0, 0, w, h, k.a)}${obj(R(w * .08, h * .14, w * .26, h * .34, k.c, { rotate: -7 }), w * .21, h * .31, 0)}${obj(PolyG([[w * .4, h * .66], [w * .56, h * .12], [w * .72, h * .7]], k.d), w * .56, h * .5, k.beat * .3)}${obj(slot(k, w * .66, h * .34, w * .26, h * .34, { tone: 'light', rotate: 4, silent: true }), w * .79, h * .51, k.beat * .6)}
        ${enter(`${C(w * .3, h * .7, h * .14, 'none', { stroke: k.b, sw: 2, dash: '8 6' })}${L(w * .3, h * .7, w * .44, h * .56, k.b, 2)}${T(w * .3, h * .9, 'fig. a — relation', { font: 'spaceMono', size: h * .02, fill: k.b, anchor: 'middle', tracking: .06 })}`, 'fade', { dur: k.beat, delay: k.beat * 1 })}
        ${enter(`${T(w * .06, h * .8, k.title, { font: 'workSans', size: h * .08, weight: 800, fill: k.b, fitW: w * .5 })}${T(w * .06, h * .86, k.subtitle, { font: 'fraunces', size: h * .026, weight: 400, fill: k.c, italic: true, fitW: w * .5 })}`, 'fade', { dur: k.beat, delay: k.beat * 1.3 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .04, h * .74, h * .14, h * .14, k.c, { rotate: -8 })}${PolyG([[w * .1, h * .9], [w * .14, h * .74], [w * .18, h * .9]], k.d)}${R(w * .19, h * .77, w * .34, h * .12, k.a, { stroke: k.b, sw: 1.5 })}
        ${T(w * .21, h * .825, k.title, { font: 'workSans', size: h * .048, weight: 800, fill: k.b, fitW: w * .3 })}${T(w * .21, h * .865, k.subtitle, { font: 'spaceMono', size: h * .019, weight: 700, fill: k.c, tracking: .06, fitW: w * .3 })}`, 'drop', { dur: k.beat * .7, ease: 'back', amount: .4 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['artschool-assemblage'].field(k, w * .5, h * .5, w * .5, h * .5, .8)}${slot(k, w * .06, h * .1, w * .42, h * .58, { tone: 'light', rotate: -3, silent: true })}${R(w * .1, h * .64, w * .2, h * .24, k.c, { rotate: 6 })}${PolyG([[w * .32, h * .92], [w * .4, h * .66], [w * .48, h * .92]], k.d)}
        ${enter(`${T(w * .54, h * .3, twoLines(k.title)[0], { font: 'workSans', size: h * .08, weight: 800, fill: k.b, lines: twoLines(k.title), fitW: w * .4 })}${T(w * .54, h * .5, k.subtitle, { font: 'fraunces', size: h * .028, weight: 400, fill: k.c, italic: true, fitW: w * .4 })}${T(w * .54, h * .58, 'fig. b — relation between a swatch and a fold', { font: 'spaceMono', size: h * .018, fill: k.b, tracking: .06 })}`, 'fade', { dur: k.beat, delay: k.beat * .6 })}`; },
  },

  /* ── Black Ink Barricade — flooded ink, dry-brush resistance, hand-cut blocks ── */
  'black-ink-barricade': {
    type: { display: 'bigShoulders', text: 'bitter', utility: 'spaceMono' }, idea: 'A flooded ink block with dry-brush edges, cut wood-type letters knocked out of it, and a hard title stop.', ground: 'a', surface: 'INK', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .5, s, s, orn.brushStrokePath(2), k.b)}${T(cx, cy + s * .2, 'B', { font: 'bigShoulders', size: s * .6, weight: 900, fill: k.a, anchor: 'middle' })}`,
    field: (k, x, y, w, h, i = 1) => `${P(x, y, w, h, orn.brushStrokePath(1), alpha(k.b, .85 * i))}${specks(x, y, w, h, 200 * i, alpha(k.b, .7), k.seed, .6)}`,
    opener: k => { const { w, h } = k; const ink = k.uid('ink'); k.defs.push(filters.ink(ink, .8, k.seed % 20));
      const lines = twoLines(k.title);
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 500, alpha(k.b, .5), k.seed, .6)}
        ${enter(`<g filter="url(#${ink})">${P(-w * .06, -h * .18, w * 1.12, h * 1.36, orn.brushStrokePath(1), k.b)}</g>`, 'wipeR', { dur: k.beat * .9, ease: 'in' })}
        ${enter(T(w / 2, lines.length > 1 ? h * .46 : h * .58, lines[0], { font: 'bigShoulders', size: lines.length > 1 ? h * .17 : h * .26, weight: 900, fill: k.a, anchor: 'middle', upper: true, lines, leading: .86, fitW: w * .8 }), 'fade', { dur: k.beat * .15, delay: k.beat * .9 })}
        ${enter(`${R(w * .3, h * .78, w * .4, h * .1, k.c)}${T(w / 2, h * .85, k.subtitle, { font: 'spaceMono', size: h * .03, weight: 700, fill: k.a, anchor: 'middle', tracking: .1, upper: true, fitW: w * .36 })}`, 'fade', { dur: k.beat * .15, delay: k.beat * 1.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${P(w * .02, h * .7, w * .56, h * .24, orn.brushStrokePath(3), k.b)}${T(w * .08, h * .87, k.title, { font: 'bigShoulders', size: h * .11, weight: 900, fill: k.a, upper: true, fitW: w * .3 })}${R(w * .4, h * .8, w * .12, h * .05, k.c)}${T(w * .41, h * .835, k.subtitle, { font: 'spaceMono', size: h * .02, weight: 700, fill: k.a, tracking: .06, upper: true, fitW: w * .1 })}`, 'wipeR', { dur: k.beat * .6, ease: 'in' }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['black-ink-barricade'].field(k, 0, 0, w * .55, h, 1)}${slot(k, w * .08, h * .12, w * .4, h * .7, { tone: 'dark', shape: 'path', d: orn.brushStrokePath(4), silent: true })}
        ${enter(`${T(w * .58, h * .44, twoLines(k.title)[0], { font: 'bigShoulders', size: h * .2, weight: 900, fill: k.b, upper: true, lines: twoLines(k.title), leading: .84, fitW: w * .38 })}${R(w * .58, h * .62, w * .3, h * .08, k.c)}${T(w * .6, h * .68, k.subtitle, { font: 'spaceMono', size: h * .028, weight: 700, fill: k.a, tracking: .08, upper: true, fitW: w * .26 })}${T(w * .58, h * .8, 'FLOOD · RESIST · STOP', { font: 'bitter', size: h * .024, weight: 700, fill: k.b, tracking: .2 })}`, 'fade', { dur: k.beat * .15, delay: k.beat * .4 })}`; },
  },

  /* ── Aerosol Palimpsest — successive graffiti gestures accumulate and get crossed out ── */
  'aerosol-palimpsest': {
    type: { display: 'bangers', text: 'dmSans', utility: 'permanentMarker' }, idea: 'Layers of tags accumulate: an old ghost, a crossed-out middle layer, and the fresh piece on top, drips obeying gravity.', ground: 'a', surface: 'INK', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${T(cx, cy + s * .3, 'A', { font: 'bangers', size: s, fill: k.c, anchor: 'middle', rotate: -8 })}${L(cx - s * .4, cy - s * .1, cx + s * .4, cy + s * .2, k.d, s * .08)}${T(cx + s * .1, cy + s * .45, 'A', { font: 'bangers', size: s * .8, fill: k.b, anchor: 'middle', rotate: 6 })}`,
    field: (k, x, y, w, h, i = 1) => `${T(x + w * .1, y + h * .6, 'TAG', { font: 'bangers', size: h * .5, fill: alpha(k.c, .35 * i), rotate: -6 })}${L(x + w * .1, y + h * .35, x + w * .5, y + h * .6, alpha(k.d, .8 * i), 14)}${T(x + w * .45, y + h * .8, 'TAG', { font: 'bangers', size: h * .5, fill: alpha(k.b, .9 * i), rotate: 5 })}`,
    opener: k => { const { w, h } = k; const spray = k.uid('sp'); k.defs.push(`<filter id="${spray}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".5" numOctaves="2" seed="${k.seed % 20}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="8"/><feGaussianBlur stdDeviation="1.4"/></filter>`);
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 400, alpha(k.b, .3), k.seed, .5)}
        ${enter(T(w * .12, h * .58, k.title, { font: 'bangers', size: h * .3, fill: k.c, opacity: .35, rotate: -6, fitW: w * .7 }), 'fade', { dur: k.beat * .3 })}
        ${enter(T(w * .3, h * .5, k.subtitle, { font: 'permanentMarker', size: h * .12, fill: k.d, opacity: .8, rotate: 3, fitW: w * .6 }), 'fade', { dur: k.beat * .3, delay: k.beat * .4 })}
        ${enter(L(w * .28, h * .38, w * .84, h * .56, k.b, 18), 'wipeR', { dur: k.beat * .3, delay: k.beat * .8, ease: 'in' })}
        ${enter(`<g filter="url(#${spray})">${T(w * .08, h * .82, k.title, { font: 'bangers', size: h * .26, fill: k.b, rotate: -4, fitW: w * .8, stroke: k.a, strokeWidth: 10 })}</g>`, 'wipeR', { dur: k.beat * .7, delay: k.beat * 1.1, ease: 'in' })}
        ${[.22, .42, .61].map((px, n) => enter(R(w * px, h * .84, 12, h * (.06 + n * .04), k.b, { rx: 6 }), 'growY', { dur: k.beat * (1.4 + n * .5), delay: k.beat * (1.8 + n * .2), ease: 'in', origin: [w * px, h * .84] })).join('')}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${T(w * .06, h * .9, k.title, { font: 'bangers', size: h * .14, fill: k.c, opacity: .4, rotate: -5, fitW: w * .5 })}${L(w * .05, h * .8, w * .4, h * .88, k.d, 10)}${T(w * .08, h * .87, k.title, { font: 'bangers', size: h * .1, fill: k.b, rotate: -3, fitW: w * .4, stroke: k.a, strokeWidth: 6 })}${T(w * .5, h * .84, k.subtitle, { font: 'permanentMarker', size: h * .03, fill: k.d, rotate: 3, fitW: w * .14 })}`, 'wipeR', { dur: k.beat * .6, ease: 'in' }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['aerosol-palimpsest'].field(k, 0, 0, w, h * .5, .8)}${slot(k, w * .06, h * .12, w * .46, h * .74, { tone: 'dark', rotate: -2, silent: true })}
        ${enter(`${T(w * .54, h * .5, k.title, { font: 'bangers', size: h * .18, fill: k.c, opacity: .35, rotate: -5, fitW: w * .44 })}${L(w * .55, h * .42, w * .9, h * .54, k.d, 14)}${T(w * .56, h * .62, k.title, { font: 'bangers', size: h * .14, fill: k.b, rotate: -3, fitW: w * .4, stroke: k.a, strokeWidth: 8 })}${T(w * .56, h * .74, k.subtitle, { font: 'permanentMarker', size: h * .04, fill: k.d, rotate: 2, fitW: w * .38 })}`, 'wipeR', { dur: k.beat * .6, ease: 'in' })}`; },
  },

  /* ── Wheatpaste City — layered posters, paste wrinkles, ripped faces, municipal surfaces ── */
  'wheatpaste-city': {
    type: { display: 'anton', text: 'karla', utility: 'caveat' }, idea: 'A wall of pasted posters: the newest slaps down over torn older ones whose fragments still show through.', ground: 'a', surface: 'PAPER', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s * .8, s * .9, k.c, { rotate: -6 })}${P(cx - s * .3, cy - s * .4, s * .8, s * .9, orn.tornEdgePath(3, 20), k.b, { rotate: 4 })}`,
    field: (k, x, y, w, h, i = 1) => `${[[.05, .1, -5, k.c], [.35, .2, 3, k.d], [.6, .05, -2, k.b]].map(([px, py, rot, col]) => P(x + w * (px as number), y + h * (py as number), w * .3, h * .7, orn.tornEdgePath(3, 18), alpha(col as string, .85 * i), { rotate: rot as number })).join('')}`,
    opener: k => { const { w, h } = k; const shadow = k.uid('sd'); k.defs.push(filters.softShadow(shadow, 6, 8, .3));
      const poster = (x: number, y: number, pw: number, ph: number, rot: number, col: string, inner: string, delay: number, type: 'slideD' | 'fade') => enter(`<g filter="url(#${shadow})">${P(x, y, pw, ph, orn.tornEdgePath((x / 37) | 0, 14), col, { rotate: rot })}</g>${inner}`, type, { dur: k.beat * .5, delay, ease: 'in', amount: 1 });
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 500, alpha(k.b, .35), k.seed, .5)}
        ${poster(w * .04, h * .06, w * .4, h * .7, -4, k.c, T(w * .1, h * .4, 'OLD', { font: 'anton', size: h * .22, fill: alpha(k.a, .7), rotate: -4 }), 0, 'fade')}
        ${poster(w * .5, h * .12, w * .44, h * .6, 3, k.d, T(w * .56, h * .5, 'SHOW', { font: 'anton', size: h * .2, fill: alpha(k.a, .7), rotate: 3 }), k.beat * .2, 'fade')}
        ${poster(w * .2, h * .26, w * .58, h * .66, -2, k.b, `${T(w * .25, h * .58, k.title, { font: 'anton', size: h * .16, fill: mix(k.a, -.75), upper: true, rotate: -2, fitW: w * .5 })}${T(w * .26, h * .7, k.subtitle, { font: 'karla', size: h * .036, weight: 700, fill: mix(k.a, -.6), upper: true, rotate: -2, fitW: w * .48 })}${T(w * .28, h * .82, 'tonight — replaceable', { font: 'caveat', size: h * .05, weight: 700, fill: k.c, rotate: -2 })}`, k.beat * .7, 'slideD')}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${P(w * .03, h * .7, w * .2, h * .26, orn.tornEdgePath(2, 20), k.c, { rotate: -5 })}${P(w * .08, h * .72, w * .48, h * .2, orn.tornEdgePath(5, 16), k.b, { rotate: -1 })}
        ${T(w * .12, h * .86, k.title, { font: 'anton', size: h * .08, fill: mix(k.a, -.75), upper: true, rotate: -1, fitW: w * .3 })}${T(w * .44, h * .86, k.subtitle, { font: 'caveat', size: h * .036, weight: 700, fill: k.d, rotate: -1, fitW: w * .1 })}`, 'slideD', { dur: k.beat * .45, ease: 'in', amount: 1.2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['wheatpaste-city'].field(k, 0, 0, w, h, .7)}${P(w * .04, h * .06, w * .46, h * .84, orn.tornEdgePath(4, 10), k.b, { rotate: -2 })}${slot(k, w * .08, h * .16, w * .38, h * .6, { tone: 'light', rotate: -2, silent: true })}
        ${enter(`${P(w * .52, h * .22, w * .44, h * .56, orn.tornEdgePath(7, 12), k.d, { rotate: 2 })}${T(w * .56, h * .5, twoLines(k.title)[0], { font: 'anton', size: h * .13, fill: k.b, upper: true, rotate: 2, lines: twoLines(k.title), leading: .9, fitW: w * .36 })}${T(w * .56, h * .66, k.subtitle, { font: 'karla', size: h * .03, weight: 700, fill: k.b, upper: true, rotate: 2, fitW: w * .36 })}`, 'slideD', { dur: k.beat * .5, ease: 'in', amount: 1 })}`; },
  },

  /* ── Marker Riot — permanent-marker drawings argue directly with the image ── */
  'marker-riot': {
    type: { display: 'kalam', text: 'archivo', utility: 'patrickHand' }, idea: 'Fast marker lines circle, underline, arrow and annotate the photograph at human drawing speed.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${E(cx, cy, s * .46, s * .36, 'none', { stroke: k.c, sw: s * .07 })}${D(`M${cx - s * .5} ${cy + s * .5}L${cx + s * .2} ${cy}`, 'none', { stroke: k.b, sw: s * .06 })}${PolyG([[cx + s * .2, cy], [cx + s * .02, cy + s * .02], [cx + s * .12, cy - s * .16]], k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${E(x + w * .3, y + h * .4, w * .16, h * .22, 'none', { stroke: alpha(k.c, .9 * i), sw: 8 })}${D(`M${x + w * .1} ${y + h * .8}Q${x + w * .5} ${y + h * .95} ${x + w * .9} ${y + h * .7}`, 'none', { stroke: alpha(k.b, .9 * i), sw: 8 })}${D(`M${x + w * .6} ${y + h * .2}L${x + w * .75} ${y + h * .45}`, 'none', { stroke: alpha(k.d, .9 * i), sw: 7 })}`,
    opener: k => { const { w, h } = k;
      const draw = (d: string, col: string, sw: number, dur: number, delay: number) => enter(D(d, 'none', { stroke: col, sw }), 'draw', { dur: k.beat * dur, delay: k.beat * delay, ease: 'inOut' });
      return `${R(0, 0, w, h, k.a)}${enter(slot(k, w * .14, h * .1, w * .5, h * .7, { tone: 'light', silent: true }), 'fade', { dur: k.beat * .6 })}
        ${draw(`M${w * .28} ${h * .32}C${w * .2} ${h * .18} ${w * .52} ${h * .12} ${w * .5} ${h * .34}C${w * .48} ${h * .5} ${w * .22} ${h * .5} ${w * .28} ${h * .32}`, k.c, 12, 1, .6)}
        ${draw(`M${w * .7} ${h * .2}Q${w * .6} ${h * .3} ${w * .52} ${h * .34}`, k.b, 9, .6, 1.5)}${enter(PolyG([[w * .52, h * .34], [w * .58, h * .3], [w * .57, h * .37]], k.b), 'pop', { dur: k.beat * .2, delay: k.beat * 2, ease: 'back', origin: [w * .52, h * .34] })}
        ${enter(T(w * .7, h * .18, 'this one.', { font: 'kalam', size: h * .07, weight: 700, fill: k.b, rotate: -4 }), 'fade', { dur: k.beat * .3, delay: k.beat * 2 })}
        ${draw(`M${w * .12} ${h * .86}Q${w * .4} ${h * .94} ${w * .7} ${h * .84}`, k.d, 10, .7, 2.3)}
        ${enter(`${T(w * .12, h * .84, k.title, { font: 'kalam', size: h * .09, weight: 700, fill: k.b, fitW: w * .56 })}${T(w * .72, h * .9, k.subtitle, { font: 'patrickHand', size: h * .034, fill: k.c, rotate: 3, fitW: w * .24 })}`, 'fade', { dur: k.beat * .4, delay: k.beat * 2.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .76, w * .46, h * .14, k.a, { rotate: -1 })}${E(w * .11, h * .83, h * .07, h * .05, 'none', { stroke: k.c, sw: 7 })}${D(`M${w * .16} ${h * .9}Q${w * .3} ${h * .94} ${w * .5} ${h * .88}`, 'none', { stroke: k.d, sw: 7 })}
        ${T(w * .18, h * .85, k.title, { font: 'kalam', size: h * .066, weight: 700, fill: k.b, rotate: -1, fitW: w * .3 })}${T(w * .5, h * .8, k.subtitle, { font: 'patrickHand', size: h * .03, fill: k.c, anchor: 'end', rotate: 3, fitW: w * .14 })}`, 'fade', { dur: k.beat * .3 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${slot(k, w * .06, h * .1, w * .46, h * .74, { tone: 'light', silent: true })}${COUNTERCULTURE_DESIGNS['marker-riot'].field(k, w * .02, h * .06, w * .54, h * .84, 1)}
        ${enter(`${T(w * .56, h * .4, twoLines(k.title)[0], { font: 'kalam', size: h * .1, weight: 700, fill: k.b, rotate: -2, lines: twoLines(k.title), fitW: w * .4 })}${D(`M${w * .56} ${h * .58}Q${w * .75} ${h * .64} ${w * .94} ${h * .56}`, 'none', { stroke: k.d, sw: 9 })}${T(w * .56, h * .7, k.subtitle, { font: 'patrickHand', size: h * .036, fill: k.c, fitW: w * .4 })}${T(w * .6, h * .82, '← look here', { font: 'kalam', size: h * .05, weight: 700, fill: k.b, rotate: -3 })}`, 'fade', { dur: k.beat * .4, delay: k.beat * .6 })}`; },
  },

  /* ── Toner Avalanche — overexposed photocopies, crushed blacks, cascading paper ── */
  'toner-avalanche': {
    type: { display: 'archivoBlack', text: 'courierPrime', utility: 'courierPrime' }, idea: 'Copies of a copy: the same sheet enlarged generation by generation until toner noise consumes the edges.', ground: 'a', surface: 'SCAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${[0, 1, 2].map(n => R(cx - s * .5 + n * s * .12, cy - s * .5 + n * s * .12, s * .7, s * .7, n === 2 ? k.b : alpha(k.b, .3 + n * .2), { rotate: -6 + n * 4 })).join('')}${T(cx + s * .1, cy + s * .3, 'T', { font: 'archivoBlack', size: s * .5, fill: k.a, anchor: 'middle', rotate: 2 })}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3].map(n => R(x + w * .1 + n * w * .1, y + h * .1 + n * h * .08, w * .5, h * .6, alpha(k.b, (.15 + n * .15) * i), { rotate: -4 + n * 2 })).join('')}${specks(x, y, w, h, 300 * i, alpha(k.b, .8), k.seed, .6)}`,
    opener: k => { const { w, h } = k; const xer = k.uid('xr'); k.defs.push(filters.xerox(xer, .9, k.seed % 20));
      const sheet = (n: number) => enter(`<g filter="url(#${xer})">${R(w * .12 + n * w * .07, h * .1 + n * h * .06, w * .5, h * .62, n === 3 ? k.b : mix(k.b, .35 - n * .1), { rotate: -5 + n * 3 })}${T(w * .16 + n * w * .07, h * .46 + n * h * .06, k.title, { font: 'archivoBlack', size: h * (.1 + n * .03), fill: n === 3 ? k.a : alpha(k.a, .5), upper: true, rotate: -5 + n * 3, fitW: w * .44 })}</g>`, 'pop', { dur: k.beat * .25, delay: k.beat * .3 * n, ease: 'expo', amount: .5, origin: [w * .37 + n * w * .07, h * .41 + n * h * .06] });
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 1200, alpha(k.b, .45), k.seed, .55)}${[0, 1, 2, 3].map(sheet).join('')}
        ${enter(`${R(w * .06, h * .84, w * .6, h * .08, k.b)}${T(w * .08, h * .9, `GEN 4 · ${k.subtitle}`, { font: 'courierPrime', size: h * .036, weight: 700, fill: k.a, upper: true, fitW: w * .56 })}`, 'fade', { dur: k.beat * .15, delay: k.beat * 1.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${[0, 1, 2].map(n => R(w * .05 + n * 14, h * .75 + n * 8, w * .46, h * .13, n === 2 ? k.b : alpha(k.b, .3 + n * .2), { rotate: -2 + n })).join('')}
        ${T(w * .1, h * .87, k.title, { font: 'archivoBlack', size: h * .06, fill: k.a, upper: true, fitW: w * .3 })}${T(w * .42, h * .87, k.subtitle, { font: 'courierPrime', size: h * .024, weight: 700, fill: k.a, upper: true, fitW: w * .1 })}`, 'pop', { dur: k.beat * .25, amount: .5, ease: 'expo', origin: [w * .3, h * .83] }); },
    fullPage: k => { const { w, h } = k; const xer = k.uid('xr'); k.defs.push(filters.xerox(xer, .8, k.seed % 20));
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 1000, alpha(k.b, .4), k.seed + 2, .5)}${COUNTERCULTURE_DESIGNS['toner-avalanche'].field(k, w * .45, 0, w * .55, h, .5)}<g filter="url(#${xer})">${slot(k, w * .08, h * .1, w * .42, h * .68, { tone: 'light', rotate: -3, silent: true })}</g>
        ${enter(`${R(w * .54, h * .3, w * .4, h * .3, k.b, { rotate: 2 })}${T(w * .56, h * .45, twoLines(k.title)[0], { font: 'archivoBlack', size: h * .09, fill: k.a, upper: true, rotate: 2, lines: twoLines(k.title), leading: .95, fitW: w * .36 })}${T(w * .55, h * .7, `GEN 4 · ${k.subtitle}`, { font: 'courierPrime', size: h * .03, weight: 700, fill: k.b, upper: true, fitW: w * .4 })}`, 'pop', { dur: k.beat * .25, amount: .5, ease: 'expo', origin: [w * .74, h * .45] })}`; },
  },

  /* ── Rust & Noise — corroded metal, paint chips, industrial stamping, grime that shakes ── */
  'rust-and-noise': {
    type: { display: 'rubikMono', text: 'zilla', utility: 'spaceMono' }, idea: 'Stamped industrial plates on corroded metal; the oxide creeps in from the edges and only loose grime shakes.', ground: 'a', surface: 'GRAIN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s, s, k.b, { rx: s * .06 })}${[[-.38, -.38], [.38, -.38], [-.38, .38], [.38, .38]].map(([ox, oy]) => C(cx + ox * s, cy + oy * s, s * .05, k.a)).join('')}${T(cx, cy + s * .14, 'R', { font: 'rubikMono', size: s * .44, fill: k.a, anchor: 'middle' })}`,
    field: (k, x, y, w, h, i = 1) => `${specks(x, y, w, h, 500 * i, alpha(k.c, .7), k.seed, .55)}${specks(x, y, w, h * .3, 200 * i, alpha(k.d, .7), k.seed + 5, .6)}${R(x + w * .2, y + h * .3, w * .6, h * .4, 'none', { stroke: alpha(k.b, .8 * i), sw: 8, rx: 10 })}`,
    opener: k => { const { w, h } = k; const rust = k.uid('rs'); k.defs.push(`<filter id="${rust}"><feTurbulence type="fractalNoise" baseFrequency=".02 .05" numOctaves="4" seed="${k.seed % 20}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .55 0 0 0 0 .25 0 0 0 0 .08 0 0 0 .9 -.35" result="rust"/><feComposite in="rust" in2="SourceGraphic" operator="over"/></filter>`);
      return `${R(0, 0, w, h, k.a)}<g filter="url(#${rust})">${R(0, 0, w, h, k.a)}</g>${specks(0, 0, w, h, 900, alpha(k.c, .6), k.seed, .5)}
        ${enter(`${R(w * .1, h * .22, w * .8, h * .56, k.b, { rx: 14 })}${[[.12, .25], [.88, .25], [.12, .75], [.88, .75]].map(([px, py]) => C(w * px, h * py, 14, k.a)).join('')}${R(w * .1, h * .22, w * .8, h * .56, 'none', { stroke: alpha(k.a, .6), sw: 6, rx: 14 })}`, 'drop', { dur: k.beat * .3, ease: 'in', amount: 1 })}
        ${enter(`${T(w / 2, h * .5, k.title, { font: 'rubikMono', size: h * .12, fill: k.a, anchor: 'middle', upper: true, fitW: w * .7 })}`, 'pop', { dur: k.beat * .2, delay: k.beat * .4, ease: 'expo', amount: .3, origin: [w / 2, h * .48] })}
        ${enter(`${R(w * .3, h * .58, w * .4, h * .1, alpha(k.a, .85), { rx: 6 })}${T(w / 2, h * .65, k.subtitle, { font: 'spaceMono', size: h * .03, weight: 700, fill: k.b, anchor: 'middle', tracking: .18, upper: true, fitW: w * .36 })}`, 'pop', { dur: k.beat * .2, delay: k.beat * .8, ease: 'expo', amount: .3, origin: [w / 2, h * .63] })}
        ${drift(specks(0, 0, w, h, 260, alpha(k.d, .9), k.seed + 9, .6), 8, -6, .3)}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .75, w * .48, h * .15, k.b, { rx: 10 })}${[[.06, .77], [.52, .77], [.06, .88], [.52, .88]].map(([px, py]) => C(w * px, h * py, 8, k.a)).join('')}${specks(w * .05, h * .75, w * .48, h * .15, 120, alpha(k.c, .7), k.seed, .5)}
        ${T(w * .1, h * .83, k.title, { font: 'rubikMono', size: h * .048, fill: k.a, upper: true, fitW: w * .3 })}${T(w * .1, h * .87, k.subtitle, { font: 'spaceMono', size: h * .02, weight: 700, fill: k.a, tracking: .16, upper: true, fitW: w * .38 })}`, 'drop', { dur: k.beat * .3, ease: 'in', amount: .8 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${COUNTERCULTURE_DESIGNS['rust-and-noise'].field(k, 0, 0, w, h, .7)}${R(w * .06, h * .1, w * .46, h * .8, k.b, { rx: 14 })}${slot(k, w * .09, h * .14, w * .4, h * .72, { tone: 'dark', silent: true })}${[[.07, .12], [.51, .12], [.07, .88], [.51, .88]].map(([px, py]) => C(w * px, h * py, 12, k.a)).join('')}
        ${enter(`${R(w * .56, h * .3, w * .38, h * .4, k.b, { rx: 14 })}${T(w * .59, h * .46, twoLines(k.title)[0], { font: 'rubikMono', size: h * .07, fill: k.a, upper: true, lines: twoLines(k.title), leading: 1.05, fitW: w * .32 })}${T(w * .59, h * .64, k.subtitle, { font: 'zilla', size: h * .026, weight: 700, fill: k.a, fitW: w * .32 })}${T(w * .56, h * .8, 'STAMPED · OFF-REGISTER · REPLACEABLE', { font: 'spaceMono', size: h * .02, weight: 700, fill: k.d, tracking: .16 })}`, 'drop', { dur: k.beat * .3, ease: 'in', amount: .8 })}`; },
  },
};
