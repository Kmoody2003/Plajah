/**
 * shotStore.ts — shots saved on this device. The whole stage goes with each one: the scene, every object built
 * from a picture (mesh, textures, parts) and the picture behind a picture scene, so a shot reopens exactly.
 *
 * On-device only for now (IndexedDB keeps typed arrays and blobs as they are). Cloud copies come with the
 * creative-cloud sync once a shot's size is known: one finished object is several megabytes of textures.
 */

import { del, get, set } from 'idb-keyval';
import type { Scene } from '../scene/sceneModel';
import type { FinishedObject } from '../scene/finishObject';
import type { Shot } from './shot';

export interface SavedShot {
  shot: Shot;
  scene: Scene;
  finished: Record<string, FinishedObject>;
  /** The picture a picture scene is painted from; its object URL doesn't survive a reload. */
  picture?: Blob;
}

export interface ShotSummary { id: string; title: string; seconds: number; updatedAt: number }

const INDEX = 'plajah.argilla.shots';
const key = (id: string) => `plajah3d:shot:${id}`;

export function listShots(): ShotSummary[] {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function remember(summary: ShotSummary) {
  try {
    localStorage.setItem(INDEX, JSON.stringify([summary, ...listShots().filter((s) => s.id !== summary.id)].slice(0, 200)));
  } catch { /* the shot itself is stored; only its place in the list is lost */ }
}

export async function saveShot(shot: Shot, scene: Scene, finished: Record<string, FinishedObject>): Promise<Shot> {
  const saved = { ...shot, updatedAt: Date.now() };
  let picture: Blob | undefined;
  if (scene.pictureUrl) picture = await fetch(scene.pictureUrl).then((r) => r.blob()).catch(() => undefined);
  // The object URL is rebuilt from the blob on open.
  const record: SavedShot = { shot: saved, scene: { ...scene, pictureUrl: undefined }, finished, picture };
  await set(key(saved.id), record);
  remember({ id: saved.id, title: saved.title, seconds: saved.seconds, updatedAt: saved.updatedAt });
  return saved;
}

export async function loadShot(id: string): Promise<SavedShot | null> {
  const record = (await get(key(id))) as SavedShot | undefined;
  if (!record) return null;
  return record.picture ? { ...record, scene: { ...record.scene, pictureUrl: URL.createObjectURL(record.picture) } } : record;
}

export async function deleteShot(id: string) {
  await del(key(id));
  try {
    localStorage.setItem(INDEX, JSON.stringify(listShots().filter((s) => s.id !== id)));
  } catch { /* nothing to tidy */ }
}
