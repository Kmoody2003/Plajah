import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Check, X, Flame, Zap, ChevronLeft, Sparkles, Mic, MicOff, Delete, Trophy, Headphones } from 'lucide-react';
import { auth } from '../../services/backendService';
import {
  MODES, modeById, buildQuestion, recordAnswer, loadGym, saveGym, modeStat, modeMastery, dailyMixMode,
  INTERVALS, type GymModeId, type GymQuestion, type GymProgress, type BandId, type Direction, type Syllable,
} from '../../services/musicPedagogy/earTraining';
import { audio, note, stopAll, listenPitch, type MicHandle, type PitchReading } from '../../services/musicPedagogy/earAudio';
import { recordMusicMastery } from '../../services/musicPedagogy/musicLedger';
import { RhythmBar } from './notation';

// ─────────────────────────────────────────────────────────────────────────────
// EarGym — the Conservatory's ear-training workflow.
//
//   Home     → band picker, Daily Mix, eight drills (+ Echo sing-back), each with a mastery ring.
//   Session  → hear → answer → instant, AUDIBLE feedback ("hear the difference"), next.
//   Summary  → accuracy, XP, what to work on; mastery written to the Academic Passport.
//
// The pedagogy lives in services/musicPedagogy (earTraining.ts + philosophy.ts); this file is
// only the experience. Keyboard: Space = replay, 1–9 = answer, Enter = next.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = '#E0A458';
const SESSION_LEN = 12;
const MIX_LEN = 15;
const BAND_KEY = 'earGym.band';

const BANDS: { id: BandId; label: string }[] = [
  { id: 'K2', label: 'Pre-K–2' }, { id: '35', label: 'Grades 3–5' }, { id: '68', label: 'Grades 6–8' }, { id: 'HS', label: '9–12 & adults' },
];

type Phase = 'home' | 'session' | 'summary' | 'echo';

interface SessionState {
  mix: boolean;
  mode: GymModeId;
  index: number;
  total: number;
  right: number;
  combo: number;
  bestCombo: number;
  xp: number;
  levelUps: string[];
  touched: Set<GymModeId>;
}

const Ring: React.FC<{ value: number; size?: number }> = ({ value, size = 44 }) => {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={4} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={ACCENT} strokeWidth={4} fill="none" strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" textAnchor="middle" fontSize={11} fontWeight={800} fill="white">{Math.round(value * 100)}</text>
    </svg>
  );
};

