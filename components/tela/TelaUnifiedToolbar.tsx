/**
 * TelaUnifiedToolbar.tsx — The Zero-Persona Creative Toolbar for Plajah Tela.
 *
 * Defaults to "Pro Left" vertical dock along the canvas edge, and can be
 * undocked to a "Dynamic Floating Dock" for tablets and touchscreens.
 *
 * Houses the entire creative suite directly on the canvas without mode silos:
 * - Two Pen Tools: Raw Ink (natural pressure) and Smart Bezier Ink (auto-convert)
 * - Trace Mode (onion-skin lightbox)
 * - Vector & Spline (Pen, Curvature, Pattern Brushes, Shapes)
 * - Raster & Retouch (Color Dodger, Burner, Sponge, Eraser, Inpaint/Gen-Fill)
 * - Microsoft Word-Grade Typography & Tables
 * - Auto-Segment Color Vectorizer (SlimSAM / Florence-2)
 * - 3D Sculpt & Mesh Paint ("Light ZBrush")
 * - Voice & Multimodal Scene Understanding
 */

import * as React from 'react';
import { useState } from 'react';
import {
  MousePointer2, MousePointerClick, PenTool, Brush, Feather,
  Sun, Flame, Disc, Eraser, Sparkles, Type, Table, Box,
  Mic, ImagePlus, Sliders, Maximize2, Minimize2, Move,
  Wand2, Shapes, Palette, Layers, HelpCircle, Eye
} from 'lucide-react';
import type { PatternBrushKind } from '../../services/tela/telaPatternBrushEngine';
import type { SculptBrushType, MatCapPreset } from '../../services/tela/tela3dSculptEngine';

export type UnifiedTelaTool =
  // Selection
  | 'select'
  | 'direct'
  // Inking & Trace
  | 'raw_ink'
  | 'smart_ink'
  | 'trace_overlay'
  // Vector & Splines
  | 'pen'
  | 'curvature'
  | 'pattern_brush'
  | 'rect'
  | 'ellipse'
  | 'line'
  // Raster, Retouch & Generative
  | 'dodge'
  | 'burn'
  | 'sponge'
  | 'eraser'
  | 'inpaint'
  // Word Processing
  | 'word_text'
  | 'table'
  // Auto-Segmentation Vectorizer
  | 'auto_segment'
  // 3D Engine ("Light ZBrush")
  | 'sculpt_3d'
  | 'paint_3d'
  // Intelligence & Voice
  | 'voice_intel'
  | 'style_reference';

export interface UnifiedToolbarProps {
  activeTool: UnifiedTelaTool;
  onToolSelect: (tool: UnifiedTelaTool) => void;
  // Dock posture: Pro Left vs Dynamic Floating Tablet Dock
  dockMode: 'PRO_LEFT' | 'DYNAMIC_FLOAT';
  onToggleDockMode: () => void;
  // Inking options
  inkColor: string;
  onInkColorChange: (color: string) => void;
  inkWidth: number;
  onInkWidthChange: (width: number) => void;
  // Pattern brush options
  patternKind: PatternBrushKind;
  onPatternKindChange: (kind: PatternBrushKind) => void;
  // Dodger / Burner options
  dodgeBurnTonalRange: 'SHADOWS' | 'MIDTONES' | 'HIGHLIGHTS';
  onDodgeBurnTonalRangeChange: (range: 'SHADOWS' | 'MIDTONES' | 'HIGHLIGHTS') => void;
  // Inpaint / Gen-Fill options
  inpaintPrompt: string;
  onInpaintPromptChange: (prompt: string) => void;
  onTriggerInpaint?: () => void;
  inpaintBusy?: boolean;
  // 3D Sculpt options
  sculptBrush: SculptBrushType;
  onSculptBrushChange: (brush: SculptBrushType) => void;
  sculptRadius: number;
  onSculptRadiusChange: (radius: number) => void;
  sculptIntensity: number;
  onSculptIntensityChange: (intensity: number) => void;
  sculptMatcap: MatCapPreset;
  onSculptMatcapChange: (matcap: MatCapPreset) => void;
  sculptSymmetry: boolean;
  onToggleSculptSymmetry: () => void;
  // Voice command trigger
  onTriggerVoice?: () => void;
  voiceActive?: boolean;
  // Auto-segment trigger
  onTriggerAutoSegment?: () => void;
  autoSegmentBusy?: boolean;
}

