// Shared types for the independent-author ebook submission flow (components/bookSubmit/*).
// Pure data only — no Firebase / React imports — so preflight, export and the tests stay node-runnable.

export type BookFormatId = 'NOVEL' | 'SERIAL' | 'GRAPHIC_NOVEL' | 'NON_FICTION' | 'TEXTBOOK' | 'ZINE';
export type SubmissionStatus = 'DRAFT' | 'IN_REVIEW' | 'LIVE' | 'REJECTED';

export type ContributorRole = 'author' | 'editor' | 'translator' | 'illustrator' | 'narrator' | 'foreword' | 'cover_designer';
export interface Contributor { name: string; role: ContributorRole; }

export type Severity = 'error' | 'warning' | 'info';
export interface Finding {
  /** Stable machine id, e.g. 'cover.too_small'. */
  code: string;
  severity: Severity;
  /** Which wizard step can fix it. */
  area: 'manuscript' | 'cover' | 'metadata' | 'rights' | 'pricing' | 'epub' | 'accessibility';
  message: string;
  /** Concrete fix-it suggestion. */
  fix?: string;
  /** Which store this mirrors, for the docs / tooltips. */
  mirrors?: string;
}

export interface ManuscriptChapter {
  id: string;
  title: string;
  /** HTML-lite (p, h1-h6, em, strong, br, blockquote, ul/ol/li, hr). Kept OUT of the Firestore doc — see drafts.ts. */
  html: string;
  text: string;
  wordCount: number;
  /** Front/back matter (title page, copyright, TOC, acknowledgements) — not counted as a story chapter. */
  kind?: 'chapter' | 'front' | 'back' | 'toc';
  included: boolean;
  /** True when WE guessed the boundary (no headings found) — author should review. */
  autoSplit?: boolean;
}

export interface CoverInfo {
  url?: string;
  storagePath?: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  fileName?: string;
}

export type AiDisclosure = 'none' | 'assisted' | 'generated';
export type LicenseChoice = 'ARR' | 'CC-BY' | 'CC-BY-SA' | 'CC-BY-NC' | 'CC-BY-NC-SA' | 'CC-BY-ND' | 'CC-BY-NC-ND' | 'CC0' | 'PD';

export interface BookMetadata {
  title: string;
  subtitle: string;
  seriesName: string;
  seriesNumber: string;
  edition: string;
  language: string;               // BCP-47 / ISO 639-1, e.g. 'en'
  penName: string;
  contributors: Contributor[];
  description: string;            // HTML-lite, 4000 chars max (Ingram's limit)
  keywords: string[];             // max 7
  bisac: string[];                // max 3
  thema: string[];
  genre: string;
  audience: { minAge: number | null; maxAge: number | null; adult: boolean };
  contentWarnings: string[];
  matureContent: boolean;
  publicationDate: string;        // YYYY-MM-DD
  /** Creator's choice for the announcement posted at release time (optional; default = announce with platform wording). */
  releaseAnnouncement?: { enabled?: boolean; message?: string };
  originalPublicationDate: string;
  publicDomain: boolean;
  publicDomainNote: string;
  isbn: { mode: 'none' | 'own' | 'platform'; value: string; ark?: string };
  copyrightHolder: string;
  copyrightYear: string;
  territories: { worldwide: boolean; countries: string[] };
  ai: { text: AiDisclosure; images: AiDisclosure; translation: AiDisclosure; tools: string };
  license: LicenseChoice;
  accessibility: { altTextDeclared: boolean; summary: string };
  includeGeneratedCopyrightPage: boolean;
}

export interface BookPricing {
  model: 'FREE' | 'PAID';
  prices: Record<string, number>;       // currency -> list price in major units
  freeSamplePct: number;                 // 0..50
  freeFirstChapters: number;
  preorder: { enabled: boolean; date: string };
  promo: { enabled: boolean; code: string; pct: number; endsAt: string };
  bundle: { enabled: boolean; discountPct: number };
  delivery: 'DOWNLOAD_OPEN' | 'PLAJAH_ONLY';
  watermark: boolean;
}

export interface BookDraft {
  id: string;
  ownerId: string;
  format: BookFormatId;
  step: string;
  createdAt: number;
  updatedAt: number;
  manuscript: {
    fileName: string;
    ext: string;
    sizeBytes: number;
    storagePath?: string;
    source: 'epub' | 'docx' | 'pdf' | 'md' | 'txt' | 'blank';
    chapters: ManuscriptChapter[];
  } | null;
  cover: CoverInfo | null;
  metadata: BookMetadata;
  pricing: BookPricing;
  /** EPUB structural findings when the manuscript was an .epub. */
  epubFindings: Finding[];
  accessibilityScore: number | null;
  /** Raw signals for the accessibility score (from the EPUB, when there is one). */
  a11yBase?: { imageCount: number; imagesWithAlt: number; features: string[]; summary?: string; hasNav: boolean };
  acks: { contentPolicy: boolean; rights: boolean };
}

export const MAX_DESCRIPTION = 4000;
export const MAX_KEYWORDS = 7;
export const MAX_BISAC = 3;
