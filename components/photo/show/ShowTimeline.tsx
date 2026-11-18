// The Themed Show timeline: every shot in order, freely editable.
//
//   select   click · Ctrl/⌘-click toggles · Shift-click a range · drag a box over empty space
//   move     drag a shot (or the whole selection) to a new place · Alt+← / Alt+→ nudges
//   edit     Ctrl/⌘ D duplicate · C copy · X cut · V paste after · A all · Delete removes
//   menu     right-click (or long-press / ⋯) — the platform command menu
//
// Order changes come back as a full id list; the studio owns the photos.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Crop, Maximize2, Pencil, RotateCw, Scissors, Trash2, Type, ArrowLeftRight, CopyPlus, ClipboardPaste, MoreHorizontal } from 'lucide-react';
import { useContextMenu, IconButton } from '../../ui';
import type { MenuNode } from '../../ui';
import type { ShowPhoto } from '../../../services/slideshow/types';
import { isFullFrame } from '../../../services/slideshow/common';
import { shownCaption } from '../../../services/slideshow/fileNames';

export interface TimelineOps {
  reorder(ids: string[]): void;
  remove(ids: string[]): void;
  duplicate(ids: string[]): void;
  copy(ids: string[]): void;
  cut(ids: string[]): void;
  paste(afterId: string | null): void;
  swap(a: string, b: string): void;
  edit(id: string): void;
  crop(id: string): void;
  rotate(id: string): void;
  toggleFull(id: string): void;
  toggleCaption(id: string): void;
  canPaste: boolean;
}

interface Props {
  photos: ShowPhoto[];
  /** Seconds each photo is full page (same order as photos). */
  seconds: number[];
  selection: string[];
  onSelection: (ids: string[], focus: string | null) => void;
  ops: TimelineOps;
  /** Event labels / roles from the director, when it is on. */
  director?: boolean;
}

const THUMB = 84, GAP = 8;

