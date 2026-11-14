// docTemplates/themes — the THEME half of a template, as directed by the Art Council.
//
// Each document family had one council session (scripts/council/runDocThemeCouncil.ts, records in
// docs/tela/doc-templates/council/<family>.json). The session's synthesis is built here as the
// family's lead theme; other directors' proposals from the same session that stood up on their
// own are built beside it. `director` is whose direction it is; `counterpoint` whose idea the
// synthesis kept. Fonts, sizes and palettes are the session's, held to the print law in the brief
// (body 10.5–12 pt, 7:1 contrast, copier-safe ink, nothing vital within 0.4 in of the edge).
import type { CouncilDirectorId } from '../../council/councilTypes';
import type { PageFlourish, StyleFlourish, ThemePalette } from '../../text/document/theme';
import type { DocTheme, StyleSpec, ThemeFamily, ThemedStyleId } from './types';

interface ThemeInput {
  id: string; name: string; family: ThemeFamily; director: CouncilDirectorId; counterpoint?: CouncilDirectorId;
  note: string; signature: string;
  palette: ThemePalette;
  fonts: DocTheme['fonts'];
  body: DocTheme['body'];
  styles?: Partial<Record<ThemedStyleId, StyleSpec>>;
  bullet?: string; dropCap?: number;
  page: PageFlourish;
  flourishes?: DocTheme['flourishes'];
}

/** A theme from what makes it distinct; everything unsaid follows from its fonts and body size. */
function theme(t: ThemeInput): DocTheme {
  const b = t.body.size;
  const base: Record<ThemedStyleId, StyleSpec> = {
    title: { font: 'display', size: 26, weight: 700, color: 'ink', after: 6, leading: 1.08 },
    subtitle: { font: 'heading', size: 13, color: 'muted', after: 14, leading: 1.25 },
    kicker: { font: 'label', size: 8.5, caps: 'all-caps', tracking: 80, color: 'accent', after: 5 },
    byline: { font: 'label', size: 9, caps: 'all-caps', tracking: 60, color: 'muted', after: 10 },
    lead: { font: 'body', size: b + 1, color: 'ink', after: 8 },
    meta: { font: 'label', size: 8.5, color: 'muted', after: 3, leading: 1.4 },
    h1: { font: 'heading', size: 16, weight: 700, color: 'ink', before: 18, after: 6 },
    h2: { font: 'heading', size: 13, weight: 700, color: 'ink', before: 14, after: 4 },
    h3: { font: 'heading', size: 11, weight: 700, color: 'ink', before: 10, after: 2 },
    quote: { font: 'body', size: b, italic: true, color: 'muted', indent: 0.5, indentEnd: 0.5, before: 6, after: 8 },
    pull: { font: 'display', size: 14, italic: true, color: 'accent', align: 'center', before: 12, after: 12, leading: 1.3 },
    caption: { font: 'label', size: 8.5, color: 'muted', after: 8, leading: 1.35 },
  };
  const styles = { ...base };
  for (const k of Object.keys(t.styles ?? {}) as ThemedStyleId[]) styles[k] = { ...base[k], ...t.styles![k] };
  // A rule or mark needs room: the style's own spacing always clears its flourishes.
  for (const [k, f] of Object.entries(t.flourishes ?? {}) as [ThemedStyleId | 'body', StyleFlourish][]) {
    if (k === 'body' || !f) continue;
    const s = (styles[k] = { ...styles[k] });
    const room = (r: { weight: number; gap?: number; kind: string }) => (r.gap ?? 4) + r.weight * (r.kind === 'hair' || r.kind === 'solid' || r.kind === 'dashed' || r.kind === 'dotted' ? 1 : 3.4);
    if (f.below) s.after = Math.max(s.after ?? 6, room(f.below) + 7);
    if (f.above) s.before = Math.max(s.before ?? 0, room(f.above) + 6);
    if (f.markAbove) s.before = Math.max(s.before ?? 0, (f.markAbove.gap ?? 8) + f.markAbove.size + 8);
  }
  return { ...t, fromSession: true, styles, flourishes: t.flourishes ?? {} };
}

const bar = (color: string, weight = 1.5): StyleFlourish => ({ bar: { side: 'left', weight, color, gap: 10 } });

