import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Clock, FileEdit, Plus, Sparkles, Trash2, XCircle } from 'lucide-react';
import type { BookDraft, SubmissionStatus } from '../../services/bookmeta/types';
import { deleteDraftEverywhere, listCloudDrafts, listLocal, loadBest } from '../../services/bookmeta/drafts';
import type { BookSource } from '../../services/bookTela/types';
import { btnGhost, btnPrimary } from './ui';

// Tela edition + EPUB/PDF export (services/bookTela). Lazy: the modal only loads when an author opens it.
const BookTelaModal = lazy(() => import('../bookTela/BookTelaModal'));

interface Submission { id: string; draftId: string; status: SubmissionStatus; title: string; authorName?: string; wordCount?: number; updatedAt?: number; cover?: { url?: string } | null; review?: { summary?: string; reasons?: { code: string; message: string; fix?: string }[]; score?: number } }
type DraftLite = Pick<BookDraft, 'id' | 'updatedAt' | 'metadata' | 'cover' | 'step'>;

const BADGE: Record<SubmissionStatus, { label: string; cls: string; icon: React.ComponentType<{ size?: number }> }> = {
  DRAFT: { label: 'Draft', cls: 'bg-white/10 text-white/60', icon: FileEdit },
  IN_REVIEW: { label: 'In review', cls: 'bg-amber-400/15 text-amber-300', icon: Clock },
  LIVE: { label: 'Live', cls: 'bg-emerald-400/15 text-emerald-300', icon: CheckCircle2 },
  REJECTED: { label: 'Needs changes', cls: 'bg-red-400/15 text-red-300', icon: XCircle },
};

interface Props { uid: string; onOpenDraft: (id: string) => void; onNew: () => void; onFinishPublishing: (draftId: string, submissionId: string) => void }

