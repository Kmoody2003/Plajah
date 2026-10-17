//! AURA — 1960s & 1970s voltage-controlled analogue rack.
//!
//! Runs after the voice sum in `Engine::render` (alongside BAJO's rack and before the Veil):
//! 1. **3-Phase BBD String Ensemble / Chorus** — modeled on the 1974 ARP Solina String Ensemble
//!    (three 120°-spaced bucket-brigade delay lines driven by summed slow chorus + fast vibrato
//!    oscillators) and classic late-'70s stereo BBD choruses (Juno I / II).
//! 2. **6-Stage Vintage All-Pass Phaser** — TPT all-pass cascade with soft-clipped feedback loop,
//!    voiced after the 1970s Small Stone / Schulte Compact Phasing 'A' units heard on Krautrock
//!    and French cosmic synth records.
//! 3. **Master 15 IPS Magnetic Tape & Mains Floor** — low-frequency tape head bump (~72 Hz),
//!    transformer/oxide saturation, 60 Hz / 180 Hz power-supply hum, and subtle oxide dust crackle.

use core::f32::consts::TAU;
use crate::engine::MAX_BLOCK;
use crate::filter::{tanh_fast, Svf, SvfMode};
use crate::osc::Rng;
use crate::params::*;
use crate::spatial::MAX_CHANNELS;

const FX_CH: usize = 2;

struct DelayLine {
    buf: Vec<f32>,
    w: usize,
}

impl DelayLine {
    fn new(len: usize) -> Self {
        DelayLine { buf: vec![0.0; len.max(8)], w: 0 }
    }

    #[inline]
    fn write(&mut self, x: f32) {
        let n = self.buf.len();
        self.buf[self.w] = x;
        self.w = (self.w + 1) % n;
    }

    #[inline]
    fn read(&self, delay_samples: f32) -> f32 {
        let n = self.buf.len();
        let d = delay_samples.clamp(1.0, (n - 2) as f32);
        let pos = self.w as f32 - d;
        let pos = if pos < 0.0 { pos + n as f32 } else { pos };
        let i = pos.floor() as usize % n;
        let f = pos - pos.floor();
        let a = self.buf[i];
        let b = self.buf[(i + 1) % n];
        a + (b - a) * f
    }
}

/// 3-Phase Bucket-Brigade Device (BBD) Ensemble & Chorus.
struct BbdEnsemble {
    dl_l: DelayLine,
    dl_r: DelayLine,
    slow_phase: f32,
    fast_phase: f32,
    bbd_lp: [f32; FX_CH],
}

impl BbdEnsemble {
    fn new(sr: f32) -> Self {
        let cap = (sr * 0.055) as usize;
        Self {
            dl_l: DelayLine::new(cap),
            dl_r: DelayLine::new(cap),
            slow_phase: 0.0,
            fast_phase: 0.25,
            bbd_lp: [0.0; FX_CH],
        }
    }

