// ClipGrid — a simple Resolume-style clip launcher. A grid of cells you fire
// live: scene clips (switch the visualizer), palette clips (recolor), and
// CAPTURED looks (snapshot the whole current config into a cell and re-fire it
// later). Captured looks persist to localStorage so a user's set stays put.

import React, { useState } from 'react';
import { Camera, Trash2, Grid3x3, Palette, Sparkle } from 'lucide-react';
import { VisualizationConfig, VisualizerMode } from '../types';
import { SCENE_CATALOG } from '../engine/sceneCatalog';

const CLIPS_KEY = 'plajah-pixels-clips-v1';

interface UserClip { id: string; name: string; config: Partial<VisualizationConfig>; }

const PALETTES: { name: string; cols: [string, string, string, string] }[] = [
  { name: 'Neon',   cols: ['#FF00CC', '#3333FF', '#00CCFF', '#FFFFFF'] },
  { name: 'Sunset', cols: ['#FF8C00', '#FF2D95', '#7A1FA2', '#FFE08A'] },
  { name: 'Cyber',  cols: ['#00FFC6', '#0066FF', '#B500FF', '#001018'] },
  { name: 'Fire',   cols: ['#FFE070', '#FF7A00', '#E0245E', '#3A0000'] },
  { name: 'Aurora', cols: ['#7CFFCB', '#3AA0FF', '#A06BFF', '#04122A'] },
  { name: 'Mono',   cols: ['#FFFFFF', '#AAAAAA', '#444444', '#000000'] },
];

function loadClips(): UserClip[] {
  try { return JSON.parse(localStorage.getItem(CLIPS_KEY) || '[]'); } catch { return []; }
}
function saveClips(c: UserClip[]) {
  try { localStorage.setItem(CLIPS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

interface Props {
  config: VisualizationConfig;
  onApply: (patch: Partial<VisualizationConfig>) => void;
}

const Cell: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode; accent?: string; onDelete?: () => void }>
  = ({ active, onClick, children, accent = '#b56cff', onDelete }) => (
  <div
    onClick={onClick}
    className="group relative rounded-lg cursor-pointer p-2 h-14 flex flex-col justify-end overflow-hidden transition-all"
    style={{
      border: active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.10)',
      background: active ? `linear-gradient(160deg, ${accent}44, ${accent}22)` : '#0d0d16',
      boxShadow: active ? `0 0 0 1px ${accent}, 0 10px 24px ${accent}40` : 'none',
    }}
  >
    {children}
    {onDelete && (
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 w-4 h-4 rounded-md bg-black/60 text-white/50 hover:text-red-400 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
    )}
  </div>
);

const ClipGrid: React.FC<Props> = ({ config, onApply }) => {
  const [tab, setTab] = useState<'scenes' | 'palettes' | 'clips'>('scenes');
  const [clips, setClips] = useState<UserClip[]>(() => loadClips());

  const captureLook = () => {
    const snap: Partial<VisualizationConfig> = { ...config };
    const clip: UserClip = { id: `clip_${clips.length}_${snap.mode}`, name: `${snap.name || 'Look'} ${clips.length + 1}`, config: snap };
    const next = [...clips, clip];
    setClips(next); saveClips(next);
    setTab('clips');
  };
  const deleteClip = (id: string) => { const next = clips.filter(c => c.id !== id); setClips(next); saveClips(next); };

  const paletteActive = (cols: string[]) => JSON.stringify(config.colorPalette) === JSON.stringify(cols);

  return (
    <div className="w-[280px] max-h-[60vh] flex flex-col bg-black/70 backdrop-blur-2xl border border-white/10 border-t-0 rounded-b-2xl shadow-2xl overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-white/10 text-[9px] font-black uppercase tracking-widest">
        {([['scenes', Grid3x3], ['palettes', Palette], ['clips', Sparkle]] as const).map(([t, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 flex items-center justify-center gap-1 border-b-2 transition-colors ${tab === t ? 'border-purple-500 text-purple-300 bg-white/5' : 'border-transparent text-white/40 hover:text-white'}`}
          >
            <Icon className="w-3 h-3" /> {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-none">
        {tab === 'scenes' && (
          <div className="grid grid-cols-2 gap-1.5">
            {SCENE_CATALOG.map(s => (
              <Cell key={s.mode} active={config.mode === s.mode} onClick={() => onApply({ mode: s.mode as VisualizerMode })}>
                <span className="text-[10px] font-bold text-white leading-tight">{s.name}</span>
                <span className="text-[7px] uppercase tracking-widest text-white/40">{s.cat}</span>
                {s.kind === 'gl' && <span className="absolute top-1 right-1 text-[6px] tracking-widest text-cyan-300 bg-black/50 border border-white/20 rounded px-1">GLSL</span>}
              </Cell>
            ))}
          </div>
        )}

        {tab === 'palettes' && (
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTES.map(p => (
              <Cell key={p.name} active={paletteActive(p.cols)} accent={p.cols[0]} onClick={() => onApply({ colorPalette: [...p.cols] })}>
                <div className="absolute inset-0 flex">
                  {p.cols.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
                </div>
                <span className="relative text-[10px] font-black text-white leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{p.name}</span>
              </Cell>
            ))}
          </div>
        )}

        {tab === 'clips' && (
          <div className="space-y-2">
            <button
              onClick={captureLook}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/30 text-[10px] font-black uppercase tracking-widest text-white transition-all"
            >
              <Camera className="w-3.5 h-3.5" /> Capture current look
            </button>
            {clips.length === 0 ? (
              <p className="text-[9px] text-white/30 text-center py-4 leading-relaxed">Build a look in the panels, then capture it here as a fire-able clip.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {clips.map(c => (
                  <Cell key={c.id} active={config.mode === c.config.mode} onClick={() => onApply(c.config)} onDelete={() => deleteClip(c.id)}>
                    <span className="text-[10px] font-bold text-white leading-tight truncate">{c.name}</span>
                    <span className="text-[7px] uppercase tracking-widest text-white/40">Captured</span>
                  </Cell>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClipGrid;
