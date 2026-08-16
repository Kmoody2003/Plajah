// Muse cloud source — list the owner's locker samples so the library can browse them like a
// folder. Only the audio samples prefix is listed (the KERA prefix holds an exact-float binary
// format, not decodable audio). Scoped to the signed-in user's own path; nothing else is visible.

import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../../../firebase';

export interface CloudAssetLite { name: string; path: string; }

export const cloudSupported = (): boolean => !!auth.currentUser;

/** List the user's backed-up Beats samples from their private locker. */
export async function listCloudAssets(): Promise<CloudAssetLite[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const out: CloudAssetLite[] = [];
  try {
    const res = await listAll(ref(storage, `personal/${uid}/melos/beats/samples`));
    for (const item of res.items) {
      const raw = item.name; // backupToLocker names them {hash}_{safeName}
      const name = (raw.includes('_') ? raw.split('_').slice(1).join('_') : raw).replace(/\.[^.]+$/, '');
      out.push({ name: name || raw, path: item.fullPath });
    }
  } catch { /* the prefix may not exist yet — no backups */ }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Resolve a locker item to a File for decode / audition / add. */
export async function resolveCloudFile(path: string, name: string): Promise<File | null> {
  try {
    const url = await getDownloadURL(ref(storage, path));
    const r = await fetch(url);
    if (!r.ok) return null;
    return new File([await r.blob()], name);
  } catch {
    return null;
  }
}
