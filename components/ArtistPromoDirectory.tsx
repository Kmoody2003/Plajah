import React, { useEffect, useState } from 'react';
import { Radio, Tv, Megaphone, User, Loader2, Check, Search, Clock } from 'lucide-react';
import type { UserProfile, PromoBooking } from '../types';
import {
  fetchPromoArtists, rateFor, requestPromoBooking, fetchBusinessPromoRequests,
  PROMO_LABEL, type PromoKind,
} from '../services/promoBookingService';

/**
 * Business-facing artist directory for cross-promo — browse creators who accept promo bookings, see
 * the rate THEY set for a radio commercial, a FAST-channel spot, or a cross-promotion, and book it.
 * The creator accepts/declines from their inbox.
 */
const KIND_ICON: Record<PromoKind, React.ReactNode> = { RADIO_AD: <Radio size={12} />, FAST_AD: <Tv size={12} />, CROSS_PROMO: <Megaphone size={12} /> };

const ArtistPromoDirectory: React.FC<{ business: { uid: string; name: string } }> = ({ business }) => {
  const [artists, setArtists] = useState<UserProfile[]>([]);
  const [sent, setSent] = useState<PromoBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [a, s] = await Promise.all([fetchPromoArtists(q.trim() || ' '), fetchBusinessPromoRequests(business.uid)]);
    setArtists(a); setSent(s); setLoading(false);
  };
  useEffect(() => { load(); }, [business.uid]);

  const sentKey = (creatorUid: string, kind: PromoKind) => `${creatorUid}:${kind}`;
  const already = new Set(sent.filter(s => s.status !== 'DECLINED').map(s => sentKey(s.creatorUid, s.kind)));

  const request = async (artist: UserProfile, kind: PromoKind) => {
    const rate = rateFor(artist, kind);
    if (rate <= 0 || busyKey) return;
    const key = sentKey(artist.uid, kind);
    setBusyKey(key);
    try {
      await requestPromoBooking(business, { uid: artist.uid, name: artist.displayName }, kind, rate);
      setSent(s => [{ id: `tmp_${Date.now()}`, businessUid: business.uid, businessName: business.name, creatorUid: artist.uid, creatorName: artist.displayName, kind, rate, status: 'PENDING', createdAt: Date.now() }, ...s]);
    } catch { /* */ } finally { setBusyKey(null); }
  };

  return (
    <div className="space-y-4 text-white">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5"><Megaphone size={13} className="text-small-orange" /> Book artist promo</p>
        <p className="text-[10px] text-white/35 mt-1">Put a creator's commercial on your in-store radio/FAST, or cross-promote — at the rate they set.</p>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} placeholder="Search artists…" className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-3 py-2 text-sm outline-none" />
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/40" /></div>
      ) : artists.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-10">No artists are accepting promo bookings yet.</p>
      ) : (
        <div className="space-y-2">
          {artists.map(a => (
            <div key={a.uid} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0">
                  {a.photoURL ? <img src={a.photoURL} className="w-full h-full object-cover" alt="" /> : <User size={16} className="m-2.5 text-white/30" />}
                </div>
                <p className="text-sm font-black truncate flex-1">{a.displayName}</p>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {(['RADIO_AD', 'FAST_AD', 'CROSS_PROMO'] as PromoKind[]).map(kind => {
                  const rate = rateFor(a, kind);
                  if (rate <= 0) return null;
                  const done = already.has(sentKey(a.uid, kind));
                  return (
                    <button key={kind} onClick={() => request(a, kind)} disabled={done || busyKey === sentKey(a.uid, kind)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${done ? 'bg-green-500/15 text-green-300' : 'bg-white/8 hover:bg-white/15 text-white'}`}>
                      {busyKey === sentKey(a.uid, kind) ? <Loader2 size={11} className="animate-spin" /> : done ? <Check size={11} /> : KIND_ICON[kind]}
                      {PROMO_LABEL[kind]} · ${rate}{done ? ' · requested' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div className="pt-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Your requests</p>
          <div className="space-y-1.5">
            {sent.map(s => (
              <div key={s.id} className="flex items-center justify-between text-[11px] bg-white/[0.03] rounded-xl px-3 py-2">
                <span className="text-white/70 truncate">{PROMO_LABEL[s.kind]} · {s.creatorName} · ${s.rate}</span>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${s.status === 'ACCEPTED' ? 'bg-green-500/20 text-green-300' : s.status === 'DECLINED' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/50'}`}>{s.status === 'PENDING' ? <Clock size={9} className="inline" /> : null} {s.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtistPromoDirectory;
