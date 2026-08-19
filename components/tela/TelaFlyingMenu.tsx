// TelaFlyingMenu — "author in place" (spec §07). Click an object inside an
// embedded (or canvas) Tela document and a floating contextual popover appears,
// anchored to what you clicked, carrying ONLY the tools that apply to that
// object type. Edits dispatch the same ops as the studio; the flow is
// Unlock (rights-gated) → edit → Lock (publish a version) so every follow-latest
// embed updates everywhere at once.
//
// The menu is dumb + dispatch-driven: it never mutates a doc directly, it emits
// TelaOps. Rights are a prop (canEdit) — see the caller's rights TODO.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Link2, Lock, Unlock, X } from 'lucide-react';
import type { TelaBlock, TelaDoc, TelaField, TelaImageLayer, TelaVectorObject } from '../../types';
import type { TelaOp } from './telaOps';
import { TelaVectorObjectProps } from './TelaVector';
import { TelaImageLayerControls } from './TelaImage';

// ── What was clicked — a discriminated target, so the menu shows the right tools.
export type FlyingTarget =
  | { kind: 'vector-text'; deviceId: string; object: TelaVectorObject; index: number }
  | { kind: 'vector-shape'; deviceId: string; object: TelaVectorObject; index: number }
  | { kind: 'image-layer'; deviceId: string; layer: TelaImageLayer }
  | { kind: 'writer-block'; deviceId: string; block: TelaBlock; blocks: TelaBlock[] }
  | { kind: 'grid-cell'; deviceId: string; cellKey: string; value: string }
  | { kind: 'base-row'; deviceId: string; rowId: string; field: TelaField; value: string };

// A stable identity for whatever the menu edits — resolved to a live FlyingTarget
// from the current doc each render, so edits never go stale and reorders track.
export type FlyingRef =
  | { kind: 'vector-text' | 'vector-shape'; deviceId: string; objectId: string }
  | { kind: 'image-layer'; deviceId: string; layerId: string }
  | { kind: 'writer-block'; deviceId: string; blockId: string }
  | { kind: 'grid-cell'; deviceId: string; cellKey: string }
  | { kind: 'base-row'; deviceId: string; rowId: string; fieldId: string };

/** Resolve a FlyingRef against the LIVE doc → a fresh target, or null if the
 *  referenced object was deleted (the caller then closes the menu). */
export function resolveFlyingTarget(doc: TelaDoc, ref: FlyingRef): FlyingTarget | null {
  const dev = doc.devices[ref.deviceId];
  if (!dev) return null;
  if ((ref.kind === 'vector-text' || ref.kind === 'vector-shape') && dev.type === 'VECTOR') {
    const index = dev.objects.findIndex(o => o.id === ref.objectId);
    const object = dev.objects[index];
    if (!object) return null;
    return { kind: object.kind === 'TEXT' ? 'vector-text' : 'vector-shape', deviceId: ref.deviceId, object, index };
  }
  if (ref.kind === 'image-layer' && dev.type === 'IMAGE') {
    const layer = dev.layers.find(l => l.id === ref.layerId);
    return layer ? { kind: 'image-layer', deviceId: ref.deviceId, layer } : null;
  }
  if (ref.kind === 'writer-block' && dev.type === 'WRITER') {
    const block = dev.blocks.find(b => b.id === ref.blockId);
    return block ? { kind: 'writer-block', deviceId: ref.deviceId, block, blocks: dev.blocks } : null;
  }
  if (ref.kind === 'grid-cell' && dev.type === 'GRID') {
    return { kind: 'grid-cell', deviceId: ref.deviceId, cellKey: ref.cellKey, value: dev.cells[ref.cellKey] || '' };
  }
  if (ref.kind === 'base-row' && dev.type === 'BASE') {
    const row = dev.rows.find(x => x.id === ref.rowId);
    const field = dev.fields.find(f => f.id === ref.fieldId);
    return row && field ? { kind: 'base-row', deviceId: ref.deviceId, rowId: ref.rowId, field, value: row.values[field.id] || '' } : null;
  }
  return null;
}

