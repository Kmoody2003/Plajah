// DisplayModeLauncher — turns any spare screen (tablet, TV, monitor) into a purpose-built in-store
// display. One launcher, several modes: Now Playing (jukebox screen), Menu board, Signage slideshow,
// Kiosk (self-order), and Register (POS). Pick a mode → it goes full-screen; a corner control returns
// to the picker so a device can be repurposed on the fly.

import React, { useEffect, useRef, useState } from 'react';
import type { BusinessMenuItem, DigitalSignageSlide } from '../types';
import { fetchSignageSlides } from '../services/businessService';
import { subscribeNowPlaying, type NowPlayingTrack } from '../services/storefrontLiveService';
import StoreKioskMode from './StoreKioskMode';
import PosRegister from './PosRegister';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
type Mode = 'PICKER' | 'NOW_PLAYING' | 'MENU' | 'SIGNAGE' | 'KIOSK' | 'REGISTER';

interface Props { businessUid: string; businessName: string; pageId?: string; menuItems?: BusinessMenuItem[]; onExit: () => void; }

// ── Now Playing display (customer-facing jukebox screen) ───────────────────────
function NowPlayingDisplay({ businessUid, businessName }: { businessUid: string; businessName: string }) {
  const [track, setTrack] = useState<NowPlayingTrack | null>(null);
  useEffect(() => subscribeNowPlaying(businessUid, setTrack), [businessUid]);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center">
      {track ? (
        <>
          {track.artwork
            ? <img src={track.artwork} alt="" className="w-72 h-72 md:w-96 md:h-96 rounded-3xl object-cover shadow-2xl" />
            : <div className="w-72 h-72 md:w-96 md:h-96 rounded-3xl flex items-center justify-center text-[8rem]" style={{ background: GRAD }}>♪</div>}
          <div className="mt-8 text-sm font-black uppercase tracking-[0.3em] text-emerald-400">● Now playing at {businessName}</div>
          <div className="mt-3 text-5xl md:text-7xl font-black tracking-tight">{track.title}</div>
          <div className="mt-3 text-2xl md:text-3xl text-white/60">{track.artist}</div>
          {track.artistUid && <div className="mt-8 text-lg text-white/50">Open Plajah & check in to tip the artist 💜</div>}
        </>
      ) : (
        <div className="text-white/40 text-2xl font-bold">Nothing playing right now.</div>
      )}
    </div>
  );
}

