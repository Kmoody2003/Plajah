import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, Users, Flag, Sparkles, BookOpen, HelpCircle, Check, X, RotateCcw } from 'lucide-react';
import { BASICS, ROLES, FORMATIONS, RULES, CULTURE, GLOSSARY, QUIZ } from '../data/soccerLearn';

type Section = 'basics' | 'positions' | 'rules' | 'culture' | 'glossary' | 'quiz';

// ── interactive pitch (positions & formations) ───────────────────────────────
const PitchBoard: React.FC = () => {
  const [fIdx, setFIdx] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const formation = FORMATIONS[fIdx];
  const role = sel !== null ? ROLES[formation.slots[sel].role] : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {FORMATIONS.map((f, i) => (
          <button key={f.name} onClick={() => { setFIdx(i); setSel(null); }}
            className={`px-4 py-2 rounded-full text-[10px] font-black tracking-widest transition-all border ${i === fIdx ? 'bg-[#39B54A] text-black border-transparent' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
            {f.name}
          </button>
        ))}
      </div>
      <p className="text-xs text-white/40 -mt-1">{formation.nickname} · <span className="text-white/60">tap a player to learn their job</span></p>

      <div className="grid md:grid-cols-[1.1fr_1fr] gap-4 items-start">
        {/* SVG pitch */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10" style={{ background: 'linear-gradient(160deg,#0d3b1e,#082915)' }}>
          <svg viewBox="0 0 100 100" className="w-full block">
            {/* markings */}
            <g stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" fill="none">
              <rect x="4" y="3" width="92" height="94" rx="1" />
              <line x1="4" y1="50" x2="96" y2="50" />
              <circle cx="50" cy="50" r="9" />
              <rect x="30" y="3" width="40" height="14" />
              <rect x="30" y="83" width="40" height="14" />
              <rect x="41" y="3" width="18" height="5" />
              <rect x="41" y="92" width="18" height="5" />
            </g>
            {/* players */}
            {formation.slots.map((s, i) => {
              const active = sel === i;
              return (
                <g key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
                  <circle cx={s.x} cy={s.y} r={active ? 4.4 : 3.6}
                    fill={active ? '#39B54A' : '#ffffff'} stroke={active ? '#fff' : 'rgba(0,0,0,0.35)'} strokeWidth="0.5" />
                  <text x={s.x} y={s.y + 1.4} textAnchor="middle" fontSize="3.1" fontWeight="900"
                    fill={active ? '#04210f' : '#0b3b1e'}>{s.role}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* role detail */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 min-h-[180px] flex flex-col justify-center">
          {role ? (
            <motion.div key={role.code} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <span className="inline-block px-3 py-1 rounded-full bg-[#39B54A]/15 border border-[#39B54A]/30 text-[9px] font-black uppercase tracking-widest text-[#39B54A]">{role.code}</span>
              <h4 className="text-xl font-black uppercase tracking-tight mt-2">{role.name}</h4>
              <p className="text-sm text-white/55 leading-relaxed mt-2">{role.job}</p>
            </motion.div>
          ) : (
            <div className="text-center text-white/30">
              <Users size={30} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs font-bold uppercase tracking-widest">Tap any player on the pitch</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── quiz ─────────────────────────────────────────────────────────────────────
const Quiz: React.FC = () => {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = QUIZ[i];

  const choose = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === q.answer) setScore(s => s + 1);
  };
  const next = () => {
    if (i + 1 >= QUIZ.length) { setDone(true); return; }
    setI(i + 1); setPicked(null);
  };
  const reset = () => { setI(0); setPicked(null); setScore(0); setDone(false); };

  if (done) {
    const pct = Math.round((score / QUIZ.length) * 100);
    const verdict = pct === 100 ? 'Perfect — you\'re a pundit! 🎙️' : pct >= 70 ? 'Great — you know the game! ⚽' : pct >= 40 ? 'Nice start — keep watching! 👀' : 'Everyone starts somewhere — replay the tabs! 📖';
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center space-y-3">
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#39B54A]">Your Score</p>
        <p className="text-5xl font-black">{score}<span className="text-white/30 text-2xl">/{QUIZ.length}</span></p>
        <p className="text-sm text-white/60">{verdict}</p>
        <button onClick={reset} className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#39B54A] text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110">
          <RotateCcw size={13} /> Play again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Question {i + 1} / {QUIZ.length}</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-[#39B54A]">Score {score}</span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#39B54A] transition-all" style={{ width: `${((i) / QUIZ.length) * 100}%` }} /></div>
      <h4 className="text-lg font-black tracking-tight">{q.q}</h4>
      <div className="grid gap-2">
        {q.options.map((opt, idx) => {
          const isAns = idx === q.answer;
          const state = picked === null ? 'idle' : isAns ? 'correct' : picked === idx ? 'wrong' : 'muted';
          return (
            <button key={idx} onClick={() => choose(idx)} disabled={picked !== null}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-left text-sm font-bold border transition-all ${
                state === 'idle' ? 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20'
                : state === 'correct' ? 'bg-green-500/15 border-green-500/40 text-green-300'
                : state === 'wrong' ? 'bg-red-500/15 border-red-500/40 text-red-300'
                : 'bg-white/[0.02] border-white/5 text-white/30'}`}>
              {opt}
              {state === 'correct' && <Check size={16} />}
              {state === 'wrong' && <X size={16} />}
            </button>
          );
        })}
      </div>
      <AnimatePresence>
        {picked !== null && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <p className="text-sm text-white/55 leading-relaxed pt-1">{q.explain}</p>
            <button onClick={next} className="mt-3 px-5 py-2.5 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest hover:brightness-90">
              {i + 1 >= QUIZ.length ? 'See results' : 'Next question'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const WorldCupLearn: React.FC = () => {
  const [section, setSection] = useState<Section>('basics');
  const tabs: { id: Section; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'basics', label: 'The Basics', icon: GraduationCap },
    { id: 'positions', label: 'Positions', icon: Users },
    { id: 'rules', label: 'Rules', icon: Flag },
    { id: 'culture', label: 'Culture', icon: Sparkles },
    { id: 'glossary', label: 'Glossary', icon: BookOpen },
    { id: 'quiz', label: 'Quiz', icon: HelpCircle },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a2417] via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 opacity-10"><GraduationCap size={130} className="text-[#39B54A]" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#39B54A]">New to Soccer?</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Learn the Beautiful Game</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-lg">No experience needed. In five minutes you'll know how it works, who plays where, and why the world loves it — then test yourself.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {tabs.map(t => {
          const Icon = t.icon; const active = section === t.id;
          return (
            <button key={t.id} onClick={() => setSection(t.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${active ? 'bg-[#39B54A] text-black border-transparent' : 'bg-white/5 border-white/8 text-white/50 hover:text-white hover:bg-white/10'}`}>
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {section === 'basics' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BASICS.map((b, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <div className="text-3xl mb-2">{b.icon}</div>
              <h4 className="text-sm font-black uppercase tracking-tight">{b.title}</h4>
              <p className="text-[13px] text-white/50 leading-relaxed mt-1.5">{b.body}</p>
            </motion.div>
          ))}
        </div>
      )}

      {section === 'positions' && <PitchBoard />}

      {section === 'rules' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {RULES.map((r, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2.5 mb-2"><span className="text-2xl">{r.icon}</span><h4 className="text-sm font-black uppercase tracking-tight">{r.title}</h4></div>
              <p className="text-[13px] text-white/55 leading-relaxed">{r.body}</p>
              {r.tip && <p className="text-[11px] text-[#39B54A]/80 font-bold mt-2.5 flex gap-1.5"><Sparkles size={12} className="shrink-0 mt-0.5" />{r.tip}</p>}
            </motion.div>
          ))}
        </div>
      )}

      {section === 'culture' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CULTURE.map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <div className="text-3xl mb-2">{c.emoji}</div>
              <h4 className="text-sm font-black uppercase tracking-tight">{c.title}</h4>
              <p className="text-[13px] text-white/50 leading-relaxed mt-1.5">{c.body}</p>
            </motion.div>
          ))}
        </div>
      )}

      {section === 'glossary' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {GLOSSARY.map((g, i) => (
            <div key={i} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#39B54A]">{g.term}</p>
              <p className="text-[13px] text-white/55 leading-relaxed mt-1">{g.def}</p>
            </div>
          ))}
        </div>
      )}

      {section === 'quiz' && <Quiz />}
    </div>
  );
};

export default WorldCupLearn;