export interface TelaFlyingMenuProps {
  /** Viewport-space anchor point (usually the clicked element's top-right). */
  anchor: { x: number; y: number };
  target: FlyingTarget;
  /** Published-lock state of the underlying doc. */
  locked: boolean;
  /** Does this viewer hold edit rights? (P2: a prop; real spine is contentLicense/RBAC.) */
  canEdit: boolean;
  /** True while a Lock/publish is in flight. */
  publishing?: boolean;
  writers?: { id: string; name: string }[];
  onDispatch: (op: TelaOp) => void;
  /** Unlock for editing (rights-gated by the caller). */
  onUnlock: () => void;
  /** Lock → publish a new version (propagates to follow-latest embeds). */
  onLock: () => void;
  onClose: () => void;
}

const TITLES: Record<FlyingTarget['kind'], string> = {
  'vector-text': 'Text object',
  'vector-shape': 'Shape',
  'image-layer': 'Image layer',
  'writer-block': 'Text block',
  'grid-cell': 'Cell',
  'base-row': 'Record',
};

const BLOCK_KINDS: { id: TelaBlock['kind']; label: string }[] = [
  { id: 'h1', label: 'Heading 1' },
  { id: 'h2', label: 'Heading 2' },
  { id: 'p', label: 'Body' },
  { id: 'li', label: 'List item' },
];

const stripInline = (html: string) =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const escapeInline = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--pj-faint,#6E6480)', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', height: 30, padding: '0 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12.5, outline: 'none' };

