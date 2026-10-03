// SwitcherRouterReceiver — Universal Video Router & Source Selector for the Video Switcher.
// Provides rapid discovery, inspection, and 1-click routing of incoming NDI feeds,
// DeckLink SDI hardware inputs, Webcams, and WHEP streams into Switcher Inputs (SW1–SW4),
// Program (PGM), Preview (PVW), and Aux destinations.

import React, { useState } from 'react';
import {
  X, Radio, Video, RefreshCw, Check, ArrowRight, MonitorPlay,
  Tv, Cpu, Shield, ExternalLink, Layers, Play, Eye, Plus, Camera, Wifi
} from 'lucide-react';
import { MediaEngine } from '../../services/mediaEngine/engine';
import { VideoSource, KIND_LABEL } from '../../services/mediaEngine/types';

export interface SwitcherRouterReceiverProps {
  isOpen: boolean;
  onClose: () => void;
  engine: MediaEngine;
  sources: VideoSource[];
  destinations: { id: string; label: string; kind: string }[];
  routes: Record<string, string>;
  programDestId: string;
  previewDestId: string;
  onScanNdi: () => Promise<void>;
  isScanningNdi: boolean;
  /** Why the last scan found no NDI senders — shown instead of a silent empty list. */
  networkDiagnosis?: string | null;
  initialTargetDestId?: string;
}

const PGM = '#EF4444';
const PVW = '#10B981';

const KIND_COLOR: Record<string, string> = {
  decklink: '#e8b84b',
  ndi: '#7c9ce8',
  srt: '#e88a4b',
  rtmp: '#e0685b',
  webrtc: '#c47ce0',
  uvc: '#3f9e74',
  file: '#8c7f6c',
  braw: '#d94b3f',
};

