import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Music, Landmark, BookOpen, Ear, Sparkles } from 'lucide-react';
import MuseumHall from './MuseumHall';
import { CONSERVATORY_HALLS, CONSERVATORY_FIGURES } from '../data/musicFigures';
import { MUSIC_HISTORY_ERAS } from '../data/musicHistory';

// ─────────────────────────────────────────────────────────────────────────────
// ChoraConservatory — the humanities half of Plajah Chora.
//
// Two tabs:
//   • Conservatory Hall — the music museum (composer & musician biographies) on
//     the shared <MuseumHall> engine, seeded from data/musicFigures.ts.
//   • Music History — a curated era-by-era reading list from data/musicHistory.ts,
//     rendered as elegant cards. No external dependencies.
//
// Chora's warm-brass accent.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = '#E0A458';

type ConservatoryTab = 'HALL' | 'HISTORY';

const HistoryCard: React.FC<{ era: typeof MUSIC_HISTORY_ERAS[number]; index: number }> = ({ era, index }) => (
  <motion.article
    initial={{ opacity: 0, y: 14 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.4, delay: (index % 3) * 0.05 }}
    className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 sm:p-6 hover:bg-white/[0.05] transition-colors"
  >
    <div className="flex items-start gap-3">
      <div
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black"
        style={{ background: `${ACCENT}1f`, border: `1px solid ${ACCENT}44`, color: ACCENT }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="min-w-0">
        <p className="text-[8px] font-black uppercase tracking-[0.35em]" style={{ color: ACCENT }}>{era.span}</p>
        <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight leading-tight mt-0.5">{era.title}</h3>
      </div>
    </div>

    <p className="text-[13px] sm:text-sm text-white/55 leading-relaxed mt-4">{era.essay}</p>

    <div className="mt-5 grid sm:grid-cols-2 gap-5">
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles size={11} style={{ color: ACCENT }} />
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Key Developments</p>
        </div>
        <ul className="space-y-1.5">
          {era.developments.map(d => (
            <li key={d} className="text-[12px] text-white/60 leading-relaxed flex gap-2">
              <span style={{ color: ACCENT }}>—</span><span>{d}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Ear size={11} style={{ color: ACCENT }} />
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Listen For This</p>
        </div>
        <ul className="space-y-1.5">
          {era.listenFor.map(l => (
            <li
              key={l}
              className="text-[12px] text-white/60 leading-relaxed rounded-xl px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </motion.article>
);

const ChoraConservatory: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [tab, setTab] = useState<ConservatoryTab>('HALL');

  return (
    <div className="flex-1 bg-transparent text-white overflow-y-auto custom-scrollbar pb-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 pt-8">
        {/* Back + kicker */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
          >
            <ChevronLeft size={14} /> Back to Chora
          </button>
          <div className="flex items-center gap-2">
            <Landmark size={14} style={{ color: ACCENT }} />
            <span className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>The Conservatory</span>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex gap-2 mb-6">
          {([
            { id: 'HALL' as const, label: 'Conservatory Hall', icon: Music },
            { id: 'HISTORY' as const, label: 'Music History', icon: BookOpen },
          ]).map(t => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
                style={active
                  ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                  : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'HALL' ? (
            <motion.div key="hall" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MuseumHall
                eyebrow="The Conservatory Hall"
                title="Masters of Music"
                intro="From Bach to Coltrane to Aretha — the composers and musicians who built the language we still speak. Portraits and biographies stream live from Wikipedia; tap any figure for signature works and their lasting contribution."
                halls={CONSERVATORY_HALLS}
                figures={CONSERVATORY_FIGURES}
                accent={ACCENT}
                icon={Music}
                shareDiscipline="Music"
              />
            </motion.div>
          ) : (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              {/* History header */}
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
                <div className="absolute -right-8 -top-8 opacity-10"><BookOpen size={140} className="text-white" /></div>
                <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>A Short History of Music</p>
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Antiquity to the Algorithm</h1>
                <p className="text-sm text-white/45 mt-1.5 max-w-2xl">
                  Nine eras that carried music from a single chanted line to a world built out of samples and streams — each with what changed, and what to listen for.
                </p>
              </div>

              <div className="space-y-4">
                {MUSIC_HISTORY_ERAS.map((era, i) => (
                  <HistoryCard key={era.id} era={era} index={i} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ChoraConservatory;
