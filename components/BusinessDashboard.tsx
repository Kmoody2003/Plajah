import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Store, ShoppingBag, Radio, Monitor, Users, Plus, X, Check, Edit3,
  Trash2, ChevronRight, Clock, Package, Star, Zap, Globe, Leaf,
  Settings, ToggleLeft, ToggleRight, Search, Filter, Mail, Phone,
  BarChart3, Target, RefreshCw, Play, Pause, Image, MapPin, Building2, ShieldCheck
} from 'lucide-react';
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
import ListingsManager from './terra/ListingsManager';
import BusinessCompliance from './terra/BusinessCompliance';
import InventoryManager from './InventoryManager';
import StoreKioskMode from './StoreKioskMode';
import PosRegister from './PosRegister';
import OffersManager from './OffersManager';
import NowPlayingPublisher from './NowPlayingPublisher';
import DisplayModeLauncher from './DisplayModeLauncher';
import BusinessBroadcastComposer from './BusinessBroadcastComposer';
import BusinessOrdersPanel from './BusinessOrdersPanel';
import ArtistPromoDirectory from './ArtistPromoDirectory';
import StaffHRManager from './StaffHRManager';

type BizTab = 'OVERVIEW' | 'ORDERS' | 'INVENTORY' | 'TEAM' | 'MESSAGING' | 'CRM' | 'SIGNAGE' | 'SEEDRAISER' | 'RADIO' | 'SETTINGS' | 'LISTINGS' | 'COMPLIANCE';

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
  const [editingContact, setEditingContact] = useState<Partial<CrmContact> | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Partial<SeedRaiserCampaign> | null>(null);
  const [editingSlide, setEditingSlide] = useState<Partial<DigitalSignageSlide> | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [signageRunning, setSignageRunning] = useState(false);
  const [signageIdx, setSignageIdx] = useState(0);

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
    fetchCrmContacts(activePage.id).then(setContacts);
    fetchSignageSlides(activePage.id).then(setSlides);
    fetchMySeedRaiserCampaigns().then(setCampaigns);
    return unsub;
  }, [activePage?.id]);

  // Signage slideshow
  useEffect(() => {
    if (!signageRunning || slides.length === 0) return;
    const active = slides.filter(s => s.isActive);
    if (active.length === 0) return;
    const id = setInterval(() => setSignageIdx(i => (i + 1) % active.length), (active[signageIdx]?.durationSeconds || 10) * 1000);
    return () => clearInterval(id);
  }, [signageRunning, slides, signageIdx]);

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

  const handleSaveContact = async () => {
    if (!editingContact || !activePage) return;
    const saved = await saveCrmContact({ ...editingContact, businessId: activePage.id });
    setContacts(prev => {
      const exists = prev.find(c => c.id === saved.id);
      return exists ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved];
    });
    setEditingContact(null);
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

  const handleSaveSlide = async () => {
    if (!editingSlide || !activePage) return;
    const saved = await saveSignageSlide({ ...editingSlide, businessId: activePage.id });
    setSlides(prev => {
      const exists = prev.find(s => s.id === saved.id);
      return exists ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved];
    });
    setEditingSlide(null);
  };

  const ALL_TABS: { id: BizTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'OVERVIEW',   label: 'Overview',     icon: Store },
    { id: 'LISTINGS',   label: 'Listings',     icon: Building2 },
    { id: 'COMPLIANCE', label: 'Compliance',   icon: ShieldCheck },
    { id: 'ORDERS',     label: 'Orders',       icon: ShoppingBag },
    { id: 'INVENTORY',  label: 'Inventory',    icon: Package },
    { id: 'TEAM',       label: 'Team & HR',    icon: Users },
    { id: 'MESSAGING',  label: 'Messaging',    icon: Mail },
    { id: 'CRM',        label: 'CRM',          icon: Users },
    { id: 'SIGNAGE',    label: 'Signage',      icon: Monitor },
    { id: 'SEEDRAISER', label: 'Seed Raiser',  icon: Leaf },
    { id: 'RADIO',      label: 'Radio',        icon: Radio },
    { id: 'SETTINGS',   label: 'Settings',     icon: Settings },
  ];

  // Show only the tabs this vertical actually uses — a realtor has no inventory
  // or in-store radio. Ordered by the vertical so its priorities lead.
  const vertical = getVertical(activePage?.businessType);
  const tabs = vertical.tabs
    .map(id => ALL_TABS.find(t => t.id === (id as BizTab)))
    .filter((t): t is typeof ALL_TABS[number] => Boolean(t));

  if (loading) return (
    <div className="flex items-center gap-3 text-white/30 p-8">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      <span className="text-xs">Loading business dashboard…</span>
    </div>
  );

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-5xl md:text-[6rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Business</h1>
          <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-4">Manage your Plajah business presence</p>
        </div>
        <button
          onClick={() => setEditingPage({ businessType: 'RETAIL', isAcceptingOrders: false, radioServiceEnabled: false, digitalSignageEnabled: false, crmEnabled: false, rewardsEnabled: false })}
          className="flex items-center gap-2 px-5 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
        >
          <Plus size={12} /> New Business
        </button>
      </div>

      {/* Business page selector */}
      {pages.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {pages.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePage(p)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                activePage?.id === p.id ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:text-white border border-white/10'
              }`}
            >
              <Store size={11} />
              {p.businessName}
            </button>
          ))}
        </div>
      )}

      {/* No pages yet */}
      {pages.length === 0 && !editingPage && (
        <Card>
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="p-6 bg-white/5 rounded-3xl">
              <Store size={40} className="text-white/20" />
            </div>
            <div className="text-center">
              <p className="text-white font-black text-lg">No Business Pages Yet</p>
              <p className="text-white/30 text-sm mt-1 max-w-sm">Create a business page to unlock orders, CRM, digital signage, in-store radio, and Seed Raiser crowdfunding.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setEditingPage({ businessType: 'RETAIL', isAcceptingOrders: false, radioServiceEnabled: false, digitalSignageEnabled: false, crmEnabled: false, rewardsEnabled: false })}
                className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/15 rounded-2xl text-xs font-black uppercase tracking-widest text-white"
              >
                <Plus size={12} /> Create Business Page
              </button>
              <button
                onClick={handleSeedFullDemo}
                disabled={seedingDemo}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
              >
                <Zap size={12} /> {seedingDemo ? 'Building demo…' : 'Populate full demo'}
              </button>
            </div>
            <p className="text-white/25 text-[11px] max-w-sm text-center">“Populate full demo” builds a complete café — products, deals, team, signage, menu, geofence & a live now-playing track — so you can tour the entire stack.</p>
          </div>
        </Card>
      )}

      {/* Tab nav (only when a page is selected) */}
      {activePage && (
        <>
          <div className="flex gap-2 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === t.id ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'
                }`}
              >
                <t.icon size={11} />
                {t.label}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Orders', value: orders.length, icon: ShoppingBag, color: '#D40055' },
                  { label: 'Active', value: orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length, icon: Clock, color: '#FF8C00' },
                  { label: 'CRM Contacts', value: contacts.length, icon: Users, color: '#6B0099' },
                  { label: 'Campaigns', value: campaigns.length, icon: Leaf, color: '#06D6A0' },
                ].map(item => (
                  <Card key={item.label}>
                    <div className="p-2 rounded-xl w-fit mb-3" style={{ background: `${item.color}20` }}>
                      <item.icon size={16} style={{ color: item.color }} />
                    </div>
                    <p className="text-2xl font-black text-white">{item.value}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-0.5">{item.label}</p>
                  </Card>
                ))}
              </div>

              {/* Feature toggles */}
              <Card>
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-5">Business Features</h3>
                <div className="space-y-4">
                  {[
                    { key: 'isAcceptingOrders',       label: 'Online Orders',           icon: ShoppingBag, desc: 'Accept orders from Plajah users with Stripe checkout' },
                    { key: 'crmEnabled',               label: 'CRM & Rewards',           icon: Users,       desc: 'Customer relationship management and loyalty points' },
                    { key: 'digitalSignageEnabled',    label: 'Digital Signage',         icon: Monitor,     desc: 'Manage in-store display content remotely' },
                    { key: 'radioServiceEnabled',      label: 'In-Store Radio',          icon: Radio,       desc: 'Plajah radio streaming service for your business' },
                    { key: 'rewardsEnabled',           label: 'Customer Rewards',        icon: Star,        desc: 'Points-based loyalty program for your customers' },
                  ].map(feat => {
                    const isOn = (activePage as any)[feat.key] as boolean;
                    return (
                      <div key={feat.key} className="flex items-center gap-4 py-3 border-b border-white/[0.05] last:border-0">
                        <div className="p-2 bg-white/5 rounded-xl">
                          <feat.icon size={14} className="text-white/40" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-black text-white">{feat.label}</p>
                          <p className="text-[9px] text-white/30">{feat.desc}</p>
                        </div>
                        <button
                          onClick={async () => {
                            const updated = await saveBusinessPage({ ...activePage, [feat.key]: !isOn });
                            setActivePage(updated);
                          }}
                          className="shrink-0"
                        >
                          {isOn ? <ToggleRight size={28} className="text-[#06D6A0]" /> : <ToggleLeft size={28} className="text-white/20" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Plajah user discount */}
              <Card>
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4">Plajah User Discount</h3>
                <p className="text-xs text-white/40 mb-4">Offer an exclusive discount to all Plajah subscribers at your business. Attracts platform users to your location.</p>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={activePage.plajahUserDiscountPct || 0}
                    onChange={async e => {
                      const val = parseInt(e.target.value) || 0;
                      const updated = await saveBusinessPage({ ...activePage, plajahUserDiscountPct: val });
                      setActivePage(updated);
                    }}
                    className="w-24 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-center text-xl font-black text-white outline-none"
                  />
                  <span className="text-2xl font-black text-white">%</span>
                  <span className="text-xs text-white/40">discount for Plajah users</span>
                </div>
              </Card>
            </div>
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
              <InventoryManager sellerId={currentUser.uid} sellerName={activePage?.businessName || currentUser.displayName || 'My Store'} />
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
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                  <Search size={14} className="text-white/30" />
                  <input
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder="Search contacts…"
                    className="flex-1 bg-transparent text-xs text-white placeholder-white/20 outline-none"
                  />
                </div>
                <button
                  onClick={() => setEditingContact({ tags: [], notes: '', businessId: activePage.id, rewardPoints: 0, totalSpend: 0, visitCount: 0 })}
                  className="flex items-center gap-2 px-4 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              {contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase())).map(contact => (
                <Card key={contact.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-black text-white">{contact.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {contact.email && <span className="flex items-center gap-1 text-[9px] text-white/40"><Mail size={9} />{contact.email}</span>}
                        {contact.phone && <span className="flex items-center gap-1 text-[9px] text-white/40"><Phone size={9} />{contact.phone}</span>}
                      </div>
                      {contact.tags.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {contact.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-white/5 rounded-full text-[8px] text-white/40">{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-4 mt-2">
                        <span className="text-[9px] text-white/30">Points: <span className="text-white/60 font-black">{contact.rewardPoints}</span></span>
                        <span className="text-[9px] text-white/30">Spend: <span className="text-white/60 font-black">${contact.totalSpend.toFixed(2)}</span></span>
                        <span className="text-[9px] text-white/30">Visits: <span className="text-white/60 font-black">{contact.visitCount}</span></span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingContact(contact)} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                        <Edit3 size={12} className="text-white/40" />
                      </button>
                      <button onClick={() => deleteCrmContact(contact.id).then(() => setContacts(prev => prev.filter(c => c.id !== contact.id)))} className="p-2 bg-white/5 rounded-xl hover:bg-red-500/20 transition-all">
                        <Trash2 size={12} className="text-white/40 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ── DIGITAL SIGNAGE ── */}
          {activeTab === 'SIGNAGE' && (
            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <button onClick={() => setShowDisplays(true)} className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>
                  <Monitor size={13} /> Open display modes
                </button>
              </div>
              {/* Live preview */}
              {slides.filter(s => s.isActive).length > 0 && (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Live Preview</h3>
                    <button
                      onClick={() => setSignageRunning(!signageRunning)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                        signageRunning ? 'bg-[#D40055]/20 text-[#D40055]' : 'bg-white/5 text-white/40 hover:text-white'
                      }`}
                    >
                      {signageRunning ? <><Pause size={10} /> Stop</> : <><Play size={10} /> Preview</>}
                    </button>
                  </div>
                  {(() => {
                    const activeSlides = slides.filter(s => s.isActive);
                    const current = activeSlides[signageIdx % activeSlides.length];
                    if (!current) return null;
                    return (
                      <div
                        className="aspect-video rounded-2xl flex items-center justify-center relative overflow-hidden"
                        style={{ background: current.backgroundColor || '#0a0a0a' }}
                      >
                        {current.url && current.type === 'IMAGE' && (
                          <img src={current.url} className="w-full h-full object-cover" alt="" />
                        )}
                        {current.headline && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                            <p className="text-2xl font-black text-white">{current.headline}</p>
                            {current.subtext && <p className="text-sm text-white/60 mt-2">{current.subtext}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </Card>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setEditingSlide({ type: 'TEXT', durationSeconds: 10, isActive: true, order: slides.length, businessId: activePage.id })}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                >
                  <Plus size={12} /> Add Slide
                </button>
              </div>

              <div className="space-y-3">
                {slides.map((slide, i) => (
                  <Card key={slide.id}>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0" style={{ background: slide.backgroundColor || '#111' }}>
                        {slide.type === 'IMAGE' && slide.url ? (
                          <img src={slide.url} className="w-full h-full object-cover rounded-xl" alt="" />
                        ) : (
                          <Monitor size={16} className="text-white/20" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-black text-white">{slide.headline || slide.type}</p>
                        <p className="text-[9px] text-white/40">{slide.durationSeconds}s · {slide.type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {slide.isActive ? <ToggleRight size={22} className="text-[#06D6A0]" /> : <ToggleLeft size={22} className="text-white/20" />}
                        <button onClick={() => setEditingSlide(slide)}><Edit3 size={14} className="text-white/30 hover:text-white" /></button>
                        <button onClick={() => deleteSignageSlide(slide.id).then(() => setSlides(prev => prev.filter(s => s.id !== slide.id)))}><Trash2 size={14} className="text-white/30 hover:text-red-400" /></button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
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
        </>
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
                  {['RETAIL','RESTAURANT','SERVICE','ENTERTAINMENT','TECH','HEALTH','OTHER'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSavePage}
                className="w-full py-4 bg-gradient-to-r from-[#D40055] to-[#FF8C00] rounded-2xl text-xs font-black uppercase tracking-widest text-white hover:scale-[1.02] transition-all"
              >
                {editingPage.id ? 'Save Changes' : 'Create Business Page'}
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Edit Contact Modal ── */}
        {editingContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setEditingContact(null); }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-white">CRM Contact</h3>
                <button onClick={() => setEditingContact(null)}><X size={16} className="text-white/40" /></button>
              </div>
              {[
                { key: 'name', label: 'Name', placeholder: 'Contact name' },
                { key: 'email', label: 'Email', placeholder: 'email@example.com' },
                { key: 'phone', label: 'Phone', placeholder: '+1 555 000 0000' },
                { key: 'notes', label: 'Notes', placeholder: 'Any notes about this customer…' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input
                    value={(editingContact as any)[f.key] || ''}
                    onChange={e => setEditingContact(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-white/20 outline-none"
                  />
                </div>
              ))}
              <button onClick={handleSaveContact} className="w-full py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-all">
                Save Contact
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

        {/* ── Edit Slide Modal ── */}
        {editingSlide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setEditingSlide(null); }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Signage Slide</h3>
                <button onClick={() => setEditingSlide(null)}><X size={16} className="text-white/40" /></button>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">Slide Type</label>
                <select
                  value={editingSlide.type || 'TEXT'}
                  onChange={e => setEditingSlide(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white outline-none"
                >
                  {['TEXT','IMAGE','VIDEO','PROMO'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {['IMAGE','VIDEO'].includes(editingSlide.type || '') && (
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">Media URL</label>
                  <input
                    value={editingSlide.url || ''}
                    onChange={e => setEditingSlide(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://…"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-white/20 outline-none"
                  />
                </div>
              )}
              {[
                { key: 'headline', label: 'Headline', placeholder: 'Your headline text…' },
                { key: 'subtext', label: 'Subtext', placeholder: 'Supporting text…' },
                { key: 'backgroundColor', label: 'Background Color', placeholder: '#0a0a0a' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input
                    value={(editingSlide as any)[f.key] || ''}
                    onChange={e => setEditingSlide(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-white/20 outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1">Duration (seconds)</label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={editingSlide.durationSeconds || 10}
                  onChange={e => setEditingSlide(prev => ({ ...prev, durationSeconds: parseInt(e.target.value) || 10 }))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white outline-none"
                />
              </div>
              <button onClick={handleSaveSlide} className="w-full py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-all">
                Save Slide
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BusinessDashboard;
