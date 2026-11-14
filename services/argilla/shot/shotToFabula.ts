/**
 * shotToFabula.ts — hands a rendered shot to Fabula as a clip on V1, through Fabula's own import seam (the
 * `studio:handoff` + OPEN_FABULA path Melos Beats and Pixels use). The shot id rides on the asset, so a later
 * "Open in Plajah 3D" can go back to the stage that made it.
 */

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { studioKey } from '../../fabula/fabulaSync';
import { putBytes as mediaPutBytes } from '../../fabula/mediaStore';
import type { RenderedShot } from './renderShot';
import type { Shot } from './shot';

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

/** Writes a production holding the shot and asks the app to open Fabula on it. Returns the production id. */
export async function sendShotToFabula(shot: Shot, rendered: RenderedShot): Promise<string> {
  const name = (shot.title || 'Plajah 3D shot').slice(0, 80);
  const assetId = uid(), prodId = uid(), editId = uid(), now = Date.now();
  // Bytes go where Fabula's rehydration looks for them (studio:blob:<asset id>).
  await mediaPutBytes(`studio:blob:${assetId}`, rendered.blob);
  const asset = {
    id: assetId, name: `${name}.${rendered.mime === 'video/webm' ? 'webm' : 'mp4'}`, type: 'video', duration: rendered.seconds,
    width: rendered.width, height: rendered.height, bin: 'Plajah 3D', tags: ['plajah3d'], offline: true,
    plajah3d: { shotId: shot.id, fps: rendered.fps },
  };
  const clip = { id: uid(), trackId: 'v1', start: 0, duration: rendered.seconds, kind: 'media', assetId, label: name, srcIn: 0 };
  const prod = {
    id: prodId, title: name, type: 'film', description: 'From Plajah 3D',
    themes: '', world: '', cast: [], mediaPool: [asset],
    defaults: { style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific', format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: rendered.fps, drop: false } },
    acts: [1, 2, 3].map((n) => ({ id: uid(), number: n, title: `ACT ${['I', 'II', 'III'][n - 1]}`, scenes: [] })),
    edits: [{ id: editId, title: name, timeline: { clips: [clip], trackSettings: {} }, updatedAt: now }],
    worldCats: {}, design: {}, createdAt: now, updatedAt: now,
  };
  await idbSet(studioKey(`studio:prod:${prodId}`), prod);
  const index = ((await idbGet(studioKey('studio:index'))) as { list?: { id: string }[] } | undefined) || {};
  await idbSet(studioKey('studio:index'), { list: [{ id: prodId, title: name, type: 'film', updated: now, sceneCount: 0 }, ...(index.list || []).filter((x) => x.id !== prodId)] });
  await idbSet(studioKey('studio:handoff'), { prodId, editId });
  window.dispatchEvent(new CustomEvent('OPEN_FABULA'));
  return prodId;
}
