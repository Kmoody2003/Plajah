/**
 * Run the living-knowledge ingest from the command line (also what the nightly job executes).
 *   npx tsx scripts/ingestKnowledge.ts [--budget 150] [--days 30] [--no-pubmed] [--no-courts] [--no-feeds]
 *   npx tsx scripts/ingestKnowledge.ts --check-feeds      # confirm every configured feed still returns 200
 *   npx tsx scripts/ingestKnowledge.ts --watchlist        # print what is being watched
 * Results are written to .cache/living-knowledge/*.json (the server job writes the same shapes to Firestore).
 */
import fs from 'node:fs';
import path from 'node:path';
import { COURSES, loadCurriculum } from '../services/courseCatalog';
import { buildWatchlist } from '../services/livingKnowledge/watchlist';
import { runIngest } from '../services/livingKnowledge/ingest';
import { FEEDS } from '../services/livingKnowledge/feeds';
import type { Impact, KnowledgeItem, KnowledgeSink } from '../services/livingKnowledge/types';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);

if (flag('check-feeds')) {
  for (const f of FEEDS) { const r = await fetch(f.url, { headers: { 'User-Agent': 'PlajahAcademiaBot/1.0' } }).catch(() => null); console.log(`${r?.status ?? 'ERR'}  ${f.id}  ${f.url}`); }
  process.exit(0);
}

const curricula = (await Promise.all(COURSES.filter(c => c.curriculumId && /^(law|med)-/.test(c.curriculumId)).map(c => loadCurriculum(c.curriculumId!)))).filter(Boolean) as any[];
const targets = buildWatchlist(curricula);
if (flag('watchlist')) {
  const by: Record<string, number> = {}; targets.forEach(t => { by[t.kind] = (by[t.kind] || 0) + 1; });
  console.log(`${curricula.length} courses, ${targets.length} distinct anchors`, by);
  process.exit(0);
}

const dir = path.resolve('.cache/living-knowledge'); fs.mkdirSync(dir, { recursive: true });
const file = (n: string) => path.join(dir, n);
const read = <T,>(n: string, d: T): T => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } };
const items: Record<string, KnowledgeItem> = read('items.json', {});
const impacts: Record<string, Impact> = read('impacts.json', {});
const cursors: Record<string, string> = read('cursors.json', {});
const sink: KnowledgeSink = {
  getCursor: async k => cursors[k], setCursor: async (k, v) => { cursors[k] = v; },
  putItems: async xs => { xs.forEach(x => { items[x.id] = x; }); },
  putImpacts: async xs => { xs.forEach(x => { if (!impacts[x.id]) impacts[x.id] = x; }); },
};

const summary = await runIngest({
  targets, sink, budget: Number(arg('budget') || 150), defaultDays: Number(arg('days') || 30), log: s => console.log(' ', s),
  sources: { pubmed: !flag('no-pubmed'), courts: !flag('no-courts'), feeds: !flag('no-feeds') },
});
fs.writeFileSync(file('items.json'), JSON.stringify(items, null, 1));
fs.writeFileSync(file('impacts.json'), JSON.stringify(impacts, null, 1));
fs.writeFileSync(file('cursors.json'), JSON.stringify(cursors, null, 1));
console.log(`${curricula.length} courses, ${targets.length} anchors. Checked ${summary.targetsChecked}; ${summary.items} items, ${summary.feedItems} feed items, ${summary.impacts} impacts.`);
if (summary.backedOff.length) console.log('Backed off (rate limited):', summary.backedOff.join(', '));
if (summary.errors.length) console.log(`${summary.errors.length} error(s):\n  ` + summary.errors.slice(0, 10).join('\n  '));
