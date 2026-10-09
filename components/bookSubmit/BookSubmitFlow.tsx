import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Cloud, CloudOff, Library, Loader2, X } from 'lucide-react';
import type { Album } from '../../types';
import type { BookDraft, BookFormatId } from '../../services/bookmeta/types';
import { loadBest, newDraft } from '../../services/bookmeta/drafts';
import { toAlbumPartial } from '../../services/bookmeta/albumMap';
import { useBookDraft } from './useBookDraft';
import StepManuscript from './StepManuscript';
import StepCover from './StepCover';
import StepDetails from './StepDetails';
import StepRights from './StepRights';
import StepPricing from './StepPricing';
import PrintStep from './PrintStep';
import StepPreflight, { type StepId } from './StepPreflight';
import StepReview from './StepReview';
import MyBooks from './MyBooks';
import { btnGhost, btnPrimary } from './ui';

const STEPS: { id: StepId; label: string; blurb: string }[] = [
  { id: 'IMPORT', label: 'Manuscript', blurb: 'Drop your book file' },
  { id: 'COVER', label: 'Cover', blurb: 'Upload or design it' },
  { id: 'DETAILS', label: 'Details', blurb: 'Title, description, categories' },
  { id: 'RIGHTS', label: 'Rights', blurb: 'ISBN, licence, AI, access' },
  { id: 'PRICING', label: 'Pricing', blurb: 'Price and what you keep' },
  { id: 'PRINT', label: 'Print', blurb: 'Optional paperback' },
  { id: 'PREFLIGHT', label: 'Check', blurb: 'Quality check' },
  { id: 'REVIEW', label: 'Submit', blurb: 'Review and publish' },
];

interface Props {
  uid: string;
  format: BookFormatId;
  /** Open straight into My Books instead of a new draft. */
  startInMyBooks?: boolean;
  onLaunchCreator: (album: Partial<Album>) => void;
  onCancel: () => void;
}

/** Outer shell: decides between My Books and an open draft, loading drafts when resuming. */
export default function BookSubmitFlow({ uid, format, startInMyBooks, onLaunchCreator, onCancel }: Props) {
  const [view, setView] = useState<'books' | 'draft'>(startInMyBooks ? 'books' : 'draft');
  const [draft, setDraft] = useState<BookDraft | null>(() => (startInMyBooks ? null : newDraft(uid, format)));
  const [loading, setLoading] = useState(false);

  const open = useCallback(async (id: string) => {
    setLoading(true);
    const d = await loadBest(uid, id);
    setLoading(false);
    if (d) { setDraft(d); setView('draft'); }
  }, [uid]);

  const finish = useCallback(async (draftId: string, submissionId?: string) => {
    const d = await loadBest(uid, draftId);
    if (d) onLaunchCreator(toAlbumPartial(d, submissionId));
  }, [uid, onLaunchCreator]);

  return (
    <div className="fixed inset-0 z-[400] bg-black/85 backdrop-blur-md flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Publish a book">
      <div className="w-full max-w-3xl bg-[#0d0d0d] sm:border border-white/10 sm:rounded-[2.5rem] flex flex-col overflow-hidden max-h-screen sm:max-h-[94vh]">
        {view === 'books' || !draft ? (
          <>
            <header className="px-5 sm:px-8 pt-6 pb-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="p-2.5 rounded-2xl bg-amber-500/12"><Library size={18} className="text-amber-400" /></div>
                <h2 className="text-xs font-black uppercase tracking-widest text-white">Book Studio</h2></div>
              <button type="button" onClick={onCancel} aria-label="Close" className="p-2.5 text-white/30 hover:text-white min-w-[44px] min-h-[44px]"><X size={18} /></button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
              {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber-400" /></div>
                : <MyBooks uid={uid} onOpenDraft={open} onNew={() => { setDraft(newDraft(uid, format)); setView('draft'); }} onFinishPublishing={(d, s) => void finish(d, s)} />}
            </div>
          </>
        ) : (
          <DraftEditor key={draft.id} initial={draft} onMyBooks={() => setView('books')} onCancel={onCancel} onFinish={(d, s) => onLaunchCreator(toAlbumPartial(d, s))} />
        )}
      </div>
    </div>
  );
}

