import React, { useEffect, useState } from 'react';
import {
  DollarSign, TrendingUp, Users, ShoppingBag, Radio, Wallet,
  ArrowUpRight, ArrowDownRight, CreditCard, Bitcoin, Shield,
  ChevronRight, ExternalLink, Activity, PieChart, Heart,
  Film, Ticket, Play, Star,
} from 'lucide-react';
import { UserRevenue, UserProfile } from '../types';
import { updateCryptoWallet, fetchCreatorEarnings, startCreatorConnectOnboarding, fetchConnectStatus, openStripeDashboard } from '../services/backendService';
import { motion } from 'motion/react';

interface RevenueDashboardProps {
  profile: UserProfile;
  onUpdate: (profile: UserProfile) => void;
}

const RevenueDashboard: React.FC<RevenueDashboardProps> = ({ profile, onUpdate }) => {
  const [isEditingCrypto, setIsEditingCrypto] = useState(false);
  const [cryptoWallet, setCryptoWallet] = useState(profile.revenue?.cryptoWallet || {
    bitcoin: '',
    ethereum: '',
    solana: ''
  });

  // Real pending payout balance from Stripe earnings (0 until money actually clears).
  const [pendingCents, setPendingCents] = useState(0);
  useEffect(() => {
    let live = true;
    fetchCreatorEarnings('1y')
      .then(e => { if (live) setPendingCents(e?.pendingCents ?? 0); })
      .catch(() => { if (live) setPendingCents(0); });
    return () => { live = false; };
  }, []);
  const pendingUsd = (pendingCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  // Real Stripe Connect status (was hardcoded to a fake "Connected & Active").
  const [connect, setConnect] = useState<{ connected?: boolean; chargesEnabled?: boolean; requiresAction?: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const refreshConnect = () => fetchConnectStatus().then(setConnect).catch(() => setConnect({ connected: false }));
  useEffect(() => { refreshConnect(); }, []);
  const isConnected = !!connect?.connected && !!connect?.chargesEnabled;
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await startCreatorConnectOnboarding();
      if (!url) throw new Error('Stripe did not return an onboarding link. Make sure Connect is enabled and your API key has Connect permissions.');
      window.location.href = url; // same-tab redirect — window.open after await is popup-blocked
    } catch (e: any) {
      alert(e?.message || 'Could not start Stripe onboarding.');
      setConnecting(false);
    }
  };

  const revenue = profile.revenue || {
    donations: 0,
    merch: 0,
    adRevenue: 0,
    subscriptions: 0
  };

  const totalRevenue = revenue.donations + revenue.merch + revenue.adRevenue + revenue.subscriptions;

  const filmRentals           = revenue.filmRentals           ?? 0;
  const filmPurchases         = revenue.filmPurchases         ?? 0;
  const filmPPVTickets        = revenue.filmPPVTickets        ?? 0;
  const filmFastAdIncome      = revenue.filmFastAdIncome      ?? 0;
  const filmReviewCodeLicenses= revenue.filmReviewCodeLicenses?? 0;
  const totalFilmRevenue      = filmRentals + filmPurchases + filmPPVTickets + filmFastAdIncome + filmReviewCodeLicenses;

  const filmStats = [
    { label: 'Film Total',    value: totalFilmRevenue,       icon: Film,   color: 'text-orange-400',  bg: 'bg-orange-400/20' },
    { label: 'Rentals',       value: filmRentals,            icon: Play,   color: 'text-sky-400',     bg: 'bg-sky-400/20'    },
    { label: 'Purchases',     value: filmPurchases,          icon: ShoppingBag, color: 'text-violet-400', bg: 'bg-violet-400/20' },
    { label: 'PPV Tickets',   value: filmPPVTickets,         icon: Ticket, color: 'text-pink-400',    bg: 'bg-pink-400/20'   },
    { label: 'FAST Ads',      value: filmFastAdIncome,       icon: Radio,  color: 'text-green-400',   bg: 'bg-green-400/20'  },
    { label: 'Review Codes',  value: filmReviewCodeLicenses, icon: Star,   color: 'text-yellow-400',  bg: 'bg-yellow-400/20' },
  ];

  const handleSaveCrypto = async () => {
    await updateCryptoWallet(cryptoWallet);
    onUpdate({
      ...profile,
      revenue: {
        ...revenue,
        cryptoWallet
      }
    });
    setIsEditingCrypto(false);
  };

  const stats = [
    { label: 'Total Revenue', value: totalRevenue, icon: DollarSign, color: 'text-small-orange', bg: 'bg-small-orange/20' },
    { label: 'Merchandise', value: revenue.merch, icon: ShoppingBag, color: 'text-blue-400', bg: 'bg-blue-400/20' },
    { label: 'Gifts & tips', value: revenue.donations, icon: Heart, color: 'text-pink-400', bg: 'bg-pink-400/20' },
    { label: 'Subscriptions', value: revenue.subscriptions, icon: Users, color: 'text-purple-400', bg: 'bg-purple-400/20' },
    { label: 'Ad Revenue', value: revenue.adRevenue, icon: Radio, color: 'text-green-400', bg: 'bg-green-400/20' },
  ];

  return (
    <div className="space-y-12">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 hover:bg-white/[0.04] transition-all group"
          >
            <div className={`p-4 ${stat.bg} rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform`}>
              <stat.icon className={stat.color} size={24} />
            </div>
            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">{stat.label}</p>
            <h4 className="text-3xl font-black uppercase tracking-tightest">${stat.value.toLocaleString()}</h4>
          </motion.div>
        ))}
      </div>

      {/* ── Film Distribution Revenue ─────────────────────────────────── */}
      <section className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-10">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-orange-400/15 rounded-2xl">
            <Film className="text-orange-400" size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tightest">Film Distribution</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Rentals · Purchases · PPV · FAST · Press Codes</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {filmStats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-5 hover:bg-white/[0.05] transition-all group"
            >
              <div className={`p-3 ${stat.bg} rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform`}>
                <stat.icon className={stat.color} size={18} />
              </div>
              <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">{stat.label}</p>
              <h4 className="text-xl font-black uppercase tracking-tight">${stat.value.toLocaleString()}</h4>
            </motion.div>
          ))}
        </div>
        {totalFilmRevenue === 0 && (
          <div className="mt-6 p-6 rounded-2xl border border-dashed border-white/8 text-center">
            <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">No film revenue yet</p>
            <p className="text-[9px] text-white/12 mt-1">Upload your first film in Film Studio to start earning</p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Crypto Wallet Section */}
        <section className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-10">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-small-orange/20 rounded-2xl">
                <Bitcoin className="text-small-orange" size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tightest">Crypto Wallets</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Accept Bitcoin and other cryptocurrencies</p>
              </div>
            </div>
            <button 
              onClick={() => isEditingCrypto ? handleSaveCrypto() : setIsEditingCrypto(true)}
              className="px-8 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
            >
              {isEditingCrypto ? 'Save Wallets' : 'Edit Wallets'}
            </button>
          </div>

          <div className="space-y-6">
            {[
              { id: 'bitcoin', label: 'Bitcoin (BTC)', icon: Bitcoin },
              { id: 'ethereum', label: 'Ethereum (ETH)', icon: Activity },
              { id: 'solana', label: 'Solana (SOL)', icon: Shield }
            ].map(coin => (
              <div key={coin.id} className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">{coin.label}</label>
                <div className="relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20">
                    <coin.icon size={18} />
                  </div>
                  <input 
                    disabled={!isEditingCrypto}
                    value={cryptoWallet[coin.id as keyof typeof cryptoWallet] || ''}
                    onChange={(e) => setCryptoWallet(prev => ({ ...prev, [coin.id]: e.target.value }))}
                    placeholder={`Enter your ${coin.label} address`}
                    className="w-full bg-white/5 border border-white/10 rounded-3xl pl-16 pr-8 py-5 text-sm focus:outline-none focus:border-small-orange/50 transition-all disabled:opacity-50"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Payment Methods & Payouts */}
        <section className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-10">
          <div className="flex items-center gap-4 mb-10">
            <div className="p-4 bg-blue-400/20 rounded-2xl">
              <CreditCard className="text-blue-400" size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tightest">Payout Settings</h3>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Manage traditional payment methods</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="w-16 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                  <span className="text-[10px] font-black uppercase">Stripe</span>
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest">Stripe Connect</p>
                  <p className={`text-[10px] font-bold uppercase ${isConnected ? 'text-green-400' : connect?.requiresAction ? 'text-amber-400' : 'text-white/30'}`}>
                    {isConnected ? 'Connected & Active' : connect?.requiresAction ? 'Setup incomplete' : connect === null ? 'Checking…' : 'Not connected — required to get paid'}
                  </p>
                </div>
              </div>
              {isConnected ? (
                <button onClick={() => openStripeDashboard().catch(() => {})} title="Open your Stripe dashboard"
                  className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white transition-all">
                  <ExternalLink size={18} />
                </button>
              ) : (
                <button onClick={handleConnect} disabled={connecting}
                  className="px-6 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50">
                  {connecting ? 'Opening Stripe…' : connect?.requiresAction ? 'Complete Setup' : 'Connect with Stripe'}
                </button>
              )}
            </div>

            <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-6">
                <div className="w-16 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                  <span className="text-[10px] font-black uppercase">PayPal</span>
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest">PayPal Business</p>
                  <p className="text-[10px] text-white/20 font-bold uppercase">Not Connected</p>
                </div>
              </div>
              <button className="px-6 py-3 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest">Connect</button>
            </div>

            <div className="pt-6">
              <div className="flex items-center justify-between mb-4 px-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Next Payout</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{pendingCents > 0 ? 'Automatic via Stripe' : '—'}</span>
              </div>
              <div className="p-8 bg-small-orange/10 border border-small-orange/20 rounded-[2.5rem]">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-small-orange uppercase tracking-widest mb-1">Pending Balance</p>
                    <h5 className="text-4xl font-black uppercase tracking-tightest">{pendingUsd}</h5>
                  </div>
                  <button
                    disabled={pendingCents <= 0}
                    className="px-8 py-4 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-40 disabled:hover:scale-100"
                  >
                    Request Early Payout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default RevenueDashboard;
