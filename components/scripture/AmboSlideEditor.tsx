// AmboSlideEditor — a real slide editor on the Tela document model.
//
// The slide is converted to a Tela document (services/ambo/telaSlide.ts: lossless two-way
// mapping, every layer kind preserved), edited with Tela ops (applyTelaOp), and written back
// as a FULL Slide on Done. The live preview is drawn by LayerRenderer — the very renderer the
// program/preview outputs use — from the slide the doc would save, so the canvas is exactly
// what the screens will show; the overlay on top only draws selection, handles and guides.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Check, Type, Image as ImageIcon, Film, Square, Circle, Minus, ArrowRight, Hexagon, Star, MousePointer2, Undo2, Redo2,
  ZoomIn, ZoomOut, Eye, EyeOff, Lock, Unlock, Copy, ClipboardPaste, Trash2, BringToFront, SendToBack, ChevronUp, ChevronDown, Group, Ungroup,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround, LayoutTemplate, Save, X, Clock, Timer, BookOpen, Music2, Sparkles, Scan, Plus,
  ListOrdered, Shapes, Layers, Link2, Palette, Pencil,
} from 'lucide-react';
import { applyTelaOp } from '../tela/telaOps';
import type { TelaDoc, TelaVectorObject } from '../../types';
import { applySlide, newId, type LayerContent, type LayerSlot, type Slide, type SlideLayer } from '../../services/ambo/showModel';
import { LayerRenderer } from '../../services/ambo/layerRenderer';
import {
  slideToTela, telaToSlide, sceneDevice, sceneObjects, amboRecord, isPromotable, isBackgroundObject,
  makeTextObject, makeShapeObject, makeImageObject, makeLayerObject, newObjId, ART_W, ART_H, FREEFORM_ID, layerLabel, type ShapeKind, type AmboLayerRecord,
} from '../../services/ambo/telaSlide';
import { FREEFORM_FIELD, encodeScene, decodeScene } from '../../services/ambo/slideTemplates/freeform';
import {
  snapMove, resizeBox, toLocalDelta, fixRotatedOrigin, alignBoxes, distributeBoxes, unionBox, fitScale, safeAreas,
  type AlignMode, type Box, type Guide, type Handle,
} from '../../services/ambo/slideEditorGeometry';
import { ensureFontsForObjects, fontCss } from '../../services/tela/telaFonts';
import { classifyFile } from '../../services/ambo/mediaLibrary';
import { thumbFromCanvas } from '../../services/ambo/templateLibrary';
import { AmboSlideTemplateGallery } from './AmboSlideTemplateGallery';
import { AmboSaveTemplateDialog, type TemplatePayload } from './AmboSaveTemplateDialog';
import { AmboSlideEditorInspector, type BackgroundInfo, type BackgroundSpec, type Patch } from './AmboSlideEditorInspector';

interface AmboSlideEditorProps {
  slide: Slide;
  boundRef?: string | null;
  /** Receives the FULL edited slide (all layers, styles, geometry). */
  onSave: (slide: Slide) => void;
  onClose: () => void;
}

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const CYAN = '#00DAF3';
const LILAC = '#D0BCFF';
const line = 'rgba(255,255,255,0.09)';
const line2 = 'rgba(255,255,255,0.15)';

interface Hist { doc: TelaDoc; past: TelaDoc[]; future: TelaDoc[] }

