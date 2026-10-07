// AmboScriptureDock — a docked Bible lookup inside the presenter (ProPresenter's
// Library-Bible / FreeShow scripture tab). Type any reference the way people
// actually type it — "2 pet 3 9", "II Peter 3", "revalation 21 4", "jn3 16" —
// the box anticipates the book and reads the numbers as chapter then verse.
// Send to Program fires a SCRIPTURE layer that composites OVER the live slide
// (the sermon point stays under the reading); Clear drops just that layer.
// Chapters come through scriptureText (IDB-cached, works offline once read).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, MonitorUp, Eraser, Loader2 } from 'lucide-react';
import { ScriptureQuickBar } from './AmboTemplateMenus';
import AmboScriptureListenBar from './AmboScriptureListenBar';
import { BOOKS, TRANSLATIONS, type BibleBook, type BibleVerse } from '../../services/bibleService';
import { getChapter, DEFAULT_TRANSLATION } from '../../services/scriptureText';
import { resolveScriptureQuery, queryLabel } from '../../services/scriptureSearch';

export interface ScriptureCue {
  refId: string;
  reference: string;
  translation: string;
  lines: string[];
}

interface AmboScriptureDockProps {
  scriptureLive: boolean;
  onFire: (cue: ScriptureCue) => void;
  onClear: () => void;
  onClose: () => void;
}

const GOLD = '#E3C57E';
const ORANGE = '#FF8C00';
const line = 'rgba(255,255,255,0.09)';
const glass = 'rgba(255,255,255,0.04)';
const SERIF = 'Palatino Linotype, Palatino, Georgia, serif';

