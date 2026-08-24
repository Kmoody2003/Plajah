//! Modal resonance — the body of the VELA instrument.
//!
//! A bank of two-pole resonators, one per partial. This is the cheap implementation of modal
//! synthesis and it is the right first version: a waveguide buys articulation that matters for
//! plucked strings and buys almost nothing for bowls, gongs and bowed metal, which are exactly
//! the voices VELA exists for.
//!
//! The whole character of the instrument lives in how the partial ratios are computed. A
//! harmonic series (1×, 2×, 3×) reads as a string and the ear resolves it to a pitch. Stretch
//! the ratios off that series and the ear stops resolving a pitch and hears a *body* instead —
//! which is the difference between "a pad" and "a bell you are standing inside".
//!
//! Everything here is allocation-free and runs on the audio thread. The partial layout is only
//! recomputed on note-on, not per block: a 64-partial `prepare` costs a few microseconds and
//! doing it per block for 32 voices would not be affordable.

use crate::osc::Rng;

pub const MAX_PARTIALS: usize = 64;

/// Per-partial modulation runs at control rate. 32 samples is ~1.5 kHz at 48k — far above
/// anything moving here, and it costs 64 sines per block instead of 64 per sample.
const AM_CTL: usize = 32;

/// Golden ratio, used to space the drift rates. Irrational spacing means no two partials share
/// a period and the combination never repeats — which is the whole point of Anima.
const PHI: f32 = 1.618_034;

/// How often the bank re-tunes itself while a note sounds. ~10 ms at 48k.
///
/// Re-tuning a ringing resonator changes its pole position while state persists, so the partial
/// glides rather than restarting. Small steps at this rate are inaudible as steps and audible
/// as the body slowly becoming a different body — which is the difference between a sample and
/// an instrument.
const RETUNE: usize = 512;

/// Level match between the driven and the excited bank. See the note at its use site.
const OSC_GAIN: f32 = 12.0;

/// The partial-count control is stepped, because the count sets the per-voice cost and a
/// continuous knob would let someone slide into a dropout without knowing why.
pub const PARTIAL_STEPS: [usize; 5] = [16, 24, 32, 48, 64];

#[inline]
pub fn partial_count(norm: f32) -> usize {
    let i = (norm.clamp(0.0, 1.0) * (PARTIAL_STEPS.len() - 1) as f32).round() as usize;
    PARTIAL_STEPS[i.min(PARTIAL_STEPS.len() - 1)]
}

/// How the partials make sound.
///
/// This is the difference between a bell and a choir, and no amount of tuning gets from one to
/// the other. A resonator has to be struck and then rings out — it is a body reacting. An
/// oscillator simply sounds for as long as it is asked to. Strings, choirs and pads are
/// oscillators; bowls and gongs are resonators. VELA needs both or it can only ever make
/// variations on the same struck object.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BankMode {
    /// Excited resonators. Rings and decays.
    Struck,
    /// Driven sine partials. Sustains until released.
    Sustained,
    /// Both, crossfaded — a body that is also being sung through.
    Blend,
}

impl BankMode {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => BankMode::Sustained,
            2 => BankMode::Blend,
            _ => BankMode::Struck,
        }
    }
}

/// Formant weighting over the partial amplitudes.
///
/// Three resonant peaks at ABSOLUTE frequencies, not multiples of the fundamental. That
/// distinction is the whole trick: a resonance that tracks pitch is just a filter and still
/// sounds like a tuned object, while a resonance that stays put as the pitch moves is what the
/// ear reads as a throat, a cabinet, a room — a body of fixed size producing different notes.
/// It is the single cheapest way out of "everything sounds like a bell", because it costs one
/// multiply per partial at build time and nothing at all per sample.
#[inline]
fn formant_gain(freq: f32, shift: f32, amount: f32) -> f32 {
    if amount <= 0.001 {
        return 1.0;
    }
    // Shift sweeps the triple roughly /u/ -> /o/ -> /a/ -> /e/.
    let k = 0.55 + shift * 1.1;
    let peaks = [(300.0 * k, 90.0), (1100.0 * k, 150.0), (2600.0 * k, 260.0)];
    let weights = [1.0, 0.72, 0.42];
    let mut sum = 0.0;
    for (i, (fc, bw)) in peaks.iter().enumerate() {
        let d = (freq - fc) / bw;
        sum += weights[i] / (1.0 + d * d);
    }
    // Floor so partials between the formants thin out rather than vanish — a fully notched
    // spectrum sounds synthetic and loses the body underneath.
    let shaped = (sum.min(1.6) / 1.6).max(0.12);
    1.0 - amount + amount * shaped
}

