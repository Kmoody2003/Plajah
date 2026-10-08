// Slide ⇄ Tela bridge. An Ambo slide IS a Tela document: one 16:9 SCREEN frame
// (1920×1080) hosting ONE vector device (the "scene") whose objects, in z-order,
// stand for the slide's layers:
//
//   • every Ambo layer becomes a TelaVectorObject carrying the layer VERBATIM in
//     `amboLayer` (so SCRIPTURE / LYRICS / AUDIO / TIMER / LIVE / TELA_TEMPLATE /
//     unknown future kinds survive the round trip untouched), plus its editable
//     view: geometry (x/y/w/h/rotation → transform.rect/rotation), opacity,
//     hidden / locked / name, and for TEXT/IMAGE their styling;
//   • a freeform scene layer (TELA_TEMPLATE 'freeform') is EXPANDED into one native
//     object per scene object, and re-collapsed on save;
//   • objects drawn in the editor (shapes, extra text, images…) are native Tela
//     objects with no `amboLayer`; on save they collapse into ONE freeform
//     TELA_TEMPLATE layer, which every output already renders re-flowed.
//
// telaToSlide() starts from the stored original layer and only applies what the
// user actually changed (field-level diff against the view captured at load), so
// an unedited slide round-trips byte-for-byte and an edited one loses nothing.
// Stable ids: layer.telaDeviceId === the Tela object id.

import type { TelaDoc, TelaFrame, TelaBlock, TelaVectorDevice, TelaVectorObject } from '../../types';
import type { Slide, SlideLayer, LayerSlot, LayerContent, Rect, TextBlock } from './showModel';
import { newId, LAYER_ORDER } from './showModel';
import { FREEFORM_ID, FREEFORM_FIELD, ART_W, ART_H, encodeScene, decodeScene, sceneText } from './slideTemplates/freeform';

/** A stable Tela id for a slide, so re-opening the same slide keeps its identity. */
export const telaIdForSlide = (slide: Slide) => `tela_ambo_${slide.id}`;
export const sceneDeviceId = (slideId: string) => `scene_${slideId}`;
export const frameIdForSlide = (slideId: string) => `frm_${slideId}`;

export { ART_W, ART_H, FREEFORM_ID };

// ── passthrough record ───────────────────────────────────────────────────────

export interface AmboLayerRecord {
  /** 'layer' = an Ambo layer; 'scene' = a member of an expanded freeform layer. */
  kind: 'layer' | 'scene';
  /** The original layer, verbatim (for 'scene': the freeform layer WITHOUT its scene JSON). */
  layer: SlideLayer;
  /** Position in slide.layers (new layers sort last). */
  index: number;
  /** The object as first built (editable view) — the baseline for the field diff. Absent on a brand-new layer object. */
  base?: TelaVectorObject;
}

export const amboRecord = (o: TelaVectorObject): AmboLayerRecord | undefined => o.amboLayer as AmboLayerRecord | undefined;

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

// ── layer → object ───────────────────────────────────────────────────────────

export function layerLabel(layer: SlideLayer): string {
  if (layer.name) return layer.name;
  const c = layer.content;
  switch (c.kind) {
    case 'TEXT': return (c.blocks[0]?.text || 'Text').slice(0, 40);
    case 'SCRIPTURE': return c.reference || c.refId || 'Scripture';
    case 'IMAGE': return 'Image';
    case 'VIDEO': return 'Video';
    case 'AUDIO': return 'Audio';
    case 'GENERATOR': return `Generator · ${c.mode}`;
    case 'SHADER': return 'Shader';
    case 'LOTTIE': return 'Lottie';
    case 'LYRICS': return c.title ? `Lyrics · ${c.title}` : 'Lyrics';
    case 'TELA_TEMPLATE': return `Template · ${c.templateId}`;
    case 'TIMER': return 'Timer';
    case 'CLOCK': return 'Clock';
    case 'LIVE': return c.label || 'Live input';
    case 'WEB': return 'Web';
    default: return (c as { kind: string }).kind;
  }
}

