//! BAJO — the sections that make the low-end engine its own instrument.
//!
//! Everything here runs AFTER the voice sum, in one rack: Throat → Scorch → Ghost Gate → Space.
//! That placement is deliberate and is the same argument as VELA's Veil — a bass patch's
//! distortion and gating are part of the sound, not part of the channel strip, so they travel
//! with the patch and render identically offline.
//!
//! The per-voice half of BAJO (the string engine, and the wobble's per-voice destinations)
//! lives in `string.rs` and `voice.rs`; only the wobble's shape evaluator is shared from here so
//! the engine and the voices cannot disagree about what the LFO is doing.

use crate::engine::MAX_BLOCK;
use crate::filter::{tanh_fast, Svf, SvfMode};
use crate::params::*;
use crate::shaper::Shaper;
use crate::spatial::MAX_CHANNELS;

/// Stereo is the right width for these effects. A ping-pong delay has no meaning in 7.1.4 and
/// allocating twelve channels of delay line to find that out would cost a megabyte.
const FX_CH: usize = 2;

// ── the wobble ───────────────────────────────────────────────────────────────

/// Evaluate the wobble shape at a phase. Shared by the engine rack and every voice — they read
/// the same phase and the same function, so a wobble that moves the filter and a wobble that
/// moves the vowel are provably the same wobble.
///
/// `skew` is stored 0..1 and warps the phase either side of the midpoint, which is what turns a
/// sine into a ramp-ish snarl without changing shape selection.
#[inline]
pub fn wob_eval(phase: f32, shape: u32, skew: f32) -> f32 {
    let mut p = phase - phase.floor();
    let sk = (skew - 0.5) * 2.0;
    if sk.abs() > 0.01 {
        let k = (0.5 - sk * 0.42).clamp(0.06, 0.94);
        p = if p < k { (p / k) * 0.5 } else { 0.5 + ((p - k) / (1.0 - k)) * 0.5 };
    }
    let t = p * core::f32::consts::TAU;
    match shape {
        0 => t.sin(),
        1 => 1.0 - 4.0 * (((p + 0.25) % 1.0) - 0.5).abs(), // triangle
        2 => 1.0 - 2.0 * p,                                // saw down
        3 => 2.0 * p - 1.0,                                // saw up
        4 => if p < 0.5 { 1.0 } else { -1.0 },             // square
        5 => hash_bipolar((phase.floor() as i32) * 7 + (p * 4.0) as i32 * 13 + 1), // sample+hold
        // Growl: a sine with its third and fifth folded in, then saturated. This is the shape
        // that does the classic talking wobble without any help from the formant bank.
        6 => tanh_fast((t.sin() * 0.75 + (t * 3.0 + 1.1).sin() * 0.42 + (t * 5.0).sin() * 0.18) * 1.9),
        7 => (t.sin() * 2.35).sin(), // fold
        _ => (t.sin() * 2.7).clamp(-1.0, 1.0), // trapezoid
    }
}

#[inline]
fn hash_bipolar(n: i32) -> f32 {
    let mut h = (n as u32).wrapping_mul(1_103_515_245).wrapping_add(12_345) & 0x7fff_ffff;
    h = (h ^ (h >> 13)).wrapping_mul(1_274_126_177) & 0x7fff_ffff;
    (h as f32 / 1_073_741_823.0) - 1.0
}

/// Everything a voice needs to evaluate the wobble for itself, resolved once per block.
#[derive(Clone, Copy, Default)]
pub struct WobbleFrame {
    pub on: bool,
    /// Phase at the first sample of this block.
    pub phase: f32,
    /// Phase increment per sample.
    pub inc: f32,
    pub shape: u32,
    pub skew: f32,
    /// One-pole coefficient, already resolved from the Smooth control.
    pub smooth: f32,
    pub dest1: u32,
    pub depth1: f32,
    pub dest2: u32,
    pub depth2: f32,
}

impl WobbleFrame {
    /// Depth for one destination, summing both slots — so pointing both at cutoff doubles it
    /// rather than silently dropping one.
    #[inline]
    pub fn depth_for(&self, dest: u32) -> f32 {
        let mut d = 0.0;
        if self.dest1 == dest { d += self.depth1; }
        if self.dest2 == dest { d += self.depth2; }
        d
    }
}

