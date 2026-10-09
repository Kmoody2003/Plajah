// Export orchestrator: one entry point for EPUB (reflowable / fixed), PDF (screen / print), Markdown and HTML.
// Works the same for upgraded books (Tela doc + enhancements) and plain books (doc derived on the fly, no extras).

import type { TelaDoc } from '../../../types';
import { bookToTelaDoc } from '../bookToTela';
import { buildExportModel, fidelitySummary, pageFidelity, type ExportModel } from '../model';
import type { BookSource, BookTelaUpgrade, ExportFormat, PageFidelity } from '../types';
import { buildEpub, type EpubResult } from './epub';
import { buildPdf, type PdfOptions, type PdfResult } from './pdf';
import { buildHtmlBundle, buildMarkdown } from './plain';
import { recommendLayout, type ExportOptions, type ExportReport, type Sidecar } from './common';
import type { RightsDecision } from './rights';
import type { Finding } from '../../bookmeta/types';

export * from './common';
export { decideExportRights } from './rights';

export interface ExportInput {
  book: BookSource;
  /** Tela doc (live or a pinned version's bundle). Omit for a plain book: derived from the chapters. */
  doc?: TelaDoc | null;
  upgrade?: Pick<BookTelaUpgrade, 'enhancements'> | null;
  format: ExportFormat;
  options?: ExportOptions & Partial<Pick<PdfOptions, 'trimId' | 'printer' | 'binding' | 'fontLoader' | 'rasterize'>>;
  /** Result of decideExportRights(); a denied decision blocks the export. */
  rights?: RightsDecision;
}

export interface ExportFile { name: string; mime: string; bytes: Uint8Array }
export interface ExportOutcome {
  ok: boolean;
  /** Set when the export was refused or the validator found errors. */
  blockedReason?: string;
  files: ExportFile[];
  report?: ExportReport;
  findings: Finding[];
  sidecar?: Sidecar;
  recommendedLayout?: { layout: 'REFLOW' | 'FIXED'; reason: string };
}

export function prepare(input: Pick<ExportInput, 'book' | 'doc' | 'upgrade'>, format: ExportFormat, o: ExportOptions = {}): { doc: TelaDoc; model: ExportModel } {
  const enhancements = input.upgrade?.enhancements ?? [];
  const doc = input.doc ?? bookToTelaDoc(input.book, { enhancements });
  const model = buildExportModel({ doc, book: input.book, upgrade: input.upgrade ?? null }, { format, platformBase: o.platformBase, includeCommentary: o.includeCommentary, exportedAt: (o.now ?? new Date()).toISOString() });
  return { doc, model };
}

/** Live "Export fidelity" data for the editor badge, without building any file. */
export function fidelityFor(input: Pick<ExportInput, 'book' | 'doc' | 'upgrade'>, format: ExportFormat): { pages: PageFidelity[]; summary: ReturnType<typeof fidelitySummary>; readerOnly: string[]; recommended: { layout: 'REFLOW' | 'FIXED'; reason: string } } {
  const { doc, model } = prepare(input, format);
  const pages = pageFidelity(doc, input.upgrade ?? null, format);
  return { pages, summary: fidelitySummary(pages), readerOnly: model.readerOnly ?? [], recommended: recommendLayout(model) };
}

export async function exportBook(input: ExportInput): Promise<ExportOutcome> {
  if (input.rights && !input.rights.allowed) return { ok: false, blockedReason: input.rights.reason || 'Export is not allowed.', files: [], findings: [] };
  if (input.rights && !input.rights.formats.includes(input.format)) return { ok: false, blockedReason: 'This format is not available for your access level.', files: [], findings: [] };
  const o: ExportOptions = { ...(input.options ?? {}), ...(input.rights?.watermarkTag ? { watermarkTag: input.rights.watermarkTag } : {}) };
  const { model } = prepare(input, input.format, o);
  const rec = recommendLayout(model);
  const sidecarFile = (s: Sidecar): ExportFile => ({ name: 'plajah-export.json', mime: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(s, null, 2)) });

  switch (input.format) {
    case 'EPUB_REFLOW': case 'EPUB_FIXED': {
      const r: EpubResult = await buildEpub(input.book, model, { ...o, layout: input.format === 'EPUB_FIXED' ? 'FIXED' : 'REFLOW' });
      const errs = r.findings.filter(f => f.severity === 'error');
      return { ok: r.ok, blockedReason: errs.length ? `The EPUB failed validation (${errs.length} error${errs.length > 1 ? 's' : ''}). Nothing was downloaded.` : undefined,
        files: r.ok ? [{ name: r.fileName, mime: 'application/epub+zip', bytes: r.bytes }, sidecarFile(r.sidecar)] : [], report: r.report, findings: r.findings, sidecar: r.sidecar, recommendedLayout: rec };
    }
    case 'PDF_SCREEN': case 'PDF_PRINT': {
      const r: PdfResult = await buildPdf(input.book, model, { ...o, mode: input.format === 'PDF_PRINT' ? 'print' : 'screen' });
      return { ok: r.ok, files: [{ name: r.fileName, mime: 'application/pdf', bytes: r.bytes }, sidecarFile(r.sidecar)], report: r.report, findings: [], sidecar: r.sidecar, recommendedLayout: rec };
    }
    case 'MARKDOWN': { const r = await buildMarkdown(input.book, model, o); return { ok: true, files: [{ name: r.fileName, mime: 'application/zip', bytes: r.bytes }], report: r.report, findings: [], sidecar: r.sidecar, recommendedLayout: rec }; }
    case 'HTML': { const r = await buildHtmlBundle(input.book, model, o); return { ok: true, files: [{ name: r.fileName, mime: 'application/zip', bytes: r.bytes }], report: r.report, findings: [], sidecar: r.sidecar, recommendedLayout: rec }; }
  }
}

/** Browser helper: save an outcome's files. No-op in node. */
export function downloadFiles(files: ExportFile[]): void {
  if (typeof document === 'undefined') return;
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime }));
    const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
