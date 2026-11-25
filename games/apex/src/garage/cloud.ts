// Cloud save for the garage: keeps the player's progress the same on every device they play Apex Elohim on (inside Plajah, signed in).
// The device copy in localStorage stays the working copy; this syncs it with the cloud save at start and after changes.
import { CloudSave, type MergeResult } from '../../../../packages/first-party-games/cloudSave';
import type { Garage } from './progress';
import type { GarageSave } from './types';

export const GAME_ID = 'apex-elohim';
export const BACKUP_KEY = 'apex.garage.backup';

/** how far along a save is: career earnings, XP, finished objectives, runs, medals and cars all count */
export function progressScore(s: GarageSave): number {
  return (s.stats?.creditsEarned ?? 0) + (s.xp ?? 0) * 10 + (s.completed?.length ?? 0) * 500 + (s.stats?.runs ?? 0) * 50 + Object.keys(s.medals ?? {}).length * 300 + (s.cars?.length ?? 0) * 200;
}
function parse(json: string | null): GarageSave | null {
  if (!json) return null;
  try { const s = JSON.parse(json) as GarageSave; return s && s.v === 1 && Array.isArray(s.cars) ? s : null; } catch { return null; }
}
/** two saves of the same player: the one further along wins (ties go to the cloud). The caller keeps the other as a backup. */
export function mergeGarageJson(localJson: string | null, cloudJson: string): MergeResult {
  const l = parse(localJson), c = parse(cloudJson);
  if (!c) return { json: localJson ?? cloudJson, source: 'local' };
  if (!l) return { json: cloudJson, source: 'cloud' };
  return progressScore(l) > progressScore(c) ? { json: localJson!, source: 'local' } : { json: cloudJson, source: 'cloud' };
}

export function attachCloud(garage: Garage, cloud: CloudSave = new CloudSave(GAME_ID), store: Pick<Storage, 'setItem'> | null = safe()): CloudSave {
  let applying = false;
  garage.subscribe(() => { if (!applying) cloud.save(garage.exportJson()); });
  void cloud.sync(garage.exportJson(), mergeGarageJson).then((r) => {
    if (!r.available || !r.json || r.source === 'local' || r.source === 'none') return;
    const mine = garage.exportJson();
    if (r.json === mine) return;
    try { store?.setItem(BACKUP_KEY, mine); } catch { /* storage blocked */ }       // never lose the copy we are replacing
    applying = true;
    try { garage.importJson(r.json); } finally { applying = false; }
  });
  return cloud;
}

function safe(): Storage | null { try { return localStorage; } catch { return null; } }
