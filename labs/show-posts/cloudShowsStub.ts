// Lab stand-in for services/slideshow/cloudShows: "publishing" puts the show (media inlined as
// data URLs) in the lab server's memory instead of Firebase Storage, so a link opened in a new tab
// still loads. Same exports the app uses.
import type { ShowSpec } from '../../services/slideshow/types';
import { needsBrandBug } from '../../services/slideshow/brandBug';

export const SHOW_KIND = 'slideshow';
export interface ShowRef { owner: string; id: string; title?: string; cover?: string }
const LAB_UID = 'lab-owner';
export const signedInUid = () => LAB_UID;
export const saveShowToAccount = async (_s: ShowSpec, _p?: unknown) => null;
export const listAccountShows = async () => [] as any[];
export const openAccountShow = async (_id: string) => null as any;
export const publishedPath = (r: Pick<ShowRef, 'owner' | 'id'>) => `public-shows/${r.owner}/${r.id}/show.json`;

const toData = async (src: string) => {
  if (!/^blob:/.test(src)) return src;
  const b = await (await fetch(src)).blob();
  return await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); });
};

export async function publishShow(spec: ShowSpec, onProgress?: (d: number, t: number) => void): Promise<ShowRef> {
  const photos = [] as ShowSpec['photos'];
  for (const [i, p] of spec.photos.entries()) { photos.push({ ...p, src: await toData(p.src) }); onProgress?.(i + 1, spec.photos.length); }
  const tracks = await Promise.all(spec.music.tracks.map(async (t) => ({ ...t, src: await toData(t.src) })));
  const shared: ShowSpec = { ...spec, photos, music: { ...spec.music, tracks }, brandBug: await needsBrandBug() };
  await fetch(`/lab/shows/${LAB_UID}/${spec.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: shared }) });
  const cover = spec.photos.find((p) => !p.graphic && !/^blob:/.test(p.src))?.src || photos[0]?.src;
  return { owner: LAB_UID, id: spec.id, title: spec.title, cover };
}

export async function loadPublishedShow(r: Pick<ShowRef, 'owner' | 'id'>): Promise<ShowSpec> {
  const res = await fetch(`/lab/shows/${r.owner}/${r.id}`);
  if (!res.ok) throw new Error(`This show isn't available (${res.status}).`);
  return (await res.json()).spec as ShowSpec;
}

export function showLink(r: Pick<ShowRef, 'owner' | 'id'>, mode: 'timeline' | 'interactive' = 'timeline') {
  return `${location.origin}/?show=${encodeURIComponent(`${r.owner}/${r.id}`)}${mode === 'interactive' ? '&mode=live' : ''}`;
}
