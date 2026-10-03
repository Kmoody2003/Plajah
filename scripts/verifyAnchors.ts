/**
 * Deterministic existence checks for lesson anchors. No model judgement: each anchor is looked up in an
 * authoritative registry, and anything that cannot be found is listed for a human or fact-check agent.
 *   case  -> CourtListener (a real opinion with matching party names and a filing year within 1 of the stated year)
 *   mesh  -> NLM MeSH (exact descriptor heading)
 *   drug  -> RxNorm (a known ingredient / drug name)
 * Resumable: results are cached in .cache/anchor-verify.json, so rerun after a rate limit.
 *   npx tsx scripts/verifyAnchors.ts [--kinds mesh,drug,case] [--limit 800]
 * Report: docs/review/ANCHOR_VERIFICATION.md
 */
import fs from 'node:fs';
import { COURSES, loadCurriculum } from '../services/courseCatalog';
import { buildWatchlist, parseCaseRef } from '../services/livingKnowledge/watchlist';
import { politeFetch } from '../services/livingKnowledge/http';
import { RateLimited } from '../services/livingKnowledge/types';

type Verdict = { v: 'ok' | 'fail' | 'skip' | 'check'; note?: string; at: number };
const CACHE = '.cache/anchor-verify.json';
fs.mkdirSync('.cache', { recursive: true });
const cache: Record<string, Verdict> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const kinds = new Set((arg('kinds') || 'mesh,drug,case').split(','));
const limit = Number(arg('limit') || 100000);
const save = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

const STOP = new Set(['the', 'of', 'in', 're', 'ex', 'rel', 'inc', 'co', 'corp', 'llc', 'ltd', 'a', 'an', 'and', 'et', 'al']);
const norm = (s: string) => s.toLowerCase().replace(/[.,'’"()]/g, ' ').replace(/\s+/g, ' ').trim();
const keyToken = (side: string) => norm(side).split(' ').find(t => t.length > 1 && !STOP.has(t)) || '';
const NON_US = /ICJ|PCIJ|ECtHR|ECHR|CJEU|ECJ|\bEU\b|ICC|ICTY|ICTR|IACtHR|ITLOS|WTO|Appellate Body|Arbitra|UK|House of Lords|Privy|Canada|India|Germany|France|Israel|South Africa|Australia|Japan|Kenya|Brazil|Mexico|Colombia|Hungary|Italy|Spain|Ireland|Ukraine|Kosovo|Nuremberg|IMT|Tribunal|Court of Justice|International|Inter-American|African/i;

async function checkMesh(ref: string): Promise<Verdict> {
  const r = await politeFetch(`https://id.nlm.nih.gov/mesh/lookup/descriptor?label=${encodeURIComponent(ref)}&match=exact&limit=2`, { host: 'mesh', minGapMs: 120 });
  if (!r.ok) throw new Error(`mesh ${r.status}`);
  if ((await r.json()).length) return { v: 'ok', at: Date.now() };
  const t = await politeFetch(`https://id.nlm.nih.gov/mesh/lookup/term?label=${encodeURIComponent(ref)}&match=exact&limit=2`, { host: 'mesh', minGapMs: 120 });
  const term = t.ok ? await t.json() : [];
  if (term.length) return { v: 'check', note: `entry term, not a heading: ${term[0].label}`, at: Date.now() };
  const c = await politeFetch(`https://id.nlm.nih.gov/mesh/lookup/descriptor?label=${encodeURIComponent(ref)}&match=contains&limit=3`, { host: 'mesh', minGapMs: 120 });
  const near = c.ok ? (await c.json()).map((x: any) => x.label).slice(0, 3) : [];
  return { v: 'fail', note: near.length ? `not a MeSH heading; nearest: ${near.join(' | ')}` : 'not found in MeSH', at: Date.now() };
}

async function checkDrug(ref: string): Promise<Verdict> {
  const r = await politeFetch(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(ref)}&search=2`, { host: 'rxnav', minGapMs: 80 });
  if (!r.ok) throw new Error(`rxnav ${r.status}`);
  const id = (await r.json())?.idGroup?.rxnormId;
  if (id?.length) return { v: 'ok', at: Date.now() };
  const a = await politeFetch(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(ref)}&maxEntries=1`, { host: 'rxnav', minGapMs: 80 });
  const cand = a.ok ? (await a.json())?.approximateGroup?.candidate?.[0] : null;
  return cand ? { v: 'check', note: `no exact RxNorm name; approximate match rxcui ${cand.rxcui} (score ${cand.score})`, at: Date.now() } : { v: 'fail', note: 'not found in RxNorm', at: Date.now() };
}

async function checkCase(ref: string): Promise<Verdict> {
  const { name, year, court } = parseCaseRef(ref);
  if (!name) return { v: 'fail', note: 'no case name', at: Date.now() };
  if (court && NON_US.test(court) && !/^US$/i.test(court)) return { v: 'skip', note: `non-US court (${court}); needs agent check`, at: Date.now() };
  const sides = name.split(/\s+v\.?\s+/i); if (sides.length < 2) return { v: 'check', note: 'not a "A v. B" name; agent check', at: Date.now() };
  const [t1, t2] = [keyToken(sides[0]), keyToken(sides[1])];
  const tok = process.env.COURTLISTENER_TOKEN;
  const url = `https://www.courtlistener.com/api/rest/v4/search/?type=o&order_by=score+desc&q=${encodeURIComponent(`caseName:("${name.replace(/"/g, '')}")`)}`;
  const r = await politeFetch(url, { host: 'courtlistener', minGapMs: tok ? 700 : 2600, headers: tok ? { Authorization: `Token ${tok}` } : {} });
  if (!r.ok) throw new Error(`courtlistener ${r.status}`);
  const rows: any[] = (await r.json())?.results || [];
  const hit = rows.find(x => { const n = norm(String(x.caseName || x.caseNameFull || '')); const y = Number(String(x.dateFiled || '').slice(0, 4)); return n.includes(t1) && n.includes(t2) && (!year || !y || Math.abs(y - year) <= 1); });
  if (hit) return { v: 'ok', note: `${hit.caseName} (${String(hit.dateFiled).slice(0, 4)}, ${hit.court_citation_string || hit.court_id})`, at: Date.now() };
  const near = rows.slice(0, 2).map(x => `${x.caseName} (${String(x.dateFiled).slice(0, 4)})`).join(' | ');
  return { v: 'fail', note: `no opinion matching "${name}" in ${year ?? '?'}${near ? `; nearest: ${near}` : ''}`, at: Date.now() };
}

