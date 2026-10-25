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
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft, ChevronRight, Search, Sparkles, StickyNote, Highlighter,
  Link2, Copy, Download, X, Check, Columns2, Loader2, Pin,
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
import { auth } from '../../services/backendService';
import { verseNotes } from '../../services/readerNotes';
import CanonBookPicker from './CanonBookPicker';
import { canonBooks, canonMark, type BibleCanon } from '../../services/bibleCanon';
import { TRANSLATIONS } from '../../services/bibleService';
import LectioConcordance from './LectioConcordance';
import LectioHistory from './LectioHistory';
import LectioLexicon from './LectioLexicon';
import LectioOriginals from './LectioOriginals';
import LectioComparativeSearch from './LectioComparativeSearch';
import ResearchNotebook from '../faith/ResearchNotebook';
import {
  listenToSession, resolveCue, cueRef, isClear, type FollowMode, type ScriptureSession,
} from '../../services/kairosService';
import { recordServiceNote, pushSession, verseKeyOf } from '../../services/serviceNotes';
import LectioCouncilPlatesModal from './LectioCouncilPlatesModal';
import {
  useIsMobile, HL_COLORS, MobileBottomBar, NavigatorSheet, DisplaySheet, VerseActionBar, BookmarkToggle,
  type BookmarkEntry,
} from './LectioMobile';

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
const POS_KEY = 'plajah_lectio_position_v1';
const MARKS_KEY = 'plajah_lectio_bookmarks_v1';
// Verse notes live in the shared notebook (services/readerNotes → verseNotes).

const SERIF = '"Palatino Linotype", "Iowan Old Style", Palatino, "Book Antiqua", Georgia, serif';

type RailTab = 'refs' | 'notes' | 'search' | 'study' | 'history' | 'words' | 'originals' | 'notebook' | 'compare';

function loadMap(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function saveMap(key: string, v: Record<string, string>) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota / private mode */ }
}

const askAria = (prompt: string) =>
  window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt } }));

interface Props {
  openAt?: ScriptureRef | null;
  /** A live service (Stage scripture session). The reader turns to each cue the
   *  operator puts on screen, until the reader navigates away on their own. */
  followSessionId?: string | null;
  followMode?: FollowMode;
  playheadSec?: number;
  /** Sermon prep: a verse can be pinned from the reader into the open sermon. */
  onPinVerse?: (pin: { ref: ScriptureRef; text: string }) => void;
}

