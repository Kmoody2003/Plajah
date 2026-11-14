//! AURA — 1960s & 1970s voltage-controlled analogue rack.
//!
//! Runs after the voice sum in `Engine::render` (alongside BAJO's rack and before the Veil):
//! 1. **3-Phase MN3009 BBD String Ensemble / Chorus** — 4-point Hermite delay interpolation with
//!    clock-modulated bucket-brigade dynamic HF roll-off ($f_c(t) \propto f_{\text{clk}}(t)$),
//!    modeled on the 1974 ARP Solina String Ensemble and Roland Juno-60 stereo BBD chorus.
//! 2. **6-Stage Vintage All-Pass Phaser** — TPT all-pass cascade with soft-clipped feedback loop,
//!    voiced after the 1970s Small Stone / Schulte Compact Phasing 'A' units.
//! 3. **Master 15 IPS Magnetic Tape Hysteresis & Mains Floor** — low-frequency tape head bump
//!    (~72 Hz), stateful magnetic remnant-flux hysteresis, 60/180 Hz transformer hum, and oxide dust.

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
        DelayLine { buf: vec![0.0; len.max(16)], w: 0 }
    }

    #[inline]
    fn write(&mut self, x: f32) {
        let n = self.buf.len();
        self.buf[self.w] = x;
        self.w = (self.w + 1) % n;
    }

    /// 4-point Catmull-Rom / cubic Hermite fractional read so modulated BBD taps preserve upper
    /// sheen uniformly across fractional sample positions instead of breathing in HF.
    #[inline]
    fn read(&self, delay_samples: f32) -> f32 {
        let n = self.buf.len();
        let d = delay_samples.clamp(2.0, (n - 4) as f32);
        let pos = self.w as f32 - d;
        let pos = if pos < 0.0 { pos + n as f32 } else { pos };
        let i1 = pos.floor() as usize % n;
        let f = pos - pos.floor();
        let i0 = (i1 + n - 1) % n;
        let i2 = (i1 + 1) % n;
        let i3 = (i1 + 2) % n;
        let y0 = self.buf[i0];
        let y1 = self.buf[i1];
        let y2 = self.buf[i2];
        let y3 = self.buf[i3];
        let c0 = y1;
        let c1 = 0.5 * (y2 - y0);
        let c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
        let c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
        ((c3 * f + c2) * f + c1) * f + c0
    }
}

