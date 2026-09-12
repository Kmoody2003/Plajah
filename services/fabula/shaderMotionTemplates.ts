// Fabula x Plajah Pixels — editable motion-graphics templates with a real
// production shader underneath the vector/type system. The same shader id is
// resolved by the live monitor and offline renderer, keeping preview/export exact.
import { anim, mo, type LowerThirdSpec, type LTLayer, type LTTextRole } from './lowerThirds';
import type { TelaChartStyle } from '../../types';

const lesson = (principle: string, history: string, tryThis: string, interestTag: string) => ({
  principle, history, tryThis, interestTag, related: ['motion graphics', 'audio reactive', 'shader typography'],
});

const role = (font: LTTextRole['font'], weight: number, size: number, color: LTTextRole['color'], x: number, y: number, w: number, align: LTTextRole['align'], type: Parameters<typeof anim>[0] = 'fadeUp', delay = .25): LTTextRole => ({
  font, weight, size, color, x, y, w, align, anim: anim(type, .72, delay, .42, .55), tracking: .01, shadow: true, maxLines: 2,
});

const plate = (id: string, x: number, y: number, w: number, h: number, fill: LTLayer['fill'], rx = 0, opacity = 1, blend: LTLayer['blend'] = 'normal'): LTLayer => ({
  id, label: id.replaceAll('-', ' '), kind: 'rect', x, y, w, h, fill, rx, opacity, blend,
  in: mo('growX', .68, 0, 'expo'), out: mo('wipeR', .45, 0, 'inOut'),
});

const commonHistory = 'Contemporary broadcast systems increasingly combine realtime GPU fields with disciplined Swiss-style information hierarchy. These designs keep typography readable while the image beneath remains alive, dimensional and synchronized to sound.';

