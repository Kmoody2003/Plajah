// modernismLate — hand-designed style-era documents (see docs/tela/TEMPLATE_DESIGN_BRIEF.md).
//
// Eras: surrealist, swiss, midcentury, space-age, minimalist, brutalist, postmodern.
// Every page is drawn with the templateKit vocabulary only; fonts are FontKeys;
// motifs come from ornaments; copy is either a copy.ts voice or prose written for
// the movement. Page 1 is the poster moment, page 2 a usable interior.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson, EraDesigner } from '../types';
import type { TelaStyleEra } from '../../../telaStyleEraLibrary';
import { rect, ellipse, circle, hr, vr, path, text, below, imageSlot, columns, span, frame, folio, mix, alpha } from '../../templateKit';
import { copy } from '../../copy';
import * as orn from '../../ornaments';

// ── Shared helpers ────────────────────────────────────────────────────────────

const ground = (W: number, H: number, fill: string, label = 'Paper ground') => rect(0, 0, W, H, fill, { label, role: 'GROUND' });

/** Seeded star field on a jittered grid — deterministic, never Math.random. */
function starfield(W: number, H: number, cols: number, rows: number, color: string, seed: number, rMax = 1.6): TelaVectorObject[] {
  const r = orn.rng(seed); const out: TelaVectorObject[] = []; const cw = W / cols, ch = H / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * cw + r() * cw, y = j * ch + r() * ch, rad = .6 + r() * rMax;
    out.push(circle(x, y, rad, color, { opacity: .35 + r() * .65, label: 'Star', role: 'ORNAMENT' }));
  }
  return out;
}

/** Faint modular grid (columns + row modules) drawn as hairlines. */
function faintGrid(cols: Array<{ x: number; w: number }>, rows: Array<{ y: number; h: number }>, color: string, opacity = .08): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  const top = rows[0].y, bottom = rows[rows.length - 1].y + rows[rows.length - 1].h;
  const left = cols[0].x, right = cols[cols.length - 1].x + cols[cols.length - 1].w;
  for (const c of cols) { out.push(vr(c.x, top, bottom - top, color, 1, { opacity, label: 'Grid column line' })); out.push(vr(c.x + c.w, top, bottom - top, color, 1, { opacity, label: 'Grid column line' })); }
  for (const r of rows) { out.push(hr(left, r.y, right - left, color, 1, { opacity, label: 'Grid row line' })); out.push(hr(left, r.y + r.h, right - left, color, 1, { opacity, label: 'Grid row line' })); }
  return out;
}
function rowsOf(y: number, h: number, n: number, gutter: number): Array<{ y: number; h: number }> {
  const rh = (h - gutter * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ y: y + i * (rh + gutter), h: rh }));
}

// ── Surrealist — calm space, uncanny scale ────────────────────────────────────

const surrealist: EraDesigner = ({ W, H, paper, ink, accent, secondary, seed }) => {
  const horizon = Math.round(H * .62);
  const sky = mix(secondary, .58);
  const floor = mix(paper, -.07), floorFar = mix(paper, -.15);
  const mute = mix(ink, .35);

  const p1: TelaVectorObject[] = [
    rect(0, 0, W, H, paper, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: sky }, { offset: .62, color: paper }, { offset: .62, color: floor }, { offset: 1, color: floorFar }] }, label: 'Sky and floor ground', role: 'GROUND' }),
    hr(0, horizon, W, alpha(ink, .55), 1, { label: 'Horizon rule' }),
    hr(0, horizon + 70, W, alpha(ink, .1), 1, { label: 'Floor line 1' }),
    hr(0, horizon + 160, W, alpha(ink, .08), 1, { label: 'Floor line 2' }),
    hr(0, horizon + 270, W, alpha(ink, .06), 1, { label: 'Floor line 3' }),
    circle(668, 148, 36, mix(paper, .55), { opacity: .95, label: 'Pale sun' }),
    rect(150, horizon - 58, 36, 58, ink, { label: 'Door on the horizon' }),
    rect(160, horizon - 48, 16, 40, sky, { label: 'Light through the door' }),
    text(200, horizon - 22, 220, 'fig. iii — a door, ajar', { size: 8.5, font: 'dmMono', color: mute, wrap: false, label: 'Figure label iii', role: 'CAPTION' }),
    ellipse(548, horizon + 52, 170, 14, alpha(ink, .22), { blur: 3, label: 'Window shadow (displaced)' }),
    ...imageSlot(536, 236, 150, 196, { tone: 'light', frame: alpha(ink, .35), caption: 'a window', label: 'Floating image slot' }),
    text(536, 442, 230, 'fig. i — a window, borrowed from another house', { size: 8.5, font: 'dmMono', color: mute, leading: 1.35, label: 'Figure label i', role: 'CAPTION' }),
    ellipse(20, 924, 430, 24, alpha(ink, .26), { blur: 2, label: 'Long shadow' }),
    path(430, 690, 360, 270, orn.blobPath(seed, 7, .2), mix(paper, .5), { stroke: alpha(ink, .18), strokeWidth: 1, label: 'Cloud, grounded' }),
    path(552, 646, 226, 168, orn.blobPath(seed + 3, 6, .25), mix(paper, .58), { stroke: alpha(ink, .14), strokeWidth: 1, label: 'Cloud, upper lobe' }),
    text(432, 972, 300, 'fig. ii — a cloud, grounded', { size: 8.5, font: 'dmMono', color: mute, wrap: false, label: 'Figure label ii', role: 'CAPTION' }),
  ];
  const kicker = text(64, 72, 320, 'No. 14 · The Sleeping Issue', { size: 9, font: 'dmMono', tracking: .14, transform: 'uppercase', color: accent, wrap: false, label: 'Kicker', role: 'LABEL' });
  const title = text(64, 96, 360, 'The Hour Before\nthe Objects Wake', { size: 44, font: 'fraunces', weight: 500, leading: 1.02, color: ink, label: 'Title (small, floating)', role: 'HEADLINE' });
  const deck = text(64, below(title, 16), 300, 'In an empty room the furniture keeps its own appointments. An essay on scale, silence and the long afternoon.', { size: 14, font: 'spectral', italic: true, leading: 1.4, color: mix(ink, .15), label: 'Deck', role: 'DECK' });
  const byline = text(64, 1004, 440, copy.byline('editorial', 2), { size: 9, font: 'dmMono', color: mute, wrap: false, label: 'Byline', role: 'LABEL' });
  p1.push(kicker, title, deck, byline);

  // Page 2 — one narrow, centred measure; a picture cuts into it from the right.
  const fr = frame(W, H, 64);
  const colX = 258, colW = 300;
  const p2: TelaVectorObject[] = [
    ground(W, H, paper),
    hr(0, horizon, W, alpha(ink, .16), 1, { label: 'Horizon rule (faint)' }),
    rect(W - 78, horizon - 22, 14, 22, ink, { label: 'Door on the horizon (small)' }),
    text(fr.x, 48, 400, 'The Sleeping Issue · Essay', { size: 9, font: 'dmMono', tracking: .14, transform: 'uppercase', color: mute, wrap: false, label: 'Running head', role: 'FOLIO' }),
    hr(fr.x, 64, fr.w, alpha(ink, .3), 1, { label: 'Head rule' }),
  ];
  const sub = text(colX, 108, colW, 'A room that remembers its guests', { size: 24, font: 'fraunces', weight: 500, leading: 1.1, color: ink, label: 'Subhead', role: 'HEADLINE' });
  const body1 = text(colX, below(sub, 18), colW, copy.paragraphs('editorial', 2, 0), { size: 11.5, font: 'spectral', leading: 1.5, color: ink, label: 'Column body, first part', role: 'BODY' });
  const slotY = below(body1, 26);
  const slot = imageSlot(400, slotY, 250, 176, { tone: 'light', frame: alpha(ink, .35), caption: 'the room', label: 'Image slot cutting into the column' });
  const slotCap = text(662, slotY, 96, 'fig. iv — the reading room at dusk, before the lamps came on', { size: 8.5, font: 'dmMono', color: mute, leading: 1.35, label: 'Figure caption', role: 'CAPTION' });
  const quote = text(fr.x, slotY + 10, 168, copy.quote('editorial', 1), { size: 15, font: 'spectral', italic: true, leading: 1.3, color: accent, label: 'Pull quote (margin)', role: 'DECK' });
  const body2 = text(colX, slotY + 176 + 26, colW, [
    copy.body('editorial', 2),
    'The surrealists understood that a room is never empty. Remove the people and the objects begin to negotiate: the chair leans toward the window, the clock forgets the hour it was set to, the door on the horizon opens onto more horizon. The picture is calm because nothing in it is hurrying, and it is disturbing for the same reason.',
    'Scale is the quietest of the uncanny devices. Nothing has to melt. A cloud the size of a sofa, resting on the floor, tells you the rules have changed without raising its voice.',
  ].join('\n\n'), { size: 11.5, font: 'spectral', leading: 1.5, color: ink, label: 'Column body, second part', role: 'BODY' });
  p2.push(sub, body1, ...slot, slotCap, quote, body2, ...folio(fr, 'Surrealist Editorial', '14', mute, { font: 'dmMono', size: 8.5 }));
  return [p1, p2];
};

