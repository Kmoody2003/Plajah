// docTemplates/build — a DocTheme as the two things a Writer document stores (stylesheet +
// flourishes), and a structure page as a story with its page setup. Pure; runs in node.
import { type CharAttrs, type ParaAttrs, type Paragraph, type ParagraphStyle, type StyleSheet, type TextStory, newId } from '../../text/model';
import { writerStyleSheet, pageSetup } from '../../text/document/defaults';
import { INCH, PT, type PageSetup } from '../../text/document/types';
import { themeColor, type StyleFlourish, type WriterTheme } from '../../text/document/theme';
import type { DocTheme, SkeletonPara, StructurePage, StyleSpec, ThemedStyleId } from './types';

/** Theme style ids → stylesheet ids (the Writer's Word-compatible names). */
export const SHEET_ID: Record<ThemedStyleId, string> = {
  title: 'title', subtitle: 'subtitle', kicker: 'kicker', byline: 'byline', lead: 'lead', meta: 'meta',
  h1: 'h1', h2: 'h2', h3: 'h3', quote: 'quote', pull: 'intense-quote', caption: 'caption',
};
const DISPLAY_NAME: Partial<Record<ThemedStyleId, string>> = { kicker: 'Kicker', byline: 'Byline', lead: 'Lead Paragraph', meta: 'Details' };
const DEFAULT_FONT: Record<ThemedStyleId, keyof DocTheme['fonts']> = {
  title: 'display', subtitle: 'heading', kicker: 'label', byline: 'label', lead: 'body', meta: 'label',
  h1: 'heading', h2: 'heading', h3: 'heading', quote: 'body', pull: 'display', caption: 'label',
};
const KEEP_WITH_NEXT = new Set<ThemedStyleId>(['title', 'subtitle', 'kicker', 'h1', 'h2', 'h3']);

function styleFrom(t: DocTheme, id: ThemedStyleId, s: StyleSpec, base: ParagraphStyle | undefined): ParagraphStyle {
  const c = (v: string | undefined, fb: string) => themeColor(t.palette, v, fb);
  const char: CharAttrs = {
    fontFamily: t.fonts[s.font ?? DEFAULT_FONT[id]],
    fontSize: (s.size ?? t.body.size) * PT,
    fontWeight: s.weight ?? 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    caps: s.caps ?? 'normal',
    tracking: s.tracking ?? 0,
    color: c(s.color, t.palette.ink),
    underline: s.underline ? { color: c(s.underline, t.palette.accent), thickness: 1, offset: 3 } : false,
  };
  const para: ParaAttrs = {
    align: s.align === 'left' || !s.align ? 'start' : s.align,
    indentFirst: 0,
    indentStart: (s.indent ?? 0) * INCH,
    indentEnd: (s.indentEnd ?? 0) * INCH,
    spaceBefore: (s.before ?? 0) * PT,
    spaceAfter: (s.after ?? 6) * PT,
    leading: { kind: 'multiple', value: s.leading ?? (id === 'lead' || id === 'quote' ? t.body.leading : 1.15) },
    keepWithNext: KEEP_WITH_NEXT.has(id),
    hyphenation: { enabled: id === 'lead' || id === 'quote' ? !!t.body.justify : false },
    ...(s.shade ? { shading: { color: c(s.shade, t.palette.paper), padding: 7 } } : {}),
    ...(s.box ? { border: { color: c(s.box, t.palette.ink), width: 0.75, padding: 9 } } : {}),
  };
  if (id === 'lead' && t.dropCap) para.dropCap = { lines: t.dropCap, gap: 5, style: { fontFamily: t.fonts.display, color: t.palette.accent, fontWeight: 400, fontStyle: 'normal' } };
  const sid = SHEET_ID[id];
  return { id: sid, name: base?.name ?? DISPLAY_NAME[id] ?? sid, basedOn: 'body', next: id === 'title' ? 'subtitle' : id === 'quote' || id === 'pull' ? sid : 'body', para, char };
}

