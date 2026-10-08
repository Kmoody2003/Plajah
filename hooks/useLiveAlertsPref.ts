import { useCallback, useEffect, useState } from 'react';

// "Someone you follow is live" pop-ups. Per-device (a phone and a laptop want different answers),
// default ON so nobody loses alerts silently. TVs never show them regardless of this value.
const KEY = 'plajah_live_alerts_popups_v1';
const EVT = 'plajah-live-alerts-pref';

const read = (): boolean => {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
};

export function useLiveAlertsPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const set = useCallback((v: boolean) => {
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [on, set];
}
