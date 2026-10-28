// Premapped controller support — Maschine, Komplete Kontrol, Maschine Jam.
//
// The same devices Pixels sees, mapped for making music. Given a parsed MIDI event and the
// detected device type, this returns ONE Melos action: hit a pad, play an instrument note, turn
// a macro, or move the transport. Melos then routes it — so a Maschine's pads play the drum
// grid AND, when an instrument track is armed, its keys and knobs play the synth, without the
// user configuring anything.
//
// Reuses Pixels' pad map (note 60+ 4x4) and device detection verbatim — one source of truth for
// "what is a Maschine pad", shared with the visualiser.

import { VJ_PAD_BY_NOTE, type DetectedDeviceType } from '../../components/plajahPixels/services/midiService';
import type { BeatsMidiEvent } from './midiInput';

export type MelosMidiAction =
  | { kind: 'pad'; pad: number; velocity: number }
  | { kind: 'padOff'; pad: number }
  | { kind: 'note'; note: number; velocity: number }
  | { kind: 'noteOff'; note: number }
  | { kind: 'macro'; index: number; value: number }    // 0..1
  | { kind: 'modWheel'; value: number }                // 0..1 (CC #1 / Channel Pressure)
  | { kind: 'pitchBend'; value: number }               // -1..1 (0xE0 14-bit Pitch Wheel)
  | { kind: 'sustain'; on: boolean }                   // CC #64 Hold Pedal
  | { kind: 'transport'; action: 'play' | 'stop' | 'record' }
  | { kind: 'nav'; action: NavAction }
  | null;

/** Maschine's navigation buttons: Page ◀ ▶, Group ◀ ▶ and the MASTER / GROUP / SOUND tabs of the
 *  control area. No NI MIDI-mode template sends a fixed CC for these, so they are MIDI-learned. */
export type NavAction = 'pagePrev' | 'pageNext' | 'groupPrev' | 'groupNext' | 'tabMaster' | 'tabGroup' | 'tabSound' | 'sampling';
export const NAV_LABELS: Record<NavAction, string> = {
  pagePrev: 'Page ◀', pageNext: 'Page ▶', groupPrev: 'Group ◀', groupNext: 'Group ▶',
  tabMaster: 'Master tab', tabGroup: 'Group tab', tabSound: 'Sound tab', sampling: 'Sampling',
};

/** The eight knobs. NI controllers in MIDI mode default to CC 14–21 for the top row; that is the
 *  Melos macro range, matching the instrument's eight front-panel knobs one-to-one. */
const MACRO_CC_LO = 14;
const MACRO_CC_HI = 21;

/** Standard performance CCs on every hardware MIDI keyboard. */
const CC_MOD_WHEEL = 1;
const CC_SUSTAIN = 64;
const CC_RESONANCE = 71;
const CC_CUTOFF = 74;

/** Transport CCs the NI templates emit (Play/Stop/Rec on the standard MIDI-mode map). */
const CC_PLAY = 118;
const CC_STOP = 117;
const CC_REC = 119;

/**
 * Map one event to one action. `instrumentArmed` decides whether a keyboard key or Maschine pad
 * should PLAY THE SYNTH (armed instrument) or hit the DRUM PAD — the same physical control does
 * the obviously-right thing for what you're pointed at.
 */
