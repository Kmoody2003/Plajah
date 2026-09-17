/**
 * BusinessSchoolView — The Business School Landing Page.
 *
 * Provides a dedicated, rich academic home for entrepreneurship, business strategy,
 * accounting, legal formation, go-to-market, and venture building on Plajah.
 *
 * Replaces the previous UX bug where clicking Business School jumped straight into the
 * bottom-level Praxis creation wizard without educational context.
 *
 * Features:
 *  - "My Business Desk": Contextual top apron displaying the learner's active venture,
 *    current stage (Spark → Grow), 3 P's status (Provide, Protect, Prosper), and streak.
 *  - Complete Discipline Strands: 6 comprehensive tracks from idea to scaling.
 *  - Quests & Case Studies: Classroom store, lemonade stand, tech startup sim, and P&L drills.
 *  - Tools & Simulators: Deep links to Praxis, Pitch Deck Studio, School of Money, Paper Trading.
 *  - Touch-First Mobile: Horizontal snap-carousels, thumb-zone action bar, and min 48px targets.
 */
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Rocket, Sparkles, TrendingUp, ShieldCheck, DollarSign,
  BookOpen, ChevronRight, Award, Compass, FileText, CheckCircle2,
  Building2, PieChart, Users, Layers, Play, Zap, Laptop, Target
} from 'lucide-react';
import { STAGES, THREE_P, type Stage } from '../data/praxisJourney';

interface Props {
  onBack: () => void;
  onNavigate: (view: string) => void;
  user?: any;
  profile?: any;
}

type Tab = 'STRANDS' | 'PRAXIS_JOURNEY' | 'QUESTS' | 'TOOLS';

interface BusinessStrand {
  id: string;
  title: string;
  blurb: string;
  badge: string;
  accent: string;
  topics: { name: string; desc: string; standard?: string }[];
}

