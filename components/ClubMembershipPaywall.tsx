import React, { useState } from 'react';
import { Lock, Crown, Check, Loader2, CreditCard } from 'lucide-react';
import { startClubMembershipCheckout, joinClub, auth } from '../services/backendService';
import type { Club } from '../types';

interface Props {
  club: Club;
  onJoined: () => void;
}

export default function ClubMembershipPaywall({ club, onJoined }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const isFree   = !club.monthlyPrice || club.monthlyPrice <= 0;
  const monthly  = club.monthlyPrice ?? 0;
  const yearly   = club.yearlyPrice  ?? Math.round(monthly * 10);

  const handleJoinFree = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      await joinClub(club.id, 'MEMBER');
      onJoined();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to join club');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (isYearly = false) => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const token = await auth.currentUser.getIdToken();
      await startClubMembershipCheckout(club.id, club.name, isYearly ? yearly / 12 : monthly, token);
    } catch (e: any) {
      setError(e?.message ?? 'Checkout failed — please try again');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-500/12 flex items-center justify-center">
        {isFree ? <Lock size={28} className="text-amber-400" /> : <Crown size={28} className="text-amber-400" />}
      </div>

      <div>
        <h3 className="text-lg font-black uppercase tracking-tight text-white">
          {isFree ? 'Join this Club' : 'Member Access Required'}
        </h3>
        <p className="text-[10px] text-white/35 mt-2 max-w-sm">
          {isFree
            ? `Join ${club.name} to post, chat, and access member-only content.`
            : `${club.name} is a paid community. Subscribe to access all content, events, and the live chat.`}
        </p>
      </div>

      {isFree ? (
        <button onClick={handleJoinFree} disabled={loading}
          className="flex items-center gap-2 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-amber-400 text-black hover:scale-105 active:scale-95 transition-all disabled:opacity-40">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Join Free
        </button>
      ) : (
        <div className="space-y-3 w-full max-w-xs">
          <button onClick={() => handleCheckout(false)} disabled={loading}
            className="w-full flex items-center justify-between px-6 py-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/15 transition-all disabled:opacity-40">
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-white">Monthly</p>
              <p className="text-[9px] text-white/40">Cancel anytime</p>
            </div>
            <p className="text-lg font-black text-amber-400">${monthly.toFixed(2)}<span className="text-[9px] text-white/30">/mo</span></p>
          </button>

          {yearly > 0 && (
            <button onClick={() => handleCheckout(true)} disabled={loading}
              className="w-full flex items-center justify-between px-6 py-4 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all disabled:opacity-40 relative">
              <span className="absolute -top-2.5 right-4 text-[8px] font-black uppercase tracking-widest bg-green-500 text-black px-2 py-0.5 rounded-full">Save {Math.round((1 - yearly / (monthly * 12)) * 100)}%</span>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase tracking-widest text-white">Yearly</p>
                <p className="text-[9px] text-white/40">${(yearly / 12).toFixed(2)}/mo billed annually</p>
              </div>
              <p className="text-lg font-black text-white">${yearly.toFixed(2)}<span className="text-[9px] text-white/30">/yr</span></p>
            </button>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 text-[9px] text-white/30">
              <Loader2 size={12} className="animate-spin" /> Redirecting to checkout…
            </div>
          )}
          {error && <p className="text-[9px] text-red-400 text-center">{error}</p>}

          <p className="text-[8px] text-white/15 flex items-center justify-center gap-1">
            <CreditCard size={9} /> Secure payment via Stripe
          </p>
        </div>
      )}
    </div>
  );
}