/// Narrow emphasis on ONE partial, movable across the series.
///
/// This is overtone singing. A Tuvan or Mongolian throat singer is not producing a second note
/// — they are holding a drone and reshaping the mouth so that a single harmonic of that drone
/// is amplified far above its neighbours, and the ear then hears it as a separate whistling
/// voice floating over the fundamental. Byzantine and Tibetan chant use the same physics more
/// gently.
///
/// A filter cannot do this convincingly, because a filter emphasises a FREQUENCY BAND and the
/// partial it is meant to isolate drifts out of that band as soon as the singer changes note.
/// Emphasising by partial INDEX is what keeps the whistle locked to the harmonic series while
/// the pitch moves — and in an additive bank it is another amplitude weighting, so it is free.
#[inline]
fn spotlight_shape(index: usize, count: usize, pos: f32, width: f32) -> f32 {
    // Position runs over the useful part of the series. Below the fourth partial there is
    // nothing to isolate that the fundamental does not already dominate.
    let target = 3.0 + pos.clamp(0.0, 1.0) * (count.max(6) as f32 - 6.0);
    let d = (index as f32 - target) / (0.6 + width * 5.0);
    // Quartic: a flatter top and steeper skirts than a bell curve, which is what makes it read
    // as one isolated harmonic rather than as a broad brightness.
    1.0 / (1.0 + d * d * d * d)
}

/// Damping presets. Each supplies a decay tilt bias, an amplitude roll-off exponent and an
/// inharmonicity scale, so one control moves several partial parameters together the way a
/// real change of material does.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Material {
    Bronze,
    Glass,
    Iron,
    Wood,
    Skin,
    Air,
    /// A glottal source rather than an object.
    ///
    /// The voice is the one "material" here that is not a body at all — it is a pulse train
    /// from the vocal folds, and its spectrum falls far more slowly than anything solid. Air,
    /// which CANTUS was using, rolls off at k^-1.8: by the seventeenth harmonic there is
    /// essentially nothing left, so emphasising that harmonic SYNTHESISES a partial instead of
    /// bringing one forward. That is audibly a sine laid on top of a drone rather than one
    /// voice, and it is why the overtone effect did not land.
    Voice,
}

impl Material {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => Material::Glass,
            2 => Material::Iron,
            3 => Material::Wood,
            4 => Material::Skin,
            5 => Material::Air,
            6 => Material::Voice,
            _ => Material::Bronze,
        }
    }

    /// `(decay_tilt_bias, amp_exponent, inharm_scale)`.
    ///
    /// A negative tilt bias means high partials ring *longer* than low ones — the thing that
    /// makes bronze and iron sound alive twenty seconds after the strike. Wood and skin do the
    /// opposite and lose their top almost immediately.
    #[inline]
    fn traits(self) -> (f32, f32, f32) {
        match self {
            Material::Bronze => (-0.25, 0.90, 1.00),
            Material::Glass => (-0.10, 0.70, 1.60),
            Material::Iron => (-0.35, 1.05, 2.40),
            Material::Wood => (0.55, 1.30, 0.70),
            Material::Skin => (0.85, 1.55, 0.45),
            Material::Air => (0.15, 1.80, 0.12),
            // 0.75 is roughly a glottal source after lip radiation: harmonics 10-30 still carry
            // real energy, which is the whole precondition for overtone singing.
            Material::Voice => (0.30, 0.75, 0.06),
        }
    }
}

/// One two-pole resonator: `y[n] = g·x[n] + a1·y[n-1] + a2·y[n-2]`.
///
/// Stable for any pole radius below 1, which is guaranteed here because the radius is derived
/// from a decay time that is clamped positive.
#[derive(Clone, Copy, Default)]
struct Resonator {
    y1: f32,
    y2: f32,
    a1: f32,
    a2: f32,
    g: f32,
    /// sin(w) at tuning time. `g = amp * sin(w)`, so this is how the bank recovers `amp` when
    /// computing its output normalisation.
    sin_w: f32,
}

