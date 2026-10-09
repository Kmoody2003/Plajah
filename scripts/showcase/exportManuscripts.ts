// exportManuscripts: turn the showcase story data into readable manuscripts for human vetting.
//   npx tsx scripts/showcase/exportManuscripts.ts
// Writes docs/showcase/manuscripts/<book-id>.md and docs/showcase/STORIES.md (all six in one document). Always regenerate after editing a book.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SHOWCASE_BOOKS } from '../../data/showcase';
import type { ShowcaseBook } from '../../data/showcase/types';
import { measure } from '../../services/showcase/storyMetrics';

const BEAT_LABEL: Record<string, string> = {
  cover: 'Cover', hero: 'Full-page scene', vignette: 'Framed scene', strip: 'Panel strip', quiet: 'Quiet page', reveal: 'Big reveal',
  panorama: 'Wide panorama', activity: 'Activity page', closing: 'Ending', back: 'Back cover',
};

function pokeeNotes(id: string): string[] {
  const f = path.join('docs', 'showcase', 'analysis', `${id}.json`);
  if (!existsSync(f)) return [];
  try {
    const r = JSON.parse(readFileSync(f, 'utf8')).report ?? {};
    const out: string[] = [];
    if (r.structure?.notes) out.push(`**Structure:** ${r.structure.notes}`);
    if (r.readAloud?.bestLine) out.push(`**Best line (Pokee's pick):** ${String(r.readAloud.bestLine).replace(/\n/g, ' / ')}`);
    for (const s of (r.suggestions ?? [])) if (s && typeof s === 'object') out.push(`**Suggestion, spread ${s.spread} (${s.kind}):** ${s.why}`);
    return out;
  } catch { return []; }
}

function manuscript(b: ShowcaseBook): string {
  const m = measure(b);
  const L: string[] = [];
  L.push(`# ${b.title}`);
  L.push(`*For ages ${b.ageMin}-${b.ageMax}  |  ${b.medium}  |  ${m.storyWords} words  |  ${b.spreads.length} pages (spreads) incl. cover and back*`);
  L.push('');
  L.push(`**One line:** ${b.logline}`);
  L.push(`**Theme:** ${b.theme}`);
  if (b.refrain) L.push(`**Refrain the child can join in on:** "${b.refrain}"`);
  L.push(`**Back-cover blurb:** ${b.blurb}`);
  L.push('');
  L.push('## Characters');
  for (const c of b.characters) {
    L.push(`- **${c.name}**, ${c.kind} (${c.role}). ${c.personality.join(', ')}. *Voice:* ${c.voice} *Signature:* ${c.signature} *Arc:* ${c.arc}`);
  }
  L.push('');
  L.push('## The story, page by page');
  L.push('*Read it aloud. The words in plain text are exactly what is printed on each page. The italic line is what the picture shows (not printed).*');
  L.push('');
  for (const s of b.spreads) {
    L.push(`### Page ${s.n}: ${BEAT_LABEL[s.beat] ?? s.beat}`);
    if (s.text.trim()) L.push(...s.text.split('\n').map(line => `> ${line}`));
    else L.push('> *(no words on this page)*');
    L.push('');
    L.push(`*Picture: ${s.art}*`);
    if (s.turn) L.push(`*Page turn sets up: ${s.turn}*`);
    L.push('');
  }
  L.push('## Questions to ask while reading together');
  b.discussion.forEach((q, i) => L.push(`${i + 1}. ${q}`));
  if (b.glossary?.length) { L.push(''); L.push('## Words to know'); for (const g of b.glossary) L.push(`- **${g.word}**: ${g.meaning}`); }
  L.push('');
  L.push('## Reading-level numbers (so you can vet the age fit)');
  L.push(`- Story words: ${m.storyWords}  |  average sentence: ${m.avgSentenceWords} words  |  longest sentence: ${m.longestSentenceWords} words  |  most words on one page: ${m.maxWordsOnASpread}`);
  L.push(`- Reading grade estimate (Flesch-Kincaid): ${m.fkGrade}  |  refrain appears ${m.refrainCount} times`);
  const notes = pokeeNotes(b.id);
  if (notes.length) { L.push(''); L.push("## Pokee's editor notes (AI second opinion; already acted on where noted in docs/SHOWCASE_BOOKS.md)"); L.push(...notes.map(n => `- ${n}`)); }
  L.push('');
  L.push('## Remix ideas');
  b.remixIdeas.forEach(r => L.push(`- ${r}`));
  L.push('');
  L.push(`*License: CC BY 4.0, free to remix with credit to ${b.author}. ${b.aiDisclosure}*`);
  L.push('');
  return L.join('\n');
}

const dir = path.join('docs', 'showcase', 'manuscripts');
mkdirSync(dir, { recursive: true });
const all: string[] = [
  '# Plajah Showcase Books: all six stories',
  '',
  'For vetting. Six original children\'s books, youngest to oldest. Each section is the full story page by page, then the characters, discussion questions and reading-level numbers. Regenerate with `npx tsx scripts/showcase/exportManuscripts.ts`.',
  '',
  '| # | Book | Ages | Art style | Words |', '|---|---|---|---|---|',
  ...SHOWCASE_BOOKS.map((b, i) => `| ${i + 1} | ${b.title} | ${b.ageMin}-${b.ageMax} | ${b.medium} | ${measure(b).storyWords} |`),
  '',
];
for (const b of SHOWCASE_BOOKS) {
  const md = manuscript(b);
  writeFileSync(path.join(dir, `${b.id}.md`), md);
  all.push('\n---\n', md);
}
writeFileSync(path.join('docs', 'showcase', 'STORIES.md'), all.join('\n'));
console.log(`wrote ${SHOWCASE_BOOKS.length} manuscripts + docs/showcase/STORIES.md`);