    #[inline]
    fn process(&mut self, l: f32, r: f32, mode: u32, depth: f32, mix: f32, sr: f32) -> (f32, f32) {
        self.dl_l.write(l);
        self.dl_r.write(r);

        let (slow_hz, fast_hz) = match mode {
            1 => (0.52, 1.8), // Juno I: gentle slow stereo BBD
            2 => (0.84, 3.6), // Juno II / Symphonic: deeper, faster stereo BBD
            _ => (0.62, 5.8), // Solina 3-phase String Ensemble: classic 0.6 Hz + 5.8 Hz
        };

        self.slow_phase += slow_hz / sr;
        if self.slow_phase >= 1.0 {
            self.slow_phase -= 1.0;
        }
        self.fast_phase += fast_hz / sr;
        if self.fast_phase >= 1.0 {
            self.fast_phase -= 1.0;
        }

        let d = depth.clamp(0.0, 1.0);
        let (wet_l, wet_r) = if mode == 1 || mode == 2 {
            // Stereo BBD Chorus (Juno I / II style)
            let p_s = self.slow_phase * TAU;
            let p_f = self.fast_phase * TAU;
            let shimmer = if mode == 2 { 0.0009 * d } else { 0.00025 * d };
            let span = if mode == 2 { 0.0038 * d } else { 0.0026 * d };
            let tap_l = (0.0075 + p_s.sin() * span + p_f.sin() * shimmer) * sr;
            let tap_r = (0.0082 - p_s.sin() * span + (p_f + 1.57).sin() * shimmer) * sr;
            (self.dl_l.read(tap_l), self.dl_r.read(tap_r))
        } else {
            // Solina 3-Phase String Ensemble: 3 BBD lines at 0°, 120°, 240°
            let p0 = self.slow_phase * TAU;
            let p1 = p0 + TAU / 3.0;
            let p2 = p0 + 2.0 * TAU / 3.0;
            let f0 = self.fast_phase * TAU;
            let f1 = f0 + TAU / 3.0;
            let f2 = f0 + 2.0 * TAU / 3.0;

            let base = 0.0085;
            let slow_mod = 0.0028 * d;
            let fast_mod = 0.00085 * d;

            let t0 = (base + p0.sin() * slow_mod + f0.sin() * fast_mod) * sr;
            let t1 = (base + p1.sin() * slow_mod + f1.sin() * fast_mod) * sr;
            let t2 = (base + p2.sin() * slow_mod + f2.sin() * fast_mod) * sr;

            let a = self.dl_l.read(t0);
            let b = (self.dl_l.read(t1) + self.dl_r.read(t1)) * 0.5;
            let c = self.dl_r.read(t2);

            ((a + 0.65 * b - 0.35 * c) * 0.78, (c + 0.65 * b - 0.35 * a) * 0.78)
        };

        // BBD clock reconstruction low-pass (~8.5 kHz) — melts away digital harshness.
        let k_lp = (1.0 - (-TAU * 8500.0 / sr).exp()).clamp(0.05, 0.95);
        self.bbd_lp[0] += (wet_l - self.bbd_lp[0]) * k_lp;
        self.bbd_lp[1] += (wet_r - self.bbd_lp[1]) * k_lp;

        let m = mix.clamp(0.0, 1.0);
        let dry = 1.0 - m * 0.35;
        (l * dry + self.bbd_lp[0] * m, r * dry + self.bbd_lp[1] * m)
    }
}

/// 6-Stage TPT All-Pass Phaser (1970s Small Stone / Schulte Compact Phasing 'A').
#[derive(Default)]
struct VintagePhaser {
    state: [[f32; 6]; FX_CH],
    fb_state: [f32; FX_CH],
    phase: f32,
}

impl VintagePhaser {
    #[inline]
    fn process_ch(&mut self, x: f32, ch: usize, big_g: f32, fb: f32) -> f32 {
        let mut sig = tanh_fast(x + self.fb_state[ch] * fb);
        for st in 0..6 {
            let s = self.state[ch][st];
            let v = (sig - s) * big_g;
            let lp = v + s;
            self.state[ch][st] = lp + v;
            // First-order all-pass from TPT low-pass: AP(x) = 2*LP(x) - x
            sig = 2.0 * lp - sig;
        }
        if !sig.is_finite() {
            self.state[ch] = [0.0; 6];
            self.fb_state[ch] = 0.0;
            return x;
        }
        self.fb_state[ch] = sig;
        sig
    }
}

pub struct AuraRack {
    ensemble: BbdEnsemble,
    phaser: VintagePhaser,
    head_bump: [Svf; FX_CH],
    tape_lp: [f32; FX_CH],
    gate_lp: [f32; FX_CH],
    gate_env: f32,
    last_gate_step: i64,
    gate_rand_amp: f32,
    gate_rand_pan: f32,
    hum_phase: f32,
    crackle_lp: [f32; FX_CH],
    rng: Rng,
    sr: f32,
}

const AURA_GATE_BEATS: [f32; 5] = [1.0, 0.5, 0.333_333_34, 0.25, 0.166_666_67];

