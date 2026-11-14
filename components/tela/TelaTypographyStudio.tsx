import React, { useState } from 'react';
import {
  Type, Sparkles, Box, Shapes, Scissors, Layers, Sliders, ChevronDown,
  Wand2, Copy, Trash2, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline, Strikethrough, Plus, RefreshCw, Eye, EyeOff
} from 'lucide-react';
import type { TelaVectorObject, TelaBlendMode } from '../../types';

export interface TelaTypographyStudioProps {
  selectedObject: TelaVectorObject | null;
  onUpdateObject: (patch: Partial<TelaVectorObject>) => void;
  onCreateTypographyObject: (kind: 'TEXT' | '3D' | 'SHAPE_ARRAY' | 'GENERATIVE', patch?: Partial<TelaVectorObject>) => void;
  onExplodeLetters?: (object: TelaVectorObject) => void;
  onClose: () => void;
  activeFrameLabel?: string;
}

export type TypographyStudioTab = 'PROSE' | '3D_MATERIALS' | 'SHAPE_ARRAYS' | 'MASKING_LAYERS' | 'GLYPH_TRANSFORM' | 'GENERATIVE_FIREFLY';

export const PBR_MATERIALS = [
  { id: 'GOLD_BRASS', name: '24K Gold & Brass', preview: 'linear-gradient(135deg, #FFE57F, #FFC107, #B8860B)', color: '#FFD700', extColor: '#8C6500' },
  { id: 'CHROME_LIQUID', name: 'Liquid Chrome', preview: 'linear-gradient(135deg, #FFFFFF, #B0C4DE, #46556B)', color: '#E6F0FA', extColor: '#334455' },
  { id: 'OBSIDIAN', name: 'Glossy Obsidian', preview: 'linear-gradient(135deg, #2D2B35, #141318, #050408)', color: '#1B1824', extColor: '#050407' },
  { id: 'CRYSTAL_GLASS', name: 'Crystal Glass', preview: 'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(0,218,243,0.3), rgba(212,0,85,0.3))', color: 'rgba(255,255,255,0.7)', extColor: 'rgba(0,180,210,0.4)' },
  { id: 'NEON_CYAN', name: 'Neon Cyber Cyan', preview: 'linear-gradient(135deg, #00DAF3, #0088A8, #003344)', color: '#8FF5FF', extColor: '#007088' },
  { id: 'NEON_MAGENTA', name: 'Neon Electric Pink', preview: 'linear-gradient(135deg, #FF1493, #D40055, #6B0038)', color: '#FFE4F3', extColor: '#8B0040' },
  { id: 'HOLOGRAPHIC', name: 'Holographic Foil', preview: 'linear-gradient(135deg, #00DAF3, #D40055, #FFC107, #06D6A0)', color: '#00DAF3', extColor: '#6B0099' },
  { id: 'BAUHAUS_CLAY', name: 'Bauhaus Matte Clay', preview: 'linear-gradient(135deg, #E52521, #BA1C19, #6B0806)', color: '#E52521', extColor: '#5C0806' },
] as const;