// ── Menu board ─────────────────────────────────────────────────────────────────
function MenuBoard({ businessName, menuItems }: { businessName: string; menuItems: BusinessMenuItem[] }) {
  const available = menuItems.filter(m => m.isAvailable !== false);
  const cats = Array.from(new Set(available.map(m => m.category || 'Menu')));
  return (
    <div className="w-full h-full overflow-y-auto p-10">
      <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic mb-8">{businessName}</h1>
      {available.length === 0 ? (
        <p className="text-white/40 text-xl">No menu items yet — add them on your business page.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
          {cats.map(cat => (
            <div key={cat}>
              <h2 className="text-lg font-black uppercase tracking-widest mb-3" style={{ color: '#FF8C00' }}>{cat}</h2>
              <div className="space-y-3">
                {available.filter(m => (m.category || 'Menu') === cat).map(m => (
                  <div key={m.id} className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold">{m.name}</span>
                    <span className="flex-1 border-b border-dashed border-white/15 translate-y-[-4px]" />
                    <span className="text-2xl font-black">${Number(m.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Signage slideshow ────────────────────────────────────────────────────────
// Slides are keyed by the business PAGE id (not the owner uid), matching how the dashboard saves them.
function SignageDisplay({ pageId }: { pageId: string }) {
  const [slides, setSlides] = useState<DigitalSignageSlide[]>([]);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pageId) { setSlides([]); return; }
    fetchSignageSlides(pageId).then(s => setSlides(s.filter(x => x.isActive))).catch(() => setSlides([]));
  }, [pageId]);

  useEffect(() => {
    if (slides.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIdx(i => (i + 1) % slides.length), (slides[idx]?.durationSeconds || 8) * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [slides, idx]);

  if (slides.length === 0) return <div className="w-full h-full flex items-center justify-center text-white/40 text-2xl font-bold">No signage slides yet.</div>;
  const s = slides[idx];
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: s.backgroundColor || '#000' }}>
      {s.type === 'IMAGE' && s.url && <img src={s.url} alt="" className="w-full h-full object-contain" />}
      {s.type === 'VIDEO' && s.url && <video src={s.url} autoPlay muted loop className="w-full h-full object-contain" />}
      {(s.type === 'TEXT' || s.type === 'PROMO' || !s.url) && (
        <div className="text-center p-12">
          {s.type === 'PROMO' && <div className="text-sm font-black uppercase tracking-[0.3em] mb-4" style={{ color: '#FF8C00' }}>Special offer</div>}
          <div className="text-6xl md:text-8xl font-black tracking-tight">{s.headline}</div>
          {s.subtext && <div className="mt-6 text-2xl md:text-4xl text-white/70">{s.subtext}</div>}
        </div>
      )}
    </div>
  );
}

export default function DisplayModeLauncher({ businessUid, businessName, pageId, menuItems = [], onExit }: Props) {
  const [mode, setMode] = useState<Mode>('PICKER');

  // Kiosk & Register render their own full-screen overlays; return to the picker on exit.
  if (mode === 'KIOSK') return <StoreKioskMode businessUid={businessUid} businessName={businessName} onExit={() => setMode('PICKER')} />;
  if (mode === 'REGISTER') return <PosRegister businessUid={businessUid} businessName={businessName} onExit={() => setMode('PICKER')} />;

  const tiles: { id: Mode; label: string; icon: string; desc: string }[] = [
    { id: 'NOW_PLAYING', label: 'Now Playing', icon: '♪', desc: 'Jukebox screen of the current in-store track' },
    { id: 'MENU', label: 'Menu Board', icon: '🍽', desc: 'Your menu, big and legible' },
    { id: 'SIGNAGE', label: 'Signage', icon: '📺', desc: 'Rotating promos & announcements' },
    { id: 'KIOSK', label: 'Self-Order Kiosk', icon: '🛒', desc: 'Customers order & pay themselves' },
    { id: 'REGISTER', label: 'Register (POS)', icon: '💳', desc: 'Staff ring up sales' },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0f] text-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white" style={{ background: GRAD }}>
            {mode === 'PICKER' ? 'Displays' : tiles.find(t => t.id === mode)?.label}
          </span>
          <span className="text-sm font-bold truncate max-w-[40vw]">{businessName}</span>
        </div>
        {mode === 'PICKER'
          ? <button onClick={onExit} className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-white/10 hover:bg-white/20">Close</button>
          : <button onClick={() => setMode('PICKER')} className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-white/10 hover:bg-white/20">← Modes</button>}
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'PICKER' && (
          <div className="h-full overflow-y-auto p-6">
            <p className="text-white/50 text-sm mb-6 max-w-xl">Point a spare tablet, TV, or monitor at this page and pick a mode. Switch anytime — a device can be a menu board one hour and a kiosk the next.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
              {tiles.map(t => (
                <button key={t.id} onClick={() => setMode(t.id)}
                  className="text-left rounded-2xl border border-white/10 hover:border-white/30 bg-white/[0.03] p-5 transition active:scale-[0.98]">
                  <div className="text-4xl mb-3">{t.icon}</div>
                  <div className="text-sm font-black uppercase tracking-widest">{t.label}</div>
                  <div className="text-[11px] text-white/40 mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === 'NOW_PLAYING' && <NowPlayingDisplay businessUid={businessUid} businessName={businessName} />}
        {mode === 'MENU' && <MenuBoard businessName={businessName} menuItems={menuItems} />}
        {mode === 'SIGNAGE' && <SignageDisplay pageId={pageId || ''} />}
      </div>
    </div>
  );
}
