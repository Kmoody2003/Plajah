// Tela art for disc menus. A menu's static art and every button state are Tela vector objects;
// they render through Tela's own SVG serializer (fonts embedded, so an <img> draws the real faces)
// into canvases that become the menu background, the pop-up panel and the IG button bitmaps.
import type { TelaVectorObject } from '../../types';
import { objectsToSvg } from '../tela/telaSvg';
import { fontKeysInStacks } from '../tela/telaFonts';
import { embedBroadcastFonts } from '../fabula/broadcastFontEmbed';
import type { DiscMenu, DiscProject, MenuButton } from './project';
import { GRAPHICS_PLANE } from './spec';

export type ArtKey = string;
export const menuArtKey = (menuId: string) => `menu:${menuId}`;
export const motionArtKey = (menuId: string, i: number) => `motion:${menuId}:${i}`;
export const btnArtKey = (menuId: string, btnId: string, state: 'normal' | 'selected' | 'activated') => `btn:${menuId}:${btnId}:${state}`;

export async function telaSvg(objects: TelaVectorObject[], w: number, h: number): Promise<string> {
  const svg = objectsToSvg(objects, w, h);
  const keys = fontKeysInStacks(objects.map(o => o.fontFamily));
  try { return await embedBroadcastFonts(svg, keys); } catch { return svg; }
}

const cache = new Map<string, Promise<HTMLImageElement>>();
export function svgImage(svg: string): Promise<HTMLImageElement> {
  let p = cache.get(svg);
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img); img.onerror = () => rej(new Error('Tela art did not render'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    cache.set(svg, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value!);
  }
  return p;
}

export async function artImage(objects: TelaVectorObject[], w: number, h: number) { return svgImage(await telaSvg(objects, w, h)); }

/** Render every Tela layer of the project (or one menu) to images, keyed by menuArtKey / btnArtKey. */
export async function prepareArt(p: DiscProject, onlyMenu?: string): Promise<Map<ArtKey, HTMLImageElement>> {
  const out = new Map<ArtKey, HTMLImageElement>();
  const jobs: Promise<void>[] = [];
  for (const m of p.menus) {
    if (onlyMenu && m.id !== onlyMenu) continue;
    if (m.art?.length) jobs.push(artImage(m.art, GRAPHICS_PLANE.w, GRAPHICS_PLANE.h).then(i => { out.set(menuArtKey(m.id), i); }).catch(() => {}));
    (m.motion?.layers || []).forEach((l, i) => jobs.push(artImage(l.art, l.w, l.h).then(img => { out.set(motionArtKey(m.id, i), img); }).catch(() => {})));
    for (const b of m.buttons) if (b.art) for (const st of ['normal', 'selected', 'activated'] as const) {
      const objs = b.art[st];
      if (objs?.length) jobs.push(artImage(objs, b.w, b.h).then(i => { out.set(btnArtKey(m.id, b.id, st), i); }).catch(() => {}));
    }
  }
  await Promise.all(jobs);
  return out;
}

/** The menu's static art as a PNG (for baking into the menu background clip). */
export async function menuArtPng(menu: DiscMenu): Promise<Uint8Array | undefined> {
  if (!menu.art?.length) return undefined;
  const img = await artImage(menu.art, GRAPHICS_PLANE.w, GRAPHICS_PLANE.h);
  const c = document.createElement('canvas'); c.width = GRAPHICS_PLANE.w; c.height = GRAPHICS_PLANE.h;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const blob: Blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** A motion layer's own art as a PNG (overlaid and moved by ffmpeg in the menu clip). */
export async function layerPng(objects: TelaVectorObject[], w: number, h: number): Promise<Uint8Array> {
  const img = await artImage(objects, w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(img, 0, 0);
  const blob: Blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Button art in button-local coordinates → objects shifted to the plane (for the Tela round-trip). */
export const toPlane = (b: MenuButton, objs: TelaVectorObject[]) => objs.map(o => ({ ...o, x: o.x + b.x, y: o.y + b.y, ...(o.points ? { points: o.points.map((v, i) => v + (i % 2 ? b.y : b.x)) } : {}) }));
