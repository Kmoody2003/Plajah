// ancientMedieval — hand-designed style-era documents (see docs/tela/TEMPLATE_DESIGN_BRIEF.md).
//
// Ten eras, two pages each: an opener (the poster moment) and a usable interior
// (columns, running head, folio, one image slot). Every page is built from the
// templateKit vocabulary so each piece stays editable in the studio.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson, EraDesigner } from '../types';
import type { TelaStyleEra } from '../../../telaStyleEraLibrary';
import { rect, ellipse, circle, line, hr, vr, path, text, below, imageSlot, columns, frame, dropCap, mix, alpha } from '../../templateKit';
import type { FontKey } from '../../telaFonts';
import { copy } from '../../copy';
import * as orn from '../../ornaments';

type O = TelaVectorObject;

// ── Shared vocabulary ─────────────────────────────────────────────────────────

/**
 * Filled Greek key (meander) unit in a 0..100 box — seven abutting bars, so the
 * evenodd fill stays solid. Tile it with `orn.frieze` at gap 0 and the units
 * link into a continuous running key.
 */
const MEANDER_D = [
  'M0 84 L100 84 L100 100 L0 100 Z',   // base line
  'M0 0 L16 0 L16 84 L0 84 Z',         // left riser
  'M16 0 L84 0 L84 16 L16 16 Z',       // top bar
  'M68 16 L84 16 L84 68 L68 68 Z',     // right drop
  'M32 52 L68 52 L68 68 L32 68 Z',     // inner return
  'M32 32 L48 32 L48 52 L32 52 Z',     // inner riser
  'M48 32 L64 32 L64 48 L48 48 Z',     // terminal nub
].join(' ');

interface FlowOpts { size: number; font: FontKey; color: string; leading?: number; italic?: boolean; weight?: number; gap?: number; label: string }
/** Paragraphs stacked down a column, each its own object; stops before `bottom`. Returns the y after the last block. */
function flow(out: O[], x: number, y: number, w: number, bottom: number, paras: string[], o: FlowOpts): number {
  let cy = y;
  for (let i = 0; i < paras.length; i++) {
    const t = text(x, cy, w, paras[i], { size: o.size, font: o.font, color: o.color, leading: o.leading ?? 1.5, italic: o.italic, weight: o.weight, label: `${o.label} ¶${i + 1}`, role: 'BODY' });
    if (cy + t.h > bottom) break;
    out.push(t); cy = below(t, o.gap ?? o.size * .9);
  }
  return cy;
}

/** A laurel branch: a stem with paired leaves, growing left (dir −1) or right (dir 1) from cx. */
function laurel(cx: number, y: number, len: number, dir: 1 | -1, color: string, leaf = 26): O[] {
  const out: O[] = [line(cx, y, cx + dir * len, y, color, 1.2, { label: 'Laurel stem' })];
  const n = 5, step = len / n;
  for (let i = 0; i < n; i++) {
    const lx = cx + dir * step * (i + .5), s = leaf * (1 - i * .09);
    out.push(path(lx - s / 2, y - s - 1, s, s, orn.leafPath(), color, { rotation: dir * 38, label: 'Laurel leaf' }));
    out.push(path(lx - s / 2, y + 1, s, s, orn.leafPath(), color, { rotation: dir * 142, label: 'Laurel leaf' }));
  }
  return out;
}

const ground = (W: number, H: number, fill: string) => rect(0, 0, W, H, fill, { label: 'Ground', role: 'GROUND' });

// ── Prose ─────────────────────────────────────────────────────────────────────

const CLASSICAL_P = [
  'Vitruvius opens his ten books by asking what an architect must know, and the list is long: drawing, geometry, history, philosophy, music, medicine, law and the movements of the heavens. The point is not erudition for its own sake. A building serves people, and the person who designs it must understand the people it serves.',
  'Every order begins with a module, the diameter of the column at its base. From that single measure the height of the shaft, the depth of the capital, the spacing of the columns and the weight of the entablature are all derived. Change the module and the whole temple grows or shrinks in proportion, like a body.',
  'The Doric is severe and closely spaced; the Ionic carries its volutes like a scroll half unrolled; the Corinthian rises to a bell of acanthus leaves. Vitruvius reads character into each of them, and later architects read his reading, so that a courthouse and a bank still argue in the same stone grammar.',
  'What the inscription cutters knew, the page inherits. Letters spaced to breathe, a centred axis, a base line that behaves like a plinth: these are not decorations but the discipline that lets a wall speak slowly to a crowd.',
  'Inscriptions were painted before they were cut. A signwriter laid out the letters with a flat brush, which is why the serifs flare the way they do and why the strokes thicken and thin: the chisel followed the brush, and the brush followed the hand.',
  'The entablature is three things stacked: architrave, frieze and cornice; load, story and shelter. A page built the same way puts its heaviest rule lowest, its ornament in the middle band and its lightest line on top, so the eye reads weight the way the body does.',
  'The meander that runs along the head and foot of this page is the oldest border in Western design, a river bent into right angles. It works because it never ends; the eye finds the rhythm and stops counting.',
];
const EGYPT_P = [
  'The revival did not begin in Egypt. It began in Paris, in the folio plates of the Description de l’Égypte, published from 1809, where the surveyors who had travelled with Napoleon’s army drew temples with a draughtsman’s cold accuracy. Europe saw pylons, papyrus columns and winged discs rendered as measured elevations, and set about copying them.',
  'Obelisks travelled. The Luxor obelisk was raised in the Place de la Concorde in 1836; London’s stood on the Embankment by 1878 and New York’s in Central Park by 1881. Each was a public argument that the modern city could inherit the oldest monuments on earth.',
  'The second wave came with a discovery. When Howard Carter opened the tomb of Tutankhamun in 1922, the vocabulary of the revival poured into cinemas, jewellery, textiles and the stepped profiles of Art Deco. Lotus and sun disc became the shapes of modern glamour.',
  'What the style asks of a page is frontality. Symmetry down the axis, bands that read like courses of masonry, ornament confined to friezes, and a title held in a cartouche, the rounded loop that once enclosed a royal name.',
  'In London, the Egyptian Hall opened on Piccadilly in 1812 with battered walls and papyrus capitals, a shop and exhibition room that later showed Belzoni’s finds from the tombs alongside panoramas and curiosities. The style was popular long before it was respectable.',
  'Egyptian Revival suited cemeteries and prisons for reasons that need no explaining: the architecture of eternity and the architecture of massive walls. Highgate Cemetery’s Egyptian Avenue, opened in 1839, still leads mourners between lotus columns.',
  'The palette is the one the temple painters used: a ground of deep blue or night, ochre and terracotta for flesh and earth, and gold for anything meant to last. On a page, keep the gold for rules and the title, and let the blue do the work of silence.',
];
const MOSAIC_P = [
  'A Roman floor was assembled twice. In the workshop, the picture at its centre, the emblema, was set into a tray of stone or terracotta so it could travel finished; on site, the surrounding field of plainer tesserae was laid around it by local hands. The join is often visible, and it tells you where the skill was spent.',
  'Tesserae were cut from limestone, marble, terracotta and, for the brightest colours, glass. The finest work, opus vermiculatum, used cubes of a few millimetres and laid them in worm-like curves that follow the contour of a face or a fish. The coarser opus tessellatum filled borders and floors with geometric rhythm.',
  'Borders did the structural work of the page. Guilloche, meander, wave and braid ran around the picture the way rules and margins run around a column of type, telling the eye where the floor ended and the story began.',
  'At the Villa Romana del Casale near Piazza Armerina, in Sicily, some 3,500 square metres of fourth-century floor survive, from hunting scenes to athletes in what look like bikinis. The floors were the house’s public voice, read by every guest who crossed them.',
  'Look at the grout. Roman setters left a hair of mortar between each cube, and the network of joins reads as a second drawing over the first, softening every edge. Modern reproductions that fit the tesserae tight look wrong for exactly this reason.',
  'The workshops signed their work rarely, but they repeated their patterns often, and a guilloche of a particular twist can be followed from one town to the next like a maker’s mark. Pattern was portable in a way that painting was not.',
  'For the page, the lesson is proportion of effort: a fine centre, a firm border and a plain field between. Most of the floor was never meant to be looked at, only walked across on the way to the picture.',
];
const BYZ_P = [
  'The mosaicists of Ravenna set their gold tesserae at a slight tilt, so that a wall would catch lamplight from below and seem to move. Gold was not a colour to them but a light source: leaf sandwiched between two layers of glass, it turned the apse into a burning sky.',
  'In Hagia Sophia, consecrated in 537 under Justinian, the dome appears to float on a ring of windows. The effect was designed, not accidental; Procopius wrote that it seemed suspended from heaven by a golden chain. Architecture and liturgy were composed together, as one work.',
  'An icon is read by rank. The largest figure is the holiest; frontal gaze outranks profile; gold ground outranks landscape. The page borrows this discipline: a single centred image, a hierarchy of capitals, and margins wide enough to hold silence.',
  'A lectionary keeps a wide margin on purpose. Feast days, notes and the names of the dead were written there by successive hands, and a book that had been used for a century carried its congregation in the margins as much as in the text.',
  'Purple was the imperial colour, made from the murex shell at great cost, and gold on purple was reserved for the highest rank of manuscript. The pairing survives here as a page ground and a title colour, which is about as close to a throne room as a document gets.',
];
const INSULAR_OPEN = [
  'The hours before dawn belong to no one. In the scriptorium the lamps are lit, the vellum is ruled, and the first letter of the day is drawn slowly, larger than any that follow, because a beginning deserves to be seen before it is read.',
  'The scribe rules the page first. With a hard point he scores lines into the skin, faint furrows that guide the pen and can still be seen against the light. Only then does the ink go on: oak-gall black for the text, red lead for the rubrics, and last of all the initial.',
  'Around the great letters of the Book of Kells and the Lindisfarne Gospels, tiny red dots follow the outline, sometimes thousands on a single page. The dotting lifts the letter off the vellum and slows the eye, which is the point: the opening word of a Gospel was meant to be looked at before it was read.',
];
const INSULAR_P = [
  'Interlace is discipline pretending to be chaos. Every strand passes over, then under, then over again, and a single break in the rhythm shows. The knot is a way of filling a space with movement while keeping it whole, and the scribes who drew it worked from compass points pricked into the vellum.',
  'Uncial and half-uncial letters are round because the pen was held nearly flat; the thick strokes fall on the curves rather than the verticals. When the same hands carried the script from Ireland to Northumbria and on to the Continent, it became a mark of where a book had been made.',
  'A carpet page is a whole leaf given over to pattern, placed before a Gospel like a threshold. Nothing on it is text, yet it is read: the eye follows the strands, loses them, finds them again, and arrives at the first words already slowed to the pace of the book.',
  'The page you are reading keeps that pace. One column, ruled faintly, a margin of knotwork on the binding side and a rubric in red where the sense changes. It is a slow format on purpose.',
  'The pages were prepared long before they were written. Calfskin was soaked, scraped, stretched and rubbed smooth with pumice, and a great Gospel book could need the skins of well over a hundred animals. The cost is one reason the decoration is so lavish: the material demanded it.',
  'Irish scribes did something their Roman predecessors had not: they separated words with spaces. The habit spread with their books, made silent reading practical, and has been inherited by every page since without anyone noticing.',
  'The margin on the binding side of this page carries the knotwork because that is where the eye rests between lines. The outer margin is left for the reader, and for the miniature.',
];
const GOTHIC_P = [
  'The pointed arch is a structural argument. Because it can be made steeper or shallower without changing its span, it lets vaults of different widths meet at the same height, and it throws the weight of the roof down more nearly vertically, onto piers rather than walls. Once the wall stopped carrying, it could open.',
  'Abbot Suger rebuilt the choir of Saint-Denis in the 1140s and wrote about the light, lux nova, that filled it. The stained glass was not decoration on the architecture; it was the reason for it. Flying buttresses stood outside to hold the thrust so that inside there could be colour.',
  'Tracery grew from bars of stone to lace. At Chartres the roses are still plate tracery, openings cut through a wall; a century later Rayonnant windows are all thin ribs and glass, and the stone seems to have been drawn rather than built.',
  'Blackletter belongs here for a reason. The compressed, vertical rhythm of textura, the script Gutenberg cut for his Bible in the 1450s, reads like a row of piers. Used for a masthead and nothing else, it does what a cathedral front does: it announces.',
  'The rose window is a diagram of order. Its tracery radiates from a centre through rings of lobes and lights, and the glaziers filled each cell with a figure or a sign, so that a congregation that could not read could still follow the argument from the middle outward.',
  'Gothic was a workshop culture. Master masons moved between sites carrying templates, and the same moulding profile appears at Reims and at Westminster within a decade. The style spread through drawings on parchment and boards, not through books.',
  'The two narrow columns here are a nave and an aisle, and the pier between them carries the page. Keep the type upright and closely leaded and the columns will feel tall, which is the only thing a Gothic page needs to feel.',
];
const RENAISSANCE_P = [
  'The canon is a construction, not a measurement. Draw the page’s diagonal and the diagonal of the two-page spread; where a line from their crossing meets the head, drop a vertical, and the text block falls into place with its inner margin half its outer and its head half its foot. Van de Graaf published the method in 1946, but the pages it describes were being made in the fifteenth century.',
  'In 1501 Aldus Manutius issued a Virgil small enough to carry, set in the first italic type, cut by Francesco Griffo. The book was a proposal about reading: that a classic could belong to a person, not a lectern. The margins stayed generous. Human scale did not mean cramped.',
  'Leonardo’s drawing of a man inscribed in a circle and a square illustrates Vitruvius, but it also illustrates a habit of mind. Proportion was believed to be discoverable, the same in a body, a temple and a letterform. Pacioli’s De divina proportione, printed in Venice in 1509, set out the golden ratio in words and in Leonardo’s plates.',
  'The gloss in the outer margin is where the reader answers back. Renaissance printers left room for it on purpose, and a page was not considered finished until someone had written in it.',
  'Jenson’s roman of 1470 is the type most later romans descend from. Its lowercase was drawn from the humanist hand of the Florentine scribes, who had themselves gone back to Carolingian minuscule in the belief that it was ancient. The Renaissance revived a revival.',
  'The margins of a book were not waste. They were where the eye rested, where the thumbs held, and where the scholar wrote. A page with narrow margins was considered cheap not because it saved paper but because it left nowhere for the reader to be.',
];
const BAROQUE_P = [
  'Caravaggio lit his figures from a single high source and let the rest of the canvas fall into darkness. The method, tenebrism, was not a mood but a device for attention: the eye goes to the light because there is nowhere else for it to go. A page can do the same with one bright field and a dark ground.',
  'The diagonal is the Baroque line. Where the Renaissance composed on the horizontal and vertical, Rubens and Bernini set their figures along a slant that seems to be in the middle of moving. Set a title at eight degrees and it stops sitting on the page and starts crossing it.',
  'Abundance was a strategy. After the Council of Trent the Church wanted art that persuaded, and persuasion meant scale, gold, drama and no empty corners. The scroll ornaments that crowd a Baroque frame were doing rhetorical work.',
  'Read the room as a page: a dark ground, a single burst of warm light, and the eye led along a diagonal from one bright detail to the next. The drama is in the contrast, and the contrast is in the restraint everywhere the light is not.',
  'Bernini’s Ecstasy of Saint Teresa, finished in 1652, is lit by a hidden window above the sculpture, so that real daylight falls down gilded rays onto the marble. The Baroque did not represent light; it staged it.',
  'The Baroque book followed the Baroque room. Engraved title pages became architecture, with columns, curtains and allegorical figures framing a few lines of type, and the contrast between hairline and thick stroke grew until, with Bodoni and Didot, it snapped into the Didone letter.',
  'Restraint is the Baroque secret. The scrolls are heavy because the ground is empty, the light is bright because most of the page is dark, and the diagonal works because everything else is level.',
];
const ROCOCO_P = [
  'Rococo happened indoors. After the death of Louis XIV in 1715 the court drifted from Versailles to Paris, and the aristocracy built town houses whose small rooms wanted small, light ornament. The rocaille, a shell-and-rock motif that never repeats exactly, spread from fountains to wall panels to the corners of a printed page.',
  'Juste-Aurèle Meissonnier, goldsmith and designer to Louis XV, published engravings in the 1730s in which the frame and the thing framed cannot be told apart. Asymmetry was the point: a C-scroll answered by a smaller one, a spray of leaves on one side and air on the other.',
  'Boucher and Fragonard painted in pastel because the rooms were pastel, and the rooms were pastel because candlelight is kind to pink and mint and gold. The palette was a lighting decision before it was a taste.',
  'Set a page the Rococo way and the empty space becomes an ingredient. The title sits low, the ornament floats high, and nothing is centred, because the eye is meant to wander as a guest wanders a salon.',
  'The style travelled fast through engravings. Ornament books by Meissonnier, Pineau and Cuvilliés were copied in Bavaria, Portugal and Potsdam, where Frederick the Great’s Sanssouci became the Rococo palace of a court that spoke French.',
  'Rococo type was light and sloped. Fournier le jeune in Paris cut delicate printers’ flowers that could be assembled into borders, and his Manuel typographique of 1764 treated the printed page as an interior to be furnished.',
  'Notice what the page does not do. Nothing is centred, nothing is boxed, and the running head sits in a scalloped band because a straight rule would have been too serious for the room.',
];
const NEO_P = [
  'Neoclassicism was archaeology with a conscience. The excavations at Herculaneum from 1738 and Pompeii from 1748 gave Europe real Roman rooms to measure, and Johann Joachim Winckelmann, writing in 1755, told it what to feel about them: noble simplicity and quiet grandeur.',
  'In Parma, Giambattista Bodoni cut types with hairline serifs and a vertical stress that had never existed in metal before. His Manuale tipografico, published by his widow in 1818, is the movement’s typographic constitution: wide margins, tracked capitals, and a refusal of ornament that is itself a kind of ornament.',
  'The medallion, the fasces, the laurel and the Greek key were civic before they were decorative. Revolutionary France and the early American republic borrowed them to say that a new state stood in an old tradition of law. A page that uses them should keep its axis straight and its voice low.',
  'Jacques-Louis David painted the Oath of the Horatii in 1784 with the rigour of a stage set: three arches, a bare floor, the figures aligned to the front plane. That is the neoclassical page: everything centred, everything measured, nothing that cannot be justified.',
  'Robert Adam came back from Rome in 1758 with drawings of Diocletian’s palace and remade British interiors in low relief, pale colour and strict symmetry; Thomas Jefferson carried the same lesson to Virginia, where the University’s Rotunda is a half-scale Pantheon.',
  'The Didone letter is a machine for authority. Vertical stress, hairline serifs and a hard contrast between thick and thin give it the look of an engraved inscription, which is why it still appears on banknotes, courthouses and the mastheads of newspapers of record.',
  'This page keeps its columns even, its subheads in small capitals and its folio inside a medallion, because the neoclassical reader expected to be addressed formally and expected the address to be short.',
];

