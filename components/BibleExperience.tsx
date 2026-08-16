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
  X, ExternalLink, Play, ChevronDown, Cross, FileText, Maximize2,
  Radio, MonitorPlay, NotebookPen, CalendarDays,
} from 'lucide-react';
import {
  BOOKS, BibleBook, BibleVerse, fetchParallel, translationsForBook, BibleTranslation,
} from '../services/bibleService';
import { parseRefId } from '../services/scriptureRef';
import {
  migrateLegacyReceipts, serviceNotesByDay, syncServiceNotes, pushAllSessions,
  formatTC as svcTC, type ServiceNoteDay,
} from '../services/serviceNotes';
import LectioReader from './scripture/LectioReader';
import { SACRED_SECTIONS, HYMNS, LibrarySection, PRIMARY_TEXTS } from '../data/sacredLibrary';
import { auth, loadBibleNotes, saveBibleNote } from '../services/backendService';

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

type View = { kind: 'home' } | { kind: 'read' } | { kind: 'hymns' } | { kind: 'texts' }
  | { kind: 'servicenotes' } | { kind: 'section'; id: string };

const BibleExperience: React.FC<{ onBack: () => void; initialRefId?: string | null }> = ({ onBack, initialRefId }) => {
  // A scripture chip elsewhere on the platform opens straight into the reader
  // at its passage, skipping the landing.
  const openAt = initialRefId ? parseRefId(initialRefId) : null;
  const [view, setView] = useState<View>(openAt ? { kind: 'read' } : { kind: 'home' });
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null); // in-app manuscript embed

  // A later chip tap while the reader is already mounted re-points it.
  useEffect(() => {
    if (initialRefId && parseRefId(initialRefId)) setView({ kind: 'read' });
  }, [initialRefId]);

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
        {view.kind === 'read' && <LectioReader key="read" openAt={openAt} />}
        {view.kind === 'servicenotes' && <ServiceNotesView key="svcnotes" />}
        {view.kind === 'hymns' && <Hymns key="hymns" />}
        {view.kind === 'texts' && <Texts key="texts" />}
        {view.kind === 'section' && <Section key={view.id} section={SACRED_SECTIONS.find(s => s.id === view.id)!} onEmbed={(url, title) => setViewer({ url, title })} />}
      </AnimatePresence>

      {/* In-app manuscript / scan viewer (embeds the source viewer; opens full if it refuses to frame) */}
      <AnimatePresence>
        {viewer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#d4af37]/20 bg-[#08070c]">
              <span className="text-[11px] font-black uppercase tracking-widest text-[#d4af37] truncate flex items-center gap-2"><ScrollText size={13} /> {viewer.title}</span>
              <div className="flex items-center gap-2">
                <a href={viewer.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white"><Maximize2 size={11} /> Full viewer</a>
                <button onClick={() => setViewer(null)} className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/70 hover:text-white"><X size={15} /></button>
              </div>
            </div>
            <iframe src={viewer.url} title={viewer.title} className="flex-1 w-full bg-white" referrerPolicy="no-referrer" />
          </motion.div>
        )}
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

    {/* Live service band — the way into the presenter, the follow-along and the
        briefing. Sits above the library because on a Sunday it's the only thing
        anyone is looking for. */}
    <div className="mb-10">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d4af37]/70 mb-3">In service</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: <Radio size={18} />, title: 'Follow along',
            sub: 'Your phone turns to each passage as it’s read',
            act: () => window.dispatchEvent(new CustomEvent('OPEN_FOLLOW_ALONG', { detail: {} })),
          },
          {
            icon: <MonitorPlay size={18} />, title: 'Ambo — present',
            sub: 'Put Scripture on the screens and key the switcher',
            act: () => window.dispatchEvent(new CustomEvent('OPEN_AMBO', { detail: {} })),
          },
          {
            icon: <NotebookPen size={18} />, title: 'Service notes',
            sub: 'Every passage you’ve been taught, by the day you heard it',
            act: () => onOpen({ kind: 'servicenotes' }),
          },
        ].map(c => (
          <button key={c.title} onClick={c.act}
            className="text-left p-4 rounded-2xl border border-[#d4af37]/20 bg-[#d4af37]/[0.04] hover:bg-[#d4af37]/[0.09] hover:border-[#d4af37]/45 transition-all group">
            <div className="flex items-center gap-2 text-[#d4af37] mb-1.5">
              {c.icon}
              <span className="text-[12px] font-black uppercase tracking-wide">{c.title}</span>
            </div>
            <p className="text-[10.5px] text-white/40 leading-relaxed">{c.sub}</p>
          </button>
        ))}
      </div>
    </div>

    {/* Sections grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <FeatureCard icon={<BookOpen size={22} />} title="Read Scripture" subtitle="Parallel · KJV · Vulgate · Greek · Hebrew"
        blurb="The Word in five witnesses, verse by verse — with your own notes and Aria at your side."
        onClick={() => onOpen({ kind: 'read' })} primary />
      <FeatureCard icon={<Music2 size={22} />} title="Ancient Hymns" subtitle="The oldest songs of the Church"
        blurb="Phos Hilaron, the Oxyrhynchus hymn, the Te Deum — recordings with original + English lyrics, side by side."
        onClick={() => onOpen({ kind: 'hymns' })} />
      <FeatureCard icon={<FileText size={22} />} title="Primary Texts" subtitle="Read the documents themselves"
        blurb="The creeds, the Didache, the Chalcedonian Definition — the actual texts that defined the faith, read in-app."
        onClick={() => onOpen({ kind: 'texts' })} />
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

// The reader now lives in components/scripture/LectioReader.tsx — three panes,
// a skinnable reading surface, the study rail and offline preload.

// ── Service notes ────────────────────────────────────────────────────────────
// Every passage this member has been taught, grouped by the day they heard it.
// Kept apart from the notes they wrote — see services/serviceNotes.ts.
const ServiceNotesView: React.FC = () => {
  const [days, setDays] = useState<ServiceNoteDay[]>([]);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let dead = false;
    migrateLegacyReceipts();
    setDays(serviceNotesByDay());
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    void (async () => {
      await syncServiceNotes(uid);
      await pushAllSessions(uid);
      if (!dead) { setDays(serviceNotesByDay()); setSynced(true); }
    })();
    return () => { dead = true; };
  }, []);

  const total = days.reduce((n, d) => n + d.notes.length, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-3xl mx-auto px-5 sm:px-8 pb-24 pt-8">
      <h2 className="text-3xl font-black tracking-tight">Service notes</h2>
      <p className="mt-2 text-white/40 text-sm leading-relaxed max-w-lg">
        Recorded automatically as each passage came up in a service you followed. Your own
        notes live in the reader and are never mixed in here.
      </p>
      <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-white/25">
        {total} {total === 1 ? 'passage' : 'passages'} · {days.length} {days.length === 1 ? 'service' : 'services'}
        {auth.currentUser
          ? synced ? ' · synced to your account' : ' · syncing…'
          : ' · sign in to keep these across devices'}
      </p>

      {days.length === 0 ? (
        <div className="mt-10 py-14 text-center rounded-2xl border border-white/8">
          <Radio size={22} className="mx-auto text-white/15 mb-3" />
          <p className="text-[11px] text-white/35 max-w-xs mx-auto leading-relaxed">
            Nothing yet. Follow a service and the passages will collect here on their own.
          </p>
          <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_FOLLOW_ALONG', { detail: {} }))}
            className="mt-5 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest text-black"
            style={{ background: '#d4af37' }}>
            Follow a service
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          {days.map(g => (
            <section key={`${g.day}-${g.sessionId}`}>
              <div className="flex items-baseline gap-2.5 mb-2.5">
                <CalendarDays size={13} className="text-[#d4af37]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#d4af37]">{g.label}</span>
                <span className="text-[11px] text-white/35 truncate">{g.serviceTitle}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {g.notes.map(n => {
                  const r = parseRefId(n.refId);
                  return (
                    <button key={`${n.sessionId}-${n.refId}`}
                      onClick={() => r && window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: { refId: n.refId } }))}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 hover:border-[#d4af37]/45 hover:bg-[#d4af37]/[0.05] transition-all text-left">
                      <span className="flex-1 font-mono text-[10.5px] uppercase tracking-wider text-white/70">{n.label}</span>
                      <span className="font-mono text-[9.5px] text-white/25 tabular-nums">{svcTC(n.programTC)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
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

// ── Primary texts reader ─────────────────────────────────────────────────────
const Texts: React.FC = () => {
  const [open, setOpen] = useState(0);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-3xl mx-auto px-5 sm:px-8 pb-24 pt-8">
      <h2 className="text-3xl font-black tracking-tight">Primary <span className="text-[#d4af37]">Texts</span></h2>
      <p className="text-white/40 text-sm mt-2 mb-8 max-w-2xl">The documents that defined the faith — read the actual words, then ask Aria to unpack them.</p>
      <div className="space-y-3">
        {PRIMARY_TEXTS.map((t, i) => {
          const isOpen = open === i;
          return (
            <div key={t.title} className="rounded-2xl border border-white/8 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <button onClick={() => setOpen(isOpen ? -1 : i)} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left">
                <div>
                  <h3 className="text-sm font-black">{t.title}</h3>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#d4af37]/70 mt-0.5">{t.era} · {t.type}</p>
                </div>
                <ChevronDown size={16} className={`text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 space-y-3">
                  {t.body.map((p, j) => <p key={j} className="text-[14px] leading-relaxed text-white/75 font-serif">{p}</p>)}
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/25 pt-1">Source · {t.source}</p>
                  <button onClick={() => askAria(`You are Aria, a learned and reverent teacher of Church history. Walk me through "${t.title}" (${t.era}). Explain its historical context, what each part means, the controversy it answered, and why it still matters.`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#d4af37] text-black text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all">
                    <Sparkles size={11} /> Ask Aria to explain
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

// ── Curated section ──────────────────────────────────────────────────────────
const Section: React.FC<{ section: LibrarySection; onEmbed: (url: string, title: string) => void }> = ({ section, onEmbed }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto px-5 sm:px-8 pb-24 pt-8">
    <h2 className="text-3xl font-black tracking-tight">{section.title}</h2>
    <p className="text-[#d4af37]/70 text-[10px] font-black uppercase tracking-widest mt-1">{section.subtitle}</p>
    <p className="text-white/40 text-sm mt-3 mb-8 max-w-2xl leading-relaxed">{section.intro}</p>
    <div className="grid sm:grid-cols-2 gap-4">
      {section.entries.map(e => {
        const embed = section.id === 'manuscripts';   // manuscripts open in-app
        const inner = (
          <>
            <div className="flex items-center justify-between gap-2 mb-2">
              {e.tag && <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#d4af37]/12 text-[#d4af37]/80">{e.tag}</span>}
              {embed ? <Maximize2 size={13} className="text-white/25 group-hover:text-[#d4af37] transition-colors ml-auto" />
                     : <ExternalLink size={13} className="text-white/25 group-hover:text-[#d4af37] transition-colors ml-auto" />}
            </div>
            <h3 className="text-sm font-black leading-tight">{e.title}</h3>
            {(e.by || e.era) && <p className="text-[9px] font-bold text-white/35 mt-0.5">{[e.era, e.by].filter(Boolean).join(' · ')}</p>}
            <p className="text-[11px] text-white/45 leading-relaxed mt-2">{e.blurb}</p>
          </>
        );
        const cls = 'group block text-left p-5 rounded-2xl border border-white/8 hover:border-[#d4af37]/30 transition-all hover:-translate-y-0.5';
        return embed
          ? <button key={e.title} onClick={() => onEmbed(e.url, e.title)} className={cls} style={{ background: 'rgba(255,255,255,0.03)' }}>{inner}</button>
          : <a key={e.title} href={e.url} target="_blank" rel="noreferrer" className={cls} style={{ background: 'rgba(255,255,255,0.03)' }}>{inner}</a>;
      })}
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
