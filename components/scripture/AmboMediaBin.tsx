// AmboMediaBin — Visual Library for Live NDI Feeds, Flux Generators, Shaders, and Motion Media.
// Interaction Contract:
//   · Single Click: Cues source in Preview
//   · Double Click: Takes source immediately to Program Out (Live Wire)
//   · Drag & Drop: Drag onto any slide card or output monitor to set as background

import React, { useState } from 'react';
import {
  Video, Radio, Sparkles, Layers, RefreshCw, Plus, Eye, Play, Film, Trash2, Upload, Image as ImageIcon, X,
} from 'lucide-react';
import { type NativeSourceInfo } from '../../services/mediaEngine/bridge';
import { GENERATOR_ITEMS } from '../../services/ambo/mediaLibrary';

export interface AmboMediaSourceItem {
  id: string;
  name: string;
  kind: 'LIVE' | 'GENERATOR' | 'SHADER' | 'VIDEO' | 'IMAGE';
  inputId?: string;
  mode?: string;
  src?: string;
  sub?: string;
  gradient?: string;
  tags?: string[];
}

interface AmboMediaBinProps {
  nativeSources: NativeSourceInfo[];
  onScanNdi: () => void;
  isScanningNdi: boolean;
  onPreviewSource: (item: AmboMediaSourceItem) => void;
  onProgramSource: (item: AmboMediaSourceItem) => void;
  currentLiveInputId?: string | null;
  currentPreviewInputId?: string | null;
  customAssets?: AmboMediaSourceItem[];
  onAddAsset?: (asset: AmboMediaSourceItem) => void;
  onRemoveAsset?: (id: string) => void;
}

const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const line = 'rgba(255,255,255,0.09)';
const glass = 'rgba(255,255,255,0.04)';

// Motion backgrounds with visually striking animated gradients
const MOTION_BACKGROUNDS: AmboMediaSourceItem[] = [
  {
    id: 'bg_aurora',
    name: 'Aurora',
    kind: 'VIDEO',
    gradient: 'radial-gradient(120% 90% at 20% 10%, rgba(0,218,243,.7), transparent 60%), radial-gradient(120% 90% at 90% 90%, #6b0099, transparent 55%), #160a26',
    sub: 'Cosmic Flow',
    tags: ['atmosphere', 'worship'],
  },
  {
    id: 'bg_liquid',
    name: 'Liquid Light',
    kind: 'VIDEO',
    gradient: 'linear-gradient(120deg,#00daf3,#6b0099 60%,#d40055)',
    sub: 'Flowing Gradients',
    tags: ['motion', 'bright'],
  },
  {
    id: 'bg_storm',
    name: 'Storm Cloud',
    kind: 'VIDEO',
    gradient: 'radial-gradient(80% 120% at 50% 0, rgba(0,218,243,.5), transparent), linear-gradient(180deg,#0a1826,#04070d)',
    sub: 'Dramatic Ambience',
    tags: ['energy', 'dark'],
  },
  {
    id: 'bg_nebula',
    name: 'Deep Nebula',
    kind: 'VIDEO',
    gradient: 'radial-gradient(100% 100% at 70% 30%, rgba(212,0,85,.8), transparent 55%), #0a0713',
    sub: 'Stellar Dust',
    tags: ['atmosphere', 'space'],
  },
];