/** Slide-slot TEXT layers and non-background IMAGE layers can be promoted to native scene objects when edited. */
export const isPromotable = (l: SlideLayer) => (l.content.kind === 'TEXT' && l.slot === 'slide') || (l.content.kind === 'IMAGE' && l.slot !== 'background');

const TEXT_DEFAULT = { x: 96, y: 54, w: 1728, h: 972 };

function rectToBox(r: Rect | undefined) {
  const q = r ?? FULL;
  return { x: q.x * ART_W, y: q.y * ART_H, w: q.w * ART_W, h: q.h * ART_H };
}
const num = (n: number) => Math.round(n * 1000) / 1000;
function boxToRect(o: { x: number; y: number; w: number; h: number }): Rect {
  return { x: num(o.x / ART_W), y: num(o.y / ART_H), w: num(o.w / ART_W), h: num(o.h / ART_H) };
}

export function baseObject(over: Partial<TelaVectorObject> & { id: string; kind: TelaVectorObject['kind'] }): TelaVectorObject {
  return { x: 0, y: 0, w: 200, h: 100, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, ...over };
}

/** Build the editable object for an Ambo layer (the layer itself rides along verbatim). */
export function objectFromLayer(layer: SlideLayer, index: number): TelaVectorObject {
  const id = layer.telaDeviceId || layer.id;
  const t = layer.transform;
  const hasRect = !!t?.rect;
  const common = {
    id,
    rotation: t?.rotation ?? 0,
    opacity: t?.opacity ?? layer.opacity ?? 1,
    hidden: layer.enabled === false || layer.visible === false,
    locked: !!layer.locked,
    objectLabel: layerLabel(layer),
  };
  const c = layer.content;
  let obj: TelaVectorObject;
  if (c.kind === 'TEXT') {
    const s = c.style ?? {};
    const box = hasRect ? rectToBox(t!.rect) : TEXT_DEFAULT;
    obj = baseObject({
      ...common, ...box, kind: 'TEXT',
      text: c.blocks.map(b => b.text).join('\n'),
      fontFamily: s.font ?? 'Palatino Linotype', fontSize: s.size ?? Math.round(ART_H * .09), fontWeight: 400,
      fill: s.color ?? '#ffffff', textAlign: s.align ?? 'center', vAlign: s.valign ?? 'middle',
      lineHeight: s.lineHeight ?? 1.32, wrap: true, autoFit: s.autoFit !== false,
      shadow: s.shadow !== false ? { x: 0, y: 3, blur: 14, color: 'rgba(0,0,0,0.55)' } : undefined,
      stroke: s.outline ? '#000000' : 'none', strokeWidth: s.outline ?? 0,
    });
  } else if (c.kind === 'IMAGE') {
    obj = baseObject({ ...common, ...rectToBox(t?.rect), kind: 'IMAGE', sourceImageSrc: c.src, imageFit: c.fit ?? 'cover' });
  } else {
    obj = baseObject({ ...common, ...rectToBox(t?.rect), kind: 'RECT' });
  }
  if (obj.shadow === undefined) delete obj.shadow;
  obj.amboLayer = { kind: 'layer', layer, index, base: undefined } satisfies AmboLayerRecord;
  // Baseline = the object as built (without the record), taken last so it matches exactly.
  const { amboLayer: _a, ...baseline } = obj;
  (obj.amboLayer as AmboLayerRecord).base = clone(baseline as TelaVectorObject);
  return obj;
}

/** Expand a freeform layer into one native object per scene object, each remembering the layer shell. */
function expandFreeform(layer: SlideLayer, index: number): TelaVectorObject[] {
  const c = layer.content as Extract<LayerContent, { kind: 'TELA_TEMPLATE' }>;
  const objs = decodeScene(c.fields?.[FREEFORM_FIELD]);
  const { [FREEFORM_FIELD]: _s, ...restFields } = c.fields || {};
  const shell: SlideLayer = { ...layer, content: { ...c, fields: restFields } };
  return objs.map((o, i) => {
    const out = clone(o);
    if (!out.id) out.id = `${layer.id}_o${i}`;
    out.amboLayer = { kind: 'scene', layer: shell, index } satisfies AmboLayerRecord;
    return out;
  });
}

