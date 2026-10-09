// Shared export plumbing: metadata, asset resolution, QR, colophon, sidecar, layout recommendation, report.

import QRCode from 'qrcode';
import type { Contributor } from '../../bookmeta/types';
import { checkIsbn } from '../../bookmeta/isbn';
import type { BookSource, ExportFormat, Fidelity, PageFidelity } from '../types';
import { fidelitySummary, READER_ONLY_NOTES, type ExportModel, type OmittedItem, type XItem } from '../model';
import { esc } from '../html';
import { utf8 } from './zip';

export const PLAJAH_NS = 'https://plajah.com/ns/book#';

// ── options ──────────────────────────────────────────────────────────────────

export interface ResolvedAsset { bytes: Uint8Array; mime: string }
export type AssetResolver = (url: string) => Promise<ResolvedAsset | null>;

/** A font the caller wants embedded. Embedding is refused unless the licence allows it (see FONT_LICENSE_OK). */
export interface EmbedFont { family: string; license: string; weight: 400 | 700; style: 'normal' | 'italic'; ext: 'woff' | 'woff2' | 'ttf' | 'otf'; bytes: Uint8Array }

export const FONT_LICENSE_OK = /^(OFL(-1\.1)?|SIL OFL( 1\.1)?|Apache-2\.0|MIT|CC0(-1\.0)?|Public Domain|Ubuntu Font Licence 1\.0)$/i;
export const isFontLicenseSafe = (license: string): boolean => FONT_LICENSE_OK.test((license || '').trim());

export interface ExportOptions {
  /** Add the "Exported from Plajah" page. Authors may turn it off. */
  includeColophon?: boolean;
  includeCommentary?: boolean;
  platformBase?: string;
  resolveAsset?: AssetResolver;
  fonts?: EmbedFont[];
  now?: Date;
  /** Reflowable vs fixed-layout EPUB. 'AUTO' uses recommendLayout(). */
  layout?: 'AUTO' | 'REFLOW' | 'FIXED';
  fixedSize?: { width: number; height: number };
  /** Forensic tag for buyer copies (watermarkTagFor). Written to metadata, never into the visible text. */
  watermarkTag?: string;
  publisher?: string;
  /** Tela version the export was taken from (shown in the sidecar). */
  sourceVersionId?: string;
}

export interface ExportMeta {
  title: string; subtitle?: string; authors: string[]; contributors: Contributor[]; language: string;
  publisher?: string; date: string; isbn13?: string; identifier: string; description?: string; keywords: string[];
  rights?: string; license?: string; a11ySummary?: string; series?: { name: string; number?: string };
}

const hash32 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Deterministic UUID-shaped id (not a real v4/v5): the same book always exports with the same identifier. */
export function stableUuid(seed: string): string {
  const parts = [hash32(seed), hash32(seed + '|a'), hash32(seed + '|b'), hash32(seed + '|c')].map(n => n.toString(16).padStart(8, '0')).join('');
  return `${parts.slice(0, 8)}-${parts.slice(8, 12)}-4${parts.slice(13, 16)}-a${parts.slice(17, 20)}-${parts.slice(20, 32)}`;
}

export function buildExportMeta(book: BookSource, o: { now?: Date; publisher?: string } = {}): ExportMeta {
  const m = book.metadata || {};
  const now = o.now ?? new Date();
  const isbn = checkIsbn(m.isbn?.mode === 'own' ? m.isbn.value : '');
  const authors = book.authors.length ? book.authors : (m.penName ? [m.penName] : []);
  const rights = m.copyrightHolder && !m.publicDomain ? `© ${m.copyrightYear || now.getUTCFullYear()} ${m.copyrightHolder}` : m.publicDomain ? 'Public domain' : undefined;
  return {
    title: m.title || book.title, subtitle: m.subtitle || book.subtitle, authors, contributors: book.contributors || m.contributors || [],
    language: m.language || book.language || 'en', publisher: o.publisher || m.penName || authors[0], date: (m.publicationDate || now.toISOString().slice(0, 10)).slice(0, 10),
    isbn13: isbn.valid ? isbn.isbn13 : undefined, identifier: isbn.valid && isbn.isbn13 ? `urn:isbn:${isbn.isbn13}` : `urn:uuid:${stableUuid(book.id)}`,
    description: m.description || book.description, keywords: m.keywords || [], rights, license: m.license,
    a11ySummary: m.accessibility?.summary?.trim() || undefined, series: m.seriesName ? { name: m.seriesName, number: m.seriesNumber } : undefined,
  };
}

// ── assets ───────────────────────────────────────────────────────────────────

export const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

export function sniffMime(bytes: Uint8Array, hint = ''): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'image/webp';
  const head = new TextDecoder().decode(bytes.subarray(0, 300)).toLowerCase();
  if (head.includes('<svg')) return 'image/svg+xml';
  return MIME_EXT[hint] ? hint : '';
}

export function decodeDataUrl(url: string): ResolvedAsset | null {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(url);
  if (!m) return null;
  try {
    const bytes = m[2] ? Uint8Array.from(atob(m[3]), c => c.charCodeAt(0)) : utf8(decodeURIComponent(m[3]));
    return { bytes, mime: sniffMime(bytes, m[1]) || m[1] };
  } catch { return null; }
}

/** Default resolver: data: URLs inline, everything else through fetch (browser). Returns null on any failure. */
export const defaultResolver: AssetResolver = async url => {
  if (!url) return null;
  if (url.startsWith('data:')) return decodeDataUrl(url);
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    return { bytes, mime: sniffMime(bytes, (r.headers.get('content-type') || '').split(';')[0]) };
  } catch { return null; }
};

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
}

