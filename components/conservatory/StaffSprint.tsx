import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Lightbulb, Palette, Timer, Check, X, Lock } from 'lucide-react';
import { auth } from '../../services/backendService';
import { audio, note } from '../../services/musicPedagogy/earAudio';
import { recordMusicMastery } from '../../services/musicPedagogy/musicLedger';
import { StaffNote, NOTE_COLORS, stepOf, nameOfStep, naturalMidi, type Clef, type Letter } from './notation';

// ─────────────────────────────────────────────────────────────────────────────
// StaffSprint — note reading made simple.
//
// The landmark method: learn a few anchor notes cold (Middle C, Treble G, High C, Bass F, Low C),
// then read every other note as a step (line→space) or skip (line→line) away from the nearest one.
// That turns "memorise 30 positions" into "know 6, count a little" — far less to hold in working
// memory. Scaffolds that fade:
//   • colour-coded noteheads (on for the first levels, switched off by itself after a run of 8)
//   • a hint that ghosts the nearest landmark and says how far to count
// Every note SOUNDS when answered, so the symbol is always bound to its pitch (sound before symbol).
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = '#E0A458';
const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const GATE_N = 12, GATE_ACC = 0.9;
const KEY = (uid: string) => `staffSprint.v1.${uid}`;

const range = (lo: string, hi: string) => {
  const out: string[] = [];
  for (let s = stepOf(lo); s <= stepOf(hi); s++) out.push(nameOfStep(s));
  return out;
};

interface SprintLevel { label: string; clef: Clef | 'grand'; notes: string[]; landmarks: string[]; standardId: string }

export const SPRINT_LEVELS: SprintLevel[] = [
  { label: 'Treble landmarks', clef: 'treble', notes: ['C4', 'G4', 'C5'], landmarks: ['C4', 'G4', 'C5'], standardId: 'MUSIC.NOT.35' },
  { label: 'Treble — one octave', clef: 'treble', notes: range('C4', 'C5'), landmarks: ['C4', 'G4', 'C5'], standardId: 'MUSIC.NOT.35' },
  { label: 'Treble — whole staff', clef: 'treble', notes: range('C4', 'G5'), landmarks: ['C4', 'G4', 'C5', 'G5'], standardId: 'MUSIC.NOT.35' },
  { label: 'Bass landmarks', clef: 'bass', notes: ['C3', 'F3', 'C4'], landmarks: ['C3', 'F3', 'C4'], standardId: 'MUSIC.NOT.68' },
  { label: 'Bass — whole staff', clef: 'bass', notes: range('F2', 'C4'), landmarks: ['F2', 'C3', 'F3', 'C4'], standardId: 'MUSIC.NOT.68' },
  { label: 'Grand staff', clef: 'grand', notes: [...range('F2', 'C4'), ...range('C4', 'G5')], landmarks: ['F2', 'C3', 'F3', 'C4', 'G4', 'C5', 'G5'], standardId: 'MUSIC.NOT.68' },
  { label: 'Ledger lines', clef: 'grand', notes: [...range('C2', 'E2'), ...range('D4', 'E4'), ...range('A3', 'B3'), ...range('A5', 'C6')], landmarks: ['C2', 'F2', 'C4', 'C5', 'C6'], standardId: 'MUSIC.NOT.HS' },
];

interface SprintProgress { unlocked: number; recent: boolean[]; colorRun: number; best: number }

function load(uid: string): SprintProgress {
  try { const r = localStorage.getItem(KEY(uid)); if (r) return JSON.parse(r); } catch { /* */ }
  return { unlocked: 0, recent: [], colorRun: 0, best: 0 };
}

/** Which clef a note is read on at a grand-staff level (middle C goes either way). */
const clefFor = (lvl: SprintLevel, n: string): Clef =>
  lvl.clef !== 'grand' ? lvl.clef : stepOf(n) < stepOf('C4') ? 'bass' : stepOf(n) > stepOf('C4') ? 'treble' : (Math.random() < 0.5 ? 'treble' : 'bass');

