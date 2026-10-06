import React, { useEffect, useMemo, useState } from 'react';
import { loadLexicon, searchLexicon, lexiconScriptureRefs, type LexiconId, type LexiconData, type LexiconEntry } from '../../services/lectioLexicon';
import { formatRef, type ScriptureRef } from '../../services/scriptureRef';
import LectioAlignment from './LectioAlignment';
const field = 'w-full rounded-lg border border-white/15 bg-[#100c18] p-2 text-xs text-white';
export default function LectioLexicon({ onNavigate, current, slug = 'kjv', initialStrong }: { onNavigate: (ref: ScriptureRef) => void; current?: ScriptureRef; slug?: string; initialStrong?: string }) {
  const [dictionary, setDictionary] = useState<LexiconId>('strongsgreek'), [data, setData] = useState<LexiconData | null>(null);
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<LexiconEntry | null>(null), [error, setError] = useState(''), [page, setPage] = useState(0);
  const [linkedId, setLinkedId] = useState('');
  useEffect(() => { if (initialStrong) { setLinkedId(initialStrong); setQuery(initialStrong); setDictionary(initialStrong.startsWith('H') ? 'strongshebrew' : 'strongsgreek'); } }, [initialStrong]);
  useEffect(() => { if (data && linkedId) setSelected(searchLexicon(data, linkedId)[0] || null); }, [data, linkedId]);
  useEffect(() => {
    let live = true; setData(null); setSelected(null); setError(''); setPage(0);
    loadLexicon(dictionary).then(value => { if (live) setData(value); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [dictionary]);
  const hits = useMemo(() => data ? searchLexicon(data, query) : [], [data, query]);
  return <section className="space-y-3 text-xs leading-relaxed text-white/70">
    {current && <LectioAlignment current={current} slug={slug} onNavigate={onNavigate} onStrong={id => {
      setLinkedId(id); setQuery(id); setPage(0); setDictionary(id.startsWith('H') ? 'strongshebrew' : 'strongsgreek');
    }} />}
    <h3 className="font-semibold text-[#e3c57e]">Original-language dictionaries</h3>
    <p>Search a Strong’s number, Greek or Hebrew term, transliteration, or words in a definition.</p>
    <select aria-label="Original-language dictionary" className={field} value={dictionary} onChange={e => setDictionary(e.target.value as LexiconId)}><option value="strongsgreek">Strong’s Greek dictionary</option><option value="strongshebrew">Strong’s Hebrew dictionary</option></select>
    <input aria-label="Lexicon query" className={field} placeholder="G3056, H7225, logos, covenant…" value={query} onChange={e => { setQuery(e.target.value); setLinkedId(''); setSelected(null); setPage(0); }} />
    <p>{data ? `${data.entries.length.toLocaleString()} entries · public-domain 1890 dictionary` : 'Loading dictionary…'}</p>
    {error && <p role="alert">{error}</p>}
    <p className="text-white/40">GetBible conversion of CrossWire SWORD modules. Definitions are historical dictionary entries. No lemma alignment or grammatical parsing is inferred for the reader’s selected verse.</p>
    <p>{hits.length} matching entries</p>
    {hits.slice(page * 20, (page + 1) * 20).map(entry => <button key={entry.id} className="w-full rounded-lg border border-white/10 p-2 text-left" onClick={() => setSelected(entry)}><span className="text-[#e3c57e]">{entry.id}</span><p className="line-clamp-2">{entry.text}</p></button>)}
    {hits.length > 20 && <div className="flex justify-between"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><span>{page + 1}/{Math.ceil(hits.length / 20)}</span><button disabled={(page + 1) * 20 >= hits.length} onClick={() => setPage(p => p + 1)}>Next</button></div>}
    {selected && <article className="space-y-3 rounded-xl border border-[#e3c57e]/30 p-3"><h4 className="text-[#e3c57e]">{selected.id}</h4><p className="whitespace-pre-wrap">{selected.text}</p>
      <div className="flex flex-wrap gap-2">{selected.see_also?.map(link => <button className="text-[#e3c57e] underline" key={link.id} onClick={() => { const entry = data?.entries.find(e => e.id === link.id); if (entry) setSelected(entry); }}>{link.id}</button>)}</div>
      {lexiconScriptureRefs(selected).map(ref => <button className="mr-2 text-[#e3c57e] underline" key={formatRef(ref)} onClick={() => onNavigate(ref)}>{formatRef(ref)}</button>)}
      <a className="block text-[#e3c57e] underline" href={`https://dictionaries.getbible.net/v1/${dictionary}/${selected.id}.json`} target="_blank" rel="noopener noreferrer">Verify this dictionary entry</a>
    </article>}
    <a className="block underline" href={`https://dictionaries.getbible.net/v1/${dictionary}/metadata.json`} target="_blank" rel="noopener noreferrer">Edition provenance and license</a>
  </section>;
}
