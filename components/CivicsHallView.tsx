/**
 * CivicsHallView — Civics Hall: The Long Argument of Liberty Landing Page.
 *
 * Grounded in Choice A: The Campus Salon & Work Desk.
 * Aligned with NCSS C3 Social Studies Framework.
 * Primary-source spine with verbatim historic documents (1215 -> Present).
 *
 * Features:
 *  - "My Civics Desk": Context apron showing current document in focus, debate streak, and C3 standard mastery.
 *  - 4 Tabbed Workspaces:
 *     1. STRANDS: Foundations of Liberty, Government Structure, Rights, Civic Action, Living Constitution, Comparative
 *     2. LADDER: PreK Class Constitution -> Middle School Mock Trial -> Federalist Verbatim -> Comparative 7 Nations
 *     3. QUESTS: Class constitution sprint, Federalist debate, Supreme Court moot court, Comparative constitution audit
 *     4. TOOLS: Telescoping Founding Documents reader, Constitution Annotated, Library of Congress archive
 *  - Touch-First Mobile: Horizontal snap-carousels and 48px touch targets without overlapping.
 */
import React, { useState } from 'react';
import {
  ArrowLeft, Landmark, Sparkles, BookOpen, ShieldCheck, GraduationCap,
  ChevronRight, Award, Scroll, Scale, CheckCircle2,
  Layers, Play, Clock, FileText, Globe, Users
} from 'lucide-react';
import { CIVICS_HALL } from '../data/civicsCurriculum';
import SchoolView from './school/SchoolView';

interface Props {
  onBack: () => void;
  onNavigate?: (view: string) => void;
  user?: any;
  profile?: any;
}

type Tab = 'STRANDS' | 'LADDER' | 'QUESTS' | 'TOOLS';

const LADDER_STAGES = [
  { level: 'PreK & Early Elementary', age: 'Ages 4–7', icon: '🤝', title: 'Rules We Make Together', desc: 'Why do we take turns? Build a class constitution that every student agrees to and signs.' },
  { level: 'Elementary School', age: 'Grades 3–5', icon: '📜', title: 'Magna Carta & The Branches', desc: 'The King signs a paper in 1215. How the three branches check each other through games and stories.' },
  { level: 'Middle School', age: 'Grades 6–8', icon: '⚖️', title: 'Locke, Paine & Mock Trials', desc: 'Read John Locke in plain modern prose. Stage a mock trial examining due process and jury rights.' },
  { level: 'High School (AP Gov Track)', age: 'Grades 9–12', icon: '🏛️', title: 'The Federalist Debates Verbatim', desc: 'Federalist 10, 51, and 78 verbatim. Analyze the Anti-Federalist objections that demanded a Bill of Rights.' },
  { level: 'Comparative & Law', age: 'College & Pro', icon: '🌍', title: 'Seven Nations’ Constitutions', desc: 'Compare the American, German, South African, and Japanese founding texts side-by-side.' },
];

const CIVICS_QUESTS = [
  {
    id: 'quest-class-constitution',
    title: 'Class Constitution Drafting Sprint',
    band: 'PreK–5',
    emoji: '✍️',
    desc: 'Draft 3 core rights and 3 collective responsibilities for your learning community.',
    duration: '20 min',
    tool: 'HISTORY_QUEST',
    accent: '#D40055',
  },
  {
    id: 'quest-federalist-debate',
    title: 'Federalist 10 vs 51 Faction Challenge',
    band: 'Grades 9–12',
    emoji: '⚔️',
    desc: 'Debate whether large republics control factions better than direct democracies.',
    duration: '25 min',
    tool: 'HISTORY_QUEST',
    accent: '#3B82F6',
  },
  {
    id: 'quest-moot-court',
    title: 'Supreme Court Moot Court Simulation',
    band: 'High School & Adult',
    emoji: '⚖️',
    desc: 'Examine a contested 1st Amendment speech case. Write the majority and dissenting opinions.',
    duration: '30 min',
    tool: 'HISTORY_QUEST',
    accent: '#8B5CF6',
  },
  {
    id: 'quest-comparative-audit',
    title: '7-Nation Constitution Audit',
    band: 'College & Pro',
    emoji: '🌐',
    desc: 'Audit how positive rights (health, education) vs negative rights (speech) are framed globally.',
    duration: '35 min',
    tool: 'HISTORY_QUEST',
    accent: '#06D6A0',
  },
];

