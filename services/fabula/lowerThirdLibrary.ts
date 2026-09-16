// lowerThirdLibrary — the broadcast / genre set of Fabula lower thirds.
//
// Each spec is a small, opinionated motion design: what enters first, what
// follows, how it leaves. The design-history set (Bauhaus, Swiss, Deco, …)
// lives in lowerThirdsByEra.ts and follows the Tela style eras so a creator
// can carry one design language from a document into a film.
import { mo, anim, type LowerThirdSpec, type LTLayer } from './lowerThirds';
import { sunburstPath, zigzagPath, chevronPath, polygonPath } from '../tela/ornaments';
import type { TelaChartStyle } from '../../types';

const L = (l: Omit<LTLayer, 'in'> & { in?: LTLayer['in'] }): LTLayer => ({ in: mo('fade', .4), ...l });

export const LOWER_THIRDS_BROADCAST: LowerThirdSpec[] = [
  {
    id: 'newsline', councilStyle: 'BROADCAST', name: 'Newsline', group: 'BROADCAST', tagline: 'A hard news plate: red kicker bar, white name plate, wiped rule — the grammar every viewer already knows.',
    colors: { accent: '#D40055', ink: '#0A1325', paper: '#FFFFFF', secondary: '#1B2B47' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'plate', label: 'Name plate', kind: 'rect', x: 0, y: -8, w: 760, h: 92, fill: 'paper', in: mo('wipeR', .5, .12, 'expo'), out: mo('wipeR', .35, 0, 'inOut') }),
      L({ id: 'sub', label: 'Subtitle bar', kind: 'rect', x: 0, y: 84, w: 640, h: 44, fill: 'secondary', in: mo('wipeR', .5, .25, 'expo'), out: mo('wipeR', .3, 0, 'inOut') }),
      L({ id: 'kicker', label: 'Kicker tab', kind: 'rect', x: 0, y: -50, w: 190, h: 42, fill: 'accent', in: mo('slideD', .45, 0, 'back', .9), out: mo('slideU', .3, .05, 'inOut') }),
      L({ id: 'edge', label: 'Left edge', kind: 'rect', x: 0, y: -8, w: 10, h: 136, fill: 'accent', in: mo('growY', .35, .05, 'expo'), out: mo('fade', .25) }),
    ],
    tag: { font: 'inter', weight: 800, size: 22, color: 'paper', tracking: .14, upper: true, x: 18, y: -41, w: 170, align: 'left', anim: anim('fadeIn', .25, .15, .2, 0) },
    title: { font: 'inter', weight: 800, size: 46, color: 'ink', x: 30, y: 10, w: 710, align: 'left', anim: anim('wordSlide', .55, .3, .3, .5), maxLines: 1 },
    subtitle: { font: 'inter', weight: 500, size: 24, color: 'paper', tracking: .02, x: 30, y: 92, w: 590, align: 'left', anim: anim('fadeIn', .4, .5, .25, .3), maxLines: 1 },
    defaults: { title: 'Amara Osei', subtitle: 'Senior Correspondent · Detroit', tag: 'Live' },
    lesson: { principle: 'Broadcast graphics enter in reading order — kicker, name, role — each arriving about a quarter second after the last, so the eye is led rather than ambushed.', history: 'The lower third took its shape in 1960s television news, when character generators (Chyron, 1970) replaced hand-lettered cards; the red-white-blue plate with a wiped rule became a global convention by the CNN era, and its timing — plate first, text a beat later — is still how audiences read authority.', tryThis: 'Change every layer’s IN to arrive at the same time. Notice how much louder and cheaper it feels; then stagger them again by 0.12 s.', interestTag: 'Broadcast design', related: ['motion graphics', 'television'] },
    tags: ['news', 'broadcast', 'interview'],
  },
  {
    id: 'documentary-id', councilStyle: 'EDITORIAL', name: 'Documentary ID', group: 'DOCUMENTARY', tagline: 'Quiet serif identification with a single hairline — the graphic that trusts the footage.',
    colors: { accent: '#B58B4B', ink: '#F3EBDD', paper: '#181A1D', secondary: '#8F8A80' }, origin: { x: 7, y: 82 }, duration: 6,
    layers: [
      L({ id: 'rule', label: 'Hairline', kind: 'rect', x: 0, y: 62, w: 520, h: 2, fill: 'accent', in: mo('growX', .9, .1, 'expo'), out: mo('growX', .5, 0, 'inOut') }),
      L({ id: 'dot', label: 'Point', kind: 'ellipse', x: -4, y: 58, w: 10, h: 10, fill: 'accent', in: mo('pop', .35, 0, 'back'), out: mo('fade', .3) }),
    ],
    title: { font: 'cormorant', weight: 600, size: 54, color: 'ink', x: 0, y: -4, w: 900, align: 'left', anim: anim('fadeUp', .9, .25, .5, .7), shadow: true, maxLines: 1 },
    subtitle: { font: 'inter', weight: 400, size: 22, color: 'secondary', tracking: .12, upper: true, x: 0, y: 76, w: 900, align: 'left', anim: anim('tracking', .8, .7, .4, .3), shadow: true, maxLines: 1 },
    defaults: { title: 'Dr. Lena Haugen', subtitle: 'Glaciologist · Svalbard Station' },
    lesson: { principle: 'In documentary the graphic must never compete with a face: one serif line, one hairline, and a slow fade-up that respects the subject’s pace.', history: 'Documentary identification grew out of the sober captioning of 1970s public television and the BBC’s house style; the modern minimal serif ID — a name on a hairline, no plate — spread through festival films of the 2000s and became the default for prestige non-fiction on streaming platforms.', tryThis: 'Lengthen the title fade to 1.4 s and watch the cut before it. Slow graphics make cuts feel deliberate.', interestTag: 'Documentary film', related: ['typography', 'editing'] },
    tags: ['documentary', 'interview', 'minimal', 'serif'],
  },
  {
    id: 'sports-velocity', councilStyle: 'SPORTS', name: 'Sports Velocity', group: 'SPORTS', tagline: 'Skewed plates, chevrons and a slam — speed you can read at a glance.',
    colors: { accent: '#D40055', ink: '#FFFFFF', paper: '#07090D', secondary: '#00DAF3' }, origin: { x: 5, y: 78 }, duration: 5,
    layers: [
      L({ id: 'back', label: 'Back plate', kind: 'path', path: 'M6 0 L100 0 L94 100 L0 100 Z', x: 0, y: 0, w: 820, h: 96, fill: 'paper', opacity: .92, in: mo('slideL', .38, 0, 'expo', 1.1), out: mo('slideL', .3, 0, 'inOut', 1.1) }),
      L({ id: 'stripe', label: 'Accent stripe', kind: 'path', path: 'M6 0 L100 0 L94 100 L0 100 Z', x: 0, y: 0, w: 30, h: 96, fill: 'accent', in: mo('slideL', .38, .05, 'expo', 4), out: mo('slideL', .3, 0, 'inOut', 4) }),
      L({ id: 'sub', label: 'Stat plate', kind: 'path', path: 'M6 0 L100 0 L94 100 L0 100 Z', x: 40, y: 100, w: 560, h: 44, fill: 'secondary', in: mo('slideL', .4, .18, 'expo', 1.4), out: mo('slideL', .28, 0, 'inOut', 1.4) }),
      L({ id: 'chev1', label: 'Chevron', kind: 'path', path: chevronPath(40), x: 850, y: 24, w: 40, h: 48, fill: 'accent', in: mo('slideL', .35, .3, 'back', 2), out: mo('fade', .2) }),
      L({ id: 'chev2', label: 'Chevron', kind: 'path', path: chevronPath(40), x: 895, y: 24, w: 40, h: 48, fill: 'accent', opacity: .6, in: mo('slideL', .35, .38, 'back', 2), out: mo('fade', .2) }),
      L({ id: 'chev3', label: 'Chevron', kind: 'path', path: chevronPath(40), x: 940, y: 24, w: 40, h: 48, fill: 'accent', opacity: .3, in: mo('slideL', .35, .46, 'back', 2), out: mo('fade', .2) }),
    ],
    title: { font: 'bebas', weight: 400, size: 74, color: 'ink', tracking: .02, x: 60, y: 8, w: 760, align: 'left', anim: anim('dropIn', .5, .22, .3, .4), maxLines: 1 },
    subtitle: { font: 'oswald', weight: 600, size: 26, color: 'paper', tracking: .08, upper: true, x: 74, y: 106, w: 520, align: 'left', anim: anim('fadeIn', .3, .45, .2, .2), maxLines: 1 },
    defaults: { title: 'Jordan Reyes', subtitle: '#9 · Forward · 24 pts' },
    lesson: { principle: 'Speed is drawn with a shared skew: every plate leans the same 6°, so the whole graphic reads as one object in motion rather than a pile of shapes.', history: 'Sports graphics inherited their slant from 1980s scoreboard typography and the italic wordmarks of ESPN and Sky Sports; the layered “slam” of skewed plates became standard in the HD era, when broadcasters could finally animate translucency and hard edges without ringing.', tryThis: 'Set every plate’s skew back to 0 by swapping the path for a plain rect. The graphic instantly becomes news, not sport.', interestTag: 'Sports broadcasting', related: ['motion graphics', 'typography'] },
    tags: ['sports', 'stats', 'bold'],
  },
  {
    id: 'warm-interview', councilStyle: 'GLASS', name: 'Warm Interview', group: 'INTERVIEW', tagline: 'A soft rounded plate in warm tones — for conversations, podcasts on video, and testimonials.',
    colors: { accent: '#FF8A00', ink: '#FFF3D8', paper: '#24120A', secondary: '#7A4A2A' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'plate', label: 'Rounded plate', kind: 'rect', rx: 26, x: 0, y: -14, w: 700, h: 132, fill: 'paper', opacity: .86, in: mo('pop', .55, 0, 'back'), out: mo('fade', .35) }),
      L({ id: 'ring', label: 'Portrait ring', kind: 'ellipse', x: 22, y: 8, w: 88, h: 88, fill: 'none', stroke: 'accent', strokeWidth: 6, in: mo('spin', .7, .1, 'expo', 120), out: mo('fade', .3) }),
      L({ id: 'core', label: 'Portrait core', kind: 'ellipse', x: 38, y: 24, w: 56, h: 56, fill: 'secondary', in: mo('pop', .4, .25, 'back'), out: mo('fade', .3) }),
    ],
    title: { font: 'fraunces', weight: 700, size: 44, color: 'ink', x: 134, y: 4, w: 540, align: 'left', anim: anim('fadeUp', .6, .3, .3, .6), maxLines: 1 },
    subtitle: { font: 'workSans', weight: 500, size: 24, color: 'accent', x: 134, y: 62, w: 540, align: 'left', anim: anim('fadeIn', .5, .5, .3, .3), maxLines: 1 },
    defaults: { title: 'Priya Raman', subtitle: 'Host, The Long Table' },
    lesson: { principle: 'Warmth is a set of decisions: rounded corners, a serif with soft terminals, an orange that sits near skin tones, and a pop-in that overshoots slightly like a smile.', history: 'The friendly interview plate comes from daytime and lifestyle television of the 1990s, was flattened and rounded by the podcast-video boom after 2015, and now signals “conversation, not news” across YouTube and streaming talk formats.', tryThis: 'Change the ease of the plate from back to expo. It arrives the same distance in the same time, but stops smiling.', interestTag: 'Interview & podcast production', related: ['podcasting', 'colour'] },
    tags: ['interview', 'podcast', 'warm'],
  },
  {
    id: 'gallery-caption', councilStyle: 'CLASSICAL', name: 'Gallery Caption', group: 'CULTURE', tagline: 'A museum wall label — title, artist, medium — set in the corner where a placard would hang.',
    colors: { accent: '#6B0099', ink: '#1B1523', paper: '#F6F1E8', secondary: '#8B8391' }, origin: { x: 6, y: 74 }, duration: 7,
    layers: [
      L({ id: 'card', label: 'Wall label', kind: 'rect', x: 0, y: 0, w: 560, h: 190, fill: 'paper', in: mo('slideU', .6, 0, 'expo', .25), out: mo('fade', .4) }),
      L({ id: 'tab', label: 'Colour tab', kind: 'rect', x: 0, y: 0, w: 560, h: 8, fill: 'accent', in: mo('growX', .5, .2, 'expo'), out: mo('fade', .3) }),
    ],
    tag: { font: 'inter', weight: 700, size: 16, color: 'secondary', tracking: .18, upper: true, x: 28, y: 28, w: 500, align: 'left', anim: anim('fadeIn', .3, .35, .2, 0) },
    title: { font: 'playfair', weight: 700, size: 40, color: 'ink', italic: true, x: 28, y: 54, w: 504, align: 'left', anim: anim('fadeIn', .6, .45, .3, .4), maxLines: 2 },
    subtitle: { font: 'inter', weight: 400, size: 19, color: 'ink', x: 28, y: 146, w: 504, align: 'left', anim: anim('fadeIn', .5, .7, .3, .2), maxLines: 1 },
    defaults: { title: 'Under the Wave off Kanagawa', subtitle: 'Katsushika Hokusai · woodblock print · c. 1831', tag: 'On view' },
    lesson: { principle: 'A caption is a label, not a headline: the tag sets context, the italic title carries the work, and the small roman line does the housekeeping.', history: 'Museum wall labels standardised in the mid-20th century — Museum of Modern Art’s 1930s–50s installations fixed the order title / artist / date / medium — and arts programming from the BBC’s Civilisation (1969) onward borrowed that order for on-screen captions.', tryThis: 'Swap the title into roman and the subtitle into italic. The hierarchy inverts — now the medium is the star.', interestTag: 'Art history', related: ['museums', 'typography'] },
    tags: ['culture', 'museum', 'caption', 'serif'],
  },
  {
    id: 'creator-interview', councilStyle: 'NEON', name: 'Creator Handle', group: 'CREATOR', tagline: 'Name, handle and a live pill — for streams, collabs and vlogs.',
    colors: { accent: '#D40055', ink: '#F8F2FF', paper: '#12091B', secondary: '#7A55FF' }, origin: { x: 6, y: 80 }, duration: 5,
    layers: [
      L({ id: 'plate', label: 'Plate', kind: 'rect', rx: 18, x: 0, y: 0, w: 640, h: 108, fill: 'paper', opacity: .8, in: mo('slideR', .45, 0, 'expo', .3), out: mo('slideL', .3, 0, 'inOut', .3) }),
      L({ id: 'glow', label: 'Gradient edge', kind: 'rect', rx: 18, x: 0, y: 0, w: 14, h: 108, fill: 'accent', gradient: { angle: 90, from: 'accent', to: 'secondary' }, in: mo('growY', .4, .1, 'expo'), out: mo('fade', .25) }),
      L({ id: 'pill', label: 'Live pill', kind: 'rect', rx: 16, x: 26, y: -40, w: 110, h: 32, fill: 'accent', in: mo('pop', .35, .3, 'back'), out: mo('fade', .25) }),
      L({ id: 'dot', label: 'Live dot', kind: 'ellipse', x: 40, y: -30, w: 12, h: 12, fill: 'ink', in: mo('pop', .3, .4, 'back'), out: mo('fade', .2) }),
    ],
    tag: { font: 'inter', weight: 800, size: 16, color: 'ink', tracking: .16, upper: true, x: 60, y: -33, w: 70, align: 'left', anim: anim('fadeIn', .2, .45, .2, 0) },
    title: { font: 'sora', weight: 700, size: 40, color: 'ink', x: 30, y: 14, w: 590, align: 'left', anim: anim('blurIn', .5, .2, .3, .5), maxLines: 1 },
    subtitle: { font: 'jetbrains', weight: 500, size: 22, color: 'secondary', x: 30, y: 64, w: 590, align: 'left', anim: anim('typeOn', .6, .45, .2, 1), maxLines: 1 },
    defaults: { title: 'Kofi Mensah', subtitle: '@kofi.makes · plajah.com/kofi', tag: 'Live' },
    lesson: { principle: 'Creator graphics borrow interface language — pills, rounded cards, a monospace handle — because the audience reads them as part of the app they are already in.', history: 'The handle lower third emerged with Twitch and YouTube collaborations around 2012–2016, when creators needed a way to credit guests that looked native to the platform rather than to television; the type-on handle nods to the terminal aesthetic of early streaming overlays.', tryThis: 'Change the handle animator from Type On to Fade In. It becomes calmer and less “live”.', interestTag: 'Content creation', related: ['streaming', 'interface design'] },
    tags: ['creator', 'stream', 'handle'],
  },
  {
    id: 'signal-bar', councilStyle: 'PLAJAH', name: 'Signal Bar', group: 'BROADCAST', tagline: 'A gradient signal sweeps in under the name — Plajah’s house lower third.',
    colors: { accent: '#6B0099', ink: '#FFFFFF', paper: '#08050D', secondary: '#00DAF3' }, origin: { x: 6, y: 80 }, duration: 6,
    layers: [
      L({ id: 'bar', label: 'Signal bar', kind: 'rect', rx: 4, x: 0, y: 66, w: 720, h: 8, fill: 'accent', gradient: { angle: 0, from: 'accent', to: 'secondary' }, in: mo('growX', .7, 0, 'expo'), out: mo('growX', .4, 0, 'inOut') }),
      L({ id: 'plate', label: 'Dark plate', kind: 'rect', rx: 6, x: 0, y: -10, w: 720, h: 74, fill: 'paper', opacity: .55, in: mo('wipeR', .5, .15, 'expo'), out: mo('fade', .3) }),
      L({ id: 'tick', label: 'Tick', kind: 'rect', x: 0, y: 84, w: 90, h: 4, fill: 'secondary', in: mo('growX', .4, .5, 'expo'), out: mo('fade', .2) }),
    ],
    title: { font: 'outfit', weight: 800, size: 46, color: 'ink', x: 22, y: 0, w: 680, align: 'left', anim: anim('fadeUp', .6, .25, .3, .55), maxLines: 1 },
    subtitle: { font: 'inter', weight: 500, size: 22, color: 'secondary', tracking: .1, upper: true, x: 22, y: 96, w: 680, align: 'left', anim: anim('tracking', .6, .6, .3, .3), maxLines: 1 },
    defaults: { title: 'Kenne Moody', subtitle: 'Founder · Plajah' },
    lesson: { principle: 'A brand lower third should be recognisable with the text removed: here the gradient bar alone says Plajah.', history: 'House graphics packages date to the network identity work of the 1960s — Saul Bass for AT&T, the BBC’s in-house presentation department — where a single animated element (a globe, a bar, a swoosh) carried the brand across every programme.', tryThis: 'Recolour accent and secondary to your own two brand colours. Nothing else needs to change — that is what a system is.', interestTag: 'Brand identity', related: ['motion graphics', 'branding'] },
    tags: ['brand', 'plajah', 'gradient'],
  },
  {
    id: 'deco-marquee', councilStyle: 'BAROQUE', name: 'Deco Marquee', group: 'EVENT', tagline: 'Gold sunburst and a stepped plate — a 1920s premiere announcing a name.',
    colors: { accent: '#D4AF37', ink: '#F4E8D0', paper: '#101820', secondary: '#8C2143' }, origin: { x: 50, y: 82 }, duration: 6,
    layers: [
      L({ id: 'burst', label: 'Sunburst', kind: 'path', path: sunburstPath(13, 170, .5, 50, 100, 100), x: -420, y: -150, w: 840, h: 150, fill: 'accent', opacity: .28, in: mo('growY', .9, 0, 'expo'), out: mo('fade', .4) }),
      L({ id: 'plate', label: 'Stepped plate', kind: 'path', path: 'M0 30 L6 30 L6 15 L12 15 L12 0 L88 0 L88 15 L94 15 L94 30 L100 30 L100 100 L0 100 Z', x: -380, y: -18, w: 760, h: 118, fill: 'paper', in: mo('growX', .6, .15, 'expo'), out: mo('growX', .4, 0, 'inOut') }),
      L({ id: 'rule-top', label: 'Gold rule', kind: 'rect', x: -300, y: 6, w: 600, h: 3, fill: 'accent', in: mo('growX', .5, .45, 'expo'), out: mo('fade', .3) }),
      L({ id: 'zig', label: 'Zigzag frieze', kind: 'path', path: zigzagPath(16, 60), x: -300, y: 86, w: 600, h: 8, fill: 'accent', in: mo('wipeR', .6, .55, 'expo'), out: mo('fade', .3) }),
      L({ id: 'diamond', label: 'Diamond', kind: 'path', path: polygonPath(4, -90), x: -8, y: -28, w: 16, h: 16, fill: 'accent', in: mo('pop', .3, .8, 'back'), out: mo('fade', .2) }),
    ],
    title: { font: 'limelight', weight: 400, size: 52, color: 'ink', tracking: .1, upper: true, x: -360, y: 14, w: 720, align: 'center', anim: anim('tracking', .8, .5, .4, .5), maxLines: 1 },
    subtitle: { font: 'josefin', weight: 400, size: 20, color: 'accent', tracking: .28, upper: true, x: -360, y: 100, w: 720, align: 'center', anim: anim('fadeIn', .5, .95, .3, .2), maxLines: 1 },
    defaults: { title: 'Midnight Premiere', subtitle: 'The Grand · Saturday · Doors at Eight' },
    lesson: { principle: 'Symmetry is a promise of occasion: everything here is centred and mirrored, and the sunburst grows from the same axis the type is balanced on.', history: 'Art Deco cinema marquees of the 1920s–30s — the Paramount, the Fox theatres — used stepped forms, sunbursts and inline lettering to sell glamour and speed; the style was revived by the 2013 Great Gatsby graphics and remains the visual shorthand for “premiere”.', tryThis: 'Move the origin to x = 8 % and set both text roles to left-aligned. Deco survives being asymmetric only if the sunburst moves with it.', interestTag: 'Art Deco', related: ['cinema', 'typography'] },
    tags: ['event', 'premiere', 'deco', 'centered'],
  },
];
