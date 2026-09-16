// globalTraditions — hand-designed style-era documents (see docs/tela/TEMPLATE_DESIGN_BRIEF.md).
//
// Seven living traditions, designed from PRINCIPLES — grid, composition, rhythm,
// typography — never from sacred symbols, regalia or motifs that belong to a
// specific community. Every era gets its own geometry: Harlem is the syncopated
// rule, Ukiyo-e is the bold crop, Islamic geometry is the generative star, Mughal
// is the nested border, Mexican modern is woodcut force, Tropical modernism is
// the brise-soleil, and Indigenous contemporary is context before image.
import type { TelaVectorObject } from '../../../types';
import type { DesignLesson, EraDesigner } from '../types';
import type { TelaStyleEra } from '../../../telaStyleEraLibrary';
import { rect, circle, hr, vr, path, text, below, image, imageSlot, columns, frame, folio, mix, alpha, isDark, type TextOpts } from '../../templateKit';
import { copy } from '../../copy';
import * as orn from '../../ornaments';

// ── Shared helpers ────────────────────────────────────────────────────────────

interface FlowCol { x: number; w: number; top?: number }
/**
 * Flow paragraphs down a set of columns: each paragraph is one TEXT object; when
 * a paragraph would cross `bottom` the flow moves to the next column. Paragraphs
 * that do not fit are dropped, so pass more than you need.
 */
function flow(paras: string[], cols: FlowCol[], top: number, bottom: number, o: Omit<TextOpts, 'label' | 'role'>, gap: number, label = 'Column'): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  let ci = 0, y = cols[0]?.top ?? top;
  for (const p of paras) {
    if (ci >= cols.length) break;
    let t = text(cols[ci].x, y, cols[ci].w, p, { ...o, label: `${label} ${ci + 1} body`, role: 'BODY' });
    if (below(t) > bottom) {
      ci++; if (ci >= cols.length) break;
      y = cols[ci].top ?? top;
      t = text(cols[ci].x, y, cols[ci].w, p, { ...o, label: `${label} ${ci + 1} body`, role: 'BODY' });
      if (below(t) > bottom) break;
    }
    out.push(t); y = below(t, gap);
  }
  return out;
}

const bodyInk = (ground: string, ink: string) => (isDark(ground) ? mix(ink, .0) : ink);

// ── Copy that belongs to each tradition ───────────────────────────────────────

const HARLEM_PARAS = [
  'Uptown, the review was never a single building. It was a rented parlour where a poet read new work to eleven people, a basement where a band rehearsed past midnight, and a magazine that printed both by the end of the month. The movement that later took the neighbourhood’s name was, at street level, a set of rooms that said yes.',
  'The painters worked in silhouette and rhythm: flat figures, concentric light, a horizon that tilted toward the future. On the page that translation becomes a rule that repeats unevenly, a title that carries its own beat, and a portrait set where the eye lands first.',
  copy.body('culture', 0),
  copy.body('culture', 1),
  copy.body('editorial', 0),
];

const UKIYOE_PARAS = [
  'A print began as a business decision. The publisher chose the subject, commissioned the designer, and paid the carver and the printer whose names rarely appeared on the sheet. The designer’s drawing was pasted face-down on cherry wood and cut away; a key block gave the contour, and one block followed for each colour.',
  'Flat colour, an emphatic outline, and a viewpoint that crops the world where a painter would have centred it: these were the habits of a popular medium that sold for roughly the price of a bowl of noodles. When the sheets reached Paris in the 1860s, they taught European painters to leave the middle of the picture empty.',
  copy.body('travel', 1),
  copy.body('editorial', 2),
  copy.body('culture', 1),
];

const GEOMETRY_PARAS = [
  'Every pattern in this tradition starts with a circle and a straight line. Divide the circle, connect the divisions, extend the lines until they meet, and a star appears where nothing was drawn. Repeat the unit across a grid and the surface fills itself, with no gap and no centre.',
  'The designer’s skill is in choosing which lines to keep. The same underlying grid can yield a six-point, eight-point or ten-point family; artisans passed these constructions down through pattern scrolls and workshop practice long before anyone wrote them out as mathematics.',
  copy.body('science', 1),
  copy.body('editorial', 2),
  copy.body('science', 0),
];

const MUGHAL_PARAS = [
  'An album page was assembled, not painted in one sitting. A miniature — sometimes decades older than its mount — was trimmed and set into a window cut in thick paper, then surrounded by borders that were ruled, gilded and painted by specialists in the imperial workshop.',
  'The borders were where the workshop showed its range: sprays of flowering plants, birds, arabesque, and margins of gold-flecked paper. The picture was intimate; the frame did the talking. A reader turned the pages slowly, one opening at a time.',
  copy.body('editorial', 1),
  copy.body('editorial', 2),
  copy.body('culture', 1),
];

const MEXICAN_PARAS = [
  'The workshop opened its doors in 1937 with a hand press and a principle: prints should be cheap, fast and useful. Linocuts and lithographs went out as broadsides, calendars and posters for unions, schools and campaigns, signed by the collective as often as by an individual.',
  'Woodcut force is a matter of contrast. A black shape reads from across a plaza; a headline in condensed capitals reads from a moving tram. Everything on this page is sized for the distance at which it will be seen, and nothing on it is precious.',
  copy.body('community', 1),
  copy.body('community', 0),
  copy.body('editorial', 0),
];

const TROPICAL_PARAS = [
  'A wall that faces the sun should not be a wall. The brise-soleil — a screen of fixed louvres set ahead of the glass — cuts the direct light before it reaches the room, while the gap behind it lets warm air rise and escape. Shade becomes a structural material.',
  'Cross-ventilation asks for a thin building. The long axis runs east to west, the short sides are left open, and every corridor is a wind tunnel on purpose. The result was a civic architecture of schools, colleges and ministries that looked modern and felt cool without a machine.',
  copy.body('travel', 1),
  copy.body('science', 1),
  copy.body('editorial', 2),
];

const INDIGENOUS_PARAS = [
  'Before a picture is placed, five questions are answered on the page: which community made or owns this work, in what language it speaks, on whose land it was made, what protocols govern its display, and who is credited and paid. The answers are not a footnote. They are the first thing a reader sees.',
  'Sovereignty in publishing means the community, not the editor, decides what may be shown. Some works are seasonal; some are restricted to certain audiences; some may be reproduced freely with a name attached. A template cannot know these rules in advance, so it leaves room to write them down.',
  copy.body('community', 0),
  copy.body('editorial', 2),
  copy.body('culture', 1),
];

/** The five context fields — label + the style-guide sentence that explains how to fill it. */
const CONTEXT_FIELDS: Array<[string, string]> = [
  ['Community / Nation', 'As the community names itself, in its own spelling and order of precedence.'],
  ['Language(s)', 'Languages the work speaks in, including the name each language uses for itself.'],
  ['Territory / land acknowledgment', 'Whose land the work was made on, in the words the community has approved for print.'],
  ['Protocols & permissions', 'What may be shown, by whom, in which seasons or contexts — and who confirmed it, and when.'],
  ['Artist(s) & credit', 'Living artists named first; title, year and medium; licence terms and the permission holder.'],
];

// ── Designs ───────────────────────────────────────────────────────────────────