export const SHADER_MOTION_TEMPLATES: LowerThirdSpec[] = [
  {
    id: 'shader-tidal-identity', councilStyle: 'GLASS', name: 'Tidal Identity', group: 'SHADER FUSION', family: 'Living Volumes', format: 'lower-third',
    tagline: 'A pearl-water identity plate whose living field breathes with chord energy.',
    shaderFusion: { shaderId: 'pearl-tides', opacity: .24, blend: 'screen', params: [.30, .44, .40, .42] },
    colors: { accent: '#4EECE1', ink: '#EFFFFD', paper: '#071B22', secondary: '#D9A6FF' }, origin: { x: 5, y: 75 },
    layers: [
      plate('deep-glass', 0, 0, 950, 190, 'paper', 28, .88),
      { ...plate('pearl-line', 0, 0, 12, 190, 'accent', 6), in: mo('growY', .55, .05, 'expo') },
      { ...plate('horizon', 36, 145, 840, 2, 'accent'), opacity: .7, blend: 'screen', in: mo('wipeR', .8, .18, 'expo') },
      { id: 'moon', label: 'Tidal pearl', kind: 'ellipse', x: 820, y: 34, w: 96, h: 96, fill: 'secondary', opacity: .56, blend: 'screen', in: mo('pop', .7, .2, 'back'), out: mo('fade', .35) },
    ],
    title: role('sora', 760, 54, 'ink', 38, 31, 730, 'left', 'fadeUp', .16), subtitle: role('inter', 500, 25, 'accent', 40, 102, 700, 'left', 'tracking', .32),
    tag: { ...role('dmMono', 700, 18, 'paper', 785, 70, 110, 'center', 'dropIn', .5), upper: true },
    defaults: { title: 'LUMINOUS CURRENT', subtitle: 'A live identity shaped by harmony', tag: 'LIVE' }, duration: 6,
    lesson: lesson('Let the reactive field carry emotion while a restrained plate protects legibility and hierarchy.', commonHistory, 'Replace the aqua accent with one brand colour, then lower shader opacity until the type remains dominant.', 'shader-fusion-titles'), tags: ['fluid', 'tranquil', 'identity', 'music', 'lower third'],
  },
  {
    id: 'shader-signal-bloom', councilStyle: 'PLAJAH', name: 'Signal Bloom', group: 'SHADER FUSION', family: 'Living Volumes', format: 'lower-third',
    tagline: 'An energetic neon name system that blooms on summed notes rather than raw loudness.',
    shaderFusion: { shaderId: 'neon-maelstrom', opacity: .19, blend: 'add', params: [.66, .55, .36, .46] },
    colors: { accent: '#FF2C93', ink: '#FFFFFF', paper: '#10051D', secondary: '#31E6FF' }, origin: { x: 6, y: 72 },
    layers: [
      { ...plate('shadow', 24, 22, 1040, 174, 'paper', 6, .9), rotation: -1.2, in: mo('slideL', .62, 0, 'back') },
      { ...plate('main', 0, 0, 1030, 172, 'paper', 6, .94), gradient: { angle: 4, from: 'paper', to: '#261039' } },
      { ...plate('pulse', 0, 0, 220, 172, 'accent', 6, .92, 'screen'), in: mo('slideL', .54, .08, 'back') },
      { ...plate('cyan-rule', 230, 22, 760, 4, 'secondary'), blend: 'screen', in: mo('wipeR', .72, .22, 'expo') },
    ],
    title: role('unbounded', 740, 43, 'ink', 250, 45, 710, 'left', 'scramble', .14), subtitle: role('dmMono', 500, 21, 'secondary', 252, 108, 700, 'left', 'tracking', .33),
    tag: { ...role('bebas', 700, 48, 'paper', 28, 50, 162, 'center', 'dropIn', .22), upper: true },
    defaults: { title: 'MAYA REYES', subtitle: 'Artist · Systems Dreamer', tag: '01' }, duration: 5,
    lesson: lesson('Use asymmetry and a loud index block to create energy; keep descriptive copy on a quiet baseline.', commonHistory, 'Try a two-note chord and watch the maelstrom colour change without forcing the text animation faster.', 'energetic-lower-thirds'), tags: ['neon', 'energetic', 'artist', 'music', 'lower third'],
  },
  {
    id: 'shader-prism-ledger', councilStyle: 'EDITORIAL', name: 'Prism Ledger', group: 'SHADER FUSION', family: 'Glass Harmonics', format: 'lower-third',
    tagline: 'Optical glass, fine rules and editorial typography for premium information.',
    shaderFusion: { shaderId: 'prism-choir', opacity: .21, blend: 'screen', params: [.28, .58, .52, .48] },
    colors: { accent: '#F6D88A', ink: '#FFFDF7', paper: '#071018', secondary: '#8EDCFF' }, origin: { x: 7, y: 73 },
    layers: [
      { ...plate('smoked-glass', 0, 0, 1120, 188, 'paper', 2, .9), gradient: { angle: 0, from: '#071018', to: '#142435' } },
      { ...plate('gold-rule', 0, 0, 1120, 3, 'accent'), in: mo('wipeR', .9, 0, 'expo') },
      { ...plate('fine-rule', 276, 128, 790, 1, 'secondary'), opacity: .64, in: mo('wipeR', .8, .24, 'expo') },
      { id: 'optic', label: 'Prism aperture', kind: 'ellipse', x: 42, y: 38, w: 118, h: 118, fill: '#00000000', stroke: 'accent', strokeWidth: 2, opacity: .9, in: mo('spin', .8, .1, 'expo', 90), out: mo('fade', .4) },
    ],
    title: role('playfair', 720, 56, 'ink', 208, 29, 820, 'left', 'blurIn', .18), subtitle: { ...role('inter', 480, 22, 'secondary', 210, 101, 820, 'left', 'tracking', .4), upper: true, tracking: .14 },
    tag: { ...role('dmMono', 650, 18, 'accent', 54, 84, 92, 'center', 'blurIn', .34), upper: true },
    defaults: { title: 'The Architecture of Light', subtitle: 'Chapter IV · Refraction', tag: '04' }, duration: 7,
    lesson: lesson('Pair expressive serif display type with precise utility text to make experimental imagery feel authoritative.', commonHistory, 'Keep the prism shader subtle, then increase only the gold rule contrast to test hierarchy.', 'editorial-motion'), tags: ['glass', 'editorial', 'luxury', 'prism', 'lower third'],
  },
  {
    id: 'shader-deep-current', councilStyle: 'BAROQUE', name: 'Deep Current', group: 'SHADER FUSION', family: 'Living Volumes', format: 'lower-third',
    tagline: 'A cinematic location card hovering above a slow celestial lagoon.',
    shaderFusion: { shaderId: 'celestial-lagoon', opacity: .18, blend: 'overlay', params: [.22, .48, .38, .40] },
    colors: { accent: '#7FDBFF', ink: '#F4FAFF', paper: '#030A18', secondary: '#D4B36A' }, origin: { x: 8, y: 76 },
    layers: [
      { ...plate('night-plate', 0, 0, 890, 166, 'paper', 0, .84), in: mo('wipeR', .82, 0, 'expo') },
      { ...plate('waterline', 0, 164, 890, 2, 'accent'), blend: 'screen', in: mo('wipeR', 1, .12, 'expo') },
      { ...plate('location-tab', 0, -34, 238, 34, 'secondary'), in: mo('slideD', .5, .18, 'back') },
    ],
    title: role('fraunces', 620, 54, 'ink', 34, 35, 790, 'left', 'wordSlide', .22), subtitle: role('inter', 480, 22, 'accent', 36, 105, 760, 'left', 'fadeIn', .44),
    tag: { ...role('dmMono', 740, 16, 'paper', 18, -28, 202, 'center', 'tracking', .28), upper: true, tracking: .16 },
    defaults: { title: 'Pelagic Observatory', subtitle: 'Listening below the visible world', tag: 'NORTH ATLANTIC' }, duration: 7,
    lesson: lesson('A narrow location tab provides orientation before the more emotional title arrives.', commonHistory, 'Move the anchor upward for portrait footage and preserve the long empty right edge as breathing room.', 'cinematic-locations'), tags: ['ocean', 'cinematic', 'location', 'tranquil', 'lower third'],
  },
  {
    id: 'shader-nebula-manifesto', councilStyle: 'FUTURIST', name: 'Nebula Manifesto', group: 'FULL PAGE', family: 'Living Volumes', format: 'full-page',
    tagline: 'A complete title page suspended inside slow three-dimensional moonmilk.',
    shaderFusion: { shaderId: 'moonmilk', opacity: .78, blend: 'normal', params: [.24, .62, .48, .56] },
    colors: { accent: '#E6C7FF', ink: '#FFFFFF', paper: '#090513', secondary: '#F2C985' }, origin: { x: 0, y: 0 },
    layers: [
      plate('frame', 48, 48, 1824, 984, '#00000000', 0, 1),
      { id: 'top-rule', label: 'Top rule', kind: 'line', x: 120, y: 120, w: 1680, h: 1, fill: 'accent', stroke: 'accent', strokeWidth: 2, opacity: .65, in: mo('wipeR', 1.1, .1, 'expo'), out: mo('fade', .5) },
      { id: 'orbit', label: 'Orbit', kind: 'ellipse', x: 1190, y: 210, w: 470, h: 470, fill: '#00000000', stroke: 'secondary', strokeWidth: 2, opacity: .52, in: mo('spin', 1.4, .18, 'expo', 110), out: mo('fade', .5) },
      { ...plate('chapter-chip', 122, 748, 260, 54, 'accent', 27, .92), in: mo('pop', .7, .65, 'back') },
    ],
    title: { ...role('fraunces', 720, 112, 'ink', 118, 280, 1110, 'left', 'wordSlide', .3), lineHeight: .95, maxLines: 3 }, subtitle: role('inter', 480, 30, 'accent', 124, 648, 930, 'left', 'tracking', .72),
    tag: { ...role('dmMono', 750, 18, 'paper', 144, 765, 214, 'center', 'tracking', .82), upper: true },
    defaults: { title: 'WE ARE MADE\nOF LISTENING', subtitle: 'A film about the shapes hidden inside sound', tag: 'AUDIO ESSAY' }, duration: 9,
    lesson: lesson('Scale contrast turns the title into architecture while the shader supplies atmosphere and depth.', commonHistory, 'Replace the two-line manifesto with a six-word statement and preserve the deliberate lower-left alignment.', 'full-page-titles'), tags: ['full page', 'nebula', 'manifesto', 'tranquil', 'title card'],
  },
  {
    id: 'shader-ocean-index', councilStyle: 'WORLD_ATLAS', name: 'Ocean Index', group: 'FULL PAGE', family: 'Living Volumes', format: 'full-page',
    tagline: 'A scientific chapter index over a responsive submerged glass reef.',
    shaderFusion: { shaderId: 'glass-reef', opacity: .72, blend: 'normal', params: [.27, .55, .44, .50] },
    colors: { accent: '#55E8D4', ink: '#EFFFFB', paper: '#03131B', secondary: '#FFB86C' }, origin: { x: 0, y: 0 },
    layers: [
      { ...plate('left-wash', 0, 0, 1030, 1080, 'paper', 0, .72), gradient: { angle: 0, from: '#03131B', to: '#03131B22' }, in: mo('wipeR', 1.0, 0, 'expo') },
      { ...plate('index-rule', 124, 190, 4, 684, 'accent'), in: mo('growY', 1.0, .15, 'expo') },
      { id: 'locator', label: 'Locator ring', kind: 'ellipse', x: 1502, y: 144, w: 210, h: 210, fill: '#00000000', stroke: 'secondary', strokeWidth: 3, opacity: .78, in: mo('pop', .8, .4, 'back'), out: mo('fade', .4) },
    ],
    title: { ...role('spaceGrotesk', 720, 96, 'ink', 184, 246, 760, 'left', 'fadeUp', .32), lineHeight: 1.0 }, subtitle: role('dmMono', 500, 24, 'accent', 190, 502, 680, 'left', 'tracking', .62),
    tag: { ...role('bebas', 800, 74, 'secondary', 1525, 215, 164, 'center', 'dropIn', .54), upper: true },
    defaults: { title: 'THE OCEAN\nREMEMBERS', subtitle: 'FIELD NOTES / VOLUME 02 / HADAL ZONE', tag: '02' }, duration: 8,
    lesson: lesson('A strong vertical datum can organize a whole frame while translucent coverage protects footage and shader detail.', commonHistory, 'Use the index line to align every text box; change content without changing the underlying grid.', 'information-motion'), tags: ['full page', 'ocean', 'science', 'index', 'title card'],
  },
  {
    id: 'shader-constellation-grid', councilStyle: 'CEREMONIAL', name: 'Constellation Grid', group: 'FULL PAGE', family: 'Glass Harmonics', format: 'full-page',
    tagline: 'A precision grid fractured by a brilliant chromatic monolith.',
    shaderFusion: { shaderId: 'chromatic-monolith', opacity: .82, blend: 'normal', params: [.34, .72, .55, .62] },
    colors: { accent: '#FF4DA8', ink: '#FFFFFF', paper: '#080513', secondary: '#66ECFF' }, origin: { x: 0, y: 0 },
    layers: [
      { ...plate('shade', 0, 0, 1920, 1080, '#07040DB8', 0, .48), in: mo('fade', .8) },
      ...[0, 1, 2, 3].map((i): LTLayer => ({ id: `grid-${i}`, label: `Grid line ${i + 1}`, kind: 'line', x: 160 + i * 400, y: 104, w: 1, h: 872, fill: 'secondary', stroke: 'secondary', strokeWidth: 1, opacity: .22, in: mo('growY', .9, .12 + i * .08, 'expo'), out: mo('fade', .4) })),
      { ...plate('hot-corner', 1480, 768, 280, 146, 'accent', 0, .92, 'screen'), in: mo('slideR', .68, .45, 'back') },
    ],
    title: { ...role('unbounded', 760, 86, 'ink', 170, 190, 1320, 'left', 'scramble', .28), tracking: -.02 }, subtitle: role('dmMono', 560, 23, 'secondary', 177, 522, 980, 'left', 'tracking', .62),
    tag: { ...role('spaceGrotesk', 800, 24, 'paper', 1510, 822, 220, 'center', 'dropIn', .7), upper: true },
    defaults: { title: 'SIGNAL / FORM /\nREFRACTION', subtitle: 'LIVE GENERATIVE VISUALS — NOTE SUMMATION ACTIVE', tag: 'ACT III' }, duration: 7,
    lesson: lesson('A visible modular grid makes a chaotic optical field feel intentional and designed.', commonHistory, 'Duplicate one grid rule and align a new metadata label to it; resist centering the composition.', 'grid-motion'), tags: ['full page', 'glass', 'grid', 'energetic', 'title card'],
  },
  {
    id: 'shader-liquid-monolith', councilStyle: 'GLASS', name: 'Liquid Monolith', group: 'FULL PAGE', family: 'Glass Harmonics', format: 'full-page',
    tagline: 'An extreme performance opener forged from molten glass and monumental type.',
    shaderFusion: { shaderId: 'molten-aria', opacity: .88, blend: 'normal', params: [.62, .68, .58, .68] },
    colors: { accent: '#FF5A18', ink: '#FFF4E8', paper: '#110201', secondary: '#FFD35A' }, origin: { x: 0, y: 0 },
    layers: [
      { ...plate('black-vignette', 0, 0, 1920, 1080, '#08000088', 0, .6), in: mo('fade', .55) },
      { ...plate('flare-bar', 0, 812, 1920, 8, 'accent', 0, 1, 'screen'), in: mo('wipeR', .72, .16, 'expo') },
      { ...plate('edition', 1420, 96, 340, 72, 'secondary', 0, .92), in: mo('slideU', .62, .34, 'back') },
      { id: 'seal', label: 'Performance seal', kind: 'ellipse', x: 138, y: 118, w: 140, h: 140, fill: '#00000000', stroke: 'accent', strokeWidth: 4, opacity: .9, in: mo('spin', .85, .2, 'back', 140), out: mo('fade', .4) },
    ],
    title: { ...role('archivoBlack', 900, 142, 'ink', 130, 326, 1560, 'left', 'dropIn', .24), lineHeight: .84, tracking: -.035 }, subtitle: { ...role('dmMono', 650, 24, 'secondary', 142, 748, 1020, 'left', 'tracking', .64), upper: true, tracking: .18 },
    tag: { ...role('bebas', 800, 34, 'paper', 1452, 116, 276, 'center', 'fadeUp', .48), upper: true },
    defaults: { title: 'MOLTEN\nARIA', subtitle: 'GLASS / HEAT / HARMONIC PRESSURE', tag: 'PERFORMANCE 07' }, duration: 7,
    lesson: lesson('Monumental condensed type can compete with intense imagery when it is anchored by a single hard horizontal event.', commonHistory, 'Shorten the title to two forceful words and time the flare bar to the first downbeat.', 'performance-openers'), tags: ['full page', 'molten glass', 'energetic', 'opener', 'title card'],
  },
];