/// Engine-side wobble clock. Owns only the phase — the shape is a pure function.
#[derive(Default)]
pub struct Wobble {
    phase: f32,
    smoothed: f32,
}

impl Wobble {
    /// Resolve this block's wobble. `beats` is the transport position at the first sample, which
    /// is what makes the rate lane land on the grid instead of drifting against it.
    pub fn frame(&mut self, p: &Params, beats: f64, frames: usize, sr: f32, bps: f32) -> WobbleFrame {
        let on = p.get(WOB_BASE + W_ENABLE) > 0.5;
        let free = p.get(WOB_BASE + W_FREE) > 0.5;

        let hz = if free {
            0.05 * (40.0f32 / 0.05).powf(p.get(WOB_BASE + W_RATE).clamp(0.0, 1.0))
        } else {
            // The rate lane: one slot per 16th note, read at the transport's current 16th.
            let step = ((beats * 4.0).floor() as i64).rem_euclid(W_LANE_LEN as i64) as usize;
            let idx = (p.get(WOB_BASE + W_LANE + step as u32).round() as usize).min(WOB_DIVS.len() - 1);
            let beats_per_cycle = WOB_DIVS[idx].max(0.0001);
            bps / beats_per_cycle
        };

        let inc = (hz / sr).clamp(0.0, 0.45);
        let start = self.phase + p.get(WOB_BASE + W_PHASE);
        self.phase += inc * frames as f32;
        if self.phase > 4096.0 {
            self.phase -= 4096.0;
        }

        let sm = p.get(WOB_BASE + W_SMOOTH).clamp(0.0, 1.0);
        WobbleFrame {
            on,
            phase: start,
            inc,
            shape: p.get(WOB_BASE + W_SHAPE).round().max(0.0) as u32,
            skew: p.get(WOB_BASE + W_SKEW),
            smooth: if sm < 0.01 { 1.0 } else { (1.0 - sm * 0.985).powi(2).clamp(0.002, 1.0) },
            dest1: p.get(WOB_BASE + W_DEST1).round().max(0.0) as u32,
            depth1: if on { p.get(WOB_BASE + W_DEPTH1) } else { 0.0 },
            dest2: p.get(WOB_BASE + W_DEST2).round().max(0.0) as u32,
            depth2: if on { p.get(WOB_BASE + W_DEPTH2) } else { 0.0 },
        }
    }

    /// Engine-side value with the same smoothing the voices apply, so the vowel and the cutoff
    /// stay locked together.
    #[inline]
    fn value(&mut self, f: &WobbleFrame, offset: usize) -> f32 {
        let raw = wob_eval(f.phase + f.inc * offset as f32, f.shape, f.skew);
        self.smoothed += (raw - self.smoothed) * f.smooth;
        if f.smooth >= 1.0 { raw } else { self.smoothed }
    }
}

// ── throat ───────────────────────────────────────────────────────────────────

/// Bass-register formant triples for A E I O U.
const VOWELS: [[f32; 3]; 5] = [
    [700.0, 1220.0, 2600.0],
    [500.0, 1900.0, 2500.0],
    [300.0, 2200.0, 3000.0],
    [450.0, 800.0, 2830.0],
    [325.0, 700.0, 2530.0],
];

#[derive(Default)]
struct Throat {
    bp: [[Svf; 3]; MAX_CHANNELS],
}

impl Throat {
    #[inline]
    fn formants(vowel: f32) -> [f32; 3] {
        let x = vowel.clamp(0.0, 1.0) * 4.0;
        let i = (x.floor() as usize).min(3);
        let f = x - i as f32;
        let mut out = [0.0; 3];
        for k in 0..3 {
            out[k] = VOWELS[i][k] * (1.0 - f) + VOWELS[i + 1][k] * f;
        }
        out
    }

    #[inline]
    fn process(&mut self, x: f32, ch: usize, f: &[f32; 3], q: f32, amount: f32, sr: f32) -> f32 {
        let bank = &mut self.bp[ch.min(MAX_CHANNELS - 1)];
        let a = bank[0].process(x, f[0], q, sr, SvfMode::Band);
        let b = bank[1].process(x, f[1], q, sr, SvfMode::Band) * 0.7;
        let c = bank[2].process(x, f[2], q, sr, SvfMode::Band) * 0.45;
        let wet = (a + b + c) * 1.5;
        x * (1.0 - amount * 0.6) + wet * amount
    }
}

