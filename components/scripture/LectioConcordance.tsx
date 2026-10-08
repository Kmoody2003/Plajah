import React, { useEffect, useMemo, useState } from 'react';
import { editionBooks } from '../../services/bibleCanon';
import { TRANSLATIONS } from '../../services/bibleService';
import { cachedConcordanceCorpus, hydrateForSearch, localCoverage } from '../../services/scriptureText';
import { buildConcordanceIndex, searchConcordanceIndex, occurrenceCount, type MatchMode } from '../../services/lectioConcordance';
import { pinResearchSource, downloadResearchFile } from '../../services/sacredResearch';
import type { ScriptureRef } from '../../services/scriptureRef';
import { SUTRAS } from '../../data/sacredLibrary/sutras';

interface Props { slug: string; corpusVersion: unknown; selected?: { ref: ScriptureRef; text: string }; onNavigate: (ref: ScriptureRef) => void; }
const field = 'w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-xs text-white';

export default function LectioConcordance({ slug, corpusVersion, selected, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<MatchMode>('word');
  const [book, setBook] = useState(0);
  const [testament, setTestament] = useState<'' | 'OT' | 'NT'>('');
  const [ignoreAccents, setIgnoreAccents] = useState(false), [exclude, setExclude] = useState('');
  const [fromChapter, setFromChapter] = useState(''), [toChapter, setToChapter] = useState(''), [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('plajah_lectio_comparisons_v1') || '{}'); } catch { return {}; }
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([hydrateForSearch(slug), localCoverage(slug)]).then(([, value]) => {
      if (live) { setCoverage(value); setRevision(v => v + 1); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [slug, corpusVersion]);
  const index = useMemo(() => buildConcordanceIndex(cachedConcordanceCorpus(slug), ignoreAccents), [slug, revision, ignoreAccents]);
  const result = useMemo(() => searchConcordanceIndex(index, query, mode, { book, testament: testament || undefined,
    fromChapter: book ? Number(fromChapter) || undefined : undefined, toChapter: book ? Number(toChapter) || undefined : undefined, exclude }), [index, query, mode, book, testament, fromChapter, toChapter, exclude]);
  useEffect(() => setPage(0), [query, mode, book, testament, fromChapter, toChapter, ignoreAccents, exclude, revision]);
  const passages = useMemo(() => SUTRAS.flatMap(text => text.chapters.flatMap(chapter => chapter.verses.map(verse => ({
    id: `${text.id}/${chapter.id}/${verse.n}`, label: `${text.title} · ${chapter.title} · ${verse.n}`,
    text: verse.text, edition: text.translation, tradition: text.tradition,
  })))), []);
  const otherHits = passages.filter(p => occurrenceCount(p.text, query, mode) > 0);
  const other = passages.find(p => p.id === comparison);
  const noteKey = selected && other ? `${slug}/${selected.ref.book}/${selected.ref.chapter}/${selected.ref.verse}/${other.id}` : '';
  const updateNotes = (value: string) => {
    const next = { ...notes, [noteKey]: value }; setNotes(next);
    try { localStorage.setItem('plajah_lectio_comparisons_v1', JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };
  return <div className="space-y-3 text-xs text-white/70">
    <p className="font-semibold text-[#d4af37]">Concordance & comparison</p>
    <p>{TRANSLATIONS.find(t => t.slug === slug)?.label ?? slug} · {loading ? 'Loading local index…' : `${Math.round((coverage ?? 0) * 100)}% of chapters available locally`}</p>
    <p className="text-white/40">Counts cover hydrated local text. Use Search → Download for offline to expand coverage.</p>
    <input aria-label="Concordance query" className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="A word or phrase…" />
    <select aria-label="Matching mode" className={field} value={mode} onChange={e => setMode(e.target.value as MatchMode)}>
      <option value="word">Exact word</option><option value="phrase">Exact phrase</option><option value="all">All words</option><option value="any">Any word</option>
      <option value="prefix">Word begins with</option>
    </select>
    <select aria-label="Testament filter" className={field} value={testament} onChange={e => setTestament(e.target.value as '' | 'OT' | 'NT')}><option value="">Both testaments</option><option value="OT">Old Testament</option><option value="NT">New Testament</option></select>
    <label className="block"><input type="checkbox" checked={ignoreAccents} onChange={e => setIgnoreAccents(e.target.checked)} /> Ignore accents and vowel marks</label>
    <input aria-label="Exclude words" className={field} value={exclude} onChange={e => setExclude(e.target.value)} placeholder="Exclude verses containing these words…" />
    {!!book && <div className="flex gap-2"><input aria-label="First chapter" className={field} type="number" min={1} max={editionBooks(slug).find(b => b.num === book)?.chapters} placeholder="From chapter" value={fromChapter} onChange={e => setFromChapter(e.target.value)} /><input aria-label="Last chapter" className={field} type="number" min={1} max={editionBooks(slug).find(b => b.num === book)?.chapters} placeholder="To chapter" value={toChapter} onChange={e => setToChapter(e.target.value)} /></div>}
    <select aria-label="Bible book filter" className={field} value={book} onChange={e => setBook(Number(e.target.value))}>
      <option value={0}>All Bible books</option>{editionBooks(slug).map(b => <option key={b.num} value={b.num}>{b.name}</option>)}
    </select>
    {mode === 'word' && query.trim().includes(' ') && <p>Choose Exact phrase or All words for a multiword query.</p>}
    <p>{result.matches.length} verses · {result.occurrences} occurrences</p>
    {!!result.matches.length && <button className="text-[#d4af37]" onClick={() => downloadResearchFile('lectio-concordance.json', JSON.stringify({ edition: slug, query, mode, filters: { book, testament, fromChapter, toChapter, ignoreAccents, exclude }, coverage: 'Hydrated local chapters only', occurrences: result.occurrences, matches: result.matches }, null, 2), 'application/json')}>Export all cited results</button>}
    {selected && <button className="block text-[#d4af37]" onClick={() => {
      try { pinResearchSource({ id: `bible/${slug}/${selected.ref.book}/${selected.ref.chapter}/${selected.ref.verse}`, faith: 'christianity', kind: 'passage', title: selected.ref.bookName,
        locator: `${selected.ref.bookName} ${selected.ref.chapter}:${selected.ref.verse}`, edition: TRANSLATIONS.find(t => t.slug === slug)?.label ?? slug, text: selected.text,
        sourceUrl: `https://api.getbible.net/v2/${slug}/${selected.ref.book}/${selected.ref.chapter}.json` }); setStatus('Bible passage saved to the shared notebook.'); } catch { setStatus('Saving failed. Device storage may be unavailable.'); }
    }}>Save selected Bible verse to notebook</button>}
    {status && <p role="status">{status}</p>}
    <p className="text-white/40">Surface words only; translation wording does not identify an original-language lemma.</p>
    {result.books.map(([id, b]) => <button key={id} className="mr-2 text-[#d4af37]" onClick={() => setBook(id)}>{b.name}: {b.occurrences}</button>)}
    {result.matches.slice(page * 25, (page + 1) * 25).map(hit => <button key={hit.label} className="w-full rounded-lg border border-white/10 p-2 text-left hover:border-[#d4af37]/50" onClick={() => onNavigate(hit.ref)}>
      <span className="text-[#d4af37]">{hit.label} · {hit.occurrences}</span><p className="mt-1 leading-relaxed">{hit.text}</p>
    </button>)}
    {result.matches.length > 25 && <div className="flex justify-between"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>{page + 1}/{Math.ceil(result.matches.length / 25)}</span><button disabled={(page + 1) * 25 >= result.matches.length} onClick={() => setPage(p => p + 1)}>Next</button></div>}
    <div className="border-t border-white/10 pt-3 space-y-2">
      <p className="font-semibold text-[#d4af37]">Across traditions</p>
      <p>Search the bundled Buddhist excerpts using the same wording. Save passages from the other faith readers to compare them in Notebook. A shared word is a lead for study, not proof of a shared teaching.</p>
      <p className="text-white/40">{passages.length} excerpt sections · partial corpus · {otherHits.length} matching sections</p>
      {otherHits.map(p => <button key={p.id} className="w-full border border-white/10 rounded-lg p-2 text-left" onClick={() => setComparison(p.id)}>{p.label}<p className="mt-1">{p.text}</p></button>)}
      <select aria-label="Comparison passage" className={field} value={comparison ?? ''} onChange={e => setComparison(e.target.value || null)}>
        <option value="">Or choose an excerpt to compare…</option>{passages.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {other && <div className="space-y-2 rounded-lg border border-[#d4af37]/30 p-2">
        <p className="text-[#d4af37]">Comparison evidence</p>
        {selected ? <><p>{selected.ref.bookName} {selected.ref.chapter}:{selected.ref.verse} · {slug}</p><p className="leading-relaxed">{selected.text}</p></> : <p>Select a Bible verse in the reader to anchor this comparison.</p>}
        <p className="text-[#d4af37]">{other.label}</p><p className="leading-relaxed">{other.text}</p>
        <p className="text-white/40">{other.tradition} · {other.edition} · bundled excerpt; verify edition provenance before publication.</p>
        {selected && <><label htmlFor="lectio-comparison-notes">Your interpretation: similarities, differences, and context</label>
          <textarea id="lectio-comparison-notes" className={field} rows={6} value={notes[noteKey] ?? ''} onChange={e => updateNotes(e.target.value)} placeholder="Shared principle… Different meaning or purpose… Context and limits…" />
          <p>{storageError ? 'Local saving failed. Copy your notes before leaving.' : 'Notes saved on this device, linked to these passages and this Bible translation.'}</p></>}
      </div>}
    </div>
  </div>;
}
