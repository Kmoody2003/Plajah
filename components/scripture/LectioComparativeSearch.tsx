import React, { useEffect, useRef, useState } from 'react';
import { SACRED_WORKS } from '../../data/sacredLibrary/readerCatalog';
import { loadSacredSection, cachedSacredSections } from '../../services/sacredReaderService';
import { occurrenceCount } from '../../services/lectioConcordance';
import { pinResearchSource, researchSourceId } from '../../services/sacredResearch';
import type { SacredSection, SacredSegment } from '../../services/sacredReaderCore';
interface Result { section: SacredSection; segment: SacredSegment; }
const field = 'w-full rounded-lg border border-white/15 bg-[#100c18] p-2 text-xs text-white';
export default function LectioComparativeSearch() {
  const [query, setQuery] = useState(''), [faith, setFaith] = useState(''), [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [page, setPage] = useState(0);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const search = async () => {
    const run = ++generation.current; setBusy(true); setStatus('Preparing source texts…'); setPage(0);
    try {
      const bundled = SACRED_WORKS.filter(work => ['quran', 'gita', 'dhammapada', 'sutra'].includes(work.provider) && (!faith || work.faith === faith));
      for (const work of bundled) {
        for (let n = 1; n <= work.sections; n++) { if (run !== generation.current) return; await loadSacredSection(work, n); }
      }
      const sections = (await cachedSacredSections()).filter(section => !faith || SACRED_WORKS.find(w => w.id === section.workId)?.faith === faith);
      const matches = sections.flatMap(section => section.segments.filter(segment => occurrenceCount(`${segment.text} ${segment.original ?? ''}`, query, 'all') > 0).map(segment => ({ section, segment })));
      if (run === generation.current) { setResults(matches); setStatus(`Searched ${sections.length} sections. Bundled works are complete where labeled; Jewish and Sikh results cover previously read or downloaded sections.`); }
    } catch (e) { if (run === generation.current) setStatus(`Search could not finish: ${(e as Error).message}`); }
    finally { if (run === generation.current) setBusy(false); }
  };
  return <section className="space-y-3 text-xs leading-relaxed text-white/70">
    <h3 className="font-semibold text-[#e3c57e]">Search across faith texts</h3>
    <p>Find passages containing all your query words. A wording match is a research lead; compare context and meaning in the notebook.</p>
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void search(); }}>
      <input aria-label="Cross-faith search words" className={field} placeholder="Mercy, wisdom, love…" value={query} onChange={e => { generation.current++; setBusy(false); setQuery(e.target.value); setResults([]); }} />
      <select aria-label="Cross-faith tradition filter" className={field} value={faith} onChange={e => { generation.current++; setBusy(false); setFaith(e.target.value); setResults([]); }}>
        <option value="">All available traditions</option>{['buddhism','islam','judaism','hinduism','sikhism'].map(f => <option key={f}>{f}</option>)}
      </select>
      <button className="rounded-lg border border-[#e3c57e]/30 px-3 py-2 text-[#e3c57e] disabled:opacity-40" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search source texts'}</button>
    </form>
    {status && <p role="status">{status}</p>}<p>{results.length} matching segments</p>
    {results.slice(page * 20, (page + 1) * 20).map(result => {
      const work = SACRED_WORKS.find(w => w.id === result.section.workId)!;
      return <article key={`${result.section.workId}/${result.section.title}/${result.segment.id}`} className="space-y-2 rounded-lg border border-white/10 p-3">
        <p className="text-[#e3c57e]">{work.faith} · {result.segment.locator}</p><p>{result.segment.text || result.segment.original}</p>
        <p className="text-white/40">{result.section.edition}</p>
        <a className="block underline" href={result.section.sourceUrl} target="_blank" rel="noopener noreferrer">Read in context at source</a>
        <button className="text-[#e3c57e]" onClick={() => {
          try { pinResearchSource({ id: researchSourceId(work.faith, work.id, `${result.section.title}/${result.segment.id}`, result.section.edition), faith: work.faith, kind: 'passage', title: result.section.title,
            locator: result.segment.locator, edition: result.section.edition, text: result.segment.text, original: result.segment.original,
            sourceUrl: result.section.sourceUrl, rights: result.section.rights }); setStatus('Passage saved to Notebook for comparison.'); } catch { setStatus('Saving failed. Device storage may be unavailable.'); }
        }}>Save for comparison</button>
      </article>;
    })}
    {results.length > 20 && <div className="flex justify-between"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><span>{page + 1}/{Math.ceil(results.length / 20)}</span><button disabled={(page + 1) * 20 >= results.length} onClick={() => setPage(p => p + 1)}>Next</button></div>}
  </section>;
}