const LectioReader: React.FC<Props> = ({ openAt, followSessionId, followMode = 'IN_ROOM', playheadSec, onPinVerse }) => {
  const initialCatholic = !!openAt && (openAt.book>66 || (openAt.book===17 && openAt.chapter>10) || (openAt.book===27 && openAt.chapter>12));
  // No deep link: resume where this reader left off.
  const saved = useMemo(() => {
    if (openAt) return null;
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null') as { canon: BibleCanon; book: number; chapter: number } | null; } catch { return null; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const startCanon: BibleCanon = initialCatholic ? 'catholic' : saved?.canon ?? 'protestant';
  const [book, setBook] = useState<BibleBook>(
    (openAt && canonBooks(initialCatholic?'catholic':'protestant').find(b => b.num === openAt.book))
      || (saved && canonBooks(startCanon).find(b => b.num === saved.book))
      || BOOKS.find(b => b.name === 'John')!,
  );
  const [chapter, setChapter] = useState(openAt?.chapter ?? (saved && saved.chapter <= (canonBooks(startCanon).find(b => b.num === saved.book)?.chapters ?? 0) ? saved.chapter : 1));
  const [activeVerse, setActiveVerse] = useState<number | null>(openAt?.verse ?? null);

  const [canon, setCanon] = useState<BibleCanon>(startCanon);
  const visibleBooks = useMemo(()=>canonBooks(canon),[canon]);
  const avail = useMemo(() => canon==='catholic' ? TRANSLATIONS.filter(t=>t.slug==='douayrheims') : canon==='orthodox' ? TRANSLATIONS.filter(t=>t.slug===(book.testament==='OT'?'lxx':'textusreceptus')) : translationsForBook(book.testament).filter(t=>t.slug!=='douayrheims'), [book,canon]);
  const [active, setActive] = useState<string[]>([startCanon==='catholic'?'douayrheims':startCanon==='orthodox'?(book.testament==='OT'?'lxx':'textusreceptus'):DEFAULT_TRANSLATION]);
  const [data, setData] = useState<Record<string, BibleVerse[]>>({});
  const [loading, setLoading] = useState(true);

  // Following a service starts on the darkest page: phones brightening in a quiet room is what churches distrust.
  const [skinId, setSkinId] = useState(() => localStorage.getItem(SKIN_KEY) || (followSessionId ? 'night' : 'vellum'));
  const skin = SKINS.find(s => s.id === skinId) ?? SKINS[0];
  const [size, setSize] = useState(() => Number(localStorage.getItem('plajah_lectio_size_v1')) || 17);

  const [notes, setNotes] = useState<Record<string, string>>(() => verseNotes.read());
  const [highlights, setHighlights] = useState<Record<string, string>>(() => loadMap(HL_KEY));
  const [rail, setRail] = useState<RailTab>('refs');
  const [wordLookup, setWordLookup] = useState<string | undefined>();
  const isMobile = useIsMobile();
  const [railOpen, setRailOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [sheet, setSheet] = useState<null | 'nav' | 'display'>(null);
  const [pinnedFlash, setPinnedFlash] = useState<number | null>(null);
  const [barOpen, setBarOpen] = useState(false);   // verse action bar: only on a tap, never when a live cue lands
  const [chromeHidden, setChromeHidden] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(() => { try { return JSON.parse(localStorage.getItem(MARKS_KEY) || '[]'); } catch { return []; } });
  const lastScroll = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [preload, setPreload] = useState<PreloadProgress | null>(null);
  const [coverage, setCoverage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [councilModalOpen, setCouncilModalOpen] = useState(false);

  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const verseRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { try { localStorage.setItem(POS_KEY, JSON.stringify({ canon, book: book.num, chapter })); } catch { /* private mode */ } }, [canon, book, chapter]);
  useEffect(() => { try { localStorage.setItem('plajah_lectio_size_v1', String(size)); } catch { /* private mode */ } }, [size]);
  // The rail is a desktop side panel; on a phone it is a sheet and starts closed.
  useEffect(() => { if (isMobile) setRailOpen(false); }, [isMobile]);

  // ── live service follow ────────────────────────────────────────────────────
  // Same Kairos feed the Stage operator drives. One cue, N renderings: the
  // reader shows it in the READER's translation, not the church's.
  const [session, setSession] = useState<ScriptureSession | null>(null);
  const [following, setFollowing] = useState(true);
  const livePos = useRef({ b: book.num, c: chapter });   // where the reader last put the page itself
  const lastCueSeq = useRef(-1);
  useEffect(() => {
    if (!followSessionId) { setSession(null); return; }
    setFollowing(true);
    return listenToSession(followSessionId, setSession);
  }, [followSessionId]);
  const liveCue = useMemo(() => resolveCue(session, followMode, playheadSec), [session, followMode, playheadSec]);
  const liveRef = useMemo(() => (liveCue && !isClear(liveCue) ? cueRef(liveCue) : null), [liveCue]);
  const behind = !!followSessionId && !following && !!liveRef;
  const liveHas = (v: number) => !!liveRef && liveRef.book === book.num && liveRef.chapter === chapter
    && liveRef.verse != null && v >= liveRef.verse && v <= (liveRef.endVerse ?? liveRef.verse);

  const turnToLive = useCallback((ref: ScriptureRef) => {
    const wantCanon: BibleCanon = ref.book > 66 || (ref.book === 17 && ref.chapter > 10) || (ref.book === 27 && ref.chapter > 12) ? 'catholic' : canon;
    let list = canonBooks(wantCanon);
    let target = list.find(b => b.num === ref.book);
    let useCanon = wantCanon;
    if (!target) { useCanon = 'protestant'; list = canonBooks('protestant'); target = list.find(b => b.num === ref.book); }
    if (!target) return;
    livePos.current = { b: target.num, c: ref.chapter };
    if (useCanon !== canon) setCanon(useCanon);
    setBook(target); setChapter(ref.chapter); setActiveVerse(ref.verse ?? null);
    setSheet(null);
  }, [canon]);

  useEffect(() => {
    if (!followSessionId || !following || !liveRef || !liveCue) return;
    turnToLive(liveRef);
    if (liveCue.seq === lastCueSeq.current) return;
    lastCueSeq.current = liveCue.seq;
    // A receipt that this passage was put in front of you, with the program
    // time — the service-notes store, never your own notebook.
    recordServiceNote({
      verseKey: verseKeyOf(liveRef), refId: liveCue.refId,
      label: liveCue.label || formatRef(liveRef, 'display'),
      sessionId: followSessionId, serviceTitle: session?.title ?? 'Service', programTC: liveCue.programTC,
    });
    const uid = auth.currentUser?.uid;
    if (uid) void pushSession(uid, followSessionId);
  }, [liveCue?.seq, liveCue?.refId, following, followSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any move the reader did not make itself means they are reading on their
  // own: stop following. The page never snaps back without a tap on Jump to live.
  useEffect(() => {
    if (!followSessionId) return;
    if (livePos.current.b === book.num && livePos.current.c === chapter) return;
    setFollowing(false);
  }, [book, chapter]); // eslint-disable-line react-hooks/exhaustive-deps
  const jumpToLive = () => { if (!liveRef) return; setFollowing(true); turnToLive(liveRef); };
  const pauseFollow = () => { if (followSessionId && following) setFollowing(false); };

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
    let dead = false;
    const unsubscribe = verseNotes.subscribe(() => { if (!dead) setNotes(verseNotes.read()); });
    void verseNotes.sync().then(n => { if (!dead) setNotes(n); });
    return () => { dead = true; unsubscribe(); };
  }, []);

  // Re-point when another chip is tapped while the reader is open.
  useEffect(() => {
    if (!openAt) return;
    const target = visibleBooks.find(b => b.num === openAt.book);
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
  const notePrefix = canon==='protestant'?'':`${canon}.`;
  const keyFor = (v: number) => `${notePrefix}${book.num}:${chapter}:${v}`;

  // ── actions ────────────────────────────────────────────────────────────────
  const setNote = (v: number, text: string) => {
    const k = keyFor(v);
    setNotes(prev => {
      const n = { ...prev };
      if (text.trim()) n[k] = text; else delete n[k];
      return n;
    });
    verseNotes.write(k, text);
  };

  const toggleHighlight = (v: number) => {
    setHighlights(prev => {
      const n = { ...prev };
      if (n[keyFor(v)]) delete n[keyFor(v)]; else n[keyFor(v)] = 'gold';
      saveMap(HL_KEY, n);
      return n;
    });
  };
  const setHighlightColor = (v: number, color: string | null) => {
    setHighlights(prev => {
      const n = { ...prev };
      if (color) n[keyFor(v)] = color; else delete n[keyFor(v)];
      saveMap(HL_KEY, n);
      return n;
    });
  };
  const washFor = (id: string | undefined) => HL_COLORS.find(c => c.id === id)?.wash ?? skin.mark;

  const isMarked = bookmarks.some(b => b.canon === canon && b.book === book.num && b.chapter === chapter);
  const persistMarks = (n: BookmarkEntry[]) => { try { localStorage.setItem(MARKS_KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; };
  const toggleBookmark = () => setBookmarks(prev => persistMarks(isMarked
    ? prev.filter(b => !(b.canon === canon && b.book === book.num && b.chapter === chapter))
    : [{ book: book.num, bookName: book.name, chapter, canon, at: Date.now() }, ...prev]));
  const removeBookmark = (m: BookmarkEntry) => setBookmarks(prev => persistMarks(prev.filter(b => !(b.canon === m.canon && b.book === m.book && b.chapter === m.chapter))));
  const switchCanon = (c: BibleCanon) => {
    const list = canonBooks(c);
    setCanon(c); setBook(list.find(b => b.num === book.num) ?? list[0]); setChapter(1); setActiveVerse(null);
    setActive([c === 'catholic' ? 'douayrheims' : c === 'orthodox' ? (book.testament === 'NT' ? 'textusreceptus' : 'lxx') : 'kjv']);
  };
  const openBookmark = (m: BookmarkEntry) => {
    if (m.canon !== canon) setCanon(m.canon);
    const target = canonBooks(m.canon).find(b => b.num === m.book);
    if (target) { setBook(target); setChapter(m.chapter); setActiveVerse(null); }
  };
  const toggleTranslation = (slug: string) =>
    setActive(prev => prev.includes(slug) ? (prev.length > 1 ? prev.filter(s => s !== slug) : prev) : [...prev, slug]);
  const shareVerse = async (v: number) => {
    const text = data[active[0]]?.find(x => x.verse === v)?.text ?? '';
    const msg = `${formatRef(currentRef(v), 'display')} — ${text}`;
    try { if (navigator.share) { await navigator.share({ text: msg }); return; } } catch { return; }
    copyVerse(v);
  };
  const onUserScroll = () => pauseFollow();
  const onPageScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const y = e.currentTarget.scrollTop;
    if (Math.abs(y - lastScroll.current) < 12) return;
    setChromeHidden(y > lastScroll.current && y > 80);
    lastScroll.current = y;
  };
  // Horizontal swipe pages chapters; vertical drags are left to scrolling.
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t || !isMobile || active.length > 1) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) { if (dx < 0) nextCh(); else prevCh(); }
  };

  const goTo = (ref: ScriptureRef) => {
    const target = visibleBooks.find(b => b.num === ref.book);
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
    else { const i = visibleBooks.findIndex(b=>b.num===book.num); if (i > 0) { setBook(visibleBooks[i - 1]); setChapter(visibleBooks[i - 1].chapters); } }
    setActiveVerse(null);
  };
  const nextCh = () => {
    if (chapter < book.chapters) setChapter(chapter + 1);
    else { const i = visibleBooks.findIndex(b=>b.num===book.num); if (i < visibleBooks.length - 1) { setBook(visibleBooks[i + 1]); setChapter(1); } }
    setActiveVerse(null);
  };

  // Paging with the keyboard, unless the caret is in a note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT' || el?.tagName === 'SELECT') return;
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

  const refsForActive = canon==='protestant' && activeVerse != null ? crossRefsFor(currentRef(activeVerse)) : [];
  const noteEntries = Object.entries(notes).filter(([k]) => k.startsWith(`${notePrefix}${book.num}:`));

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
      className="relative flex h-[calc(100dvh-49px)] overflow-hidden">

      {/* ── Canon rail ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[172px] shrink-0 flex-col border-r border-white/8 bg-black/25">
        <div className="px-3 py-2.5 border-b border-white/8 text-[8.5px] font-black uppercase tracking-[0.16em] text-white/30">Canon</div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
          {(['OT', 'NT'] as const).map(t => (
            <div key={t} className="mb-2">
              <p className="px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-[#d4af37]/50">
                {t === 'OT' ? 'Old Testament' : 'New Testament'}
              </p>
              {visibleBooks.filter(b => b.testament === t).map(b => (
                <button key={b.num}
                  onClick={() => { setBook(b); setChapter(1); setActiveVerse(null); }}
                  className={`w-full text-left px-2 py-[5px] rounded-md text-[11px] font-bold transition-colors ${
                    b.num === book.num ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-white/55 hover:bg-white/[0.07] hover:text-white'
                  }`}>
                  <span style={{color:canonMark(b).color}}>{b.name}</span>
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
        <div className="hidden md:flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-white/8 bg-black/25 flex-wrap">
          <CanonBookPicker canon={canon} book={book} onBook={b=>{setBook(b);setChapter(1);setActiveVerse(null);}} onGo={(b,ch,v)=>{setBook(b);setChapter(ch);setActiveVerse(v??null);}} onCanon={c=>{const list=canonBooks(c);setCanon(c);setBook(list.find(b=>b.num===book.num)??list[0]);setChapter(1);setActiveVerse(null);setActive([c==='catholic'?'douayrheims':c==='orthodox'?(book.testament==='NT'?'textusreceptus':'lxx'):'kjv']);}} />
          <select aria-label="Chapter" value={chapter} onChange={e=>{setChapter(Number(e.target.value));setActiveVerse(null);}} className="bg-[#17141f] text-xs rounded px-1 py-1">{Array.from({length:book.chapters},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select>
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

          {canon!=='protestant' && <span className="text-[10px] text-white/60">{canon==='catholic'?'Douay–Rheims chapter and verse numbering; Psalms differ from KJV.':'Greek collection; book groupings and numbering vary. Appendices are labeled.'}</span>}
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
            <button
              onClick={() => setCouncilModalOpen(true)}
              className="px-2.5 py-1 rounded-md border border-[#E8C170]/45 bg-[#E8C170]/12 text-[8.5px] font-black uppercase tracking-widest text-[#E8C170] hover:bg-[#E8C170]/22 flex items-center gap-1 transition-all"
              title="Open the 12 Art Council Sacred Text Plates, Public-Domain Hymns & Catholic/Orthodox Liturgical Prayers (Viewable in Lorea)"
            >
              <Sparkles size={10} />
              <span>12 Sacred Plates & Hymnal</span>
            </button>
            <div className="w-px h-4 bg-white/10 mx-0.5" />
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

        {followSessionId && (
          behind ? (
            <button onClick={jumpToLive}
              className="shrink-0 h-11 flex items-center justify-center gap-2 bg-[#d4af37] text-black text-[11px] font-black uppercase tracking-widest">
              Jump to live · {liveCue?.label}
            </button>
          ) : (
            <div className="shrink-0 h-8 flex items-center gap-2 px-3 border-b border-[#d4af37]/20 bg-[#d4af37]/[0.07]">
              <span className={`h-2 w-2 rounded-full ${session?.isActive === false ? 'bg-white/30' : 'bg-[#d4af37] animate-pulse'}`} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                {!session ? 'Waiting for the service' : session.isActive === false ? 'Service ended' : liveRef ? 'Following live' : 'Following · waiting for a passage'}
              </span>
              <span className="text-[10px] text-white/40 truncate">{session?.title}</span>
              {session && session.translation && !active.includes(session.translation.toLowerCase()) && (
                <span className="ml-auto text-[9px] text-white/30 whitespace-nowrap">Room: {session.translation}</span>
              )}
            </div>
          )
        )}

        {isMobile && (
          <div className={`shrink-0 flex items-center gap-1 px-2 border-b border-white/8 bg-black/30 overflow-hidden transition-all duration-200 ${chromeHidden ? 'h-0 border-b-0 opacity-0' : 'h-12'}`}>
            <button onClick={() => setSheet('nav')} className="h-11 px-3 flex items-center gap-1.5 text-[15px] font-black tracking-tight active:bg-white/10 rounded-xl">
              {book.name} <span className="text-[#d4af37]">{chapter}</span><ChevronRight size={13} className="rotate-90 text-white/40" />
            </button>
            <span className="ml-auto" />
            <button onClick={() => { setRail('search'); setRailOpen(true); }} aria-label="Search" className="h-11 w-11 grid place-items-center text-white/70 active:bg-white/10 rounded-full"><Search size={19} /></button>
            <BookmarkToggle on={isMarked} onToggle={toggleBookmark} color={isMarked ? '#d4af37' : 'rgba(255,255,255,0.7)'} />
          </div>
        )}

        {/* the page itself — the one skinnable surface */}
        <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain" style={{ background: skin.bg, paddingBottom: isMobile && activeVerse != null && barOpen ? 150 : undefined }}
          onScroll={onPageScroll} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchMove={onUserScroll} onWheel={onUserScroll}>
          <div className="mx-auto px-5 sm:px-10 py-6 sm:py-9" style={{ maxWidth: active.length > 1 ? 1000 : 680 }}>
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
                      onClick={() => { setActiveVerse(isActive ? null : v); setBarOpen(!isActive); }}
                      className="cursor-pointer rounded-lg -mx-2 px-2 py-0.5 transition-colors"
                      style={isActive || (followSessionId && liveHas(v)) ? { background: skin.mark } : undefined}>
                      <div className={active.length > 1 ? 'grid sm:grid-cols-2 gap-x-7' : ''}>
                        {active.map(slug => {
                          const t = avail.find(x => x.slug === slug);
                          if (!t) return null;
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
                                background: hl && !isActive ? washFor(highlights[keyFor(v)]) : undefined,
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

                      {isActive && !isMobile && (
                        <div className="flex items-center gap-1.5 flex-wrap pb-2 pt-0.5" onClick={e => e.stopPropagation()}>
                          {[
                            { icon: Highlighter, label: hl ? 'Unhighlight' : 'Highlight', act: () => toggleHighlight(v) },
                            { icon: StickyNote, label: 'Note', act: () => { setRail('notes'); setRailOpen(true); } },
                            { icon: copied ? Check : Copy, label: copied ? 'Copied' : 'Copy', act: () => copyVerse(v) },
                            { icon: Link2, label: 'Cross-refs', act: () => { setRail('refs'); setRailOpen(true); } },
                            { icon: Sparkles, label: 'Ask Aria', act: () => askAria(`You are Aria, a learned and reverent Bible teacher. Explain ${formatRef(currentRef(v), 'display')}. Give the historical and cultural context, the meaning in the original language, how it was understood in the early Church, and how it connects to the rest of Scripture. Cite the passages you draw on.`) },
                            ...(onPinVerse ? [{ icon: Pin, label: pinnedFlash === v ? 'Pinned' : 'Pin to sermon', act: () => { onPinVerse({ ref: currentRef(v), text: data[active[0]]?.find(x => x.verse === v)?.text ?? '' }); setPinnedFlash(v); } }] : []),
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
        {isMobile && (
          <MobileBottomBar
            passage={`${book.name} ${chapter}`}
            versions={active.map(s => avail.find(t => t.slug === s)?.label).filter(Boolean).join(' · ')}
            onPrev={prevCh} onNext={nextCh}
            onNav={() => setSheet('nav')} onDisplay={() => setSheet('display')}
            onStudy={() => setRailOpen(v => !v)} studyOpen={railOpen} />
        )}
      </main>

      {/* ── Study rail ─────────────────────────────────────────────── */}
      {railOpen && isMobile && <div className="absolute inset-0 z-30 bg-black/60" onClick={() => setRailOpen(false)} />}
      {railOpen && (
        <aside aria-label="Verse study tools" className={isMobile
          ? 'absolute inset-x-0 bottom-0 top-[10%] z-40 flex flex-col rounded-t-3xl border-t border-[#d4af37]/25 bg-[#0d0a13] shadow-[0_-20px_60px_rgba(0,0,0,0.6)]'
          : 'absolute inset-y-0 right-0 z-20 flex w-[min(92vw,360px)] shrink-0 flex-col border-l border-white/10 bg-[#0d0a13] lg:static lg:w-[340px]'}
          style={isMobile ? { paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-1"><span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#e3c57e]">Study workbench{isMobile && activeVerse != null ? ` · ${formatRef(currentRef(activeVerse), 'compact')}` : ''}</span><button aria-label="Close study tools" onClick={() => setRailOpen(false)} className="h-11 w-11 -mr-2 grid place-items-center"><X size={isMobile ? 18 : 15} /></button></div>
          <div className={isMobile ? 'flex overflow-x-auto border-b border-white/8' : 'grid grid-cols-3 border-b border-white/8'}>
            {([['refs', 'Refs'], ['notes', 'Notes'], ['search', 'Search'], ['study', 'Concordance'], ['words', 'Word study'], ['originals', 'Originals'], ['history', 'History'], ['compare', 'Compare'], ['notebook', 'Notebook']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setRail(id)}
                className={`${isMobile ? 'shrink-0 h-12 px-4 text-[11px]' : 'flex-1 py-2 text-[8.5px]'} font-black uppercase tracking-[0.14em] border-b-2 transition-colors ${
                  rail === id ? 'text-[#d4af37] border-[#d4af37]' : 'text-white/35 border-transparent hover:text-white/70'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            {rail === 'history' && canon==='protestant' && <LectioHistory current={currentRef(activeVerse ?? undefined)} onNavigate={goTo} />}
            {rail === 'compare' && <LectioComparativeSearch />}
            {['words','history'].includes(rail) && canon!=='protestant' && <p className="p-3 text-xs text-white/60">Verse-linked study tools currently use KJV numbering. The concordance, comparison search and notebook support this edition.</p>}
            {rail === 'words' && canon==='protestant' && <LectioLexicon current={currentRef(activeVerse ?? 1)} slug={active[0] || DEFAULT_TRANSLATION} onNavigate={goTo} initialStrong={wordLookup} />}
            {rail === 'originals' && canon!=='protestant' && <p className="p-3 text-xs text-white/60">Original-language alignment currently follows the 66-book KJV references. Switch to the Protestant reader for those mappings.</p>}
            {rail === 'originals' && canon==='protestant' && <LectioOriginals current={currentRef(activeVerse ?? 1)} slug={active[0] || DEFAULT_TRANSLATION}
              translationText={!loading ? data[active[0]]?.find(v => v.verse === (activeVerse ?? 1))?.text : undefined}
              onNavigate={goTo} onStrong={id => { setWordLookup(id); setRail('words'); }} />}
            {rail === 'notebook' && <ResearchNotebook />}
            {rail === 'study' && <LectioConcordance slug={active[0] || DEFAULT_TRANSLATION} corpusVersion={data}
              selected={!loading && activeVerse != null && data[active[0]]?.find(v => v.verse === activeVerse) ? {
                ref: currentRef(activeVerse), text: data[active[0]].find(v => v.verse === activeVerse)!.text,
              } : undefined} onNavigate={goTo} />}
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
                      className="w-full text-left px-3 py-3.5 md:px-2.5 md:py-2 rounded-lg border border-white/10 hover:border-[#d4af37]/40 hover:bg-[#d4af37]/[0.07] transition-colors">
                      <span className="font-mono text-[13px] md:text-[9.5px] uppercase tracking-wider text-[#d4af37]">{formatRef(r, 'compact')}</span>
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
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-base md:text-[11.5px] text-white/85 placeholder-white/20 outline-none focus:border-[#d4af37]/50 resize-none min-h-[110px]"
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
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-2.5 py-3 md:py-2 text-base md:text-[11.5px] text-white/85 placeholder-white/20 outline-none focus:border-[#d4af37]/50" />
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
      {isMobile && (
        <>
          <AnimatePresence>
            {activeVerse != null && barOpen && !railOpen && !sheet && (
              <VerseActionBar key="vab"
                label={formatRef(currentRef(activeVerse), 'display')}
                highlight={highlights[keyFor(activeVerse)]}
                onColor={id => setHighlightColor(activeVerse, id)} onClear={() => setHighlightColor(activeVerse, null)}
                onNote={() => { setRail('notes'); setRailOpen(true); }}
                onCopy={() => copyVerse(activeVerse)} onShare={() => shareVerse(activeVerse)}
                onRefs={() => { setRail('refs'); setRailOpen(true); }}
                onAria={() => askAria(`You are Aria, a learned and reverent Bible teacher. Explain ${formatRef(currentRef(activeVerse), 'display')}. Give the historical and cultural context, the meaning in the original language, how it was understood in the early Church, and how it connects to the rest of Scripture. Cite the passages you draw on.`)}
                onPin={onPinVerse ? () => { onPinVerse({ ref: currentRef(activeVerse), text: data[active[0]]?.find(x => x.verse === activeVerse)?.text ?? '' }); setPinnedFlash(activeVerse); } : undefined} pinned={pinnedFlash === activeVerse}
                onClose={() => { setActiveVerse(null); setBarOpen(false); }} copied={copied} hasNote={!!notes[keyFor(activeVerse)]} />
            )}
          </AnimatePresence>
          <NavigatorSheet open={sheet === 'nav'} onClose={() => setSheet(null)}
            canon={canon} books={visibleBooks} book={book} chapter={chapter}
            onGo={(b, ch, v) => { setBook(b); setChapter(ch); setActiveVerse(v ?? null); }}
            bookmarks={bookmarks} onOpenBookmark={openBookmark} onRemoveBookmark={removeBookmark} />
          <DisplaySheet open={sheet === 'display'} onClose={() => setSheet(null)}
            skins={SKINS} skinId={skinId} onSkin={id => { setSkinId(id); localStorage.setItem(SKIN_KEY, id); }}
            size={size} onSize={setSize} avail={avail} active={active} onToggle={toggleTranslation}
            canon={canon} onCanon={switchCanon} onPlates={() => setCouncilModalOpen(true)} />
        </>
      )}
      <LectioCouncilPlatesModal
        open={councilModalOpen}
        onClose={() => setCouncilModalOpen(false)}
      />
    </motion.div>
  );
};

export default LectioReader;
