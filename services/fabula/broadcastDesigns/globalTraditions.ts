// globalTraditions — twenty hand-authored broadcast identities from specific design histories.
//
// Each is built from the principles of its tradition — composition, rhythm, proportion, colour
// logic — never from sacred symbols, seals, regalia or copied works. Where a system belongs to a
// living community it ships as a neutral, partner-ready frame and says so.
import * as orn from '../../tela/ornaments';
import { type Ctx, C, D, E, L, P, PolyG, R, T, checker, dots, drift, enter, gradient, mosaic, mix, alpha, perspectiveGrid, pulse, radial, rings, rotateLoop, slot, starTess, stripes, specks, twoLines, isDark, inkOn, filters } from './kit';
import type { BroadcastDesign } from './types';

const lt = (k: Ctx, inner: string, type: Parameters<typeof enter>[1], o: Parameters<typeof enter>[2] = {}) => enter(inner, type, { dur: k.beat * 1.3, ease: 'expo', loop: k.total, outDur: k.beat * .8, ...o });

export const GLOBAL_DESIGNS: Record<string, BroadcastDesign> = {

  /* ── Rinpa · Gold Rain — the botanical mass sits low and right; the gold field is the image ── */
  'rinpa-gold-rain': {
    type: { display: 'shippori', text: 'zenKaku', utility: 'notoSansJp' }, idea: 'One asymmetric mass of foliage against a generous gold field; the empty two-thirds are the composition.', ground: 'd',
    mark: (k, cx, cy, s) => `${C(cx, cy, s * .46, k.b)}${P(cx - s * .3, cy - s * .38, s * .36, s * .5, orn.leafPath(), k.c, { rotate: -28 })}${P(cx - s * .04, cy - s * .12, s * .3, s * .44, orn.leafPath(), k.c, { rotate: 18, opacity: .85 })}`,
    field: (k, x, y, w, h, i = 1) => `${dots(x, y, w, h, 86, k.b, { r: 3 * i, jitter: 40, seed: k.seed, opacity: .55 })}${[0, 1, 2, 3, 4].map(n => P(x + w * (.62 + n * .07), y + h * (.5 + (n % 2) * .3), 120 * i, 180 * i, orn.leafPath(), k.c, { rotate: -30 + n * 14, opacity: .35 + n * .1 })).join('')}`,
    opener: k => { const { w, h } = k; const gold = k.uid('g');
      k.defs.push(gradient(gold, [[0, k.b], [.55, mix(k.b, .08)], [1, k.b]], { angle: 20 }));
      const foliage = [[.62, .58, 300, 420, -34], [.71, .5, 260, 380, -8], [.8, .62, 240, 340, 22], [.7, .78, 200, 300, -50], [.88, .5, 180, 280, 40]].map(([px, py, lw, lh, rot], n) => enter(P(w * px, h * py, lw, lh, orn.leafPath(), n % 2 ? k.c : mix(k.c, -.25), { rotate: rot, opacity: .96 }), 'fade', { dur: k.beat * 2.2, delay: k.beat * (.6 + n * .35), ease: 'inOut' })).join('');
      return `${R(0, 0, w, h, `url(#${gold})`)}${dots(0, 0, w, h, 110, mix(k.b, -.18), { r: 2.2, jitter: 70, seed: k.seed, opacity: .5 })}
        ${drift(foliage, 0, -14, k.beat * 9)}
        ${enter(`${T(w * .08, h * .3, k.title, { font: 'shippori', size: h * .13, weight: 700, fill: k.a, fitW: w * .5 })}${L(w * .08, h * .35, w * .08 + 240, h * .35, k.a, 3)}${T(w * .08, h * .41, k.subtitle, { font: 'zenKaku', size: h * .028, weight: 400, fill: k.a, tracking: .12, fitW: w * .46 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 2.6 })}`; },
    lowerThird: k => { const { w, h } = k; // right-anchored, the way Rinpa leaves the left empty
      return lt(k, `${R(w * .5, h * .74, w * .44, h * .16, k.b)}${P(w * .5 - 70, h * .69, 150, 220, orn.leafPath(), k.c, { rotate: -32 })}${P(w * .53, h * .8, 90, 140, orn.leafPath(), mix(k.c, -.25), { rotate: 20 })}
        ${T(w * .92, h * .81, k.title, { font: 'shippori', size: h * .058, weight: 700, fill: k.a, anchor: 'end', fitW: w * .3 })}${T(w * .92, h * .86, k.subtitle, { font: 'zenKaku', size: h * .024, weight: 400, fill: k.a, anchor: 'end', tracking: .1, fitW: w * .3 })}`, 'slideR', { amount: 2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.d)}${R(0, 0, w * .36, h, k.b)}${dots(0, 0, w * .36, h, 90, mix(k.b, -.16), { r: 2, jitter: 50, seed: k.seed + 1, opacity: .5 })}
        ${[[.28, .2, 260, 380, -30], [.33, .5, 220, 320, 8], [.26, .74, 200, 300, -48]].map(([px, py, lw, lh, rot], n) => P(w * px, h * py, lw, lh, orn.leafPath(), n % 2 ? mix(k.c, -.2) : k.c, { rotate: rot })).join('')}
        ${slot(k, w * .44, h * .12, w * .5, h * .42, { tone: 'light', frame: k.b, frameWidth: 2 })}
        ${enter(`${T(w * .44, h * .68, k.title, { font: 'shippori', size: h * .08, weight: 700, fill: k.a, fitW: w * .5 })}${T(w * .44, h * .74, k.subtitle, { font: 'zenKaku', size: h * .026, fill: k.a, tracking: .1, weight: 400, fitW: w * .5 })}${[0, 1, 2].map(n => R(w * .44, h * (.8 + n * .04), w * (.34 - n * .06), 6, alpha(k.a, .35))).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Ukiyo Current — flat colour bands, one cropped wave, a publisher-scale cartouche ── */
  'ukiyo-current': {
    type: { display: 'shippori', text: 'zenKaku', utility: 'notoSansJp' }, idea: 'Three flat value bands and one wave cropped hard by the frame; the title lives in a vertical cartouche at print scale.', ground: 'a', titleCase: 'normal',
    mark: (k, cx, cy, s) => `${R(cx - s * .2, cy - s * .5, s * .4, s, k.c)}${P(cx - s * .5, cy - s * .1, s, s * .6, orn.wavePath(2, 30, 26), k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2].map(n => P(x - w * .1, y + h * (.2 + n * .28), w * 1.3, h * .32 * i, orn.wavePath(3 + n, 26, 30 - n * 6, n * 1.3), n % 2 ? k.b : k.d, { opacity: .9 - n * .2 })).join('')}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${R(0, h * .12, w, h * .3, k.d)}${R(0, h * .42, w, h * .04, mix(k.d, -.25))}
        ${enter(P(-w * .15, h * .3, w * 1.4, h * .62, orn.wavePath(2, 34, 34, .6), k.b), 'slideL', { dur: k.beat * 2.4, ease: 'expo', amount: 3 })}
        ${enter(P(w * .12, h * .45, w * 1.1, h * .5, orn.wavePath(3, 22, 22, 2.1), mix(k.b, -.3), { opacity: .9 }), 'slideL', { dur: k.beat * 2.6, delay: k.beat * .3, ease: 'expo', amount: 4 })}
        ${enter(`${R(w * .81, h * .1, w * .11, h * .56, k.c)}${T(w * .865, h * .16, '', { font: 'shippori', size: 10, fill: k.c })}${T(w * .865, h * .38, k.title, { font: 'shippori', size: h * .09, weight: 700, fill: k.d, anchor: 'middle', rotate: 90, fitW: h * .5 })}${R(w * .81, h * .68, w * .11, h * .06, k.d)}${T(w * .865, h * .72, k.subtitle, { font: 'zenKaku', size: h * .02, fill: k.a, anchor: 'middle', weight: 700, fitW: w * .1 })}`, 'slideD', { dur: k.beat * 1.4, delay: k.beat * 1.6, ease: 'expo' })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .72, w * .52, h * .19, k.d)}${P(w * .05, h * .72, w * .52, h * .19, orn.wavePath(4, 18, 16, 1), k.b, { opacity: .95 })}${R(w * .05, h * .72, w * .022, h * .19, k.c)}
        ${T(w * .095, h * .81, k.title, { font: 'shippori', size: h * .06, weight: 700, fill: k.a, fitW: w * .42 })}${T(w * .095, h * .87, k.subtitle, { font: 'zenKaku', size: h * .024, weight: 700, fill: k.a, tracking: .06, fitW: w * .42 })}`, 'wipeR', { dur: k.beat * 1.2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.d)}${R(0, 0, w, h * .18, k.a)}${slot(k, 0, h * .18, w * .6, h * .64, { tone: 'light', filter: undefined })}${P(-w * .05, h * .6, w * .75, h * .3, orn.wavePath(3, 30, 30, .4), k.b)}
        ${R(w * .6, h * .18, w * .4, h * .64, k.d)}${R(w * .6, h * .18, 8, h * .64, k.c)}
        ${enter(`${T(w * .64, h * .36, twoLines(k.title)[0], { font: 'shippori', size: h * .075, weight: 700, fill: k.a, lines: twoLines(k.title), fitW: w * .32 })}${T(w * .64, h * .6, k.subtitle, { font: 'zenKaku', size: h * .025, fill: k.a, weight: 400, fitW: w * .32 })}${[0, 1, 2, 3].map(n => R(w * .64, h * (.66 + n * .035), w * (.28 - (n % 2) * .05), 5, alpha(k.a, .3))).join('')}`, 'fade', { dur: k.beat * 1.8, delay: k.beat })}
        ${R(0, h * .82, w, h * .18, k.a)}${R(w * .05, h * .87, w * .3, h * .07, k.c)}`; },
  },

  /* ── Sumi Space — one pressure stroke reveals the frame; everything else waits for stillness ── */
  'sumi-space': {
    type: { display: 'shippori', text: 'zenKaku', utility: 'dmMono' }, idea: 'A single ink stroke crosses the paper and the title arrives only after it has stopped; nothing else moves.', ground: 'a', surface: 'INK',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .2, s, s * .4, orn.brushStrokePath(k.seed % 9), k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${P(x, y + h * .3, w, h * .4 * i, orn.brushStrokePath(2), k.b, { opacity: .9 })}${specks(x, y, w, h, 60, k.b, k.seed, .4)}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}
        ${enter(P(-w * .04, h * .38, w * 1.08, h * .34, orn.brushStrokePath(5), k.b), 'wipeR', { dur: k.beat * 2.2, ease: 'inOut' })}
        ${enter(`${C(w * .82, h * .22, 9, k.d)}${specks(w * .1, h * .3, w * .8, h * .5, 90, k.b, k.seed, .5)}`, 'fade', { dur: k.beat, delay: k.beat * 2 })}
        ${enter(`${T(w * .1, h * .8, k.title, { font: 'shippori', size: h * .1, weight: 500, fill: k.b, fitW: w * .6 })}${T(w * .1, h * .86, k.subtitle, { font: 'zenKaku', size: h * .026, weight: 300, fill: k.c, tracking: .16, fitW: w * .6 })}`, 'fade', { dur: k.beat * 2.4, delay: k.beat * 3.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .04, h * .74, w * .52, h * .22, alpha(k.a, .92))}${P(w * .04, h * .7, w * .5, h * .12, orn.brushStrokePath(3), k.b)}${T(w * .07, h * .88, k.title, { font: 'shippori', size: h * .062, weight: 500, fill: k.b, fitW: w * .44 })}${T(w * .07, h * .93, k.subtitle, { font: 'zenKaku', size: h * .022, weight: 300, fill: k.c, tracking: .14, fitW: w * .44 })}${C(w * .53, h * .72, 6, k.d)}`, 'wipeR', { dur: k.beat * 2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${slot(k, w * .08, h * .1, w * .5, h * .7, { tone: 'light', filter: k.uid('m'), silent: false })}${P(w * .02, h * .64, w * .62, h * .22, orn.brushStrokePath(7), k.b, { opacity: .92 })}
        ${enter(`${T(w * .64, h * .3, twoLines(k.title)[0], { font: 'shippori', size: h * .07, weight: 500, fill: k.b, lines: twoLines(k.title), fitW: w * .3 })}${T(w * .64, h * .52, k.subtitle, { font: 'zenKaku', size: h * .024, weight: 300, fill: k.c, tracking: .12, fitW: w * .3 })}${[0, 1, 2, 3, 4].map(n => R(w * .64, h * (.58 + n * .034), w * (.26 - (n % 3) * .04), 3, alpha(k.b, .35))).join('')}${C(w * .9, h * .86, 8, k.d)}`, 'fade', { dur: k.beat * 2, delay: k.beat * 1.5 })}`; },
  },

  /* ── Song Mist Atlas — four atmospheric planes, the camera travels laterally ── */
  'song-mist': {
    type: { display: 'notoSerifJp', text: 'manrope', utility: 'jetbrains' }, idea: 'Four layered mountain planes fade into mist; the title anchors like a colophon in the empty upper air.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${PolyG([[cx - s * .5, cy + s * .45], [cx - s * .15, cy - s * .35], [cx + s * .1, cy + s * .1], [cx + s * .3, cy - s * .2], [cx + s * .5, cy + s * .45]], k.b)}${R(cx - s * .5, cy + s * .2, s, s * .25, alpha(k.a, .55))}`,
    field: (k, x, y, w, h, i = 1) => [0, 1, 2, 3].map(n => { const yy = y + h * (.35 + n * .16); return `${D(`M${x} ${yy + h * .2}L${x + w * .1} ${yy - h * (.12 + n * .02)}L${x + w * .25} ${yy + h * .05}L${x + w * .42} ${yy - h * .18}L${x + w * .55} ${yy}L${x + w * .7} ${yy - h * .1}L${x + w * .85} ${yy + h * .06}L${x + w} ${yy - h * .05}L${x + w} ${y + h}L${x} ${y + h}Z`, mix(k.b, n * .18), { opacity: .9 })}`; }).join('') + R(x, y + h * .5, w, h * .5, `url(#${k.uid('mist')})`),
    opener: k => { const { w, h } = k; const mist = k.uid('mist'); k.defs.push(gradient(mist, [[0, k.a, 0], [1, k.a, .7]], { angle: 180 }));
      // Four planes, each a clear step lighter than the one in front of it, and each with its own skyline.
      const plane = (n: number, yy: number, col: string) => D(`M0 ${yy + h * .3}L${w * (.06 + n * .05)} ${yy - h * .1}L${w * (.16 + n * .04)} ${yy + h * .06}L${w * (.3 - n * .03)} ${yy - h * .22}L${w * .4} ${yy - h * .02}L${w * (.52 + n * .04)} ${yy - h * .14}L${w * .66} ${yy + h * .08}L${w * (.8 - n * .04)} ${yy - h * .12}L${w * .92} ${yy + h * .02}L${w} ${yy - h * .06}L${w} ${h}L0 ${h}Z`, col);
      return `${R(0, 0, w, h, k.a)}${[3, 2, 1, 0].map(n => drift(plane(n, h * (.4 + n * .13), mix(k.b, n * .24)), -40 * (4 - n), 0, k.beat * (14 + n * 3))).join('')}${R(0, h * .5, w, h * .5, `url(#${mist})`)}
        ${enter(`${T(w * .72, h * .24, k.title, { font: 'notoSerifJp', size: h * .07, weight: 600, fill: k.b, anchor: 'start', fitW: w * .24 })}${L(w * .72, h * .28, w * .72 + 80, h * .28, k.d, 2)}${T(w * .72, h * .33, k.subtitle, { font: 'manrope', size: h * .022, weight: 400, fill: k.c, tracking: .08, fitW: w * .24 })}`, 'fade', { dur: k.beat * 2.5, delay: k.beat * 1.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .77, w * .46, h * .13, alpha(k.a, .92))}${D(`M${w * .05} ${h * .77}L${w * .1} ${h * .7}L${w * .16} ${h * .77}Z`, k.b)}${L(w * .05, h * .9, w * .51, h * .9, k.d, 3)}
        ${T(w * .08, h * .84, k.title, { font: 'notoSerifJp', size: h * .05, weight: 600, fill: k.b, fitW: w * .4 })}${T(w * .08, h * .88, k.subtitle, { font: 'manrope', size: h * .021, weight: 400, fill: k.c, tracking: .06, fitW: w * .4 })}`, 'fade', { dur: k.beat * 1.6 }); },
    fullPage: k => { const { w, h } = k; const mist = k.uid('mist'); k.defs.push(gradient(mist, [[0, k.a, 0], [1, k.a, .9]], { angle: 180 }));
      return `${R(0, 0, w, h, k.a)}${slot(k, 0, 0, w, h * .62, { tone: 'light', silent: true })}${R(0, h * .3, w, h * .32, `url(#${mist})`)}
        ${R(w * .08, h * .5, w * .84, h * .42, alpha(k.a, .94))}${L(w * .08, h * .5, w * .92, h * .5, k.d, 3)}
        ${enter(`${T(w * .12, h * .62, k.title, { font: 'notoSerifJp', size: h * .07, weight: 600, fill: k.b, fitW: w * .5 })}${T(w * .12, h * .68, k.subtitle, { font: 'manrope', size: h * .024, weight: 400, fill: k.c, tracking: .06, fitW: w * .5 })}${[0, 1, 2, 3].map(n => T(w * .12, h * (.76 + n * .035), ['Plane I · far ridge', 'Plane II · mid ridge', 'Plane III · water', 'Plane IV · near shore'][n], { font: 'jetbrains', size: h * .018, weight: 400, fill: k.c, tracking: .08 })).join('')}${slot(k, w * .62, h * .56, w * .26, h * .3, { tone: 'light', frame: k.d })}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Dancheong Rhythm — interlocking painted-beam modules; the grid hinges, it doesn't sparkle ── */
  'dancheong-rhythm': {
    type: { display: 'archivo', text: 'dmSans', utility: 'spaceGrotesk' }, idea: 'Beam-end modules interlock into a modular grid: five-colour bands, hard edges, architectural weight.', ground: 'd', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s, s, k.a)}${R(cx - s * .38, cy - s * .38, s * .76, s * .76, k.b)}${R(cx - s * .26, cy - s * .26, s * .52, s * .52, k.c)}${C(cx, cy, s * .14, k.d)}`,
    field: (k, x, y, w, h, i = 1) => { const cell = 120; const out: string[] = []; for (let j = 0; j * cell < h; j++) for (let n = 0; n * cell < w; n++) { const col = [k.a, k.b, k.c][(n + j) % 3]; out.push(R(x + n * cell + 6, y + j * cell + 6, cell - 12, cell - 12, col, { opacity: .85 * i })); if ((n + j) % 2 === 0) out.push(R(x + n * cell + 30, y + j * cell + 30, cell - 60, cell - 60, k.d, { opacity: .9 })); } return out.join(''); },
    opener: k => { const { w, h } = k; const cell = 160; const bands = [k.a, k.b, k.c, mix(k.b, .35), k.a];
      const mods = Array.from({ length: 12 }, (_, n) => { const col = n % 3, row = Math.floor(n / 3); const x = w * .06 + col * cell * 1.15, y = h * .12 + row * cell * 1.15; return enter(`${R(x, y, cell, cell, bands[n % 5])}${R(x + cell * .22, y + cell * .22, cell * .56, cell * .56, bands[(n + 2) % 5])}${R(x + cell * .4, y + cell * .4, cell * .2, cell * .2, k.d)}`, n % 2 ? 'growX' : 'growY', { dur: k.beat, delay: k.beat * .12 * n, ease: 'expo', origin: [x, y] }); }).join('');
      return `${R(0, 0, w, h, k.d)}${stripes(0, 0, w, h, 9, 3, alpha(k.a, .12))}${mods}
        ${enter(`${R(w * .56, h * .12, w * .38, h * .62, k.a)}${stripes(w * .56, h * .12, w * .38, h * .62, 6, 14, k.b, { vertical: true })}${R(w * .56, h * .5, w * .38, h * .24, k.d)}${T(w * .58, h * .61, k.title, { font: 'archivo', size: h * .075, weight: 900, fill: k.a, upper: true, fitW: w * .34 })}${T(w * .58, h * .68, k.subtitle, { font: 'dmSans', size: h * .024, weight: 500, fill: k.b, tracking: .1, upper: true, fitW: w * .34 })}`, 'slideR', { dur: k.beat * 1.4, delay: k.beat * 1.4, ease: 'expo', amount: 2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .73, h * .17, h * .17, k.a)}${R(w * .05 + h * .04, h * .77, h * .09, h * .09, k.b)}${R(w * .05 + h * .065, h * .795, h * .04, h * .04, k.d)}${R(w * .05 + h * .17, h * .73, w * .46, h * .17, k.c)}${stripes(w * .05 + h * .17, h * .73, w * .46, h * .17, 5, 8, k.b, { vertical: false, opacity: .35 })}
        ${T(w * .05 + h * .2, h * .81, k.title, { font: 'archivo', size: h * .056, weight: 900, fill: k.d, upper: true, fitW: w * .4 })}${T(w * .05 + h * .2, h * .865, k.subtitle, { font: 'dmSans', size: h * .022, weight: 500, fill: k.d, tracking: .1, upper: true, fitW: w * .4 })}`, 'growX', { origin: [w * .05, h * .8] }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.d)}${R(0, 0, w, h * .1, k.a)}${stripes(0, 0, w, h * .1, 24, 30, k.b, { vertical: true, opacity: .8 })}${R(0, h * .9, w, h * .1, k.a)}${stripes(0, h * .9, w, h * .1, 24, 30, k.c, { vertical: true, opacity: .8 })}
        ${slot(k, w * .06, h * .16, w * .46, h * .68, { tone: 'light', frame: k.b, frameWidth: 8 })}
        ${enter(`${R(w * .56, h * .16, w * .38, h * .1, k.b)}${T(w * .575, h * .23, k.eyebrow, { font: 'spaceGrotesk', size: h * .028, weight: 700, fill: k.d, upper: true, tracking: .14 })}${T(w * .56, h * .4, twoLines(k.title)[0], { font: 'archivo', size: h * .08, weight: 900, fill: k.a, upper: true, lines: twoLines(k.title), fitW: w * .38 })}${T(w * .56, h * .62, k.subtitle, { font: 'dmSans', size: h * .025, weight: 500, fill: k.a, fitW: w * .38 })}${[0, 1, 2].map(n => R(w * .56 + n * w * .1, h * .7, w * .08, h * .08, [k.a, k.b, k.c][n])).join('')}`, 'slideU', { dur: k.beat * 1.4, delay: k.beat * .8, ease: 'expo' })}`; },
  },

  /* ── Persian Garden Index — nested borders drawn in four directions, the field blooms from the centre ── */
  'persian-garden': {
    type: { display: 'amiri', text: 'cairo', utility: 'reemKufi' }, idea: 'Five nested borders of different weights hold a chahar-bagh: four quarters, two channels, one centre.', ground: 'd', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s, s, 'none', { stroke: k.b, sw: s * .05 })}${R(cx - s * .38, cy - s * .38, s * .76, s * .76, 'none', { stroke: k.a, sw: s * .02 })}${L(cx, cy - s * .38, cx, cy + s * .38, k.c, s * .04)}${L(cx - s * .38, cy, cx + s * .38, cy, k.c, s * .04)}${P(cx - s * .16, cy - s * .16, s * .32, s * .32, orn.eightStarPath(), k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${starTess(x, y, w, h, 140, alpha(k.b, .55 * i), alpha(k.a, .3 * i))}`,
    opener: k => { const { w, h } = k; const m = w * .06, ih = h * .84, iw = w - 2 * m;
      const border = (inset: number, col: string, sw: number, delay: number) => enter(R(m + inset, h * .08 + inset, iw - 2 * inset, ih - 2 * inset, 'none', { stroke: col, sw }), 'draw', { dur: k.beat * 1.6, delay, ease: 'inOut' });
      return `${R(0, 0, w, h, k.d)}${border(0, k.a, 14, 0)}${border(22, k.b, 3, k.beat * .3)}${border(34, k.a, 2, k.beat * .5)}${border(48, k.c, 8, k.beat * .7)}${border(62, k.b, 2, k.beat * .9)}
        ${enter(`${L(w / 2, h * .16, w / 2, h * .84, k.c, 10)}${L(m + 80, h / 2, w - m - 80, h / 2, k.c, 10)}${L(w / 2, h * .16, w / 2, h * .84, k.d, 3)}${L(m + 80, h / 2, w - m - 80, h / 2, k.d, 3)}`, 'growY', { dur: k.beat * 1.2, delay: k.beat * 1.2, ease: 'expo', origin: [w / 2, h / 2] })}
        ${enter(`${starTess(m + 80, h * .16, w * .38, h * .3, 110, alpha(k.b, .45), alpha(k.a, .25))}${starTess(w * .52, h * .54, w * .38, h * .3, 110, alpha(k.b, .45), alpha(k.a, .25))}`, 'fade', { dur: k.beat * 2, delay: k.beat * 1.8 })}
        ${enter(`${R(w * .34, h * .4, w * .32, h * .2, k.d)}${R(w * .34, h * .4, w * .32, h * .2, 'none', { stroke: k.b, sw: 4 })}${P(w * .49, h * .375, 40, 40, orn.eightStarPath(), k.b)}${T(w / 2, h * .5, k.title, { font: 'amiri', size: h * .062, weight: 700, fill: k.a, anchor: 'middle', fitW: w * .28 })}${T(w / 2, h * .56, k.subtitle, { font: 'cairo', size: h * .022, weight: 400, fill: k.c, anchor: 'middle', tracking: .08, fitW: w * .28 })}`, 'pop', { dur: k.beat * 1.2, delay: k.beat * 2.4, ease: 'back', origin: [w / 2, h / 2] })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .74, w * .48, h * .16, k.d)}${R(w * .05, h * .74, w * .48, h * .16, 'none', { stroke: k.a, sw: 10 })}${R(w * .05 + 16, h * .74 + 16, w * .48 - 32, h * .16 - 32, 'none', { stroke: k.b, sw: 2 })}${R(w * .05 + 26, h * .74 + 26, w * .48 - 52, h * .16 - 52, 'none', { stroke: k.c, sw: 4 })}${P(w * .07, h * .78, 70, 70, orn.eightStarPath(), k.b)}
        ${T(w * .12, h * .81, k.title, { font: 'amiri', size: h * .055, weight: 700, fill: k.a, fitW: w * .38 })}${T(w * .12, h * .86, k.subtitle, { font: 'cairo', size: h * .022, weight: 400, fill: k.c, tracking: .08, fitW: w * .38 })}`, 'growX', { origin: [w * .29, h * .82] }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.d)}${R(w * .04, h * .06, w * .92, h * .88, 'none', { stroke: k.a, sw: 12 })}${R(w * .04 + 20, h * .06 + 20, w * .92 - 40, h * .88 - 40, 'none', { stroke: k.b, sw: 2 })}${R(w * .04 + 32, h * .06 + 32, w * .92 - 64, h * .88 - 64, 'none', { stroke: k.c, sw: 6 })}
        ${slot(k, w * .09, h * .13, w * .4, h * .74, { tone: 'light', frame: k.b, frameWidth: 3 })}${starTess(w * .09, h * .13, w * .4, h * .74, 120, alpha(k.b, .2), undefined)}
        ${enter(`${T(w * .54, h * .3, twoLines(k.title)[0], { font: 'amiri', size: h * .078, weight: 700, fill: k.a, lines: twoLines(k.title), fitW: w * .38 })}${L(w * .54, h * .5, w * .9, h * .5, k.c, 4)}${T(w * .54, h * .56, k.subtitle, { font: 'cairo', size: h * .025, fill: k.c, weight: 400, fitW: w * .38 })}${[0, 1, 2, 3, 4].map(n => R(w * .54, h * (.63 + n * .04), w * (.34 - (n % 2) * .08), 5, alpha(k.a, .3))).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Maghrebi Zellige Signal — stars build from straight segments, then the lattice opens for footage ── */
  'zellige-signal': {
    type: { display: 'cairo', text: 'dmSans', utility: 'reemKufi' }, idea: 'An eight-fold lattice constructs itself segment by segment, then opens a clean aperture for the footage.', ground: 'd', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .5, s, s, orn.eightStarPath(), k.a)}${P(cx - s * .3, cy - s * .3, s * .6, s * .6, orn.eightStarPath(), k.b, { rotate: 22.5 })}${C(cx, cy, s * .1, k.c)}`,
    field: (k, x, y, w, h, i = 1) => starTess(x, y, w, h, 150, alpha(k.a, .8 * i), alpha(k.b, .7 * i)),
    opener: k => { const { w, h } = k; const cell = 190;
      const lattice: string[] = []; let idx = 0;
      for (let j = 0; j * cell <= h; j++) for (let n = 0; n * cell <= w; n++) { const cx = n * cell, cy = j * cell; lattice.push(enter(`${P(cx - cell * .5, cy - cell * .5, cell, cell, orn.eightStarPath(), (n + j) % 2 ? k.a : k.b)}${P(cx - cell * .2, cy - cell * .2, cell * .4, cell * .4, orn.eightStarPath(), k.d, { rotate: 22.5 })}`, 'pop', { dur: k.beat * .8, delay: k.beat * .04 * idx++, ease: 'back', origin: [cx, cy] })); }
      return `${R(0, 0, w, h, k.d)}${lattice.join('')}
        ${enter(`${R(w * .22, h * .16, w * .56, h * .68, k.d)}${R(w * .22, h * .16, w * .56, h * .68, 'none', { stroke: k.c, sw: 10 })}${slot(k, w * .24, h * .19, w * .52, h * .42, { tone: 'light' })}${T(w / 2, h * .72, k.title, { font: 'cairo', size: h * .07, weight: 900, fill: k.a, anchor: 'middle', upper: true, tracking: .04, fitW: w * .5 })}${T(w / 2, h * .78, k.subtitle, { font: 'dmSans', size: h * .022, weight: 500, fill: k.b, anchor: 'middle', tracking: .12, upper: true, fitW: w * .5 })}`, 'growY', { dur: k.beat * 1.4, delay: k.beat * 2.6, ease: 'expo', origin: [w / 2, h / 2] })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${starTess(w * .05, h * .72, w * .12, h * .18, k.a, k.b)}${R(w * .17, h * .74, w * .38, h * .15, k.d)}${R(w * .17, h * .74, w * .38, h * .15, 'none', { stroke: k.c, sw: 6 })}
        ${T(w * .19, h * .815, k.title, { font: 'cairo', size: h * .052, weight: 900, fill: k.a, upper: true, fitW: w * .33 })}${T(w * .19, h * .86, k.subtitle, { font: 'dmSans', size: h * .021, weight: 500, fill: k.b, tracking: .1, upper: true, fitW: w * .33 })}`, 'slideL', { amount: 2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.d)}${starTess(0, 0, w, h * .14, 130, k.a, k.b)}${starTess(0, h * .86, w, h * .14, 130, k.b, k.a)}
        ${slot(k, w * .06, h * .2, w * .5, h * .6, { tone: 'light', frame: k.c, frameWidth: 6 })}
        ${enter(`${T(w * .6, h * .38, twoLines(k.title)[0], { font: 'cairo', size: h * .08, weight: 900, fill: k.a, upper: true, lines: twoLines(k.title), fitW: w * .34 })}${R(w * .6, h * .58, w * .1, 8, k.c)}${T(w * .6, h * .65, k.subtitle, { font: 'dmSans', size: h * .025, weight: 500, fill: k.b, fitW: w * .34 })}${[0, 1, 2].map(n => P(w * (.6 + n * .06), h * .7, 60, 60, orn.eightStarPath(), [k.a, k.b, k.c][n])).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Mashrabiya Light — apertures rotate by fractions; bands of light cross the portrait plane ── */
  'mashrabiya-light': {
    type: { display: 'cairo', text: 'karla', utility: 'reemKufi' }, idea: 'A turned-wood screen of rotating apertures throws moving light across the subject; the type sits in the shade.', ground: 'a', surface: 'GLASS',
    mark: (k, cx, cy, s) => `${rings(cx, cy, [s * .45, s * .3], k.b, s * .06)}${radial(cx, cy, s * .12, s * .45, 8, k.b, s * .05)}`,
    field: (k, x, y, w, h, i = 1) => { const out: string[] = []; const cell = 96; for (let j = 0; j * cell < h; j++) for (let n = 0; n * cell < w; n++) { const cx = x + n * cell + cell / 2, cy = y + j * cell + cell / 2; out.push(`${C(cx, cy, cell * .38, 'none', { stroke: k.b, sw: 6 * i })}${radial(cx, cy, cell * .12, cell * .38, 6, k.b, 3 * i, { start: (n + j) * 15 })}`); } return `<g opacity=".7">${out.join('')}</g>`; },
    opener: k => { const { w, h } = k; const light = k.uid('lt'); k.defs.push(gradient(light, [[0, k.d, 0], [.5, k.d, .55], [1, k.d, 0]], { angle: 0 }));
      const cell = 120; const screen: string[] = [];
      for (let j = 0; j * cell < h; j++) for (let n = 0; n * cell < w * .55; n++) { const cx = n * cell + cell / 2, cy = j * cell + cell / 2; screen.push(rotateLoop(`${C(cx, cy, cell * .4, 'none', { stroke: k.b, sw: 7 })}${radial(cx, cy, cell * .1, cell * .4, 6, k.b, 4)}`, cx, cy, k.beat * (18 + (n + j) % 5 * 4), 0, (n + j) % 2 ? 60 : -60)); }
      return `${R(0, 0, w, h, k.a)}${slot(k, w * .5, h * .06, w * .46, h * .88, { tone: 'dark', shape: 'soft', rx: 26, filter: 'surface' })}${enter(`<g>${screen.join('')}</g>`, 'fade', { dur: k.beat * 2 })}
        ${drift(R(w * .3, 0, w * .3, h, `url(#${light})`, { blend: 'screen' }), w * .3, 0, k.beat * 12)}
        ${enter(`${R(w * .06, h * .66, w * .4, h * .22, alpha(k.dark, .7))}${T(w * .09, h * .76, k.title, { font: 'cairo', size: h * .064, weight: 700, fill: k.d, fitW: w * .34 })}${T(w * .09, h * .82, k.subtitle, { font: 'karla', size: h * .023, weight: 400, fill: k.b, tracking: .08, fitW: w * .34 })}`, 'slideU', { dur: k.beat * 1.4, delay: k.beat * 2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .74, w * .5, h * .16, alpha(k.dark, .78))}${[0, 1, 2].map(n => rotateLoop(`${C(w * .09 + n * 70, h * .82, 26, 'none', { stroke: k.b, sw: 4 })}${radial(w * .09 + n * 70, h * .82, 8, 26, 6, k.b, 2.5)}`, w * .09 + n * 70, h * .82, k.beat * 16, 0, n % 2 ? 60 : -60)).join('')}
        ${T(w * .22, h * .81, k.title, { font: 'cairo', size: h * .054, weight: 700, fill: k.d, fitW: w * .32 })}${T(w * .22, h * .86, k.subtitle, { font: 'karla', size: h * .022, weight: 400, fill: k.b, tracking: .08, fitW: w * .32 })}`, 'fade', { dur: k.beat * 1.4 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${GLOBAL_DESIGNS['mashrabiya-light'].field(k, 0, 0, w, h, .5)}${R(w * .1, h * .1, w * .8, h * .8, alpha(k.dark, .82))}
        ${slot(k, w * .13, h * .14, w * .34, h * .72, { tone: 'dark', shape: 'soft', rx: 18 })}
        ${enter(`${T(w * .52, h * .34, twoLines(k.title)[0], { font: 'cairo', size: h * .074, weight: 700, fill: k.d, lines: twoLines(k.title), fitW: w * .34 })}${L(w * .52, h * .52, w * .62, h * .52, k.b, 4)}${T(w * .52, h * .58, k.subtitle, { font: 'karla', size: h * .025, weight: 400, fill: k.b, fitW: w * .34 })}${[0, 1, 2, 3].map(n => R(w * .52, h * (.66 + n * .035), w * (.3 - (n % 2) * .06), 4, alpha(k.d, .3))).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Mughal Album Motion — the borders are the design; blossoms move sparingly ── */
  'mughal-album': {
    type: { display: 'cormorant', text: 'martel', utility: 'amiri' }, idea: 'An album page: nested hairline borders, a gold band, an ogee-headed image field, and botanical sprays only in the margins.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${P(cx - s * .4, cy - s * .5, s * .8, s, orn.ogeeArchPath(), k.b)}${P(cx - s * .28, cy - s * .3, s * .56, s * .8, orn.ogeeArchPath(), k.a)}${P(cx - s * .1, cy, s * .2, s * .34, orn.leafPath(), k.d)}`,
    field: (k, x, y, w, h, i = 1) => `${R(x + 12, y + 12, w - 24, h - 24, 'none', { stroke: k.d, sw: 6 * i })}${R(x + 26, y + 26, w - 52, h - 52, 'none', { stroke: k.b, sw: 1.5 })}${[0, 1, 2, 3, 4, 5].map(n => P(x + 30 + (n % 2) * (w - 120), y + 40 + n * (h / 6), 60, 90, orn.leafPath(), n % 2 ? k.c : k.b, { rotate: n % 2 ? 35 : -35, opacity: .8 })).join('')}`,
    opener: k => { const { w, h } = k; const m = 44;
      const borders = [[0, k.b, 14], [22, k.d, 3], [30, k.d, 1], [46, k.c, 8], [60, k.b, 1.5]].map(([i, col, sw], n) => enter(R(m + (i as number), m + (i as number), w - 2 * m - 2 * (i as number), h - 2 * m - 2 * (i as number), 'none', { stroke: col as string, sw: sw as number }), 'draw', { dur: k.beat * 1.4, delay: k.beat * .2 * n, ease: 'inOut' })).join('');
      const sprays = [[.1, .22, -30], [.1, .5, -20], [.1, .78, -40], [.86, .22, 30], [.86, .5, 20], [.86, .78, 40]].map(([px, py, rot], n) => enter(`${P(w * px, h * py, 70, 110, orn.leafPath(), n % 2 ? k.c : k.b, { rotate: rot })}${C(w * px + 35 + (rot > 0 ? 40 : -40), h * py + 10, 6, k.d)}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * (1.4 + n * .15) })).join('');
      return `${R(0, 0, w, h, k.a)}${borders}${sprays}
        ${enter(`${slot(k, w * .32, h * .12, w * .36, h * .56, { tone: 'light', shape: 'path', d: orn.ogeeArchPath(), frame: k.d, frameWidth: 3 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.6 })}
        ${enter(`${T(w / 2, h * .78, k.title, { font: 'cormorant', size: h * .07, weight: 600, fill: k.b, anchor: 'middle', italic: true, fitW: w * .5 })}${L(w * .4, h * .81, w * .6, h * .81, k.d, 1.5)}${T(w / 2, h * .855, k.subtitle, { font: 'martel', size: h * .022, weight: 400, fill: k.c, anchor: 'middle', tracking: .1, fitW: w * .5 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 2.6 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .74, w * .46, h * .16, k.a)}${R(w * .05 + 8, h * .74 + 8, w * .46 - 16, h * .16 - 16, 'none', { stroke: k.b, sw: 5 })}${R(w * .05 + 18, h * .74 + 18, w * .46 - 36, h * .16 - 36, 'none', { stroke: k.d, sw: 1.5 })}${P(w * .07, h * .77, 50, 80, orn.leafPath(), k.c, { rotate: -30 })}
        ${T(w * .12, h * .815, k.title, { font: 'cormorant', size: h * .06, weight: 600, fill: k.b, italic: true, fitW: w * .36 })}${T(w * .12, h * .86, k.subtitle, { font: 'martel', size: h * .021, weight: 400, fill: k.c, tracking: .08, fitW: w * .36 })}`, 'fade', { dur: k.beat * 1.6 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${GLOBAL_DESIGNS['mughal-album'].field(k, 0, 0, w, h, 1)}
        ${slot(k, w * .1, h * .12, w * .34, h * .76, { tone: 'light', shape: 'path', d: orn.ogeeArchPath(), frame: k.d, frameWidth: 3 })}
        ${enter(`${T(w * .5, h * .32, twoLines(k.title)[0], { font: 'cormorant', size: h * .08, weight: 600, fill: k.b, italic: true, lines: twoLines(k.title), fitW: w * .38 })}${L(w * .5, h * .52, w * .7, h * .52, k.d, 2)}${T(w * .5, h * .58, k.subtitle, { font: 'martel', size: h * .024, weight: 400, fill: k.c, fitW: w * .38 })}${[0, 1, 2, 3, 4].map(n => R(w * .5, h * (.65 + n * .036), w * (.36 - (n % 3) * .05), 3, alpha(k.b, .35))).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Chandigarh Civic Modern — brise-soleil modules cast sliding shadows; type locks into the grid ── */
  'chandigarh-grid': {
    type: { display: 'bigShoulders', text: 'tiro', utility: 'ibmPlexMono' }, idea: 'A concrete façade of sun-breaker cells; the shadow slides through them as the day moves, and the type is cast like signage.', ground: 'b', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s, s, k.a)}${[0, 1, 2].map(n => R(cx - s * .38 + n * s * .3, cy - s * .38, s * .18, s * .76, k.d)).join('')}${R(cx - s * .5, cy + s * .3, s, s * .2, k.c)}`,
    field: (k, x, y, w, h, i = 1) => { const out: string[] = []; const cw = 180, ch = 120; for (let j = 0; j * ch < h; j++) for (let n = 0; n * cw < w; n++) out.push(`${R(x + n * cw, y + j * ch, cw - 14, ch - 14, 'none', { stroke: k.a, sw: 10 * i })}${R(x + n * cw + 14, y + j * ch + 14, (cw - 42) * .5, ch - 42, alpha(k.dark, .35 * i))}`); return out.join(''); },
    opener: k => { const { w, h } = k; const cw = 220, ch = 150;
      const cells: string[] = []; for (let j = 0; j * ch < h * .88; j++) for (let n = 0; n * cw < w * .62; n++) { const x = w * .04 + n * cw, y = h * .06 + j * ch; cells.push(enter(`${R(x, y, cw - 16, ch - 16, k.a)}${R(x + 14, y + 14, cw - 44, ch - 44, k.b)}${drift(R(x + 14, y + 14, (cw - 44) * .55, ch - 44, alpha(k.dark, .55)), (cw - 44) * .45, 0, k.beat * 14)}`, 'fade', { dur: k.beat, delay: k.beat * .06 * (n + j * 3) })); }
      return `${R(0, 0, w, h, k.b)}${cells.join('')}
        ${enter(`${R(w * .68, h * .06, w * .28, h * .88, k.a)}${R(w * .68, h * .06, w * .28, h * .12, k.c)}${T(w * .7, h * .145, k.eyebrow, { font: 'ibmPlexMono', size: h * .03, weight: 700, fill: k.a, upper: true, tracking: .12 })}${T(w * .7, h * .5, twoLines(k.title)[0], { font: 'bigShoulders', size: h * .13, weight: 900, fill: k.d, upper: true, lines: twoLines(k.title), leading: .92, fitW: w * .25 })}${T(w * .7, h * .84, k.subtitle, { font: 'tiro', size: h * .024, weight: 400, fill: k.b, fitW: w * .24 })}${L(w * .7, h * .88, w * .94, h * .88, k.c, 6)}`, 'slideR', { dur: k.beat * 1.4, delay: k.beat * 1.6, ease: 'expo', amount: 2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .72, w * .5, h * .18, k.a)}${[0, 1, 2, 3].map(n => R(w * .06 + n * 52, h * .74, 34, h * .14, k.b)).join('')}${R(w * .06, h * .74, 34, h * .14, k.c)}
        ${T(w * .18, h * .815, k.title, { font: 'bigShoulders', size: h * .07, weight: 900, fill: k.d, upper: true, fitW: w * .35 })}${T(w * .18, h * .865, k.subtitle, { font: 'ibmPlexMono', size: h * .02, weight: 500, fill: k.b, tracking: .1, upper: true, fitW: w * .35 })}`, 'growX', { origin: [w * .05, h * .8] }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.b)}${GLOBAL_DESIGNS['chandigarh-grid'].field(k, 0, 0, w, h, .6)}${R(w * .06, h * .08, w * .88, h * .84, k.a)}
        ${slot(k, w * .1, h * .12, w * .42, h * .76, { tone: 'dark' })}
        ${enter(`${R(w * .56, h * .12, w * .34, h * .1, k.c)}${T(w * .575, h * .19, k.eyebrow, { font: 'ibmPlexMono', size: h * .03, weight: 700, fill: k.a, upper: true, tracking: .12 })}${T(w * .56, h * .42, twoLines(k.title)[0], { font: 'bigShoulders', size: h * .1, weight: 900, fill: k.d, upper: true, lines: twoLines(k.title), leading: .92, fitW: w * .34 })}${T(w * .56, h * .66, k.subtitle, { font: 'tiro', size: h * .025, weight: 400, fill: k.b, fitW: w * .34 })}${[0, 1, 2].map(n => R(w * .56, h * (.74 + n * .04), w * (.3 - (n % 2) * .08), 6, alpha(k.d, .3))).join('')}`, 'slideU', { dur: k.beat * 1.4, delay: k.beat * .6, ease: 'expo' })}`; },
  },

  /* ── Sahel Earth Signal — vertical earthen modules rise; timber rhythm; light exposes hand-built variance ── */
  'sahel-earth-signal': {
    type: { display: 'unbounded', text: 'workSans', utility: 'dmMono' }, idea: 'Tapering earthen towers with a rhythm of timber ends; light sweeps across to reveal hand-built variation.', ground: 'a', surface: 'TOPO',
    mark: (k, cx, cy, s) => `${PolyG([[cx - s * .4, cy + s * .5], [cx - s * .26, cy - s * .5], [cx + s * .26, cy - s * .5], [cx + s * .4, cy + s * .5]], k.b)}${[0, 1, 2, 3].map(n => R(cx - s * .34 + n * s * .2, cy - s * .18 + (n % 2) * s * .22, s * .1, s * .06, k.c)).join('')}`,
    field: (k, x, y, w, h, i = 1) => { const out: string[] = []; const r = orn.rng(k.seed); for (let n = 0; n * 150 < w; n++) { const th = h * (.45 + r() * .5); out.push(PolyG([[x + n * 150 + 10, y + h], [x + n * 150 + 30, y + h - th], [x + n * 150 + 120, y + h - th], [x + n * 150 + 140, y + h]], n % 2 ? k.b : mix(k.b, -.18), { opacity: .9 * i })); for (let t = 0; t < 4; t++) out.push(R(x + n * 150 + 40 + (t % 2) * 40, y + h - th + 30 + t * 40, 22, 10, k.c)); } return out.join(''); },
    opener: k => { const { w, h } = k; const sun = k.uid('s'); k.defs.push(gradient(sun, [[0, k.c, .9], [1, k.c, 0]], { radial: true, cx: .8, cy: .2, r: .5 }));
      const r = orn.rng(k.seed); const towers = Array.from({ length: 9 }, (_, n) => { const x = w * .04 + n * 150, th = h * (.42 + r() * .45); return enter(`${PolyG([[x, h], [x + 26, h - th], [x + 118, h - th], [x + 144, h]], n % 2 ? k.b : mix(k.b, -.16))}${[0, 1, 2, 3, 4].map(t => R(x + 44 + (t % 2) * 40, h - th + 40 + t * 46, 22, 10, k.c)).join('')}`, 'slideU', { dur: k.beat * 1.6, delay: k.beat * .1 * n, ease: 'expo', amount: 3 }); }).join('');
      return `${R(0, 0, w, h, k.a)}${R(0, 0, w, h, `url(#${sun})`)}${towers}
        ${drift(R(-w * .2, 0, w * .2, h, alpha(k.d, .18), { blend: 'screen' }), w * 1.4, 0, k.beat * 10)}
        ${enter(`${T(w * .58, h * .3, twoLines(k.title)[0], { font: 'unbounded', size: h * .085, weight: 800, fill: k.d, lines: twoLines(k.title), fitW: w * .38 })}${T(w * .58, h * .52, k.subtitle, { font: 'workSans', size: h * .024, weight: 400, fill: k.c, tracking: .06, fitW: w * .38 })}`, 'fade', { dur: k.beat * 2, delay: k.beat * 1.8 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${PolyG([[w * .05, h * .9], [w * .06, h * .7], [w * .53, h * .7], [w * .55, h * .9]], k.b)}${[0, 1, 2, 3, 4].map(n => R(w * .07 + n * 34, h * .72, 18, 8, k.c)).join('')}
        ${T(w * .08, h * .82, k.title, { font: 'unbounded', size: h * .052, weight: 800, fill: k.d, fitW: w * .42 })}${T(w * .08, h * .87, k.subtitle, { font: 'workSans', size: h * .021, weight: 400, fill: k.a, tracking: .06, fitW: w * .42 })}`, 'slideU', { amount: 1.6 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${GLOBAL_DESIGNS['sahel-earth-signal'].field(k, 0, h * .3, w, h * .7, .5)}
        ${PolyG([[w * .06, h * .92], [w * .08, h * .08], [w * .52, h * .08], [w * .54, h * .92]], k.b)}${slot(k, w * .11, h * .14, w * .38, h * .5, { tone: 'dark' })}${[0, 1, 2, 3, 4, 5].map(n => R(w * .12 + n * 60, h * .7, 24, 10, k.c)).join('')}
        ${enter(`${T(w * .6, h * .36, twoLines(k.title)[0], { font: 'unbounded', size: h * .08, weight: 800, fill: k.d, lines: twoLines(k.title), fitW: w * .34 })}${T(w * .6, h * .58, k.subtitle, { font: 'workSans', size: h * .025, weight: 400, fill: k.c, fitW: w * .34 })}${[0, 1, 2, 3].map(n => T(w * .6, h * (.66 + n * .04), ['Place', 'Makers', 'Material', 'Season'][n] + ' · replaceable', { font: 'dmMono', size: h * .019, weight: 500, fill: k.b, tracking: .08, upper: true })).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Diaspora Cosmic Score — polyrhythmic constellations resolve into one cadence ── */
  'diaspora-cosmic-score': {
    type: { display: 'unbounded', text: 'sora', utility: 'spaceGrotesk' }, idea: 'Rings on independent cycles — a radiant crown behind the portrait — lock into one cadence when the title lands.', ground: 'a', surface: 'GLOW',
    mark: (k, cx, cy, s) => `${rings(cx, cy, [s * .48, s * .36, s * .24], k.c, s * .035)}${radial(cx, cy, s * .1, s * .5, 12, k.b, s * .02)}${C(cx, cy, s * .09, k.d)}`,
    field: (k, x, y, w, h, i = 1) => `${dots(x, y, w, h, 60, k.c, { r: 1.6, jitter: 50, seed: k.seed, opacity: .7 * i })}${rings(x + w * .5, y + h * .5, [h * .2, h * .32, h * .44, h * .56], k.b, 3 * i, { opacity: .6 })}`,
    opener: k => { const { w, h } = k;
      const crown = [[h * .22, k.c, 8, 22], [h * .3, k.b, 4, 15], [h * .38, k.c, 12, 30], [h * .46, k.d, 2, 9], [h * .54, k.b, 6, 41]].map(([r, col, sw, dur], n) => rotateLoop(enter(C(w * .5, h * .46, r as number, 'none', { stroke: col as string, sw: sw as number, dash: n % 2 ? `${(r as number) * .6} ${(r as number) * .35}` : `${(r as number) * .25} ${(r as number) * .12}` }), 'pop', { dur: k.beat * 1.2, delay: k.beat * .18 * n, ease: 'back', origin: [w / 2, h * .46] }), w / 2, h * .46, k.beat * (dur as number), 0, n % 2 ? -360 : 360)).join('');
      return `${R(0, 0, w, h, k.a)}${dots(0, 0, w, h, 70, k.c, { r: 1.6, jitter: 60, seed: k.seed, opacity: .8 })}${crown}
        ${enter(slot(k, w * .5 - h * .17, h * .46 - h * .17, h * .34, h * .34, { tone: 'dark', shape: 'circle', frame: k.d, frameWidth: 3 }), 'pop', { dur: k.beat * 1.2, delay: k.beat, ease: 'back', origin: [w / 2, h * .46] })}
        ${enter(`${T(w / 2, h * .84, k.title, { font: 'unbounded', size: h * .075, weight: 800, fill: k.d, anchor: 'middle', fitW: w * .7 })}${T(w / 2, h * .9, k.subtitle, { font: 'sora', size: h * .024, weight: 400, fill: k.c, anchor: 'middle', tracking: .14, upper: true, fitW: w * .6 })}`, 'slideU', { dur: k.beat * 1.6, delay: k.beat * 1.8, ease: 'expo' })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${rotateLoop(`${rings(w * .1, h * .81, [h * .07, h * .05], k.c, 5, { dash: '40 20' })}${radial(w * .1, h * .81, h * .02, h * .07, 10, k.b, 2)}`, w * .1, h * .81, k.beat * 20)}${R(w * .17, h * .75, w * .4, h * .13, alpha(k.a, .85))}${L(w * .17, h * .88, w * .57, h * .88, k.d, 3)}
        ${T(w * .19, h * .815, k.title, { font: 'unbounded', size: h * .05, weight: 800, fill: k.d, fitW: w * .35 })}${T(w * .19, h * .86, k.subtitle, { font: 'sora', size: h * .021, weight: 400, fill: k.c, tracking: .12, upper: true, fitW: w * .35 })}`, 'slideL', { amount: 1.5 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${dots(0, 0, w, h, 64, k.c, { r: 1.4, jitter: 60, seed: k.seed + 3, opacity: .7 })}${rings(w * .3, h * .5, [h * .3, h * .38, h * .46], k.b, 4, { opacity: .5 })}
        ${slot(k, w * .3 - h * .24, h * .5 - h * .24, h * .48, h * .48, { tone: 'dark', shape: 'circle', frame: k.c, frameWidth: 4 })}
        ${enter(`${T(w * .58, h * .38, twoLines(k.title)[0], { font: 'unbounded', size: h * .08, weight: 800, fill: k.d, lines: twoLines(k.title), fitW: w * .36 })}${T(w * .58, h * .58, k.subtitle, { font: 'sora', size: h * .025, weight: 400, fill: k.c, fitW: w * .36 })}${[0, 1, 2, 3].map(n => R(w * .58, h * (.66 + n * .035), w * (.3 - (n % 2) * .07), 4, alpha(k.d, .3))).join('')}${[0, 1, 2].map(n => P(w * (.58 + n * .05), h * .8, 40, 40, orn.chevronPath(40), k.b)).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Anishinaabe-led Living Screen — a partner-ready frame; user images primary, fields for the community's own terms ── */
  'anishinaabe-led-screen': {
    type: { display: 'lexend', text: 'alegreya', utility: 'dmMono' }, idea: 'A context-first editorial frame: the image stays primary and the fields wait for the partner artist — no motif is assumed.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s, s, 'none', { stroke: k.b, sw: s * .06 })}${L(cx - s * .5, cy, cx + s * .5, cy, k.c, s * .06)}`,
    field: (k, x, y, w, h, i = 1) => `${R(x + 20, y + 20, w - 40, h - 40, 'none', { stroke: k.b, sw: 3 * i })}${[0, 1, 2].map(n => L(x + 40, y + 60 + n * (h - 100) / 3, x + w - 40, y + 60 + n * (h - 100) / 3, alpha(k.b, .4), 2)).join('')}`,
    opener: k => { const { w, h } = k;
      const fields = ['Community / Nation', 'Language(s)', 'Territory acknowledgment', 'Protocols & permissions', 'Artist & credit'];
      return `${R(0, 0, w, h, k.a)}${enter(slot(k, w * .05, h * .08, w * .56, h * .84, { tone: 'light', caption: 'Partner-supplied image' }), 'fade', { dur: k.beat * 2 })}
        ${enter(`${R(w * .64, h * .08, w * .31, h * .84, 'none', { stroke: k.b, sw: 3 })}${T(w * .67, h * .2, twoLines(k.title)[0], { font: 'lexend', size: h * .06, weight: 700, fill: k.b, lines: twoLines(k.title), fitW: w * .26 })}${T(w * .67, h * .34, k.subtitle, { font: 'alegreya', size: h * .024, weight: 400, fill: k.c, fitW: w * .26 })}${fields.map((f, n) => `${L(w * .67, h * (.42 + n * .095), w * .92, h * (.42 + n * .095), alpha(k.b, .5), 2)}${T(w * .67, h * (.47 + n * .095), f, { font: 'dmMono', size: h * .018, weight: 500, fill: k.b, tracking: .1, upper: true })}${T(w * .67, h * (.505 + n * .095), 'To be supplied by the partner', { font: 'alegreya', size: h * .02, weight: 400, fill: k.d, italic: true })}`).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * 1.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .74, w * .48, h * .16, k.a)}${R(w * .05, h * .74, w * .48, h * .16, 'none', { stroke: k.b, sw: 3 })}${R(w * .05, h * .74, 12, h * .16, k.c)}
        ${T(w * .08, h * .81, k.title, { font: 'lexend', size: h * .05, weight: 700, fill: k.b, fitW: w * .42 })}${T(w * .08, h * .86, k.subtitle, { font: 'alegreya', size: h * .022, weight: 400, fill: k.c, fitW: w * .42 })}`, 'fade', { dur: k.beat * 1.4 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${R(w * .05, h * .07, w * .9, h * .86, 'none', { stroke: k.b, sw: 3 })}${slot(k, w * .08, h * .1, w * .5, h * .8, { tone: 'light', caption: 'Partner-supplied image' })}
        ${enter(`${T(w * .62, h * .24, twoLines(k.title)[0], { font: 'lexend', size: h * .06, weight: 700, fill: k.b, lines: twoLines(k.title), fitW: w * .3 })}${T(w * .62, h * .4, k.subtitle, { font: 'alegreya', size: h * .024, weight: 400, fill: k.c, fitW: w * .3 })}${['Community / Nation', 'Language(s)', 'Protocols & permissions', 'Artist & credit'].map((f, n) => `${L(w * .62, h * (.5 + n * .1), w * .92, h * (.5 + n * .1), alpha(k.b, .5), 2)}${T(w * .62, h * (.545 + n * .1), f, { font: 'dmMono', size: h * .018, weight: 500, fill: k.b, tracking: .1, upper: true })}`).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Diné-led Horizon System — a horizon, a pace, and editable neutral masks until commissioned work arrives ── */
  'diné-led-horizon': {
    type: { display: 'lexend', text: 'lora', utility: 'ibmPlexMono' }, idea: 'One long horizon line and a slow pace; landscape and portrait sit in neutral masks awaiting the partner\'s authored elements.', ground: 'a', surface: 'TOPO',
    mark: (k, cx, cy, s) => `${L(cx - s * .5, cy, cx + s * .5, cy, k.b, s * .08)}${C(cx + s * .2, cy - s * .22, s * .12, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2].map(n => L(x, y + h * (.5 + n * .14), x + w, y + h * (.5 + n * .14), alpha(k.b, .6 - n * .15), 3 * i)).join('')}`,
    opener: k => { const { w, h } = k; const sky = k.uid('sky'); k.defs.push(gradient(sky, [[0, mix(k.a, .06)], [1, k.a]], { angle: 180 }));
      return `${R(0, 0, w, h, `url(#${sky})`)}${enter(slot(k, 0, h * .08, w, h * .52, { tone: 'light', caption: 'Landscape · partner-supplied', silent: false }), 'fade', { dur: k.beat * 2.4 })}
        ${enter(L(0, h * .6, w, h * .6, k.b, 6), 'growX', { dur: k.beat * 2.2, ease: 'inOut', origin: [0, h * .6] })}
        ${enter(`${L(0, h * .68, w, h * .68, alpha(k.b, .5), 2)}${L(0, h * .76, w, h * .76, alpha(k.b, .3), 2)}`, 'fade', { dur: k.beat * 2, delay: k.beat * 1.6 })}
        ${enter(`${T(w * .06, h * .74, k.title, { font: 'lexend', size: h * .07, weight: 600, fill: k.b, fitW: w * .6 })}${T(w * .06, h * .8, k.subtitle, { font: 'lora', size: h * .024, weight: 400, fill: k.c, fitW: w * .6 })}${T(w * .06, h * .9, 'Horizon, pace and transitions defined with the commissioned artist', { font: 'ibmPlexMono', size: h * .017, weight: 400, fill: k.d, tracking: .06, upper: true })}`, 'fade', { dur: k.beat * 2.4, delay: k.beat * 2.4 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${L(w * .05, h * .76, w * .55, h * .76, k.b, 5)}${T(w * .06, h * .83, k.title, { font: 'lexend', size: h * .05, weight: 600, fill: k.b, fitW: w * .46 })}${T(w * .06, h * .875, k.subtitle, { font: 'lora', size: h * .022, weight: 400, fill: k.c, fitW: w * .46 })}${C(w * .55, h * .76, 7, k.c)}`, 'growX', { origin: [w * .05, h * .76], dur: k.beat * 2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${slot(k, 0, 0, w, h * .56, { tone: 'light', caption: 'Landscape · partner-supplied' })}${L(0, h * .56, w, h * .56, k.b, 6)}${slot(k, w * .06, h * .3, w * .22, h * .5, { tone: 'light', caption: 'Portrait', frame: k.a, frameWidth: 6 })}
        ${enter(`${T(w * .34, h * .68, twoLines(k.title)[0], { font: 'lexend', size: h * .065, weight: 600, fill: k.b, lines: twoLines(k.title), fitW: w * .58 })}${T(w * .34, h * .82, k.subtitle, { font: 'lora', size: h * .024, weight: 400, fill: k.c, fitW: w * .58 })}${T(w * .34, h * .9, 'No weaving, sacred or ceremonial motifs without explicit authorization', { font: 'ibmPlexMono', size: h * .016, weight: 400, fill: k.d, tracking: .06, upper: true })}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Vitruvian Counterpoint — columns enter like fugue voices and resolve on a harmonic grid ── */
  'vitruvian-counterpoint': {
    type: { display: 'cinzel', text: 'marcellus', utility: 'tenor' }, idea: 'A colonnade of proportional fields entering in canon — each voice a beat behind — resolving under an entablature of three rules.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${L(cx - s * .5, cy - s * .42, cx + s * .5, cy - s * .42, k.b, s * .05)}${[-.3, 0, .3].map(o => R(cx + o * s - s * .07, cy - s * .3, s * .14, s * .7, k.c)).join('')}${L(cx - s * .5, cy + s * .42, cx + s * .5, cy + s * .42, k.b, s * .08)}`,
    field: (k, x, y, w, h, i = 1) => `${Array.from({ length: 8 }, (_, n) => R(x + n * (w / 8) + w / 32, y + h * .12, w / 16, h * .76, alpha(k.c, .35 * i))).join('')}${L(x, y + h * .12, x + w, y + h * .12, k.b, 6)}${L(x, y + h * .88, x + w, y + h * .88, k.b, 10)}`,
    opener: k => { const { w, h } = k; const φ = 1.618;
      const cols = [0, 1, 2, 3, 4].map(n => { const x = w * .08 + n * w * .17; return enter(`${R(x, h * .2, w * .12, h * .6, k.c, { opacity: .9 })}${stripes(x, h * .2, w * .12, h * .6, 6, 4, alpha(k.a, .5), { vertical: true })}${R(x - 8, h * .2, w * .12 + 16, 14, k.b)}${R(x - 12, h * .8 - 14, w * .12 + 24, 14, k.b)}`, 'slideU', { dur: k.beat * 1.4, delay: k.beat * .32 * n, ease: 'expo', amount: 1.5 }); }).join('');
      return `${R(0, 0, w, h, k.a)}${enter(`${L(w * .05, h * .14, w * .95, h * .14, k.b, 2)}${L(w * .05, h * .165, w * .95, h * .165, k.b, 6)}${L(w * .05, h * .19, w * .95, h * .19, k.b, 2)}`, 'growX', { dur: k.beat * 1.6, ease: 'inOut', origin: [w / 2, h * .16] })}${cols}
        ${enter(`${R(w * .05, h * .84, w * .9, h * .1, k.d)}${T(w / 2, h * .905, k.title, { font: 'cinzel', size: h * .055, weight: 700, fill: k.a, anchor: 'middle', tracking: .18, upper: true, fitW: w * .8 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * 2 })}
        ${enter(T(w / 2, h * .1, k.subtitle, { font: 'marcellus', size: h * .024, weight: 400, fill: k.b, anchor: 'middle', tracking: .2, upper: true, fitW: w * .7 }), 'fade', { dur: k.beat * 1.4, delay: k.beat * 2.6 })}
        ${T(w * .06, h * .6, `1 : ${φ.toFixed(3)}`, { font: 'tenor', size: h * .018, fill: k.b, tracking: .1, rotate: -90 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${L(w * .05, h * .73, w * .55, h * .73, k.b, 2)}${L(w * .05, h * .745, w * .55, h * .745, k.b, 6)}${R(w * .05, h * .76, w * .5, h * .14, k.d)}${[0, 1, 2].map(n => R(w * .06 + n * 30, h * .77, 14, h * .12, k.c)).join('')}
        ${T(w * .12, h * .83, k.title, { font: 'cinzel', size: h * .05, weight: 700, fill: k.a, tracking: .12, upper: true, fitW: w * .4 })}${T(w * .12, h * .875, k.subtitle, { font: 'marcellus', size: h * .021, weight: 400, fill: k.b, tracking: .14, upper: true, fitW: w * .4 })}`, 'slideU', { amount: 1.2 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${L(w * .05, h * .08, w * .95, h * .08, k.b, 2)}${L(w * .05, h * .1, w * .95, h * .1, k.b, 6)}${L(w * .05, h * .92, w * .95, h * .92, k.b, 8)}
        ${[0, 1].map(n => R(w * (.06 + n * .48), h * .14, w * .04, h * .74, k.c)).join('')}${slot(k, w * .12, h * .14, w * .4, h * .74, { tone: 'light', frame: k.b, frameWidth: 2 })}
        ${enter(`${T(w * .6, h * .32, twoLines(k.title)[0], { font: 'cinzel', size: h * .065, weight: 700, fill: k.a, tracking: .1, upper: true, lines: twoLines(k.title), fitW: w * .33 })}${L(w * .6, h * .5, w * .8, h * .5, k.b, 3)}${T(w * .6, h * .56, k.subtitle, { font: 'marcellus', size: h * .024, weight: 400, fill: k.b, fitW: w * .33 })}${[0, 1, 2, 3, 4].map(n => R(w * .6, h * (.63 + n * .036), w * (.3 - (n % 3) * .05), 3, alpha(k.a, .35))).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Wet Paint Insurrection — spray overshoots the frame; ink runs; headlines hold ── */
  'wet-paint-insurrection': {
    type: { display: 'permanentMarker', text: 'archivo', utility: 'specialElite' }, idea: 'The headline is stencilled and holds still while spray passes overshoot the frame and fresh drips run past it.', ground: 'a', surface: 'INK', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .5, s, s, orn.burstPath(12, k.seed % 7), k.c)}${T(cx, cy + s * .12, '!', { font: 'permanentMarker', size: s * .6, fill: k.a, anchor: 'middle' })}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2].map(n => P(x + w * (.1 + n * .3), y + h * .2, w * .28, h * .5, orn.brushStrokePath(n + 2), n % 2 ? k.c : k.d, { rotate: -8 + n * 6, opacity: .8 * i }))
      .join('')}${specks(x, y, w, h, 120 * i, k.b, k.seed, .6)}`,
    opener: k => { const { w, h } = k; const spray = k.uid('sp'); k.defs.push(`<filter id="${spray}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="3" seed="${k.seed % 40}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="22"/><feGaussianBlur stdDeviation="1.2"/></filter>`);
      const drips = [.22, .31, .47, .58, .71].map((px, n) => enter(R(w * px, h * .58, 14 + (n % 2) * 8, h * (.1 + (n % 3) * .12), k.c, { rx: 8 }), 'growY', { dur: k.beat * (2 + n * .4), delay: k.beat * (1.8 + n * .2), ease: 'in', origin: [w * px, h * .58] })).join('');
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 400, k.b, k.seed, .5)}
        ${enter(P(-w * .1, h * .1, w * .8, h * .5, orn.brushStrokePath(3), k.c, { filter: spray, rotate: -6 }), 'wipeR', { dur: k.beat * .7, ease: 'in' })}
        ${enter(P(w * .4, h * .3, w * .8, h * .5, orn.brushStrokePath(6), k.d, { filter: spray, rotate: 5, opacity: .9 }), 'wipeL', { dur: k.beat * .7, delay: k.beat * .5, ease: 'in' })}
        ${enter(`${R(w * .14, h * .42, w * .72, h * .2, k.b)}${T(w * .5, h * .57, k.title, { font: 'permanentMarker', size: h * .12, fill: k.a, anchor: 'middle', upper: true, fitW: w * .66 })}`, 'pop', { dur: k.beat * .5, delay: k.beat * 1.2, ease: 'back', origin: [w / 2, h / 2] })}${drips}
        ${enter(T(w * .5, h * .7, k.subtitle, { font: 'specialElite', size: h * .026, fill: k.b, anchor: 'middle', upper: true, tracking: .08, fitW: w * .6 }), 'fade', { dur: k.beat, delay: k.beat * 2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${P(w * .02, h * .68, w * .58, h * .26, orn.brushStrokePath(4), k.c, { rotate: -3 })}${R(w * .07, h * .77, w * .44, h * .11, k.b, { rotate: -1.5 })}${R(w * .12, h * .86, 10, h * .08, k.c, { rx: 5 })}
        ${T(w * .09, h * .855, k.title, { font: 'permanentMarker', size: h * .064, fill: k.a, upper: true, rotate: -1.5, fitW: w * .4 })}${T(w * .09, h * .92, k.subtitle, { font: 'specialElite', size: h * .022, fill: k.d, upper: true, tracking: .06, fitW: w * .4 })}`, 'wipeR', { dur: k.beat * .8, ease: 'in' }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${specks(0, 0, w, h, 500, k.b, k.seed + 5, .45)}${P(-w * .05, h * .04, w * .7, h * .36, orn.brushStrokePath(8), k.c, { rotate: -4 })}
        ${slot(k, w * .06, h * .3, w * .46, h * .58, { tone: 'light', rotate: -2, frame: k.b, frameWidth: 6 })}${R(w * .04, h * .28, w * .16, h * .05, k.b, { rotate: -6 })}
        ${enter(`${R(w * .55, h * .36, w * .4, h * .18, k.b, { rotate: 2 })}${T(w * .57, h * .49, k.title, { font: 'permanentMarker', size: h * .09, fill: k.a, upper: true, rotate: 2, fitW: w * .36 })}${T(w * .57, h * .6, k.subtitle, { font: 'archivo', size: h * .025, weight: 700, fill: k.b, upper: true, fitW: w * .38 })}${[0, 1, 2, 3].map(n => R(w * .57, h * (.66 + n * .04), w * (.3 - (n % 2) * .1), 8, alpha(k.b, .5), { rotate: n % 2 ? 1 : -1 })).join('')}${L(w * .57, h * .62, w * .84, h * .625, k.c, 6)}`, 'pop', { dur: k.beat * .6, delay: k.beat, ease: 'back', origin: [w * .75, h * .5] })}`; },
  },

  /* ── Post-Gravity Protocol — panels orbit a shared attractor with real occlusion ── */
  'post-gravity-protocol': {
    type: { display: 'michroma', text: 'archivo', utility: 'jetbrains' }, idea: 'Hairline panels orbit one attractor in true depth — near panels occlude far ones — and the title reads as a volumetric window.', ground: 'a', surface: 'GLOW', titleCase: 'upper',
    mark: (k, cx, cy, s) => `${E(cx, cy, s * .48, s * .18, 'none', { stroke: k.c, sw: s * .03 })}${E(cx, cy, s * .48, s * .18, 'none', { stroke: k.d, sw: s * .03, rotate: 60 })}${E(cx, cy, s * .48, s * .18, 'none', { stroke: k.c, sw: s * .03, rotate: -60 })}${C(cx, cy, s * .08, k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${dots(x, y, w, h, 48, k.c, { r: 1.2, opacity: .5 * i })}${[0, 1, 2].map(n => E(x + w / 2, y + h / 2, w * .4, h * .12, 'none', { stroke: n % 2 ? k.c : k.d, sw: 2 * i, rotate: n * 60 - 60, opacity: .6 })).join('')}`,
    opener: k => { const { w, h } = k; const glow = k.uid('gl'); k.defs.push(gradient(glow, [[0, k.c, .5], [1, k.c, 0]], { radial: true, cx: .5, cy: .5, r: .35 }));
      const panel = (rx: number, ry: number, rot: number, dur: number, col: string, dashed: boolean) => rotateLoop(`${E(w / 2, h / 2, rx, ry, 'none', { stroke: col, sw: 2, dash: dashed ? '30 18' : undefined, opacity: .9 })}${R(w / 2 + rx - 60, h / 2 - 34, 120, 68, alpha(k.a, .95), { stroke: col, sw: 2 })}${T(w / 2 + rx, h / 2 + 6, 'NODE', { font: 'jetbrains', size: 16, fill: col, anchor: 'middle', tracking: .2 })}`, w / 2, h / 2, k.beat * dur, rot, rot + 360);
      return `${R(0, 0, w, h, k.a)}${dots(0, 0, w, h, 48, k.c, { r: 1.1, opacity: .45 })}${R(0, 0, w, h, `url(#${glow})`)}
        ${enter(panel(h * .46, h * .14, 0, 26, k.c, true), 'fade', { dur: k.beat * 1.5 })}${enter(panel(h * .38, h * .3, 60, 34, k.d, false), 'fade', { dur: k.beat * 1.5, delay: k.beat * .4 })}
        ${enter(`${R(w * .36, h * .4, w * .28, h * .2, alpha(k.a, .92), { stroke: k.b, sw: 2 })}${T(w / 2, h * .51, k.title, { font: 'michroma', size: h * .05, fill: k.b, anchor: 'middle', upper: true, fitW: w * .24 })}${T(w / 2, h * .56, k.subtitle, { font: 'jetbrains', size: h * .018, fill: k.c, anchor: 'middle', tracking: .18, upper: true, fitW: w * .24 })}`, 'pop', { dur: k.beat, delay: k.beat * 1.2, ease: 'expo', origin: [w / 2, h / 2] })}
        ${enter(panel(h * .52, h * .22, -60, 40, k.c, false), 'fade', { dur: k.beat * 1.5, delay: k.beat * .8 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${rotateLoop(`${E(w * .11, h * .81, h * .08, h * .03, 'none', { stroke: k.c, sw: 2 })}${E(w * .11, h * .81, h * .08, h * .03, 'none', { stroke: k.d, sw: 2, rotate: 60 })}${E(w * .11, h * .81, h * .08, h * .03, 'none', { stroke: k.c, sw: 2, rotate: -60 })}`, w * .11, h * .81, k.beat * 24)}${R(w * .19, h * .75, w * .38, h * .12, alpha(k.a, .9), { stroke: k.c, sw: 1.5 })}
        ${T(w * .21, h * .805, k.title, { font: 'michroma', size: h * .04, fill: k.b, upper: true, fitW: w * .34 })}${T(w * .21, h * .85, k.subtitle, { font: 'jetbrains', size: h * .017, fill: k.c, tracking: .18, upper: true, fitW: w * .34 })}`, 'fade', { dur: k.beat }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${dots(0, 0, w, h, 48, k.c, { r: 1.1, opacity: .4 })}${[0, 1, 2].map(n => E(w * .32, h * .5, h * .42, h * .14, 'none', { stroke: n % 2 ? k.d : k.c, sw: 2, rotate: n * 60 - 60, opacity: .7 })).join('')}
        ${slot(k, w * .32 - h * .2, h * .3, h * .4, h * .4, { tone: 'dark', frame: k.c, frameWidth: 2 })}
        ${enter(`${R(w * .58, h * .3, w * .36, h * .4, alpha(k.a, .9), { stroke: k.c, sw: 1.5 })}${T(w * .6, h * .42, twoLines(k.title)[0], { font: 'michroma', size: h * .045, fill: k.b, upper: true, lines: twoLines(k.title), fitW: w * .32 })}${T(w * .6, h * .56, k.subtitle, { font: 'archivo', size: h * .022, weight: 500, fill: k.c, fitW: w * .32 })}${[0, 1, 2].map(n => T(w * .6, h * (.62 + n * .03), ['STATE · LIVE', 'OCCLUSION · TRUE', 'DEPTH · Z+'][n], { font: 'jetbrains', size: h * .015, fill: k.d, tracking: .18 })).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Atlas of Encounters — map lines travel between images; field notes at the pace of observation ── */
  'atlas-of-encounters': {
    type: { display: 'bricolage', text: 'workSans', utility: 'ibmPlexMono' }, idea: 'A route draws itself between three photographs; every stop carries a place, a maker and a credit at field-note scale.', ground: 'a', surface: 'PAPER',
    mark: (k, cx, cy, s) => `${D(`M${cx - s * .45} ${cy + s * .3}Q${cx - s * .1} ${cy - s * .4} ${cx + s * .1} ${cy}T${cx + s * .45} ${cy - s * .3}`, 'none', { stroke: k.b, sw: s * .05, dash: `${s * .08} ${s * .06}` })}${C(cx - s * .45, cy + s * .3, s * .08, k.c)}${C(cx + s * .45, cy - s * .3, s * .08, k.c)}`,
    field: (k, x, y, w, h, i = 1) => `${D(`M${x} ${y + h * .7}C${x + w * .2} ${y + h * .2} ${x + w * .35} ${y + h * .9} ${x + w * .55} ${y + h * .5}S${x + w * .85} ${y + h * .2} ${x + w} ${y + h * .4}`, 'none', { stroke: k.b, sw: 3 * i, dash: '14 10' })}${[.15, .55, .9].map((px, n) => C(x + w * px, y + h * [.5, .5, .38][n], 7 * i, k.c)).join('')}`,
    opener: k => { const { w, h } = k;
      const stops: Array<[number, number]> = [[w * .18, h * .62], [w * .5, h * .34], [w * .8, h * .66]];
      const route = `M${stops[0][0]} ${stops[0][1]}C${w * .3} ${h * .3} ${w * .38} ${h * .6} ${stops[1][0]} ${stops[1][1]}S${w * .72} ${h * .3} ${stops[2][0]} ${stops[2][1]}`;
      return `${R(0, 0, w, h, k.a)}${enter(D(route, 'none', { stroke: k.b, sw: 4, dash: '16 12' }), 'draw', { dur: k.beat * 3, ease: 'inOut' })}
        ${stops.map(([x, y], n) => enter(`${slot(k, x - 150, y - 100, 300, 200, { tone: 'light', frame: k.d, frameWidth: 4, rotate: [-3, 2, -1][n] })}${C(x, y + 118, 8, k.c)}${T(x - 150, y + 150, ['Place · replaceable', 'Maker · replaceable', 'Credit · replaceable'][n], { font: 'ibmPlexMono', size: 17, weight: 500, fill: k.b, tracking: .06, upper: true })}`, 'pop', { dur: k.beat, delay: k.beat * (.8 + n * .9), ease: 'back', origin: [x, y] })).join('')}
        ${enter(`${T(w * .06, h * .14, k.title, { font: 'bricolage', size: h * .07, weight: 800, fill: k.b, fitW: w * .6 })}${T(w * .06, h * .19, k.subtitle, { font: 'workSans', size: h * .023, weight: 400, fill: k.c, fitW: w * .6 })}`, 'fade', { dur: k.beat * 1.6, delay: k.beat * .4 })}
        ${T(w * .94, h * .93, 'N ↑', { font: 'ibmPlexMono', size: h * .02, fill: k.c, anchor: 'end', tracking: .1 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .75, w * .48, h * .14, k.a, { stroke: k.d, sw: 3 })}${D(`M${w * .05} ${h * .89}C${w * .15} ${h * .8} ${w * .25} ${h * .9} ${w * .36} ${h * .78}S${w * .5} ${h * .74} ${w * .53} ${h * .77}`, 'none', { stroke: k.b, sw: 2, dash: '10 8', opacity: .6 })}${C(w * .08, h * .82, 9, k.c)}
        ${T(w * .11, h * .815, k.title, { font: 'bricolage', size: h * .05, weight: 800, fill: k.b, fitW: w * .4 })}${T(w * .11, h * .86, k.subtitle, { font: 'ibmPlexMono', size: h * .019, weight: 500, fill: k.c, tracking: .06, upper: true, fitW: w * .4 })}`, 'fade', { dur: k.beat * 1.4 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${GLOBAL_DESIGNS['atlas-of-encounters'].field(k, 0, 0, w, h, .8)}${slot(k, w * .08, h * .12, w * .38, h * .5, { tone: 'light', frame: k.d, frameWidth: 4, rotate: -2 })}${slot(k, w * .3, h * .5, w * .26, h * .36, { tone: 'light', frame: k.d, frameWidth: 4, rotate: 3 })}
        ${enter(`${T(w * .6, h * .3, twoLines(k.title)[0], { font: 'bricolage', size: h * .07, weight: 800, fill: k.b, lines: twoLines(k.title), fitW: w * .34 })}${T(w * .6, h * .48, k.subtitle, { font: 'workSans', size: h * .024, weight: 400, fill: k.c, fitW: w * .34 })}${['Place', 'Maker', 'Language', 'License'].map((f, n) => `${T(w * .6, h * (.58 + n * .06), f, { font: 'ibmPlexMono', size: h * .017, weight: 500, fill: k.b, tracking: .1, upper: true })}${L(w * .68, h * (.575 + n * .06), w * .92, h * (.575 + n * .06), alpha(k.b, .4), 2)}`).join('')}`, 'fade', { dur: k.beat * 1.6, delay: k.beat })}`; },
  },

  /* ── Gilded Tempest — forms unfurl in deep Z; a highlight travels across relief before the title arrives ── */
  'gilded-tempest': {
    type: { display: 'bodoni', text: 'libreBaskerville', utility: 'cormorant' }, idea: 'Opera-house chiaroscuro: a diagonal shaft of gold light, sweeping C-scroll folds, and a title that arrives at the crest.', ground: 'a', surface: 'GLASS',
    mark: (k, cx, cy, s) => `${P(cx - s * .5, cy - s * .4, s * .55, s * .8, orn.cScrollPath(), k.c)}${P(cx - s * .05, cy - s * .4, s * .55, s * .8, orn.cScrollPath(), k.c, { rotate: 180 })}${C(cx, cy, s * .07, k.b)}`,
    field: (k, x, y, w, h, i = 1) => `${[0, 1, 2, 3].map(n => P(x + w * (.05 + n * .24), y + h * (.15 + (n % 2) * .3), w * .2, h * .5, orn.cScrollPath(), alpha(k.c, .5 * i), { rotate: n % 2 ? 180 : 0 })).join('')}`,
    opener: k => { const { w, h } = k; const shaft = k.uid('sh'); k.defs.push(gradient(shaft, [[0, k.c, 0], [.5, k.c, .55], [1, k.c, 0]], { angle: 60 }));
      return `${R(0, 0, w, h, k.a)}${drift(R(-w * .2, -h * .3, w * .5, h * 1.6, `url(#${shaft})`, { rotate: 24, blend: 'screen' }), w * 1.1, 0, k.beat * 9)}
        ${[[-.02, .05, 460, 620, 0], [.72, .3, 520, 700, 180], [.12, .58, 380, 520, 180]].map(([px, py, sw, sh, rot], n) => enter(P(w * px, h * py, sw, sh, orn.cScrollPath(), n === 1 ? k.d : k.c, { rotate: rot, opacity: .92 }), 'pop', { dur: k.beat * 2, delay: k.beat * .5 * n, ease: 'expo', origin: [w * px + sw / 2, h * py + sh / 2] })).join('')}
        ${enter(`${T(w / 2, h * .54, k.title, { font: 'bodoni', size: h * .13, weight: 700, fill: k.b, anchor: 'middle', italic: true, fitW: w * .7 })}${L(w * .38, h * .6, w * .62, h * .6, k.c, 2)}${T(w / 2, h * .66, k.subtitle, { font: 'cormorant', size: h * .028, weight: 500, fill: k.c, anchor: 'middle', tracking: .18, upper: true, fitW: w * .5 })}`, 'fade', { dur: k.beat * 2.4, delay: k.beat * 2.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .05, h * .75, w * .5, h * .14, alpha(k.a, .85))}${P(w * .03, h * .7, 120, 170, orn.cScrollPath(), k.c)}${L(w * .05, h * .89, w * .55, h * .89, k.c, 2)}
        ${T(w * .12, h * .82, k.title, { font: 'bodoni', size: h * .06, weight: 700, fill: k.b, italic: true, fitW: w * .4 })}${T(w * .12, h * .865, k.subtitle, { font: 'cormorant', size: h * .022, weight: 500, fill: k.c, tracking: .16, upper: true, fitW: w * .4 })}`, 'fade', { dur: k.beat * 1.8 }); },
    fullPage: k => { const { w, h } = k; const shaft = k.uid('sh'); k.defs.push(gradient(shaft, [[0, k.c, 0], [.5, k.c, .4], [1, k.c, 0]], { angle: 60 }));
      return `${R(0, 0, w, h, k.a)}${R(w * .1, -h * .3, w * .4, h * 1.6, `url(#${shaft})`, { rotate: 24, blend: 'screen' })}${slot(k, w * .1, h * .12, w * .38, h * .76, { tone: 'dark', shape: 'circle', frame: k.c, frameWidth: 3 })}${P(w * .02, h * .04, 320, 440, orn.cScrollPath(), k.c)}${P(w * .34, h * .62, 300, 420, orn.cScrollPath(), k.d, { rotate: 180 })}
        ${enter(`${T(w * .56, h * .38, twoLines(k.title)[0], { font: 'bodoni', size: h * .085, weight: 700, fill: k.b, italic: true, lines: twoLines(k.title), fitW: w * .38 })}${L(w * .56, h * .56, w * .76, h * .56, k.c, 2)}${T(w * .56, h * .62, k.subtitle, { font: 'libreBaskerville', size: h * .024, weight: 400, fill: k.c, fitW: w * .38 })}${[0, 1, 2, 3].map(n => R(w * .56, h * (.7 + n * .036), w * (.3 - (n % 2) * .08), 3, alpha(k.b, .35))).join('')}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },

  /* ── Quiet Monolith — one plane, one aperture, one typographic decision ── */
  'quiet-monolith': {
    type: { display: 'inter', text: 'inter', utility: 'jetbrains' }, idea: 'A single dark plane on white, one exactly placed aperture, one weight change; the transition is an absence, not a wipe.', ground: 'a', surface: 'CLEAN',
    mark: (k, cx, cy, s) => `${R(cx - s * .5, cy - s * .5, s, s, k.b)}${R(cx - s * .1, cy - s * .1, s * .2, s * .2, k.a)}`,
    field: (k, x, y, w, h, i = 1) => `${R(x + w * .2, y + h * .2, w * .6, h * .6, alpha(k.b, .9 * i))}${L(x, y + h * .5, x + w, y + h * .5, k.d, 2)}`,
    opener: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${enter(R(w * .38, 0, w * .62, h, k.b), 'wipeR', { dur: k.beat * 1.8, ease: 'expo' })}
        ${enter(slot(k, w * .52, h * .22, w * .34, h * .56, { tone: 'dark', silent: true }), 'fade', { dur: k.beat * 2, delay: k.beat * 1.4 })}
        ${enter(`${T(w * .06, h * .5, twoLines(k.title)[0], { font: 'inter', size: h * .06, weight: 300, fill: k.b, lines: twoLines(k.title), fitW: w * .28, leading: 1.05 })}${T(w * .06, h * .5 + twoLines(k.title).length * h * .066, k.subtitle, { font: 'inter', size: h * .02, weight: 700, fill: k.b, fitW: w * .28 })}${R(w * .06, h * .84, 14, 14, k.d)}`, 'fade', { dur: k.beat * 2, delay: k.beat * 2.2 })}`; },
    lowerThird: k => { const { w, h } = k;
      return lt(k, `${R(w * .04, h * .77, w * .5, h * .15, k.a)}${R(w * .05, h * .8, 12, h * .1, k.d)}${T(w * .07, h * .845, k.title, { font: 'inter', size: h * .046, weight: 300, fill: k.b, fitW: w * .45 })}${T(w * .07, h * .885, k.subtitle, { font: 'inter', size: h * .02, weight: 700, fill: k.b, fitW: w * .5 })}`, 'fade', { dur: k.beat * 1.8 }); },
    fullPage: k => { const { w, h } = k;
      return `${R(0, 0, w, h, k.a)}${R(0, 0, w * .5, h, k.b)}${slot(k, w * .08, h * .1, w * .34, h * .8, { tone: 'dark', silent: true })}
        ${enter(`${T(w * .56, h * .3, twoLines(k.title)[0], { font: 'inter', size: h * .065, weight: 300, fill: k.b, lines: twoLines(k.title), fitW: w * .38, leading: 1.05 })}${T(w * .56, h * .3 + twoLines(k.title).length * h * .07 + h * .02, k.subtitle, { font: 'inter', size: h * .022, weight: 700, fill: k.b, fitW: w * .38 })}${[0, 1, 2, 3].map(n => R(w * .56, h * (.62 + n * .035), w * (.3 - (n % 3) * .04), 2, alpha(k.b, .5))).join('')}${R(w * .56, h * .86, 14, 14, k.d)}`, 'fade', { dur: k.beat * 2, delay: k.beat })}`; },
  },
};
