// Melos Beats — modulators at work, shared by the live engine and the bounce. Same value function
// on both sides (modulators.ts): live writes the value every timer tick on the main thread, offline
// prints it ahead of the render. Audio params glide; instrument parameters ride frame-timed messages.

import type { ArrangeTrack, GrooveDoc } from '../grooveDoc';
import type { Instrument } from './InstrumentHost';
import type { FxNode, FxInstance } from '../fx/devices';
import { modTargetKey, modulatorPoints, modulatorValue, paramWrites, type ModTarget, type Modulator } from '../modulators';
import { isMessageTarget, isParamTarget, targetSpec } from '../automation';
import { applyMessage, paramOf, toParamValue } from './automationPlayer';
import { dbToGain, trackAudible, type BeatsGraph } from './graph';

export interface ModHost {
  graph: BeatsGraph;
  inst(trackId: string): Instrument | null;
  fxNode(t: Extract<ModTarget, { kind: 'fx' }>): FxNode | undefined;
}

const clampAudio = (t: ModTarget, v: number): number => {
  if (t.kind === 'pad') return t.field === 'gainDb' ? dbToGain(v) : Math.max(-1, Math.min(1, v));
  if (t.kind === 'mixer') return dbToGain(v);
  return v;
};

/** Where an FX target's saved params live, so one live write can carry the rest of them. */
export function fxInstance(doc: GrooveDoc, t: Extract<ModTarget, { kind: 'fx' }>): FxInstance | undefined {
  const list = t.scope === 'track' ? doc.arrangement.find((x) => x.id === t.owner)?.inserts
    : t.scope === 'pad' ? doc.kit[Number(t.owner)]?.inserts
      : t.scope === 'group' ? doc.mixer.groups[Number(t.owner)]?.inserts
        : doc.mixer.sendBuses?.[Number(t.owner)]?.inserts;
  return list?.find((f) => f.id === t.fxId);
}

const padParam = (graph: BeatsGraph, t: Extract<ModTarget, { kind: 'pad' }>): AudioParam | null => {
  const s = graph.pads[t.padIdx];
  if (!s) return null;
  return t.field === 'gainDb' ? s.gain.gain : s.pan.pan;
};

const mixerParam = (graph: BeatsGraph, t: Extract<ModTarget, { kind: 'mixer' }>): AudioParam | null =>
  (t.scope === 'group' ? graph.groups[t.index]?.gain : graph.master.fader?.gain) ?? null;

export class ModulationPlayer {
  private last = new Map<string, number>();

  reset(): void { this.last.clear(); }

  /** Write every modulator's current value. */
  tick(doc: GrooveDoc, beat: number, sec: number, now: number, host: ModHost): void {
    for (const m of doc.modulators ?? []) {
      if (!m.on) continue;
      const v = modulatorValue(m, beat, sec);
      const t = m.target;
      const key = modTargetKey(t);
      const span = Math.abs(m.max - m.min) || 1;
      const prev = this.last.get(key);
      if (prev !== undefined && Math.abs(prev - v) < span * 0.002) continue;
      if (this.write(doc, t, v, now, host)) this.last.set(key, v);
    }
  }

  private write(doc: GrooveDoc, t: ModTarget, v: number, now: number, host: ModHost): boolean {
    switch (t.kind) {
      case 'track': {
        if (isParamTarget(t.target)) {
          const track = doc.arrangement.find((x) => x.id === t.trackId);
          const param = paramOf(host.graph, t.trackId, t.target);
          if (!param || !track) return false;
          const val = t.target.kind === 'volume' && !trackAudible(doc, track) ? 0 : toParamValue(t.target, v);
          try { param.cancelScheduledValues(now); param.setTargetAtTime(val, now, 0.008); } catch { /* */ }
          return true;
        }
        const inst = host.inst(t.trackId);
        if (!inst || !isMessageTarget(t.target)) return false;
        applyMessage(inst, t.target, v);
        return true;
      }
      case 'param': {
        const inst = host.inst(t.trackId);
        if (!inst) return false;
        for (const [id, val] of paramWrites(t, v)) inst.modParam(id, val);
        return true;
      }
      case 'fx': {
        const node = host.fxNode(t);
        const inst = fxInstance(doc, t);
        if (!node || !inst) return false;
        node.setParams({ ...inst.params, [t.param]: v });
        return true;
      }
      case 'pad':
      case 'mixer': {
        const param = t.kind === 'pad' ? padParam(host.graph, t) : mixerParam(host.graph, t);
        if (!param) return false;
        try { param.cancelScheduledValues(now); param.setTargetAtTime(clampAudio(t, v), now, 0.008); } catch { /* */ }
        return true;
      }
      case 'padHit':
        return true; // read at each strike (overlayPadHit)
    }
  }

