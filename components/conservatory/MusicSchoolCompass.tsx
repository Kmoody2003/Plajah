import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Compass, ChevronDown, ArrowUpRight } from 'lucide-react';
import { PRINCIPLES } from '../../services/musicPedagogy/philosophy';
import { STRANDS, BANDS, spineCell, type SpineBandId, type SpineLink } from '../../services/musicPedagogy/musicSpine';
import { standardById, crosswalkOf } from '../../data/educationStandards';

// ─────────────────────────────────────────────────────────────────────────────
// MusicSchoolCompass — the Conservatory's "how we teach" and "what you'll learn".
//
//   • Scope & Sequence — the five-strand spine for a chosen band. Every goal shows the standards
//     it writes to, including the Common Core math / ELA standards a music skill exercises, and
//     links straight into the drill, course or Math Quest grade that practises it.
//   • Philosophy — the research behind every design rule, with sources and honest caveats.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = '#E0A458';
const FW_COLOR: Record<string, string> = { NCAS_MUSIC: ACCENT, CCSS_MATH: '#3B82F6', CCSS_ELA: '#06D6A0' };
const FW_LABEL: Record<string, string> = { NCAS_MUSIC: 'Music', CCSS_MATH: 'Math', CCSS_ELA: 'ELA' };

const StdChip: React.FC<{ id: string }> = ({ id }) => {
  const s = standardById(id);
  if (!s) return null;
  const c = FW_COLOR[s.framework] || '#999';
  return (
    <span title={s.statement} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wide border"
      style={{ borderColor: `${c}55`, color: c, background: `${c}12` }}>
      {FW_LABEL[s.framework] || s.framework} · {s.code}
    </span>
  );
};

export const MusicSchoolCompass: React.FC<{ onLink: (l: SpineLink) => void }> = ({ onLink }) => {
  const [band, setBand] = useState<SpineBandId>('35');
  const [open, setOpen] = useState<string | null>(PRINCIPLES[0].id);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#120f0a] to-black p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 opacity-10"><Compass size={150} /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Scope & Sequence</p>
        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">One music curriculum, Pre-K to lifelong</h2>
        <p className="text-sm text-white/50 mt-2 max-w-2xl leading-relaxed">
          Five strands, aligned to all eleven National Core Arts Standards for music — and crosswalked to the Common Core
          math and ELA standards each skill exercises. Rhythm is fractions; tuning is ratios and exponents; songwriting is writing.
          Every chip below is a real standard your progress is recorded against.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {BANDS.map(b => (
            <button key={b.id} onClick={() => setBand(b.id)} className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
              style={band === b.id ? { background: `${ACCENT}22`, borderColor: ACCENT, color: ACCENT } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}>
              {b.label} <span className="opacity-60">· {b.ages}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={band} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {STRANDS.map(st => {
            const cell = spineCell(st.id, band);
            if (!cell) return null;
            // Show the music node's cross-subject edges too, so the math/ELA link is visible.
            const cross = Array.from(new Set(cell.standardIds.flatMap(id => crosswalkOf(id).map(s => s.id))))
              .filter(id => !cell.standardIds.includes(id) && /^CCSS/.test(id));
            return (
              <div key={st.id} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{st.emoji}</span>
                  <div>
                    <h3 className="font-black uppercase tracking-tight text-sm">{st.title}</h3>
                    <p className="text-[10px] text-white/40">{st.blurb}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 flex-1">
                  {cell.goals.map(g => (
                    <li key={g} className="text-[13px] text-white/75 leading-snug flex gap-2"><span style={{ color: ACCENT }}>✓</span><span>{g}</span></li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1 mt-3">
                  {[...cell.standardIds, ...cross].map(id => <StdChip key={id} id={id} />)}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
                  {cell.links.map(l => (
                    <button key={l.label} onClick={() => onLink(l)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/[0.05] hover:bg-white/[0.1] text-white/75">
                      {l.label} <ArrowUpRight size={10} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <Brain size={16} style={{ color: ACCENT }} />
          <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Philosophy · the science behind the school</p>
        </div>
        <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight mt-1">Why it’s built this way</h2>
        <p className="text-sm text-white/45 mt-1 max-w-2xl">Each principle comes from music cognition, neuroscience or learning research, and each one is a rule the app actually follows. Where the evidence is weaker than the headlines, we say so.</p>
        <div className="mt-5 space-y-2">
          {PRINCIPLES.map(p => {
            const isOpen = open === p.id;
            return (
              <div key={p.id} className="rounded-2xl border border-white/8 bg-black/20 overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : p.id)} className="w-full text-left px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm">{p.title}</p>
                    <p className="text-[12px] text-white/45">{p.short}</p>
                  </div>
                  <ChevronDown size={16} className={`text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4">
                      <p className="text-[13px] text-white/70 leading-relaxed">{p.finding}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-4 mb-1.5">What the app does about it</p>
                      <ul className="space-y-1">
                        {p.rules.map(r => <li key={r} className="text-[13px] text-white/75 flex gap-2"><span style={{ color: ACCENT }}>→</span><span>{r}</span></li>)}
                      </ul>
                      {p.caveat && <p className="text-[12px] mt-3 italic" style={{ color: ACCENT }}>{p.caveat}</p>}
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-4 mb-1.5">Sources</p>
                      <ul className="space-y-1">
                        {p.sources.map(c => (
                          <li key={c.title} className="text-[11px] text-white/45 leading-snug">{c.authors} ({c.year}). <span className="italic">{c.title}</span>. {c.venue}.</li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MusicSchoolCompass;
