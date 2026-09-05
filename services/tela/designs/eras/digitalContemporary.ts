// digitalContemporary — hand-designed style-era documents (see docs/tela/TEMPLATE_DESIGN_BRIEF.md).
//
// Eras: vaporwave · y2k · solarpunk · afrofuturist. These are the eras where the
// engine's finish controls (gradients, translucency, blend modes, blur) carry the
// idea, so every page here leans on them deliberately rather than decoratively.
import type { TelaGradientPaint, TelaVectorObject } from '../../../../types';
import type { DesignLesson, EraDesigner } from '../types';
import type { TelaStyleEra } from '../../../telaStyleEraLibrary';
import { rect, ellipse, circle, hr, vr, path, text, below, imageSlot, columns, frame, folio, mix, alpha } from '../../templateKit';
import * as orn from '../../ornaments';

// ── Gradient helpers ─────────────────────────────────────────────────────────
type Stop = [offset: number, color: string, opacity?: number];
const stops = (s: Stop[]) => s.map(([offset, color, opacity]) => (opacity === undefined ? { offset, color } : { offset, color, opacity }));
const lin = (angle: number, ...s: Stop[]): TelaGradientPaint => ({ kind: 'LINEAR', angle, stops: stops(s) });
const rad = (...s: Stop[]): TelaGradientPaint => ({ kind: 'RADIAL', stops: stops(s) });

