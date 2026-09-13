// counterculture — hand-designed style-era documents (see docs/tela/TEMPLATE_DESIGN_BRIEF.md).
//
// Six movements that broke the page on purpose: Dada, Psychedelic, Punk, New Wave,
// Memphis, Grunge. Every opener is a poster moment; every interior is still a page
// someone can write in — the disruption lives in the head, the rails and the feet.
import type { TelaVectorObject } from '../../../types';
import type { DesignLesson, EraDesigner } from '../types';
import type { TelaStyleEra } from '../../../telaStyleEraLibrary';
import { rect, circle, hr, vr, path, text, below, imageSlot, columns, alpha, mix } from '../../templateKit';
import { copy } from '../../copy';
import * as orn from '../../ornaments';

type Objs = TelaVectorObject[];
const ground = (W: number, H: number, paper: string) => rect(0, 0, W, H, paper, { label: 'Ground', role: 'GROUND' });
const SEMICIRCLE = 'M0 100 A50 50 0 0 1 100 100 Z';
const SEMI_ORIGIN = { x: 0, y: 50, w: 100, h: 50 };

// ─────────────────────────────────────────────────────────────────────────────
// DADA — anti-order collage. Chance chooses; we agree or refuse.
// ─────────────────────────────────────────────────────────────────────────────
const dada: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const white = '#F6F0E2';
  const manifesto = 'We did not abolish order. We put it in a hat, shook it, and read out whatever fell on the floor. The floor turned out to be the most honest editor in Zürich. Every word on this page was chosen by a coin; every coin was chosen by us.';

  // ── Page 1: words scattered but composed ──
  const p1: Objs = [ground(W, H, paper)];
  p1.push(circle(600, 330, 165, accent, { opacity: .96, label: 'Hand-cut circle' }));
  p1.push(...orn.rings(600, 330, [122], paper, 3, { opacity: .55, label: 'Cut ring' }));
  p1.push(rect(60, 118, 310, 44, secondary, { rotation: -7, label: 'Cut-out strip' }));
  p1.push(text(72, 133, 290, 'Spiegelgasse 1 · Zürich · 1916', { size: 11, font: 'spaceMono', weight: 700, color: paper, tracking: .14, transform: 'uppercase', wrap: false, rotation: -7, label: 'Address fragment', role: 'LABEL' }));
  p1.push(circle(300, 215, 6, ink, { label: 'Found punctuation' }));
  p1.push(circle(430, 250, 9, ink, { label: 'Found punctuation' }));
  p1.push(rect(36, 300, 620, 160, ink, { rotation: -4, label: 'Cut-out block' }));
  p1.push(text(56, 318, 580, 'CHANCE', { size: 120, font: 'archivoBlack', color: paper, wrap: false, rotation: -4, label: 'Masthead', role: 'HEADLINE' }));
  p1.push(text(430, 506, 340, 'manifesto', { size: 62, font: 'playfair', weight: 700, italic: true, color: ink, wrap: false, rotation: 6, label: 'Italic fragment', role: 'DECK' }));
  p1.push(text(60, 496, 320, 'No. 7', { size: 104, font: 'playfair', weight: 900, color: accent, wrap: false, rotation: 3, label: 'Found numeral', role: 'ORNAMENT' }));
  p1.push(path(470, 596, 80, 40, orn.chevronPath(40), ink, { rotation: 18, label: 'Found arrow' }));
  p1.push(rect(556, 622, 220, 90, accent, { rotation: 176, label: 'Red scrap' }));
  p1.push(text(574, 640, 185, 'ANTI', { size: 58, font: 'archivoBlack', color: paper, wrap: false, rotation: 176, align: 'center', label: 'Upside-down fragment', role: 'ORNAMENT' }));
  p1.push(rect(50, 636, 430, 56, white, { rotation: 2, stroke: ink, strokeWidth: .8, label: 'Ticket scrap' }));
  p1.push(text(66, 656, 400, 'the poem is what you cut out of the newspaper', { size: 14, font: 'specialElite', color: ink, wrap: false, rotation: 2, label: 'Typewriter fragment', role: 'DECK' }));
  p1.push(hr(56, 722, 400, ink, 1.5, { label: 'Column rule' }));
  const man = text(56, 732, 400, manifesto, { size: 11.5, font: 'specialElite', color: ink, leading: 1.55, label: 'Manifesto paragraph', role: 'BODY' });
  p1.push(man);
  p1.push(text(56, below(man, 12), 460, 'Issued by the Committee for Accidental Meaning · Bulletin No. 7', { size: 10, font: 'specialElite', color: ink, label: 'Byline', role: 'CAPTION' }));
  p1.push(text(590, 736, 200, '1916', { size: 40, font: 'spaceMono', weight: 700, color: secondary, wrap: false, rotation: -8, label: 'Found date', role: 'LABEL' }));
  p1.push(text(520, 800, 250, 'read aloud, quickly, in two languages at once', { size: 9, font: 'spaceMono', color: ink, tracking: .08, leading: 1.5, label: 'Instruction fragment', role: 'CAPTION' }));
  p1.push(rect(700, 930, 70, 42, ink, { rotation: 5, label: 'Folio scrap' }));
  p1.push(text(700, 936, 70, '1', { size: 28, font: 'playfair', weight: 900, color: paper, align: 'center', wrap: false, rotation: 5, label: 'Folio', role: 'FOLIO' }));
  p1.push(hr(0, 986, W, ink, .7, { dash: [7, 5], label: 'Cut line' }));
  p1.push(text(60, 992, 200, 'cut here', { size: 8, font: 'spaceMono', color: ink, tracking: .2, transform: 'uppercase', wrap: false, label: 'Cut-line label', role: 'LABEL' }));

  // ── Page 2: text block set straight; head and folio collaged ──
  const p2: Objs = [ground(W, H, paper)];
  p2.push(rect(48, 44, 380, 74, ink, { rotation: -3, label: 'Section scrap' }));
  p2.push(text(62, 64, 350, 'THE FOUND WORD', { size: 30, font: 'archivoBlack', color: paper, wrap: false, rotation: -3, label: 'Section head', role: 'HEADLINE' }));
  p2.push(rect(430, 72, 246, 30, secondary, { rotation: 4, label: 'Cut-out strip' }));
  p2.push(text(440, 81, 226, 'Bulletin No. 7 · second sheet', { size: 10, font: 'spaceMono', weight: 700, color: paper, tracking: .08, transform: 'uppercase', wrap: false, rotation: 4, label: 'Running head', role: 'FOLIO' }));
  p2.push(rect(690, 20, 90, 96, accent, { rotation: 8, label: 'Numeral scrap' }));
  p2.push(text(705, 28, 60, '2', { size: 72, font: 'playfair', weight: 900, color: paper, align: 'center', wrap: false, rotation: 8, label: 'Found numeral', role: 'ORNAMENT' }));
  p2.push(hr(48, 142, 720, ink, .7, { dash: [7, 5], label: 'Cut line' }));

  const cols = columns(60, 696, 2, 32);
  const c1 = cols[0], c2 = cols[1];
  const sub1 = text(c1.x, 170, c1.w, 'I. The straight part', { size: 13, font: 'archivoBlack', color: accent, tracking: .06, transform: 'uppercase', label: 'Subhead', role: 'LABEL' });
  p2.push(sub1);
  const b1 = text(c1.x, below(sub1, 12), c1.w, 'The bulletin is set straight because we ran out of angles, not out of contempt. Reading requires a horizon; even a riot needs a floor to stand on. So the columns obey. Everything above them does not.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 1 body', role: 'BODY' });
  p2.push(b1);
  const b2 = text(c1.x, below(b1, 14), c1.w, 'A collage is an argument between things that never agreed to meet. The ticket stub does not know the timetable; the numeral does not know what it counts. Put them side by side and a meaning arrives uninvited, sits down, and refuses to leave.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 1 body', role: 'BODY' });
  p2.push(b2);
  const q = text(c1.x + 16, below(b2, 34), c1.w - 32, 'Order is a habit. We are trying to quit.', { size: 21, font: 'playfair', weight: 700, italic: true, color: ink, leading: 1.2, rotation: -2, label: 'Pull quote', role: 'DECK' });
  p2.push(rect(c1.x, q.y - 14, c1.w, q.h + 28, white, { rotation: -2, stroke: ink, strokeWidth: .8, label: 'Quote scrap' }));
  p2.push(q);
  const b3 = text(c1.x, below(q, 36), c1.w, 'We are often asked whether the arrangement is random. It is not. Chance chooses; we agree or refuse. That refusal is the whole of our craft, and it is more than most editors will admit to.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 1 body', role: 'BODY' });
  p2.push(b3);
  const b3b = text(c1.x, below(b3, 14), c1.w, 'Consider the ticket. It was valid for one journey on one tram on one evening in a city that no longer prints tickets of that colour. Glued here, it is valid forever, and for nothing. That is what we mean by a found object: something the world finished with before we started.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 1 body', role: 'BODY' });
  p2.push(b3b);
  const b3c = text(c1.x, below(b3b, 14), c1.w, 'The printer asked which face we wanted. We said yes. He has not forgiven us, but the sheet you are holding came off his press, so somewhere between the question and the ink he agreed with us a little.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 1 body', role: 'BODY' });
  p2.push(b3c);
  const b3d = text(c1.x, below(b3c, 14), c1.w, 'Next sheet: a poem assembled from the weather report, and a portrait of the committee made entirely of its own signatures.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 1 body', role: 'BODY' });
  p2.push(b3d);
  p2.push(text(c1.x, below(b3d, 14), c1.w, 'Subscriptions are accepted in any currency, including buttons. Buttons are preferred; they can be glued to the next sheet, and currency cannot, or so the bank keeps telling us.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 1 body', role: 'BODY' }));

  p2.push(...imageSlot(c2.x, 172, c2.w, 210, { tone: 'light', rotation: -3, shade: alpha(secondary, .16), caption: 'Paste a found photograph', label: 'Collage image slot' }));
  const cap = text(c2.x, 398, c2.w, 'Fragment, newspaper and gum, 1920. Provenance: the floor.', { size: 9, font: 'spaceMono', color: ink, tracking: .04, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(cap);
  const sub2 = text(c2.x, below(cap, 22), c2.w, 'II. The accidental part', { size: 13, font: 'archivoBlack', color: accent, tracking: .06, transform: 'uppercase', label: 'Subhead', role: 'LABEL' });
  p2.push(sub2);
  const b4 = text(c2.x, below(sub2, 12), c2.w, 'Take any page printed today. Cut out the nouns. Keep the verbs where they fall. What remains is not nonsense; it is the newspaper telling you what it was too polite to say. We have simply removed the politeness.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 2 body', role: 'BODY' });
  p2.push(b4);
  const b5 = text(c2.x, below(b4, 14), c2.w, 'Contributors this sheet: a tram ticket, three letters from an advertisement for soap, one numeral of unknown origin, and the editor, who was present but not consulted.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 2 body', role: 'BODY' });
  p2.push(b5);
  const b6 = text(c2.x, below(b5, 14), c2.w, 'A reader in Berlin writes to complain that the last sheet could not be read from left to right. We have checked. It could not be read from right to left either, which we take as proof of balance.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 2 body', role: 'BODY' });
  p2.push(b6);
  const b7 = text(c2.x, below(b6, 14), c2.w, 'The committee meets whenever two of its members are in the same café by accident. Minutes are kept on the tablecloth and are the property of the café.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 2 body', role: 'BODY' });
  p2.push(b7);
  const b8 = text(c2.x, below(b7, 14), c2.w, 'Errata: in the last sheet the word "order" appeared the right way up. This was an error of the printer, who has been thanked and asked not to do it again.', { size: 11, font: 'specialElite', color: ink, leading: 1.55, label: 'Column 2 body', role: 'BODY' });
  p2.push(b8);
  p2.push(text(c2.x + 180, below(b8, 20), 140, '7', { size: 96, font: 'playfair', weight: 900, color: accent, wrap: false, rotation: 6, opacity: .9, label: 'Found numeral', role: 'ORNAMENT' }));

  p2.push(rect(60, 980, 250, 34, ink, { rotation: 2, label: 'Foot scrap' }));
  p2.push(text(70, 991, 230, 'Chance · an irregular bulletin', { size: 9, font: 'spaceMono', weight: 700, color: paper, tracking: .12, transform: 'uppercase', wrap: false, rotation: 2, label: 'Running foot', role: 'FOLIO' }));
  p2.push(rect(728, 976, 44, 44, accent, { rotation: -6, label: 'Folio scrap' }));
  p2.push(text(728, 984, 44, '2', { size: 26, font: 'playfair', weight: 900, color: paper, align: 'center', wrap: false, rotation: -6, label: 'Folio', role: 'FOLIO' }));
  return [p1, p2];
};

