// The Motion Library: the user's captured clips, saved on the device and synced to the cloud (creative kind
// "motion", version history included) so a take recorded on the phone opens on the desktop. The raw take is
// kept with the clip so it can be re-solved later with better settings or a better model.
import { get, set, del, keys } from 'idb-keyval';
import { scheduleCreativeSync, loadCloudProject, listCloudProjects } from '../creativeCloud/cloudStore';
import type { MotionClip, RawTake } from './types';
import { compactTake } from './capture';

export interface SavedMotion { clip: MotionClip; raw?: RawTake; updatedAt: number }

const KEY = (id: string) => `plajah.mocap.${id}`;

export async function saveMotion(clip: MotionClip, raw?: RawTake): Promise<void> {
  const rec: SavedMotion = { clip, raw: raw ? compactTake(raw) : undefined, updatedAt: Date.now() };
  await set(KEY(clip.id), rec);
  scheduleCreativeSync({ kind: 'motion', localId: clip.id, title: clip.name, json: JSON.stringify(rec) });
}

export async function loadMotion(id: string): Promise<SavedMotion | null> {
  const local = (await get(KEY(id))) as SavedMotion | undefined;
  if (local) return local;
  try {
    const cloud = await loadCloudProject('motion', id);
    if (!cloud) return null;
    const rec = JSON.parse(cloud.json) as SavedMotion;
    await set(KEY(id), rec);
    return rec;
  } catch { return null; }
}

export async function listMotions(): Promise<{ id: string; name: string; updatedAt: number; frames: number; fps: number; grade: string }[]> {
  const out = new Map<string, { id: string; name: string; updatedAt: number; frames: number; fps: number; grade: string }>();
  for (const k of (await keys()) as string[]) {
    if (typeof k !== 'string' || !k.startsWith('plajah.mocap.')) continue;
    const r = (await get(k)) as SavedMotion | undefined;
    if (r) out.set(r.clip.id, { id: r.clip.id, name: r.clip.name, updatedAt: r.updatedAt, frames: r.clip.frames, fps: r.clip.fps, grade: r.clip.quality.grade });
  }
  // Clips saved on other devices show up too (opened on demand).
  try {
    for (const h of await listCloudProjects('motion')) {
      if (!out.has(h.localId)) out.set(h.localId, { id: h.localId, name: h.title || 'Motion', updatedAt: h.updatedAt ?? 0, frames: 0, fps: 30, grade: '' });
    }
  } catch { /* signed out or offline: this device's clips only */ }
  return [...out.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteMotion(id: string): Promise<void> { await del(KEY(id)); }