const isFreeform = (l: SlideLayer) => l.content.kind === 'TELA_TEMPLATE' && l.content.templateId === FREEFORM_ID;

/** Build a Tela document from a slide with complete layer fidelity. An empty slide gives an empty scene. */
export function slideToTela(slide: Slide, ownerId = 'ambo', now = 0): TelaDoc {
  const objects: TelaVectorObject[] = [];
  slide.layers.forEach((layer, i) => {
    if (isFreeform(layer)) objects.push(...expandFreeform(layer, i));
    else objects.push(objectFromLayer(layer, i));
  });
  // z-order in the editor: slot order first (stable), then original order — what the compositor will do.
  const slotRank = (o: TelaVectorObject) => {
    const r = amboRecord(o);
    return r ? LAYER_ORDER.indexOf(r.layer.slot) : LAYER_ORDER.indexOf('slide');
  };
  const ordered = objects.map((o, i) => ({ o, i })).sort((a, b) => slotRank(a.o) - slotRank(b.o) || a.i - b.i).map(e => e.o);

  const device: TelaVectorDevice = { id: sceneDeviceId(slide.id), type: 'VECTOR', name: 'Slide', width: ART_W, height: ART_H, objects: ordered };
  const frame: TelaFrame = {
    id: frameIdForSlide(slide.id), kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: ART_W, h: ART_H,
    deviceIds: [device.id], label: slide.label,
  };
  return {
    id: telaIdForSlide(slide), ownerId, title: slide.label ?? 'Slide',
    frames: [frame], devices: { [device.id]: device }, createdAt: now, updatedAt: now,
  };
}

/** The scene (vector) device of a slide doc. */
export function sceneDevice(doc: TelaDoc): TelaVectorDevice | undefined {
  for (const id of doc.frames[0]?.deviceIds ?? []) {
    const d = doc.devices[id];
    if (d?.type === 'VECTOR') return d;
  }
  return undefined;
}

export function sceneObjects(doc: TelaDoc): TelaVectorObject[] { return sceneDevice(doc)?.objects ?? []; }

/** Text objects of the doc (first frame), reading order. Kept for callers that want the words. */
export function telaWriterBlocks(doc: TelaDoc): TelaBlock[] {
  return sceneObjects(doc).filter(o => o.kind === 'TEXT').map((o, i) => ({ id: `blk_${o.id}`, kind: (i === 0 ? 'h1' : 'p') as TelaBlock['kind'], text: o.text ?? '' }));
}
export function telaToText(doc: TelaDoc): string {
  return sceneObjects(doc).filter(o => o.kind === 'TEXT').map(o => o.text ?? '').join('\n');
}

// ── object → layer ───────────────────────────────────────────────────────────

const TEXT_STYLE_KEYS: Array<keyof TelaVectorObject> = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fill', 'gradient', 'textAlign', 'vAlign', 'lineHeight', 'letterSpacing',
  'textTransform', 'shadow', 'stroke', 'strokeWidth', 'underline', 'strike', 'autoFit', 'blur', 'wrap', 'blendMode',
];
const GEOM_KEYS: Array<keyof TelaVectorObject> = ['x', 'y', 'w', 'h', 'rotation'];
const IMAGE_KEYS: Array<keyof TelaVectorObject> = ['sourceImageSrc', 'imageFit', 'imageCrop', 'rx', 'blur', 'shadow', 'stroke', 'strokeWidth', 'blendMode'];
const differs = (a: TelaVectorObject, b: TelaVectorObject, keys: Array<keyof TelaVectorObject>) => keys.some(k => !same(a[k], b[k]));

const blocksFromText = (text: string, orig: TextBlock[]): TextBlock[] => {
  if (orig.map(b => b.text).join('\n') === text) return orig;
  const lines = text.split('\n');
  return lines.length === orig.length ? lines.map((t, i) => ({ ...orig[i], text: t })) : lines.map(t => ({ text: t, role: 'body' as const }));
};

