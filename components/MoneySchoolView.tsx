/**
 * MoneySchoolView — School of Money (Financial Literacy) Landing Page.
 *
 * Grounded in Choice A: The Campus Salon & Work Desk.
 * Aligned with the 2021 National Standards for Personal Financial Education (CEE + Jump$tart)
 * and US state mandates.
 *
 * Features:
 *  - "My Money Desk": Top contextual apron showing practice portfolio status (Paper Trading),
 *    budgeting streaks, and standards mastery.
 *  - 4 Tabbed Workspaces:
 *     1. STRANDS: 6 CEE tracks (Earning, Spending, Saving, Credit, Risk, Business Money)
 *     2. LADDER: Age-appropriate progression from PreK coins to CFO corporate finance
 *     3. QUESTS: Interactive financial literacy challenges
 *     4. TOOLS: Paper Trading simulator, compound calculator, FDIC/CFPB toolkits
 *  - Touch-First Mobile: Horizontal snap-carousels and 48px touch targets without overlapping.
 */
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, DollarSign, Sparkles, TrendingUp, ShieldCheck, Award,
  BookOpen, ChevronRight, Zap, Play, Calculator, PieChart,
  Scale, AlertCircle, CheckCircle2, Clock, Landmark, Layers
} from 'lucide-react';
import { MONEY_SCHOOL } from '../data/finlitCurriculum';
import SchoolView from './school/SchoolView';
import { fetchStudentDueWork, type DueItem } from '../services/assignmentTemplateService';

interface Props {
  onBack: () => void;
  onNavigate?: (view: string) => void;
  user?: any;
  profile?: any;
}

type Tab = 'STRANDS' | 'LADDER' | 'QUESTS' | 'TOOLS';

const LADDER_STAGES = [
  { level: 'PreK & Early Elementary', age: 'Ages 4–7', icon: '🪙', title: 'Coins & Choices', desc: 'Identify coins, make simple trade-offs, and learn the power of waiting for what you want.' },
  { level: 'Elementary School', age: 'Grades 3–5', icon: '🏦', title: 'The First Piggy Bank', desc: 'Budgeting allowance, setting savings goals, and discovering how banks store money safely.' },
  { level: 'Middle School', age: 'Grades 6–8', icon: '📈', title: 'Compound Growth & Margin', desc: 'Simple vs. compound interest, credit card interest rates, and your first practice stock portfolio.' },
  { level: 'High School', age: 'Grades 9–12', icon: '📜', title: 'State Mandate Standard', desc: 'Taxes, paychecks, FICO credit scores, student loan choices, auto insurance, and investing fundamentals.' },
  { level: 'College & Early Career', age: 'Higher Ed', icon: '🎓', title: 'Independent Financial Survival', desc: 'Renting vs. buying, employer 401(k) matching, index fund investing, and high-interest debt elimination.' },
  { level: 'Professional & Founder', age: 'Venture / CFO', icon: '🏢', title: 'The CFO Track', desc: 'Business balance sheets, double-entry cash flow, unit economics, working capital, and cost of capital.' },
];

const MONEY_QUESTS = [
  {
    id: 'quest-allowance',
    title: 'The 50/30/20 Budget Sprint',
    band: 'Grades 6–12',
    emoji: '📊',
    desc: 'Allocate an income between Needs, Wants, and Savings across unexpected life events.',
    duration: '20 min',
    tool: 'PAPER_TRADING',
    accent: '#F59E0B',
  },
  {
    id: 'quest-interest',
    title: 'Compound Interest Time Machine',
    band: 'Middle & High',
    emoji: '⏳',
    desc: 'Simulate starting investing at age 18 vs age 30 — see why time in the market crushes timing.',
    duration: '15 min',
    tool: 'PAPER_TRADING',
    accent: '#3B82F6',
  },
  {
    id: 'quest-credit',
    title: 'Credit Score Rescue Lab',
    band: 'High School & College',
    emoji: '💳',
    desc: 'Diagnose a damaged credit profile, plan the fastest debt payoff order, and restore a 750+ score.',
    duration: '25 min',
    tool: 'PAPER_TRADING',
    accent: '#06D6A0',
  },
  {
    id: 'quest-portfolio',
    title: 'Paper Trading Market Challenge',
    band: 'All Ages',
    emoji: '📈',
    desc: 'Build a simulated portfolio with $100,000 in virtual cash. Track real market prices with zero risk.',
    duration: 'Ongoing',
    tool: 'PAPER_TRADING',
    accent: '#8B5CF6',
  },
];

const MoneySchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<Tab>('STRANDS');
  const [dueAssignments, setDueAssignments] = useState<DueItem[]>([]);
  const [viewingCurriculum, setViewingCurriculum] = useState(false);

  const totalLessons = MONEY_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);

  useEffect(() => {
    if (user?.uid) {
      fetchStudentDueWork(user.uid)
        .then(items => {
          const moneyItems = items.filter(i =>
            i.title.toLowerCase().includes('money') ||
            i.title.toLowerCase().includes('budget') ||
            i.title.toLowerCase().includes('finance') ||
            i.title.toLowerCase().includes('market')
          );
          setDueAssignments(moneyItems.length > 0 ? moneyItems : items.slice(0, 2));
        })
        .catch(() => {});
    }
  }, [user]);

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
          <SchoolView curriculum={MONEY_SCHOOL} embedded />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-28 selection:bg-[#F59E0B]/30">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#FCD34D]">
              <DollarSign size={13} /> School of Money
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              30-State Mandate Ready
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(74,43,0,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#FCD34D] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>Financial Literacy</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              School of Money
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              Financial literacy from your first coin to a corporate balance sheet. Public domain spine,
              FDIC and CFPB aligned, with a zero-risk real-time Paper Trading stock market simulator.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => onNavigate ? onNavigate('PAPER_TRADING') : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F59E0B] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:bg-[#fbbf24] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <TrendingUp size={18} /> Open Paper Trading
              </button>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <BookOpen size={18} /> Full Lesson Reader ({totalLessons})
              </button>
            </div>
          </div>
        </div>

        {/* "My Money Desk" — Context Apron */}
        <div className="mb-8 rounded-3xl border border-[#F59E0B]/30 bg-gradient-to-r from-[#F59E0B]/10 via-transparent to-transparent p-5 sm:p-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[#FCD34D]">
                  My Money Desk
                </h3>
              </div>
              <p className="mt-1 text-sm font-bold text-white/90">
                {profile?.displayName ? `${profile.displayName}'s Financial Workspace` : 'Personal Finance Desk'}
              </p>
              <p className="text-xs text-white/50">
                Practice Portfolio: <span className="text-[#34D399] font-mono font-bold">$100,000.00 USD</span> · 0 trades placed this week
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Strands</p>
                <p className="text-base font-black text-white">{MONEY_SCHOOL.tracks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Standards</p>
                <p className="text-base font-black text-[#FCD34D]">CEE Aligned</p>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('PAPER_TRADING')}
                  className="rounded-2xl bg-[#F59E0B]/20 border border-[#F59E0B]/40 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#FCD34D] hover:bg-[#F59E0B]/30 transition-all min-h-[44px]"
                >
                  Trade Now
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'STRANDS', label: 'Curricular Strands', icon: Layers, count: MONEY_SCHOOL.tracks.length },
            { id: 'LADDER', label: 'PreK → Pro Ladder', icon: Award, count: LADDER_STAGES.length },
            { id: 'QUESTS', label: 'Financial Quests', icon: Zap, count: MONEY_QUESTS.length },
            { id: 'TOOLS', label: 'Simulators & Tools', icon: Calculator, count: 4 },
          ].map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as Tab)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shrink-0 min-h-[44px] ${
                  active
                    ? 'bg-[#F59E0B] text-black shadow-lg shadow-[#F59E0B]/20 font-black'
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
            {MONEY_SCHOOL.tracks.map((track, i) => (
              <div
                key={track.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#F59E0B]/50 hover:bg-white/[0.04] transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-xs font-mono font-bold text-[#F59E0B]">Strand 0{i + 1}</span>
                    <span className="rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/50">
                      {track.lessons.length} lessons
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white group-hover:text-[#FCD34D] transition-colors">
                    {track.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    {track.blurb}
                  </p>

                  <div className="mt-4 space-y-2">
                    {track.lessons.slice(0, 3).map(lesson => (
                      <div key={lesson.id} className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 size={13} className="text-[#F59E0B] shrink-0" />
                        <span className="truncate">{lesson.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setViewingCurriculum(true)}
                  className="mt-6 inline-flex items-center justify-between w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-white/80 hover:bg-[#F59E0B] hover:text-black transition-all min-h-[44px]"
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
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#F59E0B]/40 transition-all"
              >
                <div className="flex items-start sm:items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F59E0B]/10 text-2xl border border-[#F59E0B]/20">
                    {s.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#F59E0B]">Step 0{idx + 1}</span>
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
            {MONEY_QUESTS.map(q => (
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
                    onClick={() => onNavigate ? onNavigate(q.tool) : undefined}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.06] hover:bg-[#F59E0B] hover:text-black py-3 text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
                  >
                    <Play size={13} fill="currentColor" /> Start Quest
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
                <div className="h-12 w-12 rounded-2xl bg-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B]">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">Paper Trading Simulator</h4>
                  <p className="text-xs text-white/50">Real-time quotes with zero financial risk</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Execute market and limit orders, manage a diversified portfolio across equities and ETFs,
                and learn how order book spreads and dividends work in the real economy.
              </p>
              <button
                onClick={() => onNavigate ? onNavigate('PAPER_TRADING') : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F59E0B] px-6 py-3 text-xs font-black uppercase tracking-wider text-black hover:bg-[#fbbf24] transition-all min-h-[44px]"
              >
                Launch Paper Trading
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center text-[#3B82F6]">
                  <Landmark size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">FDIC & CFPB Standard Toolkits</h4>
                  <p className="text-xs text-white/50">Official federal consumer financial protection</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Direct access to Money Smart guides, Consumer Financial Protection Bureau toolkits,
                and state-by-state high school financial graduation requirements.
              </p>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[44px]"
              >
                Browse Standard Units
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Touch-First Mobile Action Bar */}
      <div className="fixed bottom-0 inset-x-0 sm:hidden bg-[#07060c]/95 border-t border-white/10 p-3 backdrop-blur-xl z-30">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <button
            onClick={() => onNavigate ? onNavigate('PAPER_TRADING') : undefined}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F59E0B] py-3 text-xs font-black uppercase tracking-wider text-black min-h-[48px]"
          >
            <TrendingUp size={16} /> Paper Trading
          </button>
          <button
            onClick={() => setViewingCurriculum(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] py-3 text-xs font-black uppercase tracking-wider text-white min-h-[48px]"
          >
            <BookOpen size={16} /> Lessons
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoneySchoolView;
