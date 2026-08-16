// LectioReader — the three-pane study reader.
//
// Two-tier surface rule, inherited from Melos: the READING PAGE is a material
// (vellum, lamplight, onion skin, night) and is the only element allowed a
// texture. Every pane around it — canon rail, study rail, chrome — stays
// Plajah-dark. Paper stops at the console door.
//
// The study rail is summoned, not permanent: a first-time reader sees a book,
// a scholar taps once and gets a workbench.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft, ChevronRight, Search, Sparkles, StickyNote, Highlighter,
  Link2, Copy, Download, X, Check, Columns2, Loader2,
} from 'lucide-react';
import {
  BOOKS, translationsForBook,
  type BibleBook, type BibleVerse,
} from '../../services/bibleService';
import {
  formatRef, parseRefId, refId, type ScriptureRef,
} from '../../services/scriptureRef';
import {
  migrateLegacyReceipts, serviceNotesByDay, syncServiceNotes, pushAllSessions,
  formatTC as svcTC, type ServiceNoteDay,
} from '../../services/serviceNotes';
import {
  DEFAULT_TRANSLATION, getParallel, hydrateForSearch, localCoverage, preloadTranslation,
  prefetchAdjacent, searchCached, type PreloadProgress, type SearchHit,
} from '../../services/scriptureText';
import { crossRefsFor, CROSS_REF_COVERAGE } from '../../data/crossReferences';
import { auth, loadBibleNotes, saveBibleNote } from '../../services/backendService';

// ── Reading surfaces ─────────────────────────────────────────────────────────
// Only these four touch the page. Everything else is Plajah-dark.
interface Skin { id: string; label: string; bg: string; ink: string; muted: string; num: string; mark: string; }

const SKINS: Skin[] = [
  { id: 'vellum',    label: 'Vellum',     bg: 'radial-gradient(120% 90% at 30% 0%, #F7F1E2 0%, #EFE7D4 55%, #E7DDC6 100%)', ink: '#241E14', muted: '#7B7059', num: '#A8862E', mark: 'rgba(212,175,55,0.34)' },
  { id: 'lamplight', label: 'Lamplight',  bg: 'radial-gradient(120% 90% at 50% 0%, #2A2015 0%, #1B140C 60%, #120D07 100%)', ink: '#F0E2C6', muted: '#9A8A6C', num: '#D4AF37', mark: 'rgba(212,175,55,0.26)' },
  { id: 'onion',     label: 'Onion Skin', bg: 'linear-gradient(180deg, #FBFAF7 0%, #F3F2EE 100%)',                          ink: '#1E1E22', muted: '#77777F', num: '#8A7430', mark: 'rgba(160,140,60,0.28)' },
  { id: 'night',     label: 'Night',      bg: 'linear-gradient(180deg, #0C0B12 0%, #08070C 100%)',                          ink: '#DED8EA', muted: '#6E6688', num: '#D4AF37', mark: 'rgba(212,175,55,0.2)' },
];

const SKIN_KEY = 'plajah_lectio_skin_v1';
const HL_KEY = 'plajah_lectio_highlights_v1';
const NOTES_KEY = 'plajah_bible_notes_v1';   // shared with the legacy reader

const SERIF = '"Palatino Linotype", "Iowan Old Style", Palatino, "Book Antiqua", Georgia, serif';

type RailTab = 'refs' | 'notes' | 'search';

function loadMap(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function saveMap(key: string, v: Record<string, string>) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota / private mode */ }
}

const askAria = (prompt: string) =>
  window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt } }));

interface Props { openAt?: ScriptureRef | null; }

