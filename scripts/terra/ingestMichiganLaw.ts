/**
 * Ingest Michigan law into the Terra Law Library.
 *
 *   npx tsx scripts/terra/ingestMichiganLaw.ts [--src <dir>] [--out data/terraLaw/mi] [--fetch]
 *
 * --fetch     download sources from legislature.mi.gov into --src first (polite: one file at a time,
 *             1 s apart, skips files already present).
 * --src       working folder holding "Chapter N.xml" files and a const/ folder of article PDFs
 *             (default: .terra-law-src, git-ignored).
 * --out       output folder (default data/terraLaw/mi). Writes gzipped JSON:
 *               index.json.gz        library index (chapters, constitution articles, totals, source line)
 *               search.json.gz       lightweight search rows
 *               mcl/<n>.json.gz      one file per MCL chapter
 *               constitution.json.gz the 1963 Constitution
 *
 * Requires `pdftotext` (poppler-utils) for the Constitution PDFs.
 *
 * Source: Michigan Legislature (Legislative Service Bureau), legislature.mi.gov. Hosted as an
 * UNOFFICIAL copy; see docs/TERRA_CIVIC_SESSION_NOTES.md §7 for the copyright note and the plan
 * to seek the Bureau's permission.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { decodeMclBytes, parseMclChapter, chapterStats, searchRowsForChapter, constitutionFromChapter } from '../../services/terra/law/michiganMcl';
import { parseConstitutionArticle, preambleFrom, currentThroughOf } from '../../services/terra/law/michiganConstitution';
import type { Constitution, LawLibraryIndex, LawSearchRow } from '../../services/terra/law/lawTypes';

const BASE = 'https://legislature.mi.gov/documents/mcl/';
const ARTICLES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'Schedule'];

function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const SRC = arg('--src', '.terra-law-src')!;
const OUT = arg('--out', 'data/terraLaw/mi')!;
const FETCH = process.argv.includes('--fetch');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string, dest: string) {
  if (existsSync(dest)) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': 'Plajah Terra Law Library ingest' } });
    if (res.ok) { writeFileSync(dest, Buffer.from(await res.arrayBuffer())); await sleep(1000); return; }
    if (res.status === 404) throw new Error(`404 ${url}`);
    await sleep(attempt * 5000);
  }
  throw new Error(`failed ${url}`);
}

async function fetchSources() {
  mkdirSync(join(SRC, 'const'), { recursive: true });
  const listing = await (await fetch(BASE)).text();
  const files = [...new Set([...listing.matchAll(/Chapter [0-9A-Za-z]+\.xml/g)].map((m) => m[0]))];
  console.log(`fetching ${files.length} MCL chapter files…`);
  for (const f of files) await download(BASE + encodeURIComponent(f), join(SRC, f));
  for (const a of ARTICLES) {
    await download(`${BASE}pdf/MCL-CONSTITUTION-${a.toUpperCase()}.pdf`, join(SRC, 'const', `${a.toUpperCase()}.pdf`));
  }
  await download('https://www.legislature.mi.gov/Publications/MIConstitution.pdf', join(SRC, 'const', 'MIConstitution.pdf'));
}

const gz = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 });
const pdfText = (file: string) => execFileSync('pdftotext', [file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });

async function main() {
  if (FETCH) await fetchSources();
  mkdirSync(join(OUT, 'mcl'), { recursive: true });

  // ── Constitution ─────────────────────────────────────────────────────────
  // Body text comes from MCL chapter 1 (the Legislature's structured XML of the Constitution).
  // The per-article PDFs supply the "complete through" line; the full publication supplies the
  // preamble. If chapter 1 is missing, the article PDFs are parsed as a fallback.
  let constitution: Constitution | undefined;
  let currentThrough: string | undefined;
  const constDir = join(SRC, 'const');
  const ch1 = join(SRC, 'Chapter 1.xml');
  if (existsSync(constDir)) {
    const first = join(constDir, 'I.pdf');
    if (existsSync(first)) currentThrough = currentThroughOf(pdfText(first));
  }
  let articles: Constitution['articles'] = [];
  if (existsSync(ch1)) {
    articles = constitutionFromChapter(parseMclChapter(decodeMclBytes(readFileSync(ch1)))).articles;
  } else if (existsSync(constDir)) {
    for (const a of ARTICLES) {
      const f = join(constDir, `${a.toUpperCase()}.pdf`);
      if (existsSync(f)) articles.push(parseConstitutionArticle(pdfText(f), a));
    }
  }
  if (articles.length) {
    const full = join(constDir, 'MIConstitution.pdf');
    constitution = {
      jurisdiction: 'mi',
      title: 'Constitution of the State of Michigan of 1963',
      preamble: existsSync(full) ? preambleFrom(pdfText(full)) : undefined,
      articles,
    };
    writeFileSync(join(OUT, 'constitution.json.gz'), gz(constitution));
    console.log(`constitution: ${articles.length} articles, ${articles.reduce((n, a) => n + a.sections.length, 0)} sections`);
  }

  // ── MCL chapters ─────────────────────────────────────────────────────────
  const files = readdirSync(SRC).filter((f) => /^Chapter [0-9A-Za-z]+\.xml$/.test(f) && f !== 'Chapter 1.xml'); // chapter 1 = Constitution
  const chapters: LawLibraryIndex['chapters'] = [];
  const search: LawSearchRow[] = [];
  let acts = 0, sections = 0;
  for (const f of files) {
    const ch = parseMclChapter(decodeMclBytes(readFileSync(join(SRC, f))));
    const st = chapterStats(ch);
    acts += st.acts; sections += st.sections;
    chapters.push({ n: ch.n, title: ch.title, acts: st.acts, sections: st.sections, ...(ch.repealed ? { repealed: true } : {}) });
    search.push(...searchRowsForChapter(ch));
    writeFileSync(join(OUT, 'mcl', `${ch.n}.json.gz`), gz(ch));
  }
  chapters.sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));

  // Constitution sections are searchable too.
  for (const a of constitution?.articles ?? []) {
    for (const s of a.sections) if (!s.repealed) search.push([s.id, s.num, s.catch, a.n === 'Schedule' ? 'Constitution — Schedule' : `Constitution — Article ${a.n}`, 'const']);
  }

  const index: LawLibraryIndex = {
    jurisdiction: 'mi',
    name: 'Michigan',
    source: {
      publisher: 'Michigan Legislature — Legislative Service Bureau',
      url: 'https://legislature.mi.gov',
      retrievedAt: new Date().toISOString().slice(0, 10),
      currentThrough,
      notice: 'Unofficial copy. For the official text, see legislature.mi.gov.',
    },
    chapters,
    constitution: constitution ? { articles: constitution.articles.map((a) => ({ n: a.n, title: a.title, sections: a.sections.length })) } : undefined,
    totals: { chapters: chapters.length, acts, sections },
  };
  writeFileSync(join(OUT, 'index.json.gz'), gz(index));
  writeFileSync(join(OUT, 'search.json.gz'), gz(search));
  console.log(`mcl: ${chapters.length} chapters, ${acts} acts, ${sections} sections; ${search.length} search rows → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
