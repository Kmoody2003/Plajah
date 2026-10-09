/**
 * motionPref — the in-app Motion switch for creator-course art and card animation.
 *
 *   auto  follow the device's "reduce motion" setting (the default, and the accessible one)
 *   on    always animate, whatever the device says (the person chose it, in the app)
 *   off   never animate
 *
 * Stored per device in localStorage (wrapped in try/catch: private windows and blocked storage must
 * not break the page). The chosen mode is pushed into creatorArt, which bakes it into the generated
 * SVGs, because an SVG used as an <img> cannot see anything outside itself.
 */
import { setArtMotion, type ArtMotion } from './creatorArt';

export type MotionPref = ArtMotion;
export const MOTION_KEY = 'plajah.motion';
export const MOTION_PREFS: MotionPref[] = ['auto', 'on', 'off'];

export const isMotionPref = (v: unknown): v is MotionPref => v === 'auto' || v === 'on' || v === 'off';

/** Whether anything should animate, given the person's choice and the device's setting. */
export const motionAnimates = (pref: MotionPref, deviceReduced: boolean): boolean =>
  pref === 'on' ? true : pref === 'off' ? false : !deviceReduced;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

let current: MotionPref = 'auto';
const listeners = new Set<() => void>();

export function readMotionPref(s: Store | null = store()): MotionPref {
  try { const v = s?.getItem(MOTION_KEY); return isMotionPref(v) ? v : 'auto'; } catch { return 'auto'; }
}

export const getMotionPref = (): MotionPref => current;

let persist: ((p: MotionPref) => void) | null = null;

/**
 * Register where a CHOICE is saved beyond this device (the signed-in profile). Returns an unregister
 * function. Only choices made through setMotionPref are persisted: applying the saved profile value on
 * load (applyProfileMotion) never writes it back.
 */
export function registerMotionPersist(fn: (p: MotionPref) => void): () => void {
  persist = fn;
  return () => { if (persist === fn) persist = null; };
}

export function setMotionPref(p: MotionPref, s: Store | null = store(), opts: { persist?: boolean } = {}): void {
  if (!isMotionPref(p)) return;
  current = p;
  setArtMotion(p);
  try { s?.setItem(MOTION_KEY, p); } catch { /* storage blocked: the choice still applies for this session */ }
  listeners.forEach(l => l());
  if (opts.persist !== false) { try { persist?.(p); } catch { /* the device copy already holds the choice */ } }
}

/** Apply the value saved on the profile (the profile wins once signed in). Does not write it back. */
export function applyProfileMotion(saved: unknown, s: Store | null = store()): boolean {
  if (!isMotionPref(saved) || saved === current) return false;
  setMotionPref(saved, s, { persist: false });
  return true;
}

export function subscribeMotion(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Apply the saved choice as soon as the module loads, before the first image is generated.
current = readMotionPref();
setArtMotion(current);