impl AuraRack {
    pub fn new(sr: f32) -> Self {
        Self {
            ensemble: BbdEnsemble::new(sr),
            phaser: VintagePhaser::default(),
            head_bump: [Svf::default(); FX_CH],
            tape_lp: [0.0; FX_CH],
            gate_lp: [0.0; FX_CH],
            gate_env: 1.0,
            last_gate_step: -1,
            gate_rand_amp: 0.85,
            gate_rand_pan: 0.0,
            hum_phase: 0.0,
            crackle_lp: [0.0; FX_CH],
            rng: Rng(0x7060_1974),
            sr,
        }
    }

    /// True only when at least one AURA rack stage is engaged.
    #[inline]
    pub fn active(p: &Params) -> bool {
        (p.get(AURA_BASE + A_GATE_ON) > 0.5 && p.get(AURA_BASE + A_GATE_DEPTH) > 0.0005)
            || (p.get(AURA_BASE + A_ENS_ON) > 0.5 && p.get(AURA_BASE + A_ENS_MIX) > 0.0005)
            || (p.get(AURA_BASE + A_PH_ON) > 0.5 && p.get(AURA_BASE + A_PH_MIX) > 0.0005)
            || p.get(AURA_BASE + A_TAPE_SAT) > 0.0005
            || p.get(AURA_BASE + A_HUM) > 0.0005
            || p.get(AURA_BASE + A_CRACKLE) > 0.0005
    }

