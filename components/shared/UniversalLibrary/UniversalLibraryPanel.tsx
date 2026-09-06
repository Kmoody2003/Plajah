// UniversalLibraryPanel — the one Universal Media Library / Preset Viewer, shared
// across Fabula, Melos, Tela and Plajah Pixels. Dockable (right/left rail,
// resizable), undockable (floating draggable window), and collapsible to a thin
// rail. Browses one asset service: Personal / Organization / Business assets
// (orgAssets DAM), and Platform Presets (the live-preview registries). Community
// and Stock are shown as a future update.
//
// Built to the Plajah design language (styles/plajah-ds.css tokens).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LibraryTile } from './LibraryTile';
import {
  presetShelf, filterItems, LIBRARY_SOURCES, LIBRARY_FILTERS,
  type LibraryItem, type LibrarySourceId, type LibraryFilter, type LibraryKind,
} from '../../../services/universalLibrary/libraryModel';
import { listHqAssets, type OrgAsset, type OwnerScope } from '../../../services/orgAssets';
import { auth } from '../../../services/firebase';

export type DockState = 'docked' | 'floating' | 'collapsed';
export interface UniversalLibraryProps {
  accent?: string;
  side?: 'left' | 'right';
  storageKey?: string;
  /** Optional DAM scopes; when present, Personal/Org/Business load real assets. */
  scopes?: { personal?: OwnerScope; org?: OwnerScope; business?: OwnerScope };
  /** Restrict the Presets shelf to the kinds this host app can use (e.g. Pixels = shader/gen). */
  accepts?: LibraryKind[];
  /** What "Use / Add" does in the host app. */
  onUse?: (item: LibraryItem) => void;
  /** Optional import affordance (e.g. Pixels ISF import) shown in the toolbar. */
  onImport?: () => void;
  /** Extra control rendered in the title bar (e.g. a switch back to a classic view). */
  headerExtra?: React.ReactNode;
  /** Initial dock when nothing is persisted (overlay mounts pass 'floating'). */
  defaultDock?: DockState;
  onClose?: () => void;
}

interface Geo { dock: DockState; width: number; fx: number; fy: number; fw: number; fh: number }
const DEF: Geo = { dock: 'docked', width: 384, fx: 80, fy: 80, fw: 400, fh: 560 };
const clampW = (w: number) => Math.max(280, Math.min(680, w));

function loadGeo(key?: string): Geo {
  if (!key || typeof localStorage === 'undefined') return { ...DEF };
  try { const j = JSON.parse(localStorage.getItem(key) || '{}'); return { ...DEF, ...j }; } catch { return { ...DEF }; }
}

function orgAssetToItem(a: OrgAsset, source: LibrarySourceId): LibraryItem {
  const kind = a.kind === 'video' ? 'video' : a.kind === 'image' ? 'image' : 'swatch';
  return {
    id: a.id, name: a.name, source, kind: 'media', category: a.folder, author: a.uploadedByUid ? 'you' : 'team',
    tags: a.tags, typeLabel: (a.kind || 'file').toUpperCase(),
    preview: kind === 'swatch' ? { mode: 'swatch', swatch: 'linear-gradient(135deg,#241d31,#3a2d4a)' } : { mode: kind, url: a.url },
  };
}

