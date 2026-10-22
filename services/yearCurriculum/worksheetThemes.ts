// Worksheet art direction. Twelve house styles, one per Art Council director lineage (services/council/councilDirectors),
// each a print-first palette + type pairing + motif. The council's own deliberations (scripts/council/
// runWorksheetArtCouncil.ts → data/yearCurriculum/councilThemes.ts) refine these and add new ones; whatever the council
// decides wins over the seeds below. Palettes are chosen to survive a school photocopier: ink ≥ 7:1 on paper, accents
// carry meaning only alongside shape or text.
import type { CouncilDirectorId } from '../council/councilTypes';
import type { PassageBand, Worksheet } from './types';
import { COUNCIL_THEME_BUILDS, COUNCIL_EXTRA_THEMES } from '../../data/yearCurriculum/councilThemes';
import { hashStr } from './rng';

export type Motif = 'leaves' | 'waves' | 'kente' | 'seigaiha' | 'stars' | 'circuit' | 'confetti' | 'halftone' | 'botanical' | 'flourish' | 'zellige' | 'bauhaus';
export type HeaderStyle = 'band' | 'arch' | 'ribbon' | 'frame';

export interface WorksheetTheme {
  id: string;
  name: string;
  house: CouncilDirectorId;
  bands: PassageBand[];
  paper: string;
  ink: string;
  accent: string;
  accent2: string;
  wash: string;
  headFont: string;
  bodyFont: string;
  motif: Motif;
  header: HeaderStyle;
  /** What the council (or the seed author) intended, shown in the planner's theme picker. */
  note: string;
  source: 'seed' | 'council';
}

const SEEDS: WorksheetTheme[] = [
  { id: 'meadow', name: 'Meadow', house: 'CLASSICAL', bands: ['k2', '35'], paper: '#FBF8F1', ink: '#22302A', accent: '#3C7D5B', accent2: '#E0A526', wash: '#E7F0E3', headFont: 'Fredoka', bodyFont: 'Andika', motif: 'leaves', header: 'arch', note: 'A walk outdoors: soft greens, a sun-yellow second voice, rounded type a five-year-old can read.', source: 'seed' },
  { id: 'tide', name: 'Tide', house: 'RADICAL_MINIMAL', bands: ['k2', '35', '68'], paper: '#F7FAFC', ink: '#13293D', accent: '#1B6CA8', accent2: '#E8762C', wash: '#E3EEF7', headFont: 'Outfit', bodyFont: 'Inter', motif: 'waves', header: 'band', note: 'Quiet blue water and one orange buoy — nothing on the page that is not helping.', source: 'seed' },
  { id: 'kente', name: 'Kente', house: 'WORLD_ECLECTIC', bands: ['k2', '35', '68'], paper: '#FFF9EE', ink: '#2A1A0E', accent: '#B5122B', accent2: '#E09A00', wash: '#FBEBCB', headFont: 'Bricolage Grotesque', bodyFont: 'Manrope', motif: 'kente', header: 'ribbon', note: 'Woven strip borders after Asante kente: gold, red and green in measured bands, honoring pattern as mathematics.', source: 'seed' },
  { id: 'seigaiha', name: 'Seigaiha', house: 'WORLD_ECLECTIC', bands: ['35', '68'], paper: '#F6F3EC', ink: '#1D2A44', accent: '#2E4A7D', accent2: '#C24E3B', wash: '#E4E8F0', headFont: 'Noto Serif', bodyFont: 'Manrope', motif: 'seigaiha', header: 'frame', note: 'Indigo wave scales from Japanese textile tradition; calm, repeating, focused.', source: 'seed' },
  { id: 'cosmos', name: 'Cosmos', house: 'FUTURIST', bands: ['k2', '35', '68'], paper: '#F8F7FF', ink: '#1B1640', accent: '#5B3FD9', accent2: '#00A396', wash: '#ECE8FF', headFont: 'Space Grotesk', bodyFont: 'Inter', motif: 'stars', header: 'band', note: 'Night-sky violet with a teal comet; curiosity as a design brief.', source: 'seed' },
  { id: 'circuit', name: 'Circuit', house: 'FUTURIST', bands: ['35', '68'], paper: '#F5FBF9', ink: '#0F2A2A', accent: '#0E8074', accent2: '#F0603E', wash: '#E0F2EE', headFont: 'Space Grotesk', bodyFont: 'Archivo', motif: 'circuit', header: 'band', note: 'Traces and nodes: a page that looks like it computes.', source: 'seed' },
  { id: 'confetti', name: 'Confetti', house: 'REBEL', bands: ['k2', '35'], paper: '#FFFDF7', ink: '#232323', accent: '#E63E6D', accent2: '#1FA99B', wash: '#FFE9EF', headFont: 'Fredoka', bodyFont: 'Andika', motif: 'confetti', header: 'ribbon', note: 'Party energy kept to the margins so the work area stays clean.', source: 'seed' },
  { id: 'zine', name: 'Zine', house: 'REBEL', bands: ['68'], paper: '#FFFFFF', ink: '#111111', accent: '#E0301E', accent2: '#F2C200', wash: '#FFF4CC', headFont: 'Bricolage Grotesque', bodyFont: 'Archivo', motif: 'halftone', header: 'frame', note: 'Photocopy-punk halftone and a red stamp — middle schoolers deserve swagger.', source: 'seed' },
  { id: 'atelier', name: 'Atelier', house: 'CLASSICAL', bands: ['35', '68'], paper: '#FAF7F2', ink: '#2B2522', accent: '#8C3B2E', accent2: '#A88450', wash: '#F1E8DA', headFont: 'Newsreader', bodyFont: 'Manrope', motif: 'botanical', header: 'frame', note: 'A naturalist’s notebook: pressed ferns, sepia ink, serif headings.', source: 'seed' },
  { id: 'baroque', name: 'Gilded', house: 'BAROQUE', bands: ['68'], paper: '#FBF6EC', ink: '#2C1E14', accent: '#6B2D5C', accent2: '#B8901C', wash: '#F3E6D2', headFont: 'Newsreader', bodyFont: 'Noto Serif', motif: 'flourish', header: 'frame', note: 'Aubergine and gold flourishes for literature that earns ceremony.', source: 'seed' },
  { id: 'zellige', name: 'Zellige', house: 'WORLD_ECLECTIC', bands: ['35', '68'], paper: '#FDFBF6', ink: '#16302F', accent: '#0F6E73', accent2: '#D07A25', wash: '#E2F0EF', headFont: 'Outfit', bodyFont: 'Manrope', motif: 'zellige', header: 'band', note: 'Eight-point star tilework after Moroccan zellige — geometry students can measure.', source: 'seed' },
  { id: 'bauhaus', name: 'Bauhaus', house: 'RADICAL_MINIMAL', bands: ['35', '68'], paper: '#F4F1EA', ink: '#1A1A1A', accent: '#D9482B', accent2: '#2A7AA3', wash: '#ECE6D8', headFont: 'Outfit', bodyFont: 'Inter', motif: 'bauhaus', header: 'band', note: 'Circle, square, triangle in primary color: form follows function.', source: 'seed' },
];

