// AmboRouterReceiver — Universal Video Router & Receiver for Ambo.
// Handles NDI streams discovered over the network, hardware capture cards (DeckLink SDI),
// Switcher program/aux busses, webcams, and WHEP guests, routing them into:
//   1. Live Audience Program Background
//   2. Preview Cue
//   3. Current Selected Slide (or any slide in deck)
//   4. Aux / Confidence Outputs

import React, { useState } from 'react';
import {
  X, Radio, Video, RefreshCw, Check, ArrowRight, MonitorPlay,
  Tv, Cpu, Shield, ExternalLink, Layers, Play, Eye,
} from 'lucide-react';
import { type NativeSourceInfo } from '../../services/mediaEngine/bridge';
import { type Slide, type LiveStack, newId } from '../../services/ambo/showModel';

export interface AmboRouterReceiverProps {
  isOpen: boolean;
  onClose: () => void;
  nativeSources: NativeSourceInfo[];
  onScanNdi: () => Promise<void>;
  isScanningNdi: boolean;
  selectedSlide: Slide | null;
  slides: Slide[];
  onRouteToSlide: (slideId: string, inputId: string, label: string) => void;
  onRouteToLive: (inputId: string, label: string) => void;
  onRouteToPreview: (inputId: string, label: string) => void;
  currentLiveInputId?: string | null;
  currentPreviewInputId?: string | null;
}

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const line = 'rgba(255,255,255,0.09)';
const line2 = 'rgba(255,255,255,0.16)';
const glass = 'rgba(255,255,255,0.04)';

