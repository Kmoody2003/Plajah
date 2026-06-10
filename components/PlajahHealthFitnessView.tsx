import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart, Dumbbell, Apple, Brain, Activity, Zap, Search,
  ChevronRight, ExternalLink, RefreshCw, Plus, Minus,
  Target, TrendingUp, Award, Book, X, Check, Loader2,
  Droplets, Wind, Flame, Moon, Sun, Shield, Cpu,
  BarChart2, Bookmark, Share2, ArrowLeft, Filter, Sparkles,
  Coffee, ListMusic, Music2, Play, Pause,
} from 'lucide-react';
import CommunityPlaylistsView from './CommunityPlaylistsView';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Exercise {
  id: number;
  name: string;
  description: string;
  category: string;
  muscles: string[];
  equipment: string[];
  imageUrl?: string;
}

interface HealthTopic {
  title: string;
  url: string;
  snippet?: string;
  category: string;
}

interface WorkoutSet { reps: number; weight: number; }
interface LoggedExercise { exerciseId: number; name: string; sets: WorkoutSet[]; }
interface WorkoutDay { id: string; date: string; exercises: LoggedExercise[]; notes: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const WGER_BASE = 'https://wger.de/api/v2';

const BODY_SYSTEMS = [
  { id: 'cardiovascular', label: 'Cardiovascular', icon: Heart,    color: '#E63946', desc: 'Heart, blood vessels, circulation', img: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&q=80' },
  { id: 'musculoskeletal', label: 'Musculoskeletal', icon: Dumbbell, color: '#FF6B35', desc: 'Muscles, bones, joints', img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80' },
  { id: 'nervous',        label: 'Nervous System', icon: Brain,    color: '#7B2FBE', desc: 'Brain, spinal cord, nerves', img: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=400&q=80' },
  { id: 'digestive',      label: 'Digestive',      icon: Apple,    color: '#40C057', desc: 'Gut health, digestion, nutrition', img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&q=80' },
  { id: 'respiratory',    label: 'Respiratory',    icon: Wind,     color: '#00B4D8', desc: 'Lungs, breathing, oxygen', img: 'https://images.unsplash.com/photo-1550600975-b0b2c5e7b71e?w=400&q=80' },
  { id: 'endocrine',      label: 'Endocrine',      icon: Zap,      color: '#FFB514', desc: 'Hormones, glands, metabolism', img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80' },
  { id: 'immune',         label: 'Immune System',  icon: Shield,   color: '#06D6A0', desc: 'Immunity, inflammation, recovery', img: 'https://images.unsplash.com/photo-1583912267550-d974498b9a82?w=400&q=80' },
  { id: 'sleep',          label: 'Sleep & Recovery', icon: Moon,   color: '#748FFC', desc: 'Sleep quality, recovery, rest', img: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=400&q=80' },
];

const EXERCISE_CATEGORIES: Record<number, string> = {
  8: 'Arms', 9: 'Legs', 10: 'Abs', 11: 'Chest', 12: 'Back', 13: 'Shoulders', 14: 'Calves',
};

const MUSCLE_NAMES: Record<number, string> = {
  1: 'Biceps', 2: 'Anterior Deltoid', 3: 'Serratus Anterior', 4: 'Triceps',
  5: 'Abs', 6: 'Pectoralis Major', 7: 'Obliques', 8: 'Posterior Deltoid',
  9: 'Lats', 10: 'Glutes', 11: 'Hamstrings', 12: 'Quads', 13: 'Calves',
};

const EQUIPMENT_NAMES: Record<number, string> = {
  1: 'Barbell', 2: 'SZ-Bar', 3: 'Dumbbell', 4: 'Gym Mat', 5: 'Swiss Ball',
  6: 'Pull-up Bar', 7: 'Bench', 8: 'Incline Bench', 9: 'Kettlebell', 10: 'Cable',
};

const HEALTH_SOURCES = [
  { label: 'NIH MedlinePlus', url: 'https://medlineplus.gov', desc: 'US National Library of Medicine — authoritative health topics and drug info', color: '#00B4D8' },
  { label: 'CDC Health', url: 'https://www.cdc.gov/health-topics.html', desc: 'Centers for Disease Control — prevention, disease, public health', color: '#E63946' },
  { label: 'WHO Health Topics', url: 'https://www.who.int/health-topics', desc: 'World Health Organization — global health, disease, wellness', color: '#40C057' },
  { label: 'Harvard Health', url: 'https://www.health.harvard.edu', desc: 'Harvard Medical School publishing — research-backed health advice', color: '#C9082A' },
  { label: 'Mayo Clinic', url: 'https://www.mayoclinic.org', desc: 'Mayo Clinic — symptoms, diseases, treatments, drug info', color: '#FF6B35' },
  { label: 'WebMD', url: 'https://www.webmd.com', desc: 'Medical news, symptom checker, doctor finder', color: '#FF8C00' },
];

const FITNESS_SOURCES = [
  { label: 'WGER Exercise DB', url: 'https://wger.de', desc: 'Open-source exercise database with instructions and muscle maps', color: '#06D6A0' },
  { label: 'Examine.com', url: 'https://examine.com', desc: 'Evidence-based supplement and nutrition research', color: '#748FFC' },
  { label: 'PubMed Sports', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=exercise+sports+performance', desc: 'Peer-reviewed sports science research', color: '#00B4D8' },
  { label: 'NSCA', url: 'https://www.nsca.com', desc: 'National Strength & Conditioning Association', color: '#FF6B35' },
];

const LOG_KEY = (uid?: string) => `plajahFitnessLog_${uid ?? 'guest'}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cleanHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ─── Body system card ─────────────────────────────────────────────────────────
const SystemCard: React.FC<{ system: typeof BODY_SYSTEMS[0]; onClick: () => void }> = ({ system, onClick }) => {
  const Icon = system.icon;
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative flex flex-col gap-3 p-4 rounded-[1.5rem] border border-white/8 overflow-hidden text-left group hover:border-white/20 transition-all"
      style={{ background: `${system.color}08` }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `${system.color}12` }} />
      <div className="flex items-center gap-3 relative">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${system.color}18`, border: `1px solid ${system.color}30` }}>
          <Icon size={16} style={{ color: system.color }} />
        </div>
        <div>
          <p className="text-xs font-black text-white">{system.label}</p>
          <p className="text-[8px] text-white/40 mt-0.5 leading-tight">{system.desc}</p>
        </div>
      </div>
      <ChevronRight size={12} className="text-white/20 group-hover:text-white/50 transition-colors relative ml-auto" />
    </motion.button>
  );
};

// ─── Exercise card ────────────────────────────────────────────────────────────
const ExerciseCard: React.FC<{ exercise: Exercise; onAdd: () => void }> = ({ exercise, onAdd }) => (
  <div className="group flex gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:border-white/18 transition-all">
    {exercise.imageUrl ? (
      <img src={exercise.imageUrl} alt="" className="w-20 h-16 rounded-xl object-cover shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" />
    ) : (
      <div className="w-20 h-16 rounded-xl bg-[#06D6A0]/8 border border-[#06D6A0]/15 flex items-center justify-center shrink-0">
        <Dumbbell size={18} className="text-[#06D6A0]/50" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-xs font-black text-white leading-tight">{exercise.name}</p>
      {exercise.category && (
        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-[#06D6A0]/10 text-[#06D6A0]/80">
          {exercise.category}
        </span>
      )}
      {exercise.muscles.length > 0 && (
        <p className="text-[8px] text-white/30 mt-1.5">{exercise.muscles.slice(0, 3).join(' · ')}</p>
      )}
      {exercise.description && (
        <p className="text-[8px] text-white/25 mt-1 line-clamp-2 leading-relaxed">{exercise.description}</p>
      )}
    </div>
    <button
      onClick={onAdd}
      className="p-2 rounded-xl bg-[#06D6A0]/10 border border-[#06D6A0]/20 text-[#06D6A0] hover:bg-[#06D6A0]/20 transition-all shrink-0"
    >
      <Plus size={13} />
    </button>
  </div>
);

// ─── Fitness tracker ──────────────────────────────────────────────────────────
const WorkoutTracker: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const key = LOG_KEY(currentUser?.uid);
  const [log, setLog] = useState<WorkoutDay[]>([]);
  const [today, setToday] = useState<WorkoutDay | null>(null);
  const [addExerciseName, setAddExerciseName] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      const all: WorkoutDay[] = stored ? JSON.parse(stored) : [];
      setLog(all);
      const todayDate = new Date().toISOString().split('T')[0];
      const existing = all.find(d => d.date === todayDate);
      setToday(existing ?? { id: uid_short(), date: todayDate, exercises: [], notes: '' });
    } catch {}
  }, [key]);

  const save = (day: WorkoutDay) => {
    const todayDate = new Date().toISOString().split('T')[0];
    const updated = [
      { ...day },
      ...log.filter(d => d.date !== todayDate),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90);
    setLog(updated);
    setToday(day);
    try { localStorage.setItem(key, JSON.stringify(updated)); } catch {}
  };

  const addExercise = () => {
    if (!addExerciseName.trim() || !today) return;
    save({ ...today, exercises: [...today.exercises, { exerciseId: Date.now(), name: addExerciseName.trim(), sets: [{ reps: 10, weight: 0 }] }] });
    setAddExerciseName('');
  };

  const addSet = (exIdx: number) => {
    if (!today) return;
    const exs = today.exercises.map((e, i) => i === exIdx ? { ...e, sets: [...e.sets, { reps: 10, weight: 0 }] } : e);
    save({ ...today, exercises: exs });
  };

  const updateSet = (exIdx: number, setIdx: number, field: 'reps' | 'weight', val: number) => {
    if (!today) return;
    const exs = today.exercises.map((e, i) => i === exIdx
      ? { ...e, sets: e.sets.map((s, j) => j === setIdx ? { ...s, [field]: val } : s) }
      : e
    );
    save({ ...today, exercises: exs });
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    if (!today) return;
    const exs = today.exercises.map((e, i) => i === exIdx
      ? { ...e, sets: e.sets.filter((_, j) => j !== setIdx) }
      : e
    ).filter(e => e.sets.length > 0);
    save({ ...today, exercises: exs });
  };

  const totalVolume = today?.exercises.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + set.reps * (set.weight || 1), 0), 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Exercises', value: today?.exercises.length ?? 0, color: '#06D6A0' },
          { label: 'Total Sets', value: today?.exercises.reduce((s, e) => s + e.sets.length, 0) ?? 0, color: '#FF8C00' },
          { label: 'Vol. (lbs·reps)', value: totalVolume, color: '#748FFC' },
        ].map(s => (
          <div key={s.label} className="p-3 bg-white/[0.03] border border-white/8 rounded-2xl text-center">
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Add exercise */}
      <div className="flex gap-2">
        <input
          value={addExerciseName}
          onChange={e => setAddExerciseName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addExercise(); }}
          placeholder="Add exercise (e.g. Bench Press)…"
          className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#06D6A0]/40 transition-all"
        />
        <button onClick={addExercise} disabled={!addExerciseName.trim()}
          className="px-4 py-2 bg-[#06D6A0] disabled:opacity-40 text-black rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#06D6A0]/80 transition-all">
          Add
        </button>
      </div>

      {/* Today's exercises */}
      {(today?.exercises.length ?? 0) === 0 ? (
        <div className="py-8 text-center">
          <Dumbbell size={24} className="text-white/10 mx-auto mb-2" />
          <p className="text-[9px] text-white/20">No exercises logged today</p>
          <p className="text-[8px] text-white/12 mt-1">Add exercises above or use the library below</p>
        </div>
      ) : (
        <div className="space-y-3">
          {today!.exercises.map((ex, exIdx) => (
            <div key={exIdx} className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-white">{ex.name}</p>
                <button onClick={() => removeSet(exIdx, -1)}
                  className="text-[7px] font-black uppercase tracking-widest text-red-400/50 hover:text-red-400 transition-colors">
                  Remove
                </button>
              </div>
              {/* Sets */}
              <div className="space-y-1.5">
                {ex.sets.map((set, setIdx) => (
                  <div key={setIdx} className="flex items-center gap-2">
                    <span className="text-[7px] font-black text-white/25 w-6">{setIdx + 1}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-white/30">Reps</span>
                      <input
                        type="number" value={set.reps} min={0} max={999}
                        onChange={e => updateSet(exIdx, setIdx, 'reps', parseInt(e.target.value) || 0)}
                        className="w-12 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white text-center focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-white/30">lbs</span>
                      <input
                        type="number" value={set.weight} min={0} max={9999} step={2.5}
                        onChange={e => updateSet(exIdx, setIdx, 'weight', parseFloat(e.target.value) || 0)}
                        className="w-14 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white text-center focus:outline-none"
                      />
                    </div>
                    <button onClick={() => removeSet(exIdx, setIdx)} className="text-white/20 hover:text-red-400 transition-colors ml-auto">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => addSet(exIdx)}
                className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-[#06D6A0]/60 hover:text-[#06D6A0] transition-colors">
                <Plus size={10} /> Add Set
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recent workout history (last 7 days) */}
      {log.filter(d => d.date !== today?.date && d.exercises.length > 0).slice(0, 5).length > 0 && (
        <div className="space-y-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Recent Sessions</p>
          {log.filter(d => d.date !== today?.date && d.exercises.length > 0).slice(0, 5).map(d => (
            <div key={d.id} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
              <div>
                <p className="text-[9px] font-black text-white/60">{new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                <p className="text-[8px] text-white/30">{d.exercises.length} exercise{d.exercises.length !== 1 ? 's' : ''} · {d.exercises.reduce((s, e) => s + e.sets.length, 0)} sets</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main view ────────────────────────────────────────────────────────────────
interface Props {
  currentUser?: any;
  onBack?: () => void;
}

const MINDSET_PRACTICES = [
  { label: 'Journaling', icon: Book, color: '#748FFC', desc: 'Daily written reflection reduces cortisol and builds self-awareness over time.', practice: 'Write 3 things you\'re grateful for and one thing you\'ll improve today.' },
  { label: 'Visualization', icon: Target, color: '#FF8C00', desc: 'Mental rehearsal activates the same neural pathways as physical practice.', practice: 'Close your eyes for 5 minutes and vividly picture your ideal outcome.' },
  { label: 'Positive Self-Talk', icon: Sparkles, color: '#06D6A0', desc: 'Reframe negative inner dialogue with evidence-based affirmations.', practice: 'Replace "I can\'t" with "What would I need to make this possible?"' },
  { label: 'Cold Exposure', icon: Wind, color: '#00B4D8', desc: 'Cold showers and ice baths boost norepinephrine and dopamine levels.', practice: 'End your shower with 30 seconds of cold water — build to 2 minutes.' },
  { label: 'Gratitude Practice', icon: Heart, color: '#E63946', desc: 'Regular gratitude rewires the brain toward positive neural patterns.', practice: 'Name 3 specific things you\'re grateful for before you get out of bed.' },
  { label: 'Stoic Reflection', icon: Shield, color: '#9B5DE5', desc: 'Ancient Stoic practices build resilience and emotional regulation.', practice: 'Ask: "Is this in my control?" — if not, release it. Focus on what is.' },
];

// ─── Breathwork Module ────────────────────────────────────────────────────────

const BREATHWORK_PATTERNS = [
  { id: 'box', label: 'Box Breathing', phases: ['Inhale', 'Hold', 'Exhale', 'Hold'], durations: [4, 4, 4, 4], color: '#748FFC', desc: 'Used by Navy SEALs. Reduces stress and anxiety.' },
  { id: '478', label: '4-7-8 Breathing', phases: ['Inhale', 'Hold', 'Exhale', ''], durations: [4, 7, 8, 0], color: '#06D6A0', desc: 'Activates the parasympathetic nervous system for calm.' },
  { id: 'wim', label: 'Power Breathing', phases: ['Inhale', 'Hold', 'Exhale', ''], durations: [1, 0, 1, 0], color: '#FF6B35', desc: 'Energizing breathwork — increases alertness and energy.' },
];

const BreathworkModule: React.FC = () => {
  const [pattern, setPattern] = useState(BREATHWORK_PATTERNS[0]);
  const [phase, setPhase]     = useState(0);
  const [second, setSecond]   = useState(0);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles]   = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setRunning(false); setPhase(0); setSecond(0);
  }, []);

  const start = useCallback(() => {
    setRunning(true); setPhase(0); setSecond(0);
  }, []);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setSecond(prev => {
        const dur = pattern.durations[phase];
        if (prev + 1 >= dur) {
          const nextPhase = (phase + 1) % pattern.phases.length;
          setPhase(p => {
            const np = (p + 1) % pattern.phases.length;
            if (np === 0) setCycles(c => c + 1);
            return np;
          });
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, phase, pattern]);

  const dur = pattern.durations[phase];
  const progress = dur > 0 ? (second + 1) / dur : 1;
  const phaseLabel = pattern.phases[phase];
  const circumference = 2 * Math.PI * 54;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Wind size={13} className="text-[#00B4D8]" />
        <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/60">Breathwork Timer</h3>
      </div>

      {/* Pattern selector */}
      <div className="flex flex-wrap gap-2">
        {BREATHWORK_PATTERNS.map(p => (
          <button key={p.id} onClick={() => { stop(); setPattern(p); }}
            className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all"
            style={pattern.id === p.id
              ? { background: `${p.color}20`, border: `1px solid ${p.color}50`, color: p.color }
              : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-center">
        {/* SVG circle */}
        <div className="relative w-36 h-36 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx="60" cy="60" r="54" fill="none" stroke={pattern.color} strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - (running ? progress : 0))}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {running ? (
              <>
                <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: pattern.color }}>{phaseLabel || '·'}</p>
                <p className="text-2xl font-black text-white tabular-nums">{dur > 0 ? dur - second : '·'}</p>
                <p className="text-[7px] text-white/30">cycle {cycles + 1}</p>
              </>
            ) : (
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest text-center leading-relaxed px-2">{pattern.label}</p>
            )}
          </div>
        </div>

        {/* Info + controls */}
        <div className="flex-1 space-y-3">
          <p className="text-[9px] text-white/50 leading-relaxed">{pattern.desc}</p>
          <div className="flex flex-wrap gap-2">
            {pattern.phases.filter(Boolean).map((ph, i) => (
              <div key={ph} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[7px] font-black uppercase tracking-widest"
                style={{ background: `${pattern.color}10`, border: `1px solid ${pattern.color}20`, color: running && pattern.phases[phase] === ph ? pattern.color : 'rgba(255,255,255,0.35)' }}>
                {ph} {pattern.durations[i]}s
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {!running ? (
              <button onClick={start}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest text-black transition-all hover:scale-105 active:scale-95"
                style={{ background: pattern.color }}>
                <Play size={10} /> Start
              </button>
            ) : (
              <button onClick={stop}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/10 text-white/80 transition-all hover:bg-white/15">
                <Pause size={10} /> Stop
              </button>
            )}
            {cycles > 0 && !running && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/8">
                <Check size={9} className="text-[#06D6A0]" />
                <span className="text-[8px] text-white/50">{cycles} cycle{cycles !== 1 ? 's' : ''} completed</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PlajahHealthFitnessView: React.FC<Props> = ({ currentUser, onBack }) => {
  const [tab, setTab]                   = useState<'health' | 'fitness' | 'wellness'>('health');
  const [exercises, setExercises]       = useState<Exercise[]>([]);
  const [exLoading, setExLoading]       = useState(false);
  const [exSearch, setExSearch]         = useState('');
  const [exOffset, setExOffset]         = useState(0);
  const [hasMore, setHasMore]           = useState(true);
  const [categoryFilter, setCatFilter]  = useState<number | null>(null);
  const [activeSystem, setActiveSystem] = useState<typeof BODY_SYSTEMS[0] | null>(null);
  const [healthSearch, setHealthSearch] = useState('');
  const [healthResults, setHealthResults] = useState<HealthTopic[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showTracker, setShowTracker]   = useState(false);

  // ── Fetch exercises from WGER ───────────────────────────────────────────────
  const fetchExercises = useCallback(async (offset = 0, reset = false) => {
    setExLoading(true);
    try {
      const catParam = categoryFilter ? `&category=${categoryFilter}` : '';
      const searchParam = exSearch ? `&language=2&name=${encodeURIComponent(exSearch)}` : '&language=2';
      const res = await fetch(`${WGER_BASE}/exerciseinfo/?format=json${searchParam}${catParam}&limit=20&offset=${offset}`);
      const data = await res.json();
      const items: Exercise[] = (data.results ?? []).map((item: any) => ({
        id: item.id,
        name: item.translations?.find((t: any) => t.language === 2)?.name ?? item.name ?? `Exercise ${item.id}`,
        description: cleanHtml(item.translations?.find((t: any) => t.language === 2)?.description ?? item.description ?? '').slice(0, 200),
        category: EXERCISE_CATEGORIES[item.category?.id] ?? item.category?.name ?? 'General',
        muscles: (item.muscles ?? []).map((m: any) => MUSCLE_NAMES[m.id] ?? m.name_en ?? m.name ?? '').filter(Boolean),
        equipment: (item.equipment ?? []).map((e: any) => EQUIPMENT_NAMES[e.id] ?? e.name ?? '').filter(Boolean),
        imageUrl: item.images?.[0]?.image,
      }));
      setExercises(prev => reset ? items : [...prev, ...items]);
      setHasMore(!!data.next);
    } catch {
      // CORS or network issue — WGER may block browser fetch; show empty gracefully
      setExercises([]);
    } finally {
      setExLoading(false);
    }
  }, [categoryFilter, exSearch]);

  useEffect(() => {
    if (tab === 'fitness') { setExOffset(0); fetchExercises(0, true); }
  }, [tab, categoryFilter]);

  // ── MedlinePlus health topic search ────────────────────────────────────────
  const searchHealth = async (query: string) => {
    if (!query.trim()) { setHealthResults([]); return; }
    setHealthLoading(true);
    try {
      const res = await fetch(
        `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(query)}&retmax=10`,
        { headers: { Accept: 'application/xml' } }
      );
      const xml = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const results: HealthTopic[] = Array.from(doc.querySelectorAll('document')).map(el => ({
        title: el.querySelector('content[name="title"]')?.textContent?.trim() ?? '',
        url: el.getAttribute('url') ?? '',
        snippet: el.querySelector('content[name="FullSummary"], content[name="snippet"]')?.textContent?.replace(/<[^>]*>/g, '').trim().slice(0, 200) ?? '',
        category: el.querySelector('content[name="groupName"]')?.textContent?.trim() ?? 'Health',
      })).filter(r => r.title && r.url);
      setHealthResults(results);
    } catch {
      setHealthResults([]);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => searchHealth(healthSearch), 500);
    return () => clearTimeout(t);
  }, [healthSearch]);

  // Body system info lookup via Wikipedia/MedlinePlus
  const systemMedlinePlusMap: Record<string, string> = {
    cardiovascular: 'https://medlineplus.gov/heartdiseasesandcardiovasculardisease.html',
    musculoskeletal: 'https://medlineplus.gov/musclesandmusculardisorders.html',
    nervous: 'https://medlineplus.gov/braindisorders.html',
    digestive: 'https://medlineplus.gov/digestivediseases.html',
    respiratory: 'https://medlineplus.gov/lungdiseases.html',
    endocrine: 'https://medlineplus.gov/endocrinediseases.html',
    immune: 'https://medlineplus.gov/immunesystemandimmunedisorders.html',
    sleep: 'https://medlineplus.gov/sleepdisorders.html',
  };

  const addExerciseToTracker = (ex: Exercise) => {
    setShowTracker(true);
  };

  if (activeSystem) {
    return (
      <div className="min-h-screen text-white">
        <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5 px-5 py-3 flex items-center gap-3">
          <button onClick={() => setActiveSystem(null)} className="text-white/30 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: `${activeSystem.color}18` }}>
            <activeSystem.icon size={13} style={{ color: activeSystem.color }} />
          </div>
          <h2 className="font-black text-sm text-white">{activeSystem.label}</h2>
        </div>
        <div className="max-w-3xl mx-auto px-5 py-8 space-y-6">
          <div className="relative h-48 rounded-[2rem] overflow-hidden">
            <img src={activeSystem.img} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="absolute bottom-4 left-6">
              <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: activeSystem.color }}>Body System</p>
              <h1 className="text-3xl font-black uppercase">{activeSystem.label}</h1>
              <p className="text-sm text-white/50 mt-1">{activeSystem.desc}</p>
            </div>
          </div>
          {/* Quick facts */}
          <div className="p-5 bg-white/[0.03] border border-white/8 rounded-2xl space-y-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Overview</p>
            <p className="text-sm text-white/60 leading-relaxed">
              {activeSystem.id === 'cardiovascular' && 'The cardiovascular system is responsible for circulating blood throughout the body. It consists of the heart, blood vessels, and blood. Regular aerobic exercise strengthens the heart muscle, lowers resting heart rate, and improves overall circulation.'}
              {activeSystem.id === 'musculoskeletal' && 'The musculoskeletal system provides form, support, stability, and movement to the body. Resistance training increases muscle mass, bone density, and improves joint stability. Proper protein intake (0.7–1g/lb of bodyweight) is essential for muscle repair and growth.'}
              {activeSystem.id === 'nervous' && 'The nervous system coordinates body functions and responses. Exercise promotes neuroplasticity, releases BDNF (Brain-Derived Neurotrophic Factor) which supports neuron growth, and improves cognitive function, mood, and stress resilience.'}
              {activeSystem.id === 'digestive' && 'The digestive system breaks down food into nutrients the body can absorb. Fiber intake, probiotic foods, and adequate hydration support gut microbiome diversity. Regular physical activity improves gut motility and reduces risk of colorectal conditions.'}
              {activeSystem.id === 'respiratory' && 'The respiratory system brings oxygen into the body and removes carbon dioxide. Aerobic training increases lung efficiency, VO2 max, and respiratory muscle endurance. Deep breathing practices improve oxygen delivery and reduce stress response.'}
              {activeSystem.id === 'endocrine' && 'The endocrine system regulates hormones throughout the body. Exercise influences cortisol, testosterone, growth hormone, and insulin sensitivity. Sleep quality is critical for hormone regulation — poor sleep disrupts hormonal balance.'}
              {activeSystem.id === 'immune' && 'The immune system defends the body against pathogens. Moderate exercise boosts immune function, while overtraining can suppress it. Adequate zinc, vitamin C, D, and sleep are key immune support nutrients.'}
              {activeSystem.id === 'sleep' && 'Sleep is when the body repairs, consolidates memory, and regulates hormones. 7-9 hours of quality sleep is recommended for adults. Exercise improves sleep quality, but intense workouts within 2 hours of bedtime may delay sleep onset.'}
            </p>
          </div>
          {/* Link to authoritative source */}
          <a
            href={systemMedlinePlusMap[activeSystem.id]}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 bg-[#00B4D8]/5 border border-[#00B4D8]/20 rounded-2xl hover:border-[#00B4D8]/40 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#00B4D8]/12 flex items-center justify-center">
                <Book size={14} className="text-[#00B4D8]" />
              </div>
              <div>
                <p className="text-xs font-black text-white">NIH MedlinePlus</p>
                <p className="text-[8px] text-white/35">Authoritative health information — US National Library of Medicine</p>
              </div>
            </div>
            <ExternalLink size={13} className="text-white/30" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      {/* ── Sticky header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/5 px-5 lg:px-10 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="text-white/30 hover:text-white transition-colors">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-[#E63946]/12 flex items-center justify-center border border-[#E63946]/25">
              <Heart size={14} className="text-[#E63946]" />
            </div>
            <h1 className="text-base font-black uppercase tracking-widest text-white">Plajah Health & Fitness</h1>
          </div>
          <button
            onClick={() => setShowTracker(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${showTracker ? 'bg-[#06D6A0]/15 border-[#06D6A0]/30 text-[#06D6A0]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
          >
            <Activity size={12} /> Tracker
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-5 lg:px-10 py-6 space-y-8">

        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-[2.5rem] h-52 sm:h-64">
          <img
            src="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1400&q=80"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-6 sm:p-8 max-w-2xl">
            <span className="px-3 py-1 rounded-xl bg-[#E63946]/80 text-[8px] font-black uppercase tracking-widest text-white mb-3 inline-block">
              Plajah Health & Fitness
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight text-white">
              Your Body.<br />Your Performance.
            </h2>
            <p className="text-sm text-white/50 mt-2">Explore body systems, exercise science, nutrition, and track your fitness journey.</p>
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
        <div className="flex gap-2 border-b border-white/8 pb-px">
          {([
            { id: 'health',   label: 'Health',   icon: Heart,     color: '#E63946' },
            { id: 'fitness',  label: 'Fitness',  icon: Dumbbell,  color: '#06D6A0' },
            { id: 'wellness', label: 'Wellness', icon: Sparkles,  color: '#748FFC' },
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-2xl text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${tab === t.id ? 'border-current' : 'border-transparent text-white/30 hover:text-white/60'}`}
                style={tab === t.id ? { color: t.color } : {}}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Main content ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-8">

          <div className="space-y-8 min-w-0">

            {/* ── HEALTH TAB ───────────────────────────────────────────────── */}
            {tab === 'health' && (
              <div className="space-y-8">

                {/* Body systems */}
                <div className="space-y-4">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">Body Systems</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {BODY_SYSTEMS.map(sys => (
                      <SystemCard key={sys.id} system={sys} onClick={() => setActiveSystem(sys)} />
                    ))}
                  </div>
                </div>

                {/* MedlinePlus search */}
                <div className="space-y-4">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                    <Search size={10} /> Health Topics Search
                  </h3>
                  <div className="relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input
                      value={healthSearch}
                      onChange={e => setHealthSearch(e.target.value)}
                      placeholder="Search health topics (e.g. hypertension, diabetes, exercise)…"
                      className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/8 rounded-2xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#E63946]/40 transition-colors"
                    />
                  </div>
                  {healthLoading && (
                    <div className="flex items-center gap-2 text-white/30 text-xs">
                      <Loader2 size={13} className="animate-spin" /> Searching NIH MedlinePlus…
                    </div>
                  )}
                  {healthResults.length > 0 && (
                    <div className="space-y-2">
                      {healthResults.map(r => (
                        <a key={r.url} href={r.url} target="_blank" rel="noreferrer"
                          className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-2xl hover:border-[#E63946]/25 hover:bg-white/[0.05] transition-all group">
                          <div className="w-7 h-7 rounded-xl bg-[#E63946]/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Heart size={11} className="text-[#E63946]/70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-white group-hover:text-[#E63946] transition-colors">{r.title}</p>
                            {r.snippet && <p className="text-[8px] text-white/35 mt-1 line-clamp-2 leading-relaxed">{r.snippet}</p>}
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/25 mt-1">{r.category}</p>
                          </div>
                          <ExternalLink size={11} className="text-white/20 group-hover:text-[#E63946] transition-colors shrink-0 mt-0.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Authoritative health sources */}
                <div className="space-y-3">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">Health Resources</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {HEALTH_SOURCES.map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
                        className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-2xl hover:border-white/18 transition-all group">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                          <Shield size={13} style={{ color: s.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-white">{s.label}</p>
                          <p className="text-[8px] text-white/35 mt-0.5 leading-relaxed">{s.desc}</p>
                        </div>
                        <ExternalLink size={11} className="text-white/20 group-hover:text-white/50 transition-colors shrink-0 mt-0.5" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── FITNESS TAB ──────────────────────────────────────────────── */}
            {tab === 'fitness' && (
              <div className="space-y-6">

                {/* Category filter */}
                <div className="space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Filter by Category</p>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    <button
                      onClick={() => setCatFilter(null)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border ${!categoryFilter ? 'bg-[#06D6A0] border-[#06D6A0] text-black' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                    >
                      All
                    </button>
                    {Object.entries(EXERCISE_CATEGORIES).map(([id, name]) => (
                      <button
                        key={id}
                        onClick={() => { setCatFilter(Number(id)); setExOffset(0); }}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border ${categoryFilter === Number(id) ? 'bg-[#06D6A0] border-[#06D6A0] text-black' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exercise search */}
                <div className="relative">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input
                    value={exSearch}
                    onChange={e => { setExSearch(e.target.value); setExOffset(0); }}
                    onKeyDown={e => { if (e.key === 'Enter') fetchExercises(0, true); }}
                    placeholder="Search exercises (e.g. squat, bicep curl)…"
                    className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/8 rounded-2xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#06D6A0]/40 transition-colors"
                  />
                </div>

                {/* Exercise list */}
                {exLoading && exercises.length === 0 ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-[1.5rem] animate-pulse" />)}
                  </div>
                ) : exercises.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <Dumbbell size={28} className="text-white/10 mx-auto" />
                    <p className="text-[9px] text-white/20">No exercises found — try a different search or category</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {exercises.map(ex => (
                      <ExerciseCard key={ex.id} exercise={ex} onAdd={() => addExerciseToTracker(ex)} />
                    ))}
                    {hasMore && (
                      <button
                        onClick={() => { const next = exOffset + 20; setExOffset(next); fetchExercises(next); }}
                        disabled={exLoading}
                        className="w-full py-3 rounded-2xl bg-white/[0.03] border border-white/8 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/18 transition-all disabled:opacity-40"
                      >
                        {exLoading ? 'Loading…' : 'Load More Exercises'}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Workout Playlists ─────────────────────────────────── */}
                <div className="pt-4 border-t border-white/5">
                  <CommunityPlaylistsView
                    currentUser={currentUser ?? null}
                    initialTag="workout"
                    embedded
                  />
                </div>

                {/* Fitness sources */}
                <div className="space-y-3 pt-4 border-t border-white/5">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Fitness Resources</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {FITNESS_SOURCES.map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
                        className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/6 rounded-2xl hover:border-white/14 transition-all group">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${s.color}12` }}>
                          <Dumbbell size={11} style={{ color: s.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-white">{s.label}</p>
                          <p className="text-[7px] text-white/30 mt-0.5 leading-relaxed">{s.desc}</p>
                        </div>
                        <ExternalLink size={10} className="text-white/15 shrink-0 mt-0.5" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── WELLNESS TAB ─────────────────────────────────────────────── */}
            {tab === 'wellness' && (
              <div className="space-y-10">

                {/* Breathwork */}
                <BreathworkModule />

                {/* Meditation section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Brain size={13} className="text-[#748FFC]" />
                    <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/60">Meditation & Mindfulness</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { title: 'Headspace', url: 'https://www.headspace.com', desc: 'Guided meditation, focus, and sleep content', color: '#F97316', img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80' },
                      { title: 'Insight Timer', url: 'https://insighttimer.com', desc: 'Free meditation library — 100,000+ guided sessions', color: '#748FFC', img: 'https://images.unsplash.com/photo-1545389336-cf090694435e?w=400&q=80' },
                      { title: 'Calm', url: 'https://www.calm.com', desc: 'Sleep stories, breathing exercises, relaxation music', color: '#06B6D4', img: 'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=400&q=80' },
                      { title: 'Waking Up', url: 'https://www.wakingup.com', desc: 'Science-based meditation by Sam Harris', color: '#9B5DE5', img: 'https://images.unsplash.com/photo-1528715471579-d1bcf0ba5e83?w=400&q=80' },
                    ].map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
                        className="group relative flex gap-4 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:border-white/18 transition-all overflow-hidden">
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `${s.color}08` }} />
                        <img src={s.img} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0 relative" loading="lazy" />
                        <div className="relative flex-1 min-w-0">
                          <p className="text-xs font-black text-white">{s.title}</p>
                          <p className="text-[8px] text-white/35 mt-0.5 leading-relaxed">{s.desc}</p>
                          <div className="flex items-center gap-1 mt-2 text-[7px] font-black uppercase tracking-widest" style={{ color: s.color }}>
                            Open <ExternalLink size={8} />
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Mindset & motivation */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap size={13} className="text-[#FF8C00]" />
                    <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/60">Mindset & Motivation</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {MINDSET_PRACTICES.map(p => (
                      <div key={p.label} className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl space-y-2 group hover:border-white/14 transition-all">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${p.color}12`, border: `1px solid ${p.color}20` }}>
                            <p.icon size={14} style={{ color: p.color }} />
                          </div>
                          <p className="text-xs font-black text-white">{p.label}</p>
                        </div>
                        <p className="text-[8px] text-white/40 leading-relaxed">{p.desc}</p>
                        {p.practice && (
                          <div className="p-2.5 bg-white/[0.03] rounded-xl border border-white/5">
                            <p className="text-[8px] text-white/50 italic leading-relaxed">"{p.practice}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sleep hygiene */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Moon size={13} className="text-[#9B5DE5]" />
                    <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/60">Sleep & Recovery</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { tip: 'Consistent sleep schedule', desc: 'Same bed/wake time every day — even weekends. Anchors your circadian rhythm.', icon: Sun, color: '#FFB514' },
                      { tip: 'Screen-free wind-down', desc: '30–60 min before bed: dim lights, no blue light, avoid news and social media.', icon: Moon, color: '#748FFC' },
                      { tip: 'Keep it cool', desc: 'Bedroom temperature 65–68°F (18–20°C) is optimal for deep sleep.', icon: Wind, color: '#00B4D8' },
                      { tip: 'Limit caffeine after 2 PM', desc: 'Caffeine has a 5–7 hour half-life. An afternoon coffee stays in your system at 10 PM.', icon: Coffee, color: '#A0522D' },
                      { tip: 'Magnesium glycinate', desc: 'Research supports magnesium for sleep quality. 200–400mg before bed.', icon: Sparkles, color: '#06D6A0' },
                      { tip: 'Progressive muscle relaxation', desc: 'Tense and release each muscle group from feet to head. Reduces physical and mental tension.', icon: Heart, color: '#E63946' },
                    ].map(s => {
                      const Icon = s.icon;
                      return (
                        <div key={s.tip} className="flex gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-2xl">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${s.color}12` }}>
                            <Icon size={13} style={{ color: s.color }} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-white">{s.tip}</p>
                            <p className="text-[8px] text-white/40 mt-0.5 leading-relaxed">{s.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Wellness playlists */}
                <div className="pt-4 border-t border-white/5">
                  <CommunityPlaylistsView
                    currentUser={currentUser ?? null}
                    initialTag="wellness"
                    embedded
                  />
                </div>

                {/* Meditation playlists */}
                <div className="pt-2">
                  <CommunityPlaylistsView
                    currentUser={currentUser ?? null}
                    initialTag="meditation"
                    embedded
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar ───────────────────────────────────────────────── */}
          <aside className="space-y-5 hidden xl:block">

            {/* Workout tracker sidebar */}
            <div className="bg-white/[0.03] border border-white/8 rounded-[2rem] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Activity size={13} className="text-[#06D6A0]" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Today's Workout</h3>
                </div>
                <span className="text-[7px] font-black uppercase tracking-widest text-white/25">
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="p-4">
                <WorkoutTracker currentUser={currentUser} />
              </div>
            </div>

            {/* Health targets reference */}
            <div className="bg-white/[0.03] border border-white/8 rounded-[2rem] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2.5">
                <Target size={13} className="text-[#FF8C00]" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Health Targets</h3>
              </div>
              <div className="p-4 space-y-3">
                {[
                  { label: 'Resting Heart Rate', target: '60–100 bpm', ideal: '50–70 bpm', color: '#E63946' },
                  { label: 'Daily Steps', target: '7,000–10,000', ideal: '10,000+', color: '#FF8C00' },
                  { label: 'Sleep (adults)', target: '7–9 hours', ideal: '8 hours', color: '#748FFC' },
                  { label: 'Hydration', target: '2–3L daily', ideal: '0.033L × weight (kg)', color: '#00B4D8' },
                  { label: 'Protein Intake', target: '0.8g/kg body wt', ideal: '1.6–2.2g/kg active', color: '#06D6A0' },
                  { label: 'Cardio / Week', target: '150 min moderate', ideal: '75 min vigorous', color: '#40C057' },
                  { label: 'Strength Training', target: '2–3× / week', ideal: 'Progressive overload', color: '#FFB514' },
                ].map(t => (
                  <div key={t.label} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <p className="text-[9px] font-black text-white/80">{t.label}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-white/35">{t.target}</span>
                      <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                        style={{ background: `${t.color}15`, color: t.color }}>
                        {t.ideal}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connect fitness tracker placeholder */}
            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[2rem] p-5 text-center space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
                <Cpu size={16} className="text-white/20" />
              </div>
              <p className="text-[10px] font-black text-white/40">Connect Fitness Tracker</p>
              <p className="text-[8px] text-white/20 leading-relaxed">Apple Health, Google Fit, Garmin, and Fitbit integrations coming soon</p>
              <button disabled className="w-full py-2 rounded-xl bg-white/5 text-[8px] font-black uppercase tracking-widest text-white/20 cursor-not-allowed">
                Connect Device
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Mobile workout tracker drawer ──────────────────────────────────────── */}
      <AnimatePresence>
        {showTracker && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 xl:hidden" onClick={() => setShowTracker(false)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 40 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] bg-[#0d0d0d] border-t border-white/10 rounded-t-[2rem] overflow-hidden xl:hidden"
            >
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Activity size={13} className="text-[#06D6A0]" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Today's Workout</h3>
                </div>
                <button onClick={() => setShowTracker(false)} className="text-white/30 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
                <WorkoutTracker currentUser={currentUser} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlajahHealthFitnessView;
