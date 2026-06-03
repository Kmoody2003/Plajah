import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Megaphone, Plus, BarChart3, DollarSign, Eye, MousePointer,
  TrendingUp, Play, Pause, Trash2, Edit, X, Check, RefreshCw,
  Brain, Zap, Globe, Monitor, Smartphone, ChevronDown, ChevronUp,
  Star, Package, CreditCard, Image as ImageIcon, Video as VideoIcon,
  Target, Users, Calendar, ExternalLink, Ticket, Music2, ShoppingBag,
  ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { UserProfile, ArtistAdCampaign as AdCampaign, ArtistAdCreative as AdCreative, ArtistAdPlatform as AdPlatform, ArtistAdObjective as AdObjective, ArtistAdStatus as AdStatus, ArtistServicesSubscription } from '../types';

interface Props {
  currentUser: UserProfile;
  onNavigate?: (view: any) => void;
}

const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const PLATFORM_META: Record<AdPlatform, { label: string; emoji: string; color: string }> = {
  PLAJAH:  { label: 'Plajah',            emoji: '🎵', color: '#6B0099' },
  GOOGLE:  { label: 'Google Ads',        emoji: '🔍', color: '#4285F4' },
  META:    { label: 'Meta (FB/IG)',       emoji: '📱', color: '#1877F2' },
  TIKTOK:  { label: 'TikTok Ads',        emoji: '🎵', color: '#010101' },
  BING:    { label: 'Bing Ads',          emoji: '🔎', color: '#00897B' },
};

const OBJECTIVE_META: Record<AdObjective, { label: string; emoji: string }> = {
  AWARENESS:    { label: 'Brand Awareness',   emoji: '👁️' },
  TRAFFIC:      { label: 'Website Traffic',   emoji: '🌐' },
  ENGAGEMENT:   { label: 'Engagement',        emoji: '❤️' },
  TICKET_SALES: { label: 'Ticket Sales',      emoji: '🎟️' },
  MERCH_SALES:  { label: 'Merch Sales',       emoji: '🛍️' },
  FOLLOWERS:    { label: 'Grow Followers',    emoji: '👥' },
  STREAMS:      { label: 'Music Streams',     emoji: '▶️' },
};

