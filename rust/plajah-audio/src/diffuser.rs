//! The Veil — VELA's diffusion field.
//!
//! This lives *inside* the instrument rather than as an FX device on the track, and that is a
//! deliberate inversion of how a subtractive synth is normally built. For a voice whose notes
//! decay over forty seconds, the diffusion field is not polish applied afterwards — it is part
//! of the body. Keeping it in the instrument also means it is seeded, bounced and automated
//! with the patch, so a Veil setting travels with a preset and an offline render matches.
//!
//! It runs ONCE, after the voice sum, not per voice. A per-voice FDN would multiply cost by the
//! polyphony for no audible gain: the whole point of a diffusion field is that everything ends
//! up in the same room.
//!
//! The internal FDN is four lines fed from the mono sum and redistributed across whatever
//! channel layout is active. That is fixed cost for stereo through 7.1.4, and it decorrelates
//! properly instead of running an expensive independent reverb per channel.

use crate::osc::Rng;
use crate::spatial::MAX_CHANNELS;

const LINES: usize = 4;
const AP_STAGES: usize = 4;

/// Delay-line lengths in milliseconds at Size = 0.5, chosen mutually prime-ish so the modal
/// density builds smoothly instead of ringing at a common multiple.
const LINE_MS: [f32; LINES] = [29.7, 37.1, 41.3, 49.9];
const AP_MS: [f32; AP_STAGES] = [4.77, 3.59, 12.73, 9.31];

/// Shimmer intervals. Stepped, because a continuous pitch-shift control here produces
/// seasickness rather than expression.
#[inline]
fn shimmer_ratio(index: u32) -> f32 {
    match index {
        1 => 2.996_614, // +19, an octave and a fifth
        2 => 4.0,       // +24
        3 => 0.5,       // -12
        _ => 2.0,       // +12
    }
}

struct Line {
    buf: Vec<f32>,
    write: usize,
    /// One-pole damping inside the feedback loop — what stops a long decay turning into noise.
    damp: f32,
    /// DC blocker state. A feedback loop with allpass stages and no DC path to ground
    /// accumulates offset, and at a long decay that offset dominates: a C4 note was measuring
    /// 70% of its energy below 100 Hz, which is rumble, not a body.
    dc_x1: f32,
    dc_y1: f32,
}

impl Line {
    fn new(max_len: usize) -> Self {
        Self { buf: vec![0.0; max_len.max(2)], write: 0, damp: 0.0, dc_x1: 0.0, dc_y1: 0.0 }
    }

    /// One-pole DC blocker, ~5 Hz corner. Transparent to everything musical.
    #[inline]
    fn block_dc(&mut self, x: f32) -> f32 {
        let y = x - self.dc_x1 + 0.9995 * self.dc_y1;
        self.dc_x1 = x;
        self.dc_y1 = y;
        y
    }

    #[inline]
    fn read(&self, delay: f32) -> f32 {
        let n = self.buf.len();
        let d = delay.clamp(1.0, (n - 2) as f32);
        let i = d.floor();
        let frac = d - i;
        let a = (self.write + n - i as usize) % n;
        let b = (a + n - 1) % n;
        // Linear interpolation is enough here: the read position only moves when Size is being
        // swept, and the field is dense enough to hide the rest.
        self.buf[a] * (1.0 - frac) + self.buf[b] * frac
    }

    #[inline]
    fn write(&mut self, x: f32) {
        self.write = (self.write + 1) % self.buf.len();
        self.buf[self.write] = x;
    }

    fn clear(&mut self) {
        for v in self.buf.iter_mut() {
            *v = 0.0;
        }
        self.damp = 0.0;
        self.dc_x1 = 0.0;
        self.dc_y1 = 0.0;
    }
}

/// Granular pitch shifter for the shimmer tap. Two read heads a half-window apart, crossfaded
/// so the wrap is never a click.
struct Shifter {
    buf: Vec<f32>,
    write: usize,
    phase: f32,
    window: f32,
}

impl Shifter {
    fn new(len: usize) -> Self {
        let window = (len as f32 * 0.45).max(64.0);
        Self { buf: vec![0.0; len.max(4)], write: 0, phase: 0.0, window }
    }