function hintFor(n: string, clef: Clef, landmarks: string[]): { ghost?: string; text: string } {
  const pool = landmarks.filter(l => (clef === 'treble' ? stepOf(l) >= stepOf('C4') : stepOf(l) <= stepOf('C4')));
  const ghost = (pool.length ? pool : landmarks).reduce((a, b) => (Math.abs(stepOf(b) - stepOf(n)) < Math.abs(stepOf(a) - stepOf(n)) ? b : a));
  const d = stepOf(n) - stepOf(ghost);
  if (d === 0) return { text: `It IS a landmark: ${ghost[0]}.` };
  const dir = d > 0 ? 'up' : 'down';
  const kind = Math.abs(d) % 2 === 0 ? 'line-to-line or space-to-space skips' : 'a mix of steps';
  return { ghost, text: `Start from ${ghost[0]} (ghosted) and count ${Math.abs(d)} step${Math.abs(d) > 1 ? 's' : ''} ${dir} — ${kind}.` };
}

const StaffSprint: React.FC<{ startLevel?: number }> = ({ startLevel }) => {
  const uid = auth.currentUser?.uid || 'guest';
  const [prog, setProg] = useState<SprintProgress>(() => load(uid));
  const [level, setLevel] = useState(() => Math.min(startLevel ?? load(uid).unlocked, SPRINT_LEVELS.length - 1));
  const lvl = SPRINT_LEVELS[level];
  const [color, setColor] = useState(level <= 1);
  const [cur, setCur] = useState<{ n: string; clef: Clef }>(() => ({ n: lvl.notes[0], clef: clefFor(lvl, lvl.notes[0]) }));
  const [state, setState] = useState<'idle' | 'right' | 'wrong'>('idle');
  const [picked, setPicked] = useState<Letter | null>(null);
  const [hint, setHint] = useState(false);
  const [sprint, setSprint] = useState<{ endsAt: number; score: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [stats, setStats] = useState({ right: 0, total: 0 });
  const lastRef = useRef<string>('');

  const save = (p: SprintProgress) => { try { localStorage.setItem(KEY(uid), JSON.stringify(p)); } catch { /* */ } setProg({ ...p }); };

  const draw = useCallback((l = lvl) => {
    let n = l.notes[Math.floor(Math.random() * l.notes.length)];
    for (let i = 0; i < 4 && n === lastRef.current && l.notes.length > 1; i++) n = l.notes[Math.floor(Math.random() * l.notes.length)];
    lastRef.current = n;
    setCur({ n, clef: clefFor(l, n) });
    setState('idle'); setPicked(null); setHint(false);
  }, [lvl]);

  useEffect(() => { draw(SPRINT_LEVELS[level]); setColor(level <= 1); setStats({ right: 0, total: 0 }); }, [level]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sprint clock.
  useEffect(() => {
    if (!sprint) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [sprint]);
  const left = sprint ? Math.max(0, Math.ceil((sprint.endsAt - now) / 1000)) : 0;
  useEffect(() => {
    if (sprint && left === 0) {
      if (sprint.score > prog.best) save({ ...prog, best: sprint.score });
      setSprint(null);
    }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = useCallback((L: Letter) => {
    if (state !== 'idle') return;
    audio();
    const ok = L === cur.n[0];
    setPicked(L);
    setState(ok ? 'right' : 'wrong');
    note(naturalMidi(cur.n), 0, 0.9, 0.5); // the written note always sounds
    const p = { ...prog };
    p.recent = [...p.recent, ok].slice(-GATE_N);
    p.colorRun = ok && !hint ? p.colorRun + 1 : 0;
    if (color && p.colorRun >= 8) { setColor(false); p.colorRun = 0; }
    if (level === p.unlocked && p.unlocked < SPRINT_LEVELS.length - 1 && p.recent.length >= GATE_N && p.recent.filter(Boolean).length / p.recent.length >= GATE_ACC) {
      p.unlocked++; p.recent = [];
    }
    save(p);
    const nextStats = { right: stats.right + (ok ? 1 : 0), total: stats.total + 1 };
    setStats(nextStats);
    if (sprint && ok) setSprint({ ...sprint, score: sprint.score + 1 });
    if (nextStats.total % 10 === 0) {
      // Mastery within this level's standard: levels cleared in its group + accuracy here.
      const group = SPRINT_LEVELS.map((l, i) => (l.standardId === lvl.standardId ? i : -1)).filter(i => i >= 0);
      const mastery = (group.indexOf(level) + nextStats.right / nextStats.total) / group.length;
      void recordMusicMastery(lvl.standardId, mastery, `staff-sprint:L${level}`);
    }
    window.setTimeout(() => draw(), sprint ? (ok ? 350 : 900) : ok ? 650 : 1500);
  }, [state, cur, prog, hint, color, level, stats, sprint, lvl, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (LETTERS.includes(k as Letter)) answer(k as Letter);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer]);

  const h = useMemo(() => (hint ? hintFor(cur.n, cur.clef, lvl.landmarks) : null), [hint, cur, lvl]);
  const acc = stats.total ? Math.round((stats.right / stats.total) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6">
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>Staff Sprint</p>
        <h2 className="text-2xl font-black uppercase tracking-tight mt-1">Read notes like words</h2>
        <p className="text-sm text-white/45 mt-1.5 max-w-2xl">Learn a handful of landmark notes, then read everything else as a step or a skip from them. Type the letter (A–G) or tap it. You’ll hear every note you read.</p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {SPRINT_LEVELS.map((l, i) => {
            const locked = i > prog.unlocked;
            return (
              <button key={l.label} onClick={() => !locked && setLevel(i)} disabled={locked}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors disabled:opacity-30"
                style={level === i ? { background: `${ACCENT}22`, borderColor: ACCENT, color: ACCENT } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                {locked && <Lock size={9} />}{i + 1}. {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
          <span>{acc === null ? 'Ready' : `${stats.right}/${stats.total} · ${acc}%`}</span>
          {sprint ? <span style={{ color: ACCENT }}>{left}s · {sprint.score} notes</span> : <span>Best sprint: {prog.best}</span>}
        </div>

        <motion.div key={`${cur.n}${cur.clef}${stats.total}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          <StaffNote clef={cur.clef} note={cur.n} color={color} state={state} ghost={h?.ghost} />
        </motion.div>

        <div className="h-10 text-center text-sm mt-1">
          {state === 'right' && <span className="text-green-400 font-black flex items-center justify-center gap-1"><Check size={15} /> {cur.n[0]}</span>}
          {state === 'wrong' && <span className="text-red-300 font-bold flex items-center justify-center gap-1"><X size={15} /> That’s {cur.n[0]}, not {picked} — {hintFor(cur.n, cur.clef, lvl.landmarks).text}</span>}
          {state === 'idle' && h && <span className="text-white/55">{h.text}</span>}
        </div>

        <div className="grid grid-cols-7 gap-1.5 mt-2">
          {LETTERS.map(L => (
            <motion.button key={L} whileTap={{ scale: 0.92 }} onClick={() => answer(L)}
              className="h-14 rounded-xl font-black text-lg border transition-colors"
              style={{
                borderColor: color ? `${NOTE_COLORS[L]}88` : 'rgba(255,255,255,0.12)',
                background: picked === L ? (state === 'right' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)') : color ? `${NOTE_COLORS[L]}22` : 'rgba(255,255,255,0.04)',
              }}>
              {L}
            </motion.button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={() => setHint(true)} disabled={state !== 'idle'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/12 text-white/60 disabled:opacity-30">
            <Lightbulb size={12} /> Landmark hint
          </button>
          <button onClick={() => setColor(c => !c)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border"
            style={color ? { borderColor: ACCENT, color: ACCENT } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
            <Palette size={12} /> Colour notes {color ? 'on' : 'off'}
          </button>
          <button onClick={() => { audio(); setSprint({ endsAt: Date.now() + 60_000, score: 0 }); setNow(Date.now()); draw(); }} disabled={!!sprint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40" style={{ background: ACCENT }}>
            <Timer size={12} /> 60-second sprint
          </button>
        </div>
        <p className="text-[10px] text-white/30 mt-3">Colours switch off by themselves after 8 in a row — that’s the point where you no longer need them. Next level unlocks at {Math.round(GATE_ACC * 100)}% over {GATE_N} notes.</p>
      </div>
    </div>
  );
};

export default StaffSprint;