const STATUS_STYLES: Record<AdStatus, { label: string; color: string; bg: string }> = {
  DRAFT:          { label: 'Draft',           color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  PENDING_REVIEW: { label: 'In Review',       color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  ACTIVE:         { label: 'Active',          color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  PAUSED:         { label: 'Paused',          color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  COMPLETED:      { label: 'Completed',       color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  REJECTED:       { label: 'Rejected',        color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
};

type ServiceTab = 'overview' | 'campaigns' | 'create' | 'analytics';

// ── Ad Builder Wizard ─────────────────────────────────────────────────────────

const AdBuilder: React.FC<{
  currentUser: UserProfile;
  onSave: (campaign: AdCampaign) => void;
  onCancel: () => void;
  editCampaign?: AdCampaign | null;
}> = ({ currentUser, onSave, onCancel, editCampaign }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(editCampaign?.name ?? '');
  const [objective, setObjective] = useState<AdObjective>(editCampaign?.objective ?? 'AWARENESS');
  const [platforms, setPlatforms] = useState<AdPlatform[]>(editCampaign?.platforms ?? ['PLAJAH']);
  const [creative, setCreative] = useState<AdCreative>(editCampaign?.creative ?? {
    headline: '', description: '', ctaText: 'Learn More', destinationUrl: '',
  });
  const [dailyBudget, setDailyBudget] = useState(editCampaign ? editCampaign.dailyBudgetCents / 100 : 10);
  const [totalBudget, setTotalBudget] = useState(editCampaign ? editCampaign.totalBudgetCents / 100 : 100);
  const [startDate, setStartDate] = useState(editCampaign ? new Date(editCampaign.startDate).toISOString().split('T')[0] : '');
  const [endDate, setEndDate] = useState(editCampaign?.endDate ? new Date(editCampaign.endDate).toISOString().split('T')[0] : '');
  const [ageMin, setAgeMin] = useState(editCampaign?.targeting?.ageMin ?? 18);
  const [ageMax, setAgeMax] = useState(editCampaign?.targeting?.ageMax ?? 45);
  const [locations, setLocations] = useState(editCampaign?.targeting?.locations?.join(', ') ?? '');
  const [interests, setInterests] = useState(editCampaign?.targeting?.interests?.join(', ') ?? '');
  const [lookalike, setLookalike] = useState(editCampaign?.targeting?.lookalike ?? false);
  const [aiLoading, setAiLoading] = useState(false);

  const STEPS = ['Objective', 'Platforms', 'Creative', 'Targeting', 'Budget'];
  const togglePlatform = (p: AdPlatform) => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const generateAdCopy = async () => {
    setAiLoading(true);
    try {
      const prompt = `Write a short ad for ${currentUser.displayName} with objective "${OBJECTIVE_META[objective].label}".
Headline (max 7 words), description (max 25 words), CTA button text (max 3 words). Return as JSON: {headline, description, ctaText}`;
      const res = await fetch('/api/muse/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'You are a professional ad copywriter.', question: prompt, history: [] }),
      });
      const data = await res.json();
      try {
        const parsed = JSON.parse(data.answer);
        setCreative(c => ({ ...c, ...parsed }));
      } catch {
        const lines = (data.answer ?? '').split('\n').filter(Boolean);
        if (lines[0]) setCreative(c => ({ ...c, headline: lines[0].replace(/headline[:\-\s]*/i, '').trim() }));
      }
    } catch {} finally { setAiLoading(false); }
  };

  const handleSave = () => {
    const campaign: AdCampaign = {
      id: editCampaign?.id ?? uid_short(),
      creatorUid: currentUser.uid,
      name: name || `${OBJECTIVE_META[objective].emoji} ${currentUser.displayName} — ${objective}`,
      objective,
      platforms,
      status: 'DRAFT',
      creative,
      dailyBudgetCents: Math.round(dailyBudget * 100),
      totalBudgetCents: Math.round(totalBudget * 100),
      spentCents: editCampaign?.spentCents ?? 0,
      startDate: startDate ? new Date(startDate).getTime() : Date.now(),
      endDate: endDate ? new Date(endDate).getTime() : undefined,
      targeting: { ageMin, ageMax, locations: locations.split(',').map(l => l.trim()).filter(Boolean), interests: interests.split(',').map(i => i.trim()).filter(Boolean), lookalike },
      analytics: editCampaign?.analytics ?? { impressions: 0, clicks: 0, ctr: 0, conversions: 0, cpc: 0, spend: 0 },
      externalCampaignIds: editCampaign?.externalCampaignIds,
      createdAt: editCampaign?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    onSave(campaign);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#0d0d0d] border border-white/10 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="text-base font-black text-white">{editCampaign ? 'Edit Campaign' : 'Create Ad Campaign'}</h2>
            <p className="text-[9px] text-white/30 uppercase tracking-widest mt-0.5">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
          </div>
          <button onClick={onCancel}><X size={16} className="text-white/30 hover:text-white" /></button>
        </div>

        {/* Step progress */}
        <div className="flex gap-1 px-6 py-3">
          {STEPS.map((s, i) => (
            <div key={s} onClick={() => i < step && setStep(i)} className={`h-1 flex-1 rounded-full transition-all ${i < step ? 'bg-[#6B0099] cursor-pointer' : i === step ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055]' : 'bg-white/10'}`} />
          ))}
        </div>

        <div className="px-6 pb-6 space-y-4">

          {/* Step 0: Objective */}
          {step === 0 && (
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Campaign Name (optional)</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Tour Announcement" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none mb-4" />
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Campaign Objective</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(OBJECTIVE_META) as AdObjective[]).map(obj => {
                  const m = OBJECTIVE_META[obj];
                  return (
                    <button key={obj} onClick={() => setObjective(obj)} className={`p-3 rounded-xl border text-left transition-all ${objective === obj ? 'border-[#6B0099]/60 bg-[#6B0099]/15' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                      <span className="text-lg">{m.emoji}</span>
                      <p className="text-[10px] font-black text-white mt-1">{m.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 1: Platforms */}
          {step === 1 && (
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Select Ad Platforms</label>
              <p className="text-[10px] text-white/40 mb-4">Plajah manages the technical setup for each platform. You just write the ad and set the budget.</p>
              <div className="space-y-2">
                {(Object.keys(PLATFORM_META) as AdPlatform[]).map(p => {
                  const m = PLATFORM_META[p];
                  const active = platforms.includes(p);
                  return (
                    <button key={p} onClick={() => togglePlatform(p)} className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${active ? 'border-[#6B0099]/50 bg-[#6B0099]/10' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                      <span className="text-2xl">{m.emoji}</span>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-black text-white">{m.label}</p>
                        {p !== 'PLAJAH' && <p className="text-[9px] text-white/30">Off-platform — Plajah manages the account</p>}
                        {p === 'PLAJAH' && <p className="text-[9px] text-[#34d399]">Included in all plans</p>}
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${active ? 'bg-[#6B0099] border-[#6B0099]' : 'border-white/20'}`}>
                        {active && <Check size={11} className="text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Creative */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Ad Creative</label>
                <button onClick={generateAdCopy} disabled={aiLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6B0099]/15 border border-[#6B0099]/30 rounded-xl text-[10px] font-black text-[#c084fc] hover:brightness-125 transition-all">
                  {aiLoading ? <RefreshCw size={10} className="animate-spin" /> : <Brain size={10} />} Muse: Write My Ad
                </button>
              </div>
              {[
                { key: 'headline', label: 'Headline', placeholder: 'e.g. New Album Out Now — Stream Free on Plajah', max: 90 },
                { key: 'description', label: 'Description', placeholder: 'Tell people what this is about. Keep it punchy.', max: 200 },
                { key: 'ctaText', label: 'Call-to-Action Button', placeholder: 'Listen Now / Get Tickets / Shop Now', max: 30 },
                { key: 'destinationUrl', label: 'Destination URL', placeholder: 'https://plajah.com/yourprofile', max: 500 },
              ].map(({ key, label, placeholder, max }) => (
                <div key={key}>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{label}</label>
                  <input
                    value={(creative as any)[key] ?? ''}
                    onChange={e => setCreative(c => ({ ...c, [key]: e.target.value }))}
                    placeholder={placeholder}
                    maxLength={max}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none"
                  />
                </div>
              ))}
              {/* Ad Preview */}
              {creative.headline && (
                <div className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">Preview</p>
                  <div className="bg-white/[0.04] rounded-xl p-3">
                    <p className="text-sm font-black text-white">{creative.headline}</p>
                    {creative.description && <p className="text-[10px] text-white/50 mt-1">{creative.description}</p>}
                    {creative.ctaText && (
                      <span className="inline-block mt-2 px-3 py-1 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-[10px] font-black rounded-full">{creative.ctaText}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Targeting */}
          {step === 3 && (
            <div className="space-y-4">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30">Audience Targeting</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Min Age</label>
                  <input type="number" value={ageMin} onChange={e => setAgeMin(+e.target.value)} min={13} max={65} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Max Age</label>
                  <input type="number" value={ageMax} onChange={e => setAgeMax(+e.target.value)} min={13} max={65} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Locations (comma-separated)</label>
                <input value={locations} onChange={e => setLocations(e.target.value)} placeholder="e.g. New York, Los Angeles, Chicago" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Interests (comma-separated)</label>
                <input value={interests} onChange={e => setInterests(e.target.value)} placeholder="e.g. Hip-Hop, R&B, Concerts, Music Festivals" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-white/[0.03] border border-white/8 rounded-xl">
                <input type="checkbox" checked={lookalike} onChange={e => setLookalike(e.target.checked)} className="accent-[#6B0099] w-4 h-4" />
                <div>
                  <p className="text-sm font-black text-white">Lookalike Audience</p>
                  <p className="text-[9px] text-white/30">Target people similar to your existing fans</p>
                </div>
              </label>
            </div>
          )}

          {/* Step 4: Budget */}
          {step === 4 && (
            <div className="space-y-4">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30">Budget & Schedule</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Daily Budget ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-white/30 text-sm">$</span>
                    <input type="number" value={dailyBudget} onChange={e => setDailyBudget(+e.target.value)} min={1} className="w-full pl-6 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Total Budget ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-white/30 text-sm">$</span>
                    <input type="number" value={totalBudget} onChange={e => setTotalBudget(+e.target.value)} min={1} className="w-full pl-6 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
                </div>
              </div>
              {/* Summary */}
              <div className="p-4 bg-[#6B0099]/8 border border-[#6B0099]/20 rounded-2xl space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#c084fc] mb-2">Campaign Summary</p>
                <div className="flex justify-between text-[10px]"><span className="text-white/40">Objective</span><span className="text-white font-black">{OBJECTIVE_META[objective].emoji} {OBJECTIVE_META[objective].label}</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-white/40">Platforms</span><span className="text-white font-black">{platforms.map(p => PLATFORM_META[p].label).join(', ')}</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-white/40">Daily Budget</span><span className="text-white font-black">${dailyBudget}</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-white/40">Total Budget</span><span className="text-white font-black">${totalBudget}</span></div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="flex-1 py-3 bg-white/5 border border-white/10 text-white/60 rounded-xl text-xs font-black uppercase hover:text-white transition-all">Back</button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} className="flex-1 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all">Next: {STEPS[step + 1]}</button>
            ) : (
              <button onClick={handleSave} className="flex-1 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all flex items-center justify-center gap-2">
                <Megaphone size={13} /> {editCampaign ? 'Update Campaign' : 'Launch Campaign'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Analytics Panel ───────────────────────────────────────────────────────────

const AnalyticsPanel: React.FC<{ campaigns: AdCampaign[] }> = ({ campaigns }) => {
  const totalImpressions = campaigns.reduce((s, c) => s + c.analytics.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.analytics.clicks, 0);
  const totalSpend = campaigns.reduce((s, c) => s + c.analytics.spend, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.analytics.conversions, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');

  return (
    <div className="p-4 space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Total Impressions', value: totalImpressions.toLocaleString(), icon: Eye, color: '#a78bfa' },
          { label: 'Total Clicks', value: totalClicks.toLocaleString(), icon: MousePointer, color: '#60a5fa' },
          { label: 'Avg. CTR', value: `${avgCtr.toFixed(2)}%`, icon: TrendingUp, color: '#34d399' },
          { label: 'Total Spend', value: `$${totalSpend.toFixed(2)}`, icon: DollarSign, color: '#fbbf24' },
          { label: 'Conversions', value: totalConversions.toLocaleString(), icon: Target, color: '#f472b6' },
          { label: 'Avg. CPC', value: `$${avgCpc.toFixed(2)}`, icon: ArrowUpRight, color: '#fb923c' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={13} style={{ color }} />
              <p className="text-[9px] uppercase tracking-widest text-white/30">{label}</p>
            </div>
            <p className="text-xl font-black" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Platform breakdown */}
      {activeCampaigns.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Active Campaign Breakdown</p>
          <div className="space-y-2">
            {activeCampaigns.map(c => {
              const ctr = c.analytics.impressions > 0 ? (c.analytics.clicks / c.analytics.impressions * 100).toFixed(2) : '0.00';
              return (
                <div key={c.id} className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-black text-white">{c.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {c.platforms.map(p => <span key={p} className="text-[9px] font-black" style={{ color: PLATFORM_META[p].color }}>{PLATFORM_META[p].label}</span>)}
                      </div>
                    </div>
                    <div className="px-2 py-1 rounded-full text-[9px] font-black" style={{ color: STATUS_STYLES[c.status].color, background: STATUS_STYLES[c.status].bg }}>{STATUS_STYLES[c.status].label}</div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { l: 'Impressions', v: c.analytics.impressions.toLocaleString() },
                      { l: 'Clicks', v: c.analytics.clicks.toLocaleString() },
                      { l: 'CTR', v: `${ctr}%` },
                      { l: 'Spend', v: `$${c.analytics.spend.toFixed(2)}` },
                    ].map(({ l, v }) => (
                      <div key={l} className="text-center">
                        <p className="text-[8px] text-white/25 uppercase">{l}</p>
                        <p className="text-xs font-black text-white">{v}</p>
                      </div>
                    ))}
                  </div>
                  {/* Spend progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[8px] text-white/30 mb-1">
                      <span>Spend</span><span>${c.analytics.spend.toFixed(0)} / ${(c.totalBudgetCents / 100).toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#6B0099] to-[#D40055]" style={{ width: `${Math.min(100, (c.spentCents / c.totalBudgetCents) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div className="py-16 text-center">
          <BarChart3 size={32} className="text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">No campaign data yet.</p>
          <p className="text-[10px] text-white/20 mt-1">Launch your first ad campaign to see analytics here.</p>
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const ArtistServicesTab: React.FC<Props> = ({ currentUser, onNavigate }) => {
  const [serviceTab, setServiceTab] = useState<ServiceTab>('overview');
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [subscription, setSubscription] = useState<ArtistServicesSubscription | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editCampaign, setEditCampaign] = useState<AdCampaign | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const storageKey = `artistServices_${currentUser.uid}`;
  const subKey = `artistServicesSub_${currentUser.uid}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setCampaigns(JSON.parse(saved));
      const sub = localStorage.getItem(subKey);
      if (sub) setSubscription(JSON.parse(sub));
    } catch {}
  }, [storageKey, subKey]);

  const saveCampaigns = (updated: AdCampaign[]) => {
    setCampaigns(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const handleSaveCampaign = (campaign: AdCampaign) => {
    const exists = campaigns.find(c => c.id === campaign.id);
    saveCampaigns(exists ? campaigns.map(c => c.id === campaign.id ? campaign : c) : [...campaigns, campaign]);
    setShowBuilder(false);
    setEditCampaign(null);
    setServiceTab('campaigns');
  };

  const handleToggleCampaign = (id: string) => {
    saveCampaigns(campaigns.map(c => c.id === id ? { ...c, status: c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', updatedAt: Date.now() } : c));
  };

  const handleDeleteCampaign = (id: string) => {
    saveCampaigns(campaigns.filter(c => c.id !== id));
  };

  const handleSubscribe = async (plan: 'PER_EVENT' | 'MONTHLY') => {
    setCheckoutLoading(plan);
    try {
      const res = await fetch('/api/stripe/artist-services-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.uid, plan }),
      });
      const data = await res.json();
      if (data.checkoutUrl) window.open(data.checkoutUrl, '_blank');
    } catch {} finally { setCheckoutLoading(null); }
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
  const isSubscribed = subscription?.status === 'ACTIVE' || subscription?.status === 'TRIAL';

  const SERVICE_TABS: { key: ServiceTab; label: string; icon: React.ElementType }[] = [
    { key: 'overview',   label: 'Overview',   icon: Star },
    { key: 'campaigns',  label: 'Campaigns',  icon: Megaphone },
    { key: 'analytics',  label: 'Analytics',  icon: BarChart3 },
    { key: 'create',     label: 'Create Ad',  icon: Plus },
  ];

  return (
    <div className="min-h-0">
      {/* Sub-tabs */}
      <div className="flex gap-1 px-4 py-3 border-b border-white/8 overflow-x-auto">
        {SERVICE_TABS.map(t => {
          const Icon = t.icon as any;
          return (
            <button key={t.key} onClick={() => t.key === 'create' ? setShowBuilder(true) : setServiceTab(t.key)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${serviceTab === t.key && t.key !== 'create' ? 'bg-white text-black' : t.key === 'create' ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white' : 'text-white/30 hover:text-white'}`}>
              <Icon size={11} />{t.label}
            </button>
          );
        })}
      </div>

      {/* Overview */}
      {serviceTab === 'overview' && (
        <div className="p-4 space-y-5">
          {/* Hero */}
          <div className="p-6 bg-gradient-to-br from-[#6B0099]/25 via-[#4B0066]/15 to-[#D40055]/15 border border-[#6B0099]/30 rounded-3xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #6B0099 0%, transparent 60%)' }} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={16} className="text-[#c084fc]" />
                <p className="text-[10px] font-black uppercase tracking-widest text-[#c084fc]">Artist Services</p>
              </div>
              <h2 className="text-2xl font-black text-white mb-2 leading-tight">Grow your audience.<br /><span className="text-[#c084fc]">We handle the tech.</span></h2>
              <p className="text-xs text-white/50 mb-5 max-w-md">Run ads on Plajah, Google, Meta, TikTok, and Bing from one dashboard. Build ads in minutes with Muse AI. The platform manages the accounts — you manage the creative and budget.</p>
              <div className="flex flex-wrap gap-2">
                {['Plajah Boost', 'Google Ads', 'Meta Ads', 'TikTok Ads', 'Bing Ads', 'Muse AI Copywriting', 'Event Promotion', 'Analytics Dashboard'].map(f => (
                  <span key={f} className="px-2.5 py-1 bg-[#6B0099]/20 border border-[#6B0099]/30 rounded-full text-[9px] font-black text-[#c084fc]">{f}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          {campaigns.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Campaigns', value: campaigns.length, color: '#a78bfa' },
                { label: 'Active', value: activeCampaigns, color: '#34d399' },
                { label: 'Total Reach', value: campaigns.reduce((s, c) => s + c.analytics.impressions, 0).toLocaleString(), color: '#60a5fa' },
              ].map(s => (
                <div key={s.label} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl text-center">
                  <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[9px] uppercase tracking-widest text-white/30 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Pricing */}
          {!isSubscribed && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Choose Your Plan</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Per Event</p>
                  <p className="text-3xl font-black text-white mb-1">$29.99</p>
                  <p className="text-xs text-white/40 mb-4">One event · all platforms</p>
                  <ul className="space-y-1.5 mb-5">
                    {['Full ad dashboard access', 'All 5 ad platforms', 'Muse AI copywriting', 'Event-specific campaigns', 'Analytics for 30 days'].map(f => (
                      <li key={f} className="flex items-center gap-2 text-[10px] text-white/60"><Check size={11} className="text-[#34d399]" />{f}</li>
                    ))}
                  </ul>
                  <button onClick={() => handleSubscribe('PER_EVENT')} disabled={checkoutLoading === 'PER_EVENT'} className="w-full py-3 bg-white/10 border border-white/15 text-white rounded-xl text-xs font-black uppercase hover:bg-white/15 transition-all flex items-center justify-center gap-2">
                    {checkoutLoading === 'PER_EVENT' ? <RefreshCw size={12} className="animate-spin" /> : <CreditCard size={12} />} Buy Now
                  </button>
                </div>
                <div className="p-5 bg-[#6B0099]/12 border border-[#6B0099]/40 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-[9px] font-black uppercase rounded-bl-xl">Best Value</div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#c084fc] mb-2">Monthly Add-On</p>
                  <p className="text-3xl font-black text-white mb-1">$4.99<span className="text-base">/mo</span></p>
                  <p className="text-xs text-white/40 mb-4">Unlimited events · ongoing management</p>
                  <ul className="space-y-1.5 mb-5">
                    {['Everything in Per Event', 'Unlimited event campaigns', 'Ongoing ad management', 'Monthly analytics reports', 'Ad budget roll-over', 'Priority Muse AI access'].map(f => (
                      <li key={f} className="flex items-center gap-2 text-[10px] text-white/60"><Check size={11} className="text-[#34d399]" />{f}</li>
                    ))}
                  </ul>
                  <button onClick={() => handleSubscribe('MONTHLY')} disabled={checkoutLoading === 'MONTHLY'} className="w-full py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase hover:brightness-110 transition-all flex items-center justify-center gap-2">
                    {checkoutLoading === 'MONTHLY' ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />} Subscribe
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-[#34d399] text-center mt-3 font-black">✓ Your first event's ad campaign is free</p>
            </div>
          )}

          {isSubscribed && (
            <div className="p-4 bg-[#34d399]/8 border border-[#34d399]/25 rounded-2xl flex items-center gap-3">
              <CheckCircle2 size={18} className="text-[#34d399] shrink-0" />
              <div>
                <p className="text-sm font-black text-white">Artist Services Active</p>
                <p className="text-[10px] text-white/40">{subscription?.plan === 'MONTHLY' ? 'Monthly Plan · $4.99/mo' : 'Per Event Plan'}{subscription?.currentPeriodEnd ? ` · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ''}</p>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setShowBuilder(true)} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl text-left hover:border-white/20 transition-all">
              <Megaphone size={18} className="text-[#c084fc] mb-2" />
              <p className="text-sm font-black text-white">Create Campaign</p>
              <p className="text-[9px] text-white/30 mt-0.5">Build an ad with Muse AI</p>
            </button>
            <button onClick={() => setServiceTab('analytics')} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl text-left hover:border-white/20 transition-all">
              <BarChart3 size={18} className="text-[#60a5fa] mb-2" />
              <p className="text-sm font-black text-white">View Analytics</p>
              <p className="text-[9px] text-white/30 mt-0.5">Impressions, clicks, CTR</p>
            </button>
          </div>
        </div>
      )}

      {/* Campaigns */}
      {serviceTab === 'campaigns' && (
        <div className="p-4 space-y-3">
          {campaigns.length === 0 && (
            <div className="py-16 text-center">
              <Megaphone size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">No campaigns yet.</p>
              <button onClick={() => setShowBuilder(true)} className="mt-4 px-5 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase">Create Your First Campaign</button>
            </div>
          )}
          {campaigns.map(c => {
            const ctr = c.analytics.impressions > 0 ? (c.analytics.clicks / c.analytics.impressions * 100).toFixed(2) : '0.00';
            const st = STATUS_STYLES[c.status];
            return (
              <div key={c.id} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-black text-white text-sm truncate">{c.name}</p>
                      <span className="px-2 py-0.5 rounded-full text-[8px] font-black" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] text-white/30">{OBJECTIVE_META[c.objective].emoji} {OBJECTIVE_META[c.objective].label}</span>
                      {c.platforms.map(p => <span key={p} className="text-[8px] font-black" style={{ color: PLATFORM_META[p].color }}>{PLATFORM_META[p].label}</span>)}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => handleToggleCampaign(c.id)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                      {c.status === 'ACTIVE' ? <Pause size={12} className="text-white/50" /> : <Play size={12} className="text-white/50" />}
                    </button>
                    <button onClick={() => { setEditCampaign(c); setShowBuilder(true); }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all"><Edit size={12} className="text-white/50" /></button>
                    <button onClick={() => handleDeleteCampaign(c.id)} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 transition-all"><Trash2 size={12} className="text-white/50 hover:text-red-400" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { l: 'Impressions', v: c.analytics.impressions.toLocaleString() },
                    { l: 'Clicks', v: c.analytics.clicks.toLocaleString() },
                    { l: 'CTR', v: `${ctr}%` },
                    { l: 'Spent', v: `$${c.analytics.spend.toFixed(2)}` },
                  ].map(({ l, v }) => (
                    <div key={l} className="p-2 bg-white/[0.03] rounded-xl">
                      <p className="text-[8px] text-white/25 uppercase">{l}</p>
                      <p className="text-xs font-black text-white">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#6B0099] to-[#D40055]" style={{ width: `${Math.min(100, (c.spentCents / Math.max(c.totalBudgetCents, 1)) * 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[8px] text-white/20 mt-1">
                    <span>Budget used</span>
                    <span>{fmtMoney(c.spentCents)} / {fmtMoney(c.totalBudgetCents)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {campaigns.length > 0 && (
            <button onClick={() => setShowBuilder(true)} className="w-full py-3 border border-dashed border-white/15 rounded-xl text-[10px] font-black uppercase text-white/30 hover:border-white/30 hover:text-white/60 transition-all flex items-center justify-center gap-2">
              <Plus size={12} /> New Campaign
            </button>
          )}
        </div>
      )}

      {/* Analytics */}
      {serviceTab === 'analytics' && <AnalyticsPanel campaigns={campaigns} />}

      {/* Ad Builder Modal */}
      <AnimatePresence>
        {showBuilder && (
          <AdBuilder
            currentUser={currentUser}
            onSave={handleSaveCampaign}
            onCancel={() => { setShowBuilder(false); setEditCampaign(null); }}
            editCampaign={editCampaign}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default ArtistServicesTab;
