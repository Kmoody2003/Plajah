import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Brush, Check, Crop, Download, Eraser, Eye, Layers3, Library, Maximize2, Minimize2, Palette, RotateCw, SlidersHorizontal, Sparkles, Wand2, X } from 'lucide-react';
import { Photo } from '../types';
import PhotoDevelopPreview from './PhotoDevelopPreview';
import {
  applyCreativeLook,
  adjustmentToCssFilter,
  CREATIVE_LOOKS,
  createPhotoEditRecipe,
  DEFAULT_PHOTO_ADJUSTMENTS,
  type CreativeLookCategory,
  type PhotoEditAdjustments,
  type PhotoEditMode,
} from '../services/photoEditingService';

interface PhotoEditPanelProps {
  photo: Photo;
  variant?: 'drawer' | 'workflow';
  onClose: () => void;
  onApply?: (recipe: ReturnType<typeof createPhotoEditRecipe>) => void;
}

const basicControls: Array<keyof PhotoEditAdjustments> = ['exposure', 'contrast', 'saturation', 'rotation'];
const advancedControls: Array<keyof PhotoEditAdjustments> = ['warmth', 'tint', 'highlights', 'shadows', 'whites', 'blacks', 'clarity', 'grain', 'vignette'];
const creativeControls: Array<keyof PhotoEditAdjustments> = ['brilliance', 'structure', 'dehaze', 'fade', 'warmth', 'saturation', 'grain', 'vignette'];

const labelFor = (key: keyof PhotoEditAdjustments) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const sliderGradient = (key: keyof PhotoEditAdjustments) => {
  if (key === 'warmth') return 'linear-gradient(90deg,#1677ff,#d9e9ff 46%,#fff1cc 54%,#ff8a24)';
  if (key === 'tint') return 'linear-gradient(90deg,#39c989,#dff4e8 46%,#f6dcef 54%,#e548a7)';
  if (key === 'saturation') return 'linear-gradient(90deg,#737780,#d7d7d7 46%,#ff665e,#ffd45a,#52d273,#4fc3ff,#ad65ee)';
  if (key === 'rotation') return 'linear-gradient(90deg,#7057d9,#a8a2bd 50%,#ff9d3d)';
  if (['exposure','highlights','shadows','whites','blacks','brilliance','fade'].includes(key)) return 'linear-gradient(90deg,#11141a,#5e6570 48%,#f7f2df)';
  if (['clarity','structure','dehaze'].includes(key)) return 'linear-gradient(90deg,#27304a,#30c9c9 55%,#f5d45b)';
  if (key === 'grain') return 'linear-gradient(90deg,#31343a,#aaa 55%,#fff)';
  if (key === 'vignette') return 'linear-gradient(90deg,#050505,#727272 50%,#ececec)';
  return 'linear-gradient(90deg,#41335e,#a651b8 50%,#ff8c00)';
};

