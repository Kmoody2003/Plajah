import { useCallback, useEffect, useRef, useState } from 'react';

type Position = { x: number; y: number };
type Saved = Position & { pinned: boolean };

/** Shared platform behavior for assistant orbs and other persistent floating controls. */
export function usePersistentFloating(storageKey: string, fallback: () => Position) {
  const read = (): Saved => {
    try { const value = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) return value; } catch {}
    return { ...fallback(), pinned: false };
  };
  const initial = useRef<Saved | null>(null); if (!initial.current) initial.current = read();
  const [pos, setPos] = useState<Position>({ x: initial.current.x, y: initial.current.y });
  const [pinned, setPinned] = useState(initial.current.pinned);
  const state = useRef({ pos, pinned }); state.current = { pos, pinned };
  const persist = useCallback((nextPos = state.current.pos, nextPinned = state.current.pinned) => {
    try { localStorage.setItem(storageKey, JSON.stringify({ ...nextPos, pinned: nextPinned })); } catch {}
  }, [storageKey]);
  const clamp = useCallback((v: Position) => ({ x: Math.max(8, Math.min(window.innerWidth - 56, v.x)), y: Math.max(8, Math.min(window.innerHeight - 56, v.y)) }), []);
  useEffect(() => { const resize = () => setPos((v) => { const n = clamp(v); persist(n); return n; }); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, [clamp, persist]);
  const dragProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if (state.current.pinned || e.button !== 0) return;
      const origin = { x: e.clientX, y: e.clientY, pos: state.current.pos }; let moved = false;
      const move = (ev: PointerEvent) => { moved ||= Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) > 4; if (moved) setPos(clamp({ x: origin.pos.x + ev.clientX - origin.x, y: origin.pos.y + ev.clientY - origin.y })); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); persist(); if (moved) window.setTimeout(() => window.dispatchEvent(new CustomEvent('plajah:floating-drag-ended')), 0); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    },
  };
  const togglePinned = () => setPinned((v) => { persist(state.current.pos, !v); return !v; });
  return { pos, pinned, togglePinned, dragProps };
}