// ── layout recommendation ────────────────────────────────────────────────────

export function recommendLayout(model: ExportModel): { layout: 'REFLOW' | 'FIXED'; reason: string } {
  let figures = 0, text = 0;
  for (const c of model.chapters) for (const it of c.items) { if (it.t === 'figure') figures++; else if (it.t === 'block') text++; }
  if (model.visualLed) return { layout: 'FIXED', reason: 'This looks like a picture-led book (pictures about as common as paragraphs). Fixed layout keeps each page as designed.' };
  if (figures > 0 && figures * 3 >= text) return { layout: 'FIXED', reason: 'Many pictures relative to text. Fixed layout keeps pages as designed; readers lose resizable text.' };
  return { layout: 'REFLOW', reason: 'Text-led. Reflowable EPUB lets readers resize text and use screen readers fully.' };
}

// ── colophon / sidecar / report ──────────────────────────────────────────────

export interface ColophonLine { text: string }

/** The "Exported from Plajah" page copy (also reused as plain text by PDF / Markdown). */
export function colophonParagraphs(model: ExportModel, meta: ExportMeta, fid: ReturnType<typeof fidelitySummary>): string[] {
  const out = [
    `${meta.title}${meta.authors.length ? ` by ${meta.authors.join(', ')}` : ''} was exported from Plajah on ${model.exportedAt.slice(0, 10)}.`,
    `This is a DRM-free file in an open format. You may keep it, copy it to any device and read it with any compatible reader.`,
  ];
  if (fid.degraded || fid.omitted) out.push(`The online edition of this book has interactive features (such as audio, motion, 3D, live data or reader popovers) that a static file cannot carry. Where they appear, this file shows a still, a table or a note instead, with a link to the online version: ${model.platformUrl}`);
  if (model.omitted.length) out.push(`Left out of this file: ${model.omitted.map(o => o.label).join('; ')}.`);
  return out;
}

export interface ExportReport {
  format: ExportFormat;
  generatedAt: string;
  fidelity: PageFidelity[];
  summary: ReturnType<typeof fidelitySummary>;
  omitted: OmittedItem[];
  /** Missing/failed images that were replaced by their alt text. */
  missingAssets: string[];
  warnings: string[];
  /** Reader-only features that never export (page-turn animations). */
  readerOnly: string[];
}

export function newReport(format: ExportFormat, model: ExportModel): ExportReport {
  return { format, generatedAt: model.exportedAt, fidelity: model.fidelity, summary: fidelitySummary(model.fidelity), omitted: model.omitted, missingAssets: [], warnings: [], readerOnly: model.readerOnly?.length ? [...READER_ONLY_NOTES, ...model.readerOnly] : READER_ONLY_NOTES };
}

export interface Sidecar {
  schema: 'plajah.export/1';
  exportedFrom: 'Plajah';
  bookId: string; title: string; authors: string[]; language: string; identifier: string; isbn13?: string;
  format: ExportFormat; exportedAt: string; drm: 'none';
  platformUrl: string; sourceVersionId?: string;
  watermarkTag?: string;
  license?: string; rights?: string;
  fidelity: { overall: Fidelity; full: number; degraded: number; omitted: number };
  omitted: { id: string; label: string; reason: string }[];
  degraded: { page: string; changes: string[] }[];
  a11y: { summary?: string; features: string[] };
}

export function buildSidecar(book: BookSource, model: ExportModel, meta: ExportMeta, format: ExportFormat, o: ExportOptions, features: string[] = []): Sidecar {
  const s = fidelitySummary(model.fidelity);
  return {
    schema: 'plajah.export/1', exportedFrom: 'Plajah', bookId: book.id, title: meta.title, authors: meta.authors, language: meta.language, identifier: meta.identifier,
    ...(meta.isbn13 ? { isbn13: meta.isbn13 } : {}), format, exportedAt: model.exportedAt, drm: 'none', platformUrl: model.platformUrl,
    ...(o.sourceVersionId ? { sourceVersionId: o.sourceVersionId } : {}), ...(o.watermarkTag ? { watermarkTag: o.watermarkTag } : {}),
    ...(meta.license ? { license: meta.license } : {}), ...(meta.rights ? { rights: meta.rights } : {}),
    fidelity: { overall: s.overall, full: s.full, degraded: s.degraded, omitted: s.omitted },
    omitted: model.omitted.map(x => ({ id: x.id, label: x.label, reason: x.reason })),
    degraded: model.fidelity.filter(p => p.fidelity !== 'FULL').map(p => ({ page: p.label, changes: p.changes })),
    a11y: { summary: meta.a11ySummary, features },
  };
}

/** Pre-render every QR item to SVG once. Keyed by URL. */
export async function collectQr(model: ExportModel): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const c of model.chapters) for (const it of c.items) if (it.t === 'qr' && !m.has(it.url)) m.set(it.url, await qrSvg(it.url));
  return m;
}

export const itemsOf = (model: ExportModel): XItem[] => model.chapters.flatMap(c => c.items);

/** Replace [[n:key]] markers: per-chapter numbering by order of appearance. */
export function numberNotes(html: string, order: Map<string, number>): string {
  return html.replace(/\[\[n:([\w-]+)\]\]/g, (_m, key: string) => `[[N${order.get(key) ?? 0}:${key}]]`);
}

export const attr = esc;