/** The whole stylesheet of a theme: every Word style the Writer has, restyled, plus the theme's own. */
export function themeStyleSheet(t: DocTheme): StyleSheet {
  const sheet = writerStyleSheet({ bodyFont: t.fonts.body, headingFont: t.fonts.heading, bodySize: t.body.size * PT });
  const P = sheet.paragraph;
  const ink = t.palette.ink, muted = t.palette.muted;
  const indent = (t.body.indent ?? 0) * INCH;
  P.body = {
    ...P.body,
    para: { ...P.body.para, align: t.body.justify ? 'justify' : 'start', indentFirst: indent, spaceAfter: (t.body.after ?? (indent ? 0 : 8)) * PT, leading: { kind: 'multiple', value: t.body.leading }, hyphenation: { enabled: !!t.body.justify } },
    char: { ...P.body.char, fontFamily: t.fonts.body, fontSize: t.body.size * PT, color: ink },
  };
  // Everything based on Normal would inherit its first-line indent and justification.
  for (const id of Object.keys(P)) {
    if (id === 'body') continue;
    const s = P[id];
    const flush = id !== 'list-paragraph' && id !== 'list' && id !== 'list-number' && id !== 'footnote' && id !== 'endnote' && id !== 'table-text' && id !== 'no-spacing';
    P[id] = { ...s, para: { ...s.para, indentFirst: 0, ...(flush ? { align: s.para?.align ?? 'start' } : {}) }, char: { ...s.char, ...(s.char?.color ? { color: /^h[4-6]$/.test(id) ? ink : muted } : {}) } };
  }
  for (const id of ['h4', 'h5', 'h6', 'toc-heading']) P[id] = { ...P[id], char: { ...P[id].char, fontFamily: t.fonts.heading, color: ink } };
  for (const id of ['header', 'footer']) P[id] = { ...P[id], char: { ...P[id].char, fontFamily: t.fonts.label, color: muted } };
  if (t.bullet) P.list = { ...P.list, para: { ...P.list.para, list: { kind: 'bullet', listId: 'bullets', bullet: t.bullet } } };
  for (const id of Object.keys(t.styles) as ThemedStyleId[]) P[SHEET_ID[id]] = styleFrom(t, id, t.styles[id], P[SHEET_ID[id]]);
  sheet.character = {
    ...sheet.character,
    link: { ...sheet.character.link, char: { color: t.palette.accent, underline: true } },
    'subtle-emphasis': { ...sheet.character['subtle-emphasis'], char: { fontStyle: 'italic', color: muted } },
    'intense-emphasis': { ...sheet.character['intense-emphasis'], char: { fontStyle: 'italic', color: t.palette.accent } },
  };
  return sheet;
}

/** The flourish half of a theme, as stored on the document. */
export function writerTheme(t: DocTheme): WriterTheme {
  const styles: Record<string, StyleFlourish> = {};
  for (const [k, v] of Object.entries(t.flourishes)) if (v) styles[k === 'body' ? 'body' : SHEET_ID[k as ThemedStyleId]] = v;
  return { id: t.id, name: t.name, palette: { ...t.palette }, page: JSON.parse(JSON.stringify(t.page)), styles: JSON.parse(JSON.stringify(styles)) };
}

/** Keep the person's own custom styles when a theme replaces the sheet. */
export function mergeSheet(theme: StyleSheet, existing: StyleSheet | undefined, builtin: StyleSheet = writerStyleSheet()): StyleSheet {
  if (!existing) return theme;
  const paragraph = { ...theme.paragraph }, character = { ...theme.character };
  for (const [id, s] of Object.entries(existing.paragraph)) if (!(id in paragraph) && !(id in builtin.paragraph)) paragraph[id] = s;
  for (const [id, s] of Object.entries(existing.character)) if (!(id in character) && !(id in builtin.character)) character[id] = s;
  return { ...theme, paragraph, character };
}

const sheetId = (s: SkeletonPara[0]): string | undefined => (s === 'body' ? undefined : s === 'list' || s === 'list-number' ? s : SHEET_ID[s]);

export function skeletonParagraph(sp: SkeletonPara): Paragraph {
  const [style, text, attrs] = sp;
  return { id: newId(), styleId: sheetId(style), runs: [{ text }], ...(attrs ? { attrs } : {}) };
}

export function structureStory(page: StructurePage): TextStory {
  return { id: newId('s'), paragraphs: page.body.length ? page.body.map(skeletonParagraph) : [{ id: newId(), runs: [{ text: '' }] }] };
}

/** Page setup of a structure page (US Letter; the frame decides the real size). */
export function structureSetup(page: StructurePage, base?: PageSetup): PageSetup {
  const b = base ?? pageSetup();
  const m = page.margins ?? {};
  return {
    ...b,
    margins: { ...b.margins, top: (m.top ?? 1) * INCH, right: (m.right ?? 1) * INCH, bottom: (m.bottom ?? 1) * INCH, left: (m.left ?? 1) * INCH },
    columns: { count: page.columns ?? 1, gap: (page.gutter ?? 0.35) * INCH },
  };
}
