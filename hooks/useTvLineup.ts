/**
 * useTvLineup — state for the "Spine" TV shell: a persistent left rail of
 * surfaces (Search/Taleo/Chora/Reello/Live/Settings) replacing the fixed top
 * tab bar. This is the direction picked from the three TV redesign mockups
 * (Evolution/Spine/Channels) — "Lineup", built on Spine's persistent rail.
 *
 * Per-device via localStorage, mirroring {@link useShellNext} and
 * {@link useChoraNext} exactly, with one deliberate difference: DEFAULT OFF.
 *
 * The desktop shell redesign could default-on because a bad desktop layout
 * costs a browser refresh. This is the nav on someone's only physical
 * television, verified so far only by reading the code and by the documented
 * adb/CDP limits (see plajah-tv-navigation) — synthetic key dispatch doesn't
 * reach the real hardware, so this has never been pressed with the actual
 * remote. Shipping it default-on risks landing someone on a screen they can't
 * navigate out of with no keyboard to fall back on. Opt-in first; flip the
 * default only after it's been driven on a real TV.
 *
 * Cross-surface sync: a `storage` event keeps other tabs in step, and a
 * same-tab `plajah:tv-lineup-changed` CustomEvent keeps every mount in this
 * document consistent.
 */
import { useCallback, useEffect, useState } from 'react';

const K_ON = 'plajah_tv_lineup'; // '1' = Spine shell; '0'/absent = classic top tabs (default)
const EVT = 'plajah:tv-lineup-changed';

function readEnabled(): boolean {
  try { return localStorage.getItem(K_ON) === '1'; } catch { return false; }
}

export function useTvLineup() {
  const [enabled, setEnabledState] = useState<boolean>(readEnabled);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === K_ON) setEnabledState(readEnabled()); };
    const onLocal = () => setEnabledState(readEnabled());
    window.addEventListener('storage', onStorage);
    window.addEventListener(EVT, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(EVT, onLocal);
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(K_ON, v ? '1' : '0'); } catch { /* private mode */ }
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: v })); } catch { /* */ }
  }, []);

  return { enabled, setEnabled };
}

/** Non-hook read, for call sites outside a component (rare, but useShellNext has no equivalent
 *  need — this shell has to be read from inside plain functions too, see TvSpine's width export). */
export function isTvLineupEnabled(): boolean {
  return readEnabled();
}
