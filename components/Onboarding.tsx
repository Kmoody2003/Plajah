/**
 * Onboarding — the short two-page setup shown AFTER the Welcome Package letter on first
 * login: (1) "What brings you here?" (routes you to the right home), (2) "Homes & Studios"
 * (the brand explainer — every medium has a stage AND a studio). Ported from the approved
 * onboarding preview. Full-screen overlay; on finish calls onDone(homeView) to land the
 * user on their chosen home. Deliberately skippable — nothing here is a wall.
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight, LayoutGrid, Music2, Clapperboard, BookOpen, GraduationCap, Trophy,
  SlidersHorizontal, Film, Play, Scissors, PenTool, Compass,
} from 'lucide-react';

interface OnboardingProps {
  /** Called when the user finishes (or skips) — pass the AppView id of their chosen home. */
  onDone: (homeView: string) => void;
}

type Pick = { key: string; label: string; desc: string; icon: React.ComponentType<any>; color: string; home: string; badge?: string };

const PICKS: Pick[] = [
  { key: 'everything', label: 'Everything', desc: 'All of Plajah, full blast — every home, every studio.', icon: LayoutGrid, color: '#FF8C00', home: 'DASHBOARD', badge: 'Recommended' },
  { key: 'music', label: 'Music', desc: 'Open on Chora, with Melos ready to make.', icon: Music2, color: '#8B5CF6', home: 'MUSIC' },
  { key: 'film', label: 'Film & Video', desc: 'Taleo, Reello and the Fabula editor.', icon: Clapperboard, color: '#D40055', home: 'MOVIES_TV' },
  { key: 'books', label: 'Books & Writing', desc: 'Read in Lorea, write in Tela.', icon: BookOpen, color: '#FF9E2C', home: 'BOOKS' },
  { key: 'learn', label: 'Learning', desc: 'Academia — classrooms, courses, your record.', icon: GraduationCap, color: '#3FB98E', home: 'CLASSROOMS' },
  { key: 'sports', label: 'Sports', desc: 'Straight into teams, scores and highlights.', icon: Trophy, color: '#2E7BFF', home: 'PLAJAH_SPORTS' },
];

type App = { name: string; kind: 'Home' | 'Studio'; desc: string; icon: React.ComponentType<any>; color: string };
type Row = { medium: string; apps: App[] };

const ROWS: Row[] = [
  { medium: 'Music', apps: [
    { name: 'Chora', kind: 'Home', desc: 'Stream, release & build your music world.', icon: Music2, color: '#8B5CF6' },
    { name: 'Melos', kind: 'Studio', desc: 'The full production room — beats, instruments, mixing.', icon: SlidersHorizontal, color: '#00DAF3' },
  ] },
  { medium: 'Film · Video', apps: [
    { name: 'Taleo', kind: 'Home', desc: 'Cinema-grade movies & series.', icon: Film, color: '#D40055' },
    { name: 'Reello', kind: 'Home', desc: 'Shorts, a channel, going live.', icon: Play, color: '#2E7BFF' },
    { name: 'Fabula', kind: 'Studio', desc: 'The AI film editor — cut, grade, finish.', icon: Scissors, color: '#FF4D8D' },
  ] },
  { medium: 'Books', apps: [
    { name: 'Lorea', kind: 'Home', desc: 'Read & publish novels, comics, manga.', icon: BookOpen, color: '#FF9E2C' },
    { name: 'Tela', kind: 'Studio', desc: 'The living document canvas — write & design.', icon: PenTool, color: '#22D3AA' },
  ] },
  { medium: 'Learn', apps: [
    { name: 'Academia', kind: 'Home', desc: 'Classrooms, courses & a learner record.', icon: GraduationCap, color: '#3FB98E' },
  ] },
];

