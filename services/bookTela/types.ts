// Book <-> Tela upgrade: shared types. PURE (no React / Firebase) so everything here runs under node --test.
//
// Model in one paragraph: a book is a BookSource (chapters of HTML-lite). "Upgrading" projects it into a
// TelaDoc (bookToTelaDoc) and from then on the Tela doc is the single source of truth for TEXT; the book's
// chapters are a projection (telaDocToBook) used by the classic reader, search, POD and the submission flow.
// Tela-only extras ("enhancements") live in a BookTelaUpgrade record next to the doc and each one declares
// how it degrades when the book is exported to open formats (EPUB / PDF / Markdown / HTML).

import type { BookMetadata, Contributor } from '../bookmeta/types';

export interface BookSourceChapter {
  id: string;
  title: string;
  /** HTML-lite body WITHOUT the chapter's own title heading (see normalizeChapterHtml). */
  html: string;
  kind?: 'chapter' | 'front' | 'back' | 'toc';
  included?: boolean;
  /** Optional per-chapter narration track (BookChapter.audioUrl). */
  audioUrl?: string;
}

export interface BookSource {
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  contributors?: Contributor[];
  language: string;
  description?: string;
  coverUrl?: string;
  coverAlt?: string;
  chapters: BookSourceChapter[];
  /** Full submission metadata when the book came through bookmeta (ISBN, a11y summary, rights ...). */
  metadata?: Partial<BookMetadata>;
  ownerId?: string;
  /** Visual-led hint (graphic novel / picture book / zine). */
  visualLed?: boolean;
}

// ── Enhancements ─────────────────────────────────────────────────────────────

export type EnhancementType =
  | 'AUDIO_SYNC' | 'VIDEO' | 'MOTION' | 'INTERACTIVE_3D' | 'CHART' | 'ILLUSTRATED_OPENER'
  | 'ANIMATED_DROPCAP' | 'READER_NOTE' | 'GLOSSARY' | 'BRANCHING' | 'LIVE_DATA' | 'COMMENTARY';

/** How an enhancement survives export. */
export type FallbackStrategy =
  | 'static-snapshot'   // render the Tela frame/object to SVG/PNG, with alt text
  | 'alt-text'          // image with real alt text, no moving part
  | 'plain-text'        // text/table rendering of the content
  | 'footnote'          // EPUB 3 noteref / endnote
  | 'qr-link'           // QR code + URL to the on-platform interactive version
  | 'internal-links'    // choices become in-book hyperlinks
  | 'omit-note';        // dropped; a note in the export report (and colophon) says so

export type Fidelity = 'FULL' | 'DEGRADED' | 'OMITTED';

export interface EnhancementInstance {
  id: string;
  type: EnhancementType;
  chapterId: string;
  /** Text-level / frame-level anchor: the Tela block this follows (undefined = end of chapter, 'start' = top). */
  afterBlockId?: string | 'start';
  /** Author-facing label, also used for alt text when no better one is given. */
  label?: string;
  /** Required for anything visual: becomes alt text in every export. */
  alt?: string;
  /** Per-type configuration (see enhancements.ts for each shape). */
  config: Record<string, any>;
  /** Author override of the registry default. */
  fallbackOverride?: FallbackStrategy;
}

export type ExportFormat = 'EPUB_REFLOW' | 'EPUB_FIXED' | 'PDF_SCREEN' | 'PDF_PRINT' | 'MARKDOWN' | 'HTML';

export interface FidelityEntry {
  fidelity: Fidelity;
  /** What the reader of the exported file gets instead. Empty for FULL. */
  changes: string[];
  enhancementIds: string[];
}

export interface PageFidelity {
  frameId: string;
  label: string;
  chapterId?: string;
  fidelity: Fidelity;
  changes: string[];
  enhancementIds: string[];
}

// ── Upgrade record ───────────────────────────────────────────────────────────

export interface BookTelaUpgrade {
  schemaVersion: 1;
  bookId: string;
  /** Tela doc holding the upgraded book. */
  docId: string;
  upgradedAt: number;
  /** Verbatim copy of the chapters BEFORE the upgrade; Revert restores exactly this. */
  originalChapters: BookSourceChapter[];
  enhancements: EnhancementInstance[];
  /** Chosen template (publication gallery) for chapter openers, if any. */
  openerTemplateId?: string;
  /** Visual-led books default to fixed-layout EPUB; the author can override. */
  layoutPreference?: 'AUTO' | 'REFLOW' | 'FIXED';
  /** Last published Tela version (readers who bought pin to a version, see readerMode). */
  publishedVersionId?: string;
  /** Dropped on revert; kept so the UI can show "reverted at". */
  revertedAt?: number;
}

export interface UpgradeOptions {
  docId?: string;
  ownerId?: string;
  now?: number;
  enhancements?: EnhancementInstance[];
  template?: import('../journalist/articleTela').TemplateLike | null;
}
