// ClipGrid — Resolume-style clip launcher.
//
// MIDI auto-map: when a Maschine Studio pad fires (notes 60–75), pad index
// (note − 60) fires the corresponding cell in the active tab.
//
//   Tab "scenes"   → pad N fires SCENE_CATALOG[N]
//   Tab "palettes" → pad N fires PALETTES[N]
//   Tab "clips"    → pad N fires captured looks[N]
//   Tab "milkdrop" → pad 0=toggle, 1=prev, 2=random, 3=next
//
// Cells display their pad assignment (P1–P16) so the VJ can read the layout.

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Grid3x3, Palette, Sparkle, Wind, SkipBack, SkipForward, Shuffle, Radio } from 'lucide-react';
import { VisualizationConfig, VisualizerMode } from '../types';
import { SCENE_CATALOG } from '../engine/sceneCatalog';
import { MidiEventData } from '../services/midiService';

export interface MilkdropControls {
  enabled: boolean;
  name: string;
  count: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRandom: () => void;
}

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
  milkdrop?: MilkdropControls;
}

// ─── Cell component ───────────────────────────────────────────────────────────

interface CellProps {
  active?:    boolean;
  midiFlash?: boolean;
  padNum?:    number;   // 0-based pad index (shows P1, P2…)
  onClick:    () => void;
  children:   React.ReactNode;
  accent?:    string;
  onDelete?:  () => void;
}

const Cell: React.FC<CellProps> = ({
  active, midiFlash, padNum, onClick, children, accent = '#b56cff', onDelete,
}) => (
  <div
    onClick={onClick}
    className="group relative rounded-lg cursor-pointer p-2 h-14 flex flex-col justify-end overflow-hidden transition-all select-none"
    style={{
      border:     midiFlash ? `1px solid #ffffff` : active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.10)',
      background: midiFlash ? `${accent}88` : active ? `linear-gradient(160deg, ${accent}44, ${accent}22)` : '#0d0d16',
      boxShadow:  midiFlash ? `0 0 0 2px #fff, 0 10px 28px ${accent}80`
                : active    ? `0 0 0 1px ${accent}, 0 10px 24px ${accent}40`
                : 'none',
      transform: midiFlash ? 'scale(0.94)' : 'scale(1)',
    }}
  >
    {/* Pad number badge */}
    {padNum !== undefined && (
      <span
        className="absolute top-1 left-1.5 text-[7px] font-black font-mono leading-none"
        style={{ color: active || midiFlash ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.22)' }}
      >
        P{padNum + 1}
      </span>
    )}

    {children}

    {onDelete && (
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 w-4 h-4 rounded-md bg-black/60 text-white/50 hover:text-red-400 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
    )}
  </div>
);

// ─── ClipGrid ─────────────────────────────────────────────────────────────────