export const TelaUnifiedToolbar: React.FC<UnifiedToolbarProps> = ({
  activeTool,
  onToolSelect,
  dockMode,
  onToggleDockMode,
  inkColor,
  onInkColorChange,
  inkWidth,
  onInkWidthChange,
  patternKind,
  onPatternKindChange,
  dodgeBurnTonalRange,
  onDodgeBurnTonalRangeChange,
  inpaintPrompt,
  onInpaintPromptChange,
  onTriggerInpaint,
  inpaintBusy = false,
  sculptBrush,
  onSculptBrushChange,
  sculptRadius,
  onSculptRadiusChange,
  sculptIntensity,
  onSculptIntensityChange,
  sculptMatcap,
  onSculptMatcapChange,
  sculptSymmetry,
  onToggleSculptSymmetry,
  onTriggerVoice,
  voiceActive = false,
  onTriggerAutoSegment,
  autoSegmentBusy = false,
}) => {
  const [flyoutOpen, setFlyoutOpen] = useState<string | null>(null);

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 38,
    height: 38,
    borderRadius: 9,
    display: 'grid',
    placeItems: 'center',
    color: active ? '#ffffff' : 'rgba(255,255,255,0.65)',
    background: active
      ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))'
      : 'transparent',
    border: active ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
    transition: 'all 0.15s ease',
    cursor: 'pointer',
    position: 'relative',
  });

  const divider = (
    <div
      style={{
        width: dockMode === 'PRO_LEFT' ? 24 : 1,
        height: dockMode === 'PRO_LEFT' ? 1 : 24,
        background: 'rgba(255,255,255,0.12)',
        margin: '4px 0',
      }}
    />
  );

  return (
    <>
      {/* ── Main Unified Toolbar ────────────────────────────────────────── */}
      <div
        className={`z-40 flex items-center select-none shadow-2xl backdrop-blur-xl transition-all duration-200 ${
          dockMode === 'PRO_LEFT'
            ? 'flex-col gap-1 py-3 px-1.5 shrink-0 border-r border-white/10 bg-[#09080d]/95 w-[52px]'
            : 'flex-row gap-1.5 py-1.5 px-3 rounded-[18px] border border-white/15 bg-[#100e17]/90 fixed bottom-6 left-1/2 -translate-x-1/2'
        }`}
        style={{
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Dock / Undock Toggle Button */}
        <button
          title={dockMode === 'PRO_LEFT' ? 'Switch to Dynamic Tablet Floating Dock' : 'Dock to Pro Left Rail'}
          onClick={onToggleDockMode}
          className="text-white/40 hover:text-white mb-1 transition-colors"
          style={{ width: 34, height: 26, display: 'grid', placeItems: 'center' }}
        >
          {dockMode === 'PRO_LEFT' ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
        </button>

        {divider}

        {/* 1. Selection & Anchor Editing */}
        <button
          title="Selection Tool (V) — Move and transform objects"
          style={btnStyle(activeTool === 'select')}
          onClick={() => onToolSelect('select')}
        >
          <MousePointer2 size={17} />
        </button>
        <button
          title="Direct Select / Anchor Nodes (A) — Edit bezier control points"
          style={btnStyle(activeTool === 'direct')}
          onClick={() => onToolSelect('direct')}
        >
          <MousePointerClick size={17} />
        </button>

        {divider}

        {/* 2. Dual Pen Inking & Trace Mode */}
        <button
          title="Raw Ink Pen — Natural stylus/touch drawing with pressure & tilt (keeps raw ink)"
          style={btnStyle(activeTool === 'raw_ink')}
          onClick={() => onToolSelect('raw_ink')}
        >
          <Brush size={17} />
          <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </button>
        <button
          title="Smart Bezier Pen — Hand-draw and auto-convert into editable cubic Bezier paths"
          style={btnStyle(activeTool === 'smart_ink')}
          onClick={() => onToolSelect('smart_ink')}
        >
          <Feather size={17} />
          <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-pink-500" />
        </button>
        <button
          title="Trace Mode — Onion-skin lightbox for tracing references and sketches"
          style={btnStyle(activeTool === 'trace_overlay')}
          onClick={() => onToolSelect('trace_overlay')}
        >
          <Eye size={17} />
        </button>

        {divider}

        {/* 3. Vector, Splines & Pattern Brushes */}
        <button
          title="Bezier Pen Tool (P) — Precision spline anchor editing"
          style={btnStyle(activeTool === 'pen')}
          onClick={() => onToolSelect('pen')}
        >
          <PenTool size={17} />
        </button>
        <button
          title="Pattern Brush — Procedural ribbons, stitches, pearls, and vines along splines"
          style={btnStyle(activeTool === 'pattern_brush')}
          onClick={() => onToolSelect('pattern_brush')}
        >
          <Wand2 size={17} />
        </button>

        {divider}

        {/* 4. Raster, Retouch & Generative Inpaint */}
        <button
          title="Color Dodger — Lighten shadows, midtones, or highlights"
          style={btnStyle(activeTool === 'dodge')}
          onClick={() => onToolSelect('dodge')}
        >
          <Sun size={17} />
        </button>
        <button
          title="Color Burner — Deepen density and shadow tones"
          style={btnStyle(activeTool === 'burn')}
          onClick={() => onToolSelect('burn')}
        >
          <Flame size={17} />
        </button>
        <button
          title="Eraser Suite — Raster alpha eraser and vector path trimmer"
          style={btnStyle(activeTool === 'eraser')}
          onClick={() => onToolSelect('eraser')}
        >
          <Eraser size={17} />
        </button>
        <button
          title="Non-Destructive Inpaint & Generative Fill — Synthesize new layers with prompt cues"
          style={btnStyle(activeTool === 'inpaint')}
          onClick={() => onToolSelect('inpaint')}
        >
          <Sparkles size={17} className="text-amber-300" />
        </button>

        {divider}

        {/* 5. Microsoft Word-Grade Typography & Tables */}
        <button
          title="Word-Grade Typography (T) — Heading styles, columns, tracking, and leading"
          style={btnStyle(activeTool === 'word_text')}
          onClick={() => onToolSelect('word_text')}
        >
          <Type size={17} />
        </button>
        <button
          title="Table Builder — Word-grade tables with cell formatting and formulas"
          style={btnStyle(activeTool === 'table')}
          onClick={() => onToolSelect('table')}
        >
          <Table size={17} />
        </button>

        {divider}

        {/* 6. Auto-Segmentation Color Vectorizer */}
        <button
          title="Interactive Auto-Segment Vectorizer — One-click subject isolation into colored vectors (SlimSAM)"
          style={btnStyle(activeTool === 'auto_segment')}
          onClick={() => {
            onToolSelect('auto_segment');
            onTriggerAutoSegment?.();
          }}
        >
          <Layers size={17} className="text-cyan-300" />
        </button>

        {divider}

        {/* 7. 3D Engine & Light ZBrush Sculpting */}
        <button
          title="Light ZBrush 3D Sculpt — Dynamic clay, grab, smooth, inflate, and flatten"
          style={btnStyle(activeTool === 'sculpt_3d')}
          onClick={() => onToolSelect('sculpt_3d')}
        >
          <Box size={17} className="text-orange-400" />
        </button>

        {divider}

        {/* 8. Voice & Scene Understanding */}
        <button
          title="Voice Directive & Scene Intelligence — Speak commands or analyze design"
          style={btnStyle(activeTool === 'voice_intel')}
          onClick={() => {
            onToolSelect('voice_intel');
            onTriggerVoice?.();
          }}
        >
          <Mic size={17} className={voiceActive ? 'text-red-400 animate-pulse' : 'text-purple-300'} />
        </button>
      </div>

      {/* ── Contextual Tool Options Bar (Top of canvas) ──────────────────── */}
      <div
        className="sticky top-0 z-30 flex items-center gap-3 px-4 h-10 w-full overflow-x-auto text-[.74rem] text-white/80 bg-[#0e0c14]/95 border-b border-white/10 backdrop-blur-md"
      >
        <span className="font-extrabold uppercase tracking-wider text-[.66rem] text-white/45">
          {activeTool.replace('_', ' ')}
        </span>

        {/* Inking Controls (Raw Ink or Smart Bezier Pen) */}
        {(activeTool === 'raw_ink' || activeTool === 'smart_ink') && (
          <div className="flex items-center gap-3">
            <span className="text-white/40">|</span>
            <label className="flex items-center gap-1.5">
              <span className="text-white/60">Width:</span>
              <input
                type="range"
                min={1}
                max={36}
                value={inkWidth}
                onChange={e => onInkWidthChange(+e.target.value)}
                className="w-20 accent-cyan-400"
              />
              <span className="font-mono text-cyan-300">{inkWidth}px</span>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-white/60">Color:</span>
              <input
                type="color"
                value={inkColor}
                onChange={e => onInkColorChange(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
              />
            </label>
            <span className="text-[.68rem] text-white/50 italic">
              {activeTool === 'raw_ink' ? 'Expressive pressure ink' : 'Auto-fits to cubic Bezier'}
            </span>
          </div>
        )}

        {/* Pattern Brush Controls */}
        {activeTool === 'pattern_brush' && (
          <div className="flex items-center gap-3">
            <span className="text-white/40">|</span>
            <span className="text-white/60">Motif:</span>
            <select
              value={patternKind}
              onChange={e => onPatternKindChange(e.target.value as PatternBrushKind)}
              className="bg-[#1b1724] border border-white/15 rounded px-2 py-0.5 text-white/85 text-[.7rem] outline-none"
            >
              <option value="STITCH">Stitch Angled</option>
              <option value="PEARL_BEAD">Pearl Beads</option>
              <option value="RIBBON_BRAID">Ribbon Braid</option>
              <option value="WAVE_RIPPLE">Wave Ripple</option>
              <option value="FLORAL_VINE">Floral Vine</option>
              <option value="NEON_GLOW">Neon Tube</option>
            </select>
          </div>
        )}

        {/* Dodge / Burn Controls */}
        {(activeTool === 'dodge' || activeTool === 'burn') && (
          <div className="flex items-center gap-3">
            <span className="text-white/40">|</span>
            <span className="text-white/60">Tonal Range:</span>
            {(['SHADOWS', 'MIDTONES', 'HIGHLIGHTS'] as const).map(range => (
              <button
                key={range}
                onClick={() => onDodgeBurnTonalRangeChange(range)}
                className={`px-2.5 py-0.5 rounded text-[.66rem] font-bold ${
                  dodgeBurnTonalRange === range
                    ? 'bg-white/20 text-white border border-white/30'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        )}

        {/* Generative Fill / Inpaint Controls */}
        {activeTool === 'inpaint' && (
          <div className="flex items-center gap-3 flex-1 max-w-[550px]">
            <span className="text-white/40">|</span>
            <input
              type="text"
              placeholder="Prompt or leave blank for seamless context-aware fill…"
              value={inpaintPrompt}
              onChange={e => onInpaintPromptChange(e.target.value)}
              className="flex-1 bg-[#171420] border border-white/15 rounded px-2.5 py-1 text-white text-[.72rem] outline-none focus:border-amber-400"
            />
            <button
              onClick={onTriggerInpaint}
              disabled={inpaintBusy}
              className="px-3 py-1 rounded bg-gradient-to-r from-amber-500 to-pink-600 text-white font-extrabold text-[.68rem] shadow disabled:opacity-50"
            >
              {inpaintBusy ? 'Synthesizing…' : 'Generate Layer'}
            </button>
          </div>
        )}

        {/* 3D Sculpt Controls ("Light ZBrush") */}
        {activeTool === 'sculpt_3d' && (
          <div className="flex items-center gap-3">
            <span className="text-white/40">|</span>
            <span className="text-white/60">Brush:</span>
            <select
              value={sculptBrush}
              onChange={e => onSculptBrushChange(e.target.value as SculptBrushType)}
              className="bg-[#1b1724] border border-white/15 rounded px-2 py-0.5 text-white/85 text-[.7rem] outline-none"
            >
              <option value="CLAY">Clay Build-up</option>
              <option value="GRAB">Grab / Move</option>
              <option value="STANDARD">Draw (Standard)</option>
              <option value="SMOOTH">Smooth (Hold Shift)</option>
              <option value="INFLATE">Inflate</option>
              <option value="PINCH">Pinch Crease</option>
              <option value="FLATTEN">Flatten</option>
            </select>

            <label className="flex items-center gap-1.5">
              <span className="text-white/60">Radius:</span>
              <input
                type="range"
                min={0.05}
                max={2.5}
                step={0.05}
                value={sculptRadius}
                onChange={e => onSculptRadiusChange(+e.target.value)}
                className="w-16 accent-orange-400"
              />
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-white/60">Strength:</span>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={sculptIntensity}
                onChange={e => onSculptIntensityChange(+e.target.value)}
                className="w-16 accent-orange-400"
              />
            </label>

            <button
              onClick={onToggleSculptSymmetry}
              className={`px-2 py-0.5 rounded text-[.65rem] font-bold border ${
                sculptSymmetry
                  ? 'bg-orange-500/20 text-orange-300 border-orange-400/50'
                  : 'text-white/40 border-white/10'
              }`}
            >
              X-Symmetry
            </button>

            <select
              value={sculptMatcap}
              onChange={e => onSculptMatcapChange(e.target.value as MatCapPreset)}
              className="bg-[#1b1724] border border-white/15 rounded px-2 py-0.5 text-white/85 text-[.68rem] outline-none"
            >
              <option value="GREY_CLAY">Grey Clay</option>
              <option value="RED_WAX">ZBrush Red Wax</option>
              <option value="PEARL">Pearl</option>
              <option value="CHROME">Chrome</option>
              <option value="NORMALS">Normals</option>
            </select>
          </div>
        )}
      </div>
    </>
  );
};

export default TelaUnifiedToolbar;