/** Apply the per-layer editor state (hidden / locked / name / opacity / geometry) onto a layer. */
function applyLayerState(layer: SlideLayer, o: TelaVectorObject, base: TelaVectorObject | undefined, geometry: boolean): SlideLayer {
  const out: SlideLayer = { ...layer };
  if (!base || !!o.hidden !== !!base.hidden) { if (!base ? o.hidden : true) { out.enabled = !o.hidden; out.visible = !o.hidden; } }
  if (!base || !!o.locked !== !!base.locked) { if (o.locked || base) out.locked = !!o.locked; }
  if (base && o.objectLabel !== base.objectLabel && o.objectLabel) out.name = o.objectLabel;
  const opacityChanged = !base || (o.opacity ?? 1) !== (base.opacity ?? 1);
  const geomChanged = geometry && (!base || differs(o, base, GEOM_KEYS));
  if (opacityChanged || geomChanged) {
    const t = { ...(layer.transform || {}) };
    if (opacityChanged && ((o.opacity ?? 1) !== 1 || t.opacity !== undefined)) { t.opacity = o.opacity ?? 1; if (layer.opacity !== undefined) out.opacity = o.opacity ?? 1; }
    if (geomChanged) {
      const r = boxToRect(o);
      if (r.x === 0 && r.y === 0 && r.w === 1 && r.h === 1) delete t.rect; else t.rect = r;
      if (o.rotation) t.rotation = o.rotation; else delete t.rotation;
    }
    if (Object.keys(t).length) out.transform = t; else delete out.transform;
  }
  return out;
}

const stripRecord = (o: TelaVectorObject): TelaVectorObject => { const { amboLayer: _a, ...rest } = o; return rest as TelaVectorObject; };

/**
 * Convert a modified TelaDoc back into an Ambo Slide. Untouched layers are returned verbatim;
 * edited ones carry only what changed; native objects collapse into one freeform layer.
 */
