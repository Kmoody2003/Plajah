/**
 * Melos › Board — the inspiration board. Paper tier.
 *
 * Spatial, not a grid: pins carry x/y/rotation and are dragged around a surface,
 * because the arrangement of the references is itself information. Pins can be
 * scoped to one song or belong to the record as a whole.
 */

import React, { useRef, useState } from 'react';
import { Type, Link2, Palette, Trash2, Image as ImageIcon, Filter } from 'lucide-react';
import { useMelos, Label } from './MelosWorkspace';
import { InspirationPin, PinKind, uid } from '../../services/melosService';

const SWATCHES = ['#4A3D5C', '#7A4A2E', '#2F4547', '#5E5544', '#6B0099', '#D40055', '#E9A85C', '#00DAF3'];

const BoardRoom: React.FC = () => {
  const { pins, savePin, editPin, dropPin, songs } = useMelos();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [scope, setScope] = useState<'ALL' | 'RECORD' | string>('ALL');

  const shown = pins.filter(p => {
    if (scope === 'ALL') return true;
    if (scope === 'RECORD') return !p.songId;
    return p.songId === scope;
  });

  const add = (kind: PinKind) => {
    const base: InspirationPin = {
      id: uid('pin'), kind,
      x: 40 + Math.round(Math.random() * 220),
      y: 40 + Math.round(Math.random() * 160),
      w: kind === 'COLOR' ? 120 : 240,
      h: kind === 'COLOR' ? 120 : undefined,
      rotation: (Math.random() * 3 - 1.5),
      songId: scope !== 'ALL' && scope !== 'RECORD' ? scope : undefined,
      createdAt: Date.now(),
    };
    if (kind === 'TEXT') base.text = 'A line that keeps coming back…';
    if (kind === 'COLOR') { base.color = SWATCHES[Math.floor(Math.random() * SWATCHES.length)]; base.title = 'a colour'; }
    if (kind === 'LINK') { base.title = 'Reference'; base.url = ''; }
    savePin(base);
  };

  const onPointerDown = (e: React.PointerEvent, p: InspirationPin) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id: p.id, dx: e.clientX - rect.left - p.x, dy: e.clientY - rect.top - p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.round(e.clientX - rect.left - drag.dx));
    const y = Math.max(0, Math.round(e.clientY - rect.top - drag.dy));
    editPin(drag.id, { x, y });
  };

  const endDrag = () => setDrag(null);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 sm:px-7 py-3 border-b flex-wrap" style={{ borderColor: 'var(--mel-edge)' }}>
        <Label>Board</Label>
        <div className="flex gap-1.5 ml-2">
          {([['TEXT', <Type size={12} key="t" />], ['LINK', <Link2 size={12} key="l" />],
             ['COLOR', <Palette size={12} key="c" />], ['IMAGE', <ImageIcon size={12} key="i" />]] as [PinKind, React.ReactNode][])
            .map(([k, icon]) => (
              <button
                key={k}
                onClick={() => add(k)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9.5px] font-bold uppercase tracking-[0.12em]"
                style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
              >{icon}{k.toLowerCase()}</button>
            ))}
        </div>

        <div className="flex-1" />

        <Filter size={11} style={{ color: 'var(--mel-faint)' }} />
        <select
          value={scope}
          onChange={e => setScope(e.target.value)}
          aria-label="Filter pins"
          className="text-[10.5px] rounded-lg px-2 py-1.5"
          style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
        >
          <option value="ALL" style={{ background: '#111' }}>Everything</option>
          <option value="RECORD" style={{ background: '#111' }}>The record as a whole</option>
          {songs.map(s => <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.title}</option>)}
        </select>
      </div>

      {/* Surface */}
      <div
        ref={surfaceRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="relative flex-1 overflow-auto"
        style={{ minHeight: 420, touchAction: 'none' }}
      >
        {shown.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[13px] m-0 text-center max-w-xs" style={{ color: 'var(--mel-faint)' }}>
              Pin what the record is supposed to feel like. Move things around —
              where they sit is part of it.
            </p>
          </div>
        )}

        {shown.map(p => {
          const song = p.songId ? songs.find(s => s.id === p.songId) : null;
          return (
            <div
              key={p.id}
              className="absolute group"
              style={{
                left: p.x, top: p.y, width: p.w || 240,
                transform: `rotate(${p.rotation || 0}deg)`,
                cursor: drag?.id === p.id ? 'grabbing' : 'grab',
              }}
              onPointerDown={e => onPointerDown(e, p)}
            >
              <div className="melos-sheet p-3 relative">
                <button
                  onClick={() => dropPin(p.id)}
                  aria-label="Remove pin"
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full items-center justify-center hidden group-hover:flex"
                  style={{ background: 'var(--mel-rail)', border: '1px solid var(--mel-edge)', color: 'var(--mel-faint)' }}
                ><Trash2 size={9} /></button>

                {p.kind === 'COLOR' && (
                  <>
                    <div className="rounded-lg mb-2" style={{ height: (p.h || 120) - 46, background: p.color }} />
                    <input
                      value={p.title || ''}
                      onChange={e => editPin(p.id, { title: e.target.value })}
                      onPointerDown={e => e.stopPropagation()}
                      className="w-full bg-transparent border-0 outline-none text-[10.5px]"
                      style={{ color: 'var(--mel-dim)', fontFamily: 'var(--font-mono-tech, monospace)' }}
                    />
                  </>
                )}

                {p.kind === 'TEXT' && (
                  <textarea
                    value={p.text || ''}
                    onChange={e => editPin(p.id, { text: e.target.value })}
                    onPointerDown={e => e.stopPropagation()}
                    rows={3}
                    aria-label="Pinned note"
                    className="w-full bg-transparent border-0 outline-none resize-none melos-hand text-[15px]"
                    style={{ transform: 'none' }}
                  />
                )}

                {p.kind === 'LINK' && (
                  <>
                    <input
                      value={p.title || ''}
                      onChange={e => editPin(p.id, { title: e.target.value })}
                      onPointerDown={e => e.stopPropagation()}
                      placeholder="What is it"
                      className="w-full bg-transparent border-0 outline-none text-[12.5px] font-semibold mb-1"
                      style={{ color: 'var(--mel-ink)' }}
                    />
                    <input
                      value={p.url || ''}
                      onChange={e => editPin(p.id, { url: e.target.value })}
                      onPointerDown={e => e.stopPropagation()}
                      placeholder="https://"
                      className="w-full bg-transparent border-0 outline-none text-[10.5px] truncate"
                      style={{ color: 'var(--mel-accent)' }}
                    />
                  </>
                )}

                {p.kind === 'IMAGE' && (
                  p.url
                    ? <img src={p.url} alt={p.title || 'Pinned image'} className="w-full rounded-lg block" draggable={false} />
                    : (
                      <input
                        value={p.url || ''}
                        onChange={e => editPin(p.id, { url: e.target.value })}
                        onPointerDown={e => e.stopPropagation()}
                        placeholder="Paste an image URL"
                        className="w-full bg-transparent border-0 outline-none text-[10.5px]"
                        style={{ color: 'var(--mel-dim)' }}
                      />
                    )
                )}

                {p.note && <p className="text-[10.5px] mt-1.5 m-0" style={{ color: 'var(--mel-dim)' }}>{p.note}</p>}
                {song && (
                  <p className="text-[8.5px] uppercase tracking-[0.14em] mt-1.5 m-0" style={{ color: 'var(--mel-faint)' }}>
                    {song.title}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BoardRoom;
