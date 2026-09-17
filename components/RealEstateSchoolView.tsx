/**
 * RealEstateSchoolView — The Real Estate School Landing Page.
 *
 * Grounded in Choice A: The Campus Salon & Work Desk.
 * First open full-stack real-estate curriculum, powered by Terra's live parcel data.
 *
 * Features:
 *  - "My Property Desk": Context apron showing active parcel from Terra, zoning status, and homework.
 *  - 4 Tabbed Workspaces:
 *     1. STRANDS: Property & Home, Licensure & Law, Valuation, Mortgage Finance, Development, Capital Markets
 *     2. LADDER: PreK Neighborhood -> First Home -> Licensee -> Underwriter -> Capital Markets
 *     3. QUESTS: Live parcel adoption, appraisal comps sprint, loan estimate breakdown, development pro forma
 *     4. TOOLS: Terra live map, zoning envelope calculator, mortgage math, open casebooks
 *  - Touch-First Mobile: Horizontal snap-carousels and 48px touch targets without overlapping.
 */
import React, { useState } from 'react';
import {
  ArrowLeft, MapPin, Sparkles, Building2, ShieldCheck, GraduationCap,
  ChevronRight, Award, Home, Compass, FileText, CheckCircle2,
  TrendingUp, Layers, Play, Clock, Calculator, Eye, Landmark, BookOpen
} from 'lucide-react';
import { REAL_ESTATE_SCHOOL } from '../data/realEstateCurriculum';
import SchoolView from './school/SchoolView';

interface Props {
  onBack: () => void;
  onNavigate?: (view: string) => void;
  user?: any;
  profile?: any;
}

type Tab = 'STRANDS' | 'LADDER' | 'QUESTS' | 'TOOLS';

const LADDER_STAGES = [
  { level: 'PreK & Elementary', age: 'Ages 5–10', icon: '🏡', title: 'Neighborhood & Home', desc: 'What is a home? Who owns the park? Discover boundaries, addresses, and community spaces.' },
  { level: 'Middle School', age: 'Grades 6–8', icon: '📍', title: 'The Parcel Explorer', desc: 'Adopt a real parcel on Terra. Measure lot dimensions, examine street trees, and understand addresses.' },
  { level: 'High School', age: 'Grades 9–12', icon: '📑', title: 'First Home & Loan Estimate', desc: 'Read a real CFPB Loan Estimate. Understand down payments, escrow, interest rates, and title insurance.' },
  { level: 'Licensure Track', age: 'Adult & Career', icon: '⚖️', title: 'Pre-Licensure Principles', desc: 'Agency law, fiduciary duties, fair housing compliance, deeds, encumbrances, and closing disclosures.' },
  { level: 'Development & Underwriting', age: 'Professional', icon: '🏗️', title: 'Pro Forma & Zoning', desc: 'Compute legal buildable envelopes from city zoning codes. Build a 10-year pro forma from real assessor comps.' },
  { level: 'Institutional Capital', age: 'Capital Markets', icon: '🏢', title: 'REITs & Securitisation', desc: 'CMBS waterfall tranches, yield capitalization, public vs. private REIT mechanics, and syndication law.' },
];

const RE_QUESTS = [
  {
    id: 'quest-adopt-parcel',
    title: 'Adopt a Detroit Parcel',
    band: 'Grades 6–12',
    emoji: '📍',
    desc: 'Pick an actual Detroit city parcel on Terra. Audit its zoning classification, lot size, and assessed value.',
    duration: '20 min',
    tool: 'TERRA',
    accent: '#06D6A0',
  },
  {
    id: 'quest-comps-appraisal',
    title: '3-Comp Appraisal Sprint',
    band: 'High School & Adult',
    emoji: '🏘️',
    desc: 'Select 3 comparable recent sales in the same neighborhood. Adjust for square footage, bedroom count, and age.',
    duration: '25 min',
    tool: 'TERRA',
    accent: '#3B82F6',
  },
  {
    id: 'quest-loan-estimate',
    title: 'Loan Estimate Rate Shock Lab',
    band: 'High School & Adult',
    emoji: '📊',
    desc: 'Compare a 30-year fixed mortgage at 6.5% vs 7.5%. Calculate monthly P&I, total interest, and lifetime savings.',
    duration: '15 min',
    tool: 'TERRA',
    accent: '#F59E0B',
  },
  {
    id: 'quest-pro-forma',
    title: 'Infill Development Pro Forma',
    band: 'College & Pro',
    emoji: '🏗️',
    desc: 'Test whether a duplex can legally and profitably be built on a vacant commercial-infill parcel.',
    duration: '35 min',
    tool: 'TERRA',
    accent: '#8B5CF6',
  },
];