const curricula = (await Promise.all(COURSES.filter(c => c.curriculumId && /^(law|med)-/.test(c.curriculumId)).map(c => loadCurriculum(c.curriculumId!)))).filter(Boolean) as any[];
const targets = buildWatchlist(curricula).filter(t => kinds.has(t.kind === 'mesh' ? 'mesh' : t.kind === 'drug' ? 'drug' : t.kind === 'case' ? 'case' : '-'));
let done = 0, stopped = '';
for (const t of targets) {
  if (cache[t.key] || done >= limit) continue;
  try {
    cache[t.key] = t.kind === 'mesh' ? await checkMesh(t.ref) : t.kind === 'drug' ? await checkDrug(t.ref) : await checkCase(t.ref);
    done++; if (done % 25 === 0) { save(); console.log(`  ${done} checked…`); }
  } catch (e: any) { if (e instanceof RateLimited) { stopped = e.source; break; } console.log(`  error ${t.key}: ${e.message}`); }
}
save();

const rows = targets.map(t => ({ t, v: cache[t.key] })).filter(x => x.v);
const count = (k: string, v: string) => rows.filter(x => x.t.kind === k && x.v.v === v).length;
const lines = ['# Anchor verification', '', `Generated ${new Date().toISOString().slice(0, 10)}. Deterministic lookups against CourtListener (cases), NLM MeSH (headings) and RxNorm (drugs). "fail" means the registry has no match: either the anchor is wrong or it is non-standard wording. Fix or replace each one.`, ''];
for (const k of ['case', 'mesh', 'drug']) lines.push(`- ${k}: ${count(k, 'ok')} ok, ${count(k, 'check')} to check, ${count(k, 'fail')} fail, ${count(k, 'skip')} skipped, ${targets.filter(t => t.kind === k).length - rows.filter(x => x.t.kind === k).length} not yet checked`);
for (const [v, title] of [['fail', 'Failed'], ['check', 'Needs a closer look'], ['skip', 'Skipped (non-US courts, check by agent)']] as const) {
  const list = rows.filter(x => x.v.v === v); if (!list.length) continue;
  lines.push('', `## ${title} (${list.length})`, '');
  for (const x of list) lines.push(`- [${x.t.kind}] \`${x.t.ref}\` in ${[...new Set(x.t.lessons.map(l => l.lessonId))].slice(0, 3).join(', ')}${x.v.note ? ` — ${x.v.note}` : ''}`);
}
fs.writeFileSync('docs/review/ANCHOR_VERIFICATION.md', lines.join('\n') + '\n');
console.log(`${done} checked this run${stopped ? `; ${stopped} rate limited, rerun to resume` : ''}. ${lines.slice(4, 7).join(' | ')}`);
