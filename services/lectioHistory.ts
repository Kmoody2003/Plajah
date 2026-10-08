import { HISTORICAL_EVIDENCE, type HistoricalEvidence } from '../data/sacredLibrary/historicalEvidence';
import { parseRef, type ScriptureRef } from './scriptureRef';
export function evidenceForPassage(ref: ScriptureRef, entries = HISTORICAL_EVIDENCE): HistoricalEvidence[] {
  return entries.filter(e => e.passages.some(p => {
    const linked = parseRef(p); if (!linked || linked.book !== ref.book) return false;
    return ref.chapter >= linked.chapter && ref.chapter <= (linked.endChapter ?? linked.chapter);
  }));
}
export function searchHistoricalEvidence(query: string, kind = '', era = '', entries = HISTORICAL_EVIDENCE) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(e => (!kind || e.kind === kind) && (!era || e.era === era) && terms.every(term =>
    [e.title, e.place, e.catalogId, e.observation, e.significance, e.limits, ...e.passages, ...e.sources.map(s => s.institution)].join(' ').toLowerCase().includes(term)))
    .sort((a, b) => a.date.from - b.date.from || a.title.localeCompare(b.title));
}