export function telaToSlide(doc: TelaDoc, baseSlide?: Slide): Slide {
  const slideId = baseSlide?.id ?? (doc.id.startsWith('tela_ambo_') ? doc.id.slice('tela_ambo_'.length) : newId('sl'));
  const objs = sceneObjects(doc);

  const kept: Array<{ index: number; layer: SlideLayer }> = [];
  const scene: TelaVectorObject[] = [];       // z-order = doc order
  let sceneShell: AmboLayerRecord | undefined;
  let sceneIndex = Infinity;
  const sceneMembers = new Set<TelaVectorObject>();

  // Pass 1 — which objects join the scene?
  const nativeCount = objs.filter(o => !amboRecord(o)).length;
  let promotedAny = false;
  for (const o of objs) {
    const r = amboRecord(o);
    if (!r) { sceneMembers.add(o); continue; }
    if (r.kind === 'scene') { sceneMembers.add(o); if (!sceneShell) sceneShell = r; sceneIndex = Math.min(sceneIndex, r.index); continue; }
    const base = r.base;
    if (base && isPromotable(r.layer)) {
      const c = r.layer.content;
      if (c.kind === 'TEXT') {
        const style = differs(o, base, TEXT_STYLE_KEYS) || differs(o, base, GEOM_KEYS);
        if (style || nativeCount > 0) { sceneMembers.add(o); promotedAny = true; sceneIndex = Math.min(sceneIndex, r.index); continue; }
      } else if (c.kind === 'IMAGE') {
        if (differs(o, base, IMAGE_KEYS) || differs(o, base, GEOM_KEYS)) { sceneMembers.add(o); promotedAny = true; sceneIndex = Math.min(sceneIndex, r.index); continue; }
      }
    }
  }
  // A slide-slot TEXT layer left as a layer would share the slot with the scene and be hidden by it: merge it in.
  if (nativeCount > 0 || promotedAny) {
    for (const o of objs) {
      const r = amboRecord(o);
      if (r?.kind === 'layer' && r.layer.content.kind === 'TEXT' && r.layer.slot === 'slide' && !sceneMembers.has(o)) { sceneMembers.add(o); sceneIndex = Math.min(sceneIndex, r.index); }
    }
  }

  // Pass 2 — emit.
  for (const o of objs) {
    const r = amboRecord(o);
    if (sceneMembers.has(o)) { scene.push(stripRecord(o)); continue; }
    if (!r) continue;
    const base = r.base;
    const c = r.layer.content;
    let layer: SlideLayer = r.layer;
    if (c.kind === 'TEXT' && base) {
      if ((o.text ?? '') !== (base.text ?? '')) layer = { ...layer, content: { ...c, blocks: blocksFromText(o.text ?? '', c.blocks) } };
      layer = applyLayerState(layer, o, base, false);
    } else if (c.kind === 'IMAGE' && base && isPromotable(r.layer)) {
      layer = applyLayerState(layer, o, base, false);
    } else if (c.kind === 'IMAGE' && base && r.layer.slot === 'background') {
      if (o.sourceImageSrc !== base.sourceImageSrc && o.sourceImageSrc) layer = { ...layer, content: { ...c, src: o.sourceImageSrc } };
      layer = applyLayerState(layer, o, base, false);
    } else {
      layer = applyLayerState(layer, o, base, r.layer.slot !== 'background');
    }
    if (!base && !layer.telaDeviceId) layer = { ...layer, telaDeviceId: o.id };
    kept.push({ index: r.index, layer });
  }

  if (scene.length || sceneShell) {
    // The compositor keeps ONE layer per slot, so the scene takes the first slot nothing else uses.
    const used = new Set(kept.map(k => k.layer.slot));
    const freeSlot = (['slide', 'prop', 'overlay'] as LayerSlot[]).find(s => !used.has(s)) ?? 'overlay';
    const shell = sceneShell?.layer;
    const base: SlideLayer = shell ?? {
      id: newId('ly_scene'), slot: freeSlot, name: 'Slide design',
      content: { kind: 'TELA_TEMPLATE', templateId: FREEFORM_ID, fields: {} },
    };
    const content = base.content as Extract<LayerContent, { kind: 'TELA_TEMPLATE' }>;
    if (scene.length || shell) {
      kept.push({
        index: Number.isFinite(sceneIndex) ? sceneIndex : 1e6 - 1,
        layer: { ...base, content: { ...content, fields: { ...(content.fields || {}), [FREEFORM_FIELD]: encodeScene(scene) } } },
      });
    }
  }

  // New layers (index ≥ 1e6) keep the order they were added in.
  const layers = kept
    .map((k, i) => ({ ...k, i }))
    .sort((a, b) => a.index - b.index || a.i - b.i)
    .map(k => k.layer);
  // An emptied freeform shell (every object deleted) leaves no layer behind.
  const finalLayers = layers.filter(l => !(isFreeform(l) && decodeScene((l.content as any).fields?.[FREEFORM_FIELD]).length === 0));

  const baseTitle = baseSlide?.label ?? 'Slide';
  const label = doc.title !== baseTitle ? doc.title : baseSlide?.label;
  const out: Slide = { ...(baseSlide ?? {}), id: slideId, layers: finalLayers } as Slide;
  if (label !== undefined) out.label = label; else delete out.label;
  return out;
}

/** Plain text of any slide, including freeform scenes (empty slide → ''). */
export function slidePlainText(slide: Slide): string {
  for (const l of slide.layers) {
    if (l.content.kind === 'TEXT') return l.content.blocks.map(b => b.text).join(' ');
    if (l.content.kind === 'TELA_TEMPLATE' && l.content.templateId === FREEFORM_ID) {
      const t = sceneText(decodeScene(l.content.fields?.[FREEFORM_FIELD]));
      if (t) return t;
    }
  }
  return '';
}

// ── object factories used by the editor ──────────────────────────────────────

