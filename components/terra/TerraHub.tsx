/**
 * Terra Hub — the front door.
 *
 * The map (TerraExplorer) is a destination, not the landing. Terra opens here: a
 * directory of the real-estate + civic surfaces, framed by the local-first story
 * — Detroit now, tri-county next, Michigan and outward deliberately, because
 * zoning and civic data are hand-verified per jurisdiction rather than scraped
 * nationwide and hoped-for.
 *
 * This page reads no data — it renders instantly and is safe as the entry point.
 * Live surfaces navigate; planned ones are labelled honestly, never faked.
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { TerraLookup } from './TerraLookup';
import {
  MapPin, Building2, FileText, Home, Ruler, Landmark, Rss, Film,
  Compass, ArrowRight, ShieldCheck, Layers, Search, Store, Sparkles,
} from 'lucide-react';

const ACCENT = '#FF8C00';        // Terra — surveyor's flag / Plajah primary
const PRO = '#5B8DEF';           // real-estate blueprint blue
const CIVIC = '#FF3D80';         // civic magenta
const MEASURE = '#4FC3D6';       // data / dimension cyan

const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const kicker = 'text-[10px] font-black uppercase tracking-[0.25em] text-white/30';

type Audience = 'all' | 'citizen' | 'pro';
type Status = 'live' | 'soon';

interface Service {
  id: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  accent: string;
  status: Status;
  audience: Exclude<Audience, 'all'>[];
  /** live-only: where it goes */
  target?: string;
  href?: string;
  /** Marks a raw machine endpoint (opens JSON), so it reads as a dev feed, not a page. */
  dataFeed?: boolean;
}

const SERVICES: Service[] = [
  {
    id: 'explorer', title: 'Map Explorer', accent: ACCENT, status: 'live', audience: ['citizen', 'pro'],
    target: 'TERRA_MAP', icon: <MapPin size={18} />,
    blurb: 'Every parcel in the city — with the civic layers a neighbour actually wants: permits, blight, rental compliance, demolitions, 311 and Land Bank.',
  },
  {
    id: 'passport', title: 'Property Passport', accent: ACCENT, status: 'live', audience: ['citizen', 'pro'],
    target: 'TERRA_MAP', icon: <FileText size={18} />,
    blurb: 'A record page for every lot, listed or not — taxes, zoning, sale history, and a dated timeline of what has happened on it.',
  },
  {
    id: 'listings', title: 'Listings', accent: PRO, status: 'live', audience: ['pro'],
    target: 'TERRA_LISTINGS', icon: <Home size={18} />,
    blurb: 'Create and publish listings on the open record — fingerprinted at publish, joined to the public parcel, and owned by you, not a portal.',
  },
  {
    id: 'olr', title: 'Open Listing Record', accent: CIVIC, status: 'live', audience: ['pro', 'citizen'],
    target: 'TERRA_FEED', icon: <Rss size={18} />, dataFeed: true,
    blurb: 'The open, mirrorable listing feed other sites and tools read. RESO-aligned — the data set free, with a spec instead of a wall.',
  },
  {
    id: 'compliance', title: 'Business Compliance', accent: PRO, status: 'live', audience: ['pro'],
    target: 'BUSINESS_DASHBOARD', icon: <ShieldCheck size={18} />,
    blurb: 'Permits, inspections and licence renewals for your storefront, tracked off the same records — with deep links to the city portals to file.',
  },
  {
    id: 'studio', title: 'Parcel Studio', accent: PRO, status: 'live', audience: ['pro', 'citizen'],
    target: 'TERRA_STUDIO', icon: <Ruler size={18} />,
    blurb: 'Zoning-aware massing — compute the legal buildable envelope from a parcel and see what could go there, shadow study included.',
  },
  {
    id: 'film', title: 'Listing Film', accent: PRO, status: 'live', audience: ['pro'],
    target: 'TERRA_FILM', icon: <Film size={18} />,
    blurb: 'Narrate a walkthrough and it cuts itself — the tour auto-segments into titled room scenes from what you say, ready to render.',
  },
  {
    id: 'scout', title: 'Site Scout', accent: CIVIC, status: 'live', audience: ['pro'],
    target: 'TERRA_SCOUT', icon: <Compass size={18} />,
    blurb: 'Commercial site selection — daytime population, traffic, competitor density and drive-time trade areas, for choosing a shopfront.',
  },
];

