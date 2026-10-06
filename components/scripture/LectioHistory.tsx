import React, { useMemo, useState } from 'react';
import { HISTORICAL_EVIDENCE } from '../../data/sacredLibrary/historicalEvidence';
import { evidenceForPassage, searchHistoricalEvidence } from '../../services/lectioHistory';
import { parseRef, type ScriptureRef } from '../../services/scriptureRef';
import { pinResearchSource } from '../../services/sacredResearch';
const field = 'w-full rounded-lg border border-white/15 bg-[#100c18] p-2 text-xs text-white';
export default function LectioHistory({ current, onNavigate }: { current: ScriptureRef; onNavigate: (ref: ScriptureRef) => void }) {
  const [scope, setScope] = useState<'passage' | 'all'>('passage'), [query, setQuery] = useState(''), [kind, setKind] = useState(''), [era, setEra] = useState('');
  const [status, setStatus] = useState('');
  const entries = useMemo(() => searchHistoricalEvidence(query, kind, era, scope === 'passage' ? evidenceForPassage(current) : HISTORICAL_EVIDENCE), [scope, query, kind, era, current.book, current.chapter]);
  return <section className="space-y-3 text-xs leading-relaxed text-white/70">
    <h3 className="font-semibold text-[#e3c57e]">History & archaeology</h3>
    <p>Museum records, inscriptions, manuscripts, and their historical context. Scripture links are editorial study connections.</p>
    <div className="flex gap-3"><button className={scope === 'passage' ? 'text-[#e3c57e]' : ''} onClick={() => setScope('passage')}>This chapter</button><button className={scope === 'all' ? 'text-[#e3c57e]' : ''} onClick={() => setScope('all')}>Explore timeline</button></div>
    <input aria-label="Search historical evidence" className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Place, artifact, person, passage…" />
    <select aria-label="Evidence kind" className={field} value={kind} onChange={e => setKind(e.target.value)}><option value="">All evidence types</option>{['inscription','relief','manuscript','architecture'].map(k => <option key={k}>{k}</option>)}</select>
    <select aria-label="Historical era" className={field} value={era} onChange={e => setEra(e.target.value)}><option value="">All periods</option>{[...new Set(HISTORICAL_EVIDENCE.map(e => e.era))].map(value => <option key={value}>{value}</option>)}</select>
    <p>{entries.length} entries · curated collection of {HISTORICAL_EVIDENCE.length}</p>
    {status && <p role="status">{status}</p>}
    {!entries.length && <p>No entry in this collection matches. This does not mean the chapter has no historical evidence. Explore the timeline or change the filters.</p>}
    {entries.map(e => <article key={e.id} className="space-y-2 rounded-xl border border-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wider text-[#e3c57e]">{e.era} · {e.kind}</p><h4 className="text-sm font-semibold text-white">{e.title}</h4>
      <p>{e.date.label}</p><p className="text-white/40">Dating: {e.date.basis}</p>
      <p>{e.place} · {e.material}</p><p className="text-white/40">{e.catalogId}</p>
      <p><strong className="text-white/85">Evidence:</strong> {e.observation}</p><p><strong className="text-white/85">Study connection:</strong> {e.significance}</p>
      <p><strong className="text-amber-200/80">Limits & interpretation:</strong> {e.limits}</p>
      <details><summary className="cursor-pointer text-[#e3c57e]">Research questions</summary>{e.questions.map(q => <p className="mt-2" key={q}>{q}</p>)}</details>
      <div className="flex flex-wrap gap-2">{e.passages.map(p => <button key={p} className="text-[#e3c57e] underline" onClick={() => { const ref = parseRef(p); if (ref) onNavigate(ref); }}>{p}</button>)}</div>
      {e.sources.map(source => <a key={source.url} className="block text-[#e3c57e] underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.institution} · {source.title}</a>)}
      <button className="rounded-md border border-white/15 px-2 py-1" onClick={() => {
        try { pinResearchSource({ id: `history/${e.id}`, faith: 'christianity', kind: 'artifact', title: e.title, locator: e.catalogId,
          edition: `${e.date.label} · source records checked ${e.checked}`, sourceUrl: e.sources[0].url,
          text: `Evidence: ${e.observation}\nStudy connection: ${e.significance}\nLimits: ${e.limits}\nSources:\n${e.sources.map(s => `${s.institution}: ${s.url}`).join('\n')}` }); setStatus('Evidence saved to the shared notebook.'); }
        catch { setStatus('Saving failed. Device storage may be unavailable.'); }
      }}>Save evidence to notebook</button><p className="text-white/35">Source records checked {e.checked}</p>
    </article>)}
  </section>;
}
