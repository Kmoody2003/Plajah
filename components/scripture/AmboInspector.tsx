// AmboInspector — Comprehensive Slide & Layer Inspector Settings UI for Ambo.
// Allows operator to configure slide properties, layer assignments, transitions,
// and choose sources (NDI streams, Live Video, Flux Generators, Shaders, Media, Scripture, Text).

import React, { useState } from 'react';
import {
  X, Layers, Settings, Sliders, Video, Sparkles, Type, BookOpen,
  Image as ImageIcon, Volume2, Clock, Palette, ChevronRight, Check,
  Radio, RefreshCw, Eye, Play, ArrowRight,
} from 'lucide-react';
import {
  type Slide, type SlideLayer, type LayerSlot, type LayerContent,
  LAYER_ORDER, LAYER_LABEL, newId,
} from '../../services/ambo/showModel';
import { GENERATOR_ITEMS } from '../../services/ambo/mediaLibrary';
import { type NativeSourceInfo } from '../../services/mediaEngine/bridge';

interface AmboInspectorProps {
  slide: Slide | null;
  onUpdateSlide: (updated: Slide) => void;
  onClose: () => void;
  nativeSources: NativeSourceInfo[];
  onScanNdi?: () => void;
  isScanningNdi?: boolean;
  onTakeSlide?: (slide: Slide) => void;
}

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const line = 'rgba(255,255,255,0.09)';
const line2 = 'rgba(255,255,255,0.15)';
const glass = 'rgba(255,255,255,0.04)';

const GROUP_PRESETS = [
  { name: 'Intro', color: '#8B5CF6' },
  { name: 'Verse 1', color: '#3B82F6' },
  { name: 'Verse 2', color: '#06B6D4' },
  { name: 'Chorus', color: '#EC4899' },
  { name: 'Bridge', color: '#F59E0B' },
  { name: 'Tag', color: '#10B981' },
  { name: 'Sermon', color: '#E3C57E' },
  { name: 'Outro', color: '#6B7280' },
];