impl Resonator {
    #[inline]
    fn tune(&mut self, freq: f32, decay_s: f32, amp: f32, sr: f32) {
        // Anything at or above Nyquist is silenced rather than aliased down into the audible
        // band, which is what happens if you let a high partial of an inharmonic series wrap.
        if !(freq > 0.0) || freq >= sr * 0.49 {
            self.g = 0.0;
            self.a1 = 0.0;
            self.a2 = 0.0;
            self.sin_w = 1.0;
            return;
        }
        // T60: amplitude falls 60 dB (a factor of 1000, ln = 6.9078) over `decay_s`.
        let r = (-6.907755 / (decay_s.max(0.002) * sr)).exp().clamp(0.0, 0.999_995);
        let w = core::f32::consts::TAU * freq / sr;
        self.a1 = 2.0 * r * w.cos();
        self.a2 = -(r * r);
        // IMPULSE normalisation, not steady-state. The impulse response of this recurrence is
        // g·rⁿ·sin(ωn)/sin(ω), so `g = amp·sin(ω)` makes a strike peak at `amp` regardless of
        // decay time. Normalising for steady-state unity instead (the `(1-r)` form) collapses
        // to silence the moment the decay gets long: at T60 = 20 s, `1-r` is about 7e-6.
        // Taper the top rather than running partials at full amplitude right up to the cutoff.
        // A stretched bank puts dozens of partials between 8 kHz and Nyquist, and at full level
        // that band is pure glare — the "harsh" part of a bright body, and the thing that makes
        // a high inharmonicity setting unusable rather than interesting.
        let nyq = sr * 0.5;
        let taper = if freq > nyq * 0.34 {
            let t = ((nyq * 0.92 - freq) / (nyq * 0.58)).clamp(0.0, 1.0);
            t * t
        } else {
            1.0
        };
        self.sin_w = w.sin().max(0.02);
        self.g = amp * taper * self.sin_w;
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let y = self.g * x + self.a1 * self.y1 + self.a2 * self.y2;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }

    #[inline]
    fn reset(&mut self) {
        self.y1 = 0.0;
        self.y2 = 0.0;
    }

    /// `1 - r`: the resonator's bandwidth, and the factor by which continuous excitation
    /// accumulates. Used to scale sustained drive so a bow does not integrate to the rails.
    #[inline]
    fn bandwidth(&self) -> f32 {
        // a2 = -r², so r = sqrt(-a2).
        1.0 - (-self.a2).max(0.0).sqrt()
    }

    /// Energy still in the resonator, used for the voice-finished test.
    #[inline]
    fn energy(&self) -> f32 {
        self.y1.abs() + self.y2.abs()
    }
}

/// Everything `prepare` needs. Grouped into a struct so adding a partial parameter later does
/// not mean threading another argument through the voice.
#[derive(Clone, Copy)]
pub struct ModalSpec {
    pub f0: f32,
    pub count: usize,
    /// 0..1. Stretch off the harmonic series. Bowls sit near 0.04, gongs 0.2–0.4, and past
    /// roughly 0.6 the ear gives up on pitch entirely — the haunted register.
    pub inharm: f32,
    /// 0..1. Random per-partial detune from the computed ratio. Small amounts are what stop a
    /// bank sounding synthetic.
    pub spread: f32,
    /// Fundamental decay, seconds.
    pub decay: f32,
    /// -1..1 after mapping. Negative: highs ring longest. Positive: highs die first.
    pub decay_tilt: f32,
    pub material: Material,
    /// 0..1. Independent slow amplitude drift per partial, 0.02–0.3 Hz, irrationally spaced.
    ///
    /// This is what separates a resonator bank from an organ. A real body's partials swell and
    /// fade against one another because the object is never perfectly still; without it the
    /// bank is technically correct and emotionally dead.
    pub anima: f32,
    /// 0..1. Beating depth. Real singing bowls have partials a few Hz apart, and the slow
    /// amplitude "wah" that produces is the single most recognisable thing about them.
    pub beat: f32,
    /// Beat rate in Hz at the fundamental. Higher partials beat proportionally faster, which is
    /// what the physical detuning of a real bowl actually does.
    pub beat_rate: f32,
    /// 0..1 excitation point along the body. Nulls partials whose node lands there.
    pub position: f32,
    /// 0..1. How much decay shortens as you play up the keyboard. Real bodies do this.
    pub keytrack: f32,
    /// Timbral evolution across the note, signed: 0 is static, positive opens the body up
    /// (more stretch, brighter, the excitation point wandering), negative closes it down.
    pub morph: f32,
    /// Seconds the morph takes to complete. Long values are the soundscape register.
    pub morph_time: f32,
    pub mode: BankMode,
    /// 0..1 formant depth.
    pub formant: f32,
    /// 0..1 formant position — sweeps the vowel.
    pub formant_shift: f32,
    /// Per-partial envelope in Sustained mode: how much higher partials fade in later. Strings
    /// and choirs brighten as they are held; a bank whose partials all arrive together sounds
    /// like an organ stop.
    pub bloom: f32,
    /// 0..1 overtone emphasis depth.
    pub spotlight: f32,
    /// 0..1 which partial is emphasised.
    pub spotlight_pos: f32,
    /// 0..1 how many neighbours come with it. Narrow is a whistle, wide is a vowel.
    pub spotlight_width: f32,
    /// Pitch vibrato depth in semitones, applied to the whole bank.
    pub vibrato: f32,
    pub vibrato_rate: f32,
    /// 0..1 period doubling.
    ///
    /// Kargyraa — the deep, rasping Tuvan style — comes from the ventricular folds vibrating at
    /// half the rate of the vocal folds. The result is a spectrum containing every half-integer
    /// multiple of the fundamental as well as the integers. The pitch does not drop, because
    /// the integer harmonics are still the strongest; what changes is that the tone acquires a
    /// buzz no amount of filtering can imitate, because the extra partials are simply not there
    /// in a normal harmonic series.
    pub subharm: f32,
}