  /**
   * Print every modulator into a bounce. AudioParams get ramps and instrument parameters get frame
   * stamps, both before the render starts; what only exists as a live call (macros, wheels, FX
   * params) goes through `defer`, which the bounce applies by suspending at that moment.
   */
  print(doc: GrooveDoc, host: ModHost, endBeats: number, toTime: (b: number) => number, beatToSec: (b: number) => number, sampleRate: number, defer: (time: number, act: () => void) => void): void {
    // One message per moment per instrument: the worklet sorts its queue on every block.
    const frames = new Map<Instrument, Map<number, Array<[number, number]>>>();
    for (const m of doc.modulators ?? []) {
      if (!m.on) continue;
      const t = m.target;
      if (t.kind === 'track' && isParamTarget(t.target)) {
        const param = paramOf(host.graph, t.trackId, t.target);
        const track = doc.arrangement.find((x) => x.id === t.trackId);
        if (!param || !track || (t.target.kind === 'volume' && !trackAudible(doc, track))) continue;
        this.ramp(param, modulatorPoints(m, 0, endBeats, beatToSec), (v) => toParamValue(t.target, v), toTime);
      } else if (t.kind === 'padHit') {
        continue; // the bounce's trigger reads it at each strike
      } else if (t.kind === 'pad' || t.kind === 'mixer') {
        const param = t.kind === 'pad' ? padParam(host.graph, t) : mixerParam(host.graph, t);
        if (param) this.ramp(param, modulatorPoints(m, 0, endBeats, beatToSec), (v) => clampAudio(t, v), toTime);
      } else if (t.kind === 'param') {
        const inst = host.inst(t.trackId);
        if (!inst) continue;
        const perInst = frames.get(inst) ?? new Map<number, Array<[number, number]>>();
        frames.set(inst, perInst);
        const stepPts = modulatorPoints(m, 0, endBeats, beatToSec, 1 / 16);
        let prev: number | undefined;
        for (const p of stepPts) {
          if (prev !== undefined && Math.abs(prev - p.value) < Math.abs(m.max - m.min) * 0.002) continue;
          prev = p.value;
          const f = Math.round(toTime(p.beat) * sampleRate);
          const list = perInst.get(f) ?? [];
          list.push(...paramWrites(t, p.value));
          perInst.set(f, list);
        }
      } else {
        this.deferred(doc, m, host, endBeats, toTime, beatToSec, defer);
      }
    }
    for (const [inst, perInst] of frames) {
      for (const f of [...perInst.keys()].sort((a, b) => a - b)) inst.paramsAt(f, perInst.get(f)!);
    }
  }

  private ramp(param: AudioParam, pts: { beat: number; value: number }[], map: (v: number) => number, toTime: (b: number) => number): void {
    if (!pts.length) return;
    try { param.cancelScheduledValues(0); } catch { /* */ }
    param.setValueAtTime(map(pts[0].value), Math.max(0, toTime(pts[0].beat)));
    for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(map(pts[i].value), toTime(pts[i].beat));
  }

  private deferred(doc: GrooveDoc, m: Modulator, host: ModHost, endBeats: number, toTime: (b: number) => number, beatToSec: (b: number) => number, defer: (time: number, act: () => void) => void): void {
    const t = m.target;
    let prev: number | undefined;
    for (const p of modulatorPoints(m, 0, endBeats, beatToSec, 1 / 16)) {
      if (prev !== undefined && Math.abs(prev - p.value) < Math.abs(m.max - m.min) * 0.002) continue;
      prev = p.value;
      const v = p.value;
      defer(toTime(p.beat), () => { this.write(doc, t, v, 0, host); });
    }
  }
}

/** Mix targets' range, for the rack's defaults. */
export function targetRange(t: ModTarget): { min: number; max: number } | null {
  if (t.kind === 'track') { const s = targetSpec(t.target); return { min: s.min, max: s.max }; }
  if (t.kind === 'pad') return t.field === 'gainDb' ? { min: -24, max: 6 } : { min: -1, max: 1 };
  return null;
}

export type { ArrangeTrack };
