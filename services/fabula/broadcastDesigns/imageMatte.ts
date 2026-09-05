// imageMatte — eighteen systems built around the user's own footage.
//
// The picture is the subject here, so every identity is an argument about how a photograph
// enters a frame: an aperture, a torn edge, a halo, a contact sheet, a film gate. The image
// well is drawn the way a comp draws it; supplied footage takes the same mask and treatment.
import * as orn from '../../tela/ornaments';
import { type Ctx, C, D, E, L, P, PolyG, R, T, checker, dots, drift, enter, gradient, mix, alpha, perspectiveGrid, pulse, radial, rings, rotateLoop, slot, stripes, specks, twoLines, halftone, filters, isDark } from './kit';
import type { BroadcastDesign } from './types';

const lt = (k: Ctx, inner: string, type: Parameters<typeof enter>[1], o: Parameters<typeof enter>[2] = {}) => enter(inner, type, { dur: k.beat * 1.2, ease: 'expo', loop: k.total, outDur: k.beat * .7, ...o });

export const IMAGE_MATTE_DESIGNS: Record<string, BroadcastDesign> = {

  /* ── Editorial Window — modular apertures crop, pan, and hand off focus ── */
  'editorial-window': {
    type: { display: 'fraunces', text: 'workSans', utility: 'dmMono' }, idea: 'A magazine grid of apertures: one large, two small, hairline gutters; focus hands off from window to window.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s * .62, s, 'none', { stroke: k.b, sw: s * .03 })}${R(cx + s * .18, cy - s * .5, s * .32, s * .46, 'none', { stroke: k.b, sw: s * .03 })}${R(cx + s * .18, cy + s * .04, s * .32, s * .46, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${[[0, 0, .6, 1], [.62, 0, .38, .48], [.62, .52, .38, .48]].map(([px, py, pw, ph], n) => R(x + w * px + 8, y + h * py + 8, w * pw - 16, h * ph - 16, 'none', { stroke: alpha(k.b, .6 * i), sw: 2 })).join('')}`,
    opener: k => { const { w, h } = k;
      const win = (x: number, y: number, ww: number, hh: number, delay: number, cap: string) => enter(`${slot(k, x, y, ww, hh, { tone: 'light', caption: cap })}${R(x, y, ww, hh, 'none', { stroke: k.b, sw: 2 })}`, 'fade', { dur: k.beat * 1.4, delay });
      return `${R(0, 0, w, h, k.a)}${win(w * .06, h * .08, w * .52, h * .84, 0, 'Lead image')}${win(w * .61, h * .08, w * .33, h * .4, k.beat * .5, 'Detail')}${win(w * .61, h * .52, w * .33, h * .4, k.beat * .9, 'Detail')}
        ${enter(`${R(w * .06, h * .62, w * .36, h * .3, k.a)}${T(w * .08, h * .72, k.eyebrow, { font: 'dmMono', size: h * .018, weight: 500, fill: k.c, tracking: .2, upper: true })}${T(w * .08, h * .8, k.title, { font: 'fraunces', size: h * .06, weight: 600, fill: k.b, fitW: w * .32 })}${T(w * .08, h * .86, k.subtitle, { font: 'workSans', size: h * .022, weight: 400, fill: k.b, fitW: w * .32 })}`, 'slideU', { dur: k.beat * 1.4, delay: k.beat * 1.4, ease: 'expo' })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .74, w * .48, h * .16, k.a)}${R(w * .05, h * .74, w * .48, h * .16, 'none', { stroke: k.b, sw: 2 })}${slot(k, w * .05, h * .74, h * .16, h * .16, { tone: 'light', silent: true })}${L(w * .05 + h * .16, h * .74, w * .05 + h * .16, h * .9, k.b, 2)}
        ${T(w * .05 + h * .19, h * .815, k.title, { font: 'fraunces', size: h * .05, weight: 600, fill: k.b, fitW: w * .3 })}${T(w * .05 + h * .19, h * .86, k.subtitle, { font: 'workSans', size: h * .021, weight: 400, fill: k.c, fitW: w * .3 })}`, 'wipeR', { dur: k.beat }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${slot(k, w * .06, h * .08, w * .38, h * .84, { tone: 'light' })}${slot(k, w * .46, h * .08, w * .22, h * .4, { tone: 'light' })}${slot(k, w * .46, h * .52, w * .22, h * .4, { tone: 'light' })}${[[.06, .08, .38, .84], [.46, .08, .22, .4], [.46, .52, .22, .4]].map(([px, py, pw, ph]) => R(w * px, h * py, w * pw, h * ph, 'none', { stroke: k.b, sw: 2 })).join('')}
        ${enter(`${T(w * .72, h * .28, twoLines(k.title)[0], { font: 'fraunces', size: h * .06, weight: 600, fill: k.b, lines: twoLines(k.title), fitW: w * .22 })}${T(w * .72, h * .44, k.subtitle, { font: 'workSans', size: h * .022, weight: 400, fill: k.c, fitW: w * .22 })}${[0, 1, 2, 3, 4, 5].map(n => R(w * .72, h * (.52 + n * .034), w * (.2 - (n % 3) * .03), 3, alpha(k.b, .35))).join('')}${T(w * .72, h * .9, 'FIG. 01 — REPLACEABLE CAPTION', { font: 'dmMono', size: h * .016, weight: 500, fill: k.c, tracking: .12 })}`, 'fade', { dur: k.beat * 1.4, delay: k.beat })}`; },
  },

  /* ── Paper Rip Reveal — a torn edge reveals the subject without hiding the face ── */
  'paper-rip-reveal': {
    type: { display: 'archivoBlack', text: 'karla', utility: 'specialElite' }, idea: 'A sheet of paper tears diagonally to reveal the subject; the fibre edge has weight and the face is never covered.', ground: 'a', surface: 'PAPER', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .5, s, s, orn.tornEdgePath(k.seed % 9, 20), k.b)}${R(cx - s * .5, cy - s * .5, s, s * .2, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${P(x, y + h * .3, w, h * .7, orn.tornEdgePath(3, 14), alpha(k.b, .8 * i))}${specks(x, y, w, h, 120 * i, alpha(k.d, .6), k.seed, .5)}`,
    opener: k => { const { w, h } = k; const shadow = k.uid('sd'); k.defs.push(filters.softShadow(shadow, 10, 14, .3));
      return `${R(0, 0, w, h, k.a)}${slot(k, 0, 0, w, h, { tone: 'light', silent: true })}
        ${enter(`<g filter="url(#${shadow})">${P(-w * .05, -h * .1, w * 1.1, h * 1.3, orn.tornEdgePath(k.seed % 7, 9), k.b, { rotate: -14 })}</g>`, 'slideD', { dur: k.beat * 1.6, ease: 'expo', amount: -6 })}
        ${enter(`${T(w * .08, h * .78, k.title, { font: 'archivoBlack', size: h * .12, fill: k.a, upper: true, fitW: w * .5 })}${T(w * .08, h * .86, k.subtitle, { font: 'specialElite', size: h * .026, fill: k.c, fitW: w * .5 })}${R(w * .08, h * .66, w * .12, 8, k.d)}`, 'fade', { dur: k.beat, delay: k.beat * 1.6 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${P(w * .03, h * .72, w * .52, h * .22, orn.tornEdgePath(5, 22), k.b, { rotate: -1.5 })}${R(w * .06, h * .87, w * .1, 6, k.d)}
        ${T(w * .07, h * .845, k.title, { font: 'archivoBlack', size: h * .058, fill: k.a, upper: true, fitW: w * .42 })}${T(w * .07, h * .915, k.subtitle, { font: 'specialElite', size: h * .022, fill: k.c, fitW: w * .42 })}`, 'slideD', { dur: k.beat, amount: 1.4 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.b)}${slot(k, w * .5, 0, w * .5, h, { tone: 'light', silent: true })}${P(w * .38, -h * .05, w * .3, h * 1.1, orn.tornEdgePath(2, 16), k.b, { rotate: 90 })}${specks(0, 0, w * .5, h, 200, alpha(k.d, .4), k.seed, .5)}
        ${enter(`${T(w * .06, h * .4, twoLines(k.title)[0], { font: 'archivoBlack', size: h * .1, fill: k.a, upper: true, lines: twoLines(k.title), leading: .95, fitW: w * .38 })}${R(w * .06, h * .62, w * .1, 8, k.d)}${T(w * .06, h * .7, k.subtitle, { font: 'karla', size: h * .026, weight: 400, fill: k.a, fitW: w * .38 })}${T(w * .06, h * .9, 'TORN · REPLACEABLE CAPTION', { font: 'specialElite', size: h * .018, fill: k.c })}`, 'fade', { dur: k.beat * 1.2, delay: k.beat * .6 })}`; },
  },

  /* ── Silhouette Halo — layered colour planes orbit behind a rotoscoped subject ── */
  'silhouette-halo': {
    type: { display: 'righteous', text: 'nunito', utility: 'spaceMono' }, idea: 'Three offset halo discs breathe behind a cut-out figure; the subject is a silhouette until the light resolves.', ground: 'a', surface: 'GLOW',
    mark: (k, cx, cy, s) => `${C(cx - s * .1, cy - s * .08, s * .42, k.c, { opacity: .8 })}${C(cx + s * .1, cy + s * .08, s * .42, k.d, { opacity: .8, blend: 'screen' })}${E(cx, cy + s * .2, s * .16, s * .3, k.a)}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2].map(n => C(x + w * (.3 + n * .2), y + h * .5, h * .35, n % 2 ? alpha(k.c, .4 * i) : alpha(k.d, .4 * i), { blend: 'screen' })).join('')}`,
    opener: k => { const { w, h } = k;
      const halo = (dx: number, dy: number, col: string, dur: number, delay: number) => enter(drift(C(w / 2 + dx, h * .48 + dy, h * .34, col, { opacity: .85, blend: 'screen' }), -dx * .6, -dy * .6, k.beat * dur), 'pop', { dur: k.beat * 1.4, delay, ease: 'expo', origin: [w / 2, h * .48] });
      return `${R(0, 0, w, h, k.a)}${halo(-70, -30, k.c, 9, 0)}${halo(70, 30, k.d, 11, k.beat * .3)}${halo(0, 60, mix(k.c, .3), 13, k.beat * .6)}
        ${enter(slot(k, w / 2 - h * .2, h * .2, h * .4, h * .64, { tone: 'dark', shape: 'path', d: 'M50 0C72 0 84 16 84 34C84 48 76 56 70 60C88 66 100 80 100 100L0 100C0 80 12 66 30 60C24 56 16 48 16 34C16 16 28 0 50 0Z', silent: true }), 'fade', { dur: k.beat * 1.6, delay: k.beat * .8 })}
        ${enter(`${T(w / 2, h * .9, k.title, { font: 'righteous', size: h * .07, fill: k.b, anchor: 'middle', fitW: w * .7 })}${T(w / 2, h * .95, k.subtitle, { font: 'spaceMono', size: h * .02, weight: 700, fill: k.c, anchor: 'middle', tracking: .18, upper: true, fitW: w * .6 })}`, 'slideU', { dur: k.beat * 1.2, delay: k.beat * 1.8, ease: 'expo' })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${C(w * .1, h * .82, h * .08, k.c, { opacity: .9, blend: 'screen' })}${C(w * .13, h * .84, h * .08, k.d, { opacity: .9, blend: 'screen' })}${R(w * .19, h * .76, w * .36, h * .12, alpha(k.a, .85), { rx: 24 })}
        ${T(w * .21, h * .815, k.title, { font: 'righteous', size: h * .046, fill: k.b, fitW: w * .32 })}${T(w * .21, h * .855, k.subtitle, { font: 'nunito', size: h * .021, weight: 600, fill: k.c, fitW: w * .32 })}`, 'pop', { origin: [w * .12, h * .82], amount: .6 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${C(w * .3, h * .5, h * .4, k.c, { opacity: .8, blend: 'screen' })}${C(w * .36, h * .54, h * .4, k.d, { opacity: .8, blend: 'screen' })}${slot(k, w * .33 - h * .2, h * .18, h * .4, h * .64, { tone: 'dark', shape: 'path', d: 'M50 0C72 0 84 16 84 34C84 48 76 56 70 60C88 66 100 80 100 100L0 100C0 80 12 66 30 60C24 56 16 48 16 34C16 16 28 0 50 0Z', silent: true })}
        ${enter(`${T(w * .6, h * .4, twoLines(k.title)[0], { font: 'righteous', size: h * .08, fill: k.b, lines: twoLines(k.title), fitW: w * .34 })}${T(w * .6, h * .58, k.subtitle, { font: 'nunito', size: h * .024, weight: 600, fill: k.c, fitW: w * .34 })}${[0, 1, 2].map(n => R(w * .6, h * (.66 + n * .04), w * (.28 - (n % 2) * .06), 5, alpha(k.d, .5), { rx: 3 })).join('')}`, 'fade', { dur: k.beat * 1.4, delay: k.beat })}`; },
  },

  /* ── Contact Sheet Motion — frames advance through a loupe ── */
  'contact-sheet-motion': {
    type: { display: 'spaceMono', text: 'crimson', utility: 'spaceMono' }, idea: 'A photographer\'s contact sheet: sprocket-edged frames in a grid, one selected with a grease-pencil loupe mark.', ground: 'a', surface: 'GRAIN',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .36, s, s * .72, k.b)}${[0, 1, 2, 3, 4].map(n => `${R(cx - s * .44 + n * s * .2, cy - s * .32, s * .08, s * .06, k.a)}${R(cx - s * .44 + n * s * .2, cy + s * .26, s * .08, s * .06, k.a)}`).join('')}${R(cx - s * .38, cy - s * .2, s * .76, s * .4, k.c)}`,
    field: (k, x, y, w, h, i = 1) => { const out: string[] = []; const fw = 150, fh = 100; for (let j = 0; j * fh < h; j++) for (let n = 0; n * fw < w; n++) out.push(R(x + n * fw + 8, y + j * fh + 8, fw - 16, fh - 16, alpha(k.b, .25 * i), { stroke: alpha(k.b, .5 * i), sw: 1 })); return out.join(''); },
    opener: k => { const { w, h } = k; const fw = w * .19, fh = h * .2;
      const frames: string[] = []; let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) { const x = w * .03 + i * fw, y = h * .06 + j * fh; const sel = j === 1 && i === 2; frames.push(enter(`${R(x + 6, y + 6, fw - 12, fh - 12, k.b)}${[0, 1, 2, 3, 4, 5].map(t => `${R(x + 14 + t * (fw - 28) / 6, y + 8, 12, 8, k.a)}${R(x + 14 + t * (fw - 28) / 6, y + fh - 16, 12, 8, k.a)}`).join('')}${slot(k, x + 12, y + 20, fw - 24, fh - 40, { tone: 'dark', silent: true })}${T(x + 14, y + fh - 4, String(n + 1).padStart(2, '0'), { font: 'spaceMono', size: 13, weight: 700, fill: k.c })}${sel ? `${R(x + 4, y + 4, fw - 8, fh - 8, 'none', { stroke: k.d, sw: 5 })}${C(x + fw - 26, y + 26, 12, k.d)}` : ''}`, 'fade', { dur: k.beat * .3, delay: k.beat * .08 * n++ })); }
      return `${R(0, 0, w, h, k.a)}${frames.join('')}
        ${enter(`${R(w * .03, h * .86, w * .6, h * .11, k.d)}${T(w * .05, h * .915, k.title, { font: 'spaceMono', size: h * .044, weight: 700, fill: k.a, fitW: w * .56 })}${T(w * .05, h * .95, k.subtitle, { font: 'crimson', size: h * .024, weight: 400, fill: k.a, italic: true, fitW: w * .56 })}`, 'slideL', { dur: k.beat, delay: k.beat * 1.8, ease: 'expo', amount: 1.5 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .74, w * .5, h * .16, k.b)}${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(t => `${R(w * .06 + t * 38, h * .75, 18, 10, k.a)}${R(w * .06 + t * 38, h * .88, 18, 10, k.a)}`).join('')}${R(w * .06, h * .77, h * .1, h * .1, k.d)}
        ${T(w * .06 + h * .12, h * .82, k.title, { font: 'spaceMono', size: h * .044, weight: 700, fill: k.a, fitW: w * .34 })}${T(w * .06 + h * .12, h * .86, k.subtitle, { font: 'crimson', size: h * .024, weight: 400, fill: k.c, italic: true, fitW: w * .34 })}`, 'slideL', { amount: 1.6 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['contact-sheet-motion'].field(k, 0, 0, w, h * .5, .6)}${R(w * .06, h * .12, w * .5, h * .76, k.b)}${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => `${R(w * .07 + t * (w * .48 / 10), h * .13, 24, 14, k.a)}${R(w * .07 + t * (w * .48 / 10), h * .855, 24, 14, k.a)}`).join('')}${slot(k, w * .08, h * .17, w * .46, h * .66, { tone: 'dark' })}${C(w * .52, h * .2, 18, k.d)}
        ${enter(`${T(w * .6, h * .34, twoLines(k.title)[0], { font: 'spaceMono', size: h * .05, weight: 700, fill: k.b, lines: twoLines(k.title), fitW: w * .34 })}${T(w * .6, h * .5, k.subtitle, { font: 'crimson', size: h * .028, weight: 400, fill: k.c, italic: true, fitW: w * .34 })}${['ROLL 07 · FRAME 12', 'ISO 400 · f/2.8 · 1/250', 'SELECT · PRINT · REPLACEABLE'].map((l, n) => T(w * .6, h * (.6 + n * .05), l, { font: 'spaceMono', size: h * .018, weight: 700, fill: n === 2 ? k.d : k.c, tracking: .08 })).join('')}`, 'fade', { dur: k.beat * 1.4, delay: k.beat })}`; },
  },

  /* ── Instant Print Constellation — prints drift into a spatial story map ── */
  'polaroid-constellation': {
    type: { display: 'caveat', text: 'lora', utility: 'patrickHand' }, idea: 'Instant prints with white borders spring into weighted positions and get connected by hand-drawn lines and captions.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${R(cx - s * .4, cy - s * .48, s * .8, s * .96, k.paper, { rotate: -6 })}${R(cx - s * .33, cy - s * .41, s * .66, s * .62, k.c, { rotate: -6 })}`,
    field: (k, x, y, w, h, i = 1) => `${[[.1, .2, -8], [.45, .5, 5], [.75, .25, -3]].map(([px, py, rot]) => `${R(x + w * px, y + h * py, w * .2, h * .3, k.paper, { rotate: rot, opacity: .9 * i })}${R(x + w * px + w * .015, y + h * py + h * .02, w * .17, h * .2, alpha(k.b, .5), { rotate: rot })}`).join('')}${D(`M${x + w * .2} ${y + h * .35}L${x + w * .55} ${y + h * .65}L${x + w * .85} ${y + h * .4}`, 'none', { stroke: alpha(k.d, .8 * i), sw: 3, dash: '8 8' })}`,
    opener: k => { const { w, h } = k; const shadow = k.uid('sd'); k.defs.push(filters.softShadow(shadow, 8, 10, .25));
      const prints: Array<[number, number, number, string]> = [[w * .12, h * .16, -7, 'day one'], [w * .42, h * .42, 4, 'the corner shop'], [w * .7, h * .12, -3, 'her'], [w * .62, h * .56, 6, 'last light']];
      const pw = w * .2, ph = h * .34;
      return `${R(0, 0, w, h, k.a)}${enter(D(`M${prints[0][0] + pw / 2} ${prints[0][1] + ph / 2}L${prints[1][0] + pw / 2} ${prints[1][1] + ph / 2}L${prints[2][0] + pw / 2} ${prints[2][1] + ph / 2}L${prints[3][0] + pw / 2} ${prints[3][1] + ph / 2}`, 'none', { stroke: k.d, sw: 3, dash: '10 10' }), 'draw', { dur: k.beat * 2.4, delay: k.beat * 1.6, ease: 'inOut' })}
        ${prints.map(([x, y, rot, cap], n) => enter(`<g filter="url(#${shadow})">${R(x, y, pw, ph, k.paper, { rotate: rot })}</g>${slot(k, x + pw * .07, y + ph * .05, pw * .86, ph * .68, { tone: 'light', rotate: rot, silent: true })}${T(x + pw / 2, y + ph * .9, cap, { font: 'caveat', size: 30, weight: 700, fill: k.b, anchor: 'middle', rotate: rot })}`, 'pop', { dur: k.beat * .8, delay: k.beat * (.3 + n * .4), ease: 'back', origin: [x + pw / 2, y + ph / 2] })).join('')}
        ${enter(`${T(w * .06, h * .88, k.title, { font: 'caveat', size: h * .1, weight: 700, fill: k.b, fitW: w * .5 })}${T(w * .06, h * .94, k.subtitle, { font: 'patrickHand', size: h * .028, fill: k.c, fitW: w * .5 })}`, 'fade', { dur: k.beat * 1.2, delay: k.beat * 2.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .7, h * .17, h * .21, k.paper, { rotate: -5 })}${slot(k, w * .05 + h * .012, h * .71, h * .146, h * .14, { tone: 'light', rotate: -5, silent: true })}${D(`M${w * .16} ${h * .8}L${w * .2} ${h * .82}`, 'none', { stroke: k.d, sw: 3, dash: '6 6' })}
        ${T(w * .21, h * .82, k.title, { font: 'caveat', size: h * .07, weight: 700, fill: k.b, fitW: w * .32 })}${T(w * .21, h * .87, k.subtitle, { font: 'patrickHand', size: h * .026, fill: k.c, fitW: w * .32 })}`, 'pop', { origin: [w * .12, h * .8], ease: 'back' }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['polaroid-constellation'].field(k, w * .5, 0, w * .5, h, .8)}${R(w * .06, h * .08, w * .4, h * .78, k.paper, { rotate: -3 })}${slot(k, w * .08, h * .11, w * .36, h * .6, { tone: 'light', rotate: -3 })}${T(w * .26, h * .8, k.eyebrow, { font: 'caveat', size: h * .05, weight: 700, fill: k.b, anchor: 'middle', rotate: -3 })}
        ${enter(`${T(w * .54, h * .6, twoLines(k.title)[0], { font: 'caveat', size: h * .1, weight: 700, fill: k.b, lines: twoLines(k.title), fitW: w * .4 })}${T(w * .54, h * .82, k.subtitle, { font: 'lora', size: h * .026, weight: 400, fill: k.c, italic: true, fitW: w * .4 })}`, 'fade', { dur: k.beat * 1.4, delay: k.beat })}`; },
  },

  /* ── Liquid Matte — surface-tension masks merge images in a continuous field ── */
  'liquid-matte': {
    type: { display: 'outfit', text: 'manrope', utility: 'dmMono' }, idea: 'Two blobs of footage meet under surface tension and merge; the type floats light on the meniscus.', ground: 'a', surface: 'GLOW',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .5, s, s, orn.blobPath(k.seed % 5, 7, .2), k.c)}${P(cx - s * .1, cy - s * .2, s * .6, s * .6, orn.blobPath(k.seed % 3 + 2, 6, .25), k.d, { blend: 'screen' })}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3].map(n => P(x + w * (.05 + n * .24), y + h * (.1 + (n % 2) * .3), w * .3, h * .6, orn.blobPath(n + 1, 7, .24), n % 2 ? alpha(k.c, .5 * i) : alpha(k.d, .5 * i), { blend: 'screen' })).join('')}`,
    opener: k => { const { w, h } = k; const goo = k.uid('goo'); k.defs.push(`<filter id="${goo}"><feGaussianBlur in="SourceGraphic" stdDeviation="18" result="b"/><feColorMatrix in="b" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 26 -12" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter>`);
      const b1 = orn.blobPath(k.seed % 5 + 1, 7, .22), b2 = orn.blobPath(k.seed % 5 + 3, 6, .26);
      return `${R(0, 0, w, h, k.a)}<g filter="url(#${goo})">${drift(enter(P(w * .1, h * .12, w * .5, h * .76, b1, k.c), 'pop', { dur: k.beat * 2, ease: 'expo', origin: [w * .35, h * .5] }), w * .12, 0, k.beat * 9)}${drift(enter(P(w * .42, h * .18, w * .46, h * .7, b2, k.d), 'pop', { dur: k.beat * 2, delay: k.beat * .5, ease: 'expo', origin: [w * .65, h * .53] }), -w * .12, 0, k.beat * 11)}</g>
        ${enter(slot(k, w * .18, h * .2, w * .34, h * .6, { tone: 'dark', shape: 'path', d: b1, silent: true }), 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.2 })}${enter(slot(k, w * .48, h * .25, w * .32, h * .56, { tone: 'dark', shape: 'path', d: b2, silent: true }), 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.6 })}
        ${enter(`${T(w / 2, h * .9, k.title, { font: 'outfit', size: h * .07, weight: 300, fill: k.b, anchor: 'middle', tracking: .04, fitW: w * .7 })}${T(w / 2, h * .95, k.subtitle, { font: 'dmMono', size: h * .019, weight: 500, fill: k.c, anchor: 'middle', tracking: .2, upper: true, fitW: w * .6 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 2.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${P(w * .04, h * .7, w * .12, h * .24, orn.blobPath(2, 7, .2), k.c)}${P(w * .1, h * .72, w * .1, h * .2, orn.blobPath(4, 6, .24), k.d, { blend: 'screen' })}${R(w * .2, h * .76, w * .34, h * .12, alpha(k.a, .8), { rx: 40 })}
        ${T(w * .23, h * .815, k.title, { font: 'outfit', size: h * .046, weight: 300, fill: k.b, fitW: w * .28 })}${T(w * .23, h * .855, k.subtitle, { font: 'manrope', size: h * .02, weight: 500, fill: k.c, fitW: w * .28 })}`, 'pop', { origin: [w * .12, h * .82], ease: 'expo' }); },
    fullPage: k => { const { w, h } = k; const b = orn.blobPath(k.seed % 5 + 1, 7, .22);
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['liquid-matte'].field(k, 0, 0, w, h, .5)}${P(w * .04, h * .06, w * .5, h * .88, b, k.c)}${slot(k, w * .06, h * .1, w * .46, h * .8, { tone: 'dark', shape: 'path', d: b, silent: true })}
        ${enter(`${T(w * .58, h * .4, twoLines(k.title)[0], { font: 'outfit', size: h * .08, weight: 300, fill: k.b, lines: twoLines(k.title), fitW: w * .36 })}${T(w * .58, h * .58, k.subtitle, { font: 'manrope', size: h * .024, weight: 500, fill: k.c, fitW: w * .36 })}${[0, 1, 2].map(n => R(w * .58, h * (.66 + n * .04), w * (.3 - (n % 2) * .06), 6, alpha(k.d, .5), { rx: 3 })).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Prism Portrait — a portrait separates through spectral planes and recombines ── */
  'prism-portrait': {
    type: { display: 'bodoni', text: 'karla', utility: 'dmMono' }, idea: 'A high-fashion portrait split into three colour-separated planes that slide apart and register back into one.', ground: 'a', surface: 'GLASS',
    mark: (k, cx, cy, s) => `${PolyG([[cx, cy - s * .5], [cx + s * .45, cy + s * .4], [cx - s * .45, cy + s * .4]], 'none', { stroke: k.b, sw: s * .03 })}${L(cx - s * .5, cy, cx, cy, k.c, s * .03)}${L(cx, cy, cx + s * .5, cy - s * .15, k.d, s * .03)}${L(cx, cy, cx + s * .5, cy + s * .15, k.c, s * .03)}`,
    field: (k, x, y, w, h, i = 1) => `${[k.c, k.d, k.b].map((col, n) => PolyG([[x + w * (.3 + n * .05), y], [x + w * (.5 + n * .05), y], [x + w * (.35 + n * .05), y + h], [x + w * (.15 + n * .05), y + h]], alpha(col, .25 * i), { blend: 'screen' })).join('')}`,
    opener: k => { const { w, h } = k; const chroma = k.uid('ch'); k.defs.push(filters.chroma(chroma, 10));
      const plane = (dx: number, col: string, delay: number) => enter(`<g style="mix-blend-mode:screen">${slot(k, w * .3 + dx, h * .1, w * .4, h * .8, { tone: 'dark', silent: true })}${R(w * .3 + dx, h * .1, w * .4, h * .8, alpha(col, .35))}</g>`, 'slideL', { dur: k.beat * 1.8, delay, ease: 'expo', amount: dx / 30 });
      return `${R(0, 0, w, h, k.a)}${plane(-48, k.c, 0)}${plane(48, k.d, k.beat * .2)}${enter(slot(k, w * .3, h * .1, w * .4, h * .8, { tone: 'dark', silent: true }), 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.2 })}
        ${enter(`${T(w * .06, h * .5, twoLines(k.title)[0], { font: 'bodoni', size: h * .08, weight: 500, fill: k.b, italic: true, lines: twoLines(k.title), fitW: w * .22 })}${T(w * .06, h * .5 + twoLines(k.title).length * h * .085, k.subtitle, { font: 'karla', size: h * .02, weight: 400, fill: k.c, tracking: .14, upper: true, fitW: w * .22 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.8 })}
        ${T(w * .94, h * .92, 'R · G · B', { font: 'dmMono', size: h * .018, weight: 500, fill: k.d, anchor: 'end', tracking: .3 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05 - 6, h * .78, w * .44, h * .1, alpha(k.c, .6), { blend: 'screen' })}${R(w * .05 + 6, h * .78, w * .44, h * .1, alpha(k.d, .6), { blend: 'screen' })}${R(w * .05, h * .78, w * .44, h * .1, alpha(k.a, .85))}
        ${T(w * .07, h * .825, k.title, { font: 'bodoni', size: h * .046, weight: 500, fill: k.b, italic: true, fitW: w * .28 })}${T(w * .36, h * .825, k.subtitle, { font: 'dmMono', size: h * .018, weight: 500, fill: k.c, tracking: .16, upper: true, fitW: w * .12 })}${T(w * .07, h * .865, '', { font: 'karla', size: 10, fill: k.c })}`, 'slideL', { amount: 1.2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['prism-portrait'].field(k, 0, 0, w, h, .8)}<g style="mix-blend-mode:screen">${R(w * .06 - 20, h * .1, w * .4, h * .8, alpha(k.c, .4))}${R(w * .06 + 20, h * .1, w * .4, h * .8, alpha(k.d, .4))}</g>${slot(k, w * .06, h * .1, w * .4, h * .8, { tone: 'dark', silent: true })}
        ${enter(`${T(w * .54, h * .4, twoLines(k.title)[0], { font: 'bodoni', size: h * .09, weight: 500, fill: k.b, italic: true, lines: twoLines(k.title), fitW: w * .4 })}${L(w * .54, h * .56, w * .66, h * .56, k.c, 2)}${T(w * .54, h * .62, k.subtitle, { font: 'karla', size: h * .024, weight: 400, fill: k.c, fitW: w * .4 })}${T(w * .54, h * .72, 'SEPARATION · REGISTRATION · REPLACEABLE', { font: 'dmMono', size: h * .017, weight: 500, fill: k.d, tracking: .2 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Film Strip Depth — frames travel through a physical film gate with weave ── */
  'film-strip-depth': {
    type: { display: 'leagueGothic', text: 'ibmPlexMono', utility: 'ibmPlexMono' }, idea: 'A 35 mm strip runs through a gate: sprocket holes, frame lines, a countdown numeral, and the gentle weave of transport.', ground: 'a', surface: 'SCAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .36, s, s * .72, k.b)}${[0, 1, 2, 3].map(n => `${R(cx - s * .42 + n * s * .24, cy - s * .32, s * .1, s * .08, k.a, { rx: 2 })}${R(cx - s * .42 + n * s * .24, cy + s * .24, s * .1, s * .08, k.a, { rx: 2 })}`).join('')}${C(cx, cy, s * .16, 'none', { stroke: k.c, sw: s * .04 })}`,
    field: (k, x, y, w, h, i = 1) => { const out: string[] = []; for (let n = 0; n * 44 < w; n++) { out.push(R(x + n * 44 + 8, y + 10, 26, 18, alpha(k.b, .7 * i), { rx: 3 })); out.push(R(x + n * 44 + 8, y + h - 28, 26, 18, alpha(k.b, .7 * i), { rx: 3 })); } return `${R(x, y, w, h, alpha(k.b, .12 * i))}${out.join('')}`; },
    opener: k => { const { w, h } = k; const fw = w * .34;
      const frame = (x: number, n: number) => `${R(x + 10, h * .18, fw - 20, h * .64, k.a)}${slot(k, x + 14, h * .19, fw - 28, h * .62, { tone: 'dark', silent: true })}${T(x + 24, h * .8, `${String(n).padStart(2, '0')}A`, { font: 'ibmPlexMono', size: 20, weight: 700, fill: k.c })}`;
      const strip = `${R(-w, h * .1, w * 3, h * .8, k.b)}${Array.from({ length: 60 }, (_, n) => `${R(-w + n * 60 + 16, h * .12, 32, 22, k.a, { rx: 4 })}${R(-w + n * 60 + 16, h * .86, 32, 22, k.a, { rx: 4 })}`).join('')}${Array.from({ length: 9 }, (_, n) => frame(-w + n * fw, n + 5)).join('')}`;
      return `${R(0, 0, w, h, k.a)}<g><animateTransform attributeName="transform" type="translate" values="0 0;${-fw * 2} 0" dur="${k.total}s" repeatCount="indefinite"/>${drift(strip, 0, 3, 1.1)}</g>
        ${R(0, 0, w, h * .1, k.a)}${R(0, h * .9, w, h * .1, k.a)}${enter(`${C(w * .5, h * .5, h * .3, 'none', { stroke: k.c, sw: 4 })}${L(w * .5, h * .2, w * .5, h * .8, k.c, 2)}${L(w * .2, h * .5, w * .8, h * .5, k.c, 2)}${T(w * .5, h * .58, '3', { font: 'leagueGothic', size: h * .26, fill: k.c, anchor: 'middle' })}`, 'fade', { dur: k.beat * .2, delay: k.beat * .4 })}
        ${enter(`${R(w * .06, h * .9, w * .5, h * .1, k.a)}${T(w * .06, h * .97, k.title, { font: 'leagueGothic', size: h * .07, fill: k.b, upper: true, fitW: w * .34 })}${T(w * .42, h * .965, k.subtitle, { font: 'ibmPlexMono', size: h * .018, weight: 500, fill: k.c, tracking: .1, upper: true, fitW: w * .14 })}`, 'fade', { dur: k.beat, delay: k.beat * 1.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .74, w * .5, h * .16, k.b)}${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(n => `${R(w * .055 + n * 66, h * .75, 30, 14, k.a, { rx: 3 })}${R(w * .055 + n * 66, h * .875, 30, 14, k.a, { rx: 3 })}`).join('')}${R(w * .06, h * .77, h * .1, h * .1, k.a)}${slot(k, w * .06 + 4, h * .77 + 4, h * .1 - 8, h * .1 - 8, { tone: 'dark', silent: true })}
        ${T(w * .06 + h * .12, h * .82, k.title, { font: 'leagueGothic', size: h * .06, fill: k.a, upper: true, fitW: w * .34 })}${T(w * .06 + h * .12, h * .86, k.subtitle, { font: 'ibmPlexMono', size: h * .019, weight: 500, fill: k.a, tracking: .1, upper: true, fitW: w * .34 })}`, 'slideL', { amount: 2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['film-strip-depth'].field(k, 0, h * .08, w, h * .84, .5)}${R(w * .06, h * .12, w * .46, h * .76, k.b)}${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `${R(w * .065 + n * (w * .45 / 11), h * .13, 30, 18, k.a, { rx: 3 })}${R(w * .065 + n * (w * .45 / 11), h * .85, 30, 18, k.a, { rx: 3 })}`).join('')}${slot(k, w * .08, h * .17, w * .42, h * .66, { tone: 'dark' })}
        ${enter(`${T(w * .58, h * .4, twoLines(k.title)[0], { font: 'leagueGothic', size: h * .13, fill: k.b, upper: true, lines: twoLines(k.title), leading: .9, fitW: w * .36 })}${T(w * .58, h * .62, k.subtitle, { font: 'ibmPlexMono', size: h * .022, weight: 500, fill: k.c, fitW: w * .36 })}${['GATE · 35 mm', 'WEAVE · 0.4 px', 'FRAME · 12A · REPLACEABLE'].map((l, n) => T(w * .58, h * (.7 + n * .045), l, { font: 'ibmPlexMono', size: h * .017, weight: 500, fill: k.d, tracking: .12 })).join('')}`, 'fade', { dur: k.beat, delay: k.beat * .6 })}`; },
  },

  /* ── Architectural Cutout — people move through designed rooms with true occlusion ── */
  'architectural-cutout': {
    type: { display: 'archivo', text: 'inter', utility: 'spaceGrotesk' }, idea: 'Perspective rooms: a floor grid, one arch, and a doorway aperture the subject walks through with true occlusion.', ground: 'a', surface: 'CLEAN', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${P(cx - s * .4, cy - s * .5, s * .8, s, orn.archPath(.18), k.b)}${R(cx - s * .5, cy + s * .4, s, s * .1, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${perspectiveGrid(x, y + h * .5, w, h * .5, alpha(k.b, .5 * i), 1.5, { columns: 10, rows: 6 })}${P(x + w * .35, y + h * .1, w * .3, h * .5, orn.archPath(.14), alpha(k.b, .4 * i))}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${enter(perspectiveGrid(0, h * .55, w, h * .45, alpha(k.b, .45), 1.5, { columns: 14, rows: 8 }), 'fade', { dur: k.beat * 1.4 })}
        ${enter(`${P(w * .32, h * .1, w * .36, h * .8, orn.archPath(.16), k.b)}${slot(k, w * .37, h * .2, w * .26, h * .7, { tone: 'dark', shape: 'path', d: 'M0 100L0 40A50 40 0 0 1 100 40L100 100Z', silent: true })}`, 'slideU', { dur: k.beat * 1.4, delay: k.beat * .5, ease: 'expo', amount: 1.2 })}
        ${enter(`${R(w * .06, h * .74, w * .26, h * .18, k.c)}${T(w * .08, h * .82, k.title, { font: 'archivo', size: h * .05, weight: 900, fill: k.a, upper: true, fitW: w * .22 })}${T(w * .08, h * .87, k.subtitle, { font: 'spaceGrotesk', size: h * .02, weight: 500, fill: k.a, tracking: .1, upper: true, fitW: w * .22 })}`, 'slideL', { dur: k.beat, delay: k.beat * 1.6, ease: 'expo', amount: 1.5 })}
        ${enter(`${R(w * .72, h * .18, w * .22, h * .06, k.d)}${T(w * .73, h * .225, 'ROOM 02 · OCCLUSION ON', { font: 'spaceGrotesk', size: h * .02, weight: 700, fill: k.a, tracking: .12 })}`, 'fade', { dur: k.beat, delay: k.beat * 2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${P(w * .05, h * .66, h * .2, h * .24, orn.archPath(.2), k.b)}${R(w * .05 + h * .2, h * .76, w * .4, h * .12, k.c)}
        ${T(w * .05 + h * .22, h * .815, k.title, { font: 'archivo', size: h * .046, weight: 900, fill: k.a, upper: true, fitW: w * .34 })}${T(w * .05 + h * .22, h * .86, k.subtitle, { font: 'spaceGrotesk', size: h * .019, weight: 500, fill: k.a, tracking: .1, upper: true, fitW: w * .34 })}`, 'slideU', { amount: 1.4 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['architectural-cutout'].field(k, 0, 0, w, h, .8)}${slot(k, w * .06, h * .1, w * .46, h * .8, { tone: 'dark', shape: 'path', d: 'M0 100L0 36A50 36 0 0 1 100 36L100 100Z', silent: true })}
        ${enter(`${R(w * .56, h * .5, w * .38, h * .4, k.c)}${T(w * .59, h * .64, twoLines(k.title)[0], { font: 'archivo', size: h * .07, weight: 900, fill: k.a, upper: true, lines: twoLines(k.title), fitW: w * .32 })}${T(w * .59, h * .82, k.subtitle, { font: 'inter', size: h * .022, weight: 500, fill: k.a, fitW: w * .32 })}${R(w * .56, h * .1, w * .38, h * .36, 'none', { stroke: k.b, sw: 2 })}${T(w * .59, h * .18, 'PLAN · SECTION · REPLACEABLE', { font: 'spaceGrotesk', size: h * .018, weight: 700, fill: k.b, tracking: .14 })}${perspectiveGrid(w * .58, h * .24, w * .34, h * .2, alpha(k.b, .5), 1.5, { columns: 8, rows: 4 })}`, 'slideR', { dur: k.beat, ease: 'expo', amount: 1.4 })}`; },
  },

  /* ── Botanical Occlusion — editable foreground leaves integrate portraits into a living scene ── */
  'botanical-occlusion': {
    type: { display: 'instrumentSerif', text: 'lora', utility: 'dmMono' }, idea: 'Foreground foliage grows along stems in front of the portrait and breathes on a low-frequency breeze.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${D(`M${cx - s * .4} ${cy + s * .5}Q${cx} ${cy} ${cx + s * .4} ${cy - s * .5}`, 'none', { stroke: k.b, sw: s * .04 })}${P(cx - s * .3, cy - s * .2, s * .3, s * .44, orn.leafPath(), k.c, { rotate: -40 })}${P(cx, cy - s * .45, s * .3, s * .44, orn.leafPath(), k.c, { rotate: 30 })}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3, 4].map(n => P(x + w * (.05 + n * .2), y + h * (.2 + (n % 2) * .3), w * .1, h * .5, orn.leafPath(), n % 2 ? alpha(k.c, .7 * i) : alpha(k.b, .6 * i), { rotate: -30 + n * 15 })).join('')}`,
    opener: k => { const { w, h } = k;
      const stem = (d: string, delay: number) => enter(D(d, 'none', { stroke: k.b, sw: 6 }), 'draw', { dur: k.beat * 2, delay, ease: 'inOut' });
      const leaf = (x: number, y: number, lw: number, lh: number, rot: number, delay: number, col: string) => drift(enter(P(x, y, lw, lh, orn.leafPath(), col, { rotate: rot }), 'pop', { dur: k.beat * 1.2, delay, ease: 'back', origin: [x + lw / 2, y + lh] }), 6, -4, k.beat * (5 + delay));
      return `${R(0, 0, w, h, k.a)}${enter(slot(k, w * .28, h * .08, w * .44, h * .84, { tone: 'light', silent: true }), 'fade', { dur: k.beat * 1.6 })}
        ${stem(`M${w * .02} ${h}Q${w * .12} ${h * .6} ${w * .3} ${h * .5}`, k.beat * .6)}${stem(`M${w * .98} ${h}Q${w * .9} ${h * .5} ${w * .7} ${h * .3}`, k.beat * .9)}
        ${leaf(w * .12, h * .66, 200, 300, -40, k.beat * 1.4, k.c)}${leaf(w * .22, h * .46, 160, 240, 20, k.beat * 1.8, mix(k.c, -.2))}${leaf(w * .72, h * .28, 220, 320, 40, k.beat * 2, k.c)}${leaf(w * .84, h * .5, 170, 250, -15, k.beat * 2.3, mix(k.c, -.2))}
        ${enter(`${T(w / 2, h * .92, k.title, { font: 'instrumentSerif', size: h * .08, weight: 400, fill: k.b, anchor: 'middle', italic: true, fitW: w * .7 })}${T(w / 2, h * .96, k.subtitle, { font: 'dmMono', size: h * .018, weight: 500, fill: k.d, anchor: 'middle', tracking: .2, upper: true, fitW: w * .6 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * 2.6 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .76, w * .46, h * .13, alpha(k.a, .9))}${P(w * .02, h * .68, 120, 180, orn.leafPath(), k.c, { rotate: -35 })}${P(w * .08, h * .8, 80, 120, orn.leafPath(), mix(k.c, -.2), { rotate: 25 })}
        ${T(w * .14, h * .82, k.title, { font: 'instrumentSerif', size: h * .058, weight: 400, fill: k.b, italic: true, fitW: w * .34 })}${T(w * .14, h * .86, k.subtitle, { font: 'lora', size: h * .021, weight: 400, fill: k.d, fitW: w * .34 })}`, 'fade', { dur: k.beat * 1.6 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${slot(k, w * .06, h * .08, w * .46, h * .84, { tone: 'light', silent: true })}${P(w * .0, h * .5, 240, 360, orn.leafPath(), k.c, { rotate: -40 })}${P(w * .4, h * .6, 220, 330, orn.leafPath(), mix(k.c, -.2), { rotate: 35 })}${P(w * .1, h * .02, 180, 260, orn.leafPath(), k.c, { rotate: 20 })}
        ${enter(`${T(w * .58, h * .38, twoLines(k.title)[0], { font: 'instrumentSerif', size: h * .09, weight: 400, fill: k.b, italic: true, lines: twoLines(k.title), fitW: w * .36 })}${L(w * .58, h * .56, w * .68, h * .56, k.c, 3)}${T(w * .58, h * .62, k.subtitle, { font: 'lora', size: h * .024, weight: 400, fill: k.d, fitW: w * .36 })}${[0, 1, 2, 3].map(n => R(w * .58, h * (.7 + n * .036), w * (.3 - (n % 2) * .06), 3, alpha(k.b, .35))).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Ink Collage — duotone portraits and ink mattes assemble with print-shop energy ── */
  'ink-collage': {
    type: { display: 'anton', text: 'bitter', utility: 'specialElite' }, idea: 'Two ink plates register a beat apart over a duotone portrait; the halftone and a hand-cut mask do the rest.', ground: 'a', surface: 'INK', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s * .8, s * .8, k.c, { rotate: -6 })}${R(cx - s * .3, cy - s * .3, s * .8, s * .8, k.d, { rotate: 4, blend: 'multiply' })}`,
    field: (k, x, y, w, h, i = 1) => `${halftone(x, y, w, h, 14, alpha(k.b, .5 * i), { direction: 'y' })}${R(x + w * .1, y + h * .2, w * .4, h * .5, alpha(k.c, .7 * i), { rotate: -5, blend: 'multiply' })}${R(x + w * .45, y + h * .3, w * .4, h * .5, alpha(k.d, .7 * i), { rotate: 3, blend: 'multiply' })}`,
    opener: k => { const { w, h } = k; const duo = k.uid('duo'); k.defs.push(filters.duotone(duo, k.b, k.a));
      return `${R(0, 0, w, h, k.a)}${halftone(0, 0, w, h, 16, alpha(k.b, .25), { direction: 'x' })}
        ${enter(slot(k, w * .2, h * .06, w * .5, h * .88, { tone: 'light', filter: duo, rotate: -3, silent: true }), 'slideU', { dur: k.beat * .6, ease: 'expo', amount: 1.2 })}
        ${enter(R(w * .14, h * .12, w * .34, h * .5, k.c, { rotate: -7, blend: 'multiply', opacity: .9 }), 'slideL', { dur: k.beat * .45, delay: k.beat * .5, ease: 'expo', amount: 2 })}
        ${enter(R(w * .5, h * .44, w * .4, h * .44, k.d, { rotate: 4, blend: 'multiply', opacity: .9 }), 'slideR', { dur: k.beat * .45, delay: k.beat * .75, ease: 'expo', amount: 2 })}
        ${enter(`${R(w * .56, h * .12, w * .4, h * .2, k.b, { rotate: 2 })}${T(w * .58, h * .27, k.title, { font: 'anton', size: h * .12, fill: k.a, anchor: 'start', upper: true, rotate: 2, fitW: w * .36 })}`, 'pop', { dur: k.beat * .4, delay: k.beat * 1.1, ease: 'back', origin: [w * .76, h * .22] })}
        ${enter(T(w * .06, h * .9, k.subtitle, { font: 'specialElite', size: h * .026, fill: k.b, fitW: w * .5 }), 'fade', { dur: k.beat, delay: k.beat * 1.5 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .04, h * .75, w * .48, h * .14, k.c, { rotate: -1.5, blend: 'multiply' })}${R(w * .06, h * .76, w * .48, h * .14, k.d, { rotate: 1, blend: 'multiply' })}${R(w * .05, h * .755, w * .48, h * .14, k.b)}${halftone(w * .05, h * .755, w * .12, h * .14, 10, alpha(k.a, .6), { direction: 'x' })}
        ${T(w * .19, h * .82, k.title, { font: 'anton', size: h * .062, fill: k.a, upper: true, fitW: w * .32 })}${T(w * .19, h * .865, k.subtitle, { font: 'specialElite', size: h * .021, fill: k.a, fitW: w * .32 })}`, 'slideU', { dur: k.beat * .5, amount: 1.4 }); },
    fullPage: k => { const { w, h } = k; const duo = k.uid('duo'); k.defs.push(filters.duotone(duo, k.b, k.a));
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['ink-collage'].field(k, 0, 0, w, h, .5)}${slot(k, w * .06, h * .08, w * .46, h * .84, { tone: 'light', filter: duo, rotate: -2, silent: true })}${R(w * .02, h * .5, w * .3, h * .3, k.c, { rotate: -6, blend: 'multiply', opacity: .9 })}
        ${enter(`${R(w * .56, h * .3, w * .38, h * .22, k.b, { rotate: 2 })}${T(w * .58, h * .46, k.title, { font: 'anton', size: h * .13, fill: k.a, upper: true, rotate: 2, fitW: w * .34 })}${T(w * .57, h * .6, k.subtitle, { font: 'bitter', size: h * .026, weight: 700, fill: k.b, fitW: w * .38 })}${R(w * .57, h * .66, w * .2, h * .06, k.d, { rotate: -2 })}${T(w * .58, h * .705, 'PLATE 2 · REPLACEABLE', { font: 'specialElite', size: h * .022, fill: k.a })}`, 'pop', { dur: k.beat * .5, delay: k.beat * .5, ease: 'back', origin: [w * .75, h * .5] })}`; },
  },

  /* ── Mirror Stage — reflection, shadow and floor mattes place cutouts on a dimensional stage ── */
  'mirror-stage': {
    type: { display: 'italiana', text: 'karla', utility: 'tenor' }, idea: 'A glossy black stage: the cut-out stands on its own reflection with a contact shadow, lit from one side.', ground: 'a', surface: 'GLASS',
    mark: (k, cx, cy, s) => `${E(cx, cy + s * .38, s * .4, s * .08, alpha(k.b, .4))}${R(cx - s * .2, cy - s * .5, s * .4, s * .85, k.c)}${R(cx - s * .2, cy + s * .38, s * .4, s * .3, alpha(k.c, .25))}`,
    field: (k, x, y, w, h, i = 1) => `${R(x, y + h * .6, w, h * .4, alpha(k.b, .08 * i))}${L(x, y + h * .6, x + w, y + h * .6, alpha(k.b, .5 * i), 2)}${E(x + w * .5, y + h * .62, w * .25, h * .04, alpha(k.dark, .6 * i))}`,
    opener: k => { const { w, h } = k; const floor = k.uid('fl'), refl = k.uid('rf'); k.defs.push(gradient(floor, [[0, mix(k.a, .08)], [1, k.a]], { angle: 180 }), gradient(refl, [[0, '#fff', .3], [1, '#fff', 0]], { angle: 180 }));
      const figure = `M50 0C64 0 72 10 72 24C72 34 66 40 60 44C78 50 92 64 92 100L8 100C8 64 22 50 40 44C34 40 28 34 28 24C28 10 36 0 50 0Z`;
      return `${R(0, 0, w, h, k.a)}${R(0, h * .68, w, h * .32, `url(#${floor})`)}${L(0, h * .68, w, h * .68, alpha(k.b, .35), 2)}
        ${enter(`${E(w / 2, h * .69, w * .16, h * .025, alpha(k.dark, .7))}${slot(k, w / 2 - h * .18, h * .1, h * .36, h * .58, { tone: 'dark', shape: 'path', d: figure, silent: true })}<g transform="translate(0 ${h * 1.36}) scale(1 -1)" opacity=".28">${slot(k, w / 2 - h * .18, h * .1, h * .36, h * .58, { tone: 'dark', shape: 'path', d: figure, silent: true })}</g>${R(w / 2 - h * .18, h * .68, h * .36, h * .3, `url(#${refl})`, { opacity: .5 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * .4 })}
        ${drift(R(w * .6, 0, w * .2, h * .68, alpha(k.d, .12), { blend: 'screen' }), -w * .4, 0, k.beat * 10)}
        ${enter(`${T(w * .06, h * .86, k.title, { font: 'italiana', size: h * .09, fill: k.b, fitW: w * .5 })}${T(w * .06, h * .91, k.subtitle, { font: 'tenor', size: h * .02, fill: k.c, tracking: .24, upper: true, fitW: w * .5 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.6 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${L(w * .05, h * .88, w * .55, h * .88, alpha(k.b, .5), 2)}${E(w * .1, h * .885, h * .05, h * .012, alpha(k.dark, .8))}${R(w * .08, h * .74, h * .04, h * .14, k.c)}${R(w * .08, h * .885, h * .04, h * .06, alpha(k.c, .25))}
        ${T(w * .14, h * .83, k.title, { font: 'italiana', size: h * .06, fill: k.b, fitW: w * .36 })}${T(w * .14, h * .87, k.subtitle, { font: 'tenor', size: h * .019, fill: k.c, tracking: .22, upper: true, fitW: w * .36 })}`, 'fade', { dur: k.beat * 1.4 }); },
    fullPage: k => { const { w, h } = k; const floor = k.uid('fl'); k.defs.push(gradient(floor, [[0, mix(k.a, .08)], [1, k.a]], { angle: 180 }));
      return `${R(0, 0, w, h, k.a)}${R(0, h * .7, w, h * .3, `url(#${floor})`)}${L(0, h * .7, w, h * .7, alpha(k.b, .35), 2)}${E(w * .3, h * .71, w * .16, h * .025, alpha(k.dark, .7))}${slot(k, w * .3 - h * .22, h * .1, h * .44, h * .6, { tone: 'dark', silent: true })}<g transform="translate(0 ${h * 1.4}) scale(1 -1)" opacity=".25">${slot(k, w * .3 - h * .22, h * .1, h * .44, h * .6, { tone: 'dark', silent: true })}</g>
        ${enter(`${T(w * .58, h * .42, twoLines(k.title)[0], { font: 'italiana', size: h * .1, fill: k.b, lines: twoLines(k.title), fitW: w * .36 })}${L(w * .58, h * .58, w * .7, h * .58, k.d, 2)}${T(w * .58, h * .64, k.subtitle, { font: 'karla', size: h * .024, weight: 400, fill: k.c, fitW: w * .36 })}${T(w * .58, h * .74, 'KEY LIGHT · CAMERA LEFT · REFLECTION 28 %', { font: 'tenor', size: h * .016, fill: k.d, tracking: .2 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Classical Portico — measured columns and a central aperture ── */
  'classical-portico': {
    type: { display: 'marcellus', text: 'cardo', utility: 'tenor' }, idea: 'A four-column portico with an entablature; the subject stands in the central intercolumniation, proportioned to the order.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${PolyG([[cx - s * .5, cy - s * .25], [cx, cy - s * .5], [cx + s * .5, cy - s * .25]], k.b)}${[-.3, -.1, .1, .3].map(o => R(cx + o * s - s * .04, cy - s * .2, s * .08, s * .6, k.c)).join('')}${R(cx - s * .5, cy + s * .42, s, s * .08, k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${Array.from({ length: 6 }, (_, n) => R(x + n * (w / 6) + w / 24, y + h * .15, w / 24, h * .7, alpha(k.c, .3 * i))).join('')}${R(x, y + h * .1, w, h * .05, alpha(k.b, .5 * i))}${R(x, y + h * .85, w, h * .05, alpha(k.b, .5 * i))}`,
    opener: k => { const { w, h } = k; const colW = w * .06;
      const col = (x: number, delay: number) => enter(`${R(x, h * .24, colW, h * .6, k.c)}${stripes(x, h * .24, colW, h * .6, 5, 3, alpha(k.a, .4), { vertical: true })}${R(x - 10, h * .22, colW + 20, 16, k.b)}${R(x - 14, h * .84, colW + 28, 16, k.b)}`, 'slideU', { dur: k.beat * 1.4, delay, ease: 'expo', amount: 1.5 });
      return `${R(0, 0, w, h, k.a)}${enter(`${PolyG([[w * .1, h * .2], [w * .5, h * .06], [w * .9, h * .2]], k.b)}${R(w * .1, h * .2, w * .8, h * .03, k.b)}`, 'slideD', { dur: k.beat * 1.4, ease: 'expo' })}
        ${col(w * .14, k.beat * .3)}${col(w * .32, k.beat * .5)}${col(w * .62, k.beat * .7)}${col(w * .8, k.beat * .9)}
        ${enter(slot(k, w * .4, h * .26, w * .2, h * .58, { tone: 'light', silent: true }), 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.4 })}
        ${enter(`${R(w * .1, h * .86, w * .8, h * .04, k.b)}${T(w / 2, h * .95, k.title, { font: 'marcellus', size: h * .05, fill: k.b, anchor: 'middle', tracking: .2, upper: true, fitW: w * .7 })}`, 'fade', { dur: k.beat * 1.4, delay: k.beat * 2 })}
        ${enter(T(w / 2, h * .16, k.subtitle, { font: 'tenor', size: h * .02, fill: k.a, anchor: 'middle', tracking: .28, upper: true, fitW: w * .5 }), 'fade', { dur: k.beat, delay: k.beat * 2.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .75, w * .48, h * .14, k.a)}${R(w * .05, h * .74, w * .48, 8, k.b)}${R(w * .05, h * .89, w * .48, 8, k.b)}${[0, 1].map(n => R(w * .06 + n * 26, h * .76, 12, h * .12, k.c)).join('')}
        ${T(w * .11, h * .82, k.title, { font: 'marcellus', size: h * .05, fill: k.b, tracking: .1, upper: true, fitW: w * .4 })}${T(w * .11, h * .865, k.subtitle, { font: 'tenor', size: h * .019, fill: k.c, tracking: .2, upper: true, fitW: w * .4 })}`, 'slideU', { amount: 1.2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['classical-portico'].field(k, 0, 0, w, h, .5)}${PolyG([[w * .06, h * .16], [w * .29, h * .08], [w * .52, h * .16]], k.b)}${R(w * .06, h * .16, w * .46, 12, k.b)}${[0, 1].map(n => R(w * (.08 + n * .4), h * .18, w * .04, h * .68, k.c)).join('')}${slot(k, w * .14, h * .2, w * .3, h * .66, { tone: 'light', silent: true })}${R(w * .06, h * .86, w * .46, 12, k.b)}
        ${enter(`${T(w * .58, h * .34, twoLines(k.title)[0], { font: 'marcellus', size: h * .07, fill: k.b, tracking: .08, upper: true, lines: twoLines(k.title), fitW: w * .36 })}${L(w * .58, h * .52, w * .78, h * .52, k.c, 3)}${T(w * .58, h * .58, k.subtitle, { font: 'cardo', size: h * .026, fill: k.c, fitW: w * .36 })}${[0, 1, 2, 3].map(n => R(w * .58, h * (.66 + n * .036), w * (.3 - (n % 3) * .05), 3, alpha(k.b, .35))).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Spray Cutout — a sharp silhouette collides with fresh aerosol ── */
  'spray-cutout': {
    type: { display: 'permanentMarker', text: 'archivo', utility: 'kalam' }, idea: 'A hard-edged cut-out punches through blooming overspray while a marker line chases its contour.', ground: 'a', surface: 'INK', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${C(cx, cy, s * .46, k.c, { opacity: .7 })}${PolyG([[cx - s * .2, cy + s * .4], [cx - s * .1, cy - s * .3], [cx + s * .2, cy - s * .4], [cx + s * .3, cy + s * .4]], k.a)}${D(`M${cx - s * .3} ${cy + s * .45}L${cx - s * .15} ${cy - s * .35}L${cx + s * .25} ${cy - s * .45}`, 'none', { stroke: k.d, sw: s * .04 })}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2].map(n => C(x + w * (.2 + n * .3), y + h * .5, h * .4, n % 2 ? alpha(k.c, .5 * i) : alpha(k.d, .5 * i))).join('')}${specks(x, y, w, h, 200 * i, alpha(k.b, .6), k.seed, .5)}`,
    opener: k => { const { w, h } = k; const spray = k.uid('sp'); k.defs.push(`<filter id="${spray}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="28" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${k.seed % 20}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .9 0" result="g"/><feComposite in="b" in2="g" operator="in"/><feMerge><feMergeNode in="b"/><feMergeNode/></feMerge></filter>`);
      const figure = `M50 0C64 0 72 10 72 24C72 34 66 40 60 44C78 50 92 64 92 100L8 100C8 64 22 50 40 44C34 40 28 34 28 24C28 10 36 0 50 0Z`;
      return `${R(0, 0, w, h, k.a)}${enter(C(w * .5, h * .5, h * .42, k.c, { filter: spray }), 'pop', { dur: k.beat * .7, ease: 'expo', origin: [w / 2, h / 2] })}${enter(C(w * .62, h * .4, h * .3, k.d, { filter: spray }), 'pop', { dur: k.beat * .7, delay: k.beat * .3, ease: 'expo', origin: [w * .62, h * .4] })}
        ${enter(slot(k, w / 2 - h * .2, h * .16, h * .4, h * .7, { tone: 'dark', shape: 'path', d: figure, silent: true }), 'pop', { dur: k.beat * .3, delay: k.beat * .9, ease: 'back', origin: [w / 2, h * .5] })}
        ${enter(P(w / 2 - h * .2 - 12, h * .16 - 12, h * .4 + 24, h * .7 + 24, figure, 'none', { stroke: k.b, sw: 8 }), 'draw', { dur: k.beat * 1.2, delay: k.beat * 1.1, ease: 'inOut' })}
        ${enter(`${R(w * .04, h * .78, w * .5, h * .14, k.b, { rotate: -2 })}${T(w * .06, h * .885, k.title, { font: 'permanentMarker', size: h * .09, fill: k.a, upper: true, rotate: -2, fitW: w * .46 })}`, 'pop', { dur: k.beat * .35, delay: k.beat * 1.5, ease: 'back', origin: [w * .29, h * .85] })}
        ${enter(T(w * .94, h * .12, k.subtitle, { font: 'kalam', size: h * .036, weight: 700, fill: k.b, anchor: 'end', rotate: 3, fitW: w * .4 }), 'fade', { dur: k.beat * .4, delay: k.beat * 1.9 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${C(w * .1, h * .82, h * .11, k.c, { opacity: .85 })}${C(w * .14, h * .8, h * .08, k.d, { opacity: .85 })}${R(w * .17, h * .77, w * .36, h * .12, k.b, { rotate: -1.5 })}
        ${T(w * .19, h * .855, k.title, { font: 'permanentMarker', size: h * .06, fill: k.a, upper: true, rotate: -1.5, fitW: w * .32 })}${T(w * .55, h * .78, k.subtitle, { font: 'kalam', size: h * .028, weight: 700, fill: k.b, rotate: 2, fitW: w * .2 })}`, 'pop', { dur: k.beat * .4, ease: 'back', amount: .6, origin: [w * .3, h * .83] }); },
    fullPage: k => { const { w, h } = k; const figure = `M50 0C64 0 72 10 72 24C72 34 66 40 60 44C78 50 92 64 92 100L8 100C8 64 22 50 40 44C34 40 28 34 28 24C28 10 36 0 50 0Z`;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['spray-cutout'].field(k, 0, 0, w * .55, h, .8)}${slot(k, w * .1, h * .1, w * .36, h * .8, { tone: 'dark', shape: 'path', d: figure, silent: true })}${P(w * .1 - 12, h * .1 - 12, w * .36 + 24, h * .8 + 24, figure, 'none', { stroke: k.b, sw: 8 })}
        ${enter(`${R(w * .56, h * .32, w * .38, h * .2, k.b, { rotate: 2 })}${T(w * .58, h * .46, k.title, { font: 'permanentMarker', size: h * .1, fill: k.a, upper: true, rotate: 2, fitW: w * .34 })}${T(w * .57, h * .6, k.subtitle, { font: 'kalam', size: h * .036, weight: 700, fill: k.d, fitW: w * .38 })}${D(`M${w * .57} ${h * .64}Q${w * .75} ${h * .68} ${w * .92} ${h * .63}`, 'none', { stroke: k.c, sw: 8 })}`, 'pop', { dur: k.beat * .4, delay: k.beat * .4, ease: 'back', origin: [w * .75, h * .48] })}`; },
  },

  /* ── Lightfield Avatar — depth slices scan and reassemble into a luminous whole ── */
  'lightfield-avatar': {
    type: { display: 'tomorrow', text: 'exo2', utility: 'jetbrains' }, idea: 'The subject is rebuilt from horizontal depth slices that scan top to bottom and settle into one volumetric figure.', ground: 'a', surface: 'GLOW', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${[0, 1, 2, 3, 4, 5].map(n => R(cx - s * (.2 + (n % 3) * .1), cy - s * .5 + n * s * .17, s * (.4 + (n % 3) * .2), s * .1, n % 2 ? k.c : k.d, { opacity: .8 })).join('')}`,
    field: (k, x, y, w, h, i = 1) => `${stripes(x, y, w, h, 24, 2, alpha(k.c, .4 * i))}${dots(x, y, w, h, 40, alpha(k.d, .4 * i), { r: 1 })}`,
    opener: k => { const { w, h } = k; const glow = k.uid('gl'); k.defs.push(filters.glow(glow, .6));
      const slices = Array.from({ length: 20 }, (_, n) => { const y = h * .06 + n * h * .036; const wd = h * (.16 + .16 * Math.sin(n * .32)); return enter(`${R(w / 2 - wd, y, wd * 2, h * .028, n % 2 ? alpha(k.c, .85) : alpha(k.d, .85), { filter: glow })}${slot(k, w / 2 - wd, y, wd * 2, h * .028, { tone: 'dark', silent: true })}`, 'slideL', { dur: k.beat * .5, delay: k.beat * .06 * n, ease: 'expo', amount: n % 2 ? 1.5 : -1.5 }); }).join('');
      return `${R(0, 0, w, h, k.a)}${dots(0, 0, w, h, 40, alpha(k.d, .3), { r: 1 })}${slices}
        ${drift(R(0, h * .1, w, 3, k.b, { opacity: .8, blend: 'screen' }), 0, h * .8, k.beat * 4)}
        ${enter(`${T(w * .06, h * .86, k.title, { font: 'tomorrow', size: h * .07, weight: 700, fill: k.b, upper: true, tracking: .06, fitW: w * .5 })}${T(w * .06, h * .91, k.subtitle, { font: 'jetbrains', size: h * .02, weight: 500, fill: k.c, tracking: .2, upper: true, fitW: w * .5 })}`, 'fade', { dur: k.beat, delay: k.beat * 1.6 })}
        ${enter(`${T(w * .94, h * .14, 'DEPTH · 22 SLICES', { font: 'jetbrains', size: h * .018, weight: 500, fill: k.d, anchor: 'end', tracking: .2 })}${T(w * .94, h * .18, 'PARALLAX · TRUE', { font: 'jetbrains', size: h * .018, weight: 500, fill: k.d, anchor: 'end', tracking: .2 })}`, 'fade', { dur: k.beat, delay: k.beat * 2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${[0, 1, 2, 3, 4].map(n => R(w * .05, h * .76 + n * h * .028, w * (.3 + (n % 3) * .06), h * .02, n % 2 ? alpha(k.c, .85) : alpha(k.d, .85))).join('')}
        ${T(w * .07, h * .93, k.title, { font: 'tomorrow', size: h * .05, weight: 700, fill: k.b, upper: true, tracking: .04, fitW: w * .3 })}${T(w * .38, h * .93, k.subtitle, { font: 'jetbrains', size: h * .019, weight: 500, fill: k.c, tracking: .16, upper: true, fitW: w * .16 })}`, 'slideL', { dur: k.beat * .6, amount: 1.5 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['lightfield-avatar'].field(k, 0, 0, w, h, .5)}${Array.from({ length: 18 }, (_, n) => { const y = h * .1 + n * h * .044; const wd = h * (.14 + .14 * Math.sin(n * .34)); return `${R(w * .3 - wd, y, wd * 2, h * .034, n % 2 ? alpha(k.c, .85) : alpha(k.d, .85))}${slot(k, w * .3 - wd, y, wd * 2, h * .034, { tone: 'dark', silent: true })}`; }).join('')}
        ${enter(`${R(w * .58, h * .1, w * .36, h * .8, alpha(k.a, .9), { stroke: k.c, sw: 1.5 })}${T(w * .61, h * .28, twoLines(k.title)[0], { font: 'tomorrow', size: h * .06, weight: 700, fill: k.b, upper: true, lines: twoLines(k.title), fitW: w * .3 })}${T(w * .61, h * .44, k.subtitle, { font: 'exo2', size: h * .022, weight: 500, fill: k.c, fitW: w * .3 })}${['SLICES · 22', 'PARALLAX · TRUE', 'LIGHT · KEY 42° · FILL 12 %'].map((l, n) => T(w * .61, h * (.54 + n * .05), l, { font: 'jetbrains', size: h * .017, weight: 500, fill: k.d, tracking: .18 })).join('')}`, 'slideR', { dur: k.beat * .8, ease: 'expo', amount: 1.5 })}`; },
  },

  /* ── Travelogue Layers — photographs, routes, tickets, captions build a lived atlas ── */
  'travelogue-layers': {
    type: { display: 'karla', text: 'lora', utility: 'spaceMono' }, idea: 'A desk of journey material: a route on paper, a ticket stub, two photographs at different angles, and a mono caption for each.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .3, s * .7, s * .5, k.paper, { rotate: -8 })}${R(cx - s * .1, cy - s * .1, s * .6, s * .4, k.c, { rotate: 6 })}${D(`M${cx - s * .4} ${cy + s * .4}Q${cx} ${cy} ${cx + s * .4} ${cy + s * .3}`, 'none', { stroke: k.d, sw: s * .03, dash: `${s * .05} ${s * .04}` })}`,
    field: (k, x, y, w, h, i = 1) => `${R(x + w * .1, y + h * .2, w * .3, h * .4, alpha(k.paper, .9 * i), { rotate: -6 })}${R(x + w * .55, y + h * .3, w * .3, h * .4, alpha(k.c, .6 * i), { rotate: 4 })}${D(`M${x} ${y + h * .8}Q${x + w * .4} ${y + h * .3} ${x + w} ${y + h * .6}`, 'none', { stroke: alpha(k.d, .8 * i), sw: 3, dash: '10 8' })}`,
    opener: k => { const { w, h } = k; const shadow = k.uid('sd'); k.defs.push(filters.softShadow(shadow, 8, 12, .22));
      return `${R(0, 0, w, h, k.a)}${enter(D(`M${w * .05} ${h * .85}Q${w * .35} ${h * .3} ${w * .6} ${h * .55}T${w * .95} ${h * .2}`, 'none', { stroke: k.d, sw: 3, dash: '12 10' }), 'draw', { dur: k.beat * 3, ease: 'inOut' })}
        ${enter(`<g filter="url(#${shadow})">${R(w * .08, h * .14, w * .36, h * .48, k.paper, { rotate: -6 })}</g>${slot(k, w * .1, h * .16, w * .32, h * .38, { tone: 'light', rotate: -6, silent: true })}${T(w * .12, h * .6, 'PLACE · REPLACEABLE', { font: 'spaceMono', size: 18, weight: 700, fill: k.b, rotate: -6, tracking: .1 })}`, 'pop', { dur: k.beat, delay: k.beat * .6, ease: 'back', origin: [w * .26, h * .38] })}
        ${enter(`<g filter="url(#${shadow})">${R(w * .52, h * .3, w * .34, h * .46, k.paper, { rotate: 5 })}</g>${slot(k, w * .54, h * .32, w * .3, h * .36, { tone: 'light', rotate: 5, silent: true })}${T(w * .55, h * .73, 'MAKER · REPLACEABLE', { font: 'spaceMono', size: 18, weight: 700, fill: k.b, rotate: 5, tracking: .1 })}`, 'pop', { dur: k.beat, delay: k.beat * 1.2, ease: 'back', origin: [w * .69, h * .53] })}
        ${enter(`${R(w * .4, h * .7, w * .24, h * .1, k.c, { rotate: -3 })}${stripes(w * .4, h * .7, w * .24, h * .1, 3, 2, alpha(k.a, .4))}${T(w * .42, h * .765, 'ADMIT ONE · 14 · REPLACEABLE', { font: 'spaceMono', size: 18, weight: 700, fill: k.a, rotate: -3 })}`, 'slideU', { dur: k.beat * .8, delay: k.beat * 1.8, ease: 'back' })}
        ${enter(`${T(w * .06, h * .9, k.title, { font: 'karla', size: h * .07, weight: 800, fill: k.b, fitW: w * .5 })}${T(w * .06, h * .95, k.subtitle, { font: 'lora', size: h * .024, weight: 400, fill: k.c, italic: true, fitW: w * .5 })}`, 'fade', { dur: k.beat * 1.2, delay: k.beat * 2.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .72, h * .18, h * .18, k.paper, { rotate: -5 })}${slot(k, w * .05 + 8, h * .72 + 8, h * .18 - 16, h * .13, { tone: 'light', rotate: -5, silent: true })}${R(w * .17, h * .76, w * .36, h * .12, k.a, { stroke: k.d, sw: 2, dash: '8 6' })}
        ${T(w * .19, h * .815, k.title, { font: 'karla', size: h * .046, weight: 800, fill: k.b, fitW: w * .32 })}${T(w * .19, h * .855, k.subtitle, { font: 'spaceMono', size: h * .019, weight: 700, fill: k.c, tracking: .08, upper: true, fitW: w * .32 })}`, 'pop', { origin: [w * .14, h * .8], ease: 'back' }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['travelogue-layers'].field(k, 0, 0, w, h, .6)}${R(w * .06, h * .1, w * .44, h * .66, k.paper, { rotate: -3 })}${slot(k, w * .08, h * .12, w * .4, h * .54, { tone: 'light', rotate: -3, silent: true })}${T(w * .1, h * .72, 'PLACE · DATE · MAKER · REPLACEABLE', { font: 'spaceMono', size: 18, weight: 700, fill: k.b, rotate: -3, tracking: .08 })}
        ${enter(`${T(w * .56, h * .34, twoLines(k.title)[0], { font: 'karla', size: h * .08, weight: 800, fill: k.b, lines: twoLines(k.title), fitW: w * .38 })}${T(w * .56, h * .52, k.subtitle, { font: 'lora', size: h * .026, weight: 400, fill: k.c, italic: true, fitW: w * .38 })}${['Place', 'Language', 'License'].map((f, n) => `${T(w * .56, h * (.62 + n * .07), f, { font: 'spaceMono', size: h * .017, weight: 700, fill: k.d, tracking: .12, upper: true })}${L(w * .64, h * (.615 + n * .07), w * .92, h * (.615 + n * .07), alpha(k.b, .4), 1.5, { dash: '4 4' })}`).join('')}`, 'fade', { dur: k.beat * 1.4, delay: k.beat })}`; },
  },

  /* ── Baroque Cameo — a portrait emerges through sculpted shadow into a luminous oval ── */
  'baroque-cameo': {
    type: { display: 'gloock', text: 'cormorant', utility: 'cinzel' }, idea: 'An oval cameo in a gilt scroll frame; the face is revealed by a travelling highlight, not by a cut.', ground: 'a', surface: 'GLASS',
    mark: (k, cx, cy, s) => `${E(cx, cy, s * .34, s * .46, k.c, { stroke: k.d, sw: s * .04 })}${P(cx - s * .55, cy - s * .35, s * .3, s * .5, orn.cScrollPath(), k.d)}${P(cx + s * .25, cy - s * .15, s * .3, s * .5, orn.cScrollPath(), k.d, { rotate: 180 })}`,
    field: (k, x, y, w, h, i = 1) => `${E(x + w / 2, y + h / 2, w * .2, h * .4, 'none', { stroke: alpha(k.d, .6 * i), sw: 4 })}${[0, 1, 2, 3].map(n => P(x + w * (.1 + n * .22), y + h * (.15 + (n % 2) * .3), w * .12, h * .5, orn.cScrollPath(), alpha(k.d, .35 * i), { rotate: n % 2 ? 180 : 0 })).join('')}`,
    opener: k => { const { w, h } = k; const light = k.uid('lt'), vign = k.uid('vg'); k.defs.push(gradient(light, [[0, k.d, 0], [.5, k.d, .5], [1, k.d, 0]], { angle: 30 }), gradient(vign, [[0, k.a, 0], [1, k.a, .9]], { radial: true, r: .7 }));
      const rx = h * .26, ry = h * .36;
      return `${R(0, 0, w, h, k.a)}${enter(`${slot(k, w / 2 - rx, h * .48 - ry, rx * 2, ry * 2, { tone: 'dark', shape: 'circle', silent: true })}${E(w / 2, h * .48, rx, ry, `url(#${vign})`)}`, 'fade', { dur: k.beat * 2.4 })}
        ${drift(E(w / 2, h * .48, rx, ry, `url(#${light})`, { blend: 'screen' }), 0, 0, 1)}<g style="mix-blend-mode:screen">${drift(R(w * .2, 0, w * .16, h, `url(#${light})`), w * .5, 0, k.beat * 7)}</g>
        ${enter(`${E(w / 2, h * .48, rx + 14, ry + 14, 'none', { stroke: k.d, sw: 10 })}${E(w / 2, h * .48, rx + 30, ry + 30, 'none', { stroke: k.d, sw: 2 })}`, 'draw', { dur: k.beat * 2, delay: k.beat * .4, ease: 'inOut' })}
        ${[[w / 2 - rx - 240, h * .48 - ry - 40, 0], [w / 2 + rx + 20, h * .48 - ry - 40, 90], [w / 2 - rx - 240, h * .48 + ry - 200, -90], [w / 2 + rx + 20, h * .48 + ry - 200, 180]].map(([x, y, rot], n) => enter(P(x, y, 220, 260, orn.cScrollPath(), k.d, { rotate: rot }), 'pop', { dur: k.beat * 1.4, delay: k.beat * (1.2 + n * .2), ease: 'expo', origin: [x + 110, y + 130] })).join('')}
        ${enter(`${T(w / 2, h * .92, k.title, { font: 'gloock', size: h * .07, fill: k.c, anchor: 'middle', fitW: w * .6 })}${T(w / 2, h * .965, k.subtitle, { font: 'cinzel', size: h * .02, weight: 500, fill: k.d, anchor: 'middle', tracking: .26, upper: true, fitW: w * .5 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 2.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${E(w * .1, h * .82, h * .06, h * .08, k.c, { stroke: k.d, sw: 4 })}${slot(k, w * .1 - h * .05, h * .82 - h * .07, h * .1, h * .14, { tone: 'dark', shape: 'circle', silent: true })}${P(w * .13, h * .72, 60, 80, orn.cScrollPath(), k.d, { rotate: 180 })}${R(w * .17, h * .76, w * .36, h * .12, alpha(k.a, .85))}${L(w * .17, h * .88, w * .53, h * .88, k.d, 2)}
        ${T(w * .19, h * .815, k.title, { font: 'gloock', size: h * .05, fill: k.c, fitW: w * .32 })}${T(w * .19, h * .86, k.subtitle, { font: 'cinzel', size: h * .018, weight: 500, fill: k.d, tracking: .22, upper: true, fitW: w * .32 })}`, 'fade', { dur: k.beat * 1.8 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${IMAGE_MATTE_DESIGNS['baroque-cameo'].field(k, 0, 0, w, h, .5)}${slot(k, w * .3 - h * .24, h * .5 - h * .34, h * .48, h * .68, { tone: 'dark', shape: 'circle', silent: true })}${E(w * .3, h * .5, h * .25, h * .35, 'none', { stroke: k.d, sw: 10 })}${P(w * .3 - h * .5, h * .12, 220, 260, orn.cScrollPath(), k.d)}${P(w * .3 + h * .25, h * .58, 220, 260, orn.cScrollPath(), k.d, { rotate: 180 })}
        ${enter(`${T(w * .58, h * .4, twoLines(k.title)[0], { font: 'gloock', size: h * .085, fill: k.c, lines: twoLines(k.title), fitW: w * .36 })}${L(w * .58, h * .56, w * .72, h * .56, k.d, 2)}${T(w * .58, h * .62, k.subtitle, { font: 'cormorant', size: h * .028, weight: 500, fill: k.c, italic: true, fitW: w * .36 })}${[0, 1, 2, 3].map(n => R(w * .58, h * (.7 + n * .036), w * (.3 - (n % 2) * .07), 3, alpha(k.c, .35))).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Single Aperture — one exact window gives the image complete authority ── */
  'single-aperture': {
    type: { display: 'manrope', text: 'karla', utility: 'dmMono' }, idea: 'One window, one hairline, one small caption; the aperture opens once and holds until the editorial beat.', ground: 'a', surface: 'CLEAN',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .36, s, s * .72, 'none', { stroke: k.b, sw: s * .03 })}${R(cx - s * .38, cy - s * .24, s * .76, s * .48, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${R(x + w * .3, y + h * .2, w * .4, h * .6, 'none', { stroke: alpha(k.b, .8 * i), sw: 2 })}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${enter(`${slot(k, w * .2, h * .12, w * .6, h * .68, { tone: 'light', silent: true })}${R(w * .2, h * .12, w * .6, h * .68, 'none', { stroke: k.b, sw: 2 })}`, 'growY', { dur: k.beat * 1.8, ease: 'expo', origin: [w / 2, h * .46] })}
        ${enter(`${T(w * .2, h * .88, k.title, { font: 'manrope', size: h * .04, weight: 700, fill: k.b, fitW: w * .5 })}${T(w * .8, h * .88, k.subtitle, { font: 'dmMono', size: h * .018, weight: 500, fill: k.c, anchor: 'end', tracking: .12, upper: true, fitW: w * .3 })}`, 'fade', { dur: k.beat * 1.4, delay: k.beat * 1.6 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${L(w * .05, h * .84, w * .45, h * .84, k.b, 2)}${T(w * .05, h * .82, k.title, { font: 'manrope', size: h * .04, weight: 700, fill: k.b, fitW: w * .4 })}${T(w * .05, h * .875, k.subtitle, { font: 'dmMono', size: h * .018, weight: 500, fill: k.c, tracking: .12, upper: true, fitW: w * .4 })}`, 'fade', { dur: k.beat * 1.4 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${slot(k, w * .06, h * .08, w * .56, h * .84, { tone: 'light', silent: true })}${R(w * .06, h * .08, w * .56, h * .84, 'none', { stroke: k.b, sw: 2 })}
        ${enter(`${T(w * .66, h * .5, twoLines(k.title)[0], { font: 'manrope', size: h * .05, weight: 700, fill: k.b, lines: twoLines(k.title), fitW: w * .28 })}${T(w * .66, h * .5 + twoLines(k.title).length * h * .055 + h * .02, k.subtitle, { font: 'karla', size: h * .022, weight: 400, fill: k.c, fitW: w * .28 })}${T(w * .66, h * .9, 'FIG. — REPLACEABLE', { font: 'dmMono', size: h * .016, weight: 500, fill: k.c, tracking: .12 })}`, 'fade', { dur: k.beat * 1.4, delay: k.beat })}`; },
  },
};
