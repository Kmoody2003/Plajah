/**
 * Tela PDF — writing a PDF back out with pdf-lib: form values, markup, signatures, new fields
 * (turning a flat form fillable), page rotation and page removal. Runs in the browser and in
 * tests (no DOM needed). Fields stay live unless the person asks to flatten.
 */

import { PDFCheckBox, PDFDocument, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFString, PDFTextField, StandardFonts, degrees, rgb } from 'pdf-lib';

export type Rect = [number, number, number, number];

export type Markup =
  | { id: string; page: number; kind: 'highlight' | 'underline' | 'strike'; rects: Rect[]; color: string; text?: string }
  | { id: string; page: number; kind: 'ink'; strokes: Array<Array<[number, number]>>; color: string; width: number }
  | { id: string; page: number; kind: 'note'; at: [number, number]; text: string; color: string }
  | { id: string; page: number; kind: 'text'; rect: Rect; text: string; color: string; size: number }
  | { id: string; page: number; kind: 'rect'; rect: Rect; color: string; width: number }
  | { id: string; page: number; kind: 'image'; rect: Rect; dataUrl: string; label?: string };

export interface NewField { name: string; page: number; rect: Rect; type: 'text' | 'checkbox'; tooltip?: string }

export interface WriteOptions {
  values?: Record<string, string | boolean>;
  markups?: Markup[];
  newFields?: NewField[];
  /** Extra rotation per page index, in degrees (multiples of 90). */
  rotate?: Record<number, number>;
  /** Page indexes to drop. */
  remove?: number[];
  flatten?: boolean;
  title?: string;
}

export interface WriteResult { bytes: Uint8Array; written: string[]; failed: Array<{ name: string; why: string }> }

const hex = (c: string) => {
  const m = c.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(1, 0.85, 0.1);
};
const box = (r: Rect) => ({ x: Math.min(r[0], r[2]), y: Math.min(r[1], r[3]), width: Math.abs(r[2] - r[0]), height: Math.abs(r[3] - r[1]) });

/** Strip characters the standard Helvetica font can't encode (WinAnsi), so a stray emoji never fails a save. */
export const winAnsi = (s: string) => s.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff€]/g, '');

