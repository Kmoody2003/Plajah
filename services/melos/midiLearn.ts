// MIDI Learn — the layer that makes ANY controller work, not just the three premapped NI units.
//
// midiMap.ts knows Maschine / Komplete Kontrol / Jam out of the box. But a user on an Arturia,
// Akai MPK, Launchkey, or a nameless fader box has knobs on their own CC numbers and pads on their
// own notes. Learn closes that gap: arm a target ("Play", "Pad 3", "Macro 1"), wiggle a control,
// and the control's signature is bound to that target. Bindings persist per browser and are
// consulted BEFORE the premapped fallback, so a learned control always wins.
//
// A "signature" identifies one physical control independent of its value: `cc:<ch>:<num>` for a
// knob/fader/button, `note:<ch>:<num>` for a key/pad. Value/velocity is filled in at play time.

import type { BeatsMidiEvent } from './midiInput';
import type { MelosMidiAction } from './midiMap';

export type LearnTarget =
  | { kind: 'transport'; action: 'play' | 'stop' | 'record' }
  | { kind: 'pad'; pad: number }
  | { kind: 'macro'; index: number }
  | { kind: 'note'; note: number };

export interface MidiBinding {
  signature: string;    // 'cc:0:20' | 'note:0:60'
  target: LearnTarget;
  label: string;        // human label captured when bound, for the mapping list
  deviceName?: string;
}

const STORAGE_KEY = 'melos.midi.learn.v1';

let bindings: MidiBinding[] = load();
let learnTarget: { target: LearnTarget; label: string } | null = null;
const changeListeners = new Set<() => void>();

function load(): MidiBinding[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw) as MidiBinding[]; } catch { /* private mode / bad json */ }
  return [];
}
function persist(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch { /* ignore */ }
  for (const fn of changeListeners) { try { fn(); } catch { /* isolate */ } }
}

/** Signature of the physical control an event came from (value-independent). */
export function signatureOf(e: BeatsMidiEvent): string {
  if (e.kind === 'cc') return `cc:${e.channel}:${e.cc}`;
  return `note:${e.channel}:${e.note}`;
}

export function targetLabel(t: LearnTarget): string {
  switch (t.kind) {
    case 'transport': return t.action === 'play' ? 'Play' : t.action === 'stop' ? 'Stop' : 'Record';
    case 'pad': return `Pad ${t.pad + 1}`;
    case 'macro': return `Macro ${t.index + 1}`;
    case 'note': return `Note ${t.note}`;
  }
}

/** Arm learn mode for a target; the next incoming event binds to it. */
export function beginLearn(target: LearnTarget): void { learnTarget = { target, label: targetLabel(target) }; for (const fn of changeListeners) fn(); }
export function cancelLearn(): void { learnTarget = null; for (const fn of changeListeners) fn(); }
export function isLearning(): LearnTarget | null { return learnTarget?.target ?? null; }

/**
 * Feed every event through this first. If learn mode is armed, the event is captured as a binding
 * (and swallowed — returns 'captured'). Otherwise, if the event's control is bound, the mapped
 * MelosMidiAction is returned; if not bound, returns undefined so the caller falls back to midiMap.
 */
export function learnedAction(e: BeatsMidiEvent): MelosMidiAction | 'captured' | undefined {
  const sig = signatureOf(e);

  if (learnTarget) {
    // Buttons send noteoff / cc:0 too — bind on the "on" edge only so we capture the press.
    const isEdge = e.kind === 'noteon' || (e.kind === 'cc' && (e.value ?? 0) > 0) || e.kind === 'noteoff';
    if (!isEdge) return 'captured';
    bindings = bindings.filter((b) => b.signature !== sig && !sameTarget(b.target, learnTarget!.target));
    bindings.push({ signature: sig, target: learnTarget.target, label: learnTarget.label, deviceName: e.deviceName });
    learnTarget = null;
    persist();
    return 'captured';
  }

  const bound = bindings.find((b) => b.signature === sig);
  if (!bound) return undefined;
  return actionFor(bound.target, e);
}

function sameTarget(a: LearnTarget, b: LearnTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'transport' && b.kind === 'transport') return a.action === b.action;
  if (a.kind === 'pad' && b.kind === 'pad') return a.pad === b.pad;
  if (a.kind === 'macro' && b.kind === 'macro') return a.index === b.index;
  if (a.kind === 'note' && b.kind === 'note') return a.note === b.note;
  return false;
}

/** Turn a bound target + a live event into the concrete action (fills in value/velocity). */
function actionFor(t: LearnTarget, e: BeatsMidiEvent): MelosMidiAction {
  const on = e.kind === 'noteon' || (e.kind === 'cc' && (e.value ?? 0) > 0);
  switch (t.kind) {
    case 'transport':
      // Fire on the press edge only; ignore the release so a button toggles once.
      return on ? { kind: 'transport', action: t.action } : null;
    case 'pad':
      if (e.kind === 'noteoff' || (e.kind === 'cc' && (e.value ?? 0) === 0)) return { kind: 'padOff', pad: t.pad };
      return { kind: 'pad', pad: t.pad, velocity: e.velocity ?? Math.round((e.value ?? 100)) };
    case 'macro':
      return { kind: 'macro', index: t.index, value: (e.value ?? (e.velocity ?? 0)) / 127 };
    case 'note':
      if (e.kind === 'noteoff' || (e.kind === 'cc' && (e.value ?? 0) === 0)) return { kind: 'noteOff', note: t.note };
      return { kind: 'note', note: t.note, velocity: e.velocity ?? 100 };
  }
}

export function getBindings(): MidiBinding[] { return bindings.slice(); }
export function clearBinding(signature: string): void { bindings = bindings.filter((b) => b.signature !== signature); persist(); }
export function clearAllBindings(): void { bindings = []; persist(); }

/** Subscribe to binding/learn-state changes (for the mapping UI to re-render). */
export function subscribeLearn(fn: () => void): () => void { changeListeners.add(fn); return () => { changeListeners.delete(fn); }; }
