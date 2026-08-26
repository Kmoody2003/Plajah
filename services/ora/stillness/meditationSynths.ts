// ONDA voices for the meditation channel — the warm, non-metallic side of the sound.
//
// VELA is modal resonators (bowls, bells): metallic and expensive. ONDA is the subtractive synth in
// the same engine, and it is where warmth and "interesting synth pad" live — one ONDA worklet is
// polyphonic, so a whole chord costs one voice's scheduling.
//
// These use ANALOG oscillators (oscMode = 1), not wavetables. That matters: a wavetable oscillator
// is silent until its table is uploaded, and if that upload ever fails the voice makes no sound at
// all — which is exactly the "the new voices do nothing" failure. Analog saw/pulse needs no upload,
// always sounds, and is the authentic 80s-synth tone anyway. Verified by tests/dsp (analog note-on
// produces signal) and tests/ondaVoices.

import { E, F, O, P, env, flt, osc } from '../../melos/instruments/onda/params';
import { newPatch, type OndaPatch } from '../../melos/instruments/onda/patch';

/** analog oscillator, shape 0..1 (0 = saw). */
function analog(shape: number): Record<number, number> {
  return { [osc(0, O.MODE)]: 1, [osc(0, O.ANALOG_SHAPE)]: shape };
}
function cut(v: number): Record<number, number> {
  return { [flt(0, F.CUTOFF)]: v };
}

/**
 * The warm meditation voice — one analog saw voice, gently detuned, dark low-pass, soft attack and
 * long release so held chords bloom and sustain while melody notes still articulate. This single
 * voice carries the pad chord AND the composed melody.
 */
export function meditationLead(): OndaPatch {
  const p = newPatch('Meditation Voice', 'Pad');
  p.tags = ['meditation', 'warm', 'analog'];
  p.tables = ['analog-sweep']; // ignored in analog mode, but a valid id keeps applyPatch happy
  p.params = {
    [P.MASTER_GAIN]: 0.75,
    [osc(0, O.LEVEL)]: 0.62, ...analog(0.28),
    // Two/three unison voices are enough for width here. The former ~7 voices multiplied every
    // sustained pad and melody note and was a major real-time cost on TVs and integrated CPUs.
    [P.UNISON_COUNT]: 0.12, [P.UNISON_DETUNE]: 0.14, [P.UNISON_WIDTH]: 0.75,
    [P.SUB_LEVEL]: 0.28, [P.GLIDE]: 0.08,
    ...cut(0.42), [flt(0, F.RES)]: 0.1, [flt(0, F.KEYTRACK)]: 0.4,
    [env(0, E.ATTACK)]: 0.3, [env(0, E.DECAY)]: 0.4, [env(0, E.SUSTAIN)]: 0.8, [env(0, E.RELEASE)]: 0.48,
  };
  return p;
}

/**
 * The 80s PLUCK — one analog voice carrying the flowing arpeggio and the arpeggiated bassline.
 * A slightly pulsed analog shape, light unison, a touch of resonance for synthwave sheen, fast
 * attack + medium decay + soft release so a steady sequence reads as flowing rather than staccato.
 */
export function meditationPluck(): OndaPatch {
  const p = newPatch('Meditation Pluck', 'Pluck');
  p.tags = ['80s', 'pluck', 'arp', 'analog'];
  p.tables = ['analog-sweep'];
  p.params = {
    [P.MASTER_GAIN]: 0.8,
    [osc(0, O.LEVEL)]: 0.6, ...analog(0.5), [osc(0, O.PULSE_WIDTH)]: 0.4,
    [P.UNISON_COUNT]: 0.08, [P.UNISON_DETUNE]: 0.12, [P.UNISON_WIDTH]: 0.7,
    [P.SUB_LEVEL]: 0.16, [P.GLIDE]: 0.02,
    ...cut(0.56), [flt(0, F.RES)]: 0.2, [flt(0, F.KEYTRACK)]: 0.5,
    [env(0, E.ATTACK)]: 0.02, [env(0, E.DECAY)]: 0.34, [env(0, E.SUSTAIN)]: 0.24, [env(0, E.RELEASE)]: 0.28,
  };
  return p;
}
