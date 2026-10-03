/**
 * Step 3 of the verification pipeline: merge independent verdicts into statuses.
 *
 *   npx tsx scripts/content/merge-verdicts.ts
 *
 * Reads scripts/content/out/verdicts/<courseId>.<verifier>.json (at least two verifiers per course,
 * each answering blind), compares them with the answer key, and rewrites
 * data/practice/verificationData.ts plus docs/content-review-queue.md (the ONLY things a person has
 * to look at: disputed items). Rules are intentionally strict; when in doubt it withholds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllCourses, OUT } from './lib';

interface QVerdict { id: string; answer: number | null; confidence?: 'high' | 'medium' | 'low'; /** true when more than one choice is defensible or the question is unclear */ ambiguous?: boolean; sources?: string[]; note?: string }
interface CVerdict { lessonId: string; claim: string; verdict: 'supported' | 'contradicted' | 'unverifiable'; sources?: string[]; note?: string }
interface VerdictFile { courseId: string; verifier: string; questions: QVerdict[]; claims?: CVerdict[] }

// Only sources that resolved in check-sources.ts count. Missing file = nothing counts (run check-sources first).
const sourceCheck: Record<string, { ok: boolean }> = fs.existsSync(path.join(OUT, 'source-check.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'source-check.json'), 'utf8')) : {};
const live = (urls?: string[]) => (urls || []).filter(u => sourceCheck[u.trim()]?.ok);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const courses = await loadAllCourses();
  const vdir = path.join(OUT, 'verdicts');
  const files: VerdictFile[] = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(vdir, f), 'utf-8').replace(/^FEFF/, ''))) : [];

  const status: Record<string, any> = {};
  const flagged: Record<string, { s: 'flag' | 'fix' | 'report'; note?: string }> = {};
  const queue: string[] = [`# Content review queue`, '', `Generated ${today}. Only disputed items are listed. For each: decide the right answer from a reliable source, fix the data file, then re-run the check.`, ''];

  for (const c of courses) {
    const vs = files.filter(f => f.courseId === c.id);
    if (vs.length < 2) continue; // not enough independent checks: stays 'draft'
    let agreed = 0, flaggedQ = 0, sourced = 0;
    // Choice order: the app serves a re-balanced order (loadBank) while the raw module keeps authoring order. Checkers saw
    // whichever order was in the claims file, so work out per checker which order its answers index into, then compare TEXT.
    const { loadBank } = await import('../../data/practice');
    const balanced = new Map<string, string[]>();
    try { const b = await loadBank(c.id); for (const q of b?.questions || []) if (q.choices) balanced.set(q.id, q.choices); } catch { /* fall back to raw order */ }
    const textAt = (order: 'raw' | 'balanced', q: any, idx: number | null | undefined): string | null => {
      if (idx === null || idx === undefined) return null;
      if (q.kind === 'tf') return ['True', 'False'][idx] ?? null;
      return (order === 'balanced' ? balanced.get(q.id) : q.choices)?.[idx] ?? null;
    };
    const keyText = (q: any) => (q.kind === 'tf' ? ['True', 'False'][q.answer] : q.choices?.[q.answer]);
    const orderOf = new Map<VerdictFile, 'raw' | 'balanced'>();
    for (const v of vs) {
      let raw = 0, bal = 0;
      for (const q of c.questions) { const r = v.questions.find(x => x.id === q.id); if (textAt('raw', q, r?.answer) === keyText(q)) raw++; if (textAt('balanced', q, r?.answer) === keyText(q)) bal++; }
      orderOf.set(v, bal > raw ? 'balanced' : 'raw');
    }
    const pick = (v: VerdictFile, q: any) => { const r = v.questions.find(x => x.id === q.id); return textAt(orderOf.get(v)!, q, r?.answer); };
    for (const q of c.questions) {
      const rows = vs.map(v => v.questions.find(x => x.id === q.id));
      const allAnswered = rows.every(r => r && r.answer !== null && r.answer !== undefined);
      const allAgree = allAnswered && vs.every(v => pick(v, q) === keyText(q));
      const lowConf = rows.some(r => r?.confidence === 'low' || r?.ambiguous);
      if (allAgree && !lowConf) {
        agreed++;
        if (rows.some(r => live(r?.sources).length > 0)) sourced++;
      } else {
        flaggedQ++;
        flagged[q.id] = { s: 'flag', note: 'checkers disagreed with the key or were unsure' };
        queue.push(`## ${c.id} / ${q.id}`, `**Q:** ${q.prompt}`, `**Key:** ${keyText(q)}`,
          ...vs.map(v => { const r = v.questions.find(x => x.id === q.id); const pk = pick(v, q) ?? '(no answer)'; return `- Checker ${v.verifier}: ${pk} (${r?.confidence || '?'}) ${r?.note || ''} ${(r?.sources || []).join(' ')}`; }), '');
      }
    }
    // Lesson claims
    const claims = vs.flatMap(v => v.claims || []);
    const contradicted = claims.filter(x => x.verdict === 'contradicted');
    const supported = new Set(claims.filter(x => x.verdict === 'supported' && live(x.sources).length > 0).map(x => `${x.lessonId}|${x.claim}`));
    for (const x of contradicted) {
      flagged[x.lessonId] = { s: 'flag', note: `claim contradicted: ${x.claim}` };
      queue.push(`## ${c.id} / lesson ${x.lessonId}`, `**Claim:** ${x.claim}`, `**Verdict:** contradicted. ${x.note || ''} ${(x.sources || []).join(' ')}`, '');
    }

    const n = c.questions.length;
    const pctAgreed = n ? agreed / n : 0;
    const pctSourced = agreed ? sourced / agreed : 0;
    let st: 'draft' | 'machine-verified' | 'sourced' | 'disputed' = 'draft';
    if (contradicted.length === 0 && pctAgreed >= 0.98) st = 'machine-verified';
    if (st === 'machine-verified' && pctSourced >= 0.95 && claims.length > 0 && supported.size >= 0.9 * new Set(claims.map(x => `${x.lessonId}|${x.claim}`)).size) st = 'sourced';
    if (flaggedQ / Math.max(1, n) > 0.1 || contradicted.length > 0) st = pctAgreed < 0.9 ? 'disputed' : 'draft';
    status[c.id] = {
      status: st, authoredBy: 'ai-assisted', checkedAt: today,
      method: `${vs.length} independent blind checks (${vs.map(v => v.verifier).join(', ')}) answered every question without seeing the key${claims.length ? ', and checked the factual claims in each lesson against cited sources' : ''}. Items the checks disputed are withheld from practice.`,
      coverage: { questions: n, agreed, flagged: flaggedQ, ...(claims.length ? { claims: new Set(claims.map(x => `${x.lessonId}|${x.claim}`)).size, claimsSupported: supported.size } : {}) },
    };
  }

  // Human review decisions that must survive a re-merge (see scripts/content/resolutions.json).
  const resFile = path.join(root, 'scripts/content/resolutions.json');
  if (fs.existsSync(resFile)) {
    const res = JSON.parse(fs.readFileSync(resFile, 'utf-8')) as { resolved?: string[]; fix?: string[] };
    for (const id of res.resolved || []) delete flagged[id];
    for (const id of res.fix || []) flagged[id] = { s: 'fix', note: 'reworded after the first check; withheld until re-checked' };
  }

  // Preserve the computed-content entries from the existing file.
  const keep = {
    'math-generated': { status: 'machine-verified', authoredBy: 'computed', method: 'Every problem is generated by code; the answers are recomputed independently in automated tests.' },
    'context-math': { status: 'machine-verified', authoredBy: 'computed', method: 'Every problem is generated by code; the answers are recomputed independently in automated tests.' },
  };
  const file = fs.readFileSync(path.join(root, 'data/practice/verificationData.ts'), 'utf-8');
  const head = file.slice(0, file.indexOf('/** Courses with a known verification state.'));
  const body = `/** Courses with a known verification state. Everything else is 'draft'. GENERATED by scripts/content/merge-verdicts.ts. */
export const COURSE_STATUS: Record<string, CourseVerification> = ${JSON.stringify({ ...keep, ...status }, null, 2)};

/** Question / lesson ids withheld from practice until resolved. GENERATED by scripts/content/merge-verdicts.ts. */
export const FLAGGED: Record<string, FlaggedItem> = ${JSON.stringify(flagged, null, 2)};
`;
  fs.writeFileSync(path.join(root, 'data/practice/verificationData.ts'), head + body);
  fs.writeFileSync(path.join(root, 'docs/content-review-queue.md'), queue.join('\n'));
  const ids = Object.keys(status);
  console.log(`Courses checked: ${ids.length}. Flagged items: ${Object.keys(flagged).length}.`);
  for (const id of ids) console.log(` ${id.padEnd(22)} ${status[id].status.padEnd(17)} agreed ${status[id].coverage.agreed}/${status[id].coverage.questions}, flagged ${status[id].coverage.flagged}`);
})();
