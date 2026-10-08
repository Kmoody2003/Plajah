// TvReceiverPanel — "Use this TV as a display": D-pad screen for TV Settings or a Live-tab entry.
//
// Shows this TV's display name (rename), the "Available as a display" toggle, the current
// duty/source, joinable parties / Ambo sessions on this account, and a short pairing code + QR a
// phone / Ambo console / switcher can use (?tvPair=CODE → components/tv/TvPairClaimView).
//
// Presented as a full-screen overlay: claims the remote via useTvOverlayClaim('receiver-panel')
// and handles its own keys (window capture phase, one stable listener) — useTvGrid is deaf while
// any overlay is open.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Tv, Radio, Pencil, ToggleLeft, ToggleRight, PartyPopper, RefreshCw, Link2Off, StopCircle } from 'lucide-react';
import {
  subscribeTvReceiver, getTvReceiverState, renameTvDisplay, setAvailableAsDisplay, setOwnTvDuty,
  releaseTvDuty, ensureTvPairingCode, unpairTv, fetchJoinableSessions, tvPairUrl,
  type TvReceiverState, type JoinableSession,
} from '../../services/tv/tvReceiverService';
import { useTvOverlayClaim, isTopTvOverlay } from '../../hooks/useTvOverlay';
import { tvAutostart, isTvAutostartSupported, TV_AUTOSTART_ADB_COMMAND } from '../../services/tv/tvAutostartBridge';

const OVERLAY_ID = 'receiver-panel';

const DUTY_LABEL: Record<string, string> = {
  STANDBY: 'Standby — not receiving',
  AMBO_PROGRAM: 'Ambo program out', AMBO_STAGE: 'Ambo stage display', AMBO_PRESENTATION: 'Ambo presentation',
  CHORA_PLAYLIST: 'Chora playlist', REELLO_VIDEO: 'Reello video', AMBIENT_SIGNAGE: 'Digital signage',
  PROGRAM_FEED: 'Switcher program feed', PARTY_DISPLAY: 'Party display',
};

type Item =
  | { id: 'rename' } | { id: 'available' } | { id: 'stop' }
  | { id: 'session'; s: JoinableSession } | { id: 'refresh' } | { id: 'unpair' } | { id: 'autostart' };

const kcOf = (e: KeyboardEvent) => e.keyCode || e.which;
const isBack = (e: KeyboardEvent) => { const kc = kcOf(e); return kc === 4 || kc === 27 || e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'XF86Back' || (e.key === 'Backspace' && !isField(e.target as HTMLElement)); };
const isOk = (e: KeyboardEvent) => { const kc = kcOf(e); return e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23 || kc === 66; };
const isUp = (e: KeyboardEvent) => { const kc = kcOf(e); return e.key === 'ArrowUp' || kc === 38 || kc === 19; };
const isDown = (e: KeyboardEvent) => { const kc = kcOf(e); return e.key === 'ArrowDown' || kc === 40 || kc === 20; };
const isSide = (e: KeyboardEvent) => { const kc = kcOf(e); return e.key === 'ArrowLeft' || e.key === 'ArrowRight' || kc === 37 || kc === 39 || kc === 21 || kc === 22; };
const isField = (el: HTMLElement | null) => !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));