pub struct ModalBank {
    res: [Resonator; MAX_PARTIALS],
    count: usize,
    /// Mean bandwidth across the active partials, cached at `prepare`.
    mean_bw: f32,
    /// Output normalisation from the ACTUAL partial amplitudes, cached at `prepare`.
    norm: f32,
    /// Frozen per note so the same voice re-struck sounds like the same object.
    jitter: [f32; MAX_PARTIALS],

    // ── Life. Evaluated at control rate, applied to each partial's output. ──
    am_phase: [f32; MAX_PARTIALS],
    am_inc: [f32; MAX_PARTIALS],
    beat_phase: [f32; MAX_PARTIALS],
    beat_inc: [f32; MAX_PARTIALS],
    /// Current gain, ramped toward `gain_target` one sample at a time.
    gain: [f32; MAX_PARTIALS],
    gain_target: [f32; MAX_PARTIALS],
    gain_step: [f32; MAX_PARTIALS],

    // ── Sustained mode: one quadrature oscillator per partial. ──
    // Coupled ("magic circle") form rather than a phase accumulator plus sin(): four multiplies
    // and two adds per partial per sample, no transcendental. Sixty-four sines per sample per
    // voice would not be affordable; this is.
    osc_s: [f32; MAX_PARTIALS],
    osc_c: [f32; MAX_PARTIALS],
    osc_eps: [f32; MAX_PARTIALS],
    osc_amp: [f32; MAX_PARTIALS],
    /// Per-partial fade-in, so the spectrum arrives over time rather than all at once.
    osc_env: [f32; MAX_PARTIALS],
    osc_env_inc: [f32; MAX_PARTIALS],
    anima: f32,
    beat: f32,
    ctl: usize,

    // ── Morph. The spec is kept so the bank can re-derive itself as the note ages. ──
    spec: ModalSpec,
    sr: f32,
    note_samples: usize,
    retune_ctl: usize,
    vib_phase: f32,
}

