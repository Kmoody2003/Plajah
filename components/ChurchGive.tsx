// ChurchGive — the giving experience for a church (Part 3, Phase 2).
//
// Pick a fund, an amount, one-time or recurring, and give via Stripe. A QR code
// encodes the church's give link so it can be shown on a screen / bulletin and
// scanned to give. Falls back to the church's external giving link if set.

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Gift, Loader2, Repeat, QrCode, Check } from 'lucide-react';
import type { Organization, GivingFund } from '../types';
import { auth } from '../services/backendService';
import { startChurchDonation } from '../services/stripeService';
import { shareOrigin } from '../services/deepLinkService';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';

const PRESETS = [10, 25, 50, 100, 250];

const ChurchGive: React.FC<{ org: Organization; onClose: () => void; fundGiven?: Record<string, number> }> = ({ org, onClose, fundGiven = {} }) => {
  const funds: GivingFund[] = org.givingFunds && org.givingFunds.length ? org.givingFunds : [{ id: 'general', name: 'General' }];
  const [fundId, setFundId] = useState(funds[0].id);
  const [amount, setAmount] = useState<number>(50);
  const [custom, setCustom] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const fund = funds.find(f => f.id === fundId) || funds[0];
  const finalAmount = custom ? Number(custom) : amount;
  const giveLink = `${shareOrigin()}/?org=${org.id}&give=1`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(org.givingUrl || giveLink)}`;

  const give = async () => {
    if (!finalAmount || finalAmount < 1) return;
    if (org.givingUrl) { window.open(org.givingUrl, '_blank', 'noopener'); return; }
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { setBusy(false); alert('Please sign in to give.'); return; }
      await startChurchDonation({ churchId: org.id, churchName: org.name, amount: finalAmount, fund: fund.name, recurring, userIdToken: token });
    } catch (e: any) { setBusy(false); alert(e?.message || 'Could not start giving.'); }
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-12 max-w-lg mx-auto">
      <button onClick={onClose} className={`tap flex items-center gap-2 text-white/40 hover:text-white ${TYPE.labelMd} font-black uppercase tracking-widest mb-8`}><ArrowLeft size={14} /> Back</button>

      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-small-orange/15 rounded-2xl"><Gift className="text-small-orange" size={24} /></div>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white leading-none">Give to {org.name}</h1>
          <p className={`${TYPE.labelMd} font-bold text-white/40 uppercase tracking-widest mt-1`}>Secure giving via Stripe</p>
        </div>
      </div>

      {/* Fund */}
      {funds.length > 1 && (
        <div className="mb-6">
          <label className={`${TYPE.labelLg} font-black uppercase tracking-widest text-white/40 mb-2 block`}>Fund</label>
          <div className="grid grid-cols-2 gap-2">
            {funds.map(f => (
              <button key={f.id} onClick={() => setFundId(f.id)}
                className={`px-4 py-3 rounded-2xl border text-left transition-all ${fundId === f.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                <span className="type-body-sm font-black uppercase tracking-widest">{f.name}</span>
                {typeof f.goal === 'number' && f.goal > 0 && (
                  <div className="mt-1.5 h-1 rounded-full bg-black/20 overflow-hidden"><div className="h-full bg-small-orange" style={{ width: `${Math.min(100, (((f.raised || 0) + (fundGiven[f.name] || 0)) / f.goal) * 100)}%` }} /></div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Amount */}
      <label className={`${TYPE.labelLg} font-black uppercase tracking-widest text-white/40 mb-2 block`}>Amount</label>
      <AdaptiveGrid phone={2} tablet={3} desktop={3} gap="0.5rem" className="mb-3">
        {PRESETS.map(p => (
          <button key={p} onClick={() => { setAmount(p); setCustom(''); }}
            className={`py-3 rounded-2xl border text-sm font-black transition-all ${!custom && amount === p ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}>
            ${p}
          </button>
        ))}
        <input value={custom} onChange={e => setCustom(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Other"
          className="py-3 px-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-black text-white text-center outline-none focus:border-small-orange/50" />
      </AdaptiveGrid>

      {/* Frequency */}
      <button onClick={() => setRecurring(r => !r)} className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border mb-6 transition-all ${recurring ? 'bg-small-orange/15 border-small-orange/40 text-small-orange' : 'bg-white/5 border-white/10 text-white/50'}`}>
        <Repeat size={14} /> <span className={`${TYPE.labelMd} font-black uppercase tracking-widest`}>{recurring ? 'Monthly recurring gift' : 'Give monthly'}</span>
        {recurring && <Check size={14} />}
      </button>

      <button onClick={give} disabled={busy || !finalAmount || finalAmount < 1}
        className="w-full py-4 bg-small-orange text-black rounded-full font-black text-sm uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
        {busy ? <><Loader2 size={18} className="animate-spin" /> Redirecting…</> : <><Gift size={18} /> Give ${finalAmount || 0}{recurring ? '/mo' : ''}</>}
      </button>

      {/* QR — scan to give */}
      <button onClick={() => setShowQr(q => !q)} className={`tap mt-6 w-full flex items-center justify-center gap-2 ${TYPE.labelMd} font-black uppercase tracking-widest text-white/40 hover:text-white`}><QrCode size={13} /> {showQr ? 'Hide' : 'Show'} scan-to-give code</button>
      {showQr && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-col items-center gap-3 p-4 sm:p-6 bg-white rounded-3xl">
          <img src={qrSrc} alt="Scan to give" width={200} height={200} className="rounded-xl" />
          <p className={`${TYPE.labelMd} font-black uppercase tracking-widest text-black/50`}>Scan to give to {org.name}</p>
        </motion.div>
      )}

      <p className={`${TYPE.labelMd} text-white/25 text-center mt-6 leading-relaxed`}>Payments are processed securely by Stripe. {org.givingUrl ? "Opens this church's giving page." : ''}</p>
    </div>
  );
};

export default ChurchGive;
