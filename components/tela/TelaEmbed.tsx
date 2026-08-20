// TelaEmbed — the reference embed (spec §07 "reference, never export"). A living
// Tela document rendered inside ANOTHER surface (a feed card, a chat space, a
// signage loop) via the SAME device renderers as the canvas — never a flattened
// export. Three read modes:
//   • follow-latest → newest published version (live surfaces track this)
//   • pinned        → a fixed versionId snapshot (sold/licensed copies never
//                     mutate under the reader)
//   • editable      → the LIVE doc, with the author-in-place flying menu
//
// One canonical doc, many subscribing views: a Lock in the editable embed
// publishes a version and every follow-latest embed re-resolves via the
// tela:doc-changed signal — the staleness bug-class solved structurally.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { TelaDoc, TelaFrame, TelaVectorObject } from '../../types';
import {
  loadTelaDoc, resolveEmbedDoc, saveTelaDoc, publishTelaVersion,
  TELA_DOC_CHANGED_EVENT, type TelaDocChangedDetail,
} from '../../services/telaStore';
import { applyTelaOp, PRESETS, type TelaOp } from './telaOps';
import { renderDevice as renderTelaDevice, buildRenderMaps, type RenderDeviceCtx } from './renderDevice';
import { objBounds } from './TelaVector';
import TelaFlyingMenu, { resolveFlyingTarget, type FlyingRef, flyingStripInline } from './TelaFlyingMenu';

export interface TelaEmbedProps {
  docId: string;
  /** Pinned mode reads this exact snapshot. Ignored for follow-latest. */
  versionId?: string;
  /** Which frame to show; defaults to the first frame. */
  frameId?: string;
  mode: 'follow-latest' | 'pinned';
  /** When true, render the LIVE doc with the author-in-place flying menu. */
  editable?: boolean;
  /**
   * Does this viewer hold edit rights?
   * TODO(rights): wire to contentLicense / orgPermissions (RBAC) / Creator
   * Passport — ownership, org role, or an explicit grant. P2 defaults to the
   * prop (true in the demo) so the mechanism is exercised end-to-end.
   */
  canEdit?: boolean;
  /** Target render width in px (the frame scales to fit). */
  width?: number;
  /** Friendly version name for the pinned badge (e.g. "v1"). */
  versionLabel?: string;
  className?: string;
}

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const blockPlainText = (b: { text: string }) => flyingStripInline(b.text).replace(/\n/g, ' ').trim();