const ParameterSlider = ({ adjustmentKey, value, onChange }: { adjustmentKey: keyof PhotoEditAdjustments; value: number; onChange: (value: number) => void }) => {
  const min = adjustmentKey === 'rotation' ? -45 : ['grain','vignette'].includes(adjustmentKey) ? 0 : -100;
  const max = adjustmentKey === 'rotation' ? 45 : 100;
  const pct = ((value - min) / (max - min)) * 100;
  return <label className="block group">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-black uppercase tracking-[.16em] text-white/60 group-hover:text-white transition-colors">{labelFor(adjustmentKey)}</span>
      <span className={`min-w-11 text-center rounded-md px-2 py-1 text-[10px] tabular-nums font-black ${value ? 'bg-small-orange/15 text-small-orange' : 'bg-white/5 text-white/35'}`}>{value > 0 ? '+' : ''}{value}</span>
    </div>
    <div className="relative h-5 flex items-center">
      <div className="absolute inset-x-0 h-[6px] rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,.7)]" style={{ background: sliderGradient(adjustmentKey) }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-white/40" style={{ left: '50%' }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white bg-[#15171b] shadow-[0_2px_8px_rgba(0,0,0,.8)] pointer-events-none" style={{ left: `calc(${pct}% - 7px)` }} />
      <input aria-label={labelFor(adjustmentKey)} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-ew-resize" />
    </div>
  </label>;
};

const PhotoEditPanel: React.FC<PhotoEditPanelProps> = ({ photo, variant = 'drawer', onClose, onApply }) => {
  const [mode, setMode] = useState<PhotoEditMode>('basic');
  const [workspace, setWorkspace] = useState<'catalog' | 'develop' | 'mask' | 'export'>('develop');
  const [compare, setCompare] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [lookCategory, setLookCategory] = useState<'All' | CreativeLookCategory>('All');
  const [selectedLook, setSelectedLook] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<PhotoEditAdjustments>({ ...DEFAULT_PHOTO_ADJUSTMENTS });
  const controls = mode === 'basic' ? basicControls : mode === 'creative' ? creativeControls : [...basicControls, ...advancedControls];

  const update = (key: keyof PhotoEditAdjustments, value: any) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
  };

  const apply = () => {
    const recipe = createPhotoEditRecipe(photo.id, mode);
    recipe.adjustments = adjustments;
    onApply?.(recipe);
    onClose();
  };

  const panel = (
    <div className={`${variant === 'workflow' ? (fullscreen ? 'fixed inset-0 z-[260]' : 'relative w-full h-full min-h-[calc(100dvh-4rem)]') + ' bg-[#08090b]' : 'fixed inset-y-0 right-0 z-[260] w-full max-w-md bg-[#050505]'} text-white border-l border-white/10 shadow-3xl flex flex-col overflow-hidden`}>
      <header className={`${variant === 'workflow' ? 'h-14 px-4' : 'p-5'} border-b border-white/10 flex items-center justify-between bg-[#0d0e11]`}>
        <div className="flex items-center gap-3">
          {variant === 'workflow' && <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" title="Back to Photos"><ArrowLeft size={17} /></button>}
          <div className="w-10 h-10 rounded-2xl bg-small-orange/15 flex items-center justify-center">
            <SlidersHorizontal size={18} className="text-small-orange" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">Photo Develop</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{photo.title || 'Untitled'} · Non-destructive</p>
          </div>
        </div>
        {variant === 'workflow' && <nav className="hidden md:flex self-stretch items-stretch">
          {([['catalog','Library'],['develop','Develop'],['mask','Generative Mask'],['export','Export']] as const).map(([id,label]) => <button key={id} onClick={() => setWorkspace(id)} className={`px-5 text-[9px] font-black uppercase tracking-[.18em] border-b-2 ${workspace === id ? 'text-white border-small-orange' : 'text-white/35 border-transparent hover:text-white/70'}`}>{label}</button>)}
        </nav>}
        <div className="flex items-center gap-2">
          {variant === 'workflow' && <button onClick={() => setCompare(v => !v)} className={`p-2 rounded-lg ${compare ? 'bg-small-orange text-black' : 'hover:bg-white/10'}`} title="Show original"><Eye size={16}/></button>}
          {variant === 'workflow' && <button onClick={() => setFullscreen(v => !v)} className="p-2 rounded-lg hover:bg-white/10" title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>}
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all" title="Close editor">
          <X size={18} />
          </button>
        </div>
      </header>

      <div className={`${variant === 'workflow' ? 'grid grid-cols-[56px_1fr_360px] flex-1 min-h-0' : 'flex-1 overflow-y-auto custom-scrollbar'}`}>
        {variant === 'workflow' && <aside className="bg-[#0d0e11] border-r border-white/10 flex flex-col items-center py-3 gap-2">
          {[
            ['develop', SlidersHorizontal, 'Develop'], ['mask', Brush, 'Generative mask'], ['mask', Eraser, 'Erase mask'], ['catalog', Library, 'Library'], ['export', Download, 'Export']
          ].map(([id, Icon, label], i) => <button key={`${id}-${i}`} onClick={() => setWorkspace(id as typeof workspace)} title={String(label)} className={`w-10 h-10 rounded-lg grid place-items-center ${workspace === id ? 'bg-small-orange text-black' : 'text-white/35 hover:bg-white/10 hover:text-white'}`}><Icon size={17}/></button>)}
          <div className="mt-auto"><button onClick={() => setFullscreen(v => !v)} className="w-10 h-10 rounded-lg grid place-items-center text-white/35 hover:bg-white/10" title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button></div>
        </aside>}
        <div className="min-h-[320px] bg-[#050506] flex items-center justify-center p-5 relative overflow-hidden" style={{ backgroundImage: 'radial-gradient(circle at center, #17191d 0, #08090a 62%)' }}>
          {compare && <span className="absolute top-4 left-4 z-10 px-2 py-1 bg-black/70 rounded text-[9px] font-black tracking-widest">ORIGINAL</span>}
          <PhotoDevelopPreview src={photo.url || ''} alt={photo.title || 'Photo preview'} adjustments={adjustments} compare={compare} />
        </div>

        <aside className="p-5 space-y-6 overflow-y-auto custom-scrollbar bg-[#111216] border-l border-white/10">
          {variant === 'workflow' && <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.24em] text-small-orange">{workspace}</p><p className="text-xs font-bold mt-1">{workspace === 'mask' ? 'Paint a nondestructive generative region' : workspace === 'export' ? 'Prepare a new rendition' : workspace === 'catalog' ? 'Photo library and versions' : 'Light and creative controls'}</p></div><Layers3 size={16} className="text-white/25"/></div>}
          {workspace === 'mask' && <div className="p-4 rounded-2xl bg-small-orange/10 border border-small-orange/25"><p className="text-[10px] font-black uppercase tracking-widest text-small-orange">Generative layer</p><p className="text-xs text-white/50 mt-2 leading-relaxed">Brush over the image to define an inpaint region. The mask and generated result remain separate from the original.</p><button className="mt-3 w-full py-2 rounded-lg bg-small-orange text-black text-[9px] font-black uppercase tracking-widest">Start painting</button></div>}
          {workspace === 'export' && <div className="space-y-3"><button onClick={apply} className="w-full py-3 rounded-xl bg-white text-black text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Download size={14}/> Export rendition</button><p className="text-[10px] text-white/35">The original remains untouched. Your recipe stays editable.</p></div>}
          <div className="grid grid-cols-3 gap-2 p-1 bg-white/5 rounded-2xl">
            {[
              { id: 'basic', label: 'Basic', icon: Crop },
              { id: 'advanced', label: 'Advanced', icon: Wand2 },
              { id: 'creative', label: 'Inspire', icon: Sparkles },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setMode(item.id as PhotoEditMode)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === item.id ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </div>

          {mode === 'creative' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {(['All','Essential','Portrait','Cinema','Analog','Landscape'] as const).map(category => <button key={category} onClick={() => setLookCategory(category)} className={`shrink-0 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${lookCategory === category ? 'bg-white text-black' : 'bg-white/5 text-white/45 hover:text-white'}`}>{category}</button>)}
              </div>
              <div className="grid grid-cols-2 gap-2">
              {CREATIVE_LOOKS.filter(look => lookCategory === 'All' || look.category === lookCategory).map(look => {
                const lookAdjustments = { ...DEFAULT_PHOTO_ADJUSTMENTS, ...look.adjustments };
                return <button key={look.id} onClick={() => { setSelectedLook(look.id); setAdjustments(prev => applyCreativeLook(prev, look.id)); }}
                  className={`group relative h-24 rounded-xl overflow-hidden border text-left transition-all ${selectedLook === look.id ? 'border-small-orange ring-2 ring-small-orange/25' : 'border-white/10 hover:border-white/35'}`}>
                  <img src={photo.url || ''} alt="" className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-500" style={{ filter: adjustmentToCssFilter(lookAdjustments) }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-transparent" />
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-black/30" style={{ background: look.accent }} />
                  <span className="absolute bottom-2 left-2 right-2 text-[9px] font-black uppercase tracking-[.13em] text-white drop-shadow-md">{look.label}</span>
                </button>;
              })}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-orange-500/10 border border-white/10">
                <Palette size={14} className="text-fuchsia-300"/><p className="text-[10px] text-white/50"><strong className="text-white/80">Looks are starting points.</strong> Every ingredient remains editable below.</p>
              </div>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner">
            {controls.map(key => (
              key === 'cropAspect' ? null : <ParameterSlider key={key} adjustmentKey={key} value={Number(adjustments[key])} onChange={value => { setSelectedLook(null); update(key, value); }} />
            ))}
          </div>

          {mode === 'advanced' && (
            <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-small-orange">
                <Sparkles size={14} />
                <p className="text-[10px] font-black uppercase tracking-widest">Pro Workflow Foundation</p>
              </div>
              <p className="text-xs font-bold text-white/40 leading-relaxed">
                This panel stores edit decisions as recipes. The next layer can add OpenColorIO/LittleCMS color transforms, masks, RAW sidecars, and device-side AI helpers without changing how the rest of Plajah opens an editor.
              </p>
            </div>
          )}
        </aside>
      </div>

      <footer className="p-5 border-t border-white/10 flex gap-3">
        <button onClick={() => setAdjustments({ ...DEFAULT_PHOTO_ADJUSTMENTS })} className="px-4 py-3 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 flex items-center gap-2">
          <RotateCw size={14} />
          Reset
        </button>
        <button onClick={apply} className="flex-1 px-4 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-2">
          <Check size={14} />
          Save Recipe
        </button>
      </footer>
    </div>
  );

  return fullscreen ? createPortal(panel, document.body) : panel;
};

export default PhotoEditPanel;
