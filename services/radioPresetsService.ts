import { RadioPreset } from '../types';
import { auth, fetchUserProfile, updateUserProfile } from './backendService';

const PRESET_EVENT = 'plajah:radio-presets-changed';
const DEFAULT_STORAGE_KEY = 'plajah_radio_presets_guest';

function storageKeyFor(uid?: string | null): string {
  const currentUid = uid ?? auth?.currentUser?.uid;
  return currentUid ? `plajah_radio_presets_${currentUid}` : DEFAULT_STORAGE_KEY;
}

/**
 * Get the current user's saved radio presets from localStorage (instant, sync).
 */
export function getRadioPresets(uid?: string | null): RadioPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKeyFor(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[RadioPresets] Failed to read presets from localStorage:', e);
    return [];
  }
}

function saveLocalPresets(presets: RadioPreset[], uid?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKeyFor(uid), JSON.stringify(presets));
  } catch (e) {
    console.warn('[RadioPresets] Failed to save presets to localStorage:', e);
  }
  window.dispatchEvent(new CustomEvent(PRESET_EVENT, { detail: presets }));
}

/**
 * Check if a station is currently saved in presets.
 */
export function isRadioPreset(stationId: string, uid?: string | null): boolean {
  if (!stationId) return false;
  const list = getRadioPresets(uid);
  return list.some(p => p.id === stationId);
}

/**
 * Add or update a radio preset.
 */
export async function addRadioPreset(
  station: Omit<RadioPreset, 'addedAt'>,
  uid?: string | null
): Promise<RadioPreset[]> {
  const current = getRadioPresets(uid);
  const existsIdx = current.findIndex(p => p.id === station.id);
  const newPreset: RadioPreset = {
    ...station,
    addedAt: Date.now(),
  };

  let updated: RadioPreset[];
  if (existsIdx >= 0) {
    updated = [...current];
    updated[existsIdx] = newPreset;
  } else {
    // Keep up to 24 presets, newest first
    updated = [newPreset, ...current].slice(0, 24);
  }

  saveLocalPresets(updated, uid);

  // Sync to Firestore profile if authenticated
  const targetUid = uid ?? auth?.currentUser?.uid;
  if (targetUid) {
    try {
      await updateUserProfile(targetUid, { radioPresets: updated });
    } catch (err) {
      console.warn('[RadioPresets] Firestore preset sync failed, saved locally:', err);
    }
  }

  return updated;
}

/**
 * Remove a radio preset.
 */
export async function removeRadioPreset(
  stationId: string,
  uid?: string | null
): Promise<RadioPreset[]> {
  const current = getRadioPresets(uid);
  const updated = current.filter(p => p.id !== stationId);

  saveLocalPresets(updated, uid);

  const targetUid = uid ?? auth?.currentUser?.uid;
  if (targetUid) {
    try {
      await updateUserProfile(targetUid, { radioPresets: updated });
    } catch (err) {
      console.warn('[RadioPresets] Firestore preset removal sync failed:', err);
    }
  }

  return updated;
}

/**
 * Toggle a radio station in presets.
 */
export async function toggleRadioPreset(
  station: Omit<RadioPreset, 'addedAt'>,
  uid?: string | null
): Promise<{ isPreset: boolean; presets: RadioPreset[] }> {
  const isSaved = isRadioPreset(station.id, uid);
  if (isSaved) {
    const presets = await removeRadioPreset(station.id, uid);
    return { isPreset: false, presets };
  } else {
    const presets = await addRadioPreset(station, uid);
    return { isPreset: true, presets };
  }
}

/**
 * Synchronize local presets with the user's remote Firestore profile on login / profile load.
 */
export async function syncRadioPresetsFromProfile(userUid: string): Promise<RadioPreset[]> {
  if (!userUid) return getRadioPresets(null);
  try {
    const profile = await fetchUserProfile(userUid);
    if (profile?.radioPresets && Array.isArray(profile.radioPresets)) {
      const local = getRadioPresets(userUid);
      const map = new Map<string, RadioPreset>();
      local.forEach(p => map.set(p.id, p));
      profile.radioPresets.forEach(p => map.set(p.id, p));
      const merged = Array.from(map.values()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      saveLocalPresets(merged, userUid);
      return merged;
    }
  } catch (err) {
    console.warn('[RadioPresets] Error syncing presets from profile:', err);
  }
  return getRadioPresets(userUid);
}

/**
 * Subscribe to preset changes across the app.
 */
export function subscribeRadioPresets(callback: (presets: RadioPreset[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<RadioPreset[]>;
    callback(custom.detail || getRadioPresets());
  };
  window.addEventListener(PRESET_EVENT, handler);
  callback(getRadioPresets());
  return () => window.removeEventListener(PRESET_EVENT, handler);
}
