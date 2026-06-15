// engine/timeline/timeline.ts — holds markers, evaluates the active one at a
// given time, and applies its ParamDiff. Live params ease toward TARGET so a
// marker reads as smooth automation rather than a hard jump.

import { Marker, ParamDiff } from './types';
import { VizParams } from '../params';

/** Params the timeline eases toward (rest of the diff is applied instantly). */
export interface EaseTarget { speed: number; glow: number; trail: number; sens: number; }

export interface TimelineHooks {
  /** switch to a scene by id (string from the diff) */
  setScene: (id: string) => void;
  /** set palette index */
  setPalette: (i: number) => void;
  /** params object to mutate directly for instant fields (mirror, etc.) */
  params: VizParams;
  /** ease targets the render loop interpolates toward */
  target: EaseTarget;
  /** optional toast / notification */
  onApply?: (m: Marker) => void;
}

export class Timeline {
  markers: Marker[] = [];
  active: Marker | null = null;

  constructor(private hooks: TimelineHooks) {}

  add(time: number, marker: Marker) {
    marker.time = time;
    this.markers.push(marker);
    this.markers.sort((a, b) => a.time - b.time);
    return marker;
  }
  remove(m: Marker) { this.markers = this.markers.filter(x => x !== m); }
  clear() { this.markers = []; this.active = null; }

  /** Find the latest marker <= t; when it changes, apply its diff once. */
  evaluate(t: number) {
    let cur: Marker | null = null;
    for (const m of this.markers) { if (m.time <= t) cur = m; else break; }
    if (cur !== this.active) {
      this.active = cur;
      if (cur) this.apply(cur.diff);
    }
    return cur;
  }

  apply(d: ParamDiff) {
    const { setScene, setPalette, params, target } = this.hooks;
    if (d.scene) setScene(d.scene);
    if (d.palette != null) setPalette(d.palette);
    for (const [k, v] of Object.entries(d.set)) {
      if (k === 'mirror') params.mirror = !!v;
      else if (k === 'flash') params.flash = !!v;
      else if (k === 'sens') target.sens = v as number;
      else if (k in target) (target as any)[k] = v as number;
    }
    this.hooks.onApply?.({ time: 0, label: d.label, diff: d });
  }
}

/** Ease live params toward their targets — call once per frame. */
export function easeParams(P: VizParams, T: EaseTarget, rate = 0.05) {
  P.speed += (T.speed - P.speed) * rate;
  P.glow += (T.glow - P.glow) * rate;
  P.trail += (T.trail - P.trail) * rate;
  P.sens += (T.sens - P.sens) * rate;
}

/** A ready-made 8-beat "auto-pilot" show, spread across the track duration. */
export const AUTOPILOT_SCRIPT = [
  'calm aurora intro in ocean blue',
  'build tension, faster',
  'drop hard, kinetic, violet',
  'liquid plasma flow',
  'tranquil breakdown, dark',
  'sunset nebula, bright',
  'kaleido mirror peak',
  'ripple outro, slow',
];
