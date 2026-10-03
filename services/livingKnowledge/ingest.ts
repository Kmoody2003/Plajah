/**
 * Ingestion orchestrator. Each watch target (one anchor) is checked from the day it was last
 * checked, so a slow or failed night never leaves a gap: oldest-checked targets go first and each
 * carries its own cursor. Sinks must treat putImpacts as insert-if-absent so a reviewer's
 * 'reviewed' / 'dismissed' decision is never reset by a later run.
 */
import type { Impact, KnowledgeItem, KnowledgeSink, Severity, WatchTarget } from './types';
import { RateLimited } from './types';
import { isoDay } from './http';
import * as pubmed from './pubmed';
import * as courts from './courtlistener';
import { levelLabel } from './courtlistener';
import { FEEDS, fetchFeed, mentions } from './feeds';

export interface IngestOptions {
  targets: WatchTarget[]; sink: KnowledgeSink;
  /** Max targets to check this run (a nightly job rotates through the whole list). */
  budget?: number; defaultDays?: number; now?: Date;
  /** Epoch ms after which no new target is started (request time limits). */
  deadline?: number;
  sources?: { pubmed?: boolean; courts?: boolean; feeds?: boolean };
  log?: (s: string) => void;
}
export interface IngestSummary { targetsChecked: number; items: number; impacts: number; feedItems: number; errors: string[]; backedOff: string[] }

const MEDICAL_KINDS = new Set(['mesh', 'drug', 'trial', 'guideline']);
const LEGAL_KINDS = new Set(['case', 'statute', 'regulation', 'concept']);

export function impactsFor(item: KnowledgeItem, target: WatchTarget, severity: Severity, reason: string): Impact[] {
  return target.lessons.map(l => ({
    id: `${item.id}__${l.lessonId}`, itemId: item.id, targetKey: target.key, courseId: l.courseId, lessonId: l.lessonId,
    severity, reason, state: 'open' as const, createdAt: Date.now(), itemTitle: item.title, itemUrl: item.url, itemDate: item.date,
  }));
}

export function medicalImpact(item: KnowledgeItem, target: WatchTarget): { severity: Severity; reason: string } {
  const what = target.kind === 'drug' ? `the drug ${target.ref}` : target.kind === 'trial' ? `the trial ${target.ref}` : target.kind === 'guideline' ? `the guideline "${target.ref}"` : `the topic ${target.ref}`;
  if (item.kind === 'retraction') return { severity: 'review', reason: `A paper matching ${what} is flagged as retracted in PubMed. Check whether the lesson relies on it.` };
  if (item.kind === 'guideline') return { severity: 'review', reason: `A newer guideline appeared for ${what}. Check whether recommendations the lesson teaches have changed.` };
  const label = item.kind === 'meta-analysis' ? 'meta-analysis' : item.kind === 'systematic-review' ? 'systematic review' : 'randomised trial';
  return { severity: 'new', reason: `New ${label} on ${what}.` };
}

export function legalImpact(item: KnowledgeItem, target: WatchTarget, treatment: boolean): { severity: Severity; reason: string } {
  const where = item.court ? levelLabel[item.court.level] : 'a court';
  if (treatment) return { severity: 'review', reason: `A newer opinion from ${where} mentions ${target.ref.split('|')[0]} alongside overruling language. This is a text signal, not a finding: read it before changing the lesson.` };
  return { severity: 'new', reason: `New precedential opinion from ${where} mentioning ${target.ref.split('|')[0]}.` };
}

export async function runIngest(o: IngestOptions): Promise<IngestSummary> {
  const log = o.log || (() => {}); const now = o.now || new Date();
  const use = { pubmed: true, courts: true, feeds: true, ...o.sources };
  const sum: IngestSummary = { targetsChecked: 0, items: 0, impacts: 0, feedItems: 0, errors: [], backedOff: [] };
  const blocked = new Set<string>();
  const dayMs = 86400000;

  const cursors = await Promise.all(o.targets.map(t => o.sink.getCursor(`target:${t.key}`)));
  const order = o.targets.map((t, i) => ({ t, c: cursors[i] })).sort((a, b) => (a.c || '').localeCompare(b.c || ''));

  for (const { t, c } of order) {
    if (sum.targetsChecked >= (o.budget ?? 150) || (o.deadline && Date.now() > o.deadline)) break;
    const source = t.domain === 'medicine' && MEDICAL_KINDS.has(t.kind) ? 'pubmed' : t.domain === 'law' && LEGAL_KINDS.has(t.kind) ? 'courtlistener' : null;
    if (!source || blocked.has(source)) continue;
    if ((source === 'pubmed' && !use.pubmed) || (source === 'courtlistener' && !use.courts)) continue;
    const since = c ? new Date(`${c}T00:00:00Z`) : new Date(+now - (o.defaultDays ?? 30) * dayMs);
    try {
      let items: KnowledgeItem[] = []; let impacts: Impact[] = [];
      if (source === 'pubmed') {
        const q = pubmed.queryFor(t.kind, t.ref); if (!q) continue;
        items = await pubmed.searchPubmed(q, since);
        impacts = items.flatMap(it => { const m = medicalImpact(it, t); return impactsFor(it, t, m.severity, m.reason); });
      } else {
        const q = courts.queryFor(t.kind, t.ref); if (!q) continue;
        items = await courts.searchOpinions(q.q, since);
        impacts = items.flatMap(it => { const m = legalImpact(it, t, q.treatment); return impactsFor(it, t, m.severity, m.reason); });
      }
      if (items.length) { await o.sink.putItems(items); await o.sink.putImpacts(impacts); }
      await o.sink.setCursor(`target:${t.key}`, isoDay(now));
      sum.targetsChecked++; sum.items += items.length; sum.impacts += impacts.length;
      if (items.length) log(`${t.key}: ${items.length} item(s)`);
    } catch (e: any) {
      if (e instanceof RateLimited) { blocked.add(source); sum.backedOff.push(source); log(`${source} rate limited; resuming next run`); }
      else { sum.errors.push(`${t.key}: ${e?.message || e}`); }
    }
  }

  if (use.feeds) for (const f of FEEDS) {
    try {
      const items = await fetchFeed(f); if (!items.length) continue;
      await o.sink.putItems(items); sum.feedItems += items.length;
      // Match to anchors that a newsroom would name: drugs, treaties, statutes, regulations, named concepts.
      const named = o.targets.filter(t => t.domain === f.domain && ['drug', 'treaty', 'statute', 'regulation', 'concept', 'trial'].includes(t.kind));
      const impacts = items.flatMap(it => named.filter(t => mentions(it, t.ref)).flatMap(t =>
        impactsFor(it, t, it.kind === 'safety-alert' ? 'review' : 'new', `${f.label} mentions ${t.ref.split('|')[0]}.`)));
      if (impacts.length) { await o.sink.putImpacts(impacts); sum.impacts += impacts.length; }
    } catch (e: any) { if (!(e instanceof RateLimited)) sum.errors.push(`feed ${f.id}: ${e?.message || e}`); }
  }
  return sum;
}
