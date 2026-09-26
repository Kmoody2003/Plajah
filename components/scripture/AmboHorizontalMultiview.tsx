// AmboHorizontalMultiview — Collapsible Horizontal Multiview Dock for Ambo Pro.
// Displays live broadcast-grade output monitors directly above the bottom library dock:
//   · Program Out (LIVE Wire, Orange border, resolution badge, active audio VU meter)
//   · Preview / Next (Cyan border, cue stack)
//   · Stage Display (Confidence / Foldback clock, countdown timer, now/next slide cues)
//   · Aux / Lobby (Clean feed status, output display routing)
//   · Stream Bus (NDI broadcast stream / RTMP encoder status)
//
// Retains collapsed/expanded state with smooth transitions and layout persistence.

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, MonitorPlay, Radio, Clock, Play, Eye,
  Volume2, VolumeX, Wifi, Tv, Layers, Maximize2, Sparkles, Check,
  Laptop, Tablet, Smartphone, Music, Film, Zap, ExternalLink
} from 'lucide-react';
import { type LiveStack, type Slide } from '../../services/ambo/showModel';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import { type AmboOutput } from '../../services/ambo/outputRouter';
import {
  type PartyEventSession, type PartyEventDevice, type EventDeviceDutyType
} from '../../services/ambo/amboPartyEventService';

interface AmboHorizontalMultiviewProps {
  liveStack: LiveStack;
  previewStack: LiveStack;
  liveSlide?: Slide | null;
  previewSlide?: Slide | null;
  nextSlide?: Slide | null;
  elapsedSec: number;
  outputs?: AmboOutput[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onTakePreview?: () => void;
  height?: number;
  isBlackout?: boolean;
  isMasterProgramOn?: boolean;
  activeTransition?: string;
  className?: string;
  // Party / Event Mode integration
  partySession?: PartyEventSession | null;
  partyDevices?: PartyEventDevice[];
  onOpenPartyModal?: () => void;
  onToggleMasterSync?: () => void;
  onAssignDeviceDuty?: (deviceId: string, dutyType: EventDeviceDutyType) => void;
  onToggleDeviceSlave?: (deviceId: string, isSlaved: boolean) => void;
  onToggleDeviceMute?: (deviceId: string, isMuted: boolean) => void;
  onPingDevice?: (deviceId: string) => void;
}

const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const line = 'rgba(255,255,255,0.09)';

const MiniCanvasMonitor: React.FC<{ stack: LiveStack; audio?: boolean; label: string }> = ({
  stack,
  audio,
  label,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = new LayerRenderer(c, { w: 640, h: 360 });
    r.setOptions({ audioEnabled: !!audio });
    r.start();
    rendererRef.current = r;
    return () => {
      r.dispose();
      rendererRef.current = null;
    };
  }, [audio]);

  useEffect(() => {
    rendererRef.current?.setStack(stack);
  }, [stack]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
      <canvas ref={ref} className="w-full h-full block object-contain" />
    </div>
  );
};

