// DraggablePanel — a panel that either docks into the Inspector or floats.
//
// It floated only, once, and six of them overlapped the canvas you were trying
// to judge while each remembered its own position, so no two sessions looked
// alike. It now DOCKS by default: when the Inspector is open it portals its
// children into the rail instead, which turns six floating windows into six
// sections of one column — and does it without a single call site changing,
// because every panel in Pixels already goes through here.
//
// Floating is still available (close the Inspector) for anyone who wants a
// window over the canvas on a second monitor. Position + pin state persist
// per-id, as before.

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pin, PinOff, GripHorizontal, ChevronDown } from 'lucide-react';
import { useDock } from '../ui/shell';

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
  const [collapsed, setCollapsed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dock = useDock();

  /**
   * Where this panel may sit, in its own coordinate space.
   *
   * These panels are `fixed`, but an ancestor establishes a containing block,
   * so `left: 0` is not the left of the window — it is the left of that box.
   * `offsetParent` is null for fixed elements and cannot tell us where the box
   * is, so measure it: the difference between the position we asked for and the
   * position we got is exactly the container's offset.
   */
  const limits = useCallback(() => {
    const el = rootRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const offX = r.left - posRef.current.x;
    const offY = r.top - posRef.current.y;
    const w = el.offsetWidth || 320;
    return {
      minX: -offX,
      maxX: window.innerWidth - offX - w,
      minY: -offY,
      // Keep the drag handle reachable rather than the whole panel on screen —
      // a tall panel would otherwise be pinned to the top edge.
      maxY: window.innerHeight - offY - 40,
    };
  }, []);

  /* A saved position outlives the layout that produced it, so clamp on mount
     as well as on resize — otherwise one bad drag hides a panel permanently. */
  useLayoutEffect(() => {
    if (dock.docking && dock.el) return;
    const clamp = () => {
      const L = limits();
      if (!L) return;
      setPos(p => {
        const x = Math.max(L.minX, Math.min(L.maxX, p.x));
        const y = Math.max(L.minY, Math.min(L.maxY, p.y));
        return x === p.x && y === p.y ? p : { x, y };
      });
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [limits, dock.docking, dock.el]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (pinned) return;
    e.preventDefault();
    dragRef.current = { ox: e.clientX - posRef.current.x, oy: e.clientY - posRef.current.y };
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const L = limits();
      let x = ev.clientX - dragRef.current.ox;
      let y = ev.clientY - dragRef.current.oy;
      if (L) {
        x = Math.max(L.minX, Math.min(L.maxX, x));
        y = Math.max(L.minY, Math.min(L.maxY, y));
      }
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
  }, [id, pinned, limits]);

  const togglePin = useCallback(() => {
    setPinned(p => { const np = !p; saveEntry(id, posRef.current.x, posRef.current.y, np); return np; });
  }, [id]);

  /* ── Docked: a section of the Inspector column ── */
  if (dock.docking && dock.el) {
    return createPortal(
      <section className="border-b border-white/[0.08]">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <button
            onClick={() => setCollapsed(c => !c)}
            aria-expanded={!collapsed}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            <ChevronDown
              className="w-3 h-3 text-white/30 transition-transform shrink-0"
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
            />
            <span className="type-label-sm uppercase tracking-[0.14em] text-white/45 truncate">{label}</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Hide"
              aria-label={`Hide ${label ?? 'panel'}`}
              className="w-5 h-5 grid place-content-center rounded-control text-white/30 hover:text-white transition-colors"
            >
              <span className="text-xs leading-none">×</span>
            </button>
          )}
        </div>
        {!collapsed && <div className="pb-1">{children}</div>}
      </section>,
      dock.el,
    );
  }

  /* ── Floating: the original behaviour, kept for a second screen ── */
  return (
    <div ref={rootRef} className={`fixed ${className}`} style={{ left: pos.x, top: pos.y, zIndex }}>
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        className="flex items-center justify-between gap-2 px-2.5 py-1.5 select-none bg-black/50 backdrop-blur-xl border border-white/10 border-b-0 rounded-t-sheet"
        style={{ cursor: pinned ? 'default' : 'move', touchAction: 'none' }}
      >
        <span className="flex items-center gap-1.5 type-label-sm uppercase tracking-[0.14em] text-white/40">
          <GripHorizontal className="w-3 h-3" /> {label}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePin}
            title={pinned ? 'Unpin (allow dragging)' : 'Pin in place'}
            aria-pressed={pinned}
            className="w-5 h-5 grid place-content-center rounded-control transition-colors"
            style={{ color: pinned ? 'var(--pj-orange)' : 'rgba(255,255,255,0.4)' }}
          >
            {pinned ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Hide"
              aria-label={`Hide ${label ?? 'panel'}`}
              className="w-5 h-5 grid place-content-center rounded-control text-white/40 hover:text-white transition-colors"
            >
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