// ── scorch ───────────────────────────────────────────────────────────────────

/// The eleven algorithms. `d` is the resolved drive and `bias` the asymmetry — bias is what
/// produces even harmonics, and the DC it leaves behind is removed by the stage, not left to
/// eat headroom.
#[inline]
fn scorch_curve(x: f32, alg: u32, d: f32, bias: f32) -> f32 {
    let x = x + bias * 0.45;
    let y = match alg {
        0 => tanh_fast(x * (1.0 + d * 9.0)),
        1 => {
            // Tube: asymmetric soft clip, the negative half squashed slightly harder.
            if x > 0.0 { tanh_fast(x * (1.0 + d * 11.0)) } else { tanh_fast(x * (1.0 + d * 7.0)) * 0.82 }
        }
        2 => x.signum() * (1.0 - (-(x.abs()) * (1.0 + d * 14.0)).exp()),
        3 => tanh_fast((x + 0.42 * x * x) * (1.0 + d * 16.0)),
        4 => (x * core::f32::consts::PI * (0.5 + d * 3.2)).sin(),
        5 => {
            // Ruin: fold until it is inside the rails, then saturate what is left.
            let mut z = x * (1.0 + d * 8.0);
            let mut guard = 0;
            while z.abs() > 1.0 && guard < 8 {
                z = if z > 0.0 { 2.0 - z } else { -2.0 - z };
                guard += 1;
            }
            tanh_fast(z * 2.2)
        }
        6 => {
            let steps = (64.0 - d * 61.0).max(2.0);
            (x * steps).round() / steps
        }
        7 => tanh_fast((x.abs() * (1.0 + d * 3.0) - 0.5 * (1.0 + d)) * 1.6),
        8 => (x * (1.4 + d * 9.0)).sin(),
        9 => {
            let g = x * (1.0 + d * 4.0);
            tanh_fast((g / (1.0 + g.abs() * 0.86)) * 1.05)
        }
        _ => (x * (1.0 + d * 13.0)).clamp(-1.0, 1.0),
    };
    let comp = 1.0 / (1.0 + d * 1.3);
    y * (0.55 + 0.45 * comp) * 1.1
}

#[derive(Clone, Copy, Default)]
struct ScorchStage {
    shaper: Shaper,
    dc: f32,
    tone: Svf,
}

#[derive(Default)]
struct Scorch {
    stages: [[ScorchStage; SC_STAGES]; FX_CH],
    sub_lp: [[Svf; 2]; FX_CH],
    sub_hp: [[Svf; 2]; FX_CH],
    tilt_lo: [Svf; FX_CH],
    tilt_lo2: [Svf; FX_CH],
}

impl Scorch {
    #[allow(clippy::too_many_arguments)]
    #[inline]
    fn process(&mut self, x: f32, ch: usize, cfg: &ScorchCfg, drive_mod: f32, sr: f32) -> f32 {
        let c = ch.min(FX_CH - 1);
        let x = x * cfg.input;

        // Sub-safe: split the low band off BEFORE the stages and re-add it clean afterwards.
        // This is the difference between a bass that survives a club system and one that turns
        // to buzz — the fundamental never enters the nonlinearity at all.
        let (clean_sub, mut driven) = if cfg.safe {
            let mut lo = self.sub_lp[c][0].process(x, cfg.sub_hz, 0.2, sr, SvfMode::Low);
            lo = self.sub_lp[c][1].process(lo, cfg.sub_hz, 0.2, sr, SvfMode::Low);
            let mut hi = self.sub_hp[c][0].process(x, cfg.sub_hz, 0.2, sr, SvfMode::High);
            hi = self.sub_hp[c][1].process(hi, cfg.sub_hz, 0.2, sr, SvfMode::High);
            (lo, hi)
        } else {
            (0.0, x)
        };

        // Focus: matched pre-cut / post-boost around 260 Hz. Positive focus starves the lows
        // going in so the drive works on mids and highs, then restores balance coming out.
        let lo_pre = self.tilt_lo[c].process(driven, 260.0, 0.2, sr, SvfMode::Low);
        driven += lo_pre * (cfg.pre_gain - 1.0);

        for st in 0..SC_STAGES {
            let s = &mut self.stages[c][st];
            let cf = &cfg.stage[st];
            if cf.mix <= 0.0005 || (cf.drive <= 0.0005 && cf.alg == 0) {
                continue;
            }
            let d = (cf.drive + if st < 2 { drive_mod } else { 0.0 }).clamp(0.0, 1.4);
            let alg = cf.alg;
            let bias = cf.bias;
            let wet = s.shaper.process_with(driven, |v| scorch_curve(v, alg, d, bias));
            // Block the DC the bias term introduces, per stage, before it stacks.
            s.dc += (wet - s.dc) * 0.0006;
            let wet = wet - s.dc;
            // Tone: a shelf built from the stage's own lowpass, so one filter does both signs.
            let lo = s.tone.process(wet, 1400.0, 0.2, sr, SvfMode::Low);
            let wet = wet + lo * (cf.tone_gain - 1.0);
            driven = driven * (1.0 - cf.mix) + wet * cf.mix;
        }

        let lo_post = self.tilt_lo2[c].process(driven, 260.0, 0.2, sr, SvfMode::Low);
        driven += lo_post * (cfg.post_gain - 1.0);

        (driven + clean_sub) * cfg.output
    }
}