    #[inline]
    fn process(&mut self, x: f32, ratio: f32) -> f32 {
        let n = self.buf.len();
        self.write = (self.write + 1) % n;
        self.buf[self.write] = x;

        // The read head moves at `ratio` relative to the write head; the difference is the
        // pitch shift, and the window wrap is what keeps it bounded.
        self.phase += ratio - 1.0;
        if self.phase >= self.window {
            self.phase -= self.window;
        } else if self.phase < 0.0 {
            self.phase += self.window;
        }

        let read = |p: f32, buf: &Vec<f32>| -> f32 {
            let d = p.clamp(0.0, (n - 2) as f32);
            let i = d.floor() as usize;
            let frac = d - i as f32;
            let a = (self.write + n - i) % n;
            let b = (a + n - 1) % n;
            buf[a] * (1.0 - frac) + buf[b] * frac
        };

        let p1 = self.phase;
        let p2 = self.phase + self.window * 0.5;
        let p2 = if p2 >= self.window { p2 - self.window } else { p2 };

        // Two Hann windows a half-cycle apart. They sum to exactly 1 everywhere, and both the
        // window and its derivative are continuous through the wrap.
        //
        // This was sin().abs() against cos().abs(). Those do satisfy g1^2 + g2^2 = 1, but the
        // absolute value folds the cosine at the half-window and leaves a derivative
        // discontinuity there — a kink on every single grain, which is heard as a persistent
        // metallic edge on anything with shimmer up. It is the classic granular artefact and it
        // is easy to misread as the pitch shifter simply "sounding cheap".
        let t = self.phase / self.window;
        let t2 = if t + 0.5 >= 1.0 { t - 0.5 } else { t + 0.5 };
        let g1 = 0.5 - 0.5 * (core::f32::consts::TAU * t).cos();
        let g2 = 0.5 - 0.5 * (core::f32::consts::TAU * t2).cos();

        read(p1, &self.buf) * g1 + read(p2, &self.buf) * g2
    }

    fn clear(&mut self) {
        for v in self.buf.iter_mut() {
            *v = 0.0;
        }
        self.phase = 0.0;
    }
}

#[derive(Clone, Copy)]
pub struct VeilSpec {
    pub size: f32,
    pub decay: f32,
    pub diffusion: f32,
    pub shimmer: f32,
    pub shimmer_ivl: u32,
    pub blur: f32,
    pub freeze: bool,
    pub mix: f32,
}

pub struct Diffuser {
    sr: f32,
    lines: [Line; LINES],
    aps: [Line; AP_STAGES],
    shifter: Shifter,
    /// Per-line output spread across channels, fixed at construction from a seeded RNG so the
    /// field is decorrelated but identical on every render.
    spread: [[f32; MAX_CHANNELS]; LINES],
    /// Smoothed controls — Size and Decay are swept by Motion and must never step.
    /// One-pole lowpass on the shimmer tap.
    ///
    /// Shimmer feedback is a ladder: each pass shifts the signal up another interval, so
    /// content climbs +12, +24, +36 and piles into the top of the spectrum where partials are
    /// dense and the ear is least forgiving. Unfiltered, that is not "bright", it is glare —
    /// the shimmered presets measured 5-20x the roughness of the clean ones. Damping the tap
    /// gives the ladder a finite number of rungs, which is what every shimmer reverb worth
    /// using does.
    shim_lp: f32,
    size_z: f32,
    decay_z: f32,
    mix_z: f32,
    shimmer_z: f32,
    /// Slow per-line delay modulation. A fixed-length FDN is a static room, and a static room
    /// is exactly what makes a big reverb sound synthetic — a real space is never still. This
    /// is also the only movement a heavily shimmered patch has, since its tail never gets
    /// quiet enough for amplitude pulsing to read.
    mod_phase: [f32; LINES],
}

