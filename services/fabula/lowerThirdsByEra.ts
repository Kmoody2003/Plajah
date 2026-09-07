// lowerThirdsByEra — design-history lower thirds that follow the Tela style eras
// (Bauhaus, Swiss, Constructivist, Memphis, Vaporwave, …). Each `family` is a
// Tela era id so a creator can carry one design language from a document into a
// Fabula film. Every spec is a small motion design: what enters first, what
// follows, how it leaves. Brief: docs/tela/LOWER_THIRD_DESIGN_BRIEF.md.
//
// Authoring notes (engine facts that shaped these):
//  - The frame is dark video, not paper. Where an era's "black rule on cream"
//    would vanish over footage, the design carries its own paper plate first,
//    then the rules arrive on it (Bauhaus, De Stijl, Brutalist, Mexican Modern).
//  - Text cannot rotate. Vertical labels (Ukiyo-e, New Wave kickers) and tilted
//    titles (Grunge) are expressed through rotated PLATES; the type stays level.
//  - growX pivots on the layer's left edge, so a centred rule that "grows from
//    the middle" is two halves: the left half wipeL, the right half wipeR.
import { mo, anim, type LowerThirdSpec, type LTLayer } from './lowerThirds';
import type { TelaChartStyle } from '../../types';
import {
  polygonPath, starPath, eightStarPath, fanPath, zigzagPath, wavePath, sineOpenPath,
  pointedArchPath, whiplashPath, scallopPath, blobPath, boomerangPath, tornEdgePath, brushStrokePath,
} from '../tela/ornaments';

const L = (l: Omit<LTLayer, 'in'> & { in?: LTLayer['in'] }): LTLayer => ({ in: mo('fade', .4), ...l });
const G = 'DESIGN HISTORY';

/** Solid two-centred arch (pointedArchPath with thickness 0 cancels itself under even-odd). */
const SOLID_POINTED_ARCH = 'M0 100 L0 45 Q0 0 50 0 Q100 0 100 45 L100 100 Z';
/** Stepped right shoulder — a Deco plate that steps down toward the title. */
const DECO_STEP_PLATE = 'M0 0 L86 0 L86 18 L92 18 L92 36 L100 36 L100 100 L0 100 Z';
/** Constructivist wedge — a plate whose right edge leans back. */
const WEDGE = 'M0 0 L100 0 L93 100 L0 100 Z';

/** Eight short rays around a centre (cx, cy), from radius r0 to r1 — LINE layers for the Mexican-modern sun. */
function sunRays(cx: number, cy: number, r0: number, r1: number, stroke: string, width: number, delay0: number, step: number): LTLayer[] {
  const rays: LTLayer[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 - 90) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    const x = Math.round((cx + r0 * ux) * 10) / 10, y = Math.round((cy + r0 * uy) * 10) / 10;
    const w = Math.round((r1 - r0) * ux * 10) / 10, h = Math.round((r1 - r0) * uy * 10) / 10;
    rays.push(L({ id: `ray${i}`, label: `Sun ray ${i + 1}`, kind: 'line', x, y, w, h, fill: 'none', stroke, strokeWidth: width, in: mo('pop', .3, delay0 + i * step, 'out'), out: mo('fade', .2, 0, 'out') }));
  }
  return rays;
}

/** Five concentric ring strokes centred on (cx, cy) — the Afrofuturist radiant crown. */
function crownRings(cx: number, cy: number, radii: number[], colors: string[], step: number): LTLayer[] {
  return radii.map((r, i) => L({
    id: `ring${i}`, label: `Crown ring ${i + 1}`, kind: 'ellipse', x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill: 'none',
    stroke: colors[i % colors.length], strokeWidth: i === 0 ? 4 : 3, opacity: 1 - i * .14,
    in: mo('pop', .38, i * step, 'out'), out: mo('pop', .3, (radii.length - 1 - i) * .05, 'inOut'),
  }));
}

