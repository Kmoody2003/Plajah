// AmboPartyEventModal.tsx — Central Command for Ambo Party & Event Mode.
//
// Discovers and lists all devices the user account is signed into, turning them
// into visual and audio outputs that can be assigned independent duties or slaved
// to the Master Ambo device.
//
// Features:
//   · Big Illuminated Master Sync Button (Slave All vs Mute/Release to Local Duties)
//   · Mesh Device Discovery & Heartbeat Monitor
//   · Per-Device Source Assignment (Program Out, Stage Foldback, Show, Chora, Reello, Signage)
//   · Per-Device Slave & Audio Mute Overrides
//   · Hardware Ping / Identify Flasher
//   · Project Playlist Defaults Architecture Configuration

import React, { useState, useEffect } from 'react';
import {
  X, Radio, Sparkles, Tv, Laptop, Tablet, Smartphone, Volume2,
  VolumeX, Zap, Check, ExternalLink, RefreshCw, Copy, Sliders,
  Play, Pause, Layers, Music, Film, Clock, HelpCircle, Edit3
} from 'lucide-react';
import {
  type PartyEventSession, type PartyEventDevice, type EventDeviceDuty,
  type EventDeviceType, startPartyEventSession, endPartyEventSession,
  setMasterSync, assignDeviceDuty, setDeviceSlaved, setDeviceAudioMute,
  pingDevice, saveProjectDefaultDuties, setCustomDeviceName
} from '../../services/ambo/amboPartyEventService';
import type { Show } from '../../services/ambo/showModel';
import type { PlanItem } from '../../services/ambo/servicePlanDemo';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: PartyEventSession | null;
  devices: PartyEventDevice[];
  shows: Show[];
  playlist: PlanItem[];
  onApplyPlaylistDuties?: (item: PlanItem) => void;
}

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const EMERALD = '#10B981';

