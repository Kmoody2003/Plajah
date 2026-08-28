/**
 * Global demo-mode preference — the single switch that governs whether Plajah's
 * showcase/demo data is shown across the app (Creator Hub productions, Artist
 * Manager's music/film/writer demos, etc.).
 *
 * Persisted to localStorage; default ON so new/empty accounts see a populated,
 * explorable product. Flipping it broadcasts a `plajah:demoModeChanged` event
 * (and rides the native `storage` event for cross-tab sync) so any mounted
 * surface can react live.
 */
export const DEMO_MODE_KEY = 'plajah_demo_mode_v1';
export const DEMO_MODE_EVENT = 'plajah:demoModeChanged';

/** Whether demo/showcase data should be shown. Defaults to ON (true) unless the
 *  user has explicitly turned it off. Safe when storage is unavailable. */
export function isDemoMode(): boolean {
  try { return localStorage.getItem(DEMO_MODE_KEY) !== '0'; } catch { return true; }
}

/** Persist the preference and notify listeners (this tab + other tabs). */
export function setDemoMode(on: boolean): void {
  try { localStorage.setItem(DEMO_MODE_KEY, on ? '1' : '0'); } catch { /* storage disabled */ }
  try { window.dispatchEvent(new CustomEvent(DEMO_MODE_EVENT, { detail: { on } })); } catch { /* no window */ }
}

/** Subscribe to demo-mode changes. Returns an unsubscribe fn. Fires for both
 *  in-tab toggles (custom event) and cross-tab changes (storage event). */
export function subscribeDemoMode(cb: (on: boolean) => void): () => void {
  const handler = () => cb(isDemoMode());
  const storageHandler = (e: StorageEvent) => { if (!e || e.key === DEMO_MODE_KEY) cb(isDemoMode()); };
  try {
    window.addEventListener(DEMO_MODE_EVENT, handler as EventListener);
    window.addEventListener('storage', storageHandler);
  } catch { /* no window */ }
  return () => {
    try {
      window.removeEventListener(DEMO_MODE_EVENT, handler as EventListener);
      window.removeEventListener('storage', storageHandler);
    } catch { /* no window */ }
  };
}
