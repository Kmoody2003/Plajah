// components/Fabula/anima/AnimaLayersPanel.tsx — add, select, rename, reorder, hide, lock.
// Top of the list is the front of the picture.

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Image as ImageIcon, Lock, PenTool, Plus, Sparkles, Trash2, Unlock, UserRound, Video } from 'lucide-react';
import type { AnimaLayer } from '../../../services/anima/types';
import type { AnimaAction } from '../../../services/anima/document';
import { EFFECT_CHOICES, RIG_CHOICES, makeCameraLayer, makeCharacterLayer, makeDrawingLayer, makeEffectLayer, makePlateLayer, newAnimaId } from '../../../services/anima/templates';
import { iconBtn, lbl } from './ui';

const TYPE_ICON: Partial<Record<AnimaLayer['type'], React.ReactNode>> = {
  cel: <PenTool size={13} />,
  stop_motion: <PenTool size={13} />,
  character: <UserRound size={13} />,
  plate: <ImageIcon size={13} />,
  effect: <Sparkles size={13} />,
  camera: <Video size={13} />,
};

export const AnimaLayersPanel: React.FC<{
  layers: AnimaLayer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  dispatch: (a: AnimaAction, coalesceKey?: string) => void;
}> = ({ layers, selectedId, onSelect, dispatch }) => {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const add = (layer: AnimaLayer) => {
    // Plates are backgrounds: they go to the back. Everything else lands above the selection.
    const index = layer.type === 'plate' ? layers.length : selectedId ? Math.max(0, layers.findIndex((l) => l.id === selectedId)) : 0;
    dispatch({ type: 'addLayer', layer, index });
    onSelect(layer.id);
    setAdding(false);
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between px-3 h-10 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className={lbl}>Layers</span>
        <button className={iconBtn} title="Add layer" aria-label="Add layer" onClick={() => setAdding((v) => !v)}>
          <Plus size={15} />
        </button>
      </div>

      {adding && (
        <div className="p-2 flex flex-col gap-1 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
          <button className="text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.06] text-[12px] text-white/85 flex items-center gap-2" onClick={() => add(makeDrawingLayer(`Drawing ${layers.filter((l) => l.type === 'cel').length + 1}`))}>
            <PenTool size={13} className="text-[#00DAF3]" /> Drawing
          </button>
          <button className="text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.06] text-[12px] text-white/85 flex items-center gap-2" onClick={() => add(makePlateLayer())}>
            <ImageIcon size={13} className="text-[#00DAF3]" /> Image or video plate
          </button>
          {!layers.some((l) => l.type === 'camera') && (
            <button className="text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.06] text-[12px] text-white/85 flex items-center gap-2" onClick={() => add(makeCameraLayer())}>
              <Video size={13} className="text-[#ffd166]" /> Camera
            </button>
          )}
          <div className="px-2 pt-1 text-[10px] text-white/40">Character</div>
          <div className="grid grid-cols-2 gap-1">
            {RIG_CHOICES.map((r) => (
              <button key={r.id} className="text-left px-2 py-1 rounded-md hover:bg-white/[0.06] text-[11px] text-white/75 truncate" onClick={() => add(makeCharacterLayer(r.id))}>
                {r.name}
              </button>
            ))}
          </div>
          <div className="px-2 pt-1 text-[10px] text-white/40">Effect</div>
          <div className="grid grid-cols-2 gap-1">
            {EFFECT_CHOICES.map((e) => (
              <button key={e.kind} className="text-left px-2 py-1 rounded-md hover:bg-white/[0.06] text-[11px] text-white/75 truncate" onClick={() => add(makeEffectLayer(e.kind))}>
                {e.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-1">
        {layers.length === 0 && <div className="px-3 py-4 text-[12px] text-white/40">No layers yet. Add one with +.</div>}
        {layers.map((l, i) => {
          const sel = l.id === selectedId;
          return (
            <div
              key={l.id}
              onClick={() => onSelect(l.id)}
              className="group mx-1.5 my-0.5 px-2 h-9 rounded-[9px] flex items-center gap-1.5 cursor-pointer"
              style={{
                background: sel ? 'rgba(212,0,85,0.16)' : 'transparent',
                border: `1px solid ${sel ? 'rgba(212,0,85,0.5)' : 'transparent'}`,
                opacity: l.visible ? 1 : 0.5,
              }}
            >
              <span className={sel ? 'text-[#ff7fb0]' : 'text-white/45'}>{TYPE_ICON[l.type] ?? <PenTool size={13} />}</span>
              {renaming === l.id ? (
                <input
                  autoFocus
                  defaultValue={l.name}
                  className="flex-1 min-w-0 h-7 px-1.5 rounded-md bg-white/[0.08] text-[12px] text-white outline-none"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    if (name && name !== l.name) dispatch({ type: 'updateLayer', id: l.id, patch: { name } });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className="flex-1 min-w-0 truncate text-[12px] text-white/90" onDoubleClick={() => setRenaming(l.id)} title="Double-click to rename">
                  {l.name}
                </span>
              )}
              <div className="items-center hidden group-hover:flex" onClick={(e) => e.stopPropagation()}>
                <button className="grid place-items-center w-6 h-6 rounded text-white/50 hover:text-white disabled:opacity-20" disabled={i === 0} title="Bring forward" aria-label="Bring forward" onClick={() => dispatch({ type: 'moveLayer', id: l.id, toIndex: i - 1 })}>
                  <ChevronUp size={13} />
                </button>
                <button className="grid place-items-center w-6 h-6 rounded text-white/50 hover:text-white disabled:opacity-20" disabled={i === layers.length - 1} title="Send backward" aria-label="Send backward" onClick={() => dispatch({ type: 'moveLayer', id: l.id, toIndex: i + 1 })}>
                  <ChevronDown size={13} />
                </button>
                <button className="grid place-items-center w-6 h-6 rounded text-white/50 hover:text-white" title="Duplicate" aria-label="Duplicate layer" onClick={() => {
                  const newId = newAnimaId('layer');
                  dispatch({ type: 'duplicateLayer', id: l.id, newId });
                  onSelect(newId);
                }}>
                  <Copy size={12} />
                </button>
                <button className="grid place-items-center w-6 h-6 rounded text-white/50 hover:text-red-300" title="Delete layer" aria-label="Delete layer" onClick={() => {
                  dispatch({ type: 'removeLayer', id: l.id });
                  if (sel) onSelect(layers[i + 1]?.id ?? layers[i - 1]?.id ?? null);
                }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <button className="grid place-items-center w-6 h-6 rounded text-white/50 hover:text-white" title={l.locked ? 'Unlock' : 'Lock'} aria-label={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'updateLayer', id: l.id, patch: { locked: !l.locked } });
              }}>
                {l.locked ? <Lock size={12} className="text-amber-300" /> : <Unlock size={12} />}
              </button>
              <button className="grid place-items-center w-6 h-6 rounded text-white/50 hover:text-white" title={l.visible ? 'Hide' : 'Show'} aria-label={l.visible ? 'Hide layer' : 'Show layer'} onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'updateLayer', id: l.id, patch: { visible: !l.visible } });
              }}>
                {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