let seq = 0;
export const newObjId = (p = 'obj') => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function makeTextObject(over: Partial<TelaVectorObject> = {}): TelaVectorObject {
  return baseObject({
    id: newObjId('txt'), kind: 'TEXT', x: 360, y: 400, w: 1200, h: 280, text: 'Your text', fontFamily: 'Inter', fontSize: 96, fontWeight: 700,
    fill: '#ffffff', textAlign: 'center', vAlign: 'middle', lineHeight: 1.2, wrap: true, autoFit: true,
    shadow: { x: 0, y: 3, blur: 14, color: 'rgba(0,0,0,0.5)' }, ...over,
  });
}

export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star';

/** SVG path (in a w×h box) for the path-based shapes. */
export function shapePath(kind: 'arrow' | 'polygon' | 'star', w: number, h: number, sides = 5): string {
  if (kind === 'arrow') {
    const sh = h * .3, hx = w * .62;
    return `M0 ${h / 2 - sh / 2} L${hx} ${h / 2 - sh / 2} L${hx} 0 L${w} ${h / 2} L${hx} ${h} L${hx} ${h / 2 + sh / 2} L0 ${h / 2 + sh / 2} Z`;
  }
  const n = Math.max(3, Math.min(12, sides)), pts: string[] = [];
  const cx = w / 2, cy = h / 2;
  const count = kind === 'star' ? n * 2 : n;
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const rr = kind === 'star' && i % 2 ? .42 : 1;
    pts.push(`${i ? 'L' : 'M'}${(cx + Math.cos(ang) * cx * rr).toFixed(1)} ${(cy + Math.sin(ang) * cy * rr).toFixed(1)}`);
  }
  return pts.join(' ') + ' Z';
}

export function makeShapeObject(shape: ShapeKind, over: Partial<TelaVectorObject> = {}): TelaVectorObject {
  const id = newObjId('shp');
  const common = { id, x: 660, y: 340, w: 600, h: 400, fill: '#6B0099', stroke: 'none', strokeWidth: 0 } as const;
  switch (shape) {
    case 'rect': return baseObject({ ...common, kind: 'RECT', objectLabel: 'Rectangle', ...over });
    case 'rounded': return baseObject({ ...common, kind: 'RECT', rx: 48, objectLabel: 'Rounded rectangle', ...over });
    case 'ellipse': return baseObject({ ...common, kind: 'ELLIPSE', objectLabel: 'Ellipse', ...over });
    case 'line': return baseObject({ id, kind: 'LINE', x: 560, y: 540, w: 800, h: 0, points: [560, 540, 1360, 540], fill: 'none', stroke: '#ffffff', strokeWidth: 8, objectLabel: 'Line', ...over });
    case 'arrow': case 'polygon': case 'star': {
      const w = (over.w ?? common.w), h = (over.h ?? common.h);
      return baseObject({ ...common, kind: 'PATH', svgPathData: shapePath(shape, w, h), pathOriginX: 0, pathOriginY: 0, pathOriginW: w, pathOriginH: h, pathClosed: true,
        objectLabel: shape === 'arrow' ? 'Arrow' : shape === 'star' ? 'Star' : 'Polygon', ...over });
    }
  }
}

export function makeImageObject(src: string, over: Partial<TelaVectorObject> = {}): TelaVectorObject {
  return baseObject({ id: newObjId('img'), kind: 'IMAGE', x: 460, y: 190, w: 1000, h: 700, sourceImageSrc: src, imageFit: 'cover', objectLabel: 'Image', ...over });
}

/** A brand-new Ambo layer placed on the canvas (video, lottie, scripture, …). It keeps its own engine. */
export function makeLayerObject(content: LayerContent, slot: LayerSlot, box: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: ART_W, h: ART_H }, name?: string): TelaVectorObject {
  const layer: SlideLayer = { id: newId('ly'), slot, content, ...(name ? { name } : {}) };
  layer.telaDeviceId = newObjId('lay');
  const o = baseObject({ id: layer.telaDeviceId, kind: 'RECT', ...box, objectLabel: layerLabel(layer) });
  o.amboLayer = { kind: 'layer', layer, index: 1e6 + (++seq) } satisfies AmboLayerRecord;
  return o;
}

export const isBackgroundObject = (o: TelaVectorObject) => amboRecord(o)?.layer.slot === 'background' || o.templateRole === 'GROUND';
