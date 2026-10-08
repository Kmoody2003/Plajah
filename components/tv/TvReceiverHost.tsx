// TvReceiverHost — turns the TV into an output when Ambo, the switcher, a party, or a signage
// controller assigns it a duty. Mounted ALWAYS on TV (App level); renders nothing in STANDBY.
//
// While a duty is active it takes over the whole screen above the TV shell, claims the remote via
// useTvOverlayClaim('receiver'), and shows a small corner badge "Receiving from <source>".
// Remote Back opens a D-pad confirm "Stop receiving?" → releases this TV to STANDBY.
//
// Keys: ONE window capture-phase listener registered at mount and never re-bound (state is read
// through refs), so its registration order is stable. Native TV builds dispatch synthetic
// KeyboardEvents with keyCode 0, so e.key AND keyCodes are both matched. Hardware Back also
// arrives as the cancelable `plajah:hardware-back` window event (hooks/useHardwareBack).

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radio } from 'lucide-react';
import {
  subscribeTvReceiver, getTvReceiverState, releaseTvDuty, isTvReceiverPlatform,
  type TvReceiverState,
} from '../../services/tv/tvReceiverService';
import { useTvOverlayClaim, isTopTvOverlay } from '../../hooks/useTvOverlay';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';

const AmboPartyEventReceiver = lazy(() => import('../scripture/AmboPartyEventReceiver'));
const TvProgramFeed = lazy(() => import('./TvReceiverSurfaces').then(m => ({ default: m.TvProgramFeed })));
const TvPartyDisplay = lazy(() => import('./TvReceiverSurfaces').then(m => ({ default: m.TvPartyDisplay })));
const TvSignage = lazy(() => import('./TvReceiverSurfaces').then(m => ({ default: m.TvSignage })));

const OVERLAY_ID = 'receiver';
const BADGE_MS = 7000;

const isBack = (e: KeyboardEvent) => {
  const kc = e.keyCode || e.which;
  return kc === 4 || kc === 27 || kc === 8 || e.key === 'Backspace' || e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'XF86Back';
};
const isOk = (e: KeyboardEvent) => { const kc = e.keyCode || e.which; return e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23 || kc === 66; };
const isArrow = (e: KeyboardEvent) => {
  const kc = e.keyCode || e.which;
  return /^Arrow/.test(e.key) || kc === 37 || kc === 38 || kc === 39 || kc === 40 || kc === 19 || kc === 20 || kc === 21 || kc === 22;
};
const isSystemKey = (e: KeyboardEvent) => {
  const kc = e.keyCode || e.which;
  return kc === 24 || kc === 25 || kc === 26 || kc === 164 || e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown' || e.key === 'AudioVolumeMute' || e.key === 'Power';
};

export const isReceiving = (s: TvReceiverState) =>
  s.active && s.available && (s.followingMaster || s.duty.dutyType !== 'STANDBY');

