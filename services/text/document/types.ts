// document/types — the paginated document model on top of the text model.
//
// A `WriterDocument` is a body `TextStory` plus everything a word processor keeps beside it:
// sections with their own page setup (size, orientation, margins, columns, header/footer
// stories, page numbering), notes, comments, media, floating objects, list definitions and
// review settings. Everything that marks a RANGE of text (comments, revisions, bookmarks, note
// references, fields) lives in the text itself as character marks (see `CharAttrs` in
// ../model), so ranges ride along with every edit without re-anchoring. Everything here is
// plain JSON: Firestore-safe (no nested arrays, ids as record keys) and CRDT-friendly (stable
// paragraph ids, records keyed by id).
//
// Shared by Tela Writer today and by Layout and Storybook next: `PageSetup` and the section
// chain are the page/frame-chain model, `layoutDocument` (./paginate) the paginator.

import type { StyleSheet, TextStory } from '../model';

/** Page sizes in px at 96 dpi, portrait. */
export const PAGE_SIZES = {
  letter: { width: 816, height: 1056, label: 'Letter', detail: '8.5 × 11 in' },
  legal: { width: 816, height: 1344, label: 'Legal', detail: '8.5 × 14 in' },
  tabloid: { width: 1056, height: 1632, label: 'Tabloid', detail: '11 × 17 in' },
  executive: { width: 696, height: 1008, label: 'Executive', detail: '7.25 × 10.5 in' },
  a3: { width: 1122.52, height: 1587.4, label: 'A3', detail: '297 × 420 mm' },
  a4: { width: 793.7, height: 1122.52, label: 'A4', detail: '210 × 297 mm' },
  a5: { width: 559.37, height: 793.7, label: 'A5', detail: '148 × 210 mm' },
  b5: { width: 665.2, height: 944.88, label: 'B5 (JIS)', detail: '182 × 257 mm' },
} as const;
export type PageSizeName = keyof typeof PAGE_SIZES | 'custom';

export const INCH = 96;
export const PT = 96 / 72;
export const MM = 96 / 25.4;

export type NumberFormat = 'decimal' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha';

export interface PageMargins {
  top: number; right: number; bottom: number; left: number;
  /** Distance from the page edge to the header / footer. */
  header: number; footer: number;
  /** Binding gutter added to the left margin. */
  gutter: number;
}

export interface PageSetup {
  /** Actual page dimensions (already oriented), px. */
  width: number;
  height: number;
  size: PageSizeName;
  orientation: 'portrait' | 'landscape';
  margins: PageMargins;
  columns: { count: number; gap: number; widths?: number[]; separator?: boolean };
  /** Different first page header/footer. */
  titlePage?: boolean;
  pageNumbers?: { format?: NumberFormat; start?: number };
  /** Vertical alignment of the body on the page. */
  vAlign?: 'top' | 'center' | 'bottom';
}

export type HeaderFooterKind = 'default' | 'first' | 'even';

export interface DocSection {
  id: string;
  /** First body paragraph of this section (absent for the first section). If that paragraph is
   *  deleted the section merges into the previous one. */
  startParagraphId?: string;
  break: 'nextPage' | 'continuous' | 'evenPage' | 'oddPage';
  setup: PageSetup;
  /** Story ids in `headerFooters`. A missing kind is linked to the previous section (Word). */
  headers?: Partial<Record<HeaderFooterKind, string>>;
  footers?: Partial<Record<HeaderFooterKind, string>>;
}

export interface WriterNote { id: string; kind: 'footnote' | 'endnote'; story: TextStory }

export interface WriterCommentReply { id: string; author: string; authorId?: string; date: number; text: string }
export interface WriterComment {
  id: string;
  author: string;
  authorId?: string;
  date: number;
  text: string;
  replies: WriterCommentReply[];
  resolved?: boolean;
  /** The quoted text when the comment was made (kept if the anchor text is deleted). */
  quote?: string;
}

export interface WriterMedia { id: string; src: string; width: number; height: number; alt?: string; mime?: string; storagePath?: string }

export type WrapMode = 'square' | 'tight' | 'topBottom' | 'behind' | 'front';
export interface WriterFloat {
  id: string;
  mediaId: string;
  /** Paragraph the object is anchored to: it lands on that paragraph's page. */
  anchorParagraphId: string;
  relativeTo: 'margin' | 'page';
  x: number;
  y: number;
  width: number;
  height: number;
  wrap: WrapMode;
  /** Standoff, px. */
  distance?: number;
  side?: 'both' | 'left' | 'right' | 'largest';
}

/** A multilevel list definition (Word numbering): one entry per level (1-based level n → levels[n-1]). */
export interface ListLevel {
  format: NumberFormat | 'bullet' | 'none';
  /** `%1`…`%9` are the counters of levels 1…9 in their own formats ("%1.%2." → "2.3."). */
  template?: string;
  bullet?: string;
  /** Text indent of the level, px (the marker hangs left of it). */
  indent: number;
  hanging: number;
  start?: number;
}
export interface ListDefinition { id: string; name?: string; levels: ListLevel[] }

export interface WriterSettings {
  trackChanges?: boolean;
  /** How revisions show. all = inline markup; simple = final text with change bars; none = final; original = before changes. */
  markup?: 'all' | 'simple' | 'none' | 'original';
  /** Different odd and even page headers (document-wide, like Word). */
  oddEvenHeaders?: boolean;
  footnoteFormat?: NumberFormat;
  endnoteFormat?: NumberFormat;
  spellcheck?: boolean;
  language?: string;
  /** Show formatting marks (¶, ·, →). */
  showMarks?: boolean;
}

export interface WriterDocumentParts {
  version: 1;
  styles: StyleSheet;
  sections: DocSection[];
  headerFooters: Record<string, TextStory>;
  notes: Record<string, WriterNote>;
  comments: Record<string, WriterComment>;
  media: Record<string, WriterMedia>;
  floats: Record<string, WriterFloat>;
  lists: Record<string, ListDefinition>;
  settings: WriterSettings;
  /** Signature of the legacy `blocks` this story was last synchronised with. */
  blocksHash?: string;
  /** Document properties (docx core.xml). */
  properties?: { title?: string; subject?: string; creator?: string; description?: string; keywords?: string };
}

export interface WriterDocument extends WriterDocumentParts { story: TextStory }

/** Where an edit or a caret lives: the body, a table cell, a note, or a header/footer story. */
export type StoryTarget =
  | { kind: 'body' }
  | { kind: 'cell'; tableId: string; rowId: string; cellId: string }
  | { kind: 'note'; id: string }
  | { kind: 'headerFooter'; id: string };

export const BODY: StoryTarget = { kind: 'body' };
export function targetKey(t: StoryTarget): string {
  switch (t.kind) {
    case 'body': return 'body';
    case 'cell': return `cell:${t.tableId}:${t.rowId}:${t.cellId}`;
    case 'note': return `note:${t.id}`;
    case 'headerFooter': return `hf:${t.id}`;
  }
}
export function sameTarget(a: StoryTarget, b: StoryTarget): boolean { return targetKey(a) === targetKey(b); }