// ─────────────────────────────────────────────────────────────────────────────
// PSYCHEDELIC — liquid, vibrating; the body copy stays readable.
// ─────────────────────────────────────────────────────────────────────────────
const psychedelic: EraDesigner = ({ W, H, paper, ink: magenta, accent: gold, secondary: teal, seed }) => {
  const cream = '#FBEFD5';
  const trio = [magenta, gold, teal];

  // ── Page 1: full-page ripples, title in a nested blob ──
  const p1: Objs = [ground(W, H, paper)];
  for (let i = 0; i < 14; i++) p1.push(path(-30, -70 + i * 86, W + 60, 150, orn.wavePath(2.5, 26, 30, .6), trio[i % 3], { label: 'Ripple ribbon' }));
  p1.push(path(60, 226, 696, 580, orn.blobPath(seed, 7, .14), gold, { label: 'Blob frame · outer' }));
  p1.push(path(76, 244, 664, 544, orn.blobPath(seed + 1, 7, .14), teal, { label: 'Blob frame · middle' }));
  p1.push(path(94, 256, 628, 520, orn.blobPath(seed + 2, 7, .12), paper, { label: 'Blob field' }));
  p1.push(text(170, 318, 484, 'Saturday night', { size: 40, font: 'pacifico', color: magenta, align: 'center', wrap: false, label: 'Script kicker', role: 'LABEL' }));
  p1.push(text(166, 366, 484, 'Liquid\nLight', { size: 96, font: 'shrikhand', color: teal, align: 'center', leading: .95, wrap: false, label: 'Title vibration layer', role: 'ORNAMENT' }));
  p1.push(text(170, 362, 484, 'Liquid\nLight', { size: 96, font: 'shrikhand', color: gold, align: 'center', leading: .95, wrap: false, label: 'Title', role: 'HEADLINE' }));
  p1.push(text(196, 572, 424, 'Three bands, one borrowed projector, and a ballroom that breathes.', { size: 14, font: 'nunito', weight: 600, color: cream, align: 'center', leading: 1.35, label: 'Deck', role: 'DECK' }));
  p1.push(text(196, 626, 424, 'Doors at eight · Civic Ballroom · All ages', { size: 11, font: 'nunito', weight: 800, color: gold, align: 'center', tracking: .22, transform: 'uppercase', wrap: false, label: 'Date line', role: 'LABEL' }));
  p1.push(rect(40, 40, 250, 24, paper, { rx: 12, label: 'Corner pill' }));
  p1.push(text(40, 47, 250, 'Poster No. 3 · Lightshow series', { size: 9, font: 'nunito', weight: 800, color: gold, align: 'center', tracking: .18, transform: 'uppercase', wrap: false, label: 'Series label', role: 'LABEL' }));
  p1.push(rect(198, 984, 420, 30, paper, { rx: 15, label: 'Credit pill' }));
  p1.push(text(198, 993, 420, 'Lights by the Liquid Light Collective · Sound by the house', { size: 10, font: 'nunito', weight: 700, color: cream, align: 'center', tracking: .08, wrap: false, label: 'Credits', role: 'CAPTION' }));

  // ── Page 2: violet paper, cream blob field, two readable columns ──
  const p2: Objs = [ground(W, H, paper)];
  for (let i = 0; i < 3; i++) p2.push(path(-30, -70 + i * 56, W + 60, 130, orn.wavePath(2.5, 24, 28, .6), trio[i % 3], { label: 'Rail ribbon' }));
  for (let i = 0; i < 3; i++) p2.push(path(-30, 900 + i * 56, W + 60, 130, orn.wavePath(2.5, 24, 28, 1.8), trio[(i + 1) % 3], { label: 'Rail ribbon' }));
  p2.push(path(-260, 380, 640, 120, orn.wavePath(2.5, 24, 28, .2), gold, { rotation: 90, label: 'Side ribbon' }));
  p2.push(path(436, 480, 640, 120, orn.wavePath(2.5, 24, 28, 1.1), teal, { rotation: 90, label: 'Side ribbon' }));
  p2.push(path(-60, 60, 936, 960, orn.blobPath(seed + 4, 8, .1), cream, { label: 'Blob text field' }));
  p2.push(text(208, 236, 400, 'Liquid Light · Programme · Set two', { size: 10, font: 'nunito', weight: 800, color: paper, align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(151, 265, 520, 'The room that breathes', { size: 36, font: 'shrikhand', color: teal, align: 'center', wrap: false, label: 'Section head vibration layer', role: 'ORNAMENT' }));
  p2.push(text(148, 262, 520, 'The room that breathes', { size: 36, font: 'shrikhand', color: magenta, align: 'center', wrap: false, label: 'Section head', role: 'HEADLINE' }));
  const cA = { x: 158, w: 236 }, cB = { x: 422, w: 236 };
  const a1 = text(cA.x, 322, cA.w, copy.body('music', 0), { size: 11, font: 'nunito', color: paper, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(a1);
  const a2 = text(cA.x, below(a1, 14), cA.w, copy.body('music', 1), { size: 11, font: 'nunito', color: paper, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(a2);
  p2.push(text(cA.x, below(a2, 18), cA.w, copy.quote('music', 0), { size: 17, font: 'shrikhand', color: magenta, leading: 1.25, label: 'Pull quote', role: 'DECK' }));
  p2.push(...imageSlot(cB.x, 322, cB.w, 168, { tone: 'light', rx: 28, shade: alpha(magenta, .16), caption: 'Drop a lightshow still', label: 'Image slot' }));
  const bc = text(cB.x, 498, cB.w, copy.caption('music', 1), { size: 9, font: 'nunito', weight: 600, color: mix(paper, .18), leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(bc);
  const b1 = text(cB.x, below(bc, 16), cB.w, 'The projector is older than anyone in the room. Oil and dye sit between two clock glasses, warmed until the colours crawl, and the operator tilts them by hand in time with the drummer. Nothing is recorded. If you missed it, you missed it, which is the point.', { size: 11, font: 'nunito', color: paper, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(b1);
  const pill = rect(cB.x, below(b1, 18), cB.w, 30, teal, { rx: 15, label: 'Ticket pill' });
  p2.push(pill);
  p2.push(text(cB.x, pill.y + 9, cB.w, 'Set two · 11 pm · Main floor', { size: 10, font: 'nunito', weight: 800, color: cream, align: 'center', tracking: .18, transform: 'uppercase', wrap: false, label: 'Set time', role: 'LABEL' }));
  p2.push(rect(384, 1016, 48, 22, paper, { rx: 11, label: 'Folio pill' }));
  p2.push(text(384, 1021, 48, '2', { size: 11, font: 'nunito', weight: 800, color: gold, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
  return [p1, p2];
};

// ─────────────────────────────────────────────────────────────────────────────
// PUNK — xerox, ransom note, torn tape. Stapled crooked on purpose.
// ─────────────────────────────────────────────────────────────────────────────
const punk: EraDesigner = ({ W, H, paper, ink, accent, secondary, seed }) => {
  const white = '#F8F5EC', tape = alpha(secondary, .7);
  const tapeStrip = (x: number, y: number, rot: number) => rect(x, y, 76, 22, tape, { rotation: rot, label: 'Tape' });

  // ── Page 1 ──
  const p1: Objs = [ground(W, H, paper)];
  p1.push(...orn.specks(0, 0, W, H, 90, ink, seed, .35));
  p1.push(...imageSlot(500, 60, 250, 210, { tone: 'light', rotation: -5, shade: alpha(secondary, .32), caption: 'Paste a photocopy', label: 'Skewed image well' }));
  p1.push(tapeStrip(478, 48, -35), tapeStrip(704, 246, -35));
  p1.push(text(60, 140, 360, 'LOUDER', { size: 64, font: 'permanentMarker', color: accent, wrap: false, rotation: -7, label: 'Marker word', role: 'HEADLINE' }));
  p1.push(text(60, 236, 420, 'a photocopied zine about noise, rooms & the people in them', { size: 12, font: 'specialElite', color: ink, label: 'Kicker', role: 'LABEL' }));
  p1.push(path(-20, 296, W + 40, 310, orn.tornEdgePath(seed, 10), ink, { label: 'Torn black strip' }));
  p1.push(path(-20, 480, W + 40, 150, orn.tornEdgePath(seed + 3, 14), ink, { rotation: 180, label: 'Torn strip · lower edge' }));
  p1.push(text(80, 350, 660, 'STATIC', { size: 190, font: 'anton', color: paper, tracking: .02, wrap: false, rotation: -2, label: 'Masthead', role: 'HEADLINE' }));
  p1.push(rect(468, 548, 300, 60, white, { rotation: 4, stroke: ink, strokeWidth: 1, label: 'Issue scrap' }));
  p1.push(text(484, 563, 270, 'ISSUE No. 3', { size: 30, font: 'archivoBlack', color: ink, wrap: false, rotation: 4, label: 'Issue number', role: 'LABEL' }));
  p1.push(rect(60, 656, 640, 40, ink, { label: 'Stencil bar' }));
  p1.push(text(70, 669, 620, 'Do it yourself · or it won’t get done', { size: 16, font: 'archivoBlack', color: paper, tracking: .22, transform: 'uppercase', wrap: false, label: 'Stencil line', role: 'DECK' }));
  p1.push(rect(60, 716, 690, 6, ink, { rotation: .8, label: 'Crude rule' }));
  p1.push(rect(60, 730, 420, 3, ink, { rotation: -.6, label: 'Crude rule' }));
  const tw = text(60, 752, 400, 'Photocopied after hours on a machine that owes us nothing. Fifty pence or a tape. No adverts, no apologies, no page numbers we can be held to. If you can read this, the toner held.', { size: 11.5, font: 'specialElite', color: ink, leading: 1.5, label: 'Typewriter block', role: 'BODY' });
  p1.push(tw);
  p1.push(text(60, below(tw, 16), 220, '→ turn over', { size: 15, font: 'permanentMarker', color: accent, wrap: false, rotation: -3, label: 'Marker note', role: 'LABEL' }));
  p1.push(rect(482, 748, 86, 40, ink, { rotation: -4, label: 'Ransom scrap' }));
  p1.push(text(482, 758, 86, 'CUT', { size: 22, font: 'archivoBlack', color: paper, align: 'center', wrap: false, rotation: -4, label: 'Ransom word', role: 'LABEL' }));
  p1.push(rect(576, 752, 56, 40, white, { rotation: 3, stroke: ink, strokeWidth: 1, label: 'Ransom scrap' }));
  p1.push(text(576, 758, 56, '&', { size: 28, font: 'anton', color: ink, align: 'center', wrap: false, rotation: 3, label: 'Ransom word', role: 'LABEL' }));
  p1.push(rect(640, 746, 120, 44, accent, { rotation: -2, label: 'Ransom scrap' }));
  p1.push(text(640, 756, 120, 'PASTE', { size: 26, font: 'anton', color: paper, align: 'center', wrap: false, rotation: -2, label: 'Ransom word', role: 'LABEL' }));
  p1.push(...orn.rings(690, 890, [46, 40], accent, 3, { opacity: .85, label: 'Price stamp' }));
  p1.push(text(640, 880, 100, '50p', { size: 18, font: 'specialElite', color: accent, align: 'center', wrap: false, label: 'Price', role: 'LABEL' }));
  p1.push(path(-10, 992, W + 20, 80, orn.tornEdgePath(seed + 5, 22), ink, { label: 'Torn foot' }));
  p1.push(text(60, 1024, 500, 'STATIC · issue three · stapled crooked on purpose', { size: 10, font: 'specialElite', color: paper, wrap: false, label: 'Running foot', role: 'FOLIO' }));
  p1.push(text(716, 1018, 40, '1', { size: 22, font: 'anton', color: paper, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));

  // ── Page 2: typewriter columns, tape corners, torn foot ──
  const p2: Objs = [ground(W, H, paper)];
  p2.push(...orn.specks(0, 0, W, H, 60, ink, seed + 1, .25));
  p2.push(rect(48, 40, 300, 34, ink, { rotation: -1.5, label: 'Running head bar' }));
  p2.push(text(60, 46, 280, 'STATIC #3', { size: 20, font: 'anton', color: paper, tracking: .06, wrap: false, rotation: -1.5, label: 'Running head', role: 'FOLIO' }));
  p2.push(tapeStrip(320, 34, -25));
  p2.push(text(520, 54, 248, 'reviews · rants · one recipe', { size: 10, font: 'specialElite', color: ink, align: 'right', wrap: false, label: 'Contents line', role: 'LABEL' }));
  p2.push(rect(48, 88, 720, 5, ink, { rotation: .6, label: 'Crude rule' }));
  const cols = columns(56, 704, 2, 36);
  const c1 = cols[0], c2 = cols[1];
  const s1 = text(c1.x, 120, c1.w, 'The method', { size: 18, font: 'archivoBlack', color: ink, transform: 'uppercase', label: 'Subhead', role: 'LABEL' });
  p2.push(s1);
  const r1 = text(c1.x, below(s1, 10), c1.w, 'Nobody gave us a venue, so the venue is a basement with one plug socket and a landlord who thinks we are a book club. Nobody gave us a printing press, so the press is the photocopier at the library between five and six, when the staff pretend not to see. This is not a complaint. This is the method.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(r1);
  const r2 = text(c1.x, below(r1, 12), c1.w, 'A zine is a letter to forty people who have not met yet. It is stapled crooked because it was stapled fast, and it was stapled fast because the gig is tonight and the review of the last one still is not written. Write it on the bus. Cut it out with the kitchen scissors. Glue it down before the glue dries.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(r2);
  const mq = text(c1.x, below(r2, 22), c1.w, 'If it’s straight, it’s wrong', { size: 26, font: 'permanentMarker', color: accent, leading: 1.15, rotation: -3, label: 'Marker pull quote', role: 'DECK' });
  p2.push(mq);
  const r3 = text(c1.x, below(mq, 22), c1.w, 'People ask why we do not just post it online. Because a screen cannot be folded into a back pocket, left on a bus seat, or found ten years later in a box with a smell. Paper remembers where it has been.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(r3);
  const r3b = text(c1.x, below(r3, 12), c1.w, 'Gig report: the support band were fourteen and better than us. The headliners broke a string, borrowed a guitar from the audience, and gave it back with a sticker on it. The landlord came down at eleven and stayed for the encore. He still thinks we are a book club.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(r3b);
  const r3c = text(c1.x, below(r3b, 12), c1.w, 'Door money went on a new fuse, forty photocopies and chips. The chips were a mistake. Everything else was policy.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(r3c);
  const r3d = text(c1.x, below(r3c, 12), c1.w, 'Letters: one, from a man who says the last issue was hard to read. He is right. It was photocopied on the dark setting because the light setting was broken, and we have decided that the dark setting is now our house style. Write again. We will print it darker.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(r3d);
  p2.push(text(c1.x, below(r3d, 12), c1.w, 'Wanted: a drummer with a van, or a van. A photocopier that does not need feeding at five. Someone who can spell. Apply at the basement, any night, bring a speaker.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' }));
  p2.push(...imageSlot(c2.x, 122, c2.w, 230, { tone: 'light', rotation: 2, shade: alpha(secondary, .3), caption: 'Paste a photocopy', label: 'Taped image slot' }));
  p2.push(tapeStrip(c2.x - 20, 114, -40), tapeStrip(c2.x + c2.w - 56, 114, 40), tapeStrip(c2.x - 20, 336, 40), tapeStrip(c2.x + c2.w - 56, 336, -40));
  const pc = text(c2.x, 372, c2.w, 'Basement, one plug socket. Photo: whoever had the camera.', { size: 9, font: 'specialElite', color: ink, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(pc);
  const s2 = text(c2.x, below(pc, 22), c2.w, 'Record review: four songs, nine minutes', { size: 14, font: 'archivoBlack', color: ink, transform: 'uppercase', leading: 1.15, label: 'Subhead', role: 'LABEL' });
  p2.push(s2);
  const r4 = text(c2.x, below(s2, 10), c2.w, 'Recorded onto a borrowed four-track in a kitchen with the fridge unplugged so it would not hum. It hums anyway. That hum is the best thing on the tape: proof that somebody was standing in a real room, not a rented one, and pressed record before they were ready.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(r4);
  const r5 = text(c2.x, below(r4, 12), c2.w, 'Song three is a cover of song one. Song four is a cover of song three. We have listened to it eleven times and would like a fifth song, please, even if it is just the fridge.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(r5);
  const r6 = text(c2.x, below(r5, 12), c2.w, 'Recipe, as promised: one tin of beans, the heel of a loaf, whatever cheese is left. Heat the beans in the tin if you have to. Serve to whoever carried the amp. This has fed four bands and one landlord and nobody has complained where we could hear them.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(r6);
  const r7 = text(c2.x, below(r6, 12), c2.w, 'Listings: Thursday, the basement, three bands and the fridge. Saturday, the community hall, if the caretaker says yes; he has said yes twice and no once, and the once was our fault. Every other night, wherever there is a plug.', { size: 11, font: 'specialElite', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(r7);
  const bar = rect(c2.x, below(r7, 22), c2.w, 32, ink, { rotation: -1, label: 'Stencil bar' });
  p2.push(bar);
  p2.push(text(c2.x + 10, bar.y + 10, c2.w - 20, 'Next issue whenever · send stamps', { size: 11, font: 'archivoBlack', color: paper, tracking: .2, transform: 'uppercase', wrap: false, rotation: -1, label: 'Stencil line', role: 'LABEL' }));
  p2.push(path(-10, 980, W + 20, 100, orn.tornEdgePath(seed + 9, 22), ink, { label: 'Torn foot' }));
  p2.push(text(56, 1022, 300, 'STATIC · issue three', { size: 10, font: 'specialElite', color: paper, wrap: false, label: 'Running foot', role: 'FOLIO' }));
  p2.push(text(720, 1016, 40, '2', { size: 22, font: 'anton', color: paper, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
  p2.push(...orn.rings(748, 1028, [22], accent, 2.5, { label: 'Marker circle' }));
  return [p1, p2];
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW WAVE — elastic grid, stepped rules, type in three layers.
// ─────────────────────────────────────────────────────────────────────────────
const newWave: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const step = (pts: Array<[number, number]>, color: string, w: number) => {
    const out: Objs = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      out.push(y0 === y1 ? hr(Math.min(x0, x1), y0, Math.abs(x1 - x0), color, w, { label: 'Stepped rule' }) : vr(x0, Math.min(y0, y1), Math.abs(y1 - y0), color, w, { label: 'Stepped rule' }));
    }
    return out;
  };

  // ── Page 1 ──
  const p1: Objs = [ground(W, H, paper)];
  p1.push(rect(560, 0, 256, H, secondary, { label: 'Colour field' }));
  p1.push(rect(0, 760, 220, 296, accent, { label: 'Issue block' }));
  p1.push(text(30, 104, 760, 'NIGHTS', { size: 170, font: 'syne', weight: 800, color: accent, opacity: .22, tracking: -.02, wrap: false, label: 'Ghost title layer', role: 'ORNAMENT' }));
  p1.push(...step([[60, 296], [360, 296], [360, 426], [560, 426]], ink, 2));
  p1.push(hr(560, 546, 256, paper, 2, { label: 'Stepped rule' }));
  p1.push(vr(560, 426, 120, paper, 2, { label: 'Stepped rule' }));
  p1.push(text(60, 322, 500, 'enormous', { size: 96, font: 'syne', weight: 800, color: accent, wrap: false, label: 'Title · mid layer', role: 'HEADLINE' }));
  p1.push(text(60, 440, 496, 'Small stages,', { size: 58, font: 'syne', weight: 800, color: ink, wrap: false, label: 'Title · solid layer', role: 'HEADLINE' }));
  p1.push(text(330, 516, 226, 'nights.', { size: 40, font: 'syne', weight: 800, color: ink, wrap: false, label: 'Title · tail', role: 'HEADLINE' }));
  p1.push(text(60, 600, 440, copy.deck('culture', 0), { size: 15, font: 'dmSans', color: ink, leading: 1.4, label: 'Deck', role: 'DECK' }));
  p1.push(text(60, 664, 300, 'Vol. 4 · No. 9 · Autumn programme', { size: 10, font: 'spaceMono', color: ink, tracking: .1, wrap: false, label: 'Issue line', role: 'LABEL' }));
  p1.push(text(566, 560, 230, 'Season preview · Autumn', { size: 11, h: 230, font: 'spaceMono', weight: 700, color: paper, tracking: .3, transform: 'uppercase', wrap: false, rotation: 90, label: 'Vertical kicker', role: 'LABEL' }));
  p1.push(text(592, 44, 200, '22.09 — 14.12', { size: 10, font: 'spaceMono', weight: 700, color: paper, tracking: .12, wrap: false, label: 'Dates', role: 'LABEL' }));
  p1.push(...step([[592, 70], [712, 70], [712, 110], [792, 110]], paper, 2));
  p1.push(text(592, 300, 200, 'Ten premieres', { size: 26, font: 'syne', weight: 800, color: paper, leading: 1.1, label: 'Field headline', role: 'DECK' }));
  p1.push(text(592, 372, 200, 'Fourteen weeks, ten premieres, four stages, one borrowed car park.', { size: 11, font: 'dmSans', color: paper, leading: 1.45, label: 'Field copy', role: 'BODY' }));
  p1.push(text(24, 786, 180, '09', { size: 72, font: 'syne', weight: 800, color: paper, wrap: false, label: 'Issue numeral', role: 'ORNAMENT' }));
  p1.push(text(24, 872, 180, 'Issue nine', { size: 9, font: 'spaceMono', weight: 700, color: paper, tracking: .2, transform: 'uppercase', wrap: false, label: 'Issue label', role: 'LABEL' }));
  p1.push(text(24, 900, 172, 'Autumn programme of the small stages network.', { size: 10, font: 'dmSans', color: paper, leading: 1.4, label: 'Issue copy', role: 'CAPTION' }));
  p1.push(...step([[250, 760], [400, 760], [400, 780], [540, 780]], accent, 3));
  const teaser = text(250, 796, 290, copy.body('culture', 0), { size: 11, font: 'dmSans', color: ink, leading: 1.45, label: 'Teaser body', role: 'BODY' });
  p1.push(teaser);
  p1.push(text(250, below(teaser, 10), 290, copy.byline('culture', 0), { size: 9, font: 'spaceMono', color: ink, tracking: .06, label: 'Byline', role: 'CAPTION' }));

  // ── Page 2: broken three-column grid ──
  const p2: Objs = [ground(W, H, paper)];
  p2.push(rect(0, 0, 28, H, secondary, { label: 'Edge field' }));
  p2.push(rect(600, 0, 216, 128, accent, { label: 'Folio block' }));
  p2.push(text(620, 28, 176, '02', { size: 72, font: 'syne', weight: 800, color: paper, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
  p2.push(text(56, 48, 440, 'Small stages · Season preview · Autumn', { size: 9, font: 'spaceMono', weight: 700, color: ink, tracking: .2, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(...step([[56, 72], [236, 72], [236, 112], [436, 112], [436, 142], [586, 142]], ink, 2));
  const A = { x: 56, w: 150 }, B = { x: 230, w: 250 }, C = { x: 504, w: 256 };
  // Column A — narrow
  p2.push(hr(A.x, 190, A.w, ink, 2, { label: 'Column rule' }));
  const ak = text(A.x, 200, A.w, 'In conversation', { size: 13, font: 'syne', weight: 800, color: accent, label: 'Kicker', role: 'LABEL' });
  p2.push(ak);
  const ab = text(A.x, below(ak, 10), A.w, 'The season opens with a two-hander written in a kitchen and staged in a car park. Nobody involved has done this before; that is the pitch.', { size: 10.5, font: 'dmSans', color: ink, leading: 1.5, label: 'Column A body', role: 'BODY' });
  p2.push(ab);
  p2.push(text(A.x, below(ab, 14), A.w, 'Directors: two.\nPrevious credits: none.\nRunning time: 70 min.', { size: 9, font: 'spaceMono', color: ink, leading: 1.6, label: 'Facts block', role: 'CAPTION' }));
  p2.push(text(A.x, 400, A.w, 'Programme', { size: 9, h: A.w, font: 'spaceMono', weight: 700, color: secondary, tracking: .3, transform: 'uppercase', wrap: false, rotation: -90, label: 'Vertical label', role: 'LABEL' }));
  p2.push(...imageSlot(A.x, 560, A.w, 210, { tone: 'light', shade: alpha(secondary, .14), caption: 'Drop a still', label: 'Image slot' }));
  p2.push(text(A.x, 778, A.w, copy.caption('culture', 2), { size: 9, font: 'dmSans', color: ink, leading: 1.4, label: 'Caption', role: 'CAPTION' }));
  // Column B — main
  p2.push(hr(B.x, 154, B.w, accent, 3, { label: 'Column rule' }));
  const bh = text(B.x, 166, B.w, copy.headline('culture', 0), { size: 30, font: 'syne', weight: 800, color: ink, leading: 1.1, label: 'Headline', role: 'HEADLINE' });
  p2.push(bh);
  const bb1 = text(B.x, below(bh, 18), B.w, copy.body('culture', 0), { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column B body', role: 'BODY' });
  p2.push(bb1);
  const bb2 = text(B.x, below(bb1, 12), B.w, copy.body('culture', 1), { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column B body', role: 'BODY' });
  p2.push(bb2);
  const bb3 = text(B.x, below(bb2, 12), B.w, 'What the season shares is not a style but a stubbornness: every piece was made by people who were told there was no audience, and who went looking for one anyway. Most of them found it in the queue.', { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column B body', role: 'BODY' });
  p2.push(bb3);
  const bb4 = text(B.x, below(bb2, 12) + bb3.h + 22, B.w, 'The rooms', { size: 13, font: 'syne', weight: 800, color: accent, label: 'Subhead', role: 'LABEL' });
  p2.push(bb4);
  const bb5 = text(B.x, below(bb4, 8), B.w, 'Four stages, none of them built as a stage. A car park under a shopping centre, with the lights left on. A swimming pool drained since spring. The back room of a launderette, where the machines keep time. And a proper theatre, which is the strangest of the four, because everyone keeps whispering.', { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column B body', role: 'BODY' });
  p2.push(bb5);
  p2.push(text(B.x, below(bb5, 12), B.w, 'Every venue is walkable from the last. The programme is designed so you can see two shows in an evening and still catch the bus; if you miss the bus, the launderette is open until one.', { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column B body', role: 'BODY' }));
  // Column C — ghost numeral, quote, dates
  p2.push(text(C.x, 150, C.w, '02', { size: 140, font: 'syne', weight: 800, color: ink, opacity: .07, wrap: false, label: 'Ghost numeral', role: 'ORNAMENT' }));
  p2.push(hr(C.x, 224, C.w, secondary, 2, { label: 'Column rule' }));
  const cb = text(C.x, 240, C.w, 'Tickets are priced by what you can pay, which the box office has learned to ask without apology. The car park is unheated. Bring a coat, and someone who has never been.', { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column C body', role: 'BODY' });
  p2.push(cb);
  const cq = text(C.x, below(cb, 20), C.w, copy.quote('culture', 0), { size: 20, font: 'syne', weight: 800, color: secondary, leading: 1.2, label: 'Pull quote', role: 'DECK' });
  p2.push(cq);
  const cd = text(C.x, below(cq, 20), C.w, '22.09  Opening night\n05.10  The car park two-hander\n19.11  Late show, all ages\n14.12  Closing party', { size: 9, font: 'spaceMono', color: ink, leading: 1.7, label: 'Dates block', role: 'CAPTION' });
  p2.push(cd);
  p2.push(hr(C.x, below(cd, 18), 120, secondary, 2, { label: 'Column rule' }));
  const cb2 = text(C.x, below(cd, 30), C.w, 'Access: every venue has step-free entry except the pool, where a ramp is being argued about. Relaxed performances are marked in the listings. Nobody will be turned away for arriving late; the launderette does not have a door.', { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column C body', role: 'BODY' });
  p2.push(cb2);
  const cb3 = text(C.x, below(cb2, 12), C.w, 'The network is run by the companies themselves, in rotation, with a budget that fits on one side of a beer mat. The beer mat is on display in the foyer of the proper theatre.', { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column C body', role: 'BODY' });
  p2.push(cb3);
  p2.push(text(C.x, below(cb3, 12), C.w, 'If you want to be part of next season, come to the closing party and say so to the first person who asks what you do. That person is the programming committee. All of it.', { size: 11, font: 'dmSans', color: ink, leading: 1.5, label: 'Column C body', role: 'BODY' }));
  p2.push(...step([[400, 980], [520, 980], [520, 1000], [760, 1000]], accent, 2));
  p2.push(text(56, 1010, 300, 'Autumn programme', { size: 9, font: 'spaceMono', weight: 700, color: ink, tracking: .2, transform: 'uppercase', wrap: false, label: 'Running foot', role: 'FOLIO' }));
  p2.push(text(516, 1010, 244, 'Page 2', { size: 9, font: 'spaceMono', weight: 700, color: ink, tracking: .2, transform: 'uppercase', align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
  return [p1, p2];
};

// ─────────────────────────────────────────────────────────────────────────────
// MEMPHIS — laminate confetti and totem shapes. Joyous.
// ─────────────────────────────────────────────────────────────────────────────
const memphis: EraDesigner = ({ W, H, paper, ink, accent, secondary, seed }) => {
  const white = '#FBF7EA', indigo = '#32285C';
  const bacterio = (x: number, y: number, w: number, h: number, n: number, s: number, opacity = 1) => {
    const r = orn.rng(s); const out: Objs = [];
    for (let i = 0; i < n; i++) out.push(path(x + r() * (w - 40), y + r() * (h - 14), 22 + r() * 16, 9, orn.sineOpenPath(1.5, 42), 'none', { stroke: ink, strokeWidth: 2.4, rotation: r() * 180, open: true, opacity, label: 'Bacterio squiggle' }));
    return out;
  };

  // ── Page 1 ──
  const p1: Objs = [ground(W, H, paper)];
  p1.push(rect(0, 0, 420, 360, white, { label: 'Laminate panel' }));
  p1.push(...bacterio(0, 0, 420, 360, 40, seed));
  p1.push(rect(560, 56, 192, 192, white, { label: 'Checker panel' }));
  p1.push(...orn.checker(560, 56, 192, 192, 24, ink, { label: 'Checker' }));
  p1.push(text(560, 24, 192, 'No. 01 · Salone', { size: 10, font: 'spaceGrotesk', weight: 700, color: ink, align: 'right', tracking: .22, transform: 'uppercase', wrap: false, label: 'Issue label', role: 'LABEL' }));
  p1.push(path(440, 40, 110, 30, orn.sineOpenPath(2, 40), 'none', { stroke: ink, strokeWidth: 4, open: true, label: 'Big squiggle' }));
  p1.push(...orn.rings(500, 300, [70], indigo, 6, { label: 'Ring' }));
  p1.push(circle(500, 300, 54, accent, { label: 'Pink dot' }));
  p1.push(...orn.confetti(0, 360, W, 340, 18, [accent, secondary, indigo, ink], seed, 1));
  p1.push(...orn.confetti(0, 720, W, 300, 14, [secondary, indigo, accent, ink], seed + 1, 1));
  p1.push(rect(74, 414, 560, 250, accent, { label: 'Title block shadow' }));
  p1.push(rect(60, 400, 560, 250, ink, { label: 'Title block' }));
  p1.push(text(84, 428, 512, 'FURNITURE\nTHAT\nLAUGHS', { size: 52, font: 'rubikMono', color: paper, leading: 1.05, wrap: false, label: 'Title', role: 'HEADLINE' }));
  p1.push(text(84, 612, 500, 'Milano · Objects · 1981–1988', { size: 11, font: 'spaceGrotesk', weight: 700, color: paper, tracking: .2, transform: 'uppercase', wrap: false, label: 'Title label', role: 'LABEL' }));
  p1.push(text(60, 686, 480, 'A season of objects that refuse to behave: lamps like totems, tables like toys, a bookcase that argues with the wall.', { size: 16, font: 'fredoka', weight: 500, color: ink, leading: 1.35, label: 'Deck', role: 'DECK' }));
  p1.push(path(60, 780, 230, 190, orn.polygonPath(3), accent, { label: 'Pink triangle' }));
  p1.push(path(330, 830, 260, 130, SEMICIRCLE, secondary, { origin: SEMI_ORIGIN, label: 'Teal half-circle' }));
  p1.push(...orn.stripes(620, 790, 150, 170, 5, 9, indigo, { rotation: -30, label: 'Indigo bars' }));
  p1.push(text(60, 1004, 500, 'Salone preview · Opens Saturday · Free entry', { size: 11, font: 'spaceGrotesk', weight: 700, color: ink, tracking: .16, transform: 'uppercase', wrap: false, label: 'Byline', role: 'CAPTION' }));

  // ── Page 2: white block on patterned ground, checker rail ──
  const p2: Objs = [ground(W, H, paper)];
  p2.push(...bacterio(80, 0, W - 80, H, 24, seed + 2, .9));
  p2.push(...orn.confetti(80, 0, W - 80, H, 12, [accent, secondary, indigo, ink], seed + 3, .9));
  p2.push(rect(0, 0, 64, H, white, { label: 'Checker rail panel' }));
  p2.push(...orn.checker(0, 0, 64, H, 32, ink, { label: 'Checker rail' }));
  p2.push(rect(124, 132, 648, 820, accent, { label: 'Text block shadow' }));
  p2.push(rect(112, 120, 648, 820, white, { label: 'Text block' }));
  p2.push(text(144, 150, 400, 'Furniture that laughs · Salone preview', { size: 10, font: 'spaceGrotesk', weight: 700, color: ink, tracking: .22, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(circle(722, 160, 15, paper, { label: 'Folio dot' }));
  p2.push(text(707, 153, 30, '2', { size: 12, font: 'rubikMono', color: ink, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
  const sub = text(144, 186, 584, 'A room that stopped listening', { size: 22, font: 'rubikMono', color: ink, leading: 1.15, label: 'Section head', role: 'HEADLINE' });
  p2.push(sub);
  p2.push(hr(144, below(sub, 12), 120, secondary, 6, { label: 'Teal rule' }));
  const mc = columns(144, 584, 2, 28);
  const m1 = mc[0], m2 = mc[1];
  const y0 = below(sub, 34);
  const t1 = text(m1.x, y0, m1.w, 'The showroom opens the way a party does: too many colours at the door and nobody sorry about it. A bookcase leans, on purpose. A lamp wears a hat. The laminate is printed with a pattern that looks like bacteria under a cheerful microscope, and it is on everything, because why would it not be.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(t1);
  const t2 = text(m1.x, below(t1, 12), m1.w, 'Good taste, the designers argued, was a room that had stopped listening. So they built rooms that shout: a plastic that pretends to be marble, a marble that pretends to be plastic, a table with one leg in a different decade.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(t2);
  const tq = text(m1.x, below(t2, 20), m1.w, 'Taste is a habit. Fun is a decision.', { size: 15, font: 'rubikMono', color: accent, leading: 1.25, label: 'Pull quote', role: 'DECK' });
  p2.push(tq);
  const t4 = text(m1.x, below(tq, 20), m1.w, 'None of it was meant to last, and most of it did. The pieces that were called jokes in 1981 are the ones people now cross cities to sit near.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(t4);
  const t5h = text(m1.x, below(t4, 22), m1.w, 'How to look', { size: 14, font: 'rubikMono', color: ink, label: 'Subhead', role: 'LABEL' });
  p2.push(t5h);
  const t5 = text(m1.x, below(t5h, 8), m1.w, 'Do not ask what the shelf holds. Ask what it is wearing. Every object here is dressed rather than designed: a plinth in a striped sock, a lamp with a collar, a table whose legs have clearly been to different parties.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(t5);
  const t6a = text(m1.x, below(t5, 12), m1.w, 'Then sit on something. Most of it is more comfortable than it has any right to be, which is the last joke, and the best one.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(t6a);
  p2.push(text(m1.x, below(t6a, 12), m1.w, 'Leave by the back. The corridor is painted the exact yellow of this page, and the exit sign has been given a pink triangle for company.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' }));
  p2.push(...imageSlot(m2.x, y0, m2.w, 186, { tone: 'light', frame: secondary, frameWidth: 6, shade: alpha(secondary, .12), caption: 'Drop an object', label: 'Image slot' }));
  const mcap = text(m2.x, y0 + 196, m2.w, 'Room set, laminate and lacquered wood. Photographed before anyone sat down.', { size: 9, font: 'fredoka', color: mix(ink, .25), leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(mcap);
  const t3 = text(m2.x, below(mcap, 18), m2.w, 'Walk the room clockwise. The colours are sequenced like a song: yellow to start, a teal bridge, one pink chorus you can see from the street. By the end you stop asking what each thing is for, which is when it starts to work.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(t3);
  const t6 = text(m2.x, below(t3, 12), m2.w, 'The laminate deserves its own paragraph. It is the cheapest material in the room and the loudest, a plastic skin printed with a pattern that was drawn in an afternoon and has outlived most of the furniture it was glued to. Run a hand over it. It feels like a kitchen from a decade that never quite happened.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(t6);
  const t7 = text(m2.x, below(t6, 12), m2.w, 'Prices are on the back of each label, in small type, because the designers wanted you to fall for the thing before you found out what it cost. Some of them are still apologising for that.', { size: 11, font: 'fredoka', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(t7);
  p2.push(text(m2.x, below(t7, 18), m2.w, 'Laminate · Totem · Squiggle\nChecker · Confetti · Half-moon', { size: 10, font: 'spaceGrotesk', weight: 700, color: ink, tracking: .18, transform: 'uppercase', leading: 1.7, label: 'Motif list', role: 'LABEL' }));
  p2.push(path(700, 30, 70, 60, orn.polygonPath(3), secondary, { label: 'Teal triangle' }));
  p2.push(path(560, 964, 200, 100, SEMICIRCLE, accent, { origin: SEMI_ORIGIN, label: 'Pink half-circle' }));
  p2.push(path(90, 986, 120, 30, orn.sineOpenPath(2, 40), 'none', { stroke: ink, strokeWidth: 4, open: true, label: 'Big squiggle' }));
  return [p1, p2];
};

// ─────────────────────────────────────────────────────────────────────────────
// GRUNGE — distress, overprint, fracture. The misregistered title is the idea.
// ─────────────────────────────────────────────────────────────────────────────
const grunge: EraDesigner = ({ W, H, paper, ink, accent, secondary, seed }) => {
  const misreg = (x: number, y: number, w: number, value: string, size: number, o: { align?: 'left' | 'right'; rotation?: number; label: string; leading?: number; wrap?: boolean; ghost?: string; ghostOpacity?: number; role?: 'HEADLINE' | 'DECK' | 'FOLIO' }) => [
    text(x + 5, y + 4, w, value, { size, font: 'oswald', weight: 700, color: o.ghost || accent, opacity: o.ghostOpacity ?? .5, align: o.align, transform: 'uppercase', leading: o.leading ?? .98, wrap: o.wrap ?? false, rotation: o.rotation, label: `${o.label} · misregistered ink`, role: 'ORNAMENT' }),
    text(x, y, w, value, { size, font: 'oswald', weight: 700, color: ink, align: o.align, transform: 'uppercase', leading: o.leading ?? .98, wrap: o.wrap ?? false, rotation: o.rotation, label: o.label, role: o.role || 'HEADLINE' }),
  ];

  // ── Page 1 ──
  const p1: Objs = [ground(W, H, paper)];
  p1.push(path(-40, 180, 700, 160, orn.brushStrokePath(seed), accent, { opacity: .55, blend: 'multiply', rotation: -6, label: 'Brush swipe · oxblood' }));
  p1.push(path(200, 560, 760, 190, orn.brushStrokePath(seed + 2), secondary, { opacity: .5, blend: 'multiply', rotation: 4, label: 'Brush swipe · moss' }));
  p1.push(path(-60, 900, 520, 120, orn.brushStrokePath(seed + 7), ink, { opacity: .18, blend: 'multiply', rotation: -3, label: 'Brush swipe · ink' }));
  p1.push(...orn.specks(0, 0, W, H, 110, ink, seed, .45));
  p1.push(text(60, 64, 400, 'Scene report · Issue 11 · Winter', { size: 12, font: 'specialElite', color: ink, wrap: false, label: 'Kicker', role: 'LABEL' }));
  p1.push(...misreg(60, 100, 660, 'The bass\nthat shook\nthe basement', 92, { rotation: -1.2, label: 'Title' }));
  p1.push(...imageSlot(60, 420, 696, 300, { tone: 'dark', shade: alpha(ink, .55), caption: 'Drop a photograph', label: 'Image slot' }));
  p1.push(path(60, 410, 696, 40, orn.tornEdgePath(seed + 6, 60), paper, { rotation: 180, label: 'Torn edge · top' }));
  p1.push(path(60, 660, 696, 70, orn.tornEdgePath(seed + 4, 40), paper, { label: 'Torn edge · bottom' }));
  p1.push(text(60, 760, 520, copy.deck('music', 0), { size: 15, font: 'bitter', italic: true, color: ink, leading: 1.4, label: 'Deck', role: 'DECK' }));
  p1.push(text(600, 764, 156, 'Words · DJ Marrow\nPhotographs · Kofi Mensah\nRecorded live, no overdubs', { size: 10, font: 'specialElite', color: ink, leading: 1.5, label: 'Credits', role: 'CAPTION' }));
  p1.push(rect(60, 830, 696, 7, ink, { rotation: .4, label: 'Heavy rule' }));
  p1.push(text(60, 856, 420, copy.body('music', 0), { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Teaser body', role: 'BODY' }));
  p1.push(...misreg(640, 896, 116, '01', 64, { align: 'right', label: 'Issue numeral', role: 'FOLIO' }));
  p1.push(path(-10, 1010, W + 20, 60, orn.tornEdgePath(seed + 8, 30), ink, { label: 'Torn foot' }));
  p1.push(text(60, 1034, 300, 'Frequency · a music paper', { size: 9, font: 'specialElite', color: paper, wrap: false, label: 'Running foot', role: 'FOLIO' }));

  // ── Page 2 ──
  const p2: Objs = [ground(W, H, paper)];
  p2.push(...orn.specks(0, 0, W, H, 70, ink, seed + 1, .3));
  p2.push(path(30, 30, 420, 60, orn.brushStrokePath(seed + 3), accent, { opacity: .5, blend: 'multiply', label: 'Brush swipe · head' }));
  p2.push(text(60, 52, 400, 'Frequency · Scene report', { size: 12, font: 'oswald', weight: 500, color: ink, tracking: .16, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(516, 54, 240, 'Issue 11 · Winter', { size: 10, font: 'specialElite', color: ink, align: 'right', wrap: false, label: 'Issue line', role: 'LABEL' }));
  p2.push(rect(60, 84, 696, 8, ink, { rotation: -.3, label: 'Heavy rule' }));
  p2.push(...misreg(60, 112, 500, 'In the stairwell', 44, { label: 'Section head' }));
  const cols = columns(60, 696, 2, 30);
  const c1 = cols[0], c2 = cols[1];
  const g1 = text(c1.x, 180, c1.w, copy.body('music', 0), { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(g1);
  const g2 = text(c1.x, below(g1, 12), c1.w, copy.body('music', 1), { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(g2);
  const gq = misreg(c1.x, below(g2, 22), c1.w, copy.quote('music', 0), 22, { label: 'Pull quote', leading: 1.1, wrap: true, ghostOpacity: .45, role: 'DECK' });
  p2.push(...gq);
  const g2b = text(c1.x, below(gq[1], 22), c1.w, 'The synthesizer belongs to someone’s cousin. It has been in eleven basements this year and has never been tuned, and the twelve producers who share it have agreed, without a meeting, that tuning it would be a betrayal.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(g2b);
  const g2c = text(c1.x, below(g2b, 12), c1.w, 'What you hear on the stairs is not the kick drum but the building answering it. Pipes, a fire door, the long metal handrail that rings at one particular note and no other. The producers know that note. They write around it the way you write around a word you cannot spell.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(g2c);
  const g2d = text(c1.x, below(g2c, 12), c1.w, 'There is no door policy because there is barely a door. You are let in by whoever is nearest, and asked to hold something on the way down. The something is usually a speaker. This is how the scene recruits.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(g2d);
  const g2e = text(c1.x, below(g2d, 12), c1.w, 'By two the room has thinned to the people who live there and the people who cannot find their coats. The cousin’s synthesizer goes back in its case, untuned, and the building stops answering.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' });
  p2.push(g2e);
  p2.push(text(c1.x, below(g2e, 12), c1.w, 'On the walk home the tune you cannot get out of your head is not a tune. It is the handrail, ringing at its one note, and it will still be there in the morning.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 1 body', role: 'BODY' }));
  p2.push(...imageSlot(c2.x, 180, c2.w, 220, { tone: 'dark', shade: alpha(ink, .5), caption: 'Drop a photograph', label: 'Image slot' }));
  p2.push(path(c2.x, 372, c2.w, 40, orn.tornEdgePath(seed + 5, 45), paper, { label: 'Torn edge' }));
  const gc = text(c2.x, 414, c2.w, copy.caption('music', 2), { size: 9, font: 'specialElite', color: ink, leading: 1.4, label: 'Caption', role: 'CAPTION' });
  p2.push(gc);
  const gs = text(c2.x, below(gc, 20), c2.w, 'Twelve producers, one synth', { size: 18, font: 'oswald', weight: 700, color: ink, transform: 'uppercase', label: 'Subhead', role: 'LABEL' });
  p2.push(gs);
  const g3 = text(c2.x, below(gs, 10), c2.w, 'Nobody owns the sound. It moves from flat to flat on a hard drive in a sock, and every week someone adds a layer and someone else takes one away. What survives is whatever nobody could bring themselves to delete.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(g3);
  const g4 = text(c2.x, below(g3, 12), c2.w, 'Ask any of them to name it and they will name the room instead: the one with the pipe that rattles at 80 hertz, the one where the ceiling is too low to stand up straight. The sound is the rooms. The rooms are going.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(g4);
  const g5 = text(c2.x, below(g4, 12), c2.w, 'Two of the basements have already been sold. One is a wine bar now, with the pipe still in the ceiling, painted white; the owner has no idea what note it rings at, and nobody has told him. The third is scheduled for demolition in spring, and the plan, such as it is, is to record there every night until the fences go up.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(g5);
  const g6 = text(c2.x, below(g5, 12), c2.w, 'Whatever comes out of those nights will be the first release with a name on it. Twelve names, probably, in no order anyone agreed to.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' });
  p2.push(g6);
  p2.push(text(c2.x, below(g6, 12), c2.w, 'Until then there is the tape, copied from a copy, with the fridge and the handrail both audible if you know where to listen. Everyone who was there knows where to listen.', { size: 11, font: 'bitter', color: ink, leading: 1.5, label: 'Column 2 body', role: 'BODY' }));
  p2.push(text(60, 1002, 300, 'Frequency · Winter', { size: 9, font: 'specialElite', color: ink, wrap: false, label: 'Running foot', role: 'FOLIO' }));
  p2.push(...misreg(690, 984, 66, '02', 30, { align: 'right', label: 'Folio', role: 'FOLIO' }));
  p2.push(path(-10, 1026, W + 20, 40, orn.tornEdgePath(seed + 3, 45), ink, { label: 'Torn foot' }));
  return [p1, p2];
};

export const DESIGNS: Record<string, EraDesigner> = { dada, psychedelic, punk, 'new-wave': newWave, memphis, grunge };

export const LESSONS: Record<string, DesignLesson> = {
  dada: {
    principle: 'Chance composes, the designer edits: one dominant word holds the page so that every other fragment can fall where it likes and still be read.',
    history: 'Dada began in 1916 at the Cabaret Voltaire in Zürich, where Hugo Ball, Emmy Hennings, Tristan Tzara, Marcel Janco, Hans Arp and Richard Huelsenbeck staged nonsense poems and noise music as a revolt against the war and the culture that had produced it. Its printed matter mixed whatever type the jobbing printer had, set at any angle, and Arp and Tzara made collages and poems "according to the laws of chance". Berlin Dada (Hannah Höch, Raoul Hausmann, John Heartfield) pushed the cut-up into political photomontage, Kurt Schwitters built Merz from tram tickets in Hanover, and the movement fed directly into Surrealism, punk graphics and postmodern typography.',
    tryThis: 'Rotate the black "CHANCE" block to zero degrees and watch the page go quiet; then rotate every fragment except that block and see how much disorder one straight anchor can carry.',
    interestTag: 'Dada',
    related: ['Collage', 'Photomontage', 'Surrealism', 'Punk graphics', 'Typography'],
  },
  psychedelic: {
    principle: 'Vibration is a colour decision: a display face set in gold over teal on violet slows the eye on purpose, while the body copy stays calm, cream and sans-serif so the page can actually be read.',
    history: 'The style crystallised in San Francisco between 1965 and 1971 on concert posters for the Fillmore and the Avalon Ballroom by Wes Wilson, Victor Moscoso, Rick Griffin, and Stanley Mouse with Alton Kelley. Wilson adapted the melting lettering of Vienna Secession designer Alfred Roller; Moscoso, who had studied colour under Josef Albers at Yale, deliberately paired vibrating complementaries to make posters that took time to read. Michael English and Nigel Waymouth carried it to London as Hapshash and the Coloured Coat, and the liquid-lettering vocabulary returned in rave flyers and album art decades later.',
    tryThis: 'Swap the two title layers so the teal sits on top and the gold behind; the word should feel like it has moved a few millimetres closer to you.',
    interestTag: 'Psychedelic art',
    related: ['Concert posters', 'Op art', 'Art Nouveau', 'Hand lettering', '1960s counterculture'],
  },
  punk: {
    principle: 'Wrong on purpose is still a decision: the torn strip, the crooked bar and the tape all sit on a real two-column measure, which is why the page reads as urgent rather than broken.',
    history: 'Punk graphics grew out of the mid-1970s fanzine scene, where photocopiers, typewriters and Letraset let anyone publish overnight: Mark Perry\'s Sniffin\' Glue (1976) set the tone in London, and Jamie Reid\'s ransom-note lettering for the Sex Pistols made the cut-up newspaper headline an emblem. Linder Sterling\'s collages for Buzzcocks, Raymond Pettibon\'s drawings for Black Flag and Winston Smith\'s montages for Dead Kennedys carried the same anti-polish authorship, and the look was later formalised by post-punk designers like Malcolm Garrett and Peter Saville. Its DIY ethic seeded zine culture, riot grrrl and the grunge typography of the 1990s.',
    tryThis: 'Straighten every rotated element to zero degrees. Notice how the page becomes a poster for a bank; now put the rotations back one at a time and stop the moment it feels like a zine again.',
    interestTag: 'Punk graphics',
    related: ['Zines', 'Collage', 'DIY publishing', 'Photocopy art', 'Music posters'],
  },
  'new-wave': {
    principle: 'A grid can be elastic: three columns of different widths, rules that start at different heights, and type layered at three scales still hold together because every element is aligned to something.',
    history: 'New Wave typography came out of Wolfgang Weingart\'s classes at the Basel School of Design in the late 1960s and 1970s, where he pulled apart the Swiss grid he had been taught: stepped rules, letterspaced words, layered film positives and type set at changing sizes. His students April Greiman and Dan Friedman took the approach to the United States, Greiman becoming the first to treat the Macintosh as a design tool in the mid-1980s, and Neville Brody\'s work for The Face made layered, expressive type a magazine language. The style opened the door to Emigre, Cranbrook deconstruction and the digital typography of the 1990s.',
    tryThis: 'Move the pink colour field to the left edge and let the stepped rules run the other way; the layout should still resolve, because the alignments, not the symmetry, are doing the work.',
    interestTag: 'New Wave typography',
    related: ['Swiss typography', 'Postmodern design', 'Layered type', 'Magazine design', 'Basel school'],
  },
  memphis: {
    principle: 'Joy needs a spine: the confetti, squiggles and totem shapes can riot only because the title block and the white text panel are dead level and rectangular.',
    history: 'Memphis was founded in Milan in December 1980 by Ettore Sottsass with a group of younger designers including Michele De Lucchi, Nathalie du Pasquier, George Sowden, Martine Bedin, Matteo Thun, Marco Zanini and Aldo Cibic, and took its name from a Bob Dylan song playing that night. Its first collection at the 1981 Salone del Mobile paired cheap plastic laminate, notably Sottsass\'s "Bacterio" squiggle pattern, with marble and lacquer in colours the design establishment considered bad taste on purpose. Sottsass left in 1985 and the group disbanded in 1988, but its patterns shaped 1980s pop graphics and returned as a major influence in the 2010s.',
    tryThis: 'Change the yellow ground to white and the black title block to yellow. If the page stops laughing, you have found out how much of Memphis is the clash itself.',
    interestTag: 'Memphis Milano',
    related: ['Postmodern design', 'Italian design', 'Pattern', 'Furniture design', '1980s graphics'],
  },
  grunge: {
    principle: 'Misregistration is hierarchy by other means: the offset second impression of the headline gives it weight and motion, so the body can stay sober and the rest of the page can look worn without looking careless.',
    history: 'Grunge editorial design grew up with the music in the late 1980s and 1990s: Art Chantry\'s hand-made posters and Rocket covers in Seattle, the Sub Pop record label\'s photocopied identity, and above all David Carson\'s art direction of Beach Culture (1989–91) and Ray Gun (1992–), where overlapping type, distressed faces and broken columns made reading itself part of the mood. Emigre\'s digital typefaces and Cranbrook\'s deconstruction gave it a theoretical edge; Carson\'s decision to set an interview in an unreadable dingbat font became the movement\'s emblem. Its textures resurfaced in early web design and in today\'s maximalist print.',
    tryThis: 'Delete the misregistered copy of the headline and the specks. What is left is a clean music paper; add the offset copy back and move it by two pixels at a time until the title feels like it is vibrating rather than blurred.',
    interestTag: 'Grunge design',
    related: ['David Carson', 'Zines', 'Music papers', 'Distressed type', '1990s design'],
  },
};

export const OVERRIDES: Record<string, Partial<TelaStyleEra>> = {
  // Yellow ground, black ink (the library's indigo "ink" was too soft for body copy; indigo survives as a shape colour).
  memphis: { palette: ['#F4E36D', '#1A1A1E', '#EF5C79', '#27A9A1'], typography: 'Wide geometric mono display with a rounded, friendly text sans' },
  grunge: { typography: 'Misregistered condensed display over a sturdy slab body and typewriter labels' },
  psychedelic: { typography: 'Liquid display lettering, vibrating colour pairs, and a plain readable sans body' },
};