impl ModalBank {
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng(seed | 1);
        let mut jitter = [0.0f32; MAX_PARTIALS];
        for j in jitter.iter_mut() {
            *j = rng.bipolar();
        }
        let mut am_phase = [0.0f32; MAX_PARTIALS];
        for (k, p) in am_phase.iter_mut().enumerate() {
            // Start every partial somewhere different, or they all swell together on note one.
            *p = ((k as f32) * PHI).fract();
        }
        Self {
            res: [Resonator::default(); MAX_PARTIALS],
            count: 0,
            mean_bw: 1.0,
            norm: 1.0,
            jitter,
            am_phase,
            am_inc: [0.0; MAX_PARTIALS],
            beat_phase: [0.0; MAX_PARTIALS],
            beat_inc: [0.0; MAX_PARTIALS],
            gain: [1.0; MAX_PARTIALS],
            gain_target: [1.0; MAX_PARTIALS],
            gain_step: [0.0; MAX_PARTIALS],
            osc_s: [0.0; MAX_PARTIALS],
            osc_c: [1.0; MAX_PARTIALS],
            osc_eps: [0.0; MAX_PARTIALS],
            osc_amp: [0.0; MAX_PARTIALS],
            osc_env: [0.0; MAX_PARTIALS],
            osc_env_inc: [1.0; MAX_PARTIALS],
            anima: 0.0,
            beat: 0.0,
            ctl: 0,
            spec: ModalSpec {
                f0: 261.63, count: 32, inharm: 0.04, spread: 0.1, decay: 4.0, decay_tilt: 0.0,
                material: Material::Bronze, anima: 0.0, beat: 0.0, beat_rate: 1.0,
                position: 0.28, keytrack: 0.4, morph: 0.0, morph_time: 8.0,
                mode: BankMode::Struck, formant: 0.0, formant_shift: 0.5, bloom: 0.4,
                spotlight: 0.0, spotlight_pos: 0.4, spotlight_width: 0.25,
                vibrato: 0.0, vibrato_rate: 5.0, subharm: 0.0,
            },
            sr: 48000.0,
            note_samples: 0,
            retune_ctl: 0,
            vib_phase: 0.0,
        }
    }

    pub fn reset(&mut self) {
        for r in self.res.iter_mut() {
            r.reset();
        }
        // Start the oscillators at spread phases. All-in-phase partials produce a click and a
        // brief buzz on note-on, and they beat against each other in lockstep afterwards.
        for k in 0..MAX_PARTIALS {
            let ph = ((k as f32) * PHI).fract() * core::f32::consts::TAU;
            self.osc_s[k] = ph.sin();
            self.osc_c[k] = ph.cos();
            self.osc_env[k] = 0.0;
        }
    }

    /// Per-partial fade-in for Sustained mode. Higher partials arrive later, so a held note
    /// brightens as it is sustained rather than presenting its whole spectrum at once.
    fn arm_bloom(&mut self, bloom: f32, sr: f32) {
        for k in 0..self.count {
            let lateness = (k as f32 / self.count.max(1) as f32).powf(0.7);
            let secs = 0.02 + bloom * 6.0 * lateness;
            self.osc_env_inc[k] = 1.0 / (secs * sr).max(1.0);
        }
    }

    /// Recompute the partial layout. Called on note-on, and again only if the host changes a
    /// body parameter while a note is held.
    pub fn prepare(&mut self, s: &ModalSpec, sr: f32) {
        self.spec = *s;
        self.sr = sr;
        self.note_samples = 0;
        self.retune_ctl = 0;
        self.build(0.0);
        self.arm_bloom(s.bloom, sr);
    }

    /// Re-derive the partial layout at a given point in the note's morph, 0..1.
    fn build(&mut self, progress: f32) {
        let sr = self.sr;
        let base = self.spec;

        // The morph moves the three parameters that change what the body IS, rather than how
        // loud it is: how far the partials are stretched, how the decay leans, and where it is
        // being excited. Together those take a bowl to a gong and back.
        // Vibrato rides the retune, which is why it is here rather than in the voice: the bank
        // is already being re-derived every ~10 ms, so moving the fundamental costs nothing
        // extra. It also means vibrato and morph interact the way they would on a real
        // instrument, rather than being two independent effects stacked on one another.
        let vib = if base.vibrato > 0.0005 {
            // Fades in over the first second and a half. Vibrato from the very first instant
            // sounds mechanical; a singer arrives at it.
            let age = self.note_samples as f32 / sr;
            let onset = (age / 1.5).min(1.0);
            (2.0f32).powf(
                base.vibrato * onset
                    * (core::f32::consts::TAU * self.vib_phase).sin()
                    / 12.0,
            )
        } else {
            1.0
        };
        let m = base.morph * progress;
        let sp = ModalSpec {
            inharm: (base.inharm + m * 0.42).clamp(0.0, 1.0),
            decay_tilt: (base.decay_tilt - m * 0.7).clamp(-1.0, 1.0),
            position: (base.position + m * 0.35).clamp(0.02, 0.98),
            ..base
        };
        let s = &sp;
        let (tilt_bias, amp_exp, inharm_scale) = s.material.traits();
        let count = s.count.min(MAX_PARTIALS);
        self.count = count;

        // Key tracking: shorten decay as pitch rises. Referenced to middle C so the patch's
        // Decay value means what it says in the middle of the keyboard.
        let key_oct = (s.f0 / 261.63).max(0.03).log2();
        let key_scale = (1.0 - s.keytrack * 0.30 * key_oct).clamp(0.12, 3.0);
        let base_decay = (s.decay * key_scale).max(0.02);

        let b = s.inharm * inharm_scale;
        let tilt = (s.decay_tilt + tilt_bias).clamp(-1.2, 1.8);
        self.anima = s.anima.clamp(0.0, 1.0);
        self.beat = s.beat.clamp(0.0, 1.0);

        // The fundamental's natural amplitude, so the spotlight has something to aim at.
        let node0 = (core::f32::consts::PI * s.position.clamp(0.01, 0.99)).sin().abs();
        let amp0 = (0.35 + 0.65 * node0) * (0.55 + 0.45 * (self.jitter[0] * 0.5 + 0.5));

        // Period doubling builds the whole series on f0/2, so the integer harmonics of f0 are
        // still present and still strongest — the pitch is unchanged — and the half-integers
        // arrive between them as the buzz.
        let doubled = s.subharm > 0.001;
        let div = if doubled { 2.0 } else { 1.0 };

        for k in 0..count {
            let kn = k as f32 + 1.0;

            // The stiff-body relation: f_k = k·f0·√(1 + B·k²). B is the stiffness coefficient,
            // which is exactly what the Inharmonicity control is.
            let ratio = kn * (1.0 + b * kn * kn * 0.01).sqrt();
            let detune = 1.0 + self.jitter[k] * s.spread * 0.04;
            let freq = s.f0 * vib * ratio * detune / div;

            // Amplitude: roll off with partial index, plus the excitation-point null. A partial
            // whose node falls exactly where the body was struck cannot be excited at all —
            // this is what makes the same bowl hit in two places sound like two instruments.
            // Keyed to the harmonic number, like the roll-off. On the doubled series the
            // fundamental sits at an EVEN index, and at position 0.5 that put it exactly on a
            // node — sin(2*pi*0.5) = 0 — so switching the buzz on silently nulled the note's
            // own fundamental. The null belongs to where the body is excited, which is a fact
            // about the harmonic, not about which slot it occupies in the array.
            // Harmonic number relative to f0, NOT the index in the series. With period doubling
            // the series is built on f0/2, so the fundamental sits at index 2 — keying anything
            // to the index puts it in the wrong place entirely.
            let harm = kn / div;
            let node = (core::f32::consts::PI * harm * s.position.clamp(0.01, 0.99)).sin().abs();
            let roll = harm.max(0.8).powf(-amp_exp);
            let mut amp = roll * (0.35 + 0.65 * node) * (0.55 + 0.45 * (self.jitter[k] * 0.5 + 0.5));
            // With the series on f0/2, ODD kn lands on a half-integer of f0 — those are the
            // partials period doubling adds, so they come in with the control rather than
            // being there all along.
            if doubled && (k % 2 == 0) {
                amp *= s.subharm;
            }

            // Decay per partial. Negative tilt is the bronze/iron behaviour.
            // Bounded RELATIVE to the fundamental, not just absolutely. A negative tilt
            // raises kn^-tilt, and at 64 partials that reaches ~146x — so a 10 s body grew a
            // 60 s shimmer of high partials that never died. The voice then never freed, notes
            // piled toward the polyphony limit, and every preset collapsed into one wash.
            // Four times the fundamental is a long ring; past that it is a stuck note.
            let ceiling = (base_decay * 4.0).min(28.0);
            let decay = (base_decay * kn.powf(-tilt)).clamp(0.02, ceiling);

            // Drift rate: 0.02–0.3 Hz, spaced by the golden ratio so no two partials share a
            // period. Beat rate rises with partial index, matching how a real body's higher
            // modes are detuned further apart in absolute terms.
            let drift_hz = 0.02 + 0.28 * ((kn * PHI).fract());
            self.am_inc[k] = drift_hz / sr;
            self.beat_inc[k] = (s.beat_rate * (1.0 + k as f32 * 0.11)).min(24.0) / sr;

            // Formants shape the amplitudes in BOTH modes — a struck body with a throat is
            // exactly as useful as a sung one.
            let amp = amp * formant_gain(freq, s.formant_shift, s.formant);

            // The spotlight lifts its partial toward the FUNDAMENTAL'S level rather than
            // multiplying by a fixed factor.
            //
            // A fixed multiplier cannot work: amplitude rolls off as k^-exponent, and at Air's
            // 1.8 the twenty-ninth partial sits at 0.003 of the fundamental — a 3x boost leaves
            // it three hundred times too quiet to hear, so the control appeared to do nothing.
            // A throat singer's vocal tract resonance brings the chosen harmonic up to roughly
            // the loudness of the drone itself, which is exactly why the ear splits it off into
            // a second voice.
            let amp = if s.spotlight > 0.001 {
                let shape = spotlight_shape(k, count, s.spotlight_pos, s.spotlight_width);
                let lifted = amp * (1.0 - shape) + shape * amp0 * 1.15;
                amp * (1.0 - s.spotlight) + lifted * s.spotlight
            } else {
                amp
            };

            self.res[k].tune(freq, decay, amp, sr);

            // Sustained partial: coupled oscillator at the same frequency.
            if freq > 0.0 && freq < sr * 0.49 {
                let w = core::f32::consts::TAU * freq / sr;
                self.osc_eps[k] = 2.0 * (w * 0.5).sin();
                self.osc_amp[k] = amp;
            } else {
                self.osc_eps[k] = 0.0;
                self.osc_amp[k] = 0.0;
            }
        }
        for k in count..MAX_PARTIALS {
            self.res[k].g = 0.0;
            self.res[k].a1 = 0.0;
            self.res[k].a2 = 0.0;
        }

        let mut bw = 0.0;
        let mut amp_sq = 0.0;
        for k in 0..count {
            bw += self.res[k].bandwidth();
            // Half-integer partials are excluded from the normalisation reference. They are an
            // ADDITION to the timbre, not part of what sets the note's level — counting them
            // makes `norm` fall as the buzz comes in, so reaching for the control quietly turns
            // the note down instead of roughening it.
            if doubled && k % 2 == 0 {
                continue;
            }
            let a = self.res[k].g / self.res[k].sin_w.max(0.02);
            amp_sq += a * a;
        }
        self.mean_bw = (bw / count.max(1) as f32).max(1.0e-9);
        // Normalise by the amplitudes actually present, not by the partial count.
        //
        // A flat 1/sqrt(count) assumed every partial contributes equally, and they do not: a
        // glass body rolls off slowly so 64 partials really are 64 contributors, while a skin
        // body's upper 48 are almost silent. The result was that raising Partials made a patch
        // quieter — Vitreous, at 64, landed a full 17 dB under Ferrous on the same note.
        // 0.45, not 1.4. The first pass at amplitude normalisation put every preset between
        // 0.8 and 1.0 peak, permanently into the output soft-clip — which does not just sound
        // squashed, it ERASES the movement the bank works to produce: Ferrous measured 0.9 dB
        // of pulsing while clipped against 9.5 dB when it had headroom. Loud is not the same
        // as alive, and for this instrument headroom IS the expression.
        // Clamped, because normalising by surviving amplitude has a failure mode of its own:
        // a heavily stretched bank pushes most of its partials past Nyquist where they are
        // silenced, so `amp_sq` collapses and the few survivors get boosted enormously. Ferrous
        // (58% inharmonic on iron) came out 7x louder than Himalayan and clipped continuously.
        // The ceiling says a sparse body may be lifted, but not turned into the loudest thing
        // in the instrument.
        // Range widened upward: several bodies were pinned against the floor and could not be
        // lifted by their preset trim at all. Per-preset MASTER_GAIN pulls the loud ones back
        // down, which is the right place for it — the DSP should give every body enough level
        // to work with, and the preset decides where it sits.
        self.norm = (0.62 / amp_sq.sqrt().max(0.05)).clamp(0.14, 0.30);
    }

    /// Scale factor for CONTINUOUS excitation.
    ///
    /// A strike is a one-shot and needs no compensation — impulse normalisation already gives it
    /// a consistent level. A bow feeds the bank forever, so it does need one.
    ///
    /// The compensation is `sqrt(1-r)`, NOT `(1-r)`. A resonator driven by a pure tone at its
    /// own frequency integrates by 1/(1-r), but an exciter is broadband — only the fraction of
    /// its energy inside each partial's bandwidth is amplified, and for broadband input the
    /// output scales with 1/sqrt(1-r). Using the linear form over-attenuates by a factor of
    /// 1/sqrt(1-r), which at a ten-second decay is roughly 275x: audible as the bow producing
    /// almost nothing while a strike on the identical body is loud.
    ///
    /// What is left is a gentle rise in level with decay time — a resonant body really is
    /// louder under a sustained bow than a damped one, so that part is correct and wanted.
    #[inline]
    pub fn sustain_scale(&self) -> f32 {
        (self.mean_bw.sqrt() * 36.0).clamp(0.002, 1.0)
    }

    /// Recompute the per-partial amplitude envelopes. Control rate — see AM_CTL.
    fn update_gains(&mut self) {
        let step = AM_CTL as f32;
        for k in 0..self.count {
            self.am_phase[k] += self.am_inc[k] * step;
            if self.am_phase[k] >= 1.0 {
                self.am_phase[k] -= 1.0;
            }
            self.beat_phase[k] += self.beat_inc[k] * step;
            if self.beat_phase[k] >= 1.0 {
                self.beat_phase[k] -= 1.0;
            }
            let drift = (core::f32::consts::TAU * self.am_phase[k]).sin();
            let wah = (core::f32::consts::TAU * self.beat_phase[k]).sin();
            // Both are unipolar dips rather than bipolar swings: a partial should fade and
            // return, never invert. Peak gain stays 1 so Anima cannot make the voice louder.
            let target = (1.0 - self.anima * 0.5 + self.anima * 0.5 * drift)
                * (1.0 - self.beat * 0.45 + self.beat * 0.45 * wah);
            // Ramp toward it rather than jumping. Sixty-four partials each stepping to a new
            // gain every 32 samples is a 1.5 kHz zipper spread across the entire spectrum —
            // it reads as grain and harshness rather than as a stepped envelope, which is why
            // it is easy to mistake for an aliasing problem.
            self.gain_target[k] = target;
            self.gain_step[k] = (target - self.gain[k]) * (1.0 / AM_CTL as f32);
        }
    }

    /// Drive the bank with one sample of excitation and return the summed output.
    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        // Age the note and re-derive the body as it goes.
        self.note_samples += 1;
        if self.spec.vibrato > 0.0005 {
            self.vib_phase += self.spec.vibrato_rate / self.sr;
            if self.vib_phase >= 1.0 {
                self.vib_phase -= 1.0;
            }
        }
        if self.spec.morph.abs() > 0.001 || self.spec.vibrato > 0.0005 {
            self.retune_ctl += 1;
            if self.retune_ctl >= RETUNE {
                self.retune_ctl = 0;
                let secs = self.note_samples as f32 / self.sr;
                // Eased, so the change is fastest in the middle of the journey and settles at
                // each end rather than stopping dead.
                let raw = (secs / self.spec.morph_time.max(0.2)).clamp(0.0, 1.0);
                let progress = raw * raw * (3.0 - 2.0 * raw);
                self.build(progress);
            }
        }
        if self.ctl == 0 {
            self.update_gains();
        }
        self.ctl += 1;
        if self.ctl >= AM_CTL {
            self.ctl = 0;
        }
        let mode = self.spec.mode;
        let mut sum = 0.0;
        for k in 0..self.count {
            self.gain[k] += self.gain_step[k];
            let g = self.gain[k];

            // The gain rides the OUTPUT, so it modulates the sound itself rather than the
            // excitation — the partials breathe while the note is sounding.
            if mode != BankMode::Sustained {
                sum += self.res[k].process(x) * g;
            }
            if mode != BankMode::Struck {
                // Coupled-form quadrature oscillator. `s` is the sine output.
                self.osc_s[k] += self.osc_eps[k] * self.osc_c[k];
                self.osc_c[k] -= self.osc_eps[k] * self.osc_s[k];
                if self.osc_env[k] < 1.0 {
                    self.osc_env[k] = (self.osc_env[k] + self.osc_env_inc[k]).min(1.0);
                }
                let e = self.osc_env[k];
                // OSC_GAIN because the two paths do not have comparable output for the same
                // amplitude. A resonator is DRIVEN continuously and integrates its input by
                // roughly its own Q, while an oscillator just puts out the amplitude it was
                // given — so the sung bank arrived about 25x under the struck one on identical
                // partial amplitudes, which reads as the mode being broken rather than quiet.
                sum += self.osc_s[k] * self.osc_amp[k] * g * (e * e * (3.0 - 2.0 * e)) * OSC_GAIN;
            }
        }
        // Blend sums two full banks, so halve it rather than letting the mode change the level.
        if mode == BankMode::Blend {
            sum *= 0.5;
        }
        // Normalise loosely by partial count so switching 16 → 64 changes the timbre rather
        // than the level.
        sum * self.norm
    }

    /// True once the bank has rung out. Checked against a floor well below audibility, because
    /// a 40-second tail that is cut early is far more noticeable than one held slightly long.
    /// True when this bank is driven rather than ringing.
    pub fn is_sustained(&self) -> bool {
        self.spec.mode != BankMode::Struck
    }

    pub fn is_quiet(&self) -> bool {
        // A driven bank never goes quiet on its own. The voice's own gate decides when a
        // sustained note ends; asking the bank would hold it forever.
        if self.spec.mode == BankMode::Sustained {
            return true;
        }
        let mut e = 0.0;
        for k in 0..self.count {
            e += self.res[k].energy();
            // 1e-3, not 1e-4. Below this the bank sits ~60 dB under a struck note and is
            // inaudible under the master gain; holding voices open through that last silent
            // decade is what let polyphony fill up.
            if e > 1.0e-3 {
                return false;
            }
        }
        true
    }
}
