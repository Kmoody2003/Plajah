import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import CreateEventButton from './events/CreateEventButton';
import { motion, AnimatePresence } from 'motion/react';
import {
  Store, ShoppingBag, Radio, Monitor, Users, Plus, X, Check, Edit3,
  Trash2, ChevronRight, Clock, Package, Star, Zap, Globe, Leaf,
  Settings, ToggleLeft, ToggleRight, Search, Filter, Mail, Phone,
  BarChart3, Target, RefreshCw, Play, Pause, Image, MapPin, Building2, ShieldCheck, Megaphone,
  Calendar, Stethoscope, Receipt, ClipboardList
} from 'lucide-react';
import { BillingHubMount, BillingSummaryMount, SoonPill, useBillingNav } from './BillingMounts';
import MarketingKit from './MarketingKit';
import { UserProfile, BusinessPage, BusinessOrder, DigitalSignageSlide, CrmContact, SeedRaiserCampaign, SeedRaiserReward } from '../types';
import {
  fetchMyBusinessPages, saveBusinessPage, deleteBusinessPage,
  fetchBusinessOrders, updateOrderStatus, listenToBusinessOrders,
  fetchCrmContacts, saveCrmContact, deleteCrmContact,
  fetchSignageSlides, saveSignageSlide, deleteSignageSlide,
  fetchMySeedRaiserCampaigns, saveSeedRaiserCampaign, publishSeedRaiserCampaign,
  addCampaignUpdate,
} from '../services/businessService';
import { auth } from '../services/firebase';
import { getVertical } from '../services/businessVerticals';
import { tabsFor, vocabularyFor, packForPage } from '../services/verticalPacks';
import PackOnboarding from './business/PackOnboarding';
import ListingsManager from './terra/ListingsManager';
import BusinessCompliance from './terra/BusinessCompliance';
import InventoryHub from './inventory/InventoryHub';
import StoreKioskMode from './StoreKioskMode';
import PosRegister from './PosRegister';
import OffersManager from './OffersManager';
import RegisterBackOffice from './RegisterBackOffice';
import NowPlayingPublisher from './NowPlayingPublisher';
import DisplayModeLauncher from './DisplayModeLauncher';
import BusinessBroadcastComposer from './BusinessBroadcastComposer';
import BusinessOrdersPanel from './BusinessOrdersPanel';
import { serverTicketApi } from '../services/ticketService';
const TicketsBoard = lazy(() => import('./business/tickets/TicketsBoard'));
import ArtistPromoDirectory from './ArtistPromoDirectory';
import StaffHRManager from './StaffHRManager';
import AppointmentsManager from './clinic/AppointmentsManager';
import { ClinicalCareGate, NoPhiNotice } from './clinic/ClinicalGuardrails';
import { BO, BoScope, BoModeBar, BoKpiStrip, BoSectionHead, BoTaskList, BoLabel, money } from './business/opsKit';
import { opsPresetForPage } from '../services/opsPresets';
import { subscribeCatalog, subscribeOrders } from '../services/commerceBus';
import { stockStatus } from '../services/inventoryCore';
import type { StoreProduct } from '../types';
import type { StoreOrderRecord } from '../services/businessOpsService';
import type { MailRecipient } from '../services/marketing/handoff';
import SignageStudio from './business/SignageStudio';
import GrowthHub from './growth/GrowthHub';
const BizCrm = lazy(() => import('./crm/BizCrm'));

type BizTab = 'OVERVIEW' | 'TODAY' | 'APPOINTMENTS' | 'ORDERS' | 'INVENTORY' | 'TEAM' | 'MESSAGING' | 'CRM' | 'SIGNAGE' | 'SEEDRAISER' | 'RADIO' | 'MARKETING' | 'SETTINGS' | 'LISTINGS' | 'COMPLIANCE' | 'BILLING' | 'TICKETS' | 'EVENTS' | 'SOCIAL';
type BizMode = 'owner' | 'staff';

// "Storefront Command" rail — the vertical-filtered tabs collapse into four
// working groups so nothing wraps. Only ids that survive the vertical filter
// (see `tabs` below) actually render, so a clinic has Appointments/Telehealth.
const TAB_GROUPS: { label: string; ids: BizTab[] }[] = [
  { label: 'Sell',      ids: ['OVERVIEW', 'TODAY', 'TICKETS', 'APPOINTMENTS', 'ORDERS', 'INVENTORY', 'LISTINGS'] },
  { label: 'Customers', ids: ['CRM', 'MESSAGING'] },
  { label: 'Grow',      ids: ['EVENTS', 'SOCIAL', 'MARKETING', 'SEEDRAISER'] },
  { label: 'Screens',   ids: ['SIGNAGE', 'RADIO'] },
  { label: 'Manage',    ids: ['BILLING', 'TEAM', 'COMPLIANCE', 'SETTINGS'] },
];

/** What a team member sees in Staff view: the work, not the money or the settings. */
const STAFF_TABS: BizTab[] = ['TODAY', 'ORDERS', 'TICKETS', 'APPOINTMENTS', 'INVENTORY', 'CRM', 'EVENTS', 'SIGNAGE', 'RADIO'];

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// ── Status badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { color: string; bg: string }> = {
    PENDING:    { color: '#FF8C00', bg: '#FF8C0015' },
    CONFIRMED:  { color: '#00B4D8', bg: '#00B4D815' },
    PROCESSING: { color: '#6B0099', bg: '#6B009915' },
    READY:      { color: '#06D6A0', bg: '#06D6A015' },
    COMPLETED:  { color: '#06D6A0', bg: '#06D6A015' },
    CANCELLED:  { color: '#D40055', bg: '#D4005515' },
    ACTIVE:     { color: '#06D6A0', bg: '#06D6A015' },
    FUNDED:     { color: '#FFD166', bg: '#FFD16615' },
    DRAFT:      { color: '#ffffff40', bg: '#ffffff08' },
    FAILED:     { color: '#D40055', bg: '#D4005515' },
  };
  const style = map[status] ?? { color: '#ffffff40', bg: '#ffffff08' };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest"
      style={{ color: style.color, background: style.bg }}
    >
      {status}
    </span>
  );
};

// ── Section Card ──────────────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white/[0.04] border border-white/[0.07] rounded-3xl p-6 ${className}`}>
    {children}
  </div>
);

// ── Main Dashboard ────────────────────────────────────────────────────────────

interface BusinessDashboardProps {
  currentUser: UserProfile;
  onNavigate?: (target: string, params?: any) => void;
}

