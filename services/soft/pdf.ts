// Pattern PDFs: print-at-home tiles at 1:1 (Letter or A4, with a test square and an assembly map),
// one copy-shop sheet (A0 or a 36″ roll), and a tech pack for a seamstress or factory: cover,
// pattern overview, bill of materials, measurements/grading, construction, safety and labelling.

import { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, type PDFPage, type PDFFont } from 'pdf-lib';
import type { Pt } from './geometry';
import type { Pattern } from './patterns';
import { printSheet, pieceCaption, marker, rolesOf, yardage, FABRIC_LABEL, cutChart, type SheetItem } from './layout';
import type { Hazard } from '../safety/hazards';
import { type GradeSet, gradePom, sizeStyle, sizeRangeLabel } from './grading';

const PT = 72 / 25.4;
export const PAPER = { letter: { w: 215.9, h: 279.4, name: 'US Letter' }, a4: { w: 210, h: 297, name: 'A4' }, a0: { w: 841, h: 1189, name: 'A0' }, roll36: { w: 914.4, h: 0, name: '36″ roll' } } as const;
export type Paper = keyof typeof PAPER;
/** Standard fonts are WinAnsi only. */
const safe = (s: string) => s.replace(/×/g, 'x').replace(/[″“”]/g, '"').replace(/[‘’′]/g, "'").replace(/[–—]/g, '-').replace(/½/g, '1/2').replace(/⅛/g, '1/8').replace(/°/g, ' deg').replace(/≈/g, '~').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
const hexRgb = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const ink = rgb(0.1, 0.1, 0.12), blue = rgb(0.15, 0.39, 0.92), green = rgb(0.09, 0.64, 0.29), red = rgb(0.86, 0.15, 0.15), grey = rgb(0.6, 0.6, 0.62);

function drawItems(page: PDFPage, font: PDFFont, items: SheetItem[], ox: number, oy: number, k: number, size?: string) {
  // (X, Y) in sheet mm → page points; drawSvgPath flips y, so feed it -y.
  const P = (q: Pt) => [ox + q[0] * k, oy + q[1] * k] as const; const path = (pts: Pt[], close = true) => pts.map((q, i) => { const [x, y] = P(q); return `${i ? 'L' : 'M'}${x.toFixed(2)},${(-y).toFixed(2)}`; }).join('') + (close ? 'Z' : '');
  for (const it of items) {
    if (it.nest?.length) for (const n of it.nest) { const st = sizeStyle(n.i); page.drawSvgPath(path(n.cut), { x: 0, y: 0, borderColor: hexRgb(st.color), borderWidth: 0.7, ...(st.dash.length ? { borderDashArray: st.dash } : {}) }); }
    else {
      page.drawSvgPath(path(it.cut), { x: 0, y: 0, borderColor: ink, borderWidth: 0.8 });
      page.drawSvgPath(path(it.seam), { x: 0, y: 0, borderColor: blue, borderWidth: 0.4, borderDashArray: [3, 2] });
    }
    for (const l of it.lines) page.drawSvgPath(path(l.pts, false), { x: 0, y: 0, borderColor: blue, borderWidth: 0.6 });
    if (it.fold) { const [a, b] = it.fold.map(P); page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, color: ink, thickness: 1.6, dashArray: [6, 3] }); page.drawText('PLACE ON FOLD', { x: Math.min(a[0], b[0]) + 3, y: (a[1] + b[1]) / 2, size: 7, font, color: ink, rotate: degrees(90) }); }
    const [g0, g1] = it.grain.map(P); page.drawLine({ start: { x: g0[0], y: g0[1] }, end: { x: g1[0], y: g1[1] }, color: green, thickness: 0.8 });
    for (const e of [g0, g1]) { const s = e === g1 ? -1 : 1; page.drawLine({ start: { x: e[0], y: e[1] }, end: { x: e[0] - 3, y: e[1] + s * 5 }, color: green, thickness: 0.8 }); page.drawLine({ start: { x: e[0], y: e[1] }, end: { x: e[0] + 3, y: e[1] + s * 5 }, color: green, thickness: 0.8 }); }
    for (const n of it.notches) { const c = it.cut.reduce((b, q) => (Math.hypot(q[0] - n[0], q[1] - n[1]) < Math.hypot(b[0] - n[0], b[1] - n[1]) ? q : b), it.cut[0]); const [x0, y0] = P(c), [x1, y1] = P(n); page.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, color: red, thickness: 1 }); }
    for (const m of it.marks) { const [x, y] = P(m.at); page.drawCircle({ x, y, size: Math.max(1.5, (m.r ?? 2) * k), borderColor: red, borderWidth: 0.6 }); page.drawText(safe(m.label), { x: x + 4, y: y - 2, size: 6, font, color: red }); }
    const gm = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2]; let ty = gm[1] + 12;
    for (const line of pieceCaption(it.piece, size)) { page.drawText(safe(line), { x: gm[0] + 5, y: ty, size: line === pieceCaption(it.piece)[0] ? 9 : 7, font, color: ink }); ty -= 10; }
  }
}