#[derive(Clone, Copy, Default)]
struct StageCfg {
    alg: u32,
    drive: f32,
    bias: f32,
    tone_gain: f32,
    mix: f32,
}

#[derive(Clone, Copy, Default)]
struct ScorchCfg {
    input: f32,
    output: f32,
    safe: bool,
    sub_hz: f32,
    pre_gain: f32,
    post_gain: f32,
    stage: [StageCfg; SC_STAGES],
    any: bool,
}

impl ScorchCfg {
    fn resolve(p: &Params) -> Self {
        let focus = (p.get(SC_FOCUS) - 0.5) * 2.0;
        let mut c = ScorchCfg {
            input: 0.25 + p.get(SC_INPUT) * 1.75,
            output: 0.25 + p.get(SC_OUTPUT) * 1.75,
            safe: p.get(SC_SAFE) > 0.5,
            sub_hz: 30.0 + p.get(SC_SUB) * 270.0,
            pre_gain: (10.0f32).powf(-focus * 15.0 / 20.0),
            post_gain: (10.0f32).powf(focus * 15.0 / 20.0),
            stage: [StageCfg::default(); SC_STAGES],
            any: false,
        };
        for st in 0..SC_STAGES {
            let drive = p.get(scorch_param(st, SC_DRIVE));
            let mix = p.get(scorch_param(st, SC_MIX));
            c.stage[st] = StageCfg {
                alg: p.get(scorch_param(st, SC_ALG)).round().max(0.0) as u32,
                drive,
                bias: (p.get(scorch_param(st, SC_BIAS)) - 0.5) * 2.0,
                tone_gain: (10.0f32).powf((p.get(scorch_param(st, SC_TONE)) - 0.5) * 2.0 * 12.0 / 20.0),
                mix,
            };
            if drive > 0.0005 && mix > 0.0005 {
                c.any = true;
            }
        }
        c
    }
}

// ── ghost gate ───────────────────────────────────────────────────────────────

/// A four-band step gate. A normal trance gate mutes everything at once, which is why nobody
/// puts one on a bass — the sub goes with it and the track falls over. Here each band has its
/// own pattern, so the sub row can stay solid while the air row is chopped into sixteenths.
///
/// The second half is the name: a closed step does not throw its audio away, it routes the
/// closed portion into the reverb send scaled by Spill. Chops bloom into the tail instead of
/// punching holes in it.
#[derive(Default)]
struct GhostGate {
    lp: [[Svf; 2]; FX_CH],
    bp1: [[Svf; 2]; FX_CH],
    bp2: [[Svf; 2]; FX_CH],
    hp: [[Svf; 2]; FX_CH],
    /// Slewed gain per band, per channel — the slew is what makes it a pump rather than a click.
    g: [[f32; G_BANDS]; FX_CH],
}

impl GhostGate {
    fn new() -> Self {
        GhostGate { g: [[1.0; G_BANDS]; FX_CH], ..Default::default() }
    }