export const AmboRouterReceiver: React.FC<AmboRouterReceiverProps> = ({
  isOpen,
  onClose,
  nativeSources,
  onScanNdi,
  isScanningNdi,
  selectedSlide,
  slides,
  onRouteToSlide,
  onRouteToLive,
  onRouteToPreview,
  currentLiveInputId,
  currentPreviewInputId,
}) => {
  const [filter, setFilter] = useState<'all' | 'ndi' | 'switcher' | 'hardware'>('all');
  const [targetSlideId, setTargetSlideId] = useState<string>(selectedSlide?.id || (slides[0]?.id ?? ''));

  if (!isOpen) return null;

  // Aggregate all available platform video sources
  const coreSources = [
    {
      id: 'switcher:pgm',
      label: 'Switcher PGM',
      streamName: 'Switcher Program',
      machineName: 'Studio Switcher',
      kind: 'switcher',
      format: '1080p59.94 Broadcast',
    },
    {
      id: 'switcher:aux1',
      label: 'Switcher AUX 1',
      streamName: 'Camera Aux 1',
      machineName: 'Studio Switcher',
      kind: 'switcher',
      format: '1080p59.94 Aux Bus',
    },
    {
      id: 'switcher:aux2',
      label: 'Switcher AUX 2',
      streamName: 'Confidence Aux 2',
      machineName: 'Studio Switcher',
      kind: 'switcher',
      format: '1080p59.94 Confidence',
    },
    {
      id: 'decklink_input1',
      label: 'DeckLink SDI 1',
      streamName: 'Blackmagic SDI In 1',
      machineName: 'Hardware PCIe',
      kind: 'decklink',
      format: '1080p59.94 SDI',
    },
    {
      id: 'decklink_input2',
      label: 'DeckLink SDI 2',
      streamName: 'Blackmagic SDI In 2',
      machineName: 'Hardware PCIe',
      kind: 'decklink',
      format: '1080p59.94 SDI',
    },
  ];

  // Combine core sources with native dynamic sources (NDI etc.)
  const existingIds = new Set(nativeSources.map(s => s.id));
  const allSources = [
    ...nativeSources,
    ...coreSources.filter(c => !existingIds.has(c.id)),
  ];

  const filteredSources = allSources.filter(s => {
    if (filter === 'ndi') return s.kind === 'ndi';
    if (filter === 'switcher') return s.kind === 'switcher';
    if (filter === 'hardware') return s.kind === 'decklink' || s.kind === 'uvc';
    return true;
  });

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#0c0a14] border rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]"
        style={{ borderColor: line2 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-none" style={{ borderColor: line, background: 'rgba(20,14,32,0.6)' }}>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl grid place-items-center text-white" style={{ background: BRAND, boxShadow: '0 6px 20px rgba(212,0,85,0.3)' }}>
              <Radio size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-white tracking-tight">Ambo Router Receiver</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#7c9ce8]/20 text-[#7c9ce8] border border-[#7c9ce8]/30">
                  NDI &amp; Platform Video Matrix
                </span>
              </div>
              <div className="text-[10px] text-white/45">
                Route LAN NDI streams, Switcher busses, and DeckLink inputs directly to Slides, Live Wire, or Preview
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onScanNdi}
              disabled={isScanningNdi}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#7c9ce8]/15 border border-[#7c9ce8]/35 text-[#7c9ce8] hover:bg-[#7c9ce8]/25 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={isScanningNdi ? 'animate-spin' : ''} />
              <span>{isScanningNdi ? 'Probing LAN...' : 'Scan NDI Streams'}</span>
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toolbar: Category filters & target slide selector */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b gap-4 flex-none bg-black/30" style={{ borderColor: line }}>
          {/* Filters */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: 'All Sources' },
              { id: 'ndi', label: 'NDI Streams' },
              { id: 'switcher', label: 'Switcher Busses' },
              { id: 'hardware', label: 'Hardware SDI' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={{
                  background: filter === f.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${filter === f.id ? line2 : 'transparent'}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Slide receiver target dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/50">Target Slide:</span>
            <select
              value={targetSlideId}
              onChange={e => setTargetSlideId(e.target.value)}
              className="bg-white/[0.06] border border-white/12 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-[#00DAF3]"
            >
              {slides.map((s, idx) => (
                <option key={s.id} value={s.id} className="bg-[#0c0a14]">
                  Slide {idx + 1}: {s.label || s.group || 'Untitled'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Sources Table / Matrix */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {filteredSources.length === 0 ? (
            <div className="py-16 text-center text-white/40 space-y-2">
              <Radio size={32} className="mx-auto text-white/20" />
              <p className="text-sm font-semibold">No video streams match filter</p>
              <p className="text-xs text-white/30">Click &ldquo;Scan NDI Streams&rdquo; to probe your local subnet for NDI senders.</p>
            </div>
          ) : (
            filteredSources.map(src => {
              const isNdi = src.kind === 'ndi';
              const isLiveActive = currentLiveInputId === src.id;
              const isPreviewActive = currentPreviewInputId === src.id;
              const isTargetSlideBound = slides.find(s => s.id === targetSlideId)?.layers.some(
                l => l.content.kind === 'LIVE' && l.content.inputId === src.id,
              );

              return (
                <div
                  key={src.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl border transition-all hover:border-white/20"
                  style={{
                    background: isLiveActive ? 'rgba(255,140,0,0.08)' : glass,
                    borderColor: isLiveActive ? ORANGE : line,
                  }}
                >
                  {/* Left: Stream Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-none border"
                      style={{
                        background: isNdi ? 'rgba(124,156,232,0.15)' : 'rgba(0,218,243,0.15)',
                        borderColor: isNdi ? 'rgba(124,156,232,0.3)' : 'rgba(0,218,243,0.3)',
                        color: isNdi ? '#7c9ce8' : CYAN,
                      }}
                    >
                      {isNdi ? <Radio size={18} /> : <Video size={18} />}
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">{src.streamName || src.label}</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono"
                          style={{
                            background: isNdi ? 'rgba(124,156,232,0.2)' : 'rgba(255,255,255,0.1)',
                            color: isNdi ? '#7c9ce8' : 'rgba(255,255,255,0.7)',
                          }}
                        >
                          {src.kind.toUpperCase()}
                        </span>
                        {isLiveActive && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black font-mono bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/30 animate-pulse">
                            ● PROGRAM LIVE
                          </span>
                        )}
                        {isPreviewActive && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black font-mono bg-[#00DAF3]/20 text-[#00DAF3] border border-[#00DAF3]/30">
                            PREVIEW
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 font-mono text-[10px] text-white/40">
                        <span className="truncate">{src.machineName || 'LAN Endpoint'}</span>
                        <span>·</span>
                        <span className="truncate">{src.format || 'Auto Format'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Route Actions (Live, Preview, Slide) */}
                  <div className="flex items-center gap-2 flex-none ml-4">
                    {/* Route to Target Slide */}
                    <button
                      onClick={() => onRouteToSlide(targetSlideId, src.id, src.streamName || src.label)}
                      className="px-3 py-1.5 rounded-xl border text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all"
                      style={{
                        background: isTargetSlideBound ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.06)',
                        borderColor: isTargetSlideBound ? '#10B981' : line,
                        color: isTargetSlideBound ? '#10B981' : 'rgba(255,255,255,0.8)',
                      }}
                      title="Route this input to the selected slide background"
                    >
                      <Layers size={11} />
                      <span>{isTargetSlideBound ? 'Bound to Slide' : 'Route to Slide'}</span>
                    </button>

                    {/* Route to Preview */}
                    <button
                      onClick={() => onRouteToPreview(src.id, src.streamName || src.label)}
                      className="px-3 py-1.5 rounded-xl border text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all hover:border-[#00DAF3]"
                      style={{
                        background: isPreviewActive ? 'rgba(0,218,243,0.2)' : 'rgba(0,218,243,0.08)',
                        borderColor: isPreviewActive ? CYAN : 'rgba(0,218,243,0.3)',
                        color: CYAN,
                      }}
                      title="Cue this input in Preview monitor"
                    >
                      <Eye size={11} />
                      <span>Preview</span>
                    </button>

                    {/* Route to Live Wire (Program) */}
                    <button
                      onClick={() => onRouteToLive(src.id, src.streamName || src.label)}
                      className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-lg hover:brightness-110"
                      style={{
                        background: isLiveActive ? ORANGE : 'linear-gradient(135deg,#FF8C00,#D40055)',
                        color: '#fff',
                        boxShadow: '0 4px 14px rgba(255,140,0,0.3)',
                      }}
                      title="Send this input straight to Audience Program Out"
                    >
                      <Play size={11} fill="#fff" />
                      <span>Take Live</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info banner */}
        <div className="px-6 py-3 border-t flex items-center justify-between text-[10px] text-white/40 flex-none bg-black/40" style={{ borderColor: line }}>
          <div className="flex items-center gap-2">
            <Cpu size={12} className="text-white/30" />
            <span>LAN NDI streams are discovered via native WinUI SDK delegates &amp; mDNS fallback on port 5353.</span>
          </div>
          <button onClick={onClose} className="font-bold text-white/70 hover:text-white transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default AmboRouterReceiver;