const EarGym: React.FC = () => {
  const uid = auth.currentUser?.uid || 'guest';
  const [gym, setGym] = useState<GymProgress>(() => loadGym(uid));
  const [band, setBand] = useState<BandId>(() => {
    try { return (localStorage.getItem(BAND_KEY) as BandId) || '68'; } catch { return '68'; }
  });
  const [phase, setPhase] = useState<Phase>('home');
  const [dir, setDir] = useState<Direction | 'mixed'>('asc');
  const [s, setS] = useState<SessionState | null>(null);
  const [q, setQ] = useState<GymQuestion | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [seq, setSeq] = useState<Syllable[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const gymRef = useRef(gym);
  gymRef.current = gym;

  useEffect(() => { try { localStorage.setItem(BAND_KEY, band); } catch { /* */ } }, [band]);
  useEffect(() => () => stopAll(), []);

  const persist = useCallback((g: GymProgress) => { saveGym(uid, g); setGym({ ...g }); }, [uid]);

  const nextQuestion = useCallback((st: SessionState) => {
    const mode = st.mix ? dailyMixMode(gymRef.current, band) : st.mode;
    const nq = buildQuestion(gymRef.current, mode, { direction: dir });
    setQ(nq);
    setChosen(null);
    setSeq([]);
    stopAll();
    window.setTimeout(() => nq.play(), 180);
  }, [band, dir]);

  const start = (mode: GymModeId | 'mix') => {
    audio(); // unlock audio inside the click
    const st: SessionState = {
      mix: mode === 'mix', mode: mode === 'mix' ? 'intervals' : mode, index: 0, total: mode === 'mix' ? MIX_LEN : SESSION_LEN,
      right: 0, combo: 0, bestCombo: 0, xp: 0, levelUps: [], touched: new Set(),
    };
    setS(st);
    setPhase('session');
    nextQuestion(st);
  };

  const answer = useCallback((id: string) => {
    if (!q || !s || chosen !== null) return;
    setChosen(id);
    const ok = id === q.answer;
    const g = gymRef.current;
    const combo = ok ? s.combo + 1 : 0;
    const out = recordAnswer(g, q, id, combo);
    persist(g);
    const levelUps = out.levelUp ? [...s.levelUps, `${modeById(q.mode).title}: ${modeById(q.mode).levels[modeStat(g, q.mode).level].label}`] : s.levelUps;
    if (out.levelUp) { setToast(`Level up — ${modeById(q.mode).levels[modeStat(g, q.mode).level].label} unlocked`); window.setTimeout(() => setToast(null), 2600); }
    const touched = new Set(s.touched); touched.add(q.mode);
    setS({ ...s, right: s.right + (ok ? 1 : 0), combo, bestCombo: Math.max(s.bestCombo, combo), xp: s.xp + out.xp, levelUps, touched });
    // A right scale-degree answer walks home; a wrong one is handled by the "hear it" buttons.
    stopAll();
    if (ok && q.mode === 'degrees') q.playChoice?.(q.answer);
    else if (ok) note(84, 0, 0.12, 0.18);
  }, [q, s, chosen, persist]);

  const finish = useCallback((st: SessionState) => {
    setPhase('summary');
    stopAll();
    for (const m of st.touched) {
      void recordMusicMastery(modeById(m).standardId, modeMastery(gymRef.current, m), `ear-gym:${m}`);
    }
  }, []);

  const next = useCallback(() => {
    if (!s || chosen === null) return;
    const st = { ...s, index: s.index + 1 };
    setS(st);
    if (st.index >= st.total) finish(st);
    else nextQuestion(st);
  }, [s, chosen, finish, nextQuestion]);

  const submitSeq = () => { if (q && seq.length === q.length) answer(seq.join(' ')); };

  // Keyboard: Space replay, 1–9 choose, Enter next.
  useEffect(() => {
    if (phase !== 'session') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); stopAll(); q?.play(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (chosen !== null) next(); else if (q?.kind === 'sequence') submitSeq(); }
      else if (/^[1-9]$/.test(e.key) && q && chosen === null) {
        if (q.kind === 'choice') { const c = q.choices[+e.key - 1]; if (c) answer(c.id); }
        else if (q.pool) { const syl = q.pool[+e.key - 1]; if (syl && seq.length < (q.length || 0)) setSeq([...seq, syl]); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const order: BandId[] = ['K2', '35', '68', 'HS'];
  const recommended = useMemo(() => new Set(MODES.filter(m => m.band === band).map(m => m.id)), [band]);

  // ── Home ────────────────────────────────────────────────────────────────────
  if (phase === 'home') {
    return (
      <div className="space-y-5">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#120f0a] to-black p-5 sm:p-7 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-10"><Headphones size={150} /></div>
          <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>The Ear Gym</p>
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Train the ear you already have</h2>
          <p className="text-sm text-white/50 mt-2 max-w-2xl leading-relaxed">
            Every drill starts from sound, opens with the easiest contrast, and moves on only when you’re ready.
            Miss one and you’ll hear the right answer next to yours. Five minutes a day beats an hour on Sunday.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button onClick={() => start('mix')} className="flex items-center gap-2 px-5 py-3 rounded-full font-black uppercase tracking-widest text-[11px] text-black" style={{ background: ACCENT }}>
              <Sparkles size={14} /> Daily Mix · 5 min
            </button>
            <div className="flex items-center gap-4 text-[11px] font-bold text-white/60">
              <span className="flex items-center gap-1.5"><Flame size={14} className="text-orange-400" />{gym.streakDays} day streak</span>
              <span className="flex items-center gap-1.5"><Zap size={14} style={{ color: ACCENT }} />{gym.xp.toLocaleString()} XP</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-5">
            {BANDS.map(b => (
              <button key={b.id} onClick={() => setBand(b.id)}
                className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors"
                style={band === b.id ? { background: `${ACCENT}22`, borderColor: ACCENT, color: ACCENT } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODES.filter(m => order.indexOf(m.band) <= order.indexOf(band) + 1).concat(MODES.filter(m => order.indexOf(m.band) > order.indexOf(band) + 1)).map(m => {
            const st = gym.modes[m.id];
            const lvl = st?.level ?? 0;
            return (
              <button key={m.id} onClick={() => start(m.id)}
                className="text-left rounded-3xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] p-4 transition-colors flex gap-3">
                <div className="text-2xl leading-none mt-0.5">{m.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black uppercase tracking-tight text-sm">{m.title}</h3>
                    {recommended.has(m.id) && <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>Your level</span>}
                  </div>
                  <p className="text-[11px] text-white/45 leading-snug mt-1">{m.tagline}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-2">Level {lvl + 1}/{m.levels.length} · {m.levels[lvl].label}</p>
                </div>
                <Ring value={modeMastery(gym, m.id)} />
              </button>
            );
          })}
          <button onClick={() => { audio(); setPhase('echo'); }}
            className="text-left rounded-3xl border p-4 transition-colors flex gap-3 hover:bg-white/[0.06]" style={{ borderColor: `${ACCENT}44`, background: `${ACCENT}0d` }}>
            <div className="text-2xl leading-none mt-0.5">🎤</div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black uppercase tracking-tight text-sm">Echo</h3>
              <p className="text-[11px] text-white/45 leading-snug mt-1">Hear a note, sing it back, and watch your voice land on it. Singing in tune is trained, not born.</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-2">Uses your microphone · nothing is recorded</p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-white/35">
          <span className="font-black uppercase tracking-widest">Interval direction</span>
          {(['asc', 'desc', 'harm', 'mixed'] as const).map(d => (
            <button key={d} onClick={() => setDir(d)} className="px-2.5 py-1 rounded-full border font-bold"
              style={dir === d ? { borderColor: ACCENT, color: ACCENT } : { borderColor: 'rgba(255,255,255,0.08)' }}>
              {d === 'asc' ? 'Rising' : d === 'desc' ? 'Falling' : d === 'harm' ? 'Together' : 'Mixed'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'echo') return <Echo onBack={() => { setPhase('home'); }} />;

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (phase === 'summary' && s) {
    const pct = Math.round((s.right / s.total) * 100);
    const weak = Object.entries(gym.items)
      .filter(([k, st]) => s.touched.has(k.split(':')[0] as GymModeId) && st.seen >= 2 && st.box <= 1)
      .sort((a, b) => a[1].right / a[1].seen - b[1].right / b[1].seen)
      .slice(0, 4)
      .map(([k]) => k.split(':'));
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 text-center max-w-xl mx-auto">
        <Trophy size={36} className="mx-auto" style={{ color: ACCENT }} />
        <h2 className="text-3xl font-black uppercase tracking-tight mt-3">{pct >= 85 ? 'Locked in.' : pct >= 60 ? 'Getting there.' : 'Every rep counts.'}</h2>
        <p className="text-white/50 text-sm mt-1">{s.right}/{s.total} right · best combo {s.bestCombo} · +{s.xp} XP</p>
        {s.levelUps.length > 0 && (
          <div className="mt-4 space-y-1">{s.levelUps.map(l => <p key={l} className="text-sm font-bold" style={{ color: ACCENT }}>⬆ {l}</p>)}</div>
        )}
        {weak.length > 0 && (
          <div className="mt-5 text-left rounded-2xl bg-black/30 p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">Coming back soon (spaced review)</p>
            {weak.map(([m, item, d]) => (
              <p key={`${m}${item}${d}`} className="text-sm text-white/70">
                {modeById(m as GymModeId).emoji} {m === 'intervals' ? `${INTERVALS[item]?.name ?? item}${d ? ` (${d === 'asc' ? 'rising' : d === 'desc' ? 'falling' : 'together'})` : ''}` : item}
              </p>
            ))}
          </div>
        )}
        <div className="flex justify-center gap-2 mt-6">
          <button onClick={() => start(s.mix ? 'mix' : s.mode)} className="px-5 py-2.5 rounded-full font-black uppercase tracking-widest text-[10px] text-black" style={{ background: ACCENT }}>Again</button>
          <button onClick={() => setPhase('home')} className="px-5 py-2.5 rounded-full font-black uppercase tracking-widest text-[10px] border border-white/15 text-white/70">Gym home</button>
        </div>
        {!auth.currentUser && <p className="text-[10px] text-white/30 mt-4">Sign in to carry this progress into your Academic Passport.</p>}
      </div>
    );
  }

  // ── Session ─────────────────────────────────────────────────────────────────
  if (!q || !s) return null;
  const def = modeById(q.mode);
  const ok = chosen !== null && chosen === q.answer;
  const lvl = modeStat(gym, q.mode).level;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { stopAll(); setPhase('home'); }} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
          <ChevronLeft size={14} /> Gym
        </button>
        <div className="flex items-center gap-3 text-[11px] font-bold">
          {s.combo >= 3 && <span className="flex items-center gap-1 text-orange-400"><Flame size={13} />{s.combo}</span>}
          <span className="text-white/40">{Math.min(s.index + 1, s.total)}/{s.total}</span>
        </div>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden mb-5">
        <motion.div className="h-full" style={{ background: ACCENT }} animate={{ width: `${(s.index / s.total) * 100}%` }} />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7 relative overflow-hidden">
        <AnimatePresence>
          {chosen !== null && ok && (
            <motion.div key="glow" initial={{ opacity: 0.6, scale: 0.6 }} animate={{ opacity: 0, scale: 1.8 }} transition={{ duration: 0.9 }}
              className="absolute inset-0 pointer-events-none rounded-3xl" style={{ background: `radial-gradient(circle, ${ACCENT}55, transparent 60%)` }} />
          )}
        </AnimatePresence>
        <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: ACCENT }}>{def.emoji} {def.title} · {def.levels[Math.min(lvl, def.levels.length - 1)].label}</p>
        <h3 className="text-lg sm:text-xl font-black mt-1">{q.prompt}</h3>

        <div className="flex justify-center my-6">
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => { stopAll(); q.play(); }}
            className="w-20 h-20 rounded-full flex items-center justify-center text-black shadow-lg" style={{ background: ACCENT, boxShadow: `0 0 40px ${ACCENT}44` }}
            aria-label="Play again">
            <Play size={30} fill="currentColor" />
          </motion.button>
        </div>
        <p className="text-center text-[9px] uppercase tracking-widest text-white/25 -mt-3 mb-5">Space to replay · as often as you like</p>

        {q.kind === 'choice' && q.bars ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {q.choices.map((c, i) => {
              const isAns = chosen !== null && c.id === q.answer;
              const isMine = chosen === c.id && !ok;
              return (
                <button key={c.id} disabled={chosen !== null} onClick={() => answer(c.id)}
                  className="rounded-2xl border p-2 text-left transition-colors"
                  style={{ borderColor: isAns ? '#22C55E' : isMine ? '#EF4444' : 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)' }}>
                  <span className="text-[9px] font-black text-white/35 ml-1">{i + 1}</span>
                  <RhythmBar bar={q.bars![c.id]} highlight={isAns ? '#22C55E' : isMine ? '#EF4444' : undefined} />
                </button>
              );
            })}
          </div>
        ) : q.kind === 'choice' ? (
          <div className={`grid gap-2 ${q.choices.length > 4 ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2'}`}>
            {q.choices.map((c, i) => {
              const isAns = chosen !== null && c.id === q.answer;
              const isMine = chosen === c.id && !ok;
              return (
                <motion.button key={c.id} whileTap={{ scale: 0.96 }} disabled={chosen !== null} onClick={() => answer(c.id)}
                  className="rounded-2xl border px-3 py-3 text-left transition-colors"
                  style={{
                    borderColor: isAns ? '#22C55E' : isMine ? '#EF4444' : 'rgba(255,255,255,0.1)',
                    background: isAns ? 'rgba(34,197,94,0.12)' : isMine ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                  }}>
                  <span className="block font-black text-base leading-tight">{c.label}</span>
                  {c.sub && <span className="block text-[10px] text-white/40 leading-snug mt-0.5">{c.sub}</span>}
                  <span className="text-[8px] text-white/20 font-bold">{i + 1}</span>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="flex justify-center gap-2 mb-4 min-h-[44px]">
              {Array.from({ length: q.length || 0 }).map((_, i) => {
                const target = q.answer.split(' ')[i];
                const mine = seq[i];
                const shown = chosen !== null ? target : mine;
                const right = chosen !== null && mine === target;
                return (
                  <div key={i} className="w-14 h-11 rounded-xl border flex items-center justify-center font-black"
                    style={{ borderColor: chosen === null ? 'rgba(255,255,255,0.15)' : right ? '#22C55E' : '#EF4444', color: chosen !== null && !right ? '#FCA5A5' : 'white' }}>
                    {shown || ''}
                  </div>
                );
              })}
            </div>
            {chosen === null && (
              <div className="flex flex-wrap justify-center gap-2">
                {q.pool!.map((syl, i) => (
                  <button key={syl} onClick={() => { if (seq.length < (q.length || 0)) { setSeq([...seq, syl]); note(60 + [0, 2, 4, 5, 7, 9, 11][['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'].indexOf(syl)], 0, 0.4, 0.35); } }}
                    className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] font-black">
                    {syl}<span className="text-[8px] text-white/25 ml-1">{i + 1}</span>
                  </button>
                ))}
                <button onClick={() => setSeq(seq.slice(0, -1))} className="px-3 py-2.5 rounded-xl border border-white/10 text-white/50" aria-label="Delete"><Delete size={16} /></button>
                <button onClick={submitSeq} disabled={seq.length !== q.length} className="px-4 py-2.5 rounded-xl font-black text-black disabled:opacity-30" style={{ background: ACCENT }}>Check</button>
              </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {chosen !== null && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl p-4" style={{ background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
              <p className="flex items-center gap-2 font-black">
                {ok ? <><Check size={16} className="text-green-400" /> Yes!</> : <><X size={16} className="text-red-400" /> Not quite — listen to both.</>}
              </p>
              <p className="text-sm text-white/65 mt-1 leading-relaxed">{q.explain(chosen)}</p>
              {q.anchor && <p className="text-[12px] mt-2" style={{ color: ACCENT }}>🎵 Remember it by: {q.anchor}</p>}
              {q.playChoice && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => { stopAll(); q.playChoice!(q.answer); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-500/40 text-green-300">
                    <Play size={11} /> {q.mode === 'degrees' ? 'Walk home' : 'Right answer'}
                  </button>
                  {!ok && (
                    <button onClick={() => { stopAll(); q.playChoice!(chosen); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-500/40 text-red-300">
                      <Play size={11} /> {q.mode === 'degrees' ? `${chosen} walking home` : 'Your answer'}
                    </button>
                  )}
                </div>
              )}
              <div className="flex justify-end mt-3">
                <button onClick={next} className="px-5 py-2 rounded-full font-black uppercase tracking-widest text-[10px] text-black" style={{ background: ACCENT }}>
                  {s.index + 1 >= s.total ? 'Finish' : 'Next'} ↵
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full font-black text-sm text-black z-50 shadow-2xl" style={{ background: ACCENT }}>
            ⬆ {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Echo: sing-back with live pitch feedback ───────────────────────────────────

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const nameOf = (m: number) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const RANGES = { low: [45, 57], mid: [52, 64], high: [57, 69] } as const;

const Echo: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [range, setRange] = useState<keyof typeof RANGES>('mid');
  const [target, setTarget] = useState(() => 57);
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [mic, setMic] = useState<MicHandle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [held, setHeld] = useState(0);
  const [score, setScore] = useState(0);
  const heldRef = useRef(0);
  const doneRef = useRef(false);

  const newTarget = useCallback((r = range) => {
    const [lo, hi] = RANGES[r];
    const t = lo + Math.floor(Math.random() * (hi - lo + 1));
    setTarget(t);
    heldRef.current = 0; setHeld(0); doneRef.current = false;
    note(t, 0, 1.4, 0.55);
  }, [range]);

  useEffect(() => () => mic?.stop(), [mic]);

  const toggleMic = async () => {
    if (mic) { mic.stop(); setMic(null); setReading(null); return; }
    try {
      setErr(null);
      const h = await listenPitch(r => {
        setReading(r);
        // "Octave-forgiving": a man singing a child's note an octave down is still in tune.
        const off = r ? ((r.midi + r.cents / 100 - target) % 12 + 18) % 12 - 6 : 99;
        if (r && Math.abs(off) < 0.4) {
          heldRef.current = Math.min(1, heldRef.current + 0.06);
          if (heldRef.current >= 1 && !doneRef.current) { doneRef.current = true; setScore(x => x + 1); note(target + 12, 0, 0.3, 0.3); }
        } else heldRef.current = Math.max(0, heldRef.current - 0.04);
        setHeld(heldRef.current);
      });
      setMic(h);
      newTarget();
    } catch {
      setErr('Microphone unavailable — check the browser permission and try again.');
    }
  };

  // Cents away from the target, folded into one octave, for the ladder.
  const off = reading ? ((reading.midi + reading.cents / 100 - target) % 12 + 18) % 12 - 6 : null;
  const y = off === null ? null : 50 - Math.max(-3, Math.min(3, off)) * 15;

  return (
    <div className="max-w-xl mx-auto">
      <button onClick={() => { mic?.stop(); onBack(); }} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white mb-4">
        <ChevronLeft size={14} /> Gym
      </button>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: ACCENT }}>🎤 Echo</p>
        <h3 className="text-xl font-black mt-1">Sing (or hum) the note back. Hold it until the bar fills.</h3>
        <div className="flex gap-1.5 mt-3">
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map(r => (
            <button key={r} onClick={() => { setRange(r); newTarget(r); }} className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border"
              style={range === r ? { borderColor: ACCENT, color: ACCENT } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}>
              {r === 'low' ? 'Low voice' : r === 'mid' ? 'Middle' : 'High voice'}
            </button>
          ))}
        </div>

        <div className="flex items-stretch gap-5 mt-6">
          <div className="relative w-16 h-56 rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
            <div className="absolute left-0 right-0 border-t-2" style={{ top: '50%', borderColor: ACCENT }} />
            <div className="absolute left-0 right-0 h-[12%] -translate-y-1/2" style={{ top: '50%', background: `${ACCENT}1a` }} />
            {y !== null && (
              <motion.div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full" animate={{ top: `${y}%` }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                style={{ background: Math.abs(off!) < 0.4 ? '#22C55E' : '#fff', boxShadow: '0 0 16px rgba(255,255,255,0.4)' }} />
            )}
          </div>
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/35 font-black">Target</p>
              <p className="text-4xl font-black">{nameOf(target)}</p>
              <p className="text-sm text-white/50 mt-2 h-5">
                {off === null ? (mic ? 'Listening…' : '') : Math.abs(off) < 0.4 ? 'Right on it — hold!' : off > 0 ? 'A little high — relax down' : 'A little low — lift up'}
              </p>
            </div>
            <div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full transition-[width]" style={{ width: `${held * 100}%`, background: '#22C55E' }} /></div>
              <p className="text-[10px] text-white/35 mt-1">Matched: {score}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-6">
          <button onClick={toggleMic} className="flex items-center gap-2 px-4 py-2.5 rounded-full font-black uppercase tracking-widest text-[10px] text-black" style={{ background: ACCENT }}>
            {mic ? <><MicOff size={13} /> Stop</> : <><Mic size={13} /> Start singing</>}
          </button>
          <button onClick={() => note(target, 0, 1.4, 0.55)} className="flex items-center gap-2 px-4 py-2.5 rounded-full font-black uppercase tracking-widest text-[10px] border border-white/15"><Play size={12} /> Hear it</button>
          <button onClick={() => newTarget()} className="px-4 py-2.5 rounded-full font-black uppercase tracking-widest text-[10px] border border-white/15">New note</button>
        </div>
        {err && <p className="text-sm text-red-300 mt-3">{err}</p>}
        <p className="text-[10px] text-white/30 mt-4 leading-relaxed">Any octave counts — sing wherever your voice is comfortable. Audio is analysed on this device and never recorded or uploaded.</p>
      </div>
    </div>
  );
};

export default EarGym;
