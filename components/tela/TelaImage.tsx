/**
 * TelaImage — the raster device (P2). A stack of image layers, each with a
 * position, scale, opacity, CSS blend mode and NON-DESTRUCTIVE adjustments
 * (brightness / contrast / saturation / exposure / blur) applied through CSS
 * `filter`. This is P2-honest: a GPU/canvas bake is a later push; nothing here
 * mutates pixels, so every adjustment is reversible.
 *
 * Uploads go to Firebase Storage under users/{uid}/tela/… (services/telaAssets);
 * guests get a session-only object: URL and the layer is flagged sessionOnly.
 * Every mutation is ops-shaped through the parent (add / update / delete /
 * reorder layer), ids stable.
 */
import React, { useRef, useState } from 'react';
import { ImagePlus, Link as LinkIcon, Eye, EyeOff, ChevronUp, ChevronDown, Trash2, Loader2 } from 'lucide-react';
import type { TelaImageDevice, TelaImageLayer, TelaImageAdjust, TelaBlendMode } from '../../types';
import { uploadTelaImage } from '../../services/telaAssets';

export const NEUTRAL_ADJUST: TelaImageAdjust = { brightness: 1, contrast: 1, saturate: 1, exposure: 0, blur: 0 };

const newLayerId = () => `lyr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** Adjustments → a CSS `filter` string. Exposure (stops) folds into brightness. */
export function imageFilter(a: TelaImageAdjust): string {
  const exposure = Math.pow(2, a.exposure || 0);
  const parts = [
    `brightness(${(a.brightness ?? 1) * exposure})`,
    `contrast(${a.contrast ?? 1})`,
    `saturate(${a.saturate ?? 1})`,
  ];
  if (a.blur && a.blur > 0) parts.push(`blur(${a.blur}px)`);
  return parts.join(' ');
}

const BLEND_MODES: TelaBlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity',
];

// ── Per-layer controls (reused by inline panel AND the Studio panel) ──────────

export const TelaImageLayerControls: React.FC<{
  layer: TelaImageLayer;
  onUpdate: (patch: Partial<TelaImageLayer>) => void;
}> = ({ layer, onUpdate }) => {
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 };
  const a = layer.adjust;
  const slider = (key: keyof TelaImageAdjust, label: string, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>{label} <span style={{ color: 'rgba(255,255,255,0.7)' }}>{fmt(a[key])}</span></div>
      <input type="range" min={min} max={max} step={step} value={a[key]} onChange={e => onUpdate({ adjust: { ...a, [key]: +e.target.value } })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
    </div>
  );
  return (
    <div style={{ color: '#fff' }}>
      <div style={{ marginBottom: 9 }}>
        <div style={lbl}>Opacity {Math.round(layer.opacity * 100)}%</div>
        <input type="range" min={0} max={1} step={0.01} value={layer.opacity} onChange={e => onUpdate({ opacity: +e.target.value })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
      </div>
      <div style={{ marginBottom: 9 }}>
        <div style={lbl}>Scale {a ? Math.round(layer.scale * 100) : 100}%</div>
        <input type="range" min={0.1} max={3} step={0.01} value={layer.scale} onChange={e => onUpdate({ scale: +e.target.value })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
      </div>
      <div style={{ marginBottom: 11 }}>
        <div style={lbl}>Blend</div>
        <select value={layer.blend} onChange={e => onUpdate({ blend: e.target.value as TelaBlendMode })} style={{ width: '100%', height: 30, padding: '0 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none', textTransform: 'capitalize' }}>
          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div style={{ ...lbl, marginBottom: 6, color: 'rgba(255,255,255,0.55)' }}>Adjustments · non-destructive</div>
      {slider('exposure', 'Exposure', -2, 2, 0.01, v => (v > 0 ? '+' : '') + v.toFixed(2))}
      {slider('brightness', 'Brightness', 0, 2, 0.01, v => v.toFixed(2))}
      {slider('contrast', 'Contrast', 0, 2, 0.01, v => v.toFixed(2))}
      {slider('saturate', 'Saturation', 0, 2, 0.01, v => v.toFixed(2))}
      {slider('blur', 'Blur', 0, 20, 0.1, v => v.toFixed(1) + 'px')}
      <button
        onClick={() => onUpdate({ adjust: { ...NEUTRAL_ADJUST } })}
        style={{ width: '100%', height: 28, marginTop: 2, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
      >
        Reset adjustments
      </button>
    </div>
  );
};

// ── The device ────────────────────────────────────────────────────────────────

interface TelaImageProps {
  device: TelaImageDevice;
  readOnly?: boolean;
  chrome?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onAddLayer: (layer: TelaImageLayer) => void;
  onUpdateLayer: (layerId: string, patch: Partial<TelaImageLayer>) => void;
  onDeleteLayer: (layerId: string) => void;
  onReorder: (layerId: string, toIndex: number) => void;
}

export function makeImageLayer(src: string, name: string, extra?: Partial<TelaImageLayer>): TelaImageLayer {
  return {
    id: newLayerId(), name, src, x: 0, y: 0, scale: 1, opacity: 1,
    blend: 'normal', visible: true, adjust: { ...NEUTRAL_ADJUST }, ...extra,
  };
}

const TelaImage: React.FC<TelaImageProps> = (props) => {
  const { device, readOnly, chrome = true, onAddLayer, onUpdateLayer, onDeleteLayer, onReorder } = props;
  const [selI, setSelI] = useState<string | null>(null);
  const selectedId = props.selectedId !== undefined ? props.selectedId : selI;
  const select = (id: string | null) => { setSelI(id); props.onSelect?.(id); };

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const drag = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  const selected = device.layers.find(l => l.id === selectedId) || null;

  const addFromFile = async (file: File) => {
    setBusy(true);
    try {
      const r = await uploadTelaImage(file);
      onAddLayer(makeImageLayer(r.src, file.name.replace(/\.[^.]+$/, ''), { storagePath: r.storagePath, sessionOnly: r.sessionOnly }));
    } catch (e) {
      console.error('[TelaImage] upload failed', e);
    } finally {
      setBusy(false);
    }
  };

  const addFromUrl = () => {
    const u = urlDraft.trim();
    if (u) onAddLayer(makeImageLayer(u, 'Image'));
    setUrlDraft(''); setUrlOpen(false);
  };

  const reorder = (id: string, dir: 1 | -1) => {
    const i = device.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    onReorder(id, Math.max(0, Math.min(device.layers.length - 1, i + dir)));
  };

  // Canvas drag-move on the selected layer.
  const onLayerPointerDown = (e: React.PointerEvent, id: string) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    select(id);
    const l = device.layers.find(x => x.id === id); if (!l) return;
    drag.current = { id, startX: e.clientX, startY: e.clientY, ox: l.x, oy: l.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    onUpdateLayer(d.id, { x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div
      className="tela-image"
      style={{ position: 'relative', width: device.width, height: device.height, background: '#fff', overflow: 'hidden' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Checker ground so transparency reads clearly (editing only — print stays white). */}
      {!readOnly && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,0 10px,10px -10px,-10px 0', opacity: 0.5 }} onPointerDown={() => select(null)} />
      )}

      {device.layers.map(l => l.visible && (
        <img
          key={l.id}
          src={l.src}
          alt={l.name || ''}
          draggable={false}
          onPointerDown={readOnly ? undefined : e => onLayerPointerDown(e, l.id)}
          style={{
            position: 'absolute', left: l.x, top: l.y,
            transform: `scale(${l.scale})`, transformOrigin: 'top left',
            opacity: l.opacity, mixBlendMode: l.blend as any, filter: imageFilter(l.adjust),
            maxWidth: 'none', cursor: readOnly ? 'default' : 'move',
            outline: !readOnly && l.id === selectedId ? '2px solid var(--pj-magenta,#D40055)' : 'none',
            outlineOffset: 1,
          }}
        />
      ))}

      {device.layers.length === 0 && chrome && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9A8FAC', fontSize: 12.5, textAlign: 'center', padding: 24, pointerEvents: 'none' }}>
          <span>Empty canvas — add an image layer from the toolbar.</span>
        </div>
      )}

      {/* Toolbar */}
      {chrome && !readOnly && (
        <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 2, padding: 3, background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, backdropFilter: 'blur(6px)' }}>
            <button title="Upload image" disabled={busy} onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', fontSize: 12, fontWeight: 700 }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {busy ? 'Uploading…' : 'Image'}
            </button>
            <button title="Add by URL" onClick={() => setUrlOpen(o => !o)} style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', background: 'transparent' }}>
              <LinkIcon size={15} />
            </button>
          </div>
          {urlOpen && (
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
              <input value={urlDraft} onChange={e => setUrlDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFromUrl(); }} placeholder="https://image…" style={{ width: 190, height: 28, padding: '0 8px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none' }} />
              <button onClick={addFromUrl} style={{ padding: '0 10px', borderRadius: 7, background: 'var(--pj-cyan,#00DAF3)', color: '#062', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>Add</button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void addFromFile(f); e.target.value = ''; }} />
        </div>
      )}

      {/* Inline layers + adjustments panel — hidden when Studio hosts it. */}
      {chrome && !readOnly && (
        <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', top: 8, right: 8, zIndex: 4, width: 234, maxHeight: 'calc(100% - 16px)', overflowY: 'auto', padding: 12, background: 'rgba(18,13,28,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, backdropFilter: 'blur(8px)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }} className="custom-scrollbar">
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>Layers</div>
          {[...device.layers].reverse().map(l => (
            <ImageLayerRow
              key={l.id} layer={l} selected={l.id === selectedId}
              onSelect={() => select(l.id)}
              onToggle={() => onUpdateLayer(l.id, { visible: !l.visible })}
              onForward={() => reorder(l.id, 1)} onBack={() => reorder(l.id, -1)}
              onDelete={() => { onDeleteLayer(l.id); if (selectedId === l.id) select(null); }}
            />
          ))}
          {!device.layers.length && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>No layers yet.</div>}
          {selected && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {selected.sessionOnly && <div style={{ fontSize: 10.5, color: 'var(--pj-warning,#F59E0B)', marginBottom: 8, fontWeight: 600 }}>Session-only — sign in to keep this image.</div>}
              <TelaImageLayerControls layer={selected} onUpdate={patch => onUpdateLayer(selected.id, patch)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// A single row in the layers list (exported for the Studio panel).
export const ImageLayerRow: React.FC<{
  layer: TelaImageLayer;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onForward: () => void;
  onBack: () => void;
  onDelete: () => void;
}> = ({ layer, selected, onSelect, onToggle, onForward, onBack, onDelete }) => (
  <div
    onClick={onSelect}
    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', marginBottom: 3, borderRadius: 8, cursor: 'pointer', background: selected ? 'rgba(255,255,255,0.09)' : 'transparent', border: selected ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent' }}
  >
    <img src={layer.src} alt="" style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'cover', flex: 'none', opacity: layer.visible ? 1 : 0.4 }} draggable={false} />
    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: layer.visible ? '#fff' : 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layer.name || 'Layer'}</span>
    <button title={layer.visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); onToggle(); }} style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
    <button title="Bring forward" onClick={e => { e.stopPropagation(); onForward(); }} style={{ display: 'grid', placeItems: 'center', width: 18, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><ChevronUp size={13} /></button>
    <button title="Send back" onClick={e => { e.stopPropagation(); onBack(); }} style={{ display: 'grid', placeItems: 'center', width: 18, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><ChevronDown size={13} /></button>
    <button title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ display: 'grid', placeItems: 'center', width: 20, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}><Trash2 size={12} /></button>
  </div>
);

export default TelaImage;