const CivicsHallView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<Tab>('STRANDS');
  const [viewingCurriculum, setViewingCurriculum] = useState(false);

  const totalLessons = CIVICS_HALL.tracks.reduce((n, t) => n + t.lessons.length, 0);

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
          <SchoolView curriculum={CIVICS_HALL} embedded />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-28 selection:bg-[#D40055]/30">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D40055]/30 bg-[#D40055]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#FDA4AF]">
              <Landmark size={13} /> Civics Hall
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              Primary Source Canon
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(212,0,85,0.22) 0%, rgba(61,0,24,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#FDA4AF] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>The Long Argument of Liberty</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Civics Hall
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              {CIVICS_HALL.blurb}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D40055] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(212,0,85,0.4)] hover:bg-[#e11d48] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <BookOpen size={18} /> Full Lesson Reader ({totalLessons})
              </button>
              <button
                onClick={() => setTab('QUESTS')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <Play size={18} fill="currentColor" /> Civics Quests & Debates
              </button>
            </div>
          </div>
        </div>

        {/* "My Civics Desk" — Context Apron */}
        <div className="mb-8 rounded-3xl border border-[#D40055]/30 bg-gradient-to-r from-[#D40055]/10 via-transparent to-transparent p-5 sm:p-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-[#D40055] animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[#FDA4AF]">
                  My Civics Desk
                </h3>
              </div>
              <p className="mt-1 text-sm font-bold text-white/90">
                {profile?.displayName ? `${profile.displayName}'s Constitution Desk` : 'Civic Inquiry Desk'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                <span>Core Sources:</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[#FDA4AF]">National Archives</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[#93C5FD]">Library of Congress</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[#6EE7B7]">7 World Constitutions</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Strands</p>
                <p className="text-base font-black text-white">{CIVICS_HALL.tracks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Standards</p>
                <p className="text-base font-black text-[#FDA4AF]">NCSS C3</p>
              </div>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="rounded-2xl bg-[#D40055]/20 border border-[#D40055]/40 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#FDA4AF] hover:bg-[#D40055]/30 transition-all min-h-[44px]"
              >
                Read Texts
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'STRANDS', label: 'Curricular Strands', icon: Layers, count: CIVICS_HALL.tracks.length },
            { id: 'LADDER', label: 'PreK → Comparative Ladder', icon: Award, count: LADDER_STAGES.length },
            { id: 'QUESTS', label: 'Civic Quests & Mock Trials', icon: Scale, count: CIVICS_QUESTS.length },
            { id: 'TOOLS', label: 'Primary Texts & Tools', icon: Scroll, count: 3 },
          ].map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as Tab)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shrink-0 min-h-[44px] ${
                  active
                    ? 'bg-[#D40055] text-white shadow-lg shadow-[#D40055]/20 font-black'
                    : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
                <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: STRANDS */}
        {tab === 'STRANDS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CIVICS_HALL.tracks.map((track, i) => (
              <div
                key={track.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#D40055]/50 hover:bg-white/[0.04] transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-xs font-mono font-bold text-[#D40055]">Strand 0{i + 1}</span>
                    <span className="rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/50">
                      {track.lessons.length} lessons
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white group-hover:text-[#FDA4AF] transition-colors">
                    {track.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    {track.blurb}
                  </p>

                  <div className="mt-4 space-y-2">
                    {track.lessons.slice(0, 3).map(lesson => (
                      <div key={lesson.id} className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 size={13} className="text-[#D40055] shrink-0" />
                        <span className="truncate">{lesson.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setViewingCurriculum(true)}
                  className="mt-6 inline-flex items-center justify-between w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-white/80 hover:bg-[#D40055] hover:text-white transition-all min-h-[44px]"
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
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#D40055]/40 transition-all"
              >
                <div className="flex items-start sm:items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#D40055]/10 text-2xl border border-[#D40055]/20">
                    {s.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#D40055]">Stage 0{idx + 1}</span>
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
            {CIVICS_QUESTS.map(q => (
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.06] hover:bg-[#D40055] hover:text-white py-3 text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
                  >
                    <Play size={13} fill="currentColor" /> Start Debate
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
                <div className="h-12 w-12 rounded-2xl bg-[#D40055]/20 flex items-center justify-center text-[#D40055]">
                  <Scroll size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">Founding Documents Archive</h4>
                  <p className="text-xs text-white/50">Verbatim public domain historical texts</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Read Magna Carta (1215), English Bill of Rights (1689), Two Treatises of Government,
                Common Sense, Declaration of Independence, and The Federalist Papers verbatim.
              </p>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D40055] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#e11d48] transition-all min-h-[44px]"
              >
                Open Document Canon
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center text-[#3B82F6]">
                  <Scale size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">Constitution Annotated (CONAN)</h4>
                  <p className="text-xs text-white/50">Clause-by-clause analysis with Supreme Court precedent</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Official legal analysis prepared by the Congressional Research Service. Explore how each
                word and clause has been interpreted by the courts over 230 years.
              </p>
              <a
                href="https://constitution.congress.gov/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[44px]"
              >
                Open Congress Library
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Touch-First Mobile Action Bar */}
      <div className="fixed bottom-0 inset-x-0 sm:hidden bg-[#07060c]/95 border-t border-white/10 p-3 backdrop-blur-xl z-30">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <button
            onClick={() => setViewingCurriculum(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D40055] py-3 text-xs font-black uppercase tracking-wider text-white min-h-[48px]"
          >
            <BookOpen size={16} /> Open Lessons
          </button>
          <button
            onClick={() => setTab('QUESTS')}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] py-3 text-xs font-black uppercase tracking-wider text-white min-h-[48px]"
          >
            <Play size={16} fill="currentColor" /> Debates
          </button>
        </div>
      </div>
    </div>
  );
};

export default CivicsHallView;
