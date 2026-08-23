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

/// The partial-count control is stepped, because the count sets the per-voice cost and a
/// continuous knob would let someone slide into a dropout without knowing why.
pub const PARTIAL_STEPS: [usize; 5] = [16, 24, 32, 48, 64];

#[inline]
pub fn partial_count(norm: f32) -> usize {
    let i = (norm.clamp(0.0, 1.0) * (PARTIAL_STEPS.len() - 1) as f32).round() as usize;
    PARTIAL_STEPS[i.min(PARTIAL_STEPS.len() - 1)]
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
}

impl Material {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => Material::Glass,
            2 => Material::Iron,
            3 => Material::Wood,
            4 => Material::Skin,
            5 => Material::Air,
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
        self.g = amp * w.sin().max(0.02);
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
    /// 0..1 excitation point along the body. Nulls partials whose node lands there.
    pub position: f32,
    /// 0..1. How much decay shortens as you play up the keyboard. Real bodies do this.
    pub keytrack: f32,
}

pub struct ModalBank {
    res: [Resonator; MAX_PARTIALS],
    count: usize,
    /// Mean bandwidth across the active partials, cached at `prepare`.
    mean_bw: f32,
    /// Frozen per note so the same voice re-struck sounds like the same object.
    jitter: [f32; MAX_PARTIALS],
}

impl ModalBank {
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng(seed | 1);
        let mut jitter = [0.0f32; MAX_PARTIALS];
        for j in jitter.iter_mut() {
            *j = rng.bipolar();
        }
        Self { res: [Resonator::default(); MAX_PARTIALS], count: 0, mean_bw: 1.0, jitter }
    }

    pub fn reset(&mut self) {
        for r in self.res.iter_mut() {
            r.reset();
        }
    }

    /// Recompute the partial layout. Called on note-on, and again only if the host changes a
    /// body parameter while a note is held.
    pub fn prepare(&mut self, s: &ModalSpec, sr: f32) {
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

        for k in 0..count {
            let kn = k as f32 + 1.0;

            // The stiff-body relation: f_k = k·f0·√(1 + B·k²). B is the stiffness coefficient,
            // which is exactly what the Inharmonicity control is.
            let ratio = kn * (1.0 + b * kn * kn * 0.01).sqrt();
            let detune = 1.0 + self.jitter[k] * s.spread * 0.04;
            let freq = s.f0 * ratio * detune;

            // Amplitude: roll off with partial index, plus the excitation-point null. A partial
            // whose node falls exactly where the body was struck cannot be excited at all —
            // this is what makes the same bowl hit in two places sound like two instruments.
            let node = (core::f32::consts::PI * kn * s.position.clamp(0.01, 0.99)).sin().abs();
            let roll = kn.powf(-amp_exp);
            let amp = roll * (0.35 + 0.65 * node) * (0.55 + 0.45 * (self.jitter[k] * 0.5 + 0.5));

            // Decay per partial. Negative tilt is the bronze/iron behaviour.
            let decay = (base_decay * kn.powf(-tilt)).clamp(0.02, 60.0);

            self.res[k].tune(freq, decay, amp, sr);
        }
        for k in count..MAX_PARTIALS {
            self.res[k].g = 0.0;
            self.res[k].a1 = 0.0;
            self.res[k].a2 = 0.0;
        }

        let mut bw = 0.0;
        for k in 0..count {
            bw += self.res[k].bandwidth();
        }
        self.mean_bw = (bw / count.max(1) as f32).max(1.0e-9);
    }

    /// Scale factor for CONTINUOUS excitation.
    ///
    /// A strike is a one-shot and needs no compensation — impulse normalisation already gives
    /// it a consistent level. A bow feeds the bank forever, and a high-Q resonator integrates
    /// that input by roughly 1/(1-r), which at a twenty-second decay is a factor of 140,000.
    /// Scaling sustained drive by the bank's own bandwidth cancels exactly that, so Decay
    /// changes how long a bowed note rings rather than how loud it is.
    #[inline]
    pub fn sustain_scale(&self) -> f32 {
        (self.mean_bw * 40.0).clamp(0.0005, 1.0)
    }

    /// Drive the bank with one sample of excitation and return the summed output.
    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let mut sum = 0.0;
        for k in 0..self.count {
            sum += self.res[k].process(x);
        }
        // Normalise loosely by partial count so switching 16 → 64 changes the timbre rather
        // than the level.
        sum * (1.0 / (self.count as f32).sqrt().max(1.0))
    }

    /// True once the bank has rung out. Checked against a floor well below audibility, because
    /// a 40-second tail that is cut early is far more noticeable than one held slightly long.
    pub fn is_quiet(&self) -> bool {
        let mut e = 0.0;
        for k in 0..self.count {
            e += self.res[k].energy();
            if e > 1.0e-4 {
                return false;
            }
        }
        true
    }
}