export const AmboHorizontalMultiview: React.FC<AmboHorizontalMultiviewProps> = ({
  liveStack,
  previewStack,
  liveSlide,
  previewSlide,
  nextSlide,
  elapsedSec,
  outputs = [],
  isCollapsed,
  onToggleCollapse,
  onTakePreview,
  height,
  isBlackout = false,
  isMasterProgramOn = true,
  activeTransition = 'Cross Dissolve',
  className = '',
  partySession,
  partyDevices = [],
  onOpenPartyModal,
  onToggleMasterSync,
  onAssignDeviceDuty,
  onToggleDeviceSlave,
  onToggleDeviceMute,
  onPingDevice,
}) => {
  // Real-time local digital clock for stage confidence monitor
  const [timeStr, setTimeStr] = useState('');
  const [activeTab, setActiveTab] = useState<'broadcast' | 'party'>('broadcast');

  useEffect(() => {
    if (partySession?.isActive && partyDevices.length > 0) {
      setActiveTab('party');
    }
  }, [partySession?.isActive, partyDevices.length]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const activeScreensCount = outputs.filter(o => o.enabled).length;
  const isPartyActive = !!partySession?.isActive;
  const isMasterSyncEngaged = !!partySession?.masterSyncEngaged;

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'TV': return <Tv size={12} className="text-[#00DAF3]" />;
      case 'TABLET': return <Tablet size={12} className="text-purple-400" />;
      case 'MOBILE': return <Smartphone size={12} className="text-pink-400" />;
      default: return <Laptop size={12} className="text-emerald-400" />;
    }
  };

  if (isCollapsed) {
    return (
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-t border-b select-none transition-colors ${className}`}
        style={{ borderColor: line, background: 'rgba(10,7,17,0.85)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70 hover:text-white transition-colors"
            title="Expand Horizontal Multiview"
          >
            <ChevronUp size={14} className="text-[#00DAF3]" />
            <span className="tracking-wide">MULTIVIEW</span>
          </button>
          <div className="h-3 w-[1px] bg-white/20 mx-1" />
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-[#FF8C00] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF8C00] animate-pulse" />
              PGM: {liveSlide?.label || 'Active'}
            </span>
            <span className="text-white/30">·</span>
            <span className="flex items-center gap-1 text-[#00DAF3]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00DAF3]" />
              PRV: {previewSlide?.label || 'Ready'}
            </span>
            {isPartyActive && (
              <>
                <span className="text-white/30">·</span>
                <span className="flex items-center gap-1 text-pink-400 font-bold">
                  <Sparkles size={11} />
                  PARTY: {partyDevices.length} Screen(s)
                </span>
              </>
            )}
            <span className="text-white/30">·</span>
            <span className="text-white/50 font-mono text-[9.5px]">
              {timeStr} ({formatElapsed(elapsedSec)})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPartyActive && (
            <button
              onClick={onToggleMasterSync}
              className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase transition-all flex items-center gap-1 ${
                isMasterSyncEngaged
                  ? 'bg-[#FF8C00] text-black shadow-md shadow-[#FF8C00]/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              <Zap size={10} />
              <span>{isMasterSyncEngaged ? 'SYNC: ON' : 'SYNC: MUTED'}</span>
            </button>
          )}

          <span className="font-mono text-[9px] text-white/40">
            {activeScreensCount > 0 ? `${activeScreensCount} Output(s) Live` : 'Multiview Ready'}
          </span>
          <button
            onClick={onToggleCollapse}
            className="px-2 py-0.5 rounded text-[10px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            Show Tiles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-t border-b flex flex-col flex-none select-none min-h-0 overflow-hidden ${className}`}
      style={{
        height: height ? `${height}px` : undefined,
        borderColor: line,
        background: 'rgba(7,5,12,0.92)',
      }}
    >
      {/* Multiview Bar Header */}
      <div
        className="flex items-center justify-between px-3 py-1 border-b flex-none"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[10.5px] font-extrabold tracking-wider uppercase flex items-center gap-1.5 text-white/80">
            <Radio size={12} className="text-[#00DAF3]" />
            Multiview
          </span>

          {/* View Mode Switcher: Broadcast Busses vs Party Devices */}
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10 text-[9.5px]">
            <button
              onClick={() => setActiveTab('broadcast')}
              className={`px-2 py-0.5 rounded font-bold uppercase transition-all ${
                activeTab === 'broadcast'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              Studio Busses (5)
            </button>
            <button
              onClick={() => setActiveTab('party')}
              className={`px-2 py-0.5 rounded font-bold uppercase transition-all flex items-center gap-1 ${
                activeTab === 'party'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Sparkles size={10} />
              <span>Party Devices ({partyDevices.length})</span>
            </button>
          </div>

          {/* Party Mode Master Status Banner & Sync Button */}
          {isPartyActive && (
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenPartyModal}
                className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-pink-300 border border-pink-500/40 flex items-center gap-1 hover:brightness-125 transition-all cursor-pointer"
                title="Open Party / Event Central Command"
              >
                <Sparkles size={9} />
                <span>EVENT MODE: LIVE</span>
              </button>

              <button
                onClick={onToggleMasterSync}
                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
                  isMasterSyncEngaged
                    ? 'bg-[#FF8C00] text-black shadow-md shadow-[#FF8C00]/40 ring-1 ring-[#FF8C00]'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                }`}
                title={isMasterSyncEngaged ? 'Master Sync Active: All devices slaved. Click to Mute / Release to independent duties.' : 'Sync Muted: Devices on independent duties. Click to Engage Master Sync.'}
              >
                <Zap size={10} fill={isMasterSyncEngaged ? 'currentColor' : 'none'} />
                <span>{isMasterSyncEngaged ? '⚡ MASTER SYNC: ON' : '🔇 SYNC MUTED (DUTIES)'}</span>
              </button>
            </div>
          )}

          {activeTransition && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#00DAF3]/15 text-[#00DAF3] border border-[#00DAF3]/30">
              Tx: {activeTransition}
            </span>
          )}
          {isBlackout && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold animate-pulse">
              BLACKOUT
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenPartyModal && (
            <button
              onClick={onOpenPartyModal}
              className="px-2 py-0.5 rounded text-[10px] font-bold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-1"
            >
              <Tv size={11} />
              <span>Event Mesh</span>
            </button>
          )}

          {onTakePreview && (
            <button
              onClick={onTakePreview}
              className="px-2.5 py-0.5 rounded text-[10px] font-bold text-[#04222a] bg-[#00DAF3] hover:brightness-110 active:scale-95 transition-all flex items-center gap-1"
              title="Cut Preview to Program Out"
            >
              <Play size={10} fill="#04222a" />
              <span>CUT PRV → PGM</span>
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Collapse Multiview"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* ── TAB 1: PARTY / EVENT DEVICES TILES ─────────────────────────── */}
      {activeTab === 'party' && (
        <div className="flex-1 min-h-0 p-2.5 overflow-x-auto flex items-stretch gap-2.5">
          {partyDevices.length === 0 ? (
            <div className="w-full flex flex-col items-center justify-center p-6 rounded-lg border border-dashed border-white/15 bg-white/[0.01] text-center">
              <Tv size={28} className="text-white/30 mb-2" />
              <p className="text-xs font-bold text-white/70">No Secondary Display Devices Discovered</p>
              <p className="text-[10px] text-white/40 mt-0.5 mb-3 max-w-sm">
                Open Plajah on another phone, tablet, laptop, or TV browser logged into this account to turn it into an output tile!
              </p>
              {onOpenPartyModal && (
                <button
                  onClick={onOpenPartyModal}
                  className="px-3 py-1 rounded bg-[#00DAF3] text-black font-extrabold text-[10px] hover:brightness-110"
                >
                  Configure Event Outputs
                </button>
              )}
            </div>
          ) : (
            partyDevices.map((dev) => {
              const isSlaved = dev.isSlaved !== false;
              const isFollowing = isPartyActive && isMasterSyncEngaged && isSlaved;
              const duty = dev.duty || { dutyType: 'AMBO_PROGRAM', title: 'Ambo Program Out' };

              return (
                <div
                  key={dev.deviceId}
                  className="flex flex-col w-64 min-w-[250px] shrink-0 rounded-lg overflow-hidden border p-2 transition-all relative justify-between"
                  style={{
                    borderColor: isFollowing ? 'rgba(255,140,0,0.7)' : 'rgba(16,185,129,0.5)',
                    background: isFollowing ? 'rgba(255,140,0,0.03)' : 'rgba(16,185,129,0.03)',
                  }}
                >
                  {/* Tile Header */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 truncate">
                        {getDeviceIcon(dev.deviceType)}
                        <span className="text-[10px] font-extrabold truncate text-white/90">
                          {dev.deviceName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            dev.isOnline ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-white/20'
                          }`}
                        />
                        <span
                          className={`text-[8px] font-mono px-1 py-0.2 rounded font-extrabold uppercase ${
                            isFollowing
                              ? 'bg-[#FF8C00]/25 text-[#FF8C00]'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {isFollowing ? 'SLAVED' : 'INDEPENDENT'}
                        </span>
                      </div>
                    </div>

                    {/* Tile Monitor Content */}
                    <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden border border-white/10 flex items-center justify-center">
                      {isFollowing || duty.dutyType === 'AMBO_PROGRAM' ? (
                        <MiniCanvasMonitor stack={liveStack} audio={!dev.isMuted} label={dev.deviceName} />
                      ) : duty.dutyType === 'CHORA_PLAYLIST' ? (
                        <div className="w-full h-full bg-gradient-to-br from-[#19092c] to-[#0a0414] flex flex-col items-center justify-center p-2 text-center">
                          <Music size={24} className="text-purple-400 mb-1 animate-pulse" />
                          <div className="text-[9px] font-bold text-white truncate max-w-[180px]">
                            {duty.title}
                          </div>
                          <div className="text-[7.5px] text-white/40 truncate">Chora Local Audio</div>
                        </div>
                      ) : duty.dutyType === 'REELLO_VIDEO' ? (
                        <div className="w-full h-full bg-black flex flex-col items-center justify-center p-2 text-center">
                          <Film size={24} className="text-[#FF8C00] mb-1" />
                          <div className="text-[9px] font-bold text-white truncate max-w-[180px]">
                            {duty.title}
                          </div>
                          <div className="text-[7.5px] text-white/40 truncate">Reello Video Feed</div>
                        </div>
                      ) : duty.dutyType === 'AMBO_STAGE' ? (
                        <div className="w-full h-full bg-[#0a0815] flex flex-col items-center justify-center p-2 text-center">
                          <Clock size={22} className="text-amber-400 mb-1" />
                          <div className="text-[11px] font-mono font-bold text-amber-300">
                            {timeStr}
                          </div>
                          <div className="text-[7.5px] text-white/40 uppercase">Stage Foldback</div>
                        </div>
                      ) : (
                        <div className="w-full h-full bg-white/[0.02] flex flex-col items-center justify-center p-2 text-center">
                          <Tv size={22} className="text-white/30 mb-1" />
                          <div className="text-[9px] font-bold text-white/70">{duty.title}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tile Footer & Quick Controls */}
                  <div className="mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[9px]">
                    <div className="flex items-center gap-1">
                      <select
                        value={duty.dutyType}
                        onChange={(e) => onAssignDeviceDuty?.(dev.deviceId, e.target.value as any)}
                        className="bg-black/60 border border-white/15 rounded px-1.5 py-0.5 text-[8.5px] font-bold text-white/80 outline-none cursor-pointer max-w-[110px] truncate"
                        title="Route Source to Device"
                      >
                        <option value="AMBO_PROGRAM">Program Out</option>
                        <option value="AMBO_STAGE">Stage Foldback</option>
                        <option value="CHORA_PLAYLIST">Chora Music</option>
                        <option value="REELLO_VIDEO">Reello Video</option>
                        <option value="AMBIENT_SIGNAGE">Signage Screen</option>
                        <option value="STANDBY">Standby</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onToggleDeviceSlave?.(dev.deviceId, !isSlaved)}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase transition-all ${
                          isSlaved
                            ? 'bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/30'
                            : 'bg-white/5 text-white/40 hover:text-white'
                        }`}
                        title={isSlaved ? 'Slaved to Master Sync' : 'Independent of Master Sync'}
                      >
                        {isSlaved ? 'SLAVE' : 'FREE'}
                      </button>

                      <button
                        onClick={() => onToggleDeviceMute?.(dev.deviceId, !dev.isMuted)}
                        className={`p-1 rounded transition-all ${
                          dev.isMuted ? 'text-red-400 bg-red-500/10' : 'text-white/60 hover:text-white'
                        }`}
                        title={dev.isMuted ? 'Unmute Audio' : 'Mute Audio'}
                      >
                        {dev.isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      </button>

                      <button
                        onClick={() => onPingDevice?.(dev.deviceId)}
                        className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#00DAF3]/15 text-[#00DAF3] hover:bg-[#00DAF3]/30"
                        title="Ping physical screen"
                      >
                        Ping
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── TAB 2: 5 CLASSIC BROADCAST TILES ──────────────────────────── */}
      {activeTab === 'broadcast' && (
        <div className="grid grid-cols-5 gap-2.5 p-2.5 overflow-x-auto flex-1 min-h-0 items-stretch">
          {/* TILE 1: PROGRAM OUT */}
          <div
            className="flex flex-col rounded-lg overflow-hidden border-2 p-1.5 transition-all relative"
            style={{
              borderColor: isBlackout ? 'rgba(239,68,68,0.85)' : 'rgba(255,140,0,0.85)',
              background: isBlackout ? 'rgba(0,0,0,0.95)' : 'rgba(255,140,0,0.03)',
              boxShadow: isBlackout ? '0 0 16px rgba(239,68,68,0.3)' : '0 0 16px rgba(255,140,0,0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9.5px] font-extrabold uppercase tracking-wide flex items-center gap-1.5" style={{ color: isBlackout ? '#ef4444' : '#FF8C00' }}>
                <span className="w-2 h-2 rounded-full animate-ping" style={{ background: isBlackout ? '#ef4444' : '#FF8C00' }} />
                {isBlackout ? 'BLACKOUT' : 'PROGRAM'}
              </span>
              <div className="flex items-center gap-1">
                <span
                  className="text-[8px] font-mono px-1 py-0.2 rounded font-bold"
                  style={{
                    background: isBlackout ? 'rgba(239,68,68,0.2)' : 'rgba(255,140,0,0.2)',
                    color: isBlackout ? '#ef4444' : '#FF8C00',
                  }}
                >
                  {isBlackout ? 'BLK' : isMasterProgramOn ? 'LIVE' : 'MUTED'}
                </span>
                <span className="text-[8px] font-mono text-white/40">1080p60</span>
              </div>
            </div>
            {isBlackout ? (
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-red-500/30 flex items-center justify-center text-center">
                <span className="font-mono text-[11px] font-extrabold text-red-400 tracking-widest uppercase">
                  ● MASTER BLK
                </span>
              </div>
            ) : (
              <MiniCanvasMonitor stack={liveStack} audio label="Program" />
            )}
            <div className="flex items-center justify-between mt-1 text-[9px] text-white/60 truncate">
              <span className="truncate font-medium">{isBlackout ? 'Output Blanked' : liveSlide?.label || 'Audience Live'}</span>
              <div className="flex items-center gap-0.5 text-emerald-400">
                <span className="inline-block w-1 h-2 bg-emerald-500 rounded-xs animate-pulse" />
                <span className="inline-block w-1 h-3 bg-emerald-500 rounded-xs" />
                <span className="inline-block w-1 h-1.5 bg-emerald-500 rounded-xs animate-pulse" />
              </div>
            </div>
          </div>

          {/* TILE 2: PREVIEW / NEXT */}
          <div
            className="flex flex-col rounded-lg overflow-hidden border p-1.5 transition-all"
            style={{
              borderColor: 'rgba(0,218,243,0.7)',
              background: 'rgba(0,218,243,0.03)',
              boxShadow: '0 0 14px rgba(0,218,243,0.15)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 text-[#00DAF3]">
                <Eye size={11} />
                PREVIEW
              </span>
              <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-[#00DAF3]/20 text-[#00DAF3]">
                CUED
              </span>
            </div>
            <MiniCanvasMonitor stack={previewStack} label="Preview" />
            <div className="flex items-center justify-between mt-1 text-[9px] text-white/60 truncate">
              <span className="truncate font-medium">{previewSlide?.label || 'Next Cue'}</span>
              <span className="text-[8px] font-mono text-white/40">Next</span>
            </div>
          </div>

          {/* TILE 3: STAGE DISPLAY / FOLDBACK */}
          <div
            className="flex flex-col rounded-lg overflow-hidden border p-1.5"
            style={{
              borderColor: 'rgba(208,188,255,0.4)',
              background: 'rgba(208,188,255,0.03)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 text-[#D0BCFF]">
                <Clock size={11} />
                STAGE DISPLAY
              </span>
              <span className="text-[8px] font-mono text-white/40">FOLDBACK</span>
            </div>
            <div className="w-full aspect-video bg-[#0b0816] rounded-lg border border-white/10 p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] font-extrabold text-amber-300 tracking-wider">
                  {timeStr || '10:00:00 AM'}
                </span>
                <span className="font-mono text-[10px] font-bold text-white/80 bg-white/10 px-1 rounded">
                  +{formatElapsed(elapsedSec)}
                </span>
              </div>
              <div className="my-auto text-center px-1">
                <div className="text-[9px] font-bold text-white/50 uppercase tracking-wider">CURRENT</div>
                <div className="text-[11px] font-semibold text-white truncate">
                  {liveSlide?.label || 'Speaker / Worship'}
                </div>
              </div>
              <div className="border-t border-white/10 pt-1 text-left flex items-center gap-1 text-[8.5px] text-[#00DAF3]">
                <span className="font-bold">NEXT:</span>
                <span className="truncate text-white/70">{nextSlide?.label || 'End of Service'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1 text-[9px] text-white/40">
              <span>Musicians & Speaker</span>
              <span className="text-emerald-400 font-mono text-[8px]">ACTIVE</span>
            </div>
          </div>

          {/* TILE 4: AUX / LOBBY DISPLAY */}
          <div
            className="flex flex-col rounded-lg overflow-hidden border p-1.5"
            style={{
              borderColor: 'rgba(16,185,129,0.4)',
              background: 'rgba(16,185,129,0.03)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 text-emerald-400">
                <Tv size={11} />
                AUX 1 · LOBBY
              </span>
              <span className="text-[8px] font-mono text-white/40">1080p</span>
            </div>
            <div className="w-full aspect-video bg-[#061410] rounded-lg border border-white/10 relative overflow-hidden flex flex-col items-center justify-center p-2 text-center">
              <div className="absolute top-1 left-1 px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[7.5px]">
                CLEAN FEED
              </div>
              <Tv size={20} className="text-emerald-500/40 mb-1" />
              <span className="text-[10px] font-medium text-white/80">Lobby & Foyer</span>
              <span className="text-[8px] text-white/40 mt-0.5">Audience Mirror (0ms delay)</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-[9px] text-white/40">
              <span>HDMI / Matrix Out</span>
              <span className="text-emerald-400 font-mono text-[8px]">ONLINE</span>
            </div>
          </div>

          {/* TILE 5: STREAM BUS / NDI */}
          <div
            className="flex flex-col rounded-lg overflow-hidden border p-1.5"
            style={{
              borderColor: 'rgba(124,156,232,0.4)',
              background: 'rgba(124,156,232,0.03)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 text-[#7c9ce8]">
                <Radio size={11} />
                STREAM BUS
              </span>
              <span className="text-[8px] font-mono text-white/40">NDI 6</span>
            </div>
            <div className="w-full aspect-video bg-[#070c18] rounded-lg border border-white/10 relative overflow-hidden flex flex-col items-center justify-center p-2 text-center">
              <div className="absolute top-1 left-1 px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono text-[7.5px]">
                RTMP / NDI
              </div>
              <Radio size={20} className="text-blue-400/40 mb-1" />
              <span className="text-[10px] font-medium text-white/80">Live Stream Output</span>
              <span className="text-[8px] text-white/40 mt-0.5">5.8 Mbps · 60fps CBR</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-[9px] text-white/40">
              <span>Switcher Feed</span>
              <span className="text-[#00DAF3] font-mono text-[8px]">TRANSMITTING</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AmboHorizontalMultiview;
