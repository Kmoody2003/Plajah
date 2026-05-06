import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, TrendingUp, History, Users, ShieldCheck, Info, Gift } from 'lucide-react';
import { auth, donateToPayItForward, fetchPayItForwardHistory, listenToPayItForwardStatus, updatePayItForwardOptIn } from '../services/backendService';
import { PayItForwardPool, PayItForwardWinner, UserProfile } from '../types';

interface PayItForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
}

const PayItForwardModal: React.FC<PayItForwardModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [amount, setAmount] = useState<string>('');
  const [isDonating, setIsDonating] = useState(false);
  const [status, setStatus] = useState<PayItForwardPool | null>(null);
  const [history, setHistory] = useState<PayItForwardWinner[]>([]);
  const [activeTab, setActiveTab] = useState<'DONATE' | 'HISTORY' | 'INFO'>('DONATE');
  const [optIn, setOptIn] = useState(userProfile?.payItForwardOptIn || false);

  useEffect(() => {
    if (isOpen) {
      const unsubscribe = listenToPayItForwardStatus(setStatus);
      fetchPayItForwardHistory().then(setHistory);
      return () => unsubscribe();
    }
  }, [isOpen]);

  useEffect(() => {
    if (userProfile) {
      setOptIn(userProfile.payItForwardOptIn || false);
    }
  }, [userProfile]);

  const handleDonate = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setIsDonating(true);
    try {
      await donateToPayItForward(numAmount);
      setAmount('');
      alert('Thank you for your blessing! Your donation has been added to the pool.');
    } catch (e) {
      console.error(e);
    } finally {
      setIsDonating(false);
    }
  };

  const handleToggleOptIn = async () => {
    const newOptIn = !optIn;
    setOptIn(newOptIn);
    await updatePayItForwardOptIn(newOptIn);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-[#0A0A0A] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="relative p-6 border-b border-white/5 bg-gradient-to-r from-small-orange/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-small-orange flex items-center justify-center shadow-lg shadow-small-orange/20">
              <Heart className="text-white" size={20} fill="white" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">Pay It Forward</h2>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Global Charity Pool</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5">
          {[
            { id: 'DONATE', icon: Gift, label: 'Gifts & tips' },
            { id: 'HISTORY', icon: History, label: 'Winners' },
            { id: 'INFO', icon: Info, label: 'How it works' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'text-small-orange bg-small-orange/5' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'DONATE' && (
            <div className="space-y-8">
              <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-small-orange" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Participation</span>
                  </div>
                  <button 
                    onClick={handleToggleOptIn}
                    className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                      optIn ? 'bg-small-orange text-white' : 'bg-white/10 text-white/40 hover:bg-white/20'
                    }`}
                  >
                    {optIn ? 'Opted In' : 'Opt In'}
                  </button>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  By opting in, you become eligible to be randomly selected as a daily winner. 
                  Winners are chosen from the pool of active, opted-in users.
                </p>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Gifts & tips Amount</label>
                <div className="relative">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-white/20">$</span>
                  <input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 pl-12 pr-6 text-3xl font-black text-white focus:outline-none focus:border-small-orange/50 transition-colors placeholder:text-white/5"
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['5', '10', '25', '50'].map((val) => (
                    <button 
                      key={val}
                      onClick={() => setAmount(val)}
                      className="py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white/60 transition-colors"
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleDonate}
                disabled={isDonating || !amount}
                className="w-full py-5 bg-small-orange hover:bg-small-orange/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-small-orange/20 transition-all active:scale-[0.98]"
              >
                {isDonating ? 'Processing...' : 'Bless the Pool'}
              </button>

              <div className="flex items-center gap-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                <ShieldCheck className="text-blue-400 shrink-0" size={18} />
                <p className="text-[10px] text-blue-400/80 leading-relaxed font-medium">
                  Amounts are kept private. Only the winner's name is announced. 
                  100% of gifts & tips go directly to the selected winner.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'HISTORY' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Total Given (Month)</p>
                  <p className="text-xl font-black text-white">${status?.totalGivenOutMonth?.toLocaleString() || '0'}</p>
                </div>
                <TrendingUp className="text-small-orange" size={24} />
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Recent Blessings</h4>
                {history.length > 0 ? (
                  history.map((win, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-small-orange to-orange-600 flex items-center justify-center text-[10px] font-black text-white">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">Winner Selected</p>
                          <p className="text-[10px] text-white/40">{new Date(win.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-[8px] font-black uppercase tracking-widest rounded">Claimed</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <History size={32} className="text-white/10 mx-auto mb-3" />
                    <p className="text-xs text-white/20 font-bold uppercase tracking-widest">No history yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'INFO' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-black text-white uppercase tracking-tight">The "Pay It Forward" Cycle</h4>
                <div className="space-y-4">
                  {[
                    { title: 'The Pool', desc: 'Anyone can donate to the global pool at any time. Amounts are hidden to maintain the spirit of anonymous blessing.' },
                    { title: 'Daily Selection', desc: 'Every 24 hours, a random opted-in user is selected to receive the entire current pot.' },
                    { title: 'Claim or Pass', desc: 'The winner can claim the blessing or "Pay It Forward" to the next day, making the pot even bigger.' },
                    { title: 'Fairness Rules', desc: 'No back-to-back wins. Max 2 wins per month, 4 per year. The cycle resets every 30 days.' }
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-small-orange shrink-0 border border-white/5">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white mb-1 uppercase tracking-wide">{item.title}</p>
                        <p className="text-[11px] text-white/40 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-small-orange/5 border border-small-orange/10 rounded-2xl">
                <p className="text-[11px] text-small-orange/80 leading-relaxed italic text-center">
                  "Designed for being a blessing and to do charity to random people."
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Pool Active</span>
          </div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Plajah Charity Foundation</p>
        </div>
      </motion.div>
    </div>
  );
};

export default PayItForwardModal;