export const DESIGNS: Record<string, EraDesigner> = {

  // ── Harlem Renaissance — literary modernism, jazz rhythm, portraiture ────────
  harlem: ({ W, H, paper, ink, accent, secondary, seed }) => {
    const gold = secondary, red = accent;
    const m = 56, fr = frame(W, H, m);
    const r = orn.rng(seed);

    // Skyline — stepped rects standing on a black base (shared by both pages at different scales).
    const skyline = (baseY: number, top: number, color: string, windows: boolean): TelaVectorObject[] => {
      const out: TelaVectorObject[] = [];
      const widths = [58, 44, 72, 38, 64, 50, 80, 42, 60, 46, 70, 52, 66, 48];
      let x = -12;
      widths.forEach((bw, i) => {
        const bh = (baseY - top) * (.35 + r() * .65);
        out.push(rect(x, baseY - bh, bw, bh, color, { label: `Skyline block ${i + 1}` }));
        if (windows && bh > 40) for (let k = 0; k < 2; k++) out.push(rect(x + 8 + k * (bw - 22) / 1, baseY - bh + 12 + k * 18, 8, 10, gold, { label: 'Window' }));
        x += bw + 4;
      });
      return out;
    };

    // Syncopated rule rhythm — a rhythm chart of rules of varied length.
    const syncopation = (x: number, y: number, w: number): TelaVectorObject[] => {
      const beats = [1, .5, .82, .3, 1, .45, .68, .25];
      const out: TelaVectorObject[] = []; let yy = y;
      beats.forEach((b, i) => {
        const th = i % 2 ? 3 : 6;
        out.push(rect(x, yy, w * b, th, b >= .6 ? ink : red, { label: `Syncopated rule ${i + 1}`, role: 'RULE' }));
        yy += th + 8;
      });
      return out;
    };

    // Page 1 — opener.
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p1.push(circle(606, 358, 268, gold, { opacity: .55, label: 'Spotlight' }));
    p1.push(...orn.rings(606, 358, [300], ink, 1.5, { opacity: .45, label: 'Spotlight ring' }));
    p1.push(rect(486, 168, 292, 440, red, { label: 'Portrait offset block' }));
    p1.push(...imageSlot(468, 150, 292, 440, { tone: 'light', frame: ink, frameWidth: 8, caption: 'Portrait', label: 'Portrait slot' }));
    p1.push(text(468, 604, 292, 'Portrait study, uptown, late afternoon light.', { size: 9.5, font: 'lora', italic: true, color: ink, label: 'Portrait caption', role: 'CAPTION' }));

    const kicker = text(m, 150, 380, 'Autumn Number · Volume Three', { size: 20, font: 'bebas', color: red, tracking: .16, transform: 'uppercase', label: 'Kicker', role: 'LABEL' });
    p1.push(kicker);
    const head = text(m, below(kicker, 14), 380, 'The City That Taught Itself to Sing', { size: 68, font: 'playfair', weight: 900, color: ink, leading: 1.02, label: 'Masthead', role: 'HEADLINE' });
    p1.push(head);
    const rules = syncopation(m, below(head, 22), 300); p1.push(...rules);
    const rulesBottom = rules[rules.length - 1].y + rules[rules.length - 1].h;
    const deck = text(m, rulesBottom + 20, 380, 'Poets, painters and bandleaders on the block where a movement learned its own name — and what the page owes to the bandstand.', { size: 15, font: 'lora', italic: true, color: ink, leading: 1.4, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    p1.push(text(m, below(deck, 12), 380, 'By Imani Okafor · Portraits by Kofi Mensah', { size: 13, font: 'bebas', color: red, tracking: .14, transform: 'uppercase', label: 'Byline', role: 'LABEL' }));

    // Contents strip — three beats across the width.
    const cy = 742; const cols3 = columns(m, W - 2 * m, 3, 24);
    p1.push(hr(m, cy - 14, W - 2 * m, ink, 2, { label: 'Contents rule' }));
    [['Verse', 'Three new poems and a letter on form'], ['Portfolio', 'Painters of the block, in silhouette'], ['Music', 'Notes from the bandstand after midnight']].forEach(([k, v], i) => {
      const lab = text(cols3[i].x, cy, cols3[i].w, k, { size: 16, font: 'bebas', color: ink, tracking: .12, transform: 'uppercase', label: `Contents label ${i + 1}`, role: 'LABEL' });
      p1.push(lab, text(cols3[i].x, below(lab, 4), cols3[i].w, v, { size: 11, font: 'lora', color: ink, leading: 1.4, label: `Contents line ${i + 1}`, role: 'BODY' }));
    });

    p1.push(...skyline(1004, 880, ink, true));
    p1.push(rect(0, 1004, W, H - 1004, ink, { label: 'Skyline base' }));
    p1.push(...folio(fr, 'Harlem Renaissance Editorial', 'Autumn Number', paper, { font: 'bebas', size: 11, y: 1024 }));

    // Page 2 — interior.
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p2.push(...folio(fr, 'The City That Taught Itself to Sing', 'Autumn Number · 2', ink, { font: 'bebas', size: 11, y: 40 }));
    p2.push(rect(m, 58, W - 2 * m, 3, ink, { label: 'Head rule', role: 'RULE' }));
    const cols = columns(m, W - 2 * m, 2, 28);
    // Column 1: jazz-bar bullets + subhead + body.
    [[0, 40], [10, 24], [20, 32]].forEach(([dy, len], i) => p2.push(rect(cols[0].x, 86 + dy, len, 4, red, { label: `Jazz bar ${i + 1}` })));
    const sub = text(cols[0].x, 116, cols[0].w, 'Notes from the bandstand', { size: 24, font: 'playfair', weight: 700, color: ink, leading: 1.1, label: 'Subhead', role: 'DECK' });
    p2.push(sub);
    // Column 2: portrait slot with frame, caption, pull quote.
    const slot2 = imageSlot(cols[1].x, 86, cols[1].w, 220, { tone: 'light', frame: ink, frameWidth: 4, caption: 'Portrait', label: 'Interior image slot' });
    p2.push(...slot2);
    const cap2 = text(cols[1].x, 314, cols[1].w, copy.caption('culture', 2), { size: 9.5, font: 'lora', italic: true, color: ink, label: 'Image caption', role: 'CAPTION' });
    p2.push(cap2);
    const q = text(cols[1].x, below(cap2, 18), cols[1].w, '“We didn’t rehearse the movement. We rented the room and it arrived.”', { size: 18, font: 'playfair', italic: true, weight: 700, color: red, leading: 1.25, label: 'Pull quote', role: 'DECK' });
    p2.push(q);
    p2.push(rect(cols[1].x, below(q, 10), 60, 3, ink, { label: 'Quote rule', role: 'RULE' }));
    p2.push(...flow(HARLEM_PARAS, [{ x: cols[0].x, w: cols[0].w, top: below(sub, 14) }, { x: cols[1].x, w: cols[1].w, top: below(q, 28) }], 0, 950, { size: 11.5, font: 'lora', color: ink, leading: 1.48 }, 12));
    p2.push(...skyline(1012, 950, ink, false));
    p2.push(rect(0, 1012, W, H - 1012, ink, { label: 'Skyline base' }));
    p2.push(...folio(fr, 'Harlem Renaissance Editorial', '2', paper, { font: 'bebas', size: 11, y: 1028 }));
    return [p1, p2];
  },

  // ── Ukiyo-e — flat colour, contour, the bold crop ────────────────────────────
  ukiyoe: ({ W, H, paper, ink, accent, secondary }) => {
    const gold = secondary, red = accent;
    const seal = (x: number, y: number, s: number, label = 'Seal'): TelaVectorObject[] => [
      rect(x, y, s, s, red, { rx: 4, label, role: 'ORNAMENT' }),
      rect(x + s * .42, y + s * .18, s * .16, s * .64, paper, { label: 'Seal mark' }),
      rect(x + s * .18, y + s * .42, s * .64, s * .16, paper, { label: 'Seal mark' }),
    ];

    // Page 1 — the plate, cropped hard; a cloud band; the wave; the seal.
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p1.push(...imageSlot(0, 0, W, 558, { tone: 'light', caption: 'Print plate', label: 'Plate slot' }));
    p1.push(image(-60, -40, 920, 629, 'https://images.metmuseum.org/CRDImages/as/web-large/DP141063.jpg', 1200, 820, { label: 'CC0 artwork — Hokusai, Under the Wave off Kanagawa — Metropolitan Museum of Art Open Access' }));
    // Cloud band riding the bottom edge of the plate.
    [[-30, 566, 300, 34], [230, 580, 260, 30], [470, 560, 200, 34], [640, 578, 240, 30]].forEach(([x, y, w, h], i) => p1.push(rect(x, y, w, h, gold, { rx: h / 2, label: `Cloud band ${i + 1}` })));
    // Flat-colour wave, cropped off the right and bottom.
    p1.push(path(340, 850, 620, 280, orn.wavePath(1.5, 28, 46), ink, { label: 'Flat wave' }));
    p1.push(path(300, 900, 620, 260, orn.wavePath(1.5, 30, 12, .8), gold, { opacity: .9, label: 'Wave crest line' }));

    const kicker = text(56, 630, 420, 'Print culture · A seasonal review', { size: 10, font: 'notoSansJp', weight: 500, color: ink, tracking: .22, transform: 'uppercase', label: 'Kicker', role: 'LABEL' });
    p1.push(kicker);
    const head = text(56, 652, 560, 'The Floating World, Cropped', { size: 58, font: 'shippori', weight: 700, color: ink, leading: 1.04, label: 'Masthead', role: 'HEADLINE' });
    p1.push(head);
    const deck = text(56, below(head, 14), 400, 'How the publishers, carvers and printers of Edo turned a city’s pleasures into pictures anyone could buy — and why the edge of the frame mattered more than the middle.', { size: 14, font: 'zenKaku', color: ink, leading: 1.55, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    p1.push(text(56, below(deck, 12), 400, 'Words by Hana Petrova', { size: 10, font: 'zenKaku', weight: 500, color: ink, tracking: .12, transform: 'uppercase', label: 'Byline', role: 'LABEL' }));
    // Seal + vertical caption block (stacked short lines).
    p1.push(...seal(724, 652, 36));
    p1.push(text(706, 700, 72, 'Edition\nSpring\nPlate I', { size: 10.5, font: 'notoSansJp', weight: 500, color: ink, align: 'center', leading: 1.7, label: 'Vertical caption block', role: 'CAPTION' }));
    p1.push(vr(742, 774, 60, ink, 1, { label: 'Caption rule' }));
    p1.push(text(56, 972, 250, 'Katsushika Hokusai, Under the Wave off Kanagawa, c. 1830–32. Public domain · The Met Open Access.', { size: 8.5, font: 'notoSansJp', color: ink, leading: 1.45, opacity: .85, label: 'Plate credit', role: 'CAPTION' }));

    // Page 2 — flat band left, vertical label, tall narrow columns.
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p2.push(rect(0, 0, 132, H, ink, { label: 'Flat colour band' }));
    p2.push(text(0, 84, 132, 'The\nFloating\nWorld', { size: 20, font: 'shippori', weight: 700, color: paper, align: 'center', leading: 1.35, label: 'Vertical label', role: 'LABEL' }));
    p2.push(...seal(50, 196, 32, 'Band seal'));
    for (let i = 0; i < 6; i++) p2.push(hr(56, 262 + i * 14, 20, gold, 1.5, { opacity: .8, label: 'Band tick' }));
    p2.push(text(0, 980, 132, 'Two', { size: 12, font: 'shippori', weight: 700, color: paper, align: 'center', label: 'Band folio', role: 'FOLIO' }));

    const fr = frame(W, H, 44, { inner: 180, outer: 56 });
    p2.push(...folio(fr, 'Print culture · Interior', 'Spring review', ink, { font: 'notoSansJp', size: 9, y: 44 }));
    p2.push(hr(fr.x, 62, fr.w, ink, 2, { label: 'Head rule' }));
    p2.push(...imageSlot(fr.x, 76, fr.w, 224, { tone: 'light', caption: 'Landscape plate', label: 'Interior plate slot' }));
    const cap = text(fr.x, 306, fr.w, 'A stretch of coast road printed in two blues, the sky left as bare paper.', { size: 9, font: 'zenKaku', color: ink, label: 'Plate caption', role: 'CAPTION' });
    p2.push(cap);
    const sub = text(fr.x, below(cap, 22), fr.w, 'A publisher’s business, a carver’s hand', { size: 24, font: 'shippori', weight: 700, color: ink, leading: 1.15, label: 'Subhead', role: 'DECK' });
    p2.push(sub);
    p2.push(hr(fr.x, below(sub, 10), 48, red, 3, { label: 'Subhead rule' }));
    const cols = columns(fr.x, fr.w, 2, 28);
    const quote = text(cols[1].x, below(sub, 26), cols[1].w, '“Leave the centre empty. The eye will find the edge.”', { size: 15, font: 'shippori', weight: 700, color: ink, leading: 1.35, label: 'Pull quote', role: 'DECK' });
    p2.push(quote);
    p2.push(...flow(UKIYOE_PARAS, [{ x: cols[0].x, w: cols[0].w, top: below(sub, 26) }, { x: cols[1].x, w: cols[1].w, top: below(quote, 18) }], 0, 990, { size: 11, font: 'zenKaku', color: ink, leading: 1.6 }, 12));
    p2.push(...folio(fr, 'Ukiyo-e print principles', '2', ink, { font: 'notoSansJp', size: 9 }));
    return [p1, p2];
  },

  // ── Islamic geometric design — generative geometry, unity through repetition ─
  'islamic-geometry': ({ W, H, paper, ink, accent, secondary }) => {
    const gold = secondary, blue = accent, teal = ink;
    const star = orn.eightStarPath();

    // Page 1 — tessellated bands top and bottom, a large eight-point star as the title field.
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p1.push(rect(0, 0, W, 84, blue, { label: 'Head band' }));
    p1.push(...orn.starTessellation(12, 6, 792, 72, 72, gold, mix(blue, .18), { label: 'Head tessellation' }));
    p1.push(rect(0, H - 84, W, 84, blue, { label: 'Foot band' }));
    p1.push(...orn.starTessellation(12, H - 78, 792, 72, 72, gold, mix(blue, .18), { label: 'Foot tessellation' }));
    p1.push(rect(40, 108, W - 80, H - 216, 'none', { stroke: gold, strokeWidth: 1, label: 'Gold hairline frame' }));
    p1.push(rect(48, 116, W - 96, H - 232, 'none', { stroke: teal, strokeWidth: .6, opacity: .7, label: 'Inner hairline' }));
    // Corner stars.
    [[60, 128], [W - 104, 128], [60, H - 172], [W - 104, H - 172]].forEach(([x, y], i) => p1.push(path(x, y, 44, 44, star, gold, { label: `Corner star ${i + 1}` })));
    // The generative star.
    const cx = W / 2, cyy = 508;
    p1.push(...orn.rings(cx, cyy, [292, 304], gold, 1, { opacity: .8, label: 'Interlaced ring' }));
    p1.push(...orn.rings(cx, cyy, [268], teal, .8, { opacity: .6, label: 'Inner ring' }));
    p1.push(path(cx - 250, cyy - 250, 500, 500, star, alpha(teal, .10), { stroke: gold, strokeWidth: 2, label: 'Eight-point star field' }));
    p1.push(path(cx - 170, cyy - 170, 340, 340, star, 'none', { stroke: blue, strokeWidth: 1.2, rotation: 22.5, label: 'Rotated inner star' }));
    p1.push(path(cx - 44, cyy - 320, 88, 88, star, blue, { label: 'Apex star' }));
    p1.push(path(cx - 30, cyy + 250, 60, 60, star, gold, { label: 'Base star' }));

    const kicker = text(cx - 200, 398, 400, 'Geometry · Pattern · Proof', { size: 11, font: 'reemKufi', color: teal, align: 'center', tracking: .24, transform: 'uppercase', label: 'Kicker', role: 'LABEL' });
    p1.push(kicker);
    const head = text(cx - 220, below(kicker, 12), 440, 'Infinite from Finite', { size: 60, font: 'amiri', weight: 700, color: teal, align: 'center', leading: 1.02, label: 'Masthead', role: 'HEADLINE' });
    p1.push(head);
    p1.push(hr(cx - 40, below(head, 10), 80, gold, 2, { label: 'Title rule' }));
    const deck = text(cx - 165, below(head, 22), 330, 'A single compass, a straightedge, and a grid that never ends: the construction behind a thousand years of surface.', { size: 13, font: 'cairo', color: teal, align: 'center', leading: 1.5, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    p1.push(text(cx - 165, below(deck, 12), 330, copy.byline('science', 1), { size: 9.5, font: 'reemKufi', color: blue, align: 'center', tracking: .14, transform: 'uppercase', label: 'Byline', role: 'LABEL' }));
    p1.push(text(cx - 240, 938, 480, 'Eight-point stars and crosses on a square grid — the same unit repeated top and foot', { size: 9, font: 'cairo', color: teal, align: 'center', tracking: .04, label: 'Pattern caption', role: 'CAPTION' }));

    // Page 2 — a star frieze rail at the left, gold hairline frame, two columns.
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p2.push(rect(36, 36, W - 72, H - 72, 'none', { stroke: gold, strokeWidth: 1, label: 'Gold hairline frame' }));
    p2.push(...orn.starTessellation(46, 46, 40, H - 92, 40, gold, undefined, { label: 'Star rail' }));
    p2.push(vr(98, 46, H - 92, teal, .8, { opacity: .6, label: 'Rail rule' }));
    const fr = frame(W, H, 48, { inner: 116, outer: 52 });
    p2.push(...folio(fr, 'Infinite from Finite', 'Pattern · 2', teal, { font: 'reemKufi', size: 9, y: 50 }));
    p2.push(hr(fr.x, 66, fr.w, teal, 1, { label: 'Head rule' }));
    const head2 = text(fr.x, 84, fr.w, 'Drawing the grid before the star', { size: 30, font: 'amiri', weight: 700, color: teal, leading: 1.1, label: 'Interior title', role: 'DECK' });
    p2.push(head2);
    const cols = columns(fr.x, fr.w, 2, 26);
    // Column 1: pull quote framed by gold rules, then body.
    let y = below(head2, 18);
    p2.push(hr(cols[0].x, y, cols[0].w, gold, 1.5, { label: 'Quote rule' }));
    const q = text(cols[0].x, y + 12, cols[0].w, '“The star is never drawn. It is what remains when the lines are extended.”', { size: 17, font: 'amiri', weight: 700, color: blue, leading: 1.3, label: 'Pull quote', role: 'DECK' });
    p2.push(q);
    p2.push(hr(cols[0].x, below(q, 12), cols[0].w, gold, 1.5, { label: 'Quote rule' }));
    // Column 2: image slot + caption + subhead.
    const slot = imageSlot(cols[1].x, y, cols[1].w, 200, { tone: 'light', frame: gold, frameWidth: 1.5, caption: 'Tilework detail', label: 'Interior image slot' });
    p2.push(...slot);
    const cap = text(cols[1].x, y + 208, cols[1].w, 'Cut-tile mosaic, detail of a spandrel; the grid is visible in the grout.', { size: 9, font: 'cairo', color: teal, label: 'Image caption', role: 'CAPTION' });
    p2.push(cap);
    const sub = text(cols[1].x, below(cap, 16), cols[1].w, 'Unit, grid, repeat', { size: 11, font: 'reemKufi', color: blue, tracking: .16, transform: 'uppercase', label: 'Subhead', role: 'LABEL' });
    p2.push(sub);
    p2.push(...flow(GEOMETRY_PARAS, [{ x: cols[0].x, w: cols[0].w, top: below(q, 34) }, { x: cols[1].x, w: cols[1].w, top: below(sub, 8) }], 0, 980, { size: 11, font: 'cairo', color: teal, leading: 1.55 }, 12));
    p2.push(...folio(fr, 'Islamic geometric design', '2', teal, { font: 'reemKufi', size: 9, y: 994 }));
    return [p1, p2];
  },

  // ── Mughal album page — the borders ARE the design ───────────────────────────
  mughal: ({ W, H, paper, ink, accent, secondary }) => {
    const gold = secondary, red = accent, green = ink;
    const leaf = orn.leafPath();

    // Page 1 — album opener: nested borders, botanical margin, central field with an ogee head.
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p1.push(rect(28, 28, W - 56, H - 56, 'none', { stroke: green, strokeWidth: 1, label: 'Border rule 1' }));
    p1.push(rect(38, 38, W - 76, H - 76, 'none', { stroke: gold, strokeWidth: 9, label: 'Gold band' }));
    p1.push(rect(50, 50, W - 100, H - 100, 'none', { stroke: red, strokeWidth: 1.5, label: 'Border rule 2' }));
    p1.push(rect(58, 58, W - 116, H - 116, 'none', { stroke: green, strokeWidth: 3, label: 'Border rule 3' }));
    p1.push(rect(66, 66, W - 132, H - 132, 'none', { stroke: gold, strokeWidth: .75, label: 'Border rule 4' }));
    p1.push(rect(100, 100, W - 200, H - 200, 'none', { stroke: green, strokeWidth: .75, label: 'Inner field rule' }));
    // Botanical margin — leaf sprays and tiny gold dots in the zone between rule 4 and the inner field.
    p1.push(...orn.frieze(100, 74, W - 200, 18, leaf, green, 14, { opacity: .75, label: 'Leaf spray (head)' }));
    p1.push(...orn.frieze(100, H - 92, W - 200, 18, leaf, green, 14, { opacity: .75, label: 'Leaf spray (foot)' }));
    for (let i = 0; i < 21; i++) {
      const y = 108 + i * 40;
      p1.push(path(74, y, 18, 18, leaf, green, { opacity: .75, rotation: -90, label: 'Leaf spray (outer)' }));
      p1.push(path(W - 92, y, 18, 18, leaf, green, { opacity: .75, rotation: 90, label: 'Leaf spray (inner)' }));
      if (i < 20) { p1.push(circle(83, y + 29, 1.6, gold, { label: 'Floral dot' })); p1.push(circle(W - 83, y + 29, 1.6, gold, { label: 'Floral dot' })); }
    }
    // Image field.
    p1.push(text(176, 118, 464, 'Folio Twelve · Verso', { size: 11, font: 'amiri', color: green, align: 'center', tracking: .22, transform: 'uppercase', label: 'Folio label', role: 'LABEL' }));
    p1.push(path(176, 150, 464, 90, orn.ogeeArchPath(), alpha(green, .08), { stroke: gold, strokeWidth: 1.5, label: 'Ogee head' }));
    p1.push(...imageSlot(176, 240, 464, 476, { tone: 'light', caption: 'Miniature field', label: 'Miniature field' }));
    p1.push(vr(176, 240, 476, gold, 1.5, { label: 'Field rule' }), vr(640, 240, 476, gold, 1.5, { label: 'Field rule' }), hr(176, 716, 464, gold, 1.5, { label: 'Field rule' }));
    const head = text(140, 746, 536, 'An Album of Quiet Hours', { size: 46, font: 'cormorant', weight: 600, color: green, align: 'center', leading: 1.05, label: 'Masthead', role: 'HEADLINE' });
    p1.push(head);
    p1.push(hr(W / 2 - 60, below(head, 10), 120, gold, 1, { label: 'Title rule' }));
    const deck = text(176, below(head, 22), 464, 'Leaves from a courtly album: pictures set in windows of thick paper, ruled in gold, and margined with flowering sprays by the workshop’s specialists.', { size: 13, font: 'ebGaramond', italic: true, color: green, align: 'center', leading: 1.45, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    p1.push(text(176, below(deck, 14), 464, 'Opaque watercolour and gold on paper · borders ruled by hand', { size: 9, font: 'amiri', color: red, align: 'center', tracking: .12, transform: 'uppercase', label: 'Medium line', role: 'CAPTION' }));

    // Page 2 — the same border system, lighter; text inside; smaller image field top-right.
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p2.push(rect(28, 28, W - 56, H - 56, 'none', { stroke: green, strokeWidth: 1, label: 'Border rule 1' }));
    p2.push(rect(38, 38, W - 76, H - 76, 'none', { stroke: gold, strokeWidth: 6, label: 'Gold band' }));
    p2.push(rect(52, 52, W - 104, H - 104, 'none', { stroke: green, strokeWidth: 2, label: 'Border rule 2' }));
    p2.push(...orn.frieze(84, 60, W - 168, 14, leaf, green, 18, { opacity: .7, label: 'Leaf spray (head)' }));
    p2.push(...orn.frieze(84, H - 74, W - 168, 14, leaf, green, 18, { opacity: .7, label: 'Leaf spray (foot)' }));
    const fr = frame(W, H, 84);
    p2.push(...folio(fr, 'An Album of Quiet Hours', 'Folio Thirteen', green, { font: 'amiri', size: 9, y: 86 }));
    p2.push(hr(fr.x, 102, fr.w, gold, 1, { label: 'Head rule' }));
    const cols = columns(fr.x, fr.w, 2, 26);
    const sub = text(cols[0].x, 120, cols[0].w, 'The kitabkhana at work', { size: 26, font: 'cormorant', weight: 600, color: green, leading: 1.1, label: 'Subhead', role: 'DECK' });
    p2.push(sub);
    p2.push(hr(cols[0].x, below(sub, 8), 40, red, 1.5, { label: 'Subhead rule' }));
    p2.push(path(cols[1].x, 120, cols[1].w, 56, orn.ogeeArchPath(), alpha(green, .08), { stroke: gold, strokeWidth: 1.2, label: 'Ogee head' }));
    p2.push(...imageSlot(cols[1].x, 176, cols[1].w, 216, { tone: 'light', caption: 'Miniature field', label: 'Interior miniature field' }));
    p2.push(vr(cols[1].x, 176, 216, gold, 1.2, { label: 'Field rule' }), vr(cols[1].x + cols[1].w, 176, 216, gold, 1.2, { label: 'Field rule' }), hr(cols[1].x, 392, cols[1].w, gold, 1.2, { label: 'Field rule' }));
    const cap = text(cols[1].x, 400, cols[1].w, 'A border of poppies and irises around an older portrait, remounted for the album.', { size: 9, font: 'ebGaramond', italic: true, color: green, label: 'Field caption', role: 'CAPTION' });
    p2.push(cap);
    p2.push(...flow(MUGHAL_PARAS, [{ x: cols[0].x, w: cols[0].w, top: below(sub, 24) }, { x: cols[1].x, w: cols[1].w, top: below(cap, 18) }], 0, 940, { size: 11.5, font: 'ebGaramond', color: green, leading: 1.48 }, 12));
    p2.push(...folio(fr, 'Mughal album page', '13', green, { font: 'amiri', size: 9, y: 954 }));
    return [p1, p2];
  },

  // ── Mexican modern graphic — public voice, woodcut force, mural scale ────────
  'mexican-modern': ({ W, H, paper, ink, accent, secondary }) => {
    const rosa = ink, teal = accent, black = secondary;

    // Page 1 — poster.
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p1.push(...orn.radialLines(700, 150, 124, 236, 24, black, 9, { label: 'Sun ray' }));
    p1.push(circle(700, 150, 112, teal, { label: 'Sun disc' }));
    p1.push(circle(700, 150, 66, rosa, { label: 'Sun core' }));
    p1.push(rect(0, 0, 16, H, rosa, { label: 'Edge bar' }));
    const kicker = text(56, 246, 620, 'Open workshop · Prints for the public square', { size: 16, font: 'oswald', weight: 600, color: black, tracking: .16, transform: 'uppercase', label: 'Kicker', role: 'LABEL' });
    p1.push(kicker);
    p1.push(rect(56, 282, 620, 7, black, { rotation: -1.2, label: 'Woodcut rule' }));
    p1.push(rect(40, 306, 400, 92, rosa, { rotation: -1.5, label: 'Flat colour block' }));
    const head = text(56, 300, 640, 'The press belongs to the street', { size: 96, font: 'anton', color: black, leading: .95, transform: 'uppercase', label: 'Headline', role: 'HEADLINE' });
    p1.push(head);
    p1.push(rect(56, below(head, 20), 620, 7, black, { rotation: 1, label: 'Woodcut rule' }));
    const deck = text(56, below(head, 44), 420, 'Linocuts, broadsides and calendars made for the people who read them on walls, not in galleries. One press, one afternoon, everyone prints.', { size: 15, font: 'bitter', color: black, leading: 1.4, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    p1.push(path(626, below(head, 36), 116, 116, orn.starPath(5, .45), teal, { rotation: 12, label: 'Hand-cut star' }));
    p1.push(rect(-20, 858, W + 40, 96, black, { rotation: -1.5, label: 'Woodcut band' }));
    p1.push(text(56, 892, 700, 'Saturday at the Plaza · Demonstrations from noon', { size: 22, font: 'oswald', weight: 500, color: paper, tracking: .1, transform: 'uppercase', rotation: -1.5, wrap: false, label: 'Band line', role: 'DECK' }));
    p1.push(rect(0, 980, W, H - 980, teal, { label: 'Foot band' }));
    p1.push(text(56, 1008, 460, 'Presented by the neighbourhood print collective', { size: 11, font: 'oswald', weight: 500, color: paper, tracking: .14, transform: 'uppercase', label: 'Presenter', role: 'FOLIO' }));
    p1.push(text(516, 1008, 244, 'Free · All ages', { size: 11, font: 'oswald', weight: 500, color: paper, tracking: .14, transform: 'uppercase', align: 'right', label: 'Admission', role: 'FOLIO' }));

    // Page 2 — heavy rules, flat block quote.
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p2.push(rect(0, 0, 16, H, rosa, { label: 'Edge bar' }));
    const fr = frame(W, H, 56);
    p2.push(rect(fr.x, 40, fr.w, 10, black, { label: 'Head rule' }));
    p2.push(...folio(fr, 'The press belongs to the street', 'No. 4 · Page 2', black, { font: 'oswald', size: 11, y: 60 }));
    p2.push(rect(fr.x, 78, fr.w, 3, black, { label: 'Head rule (thin)' }));
    const cols = columns(fr.x, fr.w, 2, 30);
    const sub = text(cols[0].x, 104, cols[0].w, 'A workshop, not a studio', { size: 30, font: 'anton', color: black, leading: 1, transform: 'uppercase', label: 'Subhead', role: 'DECK' });
    p2.push(sub);
    p2.push(rect(cols[0].x, below(sub, 10), cols[0].w, 5, black, { label: 'Subhead rule' }));
    p2.push(...imageSlot(cols[1].x, 104, cols[1].w, 226, { tone: 'light', frame: black, frameWidth: 6, caption: 'Linocut', label: 'Print slot' }));
    const cap = text(cols[1].x, 338, cols[1].w, 'Linocut, printed by hand on newsprint; edition unnumbered.', { size: 9, font: 'oswald', weight: 500, color: black, tracking: .08, transform: 'uppercase', label: 'Print caption', role: 'CAPTION' });
    p2.push(cap);
    const qy = below(cap, 16);
    p2.push(rect(cols[1].x, qy, cols[1].w, 132, teal, { label: 'Block quote field' }));
    p2.push(text(cols[1].x + 18, qy + 18, cols[1].w - 36, '“A print is cheap on purpose. That is its politics.”', { size: 22, font: 'anton', color: paper, leading: 1.1, transform: 'uppercase', label: 'Block quote', role: 'DECK' }));
    p2.push(...flow(MEXICAN_PARAS, [{ x: cols[0].x, w: cols[0].w, top: below(sub, 28) }, { x: cols[1].x, w: cols[1].w, top: qy + 150 }], 0, 960, { size: 11.5, font: 'bitter', color: black, leading: 1.45 }, 12));
    p2.push(rect(fr.x, 982, fr.w, 10, black, { label: 'Foot rule' }));
    p2.push(text(fr.x, 1004, fr.w / 2, 'Mexican modern graphic', { size: 10, font: 'oswald', weight: 500, color: black, tracking: .14, transform: 'uppercase', label: 'Running foot', role: 'FOLIO' }));
    p2.push(rect(fr.right - 30, 1000, 30, 30, black, { label: 'Folio square' }));
    p2.push(text(fr.right - 30, 1006, 30, '2', { size: 16, font: 'anton', color: paper, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
    return [p1, p2];
  },

  // ── Tropical modernism — brise-soleil, shade, breeze ─────────────────────────
  'tropical-modern': ({ W, H, paper, ink, accent, secondary }) => {
    const green = ink, orange = accent, slate = secondary, concrete = '#B4AFA3';
    const shadow = alpha(slate, .22);

    // Page 1 — louvre field on the right half, title in the shade.
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    p1.push(rect(400, 96, 460, 26, concrete, { label: 'Canopy slab' }));
    p1.push(rect(406, 122, 460, 8, shadow, { label: 'Canopy shadow' }));
    for (let i = 0; i < 15; i++) {
      const lx = 430 + i * 27, lw = i % 2 ? 9 : 15;
      p1.push(rect(lx + 5, 138, lw, 630, shadow, { label: 'Louvre shadow' }));
      p1.push(rect(lx, 130, lw, 630, concrete, { label: `Louvre ${i + 1}` }));
    }
    p1.push(vr(416, 130, 630, slate, 1, { label: 'Dimension line' }), hr(410, 130, 12, slate, 1, { label: 'Dimension tick' }), hr(410, 760, 12, slate, 1, { label: 'Dimension tick' }));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) p1.push(rect(440 + c * 24, 792 + r * 24, 18, 18, 'none', { stroke: slate, strokeWidth: 1, label: 'Screen block' }));
    p1.push(circle(742, 846, 46, orange, { label: 'Sun' }));
    p1.push(text(600, 776, 200, 'Pitch 27 · Depth 15 · Fixed', { size: 8.5, font: 'dmMono', color: slate, align: 'right', tracking: .1, transform: 'uppercase', label: 'Louvre data label', role: 'LABEL' }));

    const kicker = text(64, 136, 330, 'Climate · Shade · Civic ambition', { size: 10, font: 'dmMono', weight: 500, color: slate, tracking: .18, transform: 'uppercase', label: 'Kicker', role: 'LABEL' });
    p1.push(kicker);
    p1.push(hr(64, 158, 330, green, 1, { label: 'Kicker rule' }));
    const head = text(64, 172, 340, 'Building in the Shade of the Sun', { size: 62, font: 'epilogue', weight: 800, color: green, leading: 1.0, label: 'Headline', role: 'HEADLINE' });
    p1.push(head);
    const deck = text(64, below(head, 24), 300, 'A modernism that measured itself against the sun: louvres ahead of the glass, corridors that breathe, and concrete that stays cool to the touch.', { size: 14, font: 'workSans', color: slate, leading: 1.5, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    p1.push(text(64, below(deck, 14), 300, 'Words by Jonas Ekblad', { size: 9, font: 'dmMono', color: slate, tracking: .12, transform: 'uppercase', label: 'Byline', role: 'LABEL' }));
    p1.push(rect(64, 896, 300, 64, alpha(slate, .08), { label: 'Plinth' }));
    p1.push(text(80, 910, 268, 'Orientation · Long axis east–west', { size: 9, font: 'dmMono', color: slate, tracking: .06, transform: 'uppercase', label: 'Data line 1', role: 'LABEL' }));
    p1.push(text(80, 932, 268, 'Ventilation · Both facades open', { size: 9, font: 'dmMono', color: slate, tracking: .06, transform: 'uppercase', label: 'Data line 2', role: 'LABEL' }));
    p1.push(text(64, 1016, 400, 'Tropical modernism · Opener', { size: 9, font: 'dmMono', color: slate, tracking: .14, transform: 'uppercase', label: 'Running foot', role: 'FOLIO' }));

    // Page 2 — louvre rail as running head, two columns, data micro-labels.
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    for (let i = 0; i < 41; i++) p2.push(rect(64 + i * 17, 40, i % 2 ? 4 : 8, 34, concrete, { label: 'Rail louvre' }));
    const fr = frame(W, H, 64);
    p2.push(...folio(fr, 'Building in the Shade of the Sun', 'Interior · 2', slate, { font: 'dmMono', size: 9, y: 86 }));
    p2.push(hr(fr.x, 104, fr.w, green, 1, { label: 'Head rule' }));
    const cols = columns(fr.x, fr.w, 2, 32);
    const sub = text(cols[0].x, 126, cols[0].w, 'Shade is a structural material', { size: 24, font: 'epilogue', weight: 700, color: green, leading: 1.15, label: 'Subhead', role: 'DECK' });
    p2.push(sub);
    p2.push(...imageSlot(cols[1].x, 126, cols[1].w, 210, { tone: 'light', frame: concrete, frameWidth: 6, caption: 'Facade', label: 'Facade slot' }));
    const cap = text(cols[1].x, 344, cols[1].w, 'West facade, late afternoon; the louvres carry the shadow down the wall.', { size: 8.5, font: 'dmMono', color: slate, leading: 1.4, label: 'Facade caption', role: 'CAPTION' });
    p2.push(cap);
    let dy = below(cap, 12);
    [['Depth', '15 cm'], ['Pitch', '27 cm'], ['Shade factor', '0.62']].forEach(([k, v], i) => {
      p2.push(hr(cols[1].x, dy, cols[1].w, alpha(slate, .35), 1, { label: 'Data rule' }));
      p2.push(text(cols[1].x, dy + 5, cols[1].w / 2, k, { size: 8.5, font: 'dmMono', color: slate, tracking: .1, transform: 'uppercase', label: `Data key ${i + 1}`, role: 'LABEL' }));
      p2.push(text(cols[1].x + cols[1].w / 2, dy + 5, cols[1].w / 2, v, { size: 8.5, font: 'dmMono', weight: 500, color: green, align: 'right', label: `Data value ${i + 1}`, role: 'LABEL' }));
      dy += 20;
    });
    p2.push(...flow(TROPICAL_PARAS, [{ x: cols[0].x, w: cols[0].w, top: below(sub, 18) }, { x: cols[1].x, w: cols[1].w, top: dy + 12 }], 0, 940, { size: 11, font: 'workSans', color: slate, leading: 1.55 }, 12));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) p2.push(rect(fr.right - 88 + c * 22, 956 + r * 22, 16, 16, 'none', { stroke: slate, strokeWidth: 1, label: 'Screen block' }));
    p2.push(...folio(fr, 'Tropical modernism', '2', slate, { font: 'dmMono', size: 9 }));
    return [p1, p2];
  },

  // ── Indigenous contemporary editorial — context first, no borrowed motifs ────
  'indigenous-contemporary': ({ W, H, paper, ink, accent, secondary }) => {
    const green = ink, rust = accent, blue = secondary;
    const m = 72, fr = frame(W, H, m);

    // Page 1 — respectful opener: headline, deck, the five-field context block, licensed artwork slot.
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    const kicker = text(m, m, fr.w, 'Context first · An editorial frame', { size: 11, font: 'lexend', weight: 600, color: green, tracking: .18, transform: 'uppercase', label: 'Kicker', role: 'LABEL' });
    p1.push(kicker);
    const head = text(m, below(kicker, 12), 520, 'Context Before Image', { size: 54, font: 'lexend', weight: 700, color: green, leading: 1.05, label: 'Headline', role: 'HEADLINE' });
    p1.push(head);
    const deck = text(m, below(head, 18), 460, 'A frame that asks five questions before a single picture is placed — and prints the answers where the reader will see them first.', { size: 16, font: 'alegreya', italic: true, color: blue, leading: 1.45, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    const blockTop = below(deck, 28);
    p1.push(hr(m, blockTop, fr.w, rust, 2, { label: 'Block rule' }));
    let y = blockTop + 18;
    CONTEXT_FIELDS.forEach(([k, v], i) => {
      p1.push(rect(m, y + 3, 6, 6, rust, { label: 'Field mark' }));
      const lab = text(m + 14, y, 176, k, { size: 9, font: 'dmMono', weight: 500, color: blue, tracking: .12, transform: 'uppercase', leading: 1.4, label: `Field label ${i + 1}`, role: 'LABEL' });
      const val = text(m + 200, y - 2, fr.w - 200, v, { size: 12.5, font: 'alegreya', color: green, leading: 1.45, label: `Field ${i + 1}`, role: 'BODY' });
      p1.push(lab, val);
      y = Math.max(below(lab), below(val)) + 12;
      p1.push(hr(m, y, fr.w, alpha(green, i === CONTEXT_FIELDS.length - 1 ? .6 : .25), i === CONTEXT_FIELDS.length - 1 ? 1.5 : 1, { label: 'Field rule' }));
      y += 14;
    });
    p1.push(...orn.frameCorners(m - 12, blockTop - 12, fr.w + 24, y - blockTop + 10, 18, rust, 10));
    const slotTop = y + 30, slotH = 964 - slotTop;
    p1.push(...imageSlot(m, slotTop, fr.w, slotH, { tone: 'light', caption: 'Licensed artwork · credit below', label: 'Licensed artwork slot' }));
    p1.push(text(m, 972, fr.w, 'Credit: living artists named first; title, year, medium; licence and permission holder. Reproduced with the community’s permission.', { size: 8.5, font: 'dmMono', color: blue, leading: 1.45, label: 'Artwork credit', role: 'CAPTION' }));
    p1.push(...folio(fr, 'Indigenous contemporary editorial', 'Opener', blue, { font: 'lexend', size: 9, y: 1014 }));

    // Page 2 — the field rail at left, two columns, credit foot.
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper', role: 'GROUND' })];
    const fr2 = frame(W, H, 48, { inner: 232, outer: 56 });
    p2.push(...folio(frame(W, H, 44, { inner: 48, outer: 56 }), 'Context Before Image', 'Interior · 2', blue, { font: 'lexend', size: 9, y: 44 }));
    p2.push(hr(48, 62, W - 104, rust, 1.5, { label: 'Head rule' }));
    // Field rail.
    let ry = 110;
    CONTEXT_FIELDS.forEach(([k], i) => {
      p2.push(hr(48, ry, 150, rust, 1.5, { label: 'Rail rule' }));
      const lab = text(48, ry + 8, 150, k, { size: 8.5, font: 'dmMono', weight: 500, color: blue, tracking: .1, transform: 'uppercase', leading: 1.45, label: `Rail label ${i + 1}`, role: 'LABEL' });
      p2.push(lab);
      ry = below(lab, 36);
    });
    p2.push(vr(214, 110, 820, alpha(green, .3), 1, { label: 'Rail divider' }));
    const sub = text(fr2.x, 110, fr2.w, 'Protocol is part of the design brief', { size: 22, font: 'lexend', weight: 700, color: green, leading: 1.15, label: 'Subhead', role: 'DECK' });
    p2.push(sub);
    const cols = columns(fr2.x, fr2.w, 2, 24);
    p2.push(...imageSlot(cols[1].x, below(sub, 18), cols[1].w, 170, { tone: 'light', caption: 'Licensed artwork', label: 'Interior artwork slot' }));
    const cap = text(cols[1].x, below(sub, 18) + 176, cols[1].w, 'Artist, title, year, medium · reproduced under licence', { size: 8, font: 'dmMono', color: blue, leading: 1.4, label: 'Artwork credit', role: 'CAPTION' });
    p2.push(cap);
    p2.push(...flow(INDIGENOUS_PARAS, [{ x: cols[0].x, w: cols[0].w, top: below(sub, 18) }, { x: cols[1].x, w: cols[1].w, top: below(cap, 14) }], 0, 930, { size: 11.5, font: 'alegreya', color: green, leading: 1.5 }, 12));
    p2.push(hr(48, 950, W - 104, rust, 1.5, { label: 'Credit foot rule' }));
    p2.push(text(48, 960, W - 104, 'Credits & permissions — Every image on this spread is reproduced with the written permission of the artist and the community named in the rail. Permissions are reviewed before each reprint.', { size: 8.5, font: 'dmMono', color: blue, leading: 1.45, label: 'Credit foot', role: 'CAPTION' }));
    p2.push(...folio(frame(W, H, 44, { inner: 48, outer: 56 }), 'Indigenous contemporary editorial', '2', blue, { font: 'lexend', size: 9 }));
    return [p1, p2];
  },
};

// ── Lessons ───────────────────────────────────────────────────────────────────

export const LESSONS: Record<string, DesignLesson> = {
  harlem: {
    principle: 'Rhythm is a layout tool: the stack of unequal rules under the masthead is a rhythm chart, and the portrait sits where the spotlight tells the eye to land.',
    history: 'The Harlem Renaissance (c. 1918 to the mid-1930s) was a flowering of Black literature, music, theatre and visual art centred on Harlem, carried by magazines such as The Crisis and Opportunity and by anthologies like Alain Locke’s The New Negro (1925). Aaron Douglas, its leading graphic artist, illustrated those magazines and the 1926 journal Fire!! with flat silhouetted figures, concentric bands of light and stepped, angular geometry that fused African sculpture, Art Deco and jazz. That visual language — bold contour, syncopated repetition, portraiture as self-definition — shaped a century of Black editorial design.',
    tryThis: 'Rewrite the beat of the syncopated rules: make every third rule the longest and see how the masthead above it changes tempo.',
    interestTag: 'Harlem Renaissance',
    related: ['Aaron Douglas', 'jazz age graphics', 'African American literature', 'editorial design'],
  },
  ukiyoe: {
    principle: 'Crop hard and keep the colour flat: the plate is placed so its edges, not its centre, carry the composition, and the type stays quiet beneath it.',
    history: 'Ukiyo-e, “pictures of the floating world”, were woodblock prints made in Edo-period Japan (1603–1868) by a division of labour: a publisher commissioned the design, a carver cut a key block and one block per colour, and a printer pulled the sheets by hand. Full-colour nishiki-e prints appeared from the 1760s; Katsushika Hokusai’s Thirty-six Views of Mount Fuji (c. 1830–32), including Under the Wave off Kanagawa, and Utagawa Hiroshige’s Fifty-three Stations of the Tōkaidō (1833–34) made landscape the medium’s great subject, aided by newly imported Prussian blue. Exported to Europe after the 1850s, the prints’ flat colour, contour and off-centre cropping reshaped Impressionist and Art Nouveau design.',
    tryThis: 'Drag the plate so a different edge of the wave leaves the page, then move the seal to balance the new crop.',
    interestTag: 'Ukiyo-e',
    related: ['Hokusai', 'Hiroshige', 'Japanese woodblock prints', 'Japonisme'],
  },
  'islamic-geometry': {
    principle: 'Design the unit, then the repeat: one eight-point star on a square grid generates the head band, the foot band and the title field, so the whole page shares a single construction.',
    history: 'Geometric ornament in Islamic art grew from the 8th century onward across a vast region, as artisans working with compass and straightedge developed star-and-polygon patterns (girih) that could tile any surface without a centre. The Nasrid palaces of the Alhambra in Granada (13th–14th c.), Timurid workshops whose constructions survive in the Topkapı Scroll, and the Safavid mosques of Isfahan show the same grammar in stucco, tile and wood. Pattern was passed down through workshop practice and drawings long before mathematicians described its symmetry groups.',
    tryThis: 'Change the tessellation cell size in the head band and rebuild the foot band to match — notice how the count of stars, not their shape, changes the page’s weight.',
    interestTag: 'Islamic geometric design',
    related: ['girih', 'Alhambra', 'Isfahan', 'tessellation'],
  },
  mughal: {
    principle: 'The borders are the design: five rules of different weights and a gold band make a frame that holds a small picture with enormous authority.',
    history: 'The Mughal imperial workshop, the kitabkhana, produced illustrated manuscripts and albums (muraqqa) under Akbar (r. 1556–1605), Jahangir (r. 1605–27) and Shah Jahan (r. 1628–58). Paintings were trimmed, remounted in windows of thick paper and surrounded by ruled and gilded borders; under Shah Jahan those margins filled with precisely observed flowering plants. Named artists such as Abu’l Hasan, Bichitr and the naturalist Mansur worked alongside specialist border painters, gilders and calligraphers, so a single album opening was the work of many hands across decades.',
    tryThis: 'Remove one of the five border rules and add its weight to a neighbour — the frame should still read as nested, not as a single fat line.',
    interestTag: 'Mughal album page',
    related: ['muraqqa', 'kitabkhana', 'South Asian manuscripts', 'botanical borders'],
  },
  'mexican-modern': {
    principle: 'Size everything for the distance it will be read from: the headline works from across a plaza, the black band from a passing tram, the body copy from arm’s length.',
    history: 'Mexican modern graphics grew from the broadsides of José Guadalupe Posada and the public muralism of Rivera, Orozco and Siqueiros into a print movement with a civic mission. The Taller de Gráfica Popular, founded in Mexico City in 1937 by Leopoldo Méndez, Pablo O’Higgins and Luis Arenal, produced linocuts, lithographs and posters for unions, literacy campaigns and anti-fascist causes, often signed collectively; Elizabeth Catlett joined the workshop in the 1940s. Its language of heavy black contour, flat colour and condensed capitals became the model for socially engaged printmaking across the Americas.',
    tryThis: 'Set the headline one size larger until a word breaks badly, then fix the break by changing the words, not the size — that is how poster copy is written.',
    interestTag: 'Mexican modern graphics',
    related: ['Taller de Gráfica Popular', 'Posada', 'linocut', 'poster design'],
  },
  'tropical-modern': {
    principle: 'Shade is a material: the louvre field on the right does the structural work, and the title sits in the shadow it casts.',
    history: 'Tropical modernism names several regional modernisms of the 1940s–70s that adapted the International Style to hot climates. In West Africa, Maxwell Fry and Jane Drew designed schools and colleges in the Gold Coast (Ghana) and Nigeria, worked with Le Corbusier at Chandigarh, and codified their approach in Tropical Architecture in the Humid Zone (1956); in Ceylon (Sri Lanka), Geoffrey Bawa built a more lyrical version that merged courtyards, verandas and planting with concrete frames. Brise-soleil screens, cross-ventilation and deep overhangs came from climate, but the civic ambition came from newly independent nations building universities, parliaments and ministries.',
    tryThis: 'Change the louvre pitch from 27 to 40 and widen every other blade; the shadow rhythm should still read as one screen.',
    interestTag: 'Tropical modernism',
    related: ['Maxwell Fry & Jane Drew', 'Geoffrey Bawa', 'brise-soleil', 'climate-responsive design'],
  },
  'indigenous-contemporary': {
    principle: 'Context before image: the five-field block sits above the artwork so community, language, land, protocol and credit are read before the picture is.',
    history: 'Contemporary Indigenous publishing rests on protocol rather than a shared visual style: there is no pan-Indigenous motif, and borrowing one is the error this template is built to prevent. Frameworks such as Australia’s Indigenous Art Code (2010), the Local Contexts Traditional Knowledge Labels developed with communities since 2010, and the CARE Principles for Indigenous Data Governance (2019) all insist on the same things — a named community, its own language and spelling, permission for what is shown and where, and living artists credited and paid. The page here is deliberately typographic so that the only imagery is licensed work chosen by the people it belongs to.',
    tryThis: 'Fill the five fields for a real project you have permission to publish, then decide whether the artwork slot should be smaller than the field block — often it should.',
    interestTag: 'Indigenous contemporary art',
    related: ['cultural protocol', 'Indigenous sovereignty', 'Traditional Knowledge Labels', 'ethical publishing'],
  },
};

// ── Overrides ─────────────────────────────────────────────────────────────────

export const OVERRIDES: Record<string, Partial<TelaStyleEra>> = {
  // The brief asks for rosa mexicano with teal, ochre and black; the library's red reads as generic. Keep ochre paper and black.
  'mexican-modern': { palette: ['#F0D6A4', '#D9396A', '#176B61', '#28221F'] },
};