impl Diffuser {
    pub fn new(sr: f32) -> Self {
        // Enough headroom for the longest line at maximum Size, plus interpolation slack.
        let max_line = (0.140 * sr) as usize + 8;
        let max_ap = (0.030 * sr) as usize + 8;
        let mut rng = Rng(0x5DEE_CE66);

        let mut spread = [[0.0f32; MAX_CHANNELS]; LINES];
        for (l, row) in spread.iter_mut().enumerate() {
            for (c, g) in row.iter_mut().enumerate() {
                // Alternating sign per line/channel pair gives a wide, phase-varied field
                // without any line dominating a channel.
                let s = if (l + c) % 2 == 0 { 1.0 } else { -1.0 };
                *g = s * (0.55 + 0.45 * rng.next_f32());
            }
        }

        Self {
            sr,
            lines: core::array::from_fn(|_| Line::new(max_line)),
            aps: core::array::from_fn(|i| Line::new((AP_MS[i] * 0.001 * sr) as usize + 8 + max_ap / 4)),
            shifter: Shifter::new((0.080 * sr) as usize + 8),
            spread,
            shim_lp: 0.0,
            size_z: 0.5,
            decay_z: 0.4,
            mix_z: 0.0,
            shimmer_z: 0.0,
            // Quarter-cycle apart, so the lines swell in sequence rather than together.
            mod_phase: [0.0, 0.25, 0.5, 0.75],
        }
    }

    pub fn clear(&mut self) {
        for l in self.lines.iter_mut() {
            l.clear();
        }
        for a in self.aps.iter_mut() {
            a.clear();
        }
        self.shifter.clear();
        self.shim_lp = 0.0;
    }