export const WORKSHEET_THEMES: WorksheetTheme[] = [
  ...SEEDS.map(t => (COUNCIL_THEME_BUILDS[t.id] ? { ...t, ...COUNCIL_THEME_BUILDS[t.id], source: 'council' as const } : t)),
  ...COUNCIL_EXTRA_THEMES,
];

export const themeById = (id: string) => WORKSHEET_THEMES.find(t => t.id === id) || WORKSHEET_THEMES[0];

/** The default theme for a unit: stable per unit, drawn from the themes suited to the band. */
export function themeForUnit(unitId: string, band: PassageBand): WorksheetTheme {
  const pool = WORKSHEET_THEMES.filter(t => t.bands.includes(band));
  return pool[hashStr(unitId) % pool.length];
}

const mix = (hex: string, toward: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(toward)];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

/** Sensory-friendly version: muted accents, plain paper, quieter motif. */
export function calmTheme(t: WorksheetTheme): WorksheetTheme {
  return { ...t, paper: '#FBFAF7', accent: mix(t.accent, '#7A7A7A', 0.45), accent2: mix(t.accent2, '#9A9A9A', 0.6), wash: mix(t.wash, '#F4F4F4', 0.6) };
}

export function resolveTheme(ws: Pick<Worksheet, 'themeId' | 'profile'>): WorksheetTheme {
  const t = themeById(ws.themeId);
  return ws.profile.supports?.calm || ws.profile.supports?.mutedColor ? calmTheme(t) : t;
}

/** Fonts the themes and the accessible type ladder use. Andika and Lexend are designed for early and dyslexic readers. */
export const WORKSHEET_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Fredoka:wght@400;600;700&family=Lexend:wght@400;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Newsreader:opsz,wght@6..72,500;6..72,700&family=Archivo:wght@400;600&display=swap';

export function ensureWorksheetFonts() {
  if (typeof document === 'undefined' || document.getElementById('pj-worksheet-fonts')) return;
  const l = document.createElement('link');
  l.id = 'pj-worksheet-fonts'; l.rel = 'stylesheet'; l.href = WORKSHEET_FONT_HREF;
  document.head.appendChild(l);
}
