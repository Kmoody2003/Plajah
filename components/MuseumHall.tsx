import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Star, X, ExternalLink, Play, Landmark } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// MuseumHall — a reusable "hall of greats" engine.
//
// One component powers the Taleo Film Museum, the Chora Conservatory, the Art &
// Photography masters gallery, and the Academia figure encyclopedias. Give it a
// set of halls (categories) and figures; it renders a filterable card grid and a
// rich detail modal. Portraits + biographies are enriched live from the
// Wikipedia REST summary API (same proven pattern as WorldCupMuseum), cached for
// the session so repeat opens are instant. Seed data stays tiny — just a wikiSlug
// plus the curated facts a Wikipedia blurb won't give you (signature works,
// techniques, documentaries, article links).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ACCENT = '#FFD24A';

export interface MuseumFigure {
  id: string;
  name: string;
  wikiSlug: string;              // Wikipedia page slug — drives portrait + bio
  hall: string;                  // which hall this figure belongs to (hall.id)
  role?: string;                 // 'Director', 'Composer', 'Painter', …
  era?: string;                  // 'New Hollywood', 'Baroque', 'Impressionism'
  nationality?: string;
  years?: string;                // 'b. 1946' or '1685–1750'
  tagline?: string;              // one-line honor, shown in the accent colour
  works?: string[];              // signature works
  techniques?: string[];         // signature techniques / contributions
  imageUrl?: string;             // optional portrait override (else Wikipedia)
  links?: { label: string; url: string }[];        // curated articles / essays
  docs?: { label: string; url: string; videoId?: string }[]; // documentaries
}

export interface MuseumHallDef {
  id: string;
  label: string;
  blurb?: string;
}

export interface MuseumHallProps {
  eyebrow: string;               // small-caps kicker, e.g. 'The Film Museum'
  title: string;                 // large title, e.g. 'Masters of Cinema'
  intro?: string;                // subtitle paragraph
  halls: MuseumHallDef[];
  figures: MuseumFigure[];
  accent?: string;               // theme accent colour
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

// ── Wikipedia summary (portrait + extract), cached across the session ─────────
const wikiCache = new Map<string, Promise<{ thumb: string; extract: string }>>();
export function fetchWiki(slug: string): Promise<{ thumb: string; extract: string }> {
  if (!wikiCache.has(slug)) {
    wikiCache.set(slug, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => ({ thumb: d?.originalimage?.source || d?.thumbnail?.source || '', extract: d?.extract || '' }))
      .catch(() => ({ thumb: '', extract: '' })));
  }
  return wikiCache.get(slug)!;
}
function useWiki(slug: string, override?: string) {
  const [d, setD] = useState<{ thumb: string; extract: string }>({ thumb: override || '', extract: '' });
  useEffect(() => {
    let alive = true;
    fetchWiki(slug).then(x => alive && setD(prev => ({ thumb: override || x.thumb, extract: x.extract || prev.extract })));
    return () => { alive = false; };
  }, [slug, override]);
  return d;
}