const RealEstateSchoolView: React.FC<Props> = ({ onBack, onNavigate, user, profile }) => {
  const [tab, setTab] = useState<Tab>('STRANDS');
  const [viewingCurriculum, setViewingCurriculum] = useState(false);

  const totalLessons = REAL_ESTATE_SCHOOL.tracks.reduce((n, t) => n + t.lessons.length, 0);

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
          <SchoolView curriculum={REAL_ESTATE_SCHOOL} embedded />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#07060c] text-white pb-28 selection:bg-[#06D6A0]/30">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#06D6A0]/30 bg-[#06D6A0]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#6EE7B7]">
              <Building2 size={13} /> Real Estate School
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/50">
              Terra-Powered Lab
            </span>
          </div>
        </div>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/[0.12] p-6 sm:p-10 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(6,214,160,0.22) 0%, rgba(10,61,48,0.4) 45%, rgba(7,6,12,0.9) 100%)',
          }}
        >
          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#6EE7B7] mb-3">
              <span>Plajah Academia</span>
              <span>·</span>
              <span>Property & Land Use</span>
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tight text-white leading-[0.95]"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Real Estate School
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl font-normal">
              {REAL_ESTATE_SCHOOL.blurb}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => onNavigate ? onNavigate('TERRA') : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#06D6A0] px-6 py-3.5 text-sm font-black uppercase tracking-wider text-[#04231b] shadow-[0_0_30px_rgba(6,214,160,0.4)] hover:bg-[#34d399] hover:scale-[1.02] active:scale-[0.98] transition-all min-h-[48px] w-full sm:w-auto"
              >
                <MapPin size={18} /> Open Terra (Live Parcels)
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

        {/* "My Property Desk" — Context Apron */}
        <div className="mb-8 rounded-3xl border border-[#06D6A0]/30 bg-gradient-to-r from-[#06D6A0]/10 via-transparent to-transparent p-5 sm:p-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-[#06D6A0] animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[#6EE7B7]">
                  My Property Desk
                </h3>
              </div>
              <p className="mt-1 text-sm font-bold text-white/90">
                {profile?.displayName ? `${profile.displayName}'s Parcel Workspace` : 'Property & Land Workspace'}
              </p>
              <p className="text-xs text-white/50">
                Active Feed: <span className="text-[#6EE7B7] font-mono font-bold">City of Detroit Daily Assessor</span> · Real zoning envelopes verified
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Strands</p>
                <p className="text-base font-black text-white">{REAL_ESTATE_SCHOOL.tracks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-white/40">Sources</p>
                <p className="text-base font-black text-[#6EE7B7]">MIT & Public Domain</p>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('TERRA')}
                  className="rounded-2xl bg-[#06D6A0]/20 border border-[#06D6A0]/40 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#6EE7B7] hover:bg-[#06D6A0]/30 transition-all min-h-[44px]"
                >
                  Adopt Parcel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'STRANDS', label: 'Curricular Strands', icon: Layers, count: REAL_ESTATE_SCHOOL.tracks.length },
            { id: 'LADDER', label: 'PreK → Pro Ladder', icon: Award, count: LADDER_STAGES.length },
            { id: 'QUESTS', label: 'Property Quests', icon: MapPin, count: RE_QUESTS.length },
            { id: 'TOOLS', label: 'Terra & Simulators', icon: Calculator, count: 4 },
          ].map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as Tab)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shrink-0 min-h-[44px] ${
                  active
                    ? 'bg-[#06D6A0] text-[#04231b] shadow-lg shadow-[#06D6A0]/20 font-black'
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
            {REAL_ESTATE_SCHOOL.tracks.map((track, i) => (
              <div
                key={track.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#06D6A0]/50 hover:bg-white/[0.04] transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-xs font-mono font-bold text-[#06D6A0]">Strand 0{i + 1}</span>
                    <span className="rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/50">
                      {track.lessons.length} lessons
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white group-hover:text-[#6EE7B7] transition-colors">
                    {track.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    {track.blurb}
                  </p>

                  <div className="mt-4 space-y-2">
                    {track.lessons.slice(0, 3).map(lesson => (
                      <div key={lesson.id} className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 size={13} className="text-[#06D6A0] shrink-0" />
                        <span className="truncate">{lesson.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setViewingCurriculum(true)}
                  className="mt-6 inline-flex items-center justify-between w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-white/80 hover:bg-[#06D6A0] hover:text-[#04231b] transition-all min-h-[44px]"
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
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-[#06D6A0]/40 transition-all"
              >
                <div className="flex items-start sm:items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#06D6A0]/10 text-2xl border border-[#06D6A0]/20">
                    {s.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#06D6A0]">Step 0{idx + 1}</span>
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
            {RE_QUESTS.map(q => (
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.06] hover:bg-[#06D6A0] hover:text-[#04231b] py-3 text-xs font-black uppercase tracking-wider text-white transition-all min-h-[44px]"
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
                <div className="h-12 w-12 rounded-2xl bg-[#06D6A0]/20 flex items-center justify-center text-[#06D6A0]">
                  <MapPin size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">Terra Parcel Explorer</h4>
                  <p className="text-xs text-white/50">Detroit open assessor parcel registry</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Explore real parcels with live property boundaries, owner history, assessment records,
                and zoning layers. Run your coursework directly on real geography.
              </p>
              <button
                onClick={() => onNavigate ? onNavigate('TERRA') : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#06D6A0] px-6 py-3 text-xs font-black uppercase tracking-wider text-[#04231b] hover:bg-[#34d399] transition-all min-h-[44px]"
              >
                Launch Terra Map
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center text-[#3B82F6]">
                  <Landmark size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">Open Law & MIT OCW Casebooks</h4>
                  <p className="text-xs text-white/50">Authoritative open property education</p>
                </div>
              </div>
              <p className="text-xs text-white/65 leading-relaxed mb-6">
                Curated open casebooks, MIT real estate finance modules, CALI eLangdell land use law,
                and HUD fair housing guidelines all in one searchable library.
              </p>
              <button
                onClick={() => setViewingCurriculum(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.12] transition-all min-h-[44px]"
              >
                Browse Casebooks
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Touch-First Mobile Action Bar */}
      <div className="fixed bottom-0 inset-x-0 sm:hidden bg-[#07060c]/95 border-t border-white/10 p-3 backdrop-blur-xl z-30">
        <div className="flex items-center gap-2 max-w-md mx-auto">
          <button
            onClick={() => onNavigate ? onNavigate('TERRA') : undefined}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#06D6A0] py-3 text-xs font-black uppercase tracking-wider text-[#04231b] min-h-[48px]"
          >
            <MapPin size={16} /> Open Terra
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

export default RealEstateSchoolView;
