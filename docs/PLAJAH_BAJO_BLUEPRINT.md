# BAJO — the low-end engine

Melos instrument 04. One bass instrument that reaches both ends of the range: a talking,
band-split, spill-to-reverb wobble at one extreme, and a plucked upright with no oscillator in it
at the other.

**Status:** built and playable. Rust DSP in `rust/plajah-audio`, TypeScript layer in
`services/melos/instruments/bajo/`, surfaces in `components/melos/beats/instrument/`. See
[BAJO_NOTES.md](./BAJO_NOTES.md) for what is deliberately not done yet.

---

## Why it is its own instrument

The bass we had was four presets inside ONDA's Bass category, plus a `FONDO` placeholder in the
instrument picker. That was never going to make the sound anyone actually wants. Bass needs its
own instrument, because the things that make bass good — sub integrity under distortion, per-step
rhythmic modulation, formant movement, band-independent gating — are exactly the things a general
synth architecture smooths over.

BAJO shares ONDA's voice (oscillators, sub, noise, filters, envelopes, unison, the mod matrix) and
adds five sections ONDA has no concept of.

| Capability | Before | BAJO |
| --- | --- | --- |
| Morphing oscillators, unison | ONDA has it | shared, unchanged |
| Sub oscillator | ONDA has it | shared, unchanged |
| **Physical string** | missing | Karplus-Strong loop with body resonances, pick position, bow excitation |
| **Throat** | missing | 3-band vowel formant bank, modulatable at audio rate |
| **Per-step LFO rate lane** | missing — LFOs have one rate | 16-step rate lane, the single most important dubstep control |
| **Ghost Gate** | missing | 4-band step gate, closed steps spill to reverb |
| **Scorch** | ONDA has per-osc/per-filter drive | 3 serial stages, 11 algorithms, sub-safe |
| **Space** | lives on the channel strip | dimension, delay, tape echo inside the patch |
| Reverb | VELA's Veil | reused, not reimplemented |
| Arpeggiator | Melos `arp.ts` at the Beats layer | reused, not reimplemented |

---

## Signal flow

```
   KEY  /  ARP  /  CLIP
            |
   +--------v---------------------- VOICE  (mono+glide  or  poly) ------------------+
   |  OSC A   analog or wavetable, unison  --+                                      |
   |  OSC B   analog or wavetable  ----------+                                      |
   |  SUB     sine / tri / square, -1 or -2  +--> drive --> FILTER 1 --> FILTER 2    |
   |  NOISE   coloured  ---------------------+       |        (env 2 + wobble)      |
   |  STRING  Karplus-Strong delay loop  ----+       +--------> AMP ENV (env 1)      |
   +--------------------------------------------------------------|----------------+
                                                                   |
     THROAT 3-band formant  -->  wobble amp / pan  -->  SCORCH  -->  GHOST GATE
                                                          |              |
                                              sub-safe reconstruction  spill bus
                                                                        |
     SPACE   dimension -> ping-pong delay -> tape echo -> VEIL (reverb) <+
                                                            |
     MASTER  mono fold below f  ->  soft clip  ->  out
```

The rack runs **after the voice sum, inside the engine** — same argument as VELA's Veil. A bass
patch's distortion and gating are part of the sound, not part of the channel strip, so they travel
with the patch and render identically offline.

### Modulation

The **Wobble** is the primary modulator and reaches eight destinations: cutoff (as filter
`detune`, so it moves in musical octaves rather than linear hertz), pitch, vowel, amp, morph,
drive, resonance and pan. Two destinations run at once with independent depths, which is what
turns a wobble into a *morph*: cutoff plus vowel is a talking growl, pitch plus drive is a screech.

The voice owns the per-voice destinations (cutoff, pitch, morph, reso) and the engine rack owns
the rest (vowel, amp, drive, pan). Both evaluate the **same phase** through the **same function**
(`wob_eval` in `bajo.rs`), so a wobble that moves the filter is provably the wobble that moves the
vowel. The voice evaluates it at control rate — 3 kHz at 48 k, not block rate, because a 1/32
wobble at block rate is audibly stepped on a resonant filter.

---

## Ghost Gate

A trance gate mutes everything at once, which is why nobody uses one on bass — the sub disappears
and the track falls over. Ghost Gate splits into four bands (sub / low / mid / air) and gives each
its own 16-step pattern. Leave the sub row solid, chop the air row into sixteenths, and you get
the chopped top over an unbroken floor. That normally needs three sends and a sidechain.

The second half is what the name is for. A closed step does not throw its audio away — it routes
the closed portion to the reverb send scaled by **Spill**. Chops bloom into the tail rather than
punching holes in it.

Two implementation notes that matter:

- The crossover is **subtractive** (`low`, then `remainder = x − low`, recursively). Cascaded
  lowpass/highpass pairs are not amplitude-complementary and cost about 5 dB at the fundamental —
  which on a bass instrument is the whole instrument. With the subtractive form, every band open
  reconstructs the input to within 1e-7, so switching the gate on is a true bypass. There is a
  test for exactly this.
