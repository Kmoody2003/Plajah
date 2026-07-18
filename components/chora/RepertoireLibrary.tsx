// ─────────────────────────────────────────────────────────────────────────────
// RepertoireLibrary — Blueprint Part 4.3: "study the score while you listen."
//
// Every work is public domain and every score link goes to IMSLP, which hosts
// them free and legally. Grouped by era, filterable, searchable.
//
// Rendered as a tab inside <ChoraConservatory>.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Search, FileMusic, ExternalLink, Library, Users2, CalendarDays } from 'lucide-react';
import { REPERTOIRE, REPERTOIRE_ERAS, type RepertoireEra, type RepertoireWork } from '../../data/repertoire';

const ACCENT = '#E0A458';
const ALL = '__all__';

const WorkCard: React.FC<{ work: RepertoireWork; index: number }> = ({ work, index }) => (
  <motion.article
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-30px' }}
    transition={{ duration: 0.32, delay: (index % 3) * 0.04 }}
    className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 hover:bg-white/[0.05] transition-colors flex flex-col"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: ACCENT }}>{work.composer}</p>
        <h3 className="text-[16px] font-black tracking-tight leading-tight mt-1">{work.title}</h3>
      </div>
      <span
        className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}3a` }}
      >
        <FileMusic size={14} style={{ color: ACCENT }} />
      </span>
    </div>

    <div className="flex items-center gap-3 mt-2.5 flex-wrap text-[10px] text-white/35 font-bold uppercase tracking-widest">
      {work.year && <span className="flex items-center gap-1.5"><CalendarDays size={11} /> {work.year}</span>}
      {work.forces && <span className="flex items-center gap-1.5"><Users2 size={11} /> {work.forces}</span>}
    </div>

    {work.note && <p className="text-[13px] text-white/55 leading-relaxed mt-3 flex-1">{work.note}</p>}

    <div className="mt-4 flex items-center gap-2 flex-wrap">
      <a
        href={work.imslpUrl} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
        style={{ background: ACCENT, color: '#000' }}
      >
        Free score on IMSLP <ExternalLink size={11} />
      </a>
      {work.wikiSlug && (
        <a
          href={`https://en.wikipedia.org/wiki/${work.wikiSlug}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 bg-white/[0.04] text-white/50 hover:text-white transition-colors"
        >
          Background <ExternalLink size={11} />
        </a>
      )}
    </div>
  </motion.article>
);

const RepertoireLibrary: React.FC = () => {
  const [era, setEra] = useState<RepertoireEra | typeof ALL>(ALL);
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REPERTOIRE.filter(w => {
      if (era !== ALL && w.era !== era) return false;
      if (!q) return true;
      return (
        w.title.toLowerCase().includes(q) ||
        w.composer.toLowerCase().includes(q) ||
        (w.note || '').toLowerCase().includes(q)
      );
    });
  }, [era, query]);

  const activeEra = era === ALL ? null : REPERTOIRE_ERAS.find(e => e.id === era) || null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><Library size={140} className="text-white" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>The Repertoire Library</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Study the Score While You Listen</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-2xl">
          {REPERTOIRE.length} public-domain works, medieval chant to ragtime. Every score is hosted free and legally by
          IMSLP — open it in one tab, play the piece in Chora in another, and follow along.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search works or composers…"
          className="w-full rounded-2xl bg-white/[0.04] border border-white/8 pl-11 pr-4 py-3 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* Era filter */}
      <div className="flex gap-2 flex-wrap">
        {[{ id: ALL, label: 'All eras' }, ...REPERTOIRE_ERAS.map(e => ({ id: e.id, label: e.label }))].map(e => {
          const active = era === e.id;
          return (
            <button
              key={e.id}
              onClick={() => setEra(e.id as RepertoireEra | typeof ALL)}
              className="px-3.5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
              style={active
                ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
            >
              {e.label}
            </button>
          );
        })}
      </div>

      {activeEra && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <p className="text-[13px] text-white/55 leading-relaxed">{activeEra.blurb}</p>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-[13px] text-white/35 italic py-8 text-center">Nothing in the library matches that search.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((w, i) => <WorkCard key={w.id} work={w} index={i} />)}
        </div>
      )}

      <p className="text-[11px] text-white/25 italic leading-relaxed pt-2">
        Note: a public-domain composition can still sit under a live recording copyright. The scores here are free to
        download and perform; individual modern recordings of them may not be.
      </p>
    </motion.div>
  );
};

export default RepertoireLibrary;
