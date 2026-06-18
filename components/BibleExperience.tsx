// BibleExperience — the Lorea "Sacred Library": the most comprehensive free
// Christian education experience. Phase 1: a gorgeous landing, a parallel
// multi-translation Scripture reader (KJV · Vulgate · Greek · Hebrew) with
// per-verse notes + Ask-Aria, ancient hymns with parallel lyrics + recordings,
// and curated sections (manuscripts, councils, archaeology, apostolic routes,
// crusades, kingdoms, artifacts, early church). Plajah design + a sacred texture.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, ChevronRight, BookOpen, ScrollText, Users, Landmark, Pickaxe,
  Map as MapIcon, Swords, Crown, Gem, Music2, Sparkles, StickyNote, MessageCircle,
  X, ExternalLink, Play, ChevronDown, Cross,
} from 'lucide-react';
import {
  BOOKS, BibleBook, BibleVerse, fetchParallel, translationsForBook, BibleTranslation,
} from '../services/bibleService';
import { SACRED_SECTIONS, HYMNS, LibrarySection } from '../data/sacredLibrary';

const ICONS: Record<string, React.FC<any>> = { ScrollText, Users, Landmark, Pickaxe, Map: MapIcon, Swords, Crown, Gem };
const NOTES_KEY = 'plajah_bible_notes_v1';
const loadNotes = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; } };
const saveNotes = (n: Record<string, string>) => { try { localStorage.setItem(NOTES_KEY, JSON.stringify(n)); } catch { /* */ } };

const askAria = (prompt: string) => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt } }));

// Sacred parchment/gold texture layered under the Plajah design.
const SACRED_BG: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(1200px 600px at 50% -10%, rgba(212,175,55,0.10), transparent 60%),' +
    'radial-gradient(800px 500px at 90% 10%, rgba(150,90,40,0.08), transparent 60%),' +
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.014) 0 2px, transparent 2px 6px)',
};

type View = { kind: 'home' } | { kind: 'read' } | { kind: 'hymns' } | { kind: 'section'; id: string };

const BibleExperience: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [view, setView] = useState<View>({ kind: 'home' });

  const back = () => {
    if (view.kind === 'home') onBack();
    else setView({ kind: 'home' });
  };

  return (
    <div className="fixed inset-0 z-[120] bg-[#08070c] text-white overflow-y-auto custom-scrollbar" style={SACRED_BG}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 sm:px-8 py-3 bg-[#08070c]/80 backdrop-blur-xl border-b border-[#d4af37]/15">
        <button onClick={back} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest">
          <ChevronLeft size={15} /> {view.kind === 'home' ? 'Exit' : 'Sacred Library'}
        </button>
        <div className="flex items-center gap-2">
          <Cross size={13} className="text-[#d4af37]" />
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#d4af37]">Sacred Library</span>
        </div>
        <div className="w-16" />
      </div>

      <AnimatePresence mode="wait">
        {view.kind === 'home' && <Home key="home" onOpen={setView} />}
        {view.kind === 'read' && <Reader key="read" />}
        {view.kind === 'hymns' && <Hymns key="hymns" />}
        {view.kind === 'section' && <Section key={view.id} section={SACRED_SECTIONS.find(s => s.id === view.id)!} />}
      </AnimatePresence>
    </div>
  );
};