    /// Split into four bands and gate each. Returns (gated, spill).
    #[allow(clippy::too_many_arguments)]
    #[inline]
    fn process(&mut self, x: f32, ch: usize, target: &[f32; G_BANDS], slew: f32, spill: f32, xo: [f32; 3], sr: f32) -> (f32, f32) {
        let c = ch.min(FX_CH - 1);
        let mut b = [0.0f32; G_BANDS];

        // Subtractive crossover: take the low band, and the remainder IS everything above it.
        // b0+b1+b2+b3 == x by construction, so switching the gate on with every step open is a
        // true bypass. Cascaded lowpass/highpass pairs are not complementary and cost about 5 dB
        // at the fundamental, which on a bass instrument is the whole instrument.
        let l0a = self.lp[c][0].process(x, xo[0], 0.2, sr, SvfMode::Low);
        b[0] = self.lp[c][1].process(l0a, xo[0], 0.2, sr, SvfMode::Low);
        let r0 = x - b[0];
        let l1a = self.bp1[c][0].process(r0, xo[1], 0.2, sr, SvfMode::Low);
        b[1] = self.bp1[c][1].process(l1a, xo[1], 0.2, sr, SvfMode::Low);
        let r1 = r0 - b[1];
        let l2a = self.bp2[c][0].process(r1, xo[2], 0.2, sr, SvfMode::Low);
        b[2] = self.bp2[c][1].process(l2a, xo[2], 0.2, sr, SvfMode::Low);
        b[3] = r1 - b[2];
        let _ = &self.hp;

        let mut out = 0.0;
        let mut sp = 0.0;
        for k in 0..G_BANDS {
            self.g[c][k] += (target[k] - self.g[c][k]) * slew;
            out += b[k] * self.g[c][k];
            sp += b[k] * (1.0 - self.g[c][k]) * spill;
        }
        (out, sp)
    }
}

// ── space ────────────────────────────────────────────────────────────────────

struct DelayLine {
    buf: Vec<f32>,
    w: usize,
}

impl DelayLine {
    fn new(len: usize) -> Self {
        DelayLine { buf: vec![0.0; len.max(4)], w: 0 }
    }
    #[inline]
    fn write(&mut self, x: f32) {
        let n = self.buf.len();
        self.buf[self.w] = x;
        self.w = (self.w + 1) % n;
    }
    /// Fractional read, `d` samples back. Linear interpolation is enough here — the tape echo's
    /// wow is the only thing that moves the tap fast, and it is meant to sound imperfect.
    #[inline]
    fn read(&self, d: f32) -> f32 {
        let n = self.buf.len();
        let d = d.clamp(1.0, (n - 2) as f32);
        let pos = self.w as f32 - d;
        let pos = if pos < 0.0 { pos + n as f32 } else { pos };
        let i = pos.floor() as usize % n;
        let f = pos - pos.floor();
        let a = self.buf[i];
        let b = self.buf[(i + 1) % n];
        a + (b - a) * f
    }
}

struct Space {
    ch_l: DelayLine,
    ch_r: DelayLine,
    ch_phase: f32,
    dl: [DelayLine; FX_CH],
    dl_fb: [f32; FX_CH],
    dl_tone: [Svf; FX_CH],
    ec: [DelayLine; FX_CH],
    ec_fb: [f32; FX_CH],
    ec_lp: [Svf; FX_CH],
    ec_hp: [Svf; FX_CH],
    ec_sat: [Shaper; FX_CH],
    wow_phase: f32,
    flutter_phase: f32,
}

impl Space {
    fn new(sr: f32) -> Self {
        let two_sec = (sr * 2.0) as usize;
        let one_sec = (sr * 1.05) as usize;
        let short = (sr * 0.06) as usize;
        Space {
            ch_l: DelayLine::new(short),
            ch_r: DelayLine::new(short),
            ch_phase: 0.0,
            dl: [DelayLine::new(two_sec), DelayLine::new(two_sec)],
            dl_fb: [0.0; FX_CH],
            dl_tone: [Svf::default(); FX_CH],
            ec: [DelayLine::new(one_sec), DelayLine::new(one_sec)],
            ec_fb: [0.0; FX_CH],
            ec_lp: [Svf::default(); FX_CH],
            ec_hp: [Svf::default(); FX_CH],
            ec_sat: [Shaper::default(); FX_CH],
            wow_phase: 0.0,
            flutter_phase: 0.0,
        }
    }
}

// ── the rack ─────────────────────────────────────────────────────────────────

