import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign, TrendingUp, ArrowUpRight, Zap, Music2, BookOpen,
  Film, Users, ShoppingBag, Heart, Gift, Ticket, CreditCard,
  ExternalLink, ChevronRight, AlertCircle, CheckCircle2,
  Clock, RefreshCw, Search, X, Plus, Trash2, Percent, Info,
  BarChart3, Layers, Split, Wallet,
} from 'lucide-react';
import {
  startCreatorConnectOnboarding, fetchConnectStatus, openStripeDashboard,
  fetchCreatorEarnings, fetchCreatorSplitConfig, saveCreatorSplitConfig,
  searchUsers,
} from '../services/backendService';
import { UserProfile, EarningCategory } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  currentUser: UserProfile;
}

type Tab = 'overview' | 'categories' | 'transactions' | 'splits';
type Period = '7d' | '30d' | '90d' | '1y';

interface ConnectStatus {
  connected: boolean; accountId?: string; onboarded?: boolean;
  chargesEnabled?: boolean; payoutsEnabled?: boolean; requiresAction?: boolean;
}

interface SplitRecipient {
  creatorUid: string; displayName: string; photoURL?: string; percentage: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { key: EarningCategory; label: string; icon: React.ComponentType<any>; color: string; desc: string }[] = [
  { key: 'tip',          label: 'Tips & Gifts',          icon: Gift,       color: '#f472b6', desc: 'Live stream tips and direct gifts' },
  { key: 'digital_sale', label: 'Digital Sales',         icon: Music2,     color: '#a78bfa', desc: 'Music, books, movies sold individually' },
  { key: 'sanctuary',    label: 'Sanctuary',             icon: Heart,      color: '#f87171', desc: 'Sanctuary memberships & exclusive access' },
  { key: 'plajahplus',   label: 'Plajah+ (Bound)',       icon: Zap,        color: '#fbbf24', desc: 'Plajah+ subscribers bound to your profile' },
  { key: 'store_order',  label: 'Store Orders',          icon: ShoppingBag,color: '#34d399', desc: 'Merch and physical store sales' },
  { key: 'club',         label: 'Club Memberships',      icon: Users,      color: '#60a5fa', desc: 'Fan club membership fees' },
  { key: 'seedraiser',   label: 'SeedRaiser',            icon: Ticket,     color: '#fb923c', desc: 'Crowdfunding pledge contributions' },
  { key: 'sync_license', label: 'Sync Licensing',        icon: Music2,     color: '#22d3ee', desc: 'Your music licensed for films & videos' },
];

const APPLY_OPTIONS: { key: EarningCategory; label: string }[] = [
  { key: 'tip',          label: 'Tips & Gifts' },
  { key: 'digital_sale', label: 'Digital Sales' },
  { key: 'sanctuary',    label: 'Sanctuary' },
  { key: 'plajahplus',   label: 'Plajah+' },
  { key: 'store_order',  label: 'Store' },
  { key: 'club',         label: 'Clubs' },
  { key: 'seedraiser',   label: 'SeedRaiser' },
];

const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last year',
};

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

// ── Sub-components ────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string; sub?: string; color?: string; icon: React.ComponentType<any> }> = ({ label, value, sub, color = '#a78bfa', icon: Icon }) => (
  <div className="p-5 bg-white/[0.04] border border-white/8 rounded-2xl">
    <div className="flex items-start justify-between mb-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{label}</p>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
        <Icon size={14} style={{ color }} />
      </div>
    </div>
    <p className="text-2xl font-black text-white">{value}</p>
    {sub && <p className="text-[10px] text-white/30 mt-1">{sub}</p>}
  </div>
);

