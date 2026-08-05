import React, { useMemo, useState } from 'react';
import { Check, Crop, RotateCw, SlidersHorizontal, Sparkles, Wand2, X } from 'lucide-react';
import { Photo } from '../types';
import {
  adjustmentToCssFilter,
  createPhotoEditRecipe,
  DEFAULT_PHOTO_ADJUSTMENTS,
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
const advancedControls: Array<keyof PhotoEditAdjustments> = ['warmth', 'tint', 'highlights', 'shadows', 'clarity', 'grain', 'vignette'];

const labelFor = (key: keyof PhotoEditAdjustments) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const PhotoEditPanel: React.FC<PhotoEditPanelProps> = ({ photo, variant = 'drawer', onClose, onApply }) => {
  const [mode, setMode] = useState<PhotoEditMode>('basic');
  const [adjustments, setAdjustments] = useState<PhotoEditAdjustments>({ ...DEFAULT_PHOTO_ADJUSTMENTS });
  const filter = useMemo(() => adjustmentToCssFilter(adjustments), [adjustments]);
  const controls = mode === 'basic' ? basicControls : [...basicControls, ...advancedControls];

  const update = (key: keyof PhotoEditAdjustments, value: any) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
  };

  const apply = () => {
    const recipe = createPhotoEditRecipe(photo.id, mode);
    recipe.adjustments = adjustments;
    onApply?.(recipe);
    onClose();
  };

  return (
    <div className={`${variant === 'workflow' ? 'fixed inset-0 z-[260] bg-black' : 'fixed inset-y-0 right-0 z-[260] w-full max-w-md bg-[#050505]'} text-white border-l border-white/10 shadow-3xl flex flex-col`}>
      <header className="p-5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-small-orange/15 flex items-center justify-center">
            <SlidersHorizontal size={18} className="text-small-orange" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">Photo Editor</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Non-destructive recipe</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-all" title="Close editor">
          <X size={18} />
        </button>
      </header>

      <div className={`${variant === 'workflow' ? 'grid grid-cols-1 xl:grid-cols-[1fr_420px] flex-1 min-h-0' : 'flex-1 overflow-y-auto custom-scrollbar'}`}>
        <div className="min-h-[320px] bg-black flex items-center justify-center p-5">
          <img
            src={photo.url || ''}
            alt={photo.title || 'Photo preview'}
            className="max-w-full max-h-full object-contain rounded-2xl"
            style={{ filter, transform: `rotate(${adjustments.rotation}deg)` }}
            referrerPolicy="no-referrer"
          />
        </div>

        <aside className="p-5 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-2xl">
            {[
              { id: 'basic', label: 'Basic', icon: Crop },
              { id: 'advanced', label: 'Advanced', icon: Wand2 },
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

          <div className="space-y-5">
            {controls.map(key => (
              <label key={key} className="block">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{labelFor(key)}</span>
                  <span className="text-[10px] font-bold text-white/30">{String(adjustments[key])}</span>
                </div>
                {key === 'cropAspect' ? null : (
                  <input
                    type="range"
                    min={key === 'rotation' ? -45 : -100}
                    max={key === 'rotation' ? 45 : 100}
                    value={Number(adjustments[key])}
                    onChange={e => update(key, Number(e.target.value))}
                    className="w-full accent-small-orange"
                  />
                )}
              </label>
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
};

export default PhotoEditPanel;
