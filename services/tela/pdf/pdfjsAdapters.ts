/** pdf.js objects → Smart Fill shapes. No DOM, no Firebase, so tests run it against real pdf.js in Node. */

import type { PdfField, PdfFieldType, TextRun } from './smartFill';

/** pdf.js widget annotation → our field shape. */
export function fieldFromAnnotation(a: any, page: number): PdfField | null {
  if (a?.subtype !== 'Widget' || !a.fieldName) return null;
  let type: PdfFieldType;
  if (a.fieldType === 'Tx') type = 'text';
  else if (a.fieldType === 'Btn') type = a.checkBox ? 'checkbox' : a.radioButton ? 'radio' : 'button';
  else if (a.fieldType === 'Ch') type = a.combo ? 'dropdown' : 'list';
  else if (a.fieldType === 'Sig') type = 'signature';
  else return null;
  const options = Array.isArray(a.options) ? a.options.map((o: any) => String(o?.exportValue ?? o?.displayValue ?? '')).filter(Boolean) : undefined;
  let value: PdfField['value'] = a.fieldValue ?? undefined;
  if (type === 'checkbox') value = !!a.fieldValue && a.fieldValue !== 'Off';
  if (Array.isArray(value)) value = value[0];
  return {
    name: String(a.fieldName), annotId: a.id ? String(a.id) : undefined, type, page, rect: a.rect as PdfField['rect'],
    tooltip: a.alternativeText || undefined, options, value: value as PdfField['value'],
    exportValue: a.exportValue ?? a.buttonValue ?? undefined,
    multiline: !!a.multiLine, maxLen: a.maxLen || undefined, comb: !!a.comb, readOnly: !!a.readOnly, required: !!a.required,
  };
}

export async function fieldsOf(pdfPage: any, pageIndex: number): Promise<PdfField[]> {
  const annots = await pdfPage.getAnnotations({ intent: 'display' }).catch(() => []);
  return annots.map((a: any) => fieldFromAnnotation(a, pageIndex)).filter(Boolean) as PdfField[];
}

export async function runsOf(pdfPage: any): Promise<TextRun[]> {
  const tc = await pdfPage.getTextContent().catch(() => ({ items: [] }));
  return (tc.items as any[]).filter(i => typeof i.str === 'string' && i.str.length).map(i => ({
    str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.hypot(i.transform[2], i.transform[3]),
  }));
}

