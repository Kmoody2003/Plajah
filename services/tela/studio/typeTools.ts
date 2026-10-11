// studio/typeTools — point type, area type, type on a path, threaded frames and Create
// Outlines, all composed by the platform text engine (services/text).
//
// A Studio type object is a TEXT object whose story lives in studio.type and whose composed
// glyph outlines are baked into geom.glyphs (object-local), so every renderer draws exactly
// what the editor composed with no font loading. The legacy TEXT fields (text, fontFamily,
// fontSize, fill, textAlign) are kept in step from the story's dominant attributes, so Aria,
// the assignment builder, search and older renderers still read sensible values.
//
// Legacy TEXT objects keep rendering exactly as before (<text>); they are migrated to engine
// type only when edited with the Type tool, losslessly via fromVectorText.
import type { TelaVectorObject } from '../../../types';
import type { TextSystem } from '../../text';
import type { TextStory, CharAttrs } from '../../text/model';
import type { StoryLayout, TextFrame, GlyphRun, DecorationRect } from '../../text/layout/flow';
import { fromVectorText } from '../../text/convert';
import { newId, storyText } from '../../text/model';
import { outlineCacheFor, runPath } from '../../text/render/svg';
import type { PathOp } from '../../text/engine/wasm';
import type { CompoundPath } from '../geometry/model';
import { parsePathData, toPathData } from '../geometry/pathData';
import { subpathCurves } from '../geometry/model';
import { arcTable, pointAtLength } from '../geometry/bezier';
import { transformPath, translate, rotate, compose } from '../geometry/transform';
import { pathToObject } from '../geometry/tela';
import type { StudioType } from './model';
import { studioId } from './model';

const LOCAL_FAR = 100000;
const fmt = (v: number) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };

/** A one-paragraph story with plain attributes (new type). */
export function newStory(text: string, attrs: CharAttrs & { align?: 'left' | 'center' | 'right' | 'justify' }): TextStory {
  const { align, ...char } = attrs;
  return { id: newId('s'), paragraphs: text.split('\n').map(line => ({ id: newId(), attrs: { align: align ?? 'left', leading: { kind: 'multiple', value: 1.2 }, hyphenation: { enabled: false } }, runs: [{ text: line, attrs: { ...char } }] })) };
}

/** Story of a legacy TEXT object (lossless: font, size, weight, style, tracking, case, colour, leading, alignment). */
export function storyFromLegacy(o: TelaVectorObject): TextStory { return fromVectorText(o); }

/** Dominant attributes for the legacy TEXT fields. */
function dominant(story: TextStory): { family: string; size: number; weight: number; italic: boolean; color: string; align: 'left' | 'center' | 'right' } {
  const p = story.paragraphs[0]; const r = p?.runs.find(x => x.text) ?? p?.runs[0]; const a = r?.attrs ?? {};
  const al = p?.attrs?.align;
  return { family: a.fontFamily ?? 'Inter', size: a.fontSize ?? 24, weight: a.fontWeight ?? 400, italic: a.fontStyle === 'italic', color: a.color ?? '#1B1523', align: al === 'center' || al === 'right' ? al : 'left' };
}

/** Engine-type object from a story. */
export function makeTypeObject(story: TextStory, mode: StudioType['mode'], box: { x: number; y: number; w: number; h: number }, extra: Partial<StudioType> = {}): TelaVectorObject {
  const d = dominant(story);
  return {
    id: studioId('type'), kind: 'TEXT', x: box.x, y: box.y, w: box.w, h: box.h,
    fill: d.color, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
    text: storyText(story), fontFamily: d.family, fontSize: d.size, fontWeight: d.weight, fontStyle: d.italic ? 'italic' : 'normal', textAlign: d.align,
    wrap: mode === 'area', objectLabel: 'Type', templateRole: 'BODY',
    studio: { v: 1, type: { mode, story, ...extra } },
  };
}

// ── Glyph extraction ────────────────────────────────────────────────────────────────