const AmboScriptureDock: React.FC<AmboScriptureDockProps> = ({ scriptureLive, onFire, onClear, onClose }) => {
  const [query, setQuery] = useState('');
  const [book, setBook] = useState<BibleBook>(BOOKS[41]); // Luke
  const [chapter, setChapter] = useState(15);
  const [sel, setSel] = useState<number>(20);
  const [slug, setSlug] = useState<string>(DEFAULT_TRANSLATION);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fireOnLoad = useRef(false);

  const q = useMemo(() => (query.trim() ? resolveScriptureQuery(query) : null), [query]);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    getChapter(slug, book.num, chapter)
      .then(v => { if (!dead) { setVerses(v || []); setLoading(false); } })
      .catch(() => { if (!dead) { setVerses([]); setLoading(false); } });
    return () => { dead = true; };
  }, [slug, book.num, chapter]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-v="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel, verses]);

  const verse = verses.find(v => v.verse === sel);
  const reference = `${book.name} ${chapter}:${sel}`;
  const translation = slug.toUpperCase();

  const fire = (v = verse) => {
    if (!v) return;
    onFire({ refId: `${book.name.toLowerCase()}.${chapter}.${v.verse}`, reference: `${book.name} ${chapter}:${v.verse}`, translation, lines: [v.text] });
  };

  // Take a typed reference once its chapter is in.
  useEffect(() => {
    if (!fireOnLoad.current || loading) return;
    fireOnLoad.current = false;
    fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, verses]);

  /** Go to what the box anticipates; `take` sends it to Program as well. */
  const go = (take: boolean) => {
    if (!q) return;
    const b = q.contextual ? book : q.book;
    if (!b) return;
    const ch = q.chapter ?? (q.contextual ? chapter : 1);
    if (ch < 1 || ch > b.chapters) return;
    const sameChapter = b.num === book.num && ch === chapter;
    setBook(b); setChapter(ch);
    setSel(q.verse ?? 1);
    if (take && q.verse != null) {
      if (sameChapter && !loading) fire(verses.find(v => v.verse === q.verse));
      else fireOnLoad.current = true;
    }
  };

  // Typing a chapter lands there without pressing anything.
  useEffect(() => {
    if (q && q.chapter !== undefined && (q.book || q.contextual)) go(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="fixed inset-0 z-[125] flex justify-end">
      <div className="flex-1" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <aside className="w-[380px] max-w-[92vw] h-full flex flex-col border-l backdrop-blur-xl" style={{ borderColor: line, background: 'rgba(10,7,17,0.92)' }}>
        <header className="flex items-center gap-2 px-4 py-3 border-b flex-none" style={{ borderColor: line }}>
          <span style={{ color: GOLD }}>✦</span>
          <span className="font-semibold tracking-tight">Scripture</span>
          <select value={slug} onChange={e => setSlug(e.target.value)}
            className="ml-1 bg-black/40 border border-white/15 rounded px-1.5 py-0.5 font-mono text-[10px] text-white/70">
            {TRANSLATIONS.map(t => <option key={t.slug} value={t.slug} className="bg-[#120a1f]">{t.slug.toUpperCase()}</option>)}
          </select>
          <div className="flex-1" />
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/5"><X size={16} /></button>
        </header>

        <div className="px-4 py-3 border-b flex flex-col gap-2 flex-none" style={{ borderColor: line }}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') go(true);
              if (e.key === 'Escape') setQuery('');
            }}
            placeholder="john 3 16 · 2 pet 3 9 · II Peter · rev…"
            className="h-10 px-3 rounded-lg text-[14px] text-white outline-none focus:border-[#E3C57E]/60"
            style={{ background: glass, border: `1px solid ${line}`, fontFamily: SERIF }} />
          {q && (
            <div className="text-[11px] flex flex-col gap-1">
              {q.ordinalOnly ? null : q.contextual ? (
                <span style={{ color: GOLD }}>{book.name} {q.chapter}{q.verse != null ? `:${q.verse}` : ''} <span className="text-white/40">· Enter takes it live</span></span>
              ) : q.book ? (
                <span style={{ color: GOLD }}>
                  {queryLabel(q)}
                  {q.chapter !== undefined && !q.ref
                    ? <span className="text-[#F5C542]"> — {q.book.name} has {q.book.chapters} chapters</span>
                    : <span className="text-white/40"> · Enter takes it live</span>}
                </span>
              ) : (
                <span className="text-white/45">No book matches “{query}”</span>
              )}
              {q.matches.length > (q.ordinalOnly ? 0 : 1) && (
                <div className="flex flex-wrap gap-1">
                  {q.matches.slice(q.ordinalOnly ? 0 : 1, 10).map(m => (
                    <button key={m.book.num}
                      onClick={() => { setQuery(`${m.book.name} `); setBook(m.book); setChapter(1); setSel(1); }}
                      className="px-1.5 py-0.5 rounded border border-white/10 text-white/75 hover:text-white hover:bg-white/10">{m.book.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg" style={{ background: 'rgba(227,197,126,0.08)', border: '1px solid rgba(227,197,126,0.25)' }}>
            <span style={{ color: GOLD }}>✦</span>
            <span className="font-semibold" style={{ fontFamily: SERIF }}>{reference}</span>
            <span className="font-mono text-[10px] text-white/40">{translation}</span>
            <div className="flex-1" />
            <button disabled={chapter <= 1} onClick={() => { setChapter(c => c - 1); setSel(1); }} className="px-1.5 text-white/50 hover:text-white disabled:opacity-30">‹</button>
            <button disabled={chapter >= book.chapters} onClick={() => { setChapter(c => c + 1); setSel(1); }} className="px-1.5 text-white/50 hover:text-white disabled:opacity-30">›</button>
          </div>
        </div>

        <AmboScriptureListenBar />

        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-24 text-white/50 text-[12px]"><Loader2 size={14} className="animate-spin" /> Loading {book.name} {chapter}…</div>
          ) : verses.length === 0 ? (
            <div className="text-center text-white/45 text-[12px] py-8 px-4">This chapter is not available offline in {translation} yet.</div>
          ) : verses.map(v => (
            <button key={v.verse} data-v={v.verse} onClick={() => setSel(v.verse)} onDoubleClick={() => { setSel(v.verse); fire(v); }}
              className="w-full text-left px-3 py-2.5 rounded-lg flex gap-2.5 transition-colors"
              style={{ background: v.verse === sel ? 'rgba(227,197,126,0.12)' : 'transparent', boxShadow: v.verse === sel ? `inset 3px 0 0 ${GOLD}` : undefined }}>
              <span className="font-mono text-[11px] flex-none pt-0.5" style={{ color: GOLD, opacity: 0.85 }}>{v.verse}</span>
              <span className="text-[13px] leading-snug" style={{ fontFamily: SERIF, color: v.verse === sel ? '#fff' : 'rgba(255,255,255,0.7)' }}>{v.text}</span>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t flex flex-col gap-2 flex-none" style={{ borderColor: line }}>
          {verse && <ScriptureQuickBar className="flex-wrap" sample={{ text: verse.text, reference, translation }} />}
          {scriptureLive && (
            <div className="flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-md" style={{ color: ORANGE, background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.3)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ORANGE }} /> Scripture is live over the slide
            </div>
          )}
          <button onClick={() => fire()} disabled={!verse} className="h-10 rounded-lg text-white font-bold text-[13px] inline-flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)', boxShadow: '0 0 20px rgba(255,140,0,0.28)' }}>
            <MonitorUp size={15} /> Send to Program
          </button>
          <button onClick={onClear} disabled={!scriptureLive} className="h-9 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-2 border disabled:opacity-40" style={{ borderColor: line, background: glass, color: 'rgba(255,255,255,0.8)' }}>
            <Eraser size={14} /> Clear scripture
          </button>
          <p className="text-[10.5px] text-white/40 text-center leading-snug mt-0.5">Composites over the live slide — the sermon point stays visible under the verse, like ProPresenter / FreeShow.</p>
        </div>
      </aside>
    </div>
  );
};

export default AmboScriptureDock;
