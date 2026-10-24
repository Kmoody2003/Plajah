import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useEvRevealAll } from './elevate/vellum';
import {
  Landmark, Church, HeartHandshake, Sparkles, Search, MapPin, BadgeCheck, Users,
  Plus, ArrowRight, ChevronRight, ChevronLeft, MonitorPlay, Gift, HandHeart,
  GraduationCap, Music, KeyRound, UserCheck, ShieldCheck, Globe, BookOpen,
  Play, Pause, Radio, ShoppingBag, Wallet, MessagesSquare, CheckCircle2,
  Zap, Eye, Layers, Compass, Building2, Star, Calendar, Bell, FileText, Share2
} from 'lucide-react';
import { fetchPublicOrganizations, openElevateGatewayModal } from '../services/organizationService';
import { DEMO_CHURCH, DEMO_CHURCH_ID } from '../data/demoShowcase';
import { orgMediaUids, fetchLiveOwnerSet } from '../services/orgMedia';
import { Organization, OrgType, AppView } from '../types';
import { TYPE } from '../src/lib/designSystem';
import { Button } from './ui';
import ElevateOneSheetModal from './elevate/ElevateOneSheetModal';
import AriaMark from './aria/AriaMark';
import { ElevateTabBar, ElevateOverview, ElevateTypePanel, ElevateTabCta, ElevateTabKey, ELEVATE_TABS, tabDef } from './elevate/ElevateTypeTabs';
import PlajahPlusBanner from './PlajahPlusBanner';
import {
  PageVisualConfig,
  EditableCarouselItem,
  PLAJAH_GRADIENT_CSS,
  PRESET_HERO_PLATES,
  isGlobalEditModeEnabled,
  subscribeGlobalEditMode,
  subscribePageVisualConfig,
  savePageVisualConfig,
  updateHeroArtSlot,
} from '../services/siteVisualEditorService';

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
    title: 'Plajah Stage & Live Broadcast',
    color: '#8B5CF6',
    icon: MonitorPlay,
    wide: true,
    desc: 'Run scripture, worship lyrics, lower-thirds and multi-screen sanctuary walls from your browser — while streaming live to every member at home.',
    power: 'Powered by Stage & Plajah Live',
    stat: 'Dual-output stage · NDI & TV receiver · Follow-Along scripture on phones',
    actionKey: 'AMBO_PRO',
  },
  {
    title: '0% Plajah Platform-Fee Tithes & Funds',
    color: '#06D6A0',
    icon: Gift,
    desc: 'Designated giving funds (Tithes, Building Fund, Missions, Youth) with 0% Plajah platform markup (standard Stripe processing rates apply) and instant receipts.',
    stat: '0% Plajah markup · direct Stripe · Finance Hub',
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
    note: 'Stage projects onto sanctuary screens + beams interactive Follow-Along text to every phone in the pews.',
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
            <MonitorPlay size={8} /> {org.orgType === 'CHURCH' || org.orgType === 'RELIGIOUS' ? 'Sanctuary' : 'Live'}
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
  const [elevateTheme, setElevateTheme] = useState<'plajah' | 'dark' | 'pastel'>('plajah');
  const [showOneSheetModal, setShowOneSheetModal] = useState(false);
  const [visualConfig, setVisualConfig] = useState<PageVisualConfig | null>(null);
  const [editMode, setEditMode] = useState<boolean>(() => isGlobalEditModeEnabled());
  const [showAddCarouselCard, setShowAddCarouselCard] = useState(false);
  const [newCardDraft, setNewCardDraft] = useState<{
    title: string;
    subtitle: string;
    tag: string;
    coverUrl: string;
    linkedTool: EditableCarouselItem['linkedTool'];
  }>({
    title: '',
    subtitle: '',
    tag: 'LIVING SANCTUARY',
    coverUrl: PRESET_HERO_PLATES[0].url,
    linkedTool: 'LIVING_BOOK',
  });

  useEffect(() => {
    const unsubCfg = subscribePageVisualConfig('PLAJAH_ELEVATE', cfg => setVisualConfig(cfg));
    const unsubEdit = subscribeGlobalEditMode(on => setEditMode(on));
    return () => {
      unsubCfg();
      unsubEdit();
    };
  }, []);

  const [orgsByType, setOrgsByType] = useState<Record<string, Organization[]>>({
    spiritual: [DEMO_CHURCH],
    cultural: [],
    nonprofit: [],
    religious: [],
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('all');
  // One tab per kind of organization; ?elevateTab=<key> deep-links straight to one.
  const [tab, setTabState] = useState<ElevateTabKey>(() => {
    try {
      const k = new URLSearchParams(window.location.search).get('elevateTab') as ElevateTabKey | null;
      if (k && ELEVATE_TABS.some(t => t.key === k)) return k;
    } catch {}
    return 'overview';
  });
  useEffect(() => { setActiveSection(tabDef(tab).directoryKey); }, [tab]);
  // Sections rise in as they scroll into view; each tab mounts its own, so re-watch on switch.
  useEvRevealAll([tab]);
  const setTab = (k: ElevateTabKey) => {
    setTabState(k);
    try {
      const u = new URL(window.location.href);
      if (k === 'overview') u.searchParams.delete('elevateTab'); else u.searchParams.set('elevateTab', k);
      window.history.replaceState(window.history.state, '', u.toString());
    } catch {}
    // The app scrolls an inner container, not the window — bring the landing's top back into view.
    rootRef.current?.scrollIntoView({ block: 'start' });
  };
  const [liveUids, setLiveUids] = useState<Set<string>>(new Set());

  // Interactive states for The Living Sanctuary (Lorea Interactive Sanctuary Stage)
  const [slideIdx, setSlideIdx] = useState(0);
  const [autoCycleStage, setAutoCycleStage] = useState(false);

  const carRef1 = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const currentSlide = AMBO_DEMO_SLIDES[slideIdx];

  // Theme wrapper styles for Pastel / Dark / Plajah
  const rootBg =
    elevateTheme === 'pastel'
      ? 'bg-[#fdf6e3] text-[#073642]'
      : elevateTheme === 'dark'
      ? 'bg-[#030305] text-white'
      : 'bg-[#0b0214] text-white';

  return (
    <div ref={rootRef} className={`w-full min-h-full overflow-x-clip custom-scrollbar transition-colors duration-500 ${elevateTheme === 'pastel' ? '' : 'ev-scope'} ${rootBg}`}>
      {/* ── STICKY TOP NAV ── */}
      <div className="sticky top-0 z-40 bg-[#0a0612]/90 backdrop-blur-xl border-b border-white/[0.08] text-white">
        {/* Main Elevate Sticky Nav */}
        <div className="max-w-6xl mx-auto px-3.5 sm:px-6 h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 mr-1 sm:mr-2 min-w-0 shrink-0">
            <div
              className="w-8 h-8 rounded-[10px] grid place-items-center text-white shadow-lg shrink-0"
              style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 8px 24px rgba(212,0,85,.34)' }}
            >
              <Landmark size={16} />
            </div>
            <div className="leading-none min-w-0">
              <div className="text-[14px] sm:text-[16px] font-black tracking-tight truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>Plajah Elevate</div>
              <div className="text-[11px] font-semibold text-white/45 mt-0.5 truncate">Faith · Causes · Culture</div>
            </div>
          </div>

          <button
            onClick={() => openElevateGatewayModal({ mode: 'claim' })}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-2.5 lg:px-3 rounded-full text-[10px] lg:text-[11px] font-black uppercase tracking-wider text-[#D0BCFF] bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 hover:bg-[#8B5CF6]/25 transition-all shrink-0"
            title="Claim Member ID"
            aria-label="Claim Member ID"
          >
            <KeyRound size={13} className="shrink-0" />
            <span className="hidden lg:inline">Claim Member ID</span>
          </button>

          {/* One-Sheet is a desktop tool; on a phone the hero's Share button covers it. */}
          <span className="hidden sm:contents">
            <Button
              size="xs"
              variant="accent"
              icon={<FileText />}
              onClick={() => setShowOneSheetModal(true)}
              title="Open Shareable Executive One-Sheet for Colleagues"
              className="shrink-0 whitespace-nowrap"
            >
              <span className="hidden md:inline">Executive One-Sheet</span>
              <span className="md:hidden">One-Sheet</span>
            </Button>
          </span>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5 shrink-0">
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
                className="w-44 lg:w-52 bg-white/[0.05] border border-white/10 rounded-full py-2 pl-9 pr-4 text-[12px] font-medium text-white outline-none focus:border-white/30 transition-all placeholder:text-white/30"
              />
            </div>

            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 h-9 sm:h-10 rounded-full text-[11px] sm:text-[12px] font-black tracking-tight text-white hover:-translate-y-px transition-transform whitespace-nowrap shrink-0"
              style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 8px 24px rgba(212,0,85,.34)', fontFamily: 'Outfit, sans-serif' }}
            >
              <Plus size={14} className="shrink-0" />
              <span className="hidden sm:inline">{isSignedIn ? 'Launch Organization' : 'Start Free'}</span>
              <span className="sm:hidden">{isSignedIn ? 'Launch' : 'Start'}</span>
            </button>
          </div>
        </div>
      </div>
      <ElevateTabBar active={tab} onChange={setTab} />

      {/* Phone: search scrolls away; the brand bar and tab strip stay pinned. */}
      <div className="sm:hidden px-3.5 pt-2.5 pb-1 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              placeholder="Search churches, cities, causes…"
              value={query}
              onChange={e => { setQuery(e.target.value); if (e.target.value) scrollTo('elevate-dir'); }}
              className="w-full bg-white/[0.06] border border-white/10 rounded-full h-10 pl-10 pr-4 text-[14px] text-white outline-none focus:border-white/30 placeholder:text-white/35"
            />
          </div>
      </div>

      {/* Signed-in members: one tap to their own org hub (member home / staff ops). */}
      {isSignedIn && (
        <div className="max-w-6xl mx-auto px-3.5 sm:px-6 pt-3 sm:pt-4">
          <button
            type="button"
            onClick={() => triggerNavigate('ELEVATE_HUB')}
            className="w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl border border-[#8B5CF6]/35 bg-[#6D3FD6]/15 hover:bg-[#6D3FD6]/25 active:scale-[0.99] transition-all text-left"
          >
            <span className="w-10 h-10 rounded-xl grid place-items-center bg-[#6D3FD6] text-white shrink-0"><Users size={18} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-bold text-white">My Elevate hub</span>
              <span className="block text-[12px] text-white/55 truncate">Your organization, departments, chat and schedule</span>
            </span>
            <ChevronRight size={18} className="text-white/50 shrink-0" />
          </button>
        </div>
      )}

      {/* =====================================================================
          THE LIVING SANCTUARY STAGE (LOREA STYLE ELEVATE LANDING PAGE)
          ===================================================================== */}
      {tab === 'overview' && (
        <ElevateOverview
          onPickTab={setTab}
          onCreate={onCreate}
          onClaim={() => openElevateGatewayModal({ mode: 'claim' })}
          counts={Object.fromEntries(Object.entries(orgsByType).map(([k, v]) => [k, v.length]))}
          isSignedIn={isSignedIn}
        />
      )}
      {tab !== 'overview' && tab !== 'church' && (
        <ElevateTypePanel
          tab={tabDef(tab)}
          onCreate={onCreate}
          onClaim={() => openElevateGatewayModal({ mode: 'claim' })}
          extraAction={
            tab === 'faith' ? { label: 'Open the Sacred Library', onClick: () => triggerNavigate('SACRED_LIBRARY') }
            : tab === 'charity' ? { label: 'Browse the Charity hub', onClick: () => triggerNavigate('CHARITY') }
            : undefined
          }
          isSignedIn={isSignedIn}
        />
      )}
      {tab === 'church' && (
      <div>
        {/* ── SPLIT INTERACTIVE HERO (Lorea 2-Column Stage + Interactive Ambo Sanctuary) ── */}
        <header className="relative overflow-hidden border-b border-white/[0.08]">
            {/* Admin-Customizable Hero Background Artwork & Plajah Brand Gradient Scrim */}
            {visualConfig?.heroArt?.['primary_hero']?.backgroundUrl && (
              <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <img
                  src={visualConfig.heroArt['primary_hero'].backgroundUrl}
                  alt=""
                  className="w-full h-full object-cover opacity-35 transition-all duration-700"
                />
                <div
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{
                    background:
                      PLAJAH_GRADIENT_CSS[
                        visualConfig.heroArt['primary_hero'].gradientPreset || 'warm'
                      ]?.css || PLAJAH_GRADIENT_CSS.warm.css,
                    opacity: (visualConfig.heroArt['primary_hero'].overlayOpacity ?? 42) / 100,
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0214] via-[#0b0214]/70 to-transparent" />
              </div>
            )}

            <div className="pointer-events-none absolute -top-24 right-0 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-40" style={{ background: 'radial-gradient(closest-side,rgba(212,0,85,.35),transparent)' }} />

            {/* Inline Hero Background Art Quick-Bar when Admin Edit Mode is ON */}
            {editMode && (
              <div
                data-pj-admin-editor-ui="true"
                className="relative z-20 max-w-6xl mx-auto px-6 pt-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-black/75 backdrop-blur-xl border border-[#FF8C00]/40 text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-[#FF8C00]" />
                    <span className="font-black uppercase tracking-wider text-white">
                      Living Sanctuary Hero Backdrop:
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_HERO_PLATES.slice(0, 5).map(plate => (
                      <button
                        key={plate.id}
                        type="button"
                        onClick={() =>
                          updateHeroArtSlot('PLAJAH_ELEVATE', 'primary_hero', {
                            backgroundUrl: plate.url,
                          })
                        }
                        className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-[#D40055] text-[10px] font-bold text-white transition-all"
                      >
                        {plate.label.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-[1fr_1.12fr] gap-7 sm:gap-10 items-center">
              {/* Left Column: Editorial Headline + CTAs */}
              <div>
                <div
                  data-pj-edit="elevate_hero_eyebrow"
                  data-pj-label="Hero Eyebrow"
                  className="text-[10px] font-black uppercase tracking-[0.3em] sm:tracking-[0.45em] text-[#FF8C00]"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  {visualConfig?.textOverrides?.['elevate_hero_eyebrow'] ?? 'Plajah · Elevate · Sanctuary'}
                </div>
                <h1
                  data-pj-edit="elevate_hero_title"
                  data-pj-label="Hero Main Headline"
                  className="font-black tracking-[-0.045em] leading-[0.94] mt-3 sm:mt-4"
                  style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(34px,6.8vw,88px)' }}
                >
                  {visualConfig?.textOverrides?.['elevate_hero_title'] ? (
                    visualConfig.textOverrides['elevate_hero_title']
                  ) : (
                    <>
                      The sanctuary that <span className="text-[#D40055]">gathers your people</span> anywhere.
                    </>
                  )}
                </h1>
                <p
                  data-pj-edit="elevate_hero_subtitle"
                  data-pj-label="Hero Subtitle Copy"
                  className="text-white/65 text-[15px] sm:text-[17px] leading-relaxed mt-4 sm:mt-5 max-w-[44ch]"
                >
                  {visualConfig?.textOverrides?.['elevate_hero_subtitle'] ??
                    'Scripture that beams to every phone in the pews. Choirs that rehearse with live stems. Tithes with zero platform fees. One home for Sunday morning and the six days in between.'}
                </p>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 mt-5 sm:mt-7">
                  <button
                    type="button"
                    onClick={() => onOpenOrg(DEMO_CHURCH_ID)}
                    className="col-span-2 sm:col-span-1 px-5 sm:px-7 py-3.5 sm:py-4 rounded-full text-[11px] sm:text-[12px] font-black uppercase tracking-[0.16em] sm:tracking-[0.2em] text-white transition-transform hover:-translate-y-0.5 shadow-[0_10px_30px_-6px_rgba(212,0,85,0.5)]"
                    style={{ background: '#D40055', fontFamily: 'Outfit, sans-serif' }}
                  >
                    <span data-pj-edit="elevate_hero_cta_primary" data-pj-label="Primary CTA Button">
                      {visualConfig?.textOverrides?.['elevate_hero_cta_primary'] ?? 'Tour Grace Chapel'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openElevateGatewayModal({ mode: 'claim' })}
                    className="px-5 sm:px-6 py-3.5 sm:py-4 rounded-full text-[11px] sm:text-[12px] font-black uppercase tracking-[0.16em] sm:tracking-[0.2em] border border-white/20 hover:border-[#8B5CF6] bg-white/[0.03] text-white transition-all"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    <span data-pj-edit="elevate_hero_cta_secondary" data-pj-label="Secondary CTA Button">
                      {visualConfig?.textOverrides?.['elevate_hero_cta_secondary'] ?? 'Claim Member ID'}
                    </span>
                  </button>
                  <Button
                    size="md"
                    variant="secondary"
                    icon={<Share2 />}
                    onClick={() => setShowOneSheetModal(true)}
                    className="sm:w-auto"
                  >
                    <span className="sm:hidden">Share</span><span className="hidden sm:inline">Share Colleague One-Sheet</span>
                  </Button>
                </div>
              </div>

              {/* Right Column: Interactive 3D Ambo Sanctuary Stage + Follow-Along Bar */}
              <div className="min-w-0" style={{ perspective: '1800px' }}>
                <div
                  className="rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 border border-[#D40055]/30 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.85)] transition-transform duration-500 hover:scale-[1.01]"
                  style={{
                    background: 'linear-gradient(160deg, rgba(107,0,153,0.28), rgba(15,6,28,0.92))',
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  {/* Stage Mode Selector Pills */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3.5 sm:mb-4">
                    <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-full p-1 overflow-x-auto no-scrollbar max-w-full">
                      {AMBO_DEMO_SLIDES.map((s, idx) => (
                        <button
                          key={s.kind}
                          type="button"
                          onClick={() => setSlideIdx(idx)}
                          className={`shrink-0 px-2.5 sm:px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                            slideIdx === idx
                              ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow'
                              : 'text-white/50 hover:text-white'
                          }`}
                        >
                          {s.kind}
                        </button>
                      ))}
                    </div>
                    <span className="flex items-center gap-1.5 text-[8.5px] sm:text-[9px] font-mono uppercase tracking-widest text-[#06D6A0] shrink-0">
                      <span className="w-2 h-2 rounded-full bg-[#06D6A0] animate-ping" /> Stage Live
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
                      className="relative min-h-[210px] sm:aspect-[16/10] rounded-2xl overflow-hidden border border-white/15 p-4 sm:p-8 flex flex-col justify-between gap-3"
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
                      <div className="flex items-center justify-between gap-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[#FF8C00]">
                        <span
                          data-pj-edit={`ambo_slide_${slideIdx}_ref`}
                          data-pj-label={`Stage Slide ${slideIdx + 1} Reference`}
                          className="truncate"
                        >
                          {visualConfig?.textOverrides?.[`ambo_slide_${slideIdx}_ref`] ?? currentSlide.ref}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-white/70 text-[8px] shrink-0">CH 1 · SANCTUARY WALL</span>
                      </div>

                      <p
                        data-pj-edit={`ambo_slide_${slideIdx}_text`}
                        data-pj-label={`Stage Slide ${slideIdx + 1} Lyric/Scripture`}
                        className="font-black text-white leading-snug tracking-tight my-auto"
                        style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(15px,2.2vw,25px)' }}
                      >
                        {visualConfig?.textOverrides?.[`ambo_slide_${slideIdx}_text`] ?? currentSlide.text}
                      </p>

                      <div className="flex items-center justify-between gap-3 pt-2.5 sm:pt-3 border-t border-white/10 text-[10px] sm:text-[11px] text-white/60">
                        <span
                          data-pj-edit={`ambo_slide_${slideIdx}_note`}
                          data-pj-label={`Stage Slide ${slideIdx + 1} Caption`}
                          className="truncate"
                        >
                          {visualConfig?.textOverrides?.[`ambo_slide_${slideIdx}_note`] ?? currentSlide.note}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-[#D0BCFF] shrink-0">
                          {slideIdx + 1} / {AMBO_DEMO_SLIDES.length}
                        </span>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Interactive Control Pill Bar (Lorea Player style) */}
                  <div className="mt-3.5 sm:mt-4 flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-full bg-black/45 border border-white/12">
                    <button
                      type="button"
                      onClick={() => setAutoCycleStage(p => !p)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#D40055] text-white grid place-items-center shrink-0 hover:brightness-110 transition-all"
                      aria-label="Toggle Sanctuary Stage autoplay"
                    >
                      {autoCycleStage ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[8.5px] sm:text-[9px] font-mono uppercase tracking-widest text-white/45 truncate">
                        Plajah Stage · Follow-Along Sync
                      </div>
                      <div
                        data-pj-edit="ambo_player_hint"
                        data-pj-label="Ambo Presenter Bar Hint"
                        className="text-[11px] sm:text-xs font-bold text-white truncate"
                      >
                        {visualConfig?.textOverrides?.['ambo_player_hint'] ??
                          'Click any mode above or press play to preview Sunday morning'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSlideIdx(i => (i + 1) % AMBO_DEMO_SLIDES.length)}
                      className="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-[9.5px] sm:text-[10px] font-black uppercase tracking-widest border border-white/15 hover:border-[#FF8C00] text-white shrink-0 whitespace-nowrap"
                    >
                      Next cue →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* ── LOREA-STYLE HORIZONTAL CAROUSEL OF INSTITUTIONS + ADMIN CURATED CARDS ── */}
          <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 border-b border-white/[0.08]">
            <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
              <div>
                <div
                  data-pj-edit="elevate_shelf_eyebrow"
                  data-pj-label="Carousel Shelf Eyebrow"
                  className="text-[10px] font-black uppercase tracking-[0.4em] text-[#FF8C00]"
                >
                  {visualConfig?.textOverrides?.['elevate_shelf_eyebrow'] ?? 'Live Sanctuary Shelf'}
                </div>
                <h2
                  data-pj-edit="elevate_shelf_title"
                  data-pj-label="Carousel Shelf Heading"
                  className="font-black tracking-tight text-2xl sm:text-3xl mt-1"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  {visualConfig?.textOverrides?.['elevate_shelf_title'] ??
                    'Featured Churches, Ministries & Cultural Houses'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {editMode && (
                  <button
                    type="button"
                    data-pj-admin-editor-ui="true"
                    onClick={() => setShowAddCarouselCard(v => !v)}
                    className="px-3.5 py-2 rounded-full text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5 shadow-lg"
                    style={{
                      background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                    }}
                  >
                    <Plus size={14} />
                    <span>Add Carousel Card</span>
                  </button>
                )}
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

            {/* Inline Carousel Card Creator Modal/Drawer when Admin clicks "+ Add Carousel Card" */}
            {editMode && showAddCarouselCard && visualConfig && (
              <div
                data-pj-admin-editor-ui="true"
                className="mb-6 rounded-3xl p-5 bg-[#13111C] border border-[#FF8C00]/50 shadow-2xl grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">
                    Card Title
                  </label>
                  <input
                    value={newCardDraft.title}
                    onChange={e => setNewCardDraft({ ...newCardDraft, title: e.target.value })}
                    placeholder="e.g. Psalms of Ascent Living Book"
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">
                    Subtitle / Description
                  </label>
                  <input
                    value={newCardDraft.subtitle}
                    onChange={e => setNewCardDraft({ ...newCardDraft, subtitle: e.target.value })}
                    placeholder="Interactive study & Melos score"
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">
                    Pre-Wired Creative Tool
                  </label>
                  <select
                    value={newCardDraft.linkedTool}
                    onChange={e =>
                      setNewCardDraft({
                        ...newCardDraft,
                        linkedTool: e.target.value as EditableCarouselItem['linkedTool'],
                      })
                    }
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    <option value="LIVING_BOOK">Lorea · Living Book</option>
                    <option value="AMBO_STAGE">Stage · Sanctuary Visualizer</option>
                    <option value="TELA_DESIGN">Tela · Publication Design</option>
                    <option value="CURATED_PLAYLIST">Chora · Worship Stems</option>
                    <option value="PIXELS_ART">Plajah Pixels · Visual Art</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newCardDraft.title.trim()) return;
                      const shelf = visualConfig.carousels['elevate_featured'] || {
                        shelfId: 'elevate_featured',
                        eyebrow: 'Live Sanctuary Shelf',
                        title: 'Featured Churches, Ministries & Cultural Houses',
                        subtitle: '',
                        items: [],
                      };
                      const newItem: EditableCarouselItem = {
                        id: `item_${Date.now()}`,
                        title: newCardDraft.title.trim(),
                        subtitle: newCardDraft.subtitle.trim() || 'Curated by Sanctuary Admin',
                        tag: newCardDraft.tag,
                        coverUrl: newCardDraft.coverUrl,
                        accentColor: '#FF8C00',
                        linkedTool: newCardDraft.linkedTool,
                      };
                      savePageVisualConfig({
                        ...visualConfig,
                        carousels: {
                          ...visualConfig.carousels,
                          elevate_featured: {
                            ...shelf,
                            items: [newItem, ...shelf.items],
                          },
                        },
                      });
                      setNewCardDraft({ ...newCardDraft, title: '', subtitle: '' });
                      setShowAddCarouselCard(false);
                    }}
                    className="flex-1 py-2 px-4 rounded-xl bg-[#D40055] hover:bg-[#FF8C00] text-white text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Save to Carousel
                  </button>
                </div>
              </div>
            )}

            <div ref={carRef1} className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x snap-mandatory">
              {/* Render Admin-Curated Carousel Cards First */}
              {(visualConfig?.carousels?.['elevate_featured']?.items || []).map(item => (
                <div
                  key={item.id}
                  className="w-[290px] sm:w-[320px] shrink-0 snap-start rounded-[28px] overflow-hidden bg-white/[0.04] border border-white/15 flex flex-col justify-between group relative"
                >
                  <div className="h-36 relative overflow-hidden">
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0214] via-transparent to-transparent" />
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-[#D40055] text-white">
                      {item.linkedTool?.replace(/_/g, ' ') || item.tag}
                    </span>
                    {editMode && (
                      <button
                        type="button"
                        data-pj-admin-editor-ui="true"
                        onClick={() => {
                          if (!visualConfig) return;
                          const shelf = visualConfig.carousels['elevate_featured'];
                          if (!shelf) return;
                          savePageVisualConfig({
                            ...visualConfig,
                            carousels: {
                              ...visualConfig.carousels,
                              elevate_featured: {
                                ...shelf,
                                items: shelf.items.filter(x => x.id !== item.id),
                              },
                            },
                          });
                        }}
                        className="absolute top-3 right-3 px-2 py-1 rounded-full bg-red-500/80 text-white text-[9px] font-black uppercase"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <h3
                      data-pj-edit={`carousel_${item.id}_title`}
                      className="font-black text-base text-white"
                      style={{ fontFamily: 'Outfit, sans-serif' }}
                    >
                      {visualConfig?.textOverrides?.[`carousel_${item.id}_title`] ?? item.title}
                    </h3>
                    <p
                      data-pj-edit={`carousel_${item.id}_sub`}
                      className="text-xs text-white/60 mt-1 leading-relaxed flex-1"
                    >
                      {visualConfig?.textOverrides?.[`carousel_${item.id}_sub`] ?? item.subtitle}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.linkedTool === 'LIVING_BOOK') triggerNavigate('BOOKS');
                        else if (item.linkedTool === 'AMBO_STAGE') triggerNavigate('AMBO_PRO');
                        else if (item.linkedTool === 'TELA_DESIGN') triggerNavigate('TELA_STUDIO');
                        else if (item.linkedTool === 'PIXELS_ART') triggerNavigate('PLAJAH_PIXELS');
                        else onOpenOrg(DEMO_CHURCH_ID);
                      }}
                      className="mt-4 w-full py-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] text-[10px] font-black uppercase tracking-widest text-white flex items-center justify-center gap-1.5"
                    >
                      <span>Open in Studio</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              ))}

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
                <span
                  data-pj-edit="elevate_plant_sanctuary_title"
                  className="font-black text-base"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  {visualConfig?.textOverrides?.['elevate_plant_sanctuary_title'] ?? 'Plant Your Sanctuary'}
                </span>
                <span
                  data-pj-edit="elevate_plant_sanctuary_sub"
                  className="text-xs text-white/45"
                >
                  {visualConfig?.textOverrides?.['elevate_plant_sanctuary_sub'] ??
                    'Set up departments, giving, and live streaming in two minutes.'}
                </span>
              </button>
            </div>
          </section>

          {/* ── SIX PILLARS OF ELEVATE ("Six ways to gather, one sanctuary") ── */}
          <section id="elevate-caps" className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-b border-white/[0.08]">
            <div
              data-pj-edit="elevate_pillars_eyebrow"
              data-pj-label="Six Pillars Eyebrow"
              className="text-[10px] font-black uppercase tracking-[0.45em] text-[#FF8C00]"
            >
              {visualConfig?.textOverrides?.['elevate_pillars_eyebrow'] ?? 'One Sanctuary'}
            </div>
            <h2
              data-pj-edit="elevate_pillars_title"
              data-pj-label="Six Pillars Heading"
              className="font-black tracking-[-0.04em] leading-[0.95] mt-3 max-w-xl"
              style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(32px,5vw,56px)' }}
            >
              {visualConfig?.textOverrides?.['elevate_pillars_title'] ??
                'Six ways to gather, one connected home.'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-9">
              {[
                { key: 'p1', title: 'Stage Presenter', desc: 'Scripture, lyrics, lower-thirds and stage monitors driven from your browser.', tag: 'Sanctuary Stage', color: '#8B5CF6', icon: MonitorPlay, act: () => triggerNavigate('AMBO_PRO') },
                { key: 'p2', title: 'Sacred Library & Verse', desc: 'Open the Bible and world faith texts with audio narration and study notes.', tag: 'Scripture', color: '#FF8C00', icon: BookOpen, act: () => triggerNavigate('SACRED_LIBRARY') },
                { key: 'p3', title: 'Tithes & Finance Hub', desc: 'Multi-fund giving with 0% Plajah platform fee (standard Stripe processing applies), dual-signature expense approvals, and automated statements.', tag: 'Stewardship', color: '#06D6A0', icon: Gift, act: () => onOpenOrg(DEMO_CHURCH_ID) },
                { key: 'p4', title: 'Music & Choir Dept', desc: 'Share setlists, rehearsal stems, sheet music scores and choir rosters.', tag: 'Worship', color: '#D40055', icon: Music, act: () => onOpenOrg(DEMO_CHURCH_ID) },
                { key: 'p5', title: 'Christian Education', desc: 'Sunday school classes, youth curricula, lesson plans and family check-in.', tag: 'Discipleship', color: '#00DAF3', icon: GraduationCap, act: () => onOpenOrg(DEMO_CHURCH_ID) },
                { key: 'p6', title: 'Serve, Shifts & Watch Parties', desc: 'Multi-shift volunteer scheduling, automatic waitlists, 30s voice-testimony covenants, and licensed neighborhood watch parties.', tag: 'Action & Chapters', color: '#FF8C00', icon: Sparkles, act: () => onOpenOrg(DEMO_CHURCH_ID) },
              ].map(tile => (
                <article
                  key={tile.key}
                  onClick={tile.act}
                  className="p-6 rounded-[28px] border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:-translate-y-2 transition-all duration-300 cursor-pointer flex flex-col gap-3 min-h-[220px]"
                >
                  <div
                    className="w-11 h-11 rounded-2xl grid place-items-center border"
                    style={{ background: `${tile.color}22`, borderColor: `${tile.color}55`, color: tile.color }}
                  >
                    <tile.icon size={21} />
                  </div>
                  <h3
                    data-pj-edit={`elevate_pillar_${tile.key}_title`}
                    data-pj-label={`${tile.title} Heading`}
                    className="font-black text-xl tracking-tight"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    {visualConfig?.textOverrides?.[`elevate_pillar_${tile.key}_title`] ?? tile.title}
                  </h3>
                  <p
                    data-pj-edit={`elevate_pillar_${tile.key}_desc`}
                    data-pj-label={`${tile.title} Description`}
                    className="text-sm text-white/60 leading-relaxed"
                  >
                    {visualConfig?.textOverrides?.[`elevate_pillar_${tile.key}_desc`] ?? tile.desc}
                  </p>
                  <span
                    data-pj-edit={`elevate_pillar_${tile.key}_tag`}
                    className="mt-auto font-mono text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: tile.color }}
                  >
                    {visualConfig?.textOverrides?.[`elevate_pillar_${tile.key}_tag`] ?? `${tile.tag} →`}
                  </span>
                </article>
              ))}
            </div>

            {/* Subtle Action & Institutional Stack Ribbon */}
            <div className="mt-6 p-5 rounded-[28px] border border-white/10 bg-white/[0.02] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="text-[10px] font-black uppercase tracking-[0.32em] text-[#FF8C00]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Native Action, Shifts &amp; Institutional Stack
                </div>
                <p className="text-xs text-white/65 leading-relaxed">
                  Built into every Elevate workspace: capacity-capped volunteer shifts with automatic waitlist promotion,{' '}
                  no-SMS <b className="text-white/90">72h·24h·1h</b> Push &amp; Post Man Email cadences, portable Impact Passports, 2-way ChMS/CRM sync, and opt-in compliance guards for local civic &amp; grassroots initiatives.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button size="sm" variant="secondary" icon={<FileText />} onClick={() => setShowOneSheetModal(true)}>
                  Executive One-Sheet
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onOpenOrg(DEMO_CHURCH_ID)}>
                  Explore Action Hub →
                </Button>
              </div>
            </div>
          </section>
      </div>
      )}

      {/* =====================================================================
          SHARED LIVE DIRECTORY + GRACE CHAPEL SPOTLIGHT BANNER
          ===================================================================== */}
      <section id="elevate-dir" className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
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
              Churches, faith communities, nonprofits, charities and cultural institutions — open an organization’s hub, follow updates, or claim your member seat.
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
        {!query && tab === 'church' && (
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
                  {DEMO_CHURCH.tagline || 'Experience a live multi-ministry congregation with Sunday streams, Stage scripture follow-along, Music Department, Christian Education, and Finance Hub.'}
                </p>

                <div className="flex flex-wrap gap-2 mt-3.5">
                  {[
                    { label: 'Live Sanctuary Stream', icon: MonitorPlay },
                    { label: '4 Giving Funds', icon: Gift },
                    { label: 'Serve, Shifts & Waitlists', icon: Calendar },
                    { label: 'Licensed Watch Parties', icon: Globe },
                    { label: 'Choir & Music Dept', icon: Music },
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
                Your organization here
              </span>
              <span className="text-[9.5px] font-black uppercase tracking-widest text-[#FF8C00] mt-1.5">
                Free to launch · 2-min setup
              </span>
              <span className="text-[11px] text-white/45 mt-2 max-w-[24ch]">
                Departments, giving funds, Stage &amp; member claim cards — set up for you.
              </span>
            </button>
          </div>
        )}
      </section>

      {/* =====================================================================
          EVERY WAY INTO ELEVATE — LOREA "NOTHING HIDDEN, EVERY DOOR" DIRECTORY
          ===================================================================== */}
      {tab === 'church' && (<>
      <section id="elevate-doors" className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-t border-white/[0.08]">
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
              { title: 'Stage Presenter', sub: 'Multi-screen scripture, lyrics & sanctuary confidence stage', color: '#D40055', act: () => triggerNavigate('AMBO_PRO') },
              { title: 'Sacred Library', sub: 'World faith traditions, study Bibles & audio scripture', color: '#FF8C00', act: () => triggerNavigate('SACRED_LIBRARY') },
              { title: 'Plajah Verse', sub: 'Chapter-by-chapter study with Follow-Along sync', color: '#00DAF3', act: () => triggerNavigate('BIBLE') },
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

        {/* Group 3: Volunteer Action, Chapters & Institutional Stack */}
        <div className="mt-8">
          <h3 className="text-[10px] font-black uppercase tracking-[0.45em] text-[#00DAF3] mb-3.5">
            Volunteer Action, Chapters &amp; Institutional Stack
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: 'Shifts & Auto-Waitlists', sub: 'Multi-shift scheduling, QR check-in & automatic waitlists', color: '#FF8C00', act: () => onOpenOrg(DEMO_CHURCH_ID) },
              { title: 'Licensed Watch Parties', sub: 'Community Screening Licenses for Reello live, Cinema film & Stage slides', color: '#00DAF3', act: () => onOpenOrg(DEMO_CHURCH_ID) },
              { title: '30s Voice Covenants & Tela PDF', sub: 'Spoken testimonies, SeedRaiser matches & bound open-letter dossiers', color: '#D40055', act: () => onOpenOrg(DEMO_CHURCH_ID) },
              { title: 'Executive One-Sheet & CRM Sync', sub: 'PCO, Servant Keeper & VAN sync + opt-in local civic compliance', color: '#06D6A0', act: () => setShowOneSheetModal(true) },
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
      <section className="ev-reveal max-w-6xl mx-auto px-4 sm:px-6 pb-12 sm:pb-20">
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
            Seed your ministries, import your congregation roster, connect Stripe for direct giving, and open Stage on your sanctuary screens in minutes.
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
      </>)}

      {tab !== 'church' && (
        <ElevateTabCta
          tab={tab === 'overview'
            ? { ...tabDef('overview'), ctaTitle: 'Bring your organization onto Plajah Elevate', ctaSub: 'Free to launch. Pick your type, import your people, connect Stripe, and open your doors this week.' }
            : tabDef(tab)}
          onCreate={onCreate}
          secondary={tab === 'overview' ? { label: 'See a church example', onClick: () => setTab('church') } : { label: 'Back to overview', onClick: () => setTab('overview') }}
        />
      )}

      <ElevateOneSheetModal
        isOpen={showOneSheetModal}
        onClose={() => setShowOneSheetModal(false)}
        onExploreDemo={() => onOpenOrg(DEMO_CHURCH_ID)}
        onCreateOrg={onCreate}
      />
    </div>
  );
};

export default PlajahElevate;
