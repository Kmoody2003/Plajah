import { onSnapshot as rawOnSnapshot } from 'firebase/firestore';

// Firestore's watch stream can corrupt itself after quota/permission errors
// (firebase-js-sdk bug: INTERNAL ASSERTION FAILED ca9/b815) and then throw
// SYNCHRONOUSLY from any later onSnapshot registration — which crashes the
// React tree that subscribed (readers, players, feeds). Import onSnapshot
// from this module instead of 'firebase/firestore': a failed registration
// logs and returns a no-op unsubscribe. Realtime updates degrade gracefully;
// the UI survives.
export const onSnapshot: typeof rawOnSnapshot = ((...args: any[]) => {
  try {
    return (rawOnSnapshot as any)(...args);
  } catch (e) {
    console.warn('[safeSnapshot] subscription failed:', (e as Error)?.message?.slice(0, 200));
    return () => {};
  }
}) as typeof rawOnSnapshot;
