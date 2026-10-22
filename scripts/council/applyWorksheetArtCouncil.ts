// Fold the Art Council's worksheet sessions (docs/academia/worksheet-council/*.json) into
// data/yearCurriculum/councilThemes.ts. Values are validated: hex colors, known fonts/motifs/headers, and the ink must
// keep ≥ 7:1 contrast on the paper, or the field keeps the seed value.
//   npx tsx scripts/council/applyWorksheetArtCouncil.ts
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const dir = 'docs/academia/worksheet-council';
const out = 'data/yearCurriculum/councilThemes.ts';
const HEX = /^#[0-9a-f]{6}$/i;
const FONTS = ['Andika', 'Fredoka', 'Lexend', 'Outfit', 'Inter', 'Manrope', 'Space Grotesk', 'Bricolage Grotesque', 'Newsreader', 'Noto Serif', 'Archivo'];
const MOTIFS = ['leaves', 'waves', 'kente', 'seigaiha', 'stars', 'circuit', 'confetti', 'halftone', 'botanical', 'flourish', 'zellige', 'bauhaus'];
const HEADERS = ['band', 'arch', 'ribbon', 'frame'];
const HOUSES = ['CLASSICAL', 'REBEL', 'FUTURIST', 'WORLD_ECLECTIC', 'BAROQUE', 'RADICAL_MINIMAL'];

const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const builds: Record<string, any> = {};
const extras: any[] = [];
for (const f of existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith('.json') && !n.includes('deliberation') && !n.startsWith('local-')) : []) {
  const b = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  const t = b.theme || {};
  const v: Record<string, unknown> = {};
  for (const k of ['paper', 'ink', 'accent', 'accent2', 'wash']) if (HEX.test(t[k] || '')) v[k] = t[k];
  if (v.paper && v.ink && contrast(v.ink as string, v.paper as string) < 7) { console.log(`${f}: ink/paper contrast too low, keeping seed ink+paper`); delete v.ink; delete v.paper; }
  if (FONTS.includes(t.headFont)) v.headFont = t.headFont;
  if (FONTS.includes(t.bodyFont)) v.bodyFont = t.bodyFont;
  if (MOTIFS.includes(t.motif)) v.motif = t.motif;
  if (HEADERS.includes(t.header)) v.header = t.header;
  if (typeof t.note === 'string') v.note = t.note.slice(0, 240);
  if (typeof t.name === 'string') v.name = t.name.slice(0, 40);
  if (b.base) builds[b.base] = v;
  else if (['paper', 'ink', 'accent', 'accent2', 'wash', 'headFont', 'bodyFont', 'motif', 'header'].every(k => k in v)) {
    extras.push({ id: b.id, house: HOUSES.includes(b.house) ? b.house : 'WORLD_ECLECTIC', bands: b.bands, source: 'council', note: '', name: 'Council theme', ...v });
  }
}

writeFileSync(out, `// Written by scripts/council/applyWorksheetArtCouncil.ts from the Art Council's worksheet sessions
// (docs/academia/worksheet-council/*.json). Seed themes live in services/yearCurriculum/worksheetThemes.ts; an entry
// here overrides the seed's palette/type/motif with what the council decided.
import type { WorksheetTheme } from '../../services/yearCurriculum/worksheetThemes';

export const COUNCIL_THEME_BUILDS: Record<string, Partial<WorksheetTheme>> = ${JSON.stringify(builds, null, 2)};

export const COUNCIL_EXTRA_THEMES: WorksheetTheme[] = ${JSON.stringify(extras, null, 2)};
`);
console.log(`Applied ${Object.keys(builds).length} refinements and ${extras.length} new themes → ${out}`);
