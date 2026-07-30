// StorefrontNowPlaying — the customer-facing in-store live card shown on a business page. The customer
// checks in (opt-in presence); once checked in they see the live "Now playing at {business}" card and
// can TIP the linked artist or BUY the linked product on the spot. Every track heard while checked in
// is snapshotted into the customer's private "music pulse" ("Heard at {business}"), viewable here.

import React, { useEffect, useRef, useState } from 'react';
import {
  checkIn, checkOut, isCheckedIn, subscribeNowPlaying, capturePulse, fetchMyPulse,
  type NowPlayingTrack, type PulseEntry,
} from '../services/storefrontLiveService';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';

async function sendTip(track: NowPlayingTrack, amountDollars: number): Promise<void> {
  const { auth } = await import('../services/firebase');
  const token = await auth.currentUser?.getIdToken();
  if (!token) { alert('Sign in to send a tip'); return; }
  const res = await fetch('/api/stripe/live-tip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      creatorUid: track.artistUid, creatorStripeAccountId: track.artistStripeAccountId,
      amount: Math.round(amountDollars * 100), title: track.title,
    }),
  });
  const data = await res.json();
  if (data.url) window.open(data.url, '_blank');
  else alert(data.error || 'Could not start the tip.');
}

function TrackCard({ track, businessUid, businessName, showPulseBtn, onOpenPulse }: { track: NowPlayingTrack; businessUid: string; businessName: string; showPulseBtn?: boolean; onOpenPulse?: () => void }) {
  const [tipping, setTipping] = useState(false);
  const canTip = !!track.artistUid && !!track.artistStripeAccountId;
  return (
    <div className="rounded-2xl p-[1.5px]" style={{ background: GRAD }}>
      <div className="rounded-2xl bg-[#0a0a0f] p-4">
        <div className="flex items-center gap-3">
          {track.artwork
            ? <img src={track.artwork} alt="" className="w-14 h-14 rounded-xl object-cover" />
            : <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: GRAD }}>♪</div>}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">● Now playing at {businessName}</div>
            <div className="text-base font-black truncate">{track.title}</div>
            <div className="text-xs text-white/60 truncate">{track.artist}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {canTip && (
            <button disabled={tipping} onClick={async () => { setTipping(true); try { await sendTip(track, 5); } finally { setTipping(false); } }}
              className="flex-1 py-2.5 rounded-xl text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-40" style={{ background: GRAD }}>
              {tipping ? '…' : '💜 Tip artist $5'}
            </button>
          )}
          {track.productId && (
            <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_STORE', { detail: { sellerId: businessUid } }))}
              className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase tracking-widest">🛍 Buy</button>
          )}
          {showPulseBtn && (
            <button onClick={onOpenPulse} className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase tracking-widest">Pulse</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StorefrontNowPlaying({ businessUid, businessName, currentUserId }: { businessUid: string; businessName: string; currentUserId?: string }) {
  const [checked, setChecked] = useState(false);
  const [track, setTrack] = useState<NowPlayingTrack | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const [pulse, setPulse] = useState<PulseEntry[]>([]);
  const lastCapturedRef = useRef<string>('');

  useEffect(() => {
    if (!currentUserId) return;
    isCheckedIn(businessUid).then(setChecked);
  }, [businessUid, currentUserId]);

  // Subscribe to the live track only while checked in; snapshot new tracks into the pulse.
  useEffect(() => {
    if (!checked) { setTrack(null); return; }
    const unsub = subscribeNowPlaying(businessUid, t => {
      setTrack(t);
      const key = t ? `${t.title}|${t.artist}|${t.startedAt || ''}` : '';
      if (t && key && key !== lastCapturedRef.current) {
        lastCapturedRef.current = key;
        capturePulse(businessUid, businessName, t);
      }
    });
    return unsub;
  }, [checked, businessUid, businessName]);

  async function toggleCheckIn() {
    if (!currentUserId) { alert('Sign in to check in.'); return; }
    setBusy(true);
    try {
      if (checked) { await checkOut(businessUid); setChecked(false); }
      else { await checkIn(businessUid); setChecked(true); }
    } catch (e: any) { alert(e?.message || 'Could not update check-in.'); }
    finally { setBusy(false); }
  }

  async function openPulse() {
    setShowPulse(true);
    setPulse(await fetchMyPulse(50));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">🎧 In-store</h3>
        <button onClick={toggleCheckIn} disabled={busy}
          className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full ${checked ? 'bg-emerald-500/20 text-emerald-300' : 'text-white'}`}
          style={checked ? undefined : { background: GRAD }}>
          {busy ? '…' : checked ? '✓ Checked in' : 'Check in'}
        </button>
      </div>

      {checked && track && (
        <TrackCard track={track} businessUid={businessUid} businessName={businessName} showPulseBtn onOpenPulse={openPulse} />
      )}
      {checked && !track && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-xs text-white/50">You're checked in. When a song plays in-store, it'll appear here — tip or buy it instantly.</p>
          <button onClick={openPulse} className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white">View your music pulse</button>
        </div>
      )}
      {!checked && (
        <p className="text-xs text-white/40">Check in to see what's playing in-store, tip the artist, and buy tracks you hear.</p>
      )}

      {/* Music pulse — "Heard at …" */}
      {showPulse && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowPulse(false)}>
          <div className="bg-[#0f0f16] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h4 className="text-sm font-black uppercase tracking-widest">Your music pulse</h4>
              <button onClick={() => setShowPulse(false)} className="text-white/50 hover:text-white text-lg leading-none">×</button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {pulse.length === 0 ? (
                <p className="text-xs text-white/40 text-center py-8">Nothing yet. Songs you hear at businesses show up here.</p>
              ) : pulse.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-2.5">
                  {p.artwork
                    ? <img src={p.artwork} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    : <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: GRAD }}>♪</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{p.title}</div>
                    <div className="text-[10px] text-white/40 truncate">{p.artist} · heard at {p.businessName}</div>
                  </div>
                  {p.artistUid && p.artistStripeAccountId && (
                    <button onClick={() => sendTip(p, 5)} className="text-[9px] font-black uppercase px-2.5 py-1.5 rounded-full text-white" style={{ background: GRAD }}>Tip</button>
                  )}
                  {p.productId && (
                    <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_STORE', { detail: { sellerId: p.businessUid } }))} className="text-[9px] font-black uppercase px-2.5 py-1.5 rounded-full bg-white/10">Buy</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