    #[allow(clippy::too_many_arguments)]
    pub fn process(
        &mut self,
        scratch: &mut [[f32; MAX_BLOCK]; MAX_CHANNELS],
        frames: usize,
        nch: usize,
        p: &Params,
        active_voices: u32,
        beats: f64,
        bps: f32,
    ) {
        let sr = self.sr;
        let fx_ch = nch.min(FX_CH);
        if fx_ch == 0 {
            return;
        }

        let gate_on = p.get(AURA_BASE + A_GATE_ON) > 0.5;
        let gate_rate_idx = (p.get(AURA_BASE + A_GATE_RATE).round().max(0.0) as usize).min(4);
        let gate_beats = AURA_GATE_BEATS[gate_rate_idx].max(0.05) as f64;
        let gate_depth = p.get(AURA_BASE + A_GATE_DEPTH).clamp(0.0, 1.0);
        let gate_shape = p.get(AURA_BASE + A_GATE_SHAPE).round().max(0.0) as u32;
        let k_gate_atk = (1.0 - (-1.0 / (0.0022 * sr)).exp()).clamp(0.005, 0.95);
        let k_gate_rel = (1.0 - (-1.0 / (0.0085 * sr)).exp()).clamp(0.002, 0.95);

        let ens_on = p.get(AURA_BASE + A_ENS_ON) > 0.5;
        let ens_mode = p.get(AURA_BASE + A_ENS_MODE).round().max(0.0) as u32;
        let ens_depth = p.get(AURA_BASE + A_ENS_DEPTH).clamp(0.0, 1.0);
        let ens_mix = p.get(AURA_BASE + A_ENS_MIX).clamp(0.0, 1.0);

        let ph_on = p.get(AURA_BASE + A_PH_ON) > 0.5;
        // 0.04 Hz .. 4.5 Hz exponential sweep rate
        let ph_rate = 0.04 * (112.5f32).powf(p.get(AURA_BASE + A_PH_RATE).clamp(0.0, 1.0));
        let ph_depth = p.get(AURA_BASE + A_PH_DEPTH).clamp(0.0, 1.0);
        let ph_fb = (p.get(AURA_BASE + A_PH_FEEDBACK).clamp(0.0, 1.0)) * 0.82;
        let ph_mix = p.get(AURA_BASE + A_PH_MIX).clamp(0.0, 1.0);

        let tape_sat = p.get(AURA_BASE + A_TAPE_SAT).clamp(0.0, 1.0);
        let hum_amt = p.get(AURA_BASE + A_HUM).clamp(0.0, 1.0);
        let crackle_amt = p.get(AURA_BASE + A_CRACKLE).clamp(0.0, 1.0);

        // Tape HF roll-off coefficient: 18 kHz clean down to ~7.5 kHz under heavy tape saturation
        let tape_fc = 18000.0 - tape_sat * 10500.0;
        let k_tape_lp = (1.0 - (-TAU * tape_fc / sr).exp()).clamp(0.05, 0.99);

        // Scale mains hum and crackle so they bloom when voices are active and stay whisper-quiet at rest
        let activity_gate = if active_voices > 0 { 1.0 } else { 0.15 };

        for s in 0..frames {
            let mut l = scratch[0][s];
            let mut r = if fx_ch > 1 { scratch[1][s] } else { l };

            // 0. Rhythmic Analog VCA / Lowpass Gate Chopper
            if gate_on && gate_depth > 0.0005 {
                let pos_beats = beats + (s as f64) * (bps.max(0.2) as f64) / (sr as f64);
                let cell_f = pos_beats / gate_beats;
                let cell_idx = cell_f.floor() as i64;
                let phase_in_step = (cell_f - cell_f.floor()) as f32;
                if cell_idx != self.last_gate_step {
                    self.last_gate_step = cell_idx;
                    self.gate_rand_amp = self.rng.next_f32();
                    self.gate_rand_pan = self.rng.bipolar();
                }

                let floor = 1.0 - gate_depth;
                let target = match gate_shape {
                    0 => {
                        // Pulse Chopper: crisp 55% duty cycle with musical 4-step accent
                        let accent = if cell_idx.rem_euclid(4) == 0 { 1.0 } else { 0.88 };
                        if phase_in_step < 0.55 {
                            floor + (accent - floor) * gate_depth + (1.0 - gate_depth) * (1.0 - accent)
                        } else {
                            floor
                        }
                    }
                    1 => {
                        // Sawtooth Ramp: exponential vactrol decay per subdivision
                        let env = (1.0 - phase_in_step).powi(2);
                        floor + env * gate_depth
                    }
                    _ => {
                        // Probabilistic / Random Gate: varies step duty, accent, and occasional skips
                        let duty = 0.22 + self.gate_rand_amp * 0.56;
                        if self.gate_rand_amp < 0.18 || phase_in_step >= duty {
                            floor
                        } else {
                            let step_lvl = 0.55 + 0.45 * self.gate_rand_amp;
                            floor + step_lvl * gate_depth
                        }
                    }
                };

                let k_slew = if target > self.gate_env { k_gate_atk } else { k_gate_rel };
                self.gate_env += (target - self.gate_env) * k_slew;

                // Vactrol Lowpass Gate (LPG) coupling: closed gate darkens HF, open gate lets harmonics ring
                let lpg_fc = 420.0 + self.gate_env * self.gate_env * 16500.0;
                let k_lpg = (1.0 - (-TAU * lpg_fc.min(sr * 0.45) / sr).exp()).clamp(0.03, 0.99);
                self.gate_lp[0] += (l - self.gate_lp[0]) * k_lpg;
                self.gate_lp[1] += (r - self.gate_lp[1]) * k_lpg;

                let pan_mod = if gate_shape >= 2 { self.gate_rand_pan * 0.28 * gate_depth } else { 0.0 };
                l = self.gate_lp[0] * self.gate_env * (1.0 - pan_mod).clamp(0.2, 1.4);
                r = self.gate_lp[1] * self.gate_env * (1.0 + pan_mod).clamp(0.2, 1.4);
            }

            // 1. 6-Stage Vintage Analog Phaser
            if ph_on && ph_mix > 0.0005 {
                self.phaser.phase += ph_rate / sr;
                if self.phaser.phase >= 1.0 {
                    self.phaser.phase -= 1.0;
                }
                let lfo_l = (self.phaser.phase * TAU).sin() * 0.5 + 0.5;
                let lfo_r = ((self.phaser.phase + 0.2) * TAU).sin() * 0.5 + 0.5;
                let fc_l = 160.0 * (18.0f32).powf(0.15 + lfo_l * ph_depth * 0.85);
                let fc_r = 160.0 * (18.0f32).powf(0.15 + lfo_r * ph_depth * 0.85);
                let g_l = (core::f32::consts::PI * fc_l.min(sr * 0.42) / sr).tan();
                let g_r = (core::f32::consts::PI * fc_r.min(sr * 0.42) / sr).tan();
                let big_g_l = g_l / (1.0 + g_l);
                let big_g_r = g_r / (1.0 + g_r);

                let wl = self.phaser.process_ch(l, 0, big_g_l, ph_fb);
                let wr = self.phaser.process_ch(r, 1, big_g_r, ph_fb);
                l = l * (1.0 - ph_mix * 0.45) + wl * (ph_mix * 0.7);
                r = r * (1.0 - ph_mix * 0.45) + wr * (ph_mix * 0.7);
            }

            // 2. 3-Phase BBD String Ensemble / Chorus
            if ens_on && ens_mix > 0.0005 {
                let (el, er) = self.ensemble.process(l, r, ens_mode, ens_depth, ens_mix, sr);
                l = el;
                r = er;
            }

            // 3. 15 IPS Magnetic Tape Saturation + 72 Hz Head Bump
            if tape_sat > 0.0005 {
                let bump_l = self.head_bump[0].process(l, 72.0, 0.35, sr, SvfMode::Band);
                let bump_r = self.head_bump[1].process(r, 72.0, 0.35, sr, SvfMode::Band);
                let drv = 1.0 + tape_sat * 2.6;
                let asym = 0.08 * tape_sat;
                let sat_l = (tanh_fast((l + bump_l * tape_sat * 0.45 + asym) * drv) - tanh_fast(asym * drv))
                    * (1.0 / (1.0 + tape_sat * 0.55));
                let sat_r = (tanh_fast((r + bump_r * tape_sat * 0.45 + asym) * drv) - tanh_fast(asym * drv))
                    * (1.0 / (1.0 + tape_sat * 0.55));
                self.tape_lp[0] += (sat_l - self.tape_lp[0]) * k_tape_lp;
                self.tape_lp[1] += (sat_r - self.tape_lp[1]) * k_tape_lp;
                l = l * (1.0 - tape_sat) + self.tape_lp[0] * tape_sat;
                r = r * (1.0 - tape_sat) + self.tape_lp[1] * tape_sat;
            }

            // 4. 60 Hz / 180 Hz Mains Transformer Hum & Analog Noise Floor
            if hum_amt > 0.0005 {
                self.hum_phase += 60.0 / sr;
                if self.hum_phase >= 1.0 {
                    self.hum_phase -= 1.0;
                }
                let hp = self.hum_phase * TAU;
                let mains = hp.sin() * 0.65 + (hp * 2.0).sin() * 0.2 + (hp * 3.0).sin() * 0.35;
                let hiss = self.rng.bipolar() * 0.18;
                let floor = (mains * 0.0035 + hiss * 0.0022) * hum_amt * activity_gate;
                l += floor;
                r += floor * 0.94;
            }

            // 5. Oxide / Vinyl Dust & Capacitor Crackle
            if crackle_amt > 0.0005 {
                let rv = self.rng.next_f32();
                let thresh = 1.0 - crackle_amt * 0.0035 * activity_gate;
                let pop = if rv > thresh { self.rng.bipolar() * crackle_amt * 0.035 } else { 0.0 };
                self.crackle_lp[0] = self.crackle_lp[0] * 0.82 + pop * 0.18;
                self.crackle_lp[1] = self.crackle_lp[1] * 0.82 + pop * 0.16;
                l += self.crackle_lp[0];
                r += self.crackle_lp[1];
            }

            scratch[0][s] = l;
            if fx_ch > 1 {
                scratch[1][s] = r;
            }
        }
    }
}
