/**
 * PhilosophySchoolView — School of Philosophy Landing Page.
 *
 * Grounded in Choice A: The Campus Salon & Work Desk.
 * Aligned with PLAJAH_PHIL progression: Age 4 to university seminar.
 * Public domain primary texts throughout.
 *
 * Features:
 *  - "My Philosophy Desk": Context apron showing Question of the Week, philosophical streak, and assigned reading.
 *  - 4 Tabbed Workspaces:
 *     1. STRANDS: Wonder & Inquiry, Argument & Fallacies, Ethics, Formal Logic, History of Ideas
 *     2. LADDER: Wonder Circles (PreK) -> Inquiry (3-5) -> Fallacies (6-8) -> Ethics Bowl (9-12) -> Seminar (College)
 *     3. QUESTS: Spot the Fallacy, Socrates Trial reenactment, Ethics Bowl deliberation, Logic truth table
 *     4. TOOLS: forall x logic engine, OpenStax Intro to Philosophy, Stanford / Internet Encyclopedia links
 *  - Touch-First Mobile: Horizontal snap-carousels and 48px touch targets without overlapping.
 */
import React, { useState } from 'react';
import {
  ArrowLeft, Feather, Sparkles, BookOpen, ShieldCheck, GraduationCap,
  ChevronRight, Award, Brain, Compass, CheckCircle2,
  Layers, Play, Clock, HelpCircle, Lightbulb, Users
} from 'lucide-react';
import { PHILOSOPHY_SCHOOL } from '../data/philosophyCurriculum';
import SchoolView from './school/SchoolView';

interface Props {
  onBack: () => void;
  onNavigate?: (view: string) => void;
  user?: any;
  profile?: any;
}

type Tab = 'STRANDS' | 'LADDER' | 'QUESTS' | 'TOOLS';

const LADDER_STAGES = [
  { level: 'PreK & Kindergarten', age: 'Ages 4–6', icon: '🌱', title: 'Wonder Circles', desc: 'Is it ever OK to break a rule? Could a robot be your friend? Practicing giving reasons and listening.' },
  { level: 'Elementary School', age: 'Grades 3–5', icon: '❓', title: 'Structured Inquiry', desc: 'The question of the week. Distinguishing facts from opinions, preferences from moral claims.' },
  { level: 'Middle School', age: 'Grades 6–8', icon: '🔍', title: 'Fallacy Spotting & Dialogue', desc: 'Ad hominem, straw man, false dilemmas. Staging Socrates’ trial directly from Plato’s Apology.' },
  { level: 'High School (Ethics Bowl)', age: 'Grades 9–12', icon: '⚖️', title: 'Formal Logic & Ethics Bowl', desc: 'Truth tables, valid vs sound deductions, utilitarian vs deontological frameworks in real cases.' },
  { level: 'University Seminars', age: 'Higher Ed', icon: '🦉', title: 'Primary Texts & Epistemology', desc: 'Plato, Aristotle, Descartes, Spinoza, Locke, Kant, and Mill in open public-domain editions.' },
];

const PHIL_QUESTS = [
  {
    id: 'quest-fallacy-hunt',
    title: 'Spot the Fallacy Rapid Fire',
    band: 'Grades 6–12',
    emoji: '🔍',
    desc: 'Identify 10 logical fallacies hidden inside everyday political ads and news arguments in under 5 minutes.',
    duration: '15 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#A78BFA',
  },
  {
    id: 'quest-socrates-trial',
    title: 'Socrates Trial: The Apology Sprint',
    band: 'Grades 7–12',
    emoji: '🏛️',
    desc: 'Read Socrates’ actual defense speech from 399 BCE. Cross-examine Meletus and vote as an Athenian juror.',
    duration: '25 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#3B82F6',
  },
  {
    id: 'quest-ethics-bowl',
    title: 'Ethics Bowl Dilemma: AI & Autonomy',
    band: 'High School & Adult',
    emoji: '⚖️',
    desc: 'Deliberate on a complex modern dilemma where rights collide. Formulate your position with clear moral principles.',
    duration: '30 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#F59E0B',
  },
  {
    id: 'quest-truth-table',
    title: 'Formal Logic Truth Table Engine',
    band: 'College & Pro',
    emoji: '🧮',
    desc: 'Construct truth tables for compound propositions. Prove whether a challenging syllogism is valid or a tautology.',
    duration: '20 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#06D6A0',
  },
];

const PhilosophySchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<Tab>('STRANDS');
  const [viewingCurriculum, setViewingCurriculum] = useState(false);

  const totalLessons = PHILOSOPHY_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);

  if (viewingCurriculum) {
    return (
      <div className="min-h-full bg-[#08070c] text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
          <button
            onClick={() => setViewingCurriculum(false)}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:text-white transition-all min-h-[44px]"
          >
            <ArrowLeft size={16} /> Return to School Landing
          </button>
          <SchoolView curriculum={PHILOSOPHY_SCHOOL} embedded />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-28 selection:bg-[#A78BFA]/30">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Back Nav & School Badge */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all min-h-[44px]"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#C4B5FD]">
              <Feather size={13} /> School of Philosophy
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              Age 4 → Seminar
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(167,139,250,0.22) 0%, rgba(42,22,80,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#C4B5FD] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>The Examined Life</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              School of Philosophy
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              {PHILOSOPHY_SCHOOL.blurb}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A78BFA] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-[#1e1538] shadow-[0_0_30px_rgba(167,139,250,0.4)] hover:bg-[#c4b5fd] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <BookOpen size={18} /> Full Lesson Reader ({totalLessons})
              </button>
              <button
                onClick={() => setTab('QUESTS')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <Play size={18} fill="currentColor" /> Inquiry Quests & Dilemmas
              </button>
            </div>
          </div>
        </div>

        {/* "My Philosophy Desk" — Context Apron */}
        <div className="mb-8 rounded-3xl border border-[#A78BFA]/30 bg-gradient-to-r from-[#A78BFA]/10 via-transparent to-transparent p-5 sm:p-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-[#A78BFA] animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[#C4B5FD]">
                  My Philosophy Desk
                </h3>
              </div>
              <p className="mt-1 text-sm font-bold text-white/90">
                {profile?.displayName ? `${profile.displayName}'s Inquiry Workspace` : 'Dialectic & Reason Desk'}
              </p>
              <p className="text-xs text-white/50">
                Question of the Week: <span className="text-[#C4B5FD] font-serif italic">"Is a rule only valid if the governed consented to it?"</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Strands</p>
                <p className="text-base font-black text-white">{PHILOSOPHY_SCHOOL.tracks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Canon</p>
                <p className="text-base font-black text-[#C4B5FD]">Public Domain</p>
              </div>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="rounded-2xl bg-[#A78BFA]/20 border border-[#A78BFA]/40 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#C4B5FD] hover:bg-[#A78BFA]/30 transition-all min-h-[44px]"
              >
                Inquire
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'STRANDS', label: 'Curricular Strands', icon: Layers, count: PHILOSOPHY_SCHOOL.tracks.length },
            { id: 'LADDER', label: 'Age 4 → Seminar Ladder', icon: Award, count: LADDER_STAGES.length },
            { id: 'QUESTS', label: 'Inquiry Quests', icon: HelpCircle, count: PHIL_QUESTS.length },
            { id: 'TOOLS', label: 'Texts & Logic Engines', icon: BookOpen, count: 3 },
          ].map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as Tab)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shrink-0 min-h-[44px] ${
                  active
                    ? 'bg-[#A78BFA] text-[#1e1538] shadow-lg shadow-[#A78BFA]/20 font-black'
                    : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
                <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-black/20 text-black' : 'bg-white/10 text-white/50'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: STRANDS */}
        {tab === 'STRANDS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PHILOSOPHY_SCHOOL.tracks.map((track, i) => (
              <div
                key={track.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#A78BFA]/50 hover:bg-white/[0.04] transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-xs font-mono font-bold text-[#A78BFA]">Strand 0{i + 1}</span>
                    <span className="rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/50">
                      {track.lessons.length} lessons
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white group-hover:text-[#C4B5FD] transition-colors">
                    {track.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    {track.blurb}
                  </p>

                  <div className="mt-4 space-y-2">
                    {track.lessons.slice(0, 3).map(lesson => (
                      <div key={lesson.id} className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 size={13} className="text-[#A78BFA] shrink-0" />
                        <span className="truncate">{lesson.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setViewingCurriculum(true)}
                  className="mt-6 inline-flex items-center justify-between w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-white/80 hover:bg-[#A78BFA] hover:text-[#1e1538] transition-all min-h-[44px]"
                >
                  <span>Explore Lessons</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: LADDER */}
        {tab === 'LADDER' && (
          <div className="space-y-4">
            {LADDER_STAGES.map((s, idx) => (
              <div
                key={s.title}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#A78BFA]/40 transition-all"
              >
                <div className="flex items-start sm:items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#A78BFA]/10 text-2xl border border-[#A78BFA]/20">
                    {s.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#A78BFA]">Band 0{idx + 1}</span>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/50">{s.age}</span>
                    </div>
                    <h4 className="text-lg font-black text-white mt-0.5">{s.title}</h4>
                    <p className="text-xs text-white/60 mt-1 max-w-2xl">{s.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingCurriculum(true)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/70 hover:text-white hover:bg-white/10 transition-all shrink-0 min-h-[44px]"
                >
                  View Lessons
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: QUESTS */}
        {tab === 'QUESTS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PHIL_QUESTS.map(q => (
              <div
                key={q.id}
                className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-white/20 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-3xl">{q.emoji}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold bg-white/5 text-white/50 border border-white/10">
                      {q.band}
                    </span>
                  </div>
                  <h4 className="text-base font-black text-white">{q.title}</h4>
                  <p className="mt-2 text-xs text-white/60 leading-relaxed">{q.desc}</p>
                </div>
                <div className="mt-6">
                  <div className="flex items-center justify-between text-[11px] text-white/40 mb-3 font-mono">
                    <span className="flex items-center gap-1"><Clock size={12} /> {q.duration}</span>
                    <span>100 pts</span>
                  </div>
                  <button
                    onClick={() => setViewingCurriculum(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.06] hover:bg-[#A78BFA] hover:text-[#1e1538] py-3 text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
                  >
                    <Play size={13} fill="currentColor" /> Start Inquiry
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: TOOLS */}
        {tab === 'TOOLS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-[#A78BFA]/20 flex items-center justify-center text-[#A78BFA]">
                  <Brain size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">forall x: Open Logic Project</h4>
                  <p className="text-xs text-white/50">Formal deductive and symbolic logic textbook</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Open-source introduction to formal logic (P.D. Magnus / Calgary). Learn truth functional logic,
                first-order logic syntax, semantics, and natural deduction proofs.
              </p>
              <a
                href="https://forallx.openlogicproject.org/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A78BFA] px-6 py-3 text-xs font-black uppercase tracking-wider text-[#1e1538] hover:bg-[#c4b5fd] transition-all min-h-[44px]"
              >
                Open Logic Textbook
              </a>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center text-[#3B82F6]">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">OpenStax Introduction to Philosophy</h4>
                  <p className="text-xs text-white/50">Peer-reviewed open university introduction</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Covers epistemology, metaphysics, axiology, and social philosophy with clear definitions,
                historical overviews, and contemporary debate applications.
              </p>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[44px]"
              >
                Read OpenStax Text
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Touch-First Mobile Action Bar */}
      <div className="fixed bottom-0 inset-x-0 sm:hidden bg-[#07060c]/95 border-t border-white/10 p-3 backdrop-blur-xl z-30">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <button
            onClick={() => setViewingCurriculum(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A78BFA] py-3 text-xs font-black uppercase tracking-wider text-[#1e1538] min-h-[48px]"
          >
            <BookOpen size={16} /> Open Lessons
          </button>
          <button
            onClick={() => setTab('QUESTS')}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] py-3 text-xs font-black uppercase tracking-wider text-white min-h-[48px]"
          >
            <Play size={16} fill="currentColor" /> Quests
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhilosophySchoolView;
