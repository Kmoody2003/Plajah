// Full-wrap cover PDF: back + spine + front + bleed, spine title (only above the printer's minimum page count),
// ISBN EAN-13 barcode (drawn from our own encoder) or an empty white barcode box the printer fills.
// `preview: true` adds colored guides (bleed/trim/safe/spine) and is NOT print-ready.
import { PDFDocument, PDFImage, PDFPage, rgb, degrees } from 'pdf-lib';
import { embedBookFonts, inToPt, hexToRgb, sanitizeFor, wrapLines, BookFonts } from './pdfCommon';
import { coverDimensions, spineTextMinPages, CoverDims } from './printSpec';
import { ean13Modules, normalizeIsbn13 } from './barcode';
import type { BindingType, PaperColor, PaperWeight, PrinterId } from './podTypes';

export interface CoverOptions {
  title: string; author: string; backText?: string; publisher?: string;
  isbn13?: string;
  frontImage?: Uint8Array;            // PNG or JPEG bytes
  bgColor?: string;                   // hex, back + spine + fallback front
  printer: PrinterId; binding: BindingType; trimId: string; pageCount: number;
  paperColor: PaperColor; paperWeight: PaperWeight;
  dims?: CoverDims;                   // pass printer-supplied dimensions (e.g. Lulu /cover-dimensions) to override local math
  preview?: boolean;
}
export interface CoverResult { bytes: Uint8Array; dims: CoverDims; spineTitleDrawn: boolean; warnings: string[] }

const BARCODE_BOX = { wIn: 2, hIn: 1.2 }; // KDP-style placement box (inside back cover safe area); other printers accept the same

export async function buildCoverPdf(o: CoverOptions): Promise<CoverResult> {
  const warnings: string[] = [];
  const dims = o.dims ?? coverDimensions(o.printer, o.binding, o.trimId, o.pageCount, o.paperColor, o.paperWeight);
  if (!dims) throw new Error('Cannot compute cover dimensions for this page count / binding. Check preflight.');
  if (dims.estimated) warnings.push('Cover dimensions are an estimate for this binding; confirm with the printer before ordering.');
  const doc = await PDFDocument.create();
  doc.setTitle(`${o.title} (cover)`); doc.setProducer('Plajah Print Edition');
  const F = await embedBookFonts(doc);
  const W = inToPt(dims.widthIn), H = inToPt(dims.heightIn);
  const page = doc.addPage([W, H]);
  const bg = hexToRgb(o.bgColor);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });

  const bleed = inToPt(dims.bleedIn);
  const backX = inToPt(dims.backX0In), spineX = inToPt(dims.spineX0In), frontX = inToPt(dims.frontX0In);
  const panelW = inToPt(dims.trimWIn), trimH = inToPt(dims.trimHIn);
  const trimBottom = (H - trimH) / 2;
  const safe = inToPt(0.375);

  // Front image: cover-fit across the front panel, extended through bleed on top/right/bottom.
  if (o.frontImage?.length) {
    try {
      const img = await embedImage(doc, o.frontImage);
      const areaX = frontX, areaW = panelW + bleed, areaY = 0, areaH = H;
      const s = Math.max(areaW / img.width, areaH / img.height);
      const w = img.width * s, h = img.height * s;
      page.drawImage(img, { x: areaX + (areaW - w) / 2, y: areaY + (areaH - h) / 2, width: w, height: h });
      // clip is approximated by painting the back/spine over any overflow to the left
      page.drawRectangle({ x: 0, y: 0, width: frontX, height: H, color: bg });
      if (img.width * img.height > 0 && Math.min(img.width / (dims.trimWIn + dims.bleedIn), img.height / dims.heightIn) < 280)
        warnings.push('Front cover image is below ~300 dpi at print size; it may print soft.');
    } catch { warnings.push('Front cover image could not be read (use PNG or JPEG). A text cover was drawn instead.'); o = { ...o, frontImage: undefined }; }
  }
  const txt = (s: string) => sanitizeFor(F.regular, s).text;
  const white = rgb(1, 1, 1);
  if (!o.frontImage?.length) {
    let y = trimBottom + trimH * 0.62;
    for (const ln of wrapLines(F.bold, 30, txt(o.title), panelW - 2 * safe)) {
      const t = ln.words.join(' '); page.drawText(t, { x: frontX + (panelW - F.bold.widthOfTextAtSize(t, 30)) / 2, y, size: 30, font: F.bold, color: white }); y -= 36;
    }
    const a = txt(o.author); page.drawText(a, { x: frontX + (panelW - F.regular.widthOfTextAtSize(a, 16)) / 2, y: trimBottom + trimH * 0.15, size: 16, font: F.regular, color: white });
  }

  // Back: blurb
  if (o.backText) {
    let y = trimBottom + trimH - safe - 14;
    const maxW = panelW - 2 * safe;
    for (const para of txt(o.backText).split(/\n+/)) {
      for (const ln of wrapLines(F.regular, 11, para, maxW)) {
        if (y < trimBottom + inToPt(1.2) + safe + 20) { warnings.push('Back-cover text is long and was truncated above the barcode area.'); y = -1; break; }
        page.drawText(ln.words.join(' '), { x: backX + safe, y, size: 11, font: F.regular, color: white }); y -= 14.5;
      }
      if (y < 0) break; y -= 7;
    }
  }

  // Spine title
  let spineTitleDrawn = false;
  const minPages = spineTextMinPages(o.printer).value;
  const spineW = inToPt(dims.spineIn);
  if (spineW > 0) {
    if (o.pageCount >= minPages && spineW >= inToPt(0.25)) {
      const s = Math.min(14, Math.max(7, spineW * 0.45));
      const t = txt(`${o.title}   ${o.author}`);
      let fit = t; while (fit.length > 4 && F.bold.widthOfTextAtSize(fit, s) > trimH - 2 * safe) fit = fit.slice(0, -2);
      // Reads top-to-bottom (US convention): rotate -90deg, origin at the top of the spine.
      page.drawText(fit, { x: spineX + spineW / 2 + s * 0.3, y: trimBottom + trimH - safe, size: s, font: F.bold, color: white, rotate: degrees(-90) });
      spineTitleDrawn = true;
    } else warnings.push(`Spine text omitted: needs >= ${minPages} pages and a spine of at least 0.25 in (this book: ${o.pageCount} pages, ${dims.spineIn.toFixed(3)} in).`);
  }

  // Barcode box (white), bottom-right of the back cover, 0.25in inside trim.
  const bx = backX + panelW - inToPt(BARCODE_BOX.wIn) - inToPt(0.25);
  const by = trimBottom + inToPt(0.25);
  const isbn = o.isbn13 ? normalizeIsbn13(o.isbn13) : null;
  if (o.isbn13 && !isbn) warnings.push('ISBN is not a valid ISBN-13 (check digit failed); barcode box left empty.');
  page.drawRectangle({ x: bx, y: by, width: inToPt(BARCODE_BOX.wIn), height: inToPt(BARCODE_BOX.hIn), color: white });
  if (isbn) drawEan13(page, F, isbn, bx, by);
  else if (o.preview) page.drawText('BARCODE AREA', { x: bx + 30, y: by + 40, size: 10, font: F.regular, color: rgb(0.4, 0.4, 0.4) });

  if (o.preview) drawGuides(page, dims, trimBottom, trimH, panelW, bleed, spineX, spineW, frontX, backX);
  return { bytes: await doc.save(), dims, spineTitleDrawn, warnings };
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (png) return doc.embedPng(bytes);
  if (jpg) return doc.embedJpg(bytes);
  throw new Error('unsupported image');
}

