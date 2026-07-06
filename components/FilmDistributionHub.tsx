import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Film, Radio, ShoppingBag, Ticket, Globe, ChevronRight, Pencil,
  Zap, Users, Star, TrendingUp, Play, Check, ArrowRight,
  BarChart2, Tag, FileText, GitBranch, DollarSign, Shield,
  Download, Sparkles, ScrollText,
} from 'lucide-react';
import { fetchUserAlbums, auth } from '../services/backendService';
import type { Album, UserProfile } from '../types';
import FastChannelManager from './FastChannelManager';
import FilmTechnicalQC from './FilmTechnicalQC';
import FilmAggregatorExport from './FilmAggregatorExport';
import FilmPricingManager from './FilmPricingManager';
import FilmTransmediaHub from './FilmTransmediaHub';
import FilmWhatIfEditor from './FilmWhatIfEditor';
import FilmFestivalMode from './FilmFestivalMode';
import FilmAIAssistant from './FilmAIAssistant';

interface Props {
  user: UserProfile;
  onDistributeFilm: () => void;
  /** Open the authoring tool to edit an existing film's details. */
  onEditFilm?: (film: Album) => void;
}

type HubTab =
  | 'OVERVIEW' | 'FAST_CHANNEL'
  | 'PRICING' | 'TECHNICAL_QC' | 'EXPORT'
  | 'TRANSMEDIA' | 'INTERACTIVE' | 'FESTIVAL' | 'AI_TOOLS';

const DISTRIBUTION_TIERS = [
  {
    id: 'FAST',
    label: 'FAST Channel',
    subtitle: 'Free Ad-Supported TV',
    desc: 'Run your own 24/7 channel. Earn ad revenue while giving viewers free access — broadest reach, zero barrier.',
    icon: <Radio size={22} />,
    color: '#22c55e',
    metrics: ['Ad revenue per view', 'Auto-schedule + bumpers', 'Live interrupt support'],
  },
  {
    id: 'DIRECT',
    label: 'Direct Sales',
    subtitle: 'Rent · Buy · PPV',
    desc: 'Set your own rental window and purchase price. 100% of revenue goes to you through Stripe — no rev share with a distributor.',
    icon: <ShoppingBag size={22} />,
    color: '#818cf8',
    metrics: ['Rental (24 / 48 / 72h)', 'Permanent digital purchase', 'PPV ticketed premiere'],
  },
  {
    id: 'PRESS',
    label: 'Festival & Press',
    subtitle: 'Early Access Codes',
    desc: 'Generate unique review codes for press screeners, festival submissions, and editorial access — before public release.',
    icon: <Star size={22} />,
    color: '#f59e0b',
    metrics: ['Unique 8-char codes', 'Usage tracking per code', 'Set expiry & label'],
  },
  {
    id: 'COMMUNITY',
    label: 'Community',
    subtitle: 'Fan Club · Watch Party',
    desc: 'Turn your audience into a community. Fan clubs, watch parties, member-only releases, and live Q&As all in one place.',
    icon: <Users size={22} />,
    color: '#f472b6',
    metrics: ['Fan club memberships', 'Watch party premieres', 'Member-only content'],
  },
];

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_GROUPS: { label: string; items: { id: HubTab; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: 'Distribution',
    items: [
      { id: 'OVERVIEW',      label: 'Overview',        icon: <Film size={14} />        },
      { id: 'FAST_CHANNEL',  label: 'FAST Channel',    icon: <Radio size={14} />       },
      { id: 'PRICING',       label: 'Pricing',         icon: <DollarSign size={14} />  },
      { id: 'TECHNICAL_QC',  label: 'Technical QC',    icon: <Shield size={14} />      },
      { id: 'EXPORT',        label: 'Aggregator Export', icon: <Download size={14} /> },
    ],
  },
  {
    label: 'Production',
    items: [
      { id: 'TRANSMEDIA',  label: 'Transmedia Hub',   icon: <Globe size={14} />       },
      { id: 'INTERACTIVE', label: 'Interactive Film',  icon: <GitBranch size={14} />   },
      { id: 'AI_TOOLS',    label: 'AI Assistant',      icon: <Sparkles size={14} />    },
    ],
  },
  {
    label: 'Community',
    items: [
      { id: 'FESTIVAL',    label: 'Festival Circuit', icon: <Star size={14} />        },
    ],
  },
];

