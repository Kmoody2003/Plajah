import React, { useState, useRef } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Upload,
  Music, Sliders, Palette, Activity, Image as ImageIcon,
  ChevronDown, ChevronRight, Disc, Layers, Link2, Power,
  Eye, RefreshCw, Sparkles, Film,
} from 'lucide-react';
import { VisualizationConfig, VisualizerMode, AudioState, BlendMode } from '../types';
import type { PlajahPixelsPlatformBridge } from '../PlajahPixelsStudio';
import { SCENE_CATALOG, type SceneEntry } from '../engine/sceneCatalog';
import type { ShaderLibraryEntry } from '../components/ShaderPanel';
import { InspectorGroup } from './shell';
import { BandDots, ReactivityMap } from './index';
import ColorPaletteEditor from '../components/ColorPaletteEditor';

export const PRESET_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Midnight Neon', colors: ['#FF00CC', '#3333FF', '#00CCFF', '#FFFFFF'] },
  { name: 'Cyberpunk', colors: ['#FF0055', '#00FFFF', '#FFE600', '#7928CA'] },
  { name: 'Sunset Glow', colors: ['#FF5E36', '#FFAE34', '#EB3349', '#F45C43'] },
  { name: 'Emerald Acid', colors: ['#00FF87', '#60EFFF', '#0061FF', '#11998E'] },
  { name: 'Electric Violet', colors: ['#7928CA', '#FF0080', '#4B0082', '#D8B4E2'] },
  { name: 'Golden Hour', colors: ['#F7971E', '#FFD200', '#FFA07A', '#FF4500'] },
  { name: 'Mono Minimal', colors: ['#FFFFFF', '#AAAAAA', '#555555', '#111111'] },
];

function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface PixelsInspectorProps {
  // Current active look/generator
  config: VisualizationConfig;
  onUpdateConfig: (updater: (prev: VisualizationConfig) => VisualizationConfig) => void;
  selectedGeneratorMode: VisualizerMode | null;
  activeShader: ShaderLibraryEntry | null;
  shaderParams: number[];
  onShaderParam: (index: number, value: number) => void;
  onOpenShaderSource?: () => void;
  onOffShader?: () => void;
  milkdropOn?: boolean;
  milkdropMeta?: { name: string; count: number; idx: number };
  onMilkdropPrev?: () => void;
  onMilkdropNext?: () => void;
  onMilkdropRandom?: () => void;

  // Audio & Transport
  audioState: AudioState;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onAudioUpload?: (file: File) => void;
  audioFileName?: string;

  // Platform (Chora / Album)
  platform?: PlajahPixelsPlatformBridge;

  // Background Media Uploads
  onBgUpload?: (e: React.ChangeEvent<HTMLInputElement>, layerNum: 1 | 2) => void;
  bgMediaCount?: { layer1: number; layer2: number };
}