- The spill reaches the Veil through a dedicated send input (`Diffuser::process(..., send)`), not
  by being summed into the buffer first — otherwise the gate would not be gating anything.

---

## Scorch

Three serial stages, each with its own algorithm, drive, bias, tone and wet/dry mix. Eleven
algorithms: saturate, tube, diode, fuzz, fold, ruin, crush, rectify, sine-fold, tape, hard clip.
Bias makes the curve asymmetric, which is where even harmonics and the sense of weight come from;
the DC it introduces is blocked per stage rather than left to stack.

Two controls make it a *bass* distortion rather than a generic one:

- **Sub safe** — the low band is split off before the stages and re-added clean afterwards. You
  can obliterate the patch and the fundamental stays a fundamental. Measured: under a Ruin folder
  at 0.95 drive, the fundamental sits at 1.3× its clean level with sub-safe on and 2.7× with it
  off, i.e. without it the folder is rewriting the low end rather than distorting it.
- **Focus** — a matched pre-cut / post-boost tilt at 260 Hz. Positive focus starves the lows going
  into the stages so the drive works on mids and highs, then restores balance on the way out.

Wobble routed to **Drive** modulates the pre-gain of stages 1 and 2 at audio rate, so the
distortion itself wobbles rather than sitting statically after it.

---

## The string engine

The acoustic end does not come from sampling or from an oscillator. It is a Karplus-Strong loop: a
short filtered noise burst into a delay line tuned to the note period, with a damping lowpass in
the feedback path. Three fixed resonances at 92, 196 and 430 Hz stand in for the instrument body —
fixed, not key-tracked, because a body does not change size when you play a different note.

- **Pick** sweeps the exciter from a dark wide finger pluck to a bright narrow plectrum.
- **Bow** replaces the burst with continuous excitation — the same section becomes arco.
- **Damp** controls loop feedback and the damping filter together.
- **Body** scales the resonance stack from solid-body electric to hollow upright.

**Tuning is the whole game.** The loop delay is `period − group delay of the damping filter − the
DC blocker's phase advance`. The damping one-pole contributes `(1−a)/a` samples; the in-loop DC
blocker is a *highpass*, so it ADVANCES phase and shortens the loop. Ignoring the second term put
every note 13.8 cents sharp — measured, not guessed. With both corrections the loop rings at 55.00
and 82.41 Hz against targets of 55.00 and 82.41. There is a test for it.

(The Web Audio prototype needed a third term, `128/sampleRate`, because a feedback loop there
carries a mandatory render-quantum delay. Inside the Rust core that term disappears.)

---

## Parameter ABI

Same contract as ONDA and VELA: one integer id is simultaneously a knob, a preset field and a
modulation destination, mirrored between `services/melos/instruments/bajo/params.ts` and
`rust/plajah-audio/src/params.rs`.

BAJO occupies **block 1400 upward**. VELA runs to 1207, so starting at 1400 leaves VELA room to
grow. (An earlier draft of this document proposed 1000/1100/1200 — those had already been taken by
VELA while the prototype was being built, and would have silently overwritten the modal bank.)

| Block | Range | Contents |
| --- | --- | --- |
| String | 1400–1405 | level, damp, tone, pick, bow, body |
| Throat | 1420–1422 | amount, vowel, Q |
| Wobble | 1440–1467 | shape, skew, smooth, phase, free, rate, **16-slot rate lane** (1448–1463), 2 × (dest, depth) |
| Ghost Gate | 1480–1551 | on, depth, slew, spill, swing, rate, split, **4 × 16 grid** (1488–1551) |
| Scorch | 1560–1594 | 3 stages × (alg, drive, bias, tone, mix), input, focus, sub-safe, safe-below, output |
| Space | 1600–1622 | dimension, delay, tape echo |
| Mono fold | 1650 | fold-to-centre frequency |

`MAX_PARAM_ID` is 1664. **ABI version 8.**

The rate lane and the gate grid are the only non-scalar fields, and they are stored as plain param
ids — which is why neither needed a bespoke ABI call. They serialise as fixed-length integer
arrays, keeping the patch a flat object and clear of the Firestore rule that an undefined field
write throws.

Every BAJO parameter defaults to a bypass, and there is a test asserting that an ONDA render is
bit-identical with the whole 1400 block present.

---

## Verification

`npm run test:dsp` — 33 tests, six of them BAJO's:

- the Karplus-Strong loop plays in tune (within 10 cents at 55, 82 and 110 Hz)
- every gate band open is a true bypass (max sample difference < 1e-5)
- chopping the top leaves the sub standing (fundamental > 0.8×, air < 0.2×)
- sub-safe keeps the fundamental clean under heavy drive
- wobble depth moves the filter, and zero depth does not
- BAJO's defaults leave every other instrument bit-identical

After touching `rust/plajah-audio`, run `npm run audio:build` and commit the `.wasm` — CI has no
Rust toolchain.