// ── Landing ──────────────────────────────────────────────────────────────────
const Home: React.FC<{ onOpen: (v: View) => void }> = ({ onOpen }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-6xl mx-auto px-5 sm:px-8 pb-20">
    {/* Hero */}
    <div className="relative text-center py-16 sm:py-24">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }}
        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 border border-[#d4af37]/40"
        style={{ background: 'linear-gradient(160deg, rgba(212,175,55,0.25), rgba(212,175,55,0.05))' }}>
        <Cross size={28} className="text-[#d4af37]" />
      </motion.div>
      <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[0.95]">
        The <span className="text-[#d4af37]">Sacred</span> Library
      </h1>
      <p className="mt-5 text-white/45 max-w-2xl mx-auto text-sm leading-relaxed">
        Scripture in its original tongues, the writings of the Fathers, the councils that forged the creeds,
        the archaeology, the maps of the Apostles, and the oldest hymns of the Church — gathered into one
        nexus. A free education for every Christian.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
        <button onClick={() => onOpen({ kind: 'read' })}
          className="flex items-center gap-2 px-7 py-3.5 rounded-full font-black text-xs uppercase tracking-widest text-black"
          style={{ background: 'linear-gradient(135deg, #f3d27a, #d4af37)' }}>
          <BookOpen size={15} /> Read Scripture
        </button>
        <button onClick={() => askAria('You are Aria, a warm and learned guide to Scripture and Church history. Help me explore the Bible. Ask me what I would like to study — a book, a person, a doctrine, or a period of history — and teach me with depth and reverence.')}
          className="flex items-center gap-2 px-6 py-3.5 rounded-full font-black text-xs uppercase tracking-widest bg-white/[0.06] border border-white/10 hover:bg-white/[0.12] transition-all">
          <Sparkles size={14} className="text-[#d4af37]" /> Ask Aria
        </button>
      </div>
    </div>

    {/* Quick facts band */}
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-12">
      {[
        ['66', 'Books'], ['5', 'Languages'], ['21', 'Councils'],
        ['4th c.', 'Oldest Hymn'], ['125 BC', 'Oldest Scroll'], ['∞', 'To Explore'],
      ].map(([v, l]) => (
        <div key={l} className="text-center py-4 rounded-2xl bg-white/[0.03] border border-white/8">
          <p className="text-xl font-black text-[#d4af37] tabular-nums">{v}</p>
          <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-1">{l}</p>
        </div>
      ))}
    </div>

    {/* Sections grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <FeatureCard icon={<BookOpen size={22} />} title="Read Scripture" subtitle="Parallel · KJV · Vulgate · Greek · Hebrew"
        blurb="The Word in five witnesses, verse by verse — with your own notes and Aria at your side."
        onClick={() => onOpen({ kind: 'read' })} primary />
      <FeatureCard icon={<Music2 size={22} />} title="Ancient Hymns" subtitle="The oldest songs of the Church"
        blurb="Phos Hilaron, the Oxyrhynchus hymn, the Te Deum — recordings with original + English lyrics, side by side."
        onClick={() => onOpen({ kind: 'hymns' })} />
      {SACRED_SECTIONS.map(s => {
        const Icon = ICONS[s.icon] || ScrollText;
        return (
          <FeatureCard key={s.id} icon={<Icon size={22} />} title={s.title} subtitle={s.subtitle}
            blurb={s.intro} onClick={() => onOpen({ kind: 'section', id: s.id })} />
        );
      })}
    </div>
  </motion.div>
);

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; blurb: string; onClick: () => void; primary?: boolean }>
  = ({ icon, title, subtitle, blurb, onClick, primary }) => (
  <button onClick={onClick}
    className={`group text-left p-5 rounded-[1.5rem] border transition-all hover:-translate-y-1 ${primary ? 'border-[#d4af37]/40' : 'border-white/8 hover:border-[#d4af37]/30'}`}
    style={{ background: primary ? 'linear-gradient(160deg, rgba(212,175,55,0.14), rgba(255,255,255,0.02))' : 'rgba(255,255,255,0.03)' }}>
    <div className="flex items-center justify-center w-11 h-11 rounded-xl mb-3 text-[#d4af37]"
      style={{ background: 'rgba(212,175,55,0.12)' }}>{icon}</div>
    <h3 className="text-sm font-black uppercase tracking-tight">{title}</h3>
    <p className="text-[8px] font-black uppercase tracking-widest text-[#d4af37]/70 mt-0.5">{subtitle}</p>
    <p className="text-[11px] text-white/40 leading-relaxed mt-2 line-clamp-3">{blurb}</p>
    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 group-hover:text-[#d4af37] mt-3 transition-colors">
      Open <ChevronRight size={11} />
    </span>
  </button>
);

// ── Scripture reader ─────────────────────────────────────────────────────────
const Reader: React.FC = () => {
  const [book, setBook] = useState<BibleBook>(BOOKS.find(b => b.name === 'John')!);
  const [chapter, setChapter] = useState(1);
  const avail = useMemo(() => translationsForBook(book.testament), [book]);
  const [active, setActive] = useState<string[]>(['kjv', 'vulgate']);
  const [data, setData] = useState<Record<string, BibleVerse[]>>({});
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>(loadNotes);
  const [openVerse, setOpenVerse] = useState<number | null>(null);
  const [pickBook, setPickBook] = useState(false);

  // Keep active translations valid for the current testament.
  useEffect(() => {
    setActive(prev => {
      const ok = prev.filter(s => avail.some(t => t.slug === s));
      return ok.length ? ok : ['kjv', avail.find(t => t.slug === 'vulgate') ? 'vulgate' : avail[1]?.slug].filter(Boolean) as string[];
    });
  }, [avail]);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    fetchParallel(book.num, chapter, active.length ? active : ['kjv']).then(d => { if (!dead) { setData(d); setLoading(false); } });
    return () => { dead = true; };
  }, [book, chapter, active]);

  const verseNums = useMemo(() => {
    const set = new Set<number>();
    Object.values(data).forEach(vs => vs.forEach(v => set.add(v.verse)));
    return [...set].sort((a, b) => a - b);
  }, [data]);

  const refKey = (v: number) => `${book.num}:${chapter}:${v}`;
  const setNote = (v: number, text: string) => {
    setNotes(prev => { const n = { ...prev }; if (text.trim()) n[refKey(v)] = text; else delete n[refKey(v)]; saveNotes(n); return n; });
  };
  const toggleT = (slug: string) => setActive(prev => prev.includes(slug) ? (prev.length > 1 ? prev.filter(s => s !== slug) : prev) : [...prev, slug]);

  const prevCh = () => { if (chapter > 1) setChapter(chapter - 1); else { const i = BOOKS.indexOf(book); if (i > 0) { setBook(BOOKS[i - 1]); setChapter(BOOKS[i - 1].chapters); } } };
  const nextCh = () => { if (chapter < book.chapters) setChapter(chapter + 1); else { const i = BOOKS.indexOf(book); if (i < BOOKS.length - 1) { setBook(BOOKS[i + 1]); setChapter(1); } } };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-5xl mx-auto px-4 sm:px-8 pb-24">
      {/* Reference + translation controls */}
      <div className="sticky top-[49px] z-10 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 bg-[#08070c]/85 backdrop-blur-xl border-b border-white/8 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setPickBook(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-black hover:bg-white/[0.1] transition-all">
            {book.name} <ChevronDown size={12} />
          </button>
          <select value={chapter} onChange={e => setChapter(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-black outline-none">
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map(c => <option key={c} value={c} className="bg-[#08070c]">Ch {c}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={prevCh} className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-white/[0.12]"><ChevronLeft size={14} /></button>
            <button onClick={nextCh} className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-white/[0.12]"><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {avail.map(t => (
            <button key={t.slug} onClick={() => toggleT(t.slug)}
              className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${active.includes(t.slug) ? 'text-black' : 'border-white/10 text-white/40 hover:text-white'}`}
              style={active.includes(t.slug) ? { background: '#d4af37', borderColor: '#d4af37' } : {}}>
              {t.label}
            </button>
          ))}
        </div>
        {pickBook && (
          <div className="absolute left-4 sm:left-8 top-full mt-1 w-[min(560px,90vw)] max-h-[60vh] overflow-y-auto bg-[#0d0b14] border border-white/12 rounded-2xl p-2 shadow-2xl grid grid-cols-2 sm:grid-cols-3 gap-1 custom-scrollbar">
            {(['OT', 'NT'] as const).map(test => (
              <React.Fragment key={test}>
                <p className="col-span-full px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#d4af37]/60">{test === 'OT' ? 'Old Testament' : 'New Testament'}</p>
                {BOOKS.filter(b => b.testament === test).map(b => (
                  <button key={b.num} onClick={() => { setBook(b); setChapter(1); setPickBook(false); }}
                    className={`text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${b.num === book.num ? 'bg-[#d4af37]/25 text-[#d4af37]' : 'text-white/60 hover:bg-white/10'}`}>
                    {b.name}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Verses */}
      <div className="mt-6">
        <h2 className="text-2xl font-black tracking-tight mb-1">{book.name} <span className="text-[#d4af37]">{chapter}</span></h2>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-5">{active.map(s => avail.find(t => t.slug === s)?.label).filter(Boolean).join('  ·  ')}</p>

        {loading ? (
          <div className="py-20 text-center text-[10px] font-black uppercase tracking-widest text-white/25">Gathering the witnesses…</div>
        ) : verseNums.length === 0 ? (
          <div className="py-20 text-center text-[10px] text-white/30">This text isn’t available in the selected translations for this chapter.</div>
        ) : (
          <div className="space-y-1.5">
            {verseNums.map(v => {
              const note = notes[refKey(v)];
              const isOpen = openVerse === v;
              return (
                <div key={v} className={`rounded-xl transition-colors ${isOpen ? 'bg-[#d4af37]/[0.06] ring-1 ring-[#d4af37]/25' : 'hover:bg-white/[0.03]'}`}>
                  <div onClick={() => setOpenVerse(isOpen ? null : v)} className="flex gap-3 p-3 cursor-pointer">
                    <span className="text-[10px] font-black text-[#d4af37] w-6 shrink-0 pt-0.5 tabular-nums">{v}</span>
                    <div className={`flex-1 grid gap-3 ${active.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                      {active.map(slug => {
                        const t = avail.find(x => x.slug === slug)!;
                        const text = data[slug]?.find(x => x.verse === v)?.text || '';
                        return (
                          <div key={slug}>
                            {active.length > 1 && <p className="text-[7px] font-black uppercase tracking-widest text-white/25 mb-0.5">{t.label}</p>}
                            <p dir={t.rtl ? 'rtl' : 'ltr'} lang={t.lang}
                              className={`text-[14px] leading-relaxed ${t.rtl ? 'text-right' : ''} ${t.lang === 'en' ? 'text-white/85 font-serif' : 'text-white/70'}`}
                              style={t.lang === 'he' ? { fontSize: 18 } : t.lang === 'el' ? { fontFamily: 'Georgia, serif' } : {}}>
                              {text || <span className="text-white/20">—</span>}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {note && <StickyNote size={11} className="text-[#d4af37] shrink-0 mt-1" />}
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 pl-12 space-y-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => askAria(`You are Aria, a learned and reverent Bible teacher. Explain ${book.name} ${chapter}:${v}. Give the historical and cultural context, the meaning in the original language, how the Church Fathers understood it, and how it connects to the rest of Scripture.`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/30 text-[9px] font-black uppercase tracking-widest text-[#d4af37] hover:bg-[#d4af37]/25 transition-all">
                          <Sparkles size={11} /> Ask Aria about this verse
                        </button>
                      </div>
                      <textarea
                        value={note || ''}
                        onChange={e => setNote(v, e.target.value)}
                        placeholder={`Your notes on ${book.name} ${chapter}:${v}…`}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white/85 placeholder-white/20 outline-none focus:border-[#d4af37]/40 resize-none min-h-[60px]"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Hymns ────────────────────────────────────────────────────────────────────
const Hymns: React.FC = () => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto px-5 sm:px-8 pb-24 pt-8">
    <h2 className="text-3xl font-black tracking-tight">Ancient <span className="text-[#d4af37]">Hymns</span></h2>
    <p className="text-white/40 text-sm mt-2 mb-8 max-w-2xl">The oldest songs of the Church — sung across centuries and cultures. Original language and English, side by side.</p>
    <div className="space-y-5">
      {HYMNS.map(h => (
        <div key={h.title} className="rounded-[1.5rem] border border-white/8 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="p-5 border-b border-white/8" style={{ background: 'linear-gradient(160deg, rgba(212,175,55,0.10), transparent)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">{h.title}</h3>
                <p className="text-[9px] font-black uppercase tracking-widest text-[#d4af37]/70 mt-1">{h.century} · {h.lang}</p>
                <p className="text-[11px] text-white/45 mt-2 leading-relaxed">{h.blurb}</p>
                <p className="text-[9px] text-white/30 mt-1.5 italic">{h.origin}</p>
              </div>
              {h.audioUrl && (
                <a href={h.audioUrl} target="_blank" rel="noreferrer"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#d4af37]/15 border border-[#d4af37]/30 text-[9px] font-black uppercase tracking-widest text-[#d4af37] hover:bg-[#d4af37]/25 transition-all">
                  <Play size={11} fill="currentColor" /> Listen
                </a>
              )}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
            <div className="p-5">
              <p className="text-[8px] font-black uppercase tracking-widest text-[#d4af37]/60 mb-2">Original · {h.lang}</p>
              {h.original.map((l, i) => <p key={i} className="text-[14px] leading-relaxed text-white/75" style={{ fontFamily: 'Georgia, serif' }}>{l}</p>)}
            </div>
            <div className="p-5">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">English</p>
              {h.english.map((l, i) => <p key={i} className="text-[14px] leading-relaxed text-white/75 font-serif">{l}</p>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  </motion.div>
);

// ── Curated section ──────────────────────────────────────────────────────────
const Section: React.FC<{ section: LibrarySection }> = ({ section }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto px-5 sm:px-8 pb-24 pt-8">
    <h2 className="text-3xl font-black tracking-tight">{section.title}</h2>
    <p className="text-[#d4af37]/70 text-[10px] font-black uppercase tracking-widest mt-1">{section.subtitle}</p>
    <p className="text-white/40 text-sm mt-3 mb-8 max-w-2xl leading-relaxed">{section.intro}</p>
    <div className="grid sm:grid-cols-2 gap-4">
      {section.entries.map(e => (
        <a key={e.title} href={e.url} target="_blank" rel="noreferrer"
          className="group block p-5 rounded-2xl border border-white/8 hover:border-[#d4af37]/30 transition-all hover:-translate-y-0.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            {e.tag && <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#d4af37]/12 text-[#d4af37]/80">{e.tag}</span>}
            <ExternalLink size={13} className="text-white/25 group-hover:text-[#d4af37] transition-colors ml-auto" />
          </div>
          <h3 className="text-sm font-black leading-tight">{e.title}</h3>
          {(e.by || e.era) && <p className="text-[9px] font-bold text-white/35 mt-0.5">{[e.era, e.by].filter(Boolean).join(' · ')}</p>}
          <p className="text-[11px] text-white/45 leading-relaxed mt-2">{e.blurb}</p>
        </a>
      ))}
    </div>
    <div className="mt-8 p-4 rounded-2xl border border-[#d4af37]/20 flex items-center gap-3" style={{ background: 'rgba(212,175,55,0.06)' }}>
      <Sparkles size={16} className="text-[#d4af37] shrink-0" />
      <p className="text-[11px] text-white/55 flex-1">Want a guided deep-dive on this subject?</p>
      <button onClick={() => askAria(`You are Aria, a learned and reverent guide to Church history. Teach me about "${section.title}" — ${section.intro} Give me a rich, structured overview and suggest where to go deeper.`)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#d4af37] text-black text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all">
        <MessageCircle size={11} /> Ask Aria
      </button>
    </div>
  </motion.div>
);

export default BibleExperience;
