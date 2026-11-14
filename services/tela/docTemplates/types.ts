// docTemplates/types — themes and templates for Tela's word pages (Writer devices).
//
// Two things a person can take from a template in the library:
//   THEME     the design cues only: fonts, colours, paragraph styles and the page flourishes
//             (frames, bands, rules, marks). Their words and layout stay as they are.
//   TEMPLATE  the theme PLUS the structure: page setup (margins, columns) and the pages
//             themselves (a letterhead, an order of service, a two-column newsletter…).
//
// A theme is stored ON the document (WriterDocumentParts.theme + .styles), self-contained, so a
// themed page renders anywhere without this library: embeds, shared copies, saved templates.
import type { CouncilDirectorId } from '../../council/councilTypes';
import type { ParaAttrs } from '../../text/model';

import type { PageFlourish, StyleFlourish, ThemeColor, ThemePalette } from '../../text/document/theme';
export type { MarkKind, PageFlourish, ParagraphRule, RuleKind, StyleFlourish, ThemeColor, ThemePalette, WriterTheme } from '../../text/document/theme';

/** One paragraph style in a theme, in typographer's units. */
export interface StyleSpec {
  font?: 'display' | 'heading' | 'body' | 'label';
  /** pt. */
  size?: number;
  weight?: number;
  italic?: boolean;
  caps?: 'all-caps' | 'small-caps';
  /** 1/1000 em. */
  tracking?: number;
  color?: ThemeColor;
  align?: 'left' | 'center' | 'right' | 'justify';
  /** pt. */
  before?: number;
  after?: number;
  leading?: number;
  /** Indents, inches. */
  indent?: number;
  indentEnd?: number;
  /** A tint behind the paragraph / a box around it. */
  shade?: ThemeColor;
  box?: ThemeColor;
  /** Underline in this colour. */
  underline?: ThemeColor;
}

export type ThemedStyleId = 'title' | 'subtitle' | 'kicker' | 'byline' | 'lead' | 'meta' | 'h1' | 'h2' | 'h3' | 'quote' | 'pull' | 'caption';

export type ThemeFamily = 'formal' | 'worship' | 'editorial' | 'scholarly' | 'personal' | 'literary';

export interface DocTheme {
  id: string;
  name: string;
  family: ThemeFamily;
  /** The Art Council director who led this direction, and the one whose counterpoint was kept. */
  director: CouncilDirectorId;
  counterpoint?: CouncilDirectorId;
  /** The direction in a sentence, and the detail you would recognise it by. */
  note: string;
  signature: string;
  /** True when built from a recorded council session (docs/tela/doc-templates/council). */
  fromSession?: boolean;
  palette: ThemePalette;
  fonts: { display: string; heading: string; body: string; label: string };
  body: { size: number; leading: number; justify?: boolean; /** First-line indent (inches) instead of space between paragraphs. */ indent?: number; after?: number };
  styles: Record<ThemedStyleId, StyleSpec>;
  bullet?: string;
  /** Drop cap on the `lead` paragraph: lines tall. */
  dropCap?: number;
  page: PageFlourish;
  flourishes: Partial<Record<ThemedStyleId | 'body', StyleFlourish>>;
}

/** One skeleton paragraph: [style, text] or with paragraph attributes (tabs, alignment). */
export type SkeletonPara = [style: ThemedStyleId | 'body' | 'list' | 'list-number', text: string] | [style: ThemedStyleId | 'body' | 'list' | 'list-number', text: string, attrs: ParaAttrs];

export interface StructurePage {
  label: string;
  /** Margins in inches; omitted sides are 1 in. */
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  columns?: number;
  /** Gap between columns, inches. */
  gutter?: number;
  body: SkeletonPara[];
}

export interface DocStructure {
  id: string;
  name: string;
  family: ThemeFamily;
  /** What it is for, one line. */
  blurb: string;
  pages: StructurePage[];
}

/** A library tile: one structure dressed in one theme. */
export interface DocTemplate {
  id: string;
  name: string;
  family: ThemeFamily;
  blurb: string;
  structureId: string;
  themeId: string;
}

export const FAMILY_LABEL: Record<ThemeFamily, string> = {
  formal: 'Letters & minutes', worship: 'Worship', editorial: 'Newsletters & reports', scholarly: 'Study & grants', personal: 'Résumés & programs', literary: 'Chapters & poems',
};
