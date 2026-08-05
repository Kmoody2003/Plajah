import React, { useEffect, useState } from 'react';
import { Bell, Tag, Send, Loader2, Check, Users, AlertTriangle } from 'lucide-react';
import { listBusinessSubscribers, sendBusinessBroadcast } from '../services/businessMessagingService';

/**
 * Business-facing composer: send an update (order/account) or a deal to opted-in customers via
 * in-app + push (Phase 1 — no SMS). Shows how many customers are opted into the chosen category so
 * the owner knows the reach before sending. Drop into the org/business tools for a BUSINESS account.
 */
const BusinessBroadcastComposer: React.FC<{ business: { uid: string; name: string; photo?: string } }> = ({ business }) => {
  const [category, setCategory] = useState<'TRANSACTIONAL' | 'PROMO'>('TRANSACTIONAL');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setAudience(null);
    listBusinessSubscribers(business.uid, category).then(s => { if (alive) setAudience(s.length); });
    return () => { alive = false; };
  }, [business.uid, category]);

  const canSend = title.trim() && body.trim() && !sending && (audience ?? 0) > 0;

  const send = async () => {
    if (!canSend) return;
    setSending(true); setSentCount(null);
    try {
      const { recipientCount } = await sendBusinessBroadcast(business, { category, title: title.trim(), body: body.trim() });
      setSentCount(recipientCount);
      setTitle(''); setBody('');
    } catch { /* */ } finally { setSending(false); }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-4 max-w-lg">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Message your customers</p>

      {/* Category */}
      <div className="flex gap-2">
        {([
          { id: 'TRANSACTIONAL', label: 'Update', icon: <Bell size={13} />, hint: 'Order / account' },
          { id: 'PROMO', label: 'Deal', icon: <Tag size={13} />, hint: 'Promotion' },
        ] as const).map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${category === c.id ? 'bg-small-orange text-black' : 'bg-white/5 text-white/50'}`}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <input value={title} onChange={e => setTitle(e.target.value)} maxLength={64} placeholder="Title (e.g. Your order is ready)"
        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/25" />
      <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={280} placeholder="Message…"
        className="w-full h-24 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/25 resize-none" />

      {category === 'PROMO' && (
        <p className="flex items-start gap-1.5 text-[9px] text-amber-300/70 leading-relaxed">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" /> Deals go only to customers who opted into promos. Keep order updates promo-free.
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40">
          <Users size={12} /> {audience == null ? '…' : `${audience} opted in`}
        </span>
        <button onClick={send} disabled={!canSend}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 transition-all">
          {sending ? <Loader2 size={13} className="animate-spin" /> : sentCount != null ? <Check size={13} /> : <Send size={13} />}
          {sending ? 'Sending' : sentCount != null ? `Sent to ${sentCount}` : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default BusinessBroadcastComposer;
