// Bridging a Tela doc to the runtime: which vector objects make up a page, and what the runtime needs to know about each.
// Convention (documented in docs/LIVING_RUNTIME.md): LivingPage.page is the 1-based position of the frame in TelaDoc.frames,
// matching the showcase spread number (cover = 1). A frame's objects are the objects of its VECTOR devices in device order.
import type { TelaDoc, TelaFrame, TelaVectorObject } from '../../../types';
import type { LivingBook, LivingPage } from '../contracts';
import type { ObjInfo } from './targets';

export function objectBox(o: TelaVectorObject): { x: number; y: number; w: number; h: number } {
  if ((o.kind === 'LINE' || o.kind === 'PATH') && o.points && o.points.length >= 2 && !o.svgPathData) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < o.points.length; i += 2) { x0 = Math.min(x0, o.points[i]); x1 = Math.max(x1, o.points[i]); y0 = Math.min(y0, o.points[i + 1]); y1 = Math.max(y1, o.points[i + 1]); }
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }
  return { x: o.x, y: o.y, w: Math.max(1, o.w), h: Math.max(1, o.h) };
}

export function objectInfos(objects: TelaVectorObject[]): ObjInfo[] {
  return objects.filter(o => !o.hidden).map(o => ({ id: o.id, label: o.objectLabel, role: o.templateRole, kind: o.kind, box: objectBox(o) }));
}

export function frameObjects(doc: Pick<TelaDoc, 'devices'>, frame: Pick<TelaFrame, 'deviceIds'>): TelaVectorObject[] {
  // One vector device (every living book page): return its array itself, so the identity is stable across renders and the live page is not rebuilt.
  const vecs = frame.deviceIds.map(id => doc.devices[id]).filter(d => d?.type === 'VECTOR');
  if (vecs.length === 1 && vecs[0]?.type === 'VECTOR') return vecs[0].objects;
  const out: TelaVectorObject[] = [];
  for (const id of frame.deviceIds) { const d = doc.devices[id]; if (d?.type === 'VECTOR') out.push(...d.objects); }
  return out;
}

/** Page size for a frame: its first vector device's artboard, else the frame itself. */
export function frameSize(doc: Pick<TelaDoc, 'devices'>, frame: TelaFrame): { width: number; height: number } {
  for (const id of frame.deviceIds) { const d = doc.devices[id]; if (d?.type === 'VECTOR') return { width: d.width, height: d.height }; }
  return { width: frame.w, height: frame.h };
}

export const pageNumberForFrame = (doc: Pick<TelaDoc, 'frames'>, frameId: string): number => doc.frames.findIndex(f => f.id === frameId) + 1;

export function livingPageFor(living: LivingBook | undefined, page: number): LivingPage | undefined {
  return living?.pages.find(p => p.page === page);
}

/** Does this page have anything alive on it? (reader decides between the live page and the static device.) */
export function hasLiving(living: LivingBook | undefined, page: number): boolean {
  const p = livingPageFor(living, page);
  return !!p && (p.behaviors.length > 0 || !!p.music || !!p.ambience || !!p.narration);
}

/** Plain text of a page in reading order (narration default). */
export function pageText(objects: TelaVectorObject[]): string {
  return narrationObjects(objects).map(o => (o.text ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
}

const SKIP_ROLES = new Set(['FOLIO', 'RUNNING_HEAD', 'CREDIT', 'LOGO', 'FOOTNOTE', 'AD_SLOT', 'SKU']);
/** TEXT objects that are part of the story, top-to-bottom then left-to-right. */
export function narrationObjects(objects: TelaVectorObject[]): TelaVectorObject[] {
  const text = objects.filter(o => o.kind === 'TEXT' && !o.hidden && (o.text ?? '').trim() && !(o.templateRole && SKIP_ROLES.has(o.templateRole)));
  // Picture-book pages also carry title letters, shop signs and counters as TEXT; when the page marks its story text as BODY, that is the read-along.
  const body = text.filter(o => o.templateRole === 'BODY');
  return (body.length ? body : text)
    .sort((a, b) => (Math.abs(a.y - b.y) < 6 ? a.x - b.x : a.y - b.y));
}
