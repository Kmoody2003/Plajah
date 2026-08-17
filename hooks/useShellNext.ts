/**
 * useShellNext — opt-in state for the "New" app shell (the 2026 redesign:
 * Glass Dock profile, Signal Column feed, Command Split nav pillar, and the
 * Command Player). Per-device via localStorage, exactly like {@link useChoraNext} —
 * nothing is pushed to anyone. Users enter through the "Try the new experience"
 * toggle and can switch back to Classic at any time.
 *
 * Cross-surface sync mirrors useNavLayout: a `storage` event keeps other tabs in
 * step, and a same-tab `plajah:shell-next-changed` CustomEvent keeps every mount
 * in this document consistent (so the sidebar toggle, the player, and the profile
 * all flip together without a reload).
 */
import { useCallback, useEffect, useState } from 'react';

const K_ON = 'plajah_shell_next'; // '1' = New shell, '0'/absent = Classic
const EVT = 'plajah:shell-next-changed';

function readEnabled(): boolean {
  try { return localStorage.getItem(K_ON) === '1'; } catch { return false; }
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
