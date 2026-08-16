/**
 * useChoraNext — opt-in state for the "Chora Next" UI (the Listening Room skin
 * with its Observatory night variant). Per-device via localStorage; nothing is
 * pushed to anyone — users enter through the "Try the new Chora" button and
 * can switch back at any time.
 *
 * mode: 'auto' follows the clock (night = 19:00–07:00 local), or force
 * 'day' / 'night' via the masthead toggle.
 */
import { useEffect, useState } from 'react';

export type ChoraNextMode = 'auto' | 'day' | 'night';

const K_ON = 'chora_next_ui';
const K_MODE = 'chora_next_mode';

export const isNightNow = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 7;
};

export function useChoraNext() {
  const [enabled, setEnabledState] = useState(() => {
    try { return localStorage.getItem(K_ON) === '1'; } catch { return false; }
  });
  const [mode, setModeState] = useState<ChoraNextMode>(() => {
    try { return (localStorage.getItem(K_MODE) as ChoraNextMode) || 'auto'; } catch { return 'auto'; }
  });
  const [night, setNight] = useState(isNightNow);

  // Keep auto-night fresh while the page stays open across the boundary.
  useEffect(() => {
    if (mode !== 'auto') return;
    setNight(isNightNow());
    const t = window.setInterval(() => setNight(isNightNow()), 60_000);
    return () => window.clearInterval(t);
  }, [mode]);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(K_ON, v ? '1' : '0'); } catch { /* private mode */ }
  };
  const setMode = (m: ChoraNextMode) => {
    setModeState(m);
    try { localStorage.setItem(K_MODE, m); } catch { /* private mode */ }
  };
  const cycleMode = () => setMode(mode === 'auto' ? 'day' : mode === 'day' ? 'night' : 'auto');

  const isNight = mode === 'night' || (mode === 'auto' && night);
  return { enabled, setEnabled, mode, setMode, cycleMode, isNight };
}
