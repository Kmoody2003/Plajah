// Render sample worksheet pages to standalone SVG strings through Tela's own static renderer (for docs/marketing).
//   npx esbuild scripts/yearCurriculum/renderPages.tsx --bundle --platform=node --format=esm --jsx=automatic --outfile=<tmp>/render.mjs && node <tmp>/render.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { TelaStaticSvg } from '../../components/tela/TelaVector';
import { expandYear } from '../../services/yearCurriculum/yearPlan';
import { buildWorksheet } from '../../services/yearCurriculum/worksheetBuilder';
import { worksheetToTela, PAGE_W, PAGE_H } from '../../services/yearCurriculum/telaWorksheet';
import type { AdaptProfile, YearGrade, YearSubject } from '../../services/yearCurriculum/types';

const out = process.argv[2] || '.';
mkdirSync(out, { recursive: true });
const shots: Array<[string, YearGrade, YearSubject, number, AdaptProfile, number]> = [
  ['k-math', 'k', 'math', 12, { tier: 'core' }, 0],
  ['g3-ela', 'g3', 'ela', 6, { tier: 'core' }, 0],
  ['g3-ela-q', 'g3', 'ela', 6, { tier: 'core' }, 1],
  ['g5-math-core', 'g5', 'math', 22, { tier: 'core' }, 0],
  ['g5-math-support', 'g5', 'math', 22, { tier: 'support', interests: ['soccer'] }, 0],
  ['g5-math-dyslexic', 'g5', 'math', 22, { tier: 'core', identities: ['dyslexic'], supports: { easyRead: true, readQuestions: true, lineFocus: true } }, 0],
  ['g7-math', 'g7', 'math', 47, { tier: 'stretch' }, 0],
];
for (const [name, g, s, day, profile, page] of shots) {
  const l = expandYear(g, s)[day - 1];
  const ws = buildWorksheet(l, profile);
  const { pages, theme } = worksheetToTela(ws, { now: 0 });
  const p = pages.filter(x => !x.teacher)[page] || pages[0];
  const svg = renderToStaticMarkup(<TelaStaticSvg objects={p.objects} width={PAGE_W} height={PAGE_H} />);
  writeFileSync(`${out}/${name}.svg`, svg);
  console.log(name, l.title, '|', theme.name, '|', ws.adaptations.join(' / ').slice(0, 120), '|', (svg.length / 1024).toFixed(0) + 'KB');
}
