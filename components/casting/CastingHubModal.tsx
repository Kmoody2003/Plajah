/**
 * CastingHubModal: Universal Casting Hub for Plajah
 * 
 * Supports:
 * - Google Cast (Chromecast / Google Nest / Android TV)
 * - Matter 1.3 Casting (Smart Displays, Smart TVs, Matter Audio Clusters)
 * - Samsung Smart View (Tizen Smart TVs, Soundbars & Multiroom Groups)
 * - Single Devices & Speaker/Display Groups
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useUnifiedCasting } from '../../hooks/useUnifiedCasting';
import { CastDevice, CastProtocol } from '../../services/casting/unifiedCastingService';
import { 
  Cast, 
  Tv, 
  Speaker, 
  Radio, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  X, 
  Check, 
  Sparkles, 
  Layers, 
  Users, 
  Plus, 
  ChevronRight,
  Disc,
  Wifi,
  ShieldCheck,
  Smartphone,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CastingHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: {
    title: string;
    artist?: string;
    albumTitle?: string;
    imageUrl?: string;
    contentUrl?: string;
    mediaType?: 'audio' | 'video';
  };
}

const CYAN = '#00F5D4';
const VIOLET = '#7928CA';
const SAMSUNG_BLUE = '#1428A0';
const GOOGLE_YELLOW = '#FBBC05';

export const CastingHubModal: React.FC<CastingHubModalProps> = ({ isOpen, onClose, media }) => {
  const {
    isCasting,
    isScanning,
    activeDevice,
    devices,
    groups,
    volume,
    isMuted,
    scanDevices,
    startCasting,
    stopCasting,
    setVolume,
    toggleMute,
    addCustomDevice,
    removeCustomDevice,
    requestGoogleCastPicker,
  } = useUnifiedCasting();

  const [activeTab, setActiveTab] = useState<'devices' | 'groups' | 'samsung' | 'matter'>('devices');
  const [protocolFilter, setProtocolFilter] = useState<'all' | CastProtocol>('all');
  const [manualIp, setManualIp] = useState('');
  const [manualName, setManualName] = useState('');
  const [matterCode, setMatterCode] = useState('');
  const [isConnectingId, setIsConnectingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      scanDevices();
    }
  }, [isOpen, scanDevices]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    if (protocolFilter === 'all') return devices;
    return devices.filter(d => d.protocol === protocolFilter);
  }, [devices, protocolFilter]);

  const handleDeviceClick = async (device: CastDevice) => {
    if (activeDevice?.id === device.id && isCasting) {
      await stopCasting();
      return;
    }
    setIsConnectingId(device.id);
    try {
      await startCasting(device, media);
    } finally {
      setIsConnectingId(null);
    }
  };

  const handleAddSamsungDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIp.trim()) return;
    const name = manualName.trim() || `Samsung Smart TV (${manualIp.trim()})`;
    addCustomDevice({
      name,
      protocol: 'samsung_smartview',
      type: 'tv',
      model: 'Samsung Tizen Smart View',
      ip: manualIp.trim(),
      location: 'Custom Network Device',
      isGroup: false,
      volume: 0.8,
      isMuted: false,
      capabilities: { audio: true, video: true, lyrics: true, visualizer: true, hiresAudio: true }
    });
    setManualIp('');
    setManualName('');
    setActiveTab('devices');
  };

  const handleAddMatterEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matterCode.trim()) return;
    addCustomDevice({
      name: `Matter Display (${matterCode.slice(0, 6)}...)`,
      protocol: 'matter',
      type: 'display',
      model: 'Matter 1.3 Commissioned Node',
      location: 'Commissioned Device',
      isGroup: false,
      volume: 0.8,
      isMuted: false,
      capabilities: { audio: true, video: true, lyrics: true, visualizer: false, hiresAudio: true }
    });
    setMatterCode('');
    setActiveTab('devices');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.95)] border border-white/10"
          style={{
            background: 'linear-gradient(180deg, rgba(20,20,30,0.96) 0%, rgba(10,10,18,0.98) 100%)',
          }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center relative overflow-hidden"
                style={{
                  background: isCasting ? `linear-gradient(135deg, ${CYAN}, ${VIOLET})` : 'rgba(255,255,255,0.06)',
                  boxShadow: isCasting ? `0 0 20px ${CYAN}66` : 'none',
                }}
              >
                <Cast size={20} className={isCasting ? 'text-black' : 'text-white/80'} />
                {isCasting && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-black animate-ping" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-tight">Cast Audio & Video</h2>
                  {isCasting && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Live
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50">
                  Google Cast • Matter 1.3 • Samsung Smart View
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scanDevices()}
                disabled={isScanning}
                title="Scan for nearby devices"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
              >
                <RefreshCw size={14} className={isScanning ? 'animate-spin text-cyan-400' : ''} />
                <span className="hidden sm:inline">{isScanning ? 'Scanning...' : 'Scan'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Active Session Bar (if connected) */}
          {isCasting && activeDevice && (
            <div 
              className="mx-6 mt-4 p-4 rounded-2xl border flex flex-col gap-3 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 245, 212, 0.08) 0%, rgba(121, 40, 202, 0.08) 100%)',
                borderColor: 'rgba(0, 245, 212, 0.35)',
                boxShadow: '0 8px 32px rgba(0, 245, 212, 0.1)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
                    {activeDevice.type === 'tv' ? <Tv size={20} /> : <Speaker size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white truncate">{activeDevice.name}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-cyan-300">
                        {activeDevice.protocol === 'google_cast' ? 'Google' : activeDevice.protocol === 'samsung_smartview' ? 'Samsung' : 'Matter'}
                      </span>
                    </div>
                    <div className="text-xs text-white/60 truncate flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{media.title} — {media.artist || 'Plajah'}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={stopCasting}
                  className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-semibold transition-all"
                >
                  Disconnect
                </button>
              </div>

              {/* Volume Slider for Cast Target */}
              <div className="flex items-center gap-3 pt-1 border-t border-white/10">
                <button
                  type="button"
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  className="text-white/60 hover:text-white transition-all"
                >
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  aria-label="Cast Volume"
                  className="flex-1 appearance-none cursor-pointer h-1.5 rounded-full bg-white/10"
                  style={{
                    background: `linear-gradient(90deg, ${CYAN} ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`
                  }}
                />
                <span className="text-xs font-mono text-white/50 w-8 text-right">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 px-6 pt-4 border-b border-white/10 text-xs font-semibold overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('devices')}
              className={`pb-3 px-3 transition-all relative whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'devices' ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Tv size={14} />
              <span>Devices ({devices.length})</span>
              {activeTab === 'devices' && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('groups')}
              className={`pb-3 px-3 transition-all relative whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'groups' ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Users size={14} />
              <span>Speaker & TV Groups ({groups.length})</span>
              {activeTab === 'groups' && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('samsung')}
              className={`pb-3 px-3 transition-all relative whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'samsung' ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Smartphone size={14} />
              <span>Samsung Connect</span>
              {activeTab === 'samsung' && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('matter')}
              className={`pb-3 px-3 transition-all relative whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'matter' ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <ShieldCheck size={14} />
              <span>Matter Setup</span>
              {activeTab === 'matter' && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
              )}
            </button>
          </div>

          {/* Sub-Filters for Protocol (Devices Tab Only) */}
          {activeTab === 'devices' && (
            <div className="flex items-center gap-1.5 px-6 pt-3 pb-1 text-[11px] font-semibold">
              <span className="text-white/40 mr-1">Filter:</span>
              {(['all', 'google_cast', 'matter', 'samsung_smartview'] as const).map((p) => {
                const label = p === 'all' ? 'All Ecosystems' : p === 'google_cast' ? 'Google Cast' : p === 'matter' ? 'Matter' : 'Samsung';
                const isSel = protocolFilter === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProtocolFilter(p)}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      isSel 
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' 
                        : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[260px] max-h-[460px] space-y-2">
            {/* DEVICES TAB */}
            {activeTab === 'devices' && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await requestGoogleCastPicker();
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 shadow-sm"
                  >
                    <Cast size={15} />
                    <span>Scan Local Network (Google Cast / Nest)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('samsung')}
                    className="py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300"
                  >
                    <Tv size={15} />
                    <span className="hidden sm:inline">Add Samsung</span>
                  </button>
                </div>

                {filteredDevices.length === 0 ? (
                  <div className="py-10 px-4 text-center rounded-2xl border border-white/5 bg-white/[0.01] space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 text-white/40 flex items-center justify-center mx-auto">
                      <Cast size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">No Local Casting Devices Found Yet</h4>
                      <p className="text-xs text-white/50 max-w-sm mx-auto mt-1">
                        Make sure your Chromecast, Google TV, Nest Hub, or Smart TV is powered on and connected to the same Wi-Fi network.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await requestGoogleCastPicker();
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-black flex items-center gap-2 transition-all shadow-md hover:brightness-110"
                        style={{ background: CYAN }}
                      >
                        <Cast size={14} /> Open Cast Picker
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('samsung')}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-white/80 bg-white/10 hover:bg-white/20 transition-all flex items-center gap-2"
                      >
                        <Tv size={14} /> Connect Samsung TV by IP
                      </button>
                    </div>
                  </div>
                ) : (
                  filteredDevices.map((device) => {
                    const isCurrent = activeDevice?.id === device.id && isCasting;
                    const isPending = isConnectingId === device.id;

                    return (
                      <div
                        key={device.id}
                        className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                          isCurrent
                            ? 'bg-cyan-500/15 border-cyan-400/50 shadow-[0_0_20px_rgba(0,245,212,0.15)]'
                            : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/5 hover:border-white/15'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleDeviceClick(device)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left"
                        >
                          <div 
                            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isCurrent ? 'bg-cyan-400 text-black' : 'bg-white/5 text-white/70'
                            }`}
                          >
                            {device.type === 'tv' ? <Tv size={20} /> : <Speaker size={20} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-white truncate">{device.name}</span>
                              <span 
                                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                style={{
                                  background: device.protocol === 'google_cast' 
                                    ? 'rgba(251, 188, 5, 0.15)' 
                                    : device.protocol === 'samsung_smartview'
                                    ? 'rgba(20, 40, 160, 0.25)'
                                    : 'rgba(121, 40, 202, 0.2)',
                                  color: device.protocol === 'google_cast' 
                                    ? GOOGLE_YELLOW 
                                    : device.protocol === 'samsung_smartview'
                                    ? '#58A6FF'
                                    : '#D2A8FF',
                                  border: '1px solid currentColor'
                                }}
                              >
                                {device.protocol === 'google_cast' ? 'Google Cast' : device.protocol === 'samsung_smartview' ? 'Samsung View' : 'Matter 1.3'}
                              </span>
                            </div>
                            <div className="text-xs text-white/40 truncate mt-0.5 flex items-center gap-2">
                              <span>{device.location || device.model || 'Smart Endpoint'}</span>
                              {device.capabilities?.hiresAudio && (
                                <span className="text-[10px] text-emerald-400 font-mono">Hi-Res Audio</span>
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isPending ? (
                            <RefreshCw size={16} className="animate-spin text-cyan-400" />
                          ) : isCurrent ? (
                            <button
                              type="button"
                              onClick={() => handleDeviceClick(device)}
                              className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-red-400 transition-colors"
                            >
                              <Check size={16} /> Connected
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeviceClick(device)}
                              className="p-1.5 text-white/30 hover:text-white"
                            >
                              <ChevronRight size={16} />
                            </button>
                          )}

                          {device.id.startsWith('custom-') && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCustomDevice(device.id);
                              }}
                              title="Remove custom device"
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* GROUPS TAB */}
            {activeTab === 'groups' && (
              <>
                {groups.length === 0 ? (
                  <div className="py-12 px-4 text-center rounded-2xl border border-white/5 bg-white/[0.01] space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
                      <Layers size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">No Speaker or TV Groups</h4>
                      <p className="text-xs text-white/50 max-w-sm mx-auto mt-1">
                        Create speaker groups in the Google Home app or Samsung SmartThings app, and they will automatically appear here for synchronized whole-home playback.
                      </p>
                    </div>
                  </div>
                ) : (
                  groups.map((group) => {
                    const isCurrent = activeDevice?.id === group.id && isCasting;
                    const isPending = isConnectingId === group.id;

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => handleDeviceClick(group)}
                        className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                          isCurrent
                            ? 'bg-cyan-500/15 border-cyan-400/50 shadow-[0_0_20px_rgba(0,245,212,0.15)]'
                            : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div 
                            className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isCurrent ? 'bg-cyan-400 text-black' : 'bg-white/5 text-cyan-400'
                            }`}
                          >
                            <Layers size={22} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white truncate">{group.name}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                {group.groupMemberCount} Speakers / TVs
                              </span>
                            </div>
                            <div className="text-xs text-white/50 truncate mt-1">
                              {group.groupMemberNames?.join(' • ')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isPending ? (
                            <RefreshCw size={16} className="animate-spin text-cyan-400" />
                          ) : isCurrent ? (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                              <Check size={16} /> In Sync
                            </span>
                          ) : (
                            <ChevronRight size={16} className="text-white/30" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}

            {/* SAMSUNG DIRECT CONNECT TAB */}
            {activeTab === 'samsung' && (
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <Tv size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Samsung Smart View & Multiroom</h3>
                    <p className="text-xs text-white/50">Direct LAN WebSocket connection (port 8001 / 8002) for Samsung Smart TVs</p>
                  </div>
                </div>

                <form onSubmit={handleAddSamsungDevice} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-white/70 mb-1">Samsung TV IP Address</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.1.145"
                      value={manualIp}
                      onChange={(e) => setManualIp(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/70 mb-1">Custom Label (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Master Bedroom The Frame"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-black transition-all shadow-lg"
                    style={{ background: CYAN }}
                  >
                    Add Samsung Device
                  </button>
                </form>
              </div>
            )}

            {/* MATTER SETUP TAB */}
            {activeTab === 'matter' && (
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Matter 1.3 Commissioning</h3>
                    <p className="text-xs text-white/50">Pair with CSA Matter Content Launcher (0x0504) media endpoint</p>
                  </div>
                </div>

                <form onSubmit={handleAddMatterEndpoint} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-white/70 mb-1">Matter Commissioning Code / PIN</label>
                    <input
                      type="text"
                      placeholder="e.g. 3497-201-8461"
                      value={matterCode}
                      onChange={(e) => setMatterCode(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400 transition-all font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${VIOLET}, #4F46E5)` }}
                  >
                    Pair Matter Screen
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Footer Media Summary */}
          <div className="px-6 py-3.5 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs text-white/50">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-white/80 truncate">Broadcasting:</span>
              <span className="truncate text-cyan-300 font-medium">{media.title}</span>
              {media.artist && <span className="text-white/40 truncate">({media.artist})</span>}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 text-[11px] font-mono text-white/40">
              <Wifi size={12} /> Lossless Wi-Fi Audio
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
