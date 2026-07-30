import React, { useEffect, useState } from 'react';
import { Megaphone, Radio, Tv, Check, X, Loader2, DollarSign, Clock } from 'lucide-react';
import type { UserProfile, PromoBooking } from '../types';
import { setCreatorPromoRates, fetchCreatorPromoRequests, respondToPromoBooking, PROMO_LABEL } from '../services/promoBookingService';

/**
 * Creator side of the promo marketplace: name your rates for a radio commercial / FAST spot /
 * cross-promotion, open yourself to bookings, and accept or decline incoming business requests.
 */
const CreatorPromoInbox: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const r = profile.promoRates || {};
  const [acceptsPromo, setAccepts] = useState(!!r.acceptsPromo);
  const [radioAd, setRadioAd] = useState(r.radioAd ?? 0);
  const [fastAd, setFastAd] = useState(r.fastAd ?? 0);
  const [crossPromo, setCrossPromo] = useState(r.crossPromo ?? 0);
  const [notes, setNotes] = useState(r.notes || '');
  const [saved, setSaved] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [requests, setRequests] = useState<PromoBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { fetchCreatorPromoRequests().then(setRequests).catch(() => {}).finally(() => setLoading(false)); }, []);

  const saveRates = async () => {
    setSavingRates(true);
    try {
      await setCreatorPromoRates({ acceptsPromo, radioAd: Number(radioAd) || 0, fastAd: Number(fastAd) || 0, crossPromo: Number(crossPromo) || 0, notes });
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    } catch { /* */ } finally { setSavingRates(false); }
  };

  const respond = async (id: string, status: 'ACCEPTED' | 'DECLINED') => {
    setBusyId(id);
    try { await respondToPromoBooking(id, status); setRequests(rs => rs.map(x => x.id === id ? { ...x, status } : x)); }
    catch { /* */ } finally { setBusyId(null); }
  };

  const pending = requests.filter(r => r.status === 'PENDING');

  return (
    <div className="max-w-lg mx-auto p-4 text-white space-y-5">
      <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2"><Megaphone size={18} className="text-small-orange" /> Promo & commercials</h2>

      {/* Rates */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
        <label className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-widest">Accept business bookings</span>
          <button onClick={() => setAccepts(v => !v)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${acceptsPromo ? 'bg-small-orange text-black' : 'bg-white/10 text-white/50'}`}>{acceptsPromo ? 'On' : 'Off'}</button>
        </label>
        <p className="text-[10px] text-white/35">Set the price you charge businesses. They book from the artist directory; you approve each.</p>
        {([['Radio commercial', radioAd, setRadioAd, <Radio size={13} key="r" />], ['FAST channel spot', fastAd, setFastAd, <Tv size={13} key="t" />], ['Cross-promotion', crossPromo, setCrossPromo, <Megaphone size={13} key="m" />]] as const).map(([label, val, set, icon], i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-white/70 flex-1">{icon} {label}</span>
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2">
              <DollarSign size={13} className="text-white/30" />
              <input type="number" value={val} onChange={e => (set as any)(parseFloat(e.target.value) || 0)} className="w-16 bg-transparent py-2 text-sm outline-none" />
            </div>
          </div>
        ))}
        <button onClick={saveRates} disabled={savingRates} className="w-full py-2.5 rounded-xl bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
          {savingRates ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null} {saved ? 'Saved' : 'Save rates'}
        </button>
      </div>

      {/* Inbox */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Requests{pending.length ? ` · ${pending.length} new` : ''}</p>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-white/40" /></div>
        ) : requests.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-6">No requests yet.</p>
        ) : (
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black truncate">{req.businessName}</p>
                  <span className="text-sm font-black text-small-orange shrink-0">${req.rate}</span>
                </div>
                <p className="text-[10px] text-white/40">{PROMO_LABEL[req.kind]}</p>
                {req.message && <p className="text-[11px] text-white/50 mt-1 italic">“{req.message}”</p>}
                {req.status === 'PENDING' ? (
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={() => respond(req.id, 'ACCEPTED')} disabled={busyId === req.id} className="flex-1 py-2 rounded-xl bg-green-500/20 text-green-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5">{busyId === req.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Accept</button>
                    <button onClick={() => respond(req.id, 'DECLINED')} disabled={busyId === req.id} className="flex-1 py-2 rounded-xl bg-white/8 text-white/60 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"><X size={12} /> Decline</button>
                  </div>
                ) : (
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${req.status === 'ACCEPTED' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{req.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorPromoInbox;