function drawEan13(page: PDFPage, F: BookFonts, digits: string, boxX: number, boxY: number) {
  const mods = ean13Modules(digits);
  const modW = (inToPt(BARCODE_BOX.wIn) - 18) / 95;          // 95 modules + quiet zones inside the box
  const x0 = boxX + 9, barH = inToPt(BARCODE_BOX.hIn) - 24, y0 = boxY + 16;
  const guard = new Set<number>([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let i = 0;
  while (i < mods.length) {
    if (mods[i] === '1') {
      let j = i; while (j < mods.length && mods[j] === '1') j++;
      const tall = guard.has(i) || guard.has(j - 1);
      page.drawRectangle({ x: x0 + i * modW, y: tall ? y0 - 5 : y0, width: (j - i) * modW, height: tall ? barH + 5 : barH, color: rgb(0, 0, 0) });
      i = j;
    } else i++;
  }
  const sz = 8;
  page.drawText(digits[0], { x: x0 - 7, y: boxY + 5, size: sz, font: F.regular, color: rgb(0, 0, 0) });
  page.drawText(digits.slice(1, 7), { x: x0 + 3 * modW + 2, y: boxY + 5, size: sz, font: F.regular, color: rgb(0, 0, 0) });
  page.drawText(digits.slice(7), { x: x0 + 50 * modW + 2, y: boxY + 5, size: sz, font: F.regular, color: rgb(0, 0, 0) });
}

function drawGuides(page: PDFPage, d: CoverDims, trimBottom: number, trimH: number, panelW: number, bleed: number, spineX: number, spineW: number, frontX: number, backX: number) {
  const red = rgb(0.9, 0.1, 0.1), blue = rgb(0.1, 0.4, 0.9), green = rgb(0.1, 0.7, 0.3);
  const line = (x1: number, y1: number, x2: number, y2: number, c = red) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.7, color: c, dashArray: [4, 3] });
  const top = trimBottom + trimH;
  // trim box
  page.drawRectangle({ x: backX, y: trimBottom, width: frontX + panelW - backX, height: trimH, borderColor: red, borderWidth: 0.7, borderDashArray: [4, 3] });
  line(spineX, 0, spineX, page.getHeight(), blue); line(frontX, 0, frontX, page.getHeight(), blue);
  const s = inToPt(0.375);
  page.drawRectangle({ x: backX + s, y: trimBottom + s, width: panelW - 2 * s, height: trimH - 2 * s, borderColor: green, borderWidth: 0.6, borderDashArray: [2, 2] });
  page.drawRectangle({ x: frontX + s, y: trimBottom + s, width: panelW - 2 * s, height: trimH - 2 * s, borderColor: green, borderWidth: 0.6, borderDashArray: [2, 2] });
  void top; void bleed; void spineW;
}
