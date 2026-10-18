import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Landmark, Church, HeartHandshake, Sparkles, Search, MapPin, BadgeCheck, Users,
  Plus, ArrowRight, ChevronRight, ChevronLeft, MonitorPlay, Gift, HandHeart,
  GraduationCap, Music, KeyRound, UserCheck, ShieldCheck, Globe, BookOpen,
  Play, Pause, Radio, ShoppingBag, Wallet, MessagesSquare, CheckCircle2,
  Zap, Eye, Layers, Compass, Building2, Star, Calendar, Bell
} from 'lucide-react';
import { fetchPublicOrganizations, openElevateGatewayModal } from '../services/organizationService';
import { DEMO_CHURCH, DEMO_CHURCH_ID } from '../data/demoShowcase';
import { orgMediaUids, fetchLiveOwnerSet } from '../services/orgMedia';
import { Organization, OrgType } from '../types';
import { TYPE } from '../src/lib/designSystem';
import AriaMark from './aria/AriaMark';
import PlajahPlusBanner from './PlajahPlusBanner';

export type ElevateLayoutVariant = 'A_BUSINESS_DIRECTORY' | 'B_LOREA_STAGE' | 'C_PORTAL_CONCIERGE';

interface PlajahElevateProps {
  /** Open an institution's public hub. */
  onOpenOrg: (orgId: string) => void;
  /** List / create a new institution (start the org onboarding flow). */
  onCreate: () => void;
  /** Optional platform navigation callback for Ambo, Sacred Library, Charity, etc. */
  onNavigate?: (target: string, params?: any) => void;
  isSignedIn: boolean;
  /** Admins can seed the demo church directly from here. */
  isAdmin?: boolean;
}

/** Categories in the directory — maps human sections to OrgType & sub-tags. */
const SECTIONS: {
  key: string;
  orgType: OrgType;
  title: string;
  shortLabel: string;
  blurb: string;
  sub: string;
  icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>;
  accent: string;
}[] = [
  {
    key: 'spiritual',
    orgType: 'CHURCH',
    title: 'Churches & Ministries',
    shortLabel: 'Spiritual',
    blurb: 'Churches, ministries, temples, mosques & congregations',
    sub: 'Congregations · worship · giving',
    icon: Church,
    accent: '#8B5CF6',
  },
  {
    key: 'cultural',
    orgType: 'CULTURAL',
    title: 'Cultural Institutions',
    shortLabel: 'Cultural',
    blurb: 'Museums, cultural centers, heritage & the arts',
    icon: Landmark,
    sub: 'Museums · heritage · archives',
    accent: '#FF8C00',
  },
  {
    key: 'nonprofit',
    orgType: 'NONPROFIT',
    title: 'Nonprofits & Causes',
    shortLabel: 'Nonprofit',
    blurb: 'Charities, foundations & community organizations',
    sub: 'Foundations · relief · community',
    icon: HeartHandshake,
    accent: '#06D6A0',
  },
  {
    key: 'religious',
    orgType: 'RELIGIOUS',
    title: 'Global Faith Traditions',
    shortLabel: 'Interfaith',
    blurb: 'Synagogues, masjids, temples, parishes & fellowships',
    sub: 'Sacred traditions · study · fellowship',
    icon: Globe,
    accent: '#00DAF3',
  },
];

/** Six core capabilities every Elevate organization gets out of the box. */
const ELEVATE_CAPABILITIES: {
  title: string;
  desc: string;
  color: string;
  icon: React.FC<{ size?: number }>;
  power?: string;
  stat: string;
  wide?: boolean;
  actionKey?: string;
}[] = [
  {
    title: 'Ambo Sanctuary Stage & Live Broadcast',
    color: '#8B5CF6',
    icon: MonitorPlay,
    wide: true,
    desc: 'Run scripture, worship lyrics, lower-thirds and multi-screen sanctuary walls from your browser — while streaming live to every member at home.',
    power: 'Powered by Ambo Pro & Plajah Live',
    stat: 'Dual-output stage · NDI & TV receiver · Follow-Along scripture on phones',
    actionKey: 'AMBO_PRO',
  },
  {
    title: 'Zero-Platform-Fee Tithes & Funds',
    color: '#06D6A0',
    icon: Gift,
    desc: 'Designated giving funds (Tithes, Building Fund, Missions, Youth) with instant receipts and direct Stripe payouts.',
    stat: 'Tithes · designated funds · Finance Hub',
    actionKey: 'GIVE',
  },
  {
    title: 'Pre-Provisioned Member Seats',
    color: '#FF8C00',
    icon: KeyRound,
    desc: 'Import from Servant Keeper, Planning Center, Breeze or CCB. Members claim their seat with their Member ID.',
    stat: 'Member ID claim · QR cards · approval workflow',
    actionKey: 'CLAIM',
  },
  {
    title: 'Departments, Choir & Christian Ed',
    color: '#D40055',
    icon: Users,
    desc: 'Every ministry gets its own space, chat room, roster, and public or private feed — from Music Department to Sunday School.',
    stat: 'Ministry spaces · rehearsal stems · curricula',
    actionKey: 'DEMO',
  },
  {
    title: 'Prayer Wall & Pastoral Care',
    color: '#00DAF3',
    icon: HandHeart,
    desc: 'Congregants share prayer requests, click "Praying for you", and route private pastoral care needs to elders.',
    stat: 'Public & private prayer · care team routing',
    actionKey: 'DEMO',
  },
  {
    title: 'Bookkeeping, Approvals & Store',
    color: '#D0BCFF',
    icon: Wallet,
    desc: 'Dual-signature spending approvals, receipts, volunteer rosters, and a bookstore/merch table built in.',
    stat: 'Spending desk · audit trail · merch & books',
    actionKey: 'DEMO',
  },
];

const AMBO_DEMO_SLIDES = [
  {
    kind: 'SCRIPTURE',
    ref: 'ISAIAH 40:31 · KJV',
    text: '“But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles…”',
    note: 'Ambo projects onto sanctuary screens + beams interactive Follow-Along text to every phone in the pews.',
  },
  {
    kind: 'WORSHIP',
    ref: 'CHOIR & WORSHIP · VERSE 2',
    text: '“Great is Thy faithfulness, O God my Father; There is no shadow of turning with Thee…”',
    note: 'Synced with the Music Department chord charts, stems, and stage confidence monitor.',
  },
  {
    kind: 'GIVING',
    ref: 'TITHES & OFFERINGS · GRACE CHAPEL',
    text: 'Tap “Give Now” on your phone or scan the sanctuary QR — 4 funds open (General, Missions, Youth, Building).',
    note: 'Zero platform cut on generosity. Instant tax-ready ledger in Elevate Finance Hub.',
  },
  {
    kind: 'PRAYER',
    ref: 'CONGREGATION PRAYER WALL · LIVE',
    text: '“Praying for Sister Evelyn’s recovery and our Youth Mission trip departing Friday morning.” — 48 Amen’s',
    note: 'Real-time prayer wall moderated by your Prayer Warriors & Pastoral Care team.',
  },
];

