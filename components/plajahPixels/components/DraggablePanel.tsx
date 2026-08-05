// DraggablePanel — a floating panel you can drag anywhere and pin in place.
// Position + pin state persist per-id to localStorage so a user's preferred
// Plajah Pixels layout is remembered across sessions.

import React, { useCallback, useRef, useState } from 'react';
import { Pin, PinOff, GripHorizontal } from 'lucide-react';

const LS_KEY = 'plajah-pixels-layout-v1';
type Saved = Record<string, { x: number; y: number; pinned: boolean }>;

function loadLayout(): Saved {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveEntry(id: string, x: number, y: number, pinned: boolean) {
  try {
    const l = loadLayout();
    l[id] = { x, y, pinned };
    localStorage.setItem(LS_KEY, JSON.stringify(l));
  } catch { /* storage unavailable — fall back to in-memory only */ }
}

interface DraggablePanelProps {
  id: string;
  /** Default top-left in px (used until the user moves it). */
  defaultPos: { x: number; y: number };
  className?: string;
  zIndex?: number;
  label?: string;            // shown in the drag handle
  onClose?: () => void;      // optional close button in the handle
  children: React.ReactNode;
}

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
  id, defaultPos, className = '', zIndex = 30, label, onClose, children,
}) => {
  const saved = loadLayout()[id];
  const [pos, setPos] = useState<{ x: number; y: number }>(saved ? { x: saved.x, y: saved.y } : defaultPos);
  const [pinned, setPinned] = useState<boolean>(saved?.pinned ?? false);
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (pinned) return;
    e.preventDefault();
    dragRef.current = { ox: e.clientX - posRef.current.x, oy: e.clientY - posRef.current.y };
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - 48, ev.clientX - dragRef.current.ox));
      const y = Math.max(0, Math.min(window.innerHeight - 32, ev.clientY - dragRef.current.oy));
      setPos({ x, y });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragRef.current = null;
      saveEntry(id, posRef.current.x, posRef.current.y, pinned);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [id, pinned]);

  const togglePin = useCallback(() => {
    setPinned(p => { const np = !p; saveEntry(id, posRef.current.x, posRef.current.y, np); return np; });
  }, [id]);

  return (
    <div className={`fixed ${className}`} style={{ left: pos.x, top: pos.y, zIndex }}>
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        className="flex items-center justify-between gap-2 px-2.5 py-1.5 select-none bg-black/50 backdrop-blur-xl border border-white/10 border-b-0 rounded-t-2xl"
        style={{ cursor: pinned ? 'default' : 'move', touchAction: 'none' }}
      >
        <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/40">
          <GripHorizontal className="w-3 h-3" /> {label}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePin}
            title={pinned ? 'Unpin (allow dragging)' : 'Pin in place'}
            className={`w-5 h-5 flex items-center justify-center rounded-md transition-all ${pinned ? 'text-[#FF8C00]' : 'text-white/40 hover:text-white'}`}
          >
            {pinned ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
          </button>
          {onClose && (
            <button onClick={onClose} title="Hide" className="w-5 h-5 flex items-center justify-center rounded-md text-white/40 hover:text-white transition-all">
              <span className="text-xs leading-none">×</span>
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};

export default DraggablePanel;