export const AmboMediaBin: React.FC<AmboMediaBinProps> = ({
  nativeSources,
  onScanNdi,
  isScanningNdi,
  onPreviewSource,
  onProgramSource,
  currentLiveInputId,
  currentPreviewInputId,
  customAssets = [],
  onAddAsset,
  onRemoveAsset,
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'flux' | 'motion' | 'assets'>('live');
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetUrl, setNewAssetUrl] = useState('');
  const [newAssetKind, setNewAssetKind] = useState<'IMAGE' | 'VIDEO'>('IMAGE');

  // Convert generator items to unified media source item format
  const fluxGenerators: AmboMediaSourceItem[] = GENERATOR_ITEMS.map(g => ({
    id: g.id,
    name: g.name,
    kind: 'GENERATOR',
    mode: g.content.kind === 'GENERATOR' ? g.content.mode : 'STUDIO_AURORA',
    sub: g.category,
    tags: g.tags,
    gradient:
      g.category === 'Atmosphere'
        ? 'linear-gradient(135deg, #1e1b4b, #4338ca)'
        : g.category === 'Energy'
        ? 'linear-gradient(135deg, #701a75, #db2777)'
        : g.category === 'Graphic'
        ? 'linear-gradient(135deg, #064e3b, #059669)'
        : 'linear-gradient(135deg, #78350f, #d97706)',
  }));

  // Build live video feeds
  const coreFeeds: AmboMediaSourceItem[] = [
    { id: 'switcher:pgm', name: 'Switcher PGM', kind: 'LIVE', inputId: 'switcher:pgm', sub: 'Broadcast PGM' },
    { id: 'switcher:aux1', name: 'Switcher AUX 1', kind: 'LIVE', inputId: 'switcher:aux1', sub: 'Camera Aux' },
    { id: 'decklink_input1', name: 'DeckLink SDI', kind: 'LIVE', inputId: 'decklink_input1', sub: '1080p59.94 SDI' },
  ];

  const ndiFeeds: AmboMediaSourceItem[] = nativeSources
    .filter(s => s.kind === 'ndi')
    .map(s => ({
      id: s.id,
      name: s.streamName || s.label,
      kind: 'LIVE',
      inputId: s.id,
      sub: s.machineName || 'LAN NDI Stream',
      tags: ['ndi', s.format || '1080p'],
    }));

  const liveItems = [...coreFeeds, ...ndiFeeds];

  const handleDragStart = (e: React.DragEvent, item: AmboMediaSourceItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'ambo-source',
      source: item,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex flex-col flex-none min-h-[280px] max-h-[420px] border-b" style={{ borderColor: line }}>
      {/* Category Tabs */}
      <div className="flex items-center px-3.5 pt-3 pb-2 gap-1 border-b" style={{ borderColor: line }}>
        {[
          { id: 'live', label: 'Live & NDI', count: liveItems.length },
          { id: 'flux', label: 'Flux', count: fluxGenerators.length },
          { id: 'motion', label: 'Loops', count: MOTION_BACKGROUNDS.length },
          { id: 'assets', label: 'Assets', count: customAssets.length },
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex-1 py-1 rounded-md text-[9.5px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
              style={{
                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.45)',
              }}
            >
              <span>{tab.label}</span>
              <span className="font-mono text-[8px] opacity-60">({tab.count})</span>
            </button>
          );
        })}
      </div>

      {/* Instruction Tip */}
      <div className="px-3.5 py-1.5 bg-white/[0.02] border-b flex items-center justify-between text-[8px] font-mono text-white/40" style={{ borderColor: line }}>
        <span>Single-click: Preview · Double-click: Take Live</span>
        <span className="text-[#00DAF3]">Drag to Slide</span>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar min-h-[190px]">
        {activeTab === 'live' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8.5px] font-black uppercase tracking-[0.14em] text-[#FF8C00]">Live Video Feeds</span>
              <button
                onClick={onScanNdi}
                disabled={isScanningNdi}
                className="text-[8px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#7c9ce8] flex items-center gap-1 font-mono transition-colors"
                title="Scan LAN for active NDI streams"
              >
                <RefreshCw size={8} className={isScanningNdi ? 'animate-spin' : ''} />
                <span>{isScanningNdi ? 'Scanning...' : 'Scan NDI'}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {liveItems.map(item => {
                const isLive = currentLiveInputId === (item.inputId || item.id);
                const isPreview = currentPreviewInputId === (item.inputId || item.id);
                const isNdi = item.tags?.includes('ndi') || item.id.startsWith('ndi_');

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => handleDragStart(e, item)}
                    onClick={() => onPreviewSource(item)}
                    onDoubleClick={() => onProgramSource(item)}
                    className="flex flex-col p-2 rounded-xl border text-left cursor-pointer select-none transition-all group relative overflow-hidden"
                    style={{
                      background: isLive ? 'rgba(255,140,0,0.18)' : isPreview ? 'rgba(0,218,243,0.14)' : glass,
                      borderColor: isLive ? ORANGE : isPreview ? CYAN : line,
                      boxShadow: isLive ? '0 0 14px rgba(255,140,0,0.25)' : isPreview ? '0 0 12px rgba(0,218,243,0.2)' : 'none',
                    }}
                    title={`Click to preview, Double-click to take live. Drag to assign to slide.`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold truncate text-white">
                      <div className="flex items-center gap-1 truncate">
                        {isNdi ? <Radio size={11} className="text-[#7c9ce8] shrink-0" /> : <Video size={11} className="text-[#00DAF3] shrink-0" />}
                        <span className="truncate">{item.name}</span>
                      </div>
                      {isLive && (
                        <span className="text-[7px] font-black px-1 rounded bg-[#FF8C00] text-black">LIVE</span>
                      )}
                      {!isLive && isPreview && (
                        <span className="text-[7px] font-black px-1 rounded bg-[#00DAF3] text-black">PVW</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1 font-mono text-[8px] text-white/40">
                      <span className="truncate max-w-[85px]">{item.sub}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'flux' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8.5px] font-black uppercase tracking-[0.14em] text-[#00DAF3]">Flux &amp; Shader Library</span>
              <span className="text-[8px] font-mono text-white/35">20 Presets</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {fluxGenerators.map(item => {
                const isLive = currentLiveInputId === (item.mode || item.id);
                const isPreview = currentPreviewInputId === (item.mode || item.id);

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => handleDragStart(e, item)}
                    onClick={() => onPreviewSource(item)}
                    onDoubleClick={() => onProgramSource(item)}
                    className="rounded-xl overflow-hidden border aspect-[16/10] flex flex-col justify-end p-2 cursor-pointer select-none transition-all relative group"
                    style={{
                      background: item.gradient,
                      borderColor: isLive ? ORANGE : isPreview ? CYAN : line,
                      boxShadow: isLive ? '0 0 16px rgba(255,140,0,0.3)' : isPreview ? '0 0 14px rgba(0,218,243,0.25)' : 'none',
                    }}
                    title={`Click to preview, Double-click to take live. Drag onto slide.`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="leading-tight truncate">
                        <span className="text-[10px] font-bold text-white drop-shadow block truncate">{item.name}</span>
                        <span className="font-mono text-[7.5px] text-white/60 uppercase">{item.sub}</span>
                      </div>
                      {isLive && (
                        <span className="text-[7px] font-black px-1 rounded bg-[#FF8C00] text-black">LIVE</span>
                      )}
                      {!isLive && isPreview && (
                        <span className="text-[7px] font-black px-1 rounded bg-[#00DAF3] text-black">PVW</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'motion' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8.5px] font-black uppercase tracking-[0.14em] text-white/50">Motion Backgrounds</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MOTION_BACKGROUNDS.map(item => {
                const isLive = currentLiveInputId === item.id;
                const isPreview = currentPreviewInputId === item.id;

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => handleDragStart(e, item)}
                    onClick={() => onPreviewSource(item)}
                    onDoubleClick={() => onProgramSource(item)}
                    className="rounded-xl overflow-hidden border aspect-[16/10] flex flex-col justify-end p-2 cursor-pointer select-none transition-all relative group"
                    style={{
                      background: item.gradient,
                      borderColor: isLive ? ORANGE : isPreview ? CYAN : line,
                      boxShadow: isLive ? '0 0 16px rgba(255,140,0,0.3)' : isPreview ? '0 0 14px rgba(0,218,243,0.25)' : 'none',
                    }}
                    title={`Click to preview, Double-click to take live. Drag onto slide.`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="leading-tight truncate">
                        <span className="text-[10px] font-bold text-white drop-shadow block truncate">{item.name}</span>
                        <span className="font-mono text-[7.5px] text-white/60">{item.sub}</span>
                      </div>
                      {isLive && (
                        <span className="text-[7px] font-black px-1 rounded bg-[#FF8C00] text-black">LIVE</span>
                      )}
                      {!isLive && isPreview && (
                        <span className="text-[7px] font-black px-1 rounded bg-[#00DAF3] text-black">PVW</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'assets' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8.5px] font-black uppercase tracking-[0.14em] text-[#00DAF3]">
                Project Assets ({customAssets.length})
              </span>
              <button
                onClick={() => setIsAddingAsset(v => !v)}
                className="text-[8px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#00DAF3] flex items-center gap-1 font-bold transition-colors"
                title="Add new asset to be saved with this project"
              >
                <Plus size={9} />
                <span>Add Asset</span>
              </button>
            </div>

            {isAddingAsset && (
              <div className="p-2.5 rounded-xl border border-white/15 bg-black/60 mb-2 space-y-2 text-xs">
                <div className="text-[10px] font-bold text-white flex items-center justify-between">
                  <span>Add Reusable Asset</span>
                  <button onClick={() => setIsAddingAsset(false)} className="text-white/40 hover:text-white"><X size={12} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={newAssetKind}
                    onChange={e => setNewAssetKind(e.target.value as any)}
                    className="bg-black/60 border border-white/20 rounded px-2 py-1 text-[11px] text-white"
                  >
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Asset Title..."
                    value={newAssetName}
                    onChange={e => setNewAssetName(e.target.value)}
                    className="flex-1 bg-black/60 border border-white/20 rounded px-2 py-1 text-[11px] text-white placeholder-white/30"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Asset URL (or choose file below)..."
                    value={newAssetUrl}
                    onChange={e => setNewAssetUrl(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-[11px] text-white placeholder-white/30"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <label className="cursor-pointer text-[10px] text-[#00DAF3] hover:underline flex items-center gap-1">
                    <Upload size={10} />
                    <span>Choose File...</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (!newAssetName) setNewAssetName(file.name.replace(/\.[^/.]+$/, ''));
                          setNewAssetKind(file.type.startsWith('video') ? 'VIDEO' : 'IMAGE');
                          const reader = new FileReader();
                          reader.onload = ev => {
                            if (ev.target?.result) setNewAssetUrl(ev.target.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  <button
                    onClick={() => {
                      if (!newAssetUrl && !newAssetName) return;
                      const item: AmboMediaSourceItem = {
                        id: `asset_${Date.now()}`,
                        name: newAssetName.trim() || 'Custom Asset',
                        kind: newAssetKind,
                        src: newAssetUrl,
                        sub: newAssetKind === 'VIDEO' ? 'Saved Video' : 'Saved Image',
                      };
                      onAddAsset?.(item);
                      setNewAssetName('');
                      setNewAssetUrl('');
                      setIsAddingAsset(false);
                    }}
                    className="px-2.5 py-1 rounded bg-[#00DAF3] text-black font-bold text-[10px] hover:bg-[#00DAF3]/90 transition-all"
                  >
                    Save Asset
                  </button>
                </div>
              </div>
            )}

            {customAssets.length === 0 && !isAddingAsset ? (
              <div className="py-6 text-center text-[10px] text-white/40 border border-dashed border-white/10 rounded-xl">
                No saved assets in this project.
                <button
                  onClick={() => setIsAddingAsset(true)}
                  className="block mx-auto mt-2 text-[#00DAF3] font-bold hover:underline"
                >
                  + Add First Asset
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {customAssets.map(item => {
                  const isLive = currentLiveInputId === item.id;
                  const isPreview = currentPreviewInputId === item.id;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={e => handleDragStart(e, item)}
                      onClick={() => onPreviewSource(item)}
                      onDoubleClick={() => onProgramSource(item)}
                      className="rounded-xl overflow-hidden border aspect-[16/10] flex flex-col justify-between p-2 cursor-pointer select-none transition-all relative group bg-black/40"
                      style={{
                        backgroundImage: item.src && item.kind === 'IMAGE' ? `url(${item.src})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderColor: isLive ? ORANGE : isPreview ? CYAN : line,
                        boxShadow: isLive ? '0 0 16px rgba(255,140,0,0.3)' : isPreview ? '0 0 14px rgba(0,218,243,0.25)' : 'none',
                      }}
                      title="Click to preview, Double-click to take live. Drag onto slide."
                    >
                      {item.kind === 'VIDEO' && item.src && (
                        <video src={item.src} muted playsInline autoPlay loop className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
                      <div className="relative z-10 flex items-center justify-between">
                        <span className="text-[7.5px] font-mono px-1 rounded bg-black/60 text-white/70 uppercase">
                          {item.kind}
                        </span>
                        {onRemoveAsset && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onRemoveAsset(item.id);
                            }}
                            className="p-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove asset"
                          >
                            <Trash2 size={9} />
                          </button>
                        )}
                      </div>
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="leading-tight truncate pr-1">
                          <span className="text-[10px] font-bold text-white drop-shadow block truncate">{item.name}</span>
                          <span className="font-mono text-[7px] text-white/60">{item.sub || 'Asset'}</span>
                        </div>
                        {isLive && (
                          <span className="text-[7px] font-black px-1 rounded bg-[#FF8C00] text-black">LIVE</span>
                        )}
                        {!isLive && isPreview && (
                          <span className="text-[7px] font-black px-1 rounded bg-[#00DAF3] text-black">PVW</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AmboMediaBin;