export async function writePdf(input: Uint8Array | ArrayBuffer, o: WriteOptions): Promise<WriteResult> {
  const doc = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const written: string[] = []; const failed: WriteResult['failed'] = [];

  // New fields first, so values can target them.
  const form = doc.getForm();
  for (const nf of o.newFields ?? []) {
    const page = pages[nf.page]; if (!page) continue;
    try {
      const b = box(nf.rect);
      if (nf.type === 'checkbox') { const cb = form.createCheckBox(nf.name); cb.addToPage(page, { ...b, borderWidth: 0.6 }); }
      else { const tf = form.createTextField(nf.name); tf.addToPage(page, { ...b, borderWidth: 0, font }); tf.setFontSize(0); }
      if (nf.tooltip) { try { (form.getField(nf.name) as any).acroField.dict.set(PDFName.of('TU'), PDFString.of(winAnsi(nf.tooltip))); } catch { /* tooltip is a nicety */ } }
    } catch (e: any) { failed.push({ name: nf.name, why: String(e?.message ?? e) }); }
  }

  for (const [name, value] of Object.entries(o.values ?? {})) {
    let field: any; try { field = form.getField(name); } catch { failed.push({ name, why: 'No such field' }); continue; }
    try {
      if (field instanceof PDFTextField) {
        let t = winAnsi(String(value)); const max = field.getMaxLength(); if (max && t.length > max) t = t.slice(0, max);
        field.setText(t || undefined);
      } else if (field instanceof PDFCheckBox) { if (value === true || value === 'true' || value === 'Yes' || value === 'On') field.check(); else field.uncheck(); }
      else if (field instanceof PDFRadioGroup) { if (typeof value === 'string' && value && value !== 'Off') field.select(value); else field.clear(); }
      else if (field instanceof PDFDropdown) { const v = String(value); if (!field.getOptions().includes(v) && v) field.addOptions(v); v ? field.select(v) : field.clear(); }
      else if (field instanceof PDFOptionList) { const v = String(value); v ? field.select(v) : field.clear(); }
      else { failed.push({ name, why: 'Field type cannot be filled' }); continue; }
      written.push(name);
    } catch (e: any) { failed.push({ name, why: String(e?.message ?? e) }); }
  }
  try { form.updateFieldAppearances(font); } catch { /* values are still set; viewers regenerate */ }

  for (const m of o.markups ?? []) {
    const page = pages[m.page]; if (!page) continue;
    const color = 'color' in m ? hex(m.color) : rgb(0, 0, 0);
    if (m.kind === 'highlight') for (const r of m.rects) page.drawRectangle({ ...box(r), color, opacity: 0.38, blendMode: 'Multiply' as any });
    else if (m.kind === 'underline' || m.kind === 'strike') for (const r of m.rects) {
      const b = box(r); const y = m.kind === 'underline' ? b.y + 0.5 : b.y + b.height * 0.45;
      page.drawLine({ start: { x: b.x, y }, end: { x: b.x + b.width, y }, thickness: Math.max(0.8, b.height * 0.07), color });
    }
    else if (m.kind === 'ink') for (const s of m.strokes) {
      if (s.length < 2) continue;
      const [x0, y0] = s[0];
      // drawSvgPath draws with y flipped around the given origin, so build the path relative to (x0, y0).
      const path = s.map(([x, y], i) => `${i ? 'L' : 'M'}${(x - x0).toFixed(2)} ${(-(y - y0)).toFixed(2)}`).join(' ');
      page.drawSvgPath(path, { x: x0, y: y0, borderColor: color, borderWidth: m.width, borderLineCap: 1 as any });
    }
    else if (m.kind === 'rect') page.drawRectangle({ ...box(m.rect), borderColor: color, borderWidth: m.width });
    else if (m.kind === 'text') {
      const b = box(m.rect); const lines = wrap(winAnsi(m.text), font, m.size, Math.max(20, b.width));
      lines.forEach((ln, i) => page.drawText(ln, { x: b.x, y: b.y + b.height - m.size * (i + 1) * 1.15 + m.size * 0.15, size: m.size, font, color }));
    }
    else if (m.kind === 'note') addNoteAnnotation(doc, page, m.at, winAnsi(m.text), m.color);
    else if (m.kind === 'image') {
      const bytes = dataUrlBytes(m.dataUrl); if (!bytes) continue;
      const img = /^data:image\/png/i.test(m.dataUrl) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const b = box(m.rect);
      const s = Math.min(b.width / img.width, b.height / img.height);
      page.drawImage(img, { x: b.x + (b.width - img.width * s) / 2, y: b.y + (b.height - img.height * s) / 2, width: img.width * s, height: img.height * s });
    }
  }

  for (const [i, deg] of Object.entries(o.rotate ?? {})) {
    const page = pages[Number(i)]; if (!page || !deg) continue;
    page.setRotation(degrees(((page.getRotation().angle + deg) % 360 + 360) % 360));
  }
  if (o.flatten) { try { form.flatten(); } catch (e: any) { failed.push({ name: '(flatten)', why: String(e?.message ?? e) }); } }
  for (const i of [...new Set(o.remove ?? [])].sort((a, b) => b - a)) if (i >= 0 && i < doc.getPageCount() && doc.getPageCount() > 1) doc.removePage(i);
  if (o.title) doc.setTitle(winAnsi(o.title));
  doc.setModificationDate(new Date());

  const bytes = await doc.save({ updateFieldAppearances: false });
  return { bytes, written, failed };
}

function wrap(text: string, font: any, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}

function dataUrlBytes(url: string): Uint8Array | null {
  const m = url.match(/^data:[^;]+;base64,(.*)$/); if (!m) return null;
  const bin = typeof atob === 'function' ? atob(m[1]) : Buffer.from(m[1], 'base64').toString('binary');
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
}

/** A real sticky-note (/Text) annotation, so comments show in Acrobat, Preview and browsers too. */
function addNoteAnnotation(doc: PDFDocument, page: any, at: [number, number], text: string, color: string) {
  const c = hex(color) as any;
  const annot = doc.context.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [at[0], at[1] - 18, at[0] + 18, at[1]], Contents: PDFString.of(text), Name: 'Comment',
    C: [c.red, c.green, c.blue], F: 4, T: PDFString.of('Tela'), M: PDFString.fromDate(new Date()),
  });
  const ref = doc.context.register(annot);
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (annots && typeof annots.push === 'function') annots.push(ref); else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}

/** Merge several PDFs into one (combine files from the reader). */
export async function mergePdfs(files: Array<Uint8Array | ArrayBuffer>): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices()); pages.forEach(p => out.addPage(p));
  }
  return out.save();
}

/** Pull a page range out as its own PDF. */
export async function extractPages(input: Uint8Array | ArrayBuffer, indexes: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(input, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indexes.filter(i => i >= 0 && i < src.getPageCount()));
  pages.forEach(p => out.addPage(p));
  return out.save();
}
