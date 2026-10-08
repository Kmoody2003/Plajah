import React, { useEffect, useState } from 'react';
import { RELATIONS, RESEARCH_CHANGED, readNotebook, writeNotebook, emptyNotebook, mergeNotebooks, validateNotebook,
  researchMarkdown, downloadResearchFile, syncResearchNotebook, researchSyncsToAccount,
  type ResearchNotebook as Notebook, type ResearchRelation } from '../../services/sacredResearch';

const field = 'w-full rounded-lg border border-white/15 bg-[#100c18] p-2 text-sm text-white';
export default function ResearchNotebook() {
  const [notebook, setNotebook] = useState<Notebook>(emptyNotebook);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(''), [right, setRight] = useState('');
  const [relation, setRelation] = useState<ResearchRelation>('ethical analogy');
  const [similarities, setSimilarities] = useState(''), [differences, setDifferences] = useState(''), [context, setContext] = useState('');
  const [editingId, setEditingId] = useState('');
  useEffect(() => {
    const refresh = () => { try { setNotebook(readNotebook()); setError(''); } catch { setError('The saved notebook could not be read. Existing data has been preserved.'); } };
    refresh(); void syncResearchNotebook().catch(() => {});
    window.addEventListener(RESEARCH_CHANGED, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(RESEARCH_CHANGED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const save = () => {
    if (!left || !right || left === right) { setError('Choose two different sources.'); return; }
    try {
      const current = readNotebook();
      const comparison = { id: editingId || crypto.randomUUID(), left, right, relation, similarities, differences, context, status: 'personal interpretation' as const };
      writeNotebook({ ...current, comparisons: editingId ? current.comparisons.map(c => c.id === editingId ? comparison : c) : [...current.comparisons, comparison] });
      setEditingId(''); setSimilarities(''); setDifferences(''); setContext('');
    } catch { setError('Saving failed. Copy or export your notes before leaving.'); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { if (file.size > 8_000_000) throw Error('The notebook file is too large.');
      writeNotebook(mergeNotebooks(readNotebook(), validateNotebook(JSON.parse(await file.text()))));
    } catch (e) { setError(e instanceof Error ? e.message : 'The notebook could not be imported.'); }
  };
  const a = notebook.sources.find(s => s.id === left), b = notebook.sources.find(s => s.id === right);
  return <section className="space-y-3 text-sm text-white/75">
    <h3 className="font-semibold text-[#e3c57e]">Research notebook</h3>
    <p>Sources saved in any faith reader or Lectio appear here. Your comparisons retain both passages, editions, and source links.</p>
    <p className="text-white/45">{notebook.sources.length} saved sources · {notebook.comparisons.length} comparisons · {researchSyncsToAccount() ? 'synced to your account' : 'stored on this device (sign in to sync)'}</p>
    <div className="flex flex-wrap gap-3 text-xs">
      <button onClick={() => downloadResearchFile('sacred-research.json', JSON.stringify(notebook, null, 2), 'application/json')}>Export notebook</button>
      <button onClick={() => downloadResearchFile('sacred-research.md', researchMarkdown(notebook), 'text/markdown')}>Export cited notes</button>
      <label className="cursor-pointer">Import notebook<input aria-label="Import research notebook" type="file" accept=".json,application/json" className="sr-only" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </div>
    {error && <p role="alert" className="text-amber-200">{error}</p>}
    {[['left', left, setLeft], ['right', right, setRight]] .map(([label, value, update]) => <select key={label as string} aria-label={`${label} comparison source`} className={field} value={value as string} onChange={e => (update as (v: string) => void)(e.target.value)}>
      <option value="">Choose {label as string} source…</option>{notebook.sources.map(s => <option key={s.id} value={s.id}>{s.faith} · {s.title} · {s.locator}</option>)}
    </select>)}
    {[a, b].filter(Boolean).map(source => <article key={source!.id} className="rounded-xl border border-white/10 p-3 space-y-2">
      <h4>{source!.title} · {source!.locator}</h4><p className="whitespace-pre-wrap leading-relaxed">{source!.text || source!.original}</p>
      <p className="text-xs text-white/45">{source!.edition}</p><a href={source!.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#e3c57e]">Open source</a>
    </article>)}
    <label className="block">Relationship<select className={field} value={relation} onChange={e => setRelation(e.target.value as ResearchRelation)}>{RELATIONS.map(r => <option key={r}>{r}</option>)}</select></label>
    {relation === 'possible influence' && <p className="text-xs">Historical influence needs evidence of transmission and chronology. Shared wording alone cannot establish it.</p>}
    <label className="block">Similarities<textarea className={field} rows={3} value={similarities} onChange={e => setSimilarities(e.target.value)} /></label>
    <label className="block">Differences<textarea className={field} rows={3} value={differences} onChange={e => setDifferences(e.target.value)} /></label>
    <label className="block">Context and limits<textarea className={field} rows={3} value={context} onChange={e => setContext(e.target.value)} placeholder="Genre, translation, school, period, and unresolved questions…" /></label>
    <button className="rounded-lg border border-[#e3c57e]/35 px-3 py-2 text-[#e3c57e] disabled:opacity-40" disabled={!a || !b || left === right} onClick={save}>{editingId ? 'Save comparison changes' : 'Save comparison'}</button>
    {editingId && <button className="ml-3 text-xs" onClick={() => { setEditingId(''); setSimilarities(''); setDifferences(''); setContext(''); }}>Cancel editing</button>}
    <p className="text-xs text-white/45">Comparisons are labeled personal interpretations. They are not editorially reviewed claims.</p>
    {notebook.comparisons.map(c => <details key={c.id} className="rounded-lg border border-white/10 p-2">
      <summary className="cursor-pointer">{c.relation} · {notebook.sources.find(s => s.id === c.left)?.locator} ↔ {notebook.sources.find(s => s.id === c.right)?.locator}</summary>
      <p className="mt-2 whitespace-pre-wrap">Similarities: {c.similarities}</p><p className="mt-2 whitespace-pre-wrap">Differences: {c.differences}</p><p className="mt-2 whitespace-pre-wrap">Context: {c.context}</p>
      <button className="mt-2 text-[#e3c57e] underline" onClick={() => { setEditingId(c.id); setLeft(c.left); setRight(c.right); setRelation(c.relation); setSimilarities(c.similarities); setDifferences(c.differences); setContext(c.context); }}>Edit comparison</button>
    </details>)}
  </section>;
}
