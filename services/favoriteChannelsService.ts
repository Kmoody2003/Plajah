import type { FavoriteChannel } from '../types';
import { auth, updateUserProfile, fetchUserProfile } from './backendService';

// A viewer's starred TV+ channels. Same shape as radioPresetsService: instant from localStorage,
// mirrored to the profile (`favoriteChannels`) so the profile row can show them to visitors.

const EVENT = 'plajah:favorite-channels-changed';
const MAX = 48;

const keyFor = (uid?: string | null) => {
  const u = uid ?? auth?.currentUser?.uid;
  return u ? `plajah_fav_channels_${u}` : 'plajah_fav_channels_guest';
};

export function getFavoriteChannels(uid?: string | null): FavoriteChannel[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(uid)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveLocal(list: FavoriteChannel[], uid?: string | null) {
  try { localStorage.setItem(keyFor(uid), JSON.stringify(list)); } catch { /* private mode / quota — still notify */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: list }));
}

async function syncRemote(list: FavoriteChannel[], uid?: string | null) {
  const target = uid ?? auth?.currentUser?.uid;
  if (!target) return;
  try {
    // Firestore rejects undefined — keep only defined fields.
    const clean = list.map(f => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined))) as unknown as FavoriteChannel[];
    await updateUserProfile(target, { favoriteChannels: clean });
  } catch (e) { console.warn('[favoriteChannels] sync failed, kept locally', e); }
}

export const isFavoriteChannel = (key: string, uid?: string | null) => getFavoriteChannels(uid).some(f => f.key === key);

export async function toggleFavoriteChannel(fav: Omit<FavoriteChannel, 'addedAt'>, uid?: string | null): Promise<boolean> {
  const cur = getFavoriteChannels(uid);
  const has = cur.some(f => f.key === fav.key);
  const next = has ? cur.filter(f => f.key !== fav.key) : [{ ...fav, addedAt: Date.now() }, ...cur].slice(0, MAX);
  saveLocal(next, uid);
  await syncRemote(next, uid);
  return !has;
}

/** Pull the account's saved favorites into this device (new device / after sign-in). */
export async function syncFavoriteChannelsFromProfile(uid: string): Promise<FavoriteChannel[]> {
  if (!uid) return getFavoriteChannels(null);
  try {
    const profile = await fetchUserProfile(uid);
    const remote = (profile as any)?.favoriteChannels;
    if (Array.isArray(remote)) {
      const map = new Map<string, FavoriteChannel>();
      getFavoriteChannels(uid).forEach(f => map.set(f.key, f));
      remote.forEach((f: FavoriteChannel) => { if (f?.key) map.set(f.key, f); });
      const merged = [...map.values()].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, MAX);
      saveLocal(merged, uid);
      return merged;
    }
  } catch (e) { console.warn('[favoriteChannels] profile sync failed', e); }
  return getFavoriteChannels(uid);
}

export function subscribeFavoriteChannels(cb: (list: FavoriteChannel[]) => void, uid?: string | null): () => void {
  if (typeof window === 'undefined') return () => {};
  const on = (e: Event) => cb(((e as CustomEvent).detail as FavoriteChannel[]) || getFavoriteChannels(uid));
  window.addEventListener(EVENT, on);
  cb(getFavoriteChannels(uid));
  return () => window.removeEventListener(EVENT, on);
}
