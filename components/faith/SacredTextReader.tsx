import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, Search, BookmarkPlus, Download } from 'lucide-react';
import { worksForFaith, type FaithId, type SacredWork } from '../../data/sacredLibrary/readerCatalog';
import { loadSacredSection, cachedSacredSections, fetchSacredJson } from '../../services/sacredReaderService';
import type { SacredSection, SacredSegment } from '../../services/sacredReaderCore';
import { occurrenceCount } from '../../services/lectioConcordance';
import { pinResearchSource, researchSourceId } from '../../services/sacredResearch';
import { sacredReaderNotes } from '../../services/readerNotes';
import ResearchNotebook from './ResearchNotebook';
import { SUTRA_GLOSSARY } from '../../data/sacredLibrary/sutras';
const field = 'rounded-lg border border-white/15 bg-[#100c18] px-3 py-2 text-sm text-white';
const surfaces = {
  paper: { background: 'linear-gradient(180deg,#f6f0e1,#eae0c9)', color: '#282116' },
  sepia: { background: '#21180e', color: '#efe2c7' },
  night: { background: '#100d16', color: '#e6dfee' },
};
interface Props { faith: FaithId; name: string; accent: string; onBack: () => void; }
interface Hit { data: SacredSection; segment: SacredSegment; }

export default function SacredTextReader({ faith, name, accent, onBack }: Props) {
  const works = worksForFaith(faith);
  const [workId, setWorkId] = useState(works[0]?.id ?? '');
  const work = works.find(w => w.id === workId) ?? works[0];
  const [section, setSection] = useState(1), [customRef, setCustomRef] = useState(''), [activeRef, setActiveRef] = useState('');
  const [data, setData] = useState<SacredSection | null>(null), [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [tab, setTab] = useState<'notes' | 'search' | 'notebook'>('notes');
  const [query, setQuery] = useState(''), [hits, setHits] = useState<Hit[]>([]), [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(0), [reload, setReload] = useState(0);
  const [surface, setSurface] = useState<keyof typeof surfaces>('paper');
  // Passage notes live in the shared notebook (services/readerNotes).
  const [notes, setNotes] = useState<Record<string, string>>(() => sacredReaderNotes.read());
  useEffect(() => {
    let dead = false;
    const unsubscribe = sacredReaderNotes.subscribe(() => { if (!dead) setNotes(sacredReaderNotes.read()); });
    void sacredReaderNotes.sync().then(n => { if (!dead) setNotes(n); });
    return () => { dead = true; unsubscribe(); };
  }, []);
  const [originals, setOriginals] = useState<Record<string, string>>({}), [showOriginal, setShowOriginal] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const cancel = useRef(false), searchGeneration = useRef(0), originalGeneration = useRef(0);
  const pendingSelection = useRef('');
  const segmentElements = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => () => { cancel.current = true; searchGeneration.current++; originalGeneration.current++; }, []);
  useEffect(() => {
    let live = true;
    if (!work) return;
    setLoading(true); setData(null); setError(''); setOriginals({}); originalGeneration.current++;
    loadSacredSection(work, section, activeRef || undefined).then(({ data: value, saved }) => {
      if (!live) return; setData(value); setSelectedId(pendingSelection.current); pendingSelection.current = '';
      setStatus(saved ? 'This section is available offline on this device.' : 'Available for this session; offline storage is unavailable.');
    }).catch(e => { if (live) setError(`${e.message} You can also read at the source link below.`); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [workId, section, activeRef, reload]);
  useEffect(() => { if (selectedId) segmentElements.current[selectedId]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [data, selectedId]);
  const selected = data?.segments.find(s => s.id === selectedId);
  const noteKey = data && selected ? `${data.workId}/${data.title}/${data.edition}/${selected.id}` : '';
  const updateNote = (text: string) => {
    const next = { ...notes, [noteKey]: text }; setNotes(next);
    try { sacredReaderNotes.write(noteKey, text); setStatus('Note saved to your notebook.'); }
    catch { setStatus('The note could not be saved. Copy it before leaving.'); }
  };
  const pin = () => {
    if (!selected || !data) return;
    try { pinResearchSource({ id: researchSourceId(faith, data.workId, `${data.title}/${selected.id}`, data.edition),
      faith, kind: 'passage', title: activeRef ? data.title : work.title, locator: selected.locator, edition: data.edition, text: selected.text,
      original: selected.original ?? originals[selected.id], sourceUrl: data.sourceUrl,
      rights: `${data.rights}${originals[selected.id] ? `\nArabic original: Quran Uthmani · Al Quran Cloud · https://api.alquran.cloud/v1/surah/${section}/quran-uthmani` : ''}` }); setStatus('Passage saved to the shared research notebook.'); }
    catch { setStatus('The passage could not be saved. Export your notebook or check device storage.'); }
  };
  const runSearch = async () => {
    const generation = ++searchGeneration.current; setSearching(true); setSearchPage(0);
    try { const chapters = await cachedSacredSections(work);
      const found = chapters.flatMap(chapter => chapter.segments.filter(segment => occurrenceCount(`${segment.text} ${segment.original ?? ''}`, query, 'all') > 0).map(segment => ({ data: chapter, segment })));
      if (generation === searchGeneration.current) { setHits(found); setStatus(`Searched ${chapters.length} cached sections of ${work.title}.`); }
    } catch { setStatus('Local search could not be completed.'); } finally { if (generation === searchGeneration.current) setSearching(false); }
  };
  const download = async () => {
    if (progress) return;
    cancel.current = false; setProgress({ done: 0, total: work.sections, failed: 0 });
    let done = 0, failed = 0;
    // Sequential remote requests respect providers and make cancellation predictable.
    for (let n = 1; n <= work.sections && !cancel.current; n++) {
      try { const result = await loadSacredSection(work, n); if (!result.saved) failed++; } catch { failed++; }
      done++; if (!cancel.current) setProgress({ done, total: work.sections, failed });
    }
    if (!cancel.current) setStatus(`Download finished: ${done - failed} sections stored, ${failed} failed or unavailable.`);
    setProgress(null);
  };
  const loadArabic = async () => {
    const generation = ++originalGeneration.current;
    try { setStatus('Loading Arabic…'); const result = await fetchSacredJson(`https://api.alquran.cloud/v1/surah/${section}/quran-uthmani`);
      if (generation !== originalGeneration.current) return;
      if (result.data?.number !== section || result.data?.edition?.identifier !== 'quran-uthmani' || !Array.isArray(result.data.ayahs)) throw Error('Unexpected Arabic edition.');
      setOriginals(Object.fromEntries(result.data.ayahs.map((a: any) => [String(a.numberInSurah), a.text])));
      setStatus('Arabic: Quran Uthmani edition · Al Quran Cloud. Arabic is loaded for this session.');
    } catch (e) { if (generation === originalGeneration.current) setStatus(`Arabic could not be loaded: ${(e as Error).message}`); }
  };
  const changeWork = (id: string) => { cancel.current = true; searchGeneration.current++; setWorkId(id); setSection(1); setActiveRef(''); setHits([]); setQuery(''); };
  const goSection = (n: number) => { setSection(n); setActiveRef(''); setSelectedId(''); };
  if (!work) return <div>No reader work is configured for this tradition.</div>;
  return <div className="fixed inset-0 z-[125] flex flex-col bg-[#08070c] text-white">
    <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-white/70"><ChevronLeft size={16} /> {name}</button>
      <h1 className="flex items-center gap-2 font-semibold" style={{ color: accent }}><BookOpen size={17} /> Sacred text reader</h1>
    </header>
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <main className="min-h-0 min-w-0 flex-1 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <select aria-label="Sacred work" className={`${field} max-w-full`} value={work.id} onChange={e => changeWork(e.target.value)} disabled={!!progress}>{works.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}</select>
          <button aria-label="Previous section" disabled={section <= 1 || !!activeRef} className="disabled:opacity-30" onClick={() => goSection(section - 1)}><ChevronLeft size={18} /></button>
          <label className="text-xs text-white/60">{work.sectionLabel} <select className={field} aria-label={work.sectionLabel} value={section} onChange={e => goSection(Number(e.target.value))}>{Array.from({ length: work.sections }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
          <button aria-label="Next section" disabled={section >= work.sections || !!activeRef} className="disabled:opacity-30" onClick={() => goSection(section + 1)}><ChevronRight size={18} /></button>
          {work.provider === 'quran' && <button className="text-xs" onClick={() => { void loadArabic(); }}>Load Arabic alongside</button>}
          <label className="text-xs"><input type="checkbox" checked={showOriginal} onChange={e => setShowOriginal(e.target.checked)} /> Show original</label>
          <select aria-label="Reading surface" className={field} value={surface} onChange={e => setSurface(e.target.value as keyof typeof surfaces)}><option value="paper">Paper</option><option value="sepia">Sepia</option><option value="night">Night</option></select>
        </div>
        {work.provider === 'sefaria' && <form className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2" onSubmit={e => { e.preventDefault(); setActiveRef(customRef.trim()); }}>
          <input aria-label="Jewish text reference" className={`${field} flex-1`} value={customRef} onChange={e => setCustomRef(e.target.value)} placeholder="Explore another Jewish text: Berakhot 2a, Pirkei Avot 1…" maxLength={160} />
          <button className="text-xs" disabled={!customRef.trim()}>Read reference</button>
        </form>}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-10" style={surfaces[surface]}>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-serif text-2xl">{data?.title ?? work.title}</h2>
            <p className="mt-2 text-xs leading-relaxed opacity-60">{data?.edition ?? work.edition}</p>
            <p className="mt-2 text-xs leading-relaxed opacity-60">{work.coverage}</p>
            {loading && <p role="status" className="py-10">Loading the source text…</p>}
            {error && <div className="my-6"><p role="alert">{error}</p><button className="mt-2 text-sm underline" onClick={() => setReload(v => v + 1)}>Retry loading this section</button></div>}
            <div className="mt-7 space-y-4">
              {data?.segments.map(segment => <article key={segment.id} ref={el => { segmentElements.current[segment.id] = el; }} className={`rounded-lg border p-3 ${selectedId === segment.id ? 'border-[#947133] bg-[#d4af37]/15' : 'border-transparent'}`}>
                <button className="mb-2 text-xs font-semibold underline decoration-dotted" onClick={() => { setSelectedId(segment.id); setTab('notes'); }} aria-label={`Study ${segment.locator}`}>{segment.locator}</button>
                {showOriginal && (segment.original || originals[segment.id]) && <p dir={work.provider === 'quran' ? 'rtl' : data.originalDirection} lang={work.provider === 'quran' ? 'ar' : data.originalLanguage} className="mb-3 text-xl leading-loose">{segment.original || originals[segment.id]}</p>}
                {segment.text ? <p className="whitespace-pre-wrap font-serif text-lg leading-loose">{segment.text}</p> : <p className="text-xs opacity-60">English translation is not supplied for this segment.</p>}
                {segment.transliteration && <p className="mt-2 text-sm opacity-60">{segment.transliteration}</p>}
              </article>)}
            </div>
            <p className="mt-8 break-words text-xs opacity-60">{data?.rights}</p>
            <a className="mt-3 inline-block text-sm underline" href={data?.sourceUrl ?? work.sourceUrl} target="_blank" rel="noopener noreferrer">Read and verify at the source</a>
            {(work.provider === 'gita' || work.provider === 'dhammapada') && <a className="ml-4 text-sm underline" href={work.provider === 'gita' ? '/sacred/bhagavad-gita-arnold.txt' : '/sacred/dhammapada-muller.txt'} target="_blank" rel="noopener noreferrer">Full edition and license</a>}
          </div>
        </div>
      </main>
      <aside className="h-[40vh] shrink-0 overflow-y-auto border-t border-white/10 bg-[#0d0a13] p-4 lg:h-auto lg:w-[360px] lg:border-l lg:border-t-0">
        <nav className="mb-4 flex gap-4 text-sm">{(['notes','search','notebook'] as const).map(id => <button key={id} className={tab === id ? 'text-[#e3c57e]' : 'text-white/45'} onClick={() => setTab(id)}>{id === 'notes' ? 'Study' : id === 'search' ? 'Search' : 'Notebook'}</button>)}</nav>
        <p role="status" className="mb-4 text-xs text-white/45">{status}</p>
        {tab === 'notes' && <div className="space-y-3 text-sm text-white/70">
          {selected ? <><p style={{ color: accent }}>{selected.locator}</p><button className="flex items-center gap-2" onClick={pin}><BookmarkPlus size={16} /> Save passage to research notebook</button>
            <label className="block">Your notes<textarea rows={8} className={`${field} mt-2 w-full`} value={notes[noteKey] ?? ''} onChange={e => updateNote(e.target.value)} placeholder="Observations, questions, and sources…" /></label></> : <p>Select a passage’s reference to annotate or save it for comparison.</p>}
          {progress ? <><p>{progress.done}/{progress.total} sections · {progress.failed} unavailable</p><button onClick={() => { cancel.current = true; setStatus('Download stopped. Completed sections remain saved.'); }}>Stop download</button></> : <button className="flex items-center gap-2" onClick={() => { void download(); }}><Download size={16} /> Download this work for offline reading</button>}
          {work.provider === 'gurbani' && <p className="text-xs text-white/40">This requests up to 1,430 pages one at a time; you can stop and resume.</p>}
          {faith === 'buddhism' && <details className="border-t border-white/10 pt-3"><summary className="cursor-pointer text-[#e3c57e]">Pāli study glossary</summary><div className="mt-3 space-y-3">{SUTRA_GLOSSARY.map(term => <div key={term.term}><p className="font-semibold">{term.term} · {term.pali}</p><p className="mt-1 text-xs text-white/55">{term.gloss}</p></div>)}</div></details>}
        </div>}
        {tab === 'search' && <div className="space-y-3 text-sm text-white/70">
          <form onSubmit={e => { e.preventDefault(); void runSearch(); }} className="flex gap-2"><input aria-label="Search sacred text" className={`${field} min-w-0 flex-1`} value={query} onChange={e => { searchGeneration.current++; setSearching(false); setQuery(e.target.value); setHits([]); }} placeholder="Words in downloaded text…" /><button disabled={searching || !query.trim()} aria-label="Run sacred text search"><Search size={18} /></button></form>
          <p className="text-xs">All query words must occur in a segment. Search covers this work’s cached sections, including available originals.</p>
          <p>{hits.length} matching segments</p>
          {hits.slice(searchPage * 25, (searchPage + 1) * 25).map(hit => <button key={`${hit.data.title}/${hit.segment.id}`} className="w-full rounded-lg border border-white/10 p-2 text-left" onClick={() => {
            pendingSelection.current = hit.segment.id; setActiveRef(work.provider === 'sefaria' && !hit.data.title.startsWith(`${work.title} `) ? hit.data.title : ''); setSection(hit.data.section);
            if (data?.title === hit.data.title) { setSelectedId(hit.segment.id); pendingSelection.current = ''; } setTab('notes');
          }}><p style={{ color: accent }}>{hit.segment.locator}</p><p className="mt-1 line-clamp-3">{hit.segment.text || hit.segment.original}</p></button>)}
          {hits.length > 25 && <div className="flex justify-between"><button disabled={!searchPage} onClick={() => setSearchPage(p => p - 1)}>Previous</button><span>{searchPage + 1}/{Math.ceil(hits.length / 25)}</span><button disabled={(searchPage + 1) * 25 >= hits.length} onClick={() => setSearchPage(p => p + 1)}>Next</button></div>}
        </div>}
        {tab === 'notebook' && <ResearchNotebook />}
      </aside>
    </div>
  </div>;
}