// ═════════════════════════════════════════════════════════════════════════════
// VAPORWAVE — the synthetic horizon
// ═════════════════════════════════════════════════════════════════════════════
const vaporwave: EraDesigner = ({ W, H, paper, ink: pink, accent: cyan, secondary: lavender, seed }) => {
  const white = '#FFFFFF';
  const skyTop = mix(paper, -.55), skyLow = mix(paper, .18);
  const horizon = 600;
  const fr = frame(W, H, 64);

  /** Title duplicated in cyan and pink at ±dx, white on top — the chromatic-aberration mark of the era. */
  const aberrated = (x: number, y: number, w: number, value: string, size: number, dx: number, label: string): TelaVectorObject[] => {
    const base = { size, font: 'audiowide' as const, color: white, align: 'center' as const, tracking: .08, transform: 'uppercase' as const, leading: 1.05 };
    return [
      text(x - dx, y, w, value, { ...base, color: cyan, blend: 'screen', opacity: .9, label: `${label} · cyan pass`, role: 'ORNAMENT' }),
      text(x + dx, y, w, value, { ...base, color: pink, blend: 'screen', opacity: .9, label: `${label} · magenta pass`, role: 'ORNAMENT' }),
      text(x, y, w, value, { ...base, label, role: 'HEADLINE' }),
    ];
  };

  // ── Page 1: full scene ─────────────────────────────────────────────────────
  const p1: TelaVectorObject[] = [
    rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Sky ground', gradient: lin(90, [0, skyTop], [.56, skyLow], [1, skyLow]) }),
    ...orn.dotField(0, 40, W, 330, 64, lavender, { rMin: .7, rMax: 1.5, opacity: .8, stagger: true, label: 'Star field' }),
    ...orn.dotField(30, 76, W - 60, 280, 96, cyan, { rMin: .9, rMax: 1.6, opacity: .7, label: 'Star field · bright' }),
  ];
  // Sun with scan-line cuts
  const sunCx = 408, sunCy = 460, sunR = 200;
  p1.push(circle(sunCx, sunCy, sunR, pink, { gradient: lin(90, [0, pink], [.55, '#FFA07A'], [1, '#FFD39B']), label: 'Gradient sun', shadow: { x: 0, y: 0, blur: 28, color: alpha(pink, .55) } }));
  const cuts: Array<[number, number]> = [[486, 3], [506, 5], [528, 7], [552, 10], [576, 14]];
  for (const [y, t] of cuts) p1.push(rect(sunCx - sunR, y, sunR * 2, t, alpha(paper, .88), { label: 'Sun cut line' }));
  // Floor + grid
  p1.push(rect(0, horizon, W, H - horizon, paper, { gradient: lin(90, [0, mix(paper, .06)], [1, mix(paper, -.6)]), label: 'Floor' }));
  p1.push(...orn.perspectiveGrid(-220, horizon, W + 440, H - horizon, cyan, { columns: 12, rows: 7, width: 1.2, opacity: .75 }));
  p1.push(rect(0, horizon - 5, W, 10, pink, { blur: 7, opacity: .85, label: 'Horizon glow' }));
  p1.push(hr(0, horizon, W, mix(pink, .35), 1.5, { label: 'Horizon line' }));
  // Bust standing on the horizon
  p1.push(...imageSlot(566, 200, 190, 400, { tone: 'dark', shade: 'rgba(216,183,255,.14)', frame: alpha(cyan, .6), frameWidth: 1, caption: 'Bust · marble or render', label: 'Bust image slot' }));
  // Glitch slices
  p1.push(rect(0, 176, 240, 3, cyan, { opacity: .7, blend: 'screen', label: 'Glitch slice' }));
  p1.push(rect(600, 214, 216, 2, pink, { opacity: .7, blend: 'screen', label: 'Glitch slice' }));
  p1.push(rect(0, 826, 180, 2, cyan, { opacity: .5, blend: 'screen', label: 'Glitch slice' }));
  // Metadata
  p1.push(text(fr.x, fr.y, 320, 'Vol. 01 · Side A', { size: 10, font: 'orbitron', weight: 500, color: cyan, tracking: .3, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
  p1.push(text(fr.right - 320, fr.y, 320, 'Eternal Lobby Records', { size: 10, font: 'orbitron', weight: 500, color: pink, tracking: .3, transform: 'uppercase', align: 'right', wrap: false, label: 'Imprint', role: 'LABEL' }));
  // Title on the floor
  const title = aberrated(28, horizon + 28, W - 56, 'Eternal Lobby', 64, 3, 'Masthead');
  p1.push(...title);
  const sub = text(58, below(title[2], 14), W - 116, 'ＯＰＥＮ　２４　ＨＯＵＲＳ', { size: 16, font: 'notoSerifJp', weight: 500, color: lavender, align: 'center', tracking: .28, label: 'Fullwidth subtitle', role: 'DECK' });
  p1.push(sub);
  const deck = text(148, below(sub, 22), W - 296, 'A night drive through the shopping centre of memory — slowed to half speed, pitched down a key, and still open.', { size: 14, font: 'notoSerifJp', color: mix(lavender, .25), align: 'center', leading: 1.5, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  p1.push(hr(W / 2 - 60, below(deck, 22), 120, pink, 1, { opacity: .8, label: 'Deck rule' }));
  p1.push(...folio(fr, 'Eternal Lobby · Issue 01', 'Side A · 01', cyan, { font: 'orbitron', size: 9, tracking: .25 }));

  // ── Page 2: interior with grid-horizon foot ────────────────────────────────
  const foot = 884;
  const p2: TelaVectorObject[] = [
    rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Ground', gradient: lin(90, [0, mix(paper, -.35)], [1, paper]) }),
    ...folio(fr, 'Eternal Lobby', '02 // After Hours', cyan, { font: 'orbitron', size: 9, y: fr.y, tracking: .25 }),
    hr(fr.x, fr.y + 18, fr.w, pink, 1, { opacity: .6, label: 'Head rule' }),
  ];
  const head = aberrated(fr.x, fr.y + 42, fr.w, 'After Hours', 40, 2, 'Section head');
  p2.push(...head);
  const sub2 = text(fr.x, below(head[2], 10), fr.w, 'ＡＦＴＥＲ　ＨＯＵＲＳ', { size: 13, font: 'notoSerifJp', weight: 500, color: lavender, align: 'center', tracking: .3, label: 'Fullwidth subtitle', role: 'DECK' });
  p2.push(sub2);
  const rule2 = hr(fr.x, below(sub2, 18), fr.w, alpha(lavender, .35), 1, { label: 'Deck rule' });
  p2.push(rule2);

  const cols = columns(fr.x, fr.w, 2, 28);
  const bodyInk = mix(lavender, .55);
  const body = { size: 11, font: 'notoSerifJp' as const, color: bodyInk, leading: 1.55 };
  const top = rule2.y + 22;
  // Column 1
  const k1 = text(cols[0].x, top, cols[0].w, '01 · The Escalator', { size: 9, font: 'orbitron', weight: 600, color: pink, tracking: .28, transform: 'uppercase', wrap: false, label: 'Column 1 subhead', role: 'LABEL' });
  p2.push(k1);
  const b1 = text(cols[0].x, below(k1, 12), cols[0].w,
    'The escalator still runs. Nobody has pressed the button in years, but the steps keep folding into the floor with the patience of something that was never told the store had closed. Overhead, a speaker plays a saxophone line at the wrong speed, and the wrong speed is the right one.\n\nVaporwave began as a joke about exactly this kind of room: the atrium, the food court, the lobby of a hotel that only existed in a brochure. Producers took the background music of the 1980s and 1990s — the smooth jazz, the corporate jingles, the hold music — and slowed it until the optimism inside it started to sound like grief.\n\nThe trick is that the sadness was always there. Slow anything down far enough and you hear what it was trying not to say.',
    { ...body, label: 'Column 1 body', role: 'BODY' });
  p2.push(b1);
  const q = text(cols[0].x, below(b1, 20), cols[0].w, '“Nothing here is new. That is the point.”', { size: 15, font: 'audiowide', color: cyan, leading: 1.35, label: 'Pull quote', role: 'DECK' });
  p2.push(hr(cols[0].x, q.y - 10, 48, pink, 1.5, { label: 'Quote rule' }));
  p2.push(q);
  const b1b = text(cols[0].x, below(q, 18), cols[0].w,
    'The palette followed the sound. Sunset gradients from screensavers, the teal of an early operating system, the pink of a neon sign reflected in a wet car park. A marble bust, because the past is a product too.\n\nNone of it was meant to be beautiful, and all of it is. That is the genre’s only real trick: take the most disposable images a decade produced and hold them still long enough that they start to look like ruins.\n\nOn this page the type does the same work. The heading is duplicated in cyan and magenta a few pixels apart, the way a worn VHS tape fails to line up its colour channels, and the body is set in a serif because the bust in the picture would have expected one.',
    { ...body, label: 'Column 1 body · continued', role: 'BODY' });
  p2.push(b1b);
  // Column 2
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 200, { tone: 'dark', shade: 'rgba(97,220,235,.10)', frame: alpha(pink, .5), frameWidth: 1, caption: 'Night-drive still', label: 'Interior image slot' }));
  const cap = text(cols[1].x, top + 208, cols[1].w, 'Still from a night drive, colour-graded to the year the mall opened.', { size: 9, font: 'orbitron', color: lavender, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(cap);
  const k2 = text(cols[1].x, below(cap, 22), cols[1].w, '02 · Tracklist', { size: 9, font: 'orbitron', weight: 600, color: pink, tracking: .28, transform: 'uppercase', wrap: false, label: 'Column 2 subhead', role: 'LABEL' });
  p2.push(k2);
  const b2 = text(cols[1].x, below(k2, 12), cols[1].w,
    'Every side of the record is the same walk through the same building, taken slower each time. The listener is not meant to arrive anywhere. The listener is meant to notice the carpet.',
    { ...body, label: 'Column 2 body', role: 'BODY' });
  p2.push(b2);
  const tracks = text(cols[1].x, below(b2, 16), cols[1].w,
    'A1 · Escalator (slowed) · 4:12\nA2 · Food court at 2 am · 6:40\nA3 · Fountain, no coins · 3:58\nB1 · Car park, level 3 · 5:21\nB2 · Eternal lobby · 9:09',
    { size: 9, font: 'orbitron', weight: 500, color: cyan, leading: 1.9, tracking: .08, transform: 'uppercase', wrap: false, label: 'Tracklist', role: 'CAPTION' });
  p2.push(hr(cols[1].x, tracks.y - 8, cols[1].w, alpha(cyan, .4), 1, { label: 'Tracklist rule' }));
  p2.push(tracks);
  p2.push(hr(cols[1].x, below(tracks, 8), cols[1].w, alpha(cyan, .4), 1, { label: 'Tracklist rule' }));
  // Grid-horizon foot
  p2.push(rect(0, foot, W, H - foot, paper, { gradient: lin(90, [0, mix(paper, .08)], [1, mix(paper, -.6)]), label: 'Floor' }));
  p2.push(...orn.perspectiveGrid(-160, foot, W + 320, H - foot, cyan, { columns: 10, rows: 4, width: 1, opacity: .55 }));
  p2.push(rect(0, foot - 4, W, 8, pink, { blur: 6, opacity: .8, label: 'Horizon glow' }));
  p2.push(hr(0, foot, W, mix(pink, .35), 1.2, { label: 'Horizon line' }));
  p2.push(...folio(fr, 'Side A · Issue 01', '02', cyan, { font: 'orbitron', size: 9, y: foot - 26, tracking: .25 }));
  void seed;
  return [p1, p2];
};

// ═════════════════════════════════════════════════════════════════════════════
// Y2K — chrome, bubbles, translucency
// ═════════════════════════════════════════════════════════════════════════════
const y2k: EraDesigner = ({ W, H, paper, ink: blue, accent: mint, secondary: purple, seed }) => {
  const white = '#FFFFFF', navy = '#1D2557';
  const fr = frame(W, H, 64);
  const chrome = lin(90, [0, '#FFFFFF'], [.42, '#C9D4E4'], [.5, '#7E8EA8'], [.56, '#E6EDF7'], [1, '#9DAEC7']);
  const glass = (x: number, y: number, w: number, h: number, a: number, rx: number, label: string) =>
    rect(x, y, w, h, `rgba(255,255,255,${a})`, { rx, stroke: 'rgba(255,255,255,.72)', strokeWidth: 1.5, shadow: { x: 0, y: 16, blur: 28, color: alpha(blue, .16) }, label });
  const bubble = (x: number, y: number, s: number): TelaVectorObject[] => [
    ellipse(x, y, s, s, white, { gradient: rad([0, white, .04], [.72, white, .12], [1, white, .6]), stroke: 'rgba(255,255,255,.75)', strokeWidth: 1.2, label: 'Bubble' }),
    ellipse(x + s * .2, y + s * .13, s * .26, s * .15, white, { opacity: .85, rotation: -28, label: 'Bubble highlight' }),
  ];
  const sparkle = (x: number, y: number, s: number, color = white) => path(x, y, s, s, orn.starPath(4, .18), color, { opacity: .95, label: 'Sparkle' });
  const rng = orn.rng(seed);

  // ── Page 1 ────────────────────────────────────────────────────────────────
  const p1: TelaVectorObject[] = [
    rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Sky ground', gradient: lin(112, [0, '#F6FAFF'], [.5, paper], [1, mix(paper, -.16)]) }),
    ellipse(380, -160, 640, 640, mint, { gradient: rad([0, mint, .9], [.6, mint, .35], [1, mint, 0]), label: 'Mint orb' }),
    ellipse(-260, 620, 620, 620, purple, { gradient: rad([0, purple, .45], [.6, purple, .12], [1, purple, 0]), label: 'Violet orb' }),
  ];
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < 9; i++) spots.push([rng() * (W - 140), 80 + rng() * (H - 260), 34 + rng() * 120]);
  for (const [x, y, s] of spots) p1.push(...bubble(x, y, s));
  // Chrome bar
  p1.push(rect(0, 0, W, 54, '#C9D4E4', { gradient: chrome, label: 'Chrome bar' }));
  p1.push(hr(0, 54, W, alpha(blue, .35), 1, { label: 'Chrome bar edge' }));
  p1.push(text(fr.x, 21, 340, 'Plajah // Y2K edition', { size: 9, font: 'chakra', weight: 600, color: navy, tracking: .26, transform: 'uppercase', wrap: false, label: 'Bar label', role: 'LABEL' }));
  p1.push(text(fr.right - 340, 21, 340, 'Build 2000.01.01 // v2.0', { size: 9, font: 'chakra', weight: 600, color: navy, tracking: .26, transform: 'uppercase', align: 'right', wrap: false, label: 'Bar version', role: 'LABEL' }));
  // Pill card with title
  p1.push(glass(fr.x, 340, fr.w, 332, .16, 48, 'Title pill card'));
  const kick = text(fr.x + 40, 384, fr.w - 80, 'New millennium · Issue 2000', { size: 10, font: 'chakra', weight: 600, color: purple, tracking: .28, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' });
  p1.push(kick);
  const title = text(fr.x + 40, below(kick, 14), fr.w - 80, 'Tomorrow\nwas shiny', { size: 60, font: 'tomorrow', weight: 800, color: blue, transform: 'uppercase', leading: 1.02, tracking: .01, gradient: lin(90, [0, blue], [1, purple]), label: 'Masthead', role: 'HEADLINE' });
  p1.push(title);
  const deck = text(fr.x + 40, below(title, 18), 520, 'Chrome, translucency and the optimism of a version number that never shipped.', { size: 15, font: 'exo2', weight: 500, color: navy, leading: 1.4, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  // Sparkles
  p1.push(sparkle(690, 296, 44), sparkle(120, 300, 22), sparkle(560, 700, 30, mint), sparkle(750, 760, 18));
  // Image window + side note
  p1.push(...imageSlot(fr.x, 720, 300, 190, { tone: 'light', rx: 28, frame: 'rgba(255,255,255,.8)', frameWidth: 1.5, caption: 'Product still', label: 'Product image slot' }));
  p1.push(text(400, 728, 352, 'Every surface was a lens. Plastics went translucent so you could see the circuit boards; type went round so it looked like it could bounce.', { size: 12, font: 'exo2', color: navy, leading: 1.5, label: 'Side note', role: 'BODY' }));
  // Status pills
  const pills = ['Signal · 100%', 'Memory · 128 MB', 'Status · online'];
  pills.forEach((t, i) => {
    const x = fr.x + i * 236, y = 940;
    p1.push(rect(x, y, 216, 30, 'rgba(255,255,255,.34)', { rx: 15, stroke: 'rgba(255,255,255,.8)', strokeWidth: 1, label: `Status pill ${i + 1}` }));
    p1.push(text(x, y + 10, 216, t, { size: 9, font: 'chakra', weight: 600, color: blue, tracking: .22, transform: 'uppercase', align: 'center', wrap: false, label: `Status label ${i + 1}`, role: 'LABEL' }));
  });
  p1.push(...folio(fr, 'Tomorrow was shiny', '01', purple, { font: 'chakra', size: 9, y: 1004, tracking: .24 }));

  // ── Page 2 ────────────────────────────────────────────────────────────────
  const p2: TelaVectorObject[] = [
    rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Sky ground', gradient: lin(64, [0, '#F6FAFF'], [.55, paper], [1, mix(paper, -.14)]) }),
    ellipse(480, 560, 520, 520, mint, { gradient: rad([0, mint, .8], [.65, mint, .25], [1, mint, 0]), label: 'Mint orb' }),
    ellipse(-200, -140, 500, 500, purple, { gradient: rad([0, purple, .4], [.65, purple, .1], [1, purple, 0]), label: 'Violet orb' }),
    ...bubble(650, 120, 110), ...bubble(40, 860, 70), ...bubble(700, 900, 46),
  ];
  // Chrome header rail
  p2.push(rect(fr.x, 56, fr.w, 40, '#C9D4E4', { rx: 20, gradient: chrome, shadow: { x: 0, y: 6, blur: 12, color: alpha(blue, .18) }, label: 'Chrome header rail' }));
  p2.push(text(fr.x + 24, 71, 320, 'Tomorrow was shiny · 02', { size: 9, font: 'chakra', weight: 600, color: navy, tracking: .24, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(fr.right - 344, 71, 320, 'Feature // System requirements', { size: 9, font: 'chakra', weight: 600, color: navy, tracking: .24, transform: 'uppercase', align: 'right', wrap: false, label: 'Running head · section', role: 'FOLIO' }));
  // Translucent panel
  const panel = { x: fr.x, y: 112, w: fr.w, h: 866 };
  p2.push(glass(panel.x, panel.y, panel.w, panel.h, .45, 32, 'Text panel'));
  const px = panel.x + 36, pw = panel.w - 72;
  const head = text(px, panel.y + 36, 560, 'System requirements for optimism', { size: 30, font: 'tomorrow', weight: 700, color: blue, leading: 1.08, label: 'Section head', role: 'HEADLINE' });
  p2.push(head);
  const deck2 = text(px, below(head, 12), 520, 'What the year 2000 promised, what it delivered, and why the bubbles still look like the future.', { size: 13, font: 'exo2', weight: 500, color: purple, leading: 1.4, label: 'Deck', role: 'DECK' });
  p2.push(deck2);
  const rule = hr(px, below(deck2, 18), pw, alpha(blue, .35), 1, { label: 'Deck rule' });
  p2.push(rule);
  const cols = columns(px, pw, 2, 28);
  const body = { size: 11.5, font: 'exo2' as const, color: navy, leading: 1.5 };
  const top = rule.y + 22;
  // Column 1
  const k1 = text(cols[0].x, top, cols[0].w, '01 // Chrome', { size: 10, font: 'chakra', weight: 600, color: purple, tracking: .26, transform: 'uppercase', wrap: false, label: 'Column 1 subhead', role: 'LABEL' });
  p2.push(k1);
  const b1 = text(cols[0].x, below(k1, 10), cols[0].w,
    'For a few years around the turn of the millennium, everything wanted to be made of light. Computers came in translucent candy colours so you could see the parts inside. Interfaces grew drop shadows and gel buttons that looked wet. Even the type went soft: rounded, wide, set in silver, as if it had been poured rather than printed.\n\nThe mood was not irony. People genuinely expected the new century to be faster, cleaner and kinder, and they dressed their objects accordingly. A phone was a jewel. A browser was a window onto a very blue sky.\n\nLooking back, the shine reads as innocence. On a page like this one it reads as a set of decisions: light grounds, glass surfaces, one saturated accent and type with the corners sanded off.',
    { ...body, label: 'Column 1 body', role: 'BODY' });
  p2.push(b1);
  const pillY = below(b1, 18);
  const quote = text(cols[0].x + 18, pillY + 16, cols[0].w - 36, 'Nothing on this page should look heavy.', { size: 13, font: 'tomorrow', weight: 700, color: blue, leading: 1.3, label: 'Pull quote', role: 'DECK' });
  p2.push(rect(cols[0].x, pillY, cols[0].w, quote.h + 32, mint, { rx: 22, opacity: .75, label: 'Pull-quote pill' }));
  p2.push(quote);
  const b1b = text(cols[0].x, pillY + quote.h + 32 + 18, cols[0].w,
    'Use the translucency for structure, not decoration. A panel at forty per cent white is a column; a pill at twelve per cent is a caption. The bubbles are the only thing allowed to float.',
    { ...body, label: 'Column 1 body · continued', role: 'BODY' });
  p2.push(b1b);
  // Column 2
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 190, { tone: 'light', rx: 20, frame: 'rgba(255,255,255,.9)', frameWidth: 1.5, caption: 'Frosted plastic', label: 'Interior image slot' }));
  const cap = text(cols[1].x, top + 198, cols[1].w, 'Frosted plastic and a chrome bezel — the material palette of 1999.', { size: 9, font: 'exo2', italic: true, color: navy, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(cap);
  const k2 = text(cols[1].x, below(cap, 20), cols[1].w, '02 // Translucency', { size: 10, font: 'chakra', weight: 600, color: purple, tracking: .26, transform: 'uppercase', wrap: false, label: 'Column 2 subhead', role: 'LABEL' });
  p2.push(k2);
  const b2 = text(cols[1].x, below(k2, 10), cols[1].w,
    'The glass panel is doing the same job a white text box did in 1985: it separates the reading from the decoration. The difference is that it admits the background exists. You can see the sky through the paragraph, and the paragraph does not mind.',
    { ...body, label: 'Column 2 body', role: 'BODY' });
  p2.push(b2);
  const specs = ['Processor · 500 MHz', 'Memory · 128 MB', 'Display · 1024 × 768 · 24-bit', 'Connection · 56K modem'];
  let sy = below(b2, 22);
  p2.push(hr(cols[1].x, sy, cols[1].w, alpha(blue, .45), 1, { label: 'Spec rule' }));
  for (const s of specs) {
    const row = text(cols[1].x, sy + 9, cols[1].w, s, { size: 9.5, font: 'chakra', weight: 600, color: blue, tracking: .16, transform: 'uppercase', wrap: false, label: 'Spec row', role: 'CAPTION' });
    p2.push(row);
    sy = below(row, 9);
    p2.push(hr(cols[1].x, sy, cols[1].w, alpha(blue, .45), 1, { label: 'Spec rule' }));
  }
  p2.push(text(cols[1].x, sy + 20, cols[1].w,
    'Those were the numbers on the box, and the box was the point. Specifications were printed large, in silver, because the machine was a promise about speed before it was a tool. Set your own data the same way: small caps, hairlines, one figure per line, and let the reader feel the future counting up.',
    { ...body, label: 'Column 2 body · continued', role: 'BODY' }));
  p2.push(sparkle(720, 130, 26), sparkle(96, 990, 18, mint));
  p2.push(...folio(fr, 'Tomorrow was shiny', '02', purple, { font: 'chakra', size: 9, y: 1004, tracking: .24 }));
  return [p1, p2];
};

// ═════════════════════════════════════════════════════════════════════════════
// SOLARPUNK — biophilic abundance and quiet technology
// ═════════════════════════════════════════════════════════════════════════════
const solarpunk: EraDesigner = ({ W, H, paper, ink: green, accent: gold, secondary: leaf, seed }) => {
  const fr = frame(W, H, 64);
  const bodyInk = mix(green, -.45);
  const greens = [leaf, green, mix(leaf, .22), '#9CCB6E', mix(green, .18)];
  const leafObj = (x: number, y: number, w: number, h: number, color: string, rotation: number, opacity = .78) =>
    path(x, y, w, h, orn.leafPath(), color, { rotation, opacity, blend: 'multiply', stroke: mix(color, -.3), strokeWidth: 1, label: 'Leaf' });
  const rng = orn.rng(seed);
  const solarArray = (x: number, y: number, w: number, h: number, cellsX: number, cellsY: number): TelaVectorObject[] => {
    const out: TelaVectorObject[] = [rect(x, y, w, h, '#1E4A57', { rx: 6, gradient: lin(112, [0, '#2A6270'], [1, '#183C48']), label: 'Solar array' })];
    out.push(rect(x + 6, y + 6, w - 12, h * .42, '#FFFFFF', { rx: 4, opacity: .08, label: 'Array sheen' }));
    for (let i = 1; i < cellsX; i++) out.push(vr(x + i * w / cellsX, y, h, alpha(paper, .55), 1, { label: 'Cell line' }));
    for (let i = 1; i < cellsY; i++) out.push(hr(x, y + i * h / cellsY, w, alpha(paper, .55), 1, { label: 'Cell line' }));
    return out;
  };

  // ── Page 1 ────────────────────────────────────────────────────────────────
  const p1: TelaVectorObject[] = [
    rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Ground', gradient: lin(90, [0, mix(paper, .35)], [1, paper]) }),
    circle(662, 190, 240, gold, { gradient: rad([0, gold, .42], [.6, gold, .12], [1, gold, 0]), label: 'Sun glow' }),
    circle(662, 190, 138, gold, { gradient: lin(90, [0, '#FFE49A'], [1, gold]), label: 'Sun' }),
  ];
  p1.push(text(fr.x, fr.y, 360, 'Field guide · Issue 04 · Spring', { size: 10, font: 'dmMono', weight: 500, color: green, tracking: .18, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
  p1.push(hr(fr.x, fr.y + 24, 300, gold, 1.5, { label: 'Kicker rule' }));
  const title = text(fr.x, 296, 560, 'The city that grows its own shade', { size: 72, font: 'fraunces', weight: 600, color: green, leading: 1.0, tracking: -.015, label: 'Masthead', role: 'HEADLINE' });
  p1.push(title);
  const deck = text(fr.x, below(title, 24), 460, 'Rooftop orchards, shared batteries and streets that drink the rain: notes from a neighbourhood that decided abundance was a design problem.', { size: 15, font: 'manrope', weight: 500, color: bodyInk, leading: 1.45, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  // Canopy blobs behind everything at the foot
  p1.push(path(-120, 760, 520, 380, orn.blobPath(seed + 1, 7, .25), leaf, { opacity: .5, blend: 'multiply', label: 'Canopy' }));
  p1.push(path(420, 800, 520, 340, orn.blobPath(seed + 2, 6, .22), mix(leaf, .25), { opacity: .5, blend: 'multiply', label: 'Canopy' }));
  p1.push(path(160, 900, 360, 240, orn.blobPath(seed + 3, 6, .3), green, { opacity: .32, blend: 'multiply', label: 'Canopy' }));
  // Array + data label
  p1.push(...solarArray(fr.x, 664, 200, 120, 5, 3));
  p1.push(text(fr.x, 792, 260, 'Array 02 · 3.2 kWp · tilt 32°', { size: 9, font: 'dmMono', weight: 500, color: green, tracking: .12, transform: 'uppercase', wrap: false, label: 'Array data label', role: 'CAPTION' }));
  p1.push(text(fr.right - 300, fr.y, 300, 'Solar yield 4.1 kWh / m² / day', { size: 9, font: 'dmMono', weight: 500, color: green, tracking: .12, transform: 'uppercase', align: 'right', wrap: false, label: 'Data micro-label', role: 'CAPTION' }));
  // Image slot in an organic frame
  p1.push(...imageSlot(470, 560, 282, 300, { tone: 'light', rx: 40, shade: alpha(leaf, .18), frame: alpha(green, .35), frameWidth: 1, caption: 'Rooftop orchard', label: 'Orchard image slot' }));
  // Foliage climbing from the bottom
  const cluster = (x0: number, x1: number, y0: number, n: number, maxS: number) => {
    for (let i = 0; i < n; i++) {
      const s = 56 + rng() * (maxS - 56), x = x0 + rng() * (x1 - x0), y = y0 + rng() * (H - 40 - y0);
      p1.push(leafObj(x, y, s * .58, s, greens[i % greens.length], -38 + rng() * 76));
    }
  };
  cluster(-50, 150, 790, 9, 150);
  cluster(520, 780, 780, 9, 140);
  p1.push(text(300, 1006, 216, 'Plajah · Solarpunk field guide · 01', { size: 8.5, font: 'dmMono', weight: 500, color: green, tracking: .14, transform: 'uppercase', align: 'center', wrap: false, label: 'Foot line', role: 'FOLIO' }));

  // ── Page 2 ────────────────────────────────────────────────────────────────
  const p2: TelaVectorObject[] = [
    rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Ground' }),
    circle(fr.right - 22, fr.y + 6, 12, gold, { label: 'Sun mark' }),
    ...orn.radialLines(fr.right - 22, fr.y + 6, 17, 24, 8, gold, 1.2, { label: 'Sun ray' }),
  ];
  p2.push(text(fr.x + 20, fr.y, 400, 'The city that grows its own shade', { size: 9, font: 'dmMono', weight: 500, color: green, tracking: .16, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(hr(fr.x + 20, fr.y + 22, fr.w - 20, gold, 1.5, { label: 'Head rule' }));
  // Leaf rail on the outer left
  p2.push(vr(40, fr.y + 60, 780, alpha(green, .35), 1, { label: 'Leaf rail rule' }));
  for (let i = 0; i < 8; i++) p2.push(leafObj(24 + (i % 2 ? 6 : -2), fr.y + 80 + i * 96, 26, 44, greens[i % greens.length], i % 2 ? 22 : -22, .85));
  const inner = frame(W, H, 64, { inner: 84 });
  const head = text(inner.x, fr.y + 52, 500, 'Shared batteries, shared shade', { size: 34, font: 'fraunces', weight: 600, color: green, leading: 1.08, label: 'Section head', role: 'HEADLINE' });
  p2.push(head);
  const deck2 = text(inner.x, below(head, 12), 520, 'How one neighbourhood turned its roofs into an orchard, its car park into a wetland, and its electricity bill into a conversation.', { size: 13, font: 'manrope', weight: 500, color: bodyInk, leading: 1.45, label: 'Deck', role: 'DECK' });
  p2.push(deck2);
  const rule = hr(inner.x, below(deck2, 20), inner.w, alpha(green, .3), 1, { label: 'Deck rule' });
  p2.push(rule);
  const cols = columns(inner.x, inner.w, 2, 28);
  const body = { size: 11.5, font: 'manrope' as const, color: bodyInk, leading: 1.52 };
  const top = rule.y + 22;
  // Column 1
  const k1 = text(cols[0].x, top, cols[0].w, '01 · Water', { size: 9.5, font: 'dmMono', weight: 500, color: green, tracking: .18, transform: 'uppercase', wrap: false, label: 'Column 1 subhead', role: 'LABEL' });
  p2.push(k1);
  const b1 = text(cols[0].x, below(k1, 10), cols[0].w,
    'The first thing they built was not a solar panel. It was a ditch: a shallow, planted channel down the middle of what had been a four-lane road, sized to hold the kind of storm that used to arrive once a decade and now arrives most Aprils. Rain that once ran to the drains now stays for a while, feeds the trees, and leaves slowly.\n\nThe panels came second, because shade came first. Fruit trees along every south-facing wall, a canopy over the market square, vines trained across the old bus shelter. Only after the streets were cool did anyone talk about kilowatts.\n\nSolarpunk, as a genre and as a set of drawings, insists on this order. Technology serves the garden, not the other way around. A battery is only interesting if you can see who it keeps warm.',
    { ...body, label: 'Column 1 body', role: 'BODY' });
  p2.push(b1);
  const q = text(cols[0].x + 16, below(b1, 20), cols[0].w - 16, '“Abundance is a design problem, not a miracle.”', { size: 16, font: 'fraunces', italic: true, weight: 500, color: green, leading: 1.35, label: 'Pull quote', role: 'DECK' });
  p2.push(vr(cols[0].x, q.y, q.h, gold, 2, { label: 'Quote rule' }));
  p2.push(q);
  const b1b = text(cols[0].x, below(q, 18), cols[0].w,
    'The numbers on this page are the neighbourhood’s own. They are printed small because they are not the point. The point is the shade.\n\nVisitors expect the tour to end at the battery. It ends at the orchard, where the person leading it will usually stop talking, pick something, and hand it over. The technology is real and the yields are real, but the argument is made with fruit.\n\nThis is what the genre asks of a page as well: put the living things in front, the machines behind them, and keep the data honest and small.',
    { ...body, label: 'Column 1 body · continued', role: 'BODY' });
  p2.push(b1b);
  // Column 2
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 210, { tone: 'light', rx: 28, shade: alpha(leaf, .18), frame: alpha(green, .35), frameWidth: 1, caption: 'Market canopy', label: 'Interior image slot' }));
  const cap = text(cols[1].x, top + 218, cols[1].w, 'The market square canopy in its third summer.', { size: 9, font: 'manrope', italic: true, color: bodyInk, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(cap);
  const data = ['Rain captured · 38,400 L / yr', 'PV yield · 12.6 MWh / yr', 'Canopy cover · 41 %', 'Shared storage · 210 kWh'];
  let dy = below(cap, 18);
  p2.push(hr(cols[1].x, dy, cols[1].w, gold, 1.5, { label: 'Data rule' }));
  for (const d of data) {
    const row = text(cols[1].x, dy + 8, cols[1].w, d, { size: 9, font: 'dmMono', weight: 500, color: green, tracking: .1, transform: 'uppercase', wrap: false, label: 'Data row', role: 'CAPTION' });
    p2.push(row);
    dy = below(row, 8);
    p2.push(hr(cols[1].x, dy, cols[1].w, alpha(green, .3), 1, { label: 'Data rule' }));
  }
  const k2 = text(cols[1].x, dy + 22, cols[1].w, '02 · Power', { size: 9.5, font: 'dmMono', weight: 500, color: green, tracking: .18, transform: 'uppercase', wrap: false, label: 'Column 2 subhead', role: 'LABEL' });
  p2.push(k2);
  p2.push(text(cols[1].x, below(k2, 10), cols[1].w,
    'The battery lives in the old substation, and its door is glass. Anyone can see the gauge. On bright days the needle drifts right and the bakery runs its ovens for free; on grey weeks the neighbourhood watches it fall together, which turns out to be the most effective conservation programme ever devised.',
    { ...body, label: 'Column 2 body', role: 'BODY' }));
  p2.push(...folio(fr, 'Solarpunk field guide', '02', green, { font: 'dmMono', size: 9, tracking: .14 }));
  return [p1, p2];
};

// ═════════════════════════════════════════════════════════════════════════════
// AFROFUTURIST — radiance, rhythm, a person at the centre
// ═════════════════════════════════════════════════════════════════════════════
const afrofuturist: EraDesigner = ({ W, H, paper: indigo, ink: violet, accent: gold, secondary: teal, seed }) => {
  const fr = frame(W, H, 64);
  const pale = '#E9E2F7', bodyInk = '#E2DBF2';
  const chevronRail = (x: number, y0: number, n: number, rotation: number, step = 30): TelaVectorObject[] =>
    Array.from({ length: n }, (_, i) => path(x, y0 + i * step, 28, 18, orn.chevronPath(38), i % 2 ? teal : gold, { rotation, opacity: i % 2 ? .85 : 1, label: 'Chevron' }));
  const drum = (cx: number, cy: number) => orn.rings(cx, cy, [6, 12, 18], gold, 1, { opacity: .8, label: 'Drum ring' });
  void seed;

  // ── Page 1 ────────────────────────────────────────────────────────────────
  const cx = W / 2, cy = 400;
  const p1: TelaVectorObject[] = [
    rect(0, 0, W, H, indigo, { role: 'GROUND', label: 'Indigo ground' }),
    circle(cx, cy, 440, violet, { gradient: rad([0, violet, .6], [.55, violet, .18], [1, violet, 0]), label: 'Radiance' }),
    ...orn.dotField(0, 0, W, 720, 96, gold, { rMin: .6, rMax: 1.3, opacity: .55, stagger: true, label: 'Star field' }),
    ...orn.dotField(48, 30, W - 96, 700, 128, teal, { rMin: .8, rMax: 1.6, opacity: .6, label: 'Star field · teal' }),
  ];
  // Radiant crown
  p1.push(...orn.radialLines(cx, cy, 300, 540, 36, gold, 1, { opacity: .28, label: 'Fine ray' }));
  p1.push(...orn.radialLines(cx, cy, 236, 330, 12, gold, 2, { opacity: .75, label: 'Ray' }));
  p1.push(...orn.rings(cx, cy, [180], gold, 1.5, { opacity: .75, label: 'Crown ring' }));
  p1.push(...orn.rings(cx, cy, [230], gold, 1, { opacity: .5, label: 'Crown ring' }));
  p1.push(...orn.rings(cx, cy, [290], gold, .75, { opacity: .35, label: 'Crown ring' }));
  p1.push(...orn.rings(cx, cy, [205, 260], teal, .6, { opacity: .55, label: 'Crown ring · teal' }));
  // Portrait hero in a capsule frame
  p1.push(...imageSlot(cx - 150, cy - 200, 300, 400, { tone: 'dark', rx: 150, shade: alpha(gold, .10), frame: gold, frameWidth: 1.5, caption: 'Portrait', label: 'Portrait slot' }));
  // Chevron rails
  p1.push(...chevronRail(36, 222, 6, 0));
  p1.push(...chevronRail(W - 64, 222, 6, 180));
  // Title block beneath
  p1.push(hr(cx - 60, 630, 120, gold, 1, { opacity: .8, label: 'Title rule' }));
  const kick = text(fr.x, 644, fr.w, 'Volume one · Sound, memory, tomorrow', { size: 10, font: 'spaceGrotesk', weight: 600, color: teal, tracking: .3, transform: 'uppercase', align: 'center', wrap: false, label: 'Kicker', role: 'LABEL' });
  p1.push(kick);
  const title = text(fr.x, below(kick, 14), fr.w, 'The future\nremembers', { size: 60, font: 'unbounded', weight: 800, color: gold, transform: 'uppercase', align: 'center', leading: 1.02, tracking: .02, label: 'Masthead', role: 'HEADLINE' });
  p1.push(title);
  const deck = text(148, below(title, 18), W - 296, 'A quarterly of speculative Black futures — the music, the machines and the long memory that carries them forward.', { size: 15, font: 'sora', weight: 400, color: pale, align: 'center', leading: 1.45, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  p1.push(hr(cx - 60, below(deck, 20), 120, gold, 1, { opacity: .8, label: 'Deck rule' }));
  p1.push(...drum(fr.x + 18, 936));
  p1.push(...folio(fr, 'The future remembers', 'Vol. 01 · 01', teal, { font: 'spaceGrotesk', size: 9, tracking: .24 }));

  // ── Page 2 ────────────────────────────────────────────────────────────────
  const inner = frame(W, H, 64, { inner: 96 });
  const p2: TelaVectorObject[] = [
    rect(0, 0, W, H, indigo, { role: 'GROUND', label: 'Indigo ground' }),
    ellipse(420, -200, 640, 640, teal, { gradient: rad([0, teal, .28], [.6, teal, .08], [1, teal, 0]), label: 'Radiance · teal' }),
    ...folio(fr, 'The future remembers', '02 · Essay', gold, { font: 'spaceGrotesk', size: 9, y: fr.y, tracking: .24 }),
    hr(inner.x, fr.y + 20, inner.w, gold, 1, { opacity: .7, label: 'Head rule' }),
    ...chevronRail(28, fr.y + 60, 10, 0, 34),
  ];
  const head = text(inner.x, fr.y + 52, 520, 'Rhythm is a technology', { size: 30, font: 'unbounded', weight: 700, color: gold, leading: 1.1, label: 'Section head', role: 'HEADLINE' });
  p2.push(head);
  const deck2 = text(inner.x, below(head, 12), 520, 'On drums, satellites and the idea that the future has already been rehearsed.', { size: 13, font: 'sora', color: pale, leading: 1.45, label: 'Deck', role: 'DECK' });
  p2.push(deck2);
  const rule = hr(inner.x, below(deck2, 20), inner.w, alpha(gold, .45), 1, { label: 'Deck rule' });
  p2.push(rule);
  const cols = columns(inner.x, inner.w, 2, 30);
  const body = { size: 11, font: 'sora' as const, color: bodyInk, leading: 1.58 };
  const top = rule.y + 22;
  p2.push(vr(cols[0].x + cols[0].w + 15, top, 620, alpha(gold, .3), 1, { label: 'Column rule' }));
  // Column 1
  const k1 = text(cols[0].x, top, cols[0].w, '01 · Signal', { size: 9.5, font: 'spaceGrotesk', weight: 600, color: teal, tracking: .26, transform: 'uppercase', wrap: false, label: 'Column 1 subhead', role: 'LABEL' });
  p2.push(k1);
  const b1 = text(cols[0].x, below(k1, 10), cols[0].w,
    'Before there were satellites there were drums, and before the drums there was the pattern the drums would carry. Every technology of transmission — the talking drum, the radio, the sequencer — is a way of sending a rhythm further than a body can. Afrofuturism starts from this observation and refuses to treat it as a metaphor.\n\nWhen Sun Ra dressed his Arkestra in robes and announced that he came from Saturn, he was not making a joke about space. He was making an argument about time: that a people whose history had been deliberately erased had every right to write their own origin, and to set it in the future if the past would not have them.\n\nThe page you are reading borrows that argument as a layout. The radiance behind the portrait is not decoration; it is the claim that the person in the frame is already broadcasting.',
    { ...body, label: 'Column 1 body', role: 'BODY' });
  p2.push(b1);
  const qTop = below(b1, 18);
  p2.push(hr(cols[0].x, qTop, cols[0].w, gold, 1, { opacity: .8, label: 'Quote rule' }));
  const q = text(cols[0].x, qTop + 12, cols[0].w, '“The future is not a place. It is a signal, and someone is already sending it.”', { size: 13, font: 'unbounded', weight: 600, color: gold, leading: 1.4, label: 'Pull quote', role: 'DECK' });
  p2.push(q);
  p2.push(hr(cols[0].x, below(q, 12), cols[0].w, gold, 1, { opacity: .8, label: 'Quote rule' }));
  p2.push(text(cols[0].x, below(q, 30), cols[0].w,
    'Set the type wide. Give the gold hairlines room. Let the columns hold a steady tempo and put the syncopation in the images.\n\nThe concentric rings at the foot of the page are the only ornament allowed to repeat, and they repeat like a drum pattern: three strokes, a rest, three strokes. Everything else — the chevrons, the rays, the portrait — happens once, so that the rhythm has something to play against.',
    { ...body, label: 'Column 1 body · continued', role: 'BODY' }));
  // Column 2
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 210, { tone: 'dark', rx: 16, shade: alpha(gold, .08), frame: alpha(gold, .6), frameWidth: 1, caption: 'Portrait detail', label: 'Interior image slot' }));
  const cap = text(cols[1].x, top + 218, cols[1].w, 'Portrait for the cover story — lit from below, as if from the stage.', { size: 9, font: 'sora', color: pale, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(cap);
  const k2 = text(cols[1].x, below(cap, 22), cols[1].w, '02 · Archive', { size: 9.5, font: 'spaceGrotesk', weight: 600, color: teal, tracking: .26, transform: 'uppercase', wrap: false, label: 'Column 2 subhead', role: 'LABEL' });
  p2.push(k2);
  p2.push(text(cols[1].x, below(k2, 10), cols[1].w,
    'Octavia E. Butler kept notebooks in which she wrote the future in the present tense. Samuel R. Delany built cities out of grammar. Their work is often shelved as science fiction, but it reads more like an archive of a time that has not yet been permitted to happen.\n\nThis quarterly is a small addition to that shelf: essays, scores, and portraits of people who are building the archive forward.\n\nEach issue opens with a person and closes with a pattern. In between, the writing is asked to do what the music has always done — carry the signal a little further than the body that made it could reach.',
    { ...body, label: 'Column 2 body', role: 'BODY' }));
  p2.push(...drum(inner.right - 18, 936));
  p2.push(...folio(fr, 'Vol. 01 · Essay', '02', teal, { font: 'spaceGrotesk', size: 9, tracking: .24 }));
  return [p1, p2];
};

export const DESIGNS: Record<string, EraDesigner> = { vaporwave, y2k, solarpunk, afrofuturist };

export const LESSONS: Record<string, DesignLesson> = {
  vaporwave: {
    principle: 'The horizon is the grid: one vanishing point below the title organises the whole page, and every other element — sun, bust, type — is placed by where it stands on that floor.',
    history: 'Vaporwave surfaced around 2010–2011 as a music micro-genre on Bandcamp, Last.fm and Tumblr, built from slowed, looped and chopped corporate muzak, smooth jazz and mall pop; Daniel Lopatin’s Chuck Person’s Eccojams Vol. 1 (2010), James Ferraro’s Far Side Virtual (2011) and Macintosh Plus’s Floral Shoppe (2011) are usually cited as its founding records. Its visual language borrowed early-1990s consumer technology — Windows 95 windows, VHS artefacts, one-point perspective grids, pastel sunsets, Greco-Roman busts and Japanese shop lettering — as an ambivalent joke about consumer nostalgia. By the mid-2010s the look had escaped the music and became one of the first internet-native aesthetics to be named, catalogued and sold back to the mainstream.',
    tryThis: 'Nudge the cyan and pink title passes from ±3 px to ±8 px and watch legibility fall off a cliff; then find the largest offset at which the word still reads.',
    interestTag: 'Vaporwave',
    related: ['Synthwave', 'Internet aesthetics', 'Glitch art', 'Retrofuturism'],
  },
  y2k: {
    principle: 'Translucency is structure: the pill card is a column, the chrome bar is a running head, and the bubbles are the only objects allowed to float.',
    history: 'The Y2K look grew out of late-1990s optimism about the coming millennium and the consumer technology arriving with it: Apple’s translucent iMac G3 (1998) and the gel-like Aqua interface of Mac OS X (2001), metallic and frosted plastics in products and fashion, and the chrome type and lens flares of early digital design tools. Studios such as The Designers Republic gave the era its techno-typographic edge through work like the Wipeout games. The label “Y2K aesthetic” is retrospective — applied in the 2010s and 2020s when the look was revived online — which is why it now reads as both a period style and a nostalgia.',
    tryThis: 'Lower the text panel’s white fill from 45 % to 20 % and raise the body weight until it reads again — you are learning where legibility actually lives in translucent layouts.',
    interestTag: 'Y2K design',
    related: ['Retrofuturism', 'Interface design', 'Chrome type', 'Vaporwave'],
  },
  solarpunk: {
    principle: 'Foliage climbs, technology sits still: the leaves overlap and multiply into the frame while the solar array stays a quiet gridded rectangle, so abundance leads and the machine follows.',
    history: 'Solarpunk is a speculative genre and design ethic that answers cyberpunk’s dystopia with ecological abundance and humane technology. The term appears in a 2008 blog post proposing an alternative to steampunk; the first anthology was published in Brazil in 2012 (Solarpunk: Histórias ecológicas e fantásticas em um mundo sustentável), and the aesthetic crystallised on Tumblr in 2014 alongside Adam Flynn’s “Notes toward a manifesto”. Its visual sources are Art Nouveau’s plant forms, Studio Ghibli’s green landscapes and the utopian ecology of writers such as Ursula K. Le Guin and Kim Stanley Robinson.',
    tryThis: 'Swap the gold sun for a second solar array and notice how the page turns from hopeful to industrial — then put the sun back and shrink the array until the balance returns.',
    interestTag: 'Solarpunk',
    related: ['Speculative design', 'Art Nouveau', 'Ecology', 'Sustainable architecture'],
  },
  afrofuturist: {
    principle: 'Radiance is hierarchy: rings and rays converge on the portrait so the eye lands on a person first, and the wide-set title beneath reads as a caption to that presence.',
    history: 'The word Afrofuturism was coined by critic Mark Dery in his 1993 essay “Black to the Future”, but the tradition it names is older: W. E. B. Du Bois’s story “The Comet” (1920), Sun Ra’s Arkestra and the film Space Is the Place (1974), Parliament-Funkadelic’s Mothership, and the novels of Octavia E. Butler and Samuel R. Delany. Scholars including Alondra Nelson and Ytasha Womack framed it in the 2000s and 2010s as a way of imagining Black futures through technology, music and memory rather than as a single visual style. Its twenty-first-century reach runs from Janelle Monáe’s albums to the production and costume design of Black Panther (2018) by Hannah Beachler and Ruth E. Carter.',
    tryThis: 'Replace the portrait with a photograph of a place and see how the radiant crown suddenly feels empty — this layout is built around a person, so keep it that way.',
    interestTag: 'Afrofuturism',
    related: ['Speculative fiction', 'Sun Ra', 'Black diaspora art', 'Science fiction'],
  },
};

export const OVERRIDES: Record<string, Partial<TelaStyleEra>> = {};