export const AmboPartyEventModal: React.FC<Props> = ({
  isOpen,
  onClose,
  session,
  devices,
  shows,
  playlist,
  onApplyPlaylistDuties,
}) => {
  const [activeTab, setActiveTab] = useState<'devices' | 'playlist_defaults' | 'connect'>('devices');
  const [eventName, setEventName] = useState(session?.eventName || 'Festival & Party Command');
  const [isStarting, setIsStarting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!isOpen) return null;

  const isPartyActive = !!session?.isActive;
  const isMasterSyncEngaged = !!session?.masterSyncEngaged;

  const handleTogglePartyMode = async () => {
    setIsStarting(true);
    try {
      if (isPartyActive) {
        await endPartyEventSession();
      } else {
        await startPartyEventSession(eventName);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleToggleMasterSync = async () => {
    if (!isPartyActive) return;
    await setMasterSync(!isMasterSyncEngaged);
  };

  const handleDutyChange = async (device: PartyEventDevice, dutyType: EventDeviceDuty['dutyType']) => {
    let newDuty: EventDeviceDuty = {
      dutyType,
      title: 'Ambo Output',
      subtitle: '',
    };

    if (dutyType === 'AMBO_PROGRAM') {
      newDuty = { dutyType, title: 'Ambo Program Out', subtitle: 'Live Audience Mirror' };
    } else if (dutyType === 'AMBO_STAGE') {
      newDuty = { dutyType, title: 'Stage Confidence', subtitle: 'Speaker Notes & Clock' };
    } else if (dutyType === 'CHORA_PLAYLIST') {
      newDuty = {
        dutyType,
        title: 'Chora Lounge Mix',
        subtitle: 'Ambient Party Audio',
        sourceData: {
          playlistId: 'lounge_01',
          tracks: [
            { id: 'tr_1', title: 'Summer Vibes & Sunset', artist: 'Chora Artists Collective', url: 'https://cdn.freesound.org/previews/316/316844_4939433-lq.mp3' }
          ]
        }
      };
    } else if (dutyType === 'REELLO_VIDEO') {
      newDuty = {
        dutyType,
        title: 'Reello Highlight Reel',
        subtitle: 'Festival Highlights Loop',
        sourceData: {
          videoId: 'reello_01',
          videoTitle: 'Festival Teaser 4K',
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          loop: true,
        }
      };
    } else if (dutyType === 'AMBO_PRESENTATION') {
      const show = shows[0];
      newDuty = {
        dutyType,
        title: show?.title || 'Selected Presentation',
        subtitle: 'Show Deck Loop',
        sourceData: { show }
      };
    } else if (dutyType === 'AMBIENT_SIGNAGE') {
      newDuty = {
        dutyType,
        title: 'Welcome Screen',
        subtitle: 'Ambient Visualizer',
        sourceData: {
          headline: eventName || 'Welcome to Plajah',
          subheadline: 'Party & Event Experience Active',
        }
      };
    } else if (dutyType === 'STANDBY') {
      newDuty = { dutyType, title: 'Standby', subtitle: 'Waiting for cues' };
    }

    await assignDeviceDuty(device.deviceId, newDuty);
  };

  const getDeviceIcon = (type: EventDeviceType) => {
    switch (type) {
      case 'TV': return <Tv size={18} className="text-[#00DAF3]" />;
      case 'TABLET': return <Tablet size={18} className="text-purple-400" />;
      case 'MOBILE': return <Smartphone size={18} className="text-pink-400" />;
      default: return <Laptop size={18} className="text-emerald-400" />;
    }
  };

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?partyDisplay=1`
    : 'https://plajah.com/?partyDisplay=1';

  const copyShareLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none font-sans">
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[#0d091a] border border-white/15 shadow-2xl overflow-hidden text-white">

        {/* ── MODAL HEADER ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center shadow-lg shadow-purple-900/30">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wide uppercase">Party / Event Central Command</h2>
                {isPartyActive ? (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    LIVE ON AIR
                  </span>
                ) : (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                    STANDBY
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50">
                Transform all signed-in browsers & screens into synchronized or independent audio/visual destinations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Start/Stop Master Party Mode Switch */}
            <button
              onClick={handleTogglePartyMode}
              disabled={isStarting}
              className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide uppercase transition-all shadow-lg flex items-center gap-2 ${
                isPartyActive
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40'
                  : 'bg-gradient-to-r from-[#6B0099] to-[#D40055] hover:brightness-110 text-white shadow-purple-900/30'
              }`}
            >
              <Radio size={14} className={isPartyActive ? 'animate-pulse text-red-400' : ''} />
              <span>{isPartyActive ? 'End Party Mode' : 'Start Party / Event Mode'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── MASTER CONTROL HERO BAR ────────────────────────────────────── */}
        {isPartyActive && (
          <div className="p-4 bg-gradient-to-r from-[#170e2b] via-[#100b21] to-[#1a0f30] border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* THE MASTER SYNC BUTTON */}
              <button
                onClick={handleToggleMasterSync}
                className={`relative px-6 py-3.5 rounded-xl text-xs md:text-sm font-black tracking-wider uppercase flex items-center gap-3 transition-all shadow-2xl ${
                  isMasterSyncEngaged
                    ? 'bg-[#FF8C00] text-black shadow-[#FF8C00]/30 hover:brightness-110 ring-2 ring-[#FF8C00]/50'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                }`}
              >
                <Zap size={18} fill={isMasterSyncEngaged ? 'currentColor' : 'none'} className={isMasterSyncEngaged ? 'animate-bounce' : ''} />
                <div className="text-left">
                  <div>{isMasterSyncEngaged ? '⚡ MASTER SYNC: ALL DEVICES SLAVED' : '🔇 SYNC MUTED: INDEPENDENT DUTIES'}</div>
                  <div className="text-[10px] font-normal opacity-80 normal-case tracking-normal">
                    {isMasterSyncEngaged
                      ? 'Every device follows Master presentation, video, and audio.'
                      : 'Devices return to their assigned playlists, videos, and duties.'}
                  </div>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 font-mono">
                {devices.filter(d => d.isOnline).length} Active Screen(s) Connected
              </span>
              <button
                onClick={copyShareLink}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition-all flex items-center gap-1.5"
              >
                {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Device Link'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── TABS NAVIGATION ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-white/10 bg-white/[0.01]">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
              activeTab === 'devices'
                ? 'border-[#00DAF3] text-[#00DAF3]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Tv size={14} />
            <span>Output Devices ({devices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('playlist_defaults')}
            className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
              activeTab === 'playlist_defaults'
                ? 'border-[#00DAF3] text-[#00DAF3]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Layers size={14} />
            <span>Project Playlist Architecture</span>
          </button>

          <button
            onClick={() => setActiveTab('connect')}
            className={`px-4 py-2 border-b-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
              activeTab === 'connect'
                ? 'border-[#00DAF3] text-[#00DAF3]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <ExternalLink size={14} />
            <span>Pair New Display</span>
          </button>
        </div>

        {/* ── TAB CONTENT ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">

          {/* TAB 1: DEVICE OUTPUTS MATRIX */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                <span>Discovered browsers & hardware logged into your account:</span>
                <span className="font-mono">Real-time Heartbeat Active</span>
              </div>

              {devices.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-dashed border-white/10">
                  <Tv size={48} className="mx-auto text-white/20 mb-3" />
                  <h3 className="text-base font-bold mb-1">No Secondary Devices Detected Yet</h3>
                  <p className="text-xs text-white/50 max-w-md mx-auto mb-4">
                    Open Plajah on any other phone, tablet, laptop, or smart TV signed in to your account.
                    It will automatically appear here as an audio and video output!
                  </p>
                  <button
                    onClick={() => window.open(shareUrl, '_blank')}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-all inline-flex items-center gap-2"
                  >
                    <ExternalLink size={14} />
                    <span>Open Display Window in New Tab</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {devices.map((device) => {
                    const isOnline = device.isOnline;
                    const duty = device.duty || { dutyType: 'AMBO_PROGRAM', title: 'Ambo Program Out' };
                    const isEditing = editingDeviceId === device.deviceId;

                    return (
                      <div
                        key={device.deviceId}
                        className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isOnline
                            ? 'bg-white/[0.03] border-white/15 hover:border-white/25'
                            : 'bg-white/[0.01] border-white/5 opacity-60'
                        }`}
                      >
                        {/* Device Info */}
                        <div className="flex items-center gap-3.5 min-w-[240px]">
                          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            {getDeviceIcon(device.deviceType)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="bg-black/60 border border-[#00DAF3] rounded px-2 py-0.5 text-xs font-bold text-white outline-none"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      setCustomDeviceName(editingName);
                                      setEditingDeviceId(null);
                                    }}
                                    className="p-1 rounded bg-[#00DAF3] text-black text-[10px] font-bold"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <span className="font-extrabold text-sm flex items-center gap-1.5">
                                  {device.deviceName}
                                  <button
                                    onClick={() => {
                                      setEditingDeviceId(device.deviceId);
                                      setEditingName(device.deviceName);
                                    }}
                                    className="text-white/30 hover:text-white transition-colors"
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                </span>
                              )}
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-white/20'
                                }`}
                              />
                            </div>
                            <div className="text-[11px] text-white/40 flex items-center gap-2 mt-0.5">
                              <span>{device.deviceType}</span>
                              <span>·</span>
                              <span>{device.screen ? `${device.screen.width}×${device.screen.height}` : 'Display'}</span>
                              <span>·</span>
                              <span className="font-mono text-[10px]">
                                {isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Assigned Duty Selector */}
                        <div className="flex flex-col gap-1 min-w-[220px]">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                            Assigned Duty
                          </label>
                          <select
                            value={duty.dutyType}
                            onChange={(e) => handleDutyChange(device, e.target.value as any)}
                            className="bg-black/40 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white outline-none hover:border-[#00DAF3] focus:border-[#00DAF3] transition-colors cursor-pointer"
                          >
                            <option value="AMBO_PROGRAM">Ambo Program Out</option>
                            <option value="AMBO_STAGE">Stage Confidence Display</option>
                            <option value="AMBO_PRESENTATION">Specific Presentation</option>
                            <option value="CHORA_PLAYLIST">Chora Music Playlist</option>
                            <option value="REELLO_VIDEO">Reello Video Loop</option>
                            <option value="AMBIENT_SIGNAGE">Ambient Signage / Welcome</option>
                            <option value="STANDBY">Standby Mode</option>
                          </select>
                        </div>

                        {/* Slave Toggle */}
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={device.isSlaved !== false}
                              onChange={(e) => setDeviceSlaved(device.deviceId, e.target.checked)}
                              className="accent-[#FF8C00] w-4 h-4 rounded cursor-pointer"
                            />
                            <div className="text-left">
                              <div className="text-xs font-bold">Participates in Master Sync</div>
                              <div className="text-[10px] text-white/40">
                                {device.isSlaved !== false ? 'Follows master when sync engaged' : 'Always independent'}
                              </div>
                            </div>
                          </label>
                        </div>

                        {/* Controls: Mute, Ping, Popout */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setDeviceAudioMute(device.deviceId, !device.isMuted)}
                            className={`p-2 rounded-lg border transition-all ${
                              device.isMuted
                                ? 'bg-red-500/20 border-red-500/30 text-red-400'
                                : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                            }`}
                            title={device.isMuted ? 'Unmute Audio' : 'Mute Audio'}
                          >
                            {device.isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                          </button>

                          <button
                            onClick={() => pingDevice(device.deviceId)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-[#00DAF3] text-xs font-bold hover:bg-[#00DAF3]/25 transition-all"
                            title="Flash physical screen to identify"
                          >
                            Ping
                          </button>

                          <button
                            onClick={() => window.open(shareUrl, `display_${device.deviceId}`)}
                            className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                            title="Open display in new tab"
                          >
                            <ExternalLink size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PLAYLIST ARCHITECTURE DEFAULTS */}
          {activeTab === 'playlist_defaults' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 text-xs text-purple-200">
                <span className="font-bold">Project Playlist Architecture:</span> You can assign default output duties to each presentation or plan item in your project. When an operator advances to that cue during a service or party, the outputs automatically configure to their designated roles!
              </div>

              <div className="space-y-3">
                {playlist.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white/40">#{idx + 1}</span>
                        <h4 className="font-bold text-sm text-white">{item.title}</h4>
                        {item.live && (
                          <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/40">
                            LIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/50 mt-0.5">
                        Show: {item.show?.title || 'Presentation'} · {Math.floor((item.plannedSec || 0) / 60)} min
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (onApplyPlaylistDuties) onApplyPlaylistDuties(item);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-all flex items-center gap-1.5"
                      >
                        <Play size={12} />
                        <span>Cue Item Output Roles</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: PAIR NEW DISPLAY */}
          {activeTab === 'connect' && (
            <div className="p-6 text-center max-w-lg mx-auto space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
                <Tv size={32} className="text-[#00DAF3]" />
              </div>

              <div>
                <h3 className="text-lg font-bold">Connect Any Browser or Display</h3>
                <p className="text-xs text-white/60 mt-1">
                  Any web browser on your network signed in to your Plajah account automatically links to this Ambo Central Command.
                </p>
              </div>

              <div className="p-3 bg-black/60 border border-white/15 rounded-xl font-mono text-xs flex items-center justify-between">
                <span className="truncate text-white/80">{shareUrl}</span>
                <button
                  onClick={copyShareLink}
                  className="px-3 py-1 rounded bg-[#00DAF3] text-black font-bold text-[11px] hover:brightness-110 ml-2"
                >
                  {copiedLink ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div className="text-xs text-white/40 text-left space-y-2 bg-white/[0.02] p-4 rounded-xl border border-white/10">
                <div className="font-bold text-white/70 uppercase text-[10px] tracking-wider">Quick Setup:</div>
                <div>1. Open the URL above on your Smart TV, iPad, or secondary laptop.</div>
                <div>2. Ensure you are signed in with the same Plajah user account.</div>
                <div>3. The screen immediately becomes a registered output in Ambo Multiview!</div>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL FOOTER ──────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-white/50">
          <span>Ambo Party/Event Mesh Engine v1.0</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold transition-all"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};

export default AmboPartyEventModal;