const LectioReader: React.FC<Props> = ({ openAt }) => {
  const [book, setBook] = useState<BibleBook>(
    (openAt && BOOKS.find(b => b.num === openAt.book)) || BOOKS.find(b => b.name === 'John')!,
  );
  const [chapter, setChapter] = useState(openAt?.chapter ?? 1);
  const [activeVerse, setActiveVerse] = useState<number | null>(openAt?.verse ?? null);

  const avail = useMemo(() => translationsForBook(book.testament), [book]);
  const [active, setActive] = useState<string[]>([DEFAULT_TRANSLATION]);
  const [data, setData] = useState<Record<string, BibleVerse[]>>({});
  const [loading, setLoading] = useState(true);

  const [skinId, setSkinId] = useState(() => localStorage.getItem(SKIN_KEY) || 'vellum');
  const skin = SKINS.find(s => s.id === skinId) ?? SKINS[0];
  const [size, setSize] = useState(17);

  const [notes, setNotes] = useState<Record<string, string>>(() => loadMap(NOTES_KEY));
  const [highlights, setHighlights] = useState<Record<string, string>>(() => loadMap(HL_KEY));
  const [rail, setRail] = useState<RailTab>('refs');
  const [railOpen, setRailOpen] = useState(true);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [preload, setPreload] = useState<PreloadProgress | null>(null);
  const [coverage, setCoverage] = useState(0);
  const [copied, setCopied] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const verseRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── data ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    setLoading(true);
    // Through getParallel, not bibleService.fetchParallel — reading is what
    // builds up offline coverage and the search index.
    getParallel(book.num, chapter, active.length ? active : [DEFAULT_TRANSLATION])
      .then(d => { if (!dead) { setData(d); setLoading(false); } });
    prefetchAdjacent(active[0] ?? DEFAULT_TRANSLATION, book.num, chapter);
    return () => { dead = true; };
  }, [book, chapter, active]);

  useEffect(() => {
    setActive(prev => {
      const ok = prev.filter(s => avail.some(t => t.slug === s));
      return ok.length ? ok : [avail[0]?.slug ?? DEFAULT_TRANSLATION];
    });
  }, [avail]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    loadBibleNotes(uid).then(cloud => {
      if (Object.keys(cloud).length) setNotes(prev => ({ ...prev, ...cloud }));
    });
  }, []);

  // Re-point when another chip is tapped while the reader is open.
  useEffect(() => {
    if (!openAt) return;
    const target = BOOKS.find(b => b.num === openAt.book);
    if (target) setBook(target);
    setChapter(openAt.chapter);
    setActiveVerse(openAt.verse ?? null);
  }, [openAt?.book, openAt?.chapter, openAt?.verse]);

  // Scroll the deep-linked verse into view once its text has arrived.
  useEffect(() => {
    if (loading || activeVerse == null) return;
    verseRefs.current[activeVerse]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [loading, activeVerse, book, chapter]);

  useEffect(() => () => { cancelRef.current.cancelled = true; }, []);

  const verseNums = useMemo(() => {
    const set = new Set<number>();
    Object.values(data).forEach(vs => vs.forEach(v => set.add(v.verse)));
    return [...set].sort((a, b) => a - b);
  }, [data]);

  const currentRef = useCallback(
    (v?: number): ScriptureRef => ({ book: book.num, bookName: book.name, chapter, verse: v }),
    [book, chapter],
  );
  const keyFor = (v: number) => `${book.num}:${chapter}:${v}`;

  // ── actions ────────────────────────────────────────────────────────────────
  const setNote = (v: number, text: string) => {
    const k = keyFor(v);
    setNotes(prev => {
      const n = { ...prev };
      if (text.trim()) n[k] = text; else delete n[k];
      saveMap(NOTES_KEY, n);
      return n;
    });
    const uid = auth.currentUser?.uid;
    if (uid) {
      clearTimeout(saveTimers.current[k]);
      saveTimers.current[k] = setTimeout(() => saveBibleNote(uid, k, text), 800);
    }
  };

  const toggleHighlight = (v: number) => {
    setHighlights(prev => {
      const n = { ...prev };
      if (n[keyFor(v)]) delete n[keyFor(v)]; else n[keyFor(v)] = 'gold';
      saveMap(HL_KEY, n);
      return n;
    });
  };

  const goTo = (ref: ScriptureRef) => {
    const target = BOOKS.find(b => b.num === ref.book);
    if (!target) return;
    setBook(target);
    setChapter(ref.chapter);
    setActiveVerse(ref.verse ?? null);
    setRail('refs');
  };

  const copyVerse = async (v: number) => {
    const text = data[active[0]]?.find(x => x.verse === v)?.text ?? '';
    try {
      await navigator.clipboard.writeText(`${formatRef(currentRef(v), 'display')} — ${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked */ }
  };

  const prevCh = () => {
    if (chapter > 1) setChapter(chapter - 1);
    else { const i = BOOKS.indexOf(book); if (i > 0) { setBook(BOOKS[i - 1]); setChapter(BOOKS[i - 1].chapters); } }
    setActiveVerse(null);
  };
  const nextCh = () => {
    if (chapter < book.chapters) setChapter(chapter + 1);
    else { const i = BOOKS.indexOf(book); if (i < BOOKS.length - 1) { setBook(BOOKS[i + 1]); setChapter(1); } }
    setActiveVerse(null);
  };

  // Paging with the keyboard, unless the caret is in a note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') nextCh();
      if (e.key === 'ArrowLeft') prevCh();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const slug = active[0] ?? DEFAULT_TRANSLATION;

  // Report real coverage from disk, and pull it into memory so search can see
  // it — otherwise a reload leaves a full local cache looking empty.
  useEffect(() => {
    let dead = false;
    (async () => {
      const c = await localCoverage(slug);
      if (!dead) setCoverage(c);
      if (c > 0.02) { await hydrateForSearch(slug); }
    })();
    return () => { dead = true; };
  }, [slug]);

  const runSearch = (q: string) => {
    setQuery(q);
    setHits(searchCached(q, slug));
  };

  const startPreload = async () => {
    if (preload) return;
    cancelRef.current = { cancelled: false };
    setPreload({ done: 0, total: 1, label: 'Starting' });
    await preloadTranslation(slug, p => setPreload(p), cancelRef.current);
    setPreload(null);
    setCoverage(await localCoverage(slug));
  };

  const refsForActive = activeVerse != null ? crossRefsFor(currentRef(activeVerse)) : [];
  const noteEntries = Object.entries(notes).filter(([k]) => k.startsWith(`${book.num}:`));

  // Generated service notes, grouped by day. Read once the rail is opened so a
  // reader who never looks at notes pays nothing for them.
  const [serviceDays, setServiceDays] = useState<ServiceNoteDay[]>([]);
  useEffect(() => {
    if (rail !== 'notes') return;
    let dead = false;
    migrateLegacyReceipts();
    setServiceDays(serviceNotesByDay());
    // Pull the member's own copy so a new device shows the services they
    // followed elsewhere, then re-render with the union.
    const uid = auth.currentUser?.uid;
    if (uid) {
      void (async () => {
        await syncServiceNotes(uid);
        await pushAllSessions(uid);
        if (!dead) setServiceDays(serviceNotesByDay());
      })();
    }
    return () => { dead = true; };
  }, [rail]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex h-[calc(100vh-49px)] overflow-hidden">

      {/* ── Canon rail ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[172px] shrink-0 flex-col border-r border-white/8 bg-black/25">
        <div className="px-3 py-2.5 border-b border-white/8 text-[8.5px] font-black uppercase tracking-[0.16em] text-white/30">Canon</div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
          {(['OT', 'NT'] as const).map(t => (
            <div key={t} className="mb-2">
              <p className="px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-[#d4af37]/50">
                {t === 'OT' ? 'Old Testament' : 'New Testament'}
              </p>
              {BOOKS.filter(b => b.testament === t).map(b => (
                <button key={b.num}
                  onClick={() => { setBook(b); setChapter(1); setActiveVerse(null); }}
                  className={`w-full text-left px-2 py-[5px] rounded-md text-[11px] font-bold transition-colors ${
                    b.num === book.num ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-white/55 hover:bg-white/[0.07] hover:text-white'
                  }`}>
                  {b.name}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-white/8 p-2">
          <p className="px-1 pb-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-white/30">Chapter</p>
          <div className="grid grid-cols-5 gap-1 max-h-[124px] overflow-y-auto custom-scrollbar">
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map(c => (
              <button key={c} onClick={() => { setChapter(c); setActiveVerse(null); }}
                className={`py-1 rounded text-[10px] font-black tabular-nums transition-colors ${
                  c === chapter ? 'bg-[#d4af37] text-black' : 'text-white/45 hover:bg-white/10 hover:text-white'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Reading page ───────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* chrome above the page — stays Plajah-dark */}
        <div className="flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-white/8 bg-black/25 flex-wrap">
          <button onClick={prevCh} aria-label="Previous chapter"
            className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-white/[0.12]">
            <ChevronLeft size={13} />
          </button>
          <span className="text-[12px] font-black tracking-tight">
            {book.name} <span className="text-[#d4af37]">{chapter}</span>
          </span>
          <button onClick={nextCh} aria-label="Next chapter"
            className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-white/[0.12]">
            <ChevronRight size={13} />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {avail.map(t => (
            <button key={t.slug}
              onClick={() => setActive(prev =>
                prev.includes(t.slug) ? (prev.length > 1 ? prev.filter(s => s !== t.slug) : prev) : [...prev, t.slug])}
              className={`px-2 py-[3px] rounded-full text-[8.5px] font-black uppercase tracking-widest border transition-all ${
                active.includes(t.slug) ? 'text-black border-[#d4af37]' : 'border-white/10 text-white/40 hover:text-white'
              }`}
              style={active.includes(t.slug) ? { background: '#d4af37' } : {}}>
              {t.label}
            </button>
          ))}
          {active.length > 1 && <Columns2 size={11} className="text-white/25" />}

          <div className="ml-auto flex items-center gap-1.5">
            {SKINS.map(s => (
              <button key={s.id} onClick={() => { setSkinId(s.id); localStorage.setItem(SKIN_KEY, s.id); }}
                title={s.label} aria-label={`${s.label} reading surface`}
                className={`w-5 h-5 rounded-full border transition-all ${
                  s.id === skinId ? 'border-[#d4af37] scale-110' : 'border-white/15 hover:border-white/40'
                }`}
                style={{ background: s.bg }} />
            ))}
            <div className="w-px h-4 bg-white/10 mx-0.5" />
            <button onClick={() => setSize(v => Math.max(14, v - 1))} className="px-1.5 text-[11px] text-white/45 hover:text-white" aria-label="Smaller text">A−</button>
            <button onClick={() => setSize(v => Math.min(26, v + 1))} className="px-1.5 text-[13px] font-bold text-white/45 hover:text-white" aria-label="Larger text">A+</button>
            <button onClick={() => setRailOpen(v => !v)}
              className="ml-1 px-2 py-1 rounded-md border border-white/12 text-[8.5px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/[0.08]">
              {railOpen ? 'Hide study' : 'Study'}
            </button>
          </div>
        </div>

        {/* the page itself — the one skinnable surface */}
        <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ background: skin.bg }}>
          <div className="mx-auto px-6 sm:px-10 py-9" style={{ maxWidth: active.length > 1 ? 1000 : 680 }}>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] mb-6" style={{ color: skin.num }}>
              {book.name} {chapter} · {active.map(s => avail.find(t => t.slug === s)?.label).filter(Boolean).join(' · ')}
            </p>

            {loading ? (
              <p className="py-24 text-center text-[10px] font-black uppercase tracking-widest" style={{ color: skin.muted }}>
                Gathering the witnesses…
              </p>
            ) : verseNums.length === 0 ? (
              <p className="py-24 text-center text-[11px]" style={{ color: skin.muted }}>
                This chapter isn’t available in the selected translations.
              </p>
            ) : (
              <div>
                {verseNums.map((v, idx) => {
                  const isActive = activeVerse === v;
                  const hl = !!highlights[keyFor(v)];
                  const note = notes[keyFor(v)];
                  return (
                    <div key={v} ref={el => { verseRefs.current[v] = el; }}
                      onClick={() => setActiveVerse(isActive ? null : v)}
                      className="cursor-pointer rounded-lg -mx-2 px-2 py-0.5 transition-colors"
                      style={isActive ? { background: skin.mark } : undefined}>
                      <div className={active.length > 1 ? 'grid sm:grid-cols-2 gap-x-7' : ''}>
                        {active.map(slug => {
                          const t = avail.find(x => x.slug === slug)!;
                          const text = data[slug]?.find(x => x.verse === v)?.text || '';
                          const isHebrew = t.lang === 'he';
                          return (
                            <p key={slug} dir={t.rtl ? 'rtl' : 'ltr'} lang={t.lang}
                              className={`mb-1.5 ${t.rtl ? 'text-right' : ''}`}
                              style={{
                                fontFamily: SERIF,
                                fontSize: isHebrew ? size + 3 : size,
                                lineHeight: isHebrew ? 2 : 1.72,
                                color: skin.ink,
                                background: hl && !isActive ? skin.mark : undefined,
                                borderRadius: hl ? 3 : undefined,
                              }}>
                              {idx === 0 && slug === active[0] && (
                                <span aria-hidden style={{
                                  float: t.rtl ? 'right' : 'left', fontSize: size * 2.8, lineHeight: 0.84,
                                  padding: t.rtl ? '4px 0 0 10px' : '4px 10px 0 0', color: skin.num, fontFamily: SERIF,
                                }}>
                                  {text.charAt(0)}
                                </span>
                              )}
                              <sup className="font-mono font-bold mr-1" style={{ fontSize: 9.5, color: skin.num, verticalAlign: '0.42em' }}>{v}</sup>
                              {idx === 0 && slug === active[0] ? text.slice(1) : text}
                              {note && <StickyNote size={10} className="inline ml-1.5 -mt-1" style={{ color: skin.num }} />}
                            </p>
                          );
                        })}
                      </div>

                      {isActive && (
                        <div className="flex items-center gap-1.5 flex-wrap pb-2 pt-0.5" onClick={e => e.stopPropagation()}>
                          {[
                            { icon: Highlighter, label: hl ? 'Unhighlight' : 'Highlight', act: () => toggleHighlight(v) },
                            { icon: StickyNote, label: 'Note', act: () => { setRail('notes'); setRailOpen(true); } },
                            { icon: copied ? Check : Copy, label: copied ? 'Copied' : 'Copy', act: () => copyVerse(v) },
                            { icon: Link2, label: 'Cross-refs', act: () => { setRail('refs'); setRailOpen(true); } },
                            { icon: Sparkles, label: 'Ask Aria', act: () => askAria(`You are Aria, a learned and reverent Bible teacher. Explain ${formatRef(currentRef(v), 'display')}. Give the historical and cultural context, the meaning in the original language, how it was understood in the early Church, and how it connects to the rest of Scripture. Cite the passages you draw on.`) },
                          ].map(({ icon: Icon, label, act }) => (
                            <button key={label} onClick={act}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-[8.5px] font-black uppercase tracking-widest transition-opacity hover:opacity-100 opacity-70"
                              style={{ color: skin.num, border: `1px solid ${skin.num}44` }}>
                              <Icon size={10} /> {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Study rail ─────────────────────────────────────────────── */}
      {railOpen && (
        <aside className="hidden lg:flex w-[268px] shrink-0 flex-col border-l border-white/8 bg-black/25">
          <div className="flex border-b border-white/8">
            {([['refs', 'Refs'], ['notes', 'Notes'], ['search', 'Search']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setRail(id)}
                className={`flex-1 py-2 text-[8.5px] font-black uppercase tracking-[0.14em] border-b-2 transition-colors ${
                  rail === id ? 'text-[#d4af37] border-[#d4af37]' : 'text-white/35 border-transparent hover:text-white/70'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            {rail === 'refs' && (
              activeVerse == null ? (
                <p className="text-[10px] text-white/30 leading-relaxed pt-2">
                  Tap a verse to see where else Scripture says it.
                </p>
              ) : refsForActive.length ? (
                <div className="space-y-1.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-2">
                    {formatRef(currentRef(activeVerse), 'compact')} points to
                  </p>
                  {refsForActive.map(r => (
                    <button key={refId(r)} onClick={() => goTo(r)}
                      className="w-full text-left px-2.5 py-2 rounded-lg border border-white/10 hover:border-[#d4af37]/40 hover:bg-[#d4af37]/[0.07] transition-colors">
                      <span className="font-mono text-[9.5px] uppercase tracking-wider text-[#d4af37]">{formatRef(r, 'compact')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pt-2 space-y-2">
                  <p className="text-[10px] text-white/35 leading-relaxed">
                    No cross-references yet for {formatRef(currentRef(activeVerse), 'display')}.
                  </p>
                  <p className="text-[9px] text-white/25 leading-relaxed">
                    The curated set covers {CROSS_REF_COVERAGE} passages. The full public-domain
                    apparatus is still to be imported — this pane says so rather than implying
                    the verse has no parallels.
                  </p>
                </div>
              )
            )}

            {rail === 'notes' && (
              <div className="space-y-3">
                {activeVerse != null && (
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#d4af37] mb-1.5">
                      {formatRef(currentRef(activeVerse), 'compact')}
                    </p>
                    <textarea
                      value={notes[keyFor(activeVerse)] || ''}
                      onChange={e => setNote(activeVerse, e.target.value)}
                      placeholder="Your note…"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-[11.5px] text-white/85 placeholder-white/20 outline-none focus:border-[#d4af37]/50 resize-none min-h-[86px]"
                    />
                  </div>
                )}
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-2">
                    Your notes in {book.name} · {noteEntries.length}
                  </p>
                  {noteEntries.length === 0 ? (
                    <p className="text-[10px] text-white/25">Nothing yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {noteEntries.map(([k, text]) => {
                        const [, ch, vs] = k.split(':').map(Number);
                        return (
                          <button key={k}
                            onClick={() => { setChapter(ch); setActiveVerse(vs); }}
                            className="w-full text-left px-2.5 py-2 rounded-lg border border-white/10 hover:border-[#d4af37]/40 transition-colors">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-[#d4af37]">
                              {book.name} {ch}:{vs}
                            </span>
                            <p className="text-[10.5px] text-white/55 mt-0.5 line-clamp-2">{text}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Notes the platform generated, grouped by the day they were
                    heard. Its own section — never mixed with the above. */}
                {serviceDays.length > 0 && (
                  <div className="pt-3 border-t border-white/8">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles size={9} className="text-white/30" />
                      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 flex-1">
                        From services
                      </p>
                    </div>
                    <div className="space-y-2.5">
                      {serviceDays.slice(0, 6).map(g => (
                        <div key={`${g.day}-${g.sessionId}`}>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-mono text-[8.5px] uppercase tracking-wider text-[#d4af37]/70">{g.label}</span>
                            <span className="text-[9px] text-white/30 truncate">{g.serviceTitle}</span>
                          </div>
                          <div className="space-y-1">
                            {g.notes.map(n => {
                              const r = parseRefId(n.refId);
                              return (
                                <button key={`${n.sessionId}-${n.refId}`}
                                  onClick={() => r && goTo(r)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/8 hover:border-[#d4af37]/35 transition-colors">
                                  <span className="font-mono text-[9px] uppercase tracking-wider text-white/50 flex-1 text-left">{n.label}</span>
                                  <span className="font-mono text-[8.5px] text-white/25 tabular-nums">{svcTC(n.programTC)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {rail === 'search' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
                  <input value={query} onChange={e => runSearch(e.target.value)}
                    placeholder="Search downloaded text…"
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-2.5 py-2 text-[11.5px] text-white/85 placeholder-white/20 outline-none focus:border-[#d4af37]/50" />
                </div>

                {/* Coverage is stated, never implied. */}
                <div className="rounded-lg border border-white/10 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">Available offline</span>
                    <span className="font-mono text-[9.5px] text-[#d4af37] tabular-nums">
                      {Math.round((preload ? preload.done / preload.total : coverage) * 100)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-[#d4af37] transition-all"
                      style={{ width: `${Math.round((preload ? preload.done / preload.total : coverage) * 100)}%` }} />
                  </div>
                  {preload ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/40 flex items-center gap-1.5">
                        <Loader2 size={10} className="animate-spin" /> {preload.label}
                      </span>
                      <button onClick={() => { cancelRef.current.cancelled = true; }}
                        className="text-[8.5px] font-black uppercase tracking-widest text-white/40 hover:text-white flex items-center gap-1">
                        <X size={9} /> Stop
                      </button>
                    </div>
                  ) : (
                    <button onClick={startPreload}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-[#d4af37]/15 border border-[#d4af37]/35 text-[8.5px] font-black uppercase tracking-widest text-[#d4af37] hover:bg-[#d4af37]/25 transition-colors">
                      <Download size={10} /> Download for offline
                    </button>
                  )}
                  <p className="text-[8.5px] text-white/25 leading-relaxed">
                    Search covers what you’ve downloaded. Sanctuary wifi shouldn’t decide whether Scripture loads.
                  </p>
                </div>

                {query.length >= 3 && (
                  <div className="space-y-1.5">
                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">
                      {hits.length} {hits.length === 1 ? 'result' : 'results'}
                    </p>
                    {hits.map(h => (
                      <button key={refId(h.ref)} onClick={() => goTo(h.ref)}
                        className="w-full text-left px-2.5 py-2 rounded-lg border border-white/10 hover:border-[#d4af37]/40 transition-colors">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-[#d4af37]">{formatRef(h.ref, 'compact')}</span>
                        <p className="text-[10.5px] text-white/55 mt-0.5 line-clamp-2">{h.text}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </motion.div>
  );
};

export default LectioReader;