// ── small toolbar parts (module level so they keep identity across renders) ──
const tb = 'h-8 min-w-8 px-2 grid place-items-center rounded-md text-white/75 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-[12px]';
const Btn: React.FC<{ title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; active?: boolean }> = ({ title, onClick, disabled, children, active }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} aria-pressed={active} className={tb} style={active ? { background: 'rgba(208,188,255,.22)', color: '#fff' } : undefined}>{children}</button>
);
const Sep = () => <span className="w-px h-5 mx-1 flex-none" style={{ background: line }} aria-hidden />;
const MenuCtx = React.createContext<{ menu: string | null; setMenu: (m: string | null) => void }>({ menu: null, setMenu: () => {} });
const MenuBtn: React.FC<{ id: string; title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ id, title, icon, children }) => {
  const { menu, setMenu } = React.useContext(MenuCtx);
  return (
    <div className="relative" onPointerDown={e => e.stopPropagation()}>
      <button type="button" title={title} aria-label={title} aria-haspopup="menu" aria-expanded={menu === id} onClick={() => setMenu(menu === id ? null : id)} className={`${tb} gap-1 flex items-center`} style={menu === id ? { background: 'rgba(208,188,255,.22)' } : undefined}>{icon}<ChevronDown size={11} className="opacity-50" /></button>
      {menu === id && <div role="menu" className="absolute left-0 top-9 z-50 min-w-[170px] rounded-lg p-1 shadow-2xl" style={{ background: 'rgba(16,13,28,.98)', border: `1px solid ${line2}` }}>{children}</div>}
    </div>
  );
};
const Item: React.FC<{ onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ onClick, icon, children }) => {
  const { setMenu } = React.useContext(MenuCtx);
  return <button type="button" role="menuitem" onClick={() => { setMenu(null); onClick(); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-[12px] text-white/80 hover:bg-white/10 hover:text-white">{icon}{children}</button>;
};

const FULL_BOX = { x: 0, y: 0, w: ART_W, h: ART_H };
const isFullFrame = (o: TelaVectorObject) => o.w >= ART_W - 1 && o.h >= ART_H - 1 && Math.abs(o.x) < 2 && Math.abs(o.y) < 2;
/** Engine-rendered layer objects scale the whole picture into their box: keep them 16:9. */
const isEngineLayer = (o: TelaVectorObject) => { const r = amboRecord(o); return !!r && r.kind === 'layer' && !isPromotable(r.layer); };

function iconFor(o: TelaVectorObject): React.ReactNode {
  const r = amboRecord(o);
  const k = r && r.kind === 'layer' ? r.layer.content.kind : o.kind;
  const s = 13;
  switch (k) {
    case 'TEXT': return <Type size={s} />;
    case 'IMAGE': return <ImageIcon size={s} />;
    case 'VIDEO': case 'LIVE': return <Film size={s} />;
    case 'ELLIPSE': return <Circle size={s} />;
    case 'LINE': return <Minus size={s} />;
    case 'PATH': return <Hexagon size={s} />;
    case 'AUDIO': return <Music2 size={s} />;
    case 'LYRICS': return <Music2 size={s} />;
    case 'SCRIPTURE': return <BookOpen size={s} />;
    case 'TIMER': return <Timer size={s} />;
    case 'CLOCK': return <Clock size={s} />;
    case 'LOTTIE': case 'GENERATOR': case 'SHADER': return <Sparkles size={s} />;
    case 'TELA_TEMPLATE': return <LayoutTemplate size={s} />;
    default: return (o as any).live ? <Clock size={s} /> : <Square size={s} />;
  }
}

/** Keep a LINE's points in step with its box; leave everything else alone. */
const normalize = (o: TelaVectorObject): TelaVectorObject => o.kind === 'LINE' ? { ...o, points: [o.x, o.y, o.x + o.w, o.y + o.h] } : o;

const nameOf = (o: TelaVectorObject) => o.objectLabel || (o.kind === 'TEXT' ? (o.text || 'Text').split('\n')[0].slice(0, 28) : o.kind.toLowerCase());

export default function AmboSlideEditor({ slide, boundRef, onSave, onClose }: AmboSlideEditorProps) {
  // ── document + history (Tela doc is immutable, so a snapshot stack is cheap and exact) ──
  const [hist, setHist] = useState<Hist>(() => { const d = slideToTela(slide); return { doc: d, past: [], future: [] }; });
  const histRef = useRef(hist); histRef.current = hist;
  const lastKey = useRef<{ key: string; t: number } | null>(null);
  const gesture = useRef<{ startDoc: TelaDoc } | null>(null);
  const doc = hist.doc;
  const deviceId = sceneDevice(doc)!.id;
  const objects = sceneObjects(doc);
  const objectsRef = useRef(objects); objectsRef.current = objects;
  const dirty = hist.past.length > 0;

  const commit = useCallback((next: TelaDoc, key?: string) => {
    const h = histRef.current;
    if (next === h.doc) return;
    const now = Date.now();
    const merge = !!key && lastKey.current?.key === key && now - lastKey.current.t < 900;
    lastKey.current = key ? { key, t: now } : null;
    const nh: Hist = merge ? { ...h, doc: next, future: [] } : { doc: next, past: [...h.past.slice(-99), h.doc], future: [] };
    histRef.current = nh; setHist(nh);
  }, []);
  const beginGesture = () => { const h = histRef.current; lastKey.current = null; gesture.current = { startDoc: h.doc }; };
  const gestureSet = (next: TelaDoc) => {
    const h = histRef.current, g = gesture.current; if (!g) return;
    const nh: Hist = h.past[h.past.length - 1] === g.startDoc ? { ...h, doc: next } : { doc: next, past: [...h.past.slice(-99), g.startDoc], future: [] };
    histRef.current = nh; setHist(nh);
  };
  const endGesture = () => { gesture.current = null; setGuides([]); };
  const undo = () => { const h = histRef.current; if (!h.past.length) return; lastKey.current = null; const nh = { doc: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.doc, ...h.future] }; histRef.current = nh; setHist(nh); };
  const redo = () => { const h = histRef.current; if (!h.future.length) return; lastKey.current = null; const nh = { doc: h.future[0], past: [...h.past, h.doc], future: h.future.slice(1) }; histRef.current = nh; setHist(nh); };

  // ── selection ──
  const [sel, setSelState] = useState<string[]>([]);
  const selRef = useRef(sel);
  const setSel = (ids: string[]) => { selRef.current = ids; setSelState(ids); };
  const byId = useMemo(() => new Map(objects.map(o => [o.id, o])), [objects]);
  const selected = sel.map(id => byId.get(id)).filter((o): o is TelaVectorObject => !!o);
  const expandGroup = (ids: string[]) => {
    const groups = new Set(ids.map(id => objectsRef.current.find(o => o.id === id)?.groupId).filter(Boolean));
    return [...new Set([...ids, ...objectsRef.current.filter(o => o.groupId && groups.has(o.groupId)).map(o => o.id)])];
  };

  // ── doc operations (all through Tela ops) ──
  const updateObjs = useCallback((ids: string[], patch: Patch, key?: string) => {
    let d = histRef.current.doc;
    const dev = sceneDevice(d)!;
    for (const id of ids) {
      const o = dev.objects.find(x => x.id === id); if (!o) continue;
      const p = typeof patch === 'function' ? patch(o) : patch;
      const merged = normalize({ ...o, ...p });
      d = applyTelaOp(d, { type: 'UPDATE_VECTOR_OBJECT', deviceId: dev.id, objectId: id, patch: merged.kind === 'LINE' ? { ...p, points: merged.points } : p });
    }
    commit(d, key);
  }, [commit]);

  const setLayerContent = useCallback((id: string, fn: (c: LayerContent) => LayerContent, key?: string) => {
    const o = objectsRef.current.find(x => x.id === id); const r = o && amboRecord(o); if (!o || !r) return;
    const rec: AmboLayerRecord = { ...r, layer: { ...r.layer, content: fn(r.layer.content) } };
    updateObjs([id], { amboLayer: rec, objectLabel: layerLabel(rec.layer) === layerLabel(r.layer) ? o.objectLabel : layerLabel(rec.layer) }, key ?? `lc_${id}`);
  }, [updateObjs]);

  const addObjects = useCallback((news: TelaVectorObject[], at?: number) => {
    let d = histRef.current.doc; const dev = sceneDevice(d)!;
    if (at !== undefined) {
      const arr = [...dev.objects]; arr.splice(at, 0, ...news);
      d = applyTelaOp(d, { type: 'REPLACE_VECTOR_OBJECTS', deviceId: dev.id, objects: arr });
    } else for (const o of news) d = applyTelaOp(d, { type: 'ADD_VECTOR_OBJECT', deviceId: dev.id, object: o });
    commit(d); setSel(news.map(n => n.id));
  }, [commit]);

  const deleteIds = useCallback((ids: string[]) => {
    let d = histRef.current.doc; const dev = sceneDevice(d)!;
    for (const id of ids) d = applyTelaOp(d, { type: 'DELETE_VECTOR_OBJECT', deviceId: dev.id, objectId: id });
    commit(d); setSel([]);
  }, [commit]);

  const reorder = (ids: string[], how: 'front' | 'back' | 'up' | 'down') => {
    let d = histRef.current.doc; const dev = sceneDevice(d)!;
    const order = [...ids].sort((a, b) => dev.objects.findIndex(o => o.id === a) - dev.objects.findIndex(o => o.id === b));
    const list = how === 'front' || how === 'up' ? order.reverse() : order;
    for (const id of list) {
      const cur = sceneDevice(d)!.objects; const i = cur.findIndex(o => o.id === id);
      const to = how === 'front' ? cur.length - 1 : how === 'back' ? 0 : how === 'up' ? Math.min(cur.length - 1, i + 1) : Math.max(0, i - 1);
      if (to !== i) d = applyTelaOp(d, { type: 'REORDER_VECTOR_OBJECT', deviceId: dev.id, objectId: id, toIndex: to });
    }
    commit(d);
  };

  // ── clipboard / duplicate ──
  const clip = useRef<TelaVectorObject[]>([]);
  const cloneForPaste = (o: TelaVectorObject, off: number): TelaVectorObject => {
    const id = newObjId('dup'); const r = amboRecord(o);
    const next: TelaVectorObject = { ...o, id, x: o.x + off, y: o.y + off, ...(o.kind === 'LINE' ? { points: [o.x + off, o.y + off, o.x + o.w + off, o.y + o.h + off] } : {}), locked: false };
    if (r) {
      const layer: SlideLayer = { ...r.layer, id: newId('ly'), telaDeviceId: id };
      next.amboLayer = { kind: r.kind, layer, index: 1e6 + Math.floor(Math.random() * 1e5) } satisfies AmboLayerRecord;   // a copy is always a new layer
      // an expanded freeform member becomes a plain native object when copied
      if (r.kind === 'scene') delete next.amboLayer;
    }
    return next;
  };
  const copy = () => { clip.current = selected.filter(o => !isBackgroundObject(o)); };
  const paste = () => { if (clip.current.length) { clip.current = clip.current.map(o => ({ ...o })); addObjects(clip.current.map(o => cloneForPaste(o, 28))); } };
  const duplicate = () => { const s = selected.filter(o => !isBackgroundObject(o)); if (s.length) addObjects(s.map(o => cloneForPaste(o, 28))); };

  // ── live preview: the real renderer ──
  const compiled = useMemo(() => telaToSlide(doc, slide), [doc, slide]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayerRenderer | null>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const r = new LayerRenderer(c, { w: 1280, h: 720 });
    r.setOptions({ audioEnabled: false });
    r.start(); rendererRef.current = r;
    return () => { r.dispose(); rendererRef.current = null; };
  }, []);
  useEffect(() => {
    ensureFontsForObjects(objects.filter(o => o.kind === 'TEXT'));
    rendererRef.current?.setStack(applySlide({}, compiled, Date.now()));
  }, [compiled]);

  // ── stage geometry ──
  const stageWrap = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 900, h: 560 });
  const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');
  const scale = zoomMode === 'fit' ? fitScale(view.w, view.h, ART_W, ART_H, 28) : zoomMode;
  const scaleRef = useRef(scale); scaleRef.current = scale;
  useEffect(() => {
    const el = stageWrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setView({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const toArt = (cx: number, cy: number) => { const r = stageRef.current!.getBoundingClientRect(); return { x: (cx - r.left) / scaleRef.current, y: (cy - r.top) / scaleRef.current }; };
  const zoomBy = (f: number) => setZoomMode(Math.max(0.1, Math.min(4, scale * f)));

  const [guides, setGuides] = useState<Guide[]>([]);
  const [safe, setSafe] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastT = useRef(0);
  const say = (m: string) => { setToast(m); window.clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(''), 3200); };
  const [label, setLabel] = useState(slide.label ?? '');
  const labelDirty = label !== (slide.label ?? '');

  // ── gestures ──
  const visibleOthers = (exclude: string[]) => objectsRef.current.filter(o => !exclude.includes(o.id) && !o.hidden && !isBackgroundObject(o) && !isFullFrame(o)).map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }));

  const startMove = (e: React.PointerEvent, ids: string[]) => {
    const movable = ids.map(id => objectsRef.current.find(o => o.id === id)).filter((o): o is TelaVectorObject => !!o && !o.locked && !isBackgroundObject(o));
    if (!movable.length) return;
    const sx = e.clientX, sy = e.clientY;
    const startBox = unionBox(movable.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })));
    const others = visibleOthers(ids);
    const sa = safeAreas().title;
    let begun = false; const baseObjs = objectsRef.current;
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - sx) / scaleRef.current, dy = (ev.clientY - sy) / scaleRef.current;
      if (!begun) { if (Math.hypot(dx, dy) * scaleRef.current < 3) return; begun = true; beginGesture(); }
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (!ev.altKey) {
        const s = snapMove({ ...startBox, x: startBox.x + dx, y: startBox.y + dy }, others, ART_W, ART_H, 8 / scaleRef.current, safe ? [sa.x, sa.x + sa.w] : [], safe ? [sa.y, sa.y + sa.h] : []);
        dx += s.dx; dy += s.dy; setGuides(s.guides);
      } else setGuides([]);
      const idset = new Set(movable.map(m => m.id));
      const next = baseObjs.map(o => idset.has(o.id) ? normalize({ ...o, x: o.x + dx, y: o.y + dy }) : o);
      gestureSet(applyTelaOp(histRef.current.doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId, objects: next }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (begun) endGesture(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const startResize = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation(); e.preventDefault();
    const targets = selRef.current.map(id => objectsRef.current.find(o => o.id === id)).filter((o): o is TelaVectorObject => !!o && !o.locked);
    if (!targets.length) return;
    const sx = e.clientX, sy = e.clientY; const baseObjs = objectsRef.current;
    const single = targets.length === 1 ? targets[0] : null;
    const startBox: Box = single ? { x: single.x, y: single.y, w: single.w, h: single.h } : unionBox(targets.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })));
    const rot = single?.rotation || 0;
    const lock = !!single && isEngineLayer(single);
    beginGesture();
    const move = (ev: PointerEvent) => {
      const d = toLocalDelta((ev.clientX - sx) / scaleRef.current, (ev.clientY - sy) / scaleRef.current, rot);
      let nb = resizeBox(startBox, handle, d.dx, d.dy, { keepAspect: ev.shiftKey || lock || (!single && true), fromCenter: ev.altKey });
      if (!ev.altKey) nb = fixRotatedOrigin(startBox, nb, rot, handle);
      const idset = new Set(targets.map(t => t.id));
      const kx = nb.w / startBox.w, ky = nb.h / startBox.h;
      const next = baseObjs.map(o => {
        if (!idset.has(o.id)) return o;
        if (single) return normalize({ ...o, x: nb.x, y: nb.y, w: nb.w, h: single.kind === 'LINE' && !startBox.h ? 0 : nb.h });
        return normalize({ ...o, x: nb.x + (o.x - startBox.x) * kx, y: nb.y + (o.y - startBox.y) * ky, w: o.w * kx, h: o.h * ky, ...(o.fontSize ? { fontSize: o.fontSize * Math.min(kx, ky) } : {}) });
      });
      gestureSet(applyTelaOp(histRef.current.doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId, objects: next }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); endGesture(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const startRotate = (e: React.PointerEvent, o: TelaVectorObject) => {
    e.stopPropagation(); e.preventDefault();
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2; const baseObjs = objectsRef.current;
    beginGesture();
    const move = (ev: PointerEvent) => {
      const p = toArt(ev.clientX, ev.clientY);
      let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15; else if (Math.abs(((a % 90) + 90) % 90) < 2 || Math.abs(((a % 90) + 90) % 90 - 90) < 2) a = Math.round(a / 90) * 90;
      a = Math.round(a * 10) / 10; if (a > 180) a -= 360;
      gestureSet(applyTelaOp(histRef.current.doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId, objects: baseObjs.map(x => x.id === o.id ? { ...x, rotation: a } : x) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); endGesture(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const onObjPointerDown = (e: React.PointerEvent, o: TelaVectorObject) => {
    e.stopPropagation();
    stageRef.current?.focus({ preventScroll: true });
    if (editing === o.id) return;
    let ids = selRef.current;
    if (e.shiftKey) { ids = ids.includes(o.id) ? ids.filter(i => i !== o.id) : [...ids, ...expandGroup([o.id])]; setSel(ids); return; }
    if (!ids.includes(o.id)) { ids = expandGroup([o.id]); setSel(ids); }
    startMove(e, ids);
  };

  // ── adding things ──
  const center = (w: number, h: number) => ({ x: Math.round((ART_W - w) / 2), y: Math.round((ART_H - h) / 2) });
  const addText = (over: Partial<TelaVectorObject> = {}) => {
    const o = makeTextObject({ ...center(1200, 280), fontFamily: fontCss('inter'), ...over });
    addObjects([o]);
  };
  const addShape = (k: ShapeKind) => { setMenu(null); const w = k === 'line' ? 800 : k === 'arrow' ? 600 : 560, h = k === 'line' ? 0 : k === 'arrow' ? 260 : 360; const c = center(w, h); addObjects([makeShapeObject(k, k === 'line' ? { x: c.x, y: c.y, w, h, points: [c.x, c.y, c.x + w, c.y] } : { ...c, w, h })]); };
  const addList = (kind: 'bullet' | 'number') => addText({ ...center(1100, 460), w: 1100, h: 460, textAlign: 'left', vAlign: 'top', fontSize: 64, fontWeight: 600, lineHeight: 1.35, text: kind === 'bullet' ? '• First point\n• Second point\n• Third point' : '1. First point\n2. Second point\n3. Third point', objectLabel: 'List' });
  const addLyrics = () => addText({ ...center(1400, 520), w: 1400, h: 520, fontSize: 84, fontWeight: 600, lineHeight: 1.3, text: 'Amazing grace, how sweet the sound\nThat saved a wretch like me', objectLabel: 'Lyrics' });
  const addClock = () => { const c = center(700, 200); const o = makeTextObject({ ...c, w: 700, h: 200, fontSize: 150, fontWeight: 700, fontFamily: fontCss('spaceGrotesk'), objectLabel: 'Clock', text: undefined, autoFit: false }); (o as any).live = { drawer: 'ambo-clock', props: { format: '12h' } }; o.kind = 'RECT'; o.fill = '#ffffff'; addObjects([o]); };
  const addTimer = () => { const c = center(700, 200); const o = makeTextObject({ ...c, w: 700, h: 200, fontSize: 150, fontWeight: 700, fontFamily: fontCss('spaceGrotesk'), objectLabel: 'Timer', text: undefined, autoFit: false }); (o as any).live = { drawer: 'ambo-timer', props: { seconds: 300, mode: 'down' } }; o.kind = 'RECT'; o.fill = '#ffffff'; addObjects([o]); };

  const usedSlots = () => new Set(objectsRef.current.map(o => amboRecord(o)).filter(Boolean).map(r => r!.layer.slot));
  const freeSlot = (cands: LayerSlot[]): LayerSlot | null => { const u = usedSlots(); return cands.find(s => !u.has(s)) ?? null; };
  const addEngineLayer = (content: LayerContent, cands: LayerSlot[], box: Box, name: string): boolean => {
    const slot = freeSlot(cands);
    if (!slot) { say(`Every layer slot for ${name.toLowerCase()} is already used on this slide. Delete or replace the existing one.`); return false; }
    addObjects([makeLayerObject(content, slot, box, name)]); return true;
  };
  const vbox = (): Box => ({ ...center(960, 540), w: 960, h: 540 });
  const addScripture = () => addEngineLayer({ kind: 'SCRIPTURE', refId: 'John 3:16', reference: 'John 3:16', translation: 'KJV', lines: ['For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'] }, ['scripture'], FULL_BOX, 'Scripture');
  const addLottie = async () => { const u = await pickFile('.json,.lottie,application/json'); if (u) addEngineLayer({ kind: 'LOTTIE', src: u, loop: true }, ['prop', 'overlay', 'fill'], vbox(), 'Lottie'); };

  const addImageFromUrl = (src: string, at?: { x: number; y: number }) => {
    const place = (nw: number, nh: number) => {
      const k = Math.min(1000 / nw, 700 / nh, 1), w = Math.round(nw * k), h = Math.round(nh * k);
      const c = at ? { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) } : center(w, h);
      addObjects([makeImageObject(src, { ...c, w, h, imageFit: 'cover' })]);
    };
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => place(im.naturalWidth || 1000, im.naturalHeight || 700); im.onerror = () => place(1000, 700);
    im.src = src;
  };
  const addVideoFromUrl = (src: string) => addEngineLayer({ kind: 'VIDEO', src, loop: true, muted: true }, ['fill', 'overlay', 'prop'], vbox(), 'Video');

  const readFile = (f: File): Promise<string> => new Promise(res => {
    // Small images are inlined so they survive a save/reload; everything else is a session URL.
    if (f.type.startsWith('image/') && f.size < 3_000_000) { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(URL.createObjectURL(f)); r.readAsDataURL(f); }
    else res(URL.createObjectURL(f));
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const pickFile = useCallback((accept: string) => new Promise<string | null>(resolve => {
    const inp = fileInput.current; if (!inp) return resolve(null);
    inp.accept = accept; inp.value = '';
    const done = () => { inp.onchange = null; };
    inp.onchange = async () => { const f = inp.files?.[0]; done(); resolve(f ? await readFile(f) : null); };
    inp.click();
  }), []);
  const addImage = async () => { const u = await pickFile('image/*'); if (u) addImageFromUrl(u); };
  const addVideo = async () => { const u = await pickFile('video/*'); if (u) addVideoFromUrl(u); };

  const handleItem = (item: { kind: string; src?: string; mode?: string; name?: string }, at?: { x: number; y: number }) => {
    if (item.kind === 'IMAGE' && item.src) addImageFromUrl(item.src, at);
    else if (item.kind === 'VIDEO' && item.src) addVideoFromUrl(item.src);
    else if (item.kind === 'LOTTIE' && item.src) addEngineLayer({ kind: 'LOTTIE', src: item.src, loop: true }, ['prop', 'overlay', 'fill'], vbox(), 'Lottie');
    else if (item.kind === 'AUDIO' && item.src) addEngineLayer({ kind: 'AUDIO', src: item.src, volume: 1 }, ['audio', 'overlay'], FULL_BOX, item.name || 'Audio');
    else if (item.kind === 'GENERATOR') setBackground({ type: 'content', content: { kind: 'GENERATOR', mode: item.mode || 'STUDIO_AURORA' } });
    else if (item.kind === 'SHADER') setBackground({ type: 'content', content: { kind: 'SHADER', src: item.mode || item.src || '' } });
    else say('That source cannot be placed on a slide.');
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const at = toArt(e.clientX, e.clientY);
    const json = e.dataTransfer.getData('application/json');
    if (json) { try { const p = JSON.parse(json); if (p.type === 'ambo-source' && p.source) { handleItem(p.source, at); return; } if (p.type === 'ambo-audio' && p.track) { handleItem({ kind: 'AUDIO', src: p.track.url, name: p.track.title }); return; } } catch { /* fall through to files */ } }
    for (const f of Array.from(e.dataTransfer.files || [])) {
      const kind = classifyFile(f.name, f.type);
      if (kind === 'IMAGE' || kind === 'VIDEO' || kind === 'LOTTIE' || kind === 'AUDIO') handleItem({ kind, src: await readFile(f), name: f.name }, at);
      else say(`Cannot place “${f.name}” on a slide.`);
    }
  };

  // ── background ──
  const bgObjs = objects.filter(isBackgroundObject);
  const background: BackgroundInfo = useMemo(() => {
    const b = bgObjs[0]; if (!b) return { label: 'None (black)', type: 'none' };
    const r = amboRecord(b);
    if (r) { const k = r.layer.content.kind; return { label: layerLabel(r.layer), type: k === 'IMAGE' ? 'image' : k === 'VIDEO' ? 'video' : k === 'GENERATOR' ? 'generator' : k === 'SHADER' ? 'shader' : k === 'LIVE' ? 'live' : 'other' }; }
    return b.gradient ? { label: 'Gradient', type: 'gradient' } : { label: `Solid ${b.fill}`, type: 'solid', color: b.fill };
  }, [objects]);
  function setBackground(spec: BackgroundSpec) {
    let list = objectsRef.current.filter(o => !isBackgroundObject(o));
    let ground: TelaVectorObject | null = null;
    if (spec.type === 'solid') ground = makeShapeObject('rect', { ...FULL_BOX, fill: spec.color, objectLabel: 'Background', templateRole: 'GROUND', locked: true });
    else if (spec.type === 'gradient') ground = makeShapeObject('rect', { ...FULL_BOX, fill: spec.from, objectLabel: 'Background', templateRole: 'GROUND', locked: true, gradient: { kind: 'LINEAR', angle: spec.angle, stops: [{ offset: 0, color: spec.from }, { offset: 1, color: spec.to }] } });
    else if (spec.type === 'content') ground = makeLayerObject(spec.content, 'background', FULL_BOX, 'Background');
    if (ground) list = [ground, ...list];
    commit(applyTelaOp(histRef.current.doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId, objects: list }), 'bg');
  }

  // ── templates ──
  const applyTemplate = (tpl: Slide) => {
    const layer = tpl.layers[0]; if (!layer) return;
    const keep = objectsRef.current.filter(o => {
      const r = amboRecord(o);
      if (isBackgroundObject(o)) return layer.slot !== 'background';
      if (!r) return false;                                      // native design objects are replaced by the template
      if (r.kind === 'scene') return false;
      if (r.layer.slot === layer.slot) return false;
      return !(r.layer.content.kind === 'TEXT' && r.layer.slot === 'slide');
    });
    const o = makeLayerObject(layer.content, layer.slot, FULL_BOX, layer.name || 'Template');
    (o.amboLayer as AmboLayerRecord).layer = { ...(o.amboLayer as AmboLayerRecord).layer, name: layer.name };
    const next = layer.slot === 'background' ? [o, ...keep] : [...keep, o];
    commit(applyTelaOp(histRef.current.doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId, objects: next }));
    setSel([o.id]); setGalleryOpen(false); say('Template applied to this slide — pick it in Layers to edit its text.');
  };

  const buildTemplatePayload = async (): Promise<TemplatePayload> => {
    const slideNow = telaToSlide(histRef.current.doc, slide);
    const tl = slideNow.layers.find(l => l.content.kind === 'TELA_TEMPLATE');
    if (!tl || tl.content.kind !== 'TELA_TEMPLATE') throw new Error('Add some text, shapes or a template first.');
    let thumb: string | undefined;
    try { if (canvasRef.current) thumb = thumbFromCanvas(canvasRef.current); } catch { /* thumbnails are optional */ }
    return { baseTemplateId: tl.content.templateId, theme: tl.content.theme, fields: { ...tl.content.fields }, thumb };
  };

  // ── list helper (bullets / numbers on the selected text objects) ──
  const listify = (mode: 'bullet' | 'number' | 'none') => {
    updateObjs(selRef.current, o => {
      if (o.kind !== 'TEXT') return {};
      const rows = (o.text ?? '').split('\n').map(r => r.replace(/^\s*(?:[•\-*]|\d+[.)])\s+/, ''));
      return { text: rows.map((r, i) => mode === 'bullet' ? `• ${r}` : mode === 'number' ? `${i + 1}. ${r}` : r).join('\n') };
    });
  };

  // ── align / distribute ──
  const align = (m: AlignMode) => {
    const s = selected.filter(o => !isBackgroundObject(o)); if (!s.length) return;
    const pos = alignBoxes(s.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })), m, ART_W, ART_H);
    const map = new Map(s.map((o, i) => [o.id, pos[i]]));
    commit(applyTelaOp(histRef.current.doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId, objects: objectsRef.current.map(o => map.has(o.id) ? normalize({ ...o, ...map.get(o.id)! }) : o) }));
  };
  const distribute = (axis: 'x' | 'y') => {
    const s = selected.filter(o => !isBackgroundObject(o)); if (s.length < 3) { say('Select three or more objects to distribute.'); return; }
    const pos = distributeBoxes(s.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })), axis);
    const map = new Map(s.map((o, i) => [o.id, pos[i]]));
    commit(applyTelaOp(histRef.current.doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId, objects: objectsRef.current.map(o => map.has(o.id) ? normalize({ ...o, ...map.get(o.id)! }) : o) }));
  };
  const group = () => { if (selected.length < 2) return; const g = newObjId('grp'); updateObjs(sel, { groupId: g }); };
  const ungroup = () => updateObjs(sel, { groupId: undefined });

  // ── save / cancel ──
  const save = () => {
    const out = telaToSlide(histRef.current.doc, slide);
    onSave(labelDirty ? { ...out, label } : out);
    onClose();
  };
  const cancel = () => {
    if ((dirty || labelDirty) && !window.confirm('Discard your changes to this slide?')) return;
    onClose();
  };

  // ── keyboard ──
  const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (galleryOpen || saveTplOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      if (typing(e.target)) { if (e.key === 'Escape' && editing) { setEditing(null); e.preventDefault(); } else if (mod && e.key === 'Enter' && editing) setEditing(null); return; }
      const ids = selRef.current;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(); }
      else if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copy(); if (ids.length) deleteIds(ids); }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
      else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroup() : group(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(objectsRef.current.filter(o => !isBackgroundObject(o)).map(o => o.id)); }
      else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.2); }
      else if (mod && e.key === '-') { e.preventDefault(); zoomBy(1 / 1.2); }
      else if (mod && e.key === '0') { e.preventDefault(); setZoomMode('fit'); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) { e.preventDefault(); deleteIds(ids); }
      else if (e.key === 'Escape') { if (menu) setMenu(null); else if (ids.length) setSel([]); else cancel(); }
      else if (e.key === 'Enter' && ids.length === 1 && objectsRef.current.find(o => o.id === ids[0])?.kind === 'TEXT') { e.preventDefault(); setEditing(ids[0]); }
      else if (e.key.startsWith('Arrow') && ids.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        updateObjs(ids.filter(id => { const o = objectsRef.current.find(x => x.id === id); return o && !o.locked && !isBackgroundObject(o); }), o => ({ x: o.x + dx, y: o.y + dy }), 'nudge');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── render ──
  const editingObj = editing ? byId.get(editing) : undefined;
  const single = selected.length === 1 ? selected[0] : null;
  const selBox: Box | null = selected.length ? unionBox(selected.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }))) : null;
  const hs = 12 / scale;
  const HANDLES: Array<{ h: Handle; x: number; y: number; cur: string }> = [
    { h: 'nw', x: 0, y: 0, cur: 'nwse-resize' }, { h: 'n', x: .5, y: 0, cur: 'ns-resize' }, { h: 'ne', x: 1, y: 0, cur: 'nesw-resize' }, { h: 'e', x: 1, y: .5, cur: 'ew-resize' },
    { h: 'se', x: 1, y: 1, cur: 'nwse-resize' }, { h: 's', x: .5, y: 1, cur: 'ns-resize' }, { h: 'sw', x: 0, y: 1, cur: 'nesw-resize' }, { h: 'w', x: 0, y: .5, cur: 'ew-resize' },
  ];
  const canTransform = selected.length > 0 && selected.every(o => !o.locked && !isBackgroundObject(o));
  const layersTop = [...objects].reverse();
  const hasSel = selected.length > 0;

  return (
    <div className="fixed inset-0 z-[130] flex flex-col text-white" style={{ background: '#08060f' }} role="dialog" aria-label="Slide editor" onPointerDown={() => menu && setMenu(null)}>
      <input ref={fileInput} type="file" className="hidden" aria-hidden tabIndex={-1} />

      {/* ROW 1 — document */}
      <header className="flex items-center gap-1.5 px-3 py-2 border-b backdrop-blur-xl flex-none flex-wrap" style={{ borderColor: line, background: 'rgba(10,7,17,0.72)' }} role="toolbar" aria-label="Slide">
        <button type="button" onClick={cancel} className="flex items-center gap-1 px-2.5 h-8 rounded-lg text-[12px] font-medium text-white/70 hover:text-white hover:bg-white/5" title="Cancel — discard changes (Esc)"><ChevronLeft size={15} /> Cancel</button>
        <Sep />
        <div className="text-[12px] font-bold truncate max-w-[220px]" title={label || 'Slide'}>{label || 'Slide'}</div>
        {boundRef && <span className="ml-1 inline-flex items-center gap-1 font-mono text-[10.5px] font-bold px-1.5 py-0.5 rounded" style={{ color: '#04222a', background: CYAN }}><Link2 size={10} />{boundRef}</span>}
        <Sep />
        <Btn title="Undo (Ctrl+Z)" onClick={undo} disabled={!hist.past.length}><Undo2 size={15} /></Btn>
        <Btn title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!hist.future.length}><Redo2 size={15} /></Btn>
        <Sep />
        <Btn title="Zoom out" onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={15} /></Btn>
        <button type="button" className={`${tb} w-14 font-mono`} title="Fit to window (Ctrl+0)" onClick={() => setZoomMode('fit')}>{Math.round(scale * 100)}%</button>
        <Btn title="Zoom in" onClick={() => zoomBy(1.2)}><ZoomIn size={15} /></Btn>
        <Btn title="Show safe areas (title 90% / action 93%)" onClick={() => setSafe(s => !s)} active={safe}><Scan size={15} /></Btn>
        <div className="flex-1" />
        <button type="button" onClick={() => setGalleryOpen(true)} className="h-8 px-3 rounded-lg text-[12px] font-bold flex items-center gap-1.5 hover:bg-white/10" style={{ color: LILAC, border: '1px solid rgba(208,188,255,.25)' }} title="Apply a slide template to this slide"><LayoutTemplate size={14} />Templates</button>
        <button type="button" onClick={() => setSaveTplOpen(true)} className="h-8 px-3 rounded-lg text-[12px] font-bold flex items-center gap-1.5 hover:bg-white/10" style={{ color: LILAC, border: '1px solid rgba(208,188,255,.25)' }} title="Save this design as one of your templates"><Save size={14} />Save as template</button>
        <button type="button" onClick={save} className="h-8 px-5 rounded-lg text-white font-bold text-[13px] flex items-center gap-1.5" style={{ background: BRAND, boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }} title="Save the slide (Ctrl+S)"><Check size={15} /> Done</button>
      </header>

      {/* ROW 2 — insert + arrange */}
      <MenuCtx.Provider value={{ menu, setMenu }}>
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b flex-none flex-wrap" style={{ borderColor: line, background: 'rgba(0,0,0,0.18)' }} role="toolbar" aria-label="Tools">
        <Btn title="Select (Esc)" onClick={() => setSel([])} active={!hasSel}><MousePointer2 size={15} /></Btn>
        <Btn title="Add text" onClick={() => addText()}><Type size={15} /></Btn>
        <MenuBtn id="shapes" title="Add a shape" icon={<Shapes size={15} />}>
          <Item onClick={() => addShape('rect')} icon={<Square size={14} />}>Rectangle</Item>
          <Item onClick={() => addShape('rounded')} icon={<Square size={14} className="rounded" />}>Rounded rectangle</Item>
          <Item onClick={() => addShape('ellipse')} icon={<Circle size={14} />}>Ellipse</Item>
          <Item onClick={() => addShape('line')} icon={<Minus size={14} />}>Line</Item>
          <Item onClick={() => addShape('arrow')} icon={<ArrowRight size={14} />}>Arrow</Item>
          <Item onClick={() => addShape('polygon')} icon={<Hexagon size={14} />}>Polygon</Item>
          <Item onClick={() => addShape('star')} icon={<Star size={14} />}>Star</Item>
        </MenuBtn>
        <Btn title="Add image (file, or drop one here)" onClick={addImage}><ImageIcon size={15} /></Btn>
        <Btn title="Add video" onClick={addVideo}><Film size={15} /></Btn>
        <Btn title="Add Lottie animation" onClick={addLottie}><Sparkles size={15} /></Btn>
        <MenuBtn id="more" title="More: lists, scripture, lyrics, timer, clock" icon={<Plus size={15} />}>
          <Item onClick={() => addList('bullet')} icon={<ListOrdered size={14} />}>Bulleted list</Item>
          <Item onClick={() => addList('number')} icon={<ListOrdered size={14} />}>Numbered list</Item>
          <Item onClick={addScripture} icon={<BookOpen size={14} />}>Scripture block</Item>
          <Item onClick={addLyrics} icon={<Music2 size={14} />}>Lyrics block</Item>
          <Item onClick={addTimer} icon={<Timer size={14} />}>Timer</Item>
          <Item onClick={addClock} icon={<Clock size={14} />}>Clock</Item>
        </MenuBtn>
        <Btn title="Background…" onClick={() => setSel([])}><Palette size={15} /></Btn>
        <Sep />
        <Btn title="Align left" onClick={() => align('left')} disabled={!canTransform}><AlignStartHorizontal size={15} /></Btn>
        <Btn title="Align centre" onClick={() => align('hcenter')} disabled={!canTransform}><AlignCenterHorizontal size={15} /></Btn>
        <Btn title="Align right" onClick={() => align('right')} disabled={!canTransform}><AlignEndHorizontal size={15} /></Btn>
        <Btn title="Align top" onClick={() => align('top')} disabled={!canTransform}><AlignStartVertical size={15} /></Btn>
        <Btn title="Align middle" onClick={() => align('vcenter')} disabled={!canTransform}><AlignCenterVertical size={15} /></Btn>
        <Btn title="Align bottom" onClick={() => align('bottom')} disabled={!canTransform}><AlignEndVertical size={15} /></Btn>
        <Btn title="Distribute horizontally" onClick={() => distribute('x')} disabled={selected.length < 3}><AlignHorizontalSpaceAround size={15} /></Btn>
        <Btn title="Distribute vertically" onClick={() => distribute('y')} disabled={selected.length < 3}><AlignVerticalSpaceAround size={15} /></Btn>
        <Sep />
        <Btn title="Bring to front" onClick={() => reorder(sel, 'front')} disabled={!hasSel}><BringToFront size={15} /></Btn>
        <Btn title="Bring forward" onClick={() => reorder(sel, 'up')} disabled={!hasSel}><ChevronUp size={15} /></Btn>
        <Btn title="Send backward" onClick={() => reorder(sel, 'down')} disabled={!hasSel}><ChevronDown size={15} /></Btn>
        <Btn title="Send to back" onClick={() => reorder(sel, 'back')} disabled={!hasSel}><SendToBack size={15} /></Btn>
        <Sep />
        <Btn title="Group (Ctrl+G)" onClick={group} disabled={selected.length < 2}><Group size={15} /></Btn>
        <Btn title="Ungroup (Ctrl+Shift+G)" onClick={ungroup} disabled={!selected.some(o => o.groupId)}><Ungroup size={15} /></Btn>
        <Btn title="Duplicate (Ctrl+D)" onClick={duplicate} disabled={!hasSel}><Copy size={15} /></Btn>
        <Btn title="Paste (Ctrl+V)" onClick={paste} disabled={!clip.current.length}><ClipboardPaste size={15} /></Btn>
        <Btn title="Delete (Del)" onClick={() => deleteIds(sel)} disabled={!hasSel}><Trash2 size={15} /></Btn>
      </div>
      </MenuCtx.Provider>

      <div className="flex-1 min-h-0 flex">
        {/* LAYERS */}
        <aside className="w-60 border-r flex flex-col flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.16)' }} aria-label="Layers">
          <div className="px-3 py-2.5 border-b text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-white/50 flex items-center gap-1.5" style={{ borderColor: line }}><Layers size={12} />Layers<span className="ml-auto text-white/30 font-mono normal-case">{objects.length}</span></div>
          <div className="flex-1 overflow-y-auto p-1.5" role="listbox" aria-multiselectable>
            {layersTop.length === 0 && <div className="text-[11.5px] text-white/35 text-center px-3 py-8 leading-relaxed">This slide is empty.<br />Add text, a shape, an image, or set a background.</div>}
            {layersTop.map(o => {
              const on = sel.includes(o.id);
              return (
                <div key={o.id} role="option" aria-selected={on} tabIndex={0}
                  onClick={e => setSel(e.shiftKey ? (on ? sel.filter(i => i !== o.id) : [...sel, o.id]) : expandGroup([o.id]))}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(expandGroup([o.id])); } }}
                  className={`group flex items-center gap-1.5 pl-2 pr-1 py-1.5 rounded cursor-pointer mb-0.5 outline-none focus-visible:ring-1 focus-visible:ring-[#D0BCFF] ${on ? 'bg-white/10' : 'hover:bg-white/5'}`} style={on ? { boxShadow: `inset 2px 0 0 ${CYAN}` } : undefined}>
                  <span className="text-white/45 flex-none">{iconFor(o)}</span>
                  <span className={`text-[12px] flex-1 truncate ${o.hidden ? 'text-white/30 line-through' : ''}`}>{nameOf(o)}</span>
                  {o.groupId && <Group size={10} className="text-white/30 flex-none" aria-label="grouped" />}
                  <button type="button" title={o.hidden ? 'Show' : 'Hide'} aria-label={o.hidden ? 'Show layer' : 'Hide layer'} onClick={e => { e.stopPropagation(); updateObjs([o.id], { hidden: !o.hidden }); }} className="p-1 rounded text-white/40 hover:text-white">{o.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                  <button type="button" title={o.locked ? 'Unlock' : 'Lock'} aria-label={o.locked ? 'Unlock layer' : 'Lock layer'} onClick={e => { e.stopPropagation(); updateObjs([o.id], { locked: !o.locked }); }} className="p-1 rounded text-white/40 hover:text-white">{o.locked ? <Lock size={13} style={{ color: LILAC }} /> : <Unlock size={13} />}</button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* CANVAS */}
        <main ref={stageWrap} className="flex-1 min-w-0 relative overflow-auto" style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.014) 0 13px, transparent 13px 26px), #08060f' }}
          onPointerDown={() => { if (!menu) setSel([]); setEditing(null); }} onWheel={e => { if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); } }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={onDrop}>
          <div className="min-w-full min-h-full grid place-items-center p-7" style={{ width: ART_W * scale + 56, height: ART_H * scale + 56 }}>
            <div ref={stageRef} tabIndex={0} aria-label="Slide canvas" className="relative bg-black outline-none" style={{ width: ART_W * scale, height: ART_H * scale, borderRadius: 4, boxShadow: '0 22px 52px rgba(0,0,0,0.55)', border: `1px solid ${line2}` }}>
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} aria-hidden />
              <div className="absolute left-0 top-0" style={{ width: ART_W, height: ART_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
                {objects.length === 0 && <div className="absolute inset-0 grid place-items-center pointer-events-none"><div className="text-center text-white/35" style={{ fontSize: 40, lineHeight: 1.4 }}>Empty slide<div style={{ fontSize: 26 }}>Add text, a shape, media or a background from the toolbar</div></div></div>}

                {safe && <>
                  <div className="absolute pointer-events-none" style={{ left: safeAreas().action.x, top: safeAreas().action.y, width: safeAreas().action.w, height: safeAreas().action.h, border: `${2 / scale}px dashed rgba(255,200,0,.5)` }} />
                  <div className="absolute pointer-events-none" style={{ left: safeAreas().title.x, top: safeAreas().title.y, width: safeAreas().title.w, height: safeAreas().title.h, border: `${2 / scale}px dashed rgba(0,218,243,.55)` }} />
                </>}

                {/* hit-test boxes (never drawn: the canvas underneath is the real render) */}
                {objects.map(o => {
                  if (o.hidden || isBackgroundObject(o)) return null;
                  const r = amboRecord(o); const k = r?.layer.content.kind;
                  if (k === 'AUDIO' || (r && r.kind === 'layer' && isFullFrame(o) && k !== 'TEXT' && k !== 'IMAGE')) return null;
                  const on = sel.includes(o.id);
                  const h = Math.max(o.h, 24 / scale);
                  return (
                    <div key={o.id} data-obj={o.id} tabIndex={0} role="button" aria-label={nameOf(o)}
                      onPointerDown={e => onObjPointerDown(e, o)}
                      onDoubleClick={e => { e.stopPropagation(); if (o.kind === 'TEXT') { setSel([o.id]); setEditing(o.id); } }}
                      onFocus={() => { if (!sel.includes(o.id)) setSel(expandGroup([o.id])); }}
                      className="absolute outline-none"
                      style={{ left: o.x, top: o.kind === 'LINE' && !o.h ? o.y - h / 2 : o.y, width: o.w, height: h, transform: `rotate(${o.rotation || 0}deg)`, cursor: o.locked ? 'default' : 'move',
                        outline: on ? 'none' : undefined, boxShadow: on ? `0 0 0 ${2 / scale}px ${CYAN}` : undefined }}>
                      {!on && <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity" style={{ boxShadow: `0 0 0 ${1.5 / scale}px rgba(208,188,255,.8)` }} />}
                      {r && isEngineLayer(o) && !on && <span className="absolute left-0 -top-0 text-[0px]">{nameOf(o)}</span>}
                    </div>
                  );
                })}

                {/* inline text editing */}
                {editingObj && editingObj.kind === 'TEXT' && (
                  <textarea autoFocus value={editingObj.text ?? ''} aria-label="Edit text on the slide"
                    onChange={e => updateObjs([editingObj.id], { text: e.target.value }, 'text')}
                    onBlur={() => setEditing(null)}
                    onPointerDown={e => e.stopPropagation()}
                    className="absolute resize-none outline-none"
                    style={{ left: editingObj.x, top: editingObj.y, width: editingObj.w, height: editingObj.h, transform: `rotate(${editingObj.rotation || 0}deg)`,
                      fontFamily: editingObj.fontFamily, fontSize: editingObj.fontSize, fontWeight: editingObj.fontWeight, fontStyle: editingObj.fontStyle, color: editingObj.fill && editingObj.fill !== 'none' ? editingObj.fill : '#fff',
                      textAlign: editingObj.textAlign as any, lineHeight: editingObj.lineHeight ?? 1.22, background: 'rgba(8,6,15,.86)', border: `${2 / scale}px solid ${CYAN}`, padding: 0, margin: 0, overflow: 'hidden' }} />
                )}

                {/* selection frame + handles */}
                {selBox && !editingObj && (
                  <div className="absolute pointer-events-none" style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: Math.max(selBox.h, 2), transform: single ? `rotate(${single.rotation || 0}deg)` : undefined, outline: `${1.5 / scale}px solid ${CYAN}` }}>
                    {canTransform && HANDLES.filter(hd => !(single?.kind === 'LINE' && (hd.h === 'n' || hd.h === 's'))).map(hd => (
                      <div key={hd.h} onPointerDown={e => startResize(e, hd.h)} className="absolute pointer-events-auto bg-white"
                        style={{ left: `calc(${hd.x * 100}% - ${hs / 2}px)`, top: `calc(${hd.y * 100}% - ${hs / 2}px)`, width: hs, height: hs, border: `${2 / scale}px solid ${CYAN}`, borderRadius: 2, cursor: hd.cur }} data-handle={hd.h} />
                    ))}
                    {canTransform && single && !isEngineLayer(single) && (
                      <>
                        <div className="absolute" style={{ left: '50%', top: -34 / scale, width: 1.5 / scale, height: 34 / scale, background: CYAN, transform: 'translateX(-50%)' }} />
                        <div onPointerDown={e => startRotate(e, single)} className="absolute pointer-events-auto rounded-full bg-white" title="Rotate (Shift = 15° steps)" data-handle="rotate"
                          style={{ left: `calc(50% - ${hs / 2}px)`, top: -34 / scale - hs / 2, width: hs, height: hs, border: `${2 / scale}px solid ${CYAN}`, cursor: 'grab' }} />
                      </>
                    )}
                  </div>
                )}

                {guides.map((g, i) => <div key={i} className="absolute pointer-events-none" style={g.axis === 'x' ? { left: g.at, top: 0, width: 1.5 / scale, height: ART_H, background: '#FF4D9D' } : { top: g.at, left: 0, height: 1.5 / scale, width: ART_W, background: '#FF4D9D' }} />)}
              </div>
            </div>
          </div>
          {toast && <div role="status" className="absolute left-1/2 -translate-x-1/2 bottom-4 px-3 py-2 rounded-lg text-[12px] font-medium shadow-xl" style={{ background: 'rgba(16,13,28,.96)', border: `1px solid ${line2}` }}>{toast}</div>}
        </main>

        {/* PROPERTIES */}
        <aside className="w-80 border-l flex flex-col flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.16)' }} aria-label="Properties">
          <div className="px-4 py-2.5 border-b text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-white/50 flex items-center gap-1.5" style={{ borderColor: line }}><Pencil size={12} />{hasSel ? 'Properties' : 'Slide'}</div>
          <div className="flex-1 overflow-y-auto p-4">
            <AmboSlideEditorInspector selected={selected} slideLabel={label} onSlideLabel={setLabel} background={background} onSetBackground={setBackground}
              pickFile={pickFile} update={updateObjs} setLayerContent={setLayerContent} listify={listify} />
          </div>
        </aside>
      </div>

      <AmboSlideTemplateGallery open={galleryOpen} onClose={() => setGalleryOpen(false)} onInsert={applyTemplate} activeShowTitle="this slide (replaces its text and design)" />
      <AmboSaveTemplateDialog open={saveTplOpen} onClose={() => setSaveTplOpen(false)} kind="ambo-slide" defaultName={label || 'My slide design'} build={buildTemplatePayload}
        onSaved={rec => say(`Saved “${rec.name}” to My templates`)} shareWhere="Ambo → Slide Templates" />
    </div>
  );
}
