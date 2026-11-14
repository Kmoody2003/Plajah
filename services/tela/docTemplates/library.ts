// docTemplates/library — the template library for word pages: each tile is one structure
// (structures.ts) dressed in one Art Council theme (themes.ts).
import { DOC_STRUCTURES } from './structures';
import { DOC_THEMES } from './themes';
import type { DocTemplate, DocTheme } from './types';

export { DOC_STRUCTURES, structureById } from './structures';
export { DOC_THEMES } from './themes';

const themes = new Map(DOC_THEMES.map(t => [t.id, t]));
export const themeById = (id: string | null | undefined): DocTheme | undefined => (id ? themes.get(id) : undefined);

/** Which themes dress which structure, best fit first. */
const PAIRS: Record<string, string[]> = {
  letter: ['gratiot-ledger', 'heavy-ink', 'single-hairline'],
  memo: ['heavy-ink', 'single-hairline'],
  minutes: ['gratiot-ledger', 'single-hairline'],
  report: ['heavy-ink', 'gratiot-ledger'],
  sermon: ['liturgical-field-notes', 'cantors-nave'],
  'order-of-service': ['vellum-and-brass', 'liturgical-field-notes'],
  bulletin: ['vellum-and-brass', 'cantors-nave'],
  devotional: ['cantors-nave', 'vellum-and-brass'],
  newsletter: ['chiaroscuro-gazette', 'field-report-gazette', 'mimeograph-witness'],
  article: ['chiaroscuro-gazette', 'field-report-gazette'],
  'impact-report': ['chiaroscuro-gazette', 'mimeograph-witness'],
  essay: ['clear-manuscript', 'dutch-interior'],
  'lesson-plan': ['field-studies', 'clear-manuscript'],
  'study-guide': ['field-studies', 'dutch-interior'],
  'grant-narrative': ['field-studies', 'clear-manuscript'],
  resume: ['systemic-monolith', 'instrument-hairline'],
  'cover-letter': ['instrument-hairline', 'systemic-monolith'],
  'event-program': ['attic-measure', 'vellum-and-brass'],
  chapter: ['canonical-octavo', 'quiet-copy-press'],
  poem: ['canonical-octavo'],
  journal: ['quiet-copy-press'],
  'short-story': ['quiet-copy-press', 'canonical-octavo'],
};

export const DOC_TEMPLATES: DocTemplate[] = DOC_STRUCTURES.flatMap(s =>
  (PAIRS[s.id] ?? []).filter(id => themes.has(id)).map(themeId => ({ id: `${s.id}--${themeId}`, name: s.name, family: s.family, blurb: s.blurb, structureId: s.id, themeId })));

export const templateById = (id: string) => DOC_TEMPLATES.find(t => t.id === id);
