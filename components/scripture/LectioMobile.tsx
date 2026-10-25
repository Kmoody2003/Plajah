// LectioMobile — the phone chrome for the Lectio reader.
//
// The reading page and every study tool stay in LectioReader; this file only
// supplies what a thumb needs: a bottom bar, a passage navigator (book →
// chapter in two taps, or type "john 3 16"), a display sheet, and the verse
// action bar. All sheets are 44px-target, safe-area aware, and close on
// backdrop tap.

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark, BookmarkCheck, BookOpen, Check, ChevronLeft, ChevronRight, Copy, Link2,
  Search, Share2, Sparkles, StickyNote, Type, X, Library, Highlighter, Pin,
} from 'lucide-react';
import type { BibleBook } from '../../services/bibleService';
import { canonMark, type BibleCanon } from '../../services/bibleCanon';
import { resolveScriptureQuery } from '../../services/scriptureSearch';

export function useIsMobile(max = 767): boolean {
  const q = `(max-width:${max}px)`;
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export const HL_COLORS: { id: string; label: string; dot: string; wash: string }[] = [
  { id: 'gold',  label: 'Gold',  dot: '#d4af37', wash: 'rgba(212,175,55,0.30)' },
  { id: 'green', label: 'Green', dot: '#5fb878', wash: 'rgba(95,184,120,0.28)' },
  { id: 'blue',  label: 'Blue',  dot: '#5b9bd5', wash: 'rgba(91,155,213,0.28)' },
  { id: 'rose',  label: 'Rose',  dot: '#d9728b', wash: 'rgba(217,114,139,0.28)' },
];

const GOLD = '#d4af37';
const SAFE_B = 'env(safe-area-inset-bottom, 0px)';

// ── Sheet ────────────────────────────────────────────────────────────────────
export const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode; tall?: boolean }> =
  ({ open, onClose, title, children, tall }) => (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div role="dialog" aria-label={title}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl border-t border-[#d4af37]/25 bg-[#0d0a13]"
            style={{ maxHeight: tall ? '92%' : '78%', minHeight: tall ? '62%' : undefined, paddingBottom: SAFE_B }}>
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <span className="mx-auto absolute left-1/2 -translate-x-1/2 top-2 h-1 w-10 rounded-full bg-white/20" />
              <span className="pt-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#d4af37]">{title}</span>
              <button onClick={onClose} aria-label={`Close ${title}`} className="mt-1 h-11 w-11 -mr-2 grid place-items-center rounded-full text-white/60 active:bg-white/10"><X size={18} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

// ── Bottom bar ───────────────────────────────────────────────────────────────
export const MobileBottomBar: React.FC<{
  passage: string; versions: string; onPrev: () => void; onNext: () => void;
  onNav: () => void; onDisplay: () => void; onStudy: () => void; studyOpen: boolean;
}> = ({ passage, versions, onPrev, onNext, onNav, onDisplay, onStudy, studyOpen }) => (
  <nav aria-label="Reader controls" className="shrink-0 flex items-stretch border-t border-white/10 bg-[#0b0910]/95 backdrop-blur-xl"
    style={{ paddingBottom: SAFE_B }}>
    <button onClick={onPrev} aria-label="Previous chapter" className="h-14 w-12 grid place-items-center text-white/70 active:bg-white/10"><ChevronLeft size={22} /></button>
    <button onClick={onNav} aria-label="Choose passage" className="flex-1 min-w-0 h-14 flex flex-col items-center justify-center active:bg-white/10">
      <span className="text-[15px] font-black tracking-tight text-white truncate max-w-full px-1">{passage}</span>
      <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#d4af37] truncate max-w-full px-1">{versions}</span>
    </button>
    <button onClick={onDisplay} aria-label="Text and translations" className="h-14 w-14 grid place-items-center text-white/70 active:bg-white/10"><Type size={19} /></button>
    <button onClick={onStudy} aria-label="Study tools" aria-pressed={studyOpen}
      className={`h-14 w-14 grid place-items-center active:bg-white/10 ${studyOpen ? 'text-[#d4af37]' : 'text-white/70'}`}><Library size={20} /></button>
    <button onClick={onNext} aria-label="Next chapter" className="h-14 w-12 grid place-items-center text-white/70 active:bg-white/10"><ChevronRight size={22} /></button>
  </nav>
);

// ── Navigator ────────────────────────────────────────────────────────────────
export interface BookmarkEntry { book: number; bookName: string; chapter: number; canon: BibleCanon; at: number }

export const NavigatorSheet: React.FC<{
  open: boolean; onClose: () => void;
  canon: BibleCanon; books: BibleBook[]; book: BibleBook; chapter: number;
  onGo: (b: BibleBook, ch: number, verse?: number) => void;
  bookmarks: BookmarkEntry[]; onOpenBookmark: (b: BookmarkEntry) => void; onRemoveBookmark: (b: BookmarkEntry) => void;
}> = ({ open, onClose, canon, books, book, chapter, onGo, bookmarks, onOpenBookmark, onRemoveBookmark }) => {
  const [tab, setTab] = useState<'passage' | 'marks'>('passage');
  const [pending, setPending] = useState<BibleBook | null>(null); // book chosen, awaiting chapter
  const [query, setQuery] = useState('');
  useEffect(() => { if (open) { setPending(book); setTab('passage'); setQuery(''); } }, [open, book]);

  const q = useMemo(() => (query.trim() ? resolveScriptureQuery(query, books) : null), [query, books]);
  const target = q ? (q.contextual ? book : q.book) : null;
  const canJump = !!target && (q?.chapter ?? 1) >= 1 && (q?.chapter ?? 1) <= target.chapters;
  const jump = () => { if (target && canJump) onGo(target, q?.chapter ?? 1, q?.verse); onClose(); };

  const shown = pending;
  return (
    <Sheet open={open} onClose={onClose} title="Go to passage" tall>
      <div className="flex gap-1 rounded-2xl bg-white/[0.05] p-1 mb-3">
        {([['passage', 'Passage'], ['marks', `Bookmarks${bookmarks.length ? ` · ${bookmarks.length}` : ''}`]] as const).map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 h-10 rounded-xl text-[11px] font-black uppercase tracking-widest ${tab === id ? 'bg-[#d4af37] text-black' : 'text-white/50'}`}>{l}</button>
        ))}
      </div>

      {tab === 'marks' ? (
        bookmarks.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">Tap the bookmark in the reader to save a chapter here.</p>
        ) : (
          <div className="space-y-2">
            {bookmarks.map(b => (
              <div key={`${b.canon}-${b.book}-${b.chapter}`} className="flex items-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <button onClick={() => { onOpenBookmark(b); onClose(); }} className="flex-1 h-14 px-4 text-left text-[15px] font-bold text-white">{b.bookName} {b.chapter}</button>
                <button onClick={() => onRemoveBookmark(b)} aria-label="Remove bookmark" className="h-14 w-12 grid place-items-center text-white/40"><X size={16} /></button>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') jump(); }}
              inputMode="text" autoCapitalize="off" autoCorrect="off" enterKeyHint="go"
              placeholder="john 3 16 · 2 pet 3 9 · ps 23" aria-label="Go to reference"
              className="w-full h-12 rounded-2xl bg-black/40 border border-white/10 pl-10 pr-3 text-base text-white placeholder-white/25 outline-none focus:border-[#d4af37]/60" />
          </div>

          {q ? (
            <div className="space-y-2">
              {canJump && target && (
                <button onClick={jump} className="w-full h-14 rounded-2xl bg-[#d4af37] text-black text-[15px] font-black">
                  Go to {target.name} {q.chapter ?? 1}{q.verse != null ? `:${q.verse}` : ''}
                </button>
              )}
              {q.matches.slice(0, 10).map(m => (
                <button key={m.book.num} onClick={() => { setQuery(''); setPending(m.book); }}
                  className="w-full h-12 px-4 rounded-2xl border border-white/10 text-left text-[15px] font-bold" style={{ color: canonMark(m.book).color }}>{m.book.name}</button>
              ))}
              {!canJump && q.matches.length === 0 && <p className="py-6 text-center text-sm text-white/40">No book matches “{query}”.</p>}
            </div>
          ) : shown ? (
            <>
              <button onClick={() => setPending(null)} className="mb-3 h-11 px-3 -ml-1 flex items-center gap-1 text-[12px] font-black uppercase tracking-widest text-white/60">
                <ChevronLeft size={15} /> All books
              </button>
              <p className="mb-2 text-lg font-black text-white">{shown.name}</p>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: shown.chapters }, (_, i) => i + 1).map(c => {
                  const cur = shown.num === book.num && c === chapter;
                  return (
                    <button key={c} onClick={() => { onGo(shown, c); onClose(); }}
                      className={`h-12 rounded-xl text-[15px] font-black tabular-nums ${cur ? 'bg-[#d4af37] text-black' : 'bg-white/[0.06] text-white/80 active:bg-white/15'}`}>{c}</button>
                  );
                })}
              </div>
            </>
          ) : (
            (['OT', 'NT'] as const).map(t => (
              <div key={t} className="mb-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#d4af37]/70">{t === 'OT' ? 'Old Testament' : 'New Testament'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {books.filter(b => b.testament === t).map(b => (
                    <button key={b.num} onClick={() => setPending(b)}
                      className={`h-12 px-3 rounded-xl text-left text-[14px] font-bold truncate ${b.num === book.num ? 'bg-[#d4af37]/20 border border-[#d4af37]/50' : 'bg-white/[0.04] border border-white/8'}`}
                      style={{ color: canonMark(b).color }}>{b.name}</button>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </Sheet>
  );
};

// ── Display sheet ────────────────────────────────────────────────────────────
export const DisplaySheet: React.FC<{
  open: boolean; onClose: () => void;
  skins: { id: string; label: string; bg: string; ink: string }[]; skinId: string; onSkin: (id: string) => void;
  size: number; onSize: (n: number) => void;
  avail: { slug: string; label: string }[]; active: string[]; onToggle: (slug: string) => void;
  canon: BibleCanon; onCanon: (c: BibleCanon) => void; onPlates: () => void;
}> = ({ open, onClose, skins, skinId, onSkin, size, onSize, avail, active, onToggle, canon, onCanon, onPlates }) => (
  <Sheet open={open} onClose={onClose} title="Text & translations">
    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Translations {active.length > 1 && '· side by side'}</p>
    <div className="flex flex-wrap gap-2 mb-5">
      {avail.map(t => {
        const on = active.includes(t.slug);
        return (
          <button key={t.slug} onClick={() => onToggle(t.slug)} aria-pressed={on}
            className={`h-11 px-4 rounded-full text-[12px] font-black uppercase tracking-widest border ${on ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'border-white/15 text-white/60'}`}>{t.label}</button>
        );
      })}
    </div>

    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Page</p>
    <div className="grid grid-cols-4 gap-2 mb-5">
      {skins.map(s => (
        <button key={s.id} onClick={() => onSkin(s.id)} aria-pressed={s.id === skinId}
          className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 ${s.id === skinId ? 'border-[#d4af37]' : 'border-white/10'}`} style={{ background: s.bg }}>
          <span className="text-lg font-bold leading-none" style={{ color: s.ink, fontFamily: 'Georgia, serif' }}>Aa</span>
          <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: s.ink, opacity: 0.7 }}>{s.label}</span>
        </button>
      ))}
    </div>

    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Text size · {size}</p>
    <div className="flex items-center gap-3 mb-5">
      <button onClick={() => onSize(Math.max(14, size - 1))} aria-label="Smaller text" className="h-11 w-11 rounded-full bg-white/[0.07] text-sm font-bold">A</button>
      <input type="range" min={14} max={28} value={size} onChange={e => onSize(Number(e.target.value))} aria-label="Text size" className="flex-1 accent-[#d4af37] h-11" />
      <button onClick={() => onSize(Math.min(28, size + 1))} aria-label="Larger text" className="h-11 w-11 rounded-full bg-white/[0.07] text-xl font-bold">A</button>
    </div>

    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Canon</p>
    <div className="flex gap-1 rounded-2xl bg-white/[0.05] p-1 mb-5">
      {([['protestant', 'Protestant 66'], ['catholic', 'Catholic 73'], ['orthodox', 'Orthodox']] as const).map(([id, l]) => (
        <button key={id} onClick={() => onCanon(id)}
          className={`flex-1 h-11 rounded-xl text-[11px] font-black uppercase tracking-wider ${canon === id ? 'bg-white text-black' : 'text-white/50'}`}>{l}</button>
      ))}
    </div>

    <button onClick={() => { onClose(); onPlates(); }}
      className="w-full h-12 rounded-2xl border border-[#E8C170]/40 bg-[#E8C170]/10 text-[11px] font-black uppercase tracking-widest text-[#E8C170] flex items-center justify-center gap-2">
      <Sparkles size={14} /> Sacred plates & hymnal
    </button>
  </Sheet>
);

