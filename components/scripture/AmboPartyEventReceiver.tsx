// AmboPartyEventReceiver.tsx — Dedicated Visual & Audio Output Display Receiver
//
// Any web browser or device signed in to the user account can open or run this receiver
// (e.g. via ?partyDisplay=1 or ?partyEvent=1, or full-screen from within the app).
//
// Modes:
//   1. Master Sync (Slaved):
//      Takes and follows the Master Ambo presentation, live program wire, Chora DJ track, or video.
//   2. Independent Duty (When Sync is Muted / Released):
//      Automatically returns to the device's assigned duty:
//        · Chora music playlist / album / ambient playback with local audio & visualizer
//        · Reello video player with seamless loop
//        · Presentation / Show playback
//        · Stage foldback confidence monitor (speaker notes, timers, wall clock)
//        · Ambient digital signage / party welcome display

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Volume2, VolumeX, Maximize2, Radio, Music, Film, Tv, Clock,
  Sparkles, Check, AlertCircle, RefreshCw, Layers, Zap, Eye
} from 'lucide-react';
import { auth, db } from '../../services/backendService';
import {
  getOrCreateDeviceId, getFriendlyDeviceName, registerEventDevice,
  listenToPartyEventSession, listenToEventDevices, DEFAULT_DUTY,
  type PartyEventSession, type PartyEventDevice, type EventDeviceDuty
} from '../../services/ambo/amboPartyEventService';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import { type LiveStack, type Slide } from '../../services/ambo/showModel';

interface Props {
  onBack?: () => void;
}