export function mapMidiEvent(e: BeatsMidiEvent, instrumentArmed: boolean): MelosMidiAction {
  const dev = e.deviceType;

  // ── 14-bit Pitch Bend wheel & Channel Aftertouch ──
  if (e.kind === 'pitchbend') {
    return { kind: 'pitchBend', value: Math.max(-1, Math.min(1, e.bend ?? 0)) };
  }
  if (e.kind === 'aftertouch') {
    return { kind: 'modWheel', value: Math.max(0, Math.min(1, (e.value ?? 0) / 127)) };
  }

  // ── CC: Mod Wheel, Sustain, Filter CCs, macros and transport ──
  if (e.kind === 'cc' && e.cc !== undefined) {
    const v = (e.value ?? 0) / 127;
    if (e.cc === CC_MOD_WHEEL) return { kind: 'modWheel', value: v };
    if (e.cc === CC_SUSTAIN) return { kind: 'sustain', on: (e.value ?? 0) >= 64 };
    if (e.cc === CC_CUTOFF) return { kind: 'macro', index: 1, value: v };
    if (e.cc === CC_RESONANCE) return { kind: 'macro', index: 2, value: v };
    if (e.cc >= MACRO_CC_LO && e.cc <= MACRO_CC_HI) return { kind: 'macro', index: e.cc - MACRO_CC_LO, value: v };
    if (e.cc === CC_PLAY && (e.value ?? 0) > 0) return { kind: 'transport', action: 'play' };
    if (e.cc === CC_STOP && (e.value ?? 0) > 0) return { kind: 'transport', action: 'stop' };
    if (e.cc === CC_REC && (e.value ?? 0) > 0) return { kind: 'transport', action: 'record' };
    return null;
  }

  if (e.note === undefined) return null;
  const on = e.kind === 'noteon';
  const pad = padForDevice(dev, e.note);

  // A grid controller (Maschine, Jam) plays the synth chromatically FROM its pads when an
  // instrument is armed — the pad grid becomes an isomorphic keyboard.
  if (pad >= 0) {
    if (instrumentArmed) {
      // Pad index → a chromatic note from C1, so two octaves of grid cover a playable range.
      const note = 36 + pad;
      return on ? { kind: 'note', note, velocity: e.velocity ?? 100 } : { kind: 'noteOff', note };
    }
    return on ? { kind: 'pad', pad, velocity: e.velocity ?? 100 } : { kind: 'padOff', pad };
  }

  // A keyboard controller (Komplete Kontrol) sends real note numbers — play the armed
  // instrument, or fall back to the pads on the drum octave when nothing is armed.
  if (dev === 'komplete_kontrol' || dev === 'generic') {
    if (instrumentArmed) {
      return on ? { kind: 'note', note: e.note, velocity: e.velocity ?? 100 } : { kind: 'noteOff', note: e.note };
    }
    // Generic drum octave C1..D#2 → pads 0..15.
    if (e.note >= 36 && e.note <= 51) {
      const p = e.note - 36;
      return on ? { kind: 'pad', pad: p, velocity: e.velocity ?? 100 } : { kind: 'padOff', pad: p };
    }
    // Otherwise still play it as a note so a keyboard is never dead.
    return on ? { kind: 'note', note: e.note, velocity: e.velocity ?? 100 } : { kind: 'noteOff', note: e.note };
  }

  return null;
}

/** Pad index 0–15 for a device's pad note, or -1 if the note isn't a pad on this device. */
function padForDevice(dev: DetectedDeviceType, note: number): number {
  if (dev === 'maschine_studio') {
    const m = VJ_PAD_BY_NOTE[note];
    if (m) return (m.row - 1) * 4 + (m.col - 1);
    return -1;
  }
  if (dev === 'maschine_jam') {
    // Jam's 8x8 grid starts at note 0; fold the bottom-left 4x4 onto the 16 pads so a Jam drives
    // the drum grid out of the box, with the full 64 available to the step sequencer later.
    const row = Math.floor(note / 8);
    const col = note % 8;
    if (note < 64 && row < 4 && col < 4) return row * 4 + col;
    return -1;
  }
  return -1;
}

/** Human label for the device readout. */
export function deviceLabel(type: DetectedDeviceType): string {
  switch (type) {
    case 'maschine_studio': return 'Maschine';
    case 'komplete_kontrol': return 'Komplete Kontrol';
    case 'maschine_jam': return 'Maschine Jam';
    default: return 'MIDI controller';
  }
}

/** What each device drives, for the "connected" readout — honest about what's premapped. */
export function deviceCapabilities(type: DetectedDeviceType): string {
  switch (type) {
    case 'maschine_studio': return 'Pads → drums · knobs → macros · pads play the synth when an instrument is armed · Play/Stop/Rec premapped';
    case 'komplete_kontrol': return 'Keys → the armed instrument · 8 knobs → macros · Play/Stop/Rec transport premapped';
    case 'maschine_jam': return 'Grid → drums · plays the synth when an instrument is armed';
    default: return 'Notes 36–51 → pads (Maschine MK3/Mikro default MIDI mode) · CC 14–21 → macros · CC 118/117/119 → Play/Stop/Rec · plays the armed instrument';
  }
}
