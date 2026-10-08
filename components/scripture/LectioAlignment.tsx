import React, { useEffect, useState } from 'react';
import { BOOKS } from '../../services/bibleService';
import { formatRef, type ScriptureRef } from '../../services/scriptureRef';
import { loadAlignmentBook, loadStrongIndex, findStrongOccurrences, occurrenceRef, greekSourceForms, type AlignedSegment, type StrongIndex } from '../../services/lectioAlignment';
export default function LectioAlignment({ current, slug, onStrong, onNavigate }: { current: ScriptureRef; slug: string; onStrong: (id: string) => void; onNavigate: (ref: ScriptureRef) => void }) {
  const [segments, setSegments] = useState<AlignedSegment[] | null>(null), [selected, setSelected] = useState<AlignedSegment | null>(null);
  const [strongId, setStrongId] = useState(''), [index, setIndex] = useState<StrongIndex | null>(null), [error, setError] = useState('');
  const [book, setBook] = useState(0), [page, setPage] = useState(0), [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true; setSegments(null); setSelected(null); setError(''); setStrongId('');
    loadAlignmentBook(current.book).then(data => {
      if (!live) return;
      const verse = data.verses[`${current.chapter}:${current.verse ?? 1}`];
      if (!verse) { setError('This reference has no KJV source alignment.'); return; }
      setSegments(verse);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [current.book, current.chapter, current.verse, retry]);
  const hits = index && strongId ? findStrongOccurrences(index, strongId, book) : [];
  async function choose(id: string) {
    setStrongId(id); setPage(0); onStrong(id); setBusy(true); setError('');
    try { setIndex(await loadStrongIndex()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-[#e3c57e]/25 p-3 text-xs text-white/70">
    <h3 className="font-semibold text-[#e3c57e]">Passage word links · {formatRef({ ...current, verse: current.verse ?? 1 })}</h3>
    <p>CrossWire KJV 3.1 tagged edition. {slug !== 'kjv' && 'These tags belong to the KJV; they are not aligned to your selected translation.'}</p>
    <p className="text-white/40">Select a tagged English phrase. Groups can represent several source words. Untagged words have no inferred link.</p>
    {error && <p role="alert">{error} <button className="underline" onClick={() => { if (segments && strongId) void choose(strongId); else setRetry(n => n + 1); }}>Retry word links</button></p>}
    {!segments && !error && <p>Loading passage word links…</p>}
    <div className="leading-8">{segments?.map((segment, i) => segment.strong?.length ? <button key={i} aria-label={`Study word group ${i + 1}: ${segment.text}`} className={`rounded px-1 text-[#e3c57e] underline decoration-dotted ${selected === segment ? 'bg-white/15' : ''}`} onClick={() => { setSelected(segment); void choose(segment.strong![0]); }}>{segment.text}</button> : <span key={i}>{segment.text}</span>)}</div>
    {selected && <article className="space-y-2 border-t border-white/10 pt-2"><p className="font-semibold">{selected.text}</p>
      <div className="flex flex-wrap gap-2">{selected.strong?.map(id => <button key={id} className="rounded border border-white/20 px-2 py-1" onClick={() => void choose(id)}>{id}</button>)}</div>
      {!!greekSourceForms(selected).length && <p>Source Greek forms: <span lang="grc">{greekSourceForms(selected).join(' · ')}</span></p>}
      {selected.morph && <p>Source grammatical codes: <code>{selected.morph}</code></p>}
      <p className="text-white/40">Codes are retained exactly from the source. Hebrew StrongMorph codes and Greek Robinson codes use different systems.</p>
    </article>}
    {strongId && <div className="space-y-2"><h4 className="font-semibold">{strongId} · tagged concordance</h4>
      <select aria-label="Strong concordance book" className="w-full rounded bg-[#100c18] p-2" value={book} onChange={e => { setBook(Number(e.target.value)); setPage(0); }}><option value={0}>All books</option>{BOOKS.map(b => <option key={b.num} value={b.num}>{b.name}</option>)}</select>
      {busy ? <p>Loading complete Strong index…</p> : index && <><p>{hits.reduce((n, row) => n + row[3], 0).toLocaleString()} tagged groups in {hits.length.toLocaleString()} verses</p><p className="text-white/40">Counts measure English source groups carrying this identifier, not original-language word frequency.</p>
        {hits.slice(page * 20, (page + 1) * 20).map(row => <button key={row.slice(0, 3).join('/')} className="block text-[#e3c57e] underline" onClick={() => onNavigate(occurrenceRef(row))}>{formatRef(occurrenceRef(row))} · {row[3]} groups</button>)}
        {hits.length > 20 && <div className="flex justify-between"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous occurrences</button><span>{page + 1}/{Math.ceil(hits.length / 20)}</span><button disabled={(page + 1) * 20 >= hits.length} onClick={() => setPage(p => p + 1)}>Next occurrences</button></div>}
      </>}
    </div>}
    <a className="block underline" href="https://gitlab.com/crosswire-bible-society/kjv" target="_blank" rel="noopener noreferrer">CrossWire source, edition and attribution</a>
  </section>;
}