const ClipGrid: React.FC<Props> = ({ config, onApply, milkdrop }) => {
  const [tab,          setTab]          = useState<'scenes' | 'palettes' | 'clips' | 'milkdrop'>('scenes');
  const [clips,        setClips]        = useState<UserClip[]>(() => loadClips());
  const [flashedPad,   setFlashedPad]   = useState<number | null>(null);
  const [midiActive,   setMidiActive]   = useState(false);
  const midiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep tab in a ref so the event handler always sees the latest value
  const tabRef   = useRef(tab);
  const clipsRef = useRef(clips);
  useEffect(() => { tabRef.current = tab;     }, [tab]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);

  // ── MIDI pad → cell fire ──────────────────────────────────────────────────
  useEffect(() => {
    const handleNoteOn = (e: Event) => {
      const d = (e as CustomEvent).detail as MidiEventData;
      if (!d) return;
      const note = d.note;
      if (note < 60 || note > 75) return;

      const padIdx = note - 60; // 0–15

      // Flash the cell
      setFlashedPad(padIdx);
      if (midiTimerRef.current) clearTimeout(midiTimerRef.current);
      midiTimerRef.current = setTimeout(() => setFlashedPad(null), 180);

      // MIDI active indicator pulse
      setMidiActive(true);
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      activeTimerRef.current = setTimeout(() => setMidiActive(false), 800);

      const currentTab = tabRef.current;

      if (currentTab === 'scenes') {
        const scene = SCENE_CATALOG[padIdx];
        if (scene) onApply({ mode: scene.mode as VisualizerMode });

      } else if (currentTab === 'palettes') {
        const palette = PALETTES[padIdx];
        if (palette) onApply({ colorPalette: [...palette.cols] });

      } else if (currentTab === 'clips') {
        const clip = clipsRef.current[padIdx];
        if (clip) onApply(clip.config);

      } else if (currentTab === 'milkdrop' && milkdrop) {
        if      (padIdx === 0) milkdrop.onToggle();
        else if (padIdx === 1) milkdrop.onPrev();
        else if (padIdx === 2) milkdrop.onRandom();
        else if (padIdx === 3) milkdrop.onNext();
      }
    };

    window.addEventListener('plajah-midi-note-on', handleNoteOn);
    return () => {
      window.removeEventListener('plajah-midi-note-on', handleNoteOn);
      if (midiTimerRef.current)  clearTimeout(midiTimerRef.current);
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    };
  }, [onApply, milkdrop]);

  const captureLook = () => {
    const snap: Partial<VisualizationConfig> = { ...config };
    const clip: UserClip = {
      id: `clip_${clips.length}_${snap.mode}`,
      name: `${snap.name || 'Look'} ${clips.length + 1}`,
      config: snap,
    };
    const next = [...clips, clip];
    setClips(next); saveClips(next);
    setTab('clips');
  };

  const deleteClip = (id: string) => {
    const next = clips.filter(c => c.id !== id);
    setClips(next); saveClips(next);
  };

  const paletteActive = (cols: string[]) =>
    JSON.stringify(config.colorPalette) === JSON.stringify(cols);

  // Total cells in each tab (for showing pad numbers)
  const sceneCount   = SCENE_CATALOG.length;
  const paletteCount = PALETTES.length;

  return (
    <div className="w-[280px] max-h-[65vh] flex flex-col bg-black/70 backdrop-blur-2xl border border-white/10 border-t-0 rounded-b-2xl shadow-2xl overflow-hidden">

      {/* MIDI status bar */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/5 bg-white/3">
        <Radio className={`w-3 h-3 shrink-0 transition-colors ${midiActive ? 'text-green-400' : 'text-white/20'}`} />
        <span className="text-[9px] font-mono text-white/30 flex-1">
          {midiActive ? 'MIDI pad fired' : 'Pads auto-mapped — hit a pad to fire a cell'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 text-[9px] font-black uppercase tracking-widest">
        {([
          ['scenes',   Grid3x3] as const,
          ['palettes', Palette] as const,
          ['clips',    Sparkle] as const,
          ...(milkdrop ? [['milkdrop', Wind] as const] : []),
        ]).map(([t, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 flex items-center justify-center gap-1 border-b-2 transition-colors ${
              tab === t ? 'border-purple-500 text-purple-300 bg-white/5' : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            <Icon className="w-3 h-3" /> {t === 'milkdrop' ? 'MILK' : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-none">

        {/* ── Scenes tab ──────────────────────────────────────────────────── */}
        {tab === 'scenes' && (
          <div className="grid grid-cols-2 gap-1.5">
            {SCENE_CATALOG.map((s, i) => (
              <Cell
                key={s.mode}
                active={config.mode === s.mode}
                midiFlash={flashedPad === i}
                padNum={i < 16 ? i : undefined}
                accent={s.kind === 'gl' ? '#22d3ee' : s.kind === 'canvas' ? '#a78bfa' : '#b56cff'}
                onClick={() => onApply({ mode: s.mode as VisualizerMode })}
              >
                <span className="text-[10px] font-bold text-white leading-tight">{s.name}</span>
                <span className="text-[7px] uppercase tracking-widest text-white/40">{s.cat}</span>
                {s.kind === 'gl' && (
                  <span className="absolute top-1 right-1 text-[6px] tracking-widest text-cyan-300 bg-black/50 border border-white/20 rounded px-1">GLSL</span>
                )}
              </Cell>
            ))}
          </div>
        )}

        {/* ── Palettes tab ─────────────────────────────────────────────────── */}
        {tab === 'palettes' && (
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTES.map((p, i) => (
              <Cell
                key={p.name}
                active={paletteActive(p.cols)}
                midiFlash={flashedPad === i}
                padNum={i}
                accent={p.cols[0]}
                onClick={() => onApply({ colorPalette: [...p.cols] })}
              >
                <div className="absolute inset-0 flex">
                  {p.cols.map((c, ci) => <div key={ci} className="flex-1" style={{ background: c }} />)}
                </div>
                <span className="relative text-[10px] font-black text-white leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{p.name}</span>
              </Cell>
            ))}
          </div>
        )}

        {/* ── Milkdrop tab ─────────────────────────────────────────────────── */}
        {tab === 'milkdrop' && milkdrop && (
          <div className="space-y-3">
            {/* Pad legend for milkdrop */}
            <div className="grid grid-cols-4 gap-1 text-[8px] font-mono text-white/30">
              <span className={`text-center py-1 rounded border ${flashedPad === 0 ? 'border-purple-400 text-purple-300 bg-purple-500/20' : 'border-white/10'}`}>P1 Toggle</span>
              <span className={`text-center py-1 rounded border ${flashedPad === 1 ? 'border-purple-400 text-purple-300 bg-purple-500/20' : 'border-white/10'}`}>P2 Prev</span>
              <span className={`text-center py-1 rounded border ${flashedPad === 2 ? 'border-purple-400 text-purple-300 bg-purple-500/20' : 'border-white/10'}`}>P3 Rand</span>
              <span className={`text-center py-1 rounded border ${flashedPad === 3 ? 'border-purple-400 text-purple-300 bg-purple-500/20' : 'border-white/10'}`}>P4 Next</span>
            </div>

            <button
              onClick={milkdrop.onToggle}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                milkdrop.enabled
                  ? 'bg-purple-600/50 border-purple-400/50 text-white'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              {milkdrop.enabled ? 'Milkdrop ON' : 'Enable Milkdrop'}
            </button>
            <p className="text-[8px] text-white/30 leading-relaxed text-center">
              Butterchurn engine — {milkdrop.count > 0 ? `${milkdrop.count} presets` : 'thousands of presets'}, audio-reactive.
            </p>
            {milkdrop.enabled && (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={milkdrop.onPrev}   title="Previous" className="py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all"><SkipBack   className="w-3.5 h-3.5" /></button>
                  <button onClick={milkdrop.onRandom} title="Random"   className="py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all"><Shuffle    className="w-3.5 h-3.5" /></button>
                  <button onClick={milkdrop.onNext}   title="Next"     className="py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all"><SkipForward className="w-3.5 h-3.5" /></button>
                </div>
                {milkdrop.name && (
                  <p className="text-[9px] text-white/50 text-center break-words px-1 leading-snug">
                    {milkdrop.name.length > 48 ? milkdrop.name.slice(0, 48) + '…' : milkdrop.name}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Clips tab ────────────────────────────────────────────────────── */}
        {tab === 'clips' && (
          <div className="space-y-2">
            <button
              onClick={captureLook}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/30 text-[10px] font-black uppercase tracking-widest text-white transition-all"
            >
              <Camera className="w-3.5 h-3.5" /> Capture current look
            </button>
            {clips.length === 0 ? (
              <p className="text-[9px] text-white/30 text-center py-4 leading-relaxed">
                Build a look in the panels, capture it here, then fire it live with a pad.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {clips.map((c, i) => (
                  <Cell
                    key={c.id}
                    active={config.mode === c.config.mode}
                    midiFlash={flashedPad === i}
                    padNum={i < 16 ? i : undefined}
                    onClick={() => onApply(c.config)}
                    onDelete={() => deleteClip(c.id)}
                  >
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