// ── 1. Classical — the stele ─────────────────────────────────────────────────

const classical: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const fr = frame(W, H, 72);
  const gold = mix(secondary, -.12), terra = accent;

  const p1: O[] = [ground(W, H, paper)];
  p1.push(...orn.frieze(fr.x, fr.y, fr.w, 24, MEANDER_D, ink, 0, { label: 'Meander frieze (head)' }));
  p1.push(hr(fr.x, fr.y + 36, fr.w, ink, 3, { label: 'Architrave rule' }), hr(fr.x, fr.y + 44, fr.w, ink, 1, { label: 'Entablature rule' }), hr(fr.x, fr.y + 50, fr.w, terra, 1, { label: 'Entablature rule (terracotta)' }));
  p1.push(text(fr.x, 156, fr.w, 'MMXXVI · A TREATISE IN TEN BOOKS · LIBER I', { size: 11, font: 'tenor', color: terra, align: 'center', tracking: .32, transform: 'uppercase', wrap: false, label: 'Date line', role: 'LABEL' }));
  const title = text(fr.x, 192, fr.w, 'THE MEASURE\nOF THE CITY', { size: 62, font: 'cinzel', weight: 600, color: ink, align: 'center', tracking: .18, leading: 1.08, label: 'Title', role: 'HEADLINE' });
  p1.push(title);
  p1.push(hr(fr.cx - 110, below(title, 22), 220, gold, 1.5, { label: 'Engraved rule' }));
  const deck = text(fr.cx - 230, below(title, 40), 460, 'Proportion, civic clarity and the architecture of public speech, from Vitruvius to the courthouse steps', { size: 17, font: 'marcellus', color: ink, align: 'center', leading: 1.4, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  const ly = below(deck, 48);
  p1.push(...laurel(fr.cx - 14, ly, 150, -1, mix(gold, -.1)), ...laurel(fr.cx + 14, ly, 150, 1, mix(gold, -.1)));
  p1.push(circle(fr.cx, ly, 4, terra, { label: 'Laurel knot' }));
  const sy = ly + 48;
  p1.push(...imageSlot(fr.cx - 240, sy, 480, 286, { tone: 'light', frame: ink, frameWidth: 1, caption: 'Relief panel', label: 'Relief image slot' }));
  p1.push(text(fr.cx - 240, sy + 298, 480, 'Fragment of an entablature, marble, Roman, first century CE.', { size: 9.5, font: 'tenor', color: mix(ink, .25), align: 'center', tracking: .06, label: 'Caption', role: 'CAPTION' }));
  p1.push(text(fr.x, 868, fr.w, 'INSCRIBED BY IMANI OKAFOR · SET IN CINZEL AND MARCELLUS', { size: 10, font: 'tenor', color: ink, align: 'center', tracking: .28, transform: 'uppercase', wrap: false, label: 'Byline', role: 'LABEL' }));
  p1.push(hr(fr.x, 928, fr.w, terra, 1, { label: 'Entablature rule (terracotta)' }), hr(fr.x, 934, fr.w, ink, 1, { label: 'Entablature rule' }), hr(fr.x, 942, fr.w, ink, 3, { label: 'Architrave rule' }));
  p1.push(...orn.frieze(fr.x, fr.bottom - 24, fr.w, 24, MEANDER_D, ink, 0, { label: 'Meander frieze (foot)' }));

  const p2: O[] = [ground(W, H, paper)];
  p2.push(text(fr.x, 60, fr.w, 'LIBER I · DE ARCHITECTURA · ON THE ORDERS', { size: 9.5, font: 'tenor', color: ink, align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(hr(fr.x, 80, fr.w, ink, .75, { label: 'Head rule' }));
  p2.push(text(fr.x, 110, fr.w, 'II · Of the Orders', { size: 26, font: 'cinzel', weight: 500, color: ink, align: 'center', tracking: .08, label: 'Chapter head', role: 'HEADLINE' }));
  p2.push(hr(fr.x, 154, fr.w, ink, 3, { label: 'Architrave rule' }), hr(fr.x, 162, fr.w, terra, 1, { label: 'Entablature rule' }));
  const cols = columns(fr.x, fr.w, 2, 28);
  const bottom = 930;
  const [cap, first] = dropCap(cols[0].x, 188, cols[0].w, CLASSICAL_P[0], { capFont: 'cinzel', textFont: 'marcellus', capSize: 58, size: 12, color: ink, capColor: terra, leading: 1.55 });
  cap.objectLabel = 'Drop cap'; first.objectLabel = 'Column 1 body ¶1';
  p2.push(cap, first);
  let y = flow(p2, cols[0].x, below(first, 11), cols[0].w, bottom, [CLASSICAL_P[1]], { size: 12, font: 'marcellus', color: ink, leading: 1.55, label: 'Column 1 body' });
  const sub = text(cols[0].x, y + 6, cols[0].w, 'THE MODULE', { size: 11.5, font: 'cinzel', weight: 600, color: terra, tracking: .2, wrap: false, label: 'Subhead', role: 'LABEL' });
  p2.push(sub, hr(cols[0].x, below(sub, 6), 48, terra, 1, { label: 'Subhead rule' }));
  flow(p2, cols[0].x, below(sub, 18), cols[0].w, bottom, [CLASSICAL_P[2], CLASSICAL_P[4], CLASSICAL_P[5], copy.body('editorial', 0)], { size: 12, font: 'marcellus', color: ink, leading: 1.55, label: 'Column 1 body (cont.)' });
  p2.push(...imageSlot(cols[1].x, 188, cols[1].w, 200, { tone: 'light', frame: ink, frameWidth: 1, caption: 'Plate', label: 'Column 2 image slot' }));
  const c2cap = text(cols[1].x, 396, cols[1].w, 'The three orders compared, after a plate in the 1521 Como edition of Vitruvius.', { size: 9.5, font: 'tenor', color: mix(ink, .25), leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(c2cap);
  const qy = below(c2cap, 22);
  p2.push(hr(cols[1].x, qy, cols[1].w, gold, 1, { label: 'Pull quote rule' }));
  const quote = text(cols[1].x, qy + 12, cols[1].w, '“A building is a body. Measure it as you would measure yourself.”', { size: 16, font: 'marcellus', color: ink, align: 'center', leading: 1.35, label: 'Pull quote', role: 'DECK' });
  p2.push(quote, hr(cols[1].x, below(quote, 12), cols[1].w, gold, 1, { label: 'Pull quote rule' }));
  flow(p2, cols[1].x, below(quote, 32), cols[1].w, bottom, [CLASSICAL_P[3], CLASSICAL_P[6], copy.body('editorial', 2), copy.body('editorial', 1)], { size: 12, font: 'marcellus', color: ink, leading: 1.55, label: 'Column 2 body' });
  p2.push(hr(fr.cx - 96, 991, 60, ink, .75, { label: 'Folio rule' }), hr(fr.cx + 36, 991, 60, ink, .75, { label: 'Folio rule' }));
  p2.push(text(fr.cx - 30, 984, 60, 'XLVII', { size: 11, font: 'cinzel', weight: 500, color: ink, align: 'center', tracking: .16, wrap: false, label: 'Folio (roman)', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 2. Egyptian Revival — the cartouche ──────────────────────────────────────

const egyptianRevival: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const navy = paper, cream = ink, gold = accent, terra = secondary;

  const p1: O[] = [ground(W, H, navy)];
  p1.push(rect(36, 36, W - 72, H - 72, 'none', { stroke: gold, strokeWidth: 1.5, label: 'Outer frame' }), rect(46, 46, W - 92, H - 92, 'none', { stroke: alpha(gold, .5), strokeWidth: .75, label: 'Inner frame' }));
  p1.push(...orn.stripes(120, 74, 576, 26, 32, 2, gold, { vertical: true, opacity: .7, label: 'Papyrus stem rhythm (head)' }));
  p1.push(hr(120, 108, 576, gold, 1, { label: 'Papyrus rule' }), hr(120, 114, 576, terra, 3, { label: 'Papyrus rule (terracotta)' }));
  p1.push(path(150, 160, 230, 96, orn.fanPath(8), gold, { rotation: -16, opacity: .92, label: 'Left wing (fan)' }), path(436, 160, 230, 96, orn.fanPath(8), gold, { rotation: 16, opacity: .92, label: 'Right wing (fan)' }));
  p1.push(circle(408, 210, 56, gold, { label: 'Sun disc' }), ...orn.rings(408, 210, [66], terra, 2.5, { label: 'Sun disc ring' }));
  p1.push(text(108, 300, 600, 'THE PLAJAH ANTIQUITIES REVIEW · NUMBER XII', { size: 11, font: 'josefin', weight: 400, color: cream, align: 'center', tracking: .34, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
  p1.push(hr(120, 326, 576, gold, 1, { label: 'Papyrus rule' }), hr(120, 332, 576, terra, 3, { label: 'Papyrus rule (terracotta)' }), hr(120, 340, 576, gold, 1, { label: 'Papyrus rule' }));
  p1.push(rect(108, 380, 600, 176, mix(navy, .05), { rx: 88, stroke: gold, strokeWidth: 3, label: 'Cartouche' }), rect(118, 390, 580, 156, 'none', { rx: 78, stroke: alpha(gold, .55), strokeWidth: 1, label: 'Cartouche inner line' }), rect(712, 424, 12, 88, gold, { rx: 2, label: 'Cartouche bar' }));
  const title = text(128, 0, 560, 'THE RIVER\nREMEMBERS', { size: 58, font: 'staatliches', color: cream, align: 'center', tracking: .06, leading: 1.02, label: 'Title', role: 'HEADLINE' });
  title.y = 380 + (176 - title.h) / 2; p1.push(title);
  p1.push(text(168, 586, 480, 'A survey of the revival, from the Description de l’Égypte to the cinema façades of 1925', { size: 14, font: 'josefin', weight: 300, color: cream, align: 'center', leading: 1.5, tracking: .04, label: 'Deck', role: 'DECK' }));
  p1.push(...orn.frieze(108, 660, 600, 44, orn.lotusPath(), gold, 10, { label: 'Lotus frieze' }));
  p1.push(hr(120, 716, 576, gold, 1, { label: 'Papyrus rule' }), hr(120, 722, 576, terra, 3, { label: 'Papyrus rule (terracotta)' }));
  p1.push(circle(408, 762, 10, gold, { label: 'Apex disc' }), path(258, 772, 300, 150, orn.stepPyramidPath(5), terra, { opacity: .95, label: 'Step pyramid' }));
  p1.push(...orn.stripes(120, 940, 576, 26, 32, 2, gold, { vertical: true, opacity: .7, label: 'Papyrus stem rhythm (foot)' }));
  p1.push(text(108, 984, 240, 'VOL. I · MMXXVI', { size: 10, font: 'bigShoulders', weight: 600, color: gold, tracking: .3, wrap: false, label: 'Volume label', role: 'LABEL' }));
  p1.push(text(468, 984, 240, 'ANTIQUITIES · ARCHITECTURE', { size: 10, font: 'bigShoulders', weight: 600, color: gold, tracking: .3, align: 'right', wrap: false, label: 'Section label', role: 'LABEL' }));

  const p2: O[] = [ground(W, H, cream)];
  for (const px of [40, 712]) {
    p2.push(rect(px, 40, 64, 976, navy, { label: 'Pylon band' }));
    p2.push(...orn.stripes(px + 12, 120, 40, 800, 3, 2, gold, { vertical: true, opacity: .8, label: 'Pylon fluting' }));
    p2.push(path(px + 8, 52, 48, 48, orn.lotusPath(), gold, { label: 'Pylon capital (lotus)' }));
    p2.push(rect(px, 976, 64, 40, terra, { label: 'Pylon base' }));
  }
  p2.push(text(136, 60, 272, 'THE REVIVAL · CHAPTER III', { size: 10.5, font: 'bigShoulders', weight: 600, color: navy, tracking: .32, wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(408, 60, 272, '24', { size: 10.5, font: 'bigShoulders', weight: 600, color: navy, tracking: .32, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
  p2.push(hr(136, 80, 544, gold, 2, { label: 'Head rule' }), hr(136, 85, 544, navy, .75, { label: 'Head hairline' }));
  const sub = text(136, 104, 544, 'OBELISKS ABROAD', { size: 36, font: 'staatliches', color: navy, tracking: .06, label: 'Subhead', role: 'HEADLINE' });
  p2.push(sub);
  const deck = text(136, below(sub, 10), 544, 'How three monoliths crossed the sea and taught Paris, London and New York to stand up straight', { size: 12.5, font: 'josefin', weight: 300, italic: true, color: terra, leading: 1.45, label: 'Deck', role: 'DECK' });
  p2.push(deck, hr(136, below(deck, 14), 544, gold, 1, { label: 'Deck rule' }));
  const cols = columns(136, 544, 2, 28);
  const top = below(deck, 32), bottom = 930;
  flow(p2, cols[0].x, top, cols[0].w, bottom, [EGYPT_P[0], EGYPT_P[1], EGYPT_P[2], EGYPT_P[4], copy.body('culture', 0)], { size: 11.5, font: 'josefin', color: navy, leading: 1.65, label: 'Column 1 body' });
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 176, { tone: 'light', frame: navy, frameWidth: 1, caption: 'Plate', label: 'Column 2 image slot' }));
  const c2cap = text(cols[1].x, top + 184, cols[1].w, 'The Luxor obelisk, Place de la Concorde, raised 1836.', { size: 9.5, font: 'josefin', italic: true, color: navy, leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(c2cap);
  const qy = below(c2cap, 20);
  p2.push(hr(cols[1].x, qy, cols[1].w, gold, 1.5, { label: 'Pull quote rule' }));
  const quote = text(cols[1].x, qy + 12, cols[1].w, 'FRONTALITY IS A FORM OF MANNERS: THE PAGE FACES YOU, AND WAITS.', { size: 17, font: 'staatliches', color: terra, leading: 1.25, tracking: .03, label: 'Pull quote', role: 'DECK' });
  p2.push(quote, hr(cols[1].x, below(quote, 12), cols[1].w, gold, 1.5, { label: 'Pull quote rule' }));
  flow(p2, cols[1].x, below(quote, 32), cols[1].w, bottom, [EGYPT_P[3], EGYPT_P[5], EGYPT_P[6], copy.body('culture', 1)], { size: 11.5, font: 'josefin', color: navy, leading: 1.65, label: 'Column 2 body' });
  p2.push(...orn.frieze(136, 950, 544, 22, orn.lotusPath(), gold, 6, { label: 'Lotus frieze (foot)' }));
  p2.push(text(136, 988, 544, 'THE PLAJAH ANTIQUITIES REVIEW', { size: 9, font: 'bigShoulders', weight: 600, color: navy, tracking: .36, align: 'center', wrap: false, label: 'Running foot', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 3. Roman Mosaic — the tessellated floor ──────────────────────────────────

const romanMosaic: EraDesigner = ({ W, H, paper, ink, accent, secondary, seed }) => {
  const sand = paper, ox = ink, teal = accent, ochre = secondary;
  const tess = [ox, teal, ochre, mix(sand, -.18), '#F5EBD6'];
  const fr = frame(W, H, 72);

  const p1: O[] = [ground(W, H, sand)];
  p1.push(...orn.mosaic(48, 48, 720, 48, 24, tess, seed, { label: 'Tessera (head band)' }));
  p1.push(...orn.mosaic(48, 960, 720, 48, 24, tess, seed + 1, { label: 'Tessera (foot band)' }));
  for (const cx of [68, 748]) {
    p1.push(path(cx - 432, 508, 864, 40, orn.wavePath(9, 26, 14, 0), ox, { rotation: 90, opacity: .9, label: 'Guilloche ribbon' }));
    p1.push(path(cx - 432, 508, 864, 40, orn.wavePath(9, 26, 14, Math.PI), ochre, { rotation: 90, opacity: .9, label: 'Guilloche ribbon (counter)' }));
  }
  p1.push(rect(120, 132, 576, 792, mix(sand, .4), { stroke: ox, strokeWidth: 1.5, label: 'Central field' }), rect(132, 144, 552, 768, 'none', { stroke: alpha(ox, .4), strokeWidth: .75, label: 'Field hairline' }));
  for (const [dx, dy] of [[120, 132], [696, 132], [120, 924], [696, 924]]) p1.push(rect(dx - 7, dy - 7, 14, 14, teal, { rotation: 45, label: 'Corner tessera' }));
  p1.push(rect(220, 188, 376, 316, 'none', { stroke: ox, strokeWidth: 1, label: 'Emblema outer frame' }));
  p1.push(...imageSlot(228, 196, 360, 300, { tone: 'light', frame: ochre, frameWidth: 4, caption: 'Emblema', label: 'Emblema image slot' }));
  p1.push(text(228, 514, 360, 'PLATE I · OPUS VERMICULATUM · EMBLEMA', { size: 9.5, font: 'marcellus', color: teal, align: 'center', tracking: .28, transform: 'uppercase', wrap: false, label: 'Plate label', role: 'LABEL' }));
  const title = text(160, 556, 496, 'A FLOOR OF\nSMALL STONES', { size: 50, font: 'cardo', weight: 700, color: ox, align: 'center', tracking: .06, leading: 1.06, label: 'Title', role: 'HEADLINE' });
  p1.push(title, hr(348, below(title, 20), 120, ochre, 2, { label: 'Title rule' }));
  const deck = text(188, below(title, 40), 440, 'How the mosaicists of the Roman provinces turned dining-room floors into pictures that outlasted the houses', { size: 16, font: 'crimson', italic: true, color: ox, align: 'center', leading: 1.4, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  p1.push(text(160, below(deck, 40), 496, 'WORDS BY ADAEZE NWOSU · PHOTOGRAPHS BY REN ISHIKAWA', { size: 9.5, font: 'marcellus', color: teal, align: 'center', tracking: .25, transform: 'uppercase', wrap: false, label: 'Byline', role: 'LABEL' }));
  p1.push(...orn.mosaic(160, 860, 496, 24, 24, tess, seed + 2, { label: 'Tessera (field band)' }));

  const p2: O[] = [ground(W, H, sand)];
  p2.push(rect(fr.x, 72, 8, 8, teal, { label: 'Head tessera' }));
  p2.push(text(fr.x + 16, 60, 320, 'OPUS TESSELLATUM · PROVINCIAL WORKSHOPS', { size: 9.5, font: 'marcellus', color: teal, tracking: .3, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(fr.cx, 60, fr.w / 2, 'LIBER II', { size: 9.5, font: 'marcellus', color: teal, tracking: .3, align: 'right', wrap: false, label: 'Running head (right)', role: 'FOLIO' }));
  p2.push(hr(fr.x, 84, fr.w, ox, 1, { label: 'Head rule' }));
  p2.push(text(fr.x, 106, fr.w, 'Reading a pavement', { size: 30, font: 'cardo', weight: 700, color: ox, label: 'Subhead', role: 'HEADLINE' }));
  const cols = columns(fr.x, fr.w, 2, 32);
  const top = 162, bottom = 918;
  const [cap, first] = dropCap(cols[0].x, top, cols[0].w, MOSAIC_P[0], { capFont: 'cardo', textFont: 'crimson', capSize: 60, size: 12, color: ox, capColor: teal, leading: 1.55 });
  cap.objectLabel = 'Drop cap'; first.objectLabel = 'Column 1 body ¶1';
  p2.push(cap, first);
  flow(p2, cols[0].x, below(first, 11), cols[0].w, bottom, [MOSAIC_P[1], MOSAIC_P[2], MOSAIC_P[4], MOSAIC_P[6], copy.body('culture', 0)], { size: 12, font: 'crimson', color: ox, leading: 1.55, label: 'Column 1 body' });
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 210, { tone: 'light', frame: ochre, frameWidth: 3, caption: 'Detail', label: 'Column 2 image slot' }));
  const c2cap = text(cols[1].x, top + 220, cols[1].w, 'Guilloche border, Villa Romana del Casale, fourth century.', { size: 9.5, font: 'crimson', italic: true, color: mix(ox, .15), leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(c2cap);
  const qy = below(c2cap, 22);
  p2.push(hr(cols[1].x, qy, cols[1].w, ochre, 1, { label: 'Pull quote rule' }));
  const quote = text(cols[1].x, qy + 10, cols[1].w, '“The join between the emblema and the field tells you where the skill was spent.”', { size: 15, font: 'crimson', italic: true, color: teal, align: 'center', leading: 1.35, label: 'Pull quote', role: 'DECK' });
  p2.push(quote, hr(cols[1].x, below(quote, 10), cols[1].w, ochre, 1, { label: 'Pull quote rule' }));
  flow(p2, cols[1].x, below(quote, 30), cols[1].w, bottom, [MOSAIC_P[3], MOSAIC_P[5], copy.body('culture', 1), copy.body('travel', 1)], { size: 12, font: 'crimson', color: ox, leading: 1.55, label: 'Column 2 body' });
  p2.push(...orn.mosaic(fr.x, 936, fr.w, 48, 24, tess, seed + 3, { label: 'Tessera (foot band)' }));
  p2.push(text(fr.x, 996, fr.w, 'XXIV', { size: 10, font: 'marcellus', color: ox, align: 'center', tracking: .3, wrap: false, label: 'Folio (roman)', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 4. Byzantine — the luminous field ────────────────────────────────────────

const byzantine: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const gold = paper, purple = ink, teal = accent, cream = secondary;

  const p1: O[] = [ground(W, H, purple)];
  p1.push(rect(88, 72, 640, 632, gold, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: mix(gold, .22) }, { offset: 1, color: gold }] }, label: 'Gold field' }));
  p1.push(rect(88, 72, 640, 632, 'none', { stroke: teal, strokeWidth: 4, label: 'Field border (teal)' }), rect(96, 80, 624, 616, 'none', { stroke: cream, strokeWidth: 1, opacity: .7, label: 'Field border (cream)' }));
  p1.push(...orn.dotField(104, 88, 608, 600, 56, mix(gold, .45), { rMin: 1.2, rMax: 1.6, stagger: true, opacity: .85, label: 'Gold shimmer' }));
  for (let i = 0; i < 5; i++) p1.push(path(128 + i * 112, 96, 112, 76, orn.archPath(.22), purple, { opacity: .9, label: 'Arcade arch' }));
  p1.push(hr(128, 172, 560, purple, 2, { label: 'Arcade base' }));
  for (const jx of [240, 352, 464, 576]) p1.push(circle(jx, 118, 6, teal, { stroke: cream, strokeWidth: 1, label: 'Jewel' }));
  p1.push(...orn.rings(408, 400, [176, 186, 204], cream, 1.5, { opacity: .55, label: 'Halo ring' }));
  p1.push(circle(408, 400, 128, 'rgba(64,35,90,.22)', { label: 'Icon panel (lunette)', role: 'IMAGE_SLOT' }));
  p1.push(...imageSlot(280, 400, 256, 260, { tone: 'light', shade: 'rgba(64,35,90,.22)', ink: alpha(purple, .75), caption: 'Icon panel', label: 'Icon image slot' }));
  p1.push(path(248, 240, 320, 420, orn.archPath(.2), mix(gold, -.32), { stroke: cream, strokeWidth: .75, label: 'Round-arched frame' }));
  p1.push(text(88, 728, 640, 'LECTIONARY · VOLUME II · THE FEASTS OF WINTER', { size: 10, font: 'marcellus', color: mix(gold, .2), align: 'center', tracking: .34, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
  const title = text(88, 760, 640, 'A SEASON OF\nSMALL LIGHTS', { size: 56, font: 'cinzel', weight: 700, color: gold, align: 'center', tracking: .12, leading: 1.06, label: 'Title', role: 'HEADLINE' });
  p1.push(title);
  const deck = text(168, below(title, 22), 480, 'Readings, hymns and notes for the weeks when the lamps are lit early and the gold ground begins to move', { size: 16, font: 'ebGaramond', italic: true, color: cream, align: 'center', leading: 1.4, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  const ry = below(deck, 24);
  p1.push(hr(300, ry, 216, gold, 1, { label: 'Foot rule' }), circle(408, ry, 4, teal, { stroke: gold, strokeWidth: 1, label: 'Foot jewel' }));
  p1.push(text(88, 982, 640, 'PLAJAH SACRED LIBRARY', { size: 9, font: 'marcellus', color: alpha(cream, .7), align: 'center', tracking: .3, wrap: false, label: 'Imprint', role: 'LABEL' }));

  const paper2 = '#F1E2B9';
  const p2: O[] = [ground(W, H, paper2)];
  for (let i = 0; i < 7; i++) p2.push(path(72 + i * 96, 36, 96, 40, orn.archPath(.2), gold, { opacity: .55, label: 'Running arcade' }));
  p2.push(hr(72, 76, 672, purple, 1, { label: 'Head rule' }));
  p2.push(text(72, 88, 440, 'LECTIONARY · THE SIXTH SUNDAY OF THE SEASON', { size: 9.5, font: 'marcellus', color: purple, tracking: .3, wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(544, 88, 200, 'VOLUME II', { size: 9.5, font: 'marcellus', color: purple, tracking: .3, align: 'right', wrap: false, label: 'Running head (right)', role: 'FOLIO' }));
  p2.push(vr(528, 130, 820, gold, 1, { opacity: .7, label: 'Column divider' }));
  const mx = 72, mw = 440, gx = 544, gw = 200, bottom = 940;
  p2.push(text(mx, 130, mw, 'The Reading', { size: 24, font: 'cinzel', weight: 600, color: purple, label: 'Subhead', role: 'HEADLINE' }), hr(mx, 166, 60, teal, 2, { label: 'Subhead rule' }));
  const [cap, first] = dropCap(mx, 186, mw, BYZ_P[0], { capFont: 'cinzel', textFont: 'ebGaramond', capSize: 64, size: 12, color: purple, capColor: mix(gold, -.25), leading: 1.5 });
  cap.objectLabel = 'Drop cap'; first.objectLabel = 'Main column body ¶1';
  p2.push(cap, first);
  let y = flow(p2, mx, below(first, 11), mw, bottom, [BYZ_P[1]], { size: 12, font: 'ebGaramond', color: purple, label: 'Main column body' });
  p2.push(...imageSlot(mx, y + 6, mw, 200, { tone: 'light', frame: gold, frameWidth: 2, caption: 'Mosaic detail', label: 'Main column image slot' }));
  y += 214;
  const qy = y + 8;
  p2.push(hr(mx + 120, qy, 200, gold, 1, { label: 'Pull quote rule' }));
  const quote = text(mx, qy + 12, mw, '“Gold was not a colour to them but a light source.”', { size: 16, font: 'ebGaramond', italic: true, color: purple, align: 'center', leading: 1.35, label: 'Pull quote', role: 'DECK' });
  p2.push(quote, hr(mx + 120, below(quote, 12), 200, gold, 1, { label: 'Pull quote rule' }));
  flow(p2, mx, below(quote, 32), mw, bottom, [BYZ_P[2], BYZ_P[3], BYZ_P[4], copy.body('faith', 1)], { size: 12, font: 'ebGaramond', color: purple, label: 'Main column body (cont.)' });
  const notes: Array<[number, string, string]> = [
    [186, 'NOTE I', 'Gold-ground tesserae: a sheet of gold leaf sealed between two layers of glass, then cut and set at an angle.'],
    [y + 20, 'NOTE II · ON THE PLATE', 'Procopius, On Buildings, written in the 550s, describes the dome of Hagia Sophia as seeming to hang from heaven.'],
    [700, 'NOTE III', 'Iconoclasm, 726–843: figural images were banned in the East, then restored. Much earlier work survives only in Ravenna and Sinai.'],
  ];
  for (const [ny, lab, body] of notes) {
    const l = text(gx, ny, gw, lab, { size: 8.5, font: 'marcellus', color: teal, tracking: .25, wrap: false, label: 'Marginal note label', role: 'LABEL' });
    p2.push(l, text(gx, below(l, 6), gw, body, { size: 10.5, font: 'ebGaramond', italic: true, color: teal, leading: 1.4, label: 'Marginal note', role: 'CAPTION' }));
  }
  p2.push(text(72, 996, 672, 'XII', { size: 10, font: 'cinzel', weight: 500, color: purple, align: 'center', tracking: .2, wrap: false, label: 'Folio (roman)', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 5. Insular — the decorated initial ───────────────────────────────────────

const insular: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const vellum = paper, green = ink, red = accent, gold = secondary;

  const p1: O[] = [ground(W, H, vellum)];
  p1.push(text(72, 64, 672, 'INCIPIT · THE BOOK OF SMALL HOURS · FOLIO I RECTO', { size: 10, font: 'almendra', weight: 700, color: red, tracking: .26, transform: 'uppercase', wrap: false, label: 'Incipit rubric', role: 'LABEL' }));
  for (let k = 0; k < 26; k++) p1.push(hr(104, 163.5 + k * 20, 640, alpha(green, .16), .75, { label: 'Ruling line' }));
  p1.push(rect(96, 104, 224, 320, mix(vellum, -.07), { label: 'Initial field' }));
  p1.push(path(48, 152, 320, 224, orn.sineOpenPath(4, 34, 0), 'none', { stroke: alpha(green, .5), strokeWidth: 5, rotation: 90, open: true, label: 'Interlace strand' }));
  p1.push(path(48, 152, 320, 224, orn.sineOpenPath(4, 34, Math.PI), 'none', { stroke: alpha(gold, .8), strokeWidth: 5, rotation: 90, open: true, label: 'Interlace strand (counter)' }));
  p1.push(path(48, 152, 320, 224, orn.sineOpenPath(4, 34, 0), 'none', { stroke: alpha(vellum, .9), strokeWidth: 1.2, rotation: 90, open: true, label: 'Interlace highlight' }));
  p1.push(path(48, 152, 320, 224, orn.sineOpenPath(4, 34, Math.PI), 'none', { stroke: alpha(vellum, .9), strokeWidth: 1.2, rotation: 90, open: true, label: 'Interlace highlight' }));
  for (const [sx, sy] of [[120, 130], [296, 130], [120, 398], [296, 398]]) p1.push(...orn.rings(sx, sy, [8, 14], gold, 1.5, { label: 'Spiral ring' }));
  const dot = { rMin: 1.5, rMax: 1.5, label: 'Rubrication dot' };
  p1.push(...orn.dotField(100, 106, 216, 10, 11, red, dot), ...orn.dotField(100, 382, 216, 10, 11, red, dot), ...orn.dotField(90, 116, 10, 264, 11, red, dot), ...orn.dotField(316, 116, 10, 264, 11, red, dot));
  p1.push(text(104, 119, 208, 'T', { size: 260, font: 'uncial', color: green, wrap: false, label: 'Decorated initial', role: 'HEADLINE' }));
  const o1 = text(340, 150, 404, INSULAR_OPEN[0].slice(1), { size: 13.5, font: 'alegreya', color: green, leading: 1.48, label: 'Opening text (beside initial) ¶1', role: 'BODY' });
  p1.push(o1);
  const o2 = text(340, below(o1, 20), 404, INSULAR_OPEN[1], { size: 13.5, font: 'alegreya', color: green, leading: 1.48, label: 'Opening text (beside initial) ¶2', role: 'BODY' });
  p1.push(o2);
  const y3 = Math.max(below(o2, 20), 430);
  p1.push(text(104, y3, 560, INSULAR_OPEN[2], { size: 13.5, font: 'alegreya', color: green, leading: 1.48, label: 'Opening text ¶3', role: 'BODY' }));
  p1.push(rect(104, 720, 640, 44, mix(vellum, -.06), { label: 'Knotwork band' }));
  p1.push(path(104, 720, 640, 44, orn.sineOpenPath(8, 30, 0), 'none', { stroke: green, strokeWidth: 3, opacity: .85, open: true, label: 'Band strand' }));
  p1.push(path(104, 720, 640, 44, orn.sineOpenPath(8, 30, Math.PI), 'none', { stroke: red, strokeWidth: 3, opacity: .85, open: true, label: 'Band strand (counter)' }));
  p1.push(path(104, 720, 640, 44, orn.sineOpenPath(8, 30, Math.PI / 2), 'none', { stroke: gold, strokeWidth: 1.2, open: true, label: 'Band highlight' }));
  const col = text(140, 790, 536, 'Written in the hours before dawn, ruled by hand, and dotted in red lead by a second hand who preferred not to be named.', { size: 12, font: 'almendra', italic: true, color: green, align: 'center', leading: 1.45, label: 'Colophon', role: 'CAPTION' });
  p1.push(col);
  p1.push(text(104, below(col, 26), 640, 'the book of small hours', { size: 34, font: 'uncial', color: green, align: 'center', label: 'Title', role: 'HEADLINE' }));
  p1.push(text(72, 982, 672, 'PLAJAH · MANUSCRIPTS WING · FOLIO I', { size: 9.5, font: 'almendra', weight: 700, color: red, align: 'center', tracking: .25, wrap: false, label: 'Imprint', role: 'LABEL' }));

  const p2: O[] = [ground(W, H, vellum)];
  p2.push(rect(48, 48, 48, 960, mix(vellum, -.05), { label: 'Knotwork margin' }));
  p2.push(path(-408, 508, 960, 40, orn.sineOpenPath(12, 30, 0), 'none', { stroke: green, strokeWidth: 3, opacity: .85, rotation: 90, open: true, label: 'Margin strand' }));
  p2.push(path(-408, 508, 960, 40, orn.sineOpenPath(12, 30, Math.PI), 'none', { stroke: red, strokeWidth: 3, opacity: .85, rotation: 90, open: true, label: 'Margin strand (counter)' }));
  p2.push(path(-408, 508, 960, 40, orn.sineOpenPath(12, 30, Math.PI / 2), 'none', { stroke: gold, strokeWidth: 1.2, rotation: 90, open: true, label: 'Margin highlight' }));
  for (const ry of [120, 400, 680, 960]) p2.push(...orn.rings(72, ry, [7, 12], gold, 1.2, { label: 'Spiral ring' }));
  p2.push(text(136, 56, 300, 'The Book of Small Hours', { size: 10.5, font: 'almendra', italic: true, color: green, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(436, 56, 300, 'folio ii verso', { size: 10.5, font: 'almendra', italic: true, color: green, align: 'right', label: 'Running head (right)', role: 'FOLIO' }));
  p2.push(hr(136, 74, 620, alpha(green, .5), .75, { label: 'Head rule' }));
  p2.push(text(136, 98, 460, 'Of the hours before dawn', { size: 26, font: 'uncial', color: red, label: 'Subhead', role: 'HEADLINE' }));
  for (let k = 0; k < 39; k++) p2.push(hr(136, 162.5 + k * 20, 460, alpha(green, .16), .75, { label: 'Ruling line' }));
  const cx = 136, cw = 460, bottom = 940;
  const [cap, first] = dropCap(cx, 150, cw, INSULAR_P[0], { capFont: 'uncial', textFont: 'alegreya', capSize: 56, size: 12.5, color: green, capColor: red, leading: 1.6 });
  cap.objectLabel = 'Drop cap'; first.objectLabel = 'Column body ¶1';
  p2.push(cap, first);
  let y = flow(p2, cx, below(first, 12), cw, bottom, [INSULAR_P[1]], { size: 12.5, font: 'alegreya', color: green, leading: 1.6, gap: 12, label: 'Column body' });
  const rub = text(cx, y + 2, cw, 'Here the second lesson begins.', { size: 11, font: 'almendra', italic: true, color: red, label: 'Rubric', role: 'LABEL' });
  p2.push(rub);
  flow(p2, cx, below(rub, 12), cw, bottom, [INSULAR_P[2], INSULAR_P[4], INSULAR_P[5], INSULAR_P[3], INSULAR_P[6], copy.body('editorial', 0), copy.body('editorial', 2)], { size: 12.5, font: 'alegreya', color: green, leading: 1.6, gap: 12, label: 'Column body (cont.)' });
  p2.push(...imageSlot(620, 150, 148, 190, { tone: 'light', frame: green, frameWidth: 1, caption: 'Miniature', label: 'Margin image slot' }));
  const mcap = text(620, 350, 148, 'Carpet page, detail. Ink and red lead on vellum.', { size: 9.5, font: 'almendra', italic: true, color: green, leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(mcap);
  p2.push(text(620, below(mcap, 26), 148, 'The dots are red lead, minium, the pigment that gave the miniature its name.', { size: 10, font: 'almendra', italic: true, color: red, leading: 1.4, label: 'Gloss', role: 'CAPTION' }));
  p2.push(text(136, 996, 460, 'ii', { size: 11, font: 'almendra', italic: true, color: green, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 6. Gothic — light through tracery ────────────────────────────────────────

const gothic: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const black = paper, burg = ink, blue = accent, gold = secondary;
  const cream = '#E9DFC7', red = '#B8404F', green = '#2E5E46';
  const panes = [blue, burg, gold, green];

  const p1: O[] = [ground(W, H, black)];
  for (let i = 0; i < 10; i++) p1.push(path(108 + i * 60, 24, 60, 44, orn.pointedArchPath(.14), gold, { opacity: .75, label: 'Arcade (head)' }));
  const wx = [128, 328, 528];
  wx.forEach((x, wi) => {
    p1.push(ellipse(x - 60, 60, 280, 600, gold, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: gold, opacity: .38 }, { offset: 1, color: gold, opacity: 0 }] }, label: 'Tracery light' }));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
      p1.push(rect(x + 16 + c * 66, 334 + r * 68, 62, 64, panes[(r * 2 + c + wi) % 4], { opacity: .85, label: 'Jewel pane' }));
    }
    p1.push(path(x + 40, 196, 80, 80, orn.quatrefoilPath(), gold, { opacity: .9, label: 'Quatrefoil tracery' }));
    p1.push(circle(x + 80, 150, 18, blue, { stroke: gold, strokeWidth: 1.5, label: 'Rose' }));
    p1.push(path(x, 90, 160, 520, orn.pointedArchPath(.1), mix(gold, -.25), { label: 'Tracery frame' }));
  });
  p1.push(rect(100, 610, 616, 10, mix(black, .18), { label: 'Sill' }), rect(92, 620, 632, 6, mix(black, .1), { label: 'Sill course' }));
  for (const px of [108, 308, 508, 708]) p1.push(vr(px, 90, 530, gold, 1.5, { opacity: .6, label: 'Pier' }));
  p1.push(text(48, 664, 720, 'Light through Stone', { size: 70, font: 'unifraktur', color: gold, align: 'center', label: 'Masthead', role: 'HEADLINE' }));
  p1.push(text(68, 752, 680, 'Here begins the winter number · Advent, in the year MMXXVI', { size: 10.5, font: 'almendra', italic: true, color: red, align: 'center', wrap: false, label: 'Rubric', role: 'LABEL' }));
  const deck = text(148, 784, 520, 'Verticality, tracery and the engineering of light, from Suger’s choir at Saint-Denis to the spires of Cologne', { size: 16, font: 'cardo', color: cream, align: 'center', leading: 1.4, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  const qy = below(deck, 30);
  p1.push(hr(200, qy + 13, 140, gold, .75, { label: 'Foot rule' }), hr(476, qy + 13, 140, gold, .75, { label: 'Foot rule' }));
  for (const qx of [347, 395, 443]) p1.push(path(qx, qy, 26, 26, orn.quatrefoilPath(), gold, { label: 'Quatrefoil' }));
  p1.push(text(68, 976, 300, 'VOLUME IV · WINTER', { size: 9.5, font: 'almendra', weight: 700, color: gold, tracking: .3, wrap: false, label: 'Volume label', role: 'LABEL' }));
  p1.push(text(448, 976, 300, 'PLAJAH · ARCHITECTURE WING', { size: 9.5, font: 'almendra', weight: 700, color: gold, tracking: .3, align: 'right', wrap: false, label: 'Imprint', role: 'LABEL' }));

  const paper2 = '#EFE6D2', dark = '#1B1A22';
  const p2: O[] = [ground(W, H, paper2)];
  for (let i = 0; i < 12; i++) p2.push(path(96 + i * 52, 36, 52, 34, orn.pointedArchPath(.16), burg, { opacity: .85, label: 'Running arcade' }));
  p2.push(hr(80, 70, 656, gold, 2, { label: 'Head rule' }));
  p2.push(text(80, 82, 328, 'Light through Stone · Winter', { size: 9.5, font: 'almendra', weight: 700, color: burg, tracking: .25, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(408, 82, 328, 'Chapter II', { size: 9.5, font: 'almendra', weight: 700, color: burg, tracking: .25, transform: 'uppercase', align: 'right', wrap: false, label: 'Running head (right)', role: 'FOLIO' }));
  const cols = columns(80, 656, 2, 40);
  p2.push(rect(402, 116, 12, 6, gold, { label: 'Pier capital' }), vr(408, 122, 826, burg, 3, { label: 'Pier rule' }), rect(402, 948, 12, 6, gold, { label: 'Pier base' }));
  const top = 120, bottom = 940;
  const sub = text(cols[0].x, top, cols[0].w, 'Of the vault and the window', { size: 24, font: 'cardo', weight: 700, color: dark, leading: 1.15, label: 'Subhead', role: 'HEADLINE' });
  p2.push(sub);
  const rub = text(cols[0].x, below(sub, 10), cols[0].w, 'Here follows the second chapter, of the vault and the window.', { size: 10, font: 'almendra', italic: true, color: red, leading: 1.35, label: 'Rubric', role: 'LABEL' });
  p2.push(rub);
  const [cap, first] = dropCap(cols[0].x, below(rub, 16), cols[0].w, GOTHIC_P[0], { capFont: 'cardo', textFont: 'cardo', capSize: 56, size: 12, color: dark, capColor: burg, leading: 1.5 });
  cap.objectLabel = 'Drop cap'; first.objectLabel = 'Column 1 body ¶1';
  p2.push(cap, first);
  flow(p2, cols[0].x, below(first, 11), cols[0].w, bottom, [GOTHIC_P[1], GOTHIC_P[2], GOTHIC_P[4], GOTHIC_P[6], copy.body('culture', 0)], { size: 12, font: 'cardo', color: dark, label: 'Column 1 body' });
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 220, { tone: 'light', frame: burg, frameWidth: 1.5, caption: 'Window', label: 'Column 2 image slot' }));
  const c2cap = text(cols[1].x, top + 230, cols[1].w, 'Rose window tracery, north transept, c. 1230.', { size: 9.5, font: 'almendra', italic: true, color: burg, leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(c2cap);
  const qy2 = below(c2cap, 22);
  p2.push(hr(cols[1].x, qy2, cols[1].w, gold, 1, { label: 'Pull quote rule' }));
  const quote = text(cols[1].x, qy2 + 12, cols[1].w, '“Once the wall stopped carrying, it could open.”', { size: 15, font: 'cardo', italic: true, color: burg, align: 'center', leading: 1.35, label: 'Pull quote', role: 'DECK' });
  p2.push(quote, hr(cols[1].x, below(quote, 12), cols[1].w, gold, 1, { label: 'Pull quote rule' }));
  flow(p2, cols[1].x, below(quote, 32), cols[1].w, bottom, [GOTHIC_P[3], GOTHIC_P[5], copy.body('culture', 1), copy.body('editorial', 1)], { size: 12, font: 'cardo', color: dark, label: 'Column 2 body' });
  for (let i = 0; i < 14; i++) p2.push(rect(80 + i * 47.4, 962, 40, 8, panes[i % 4], { opacity: .85, label: 'Jewel strip' }));
  p2.push(text(80, 984, 656, 'xxxvii', { size: 10.5, font: 'almendra', italic: true, color: dark, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 7. Renaissance — the Van de Graaf canon ──────────────────────────────────

const renaissance: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const fr = frame(W, H, W / 9, { inner: W / 9, outer: 2 * W / 9, top: H / 9, bottom: 2 * H / 9 });
  const olive = secondary;
  const slotFill = 'rgba(20,16,24,.08)';

  const p1: O[] = [ground(W, H, paper)];
  p1.push(line(0, H, W, 0, ink, .75, { opacity: .18, label: 'Canon diagonal (page)' }), line(0, H / 2, W, 0, ink, .75, { opacity: .18, label: 'Canon diagonal (spread)' }));
  p1.push(rect(fr.x, fr.y, fr.w, fr.h, 'none', { stroke: ink, strokeWidth: .75, opacity: .3, label: 'Canon text block' }));
  const gh = fr.w / 1.618;
  p1.push(rect(fr.x, fr.y, fr.w, gh, 'none', { stroke: ink, strokeWidth: .5, opacity: .22, label: 'Golden rectangle' }));
  p1.push(rect(fr.x, fr.y, gh, gh, 'none', { stroke: ink, strokeWidth: .5, opacity: .22, label: 'Golden square' }));
  p1.push(rect(fr.x + gh, fr.y, fr.w - gh, fr.w - gh, 'none', { stroke: ink, strokeWidth: .5, opacity: .22, label: 'Golden sub-square' }));
  p1.push(text(fr.x, fr.y, fr.w, 'LIBER PRIMUS · ON PROPORTION · VENICE', { size: 10, font: 'cardo', color: accent, align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
  const ax = fr.x + (fr.w - 300) / 2;
  p1.push(ellipse(ax, 176, 300, 120, slotFill, { stroke: accent, strokeWidth: 1.5, label: 'Altarpiece lunette', role: 'IMAGE_SLOT' }));
  p1.push(...imageSlot(ax, 236, 300, 250, { tone: 'light', frame: accent, frameWidth: 1.5, caption: 'Altarpiece', label: 'Altarpiece image slot' }));
  p1.push(rect(ax, 492, 300, 20, olive, { opacity: .75, label: 'Predella' }), vr(ax + 100, 492, 20, paper, 1, { label: 'Predella division' }), vr(ax + 200, 492, 20, paper, 1, { label: 'Predella division' }));
  const title = text(fr.x, 540, fr.w, 'The Measure\nof Things', { size: 58, font: 'cormorant', weight: 600, color: ink, align: 'center', leading: 1.06, label: 'Title', role: 'HEADLINE' });
  p1.push(title);
  const deck = text(fr.x + 42, below(title, 18), fr.w - 84, 'A treatise on proportion in buildings, bodies and letters, after the manner of Pacioli’s edition of 1509', { size: 19, font: 'cormorant', italic: true, weight: 500, color: ink, align: 'center', leading: 1.35, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  const by = below(deck, 22);
  p1.push(text(fr.x, by, fr.w, 'IMANI OKAFOR · WITH PLATES AFTER THE MASTERS', { size: 9.5, font: 'cardo', color: mix(ink, .2), align: 'center', tracking: .28, transform: 'uppercase', wrap: false, label: 'Byline', role: 'LABEL' }));
  p1.push(path(fr.x + 90, by - 2, 14, 14, orn.leafPath(), olive, { rotation: -90, label: 'Fleuron' }), path(fr.right - 104, by - 2, 14, 14, orn.leafPath(), olive, { rotation: 90, label: 'Fleuron' }));
  p1.push(...orn.perspectiveGrid(0, 812, W, 244, ink, { columns: 12, rows: 6, width: 1, opacity: .16 }));

  const p2: O[] = [ground(W, H, paper)];
  p2.push(rect(fr.x, fr.y, fr.w, fr.h, 'none', { stroke: alpha(ink, .18), strokeWidth: .75, label: 'Canon text block' }));
  p2.push(text(fr.x, 84, fr.w, 'DE DIVINA PROPORTIONE · LIBER I', { size: 9.5, font: 'cardo', color: accent, tracking: .3, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(fr.x, fr.y, fr.w, 'Of the figure inscribed in the circle', { size: 26, font: 'cormorant', weight: 600, color: ink, label: 'Subhead', role: 'HEADLINE' }), hr(fr.x, 152, 80, accent, 1.5, { label: 'Subhead rule' }));
  const cols = columns(fr.x, fr.w, 2, 24);
  const top = 172, bottom = fr.bottom;
  const [cap, first] = dropCap(cols[0].x, top, cols[0].w, RENAISSANCE_P[0], { capFont: 'cormorant', textFont: 'ebGaramond', capSize: 60, size: 12, color: ink, capColor: accent, leading: 1.5 });
  cap.objectLabel = 'Drop cap'; first.objectLabel = 'Column 1 body ¶1';
  p2.push(cap, first);
  flow(p2, cols[0].x, below(first, 10), cols[0].w, bottom, [RENAISSANCE_P[1], RENAISSANCE_P[2], RENAISSANCE_P[4], copy.body('editorial', 0)], { size: 12, font: 'ebGaramond', color: ink, leading: 1.5, gap: 10, label: 'Column 1 body' });
  p2.push(...imageSlot(cols[1].x, top, cols[1].w, 190, { tone: 'light', frame: ink, frameWidth: .75, caption: 'Plate', label: 'Column 2 image slot' }));
  const c2cap = text(cols[1].x, top + 198, cols[1].w, 'Proportions of the human figure, after Vitruvius, Book III.', { size: 9.5, font: 'cardo', italic: true, color: mix(ink, .15), leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(c2cap);
  const s2 = text(cols[1].x, below(c2cap, 22), cols[1].w, 'Of the italic letter', { size: 15, font: 'cormorant', italic: true, weight: 600, color: accent, label: 'Column 2 subhead', role: 'LABEL' });
  p2.push(s2);
  flow(p2, cols[1].x, below(s2, 10), cols[1].w, bottom, [RENAISSANCE_P[3], RENAISSANCE_P[5], copy.body('editorial', 2), copy.body('editorial', 1)], { size: 12, font: 'ebGaramond', color: ink, leading: 1.5, gap: 10, label: 'Column 2 body' });
  const gx = fr.right + 22, gw = 120;
  const glosses: Array<[number, string, string]> = [
    [top, 'i', 'Van de Graaf, 1946: inner margin half the outer, head half the foot.'],
    [below(s2, 10), 'ii', 'Griffo’s italic for Aldus, Venice, 1501.'],
    [620, 'iii', 'Pacioli, Venice, 1509; the plates after Leonardo.'],
  ];
  for (const [gy, n, body] of glosses) {
    p2.push(text(gx, gy - 12, gw, n, { size: 8, font: 'cardo', italic: true, color: accent, wrap: false, label: 'Gloss numeral', role: 'LABEL' }));
    p2.push(text(gx, gy, gw, body, { size: 9, font: 'cardo', italic: true, color: mix(ink, .1), leading: 1.35, label: 'Marginal gloss', role: 'CAPTION' }));
  }
  p2.push(text(gx, fr.bottom + 28, gw, 'XLVII', { size: 11, font: 'cardo', color: ink, tracking: .2, wrap: false, label: 'Folio (outer corner)', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 8. Baroque — chiaroscuro on the diagonal ─────────────────────────────────

const baroque: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const black = paper, crimson = ink, gold = accent, cream = secondary;

  const p1: O[] = [ground(W, H, black)];
  p1.push(ellipse(-330, -330, 960, 960, gold, { gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: cream, opacity: .95 }, { offset: .3, color: gold, opacity: .55 }, { offset: 1, color: gold, opacity: 0 }] }, label: 'Chiaroscuro light' }));
  p1.push(...orn.radialLines(150, 150, 220, 980, 15, gold, 1, { spread: 100, start: 5, opacity: .14, label: 'Light ray' }));
  p1.push(rect(30, 30, W - 60, H - 60, 'none', { stroke: gold, strokeWidth: .75, opacity: .6, label: 'Hairline frame' }));
  p1.push(rect(-110, 420, 1100, 92, crimson, { rotation: -8, opacity: .92, label: 'Diagonal band' }));
  p1.push(text(120, 352, 420, 'A CHIAROSCURO ALMANAC · ROME · MDCXXX', { size: 12, font: 'cormorant', weight: 600, color: gold, tracking: .32, transform: 'uppercase', rotation: -8, wrap: false, label: 'Kicker (on the diagonal)', role: 'LABEL' }));
  p1.push(text(90, 434, 700, 'The Theatre of Light', { size: 64, font: 'bodoni', italic: true, weight: 500, color: cream, align: 'center', rotation: -8, wrap: false, label: 'Title (on the diagonal)', role: 'HEADLINE' }));
  p1.push(text(330, 560, 430, 'Drama, depth and the choreography of shadow, in the age of Caravaggio and Bernini', { size: 16, font: 'libreBaskerville', italic: true, color: cream, align: 'right', leading: 1.45, label: 'Deck', role: 'DECK' }));
  p1.push(...imageSlot(460, 640, 220, 280, { tone: 'dark', frame: gold, frameWidth: 2, caption: 'Portrait', label: 'Portrait image slot' }));
  p1.push(text(460, 930, 220, 'Study of a head by candlelight, oil on canvas.', { size: 9.5, font: 'cormorant', italic: true, color: gold, align: 'right', leading: 1.35, label: 'Caption', role: 'CAPTION' }));
  p1.push(path(600, 40, 170, 170, orn.cScrollPath(), gold, { rotation: 90, label: 'C-scroll (top right)' }), path(690, 150, 120, 120, orn.cScrollPath(), gold, { rotation: 180, opacity: .85, label: 'C-scroll (mirrored)' }), path(560, 30, 80, 80, orn.cScrollPath(), crimson, { opacity: .9, label: 'C-scroll (small)' }));
  p1.push(path(40, 840, 180, 180, orn.cScrollPath(), gold, { rotation: 180, label: 'C-scroll (bottom left)' }), path(170, 900, 120, 120, orn.cScrollPath(), gold, { label: 'C-scroll (mirrored)' }), path(120, 830, 44, 44, orn.leafPath(), crimson, { rotation: -30, label: 'Acanthus leaf' }));
  p1.push(path(690, 900, 140, 140, orn.cScrollPath(), gold, { rotation: 270, label: 'C-scroll (bottom right)' }), path(700, 830, 70, 70, orn.cScrollPath(), crimson, { rotation: 90, opacity: .9, label: 'C-scroll (small)' }));
  p1.push(text(310, 992, 340, 'PLAJAH CULTURE · THE WINTER NUMBER', { size: 10, font: 'cormorant', weight: 600, color: gold, tracking: .3, transform: 'uppercase', align: 'center', wrap: false, label: 'Imprint', role: 'LABEL' }));

  const dark = '#241418';
  const p2: O[] = [ground(W, H, cream)];
  const ornateRule = (y: number, label: string): O[] => [
    hr(72, y, 300, gold, 1, { label: `${label} rule` }), path(388, y - 10, 20, 20, orn.cScrollPath(), gold, { label: `${label} scroll` }), path(408, y - 10, 20, 20, orn.cScrollPath(), gold, { rotation: 180, label: `${label} scroll (mirrored)` }), hr(444, y, 300, gold, 1, { label: `${label} rule` }),
  ];
  p2.push(text(72, 54, 336, 'THE THEATRE OF LIGHT · II', { size: 10, font: 'cormorant', weight: 600, color: crimson, tracking: .3, wrap: false, label: 'Running head', role: 'FOLIO' }));
  p2.push(text(408, 54, 336, '48', { size: 10, font: 'bodoni', color: dark, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
  p2.push(...ornateRule(76, 'Head'));
  const cols = columns(72, 672, 2, 30);
  const bottom = 930;
  const sub = text(cols[0].x, 100, cols[0].w, 'The candle and the cellar', { size: 30, font: 'bodoni', italic: true, weight: 500, color: crimson, leading: 1.15, label: 'Subhead', role: 'HEADLINE' });
  p2.push(sub);
  const [cap, first] = dropCap(cols[0].x, below(sub, 18), cols[0].w, BAROQUE_P[0], { capFont: 'bodoni', textFont: 'libreBaskerville', capSize: 96, size: 11.5, color: dark, capColor: crimson, leading: 1.6 });
  cap.objectLabel = 'Drop cap (dramatic)'; first.objectLabel = 'Column 1 body ¶1';
  p2.push(cap, first);
  let y = flow(p2, cols[0].x, below(first, 10), cols[0].w, bottom, [BAROQUE_P[1]], { size: 11.5, font: 'libreBaskerville', color: dark, leading: 1.6, label: 'Column 1 body' });
  p2.push(hr(cols[0].x, y + 4, cols[0].w / 2 - 14, gold, 1, { label: 'Ornate rule' }), path(cols[0].x + cols[0].w / 2 - 8, y - 4, 16, 16, orn.leafPath(), gold, { label: 'Fleuron' }), hr(cols[0].x + cols[0].w / 2 + 14, y + 4, cols[0].w / 2 - 14, gold, 1, { label: 'Ornate rule' }));
  flow(p2, cols[0].x, y + 22, cols[0].w, bottom, [BAROQUE_P[2], BAROQUE_P[4], BAROQUE_P[6], copy.body('culture', 0)], { size: 11.5, font: 'libreBaskerville', color: dark, leading: 1.6, label: 'Column 1 body (cont.)' });
  p2.push(...imageSlot(cols[1].x, 100, cols[1].w, 236, { tone: 'dark', shade: 'rgba(36,20,24,.88)', frame: gold, frameWidth: 2, caption: 'Chiaroscuro study', label: 'Column 2 image slot' }));
  const c2cap = text(cols[1].x, 346, cols[1].w, 'Candlelit study, after the manner of Georges de La Tour.', { size: 9.5, font: 'cormorant', italic: true, color: crimson, leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(c2cap);
  const qy = below(c2cap, 24);
  p2.push(path(cols[1].x, qy, 22, 22, orn.cScrollPath(), gold, { label: 'Quote scroll' }));
  const quote = text(cols[1].x + 32, qy, cols[1].w - 32, '“Light is an argument; darkness is where you keep the rest of the sentence.”', { size: 17, font: 'bodoni', italic: true, color: crimson, leading: 1.3, label: 'Pull quote', role: 'DECK' });
  p2.push(quote, hr(cols[1].x, below(quote, 12), cols[1].w, gold, 1, { label: 'Pull quote rule' }));
  flow(p2, cols[1].x, below(quote, 30), cols[1].w, bottom, [BAROQUE_P[3], BAROQUE_P[5], copy.body('culture', 1), copy.body('editorial', 2)], { size: 11.5, font: 'libreBaskerville', color: dark, leading: 1.6, label: 'Column 2 body' });
  p2.push(...ornateRule(962, 'Foot'));
  p2.push(text(72, 980, 672, 'PLAJAH CULTURE', { size: 9, font: 'cormorant', weight: 600, color: crimson, tracking: .34, align: 'center', wrap: false, label: 'Running foot', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 9. Rococo — asymmetric air ───────────────────────────────────────────────

const rococo: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const pink = paper, plum = ink, mint = accent, gold = secondary;
  const gilt = mix(gold, -.12), mintInk = mix(mint, -.3);
  const gilFrame = (): O[] => [rect(36, 36, W - 72, H - 72, 'none', { rx: 22, stroke: gilt, strokeWidth: .9, opacity: .85, label: 'Gilt frame' }), rect(44, 44, W - 88, H - 88, 'none', { rx: 18, stroke: gilt, strokeWidth: .4, opacity: .6, label: 'Gilt inner frame' })];

  const p1: O[] = [ground(W, H, pink)];
  p1.push(...gilFrame());
  p1.push(ellipse(440, 40, 420, 380, mix(mint, .55), { opacity: .5, label: 'Pale field' }));
  p1.push(path(520, 60, 270, 270, orn.cScrollPath(), mint, { rotation: -20, label: 'C-scroll (large)' }));
  p1.push(path(660, 240, 190, 190, orn.cScrollPath(), gold, { rotation: 160, label: 'C-scroll (answering)' }));
  p1.push(path(430, 190, 150, 150, orn.cScrollPath(), gold, { rotation: 200, opacity: .9, label: 'C-scroll' }));
  p1.push(path(720, 40, 120, 120, orn.cScrollPath(), mint, { rotation: 70, label: 'C-scroll' }));
  p1.push(path(580, 340, 110, 110, orn.cScrollPath(), mint, { rotation: -110, label: 'C-scroll (small)' }));
  p1.push(path(470, 60, 90, 90, orn.cScrollPath(), gold, { rotation: 20, label: 'C-scroll (small)' }));
  const leaves: Array<[number, number, number, number, string]> = [[540, 330, 40, -40, gold], [620, 420, 34, 15, mint], [760, 360, 44, 60, gold], [430, 120, 30, -100, mint], [700, 20, 36, 120, gold], [500, 400, 28, -20, mint]];
  for (const [lx, ly, s, rot, c] of leaves) p1.push(path(lx, ly, s, s, orn.leafPath(), c, { rotation: rot, label: 'Leaf spray' }));
  for (const [dx, dy] of [[610, 120], [700, 300], [560, 250], [740, 190], [640, 380]]) p1.push(circle(dx, dy, 3, gilt, { label: 'Gilt dot' }));
  p1.push(text(72, 610, 400, 'SALON PAPERS · NUMBER SEVEN · PARIS', { size: 10.5, font: 'ebGaramond', color: plum, tracking: .3, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' }));
  const title = text(72, 640, 540, 'A Morning\nat the Salon', { size: 70, font: 'cormorant', weight: 300, italic: true, color: plum, leading: 1.02, label: 'Title', role: 'HEADLINE' });
  p1.push(title);
  const script = text(76, below(title, 14), 520, 'with music, at four o’clock', { size: 36, font: 'greatVibes', color: gilt, label: 'Script subtitle', role: 'DECK' });
  p1.push(script);
  p1.push(text(72, below(script, 26), 420, 'On lightness as a discipline: the boudoir, the pastel and the asymmetric line', { size: 15, font: 'ebGaramond', italic: true, color: plum, leading: 1.45, label: 'Deck', role: 'DECK' }));
  p1.push(text(72, 972, 400, 'BY CÉLESTE MARCHAND · ENGRAVINGS AFTER MEISSONNIER', { size: 9.5, font: 'ebGaramond', color: plum, tracking: .24, transform: 'uppercase', wrap: false, label: 'Byline', role: 'LABEL' }));
  p1.push(path(690, 900, 90, 90, orn.cScrollPath(), mint, { rotation: 100, label: 'C-scroll (counterweight)' }), path(740, 960, 34, 34, orn.leafPath(), gold, { rotation: 30, label: 'Leaf spray' }), path(700, 980, 26, 26, orn.leafPath(), mint, { rotation: -60, label: 'Leaf spray' }));

  const p2: O[] = [ground(W, H, pink)];
  p2.push(...gilFrame());
  p2.push(path(40, 40, 736, 48, orn.scallopPath(16), mint, { rotation: 180, opacity: .9, label: 'Scalloped head band' }));
  p2.push(text(40, 50, 736, 'SALON PAPERS · NO. 7', { size: 9.5, font: 'ebGaramond', weight: 600, color: mix(plum, -.35), tracking: .34, transform: 'uppercase', align: 'center', wrap: false, label: 'Running head', role: 'FOLIO' }));
  const cx = 80, cw = 440, bottom = 940;
  const sub = text(cx, 116, cw, 'The art of the small room', { size: 34, font: 'cormorant', weight: 300, italic: true, color: plum, leading: 1.1, label: 'Subhead', role: 'HEADLINE' });
  p2.push(sub, hr(cx, below(sub, 12), 60, gilt, 1, { label: 'Subhead rule' }));
  const [cap, first] = dropCap(cx, below(sub, 30), cw, ROCOCO_P[0], { capFont: 'cormorant', textFont: 'ebGaramond', capSize: 64, size: 12.5, color: plum, capColor: mintInk, leading: 1.6 });
  cap.objectLabel = 'Drop cap (light)'; first.objectLabel = 'Column body ¶1';
  p2.push(cap, first);
  let y = flow(p2, cx, below(first, 11), cw, bottom, [ROCOCO_P[1]], { size: 12.5, font: 'ebGaramond', color: plum, leading: 1.6, label: 'Column body' });
  const fl = text(cx, y + 2, cw, 'Ensuite', { size: 28, font: 'greatVibes', color: gilt, label: 'Flourish word', role: 'LABEL' });
  p2.push(fl);
  flow(p2, cx, below(fl, 8), cw, bottom, [ROCOCO_P[2], ROCOCO_P[4], ROCOCO_P[5], ROCOCO_P[3], ROCOCO_P[6], copy.body('fashion', 1), copy.body('fashion', 0)], { size: 12.5, font: 'ebGaramond', color: plum, leading: 1.6, label: 'Column body (cont.)' });
  const mx = 560, mw = 176;
  p2.push(...imageSlot(mx, 220, mw, 236, { tone: 'light', rx: 88, frame: gilt, frameWidth: 1.5, caption: 'Portrait', label: 'Margin image slot (medallion)' }));
  const mcap = text(mx, 466, mw, 'Pastel on blue paper, after Rosalba Carriera.', { size: 9.5, font: 'ebGaramond', italic: true, color: plum, leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(mcap);
  const sy = below(mcap, 14);
  p2.push(path(mx + 40, sy, 26, 26, orn.leafPath(), gold, { rotation: -30, label: 'Leaf spray' }), path(mx + 76, sy - 6, 26, 26, orn.leafPath(), mint, { label: 'Leaf spray' }), path(mx + 112, sy, 26, 26, orn.leafPath(), gold, { rotation: 30, label: 'Leaf spray' }));
  p2.push(text(mx, sy + 48, mw, '“Nothing is centred, because the eye is meant to wander as a guest wanders a salon.”', { size: 14, font: 'cormorant', italic: true, weight: 500, color: plum, leading: 1.4, label: 'Pull quote', role: 'DECK' }));
  p2.push(path(640, 900, 90, 90, orn.cScrollPath(), mint, { rotation: 120, label: 'C-scroll (foot)' }), path(700, 950, 60, 60, orn.cScrollPath(), gold, { rotation: -60, label: 'C-scroll (foot, small)' }));
  p2.push(path(cx + cw / 2 - 40, 990, 14, 14, orn.leafPath(), gilt, { rotation: -90, label: 'Folio fleuron' }), path(cx + cw / 2 + 26, 990, 14, 14, orn.leafPath(), gilt, { rotation: 90, label: 'Folio fleuron' }));
  p2.push(text(cx, 990, cw, '7', { size: 10.5, font: 'ebGaramond', italic: true, color: plum, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
  return [p1, p2];
};

// ── 10. Neoclassical — the medallion on the axis ─────────────────────────────

const neoclassical: EraDesigner = ({ W, H, paper, ink, accent, secondary }) => {
  const cream = paper, navy = ink, red = accent, gold = secondary;

  const p1: O[] = [ground(W, H, cream)];
  p1.push(hr(208, 84, 400, navy, .75, { label: 'Key rule' }), ...orn.frieze(208, 88, 400, 14, MEANDER_D, navy, 0, { label: 'Greek key (head)' }), hr(208, 106, 400, navy, .75, { label: 'Key rule' }));
  for (const fx of [238, 538]) {
    p1.push(...orn.stripes(fx, 224, 40, 152, 5, 3, navy, { vertical: true, opacity: .85, label: 'Fasces rod' }));
    p1.push(rect(fx - 2, 262, 44, 6, red, { label: 'Fasces binding' }), rect(fx - 2, 332, 44, 6, red, { label: 'Fasces binding' }));
  }
  p1.push(circle(408, 300, 96, mix(cream, -.05), { stroke: navy, strokeWidth: 2, label: 'Medallion' }));
  p1.push(...orn.rings(408, 300, [84], navy, 1, { label: 'Medallion inner ring' }), ...orn.rings(408, 300, [76], gold, 1, { label: 'Medallion gilt ring' }));
  p1.push(path(373, 265, 70, 70, orn.starPath(5, .45), red, { label: 'Medallion star' }));
  p1.push(text(308, 420, 200, 'RES PUBLICA · MDCCXCII', { size: 9, font: 'cinzel', color: navy, align: 'center', tracking: .38, wrap: false, label: 'Medallion legend', role: 'LABEL' }));
  p1.push(hr(188, 452, 440, navy, 1.5, { label: 'Rule I' }));
  const title = text(108, 478, 600, 'CIVIC\nVIRTUE', { size: 64, font: 'bodoni', weight: 400, color: navy, align: 'center', tracking: .3, leading: 1.04, label: 'Title', role: 'HEADLINE' });
  p1.push(title);
  p1.push(hr(188, below(title, 18), 440, navy, .75, { label: 'Rule II' }));
  const deck = text(188, below(title, 34), 440, 'An address on architecture, law and the ordering of public life, delivered at the opening of the assembly', { size: 15, font: 'libreBaskerville', color: navy, align: 'center', leading: 1.45, label: 'Deck', role: 'DECK' });
  p1.push(deck);
  p1.push(hr(188, below(deck, 18), 440, navy, .75, { label: 'Rule III' }));
  p1.push(text(188, below(deck, 34), 440, 'IMANI OKAFOR, ARCHITECT · MMXXVI', { size: 10, font: 'cinzel', color: red, align: 'center', tracking: .34, wrap: false, label: 'Byline', role: 'LABEL' }));
  p1.push(...imageSlot(168, 770, 480, 146, { tone: 'light', frame: navy, frameWidth: 1, caption: 'Relief', label: 'Relief image slot' }));
  p1.push(text(168, 924, 480, 'PLATE II · FRIEZE OF THE ASSEMBLY HALL, PLASTER CAST', { size: 8.5, font: 'cinzel', color: navy, align: 'center', tracking: .16, wrap: false, label: 'Caption', role: 'CAPTION' }));
  p1.push(hr(208, 950, 400, navy, .75, { label: 'Key rule' }), ...orn.frieze(208, 954, 400, 14, MEANDER_D, navy, 0, { label: 'Greek key (foot)' }), hr(208, 972, 400, navy, .75, { label: 'Key rule' }));
  p1.push(text(72, 990, 200, 'VOL. I', { size: 9, font: 'cinzel', color: navy, tracking: .3, wrap: false, label: 'Volume label', role: 'LABEL' }));
  p1.push(text(544, 990, 200, 'PLAJAH CIVIC PRESS', { size: 9, font: 'cinzel', color: navy, tracking: .3, align: 'right', wrap: false, label: 'Imprint', role: 'LABEL' }));

  const p2: O[] = [ground(W, H, cream)];
  p2.push(hr(80, 60, 190, navy, .75, { label: 'Head rule' }), text(270, 54, 276, 'CIVIC VIRTUE · AN ADDRESS', { size: 9, font: 'cinzel', color: navy, align: 'center', tracking: .36, wrap: false, label: 'Running head', role: 'FOLIO' }), hr(546, 60, 190, navy, .75, { label: 'Head rule' }));
  p2.push(hr(80, 76, 656, navy, 1, { label: 'Head rule (full)' }));
  const cols = columns(80, 656, 2, 32);
  p2.push(vr(408, 100, 860, navy, .5, { opacity: .35, label: 'Gutter hairline' }));
  const bottom = 940;
  const s1 = text(cols[0].x, 100, cols[0].w, 'I · OF THE ASSEMBLY', { size: 13, font: 'cinzel', weight: 600, color: navy, tracking: .2, wrap: false, label: 'Small-cap subhead', role: 'LABEL' });
  p2.push(s1, hr(cols[0].x, below(s1, 7), 40, red, 1.5, { label: 'Subhead rule' }));
  const [cap, first] = dropCap(cols[0].x, below(s1, 22), cols[0].w, NEO_P[0], { capFont: 'bodoni', textFont: 'libreBaskerville', capSize: 64, size: 11, color: navy, capColor: red, leading: 1.6 });
  cap.objectLabel = 'Drop cap'; first.objectLabel = 'Column 1 body ¶1';
  p2.push(cap, first);
  let y = flow(p2, cols[0].x, below(first, 10), cols[0].w, bottom, [NEO_P[1]], { size: 11, font: 'libreBaskerville', color: navy, leading: 1.6, label: 'Column 1 body' });
  const s2 = text(cols[0].x, y + 8, cols[0].w, 'II · OF PROPORTION IN LAW', { size: 13, font: 'cinzel', weight: 600, color: navy, tracking: .2, wrap: false, label: 'Small-cap subhead', role: 'LABEL' });
  p2.push(s2, hr(cols[0].x, below(s2, 7), 40, red, 1.5, { label: 'Subhead rule' }));
  flow(p2, cols[0].x, below(s2, 22), cols[0].w, bottom, [NEO_P[2], NEO_P[4], NEO_P[6], copy.body('editorial', 2)], { size: 11, font: 'libreBaskerville', color: navy, leading: 1.6, label: 'Column 1 body (cont.)' });
  p2.push(...imageSlot(cols[1].x, 100, cols[1].w, 200, { tone: 'light', frame: navy, frameWidth: 1, caption: 'Plate', label: 'Column 2 image slot' }));
  const c2cap = text(cols[1].x, 308, cols[1].w, 'The Oath of the Horatii, David, 1784: three arches, one floor.', { size: 9.5, font: 'libreBaskerville', italic: true, color: navy, leading: 1.35, label: 'Caption', role: 'CAPTION' });
  p2.push(c2cap);
  const qy = below(c2cap, 22);
  p2.push(hr(cols[1].x + 60, qy, cols[1].w - 120, gold, 1, { label: 'Pull quote rule' }));
  const quote = text(cols[1].x, qy + 10, cols[1].w, '“Everything centred, everything measured, nothing that cannot be justified.”', { size: 18, font: 'bodoni', italic: true, color: navy, align: 'center', leading: 1.3, label: 'Pull quote', role: 'DECK' });
  p2.push(quote, hr(cols[1].x + 60, below(quote, 10), cols[1].w - 120, gold, 1, { label: 'Pull quote rule' }));
  flow(p2, cols[1].x, below(quote, 30), cols[1].w, bottom, [NEO_P[3], NEO_P[5], copy.body('editorial', 0), copy.body('editorial', 1)], { size: 11, font: 'libreBaskerville', color: navy, leading: 1.6, label: 'Column 2 body' });
  p2.push(circle(408, 986, 22, 'none', { stroke: navy, strokeWidth: 1.5, label: 'Medallion folio' }), circle(408, 986, 17, 'none', { stroke: gold, strokeWidth: .8, label: 'Medallion folio ring' }));
  p2.push(text(388, 979, 40, '17', { size: 11, font: 'bodoni', color: navy, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
  return [p1, p2];
};

// ── Exports ───────────────────────────────────────────────────────────────────

export const DESIGNS: Record<string, EraDesigner> = {
  classical, 'egyptian-revival': egyptianRevival, 'roman-mosaic': romanMosaic, byzantine, insular, gothic, renaissance, baroque, rococo, neoclassical,
};

export const LESSONS: Record<string, DesignLesson> = {
  classical: {
    principle: 'Everything hangs from one centred axis, and the type is spaced the way an inscription cutter spaces capitals: wide enough for a wall to be read slowly from across a square.',
    history: 'Roman inscriptional capitals, cut with chisel after a brush-drawn model, reached their canonical form on monuments such as Trajan’s Column (dedicated 113 CE); their proportions were revived by Renaissance humanists and remain the basis of most serif capitals. Vitruvius’ De architectura, written in the first century BCE, gave the orders their rules of proportion and made the module, the column’s base diameter, the unit from which a whole building could be derived. Meander and laurel were the civic ornaments of that world, and neoclassical Europe later borrowed all of it for courts and banks.',
    tryThis: 'Tighten the title tracking from .18 to .04 and notice how the stele stops feeling carved. Then put it back and widen the laurel pair until the two branches almost touch the frieze.',
    interestTag: 'Greco-Roman classicism',
    related: ['Roman inscriptions', 'Vitruvius', 'Classical architecture', 'Neoclassicism'],
  },
  'egyptian-revival': {
    principle: 'Frontality and symmetry down the axis: the page faces you like a temple front, with ornament confined to bands and the title held inside a cartouche.',
    history: 'European fascination with Egypt was renewed by Napoleon’s campaign of 1798–1801 and the Description de l’Égypte published from 1809, whose measured plates gave architects and decorators an accurate vocabulary of pylons, lotus columns and winged sun discs. Obelisks were re-erected in Paris (1836), London (1878) and New York (1881). A second wave followed Howard Carter’s discovery of Tutankhamun’s tomb in 1922, feeding directly into the stepped, gilded geometry of Art Deco cinemas and jewellery.',
    tryThis: 'Remove the cartouche and set the title bare on the navy ground. Feel how much authority the rounded enclosure was carrying, then restore it and try a terracotta bar instead of gold.',
    interestTag: 'Egyptian Revival',
    related: ['Ancient Egypt', 'Art Deco', 'Orientalism', 'Monumental design'],
  },
  'roman-mosaic': {
    principle: 'The border does the structural work: tessellated bands and a guilloche frame hold the page while the central field stays plain, because a mosaic frames a picture rather than shouting over it.',
    history: 'Roman floor mosaics were laid in two grades: opus tessellatum, larger cubes for fields and geometric borders, and opus vermiculatum, tiny tesserae following contours for the central picture panel, the emblema, which was often made in a workshop and set into the floor as a finished unit. Tesserae were cut from limestone, marble, terracotta and glass. Vast pavements survive at Antioch, Zeugma and the fourth-century Villa Romana del Casale in Sicily, and their border repertoire of guilloche, meander and wave passed into textile and book design.',
    tryThis: 'Change the tessera palette to three colours only and re-render. Then reseed the mosaic bands by editing a single tile’s rotation and see how much the eye forgives in a field of small stones.',
    interestTag: 'Roman mosaic',
    related: ['Ancient Rome', 'Tessellation', 'Decorative arts', 'Pattern design'],
  },
  byzantine: {
    principle: 'A luminous field and a strict centred hierarchy: one image in a round-arched frame, capitals beneath, and a gold ground that reads as light rather than colour.',
    history: 'Byzantine art developed in the Eastern Roman Empire from the fourth century, with Constantinople as its capital until 1453. Its mosaicists set gold-leaf tesserae between layers of glass and tilted them to catch lamplight, as at San Vitale in Ravenna and in Hagia Sophia, consecrated in 537 under Justinian. Icons followed fixed conventions of frontality and rank, interrupted by the Iconoclasm of 726–843, and their formal grammar of gold ground, halo and hierarchy shaped Orthodox art, Italian painting before Giotto and, much later, Klimt’s golden phase.',
    tryThis: 'Swap the gold field for the cream paper and keep everything else. The layout still works, but the page has stopped glowing; that difference is the whole Byzantine idea.',
    interestTag: 'Byzantine art',
    related: ['Sacred art', 'Mosaic', 'Icons', 'Medieval art'],
  },
  insular: {
    principle: 'One decorated initial carries the page: the first letter is drawn largest, outlined in red dots, and the text begins beside it at a manuscript’s patient pace.',
    history: 'Insular manuscripts were produced in Irish and Northumbrian monasteries between about 600 and 900, among them the Book of Durrow, the Lindisfarne Gospels (c. 700) and the Book of Kells (c. 800). Scribes ruled the vellum with a hard point, wrote in a round insular majuscule, and reserved their greatest effort for decorated initials and carpet pages of interlace, spirals and knotwork, often outlining letters with hundreds of red-lead dots. Their scriptoria carried the style to the Continent, and the interlace tradition returned in the nineteenth-century Celtic Revival.',
    tryThis: 'Shrink the initial to 120 px and watch the page become ordinary. Restore it, then change the strand colours so the interlace passes over and under in two clearly different inks.',
    interestTag: 'Insular manuscripts',
    related: ['Book of Kells', 'Calligraphy', 'Medieval manuscripts', 'Celtic art'],
  },
  gothic: {
    principle: 'Verticality and light through tracery: tall pointed windows, jewel-coloured panes on a dark ground, and blackletter used once, as a masthead, so it announces rather than reads.',
    history: 'Gothic architecture began around 1140 with Abbot Suger’s rebuilding of the choir of Saint-Denis near Paris and spread across Europe until the sixteenth century. Pointed arches, rib vaults and flying buttresses moved the structure outside the wall, so that the wall could be replaced by stained glass, as at Chartres, Notre-Dame and Cologne. Tracery evolved from plate to bar to the flame-like Flamboyant, while the compressed textura script of the period became the model for Gutenberg’s first printing types in the 1450s.',
    tryThis: 'Recolour the eight panes of one window using only two hues and see the window lose depth. Then set the masthead in Cardo instead of blackletter; the page becomes a lecture, not a cathedral.',
    interestTag: 'Gothic architecture',
    related: ['Stained glass', 'Blackletter', 'Medieval art', 'Cathedrals'],
  },
  renaissance: {
    principle: 'The text block sits on the Van de Graaf canon, with the inner margin half the outer and the head half the foot, so the page is proportioned by construction rather than by eye.',
    history: 'Renaissance page design grew from the humanist scriptoria of fifteenth-century Italy and the printers who followed them: Nicolas Jenson’s roman types in Venice from 1470, and Aldus Manutius, whose small-format classics of 1501 introduced the italic cut by Francesco Griffo. Margins followed geometric constructions later reconstructed by J. A. van de Graaf in 1946 and studied by Jan Tschichold. Perspective, codified by Brunelleschi and Alberti, and the proportional theory of Luca Pacioli’s De divina proportione (1509, with plates after Leonardo) made harmony a discoverable rule.',
    tryThis: 'Drag the text block off the canon by 40 px and compare. Then write your own gloss in the outer margin; the page was designed to be answered.',
    interestTag: 'Renaissance typography',
    related: ['Book design', 'Golden ratio', 'Humanism', 'Aldus Manutius'],
  },
  baroque: {
    principle: 'One burst of warm light on a dark ground and a title set on the diagonal: the drama is in the contrast, and the eye is led rather than presented.',
    history: 'Baroque art emerged in Rome around 1600 and spread through Catholic Europe and Latin America over the following century and a half. Caravaggio’s tenebrism, lighting figures from a single source against darkness, and the sweeping diagonals of Rubens and Bernini gave painting and sculpture a theatrical urgency that the Church, after the Council of Trent, actively encouraged. Architecture and ornament followed with gilded scrolls, twisting columns and ceilings that dissolve into painted sky; the style’s high-contrast typography survives in the Didone faces of the eighteenth century.',
    tryThis: 'Set the band and title back to 0° and the page goes still. Return to −8°, then move the light to the top right and re-balance the scrolls so the darkness still has somewhere to sit.',
    interestTag: 'Baroque',
    related: ['Chiaroscuro', 'Caravaggio', 'Bernini', 'Counter-Reformation art'],
  },
  rococo: {
    principle: 'Asymmetry as manners: the title sits low, the ornament floats high and to the right, and the empty pink space is an ingredient rather than a leftover.',
    history: 'Rococo developed in Paris after the death of Louis XIV in 1715, as aristocratic life moved from Versailles to intimate town-house salons. Designers such as Juste-Aurèle Meissonnier and Nicolas Pineau developed the rocaille, an asymmetric shell-and-scroll ornament, for interiors like Boffrand’s Hôtel de Soubise, while Boucher and Fragonard painted in the pastels that candlelight flattered. Dismissed as frivolous by the neoclassicists who followed, the style shaped porcelain, furniture and fashion across Europe and returned in Art Nouveau’s love of the curve.',
    tryThis: 'Move the C-scroll cluster to the bottom left, under the title. The page is now heavy on one side and calm on the other; drag the title up until the two weights feel like a conversation.',
    interestTag: 'Rococo',
    related: ['Decorative arts', 'French 18th century', 'Ornament', 'Pastel'],
  },
  neoclassical: {
    principle: 'A severe axis and a civic voice: medallion above, widely tracked didone capitals below, three thin rules, and nothing that cannot be justified.',
    history: 'Neoclassicism took hold in the 1750s, fed by the excavations of Herculaneum and Pompeii and by Johann Joachim Winckelmann’s call for the noble simplicity of Greek art. Jacques-Louis David’s Oath of the Horatii (1784) set the pictorial standard; architects from Robert Adam to Thomas Jefferson built its temple fronts; and in Parma, Giambattista Bodoni cut the high-contrast, vertically stressed types whose Manuale tipografico appeared in 1818. Revolutionary France and the young American republic adopted its fasces, medallions and Greek keys as emblems of lawful authority.',
    tryThis: 'Reduce the title tracking to zero and set it flush left. Neoclassicism collapses into a newspaper; restore the centre and the tracking, then try a single rule instead of three.',
    interestTag: 'Neoclassicism',
    related: ['Bodoni', 'Civic design', 'Didone typography', 'Enlightenment'],
  },
};

export const OVERRIDES: Record<string, Partial<TelaStyleEra>> = {
  // The brief wants a navy ground with gold and terracotta; the library's order put gold first.
  'egyptian-revival': { palette: ['#172A35', '#F1E3B4', '#D7B65B', '#A13D2D'], typography: 'Condensed display capitals in a cartouche, light tracked sans text' },
  // Mint is an accent, not an ink; plum reads on pink at body sizes.
  rococo: { palette: ['#F4E3E8', '#6D536B', '#91B8B1', '#D5A85A'], typography: 'Light italic Cormorant display, EB Garamond text, one script flourish' },
  classical: { typography: 'Cinzel inscriptional capitals with Marcellus text and Tenor labels' },
  byzantine: { typography: 'Cinzel capitals on gold, EB Garamond text, Marcellus marginalia' },
  gothic: { typography: 'Blackletter masthead only; Cardo text with Almendra rubrics' },
};
