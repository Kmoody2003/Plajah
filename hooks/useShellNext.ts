/**
 * useShellNext — state for the "New" app shell (the 2026 redesign: Glass Dock
 * profile, Signal Column feed, Command Split nav pillar, and the Command Player).
 * Per-device via localStorage, like {@link useChoraNext}.
 *
 * DEFAULT: ON. As of 2026-08 the New shell ships on by default for everyone;
 * only a user who has explicitly switched back to Classic (persisted as '0')
 * stays on Classic. The "Switch back to Classic" control remains available in
 * the pillar so anyone can revert, and the "Try New Nav" entry lets a reverted
 * user return.
 *
 * Cross-surface sync mirrors useNavLayout: a `storage` event keeps other tabs in
 * step, and a same-tab `plajah:shell-next-changed` CustomEvent keeps every mount
 * in this document consistent (so the sidebar toggle, the player, and the profile
 * all flip together without a reload).
 */
import { useCallback, useEffect, useState } from 'react';

const K_ON = 'plajah_shell_next'; // '0' = user reverted to Classic; '1'/absent = New shell (default)
const EVT = 'plajah:shell-next-changed';

function readEnabled(): boolean {
  // Default ON: only an explicit '0' (a user who chose Classic) opts out.
  try { return localStorage.getItem(K_ON) !== '0'; } catch { return true; }
}

export function useShellNext() {
  const [enabled, setEnabledState] = useState<boolean>(readEnabled);

  // Keep every mount (and other tabs) in sync when the preference changes.
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