export const PixelsInspector: React.FC<PixelsInspectorProps> = ({
  config,
  onUpdateConfig,
  selectedGeneratorMode,
  activeShader,
  shaderParams,
  onShaderParam,
  onOpenShaderSource,
  onOffShader,
  milkdropOn,
  milkdropMeta,
  onMilkdropPrev,
  onMilkdropNext,
  onMilkdropRandom,
  audioState,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onAudioUpload,
  audioFileName,
  platform,
  onBgUpload,
  bgMediaCount,
}) => {
  // Section folding states
  const [openGen, setOpenGen] = useState(true);
  const [openPalette, setOpenPalette] = useState(true);
  const [openReactivity, setOpenReactivity] = useState(true);
  const [openTransport, setOpenTransport] = useState(true);
  const [openPlaylist, setOpenPlaylist] = useState(true);
  const [openMedia, setOpenMedia] = useState(false);

  // Active scene info
  const activeMode = selectedGeneratorMode ?? config.mode;
  const currentScene = SCENE_CATALOG.find(s => s.mode === activeMode);

  // Audio file input ref
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioState.duration || audioState.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * audioState.duration);
  };

  const isShaderActive = !!activeShader;
  const isMilkdropActive = !!milkdropOn;
  const isGeneratorActive = !isShaderActive && !isMilkdropActive;

  return (
    <div className="flex flex-col text-sm text-white divide-y divide-white/[0.07]">
      {/* ══════════════════════════════════════════════════════════════════════
          1. CHOSEN LOOK / GENERATOR INSPECTOR
          ══════════════════════════════════════════════════════════════════════ */}
      {isGeneratorActive && (
        <div>
          {/* Header */}
          <div className="px-3.5 py-3 border-b border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <span className="type-label-sm uppercase tracking-[0.14em] text-[var(--pj-orange)] font-bold">
                Generator · Selected
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-mono">
                {currentScene?.kind?.toUpperCase() || 'CANVAS'}
              </span>
            </div>
            <p className="type-title-md font-extrabold text-white truncate mt-1">
              {currentScene?.name || activeMode || 'Stage'}
            </p>
            {currentScene?.cat && (
              <p className="type-label-sm uppercase tracking-[0.12em] text-white/35 mt-0.5">
                {currentScene.cat}
              </p>
            )}
          </div>

          {/* Generator Parameter Sliders */}
          <InspectorGroup
            label="Parameters"
            aside={
              <button
                onClick={() => setOpenGen(v => !v)}
                className="text-white/40 hover:text-white transition-colors"
                title={openGen ? 'Collapse' : 'Expand'}
              >
                {openGen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            }
          >
            {openGen && (
              <div className="space-y-3 pt-1">
                {/* Speed */}
                <div>
                  <div className="flex justify-between text-xs text-white/60 mb-1">
                    <span>Speed</span>
                    <span className="font-mono text-[var(--pj-orange)]">{(config.speed || 1).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range" min="0.1" max="3.0" step="0.05"
                    value={config.speed ?? 1.0}
                    onChange={e => onUpdateConfig(p => ({ ...p, speed: parseFloat(e.target.value) }))}
                    className="pj-range pj-range--dense w-full"
                    aria-label="Generator Speed"
                  />
                </div>

                {/* Sensitivity */}
                <div>
                  <div className="flex justify-between text-xs text-white/60 mb-1">
                    <span>Sensitivity</span>
                    <span className="font-mono text-[var(--pj-orange)]">{(config.sensitivity || 1.5).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range" min="0.1" max="3.0" step="0.05"
                    value={config.sensitivity ?? 1.5}
                    onChange={e => onUpdateConfig(p => ({ ...p, sensitivity: parseFloat(e.target.value) }))}
                    className="pj-range pj-range--dense w-full"
                    aria-label="Audio Sensitivity"
                  />
                </div>

                {/* Glow Intensity */}
                <div>
                  <div className="flex justify-between text-xs text-white/60 mb-1">
                    <span>Glow Bloom</span>
                    <span className="font-mono text-[var(--pj-orange)]">{config.glowIntensity ?? 15}</span>
                  </div>
                  <input
                    type="range" min="0" max="40" step="1"
                    value={config.glowIntensity ?? 15}
                    onChange={e => onUpdateConfig(p => ({ ...p, glowIntensity: parseInt(e.target.value) }))}
                    className="pj-range pj-range--dense w-full"
                    aria-label="Glow Intensity"
                  />
                </div>

                {/* Soft Blur */}
                <div>
                  <div className="flex justify-between items-center text-xs text-white/60 mb-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableBlur ?? true}
                        onChange={e => onUpdateConfig(p => ({ ...p, enableBlur: e.target.checked }))}
                        className="rounded border-white/20 accent-[var(--pj-orange)]"
                      />
                      <span>Soft Glow Blur</span>
                    </label>
                    <span className="font-mono text-[var(--pj-orange)]">{(config.blurStrength ?? 0.8).toFixed(1)}</span>
                  </div>
                  {config.enableBlur && (
                    <input
                      type="range" min="0.1" max="2.0" step="0.1"
                      value={config.blurStrength ?? 0.8}
                      onChange={e => onUpdateConfig(p => ({ ...p, blurStrength: parseFloat(e.target.value) }))}
                      className="pj-range pj-range--dense w-full"
                      aria-label="Blur Strength"
                    />
                  )}
                </div>

                {/* Blend Mode */}
                <div>
                  <label className="text-xs text-white/50 block mb-1">Composite Blend Mode</label>
                  <select
                    value={config.blendMode || 'screen'}
                    onChange={e => onUpdateConfig(p => ({ ...p, blendMode: e.target.value as BlendMode }))}
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-[var(--pj-orange)]"
                  >
                    {(['screen', 'overlay', 'lighten', 'color-dodge', 'hard-light', 'difference', 'multiply'] as BlendMode[]).map(m => (
                      <option key={m} value={m} className="bg-zinc-900">{m}</option>
                    ))}
                  </select>
                </div>

                {/* Stage Slicing */}
                <div className="pt-2 border-t border-white/[0.06]">
                  <div className="flex justify-between items-center text-xs text-white/60 mb-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableSlicing ?? false}
                        onChange={e => onUpdateConfig(p => ({ ...p, enableSlicing: e.target.checked }))}
                        className="rounded border-white/20 accent-[var(--pj-orange)]"
                      />
                      <span>Stage Slicing & Mirror</span>
                    </label>
                    {config.enableSlicing && (
                      <span className="font-mono text-[var(--pj-orange)]">{config.sliceCount ?? 6} cuts</span>
                    )}
                  </div>
                  {config.enableSlicing && (
                    <div className="space-y-2 mt-2 pl-4 border-l border-white/10">
                      <div>
                        <div className="flex justify-between text-[11px] text-white/50 mb-0.5">
                          <span>Slices Count</span>
                          <span className="font-mono text-white/80">{config.sliceCount ?? 6}</span>
                        </div>
                        <input
                          type="range" min="2" max="24" step="1"
                          value={config.sliceCount ?? 6}
                          onChange={e => onUpdateConfig(p => ({ ...p, sliceCount: parseInt(e.target.value) }))}
                          className="pj-range pj-range--dense w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-white/50 mb-0.5">
                          <span>Sector Rotation</span>
                          <span className="font-mono text-white/80">{config.sliceRotation ?? 0}°</span>
                        </div>
                        <input
                          type="range" min="0" max="360" step="5"
                          value={config.sliceRotation ?? 0}
                          onChange={e => onUpdateConfig(p => ({ ...p, sliceRotation: parseInt(e.target.value) }))}
                          className="pj-range pj-range--dense w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Lighting & Beams */}
                <div className="pt-2 border-t border-white/[0.06]">
                  <div className="flex justify-between items-center text-xs text-white/60">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableLighting ?? false}
                        onChange={e => onUpdateConfig(p => ({ ...p, enableLighting: e.target.checked }))}
                        className="rounded border-white/20 accent-[var(--pj-orange)]"
                      />
                      <span>Stage Beams & Lighting</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enable3dDepth ?? false}
                        onChange={e => onUpdateConfig(p => ({ ...p, enable3dDepth: e.target.checked }))}
                        className="rounded border-white/20 accent-[var(--pj-orange)]"
                      />
                      <span className="text-[11px] text-white/50">3D Depth</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </InspectorGroup>
        </div>
      )}

      {/* ── Shader Inspector if shader selected ── */}
      {isShaderActive && activeShader && (
        <div>
          <div className="px-3.5 py-3 border-b border-white/[0.08] bg-white/[0.02]">
            <p className="type-label-sm uppercase tracking-[0.14em] text-[var(--pj-orange)] font-bold">
              Shader Layer · Selected
            </p>
            <p className="type-title-md font-extrabold text-white truncate mt-1">{activeShader.name}</p>
            {(activeShader.series || activeShader.setTitle) && (
              <p className="type-label-sm uppercase tracking-[0.12em] text-white/30 mt-0.5">
                {activeShader.series ? `Series ${activeShader.series}` : ''}
                {activeShader.series && activeShader.setTitle ? ' · ' : ''}
                {activeShader.setTitle ?? ''}
              </p>
            )}
            {activeShader.line && <p className="type-body-sm text-white/45 leading-snug mt-1.5">{activeShader.line}</p>}
          </div>

          {(activeShader.params ?? []).length > 0 && (
            <InspectorGroup label="Controls" aside={String(activeShader.params!.length)}>
              <div className="flex flex-col gap-2 pt-1">
                {activeShader.params!.map((c, i) => (
                  <label key={c.name} className="flex items-center gap-2.5">
                    <span className="type-body-sm text-white/60 flex-1 truncate">{c.name}</span>
                    <input
                      type="range" min={0} max={1} step={0.001}
                      value={shaderParams[i] ?? c.def}
                      onChange={e => onShaderParam(i, parseFloat(e.target.value))}
                      className="pj-range pj-range--dense w-[100px]"
                      aria-label={c.name}
                    />
                  </label>
                ))}
              </div>
            </InspectorGroup>
          )}

          {activeShader.reacts && activeShader.reacts.length > 0 && (
            <InspectorGroup label="Reacts to" aside="live">
              <ReactivityMap rows={activeShader.reacts} />
            </InspectorGroup>
          )}

          <div className="flex items-center p-2">
            {onOpenShaderSource && (
              <button
                onClick={onOpenShaderSource}
                className="flex-1 flex items-center gap-1.5 px-3 py-2 text-left rounded-md hover:bg-white/[0.05] transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-white/40" />
                <span className="type-label-sm uppercase tracking-[0.14em] text-white/50">GLSL Editor</span>
              </button>
            )}
            {onOffShader && (
              <button
                onClick={onOffShader}
                title="Remove shader"
                className="px-3 py-2 text-white/40 hover:text-white rounded-md hover:bg-white/[0.05] transition-colors"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Milkdrop Inspector if milkdrop selected ── */}
      {isMilkdropActive && (
        <div className="p-3.5 border-b border-white/[0.08] bg-white/[0.02]">
          <p className="type-label-sm uppercase tracking-[0.14em] text-[var(--pj-orange)] font-bold">
            Milkdrop · Visualizer
          </p>
          <p className="type-title-md font-extrabold text-white truncate mt-1">
            {milkdropMeta?.name || 'Butterchurn Preset'}
          </p>
          <div className="flex items-center gap-2 mt-3">
            {onMilkdropPrev && (
              <button onClick={onMilkdropPrev} className="px-2.5 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors">
                Prev
              </button>
            )}
            {onMilkdropRandom && (
              <button onClick={onMilkdropRandom} className="flex-1 py-1 text-xs bg-[var(--pj-orange)]/20 text-[var(--pj-orange)] hover:bg-[var(--pj-orange)]/30 rounded font-semibold transition-colors flex items-center justify-center gap-1">
                <RefreshCw className="w-3 h-3" /> Random
              </button>
            )}
            {onMilkdropNext && (
              <button onClick={onMilkdropNext} className="px-2.5 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors">
                Next
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          2. CONSOLIDATED PALETTE MANAGER
          ══════════════════════════════════════════════════════════════════════ */}
      <InspectorGroup
        label="Color Palette"
        aside={
          <button
            onClick={() => setOpenPalette(v => !v)}
            className="text-white/40 hover:text-white transition-colors"
          >
            {openPalette ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        }
      >
        {openPalette && (
          <div className="space-y-3 pt-1">
            {/* Quick Preset Palettes */}
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Preset Palettes</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_PALETTES.map(p => {
                  const isCurrent = JSON.stringify(p.colors) === JSON.stringify(config.colorPalette);
                  return (
                    <button
                      key={p.name}
                      onClick={() => onUpdateConfig(prev => ({ ...prev, colorPalette: p.colors }))}
                      className={`px-2 py-1 rounded-md text-[10px] border flex items-center gap-1.5 transition-all ${
                        isCurrent
                          ? 'border-[var(--pj-orange)] bg-[var(--pj-orange)]/15 text-white font-semibold'
                          : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:border-white/25'
                      }`}
                    >
                      <span className="flex gap-0.5">
                        {p.colors.slice(0, 3).map((c, i) => (
                          <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive Palette Swatches */}
            <div className="pt-1">
              <ColorPaletteEditor
                colors={config.colorPalette}
                onChange={colors => onUpdateConfig(prev => ({ ...prev, colorPalette: colors }))}
              />
            </div>

            {/* Background Pulse & Opacity */}
            <div className="pt-2 border-t border-white/[0.06] space-y-2">
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-0.5">
                  <span>Pulse Response</span>
                  <span className="font-mono text-white/80">{Math.round((config.backgroundPulseIntensity ?? 0.5) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={config.backgroundPulseIntensity ?? 0.5}
                  onChange={e => onUpdateConfig(p => ({ ...p, backgroundPulseIntensity: parseFloat(e.target.value) }))}
                  className="pj-range pj-range--dense w-full"
                />
              </div>
            </div>
          </div>
        )}
      </InspectorGroup>

      {/* ══════════════════════════════════════════════════════════════════════
          3. AUDIO REACTIVITY & PROCESSING OPTIONS
          ══════════════════════════════════════════════════════════════════════ */}
      <InspectorGroup
        label="Reactivity"
        aside={
          <button
            onClick={() => setOpenReactivity(v => !v)}
            className="text-white/40 hover:text-white transition-colors"
          >
            {openReactivity ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        }
      >
        {openReactivity && (
          <div className="space-y-3 pt-1">
            {/* Live Audio Reactive Bands */}
            <div>
              <div className="flex justify-between text-[11px] text-white/40 uppercase tracking-wider mb-1">
                <span>Audio Bands</span>
                <span className="text-[10px] text-emerald-400">Live</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <BandDots bands={['sub', 'low', 'pres', 'sib', 'air', 'voice']} />
                <span className="text-[10px] font-mono text-white/40">50Hz – 17kHz</span>
              </div>
            </div>

            {/* Smoothing Time */}
            <div>
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>FFT Smoothing</span>
                <span className="font-mono text-[var(--pj-orange)]">{config.smoothingTimeConstant ?? 0.8}</span>
              </div>
              <input
                type="range" min="0" max="0.95" step="0.05"
                value={config.smoothingTimeConstant ?? 0.8}
                onChange={e => onUpdateConfig(p => ({ ...p, smoothingTimeConstant: parseFloat(e.target.value) }))}
                className="pj-range pj-range--dense w-full"
              />
            </div>

            {/* FFT Buffer Size */}
            <div>
              <label className="text-xs text-white/50 block mb-1">Audio Buffer FFT Size</label>
              <select
                value={config.fftSize || 2048}
                onChange={e => onUpdateConfig(p => ({ ...p, fftSize: parseInt(e.target.value) }))}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-[var(--pj-orange)]"
              >
                {[256, 512, 1024, 2048, 4096, 8192].map(size => (
                  <option key={size} value={size} className="bg-zinc-900">{size} samples</option>
                ))}
              </select>
            </div>

            {/* Bass Shake */}
            <div className="pt-2 border-t border-white/[0.06]">
              <div className="flex justify-between items-center text-xs text-white/60 mb-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableBassShake ?? false}
                    onChange={e => onUpdateConfig(p => ({ ...p, enableBassShake: e.target.checked }))}
                    className="rounded border-white/20 accent-[var(--pj-orange)]"
                  />
                  <span>Kick Bass Shake</span>
                </label>
                {config.enableBassShake && (
                  <span className="font-mono text-[var(--pj-orange)]">{(config.bassShakeIntensity ?? 1).toFixed(1)}x</span>
                )}
              </div>
              {config.enableBassShake && (
                <input
                  type="range" min="0.2" max="2.5" step="0.1"
                  value={config.bassShakeIntensity ?? 1.0}
                  onChange={e => onUpdateConfig(p => ({ ...p, bassShakeIntensity: parseFloat(e.target.value) }))}
                  className="pj-range pj-range--dense w-full"
                />
              )}
            </div>

            {/* Frame Rate Limit */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-white/50">Target Framerate</span>
              <div className="flex gap-1">
                {[30, 60].map(fps => (
                  <button
                    key={fps}
                    onClick={() => onUpdateConfig(p => ({ ...p, targetFrameRate: fps as 30 | 60 }))}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                      config.targetFrameRate === fps
                        ? 'bg-[var(--pj-orange)] text-black font-bold'
                        : 'bg-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </InspectorGroup>

      {/* ══════════════════════════════════════════════════════════════════════
          4. TRANSPORT BAR & AUDIO FILE UPLOAD
          ══════════════════════════════════════════════════════════════════════ */}
      <InspectorGroup
        label="Transport & Audio"
        aside={
          <button
            onClick={() => setOpenTransport(v => !v)}
            className="text-white/40 hover:text-white transition-colors"
          >
            {openTransport ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        }
      >
        {openTransport && (
          <div className="space-y-3 pt-1">
            {/* Now Playing Title */}
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-1">
                  <Music className="w-3 h-3" />
                  {platform ? 'Chora Stream' : 'Audio Track'}
                </span>
                {platform && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono flex items-center gap-1">
                    <Link2 className="w-2.5 h-2.5" /> Synced
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-white truncate">
                {platform?.currentTrackTitle || audioFileName || 'Default Audio Loop'}
              </p>
            </div>

            {/* Scrub / Progress Bar */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-white/50 mb-1">
                <span>{formatTime(audioState.currentTime)}</span>
                <span>{formatTime(audioState.duration)}</span>
              </div>
              <div
                className="w-full h-2 bg-white/10 rounded-full overflow-hidden cursor-pointer hover:h-2.5 transition-all"
                onClick={handleSeekClick}
              >
                <div
                  className="h-full bg-gradient-to-r from-[var(--pj-orange)] to-amber-300 transition-all duration-100"
                  style={{ width: `${Math.max(0, Math.min(100, (audioState.currentTime / (audioState.duration || 1)) * 100))}%` }}
                />
              </div>
            </div>

            {/* Transport Buttons: Prev / Play-Pause / Next */}
            <div className="flex items-center justify-center gap-3 py-1">
              {platform?.prev && (
                <button
                  onClick={platform.prev}
                  title="Previous track"
                  className="p-2 text-white/60 hover:text-white transition-colors"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={onTogglePlay}
                title={audioState.isPlaying ? 'Pause' : 'Play'}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
              >
                {audioState.isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              {platform?.next && (
                <button
                  onClick={platform.next}
                  title="Next track"
                  className="p-2 text-white/60 hover:text-white transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onVolumeChange(audioState.volume === 0 ? 0.8 : 0)}
                className="text-white/50 hover:text-white transition-colors"
              >
                {audioState.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={audioState.volume}
                onChange={e => onVolumeChange(parseFloat(e.target.value))}
                className="pj-range pj-range--dense flex-1"
                aria-label="Volume"
              />
              <span className="text-[11px] font-mono text-white/40 w-8 text-right">
                {Math.round(audioState.volume * 100)}%
              </span>
            </div>

            {/* Audio File Upload Button */}
            {!platform && onAudioUpload && (
              <div className="pt-2 border-t border-white/[0.06]">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/mp3,audio/wav,audio/mpeg,audio/flac,audio/ogg"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      onAudioUpload(e.target.files[0]);
                    }
                  }}
                />
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-lg border border-dashed border-white/20 hover:border-[var(--pj-orange)] hover:bg-white/[0.04] text-xs font-semibold text-white/70 hover:text-white flex items-center justify-center gap-2 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Audio File (MP3 / WAV)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </InspectorGroup>

      {/* ══════════════════════════════════════════════════════════════════════
          5. CHORA PLAYLIST & ALBUM INTEGRATION
          ══════════════════════════════════════════════════════════════════════ */}
      {platform && (
        <InspectorGroup
          label="Chora Playlist"
          aside={
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30">{platform.tracklist.length} tracks</span>
              <button
                onClick={() => setOpenPlaylist(v => !v)}
                className="text-white/40 hover:text-white transition-colors"
              >
                {openPlaylist ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          }
        >
          {openPlaylist && (
            <div className="space-y-2 pt-1">
              {/* Album Art & Title Header */}
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                {platform.mediaImages?.[0] ? (
                  <img
                    src={platform.mediaImages[0]}
                    alt="Album Cover"
                    className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-purple-900/40 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <Disc className="w-5 h-5 text-purple-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{platform.title || 'Album Tracks'}</p>
                  <p className="text-[10px] text-white/40 truncate">
                    {platform.currentTrackTitle || 'Playing from Chora'}
                  </p>
                </div>
              </div>

              {/* Scrollable Tracklist */}
              <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
                {platform.tracklist.map((track, idx) => {
                  const isActive = track.id === platform.currentTrackId;
                  return (
                    <button
                      key={track.id}
                      onClick={() => platform.onSelectTrack(track.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                        isActive
                          ? 'bg-purple-600/35 border border-purple-500/40 text-white shadow-sm'
                          : 'hover:bg-white/[0.06] text-white/60 hover:text-white'
                      }`}
                    >
                      <span className="text-[10px] font-mono w-4 shrink-0 text-white/35">
                        {idx + 1}
                      </span>
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        {isActive && audioState.isPlaying ? (
                          <Pause className="w-3 h-3 fill-current text-[var(--pj-orange)]" />
                        ) : (
                          <Play className={`w-3 h-3 fill-current ${isActive ? 'text-[var(--pj-orange)]' : 'text-white/40'}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs truncate ${isActive ? 'font-bold text-white' : ''}`}>
                          {track.title}
                        </p>
                        {track.artist && (
                          <p className="text-[10px] text-white/35 truncate">{track.artist}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </InspectorGroup>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          6. BACKDROP MEDIA UPLOADS
          ══════════════════════════════════════════════════════════════════════ */}
      {onBgUpload && (
        <InspectorGroup
          label="Backdrop Media"
          aside={
            <button
              onClick={() => setOpenMedia(v => !v)}
              className="text-white/40 hover:text-white transition-colors"
            >
              {openMedia ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          }
        >
          {openMedia && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] text-white/40 leading-snug">
                Upload image or video loops for backdrop compositing layers.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-dashed border-white/20 hover:border-white/40 hover:bg-white/[0.03] cursor-pointer transition-colors text-center">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={e => onBgUpload(e, 1)}
                  />
                  <ImageIcon className="w-4 h-4 text-white/50 mb-1" />
                  <span className="text-[11px] font-semibold text-white/70">Layer 1</span>
                  <span className="text-[9px] text-white/30">
                    {bgMediaCount?.layer1 ?? 0} loaded
                  </span>
                </label>
                <label className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-dashed border-white/20 hover:border-white/40 hover:bg-white/[0.03] cursor-pointer transition-colors text-center">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={e => onBgUpload(e, 2)}
                  />
                  <Film className="w-4 h-4 text-white/50 mb-1" />
                  <span className="text-[11px] font-semibold text-white/70">Overlay 2</span>
                  <span className="text-[9px] text-white/30">
                    {bgMediaCount?.layer2 ?? 0} loaded
                  </span>
                </label>
              </div>
            </div>
          )}
        </InspectorGroup>
      )}
    </div>
  );
};

export default PixelsInspector;
