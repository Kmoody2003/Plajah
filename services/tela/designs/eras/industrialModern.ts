// industrialModern — hand-designed style-era documents (see docs/tela/TEMPLATE_DESIGN_BRIEF.md).
//
// Eight movements from the steam press to the primary plane: Victorian playbill,
// Arts & Crafts, Art Nouveau, Vienna Secession, Art Deco, Bauhaus,
// Constructivism, De Stijl. Every page is built from the template kit only; every
// motif is a separate, labelled, editable object.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson, EraDesigner } from '../types';
import type { TelaStyleEra } from '../../../telaStyleEraLibrary';
import { rect, circle, line, hr, vr, path, text, below, imageSlot, columns, span, frame, folio, dropCap, mix, alpha } from '../../templateKit';
import { copy } from '../../copy';
import * as orn from '../../ornaments';

// ── Local vocabulary ─────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Vertical open sine (a climbing stem) authored in the 0..100 box. */
function vSinePath(waves = 3, amp = 30, phase = 0): string {
  const n = 48; const pts: string[] = [];
  for (let i = 0; i <= n; i++) { const y = i / n * 100; pts.push(`${r2(50 + amp * Math.sin(phase + y / 100 * waves * Math.PI * 2))} ${r2(y)}`); }
  return `M${pts.join(' L')}`;
}

/** Stylised flat-pattern tulip: a stem and a three-pointed cup. */
const TULIP = 'M46 100 L46 60 L54 60 L54 100 Z M50 58 C30 58 14 44 12 18 C24 30 38 36 42 46 L50 6 L58 46 C62 36 76 30 88 18 C86 44 70 58 50 58 Z';

/** Ogee arch as an OPEN stroke (no base line) so it can crown an image well. */
const OGEE_OPEN = 'M0 100 L0 52 C0 30 22 26 32 18 C42 10 46 4 50 0 C54 4 58 10 68 18 C78 26 100 30 100 52 L100 100';

/** A row (or column) of alternating glyphs — the flat-pattern border. */
function glyphRow(x: number, y: number, len: number, size: number, gap: number, glyphs: string[], colors: string[], vertical: boolean, label: string): TelaVectorObject[] {
  const n = Math.max(1, Math.floor((len + gap) / (size + gap)));
  const start = (len - (n * (size + gap) - gap)) / 2;
  const out: TelaVectorObject[] = [];
  for (let i = 0; i < n; i++) {
    const d = glyphs[i % glyphs.length], c = colors[i % colors.length], off = start + i * (size + gap);
    out.push(vertical ? path(x, y + off, size, size, d, c, { label }) : path(x + off, y, size, size, d, c, { label }));
  }
  return out;
}

/** A dotted rule made of small squares (Secession "Quadratl" rhythm). */
function squareRule(x: number, y: number, w: number, cell: number, step: number, color: string, label = 'Square rule'): TelaVectorObject[] {
  const n = Math.floor((w - cell) / step) + 1; const out: TelaVectorObject[] = [];
  for (let i = 0; i < n; i++) out.push(rect(x + i * step, y, cell, cell, color, { label }));
  return out;
}

const BAUHAUS_YELLOW = '#E8B923';
const STIJL_YELLOW = '#F2C42B';

// ── Designs ──────────────────────────────────────────────────────────────────