const Onboarding: React.FC<OnboardingProps> = ({ onDone }) => {
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState('everything');
  const chosen = PICKS.find(p => p.key === pick) || PICKS[0];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[320] overflow-y-auto bg-black/95 backdrop-blur-2xl"
      style={{ backgroundImage: 'radial-gradient(ellipse at 82% -8%, rgba(212,0,85,0.18), transparent 55%), radial-gradient(ellipse at 4% 4%, rgba(107,0,153,0.22), transparent 60%)' }}
    >
      <div className="min-h-full max-w-4xl mx-auto px-5 py-8 pb-28 flex flex-col">
        {/* progress */}
        <div className="flex items-center gap-2 mb-8">
          <span className="text-[15px] font-black italic uppercase tracking-tight text-white mr-auto">Plajah</span>
          {[0, 1].map(i => (
            <span key={i} className={`h-1 rounded-full transition-all ${i <= step ? 'w-9 bg-gradient-to-r from-[#D40055] to-[#FF8C00]' : 'w-6 bg-white/15'}`} />
          ))}
        </div>

        {step === 0 ? (
          <>
            <div className="text-center max-w-xl mx-auto mb-8">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-3">Takes 20 seconds</p>
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white leading-[0.9]">
                What brings you <span className="bg-gradient-to-r from-[#D40055] to-[#FF8C00] bg-clip-text text-transparent">here?</span>
              </h1>
              <p className="text-sm text-white/55 mt-4">We'll open Plajah on the right doorstep. You can roam anywhere the moment you're in — nothing is locked.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PICKS.map((p, i) => {
                const Icon = p.icon;
                const sel = pick === p.key;
                return (
                  <motion.button
                    key={p.key}
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 + i * 0.04 }}
                    onClick={() => setPick(p.key)}
                    className="relative text-left rounded-2xl p-5 border transition-all bg-white/[0.04] hover:bg-white/[0.07]"
                    style={sel ? { borderColor: 'transparent', boxShadow: `0 0 0 2px ${p.color}, 0 14px 34px -12px ${p.color}` } : { borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    {p.badge && <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-small-orange text-black text-[7px] font-black uppercase tracking-widest">{p.badge}</span>}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${p.color}22`, border: `1px solid ${p.color}55` }}>
                      <Icon size={18} style={{ color: p.color }} />
                    </div>
                    <p className="text-base font-black text-white">{p.label}</p>
                    <p className="text-[12px] text-white/45 leading-snug mt-1">{p.desc}</p>
                  </motion.button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="text-center max-w-2xl mx-auto mb-7">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-3">The part no one else has built</p>
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white leading-[0.9]">
                Every craft gets a stage — <span className="bg-gradient-to-r from-[#D40055] to-[#FF8C00] bg-clip-text text-transparent">and a studio.</span>
              </h1>
              <p className="text-sm text-white/55 mt-4">Most apps give you one or the other. Plajah gives you both, in every medium — under one profile.</p>
            </div>
            <div className="flex items-center justify-center gap-5 mb-5 text-[11px] font-bold uppercase tracking-widest text-white/45">
              <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm bg-white" /> Home · where it lives</span>
              <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm border border-dashed border-white/60" /> Studio · where it's made</span>
            </div>
            <div className="flex flex-col gap-3">
              {ROWS.map(row => (
                <div key={row.medium} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-3">{row.medium}</p>
                  <div className="flex flex-wrap gap-2.5">
                    {row.apps.map(a => {
                      const Icon = a.icon;
                      const studio = a.kind === 'Studio';
                      return (
                        <div key={a.name} className="flex-1 min-w-[200px] flex gap-3 items-start p-3 rounded-xl bg-white/[0.02] border border-white/10">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={studio ? { color: a.color, border: `1.5px dashed ${a.color}88` } : { backgroundColor: a.color, color: '#fff' }}>
                            <Icon size={17} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-black text-white flex items-center gap-2">{a.name}
                              <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full" style={studio ? { color: a.color, border: `1px solid ${a.color}66` } : { color: '#000', backgroundColor: a.color }}>{a.kind}</span>
                            </p>
                            <p className="text-[12px] text-white/45 leading-snug mt-0.5">{a.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-base font-black italic uppercase tracking-tight text-white mt-6">One identity carries all of it. <span className="bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] bg-clip-text text-transparent">Welcome to yours.</span></p>
          </>
        )}
      </div>

      {/* nav bar */}
      <div className="fixed inset-x-0 bottom-0 flex items-center justify-center gap-3 p-4" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 40%, transparent)' }}>
        {step === 0 ? (
          <button onClick={() => onDone(chosen.home)} className="text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors px-4 py-3.5">Skip</button>
        ) : (
          <button onClick={() => setStep(0)} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-[12px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"><span aria-hidden>←</span> Back</button>
        )}
        <button
          onClick={() => (step === 0 ? setStep(1) : onDone(chosen.home))}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] px-8 py-3.5 text-[12px] font-black uppercase tracking-widest text-white shadow-[0_10px_30px_-8px_rgba(212,0,85,0.6)] hover:scale-[1.03] active:scale-95 transition-all"
        >
          {step === 0 ? <>Continue <ArrowRight size={15} /></> : <>Enter Plajah <Compass size={15} /></>}
        </button>
      </div>
    </motion.div>
  );
};

export default Onboarding;
