// Thin read-only helpers so hub-level stats don't import the whole Voca runtime.
import { loadLocal as _loadLocal, type VocaProgress } from './vocaProgress';
import { loadCloud, pickNewer } from './vocaCloud';

export const loadLocal = (uid?: string): VocaProgress | null => _loadLocal(uid);

/** Newest of the local copy and the cloud copy; never throws (rules may deny a non-guardian). */
export async function loadCloudSafe(uid: string): Promise<VocaProgress | null> {
  try { return pickNewer(_loadLocal(uid), await loadCloud(uid)) ?? null; } catch { return _loadLocal(uid); }
}