/** Shared Organization Card in the Plajah Business / Lorea visual language */
const ElevateOrgCard: React.FC<{
  org: Organization;
  accent: string;
  onOpen: () => void;
  onClaim?: () => void;
  live?: boolean;
}> = ({ org, accent, onOpen, onClaim, live }) => {
  const city = org.location?.city || org.campuses?.[0]?.location;
  const ministryCount = org.ministries?.length || 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="group relative bg-white/[0.03] border border-white/[0.08] rounded-3xl overflow-hidden cursor-pointer hover:border-white/25 hover:bg-white/[0.06] hover:-translate-y-1 transition-all duration-300 flex flex-col"
    >
      {/* Cover */}
      <div className="h-28 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}33 0%, #090512 100%)` }}>
        {org.coverUrl && (
          <img src={org.coverUrl} alt="" className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-500" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090512] via-[#090512]/20 to-transparent" />
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {live && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[8px] font-black uppercase tracking-widest shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live Sanctuary
            </span>
          )}
          {org.isVerified && (
            <span className="flex items-center gap-1 bg-black/65 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10">
              <CheckCircle2 size={9} className="text-[#06D6A0]" />
              <span className="text-[7px] font-black uppercase tracking-widest text-[#06D6A0]">Verified</span>
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 -mt-7 relative z-10 flex-1 flex flex-col">
        <div className="flex items-end gap-3 mb-3">
          {org.logoUrl ? (
            <img src={org.logoUrl} alt="" className="w-13 h-13 rounded-2xl object-cover border-2 border-[#090512] shadow-xl shrink-0 bg-black" style={{ width: 52, height: 52 }} />
          ) : (
            <div
              className="w-13 h-13 rounded-2xl flex items-center justify-center border-2 border-[#090512] shadow-xl shrink-0 font-black text-base text-white"
              style={{ width: 52, height: 52, background: `linear-gradient(135deg, ${accent}66, #140a24)` }}
            >
              {org.name?.[0]?.toUpperCase() || 'E'}
            </div>
          )}
          <div className="pb-0.5 flex-1 min-w-0">
            <h3 className="text-sm font-black tracking-tight text-white truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {org.name}
            </h3>
            <span
              className="inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mt-0.5"
              style={{ color: accent, background: `${accent}1f` }}
            >
              {org.denomination || org.orgKindLabel || org.orgType}
            </span>
          </div>
        </div>

        {city && (
          <div className="flex items-center gap-1 mb-2 text-white/45">
            <MapPin size={10} className="text-white/35 shrink-0" />
            <span className="text-[10px] truncate">{city}</span>
            {typeof org.followerCount === 'number' && org.followerCount > 0 && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-white/40">
                <Users size={10} /> {org.followerCount.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {org.tagline && (
          <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2 mb-3">{org.tagline}</p>
        )}

        {/* Feature pills */}
        <div className="flex flex-wrap gap-1 mb-3 mt-auto">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/55">
            <MonitorPlay size={8} /> Sanctuary
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/55">
            <Gift size={8} /> Giving
          </span>
          {ministryCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/55">
              <Users size={8} /> {ministryCount} Ministries
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/[0.06] border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/80 group-hover:bg-white/12 group-hover:text-white transition-all"
          >
            Enter Hub <ArrowRight size={10} />
          </button>
          {onClaim && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClaim(); }}
              title="Claim or Request Membership"
              className="px-3 py-2.5 bg-[#8B5CF6]/15 border border-[#8B5CF6]/35 hover:bg-[#8B5CF6]/30 rounded-2xl text-[9px] font-black uppercase tracking-widest text-[#D0BCFF] transition-all"
            >
              Join
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const PlajahElevate: React.FC<PlajahElevateProps> = ({ onOpenOrg, onCreate, onNavigate, isSignedIn }) => {
  // Layout Switcher — lets the user compare all 3 requested Plajah Design Language layouts live!
  const [layout, setLayout] = useState<ElevateLayoutVariant>(() => {
    if (typeof window !== 'undefined') {
      const lp = (new URLSearchParams(window.location.search).get('layout') || '').toLowerCase();
      if (lp === '2' || lp === 'b' || lp === 'lorea' || lp === 'stage') return 'B_LOREA_STAGE';
      if (lp === '3' || lp === 'c' || lp === 'portal' || lp === 'gateway') return 'C_PORTAL_CONCIERGE';
    }
    return 'A_BUSINESS_DIRECTORY';
  });
  const [elevateTheme, setElevateTheme] = useState<'plajah' | 'dark' | 'pastel'>('plajah');

  const [orgsByType, setOrgsByType] = useState<Record<string, Organization[]>>({
    spiritual: [DEMO_CHURCH],
    cultural: [],
    nonprofit: [],
    religious: [],
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('all');
  const [liveUids, setLiveUids] = useState<Set<string>>(new Set());

  // Interactive states for Layout B (Lorea Interactive Sanctuary Stage) & Layout C (Portal Concierge)
  const [slideIdx, setSlideIdx] = useState(0);
  const [autoCycleStage, setAutoCycleStage] = useState(false);
  const [memberIdQuick, setMemberIdQuick] = useState('');
  const [lastNameQuick, setLastNameQuick] = useState('');
  const [portalDoor, setPortalDoor] = useState<'CLAIM' | 'JOIN' | 'EXPLORE' | 'CREATE'>('CLAIM');

  const carRef1 = useRef<HTMLDivElement>(null);

  const load = async () => {
    const results = await Promise.all(
      SECTIONS.map(s => fetchPublicOrganizations(s.orgType).catch(() => [] as Organization[]))
    );
    const map: Record<string, Organization[]> = {};
    SECTIONS.forEach((s, i) => { map[s.key] = results[i]; });
    map['spiritual'] = [DEMO_CHURCH, ...(map['spiritual'] || []).filter(o => o.id !== DEMO_CHURCH_ID)];
    setOrgsByType(map);
    setLoading(false);
    const accountUids = Object.values(map).flat().flatMap(o => orgMediaUids(o));
    fetchLiveOwnerSet(accountUids).then(setLiveUids).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!autoCycleStage) return;
    const t = window.setInterval(() => {
      setSlideIdx(i => (i + 1) % AMBO_DEMO_SLIDES.length);
    }, 3600);
    return () => window.clearInterval(t);
  }, [autoCycleStage]);

  const allOrgs = useMemo(() => {
    const seen = new Set<string>();
    const list: { org: Organization; sectionKey: string; accent: string }[] = [];
    for (const s of SECTIONS) {
      for (const o of orgsByType[s.key] || []) {
        if (!seen.has(o.id)) {
          seen.add(o.id);
          list.push({ org: o, sectionKey: s.key, accent: s.accent });
        }
      }
    }
    return list;
  }, [orgsByType]);

  const filterList = (list: Organization[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(o =>
      o.name?.toLowerCase().includes(q) ||
      o.tagline?.toLowerCase().includes(q) ||
      o.denomination?.toLowerCase().includes(q) ||
      o.location?.city?.toLowerCase().includes(q) ||
      o.tags?.some(t => t.toLowerCase().includes(q))
    );
  };

  const filteredAllOrgs = useMemo(() => {
    const base = activeSection === 'all'
      ? allOrgs
      : allOrgs.filter(item => item.sectionKey === activeSection);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(({ org: o }) =>
      o.name?.toLowerCase().includes(q) ||
      o.tagline?.toLowerCase().includes(q) ||
      o.denomination?.toLowerCase().includes(q) ||
      o.location?.city?.toLowerCase().includes(q) ||
      o.tags?.some(t => t.toLowerCase().includes(q))
    );
  }, [allOrgs, activeSection, query]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const triggerNavigate = (target: string, params?: any) => {
    if (onNavigate) {
      onNavigate(target, params);
    } else {
      window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target, ...params } }));
    }
  };

  const handleCapabilityAction = (actionKey?: string) => {
    if (actionKey === 'AMBO_PRO') {
      triggerNavigate('AMBO_PRO');
    } else if (actionKey === 'CLAIM') {
      openElevateGatewayModal({ mode: 'claim' });
    } else if (actionKey === 'GIVE' || actionKey === 'DEMO') {
      onOpenOrg(DEMO_CHURCH_ID);
    } else {
      onCreate();
    }
  };

  const currentSlide = AMBO_DEMO_SLIDES[slideIdx];

  // Theme wrapper styles for Pastel / Dark / Plajah
  const rootBg =
    elevateTheme === 'pastel'
      ? 'bg-[#fdf6e3] text-[#073642]'
      : elevateTheme === 'dark'
      ? 'bg-[#030305] text-white'
      : 'bg-[#0b0214] text-white';

  return (
    <div className={`w-full min-h-screen overflow-y-auto custom-scrollbar transition-colors duration-500 ${rootBg}`}>
      {/* ── STICKY TOP DESIGN LAYOUT SWITCHER + NAV ── */}
      <div className="sticky top-0 z-40 bg-[#0a0612]/90 backdrop-blur-xl border-b border-white/[0.08] text-white">
        {/* Top Layout Selector Bar — lets user toggle between the 3 requested Plajah Elevate layouts */}
        <div className="bg-gradient-to-r from-[#6B0099]/35 via-[#D40055]/25 to-[#FF8C00]/25 border-b border-white/[0.07] px-4 py-2">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Elevate Redesign · 3 Layouts
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Choose Elevate layout">
              {([
                { id: 'A_BUSINESS_DIRECTORY' as const, num: '01', label: 'Flagship Hub (Business Style)' },
                { id: 'B_LOREA_STAGE' as const,        num: '02', label: 'Living Sanctuary (Lorea Style)' },
                { id: 'C_PORTAL_CONCIERGE' as const,   num: '03', label: 'Congregation Portal & Gateway' },
              ]).map(opt => {
                const active = layout === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setLayout(opt.id)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      active
                        ? 'text-white shadow-[0_6px_20px_rgba(212,0,85,0.4)] scale-[1.02]'
                        : 'bg-white/[0.06] text-white/55 hover:text-white border border-white/10'
                    }`}
                    style={active ? { background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' } : undefined}
                  >
                    <span className="font-mono opacity-75">{opt.num}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Elevate Sticky Nav */}
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
          <div className="flex items-center gap-3 mr-2">
            <div
              className="w-8 h-8 rounded-[10px] grid place-items-center text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 8px 24px rgba(212,0,85,.34)' }}
            >
              <Church size={16} />
            </div>
            <div className="leading-none">
              <div className="text-[16px] font-black tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>Plajah Elevate</div>
              <div className="text-[8px] font-black uppercase tracking-[0.22em] text-white/40 mt-0.5">Faith · Culture · Causes</div>
            </div>
          </div>

          <button onClick={() => scrollTo('elevate-dir')} className="hidden md:block px-3 py-2 rounded-full text-[12.5px] font-bold text-white/55 hover:text-white hover:bg-white/5 transition-all">Directory</button>
          <button onClick={() => scrollTo('elevate-caps')} className="hidden md:block px-3 py-2 rounded-full text-[12.5px] font-bold text-white/55 hover:text-white hover:bg-white/5 transition-all">For Leaders</button>
          <button onClick={() => scrollTo('elevate-doors')} className="hidden md:block px-3 py-2 rounded-full text-[12.5px] font-bold text-white/55 hover:text-white hover:bg-white/5 transition-all">All Doors</button>
          <button onClick={() => openElevateGatewayModal({ mode: 'claim' })} className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider text-[#D0BCFF] bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 hover:bg-[#8B5CF6]/25 transition-all">
            <KeyRound size={12} /> Claim Member ID
          </button>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Theme pill switcher (from Lorea) */}
            <div className="hidden xl:flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-full p-1">
              {(['plajah', 'dark', 'pastel'] as const).map(th => (
                <button
                  key={th}
                  type="button"
                  onClick={() => setElevateTheme(th)}
                  className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                    elevateTheme === th ? 'bg-[#D40055] text-white' : 'text-white/45 hover:text-white'
                  }`}
                >
                  {th}
                </button>
              ))}
            </div>

            <div className="relative hidden sm:block">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                type="text"
                placeholder="Search churches, cities, causes…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-52 bg-white/[0.05] border border-white/10 rounded-full py-2 pl-9 pr-4 text-[12px] font-medium text-white outline-none focus:border-white/30 transition-all placeholder:text-white/30"
              />
            </div>

            <button
              onClick={onCreate}
              className="flex items-center gap-2 px-4 h-10 rounded-full text-[12px] font-black tracking-tight text-white hover:-translate-y-px transition-transform whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 8px 24px rgba(212,0,85,.34)', fontFamily: 'Outfit, sans-serif' }}
            >
              <Plus size={14} /> {isSignedIn ? 'Launch Organization' : 'Start Free'}
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          LAYOUT 1 — FLAGSHIP HUB (PLAJAH SMALL BUSINESS INSPIRED)
          ===================================================================== */}
      {layout === 'A_BUSINESS_DIRECTORY' && (
        <div>
          {/* ── HERO (Small Business kinetic Outfit italic uppercase style) ── */}
          <header className="relative overflow-hidden border-b border-white/[0.08]">
            <div className="pointer-events-none absolute -top-40 -right-24 w-[36rem] h-[36rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(139,92,246,.35),transparent 66%)' }} />
            <div className="pointer-events-none absolute -bottom-52 -left-28 w-[32rem] h-[32rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(212,0,85,.38),transparent 66%)' }} />
            <div className="pointer-events-none absolute top-12 left-1/2 w-[24rem] h-[24rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(255,140,0,.20),transparent 66%)' }} />

            <div className="relative max-w-6xl mx-auto px-6 py-16 sm:py-20 text-center">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] font-black uppercase tracking-[0.35em] text-[#D0BCFF] mb-5"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Plajah Elevate · Faith, Culture &amp; Community
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="font-black italic uppercase leading-[0.86] tracking-[-0.035em]"
                style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(48px,9vw,104px)' }}
              >
                <span className={elevateTheme === 'pastel' ? 'text-[#073642]' : 'text-white'}>Gather. Serve. </span>
                <span
                  className="block"
                  style={{
                    background: 'linear-gradient(135deg,#8B5CF6,#D40055 55%,#FF8C00)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  Elevate.
                </span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="opacity-70 mx-auto mt-6 max-w-2xl leading-relaxed"
                style={{ fontSize: 'clamp(16px,2.1vw,20px)' }}
              >
                Your sanctuary stage, live broadcast, tithes &amp; designated funds, pre-provisioned member accounts, choir &amp; Christian education — all in one app. Free to start. Zero platform cut on giving.
              </motion.p>

              {/* Primary CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="mt-9 flex flex-wrap gap-3 justify-center"
              >
                <button
                  onClick={onCreate}
                  className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight text-white hover:-translate-y-0.5 transition-transform"
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)',
                    boxShadow: '0 10px 34px rgba(212,0,85,.38)',
                  }}
                >
                  <Church size={18} /> Set up your church or org
                </button>
                <button
                  onClick={() => openElevateGatewayModal({ mode: 'claim' })}
                  className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight bg-[#8B5CF6]/20 border border-[#8B5CF6]/45 text-white hover:bg-[#8B5CF6]/30 transition-all"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  <KeyRound size={17} className="text-[#D0BCFF]" /> Claim Member Seat
                </button>
                <button
                  onClick={() => scrollTo('elevate-dir')}
                  className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight bg-white/[0.05] border border-white/15 text-white hover:bg-white/10 transition-all"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  <Search size={17} /> Browse directory
                </button>
              </motion.div>

              {/* Trust Badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.24 }}
                className="mt-7 flex flex-wrap gap-2.5 justify-center"
              >
                {[
                  { t: 'Free to launch', dot: true },
                  { t: '0% platform fee on tithes & giving' },
                  { t: 'Import Servant Keeper · Planning Center · Breeze' },
                  { t: 'Ambo multi-screen sanctuary stage included' },
                ].map(c => (
                  <span key={c.t} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 text-[12.5px] font-semibold text-white/70">
                    {c.dot && <span className="w-1.5 h-1.5 rounded-full bg-[#06D6A0]" style={{ boxShadow: '0 0 0 3px rgba(6,214,160,.2)' }} />}
                    {c.t}
                  </span>
                ))}
              </motion.div>
            </div>
          </header>

          {/* ── 4 PILLAR CATEGORY TILES (Small Business Category Bento) ── */}
          <section className="max-w-6xl mx-auto px-6 py-14">
            <div className="flex items-end justify-between gap-5 mb-6">
              <div>
                <h2 className="font-black italic uppercase tracking-[-0.02em] leading-[0.95]" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(24px,3.4vw,34px)' }}>
                  Find your community
                </h2>
                <p className="text-white/45 text-sm mt-2">Every church, cultural center, faith tradition and nonprofit on Plajah Elevate.</p>
              </div>
              {activeSection !== 'all' && (
                <button
                  onClick={() => setActiveSection('all')}
                  className="text-[12px] font-black text-white/60 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  Show all ({allOrgs.length}) <span className="text-white/40">✕</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {SECTIONS.map(s => {
                const active = activeSection === s.key;
                const count = (orgsByType[s.key] || []).length;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setActiveSection(active ? 'all' : s.key); scrollTo('elevate-dir'); }}
                    className={`group relative overflow-hidden text-left p-5 rounded-3xl border transition-all min-h-[140px] flex flex-col gap-3 ${
                      active ? 'border-white/30 scale-[1.01]' : 'border-white/[0.08] hover:border-white/20'
                    }`}
                    style={{ background: active ? `${s.accent}18` : 'rgba(255,255,255,0.035)' }}
                  >
                    <span className="absolute w-36 h-36 rounded-full blur-[46px] -top-10 -right-10 opacity-40 group-hover:opacity-65 transition-opacity" style={{ background: s.accent }} />
                    <span className="relative w-11 h-11 rounded-2xl grid place-items-center" style={{ background: `${s.accent}22`, color: s.accent }}>
                      <s.icon size={20} />
                    </span>
                    <span className="relative font-black text-[16px] text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.title}</span>
                    <span className="relative mt-auto flex items-center gap-2 text-[11.5px] text-white/45">
                      {count > 0 ? `${count} ${count === 1 ? 'organization' : 'organizations'}` : s.sub}
                      <ChevronRight size={13} className="ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" style={{ color: s.accent }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── CAPABILITIES VALUE BAND ("One sanctuary runs the whole ministry") ── */}
          <section id="elevate-caps" className="bg-[#07020e] border-y border-white/[0.08]">
            <div className="max-w-6xl mx-auto px-6 py-14">
              <div className="flex items-end justify-between gap-5 mb-7">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    Why pastors, directors &amp; boards choose Plajah Elevate
                  </div>
                  <h2 className="font-black italic uppercase tracking-[-0.02em] leading-[0.95] text-white" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(24px,3.4vw,36px)' }}>
                    One platform runs the whole ministry
                  </h2>
                  <p className="text-white/45 text-sm mt-2 max-w-xl">
                    Replace five disconnected subscriptions (ChMS, projection software, livestreaming, giving, and group chat) with one unified home.
                  </p>
                </div>
                <button
                  onClick={onCreate}
                  className="hidden sm:flex items-center gap-2 text-[12.5px] font-black text-white/75 hover:text-white whitespace-nowrap"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  Start setup <ArrowRight size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ELEVATE_CAPABILITIES.map(cap => (
                  <div
                    key={cap.title}
                    onClick={() => handleCapabilityAction(cap.actionKey)}
                    className={`group relative overflow-hidden p-6 rounded-[28px] border border-white/[0.08] hover:border-white/25 hover:-translate-y-1 transition-all flex flex-col cursor-pointer ${
                      cap.wide ? 'lg:col-span-2' : ''
                    }`}
                    style={{ background: 'linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02))' }}
                  >
                    <span className="absolute inset-0 opacity-50 pointer-events-none" style={{ background: `radial-gradient(120% 120% at 100% 0%, ${cap.color}26, transparent 55%)` }} />
                    <span className="relative w-11 h-11 rounded-2xl grid place-items-center mb-4" style={{ background: `${cap.color}22`, color: cap.color }}>
                      <cap.icon size={22} />
                    </span>
                    <h3 className="relative font-black text-[18px] text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{cap.title}</h3>
                    <p className="relative text-white/60 text-[13.5px] mt-2 leading-relaxed max-w-[48ch]">{cap.desc}</p>
                    {cap.power && (
                      <span className="relative mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-widest text-[#FF8C00]">
                        <Zap size={13} /> {cap.power}
                      </span>
                    )}
                    <span className="relative mt-auto pt-4 text-[11.5px] text-white/40 font-mono flex items-center justify-between gap-2">
                      <span>{cap.stat}</span>
                      <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity text-white" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          LAYOUT 2 — LIVING SANCTUARY STAGE (REBUILT LOREA INSPIRED)
          ===================================================================== */}
      {layout === 'B_LOREA_STAGE' && (
        <div>
          {/* ── SPLIT INTERACTIVE HERO (Lorea 2-Column Stage + Interactive Ambo Sanctuary) ── */}
          <header className="relative overflow-hidden border-b border-white/[0.08]">
            <div className="pointer-events-none absolute -top-24 right-0 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-40" style={{ background: 'radial-gradient(closest-side,rgba(212,0,85,.35),transparent)' }} />
            <div className="max-w-6xl mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-[1fr_1.12fr] gap-10 items-center">
              {/* Left Column: Editorial Headline + CTAs */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.45em] text-[#FF8C00]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Plajah · Elevate · Sanctuary
                </div>
                <h1
                  className="font-black tracking-[-0.045em] leading-[0.94] mt-4"
                  style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(44px,6.8vw,88px)' }}
                >
                  The sanctuary that <span className="text-[#D40055]">gathers your people</span> anywhere.
                </h1>
                <p className="text-white/65 text-[17px] leading-relaxed mt-5 max-w-[44ch]">
                  Scripture that beams to every phone in the pews. Choirs that rehearse with live stems. Tithes with zero platform fees. One home for Sunday morning and the six days in between.
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-7">
                  <button
                    type="button"
                    onClick={() => onOpenOrg(DEMO_CHURCH_ID)}
                    className="px-7 py-4 rounded-full text-[12px] font-black uppercase tracking-[0.2em] text-white transition-transform hover:-translate-y-0.5 shadow-[0_10px_30px_-6px_rgba(212,0,85,0.5)]"
                    style={{ background: '#D40055', fontFamily: 'Outfit, sans-serif' }}
                  >
                    Tour Grace Chapel
                  </button>
                  <button
                    type="button"
                    onClick={() => openElevateGatewayModal({ mode: 'claim' })}
                    className="px-6 py-4 rounded-full text-[12px] font-black uppercase tracking-[0.2em] border border-white/20 hover:border-[#8B5CF6] bg-white/[0.03] text-white transition-all"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    Claim Member ID
                  </button>
                  <span className="text-[#FF8C00] text-xl -rotate-3 ml-1" style={{ fontFamily: 'Gochi Hand, cursive' }}>
                    try the live pulpit ↗
                  </span>
                </div>
              </div>

              {/* Right Column: Interactive 3D Ambo Sanctuary Stage + Follow-Along Bar */}
              <div className="min-w-0" style={{ perspective: '1800px' }}>
                <div
                  className="rounded-[28px] p-5 sm:p-6 border border-[#D40055]/30 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.85)] transition-transform duration-500 hover:scale-[1.01]"
                  style={{
                    background: 'linear-gradient(160deg, rgba(107,0,153,0.28), rgba(15,6,28,0.92))',
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  {/* Stage Mode Selector Pills */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                    <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-full p-1">
                      {AMBO_DEMO_SLIDES.map((s, idx) => (
                        <button
                          key={s.kind}
                          type="button"
                          onClick={() => setSlideIdx(idx)}
                          className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                            slideIdx === idx
                              ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow'
                              : 'text-white/50 hover:text-white'
                          }`}
                        >
                          {s.kind}
                        </button>
                      ))}
                    </div>
                    <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-[#06D6A0]">
                      <span className="w-2 h-2 rounded-full bg-[#06D6A0] animate-ping" /> Ambo Stage Live
                    </span>
                  </div>

                  {/* Simulated Sanctuary Dual Screen */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentSlide.kind}
                      initial={{ opacity: 0, rotateY: -8, scale: 0.98 }}
                      animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                      exit={{ opacity: 0, rotateY: 8, scale: 0.98 }}
                      transition={{ duration: 0.35 }}
                      className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-white/15 p-6 sm:p-8 flex flex-col justify-between"
                      style={{
                        background:
                          slideIdx === 0
                            ? 'radial-gradient(circle at 80% 20%, rgba(139,92,246,0.45), rgba(12,6,24,0.96) 70%)'
                            : slideIdx === 1
                            ? 'radial-gradient(circle at 20% 20%, rgba(212,0,85,0.45), rgba(12,6,24,0.96) 70%)'
                            : slideIdx === 2
                            ? 'radial-gradient(circle at 80% 80%, rgba(6,214,160,0.35), rgba(12,6,24,0.96) 70%)'
                            : 'radial-gradient(circle at 50% 20%, rgba(255,140,0,0.38), rgba(12,6,24,0.96) 70%)',
                      }}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-[#FF8C00]">
                        <span>{currentSlide.ref}</span>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-white/70 text-[8px]">CH 1 · SANCTUARY WALL</span>
                      </div>

                      <p
                        className="font-black text-white leading-snug tracking-tight my-auto"
                        style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(17px,2.2vw,25px)' }}
                      >
                        {currentSlide.text}
                      </p>

                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10 text-[11px] text-white/60">
                        <span className="truncate">{currentSlide.note}</span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-[#D0BCFF] shrink-0">
                          {slideIdx + 1} / {AMBO_DEMO_SLIDES.length}
                        </span>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Interactive Control Pill Bar (Lorea Player style) */}
                  <div className="mt-4 flex items-center gap-3 p-2.5 rounded-full bg-black/45 border border-white/12">
                    <button
                      type="button"
                      onClick={() => setAutoCycleStage(p => !p)}
                      className="w-10 h-10 rounded-full bg-[#D40055] text-white grid place-items-center shrink-0 hover:brightness-110 transition-all"
                      aria-label="Toggle Sanctuary Stage autoplay"
                    >
                      {autoCycleStage ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-white/45">
                        Ambo Presenter · Follow-Along Sync
                      </div>
                      <div className="text-xs font-bold text-white truncate">
                        Click any mode above or press play to preview Sunday morning
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSlideIdx(i => (i + 1) % AMBO_DEMO_SLIDES.length)}
                      className="px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/15 hover:border-[#FF8C00] text-white shrink-0"
                    >
                      Next cue →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* ── LOREA-STYLE HORIZONTAL CAROUSEL OF INSTITUTIONS ── */}
          <section className="max-w-6xl mx-auto px-6 py-12 border-b border-white/[0.08]">
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">Live Sanctuary Shelf</div>
                <h2 className="font-black tracking-tight text-2xl sm:text-3xl mt-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Featured Churches, Ministries &amp; Cultural Houses
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => carRef1.current?.scrollBy({ left: -340, behavior: 'smooth' })}
                  className="w-10 h-10 rounded-full border border-white/15 bg-white/5 hover:border-[#D40055] grid place-items-center"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => carRef1.current?.scrollBy({ left: 340, behavior: 'smooth' })}
                  className="w-10 h-10 rounded-full border border-white/15 bg-white/5 hover:border-[#D40055] grid place-items-center"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            <div ref={carRef1} className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x snap-mandatory">
              {allOrgs.map(({ org, accent }) => (
                <div key={org.id} className="w-[290px] sm:w-[320px] shrink-0 snap-start">
                  <ElevateOrgCard
                    org={org}
                    accent={accent}
                    onOpen={() => onOpenOrg(org.id)}
                    onClaim={() => openElevateGatewayModal({ orgKey: org.handle || org.id, mode: 'claim' })}
                    live={orgMediaUids(org).some(u => liveUids.has(u))}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={onCreate}
                className="w-[260px] shrink-0 snap-start rounded-3xl border border-dashed border-white/15 hover:border-[#FF8C00] p-6 flex flex-col items-center justify-center text-center gap-3 transition-all"
              >
                <span className="w-12 h-12 rounded-2xl grid place-items-center text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055,#FF8C00)' }}>
                  <Plus size={22} />
                </span>
                <span className="font-black text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>Plant Your Sanctuary</span>
                <span className="text-xs text-white/45">Set up departments, giving, and live streaming in two minutes.</span>
              </button>
            </div>
          </section>

          {/* ── SIX PILLARS OF ELEVATE ("Six ways to gather, one sanctuary") ── */}
          <section id="elevate-caps" className="max-w-6xl mx-auto px-6 py-14 border-b border-white/[0.08]">
            <div className="text-[10px] font-black uppercase tracking-[0.45em] text-[#FF8C00]">One Sanctuary</div>
            <h2 className="font-black tracking-[-0.04em] leading-[0.95] mt-3 max-w-xl" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(32px,5vw,56px)' }}>
              Six ways to gather, one connected home.
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-9">
              {[
                { title: 'Ambo Pro Presenter', desc: 'Scripture, lyrics, lower-thirds and stage monitors driven from your browser.', tag: 'Sanctuary Stage', color: '#8B5CF6', icon: MonitorPlay, act: () => triggerNavigate('AMBO_PRO') },
                { title: 'Sacred Library & Lectio', desc: 'Open the Bible and world faith texts with audio narration and study notes.', tag: 'Scripture', color: '#FF8C00', icon: BookOpen, act: () => triggerNavigate('SACRED_LIBRARY') },
                { title: 'Tithes & Finance Hub', desc: 'Multi-fund giving, expense approvals, and automated donor statements.', tag: 'Stewardship', color: '#06D6A0', icon: Gift, act: () => onOpenOrg(DEMO_CHURCH_ID) },
                { title: 'Music & Choir Dept', desc: 'Share setlists, rehearsal stems, sheet music scores and choir rosters.', tag: 'Worship', color: '#D40055', icon: Music, act: () => onOpenOrg(DEMO_CHURCH_ID) },
                { title: 'Christian Education', desc: 'Sunday school classes, youth curricula, lesson plans and family check-in.', tag: 'Discipleship', color: '#00DAF3', icon: GraduationCap, act: () => onOpenOrg(DEMO_CHURCH_ID) },
                { title: 'Prayer Wall & Care', desc: 'Live congregation prayer requests, "Praying for you" counts, and elder care.', tag: 'Fellowship', color: '#D0BCFF', icon: HandHeart, act: () => onOpenOrg(DEMO_CHURCH_ID) },
              ].map(tile => (
                <article
                  key={tile.title}
                  onClick={tile.act}
                  className="p-6 rounded-[28px] border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:-translate-y-2 transition-all duration-300 cursor-pointer flex flex-col gap-3 min-h-[220px]"
                >
                  <div
                    className="w-11 h-11 rounded-2xl grid place-items-center border"
                    style={{ background: `${tile.color}22`, borderColor: `${tile.color}55`, color: tile.color }}
                  >
                    <tile.icon size={21} />
                  </div>
                  <h3 className="font-black text-xl tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>{tile.title}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{tile.desc}</p>
                  <span className="mt-auto font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: tile.color }}>
                    {tile.tag} →
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          LAYOUT 3 — CONGREGATION PORTAL & GATEWAY CONCIERGE
          ===================================================================== */}
      {layout === 'C_PORTAL_CONCIERGE' && (
        <div>
          <header className="relative overflow-hidden border-b border-white/[0.08]">
            <div className="pointer-events-none absolute -top-32 left-1/4 w-[38rem] h-[38rem] rounded-full blur-3xl opacity-35" style={{ background: 'radial-gradient(circle,#8B5CF6,transparent 65%)' }} />
            <div className="pointer-events-none absolute bottom-0 right-10 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-30" style={{ background: 'radial-gradient(circle,#FF8C00,transparent 65%)' }} />

            <div className="relative max-w-6xl mx-auto px-6 py-12 lg:py-16">
              <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 items-start">
                {/* Left: Role-first Welcome & Four Interactive Doors */}
                <div>
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/35 text-[10px] font-black uppercase tracking-[0.25em] text-[#D0BCFF]">
                    <ShieldCheck size={12} /> Official Congregation &amp; Org Gateway
                  </span>
                  <h1
                    className="font-black italic uppercase leading-[0.88] tracking-[-0.035em] mt-4"
                    style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(40px,6.2vw,76px)' }}
                  >
                    Step inside your{' '}
                    <span
                      style={{
                        background: 'linear-gradient(135deg,#8B5CF6,#D40055 55%,#FF8C00)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                      }}
                    >
                      Sanctuary.
                    </span>
                  </h1>
                  <p className="text-white/65 text-base sm:text-lg mt-4 leading-relaxed max-w-xl">
                    Whether you are claiming a pre-provisioned church seat with your Member ID, onboarding your family into a congregation, or setting up a ministry as a pastor — choose your door below.
                  </p>

                  {/* 4 Interactive Gateway Doors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7">
                    {([
                      {
                        id: 'CLAIM' as const,
                        title: 'Claim Member Seat',
                        sub: 'Have a Member ID (e.g. GC-48213) or roster email? Unlock your seat.',
                        icon: KeyRound,
                        color: '#8B5CF6',
                      },
                      {
                        id: 'JOIN' as const,
                        title: 'Request & Onboard',
                        sub: 'Join your church or organization roster & select your ministries.',
                        icon: UserCheck,
                        color: '#06D6A0',
                      },
                      {
                        id: 'EXPLORE' as const,
                        title: 'Follow & Watch Live',
                        sub: 'Public updates, Sunday streams, and giving — no approval required.',
                        icon: Bell,
                        color: '#FF8C00',
                      },
                      {
                        id: 'CREATE' as const,
                        title: 'Launch a Ministry / Org',
                        sub: 'Pastors & directors: seed departments, chat, giving & ChMS in 2 mins.',
                        icon: Sparkles,
                        color: '#D40055',
                      },
                    ]).map(d => {
                      const active = portalDoor === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setPortalDoor(d.id)}
                          className={`text-left p-4 rounded-3xl border transition-all flex flex-col gap-2 ${
                            active
                              ? 'bg-white/[0.09] border-white/35 shadow-xl scale-[1.01]'
                              : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: `${d.color}25`, color: d.color }}>
                              <d.icon size={18} />
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${active ? 'bg-white text-black' : 'text-white/35'}`}>
                              {active ? 'Selected' : 'Select'}
                            </span>
                          </div>
                          <div className="font-black text-[15px] text-white mt-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{d.title}</div>
                          <div className="text-[11.5px] text-white/50 leading-snug">{d.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Live Concierge Card that responds to the selected Door */}
                <div className="relative rounded-[32px] bg-[#10071c] border border-[#8B5CF6]/35 p-6 sm:p-8 shadow-[0_30px_80px_rgba(107,0,153,0.4)]">
                  <div className="absolute -inset-px rounded-[32px] bg-gradient-to-br from-[#8B5CF6]/25 via-transparent to-[#FF8C00]/15 pointer-events-none" />
                  <div className="relative">
                    {portalDoor === 'CLAIM' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#D0BCFF]">
                          <KeyRound size={13} /> Instant Seat Claim · Pre-Provisioned Roster
                        </div>
                        <h3 className="text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                          Claim your pre-provisioned church or org seat
                        </h3>
                        <p className="text-xs text-white/55 leading-relaxed">
                          If your church imported its roster from Servant Keeper, Planning Center, Breeze, or CCB, your seat and ministry roles are already waiting.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">Member ID</label>
                            <input
                              value={memberIdQuick}
                              onChange={e => setMemberIdQuick(e.target.value.toUpperCase())}
                              placeholder="e.g. GC-48213"
                              className="w-full bg-white/[0.06] border border-white/15 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#8B5CF6]"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/45 mb-1">Last Name</label>
                            <input
                              value={lastNameQuick}
                              onChange={e => setLastNameQuick(e.target.value)}
                              placeholder="Your last name"
                              className="w-full bg-white/[0.06] border border-white/15 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#8B5CF6]"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openElevateGatewayModal({ mode: 'claim', memberNumber: memberIdQuick.trim() || undefined })}
                          className="w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition-all"
                          style={{ background: 'linear-gradient(135deg,#6B0099,#8B5CF6)' }}
                        >
                          <KeyRound size={14} /> Lookup &amp; Claim My Seat
                        </button>
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/45">
                          <span>Want to test with Grace Chapel?</span>
                          <button
                            type="button"
                            onClick={() => { setMemberIdQuick('GC-1001'); openElevateGatewayModal({ orgKey: DEMO_CHURCH_ID, mode: 'claim', memberNumber: 'GC-1001' }); }}
                            className="text-[#FF8C00] font-bold hover:underline"
                          >
                            Try Demo Claim →
                          </button>
                        </div>
                      </div>
                    )}

                    {portalDoor === 'JOIN' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#06D6A0]">
                          <UserCheck size={13} /> Congregation Onboarding &amp; Ministry Selection
                        </div>
                        <h3 className="text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                          Request membership &amp; onboard your family
                        </h3>
                        <p className="text-xs text-white/55 leading-relaxed">
                          Doubles as your official church/organization onboarding card and connects your Plajah account to Choir, Youth, Greeters, or Sunday School.
                        </p>
                        <ul className="space-y-2 text-xs text-white/70">
                          {[
                            'Select the ministries and departments you serve in',
                            'Leadership reviews & approves verified congregation members',
                            'Automatically follow public broadcasts while approval is pending',
                          ].map(item => (
                            <li key={item} className="flex items-center gap-2">
                              <CheckCircle2 size={14} className="text-[#06D6A0] shrink-0" /> {item}
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => openElevateGatewayModal({ mode: 'join' })}
                          className="w-full py-4 rounded-2xl text-black bg-[#06D6A0] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition-all"
                        >
                          <UserCheck size={14} /> Open Member Onboarding
                        </button>
                      </div>
                    )}

                    {portalDoor === 'EXPLORE' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#FF8C00]">
                          <MonitorPlay size={13} /> Open Sanctuary · Visitors Welcome
                        </div>
                        <h3 className="text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                          Experience Grace Chapel (Interactive Demo)
                        </h3>
                        <p className="text-xs text-white/55 leading-relaxed">
                          See how a complete church runs on Plajah Elevate — switch between Congregant, Choir/Ministry Leader, and Pastor/Finance views live.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                            <div className="font-black text-white">Sunday Stream &amp; Ambo</div>
                            <div className="text-white/45 text-[10px] mt-0.5">Live sermon + scripture notes</div>
                          </div>
                          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                            <div className="font-black text-white">Giving &amp; Prayer Wall</div>
                            <div className="text-white/45 text-[10px] mt-0.5">4 funds + real-time prayer</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenOrg(DEMO_CHURCH_ID)}
                          className="w-full py-4 rounded-2xl text-black bg-[#FF8C00] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition-all"
                        >
                          <Play size={14} /> Enter Grace Chapel Demo
                        </button>
                      </div>
                    )}

                    {portalDoor === 'CREATE' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#FF8C00]">
                          <Sparkles size={13} /> 2-Minute Sanctuary &amp; Non-Profit Wizard
                        </div>
                        <h3 className="text-2xl font-black text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                          Set up your church, ministry or nonprofit
                        </h3>
                        <ul className="space-y-2 text-xs text-white/70">
                          {[
                            'Departments & ministries pre-seeded for your tradition',
                            'Department chat rooms & social feeds wired automatically',
                            'CSV import from Servant Keeper, Planning Center, Breeze & CCB',
                            'Tithes, designated funds, and dual-approval Spending Desk',
                          ].map(item => (
                            <li key={item} className="flex items-center gap-2">
                              <CheckCircle2 size={14} className="text-[#FF8C00] shrink-0" /> {item}
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={onCreate}
                          className="w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition-all"
                          style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
                        >
                          <Sparkles size={14} /> Launch Setup Wizard
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </header>
        </div>
      )}

      {/* =====================================================================
          SHARED LIVE DIRECTORY + GRACE CHAPEL SPOTLIGHT BANNER
          ===================================================================== */}
      <section id="elevate-dir" className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-[#8B5CF6] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Live Elevate Directory
            </div>
            <h2 className="font-black italic uppercase tracking-[-0.02em] leading-[0.95]" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(26px,3.6vw,38px)' }}>
              {activeSection === 'all'
                ? 'Now Gathering on Plajah Elevate'
                : SECTIONS.find(s => s.key === activeSection)?.title || 'Organizations'}
            </h2>
            <p className="text-white/45 text-sm mt-1.5">
              Churches, ministries, cultural institutions and nonprofits — open their sanctuary hub, follow updates, or claim your member seat.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                activeSection === 'all'
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white/50 hover:text-white border border-white/10'
              }`}
            >
              All ({allOrgs.length})
            </button>
            {SECTIONS.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveSection(s.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeSection === s.key
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white/50 hover:text-white border border-white/10'
                }`}
              >
                <s.icon size={11} />
                {s.shortLabel} ({(orgsByType[s.key] || []).length})
              </button>
            ))}
          </div>
        </div>

        {/* Grace Chapel Interactive Spotlight Banner (mirrors Small Business Demo Spotlight) */}
        {!query && (activeSection === 'all' || activeSection === 'spiritual') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.995 }}
            onClick={() => onOpenOrg(DEMO_CHURCH_ID)}
            className="mb-8 relative overflow-hidden rounded-[28px] cursor-pointer group border border-[#8B5CF6]/35 shadow-[0_20px_60px_-15px_rgba(107,0,153,0.45)]"
          >
            <div className="absolute inset-0">
              {DEMO_CHURCH.coverUrl && (
                <img
                  src={DEMO_CHURCH.coverUrl}
                  alt=""
                  className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 opacity-55"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-[#090314] via-[#090314]/85 to-[#6B0099]/35" />
            </div>

            <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
              {DEMO_CHURCH.logoUrl ? (
                <img
                  src={DEMO_CHURCH.logoUrl}
                  alt=""
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white/20 shadow-2xl shrink-0"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#D40055] grid place-items-center border-2 border-white/20 shadow-2xl shrink-0">
                  <Church size={32} className="text-white" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#8B5CF6]/25 text-[#D0BCFF] border border-[#8B5CF6]/40 flex items-center gap-1">
                    <Sparkles size={9} /> Featured Interactive Sanctuary
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#06D6A0]">
                    <CheckCircle2 size={9} /> Verified Church
                  </span>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-white/45">
                    {DEMO_CHURCH.location?.city || 'Atlanta, GA'}
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {DEMO_CHURCH.name}
                </h3>
                <p className="text-white/65 text-xs sm:text-sm mt-1 line-clamp-2 max-w-2xl">
                  {DEMO_CHURCH.tagline || 'Experience a live multi-ministry congregation with Sunday streams, Ambo scripture follow-along, Music Department, Christian Education, and Finance Hub.'}
                </p>

                <div className="flex flex-wrap gap-2 mt-3.5">
                  {[
                    { label: 'Live Sanctuary Stream', icon: MonitorPlay },
                    { label: '4 Giving Funds', icon: Gift },
                    { label: 'Choir & Music Dept', icon: Music },
                    { label: 'Christian Education', icon: GraduationCap },
                    { label: 'Prayer Wall', icon: HandHeart },
                  ].map(p => (
                    <span
                      key={p.label}
                      className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 bg-white/[0.06] border border-white/10 rounded-full text-white/65"
                    >
                      <p.icon size={9} className="text-[#FF8C00]" /> {p.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="shrink-0 flex flex-col sm:flex-row md:flex-col gap-2 w-full md:w-auto">
                <div className="flex items-center justify-center gap-2 px-5 py-3 bg-[#FF8C00] text-black rounded-2xl text-xs font-black uppercase tracking-widest group-hover:bg-amber-400 transition-colors">
                  Tour Sanctuary <ChevronRight size={14} />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openElevateGatewayModal({ orgKey: DEMO_CHURCH_ID, mode: 'claim' });
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white/80 text-center"
                >
                  Test Member Claim
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Directory Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-28 gap-3 text-white/40">
            <div className="w-8 h-8 border-2 border-white/15 border-t-[#8B5CF6] rounded-full animate-spin" />
            <span className={TYPE.labelSm}>Gathering sanctuaries &amp; institutions…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAllOrgs.map(({ org, accent }) => (
              <ElevateOrgCard
                key={org.id}
                org={org}
                accent={accent}
                onOpen={() => onOpenOrg(org.id)}
                onClaim={() => openElevateGatewayModal({ orgKey: org.handle || org.id, mode: 'claim' })}
                live={orgMediaUids(org).some(u => liveUids.has(u))}
              />
            ))}

            {/* Always-present "Add your institution" card */}
            <button
              type="button"
              onClick={onCreate}
              className="flex flex-col items-center justify-center text-center rounded-3xl border border-dashed border-white/15 hover:border-[#FF8C00]/60 transition-all min-h-[250px] p-6 group bg-white/[0.015]"
            >
              <span
                className="w-12 h-12 rounded-2xl grid place-items-center shadow-lg group-hover:scale-110 transition-transform"
                style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
              >
                <Plus size={22} className="text-white" />
              </span>
              <span className="mt-3.5 font-black text-[15px] text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Your church or org here
              </span>
              <span className="text-[9.5px] font-black uppercase tracking-widest text-[#FF8C00] mt-1.5">
                Free to launch · 2-min setup
              </span>
              <span className="text-[11px] text-white/45 mt-2 max-w-[24ch]">
                Pre-seeded ministries, giving funds, Ambo stage &amp; member claim cards.
              </span>
            </button>
          </div>
        )}
      </section>

      {/* =====================================================================
          EVERY WAY INTO ELEVATE — LOREA "NOTHING HIDDEN, EVERY DOOR" DIRECTORY
          ===================================================================== */}
      <section id="elevate-doors" className="max-w-6xl mx-auto px-6 py-14 border-t border-white/[0.08]">
        <div className="text-[10px] font-black uppercase tracking-[0.45em] text-[#FF8C00]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Every way into Plajah Elevate
        </div>
        <h2 className="font-black tracking-[-0.035em] leading-[0.95] mt-2.5" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(28px,4.5vw,52px)' }}>
          Nothing hidden. Every door, one page.
        </h2>

        {/* Group 1: Worship, Scripture & Sanctuary */}
        <div className="mt-9">
          <h3 className="text-[10px] font-black uppercase tracking-[0.45em] text-[#FF8C00] mb-3.5">
            Worship, Scripture &amp; Stage
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: 'Grace Chapel Demo', sub: 'Full interactive church tour (Member, Leader & Pastor views)', color: '#8B5CF6', act: () => onOpenOrg(DEMO_CHURCH_ID) },
              { title: 'Ambo Pro Presenter', sub: 'Multi-screen scripture, lyrics & sanctuary confidence stage', color: '#D40055', act: () => triggerNavigate('AMBO_PRO') },
              { title: 'Sacred Library', sub: 'World faith traditions, study Bibles & audio scripture', color: '#FF8C00', act: () => triggerNavigate('SACRED_LIBRARY') },
              { title: 'Lectio Bible Reader', sub: 'Chapter-by-chapter study with Follow-Along sync', color: '#00DAF3', act: () => triggerNavigate('BIBLE') },
            ].map(d => (
              <button
                key={d.title}
                type="button"
                onClick={d.act}
                className="flex items-start gap-3.5 p-4 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-white/25 hover:-translate-y-1 transition-all text-left"
              >
                <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: d.color, boxShadow: `0 0 10px ${d.color}` }} />
                <div>
                  <div className="font-black text-[15px] text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{d.title}</div>
                  <div className="text-xs text-white/50 mt-0.5 leading-snug">{d.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Group 2: Membership, ChMS & Operations */}
        <div className="mt-8">
          <h3 className="text-[10px] font-black uppercase tracking-[0.45em] text-[#06D6A0] mb-3.5">
            Membership, ChMS &amp; Leadership
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: 'Claim Member Seat', sub: 'Unlock your pre-provisioned account with Member ID or email', color: '#8B5CF6', act: () => openElevateGatewayModal({ mode: 'claim' }) },
              { title: 'Member Onboarding', sub: 'Submit congregation membership & join ministries', color: '#06D6A0', act: () => openElevateGatewayModal({ mode: 'join' }) },
              { title: 'Launch Setup Wizard', sub: 'Create a church, religious org, cultural center or nonprofit', color: '#FF8C00', act: onCreate },
              { title: 'Charity & Causes Hub', sub: 'Explore community fundraisers and Pay-It-Forward drives', color: '#D0BCFF', act: () => triggerNavigate('CHARITY') },
            ].map(d => (
              <button
                key={d.title}
                type="button"
                onClick={d.act}
                className="flex items-start gap-3.5 p-4 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-white/25 hover:-translate-y-1 transition-all text-left"
              >
                <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: d.color, boxShadow: `0 0 10px ${d.color}` }} />
                <div>
                  <div className="font-black text-[15px] text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{d.title}</div>
                  <div className="text-xs text-white/50 mt-0.5 leading-snug">{d.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          FOUNDER / PASTOR CTA BANNER (Matches Small Business + Aria Prompt)
          ===================================================================== */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div
          className="relative overflow-hidden rounded-[36px] border border-white/15 px-8 sm:px-10 py-14 text-center text-white"
          style={{ background: 'linear-gradient(135deg,rgba(107,0,153,.36),rgba(212,0,85,.20) 55%,rgba(255,140,0,.14))' }}
        >
          <span className="pointer-events-none absolute -top-40 -right-20 w-[26rem] h-[26rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(255,140,0,.28),transparent 66%)' }} />
          <div className="relative text-[11px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Ready for this Sunday
          </div>
          <h2
            className="relative font-black italic uppercase leading-[0.9] tracking-[-0.03em]"
            style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(30px,5vw,58px)' }}
          >
            Bring your sanctuary<br />onto Plajah Elevate
          </h2>
          <p className="relative text-white/70 text-[16px] mt-5 max-w-xl mx-auto leading-relaxed">
            Seed your ministries, import your congregation roster, connect Stripe for direct giving, and open Ambo Pro on your sanctuary screens in minutes.
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={onCreate}
              className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight text-white hover:-translate-y-0.5 transition-transform"
              style={{
                fontFamily: 'Outfit, sans-serif',
                background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)',
                boxShadow: '0 10px 34px rgba(212,0,85,.38)',
              }}
            >
              <ArrowRight size={18} /> Launch your organization
            </button>
            <button
              type="button"
              onClick={() => onOpenOrg(DEMO_CHURCH_ID)}
              className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight bg-white/[0.06] border border-white/15 text-white hover:bg-white/10 transition-all"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              <Play size={16} /> Tour Grace Chapel demo
            </button>
          </div>
          <div className="relative mt-5 flex items-center justify-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Help me set up our church and ministries on Plajah Elevate' } }))}
              className="inline-flex items-center gap-2 text-[12px] font-bold text-white/60 hover:text-white transition-colors"
            >
              <AriaMark size={14} petals={false} /> Need help migrating from Planning Center or Servant Keeper? Ask Aria
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlajahElevate;
