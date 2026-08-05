import React, { useEffect, useState } from 'react';
import { Bell, Tag, Loader2, Check } from 'lucide-react';
import { getMyBusinessSubscription, setBusinessSubscription } from '../services/businessMessagingService';

/**
 * Customer-facing opt-in for a business's updates — split into transactional (order/account) and
 * promo (deals) so consent is granular (and ready for the SMS/TCPA phase later). Drop this on a
 * business profile / after an order. Phase 1 = in-app push + notification inbox.
 */
const BusinessMessageOptIn: React.FC<{ businessUid: string; businessName: string }> = ({ businessUid, businessName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [txn, setTxn] = useState(false);
  const [promo, setPromo] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyBusinessSubscription(businessUid).then(s => {
      if (!alive) return;
      setTxn(!!s?.transactional); setPromo(!!s?.promo); setLoading(false);
    });
    return () => { alive = false; };
  }, [businessUid]);

  const save = async (nextTxn: boolean, nextPromo: boolean) => {
    setTxn(nextTxn); setPromo(nextPromo); setSaving(true);
    try { await setBusinessSubscription(businessUid, { transactional: nextTxn, promo: nextPromo, push: true }); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    catch { /* */ } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-white/30 text-xs py-3"><Loader2 size={13} className="animate-spin" /> Loading…</div>;

  const Row: React.FC<{ on: boolean; onToggle: () => void; icon: React.ReactNode; title: string; sub: string }> = ({ on, onToggle, icon, title, sub }) => (
    <button onClick={onToggle} disabled={saving} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] transition-all text-left disabled:opacity-60">
      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/60 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black uppercase tracking-widest text-white">{title}</p>
        <p className="text-[10px] text-white/40 truncate">{sub}</p>
      </div>
      <div className={`w-10 h-6 rounded-full p-0.5 transition-all shrink-0 ${on ? 'bg-small-orange' : 'bg-white/15'}`}>
        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
      </div>
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Updates from {businessName}</p>
        {saved && <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-green-400"><Check size={11} /> Saved</span>}
      </div>
      <Row on={txn} onToggle={() => save(!txn, promo)} icon={<Bell size={15} />} title="Order & account updates" sub="Order ready, pickup & status alerts" />
      <Row on={promo} onToggle={() => save(txn, !promo)} icon={<Tag size={15} />} title="Deals & offers" sub="Promotions and special offers" />
      <p className="text-[8px] text-white/25 leading-relaxed">Delivered as in-app + push notifications. Turn off anytime here.</p>
    </div>
  );
};

export default BusinessMessageOptIn;