export const AmboPartyEventReceiver: React.FC<Props> = ({ onBack }) => {
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const [session, setSession] = useState<PartyEventSession | null>(null);
  const [device, setDevice] = useState<PartyEventDevice | null>(null);
  const [allDevices, setAllDevices] = useState<PartyEventDevice[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [isPinged, setIsPinged] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Program canvas renderer
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Digital clock
  const [clockStr, setClockStr] = useState('');
  useEffect(() => {
    const tick = () => {
      setClockStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Register this device in the mesh & keep heartbeat alive
  useEffect(() => {
    const unregister = registerEventDevice();
    return () => unregister();
  }, []);

  // Listen to session & devices from Firestore
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;

    const unsubSession = listenToPartyEventSession(uid, (sess) => {
      setSession(sess);
    });

    const unsubDevices = listenToEventDevices(uid, (devs) => {
      setAllDevices(devs);
      const me = devs.find((d) => d.deviceId === deviceId) || null;
      setDevice(me);
    });

    return () => {
      unsubSession();
      unsubDevices();
    };
  }, [deviceId]);

  // Handle Ping / Identify flash
  useEffect(() => {
    if (device?.pingTimestamp) {
      const diff = Date.now() - device.pingTimestamp;
      if (diff < 4000) {
        setIsPinged(true);
        const t = setTimeout(() => setIsPinged(false), 3500);
        return () => clearTimeout(t);
      }
    }
  }, [device?.pingTimestamp]);

  // Auto-hide HUD after 3 seconds of inactivity
  useEffect(() => {
    let t: any = null;
    const onMove = () => {
      setHudVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setHudVisible(false), 3500);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchstart', onMove);
    t = setTimeout(() => setHudVisible(false), 3500);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchstart', onMove);
      clearTimeout(t);
    };
  }, []);

  // Fullscreen helper
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Determine current active display state
  const isPartyActive = !!session?.isActive;
  const isMasterSyncEngaged = !!session?.masterSyncEngaged;
  const isDeviceSlaved = device ? device.isSlaved : true;

  // The core logic requested by the user:
  // "when a master control user clicks a button all those devices take and follow and slave to the main device,
  // and when the sync button hits a mute state, those other devices/locations go back to their assigned playlist/functions and videos"
  const isFollowingMaster = isPartyActive && isMasterSyncEngaged && isDeviceSlaved;
  const activeDuty: EventDeviceDuty = device?.duty || DEFAULT_DUTY;

  // Setup / update Canvas LayerRenderer for Program Out
  const effectiveStack: LiveStack = useMemo(() => {
    if (isFollowingMaster) {
      return session?.masterSource?.liveStack || {};
    }
    if (activeDuty.dutyType === 'AMBO_PROGRAM') {
      return session?.masterSource?.liveStack || {};
    }
    return {};
  }, [isFollowingMaster, session?.masterSource?.liveStack, activeDuty.dutyType]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    if (!rendererRef.current) {
      const r = new LayerRenderer(c, { w: 1920, h: 1080 });
      r.setOptions({ audioEnabled: audioUnlocked && !device?.isMuted });
      r.start();
      rendererRef.current = r;
    }

    rendererRef.current.setStack(effectiveStack);
  }, [effectiveStack, audioUnlocked, device?.isMuted]);

  // Audio unlock helper for mobile/browsers with autoplay restrictions
  const unlockAudio = () => {
    setAudioUnlocked(true);
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
    if (rendererRef.current) {
      rendererRef.current.setOptions({ audioEnabled: true });
    }
  };

  // Audio element volume sync
  useEffect(() => {
    const vol = device?.isMuted ? 0 : (device?.volume ?? 1);
    if (audioRef.current) audioRef.current.volume = vol;
    if (videoRef.current) videoRef.current.volume = vol;
  }, [device?.volume, device?.isMuted]);

  return (
    <div
      className="fixed inset-0 bg-black text-white overflow-hidden select-none flex items-center justify-center font-sans"
      onDoubleClick={toggleFullscreen}
    >
      {/* ── VISUAL DISPLAY MODES ────────────────────────────────────────── */}

      {/* 1. MASTER SYNC FOLLOW MODE */}
      {isFollowingMaster && (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          {session.masterSource.type === 'AMBO_STAGE' ? (
            /* Master Stage Foldback */
            <div className="w-full h-full bg-[#07050e] p-8 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-amber-300 font-mono text-4xl font-extrabold tracking-wider">
                  {clockStr}
                </span>
                <span className="text-xl font-bold bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/40 px-3 py-1 rounded-full uppercase tracking-wider">
                  MASTER STAGE CONFIDENCE
                </span>
              </div>
              <div className="my-auto text-center px-6">
                <div className="text-sm font-bold text-white/40 uppercase tracking-widest mb-2">LIVE SLIDE</div>
                <div className="text-4xl md:text-5xl font-black text-white leading-tight">
                  {session.masterSource.slide?.label || session.masterSource.title || 'Live Cue'}
                </div>
                {session.masterSource.slide?.stageNotes && (
                  <div className="mt-6 p-4 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-200 text-lg font-medium max-w-3xl mx-auto">
                    Note: {session.masterSource.slide.stageNotes}
                  </div>
                )}
              </div>
              <div className="border-t border-white/10 pt-4 flex items-center justify-between text-cyan-300 text-lg">
                <span className="font-bold uppercase tracking-wider">NEXT CUE:</span>
                <span className="text-white/80 font-semibold">{session.masterSource.nextSlide?.label || 'End of Section'}</span>
              </div>
            </div>
          ) : session.masterSource.video?.url ? (
            /* Master Video Broadcast */
            <video
              ref={videoRef}
              src={session.masterSource.video.url}
              className="w-full h-full object-contain"
              autoPlay
              playsInline
              loop
            />
          ) : (
            /* Master Program Out Live Canvas */
            <canvas ref={canvasRef} className="w-full h-full object-contain block bg-black" />
          )}
        </div>
      )}

      {/* 2. INDEPENDENT DUTY MODE (When Sync is Muted / Released or Unslaved) */}
      {!isFollowingMaster && (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          {/* A. CHORA MUSIC PLAYLIST DUTY */}
          {activeDuty.dutyType === 'CHORA_PLAYLIST' && (
            <div className="relative w-full h-full bg-gradient-to-br from-[#12061f] via-[#090312] to-[#040817] flex flex-col items-center justify-center p-8 overflow-hidden">
              {/* Ambient Audio Reactive Aura */}
              <div className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-purple-600/20 via-pink-500/20 to-cyan-500/20 blur-3xl animate-pulse pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center text-center max-w-2xl">
                {/* Rotating Vinyl / Artwork */}
                <div className="relative w-56 h-56 md:w-72 md:h-72 rounded-3xl overflow-hidden shadow-2xl border border-white/20 mb-8 bg-black/40 flex items-center justify-center group">
                  {activeDuty.sourceData?.tracks?.[0]?.coverImage ? (
                    <img
                      src={activeDuty.sourceData.tracks[0].coverImage}
                      alt="Cover"
                      className="w-full h-full object-cover animate-spin"
                      style={{ animationDuration: '24s' }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#6B0099] to-[#D40055]">
                      <Music size={64} className="text-white/80 animate-bounce" />
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/20" />
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold uppercase tracking-wider mb-3">
                  <Music size={12} />
                  <span>CHORA MUSIC · LOCAL PLAYLIST</span>
                </div>

                <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tight">
                  {activeDuty.sourceData?.tracks?.[0]?.title || activeDuty.title || 'Chora Playlist'}
                </h1>
                <p className="text-lg md:text-xl text-white/60 font-medium">
                  {activeDuty.sourceData?.tracks?.[0]?.artist || activeDuty.subtitle || 'Independent Audio Device'}
                </p>

                {/* Animated Waveform Bars */}
                <div className="flex items-center gap-1.5 mt-8 h-10">
                  {[40, 65, 85, 45, 95, 75, 55, 90, 60, 80, 100, 70, 50, 85, 60].map((h, i) => (
                    <span
                      key={i}
                      className="w-1.5 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full animate-pulse"
                      style={{
                        height: `${h}%`,
                        animationDelay: `${i * 0.08}s`,
                        animationDuration: '0.8s',
                      }}
                    />
                  ))}
                </div>

                {/* Local audio element */}
                {activeDuty.sourceData?.tracks?.[0]?.url && (
                  <audio
                    ref={audioRef}
                    src={activeDuty.sourceData.tracks[0].url}
                    autoPlay
                    loop
                  />
                )}
              </div>
            </div>
          )}

          {/* B. REELLO VIDEO DUTY */}
          {activeDuty.dutyType === 'REELLO_VIDEO' && (
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              {activeDuty.sourceData?.videoUrl ? (
                <video
                  ref={videoRef}
                  src={activeDuty.sourceData.videoUrl}
                  className="w-full h-full object-contain"
                  autoPlay
                  playsInline
                  loop
                  poster={activeDuty.sourceData?.thumbnail}
                />
              ) : (
                <div className="flex flex-col items-center text-center p-8">
                  <Film size={64} className="text-[#FF8C00] mb-4 animate-pulse" />
                  <h2 className="text-2xl font-bold">{activeDuty.title || 'Reello Video Loop'}</h2>
                  <p className="text-white/50 text-sm mt-1">Playing independently on this screen</p>
                </div>
              )}
            </div>
          )}

          {/* C. AMBO PRESENTATION / SLIDES DUTY */}
          {activeDuty.dutyType === 'AMBO_PRESENTATION' && (
            <div className="relative w-full h-full bg-black flex items-center justify-center p-8">
              <div className="max-w-4xl text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-4">
                  <Layers size={12} />
                  <span>PRESENTATION · INDEPENDENT PLAYBACK</span>
                </div>
                <h1 className="text-4xl md:text-6xl font-black text-white mb-4">
                  {activeDuty.sourceData?.show?.title || activeDuty.title || 'Assigned Presentation'}
                </h1>
                <p className="text-xl text-white/60">
                  {activeDuty.sourceData?.show?.slides?.[0]?.label || activeDuty.subtitle || 'Service Plan Deck'}
                </p>
              </div>
            </div>
          )}

          {/* D. AMBO STAGE DISPLAY DUTY */}
          {activeDuty.dutyType === 'AMBO_STAGE' && (
            <div className="w-full h-full bg-[#07050e] p-8 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-amber-300 font-mono text-4xl font-extrabold tracking-wider">
                  {clockStr}
                </span>
                <span className="text-xl font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 px-3 py-1 rounded-full uppercase tracking-wider">
                  LOCAL STAGE CONFIDENCE
                </span>
              </div>
              <div className="my-auto text-center px-6">
                <div className="text-sm font-bold text-white/40 uppercase tracking-widest mb-2">CURRENT ASSIGNMENT</div>
                <div className="text-4xl md:text-5xl font-black text-white leading-tight">
                  {activeDuty.title}
                </div>
                {activeDuty.subtitle && (
                  <div className="mt-4 text-white/60 text-xl font-medium">
                    {activeDuty.subtitle}
                  </div>
                )}
              </div>
              <div className="border-t border-white/10 pt-4 flex items-center justify-between text-white/50 text-sm font-mono">
                <span>STAGE DISPLAY PROTOCOL</span>
                <span className="text-emerald-400 font-bold">ONLINE</span>
              </div>
            </div>
          )}

          {/* E. AMBIENT SIGNAGE & WELCOME DUTY */}
          {activeDuty.dutyType === 'AMBIENT_SIGNAGE' && (
            <div className="relative w-full h-full bg-gradient-to-br from-[#0c0817] via-[#05040a] to-[#120516] flex flex-col items-center justify-center p-8 text-center overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(218,0,243,0.15)_0%,transparent_70%)] pointer-events-none" />
              <Sparkles size={56} className="text-pink-400 mb-6 animate-pulse" />
              <h1 className="text-4xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-400 mb-4 tracking-tight">
                {activeDuty.sourceData?.headline || activeDuty.title || 'Welcome to Plajah'}
              </h1>
              <p className="text-xl md:text-2xl text-white/70 max-w-2xl font-light">
                {activeDuty.sourceData?.subheadline || activeDuty.subtitle || 'Party & Event Visual Experience'}
              </p>
            </div>
          )}

          {/* F. AMBO PROGRAM DEFAULT */}
          {activeDuty.dutyType === 'AMBO_PROGRAM' && (
            <canvas ref={canvasRef} className="w-full h-full object-contain block bg-black" />
          )}

          {/* G. STANDBY */}
          {activeDuty.dutyType === 'STANDBY' && (
            <div className="flex flex-col items-center justify-center text-center p-8 max-w-lg">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Tv size={32} className="text-white/60" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{device?.deviceName || getFriendlyDeviceName()}</h2>
              <p className="text-white/50 text-sm mb-6">
                Connected and ready. Waiting for duty assignment or Master Sync from Ambo Central Command.
              </p>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>ONLINE · RECEIVER ACTIVE</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BROADCAST HUD (AUTO-HIDING) ─────────────────────────────────── */}
      <div
        className={`fixed top-4 left-4 right-4 flex items-center justify-between pointer-events-none transition-opacity duration-500 ${
          hudVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Device ID & Duty Badge */}
        <div className="flex items-center gap-2 pointer-events-auto bg-black/80 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-xl shadow-2xl">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          <span className="text-xs font-extrabold tracking-wide uppercase text-white/90">
            {device?.deviceName || getFriendlyDeviceName()}
          </span>
          <span className="text-white/20">|</span>
          {isFollowingMaster ? (
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#FF8C00]/25 text-[#FF8C00] border border-[#FF8C00]/40 flex items-center gap-1 animate-pulse">
              <Zap size={10} />
              SLAVED TO MASTER
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
              <Radio size={10} />
              DUTY: {activeDuty.title}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Audio Unlock Button for Autoplay restricted devices */}
          {!audioUnlocked && (
            <button
              onClick={unlockAudio}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition-transform active:scale-95 animate-bounce"
            >
              <Volume2 size={14} />
              <span>Tap to Enable Audio</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-white/70 hover:text-white hover:bg-white/10 transition-all shadow-xl"
            title="Toggle Fullscreen (F)"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* ── IDENTIFY / PING FLASH OVERLAY ───────────────────────────────── */}
      {isPinged && (
        <div className="fixed inset-0 z-50 bg-[#00DAF3]/90 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-pulse text-[#04222a]">
          <Tv size={80} className="mb-4 animate-bounce" />
          <div className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-black/15 mb-2">
            AMBO PING IDENTIFIER
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-center tracking-tight">
            {device?.deviceName || getFriendlyDeviceName()}
          </h1>
          <p className="text-lg font-bold mt-2 opacity-80 font-mono">DEVICE ID: {deviceId}</p>
        </div>
      )}
    </div>
  );
};

export default AmboPartyEventReceiver;