// ── Verse action bar ─────────────────────────────────────────────────────────
export const VerseActionBar: React.FC<{
  label: string; highlight: string | undefined; onColor: (id: string) => void; onClear: () => void;
  onNote: () => void; onCopy: () => void; onShare: () => void; onRefs: () => void; onAria: () => void; onClose: () => void;
  copied: boolean; hasNote: boolean; onPin?: () => void; pinned?: boolean;
}> = ({ label, highlight, onColor, onClear, onNote, onCopy, onShare, onRefs, onAria, onClose, copied, hasNote, onPin, pinned }) => (
  <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
    className="absolute inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-30 rounded-3xl border border-[#d4af37]/30 bg-[#0d0a13]/97 backdrop-blur-xl shadow-2xl p-2">
    <div className="flex items-center gap-2 px-2 pb-1">
      <span className="text-[13px] font-black text-white mr-auto">{label}</span>
      {HL_COLORS.map(c => (
        <button key={c.id} onClick={() => (highlight === c.id ? onClear() : onColor(c.id))} aria-label={`${c.label} highlight`} aria-pressed={highlight === c.id}
          className="h-11 w-9 grid place-items-center">
          <span className="h-7 w-7 rounded-full grid place-items-center" style={{ background: c.dot, outline: highlight === c.id ? '2px solid #fff' : 'none', outlineOffset: 2 }}>
            {highlight === c.id && <Check size={13} className="text-black" />}
          </span>
        </button>
      ))}
      <button onClick={onClose} aria-label="Deselect verse" className="h-11 w-10 grid place-items-center text-white/50"><X size={17} /></button>
    </div>
    <div className="grid" style={{ gridTemplateColumns: `repeat(${onPin ? 6 : 5}, minmax(0, 1fr))` }}>
      {[
        { i: hasNote ? StickyNote : StickyNote, l: hasNote ? 'Edit note' : 'Note', a: onNote },
        { i: copied ? Check : Copy, l: copied ? 'Copied' : 'Copy', a: onCopy },
        { i: Share2, l: 'Share', a: onShare },
        { i: Link2, l: 'Refs', a: onRefs },
        { i: Sparkles, l: 'Ask Aria', a: onAria },
        ...(onPin ? [{ i: pinned ? Check : Pin, l: pinned ? 'Pinned' : 'Pin', a: onPin }] : []),
      ].map(({ i: Icon, l, a }) => (
        <button key={l} onClick={a} className="h-14 flex flex-col items-center justify-center gap-1 rounded-2xl text-[#d4af37] active:bg-white/10">
          <Icon size={18} /><span className="text-[9px] font-black uppercase tracking-wider">{l}</span>
        </button>
      ))}
    </div>
  </motion.div>
);

export const BookmarkToggle: React.FC<{ on: boolean; onToggle: () => void; color: string }> = ({ on, onToggle, color }) => (
  <button onClick={onToggle} aria-label={on ? 'Remove bookmark' : 'Bookmark this chapter'} aria-pressed={on}
    className="h-11 w-11 grid place-items-center rounded-full active:bg-black/10" style={{ color }}>
    {on ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
  </button>
);

export { BookOpen, Highlighter };