const STRANDS: BusinessStrand[] = [
  {
    id: 'strategy',
    title: 'Venture Strategy & Ideation',
    blurb: 'Turn observations and problems into viable business models with defensible value propositions.',
    badge: 'Core Foundation',
    accent: '#8B5CF6',
    topics: [
      { name: 'The Business Model Canvas', desc: '9 building blocks that define how an organization creates and delivers value.' },
      { name: 'Market Sizing (TAM / SAM / SOM)', desc: 'Estimate Total Addressable Market with open US Census and BLS data.' },
      { name: 'Customer Discovery & Validation', desc: 'Conduct interviews, validate hypotheses, and avoid building the wrong thing.' },
      { name: 'Competitive Moats & Positioning', desc: 'Network effects, economies of scale, switching costs, and brand equity.' },
    ],
  },
  {
    id: 'accounting',
    title: 'Accounting & Unit Economics',
    blurb: 'Read the language of business: double-entry bookkeeping, the three financial statements, and margin mechanics.',
    badge: 'Financial Literacy',
    accent: '#F59E0B',
    topics: [
      { name: 'The Three Statements', desc: 'Profit & Loss (P&L), Balance Sheet, and Cash Flow — and how they interlock.' },
      { name: 'Cash vs. Accrual Accounting', desc: 'Why profitable companies still go broke when cash timing fails.' },
      { name: 'Unit Economics & Margins', desc: 'Gross margin, contribution margin, CAC, and LTV calculation.' },
      { name: 'Break-Even Analysis', desc: 'Fixed costs, variable costs, and how many units you must sell to survive.' },
    ],
  },
  {
    id: 'legal',
    title: 'Entity Formation & Compliance',
    blurb: 'Demystify legal structures, liability protection, tax classifications, and contracts.',
    badge: 'Legal & Tax',
    accent: '#06D6A0',
    topics: [
      { name: 'Entity Choice: Sole Prop, LLC, C-Corp', desc: 'Personal liability, pass-through taxation, corporate tax, and investor requirements.' },
      { name: 'Federal & State Registration', desc: 'Obtaining an IRS EIN, Secretary of State filing, registered agents, and licenses.' },
      { name: 'Founders Agreements & Cap Tables', desc: 'Equity splits, 4-year vesting schedules, 1-year cliffs, and 83(b) elections.' },
      { name: 'Essential Contracts & IP', desc: 'NDAs, independent contractor agreements, terms of service, trademarks, and copyright.' },
    ],
  },
  {
    id: 'gtm',
    title: 'Marketing & Go-to-Market',
    blurb: 'Acquire your first 10, 100, and 1,000 customers without burning capital on unfocused advertising.',
    badge: 'Growth',
    accent: '#D40055',
    topics: [
      { name: 'Ideal Customer Profile (ICP)', desc: 'Defining the exact demographic, psychographic, and pain triggers of your buyer.' },
      { name: 'Value-Based Pricing', desc: 'Cost-plus vs competitor-based vs value-based pricing models.' },
      { name: 'Acquisition Channels & Funnels', desc: 'Organic content, community building, outbound sales, paid acquisition, and viral loops.' },
      { name: 'Retention & Net Promoter Score', desc: 'Churn calculation, customer delight, and referral loops.' },
    ],
  },
  {
    id: 'capital',
    title: 'Capital, Funding & Investor Readiness',
    blurb: 'The complete capital ladder: bootstrapping, customer revenue, debt, angel funding, and institutional venture.',
    badge: 'Funding',
    accent: '#3B82F6',
    topics: [
      { name: 'Bootstrapping & Cash Flow First', desc: 'Retaining 100% equity through customer-funded growth and lean operations.' },
      { name: 'The Pitch Deck & Narrative', desc: 'The 10-slide deck standard: Problem, Solution, Market, Traction, Team, The Ask.' },
      { name: 'SAFEs vs Priced Equity Rounds', desc: 'Y Combinator post-money SAFEs, valuation caps, discounts, and dilution mechanics.' },
      { name: 'Small Business Lending & Grants', desc: 'SBA 7(a) loans, microloans, federal SBIR/STTR grants, and non-dilutive capital.' },
    ],
  },
  {
    id: 'operations',
    title: 'Operations & Leadership',
    blurb: 'Build systems that operate without you: standard operating procedures, hiring, culture, and governance.',
    badge: 'Scale',
    accent: '#00DAF3',
    topics: [
      { name: 'Standard Operating Procedures (SOPs)', desc: 'Documenting recurring workflows to enable delegation and consistency.' },
      { name: 'Hiring & Contractor Management', desc: 'W2 vs 1099 compliance, job scorecards, onboarding, and incentive alignment.' },
      { name: 'KPIs & Operating Dashboards', desc: 'Leading vs lagging indicators, North Star metrics, and weekly cadence.' },
      { name: 'Ethics & Corporate Responsibility', desc: 'Stakeholder capitalism, environmental compliance, and governance.' },
    ],
  },
];

const BUSINESS_QUESTS = [
  {
    id: 'quest-store',
    title: 'The Classroom Store Challenge',
    band: 'PreK–5',
    emoji: '🏪',
    desc: 'Set prices, manage inventory, calculate change, and experience trade through play.',
    duration: '20 min',
    tool: 'PRAXIS',
    accent: '#8B5CF6',
  },
  {
    id: 'quest-lemonade',
    title: 'Lemonade Stand Margin Drill',
    band: 'Grades 6–8',
    emoji: '🍋',
    desc: 'Cost your ingredients, model foot traffic on sunny vs rainy days, and maximize net profit.',
    duration: '25 min',
    tool: 'PRAXIS',
    accent: '#F59E0B',
  },
  {
    id: 'quest-canvas',
    title: 'Speed Model Canvas Sprint',
    band: 'High School',
    emoji: '⚡',
    desc: 'Synthesize an idea into all 9 canvas blocks in 15 minutes with Aria coaching your assumptions.',
    duration: '15 min',
    tool: 'PRAXIS',
    accent: '#06D6A0',
  },
  {
    id: 'quest-dilution',
    title: 'Cap Table & Dilution Lab',
    band: 'College & Pro',
    emoji: '📊',
    desc: 'Simulate Seed, Series A, and Option Pools to discover how much of your company you actually own at exit.',
    duration: '30 min',
    tool: 'PAPER_TRADING',
    accent: '#3B82F6',
  },
];

const BusinessSchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<Tab>('STRANDS');

  // Retrieve any active venture saved locally or in state
  const [activeVenture, setActiveVenture] = useState<{
    name: string;
    stageKey: string;
    industry?: string;
  } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('praxis_active_venture');
      if (saved) {
        setActiveVenture(JSON.parse(saved));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const currentStage = STAGES.find(s => s.key === (activeVenture?.stageKey || 'spark')) || STAGES[0];

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-24 selection:bg-[#8B5CF6]/30">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#A78BFA]">
              <Rocket size={13} /> The Business School
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              PreK → Professional
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(42,22,80,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#A78BFA] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>Discipline Center</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              The Business School
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              Learn business by building one. From early classroom store play to entity formation,
              double-entry bookkeeping, unit economics, and venture capital — backed by Aria and real tools.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate('PRAXIS')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#8B5CF6] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:bg-[#9d71fa] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px]"
              >
                <Rocket size={18} /> {activeVenture ? 'Resume Your Venture in Praxis ▶' : 'Launch Praxis Venture Builder ▶'}
              </button>
              <button
                onClick={() => setTab('PRAXIS_JOURNEY')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-all min-h-[48px]"
              >
                <Compass size={16} /> Explore 8 Stages
              </button>
            </div>
          </div>

          <div
            aria-hidden
            className="absolute -right-12 -bottom-16 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-30"
            style={{ background: 'radial-gradient(circle, #8B5CF6, transparent)' }}
          />
        </div>

        {/* ── [MY DESK]: Personalized Signed-In Context ─────────────────────── */}
        <section className="mb-8" aria-label="My Business Desk">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#A78BFA]">
                  <Award size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">My Business Desk</h2>
                  <p className="text-xs text-white/50">Your active ventures, assignments & progress</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white/40">The Three P's Spine:</span>
                {Object.values(THREE_P).map(p => (
                  <span
                    key={p.key}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border"
                    style={{
                      borderColor: `${p.color}44`,
                      backgroundColor: `${p.color}15`,
                      color: p.color,
                    }}
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Context Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Active Venture Status */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Active Venture</span>
                    <span className="text-[#8B5CF6] uppercase font-black tracking-wider">Praxis Stage {currentStage.order}/8</span>
                  </div>
                  <h3 className="text-base font-black text-white truncate">
                    {activeVenture?.name || 'My First Venture'}
                  </h3>
                  <p className="text-xs text-white/60 mt-1 line-clamp-2">
                    Current milestone: <strong className="text-white">{currentStage.title}</strong> — {currentStage.oneLiner}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Produces: {currentStage.produces.split('+')[0]}</span>
                  <button
                    onClick={() => onNavigate('PRAXIS')}
                    className="text-xs font-black uppercase tracking-wider text-[#A78BFA] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Continue <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 2: Connected Quests & Practice */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Recommended Quest</span>
                    <span className="text-[#F59E0B] font-bold">Earn 150 pts</span>
                  </div>
                  <h3 className="text-base font-black text-white">Lemonade Stand Margin Drill</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Practice cost accounting & calculate contribution margin against changing weather factors.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">Est. 20 min</span>
                  <button
                    onClick={() => onNavigate('PRAXIS')}
                    className="text-xs font-black uppercase tracking-wider text-[#F59E0B] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Start Drill <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 3: Financial & Investor Skills */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
                <div>
                  <div className="flex items-center justify-between text-xs text-white/40 font-bold mb-1">
                    <span>Financial Simulator</span>
                    <span className="text-[#06D6A0] font-bold">Live Market Sim</span>
                  </div>
                  <h3 className="text-base font-black text-white">Paper Trading & Portfolio</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Practice treasury management, cash deployment, and equity markets with $100k virtual capital.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-white/40">CEE Aligned</span>
                  <button
                    onClick={() => onNavigate('PAPER_TRADING')}
                    className="text-xs font-black uppercase tracking-wider text-[#06D6A0] hover:text-white inline-flex items-center gap-1 min-h-[36px]"
                  >
                    Open Sim <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Navigation Tabs (Touch-First Pills) ───────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {[
            { key: 'STRANDS', label: 'Curriculum & Topics', icon: BookOpen },
            { key: 'PRAXIS_JOURNEY', label: '8-Stage Venture Journey', icon: Rocket },
            { key: 'QUESTS', label: 'Quests & Case Studies', icon: Zap },
            { key: 'TOOLS', label: 'Simulators & Tools', icon: Laptop },
          ].map(t => {
            const Icon = t.icon;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as Tab)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all min-h-[48px] ${
                  on
                    ? 'bg-white text-black shadow-lg shadow-white/10 scale-[1.02]'
                    : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white border border-white/10'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: CURRICULUM STRANDS & SUBTOPICS ──────────────────────────── */}
        {tab === 'STRANDS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Core Business Disciplines</h2>
                <p className="text-xs text-white/50">Explore topics across all ages and experience levels</p>
              </div>
              <span className="text-xs text-white/40 font-mono">6 Strands · 24 Subtopics</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {STRANDS.map(strand => (
                <div
                  key={strand.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/20 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                        style={{
                          borderColor: `${strand.accent}55`,
                          backgroundColor: `${strand.accent}15`,
                          color: strand.accent,
                        }}
                      >
                        {strand.badge}
                      </span>
                      <ChevronRight size={16} className="text-white/30" />
                    </div>

                    <h3 className="text-lg font-black text-white mb-2 leading-tight">{strand.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-5">{strand.blurb}</p>

                    <div className="space-y-2.5 pt-4 border-t border-white/5">
                      {strand.topics.map(topic => (
                        <div key={topic.name} className="group/item">
                          <div className="text-xs font-bold text-white/85 group-hover/item:text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: strand.accent }} />
                            {topic.name}
                          </div>
                          <p className="text-[11px] text-white/45 ml-3 mt-0.5 leading-normal">{topic.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('PRAXIS')}
                    className="mt-6 w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white/80 hover:text-white transition-all min-h-[44px]"
                  >
                    Learn & Practice in Praxis →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 2: 8-STAGE PRAXIS VENTURE JOURNEY ─────────────────────────── */}
        {tab === 'PRAXIS_JOURNEY' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">The 8 Praxis Stages</h2>
                <p className="text-xs text-white/50">Every stage teaches a principle and produces a real artifact</p>
              </div>
              <button
                onClick={() => onNavigate('PRAXIS')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8B5CF6] text-xs font-black uppercase tracking-wider text-white min-h-[44px]"
              >
                Open Praxis Studio <Play size={13} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {STAGES.map(stage => {
                const leadDef = THREE_P[stage.lead];
                return (
                  <div
                    key={stage.key}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.05] transition-all cursor-pointer"
                    onClick={() => onNavigate('PRAXIS')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-sm text-white">
                          {stage.order}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-black text-white">{stage.title}</h3>
                            <span
                              className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                              style={{
                                borderColor: `${leadDef.color}44`,
                                backgroundColor: `${leadDef.color}15`,
                                color: leadDef.color,
                              }}
                            >
                              {leadDef.label}
                            </span>
                          </div>
                          <p className="text-xs text-white/55 mt-0.5">{stage.oneLiner}</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-white/30 shrink-0 mt-2" />
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-xs">
                      <div>
                        <strong className="text-white/80 font-bold">What you learn: </strong>
                        <span className="text-white/50">{stage.learn}</span>
                      </div>
                      <div>
                        <strong className="text-white/80 font-bold">What you produce: </strong>
                        <span className="text-[#06D6A0]">{stage.produces}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {stage.tools.map(tool => (
                          <span
                            key={tool}
                            className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/40"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 3: QUESTS & CASE STUDIES ──────────────────────────────────── */}
        {tab === 'QUESTS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-white">Applied Quests & Labs</h2>
                <p className="text-xs text-white/50">Interactive challenges that reward points and ledger mastery</p>
              </div>
              <span className="text-xs text-white/40">4 Active Quests</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {BUSINESS_QUESTS.map(quest => (
                <div
                  key={quest.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="text-3xl">{quest.emoji}</span>
                      <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-white/60">
                        {quest.band}
                      </span>
                    </div>

                    <h3 className="text-lg font-black text-white mb-1.5">{quest.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-4">{quest.desc}</p>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <span className="text-xs text-white/40">{quest.duration}</span>
                    <button
                      onClick={() => onNavigate(quest.tool)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-black transition-all min-h-[44px]"
                      style={{ backgroundColor: quest.accent }}
                    >
                      Launch Quest ▶
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 4: TOOLS & SIMULATORS ─────────────────────────────────────── */}
        {tab === 'TOOLS' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider text-white">Platform Simulators & Studios</h2>
              <p className="text-xs text-white/50">Direct access to the creative and financial machinery</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  title: 'Praxis Venture Studio',
                  desc: 'The interactive 8-stage company launcher with double-entry books and cap table calculator.',
                  icon: Rocket,
                  action: () => onNavigate('PRAXIS'),
                  color: '#8B5CF6',
                },
                {
                  title: 'Pitch Deck Studio',
                  desc: 'Generate, structure, and export standard 10-slide investor decks with live narrative coaching.',
                  icon: FileText,
                  action: () => onNavigate('PITCH_DECK_STUDIO'),
                  color: '#FF8C00',
                },
                {
                  title: 'School of Money (FinLit)',
                  desc: 'Personal finance, budgeting, credit scores, debt payoff, and FDIC/CFPB national standards.',
                  icon: DollarSign,
                  action: () => onNavigate('MONEY_SCHOOL'),
                  color: '#F59E0B',
                },
                {
                  title: 'Paper Trading Portfolio',
                  desc: 'Simulate real market trades, stock execution, and balance sheet capital management without financial risk.',
                  icon: TrendingUp,
                  action: () => onNavigate('PAPER_TRADING'),
                  color: '#06D6A0',
                },
                {
                  title: 'Learner Ledger & Passport',
                  desc: 'Verifiable proof of earned business competencies, accounting hours, and course completions.',
                  icon: ShieldCheck,
                  action: () => onNavigate('LEARNER_LEDGER'),
                  color: '#3B82F6',
                },
                {
                  title: 'Real Estate School & Terra',
                  desc: 'Adopt live Detroit parcels, inspect zoning, and model property developments on real maps.',
                  icon: Building2,
                  action: () => onNavigate('REAL_ESTATE_SCHOOL'),
                  color: '#00DAF3',
                },
              ].map(t => {
                const Icon = t.icon;
                return (
                  <div
                    key={t.title}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 flex flex-col justify-between hover:bg-white/[0.05] transition-all"
                  >
                    <div>
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4"
                        style={{ backgroundColor: `${t.color}20`, color: t.color, border: `1px solid ${t.color}40` }}
                      >
                        <Icon size={20} />
                      </div>
                      <h3 className="text-base font-black text-white mb-2">{t.title}</h3>
                      <p className="text-xs text-white/60 leading-relaxed">{t.desc}</p>
                    </div>

                    <button
                      onClick={t.action}
                      className="mt-6 w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider border border-white/10 bg-white/[0.04] hover:bg-white/10 text-white transition-all min-h-[44px]"
                    >
                      Launch Tool →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Touch-First Sticky Quick Action Bar ──────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-30 p-3 bg-black/80 backdrop-blur-xl border-t border-white/10 sm:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('PRAXIS')}
            className="flex-1 py-3.5 px-4 rounded-2xl bg-[#8B5CF6] text-white text-xs font-black uppercase tracking-wider text-center shadow-lg shadow-[#8B5CF6]/30 flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Rocket size={16} /> Open Praxis Studio
          </button>
          <button
            onClick={onBack}
            className="px-4 py-3.5 rounded-2xl border border-white/15 bg-white/5 text-white/70 text-xs font-bold min-h-[48px]"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default BusinessSchoolView;