export const AmboInspector: React.FC<AmboInspectorProps> = ({
  slide,
  onUpdateSlide,
  onClose,
  nativeSources,
  onScanNdi,
  isScanningNdi,
  onTakeSlide,
}) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'details' | 'automation'>('layers');
  const [selectedSlot, setSelectedSlot] = useState<LayerSlot>('background');

  if (!slide) {
    return (
      <aside className="w-80 border-l flex flex-col p-6 items-center justify-center text-center text-white/40" style={{ borderColor: line, background: 'rgba(10,7,17,0.92)' }}>
        <Sliders size={28} className="mb-2 text-white/20" />
        <p className="text-xs font-semibold">No Slide Selected</p>
        <p className="text-[10px] mt-1 text-white/30">Click a slide in the grid to inspect and adjust its sources and properties.</p>
      </aside>
    );
  }

  // Ensure layer exists on slide or create template for that slot
  const currentLayer = slide.layers.find(l => l.slot === selectedSlot);

  const updateSlideField = <K extends keyof Slide>(field: K, value: Slide[K]) => {
    onUpdateSlide({ ...slide, [field]: value });
  };

  const updateLayer = (slot: LayerSlot, patch: Partial<SlideLayer>) => {
    const existing = slide.layers.find(l => l.slot === slot);
    let newLayers: SlideLayer[];
    if (existing) {
      newLayers = slide.layers.map(l => (l.slot === slot ? { ...l, ...patch } : l));
    } else {
      newLayers = [
        ...slide.layers,
        {
          id: newId('ly'),
          slot,
          content: patch.content ?? { kind: 'COLOR' as any, color: '#000000' },
          enabled: true,
          ...patch,
        },
      ];
    }
    onUpdateSlide({ ...slide, layers: newLayers });
  };

  const setLayerContent = (slot: LayerSlot, content: LayerContent) => {
    updateLayer(slot, { content });
  };

  return (
    <aside className="w-84 border-l flex flex-col z-20 overflow-hidden shadow-2xl backdrop-blur-xl" style={{ borderColor: line, background: 'rgba(10,7,17,0.96)', width: 330 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b flex-none" style={{ borderColor: line }}>
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-[#00DAF3]" />
          <div className="leading-tight">
            <span className="text-[12px] font-bold text-white tracking-tight">Slide Inspector</span>
            <div className="text-[9.5px] text-white/40 truncate max-w-[170px]">{slide.label || 'Untitled Slide'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onTakeSlide && (
            <button
              onClick={() => onTakeSlide(slide)}
              className="px-2 py-1 rounded text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
              style={{ background: ORANGE, color: '#000' }}
              title="Take this slide live to Program Out"
            >
              <Play size={10} fill="#000" /> Take
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-2 py-1.5 border-b gap-1 flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
        {[
          { id: 'layers', label: 'Layers & Sources', icon: Layers },
          { id: 'details', label: 'Slide Details', icon: Settings },
          { id: 'automation', label: 'Actions', icon: Clock },
        ].map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-semibold transition-all"
              style={{
                background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.45)',
              }}
            >
              <Icon size={11} className={active ? 'text-[#00DAF3]' : ''} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
        {activeTab === 'layers' && (
          <>
            {/* Slot selector pill list */}
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 mb-1.5 block">Layer Stack</span>
              <div className="grid grid-cols-3 gap-1">
                {(['background', 'fill', 'slide', 'scripture', 'prop', 'overlay'] as LayerSlot[]).map(slot => {
                  const hasLayer = slide.layers.some(l => l.slot === slot);
                  const isSel = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className="px-2 py-1.5 rounded-lg border text-left flex flex-col transition-all"
                      style={{
                        borderColor: isSel ? CYAN : hasLayer ? line2 : line,
                        background: isSel ? 'rgba(0,218,243,0.12)' : hasLayer ? glass : 'transparent',
                        color: isSel ? '#fff' : hasLayer ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      <span className="text-[10px] font-bold capitalize truncate">{LAYER_LABEL[slot]}</span>
                      <span className="font-mono text-[7.5px] text-white/40">{hasLayer ? 'Active' : 'Empty'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Layer Source Configurator */}
            <div className="p-3 rounded-xl border space-y-3" style={{ borderColor: line2, background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#00DAF3]">
                  {LAYER_LABEL[selectedSlot]} Source
                </span>
                {currentLayer && (
                  <button
                    onClick={() => {
                      onUpdateSlide({
                        ...slide,
                        layers: slide.layers.filter(l => l.slot !== selectedSlot),
                      });
                    }}
                    className="text-[9px] text-red-400 hover:text-red-300 font-mono transition-colors"
                  >
                    Clear Layer
                  </button>
                )}
              </div>

              {/* Source Kind Picker */}
              <div>
                <span className="text-[8.5px] font-mono text-white/40 block mb-1">Source Kind</span>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'LIVE', label: 'Live / NDI', icon: Video },
                    { id: 'GENERATOR', label: 'Generator', icon: Sparkles },
                    { id: 'TEXT', label: 'Text', icon: Type },
                    { id: 'VIDEO', label: 'Motion', icon: ImageIcon },
                    { id: 'IMAGE', label: 'Image', icon: ImageIcon },
                    { id: 'SCRIPTURE', label: 'Verse', icon: BookOpen },
                  ].map(k => {
                    const Icon = k.icon;
                    const isKind = currentLayer?.content?.kind === k.id;
                    return (
                      <button
                        key={k.id}
                        onClick={() => {
                          if (k.id === 'LIVE') {
                            setLayerContent(selectedSlot, { kind: 'LIVE', inputId: 'switcher:pgm', label: 'Switcher PGM' });
                          } else if (k.id === 'GENERATOR') {
                            setLayerContent(selectedSlot, { kind: 'GENERATOR', mode: 'STUDIO_AURORA' });
                          } else if (k.id === 'TEXT') {
                            setLayerContent(selectedSlot, { kind: 'TEXT', blocks: [{ text: slide.label || 'Slide Text', role: 'body' }] });
                          } else if (k.id === 'VIDEO') {
                            setLayerContent(selectedSlot, { kind: 'VIDEO', src: 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4', loop: true });
                          } else if (k.id === 'IMAGE') {
                            setLayerContent(selectedSlot, { kind: 'IMAGE', src: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80', fit: 'cover' });
                          } else if (k.id === 'SCRIPTURE') {
                            setLayerContent(selectedSlot, { kind: 'SCRIPTURE', refId: 'Luke 15:20', reference: 'Luke 15:20 · KJV' });
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all"
                        style={{
                          borderColor: isKind ? CYAN : line,
                          background: isKind ? 'rgba(0,218,243,0.15)' : glass,
                          color: isKind ? '#fff' : 'rgba(255,255,255,0.6)',
                        }}
                      >
                        <Icon size={10} className={isKind ? 'text-[#00DAF3]' : 'text-white/40'} />
                        <span className="truncate">{k.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-config: LIVE / NDI */}
              {currentLayer?.content?.kind === 'LIVE' && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-white/50">Select Video Input / NDI</span>
                    {onScanNdi && (
                      <button
                        onClick={onScanNdi}
                        disabled={isScanningNdi}
                        className="text-[8px] font-mono text-[#7c9ce8] hover:text-white flex items-center gap-1"
                      >
                        <RefreshCw size={8} className={isScanningNdi ? 'animate-spin' : ''} />
                        Scan NDI
                      </button>
                    )}
                  </div>
                  <select
                    value={currentLayer.content.inputId}
                    onChange={e => {
                      const id = e.target.value;
                      const found = nativeSources.find(s => s.id === id);
                      setLayerContent(selectedSlot, {
                        kind: 'LIVE',
                        inputId: id,
                        label: found?.label ?? id,
                        fit: currentLayer.content.kind === 'LIVE' ? currentLayer.content.fit : 'cover',
                      });
                    }}
                    className="w-full bg-black/60 border border-white/12 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#00DAF3]"
                  >
                    <optgroup label="Switcher Busses">
                      <option value="switcher:pgm">Switcher PGM (Live Broadcast)</option>
                      <option value="switcher:aux1">Switcher AUX 1 (Camera Aux)</option>
                      <option value="switcher:aux2">Switcher AUX 2 (Confidence)</option>
                    </optgroup>
                    <optgroup label="Discovered NDI Streams">
                      {nativeSources.filter(s => s.kind === 'ndi').map(s => (
                        <option key={s.id} value={s.id}>NDI: {s.streamName || s.label} ({s.machineName || 'LAN'})</option>
                      ))}
                      {nativeSources.filter(s => s.kind === 'ndi').length === 0 && (
                        <option value="ndi_lan_discovery" disabled>No active NDI feeds detected</option>
                      )}
                    </optgroup>
                    <optgroup label="Hardware Capture / SDI">
                      <option value="decklink_input1">DeckLink SDI 1 (1080p59.94)</option>
                      <option value="decklink_input2">DeckLink SDI 2 (1080p59.94)</option>
                    </optgroup>
                  </select>
                </div>
              )}

              {/* Sub-config: GENERATOR */}
              {currentLayer?.content?.kind === 'GENERATOR' && (
                <div className="space-y-2 pt-1">
                  <span className="text-[9px] font-mono text-white/50 block">Flux / Shader Preset</span>
                  <select
                    value={currentLayer.content.mode}
                    onChange={e => {
                      setLayerContent(selectedSlot, {
                        kind: 'GENERATOR',
                        mode: e.target.value,
                      });
                    }}
                    className="w-full bg-black/60 border border-white/12 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#00DAF3]"
                  >
                    {GENERATOR_ITEMS.map(g => (
                      <option key={g.id} value={g.content.kind === 'GENERATOR' ? g.content.mode : ''}>
                        {g.category}: {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sub-config: TEXT */}
              {currentLayer?.content?.kind === 'TEXT' && (
                <div className="space-y-2 pt-1">
                  <span className="text-[9px] font-mono text-white/50 block">Slide Body Text</span>
                  <textarea
                    value={currentLayer.content.blocks.map(b => b.text).join('\n')}
                    onChange={e => {
                      setLayerContent(selectedSlot, {
                        kind: 'TEXT',
                        blocks: [{ text: e.target.value, role: 'body' }],
                        style: currentLayer.content.kind === 'TEXT' ? currentLayer.content.style : undefined,
                      });
                    }}
                    rows={4}
                    className="w-full bg-black/60 border border-white/12 rounded-lg p-2 text-xs text-white outline-none focus:border-[#00DAF3] resize-none font-sans"
                    placeholder="Enter slide lyrics or text..."
                  />
                </div>
              )}

              {/* Geometry / Fit */}
              <div className="pt-2 border-t border-white/6 flex items-center justify-between">
                <span className="text-[9px] font-mono text-white/40">Fit / Scale Mode</span>
                <select
                  value={(currentLayer?.content as any)?.fit || 'cover'}
                  onChange={e => {
                    if (currentLayer?.content) {
                      setLayerContent(selectedSlot, {
                        ...currentLayer.content,
                        fit: e.target.value as any,
                      } as any);
                    }
                  }}
                  className="bg-black/40 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white outline-none"
                >
                  <option value="cover">Cover (Fill screen)</option>
                  <option value="contain">Contain (Letterbox)</option>
                  <option value="fill">Stretch</option>
                </select>
              </div>
            </div>
          </>
        )}

        {activeTab === 'details' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 mb-1 block">Slide Label</label>
              <input
                type="text"
                value={slide.label || ''}
                onChange={e => updateSlideField('label', e.target.value)}
                placeholder="Slide Label..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#00DAF3]"
              />
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 mb-1.5 block">Group &amp; Rail Color</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {GROUP_PRESETS.map(gp => (
                  <button
                    key={gp.name}
                    onClick={() => {
                      onUpdateSlide({
                        ...slide,
                        group: gp.name,
                        groupColor: gp.color,
                      });
                    }}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold border transition-all flex items-center gap-1.5"
                    style={{
                      borderColor: slide.group === gp.name ? gp.color : line,
                      background: slide.group === gp.name ? `${gp.color}22` : glass,
                      color: slide.group === gp.name ? '#fff' : 'rgba(255,255,255,0.7)',
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: gp.color }} />
                    <span>{gp.name}</span>
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={slide.group || ''}
                onChange={e => updateSlideField('group', e.target.value)}
                placeholder="Custom Group Name..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#00DAF3]"
              />
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 mb-1 block">Stage Notes (Confidence Screen)</label>
              <textarea
                value={slide.stageNotes || ''}
                onChange={e => updateSlideField('stageNotes', e.target.value)}
                rows={3}
                placeholder="Speaker cues or notes shown only on the stage confidence monitor..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-[#00DAF3] resize-none"
              />
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 mb-1 block">Slide Notes</label>
              <textarea
                value={slide.notes || ''}
                onChange={e => updateSlideField('notes', e.target.value)}
                rows={2}
                placeholder="General presentation notes..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-[#00DAF3] resize-none"
              />
            </div>
          </div>
        )}

        {activeTab === 'automation' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40 mb-1 block">Auto-Advance (Timed Loop)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={600}
                  value={slide.advanceAfterSec || 0}
                  onChange={e => updateSlideField('advanceAfterSec', +e.target.value > 0 ? +e.target.value : undefined)}
                  className="w-24 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#00DAF3] font-mono"
                />
                <span className="text-xs text-white/50">seconds {slide.advanceAfterSec ? `(Loops after ${slide.advanceAfterSec}s)` : '(Manual advance)'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-white/8 bg-white/[0.02] space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/50 block">On Enter Actions</span>
              <p className="text-[10px] text-white/40 leading-relaxed">
                When this slide is taken live, actions can automatically trigger a countdown timer, start audio tracks, or cut switcher camera feeds.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const currentActions = slide.onEnter || [];
                    updateSlideField('onEnter', [...currentActions, { kind: 'TIMER_START', timerId: 'sermon', seconds: 1800 }]);
                  }}
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white transition-colors"
                >
                  + Start Timer
                </button>
                <button
                  onClick={() => {
                    const currentActions = slide.onEnter || [];
                    updateSlideField('onEnter', [...currentActions, { kind: 'CLEAR_LAYER', slot: 'scripture' }]);
                  }}
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white transition-colors"
                >
                  + Clear Verse
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AmboInspector;