const TvReceiverPanel: React.FC<{ onClose: () => void; open?: boolean }> = ({ onClose, open = true }) => {
  const [st, setSt] = useState<TvReceiverState>(getTvReceiverState());
  const [sessions, setSessions] = useState<JoinableSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [qr, setQr] = useState<string>('');
  const [focus, setFocus] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useTvOverlayClaim(OVERLAY_ID, open);
  useEffect(() => subscribeTvReceiver(setSt), []);

  // Start on power-up (signage): the native BootReceiver relaunches the app after a power cut.
  // Android only lets it through with "Display over other apps"; TVs often hide that screen, so the
  // installer adb command is shown when it can't be granted from here.
  const autostartSupported = isTvAutostartSupported();
  const [autostart, setAutostart] = useState(false);
  const [autostartGranted, setAutostartGranted] = useState(true);
  useEffect(() => {
    if (!autostartSupported) return;
    void tvAutostart.isEnabled().then(setAutostart);
    void tvAutostart.canAutostart().then(setAutostartGranted);
  }, [autostartSupported]);
  const toggleAutostart = useCallback(async () => {
    const next = !(await tvAutostart.isEnabled());
    setAutostart(await tvAutostart.setEnabled(next));
    if (next && !(await tvAutostart.canAutostart())) {
      const r = await tvAutostart.requestPermission();
      setAutostartGranted(r.granted);
    } else {
      setAutostartGranted(await tvAutostart.canAutostart());
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try { setSessions(await fetchJoinableSessions()); } finally { setLoadingSessions(false); }
  }, []);
  useEffect(() => { if (st.signedIn) void loadSessions(); }, [st.signedIn, loadSessions]);

  // Pairing code: mint/reuse when signed in, refresh before expiry.
  useEffect(() => {
    if (!st.signedIn || !st.available) return;
    void ensureTvPairingCode();
    const t = window.setInterval(() => { void ensureTvPairingCode(); }, 60_000);
    return () => window.clearInterval(t);
  }, [st.signedIn, st.available]);

  useEffect(() => {
    const code = st.pairing?.code;
    if (!code) { setQr(''); return; }
    let alive = true;
    QRCode.toDataURL(tvPairUrl(code), { width: 360, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then(u => { if (alive) setQr(u); }).catch(() => {});
    return () => { alive = false; };
  }, [st.pairing?.code]);

  const items: Item[] = [
    { id: 'rename' }, { id: 'available' },
    ...(autostartSupported ? [{ id: 'autostart' } as Item] : []),
    ...(st.duty.dutyType !== 'STANDBY' ? [{ id: 'stop' } as Item] : []),
    ...sessions.map(s => ({ id: 'session' as const, s })),
    { id: 'refresh' },
    ...(st.claimedCode ? [{ id: 'unpair' } as Item] : []),
  ];
  const clamped = Math.min(focus, items.length - 1);

  // Keep the focused row on screen.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${clamped}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [clamped]);

  const activate = useCallback((it: Item) => {
    switch (it.id) {
      case 'rename': setDraft(getTvReceiverState().deviceName); setRenaming(true); setTimeout(() => inputRef.current?.focus(), 30); break;
      case 'available': void setAvailableAsDisplay(!getTvReceiverState().available); break;
      case 'stop': void releaseTvDuty(); break;
      case 'session': void setOwnTvDuty(it.s.duty, { slaved: !!it.s.slaved }); break;
      case 'refresh': void loadSessions(); void ensureTvPairingCode(); break;
      case 'unpair': void unpairTv(); break;
      case 'autostart': void toggleAutostart(); break;
    }
  }, [loadSessions]);

  const commitRename = useCallback(() => {
    renameTvDisplay(inputRef.current?.value || '');
    setRenaming(false);
  }, []);

  // One stable capture-phase listener; everything read through refs.
  const r = useRef({ items, focus: clamped, renaming, activate, commitRename, onClose, open });
  r.current = { items, focus: clamped, renaming, activate, commitRename, onClose, open };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = r.current;
      if (!c.open || !isTopTvOverlay(OVERLAY_ID)) return;
      const kc = kcOf(e);
      if (kc === 24 || kc === 25 || kc === 164) return;   // volume
      if (c.renaming) {
        // The text field owns typing; only Enter / Back are ours.
        if (isOk(e)) { e.preventDefault(); e.stopImmediatePropagation(); c.commitRename(); }
        else if (isBack(e) || kc === 4) { e.preventDefault(); e.stopImmediatePropagation(); setRenaming(false); }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isUp(e)) setFocus(Math.max(0, c.focus - 1));
      else if (isDown(e)) setFocus(Math.min(c.items.length - 1, c.focus + 1));
      else if (isOk(e)) { const it = c.items[c.focus]; if (it) c.activate(it); }
      else if (isSide(e) && c.items[c.focus]?.id === 'available') c.activate(c.items[c.focus]);
      else if (isBack(e)) c.onClose();
    };
    const onHwBack = (e: Event) => {
      const c = r.current;
      if (!c.open || !isTopTvOverlay(OVERLAY_ID)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (c.renaming) setRenaming(false); else c.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('plajah:hardware-back', onHwBack);
    };
  }, []);

  if (!open || typeof document === 'undefined') return null;

  const row = (i: number, icon: React.ReactNode, title: React.ReactNode, sub?: React.ReactNode) => (
    <div key={i} data-row={i}
      className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all ${clamped === i ? 'bg-white text-black border-white scale-[1.01]' : 'bg-white/[0.04] text-white border-white/10'}`}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold truncate">{title}</div>
        {sub && <div className={`text-sm truncate ${clamped === i ? 'text-black/60' : 'text-white/50'}`}>{sub}</div>}
      </div>
    </div>
  );

  const pairingMinutes = st.pairing ? Math.max(0, Math.round((st.pairing.expiresAt - Date.now()) / 60_000)) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[440] bg-[#08080c] text-white flex" data-tv-capture data-tv-no-trap role="dialog" aria-modal="true">
      {/* Left: settings + sessions */}
      <div className="flex-1 min-w-0 flex flex-col px-14 py-12">
        <div className="flex items-center gap-3 mb-2">
          <Tv size={28} className="text-[#00DAF3]" />
          <h1 className="text-3xl font-black tracking-tight">Use this TV as a display</h1>
        </div>
        <p className="text-white/50 mb-8 max-w-2xl">
          Ambo, the Video Switcher, parties and signage can send to this TV.
          Current: <span className="text-white font-semibold">{DUTY_LABEL[st.duty.dutyType] || st.duty.title}</span>
          {st.duty.dutyType !== 'STANDBY' && <> · from {st.sourceLabel}</>}
        </p>

        {!st.signedIn ? (
          <div className="text-white/60 text-lg">Sign in on this TV to make it available as a display.</div>
        ) : (
          <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
            {items.map((it, i) => {
              switch (it.id) {
                case 'rename':
                  return renaming ? (
                    <div key={i} data-row={i} className="px-5 py-4 rounded-2xl border-2 border-white bg-white/[0.06]">
                      <div className="text-sm text-white/50 mb-2">Display name — press OK to save, Back to cancel</div>
                      <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} maxLength={40}
                        className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-xl outline-none" />
                    </div>
                  ) : row(i, <Pencil size={22} />, st.deviceName, 'Display name · OK to rename');
                case 'available':
                  return row(i, st.available ? <ToggleRight size={26} className="text-emerald-500" /> : <ToggleLeft size={26} />,
                    'Available as a display', st.available ? 'On — shows up in Ambo and the switcher' : 'Off — hidden from controllers');
                case 'stop':
                  return row(i, <StopCircle size={22} className="text-red-500" />, 'Stop receiving', `Now showing ${DUTY_LABEL[st.duty.dutyType] || st.duty.title}`);
                case 'session':
                  return row(i, it.s.kind === 'PARTY' ? <PartyPopper size={22} /> : <Radio size={22} />, `Join: ${it.s.title}`, it.s.subtitle);
                case 'refresh':
                  return row(i, <RefreshCw size={22} className={loadingSessions ? 'animate-spin' : ''} />,
                    sessions.length ? 'Refresh sessions' : 'No active parties or Ambo sessions — refresh', 'Parties you host and your Ambo event appear here');
                case 'unpair':
                  return row(i, <Link2Off size={22} />, 'Unpair controller', `Paired by code ${st.claimedCode}`);
                case 'autostart':
                  return row(i, autostart ? <ToggleRight size={26} className="text-emerald-500" /> : <ToggleLeft size={26} />,
                    'Start on power-up',
                    !autostart ? 'Off — for signage, turn on so the TV comes back after a power cut'
                      : autostartGranted ? 'On — Plajah opens by itself when the TV powers on'
                      : `On, but Android needs permission. Installer: ${TV_AUTOSTART_ADB_COMMAND}`);
              }
            })}
          </div>
        )}
      </div>

      {/* Right: pairing */}
      <div className="w-[440px] shrink-0 border-l border-white/10 flex flex-col items-center justify-center px-10 text-center">
        <div className="text-sm font-black uppercase tracking-[0.25em] text-white/40 mb-4">Pair a phone or console</div>
        {st.signedIn && st.available && st.pairing ? (
          <>
            {qr ? <img src={qr} alt="" className="w-[260px] h-[260px] rounded-2xl bg-white p-2" /> : <div className="w-[260px] h-[260px] rounded-2xl bg-white/5" />}
            <div className="mt-6 text-5xl font-black tracking-[0.2em] font-mono">{st.pairing.code}</div>
            <div className="mt-3 text-white/50 text-sm">Scan, or enter the code in Ambo / the Video Switcher → Send to TV. Expires in {pairingMinutes} min.</div>
          </>
        ) : (
          <div className="text-white/40">{!st.signedIn ? 'Sign in to pair.' : !st.available ? 'Turn on "Available as a display" to pair.' : 'Getting a code…'}</div>
        )}
        <div className="mt-10 text-white/30 text-sm">Back to close</div>
      </div>
    </div>,
    document.body,
  );
};

export default TvReceiverPanel;