export const LOWER_THIRDS_BY_ERA: LowerThirdSpec[] = [
  // ── Industrial modern ───────────────────────────────────────────────────────
  {
    id: 'lt-bauhaus', councilStyle: 'BAUHAUS', name: 'Bauhaus', group: G, family: 'bauhaus', tagline: 'Circle, rule, triangle: the three primaries arrive one at a time and a lowercase name reads across them.',
    colors: { accent: '#D93A2F', ink: '#171717', paper: '#F2EBDD', secondary: '#1E5AA8' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'card', label: 'Cream card', kind: 'rect', x: -20, y: -60, w: 820, h: 176, fill: 'paper', in: mo('wipeR', .5, 0, 'expo'), out: mo('wipeR', .35, 0, 'inOut') }),
      L({ id: 'circle', label: 'Red circle', kind: 'ellipse', x: 0, y: -12, w: 96, h: 96, fill: 'accent', in: mo('pop', .45, .1, 'back'), out: mo('pop', .3, .15, 'inOut') }),
      L({ id: 'rule', label: 'Black rule', kind: 'rect', x: 96, y: 36, w: 640, h: 10, fill: 'ink', in: mo('growX', .55, .3, 'expo'), out: mo('growX', .35, .05, 'inOut') }),
      L({ id: 'tri', label: 'Yellow triangle', kind: 'path', path: polygonPath(3), x: 752, y: 24, w: 28, h: 26, fill: '#F2C230', in: mo('drop', .4, .85, 'out'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'square', label: 'Blue square', kind: 'rect', x: 766, y: 84, w: 24, h: 24, fill: 'secondary', in: mo('pop', .3, 1.0, 'back'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'archivo', weight: 800, size: 58, color: 'ink', x: 118, y: -46, w: 620, align: 'left', anim: anim('wordSlide', .5, .5, .3, .5), maxLines: 1 },
    subtitle: { font: 'inter', weight: 500, size: 21, color: 'secondary', tracking: .06, upper: true, x: 118, y: 60, w: 620, align: 'left', anim: anim('fadeIn', .4, .8, .25, .3), maxLines: 1 },
    defaults: { title: 'lucía brandt', subtitle: 'Weaving Workshop · Dessau' },
    lesson: { principle: 'Form follows function in time as well as space: each primary shape enters on its own beat — circle, then the rule it anchors, then the triangle as a full stop — so the geometry explains the hierarchy before a word appears.', history: 'The Bauhaus (Weimar 1919, Dessau 1925, closed by the Nazis in 1933) taught that design should be built from elementary forms; Herbert Bayer’s 1925 “universal” alphabet dropped capitals entirely, which is why this title is set lowercase. Its film and stage workshops — Moholy-Nagy’s light experiments, Schlemmer’s geometric dances — treated shapes as performers, the idea motion graphics inherited when Bauhaus émigrés reached Chicago and New York and their students filled early television art departments.', tryThis: 'Swap the circle’s ease from back to expo. The overshoot is what makes it feel placed by a hand rather than a machine — decide which the Bauhaus would have wanted.', interestTag: 'Bauhaus', related: ['modernism', 'typography', 'geometry'] },
    tags: ['bauhaus', 'geometric', 'primary colours', 'lowercase'],
  },
  {
    id: 'lt-swiss', councilStyle: 'SWISS', name: 'Swiss Grid', group: G, family: 'swiss', tagline: 'Three hairlines, one red square and a flush-left name — the grid is the graphic.',
    colors: { accent: '#E12D2D', ink: '#F7F7F3', paper: '#161616', secondary: '#B9B9B2' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'rule-top', label: 'Top hairline', kind: 'rect', x: 0, y: -6, w: 560, h: 2, fill: 'ink', opacity: .7, in: mo('wipeR', .5, 0, 'expo'), out: mo('wipeR', .4, 0, 'inOut') }),
      L({ id: 'rule-mid', label: 'Column hairline', kind: 'rect', x: 580, y: -6, w: 180, h: 2, fill: 'ink', opacity: .7, in: mo('wipeR', .4, .12, 'expo'), out: mo('wipeR', .4, 0, 'inOut') }),
      L({ id: 'rule-base', label: 'Baseline hairline', kind: 'rect', x: 0, y: 100, w: 760, h: 2, fill: 'ink', opacity: .7, in: mo('wipeR', .55, .22, 'expo'), out: mo('wipeR', .4, 0, 'inOut') }),
      L({ id: 'square', label: 'Red square', kind: 'rect', x: 580, y: 12, w: 28, h: 28, fill: 'accent', in: mo('pop', .3, .6, 'back'), out: mo('fade', .3, 0, 'out') }),
    ],
    title: { font: 'inter', weight: 900, size: 56, color: 'ink', tracking: -.02, x: 0, y: 12, w: 560, align: 'left', anim: anim('fadeUp', .5, .35, .3, .5), shadow: true, maxLines: 1 },
    subtitle: { font: 'inter', weight: 500, size: 19, color: 'secondary', tracking: .16, upper: true, x: 0, y: 112, w: 560, align: 'left', anim: anim('fadeIn', .4, .6, .3, .3), shadow: true, maxLines: 1 },
    tag: { font: 'inter', weight: 600, size: 15, color: 'secondary', tracking: .12, x: 620, y: 14, w: 140, align: 'left', anim: anim('fadeIn', .3, .7, .3, 0), maxLines: 1 },
    defaults: { title: 'Nadia Keller', subtitle: 'Typographer · Basel', tag: '01 / 06' },
    lesson: { principle: 'Objectivity is a motion choice too: nothing here overshoots, spins or bounces — hairlines wipe at constant purpose, type fades straight up, and the single red square is the only event, so the viewer reads information rather than watching a performance.', history: 'The International Typographic Style grew out of Swiss schools in Zürich and Basel in the 1950s — Josef Müller-Brockmann, Emil Ruder, Armin Hofmann — with its modular grid, sans-serif type, flush-left ragged-right setting and photography over illustration. Broadcast adopted it wholesale: Swiss-trained designers set the look of 1960s–70s public television and airline and corporate identities, and the grid-and-hairline lower third remains the default for news, science and “serious” documentary because it appears to add nothing of its own.', tryThis: 'Move the red square to the far left, ahead of the name. The grid still holds, but the reading order changes — the square now announces the name rather than punctuating it.', interestTag: 'Swiss style', related: ['grid systems', 'typography', 'Helvetica'] },
    tags: ['swiss', 'grid', 'minimal', 'sans'],
  },
  {
    id: 'lt-constructivist', councilStyle: 'REBEL', name: 'Constructivist', group: G, family: 'constructivist', tagline: 'A red diagonal slams in, a black wedge follows, and a condensed name drops like a headline being shouted.',
    colors: { accent: '#C9252D', ink: '#171717', paper: '#E8DDC6', secondary: '#8B8374' }, origin: { x: 6, y: 80 }, duration: 5,
    layers: [
      L({ id: 'band', label: 'Red diagonal band', kind: 'rect', x: -40, y: -20, w: 780, h: 110, rotation: -12, fill: 'accent', in: mo('slideL', .5, 0, 'expo', 1.2), out: mo('slideR', .4, 0, 'inOut', 1.3) }),
      L({ id: 'wedge', label: 'Black wedge', kind: 'path', path: WEDGE, x: 40, y: 10, w: 720, h: 84, fill: 'ink', in: mo('slideL', .45, .15, 'expo', 1.3), out: mo('slideR', .35, .05, 'inOut', 1.4) }),
      L({ id: 'bang', label: 'Exclamation bar', kind: 'rect', x: 704, y: -78, w: 22, h: 66, fill: 'paper', in: mo('growY', .3, .6, 'expo'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'bang-dot', label: 'Exclamation dot', kind: 'rect', x: 704, y: -4, w: 22, h: 22, fill: 'paper', in: mo('pop', .25, .8, 'back'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'anton', weight: 400, size: 62, color: 'paper', upper: true, tracking: .02, x: 70, y: 14, w: 600, align: 'left', anim: anim('dropIn', .45, .4, .3, .4), maxLines: 1 },
    subtitle: { font: 'oswald', weight: 500, size: 22, color: 'paper', upper: true, tracking: .1, x: 70, y: 104, w: 600, align: 'left', anim: anim('fadeIn', .4, .7, .25, .3), shadow: true, maxLines: 1 },
    defaults: { title: 'Vera Stepanova', subtitle: 'Agitprop Studio · Moscow · 1924' },
    lesson: { principle: 'The diagonal is agitation: every plate enters along the same axis it will leave on, so the graphic feels like a poster being thrust into frame and yanked away rather than a caption appearing.', history: 'Russian Constructivism (c. 1915–1930) — Rodchenko, El Lissitzky, the Stenberg brothers, Stepanova — put art to political and industrial use with red-and-black diagonals, photomontage and heavy condensed capitals. Its film roots are direct: Rodchenko designed Vertov’s Kino-Eye posters, the Stenbergs the great Soviet film posters, and Lissitzky’s “Beat the Whites with the Red Wedge” (1919) is the ancestor of every slanted red plate in sports and news graphics; the OUT that slides off the far side is the montage cut turned into motion.', tryThis: 'Set the band’s rotation to 0. Watch it become a news graphic instantly — the whole revolution was twelve degrees.', interestTag: 'Constructivism', related: ['Soviet poster', 'photomontage', 'agitprop'] },
    tags: ['constructivist', 'diagonal', 'red', 'poster'],
  },
  {
    id: 'lt-de-stijl', councilStyle: 'BAUHAUS', name: 'De Stijl', group: G, family: 'de-stijl', tagline: 'Black rules divide a cream field, primaries fill three cells, and the name sits alone in the largest one.',
    colors: { accent: '#D72B2B', ink: '#111111', paper: '#F6F3E8', secondary: '#1D4E9E' }, origin: { x: 6, y: 78 }, duration: 6,
    layers: [
      L({ id: 'field', label: 'Cream field', kind: 'rect', x: 0, y: -60, w: 820, h: 200, fill: 'paper', in: mo('fade', .35, 0, 'out'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'rule-v', label: 'Vertical rule', kind: 'rect', x: 200, y: -60, w: 10, h: 200, fill: 'ink', in: mo('growY', .5, .1, 'expo'), out: mo('growY', .35, .1, 'inOut') }),
      L({ id: 'rule-h', label: 'Horizontal rule', kind: 'rect', x: 0, y: 50, w: 820, h: 10, fill: 'ink', in: mo('growX', .55, .2, 'expo'), out: mo('growX', .35, .05, 'inOut') }),
      L({ id: 'rule-v2', label: 'Second vertical', kind: 'rect', x: 700, y: 60, w: 10, h: 80, fill: 'ink', in: mo('growY', .4, .32, 'expo'), out: mo('growY', .3, .15, 'inOut') }),
      L({ id: 'red', label: 'Red cell', kind: 'rect', x: 0, y: -60, w: 200, h: 110, fill: 'accent', in: mo('growX', .4, .5, 'expo'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'blue', label: 'Blue cell', kind: 'rect', x: 710, y: 60, w: 110, h: 80, fill: 'secondary', in: mo('growX', .35, .62, 'expo'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'yellow', label: 'Yellow cell', kind: 'rect', x: 0, y: 60, w: 60, h: 80, fill: '#F2C230', in: mo('growY', .35, .72, 'expo'), out: mo('fade', .3, 0, 'out') }),
    ],
    title: { font: 'archivo', weight: 700, size: 44, color: 'ink', upper: true, tracking: .08, x: 230, y: -44, w: 570, align: 'left', anim: anim('fadeIn', .5, .75, .3, .4), maxLines: 1 },
    subtitle: { font: 'inter', weight: 500, size: 20, color: 'ink', x: 230, y: 78, w: 450, align: 'left', anim: anim('fadeIn', .4, .95, .3, .3), maxLines: 1 },
    defaults: { title: 'Piet van Doesburg', subtitle: 'Architect · Leiden' },
    lesson: { principle: 'Type never touches a rule: the name lives inside a cell with air on every side, and the colour blocks fill cells the rules have already drawn — structure first, then filling, then the word.', history: 'De Stijl (Leiden, 1917–1931) — Theo van Doesburg, Piet Mondrian, Gerrit Rietveld, Vilmos Huszár — reduced art to horizontals, verticals and the three primaries as a universal language after the First World War. Van Doesburg’s journal pages and Huszár’s Bruynzeel advertising were among the first commercial layouts built as pure cell grids; the orthogonal, primary-coloured “Mondrian” caption enjoyed a broadcast revival in 1980s–90s youth television, and its rule-then-block-then-word timing is the cleanest demonstration of layered reveal in motion design.', tryThis: 'Give the horizontal rule a delay of 0 and the field a delay of 0.4. The rules now draw on video before the cream arrives — a different, more architectural story.', interestTag: 'De Stijl', related: ['Mondrian', 'grid systems', 'primary colours'] },
    tags: ['de-stijl', 'grid', 'primary colours', 'orthogonal'],
  },
  {
    id: 'lt-art-deco', councilStyle: 'BAROQUE', name: 'Art Deco ID', group: G, family: 'art-deco', tagline: 'A stepped plate, gold hairlines and a quarter-sunburst crowning the initial — the marquee turned into a name tag.',
    colors: { accent: '#D4AF37', ink: '#F4E8D0', paper: '#101820', secondary: '#8C2143' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'fan', label: 'Sunburst quarter', kind: 'path', path: fanPath(7), x: -10, y: -86, w: 170, h: 78, fill: 'accent', opacity: .38, in: mo('growY', .6, .15, 'expo'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'plate', label: 'Stepped plate', kind: 'path', path: DECO_STEP_PLATE, x: 0, y: -10, w: 760, h: 120, fill: 'paper', in: mo('growX', .55, 0, 'expo'), out: mo('growX', .4, 0, 'inOut') }),
      L({ id: 'rule-top', label: 'Gold rule', kind: 'rect', x: 22, y: 2, w: 620, h: 2, fill: 'accent', in: mo('growX', .5, .3, 'expo'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'rule-base', label: 'Gold rule', kind: 'rect', x: 22, y: 96, w: 620, h: 2, fill: 'accent', in: mo('growX', .5, .4, 'expo'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'zig', label: 'Zigzag frieze', kind: 'path', path: zigzagPath(20, 60), x: 22, y: 100, w: 620, h: 8, fill: 'accent', in: mo('wipeR', .55, .5, 'expo'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'diamond', label: 'Diamond', kind: 'path', path: polygonPath(4, -90), x: 662, y: 44, w: 14, h: 14, fill: 'accent', in: mo('pop', .3, .85, 'back'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'limelight', weight: 400, size: 46, color: 'ink', upper: true, tracking: .1, x: 30, y: 14, w: 610, align: 'left', anim: anim('tracking', .7, .45, .4, .5), maxLines: 1 },
    subtitle: { font: 'josefin', weight: 400, size: 18, color: 'accent', upper: true, tracking: .26, x: 30, y: 70, w: 610, align: 'left', anim: anim('fadeIn', .45, .8, .3, .2), maxLines: 1 },
    defaults: { title: 'Josephine Marlowe', subtitle: 'Bandleader · The Savoy Ballroom' },
    lesson: { principle: 'Deco is an architecture of steps: the plate grows, the hairlines follow, the frieze runs last — the same order a façade is read, base to cornice — while the sunburst quietly crowns the first letter.', history: 'Art Deco took its name from the 1925 Paris Exposition and dressed the machine age in luxury: stepped skyscraper setbacks, sunbursts, zigzags, chrome and gold, and inline “marquee” lettering. It was the first style born alongside sound cinema — Cedric Gibbons’s MGM sets, the RKO title cards, the Paramount and Fox theatre marquees — so its stepped and tracked forms already carried a sense of announcement; broadcast revived them for awards shows and period drama, where a gold hairline still reads as occasion.', tryThis: 'Delete the zigzag frieze and the diamond. The plate becomes a generic gold-on-black ID — Deco is in the small ornaments, not the palette.', interestTag: 'Art Deco', related: ['1920s', 'cinema', 'ornament'] },
    tags: ['art-deco', 'gold', 'stepped', 'marquee'],
  },
  {
    id: 'lt-art-nouveau', councilStyle: 'CLASSICAL', name: 'Art Nouveau', group: G, family: 'art-nouveau', tagline: 'A whiplash tendril draws itself, a soft plate blooms beneath it, and a hand-lettered name follows the curve.',
    colors: { accent: '#A76A76', ink: '#315D55', paper: '#E5DDB9', secondary: '#C49A45' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'whip', label: 'Whiplash tendril', kind: 'path', path: whiplashPath(), x: -40, y: -112, w: 250, h: 236, fill: 'none', stroke: 'secondary', strokeWidth: 5, in: mo('wipeR', .8, 0, 'expo'), out: mo('fade', .35, 0, 'out') }),
      L({ id: 'plate', label: 'Ogee plate', kind: 'path', path: 'M0 100 L0 52 C0 30 22 26 32 18 C42 10 46 4 50 0 C54 4 58 10 68 18 C78 26 100 30 100 52 L100 100 Z', x: 0, y: -40, w: 720, h: 172, fill: 'paper', opacity: .94, in: mo('fade', .5, .3, 'out'), out: mo('fade', .35, 0, 'out') }),
      L({ id: 'hair', label: 'Gold hairline', kind: 'rect', x: 44, y: 92, w: 380, h: 2, fill: 'secondary', in: mo('growX', .5, .75, 'expo'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'tendril', label: 'Small tendril', kind: 'path', path: sineOpenPath(2, 34), x: 400, y: 104, w: 280, h: 20, fill: 'none', stroke: 'accent', strokeWidth: 2.5, in: mo('wipeR', .6, .85, 'expo'), out: mo('fade', .25, 0, 'out') }),
    ],
    title: { font: 'yeseva', weight: 400, size: 46, color: 'ink', x: 44, y: 40, w: 640, align: 'left', anim: anim('fadeUp', .6, .55, .3, .6), maxLines: 1 },
    subtitle: { font: 'lora', weight: 400, size: 22, color: 'accent', italic: true, x: 44, y: 102, w: 340, align: 'left', anim: anim('fadeIn', .5, .85, .3, .3), maxLines: 1 },
    defaults: { title: 'Élodie Vautrin', subtitle: 'Glass artist · Nancy' },
    lesson: { principle: 'Organic motion is drawn, not placed: the tendril reveals along its own length like a pen stroke, and everything after it grows or fades softly — no hard edges arrive, because Nouveau has none.', history: 'Art Nouveau (c. 1910–1910) — Mucha’s posters, Guimard’s Métro entrances, Horta’s Brussels houses, Tiffany and Gallé in glass — pulled its “whiplash” line from plant stems and Japanese prints, and refused the straight line wherever it could. Its posters were the first mass advertising to treat lettering as drawing; that hand-lettered, curve-following title survived into the psychedelic posters of the 1960s and returns in broadcast whenever a period drama, perfume or garden programme needs a caption that appears to have grown there.', tryThis: 'Change the tendril’s IN from wipeR to fade. It now simply appears — the drawn quality, and most of the era, disappears with the wipe.', interestTag: 'Art Nouveau', related: ['Mucha', 'ornament', 'Belle Époque'] },
    tags: ['art-nouveau', 'organic', 'curve', 'serif'],
  },
  {
    id: 'lt-victorian', councilStyle: 'CLASSICAL', name: 'Victorian Playbill', group: G, family: 'victorian', tagline: 'A scalloped card unrolls from the top, rules spread from the centre, and the name is set as wood type.',
    colors: { accent: '#8A3034', ink: '#31251E', paper: '#E8D7B5', secondary: '#C18D32' }, origin: { x: 50, y: 80 }, duration: 6,
    layers: [
      L({ id: 'scallop', label: 'Scalloped header', kind: 'path', path: scallopPath(10), x: -380, y: -60, w: 760, h: 46, fill: 'paper', in: mo('wipeD', .4, 0, 'expo'), out: mo('wipeD', .3, .1, 'inOut') }),
      L({ id: 'card', label: 'Playbill card', kind: 'rect', x: -380, y: -16, w: 760, h: 176, fill: 'paper', in: mo('wipeD', .5, .12, 'expo'), out: mo('wipeD', .35, 0, 'inOut') }),
      L({ id: 'rule1-l', label: 'Upper rule (left)', kind: 'rect', x: -300, y: 10, w: 300, h: 3, fill: 'ink', in: mo('wipeL', .4, .35, 'expo'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'rule1-r', label: 'Upper rule (right)', kind: 'rect', x: 0, y: 10, w: 300, h: 3, fill: 'ink', in: mo('wipeR', .4, .35, 'expo'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'rule2-l', label: 'Lower rule (left)', kind: 'rect', x: -300, y: 118, w: 286, h: 3, fill: 'ink', in: mo('wipeL', .4, .45, 'expo'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'rule2-r', label: 'Lower rule (right)', kind: 'rect', x: 14, y: 118, w: 286, h: 3, fill: 'ink', in: mo('wipeR', .4, .45, 'expo'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'diamond', label: 'Diamond', kind: 'path', path: polygonPath(4, -90), x: -9, y: 110, w: 18, h: 18, fill: 'accent', in: mo('pop', .3, .75, 'back'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'abril', weight: 400, size: 50, color: 'ink', upper: true, tracking: .08, x: -340, y: 24, w: 680, align: 'center', anim: anim('tracking', .7, .5, .4, .5), maxLines: 1 },
    subtitle: { font: 'robotoSlab', weight: 500, size: 19, color: 'accent', upper: true, tracking: .18, x: -340, y: 88, w: 680, align: 'center', anim: anim('fadeIn', .4, .8, .3, .2), maxLines: 1 },
    defaults: { title: 'Miss Ada Thornbury', subtitle: 'Celebrated Contralto · One Night Only' },
    lesson: { principle: 'A playbill is a stack read top to bottom, so it enters top to bottom: header, card, rules spreading from the centre axis, then type that tightens its letterspacing into place like wood type being locked in a chase.', history: 'Victorian job printing (c. 1840–1900) had wood type, fat faces, Egyptians and Clarendons and used them all on one bill — every line a different face and size, centred, with rules between — because a poster had to shout from a wall across the street. Music-hall and circus bills fixed the “one night only” grammar of the announcement; early cinema inherited it for its own posters and intertitle cards, and today it signals showmanship: a variety act, a period piece, a carnival.', tryThis: 'Change the title’s Tracking In to Type On. The bill turns from letterpress into a telegraph — still Victorian, different machine.', interestTag: 'Victorian design', related: ['wood type', 'letterpress', 'music hall'] },
    tags: ['victorian', 'playbill', 'centered', 'letterpress'],
  },
  {
    id: 'lt-gothic', councilStyle: 'BAROQUE', name: 'Gothic Window', group: G, family: 'gothic', tagline: 'A gold pointed arch rises, a wine-coloured pane fills it, and blackletter appears on a dark plate beside it.',
    colors: { accent: '#D8B55B', ink: '#EFE3C8', paper: '#14131C', secondary: '#6E153C' }, origin: { x: 6, y: 80 }, duration: 7,
    layers: [
      L({ id: 'arch', label: 'Pointed arch (gold)', kind: 'path', path: pointedArchPath(.16), x: 0, y: -150, w: 130, h: 270, fill: 'accent', in: mo('growY', .6, 0, 'expo'), out: mo('growY', .4, 0, 'inOut') }),
      L({ id: 'pane', label: 'Glass pane', kind: 'path', path: SOLID_POINTED_ARCH, x: 21, y: -108, w: 88, h: 228, fill: 'secondary', opacity: .85, in: mo('wipeU', .5, .25, 'expo'), out: mo('wipeU', .35, .05, 'inOut') }),
      L({ id: 'plate', label: 'Dark plate', kind: 'rect', x: 150, y: -10, w: 640, h: 130, fill: 'paper', opacity: .9, in: mo('wipeU', .5, .35, 'expo'), out: mo('fade', .35, 0, 'out') }),
      L({ id: 'hair', label: 'Gold hairline', kind: 'rect', x: 150, y: 118, w: 640, h: 2, fill: 'accent', in: mo('growX', .5, .6, 'expo'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'rubric', label: 'Rubric mark', kind: 'rect', x: 176, y: 90, w: 10, h: 10, fill: 'secondary', in: mo('pop', .25, 1.05, 'back'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'unifraktur', weight: 400, size: 56, color: 'ink', x: 176, y: 2, w: 600, align: 'left', anim: anim('fadeIn', .7, .65, .35, .5), maxLines: 1 },
    subtitle: { font: 'cardo', weight: 400, size: 22, color: 'accent', tracking: .04, x: 196, y: 82, w: 580, align: 'left', anim: anim('fadeIn', .5, 1.0, .3, .3), maxLines: 1 },
    defaults: { title: 'Brother Anselm', subtitle: 'Master of the Scriptorium · Canterbury' },
    lesson: { principle: 'Gothic is vertical and luminous: the arch grows upward from its base like a pier, light fills it from below, and only then does the dark plate carry the word — the order a cathedral is experienced, structure before glass before inscription.', history: 'Gothic architecture (Saint-Denis, c. 1140, then Chartres, Reims, Cologne) used the pointed arch and flying buttress to open walls into stained glass; textura blackletter is the same century’s handwriting, its dense verticals echoing the piers. The style’s revival in the 19th century (Pugin, Ruskin) fixed blackletter as the type of newspapers, churches and ceremony, and broadcast uses it sparingly for the same reason — a blackletter lower third on ecclesiastical or medieval-history content reads as authority from another age, and must be set large and left alone.', tryThis: 'Replace the title font with Cinzel and re-watch. The arch alone no longer says Gothic — the letterform was doing half the work.', interestTag: 'Gothic architecture', related: ['blackletter', 'stained glass', 'medieval'] },
    tags: ['gothic', 'blackletter', 'church', 'medieval'],
  },

  // ── Counterculture ──────────────────────────────────────────────────────────
  {
    id: 'lt-memphis', councilStyle: 'NEON', name: 'Memphis', group: G, family: 'memphis', tagline: 'Confetti bounces in, a black block wipes under a pink squiggle, and a chunky name lands last.',
    colors: { accent: '#EF5C79', ink: '#1A1A1E', paper: '#F4E36D', secondary: '#27A9A1' }, origin: { x: 6, y: 80 }, duration: 5,
    layers: [
      L({ id: 'tri', label: 'Confetti triangle', kind: 'path', path: polygonPath(3), x: 724, y: -44, w: 40, h: 36, fill: 'accent', in: mo('pop', .45, 0, 'bounce'), out: mo('pop', .25, .3, 'inOut') }),
      L({ id: 'dot', label: 'Confetti dot', kind: 'ellipse', x: 784, y: 16, w: 30, h: 30, fill: 'secondary', in: mo('pop', .45, .1, 'bounce'), out: mo('pop', .25, .25, 'inOut') }),
      L({ id: 'dash', label: 'Confetti dash', kind: 'rect', x: 736, y: 68, w: 64, h: 12, rotation: -28, fill: 'paper', in: mo('pop', .45, .2, 'bounce'), out: mo('pop', .25, .2, 'inOut') }),
      L({ id: 'sq', label: 'Confetti square', kind: 'rect', x: 694, y: -70, w: 22, h: 22, rotation: 15, fill: 'secondary', in: mo('pop', .45, .3, 'bounce'), out: mo('pop', .25, .15, 'inOut') }),
      L({ id: 'half', label: 'Confetti half-moon', kind: 'ellipse', x: 320, y: -62, w: 40, h: 40, fill: 'accent', in: mo('pop', .45, .15, 'bounce'), out: mo('pop', .25, .1, 'inOut') }),
      L({ id: 'block', label: 'Black block', kind: 'rect', x: 0, y: -10, w: 700, h: 100, fill: 'ink', in: mo('wipeR', .45, .5, 'expo'), out: mo('wipeR', .35, 0, 'inOut') }),
      L({ id: 'squiggle', label: 'Pink squiggle', kind: 'path', path: sineOpenPath(3, 40), x: 20, y: 104, w: 260, h: 22, fill: 'none', stroke: 'accent', strokeWidth: 6, in: mo('wipeR', .5, .85, 'expo'), out: mo('fade', .25, 0, 'out') }),
    ],
    title: { font: 'rubikMono', weight: 400, size: 42, color: 'paper', upper: true, x: 26, y: 14, w: 650, align: 'left', anim: anim('blurIn', .45, .75, .3, .4), maxLines: 1 },
    subtitle: { font: 'fredoka', weight: 600, size: 22, color: 'paper', x: 300, y: 104, w: 400, align: 'left', anim: anim('fadeIn', .4, 1.05, .25, .3), shadow: true, maxLines: 1 },
    defaults: { title: 'Bea Sottsass', subtitle: 'Laminate designer · Milan' },
    lesson: { principle: 'Memphis is deliberately un-serious motion: every shape bounces on a different beat so the graphic feels like confetti still settling, and the one heavy element — the black block — arrives only after the party has started.', history: 'The Memphis Group (Milan, 1981–1987), led by Ettore Sottsass with Nathalie du Pasquier, Michele De Lucchi and others, mixed plastic laminate, squiggles, terrazzo and clashing pastels in a joyful rejection of good taste; du Pasquier’s “bacterio” pattern is the ancestor of every squiggle here. Its look was absorbed by MTV’s 1981 launch idents and Saved by the Bell-era title packages, so a bouncing confetti lower third now reads as 1980s television even to viewers who never saw a Memphis chair.', tryThis: 'Give all five confetti pieces the same delay of 0. The bounce becomes a single explosion — fun once, but the rhythm is gone.', interestTag: 'Memphis design', related: ['postmodernism', '1980s', 'pattern'] },
    tags: ['memphis', 'confetti', 'playful', '1980s'],
  },
  {
    id: 'lt-punk', councilStyle: 'REBEL', name: 'Punk Xerox', group: G, family: 'punk', tagline: 'A torn strip slaps down, black tape spins on, and the name scrambles into place like a ransom note.',
    colors: { accent: '#D71920', ink: '#111111', paper: '#EEE9DB', secondary: '#74706A' }, origin: { x: 6, y: 80 }, duration: 5,
    layers: [
      L({ id: 'strip', label: 'Torn paper strip', kind: 'path', path: tornEdgePath(7, 12), x: -30, y: -24, w: 820, h: 132, rotation: -1.5, fill: 'paper', in: mo('slideU', .45, 0, 'expo', .7), out: mo('slideD', .35, 0, 'inOut', .8) }),
      L({ id: 'redbar', label: 'Stencil bar', kind: 'rect', x: 22, y: 94, w: 430, h: 30, fill: 'accent', in: mo('wipeR', .4, .5, 'expo'), out: mo('wipeR', .3, 0, 'inOut') }),
      L({ id: 'tape1', label: 'Black tape', kind: 'rect', x: -50, y: -44, w: 160, h: 34, rotation: -8, fill: 'ink', in: mo('spin', .4, .3, 'back', 40), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'tape2', label: 'Black tape', kind: 'rect', x: 650, y: 102, w: 150, h: 30, rotation: 6, fill: 'ink', in: mo('spin', .4, .45, 'back', -35), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'anton', weight: 400, size: 64, color: 'ink', upper: true, x: 34, y: 2, w: 700, align: 'left', anim: anim('scramble', .7, .35, .3, .6), maxLines: 1 },
    subtitle: { font: 'specialElite', weight: 400, size: 20, color: 'paper', x: 34, y: 98, w: 410, align: 'left', anim: anim('typeOn', .6, .8, .2, 1), maxLines: 1 },
    defaults: { title: 'Siouxsie Marr', subtitle: 'vocals · The Cut-Ups · 1977' },
    lesson: { principle: 'Roughness is timed, not random: the strip lands slightly crooked, the tape spins on with an overshoot like a thumb pressing it down, and the letters scramble before they settle — controlled violence that stays deterministic frame to frame.', history: 'Punk graphics (London and New York, 1976–1980) — Jamie Reid’s Sex Pistols sleeves, Linder Sterling’s collages, the photocopied zines Sniffin’ Glue and Punk — used ransom-note lettering, torn paper, tape and Xerox degradation because that was what a kid with no budget could make. Television found it late: MTV’s early bumpers and 1990s alternative-music shows borrowed the tape-and-typewriter look, and the type-on typewriter subtitle here is the same gesture the zines made by feeding a cheap Olivetti.', tryThis: 'Set the strip’s rotation to 0 and the tapes to 0. Everything is straight and the design dies — punk lives in the 1.5 degrees.', interestTag: 'Punk graphics', related: ['zines', 'collage', 'DIY'] },
    tags: ['punk', 'torn', 'zine', 'collage'],
  },
  {
    id: 'lt-vaporwave', councilStyle: 'FUTURIST', name: 'Vaporwave', group: G, family: 'vaporwave', tagline: 'A gradient sun rises behind chromatic plates while a perspective floor fades in below.',
    colors: { accent: '#F66BC5', ink: '#F8F2FF', paper: '#19123A', secondary: '#61DCEB' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'grid1', label: 'Floor line', kind: 'rect', x: 0, y: 108, w: 820, h: 1.5, fill: 'secondary', opacity: .35, in: mo('fade', .35, 0, 'out'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'grid2', label: 'Floor line', kind: 'rect', x: 0, y: 122, w: 820, h: 2, fill: 'secondary', opacity: .55, in: mo('fade', .35, .1, 'out'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'grid3', label: 'Floor line', kind: 'rect', x: 0, y: 142, w: 820, h: 2.5, fill: 'secondary', opacity: .8, in: mo('fade', .35, .2, 'out'), out: mo('fade', .3, 0, 'out') }),
      L({ id: 'sun', label: 'Gradient sun', kind: 'ellipse', x: 560, y: -150, w: 160, h: 160, fill: 'accent', gradient: { angle: 90, from: 'accent', to: '#FFB37A' }, in: mo('slideD', .7, .2, 'expo', .8), out: mo('slideD', .5, 0, 'inOut', .8) }),
      L({ id: 'cut1', label: 'Sun cut', kind: 'rect', x: 556, y: -64, w: 168, h: 6, fill: 'paper', in: mo('fade', .3, .6, 'out'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'cut2', label: 'Sun cut', kind: 'rect', x: 556, y: -38, w: 168, h: 10, fill: 'paper', in: mo('fade', .3, .68, 'out'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'plate-pink', label: 'Pink ghost plate', kind: 'rect', x: 4, y: 4, w: 620, h: 96, fill: 'accent', opacity: .9, in: mo('slideR', .45, .55, 'expo', .2), out: mo('slideR', .35, 0, 'inOut', .2) }),
      L({ id: 'plate-cyan', label: 'Cyan ghost plate', kind: 'rect', x: -4, y: -4, w: 620, h: 96, fill: 'secondary', opacity: .9, in: mo('slideR', .45, .62, 'expo', .2), out: mo('slideR', .35, .03, 'inOut', .2) }),
      L({ id: 'plate', label: 'Indigo plate', kind: 'rect', x: 0, y: 0, w: 620, h: 96, fill: 'paper', in: mo('slideR', .45, .7, 'expo', .2), out: mo('slideR', .35, .06, 'inOut', .2) }),
    ],
    title: { font: 'orbitron', weight: 700, size: 42, color: 'ink', upper: true, tracking: .14, x: 24, y: 12, w: 580, align: 'left', anim: anim('tracking', .7, .8, .35, .5), maxLines: 1 },
    subtitle: { font: 'majorMono', weight: 400, size: 17, color: 'secondary', tracking: .1, x: 24, y: 66, w: 580, align: 'left', anim: anim('fadeIn', .4, 1.1, .3, .3), maxLines: 1 },
    defaults: { title: 'Rin Okamura', subtitle: 'NEW DAY // late-night broadcast' },
    lesson: { principle: 'Nostalgia is misregistration: the pink and cyan plates arrive a few frames apart and never quite line up, so the graphic looks like a VHS tracking error even though every frame is deterministic.', history: 'Vaporwave began as a music micro-genre around 2010–2012 (Macintosh Plus’s Floral Shoppe, 2011) that slowed 1980s–90s corporate muzak; its visual language — perspective grids, a striped setting sun, Roman busts, Windows 95 chrome, Japanese text — parodies the promised digital utopia of that era. The striped sun descends from Trapper Keeper and Miami Vice graphics and the Tron floor, and the RGB-split title copies the chromatic aberration of worn tape; broadcast picked the look up for synthwave music programming and 1980s-set drama.', tryThis: 'Set both ghost plates’ x and y offsets to 0. The aberration vanishes and the graphic becomes clean sci-fi — the wrongness was the point.', interestTag: 'Vaporwave', related: ['retro-futurism', 'synthwave', 'glitch'] },
    tags: ['vaporwave', 'gradient', 'retro', 'glitch'],
  },
  {
    id: 'lt-y2k', councilStyle: 'FUTURIST', name: 'Y2K Chrome', group: G, family: 'y2k', tagline: 'A translucent pill pops, a chrome bar grows beneath it and bubbles float up — the millennium as a name tag.',
    colors: { accent: '#4D68FF', ink: '#FFFFFF', paper: '#DDEBFF', secondary: '#A7FFEA' }, origin: { x: 6, y: 80 }, duration: 5,
    layers: [
      L({ id: 'pill', label: 'Translucent pill', kind: 'rect', rx: 50, x: 0, y: -10, w: 680, h: 100, fill: '#FFFFFF', opacity: .14, stroke: '#FFFFFF', strokeWidth: 1.5, in: mo('pop', .5, 0, 'back'), out: mo('pop', .35, 0, 'inOut') }),
      L({ id: 'chrome', label: 'Chrome bar', kind: 'rect', rx: 4, x: 40, y: 98, w: 500, h: 8, fill: 'ink', gradient: { angle: 0, from: '#FFFFFF', to: '#8FA3C9' }, in: mo('growX', .5, .25, 'expo'), out: mo('growX', .35, 0, 'inOut') }),
      L({ id: 'bub1', label: 'Bubble', kind: 'ellipse', x: 620, y: -62, w: 46, h: 46, fill: '#FFFFFF', opacity: .3, stroke: '#FFFFFF', strokeWidth: 2, in: mo('pop', .45, .45, 'bounce'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'bub2', label: 'Bubble', kind: 'ellipse', x: 684, y: -22, w: 28, h: 28, fill: '#FFFFFF', opacity: .3, stroke: '#FFFFFF', strokeWidth: 2, in: mo('pop', .45, .55, 'bounce'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'bub3', label: 'Bubble', kind: 'ellipse', x: 662, y: 40, w: 18, h: 18, fill: '#FFFFFF', opacity: .3, stroke: '#FFFFFF', strokeWidth: 1.5, in: mo('pop', .4, .65, 'bounce'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'spark', label: 'Sparkle', kind: 'path', path: starPath(4, .2), x: 560, y: -34, w: 30, h: 30, fill: 'ink', in: mo('pop', .3, .8, 'back'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'audiowide', weight: 400, size: 40, color: 'ink', x: 40, y: 8, w: 520, align: 'left', anim: anim('blurIn', .5, .5, .3, .5), shadow: true, maxLines: 1 },
    subtitle: { font: 'exo2', weight: 500, size: 20, color: 'secondary', tracking: .08, x: 40, y: 58, w: 520, align: 'left', anim: anim('fadeIn', .4, .8, .3, .3), shadow: true, maxLines: 1 },
    defaults: { title: 'Dani Okoro', subtitle: 'Webmaster · pop-up radio 2000' },
    lesson: { principle: 'Translucency needs the footage: the pill is only 14 % white, so the video shows through it and the graphic feels like an interface floating over the world rather than a card laid on top — the Y2K promise of glass and light.', history: 'Y2K style (c. 1997–2004) — the iMac G3 and Aqua interface, Nokia and Sony ads, The Matrix, Designers Republic’s Wipeout graphics — celebrated translucent plastic, chrome gradients, bubbles and blobby sans-serifs as the future arrived. Television idents of the period (MTV, Channel 4, Sky) were among the first fully 3D-rendered packages, and their lens flares and glassy pills reappear here as a two-dimensional memory; the blur-in title imitates a render coming into focus.', tryThis: 'Raise the pill’s opacity to 0.9. It turns into a solid white plate and the whole era evaporates — Y2K was about seeing through things.', interestTag: 'Y2K aesthetic', related: ['translucency', 'chrome', 'millennium'] },
    tags: ['y2k', 'chrome', 'bubbles', 'translucent'],
  },
  {
    id: 'lt-new-wave', councilStyle: 'EDITORIAL', name: 'New Wave', group: G, family: 'new-wave', tagline: 'Stepped rules climb, a colour field drops in over its own ghost, and the name slides in word by word.',
    colors: { accent: '#E34877', ink: '#24203B', paper: '#F5EAD7', secondary: '#1D9CAB' }, origin: { x: 6, y: 80 }, duration: 5,
    layers: [
      L({ id: 'step1', label: 'Stepped rule', kind: 'rect', x: 0, y: -70, w: 300, h: 6, fill: 'paper', in: mo('growX', .4, 0, 'expo'), out: mo('growX', .3, .2, 'inOut') }),
      L({ id: 'step2', label: 'Stepped rule', kind: 'rect', x: 300, y: -40, w: 260, h: 6, fill: 'paper', in: mo('growX', .4, .12, 'expo'), out: mo('growX', .3, .1, 'inOut') }),
      L({ id: 'step3', label: 'Stepped rule', kind: 'rect', x: 560, y: -10, w: 220, h: 6, fill: 'paper', in: mo('growX', .4, .24, 'expo'), out: mo('growX', .3, 0, 'inOut') }),
      L({ id: 'ghost', label: 'Ghost field', kind: 'rect', x: 24, y: 14, w: 620, h: 108, fill: 'secondary', opacity: .4, in: mo('slideU', .5, .45, 'expo', .5), out: mo('slideU', .35, .05, 'inOut', .5) }),
      L({ id: 'field', label: 'Colour field', kind: 'rect', x: 0, y: 0, w: 620, h: 108, fill: 'accent', in: mo('slideU', .5, .35, 'expo', .5), out: mo('slideU', .35, 0, 'inOut', .5) }),
    ],
    title: { font: 'syne', weight: 800, size: 46, color: 'paper', x: 24, y: 12, w: 580, align: 'left', anim: anim('wordSlide', .5, .6, .3, .5), maxLines: 1 },
    subtitle: { font: 'dmSans', weight: 500, size: 18, color: 'ink', upper: true, tracking: .2, x: 24, y: 72, w: 580, align: 'left', anim: anim('fadeIn', .4, .85, .3, .3), maxLines: 1 },
    defaults: { title: 'Wolfgang Adler', subtitle: 'Basel School · Emigre Contributor' },
    lesson: { principle: 'New Wave breaks the grid it inherited: the rules step instead of aligning, the field carries a translucent echo of itself, and words arrive one at a time — a Swiss lower third that has learned to dance.', history: 'New Wave typography came out of Basel in the 1970s when Wolfgang Weingart pushed his Swiss training toward stepped rules, letterspaced words and layered halftones; his students April Greiman and Dan Friedman carried it to California and the East Coast, and Greiman’s Design Quarterly (1986) and the magazine Emigre (from 1984) made the layered, elastic grid the look of early Macintosh design. Television took it up in MTV’s and Channel 4’s late-1980s graphics, where stepped rules and colour fields sliding over ghost copies became a house move.', tryThis: 'Set the ghost field’s offset to x 0, y 0. It disappears behind the solid field and the design becomes a plain Swiss plate — the echo was the New Wave.', interestTag: 'New Wave typography', related: ['Weingart', 'postmodernism', 'Emigre'] },
    tags: ['new-wave', 'layered', 'stepped', 'postmodern'],
  },
  {
    id: 'lt-psychedelic', councilStyle: 'NEON', name: 'Psychedelic', group: G, family: 'psychedelic', tagline: 'Three ribbons of colour roll in, a blob swells over them and a rounded name floats up.',
    colors: { accent: '#F04B9B', ink: '#FFF6E8', paper: '#351060', secondary: '#27B6A5' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'wave-m', label: 'Magenta ribbon', kind: 'path', path: wavePath(2.5, 24, 20, 0), x: -40, y: -34, w: 900, h: 124, fill: 'accent', opacity: .92, in: mo('slideL', .6, 0, 'expo', .55), out: mo('slideL', .45, 0, 'inOut', .6) }),
      L({ id: 'wave-g', label: 'Gold ribbon', kind: 'path', path: wavePath(2.5, 24, 20, 1.2), x: -40, y: -12, w: 900, h: 124, fill: '#F7C62F', opacity: .92, in: mo('slideL', .6, .12, 'expo', .55), out: mo('slideL', .45, .05, 'inOut', .6) }),
      L({ id: 'wave-t', label: 'Teal ribbon', kind: 'path', path: wavePath(2.5, 24, 20, 2.4), x: -40, y: 10, w: 900, h: 124, fill: 'secondary', opacity: .92, in: mo('slideL', .6, .24, 'expo', .55), out: mo('slideL', .45, .1, 'inOut', .6) }),
      L({ id: 'blob', label: 'Blob plate', kind: 'path', path: blobPath(3, 7, .18), x: 40, y: -62, w: 720, h: 204, fill: 'paper', opacity: .95, in: mo('pop', .5, .45, 'back'), out: mo('pop', .4, 0, 'inOut') }),
    ],
    title: { font: 'righteous', weight: 400, size: 50, color: 'ink', x: 120, y: -8, w: 560, align: 'center', anim: anim('fadeUp', .55, .65, .3, .6), maxLines: 1 },
    subtitle: { font: 'nunito', weight: 700, size: 22, color: '#F7C62F', x: 120, y: 56, w: 560, align: 'center', anim: anim('fadeIn', .4, .9, .3, .3), maxLines: 1 },
    defaults: { title: 'Marigold Vance', subtitle: 'Light show · The Fillmore · 1967' },
    lesson: { principle: 'Liquid motion is layered lag: the three ribbons are the same wave at three phases and three delays, so they appear to flow past each other, and the blob that overshoots into place is the only thing that ever stops moving.', history: 'Psychedelic poster art (San Francisco, 1966–1971) — Wes Wilson, Victor Moscoso, Rick Griffin, Stanley Mouse and Alton Kelley for the Fillmore and Avalon ballrooms — melted Art Nouveau lettering into vibrating complementary colours and near-illegible flowing type. Its motion counterpart was the liquid light show, oil and dye projected live behind bands, and 1960s television (Laugh-In, The Monkees) borrowed both; the rippling colour ribbons here are that projected liquid, and the rounded Righteous title stands in for the hand-drawn poster lettering.', tryThis: 'Give all three ribbons the same phase and delay. They fuse into one striped band — the era’s flow depended on the lag.', interestTag: 'Psychedelic art', related: ['1960s', 'poster art', 'counterculture'] },
    tags: ['psychedelic', 'waves', 'colour', '1960s'],
  },
  {
    id: 'lt-grunge', councilStyle: 'INK', name: 'Grunge', group: G, family: 'grunge', tagline: 'A khaki brush stroke swipes across, a misregistered second ink lands on it, and a heavy name fades through the mess.',
    colors: { accent: '#7A2C2A', ink: '#171817', paper: '#B7AD91', secondary: '#445248' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'stroke2', label: 'Misregistered red underprint', kind: 'path', path: brushStrokePath(5), x: -12, y: -32, w: 820, h: 170, rotation: -1.5, fill: 'accent', opacity: .85, in: mo('wipeR', .5, 0, 'expo'), out: mo('wipeR', .4, .05, 'inOut') }),
      L({ id: 'stroke1', label: 'Khaki brush stroke', kind: 'path', path: brushStrokePath(5), x: -20, y: -40, w: 820, h: 170, rotation: -1.5, fill: 'paper', opacity: .95, in: mo('wipeR', .5, .12, 'expo'), out: mo('wipeR', .4, 0, 'inOut') }),
      L({ id: 'speck1', label: 'Speck', kind: 'rect', x: 640, y: 22, w: 7, h: 3, rotation: 30, fill: 'ink', opacity: .6, in: mo('fade', .2, .5, 'out'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'speck2', label: 'Speck', kind: 'rect', x: 704, y: 84, w: 4, h: 4, fill: 'ink', opacity: .5, in: mo('fade', .2, .6, 'out'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'speck3', label: 'Speck', kind: 'rect', x: 96, y: 112, w: 9, h: 3, rotation: -20, fill: 'paper', opacity: .7, in: mo('fade', .2, .7, 'out'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'oswald', weight: 700, size: 58, color: 'ink', upper: true, tracking: .01, x: 30, y: 2, w: 700, align: 'left', anim: anim('fadeIn', .5, .35, .3, .6), maxLines: 1 },
    subtitle: { font: 'specialElite', weight: 400, size: 20, color: 'paper', x: 34, y: 78, w: 700, align: 'left', anim: anim('typeOn', .5, .7, .2, 1), shadow: true, maxLines: 1 },
    defaults: { title: 'Kurt Delacroix', subtitle: 'guitar / vocals — Mudhoney tour, 1992' },
    lesson: { principle: 'Grunge is overprint out of register: the red underprint lands first and the khaki stroke lands on it eight pixels off, so a rim of the wrong ink shows along every edge like a misfed press, and the type fades through rather than arriving — nothing here is allowed to be clean.', history: 'Grunge typography (Seattle and Portland, c. 1990–1996) — Ray Gun magazine, David Carson, Art Chantry, Sub Pop covers — broke grid rules entirely, using distressed typefaces, muddy overprints and illegibility as a rejection of corporate slickness. Television absorbed it in MTV and skate-video graphics, where the texture of degraded video replaced the texture of bad printing; the misregistered brush strokes and typewriter caption here are the broadcast translation of a gig poster.', tryThis: 'Set both strokes’ rotation to 0 and their x/y offsets to be identical. The mess vanishes and it becomes a tidy corporate paint swoosh — grunge requires the mistake.', interestTag: 'Grunge typography', related: ['David Carson', '1990s', 'Sub Pop'] },
    tags: ['grunge', 'brush', 'distressed', 'multiply'],
  },

  // ── Modernism late ──────────────────────────────────────────────────────────
  {
    id: 'lt-brutalist', councilStyle: 'MONO', name: 'Brutalist', group: G, family: 'brutalist', tagline: 'A concrete slab, an L-shaped black frame, exposed grid coordinates and a name too big for the plate.',
    colors: { accent: '#0047FF', ink: '#101010', paper: '#F2F0E8', secondary: '#FF3B30' }, origin: { x: 6, y: 78 }, duration: 6,
    layers: [
      L({ id: 'slab', label: 'Concrete slab', kind: 'rect', x: 0, y: -110, w: 900, h: 260, fill: 'paper', in: mo('wipeD', .4, 0, 'expo'), out: mo('wipeD', .3, 0, 'inOut') }),
      L({ id: 'frame-v', label: 'Frame (vertical)', kind: 'rect', x: 16, y: -94, w: 12, h: 228, fill: 'ink', in: mo('growY', .4, .15, 'expo'), out: mo('growY', .3, .05, 'inOut') }),
      L({ id: 'frame-h', label: 'Frame (horizontal)', kind: 'rect', x: 16, y: -94, w: 868, h: 12, fill: 'ink', in: mo('growX', .45, .3, 'expo'), out: mo('growX', .3, 0, 'inOut') }),
      L({ id: 'blue', label: 'Blue block', kind: 'rect', x: 800, y: 30, w: 84, h: 104, fill: 'accent', in: mo('growX', .35, .55, 'expo'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'red', label: 'Red tick', kind: 'rect', x: 800, y: -70, w: 84, h: 8, fill: 'secondary', in: mo('growX', .3, .65, 'expo'), out: mo('fade', .2, 0, 'out') }),
    ],
    tag: { font: 'ibmPlexMono', weight: 500, size: 15, color: 'ink', upper: true, tracking: .1, x: 44, y: -74, w: 400, align: 'left', anim: anim('typeOn', .4, .5, .2, 1), maxLines: 1 },
    title: { font: 'bigShoulders', weight: 900, size: 96, color: 'ink', upper: true, x: 40, y: -50, w: 840, align: 'left', anim: anim('dropIn', .5, .6, .3, .3), maxLines: 1 },
    subtitle: { font: 'ibmPlexMono', weight: 400, size: 19, color: 'ink', x: 44, y: 92, w: 740, align: 'left', anim: anim('fadeIn', .4, .95, .3, .3), maxLines: 1 },
    defaults: { title: 'Ada Goldfinger', subtitle: 'Architect · Trellick Tower · 1972', tag: 'A1 · col 03 · lower third' },
    lesson: { principle: 'Brutalism shows its structure: the frame is drawn as two rules that grow separately, the coordinates that a designer would hide are typed on as the caption, and the name is set so large it nearly overruns its own slab — honesty of material as a motion idea.', history: 'Brutalist architecture (Le Corbusier’s Unité d’Habitation, 1952; the Smithsons, Goldfinger, Rudolph, 1950s–70s) exposed raw concrete — béton brut — and structure; the graphic term was revived around 2014 for websites (brutalistwebsites.com) that showed default type, visible grids and oversized headlines. Broadcast brutalism arrived with mono-spaced data overlays and giant condensed names in 2010s documentary and music packages; the type-on coordinates here are the HUD idea, borrowed back from the interface.', tryThis: 'Reduce the title size to 60. It fits comfortably, and the design becomes a polite corporate plate — Brutalism needs the word to strain the frame.', interestTag: 'Brutalism', related: ['architecture', 'concrete', 'raw type'] },
    tags: ['brutalist', 'oversized', 'mono', 'frame'],
  },
  {
    id: 'lt-minimalist', councilStyle: 'RADICAL_MINIMAL', name: 'Minimalist', group: G, family: 'minimalist', tagline: 'One hairline, one light name, one small grey square. Nothing else happens, slowly.',
    colors: { accent: '#B8B5AE', ink: '#F6F5F0', paper: '#171717', secondary: '#9A3E35' }, origin: { x: 6, y: 80 }, duration: 7,
    layers: [
      L({ id: 'hair', label: 'Hairline', kind: 'rect', x: 0, y: 60, w: 480, h: 1, fill: 'accent', in: mo('growX', 1.2, 0, 'expo'), out: mo('fade', .6, 0, 'out') }),
      L({ id: 'square', label: 'Warm grey square', kind: 'rect', x: 488, y: 58, w: 5, h: 5, fill: 'accent', in: mo('fade', .6, .9, 'out'), out: mo('fade', .6, 0, 'out') }),
    ],
    title: { font: 'manrope', weight: 300, size: 44, color: 'ink', tracking: .02, x: 0, y: 0, w: 700, align: 'left', anim: anim('fadeIn', 1.0, .3, .6, .3), shadow: true, maxLines: 1 },
    subtitle: { font: 'inter', weight: 400, size: 18, color: 'accent', tracking: .1, x: 0, y: 74, w: 700, align: 'left', anim: anim('fadeIn', .8, .7, .6, .2), shadow: true, maxLines: 1 },
    defaults: { title: 'Yuki Tanaka', subtitle: 'Ceramicist · Kanazawa' },
    lesson: { principle: 'Reduction is measured in seconds as well as elements: a hairline that takes 1.2 s to draw and a name that takes a full second to appear give the footage room, and the viewer reads calm because nothing asks for attention.', history: 'Minimalism in design draws on the 1960s Minimalist artists (Judd, Martin, LeWitt), on Dieter Rams’s “less, but better” at Braun, on Japanese ma — the value of empty space — and on the reductive typography of Massimo Vignelli and Kenya Hara for Muji. On television it appears as the restrained identification of prestige documentary and arts programming (a light sans, a single rule, a slow fade), a style that trusts the subject and refuses to decorate them.', tryThis: 'Shorten the hairline’s IN to 0.3 s and the title fade to 0.3 s. Identical design, now anxious — minimalism is mostly tempo.', interestTag: 'Minimalism', related: ['Dieter Rams', 'Japanese design', 'typography'] },
    tags: ['minimalist', 'hairline', 'quiet', 'light'],
  },
  {
    id: 'lt-midcentury', councilStyle: 'BAUHAUS', name: 'Mid-Century', group: G, family: 'midcentury', tagline: 'A teal boomerang glides in, atomic dots pop beside a mustard plate, and a friendly name rises.',
    colors: { accent: '#D65A3A', ink: '#252B35', paper: '#F2D9A7', secondary: '#29726B' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'plate', label: 'Mustard plate', kind: 'rect', rx: 30, x: 0, y: -10, w: 680, h: 110, fill: 'paper', in: mo('slideR', .5, .15, 'expo', .3), out: mo('slideR', .35, 0, 'inOut', .3) }),
      L({ id: 'boom', label: 'Boomerang', kind: 'path', path: boomerangPath(), x: -30, y: -70, w: 190, h: 150, fill: 'secondary', in: mo('slideL', .55, 0, 'expo', 1.5), out: mo('slideL', .4, .05, 'inOut', 1.5) }),
      L({ id: 'dot1', label: 'Atomic dot', kind: 'ellipse', x: 700, y: -30, w: 16, h: 16, fill: 'accent', in: mo('pop', .35, .55, 'back'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'dot2', label: 'Atomic dot', kind: 'ellipse', x: 732, y: 12, w: 12, h: 12, fill: 'accent', in: mo('pop', .35, .65, 'back'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'dot3', label: 'Atomic dot', kind: 'ellipse', x: 712, y: 52, w: 20, h: 20, fill: 'accent', in: mo('pop', .35, .75, 'back'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'rod1', label: 'Atomic rod', kind: 'line', x: 708, y: -22, w: 30, h: 40, fill: 'none', stroke: 'ink', strokeWidth: 2, in: mo('fade', .25, .7, 'out'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'rod2', label: 'Atomic rod', kind: 'line', x: 722, y: 62, w: 16, h: -44, fill: 'none', stroke: 'ink', strokeWidth: 2, in: mo('fade', .25, .8, 'out'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'outfit', weight: 700, size: 48, color: 'ink', x: 150, y: 4, w: 510, align: 'left', anim: anim('fadeUp', .55, .5, .3, .5), maxLines: 1 },
    subtitle: { font: 'nunito', weight: 600, size: 22, color: 'accent', x: 150, y: 62, w: 510, align: 'left', anim: anim('fadeIn', .4, .75, .3, .3), maxLines: 1 },
    defaults: { title: 'Ray Eames-Lindqvist', subtitle: 'Furniture designer · Palm Springs' },
    lesson: { principle: 'Optimism is a gliding entrance: the boomerang arrives on a long expo slide with no bounce, the plate follows on the same axis, and the atomic dots pop like a chord — nothing hesitates, because the future was assumed to be good.', history: 'Mid-century modern (c. 1945–1965) — the Eameses, Saarinen, Nelson, Girard, and the Googie roadside architecture of California — paired new materials (moulded plywood, fibreglass) with atomic and boomerang motifs celebrating the space and nuclear age. Television was born in this style: Saul Bass’s title sequences, UPA’s flat cartoons and the earliest network idents used the same amoeba shapes and gliding forms, so this lower third reads as “the era television began” even to viewers who know none of the names.', tryThis: 'Change the boomerang’s slide to a pop with a back ease. It becomes cartoonish rather than gliding — the same shape, a different decade.', interestTag: 'Mid-century modern', related: ['Eames', 'atomic age', 'Googie'] },
    tags: ['midcentury', 'boomerang', 'atomic', 'rounded'],
  },
  {
    id: 'lt-space-age', councilStyle: 'FUTURIST', name: 'Space Age', group: G, family: 'space-age', tagline: 'Two orbits spin into alignment around a small orange planet; a capsule plate extends from it.',
    colors: { accent: '#EF603B', ink: '#E9EDF2', paper: '#0D1830', secondary: '#55B8C8' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'orbit1', label: 'Orbit ring', kind: 'ellipse', x: -30, y: -40, w: 200, h: 70, rotation: -20, fill: 'none', stroke: 'secondary', strokeWidth: 3, in: mo('spin', .7, 0, 'expo', 120), out: mo('spin', .45, 0, 'inOut', 90) }),
      L({ id: 'orbit2', label: 'Orbit ring', kind: 'ellipse', x: -20, y: -32, w: 180, h: 90, rotation: 32, fill: 'none', stroke: 'accent', strokeWidth: 2, in: mo('spin', .7, .1, 'expo', -100), out: mo('spin', .45, .05, 'inOut', -80) }),
      L({ id: 'planet', label: 'Planet', kind: 'ellipse', x: 50, y: -14, w: 40, h: 40, fill: 'accent', in: mo('pop', .4, .25, 'back'), out: mo('pop', .3, .1, 'inOut') }),
      L({ id: 'capsule', label: 'Capsule plate', kind: 'rect', rx: 44, x: 120, y: -10, w: 620, h: 88, fill: 'paper', opacity: .92, in: mo('growX', .5, .3, 'expo'), out: mo('growX', .35, 0, 'inOut') }),
      L({ id: 'star', label: 'Star', kind: 'ellipse', x: 760, y: -46, w: 6, h: 6, fill: 'ink', in: mo('pop', .3, .8, 'out'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'orbitron', weight: 600, size: 38, color: 'ink', upper: true, tracking: .1, x: 160, y: 8, w: 560, align: 'left', anim: anim('tracking', .7, .5, .35, .5), maxLines: 1 },
    subtitle: { font: 'michroma', weight: 400, size: 14, color: 'secondary', upper: true, tracking: .22, x: 160, y: 58, w: 560, align: 'left', anim: anim('fadeIn', .4, .85, .3, .2), maxLines: 1 },
    defaults: { title: 'Valentina Reyes', subtitle: 'Commander · Orbital Station Six' },
    lesson: { principle: 'Orbits arrive by rotating into alignment: the rings spin down to their resting angles while fading up, so the design seems to stabilise rather than appear, and the capsule extends from the planet like a docking arm.', history: 'Space Age design (1957–1972, Sputnik to the last Apollo) turned the race for orbit into style: Eero Aarnio’s Ball chair, Courrèges and Cardin fashions, the Seattle Space Needle, Kubrick’s 2001. Broadcast graphics were transformed by it — the BBC’s Tomorrow’s World and the live Apollo coverage introduced orbit diagrams, capsule outlines and squared “computer” lettering to millions, and the tracked geometric title still means mission, launch or science programme half a century later.', tryThis: 'Set both rings’ spin amount to 0 so they only fade. The graphic still works, but it merely appears — the stabilising spin was what said “in orbit”.', interestTag: 'Space Age design', related: ['Apollo', 'retro-futurism', 'science'] },
    tags: ['space-age', 'orbit', 'capsule', 'science'],
  },

  // ── Global traditions ───────────────────────────────────────────────────────
  {
    id: 'lt-harlem', councilStyle: 'BAROQUE', name: 'Harlem Renaissance', group: G, family: 'harlem', tagline: 'A spotlight opens, four rules land on a syncopated beat, and a heavy serif name rises under a jazz kicker.',
    colors: { accent: '#9D3A30', ink: '#2A201D', paper: '#E9D7B0', secondary: '#C69C43' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'spot', label: 'Spotlight', kind: 'ellipse', x: -60, y: -170, w: 360, h: 360, fill: 'paper', opacity: .22, in: mo('pop', .6, 0, 'expo'), out: mo('fade', .4, 0, 'out') }),
      L({ id: 'rule1', label: 'Rule (beat 1)', kind: 'rect', x: 0, y: 74, w: 520, h: 4, fill: 'secondary', in: mo('growX', .4, .3, 'expo'), out: mo('growX', .3, 0, 'inOut') }),
      L({ id: 'rule2', label: 'Rule (beat 2)', kind: 'rect', x: 0, y: 86, w: 340, h: 4, fill: 'secondary', in: mo('growX', .4, .42, 'expo'), out: mo('growX', .3, .05, 'inOut') }),
      L({ id: 'rule3', label: 'Rule (beat 3)', kind: 'rect', x: 0, y: 98, w: 440, h: 4, fill: 'secondary', in: mo('growX', .4, .5, 'expo'), out: mo('growX', .3, .1, 'inOut') }),
      L({ id: 'rule4', label: 'Rule (beat 4)', kind: 'rect', x: 0, y: 110, w: 220, h: 4, fill: 'accent', in: mo('growX', .4, .66, 'expo'), out: mo('growX', .3, .15, 'inOut') }),
    ],
    tag: { font: 'bebas', weight: 400, size: 22, color: 'secondary', upper: true, tracking: .16, x: 0, y: -52, w: 500, align: 'left', anim: anim('fadeIn', .3, .5, .25, 0), shadow: true, maxLines: 1 },
    title: { font: 'playfair', weight: 900, size: 56, color: 'paper', x: 0, y: -24, w: 760, align: 'left', anim: anim('fadeUp', .6, .7, .35, .6), shadow: true, maxLines: 1 },
    subtitle: { font: 'playfair', weight: 400, size: 22, color: 'paper', italic: true, x: 0, y: 122, w: 700, align: 'left', anim: anim('fadeIn', .4, 1.0, .3, .3), shadow: true, maxLines: 1 },
    defaults: { title: 'Zora Neale Hurston', subtitle: 'Novelist & anthropologist · Eatonville · Harlem', tag: 'Voices of the Renaissance' },
    lesson: { principle: 'Rhythm is uneven spacing: the four rules land at 0, 0.12, 0.2 and 0.36 s — a swung, not a metronomic, pattern — and their differing lengths make a bar chart of a jazz phrase under the name.', history: 'The Harlem Renaissance (c. 1918–1937) — Langston Hughes, Zora Neale Hurston, Duke Ellington, Aaron Douglas’s silhouetted murals and the covers of The Crisis and Opportunity — combined literary modernism, jazz and a new Black portraiture in New York. Douglas’s concentric rays and stepped forms and the era’s heavy display serifs anchor the design; the spotlight is the Cotton Club and Savoy stage, and the syncopated rules borrow the way jazz notation and Douglas’s bands of light fall off the beat.', tryThis: 'Set the four rules to equal lengths and equal delays of 0.1 s apart. The chart becomes a ladder — correct, tidy, and no longer swinging.', interestTag: 'Harlem Renaissance', related: ['jazz', 'Aaron Douglas', 'American literature'] },
    tags: ['harlem', 'jazz', 'serif', 'rhythm'],
  },
  {
    id: 'lt-ukiyoe', councilStyle: 'INK', name: 'Ukiyo-e', group: G, family: 'ukiyoe', tagline: 'A flat indigo wave sweeps in from the right, a cream cartouche follows and a red seal stamps the corner.',
    colors: { accent: '#B94335', ink: '#244C5A', paper: '#E8D8B4', secondary: '#D2A33A' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'wave', label: 'Wave band', kind: 'path', path: wavePath(2, 36, 30, .6), x: -40, y: -66, w: 900, h: 170, fill: 'ink', in: mo('slideR', .6, 0, 'expo', .5), out: mo('slideR', .45, 0, 'inOut', .55) }),
      L({ id: 'tab', label: 'Vertical label tab', kind: 'rect', x: 0, y: -44, w: 28, h: 148, fill: 'secondary', in: mo('growY', .5, .35, 'expo'), out: mo('growY', .3, .1, 'inOut') }),
      L({ id: 'plate', label: 'Cream cartouche', kind: 'rect', x: 40, y: -8, w: 620, h: 112, fill: 'paper', in: mo('wipeL', .5, .2, 'expo'), out: mo('wipeL', .35, 0, 'inOut') }),
      L({ id: 'seal', label: 'Red seal', kind: 'rect', rx: 4, x: 680, y: -8, w: 56, h: 56, fill: 'accent', in: mo('pop', .35, .6, 'back'), out: mo('fade', .25, 0, 'out') }),
      L({ id: 'seal-mark', label: 'Seal mark', kind: 'rect', x: 700, y: 12, w: 16, h: 16, fill: 'paper', in: mo('pop', .25, .75, 'out'), out: mo('fade', .2, 0, 'out') }),
    ],
    title: { font: 'shippori', weight: 700, size: 44, color: 'ink', x: 64, y: 6, w: 580, align: 'left', anim: anim('fadeIn', .6, .5, .3, .5), maxLines: 1 },
    subtitle: { font: 'shippori', weight: 400, size: 17, color: 'accent', upper: true, tracking: .2, x: 64, y: 68, w: 580, align: 'left', anim: anim('fadeIn', .4, .85, .3, .2), maxLines: 1 },
    defaults: { title: 'Hokusai Katsushika', subtitle: 'Woodblock printmaker · Edo · c. 1831' },
    lesson: { principle: 'Flat colour and bold crop: the wave is one indigo shape with no shading, it enters from the right the way a print is read, and the red seal is stamped last — the printmaker’s signature, applied after the image.', history: 'Ukiyo-e, “pictures of the floating world” (Edo Japan, 17th–19th c.) — Hokusai, Hiroshige, Utamaro — were multi-block colour woodcuts of actors, landscapes and courtesans; their flat colour, black contour, asymmetric cropping and vertical cartouches with a red artist’s seal reshaped European art when they reached Paris in the 1860s. Broadcast borrows the wave and seal for Japanese cultural programming and anime-adjacent design; the vertical yellow tab here stands in for the cartouche a print would carry, since screen type stays horizontal.', tryThis: 'Recolour the wave to a gradient. It stops being a print at once — ukiyo-e is flat because each colour was one carved block.', interestTag: 'Ukiyo-e', related: ['Hokusai', 'woodblock print', 'Japanese art'] },
    tags: ['ukiyoe', 'wave', 'seal', 'japan'],
  },
  {
    id: 'lt-islamic-geometry', councilStyle: 'CEREMONIAL', name: 'Islamic Geometry', group: G, family: 'islamic-geometry', tagline: 'An eight-point star turns into alignment, a frieze of small stars follows and a gold hairline underlines the name.',
    colors: { accent: '#B98A32', ink: '#243B73', paper: '#F1E5C8', secondary: '#155A63' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'star', label: 'Eight-point star', kind: 'path', path: eightStarPath(), x: 0, y: -30, w: 120, h: 120, fill: 'secondary', in: mo('spin', .6, 0, 'expo', 45), out: mo('spin', .4, 0, 'inOut', 45) }),
      L({ id: 'star-in', label: 'Inner star', kind: 'path', path: eightStarPath(), x: 26, y: -4, w: 68, h: 68, fill: 'accent', in: mo('spin', .6, .1, 'expo', -45), out: mo('spin', .4, .05, 'inOut', -45) }),
      L({ id: 'plate', label: 'Deep-blue plate', kind: 'rect', x: 140, y: -10, w: 620, h: 96, fill: 'ink', opacity: .92, in: mo('wipeR', .5, .2, 'expo'), out: mo('wipeR', .35, 0, 'inOut') }),
      L({ id: 'f1', label: 'Frieze star', kind: 'path', path: eightStarPath(), x: 600, y: -42, w: 22, h: 22, fill: 'accent', in: mo('pop', .3, .5, 'back'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'f2', label: 'Frieze star', kind: 'path', path: eightStarPath(), x: 632, y: -42, w: 22, h: 22, fill: 'accent', in: mo('pop', .3, .6, 'back'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'f3', label: 'Frieze star', kind: 'path', path: eightStarPath(), x: 664, y: -42, w: 22, h: 22, fill: 'accent', in: mo('pop', .3, .7, 'back'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'hair', label: 'Gold hairline', kind: 'rect', x: 140, y: 90, w: 620, h: 2, fill: 'accent', in: mo('growX', .5, .75, 'expo'), out: mo('fade', .25, 0, 'out') }),
    ],
    title: { font: 'amiri', weight: 700, size: 44, color: 'paper', x: 170, y: 2, w: 560, align: 'left', anim: anim('fadeIn', .6, .55, .3, .5), maxLines: 1 },
    subtitle: { font: 'cairo', weight: 500, size: 20, color: 'accent', x: 170, y: 56, w: 560, align: 'left', anim: anim('fadeIn', .4, .9, .3, .3), maxLines: 1 },
    defaults: { title: 'Dr. Layla Haddad', subtitle: 'Historian of geometry · Granada' },
    lesson: { principle: 'Unity through repetition: the same eight-point star appears at three scales — the emblem, its inner echo turning the opposite way, and the frieze — so the design is one module rotated and repeated, exactly how a girih pattern is built.', history: 'Islamic geometric ornament developed from the 8th century across the Umayyad, Abbasid, Seljuk, Mamluk, Nasrid and Timurid worlds — the Alhambra, Isfahan, Cairo’s mosques — building infinite tessellations from a compass and straightedge; the eight-point star (two squares) is the seed of most of them. It carries no image of the divine, only proportion, so it moves well: rotating a star into alignment is the pattern’s own construction made visible, and the gold-on-blue palette comes from Iznik and Persian tilework.', tryThis: 'Change the inner star’s spin to +45 so both turn the same way. They now read as one shape — the counter-rotation was what made them two layers of a lattice.', interestTag: 'Islamic geometric art', related: ['girih', 'tessellation', 'Alhambra'] },
    tags: ['islamic-geometry', 'star', 'gold', 'pattern'],
  },
  {
    id: 'lt-mexican-modern', councilStyle: 'REBEL', name: 'Mexican Modern', group: G, family: 'mexican-modern', tagline: 'A teal field, an ochre sun with hand-cut rays, a heavy woodcut rule and a pink name that drops like a headline.',
    colors: { accent: '#C83A2A', ink: '#28221F', paper: '#F0D6A4', secondary: '#176B61' }, origin: { x: 6, y: 78 }, duration: 6,
    layers: [
      L({ id: 'field', label: 'Teal field', kind: 'rect', x: 0, y: -40, w: 800, h: 160, fill: 'secondary', in: mo('wipeR', .4, 0, 'expo'), out: mo('wipeR', .3, 0, 'inOut') }),
      L({ id: 'sun', label: 'Flat sun', kind: 'ellipse', x: 20, y: -20, w: 80, h: 80, fill: 'paper', in: mo('pop', .4, .15, 'back'), out: mo('pop', .3, .1, 'inOut') }),
      ...sunRays(60, 20, 48, 66, 'paper', 6, .35, .04),
      L({ id: 'rule', label: 'Woodcut rule', kind: 'rect', x: 0, y: 72, w: 800, h: 14, rotation: -.8, fill: 'ink', in: mo('growX', .5, .55, 'expo'), out: mo('growX', .35, .05, 'inOut') }),
    ],
    title: { font: 'anton', weight: 400, size: 54, color: '#E8407A', upper: true, tracking: .01, x: 130, y: 2, w: 660, align: 'left', anim: anim('dropIn', .5, .6, .3, .4), maxLines: 1 },
    subtitle: { font: 'bitter', weight: 600, size: 20, color: 'paper', x: 130, y: 94, w: 660, align: 'left', anim: anim('fadeIn', .4, .95, .3, .3), maxLines: 1 },
    defaults: { title: 'Lola Álvarez Bravo', subtitle: 'Photographer · Mexico City · 1949' },
    lesson: { principle: 'The public voice is flat and loud: shapes carry one colour each, the sun’s rays are separate hand-cut strokes that pop in around it like a woodcut being gouged, and the black rule lands heavy and a little crooked before the pink headline drops.', history: 'Mexican modernism (1920s–1960s) — the muralists Rivera, Orozco and Siqueiros, the Taller de Gráfica Popular’s linocut posters (from 1937), Posada’s earlier broadsheets, and the graphic identity of the 1968 Mexico City Olympics — fused pre-Hispanic form with a socialist public art of flat shapes, bold outlines and saturated pink, teal and ochre. Its posters were meant to be read across a plaza, which is why its lower-third translation is the largest, flattest and least subtle of the set, and why the rule is cut slightly off square.', tryThis: 'Set the woodcut rule’s rotation to 0 and the sun’s rays to a single ring stroke. The design becomes a clean flat-colour plate — the hand was in the imperfections.', interestTag: 'Mexican modernism', related: ['muralism', 'linocut', 'Taller de Gráfica Popular'] },
    tags: ['mexican-modern', 'sun', 'woodcut', 'flat colour'],
  },
  {
    id: 'lt-afrofuturist', councilStyle: 'CEREMONIAL', name: 'Afrofuturist', group: G, family: 'afrofuturist', tagline: 'A radiant crown of five rings expands from the centre, an indigo plate settles beside it and a wide name tracks in.',
    colors: { accent: '#E6B84A', ink: '#F4EEFF', paper: '#15102B', secondary: '#18A6A6' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      ...crownRings(70, 30, [18, 34, 50, 66, 82], ['accent', 'secondary'], .08),
      L({ id: 'core', label: 'Crown core', kind: 'ellipse', x: 62, y: 22, w: 16, h: 16, fill: 'accent', in: mo('pop', .3, 0, 'back'), out: mo('fade', .2, 0, 'out') }),
      L({ id: 'plate', label: 'Indigo plate', kind: 'rect', rx: 6, x: 170, y: -12, w: 620, h: 100, fill: 'paper', opacity: .9, in: mo('fade', .5, .45, 'out'), out: mo('fade', .35, 0, 'out') }),
      L({ id: 'hair', label: 'Gold hairline', kind: 'rect', x: 196, y: 60, w: 300, h: 2, fill: 'accent', in: mo('growX', .5, .8, 'expo'), out: mo('fade', .25, 0, 'out') }),
    ],
    title: { font: 'unbounded', weight: 700, size: 38, color: 'ink', upper: true, tracking: .1, x: 196, y: 4, w: 570, align: 'left', anim: anim('tracking', .7, .6, .35, .5), maxLines: 1 },
    subtitle: { font: 'sora', weight: 500, size: 20, color: 'secondary', x: 196, y: 70, w: 570, align: 'left', anim: anim('fadeIn', .4, .95, .3, .3), maxLines: 1 },
    defaults: { title: 'Nnedi Adeyemi', subtitle: 'Composer · Sun Ra Arkestra alumna' },
    lesson: { principle: 'Radiance is a rhythm outward: each ring pops 0.08 s after the one inside it, so the crown appears to broadcast from its centre like a drum hit rippling through a skin, and the plate only settles once the signal has reached its edge.', history: 'Afrofuturism — named by Mark Dery in 1993 but rooted in Sun Ra’s cosmic jazz of the 1950s–70s, Octavia Butler’s and Samuel Delany’s fiction, Parliament-Funkadelic’s Mothership and George Clinton’s stage design — imagines Black futures through technology, space and ancestral memory. Its visual grammar (radiant geometry, indigo and gold, concentric and radial forms, the portrait as monarch) reached mass television with Janelle Monáe’s videos and Black Panther (2018); this design uses those principles without borrowing any specific people’s sacred symbols.', tryThis: 'Reverse the ring order so the outer ring pops first and the centre last. The crown now implodes — same shapes, the opposite feeling.', interestTag: 'Afrofuturism', related: ['Sun Ra', 'speculative fiction', 'radiant geometry'] },
    tags: ['afrofuturist', 'rings', 'gold', 'indigo'],
  },
];