export const GENERATIVE_STYLES = [
  { id: 'JUNGLE_FLORAL', name: 'Jungle Vines & Florals', desc: 'Lush tropical monsteras, orchids and winding green tendrils', gradient: 'linear-gradient(135deg, #10b981 0%, #047857 50%, #f472b6 100%)' },
  { id: 'CYBER_CIRCUIT', name: 'Cyberpunk Glowing PCB', desc: 'Matte black substrate with glowing neon trace circuits', gradient: 'linear-gradient(135deg, #09090b 0%, #0284c7 50%, #00f2fe 100%)' },
  { id: 'MOLTEN_MAGMA', name: 'Cracked Volcanic Magma', desc: 'Obsidian basalt rock with incandescent lava fractures', gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #1c1917 100%)' },
  { id: 'GLACIAL_ICE', name: 'Faceted Glacial Ice', desc: 'Chiseled sub-zero crystal shards with trapped bubbles', gradient: 'linear-gradient(135deg, #e0f2fe 0%, #38bdf8 50%, #1e40af 100%)' },
  { id: 'GOLDEN_FILIGREE', name: 'Baroque Gold Filigree', desc: 'Deeply engraved 24k gold with rococo swirling foliage', gradient: 'linear-gradient(135deg, #fef08a 0%, #eab308 50%, #713f12 100%)' },
  { id: 'COSMIC_NEBULA', name: 'Deep Space Nebula', desc: 'Swirling stellar clouds with clusters of blazing stars', gradient: 'linear-gradient(135deg, #d946ef 0%, #6366f1 50%, #09090b 100%)' },
  { id: 'SWEET_CANDY', name: 'Glossy Candy Glaze', desc: 'Pink strawberry glaze sprinkled with iridescent rainbow crystals', gradient: 'linear-gradient(135deg, #f472b6 0%, #fb7185 50%, #fbcfe8 100%)' },
  { id: 'STEAMPUNK', name: 'Steampunk Riveted Brass', desc: 'Aged weathered copper plates with brass gearwork', gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 50%, #451a03 100%)' },
] as const;

export const SHAPE_ARRAYS = [
  { id: 'CIRCLE', name: 'Sphere / Circle Calligram', icon: '⭕', desc: 'Text packed tightly into a circular or spherical boundary' },
  { id: 'HEART', name: 'Heart Silhouette', icon: '💖', desc: 'Flowing poetic lines conforming to a heart contour' },
  { id: 'STAR', name: 'Sacred Star / Seal', icon: '⭐', desc: 'Geometric packing into a 5-point star or sacred polygon' },
  { id: 'DIAMOND', name: 'Diamond / Rhombus', icon: '🔷', desc: 'Angular geometric typography array' },
  { id: 'CLOUD', name: 'Dream Cloud', icon: '☁️', desc: 'Billowing organic speech cloud text boundary' },
  { id: 'WAVE', name: 'Sinusoidal Wave Flow', icon: '〰️', desc: 'Letters undulating across a rhythmic wave path' },
  { id: 'SPIRAL', name: 'Vortex Log Spiral', icon: '🌀', desc: 'Archimedean text spiral coiling inwards' },
  { id: 'DNA_HELIX', name: 'Bioluminescent DNA Helix', icon: '🧬', desc: 'Dual coiled lyric strands with nucleotide word rungs' },
] as const;

export const FONTS = [
  { label: 'Inter (Clean Sans)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Playfair (Editorial Serif)', value: 'Playfair Display, Georgia, serif' },
  { label: 'Cormorant (High Luxury)', value: 'Cormorant Garamond, serif' },
  { label: 'JetBrains (Monospace Tech)', value: 'JetBrains Mono, monospace' },
  { label: 'Syne (Avant-Garde Display)', value: 'Syne, sans-serif' },
  { label: 'Cinzel (Cinematic Classical)', value: 'Cinzel, Georgia, serif' },
  { label: 'Oswald (Bold Impact)', value: 'Oswald, sans-serif' },
];

export const TelaTypographyStudio: React.FC<TelaTypographyStudioProps> = ({
  selectedObject: o,
  onUpdateObject,
  onCreateTypographyObject,
  onExplodeLetters,
  onClose,
  activeFrameLabel,
}) => {
  const [tab, setTab] = useState<TypographyStudioTab>('PROSE');
  const [promptInput, setPromptInput] = useState('tropical jungle foliage with blooming orchids and exotic gold vines');
  const [customText, setCustomText] = useState(o?.text || 'CREATIVE TYPOGRAPHY');

  // If there's an active text object selected, apply patch directly; otherwise create one!
  const applyOrPreview = (patch: Partial<TelaVectorObject>) => {
    if (o) {
      onUpdateObject(patch);
    } else {
      onCreateTypographyObject('TEXT', { text: customText, ...patch });
    }
  };

  return (
    <div
      className="select-none flex flex-col overflow-hidden text-white"
      style={{
        width: 440,
        maxHeight: 'min(calc(100vh - 190px), 640px)',
        background: 'rgba(14, 11, 20, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        borderRadius: 16,
        boxShadow: '0 24px 70px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Studio Header ── */}
      <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-[7px] grid place-items-center bg-gradient-to-br from-[#6B0099] to-[#D40055] text-white">
            <Type size={14} />
          </span>
          <div>
            <h3 className="font-extrabold text-[12px] tracking-tight leading-none text-white/95">
              Typography & Text Studio
            </h3>
            <span className="text-[10px] text-white/45">
              {o ? `Editing selected: "${(o.text || 'Text Box').slice(0, 20)}"` : `Ready for ${activeFrameLabel || 'active page'}`}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-[7px] hover:bg-white/10 text-white/50 hover:text-white grid place-items-center text-xs font-bold"
          title="Close Typography Studio"
        >
          ✕
        </button>
      </div>

      {/* ── Feature Tabs ── */}
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 bg-black/30 border-b border-white/10 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setTab('PROSE')}
          className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            tab === 'PROSE' ? 'bg-[var(--pj-magenta,#D40055)] text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Type size={12} /> Prose & Layout
        </button>
        <button
          onClick={() => setTab('3D_MATERIALS')}
          className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            tab === '3D_MATERIALS' ? 'bg-[#00DAF3] text-black shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Box size={12} /> 3D & Materials
        </button>
        <button
          onClick={() => setTab('GENERATIVE_FIREFLY')}
          className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            tab === 'GENERATIVE_FIREFLY' ? 'bg-gradient-to-r from-amber-500 to-pink-500 text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sparkles size={12} /> Firefly Text Art
        </button>
        <button
          onClick={() => setTab('SHAPE_ARRAYS')}
          className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            tab === 'SHAPE_ARRAYS' ? 'bg-purple-600 text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Shapes size={12} /> Shape Arrays
        </button>
        <button
          onClick={() => setTab('MASKING_LAYERS')}
          className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            tab === 'MASKING_LAYERS' ? 'bg-emerald-600 text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Scissors size={12} /> Mask & Collide
        </button>
        <button
          onClick={() => setTab('GLYPH_TRANSFORM')}
          className={`px-2.5 py-1 rounded-[8px] text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            tab === 'GLYPH_TRANSFORM' ? 'bg-indigo-600 text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sliders size={12} /> Letter Tools
        </button>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-4">
        {/* TAB 1: PROSE & COMPLETE PAGE LAYOUT */}
        {tab === 'PROSE' && (
          <div className="space-y-3.5">
            {/* Quick insert action if no selection */}
            {!o && (
              <div className="p-2.5 rounded-[12px] bg-white/[0.04] border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-white">No text box selected</div>
                  <div className="text-[10px] text-white/50">Insert a rich text box directly on page</div>
                </div>
                <button
                  onClick={() => onCreateTypographyObject('TEXT', { text: customText })}
                  className="px-3 py-1.5 rounded-[8px] bg-[var(--pj-magenta,#D40055)] text-white text-[11px] font-bold hover:brightness-110 shadow-sm"
                >
                  ＋ Add Text Box
                </button>
              </div>
            )}

            {/* Font Family & Size */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Font Family & Size</label>
              <div className="flex items-center gap-2">
                <select
                  value={o?.fontFamily || FONTS[0].value}
                  onChange={e => applyOrPreview({ fontFamily: e.target.value })}
                  className="flex-1 h-8 px-2.5 rounded-[8px] bg-white/10 border border-white/15 text-[11px] font-semibold text-white outline-none"
                >
                  {FONTS.map(f => (
                    <option key={f.value} value={f.value} className="bg-[#14121d] text-white">{f.label}</option>
                  ))}
                </select>
                <div className="flex items-center rounded-[8px] bg-white/10 border border-white/15 h-8 px-1">
                  <button
                    onClick={() => applyOrPreview({ fontSize: Math.max(8, (o?.fontSize || 18) - 2) })}
                    className="w-6 h-6 rounded-[6px] hover:bg-white/10 grid place-items-center text-xs font-bold text-white/70"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-xs font-bold">{o?.fontSize || 18}</span>
                  <button
                    onClick={() => applyOrPreview({ fontSize: Math.min(200, (o?.fontSize || 18) + 2) })}
                    className="w-6 h-6 rounded-[6px] hover:bg-white/10 grid place-items-center text-xs font-bold text-white/70"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Typography Styles & Alignment */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-0.5 rounded-[8px] bg-white/10 border border-white/15">
                <button
                  onClick={() => applyOrPreview({ fontWeight: (o?.fontWeight || 400) >= 700 ? 400 : 700 })}
                  className={`w-7 h-7 rounded-[6px] grid place-items-center text-xs font-black ${
                    (o?.fontWeight || 400) >= 700 ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'text-white/70 hover:bg-white/10'
                  }`}
                  title="Bold"
                >
                  B
                </button>
                <button
                  onClick={() => applyOrPreview({ fontStyle: o?.fontStyle === 'italic' ? 'normal' : 'italic' })}
                  className={`w-7 h-7 rounded-[6px] grid place-items-center text-xs font-serif italic ${
                    o?.fontStyle === 'italic' ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'text-white/70 hover:bg-white/10'
                  }`}
                  title="Italic"
                >
                  I
                </button>
                <button
                  onClick={() => applyOrPreview({ textTransform: o?.textTransform === 'uppercase' ? 'none' : 'uppercase' })}
                  className={`w-7 h-7 rounded-[6px] grid place-items-center text-[10px] font-bold ${
                    o?.textTransform === 'uppercase' ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'text-white/70 hover:bg-white/10'
                  }`}
                  title="All Caps"
                >
                  TT
                </button>
              </div>

              <div className="flex items-center gap-1 p-0.5 rounded-[8px] bg-white/10 border border-white/15">
                {(['left', 'center', 'right'] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => applyOrPreview({ textAlign: a })}
                    className={`w-7 h-7 rounded-[6px] grid place-items-center text-xs ${
                      (o?.textAlign || 'left') === a ? 'bg-white/20 text-[#00DAF3]' : 'text-white/60 hover:bg-white/10'
                    }`}
                    title={`Align ${a}`}
                  >
                    {a === 'left' ? <AlignLeft size={13} /> : a === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Layout: Columns, Standoff & Wrap */}
            <div className="p-3 rounded-[12px] bg-white/[0.03] border border-white/10 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Columns & Text Flow</span>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/80">Layout Columns</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map(col => (
                    <button
                      key={col}
                      onClick={() => applyOrPreview({ columns: col })}
                      className={`w-7 h-6 rounded-[6px] text-xs font-bold transition-all ${
                        (o?.columns || 1) === col ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'bg-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-[11px] text-white/80">Word Wrap on Box</span>
                <input
                  type="checkbox"
                  checked={o?.wrap ?? true}
                  onChange={e => applyOrPreview({ wrap: e.target.checked })}
                  className="accent-[#D40055] w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-[11px] text-white/80">Card Background</span>
                <select
                  value={o?.backgroundColor || 'transparent'}
                  onChange={e => applyOrPreview({ backgroundColor: e.target.value, padding: e.target.value === 'transparent' ? 4 : 16, rx: 8 })}
                  className="h-7 px-2 rounded-[6px] bg-white/10 border border-white/15 text-[11px] text-white outline-none"
                >
                  <option value="transparent" className="bg-[#14121d]">None (Transparent)</option>
                  <option value="#FFFFFF" className="bg-[#14121d]">White Card</option>
                  <option value="rgba(18, 14, 28, 0.9)" className="bg-[#14121d]">Dark Luxury Card</option>
                  <option value="rgba(212, 0, 85, 0.1)" className="bg-[#14121d]">Magenta Tint</option>
                  <option value="rgba(0, 218, 243, 0.1)" className="bg-[#14121d]">Cyan Tint</option>
                  <option value="rgba(255, 140, 0, 0.1)" className="bg-[#14121d]">Amber Tint</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 3D TEXT & PBR MATERIALS */}
        {tab === '3D_MATERIALS' && (
          <div className="space-y-4">
            <div className="p-3 rounded-[12px] bg-white/[0.04] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[11px] font-bold text-white">3D Extrusion Depth</h4>
                  <span className="text-[10px] text-white/50">Genuine depth layers & spatial lighting</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-[#00DAF3]">{o?.extrusion3D || 0}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="2"
                value={o?.extrusion3D || 0}
                onChange={e => applyOrPreview({ extrusion3D: parseInt(e.target.value, 10) })}
                className="w-full accent-[#00DAF3] cursor-pointer"
              />
            </div>

            {/* 3D Perspective Tilt Controls */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-[10px] bg-white/[0.03] border border-white/10">
                <div className="flex justify-between text-[10px] font-bold text-white/70 mb-1">
                  <span>Pitch Tilt (X)</span>
                  <span className="text-[#00DAF3]">{o?.tiltX || 0}°</span>
                </div>
                <input
                  type="range"
                  min="-35"
                  max="35"
                  value={o?.tiltX || 0}
                  onChange={e => applyOrPreview({ tiltX: parseInt(e.target.value, 10) })}
                  className="w-full accent-[#00DAF3] cursor-pointer"
                />
              </div>
              <div className="p-2.5 rounded-[10px] bg-white/[0.03] border border-white/10">
                <div className="flex justify-between text-[10px] font-bold text-white/70 mb-1">
                  <span>Yaw Tilt (Y)</span>
                  <span className="text-[#00DAF3]">{o?.tiltY || 0}°</span>
                </div>
                <input
                  type="range"
                  min="-35"
                  max="35"
                  value={o?.tiltY || 0}
                  onChange={e => applyOrPreview({ tiltY: parseInt(e.target.value, 10) })}
                  className="w-full accent-[#00DAF3] cursor-pointer"
                />
              </div>
            </div>

            {/* PBR Studio Material Presets */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">PBR Material Finish</span>
              <div className="grid grid-cols-2 gap-2">
                {PBR_MATERIALS.map(mat => {
                  const active = o?.material3D === mat.id;
                  return (
                    <button
                      key={mat.id}
                      onClick={() => applyOrPreview({
                        material3D: mat.id as any,
                        fill: mat.color,
                        extrusion3D: o?.extrusion3D ? o.extrusion3D : 14,
                      })}
                      className={`p-2 rounded-[10px] border text-left transition-all flex items-center gap-2 ${
                        active
                          ? 'border-[#00DAF3] bg-white/10 shadow-[0_0_15px_rgba(0,218,243,0.2)]'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full shrink-0 shadow-sm border border-white/20" style={{ background: mat.preview }} />
                      <div className="truncate">
                        <div className="text-[11px] font-bold text-white truncate">{mat.name}</div>
                        <div className="text-[9px] text-white/40 truncate">{mat.id.toLowerCase().replace('_', ' ')}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FIREFLY GENERATIVE TEXT EFFECTS */}
        {tab === 'GENERATIVE_FIREFLY' && (
          <div className="space-y-3.5">
            <div className="p-3 rounded-[12px] bg-gradient-to-br from-amber-500/10 via-pink-500/10 to-purple-500/10 border border-amber-500/20 space-y-2.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                <Sparkles size={14} /> Firefly-Style Prompt Text Effects
              </div>
              <p className="text-[10px] text-white/70 leading-relaxed">
                Describe a texture, material or theme. Plajah synthesizes high-res displacement and procedural shaders directly onto the text glyphs.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promptInput}
                  onChange={e => setPromptInput(e.target.value)}
                  placeholder="e.g. melting liquid gold with crystal facets"
                  className="flex-1 h-8 px-2.5 rounded-[8px] bg-black/40 border border-white/20 text-[11px] text-white outline-none focus:border-amber-400"
                />
                <button
                  onClick={() => applyOrPreview({
                    generativeEffect: {
                      prompt: promptInput,
                      style: 'JUNGLE_FLORAL',
                      intensity: 1,
                    },
                    fontFamily: 'Syne, sans-serif',
                    fontWeight: 800,
                  })}
                  className="px-3 h-8 rounded-[8px] bg-gradient-to-r from-amber-500 to-pink-500 text-white font-bold text-[11px] hover:brightness-110 shadow-sm shrink-0"
                >
                  Generate
                </button>
              </div>
            </div>

            {/* Curated Style Presets */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Preset Text Art Styles</span>
              <div className="grid grid-cols-2 gap-2">
                {GENERATIVE_STYLES.map(style => {
                  const active = o?.generativeEffect?.style === style.id;
                  return (
                    <button
                      key={style.id}
                      onClick={() => applyOrPreview({
                        generativeEffect: {
                          prompt: style.desc,
                          style: style.id as any,
                          intensity: 1,
                        },
                        fontFamily: 'Syne, sans-serif',
                        fontWeight: 800,
                        fill: 'url(#gen_pattern)',
                      })}
                      className={`p-2.5 rounded-[10px] border text-left transition-all ${
                        active
                          ? 'border-pink-500 bg-white/10 shadow-[0_0_15px_rgba(236,72,153,0.3)]'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      <div className="h-4 w-full rounded-[4px] mb-1.5" style={{ background: style.gradient }} />
                      <div className="text-[11px] font-bold text-white truncate">{style.name}</div>
                      <div className="text-[9px] text-white/50 line-clamp-1 leading-tight mt-0.5">{style.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SHAPE-CONFINED ARRAYS & SACRED GEOMETRY */}
        {tab === 'SHAPE_ARRAYS' && (
          <div className="space-y-3.5">
            <p className="text-[10px] text-white/70 leading-relaxed bg-purple-900/20 p-2.5 rounded-[10px] border border-purple-500/20">
              Draw typography from procedural generators. Text arrays automatically pack into geometric silhouettes or flow along kinetic sacred pathways.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {SHAPE_ARRAYS.map(shape => {
                const active = o?.textArrayShape === shape.id;
                return (
                  <button
                    key={shape.id}
                    onClick={() => applyOrPreview({
                      textArrayShape: shape.id as any,
                      w: Math.max(o?.w || 320, 260),
                      h: Math.max(o?.h || 200, 260),
                      fontFamily: 'Cinzel, Georgia, serif',
                    })}
                    className={`p-2.5 rounded-[10px] border text-left transition-all ${
                      active
                        ? 'border-purple-400 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{shape.icon}</span>
                      <span className="text-[11px] font-bold text-white truncate">{shape.name}</span>
                    </div>
                    <div className="text-[9px] text-white/50 leading-tight">{shape.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: MASKING, KNOCKOUT & LAYER COLLISIONS */}
        {tab === 'MASKING_LAYERS' && (
          <div className="space-y-3.5">
            <div className="p-3 rounded-[12px] bg-white/[0.03] border border-white/10 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Text Masking Mode</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'NONE', label: 'Solid Text', desc: 'Normal vector glyph fill' },
                  { id: 'IMAGE', label: 'Photo Image Clip', desc: 'Clip text to photographic image' },
                  { id: 'GRADIENT', label: 'Spectral Gradient', desc: 'Vibrant multi-stop color wash' },
                  { id: 'KNOCKOUT', label: 'Negative Knockout', desc: 'Transparent cutout through underlying card' },
                ].map(m => {
                  const active = (o?.textMask || 'NONE') === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => applyOrPreview({ textMask: m.id as any })}
                      className={`p-2 rounded-[8px] border text-left transition-all ${
                        active
                          ? 'border-emerald-400 bg-emerald-500/20 text-white'
                          : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="text-[11px] font-bold">{m.label}</div>
                      <div className="text-[9px] text-white/40">{m.desc}</div>
                    </button>
                  );
                })}
              </div>

              {o?.textMask === 'IMAGE' && (
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <label className="text-[10px] font-semibold text-white/60">Image Mask URL</label>
                  <input
                    type="text"
                    value={o?.textMaskUrl || ''}
                    onChange={e => applyOrPreview({ textMaskUrl: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full h-8 px-2.5 rounded-[8px] bg-white/10 border border-white/15 text-[11px] text-white outline-none"
                  />
                </div>
              )}
            </div>

            {/* Layer Interaction & Blend Collisions */}
            <div className="p-3 rounded-[12px] bg-white/[0.03] border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[11px] font-bold text-white">Intersecting Blend Modes</h4>
                  <span className="text-[10px] text-white/50">Letters invert & interact when overlapping</span>
                </div>
                <select
                  value={o?.blendMode || 'normal'}
                  onChange={e => applyOrPreview({ blendMode: e.target.value as TelaBlendMode })}
                  className="h-7 px-2 rounded-[6px] bg-white/10 border border-white/15 text-[11px] text-white outline-none"
                >
                  <option value="normal" className="bg-[#14121d]">Normal</option>
                  <option value="difference" className="bg-[#14121d]">Difference (High Contrast Invert)</option>
                  <option value="exclusion" className="bg-[#14121d]">Exclusion (Soft Invert)</option>
                  <option value="overlay" className="bg-[#14121d]">Overlay</option>
                  <option value="multiply" className="bg-[#14121d]">Multiply</option>
                  <option value="screen" className="bg-[#14121d]">Screen</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: LETTER TRANSFORMER & EXPLODE */}
        {tab === 'GLYPH_TRANSFORM' && (
          <div className="space-y-3.5">
            {/* Explode into individual letters */}
            <div className="p-3 rounded-[12px] bg-gradient-to-r from-indigo-500/15 to-purple-500/15 border border-indigo-500/30 space-y-2">
              <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px]">
                <Scissors size={14} /> Explode Into Individual Letter Objects
              </div>
              <p className="text-[10px] text-white/70 leading-relaxed">
                Splits each letter in the word into its own independent vector object. Drag, scale, tilt, and color every single letter separately!
              </p>
              <button
                disabled={!o || !o.text}
                onClick={() => o && onExplodeLetters?.(o)}
                className={`w-full h-8 rounded-[8px] font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 ${
                  o && o.text
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                💥 Explode Selected Text into Letters
              </button>
            </div>

            {/* Procedural Letter Scatter & Wobble */}
            <div className="p-3 rounded-[12px] bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-white">Baseline Wobble & Wave</span>
                <span className="text-[11px] font-mono text-indigo-400">{o?.letterTransform?.wobble || 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={o?.letterTransform?.wobble || 0}
                onChange={e => applyOrPreview({ letterTransform: { ...o?.letterTransform, wobble: parseInt(e.target.value, 10) } })}
                className="w-full accent-indigo-400 cursor-pointer"
              />

              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <span className="text-[11px] font-bold text-white">Letter Angle Scatter</span>
                <span className="text-[11px] font-mono text-indigo-400">{o?.letterTransform?.scatter || 0}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="45"
                value={o?.letterTransform?.scatter || 0}
                onChange={e => applyOrPreview({ letterTransform: { ...o?.letterTransform, scatter: parseInt(e.target.value, 10) } })}
                className="w-full accent-indigo-400 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Studio Footer Actions ── */}
      <div className="shrink-0 p-2.5 bg-black/40 border-t border-white/10 flex items-center justify-between">
        <span className="text-[10px] text-white/40">Plajah Sacred Typography Engine</span>
        <button
          onClick={onClose}
          className="px-3.5 py-1 rounded-[7px] bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
};
