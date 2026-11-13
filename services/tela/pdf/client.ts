/**
 * Tela PDF — browser side: pdf.js loading, reading fields and text runs off pages, and syncing the
 * Smart Fill profile. The profile lives in the cloud (pdfFillProfiles/{uid}); localStorage is only an
 * offline buffer and the copy used when signed out (the panel says so).
 */

import { auth } from '../../firebase';
import { emptyFillProfile, mergeFillProfiles, sanitizeFillProfile, type FillProfile, type MapRequest, type PdfField, type TextRun } from './smartFill';

let pdfjsPromise: Promise<any> | null = null;
export function loadPdfjs(): Promise<any> {
  return pdfjsPromise ??= import('pdfjs-dist').then((pdfjs: any) => {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    return pdfjs;
  });
}

export { fieldFromAnnotation, fieldsOf, runsOf } from './pdfjsAdapters';

// ─── Profile sync ─────────────────────────────────────────────────────────────

const LOCAL = 'tela.pdfFillProfile.v1';
const readLocal = (): FillProfile => { try { const raw = localStorage.getItem(LOCAL); return raw ? sanitizeFillProfile(JSON.parse(raw)) : emptyFillProfile(); } catch { return emptyFillProfile(); } };
const writeLocal = (p: FillProfile) => { try { localStorage.setItem(LOCAL, JSON.stringify(p)); } catch { /* private mode: cloud copy still holds it */ } };

async function token(): Promise<string | null> { try { return auth.currentUser ? await auth.currentUser.getIdToken() : null; } catch { return null; } }
export const signedIn = () => !!auth.currentUser;

/** Freshest copy: the cloud when signed in (merged with any offline edits), else this device. */
export async function loadFillProfile(): Promise<{ profile: FillProfile; synced: boolean }> {
  const local = readLocal(); const t = await token();
  if (!t) return { profile: local, synced: false };
  try {
    const r = await fetch('/api/tela/pdf/profile', { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error(String(r.status));
    const cloud = sanitizeFillProfile((await r.json()).profile);
    const merged = mergeFillProfiles(cloud, local);
    // Offline edits newer than the cloud go up now.
    if (local.updatedAt > cloud.updatedAt) void saveFillProfile(merged);
    writeLocal(merged);
    return { profile: merged, synced: true };
  } catch { return { profile: local, synced: false }; }
}

/** replace=true when the person removed answers, so the cloud copy doesn't merge them back. */
export async function saveFillProfile(p: FillProfile, replace = false): Promise<{ profile: FillProfile; synced: boolean }> {
  const next = sanitizeFillProfile({ ...p, updatedAt: Date.now() });
  writeLocal(next);
  const t = await token(); if (!t) return { profile: next, synced: false };
  try {
    const r = await fetch('/api/tela/pdf/profile', { method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: next, replace }) });
    if (!r.ok) throw new Error(String(r.status));
    const saved = sanitizeFillProfile((await r.json()).profile); writeLocal(saved);
    return { profile: saved, synced: true };
  } catch { return { profile: next, synced: false }; }
}

export async function aiMapFields(req: MapRequest): Promise<{ map: Record<string, string>; error?: string }> {
  const t = await token(); if (!t) return { map: {}, error: 'Sign in so Aria can help with unclear fields.' };
  if (!req.fields.length) return { map: {} };
  try {
    const r = await fetch('/api/tela/pdf/map', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { map: j.map ?? {} } : { map: {}, error: j.error || `Aria answered ${r.status}` };
  } catch { return { map: {}, error: 'Aria is offline right now.' }; }
}

export async function askPdf(question: string, pages: string[], title: string): Promise<{ answer?: string; error?: string; truncated?: boolean }> {
  const t = await token(); if (!t) return { error: 'Sign in to ask about this PDF.' };
  try {
    const r = await fetch('/api/tela/pdf/ask', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ question, pages, title, consent: true }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { answer: j.answer, truncated: j.truncated } : { error: j.error || `The assistant answered ${r.status}` };
  } catch { return { error: 'The assistant is offline right now.' }; }
}

/** Recognise text on a scanned page with tesseract.js (on device). Returns runs in PDF space. */
export async function ocrPage(canvas: HTMLCanvasElement, pageHeightPt: number, scale: number, onProgress?: (p: number) => void): Promise<TextRun[]> {
  const { createWorker } = await import('tesseract.js');
  const worker: any = await createWorker('eng', 1, { logger: (m: any) => { if (m?.status === 'recognizing text') onProgress?.(m.progress); } });
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const words: any[] = (data.blocks ?? []).flatMap((b: any) => (b.paragraphs ?? []).flatMap((p: any) => (p.lines ?? []).flatMap((l: any) => l.words ?? [])));
    return words.filter(w => w.text?.trim() && w.confidence > 40).map(w => ({
      str: w.text, x: w.bbox.x0 / scale, y: pageHeightPt - w.bbox.y1 / scale, w: (w.bbox.x1 - w.bbox.x0) / scale, h: (w.bbox.y1 - w.bbox.y0) / scale,
    }));
  } finally { await worker.terminate(); }
}

/**
 * Encrypted PDFs (often "permissions only", no open password) can't be rewritten by pdf-lib. pdf.js can
 * save them itself, re-encrypting what it writes, but only form values — markup needs an unencrypted copy.
 */
export async function saveFormWithPdfjs(pdf: any, fields: PdfField[], values: Record<string, string | boolean>, names: Iterable<string>): Promise<Uint8Array> {
  const want = new Set(names);
  for (const f of fields) {
    if (!f.annotId || !want.has(f.name)) continue;
    const v = values[f.name];
    if (f.type === 'checkbox') pdf.annotationStorage.setValue(f.annotId, { value: v === true });
    else if (f.type === 'radio') pdf.annotationStorage.setValue(f.annotId, { value: !!f.exportValue && v === f.exportValue });
    else if (f.type === 'text' || f.type === 'dropdown' || f.type === 'list') pdf.annotationStorage.setValue(f.annotId, { value: typeof v === 'string' ? v : '' });
  }
  return pdf.saveDocument();
}
