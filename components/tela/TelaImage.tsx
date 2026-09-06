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
import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Link as LinkIcon, Eye, EyeOff, ChevronUp, ChevronDown, Trash2, Loader2 } from 'lucide-react';
import type { TelaImageDevice, TelaImageLayer, TelaImageAdjust, TelaBlendMode, TelaLayerMask } from '../../types';
import { uploadTelaImage } from '../../services/telaAssets';
import { classifyTelaAsset } from '../../services/telaCreativeEngine';

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

export function imageMaskStyle(mask?: TelaLayerMask): React.CSSProperties {
  if (!mask?.enabled) return {};
  if (mask.kind === 'LUMA_GRADIENT') {
    const black = Math.max(0, Math.min(1, mask.blackPoint ?? 0)), white = Math.max(0, Math.min(1, mask.whitePoint ?? 1));
    const mid = Math.max(black, Math.min(white, mask.midpoint ?? .5));
    const low = mask.invert ? '#fff' : '#000', high = mask.invert ? '#000' : '#fff';
    const ramp = `linear-gradient(${mask.angle ?? 90}deg,${low} ${black * 100}%,#888 ${mid * 100}%,${high} ${white * 100}%)`;
    return { maskImage: ramp, WebkitMaskImage: ramp, maskMode: 'luminance' as any, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' };
  }
  if (mask.kind === 'ALPHA_IMAGE' && mask.src) return { maskImage: `url(${JSON.stringify(mask.src)})`, WebkitMaskImage: `url(${JSON.stringify(mask.src)})`, maskSize: '100% 100%', WebkitMaskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' };
  if (mask.kind === 'SHAPE') return { clipPath: mask.shape === 'ELLIPSE' ? 'ellipse(50% 50% at 50% 50%)' : mask.shape === 'ROUNDED' ? 'inset(0 round 10%)' : 'inset(0)' };
  return {};
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
        <div style={lbl}>Rotation {Math.round(layer.rotation || 0)}°</div>
        <input type="range" min={-180} max={180} step={1} value={layer.rotation || 0} onChange={e => onUpdate({ rotation: +e.target.value })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
      </div>
      <div style={{ marginBottom: 11, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)' }}>
        <div style={lbl}>Layer mask · black hides / white reveals</div>
        <div className="flex items-center gap-2">
          <select value={layer.mask?.kind || 'NONE'} onChange={e => onUpdate({ mask: e.target.value === 'NONE' ? undefined : { kind: e.target.value as TelaLayerMask['kind'], enabled: true, angle: 90, blackPoint: 0, midpoint: .5, whitePoint: 1, shape: 'ELLIPSE' } })} style={{ flex: 1, height: 30, padding: '0 7px', borderRadius: 8, background: '#17131d', border: '1px solid rgba(255,255,255,.14)', color: '#fff', fontSize: 11 }}><option value="NONE">No mask</option><option value="LUMA_GRADIENT">Luminance gradient</option><option value="ALPHA_IMAGE">Alpha channel image</option><option value="SHAPE">Shape matte</option></select>
          {layer.mask && <button onClick={() => onUpdate({ mask: { ...layer.mask!, invert: !layer.mask!.invert } })} className="h-[30px] px-2 rounded-[8px] text-[9px] font-extrabold" style={{ color: layer.mask.invert ? '#8ff5ff' : 'rgba(255,255,255,.55)', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>Invert</button>}
        </div>
        {layer.mask?.kind === 'LUMA_GRADIENT' && <div className="mt-2"><div style={lbl}>Angle {Math.round(layer.mask.angle || 0)}°</div><input type="range" min={-180} max={180} value={layer.mask.angle || 0} onChange={e => onUpdate({ mask: { ...layer.mask!, angle: +e.target.value } })} style={{ width:'100%', accentColor:'var(--pj-cyan,#00DAF3)' }}/><div className="grid grid-cols-3 gap-2 mt-1">{(['blackPoint','midpoint','whitePoint'] as const).map((key, index) => <label key={key} className="text-[8px] uppercase text-white/35">{['Black','Mid','White'][index]}<input type="range" min={0} max={1} step={.01} value={layer.mask?.[key] ?? index * .5} onChange={e => onUpdate({ mask: { ...layer.mask!, [key]: +e.target.value } })} className="w-full"/></label>)}</div></div>}
        {layer.mask?.kind === 'SHAPE' && <select value={layer.mask.shape || 'ELLIPSE'} onChange={e => onUpdate({ mask: { ...layer.mask!, shape: e.target.value as 'RECT'|'ELLIPSE'|'ROUNDED' } })} className="mt-2 w-full h-8 rounded-[8px] px-2 text-[10px] text-white" style={{ background:'#17131d', border:'1px solid rgba(255,255,255,.12)' }}><option value="RECT">Rectangle matte</option><option value="ELLIPSE">Ellipse matte</option><option value="ROUNDED">Rounded matte</option></select>}
        {layer.mask?.kind === 'ALPHA_IMAGE' && <input value={layer.mask.src || ''} onChange={e => onUpdate({ mask: { ...layer.mask!, src: e.target.value } })} placeholder="Mask image URL / alpha channel" className="mt-2 w-full h-8 rounded-[8px] px-2 text-[10px] text-white outline-none" style={{ background:'#17131d', border:'1px solid rgba(255,255,255,.12)' }}/>}
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
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onAddLayer: (layer: TelaImageLayer) => void;
  onUpdateLayer: (layerId: string, patch: Partial<TelaImageLayer>) => void;
  onDeleteLayer: (layerId: string) => void;
  onReorder: (layerId: string, toIndex: number) => void;
  onLayerContextMenu?: (event: React.MouseEvent, layer: TelaImageLayer) => void;
  layerContextBindings?: (layer: TelaImageLayer) => { onContextMenu: (event: React.MouseEvent) => void; onPointerDown: (event: React.PointerEvent) => void; onPointerMove: (event: React.PointerEvent) => void; onPointerUp: () => void; onPointerCancel: () => void };
  interactionScale?: number;
  snap?: { enabled: boolean; x: number[]; y: number[]; threshold?: number };
}

export function makeImageLayer(src: string, name: string, extra?: Partial<TelaImageLayer>): TelaImageLayer {
  return {
    id: newLayerId(), name, src, x: 0, y: 0, scale: 1, opacity: 1,
    blend: 'normal', visible: true, adjust: { ...NEUTRAL_ADJUST }, ...extra,
  };
}

const TelaLottieLayer: React.FC<{ layer: TelaImageLayer; style: React.CSSProperties; onReady: (w: number, h: number) => void; onPointerDown?: React.PointerEventHandler<HTMLCanvasElement>; onPointerMove?: React.PointerEventHandler<HTMLCanvasElement>; onPointerUp?: React.PointerEventHandler<HTMLCanvasElement>; onPointerCancel?: React.PointerEventHandler<HTMLCanvasElement>; onContextMenu?: React.MouseEventHandler<HTMLCanvasElement> }> = ({ layer, style, onReady, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let player: any; let alive = true;
    void (async () => { try { const mod: any = await import('@lottiefiles/dotlottie-web'); const Ctor = mod.DotLottie ?? mod.default?.DotLottie; if (!alive || !Ctor || !ref.current) return; const w = layer.intrinsicWidth || 512, h = layer.intrinsicHeight || 512; ref.current.width = w; ref.current.height = h; onReady(w, h); player = new Ctor({ canvas: ref.current, src: layer.src, loop: true, autoplay: true }); } catch (error) { console.warn('[Tela] Lottie layer could not start', error); } })();
    return () => { alive = false; try { player?.destroy?.(); } catch { /* noop */ } };
  }, [layer.src]);
  return <canvas ref={ref} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={style}/>;
};

const TelaImage: React.FC<TelaImageProps> = (props) => {
  const { device, readOnly, chrome = true, onAddLayer, onUpdateLayer, onDeleteLayer, onReorder } = props;
  const [selI, setSelI] = useState<string | null>(null);
  const [selIdsI, setSelIdsI] = useState<string[]>([]);
  const selectedId = props.selectedId !== undefined ? props.selectedId : selI;
  const selectedIds = props.selectedIds !== undefined ? props.selectedIds : selIdsI;
  const selectMany = (ids: string[]) => {
    const next = [...new Set(ids)].filter(id => device.layers.some(layer => layer.id === id));
    const primary = next.at(-1) || null;
    setSelIdsI(next); setSelI(primary); props.onSelectionChange?.(next); props.onSelect?.(primary);
  };
  const select = (id: string | null) => selectMany(id ? [id] : []);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const drag = useRef<
    | { mode: 'move'; id: string; startX: number; startY: number; members: { id: string; ox: number; oy: number }[] }
    | { mode: 'scale'; id: string; startX: number; startScale: number; naturalWidth: number }
    | { mode: 'rotate'; id: string; cx: number; cy: number }
    | null
  >(null);
  const [naturalSize, setNaturalSize] = useState<Record<string, { w: number; h: number }>>({});
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});

  const selected = device.layers.find(l => l.id === selectedId) || null;

  const addFromFile = async (file: File) => {
    setBusy(true);
    try {
      const assetKind = classifyTelaAsset(file);
      if (assetKind !== 'RASTER' && assetKind !== 'VIDEO' && assetKind !== 'LOTTIE') throw new Error(`${file.name} is not a supported image, video, or .lottie layer.`);
      const r = await uploadTelaImage(file);
      onAddLayer(makeImageLayer(r.src, file.name.replace(/\.[^.]+$/, ''), {
        storagePath: r.storagePath, sessionOnly: r.sessionOnly,
        mediaKind: assetKind === 'RASTER' ? 'IMAGE' : assetKind,
        intrinsicWidth: assetKind === 'LOTTIE' ? 512 : undefined,
        intrinsicHeight: assetKind === 'LOTTIE' ? 512 : undefined,
      }));
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
    const nextIds = (e.shiftKey || e.ctrlKey || e.metaKey)
      ? (selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id])
      : (selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id]);
    selectMany(nextIds);
    if (!nextIds.includes(id)) return;
    const l = device.layers.find(x => x.id === id); if (!l) return;
    const members = nextIds.map(memberId => device.layers.find(layer => layer.id === memberId)).filter((layer): layer is TelaImageLayer => !!layer).map(layer => ({ id: layer.id, ox: layer.x, oy: layer.y }));
    drag.current = { mode: 'move', id, startX: e.clientX, startY: e.clientY, members };
  };
  const onScalePointerDown = (e: React.PointerEvent, layer: TelaImageLayer) => {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: 'scale', id: layer.id, startX: e.clientX, startScale: layer.scale, naturalWidth: Math.max(1, naturalSize[layer.id]?.w || 400) };
  };
  const onRotatePointerDown = (e: React.PointerEvent, layer: TelaImageLayer) => {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const size = naturalSize[layer.id] || { w: 400, h: 300 };
    const root = (e.currentTarget as Element).closest('.tela-image')?.getBoundingClientRect();
    const z = props.interactionScale || 1;
    drag.current = { mode: 'rotate', id: layer.id, cx: (root?.left || 0) + (layer.x + size.w * layer.scale / 2) * z, cy: (root?.top || 0) + (layer.y + size.h * layer.scale / 2) * z };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const z = props.interactionScale || 1;
    if (d.mode === 'move') {
      const primary = d.members.find(member => member.id === d.id) || d.members[0];
      let dx = (e.clientX - d.startX) / z, dy = (e.clientY - d.startY) / z;
      let x = primary.ox + dx, y = primary.oy + dy;
      const layer = device.layers.find(item => item.id === d.id), size = layer && naturalSize[layer.id];
      if (props.snap?.enabled && layer && size) {
        const threshold = props.snap.threshold ?? 6;
        const nearest = (values: number[], targets: number[]) => { let best: { delta: number; target: number } | null = null; for (const value of values) for (const target of targets) { const delta = target - value; if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target }; } return best; };
        const w = size.w * layer.scale, h = size.h * layer.scale;
        const peers = device.layers.filter(item => item.id !== d.id).flatMap(item => { const peerSize = naturalSize[item.id]; return peerSize ? [{ x: item.x, y: item.y, w: peerSize.w * item.scale, h: peerSize.h * item.scale }] : []; });
        const xTargets = [...props.snap.x, ...peers.flatMap(peer => [peer.x, peer.x + peer.w / 2, peer.x + peer.w])];
        const yTargets = [...props.snap.y, ...peers.flatMap(peer => [peer.y, peer.y + peer.h / 2, peer.y + peer.h])];
        const sx = nearest([x, x + w / 2, x + w], xTargets), sy = nearest([y, y + h / 2, y + h], yTargets);
        if (sx) { x += sx.delta; dx += sx.delta; } if (sy) { y += sy.delta; dy += sy.delta; } setSnapLines({ x: sx?.target, y: sy?.target });
      } else setSnapLines({});
      d.members.forEach(member => onUpdateLayer(member.id, { x: member.ox + dx, y: member.oy + dy }));
    }
    else if (d.mode === 'scale') onUpdateLayer(d.id, { scale: Math.max(.05, d.startScale + (e.clientX - d.startX) / z / d.naturalWidth) });
    else onUpdateLayer(d.id, { rotation: Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180 / Math.PI + 90 });
  };
  const onPointerUp = () => { drag.current = null; setSnapLines({}); };

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

      {device.layers.map(l => { const group = l.groupId ? device.groups?.find(item => item.id === l.groupId) : undefined; if (!l.visible || group?.visible === false) return null;
        const layerStyle: React.CSSProperties = {
             position: 'absolute', left: l.x, top: l.y,
             transform: `rotate(${l.rotation || 0}deg) scale(${l.scale})`, transformOrigin: 'top left',
             opacity: l.opacity * (group?.opacity ?? 1), mixBlendMode: (group?.blend && group.blend !== 'normal' ? group.blend : l.blend) as any, filter: imageFilter(l.adjust),
             ...imageMaskStyle(l.mask || group?.mask),
             maxWidth: 'none', cursor: readOnly ? 'default' : 'move',
             outline: !readOnly && selectedIds.includes(l.id) ? `2px solid ${l.id === selectedId ? 'var(--pj-magenta,#D40055)' : 'var(--pj-cyan,#00DAF3)'}` : 'none',
             outlineOffset: 1,
        };
        const menu = props.layerContextBindings?.(l);
        const pointerDown = readOnly ? undefined : (e: React.PointerEvent<HTMLElement>) => { menu?.onPointerDown(e); onLayerPointerDown(e, l.id); };
        const pointerMove = menu?.onPointerMove as any, pointerUp = menu?.onPointerUp as any, pointerCancel = menu?.onPointerCancel as any;
        const contextMenu = readOnly ? undefined : (e: React.MouseEvent<HTMLElement>) => { select(l.id); if (menu) menu.onContextMenu(e); else { e.preventDefault(); e.stopPropagation(); props.onLayerContextMenu?.(e, l); } };
        if (l.mediaKind === 'VIDEO') return <video key={l.id} src={l.src} autoPlay muted loop playsInline onLoadedMetadata={e => { const video=e.currentTarget; setNaturalSize(s => ({ ...s, [l.id]: { w:video.videoWidth || l.intrinsicWidth || 1280, h:video.videoHeight || l.intrinsicHeight || 720 } })); }} onPointerDown={pointerDown as any} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onContextMenu={contextMenu as any} style={layerStyle}/>;
        if (l.mediaKind === 'LOTTIE') return <TelaLottieLayer key={l.id} layer={l} onReady={(w,h) => setNaturalSize(s => ({ ...s, [l.id]: { w,h } }))} onPointerDown={pointerDown as any} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onContextMenu={contextMenu as any} style={layerStyle}/>;
        return <img key={l.id} src={l.src} alt={l.name || ''} draggable={false} onLoad={e => { const image=e.currentTarget; setNaturalSize(s => ({ ...s, [l.id]: { w:image.naturalWidth, h:image.naturalHeight } })); }} onPointerDown={pointerDown as any} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onContextMenu={contextMenu as any} style={layerStyle}/>;
      })}

      {!readOnly && selectedIds.length === 1 && selected && naturalSize[selected.id] && (() => {
        const s = naturalSize[selected.id]; const w = s.w * selected.scale, h = s.h * selected.scale;
        return <div style={{ position: 'absolute', left: selected.x, top: selected.y, width: w, height: h, transform: `rotate(${selected.rotation || 0}deg)`, transformOrigin: 'top left', border: '1.5px solid var(--pj-magenta,#D40055)', pointerEvents: 'none', boxSizing: 'border-box' }}><div style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, background: '#fff', border: '1.5px solid var(--pj-magenta,#D40055)', cursor: 'nwse-resize', pointerEvents: 'auto' }} onPointerDown={e => onScalePointerDown(e, selected)}/><div style={{ position: 'absolute', left: '50%', top: -30, width: 1, height: 25, background: 'var(--pj-magenta,#D40055)' }}/><div style={{ position: 'absolute', left: 'calc(50% - 6px)', top: -38, width: 12, height: 12, borderRadius: '50%', background: '#fff', border: '1.5px solid var(--pj-magenta,#D40055)', cursor: 'grab', pointerEvents: 'auto' }} onPointerDown={e => onRotatePointerDown(e, selected)}/></div>;
      })()}
      {!readOnly && snapLines.x !== undefined && (
        <div style={{ position: 'absolute', left: snapLines.x, top: 0, bottom: 0, width: 1, borderLeft: '1px dashed var(--pj-cyan,#00DAF3)', pointerEvents: 'none', zIndex: 8 }}/>
      )}
      {!readOnly && snapLines.y !== undefined && (
        <div style={{ position: 'absolute', top: snapLines.y, left: 0, right: 0, height: 1, borderTop: '1px dashed var(--pj-cyan,#00DAF3)', pointerEvents: 'none', zIndex: 8 }}/>
      )}

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
          <input ref={fileRef} type="file" accept="image/*,video/*,.lottie,application/zip+dotlottie,application/vnd.lottie" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void addFromFile(f); e.target.value = ''; }} />
        </div>
      )}

      {/* Inline layers + adjustments panel — hidden when Studio hosts it. */}
      {chrome && !readOnly && (
        <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', top: 8, right: 8, zIndex: 4, width: 234, maxHeight: 'calc(100% - 16px)', overflowY: 'auto', padding: 12, background: 'rgba(18,13,28,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, backdropFilter: 'blur(8px)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }} className="custom-scrollbar">
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>Layers</div>
          {[...device.layers].reverse().map(l => (
            <ImageLayerRow
              key={l.id} layer={l} selected={l.id === selectedId}
               onSelect={event => selectMany((event.shiftKey || event.ctrlKey || event.metaKey) ? (selectedIds.includes(l.id) ? selectedIds.filter(id => id !== l.id) : [...selectedIds, l.id]) : [l.id])}
              onContextMenu={props.onLayerContextMenu ? e => { select(l.id); props.onLayerContextMenu?.(e, l); } : undefined}
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
  onSelect: (event: React.MouseEvent) => void;
  onToggle: () => void;
  onForward: () => void;
  onBack: () => void;
  onDelete: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}> = ({ layer, selected, onSelect, onToggle, onForward, onBack, onDelete, onContextMenu }) => (
  <div
    onClick={onSelect}
    onContextMenu={onContextMenu ? e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e); } : undefined}
    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', marginBottom: 3, borderRadius: 8, cursor: 'pointer', background: selected ? 'rgba(255,255,255,0.09)' : 'transparent', border: selected ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent' }}
  >
    {layer.mediaKind === 'LOTTIE' ? <span style={{ width:24,height:24,borderRadius:5,display:'grid',placeItems:'center',flex:'none',fontSize:8,fontWeight:900,color:'#00DAF3',background:'rgba(0,218,243,.12)' }}>LOT</span> : layer.mediaKind === 'VIDEO' ? <video src={layer.src} muted style={{ width:24,height:24,borderRadius:5,objectFit:'cover',flex:'none',opacity:layer.visible?1:.4 }}/> : <img src={layer.src} alt="" style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'cover', flex: 'none', opacity: layer.visible ? 1 : 0.4 }} draggable={false} />}
    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: layer.visible ? '#fff' : 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layer.name || 'Layer'}</span>
    {layer.groupId && <span title="Grouped layer" style={{ fontSize: 8, fontWeight: 900, color: 'var(--pj-cyan,#00DAF3)', border: '1px solid rgba(0,218,243,.35)', borderRadius: 4, padding: '1px 3px' }}>GRP</span>}
    {layer.mask?.enabled && (
      <span title="Layer mask" style={{ width: 13, height: 13, borderRadius: 3, background: 'linear-gradient(90deg,#000,#fff)', border: '1px solid rgba(255,255,255,.3)' }}/>
    )}
    <button title={layer.visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); onToggle(); }} style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
    <button title="Bring forward" onClick={e => { e.stopPropagation(); onForward(); }} style={{ display: 'grid', placeItems: 'center', width: 18, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><ChevronUp size={13} /></button>
    <button title="Send back" onClick={e => { e.stopPropagation(); onBack(); }} style={{ display: 'grid', placeItems: 'center', width: 18, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><ChevronDown size={13} /></button>
    <button title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ display: 'grid', placeItems: 'center', width: 20, height: 22, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}><Trash2 size={12} /></button>
  </div>
);

export default TelaImage;
