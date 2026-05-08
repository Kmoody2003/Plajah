import React, { useState } from 'react';
import { 
  DollarSign, TrendingUp, Users, ShoppingBag, Radio, Wallet, 
  ArrowUpRight, ArrowDownRight, CreditCard, Bitcoin, Shield,
  ChevronRight, ExternalLink, Activity, PieChart, Heart
} from 'lucide-react';
import { UserRevenue, UserProfile } from '../types';
import { updateCryptoWallet } from '../services/backendService';
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

  const revenue = profile.revenue || {
    donations: 0,
    merch: 0,
    adRevenue: 0,
    subscriptions: 0
  };

  const totalRevenue = revenue.donations + revenue.merch + revenue.adRevenue + revenue.subscriptions;

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
                  <p className="text-[10px] text-green-400 font-bold uppercase">Connected & Active</p>
                </div>
              </div>
              <button className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white transition-all">
                <ExternalLink size={18} />
              </button>
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
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Estimated: April 20, 2026</span>
              </div>
              <div className="p-8 bg-small-orange/10 border border-small-orange/20 rounded-[2.5rem]">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-small-orange uppercase tracking-widest mb-1">Pending Balance</p>
                    <h5 className="text-4xl font-black uppercase tracking-tightest">$1,240.50</h5>
                  </div>
                  <button className="px-8 py-4 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl">
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