export const SwitcherRouterReceiver: React.FC<SwitcherRouterReceiverProps> = ({
  isOpen,
  onClose,
  engine,
  sources,
  destinations,
  routes,
  programDestId,
  previewDestId,
  onScanNdi,
  isScanningNdi,
  networkDiagnosis,
  initialTargetDestId,
}) => {
  const [filter, setFilter] = useState<'all' | 'ndi' | 'hardware' | 'cameras' | 'remote'>('all');
  const [targetDestId, setTargetDestId] = useState<string>(initialTargetDestId || 'sw1');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customWhep, setCustomWhep] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const swInputs = destinations.filter(d => d.kind === 'switcherInput');

  // Filter sources
  const filteredSources = sources.filter(s => {
    if (filter === 'ndi') return s.kind === 'ndi' || s.kind === 'omt';
    if (filter === 'hardware') return s.kind === 'decklink' || s.kind === 'braw';
    if (filter === 'cameras') return s.kind === 'uvc';
    if (filter === 'remote') return s.kind === 'webrtc' || s.kind === 'srt' || s.kind === 'rtmp';
    return true;
  });

  const handleRoute = (destId: string, srcId: string) => {
    engine.route(destId, srcId);
  };

  const handleRouteToPgm = (srcId: string) => {
    engine.route(programDestId, srcId);
  };

  const handleRouteToPvw = (srcId: string) => {
    engine.route(previewDestId, srcId);
  };

  const handleAddWhep = async () => {
    if (!customWhep.trim()) return;
    setBusy(true);
    try {
      await engine.addWhep(customWhep.trim());
      setCustomWhep('');
      setShowAddCustom(false);
    } catch {
      // Handled
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#0c0c10] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-none bg-[#121218]">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center text-white bg-gradient-to-br from-[#F59E0B] to-[#D97706] shadow-lg shadow-amber-500/20">
              <Radio size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-white tracking-tight">Video Switcher · Router Selection Receiver</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#7c9ce8]/20 text-[#7c9ce8] border border-[#7c9ce8]/30">
                  Universal Source Matrix
                </span>
              </div>
              <div className="text-[10px] text-white/50">
                Route LAN NDI streams, DeckLink SDI, Cameras, and WHEP feeds directly into Switcher Inputs (SW1–SW4) or Program/Preview
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onScanNdi}
              disabled={isScanningNdi}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#7c9ce8]/15 border border-[#7c9ce8]/35 text-[#7c9ce8] hover:bg-[#7c9ce8]/25 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={isScanningNdi ? "animate-spin" : ""} />
              <span>{isScanningNdi ? "Scanning LAN..." : "Scan NDI + OMT"}</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Action / Filtering Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/8 bg-black/40 gap-4 flex-wrap flex-none">
          {/* Filters */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: 'All Sources' },
              { id: 'ndi', label: 'NDI / OMT' },
              { id: 'hardware', label: 'DeckLink SDI' },
              { id: 'cameras', label: 'Webcams' },
              { id: 'remote', label: 'WHEP / Cloud' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition-all"
                style={{
                  background: filter === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: filter === tab.id ? '#ffffff' : 'rgba(255,255,255,0.45)',
                  border: `1px solid ${filter === tab.id ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Target input quick assignment selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/40">DEFAULT TARGET:</span>
            <select
              value={targetDestId}
              onChange={e => setTargetDestId(e.target.value)}
              aria-label="Default Routing Target"
              className="bg-white/[0.06] border border-white/15 rounded-lg px-2.5 py-1 text-[11px] font-mono text-white outline-none focus:border-amber-400"
            >
              {swInputs.map(d => (
                <option key={d.id} value={d.id} className="bg-[#121218] text-white">
                  {d.label} ({d.id})
                </option>
              ))}
              <option value={programDestId} className="bg-[#121218] text-[#EF4444]">
                Program Output (Direct PGM)
              </option>
              <option value={previewDestId} className="bg-[#121218] text-[#10B981]">
                Preview Cue (Direct PVW)
              </option>
            </select>
          </div>
        </div>

        {/* Source List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {filteredSources.length === 0 ? (
            <div className="py-14 text-center space-y-3">
              <Radio size={36} className="text-white/20 mx-auto" />
              <div className="text-sm font-bold text-white/70">No {filter !== 'all' ? filter.toUpperCase() : ''} video feeds currently detected</div>
              <p className="text-xs text-white/40 max-w-md mx-auto">
                Connect NDI or OMT sources on this network, plug in a DeckLink capture card, or add a WHEP guest stream.
              </p>
              {networkDiagnosis && !isScanningNdi && (
                <p className="text-[11px] max-w-md mx-auto leading-relaxed rounded-lg px-3 py-2" style={{ color: '#ffd166', background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.35)' }}>{networkDiagnosis}</p>
              )}
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={onScanNdi}
                  disabled={isScanningNdi}
                  className="px-4 py-2 rounded-xl bg-[#7c9ce8]/20 border border-[#7c9ce8]/40 text-[#7c9ce8] hover:bg-[#7c9ce8]/30 text-xs font-bold transition-all"
                >
                  {isScanningNdi ? 'Scanning...' : 'Scan LAN for NDI + OMT'}
                </button>
                <button
                  onClick={() => setShowAddCustom(true)}
                  className="px-4 py-2 rounded-xl bg-white/[0.08] border border-white/15 text-white/80 hover:text-white text-xs font-bold transition-all"
                >
                  + Add WHEP Remote Stream
                </button>
              </div>
            </div>
          ) : (
            filteredSources.map(s => {
              const isPgm = routes[programDestId] === s.id;
              const isPvw = routes[previewDestId] === s.id;
              const activeDestinations = destinations.filter(d => routes[d.id] === s.id);

              return (
                <div
                  key={s.id}
                  className="p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-4 bg-white/[0.03] hover:bg-white/[0.05]"
                  style={{
                    borderColor: isPgm ? PGM : isPvw ? PVW : 'rgba(255,255,255,0.08)',
                    boxShadow: isPgm
                      ? '0 0 15px rgba(239,68,68,0.2)'
                      : isPvw
                      ? '0 0 15px rgba(16,185,129,0.2)'
                      : 'none',
                  }}
                >
                  {/* Left: icon & details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="w-10 h-10 rounded-xl grid place-items-center flex-none border"
                      style={{
                        background: `${KIND_COLOR[s.kind] || '#888'}18`,
                        borderColor: `${KIND_COLOR[s.kind] || '#888'}44`,
                        color: KIND_COLOR[s.kind] || '#888',
                      }}
                    >
                      {s.kind === 'ndi' || s.kind === 'omt' ? (
                        <Radio size={18} />
                      ) : s.kind === 'decklink' ? (
                        <Layers size={18} />
                      ) : s.kind === 'uvc' ? (
                        <Camera size={18} />
                      ) : (
                        <Wifi size={18} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px] text-white truncate">{s.label}</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase font-bold"
                          style={{
                            background: `${KIND_COLOR[s.kind] || '#888'}22`,
                            color: KIND_COLOR[s.kind] || '#888',
                            border: `1px solid ${KIND_COLOR[s.kind] || '#888'}44`,
                          }}
                        >
                          {KIND_LABEL[s.kind] || s.kind}
                        </span>
                        {isPgm && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40">
                            PGM LIVE
                          </span>
                        )}
                        {!isPgm && isPvw && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40">
                            PVW CUE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-white/40 truncate mt-0.5 flex items-center gap-2">
                        <span>ID: {s.id}</span>
                        <span>·</span>
                        <span>Latency: {s.latencyMs || 0}ms</span>
                        {activeDestinations.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-400/90 font-bold">
                              Routed to: {activeDestinations.map(d => d.label).join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: 1-Click Routing Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Switcher inputs SW1-SW4 */}
                    {swInputs.map(sw => {
                      const isAssigned = routes[sw.id] === s.id;
                      return (
                        <button
                          key={sw.id}
                          onClick={() => handleRoute(sw.id, s.id)}
                          className="px-2.5 py-1.5 rounded-lg font-mono text-[10px] font-black uppercase transition-all"
                          style={{
                            background: isAssigned ? '#F59E0B' : 'rgba(255,255,255,0.06)',
                            color: isAssigned ? '#000000' : '#ffffff',
                            border: `1px solid ${isAssigned ? '#F59E0B' : 'rgba(255,255,255,0.12)'}`,
                          }}
                          title={`Route ${s.label} to ${sw.label}`}
                        >
                          {sw.label.replace('Input ', 'SW')}
                        </button>
                      );
                    })}

                    <div className="h-6 w-[1px] bg-white/10 mx-1" />

                    {/* Direct PVW */}
                    <button
                      onClick={() => handleRouteToPvw(s.id)}
                      className="px-2.5 py-1.5 rounded-lg font-mono text-[10px] font-black uppercase flex items-center gap-1 transition-all"
                      style={{
                        background: isPvw ? PVW : 'rgba(16,185,129,0.15)',
                        color: isPvw ? '#000' : PVW,
                        border: `1px solid ${PVW}55`,
                      }}
                      title="Cue directly into Switcher Preview"
                    >
                      <Eye size={11} />
                      PVW
                    </button>

                    {/* Direct PGM */}
                    <button
                      onClick={() => handleRouteToPgm(s.id)}
                      className="px-2.5 py-1.5 rounded-lg font-mono text-[10px] font-black uppercase flex items-center gap-1 transition-all"
                      style={{
                        background: isPgm ? PGM : 'rgba(239,68,68,0.15)',
                        color: isPgm ? '#000' : PGM,
                        border: `1px solid ${PGM}55`,
                      }}
                      title="Take directly to Switcher Program"
                    >
                      <Play size={11} fill={isPgm ? '#000' : PGM} />
                      PGM
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer / WHEP addition */}
        <div className="p-4 border-t border-white/10 bg-[#121218] flex items-center justify-between text-xs text-white/50">
          {showAddCustom ? (
            <div className="flex items-center gap-2 w-full">
              <input
                value={customWhep}
                onChange={e => setCustomWhep(e.target.value)}
                placeholder="https://relay.plajah.com/whep/endpoint"
                className="flex-1 bg-white/[0.05] border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
              />
              <button
                onClick={handleAddWhep}
                disabled={busy || !customWhep.trim()}
                className="px-3 py-1.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-white/90 disabled:opacity-40"
              >
                {busy ? 'Adding...' : 'Add WHEP'}
              </button>
              <button
                onClick={() => setShowAddCustom(false)}
                className="px-2 py-1.5 text-white/50 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Router Engine active: {sources.length} sources registered across LAN & hardware</span>
              </div>
              <button
                onClick={() => setShowAddCustom(true)}
                className="text-amber-400 hover:text-amber-300 font-bold transition-colors"
              >
                + Add WHEP remote stream
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