const TelaFlyingMenu: React.FC<TelaFlyingMenuProps> = ({
  anchor, target, locked, canEdit, publishing, writers, onDispatch, onUnlock, onLock, onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Flip/clamp against the viewport once the popover has measured itself.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const W = el.offsetWidth || 264;
    const H = el.offsetHeight || 240;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchor.x + 12;
    if (left + W > vw - 8) left = anchor.x - W - 12;   // flip to the left
    left = Math.max(8, Math.min(left, vw - W - 8));      // clamp
    let top = anchor.y;
    top = Math.max(8, Math.min(top, vh - H - 8));
    setPos({ left, top });
  }, [anchor.x, anchor.y, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const editable = canEdit && !locked;

  // ── Per-type tool body ──────────────────────────────────────────────────────
  const body = (() => {
    switch (target.kind) {
      case 'vector-text':
      case 'vector-shape':
        return (
          <TelaVectorObjectProps
            object={target.object}
            writers={writers}
            onUpdate={patch => onDispatch({ type: 'UPDATE_VECTOR_OBJECT', deviceId: target.deviceId, objectId: target.object.id, patch })}
            onDelete={() => { onDispatch({ type: 'DELETE_VECTOR_OBJECT', deviceId: target.deviceId, objectId: target.object.id }); onClose(); }}
            onForward={() => onDispatch({ type: 'REORDER_VECTOR_OBJECT', deviceId: target.deviceId, objectId: target.object.id, toIndex: target.index + 1 })}
            onBack={() => onDispatch({ type: 'REORDER_VECTOR_OBJECT', deviceId: target.deviceId, objectId: target.object.id, toIndex: target.index - 1 })}
            compact
          />
        );
      case 'image-layer':
        return (
          <TelaImageLayerControls
            layer={target.layer}
            onUpdate={patch => onDispatch({ type: 'UPDATE_IMAGE_LAYER', deviceId: target.deviceId, layerId: target.layer.id, patch })}
          />
        );
      case 'writer-block': {
        const { block, blocks, deviceId } = target;
        const replace = (patch: Partial<TelaBlock>) =>
          onDispatch({ type: 'SET_WRITER_BLOCKS', deviceId, blocks: blocks.map(b => b.id === block.id ? { ...b, ...patch } : b) });
        const wrap = (tag: 'strong' | 'em') => {
          const open = `<${tag}>`, close = `</${tag}>`;
          const t = block.text;
          const has = t.trim().startsWith(open) && t.trim().endsWith(close);
          replace({ text: has ? t.trim().slice(open.length, -close.length) : `${open}${t}${close}` });
        };
        return (
          <div style={{ color: '#fff' }}>
            <div style={{ marginBottom: 10 }}>
              <div style={lbl}>Block type</div>
              <select value={block.kind} onChange={e => replace({ kind: e.target.value as TelaBlock['kind'] })} style={inputStyle}>
                {BLOCK_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button title="Bold" onClick={() => wrap('strong')} style={{ display: 'grid', placeItems: 'center', width: 34, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><Bold size={14} /></button>
              <button title="Italic" onClick={() => wrap('em')} style={{ display: 'grid', placeItems: 'center', width: 34, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><Italic size={14} /></button>
            </div>
            <div>
              <div style={lbl}>Edit text</div>
              <textarea
                value={stripInline(block.text)}
                onChange={e => replace({ text: escapeInline(e.target.value) })}
                rows={3}
                style={{ ...inputStyle, height: 'auto', padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        );
      }
      case 'grid-cell':
        return (
          <div style={{ color: '#fff' }}>
            <div style={lbl}>Cell {target.cellKey}</div>
            <input
              autoFocus
              defaultValue={target.value}
              onChange={e => onDispatch({ type: 'SET_GRID_CELL', deviceId: target.deviceId, key: target.cellKey, value: e.target.value })}
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--pj-muted,#A398B4)', marginTop: 6 }}>Start with = for a formula.</p>
          </div>
        );
      case 'base-row':
        return (
          <div style={{ color: '#fff' }}>
            <div style={lbl}>{target.field.name}</div>
            <input
              autoFocus
              defaultValue={target.value}
              onChange={e => onDispatch({ type: 'SET_BASE_CELL', deviceId: target.deviceId, rowId: target.rowId, fieldId: target.field.id, value: e.target.value })}
              style={inputStyle}
            />
          </div>
        );
    }
  })();

  const bound = (target.kind === 'vector-text') && !!target.object.boundWriterDeviceId;

  return createPortal(
    <>
      {/* Click-away backdrop (transparent). */}
      <div onPointerDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2400 }} />
      <div
        ref={ref}
        onPointerDown={e => e.stopPropagation()}
        style={{
          position: 'fixed', zIndex: 2401,
          left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y,
          visibility: pos ? 'visible' : 'hidden',
          width: 264, maxHeight: '80vh', overflowY: 'auto',
          background: 'linear-gradient(160deg,#1A1424,#120D1C)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 'var(--pj-radius-md,16px)',
          boxShadow: 'var(--pj-elev-4, 0 24px 60px rgba(0,0,0,0.6))',
          padding: 12,
        }}
      >
        {/* Header — object type + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: '.01em' }}>{TITLES[target.kind]}</span>
          {bound && (
            <span title="Bound to a Writer — edit it at the source" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 700, color: '#8fe9f6', padding: '2px 6px', borderRadius: 999, background: 'rgba(0,218,243,0.14)', border: '1px solid rgba(0,218,243,0.4)' }}>
              <Link2 size={10} /> bound
            </span>
          )}
          <button onClick={onClose} title="Close" style={{ marginLeft: 'auto', display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 7, background: 'transparent', border: 'none', color: 'var(--pj-muted,#A398B4)', cursor: 'pointer' }}><X size={14} /></button>
        </div>

        {/* Rights / lock banner */}
        {!canEdit ? (
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--pj-muted,#A398B4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px' }}>
            View only — you don't hold edit rights to this document.
          </div>
        ) : locked ? (
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--pj-muted,#A398B4)', marginBottom: 8 }}>
              <Lock size={13} /> Locked — published version is live.
            </div>
            <button
              onClick={onUnlock}
              style={{ width: '100%', height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 800, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}
            >
              <Unlock size={14} /> Unlock to edit
            </button>
          </div>
        ) : (
          <>
            {body}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                onClick={onLock}
                disabled={publishing}
                style={{ width: '100%', height: 34, borderRadius: 10, border: 'none', cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.6 : 1, color: '#fff', fontWeight: 800, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }}
              >
                <Lock size={14} /> {publishing ? 'Publishing…' : 'Lock & publish'}
              </button>
              <p style={{ fontSize: 10.5, color: 'var(--pj-faint,#6E6480)', textAlign: 'center', marginTop: 6, lineHeight: 1.4 }}>
                Publishing updates every follow-latest embed. Sold copies stay on their version.
              </p>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
};

export default TelaFlyingMenu;
export { stripInline as flyingStripInline };
