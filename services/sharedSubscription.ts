// sharedSubscription — one upstream listener per key, fanned out to every subscriber (ref-counted).
//
// Why: the chat-room list query was opened by ChatSystem, ChatFlyout and GlobalPlayer at the same time —
// three identical Firestore watch targets, three times the reads on every room update. Wrapping the
// listener in sharedSubscription() keeps ONE upstream subscription per key; late subscribers get the last
// value replayed immediately; the upstream is torn down when the last subscriber leaves.
// Pure (no Firebase) so it's unit-testable.

type Unsub = () => void;
interface Entry<T> { subs: Set<(v: T) => void>; stop: Unsub | null; has: boolean; last?: T }
const registry = new Map<string, Entry<any>>();

export function sharedSubscription<T>(key: string, start: (emit: (v: T) => void) => Unsub, cb: (v: T) => void): Unsub {
  let e = registry.get(key) as Entry<T> | undefined;
  if (!e) {
    e = { subs: new Set(), stop: null, has: false };
    registry.set(key, e);
    const entry = e;
    entry.subs.add(cb);
    entry.stop = start(v => {
      entry.last = v; entry.has = true;
      for (const s of [...entry.subs]) { try { s(v); } catch (err) { console.warn('[sharedSubscription]', key, err); } }
    });
  } else {
    e.subs.add(cb);
    if (e.has) { try { cb(e.last as T); } catch (err) { console.warn('[sharedSubscription]', key, err); } }
  }
  const entry = e;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    entry.subs.delete(cb);
    if (entry.subs.size === 0 && registry.get(key) === entry) {
      registry.delete(key);
      try { entry.stop?.(); } catch { /* */ }
    }
  };
}

/** Test hook: how many upstream listeners are open. */
export const sharedSubscriptionCount = (): number => registry.size;