    /// Process a block in place. `nch` channels of `frames` samples, channel-major.
    pub fn process(
        &mut self,
        buf: &mut [[f32; crate::engine::MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        nch: usize,
        s: &VeilSpec,
    ) {
        if s.mix <= 0.0001 && self.mix_z <= 0.0001 && !s.freeze {
            return;
        }

        // Control smoothing, once per block. Per-sample smoothing here would cost more than the
        // reverb itself and buy nothing — a block is 2.7 ms.
        let ks = 0.15;
        self.size_z += (s.size - self.size_z) * ks;
        self.decay_z += (s.decay - self.decay_z) * ks;
        self.mix_z += (s.mix - self.mix_z) * ks;
        self.shimmer_z += (s.shimmer - self.shimmer_z) * ks;

        // Size: 0..1 → a quarter of the base lengths out to roughly 2.8×.
        let size = 0.25 + self.size_z * 2.55;
        // Blur lengthens the allpass stages, which is literally smearing across time.
        let ap_scale = 1.0 + s.blur * 2.5;

        // Feedback from the decay time. Frozen means unity, and unity is safe here because the
        // input is muted at the same moment.
        let rt60 = 0.5 + self.decay_z * self.decay_z * 59.5;
        let mean_delay = (LINE_MS.iter().sum::<f32>() / LINES as f32) * 0.001 * size;
        // 0.985 rather than 1.0 for the normal path: at a 60 s RT60 the computed value rounds
        // to unity, and a unity loop with a swept delay length is how a reverb turns into an
        // oscillator. Freeze is allowed closer, because its input is muted in the same breath.
        let mut fb = if s.freeze { 0.999 } else { 10f32.powf(-3.0 * mean_delay / rt60) };
        fb = fb.clamp(0.0, if s.freeze { 0.999 } else { 0.985 });

        // Damping rises with blur and falls with diffusion, which is what keeps a very long
        // decay from turning into white noise.
        let damp = (0.12 + s.blur * 0.45).clamp(0.0, 0.92);
        let ap_g = (0.5 + s.diffusion * 0.25).clamp(0.0, 0.78);
        let ratio = shimmer_ratio(s.shimmer_ivl);
        // Shimmer is a CROSSFADE against the direct feedback, not an addition to it.
        //
        // Adding it made the loop gain fb*(1 + shim): at a long decay fb is ~0.99 and shim ran
        // to 0.62, so the loop ran at 1.6 and the field climbed until the output clipper caught
        // it. That is the "off the hinges" behaviour, and it also flattened every preset,
        // because a runaway reverb sounds the same regardless of what fed it.
        //
        // Crossfaded, the loop gain is exactly fb whatever shimmer is doing.
        // Capped below 1 so some direct feedback always survives. At full crossfade the tail is
        // pure pitch-shifted wash, which fills every gap and flattens the dynamics — Aurora
        // measured 1.2 dB of movement against 9-13 dB everywhere else.
        let shim = self.shimmer_z.clamp(0.0, 1.0) * 0.70;
        let in_gain = if s.freeze { 0.0 } else { 1.0 };

        // Rates chosen mutually incommensurate — 0.11 to 0.23 Hz, slow enough to read as the
        // room breathing rather than as chorus. Depth is a few tenths of a percent; any more
        // and a sustained note audibly detunes.
        const MOD_HZ: [f32; LINES] = [0.11, 0.147, 0.181, 0.233];
        let block_sec = frames as f32 / self.sr;
        let mut delays = [0.0f32; LINES];
        for i in 0..LINES {
            self.mod_phase[i] += MOD_HZ[i] * block_sec;
            if self.mod_phase[i] >= 1.0 {
                self.mod_phase[i] -= 1.0;
            }
            let wobble = 1.0
                + 0.003 * (core::f32::consts::TAU * self.mod_phase[i]).sin() * (0.4 + s.diffusion * 0.6);
            delays[i] = LINE_MS[i] * 0.001 * self.sr * size * wobble;
        }
        let mut ap_delays = [0.0f32; AP_STAGES];
        for i in 0..AP_STAGES {
            ap_delays[i] = AP_MS[i] * 0.001 * self.sr * ap_scale;
        }

        for f in 0..frames {
            // Mono sum in. Reverberation of a summed signal is what a real room does; running
            // an independent field per channel just costs more and sounds less coherent.
            let mut dry = 0.0;
            for c in 0..nch {
                dry += buf[c][f];
            }
            dry *= 1.0 / (nch as f32).sqrt().max(1.0);

            // Input diffusion: a chain of allpasses turns a transient into density before it
            // ever reaches the delay network.
            let mut x = dry * in_gain;
            for i in 0..AP_STAGES {
                let d = self.aps[i].read(ap_delays[i]);
                let v = x - ap_g * d;
                self.aps[i].write(v);
                x = d + ap_g * v;
            }

            // Read the network.
            let mut y = [0.0f32; LINES];
            for i in 0..LINES {
                y[i] = self.lines[i].read(delays[i]);
            }

            // Householder-style mixing: every line feeds every other. This is what makes the
            // tail dense rather than four audible echoes.
            let sum = (y[0] + y[1] + y[2] + y[3]) * 0.5;
            let mut m = [0.0f32; LINES];
            for i in 0..LINES {
                m[i] = y[i] - sum;
            }

            // The shimmer tap: pitch-shift the network output and fold it back in. Because it
            // re-enters the same network it blooms upward continuously instead of sounding like
            // a discrete octave layer.
            let shifted = if shim > 0.0001 {
                let raw = self.shifter.process(sum, ratio);
                // ~2.5 kHz at 48k, opened up a little when diffusion is low so a sparse,
                // deliberate shimmer can still sparkle.
                let cut = (0.16 + 0.10 * (1.0 - s.diffusion)) * (48000.0 / self.sr);
                self.shim_lp += (raw - self.shim_lp) * cut.clamp(0.02, 0.9);
                self.shim_lp
            } else {
                self.shim_lp = 0.0;
                0.0
            };

            for i in 0..LINES {
                let recirc = m[i] * (1.0 - shim) + shifted * shim;
                let mut v = x + recirc * fb;
                // Damping lowpass inside the loop.
                self.lines[i].damp += (v - self.lines[i].damp) * (1.0 - damp);
                v = self.lines[i].damp;
                v = self.lines[i].block_dc(v);
                // Soft ceiling inside the loop, transparent below it. Belt and braces: the
                // crossfade above bounds the gain analytically, but a swept Size changes the
                // read position mid-flight and a bounded loop is cheaper than a bug report.
                if v.abs() > 1.5 {
                    v = crate::filter::tanh_fast(v);
                }
                if !v.is_finite() {
                    v = 0.0;
                }
                self.lines[i].write(v);
            }

            // Distribute the lines across the layout.
            let mut wet = [0.0f32; MAX_CHANNELS];
            for c in 0..nch {
                let mut acc = 0.0;
                for i in 0..LINES {
                    acc += y[i] * self.spread[i][c];
                }
                // Normalised by line count so the wet level does not depend on how many lines
                // happen to be feeding a channel.
                wet[c] = acc * (1.0 / (LINES as f32).sqrt());
            }

            let mix = self.mix_z.clamp(0.0, 1.0);
            for c in 0..nch {
                buf[c][f] = buf[c][f] * (1.0 - mix) + wet[c] * mix;
            }
        }
    }
}
