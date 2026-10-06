import React, { useState } from 'react';
import { BookOpen, ExternalLink, PanelLeft, Pencil, Trash2, Check, X, Library } from 'lucide-react';
import { PAGE_W, templateBackground, type PageMeta, type ReaderItem } from '../../services/notesStructure';
import { writeReaderNote } from '../../services/notesService';

/**
 * A page in the Scripture & Sacred Texts notebook: a clean read view of notes written in Lectio, the
 * Sacred Library readers and the research notebook. Verse and passage notes can be edited here; the
 * edit is written straight back to the reader's own store (one source of truth). Research entries
 * are read-only and link back to the research notebook in Lectio.
 */
interface Props { page: PageMeta; panel: boolean; onShowPanel: () => void; zoom: number }

const openLectio = (refId?: string) => { try { window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: refId ? { refId } : {} })); } catch { /* */ } };
const openSacredLibrary = () => { try { window.dispatchEvent(new CustomEvent('OPEN_SACRED_LIBRARY')); } catch { /* */ } };
const SOURCE_LABEL = { verse: 'Your verse notes from Lectio', sacred: 'Your passage notes from the Sacred Library', research: 'Your research notebook (sources and comparisons)' } as const;

const ItemCard: React.FC<{ item: ReaderItem; kind: 'verse' | 'sacred' | 'research' }> = ({ item, kind }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => { if (draft === null) return; if (kind !== 'research') writeReaderNote(kind, item.key, draft); setDraft(null); };
  const remove = () => { if (kind !== 'research' && window.confirm('Delete this note? It is removed from the reader too.')) writeReaderNote(kind, item.key, ''); };
  return (
    <article className="py-4 border-b border-slate-200 last:border-b-0">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <h3 className="text-[15px] font-black text-slate-900 flex-1 min-w-0">{item.label}</h3>
        {item.refId && <button type="button" onClick={() => openLectio(item.refId)} className="text-[11px] font-black text-[#0e7490] hover:underline inline-flex items-center gap-1"><BookOpen size={12} /> Open in Lectio</button>}
        {item.editable && draft === null && <>
          <button type="button" onClick={() => setDraft(item.text)} aria-label={`Edit the note on ${item.label}`} className="text-[11px] font-black text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
          <button type="button" onClick={remove} aria-label={`Delete the note on ${item.label}`} className="text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>
        </>}
      </div>
      {draft === null ? (
        <p className="text-[14px] leading-[1.7] text-slate-800 whitespace-pre-wrap">{item.text}</p>
      ) : (
        <div className="grid gap-2">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))} autoFocus aria-label={`Note on ${item.label}`}
            onKeyDown={e => { if (e.key === 'Escape') setDraft(null); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-[14px] leading-[1.6] text-slate-900 outline-none focus:border-[#0891b2]" />
          <div className="flex gap-2">
            <button type="button" onClick={save} className="rounded-full bg-[#0e0b16] text-white text-[12px] font-black px-3.5 py-1.5 inline-flex items-center gap-1"><Check size={12} /> Save</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-slate-300 text-slate-700 text-[12px] font-black px-3.5 py-1.5 inline-flex items-center gap-1"><X size={12} /> Cancel</button>
          </div>
        </div>
      )}
      {item.details?.length ? <ul className="mt-1.5 grid gap-0.5">{item.details.map(d => <li key={d} className="text-[12px] text-slate-500 break-words">{d}</li>)}</ul> : null}
    </article>
  );
};

const ReaderNotesPage: React.FC<Props> = ({ page, panel, onShowPanel, zoom }) => {
  const r = page.reader!;
  const back = r.kind === 'sacred'
    ? <button type="button" onClick={openSacredLibrary} className="px-3 h-8 rounded-full text-[11px] font-black bg-white/8 text-white/80 hover:bg-white/15 inline-flex items-center gap-1"><Library size={12} /> Open the Sacred Library</button>
    : r.kind === 'research'
      ? <button type="button" onClick={() => openLectio()} title="Edit sources and comparisons in the research notebook (Lectio → Notebook)" className="px-3 h-8 rounded-full text-[11px] font-black bg-white/8 text-white/80 hover:bg-white/15 inline-flex items-center gap-1"><ExternalLink size={12} /> Open in Lectio notebook</button>
      : <button type="button" onClick={() => openLectio(r.items.find(i => i.refId)?.refId)} className="px-3 h-8 rounded-full text-[11px] font-black bg-white/8 text-white/80 hover:bg-white/15 inline-flex items-center gap-1"><BookOpen size={12} /> Open in Lectio</button>;
  return (
    <>
      <div className="sticky top-0 z-30 bg-[#0e0b16]/95 backdrop-blur border-b border-white/10 px-3 py-2 grid gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {!panel && <button type="button" aria-label="Show pages" onClick={onShowPanel} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10"><PanelLeft size={17} /></button>}
          <h1 className="flex-1 min-w-[140px] text-[16px] font-black truncate">{page.title}</h1>
          {back}
        </div>
        <p className="text-[11px] text-white/45">{SOURCE_LABEL[r.kind]}. {r.kind === 'research' ? 'Read-only here.' : 'Edits here save back to the reader.'}</p>
      </div>
      <div className="flex-1 overflow-auto p-3 sm:p-6" style={{ background: 'radial-gradient(circle at 50% 0%,#1a1228,#0a0a0f 60%)' }}>
        <div data-page className="mx-auto bg-[#fdfcf8] rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.45)] px-8 sm:px-14 py-10" style={{ width: PAGE_W * zoom, maxWidth: '100%', minHeight: 600, ...templateBackground('blank') }}>
          <h2 className="text-[24px] font-black text-slate-900 mb-1">{page.title}</h2>
          <p className="text-[12px] text-slate-500 mb-3">{r.items.length} {r.kind === 'research' ? (r.items.length === 1 ? 'entry' : 'entries') : (r.items.length === 1 ? 'note' : 'notes')}</p>
          {r.items.map(item => <ItemCard key={item.key} item={item} kind={r.kind} />)}
        </div>
      </div>
    </>
  );
};

export default ReaderNotesPage;