/** Size key: each size's line colour and style. */
function sizeKey(page: PDFPage, font: PDFFont, x: number, y: number, sizes: string[], perRow = 7) {
  page.drawText('Size key', { x, y: y + 4, size: 8, font, color: ink });
  sizes.forEach((sz, i) => { const st = sizeStyle(i); const cx = x + (i % perRow) * 62, cy = y - 10 - Math.floor(i / perRow) * 13;
    page.drawLine({ start: { x: cx, y: cy + 3 }, end: { x: cx + 28, y: cy + 3 }, color: hexRgb(st.color), thickness: 1.4, ...(st.dash.length ? { dashArray: st.dash } : {}) });
    page.drawText(safe(sz), { x: cx + 32, y: cy, size: 8, font, color: ink }); });
}

function testSquare(page: PDFPage, font: PDFFont, x: number, y: number) {
  page.drawRectangle({ x, y, width: 50 * PT, height: 50 * PT, borderColor: ink, borderWidth: 0.8 }); page.drawText('50 mm', { x: x + 4, y: y + 4, size: 8, font });
  page.drawRectangle({ x: x + 56 * PT, y, width: 72, height: 72, borderColor: ink, borderWidth: 0.8 }); page.drawText('2 in', { x: x + 56 * PT + 4, y: y + 4, size: 8, font });
}

