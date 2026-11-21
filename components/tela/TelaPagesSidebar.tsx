import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import type { TelaDevice, TelaFrame } from '../../types';
import { getPresetMeta } from './telaOps';

interface TelaPagesSidebarProps {
  frames: TelaFrame[];
  devices: Record<string, TelaDevice>;
  activeFrameId: string | null;
  onSelectFrame: (frameId: string) => void;
  onReorderFrame: (frameId: string, toIndex: number) => void;
  onDeleteFrame: (frameId: string) => void;
  onAddComicPage: () => void;
  onAddWriterPage: () => void;
  onAddGridSheet: () => void;
  onAddVectorArtboard: () => void;
  onAddImageCanvas: () => void;
  onContextMenuPage?: (event: React.MouseEvent, frame: TelaFrame, index: number) => void;
}

export const TelaPagesSidebar: React.FC<TelaPagesSidebarProps> = ({
  frames,
  devices,
  activeFrameId,
  onSelectFrame,
  onReorderFrame,
  onDeleteFrame,
  onAddComicPage,
  onAddWriterPage,
  onAddGridSheet,
  onAddVectorArtboard,
  onAddImageCanvas,
  onContextMenuPage,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    frameId: string;
    fromIndex: number;
    targetIndex: number;
  } | null>(null);
  const dragRef = useRef<{
    frameId: string;
    fromIndex: number;
    startX: number;
    startY: number;
    active: boolean;
    targetIndex: number;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const computeTargetIndex = (clientY: number, fromIndex: number): number => {
    const container = listRef.current;
    if (!container) return fromIndex;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-page-row-idx]'));
    if (!rows.length) return fromIndex;
    let best = fromIndex;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        best = i;
        break;
      }
      best = i;
    }
    return Math.max(0, Math.min(frames.length - 1, best));
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
        d.active = true;
      }
      const nextIdx = computeTargetIndex(e.clientY, d.fromIndex);
      d.targetIndex = nextIdx;
      setDragState({ frameId: d.frameId, fromIndex: d.fromIndex, targetIndex: nextIdx });
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      setDragState(null);
      if (d.active) {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 60);
        if (d.targetIndex !== d.fromIndex) {
          onReorderFrame(d.frameId, d.targetIndex);
        }
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [frames.length, onReorderFrame]);

  const startPointerDrag = (e: React.PointerEvent, frameId: string, index: number, immediate = false) => {
    if (e.button === 2 || frames.length < 2) return;
    if (immediate) e.stopPropagation();
    dragRef.current = {
      frameId,
      fromIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      active: immediate,
      targetIndex: index,
    };
    if (immediate) {
      setDragState({ frameId, fromIndex: index, targetIndex: index });
    }
  };

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2 select-none" data-testid="pages-sidebar">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-white/45">
          Pages ({frames.length})
        </span>
        <button
          type="button"
          onClick={onAddWriterPage}
          className="text-[.64rem] font-bold text-[var(--pj-magenta,#D40055)] hover:underline flex items-center gap-0.5"
        >
          <Plus size={12} /> Add Page
        </button>
      </div>
      {frames.length > 1 && (
        <div className="text-[9.5px] text-white/35 -mt-1 mb-0.5">
          Drag grip (mouse/touch) or right-click to reorder
        </div>
      )}

      {frames.map((frame, index) => {
        const active = frame.id === activeFrameId;
        const frameDev = frame.deviceIds.map(id => devices[id]).find(Boolean);
        const devType = frame.isComicPage ? 'COMIC' : frameDev?.type || 'PAGE';
        const presetLabel = getPresetMeta(frame.preset, frame).label;
        const isDragging = dragState?.frameId === frame.id;
        const isDropTargetBefore =
          dragState && dragState.targetIndex === index && dragState.fromIndex > index;
        const isDropTargetAfter =
          dragState && dragState.targetIndex === index && dragState.fromIndex < index;

        return (
          <React.Fragment key={frame.id}>
            {isDropTargetBefore && (
              <div className="h-1 rounded-full bg-[#00DAF3] shadow-[0_0_8px_#00DAF3] my-0.5" />
            )}
            <div
              data-page-row-idx={index}
              data-testid={`page-sidebar-item-${frame.id}`}
              onPointerDown={e => startPointerDrag(e, frame.id, index, false)}
              onClick={() => {
                if (suppressClickRef.current) return;
                onSelectFrame(frame.id);
              }}
              onContextMenu={e => {
                if (!onContextMenuPage) return;
                e.preventDefault();
                e.stopPropagation();
                onContextMenuPage(e, frame, index);
              }}
              className={`group p-2 rounded-[10px] border cursor-pointer transition-all flex items-center justify-between gap-1.5 ${
                isDragging
                  ? 'opacity-70 scale-[1.01] border-[#00DAF3] bg-[#00DAF3]/10 shadow-lg'
                  : active
                  ? 'bg-white/[0.08] border-[var(--pj-magenta,#D40055)] text-white shadow-sm'
                  : 'bg-white/[0.02] border-white/[0.08] text-white/70 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {frames.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Drag to reorder ${frame.label || `Page ${index + 1}`}`}
                    onPointerDown={e => startPointerDrag(e, frame.id, index, true)}
                    onClick={e => e.stopPropagation()}
                    style={{ touchAction: 'none' }}
                    className="p-0.5 rounded text-white/30 hover:text-white/80 cursor-grab active:cursor-grabbing shrink-0"
                    title="Drag up or down to reorder page"
                  >
                    <GripVertical size={13} />
                  </button>
                )}
                <span
                  className={`w-5 h-5 rounded-full text-[9px] font-extrabold grid place-items-center shrink-0 ${
                    active ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'bg-white/10 text-white/60'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[.72rem] font-bold truncate flex items-center gap-1">
                    {frame.isComicPage && <BookOpen size={11} className="text-[#D0BCFF] shrink-0" />}
                    <span className="truncate">{frame.label || `Page ${index + 1}`}</span>
                  </div>
                  <div className="text-[.58rem] text-white/40 truncate">
                    {devType} · {presetLabel}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {frames.length > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={e => {
                        e.stopPropagation();
                        onReorderFrame(frame.id, index - 1);
                      }}
                      className="p-1 rounded-[5px] hover:bg-white/10 text-white/30 hover:text-white disabled:opacity-15"
                      title="Move page up"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      disabled={index === frames.length - 1}
                      onClick={e => {
                        e.stopPropagation();
                        onReorderFrame(frame.id, index + 1);
                      }}
                      className="p-1 rounded-[5px] hover:bg-white/10 text-white/30 hover:text-white disabled:opacity-15"
                      title="Move page down"
                    >
                      <ArrowDown size={11} />
                    </button>
                  </>
                )}
                {frames.length > 1 && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteFrame(frame.id);
                    }}
                    className="p-1 rounded-[6px] hover:bg-red-500/20 text-white/35 hover:text-red-400 transition-colors"
                    title="Delete page"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
            {isDropTargetAfter && (
              <div className="h-1 rounded-full bg-[#00DAF3] shadow-[0_0_8px_#00DAF3] my-0.5" />
            )}
          </React.Fragment>
        );
      })}

      <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-white/[0.08]">
        <button
          type="button"
          onClick={onAddWriterPage}
          className="h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors"
        >
          ＋ Writer
        </button>
        <button
          type="button"
          onClick={onAddComicPage}
          className="h-8 rounded-[8px] text-[.66rem] font-bold text-[#D0BCFF] bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 transition-colors flex items-center justify-center gap-1"
        >
          <BookOpen size={11} /> ＋ Comic
        </button>
        <button
          type="button"
          onClick={onAddGridSheet}
          className="h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors"
        >
          ＋ Grid
        </button>
        <button
          type="button"
          onClick={onAddVectorArtboard}
          className="h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors"
        >
          ＋ Vector
        </button>
        <button
          type="button"
          onClick={onAddImageCanvas}
          className="col-span-2 h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors"
        >
          ＋ Image Canvas
        </button>
      </div>
    </div>
  );
};
