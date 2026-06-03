import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase, DollarSign, FileText, Send, Check, X, Plus, Edit,
  ChevronDown, ChevronUp, Brain, RefreshCw, Copy, Download,
  Star, BarChart3, Users, Megaphone, Radio, Video as VideoIcon,
  Music2, Mail, Phone, Globe, ExternalLink, Clock, CheckCircle2,
  AlertCircle, Zap, Shield, ArrowRight, Package,
} from 'lucide-react';
import { UserProfile } from '../types';
import { updateUserProfile } from '../services/backendService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DealStatus = 'PENDING' | 'NEGOTIATING' | 'ACCEPTED' | 'ACTIVE' | 'COMPLETED' | 'DECLINED';

export interface SponsorshipSlot {
  id: string;
  type: 'POST' | 'PODCAST_MENTION' | 'FAST_CHANNEL' | 'EVENT_SPONSOR' | 'ARTICLE_FEATURE' | 'CUSTOM';
  label: string;
  description: string;
  rateCents: number;
  isAvailable: boolean;
}

export interface BrandDeal {
  id: string;
  creatorUid: string;
  brandName: string;
  brandEmail: string;
  brandWebsite?: string;
  brandLogo?: string;
  slotType: SponsorshipSlot['type'];
  brief: string;
  budgetCents: number;
  status: DealStatus;
  counterOfferCents?: number;
  deliverables: string[];
  dueDate?: number;
  contractUrl?: string;
  depositPaidCents?: number;
  finalPaidCents?: number;
  stripePaymentIntentId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const SLOT_META: Record<SponsorshipSlot['type'], { label: string; icon: React.ElementType; desc: string; defaultDesc: string }> = {
  POST:             { label: 'Social Post',         icon: Megaphone,  desc: 'Dedicated post on Plajah profile',          defaultDesc: 'A dedicated promotional post on my Plajah profile featuring your brand.' },
  PODCAST_MENTION:  { label: 'Podcast Mention',     icon: Radio,      desc: 'Mid-roll mention on podcast episode',        defaultDesc: 'A 60-second mid-roll mention during my podcast with custom talking points.' },
  FAST_CHANNEL:     { label: 'FAST Channel Ad',     icon: VideoIcon,  desc: '30-sec ad in FAST channel rotation',         defaultDesc: 'Your 30-second video ad inserted into my 24/7 FAST channel programming.' },
  EVENT_SPONSOR:    { label: 'Event Sponsorship',   icon: Star,       desc: 'Venue / event branding + shoutout',          defaultDesc: 'Brand placement at my live event including stage signage and verbal acknowledgement.' },
  ARTICLE_FEATURE:  { label: 'Article Feature',     icon: FileText,   desc: 'Dedicated article or newsletter mention',    defaultDesc: 'A dedicated article or featured mention in my Plajah newsletter.' },
  CUSTOM:           { label: 'Custom Package',      icon: Package,    desc: 'Define your own deliverable',               defaultDesc: 'A custom deliverable package — details to be agreed upon.' },
};

const STATUS_META: Record<DealStatus, { label: string; color: string; bg: string }> = {
  PENDING:     { label: 'New Request',   color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  NEGOTIATING: { label: 'Negotiating',  color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  ACCEPTED:    { label: 'Accepted',     color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  ACTIVE:      { label: 'Active',       color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  COMPLETED:   { label: 'Completed',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  DECLINED:    { label: 'Declined',     color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
};

// ── Media Kit Generator ───────────────────────────────────────────────────────

const MediaKitGenerator: React.FC<{ profile: UserProfile; onClose: () => void }> = ({ profile, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [kit, setKit] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const prompt = `Write a professional, punchy 1-page media kit for a creator named "${profile.displayName}" on Plajah.
Account type: ${profile.accountType ?? 'Creator'}
Bio: ${profile.bio ?? 'Independent creator on Plajah.'}
Followers: ${profile.followerCount ?? 0}
Sanctuary members: (data live on platform)

Include:
1. A 2-sentence creator introduction (compelling, not generic)
2. Audience snapshot (demographics, engagement style — write it as aspirational but grounded)
3. Available sponsorship formats with example rates
4. Why this creator is a great brand partner
5. Contact CTA

Keep it under 300 words. Professional, modern, no fluff. Use markdown headers.`;

      const res = await fetch('/api/muse/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'You are a professional talent agency media kit writer.', question: prompt, history: [] }),
      });
      const data = await res.json();
      setKit(data.answer ?? 'Could not generate kit. Try again.');
    } catch {
      setKit('Network error. Check your connection.');
    } finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { generate(); }, [generate]);

  const copyKit = () => {
    navigator.clipboard.writeText(kit);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadKit = () => {
    const blob = new Blob([kit], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${profile.displayName.replace(/\s/g, '-')}-media-kit.md`; a.click();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-[#0d0d0d] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2"><Brain size={15} className="text-[#c084fc]" /> Muse AI Media Kit</h3>
            <p className="text-[9px] text-white/30">Auto-generated from your Plajah analytics</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copyKit} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white/50 hover:text-white transition-all">
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
            <button onClick={downloadKit} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white/50 hover:text-white transition-all">
              <Download size={11} /> Download
            </button>
            <button onClick={onClose}><X size={16} className="text-white/30 hover:text-white" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-3 py-12 justify-center">
              <RefreshCw size={18} className="text-[#c084fc] animate-spin" />
              <p className="text-sm text-white/40">Muse is writing your media kit…</p>
            </div>
          ) : (
            <pre className="text-sm text-white/80 whitespace-pre-wrap font-mono leading-relaxed">{kit}</pre>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Deal Modal ────────────────────────────────────────────────────────────────

const DealModal: React.FC<{
  deal: BrandDeal;
  onUpdate: (deal: BrandDeal) => void;
  onClose: () => void;
}> = ({ deal, onUpdate, onClose }) => {
  const [counter, setCounter] = useState(deal.counterOfferCents ? deal.counterOfferCents / 100 : deal.budgetCents / 100);
  const [notes, setNotes] = useState(deal.notes ?? '');
  const [deliverable, setDeliverable] = useState('');
  const [deliverables, setDeliverables] = useState(deal.deliverables);

  const update = (patch: Partial<BrandDeal>) => onUpdate({ ...deal, ...patch, updatedAt: Date.now() });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }}
        className="bg-[#0d0d0d] border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <p className="font-black text-white text-base">{deal.brandName}</p>
            <p className="text-[9px] text-white/30 uppercase tracking-widest">{SLOT_META[deal.slotType].label} · {fmtMoney(deal.budgetCents)} budget</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[8px] font-black" style={{ color: STATUS_META[deal.status].color, background: STATUS_META[deal.status].bg }}>{STATUS_META[deal.status].label}</span>
            <button onClick={onClose}><X size={16} className="text-white/30" /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Brand brief */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Brand Brief</p>
            <p className="text-sm text-white/70 leading-relaxed bg-white/[0.04] border border-white/8 rounded-xl p-4">{deal.brief}</p>
          </div>

          {/* Contact */}
          <div className="flex flex-wrap gap-3">
            {deal.brandEmail && <a href={`mailto:${deal.brandEmail}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[9px] text-white/50 hover:text-white transition-all"><Mail size={11} /> {deal.brandEmail}</a>}
            {deal.brandWebsite && <a href={deal.brandWebsite} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[9px] text-white/50 hover:text-white transition-all"><Globe size={11} /> Website</a>}
          </div>

          {/* Counter offer */}
          {deal.status === 'PENDING' || deal.status === 'NEGOTIATING' ? (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Your Rate / Counter Offer</p>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-white/30">$</span>
                <input type="number" value={counter} onChange={e => setCounter(+e.target.value)}
                  className="w-full pl-6 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
              </div>
            </div>
          ) : null}

          {/* Deliverables */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Deliverables</p>
            <div className="space-y-1.5 mb-2">
              {deliverables.map((d, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-white/[0.03] rounded-xl">
                  <Check size={11} className="text-[#34d399] shrink-0" />
                  <p className="text-xs text-white/70 flex-1">{d}</p>
                  <button onClick={() => setDeliverables(prev => prev.filter((_, j) => j !== i))} className="text-white/15 hover:text-red-400 transition-colors"><X size={11} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={deliverable} onChange={e => setDeliverable(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && deliverable.trim()) { setDeliverables(d => [...d, deliverable.trim()]); setDeliverable(''); }}} placeholder="Add deliverable…" className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none" />
              <button onClick={() => { if (deliverable.trim()) { setDeliverables(d => [...d, deliverable.trim()]); setDeliverable(''); }}} className="px-3 py-2 bg-white/8 border border-white/12 rounded-xl text-xs text-white/50 hover:text-white"><Plus size={12} /></button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Private Notes</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none resize-none" />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {(deal.status === 'PENDING' || deal.status === 'NEGOTIATING') && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { update({ status: 'ACCEPTED', counterOfferCents: Math.round(counter * 100), deliverables, notes }); onClose(); }}
                  className="py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all">Accept Deal</button>
                <button onClick={() => { update({ status: 'NEGOTIATING', counterOfferCents: Math.round(counter * 100), deliverables, notes }); onClose(); }}
                  className="py-3 bg-white/8 border border-white/12 text-white/70 rounded-xl text-xs font-black uppercase hover:text-white transition-all">Counter Offer</button>
              </div>
            )}
            {deal.status === 'ACCEPTED' && (
              <button onClick={() => { update({ status: 'ACTIVE', deliverables, notes }); onClose(); }}
                className="py-3 bg-[#34d399] text-black rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all">Mark as Active</button>
            )}
            {deal.status === 'ACTIVE' && (
              <button onClick={() => { update({ status: 'COMPLETED', deliverables, notes }); onClose(); }}
                className="py-3 bg-[#34d399] text-black rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all">Mark as Completed</button>
            )}
            {(deal.status === 'PENDING' || deal.status === 'NEGOTIATING') && (
              <button onClick={() => { update({ status: 'DECLINED', notes }); onClose(); }}
                className="py-3 bg-white/5 border border-white/10 text-white/40 rounded-xl text-xs font-black uppercase hover:text-red-400 hover:border-red-400/30 transition-all">Decline</button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Slot Editor ───────────────────────────────────────────────────────────────

const SlotEditor: React.FC<{
  slots: SponsorshipSlot[];
  onSave: (slots: SponsorshipSlot[]) => void;
}> = ({ slots, onSave }) => {
  const [local, setLocal] = useState<SponsorshipSlot[]>(slots);

  const update = (id: string, patch: Partial<SponsorshipSlot>) => {
    setLocal(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const addSlot = (type: SponsorshipSlot['type']) => {
    const meta = SLOT_META[type];
    setLocal(prev => [...prev, {
      id: uid_short(), type, label: meta.label, description: meta.defaultDesc,
      rateCents: 50000, isAvailable: true,
    }]);
  };

  const unusedTypes = (Object.keys(SLOT_META) as SponsorshipSlot['type'][]).filter(t => !local.some(s => s.type === t));

  return (
    <div className="space-y-4">
      {local.map(slot => {
        const Meta = SLOT_META[slot.type];
        const Icon = Meta.icon as any;
        return (
          <div key={slot.id} className={`p-4 border rounded-2xl transition-all ${slot.isAvailable ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-white/[0.01] opacity-60'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-white/8 flex items-center justify-center shrink-0">
                <Icon size={14} className="text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">{Meta.label}</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <span className="text-[8px] text-white/30 uppercase font-black">Available</span>
                <input type="checkbox" checked={slot.isAvailable} onChange={e => update(slot.id, { isAvailable: e.target.checked })} className="accent-[#6B0099]" />
              </label>
              <button onClick={() => setLocal(prev => prev.filter(s => s.id !== slot.id))} className="text-white/15 hover:text-red-400 transition-colors"><X size={13} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Your Rate</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-white/30 text-xs">$</span>
                  <input type="number" value={slot.rateCents / 100} onChange={e => update(slot.id, { rateCents: Math.round(+e.target.value * 100) })}
                    className="w-full pl-5 pr-2 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">Label</label>
                <input value={slot.label} onChange={e => update(slot.id, { label: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none" />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">What's included</label>
              <textarea value={slot.description} onChange={e => update(slot.id, { description: e.target.value })} rows={2}
                className="w-full px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none resize-none" />
            </div>
          </div>
        );
      })}

      {unusedTypes.length > 0 && (
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-2">Add Slot</p>
          <div className="flex flex-wrap gap-2">
            {unusedTypes.map(t => {
              const Meta = SLOT_META[t];
              const Icon = Meta.icon as any;
              return (
                <button key={t} onClick={() => addSlot(t)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black text-white/40 hover:text-white hover:border-white/25 transition-all">
                  <Icon size={11} /> {Meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={() => onSave(local)}
        className="w-full py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all">
        Save Inventory
      </button>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

type BrandTab = 'overview' | 'inventory' | 'deals' | 'kit';

const PlajahBrandConnect: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const [tab, setTab] = useState<BrandTab>('overview');
  const [slots, setSlots] = useState<SponsorshipSlot[]>([]);
  const [deals, setDeals] = useState<BrandDeal[]>([]);
  const [openToDeals, setOpenToDeals] = useState(false);
  const [showKit, setShowKit] = useState(false);
  const [editingDeal, setEditingDeal] = useState<BrandDeal | null>(null);
  const [saving, setSaving] = useState(false);

  const sKey = `brandConnect_slots_${currentUser.uid}`;
  const dKey = `brandConnect_deals_${currentUser.uid}`;
  const oKey = `brandConnect_open_${currentUser.uid}`;

  useEffect(() => {
    try {
      const s = localStorage.getItem(sKey); if (s) setSlots(JSON.parse(s));
      const d = localStorage.getItem(dKey); if (d) setDeals(JSON.parse(d));
      const o = localStorage.getItem(oKey); if (o) setOpenToDeals(JSON.parse(o));
    } catch {}
  }, [sKey, dKey, oKey]);

  const saveSlots = (updated: SponsorshipSlot[]) => {
    setSlots(updated); localStorage.setItem(sKey, JSON.stringify(updated));
  };

  const saveDeals = (updated: BrandDeal[]) => {
    setDeals(updated); localStorage.setItem(dKey, JSON.stringify(updated));
  };

  const toggleOpen = async (val: boolean) => {
    setOpenToDeals(val);
    localStorage.setItem(oKey, JSON.stringify(val));
    try { await updateUserProfile(currentUser.uid, { presenceEnabled: val }); } catch {}
  };

  const updateDeal = (deal: BrandDeal) => {
    saveDeals(deals.map(d => d.id === deal.id ? deal : d));
    setEditingDeal(null);
  };

  const pendingDeals = deals.filter(d => d.status === 'PENDING' || d.status === 'NEGOTIATING');
  const activeDeals = deals.filter(d => d.status === 'ACTIVE' || d.status === 'ACCEPTED');
  const completedDeals = deals.filter(d => d.status === 'COMPLETED');
  const totalEarnedCents = completedDeals.reduce((s, d) => s + (d.finalPaidCents ?? d.budgetCents), 0);
  const availableSlots = slots.filter(s => s.isAvailable);

  const TABS: { key: BrandTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'overview',   label: 'Overview',  icon: BarChart3 },
    { key: 'inventory',  label: 'My Slots',  icon: Package, badge: availableSlots.length },
    { key: 'deals',      label: 'Deals',     icon: Briefcase, badge: pendingDeals.length || undefined },
    { key: 'kit',        label: 'Media Kit', icon: Star },
  ];

  return (
    <div className="min-h-0">
      {/* Sub-tabs */}
      <div className="flex gap-1 px-4 py-3 border-b border-white/8 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon as any;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${tab === t.key ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>
              <Icon size={11} />{t.label}
              {t.badge ? (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D40055] text-white text-[7px] font-black flex items-center justify-center">{t.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="p-4 space-y-5">
          {/* Hero */}
          <div className="p-6 bg-gradient-to-br from-[#0a0a1a] via-[#0d0d1f] to-[#0a0a1a] border border-[#6B0099]/30 rounded-3xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, #6B0099 0%, transparent 55%), radial-gradient(circle at 20% 80%, #D40055 0%, transparent 50%)' }} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase size={15} className="text-[#c084fc]" />
                <p className="text-[9px] font-black uppercase tracking-widest text-[#c084fc]">Plajah Brand Connect</p>
              </div>
              <h2 className="text-2xl font-black text-white mb-2 leading-tight">Your media kit is already written.<br /><span className="text-[#c084fc]">Your rates are already set.</span></h2>
              <p className="text-xs text-white/50 mb-5 max-w-md leading-relaxed">Brands discover you, review your inventory, and submit deal requests. You review, counter, accept — and get paid via Stripe. 8% platform fee. No other fees.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Open to brand deals</span>
                  <button onClick={() => toggleOpen(!openToDeals)}
                    className={`relative w-10 h-5 rounded-full border transition-all ${openToDeals ? 'bg-[#6B0099] border-[#6B0099]' : 'bg-white/10 border-white/20'}`}>
                    <motion.div animate={{ x: openToDeals ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow" />
                  </button>
                  {openToDeals && <span className="text-[8px] text-[#34d399] font-black uppercase">Discoverable by brands</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Active Deals', value: activeDeals.length, color: '#34d399' },
              { label: 'Pending Requests', value: pendingDeals.length, color: '#fbbf24' },
              { label: 'Slots Available', value: availableSlots.length, color: '#a78bfa' },
              { label: 'Total Earned', value: fmtMoney(totalEarnedCents), color: '#60a5fa' },
            ].map(s => (
              <div key={s.label} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                <p className="text-[8px] uppercase tracking-widest text-white/25 mb-1">{s.label}</p>
                <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Platform trust */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { icon: Shield, title: '8% Platform Fee', desc: 'vs. 20-30% on competitor marketplaces' },
              { icon: Brain, title: 'Muse AI Media Kit', desc: 'Auto-generated from your real Plajah analytics' },
              { icon: Zap, title: 'Stripe Payments', desc: 'Contract + deposit + final payment in one flow' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/6 rounded-2xl">
                <Icon size={15} className="text-[#c084fc] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-white">{title}</p>
                  <p className="text-[9px] text-white/35 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setTab('inventory')} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl text-left hover:border-white/20 transition-all group">
              <Package size={18} className="text-[#c084fc] mb-2" />
              <p className="text-sm font-black text-white">{slots.length === 0 ? 'Set Up Your Inventory' : 'Edit Sponsorship Slots'}</p>
              <p className="text-[9px] text-white/30 mt-0.5">{availableSlots.length} slots available</p>
            </button>
            <button onClick={() => setShowKit(true)} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl text-left hover:border-white/20 transition-all group">
              <Brain size={18} className="text-[#c084fc] mb-2" />
              <p className="text-sm font-black text-white">Generate Media Kit</p>
              <p className="text-[9px] text-white/30 mt-0.5">Muse AI writes it from your data</p>
            </button>
          </div>
        </div>
      )}

      {/* ── INVENTORY ── */}
      {tab === 'inventory' && (
        <div className="p-4">
          <div className="mb-4">
            <p className="text-sm font-black text-white mb-1">Your Sponsorship Inventory</p>
            <p className="text-[10px] text-white/30 leading-relaxed">Define what you're selling and at what rate. Brands see these slots when they browse your profile. Toggle availability without deleting slots.</p>
          </div>
          <SlotEditor slots={slots} onSave={saveSlots} />
        </div>
      )}

      {/* ── DEALS ── */}
      {tab === 'deals' && (
        <div className="p-4 space-y-5">
          {pendingDeals.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#fbbf24] mb-3 flex items-center gap-1.5">
                <AlertCircle size={11} /> Needs Your Response ({pendingDeals.length})
              </p>
              <div className="space-y-2">
                {pendingDeals.map(deal => (
                  <button key={deal.id} onClick={() => setEditingDeal(deal)}
                    className="w-full p-4 bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-2xl text-left hover:border-[#fbbf24]/40 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-black text-white text-sm">{deal.brandName}</p>
                      <span className="px-2 py-0.5 rounded-full text-[8px] font-black" style={{ color: STATUS_META[deal.status].color, background: STATUS_META[deal.status].bg }}>{STATUS_META[deal.status].label}</span>
                    </div>
                    <p className="text-[9px] text-white/40">{SLOT_META[deal.slotType].label} · Budget: {fmtMoney(deal.budgetCents)}</p>
                    <p className="text-[9px] text-white/30 mt-1 line-clamp-2">{deal.brief}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeDeals.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#34d399] mb-3 flex items-center gap-1.5">
                <CheckCircle2 size={11} /> Active Deals ({activeDeals.length})
              </p>
              <div className="space-y-2">
                {activeDeals.map(deal => (
                  <button key={deal.id} onClick={() => setEditingDeal(deal)}
                    className="w-full p-4 bg-[#34d399]/5 border border-[#34d399]/20 rounded-2xl text-left hover:border-[#34d399]/35 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-black text-white text-sm">{deal.brandName}</p>
                      <p className="text-sm font-black text-[#34d399]">{fmtMoney(deal.counterOfferCents ?? deal.budgetCents)}</p>
                    </div>
                    <p className="text-[9px] text-white/40">{SLOT_META[deal.slotType].label} · {deal.deliverables.length} deliverables</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {completedDeals.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-3">Completed ({completedDeals.length})</p>
              <div className="space-y-1.5">
                {completedDeals.map(deal => (
                  <div key={deal.id} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl opacity-70">
                    <CheckCircle2 size={13} className="text-white/30 shrink-0" />
                    <p className="flex-1 text-xs text-white/50">{deal.brandName}</p>
                    <p className="text-xs font-black text-white/40">{fmtMoney(deal.finalPaidCents ?? deal.budgetCents)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deals.length === 0 && (
            <div className="py-16 text-center">
              <Briefcase size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">No deals yet</p>
              <p className="text-[10px] text-white/20 mt-1">Turn on "Open to brand deals" and set up your inventory to start receiving requests</p>
              <button onClick={() => setTab('inventory')} className="mt-4 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase">Set Up Inventory</button>
            </div>
          )}
        </div>
      )}

      {/* ── MEDIA KIT ── */}
      {tab === 'kit' && (
        <div className="p-4 space-y-4">
          <div className="p-5 bg-gradient-to-br from-[#6B0099]/15 to-transparent border border-[#6B0099]/25 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#6B0099]/20 flex items-center justify-center shrink-0">
                <Brain size={22} className="text-[#c084fc]" />
              </div>
              <div className="flex-1">
                <p className="text-base font-black text-white mb-1">AI Media Kit Generator</p>
                <p className="text-[10px] text-white/40 leading-relaxed mb-4">Muse AI reads your Plajah analytics — follower count, content type, account bio — and writes a professional media kit you can send to any brand in seconds.</p>
                <button onClick={() => setShowKit(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all">
                  <Brain size={12} /> Generate My Media Kit
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">What's in your media kit</p>
            {['Creator introduction & positioning', 'Audience snapshot (size, type, engagement)', 'Available sponsorship formats & rates', 'Why you\'re a great brand partner', 'Contact & booking CTA'].map(item => (
              <div key={item} className="flex items-center gap-2">
                <Check size={11} className="text-[#34d399] shrink-0" />
                <p className="text-xs text-white/60">{item}</p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Your Plajah Analytics (live)</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Followers', value: currentUser.followerCount?.toLocaleString() ?? '0' },
                { label: 'Account Type', value: currentUser.accountType ?? 'Creator' },
                { label: 'Content Types', value: [currentUser.personalTracks?.length ? 'Music' : null, currentUser.videos?.length ? 'Video' : null, currentUser.articles?.length ? 'Writing' : null].filter(Boolean).join(', ') || 'Mixed' },
                { label: 'Platform', value: 'Plajah' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[8px] text-white/25 uppercase tracking-widest">{label}</p>
                  <p className="text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Deal modal */}
      <AnimatePresence>
        {editingDeal && <DealModal deal={editingDeal} onUpdate={updateDeal} onClose={() => setEditingDeal(null)} />}
      </AnimatePresence>

      {/* Media kit modal */}
      <AnimatePresence>
        {showKit && <MediaKitGenerator profile={currentUser} onClose={() => setShowKit(false)} />}
      </AnimatePresence>
    </div>
  );
};

export default PlajahBrandConnect;
