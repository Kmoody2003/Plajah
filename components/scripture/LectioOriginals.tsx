import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS } from '../../services/bibleService';
import { formatRef, type ScriptureRef } from '../../services/scriptureRef';
import { ORIGINAL_EDITIONS, loadOriginalBook, loadOriginalIndex, linkedOriginalVerses, originalCorpusForBook, originalLemmaKeys, originalOccurrenceNavigation, originalText, searchOriginalIndex, type OriginalBook, type OriginalIndex, type OriginalToken, type OriginalOccurrence } from '../../services/lectioOriginals';
import { decodeHebrewMorphology, decodeGreekMorphology, GRAMMAR_HELP } from '../../services/lectioMorphology';
import { pinResearchSource, researchSourceId } from '../../services/sacredResearch';
const field = 'w-full rounded-lg border border-white/15 bg-[#100c18] p-2 text-xs text-white';
export default function LectioOriginals({ current, translationText, slug, onNavigate, onStrong }: { current: ScriptureRef; translationText?: string; slug: string; onNavigate: (ref: ScriptureRef) => void; onStrong: (id: string) => void }) {
  const corpus = originalCorpusForBook(current.book), edition = ORIGINAL_EDITIONS[corpus];
  const [data, setData] = useState<OriginalBook | null>(null), [locator, setLocator] = useState(''), [selected, setSelected] = useState<OriginalToken | null>(null);
  const [index, setIndex] = useState<OriginalIndex | null>(null), [lemma, setLemma] = useState(''), [morph, setMorph] = useState(''), [bookFilter, setBookFilter] = useState(0), [page, setPage] = useState(0);
  const [error, setError] = useState(''), [searchError, setSearchError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0), [saved, setSaved] = useState('');
  const [preview, setPreview] = useState<{ data: OriginalBook; row: OriginalOccurrence } | null>(null);
  const previewRequest = useRef(0), searchRequest = useRef(0);
  useEffect(() => {
    let live = true; previewRequest.current++; searchRequest.current++;
    setData(null); setLocator(''); setSelected(null); setError(''); setSaved(''); setPreview(null); setIndex(null); setLemma(''); setMorph(''); setPage(0); setBookFilter(0); setBusy(false); setSearchError('');
    loadOriginalBook(current.book).then(value => {
      if (!live) return; setData(value);
      const links = linkedOriginalVerses(value, current);
      if (links.length) setLocator(links[0].link.locator);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [current.book, current.chapter, current.verse, retry]);
  const links = data ? linkedOriginalVerses(data, current) : [];
  const sourceVerse = data?.verses[locator], selectedLink = links.find(item => item.link.locator === locator)?.link;
  const sourceChapters = data ? [...new Set(Object.keys(data.verses).map(key => Number(key.split(':')[0])))].sort((a, b) => a - b) : [];
  const sourceChapter = Number(locator.split(':')[0]), sourceNumber = Number(locator.split(':')[1]);
  const sourceNumbers = data ? Object.keys(data.verses).filter(key => Number(key.split(':')[0]) === sourceChapter).map(key => Number(key.split(':')[1])).sort((a, b) => a - b) : [];
  const grammar = selected?.morph ? corpus === 'oshb' ? decodeHebrewMorphology(selected.morph) : decodeGreekMorphology(selected.morph) : null;
  const hits = useMemo(() => index ? searchOriginalIndex(index, { lemma, morph, book: bookFilter }) : [], [index, lemma, morph, bookFilter]);
  async function search(nextLemma: string, nextMorph: string) {
    const request = ++searchRequest.current; setLemma(nextLemma); setMorph(nextMorph); setPage(0); setBusy(true); setSearchError(''); setPreview(null); previewRequest.current++;
    try { const result = await loadOriginalIndex(corpus); if (request === searchRequest.current) setIndex(result); }
    catch (e) { if (request === searchRequest.current) setSearchError((e as Error).message); }
    finally { if (request === searchRequest.current) setBusy(false); }
  }
  async function showOccurrence(row: OriginalOccurrence) {
    const request = ++previewRequest.current; setSearchError(''); setPreview(null);
    try { const value = await loadOriginalBook(row[0]); if (request === previewRequest.current) setPreview({ data: value, row }); }
    catch (e) { if (request === previewRequest.current) setSearchError((e as Error).message); }
  }
  function savePassage() {
    if (!sourceVerse) return;
    const bookName = BOOKS.find(b => b.num === current.book)!.name;
    try { pinResearchSource({ id: researchSourceId('christianity', corpus, `${current.book}/${locator}`, edition.revision), faith: 'christianity', kind: 'passage', title: bookName, locator: `${bookName} ${locator} · ${corpus === 'oshb' ? 'WLC' : 'UGNT'} numbering`, edition: `${edition.title} · ${edition.revision.slice(0, 12)}`, text: originalText(sourceVerse), sourceUrl: edition.source, rights: `${edition.attribution}. ${edition.rights}`, original: originalText(sourceVerse) }); setSaved('Original passage saved with its edition and source numbering.'); }
    catch (e) { setSaved((e as Error).message); }
  }
  return <section className="space-y-3 text-xs leading-relaxed text-white/70">
    <h3 className="font-semibold text-[#e3c57e]">Original-language reading</h3>
    <p>{edition.title}</p>
    <p>Reference basis: KJV numbering · {formatRef({ ...current, verse: current.verse ?? 1 })}. {slug !== 'kjv' && 'The selected translation may use different verse divisions.'}</p>
    {translationText && <blockquote className="rounded border border-white/10 p-3"><p className="mb-1 text-white/40">Selected translation · {slug}</p>{translationText}</blockquote>}
    {error && <p role="alert">{error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Retry original text</button></p>}
    {!data && !error && <p>Loading original-language book…</p>}
    {data && <>
      {!links.length && <p role="status">No supported source mapping for this KJV reference. Choose a source chapter and verse to read independently.</p>}
      {!!links.length && <p>{links.length > 1 ? 'This reference connects to several source verses. ' : ''}{links.map(item => `${item.verse.sourceRef}${item.link.type === 'partial' ? ' (partial match; whole source verse shown for context)' : ''}`).join(' · ')}</p>}
      {links.length > 1 && <div className="flex flex-wrap gap-2">{links.map((item, i) => <button className="rounded border border-white/20 px-2 py-1" key={`${item.link.locator}/${i}`} onClick={() => { setLocator(item.link.locator); setSelected(null); setSaved(''); }}>Read source {item.verse.sourceRef}</button>)}</div>}
      {[...new Set(links.map(item => item.link.note).filter(Boolean))].map(note => <p className="text-white/60" key={note}>Verse-division note: {note}</p>)}
      {corpus === 'greek' && <p className="text-white/40">This critical Greek edition and the KJV’s Textus Receptus differ. A shared verse number does not establish matching words or readings.</p>}
      <div className="grid grid-cols-2 gap-2"><label>Source chapter<select aria-label="Original source chapter" className={field} value={sourceChapter || ''} onChange={e => { const first = Object.keys(data.verses).find(key => key.startsWith(`${e.target.value}:`)); setLocator(first || ''); setSelected(null); setSaved(''); }}><option value="" disabled>Choose chapter</option>{sourceChapters.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>Source verse<select aria-label="Original source verse" className={field} value={sourceNumber || ''} onChange={e => { setLocator(`${sourceChapter}:${e.target.value}`); setSelected(null); setSaved(''); }}><option value="" disabled>Choose verse</option>{sourceNumbers.map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
      {sourceVerse && <article className="space-y-3 rounded-xl border border-[#e3c57e]/25 p-3">
        <h4 className="font-semibold">{BOOKS.find(b => b.num === current.book)?.name} {locator} · source numbering</h4>
        {!selectedLink && <p className="text-white/40">Reading a source reference independently of the selected translation.</p>}
        {sourceVerse.bracketed && <p>Source brackets mark an added or textually disputed reading. Read the edition’s note below.</p>}
        <div dir={corpus === 'oshb' ? 'rtl' : 'ltr'} lang={corpus === 'oshb' ? 'he' : 'grc'} className="break-words text-lg leading-10">{sourceVerse.tokens.map((token, i) => token.punctuation ? <span key={i}>{token.text}</span> : <React.Fragment key={token.id || i}><button aria-label={`Study original word ${i + 1}: ${token.text}`} className={`rounded px-1 underline decoration-dotted ${selected === token ? 'bg-[#e3c57e]/20 text-[#e3c57e]' : ''}`} onClick={() => setSelected(token)}>{token.punctuationBefore}{token.text.replaceAll('/', '')}{token.punctuationAfter}</button>{' '}</React.Fragment>)}</div>
        {!!sourceVerse.variants?.length && <details><summary className="cursor-pointer text-[#e3c57e]">Source reading variants</summary>{sourceVerse.variants.map((variant, i) => <p key={i}>{variant.type === 'x-qere' ? 'Qere · read form' : variant.type}: <span dir="rtl" lang="he">{variant.words.map((word, j) => <button key={word.id || j} className="mx-1 text-[#e3c57e] underline" aria-label={`Study variant word ${i + 1}.${j + 1}: ${word.text}`} onClick={() => setSelected({ ...word, reading: variant.type })}>{word.text.replaceAll('/', '')}</button>)}</span></p>)}<p className="text-white/40">The main text retains the source’s written forms (ketiv); read forms (qere) are separate and excluded from the main-word search counts.</p></details>}
        {sourceVerse.notes?.map((note, i) => <p className="text-white/60" key={i}>Source note: {note}</p>)}
        <button className="text-[#e3c57e] underline" onClick={savePassage}>Save original passage to notebook</button>{saved && <p role="status">{saved}</p>}
      </article>}
    </>}
    {selected && <article className="space-y-2 rounded border border-white/15 p-3">
      <h4 className="text-base text-[#e3c57e]" lang={corpus === 'oshb' ? 'he' : 'grc'}>{selected.text}</h4>
      <p>Source lemma: {selected.lemma || 'Not supplied'}</p>
      {selected.sourceStrong && <p>Publisher’s extended identifier: {selected.sourceStrong}</p>}
      {selected.reading === 'x-ketiv' && <p>Ketiv · written form. Read forms are shown separately above.</p>}
      {selected.reading === 'x-qere' && <p>Qere · read form, preserved as a source variant. Search counts below cover main-text tokens.</p>}
      {grammar ? <><h5 className="font-semibold">Grammar in words · {grammar.language}</h5>{grammar.components.map((part, i) => <p key={i}>{grammar.components.length > 1 ? `Component ${i + 1}: ` : ''}{part.join(' · ')}</p>)}{!grammar.complete && <p className="text-white/40">Some source values are not decoded; the original code is retained below.</p>}
        {[...new Set(grammar.components.flat().filter(label => GRAMMAR_HELP[label]))].map(label => <p key={label}><span className="text-[#e3c57e]">{label}:</span> {GRAMMAR_HELP[label]}</p>)}
        <details><summary>Original grammatical code</summary><code className="break-all">{selected.morph}</code></details>
      </> : <p>No grammatical parsing supplied for this word.</p>}
      <p className="text-white/40">Grammar describes the source’s parsing. Gender is grammatical; word forms and verb aspect do not decide a passage’s interpretation by themselves.</p>
      {selected.strong?.map(id => <button key={id} className="mr-2 text-[#e3c57e] underline" onClick={() => onStrong(id)}>Open {id} dictionary</button>)}
      <div className="flex flex-wrap gap-2">{originalLemmaKeys(selected, corpus).map(key => <button className="rounded border border-white/20 p-2" key={key} onClick={() => void search(key, '')}>Find lemma {key}</button>)}
        {selected.morph && <button className="rounded border border-white/20 p-2" onClick={() => void search('', selected.morph!)}>Find same grammatical form</button>}
        {selected.morph && originalLemmaKeys(selected, corpus)[0] && <button className="rounded border border-white/20 p-2" onClick={() => void search(originalLemmaKeys(selected, corpus)[0], selected.morph!)}>Find lemma and grammar together</button>}
      </div>
    </article>}
    {(lemma || morph) && <section className="space-y-2 border-t border-white/15 pt-3"><h4 className="font-semibold">Original-word concordance</h4><p>{lemma && `Lemma: ${lemma}`}{lemma && morph && ' · '}{morph && `Grammar: ${morph}`}</p>
      <select aria-label="Original concordance book" className={field} value={bookFilter} onChange={e => { setBookFilter(Number(e.target.value)); setPage(0); setPreview(null); previewRequest.current++; }}><option value={0}>All {corpus === 'oshb' ? 'Hebrew/Aramaic' : 'Greek'} books</option>{BOOKS.filter(b => (b.num <= 39) === (corpus === 'oshb')).map(b => <option key={b.num} value={b.num}>{b.name}</option>)}</select>
      {searchError && <p role="alert">{searchError} <button className="underline" onClick={() => void search(lemma, morph)}>Retry search</button></p>}
      {busy ? <p>Loading complete original-word index…</p> : index && <><p>{hits.length.toLocaleString()} original word occurrences · {new Set(hits.map(row => row.slice(0, 3).join('/'))).size.toLocaleString()} source verses</p><p className="text-white/40">Counts cover main-text tokens in this edition. Source numbering is retained; variant read forms are excluded.</p>
        {hits.slice(page * 20, (page + 1) * 20).map(row => <button className="block text-[#e3c57e] underline" key={row.join('/')} onClick={() => void showOccurrence(row)}>{BOOKS.find(b => b.num === row[0])?.name} {row[1]}:{row[2]} · word {row[3] + 1}</button>)}
        {hits.length > 20 && <div className="flex justify-between"><button disabled={!page} onClick={() => { setPage(n => n - 1); setPreview(null); previewRequest.current++; }}>Previous original results</button><span>{page + 1}/{Math.ceil(hits.length / 20)}</span><button disabled={(page + 1) * 20 >= hits.length} onClick={() => { setPage(n => n + 1); setPreview(null); previewRequest.current++; }}>Next original results</button></div>}
      </>}
      {preview && <article className="space-y-2 rounded border border-white/15 p-3"><p>{BOOKS.find(b => b.num === preview.row[0])?.name} {preview.row[1]}:{preview.row[2]} · source numbering</p><p dir={corpus === 'oshb' ? 'rtl' : 'ltr'} lang={corpus === 'oshb' ? 'he' : 'grc'} className="text-lg leading-9">{preview.data.verses[`${preview.row[1]}:${preview.row[2]}`]?.tokens.map((token, i) => <span key={i} className={i === preview.row[3] ? 'rounded bg-[#e3c57e]/20 text-[#e3c57e]' : ''}>{token.punctuationBefore}{token.text.replaceAll('/', '')}{token.punctuationAfter}{' '}</span>)}</p>
        {originalOccurrenceNavigation(preview.data, preview.row) ? <button className="text-[#e3c57e] underline" onClick={() => onNavigate(originalOccurrenceNavigation(preview.data, preview.row)!)}>Open corresponding Bible reference</button> : <p>No unique complete KJV verse mapping; read this source passage here.</p>}
      </article>}
    </section>}
    <p className="text-white/40">{edition.attribution}. {edition.rights}</p>
    <div className="flex flex-wrap gap-3"><a className="underline" href={edition.source} target="_blank" rel="noopener noreferrer">Verify source edition</a><a className="underline" href={edition.license} target="_blank" rel="noopener noreferrer">Reuse license</a><a className="underline" href={corpus === 'oshb' ? 'https://openscriptures.github.io/morphhb/parsing/HebrewMorphologyCodes.html' : 'https://ug.readthedocs.io/en/latest/'} target="_blank" rel="noopener noreferrer">Grammar source</a></div>
  </section>;
}