export default function ShowTimeline({ photos, seconds, selection, onSelection, ops, director }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ ids: string[]; x: number; y: number; insert: number } | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const sel = new Set(selection);
  const ids = photos.map((p) => p.id);

  // --- selection -----------------------------------------------------------------------
  const click = (e: React.MouseEvent | React.PointerEvent, id: string) => {
    if (e.shiftKey && anchor) {
      const a = ids.indexOf(anchor), b = ids.indexOf(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const range = ids.slice(lo, hi + 1);
      onSelection(e.ctrlKey || e.metaKey ? [...new Set([...selection, ...range])] : range, id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      onSelection(sel.has(id) ? selection.filter((x) => x !== id) : [...selection, id], id);
    } else {
      onSelection([id], id);
    }
    setAnchor(id);
  };

  // --- context menu (platform primitive) --------------------------------------------------
  const menu = useContextMenu<string>((id) => {
    const many = sel.has(id) && selection.length > 1 ? selection : [id];
    const p = photos.find((q) => q.id === id)!;
    const nodes: MenuNode<string>[] = [
      { kind: 'header', label: many.length > 1 ? `${many.length} shots` : `Shot ${ids.indexOf(id) + 1}` } as any,
    ];
    if (many.length === 1) {
      nodes.push(
        { id: 'edit', label: 'Edit photo…', icon: <Pencil size={14} />, onSelect: () => ops.edit(id) },
        { id: 'crop', label: 'Crop & scale…', icon: <Crop size={14} />, onSelect: () => ops.crop(id) },
        { id: 'rotate', label: 'Rotate 90°', icon: <RotateCw size={14} />, onSelect: () => ops.rotate(id) },
        { id: 'full', label: 'Full screen (no print)', icon: <Maximize2 size={14} />, checked: isFullFrame(p), onSelect: () => ops.toggleFull(id) },
      );
      if (p.caption?.trim()) nodes.push({ id: 'cap', label: 'Show description', icon: <Type size={14} />, checked: !!p.showCaption, onSelect: () => ops.toggleCaption(id) });
      nodes.push({ kind: 'separator' } as any);
    }
    if (many.length === 2) nodes.push({ id: 'swap', label: 'Swap these two', icon: <ArrowLeftRight size={14} />, onSelect: () => ops.swap(many[0], many[1]) });
    nodes.push(
      { id: 'dup', label: many.length > 1 ? `Duplicate ${many.length}` : 'Duplicate', icon: <CopyPlus size={14} />, shortcut: 'Ctrl D', onSelect: () => ops.duplicate(many) },
      { id: 'copy', label: 'Copy', icon: <Copy size={14} />, shortcut: 'Ctrl C', onSelect: () => ops.copy(many) },
      { id: 'cut', label: 'Cut', icon: <Scissors size={14} />, shortcut: 'Ctrl X', onSelect: () => ops.cut(many) },
      { id: 'paste', label: 'Paste after', icon: <ClipboardPaste size={14} />, shortcut: 'Ctrl V', disabled: !ops.canPaste, onSelect: () => ops.paste(id) },
      { kind: 'separator' } as any,
      { id: 'remove', label: many.length > 1 ? `Remove ${many.length} from show` : 'Remove from show', icon: <Trash2 size={14} />, danger: true, shortcut: 'Del', onSelect: () => ops.remove(many) },
    );
    return nodes;
  });

  // --- keyboard ------------------------------------------------------------------------
  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'a') { e.preventDefault(); onSelection(ids, ids[ids.length - 1] || null); return; }
    if (!selection.length) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); ops.remove(selection); }
    else if (mod && k === 'd') { e.preventDefault(); ops.duplicate(selection); }
    else if (mod && k === 'c') { e.preventDefault(); ops.copy(selection); }
    else if (mod && k === 'x') { e.preventDefault(); ops.cut(selection); }
    else if (mod && k === 'v') { e.preventDefault(); ops.paste(selection[selection.length - 1]); }
    else if (e.altKey && (k === 'arrowleft' || k === 'arrowright')) {
      e.preventDefault();
      const dir = k === 'arrowleft' ? -1 : 1;
      const order = [...ids];
      const idxs = selection.map((s) => order.indexOf(s)).sort((a, b) => (dir < 0 ? a - b : b - a));
      for (const i of idxs) {
        const j = i + dir;
        if (j < 0 || j >= order.length || sel.has(order[j])) continue;
        [order[i], order[j]] = [order[j], order[i]];
      }
      ops.reorder(order);
    } else if (!mod && (k === 'arrowleft' || k === 'arrowright')) {
      e.preventDefault();
      const cur = ids.indexOf(selection[selection.length - 1]);
      const next = ids[Math.max(0, Math.min(ids.length - 1, cur + (k === 'arrowleft' ? -1 : 1)))];
      if (next) { onSelection(e.shiftKey ? [...new Set([...selection, next])] : [next], next); setAnchor(next); }
    }
  };

  // --- drag to move / drag a box to select -----------------------------------------------
  const insertAt = useCallback((clientX: number) => {
    const row = rowRef.current;
    if (!row) return 0;
    const items = [...row.querySelectorAll<HTMLElement>('[data-shot]')];
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return items.length;
  }, []);

  const startPointer = (e: React.PointerEvent, id: string | null) => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    const row = rowRef.current!;
    const rb = row.getBoundingClientRect();
    let moved = false;
    const moving = id ? (sel.has(id) ? ids.filter((x) => sel.has(x)) : [id]) : null;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      if (moving) {
        setDrag({ ids: moving, x: ev.clientX, y: ev.clientY, insert: insertAt(ev.clientX) });
        // auto-scroll near the edges
        if (ev.clientX < rb.left + 40) row.scrollLeft -= 18; else if (ev.clientX > rb.right - 40) row.scrollLeft += 18;
      } else {
        const b = { x0: Math.min(sx, ev.clientX), y0: Math.min(sy, ev.clientY), x1: Math.max(sx, ev.clientX), y1: Math.max(sy, ev.clientY) };
        setBox(b);
        const hit = [...row.querySelectorAll<HTMLElement>('[data-shot]')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > b.x0 && r.left < b.x1 && r.bottom > b.y0 && r.top < b.y1;
        }).map((el) => el.dataset.shot!);
        onSelection(ev.ctrlKey || ev.metaKey ? [...new Set([...selection, ...hit])] : hit, hit[hit.length - 1] || null);
      }
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moving && moved) {
        const at = insertAt(ev.clientX);
        const rest = ids.filter((x) => !moving.includes(x));
        const before = ids.slice(0, at).filter((x) => !moving.includes(x)).length;
        ops.reorder([...rest.slice(0, before), ...moving, ...rest.slice(before)]);
      } else if (!moving && !moved) {
        onSelection([], null);
      }
      setDrag(null);
      setBox(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    // keep the focused shot in view
    const last = selection[selection.length - 1];
    const el = last ? rowRef.current?.querySelector<HTMLElement>(`[data-shot="${CSS.escape(last)}"]`) : null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selection]);

  return (
    <div className="relative">
      <div ref={rowRef} tabIndex={0} onKeyDown={onKey} aria-label="Show timeline: shots in order" role="listbox" aria-multiselectable
        onPointerDown={(e) => { if (e.target === e.currentTarget) startPointer(e, null); }}
        className="relative flex items-end overflow-x-auto pb-2 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--pj-orange)] rounded-control select-none"
        style={{ gap: GAP, minHeight: THUMB + 34 }}>
        {photos.map((p, i) => {
          const newEvent = director && !!p.event && p.event !== photos[i - 1]?.event;
          const on = sel.has(p.id);
          const dragging = drag?.ids.includes(p.id);
          return (
            <React.Fragment key={p.id}>
              {drag && drag.insert === i && <div className="shrink-0 self-stretch w-1 rounded-full bg-[var(--pj-orange)]" aria-hidden />}
              {newEvent && i > 0 && !drag && <div className="shrink-0 self-stretch w-px bg-[var(--pj-orange)]/40" aria-hidden />}
              <div data-shot={p.id} role="option" aria-selected={on} className={`shrink-0 flex flex-col gap-1 group ${dragging ? 'opacity-40' : ''}`} style={{ width: THUMB }}>
                <div className="h-[14px] text-[10px] leading-[14px] truncate" style={{ color: 'var(--on-surface-variant)' }}>
                  {newEvent && p.eventLabel ? p.eventLabel : `${i + 1}`}
                </div>
                <div className="relative" {...menu.bind(p.id)}
                  onPointerDown={(e) => { menu.bind(p.id).onPointerDown(e); e.stopPropagation(); if (!sel.has(p.id) || e.ctrlKey || e.metaKey || e.shiftKey) click(e, p.id); else setAnchor(p.id); startPointer(e, p.id); }}>
                  <div className={`relative overflow-hidden rounded-[var(--pj-radius-sm)] transition-shadow ${on ? 'ring-2 ring-[var(--pj-orange)] shadow-[var(--pj-glow-orange)]' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
                    style={{ width: THUMB, height: THUMB }} title={shownCaption(p) || p.context?.caption || `Shot ${i + 1}`}>
                    <img src={p.src} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" style={{ transform: `rotate(${(p.quarterTurns || 0) * 90}deg)` }} />
                    {director && p.role && p.role !== 'moment' && <span className="absolute top-1 left-1 pj-eyebrow !text-[8px] px-1 rounded bg-black/65">{p.role}</span>}
                    <div className="absolute top-1 right-1 flex gap-0.5">
                      {p.showCaption && p.caption && <span className="p-0.5 rounded bg-[var(--pj-orange)] text-black" title={p.caption}><Type size={9} /></span>}
                      {p.look && (p.look.lut || (p.look.lens && p.look.lens !== 'none')) && <span className="w-3 h-3 rounded-full ring-1 ring-black/40" style={{ background: 'var(--pj-grad-spatial)' }} title="Has its own look" />}
                    </div>
                    {isFullFrame(p) && <span className="absolute bottom-5 left-1 text-[8px] font-bold uppercase tracking-wider px-1 rounded bg-[var(--pj-cyan)] text-black" title="Shown whole, full screen">Full</span>}
                    {p.trim && !p.keepFraming && <span className="absolute bottom-5 right-1 p-0.5 rounded bg-black/70" title={p.trimReason === 'screenshot' ? 'Screenshot cropped to the photo' : p.trimReason === 'manual' ? 'Your crop' : 'Borders trimmed'}><Crop size={9} /></span>}
                    <span className="absolute bottom-0 inset-x-0 text-[10px] text-center bg-black/60 font-mono tabular-nums">{seconds[i]?.toFixed(1)}s</span>
                    {/* hover actions */}
                    <div className="absolute inset-x-0 top-0 flex justify-center gap-1 pt-6 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <IconButton size="xs" variant="secondary" aria-label="Edit photo" title="Edit photo" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ops.edit(p.id); }}><Pencil /></IconButton>
                      <IconButton size="xs" variant="secondary" aria-label="Crop and scale" title="Crop and scale" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ops.crop(p.id); }}><Crop /></IconButton>
                      <IconButton size="xs" variant="danger-quiet" aria-label="Remove from show" title="Remove from show" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ops.remove(sel.has(p.id) && selection.length > 1 ? selection : [p.id]); }}><Trash2 /></IconButton>
                      <IconButton size="xs" variant="secondary" aria-label="More" title="More" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); menu.openFrom(e.currentTarget, p.id); }}><MoreHorizontal /></IconButton>
                    </div>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        {drag && drag.insert === photos.length && <div className="shrink-0 self-stretch w-1 rounded-full bg-[var(--pj-orange)]" aria-hidden />}
        <div className="shrink-0 w-6" aria-hidden />
      </div>
      {box && <div className="fixed pointer-events-none z-[400] border border-[var(--pj-orange)] bg-[var(--pj-orange-soft)] rounded-sm" style={{ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 }} />}
      {drag && (() => {
        const first = photos.find((p) => p.id === drag.ids[0]);
        return first ? (
          <div className="fixed pointer-events-none z-[400]" style={{ left: drag.x - 30, top: drag.y - 30 }}>
            <img src={first.src} alt="" className="w-16 h-16 object-cover rounded-[var(--pj-radius-sm)] ring-2 ring-[var(--pj-orange)] shadow-[var(--pj-elev-4)]" />
            {drag.ids.length > 1 && <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-[var(--pj-orange)] text-black text-[11px] font-bold flex items-center justify-center">{drag.ids.length}</span>}
          </div>
        ) : null;
      })()}
      {menu.node}
    </div>
  );
}