export default function MyBooks({ uid, onOpenDraft, onNew, onFinishPublishing }: Props) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [drafts, setDrafts] = useState<DraftLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tela, setTela] = useState<{ book: BookSource; tab: 'upgrade' | 'export' } | null>(null);
  const [telaBusy, setTelaBusy] = useState<string | null>(null);

  useEffect(() => {
    let off = () => {}; let alive = true;
    (async () => {
      try {
        const [{ collection, onSnapshot, query, where }, { db }] = await Promise.all([import('firebase/firestore'), import('../../services/firebase')]);
        off = onSnapshot(query(collection(db, 'bookSubmissions'), where('ownerId', '==', uid)), s => { if (alive) setSubs(s.docs.map(d => d.data() as Submission)); }, () => {});
      } catch { /* offline: drafts still show */ }
    })();
    (async () => {
      const [l, c] = await Promise.all([listLocal(uid), listCloudDrafts(uid)]);
      const map = new Map<string, DraftLite>();
      for (const d of [...c, ...l]) { const prev = map.get(d.id); if (!prev || d.updatedAt > prev.updatedAt) map.set(d.id, d); }
      if (alive) { setDrafts([...map.values()]); setLoaded(true); }
    })();
    return () => { alive = false; off(); };
  }, [uid]);

  const subByDraft = useMemo(() => new Map(subs.map(s => [s.draftId, s])), [subs]);
  const openDrafts = drafts.filter(d => { const s = subByDraft.get(d.id); return !s || s.status === 'REJECTED'; }).sort((a, b) => b.updatedAt - a.updatedAt);
  const submitted = subs.filter(s => s.status !== 'REJECTED').sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const openTela = async (draftId: string, tab: 'upgrade' | 'export') => {
    setTelaBusy(draftId);
    try {
      const d = await loadBest(uid, draftId);
      if (!d) { window.alert('That draft could not be loaded.'); return; }
      const { bookFromDraft } = await import('../../services/bookTela/upgrade');
      setTela({ book: bookFromDraft(d), tab });
    } finally { setTelaBusy(null); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    await deleteDraftEverywhere(uid, id); setDrafts(d => d.filter(x => x.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">My books</h3>
        <button type="button" className={btnPrimary} onClick={onNew}><Plus size={14} /> New book</button>
      </div>

      {openDrafts.length > 0 && (
        <section aria-label="Drafts"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35 mb-2">Drafts and returned books</p>
          <ul className="space-y-2">{openDrafts.map(d => {
            const s = subByDraft.get(d.id); const st: SubmissionStatus = s?.status ?? 'DRAFT'; const B = BADGE[st];
            return (
              <li key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex gap-3 items-center">
                <div className="w-10 flex-shrink-0 rounded bg-white/5 overflow-hidden" style={{ aspectRatio: '1/1.6' }}>{d.cover?.url ? <img src={d.cover.url} alt="" className="w-full h-full object-cover" /> : <BookOpen size={16} className="m-auto mt-3 text-white/20" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{d.metadata.title || 'Untitled book'}</p>
                  <p className="text-[11px] text-white/35">Edited {new Date(d.updatedAt).toLocaleDateString()}</p>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${B.cls}`}><B.icon size={10} /> {B.label}</span>
                  {s?.status === 'REJECTED' && s.review?.reasons?.[0] && <p className="text-[11px] text-red-200/80 mt-1 leading-snug">{s.review.reasons[0].message}{s.review.reasons.length > 1 ? ` (+${s.review.reasons.length - 1} more)` : ''}</p>}
                </div>
                <button type="button" className={btnGhost} onClick={() => onOpenDraft(d.id)}>Continue</button>
                <button type="button" className={btnGhost} disabled={telaBusy === d.id} onClick={() => openTela(d.id, 'upgrade')} aria-label="Tela edition and export"><Sparkles size={14} /><span className="hidden sm:inline"> Tela / Export</span></button>
                <button type="button" aria-label="Delete draft" className="p-2 text-white/25 hover:text-red-300" onClick={() => remove(d.id)}><Trash2 size={14} /></button>
              </li>);
          })}</ul></section>
      )}

      {submitted.length > 0 && (
        <section aria-label="Submitted"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35 mb-2">Submitted</p>
          <ul className="space-y-2">{submitted.map(s => {
            const B = BADGE[s.status];
            return (
              <li key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex gap-3 items-center">
                <div className="w-10 flex-shrink-0 rounded bg-white/5 overflow-hidden" style={{ aspectRatio: '1/1.6' }}>{s.cover?.url && <img src={s.cover.url} alt="" className="w-full h-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{s.title}</p>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${B.cls}`}><B.icon size={10} /> {B.label}</span>
                  <p className="text-[11px] text-white/35 mt-1">Sales 0 · Earned $0.00 <span className="text-white/20">(sales stats arrive with your first sale)</span></p>
                  {s.status === 'IN_REVIEW' && <p className="text-[11px] text-amber-200/70 mt-0.5">{s.review?.reasons?.map(r => r.message).join(' ')}</p>}
                </div>
                {s.status === 'LIVE' && <button type="button" className={btnGhost} onClick={() => onFinishPublishing(s.draftId, s.id)}>Finish publishing</button>}
                <button type="button" className={btnGhost} disabled={telaBusy === s.draftId} onClick={() => openTela(s.draftId, 'export')} aria-label="Export this book"><Sparkles size={14} /><span className="hidden sm:inline"> Export</span></button>
                <button type="button" className={btnGhost} onClick={() => window.dispatchEvent(new CustomEvent('plajah:openEarnings', { detail: { source: 'my-books' } }))}>Earnings</button>
              </li>);
          })}</ul></section>
      )}

      {loaded && !openDrafts.length && !submitted.length && (
        <div className="text-center py-10 rounded-3xl border border-dashed border-white/10">
          <BookOpen className="mx-auto text-white/15" size={30} />
          <p className="text-sm text-white/50 mt-3">No books yet. Drop in a manuscript and we will do the formatting checks for you.</p>
        </div>)}
      {tela && (
        <Suspense fallback={null}>
          <BookTelaModal book={tela.book} uid={uid} initialTab={tela.tab} onClose={() => setTela(null)} />
        </Suspense>
      )}
    </div>
  );
}
