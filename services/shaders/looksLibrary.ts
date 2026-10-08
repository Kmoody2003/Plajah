// looksLibrary — the Chora "Looks" engine's preset list: the validated house set, plus any looks the user
// (or the council) saved, plus per-track pins. Pure data + localStorage; no GPU, no library import, so the
// preset NAMES are available to the engine selector without pulling the WebGPU library into the player.

import { STARTER_LOOKS, type ShaderLook } from './shaderLooks';
import { validateLook } from './shaderLookSchema';

/** The house set, run through the same validator as everything else (derives fallbackCss, flags needsCover). */
export const HOUSE_LOOKS: ShaderLook[] = STARTER_LOOKS
  .map(l => validateLook(l).look)
  .filter((l): l is ShaderLook => !!l);

const SAVED_KEY = 'plajah.looks.saved.v1';
const PIN_KEY = 'plajah.looks.pins.v1';
const MAX_SAVED = 40;

const read = <T,>(key: string, fallback: T): T => {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : fallback; } catch { return fallback; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode / quota — saving is a convenience */ } };

/** Saved looks are re-validated on load: storage is user-editable, and the catalog can change with a library bump. */
export function loadSavedLooks(): ShaderLook[] {
  const raw = read<unknown[]>(SAVED_KEY, []);
  return raw.map(r => validateLook(r).look).filter((l): l is ShaderLook => !!l);
}

/** House looks first (so preset indices stay stable), saved after. */
export function getLookLibrary(): ShaderLook[] {
  const saved = loadSavedLooks().filter(s => !HOUSE_LOOKS.some(h => h.id === s.id));
  return [...HOUSE_LOOKS, ...saved];
}

export function saveLook(look: ShaderLook): ShaderLook | null {
  const v = validateLook(look).look; // never persist anything that did not pass the contract
  if (!v) return null;
  const id = HOUSE_LOOKS.some(h => h.id === v.id) ? `${v.id}-${Date.now().toString(36)}` : v.id;
  const next = [{ ...v, id }, ...loadSavedLooks().filter(s => s.id !== id)].slice(0, MAX_SAVED);
  write(SAVED_KEY, next);
  notify();
  return { ...v, id };
}

export function deleteSavedLook(id: string) {
  write(SAVED_KEY, loadSavedLooks().filter(s => s.id !== id));
  notify();
}

export const pinLookForTrack = (trackId: string, lookId: string | null) => {
  const pins = read<Record<string, string>>(PIN_KEY, {});
  if (lookId) pins[trackId] = lookId; else delete pins[trackId];
  write(PIN_KEY, pins);
};
export const pinnedLookId = (trackId?: string | null): string | null => (trackId ? read<Record<string, string>>(PIN_KEY, {})[trackId] ?? null : null);

// FX_ENGINE_PRESETS.LOOKS must stay current when looks are saved; subscribers (FxStageVisualizers) refresh it.
const listeners = new Set<() => void>();
export const onLooksChanged = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function notify() { listeners.forEach(f => { try { f(); } catch { /* a bad listener must not break saving */ } }); }
