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

/** Standard 8-knob CC bank start offsets across popular MIDI controllers:
 *  NI (14..21), KeyLab/Korg (16..23), generic (20..27), Launchkey (21..28), Akai MPK (70..77), M-Audio/Roland (80..87). */
const GENERIC_BANK_STARTS = [80, 70, 21, 20, 16, 14] as const;
const RESERVED_NON_KNOB_CCS = new Set<number>([
  0, 1, 5, 6, 7, 10, 11, 32, 38, 64, 65, 66, 67, 68, 69, 98, 99, 100, 101, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127,
]);

interface SourceBankState {
  seen: Set<number>;
  lockedBankStart: number | null;
  dynamicOrder: number[];
}

const sourceBanks = new Map<string, SourceBankState>();

function getBankState(sourceKey: string): SourceBankState {
  let st = sourceBanks.get(sourceKey);
  if (!st) {
    st = { seen: new Set<number>(), lockedBankStart: null, dynamicOrder: [] };
    sourceBanks.set(sourceKey, st);
  }
  return st;
}

/** Reset learned generic CC bank state (used in tests and on MIDI device reconnect). */
export function resetAutoKnobBanks(): void {
  sourceBanks.clear();
}

/**
 * Auto-detect and map generic 8-knob hardware controller CC banks (`14..21`, `16..23`,
 * `20..27`, `21..28`, `70..77`, `80..87`) as well as arbitrary unmapped CC knobs onto
 * macro indices `0..7`, while preserving NI `14..21` and standalone `71/74` by default.
 */
export function autoLearnGenericCcBank(cc: number, sourceKey = 'default'): number | null {
  if (cc < 0 || cc > 127 || RESERVED_NON_KNOB_CCS.has(cc)) return null;
  const st = getBankState(sourceKey);
  st.seen.add(cc);

  // If this controller already locked onto a standard 8-knob bank and CC is inside it, use it directly.
  if (st.lockedBankStart !== null && cc >= st.lockedBankStart && cc < st.lockedBankStart + 8) {
    return cc - st.lockedBankStart;
  }

  // Bank 80..87 has zero overlap with NI 14..21 or 71/74 — claim immediately.
  if (cc >= 80 && cc <= 87) {
    st.lockedBankStart = 80;
    return cc - 80;
  }

  // Bank 70..77 (e.g. Akai MPK): any knob in 70,72,73,75,76,77 claims 70..77 for that source.
  if (cc === 70 || cc === 72 || cc === 73 || cc === 75 || cc === 76 || cc === 77) {
    st.lockedBankStart = 70;
    return cc - 70;
  }

  // If 71/74 arrive after 70..77 was locked, follow the bank; otherwise let mapMidiEvent keep standalone defaults.
  if (cc === CC_CUTOFF || cc === CC_RESONANCE) {
    if (st.lockedBankStart === 70) return cc - 70;
    return null;
  }

  // NI 14..21 default (unless 16..28 already locked this controller to 16/20/21 bank).
  if (cc >= MACRO_CC_LO && cc <= MACRO_CC_HI) {
    if (st.lockedBankStart !== null && cc >= st.lockedBankStart && cc < st.lockedBankStart + 8) {
      return cc - st.lockedBankStart;
    }
    return cc - MACRO_CC_LO;
  }

  // Disambiguate 22..28 against 16..23, 20..27, 21..28 when NI 14/15 haven't been seen on this port.
  if (cc >= 22 && cc <= 28 && !st.seen.has(14) && !st.seen.has(15)) {
    const windowCcs = [...st.seen].filter((c) => c >= 16 && c <= 28);
    for (const start of [21, 20, 16]) {
      if (cc >= start && cc < start + 8 && windowCcs.every((c) => c >= start && c < start + 8)) {
        st.lockedBankStart = start;
        return cc - start;
      }
    }
  }

  // Still inside an ambiguous lower bank or arbitrary knob CC: assign dynamic 0..7 slots in arrival order.
  for (const start of GENERIC_BANK_STARTS) {
    if (start === 14 && cc >= 14 && cc <= 21) return cc - 14;
  }
  const existing = st.dynamicOrder.indexOf(cc);
  if (existing >= 0) return existing;
  if (st.dynamicOrder.length < 8) {
    const slot = st.dynamicOrder.length;
    st.dynamicOrder.push(cc);
    return slot;
  }
  return null;
}

/**
 * Map one event to one action. `instrumentArmed` decides whether a keyboard key or Maschine pad
 * should PLAY THE SYNTH (armed instrument) or hit the DRUM PAD — the same physical control does
 * the obviously-right thing for what you're pointed at. `gridPlaysKeys` false keeps a grid
 * controller's pads on the drum pads even then (MEKA: Maschine's pads are always pads).
 */
export function mapMidiEvent(e: BeatsMidiEvent, instrumentArmed: boolean, gridPlaysKeys = true): MelosMidiAction {
  const dev = e.deviceType;
  const sourceKey = `${dev}:${e.channel ?? 0}`;

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
    if (e.cc === CC_PLAY && (e.value ?? 0) > 0) return { kind: 'transport', action: 'play' };
    if (e.cc === CC_STOP && (e.value ?? 0) > 0) return { kind: 'transport', action: 'stop' };
    if (e.cc === CC_REC && (e.value ?? 0) > 0) return { kind: 'transport', action: 'record' };

    const bankState = getBankState(sourceKey);
    if (e.cc === CC_CUTOFF) {
      return { kind: 'macro', index: bankState.lockedBankStart === 70 ? 4 : 1, value: v };
    }
    if (e.cc === CC_RESONANCE) {
      return { kind: 'macro', index: bankState.lockedBankStart === 70 ? 1 : 2, value: v };
    }

    if (dev !== 'maschine' && dev !== 'komplete_kontrol' && dev !== 'maschine_jam') {
      const genericIdx = autoLearnGenericCcBank(e.cc, sourceKey);
      if (genericIdx !== null) return { kind: 'macro', index: genericIdx, value: v };
    }

    if (e.cc >= MACRO_CC_LO && e.cc <= MACRO_CC_HI) {
      return { kind: 'macro', index: e.cc - MACRO_CC_LO, value: v };
    }
    return null;
  }

  if (e.note === undefined) return null;
  const on = e.kind === 'noteon';
  const pad = padForDevice(dev, e.note);

  // A grid controller (Maschine, Jam) plays the synth chromatically FROM its pads when an
  // instrument is armed — the pad grid becomes an isomorphic keyboard.
  if (pad >= 0) {
    if (instrumentArmed && gridPlaysKeys) {
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