/** Print-at-home tiles at 100% scale. Rectangles are listed with their cut sizes instead of drawn. */
export async function printPdf(pattern0: Pattern, paper: Paper = 'letter', unit: 'cm' | 'in' = 'cm', grade?: GradeSet | null): Promise<{ bytes: Uint8Array; pages: number; cols: number; rows: number }> {
  const pattern = grade ? { ...grade.base, name: `${grade.base.name.replace(/ size \S+/, '')} sizes ${sizeRangeLabel(grade.sizes)}` } : pattern0; const sizeLabel = grade ? sizeRangeLabel(grade.sizes) : pattern.size;
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(safe(pattern.name)); doc.setCreator('Plajah Build');
  const big = paper === 'a0' || paper === 'roll36'; const pp = PAPER[paper]; const margin = big ? 10 : 12;
  const sheet = printSheet(pattern, big ? pp.w - 2 * margin : undefined, 15, grade);
  const pw = pp.w - 2 * margin, ph = (pp.h || sheet.height + 80) - 2 * margin;
  const cols = big ? 1 : Math.max(1, Math.ceil(sheet.width / pw)), rows = paper === 'roll36' ? 1 : Math.max(1, Math.ceil(sheet.height / ph));
  // Cover page: test square, legend, assembly map, cut-by-measurement chart.
  const cover = doc.addPage([PAPER[big ? 'letter' : paper].w * PT, PAPER[big ? 'letter' : paper].h * PT]); const H = cover.getHeight(); let y = H - 50;
  cover.drawText(safe(pattern.name), { x: 40, y, size: 18, font: bold }); y -= 22;
  cover.drawText(safe(`Print at 100% / "Actual size" (no scaling). Check the test square before cutting. ${big ? (rows > 1 ? `${rows} ${pp.name} sheets, top to bottom (cut at the frame and butt the edges).` : `One ${pp.name} sheet.`) : `${cols} x ${rows} pages, trim one margin and tape along the frame.`}`), { x: 40, y, size: 9, font }); y -= 80;
  testSquare(cover, font, 40, y); y -= 24;
  cover.drawText(grade ? 'Graded: one cutting line per size (seam allowance included). Red ticks: notches. Green arrow: grainline. Blue: darts.' : 'Solid black: cut line. Blue dashes: seam line. Red ticks: notches (snip 3 mm). Green arrow: grainline, parallel to the selvedge.', { x: 40, y, size: 8, font }); y -= 20;
  if (grade) { sizeKey(cover, font, 40, y, grade.sizes); y -= 22 + Math.ceil(grade.sizes.length / 7) * 13; }
  if (!big && sheet.items.length) {
    const cw = Math.min(26, 300 / cols), ch = cw * ph / pw; cover.drawText('Assembly map', { x: 40, y, size: 10, font: bold }); y -= 8;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const bx = 40 + c * cw, by = y - (r + 1) * ch; cover.drawRectangle({ x: bx, y: by, width: cw, height: ch, borderColor: grey, borderWidth: 0.5 }); cover.drawText(`${String.fromCharCode(65 + r)}${c + 1}`, { x: bx + 2, y: by + 2, size: 6, font }); }
    y -= rows * ch + 20;
  }
  const chart = cutChart(pattern, unit); cover.drawText('Cut list', { x: 40, y, size: 10, font: bold }); y -= 14;
  for (const row of chart) { if (y < 40) break; let x = 40; row.forEach((cell, i) => { cover.drawText(safe(cell).slice(0, 48), { x, y, size: 7.5, font: row === chart[0] ? bold : font }); x += [150, 90, 70, 220][i]; }); y -= 11; }
  if (sheet.skipped.length) { y -= 6; cover.drawText(safe('Rectangles are not printed: measure and cut them from the sizes above.'), { x: 40, y, size: 8, font }); }
  // Tiles. Sheet y is up; row A is the top of the sheet.
  if (sheet.items.length) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const page = doc.addPage([pp.w * PT, (pp.h || sheet.height + 80) * PT]); const x0 = c * pw, yTop = sheet.height - r * ph;
    const fx = margin * PT, fy = margin * PT, fw = pw * PT, fh = ph * PT;
    page.drawRectangle({ x: fx, y: fy, width: fw, height: fh, borderColor: grey, borderWidth: 0.4 });
    page.pushOperators(pushGraphicsState(), rectangle(fx, fy, fw, fh), clip(), endPath());
    drawItems(page, font, sheet.items, fx - x0 * PT, fy + fh - yTop * PT, PT, sizeLabel);
    page.pushOperators(popGraphicsState());
    if (!big || rows > 1) page.drawText(`${String.fromCharCode(65 + r)}${c + 1}`, { x: fx + 3, y: fy + fh + 3, size: 9, font: bold, color: grey });
    if (r === 0 && c === 0 && !big) testSquare(page, font, fx + 6, fy + 6);
    if (r === 0 && c === 0 && grade) sizeKey(page, font, fx + (big ? 6 : 150), fy + (big ? 90 : 40), grade.sizes, big ? 7 : 3);
  }
  const bytes = await doc.save(); return { bytes, pages: doc.getPageCount(), cols, rows };
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []; for (const para of safe(text).split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out;
}

