// Melos Beats — automation playback, shared by the live engine and the offline bounce.
//
//   Param targets (volume, pan, sends, CC11 expression) are Web Audio AudioParams on the track
//   strip, scheduled AHEAD as linear ramps through the transport's beat→time map, so they're
//   sample-accurate live and print identically in a bounce.
//   Message targets (instrument macros, mod wheel, pitch bend) are instrument messages: live they
//   are sent on the engine tick; offline the bounce suspends the context at each change.

import type { ArrangeTrack, AutomationTarget, GrooveDoc, TrackAutomationLane } from '../grooveDoc';
import { docEffectiveLanes, isMessageTarget, isParamTarget, laneDbToGain, laneRamps, laneValueAt, targetKey } from '../automation';
import { dbToGain, trackAudible, type BeatsGraph } from './graph';

export type ParamName = 'volume' | 'pan' | 'send0' | 'send1';

/** Volume lanes interpolate in dB; densify so the linear-gain ramps follow the dB curve. */
const VOLUME_STEP = 1 / 8;

const paramOf = (graph: BeatsGraph, trackId: string, t: AutomationTarget): AudioParam | null => {
  const strip = graph.tracks.get(trackId);
  if (!strip) return null;
  if (t.kind === 'volume') return strip.gain.gain;
  if (t.kind === 'pan') return strip.pan.pan;
  if (t.kind === 'send') return strip.sends[t.index]?.gain ?? null;
  if (t.kind === 'expression') return strip.input.gain;
  return null;
};

const toParamValue = (t: AutomationTarget, v: number) =>
  t.kind === 'volume' ? laneDbToGain(v) : t.kind === 'pan' ? Math.max(-1, Math.min(1, v)) : t.kind === 'send' ? Math.max(0, Math.min(2, v)) : Math.max(0, v);

export class AutomationPlayer {
  private lanes = new Map<string, Map<string, TrackAutomationLane>>();
  private sent = new Map<string, number>(); // message targets: last value sent (track:key)

  /** Recompute the effective lanes (track lanes + clip CC lanes) — call on every doc change. */
  refresh(doc: GrooveDoc): void {
    this.lanes = docEffectiveLanes(doc);
  }

  /** For graph.applyDoc: params a lane owns. */
  automated = (trackId: string, param: ParamName): boolean => {
    const l = this.lanes.get(trackId);
    if (!l) return false;
    return l.has(param === 'volume' ? 'volume' : param === 'pan' ? 'pan' : param === 'send0' ? 'send:0' : 'send:1');
  };

  lanesFor(trackId: string): Map<string, TrackAutomationLane> | undefined { return this.lanes.get(trackId); }

  /**
   * Schedule every param lane from `fromBeat` (heard at audio time `atTime`) until `untilBeat`.
   * Anything already scheduled after `atTime` is replaced, so this is also the re-schedule after
   * an edit, a tempo change or a loop wrap.
   */
  scheduleParams(doc: GrooveDoc, graph: BeatsGraph, fromBeat: number, atTime: number, untilBeat: number, toTime: (b: number) => number): void {
    for (const [trackId, lanes] of this.lanes) {
      const track = doc.arrangement.find((t) => t.id === trackId);
      if (!track) continue;
      const audible = trackAudible(doc, track);
      for (const lane of lanes.values()) {
        if (!isParamTarget(lane.target)) continue;
        const param = paramOf(graph, trackId, lane.target);
        if (!param) continue;
        try { param.cancelScheduledValues(atTime); } catch { /* */ }
        if (lane.target.kind === 'volume' && !audible) { param.setValueAtTime(0, atTime); continue; }
        const pts = densify(lane, laneRamps(lane, fromBeat, untilBeat));
        if (!pts.length) continue;
        param.setValueAtTime(toParamValue(lane.target, pts[0].value), atTime);
        let lastT = atTime;
        for (let i = 1; i < pts.length; i++) {
          const t = Math.max(lastT, toTime(pts[i].beat));
          const v = toParamValue(lane.target, pts[i].value);
          // A step (two points on one beat) is a set, not a ramp.
          if (Math.abs(pts[i].beat - pts[i - 1].beat) < 1e-9) param.setValueAtTime(v, t);
          else param.linearRampToValueAtTime(v, t);
          lastT = t;
        }
      }
    }
  }