/** {d, fill} per colour run for the lines of one frame, translated into object-local space. */
function frameGlyphs(system: TextSystem, layout: StoryLayout, frameIndex: number, ox: number, oy: number): Array<{ d: string; fill: string }> {
  const cache = outlineCacheFor(system.engine); const fl = layout.frames[frameIndex]; if (!fl) return [];
  const out: Array<{ d: string; fill: string }> = []; let cur = { d: '', fill: '' };
  const push = () => { if (cur.d) out.push(cur); };
  const deco = (r: DecorationRect) => `M${fmt(r.x - ox)} ${fmt(r.y - oy)}h${fmt(r.width)}v${fmt(r.height)}h${fmt(-r.width)}Z`;
  for (const r of fl.decorations) if (r.kind === 'highlight' || r.kind === 'shading') out.push({ d: deco(r), fill: r.color });
  for (const l of fl.lines) for (const run of l.runs) {
    const shifted: GlyphRun = { ...run, xs: run.xs.map(x => x - ox), ys: run.ys.map(y => y - oy) };
    const d = runPath(cache, shifted, 2); if (!d) continue;
    if (run.color !== cur.fill) { push(); cur = { d: '', fill: run.color }; }
    cur.d += d;
  }
  push();
  for (const r of fl.decorations) if (r.kind === 'underline' || r.kind === 'strike') out.push({ d: deco(r), fill: r.color });
  return out;
}

/** Lines' ink extent of a layout (for sizing point type). */
function extent(layout: StoryLayout): { w: number; h: number; x0: number } {
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  for (const l of layout.lines) { x0 = Math.min(x0, l.inkX); x1 = Math.max(x1, l.inkX + l.inkWidth); y1 = Math.max(y1, l.bottom); }
  if (!isFinite(x0)) return { w: 1, h: 1, x0: 0 };
  return { w: Math.max(1, x1 - x0), h: Math.max(1, y1), x0 };
}

/** Keep the legacy fields in step with the story. */
function legacyFields(o: TelaVectorObject, story: TextStory): TelaVectorObject {
  const d = dominant(story);
  return { ...o, text: storyText(story), fontFamily: d.family, fontSize: d.size, fontWeight: d.weight, fontStyle: d.italic ? 'italic' : 'normal', textAlign: d.align, fill: d.color };
}

// ── Baking ──────────────────────────────────────────────────────────────────────────

export interface TypeBake { patches: Record<string, Partial<TelaVectorObject>>; overflow: boolean }

/**
 * Compose a type object (and its thread) and return patches for every frame in the chain.
 * Fonts must already be loaded (await system.ensure(story)).
 */
export function bakeType(system: TextSystem, objects: TelaVectorObject[], headId: string): TypeBake | null {
  const byId = new Map(objects.map(o => [o.id, o]));
  const head = byId.get(headId); const t = head?.studio?.type; if (!head || !t?.story) return null;
  const story = t.story;
  if (t.mode === 'point') {
    const probe = system.layout(story, [{ id: 'p', x: 0, y: 0, width: LOCAL_FAR, height: LOCAL_FAR }]);
    const e = extent(probe); const W = Math.ceil(e.w + 2);
    const layout = system.layout(story, [{ id: 'p', x: 0, y: 0, width: W, height: LOCAL_FAR }]);
    const h = extent(layout).h;
    const glyphs = frameGlyphs(system, layout, 0, 0, 0);
    // Point type keeps its alignment anchor: left edge, centre or right edge stays put.
    const d = dominant(story); const dx = d.align === 'center' ? (head.w - W) / 2 : d.align === 'right' ? head.w - W : 0;
    const base = legacyFields(head, story);
    return { patches: { [head.id]: { ...pick(base), x: head.x + (head.w ? dx : 0), w: W, h: Math.ceil(h), geom: { ...(head.geom ?? { v: 1 }), v: 1, glyphs } } }, overflow: false };
  }
  if (t.mode === 'path') {
    const glyphs = pathGlyphs(system, head, story, t);
    const base = legacyFields(head, story);
    return { patches: { [head.id]: { ...pick(base), geom: { ...(head.geom ?? { v: 1 }), v: 1, glyphs } } }, overflow: false };
  }
  // Area type, threaded through threadNext.
  const chain: TelaVectorObject[] = [head]; const seen = new Set([head.id]);
  for (let n = head.studio?.type?.threadNext; n && !seen.has(n); n = byId.get(n)?.studio?.type?.threadNext) { const o = byId.get(n); if (!o) break; chain.push(o); seen.add(n); }
  const frames: TextFrame[] = chain.map(o => {
    const st = o.studio?.type ?? t; const ins = st.inset ?? 0;
    return { id: o.id, x: o.x, y: o.y, width: Math.max(4, o.w), height: Math.max(4, o.h), columns: st.columns ?? 1, gutter: 14, insets: { top: ins, right: ins, bottom: ins, left: ins }, verticalAlign: st.verticalAlign ?? 'top' };
  });
  const layout = system.layout(story, frames);
  const patches: Record<string, Partial<TelaVectorObject>> = {};
  chain.forEach((o, i) => {
    const glyphs = frameGlyphs(system, layout, i, o.x, o.y);
    const isHead = i === 0; const last = i === chain.length - 1;
    const st = { ...(o.studio?.type ?? { mode: 'area' as const }), overflow: last ? layout.overflow : false };
    const p: Partial<TelaVectorObject> = { geom: { ...(o.geom ?? { v: 1 }), v: 1, glyphs }, studio: { ...(o.studio ?? { v: 1 }), type: st } };
    if (isHead) Object.assign(p, pick(legacyFields(o, story)));
    else { p.text = ''; p.fontFamily = head.fontFamily; p.fontSize = head.fontSize; p.fill = head.fill; }
    patches[o.id] = p;
  });
  return { patches, overflow: layout.overflow };
}
const pick = (o: TelaVectorObject): Partial<TelaVectorObject> => ({ text: o.text, fontFamily: o.fontFamily, fontSize: o.fontSize, fontWeight: o.fontWeight, fontStyle: o.fontStyle, textAlign: o.textAlign, fill: o.fill });