// ── Figure card ───────────────────────────────────────────────────────────────
const FigureCard: React.FC<{ figure: MuseumFigure; accent: string; onOpen: () => void }> = ({ figure, accent, onOpen }) => {
  const { thumb } = useWiki(figure.wikiSlug, figure.imageUrl);
  return (
    <motion.button
      layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="group text-left rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] transition-all hover:bg-white/[0.06]"
      style={{ ['--accent' as string]: accent }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${accent}66`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <div className="aspect-[3/4] bg-gradient-to-b from-white/5 to-black/40 relative overflow-hidden">
        {thumb
          ? <img src={thumb} alt={figure.name} loading="lazy" className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center"><Star size={26} className="text-white/10" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute bottom-2 left-2.5 right-2.5">
          <p className="text-[11px] font-black uppercase tracking-tight text-white leading-none line-clamp-1">{figure.name}</p>
          <p className="text-[7px] font-bold uppercase tracking-widest mt-1" style={{ color: accent }}>
            {[figure.role, figure.era].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
    </motion.button>
  );
};

// ── Figure detail modal ─────────────────────────────────────────────────────
const FigureModal: React.FC<{ figure: MuseumFigure; accent: string; onClose: () => void; onPlayDoc: (videoId: string, title: string) => void }> = ({ figure, accent, onClose, onPlayDoc }) => {
  const { thumb, extract } = useWiki(figure.wikiSlug, figure.imageUrl);
  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[88vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center hover:bg-black/70"><X size={14} /></button>
        <div className="aspect-[16/10] bg-white/5 relative">
          {thumb && <img src={thumb} alt={figure.name} className="w-full h-full object-cover object-top" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d12] via-transparent to-transparent" />
        </div>
        <div className="p-5 -mt-10 relative">
          <h2 className="text-2xl font-black uppercase tracking-tight">{figure.name}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            {figure.role && <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase" style={{ background: `${accent}26`, border: `1px solid ${accent}4d`, color: accent }}>{figure.role}</span>}
            {figure.era && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{figure.era}</span>}
            {figure.nationality && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{figure.nationality}</span>}
            {figure.years && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{figure.years}</span>}
          </div>
          {figure.tagline && <p className="mt-3 text-sm font-bold leading-relaxed" style={{ color: `${accent}e6` }}>{figure.tagline}</p>}
          {extract && <p className="mt-3 text-sm text-white/55 leading-relaxed">{extract}</p>}

          {figure.works && figure.works.length > 0 && (
            <div className="mt-4">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-2">Signature Works</p>
              <div className="flex flex-wrap gap-1.5">
                {figure.works.map(w => <span key={w} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/8 text-[11px] text-white/70">{w}</span>)}
              </div>
            </div>
          )}

          {figure.techniques && figure.techniques.length > 0 && (
            <div className="mt-4">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-2">Craft &amp; Contribution</p>
              <ul className="space-y-1">
                {figure.techniques.map(t => (
                  <li key={t} className="text-[12px] text-white/60 leading-relaxed flex gap-2">
                    <span style={{ color: accent }}>—</span><span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {figure.docs && figure.docs.length > 0 && (
            <div className="mt-4">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35 mb-2">Documentaries</p>
              <div className="space-y-1.5">
                {figure.docs.map(d => (
                  d.videoId
                    ? <button key={d.label} onClick={() => onPlayDoc(d.videoId!, d.label)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/8 hover:bg-white/[0.08] transition-all text-left">
                        <span className="w-6 h-6 rounded-full bg-red-600/90 flex items-center justify-center shrink-0"><Play size={11} className="text-white ml-0.5" /></span>
                        <span className="text-[12px] text-white/70">{d.label}</span>
                      </button>
                    : <a key={d.label} href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/8 hover:bg-white/[0.08] transition-all">
                        <ExternalLink size={12} style={{ color: accent }} /><span className="text-[12px] text-white/70">{d.label}</span>
                      </a>
                ))}
              </div>
            </div>
          )}

          {figure.links && figure.links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {figure.links.map(l => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/8 text-[10px] font-bold text-white/50 hover:text-white transition-all">
                  {l.label} <ExternalLink size={10} />
                </a>
              ))}
            </div>
          )}

          <a href={`https://en.wikipedia.org/wiki/${figure.wikiSlug}`} target="_blank" rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">
            Full biography <ExternalLink size={11} />
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

// ── Lightweight inline YouTube doc player (portal) ────────────────────────────
const DocModal: React.FC<{ videoId: string; title: string; onClose: () => void }> = ({ videoId, title, onClose }) => {
  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/70">{title}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><X size={14} /></button>
        </div>
        <div className="aspect-video rounded-2xl overflow-hidden border border-white/12 bg-black">
          <iframe title={title} className="w-full h-full" src={`https://www.youtube.com/embed/${videoId}?autoplay=1`} allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
        </div>
      </div>
    </motion.div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

// ── The museum ────────────────────────────────────────────────────────────────
const MuseumHall: React.FC<MuseumHallProps> = ({ eyebrow, title, intro, halls, figures, accent = DEFAULT_ACCENT, icon: Icon = Landmark }) => {
  const [activeHall, setActiveHall] = useState<string>(halls[0]?.id ?? 'all');
  const [open, setOpen] = useState<MuseumFigure | null>(null);
  const [doc, setDoc] = useState<{ videoId: string; title: string } | null>(null);

  const hall = halls.find(h => h.id === activeHall);
  const shown = useMemo(() => figures.filter(f => f.hall === activeHall), [figures, activeHall]);

  return (
    <div className="space-y-5">
      {/* Museum header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><Icon size={140} className="text-white" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: accent }}>{eyebrow}</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">{title}</h1>
        {intro && <p className="text-sm text-white/45 mt-1.5 max-w-2xl">{intro}</p>}
      </div>

      {/* Hall tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {halls.map(h => {
          const active = activeHall === h.id;
          return (
            <button key={h.id} onClick={() => setActiveHall(h.id)}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
              style={active
                ? { background: accent, color: '#000', borderColor: 'transparent' }
                : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              {h.label}
            </button>
          );
        })}
      </div>

      {hall?.blurb && <p className="text-[12px] text-white/40 leading-relaxed -mt-1">{hall.blurb}</p>}

      {/* Figure grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {shown.map(f => <FigureCard key={f.id} figure={f} accent={accent} onOpen={() => setOpen(f)} />)}
      </div>
      {shown.length === 0 && (
        <div className="py-24 text-center rounded-3xl border border-white/8 bg-white/[0.02]">
          <Star size={32} className="mx-auto text-white/10 mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">This hall is being curated</p>
        </div>
      )}

      <AnimatePresence>
        {open && <FigureModal figure={open} accent={accent} onClose={() => setOpen(null)} onPlayDoc={(videoId, title) => setDoc({ videoId, title })} />}
        {doc && <DocModal videoId={doc.videoId} title={doc.title} onClose={() => setDoc(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default MuseumHall;