const BusinessDashboard: React.FC<BusinessDashboardProps> = ({ currentUser, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<BizTab>('OVERVIEW');
  const billingNav = useBillingNav();
  const [showKiosk, setShowKiosk] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showDisplays, setShowDisplays] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [pages, setPages] = useState<BusinessPage[]>([]);
  const [activePage, setActivePage] = useState<BusinessPage | null>(null);
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [slides, setSlides] = useState<DigitalSignageSlide[]>([]);
  const [campaigns, setCampaigns] = useState<SeedRaiserCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPage, setEditingPage] = useState<Partial<BusinessPage> | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Partial<SeedRaiserCampaign> | null>(null);
  const [mode, setMode] = useState<BizMode>('owner');
  const [showSuite, setShowSuite] = useState(false);
  // Live commerce: one catalog + order stream shared with the register, kiosk, store and screens.
  const [catalog, setCatalog] = useState<StoreProduct[]>([]);
  const [storeOrders, setStoreOrders] = useState<StoreOrderRecord[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const biz = await fetchMyBusinessPages();
        setPages(biz);
        if (biz.length > 0) setActivePage(biz[0]);
      } catch (e) {
        console.error('BusinessDashboard: failed to load business pages', e);
      } finally {
        // Always drop the loading gate — a thrown/hung fetch must never spin forever.
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!activePage) return;
    const unsub = listenToBusinessOrders(activePage.id, setOrders);
    fetchCrmContacts(activePage.id).then(setContacts).catch(() => setContacts([]));
    fetchSignageSlides(activePage.id).then(setSlides).catch(() => setSlides([]));
    fetchMySeedRaiserCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    return unsub;
  }, [activePage?.id]);

  useEffect(() => {
    if (!activePage) return;
    const offCat = subscribeCatalog(currentUser.uid, setCatalog, { onError: () => {} });
    const offOrd = subscribeOrders(currentUser.uid, setStoreOrders, { limit: 200, onError: () => {} });
    return () => { offCat(); offOrd(); };
  }, [activePage?.id, currentUser.uid]);

  const handleSeedFullDemo = async () => {
    if (seedingDemo) return;
    setSeedingDemo(true);
    try {
      const { seedFullDemoBusiness } = await import('../services/demoBusinessSeed');
      const page = await seedFullDemoBusiness(activePage);
      setPages(prev => (prev.some(p => p.id === page.id) ? prev.map(p => p.id === page.id ? page : p) : [...prev, page]));
      setActivePage(page);
      setActiveTab('OVERVIEW');
    } catch (e: any) {
      alert(e?.message || 'Could not build the demo.');
    } finally {
      setSeedingDemo(false);
    }
  };

  const handleSavePage = async () => {
    if (!editingPage) return;
    const saved = await saveBusinessPage({ ...editingPage, ownerId: currentUser.uid });
    setPages(prev => {
      const exists = prev.find(p => p.id === saved.id);
      return exists ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved];
    });
    setActivePage(saved);
    setEditingPage(null);
  };

  const handleSaveCampaign = async () => {
    if (!editingCampaign) return;
    const saved = await saveSeedRaiserCampaign(editingCampaign);
    setCampaigns(prev => {
      const exists = prev.find(c => c.id === saved.id);
      return exists ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved];
    });
    setEditingCampaign(null);
  };

  const handlePublishCampaign = async (id: string) => {
    await publishSeedRaiserCampaign(id);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'ACTIVE' } : c));
  };

  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const ticketPackId = packForPage(activePage)?.ticket ? packForPage(activePage)!.id : '';
  const ticketApi = useMemo(() => (ticketPackId ? serverTicketApi(currentUser.uid, ticketPackId) : null), [ticketPackId, currentUser.uid]);
  const ALL_TABS: { id: BizTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'OVERVIEW',     label: 'Overview',     icon: Store },
    { id: 'TODAY',        label: 'Today',        icon: Clock },
    { id: 'EVENTS',       label: 'Events',       icon: Calendar },
    { id: 'SOCIAL',       label: 'Social',       icon: Globe },
    { id: 'APPOINTMENTS', label: activePage?.businessType === 'HEALTH' ? 'Clinical Care' : 'Appointments', icon: activePage?.businessType === 'HEALTH' ? Stethoscope : Calendar },
    { id: 'TICKETS',      label: packForPage(activePage)?.ticket ? cap(packForPage(activePage)!.ticket!.nounPlural) : 'Tickets', icon: ClipboardList },
    { id: 'LISTINGS',     label: 'Listings',     icon: Building2 },
    { id: 'COMPLIANCE',   label: 'Compliance',   icon: ShieldCheck },
    { id: 'ORDERS',       label: packForPage(activePage) ? cap(vocabularyFor(activePage).orderNounPlural) : 'Orders', icon: ShoppingBag },
    { id: 'INVENTORY',    label: packForPage(activePage) ? vocabularyFor(activePage).catalogNoun : 'Inventory', icon: Package },
    { id: 'TEAM',         label: 'Team & HR',    icon: Users },
    { id: 'MESSAGING',    label: 'Messaging',    icon: Mail },
    { id: 'CRM',          label: 'CRM',          icon: Target },
    { id: 'SIGNAGE',      label: 'Signage',      icon: Monitor },
    { id: 'SEEDRAISER',   label: 'Seed Raiser',  icon: Leaf },
    { id: 'RADIO',        label: 'Radio',        icon: Radio },
    { id: 'SETTINGS',     label: 'Settings',     icon: Settings },
  ];

  // Show only the tabs this vertical actually uses — a realtor has no inventory
  // or in-store radio. Ordered by the vertical so its priorities lead. Events, social, marketing and
  // billing are offered to every business; Staff view narrows to the day's work.
  const vertical = getVertical(activePage?.businessType);
  const pick = (id: BizTab) => ALL_TABS.find(t => t.id === id) ?? (id === 'MARKETING' ? { id, label: 'Marketing', icon: Megaphone } : id === 'BILLING' ? { id, label: 'Billing', icon: Receipt } : null);
  const ownerIds: BizTab[] = Array.from(new Set<BizTab>([
    'OVERVIEW', 'TODAY', ...(tabsFor(activePage) as BizTab[]), 'CRM', 'EVENTS', 'SOCIAL', 'MARKETING', 'BILLING',
  ]));
  const visibleIds = mode === 'staff' ? ownerIds.filter(id => STAFF_TABS.includes(id)) : ownerIds;
  const tabs = visibleIds.map(pick).filter((t): t is typeof ALL_TABS[number] => Boolean(t));

  // Keep the selected tab valid when the mode or page changes.
  useEffect(() => {
    if (!visibleIds.includes(activeTab)) setActiveTab(mode === 'staff' ? 'TODAY' : 'OVERVIEW');
  }, [mode, activePage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const preset = useMemo(() => opsPresetForPage(activePage), [activePage?.subtype, activePage?.packId, activePage?.businessType]);
  const accent = packForPage(activePage)?.color || preset.accent || BO.orange;
  const vocab = vocabularyFor(activePage);

  // ── Live numbers (storeOrders + storeProducts: the same data the register and screens use) ──
  const today0 = startOfToday();
  const paidToday = storeOrders.filter(o => (o.paidAt || o.createdAt) >= today0 && o.status !== 'CANCELLED' && o.status !== 'PENDING_PAYMENT');
  const salesToday = paidToday.reduce((a, o) => a + (o.totalCents ?? o.subtotalCents ?? 0), 0) / 100;
  const openStoreOrders = storeOrders.filter(o => ['CONFIRMED', 'PREPARING', 'READY'].includes(o.status));
  const lowStock = catalog.filter(p => p.isActive !== false && (stockStatus(p) === 'LOW' || stockStatus(p) === 'OUT'));
  const openLegacy = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');

  const identity = activePage ? {
    name: activePage.businessName, phone: activePage.phone, website: activePage.website, logoUrl: activePage.logoUrl,
    address: { line1: activePage.address, city: activePage.city, region: activePage.state, postal: activePage.postalCode },
  } : { name: 'Business' };

  const loadRecipients = async (segmentId?: string): Promise<MailRecipient[]> => {
    if (!activePage) return [];
    const all = await fetchCrmContacts(activePage.id).catch(() => [] as CrmContact[]);
    const now = Date.now();
    const seg = preset.crm.segments.find(x => x.id === segmentId);
    return all
      .filter(c => !c.mailOptOut && c.address?.line1 && c.address.city && c.address.region && c.address.postal)
      .filter(c => {
        if (!seg) return true;
        const r = seg.rule;
        if (r.inactiveDays && (now - (c.lastVisit || c.lastContactAt || c.createdAt)) < r.inactiveDays * 86400000) return false;
        if (r.newWithinDays && (now - c.createdAt) > r.newWithinDays * 86400000) return false;
        if (r.minSpend && (c.totalSpend || 0) < r.minSpend) return false;
        if (r.minVisits && (c.visitCount || 0) < r.minVisits) return false;
        if (r.tagsAny?.length && !r.tagsAny.some(t => c.tags?.includes(t))) return false;
        if (r.stageIn?.length && !r.stageIn.includes(c.stageId || '')) return false;
        if (r.optedIn && !c.marketingOptIn) return false;
        return true;
      })
      .map(c => ({ name: c.name, line1: c.address!.line1!, line2: c.address!.line2, city: c.address!.city!, region: c.address!.region!, postal: c.address!.postal! }));
  };

  if (loading) return (
    <BoScope className="min-h-[60vh] grid place-items-center">
      <div className="flex items-center gap-3 text-[#A39BAE]">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
        <span className="text-sm">Loading your business…</span>
      </div>
    </BoScope>
  );

  const newPage = () => setEditingPage({ businessType: 'RETAIL', isAcceptingOrders: false, radioServiceEnabled: false, digitalSignageEnabled: false, crmEnabled: false, rewardsEnabled: false });

  return (
    <BoScope accent={accent} className="pb-16 -mx-4 sm:mx-0 rounded-none sm:rounded-[28px] overflow-hidden">
      {/* ── Mode bar: Owner / Staff / Public page ── */}
      <BoModeBar
        modes={activePage ? [{ k: 'owner', label: 'Owner' }, { k: 'staff', label: 'Staff view' }, { k: 'public', label: 'Public page' }] : [{ k: 'owner', label: 'Owner' }]}
        value={mode}
        onChange={k => {
          if (k === 'public') { if (activePage && onNavigate) onNavigate('BUSINESS_PUBLIC', { businessPage: activePage }); return; }
          setMode(k as BizMode);
        }}
        leading={
          <div className="flex items-center gap-2.5 py-2 pr-2">
            <span className="w-8 h-8 rounded-[10px] bo-mark grid place-items-center text-white text-sm font-bold">{(activePage?.businessName || 'B').charAt(0).toUpperCase()}</span>
            <span className="bo-title text-[15px] text-white hidden sm:inline">Plajah Business</span>
          </div>
        }
        trailing={
          <>
            {pages.length > 1 && (
              <select
                aria-label="Switch business"
                value={activePage?.id || ''}
                onChange={e => setActivePage(pages.find(p => p.id === e.target.value) || null)}
                className="bo-input" style={{ minHeight: 36, width: 'auto', paddingRight: 28 }}
              >
                {pages.map(p => <option key={p.id} value={p.id}>{p.businessName}</option>)}
              </select>
            )}
            {mode === 'owner' && <button onClick={newPage} className="bo-btn bo-btn-ghost bo-btn-sm"><Plus size={14} /> New business</button>}
          </>
        }
      />

      {/* No pages yet */}
      {pages.length === 0 && !editingPage && (
        <section className="max-w-[1320px] mx-auto px-4 sm:px-8 pt-14 pb-10">
          <BoLabel className="mb-4">Plajah Business</BoLabel>
          <h1 className="m-0 bo-display text-white" style={{ fontSize: 'clamp(2.8rem, 7vw, 6rem)' }}>Run the whole shop<br /><span className="bo-text-brand">from one place.</span></h1>
          <p className="mt-6 text-[17px] text-[#D9D3E0] max-w-2xl">Register, inventory, online store and merch, screens, customers, events, social and local marketing, pre-wired for your kind of business: grocery, corner store, mechanic, furniture, dealership, venue, event planner, real estate and more.</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button onClick={newPage} className="bo-btn bo-btn-primary"><Plus size={16} /> Create your business</button>
            <button onClick={handleSeedFullDemo} disabled={seedingDemo} className="bo-btn bo-btn-ghost"><Zap size={16} /> {seedingDemo ? 'Building demo…' : 'Tour a full demo café'}</button>
          </div>
        </section>
      )}

      {/* Tab nav (only when a page is selected) */}
      {activePage && (
        <div className="max-w-[1320px] mx-auto px-4 sm:px-8 pt-8 grid grid-cols-1 md:grid-cols-[232px_minmax(0,1fr)] gap-8 items-start">
          {/* ── Ops rail ── */}
          <aside className="md:sticky md:top-16 self-start">
            <div className="flex items-center gap-3 pb-4 mb-4" style={{ borderBottom: `1px solid ${BO.line}` }}>
              {activePage.logoUrl
                ? <img src={activePage.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                : <span className="w-10 h-10 rounded-xl grid place-items-center text-[#160A00] text-base font-bold shrink-0" style={{ background: accent }}>{(activePage.businessName || 'B').charAt(0).toUpperCase()}</span>}
              <div className="min-w-0">
                <div className="bo-title text-[16px] text-white truncate leading-tight">{activePage.businessName}</div>
                <div className="text-[13px] text-[#A39BAE] truncate">{mode === 'staff' ? 'Staff view' : (packForPage(activePage)?.label || vertical.label)}</div>
              </div>
            </div>
            {mode === 'owner' && <div className="pb-4"><CreateEventButton compact host={{ kind: 'business', id: activePage.id, label: activePage.businessName }} /></div>}
            <nav aria-label="Business sections" className="flex md:flex-col gap-5 overflow-x-auto md:overflow-visible pb-1 -mx-1 px-1">
              {TAB_GROUPS.map(g => {
                const items = g.ids.map(id => tabs.find(t => t.id === id)).filter((t): t is typeof tabs[number] => Boolean(t));
                if (items.length === 0) return null;
                return (
                  <div key={g.label} className="min-w-max md:min-w-0">
                    <BoLabel className="px-2.5 mb-1.5">{g.label}</BoLabel>
                    <div className="flex md:flex-col gap-0.5">
                      {items.map(t => {
                        const sel = activeTab === t.id;
                        const count = t.id === 'ORDERS' ? openStoreOrders.length + openLegacy.length
                          : t.id === 'INVENTORY' ? lowStock.length
                          : t.id === 'CRM' ? contacts.length : 0;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            aria-current={sel ? 'page' : undefined}
                            className="relative flex items-center gap-2.5 min-h-[40px] px-2.5 rounded-[10px] text-[14px] transition-colors whitespace-nowrap"
                            style={sel ? { background: BO.raised, color: BO.ink, fontWeight: 600 } : { color: BO.muted }}
                          >
                            {sel && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: accent }} />}
                            <t.icon size={16} />
                            <span>{t.label}</span>
                            {t.id === 'BILLING' && billingNav.state === 'soon' && <SoonPill />}
                            {count > 0 && (
                              <span className="ml-auto bo-num text-[12px] rounded-full px-2 py-0.5 leading-none" style={t.id === 'INVENTORY' ? { background: 'rgba(245,158,11,0.16)', color: BO.warn } : { background: 'rgba(255,255,255,0.08)', color: BO.ink }}>{count}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* ── Panel column ── */}
          <div className="min-w-0 space-y-6">

          {/* ── OVERVIEW ── */}
          {activePage?.businessType === 'HEALTH' && ['ORDERS', 'INVENTORY', 'MESSAGING', 'CRM', 'SIGNAGE', 'MARKETING', 'LISTINGS'].includes(activeTab) && <NoPhiNotice />}

          {activeTab === 'BILLING' && activePage && (
            <BillingHubMount entity={{ kind: 'BUSINESS', id: activePage.id }} entityName={(activePage as any).name || (activePage as any).businessName || 'Your business'} canManage />
          )}

          {activeTab === 'OVERVIEW' && (
            <div className="space-y-10 bo-rise">
              <header>
                <BoLabel className="mb-3">{packForPage(activePage)?.label || vertical.label}</BoLabel>
                <h1 className="m-0 bo-display text-white" style={{ fontSize: 'clamp(2.4rem, 5.4vw, 4.4rem)' }}>{activePage.businessName}</h1>
                <p className="m-0 mt-3 text-[16px] text-[#D9D3E0] max-w-2xl">{preset.commerce.note}</p>
              </header>

              <BoKpiStrip items={[
                { label: 'Sales today', value: money(salesToday), note: `${paidToday.length} ${paidToday.length === 1 ? vocab.orderNoun : vocab.orderNounPlural}`, tone: salesToday > 0 ? 'up' : 'flat', onClick: () => setActiveTab('ORDERS') },
                { label: `Open ${vocab.orderNounPlural}`, value: String(openStoreOrders.length + openLegacy.length), note: openStoreOrders.some(o => o.status === 'READY') ? 'Some are ready for pickup' : undefined, tone: 'warn', onClick: () => setActiveTab('ORDERS') },
                { label: 'Low or out of stock', value: String(lowStock.length), note: lowStock.length ? lowStock.slice(0, 2).map(p => p.title).join(', ') : 'All stocked', tone: lowStock.length ? 'warn' : 'up', onClick: () => setActiveTab('INVENTORY') },
                { label: preset.crm.contactNoun === 'customer' ? 'Customers' : `${preset.crm.contactNoun[0].toUpperCase()}${preset.crm.contactNoun.slice(1)}s`, value: String(contacts.length), onClick: () => setActiveTab('CRM') },
                { label: 'Live products', value: String(catalog.filter(p => p.isActive !== false).length), note: 'Register · store · screens', onClick: () => setActiveTab('INVENTORY') },
              ]} />

              {activePage && (
                <PackOnboarding
                  page={activePage}
                  orderCount={orders.length + storeOrders.length}
                  contactCount={contacts.length}
                  slideCount={slides.length}
                  onPageChange={updated => { setActivePage(updated); setPages(prev => prev.map(x => x.id === updated.id ? updated : x)); }}
                  onGoTab={t => setActiveTab(t as BizTab)}
                />
              )}
              {activePage && billingNav.state !== 'soon' && (
                <BillingSummaryMount entity={{ kind: 'BUSINESS', id: activePage.id }} />
              )}

              {/* One catalog, every surface */}
              <section>
                <BoSectionHead size="md" title="Connected systems" sub="Inventory is the source of truth. A sale anywhere updates stock, the online store, the merch shop and every screen in seconds." />
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                  {[
                    { k: 'pos', on: preset.commerce.pos, label: 'Register (POS)', desc: `${catalog.length} items ready to ring`, act: 'Open register', go: () => setShowRegister(true) },
                    { k: 'store', on: activePage.isAcceptingOrders, label: 'Online store', desc: activePage.isAcceptingOrders ? 'Taking orders' : 'Turn on to sell online', act: 'Manage', go: () => setActiveTab('INVENTORY') },
                    { k: 'merch', on: preset.commerce.merchShop, label: 'Merch shop', desc: 'Branded goods from the same stock', act: 'Add merch', go: () => setActiveTab('INVENTORY') },
                    { k: 'kiosk', on: preset.commerce.kiosk, label: 'Self-order kiosk', desc: 'Any tablet, live menu', act: 'Launch', go: () => setShowKiosk(true) },
                    { k: 'signage', on: activePage.digitalSignageEnabled || slides.length > 0, label: 'Digital signage', desc: `${slides.filter(x => x.isActive).length} slides · feeds: ${preset.commerce.signageFeeds.map(f => f.toLowerCase().replace('_', ' ')).join(', ')}`, act: 'Screens', go: () => setActiveTab('SIGNAGE') },
                    { k: 'crm', on: true, label: 'CRM', desc: `${preset.crm.pipelines.map(p => p.label).join(' · ')}`, act: 'Open', go: () => setActiveTab('CRM') },
                  ].map(x => (
                    <button key={x.k} onClick={x.go} className="bo-panel text-left p-5 flex flex-col gap-2 bo-row-link" style={{ borderRadius: 20 }}>
                      <span className="flex items-center gap-2 text-[13px]" style={{ color: x.on ? BO.success : BO.muted }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: x.on ? BO.success : 'rgba(255,255,255,0.25)' }} />{x.on ? 'Connected' : 'Not set up'}
                      </span>
                      <span className="bo-title text-[19px] text-white">{x.label}</span>
                      <span className="text-[13px] text-[#A39BAE] leading-snug">{x.desc}</span>
                      <span className="text-[13px] font-semibold mt-1" style={{ color: accent }}>{x.act} →</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Ready-to-run wiring from the ops preset */}
              <section>
                <BoSectionHead size="md" title={`Ready to run for ${preset.label.toLowerCase()}`} sub="Playbooks, pipelines and templates already set up for your kind of business. Edit anything." />
                <div className="bo-rule" style={{ borderTop: `1px solid ${BO.line}` }}>
                  {[
                    { n: preset.events.length, label: 'Event playbooks', items: preset.events.map(e => `${e.emoji} ${e.label}`).join(' · '), tab: 'EVENTS' as BizTab },
                    { n: preset.crm.pipelines.length, label: 'Sales pipelines', items: preset.crm.pipelines.map(p => `${p.label} (${p.stages.length} stages)`).join(' · '), tab: 'CRM' as BizTab },
                    { n: preset.correspondence.length, label: 'Letters, emails & postcards', items: preset.correspondence.slice(0, 5).map(t => t.label).join(' · '), tab: 'CRM' as BizTab },
                    { n: preset.social.starterPosts.length, label: 'Starter social posts', items: preset.social.pillars.map(p => p.label).join(' · '), tab: 'SOCIAL' as BizTab },
                    { n: preset.marketing.length, label: 'Marketing plays', items: preset.marketing.map(m => m.label).join(' · '), tab: 'MARKETING' as BizTab },
                  ].map(r => (
                    <button key={r.label} onClick={() => setActiveTab(r.tab)} className="bo-row-link w-full text-left grid items-baseline gap-4 py-4 px-1" style={{ gridTemplateColumns: '56px minmax(0,1fr) auto' }}>
                      <span className="bo-num text-[28px] text-white">{r.n}</span>
                      <span className="min-w-0"><span className="block text-[16px] font-semibold text-white">{r.label}</span><span className="block text-[13px] text-[#A39BAE] truncate">{r.items}</span></span>
                      <span className="text-[13px] font-semibold" style={{ color: accent }}>Open →</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Feature switches */}
              <section className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div>
                  <BoLabel className="mb-2">Features</BoLabel>
                  <div className="bo-rule">
                    {[
                      { key: 'isAcceptingOrders', label: 'Online orders', desc: 'Plajah customers check out with Stripe' },
                      { key: 'crmEnabled', label: 'CRM', desc: 'Pipelines, segments and correspondence' },
                      { key: 'rewardsEnabled', label: 'Rewards', desc: 'Points recognized at the register' },
                      { key: 'digitalSignageEnabled', label: 'Digital signage', desc: 'Live menu, deals and events on any screen' },
                      { key: 'radioServiceEnabled', label: 'In-store radio', desc: 'Now Playing to every phone in the room' },
                    ].map(feat => {
                      const isOn = Boolean((activePage as any)[feat.key]);
                      return (
                        <div key={feat.key} className="flex items-center gap-4 py-3.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-[15px] font-medium text-white">{feat.label}</div>
                            <div className="text-[13px] text-[#A39BAE]">{feat.desc}</div>
                          </div>
                          <button
                            role="switch" aria-checked={isOn} aria-label={feat.label}
                            onClick={async () => { const updated = await saveBusinessPage({ ...activePage, [feat.key]: !isOn }); setActivePage(updated); setPages(prev => prev.map(x => x.id === updated.id ? updated : x)); }}
                            className="shrink-0 w-12 h-7 rounded-full relative transition-colors"
                            style={{ background: isOn ? accent : 'rgba(255,255,255,0.14)' }}
                          >
                            <span className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all" style={{ left: isOn ? 24 : 4 }} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <BoLabel className="mb-2">Plajah member discount</BoLabel>
                  <p className="m-0 text-[14px] text-[#A39BAE] mb-4">An exclusive discount for Plajah members brings platform users through your door.</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min={0} max={50} aria-label="Plajah member discount percent"
                      value={activePage.plajahUserDiscountPct || 0}
                      onChange={async e => { const val = Math.max(0, Math.min(50, parseInt(e.target.value) || 0)); const updated = await saveBusinessPage({ ...activePage, plajahUserDiscountPct: val }); setActivePage(updated); }}
                      className="bo-input bo-num text-center" style={{ width: 96, fontSize: 24 }}
                    />
                    <span className="bo-num text-2xl text-white">%</span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ── TODAY (the staff board) ── */}
          {activeTab === 'TODAY' && (
            <div className="space-y-10 bo-rise">
              <BoSectionHead
                title={`Today at ${activePage.businessName}`}
                sub={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                action={<>
                  {preset.commerce.pos && <button className="bo-btn bo-btn-primary" onClick={() => setShowRegister(true)}><ShoppingBag size={16} /> Open register</button>}
                  {preset.commerce.kiosk && <button className="bo-btn bo-btn-ghost" onClick={() => setShowKiosk(true)}>Kiosk</button>}
                </>}
              />
              <BoKpiStrip items={[
                { label: 'Sales today', value: money(salesToday) },
                { label: `Open ${vocab.orderNounPlural}`, value: String(openStoreOrders.length + openLegacy.length), onClick: () => setActiveTab('ORDERS') },
                { label: 'Ready for pickup', value: String(openStoreOrders.filter(o => o.status === 'READY').length), onClick: () => setActiveTab('ORDERS') },
                { label: 'Low stock', value: String(lowStock.length), tone: lowStock.length ? 'warn' : 'flat', onClick: () => setActiveTab('INVENTORY') },
              ]} />
              <div className="grid gap-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div>
                  <BoLabel className="mb-2">Needs attention</BoLabel>
                  <BoTaskList
                    empty="All caught up."
                    items={[
                      ...openStoreOrders.slice(0, 6).map(o => ({ id: `o_${o.id}`, title: `${o.customerName || 'Walk-in'} · ${o.items.reduce((a, l) => a + l.qty, 0)} items`, meta: `${o.fulfillment === 'SHIP' ? 'Ship' : 'Pickup'} · ${new Date(o.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`, tone: (o.status === 'READY' ? 'ok' : 'due') as 'ok' | 'due', action: o.status === 'READY' ? 'Ready' : 'Prepare', onClick: () => setActiveTab('ORDERS') })),
                      ...lowStock.slice(0, 5).map(p => ({ id: `s_${p.id}`, title: p.title, meta: stockStatus(p) === 'OUT' ? 'Out of stock: hidden from screens' : `Low: ${p.stock} left`, tone: 'due' as const, action: 'Restock', onClick: () => setActiveTab('INVENTORY') })),
                    ]}
                  />
                </div>
                <div>
                  <BoLabel className="mb-2">Your role today</BoLabel>
                  <div className="bo-rule">
                    {preset.staffToday.map(d => (
                      <div key={d.role} className="py-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="bo-title text-lg text-white">{d.role}</span>
                          {d.opens && visibleIds.includes(d.opens as BizTab) && <button onClick={() => setActiveTab(d.opens as BizTab)} className="text-[13px] font-semibold" style={{ color: accent }}>Open →</button>}
                        </div>
                        <ul className="m-0 mt-1.5 pl-4 text-[14px] text-[#D9D3E0] space-y-0.5">{d.duties.map(x => <li key={x}>{x}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── APPOINTMENTS & CLINICAL WORKSPACE ── */}
          {activeTab === 'APPOINTMENTS' && activePage && (
            activePage.businessType === 'HEALTH' ? (
              <ClinicalCareGate businessName={activePage.businessName} userId={(activePage as any).ownerId}>
                <AppointmentsManager
                  businessId={activePage.id}
                  businessName={activePage.businessName}
                  isHealthOrDental
                />
              </ClinicalCareGate>
            ) : (
              <AppointmentsManager
                businessId={activePage.id}
                businessName={activePage.businessName}
                isHealthOrDental={false}
              />
            )
          )}

          {/* ── TICKETS (generic ticket engine: repair orders, wash-and-fold tickets) ── */}
          {activeTab === 'TICKETS' && packForPage(activePage)?.ticket && (
            <Suspense fallback={<div className="text-white/40 text-sm py-8">Loading...</div>}>
              <TicketsBoard api={ticketApi!} cfg={packForPage(activePage)!.ticket!} businessName={activePage?.businessName} />
            </Suspense>
          )}

          {/* ── ORDERS ── */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-6">
              {/* Store/kiosk/POS orders (the order spine) — advance status + notify the customer. */}
              <BusinessOrdersPanel businessUid={currentUser.uid} businessName={activePage?.businessName || currentUser.displayName || 'My Business'} businessPhoto={currentUser.photoURL} />
              {orders.length === 0 ? (
                <Card><p className="text-white/30 text-sm text-center py-8">No orders yet</p></Card>
              ) : (
                orders.map(order => (
                  <Card key={order.id}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs font-black text-white">{order.customerName}</p>
                        <p className="text-[9px] text-white/40">{new Date(order.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={order.status} />
                        <p className="text-xs font-black text-white">${order.total.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="space-y-1 mb-3">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs text-white/50">
                          <span>{item.name} × {item.quantity}</span>
                          <span>${(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['CONFIRMED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED'] as BusinessOrder['status'][]).map(s => (
                        order.status !== s && (
                          <button
                            key={s}
                            onClick={() => updateOrderStatus(order.id, s).then(() => setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: s } : o)))}
                            className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all"
                          >
                            → {s}
                          </button>
                        )
                      ))}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ── CRM ── */}
          {activeTab === 'INVENTORY' && (
            <div className="space-y-3">
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setShowRegister(true)} className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>
                  <ShoppingBag size={13} /> Open register
                </button>
                <button onClick={() => setShowKiosk(true)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest">
                  <ShoppingBag size={13} /> Launch in-store kiosk
                </button>
              </div>
              <InventoryHub sellerId={currentUser.uid} sellerName={activePage?.businessName || currentUser.displayName || 'My Store'} sellerType="ORG" sellerPhoto={activePage?.logoUrl || currentUser.photoURL || undefined} audience="business" />
              <RegisterBackOffice businessUid={currentUser.uid} />
              <OffersManager businessUid={currentUser.uid} />
            </div>
          )}

          {/* In-store ordering kiosk — full-screen overlay (BYO tablet), orders via the store spine. */}
          {showKiosk && (
            <StoreKioskMode
              businessUid={currentUser.uid}
              businessName={activePage?.businessName || currentUser.displayName || 'My Store'}
              onExit={() => setShowKiosk(false)}
            />
          )}

          {/* Staff-facing POS register — cash sales on the order spine + inventory + loyalty. */}
          {showRegister && (
            <PosRegister
              businessUid={currentUser.uid}
              businessName={activePage?.businessName || currentUser.displayName || 'My Store'}
              onExit={() => setShowRegister(false)}
            />
          )}

          {/* Turn any screen into a purpose-built display (now-playing / menu / signage / kiosk / register). */}
          {showDisplays && (
            <DisplayModeLauncher
              businessUid={currentUser.uid}
              businessName={activePage?.businessName || currentUser.displayName || 'My Store'}
              pageId={activePage?.id}
              menuItems={activePage?.menuItems || []}
              onExit={() => setShowDisplays(false)}
            />
          )}

          {activeTab === 'TEAM' && (
            <StaffHRManager businessUid={currentUser.uid} businessName={activePage?.businessName || currentUser.displayName || 'My Business'} />
          )}

          {activeTab === 'MESSAGING' && (
            <div className="space-y-8">
              <BusinessBroadcastComposer business={{ uid: currentUser.uid, name: activePage?.businessName || currentUser.displayName || 'My Business', photo: currentUser.photoURL }} />
              <div className="pt-6 border-t border-white/10">
                <ArtistPromoDirectory business={{ uid: currentUser.uid, name: activePage?.businessName || currentUser.displayName || 'My Business' }} />
              </div>
            </div>
          )}

          {activeTab === 'LISTINGS' && (
            <ListingsManager currentUser={currentUser} onNavigate={onNavigate} />
          )}

          {activeTab === 'COMPLIANCE' && (
            <BusinessCompliance business={activePage} />
          )}

          {activeTab === 'CRM' && (
            <Suspense fallback={<div className="py-16 text-center text-sm text-[#A39BAE]">Loading CRM…</div>}>
              <BizCrm businessPage={activePage} currentUser={{ uid: currentUser.uid, displayName: currentUser.displayName }} preset={preset} accent={accent} mode={mode} />
            </Suspense>
          )}

          {/* ── DIGITAL SIGNAGE (live: products, menu, deals and events from the shared catalog) ── */}
          {activeTab === 'SIGNAGE' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <button onClick={() => setShowDisplays(true)} className="bo-btn bo-btn-ghost bo-btn-sm"><Monitor size={14} /> Display modes</button>
              </div>
              <SignageStudio businessPage={activePage} sellerUid={activePage.ownerId || currentUser.uid} accent={accent} />
            </div>
          )}

          {/* ── EVENTS / SOCIAL (ops-preset playbooks) ── */}
          {(activeTab === 'EVENTS' || activeTab === 'SOCIAL') && (
            <GrowthHub
              preset={preset}
              host={{ kind: 'business', id: activePage.id, name: activePage.businessName }}
              currentUser={currentUser}
              identity={identity}
              canManage={mode === 'owner'}
              loadRecipients={loadRecipients}
              onOpenSuite={() => { setActiveTab('MARKETING'); setShowSuite(true); }}
              only={activeTab === 'EVENTS' ? 'events' : 'social'}
            />
          )}

          {/* ── SEED RAISER ── */}
          {activeTab === 'SEEDRAISER' && (
            <div className="space-y-6">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">Seed Raiser</h2>
                  <p className="text-xs text-white/40 mt-1">Launch crowdfunding campaigns to fund your projects. Platform takes 5% of funds raised.</p>
                </div>
                <button
                  onClick={() => setEditingCampaign({ category: 'OTHER', goalAmount: 1000, rewards: [], status: 'DRAFT', updates: [] })}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#06D6A0] to-[#00B4D8] text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                >
                  <Leaf size={12} /> New Campaign
                </button>
              </div>

              {campaigns.length === 0 ? (
                <Card><p className="text-white/30 text-sm text-center py-8">No campaigns yet</p></Card>
              ) : (
                campaigns.map(c => (
                  <Card key={c.id}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-black text-white">{c.title}</p>
                        <p className="text-[9px] text-white/40 uppercase tracking-widest">{c.category}</p>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/40">Raised</span>
                        <span className="font-black text-white">${c.currentAmount.toFixed(0)} / ${c.goalAmount.toFixed(0)}</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#06D6A0] to-[#00B4D8] rounded-full transition-all"
                          style={{ width: `${Math.min((c.currentAmount / c.goalAmount) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px] text-white/30">{c.backerCount} backers</span>
                        <span className="text-[9px] text-white/30">Ends {new Date(c.endDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {c.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePublishCampaign(c.id)}
                          className="px-3 py-1.5 bg-[#06D6A0] text-black rounded-full text-[8px] font-black uppercase tracking-widest"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => setEditingCampaign(c)}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white"
                      >
                        Edit
                      </button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ── RADIO ── */}
          {activeTab === 'RADIO' && (
            <Card>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-[#D40055]/20 rounded-2xl">
                  <Radio size={24} className="text-[#D40055]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">In-Store Radio Service</h3>
                  <p className="text-xs text-white/40">Stream licensed music to your business location via Plajah</p>
                </div>
              </div>
              {activePage.radioServiceEnabled ? (
                <div className="space-y-4">
                  <div className="p-4 bg-[#D40055]/10 border border-[#D40055]/30 rounded-2xl">
                    <p className="text-xs font-black text-[#D40055]">Radio Service Active</p>
                    <p className="text-[10px] text-white/40 mt-1">Plajah radio is streaming to your business. Manage your station preferences in your Plajah profile radio settings.</p>
                  </div>
                  <button className="w-full py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">
                    Configure Station
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/30 text-sm mb-4">Radio service is disabled for this business</p>
                  <button
                    onClick={async () => {
                      const updated = await saveBusinessPage({ ...activePage, radioServiceEnabled: true });
                      setActivePage(updated);
                    }}
                    className="px-6 py-3 bg-[#D40055] rounded-2xl text-xs font-black uppercase tracking-widest text-white"
                  >
                    Enable Radio Service
                  </button>
                </div>
              )}
            </Card>
          )}
          {activeTab === 'RADIO' && (
            <NowPlayingPublisher businessUid={currentUser.uid} businessName={activePage?.businessName || currentUser.displayName || 'My Business'} />
          )}

          {/* ── MARKETING: preset plays + billboard / mail hand-offs, then the full Organic ⇄ Paid suite ── */}
          {activeTab === 'MARKETING' && activePage && (
            showSuite ? (
              <div className="space-y-4">
                <button className="bo-btn bo-btn-ghost bo-btn-sm" onClick={() => setShowSuite(false)}>← Plays & hand-offs</button>
                <div className="rounded-[24px] overflow-hidden" style={{ border: `1px solid ${BO.line}` }}>
                  <MarketingKit scope={{ kind: 'BUSINESS', id: activePage.id, name: activePage.businessName }} currentUser={currentUser} />
                </div>
              </div>
            ) : (
              <GrowthHub
                preset={preset}
                host={{ kind: 'business', id: activePage.id, name: activePage.businessName }}
                currentUser={currentUser}
                identity={identity}
                canManage={mode === 'owner'}
                loadRecipients={loadRecipients}
                onOpenSuite={() => setShowSuite(true)}
                only="marketing"
              />
            )
          )}

          {/* ── SETTINGS ── */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-4">
              <Card>
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4">Business Details</h3>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => setEditingPage(activePage)}
                    className="flex items-center gap-2 px-5 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                  >
                    <Edit3 size={12} /> Edit Details
                  </button>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate('BUSINESS_PUBLIC', { businessPage: activePage })}
                      className="flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/20 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/15 transition-all"
                    >
                      <Globe size={12} /> View Public Page
                    </button>
                  )}
                  <button
                    onClick={handleSeedFullDemo}
                    disabled={seedingDemo}
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
                  >
                    <Zap size={12} /> {seedingDemo ? 'Building…' : 'Populate full demo'}
                  </button>
                </div>
                <p className="text-white/30 text-[11px] mt-3">Fills this business with demo products, deals, team, signage, menu, a geofence & a live now-playing track — the whole stack, ready to tour.</p>
              </Card>
              <Card>
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Store location (auto check-in)</h3>
                <p className="text-[11px] text-white/40 mb-4">Set your storefront's coordinates so customers who opt in are auto-checked-in when they arrive — unlocking the live Now Playing card, tips & the music pulse.</p>
                {typeof activePage.geoLat === 'number' && typeof activePage.geoLng === 'number' ? (
                  <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-300 mb-3">
                    📍 Set: {activePage.geoLat.toFixed(5)}, {activePage.geoLng.toFixed(5)} · {activePage.geoRadiusM || 150}m radius
                  </div>
                ) : (
                  <div className="text-[11px] text-white/40 mb-3">No location set yet.</div>
                )}
                <div className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={() => {
                      if (!navigator.geolocation) { alert('Geolocation unavailable on this device.'); return; }
                      navigator.geolocation.getCurrentPosition(
                        async pos => {
                          const updated = await saveBusinessPage({ ...activePage, geoLat: pos.coords.latitude, geoLng: pos.coords.longitude, geoRadiusM: activePage.geoRadiusM || 150 });
                          setActivePage(updated);
                          setPages(prev => prev.map(p => p.id === updated.id ? updated : p));
                        },
                        () => alert('Could not get location — allow location access and try again.'),
                        { enableHighAccuracy: true, timeout: 10000 },
                      );
                    }}
                    className="flex items-center gap-2 px-5 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                  >
                    <MapPin size={12} /> Use current location
                  </button>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-white/60">
                    Radius (m)
                    <input type="number" defaultValue={activePage.geoRadiusM || 150} min={30} max={2000}
                      onBlur={async e => {
                        const r = Math.max(30, Math.min(2000, Number(e.target.value) || 150));
                        const updated = await saveBusinessPage({ ...activePage, geoRadiusM: r });
                        setActivePage(updated);
                      }}
                      className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
                  </label>
                  {typeof activePage.geoLat === 'number' && (
                    <button
                      onClick={async () => {
                        const updated = await saveBusinessPage({ ...activePage, geoLat: undefined, geoLng: undefined });
                        setActivePage(updated);
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white"
                    >Clear</button>
                  )}
                </div>
              </Card>
              <Card>
                <h3 className="text-sm font-black uppercase tracking-widest text-red-400 mb-4">Danger Zone</h3>
                <button
                  onClick={async () => {
                    if (!window.confirm('Delete this business page?')) return;
                    await deleteBusinessPage(activePage.id);
                    setPages(prev => prev.filter(p => p.id !== activePage.id));
                    setActivePage(null);
                  }}
                  className="flex items-center gap-2 px-5 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs font-black uppercase tracking-widest text-red-400"
                >
                  <Trash2 size={12} /> Delete Business Page
                </button>
              </Card>
            </div>
          )}
          </div>
        </div>
      )}

      {/* ── Edit Business Modal ── */}
      <AnimatePresence>
        {editingPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto"
            onClick={e => { if (e.target === e.currentTarget) setEditingPage(null); }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 space-y-4 my-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-white">{editingPage.id ? 'Edit Business' : 'New Business'}</h3>
                <button onClick={() => setEditingPage(null)}><X size={16} className="text-white/40" /></button>
              </div>
              {[
                { key: 'businessName', label: 'Business Name', placeholder: 'Your Business Name' },
                { key: 'description', label: 'Description', placeholder: 'What does your business do?' },
                { key: 'address', label: 'Address', placeholder: '123 Main St' },
                { key: 'city', label: 'City', placeholder: 'City, State' },
                { key: 'phone', label: 'Phone', placeholder: '+1 (555) 000-0000' },
                { key: 'website', label: 'Website', placeholder: 'https://yourbusiness.com' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">{field.label}</label>
                  <input
                    value={(editingPage as any)[field.key] || ''}
                    onChange={e => setEditingPage(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-white/20 outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">Business Type</label>
                <select
                  value={editingPage.businessType || 'OTHER'}
                  onChange={e => setEditingPage(prev => ({ ...prev, businessType: e.target.value as any }))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white outline-none"
                >
                  {['RETAIL','RESTAURANT','SERVICE','ENTERTAINMENT','TECH','HEALTH','REAL_ESTATE','OTHER'].map(t => (
                    <option key={t} value={t}>{getVertical(t).label}</option>
                  ))}
                </select>
              </div>
              <p className="text-[13px] text-[#A39BAE]">After you save, pick your exact business type (grocery, mechanic, dealership, venue…) on the Overview to load its catalog, pipelines and playbooks.</p>
              <button
                onClick={handleSavePage}
                className="bo-btn bo-btn-primary w-full"
              >
                {editingPage.id ? 'Save Changes' : 'Create Business Page'}
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Edit Campaign Modal ── */}
        {editingCampaign && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto"
            onClick={e => { if (e.target === e.currentTarget) setEditingCampaign(null); }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 space-y-4 my-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Seed Raiser Campaign</h3>
                <button onClick={() => setEditingCampaign(null)}><X size={16} className="text-white/40" /></button>
              </div>
              {[
                { key: 'title', label: 'Campaign Title', placeholder: 'My Awesome Project' },
                { key: 'description', label: 'Description', placeholder: 'What are you raising funds for?' },
                { key: 'coverUrl', label: 'Cover Image URL', placeholder: 'https://…' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input
                    value={(editingCampaign as any)[f.key] || ''}
                    onChange={e => setEditingCampaign(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-white/20 outline-none"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">Goal ($)</label>
                  <input
                    type="number"
                    value={editingCampaign.goalAmount || 1000}
                    onChange={e => setEditingCampaign(prev => ({ ...prev, goalAmount: parseFloat(e.target.value) || 1000 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">Category</label>
                  <select
                    value={editingCampaign.category || 'OTHER'}
                    onChange={e => setEditingCampaign(prev => ({ ...prev, category: e.target.value as any }))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white outline-none"
                  >
                    {['MUSIC','VIDEO','ART','TECH','COMMUNITY','BUSINESS','OTHER'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">End Date</label>
                <input
                  type="date"
                  value={editingCampaign.endDate ? new Date(editingCampaign.endDate).toISOString().slice(0, 10) : ''}
                  onChange={e => setEditingCampaign(prev => ({ ...prev, endDate: new Date(e.target.value).getTime() }))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white outline-none"
                />
              </div>
              <p className="text-[9px] text-white/30">Platform takes 5% of all funds raised. The rest goes directly to you via Stripe.</p>
              <button onClick={handleSaveCampaign} className="w-full py-3 bg-gradient-to-r from-[#06D6A0] to-[#00B4D8] text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-all">
                Save Campaign
              </button>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </BoScope>
  );
};

export default BusinessDashboard;