pub struct BajoRack {
    wobble: Wobble,
    throat: Throat,
    scorch: Scorch,
    gate: GhostGate,
    space: Space,
    /// The Ghost Gate's spill send. Handed to the Veil so gated-out audio arrives as reverb
    /// only, never as dry signal.
    spill: Box<[[f32; MAX_BLOCK]; FX_CH]>,
    spill_hot: bool,
    mono_lp: [Svf; 2],
    sr: f32,
}

impl BajoRack {
    pub fn new(sr: f32) -> Self {
        BajoRack {
            wobble: Wobble::default(),
            throat: Throat::default(),
            scorch: Scorch::default(),
            gate: GhostGate::new(),
            space: Space::new(sr),
            spill: Box::new([[0.0; MAX_BLOCK]; FX_CH]),
            spill_hot: false,
            mono_lp: [Svf::default(); 2],
            sr,
        }
    }

    /// Resolve the wobble for this block. Called before the voices render so they can follow the
    /// same phase.
    pub fn wobble_frame(&mut self, p: &Params, beats: f64, frames: usize, bps: f32) -> WobbleFrame {
        self.wobble.frame(p, beats, frames, self.sr, bps)
    }

    /// True when any BAJO section would change the signal. Keeps ONDA, KERA and VELA on exactly
    /// the code path they had before this module existed.
    pub fn active(p: &Params) -> bool {
        p.get(THR_BASE + T_AMOUNT) > 0.0005
            || p.get(GATE_BASE + G_ENABLE) > 0.5
            || p.get(SPC_BASE + SP_CH_ON) > 0.5
            || p.get(SPC_BASE + SP_DL_ON) > 0.5
            || p.get(SPC_BASE + SP_EC_ON) > 0.5
            || p.get(P_MONO_BELOW) > 0.0005
            || ScorchCfg::resolve(p).any
    }

    pub fn spill_buffer(&self) -> Option<&[[f32; MAX_BLOCK]; FX_CH]> {
        if self.spill_hot { Some(&self.spill) } else { None }
    }