const TelaEmbed: React.FC<TelaEmbedProps> = ({
  docId, versionId, frameId, mode, editable = false, canEdit = true, width = 360, versionLabel, className,
}) => {
  const [doc, setDoc] = useState<TelaDoc | null>(null);
  const [resolvedVersion, setResolvedVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  // Menu holds a lightweight REF (+ anchor); the live target is resolved from the
  // current doc each render, so edits reflect immediately and reorders track.
  const [menu, setMenu] = useState<{ ref: FlyingRef; anchor: { x: number; y: number } } | null>(null);

  const docRef = useRef<TelaDoc | null>(null);
  docRef.current = doc;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load / resolve ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (editable) {
      // Editable always edits the canonical LIVE doc.
      const d = await loadTelaDoc(docId);
      setDoc(d);
      setResolvedVersion(d?.currentVersionId ?? null);
    } else {
      const { doc: d, versionId: v } = await resolveEmbedDoc(docId, mode, versionId);
      setDoc(d);
      setResolvedVersion(v);
    }
    setLoading(false);
  }, [docId, mode, versionId, editable]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  // Cross-instance sync: a save/publish elsewhere re-resolves follow-latest
  // embeds. Pinned copies IGNORE the signal — they are immutable by contract.
  useEffect(() => {
    if (editable || mode === 'pinned') return;
    const h = (e: Event) => {
      const detail = (e as CustomEvent<TelaDocChangedDetail>).detail;
      if (detail?.docId === docId) void load();
    };
    window.addEventListener(TELA_DOC_CHANGED_EVENT, h as EventListener);
    return () => window.removeEventListener(TELA_DOC_CHANGED_EVENT, h as EventListener);
  }, [docId, mode, editable, load]);

  // ── Editable: ops + debounced autosave ───────────────────────────────────────
  const dispatchOp = useCallback((op: TelaOp) => {
    setDoc(d => (d ? applyTelaOp(d, op) : d));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { const cur = docRef.current; if (cur) void saveTelaDoc(cur); }, 700);
  }, []);

  useEffect(() => () => { if (saveTimer.current) { clearTimeout(saveTimer.current); const cur = docRef.current; if (cur) void saveTelaDoc(cur); } }, []);

  const onUnlock = useCallback(() => { dispatchOp({ type: 'SET_LOCKED', locked: false }); }, [dispatchOp]);

  const onLock = useCallback(async () => {
    const cur = docRef.current;
    if (!cur) return;
    setPublishing(true);
    try {
      const { doc: stamped } = await publishTelaVersion(cur);
      setDoc(stamped);
      setResolvedVersion(stamped.currentVersionId ?? null);
      setMenu(null); // close after publish
    } finally { setPublishing(false); }
  }, []);

  // ── Frame + render maps ───────────────────────────────────────────────────────
  const frame: TelaFrame | null = useMemo(() => {
    if (!doc) return null;
    return (frameId && doc.frames.find(f => f.id === frameId)) || doc.frames[0] || null;
  }, [doc, frameId]);

  const maps = useMemo(
    () => buildRenderMaps(doc?.devices || {}, doc?.frames || [], blockPlainText),
    [doc?.devices, doc?.frames],
  );

  const renderCtx = useMemo<RenderDeviceCtx>(() => ({
    devices: doc?.devices || {},
    dispatchOp,
    writerTexts: maps.writerTexts,
    writers: maps.writers,
    bases: maps.bases,
    formulaContext: maps.formulaContext,
    uid,
  }), [doc?.devices, dispatchOp, maps]);

  // ── Picking → flying menu (editable only) ────────────────────────────────────
  const primaryDevice = frame && doc ? doc.devices[frame.deviceIds[0]] : null;
  const scale = frame ? width / frame.w : 1;

  const openMenu = (ref: FlyingRef, e: { clientX: number; clientY: number }) =>
    setMenu({ ref, anchor: { x: e.clientX, y: e.clientY } });

  /** Delegated click for WRITER / GRID / BASE devices (DOM-identified). */
  const onSurfaceClick = (e: React.MouseEvent) => {
    if (!editable || !primaryDevice || !doc) return;
    const t = e.target as HTMLElement;
    if (primaryDevice.type === 'WRITER') {
      const el = t.closest('[data-block-id]') as HTMLElement | null;
      const bid = el?.getAttribute('data-block-id');
      const block = primaryDevice.blocks.find(b => b.id === bid);
      if (block) openMenu({ kind: 'writer-block', deviceId: primaryDevice.id, blockId: block.id }, e);
    } else if (primaryDevice.type === 'IMAGE') {
      const top = [...primaryDevice.layers].reverse().find(l => l.visible) || primaryDevice.layers[primaryDevice.layers.length - 1];
      if (top) openMenu({ kind: 'image-layer', deviceId: primaryDevice.id, layerId: top.id }, e);
    } else if (primaryDevice.type === 'GRID') {
      openMenu({ kind: 'grid-cell', deviceId: primaryDevice.id, cellKey: 'A1' }, e);
    } else if (primaryDevice.type === 'BASE') {
      const row = primaryDevice.rows[0]; const field = primaryDevice.fields[0];
      if (row && field) openMenu({ kind: 'base-row', deviceId: primaryDevice.id, rowId: row.id, fieldId: field.id }, e);
    }
  };

  /** Resolve the menu ref against the LIVE doc → a fresh target (or null → close). */
  const liveTarget = useMemo(() => (menu && doc ? resolveFlyingTarget(doc, menu.ref) : null), [menu, doc]);

  if (loading) {
    return (
      <div className={className} style={{ width, height: 200, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--pj-muted,#A398B4)' }} />
      </div>
    );
  }
  if (!doc || !frame || !primaryDevice) {
    return (
      <div className={className} style={{ width, padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--pj-muted,#A398B4)', fontSize: 12.5 }}>
        Tela document unavailable.
      </div>
    );
  }

  const frameH = frame.h * scale;
  const isVector = primaryDevice.type === 'VECTOR';

  // Badge text — "Tela · live" vs "Tela · v3 (pinned)".
  const badge = mode === 'pinned'
    ? `Tela · ${versionLabel || (resolvedVersion ? 'v·' + resolvedVersion.slice(-4) : 'version')} (pinned)`
    : editable ? (doc.locked ? 'Tela · live · locked' : 'Tela · live · editing') : 'Tela · live';

  return (
    <div className={className} style={{ width, position: 'relative' }}>
      <div style={{ position: 'relative', width, height: frameH, overflow: 'hidden', borderRadius: 12, background: '#fff', boxShadow: 'var(--pj-elev-3, 0 10px 28px rgba(0,0,0,0.35))', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Scaled artboard — read-only device renderers, natural size. */}
        <div
          style={{ width: frame.w, height: frame.h, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}
          onClick={onSurfaceClick}
        >
          {frame.deviceIds.map(id => {
            const dev = doc.devices[id];
            return dev ? <div key={id} style={{ width: frame.w }}>{renderTelaDevice(dev, renderCtx, true)}</div> : null;
          })}

          {/* Vector picking overlay — a hotspot per object, in artboard coords so it
              scales with the container. Front objects sit on top (higher z). */}
          {editable && isVector && (primaryDevice as any).objects.map((o: TelaVectorObject, i: number) => {
            const b = objBounds(o);
            return (
              <button
                key={o.id}
                title={o.kind === 'TEXT' ? 'Edit text' : `Edit ${o.kind.toLowerCase()}`}
                onClick={e => { e.stopPropagation(); openMenu(o.kind === 'TEXT'
                  ? { kind: 'vector-text', deviceId: primaryDevice.id, objectId: o.id }
                  : { kind: 'vector-shape', deviceId: primaryDevice.id, objectId: o.id }, e); }}
                style={{
                  position: 'absolute', left: b.x, top: b.y, width: Math.max(12, b.w), height: Math.max(12, b.h),
                  zIndex: 2 + i, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  outline: menu && (menu.ref as any).objectId === o.id ? '2px solid var(--pj-magenta,#D40055)' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Badge — live vs pinned */}
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: '.02em', color: '#fff', background: mode === 'pinned' ? 'rgba(20,16,28,0.82)' : 'rgba(107,0,153,0.68)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)', pointerEvents: 'none' }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: mode === 'pinned' ? 'var(--pj-faint,#6E6480)' : 'var(--pj-cyan,#00DAF3)' }} />
        {badge}
      </div>

      {editable && canEdit && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--pj-faint,#6E6480)' }}>
          {isVector ? 'Click any object to edit in place.' : 'Click the document to edit in place.'}
        </div>
      )}

      {menu && liveTarget && (
        <TelaFlyingMenu
          anchor={menu.anchor}
          target={liveTarget}
          locked={!!doc.locked}
          canEdit={canEdit}
          publishing={publishing}
          writers={maps.writers}
          onDispatch={dispatchOp}
          onUnlock={onUnlock}
          onLock={onLock}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
};

export default TelaEmbed;
