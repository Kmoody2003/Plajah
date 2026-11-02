// The browser's side of the Media Library trash. routes/mediaTrash.ts does the work.
import { auth } from './firebase';
import type { MediaKind } from './mediaTrashPolicy';

export interface MediaTrashItem {
  id: string;
  kind: MediaKind;
  sourceId: string;
  title: string;
  cover?: string;
  deletedAt: number;
  retentionDeleteAt: number;
}

async function send(path: string, body?: unknown): Promise<any> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/media/trash${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'That could not be completed.');
  return data;
}

export const moveMediaToTrash = (kind: MediaKind, id: string) => send('/', { kind, id });
export const listMediaTrash = async (): Promise<MediaTrashItem[]> => (await send('/')).items;
export const restoreMedia = (id: string) => send('/restore', { id });
export const purgeMedia = (id: string) => send('/purge', { id });