/** Type on a path: glyphs placed along the baseline path (object-local), rotated to its tangent. */
function pathGlyphs(system: TextSystem, o: TelaVectorObject, story: TextStory, t: StudioType): Array<{ d: string; fill: string }> {
  if (!t.pathD) return [];
  const base = parsePathData(t.pathD, 'nonzero');
  const curves = base.subpaths.flatMap(s => subpathCurves(s)); if (!curves.length) return [];
  const tab = arcTable(curves);
  const layout = system.layout(story, [{ id: 'p', x: 0, y: 0, width: LOCAL_FAR, height: LOCAL_FAR }]);
  const line = layout.lines[0]; if (!line) return [];
  const cache = outlineCacheFor(system.engine);
  const lineW = line.inkWidth; const d = dominant(story);
  const start = (t.startOffset ?? 0) + (d.align === 'center' ? (tab.total - lineW) / 2 : d.align === 'right' ? tab.total - lineW : 0);
  const out: Array<{ d: string; fill: string }> = []; let cur = { d: '', fill: '' };
  for (const run of line.runs) {
    const upem = system.engine.metrics(run.font).upem; const s = run.size / upem;
    cache.prefetch(run.font, run.glyphs);
    let d = '';
    for (let i = 0; i < run.glyphs.length; i++) {
      const g = cache.get(run.font, run.glyphs[i]); if (!g.ops.length) continue;
      const adv = g.advance * s * run.scaleX;
      const along = start + (run.xs[i] - line.inkX) + adv / 2;
      if (along < -adv || along > tab.total + adv) continue;
      const at = pointAtLength(tab, Math.max(0, Math.min(tab.total, along)));
      const ang = Math.atan2(at.tan.y, at.tan.x) * 180 / Math.PI + (t.flip ? 180 : 0);
      // glyph space: pen at origin, centred on its advance, baseline at y=0 (y down)
      const shift = run.ys[i] - line.baseline; // baseline shift / super-sub
      const m = compose(translate(-adv / 2, shift), rotate(ang), translate(at.p.x, at.p.y));
      d += opsTransformed(g.ops, s * run.scaleX, -s, m);
    }
    if (!d) continue;
    if (run.color !== cur.fill) { if (cur.d) out.push(cur); cur = { d: '', fill: run.color }; }
    cur.d += d;
  }
  if (cur.d) out.push(cur);
  return out;
}
function opsTransformed(ops: PathOp[], sx: number, sy: number, m: [number, number, number, number, number, number]): string {
  const P = (x: number, y: number) => { const X = x * sx, Y = y * sy; return `${fmt(m[0] * X + m[2] * Y + m[4])} ${fmt(m[1] * X + m[3] * Y + m[5])}`; };
  let d = '';
  for (const o of ops) {
    switch (o.op) {
      case 'M': d += `M${P(o.x, o.y)}`; break;
      case 'L': d += `L${P(o.x, o.y)}`; break;
      case 'Q': d += `Q${P(o.x1, o.y1)} ${P(o.x, o.y)}`; break;
      case 'C': d += `C${P(o.x1, o.y1)} ${P(o.x2, o.y2)} ${P(o.x, o.y)}`; break;
      case 'Z': d += 'Z'; break;
    }
  }
  return d;
}

// ── Commands ────────────────────────────────────────────────────────────────────────

/** Migrate a legacy TEXT object to engine type (Type tool edit). Writer-bound text is left alone. */
export function migrateLegacyText(o: TelaVectorObject): TelaVectorObject | null {
  if (o.kind !== 'TEXT' || o.studio?.type || o.boundWriterDeviceId) return null;
  const story = storyFromLegacy(o);
  return { ...o, studio: { ...(o.studio ?? { v: 1 }), type: { mode: o.wrap ? 'area' : 'point', story } } };
}