const CategoryBar: React.FC<{ label: string; grossCents: number; netCents: number; count: number; color: string; icon: React.ComponentType<any>; maxCents: number }> = ({ label, netCents, count, color, icon: Icon, maxCents }) => {
  const pct = maxCents > 0 ? (netCents / maxCents) * 100 : 0;
  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}25` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-black text-white">{label}</p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/30">{count} txn{count !== 1 ? 's' : ''}</span>
            <span className="text-xs font-black text-white">{fmt(netCents)}</span>
          </div>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full" style={{ background: color }} />
        </div>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending:     { label: 'Pending',     color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
    transferred: { label: 'Transferred', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
    paid_out:    { label: 'Paid Out',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
};

// ── Onboarding Panel ──────────────────────────────────────────────────────────

const OnboardingPanel: React.FC<{ status: ConnectStatus; onRefresh: () => void }> = ({ status, onRefresh }) => {
  const [loading, setLoading] = useState(false);

  const handleOnboard = async () => {
    setLoading(true);
    try {
      const { url } = await startCreatorConnectOnboarding();
      if (!url) throw new Error('Stripe did not return an onboarding link. Check that Connect is enabled and your API key has Connect permissions.');
      // Redirect in the same tab — window.open() after an await is silently
      // popup-blocked. Stripe brings the user back via the return_url.
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message || 'Could not start Stripe onboarding.');
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto py-16 px-4 text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-[2rem] bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] flex items-center justify-center shadow-[0_0_40px_rgba(107,0,153,0.3)]">
        <Wallet size={36} className="text-white" />
      </div>

      <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-3">
        {status.connected && status.requiresAction ? 'Complete Your Setup' : 'Connect to Get Paid'}
      </h2>
      <p className="text-sm text-white/40 leading-relaxed mb-8 max-w-sm mx-auto">
        {status.connected && status.requiresAction
          ? 'Your Stripe account was created but needs a few more details before you can receive payouts.'
          : 'Set up your Stripe Express account to receive tips, sales revenue, memberships, and splits directly to your bank account.'}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-8 text-left">
        {[
          { icon: DollarSign, label: 'Direct Bank Payouts', desc: 'Revenue lands in your account on Stripe\'s schedule' },
          { icon: Split,      label: 'Revenue Splits',      desc: 'Auto-split earnings with collaborators instantly' },
          { icon: BarChart3,  label: 'Full Dashboard',      desc: 'Every payment categorised by type and period' },
          { icon: CreditCard, label: 'All Payment Types',   desc: 'Tips, sales, memberships, subscriptions, store' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="p-4 bg-white/[0.03] border border-white/8 rounded-xl">
            <Icon size={16} className="text-[#FF8C00] mb-2" />
            <p className="text-xs font-black text-white mb-1">{label}</p>
            <p className="text-[10px] text-white/30 leading-tight">{desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={handleOnboard}
        disabled={loading}
        className="w-full py-4 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUpRight size={16} />}
        {loading ? 'Opening Stripe…' : status.connected && status.requiresAction ? 'Complete Stripe Setup' : 'Connect with Stripe'}
      </button>

      <p className="text-[9px] text-white/20 mt-4 uppercase tracking-widest">Powered by Stripe Express · Plajah takes 10% platform fee</p>
    </motion.div>
  );
};

// ── Split Config Tab ──────────────────────────────────────────────────────────

const SplitsTab: React.FC<{ currentUserUid: string }> = ({ currentUserUid }) => {
  const [recipients, setRecipients] = useState<SplitRecipient[]>([]);
  const [appliesTo, setAppliesTo]   = useState<EarningCategory[]>(['tip','digital_sale','sanctuary','plajahplus']);
  const [searchQ, setSearchQ]       = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetchCreatorSplitConfig().then(cfg => {
      if (cfg.recipients) setRecipients(cfg.recipients);
      if (cfg.appliesTo)  setAppliesTo(cfg.appliesTo);
      setLoading(false);
    });
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(q);
      setSearchResults(results.filter(u => u.uid !== currentUserUid && !recipients.some(r => r.creatorUid === u.uid)).slice(0, 6));
    } finally { setSearching(false); }
  }, [currentUserUid, recipients]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(searchQ), 350);
    return () => clearTimeout(t);
  }, [searchQ, doSearch]);

  const addRecipient = (user: UserProfile) => {
    const remaining = 100 - recipients.reduce((s, r) => s + r.percentage, 0);
    if (remaining <= 0) return;
    setRecipients(prev => [...prev, {
      creatorUid: user.uid, displayName: user.displayName, photoURL: user.photoURL, percentage: Math.min(10, remaining),
    }]);
    setSearchQ('');
    setSearchResults([]);
  };

  const updatePct = (uid: string, pct: number) => {
    setRecipients(prev => prev.map(r => r.creatorUid === uid ? { ...r, percentage: Math.max(1, Math.min(99, pct)) } : r));
  };

  const remove = (uid: string) => setRecipients(prev => prev.filter(r => r.creatorUid !== uid));

  const toggleAppliesTo = (cat: EarningCategory) => {
    setAppliesTo(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const totalPct = recipients.reduce((s, r) => s + r.percentage, 0);
  const yourPct  = 100 - totalPct;

  const handleSave = async () => {
    if (totalPct >= 100) return;
    setSaving(true);
    try {
      await saveCreatorSplitConfig(recipients, appliesTo);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      alert(e.message);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-48 text-white/30 text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="p-4 bg-[#fbbf24]/8 border border-[#fbbf24]/20 rounded-2xl flex gap-3">
        <Info size={16} className="text-[#fbbf24] shrink-0 mt-0.5" />
        <p className="text-xs text-[#fbbf24]/80 leading-relaxed">
          Splits apply after Plajah's 10% platform fee. If you set 20% to a collaborator, they receive 20% of your net — not 20% of the gross charge. Transfers fire automatically when a payment clears.
        </p>
      </div>

      {/* Your cut display */}
      <div className="p-5 bg-white/[0.04] border border-white/8 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Your Share (of net)</p>
          <span className="text-2xl font-black" style={{ color: yourPct < 50 ? '#f87171' : '#34d399' }}>{yourPct.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-[#6B0099] to-[#D40055]" style={{ width: `${yourPct}%` }} />
        </div>
        {totalPct > 0 && (
          <div className="mt-2 flex gap-1 flex-wrap">
            {recipients.map(r => (
              <span key={r.creatorUid} className="text-[9px] px-2 py-0.5 bg-white/5 rounded-full text-white/40">
                {r.displayName} {r.percentage}%
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add creator search */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Add Split Recipient</p>
        <div className="relative">
          <Search size={13} className="absolute left-3.5 top-3.5 text-white/25" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search creators by name…"
            className="w-full pl-9 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-all"
          />
          {searching && <RefreshCw size={13} className="absolute right-3.5 top-3.5 text-white/25 animate-spin" />}
        </div>

        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-1 bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
              {searchResults.map(u => (
                <button key={u.uid} onClick={() => addRecipient(u)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0">
                  {u.photoURL
                    ? <img src={u.photoURL} className="w-8 h-8 rounded-full object-cover" alt="" />
                    : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-xs font-black">{u.displayName[0]}</div>}
                  <div>
                    <p className="text-xs font-black text-white">{u.displayName}</p>
                    {u.email && <p className="text-[9px] text-white/30">{u.email}</p>}
                  </div>
                  <Plus size={14} className="ml-auto text-white/30" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recipients list */}
      {recipients.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Recipients</p>
          <div className="space-y-2">
            {recipients.map(r => (
              <div key={r.creatorUid} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/8 rounded-xl">
                {r.photoURL
                  ? <img src={r.photoURL} className="w-9 h-9 rounded-full object-cover" alt="" />
                  : <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-sm font-black">{r.displayName[0]}</div>}
                <p className="flex-1 text-sm font-black text-white truncate">{r.displayName}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={Math.min(99, 99 - (totalPct - r.percentage))}
                    value={r.percentage}
                    onChange={e => updatePct(r.creatorUid, parseInt(e.target.value) || 1)}
                    className="w-16 text-center py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/25"
                  />
                  <Percent size={12} className="text-white/30" />
                </div>
                <button onClick={() => remove(r.creatorUid)} className="p-1.5 text-white/20 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applies to */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Apply Splits To</p>
        <div className="flex flex-wrap gap-2">
          {APPLY_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => toggleAppliesTo(opt.key)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                appliesTo.includes(opt.key) ? 'bg-[#6B0099]/20 border-[#6B0099]/40 text-[#c084fc]' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'
              }`}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        {totalPct >= 100 && (
          <p className="flex-1 text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle size={12} /> Total split cannot reach 100% — you must retain at least 1%
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || totalPct >= 100}
          className="ml-auto flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40"
        >
          {saving ? <RefreshCw size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : null}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Split Config'}
        </button>
      </div>
    </div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────

const CreatorPaymentDashboard: React.FC<Props> = ({ currentUser }) => {
  const [tab, setTab]               = useState<Tab>('overview');
  const [period, setPeriod]         = useState<Period>('30d');
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>({ connected: false });
  const [earnings, setEarnings]     = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try { setConnectStatus(await fetchConnectStatus()); } catch {}
    setLoadingStatus(false);
  }, []);

  const loadEarnings = useCallback(async () => {
    setLoadingEarnings(true);
    try { setEarnings(await fetchCreatorEarnings(period)); } catch {}
    setLoadingEarnings(false);
  }, [period]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => {
    if (connectStatus.onboarded) loadEarnings();
  }, [connectStatus.onboarded, loadEarnings]);

  const isFullyOnboarded = connectStatus.connected && connectStatus.onboarded;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loadingStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="text-white/20 animate-spin" />
      </div>
    );
  }

  // ── Not connected or incomplete onboarding ───────────────────────────────────
  if (!isFullyOnboarded) {
    return <OnboardingPanel status={connectStatus} onRefresh={loadStatus} />;
  }

  // ── Full Dashboard ───────────────────────────────────────────────────────────
  const byCategory = earnings?.byCategory ?? {};
  const maxCatNet  = Math.max(...CATEGORIES.map(c => byCategory[c.key]?.netCents ?? 0), 1);

  const TABS: { key: Tab; label: string; icon: React.ComponentType<any> }[] = [
    { key: 'overview',     label: 'Overview',      icon: BarChart3 },
    { key: 'categories',   label: 'By Category',   icon: Layers },
    { key: 'transactions', label: 'Transactions',  icon: DollarSign },
    { key: 'splits',       label: 'Split Config',  icon: Split },
  ];

  return (
    <div className="min-h-screen text-white pb-16">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Manage your money &amp; payouts</p>
            <h1 className="text-3xl font-black uppercase tracking-tight">Revenue &amp; Money</h1>
            {connectStatus.payoutsEnabled && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest text-green-400">Payouts Active</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/8">
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${period === p ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>
                  {p}
                </button>
              ))}
            </div>
            {/* Stripe dashboard link */}
            <button onClick={() => openStripeDashboard().catch(() => {})}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/20 transition-all">
              <ExternalLink size={11} /> Stripe Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 max-w-5xl mx-auto mb-6">
        <div className="flex gap-1 p-1 bg-white/5 rounded-2xl border border-white/8 w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t.key ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>
                <Icon size={11} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 max-w-5xl mx-auto">
        <AnimatePresence mode="wait">

          {/* ── Overview Tab ──────────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {loadingEarnings ? (
                <div className="flex items-center justify-center h-48 text-white/20">
                  <RefreshCw size={20} className="animate-spin" />
                </div>
              ) : (
                <>
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard label="Total Gross"      value={fmt(earnings?.totalGrossCents ?? 0)}   icon={TrendingUp}  color="#a78bfa" sub={PERIOD_LABELS[period]} />
                    <StatCard label="Your Net"         value={fmt(earnings?.totalNetCents ?? 0)}     icon={DollarSign}  color="#34d399" sub="After platform fee" />
                    <StatCard label="Pending Transfer" value={fmt(earnings?.pendingCents ?? 0)}      icon={Clock}       color="#fbbf24" sub="Awaiting Stripe transfer" />
                    <StatCard label="Paid Out"         value={fmt(earnings?.paidOutCents ?? 0)}      icon={CheckCircle2}color="#60a5fa" sub="In your bank" />
                  </div>

                  {/* Platform fee callout */}
                  <div className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                      <Percent size={16} className="text-white/40" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-white mb-0.5">Platform Fee ({PERIOD_LABELS[period]})</p>
                      <p className="text-[10px] text-white/30">Plajah retained {fmt(earnings?.totalPlatformFeeCents ?? 0)} — 10% of gross</p>
                    </div>
                    <p className="text-lg font-black text-white/50">{fmt(earnings?.totalPlatformFeeCents ?? 0)}</p>
                  </div>

                  {/* Top categories */}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-4">Revenue by Source</p>
                    <div className="p-5 bg-white/[0.04] border border-white/8 rounded-2xl">
                      {CATEGORIES.map(cat => {
                        const d = byCategory[cat.key] ?? { grossCents: 0, netCents: 0, count: 0 };
                        return d.count > 0 ? (
                          <CategoryBar key={cat.key} label={cat.label} grossCents={d.grossCents} netCents={d.netCents} count={d.count} color={cat.color} icon={cat.icon} maxCents={maxCatNet} />
                        ) : null;
                      })}
                      {!CATEGORIES.some(c => (byCategory[c.key]?.count ?? 0) > 0) && (
                        <p className="text-center text-white/20 text-sm py-8">No earnings yet in this period</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── Categories Tab ─────────────────────────────────────────────── */}
          {tab === 'categories' && (
            <motion.div key="categories" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CATEGORIES.map(cat => {
                const d = byCategory[cat.key] ?? { grossCents: 0, netCents: 0, count: 0 };
                const Icon = cat.icon;
                return (
                  <div key={cat.key} className="p-5 bg-white/[0.04] border border-white/8 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}30` }}>
                        <Icon size={18} style={{ color: cat.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">{cat.label}</p>
                        <p className="text-[9px] text-white/30">{cat.desc}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Gross',       value: fmt(d.grossCents) },
                        { label: 'Net to You',  value: fmt(d.netCents) },
                        { label: 'Transactions',value: d.count.toString() },
                      ].map(s => (
                        <div key={s.label}>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">{s.label}</p>
                          <p className="text-base font-black text-white">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* ── Transactions Tab ───────────────────────────────────────────── */}
          {tab === 'transactions' && (
            <motion.div key="transactions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {loadingEarnings ? (
                <div className="flex justify-center py-16"><RefreshCw size={20} className="animate-spin text-white/20" /></div>
              ) : (
                <div className="space-y-2">
                  {(earnings?.transactions ?? []).length === 0 && (
                    <p className="text-center text-white/20 text-sm py-16">No transactions in this period</p>
                  )}
                  {(earnings?.transactions ?? []).map((t: any) => {
                    const cat = CATEGORIES.find(c => c.key === t.category);
                    const Icon = cat?.icon ?? DollarSign;
                    return (
                      <div key={t.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/6 rounded-xl hover:bg-white/[0.05] transition-all">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cat?.color ?? '#a78bfa'}18`, border: `1px solid ${cat?.color ?? '#a78bfa'}25` }}>
                          <Icon size={14} style={{ color: cat?.color ?? '#a78bfa' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-white truncate">{t.title}</p>
                          <p className="text-[9px] text-white/30">{new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <StatusBadge status={t.status} />
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-white">{fmt(t.creatorNetCents)}</p>
                          <p className="text-[9px] text-white/25">of {fmt(t.grossCents)} gross</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Splits Tab ────────────────────────────────────────────────── */}
          {tab === 'splits' && (
            <motion.div key="splits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <SplitsTab currentUserUid={currentUser.uid} />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default CreatorPaymentDashboard;
