// NowPlayingPublisher — business-side control (Radio tab) to broadcast the current in-store track to
// checked-in customers' phones. Publishing writes businesses/{b}/nowPlaying/current; customers on the
// business page then see a live "Now playing" card with Tip (to the linked artist) + Buy. Also shows a
// live count of who's currently checked in.

import React, { useEffect, useState } from 'react';
import type { UserProfile, StoreProduct } from '../types';
import { searchUsers } from '../services/backendService';
import { fetchProductsBySeller } from '../services/storeService';
import {
  publishNowPlaying, clearNowPlaying, fetchNowPlaying, subscribePresence,
  type NowPlayingTrack, type PresenceEntry,
} from '../services/storefrontLiveService';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';

export default function NowPlayingPublisher({ businessUid, businessName }: { businessUid: string; businessName: string }) {
  const [current, setCurrent] = useState<NowPlayingTrack | null>(null);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [artwork, setArtwork] = useState('');
  const [linkedArtist, setLinkedArtist] = useState<UserProfile | null>(null);
  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<UserProfile[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchNowPlaying(businessUid).then(setCurrent);
    fetchProductsBySeller(businessUid).then(ps => setProducts(ps.filter(p => p.isActive !== false))).catch(() => {});
    const unsub = subscribePresence(businessUid, setPresence);
    return unsub;
  }, [businessUid]);

  useEffect(() => {
    if (artistQuery.trim().length < 2) { setArtistResults([]); return; }
    const t = setTimeout(async () => {
      const res = await searchUsers(artistQuery).catch(() => [] as UserProfile[]);
      setArtistResults((res || []).slice(0, 5));
    }, 300);
    return () => clearTimeout(t);
  }, [artistQuery]);

  function linkArtist(u: UserProfile) {
    setLinkedArtist(u); setArtistResults([]); setArtistQuery('');
    if (!artist) setArtist(u.displayName || (u as any).username || '');
  }

  async function publish() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const track: NowPlayingTrack = {
      title: title.trim(),
      artist: artist.trim(),
      artwork: artwork.trim() || undefined,
      artistUid: linkedArtist?.uid,
      artistStripeAccountId: (linkedArtist as any)?.stripeConnectAccountId || undefined,
      productId: productId || undefined,
      startedAt: Date.now(),
    };
    await publishNowPlaying(businessUid, track);
    setCurrent(track);
    setBusy(false);
  }
  async function stop() {
    setBusy(true);
    await clearNowPlaying(businessUid);
    setCurrent(null);
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest">Now Playing broadcast</h3>
        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300">
          {presence.length} checked in
        </span>
      </div>

      {current ? (
        <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 mb-3">
          {current.artwork
            ? <img src={current.artwork} alt="" className="w-12 h-12 rounded-lg object-cover" />
            : <div className="w-12 h-12 rounded-lg flex items-center justify-center text-lg" style={{ background: GRAD }}>♪</div>}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">● Live in-store</div>
            <div className="text-sm font-bold truncate">{current.title}</div>
            <div className="text-xs text-white/50 truncate">{current.artist}{current.artistUid ? ' · tip enabled' : ''}</div>
          </div>
          <button onClick={stop} disabled={busy} className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-full bg-white/10 hover:bg-white/20">Stop</button>
        </div>
      ) : (
        <p className="text-xs text-white/40 mb-3">Nothing is broadcasting. Publish the current track so checked-in customers can tip & buy it.</p>
      )}

      {/* Publisher */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Track title" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-white/30" />
          <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-white/30" />
        </div>
        <input value={artwork} onChange={e => setArtwork(e.target.value)} placeholder="Artwork URL (optional)" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-white/30" />

        {/* Link Plajah artist → enables Tip */}
        {linkedArtist ? (
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-xs">
            <span className="truncate">🎤 {linkedArtist.displayName || (linkedArtist as any).username}{(linkedArtist as any).stripeConnectAccountId ? '' : ' — no payouts set (tip disabled)'}</span>
            <button onClick={() => setLinkedArtist(null)} className="text-[10px] font-bold uppercase text-white/50 hover:text-white">Unlink</button>
          </div>
        ) : (
          <div className="relative">
            <input value={artistQuery} onChange={e => setArtistQuery(e.target.value)} placeholder="Link Plajah artist (for tips)…" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-white/30" />
            {artistResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-[#15151d] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                {artistResults.map(u => (
                  <button key={u.uid} onClick={() => linkArtist(u)} className="w-full text-left px-3 py-2 hover:bg-white/10 text-xs flex items-center gap-2">
                    {u.photoURL && <img src={u.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />}
                    <span className="truncate">{u.displayName || (u as any).username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Link a store product → enables Buy */}
        {products.length > 0 && (
          <select value={productId} onChange={e => setProductId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none">
            <option value="">Link a product for “Buy” (optional)</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.title} — ${p.price}</option>)}
          </select>
        )}

        <button onClick={publish} disabled={!title.trim() || busy} className="w-full py-2.5 rounded-xl text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-30" style={{ background: GRAD }}>
          {busy ? '…' : current ? 'Update broadcast' : 'Go live in-store'}
        </button>
      </div>
    </div>
  );
}