const TvReceiverHost: React.FC = () => {
  const [st, setSt] = useState<TvReceiverState>(getTvReceiverState());
  const [confirm, setConfirm] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState(0);   // 0 = Keep receiving, 1 = Stop
  const [badge, setBadge] = useState(true);
  const badgeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isTvReceiverPlatform()) return;
    return subscribeTvReceiver(setSt);
  }, []);

  const receiving = isReceiving(st);
  useTvOverlayClaim(OVERLAY_ID, receiving);

  // Hand the speakers over too: whatever Chora was playing on this TV pauses when a duty takes the
  // screen (the receiver brings its own sound), and resumes when the TV is released — but only if
  // it was this takeover that paused it.
  const { isPlaying, pause, togglePlay } = useGlobalPlayer();
  const playerRef = useRef({ isPlaying, pause, togglePlay });
  playerRef.current = { isPlaying, pause, togglePlay };
  const pausedByReceiverRef = useRef(false);
  useEffect(() => {
    const p = playerRef.current;
    if (receiving) {
      if (p.isPlaying) { pausedByReceiverRef.current = true; p.pause(); }
    } else if (pausedByReceiverRef.current) {
      pausedByReceiverRef.current = false;
      if (!p.isPlaying) p.togglePlay();
    }
  }, [receiving]);

  const wakeBadge = useCallback(() => {
    setBadge(true);
    if (badgeTimer.current) window.clearTimeout(badgeTimer.current);
    badgeTimer.current = window.setTimeout(() => setBadge(false), BADGE_MS);
  }, []);

  // New duty → show the badge again and drop any stale confirm.
  const dutyKey = `${st.duty.dutyType}|${st.duty.sourceData?.streamId || ''}|${st.duty.sourceData?.partyId || ''}|${st.followingMaster}`;
  useEffect(() => { if (receiving) { setConfirm(false); wakeBadge(); } }, [dutyKey, receiving, wakeBadge]);
  useEffect(() => () => { if (badgeTimer.current) window.clearTimeout(badgeTimer.current); }, []);

  // Stable refs for the one-time listeners.
  const receivingRef = useRef(receiving); receivingRef.current = receiving;
  const confirmRef = useRef(confirm); confirmRef.current = confirm;
  const confirmIdxRef = useRef(confirmIdx); confirmIdxRef.current = confirmIdx;
  const wakeRef = useRef(wakeBadge); wakeRef.current = wakeBadge;

  useEffect(() => {
    const openConfirm = () => { setConfirmIdx(0); setConfirm(true); };
    const onKey = (e: KeyboardEvent) => {
      if (!receivingRef.current || !isTopTvOverlay(OVERLAY_ID)) return;
      if (isSystemKey(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type !== 'keydown') return;
      if (confirmRef.current) {
        if (isBack(e)) { setConfirm(false); return; }
        if (isArrow(e)) { setConfirmIdx(i => (i === 0 ? 1 : 0)); return; }
        if (isOk(e)) {
          setConfirm(false);
          if (confirmIdxRef.current === 1) void releaseTvDuty();
        }
        return;
      }
      if (isBack(e)) { openConfirm(); return; }
      wakeRef.current();
    };
    const onHwBack = (e: Event) => {
      if (!receivingRef.current || !isTopTvOverlay(OVERLAY_ID)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (confirmRef.current) setConfirm(false); else openConfirm();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('plajah:hardware-back', onHwBack);
    };
  }, []);

  if (!receiving || typeof document === 'undefined') return null;

  const d = st.duty;
  let body: React.ReactNode;
  if (!st.followingMaster && d.dutyType === 'PROGRAM_FEED' && d.sourceData?.streamId) {
    body = <TvProgramFeed streamId={d.sourceData.streamId} deviceId={st.deviceId} />;
  } else if (!st.followingMaster && d.dutyType === 'PARTY_DISPLAY' && d.sourceData?.partyId) {
    body = <TvPartyDisplay partyId={d.sourceData.partyId} />;
  } else if (!st.followingMaster && d.dutyType === 'AMBIENT_SIGNAGE') {
    body = <TvSignage duty={d} />;
  } else {
    // Ambo program / stage / presentation, Chora playlist, Reello video, master-sync follow.
    body = <AmboPartyEventReceiver />;
  }

  return createPortal(
    <div className="fixed inset-0 z-[450] bg-black text-white overflow-hidden" data-tv-capture data-tv-no-trap data-tv-receiver>
      <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-white/30 text-xs font-black uppercase tracking-widest">Connecting…</div>}>
        {body}
      </Suspense>

      {/* Corner badge — visible on arrival and on any key press, then fades away. */}
      <div className={`absolute top-6 right-8 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/55 border border-white/10 text-[13px] font-semibold text-white/80 transition-opacity duration-700 pointer-events-none ${badge || confirm ? 'opacity-100' : 'opacity-0'}`}>
        <Radio size={14} className="text-emerald-400" />
        <span>Receiving from {st.sourceLabel}</span>
      </div>

      {confirm && (
        <div className="absolute inset-0 grid place-items-center bg-black/70" role="dialog" aria-modal="true">
          <div className="rounded-3xl bg-[#121218] border border-white/15 px-10 py-8 text-center min-w-[420px]">
            <div className="text-2xl font-black">Stop receiving?</div>
            <div className="text-white/50 mt-2">{st.deviceName} will stop showing {st.sourceLabel}.</div>
            <div className="mt-7 flex gap-4 justify-center">
              {['Keep receiving', 'Stop'].map((label, i) => (
                <div key={label}
                  className={`px-6 py-3 rounded-xl text-lg font-bold border-2 transition-all ${confirmIdx === i ? 'bg-white text-black border-white scale-105' : 'bg-white/5 text-white/70 border-white/10'}`}>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

export default TvReceiverHost;
