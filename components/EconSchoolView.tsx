/**
 * EconSchoolView — School of Economics Landing Page.
 *
 * Grounded in Choice A: The Campus Salon & Work Desk.
 * Aligned with CEE Voluntary National Content Standards in Economics.
 * Taught on live public data series (FRED, BLS, BEA).
 *
 * Features:
 *  - "My Economics Desk": Context apron showing live Fed indicators, data labs, and assignment status.
 *  - 4 Tabbed Workspaces:
 *     1. STRANDS: Scarcity & Choice, Markets & Prices, Macroeconomics, Money & Banking, World Trade
 *     2. LADDER: PreK Scarcity -> Elementary Prices -> Middle Data -> AP Micro/Macro -> University
 *     3. QUESTS: Real CPI basket, supply/demand shock, Fed rate simulator, 2008/2020 crisis replay
 *     4. TOOLS: Live FRED data explorer, OpenStax 3e textbooks, AP economics test bank
 *  - Touch-First Mobile: Horizontal snap-carousels and 48px touch targets without overlapping.
 */
import React, { useState } from 'react';
import {
  ArrowLeft, LineChart, Sparkles, TrendingUp, ShieldCheck, GraduationCap,
  ChevronRight, Award, DollarSign, Globe, CheckCircle2,
  BarChart3, Layers, Play, Clock, Calculator, BookOpen, RefreshCw
} from 'lucide-react';
import { ECON_SCHOOL } from '../data/econCurriculum';
import SchoolView from './school/SchoolView';

interface Props {
  onBack: () => void;
  onNavigate?: (view: string) => void;
  user?: any;
  profile?: any;
}

type Tab = 'STRANDS' | 'LADDER' | 'QUESTS' | 'TOOLS';

const LADDER_STAGES = [
  { level: 'PreK & Early Elementary', age: 'Ages 5–8', icon: '🍎', title: 'Scarcity & Choices', desc: 'Goods, services, and why we cannot have everything at once. Scarcity as a playground game.' },
  { level: 'Elementary School', age: 'Grades 3–5', icon: '🏷️', title: 'Prices & Exchange', desc: 'Why prices change, what buyers and sellers agree on, and graphing a real price over time.' },
  { level: 'Middle School', age: 'Grades 6–8', icon: '📊', title: 'Markets & Real Data', desc: 'Supply and demand curves with your own goods. Reading this month’s actual consumer price index.' },
  { level: 'High School (AP Track)', age: 'Grades 9–12', icon: '🏛️', title: 'AP Micro & Macro Labs', desc: 'Elasticity, market failures, fiscal multipliers, the Fed’s dual mandate, and monetary policy transmission.' },
  { level: 'University & Research', age: 'Higher Ed', icon: '🎓', title: 'Econometrics & Live Series', desc: 'Empirical data projects on live FRED series, regression modeling, and game theory mechanisms.' },
];

const ECON_QUESTS = [
  {
    id: 'quest-cpi-basket',
    title: 'The Real-Time CPI Basket Sprint',
    band: 'Middle & High',
    emoji: '🛒',
    desc: 'Construct a household consumption basket and calculate this month’s inflation rate using raw BLS data.',
    duration: '20 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#3B82F6',
  },
  {
    id: 'quest-fed-simulator',
    title: 'Fed Chair Interest Rate Lab',
    band: 'High School & College',
    emoji: '🏦',
    desc: 'You are Chair of the Federal Reserve. Balance 4.2% inflation and 3.8% unemployment — vote on the policy rate.',
    duration: '25 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#8B5CF6',
  },
  {
    id: 'quest-supply-shock',
    title: 'Supply Shock & Price Ceilings',
    band: 'Grades 8–12',
    emoji: '⛽',
    desc: 'Simulate a sudden disruption to refinery capacity. Test what happens when government caps the price of fuel.',
    duration: '15 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#F59E0B',
  },
  {
    id: 'quest-2008-replay',
    title: '2008 & 2020 Economic Crisis Replay',
    band: 'High School & Adult',
    emoji: '📉',
    desc: 'Replay the collapse of credit markets in 2008 and the lockdown shock in 2020 through real-time indicators.',
    duration: '30 min',
    tool: 'ACADEMIA_COURSES',
    accent: '#06D6A0',
  },
];

const EconSchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<Tab>('STRANDS');
  const [viewingCurriculum, setViewingCurriculum] = useState(false);

  const totalLessons = ECON_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);

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
          <SchoolView curriculum={ECON_SCHOOL} embedded />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-28 selection:bg-[#3B82F6]/30">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#93C5FD]">
              <LineChart size={13} /> School of Economics
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              Live Federal Data
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(15,34,70,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#93C5FD] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>Social Science & Empirical Data</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              School of Economics
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              {ECON_SCHOOL.blurb}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3B82F6] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:bg-[#60a5fa] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <BookOpen size={18} /> Full Lesson Reader ({totalLessons})
              </button>
              <button
                onClick={() => setTab('QUESTS')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <Play size={18} fill="currentColor" /> Open Data Labs & Quests
              </button>
            </div>
          </div>
        </div>

        {/* "My Economics Desk" — Context Apron */}
        <div className="mb-8 rounded-3xl border border-[#3B82F6]/30 bg-gradient-to-r from-[#3B82F6]/10 via-transparent to-transparent p-5 sm:p-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-[#3B82F6] animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[#93C5FD]">
                  My Economics Desk
                </h3>
              </div>
              <p className="mt-1 text-sm font-bold text-white/90">
                {profile?.displayName ? `${profile.displayName}'s Macro Workspace` : 'Economics Lab Workspace'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                <span>Live Feeds:</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[#60A5FA]">FRED API</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[#34D399]">BLS Monthly</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[#FCD34D]">BEA GDP</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Strands</p>
                <p className="text-base font-black text-white">{ECON_SCHOOL.tracks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Standards</p>
                <p className="text-base font-black text-[#93C5FD]">CEE National</p>
              </div>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="rounded-2xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#93C5FD] hover:bg-[#3B82F6]/30 transition-all min-h-[44px]"
              >
                Open Reader
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'STRANDS', label: 'Curricular Strands', icon: Layers, count: ECON_SCHOOL.tracks.length },
            { id: 'LADDER', label: 'PreK → University Ladder', icon: Award, count: LADDER_STAGES.length },
            { id: 'QUESTS', label: 'Data Quests & Labs', icon: LineChart, count: ECON_QUESTS.length },
            { id: 'TOOLS', label: 'FRED & Simulators', icon: Calculator, count: 4 },
          ].map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as Tab)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shrink-0 min-h-[44px] ${
                  active
                    ? 'bg-[#3B82F6] text-white shadow-lg shadow-[#3B82F6]/20 font-black'
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
            {ECON_SCHOOL.tracks.map((track, i) => (
              <div
                key={track.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#3B82F6]/50 hover:bg-white/[0.04] transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-xs font-mono font-bold text-[#3B82F6]">Strand 0{i + 1}</span>
                    <span className="rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/50">
                      {track.lessons.length} lessons
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white group-hover:text-[#93C5FD] transition-colors">
                    {track.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    {track.blurb}
                  </p>

                  <div className="mt-4 space-y-2">
                    {track.lessons.slice(0, 3).map(lesson => (
                      <div key={lesson.id} className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 size={13} className="text-[#3B82F6] shrink-0" />
                        <span className="truncate">{lesson.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setViewingCurriculum(true)}
                  className="mt-6 inline-flex items-center justify-between w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-white/80 hover:bg-[#3B82F6] hover:text-white transition-all min-h-[44px]"
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
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#3B82F6]/40 transition-all"
              >
                <div className="flex items-start sm:items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#3B82F6]/10 text-2xl border border-[#3B82F6]/20">
                    {s.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#3B82F6]">Stage 0{idx + 1}</span>
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
            {ECON_QUESTS.map(q => (
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.06] hover:bg-[#3B82F6] hover:text-white py-3 text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
                  >
                    <Play size={13} fill="currentColor" /> Start Lab
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
                <div className="h-12 w-12 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center text-[#3B82F6]">
                  <LineChart size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">FRED Live Economic Data</h4>
                  <p className="text-xs text-white/50">St. Louis Federal Reserve live API</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Pull over 800,000 live economic series from 110 sources. Graph the yield curve,
                inspect real vs nominal GDP growth, and track labor force participation in real time.
              </p>
              <a
                href="https://fred.stlouisfed.org/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3B82F6] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-[#60a5fa] transition-all min-h-[44px]"
              >
                Visit FRED Portal
              </a>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6]">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">OpenStax Economics 3e & CORE Econ</h4>
                  <p className="text-xs text-white/50">Free peer-reviewed university textbooks</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Complete open textbooks for Microeconomics and Macroeconomics, complete with
                case studies, self-check problems, and review questions.
              </p>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[44px]"
              >
                Open Textbook Reader
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
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3B82F6] py-3 text-xs font-black uppercase tracking-wider text-white min-h-[48px]"
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

export default EconSchoolView;