/// 3-Phase MN3009 Bucket-Brigade Device (BBD) Ensemble & Chorus.
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

    fn clear(&mut self) {
        self.dl_l.buf.fill(0.0);
        self.dl_l.w = 0;
        self.dl_r.buf.fill(0.0);
        self.dl_r.w = 0;
        self.bbd_lp = [0.0; FX_CH];
    }

    #[inline]
    fn process(&mut self, l: f32, r: f32, mode: u32, depth: f32, mix: f32, sr: f32) -> (f32, f32) {
        // Subtle BBD compander / bucket-charge nonlinearity on write
        let in_l = tanh_fast(l * 0.92) * 1.086_956_5;
        let in_r = tanh_fast(r * 0.92) * 1.086_956_5;
        self.dl_l.write(in_l);
        self.dl_r.write(in_r);

        let (slow_hz, fast_hz) = match mode {
            1 => (0.50, 1.65), // Juno I: syrupy slow stereo MN3009
            2 => (0.88, 3.90), // Juno II / Symphonic: animated dual-rate shimmer
            _ => (0.64, 5.85), // Solina 3-phase String Ensemble: classic 0.64 Hz + 5.85 Hz
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
        let (wet_l, wet_r, delay_s_l, delay_s_r) = if mode == 1 || mode == 2 {
            let p_s = self.slow_phase * TAU;
            let p_f = self.fast_phase * TAU;
            let shimmer = if mode == 2 { 0.0009 * d } else { 0.00025 * d };
            let span = if mode == 2 { 0.0038 * d } else { 0.0026 * d };
            let dl_s = (0.0075 + p_s.sin() * span + p_f.sin() * shimmer).max(0.0018);
            let dr_s = (0.0082 - p_s.sin() * span + (p_f + 1.57).sin() * shimmer).max(0.0018);
            (self.dl_l.read(dl_s * sr), self.dl_r.read(dr_s * sr), dl_s, dr_s)
        } else {
            // Solina 3-Phase MN3009 (256 stages per line): 0°, 120°, 240°
            let p0 = self.slow_phase * TAU;
            let p1 = p0 + TAU / 3.0;
            let p2 = p0 + 2.0 * TAU / 3.0;
            let f0 = self.fast_phase * TAU;
            let f1 = f0 + TAU / 3.0;
            let f2 = f0 + 2.0 * TAU / 3.0;

            let base = 0.0085;
            let slow_mod = 0.0028 * d;
            let fast_mod = 0.00085 * d;

            let d0 = (base + p0.sin() * slow_mod + f0.sin() * fast_mod).max(0.002);
            let d1 = (base + p1.sin() * slow_mod + f1.sin() * fast_mod).max(0.002);
            let d2 = (base + p2.sin() * slow_mod + f2.sin() * fast_mod).max(0.002);

            let a = self.dl_l.read(d0 * sr);
            let b = (self.dl_l.read(d1 * sr) + self.dl_r.read(d1 * sr)) * 0.5;
            let c = self.dl_r.read(d2 * sr);

            ((a + 0.65 * b - 0.35 * c) * 0.78, (c + 0.65 * b - 0.35 * a) * 0.78, d0, d2)
        };

        // MN3009 clock-dependent reconstruction low-pass: f_clk = N_stages / (2 * delay_s),
        // anti-imaging corner tracks ~0.32 * f_clk (~6.5 kHz .. 12.5 kHz) in real time!
        let fc_l = (256.0 / (2.0 * delay_s_l) * 0.56).clamp(5200.0, 12800.0);
        let fc_r = (256.0 / (2.0 * delay_s_r) * 0.56).clamp(5200.0, 12800.0);
        let k_lp_l = (1.0 - (-TAU * fc_l / sr).exp()).clamp(0.05, 0.95);
        let k_lp_r = (1.0 - (-TAU * fc_r / sr).exp()).clamp(0.05, 0.95);
        self.bbd_lp[0] += (wet_l - self.bbd_lp[0]) * k_lp_l;
        self.bbd_lp[1] += (wet_r - self.bbd_lp[1]) * k_lp_r;

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
    fn clear(&mut self) {
        self.state = [[0.0; 6]; FX_CH];
        self.fb_state = [0.0; FX_CH];
    }

    #[inline]
    fn process_ch(&mut self, x: f32, ch: usize, big_g: f32, fb: f32) -> f32 {
        let mut sig = tanh_fast(x + self.fb_state[ch] * fb);
        for st in 0..6 {
            let s = self.state[ch][st];
            let v = (sig - s) * big_g;
            let lp = v + s;
            self.state[ch][st] = lp + v;
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
    tape_mag: [f32; FX_CH],
    gate_lp: [f32; FX_CH],
    gate_env: f32,
    last_gate_step: i64,
    gate_rand_amp: f32,
    gate_rand_pan: f32,
    hum_phase: f32,
    crackle_lp: [f32; FX_CH],
    noise_env: f32,
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
            tape_mag: [0.0; FX_CH],
            gate_lp: [0.0; FX_CH],
            gate_env: 1.0,
            last_gate_step: -1,
            gate_rand_amp: 0.85,
            gate_rand_pan: 0.0,
            hum_phase: 0.0,
            crackle_lp: [0.0; FX_CH],
            noise_env: 0.0,
            rng: Rng(0x7060_1974),
            sr,
        }
    }

    pub fn clear(&mut self) {
        self.ensemble.clear();
        self.phaser.clear();
        self.head_bump = [Svf::default(); FX_CH];
        self.tape_lp = [0.0; FX_CH];
        self.tape_mag = [0.0; FX_CH];
        self.gate_lp = [0.0; FX_CH];
        self.gate_env = 1.0;
        self.last_gate_step = -1;
        self.crackle_lp = [0.0; FX_CH];
        self.noise_env = 0.0;
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
        let ph_rate = 0.04 * (112.5f32).powf(p.get(AURA_BASE + A_PH_RATE).clamp(0.0, 1.0));
        let ph_depth = p.get(AURA_BASE + A_PH_DEPTH).clamp(0.0, 1.0);
        let ph_fb = (p.get(AURA_BASE + A_PH_FEEDBACK).clamp(0.0, 1.0)) * 0.82;
        let ph_mix = p.get(AURA_BASE + A_PH_MIX).clamp(0.0, 1.0);

        let tape_sat = p.get(AURA_BASE + A_TAPE_SAT).clamp(0.0, 1.0);
        let hum_amt = p.get(AURA_BASE + A_HUM).clamp(0.0, 1.0);
        let crackle_amt = p.get(AURA_BASE + A_CRACKLE).clamp(0.0, 1.0);

        let tape_fc = 18000.0 - tape_sat * 10200.0;
        let k_tape_lp = (1.0 - (-TAU * tape_fc / sr).exp()).clamp(0.05, 0.99);

        let k_noise_atk = (1.0 - (-1.0 / (0.008 * sr)).exp()).clamp(0.001, 0.5);
        let k_noise_rel = (1.0 - (-1.0 / (0.08 * sr)).exp()).clamp(0.0001, 0.1);

        for s in 0..frames {
            let mut l = scratch[0][s];
            let mut r = if fx_ch > 1 { scratch[1][s] } else { l };
            let sig_hot = active_voices > 0 || l.abs() > 2e-4 || r.abs() > 2e-4;
            let noise_target = if sig_hot { 1.0 } else { 0.0 };
            let k_n = if noise_target > self.noise_env { k_noise_atk } else { k_noise_rel };
            self.noise_env += (noise_target - self.noise_env) * k_n;
            if self.noise_env < 1e-5 && noise_target == 0.0 {
                self.noise_env = 0.0;
            }
            let activity_gate = self.noise_env;

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
                        let accent = if cell_idx.rem_euclid(4) == 0 { 1.0 } else { 0.88 };
                        if phase_in_step < 0.55 {
                            floor + (accent - floor) * gate_depth + (1.0 - gate_depth) * (1.0 - accent)
                        } else {
                            floor
                        }
                    }
                    1 => {
                        let env = (1.0 - phase_in_step).powi(2);
                        floor + env * gate_depth
                    }
                    _ => {
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
                let spread = 0.16 + 0.18 * ph_depth;
                let lfo_l = (self.phaser.phase * TAU).sin() * 0.5 + 0.5;
                let lfo_r = ((self.phaser.phase + spread) * TAU).sin() * 0.5 + 0.5;
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

            // 2. 3-Phase MN3009 BBD String Ensemble / Chorus
            if ens_on && ens_mix > 0.0005 {
                let (el, er) = self.ensemble.process(l, r, ens_mode, ens_depth, ens_mix, sr);
                l = el;
                r = er;
            }

            // 3. 15 IPS Magnetic Tape Hysteresis + 72 Hz Head Bump
            if tape_sat > 0.0005 {
                let bump_l = self.head_bump[0].process(l, 72.0, 0.35, sr, SvfMode::Band);
                let bump_r = self.head_bump[1].process(r, 72.0, 0.35, sr, SvfMode::Band);
                let drv = 1.0 + tape_sat * 2.5;
                let asym = 0.065 * tape_sat;
                let hyst_fb = 0.16 * tape_sat; // Remnant oxide magnetization coercivity memory
                let hl = l + bump_l * tape_sat * 0.45 + self.tape_mag[0] * hyst_fb + asym;
                let hr = r + bump_r * tape_sat * 0.45 + self.tape_mag[1] * hyst_fb + asym;
                let ml = tanh_fast(hl * drv) - tanh_fast(asym * drv);
                let mr = tanh_fast(hr * drv) - tanh_fast(asym * drv);
                self.tape_mag[0] = if ml.is_finite() { ml * 0.995 } else { 0.0 };
                self.tape_mag[1] = if mr.is_finite() { mr * 0.995 } else { 0.0 };
                let norm = 1.0 / (1.0 + tape_sat * 0.62);
                self.tape_lp[0] += (ml * norm - self.tape_lp[0]) * k_tape_lp;
                self.tape_lp[1] += (mr * norm - self.tape_lp[1]) * k_tape_lp;
                l = l * (1.0 - tape_sat) + self.tape_lp[0] * tape_sat;
                r = r * (1.0 - tape_sat) + self.tape_lp[1] * tape_sat;
            }

            // 4. 60 Hz / 180 Hz Mains Transformer Hum & Analog Noise Floor (strictly gated on active sound)
            if hum_amt > 0.0005 && activity_gate > 1e-5 {
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
            if crackle_amt > 0.0005 && (activity_gate > 1e-5 || self.crackle_lp[0].abs() > 1e-6 || self.crackle_lp[1].abs() > 1e-6) {
                let rv = self.rng.next_f32();
                let thresh = 1.0 - crackle_amt * 0.0035 * activity_gate;
                let pop = if activity_gate > 1e-5 && rv > thresh { self.rng.bipolar() * crackle_amt * 0.035 * activity_gate } else { 0.0 };
                self.crackle_lp[0] = (self.crackle_lp[0] * 0.82 + pop * 0.18) * (if activity_gate > 1e-5 { 1.0 } else { 0.92 });
                self.crackle_lp[1] = (self.crackle_lp[1] * 0.82 + pop * 0.16) * (if activity_gate > 1e-5 { 1.0 } else { 0.92 });
                if self.crackle_lp[0].abs() < 1e-6 { self.crackle_lp[0] = 0.0; }
                if self.crackle_lp[1].abs() < 1e-6 { self.crackle_lp[1] = 0.0; }
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
