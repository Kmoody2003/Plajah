import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { applyProfileMotion, getMotionPref, motionAnimates, registerMotionPersist, setMotionPref, subscribeMotion, type MotionPref } from '../../../services/motionPref';

/**
 * The person's Motion choice plus the device setting, resolved to "should things animate?".
 * Pass `account` (once, from the screen that knows the signed-in profile) to sync the choice with the
 * profile: the saved value is applied on load and every change is written back to `users/{uid}`.
 */
export function useMotion(account?: { uid?: string; saved?: unknown }) {
  const pref = useSyncExternalStore(subscribeMotion, getMotionPref, () => 'auto' as MotionPref);
  const [deviceReduced, setDeviceReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setDeviceReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const uid = account?.uid;
  const saved = account?.saved;
  useEffect(() => {
    if (!uid) return;
    applyProfileMotion(saved);
    return registerMotionPersist(p => {
      // Lazy import: keeps Firebase out of the art/preference modules and their tests.
      import('../../../services/backendService').then(m => m.updateUserProfile(uid, { motionPref: p })).catch(() => { /* saved on this device regardless */ });
    });
  }, [uid, saved]);
  const set = useCallback((p: MotionPref) => setMotionPref(p), []);
  return { pref, set, deviceReduced, animates: motionAnimates(pref, deviceReduced) };
}