export interface TechPackInfo { style?: string; designer?: string; season?: string; colourways?: string; audience: string; hazards: Hazard[]; labels: string[]; unit?: 'cm' | 'in'; /** Graded size range: adds the nest and the graded spec. */ grade?: GradeSet | null }

/** Tech pack PDF (US Letter landscape). */
export async function techPackPdf(pattern: Pattern, info: TechPackInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(safe(`${pattern.name} tech pack`)); doc.setCreator('Plajah Build');
  const W = 792, H = 612; const unit = info.unit ?? 'cm'; const f = (mm: number) => (unit === 'in' ? `${(mm / 25.4).toFixed(2)} in` : `${(mm / 10).toFixed(1)} cm`);
  const style = info.style || `PB-${pattern.template.toUpperCase()}-${(pattern.size ?? '').toUpperCase() || 'OS'}`;
  let page!: PDFPage; let y = 0; let n = 0;
  const newPage = (title: string) => { page = doc.addPage([W, H]); n++; page.drawRectangle({ x: 0, y: H - 44, width: W, height: 44, color: rgb(0.08, 0.09, 0.12) });
    page.drawText(safe(title), { x: 30, y: H - 28, size: 14, font: bold, color: rgb(1, 1, 1) }); page.drawText(safe(`${pattern.name}  |  ${style}`), { x: 300, y: H - 28, size: 9, font, color: rgb(0.8, 0.8, 0.85) });
    page.drawText(`Page ${n}`, { x: W - 70, y: 18, size: 8, font, color: grey }); page.drawText('Plajah Build tech pack. Verify every measurement on a sample before production.', { x: 30, y: 18, size: 7, font, color: grey }); y = H - 70; };
  const para = (t: string, size = 9, fnt = font, x = 30, width = W - 60) => { for (const l of wrap(t, fnt, size, width)) { if (y < 40) newPage('continued'); page.drawText(l, { x, y, size, font: fnt, color: ink }); y -= size + 3; } };
  const table = (rows: string[][], widths: number[], size = 8.5) => { for (const [ri, row] of rows.entries()) { if (y < 40) newPage('continued'); let x = 30; row.forEach((c, i) => { page.drawText(safe(c).slice(0, Math.floor(widths[i] / (size * 0.5))), { x, y, size, font: ri === 0 ? bold : font, color: ink }); x += widths[i]; }); y -= size + 5; if (ri === 0) page.drawLine({ start: { x: 30, y: y + size + 1 }, end: { x: W - 30, y: y + size + 1 }, thickness: 0.4, color: grey }); } y -= 6; };

  newPage('Cover');
  table([['Field', 'Value'], ['Style', style], ['Product', pattern.name], ['Category', pattern.kind], ['Size', pattern.size ?? 'one size'], ['Intended user', info.audience], ['Designer', info.designer || '-'], ['Season / drop', info.season || '-'], ['Colourways', info.colourways || '-'], ['Date', new Date().toISOString().slice(0, 10)]], [150, 560]);
  const crit = info.hazards.filter(h => h.severity === 'critical' || h.severity === 'high');
  if (crit.length) { para('Safety-critical requirements (details on the safety page):', 10, bold); for (const h of crit) para(`- ${h.title}${h.cite ? ` (${h.cite})` : ''}`); }

  newPage('Pattern pieces');
  const sheet = printSheet(pattern); const k = Math.min((W - 60) / Math.max(1, sheet.width), (H - 200) / Math.max(1, sheet.height)) * 0.95;
  if (sheet.items.length) drawItems(page, font, sheet.items, 30, 130, k, pattern.size);
  y = 110; table(cutChart(pattern, unit).slice(0, 8), [200, 120, 110, 300], 7.5);

  newPage('Bill of materials');
  const fab = rolesOf(pattern).map(r => { const mk = marker(pattern, r); const yd = yardage(mk); return [FABRIC_LABEL[r], `${Math.round(mk.width / 10)} cm wide`, `${yd.metres.toFixed(1)} m / ${yd.yards} yd`, `${Math.round(mk.efficiency * 100)}% marker use`]; });
  table([['Fabric', 'Width', 'Per unit', 'Note'], ...fab], [200, 140, 160, 250]);
  table([['Notion / trim', 'Qty', 'Spec'], ...pattern.notions.map(x => [x.item, x.qty, x.note ?? ''])], [250, 200, 300]);
  if (pattern.fill) para(`Fill: about ${pattern.fill.grams} g (${pattern.fill.litres} L) polyester fibre fill, new material.`);

  newPage('Measurements');
  table([['Point of measure', `Finished (${unit})`, 'Tolerance'], ...pattern.finished.map(([p, v]) => [p, f(v), unit === 'in' ? '+/- 1/4 in' : '+/- 0.6 cm'])], [300, 200, 200]);
  const g = info.grade ? gradePom(info.grade) : pattern.grading ? { sizes: pattern.grading.sizes, rows: pattern.grading.rows.map(r => ({ ...r, step: NaN })) } : null;
  const fv = (v: number) => (!Number.isFinite(v) ? '-' : unit === 'in' ? (v / 25.4).toFixed(2) : (v / 10).toFixed(1));
  if (g) { para(info.grade ? `Graded spec, sizes ${sizeRangeLabel(g.sizes)} (${unit}); grade = average change between neighbouring sizes` : `Size chart (${unit})`, 10, bold); const cw = Math.min(70, 500 / (g.sizes.length + (info.grade ? 1 : 0)));
    table([['POM', ...g.sizes, ...(info.grade ? ['Grade'] : [])], ...g.rows.map(r => [r.pom, ...r.values.map(fv), ...(info.grade ? [`${r.step >= 0 ? '+' : ''}${fv(r.step)}`] : [])])], [190, ...g.sizes.map(() => cw), ...(info.grade ? [cw] : [])]); }

  if (info.grade) {
    newPage(`Graded nest ${sizeRangeLabel(info.grade.sizes)}`);
    const gs = printSheet(info.grade.base, undefined, 15, info.grade); const kk = Math.min((W - 60) / Math.max(1, gs.width), (H - 170) / Math.max(1, gs.height)) * 0.95;
    if (gs.items.length) drawItems(page, font, gs.items, 30, 100, kk, sizeRangeLabel(info.grade.sizes)); else para('Every piece is a rectangle: see the graded spec for cut sizes.');
    sizeKey(page, font, 30, 70, info.grade.sizes, 11);
  }

  newPage('Construction');
  pattern.steps.forEach((s, i) => para(`${i + 1}. ${s}`)); y -= 6; for (const nn of pattern.notes) para(`Note: ${nn}`);
  y -= 6; para('Quality checks', 10, bold); para(pattern.kind === 'plush' ? 'Seam pull test on every unit (no gaping); eyes/noses cannot be pulled out or twisted off; no sharp points or loose fibre at the seams; weight within 5% of the sample.' : 'Measure the first unit of every size against the spec; seams secure and finished; labels attached; no needles or pins left in (metal-detect for children\'s products).');

  newPage('Safety and labelling');
  for (const h of info.hazards) { para(`[${h.severity.toUpperCase()}] ${h.title}`, 9.5, bold); para(h.why); for (const m of h.mitigate) para(`- ${m}`, 8.5, font, 42, W - 72); if (h.cite) para(`Reference: ${h.cite}`, 8); y -= 4; }
  y -= 6; para('Labels required', 10, bold); for (const l of info.labels) para(`- ${l}`);
  y -= 6; para('The maker or brand placing this product on the market is responsible for testing, certification and labelling. Plajah provides these notes to help, not as legal advice or a certification.', 8);
  return doc.save();
}