export const DOC_THEMES: DocTheme[] = [
  // ── Letters, memos & minutes — session lead: the World-Eclectic Traveller ────────────────
  theme({
    id: 'gratiot-ledger', name: 'Gratiot Parish Ledger', family: 'formal', director: 'WORLD_ECLECTIC', counterpoint: 'REBEL',
    note: 'An archival parish ledger out of 1940s Detroit labor bulletins and registry books: dense Baskerville, a rust heading under a hairline, and typewriter details that make a memo look deliberate.',
    signature: 'the hairline over each heading with a small rust square at its left end',
    palette: { paper: '#F8F5EE', ink: '#1F2226', muted: '#596068', accent: '#9E4225', accent2: '#2F4B5C' },
    fonts: { display: 'Libre Baskerville', heading: 'Libre Baskerville', body: 'Libre Baskerville', label: 'IBM Plex Mono' },
    body: { size: 10.5, leading: 1.42, justify: true, indent: 0.25 },
    styles: {
      title: { size: 22, tracking: -10, after: 8 },
      subtitle: { font: 'body', size: 12.5, italic: true },
      kicker: { tracking: 60, color: 'ink' },
      h1: { size: 15, color: 'accent', before: 22, after: 6 },
      h2: { size: 12.5, italic: true, before: 12 },
      h3: { size: 10.5, caps: 'all-caps', tracking: 50, color: 'muted' },
      quote: { size: 11.5, color: 'accent', indent: 0.5, indentEnd: 0.25 },
      pull: { size: 13, align: 'left', color: 'accent', indent: 0.5 },
      meta: { caps: 'all-caps', tracking: 60, size: 8 },
      byline: { font: 'body', size: 11, caps: undefined, tracking: 0, color: 'ink', weight: 700, after: 2 },
    },
    bullet: '•',
    page: { footRule: { kind: 'hair', weight: 0.5, color: 'muted', at: 0.62 }, mark: { kind: 'square', size: 3, color: 'accent', at: 'foot', offset: 0.5 } },
    flourishes: { h1: { above: { kind: 'hair', weight: 0.5, color: 'ink', width: 'measure', gap: 7 }, tab: { width: 3, height: 3, color: 'accent' } }, quote: bar('accent'), pull: bar('accent') },
  }),
  theme({
    id: 'heavy-ink', name: 'Heavy Ink Letterhead', family: 'formal', director: 'REBEL',
    note: 'Dignity from pressure instead of ornament: slab headings, typewriter details and a navy band down the left edge, so a memo feels permanent when it comes off the church copier.',
    signature: 'the navy band down the left edge with a red line beside it',
    palette: { paper: '#FBF9F5', ink: '#1A1A1A', muted: '#4A5568', accent: '#1B365D', accent2: '#8B0000' },
    fonts: { display: 'Bitter', heading: 'Bitter', body: 'Source Serif 4', label: 'IBM Plex Mono' },
    body: { size: 11, leading: 1.36, after: 8 },
    styles: {
      title: { size: 22, color: 'accent', tracking: -20 },
      subtitle: { font: 'label', size: 9, caps: 'all-caps', tracking: 100, weight: 500 },
      kicker: { size: 9, tracking: 100, color: 'accent2', weight: 500 },
      h1: { size: 14, weight: 600, caps: 'all-caps', tracking: 50, before: 20, after: 9 },
      h2: { size: 12, weight: 700, color: 'accent' },
      h3: { font: 'label', size: 9, caps: 'all-caps', tracking: 100, weight: 500, color: 'muted' },
      pull: { font: 'heading', size: 14, italic: false, weight: 600, align: 'left', color: 'accent' },
      meta: { size: 9, caps: 'all-caps', tracking: 100 },
    },
    bullet: '■',
    page: { sideBand: { side: 'left', width: 0.5, color: 'accent', rule: { weight: 1, color: 'accent2' } }, minMargins: { left: 1.05 } },
    flourishes: { h1: { below: { kind: 'solid', weight: 1, color: 'ink', width: 'measure', gap: 4 } }, pull: bar('accent2', 3) },
  }),
  theme({
    id: 'single-hairline', name: 'Single Hairline', family: 'formal', director: 'RADICAL_MINIMAL',
    note: 'Every border, frame and drop cap taken away until one hairline and an open left margin carry the trust. Bright stock, charcoal ink, labels in mono.',
    signature: 'the one hairline across the top and the wide empty left margin',
    palette: { paper: '#FDFDFD', ink: '#111111', muted: '#555555', accent: '#111111', accent2: '#555555' },
    fonts: { display: 'Source Serif 4', heading: 'Source Serif 4', body: 'Source Serif 4', label: 'IBM Plex Mono' },
    body: { size: 11, leading: 1.36, after: 6 },
    styles: {
      title: { size: 20, weight: 600 },
      subtitle: { size: 12, italic: true },
      kicker: { tracking: 60, color: 'muted' },
      h1: { size: 15, weight: 600 },
      h2: { size: 12, weight: 600 },
      h3: { font: 'label', size: 8.5, caps: 'all-caps', tracking: 60, weight: 400, color: 'muted' },
      pull: { size: 13, align: 'left', color: 'ink' },
      meta: { caps: 'all-caps', tracking: 60 },
    },
    bullet: '–',
    page: { headRule: { kind: 'hair', weight: 0.25, color: 'muted', at: 0.7 }, minMargins: { left: 1.25 } },
  }),

  // ── Sermons, bulletins & orders of service — session lead: the World-Eclectic Traveller ──
  theme({
    id: 'liturgical-field-notes', name: 'Liturgical Field Notes', family: 'worship', director: 'WORLD_ECLECTIC', counterpoint: 'BAROQUE',
    note: 'The hand-ruled margins and ink weights of an 1832 institutional record: a rubric stripe down the left, double rules at the head, lampblack ink. The gold leaf was cut so the page stays with the congregation.',
    signature: 'the double rule at the head and the red rubric line down the left margin',
    palette: { paper: '#F7F3EA', ink: '#161412', muted: '#5E574F', accent: '#8C2A1E', accent2: '#3B3A36' },
    fonts: { display: 'Libre Baskerville', heading: 'Libre Baskerville', body: 'Source Serif 4', label: 'IBM Plex Mono' },
    body: { size: 11, leading: 1.45, justify: true, indent: 0.15 },
    styles: {
      title: { size: 24, after: 8 },
      subtitle: { font: 'body', size: 13, italic: true },
      kicker: { size: 9, color: 'accent' },
      h1: { size: 18, caps: 'all-caps', tracking: 50, before: 20 },
      h2: { size: 12, caps: 'all-caps', tracking: 60, color: 'accent', before: 16, after: 5 },
      h3: { size: 11, italic: true, weight: 700 },
      quote: { size: 12, color: 'ink', indent: 0.4, indentEnd: 0.4 },
      pull: { size: 15, color: 'accent' },
      meta: { size: 9 },
    },
    dropCap: 2, bullet: '•',
    page: { headRule: { kind: 'double', weight: 0.75, color: 'ink', at: 0.6 }, sideBand: { side: 'left', width: 0.012, inset: 0.75, color: 'accent' }, footRule: { kind: 'hair', weight: 0.5, color: 'ink', at: 0.6 }, minMargins: { left: 1.05, top: 0.95 } },
    flourishes: { quote: bar('accent', 1), pull: { above: { kind: 'hair', weight: 0.5, color: 'accent', width: 1.2, align: 'center', gap: 8 }, below: { kind: 'hair', weight: 0.5, color: 'accent', width: 1.2, align: 'center', gap: 8 } } },
  }),
  theme({
    id: 'vellum-and-brass', name: 'Vellum & Brass', family: 'worship', director: 'BAROQUE',
    note: 'The bulletin as an illuminated page: Cormorant small caps opened wide, Garamond for the reading, a head band and a double-ruled stripe that give a sermon manuscript the weight of a choir book.',
    signature: 'the brass head band and wide-tracked small-cap titles',
    palette: { paper: '#F9F6F0', ink: '#1C1A17', muted: '#5A5046', accent: '#7A5A2E', accent2: '#4A3225' },
    fonts: { display: 'Cormorant Garamond', heading: 'Cormorant Garamond', body: 'EB Garamond', label: 'JetBrains Mono' },
    body: { size: 11.5, leading: 1.4, indent: 0.22 },
    styles: {
      title: { size: 30, weight: 600, caps: 'small-caps', tracking: 90, align: 'center', after: 4 },
      subtitle: { size: 15, italic: true, align: 'center', color: 'accent2' },
      kicker: { align: 'center', size: 8, tracking: 160 },
      meta: { align: 'center', size: 8, caps: 'all-caps', tracking: 100 },
      byline: { align: 'center' },
      h1: { size: 20, weight: 600, caps: 'small-caps', tracking: 70, align: 'center', before: 22, after: 8 },
      h2: { size: 15, weight: 700, caps: 'small-caps', tracking: 60, color: 'accent2', before: 16, after: 4 },
      h3: { size: 13, weight: 700, italic: true },
      quote: { size: 12.5, color: 'ink' },
      pull: { size: 17, weight: 500 },
      caption: { align: 'center' },
    },
    dropCap: 2, bullet: '❧',
    page: { headBand: { height: 0.3, color: 'accent', rule: { weight: 0.75, color: 'accent' } }, footRule: { kind: 'thick-thin', weight: 1.5, color: 'accent', at: 0.62 }, mark: { kind: 'cross', size: 11, color: 'accent', at: 'foot', offset: 0.42 }, minMargins: { top: 0.95 } },
    flourishes: { h1: { markAbove: { kind: 'fleuron', size: 7, color: 'accent', gap: 7 } }, quote: bar('accent', 1), pull: { above: { kind: 'thick-thin', weight: 1.2, color: 'accent', width: 1.6, align: 'center', gap: 9 } } },
  }),
  theme({
    id: 'cantors-nave', name: 'The Cantor’s Nave', family: 'worship', director: 'CLASSICAL',
    note: 'A hymnbook built like a building: a double-ruled bay down the margin holds the text to its measure, Bodoni for the titles, a steady serif for everything read aloud.',
    signature: 'the two fine vertical rules that run the height of the page beside the text',
    palette: { paper: '#FAF8F3', ink: '#17171A', muted: '#55535A', accent: '#3A3F6B', accent2: '#7C2529' },
    fonts: { display: 'Bodoni Moda', heading: 'Bodoni Moda', body: 'Source Serif 4', label: 'JetBrains Mono' },
    body: { size: 11.5, leading: 1.45, after: 7 },
    styles: {
      title: { size: 28, weight: 600, tracking: 10 },
      subtitle: { size: 13, italic: true, weight: 400 },
      kicker: { color: 'accent2', tracking: 120 },
      h1: { size: 18, weight: 600, before: 20 },
      h2: { size: 13, weight: 700, caps: 'all-caps', tracking: 90, color: 'accent', before: 16, after: 5 },
      h3: { size: 12, italic: true, weight: 600 },
      pull: { size: 16, color: 'accent' },
    },
    dropCap: 2,
    page: { sideBand: { side: 'left', width: 0.006, inset: 0.72, color: 'accent', rule: { weight: 0.4, color: 'accent' } }, minMargins: { left: 1.1 }, mark: { kind: 'diamond', size: 5, color: 'accent2', at: 'foot', offset: 0.5 } },
    flourishes: { h1: { below: { kind: 'hair', weight: 0.5, color: 'accent', width: 0.9, gap: 6 } }, quote: bar('accent2', 1) },
  }),

  // ── Newsletters, articles & annual reports — session lead: the Baroque Dramatist ─────────
  theme({
    id: 'chiaroscuro-gazette', name: 'Chiaroscuro Gazette', family: 'editorial', director: 'BAROQUE', counterpoint: 'RADICAL_MINIMAL',
    note: 'Out of the ink-heavy drama of Forain’s news lithographs: towering Bodoni capitals over ragged Lora built for skimming, in carbon black only, so a low-toner copier still prints conviction.',
    signature: 'the all-caps Bodoni headline between a thick-thin rule and a hairline',
    palette: { paper: '#FAF7F0', ink: '#141210', muted: '#57524B', accent: '#141210', accent2: '#8A3B1F' },
    fonts: { display: 'Bodoni Moda', heading: 'Bodoni Moda', body: 'Lora', label: 'Source Sans 3' },
    body: { size: 11, leading: 1.4, after: 4 },
    styles: {
      title: { size: 34, weight: 800, caps: 'all-caps', tracking: -20, after: 8, leading: 1 },
      subtitle: { font: 'body', size: 13, italic: true, color: 'ink' },
      kicker: { weight: 700, tracking: 140, color: 'ink' },
      byline: { weight: 600 },
      lead: { size: 12.5 },
      h1: { size: 22, weight: 700, before: 18, after: 6, leading: 1.08 },
      h2: { size: 15, weight: 700 },
      h3: { font: 'label', size: 9.5, weight: 700, caps: 'all-caps', tracking: 100 },
      pull: { size: 18, weight: 500, align: 'left', color: 'ink', leading: 1.2 },
      caption: { size: 8.5 },
    },
    dropCap: 2, bullet: '•',
    page: { sideBand: { side: 'left', width: 0.09, inset: 0.42, color: 'ink' }, minMargins: { left: 0.8 }, footRule: { kind: 'hair', weight: 0.5, color: 'ink', at: 0.6 } },
    flourishes: { title: { above: { kind: 'thick-thin', weight: 3, color: 'ink', width: 'measure', gap: 9 }, below: { kind: 'hair', weight: 0.5, color: 'ink', width: 'measure', gap: 5 } }, pull: { above: { kind: 'solid', weight: 2, color: 'ink', width: 0.8, gap: 8 } }, h2: { below: { kind: 'hair', weight: 0.5, color: 'muted', width: 'measure', gap: 3 } } },
  }),
  theme({
    id: 'field-report-gazette', name: 'Field Report Gazette', family: 'editorial', director: 'WORLD_ECLECTIC',
    note: 'An unpretentious documentary gazette: justified columns, small-cap serif headlines and plain sans details, set the way a 19th-century news sheet kept its discipline.',
    signature: 'small-cap headlines over dotted rules between items',
    palette: { paper: '#F6F3EC', ink: '#1D1C1A', muted: '#5C5952', accent: '#1F4E4A', accent2: '#8A5A1C' },
    fonts: { display: 'Noto Serif', heading: 'Noto Serif', body: 'Source Serif 4', label: 'Inter' },
    body: { size: 10.5, leading: 1.3, justify: true, indent: 0.17 },
    styles: {
      title: { size: 30, weight: 700, caps: 'small-caps', tracking: 30, align: 'center', after: 4 },
      subtitle: { font: 'label', size: 9, caps: 'all-caps', tracking: 140, align: 'center', color: 'muted' },
      kicker: { align: 'center', color: 'accent', weight: 600 },
      byline: { weight: 600, color: 'accent' },
      h1: { size: 18, weight: 700, caps: 'small-caps', tracking: 20, before: 14 },
      h2: { size: 13, weight: 700, caps: 'small-caps', tracking: 40, color: 'accent', before: 12 },
      h3: { font: 'body', size: 10.5, weight: 700, italic: true },
      pull: { size: 14, color: 'accent', align: 'center' },
      caption: { size: 8 },
    },
    dropCap: 2, bullet: '•',
    page: { headRule: { kind: 'thin-thick', weight: 2, color: 'ink', at: 0.55 }, footRule: { kind: 'thick-thin', weight: 2, color: 'ink', at: 0.6 }, minMargins: { top: 0.85 } },
    flourishes: { subtitle: { below: { kind: 'double', weight: 0.5, color: 'ink', width: 'measure', gap: 7 } }, h2: { above: { kind: 'dotted', weight: 1, color: 'muted', width: 'measure', gap: 6 } }, pull: { above: { kind: 'hair', weight: 0.5, color: 'accent', width: 'measure', gap: 7 }, below: { kind: 'hair', weight: 0.5, color: 'accent', width: 'measure', gap: 7 } } },
  }),
  theme({
    id: 'mimeograph-witness', name: 'Mimeograph Witness', family: 'editorial', director: 'REBEL',
    note: 'A report that reads like an urgent bulletin run off a hand-cranked machine: typewriter face throughout, hammered small-cap section heads, an overweight stripe down the left.',
    signature: 'typewriter type everywhere and the thick black stripe at the left',
    palette: { paper: '#F4F1E8', ink: '#16130F', muted: '#4D4840', accent: '#16130F', accent2: '#B3261E' },
    fonts: { display: 'Special Elite', heading: 'Courier Prime', body: 'Courier Prime', label: 'Courier Prime' },
    body: { size: 10.5, leading: 1.4, after: 8 },
    styles: {
      title: { size: 26, weight: 400, caps: 'all-caps', tracking: 40, leading: 1.1 },
      subtitle: { size: 11, color: 'ink' },
      kicker: { size: 9, weight: 700, tracking: 160, color: 'accent2' },
      h1: { font: 'display', size: 17, weight: 400, caps: 'all-caps', tracking: 60, before: 20 },
      h2: { size: 11.5, weight: 700, caps: 'all-caps', tracking: 120, before: 16, after: 5 },
      h3: { size: 10.5, weight: 700, underline: 'ink' },
      quote: { italic: true, color: 'ink' },
      pull: { font: 'display', size: 15, italic: false, align: 'left', color: 'ink' },
      meta: { size: 9 }, caption: { size: 9 }, byline: { size: 9.5, weight: 700 },
    },
    bullet: '*',
    page: { sideBand: { side: 'left', width: 0.2, inset: 0.4, color: 'ink' }, minMargins: { left: 0.95 }, footRule: { kind: 'dashed', weight: 1, color: 'ink', at: 0.6 } },
    flourishes: { h1: { below: { kind: 'double', weight: 1, color: 'ink', width: 'measure', gap: 4 } }, h2: { tab: { width: 6, height: 6, color: 'accent2' } }, pull: bar('accent2', 3), quote: bar('ink', 1) },
  }),

  // ── Essays, lesson plans & grant narratives — session lead: the World-Eclectic Traveller ─
  theme({
    id: 'field-studies', name: 'Field Studies Ledger', family: 'scholarly', director: 'WORLD_ECLECTIC', counterpoint: 'REBEL',
    note: 'A ledger sheet for study, after the Pennsylvania College record book: a wide left margin kept for notes and tallies, Garamond headings under a full rule, carbon ink that survives generations of photocopying.',
    signature: 'the wide ruled left margin left open for a grader’s pen',
    palette: { paper: '#FBF9F5', ink: '#1E1B18', muted: '#5B564F', accent: '#6E2F1A', accent2: '#2D4A43' },
    fonts: { display: 'EB Garamond', heading: 'EB Garamond', body: 'Source Serif 4', label: 'Source Sans 3' },
    body: { size: 11, leading: 1.4, justify: true, indent: 0.25 },
    styles: {
      title: { size: 24, leading: 1.2 },
      subtitle: { font: 'label', size: 11, caps: 'all-caps', tracking: 100, after: 12 },
      h1: { size: 16, color: 'accent', before: 20, after: 6 },
      h2: { font: 'label', size: 12.5, weight: 600, tracking: 30, before: 12 },
      h3: { font: 'label', size: 11, weight: 700, italic: true },
      quote: { size: 10, indent: 0.5, indentEnd: 0.5 },
      pull: { size: 14, color: 'accent' },
      caption: { size: 9 }, meta: { size: 9 }, kicker: { weight: 600 },
    },
    bullet: '–',
    page: { sideBand: { side: 'left', width: 0.008, inset: 1.3, color: 'muted' }, frame: { kind: 'brackets', inset: 0.42, weight: 0.75, color: 'muted' }, minMargins: { left: 1.5 } },
    flourishes: { h1: { above: { kind: 'solid', weight: 0.75, color: 'ink', width: 'measure', gap: 7 } }, quote: bar('accent2', 1) },
  }),
  theme({
    id: 'clear-manuscript', name: 'Clear Manuscript', family: 'scholarly', director: 'RADICAL_MINIMAL',
    note: 'Forty pages of close argument held by one hairline. Nothing on the page but type on a strict rhythm: sans for the title, serif for the thinking.',
    signature: 'the uppercase sans title over a single hairline',
    palette: { paper: '#FFFFFF', ink: '#1A1A1A', muted: '#4A4A4A', accent: '#1A1A1A', accent2: '#4A4A4A' },
    fonts: { display: 'Source Sans 3', heading: 'Source Serif 4', body: 'Source Serif 4', label: 'Source Sans 3' },
    body: { size: 11, leading: 1.38, justify: true, indent: 0.25 },
    styles: {
      title: { size: 24, weight: 600, caps: 'all-caps', tracking: 50, after: 12 },
      subtitle: { font: 'label', size: 13, tracking: 30, after: 24 },
      h1: { size: 16, weight: 600 },
      h2: { size: 13, weight: 600 },
      h3: { size: 11, weight: 600, italic: true },
      quote: { size: 10.5 },
      pull: { font: 'label', size: 14, italic: false, weight: 600, color: 'ink' },
      kicker: { color: 'muted' },
    },
    bullet: '–',
    page: { footRule: { kind: 'hair', weight: 0.5, color: 'muted', at: 0.62 } },
    flourishes: { title: { below: { kind: 'hair', weight: 0.5, color: 'ink', width: 'measure', gap: 7 } } },
  }),
  theme({
    id: 'dutch-interior', name: 'Dutch Interior', family: 'scholarly', director: 'BAROQUE',
    note: 'A paper treated like a Dutch interior: generous white, a weighty centred column, Fraunces small caps for the headings and a frame that guides the eye like window light.',
    signature: 'the thick-thin frame around a quiet, centred title',
    palette: { paper: '#FAF7F1', ink: '#1B1814', muted: '#5F574C', accent: '#5B3A1E', accent2: '#2E4057' },
    fonts: { display: 'Fraunces', heading: 'Fraunces', body: 'EB Garamond', label: 'Courier Prime' },
    body: { size: 11.5, leading: 1.4, justify: true, indent: 0.22 },
    styles: {
      title: { size: 27, weight: 600, align: 'center', leading: 1.12 },
      subtitle: { size: 13, italic: true, weight: 400, align: 'center' },
      kicker: { align: 'center', size: 9 }, meta: { size: 9 }, caption: { size: 9 }, byline: { size: 9.5 },
      h1: { size: 17, weight: 600, caps: 'small-caps', tracking: 50, color: 'accent', before: 20 },
      h2: { size: 13.5, weight: 600, caps: 'small-caps', tracking: 40 },
      h3: { size: 12, weight: 600, italic: true },
      pull: { size: 16, color: 'accent2' },
    },
    dropCap: 2,
    page: { frame: { kind: 'thick-thin', inset: 0.45, weight: 1.6, color: 'accent' }, minMargins: { left: 1.2, right: 1.2, top: 1.1, bottom: 1.1 } },
    flourishes: { h1: { below: { kind: 'hair', weight: 0.5, color: 'accent', width: 'text', gap: 4 } }, quote: bar('accent2', 1), pull: { markAbove: { kind: 'diamond', size: 5, color: 'accent', gap: 8 } } },
  }),

  // ── Résumés, cover letters & programs — session lead: the Futurist ───────────────────────
  theme({
    id: 'systemic-monolith', name: 'Systemic Monolith', family: 'personal', director: 'FUTURIST', counterpoint: 'BAROQUE',
    note: 'Personal authority from a rule set: uppercase Inter on a fixed grid, mono for the facts, hairlines that print the same on any office laser. The dense black of the counterpoint stayed; its frames did not.',
    signature: 'the bold uppercase name over a heavy bar and mono details',
    palette: { paper: '#F8F7F3', ink: '#0F0F10', muted: '#55565A', accent: '#0F0F10', accent2: '#2B4FD8' },
    fonts: { display: 'Inter', heading: 'Inter', body: 'Source Serif 4', label: 'JetBrains Mono' },
    body: { size: 10.5, leading: 1.36, after: 6 },
    styles: {
      title: { size: 28, weight: 800, caps: 'all-caps', tracking: 50, after: 9, leading: 1.02 },
      subtitle: { font: 'label', size: 10.5, tracking: 20 },
      kicker: { color: 'accent2', tracking: 120 },
      h1: { size: 17, weight: 700, caps: 'all-caps', tracking: 30 },
      h2: { size: 11, weight: 700, caps: 'all-caps', tracking: 110, before: 16, after: 6 },
      h3: { size: 11, weight: 600, before: 8 },
      pull: { font: 'heading', size: 15, italic: false, weight: 500, color: 'ink' },
      caption: { size: 8.5 }, meta: { size: 8.5, tracking: 10 },
      byline: { size: 9 },
    },
    bullet: '■',
    page: { footRule: { kind: 'hair', weight: 0.5, color: 'ink', at: 0.6 }, mark: { kind: 'square', size: 4, color: 'accent2', at: 'foot-right', offset: 0.47 } },
    flourishes: { title: { below: { kind: 'solid', weight: 3, color: 'ink', width: 'measure', gap: 6 } }, h2: { below: { kind: 'hair', weight: 0.5, color: 'ink', width: 'measure', gap: 3 } }, quote: bar('accent2', 2) },
  }),
  theme({
    id: 'attic-measure', name: 'Attic Measure', family: 'personal', director: 'CLASSICAL',
    note: 'Proportion as the whole design: inscriptional Cinzel capitals, opened wide and centred, over a calm justified serif. The dignity of a carved name.',
    signature: 'centred Cinzel capitals with a short rule and a diamond beneath',
    palette: { paper: '#FBF9F4', ink: '#1A1917', muted: '#5A564F', accent: '#6B5B2E', accent2: '#3D4A3E' },
    fonts: { display: 'Cinzel', heading: 'Cinzel', body: 'Source Serif 4', label: 'Source Sans 3' },
    body: { size: 11, leading: 1.4, after: 6 },
    styles: {
      title: { size: 24, weight: 600, tracking: 120, align: 'center', after: 10, leading: 1.15 },
      subtitle: { font: 'body', size: 12.5, italic: true, align: 'center' },
      kicker: { align: 'center', tracking: 180, size: 8 }, meta: { align: 'center', size: 9, tracking: 30 }, byline: { align: 'center' }, caption: { align: 'center', size: 9 },
      lead: { align: 'center', italic: true },
      h1: { size: 15, weight: 600, tracking: 120, align: 'center', before: 22, after: 8 },
      h2: { size: 11.5, weight: 700, tracking: 140, align: 'center', color: 'accent', before: 18, after: 8 },
      h3: { font: 'body', size: 11, weight: 700 },
      pull: { font: 'body', size: 14 },
    },
    bullet: '·',
    page: { frame: { kind: 'inset', inset: 0.45, weight: 0.75, color: 'accent' }, minMargins: { left: 1.05, right: 1.05, top: 1.05, bottom: 1.05 } },
    flourishes: { title: { below: { kind: 'hair', weight: 0.5, color: 'accent', width: 1.4, align: 'center', gap: 9 } }, h2: { markAbove: { kind: 'diamond', size: 4, color: 'accent', gap: 6 } } },
  }),
  theme({
    id: 'instrument-hairline', name: 'Italic Hairline', family: 'personal', director: 'RADICAL_MINIMAL',
    note: 'One gesture: a large italic name in Instrument Serif, set left with open space beside it, and a single hairline. Silence does the decorating.',
    signature: 'the large italic serif name and nothing else',
    palette: { paper: '#FEFDFB', ink: '#141414', muted: '#5C5C5C', accent: '#141414', accent2: '#5C5C5C' },
    fonts: { display: 'Instrument Serif', heading: 'Source Serif 4', body: 'Source Serif 4', label: 'Source Sans 3' },
    body: { size: 11, leading: 1.36, after: 5 },
    styles: {
      title: { size: 34, weight: 400, italic: true, tracking: 5, after: 4, leading: 1.05 },
      subtitle: { font: 'body', size: 12, italic: true },
      kicker: { color: 'muted' },
      h1: { size: 15, weight: 600 },
      h2: { font: 'label', size: 9, weight: 600, caps: 'all-caps', tracking: 140, color: 'muted', before: 18, after: 6 },
      h3: { size: 11, weight: 600 },
      pull: { size: 18, color: 'ink', align: 'left' },
      meta: { size: 9 },
    },
    bullet: '–',
    page: { minMargins: { left: 1.4 } },
    flourishes: { h2: { above: { kind: 'hair', weight: 0.4, color: 'muted', width: 'measure', gap: 7 } } },
  }),

  // ── Chapters, poems & journals — session lead: the World-Eclectic Traveller ──────────────
  theme({
    id: 'quiet-copy-press', name: 'Quiet Copy Press', family: 'literary', director: 'WORLD_ECLECTIC', counterpoint: 'BAROQUE',
    note: 'A manuscript page for the office laser, after the plain lithographic ink of Vernier’s “The Literary Life”: justified serif on a steady step, a drafting margin at the left, and the one drama kept from the counterpoint, Bodoni for the headings.',
    signature: 'Bodoni chapter titles over a short rule, with quiet corner marks',
    palette: { paper: '#FAF8F2', ink: '#1A1A1A', muted: '#5A5650', accent: '#1A1A1A', accent2: '#7A3B2E' },
    fonts: { display: 'Bodoni Moda', heading: 'Bodoni Moda', body: 'Source Serif 4', label: 'JetBrains Mono' },
    body: { size: 11, leading: 1.36, justify: true, indent: 0.25 },
    styles: {
      title: { size: 28, weight: 700, after: 12, leading: 1.1 },
      subtitle: { size: 14, italic: true, weight: 400 },
      kicker: { tracking: 140, color: 'accent2', size: 8.5 },
      byline: { font: 'body', size: 11, italic: true, caps: undefined, tracking: 0, after: 16 },
      lead: { size: 11 },
      h1: { size: 19, weight: 700 },
      h2: { size: 14, weight: 600 },
      h3: { size: 12, weight: 500, align: 'center', color: 'accent2', before: 12, after: 12 },
      pull: { size: 16, color: 'accent2' },
      meta: { size: 8.5, caps: 'all-caps', tracking: 60 },
    },
    dropCap: 3,
    page: { corners: { kind: 'notch', size: 9, color: 'muted', inset: 0.45 }, footRule: { kind: 'hair', weight: 0.4, color: 'muted', at: 0.62 }, minMargins: { left: 1 } },
    flourishes: { title: { below: { kind: 'solid', weight: 1, color: 'ink', width: 0.7, gap: 10 } }, quote: bar('accent2', 1) },
  }),
  theme({
    id: 'canonical-octavo', name: 'Canonical Octavo', family: 'literary', director: 'CLASSICAL',
    note: 'The architecture of the printed book brought to the page: golden-section margins, Garamond justified in a calm bay, headings in Cormorant small caps opened wide.',
    signature: 'centred small-cap chapter headings with a fleuron above',
    palette: { paper: '#FAF7EF', ink: '#1C1A16', muted: '#5E584D', accent: '#7C2529', accent2: '#3D4A3E' },
    fonts: { display: 'Cormorant Garamond', heading: 'Cormorant Garamond', body: 'EB Garamond', label: 'Cormorant Garamond' },
    body: { size: 11.5, leading: 1.4, justify: true, indent: 0.22 },
    styles: {
      title: { size: 27, weight: 600, caps: 'small-caps', tracking: 80, align: 'center', before: 26, after: 16 },
      subtitle: { size: 15, italic: true, align: 'center' },
      kicker: { size: 11, caps: 'small-caps', tracking: 160, align: 'center', weight: 600, color: 'accent' },
      byline: { size: 12, italic: true, caps: undefined, tracking: 0, align: 'center', after: 18 },
      lead: { size: 11.5 },
      meta: { size: 10.5, italic: true },
      caption: { size: 10, italic: true },
      h1: { size: 18, weight: 600, caps: 'small-caps', tracking: 70, align: 'center', before: 22, after: 8 },
      h2: { size: 14, weight: 700, caps: 'small-caps', tracking: 60 },
      h3: { size: 13, weight: 500, align: 'center', color: 'accent', before: 12, after: 12 },
      pull: { size: 17, weight: 500, color: 'accent' },
    },
    dropCap: 3, bullet: '❧',
    page: { mark: { kind: 'fleuron', size: 6, color: 'accent', at: 'foot', offset: 0.55 }, minMargins: { left: 1.25, right: 1.1, top: 1.1, bottom: 1.2 } },
    flourishes: { title: { markAbove: { kind: 'fleuron', size: 8, color: 'accent', gap: 10 } }, quote: bar('accent', 0.75) },
  }),
];