export const UniversalLibraryPanel: React.FC<UniversalLibraryProps> = ({ accent = '#D40055', side = 'right', storageKey, scopes, accepts, onUse, onImport, headerExtra, defaultDock, onClose }) => {
  const [geo, setGeo] = useState<Geo>(() => { const g = loadGeo(storageKey); return defaultDock && (!storageKey || typeof localStorage === 'undefined' || !localStorage.getItem(storageKey)) ? { ...g, dock: defaultDock } : g; });
  const [source, setSource] = useState<LibrarySourceId>('presets');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<LibraryItem | null>(null);
  const [assets, setAssets] = useState<Record<string, LibraryItem[] | 'loading' | undefined>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const persist = useCallback((g: Geo) => { setGeo(g); if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(g)); } catch { /* */ } }, [storageKey]);
  const setDock = (dock: DockState) => persist({ ...geo, dock });

  // Load DAM assets for the personal/org/business shelves on demand.
  useEffect(() => {
    if (source === 'presets' || source === 'community' || source === 'stock') return;
    if (assets[source] !== undefined) return;
    let scope = scopes?.[source as 'personal' | 'org' | 'business'];
    // Personal falls back to the signed-in user's own DAM so it works in every host with no wiring.
    if (!scope && source === 'personal' && auth.currentUser) scope = { kind: 'user', id: auth.currentUser.uid };
    if (!scope) { setAssets((m) => ({ ...m, [source]: [] })); return; }
    setAssets((m) => ({ ...m, [source]: 'loading' }));
    let alive = true;
    listHqAssets(scope).then((rows) => { if (alive) setAssets((m) => ({ ...m, [source]: rows.map((r) => orgAssetToItem(r, source)) })); })
      .catch(() => { if (alive) setAssets((m) => ({ ...m, [source]: [] })); });
    return () => { alive = false; };
  }, [source, scopes, assets]);

  const raw: LibraryItem[] | 'loading' | 'later' = useMemo(() => {
    if (source === 'presets') { const all = presetShelf(); return accepts && accepts.length ? all.filter((it) => accepts.includes(it.kind)) : all; }
    if (source === 'community' || source === 'stock') return 'later';
    return assets[source] === 'loading' ? 'loading' : (assets[source] || []);
  }, [source, assets, accepts]);

  const items = useMemo(() => (Array.isArray(raw) ? filterItems(raw, filter, query) : []), [raw, filter, query]);

  // ── resize (docked) ──
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = geo.width, dir = side === 'right' ? -1 : 1;
    const move = (ev: PointerEvent) => setGeo((g) => ({ ...g, width: clampW(w0 + (ev.clientX - x0) * dir) }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGeo((g) => { const n = { ...g }; if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(n)); } catch { /* */ } return n; }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  // ── drag / resize (floating) ──
  const startFloat = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (mode === 'move' && (e.target as HTMLElement).closest('button,input')) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, g0 = { ...geo };
    const move = (ev: PointerEvent) => setGeo((g) => mode === 'move'
      ? { ...g, fx: Math.max(0, g0.fx + ev.clientX - x0), fy: Math.max(0, g0.fy + ev.clientY - y0) }
      : { ...g, fw: Math.max(300, g0.fw + ev.clientX - x0), fh: Math.max(320, g0.fh + ev.clientY - y0) });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); persist({ ...geoRef.current }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const geoRef = useRef(geo); geoRef.current = geo;

  // ── collapsed rail ──
  if (geo.dock === 'collapsed') {
    return (
      <div className="ul-collrail" onClick={() => setDock('docked')} title="Expand the library"
        style={{ width: 46, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '14px 0', cursor: 'pointer', background: '#141019', [side === 'right' ? 'borderLeft' : 'borderRight']: '1px solid var(--pj-border, rgba(255,255,255,.09))' }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg,#6B0099,${accent})`, display: 'grid', placeItems: 'center', fontSize: 12 }}>▦</span>
        <span style={{ writingMode: 'vertical-rl', fontFamily: 'var(--mono, monospace)', fontSize: 9, letterSpacing: '.18em', color: 'var(--pj-muted,#877E9B)', textTransform: 'uppercase' }}>Library</span>
        {['#D40055', '#00DAF3', '#FF8C00'].map((c) => <span key={c} style={{ width: 7, height: 7, borderRadius: 4, background: c }} />)}
      </div>
    );
  }

  const floating = geo.dock === 'floating';
  const shellStyle: React.CSSProperties = floating
    ? { position: 'fixed', left: geo.fx, top: geo.fy, width: geo.fw, height: geo.fh, zIndex: 60, borderRadius: 16, boxShadow: '0 40px 80px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.05)' }
    : { position: 'relative', width: geo.width, height: '100%', [side === 'right' ? 'borderLeft' : 'borderRight']: '1px solid var(--pj-border, rgba(255,255,255,.09))' };

  return (
    <div ref={rootRef} className="ul-panel" style={{
      ...shellStyle, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden',
      background: 'linear-gradient(180deg, #17121f 0%, #0b0910 100%)',
      color: 'var(--ink,#F5F2F9)', fontFamily: 'var(--body,Inter,system-ui,sans-serif)', fontSize: 13,
      // @ts-ignore custom prop
      '--ul-accent': accent,
    }}>
      {/* resize handle on the dock edge */}
      {!floating && (
        <div onPointerDown={startResize} title="Drag to resize" style={{ position: 'absolute', [side === 'right' ? 'left' : 'right']: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 3 }} />
      )}

      {/* title bar */}
      <div onPointerDown={floating ? startFloat('move') : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', borderBottom: '1px solid var(--pj-border,rgba(255,255,255,.09))', cursor: floating ? 'grab' : 'default', flex: 'none' }}
        onDoubleClick={() => setDock(floating ? 'docked' : 'floating')}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg,#6B0099,${accent})`, display: 'grid', placeItems: 'center', fontSize: 13, flex: 'none' }}>▦</span>
        <b style={{ fontFamily: 'var(--disp,"Space Grotesk",sans-serif)', fontWeight: 700, fontSize: 13 }}>Library</b>
        <span style={{ fontFamily: 'var(--mono,monospace)', fontSize: 9, color: 'var(--pj-muted,#877E9B)' }}>// {source}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
          {headerExtra}
          {([['docked', '▐', 'Dock'], ['floating', '❐', 'Float'], ['collapsed', '⟨', 'Collapse']] as const).map(([st, ic, tt]) => (
            <button key={st} onClick={() => setDock(st)} title={tt} style={winBtn(geo.dock === st, accent)}>{ic}</button>
          ))}
          {onClose && <button onClick={onClose} title="Close" style={winBtn(false, accent)}>✕</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '128px 1fr', flex: 1, minHeight: 0 }}>
        {/* sources */}
        <div style={{ borderRight: '1px solid var(--pj-border,rgba(255,255,255,.09))', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          <div style={srcH}>Your shelves</div>
          {LIBRARY_SOURCES.map((s) => (
            <button key={s.id} disabled={s.later} onClick={() => !s.later && setSource(s.id)}
              style={srcRow(source === s.id, s.later, accent)}>
              <span style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{s.icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{s.label}</span>
              <span style={{ fontFamily: 'var(--mono,monospace)', fontSize: 8.5, color: s.later ? '#5F5872' : 'var(--pj-lilac,#D0BCFF)' }}>{s.later ? 'LATER' : ''}</span>
            </button>
          ))}
        </div>

        {/* browse */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {/* chips */}
          <div style={{ display: 'flex', gap: 4, padding: '7px 9px 2px', flexWrap: 'wrap' }}>
            {LIBRARY_FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={chip(filter === f, accent)}>{f}</button>
            ))}
          </div>
          {/* search */}
          <div style={{ padding: '6px 9px', flex: 'none', display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px', borderRadius: 8, background: 'var(--ground-2,#0B0910)', border: '1px solid var(--pj-border,rgba(255,255,255,.09))' }}>
              <span style={{ color: 'var(--pj-muted,#877E9B)', fontSize: 12 }}>⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library…"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink,#F5F2F9)', fontSize: 11.5 }} />
            </div>
            {onImport && <button onClick={onImport} title="Import" style={{ flex: 'none', height: 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${accent}`, background: 'transparent', color: '#fff', fontSize: 11, cursor: 'pointer' }}>＋</button>}
          </div>
          {/* grid / empty states */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '2px 9px 9px', minHeight: 0 }}>
            {raw === 'later' ? (
              <EmptyState title={source === 'community' ? 'Community · coming soon' : 'Stock · coming soon'}
                body={source === 'community' ? 'Shaders, looks, grooves and templates shared by the Plajah community — arriving in a future update.' : 'Licensed footage, audio beds and stems from the Plajah stock shelf — arriving in a future update.'} />
            ) : raw === 'loading' ? (
              <EmptyState title="Loading…" body="Fetching your assets." />
            ) : items.length === 0 ? (
              <EmptyState title="Nothing here yet" body={source === 'presets' ? 'No preset matches your search.' : 'Upload assets to this shelf, or connect an account, and they appear here.'} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
                {items.map((it) => (
                  <button key={it.id} onClick={() => setSel(it)} onDoubleClick={() => onUse?.(it)} title={it.name}
                    style={card(sel?.id === it.id, accent)}>
                    <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: '#0d0b12' }}>
                      <LibraryTile item={it} />
                      <span style={{ ...badge, color: (LIBRARY_SOURCES.find((s) => s.id === it.source) || {} as any).accent || '#aaa' }}>{it.source}</span>
                      <span style={{ ...typePill }}>{it.typeLabel}</span>
                    </div>
                    <div style={{ padding: '6px 7px', textAlign: 'left' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      <span style={{ fontFamily: 'var(--mono,monospace)', fontSize: 8.5, color: '#5F5872' }}>{it.author}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* inspector */}
          {sel && (
            <div style={{ borderTop: '1px solid var(--pj-border,rgba(255,255,255,.09))', padding: '9px 11px', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--ground-2,#0B0910)', flex: 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 12, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.name}</b>
                <div style={{ fontFamily: 'var(--mono,monospace)', fontSize: 9, color: 'var(--pj-muted,#877E9B)', marginTop: 2 }}>{sel.source} · {sel.typeLabel}</div>
              </div>
              <button onClick={() => onUse?.(sel)} style={{ flex: 'none', height: 32, padding: '0 15px', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '.03em', cursor: 'pointer', background: `linear-gradient(135deg,#6B0099,${accent})`, boxShadow: `0 6px 16px -6px ${accent}` }}>
                {sel.kind === 'media' ? 'Add to project' : 'Use'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* floating corner resize */}
      {floating && <div onPointerDown={startFloat('resize')} style={{ position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize', background: 'linear-gradient(135deg,transparent 50%,rgba(255,255,255,.22) 50%)' }} />}
    </div>
  );
};

const EmptyState: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div style={{ padding: '34px 16px', textAlign: 'center' }}>
    <div style={{ fontFamily: 'var(--disp,"Space Grotesk",sans-serif)', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{title}</div>
    <p style={{ fontSize: 12, color: 'var(--pj-muted,#877E9B)', margin: 0, lineHeight: 1.5, maxWidth: '30ch', marginInline: 'auto' }}>{body}</p>
  </div>
);

// ── inline style helpers (Plajah tokens with literal fallbacks) ──
const winBtn = (on: boolean, accent: string): React.CSSProperties => ({ width: 24, height: 24, borderRadius: 7, border: `1px solid ${on ? accent : 'var(--pj-border,rgba(255,255,255,.09))'}`, background: on ? 'color-mix(in srgb,' + accent + ' 16%, transparent)' : 'var(--pj-glass-3,rgba(255,255,255,.08))', color: on ? '#fff' : 'var(--ink-2,#B7AEC7)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 11 });
const srcH: React.CSSProperties = { fontFamily: 'var(--mono,monospace)', fontSize: 8.5, letterSpacing: '.14em', color: '#5F5872', textTransform: 'uppercase', padding: '8px 8px 4px' };
const srcRow = (on: boolean, later: boolean | undefined, accent: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: later ? 'default' : 'pointer', color: later ? '#5F5872' : on ? '#fff' : 'var(--ink-2,#B7AEC7)', fontSize: 11.5, border: '1px solid transparent', background: on ? 'color-mix(in srgb,' + accent + ' 16%, transparent)' : 'transparent', borderColor: on ? 'rgba(255,255,255,.08)' : 'transparent', opacity: later ? .6 : 1 });
const chip = (on: boolean, accent: string): React.CSSProperties => ({ fontFamily: 'var(--mono,monospace)', fontSize: 9, letterSpacing: '.04em', textTransform: 'uppercase', color: on ? '#fff' : 'var(--ink-2,#B7AEC7)', background: on ? accent : 'var(--pj-glass-2,rgba(255,255,255,.05))', border: `1px solid ${on ? 'transparent' : 'var(--pj-border,rgba(255,255,255,.09))'}`, borderRadius: 999, padding: '4px 9px', cursor: 'pointer' });
const card = (on: boolean, accent: string): React.CSSProperties => ({ border: `1px solid ${on ? accent : 'var(--pj-border,rgba(255,255,255,.09))'}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: 'var(--pj-glass-2,rgba(255,255,255,.05))', boxShadow: on ? `0 0 0 1px ${accent}` : 'none', padding: 0, color: 'inherit' });
const badge: React.CSSProperties = { position: 'absolute', top: 5, left: 5, fontFamily: 'var(--mono,monospace)', fontSize: 7.5, letterSpacing: '.08em', textTransform: 'uppercase', padding: '2px 5px', borderRadius: 5, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)', zIndex: 2 };
const typePill: React.CSSProperties = { position: 'absolute', bottom: 5, right: 5, fontFamily: 'var(--mono,monospace)', fontSize: 7.5, textTransform: 'uppercase', padding: '2px 5px', borderRadius: 5, background: 'rgba(0,0,0,.5)', color: '#fff', zIndex: 2 };

export default UniversalLibraryPanel;