function DraftEditor({ initial, onMyBooks, onCancel, onFinish }: { initial: BookDraft; onMyBooks: () => void; onCancel: () => void; onFinish: (d: BookDraft, sid?: string) => void }) {
  const { draft, update, updateMeta, updatePricing, save, flush, preflight, a11y } = useBookDraft(initial);
  const [i, setI] = useState(() => Math.max(0, STEPS.findIndex(s => s.id === initial.step)));
  const [dir, setDir] = useState(1);
  const step = STEPS[i];
  const body = React.useRef<HTMLDivElement>(null);

  const go = useCallback((idx: number) => { setDir(idx >= i ? 1 : -1); setI(Math.max(0, Math.min(STEPS.length - 1, idx))); }, [i]);
  const goTo = useCallback((id: StepId) => go(STEPS.findIndex(s => s.id === id)), [go]);
  const first = React.useRef(true);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    if (first.current) { first.current = false; return; } // opening a book must not create an empty draft
    update({ step: step.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const close = async () => { await flush(); onCancel(); };
  const SaveBadge = () => save === 'saved' ? <span className="inline-flex items-center gap-1 text-emerald-300/80"><Cloud size={13} /> Saved</span>
    : save === 'saving' ? <span className="inline-flex items-center gap-1 text-white/50"><Loader2 size={13} className="animate-spin" /> Saving…</span>
    : save === 'error' ? <span className="inline-flex items-center gap-1 text-red-300"><CloudOff size={13} /> Not saved</span>
    : <span className="inline-flex items-center gap-1 text-amber-300/80"><CloudOff size={13} /> Saved on this device</span>;

  return (
    <>
      <header className="px-5 sm:px-8 pt-5 pb-3 border-b border-white/5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-amber-500/12 flex-shrink-0"><BookOpen size={18} className="text-amber-400" /></div>
          <div className="min-w-0"><h2 className="text-xs font-black uppercase tracking-widest text-white truncate">{draft.metadata.title || 'New book'}</h2>
            <p className="text-[10px] text-white/35 font-bold uppercase tracking-widest" aria-live="polite"><SaveBadge /></p></div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={async () => { await flush(); onMyBooks(); }} className={`${btnGhost} !px-3`}><Library size={14} /><span className="hidden sm:inline"> My books</span></button>
          <button type="button" onClick={close} aria-label="Close" className="p-2.5 text-white/30 hover:text-white min-w-[44px] min-h-[44px]"><X size={18} /></button>
        </div>
      </header>

      <nav aria-label="Steps" className="px-4 sm:px-8 py-3 border-b border-white/5 overflow-x-auto">
        <ol className="flex items-center gap-1.5 min-w-max">
          {STEPS.map((s, k) => (
            <React.Fragment key={s.id}>
              <li><button type="button" onClick={() => go(k)} aria-current={k === i ? 'step' : undefined} className="flex items-center gap-1.5 min-h-[40px] px-1">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: k < i ? '#f59e0b' : k === i ? '#fff' : 'rgba(255,255,255,0.08)', color: k <= i ? '#000' : 'rgba(255,255,255,0.3)' }}>{k < i ? <Check size={10} /> : k + 1}</span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${k === i ? 'text-white' : k < i ? 'text-amber-400' : 'text-white/25'} ${k === i ? '' : 'hidden md:inline'}`}>{s.label}</span>
              </button></li>
              {k < STEPS.length - 1 && <li aria-hidden className="w-4 h-px bg-white/10 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </ol>
      </nav>

      <div ref={body} className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <p className="text-xs text-white/40 mb-4">{step.blurb}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step.id} initial={{ opacity: 0, x: dir * 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 20 }} transition={{ duration: 0.16 }}>
            {step.id === 'IMPORT' && <StepManuscript draft={draft} update={update} onNext={() => go(i + 1)} />}
            {step.id === 'COVER' && <StepCover draft={draft} update={update} flush={flush} />}
            {step.id === 'DETAILS' && <StepDetails draft={draft} updateMeta={updateMeta} />}
            {step.id === 'RIGHTS' && <StepRights draft={draft} updateMeta={updateMeta} a11y={a11y} />}
            {step.id === 'PRICING' && <StepPricing draft={draft} updatePricing={updatePricing} />}
            {step.id === 'PRINT' && <PrintStep draft={draft} />}
            {step.id === 'PREFLIGHT' && <StepPreflight draft={draft} preflight={preflight} goTo={goTo} />}
            {step.id === 'REVIEW' && <StepReview draft={draft} preflight={preflight} update={update} flush={flush} goTo={goTo} onFinishPublishing={onFinish} onMyBooks={onMyBooks} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="px-4 sm:px-8 py-4 border-t border-white/5 flex items-center justify-between gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className={`${btnGhost} disabled:opacity-0`}><ChevronLeft size={14} /> Back</button>
        <span className="text-[11px] text-white/30 hidden sm:block">Step {i + 1} of {STEPS.length} · readiness {preflight.score}/100</span>
        {i < STEPS.length - 1 && <button type="button" onClick={() => go(i + 1)} className={btnPrimary}>{step.id === 'PRINT' ? 'Skip for now' : 'Continue'} <ChevronRight size={14} /></button>}
        {i === STEPS.length - 1 && <span className="w-24" />}
      </footer>
    </>
  );
}