/** Text → type on a path: the path object becomes the baseline (Illustrator's Type on a Path tool). */
export function typeOnPath(pathObj: TelaVectorObject, artboardPath: CompoundPath, story: TextStory, clickAlong = 0): TelaVectorObject {
  const box = pathToObject(artboardPath, {}, 'tmp');
  const pad = 80; const x = box.x - pad, y = box.y - pad, w = box.w + pad * 2, h = box.h + pad * 2;
  const local = toPathData(transformPath(artboardPath, translate(-x, -y)));
  const o = makeTypeObject(story, 'path', { x, y, w, h }, { pathD: local, startOffset: clickAlong });
  return { ...o, id: pathObj.id + '_type', groupId: pathObj.groupId };
}

/** Create Outlines: glyph outlines → one compound PATH per colour run (grouped), in artboard px. */
export function createOutlines(o: TelaVectorObject): TelaVectorObject[] {
  const glyphs = o.geom?.glyphs; if (!glyphs?.length) return [];
  const m = o.rotation ? compose(translate(o.x, o.y), rotate(o.rotation, { x: o.x + o.w / 2, y: o.y + o.h / 2 })) : translate(o.x, o.y);
  const groupId = glyphs.length > 1 ? (o.groupId ?? studioId('grp')) : o.groupId;
  return glyphs.map((g, i) => {
    const p = transformPath(parsePathData(g.d, 'nonzero'), m);
    const obj = pathToObject(p, { fill: g.fill, opacity: o.opacity, blend: o.blendMode, shadow: o.shadow, blur: o.blur, label: `${(o.text ?? 'Type').slice(0, 24)} outlines`, role: o.templateRole }, i === 0 ? o.id : `${o.id}_o${i}`);
    if (o.stroke !== 'none' && o.strokeWidth > 0) { obj.stroke = o.stroke; obj.strokeWidth = o.strokeWidth; }
    if (groupId) obj.groupId = groupId;
    return obj;
  });
}

/** Link `from` (area type) to `to` (another area frame) so text flows on. */
export function threadFrames(objects: TelaVectorObject[], fromId: string, toId: string): TelaVectorObject[] {
  return objects.map(o => {
    if (o.id === fromId && o.studio?.type) return { ...o, studio: { ...o.studio, type: { ...o.studio.type, threadNext: toId } } };
    if (o.id === toId) { const st = o.studio?.type; return { ...o, kind: 'TEXT' as const, wrap: true, studio: { ...(o.studio ?? { v: 1 }), type: { mode: 'area' as const, ...(st ?? {}), story: undefined, threadPrev: fromId } } }; }
    return o;
  });
}
/** The head of a thread (story owner) for any frame in it. */
export function threadHead(objects: TelaVectorObject[], id: string): string {
  const byId = new Map(objects.map(o => [o.id, o])); let cur = id; const seen = new Set<string>();
  while (!seen.has(cur)) { seen.add(cur); const prev = byId.get(cur)?.studio?.type?.threadPrev; if (!prev || !byId.has(prev)) break; cur = prev; }
  return cur;
}
/** Frames of a thread in order (head first). */
export function threadChain(objects: TelaVectorObject[], headId: string): TelaVectorObject[] {
  const byId = new Map(objects.map(o => [o.id, o])); const out: TelaVectorObject[] = []; const seen = new Set<string>();
  for (let id: string | undefined = headId; id && !seen.has(id); id = byId.get(id)?.studio?.type?.threadNext) { const o = byId.get(id); if (!o) break; out.push(o); seen.add(id); }
  return out;
}
/** Text frames for in-place editing (TextSurface) of a thread, artboard px. */
export function editFrames(chain: TelaVectorObject[]): TextFrame[] {
  return chain.map(o => { const st = o.studio?.type; const ins = st?.inset ?? 0; return { id: o.id, x: o.x, y: o.y, width: Math.max(4, o.w), height: Math.max(4, o.h), columns: st?.columns ?? 1, gutter: 14, insets: { top: ins, right: ins, bottom: ins, left: ins }, verticalAlign: st?.verticalAlign ?? 'top' }; });
}
/** Point type frame for in-place editing (wide, so typing never wraps). */
export const pointEditFrame = (o: TelaVectorObject): TextFrame => ({ id: o.id, x: o.x, y: o.y, width: Math.max(o.w + 400, 600), height: Math.max(o.h + 200, 200) });
export { LOCAL_FAR };