export default function FilmDistributionHub({ user, onDistributeFilm, onEditFilm }: Props) {
  const [tab, setTab] = useState<HubTab>('OVERVIEW');
  const [filmAlbums, setFilmAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(albums => {
      setFilmAlbums(albums.filter(a => a.type === 'VIDEO'));
      setLoading(false);
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const backBtn = (
    <button onClick={() => setTab('OVERVIEW')}
      className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors mb-6">
      ← Film Studio
    </button>
  );

  if (tab === 'FAST_CHANNEL')  return <div>{backBtn}<FastChannelManager user={user} onBack={() => setTab('OVERVIEW')} /></div>;
  if (tab === 'PRICING')       return <div>{backBtn}<FilmPricingManager /></div>;
  if (tab === 'TECHNICAL_QC')  return <div>{backBtn}<FilmTechnicalQC /></div>;
  if (tab === 'EXPORT')        return <div>{backBtn}<FilmAggregatorExport /></div>;
  if (tab === 'TRANSMEDIA')    return <div>{backBtn}<FilmTransmediaHub /></div>;
  if (tab === 'INTERACTIVE')   return <div>{backBtn}<FilmWhatIfEditor /></div>;
  if (tab === 'FESTIVAL')      return <div>{backBtn}<FilmFestivalMode /></div>;
  if (tab === 'AI_TOOLS')      return <div>{backBtn}<FilmAIAssistant /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Distribution<br />Hub</h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Your film distribution OS — no middleman</p>
        </div>
        <button
          onClick={onDistributeFilm}
          className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-[#FF8C00] text-black hover:scale-105 active:scale-95 transition-all shadow-xl flex-shrink-0"
        >
          <Film size={14} /> Distribute New Film
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Films Live',    value: filmAlbums.filter(a => !a.isDraft && !a.isScheduled).length, icon: Film,     color: 'text-[#FF8C00]',  bg: 'bg-[#FF8C00]/15' },
          { label: 'Scheduled',    value: filmAlbums.filter(a => a.isScheduled).length,                  icon: Zap,      color: 'text-sky-400',    bg: 'bg-sky-400/15'   },
          { label: 'FAST Enabled', value: filmAlbums.filter(a => a.isAdSupported).length,                icon: Radio,    color: 'text-green-400',  bg: 'bg-green-400/15' },
          { label: 'Early Access', value: filmAlbums.filter(a => a.earlyAccessEnabled).length,           icon: Star,     color: 'text-yellow-400', bg: 'bg-yellow-400/15'},
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6">
            <div className={`p-3 ${s.bg} rounded-xl w-fit mb-3`}>
              <s.icon className={s.color} size={18} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
            <p className="text-3xl font-black">{loading ? '–' : s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Feature nav grid */}
      <section>
        <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/20 mb-5">Film Studio Tools</p>
        <div className="space-y-6">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/15 mb-3 pl-1">{group.label}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {group.items.filter(i => i.id !== 'OVERVIEW').map(item => (
                  <button key={item.id} onClick={() => setTab(item.id)}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all text-left group">
                    <span className="text-white/25 group-hover:text-[#FF8C00] transition-colors">{item.icon}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors">{item.label}</span>
                    <ArrowRight size={10} className="ml-auto text-white/10 group-hover:text-white/30 transition-all group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Distribution tiers */}
      <section>
        <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/20 mb-5">Distribution Channels</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DISTRIBUTION_TIERS.map((tier, i) => (
            <motion.div key={tier.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
              className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 hover:bg-white/[0.04] transition-all group"
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="p-3 rounded-2xl flex-shrink-0" style={{ background: `${tier.color}15`, color: tier.color }}>
                  {tier.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black uppercase tracking-widest text-white">{tier.label}</h3>
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{ background: `${tier.color}15`, color: tier.color }}>{tier.subtitle}</span>
                  </div>
                  <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed">{tier.desc}</p>
                </div>
              </div>
              <ul className="space-y-1.5 mb-5">
                {tier.metrics.map((m, mi) => (
                  <li key={mi} className="flex items-center gap-2">
                    <Check size={10} style={{ color: tier.color }} className="flex-shrink-0" />
                    <span className="text-[10px] text-white/40">{m}</span>
                  </li>
                ))}
              </ul>
              {tier.id === 'FAST' && (
                <button onClick={() => setTab('FAST_CHANNEL')}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all hover:gap-2.5"
                  style={{ color: tier.color }}>
                  Manage FAST Channel <ArrowRight size={11} />
                </button>
              )}
              {tier.id === 'DIRECT' && (
                <button onClick={onDistributeFilm}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all hover:gap-2.5"
                  style={{ color: tier.color }}>
                  Add a Film <ArrowRight size={11} />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Film catalog */}
      {filmAlbums.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/20">Your Film Catalog</p>
            <button onClick={() => {}}
              className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors flex items-center gap-1">
              View all <ChevronRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filmAlbums.slice(0, 4).map(film => (
              <div key={film.id}
                onClick={() => onEditFilm?.(film)}
                className="bg-white/[0.02] border border-white/5 rounded-[2rem] overflow-hidden hover:bg-white/[0.04] hover:border-[#FF8C00]/25 transition-all group cursor-pointer"
              >
                <div className="relative aspect-video overflow-hidden bg-white/5">
                  {film.coverImage ? (
                    <img src={film.coverImage} alt={film.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Film size={24} className="text-white/15" /></div>
                  )}
                  {onEditFilm && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF8C00] text-black text-[9px] font-black uppercase tracking-widest"><Pencil size={11} /> Edit Details</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs font-black uppercase tracking-tight text-white truncate">{film.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {film.isAdSupported && <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">FAST</span>}
                    {film.isPaywalled && <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400">${film.price}</span>}
                    {film.isScheduled && <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400">Scheduled</span>}
                    {film.isDraft && <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-white/8 text-white/30">Draft</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {filmAlbums.length === 0 && !loading && (
        <div className="py-16 flex flex-col items-center gap-5 border-2 border-dashed border-white/5 rounded-[2.5rem]">
          <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
            <Film size={28} className="text-white/15" />
          </div>
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-widest text-white/20">No films yet</p>
            <p className="text-[10px] text-white/12 mt-1">Click "Distribute New Film" to get started</p>
          </div>
          <button onClick={onDistributeFilm}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-[#FF8C00] text-black hover:scale-105 transition-all">
            <Film size={12} /> Distribute First Film
          </button>
        </div>
      )}
    </motion.div>
  );
}