export const DESIGNS: Record<string, EraDesigner> = {

  // ─── VICTORIAN — the playbill ───────────────────────────────────────────────
  victorian: ({ W, H, paper, ink, accent, seed }) => {
    const fr = frame(W, H, 44);
    const cx = W / 2;
    const ix = fr.x + 24, iw = fr.w - 48;
    const diamond = (x: number, y: number, s = 9, c = accent) => rect(x - s / 2, y - s / 2, s, s, c, { rotation: 45, label: 'Diamond ornament' });

    // Page 1 — dense centred stack, wood-type feel
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    p1.push(rect(fr.x, fr.y, fr.w, fr.h, 'none', { stroke: ink, strokeWidth: 5, label: 'Outer border' }));
    p1.push(rect(fr.x + 9, fr.y + 9, fr.w - 18, fr.h - 18, 'none', { stroke: ink, strokeWidth: 1.2, label: 'Inner border' }));
    for (const [dx, dy] of [[fr.x + 9, fr.y + 9], [fr.right - 9, fr.y + 9], [fr.x + 9, fr.bottom - 9], [fr.right - 9, fr.bottom - 9]]) p1.push(diamond(dx, dy, 11, ink));
    // scalloped header band with the venue set into it
    p1.push(path(ix, fr.y + 18, iw, 34, orn.scallopPath(13), ink, { label: 'Scalloped header' }));
    p1.push(text(ix, fr.y + 18 + 17, iw, 'Royal Assembly Rooms · Market Street', { size: 11, font: 'oswald', weight: 500, color: paper, align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Venue line', role: 'LABEL' }));

    let y = fr.y + 18 + 34 + 16;
    const rule = (w: number, weight: number, gap: number) => { p1.push(hr(cx - w / 2, y, w, ink, weight, { label: weight > 2 ? 'Heavy rule' : 'Fine rule' })); y += weight + gap; };
    const add = (o: TelaVectorObject, gap: number) => { p1.push(o); y = below(o, gap); };

    add(text(ix, y, iw, 'Under the Distinguished Patronage of the Mayor & Corporation', { size: 12.5, font: 'robotoSlab', weight: 400, color: ink, align: 'center', label: 'Patronage line', role: 'LABEL' }), 8);
    rule(iw * .55, 1, 8);
    add(text(ix, y, iw, 'Positively for One Night Only', { size: 28, font: 'oswald', weight: 700, color: ink, align: 'center', tracking: .2, transform: 'uppercase', wrap: false, label: 'Occasion line', role: 'DECK' }), 8);
    rule(iw, 3, 10);
    add(text(ix, y, iw, 'Saturday Evening, the Fourteenth of June', { size: 15, font: 'robotoSlab', weight: 700, color: ink, align: 'center', tracking: .1, transform: 'uppercase', wrap: false, label: 'Date line', role: 'LABEL' }), 12);
    rule(iw, 1, 10);
    add(text(ix, y, iw, 'GRAND', { size: 148, font: 'abril', weight: 400, color: accent, align: 'center', tracking: .04, leading: 1, wrap: false, label: 'Masthead word', role: 'HEADLINE' }), 6);
    add(text(ix, y, iw, 'BENEFIT NIGHT', { size: 72, font: 'playfair', weight: 900, color: ink, align: 'center', leading: 1, wrap: false, label: 'Headline', role: 'HEADLINE' }), 12);
    add(text(ix, y, iw, 'in aid of the Reading Room Restoration Fund', { size: 22, font: 'playfair', weight: 400, italic: true, color: ink, align: 'center', wrap: false, label: 'Purpose line', role: 'DECK' }), 14);
    rule(iw, 3, 4); rule(iw, 1, 14);
    add(text(ix, y, iw, 'A Company of Forty Artistes', { size: 26, font: 'oswald', weight: 500, color: ink, align: 'center', tracking: .22, transform: 'uppercase', wrap: false, label: 'Company line', role: 'DECK' }), 10);
    add(text(ix + 40, y, iw - 80, 'Songs · Recitations · Feats of Memory · A Magic Lantern Display of the Frozen North, with Descriptive Lecture', { size: 13, font: 'robotoSlab', weight: 400, color: ink, align: 'center', leading: 1.4, label: 'Attractions line', role: 'BODY' }), 12);
    rule(iw * .4, 1, 12);
    // programme in two parts — smaller type, the playbill's fine print
    add(text(ix, y, iw, 'Part the First', { size: 17, font: 'oswald', weight: 700, color: accent, align: 'center', tracking: .28, transform: 'uppercase', wrap: false, label: 'Part heading', role: 'LABEL' }), 8);
    add(text(ix + 30, y, iw - 60, 'Overture — “The Harbour Lights” · The Band of the Ironworks\nSong — “When the Kettle Sings” · Miss E. Hartley\nRecitation — “The Wreck of the Nancy Lee” · Mr. J. Threlfall', { size: 11.5, font: 'robotoSlab', weight: 400, italic: true, color: ink, align: 'center', leading: 1.5, label: 'Programme, part one', role: 'BODY' }), 12);
    p1.push(diamond(cx - 26, y + 4), diamond(cx, y + 4), diamond(cx + 26, y + 4)); y += 20;
    add(text(ix, y, iw, 'Part the Second', { size: 17, font: 'oswald', weight: 700, color: accent, align: 'center', tracking: .28, transform: 'uppercase', wrap: false, label: 'Part heading', role: 'LABEL' }), 8);
    add(text(ix + 30, y, iw - 60, 'Ballads of the Northern Circuit · The Celebrated Comic Interlude\nMagic Lantern — Views of the Polar Seas, Icebergs & the Midnight Sun\nGrand Finale — “Home, Sweet Home” by the Entire Company', { size: 11.5, font: 'robotoSlab', weight: 400, italic: true, color: ink, align: 'center', leading: 1.5, label: 'Programme, part two', role: 'BODY' }), 14);
    rule(iw, 3, 12);
    add(text(ix + 60, y, iw - 200, 'Doors Open at Seven o’Clock — Performance to Commence at Half-past Seven Precisely — Carriages at Eleven', { size: 13, font: 'oswald', weight: 400, color: ink, align: 'center', tracking: .06, transform: 'uppercase', leading: 1.45, label: 'Doors line', role: 'BODY' }), 10);
    rule(iw * .55, 1, 10);
    add(text(ix + 60, y, iw - 200, 'Boxes 2s. · Pit 1s. · Gallery 6d. · Children in Arms Not Admitted', { size: 12, font: 'robotoSlab', weight: 700, color: ink, align: 'center', label: 'Prices line', role: 'BODY' }), 10);
    add(text(ix + 60, y, iw - 200, 'Tickets to be had at the Rooms, at Mr. Pilling’s Circulating Library, and of the Printers.', { size: 11, font: 'robotoSlab', weight: 400, italic: true, color: ink, align: 'center', leading: 1.4, label: 'Tickets line', role: 'BODY' }), 0);
    // the seal — a burst at the right, overlapping the fine print
    const sealX = fr.right - 24 - 128, sealY = y - 116;
    p1.push(path(sealX, sealY, 128, 128, orn.burstPath(18, seed), accent, { rotation: -10, label: 'Seal burst' }));
    p1.push(text(sealX + 14, sealY + 44, 100, 'ADMIT\nONE', { size: 19, font: 'oswald', weight: 700, color: paper, align: 'center', tracking: .12, leading: 1.05, wrap: false, rotation: -10, label: 'Seal text', role: 'LABEL' }));
    // printer's foot
    p1.push(hr(ix, fr.bottom - 40, iw, ink, 1, { label: 'Foot rule' }));
    p1.push(text(ix, fr.bottom - 32, iw, 'Printed by Plajah & Sons, Steam Letterpress Printers, Market Street — Bills, Cards & Circulars at the Shortest Notice.', { size: 9, font: 'robotoSlab', weight: 400, color: ink, align: 'center', label: 'Printer’s imprint', role: 'CAPTION' }));

    // Page 2 — three narrow columns, rules everywhere, ornate folio
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    p2.push(rect(fr.x, fr.y, fr.w, fr.h, 'none', { stroke: ink, strokeWidth: 3, label: 'Border' }));
    p2.push(rect(fr.x + 7, fr.y + 7, fr.w - 14, fr.h - 14, 'none', { stroke: ink, strokeWidth: .8, label: 'Inner border' }));
    p2.push(hr(ix, fr.y + 24, iw, ink, 2.5, { label: 'Head rule (heavy)' }));
    p2.push(hr(ix, fr.y + 29, iw, ink, .8, { label: 'Head rule (fine)' }));
    p2.push(text(ix, fr.y + 38, iw, 'The Programme of the Evening · Notes upon the Performers', { size: 11, font: 'oswald', weight: 500, color: ink, align: 'center', tracking: .28, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
    p2.push(hr(ix, fr.y + 58, iw, ink, .8, { label: 'Head rule (fine)' }));
    p2.push(hr(ix, fr.y + 62, iw, ink, 2.5, { label: 'Head rule (heavy)' }));
    const title2 = text(ix, fr.y + 84, iw, 'Who Appears, and in What Order', { size: 30, font: 'playfair', weight: 900, color: ink, align: 'center', wrap: false, label: 'Interior title', role: 'HEADLINE' });
    p2.push(title2);
    p2.push(diamond(cx, below(title2, 12)), diamond(cx - 22, below(title2, 12), 6), diamond(cx + 22, below(title2, 12), 6));
    const colTop = below(title2, 30);
    p2.push(hr(ix, colTop - 8, iw, ink, .8, { label: 'Column head rule' }));
    const cols = columns(ix, iw, 3, 20);
    const colBottom = fr.bottom - 64;
    p2.push(vr(cols[1].x - 10, colTop, colBottom - colTop, ink, .8, { label: 'Column rule' }));
    p2.push(vr(cols[2].x - 10, colTop, colBottom - colTop, ink, .8, { label: 'Column rule' }));
    const sub = (x: number, y0: number, w: number, s: string, i: number) => {
      const t = text(x, y0, w, s, { size: 12.5, font: 'oswald', weight: 700, color: accent, align: 'center', tracking: .2, transform: 'uppercase', wrap: false, label: `Subhead ${i}`, role: 'LABEL' });
      const r = hr(x, below(t, 5), w, ink, .8, { label: 'Subhead rule' });
      return { objs: [t, r], y: below(t, 12) };
    };
    const body = (x: number, y0: number, w: number, s: string, label: string) => text(x, y0, w, s, { size: 10.5, font: 'robotoSlab', weight: 400, color: ink, leading: 1.42, label, role: 'BODY' });
    // column 1
    let s1 = sub(cols[0].x, colTop, cols[0].w, 'The Band', 1); p2.push(...s1.objs);
    const b1 = body(cols[0].x, s1.y, cols[0].w, copy.body('culture', 0), 'Column 1 body'); p2.push(b1);
    s1 = sub(cols[0].x, below(b1, 16), cols[0].w, 'The Singers', 2); p2.push(...s1.objs);
    const b1b = body(cols[0].x, s1.y, cols[0].w, 'Miss Hartley, lately of the Northern Circuit, brings a repertoire of ballads both new and familiar, and has consented to sing “The Last Rose of Summer” by particular request. The Band will accompany.', 'Column 1 body, continued'); p2.push(b1b);
    s1 = sub(cols[0].x, below(b1b, 16), cols[0].w, 'The Comic Interlude', 5); p2.push(...s1.objs);
    const b1c = body(cols[0].x, s1.y, cols[0].w, 'Mr. Threlfall’s Interlude, “The Lodger Who Would Not Leave,” has been received with roars of laughter in every town of the Circuit, and will be given here with the original properties, including the celebrated Umbrella.', 'Column 1 body, interlude'); p2.push(b1c);
    s1 = sub(cols[0].x, below(b1c, 16), cols[0].w, 'The Orchestra', 6); p2.push(...s1.objs);
    const b1d = body(cols[0].x, s1.y, cols[0].w, 'The Band of the Ironworks, twenty-two instruments under the direction of Mr. H. Broadbent, will perform selections from the popular operas between the Parts, and a Grand March of their own composition upon the entrance of the Mayor.', 'Column 1 body, orchestra'); p2.push(b1d);
    s1 = sub(cols[0].x, below(b1d, 16), cols[0].w, 'The Chair', 7); p2.push(...s1.objs);
    const b1e = body(cols[0].x, s1.y, cols[0].w, 'The Chair will be taken at half-past seven precisely by Alderman Whitworth, who has kindly consented to say a few words upon the objects of the Fund. Encores will be granted at his discretion, having regard to the hour and the last omnibus.', 'Column 1 body, chair'); p2.push(b1e);
    // column 2 — the engraving
    p2.push(...imageSlot(cols[1].x, colTop, cols[1].w, 150, { tone: 'light', frame: ink, frameWidth: 2, caption: 'Engraving', label: 'Engraved plate' }));
    const cap2 = text(cols[1].x, colTop + 156, cols[1].w, 'The Assembly Rooms as they appeared upon the occasion of the last Benefit.', { size: 9, font: 'robotoSlab', weight: 400, italic: true, color: ink, align: 'center', leading: 1.35, label: 'Plate caption', role: 'CAPTION' });
    p2.push(cap2);
    let s2 = sub(cols[1].x, below(cap2, 14), cols[1].w, 'The Lantern', 3); p2.push(...s2.objs);
    const b2a = body(cols[1].x, s2.y, cols[1].w, 'The Magic Lantern views were taken upon the spot by an officer of the late Expedition, and are shewn by the oxy-hydrogen light, of unexampled brilliancy. The Lecture will occupy about forty minutes.', 'Column 2 body'); p2.push(b2a);
    s2 = sub(cols[1].x, below(b2a, 16), cols[1].w, 'The Lecturer', 8); p2.push(...s2.objs);
    const b2b = body(cols[1].x, s2.y, cols[1].w, 'Lieutenant Ashby, late of the Expedition, will describe the Views from personal observation, and will exhibit the Sledge Flag and a Specimen of the Ice, kept for the purpose in the cellar of the Rooms.', 'Column 2 body, lecturer'); p2.push(b2b);
    s2 = sub(cols[1].x, below(b2b, 16), cols[1].w, 'The Instrument', 9); p2.push(...s2.objs);
    const b2c = body(cols[1].x, s2.y, cols[1].w, 'The Lantern is of the newest bi-unial pattern, by which one View dissolves into the next without interval or darkness. The effect of the Aurora is said by those who have seen it to be beyond description.', 'Column 2 body, instrument'); p2.push(b2c);
    // boxed notice
    const nb = text(cols[1].x + 10, below(b2c, 30), cols[1].w - 20, 'NOTICE. — Persons desirous of obtaining Lantern Views of their own Premises may apply to the Lecturer at the close of the Performance. Terms moderate.', { size: 10, font: 'robotoSlab', weight: 400, color: ink, align: 'center', leading: 1.4, label: 'Boxed notice', role: 'BODY' });
    p2.push(rect(cols[1].x, below(b2c, 20), cols[1].w, nb.h + 20, 'none', { stroke: ink, strokeWidth: 1.2, label: 'Notice box' }));
    p2.push(rect(cols[1].x + 3, below(b2c, 23), cols[1].w - 6, nb.h + 14, 'none', { stroke: ink, strokeWidth: .6, label: 'Notice box (inner)' }));
    p2.push(nb);
    // column 3
    let s3 = sub(cols[2].x, colTop, cols[2].w, 'Notices', 4); p2.push(...s3.objs);
    const b3 = body(cols[2].x, s3.y, cols[2].w, 'The Committee begs to remind Patrons that the Gallery is reached by the stair in Bull Lane, and that smoking is not permitted in any part of the House. Early application for Boxes is recommended.', 'Column 3 body'); p2.push(b3);
    p2.push(hr(cols[2].x + 20, below(b3, 16), cols[2].w - 40, ink, 2, { label: 'Quote rule' }));
    const q3 = text(cols[2].x, below(b3, 26), cols[2].w, copy.quote('culture', 0), { size: 14, font: 'playfair', weight: 400, italic: true, color: ink, align: 'center', leading: 1.35, label: 'Pull quote', role: 'DECK' }); p2.push(q3);
    p2.push(hr(cols[2].x + 20, below(q3, 10), cols[2].w - 40, ink, 2, { label: 'Quote rule' }));
    const b3b = body(cols[2].x, below(q3, 24), cols[2].w, copy.body('culture', 1).replace('a film', 'a performance'), 'Column 3 body, continued'); p2.push(b3b);
    s3 = sub(cols[2].x, below(b3b, 16), cols[2].w, 'Refreshments', 10); p2.push(...s3.objs);
    const b3c = body(cols[2].x, s3.y, cols[2].w, 'Tea, Coffee and Ices will be served in the Ante-Room during the Interval by the Ladies’ Committee, at moderate charges, the proceeds to the Fund.', 'Column 3 body, refreshments'); p2.push(b3c);
    s3 = sub(cols[2].x, below(b3c, 16), cols[2].w, 'Conveyances', 11); p2.push(...s3.objs);
    const b3d = body(cols[2].x, s3.y, cols[2].w, 'Omnibuses will leave the Rooms for the Railway Station and the Upper Town at the close of the Performance. Carriages may be ordered for eleven.', 'Column 3 body, conveyances'); p2.push(b3d);
    s3 = sub(cols[2].x, below(b3d, 16), cols[2].w, 'Acknowledgments', 12); p2.push(...s3.objs);
    p2.push(body(cols[2].x, s3.y, cols[2].w, 'The Committee gratefully acknowledge the loan of the Piano by Messrs. Hardcastle, of the Gas by the Company, and of the Palms by the Gardener to the Park.', 'Column 3 body, acknowledgments'));
    // ornate folio
    p2.push(hr(ix, colBottom + 10, iw, ink, 2.5, { label: 'Foot rule (heavy)' }));
    p2.push(hr(ix, colBottom + 15, iw, ink, .8, { label: 'Foot rule (fine)' }));
    p2.push(text(ix, colBottom + 24, iw, '— 2 —', { size: 12, font: 'playfair', weight: 700, color: ink, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
    p2.push(diamond(cx - 60, colBottom + 31, 7), diamond(cx + 60, colBottom + 31, 7));
    return [p1, p2];
  },

  // ─── ARTS & CRAFTS — honest craft, botanical border ────────────────────────
  'arts-crafts': ({ W, H, paper, ink, accent, secondary }) => {
    const fr = frame(W, H, 40);
    const band = 44; // the printed border between two woodcut frames
    const inner = frame(W, H, fr.m + band); // inner frame line
    const cx0 = inner.x + 24, cw = inner.w - 48;

    const border = (): TelaVectorObject[] => {
      const out: TelaVectorObject[] = [];
      out.push(rect(fr.x, fr.y, fr.w, fr.h, 'none', { stroke: ink, strokeWidth: 7, label: 'Woodcut frame (outer)' }));
      out.push(rect(inner.x, inner.y, inner.w, inner.h, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Woodcut frame (inner)' }));
      const g = 30, gap = 8, run = fr.w - band * 2 - 8;
      out.push(...glyphRow(fr.x + band + 4, fr.y + 7, run, g, gap, [TULIP, orn.leafPath()], [accent, ink], false, 'Border tulip / leaf'));
      out.push(...glyphRow(fr.x + band + 4, fr.bottom - 7 - g, run, g, gap, [TULIP, orn.leafPath()], [accent, ink], false, 'Border tulip / leaf'));
      const vrun = fr.h - band * 2 - 8;
      out.push(...glyphRow(fr.x + 7, fr.y + band + 4, vrun, g, gap, [orn.leafPath(), TULIP], [ink, accent], true, 'Border leaf / tulip'));
      out.push(...glyphRow(fr.right - 7 - g, fr.y + band + 4, vrun, g, gap, [orn.leafPath(), TULIP], [ink, accent], true, 'Border leaf / tulip'));
      for (const [x, y] of [[fr.x + 4, fr.y + 4], [fr.right - band + 4, fr.y + 4], [fr.x + 4, fr.bottom - band + 4], [fr.right - band + 4, fr.bottom - band + 4]]) {
        out.push(rect(x, y, band - 8, band - 8, secondary, { label: 'Corner block' }));
        out.push(rect(x + 9, y + 9, band - 26, band - 26, ink, { rotation: 45, label: 'Corner lozenge' }));
      }
      return out;
    };

    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' }), ...border()];
    // banner
    const bannerY = inner.y + 32;
    p1.push(rect(cx0, bannerY, cw, 128, accent, { label: 'Title banner' }));
    p1.push(rect(cx0 + 6, bannerY + 6, cw - 12, 116, 'none', { stroke: paper, strokeWidth: 1, label: 'Banner hairline' }));
    const title = text(cx0 + 24, bannerY + 16, cw - 48, 'Of Honest Work & the Well-Made Page', { size: 44, font: 'alegreya', weight: 700, color: paper, align: 'center', leading: 1.08, label: 'Title', role: 'HEADLINE' });
    p1.push(title);
    const deck = text(cx0 + 40, bannerY + 128 + 18, cw - 80, 'Being a Gathering of Essays upon Craft, Pattern & the Printed Book', { size: 17, font: 'alegreya', weight: 400, italic: true, color: ink, align: 'center', leading: 1.35, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    // ornament between deck and plate
    const oy = below(deck, 14);
    p1.push(hr(cx0 + 120, oy + 12, cw - 240, secondary, 1.5, { label: 'Ochre rule' }));
    p1.push(path(W / 2 - 11, oy, 22, 22, orn.leafPath(), ink, { label: 'Leaf fleuron' }));
    p1.push(path(W / 2 - 46, oy + 3, 16, 16, TULIP, accent, { label: 'Tulip fleuron' }));
    p1.push(path(W / 2 + 30, oy + 3, 16, 16, TULIP, accent, { label: 'Tulip fleuron' }));
    // the plate
    const plateY = oy + 40, plateH = inner.bottom - 118 - plateY;
    p1.push(...imageSlot(cx0, plateY, cw, plateH, { tone: 'light', frame: ink, frameWidth: 3, caption: 'Wood-engraved frontispiece', label: 'Frontispiece plate' }));
    p1.push(rect(cx0 + 8, plateY + 8, cw - 16, plateH - 16, 'none', { stroke: secondary, strokeWidth: 1, label: 'Plate hairline' }));
    const cap = text(cx0, plateY + plateH + 12, cw, 'The walled garden at midsummer, cut on the block by the author.', { size: 11, font: 'alegreya', weight: 400, italic: true, color: ink, align: 'center', label: 'Plate caption', role: 'CAPTION' });
    p1.push(cap);
    p1.push(hr(cx0 + 160, below(cap, 14), cw - 320, ink, 1, { label: 'Colophon rule' }));
    p1.push(text(cx0 + 40, below(cap, 24), cw - 80, 'Set in Alegreya and Lora, and printed upon hand-laid paper at the Hollow Lane Press, in the year of the Guild’s founding.', { size: 11.5, font: 'lora', weight: 400, color: ink, align: 'center', leading: 1.4, label: 'Colophon', role: 'CAPTION' }));

    // Page 2 — single wide measure, decorated initial, leaf border on the outer edge
    const fr2 = frame(W, H, 64, { inner: 76, outer: 128 });
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    // outer-edge leaf border
    p2.push(vr(W - 104, fr2.y, fr2.h, ink, 2, { label: 'Outer border rule' }));
    p2.push(vr(W - 60, fr2.y, fr2.h, ink, .8, { label: 'Outer border hairline' }));
    p2.push(...glyphRow(W - 97, fr2.y + 4, fr2.h - 8, 28, 10, [orn.leafPath(), TULIP], [ink, accent], true, 'Margin leaf / tulip'));
    // running head
    p2.push(text(fr2.x, fr2.y - 30, fr2.w / 2, 'Essays upon Craft', { size: 11, font: 'alegreya', weight: 400, italic: true, color: ink, wrap: false, label: 'Running head', role: 'FOLIO' }));
    p2.push(text(fr2.cx, fr2.y - 30, fr2.w / 2, 'Chapter the Second', { size: 11, font: 'alegreya', weight: 400, italic: true, color: ink, align: 'right', wrap: false, label: 'Running head (right)', role: 'FOLIO' }));
    p2.push(hr(fr2.x, fr2.y - 12, fr2.w, ink, 1.5, { label: 'Head rule' }));
    const mainW = 430, noteX = fr2.x + mainW + 34, noteW = fr2.right - noteX;
    const h2 = text(fr2.x, fr2.y + 6, fr2.w, 'Upon the Honesty of Materials', { size: 28, font: 'alegreya', weight: 700, color: ink, wrap: false, label: 'Chapter title', role: 'HEADLINE' });
    p2.push(h2);
    p2.push(hr(fr2.x, below(h2, 10), 120, accent, 3, { label: 'Title rule' }));
    // decorated initial
    const startY = below(h2, 34);
    p2.push(rect(fr2.x - 6, startY - 8, 76, 76, secondary, { label: 'Initial block' }));
    p2.push(rect(fr2.x - 1, startY - 3, 66, 66, 'none', { stroke: ink, strokeWidth: 1, label: 'Initial block hairline' }));
    p2.push(path(fr2.x + 52, startY + 46, 20, 20, orn.leafPath(), accent, { label: 'Initial leaf' }));
    const para1 = 'The first duty of a maker is to the stuff in the hand. Oak wants to be oak, and a page wants to be read; neither is improved by pretending to be something dearer. When the type is honest and the paper is honest, the reader feels the honesty before a single sentence is understood.';
    const dc = dropCap(fr2.x, startY, mainW, para1, { capFont: 'alegreya', textFont: 'lora', capSize: 68, size: 11.5, color: ink, capColor: ink, leading: 1.5 });
    p2.push(...dc);
    const bodyOpts = { size: 11.5, font: 'lora' as const, weight: 400, color: ink, leading: 1.5 };
    const b1 = text(fr2.x, below(dc[1], 12), mainW, copy.paragraphs('editorial', 2, 2), { ...bodyOpts, label: 'Body copy', role: 'BODY' });
    p2.push(b1);
    const sh = text(fr2.x, below(b1, 20), mainW, 'The Pattern and the Page', { size: 15, font: 'alegreya', weight: 700, color: accent, wrap: false, label: 'Subhead', role: 'LABEL' });
    p2.push(sh);
    const b2 = text(fr2.x, below(sh, 8), mainW, 'A border is not a fence around the text. It is the hedge around the garden, grown from the same soil, and it should look as though it could go on growing after the printer has put the block away. So the leaf repeats, and the tulip between the leaves repeats, and the eye, having learned the rhythm, is free to rest.\n\nThe same is true of the initial letter. It is a door. Make it large enough to be seen from across the room and plain enough that a child could walk through it.\n\nNothing in this system is drawn to be admired on its own. The border serves the text, the initial serves the paragraph, and the paragraph serves the reader who has come, after a day’s work, to sit by the lamp and be told something true.', { ...bodyOpts, label: 'Body copy, continued', role: 'BODY' });
    p2.push(b2);
    const sh2 = text(fr2.x, below(b2, 20), mainW, 'Of Ink and Impression', { size: 15, font: 'alegreya', weight: 700, color: accent, wrap: false, label: 'Subhead 2', role: 'LABEL' });
    p2.push(sh2);
    p2.push(text(fr2.x, below(sh2, 8), mainW, 'The old printers pressed hard, and the page remembers it. Run a thumb across a leaf from a hand-press and the letters are there beneath the skin, a little valley for each stroke. The machine presses lightly, kisses the paper and lets it go, and the page forgets at once.\n\nWe do not ask for the valley out of nostalgia. We ask for it because a letter that has been pressed into the sheet holds its ink at the edges and prints black, where a letter laid upon the surface prints grey and tired. The difference is small under the glass and enormous across a room.\n\nSo the rule in this workshop is simple: dampen the paper, ink the forme sparingly, and pull the bar as though the sheet were a door that has stuck. What comes off the tympan should look less like a printed thing and more like a thing that has been made.', { ...bodyOpts, label: 'Body copy, ink and impression', role: 'BODY' }));
    // marginal column: plate, caption, notes
    p2.push(...imageSlot(noteX, startY - 8, noteW, 150, { tone: 'light', frame: ink, frameWidth: 1.5, caption: 'Detail', label: 'Marginal plate' }));
    const mcap = text(noteX, startY + 150, noteW, 'A printer’s flower, cut on the end grain.', { size: 9.5, font: 'alegreya', weight: 400, italic: true, color: ink, leading: 1.35, label: 'Marginal caption', role: 'CAPTION' });
    p2.push(mcap);
    p2.push(hr(noteX, below(mcap, 12), noteW, secondary, 1.5, { label: 'Marginal rule' }));
    p2.push(text(noteX, below(mcap, 20), noteW, 'Marginal note: the tulip in this border is drawn flat, with no shading, so that it prints evenly from the block.', { size: 10, font: 'alegreya', weight: 400, italic: true, color: mix(ink, .15), leading: 1.4, label: 'Marginal note', role: 'CAPTION' }));
    p2.push(path(noteX + noteW / 2 - 9, below(sh2, -6), 18, 18, orn.leafPath(), accent, { label: 'Marginal leaf' }));
    p2.push(hr(noteX, below(sh2, 20), noteW, secondary, 1.5, { label: 'Marginal rule 2' }));
    p2.push(text(noteX, below(sh2, 28), noteW, 'Marginal note: “impression” here means the bite of the type into the sheet — the word the pressmen use, not the painters’ one.', { size: 10, font: 'alegreya', weight: 400, italic: true, color: mix(ink, .15), leading: 1.4, label: 'Marginal note 2', role: 'CAPTION' }));
    // folio
    p2.push(hr(fr2.x, fr2.bottom - 4, fr2.w, ink, 1, { label: 'Foot rule' }));
    p2.push(text(fr2.x, fr2.bottom + 6, fr2.w, '27', { size: 11, font: 'alegreya', weight: 700, color: ink, wrap: false, label: 'Folio', role: 'FOLIO' }));
    return [p1, p2];
  },

  // ─── ART NOUVEAU — whiplash ────────────────────────────────────────────────
  'art-nouveau': ({ W, H, paper, ink, accent, secondary }) => {
    const fr = frame(W, H, 48);
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    // climbing stems on the left edge
    p1.push(path(30, 40, 70, 980, vSinePath(4, 34), 'none', { stroke: ink, strokeWidth: 2.5, open: true, label: 'Climbing stem' }));
    p1.push(path(52, 20, 70, 1000, vSinePath(4, 34, Math.PI), 'none', { stroke: secondary, strokeWidth: 1.5, open: true, label: 'Climbing stem (gold)' }));
    for (const [ly, rot] of [[150, -35], [390, 40], [630, -30], [870, 35]] as Array<[number, number]>) p1.push(path(48, ly, 30, 44, orn.leafPath(), alpha(ink, .85), { rotation: rot, label: 'Stem leaf' }));
    // whiplash tendril bursting from the lower-left corner
    p1.push(path(-60, 620, 460, 430, orn.whiplashPath(), alpha(accent, .55), { label: 'Whiplash tendril' }));
    // tendril across the head
    p1.push(path(W * .32, 22, 520, 46, orn.sineOpenPath(3, 32), 'none', { stroke: secondary, strokeWidth: 1.5, open: true, label: 'Head tendril' }));
    // ogee-crowned image well
    const sx = 296, sw = 440, archH = 128, sy = 96, slotH = 468;
    const shade = 'rgba(20,16,24,.09)';
    p1.push(path(sx, sy, sw, archH, orn.ogeeArchPath(), shade, { label: 'Image well (arch)', role: 'IMAGE_SLOT' }));
    p1.push(...imageSlot(sx, sy + archH - 1, sw, slotH, { tone: 'light', shade, caption: 'Poster image', label: 'Image well' }));
    p1.push(path(sx, sy, sw, archH, OGEE_OPEN, 'none', { stroke: secondary, strokeWidth: 3.5, open: true, label: 'Ogee frame' }));
    p1.push(vr(sx, sy + archH, slotH, secondary, 3.5, { label: 'Frame side' }));
    p1.push(vr(sx + sw, sy + archH, slotH, secondary, 3.5, { label: 'Frame side' }));
    p1.push(hr(sx, sy + archH + slotH, sw, secondary, 3.5, { label: 'Frame base' }));
    p1.push(path(sx + 10, sy + 12, sw - 20, archH - 10, OGEE_OPEN, 'none', { stroke: ink, strokeWidth: 1, open: true, label: 'Ogee hairline' }));
    p1.push(rect(sx + 10, sy + archH + 2, sw - 20, slotH - 12, 'none', { stroke: ink, strokeWidth: 1, label: 'Inner hairline' }));
    // title, low and asymmetric
    const t = text(fr.x + 40, 704, 400, 'The Spring\nExhibition', { size: 58, font: 'yeseva', weight: 400, color: ink, leading: 1.02, wrap: false, label: 'Title', role: 'HEADLINE' });
    p1.push(t);
    const k = text(fr.x + 42, below(t, 14), 440, 'Posters · Glass · Ironwork · Textiles', { size: 15, font: 'philosopher', weight: 700, color: accent, tracking: .14, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' });
    p1.push(k);
    p1.push(text(fr.x + 42, below(k, 12), 400, 'Opening the fourteenth of May and continuing through the summer season in the Hall of Applied Arts, by the river.', { size: 12, font: 'lora', weight: 400, italic: true, color: ink, leading: 1.45, label: 'Details', role: 'BODY' }));
    // date block, right
    const dx = W - fr.m - 240;
    const d = text(dx, 712, 240, 'May – September', { size: 24, font: 'philosopher', weight: 400, color: ink, align: 'right', wrap: false, label: 'Dates', role: 'DECK' });
    p1.push(d);
    p1.push(hr(W - fr.m - 120, below(d, 8), 120, secondary, 1.5, { label: 'Date rule' }));
    p1.push(text(dx, below(d, 18), 240, 'Admission one shilling\nStudents free on Thursdays', { size: 11, font: 'philosopher', weight: 400, color: ink, align: 'right', leading: 1.5, tracking: .06, label: 'Admission', role: 'CAPTION' }));
    p1.push(text(W - fr.m - 260, H - 40 - 12, 260, 'Hall of Applied Arts · Riverside', { size: 9.5, font: 'philosopher', weight: 400, color: ink, align: 'right', tracking: .18, transform: 'uppercase', wrap: false, label: 'Venue', role: 'CAPTION' }));

    // Page 2 — text inside an organic-cornered frame; one measure plus a caption column
    const fr2 = frame(W, H, 56);
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    const fy = fr2.y + 28, fh = fr2.h - 56;
    p2.push(rect(fr2.x, fy, fr2.w, fh, 'none', { stroke: ink, strokeWidth: 2, rx: 36, label: 'Organic frame' }));
    p2.push(rect(fr2.x + 9, fy + 9, fr2.w - 18, fh - 18, 'none', { stroke: secondary, strokeWidth: 1, rx: 28, label: 'Frame hairline' }));
    p2.push(path(fr2.x - 26, fy - 30, 150, 130, orn.whiplashPath(), alpha(accent, .6), { label: 'Corner tendril' }));
    p2.push(path(fr2.right - 120, fy + fh - 96, 150, 130, orn.whiplashPath(), alpha(accent, .45), { rotation: 180, label: 'Corner tendril (foot)' }));
    // running head + folio outside the frame
    p2.push(text(fr2.x + 20, fr2.y - 6, fr2.w / 2 - 40, 'The Spring Exhibition · Catalogue', { size: 10, font: 'philosopher', weight: 700, color: ink, tracking: .2, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
    p2.push(text(fr2.cx, fr2.y - 6, fr2.w / 2 - 20, 'Glass · 41–58', { size: 10, font: 'philosopher', weight: 700, color: ink, tracking: .2, transform: 'uppercase', align: 'right', wrap: false, label: 'Running head (right)', role: 'FOLIO' }));
    const ix = fr2.x + 40, iw2 = fr2.w - 80, mainW = 372, capX = ix + mainW + 30, capW = ix + iw2 - capX;
    const h2 = text(ix, fy + 40, mainW, 'Glass that remembers the river', { size: 26, font: 'yeseva', weight: 400, color: ink, leading: 1.1, label: 'Section title', role: 'HEADLINE' });
    p2.push(h2);
    p2.push(path(ix, below(h2, 6), 160, 14, orn.sineOpenPath(3, 30), 'none', { stroke: secondary, strokeWidth: 1.5, open: true, label: 'Title tendril rule' }));
    const b = { size: 11.5, font: 'lora' as const, weight: 400, color: ink, leading: 1.5 };
    const b1 = text(ix, below(h2, 30), mainW, 'The vases in the first case were blown in the workshop by the weir, and the colour was not added but coaxed: iron for the green of deep water, a breath of copper for the rose that appears where the river turns. Each piece was turned against the light until the maker saw the current in it, and only then was it cooled.\n\nThe iron gates in the second room follow the same law. Nothing is straight that could be allowed to curve; nothing curves that has not first been asked to grow. The smith speaks of a line the way a gardener speaks of a stem.', { ...b, label: 'Body copy', role: 'BODY' });
    p2.push(b1);
    const sh = text(ix, below(b1, 18), mainW, 'On the textiles', { size: 17, font: 'yeseva', weight: 400, color: accent, wrap: false, label: 'Subhead', role: 'LABEL' });
    p2.push(sh);
    const b2 = text(ix, below(sh, 8), mainW, copy.body('editorial', 2) + '\n\nThe printed hangings in the last room are shown as they were meant to be seen, in the morning light of a west-facing wall, so that the pattern advances and retreats through the day.', { ...b, label: 'Body copy, continued', role: 'BODY' });
    p2.push(b2);
    const sh2 = text(ix, below(b2, 18), mainW, 'On the ironwork', { size: 17, font: 'yeseva', weight: 400, color: accent, wrap: false, label: 'Subhead 2', role: 'LABEL' });
    p2.push(sh2);
    p2.push(text(ix, below(sh2, 8), mainW, 'The balustrade in the stair hall was forged in one piece over eleven weeks, and the smith will tell you that the hardest part was not the curve but the place where the curve stops. A stem in a garden knows when to end; a bar of iron has to be persuaded. Look at the terminals, where each line thins to a bud and turns back on itself, and you will see the persuasion.\n\nThe lamps that hang from it were made by a different hand and a different trade, but the two men worked from the same drawing, pinned to the same wall, and argued about it every morning until the drawing gave in. That argument is what the visitor is looking at, and it is why the whole reads as one growth rather than as a railing with lamps attached.\n\nThe smaller pieces — the door furniture, the fire irons, the little bronze inkstand shaped like a lily pad — repay a slower look, and the attendants will unlock the cases on request.', { ...b, label: 'Body copy, ironwork', role: 'BODY' }));
    // caption column: small ogee-crowned plate, caption, pull quote
    const cs = fy + 40, cArch = 64, cH = 236;
    p2.push(path(capX, cs, capW, cArch, orn.ogeeArchPath(), shade, { label: 'Plate (arch)', role: 'IMAGE_SLOT' }));
    p2.push(...imageSlot(capX, cs + cArch - 1, capW, cH, { tone: 'light', shade, caption: 'Catalogue plate', label: 'Plate' }));
    p2.push(path(capX, cs, capW, cArch, OGEE_OPEN, 'none', { stroke: secondary, strokeWidth: 2.5, open: true, label: 'Plate ogee frame' }));
    p2.push(vr(capX, cs + cArch, cH, secondary, 2.5, { label: 'Plate frame side' }));
    p2.push(vr(capX + capW, cs + cArch, cH, secondary, 2.5, { label: 'Plate frame side' }));
    p2.push(hr(capX, cs + cArch + cH, capW, secondary, 2.5, { label: 'Plate frame base' }));
    const pc = text(capX, cs + cArch + cH + 12, capW, 'No. 44 — Vase, blown glass with iron and copper inclusions, height 31 cm.', { size: 10, font: 'lora', weight: 400, italic: true, color: ink, leading: 1.4, label: 'Plate caption', role: 'CAPTION' });
    p2.push(pc);
    p2.push(path(capX, below(pc, 20), capW, 14, orn.sineOpenPath(4, 30), 'none', { stroke: secondary, strokeWidth: 1.5, open: true, label: 'Quote tendril rule' }));
    const q = text(capX, below(pc, 42), capW, '“Let the line go where the stem would go, and stop where the flower stops.”', { size: 16, font: 'yeseva', weight: 400, color: accent, leading: 1.3, label: 'Pull quote', role: 'DECK' });
    p2.push(q);
    const qa = text(capX, below(q, 10), capW, '— from the workshop rules, pinned above the furnace', { size: 10, font: 'philosopher', weight: 400, color: ink, leading: 1.4, label: 'Quote attribution', role: 'CAPTION' });
    p2.push(qa);
    p2.push(path(capX, below(qa, 26), capW, 14, orn.sineOpenPath(4, 30), 'none', { stroke: secondary, strokeWidth: 1.5, open: true, label: 'List tendril rule' }));
    const lh = text(capX, below(qa, 48), capW, 'Exhibitors in this room', { size: 11, font: 'philosopher', weight: 700, color: ink, tracking: .14, transform: 'uppercase', wrap: false, label: 'List heading', role: 'LABEL' });
    p2.push(lh);
    p2.push(text(capX, below(lh, 10), capW, '41–44 · The Weir Glasshouse\n45–49 · Anselm Roth, glass painter\n50–53 · The Sisters Marchetti, enamels\n54–56 · Hallam & Daughter, ironwork\n57–58 · Unsigned, lent by the Guild', { size: 10.5, font: 'lora', weight: 400, color: ink, leading: 1.6, label: 'Exhibitor list', role: 'BODY' }));
    p2.push(text(fr2.x + 20, fr2.bottom - 6, fr2.w - 40, 'Twelve', { size: 10, font: 'philosopher', weight: 700, color: ink, align: 'center', tracking: .2, transform: 'uppercase', wrap: false, label: 'Folio', role: 'FOLIO' }));
    return [p1, p2];
  },

  // ─── VIENNA SECESSION — square grid + gold ─────────────────────────────────
  'vienna-secession': ({ W, H, paper, ink, accent, secondary }) => {
    const fr = frame(W, H, 56);
    const cell = 24;
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    // chequer strips: two rows along the head, one column down the left
    p1.push(...orn.checker(fr.x, fr.y, fr.w, cell * 2, cell, ink, { label: 'Head chequer (black)' }));
    p1.push(...orn.checker(fr.x + cell, fr.y, fr.w - cell, cell * 2, cell, accent, { label: 'Head chequer (gold)' }));
    p1.push(...orn.checker(fr.x, fr.y + cell * 2, cell, fr.h - cell * 2, cell, ink, { label: 'Side chequer (black)' }));
    p1.push(...orn.checker(fr.x, fr.y + cell * 3, cell, fr.h - cell * 3, cell, accent, { label: 'Side chequer (gold)' }));
    // the black title square
    const sq = 392, sqX = fr.right - sq, sqY = fr.y + cell * 2 + 32;
    p1.push(rect(sqX, sqY, sq, sq, ink, { label: 'Title square' }));
    p1.push(rect(sqX + 14, sqY + 14, sq - 28, sq - 28, 'none', { stroke: accent, strokeWidth: 1, label: 'Title square hairline' }));
    const t1 = text(sqX + 28, sqY + 44, sq - 56, 'Exhibition', { size: 52, font: 'federo', weight: 400, color: accent, align: 'center', tracking: .1, transform: 'uppercase', wrap: false, label: 'Title', role: 'HEADLINE' });
    p1.push(t1);
    const t2 = text(sqX + 28, below(t1, 6), sq - 56, 'XIV', { size: 150, font: 'federo', weight: 400, color: accent, align: 'center', leading: 1, wrap: false, label: 'Exhibition numeral', role: 'HEADLINE' });
    p1.push(t2);
    p1.push(hr(sqX + 120, below(t2, 10), sq - 240, accent, 1, { label: 'Gold rule' }));
    p1.push(text(sqX + 28, below(t2, 22), sq - 56, 'Association of Visual Artists · Vienna', { size: 10.5, font: 'tenor', weight: 400, color: paper, align: 'center', tracking: .28, transform: 'uppercase', wrap: false, label: 'Association line', role: 'LABEL' }));
    // laurel roundel to the left of the square
    const rcx = fr.x + cell + 24 + 110, rcy = sqY + 130;
    p1.push(...orn.rings(rcx, rcy, [96, 84, 62], accent, 2, { label: 'Laurel ring' }));
    p1.push(circle(rcx, rcy, 50, ink, { label: 'Roundel disc' }));
    p1.push(text(rcx - 50, rcy - 9, 100, 'MCMII', { size: 15, font: 'federo', weight: 400, color: accent, align: 'center', tracking: .14, wrap: false, label: 'Roundel year', role: 'LABEL' }));
    p1.push(...squareRule(fr.x + cell + 24, sqY + 290, 220, 8, 24, ink, 'Square rule'));
    p1.push(text(fr.x + cell + 24, sqY + 310, 220, 'Spring Salon', { size: 13, font: 'tenor', weight: 400, color: ink, tracking: .24, transform: 'uppercase', wrap: false, label: 'Season label', role: 'LABEL' }));
    // square rule under the title square
    p1.push(...squareRule(sqX, sqY + sq + 18, sq, 8, 24, ink, 'Square rule'));
    // lower field
    const lx = fr.x + cell + 24, lw = fr.right - lx;
    const deck = text(lx, sqY + sq + 60, lw, 'Painting · Sculpture · Graphic Art · The Applied Arts', { size: 22, font: 'josefin', weight: 300, color: ink, tracking: .1, transform: 'uppercase', leading: 1.35, label: 'Deck', role: 'DECK' });
    p1.push(deck);
    p1.push(hr(lx, below(deck, 14), 96, accent, 3, { label: 'Gold bar' }));
    p1.push(text(lx, below(deck, 30), 400, 'Open daily from the fourteenth of April until the end of June, in the Exhibition House. The rooms are arranged so that each work may be seen alone, against a plain wall, in daylight.', { size: 12, font: 'josefin', weight: 400, color: ink, tracking: .03, leading: 1.6, label: 'Details', role: 'BODY' }));
    p1.push(rect(fr.right - 60, below(deck, 30), 60, 60, secondary, { label: 'Sage square' }));
    p1.push(rect(fr.right - 60, below(deck, 96), 60, 60, 'none', { stroke: ink, strokeWidth: 1, label: 'Outline square' }));
    p1.push(hr(lx, below(deck, 150), 96, ink, 3, { label: 'Black bar' }));
    p1.push(text(lx, below(deck, 166), 400, 'Rooms I – VII · Guided visits on Sundays at eleven · The catalogue, with forty plates, is sold at the door and in the bookshops of the Ring.', { size: 11, font: 'josefin', weight: 400, color: ink, tracking: .03, leading: 1.6, label: 'Visitor note', role: 'BODY' }));
    p1.push(...squareRule(lx, fr.bottom - 30, lw, 8, 24, accent, 'Foot square rule (gold)'));
    p1.push(text(lx, fr.bottom - 12, lw, 'Catalogue · Two Crowns', { size: 9.5, font: 'tenor', weight: 400, color: ink, tracking: .26, transform: 'uppercase', align: 'right', wrap: false, label: 'Catalogue price', role: 'CAPTION' }));

    // Page 2 — two columns, chequer running head, square bullets
    const fr2 = frame(W, H, 64);
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    p2.push(...orn.checker(fr2.x, fr2.y, fr2.w, 10, 10, ink, { label: 'Chequer running head' }));
    p2.push(text(fr2.x, fr2.y + 18, fr2.w / 2, 'Exhibition XIV · Catalogue', { size: 9, font: 'tenor', weight: 400, color: ink, tracking: .26, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
    p2.push(text(fr2.cx, fr2.y + 18, fr2.w / 2, 'Vienna · MCMII', { size: 9, font: 'tenor', weight: 400, color: ink, tracking: .26, transform: 'uppercase', align: 'right', wrap: false, label: 'Running head (right)', role: 'FOLIO' }));
    const cols = columns(fr2.x, fr2.w, 2, 34);
    const top = fr2.y + 56;
    const body = { size: 11, font: 'josefin' as const, weight: 400, color: ink, tracking: .02, leading: 1.6 };
    // column 1
    const h = text(cols[0].x, top, cols[0].w, 'The Room of the Applied Arts', { size: 26, font: 'federo', weight: 400, color: ink, leading: 1.12, label: 'Section title', role: 'HEADLINE' });
    p2.push(h);
    p2.push(hr(cols[0].x, below(h, 10), 72, accent, 3, { label: 'Gold bar' }));
    const b1 = text(cols[0].x, below(h, 26), cols[0].w, 'The room is square, and everything in it agrees to be square: the cabinets, the panels of the wall, the pattern in the floor. Within that agreement the objects are free to be as various as their makers. A silver box sits beside a bound book, and the two are related not by ornament but by proportion.\n\n' + copy.body('editorial', 2), { ...body, label: 'Column 1 body', role: 'BODY' });
    p2.push(b1);
    let ly = below(b1, 16);
    for (const item of ['Room I — Painting and the mural', 'Room II — Sculpture in bronze and plaster', 'Room III — Graphic art and the book']) {
      p2.push(rect(cols[0].x, ly + 3, 7, 7, ink, { label: 'Square bullet' }));
      const it = text(cols[0].x + 18, ly, cols[0].w - 18, item, { ...body, label: 'List item', role: 'BODY' });
      p2.push(it); ly = below(it, 8);
    }
    const sh1 = text(cols[0].x, ly + 18, cols[0].w, 'The room of graphic art', { size: 18, font: 'federo', weight: 400, color: ink, wrap: false, label: 'Subhead', role: 'LABEL' });
    p2.push(sh1);
    p2.push(text(cols[0].x, below(sh1, 10), cols[0].w, 'Here the square becomes a page. The posters on the long wall were drawn to the same proportion as the room, and their lettering was cut by the artists themselves rather than set from the printer’s case, so that the letter and the picture are one drawing.\n\nThe books in the flat cases are open at their title pages. Notice how little is on them: a name, a year, a small ornament, and a great deal of paper. The emptiness is not economy but respect; it gives the few words room to be heard.\n\nVisitors are asked not to lean on the cases, which are made of glass on three sides and were not designed to be leaned upon.', { ...body, label: 'Column 1 body, graphic art', role: 'BODY' }));
    // column 2
    p2.push(...imageSlot(cols[1].x, top, cols[1].w, 236, { tone: 'light', frame: accent, frameWidth: 1.5, caption: 'Plate', label: 'Catalogue plate' }));
    p2.push(rect(cols[1].x + cols[1].w - 12, top + 236 - 12, 12, 12, ink, { label: 'Plate corner square' }));
    const c2 = text(cols[1].x, top + 248, cols[1].w, 'Cabinet in black-stained oak with mother-of-pearl squares, shown in Room III.', { size: 9, font: 'tenor', weight: 400, color: ink, tracking: .04, leading: 1.4, label: 'Plate caption', role: 'CAPTION' });
    p2.push(c2);
    const b2 = text(cols[1].x, below(c2, 18), cols[1].w, 'Gold is used sparingly and always flat, as a plane rather than a highlight, so that it reads as a colour among colours and not as a boast.\n\nThe visitor who wishes to see the work in order should begin at the north door and keep the windows to the left.', { ...body, label: 'Column 2 body', role: 'BODY' });
    p2.push(b2);
    p2.push(...squareRule(cols[1].x, below(b2, 20), cols[1].w, 6, 12, accent, 'Quote square rule'));
    const q = text(cols[1].x, below(b2, 38), cols[1].w, '“To the age its art, to art its freedom.”', { size: 18, font: 'federo', weight: 400, color: ink, leading: 1.3, label: 'Pull quote', role: 'DECK' });
    p2.push(q);
    const qa = text(cols[1].x, below(q, 8), cols[1].w, 'Motto over the door of the Exhibition House', { size: 9, font: 'tenor', weight: 400, color: ink, tracking: .06, label: 'Quote attribution', role: 'CAPTION' });
    p2.push(qa);
    p2.push(...squareRule(cols[1].x, below(qa, 18), cols[1].w, 6, 12, accent, 'Quote square rule (foot)'));
    p2.push(text(cols[1].x, below(qa, 36), cols[1].w, 'The motto is meant literally. The Association exhibits no work older than the founding of the group and refuses no work on the grounds of its subject; the only test is whether the thing was made with the whole of the maker’s attention.\n\nIt follows that the rooms hold pictures beside chairs and chairs beside bound books, and that the visitor who has come for one will leave having looked hard at the others. That, and not the gold, is the luxury the exhibition offers.\n\nA second catalogue, with the plates in colour, will appear in the autumn.', { ...body, label: 'Column 2 body, continued', role: 'BODY' }));
    p2.push(...squareRule(fr2.x, fr2.bottom - 24, fr2.w, 10, 20, ink, 'Foot chequer'));
    p2.push(text(fr2.cx, fr2.bottom - 8, fr2.w / 2, '12', { size: 9, font: 'tenor', weight: 400, color: ink, tracking: .2, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
    return [p1, p2];
  },

  // ─── ART DECO — sunburst, stepped form, gold on black ──────────────────────
  'art-deco': ({ W, H, paper, ink, accent, secondary }) => {
    // palette: paper is near-black, ink is gold, accent is cream, secondary is burgundy
    const gold = ink, cream = accent, black = paper, wine = secondary;
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, black, { label: 'Black ground', role: 'GROUND' })];
    // sunburst rising from the plinth
    p1.push(path(-120, 236, W + 240, 570, orn.sunburstPath(17, 180, .5, 50, 100, 100), gold, { opacity: .5, label: 'Sunburst', role: 'ORNAMENT' }));
    p1.push(path(-120, 236, W + 240, 570, orn.sunburstPath(17, 180, .18, 50, 100, 100), gold, { opacity: .9, label: 'Sunburst (bright rays)', role: 'ORNAMENT' }));
    // zigzag friezes head and foot
    p1.push(path(0, 0, W, 46, orn.zigzagPath(18, 60), gold, { rotation: 180, label: 'Zigzag frieze (head)' }));
    p1.push(hr(0, 56, W, gold, 1.5, { label: 'Head hairline' }));
    p1.push(path(0, H - 46, W, 46, orn.zigzagPath(18, 60), gold, { label: 'Zigzag frieze (foot)' }));
    p1.push(hr(0, H - 56, W, gold, 1.5, { label: 'Foot hairline' }));
    // fan corners
    p1.push(path(-40, 60, 200, 100, orn.fanPath(7), wine, { rotation: 180, label: 'Fan (top left)' }));
    p1.push(path(W - 160, 60, 200, 100, orn.fanPath(7), wine, { rotation: 180, label: 'Fan (top right)' }));
    p1.push(path(-40, H - 160, 200, 100, orn.fanPath(7), wine, { label: 'Fan (bottom left)' }));
    p1.push(path(W - 160, H - 160, 200, 100, orn.fanPath(7), wine, { label: 'Fan (bottom right)' }));
    // stepped title panel
    const pw = 600, px = W / 2 - pw / 2, py = 372, ph = 262;
    p1.push(rect(px + 80, py - 40, pw - 160, 20, black, { label: 'Step (upper 2)' }));
    p1.push(rect(px + 40, py - 20, pw - 80, 20, black, { label: 'Step (upper 1)' }));
    p1.push(rect(px, py, pw, ph, black, { label: 'Title panel' }));
    p1.push(rect(px + 40, py + ph, pw - 80, 20, black, { label: 'Step (lower 1)' }));
    p1.push(rect(px + 80, py + ph + 20, pw - 160, 20, black, { label: 'Step (lower 2)' }));
    p1.push(rect(px + 10, py + 10, pw - 20, ph - 20, 'none', { stroke: gold, strokeWidth: 1, label: 'Panel hairline' }));
    p1.push(vr(px - 24, py - 40, ph + 80, gold, 2, { label: 'Flanking rule' }));
    p1.push(vr(px + pw + 24, py - 40, ph + 80, gold, 2, { label: 'Flanking rule' }));
    const kick = text(px + 30, py + 30, pw - 60, copy.byline('event', 0), { size: 11, font: 'josefin', weight: 400, color: gold, align: 'center', tracking: .42, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' });
    p1.push(kick);
    const t = text(px + 30, below(kick, 14), pw - 60, 'Midnight\nPremiere', { size: 76, font: 'limelight', weight: 400, color: cream, align: 'center', tracking: .05, transform: 'uppercase', leading: 1.02, wrap: false, label: 'Title', role: 'HEADLINE' });
    p1.push(t);
    p1.push(hr(px + 200, below(t, 12), pw - 400, gold, 1.5, { label: 'Title rule' }));
    p1.push(text(px + 30, below(t, 22), pw - 60, copy.deck('event', 0), { size: 20, font: 'poiret', weight: 400, color: gold, align: 'center', tracking: .22, transform: 'uppercase', wrap: false, label: 'Deck', role: 'DECK' }));
    // plinth
    p1.push(path(W / 2 - 230, 806, 460, 118, orn.stepPyramidPath(5), wine, { label: 'Stepped plinth' }));
    p1.push(path(W / 2 - 230, 806, 460, 118, orn.stepPyramidPath(5), 'none', { stroke: gold, strokeWidth: 1.5, label: 'Plinth outline' }));
    p1.push(text(W / 2 - 150, 868, 300, 'The Grand Pavilion', { size: 14, font: 'poiret', weight: 400, color: cream, align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Venue', role: 'LABEL' }));
    p1.push(text(W / 2 - 300, 946, 600, 'Saturday the Fourteenth of June · Black Tie · Supper to Follow', { size: 12, font: 'josefin', weight: 400, color: cream, align: 'center', tracking: .14, transform: 'uppercase', leading: 1.4, label: 'Details', role: 'CAPTION' }));
    p1.push(text(W / 2 - 300, 970, 600, 'Tickets at the box office from noon', { size: 10, font: 'josefin', weight: 300, color: gold, align: 'center', tracking: .2, transform: 'uppercase', wrap: false, label: 'Tickets', role: 'CAPTION' }));

    // Page 2 — cream, two columns inside a stepped frame, fans at the head
    const fr2 = frame(W, H, 92);
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, cream, { label: 'Cream ground', role: 'GROUND' })];
    p2.push(rect(34, 34, W - 68, H - 68, 'none', { stroke: gold, strokeWidth: 4, label: 'Stepped frame (outer)' }));
    p2.push(rect(46, 46, W - 92, H - 92, 'none', { stroke: black, strokeWidth: 1.5, label: 'Stepped frame (middle)' }));
    p2.push(rect(56, 56, W - 112, H - 112, 'none', { stroke: gold, strokeWidth: .75, label: 'Stepped frame (inner)' }));
    for (const [x, y] of [[34, 34], [W - 34 - 26, 34], [34, H - 34 - 26], [W - 34 - 26, H - 34 - 26]]) p2.push(rect(x, y, 26, 26, black, { label: 'Corner block' }));
    // fans at the head flanking the running head
    p2.push(path(W / 2 - 200, 64, 80, 40, orn.fanPath(5), gold, { label: 'Head fan' }));
    p2.push(path(W / 2 + 120, 64, 80, 40, orn.fanPath(5), gold, { label: 'Head fan' }));
    p2.push(text(W / 2 - 110, 82, 220, 'Midnight Premiere · Programme', { size: 9.5, font: 'josefin', weight: 700, color: black, align: 'center', tracking: .32, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
    p2.push(path(W / 2 - 120, 108, 240, 10, orn.zigzagPath(12, 60), gold, { label: 'Zigzag rule' }));
    const cols = columns(fr2.x, fr2.w, 2, 36);
    const top = 150;
    const body = { size: 11, font: 'josefin' as const, weight: 400, color: black, leading: 1.55 };
    const h = text(cols[0].x, top, cols[0].w, 'The Evening in Three Acts', { size: 32, font: 'poiret', weight: 400, color: black, leading: 1.1, label: 'Section title', role: 'HEADLINE' });
    p2.push(h);
    p2.push(hr(cols[0].x, below(h, 10), cols[0].w, gold, 2, { label: 'Gold rule' }));
    p2.push(hr(cols[0].x, below(h, 15), cols[0].w * .5, black, .75, { label: 'Hairline' }));
    const b1 = text(cols[0].x, below(h, 30), cols[0].w, copy.body('event', 0) + '\n\nGuests arrive beneath the marquee, where the orchestra is already playing. At nine the doors of the auditorium open and the lights are lowered by degrees, so that the room seems to sink toward the screen.\n\n' + copy.body('culture', 0), { ...body, label: 'Column 1 body', role: 'BODY' });
    p2.push(b1);
    const sh1 = text(cols[0].x, below(b1, 20), cols[0].w, 'The picture', { size: 20, font: 'poiret', weight: 400, color: wine, wrap: false, label: 'Subhead 1', role: 'LABEL' });
    p2.push(sh1);
    p2.push(text(cols[0].x, below(sh1, 8), cols[0].w, 'Ninety-four minutes, in the new tinted process, with a score composed for the Pavilion’s own orchestra and played tonight for the first time. The story follows a lighthouse keeper’s daughter through one storm and one summer.\n\nThe management asks that no one enter the auditorium after the first reel has begun. Latecomers will be seated at the interval, and the foyer bar remains open for their consolation.\n\nSmoking is permitted in the lounge and on the roof terrace, from which, on a clear night, the whole of the bay can be seen with its lights on.\n\nPhotographs may be taken in the foyer and on the stair, but not in the auditorium, where the flash would spoil the tint of the picture for everyone else.', { ...body, label: 'Column 1 body, the picture', role: 'BODY' }));
    p2.push(...imageSlot(cols[1].x, top, cols[1].w, 210, { tone: 'light', frame: gold, frameWidth: 2, caption: 'Still', label: 'Film still' }));
    const c = text(cols[1].x, top + 218, cols[1].w, 'The Pavilion foyer, photographed for the souvenir programme.', { size: 9, font: 'josefin', weight: 400, color: black, tracking: .04, leading: 1.4, label: 'Caption', role: 'CAPTION' });
    p2.push(c);
    const sh = text(cols[1].x, below(c, 18), cols[1].w, 'After the picture', { size: 20, font: 'poiret', weight: 400, color: wine, wrap: false, label: 'Subhead', role: 'LABEL' });
    p2.push(sh);
    const b2 = text(cols[1].x, below(sh, 8), cols[1].w, 'The directors take questions in the lounge, where a cold supper is laid on the long table under the mirrors. Dancing follows, and the last train leaves at ten minutes past one.', { ...body, label: 'Column 2 body', role: 'BODY' });
    p2.push(b2);
    p2.push(hr(cols[1].x + 40, below(b2, 22), cols[1].w - 80, gold, 1.5, { label: 'Quote rule' }));
    const q = text(cols[1].x, below(b2, 34), cols[1].w, copy.quote('event', 0), { size: 17, font: 'limelight', weight: 400, color: wine, align: 'center', leading: 1.3, label: 'Pull quote', role: 'DECK' });
    p2.push(q);
    p2.push(hr(cols[1].x + 40, below(q, 12), cols[1].w - 80, gold, 1.5, { label: 'Quote rule' }));
    const sh2 = text(cols[1].x, below(q, 34), cols[1].w, 'The music', { size: 20, font: 'poiret', weight: 400, color: wine, wrap: false, label: 'Subhead 2', role: 'LABEL' });
    p2.push(sh2);
    p2.push(text(cols[1].x, below(sh2, 8), cols[1].w, 'The Pavilion Orchestra, eighteen players under the direction of Miss Ottilie Vance, will accompany the picture from the pit and play for dancing afterwards in the lounge. The programme of dances is printed on the reverse of this card.\n\nA word about the organ. The Pavilion’s instrument, the largest in the district, will be heard before the picture and during the interval. Its console rises from the pit on a lift, an effect the management is rather proud of and asks you not to spoil for others by describing it in advance.\n\nThe programme of dances begins with a foxtrot and ends, at the request of last year’s guests, with a waltz. Between the two the orchestra will take requests, within reason, from the floor.\n\nCloakrooms are on the mezzanine. Cars may be summoned from the terrace by the attendant with the lamp.', { ...body, label: 'Column 2 body, the music', role: 'BODY' }));
    p2.push(path(W / 2 - 120, H - 120, 240, 10, orn.zigzagPath(12, 60), gold, { rotation: 180, label: 'Foot zigzag rule' }));
    p2.push(text(W / 2 - 60, H - 98, 120, 'Two', { size: 9.5, font: 'josefin', weight: 700, color: black, align: 'center', tracking: .32, transform: 'uppercase', wrap: false, label: 'Folio', role: 'FOLIO' }));
    return [p1, p2];
  },

  // ─── BAUHAUS — circle, square, triangle ────────────────────────────────────
  bauhaus: ({ W, H, paper, ink, accent, secondary }) => {
    const red = accent, blue = secondary, yellow = BAUHAUS_YELLOW;
    const fr = frame(W, H, 48);
    const cols = columns(fr.x, fr.w, 8, 16);
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Cream ground', role: 'GROUND' })];
    // primaries as counterweights
    const blueCol = span(cols, 0, 1);
    p1.push(rect(blueCol.x, fr.y, blueCol.w, 560, blue, { label: 'Blue rectangle' }));
    p1.push(circle(cols[6].x + 24, 200, 150, red, { label: 'Red circle' }));
    // rules
    const ruleY = 640;
    p1.push(rect(fr.x, ruleY, fr.w, 10, ink, { label: 'Black rule (horizontal)', role: 'RULE' }));
    p1.push(rect(cols[3].x - 8, ruleY, 10, fr.bottom - ruleY, ink, { label: 'Black rule (vertical)', role: 'RULE' }));
    p1.push(line(fr.x, fr.bottom, cols[3].x - 8, ruleY + 10, ink, 2, { label: 'Diagonal rule' }));
    // title
    const tx = cols[2].x, tw = fr.right - tx;
    const kick = text(tx, 316, tw, 'a lecture series in four evenings · weimar', { size: 12, font: 'inter', weight: 600, color: ink, tracking: .16, transform: 'lowercase', wrap: false, label: 'Kicker', role: 'LABEL' });
    p1.push(kick);
    p1.push(text(tx, 344, tw, 'the new\ntypography', { size: 86, font: 'archivo', weight: 900, color: ink, transform: 'lowercase', leading: .96, wrap: false, label: 'Title', role: 'HEADLINE' }));
    // numbered evenings, left of the vertical rule
    let ny = ruleY + 34;
    const items: Array<[string, string]> = [['01', 'the letter'], ['02', 'the word'], ['03', 'the line'], ['04', 'the page']];
    for (const [n, s] of items) {
      p1.push(text(cols[0].x, ny, 70, n, { size: 30, font: 'spaceGrotesk', weight: 700, color: ink, wrap: false, label: `Numeral ${n}`, role: 'LABEL' }));
      p1.push(text(cols[0].x + 74, ny + 11, 150, s, { size: 12, font: 'inter', weight: 500, color: ink, transform: 'lowercase', wrap: false, label: `Evening ${n}`, role: 'BODY' }));
      ny += 50;
    }
    // yellow triangle and the statement
    p1.push(path(cols[6].x - 20, ruleY + 34, 196, 170, orn.polygonPath(3), yellow, { label: 'Yellow triangle' }));
    const st = text(cols[4].x, 866, fr.right - cols[4].x, 'Type is a tool for reading, not an ornament for looking at. These four evenings take the alphabet apart — letter, word, line, page — and put it back together in the order a reader actually needs.', { size: 11, font: 'inter', weight: 400, color: ink, leading: 1.5, label: 'Statement', role: 'BODY' });
    p1.push(st);
    p1.push(rect(cols[4].x, below(st, 14), 40, 6, red, { label: 'Red dash' }));
    p1.push(text(cols[0].x, fr.bottom - 14, 260, 'workshop for print & advertising · 20:00 · admission free', { size: 9.5, font: 'inter', weight: 500, color: ink, tracking: .04, transform: 'lowercase', wrap: false, label: 'Metadata', role: 'CAPTION' }));
    p1.push(text(cols[4].x, fr.bottom - 14, fr.right - cols[4].x, '1923', { size: 9.5, font: 'spaceGrotesk', weight: 700, color: ink, tracking: .2, align: 'right', wrap: false, label: 'Year', role: 'CAPTION' }));

    // Page 2 — three columns, black rules, red folio square
    const fr2 = frame(W, H, 48);
    const c3 = columns(fr2.x, fr2.w, 3, 22);
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Cream ground', role: 'GROUND' })];
    p2.push(text(fr2.x, fr2.y, fr2.w, 'the new typography · evening two · the word', { size: 9.5, font: 'inter', weight: 700, color: ink, tracking: .14, transform: 'lowercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
    p2.push(rect(fr2.x, fr2.y + 18, fr2.w, 8, ink, { label: 'Head rule', role: 'RULE' }));
    p2.push(rect(fr2.x, fr2.y + 30, 120, 3, blue, { label: 'Blue accent rule', role: 'RULE' }));
    const top = fr2.y + 60;
    const body = { size: 10.5, font: 'inter' as const, weight: 400, color: ink, leading: 1.5 };
    const kicker = text(c3[0].x, top, span(c3, 0, 1).w, 'the word', { size: 40, font: 'archivo', weight: 900, color: ink, transform: 'lowercase', leading: 1, wrap: false, label: 'Section title', role: 'HEADLINE' });
    p2.push(kicker);
    const deck = text(c3[0].x, below(kicker, 10), span(c3, 0, 1).w, 'why a line of lowercase reads faster than a line of capitals, and what that means for the poster', { size: 13, font: 'inter', weight: 500, color: ink, leading: 1.4, transform: 'lowercase', label: 'Deck', role: 'DECK' });
    p2.push(deck);
    const bodyTop = below(deck, 26);
    p2.push(rect(c3[0].x, bodyTop - 12, fr2.w, 2, ink, { label: 'Body rule', role: 'RULE' }));
    const b1 = text(c3[0].x, bodyTop, c3[0].w, 'A word is not a row of letters. It is a shape the eye has learned, and the shape is made by the parts that rise and fall — the ascenders and descenders that capitals do not have. Set a sentence in lowercase and the reader sees the skyline; set it in capitals and the skyline is a wall.\n\n' + copy.body('editorial', 2), { ...body, label: 'Column 1 body', role: 'BODY' });
    p2.push(b1);
    const sh1 = text(c3[0].x, below(b1, 18), c3[0].w, 'the line', { size: 16, font: 'archivo', weight: 900, color: ink, transform: 'lowercase', wrap: false, label: 'Subhead', role: 'LABEL' });
    p2.push(sh1);
    p2.push(text(c3[0].x, below(sh1, 8), c3[0].w, 'A line of text is a measured thing. Too long and the eye loses its way back to the margin; too short and the words are broken into stammering. Between forty and sixty characters the reader forgets there is a line at all, and that forgetting is the goal.\n\nThe space between lines does the same work as the space between words: it separates what should be separate. Set the leading too tight and the lines argue; too loose and they stop speaking to each other.\n\nNone of this is taste. It can be measured, and in this workshop it is.\n\nThe measure of the column you are reading is forty-three characters, set solid with half a line of air between the lines. Count them if you like; the point is that you did not have to.', { ...body, label: 'Column 1 body, the line', role: 'BODY' }));
    const b2 = text(c3[1].x, bodyTop, c3[1].w, 'The poster, then, has one job: to be read from across the street. It does not need every letter to be loud; it needs the important word to be shaped so distinctly that it is recognised before it is spelled.\n\nThe workshop tests this simply. A word is set at ten sizes, pinned to the far wall, and the class walks backward until it disappears. The size that survives longest is the right one.', { ...body, label: 'Column 2 body', role: 'BODY' });
    p2.push(b2);
    p2.push(rect(c3[1].x, below(b2, 20), c3[1].w, 4, ink, { label: 'Quote rule', role: 'RULE' }));
    const q = text(c3[1].x, below(b2, 34), c3[1].w, 'reading is an act, not a picture.', { size: 17, font: 'archivo', weight: 900, color: ink, transform: 'lowercase', leading: 1.15, label: 'Pull quote', role: 'DECK' });
    p2.push(q);
    p2.push(rect(c3[1].x, below(q, 12), 40, 4, red, { label: 'Red dash', role: 'RULE' }));
    p2.push(text(c3[1].x, below(q, 32), c3[1].w, 'Colour is the last tool, not the first. A red word in a black paragraph is read before anything else on the page, which means it can be used exactly once. Use it twice and the reader no longer knows where to begin.\n\nThe same is true of weight. One bold word points; a bold paragraph shouts, and a page that shouts is not read but endured.\n\nThe class is asked, therefore, to design each poster first in black alone, and to earn the red.\n\nWhat survives this discipline is usually smaller than what went in, and always clearer. A poster is not a place to keep things; it is a place to say one thing and leave.', { ...body, label: 'Column 2 body, continued', role: 'BODY' }));
    p2.push(rect(c3[2].x, bodyTop - 12, c3[2].w, 4, ink, { label: 'Image rule', role: 'RULE' }));
    p2.push(...imageSlot(c3[2].x, bodyTop, c3[2].w, 170, { tone: 'light', caption: 'Photograph', label: 'Photograph' }));
    const cap = text(c3[2].x, bodyTop + 178, c3[2].w, 'The word test: one word, ten sizes, one wall.', { size: 9, font: 'inter', weight: 500, color: ink, leading: 1.4, label: 'Caption', role: 'CAPTION' });
    p2.push(cap);
    p2.push(text(c3[2].x, below(cap, 18), c3[2].w, 'Numbers behave differently again. They are read one glyph at a time, so they may be set larger than the words around them without shouting.\n\nA date on a poster is the second thing anyone looks for, after the name of the event, and it should be found in the same place on every poster the workshop produces: bottom left, in figures, with the month spelled out. Consistency here is a courtesy to the passer-by, who has three seconds and a tram to catch.\n\nPrices, times and addresses follow the same rule. They are set in one size, one weight, one column, and never inside a sentence.\n\nThe folio on this page is a red square because a page number is also a number: it is looked for, not read, and it should be found by colour before it is found by shape. The square sits in the same corner on every page of this series.\n\nThe evening closes with a single exercise: set your own name so that it can be read at twenty paces, using no capital letters at all.', { ...body, label: 'Column 3 body', role: 'BODY' }));
    p2.push(rect(fr2.x, fr2.bottom - 52, fr2.w - 60, 3, ink, { label: 'Foot rule', role: 'RULE' }));
    p2.push(rect(fr2.right - 44, fr2.bottom - 44, 44, 44, red, { label: 'Folio square' }));
    p2.push(text(fr2.right - 44, fr2.bottom - 44 + 12, 44, '2', { size: 18, font: 'spaceGrotesk', weight: 700, color: paper, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
    p2.push(text(fr2.x, fr2.bottom - 12, 300, 'bauhaus · weimar · 1923', { size: 9, font: 'inter', weight: 500, color: ink, tracking: .1, transform: 'lowercase', wrap: false, label: 'Foot line', role: 'CAPTION' }));
    return [p1, p2];
  },

  // ─── CONSTRUCTIVIST — the agitational diagonal ─────────────────────────────
  constructivist: ({ W, H, paper, ink, accent, secondary }) => {
    const red = accent, grey = secondary;
    const ANG = -18;
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    p1.push(...orn.radialLines(40, 40, 140, 1180, 24, ink, 1.5, { spread: 90, start: 0, opacity: .3, label: 'Ray' }));
    // photomontage slot, rotated with the composition
    p1.push(...imageSlot(468, 118, 280, 360, { tone: 'light', rotation: ANG, frame: ink, frameWidth: 6, caption: 'Photomontage', label: 'Photomontage slot' }));
    // the loudspeaker
    p1.push(circle(210, 250, 136, ink, { label: 'Loudspeaker disc' }));
    p1.push(circle(210, 250, 22, red, { label: 'Loudspeaker centre' }));
    p1.push(text(110, 292, 200, 'Exhibition of\nthe New Printing', { size: 22, font: 'bebas', weight: 400, color: paper, align: 'center', tracking: .1, leading: 1.1, wrap: false, label: 'Loudspeaker text', role: 'DECK' }));
    // the red band and its title
    const bandY = 428, bandH = 206;
    p1.push(rect(-140, bandY, W + 280, bandH, red, { rotation: ANG, label: 'Red band' }));
    p1.push(text(W / 2 - 340, bandY + 14, 680, 'Build the\nNew Page', { size: 92, font: 'anton', weight: 400, color: paper, align: 'center', transform: 'uppercase', leading: .96, rotation: ANG, wrap: false, label: 'Title', role: 'HEADLINE' }));
    p1.push(text(W / 2 - 300 + 40, bandY + bandH + 44, 600, 'A poster exhibition · type · photography · montage', { size: 14, font: 'oswald', weight: 500, color: ink, align: 'center', tracking: .2, transform: 'uppercase', rotation: ANG, wrap: false, label: 'Subtitle', role: 'LABEL' }));
    // the exclamation
    p1.push(text(612, 636, 150, '!', { size: 300, font: 'archivoBlack', weight: 400, color: red, align: 'center', leading: 1, wrap: false, label: 'Exclamation', role: 'ORNAMENT' }));
    // chevrons marching right
    for (let i = 0; i < 3; i++) p1.push(path(56 + i * 96, 790, 84, 56, orn.chevronPath(38), i === 1 ? ink : red, { label: 'Chevron arrow' }));
    // information block
    const hall = text(56, 878, 500, 'Hall of the Union of Printers', { size: 38, font: 'bebas', weight: 400, color: ink, wrap: false, label: 'Venue', role: 'DECK' });
    p1.push(hall);
    p1.push(rect(56, below(hall, 8), 200, 6, ink, { label: 'Black bar', role: 'RULE' }));
    p1.push(text(56, below(hall, 24), 440, 'Open daily 10–20 · from the fourteenth of June to the first of September · admission free to members of the union', { size: 11.5, font: 'oswald', weight: 300, color: ink, leading: 1.45, label: 'Details', role: 'BODY' }));
    p1.push(rect(W - 56 - 28, H - 56 - 28, 28, 28, ink, { label: 'Black square' }));
    p1.push(rect(W - 56 - 64, H - 56 - 28, 28, 28, red, { label: 'Red square' }));

    // Page 2 — columns at 0°, a red diagonal running behind the head, black bars as subheads
    const fr2 = frame(W, H, 56);
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'Paper ground', role: 'GROUND' })];
    p2.push(rect(-160, 62, W + 320, 78, red, { rotation: -12, label: 'Red diagonal band' }));
    p2.push(text(W / 2 - 300, 88, 600, 'The New Printing · Review · No. 2', { size: 22, font: 'bebas', weight: 400, color: paper, align: 'center', tracking: .14, rotation: -12, wrap: false, label: 'Running head', role: 'FOLIO' }));
    const h = text(392, 178, 376, 'Montage is\nan Argument', { size: 60, font: 'bebas', weight: 400, color: ink, leading: .96, wrap: false, label: 'Section title', role: 'HEADLINE' });
    p2.push(h);
    p2.push(rect(392, below(h, 8), 120, 8, red, { label: 'Red bar', role: 'RULE' }));
    const c3 = columns(fr2.x, fr2.w, 3, 24);
    const top = 332;
    const body = { size: 11, font: 'oswald' as const, weight: 300, color: ink, leading: 1.5 };
    const bar = (x: number, y: number, w: number, s: string) => [rect(x, y, w, 24, ink, { label: 'Subhead bar' }), text(x + 8, y + 6, w - 16, s, { size: 11.5, font: 'oswald', weight: 700, color: paper, tracking: .16, transform: 'uppercase', wrap: false, label: 'Subhead', role: 'LABEL' })];
    p2.push(...bar(c3[0].x, top, c3[0].w, 'The photograph'));
    const b1 = text(c3[0].x, top + 36, c3[0].w, 'A photograph on its own reports. Two photographs, cut and set against each other, begin to argue. The eye moves from the crowd to the single face and back, and in that movement it draws a conclusion nobody printed.\n\nThe montage is therefore not decoration but a sentence with pictures for words, and the diagonal is its grammar: it tells the eye which way to run.', { ...body, label: 'Column 1 body', role: 'BODY' });
    p2.push(b1);
    p2.push(...bar(c3[0].x, below(b1, 18), c3[0].w, 'The scissors'));
    p2.push(text(c3[0].x, below(b1, 54), c3[0].w, 'The tools of the new printing are a camera, a pot of paste and a pair of scissors. The camera is the least important. Any photograph will do if it is cut in the right place, and the right place is always the edge that makes the next photograph necessary.\n\nWe cut hard. A face is cut at the jaw, a crowd at the shoulders, a building at the third floor. The cut is not a wound but a hinge, and the page swings on it.\n\nPaste the pieces down at the angle of the band and the whole surface begins to move.', { ...body, label: 'Column 1 body, the scissors', role: 'BODY' }));
    p2.push(...imageSlot(c3[1].x, top, c3[1].w, 168, { tone: 'light', frame: ink, frameWidth: 4, caption: 'Montage', label: 'Montage slot' }));
    const cap = text(c3[1].x, top + 176, c3[1].w, 'Two negatives, one composition. The scissors did the rest.', { size: 9.5, font: 'oswald', weight: 400, color: grey, leading: 1.4, label: 'Caption', role: 'CAPTION' });
    p2.push(cap);
    p2.push(...bar(c3[1].x, below(cap, 16), c3[1].w, 'The type'));
    p2.push(text(c3[1].x, below(cap, 52), c3[1].w, 'Condensed capitals are chosen because they pack the most force into the least width. Set them at the same angle as the photograph and the word becomes another shape in the montage, moving with it.\n\nWe do not use more than two sizes on a page. The large size is for the one word the passer-by must take away; the small size is for everyone who stops. A third size is a sign that the designer has not decided what the poster is for.\n\nRules and bars are type too. A black bar is a word with no letters in it: it says “here” and nothing else, and it says it louder than any typeface can.', { ...body, label: 'Column 2 body', role: 'BODY' }));
    p2.push(...bar(c3[2].x, top, c3[2].w, 'The colour'));
    const b3 = text(c3[2].x, top + 36, c3[2].w, 'Red and black are not a palette but a division of labour. Black carries the information. Red carries the urgency. Everything else is left to the paper.', { ...body, label: 'Column 3 body', role: 'BODY' });
    p2.push(b3);
    p2.push(rect(c3[2].x, below(b3, 22), c3[2].w, 6, red, { label: 'Quote bar', role: 'RULE' }));
    const q = text(c3[2].x, below(b3, 38), c3[2].w, 'The eye reads faster than the ear. Print for the eye.', { size: 24, font: 'bebas', weight: 400, color: red, leading: 1.08, label: 'Pull quote', role: 'DECK' });
    p2.push(q);
    p2.push(rect(c3[2].x, below(q, 12), c3[2].w, 6, ink, { label: 'Quote bar (black)', role: 'RULE' }));
    const b3b = text(c3[2].x, below(q, 30), c3[2].w, copy.body('editorial', 2), { ...body, label: 'Column 3 body, continued', role: 'BODY' });
    p2.push(b3b);
    p2.push(...bar(c3[2].x, below(b3b, 18), c3[2].w, 'The paper'));
    p2.push(text(c3[2].x, below(b3b, 54), c3[2].w, 'Cheap paper is not a limitation but a material. It takes black well and red better, it tears cleanly for the montage, and it goes up on a wall with a bucket of paste in the time it takes a tram to pass.\n\nA poster that survives its week has failed; it should have been replaced by the next one.', { ...body, label: 'Column 3 body, the paper', role: 'BODY' }));
    p2.push(rect(fr2.x, fr2.bottom - 30, 14, 14, red, { label: 'Folio square' }));
    p2.push(text(fr2.x + 22, fr2.bottom - 32, fr2.w / 2 - 40, 'The New Printing', { size: 14, font: 'bebas', weight: 400, color: ink, tracking: .1, wrap: false, label: 'Foot running head', role: 'FOLIO' }));
    p2.push(text(fr2.cx, fr2.bottom - 32, fr2.w / 2, 'No. 2 · Page 12', { size: 14, font: 'bebas', weight: 400, color: ink, tracking: .1, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
    return [p1, p2];
  },

  // ─── DE STIJL — orthogonal, primaries, black rules ─────────────────────────
  'de-stijl': ({ W, H, paper, ink, accent, secondary }) => {
    const red = accent, blue = secondary, yellow = STIJL_YELLOW;
    const T = 12, E = 36; // rule thickness; how far rules stop short of the edge
    const bar = (x: number, y: number, w: number, h: number, label: string) => rect(x, y, w, h, ink, { label, role: 'RULE' });
    const p1: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'White ground', role: 'GROUND' })];
    // planes
    p1.push(rect(0, 0, 180, 160, red, { label: 'Red plane' }));
    p1.push(rect(612, 0, W - 612, 120, yellow, { label: 'Yellow plane' }));
    p1.push(rect(540, 360, 60, 80, blue, { label: 'Blue plane' }));
    p1.push(rect(0, 900, 180, H - 900, blue, { label: 'Blue plane (foot)' }));
    p1.push(rect(700, 812, W - 700, H - 812, red, { label: 'Red plane (foot)' }));
    p1.push(rect(192, 812, 70, 70, yellow, { label: 'Yellow square' }));
    // rules — none touches the edge of the page
    p1.push(bar(180, E, T, H - E * 2, 'Vertical rule A'));
    p1.push(bar(600, E, T, 440 - E, 'Vertical rule B'));
    p1.push(bar(E, 440, W - E * 2, T, 'Horizontal rule C'));
    p1.push(bar(E, 160, 180 - E, T, 'Horizontal rule D'));
    p1.push(bar(192, 800, W - 192 - E, T, 'Horizontal rule E'));
    p1.push(bar(420, 812, T, H - 812 - E, 'Vertical rule F'));
    p1.push(bar(688, 812, T, H - 812 - E, 'Vertical rule G'));
    p1.push(bar(E, 888, 180 - E, T, 'Horizontal rule H'));
    p1.push(bar(612, 120, W - 612 - E, T, 'Horizontal rule I'));
    // the largest white cell holds the title
    const cx = 220, cw = W - 220 - 40;
    const t = text(cx, 484, cw, 'Balance\nwithout\nSymmetry', { size: 80, font: 'archivo', weight: 700, color: ink, tracking: .06, transform: 'uppercase', leading: 1, wrap: false, label: 'Title', role: 'HEADLINE' });
    p1.push(t);
    p1.push(text(cx, below(t, 18), 520, 'An exhibition of the new plastic art · painting, furniture, typography', { size: 13, font: 'inter', weight: 500, color: ink, leading: 1.4, label: 'Deck', role: 'DECK' }));
    // upper-centre cell: kicker + statement
    const k = text(cx, 60, 360, 'De Stijl · Number 3', { size: 11, font: 'archivo', weight: 700, color: ink, tracking: .3, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'LABEL' });
    p1.push(k);
    p1.push(text(cx, below(k, 16), 300, 'The page is a field of relations. Nothing is centred, because a centre would end the conversation between the parts; instead each plane is placed where the others need it to be.', { size: 12, font: 'inter', weight: 400, color: ink, leading: 1.55, label: 'Statement', role: 'BODY' }));
    // lower-centre cell: metadata
    p1.push(text(444, 840, 220, 'Leiden\nApril – June', { size: 12, font: 'inter', weight: 500, color: ink, leading: 1.5, label: 'Place and dates', role: 'BODY' }));
    p1.push(text(444, 940, 220, '03', { size: 11, font: 'jetbrains', weight: 700, color: ink, tracking: .2, wrap: false, label: 'Issue numeral', role: 'CAPTION' }));

    // Page 2 — text columns bounded by thick rules, red block folio
    const fr2 = frame(W, H, 60);
    const p2: TelaVectorObject[] = [rect(0, 0, W, H, paper, { label: 'White ground', role: 'GROUND' })];
    p2.push(text(fr2.x, fr2.y - 24, fr2.w, 'Balance without Symmetry · The Plane', { size: 9, font: 'archivo', weight: 700, color: ink, tracking: .26, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
    p2.push(bar(fr2.x, fr2.y, fr2.w - 120, T, 'Head rule'));
    p2.push(rect(fr2.right - 40, fr2.y - 28, 40, 40, yellow, { label: 'Yellow square' }));
    const leftW = 300, midX = fr2.x + leftW + 22, rightX = midX + 32, rightW = fr2.right - rightX;
    p2.push(bar(midX, fr2.y + 40, 10, fr2.h - 100, 'Column rule'));
    const top = fr2.y + 48;
    const body = { size: 11, font: 'inter' as const, weight: 400, color: ink, leading: 1.5 };
    const h = text(fr2.x, top, leftW, 'The Plane', { size: 30, font: 'archivo', weight: 700, color: ink, tracking: .04, transform: 'uppercase', wrap: false, label: 'Section title', role: 'HEADLINE' });
    p2.push(h);
    p2.push(rect(fr2.x, below(h, 10), 60, 6, red, { label: 'Red dash', role: 'RULE' }));
    const b1 = text(fr2.x, below(h, 30), leftW, 'A plane of colour is not a picture of anything. It has a size, a position and a neighbour, and those three facts are the whole of its meaning. Move it ten millimetres and the page changes its mind.\n\nThe rules do the same work as the mullions of a window: they do not enclose, they divide, and the division is what lets each colour be itself.\n\n' + copy.body('editorial', 2), { ...body, label: 'Column 1 body', role: 'BODY' });
    p2.push(b1);
    const sh1 = text(fr2.x, below(b1, 22), leftW, 'The rule', { size: 15, font: 'archivo', weight: 700, color: ink, tracking: .06, transform: 'uppercase', wrap: false, label: 'Subhead 1', role: 'LABEL' });
    p2.push(sh1);
    p2.push(text(fr2.x, below(sh1, 8), leftW, 'A rule in this system is never a border. It stops short of the edge of the page because the page is not the limit of the composition; the composition continues, in the mind, past the paper. Where two rules meet they do not join but cross, and the crossing is left visible so that the reader sees the structure rather than a drawing of a structure.\n\nThe thickness matters. A hairline is a suggestion; a twelve-point bar is a fact. We use facts.\n\nThe furniture in the photograph opposite was built on the same principle. Its rails pass one another without mitre or joint, held by nothing but the way they are placed, and the chair stands.\n\nThe same joinery governs this page. The column rule to the right does not touch the head rule above it or the foot rule below; each is a separate decision, and the gaps between them are where the reader breathes.\n\nA page built this way can be extended indefinitely — another column, another rule, another plane — without ever needing a centre to return to. That is the practical argument for the style, and it is the one the architects took up.', { ...body, label: 'Column 1 body, the rule', role: 'BODY' }));
    p2.push(...imageSlot(rightX, top, rightW, 230, { tone: 'light', caption: 'Photograph', label: 'Photograph' }));
    p2.push(rect(rightX, top + 230, 34, 34, blue, { label: 'Blue square' }));
    const cap = text(rightX + 46, top + 236, rightW - 46, 'Interior with chair, table and lamp. Every object is a plane in a different position.', { size: 9, font: 'inter', weight: 500, color: ink, leading: 1.4, label: 'Caption', role: 'CAPTION' });
    p2.push(cap);
    const sh = text(rightX, below(cap, 26), rightW, 'Colour as position', { size: 15, font: 'archivo', weight: 700, color: ink, tracking: .06, transform: 'uppercase', wrap: false, label: 'Subhead', role: 'LABEL' });
    p2.push(sh);
    const b2 = text(rightX, below(sh, 8), rightW, 'Red advances, blue recedes, yellow spreads. A composition uses these habits the way a builder uses the weight of stone: not as decoration but as structure. Put the red where the page is light and the blue where it is heavy, and the whole will stand without a centre.', { ...body, label: 'Column 2 body', role: 'BODY' });
    p2.push(b2);
    p2.push(bar(rightX, below(b2, 20), rightW, T, 'Quote rule'));
    const pq = text(rightX, below(b2, 44), rightW, 'The straight line is the shortest distance between two decisions.', { size: 18, font: 'archivo', weight: 700, color: ink, leading: 1.2, label: 'Pull quote', role: 'DECK' });
    p2.push(pq);
    p2.push(rect(rightX, below(pq, 14), 60, 6, red, { label: 'Red dash (quote)', role: 'RULE' }));
    p2.push(text(rightX, below(pq, 34), rightW, 'There is no grey in this system except the grey the eye makes for itself when black type sits on white paper. That grey — the tone of a paragraph seen from across the room — is the fourth colour of the page, and it is placed as deliberately as the red.\n\nA column of text is therefore a plane like any other. It has a size, a position and a neighbour, and it should be moved until it holds the others still.\n\nThe photograph above is treated in the same way. It is not framed, because a frame would make it a picture of a room rather than a plane in this one; it simply stops, and the blue square beneath it says where.\n\nEverything on the page, in other words, is the same kind of thing. That is the whole doctrine, and it fits on a postcard.', { ...body, label: 'Column 2 body, continued', role: 'BODY' }));
    p2.push(bar(fr2.x + 120, fr2.bottom - T, fr2.w - 120, T, 'Foot rule'));
    p2.push(rect(fr2.x, fr2.bottom - 44, 44, 44, red, { label: 'Folio block' }));
    p2.push(text(fr2.x, fr2.bottom - 44 + 14, 44, '14', { size: 14, font: 'jetbrains', weight: 700, color: paper, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
    return [p1, p2];
  },
};

// ── Lessons ──────────────────────────────────────────────────────────────────

export const LESSONS: Record<string, DesignLesson> = {
  victorian: {
    principle: 'Density is the design: every line changes face and size, and the rules between them are what let a reader climb a stack of twenty lines without losing the thread.',
    history: 'The playbill and the broadside came out of the nineteenth-century jobbing print shop, where steam presses, cheap paper and a flood of new display faces — fat faces, slab-serif "Egyptians", the first sans-serifs and, from the 1830s, wood type cut on the pantograph — let a printer set a whole poster in a dozen typefaces. Centred lines with rules between them were less a style than a method: each line was a separate piece of news about the event. The look was scorned by the reformers who followed, then rediscovered by Victorian revivalists in the 1960s and by every circus and gig poster since.',
    tryThis: 'Delete every second rule and watch the stack fall apart, then put them back and change the weight of every third one.',
    interestTag: 'Victorian printing',
    related: ['wood type', 'letterpress', 'poster design', 'display typography'],
  },
  'arts-crafts': {
    principle: 'The border is grown from the same rhythm as the text: one leaf, one tulip, repeated until the eye stops counting and starts resting.',
    history: 'Arts and Crafts grew from John Ruskin’s and William Morris’s reaction to Victorian industrial production, arguing that honest materials, visible handwork and flat pattern made better objects and better lives. Morris founded the Kelmscott Press in 1891 and printed the Kelmscott Chaucer in 1896, with dense borders, decorated initials and types modelled on fifteenth-century Venetian printing; Emery Walker and T. J. Cobden-Sanderson’s Doves Press answered with pages of almost no ornament at all. The movement spread through guilds and private presses in Britain and America and fed directly into the workshop ideals of the Wiener Werkstätte and the Bauhaus.',
    tryThis: 'Swap the tulip glyph for a second leaf and see how much quieter the border becomes; then set the initial block in the rust colour instead of ochre.',
    interestTag: 'Arts and Crafts',
    related: ['private press', 'book design', 'William Morris', 'pattern design'],
  },
  'art-nouveau': {
    principle: 'One line carries the page: the whiplash tendril starts in a corner, and the title sits low and off-axis so the curve has somewhere to go.',
    history: 'Art Nouveau flourished from roughly 1890 to 1910, taking its name from Siegfried Bing’s Paris gallery Maison de l’Art Nouveau and going by Jugendstil in Germany, Stile Liberty in Italy and Modernisme in Barcelona. Its designers — Alphonse Mucha and Jules Chéret in the poster, Hector Guimard and Victor Horta in architecture, Émile Gallé and Louis Comfort Tiffany in glass — drew on plant forms, Japanese prints and the ideal of a total design in which lettering, frame and image are one organism. Lithography made its colour posters cheap enough to cover a city, and the style faded quickly after 1910 as geometry replaced the curve.',
    tryThis: 'Rotate the corner tendril 90 degrees and move the title to answer it; the page should still feel like a single gesture.',
    interestTag: 'Art Nouveau',
    related: ['poster design', 'lithography', 'Jugendstil', 'decorative arts'],
  },
  'vienna-secession': {
    principle: 'The square is the unit of everything — the chequer, the title field, the bullet — so gold can be used as a flat plane rather than a highlight.',
    history: 'The Vienna Secession was founded in 1897 when Gustav Klimt, Koloman Moser, Josef Hoffmann, Joseph Maria Olbrich and others left the conservative Künstlerhaus to exhibit modern art on their own terms. Olbrich’s exhibition building opened in 1898 carrying the motto “To the age its art, to art its freedom”, and the group’s journal Ver Sacrum, printed in a square format, pioneered a page design of geometric lettering, flat gold and repeated small squares. Hoffmann and Moser went on to found the Wiener Werkstätte in 1903, carrying the same square-based discipline into furniture, silver and textiles.',
    tryThis: 'Change the chequer cell from 24 to 16 pixels and adjust the title square so it still lands on the grid.',
    interestTag: 'Vienna Secession',
    related: ['Wiener Werkstätte', 'Jugendstil', 'geometric ornament', 'exhibition design'],
  },
  'art-deco': {
    principle: 'Symmetry is the luxury: the sunburst, the stepped panel and the plinth all share one vertical axis, so the gold can be lavish without becoming noisy.',
    history: 'Art Deco takes its name from the 1925 Paris Exposition internationale des arts décoratifs et industriels modernes, though the term itself was popularised in the 1960s. It fused the geometry of Cubism, the colour of the Ballets Russes, the Egyptian craze that followed the discovery of Tutankhamun’s tomb in 1922 and a fascination with speed and machinery into a style of stepped forms, sunbursts, zigzags and metallic finish. Its designers include the poster artist A. M. Cassandre, the illustrator Erté and the architects of the Chrysler Building; in the 1930s it streamlined into the smoother Moderne of ocean liners and cinemas.',
    tryThis: 'Reduce the sunburst to nine rays and increase their opacity; notice how the panel must grow to keep the title legible.',
    interestTag: 'Art Deco',
    related: ['1920s design', 'poster design', 'geometric ornament', 'cinema'],
  },
  bauhaus: {
    principle: 'Composition is a balance of forces, not a centred stack: the red circle’s weight answers the mass of the lowercase headline.',
    history: 'Founded by Walter Gropius in Weimar in 1919, the Bauhaus fused craft and industrial design under one roof; its typography workshop under Herbert Bayer and László Moholy-Nagy argued for sans-serif type, asymmetric layouts and a universal lowercase alphabet. The school moved to Dessau in 1925 and to Berlin in 1932 before being closed under Nazi pressure in 1933, after which its teachers scattered to Chicago, Harvard and Tel Aviv, seeding modern design education worldwide.',
    tryThis: 'Move the red circle to a different corner and re-balance the headline until the page feels still again.',
    interestTag: 'Bauhaus',
    related: ['modernism', 'typography', 'Herbert Bayer', 'geometric abstraction'],
  },
  constructivist: {
    principle: 'The diagonal is the argument: band, title, photograph and subtitle all lean at the same 18 degrees, so the eye is pushed rather than invited.',
    history: 'Constructivism emerged in Russia around the 1917 revolution as artists turned from easel painting to posters, books and exhibitions meant to serve a new society. El Lissitzky’s Beat the Whites with the Red Wedge, Alexander Rodchenko’s photomontage posters and the Stenberg brothers’ film posters set condensed capitals, red and black and cut-up photographs on hard diagonals. The movement’s influence ran west through Lissitzky’s contacts with the Bauhaus and De Stijl, and it was suppressed at home in the 1930s as Socialist Realism became official style.',
    tryThis: 'Set the band angle to zero and see how much urgency the page loses; then try 25 degrees and find the point where the title stops being readable.',
    interestTag: 'Constructivism',
    related: ['photomontage', 'poster design', 'Rodchenko', 'avant-garde'],
  },
  'de-stijl': {
    principle: 'Type never touches a rule: the title lives inside the largest white cell, and the planes are placed off-balance so the page holds together by tension rather than by a centre.',
    history: 'De Stijl was founded in Leiden in 1917 around Theo van Doesburg’s journal of the same name, with Piet Mondrian, Bart van der Leck, Vilmos Huszár and the architect J. J. P. Oud among its early members; Gerrit Rietveld’s Red and Blue Chair and Schröder House later gave it a built form. Mondrian’s Neo-Plasticism reduced painting to horizontal and vertical black lines and planes of red, blue, yellow, white and grey, and the journal carried the same discipline into typography. Mondrian left the group in 1925 over van Doesburg’s introduction of the diagonal, and the movement dispersed after van Doesburg’s death in 1931, leaving a deep mark on the Bauhaus and on modern architecture.',
    tryThis: 'Move one black rule so that it touches the title, then move it back; the moment of contact is the moment the composition dies.',
    interestTag: 'De Stijl',
    related: ['Mondrian', 'Neo-Plasticism', 'grid systems', 'modern architecture'],
  },
};

// ── Palette / typography refinements ─────────────────────────────────────────

export const OVERRIDES: Record<string, Partial<TelaStyleEra>> = {
  victorian: { typography: 'Abril Fatface and Playfair Display for the wood-type lines, Oswald condensed caps, Roboto Slab for the fine print' },
  'arts-crafts': { typography: 'Alegreya bold and italic for display, Lora for text' },
  'art-nouveau': { typography: 'Yeseva One for the title, Philosopher for labels, Lora for text' },
  'vienna-secession': { palette: ['#F0E8D4', '#171717', '#C4A24C', '#6E7A64'], typography: 'Federo Secession capitals, Josefin Sans tracked text, Tenor Sans labels' },
  'art-deco': { typography: 'Limelight marquee capitals, Poiret One deck, Josefin Sans text' },
  bauhaus: { typography: 'Archivo 900 lowercase display, Inter text, Space Grotesk numerals' },
  constructivist: { typography: 'Anton and Bebas Neue condensed capitals, Oswald text, Archivo Black for the mark' },
  'de-stijl': { typography: 'Archivo 700 tracked capitals, Inter text, JetBrains Mono folio' },
};