const TABS: { id: Audience; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'citizen', label: 'For residents' },
  { id: 'pro', label: 'For real-estate pros' },
];

// Detroit → outward. We start where we can be accurate.
const COVERAGE: { label: string; note: string; status: 'live' | 'next' | 'planned' | 'vision' }[] = [
  { label: 'Detroit', note: '377,863 parcels · daily', status: 'live' },
  { label: 'Wayne · Oakland · Macomb', note: '132 municipalities', status: 'next' },
  { label: 'Michigan', note: 'statewide', status: 'planned' },
  { label: 'Outward', note: 'city by city', status: 'vision' },
];

const COV_STYLE: Record<string, { dot: string; text: string; chip: string }> = {
  live:    { dot: '#3DD68C', text: 'text-white',    chip: 'Live now' },
  next:    { dot: ACCENT,    text: 'text-white/70', chip: 'Next' },
  planned: { dot: '#6F7689', text: 'text-white/45', chip: 'Planned' },
  vision:  { dot: '#3A3F4C', text: 'text-white/35', chip: 'The vision' },
};

export interface TerraHubProps {
  onNavigate?: (target: string, params?: any) => void;
}

export const TerraHub: React.FC<TerraHubProps> = ({ onNavigate }) => {
  const [tab, setTab] = useState<Audience>('all');

  const visible = SERVICES.filter(s => tab === 'all' || s.audience.includes(tab as Exclude<Audience, 'all'>));

  const open = (s: Service) => {
    if (s.status !== 'live') return;
    if (s.href) { window.open(s.href, '_blank', 'noopener'); return; }
    if (s.target && onNavigate) onNavigate(s.target);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-transparent text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        {/* plat-grid backdrop */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.5] pointer-events-none" aria-hidden="true">
          <defs>
            <pattern id="terra-grid" width="34" height="34" patternUnits="userSpaceOnUse">
              <path d="M34 0H0V34" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="1" />
            </pattern>
            <radialGradient id="terra-glow" cx="18%" cy="0%" r="60%">
              <stop offset="0%" stopColor="rgba(255,140,0,.16)" />
              <stop offset="100%" stopColor="rgba(255,140,0,0)" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#terra-grid)" />
          <rect width="100%" height="100%" fill="url(#terra-glow)" />
        </svg>

        <div className="relative max-w-5xl mx-auto px-6 pt-12 pb-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center border"
                   style={{ background: `${ACCENT}20`, borderColor: `${ACCENT}40` }}>
                <MapPin size={16} style={{ color: ACCENT }} />
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border"
                    style={{ color: ACCENT, borderColor: `${ACCENT}55`, background: `${ACCENT}14` }}>
                ● Early access · Detroit
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95]">Terra</h1>
            <p className="mt-3 text-lg text-white/60 max-w-2xl leading-relaxed">
              The property &amp; civic layer for a city. Real-estate tools and public-record
              transparency on one map — free for residents, powerful for the pros.
            </p>
            <p className="mt-3 text-[13px] text-white/35 max-w-2xl leading-relaxed">
              Starting in <span className="text-white/60 font-semibold">Detroit</span> and growing outward
              deliberately. Zoning and civic data are hand-verified per jurisdiction, so Terra earns each
              new city rather than scraping the country and hoping it's right.
            </p>

            {/* jump to map */}
            <button onClick={() => onNavigate?.('TERRA_MAP')}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-black text-xs font-black uppercase tracking-widest transition-all hover:brightness-110"
              style={{ background: ACCENT }}>
              <Search size={13} /> Explore the map <ArrowRight size={13} />
            </button>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Early-access notice — the first thing an out-of-town visitor reads. */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 flex items-start gap-4"
          style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}33` }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: `${ACCENT}22`, color: ACCENT }}>
            <Sparkles size={17} />
          </div>
          <div>
            <p className="text-sm font-black text-white">Early access · Detroit only, for now</p>
            <p className="mt-1 text-[12px] text-white/55 leading-relaxed max-w-3xl">
              Terra is a new feature, built <span className="text-white/80 font-semibold">local-first on purpose</span>.
              Right now it covers <span className="text-white/80 font-semibold">Detroit</span> — so if you're
              somewhere else, what you see here is a preview of what's coming to your area, not the finished
              product. It will expand city by city and keep maturing as it goes. Expect rough edges, and
              expect it to get deeper and wider over time.
            </p>
          </div>
        </motion.div>

        {/* Public-record lookup — the two answers a resident/business wants most,
            surfaced before the tool directory so the map isn't the only door in. */}
        <section>
          <TerraLookup onOpenParcel={(parcelId) =>
            onNavigate?.('TERRA_PASSPORT', { terraTarget: { parcelId } })} />
        </section>

        {/* Directory */}
        <section>
          <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
            <p className={kicker}>The suite</p>
            <div className="flex gap-1.5">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    tab === t.id ? 'text-black' : 'bg-white/5 text-white/40 hover:text-white/70'}`}
                  style={tab === t.id ? { background: ACCENT } : {}}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((s, i) => {
              const live = s.status === 'live';
              return (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  onClick={() => open(s)}
                  disabled={!live}
                  className={`${card} p-5 text-left transition-all group ${
                    live ? 'hover:border-white/20 cursor-pointer' : 'opacity-70 cursor-default'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                         style={{ background: `${s.accent}1c`, color: s.accent }}>
                      {s.icon}
                    </div>
                    {s.dataFeed ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{ color: MEASURE, background: `${MEASURE}18` }}>Open data</span>
                    ) : live ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{ color: '#3DD68C', background: '#3DD68C14' }}>Live</span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-white/35 bg-white/5">Coming</span>
                    )}
                  </div>
                  <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                    {s.title}
                    {live && <ArrowRight size={13} className="text-white/25 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />}
                  </h3>
                  <p className="mt-1.5 text-[12px] text-white/45 leading-relaxed">{s.blurb}</p>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Coverage roadmap */}
        <section>
          <p className={`${kicker} mb-4`}>Where Terra reaches — and where it's headed</p>
          <div className={`${card} p-5`}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {COVERAGE.map((c, i) => {
                const st = COV_STYLE[c.status];
                return (
                  <div key={c.label} className="relative">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.dot }} />
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: st.dot }}>{st.chip}</span>
                    </div>
                    <p className={`text-sm font-black leading-tight ${st.text}`}>{c.label}</p>
                    <p className="text-[11px] text-white/30 mt-0.5">{c.note}</p>
                    {i < COVERAGE.length - 1 && (
                      <div className="hidden lg:block absolute top-1 right-0 translate-x-1/2 text-white/15">
                        <ArrowRight size={13} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-5 pt-4 border-t border-white/[0.06] text-[11px] text-white/35 leading-relaxed">
              The tri-county build waits on hand-encoded zoning for 132 municipalities — the honest
              bottleneck, and the reason Terra is accurate where it claims to be.
            </p>
          </div>
        </section>

        {/* Open-data band */}
        <section>
          <div className="rounded-2xl p-6 flex items-start gap-4 flex-wrap"
               style={{ background: `${CIVIC}12`, border: `1px solid ${CIVIC}33` }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: `${CIVIC}22`, color: CIVIC }}>
              <Layers size={18} />
            </div>
            <div className="flex-1 min-w-[240px]">
              <p className="text-sm font-black text-white">Built on public record, published back open</p>
              <p className="mt-1 text-[12px] text-white/50 leading-relaxed max-w-2xl">
                Every parcel and civic fact comes from the City of Detroit's open data and carries its
                own vintage — you always see when it was true. Listings publish to an open, mirrorable
                feed anyone can build on. That's the point: set the data free rather than fence it in.
              </p>
            </div>
            <a href="/api/terra/olr-schema" target="_blank" rel="noopener noreferrer"
               className="self-center inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white/90 transition-colors shrink-0">
              <Rss size={12} /> Spec · JSON
            </a>
          </div>
        </section>

        <p className="text-[9px] text-white/20 text-center pb-4">
          Public record via City of Detroit Open Data · provided as-is, without warranty.
        </p>
      </div>
    </div>
  );
};

export default TerraHub;
