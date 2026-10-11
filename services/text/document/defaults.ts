// document/defaults — Word-class defaults: the style gallery, page setup, list definitions and
// constructors for new documents and sections.
//
// Style ids keep the text model's existing ids (body, title, h1…, quote, caption, list,
// list-number, code) so Tela blocks, clipboard HTML and docx all map onto the same names; Word's
// built-in names (Normal, Heading 1…) are the display names and the docx styleIds.

import { type CharAttrs, type ParagraphStyle, type StyleSheet, type TextStory, newId } from '../model';
import { type DocSection, type ListDefinition, type PageSetup, type PageSizeName, type WriterDocument, type WriterDocumentParts, INCH, PAGE_SIZES, PT } from './types';

export const BODY_FONT = 'Source Serif 4';
export const HEADING_FONT = 'Source Sans 3';

/** The style gallery, in gallery order. */
export const GALLERY_STYLES = ['body', 'no-spacing', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote', 'intense-quote', 'caption', 'list-paragraph', 'code'];

/** A Word-like document stylesheet. `body` is "Normal". */
export function writerStyleSheet(over: { bodyFont?: string; headingFont?: string; bodySize?: number } = {}): StyleSheet {
  const body = over.bodyFont ?? BODY_FONT;
  const head = over.headingFont ?? HEADING_FONT;
  const size = over.bodySize ?? 12 * PT;
  const ps = (id: string, name: string, para: ParagraphStyle['para'], char: CharAttrs, basedOn?: string, next?: string): ParagraphStyle => ({ id, name, para, char, basedOn, next });
  const heading = (id: string, name: string, pt: number, before: number, after: number, extra: CharAttrs = {}) =>
    ps(id, name, { spaceBefore: before * PT, spaceAfter: after * PT, leading: { kind: 'multiple', value: 1.15 }, keepWithNext: true, keepTogether: true, hyphenation: { enabled: false }, widows: 1, orphans: 1 }, { fontFamily: head, fontSize: pt * PT, fontWeight: 650, color: '#1d1530', ...extra }, 'body', 'body');
  return {
    defaultParagraph: 'body',
    paragraph: {
      body: ps('body', 'Normal', { spaceAfter: 8 * PT, leading: { kind: 'multiple', value: 1.15 }, widows: 2, orphans: 2, hyphenation: { enabled: false } }, { fontFamily: body, fontSize: size, color: '#1a1a1a' }),
      'no-spacing': ps('no-spacing', 'No Spacing', { spaceAfter: 0, leading: { kind: 'multiple', value: 1 } }, {}, 'body'),
      title: ps('title', 'Title', { spaceAfter: 4 * PT, leading: { kind: 'multiple', value: 1.05 }, keepWithNext: true, hyphenation: { enabled: false } }, { fontFamily: head, fontSize: 28 * PT, fontWeight: 700, tracking: -10, color: '#140f22' }, 'body', 'subtitle'),
      subtitle: ps('subtitle', 'Subtitle', { spaceAfter: 14 * PT, keepWithNext: true }, { fontFamily: head, fontSize: 15 * PT, color: '#5b5470', tracking: 10 }, 'body', 'body'),
      h1: heading('h1', 'Heading 1', 20, 18, 6),
      h2: heading('h2', 'Heading 2', 16, 14, 4),
      h3: heading('h3', 'Heading 3', 13.5, 12, 3),
      h4: heading('h4', 'Heading 4', 12, 10, 2, { fontStyle: 'italic' }),
      h5: heading('h5', 'Heading 5', 11, 8, 2, { color: '#3e3554' }),
      h6: heading('h6', 'Heading 6', 11, 8, 2, { fontStyle: 'italic', fontWeight: 500, color: '#3e3554' }),
      quote: ps('quote', 'Quote', { indentStart: 0.5 * INCH, indentEnd: 0.5 * INCH, spaceBefore: 6 * PT, spaceAfter: 8 * PT }, { fontStyle: 'italic', color: '#4a4458' }, 'body'),
      'intense-quote': ps('intense-quote', 'Intense Quote', { indentStart: 0.6 * INCH, indentEnd: 0.6 * INCH, spaceBefore: 12 * PT, spaceAfter: 12 * PT, align: 'center', border: { color: '#6B0099', width: 1, padding: 8 } }, { fontStyle: 'italic', color: '#6B0099' }, 'body'),
      caption: ps('caption', 'Caption', { spaceAfter: 10 * PT }, { fontSize: 9 * PT, fontStyle: 'italic', color: '#5b5470' }, 'body'),
      'list-paragraph': ps('list-paragraph', 'List Paragraph', { spaceAfter: 2 * PT }, {}, 'body', 'list-paragraph'),
      list: ps('list', 'List Bullet', { spaceAfter: 2 * PT, list: { kind: 'bullet', listId: 'bullets' } }, {}, 'body', 'list'),
      'list-number': ps('list-number', 'List Number', { spaceAfter: 2 * PT, list: { kind: 'number', listId: 'numbers' } }, {}, 'body', 'list-number'),
      code: ps('code', 'Code', { spaceAfter: 0, leading: { kind: 'multiple', value: 1.3 }, hyphenation: { enabled: false }, shading: { color: '#f4f1f8', padding: 4 } }, { fontFamily: 'JetBrains Mono', fontSize: 10 * PT }, 'body'),
      toc1: ps('toc1', 'TOC 1', { spaceAfter: 4 * PT, tabs: [{ position: 6.5 * INCH - 1, align: 'right', leader: '.' }] }, { fontWeight: 600 }, 'body', 'body'),
      toc2: ps('toc2', 'TOC 2', { spaceAfter: 2 * PT, indentStart: 0.25 * INCH, tabs: [{ position: 6.25 * INCH - 1, align: 'right', leader: '.' }] }, {}, 'body', 'body'),
      toc3: ps('toc3', 'TOC 3', { spaceAfter: 2 * PT, indentStart: 0.5 * INCH, tabs: [{ position: 6 * INCH - 1, align: 'right', leader: '.' }] }, {}, 'body', 'body'),
      'toc-heading': ps('toc-heading', 'TOC Heading', { spaceBefore: 12 * PT, spaceAfter: 8 * PT, keepWithNext: true }, { fontFamily: head, fontSize: 16 * PT, fontWeight: 650 }, 'body', 'body'),
      footnote: ps('footnote', 'Footnote Text', { spaceAfter: 0, leading: { kind: 'multiple', value: 1.1 }, widows: 1, orphans: 1 }, { fontSize: 9 * PT }, 'body', 'footnote'),
      endnote: ps('endnote', 'Endnote Text', { spaceAfter: 2 * PT, leading: { kind: 'multiple', value: 1.1 } }, { fontSize: 10 * PT }, 'body', 'endnote'),
      header: ps('header', 'Header', { spaceAfter: 0, leading: { kind: 'multiple', value: 1 }, tabs: [{ position: 3.25 * INCH, align: 'center' }, { position: 6.5 * INCH, align: 'right' }] }, { fontSize: 9 * PT, color: '#5b5470' }, 'body', 'header'),
      footer: ps('footer', 'Footer', { spaceAfter: 0, leading: { kind: 'multiple', value: 1 }, tabs: [{ position: 3.25 * INCH, align: 'center' }, { position: 6.5 * INCH, align: 'right' }] }, { fontSize: 9 * PT, color: '#5b5470' }, 'body', 'footer'),
      'table-text': ps('table-text', 'Table Text', { spaceAfter: 0, leading: { kind: 'multiple', value: 1.1 }, widows: 1, orphans: 1 }, { fontSize: 10.5 * PT }, 'body', 'table-text'),
    },
    character: {
      strong: { id: 'strong', name: 'Strong', char: { fontWeight: 700 } },
      emphasis: { id: 'emphasis', name: 'Emphasis', char: { fontStyle: 'italic' } },
      code: { id: 'code', name: 'Code', char: { fontFamily: 'JetBrains Mono', hyphenate: false } },
      link: { id: 'link', name: 'Hyperlink', char: { color: '#1f5fbf', underline: true } },
      smallcaps: { id: 'smallcaps', name: 'Small Caps', char: { caps: 'small-caps', tracking: 20 } },
      'subtle-emphasis': { id: 'subtle-emphasis', name: 'Subtle Emphasis', char: { fontStyle: 'italic', color: '#5b5470' } },
      'intense-emphasis': { id: 'intense-emphasis', name: 'Intense Emphasis', char: { fontStyle: 'italic', color: '#6B0099' } },
      'note-ref': { id: 'note-ref', name: 'Footnote Reference', char: { position: 'super' } },
    },
  };
}

export const HEADING_LEVEL: Record<string, number> = { title: 0, h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
export function headingLevel(styleId: string | undefined, sheet?: StyleSheet): number | null {
  if (!styleId) return null;
  if (styleId in HEADING_LEVEL && styleId !== 'title') return HEADING_LEVEL[styleId];
  // A custom style based on a heading counts as that heading level.
  const s = sheet?.paragraph[styleId];
  return s?.basedOn && s.basedOn !== styleId ? headingLevel(s.basedOn, sheet) : null;
}

/** Built-in multilevel lists: bullets, "1. a. i.", and legal "1.1.1". */
export function defaultLists(): Record<string, ListDefinition> {
  const ind = (lvl: number) => 0.25 * INCH + lvl * 0.25 * INCH;
  const bullets = ['•', '◦', '▪'];
  const fmt = ['decimal', 'lower-alpha', 'lower-roman'] as const;
  return {
    bullets: { id: 'bullets', name: 'Bullets', levels: Array.from({ length: 9 }, (_, i) => ({ format: 'bullet' as const, bullet: bullets[i % 3], indent: ind(i + 1), hanging: 0.25 * INCH })) },
    numbers: { id: 'numbers', name: '1. a. i.', levels: Array.from({ length: 9 }, (_, i) => ({ format: fmt[i % 3], template: `%${i + 1}.`, indent: ind(i + 1), hanging: 0.25 * INCH })) },
    legal: { id: 'legal', name: '1.1.1', levels: Array.from({ length: 9 }, (_, i) => ({ format: 'decimal' as const, template: Array.from({ length: i + 1 }, (_, k) => `%${k + 1}`).join('.') + (i === 0 ? '.' : ''), indent: ind(i + 1) + i * 0.1 * INCH, hanging: (0.3 + i * 0.1) * INCH })) },
  };
}

export function pageSetup(size: PageSizeName = 'letter', orientation: 'portrait' | 'landscape' = 'portrait', over: Partial<PageSetup> = {}): PageSetup {
  const base = size === 'custom' ? { width: over.width ?? 816, height: over.height ?? 1056 } : PAGE_SIZES[size];
  const [w, h] = orientation === 'landscape' ? [Math.max(base.width, base.height), Math.min(base.width, base.height)] : [Math.min(base.width, base.height), Math.max(base.width, base.height)];
  return {
    width: w, height: h, size, orientation,
    margins: { top: INCH, right: INCH, bottom: INCH, left: INCH, header: 0.5 * INCH, footer: 0.5 * INCH, gutter: 0 },
    columns: { count: 1, gap: 0.5 * INCH },
    ...over,
  };
}

export function reorient(setup: PageSetup, orientation: 'portrait' | 'landscape'): PageSetup {
  if (setup.orientation === orientation) return setup;
  return { ...setup, orientation, width: setup.height, height: setup.width };
}

export function resize(setup: PageSetup, size: PageSizeName, custom?: { width: number; height: number }): PageSetup {
  const base = size === 'custom' ? custom ?? { width: setup.width, height: setup.height } : PAGE_SIZES[size];
  const land = setup.orientation === 'landscape';
  return { ...setup, size, width: land ? Math.max(base.width, base.height) : Math.min(base.width, base.height), height: land ? Math.min(base.width, base.height) : Math.max(base.width, base.height) };
}

export function newSection(setup: PageSetup = pageSetup(), extra: Partial<DocSection> = {}): DocSection {
  return { id: newId('sec'), break: 'nextPage', setup, ...extra };
}

export function emptyStory(styleId?: string): TextStory {
  return { id: newId('s'), paragraphs: [{ id: newId(), styleId, runs: [{ text: '' }] }] };
}

export function documentParts(over: Partial<WriterDocumentParts> = {}): WriterDocumentParts {
  return {
    version: 1,
    styles: writerStyleSheet(),
    sections: [newSection()],
    headerFooters: {}, notes: {}, comments: {}, media: {}, floats: {},
    lists: defaultLists(),
    settings: { markup: 'all', spellcheck: true, language: 'en-US' },
    ...over,
  };
}

export function createWriterDocument(story: TextStory = emptyStory(), over: Partial<WriterDocumentParts> = {}): WriterDocument {
  return { ...documentParts(over), story };
}