  /** Transport stopped / parked: every automated param jumps to its lane value at `beat`. */
  parkParams(doc: GrooveDoc, graph: BeatsGraph, beat: number, now: number): void {
    for (const [trackId, lanes] of this.lanes) {
      const track = doc.arrangement.find((t) => t.id === trackId);
      if (!track) continue;
      for (const lane of lanes.values()) {
        if (!isParamTarget(lane.target)) continue;
        const param = paramOf(graph, trackId, lane.target);
        if (!param) continue;
        try { param.cancelScheduledValues(now); } catch { /* */ }
        if (lane.target.kind === 'volume' && !trackAudible(doc, track)) { param.setValueAtTime(0, now); continue; }
        const v = laneValueAt(lane, beat);
        if (v !== undefined) param.setValueAtTime(toParamValue(lane.target, v), now);
      }
    }
  }

  /** Clear schedules on params that LOST their lane, restoring the static mixer value. */
  releaseParams(doc: GrooveDoc, graph: BeatsGraph, now: number, before: Map<string, Map<string, TrackAutomationLane>>): void {
    for (const [trackId, lanes] of before) {
      const track = doc.arrangement.find((t) => t.id === trackId);
      const strip = graph.tracks.get(trackId);
      if (!track || !strip) continue;
      const still = this.lanes.get(trackId);
      for (const [key, lane] of lanes) {
        if (still?.has(key) || !isParamTarget(lane.target)) continue;
        const param = paramOf(graph, trackId, lane.target);
        if (!param) continue;
        try { param.cancelScheduledValues(0); } catch { /* */ }
        const v = lane.target.kind === 'volume' ? (trackAudible(doc, track) ? dbToGain(track.gainDb) : 0)
          : lane.target.kind === 'pan' ? track.pan
            : lane.target.kind === 'send' ? (track.sends?.[lane.target.index] ?? 0)
              : 1;
        param.setValueAtTime(v, now);
      }
    }
  }

  snapshot(): Map<string, Map<string, TrackAutomationLane>> { return this.lanes; }

  /**
   * Live message targets: send each instrument the lane value at `beat` when it changed. Called
   * from the engine tick (block-rate ≈ 21 ms) — fine for macros and wheels; the AudioParam
   * targets carry anything that needs sample accuracy.
   */
  sendMessages(beat: number, send: (track: ArrangeTrack | undefined, trackId: string, t: AutomationTarget, v: number) => boolean, doc: GrooveDoc): void {
    for (const [trackId, lanes] of this.lanes) {
      for (const lane of lanes.values()) {
        if (!isMessageTarget(lane.target)) continue;
        const v = laneValueAt(lane, beat);
        if (v === undefined) continue;
        const k = `${trackId}:${targetKey(lane.target)}`;
        const last = this.sent.get(k);
        if (last !== undefined && Math.abs(last - v) < 0.002) continue;
        // Only remember it once it reached an instrument (one still loading gets it next tick).
        if (send(doc.arrangement.find((t) => t.id === trackId), trackId, lane.target, v)) this.sent.set(k, v);
      }
    }
  }

  /** Forget what was sent (next tick re-sends everything — after play/seek/wrap). */
  resetMessages(): void { this.sent.clear(); }
}

/** Volume: add points every VOLUME_STEP beats inside ramps so linear gain tracks the dB curve. */
function densify(lane: TrackAutomationLane, pts: { beat: number; value: number }[]): { beat: number; value: number }[] {
  if (lane.target.kind !== 'volume' || pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.beat - a.beat > VOLUME_STEP * 1.5 && Math.abs(b.value - a.value) > 0.5) {
      for (let x = a.beat + VOLUME_STEP; x < b.beat - 1e-9; x += VOLUME_STEP) {
        out.push({ beat: x, value: a.value + (b.value - a.value) * ((x - a.beat) / (b.beat - a.beat)) });
      }
    }
    out.push(b);
  }
  return out;
}

/** Apply one message-target value to an instrument (live and offline share this). */
export function applyMessage(inst: { setMacro(i: number, v: number): void; setModWheel(v: number): void; setPitchBend(v: number): void }, t: AutomationTarget, v: number): void {
  if (t.kind === 'macro') inst.setMacro(t.index, v);
  else if (t.kind === 'mod-wheel') inst.setModWheel(v);
  else if (t.kind === 'pitch-bend') inst.setPitchBend(v);
}