// ── Swiss — the modular grid, one red mark ────────────────────────────────────

const swiss: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const m = 48, gutter = 16;
  const cols6 = columns(m, W - m * 2, 6, gutter);
  const rows = rowsOf(m, H - m * 2, 8, gutter);
  const cw = cols6[0].w;
  const p1: TelaVectorObject[] = [
    ground(W, H, paper),
    ...faintGrid(cols6, rows, ink, .09),
    rect(cols6[5].x, rows[0].y, cw, cw, accent, { label: 'Red square', role: 'ORNAMENT' }),
    text(cols6[0].x, rows[0].y, span(cols6, 0, 3).w, 'Visual Communication Quarterly · Issue 12 · 1962', { size: 10, font: 'inter', weight: 500, tracking: .04, color: ink, wrap: false, label: 'Kicker', role: 'LABEL' }),
    text(cols6[0].x, rows[2].y, span(cols6, 0, 4).w, 'Order made\nvisible', { size: 72, font: 'inter', weight: 900, leading: .98, tracking: -.02, color: ink, label: 'Title', role: 'HEADLINE' }),
    text(cols6[0].x, rows[4].y, span(cols6, 0, 2).w, 'A quarterly on visual communication. This issue: the modular grid, from Zürich concert posters to the wayfinding of an entire city.', { size: 16, font: 'inter', weight: 400, leading: 1.35, color: ink, label: 'Deck', role: 'DECK' }),
    text(cols6[0].x, rows[7].y, span(cols6, 0, 1).w, 'Vol. 03 / No. 12\nPublished quarterly\nEditors: Imani Okafor, Callum Reyes\nPrinted offset, four colours', { size: 9.5, font: 'inter', weight: 400, leading: 1.4, color: secondary, label: 'Metadata block, left', role: 'LABEL' }),
    text(cols6[2].x, rows[7].y, span(cols6, 2, 3).w, 'Grid: 6 columns · 8 rows\nGutter 16 · module 107 × 106\nType: Inter 900 / 400\nNumerals: JetBrains Mono', { size: 9.5, font: 'inter', weight: 400, leading: 1.4, color: secondary, label: 'Metadata block, right', role: 'LABEL' }),
    text(cols6[5].x, rows[7].y, cw, '12 / 1962', { size: 11, font: 'jetbrains', weight: 400, color: ink, align: 'right', wrap: false, label: 'Issue numerals', role: 'LABEL' }),
  ];

  // Page 2 — 8-column grid: a hanging kicker pair + three text measures.
  const cols8 = columns(m, W - m * 2, 8, gutter);
  const textCols = [span(cols8, 2, 3), span(cols8, 4, 5), span(cols8, 6, 7)];
  const bodyOpts = { size: 10.5, font: 'inter' as const, weight: 400, leading: 1.45, color: ink };
  const own = [
    'A grid is not a cage. It is an agreement made before the content arrives, so that every later decision can be about the content rather than the container. Column widths, module heights and gutters are settled once; the designer then spends their attention on what to say and where to place it.',
    'The Zürich school called this objectivity. A poster for a concert should not perform the music; it should announce it clearly enough that the music can speak for itself. Sans-serif type, flush-left setting and a single accent colour were not a style but a discipline.',
    'White space in this system is structural. An empty module is not a gap waiting to be filled; it is a rest in the score, and the eye reads the page by the rhythm of what is present against what has been left out.',
    'Draw the grid faintly so the writer can see it and then forget it. If the structure is right, the text will fall into place without being pushed.',
  ];
  const slotTop = rows[1].y, slotH = rows[2].y + rows[2].h - rows[1].y;
  const bodyTop = rows[3].y;
  const p2: TelaVectorObject[] = [
    ground(W, H, paper),
    ...faintGrid(cols8, rows, ink, .09),
    text(cols8[0].x, rows[0].y, span(cols8, 0, 5).w, 'Visual Communication Quarterly — The modular grid', { size: 9, font: 'inter', weight: 500, tracking: .04, color: ink, wrap: false, label: 'Running head', role: 'FOLIO' }),
    text(cols8[7].x, rows[0].y, cols8[7].w, '24', { size: 11, font: 'jetbrains', color: ink, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
    rect(cols8[0].x, bodyTop + 2, 8, 8, accent, { label: 'Red mark', role: 'ORNAMENT' }),
    text(cols8[0].x + 14, bodyTop, span(cols8, 0, 1).w - 14, 'Method', { size: 10, font: 'inter', weight: 700, color: ink, wrap: false, label: 'Hanging kicker', role: 'LABEL' }),
    text(cols8[0].x, bodyTop + 22, span(cols8, 0, 1).w, 'The page is an 8-column, 8-row module grid with 16 px gutters. Columns pair into three text measures; the first pair is reserved for notes like this one.\n\nJosef Müller-Brockmann, Grid Systems in Graphic Design, 1981.', { size: 9, font: 'inter', weight: 400, leading: 1.4, color: secondary, label: 'Kicker column note', role: 'CAPTION' }),
    ...imageSlot(textCols[0].x, slotTop, textCols[1].x + textCols[1].w - textCols[0].x, slotH, { tone: 'light', shade: mix(paper, -.06), caption: 'figure 1', label: 'Image slot' }),
    text(textCols[2].x, slotTop, textCols[2].w, `Fig. 1
${copy.caption('editorial', 2)}`, { size: 9, font: 'inter', weight: 400, leading: 1.4, color: secondary, label: 'Figure caption', role: 'CAPTION' }),
  ];
  const sub = text(textCols[0].x, bodyTop, textCols[0].w, 'The grid as an ethic', { size: 12, font: 'inter', weight: 700, color: ink, wrap: false, label: 'Subhead', role: 'HEADLINE' });
  p2.push(sub,
    text(textCols[0].x, below(sub, 8), textCols[0].w, own[0] + '\n\n' + own[1], { ...bodyOpts, label: 'Column 1 body', role: 'BODY' }),
    text(textCols[1].x, bodyTop, textCols[1].w, own[2] + '\n\n' + copy.body('editorial', 2), { ...bodyOpts, label: 'Column 2 body', role: 'BODY' }),
    text(textCols[2].x, bodyTop, textCols[2].w, own[3] + '\n\n' + copy.body('editorial', 0), { ...bodyOpts, label: 'Column 3 body', role: 'BODY' }),
  );
  return [p1, p2];
};

// ── Mid-century — optimistic abstraction ──────────────────────────────────────

const midcentury: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const wood = '#8B5A3C';
  const woodTop = H - 140;
  const p1: TelaVectorObject[] = [
    ground(W, H, paper, 'Mustard ground'),
    rect(0, woodTop, W, 140, wood, { gradient: { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: mix(wood, .08) }, { offset: 1, color: mix(wood, -.28) }] }, label: 'Warm wood shade', role: 'ORNAMENT' }),
    path(-60, 520, 600, 480, orn.boomerangPath(), accent, { rotation: -10, label: 'Teal boomerang', role: 'ORNAMENT' }),
    path(590, 700, 200, 160, orn.boomerangPath(), secondary, { rotation: 150, label: 'Small orange boomerang', role: 'ORNAMENT' }),
  ];
  // Atomic burst: rays with a circle at every tip.
  const bx = 640, by = 300, r0 = 18, r1 = 118, n = 12;
  p1.push(...orn.radialLines(bx, by, r0, r1, n, ink, 2, { label: 'Atomic ray' }));
  for (let i = 0; i < n; i++) {
    const a = (-90 + i * 360 / n) * Math.PI / 180;
    p1.push(circle(bx + (r1 + 7) * Math.cos(a), by + (r1 + 7) * Math.sin(a), 6, i % 3 === 0 ? secondary : i % 3 === 1 ? ink : accent, { label: 'Atomic tip' }));
  }
  p1.push(circle(bx, by, 10, secondary, { label: 'Atomic centre' }));
  p1.push(
    ellipse(150, 250, 54, 30, secondary, { rotation: -18, label: 'Small oval' }),
    ellipse(318, 468, 28, 48, ink, { rotation: 12, label: 'Small oval' }),
    ellipse(690, 950, 50, 26, paper, { rotation: -8, label: 'Small oval on wood' }),
  );
  const kicker = text(64, 72, 420, 'House & Garden Annual · Spring 1957', { size: 10, font: 'spaceGrotesk', weight: 500, tracking: .16, transform: 'uppercase', color: ink, wrap: false, label: 'Kicker', role: 'LABEL' });
  const title = text(64, 100, 500, 'Bright Rooms,\nLong Weekends', { size: 66, font: 'outfit', weight: 700, leading: 1.0, color: ink, label: 'Title', role: 'HEADLINE' });
  const deck = text(64, below(title, 16), 380, 'A season of low sofas, open plans and the confidence to paint a whole wall the colour of mustard.', { size: 15, font: 'nunito', weight: 400, leading: 1.4, color: ink, label: 'Deck', role: 'DECK' });
  const byline = text(64, 996, 520, 'Words by Marisol Vega · Photographs by Ren Ishikawa', { size: 9, font: 'spaceGrotesk', weight: 500, tracking: .14, transform: 'uppercase', color: paper, wrap: false, label: 'Byline', role: 'LABEL' });
  p1.push(kicker, title, deck, byline);

  // Page 2 — boomerang bullet rail + two columns, round-cornered picture.
  const fr = frame(W, H, 64);
  const bodyX = 204, bodyW = fr.right - bodyX;
  const cols = columns(bodyX, bodyW, 2, 24);
  const own = [
    'The house sat low on its lot, all glass on the garden side, and the first thing anyone said when they walked in was how far they could see. The carport was open, the kitchen was open, the plan was open. Openness was the point; the furniture simply had to keep up.',
    'Colour arrived with confidence. A mustard wall, a teal chair, a lamp the colour of a tangerine — none of it matched and all of it agreed, because the shapes underneath were kin: the boomerang table, the kidney pool, the starburst clock ticking over the credenza.',
    'What looks like optimism in the photographs was mostly practicality. Plywood bent because it was cheap and strong. Legs splayed because they were lighter that way. The future, it turned out, was affordable — for a while.',
  ];
  const p2: TelaVectorObject[] = [
    ground(W, H, paper, 'Mustard ground'),
    text(fr.x, 48, 336, 'House & Garden Annual · The Open Plan', { size: 9, font: 'spaceGrotesk', weight: 500, tracking: .16, transform: 'uppercase', color: ink, wrap: false, label: 'Running head', role: 'FOLIO' }),
    text(fr.cx, 48, fr.w / 2, '32', { size: 9, font: 'spaceGrotesk', weight: 500, tracking: .16, color: ink, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
    hr(fr.x, 66, fr.w, accent, 2, { label: 'Head rule' }),
    ...imageSlot(bodyX, 92, bodyW, 220, { rx: 60, tone: 'light', shade: alpha(ink, .12), caption: 'the garden side', label: 'Round-cornered image slot' }),
    text(bodyX, 322, bodyW, 'The living room opens onto the terrace; the terrace opens onto the afternoon.', { size: 9.5, font: 'nunito', italic: true, color: ink, label: 'Caption', role: 'CAPTION' }),
  ];
  const sub = text(bodyX, 352, bodyW, 'Living in the round', { size: 24, font: 'outfit', weight: 700, color: ink, wrap: false, label: 'Subhead', role: 'HEADLINE' });
  const bodyTop = below(sub, 16);
  const rail = ['Open plan', 'Low seating', 'Indoor–outdoor', 'One bold wall'];
  rail.forEach((item, i) => {
    const y = bodyTop + i * 44;
    p2.push(path(fr.x, y + 1, 20, 16, orn.boomerangPath(), i % 2 ? secondary : accent, { label: 'Boomerang bullet', role: 'ORNAMENT' }));
    p2.push(text(fr.x + 28, y + 3, 104, item, { size: 9.5, font: 'spaceGrotesk', weight: 500, color: ink, wrap: false, label: 'Rail item', role: 'LABEL' }));
  });
  const quote = text(cols[1].x, bodyTop, cols[1].w, '“Paint one wall\nthe colour of a good mood\nand let the rest\nof the room relax.”', { size: 18, font: 'outfit', weight: 500, leading: 1.25, color: accent, label: 'Pull quote', role: 'DECK' });
  p2.push(sub, quote,
    text(cols[0].x, bodyTop, cols[0].w, own[0] + '\n\n' + own[1], { size: 11.5, font: 'nunito', leading: 1.5, color: ink, label: 'Column 1 body', role: 'BODY' }),
    text(cols[1].x, below(quote, 16), cols[1].w, own[2] + '\n\n' + copy.body('culture', 1), { size: 11.5, font: 'nunito', leading: 1.5, color: ink, label: 'Column 2 body', role: 'BODY' }),
    ellipse(fr.right - 44, fr.bottom - 30, 44, 22, secondary, { rotation: -10, label: 'Small oval' }),
    ...folio(fr, 'Mid-century Modern', 'Spring 1957', ink, { font: 'spaceGrotesk', size: 8.5 }),
  );
  return [p1, p2];
};

// ── Space Age — orbits and capsules ───────────────────────────────────────────

const spaceAge: EraDesigner = ({ W, H, paper, ink, accent, secondary, seed }) => {
  const own = [
    'The control room was designed before the rocket. Rows of consoles, each with its own small horizon of switches, faced a wall of screens the size of a cinema. The people who sat there wore short sleeves and spoke in acronyms, and nothing on their desks was more than a decade old.',
    'Every surface of the era wanted to be a capsule: chairs became spheres you sat inside, televisions grew visors, and kitchens promised to cook dinner while you watched the launch. The public bought the shape of the future long before the future arrived.',
    'Orbit is not a place but a speed. Fall fast enough sideways and you will miss the ground forever — a fact so strange that a generation of designers drew circles around everything to make sure nobody forgot it.',
  ];
  const px = 620, py = 400;
  const p1: TelaVectorObject[] = [
    ground(W, H, paper, 'Navy ground'),
    ...starfield(W, H, 9, 11, ink, seed),
    ...orn.rings(px, py, [150, 230, 320], secondary, 1, { opacity: .55, label: 'Orbit' }),
    ...orn.rings(180, 940, [190, 290], secondary, 1, { opacity: .25, label: 'Far orbit' }),
    ellipse(px - 330, py - 92, 660, 184, 'none', { stroke: secondary, strokeWidth: 1.5, rotation: -22, opacity: .7, label: 'Tilted orbit' }),
    circle(px, py, 110, accent, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: mix(accent, .28) }, { offset: .7, color: accent }, { offset: 1, color: mix(accent, -.38) }] }, label: 'Orange planet' }),
    circle(768, 292, 16, mix(ink, -.12), { label: 'Small moon' }),
    circle(px + 230 * Math.cos(200 * Math.PI / 180), py + 230 * Math.sin(200 * Math.PI / 180), 5, secondary, { label: 'Satellite' }),
    circle(px + 320 * Math.cos(-40 * Math.PI / 180), py + 320 * Math.sin(-40 * Math.PI / 180), 4, ink, { label: 'Satellite' }),
    rect(64, 500, 300, 38, 'none', { rx: 19, stroke: secondary, strokeWidth: 1.5, label: 'Capsule label', role: 'ORNAMENT' }),
    text(64, 514, 300, 'MISSION BRIEF · ORBIT 07', { size: 9, font: 'michroma', tracking: .2, color: secondary, align: 'center', wrap: false, label: 'Capsule text', role: 'LABEL' }),
  ];
  const title = text(64, 560, 620, 'Escape\nVelocity', { size: 64, font: 'orbitron', weight: 900, transform: 'uppercase', leading: 1.02, color: ink, label: 'Title', role: 'HEADLINE' });
  const deck = text(64, below(title, 18), 440, 'A field guide to the machines that left, the rooms they were designed in, and the future everyone was sure of.', { size: 16, font: 'exo2', weight: 300, leading: 1.4, color: ink, label: 'Deck', role: 'DECK' });
  const rule = hr(64, below(deck, 22), 440, secondary, 1, { label: 'Data rule' });
  const meta = text(64, rule.y + 12, 440, 'Launch window 06:40 UTC · Inclination 51.6° · Crew 3 · Duration 14 days', { size: 8.5, font: 'michroma', tracking: .06, color: secondary, leading: 1.6, label: 'Mission data', role: 'CAPTION' });
  const byline = text(64, 1004, 480, copy.byline('science', 1) + ' · ' + copy.byline('science', 2), { size: 10, font: 'exo2', weight: 400, color: mix(ink, -.2), wrap: false, label: 'Byline', role: 'LABEL' });
  p1.push(title, deck, rule, meta, byline);

  // Page 2 — capsule-cornered frame, orbit as running head, two columns.
  const fr = frame(W, H, 88);
  const cols = columns(fr.x, fr.w, 2, 28);
  const p2: TelaVectorObject[] = [
    ground(W, H, paper, 'Navy ground'),
    ...starfield(W, H, 6, 5, ink, seed + 11, 1.2),
    rect(40, 40, W - 80, H - 80, 'none', { rx: 48, stroke: secondary, strokeWidth: 1, opacity: .8, label: 'Capsule frame', role: 'ORNAMENT' }),
    circle(740, 990, 60, accent, { label: 'Planet, corner' }),
    ...orn.rings(740, 990, [92], secondary, 1, { opacity: .5, label: 'Corner orbit' }),
    text(fr.x, 66, 316, 'Escape Velocity · Mission brief', { size: 8.5, font: 'michroma', tracking: .18, transform: 'uppercase', color: secondary, wrap: false, label: 'Running head', role: 'FOLIO' }),
    text(fr.cx, 66, fr.w / 2, '07 / 24', { size: 8.5, font: 'michroma', tracking: .18, color: secondary, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
    hr(fr.x, 92, fr.w, secondary, 1, { label: 'Orbit rule' }),
    circle(fr.x + 212, 92, 4, accent, { label: 'Satellite on the rule' }),
  ];
  const sub = text(cols[0].x, 120, cols[0].w, 'The room where\nthe future was drawn', { size: 16, font: 'orbitron', weight: 700, leading: 1.2, color: secondary, label: 'Subhead', role: 'HEADLINE' });
  const bodyA = text(cols[0].x, below(sub, 14), cols[0].w, own[0] + '\n\n' + own[1], { size: 11.5, font: 'exo2', weight: 300, leading: 1.5, color: ink, label: 'Column 1 body', role: 'BODY' });
  const slotY = below(bodyA, 24);
  const slot = imageSlot(cols[0].x, slotY, cols[0].w, 200, { tone: 'dark', rx: 24, caption: 'control room', label: 'Image slot' });
  const cap = text(cols[0].x, slotY + 210, cols[0].w, copy.caption('science', 0), { size: 8, font: 'michroma', tracking: .04, color: secondary, leading: 1.5, label: 'Caption', role: 'CAPTION' });
  const quote = text(cols[1].x, 120, cols[1].w, '“We didn’t design\nfor gravity.\nWe designed for\nthe absence of it.”', { size: 18, font: 'orbitron', weight: 500, leading: 1.3, color: accent, label: 'Pull quote', role: 'DECK' });
  const bodyB = text(cols[1].x, below(quote, 18), cols[1].w, own[2] + '\n\n' + copy.body('science', 1) + '\n\n' + copy.body('science', 0), { size: 11.5, font: 'exo2', weight: 300, leading: 1.5, color: ink, label: 'Column 2 body', role: 'BODY' });
  p2.push(sub, bodyA, ...slot, cap, quote, bodyB, ...folio(fr, 'Space Age', '07', secondary, { font: 'michroma', size: 8, y: fr.bottom - 4 }));
  return [p1, p2];
};

// ── Minimalist — reduction and material ───────────────────────────────────────

const minimalist: EraDesigner = ({ W, H, paper, ink, accent }) => {
  const gx = Math.round(W * .382), gy = Math.round(H * .382); // golden section
  const grey = accent; // warm grey (palette slot 3)
  const mute = mix(ink, .45);
  const p1: TelaVectorObject[] = [
    ground(W, H, paper),
    hr(gx, gy - 31, 88, grey, 1, { label: 'The one rule' }),
    text(gx, gy - 22, 380, 'An exhibition of quiet objects · Room 4', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, wrap: false, label: 'Kicker', role: 'LABEL' }),
    text(gx, gy, 400, 'Almost nothing', { size: 34, font: 'manrope', weight: 300, color: ink, wrap: false, label: 'Title (light)', role: 'HEADLINE' }),
    text(gx, gy + 50, 380, 'Eleven objects, one room, no labels.', { size: 11, font: 'inter', weight: 400, color: mix(ink, .3), wrap: false, label: 'Deck', role: 'DECK' }),
    text(gx, gy + 78, 380, '12 May — 30 June', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, wrap: false, label: 'Dates', role: 'LABEL' }),
    text(gx, gy + 94, 380, 'Curated by Marguerite Ellis', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, wrap: false, label: 'Curator line', role: 'LABEL' }),
    rect(64, H - 76, 12, 12, grey, { label: 'The one square', role: 'ORNAMENT' }),
    text(86, H - 75, 240, 'Room 4', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, wrap: false, label: 'Running foot', role: 'FOLIO' }),
    text(W - 64 - 120, H - 75, 120, '01', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
  ];

  // Page 2 — a single narrow column on the golden vertical; folio only.
  const colX = gx, colW = 320;
  const own = [
    'The room holds eleven objects and the objects hold the room. None of them is placed for effect; each is placed where the wall, the floor and the light already agreed it should go, and the visitor’s task is to notice the agreement.',
    'Reduction is not the same as emptiness. Take away the frame, the plinth, the label and the title, and what remains has to be strong enough to stand without them. Most things are not. The ones that are seem, afterwards, inevitable.',
    'Material speaks when nothing is shouting over it. Steel has a temperature. Paper has a grain. A hairline rule drawn in warm grey is warmer than the same rule drawn in black, and a page that notices this has already begun to design itself.',
    'Leave the margin wide enough that the column looks chosen rather than fitted. Then stop.',
  ];
  const slot = imageSlot(colX, 140, colW, 200, { tone: 'light', shade: mix(paper, -.05), caption: 'one object', label: 'Image slot' });
  const cap = text(colX, 350, colW, 'Untitled (eleven), steel, 40 × 40 × 40 cm.', { size: 8.5, font: 'dmMono', tracking: .04, color: mute, wrap: false, label: 'Caption', role: 'CAPTION' });
  const sub = text(colX, 400, colW, 'The room holds what the room can hold', { size: 20, font: 'manrope', weight: 300, leading: 1.15, color: ink, label: 'Subhead', role: 'HEADLINE' });
  const body = text(colX, below(sub, 20), colW, own.join('\n\n'), { size: 11, font: 'inter', weight: 400, leading: 1.6, color: ink, label: 'Column body', role: 'BODY' });
  const p2: TelaVectorObject[] = [
    ground(W, H, paper),
    text(64, 64, 240, 'Almost nothing', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, wrap: false, label: 'Running head', role: 'FOLIO' }),
    rect(colX, 64, 6, 6, grey, { label: 'Column origin mark', role: 'ORNAMENT' }),
    ...slot, cap, sub, body,
    hr(colX, below(body, 24), 40, grey, 1, { label: 'End rule' }),
    text(64, H - 75, 240, 'Room 4', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, wrap: false, label: 'Running foot', role: 'FOLIO' }),
    text(W - 64 - 120, H - 75, 120, '02', { size: 8.5, font: 'dmMono', tracking: .1, color: mute, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
  ];
  return [p1, p2];
};