    /// The whole rack, in order. `beats` is the transport position at the first sample.
    #[allow(clippy::too_many_arguments)]
    pub fn process(
        &mut self,
        scratch: &mut [[f32; MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        nch: usize,
        p: &Params,
        wf: &WobbleFrame,
        beats: f64,
        bps: f32,
    ) {
        let sr = self.sr;

        // ── resolve everything once per block ────────────────────────────────
        let throat_amt = p.get(THR_BASE + T_AMOUNT);
        let throat_q = 0.55 + p.get(THR_BASE + T_Q) * 0.42;
        let vowel_base = p.get(THR_BASE + T_VOWEL);
        let vowel_depth = wf.depth_for(WOB_DEST_VOWEL);
        let amp_depth = wf.depth_for(WOB_DEST_AMP);
        let drive_depth = wf.depth_for(WOB_DEST_DRIVE);
        let pan_depth = wf.depth_for(WOB_DEST_PAN);

        let scfg = ScorchCfg::resolve(p);
        let scorch_on = scfg.any || drive_depth > 0.0005;

        let gate_on = p.get(GATE_BASE + G_ENABLE) > 0.5;
        let gate_depth = p.get(GATE_BASE + G_DEPTH);
        let gate_spill = p.get(GATE_BASE + G_SPILL) * 1.4;
        let slew = {
            // 0.8 ms to 55 ms per edge, as a one-pole coefficient.
            let ms = 0.8 + p.get(GATE_BASE + G_SLEW) * 54.2;
            (1.0 - (-1.0 / (ms * 0.001 * sr)).exp()).clamp(0.0005, 1.0)
        };
        let split = 0.5 * (2.0f32 / 0.5).powf(p.get(GATE_BASE + G_SPLIT).clamp(0.0, 1.0));
        let xo = [110.0 * split, 700.0 * split, 3200.0 * split];
        let gate_rate = GATE_DIVS[(p.get(GATE_BASE + G_RATE).round().max(0.0) as usize).min(2)];
        let swing = p.get(GATE_BASE + G_SWING);

        let mut gate_target = [1.0f32; G_BANDS];

        let ch_on = p.get(SPC_BASE + SP_CH_ON) > 0.5;
        let ch_rate = 0.05 + p.get(SPC_BASE + SP_CH_RATE) * 5.95;
        let ch_depth = p.get(SPC_BASE + SP_CH_DEPTH);
        let ch_mix = p.get(SPC_BASE + SP_CH_MIX);

        let dl_on = p.get(SPC_BASE + SP_DL_ON) > 0.5;
        let dl_div = DELAY_DIVS[(p.get(SPC_BASE + SP_DL_DIV).round().max(0.0) as usize).min(DELAY_DIVS.len() - 1)];
        let dl_time = (dl_div / bps.max(0.05)).clamp(0.01, 1.98);
        let dl_ping = p.get(SPC_BASE + SP_DL_PING) > 0.5;
        let dl_fb = p.get(SPC_BASE + SP_DL_FB).clamp(0.0, 0.92);
        let dl_tone_hz = 300.0 * (14000.0f32 / 300.0).powf(p.get(SPC_BASE + SP_DL_TONE).clamp(0.0, 1.0));
        let dl_mix = p.get(SPC_BASE + SP_DL_MIX);

        let ec_on = p.get(SPC_BASE + SP_EC_ON) > 0.5;
        let ec_time = 0.04 + p.get(SPC_BASE + SP_EC_TIME) * 0.86;
        let ec_fb = p.get(SPC_BASE + SP_EC_FB).clamp(0.0, 0.95);
        let ec_wow = p.get(SPC_BASE + SP_EC_WOW);
        let ec_drive = p.get(SPC_BASE + SP_EC_DRIVE);
        let ec_deg = p.get(SPC_BASE + SP_EC_DEGRADE);
        let ec_mix = p.get(SPC_BASE + SP_EC_MIX);

        let mono_below = p.get(P_MONO_BELOW);
        let mono_hz = if mono_below > 0.0005 { 20.0 + mono_below * 300.0 } else { 0.0 };

        self.spill_hot = gate_on && gate_spill > 0.0005;
        if self.spill_hot {
            for c in 0..FX_CH {
                self.spill[c][..frames].fill(0.0);
            }
        }

        let fx_ch = nch.min(FX_CH);

        for s in 0..frames {
            let wob = if wf.on { self.wobble.value(wf, s) } else { 0.0 };

            // The gate's own clock. Recomputed per sample so a tempo change lands immediately
            // and the swing offset does not need a second counter.
            if gate_on {
                let pos = beats + (s as f64) * (bps as f64) / (sr as f64);
                let cell_f = pos / gate_rate as f64;
                let mut cell = cell_f.floor() as i64;
                if swing > 0.0005 && cell.rem_euclid(2) == 1 {
                    // Push odd cells late by up to half a cell.
                    let frac = cell_f - cell_f.floor();
                    if frac < (swing * 0.5) as f64 {
                        cell -= 1;
                    }
                }
                let step = cell.rem_euclid(G_STEPS as i64) as usize;
                for b in 0..G_BANDS {
                    let on = p.get(GATE_BASE + G_GRID + (b * G_STEPS + step) as u32) > 0.5;
                    gate_target[b] = if on { 1.0 } else { 1.0 - gate_depth };
                }
            } else {
                gate_target = [1.0; G_BANDS];
            }

            let vowel = (vowel_base + wob * vowel_depth * 0.5).clamp(0.0, 1.0);
            let formants = if throat_amt > 0.0005 { Throat::formants(vowel) } else { [0.0; 3] };
            let drive_mod = wob * drive_depth * 0.5;
            // Amp: dips from unity down to (1 - depth), never above, so the wobble ducks rather
            // than boosting into the limiter.
            let amp = 1.0 - amp_depth * 0.5 + wob * amp_depth * 0.5;

            for c in 0..fx_ch {
                let mut x = scratch[c][s];

                if throat_amt > 0.0005 {
                    x = self.throat.process(x, c, &formants, throat_q, throat_amt, sr);
                }
                if amp_depth > 0.0005 {
                    x *= amp;
                }
                if pan_depth > 0.0005 && fx_ch == 2 {
                    // Constant-power-ish: one channel up as the other comes down.
                    let pan = wob * pan_depth;
                    x *= if c == 0 { (1.0 - pan).clamp(0.0, 2.0) } else { (1.0 + pan).clamp(0.0, 2.0) };
                }
                if scorch_on {
                    x = self.scorch.process(x, c, &scfg, drive_mod, sr);
                }
                if gate_on {
                    let (g, sp) = self.gate.process(x, c, &gate_target, slew, gate_spill, xo, sr);
                    x = g;
                    if self.spill_hot {
                        self.spill[c][s] = sp;
                    }
                }
                scratch[c][s] = x;
            }

            // ── Space. Stereo only; see FX_CH. ──────────────────────────────
            if fx_ch == 2 {
                if ch_on && ch_mix > 0.0005 {
                    self.space.ch_phase += ch_rate / sr;
                    if self.space.ch_phase >= 1.0 {
                        self.space.ch_phase -= 1.0;
                    }
                    let t = self.space.ch_phase * core::f32::consts::TAU;
                    let dl = (0.011 + t.sin() * 0.004 * ch_depth) * sr;
                    let dr = (0.019 + (t * 0.78 + 1.6).sin() * 0.0045 * ch_depth) * sr;
                    self.space.ch_l.write(scratch[0][s]);
                    self.space.ch_r.write(scratch[1][s]);
                    let wl = self.space.ch_l.read(dl);
                    let wr = self.space.ch_r.read(dr);
                    scratch[0][s] += wl * ch_mix;
                    scratch[1][s] += wr * ch_mix;
                }

                if dl_on && dl_mix > 0.0005 {
                    let d = dl_time * sr * if dl_ping { 0.5 } else { 1.0 };
                    let rl = self.space.dl[0].read(d);
                    let rr = self.space.dl[1].read(d);
                    // Ping-pong: each side feeds the other, so repeats alternate across the field.
                    let (fl, fr) = if dl_ping { (rr, rl) } else { (rl, rr) };
                    let tl = self.space.dl_tone[0].process(fl, dl_tone_hz, 0.2, sr, SvfMode::Low);
                    let tr = self.space.dl_tone[1].process(fr, dl_tone_hz, 0.2, sr, SvfMode::Low);
                    self.space.dl[0].write(scratch[0][s] + tl * dl_fb);
                    self.space.dl[1].write(scratch[1][s] + tr * dl_fb);
                    scratch[0][s] += rl * dl_mix;
                    scratch[1][s] += rr * dl_mix;
                }

                if ec_on && ec_mix > 0.0005 {
                    // Wow and flutter: two slow tap modulations, which is the whole reason a tape
                    // echo does not sound like a digital one.
                    self.space.wow_phase += 0.7 / sr;
                    self.space.flutter_phase += 6.3 / sr;
                    if self.space.wow_phase >= 1.0 { self.space.wow_phase -= 1.0; }
                    if self.space.flutter_phase >= 1.0 { self.space.flutter_phase -= 1.0; }
                    let wob_t = (self.space.wow_phase * core::f32::consts::TAU).sin() * 0.0022 * ec_wow
                        + (self.space.flutter_phase * core::f32::consts::TAU).sin() * 0.0005 * ec_wow;
                    let d = ((ec_time + wob_t) * sr).max(2.0);
                    let lp_hz = 9000.0 - ec_deg * 7200.0;
                    let hp_hz = 90.0 + ec_deg * 320.0;
                    for c in 0..2 {
                        let r = self.space.ec[c].read(d);
                        let sat = self.space.ec_sat[c].process_with(r, |v| tanh_fast(v * (1.0 + ec_drive * 6.0)));
                        let lo = self.space.ec_lp[c].process(sat, lp_hz, 0.2, sr, SvfMode::Low);
                        let band = self.space.ec_hp[c].process(lo, hp_hz, 0.2, sr, SvfMode::High);
                        self.space.ec_fb[c] = band;
                        self.space.ec[c].write(scratch[c][s] + band * ec_fb);
                        scratch[c][s] += r * ec_mix;
                    }
                }

                // Mono fold. A bass instrument that images its sub is a bass instrument that
                // disappears the moment anyone sums to mono.
                if mono_hz > 0.0 {
                    let l = scratch[0][s];
                    let r = scratch[1][s];
                    let ll = self.mono_lp[0].process(l, mono_hz, 0.2, sr, SvfMode::Low);
                    let lr = self.mono_lp[1].process(r, mono_hz, 0.2, sr, SvfMode::Low);
                    let m = (ll + lr) * 0.5;
                    scratch[0][s] = (l - ll) + m;
                    scratch[1][s] = (r - lr) + m;
                }
            }
        }
    }
}