// ── Brutalist — raw structure, overscale ──────────────────────────────────────

const brutalist: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const mono = 'ibmPlexMono' as const;
  const inner = { x: 48, y: 48, w: W - 96, h: H - 96 };
  const cols = columns(inner.x, inner.w, 6, 0);
  const rowH = 120;
  const p1: TelaVectorObject[] = [
    ground(W, H, paper),
    rect(24, 24, W - 48, H - 48, 'none', { stroke: ink, strokeWidth: 12, label: 'Structural frame', role: 'ORNAMENT' }),
  ];
  for (let i = 1; i < 6; i++) p1.push(vr(cols[i].x, inner.y, inner.h, ink, 1, { opacity: .18, dash: [4, 4], label: `Grid column ${String(i).padStart(2, '0')}` }));
  for (let j = 1; j < 8; j++) p1.push(hr(inner.x, inner.y + j * rowH, inner.w, ink, 1, { opacity: .18, dash: [4, 4], label: `Grid row ${String(j).padStart(2, '0')}` }));
  'ABCDEF'.split('').forEach((L, i) => p1.push(text(cols[i].x, 34, cols[i].w, L, { size: 8, font: mono, weight: 500, color: ink, align: 'center', wrap: false, label: `Coordinate ${L}`, role: 'LABEL' })));
  for (let j = 0; j < 8; j++) p1.push(text(32, inner.y + j * rowH + 4, 16, String(j + 1).padStart(2, '0'), { size: 8, font: mono, weight: 500, color: ink, wrap: false, label: `Coordinate row ${j + 1}`, role: 'LABEL' }));
  p1.push(
    text(inner.x, 60, 470, 'Raw structure. Exposed system. Nothing hidden behind a finish.', { size: 12, font: mono, weight: 500, leading: 1.4, color: ink, label: 'Deck', role: 'DECK' }),
    text(inner.x, 150, inner.w, 'MASS', { size: 250, font: 'bigShoulders', weight: 900, leading: 1, color: ink, wrap: false, label: 'Giant word 1', role: 'HEADLINE' }),
    text(inner.x, 400, inner.w, 'VOID', { size: 250, font: 'bigShoulders', weight: 900, leading: 1, color: paper, stroke: ink, strokeWidth: 3, wrap: false, label: 'Giant word 2 (outlined)', role: 'HEADLINE' }),
    rect(cols[4].x, 660, cols[4].w * 2, 108, accent, { label: 'Blue block', role: 'ORNAMENT' }),
    rect(inner.x, 660, cols[4].x - inner.x - 12, 12, secondary, { label: 'Red bar', role: 'ORNAMENT' }),
  );
  const tableRows: Array<[string, string]> = [['PROJECT', 'Housing block 04 · 212 dwellings'], ['MATERIAL', 'In-situ concrete, board-marked'], ['DATES', '1967 – 1972'], ['STATUS', 'Listed · occupied'], ['SHEET', 'A1 · scale 1:200']];
  const tY = 780, tH = 38, labelW = 240;
  tableRows.forEach(([k, v], i) => {
    const y = tY + i * tH;
    p1.push(rect(inner.x, y, labelW, tH, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Table cell (label)', role: 'ORNAMENT' }));
    p1.push(rect(inner.x + labelW, y, inner.w - labelW, tH, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Table cell (value)', role: 'ORNAMENT' }));
    p1.push(text(inner.x + 10, y + 13, labelW - 20, k, { size: 9.5, font: mono, weight: 700, color: ink, wrap: false, label: 'Table label', role: 'LABEL' }));
    p1.push(text(inner.x + labelW + 10, y + 13, inner.w - labelW - 20, v, { size: 9.5, font: mono, weight: 400, color: ink, wrap: false, label: 'Table value', role: 'BODY' }));
  });
  p1.push(text(inner.x, 984, inner.w, 'Drawn 02.09.2026 · Rev C · Not for construction', { size: 8, font: mono, weight: 400, color: ink, wrap: false, label: 'Sheet note', role: 'CAPTION' }));

  // Page 2 — a hard two-column table with visible cell borders.
  const T = { x: 48, y: 48, w: W - 96, h: H - 96 };
  const div = T.x + T.w / 2;
  const A = { x: T.x + 12, w: T.w / 2 - 24 }, B = { x: div + 12, w: T.w / 2 - 24 };
  const bodyOpts = { size: 10.5, font: mono, weight: 400, leading: 1.5, color: ink };
  const own = {
    a1: 'Béton brut means raw concrete: poured against timber boards and left exactly as the boards made it, knots, grain and joints included. The finish is the structure. There is nothing to peel back and nothing behind it.',
    a2: 'The same rule governs the page. The grid is visible, the coordinates are printed, the type is set in a face designed for machines to read. Decoration is refused not because it is ugly but because it would be a lie about how the thing was made.',
    a3: 'Scale is the second honesty. A wall of concrete is heavy and a page should not pretend the words on it are weightless. One word, set at the size of a floor plan, is a load-bearing element.',
    b1: 'The estate was finished in 1972 and disliked within a decade — too grey, too big, too honest about being a machine for housing. Then the flats were photographed with the sun on them and the concrete turned, in the pictures, to sandstone.',
    b2: 'The revival in graphic design borrowed the vocabulary rather than the ethics: hard borders, monospaced labels, oversized type that crops itself against the frame. It works because the eye trusts structure it can see.',
    b3: 'This sheet does the same. Every rule is 3 px because 3 px reads as a wall, not a hairline. Nothing is centred. Nothing is soft.',
  };
  const p2: TelaVectorObject[] = [
    ground(W, H, paper),
    rect(T.x, T.y, T.w, T.h, 'none', { stroke: ink, strokeWidth: 3, label: 'Table frame', role: 'ORNAMENT' }),
    vr(div, T.y, T.h, ink, 3, { label: 'Column divider' }),
    hr(T.x, 88, T.w, ink, 3, { label: 'Header rule' }),
    hr(T.x, 300, T.w, ink, 3, { label: 'Row rule' }),
    hr(T.x, 940, T.w, ink, 3, { label: 'Footer rule' }),
    rect(div + 1.5, T.y + 1.5, 22, 38.5, accent, { label: 'Blue cell', role: 'ORNAMENT' }),
    text(A.x, 62, A.w, 'MASS / VOID — HOUSING BLOCK 04', { size: 9, font: mono, weight: 700, tracking: .04, color: ink, wrap: false, label: 'Running head', role: 'FOLIO' }),
    text(B.x + 30, 62, B.w - 30, 'SHEET 02 / 24', { size: 9, font: mono, weight: 700, tracking: .04, color: ink, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
  ];
  for (let j = 0; j < 8; j++) p2.push(text(30, T.y + j * 120 + 4, 16, String(j + 1).padStart(2, '0'), { size: 8, font: mono, weight: 500, color: ink, wrap: false, label: `Coordinate row ${j + 1}`, role: 'LABEL' }));
  const pull = text(A.x, 100, A.w, 'Concrete\ndoes not\napologise', { size: 44, font: 'bigShoulders', weight: 900, transform: 'uppercase', leading: .95, color: ink, label: 'Pull quote', role: 'HEADLINE' });
  p2.push(pull, rect(A.x, below(pull, 14), 120, 8, secondary, { label: 'Red bar', role: 'ORNAMENT' }));
  p2.push(...imageSlot(B.x, 100, B.w, 188, { tone: 'light', shade: alpha(ink, .1), frame: ink, frameWidth: 3, caption: 'elevation', label: 'Image slot' }));
  const subA = text(A.x, 314, A.w, 'A. Material honesty', { size: 10.5, font: mono, weight: 700, transform: 'uppercase', color: ink, wrap: false, label: 'Subhead A', role: 'HEADLINE' });
  const bodyA1 = text(A.x, below(subA, 10), A.w, own.a1 + '\n\n' + own.a2, { ...bodyOpts, label: 'Column A body', role: 'BODY' });
  const subB = text(A.x, below(bodyA1, 22), A.w, 'B. Scale', { size: 10.5, font: mono, weight: 700, transform: 'uppercase', color: ink, wrap: false, label: 'Subhead B', role: 'HEADLINE' });
  const bodyA2 = text(A.x, below(subB, 10), A.w, own.a3, { ...bodyOpts, label: 'Column A body, continued', role: 'BODY' });
  const bodyB = text(B.x, 314, B.w, own.b1 + '\n\n' + own.b2 + '\n\n' + own.b3, { ...bodyOpts, label: 'Column B body', role: 'BODY' });
  p2.push(subA, bodyA1, subB, bodyA2, bodyB);
  const dataY = 600; /* fixed: monospace measures wider in the browser than the node estimate */ const dataRows: Array<[string, string]> = [['DWELLINGS', '212'], ['STOREYS', '14'], ['CONCRETE', '11,400 m³']];
  dataRows.forEach(([k, v], i) => {
    const y = dataY + i * 34;
    p2.push(rect(B.x, y, B.w * .5, 34, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Data cell (label)', role: 'ORNAMENT' }));
    p2.push(rect(B.x + B.w * .5, y, B.w * .5, 34, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Data cell (value)', role: 'ORNAMENT' }));
    p2.push(text(B.x + 8, y + 12, B.w * .5 - 16, k, { size: 9, font: mono, weight: 700, color: ink, wrap: false, label: 'Data label', role: 'LABEL' }));
    p2.push(text(B.x + B.w * .5 + 8, y + 12, B.w * .5 - 16, v, { size: 9, font: mono, weight: 400, color: ink, wrap: false, label: 'Data value', role: 'BODY' }));
  });
  p2.push(
    text(A.x, 962, A.w, 'DRAWING SET · HOUSING BLOCK 04', { size: 8.5, font: mono, weight: 500, color: ink, wrap: false, label: 'Footer left', role: 'FOLIO' }),
    text(B.x, 962, B.w, 'REV C · 02 / 24', { size: 8.5, font: mono, weight: 500, color: ink, align: 'right', wrap: false, label: 'Footer right', role: 'FOLIO' }),
  );
  return [p1, p2];
};

// ── Postmodern — quotation and pluralism ──────────────────────────────────────

const postmodern: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const SHOCK = '#F4E04D';
  const stone = mix(paper, -.09);
  const cx = W / 2;
  const colL = 178, colR = 568, colW = 70, colTop = 294, colH = 430;
  const fluting = (x: number) => orn.stripes(x + 8, colTop, colW - 16, colH, 5, 5, alpha(ink, .18), { vertical: true, label: 'Fluting' });
  const p1: TelaVectorObject[] = [
    ground(W, H, paper, 'Sand ground'),
    path(cx - 260 + 14, 132, 520, 130, orn.polygonPath(3), alpha(ink, .16), { label: 'Pediment shadow (quotation)', role: 'ORNAMENT' }),
    path(cx - 260, 120, 520, 130, orn.polygonPath(3), accent, { label: 'Pediment', role: 'ORNAMENT' }),
    circle(cx, 208, 22, SHOCK, { label: 'Oculus', role: 'ORNAMENT' }),
    rect(cx - 240, 250, 480, 44, secondary, { label: 'Entablature', role: 'ORNAMENT' }),
    path(cx - 30, 250, 60, 44, 'M0 0 L100 0 L78 100 L22 100 Z', ink, { label: 'Keystone', role: 'ORNAMENT' }),
    rect(colL, colTop, colW, colH, stone, { label: 'Left column' }), ...fluting(colL),
    rect(colL - 8, colTop, colW + 16, 18, ink, { label: 'Left capital' }), rect(colL - 8, colTop + colH - 18, colW + 16, 18, ink, { label: 'Left base' }),
    rect(colR, colTop, colW, colH, stone, { label: 'Right column' }), ...fluting(colR),
    rect(colR - 8, colTop, colW + 16, 18, ink, { label: 'Right capital' }), rect(colR - 8, colTop + colH - 18, colW + 16, 18, ink, { label: 'Right base' }),
    rect(cx - 268, colTop + colH, 536, 26, secondary, { label: 'Plinth', role: 'ORNAMENT' }),
    rect(cx - 288, colTop + colH + 26, 576, 14, ink, { label: 'Step', role: 'ORNAMENT' }),
  ];
  const innerX = colL + colW + 14, innerW = colR - 14 - innerX;
  const title = text(innerX, 330, innerW, 'The\nFaçade\nSpeaks', { size: 56, font: 'archivo', weight: 900, transform: 'uppercase', leading: .96, color: ink, align: 'center', label: 'Title', role: 'HEADLINE' });
  const word = text(innerX, below(title, 6), innerW, 'almost', { size: 40, font: 'shrikhand', color: accent, align: 'center', wrap: false, label: 'One word (Shrikhand)', role: 'DECK' });
  const quote = text(innerX, below(word, 14), innerW, '“Less is a bore.”', { size: 22, font: 'bodoni', italic: true, color: ink, align: 'center', wrap: false, label: 'Classical quotation', role: 'DECK' });
  const attr = text(innerX, below(quote, 6), innerW, 'Robert Venturi, 1966', { size: 8.5, font: 'spaceMono', tracking: .08, color: mix(ink, .3), align: 'center', wrap: false, label: 'Attribution', role: 'CAPTION' });
  const deck = text(innerX, below(attr, 18), innerW, 'A reader on quotation, irony and the pleasure of putting a column where it does not belong.', { size: 10, font: 'spaceMono', leading: 1.45, color: ink, align: 'center', label: 'Deck', role: 'DECK' });
  p1.push(title, word, quote, attr, deck,
    text(120, 792, 576, 'Postmodern Classicism · Reader No. 3 · 1966 – 1995', { size: 9, font: 'spaceMono', tracking: .12, transform: 'uppercase', color: ink, align: 'center', wrap: false, label: 'Kicker', role: 'LABEL' }),
  );
  [accent, secondary, SHOCK, ink, mix(accent, .5)].forEach((c, i) => p1.push(rect(cx - 5 * 20 + i * 40, 832, 28, 28, c, { label: 'Colour chip', role: 'ORNAMENT' })));
  p1.push(text(120, 900, 576, copy.byline('culture', 0) + ' · ' + copy.byline('culture', 2), { size: 9, font: 'spaceMono', color: mix(ink, .3), align: 'center', wrap: false, label: 'Byline', role: 'LABEL' }));

  // Page 2 — two columns interrupted by a huge tracked quotation.
  const fr = frame(W, H, 64);
  const cols = columns(fr.x, fr.w, 2, 28);
  const bodyOpts = { size: 11, font: 'archivo' as const, weight: 400, leading: 1.5, color: ink };
  const own = [
    'Robert Venturi’s 1966 rebuttal to the modernist slogan — less is a bore — gave a generation permission to quote. Columns returned without roofs to hold up, pediments broke open in the middle, and a skyscraper in Manhattan acquired the top of a Chippendale highboy.',
    'Quotation here is not nostalgia. It is a way of admitting that the past is already in the room, and of arguing with it in public.',
    'In graphic design the movement arrived through Basel and California at once. Wolfgang Weingart broke the Swiss grid he had been taught to respect; his students April Greiman and Dan Friedman carried the fracture to the United States, layering type, texture and colour until the page became a surface rather than a window.',
    'Memphis, founded in Milan around Ettore Sottsass in 1981, did the same for furniture: laminates printed with squiggles, a bookcase that leaned like a totem, colours chosen because they clashed.',
    'The pastel-and-shock palette on this page is the tell. Everything is agreeable until the acid yellow arrives, and the yellow is the argument.',
    'A temple front of flat shapes framing a headline is a joke and a structure at the same time. The joke is that no one is fooled; the structure is that it still organises the page as well as any grid.',
    'Try leaving the quotation marks on. Irony that hides its source is just theft.',
  ];
  const p2: TelaVectorObject[] = [
    ground(W, H, paper, 'Sand ground'),
    text(fr.x, 48, 400, 'Reader No. 3 · Quotation', { size: 9, font: 'spaceMono', tracking: .12, transform: 'uppercase', color: ink, wrap: false, label: 'Running head', role: 'FOLIO' }),
    path(fr.right - 40, 44, 40, 14, orn.polygonPath(3), accent, { label: 'Pediment (running head)', role: 'ORNAMENT' }),
    hr(fr.x, 66, fr.w, ink, 1, { label: 'Head rule' }),
    ...orn.stripes(fr.x - 20, 88, 14, 200, 4, 2, secondary, { vertical: true, label: 'Fluted frame edge' }),
    ...imageSlot(cols[0].x, 88, cols[0].w, 200, { tone: 'light', shade: alpha(ink, .08), caption: 'the façade', label: 'Image slot' }),
    text(cols[0].x, 296, cols[0].w, 'Vanna Venturi House, Chestnut Hill, 1964: a gable split down the middle.', { size: 8.5, font: 'spaceMono', leading: 1.4, color: mix(ink, .3), label: 'Caption', role: 'CAPTION' }),
  ];
  const subB = text(cols[1].x, 88, cols[1].w, 'A column where it does not belong', { size: 14, font: 'archivo', weight: 900, tracking: .06, transform: 'uppercase', leading: 1.15, color: ink, label: 'Subhead', role: 'HEADLINE' });
  const bodyB1 = text(cols[1].x, below(subB, 12), cols[1].w, own[0] + '\n\n' + own[1], { ...bodyOpts, label: 'Column 2 body, first part', role: 'BODY' });
  const qTop = Math.max(below(bodyB1, 28), 340);
  const qRule1 = hr(fr.x, qTop, fr.w, secondary, 2, { label: 'Quotation rule (top)' });
  const bigQuote = text(fr.x, qTop + 14, fr.w, 'Complexity and\ncontradiction', { size: 34, font: 'bodoni', weight: 400, tracking: .18, transform: 'uppercase', leading: 1.12, color: accent, label: 'Huge tracked quotation', role: 'DECK' });
  const qAttr = text(fr.x, below(bigQuote, 8), fr.w, '— Robert Venturi, title of his 1966 book', { size: 8.5, font: 'spaceMono', tracking: .06, color: mix(ink, .3), wrap: false, label: 'Attribution', role: 'CAPTION' });
  const qRule2 = hr(fr.x, below(qAttr, 12), fr.w, secondary, 2, { label: 'Quotation rule (bottom)' });
  const resume = qRule2.y + 24;
  const bodyA = text(cols[0].x, resume, cols[0].w, own[2] + '\n\n' + own[3] + '\n\n' + own[4], { ...bodyOpts, label: 'Column 1 body', role: 'BODY' });
  const box = rect(cols[1].x, resume, cols[1].w, 62, SHOCK, { label: 'Shock box', role: 'ORNAMENT' });
  const boxText = text(cols[1].x + 12, resume + 12, cols[1].w - 24, 'Quotation is not theft when you leave the quotation marks on.', { size: 9.5, font: 'spaceMono', weight: 700, leading: 1.4, color: ink, label: 'Shock box text', role: 'LABEL' });
  const bodyB2 = text(cols[1].x, resume + 62 + 18, cols[1].w, own[5] + '\n\n' + own[6], { ...bodyOpts, label: 'Column 2 body, second part', role: 'BODY' });
  p2.push(subB, bodyB1, qRule1, bigQuote, qAttr, qRule2, bodyA, box, boxText, bodyB2,
    text(fr.x, H - 57, 400, 'Postmodern Classicism · Reader', { size: 8.5, font: 'spaceMono', tracking: .08, color: mix(ink, .3), wrap: false, label: 'Running foot', role: 'FOLIO' }),
    rect(fr.right - 24, H - 66, 24, 24, accent, { label: 'Folio square', role: 'ORNAMENT' }),
    text(fr.right - 24, H - 59, 24, '18', { size: 9, font: 'spaceMono', weight: 700, color: paper, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }),
  );
  return [p1, p2];
};

// ── Exports ───────────────────────────────────────────────────────────────────

export const DESIGNS: Record<string, EraDesigner> = {
  surrealist, swiss, midcentury, 'space-age': spaceAge, minimalist, brutalist, postmodern,
};

export const LESSONS: Record<string, DesignLesson> = {
  surrealist: {
    principle: 'The uncanny is a matter of placement, not distortion: a calm horizon, a small title floating high-left, and one object at the wrong scale in the wrong place is all it takes.',
    history: 'Surrealism was launched in Paris with André Breton’s 1924 manifesto and drew on Freud’s ideas about dreams and the unconscious. Painters such as René Magritte, Salvador Dalí and Max Ernst, and photographers such as Man Ray, put ordinary objects into impossible relationships rendered with deadpan precision. Its imagery moved quickly into fashion photography and advertising — Dalí worked with Elsa Schiaparelli, and Magritte’s own commercial work fed a visual language of quiet displacement that magazines still use.',
    tryThis: 'Move the floating image slot from the sky onto the floor, then move the cloud into the sky. Notice how the page becomes ordinary — then swap them back.',
    interestTag: 'Surrealism',
    related: ['Dada', 'Modern art', 'Photography', 'Editorial design'],
  },
  swiss: {
    principle: 'Decide the grid before the content arrives, then let every element — title, picture, footnote — sit on a module edge; the one red square shows the system is alive.',
    history: 'The International Typographic Style grew out of the Zürich and Basel schools in the 1950s, in the work of Josef Müller-Brockmann, Armin Hofmann, Emil Ruder and Max Bill, and was argued for in the journal Neue Grafik from 1958. Its tools were the modular grid, flush-left sans-serif type (Helvetica and Univers both appeared in 1957) and objective photography instead of illustration. Müller-Brockmann’s Grid Systems in Graphic Design (1981) codified the method, which became the default language of corporate identity and public signage worldwide.',
    tryThis: 'Move the red square to another module and re-set the title so it still begins on a row line. The page should feel equally resolved in both positions.',
    interestTag: 'Swiss typography',
    related: ['Grid systems', 'Bauhaus', 'Helvetica', 'Poster design'],
  },
  midcentury: {
    principle: 'Friendly geometry balances a warm ground: the boomerang’s sweep, the burst’s rhythm and a slab of wood are three different weights that meet without a centre line.',
    history: 'Mid-century modern describes the design of roughly 1945 to 1969 in the United States and Scandinavia, when wartime materials — moulded plywood, fibreglass, aluminium — reached the home. Charles and Ray Eames, Eero Saarinen and George Nelson’s office shaped its furniture; the Case Study House programme run by Arts & Architecture magazine from 1945 shaped its houses. Graphic designers such as Alvin Lustig and Saul Bass gave the period its playful, abstract print language of boomerangs, atoms and starbursts.',
    tryThis: 'Change the ground from mustard to the teal and make the boomerang mustard. Then adjust the wood band until the page feels as warm as before.',
    interestTag: 'Mid-century modern',
    related: ['Furniture design', 'Bauhaus', 'Space Age', 'Illustration'],
  },
  'space-age': {
    principle: 'Circles organise everything: orbits pass behind the title, a capsule holds the label, and the planet is the one saturated mass on a page of thin lines.',
    history: 'The Space Age in design runs from Sputnik in 1957 through the Apollo programme and into the mid-1970s. Furniture became capsules and spheres — Eero Aarnio’s Ball Chair (1963), Verner Panton’s moulded interiors — while Pierre Cardin and André Courrèges cut clothes like mission uniforms. Films such as 2001: A Space Odyssey (1968) and the graphics of the space programmes themselves fixed an aesthetic of extended geometric type, orbital diagrams and optimistic navy-and-orange contrast.',
    tryThis: 'Shift the planet to the opposite side of the page and re-centre the orbit rings on it. Keep the title where it is and see which orbit now crosses behind it.',
    interestTag: 'Space Age design',
    related: ['Mid-century modern', 'Science fiction', 'Retro-futurism', 'Y2K'],
  },
  minimalist: {
    principle: 'When almost nothing is on the page, position is the design: the title sits on the golden section and one rule and one square hold the whole sheet still.',
    history: 'Minimalism emerged in New York in the 1960s with Donald Judd, Agnes Martin, Dan Flavin and Carl Andre, who made objects that were only what they were — Judd’s 1965 essay Specific Objects gave the position its name. In design the same ethic ran through Dieter Rams’s work for Braun (“less, but better”) and later through Japanese product design and architecture. Its graphic language is reduction, generous white space and a careful attention to material: the grey of a rule, the grain of paper.',
    tryThis: 'Delete the rule. Then delete the square. Put back only the one whose absence you noticed first.',
    interestTag: 'Minimalism',
    related: ['Swiss typography', 'Contemporary art', 'Product design', 'Japanese design'],
  },
  brutalist: {
    principle: 'Show the structure and let it carry the weight: a 12 px frame, printed coordinates and one word the size of a floor plan, with every rule thick enough to read as a wall.',
    history: 'Brutalism takes its name from béton brut — the raw, board-marked concrete of Le Corbusier’s Unité d’Habitation (1952). Alison and Peter Smithson adopted “New Brutalism” in Britain in the early 1950s and the critic Reyner Banham defined it in a 1955 essay and a 1966 book; the Barbican, Trellick Tower and Boston City Hall are its monuments. The graphic revival of the 2010s borrowed its ethics for the screen — exposed grids, monospaced labels, oversized type and deliberate friction.',
    tryThis: 'Change the giant word and keep it inside the frame. If it no longer fits at 250 px, break it into two lines rather than shrinking it.',
    interestTag: 'Brutalism',
    related: ['Architecture', 'Web design', 'Monospace typography', 'Concrete'],
  },
  postmodern: {
    principle: 'Quote the classical order in flat colour and let one shock colour and one wrong typeface admit the joke — the temple still frames the headline.',
    history: 'Postmodernism in design followed Robert Venturi’s Complexity and Contradiction in Architecture (1966), with its answer to Mies — “less is a bore” — and Learning from Las Vegas (1972), written with Denise Scott Brown and Steven Izenour. Michael Graves’s Portland Building (1982) and Philip Johnson’s AT&T Building (1984) put pediments and keystones back on skyscrapers; the Memphis group around Ettore Sottsass (Milan, 1981) did the same for furniture. In graphic design Wolfgang Weingart, April Greiman and Dan Friedman broke the Swiss grid into layered, plural pages.',
    tryThis: 'Swap the Shrikhand word for a different single word in the same face, then change the shock colour. Only one element on the page should be allowed to be loud.',
    interestTag: 'Postmodern design',
    related: ['Memphis', 'New Wave typography', 'Architecture', 'Swiss typography'],
  },
};

export const OVERRIDES: Record<string, Partial<TelaStyleEra>> = {
  // Text needs a dark ink: swap the orange into the accent slots and keep the navy for type.
  midcentury: { palette: ['#F2D9A7', '#252B35', '#29726B', '#D65A3A'], typography: 'Geometric display sans (Outfit) with a rounded humanist text face (Nunito)' },
  // Warm grey is the accent; the rust stays in reserve.
  minimalist: { palette: ['#F6F5F0', '#171717', '#B8B5AE', '#9A3E35'], typography: 'Light geometric sans (Manrope 300) with a neutral text face' },
  swiss: { typography: 'One neo-grotesk (Inter 900 / 400) with monospaced numerals' },
  brutalist: { typography: 'Condensed 900-weight display at floor-plan scale with monospaced text and labels' },
  postmodern: { typography: 'Didone quotation, 900-weight grotesk headline, monospaced labels and one Shrikhand word' },
};
